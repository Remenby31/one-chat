import {
  useLocalRuntime,
} from '@assistant-ui/react'
import type { ChatModelRunOptions } from '@assistant-ui/react'
import { useMemo, useEffect, useState } from 'react'
import type { ModelConfig } from '@/types/model'
import type { ApiKey } from '@/types/apiKey'
import type { MCPServer, MCPTool } from '@/types/mcp'
import { mcpManager } from '@/lib/mcpManager'

/**
 * Enhanced runtime that integrates MCP tools with the AI model
 *
 * This hook wraps the base model runtime and adds:
 * - Automatic MCP tool discovery from active servers
 * - Tool injection into API requests
 * - Tool call detection and execution
 * - Multi-turn conversations with tool results
 */
export function useMCPRuntime(
  modelConfig: ModelConfig | null,
  mcpServers: MCPServer[]
) {
  // Track available MCP tools from all active servers
  const [mcpTools, setMcpTools] = useState<Record<string, MCPTool[]>>({})

  // Fetch tools from all active MCP servers
  useEffect(() => {
    const activeServers = mcpServers.filter(
      s => s.enabled && s.status === 'RUNNING'
    )

    if (activeServers.length === 0) {
      setMcpTools({})
      return
    }

    console.log('[useMCPRuntime] Fetching tools from active servers:', activeServers.map(s => s.name))

    Promise.allSettled(
      activeServers.map(async (server) => {
        try {
          const tools = await mcpManager.getServerTools(server.id)
          console.log(`[useMCPRuntime] Got ${tools.length} tools from ${server.name}`)
          return { serverId: server.id, serverName: server.name, tools }
        } catch (error) {
          console.error(`[useMCPRuntime] Failed to get tools from ${server.name}:`, error)
          return { serverId: server.id, serverName: server.name, tools: [] }
        }
      })
    ).then(results => {
      const toolsMap: Record<string, MCPTool[]> = {}
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          toolsMap[result.value.serverId] = result.value.tools
        }
      })
      console.log('[useMCPRuntime] MCP tools loaded:', Object.keys(toolsMap).length, 'servers')
      setMcpTools(toolsMap)
    })
  }, [mcpServers])

  // Convert MCP tools to OpenAI function calling format
  const openaiTools = useMemo(() => {
    const tools: any[] = []

    Object.entries(mcpTools).forEach(([serverId, serverTools]) => {
      serverTools.forEach(tool => {
        // Prefix tool name with server ID to avoid collisions
        const toolName = `${serverId}__${tool.name}`
        tools.push({
          type: 'function',
          function: {
            name: toolName,
            description: tool.description || `Tool ${tool.name} from server ${serverId}`,
            parameters: tool.inputSchema
          }
        })
      })
    })

    if (tools.length > 0) {
      console.log('[useMCPRuntime] Converted', tools.length, 'MCP tools to OpenAI format')
    }

    return tools
  }, [mcpTools])

  // Create the enhanced adapter with tool support
  const adapter = useMemo(() => {
    return {
      async *run({ messages, abortSignal }: ChatModelRunOptions) {
        console.log('[useMCPRuntime] run called', {
          modelConfig,
          messageCount: messages.length,
          toolsAvailable: openaiTools.length
        })

        // If no model is configured, return a helpful message
        if (!modelConfig) {
          console.log('[useMCPRuntime] No model configured')
          yield {
            content: [{
              type: 'text' as const,
              text: 'Welcome to Jarvis! To get started, configure an AI model by clicking Settings in the sidebar.'
            }]
          }
          return
        }

        // Get the API key from storage
        let apiKeys: ApiKey[] = []
        if (window.electronAPI) {
          apiKeys = await window.electronAPI.readConfig('apiKeys.json') || []
        } else {
          apiKeys = JSON.parse(localStorage.getItem('apiKeys') || '[]')
        }
        const apiKey = apiKeys.find(k => k.id === modelConfig.apiKeyId)
        console.log('[useMCPRuntime] API key lookup', { apiKeyId: modelConfig.apiKeyId, found: !!apiKey })

        if (!apiKey) {
          console.log('[useMCPRuntime] API key not found')
          yield {
            content: [{
              type: 'text' as const,
              text: 'Endpoint not found. Please check your model configuration in Settings.'
            }]
          }
          return
        }

        // Resolve environment variables in API key
        let resolvedApiKey = apiKey.key
        if (window.electronAPI && apiKey.key.startsWith('$')) {
          resolvedApiKey = await window.electronAPI.resolveEnvVar(apiKey.key)
        }

        try {
          // Convert assistant-ui messages to OpenAI format
          let conversationMessages = messages.map((msg) => ({
            role: msg.role,
            content: msg.content.map((part: any) => {
              if (part.type === 'text') return part.text
              return ''
            }).join('\n')
          }))

          // Multi-turn loop to handle tool calls
          let turnCount = 0
          const MAX_TURNS = 10 // Prevent infinite loops

          // Accumulate all content parts (tool calls + text) to show in UI
          const allContentParts: any[] = []

          while (turnCount < MAX_TURNS) {
            turnCount++
            console.log(`[useMCPRuntime] Turn ${turnCount}, messages: ${conversationMessages.length}`)

            const requestBody: any = {
              model: modelConfig.model,
              messages: conversationMessages,
              stream: true,
            }

            // Add tools if available
            if (openaiTools.length > 0) {
              requestBody.tools = openaiTools
              console.log(`[useMCPRuntime] Including ${openaiTools.length} tools in request`)
            }

            const requestStartTime = performance.now()
            const response = await fetch(`${apiKey.baseURL}/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${resolvedApiKey}`,
              },
              body: JSON.stringify(requestBody),
              signal: abortSignal,
            })

            const responseReceivedTime = performance.now()
            const connectionTime = (responseReceivedTime - requestStartTime).toFixed(0)
            console.log(`[useMCPRuntime] Connection established in ${connectionTime}ms`)

            if (!response.ok) {
              const errorText = await response.text()
              throw new Error(`HTTP ${response.status}: ${errorText}`)
            }

            // Parse streaming response
            const reader = response.body?.getReader()
            const decoder = new TextDecoder()

            if (!reader) {
              throw new Error('No response body')
            }

            let buffer = ''
            let fullText = ''
            let toolCalls: any[] = []
            let chunkCount = 0
            let firstTokenTime: number | null = null

            // Track the text part if we have one for this turn
            let currentTextPart: any = null

            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              const chunkText = decoder.decode(value, { stream: true })
              buffer += chunkText
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim()
                  if (data === '[DONE]') break

                  try {
                    const parsed = JSON.parse(data)
                    const delta = parsed.choices?.[0]?.delta

                    // Handle text content
                    if (delta?.content) {
                      const now = performance.now()

                      if (firstTokenTime === null) {
                        firstTokenTime = now
                        const ttft = (now - requestStartTime).toFixed(0)
                        console.log(`[useMCPRuntime] First token after ${ttft}ms`)
                      }

                      fullText += delta.content
                      chunkCount++

                      // Create or update text part
                      if (!currentTextPart) {
                        currentTextPart = { type: 'text' as const, text: fullText }
                      } else {
                        currentTextPart.text = fullText
                      }

                      // Yield text updates with all accumulated content
                      yield {
                        content: [
                          ...allContentParts,
                          currentTextPart
                        ]
                      }
                    }

                    // Handle tool calls
                    if (delta?.tool_calls) {
                      for (const toolCallDelta of delta.tool_calls) {
                        const index = toolCallDelta.index

                        // Initialize tool call if needed
                        if (!toolCalls[index]) {
                          toolCalls[index] = {
                            id: toolCallDelta.id || '',
                            type: 'function',
                            function: {
                              name: toolCallDelta.function?.name || '',
                              arguments: ''
                            }
                          }
                        }

                        // Append to function arguments
                        if (toolCallDelta.function?.arguments) {
                          toolCalls[index].function.arguments += toolCallDelta.function.arguments
                        }
                      }
                    }
                  } catch (e) {
                    console.warn('[useMCPRuntime] Failed to parse SSE line:', line, e)
                  }
                }
              }
            }

            const totalTime = (performance.now() - requestStartTime).toFixed(0)
            console.log(`[useMCPRuntime] Turn ${turnCount} complete. Time: ${totalTime}ms, Text length: ${fullText.length}, Tool calls: ${toolCalls.length}`)

            // If we have text from this turn, add it to accumulated parts
            if (currentTextPart && fullText.length > 0) {
              allContentParts.push(currentTextPart)
              console.log(`[useMCPRuntime] Added text part to accumulated content. Total parts: ${allContentParts.length}`)
            }

            // If no tool calls, we're done
            if (toolCalls.length === 0) {
              console.log('[useMCPRuntime] No tool calls, conversation complete')
              console.log('[useMCPRuntime] Final conversation history:', conversationMessages.map(m => `${m.role}: ${m.content?.substring?.(0, 50) || '[tool call]'}...`))
              break
            }

            // Execute tool calls
            console.log(`[useMCPRuntime] Executing ${toolCalls.length} tool calls`)

            // Add assistant message with tool calls to conversation
            conversationMessages.push({
              role: 'assistant',
              content: fullText || '',
              tool_calls: toolCalls.map(tc => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.function.name,
                  arguments: tc.function.arguments
                }
              }))
            } as any)

            console.log(`[useMCPRuntime] Added assistant message with ${toolCalls.length} tool calls. Messages count: ${conversationMessages.length}`)

            // Execute each tool call sequentially (so we can yield progress)
            const toolResults = []
            for (const toolCall of toolCalls) {
              // Record start time before try block
              let startTime = performance.now()

              try {
                // Parse the tool name to extract server ID and tool name
                const [serverId, ...toolNameParts] = toolCall.function.name.split('__')
                const toolName = toolNameParts.join('__')

                console.log(`[useMCPRuntime] Calling tool: ${toolName} on server: ${serverId}`)

                // Parse arguments
                let args: any = {}
                try {
                  args = JSON.parse(toolCall.function.arguments)
                } catch (e) {
                  console.error('[useMCPRuntime] Failed to parse tool arguments:', e)
                  throw new Error('Invalid tool arguments')
                }

                // Create tool call part
                const toolCallPart = {
                  type: 'tool-call' as const,
                  toolCallId: toolCall.id,
                  toolName: toolCall.function.name,
                  args: args,
                  argsText: JSON.stringify(args, null, 2),
                  result: undefined,
                  startTime: startTime
                }

                // Add to accumulated parts and yield
                allContentParts.push(toolCallPart)
                yield {
                  content: [...allContentParts]
                }

                // Call the tool via MCP manager
                const result = await mcpManager.callTool(serverId, toolName, args)
                const endTime = performance.now()
                const duration = endTime - startTime
                console.log(`[useMCPRuntime] Tool ${toolName} returned in ${duration.toFixed(0)}ms:`, result)

                // Update the tool call part with result
                toolCallPart.result = result
                Object.assign(toolCallPart, {
                  endTime: endTime,
                  duration: duration
                })

                // Yield updated tool result
                yield {
                  content: [...allContentParts]
                }

                toolResults.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: typeof result === 'string' ? result : JSON.stringify(result)
                } as any)
              } catch (error) {
                const endTime = performance.now()
                const duration = endTime - startTime
                console.error('[useMCPRuntime] Tool call error:', error)
                const errorMessage = error instanceof Error ? error.message : 'Unknown error'

                // Create error tool call part
                const errorToolCallPart = {
                  type: 'tool-call' as const,
                  toolCallId: toolCall.id,
                  toolName: toolCall.function.name,
                  args: {},
                  argsText: '{}',
                  result: { error: errorMessage },
                  startTime: startTime,
                  endTime: endTime,
                  duration: duration
                }

                // Add to accumulated parts and yield
                allContentParts.push(errorToolCallPart)
                yield {
                  content: [...allContentParts]
                }

                toolResults.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({ error: errorMessage })
                } as any)
              }
            }

            // Add tool results to conversation
            conversationMessages.push(...toolResults as any)

            // Continue the loop to get the final response with tool results
            console.log(`[useMCPRuntime] Added ${toolResults.length} tool results. Messages count: ${conversationMessages.length}`)
            console.log('[useMCPRuntime] Tool calls complete, continuing conversation for next turn...')
          }

          if (turnCount >= MAX_TURNS) {
            console.warn('[useMCPRuntime] Max turns reached, stopping conversation')
            yield {
              content: [{
                type: 'text' as const,
                text: '\n\n_[Max conversation turns reached. Please start a new message if you need more assistance.]_'
              }]
            }
          }
        } catch (error) {
          console.error('[useMCPRuntime] Error in run', error)

          // Parse error message for user-friendly display
          let errorMessage = 'Unknown error'
          let errorDetails = ''

          if (error instanceof Error) {
            const errorMsg = error.message

            const httpMatch = errorMsg.match(/HTTP (\d+): (.+)/)
            if (httpMatch) {
              const statusCode = httpMatch[1]
              const jsonPart = httpMatch[2]

              try {
                const errorData = JSON.parse(jsonPart)
                if (errorData.error) {
                  const { message, type, code } = errorData.error

                  if (statusCode === '429') {
                    errorMessage = '⚠️ API Quota Exceeded'
                    errorDetails = `\n\n**Error:** ${message}\n\n**Type:** ${type}\n**Code:** ${code}\n\nPlease check your API plan and billing details.`
                  } else if (statusCode === '401') {
                    errorMessage = '🔒 Authentication Failed'
                    errorDetails = `\n\n**Error:** ${message}\n\n**Type:** ${type}\n**Code:** ${code}\n\nPlease verify your API key in Settings.`
                  } else if (statusCode === '404') {
                    errorMessage = '❌ Endpoint Not Found'
                    errorDetails = `\n\n**Error:** ${message}\n\n**Type:** ${type}\n**Code:** ${code}\n\nPlease check your model configuration in Settings.`
                  } else if (statusCode === '500' || statusCode === '502' || statusCode === '503') {
                    errorMessage = '🔧 Server Error'
                    errorDetails = `\n\n**Error:** ${message}\n\n**Type:** ${type}\n**Code:** ${code}\n**Status:** HTTP ${statusCode}\n\nThe API server is experiencing issues. Please try again later.`
                  } else {
                    errorMessage = `⚠️ API Error (HTTP ${statusCode})`
                    errorDetails = `\n\n**Error:** ${message}\n\n**Type:** ${type}\n**Code:** ${code}`
                  }
                }
              } catch {
                errorMessage = `⚠️ API Error (HTTP ${statusCode})`
                errorDetails = `\n\n**Error:** ${errorMsg}`
              }
            } else {
              errorMessage = '❌ Connection Error'
              errorDetails = `\n\n**Error:** ${errorMsg}\n\nPlease check your network connection and model configuration in Settings.`
            }
          }

          yield {
            content: [{
              type: 'text' as const,
              text: `${errorMessage}${errorDetails}`
            }]
          }
        }
      }
    }
  }, [modelConfig, openaiTools])

  // Create runtime with the adapter
  const runtime = useLocalRuntime(adapter)

  return runtime
}
