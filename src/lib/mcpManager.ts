/**
 * MCP Manager - Simplified client-side coordinator
 *
 * All MCP operations are delegated to Electron's main process
 * which uses the official @modelcontextprotocol/sdk.
 */

import type {
  MCPServer,
  MCPServerState,
  MCPTool,
  MCPServerCapabilities,
  MCPTestResult,
} from '@/types/mcp';

type StatusCallback = (serverId: string, state: MCPServerState, error?: string) => void;

export class MCPManager {
  private statusCallbacks = new Set<StatusCallback>();
  private serverStates = new Map<string, { state: MCPServerState; error?: string }>();

  constructor() {
    // Listen for server exit events from Electron
    if (window.electronAPI?.onMcpServerExited) {
      window.electronAPI.onMcpServerExited(({ serverId, exitCode }) => {
        const newState: MCPServerState = exitCode === 0 || exitCode === null ? 'idle' : 'error';
        const error = exitCode !== 0 && exitCode !== null ? `Process exited with code ${exitCode}` : undefined;

        this.updateState(serverId, newState, error);
      });
    }
  }

  /**
   * Start an MCP server
   */
  async startServer(server: MCPServer): Promise<void> {
    if (!window.electronAPI?.mcpStartServer) {
      throw new Error('MCP functionality requires Electron');
    }

    // Skip if already connected
    const currentState = this.serverStates.get(server.id);
    if (currentState?.state === 'connected' || currentState?.state === 'connecting') {
      return;
    }

    // Update state to connecting
    this.updateState(server.id, 'connecting');

    try {
      const result = await window.electronAPI.mcpStartServer(server);

      if (result.success) {
        this.updateState(server.id, 'connected');
      } else if (result.authRequired) {
        this.updateState(server.id, 'auth_required', result.error);
        throw new Error(result.error || 'Authentication required');
      } else {
        this.updateState(server.id, 'error', result.error);
        throw new Error(result.error || 'Failed to start server');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (this.serverStates.get(server.id)?.state !== 'auth_required') {
        this.updateState(server.id, 'error', errorMessage);
      }
      throw error;
    }
  }

  /**
   * Stop an MCP server
   */
  async stopServer(serverId: string): Promise<void> {
    if (!window.electronAPI?.mcpStopServer) {
      throw new Error('MCP functionality requires Electron');
    }

    const result = await window.electronAPI.mcpStopServer(serverId);

    if (!result.success && result.error) {
      console.warn(`[MCPManager] Stop server warning: ${result.error}`);
    }

    this.updateState(serverId, 'idle');
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
   * Test connection to an MCP server
   */
  async testConnection(server: MCPServer): Promise<MCPTestResult> {
    if (!window.electronAPI?.mcpStartServer) {
      return {
        success: false,
        message: 'MCP functionality requires Electron'
      };
    }

    const wasConnected = this.serverStates.get(server.id)?.state === 'connected';
    let shouldStop = false;

    try {
      if (!wasConnected) {
        await this.startServer(server);
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
   * Get current state of a server
   */
  getServerState(serverId: string): MCPServerState {
    return this.serverStates.get(serverId)?.state || 'idle';
  }

  /**
   * Get server error message
   */
  getServerError(serverId: string): string | undefined {
    return this.serverStates.get(serverId)?.error;
  }

  /**
   * Check if a server is connected
   */
  isConnected(serverId: string): boolean {
    return this.serverStates.get(serverId)?.state === 'connected';
  }

  /**
   * Register a callback for status changes
   */
  onStatusChange(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    return () => {
      this.statusCallbacks.delete(callback);
    };
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

  /**
   * Update server state and notify listeners
   */
  private updateState(serverId: string, state: MCPServerState, error?: string): void {
    this.serverStates.set(serverId, { state, error });

    this.statusCallbacks.forEach(callback => {
      try {
        callback(serverId, state, error);
      } catch (e) {
        console.error('[MCPManager] Status callback error:', e);
      }
    });
  }
}

// Singleton instance
export const mcpManager = new MCPManager();
