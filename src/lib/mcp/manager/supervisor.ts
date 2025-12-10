/**
 * Server Supervisor
 *
 * Monitors MCP servers and provides:
 * - Automatic restart after crash
 * - Periodic health checks
 * - Connection recovery
 */

import type { MCPServer } from '../core/types'
import type { LoggerAdapter } from '../adapters/types'

/**
 * Supervisor options
 */
export interface SupervisorOptions {
  /** Enable automatic restart after crash (default: true) */
  autoRestart?: boolean

  /** Maximum restart attempts before giving up (default: 3) */
  maxRestartAttempts?: number

  /** Delay between restart attempts in ms (default: 5000) */
  restartDelay?: number

  /** Backoff multiplier for restart delays (default: 2) */
  restartBackoffMultiplier?: number

  /** Maximum restart delay in ms (default: 60000) */
  maxRestartDelay?: number

  /** Enable periodic health checks (default: true) */
  healthCheckEnabled?: boolean

  /** Health check interval in ms (default: 30000) */
  healthCheckInterval?: number

  /** Health check timeout in ms (default: 10000) */
  healthCheckTimeout?: number

  /** Logger */
  logger?: LoggerAdapter
}

/**
 * Server supervision state
 */
interface SupervisedServer {
  serverId: string
  restartAttempts: number
  lastCrashTime: number | null
  restartTimeout: ReturnType<typeof setTimeout> | null
  healthCheckTimeout: ReturnType<typeof setTimeout> | null
  isHealthy: boolean
}

/**
 * Supervisor event types
 */
export type SupervisorEvent =
  | { type: 'restart_scheduled'; serverId: string; delay: number; attempt: number }
  | { type: 'restart_attempted'; serverId: string; attempt: number }
  | { type: 'restart_succeeded'; serverId: string }
  | { type: 'restart_failed'; serverId: string; error: string; willRetry: boolean }
  | { type: 'restart_abandoned'; serverId: string; reason: string }
  | { type: 'health_check_started'; serverId: string }
  | { type: 'health_check_passed'; serverId: string }
  | { type: 'health_check_failed'; serverId: string; error: string }

export type SupervisorEventListener = (event: SupervisorEvent) => void

/**
 * Restart callback - called when supervisor wants to restart a server
 */
export type RestartCallback = (serverId: string) => Promise<void>

/**
 * Health check callback - called to check server health
 */
export type HealthCheckCallback = (serverId: string) => Promise<boolean>

/**
 * Default supervisor options
 */
const DEFAULT_OPTIONS: Required<Omit<SupervisorOptions, 'logger'>> = {
  autoRestart: true,
  maxRestartAttempts: 3,
  restartDelay: 5000,
  restartBackoffMultiplier: 2,
  maxRestartDelay: 60000,
  healthCheckEnabled: true,
  healthCheckInterval: 30000,
  healthCheckTimeout: 10000,
}

/**
 * Server Supervisor
 *
 * Provides automatic crash recovery and health monitoring for MCP servers.
 */
export class ServerSupervisor {
  private options: Required<Omit<SupervisorOptions, 'logger'>>
  private logger?: LoggerAdapter
  private servers = new Map<string, SupervisedServer>()
  private listeners = new Set<SupervisorEventListener>()
  private restartCallback: RestartCallback | null = null
  private healthCheckCallback: HealthCheckCallback | null = null
  private globalHealthCheckInterval: ReturnType<typeof setInterval> | null = null

  constructor(options: SupervisorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.logger = options.logger?.child('supervisor')
  }

  /**
   * Set the restart callback
   */
  setRestartCallback(callback: RestartCallback): void {
    this.restartCallback = callback
  }

  /**
   * Set the health check callback
   */
  setHealthCheckCallback(callback: HealthCheckCallback): void {
    this.healthCheckCallback = callback
  }

  /**
   * Start supervising a server
   */
  supervise(server: MCPServer): void {
    if (this.servers.has(server.id)) {
      return
    }

    this.servers.set(server.id, {
      serverId: server.id,
      restartAttempts: 0,
      lastCrashTime: null,
      restartTimeout: null,
      healthCheckTimeout: null,
      isHealthy: true,
    })

    this.logger?.debug(`Started supervising server: ${server.name}`)
  }

  /**
   * Stop supervising a server
   */
  unsupervise(serverId: string): void {
    const state = this.servers.get(serverId)
    if (!state) return

    // Clear any pending timeouts
    if (state.restartTimeout) {
      clearTimeout(state.restartTimeout)
    }
    if (state.healthCheckTimeout) {
      clearTimeout(state.healthCheckTimeout)
    }

    this.servers.delete(serverId)
    this.logger?.debug(`Stopped supervising server: ${serverId}`)
  }

  /**
   * Notify supervisor that a server crashed
   */
  async onServerCrashed(serverId: string, exitCode: number | null): Promise<void> {
    const state = this.servers.get(serverId)
    if (!state) return

    state.lastCrashTime = Date.now()
    state.isHealthy = false

    this.logger?.warn(`Server crashed: ${serverId} (exit code: ${exitCode})`)

    if (!this.options.autoRestart) {
      this.emit({ type: 'restart_abandoned', serverId, reason: 'Auto-restart disabled' })
      return
    }

    if (state.restartAttempts >= this.options.maxRestartAttempts) {
      this.emit({
        type: 'restart_abandoned',
        serverId,
        reason: `Max restart attempts (${this.options.maxRestartAttempts}) reached`,
      })
      return
    }

    // Schedule restart with backoff
    await this.scheduleRestart(serverId)
  }

  /**
   * Notify supervisor that a server started successfully
   */
  onServerStarted(serverId: string): void {
    const state = this.servers.get(serverId)
    if (!state) return

    // Reset restart attempts on successful start
    state.restartAttempts = 0
    state.isHealthy = true

    this.logger?.info(`Server started successfully: ${serverId}`)
  }

  /**
   * Notify supervisor that a server stopped (intentionally)
   */
  onServerStopped(serverId: string): void {
    const state = this.servers.get(serverId)
    if (!state) return

    // Cancel any pending restart
    if (state.restartTimeout) {
      clearTimeout(state.restartTimeout)
      state.restartTimeout = null
    }

    // Reset state
    state.restartAttempts = 0
    state.isHealthy = false
  }

  /**
   * Schedule a server restart with exponential backoff
   */
  private async scheduleRestart(serverId: string): Promise<void> {
    const state = this.servers.get(serverId)
    if (!state || !this.restartCallback) return

    // Cancel existing restart if any
    if (state.restartTimeout) {
      clearTimeout(state.restartTimeout)
    }

    // Calculate delay with exponential backoff
    const baseDelay = this.options.restartDelay
    const multiplier = Math.pow(this.options.restartBackoffMultiplier, state.restartAttempts)
    const delay = Math.min(baseDelay * multiplier, this.options.maxRestartDelay)

    state.restartAttempts++

    this.emit({
      type: 'restart_scheduled',
      serverId,
      delay,
      attempt: state.restartAttempts,
    })

    this.logger?.info(
      `Scheduling restart for ${serverId} in ${delay}ms (attempt ${state.restartAttempts}/${this.options.maxRestartAttempts})`
    )

    state.restartTimeout = setTimeout(async () => {
      state.restartTimeout = null
      await this.performRestart(serverId)
    }, delay)
  }

  /**
   * Perform server restart
   */
  private async performRestart(serverId: string): Promise<void> {
    const state = this.servers.get(serverId)
    if (!state || !this.restartCallback) return

    this.emit({ type: 'restart_attempted', serverId, attempt: state.restartAttempts })

    try {
      await this.restartCallback(serverId)
      this.emit({ type: 'restart_succeeded', serverId })
      // onServerStarted will be called by the registry
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const willRetry = state.restartAttempts < this.options.maxRestartAttempts

      this.emit({
        type: 'restart_failed',
        serverId,
        error: errorMessage,
        willRetry,
      })

      this.logger?.error(`Restart failed for ${serverId}: ${errorMessage}`)

      if (willRetry) {
        await this.scheduleRestart(serverId)
      } else {
        this.emit({
          type: 'restart_abandoned',
          serverId,
          reason: 'All restart attempts failed',
        })
      }
    }
  }

  /**
   * Start global health check loop
   */
  startHealthChecks(): void {
    if (!this.options.healthCheckEnabled || this.globalHealthCheckInterval) return

    this.globalHealthCheckInterval = setInterval(() => {
      this.performHealthChecks()
    }, this.options.healthCheckInterval)

    this.logger?.info('Started health check loop')
  }

  /**
   * Stop global health check loop
   */
  stopHealthChecks(): void {
    if (this.globalHealthCheckInterval) {
      clearInterval(this.globalHealthCheckInterval)
      this.globalHealthCheckInterval = null
      this.logger?.info('Stopped health check loop')
    }
  }

  /**
   * Perform health checks on all supervised servers
   */
  private async performHealthChecks(): Promise<void> {
    if (!this.healthCheckCallback) return

    for (const [serverId, state] of this.servers) {
      // Skip servers that are restarting
      if (state.restartTimeout) continue

      await this.checkServerHealth(serverId)
    }
  }

  /**
   * Check health of a specific server
   */
  async checkServerHealth(serverId: string): Promise<boolean> {
    const state = this.servers.get(serverId)
    if (!state || !this.healthCheckCallback) return false

    this.emit({ type: 'health_check_started', serverId })

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<boolean>((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), this.options.healthCheckTimeout)
      })

      // Race health check against timeout
      const isHealthy = await Promise.race([
        this.healthCheckCallback(serverId),
        timeoutPromise,
      ])

      state.isHealthy = isHealthy

      if (isHealthy) {
        this.emit({ type: 'health_check_passed', serverId })
      } else {
        this.emit({ type: 'health_check_failed', serverId, error: 'Server unhealthy' })
      }

      return isHealthy
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      state.isHealthy = false
      this.emit({ type: 'health_check_failed', serverId, error: errorMessage })
      this.logger?.warn(`Health check failed for ${serverId}: ${errorMessage}`)
      return false
    }
  }

  /**
   * Get supervision state for a server
   */
  getState(serverId: string): SupervisedServer | undefined {
    return this.servers.get(serverId)
  }

  /**
   * Check if a server is healthy
   */
  isHealthy(serverId: string): boolean {
    return this.servers.get(serverId)?.isHealthy ?? false
  }

  /**
   * Get all supervised server IDs
   */
  getSupervisedServers(): string[] {
    return Array.from(this.servers.keys())
  }

  /**
   * Subscribe to supervisor events
   */
  subscribe(listener: SupervisorEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Emit an event
   */
  private emit(event: SupervisorEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch {
        // Ignore listener errors
      }
    })
  }

  /**
   * Dispose supervisor
   */
  dispose(): void {
    this.stopHealthChecks()

    // Clear all server states
    for (const state of this.servers.values()) {
      if (state.restartTimeout) clearTimeout(state.restartTimeout)
      if (state.healthCheckTimeout) clearTimeout(state.healthCheckTimeout)
    }
    this.servers.clear()
    this.listeners.clear()

    this.logger?.info('Supervisor disposed')
  }
}
