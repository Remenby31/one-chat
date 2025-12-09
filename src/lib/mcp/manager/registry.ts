/**
 * MCP Registry
 *
 * Central registry for managing multiple MCP servers.
 */

import type { MCPServer, MCPServerStatus } from '../core/types'
import type { StorageAdapter, ProcessAdapter, LoggerAdapter } from '../adapters/types'
import type { TokenManager } from '../auth/token-manager'
import type {
  MCPServerInstance,
  MCPServerCapabilities,
  MCPRegistryEvent,
  MCPRegistryListener,
  MCPRegistryOptions,
  MCPServerStartOptions,
  MCPServerStopOptions,
} from './types'
import { MCPStateMachine } from '../core/state-machine'
import { MCPError, MCPErrorCode } from '../core/errors'
import { ServerManager } from './server-manager'
import { STARTABLE_STATES } from '../core/state'

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<MCPRegistryOptions> = {
  configFilename: 'mcpServers.json',
  autoRecover: true,
  autoFetchCapabilities: true,
}

/**
 * MCP Server Registry
 *
 * Manages multiple MCP servers with:
 * - CRUD operations
 * - Lifecycle management (start/stop)
 * - State persistence
 * - Event subscription
 */
export class MCPRegistry {
  private instances = new Map<string, MCPServerInstance>()
  private listeners = new Set<MCPRegistryListener>()
  private options: Required<MCPRegistryOptions>
  private serverManager: ServerManager
  private configWatcherCleanup: (() => void) | null = null
  private initialized = false
  private storage: StorageAdapter
  private logger?: LoggerAdapter

  constructor(
    storage: StorageAdapter,
    processAdapter: ProcessAdapter,
    tokenManager: TokenManager | null,
    logger?: LoggerAdapter,
    options: MCPRegistryOptions = {}
  ) {
    this.storage = storage
    this.logger = logger
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.serverManager = new ServerManager({
      processAdapter,
      tokenManager: tokenManager ?? undefined,
      logger,
    })
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize the registry
   *
   * Loads servers from storage and sets up watchers.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    const log = this.logger?.child('registry')
    log?.info('Initializing MCP registry')

    // Load servers from storage
    const servers = await this.storage.readConfig<MCPServer[]>(this.options.configFilename)

    if (servers) {
      for (const server of servers) {
        this.createInstance(server)
      }
      log?.info(`Loaded ${servers.length} servers from storage`)
    }

    // Set up config file watcher
    this.configWatcherCleanup = this.storage.watchConfig(
      this.options.configFilename,
      (data) => this.handleConfigChange(data as MCPServer[])
    )

    // Auto-recover servers that were running
    if (this.options.autoRecover) {
      await this.recoverServers()
    }

    this.initialized = true
    log?.info('MCP registry initialized')
  }

  /**
   * Dispose the registry
   *
   * Stops all servers and cleans up resources.
   */
  async dispose(): Promise<void> {
    const log = this.logger?.child('registry')
    log?.info('Disposing MCP registry')

    // Stop all servers
    await this.stopAll()

    // Clean up config watcher
    if (this.configWatcherCleanup) {
      this.configWatcherCleanup()
      this.configWatcherCleanup = null
    }

    // Clear listeners
    this.listeners.clear()

    // Clear instances
    this.instances.clear()

    this.initialized = false
    log?.info('MCP registry disposed')
  }

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  /**
   * Add a new server
   */
  async add(server: MCPServer): Promise<void> {
    if (this.instances.has(server.id)) {
      throw new MCPError('Server already exists', MCPErrorCode.DUPLICATE_SERVER, {
        serverId: server.id,
      })
    }

    // Create instance
    this.createInstance(server)

    // Persist to storage
    await this.persistServers()

    // Emit event
    this.emit({ type: 'server_added', server })

    this.logger?.child('registry').info(`Added server: ${server.name}`)
  }

  /**
   * Update an existing server
   */
  async update(serverId: string, updates: Partial<MCPServer>): Promise<void> {
    const instance = this.instances.get(serverId)
    if (!instance) {
      throw new MCPError('Server not found', MCPErrorCode.SERVER_NOT_FOUND, { serverId })
    }

    // Stop server if running and transport changed
    if (updates.transport && instance.process) {
      await this.stop(serverId)
    }

    // Update config
    const updatedServer: MCPServer = {
      ...instance.config,
      ...updates,
      id: serverId, // Prevent ID change
    }
    instance.config = updatedServer

    // Persist to storage
    await this.persistServers()

    // Emit event
    this.emit({ type: 'server_updated', server: updatedServer, changes: updates })

    this.logger?.child('registry').info(`Updated server: ${updatedServer.name}`)
  }

  /**
   * Remove a server
   */
  async remove(serverId: string): Promise<void> {
    const instance = this.instances.get(serverId)
    if (!instance) {
      throw new MCPError('Server not found', MCPErrorCode.SERVER_NOT_FOUND, { serverId })
    }

    // Stop if running
    if (instance.process) {
      await this.stop(serverId, { force: true })
    }

    // Remove from map
    this.instances.delete(serverId)

    // Persist to storage
    await this.persistServers()

    // Emit event
    this.emit({ type: 'server_removed', serverId })

    this.logger?.child('registry').info(`Removed server: ${instance.config.name}`)
  }

  /**
   * Get a server instance
   */
  get(serverId: string): MCPServerInstance | undefined {
    return this.instances.get(serverId)
  }

  /**
   * Get all server instances
   */
  getAll(): MCPServerInstance[] {
    return Array.from(this.instances.values())
  }

  /**
   * Get all server configs
   */
  getConfigs(): MCPServer[] {
    return this.getAll().map((i) => i.config)
  }

  /**
   * Get running servers
   */
  getRunning(): MCPServerInstance[] {
    return this.getAll().filter((i) => i.stateMachine.getState() === 'RUNNING')
  }

  // ===========================================================================
  // Lifecycle Operations
  // ===========================================================================

  /**
   * Start a server
   */
  async start(serverId: string, options?: MCPServerStartOptions): Promise<void> {
    const instance = this.instances.get(serverId)
    if (!instance) {
      throw new MCPError('Server not found', MCPErrorCode.SERVER_NOT_FOUND, { serverId })
    }

    await this.serverManager.start(instance, options)

    // Emit event
    this.emit({ type: 'server_started', serverId })

    // Update persisted state
    await this.persistServers()

    // Fetch capabilities if enabled
    if (this.options.autoFetchCapabilities) {
      // Don't await - let it happen in background
      this.fetchCapabilities(serverId).catch(() => {})
    }
  }

  /**
   * Stop a server
   */
  async stop(serverId: string, options?: MCPServerStopOptions): Promise<void> {
    const instance = this.instances.get(serverId)
    if (!instance) {
      throw new MCPError('Server not found', MCPErrorCode.SERVER_NOT_FOUND, { serverId })
    }

    await this.serverManager.stop(instance, options)

    // Emit event
    this.emit({ type: 'server_stopped', serverId })

    // Update persisted state
    await this.persistServers()
  }

  /**
   * Restart a server
   */
  async restart(serverId: string): Promise<void> {
    const instance = this.instances.get(serverId)
    if (!instance) {
      throw new MCPError('Server not found', MCPErrorCode.SERVER_NOT_FOUND, { serverId })
    }

    await this.serverManager.restart(instance)

    // Emit events
    this.emit({ type: 'server_stopped', serverId })
    this.emit({ type: 'server_started', serverId })

    // Update persisted state
    await this.persistServers()
  }

  /**
   * Stop all servers
   */
  async stopAll(): Promise<void> {
    const running = this.getRunning()
    await Promise.all(running.map((i) => this.stop(i.config.id, { force: true })))
  }

  // ===========================================================================
  // Capabilities
  // ===========================================================================

  /**
   * Fetch server capabilities
   */
  async fetchCapabilities(serverId: string): Promise<MCPServerCapabilities | null> {
    const instance = this.instances.get(serverId)
    if (!instance || !instance.process) {
      return null
    }

    // This would need to use the ElectronMCPClient or similar
    // For now, return null - actual implementation depends on process adapter
    return null
  }

  /**
   * Get cached capabilities
   */
  getCapabilities(serverId: string): MCPServerCapabilities | null {
    return this.instances.get(serverId)?.capabilities ?? null
  }

  // ===========================================================================
  // Subscription
  // ===========================================================================

  /**
   * Subscribe to registry events
   */
  subscribe(listener: MCPRegistryListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Get server state
   */
  getState(serverId: string): MCPServerStatus | undefined {
    return this.instances.get(serverId)?.stateMachine.getState()
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private createInstance(server: MCPServer): MCPServerInstance {
    const stateMachine = new MCPStateMachine(server.id, {
      initialState: server.status || 'IDLE',
    })

    // Subscribe to state changes
    stateMachine.subscribe((newState, _previousState, metadata) => {
      // Update server config status
      const instance = this.instances.get(server.id)
      if (instance) {
        instance.config.status = newState
      }

      // Emit event
      this.emit({
        type: 'server_state_changed',
        serverId: server.id,
        state: newState,
        metadata,
      })
    })

    const instance: MCPServerInstance = {
      config: server,
      stateMachine,
      process: null,
    }

    this.instances.set(server.id, instance)
    return instance
  }

  private async persistServers(): Promise<void> {
    const servers = this.getConfigs()
    await this.storage.writeConfig(this.options.configFilename, servers)
  }

  private handleConfigChange(_servers: MCPServer[]): void {
    // This is called when config file changes externally
    // For now, just log - could implement sync logic
    this.logger?.child('registry').debug('Config file changed externally')
  }

  private async recoverServers(): Promise<void> {
    const log = this.logger?.child('registry')
    const instances = Array.from(this.instances.values())

    for (const instance of instances) {
      const state = instance.stateMachine.getState()

      // If server was RUNNING, try to restart it
      if (state === 'RUNNING') {
        log?.info(`Recovering server: ${instance.config.name}`)

        // Reset state first
        instance.stateMachine.forceState('IDLE')

        // Try to start
        if (instance.config.enabled) {
          try {
            await this.start(instance.config.id)
          } catch (error) {
            log?.error(`Failed to recover server ${instance.config.name}: ${error}`)
          }
        }
      } else if (!STARTABLE_STATES.includes(state)) {
        // Reset stuck states
        log?.debug(`Resetting stuck server ${instance.config.name} from state ${state}`)
        instance.stateMachine.forceState('IDLE')
      }
    }
  }

  private emit(event: MCPRegistryEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        this.logger?.child('registry').error(`Listener error: ${error}`)
      }
    })
  }
}
