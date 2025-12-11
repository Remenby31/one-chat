/**
 * MCP SDK Manager
 *
 * Uses the official @modelcontextprotocol/sdk for all MCP operations.
 * Handles both stdio (local) and HTTP (remote) transports.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { BrowserWindow } from 'electron';
import { ElectronOAuthProvider } from './mcp-oauth.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';

// Types for MCP server configuration
export interface MCPServerConfig {
  id: string;
  name: string;

  // Stdio transport (local servers)
  command?: string;
  args?: string[];
  env?: Record<string, string>;

  // HTTP transport (remote servers)
  httpUrl?: string;

  // OAuth configuration
  oauthConfig?: {
    clientId?: string;
    clientSecret?: string;
    authUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: number;
  };
}

export interface MCPClientInstance {
  client: Client;
  transport: Transport;
  config: MCPServerConfig;
  state: 'connecting' | 'connected' | 'error' | 'disconnected';
  error?: string;
}

/**
 * MCP SDK Manager - manages all MCP client connections
 */
export class MCPSDKManager {
  private clients = new Map<string, MCPClientInstance>();
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  /**
   * Start an MCP server connection
   */
  async startServer(config: MCPServerConfig): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if already connected
      if (this.clients.has(config.id)) {
        const existing = this.clients.get(config.id)!;
        if (existing.state === 'connected') {
          return { success: true };
        }
        // Clean up existing failed connection
        await this.stopServer(config.id);
      }


      let transport: Transport;

      if (config.command) {
        // Stdio transport for local servers
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env: {
            ...process.env,
            ...config.env,
          } as Record<string, string>,
        });
      } else if (config.httpUrl) {
        // HTTP transport for remote servers
        // Dynamic import to avoid issues if not needed
        const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');

        // Create OAuth provider if OAuth is configured
        let authProvider: OAuthClientProvider | undefined;
        if (config.oauthConfig) {
          authProvider = new ElectronOAuthProvider(
            config.id,
            config.oauthConfig,
            async (tokens) => {
              // Callback to persist updated tokens
              config.oauthConfig!.accessToken = tokens.access_token;
              config.oauthConfig!.refreshToken = tokens.refresh_token;
              if (tokens.expires_in) {
                config.oauthConfig!.tokenExpiresAt = Date.now() + tokens.expires_in * 1000;
              }
              config.oauthConfig!.tokenIssuedAt = Date.now();

              // Notify renderer to persist updated tokens
              if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('mcp:tokens-updated', {
                  serverId: config.id,
                  oauthConfig: config.oauthConfig
                });
              }
            }
          );
        }

        transport = new StreamableHTTPClientTransport(
          new URL(config.httpUrl),
          authProvider ? { authProvider } : undefined
        );
      } else {
        return { success: false, error: 'No transport configured (need command or httpUrl)' };
      }

      // Create client
      const client = new Client(
        { name: 'jarvis', version: '1.0.0' },
        { capabilities: {} }
      );

      // Store instance before connecting (to track state)
      const instance: MCPClientInstance = {
        client,
        transport,
        config,
        state: 'connecting',
      };
      this.clients.set(config.id, instance);

      // Notify renderer
      this.notifyStateChange(config.id, 'connecting');

      // Connect with timeout
      const connectPromise = client.connect(transport);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout (30s)')), 30000);
      });

      await Promise.race([connectPromise, timeoutPromise]);

      // Update state
      instance.state = 'connected';

      // Notify renderer
      this.notifyStateChange(config.id, 'connected');

      return { success: true };
    } catch (error) {
      console.error(`[MCP-SDK] Failed to start server ${config.id}:`, error);

      // Update or set error state
      const instance = this.clients.get(config.id);
      if (instance) {
        instance.state = 'error';
        instance.error = error instanceof Error ? error.message : String(error);
        // Notify renderer
        this.notifyStateChange(config.id, 'error', instance.error);
      }

      // Notify renderer of exit
      this.notifyServerExited(config.id, 1);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Stop an MCP server connection
   */
  async stopServer(serverId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const instance = this.clients.get(serverId);
      if (!instance) {
        return { success: true }; // Already stopped
      }


      // Close the client connection
      await instance.client.close();

      // Remove from map
      this.clients.delete(serverId);

      // Notify renderer
      this.notifyStateChange(serverId, 'disconnected');
      this.notifyServerExited(serverId, 0);

      return { success: true };
    } catch (error) {
      console.error(`[MCP-SDK] Failed to stop server ${serverId}:`, error);

      // Force remove from map
      this.clients.delete(serverId);
      this.notifyServerExited(serverId, 1);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * List tools from an MCP server
   */
  async listTools(serverId: string): Promise<{ success: boolean; tools?: any[]; error?: string }> {
    try {
      const instance = this.clients.get(serverId);
      if (!instance || instance.state !== 'connected') {
        return { success: false, error: 'Server not connected' };
      }

      const result = await instance.client.listTools();
      return { success: true, tools: result.tools };
    } catch (error) {
      console.error(`[MCP-SDK] Failed to list tools for ${serverId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Call a tool on an MCP server
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    try {
      const instance = this.clients.get(serverId);
      if (!instance || instance.state !== 'connected') {
        return { success: false, error: 'Server not connected' };
      }

      const result = await instance.client.callTool({
        name: toolName,
        arguments: args,
      });

      return { success: true, result };
    } catch (error) {
      console.error(`[MCP-SDK] Failed to call tool ${toolName} on ${serverId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * List prompts from an MCP server
   */
  async listPrompts(serverId: string): Promise<{ success: boolean; prompts?: any[]; error?: string }> {
    try {
      const instance = this.clients.get(serverId);
      if (!instance || instance.state !== 'connected') {
        return { success: false, error: 'Server not connected' };
      }

      const result = await instance.client.listPrompts();
      return { success: true, prompts: result.prompts };
    } catch (error) {
      console.error(`[MCP-SDK] Failed to list prompts for ${serverId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get a prompt from an MCP server
   */
  async getPrompt(
    serverId: string,
    promptName: string,
    args?: Record<string, string>
  ): Promise<{ success: boolean; messages?: any[]; error?: string }> {
    try {
      const instance = this.clients.get(serverId);
      if (!instance || instance.state !== 'connected') {
        return { success: false, error: 'Server not connected' };
      }

      const result = await instance.client.getPrompt({
        name: promptName,
        arguments: args,
      });

      return { success: true, messages: result.messages };
    } catch (error) {
      console.error(`[MCP-SDK] Failed to get prompt ${promptName} from ${serverId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * List resources from an MCP server
   */
  async listResources(serverId: string): Promise<{ success: boolean; resources?: any[]; error?: string }> {
    try {
      const instance = this.clients.get(serverId);
      if (!instance || instance.state !== 'connected') {
        return { success: false, error: 'Server not connected' };
      }

      const result = await instance.client.listResources();
      return { success: true, resources: result.resources };
    } catch (error) {
      console.error(`[MCP-SDK] Failed to list resources for ${serverId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Read resource content from an MCP server
   */
  async readResource(serverId: string, uri: string): Promise<{
    success: boolean;
    contents?: any[];
    error?: string
  }> {
    try {
      const instance = this.clients.get(serverId);
      if (!instance || instance.state !== 'connected') {
        return { success: false, error: 'Server not connected' };
      }

      const result = await instance.client.readResource({ uri });
      return { success: true, contents: result.contents };
    } catch (error) {
      console.error(`[MCP-SDK] Failed to read resource ${uri} from ${serverId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get server capabilities (tools, prompts, resources)
   */
  async getCapabilities(serverId: string): Promise<{
    success: boolean;
    capabilities?: { tools: any[]; prompts: any[]; resources: any[] };
    error?: string
  }> {
    try {
      const instance = this.clients.get(serverId);
      if (!instance || instance.state !== 'connected') {
        return { success: false, error: 'Server not connected' };
      }

      // Fetch all capabilities in parallel
      const [toolsResult, promptsResult, resourcesResult] = await Promise.allSettled([
        instance.client.listTools(),
        instance.client.listPrompts(),
        instance.client.listResources(),
      ]);

      const capabilities = {
        tools: toolsResult.status === 'fulfilled' ? toolsResult.value.tools : [],
        prompts: promptsResult.status === 'fulfilled' ? promptsResult.value.prompts : [],
        resources: resourcesResult.status === 'fulfilled' ? resourcesResult.value.resources : [],
      };

      return { success: true, capabilities };
    } catch (error) {
      console.error(`[MCP-SDK] Failed to get capabilities for ${serverId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check if a server is connected
   */
  isConnected(serverId: string): boolean {
    const instance = this.clients.get(serverId);
    return instance?.state === 'connected';
  }

  /**
   * Get server state
   */
  getServerState(serverId: string): MCPClientInstance['state'] | 'disconnected' {
    const instance = this.clients.get(serverId);
    return instance?.state || 'disconnected';
  }

  /**
   * Get all server states (for state synchronization)
   */
  getAllServerStates(): Record<string, { state: MCPClientInstance['state'] | 'disconnected'; error?: string }> {
    const states: Record<string, { state: MCPClientInstance['state'] | 'disconnected'; error?: string }> = {};
    for (const [id, instance] of this.clients.entries()) {
      states[id] = { state: instance.state, error: instance.error };
    }
    return states;
  }

  /**
   * Stop all servers
   */
  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.clients.keys()).map(id => this.stopServer(id));
    await Promise.allSettled(stopPromises);
  }

  /**
   * Notify renderer that a server exited
   */
  private notifyServerExited(serverId: string, exitCode: number): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('mcp:server-exited', { serverId, exitCode });
    }
  }

  /**
   * Notify renderer of state change
   */
  private notifyStateChange(serverId: string, state: 'connecting' | 'connected' | 'error' | 'disconnected', error?: string): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('mcp:state-changed', { serverId, state, error });
    }
  }
}

// Singleton instance
export const mcpSDKManager = new MCPSDKManager();
