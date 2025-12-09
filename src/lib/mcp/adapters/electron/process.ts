/**
 * Electron Process Adapter
 *
 * Uses Electron IPC to spawn and manage MCP server processes.
 */

import type { ProcessAdapter, MCPProcess } from '../types'
import type { MCPStdioTransport, JSONRPCMessage } from '../../core/types'
import { MCPProcessError, MCPErrorCode } from '../../core/errors'

/**
 * Electron API interface for MCP process management
 */
interface ElectronMCPAPI {
  mcpStartServer: (server: {
    id: string
    command: string
    args: string[]
    env?: Record<string, string>
  }) => Promise<{ success: boolean; error?: string }>

  mcpStopServer: (serverId: string) => Promise<{ success: boolean; error?: string }>

  mcpCallTool: (
    serverId: string,
    toolName: string,
    args: unknown
  ) => Promise<{ success: boolean; result?: unknown; error?: string }>

  mcpListTools: (serverId: string) => Promise<{
    success: boolean
    tools?: Array<{ name: string; description?: string; inputSchema: unknown }>
    error?: string
  }>

  mcpGetCapabilities: (serverId: string) => Promise<{
    success: boolean
    capabilities?: {
      tools: unknown[]
      resources: unknown[]
      prompts: unknown[]
    }
    error?: string
  }>

  mcpListPrompts: (serverId: string) => Promise<{
    success: boolean
    prompts?: unknown[]
    error?: string
  }>

  mcpGetPrompt: (
    serverId: string,
    promptName: string,
    args?: unknown
  ) => Promise<{
    success: boolean
    messages?: unknown[]
    error?: string
  }>

  mcpGetLogs: (serverId: string) => Promise<{
    success: boolean
    logs?: Array<{
      id: string
      type: string
      message: string
      timestamp: number
      data?: unknown
    }>
    error?: string
  }>

  mcpClearLogs: (serverId: string) => Promise<{ success: boolean; error?: string }>

  onMcpServerExited: (callback: (data: { serverId: string; exitCode: number }) => void) => () => void

  onMcpLog: (
    callback: (log: {
      id: string
      serverId: string
      type: string
      message: string
      timestamp: number
      data?: unknown
    }) => void
  ) => () => void
}

/**
 * Get the Electron API from the window object
 */
function getElectronAPI(): ElectronMCPAPI {
  const api = (window as unknown as { electronAPI?: ElectronMCPAPI }).electronAPI
  if (!api) {
    throw new Error('ElectronProcessAdapter requires Electron environment with electronAPI exposed')
  }
  return api
}

/**
 * Electron MCP Process implementation
 */
class ElectronMCPProcess implements MCPProcess {
  private _isRunning = true
  private exitCallbacks = new Set<(code: number | null) => void>()
  private messageCallbacks = new Set<(message: JSONRPCMessage) => void>()
  private stderrCallbacks = new Set<(data: string) => void>()
  private cleanupFunctions: Array<() => void> = []
  readonly id: string

  constructor(
    id: string,
    api: ElectronMCPAPI
  ) {
    this.id = id
    // Listen for exit events
    const exitCleanup = api.onMcpServerExited((data) => {
      if (data.serverId === this.id) {
        this._isRunning = false
        this.exitCallbacks.forEach((cb) => cb(data.exitCode))
      }
    })
    this.cleanupFunctions.push(exitCleanup)

    // Listen for log events (stderr comes through here)
    const logCleanup = api.onMcpLog((log) => {
      if (log.serverId === this.id) {
        if (log.type === 'stderr') {
          this.stderrCallbacks.forEach((cb) => cb(log.message))
        } else if (log.type === 'jsonrpc' && log.data) {
          this.messageCallbacks.forEach((cb) => cb(log.data as JSONRPCMessage))
        }
      }
    })
    this.cleanupFunctions.push(logCleanup)
  }

  get isRunning(): boolean {
    return this._isRunning
  }

  async send(_message: JSONRPCMessage): Promise<void> {
    // In Electron, we use specific IPC calls for each method type
    // The main process handles the actual JSON-RPC communication
    throw new Error(
      'Direct send not supported in Electron adapter. Use mcpCallTool, mcpListTools, etc.'
    )
  }

  onMessage(callback: (message: JSONRPCMessage) => void): () => void {
    this.messageCallbacks.add(callback)
    return () => this.messageCallbacks.delete(callback)
  }

  onStderr(callback: (data: string) => void): () => void {
    this.stderrCallbacks.add(callback)
    return () => this.stderrCallbacks.delete(callback)
  }

  onExit(callback: (code: number | null) => void): () => void {
    this.exitCallbacks.add(callback)
    return () => this.exitCallbacks.delete(callback)
  }

  async kill(): Promise<void> {
    const api = getElectronAPI()
    const result = await api.mcpStopServer(this.id)

    if (!result.success) {
      throw new MCPProcessError(result.error || 'Failed to stop server', MCPErrorCode.PROCESS_KILL_FAILED, {
        serverId: this.id,
      })
    }

    this._isRunning = false

    // Cleanup listeners
    this.cleanupFunctions.forEach((cleanup) => cleanup())
    this.cleanupFunctions = []
  }
}

/**
 * Process adapter using Electron IPC
 */
export class ElectronProcessAdapter implements ProcessAdapter {
  private processes = new Map<string, ElectronMCPProcess>()

  /**
   * Spawn a new MCP server process
   */
  async spawn(id: string, config: MCPStdioTransport): Promise<MCPProcess> {
    const api = getElectronAPI()

    // Kill existing process with same ID if any
    if (this.processes.has(id)) {
      await this.kill(id)
    }

    const result = await api.mcpStartServer({
      id,
      command: config.command,
      args: config.args,
      env: config.env,
    })

    if (!result.success) {
      throw new MCPProcessError(result.error || 'Failed to start server', MCPErrorCode.PROCESS_START_FAILED, {
        serverId: id,
      })
    }

    const process = new ElectronMCPProcess(id, api)
    this.processes.set(id, process)

    // Remove from map when process exits
    process.onExit(() => {
      this.processes.delete(id)
    })

    return process
  }

  /**
   * Get an existing process by ID
   */
  get(id: string): MCPProcess | undefined {
    return this.processes.get(id)
  }

  /**
   * Kill a process by ID
   */
  async kill(id: string): Promise<void> {
    const process = this.processes.get(id)
    if (process) {
      await process.kill()
      this.processes.delete(id)
    }
  }

  /**
   * Kill all processes
   */
  async killAll(): Promise<void> {
    const killPromises = Array.from(this.processes.keys()).map((id) => this.kill(id))
    await Promise.all(killPromises)
  }
}

/**
 * Helper class for making MCP calls via Electron IPC
 *
 * This provides a higher-level API for tool calls, prompts, etc.
 */
export class ElectronMCPClient {
  private serverId: string

  constructor(serverId: string) {
    this.serverId = serverId
  }

  /**
   * List available tools
   */
  async listTools() {
    const api = getElectronAPI()
    const result = await api.mcpListTools(this.serverId)

    if (!result.success) {
      throw new MCPProcessError(result.error || 'Failed to list tools', MCPErrorCode.JSONRPC_ERROR, {
        serverId: this.serverId,
      })
    }

    return result.tools || []
  }

  /**
   * Call a tool
   */
  async callTool(name: string, args: unknown) {
    const api = getElectronAPI()
    const result = await api.mcpCallTool(this.serverId, name, args)

    if (!result.success) {
      throw new MCPProcessError(result.error || 'Tool call failed', MCPErrorCode.TOOL_CALL_FAILED, {
        serverId: this.serverId,
      })
    }

    return result.result
  }

  /**
   * Get server capabilities
   */
  async getCapabilities() {
    const api = getElectronAPI()
    const result = await api.mcpGetCapabilities(this.serverId)

    if (!result.success) {
      throw new MCPProcessError(result.error || 'Failed to get capabilities', MCPErrorCode.JSONRPC_ERROR, {
        serverId: this.serverId,
      })
    }

    return result.capabilities
  }

  /**
   * List prompts
   */
  async listPrompts() {
    const api = getElectronAPI()
    const result = await api.mcpListPrompts(this.serverId)

    if (!result.success) {
      throw new MCPProcessError(result.error || 'Failed to list prompts', MCPErrorCode.JSONRPC_ERROR, {
        serverId: this.serverId,
      })
    }

    return result.prompts || []
  }

  /**
   * Get a prompt
   */
  async getPrompt(name: string, args?: unknown) {
    const api = getElectronAPI()
    const result = await api.mcpGetPrompt(this.serverId, name, args)

    if (!result.success) {
      throw new MCPProcessError(result.error || 'Failed to get prompt', MCPErrorCode.PROMPT_GET_FAILED, {
        serverId: this.serverId,
      })
    }

    return result.messages || []
  }

  /**
   * Get server logs
   */
  async getLogs() {
    const api = getElectronAPI()
    const result = await api.mcpGetLogs(this.serverId)

    if (!result.success) {
      throw new MCPProcessError(result.error || 'Failed to get logs', MCPErrorCode.JSONRPC_ERROR, {
        serverId: this.serverId,
      })
    }

    return result.logs || []
  }

  /**
   * Clear server logs
   */
  async clearLogs() {
    const api = getElectronAPI()
    const result = await api.mcpClearLogs(this.serverId)

    if (!result.success) {
      throw new MCPProcessError(result.error || 'Failed to clear logs', MCPErrorCode.JSONRPC_ERROR, {
        serverId: this.serverId,
      })
    }
  }
}
