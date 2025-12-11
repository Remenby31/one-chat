/**
 * MCP Manager - Simplified client-side coordinator
 *
 * All MCP operations are delegated to Electron's main process
 * which uses the official @modelcontextprotocol/sdk.
 *
 * State management: Server state is managed entirely by the SDK
 * and synchronized to React via IPC events (mcp:state-changed).
 */

import type {
  MCPServer,
  MCPTool,
  MCPServerCapabilities,
  MCPTestResult,
} from '@/types/mcp';

export class MCPManager {
  // No local state - all state comes from SDK via IPC events

  /**
   * Start an MCP server
   * State transitions are handled by SDK and sent via IPC events
   */
  async startServer(server: MCPServer): Promise<void> {
    if (!window.electronAPI?.mcpStartServer) {
      throw new Error('MCP functionality requires Electron');
    }

    // Skip if already connected/connecting (based on passed state)
    if (server.state === 'connected' || server.state === 'connecting') {
      return;
    }

    const result = await window.electronAPI.mcpStartServer(server);

    if (!result.success) {
      if (result.authRequired) {
        throw new Error(result.error || 'Authentication required');
      } else {
        throw new Error(result.error || 'Failed to start server');
      }
    }
  }

  /**
   * Stop an MCP server
   * State transitions are handled by SDK and sent via IPC events
   */
  async stopServer(serverId: string): Promise<void> {
    if (!window.electronAPI?.mcpStopServer) {
      throw new Error('MCP functionality requires Electron');
    }

    const result = await window.electronAPI.mcpStopServer(serverId);

    if (!result.success && result.error) {
      console.warn(`[MCPManager] Stop server warning: ${result.error}`);
    }
  }

  /**
   * Restart an MCP server
   */
  async restartServer(server: MCPServer): Promise<void> {
    await this.stopServer(server.id);
    await new Promise(resolve => setTimeout(resolve, 500));
    await this.startServer(server);
  }

  /**
   * Get available tools from an MCP server
   */
  async getServerTools(serverId: string): Promise<MCPTool[]> {
    if (!window.electronAPI?.mcpListTools) {
      throw new Error('MCP functionality requires Electron');
    }

    const result = await window.electronAPI.mcpListTools(serverId);

    if (result.success && result.tools) {
      return result.tools;
    }

    throw new Error(result.error || 'Failed to get server tools');
  }

  /**
   * Get server capabilities (tools, resources, prompts)
   */
  async getServerCapabilities(serverId: string): Promise<MCPServerCapabilities> {
    if (!window.electronAPI?.mcpGetCapabilities) {
      throw new Error('MCP functionality requires Electron');
    }

    const result = await window.electronAPI.mcpGetCapabilities(serverId);

    if (result.success && result.capabilities) {
      return result.capabilities;
    }

    throw new Error(result.error || 'Failed to get server capabilities');
  }

  /**
   * Call a tool on an MCP server
   */
  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (!window.electronAPI?.mcpCallTool) {
      throw new Error('MCP functionality requires Electron');
    }

    const result = await window.electronAPI.mcpCallTool(serverId, toolName, args);

    if (result.success) {
      return result.result;
    }

    throw new Error(result.error || 'Tool call failed');
  }

  /**
   * List prompts from an MCP server
   */
  async listPromptsFromServer(serverId: string): Promise<Array<{ name: string; description?: string }>> {
    if (!window.electronAPI?.mcpListPrompts) {
      throw new Error('MCP functionality requires Electron');
    }

    const result = await window.electronAPI.mcpListPrompts(serverId);

    if (result.success && result.prompts) {
      return result.prompts;
    }

    throw new Error(result.error || 'Failed to list prompts');
  }

  /**
   * Get prompt content from an MCP server
   */
  async getPromptContent(serverId: string, promptName: string, args?: Record<string, string>): Promise<string> {
    if (!window.electronAPI?.mcpGetPrompt) {
      throw new Error('MCP functionality requires Electron');
    }

    const result = await window.electronAPI.mcpGetPrompt(serverId, promptName, args);

    if (result.success && result.messages) {
      return result.messages
        .map((msg: { content: string | { text?: string } }) => {
          if (typeof msg.content === 'string') {
            return msg.content;
          }
          if (msg.content?.text) {
            return msg.content.text;
          }
          return JSON.stringify(msg.content);
        })
        .join('\n\n');
    }

    throw new Error(result.error || 'Failed to get prompt content');
  }

  /**
   * Read resource content from an MCP server
   */
  async readResource(serverId: string, uri: string): Promise<any[]> {
    if (!window.electronAPI?.mcpReadResource) {
      throw new Error('MCP functionality requires Electron');
    }

    const result = await window.electronAPI.mcpReadResource(serverId, uri);

    if (result.success && result.contents) {
      return result.contents;
    }

    throw new Error(result.error || 'Failed to read resource');
  }

  /**
   * Get the actual server state from SDK (source of truth)
   */
  async getActualServerState(serverId: string): Promise<string> {
    if (!window.electronAPI?.mcpGetServerState) {
      return 'disconnected';
    }

    const result = await window.electronAPI.mcpGetServerState(serverId);
    return result.success ? result.state : 'disconnected';
  }

  /**
   * Test connection to an MCP server
   * Uses SDK state as source of truth, not React state
   */
  async testConnection(server: MCPServer): Promise<MCPTestResult> {
    if (!window.electronAPI?.mcpStartServer) {
      return {
        success: false,
        message: 'MCP functionality requires Electron'
      };
    }

    // Check actual SDK state (source of truth), not React state
    const actualState = await this.getActualServerState(server.id);
    const wasActuallyConnected = actualState === 'connected';
    let shouldStop = false;

    try {
      if (!wasActuallyConnected) {
        // Server not actually connected in SDK, need to start it
        await this.startServer({ ...server, state: actualState as MCPServer['state'] });
        shouldStop = true;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const capabilities = await this.getServerCapabilities(server.id);

      const toolsCount = capabilities.tools?.length || 0;
      const resourcesCount = capabilities.resources?.length || 0;
      const promptsCount = capabilities.prompts?.length || 0;

      const features: string[] = [];
      if (toolsCount > 0) features.push(`${toolsCount} tool${toolsCount > 1 ? 's' : ''}`);
      if (resourcesCount > 0) features.push(`${resourcesCount} resource${resourcesCount > 1 ? 's' : ''}`);
      if (promptsCount > 0) features.push(`${promptsCount} prompt${promptsCount > 1 ? 's' : ''}`);

      const message = features.length > 0
        ? `Connection successful! Found ${features.join(', ')}`
        : 'Connection successful! Server is responding';

      return {
        success: true,
        message,
        capabilities
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Connection failed: ${errorMessage}`
      };
    } finally {
      if (shouldStop) {
        try {
          await this.stopServer(server.id);
        } catch (e) {
          console.error('[MCPManager] Failed to stop server after test:', e);
        }
      }
    }
  }

  /**
   * Start all enabled servers
   */
  async startEnabledServers(servers: MCPServer[]): Promise<void> {
    const enabledServers = servers.filter(s => s.enabled);
    await Promise.allSettled(
      enabledServers.map(server => this.startServer(server))
    );
  }

  /**
   * Stop all servers
   */
  async stopAllServers(servers: MCPServer[]): Promise<void> {
    await Promise.allSettled(
      servers.map(server => this.stopServer(server.id))
    );
  }

  /**
   * Start OAuth flow for a server
   */
  async startOAuthFlow(serverId: string, oauthConfig: MCPServer['oauthConfig']): Promise<void> {
    if (!window.electronAPI?.mcpStartOAuth) {
      throw new Error('OAuth functionality requires Electron');
    }

    const result = await window.electronAPI.mcpStartOAuth(serverId, oauthConfig);

    if (!result.success) {
      throw new Error(result.error || 'Failed to start OAuth flow');
    }
  }
}

// Singleton instance
export const mcpManager = new MCPManager();
