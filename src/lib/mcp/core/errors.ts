/**
 * MCP Error Types
 *
 * Typed errors for MCP operations with error codes for programmatic handling.
 */

/**
 * Error codes for MCP operations
 */
export const MCPErrorCode = {
  // Configuration errors (1xx)
  INVALID_CONFIG: 'MCP_100',
  MISSING_TRANSPORT: 'MCP_101',
  INVALID_TRANSPORT: 'MCP_102',
  MISSING_SERVER_ID: 'MCP_103',
  SERVER_NOT_FOUND: 'MCP_104',
  DUPLICATE_SERVER: 'MCP_105',

  // Process errors (2xx)
  PROCESS_START_FAILED: 'MCP_200',
  PROCESS_CRASHED: 'MCP_201',
  PROCESS_TIMEOUT: 'MCP_202',
  PROCESS_NOT_RUNNING: 'MCP_203',
  PROCESS_KILL_FAILED: 'MCP_204',
  COMMAND_NOT_FOUND: 'MCP_205',

  // Authentication errors (3xx)
  AUTH_REQUIRED: 'MCP_300',
  TOKEN_EXPIRED: 'MCP_301',
  TOKEN_REFRESH_FAILED: 'MCP_302',
  OAUTH_DISCOVERY_FAILED: 'MCP_303',
  OAUTH_CALLBACK_INVALID: 'MCP_304',
  OAUTH_STATE_INVALID: 'MCP_305',
  OAUTH_CODE_EXCHANGE_FAILED: 'MCP_306',
  OAUTH_TIMEOUT: 'MCP_307',
  CLIENT_REGISTRATION_FAILED: 'MCP_308',
  AUTH_FAILED: 'MCP_309',

  // Communication errors (4xx)
  IPC_TIMEOUT: 'MCP_400',
  IPC_ERROR: 'MCP_401',
  JSONRPC_ERROR: 'MCP_402',
  JSONRPC_PARSE_ERROR: 'MCP_403',
  JSONRPC_INVALID_RESPONSE: 'MCP_404',
  CONNECTION_FAILED: 'MCP_405',
  CONNECTION_LOST: 'MCP_406',
  CONNECTION_TIMEOUT: 'MCP_407',
  CONNECTION_CLOSED: 'MCP_408',
  REQUEST_TIMEOUT: 'MCP_409',

  // State machine errors (5xx)
  INVALID_TRANSITION: 'MCP_500',
  TRANSITION_BLOCKED: 'MCP_501',
  STATE_MACHINE_ERROR: 'MCP_502',

  // Tool errors (6xx)
  TOOL_NOT_FOUND: 'MCP_600',
  TOOL_CALL_FAILED: 'MCP_601',
  TOOL_TIMEOUT: 'MCP_602',

  // Resource errors (7xx)
  RESOURCE_NOT_FOUND: 'MCP_700',
  RESOURCE_READ_FAILED: 'MCP_701',

  // Prompt errors (8xx)
  PROMPT_NOT_FOUND: 'MCP_800',
  PROMPT_GET_FAILED: 'MCP_801',

  // Storage errors (9xx)
  STORAGE_READ_FAILED: 'MCP_900',
  STORAGE_WRITE_FAILED: 'MCP_901',
  STORAGE_DELETE_FAILED: 'MCP_902',

  // Unknown error
  UNKNOWN: 'MCP_999',
} as const

export type MCPErrorCode = typeof MCPErrorCode[keyof typeof MCPErrorCode]

/**
 * Base MCP Error class
 */
export class MCPError extends Error {
  public readonly code: MCPErrorCode
  public readonly serverId?: string
  public readonly cause?: Error
  public readonly timestamp: number

  constructor(
    message: string,
    code: MCPErrorCode,
    options?: {
      serverId?: string
      cause?: Error
    }
  ) {
    super(message)
    this.name = 'MCPError'
    this.code = code
    this.serverId = options?.serverId
    this.cause = options?.cause
    this.timestamp = Date.now()

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MCPError)
    }
  }

  /**
   * Create a serializable representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      serverId: this.serverId,
      timestamp: this.timestamp,
      stack: this.stack,
      cause: this.cause?.message,
    }
  }

  /**
   * Create an MCPError from an unknown error
   */
  static from(error: unknown, serverId?: string): MCPError {
    if (error instanceof MCPError) {
      return error
    }

    if (error instanceof Error) {
      return new MCPError(error.message, MCPErrorCode.UNKNOWN, {
        serverId,
        cause: error,
      })
    }

    return new MCPError(String(error), MCPErrorCode.UNKNOWN, { serverId })
  }
}

// =============================================================================
// Specific Error Classes
// =============================================================================

/**
 * Configuration error
 */
export class MCPConfigError extends MCPError {
  constructor(message: string, code: MCPErrorCode = MCPErrorCode.INVALID_CONFIG, serverId?: string) {
    super(message, code, { serverId })
    this.name = 'MCPConfigError'
  }
}

/**
 * Process error
 */
export class MCPProcessError extends MCPError {
  public readonly exitCode?: number

  constructor(
    message: string,
    code: MCPErrorCode = MCPErrorCode.PROCESS_START_FAILED,
    options?: { serverId?: string; exitCode?: number; cause?: Error }
  ) {
    super(message, code, { serverId: options?.serverId, cause: options?.cause })
    this.name = 'MCPProcessError'
    this.exitCode = options?.exitCode
  }
}

/**
 * Authentication error
 */
export class MCPAuthError extends MCPError {
  constructor(
    message: string,
    code: MCPErrorCode = MCPErrorCode.AUTH_REQUIRED,
    options?: { serverId?: string; cause?: Error }
  ) {
    super(message, code, options)
    this.name = 'MCPAuthError'
  }
}

/**
 * Communication error
 */
export class MCPCommunicationError extends MCPError {
  public readonly jsonrpcCode?: number

  constructor(
    message: string,
    code: MCPErrorCode = MCPErrorCode.JSONRPC_ERROR,
    options?: { serverId?: string; jsonrpcCode?: number; cause?: Error }
  ) {
    super(message, code, { serverId: options?.serverId, cause: options?.cause })
    this.name = 'MCPCommunicationError'
    this.jsonrpcCode = options?.jsonrpcCode
  }
}

/**
 * State machine error
 */
export class MCPStateError extends MCPError {
  public readonly fromState?: string
  public readonly toState?: string
  public readonly event?: string

  constructor(
    message: string,
    code: MCPErrorCode = MCPErrorCode.INVALID_TRANSITION,
    options?: {
      serverId?: string
      fromState?: string
      toState?: string
      event?: string
    }
  ) {
    super(message, code, { serverId: options?.serverId })
    this.name = 'MCPStateError'
    this.fromState = options?.fromState
    this.toState = options?.toState
    this.event = options?.event
  }
}

/**
 * Storage error
 */
export class MCPStorageError extends MCPError {
  public readonly key?: string

  constructor(
    message: string,
    code: MCPErrorCode = MCPErrorCode.STORAGE_READ_FAILED,
    options?: { key?: string; cause?: Error }
  ) {
    super(message, code, { cause: options?.cause })
    this.name = 'MCPStorageError'
    this.key = options?.key
  }
}

// =============================================================================
// Error Helpers
// =============================================================================

/**
 * Check if an error is an MCP error
 */
export function isMCPError(error: unknown): error is MCPError {
  return error instanceof MCPError
}

/**
 * Check if an error has a specific code
 */
export function hasErrorCode(error: unknown, code: MCPErrorCode): boolean {
  return isMCPError(error) && error.code === code
}

/**
 * Get a user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (isMCPError(error)) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

/**
 * Check if an error is recoverable (can be retried)
 */
export function isRecoverableError(error: unknown): boolean {
  if (!isMCPError(error)) return false

  const recoverableCodes: MCPErrorCode[] = [
    MCPErrorCode.PROCESS_TIMEOUT,
    MCPErrorCode.IPC_TIMEOUT,
    MCPErrorCode.CONNECTION_LOST,
    MCPErrorCode.TOKEN_EXPIRED,
    MCPErrorCode.TOOL_TIMEOUT,
  ]

  return recoverableCodes.includes(error.code as MCPErrorCode)
}

/**
 * Check if an error requires authentication
 */
export function requiresAuth(error: unknown): boolean {
  if (!isMCPError(error)) return false

  const authCodes: MCPErrorCode[] = [
    MCPErrorCode.AUTH_REQUIRED,
    MCPErrorCode.TOKEN_EXPIRED,
    MCPErrorCode.TOKEN_REFRESH_FAILED,
  ]

  return authCodes.includes(error.code as MCPErrorCode)
}
