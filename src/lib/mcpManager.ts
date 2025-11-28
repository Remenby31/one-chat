// MCP Manager - Client-side coordinator for MCP servers
// The actual process management happens in Electron's main process
// This manager communicates via IPC

import type { MCPServer, MCPTool, MCPServerCapabilities, MCPTestResult } from '@/types/mcp'
import type { MCPServerState, MCPStateMetadata } from '@/types/mcpState'
import { ensureValidToken } from '@/lib/mcpAuth'
import { stateMachineManager } from '@/lib/mcpStateMachine'

export class MCPManager {
  // Legacy compatibility - now delegates to state machines
  private statusCallbacks: Set<(serverId: string, status: MCPServerState, metadata: MCPStateMetadata) => void> = new Set()

  constructor() {
    // Listen for process exit events from Electron
    if (window.electronAPI?.onMcpServerExited) {
      window.electronAPI.onMcpServerExited(async ({ serverId, exitCode }) => {
        const machine = stateMachineManager.getMachine(serverId)
        const currentState = machine.getState()

        // Determine target state based on exit code
        const targetState = (exitCode === 0 || exitCode === null) ? 'STOPPED' : 'RUNTIME_ERROR'

        // If already in the target state, just notify (ensures persistence)
        if (currentState === targetState) {
          this.notifyStatusChange(serverId, currentState)
          return
        }

        try {
          if (exitCode === 0 || exitCode === null) {
            // Clean exit - aim for STOPPED state
            switch (currentState) {
              case 'RUNNING':
              case 'STARTING':
                // Go through STOPPING first
                await machine.transition('STOP')
                await machine.transition('STOPPED', {
                  timestamp: Date.now()
                })
                break

              case 'STOPPING':
                // Already stopping, just complete it
                await machine.transition('STOPPED', {
                  timestamp: Date.now()
                })
                break

              case 'IDLE':
              case 'STOPPED':
                // Already stopped, just notify
                break

              default:
                // Any other state (AUTH, ERROR, etc.) → go to IDLE
                const transitioned = await machine.transition('STOP')
                if (!transitioned) {
                  machine.forceSetState('IDLE', { timestamp: Date.now() })
                }
            }
          } else {
            // Non-zero exit code = crash
            await machine.transition('CRASHED', {
              timestamp: Date.now(),
              errorMessage: `Process exited with code ${exitCode}`,
              userMessage: 'Server crashed unexpectedly'
            })
          }

          this.notifyStatusChange(serverId, machine.getState())
        } catch (error) {
          console.error(`[MCPManager] ❌ Transition failed:`, error)
          // Force to target state if transition fails
          machine.forceSetState(targetState === 'STOPPED' ? 'IDLE' : 'RUNTIME_ERROR', {
            timestamp: Date.now()
          })
          this.notifyStatusChange(serverId, machine.getState())
        }
      })
    }
  }

  /**
   * Recover servers stuck in transient states after app restart
   * Call this after loading servers from storage
   */
  async recoverStuckServers(servers: MCPServer[]): Promise<MCPServer[]> {
    const recoveredServers = [...servers]

    servers.forEach((server, index) => {
      const machine = stateMachineManager.getMachine(server.id, server.status)
      const currentState = machine.getState()

      // Reset ALL servers to appropriate state after app restart
      // Electron processes don't survive restarts, so RUNNING servers need to be reset
      let shouldRecover = false
      let recoveryState: MCPServerState = 'IDLE'

      if (machine.isTransitioning()) {
        // Stuck in transient state
        shouldRecover = true
        console.warn(`[MCPManager] Recovering stuck server: ${server.name}, state: ${currentState}`)

        if (currentState === 'AUTHENTICATING' || currentState === 'TOKEN_REFRESHING') {
          recoveryState = 'AUTH_REQUIRED'
        }
      } else if (currentState === 'RUNNING') {
        // RUNNING servers must be reset because Electron processes were killed
        shouldRecover = true
        recoveryState = 'IDLE'
      }

      if (shouldRecover) {
        // Force transition to recovery state
        machine.forceSetState(recoveryState, {
          timestamp: Date.now()
        })

        // Update server object
        recoveredServers[index] = {
          ...server,
          status: recoveryState
        }

        this.notifyStatusChange(server.id, recoveryState)
      }
    })

    return recoveredServers
  }

  /**
   * Start an MCP server
   * The actual process is spawned in Electron's main process
   */
  async startServer(server: MCPServer): Promise<void> {
    if (!window.electronAPI?.mcpStartServer) {
      throw new Error('MCP functionality requires Electron')
    }

    const machine = stateMachineManager.getMachine(server.id, server.status)

    // Skip if already running or starting (handles React StrictMode double-mount in dev)
    const currentState = machine.getState()
    if (currentState === 'RUNNING' || currentState === 'STARTING' || currentState === 'VALIDATING') {
      return
    }

    try {
      // Begin start sequence
      await machine.transition('START')

      // VALIDATING state - check authentication
      if (server.requiresAuth && server.authType === 'oauth' && !server.oauthConfig?.accessToken) {
        await machine.transition('AUTH_FAILURE', {
          errorMessage: 'Authentication required. Please authenticate this server first.',
          userMessage: 'Click the Authenticate button to authorize access.'
        })
        throw new Error('Authentication required. Please authenticate this server first.')
      }

      // If OAuth is required, ensure we have a valid token
      if (server.requiresAuth && server.authType === 'oauth') {
        try {
          server = await ensureValidToken(server)
          // Check if token was refreshed
          if (machine.getPreviousState() === 'TOKEN_REFRESHING') {
            await machine.transition('REFRESH_SUCCESS')
          }
        } catch (error) {
          console.error('[MCPManager] Failed to get valid OAuth token:', error)
          await machine.transition('REFRESH_FAILURE', {
            errorMessage: error instanceof Error ? error.message : 'Token refresh failed',
            userMessage: 'Your authentication has expired. Please re-authenticate.'
          })
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
      }

      // Transition to STARTING
      await machine.transition('STARTED')

      // Actually start the server process
      const result = await window.electronAPI.mcpStartServer(server)

      if (result.success) {
        await machine.transition('STARTED', {
          timestamp: Date.now()
        })
      } else {
        await machine.transition('START_FAILED', {
          errorMessage: result.error || 'Failed to start server',
          userMessage: 'Server failed to start. Check configuration and try again.'
        })
        throw new Error(result.error || 'Failed to start server')
      }
    } catch (error) {
      // If not already in error state, transition there
      if (!machine.isError()) {
        await machine.transition('START_FAILED', {
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorStack: error instanceof Error ? error.stack : undefined
        })
      }
      throw error
    } finally {
      // Update legacy callbacks
      this.notifyStatusChange(server.id, machine.getState())
    }
  }

  /**
   * Stop an MCP server
   */
  async stopServer(serverId: string): Promise<void> {
    if (!window.electronAPI?.mcpStopServer) {
      throw new Error('MCP functionality requires Electron')
    }

    const machine = stateMachineManager.getMachine(serverId)
    const currentState = machine.getState()

    try {
      // If already stopped/idle, no need to do anything
      if (currentState === 'IDLE' || currentState === 'STOPPED') {
        this.notifyStatusChange(serverId, currentState)
        return
      }

      // Begin stop sequence - transition to STOPPING
      const transitioned = await machine.transition('STOP')

      if (!transitioned) {
        console.warn(`[MCPManager] Failed to transition to STOP from ${currentState}`)
        // Force stop anyway by going to IDLE
        machine.forceSetState('IDLE', {
          timestamp: Date.now()
        })
        this.notifyStatusChange(serverId, machine.getState())
        return
      }

      // Only call backend if server might actually be running
      const targetState = machine.getState()
      const shouldCallBackend = targetState !== 'IDLE' && targetState !== 'STOPPED'

      if (shouldCallBackend) {
        const result = await window.electronAPI.mcpStopServer(serverId)

        if (!result.success && result.error && !result.error.includes('not running')) {
          // Only transition to error if it's a real error (not "already stopped")
          console.error(`[MCPManager] Backend failed to stop server:`, result.error)
          await machine.transition('CRASHED', {
            errorMessage: result.error,
            userMessage: 'Server may not have stopped properly'
          })
          throw new Error(result.error)
        }

        // Wait for exit event with timeout
        const exitEventReceived = await this.waitForStateChange(
          serverId,
          machine.getState(),
          5000 // 5 second timeout
        )

        if (!exitEventReceived) {
          console.warn(`[MCPManager] Timeout waiting for exit event, forcing STOPPED state`)
          await machine.transition('STOPPED', {
            timestamp: Date.now(),
            userMessage: 'Server stopped (timeout recovery)'
          })
        }
      }
    } catch (error) {
      console.error(`[MCPManager] stopServer error:`, error)
      if (!machine.isError()) {
        await machine.transition('CRASHED', {
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorStack: error instanceof Error ? error.stack : undefined
        })
      }
      throw error
    } finally {
      const finalState = machine.getState()
      this.notifyStatusChange(serverId, finalState)
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
   * List prompts from an MCP server
   */
  async listPromptsFromServer(serverId: string): Promise<Array<{ name: string; description?: string; arguments?: any[] }>> {
    if (!window.electronAPI?.mcpListPrompts) {
      throw new Error('MCP functionality requires Electron')
    }

    const result = await window.electronAPI.mcpListPrompts(serverId)

    if (result.success && result.prompts) {
      return result.prompts
    }

    throw new Error(result.error || 'Failed to list prompts')
  }

  /**
   * Get prompt content from an MCP server
   */
  async getPromptContent(serverId: string, promptName: string, args?: Record<string, any>): Promise<string> {
    if (!window.electronAPI?.mcpGetPrompt) {
      throw new Error('MCP functionality requires Electron')
    }

    const result = await window.electronAPI.mcpGetPrompt(serverId, promptName, args)

    if (result.success && result.messages) {
      // Combine all messages into a single string
      return result.messages
        .map((msg: any) => {
          if (typeof msg.content === 'string') {
            return msg.content
          }
          if (msg.content?.text) {
            return msg.content.text
          }
          return JSON.stringify(msg.content)
        })
        .join('\n\n')
    }

    throw new Error(result.error || 'Failed to get prompt content')
  }

  /**
   * Get list of connected servers
   */
  getConnectedServers(): Array<{ id: string; name?: string }> {
    // Get all server IDs that have machines (means they've been initialized)
    const machines = stateMachineManager.getAllMachines()
    return machines
      .filter(({ machine }) => machine.isRunning())
      .map(({ serverId }) => ({
        id: serverId,
        name: serverId
      }))
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

    const machine = stateMachineManager.getMachine(server.id, server.status)
    const wasRunning = machine.isRunning()
    let shouldStop = false

    try {
      // If server is not running, start it temporarily
      if (!wasRunning) {
        await this.startServer(server)
        shouldStop = true

        // Wait a bit for the server to fully initialize
        await new Promise(resolve => setTimeout(resolve, 2000))
      }

      // Try to get server capabilities
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
  getServerStatus(serverId: string): MCPServerState {
    const machine = stateMachineManager.getMachine(serverId, 'IDLE')
    return machine.getState()
  }

  /**
   * Get server state metadata
   */
  getServerMetadata(serverId: string): MCPStateMetadata {
    const machine = stateMachineManager.getMachine(serverId, 'IDLE')
    return machine.getMetadata()
  }

  /**
   * Register a callback for status changes
   */
  onStatusChange(callback: (serverId: string, status: MCPServerState, metadata: MCPStateMetadata) => void): () => void {
    this.statusCallbacks.add(callback)
    // Return unsubscribe function
    return () => {
      this.statusCallbacks.delete(callback)
    }
  }

  /**
   * Wait for a state change with timeout
   * Returns true if state changed, false on timeout
   */
  private waitForStateChange(
    serverId: string,
    currentState: MCPServerState,
    timeoutMs: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const machine = stateMachineManager.getMachine(serverId)
      let timeoutId: NodeJS.Timeout

      const unsubscribe = machine.onStateChange(() => {
        if (machine.getState() !== currentState) {
          clearTimeout(timeoutId)
          unsubscribe()
          resolve(true)
        }
      })

      timeoutId = setTimeout(() => {
        unsubscribe()
        resolve(false)
      }, timeoutMs)
    })
  }

  /**
   * Notify listeners of status change (internal helper)
   */
  private notifyStatusChange(serverId: string, status: MCPServerState): void {
    const machine = stateMachineManager.getMachine(serverId)
    const metadata = machine.getMetadata()

    this.statusCallbacks.forEach(callback => {
      try {
        callback(serverId, status, metadata)
      } catch (error) {
        console.error('[MCPManager] Status callback error:', error)
      }
    })
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
    const runningServers = servers.filter(s => {
      const machine = stateMachineManager.getMachine(s.id, s.status)
      return machine.isRunning() || machine.getState() === 'STARTING'
    })

    // Stop servers in parallel
    await Promise.allSettled(
      runningServers.map(server => this.stopServer(server.id))
    )
  }
}

// Singleton instance
export const mcpManager = new MCPManager()
