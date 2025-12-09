/**
 * MCP Adapter Interfaces
 *
 * Abstractions for environment-specific operations.
 * Implement these interfaces for different environments (Electron, Web, Node.js, etc.)
 */

import type { MCPStdioTransport, JSONRPCMessage } from '../core/types'

// =============================================================================
// Storage Adapter
// =============================================================================

/**
 * Storage adapter for persisting MCP configuration and data.
 *
 * Implementations:
 * - ElectronStorageAdapter: Uses Electron IPC for file-based storage
 * - LocalStorageAdapter: Uses browser localStorage
 * - MemoryStorageAdapter: In-memory storage for testing
 */
export interface StorageAdapter {
  /**
   * Read a value from storage
   */
  read<T>(key: string): Promise<T | null>

  /**
   * Write a value to storage
   */
  write<T>(key: string, data: T): Promise<void>

  /**
   * Delete a value from storage
   */
  delete(key: string): Promise<void>

  /**
   * Read a configuration file
   */
  readConfig<T>(filename: string): Promise<T | null>

  /**
   * Write a configuration file
   */
  writeConfig<T>(filename: string, data: T): Promise<void>

  /**
   * Watch for changes to a configuration file
   *
   * @returns Cleanup function
   */
  watchConfig(
    filename: string,
    callback: (data: unknown) => void
  ): () => void
}

// =============================================================================
// Process Adapter
// =============================================================================

/**
 * Process adapter for spawning and managing MCP server processes.
 *
 * Implementations:
 * - ElectronProcessAdapter: Uses Electron IPC to spawn processes in main process
 * - NodeProcessAdapter: Direct child_process spawning in Node.js
 * - MockProcessAdapter: Mock implementation for testing
 */
export interface ProcessAdapter {
  /**
   * Spawn a new MCP server process
   */
  spawn(id: string, config: MCPStdioTransport): Promise<MCPProcess>

  /**
   * Get an existing process by ID
   */
  get(id: string): MCPProcess | undefined

  /**
   * Kill a process by ID
   */
  kill(id: string): Promise<void>

  /**
   * Kill all processes
   */
  killAll(): Promise<void>
}

/**
 * Represents a running MCP server process
 */
export interface MCPProcess {
  /** Process ID */
  readonly id: string

  /** Whether the process is running */
  readonly isRunning: boolean

  /**
   * Send a JSON-RPC message to the process
   */
  send(message: JSONRPCMessage): Promise<void>

  /**
   * Subscribe to incoming messages
   *
   * @returns Cleanup function
   */
  onMessage(callback: (message: JSONRPCMessage) => void): () => void

  /**
   * Subscribe to stderr output
   *
   * @returns Cleanup function
   */
  onStderr(callback: (data: string) => void): () => void

  /**
   * Subscribe to process exit
   *
   * @returns Cleanup function
   */
  onExit(callback: (code: number | null) => void): () => void

  /**
   * Kill the process
   */
  kill(): Promise<void>
}

// =============================================================================
// Browser Adapter
// =============================================================================

/**
 * Browser adapter for OAuth flows and external URL handling.
 *
 * Implementations:
 * - ElectronBrowserAdapter: Uses shell.openExternal and custom protocol
 * - WebBrowserAdapter: Uses window.open and postMessage
 * - MockBrowserAdapter: Mock implementation for testing
 */
export interface BrowserAdapter {
  /**
   * Open a URL in the system browser
   */
  open(url: string): Promise<void>

  /**
   * Register a custom protocol handler for OAuth callbacks
   *
   * @param scheme The URL scheme (e.g., 'jarvis', 'myapp')
   * @param callback Called when a URL with this scheme is received
   * @returns Cleanup function
   */
  registerProtocolHandler(
    scheme: string,
    callback: (url: string) => void
  ): () => void
}

// =============================================================================
// Logger Adapter
// =============================================================================

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Log entry
 */
export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: number
  context?: string
  data?: Record<string, unknown>
}

/**
 * Logger adapter for structured logging.
 *
 * Implementations:
 * - ConsoleLoggerAdapter: Logs to console
 * - FileLoggerAdapter: Logs to file
 * - NoopLoggerAdapter: Discards logs (for testing)
 */
export interface LoggerAdapter {
  /**
   * Log a debug message
   */
  debug(message: string, data?: Record<string, unknown>): void

  /**
   * Log an info message
   */
  info(message: string, data?: Record<string, unknown>): void

  /**
   * Log a warning message
   */
  warn(message: string, data?: Record<string, unknown>): void

  /**
   * Log an error message
   */
  error(message: string, data?: Record<string, unknown>): void

  /**
   * Create a child logger with a context prefix
   */
  child(context: string): LoggerAdapter

  /**
   * Get recent log entries
   */
  getEntries(limit?: number): LogEntry[]

  /**
   * Clear log entries
   */
  clear(): void
}

// =============================================================================
// Environment Adapter
// =============================================================================

/**
 * Environment adapter for resolving environment variables.
 *
 * Implementations:
 * - ElectronEnvAdapter: Uses Electron IPC to resolve env vars in main process
 * - NodeEnvAdapter: Direct process.env access
 * - MockEnvAdapter: Mock implementation for testing
 */
export interface EnvAdapter {
  /**
   * Get an environment variable value
   */
  get(name: string): Promise<string | undefined>

  /**
   * Resolve a value that may be an env var reference ($VAR_NAME)
   */
  resolve(value: string): Promise<string>

  /**
   * List all environment variables matching a filter
   */
  list(filter?: (name: string) => boolean): Promise<Record<string, string>>
}

// =============================================================================
// Adapter Factory
// =============================================================================

/**
 * Configuration for creating adapters
 */
export interface AdapterConfig {
  /** Storage adapter instance */
  storage: StorageAdapter

  /** Process adapter instance */
  process: ProcessAdapter

  /** Browser adapter instance */
  browser: BrowserAdapter

  /** Logger adapter instance */
  logger: LoggerAdapter

  /** Environment adapter instance */
  env: EnvAdapter
}

/**
 * Create adapter configuration type helper
 */
export type CreateAdapterConfig<T extends Partial<AdapterConfig>> = T
