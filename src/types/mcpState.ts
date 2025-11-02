/**
 * MCP Server State Machine Types
 *
 * Defines a robust state system for MCP servers with clear transitions
 * and validation to prevent invalid state changes.
 */

// ========================================
// State Definitions
// ========================================

/**
 * Complete set of possible MCP server states
 * Organized into logical categories for clarity
 */
export type MCPServerState =
  // Rest states - stable states where server is not actively transitioning
  | 'UNINITIALIZED'     // Server never started, initial state
  | 'IDLE'              // Server configured and ready, but not running
  | 'STOPPED'           // Server stopped voluntarily by user
  | 'RUNNING'           // Server active and operational

  // Transient states - temporary states during operations
  | 'VALIDATING'        // Validating configuration before start
  | 'STARTING'          // Server process is starting
  | 'STOPPING'          // Server is being stopped

  // Authentication states
  | 'AUTH_REQUIRED'     // Authentication needed (no token)
  | 'AUTHENTICATING'    // OAuth flow in progress (browser open)
  | 'TOKEN_REFRESHING'  // Refreshing expired token
  | 'AUTH_FAILED'       // Authentication failed

  // Error states
  | 'CONFIG_ERROR'      // Configuration error (invalid command, args, etc.)
  | 'RUNTIME_ERROR'     // Runtime error (crash, timeout, etc.)

/**
 * Events that can trigger state transitions
 */
export type MCPStateEvent =
  // User actions
  | 'START'             // User requested to start server
  | 'STOP'              // User requested to stop server
  | 'AUTHENTICATE'      // User initiated OAuth flow
  | 'RETRY'             // User wants to retry after error
  | 'RESET'             // Reset to idle state

  // System events
  | 'AUTH_SUCCESS'      // OAuth completed successfully
  | 'AUTH_FAILURE'      // OAuth failed
  | 'TOKEN_EXPIRED'     // Token expiration detected
  | 'REFRESH_SUCCESS'   // Token refresh succeeded
  | 'REFRESH_FAILURE'   // Token refresh failed
  | 'STARTED'           // Server started successfully
  | 'START_FAILED'      // Server failed to start
  | 'STOPPED'           // Server stopped successfully
  | 'CRASHED'           // Server crashed unexpectedly

// ========================================
// State Categories
// ========================================

/**
 * Categorize states for UI/UX purposes
 */
export const STATE_CATEGORIES = {
  REST: ['UNINITIALIZED', 'IDLE', 'STOPPED', 'RUNNING'] as const,
  TRANSIENT: ['VALIDATING', 'STARTING', 'STOPPING', 'TOKEN_REFRESHING'] as const,
  AUTH: ['AUTH_REQUIRED', 'AUTHENTICATING', 'AUTH_FAILED'] as const,
  ERROR: ['CONFIG_ERROR', 'RUNTIME_ERROR'] as const,
} as const

/**
 * States that indicate the server can be started
 */
export const STARTABLE_STATES: MCPServerState[] = [
  'UNINITIALIZED',
  'IDLE',
  'STOPPED',
  'AUTH_REQUIRED',
  'CONFIG_ERROR',
  'RUNTIME_ERROR'
]

/**
 * States that indicate the server can be stopped
 */
export const STOPPABLE_STATES: MCPServerState[] = [
  'STARTING',
  'RUNNING'
]

/**
 * States that require user attention
 */
export const ATTENTION_REQUIRED_STATES: MCPServerState[] = [
  'AUTH_REQUIRED',
  'AUTH_FAILED',
  'CONFIG_ERROR',
  'RUNTIME_ERROR'
]

/**
 * States that indicate active operation (show spinner)
 */
export const ACTIVE_STATES: MCPServerState[] = [
  'VALIDATING',
  'STARTING',
  'STOPPING',
  'AUTHENTICATING',
  'TOKEN_REFRESHING'
]

// ========================================
// Transition Graph
// ========================================

/**
 * Complete state transition graph
 * Maps each state to allowed transitions
 */
export const STATE_TRANSITIONS: Record<MCPServerState, Partial<Record<MCPStateEvent, MCPServerState>>> = {
  // UNINITIALIZED - Initial state
  UNINITIALIZED: {
    START: 'VALIDATING',
    RESET: 'IDLE'
  },

  // IDLE - Ready to start
  IDLE: {
    START: 'VALIDATING',
    STOP: 'IDLE'  // No-op, already stopped
  },

  // VALIDATING - Checking configuration
  VALIDATING: {
    // Success paths (determined by validation logic)
    STARTED: 'STARTING',              // Config OK, no auth needed or token valid
    AUTH_SUCCESS: 'STARTING',          // Config OK, just authenticated
    REFRESH_SUCCESS: 'STARTING',       // Config OK, token refreshed

    // Needs auth
    TOKEN_EXPIRED: 'TOKEN_REFRESHING', // Token needs refresh

    // Error paths
    AUTH_FAILURE: 'AUTH_REQUIRED',     // No token or invalid
    START_FAILED: 'CONFIG_ERROR',      // Configuration invalid

    STOP: 'IDLE',                      // User cancelled
    RESET: 'IDLE'
  },

  // AUTH_REQUIRED - Needs authentication
  AUTH_REQUIRED: {
    AUTHENTICATE: 'AUTHENTICATING',
    STOP: 'IDLE',
    RESET: 'IDLE'
  },

  // AUTHENTICATING - OAuth in progress
  AUTHENTICATING: {
    AUTH_SUCCESS: 'VALIDATING',        // Got token, now validate and start
    AUTH_FAILURE: 'AUTH_FAILED',
    STOP: 'AUTH_REQUIRED',             // User cancelled
    RESET: 'IDLE'
  },

  // AUTH_FAILED - Authentication failed
  AUTH_FAILED: {
    AUTHENTICATE: 'AUTHENTICATING',    // Allow re-authentication
    RETRY: 'AUTHENTICATING',
    AUTH_SUCCESS: 'VALIDATING',        // OAuth succeeded, restart validation
    START: 'VALIDATING',               // Allow restart attempt
    TOKEN_EXPIRED: 'TOKEN_REFRESHING', // Allow token refresh if token exists
    STOP: 'IDLE',
    RESET: 'AUTH_REQUIRED'
  },

  // TOKEN_REFRESHING - Refreshing expired token
  TOKEN_REFRESHING: {
    REFRESH_SUCCESS: 'STARTING',       // Continue with start
    REFRESH_FAILURE: 'AUTH_FAILED',
    STOP: 'IDLE',
    RESET: 'IDLE'
  },

  // STARTING - Server process starting
  STARTING: {
    STARTED: 'RUNNING',
    START_FAILED: 'RUNTIME_ERROR',
    STOP: 'STOPPING'
  },

  // RUNNING - Server operational
  RUNNING: {
    STOP: 'STOPPING',
    TOKEN_EXPIRED: 'TOKEN_REFRESHING',  // Auto-refresh
    CRASHED: 'RUNTIME_ERROR'
  },

  // STOPPING - Server being stopped
  STOPPING: {
    STOPPED: 'STOPPED',
    CRASHED: 'RUNTIME_ERROR'            // Failed to stop gracefully
  },

  // STOPPED - Stopped by user
  STOPPED: {
    START: 'VALIDATING',
    STOP: 'STOPPED'  // No-op, already stopped
  },

  // CONFIG_ERROR - Configuration problem
  CONFIG_ERROR: {
    RETRY: 'VALIDATING',
    STOP: 'IDLE',
    RESET: 'IDLE'
  },

  // RUNTIME_ERROR - Runtime problem
  RUNTIME_ERROR: {
    RETRY: 'VALIDATING',
    START: 'VALIDATING',
    STOP: 'IDLE',
    RESET: 'IDLE'
  }
}

// ========================================
// State Metadata
// ========================================

/**
 * Additional context about the current state
 */
export interface MCPStateMetadata {
  // Timestamp when state was entered
  timestamp: number

  // Error information (for error states)
  errorMessage?: string
  errorCode?: string
  errorStack?: string

  // Authentication info
  authUrl?: string
  tokenExpiresAt?: number

  // Process info
  processId?: number
  restartCount?: number

  // User-facing message
  userMessage?: string

  // Suggested actions
  suggestedActions?: string[]
}

/**
 * State transition record for history tracking
 */
export interface MCPStateTransition {
  from: MCPServerState
  to: MCPServerState
  event: MCPStateEvent
  timestamp: number
  metadata?: Partial<MCPStateMetadata>
}

/**
 * Complete state information for a server
 */
export interface MCPServerStateInfo {
  serverId: string
  currentState: MCPServerState
  previousState: MCPServerState | null
  metadata: MCPStateMetadata
  history: MCPStateTransition[]
}

// ========================================
// State Display Configuration
// ========================================

/**
 * UI configuration for each state
 */
export interface MCPStateUIConfig {
  label: string
  description: string
  color: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info'
  icon: string
  showSpinner: boolean
}

/**
 * UI configuration for all states
 */
export const STATE_UI_CONFIG: Record<MCPServerState, MCPStateUIConfig> = {
  UNINITIALIZED: {
    label: 'Not Started',
    description: 'Server has never been started',
    color: 'default',
    icon: 'circle-dashed',
    showSpinner: false
  },
  IDLE: {
    label: 'Ready',
    description: 'Server is configured and ready to start',
    color: 'default',
    icon: 'circle',
    showSpinner: false
  },
  VALIDATING: {
    label: 'Validating',
    description: 'Checking configuration and authentication',
    color: 'info',
    icon: 'loader',
    showSpinner: true
  },
  AUTH_REQUIRED: {
    label: 'Authentication Required',
    description: 'Server requires OAuth authentication',
    color: 'warning',
    icon: 'shield-alert',
    showSpinner: false
  },
  AUTHENTICATING: {
    label: 'Authenticating',
    description: 'OAuth authentication in progress',
    color: 'info',
    icon: 'loader',
    showSpinner: true
  },
  AUTH_FAILED: {
    label: 'Authentication Failed',
    description: 'OAuth authentication failed',
    color: 'error',
    icon: 'shield-x',
    showSpinner: false
  },
  TOKEN_REFRESHING: {
    label: 'Refreshing Token',
    description: 'Refreshing expired access token',
    color: 'info',
    icon: 'loader',
    showSpinner: true
  },
  STARTING: {
    label: 'Starting',
    description: 'Server process is starting',
    color: 'info',
    icon: 'loader',
    showSpinner: true
  },
  RUNNING: {
    label: 'Running',
    description: 'Server is active and operational',
    color: 'success',
    icon: 'check-circle',
    showSpinner: false
  },
  STOPPING: {
    label: 'Stopping',
    description: 'Server is being stopped',
    color: 'info',
    icon: 'loader',
    showSpinner: true
  },
  STOPPED: {
    label: 'Stopped',
    description: 'Server stopped by user',
    color: 'default',
    icon: 'circle',
    showSpinner: false
  },
  CONFIG_ERROR: {
    label: 'Configuration Error',
    description: 'Server configuration is invalid',
    color: 'error',
    icon: 'alert-circle',
    showSpinner: false
  },
  RUNTIME_ERROR: {
    label: 'Runtime Error',
    description: 'Server encountered an error',
    color: 'error',
    icon: 'x-circle',
    showSpinner: false
  }
}
