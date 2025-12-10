/**
 * Server Manager
 *
 * Manages the lifecycle of a single MCP server.
 */

import type { MCPServer, MCPStdioTransport, MCPHttpTransport } from '../core/types'
import type { ProcessAdapter, LoggerAdapter } from '../adapters/types'
import type { TokenManager } from '../auth/token-manager'
import type { MCPServerInstance, MCPServerStartOptions, MCPServerStopOptions } from './types'
import { MCPError, MCPProcessError, MCPErrorCode } from '../core/errors'
import { canStart, canStop } from '../core/state'
import { HttpProcessAdapter } from '../adapters/http'

/**
 * Server manager options
 */
export interface ServerManagerOptions {
  /** Process adapter for stdio transport */
  processAdapter: ProcessAdapter

  /** HTTP adapter for HTTP transport (optional, created internally if not provided) */
  httpAdapter?: HttpProcessAdapter

  /** Token manager (optional, for OAuth servers) */
  tokenManager?: TokenManager

  /** Logger */
  logger?: LoggerAdapter

  /** Graceful shutdown timeout (ms) */
  shutdownTimeout?: number
}

/**
 * Manages the lifecycle of a single MCP server
 */
export class ServerManager {
  private readonly processAdapter: ProcessAdapter
  private readonly httpAdapter: HttpProcessAdapter
  private readonly tokenManager?: TokenManager
  private readonly logger?: LoggerAdapter
  private readonly shutdownTimeout: number

  constructor(options: ServerManagerOptions) {
    this.processAdapter = options.processAdapter
    this.httpAdapter = options.httpAdapter ?? new HttpProcessAdapter()
    this.tokenManager = options.tokenManager
    this.logger = options.logger
    this.shutdownTimeout = options.shutdownTimeout ?? 5000
  }

  /**
   * Start a server
   */
  async start(
    instance: MCPServerInstance,
    options: MCPServerStartOptions = {}
  ): Promise<void> {
    const { config, stateMachine } = instance
    const log = this.logger?.child(`server:${config.id}`)

    // Check if can start
    const currentState = stateMachine.getState()
    if (!canStart(currentState) && !options.forceRestart) {
      throw new MCPError(
        `Cannot start server in state: ${currentState}`,
        MCPErrorCode.INVALID_TRANSITION,
        { serverId: config.id }
      )
    }

    // Force restart if needed
    if (options.forceRestart && instance.process) {
      log?.info('Force restarting server')
      await this.stop(instance, { force: true })
    }

    try {
      // Transition to validating
      if (!options.skipValidation) {
        await stateMachine.transition('VALIDATE')
        log?.debug('Validating server configuration')

        // Validate configuration
        this.validateConfig(config)
      }

      // Check authentication if needed
      if (config.auth?.type === 'oauth' && this.tokenManager) {
        if (this.tokenManager.needsAuth(config)) {
          await stateMachine.transition('AUTH_REQUIRED')
          throw new MCPError('Authentication required', MCPErrorCode.AUTH_REQUIRED, {
            serverId: config.id,
          })
        }

        // Ensure we have a valid token
        try {
          const token = await this.tokenManager.ensureValidToken(config)
          // Inject token into environment
          if (config.transport.type === 'stdio') {
            config.transport.env = {
              ...config.transport.env,
              OAUTH_ACCESS_TOKEN: token,
            }
          }
          log?.debug('OAuth token validated')
        } catch (error) {
          await stateMachine.transition('AUTH_REQUIRED')
          throw error
        }
      }

      // Validation passed, start the server
      await stateMachine.transition('VALID')
      await stateMachine.transition('START')
      log?.info('Starting server')

      if (config.transport.type === 'stdio') {
        // Spawn local process for stdio transport
        instance.process = await this.processAdapter.spawn(config.id, config.transport)

        // Set up exit handler
        instance.process.onExit((code) => {
          log?.info(`Server process exited with code ${code}`)
          instance.process = null

          if (code !== 0 && code !== null) {
            stateMachine.transition('CRASHED', { exitCode: code }).catch(() => {})
          } else {
            stateMachine.transition('STOPPED').catch(() => {})
          }
        })

        // Set up stderr handler for logging
        instance.process.onStderr((data) => {
          log?.debug(`stderr: ${data}`)
        })

        // Server started successfully
        await stateMachine.transition('STARTED', {
          connectedAt: Date.now(),
        })
        log?.info('Server started successfully')
      } else if (config.transport.type === 'http') {
        // Connect to remote HTTP server
        const httpTransport = config.transport as MCPHttpTransport

        // Get OAuth token if available
        let accessToken: string | undefined
        if (config.auth?.type === 'oauth' && config.auth.tokens?.accessToken) {
          accessToken = config.auth.tokens.accessToken
        } else if (config.auth?.type === 'token') {
          accessToken = config.auth.token
        }

        // Connect via HTTP adapter
        instance.process = await this.httpAdapter.connect(
          config.id,
          httpTransport,
          accessToken
        )

        // Set up exit handler
        instance.process.onExit((code) => {
          log?.info(`HTTP connection closed with code ${code}`)
          instance.process = null

          if (code !== 0 && code !== null) {
            stateMachine.transition('CRASHED', { exitCode: code }).catch(() => {})
          } else {
            stateMachine.transition('STOPPED').catch(() => {})
          }
        })

        // Set up stderr handler for logging
        instance.process.onStderr((data) => {
          log?.debug(`http error: ${data}`)
        })

        // Server connected successfully
        await stateMachine.transition('STARTED', {
          connectedAt: Date.now(),
        })
        log?.info('HTTP server connected successfully')
      } else {
        throw new MCPError(
          `Unknown transport type: ${(config.transport as { type: string }).type}`,
          MCPErrorCode.INVALID_TRANSPORT,
          { serverId: config.id }
        )
      }
    } catch (error) {
      // Handle startup failure
      const mcpError = MCPError.from(error, config.id)
      log?.error(`Failed to start server: ${mcpError.message}`)

      // Try to transition to error state
      try {
        await stateMachine.transition('ERROR', {
          error: mcpError.message,
          errorCode: mcpError.code,
        })
      } catch {
        // Force state if transition fails
        stateMachine.forceState('ERROR', {
          error: mcpError.message,
          errorCode: mcpError.code,
        })
      }

      throw mcpError
    }
  }

  /**
   * Stop a server
   */
  async stop(
    instance: MCPServerInstance,
    options: MCPServerStopOptions = {}
  ): Promise<void> {
    const { config, stateMachine, process } = instance
    const log = this.logger?.child(`server:${config.id}`)

    // Check if can stop
    const currentState = stateMachine.getState()
    if (!canStop(currentState) && !options.force) {
      // Server might already be stopped
      if (currentState === 'STOPPED' || currentState === 'IDLE') {
        log?.debug('Server already stopped')
        return
      }

      throw new MCPError(
        `Cannot stop server in state: ${currentState}`,
        MCPErrorCode.INVALID_TRANSITION,
        { serverId: config.id }
      )
    }

    try {
      await stateMachine.transition('STOP')
      log?.info('Stopping server')

      if (process) {
        // Create timeout promise
        const timeout = options.timeout ?? this.shutdownTimeout
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('Shutdown timeout')), timeout)
        })

        // Create kill promise
        const killPromise = process.kill()

        if (options.force) {
          // Force kill immediately
          await killPromise
        } else {
          // Wait for graceful shutdown or timeout
          try {
            await Promise.race([killPromise, timeoutPromise])
          } catch {
            // Timeout - force kill
            log?.warn('Graceful shutdown timed out, forcing kill')
            await process.kill()
          }
        }

        instance.process = null
      }

      await stateMachine.transition('STOPPED')
      log?.info('Server stopped')
    } catch (error) {
      const mcpError = MCPError.from(error, config.id)
      log?.error(`Failed to stop server: ${mcpError.message}`)

      // Force to stopped state
      stateMachine.forceState('STOPPED', {
        error: mcpError.message,
      })
      instance.process = null

      throw mcpError
    }
  }

  /**
   * Restart a server
   */
  async restart(instance: MCPServerInstance): Promise<void> {
    await this.stop(instance, { force: true })
    await this.start(instance)
  }

  /**
   * Validate server configuration
   */
  private validateConfig(config: MCPServer): void {
    if (!config.id) {
      throw new MCPProcessError('Server ID is required', MCPErrorCode.MISSING_SERVER_ID)
    }

    if (!config.transport) {
      throw new MCPProcessError('Transport configuration is required', MCPErrorCode.MISSING_TRANSPORT, {
        serverId: config.id,
      })
    }

    if (config.transport.type === 'stdio') {
      const stdio = config.transport as MCPStdioTransport
      if (!stdio.command) {
        throw new MCPProcessError('Command is required for stdio transport', MCPErrorCode.INVALID_CONFIG, {
          serverId: config.id,
        })
      }
    } else if (config.transport.type === 'http') {
      if (!config.transport.url) {
        throw new MCPProcessError('URL is required for HTTP transport', MCPErrorCode.INVALID_CONFIG, {
          serverId: config.id,
        })
      }
    } else {
      throw new MCPProcessError(`Unknown transport type: ${(config.transport as { type: string }).type}`, MCPErrorCode.INVALID_TRANSPORT, {
        serverId: config.id,
      })
    }
  }
}
