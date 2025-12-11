/**
 * MCP Conventional Prompts Auto-Injection System
 *
 * This module implements automatic injection of conventional prompts from MCP servers
 * into conversation contexts. It supports all OpenAI message types (system, user, assistant, tool)
 * with multi-occurrence support and intelligent concatenation.
 */

import type { MCPServer } from '@/types/mcp';
import { mcpManager } from './mcpManager';

/**
 * Supported conventional prompt types based on OpenAI message roles
 */
export type ConventionalPromptType =
  | 'system_prompt'      // System instructions - concatenated if multiple
  | 'tool_instructions'  // Tool usage guide - concatenated to system
  | 'user_prompt'        // Initial user context - multiple allowed
  | 'assistant_prompt'   // Response prefill - multiple allowed
  | 'tool_call'          // Simulated function call
  | 'tool_result';       // Tool execution result

/**
 * Structure of a conventional prompt from an MCP server
 */
export interface ConventionalPrompt {
  serverId: string;
  serverName: string;
  promptName: string;
  type: ConventionalPromptType;
  content: string;
  toolCallId?: string;
}

/**
 * OpenAI-compatible message format
 */
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

/**
 * Determine the prompt type from its name
 */
export function detectPromptType(promptName: string): ConventionalPromptType | null {
  const normalized = promptName.toLowerCase().trim();

  // Exact matches
  if (normalized === 'system_prompt') return 'system_prompt';
  if (normalized === 'tool_instructions') return 'tool_instructions';
  if (normalized === 'user_prompt') return 'user_prompt';
  if (normalized === 'assistant_prompt') return 'assistant_prompt';

  // Prefix matches
  if (normalized.startsWith('tool_call')) return 'tool_call';
  if (normalized.startsWith('tool_result') || normalized.startsWith('tool_answer')) {
    return 'tool_result';
  }

  return null;
}

/**
 * Extract tool call ID from prompt name (e.g., "tool_call:example1" -> "example1")
 */
function extractToolCallId(promptName: string): string {
  const parts = promptName.split(':');
  return parts.length > 1 ? parts[1].trim() : 'default';
}

/**
 * Fetch all conventional prompts from all connected MCP servers
 */
export async function fetchAllConventionalPrompts(
  servers: MCPServer[]
): Promise<ConventionalPrompt[]> {
  const allPrompts: ConventionalPrompt[] = [];

  // Get all connected servers (state comes from SDK via IPC)
  const connectedServers = servers.filter(s => s.enabled && s.state === 'connected');

  for (const server of connectedServers) {
    try {
      // List prompts from this server
      const prompts = await mcpManager.listPromptsFromServer(server.id);

      for (const prompt of prompts) {
        const promptType = detectPromptType(prompt.name);

        if (promptType) {
          // Fetch the actual content
          const content = await mcpManager.getPromptContent(server.id, prompt.name);

          allPrompts.push({
            serverId: server.id,
            serverName: server.name || server.id,
            promptName: prompt.name,
            type: promptType,
            content,
            toolCallId: promptType === 'tool_call' || promptType === 'tool_result'
              ? extractToolCallId(prompt.name)
              : undefined,
          });
        }
      }
    } catch (error) {
      console.warn(`Failed to fetch prompts from server ${server.id}:`, error);
      // Continue with other servers
    }
  }

  return allPrompts;
}

/**
 * Build concatenated system message from multiple system prompts
 */
function buildSystemMessage(prompts: ConventionalPrompt[]): string {
  const systemParts: string[] = [];

  for (const prompt of prompts) {
    const header = `[System instructions from Server: ${prompt.serverName}]`;
    systemParts.push(`${header}\n${prompt.content}`);
  }

  return systemParts.join('\n\n---\n\n');
}

/**
 * Build injected messages array in correct OpenAI order
 */
export function buildInjectedMessages(prompts: ConventionalPrompt[]): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];

  // 1. Combine all system prompts and tool instructions
  const systemPrompts = prompts.filter(p => p.type === 'system_prompt');
  const toolInstructions = prompts.filter(p => p.type === 'tool_instructions');

  if (systemPrompts.length > 0 || toolInstructions.length > 0) {
    const allSystemPrompts = [...systemPrompts, ...toolInstructions];
    const systemContent = buildSystemMessage(allSystemPrompts);

    messages.push({
      role: 'system',
      content: systemContent,
    });
  }

  // 2. Add user prompts (preserve order)
  const userPrompts = prompts.filter(p => p.type === 'user_prompt');
  for (const prompt of userPrompts) {
    messages.push({
      role: 'user',
      content: prompt.content,
    });
  }

  // 3. Add tool call/result pairs (preserve order)
  const toolCalls = prompts.filter(p => p.type === 'tool_call');
  const toolResults = prompts.filter(p => p.type === 'tool_result');

  // Group by tool_call_id
  const toolCallIds = new Set([
    ...toolCalls.map(t => t.toolCallId!),
    ...toolResults.map(t => t.toolCallId!),
  ]);

  for (const toolCallId of toolCallIds) {
    const call = toolCalls.find(t => t.toolCallId === toolCallId);
    const result = toolResults.find(t => t.toolCallId === toolCallId);

    let toolCallAdded = false;

    if (call) {
      // Parse tool call content as JSON for structured format
      let toolCallData: { type?: string; tool_name?: string; arguments?: Record<string, unknown> } | null = null;
      try {
        toolCallData = JSON.parse(call.content);
      } catch (error) {
        console.error(`[mcpPromptInjection] Failed to parse tool_call ${toolCallId}, skipping:`, error);
        continue;
      }

      if (toolCallData && toolCallData.type === 'tool_call') {
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: toolCallId,
            type: 'function',
            function: {
              name: `${call.serverId}__${toolCallData.tool_name}`,
              arguments: JSON.stringify(toolCallData.arguments || {})
            }
          }]
        });
        toolCallAdded = true;
      } else {
        console.error(`[mcpPromptInjection] Invalid tool_call format for ${toolCallId}, skipping`);
        continue;
      }
    } else {
      console.error(`[mcpPromptInjection] Tool call missing for ID ${toolCallId}, skipping`);
      continue;
    }

    if (result && toolCallAdded) {
      messages.push({
        role: 'tool',
        content: result.content,
        tool_call_id: toolCallId,
        name: toolCallId,
      });
    } else if (result && !toolCallAdded) {
      console.error(`[mcpPromptInjection] Tool result exists but tool_calls not added for ${toolCallId}`);
    }
  }

  // 4. Add assistant prompts (preserve order)
  const assistantPrompts = prompts.filter(p => p.type === 'assistant_prompt');
  for (const prompt of assistantPrompts) {
    messages.push({
      role: 'assistant',
      content: prompt.content,
    });
  }

  return messages;
}

/**
 * Main function: Fetch and build all injected messages
 */
export async function getInjectedMessages(
  servers: MCPServer[]
): Promise<OpenAIMessage[]> {
  const prompts = await fetchAllConventionalPrompts(servers);
  const messages = buildInjectedMessages(prompts);
  return messages;
}
