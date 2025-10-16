// MCP Manager - Client-side coordinator for MCP servers
// The actual process management happens in Electron's main process
// This manager communicates via IPC

import type { MCPServer, MCPTool, MCPServerCapabilities, MCPTestResult } from '@/types/mcp'
import { ensureValidToken } from '@/lib/mcpAuth'

export class MCPManager {
  private serverStatuses: Map<string, MCPServer['status']> = new Map()
  private statusCallbacks: Set<(serverId: string, status: MCPServer['status']) => void> = new Set()

  /**
   * Start an MCP server
   * The actual process is spawned in Electron's main process
   */
  async startServer(server: MCPServer): Promise<void> {
    if (!window.electronAPI?.mcpStartServer) {
      throw new Error('MCP functionality requires Electron')
    }

    try {
      // Check if OAuth is required but not authenticated
      if (server.requiresAuth && server.authType === 'oauth' && !server.oauthConfig?.accessToken) {
        console.log('[MCPManager] OAuth authentication required for', server.name)
        this.updateStatus(server.id, 'needs_auth')
        throw new Error('Authentication required. Please authenticate this server first.')
      }

      this.updateStatus(server.id, 'starting')

      // If OAuth is required, ensure we have a valid token
      if (server.requiresAuth && server.authType === 'oauth') {
        console.log('[MCPManager] Ensuring valid OAuth token for', server.name)
        try {
          server = await ensureValidToken(server)
        } catch (error) {
          console.error('[MCPManager] Failed to get valid OAuth token:', error)
          this.updateStatus(server.id, 'needs_auth')
          throw new Error('OAuth token invalid or expired. Please re-authenticate.')
        }
      }

      // Inject OAuth token into environment if available
      if (server.oauthConfig?.accessToken) {
        server = {
          ...server,
          env: {
            ...server.env,
            OAUTH_ACCESS_TOKEN: server.oauthConfig.accessToken,
            // Some servers may use different env var names
            ACCESS_TOKEN: server.oauthConfig.accessToken,
            TOKEN: server.oauthConfig.accessToken
          }
        }
        console.log('[MCPManager] Injected OAuth token into environment')
      }

      // Inject simple token auth if available
      if (server.requiresAuth && server.authType === 'token' && server.authToken) {
        server = {
          ...server,
          env: {
            ...server.env,
            AUTH_TOKEN: server.authToken,
            API_TOKEN: server.authToken,
            TOKEN: server.authToken
          }
        }
        console.log('[MCPManager] Injected auth token into environment')
      }

      const result = await window.electronAPI.mcpStartServer(server)

      if (result.success) {
        this.updateStatus(server.id, 'running')
      } else {
        this.updateStatus(server.id, 'error')
        throw new Error(result.error || 'Failed to start server')
      }
    } catch (error) {
      this.updateStatus(server.id, 'error')
      throw error
    }
  }

  /**
   * Stop an MCP server
   */
  async stopServer(serverId: string): Promise<void> {
    if (!window.electronAPI?.mcpStopServer) {
      throw new Error('MCP functionality requires Electron')
    }

    try {
      this.updateStatus(serverId, 'stopped')
      const result = await window.electronAPI.mcpStopServer(serverId)

      if (!result.success) {
        throw new Error(result.error || 'Failed to stop server')
      }
    } catch (error) {
      this.updateStatus(serverId, 'error')
      throw error
    }
  }

  /**
   * Restart an MCP server
   */
  async restartServer(server: MCPServer): Promise<void> {
    await this.stopServer(server.id)
    // Wait a bit before restarting
    await new Promise(resolve => setTimeout(resolve, 1000))
    await this.startServer(server)
  }

  /**
   * Get available tools from an MCP server
   */
  async getServerTools(serverId: string): Promise<MCPTool[]> {
    if (!window.electronAPI?.mcpListTools) {
      throw new Error('MCP functionality requires Electron')
    }

    const result = await window.electronAPI.mcpListTools(serverId)

    if (result.success && result.tools) {
      return result.tools
    }

    throw new Error(result.error || 'Failed to get server tools')
  }

  /**
   * Get server capabilities (tools, resources, prompts)
   */
  async getServerCapabilities(serverId: string): Promise<MCPServerCapabilities> {
    if (!window.electronAPI?.mcpGetCapabilities) {
      throw new Error('MCP functionality requires Electron')
    }

    const result = await window.electronAPI.mcpGetCapabilities(serverId)

    if (result.success && result.capabilities) {
      return result.capabilities
    }

    throw new Error(result.error || 'Failed to get server capabilities')
  }

  /**
   * Call a tool on an MCP server
   */
  async callTool(serverId: string, toolName: string, args: Record<string, any>): Promise<any> {
    if (!window.electronAPI?.mcpCallTool) {
      throw new Error('MCP functionality requires Electron')
    }

    const result = await window.electronAPI.mcpCallTool(serverId, toolName, args)

    if (result.success) {
      return result.result
    }

    throw new Error(result.error || 'Tool call failed')
  }

  /**
   * Test connection to an MCP server
   * This will temporarily start the server if needed, test the connection, and stop it
   */
  async testConnection(server: MCPServer): Promise<MCPTestResult> {
    if (!window.electronAPI?.mcpStartServer) {
      return {
        success: false,
        message: 'MCP functionality requires Electron'
      }
    }

    const wasRunning = this.getServerStatus(server.id) === 'running'
    let shouldStop = false

    try {
      // If server is not running, start it temporarily
      if (!wasRunning) {
        console.log('[MCPManager] Starting server temporarily for test:', server.name)
        await this.startServer(server)
        shouldStop = true

        // Wait a bit for the server to fully initialize
        await new Promise(resolve => setTimeout(resolve, 2000))
      }

      // Try to get server capabilities
      console.log('[MCPManager] Fetching capabilities for:', server.name)
      const capabilities = await this.getServerCapabilities(server.id)

      // Count available features
      const toolsCount = capabilities.tools?.length || 0
      const resourcesCount = capabilities.resources?.length || 0
      const promptsCount = capabilities.prompts?.length || 0

      const features: string[] = []
      if (toolsCount > 0) features.push(`${toolsCount} tool${toolsCount > 1 ? 's' : ''}`)
      if (resourcesCount > 0) features.push(`${resourcesCount} resource${resourcesCount > 1 ? 's' : ''}`)
      if (promptsCount > 0) features.push(`${promptsCount} prompt${promptsCount > 1 ? 's' : ''}`)

      const message = features.length > 0
        ? `Connection successful! Found ${features.join(', ')}`
        : 'Connection successful! Server is responding'

      return {
        success: true,
        message,
        capabilities
      }
    } catch (error) {
      console.error('[MCPManager] Test connection failed:', error)

      let errorMessage = 'Connection failed'
      let suggestions: string[] = []

      if (error instanceof Error) {
        const errMsg = error.message

        // Provide helpful suggestions based on error type
        if (errMsg.includes('Command not found') || errMsg.includes('ENOENT')) {
          errorMessage = `Command not found: ${server.command}`
          suggestions = [
            'Node.js and npm must be installed and in your PATH',
            'Restart the application after installing Node.js',
            'On Windows, you may need to restart your computer',
            'Verify installation: open terminal and run "node --version" and "npm --version"',
            `Download Node.js from: https://nodejs.org/`
          ]
        } else if (errMsg.includes('Process failed to start')) {
          errorMessage = `Failed to start server: ${server.command} ${server.args.join(' ')}`
          suggestions = [
            'Make sure Node.js and npx are installed',
            'Check that the package name is correct',
            'Try running the command manually in terminal to see detailed errors',
            `Example: ${server.command} ${server.args.join(' ')}`
          ]
        } else if (errMsg.includes('OAuth token')) {
          errorMessage = errMsg
          suggestions = [
            'Click the "Authenticate" button to authorize access',
            'Your OAuth token may have expired'
          ]
        } else if (errMsg.includes('timeout')) {
          errorMessage = 'Server took too long to start'
          suggestions = [
            'The server may be slow to initialize',
            'Check your internet connection',
            'Try again in a few moments'
          ]
        } else {
          errorMessage += `: ${errMsg}`
        }
      }

      // Add suggestions to message if any
      if (suggestions.length > 0) {
        errorMessage += '\n\nSuggestions:\n' + suggestions.map(s => `• ${s}`).join('\n')
      }

      return {
        success: false,
        message: errorMessage
      }
    } finally {
      // Stop the server if we started it temporarily
      if (shouldStop) {
        console.log('[MCPManager] Stopping server after test:', server.name)
        try {
          await this.stopServer(server.id)
        } catch (error) {
          console.error('[MCPManager] Failed to stop server after test:', error)
        }
      }
    }
  }

  /**
   * Get current status of a server
   */
  getServerStatus(serverId: string): MCPServer['status'] {
    return this.serverStatuses.get(serverId) || 'idle'
  }

  /**
   * Register a callback for status changes
   */
  onStatusChange(callback: (serverId: string, status: MCPServer['status']) => void): () => void {
    this.statusCallbacks.add(callback)
    // Return unsubscribe function
    return () => {
      this.statusCallbacks.delete(callback)
    }
  }

  /**
   * Update server status and notify listeners
   */
  private updateStatus(serverId: string, status: MCPServer['status']): void {
    this.serverStatuses.set(serverId, status)
    this.statusCallbacks.forEach(callback => callback(serverId, status))
  }

  /**
   * Start all enabled servers
   */
  async startEnabledServers(servers: MCPServer[]): Promise<void> {
    const enabledServers = servers.filter(s => s.enabled)

    // Start servers in parallel
    await Promise.allSettled(
      enabledServers.map(server => this.startServer(server))
    )
  }

  /**
   * Stop all running servers
   */
  async stopAllServers(servers: MCPServer[]): Promise<void> {
    const runningServers = servers.filter(s =>
      this.getServerStatus(s.id) === 'running' || this.getServerStatus(s.id) === 'starting'
    )

    // Stop servers in parallel
    await Promise.allSettled(
      runningServers.map(server => this.stopServer(server.id))
    )
  }
}

// Singleton instance
export const mcpManager = new MCPManager()
