/**
 * MCP State Definitions
 *
 * Defines all states, transitions, and state metadata for MCP servers.
 */

import type { MCPServerStatus } from './types'

// =============================================================================
// State Events
// =============================================================================

/**
 * Events that trigger state transitions
 */
export type MCPStateEvent =
  | 'VALIDATE'        // Start validation
  | 'VALID'           // Validation successful
  | 'INVALID'         // Validation failed
  | 'START'           // Start the server
  | 'STARTED'         // Server started successfully
  | 'STOP'            // Stop the server
  | 'STOPPED'         // Server stopped
  | 'ERROR'           // An error occurred
  | 'CRASHED'         // Server crashed unexpectedly
  | 'RECOVER'         // Attempt recovery
  | 'RESET'           // Reset to idle state
  | 'AUTH_REQUIRED'   // Authentication is required
  | 'AUTHENTICATE'    // Start authentication
  | 'AUTH_SUCCESS'    // Authentication successful
  | 'AUTH_FAILED'     // Authentication failed
  | 'REFRESH_TOKEN'   // Refresh the token
  | 'TOKEN_REFRESHED' // Token refreshed successfully
  | 'TOKEN_FAILED'    // Token refresh failed

// =============================================================================
// State Transition Map
// =============================================================================

/**
 * Valid state transitions
 *
 * Maps current state -> event -> next state
 */
export const STATE_TRANSITIONS: Record<MCPServerStatus, Partial<Record<MCPStateEvent, MCPServerStatus>>> = {
  // Initial state
  IDLE: {
    VALIDATE: 'VALIDATING',
    START: 'VALIDATING', // Shortcut: START also triggers validation
    ERROR: 'ERROR',
  },

  // Validating configuration
  VALIDATING: {
    VALID: 'STARTING',
    INVALID: 'CONFIG_ERROR',
    AUTH_REQUIRED: 'AUTH_REQUIRED',
    ERROR: 'CONFIG_ERROR',
  },

  // Starting the server process
  STARTING: {
    STARTED: 'RUNNING',
    ERROR: 'ERROR',
    CRASHED: 'CRASHED',
  },

  // Server is running
  RUNNING: {
    STOP: 'STOPPING',
    ERROR: 'RUNTIME_ERROR',
    CRASHED: 'CRASHED',
    REFRESH_TOKEN: 'TOKEN_REFRESHING',
  },

  // Stopping the server
  STOPPING: {
    STOPPED: 'STOPPED',
    ERROR: 'ERROR',
    CRASHED: 'CRASHED',
  },

  // Server stopped normally
  STOPPED: {
    START: 'VALIDATING',
    RESET: 'IDLE',
  },

  // Generic error state
  ERROR: {
    RESET: 'IDLE',
    START: 'VALIDATING',
    RECOVER: 'VALIDATING',
  },

  // Authentication required
  AUTH_REQUIRED: {
    AUTHENTICATE: 'AUTHENTICATING',
    RESET: 'IDLE',
  },

  // Authenticating (OAuth flow in progress)
  AUTHENTICATING: {
    AUTH_SUCCESS: 'VALIDATING',
    AUTH_FAILED: 'AUTH_REQUIRED',
    ERROR: 'AUTH_REQUIRED',
  },

  // Refreshing OAuth token
  TOKEN_REFRESHING: {
    TOKEN_REFRESHED: 'RUNNING',
    TOKEN_FAILED: 'AUTH_REQUIRED',
    ERROR: 'AUTH_REQUIRED',
  },

  // Configuration error
  CONFIG_ERROR: {
    RESET: 'IDLE',
    START: 'VALIDATING',
  },

  // Runtime error (while running)
  RUNTIME_ERROR: {
    RESET: 'IDLE',
    START: 'VALIDATING',
    RECOVER: 'VALIDATING',
  },

  // Server crashed
  CRASHED: {
    RESET: 'IDLE',
    START: 'VALIDATING',
    RECOVER: 'VALIDATING',
  },
}

// =============================================================================
// State Categories
// =============================================================================

/**
 * States where the server is at rest (not transitioning)
 */
export const REST_STATES: MCPServerStatus[] = [
  'IDLE',
  'RUNNING',
  'STOPPED',
  'ERROR',
  'AUTH_REQUIRED',
  'CONFIG_ERROR',
  'RUNTIME_ERROR',
  'CRASHED',
]

/**
 * States where the server is transitioning
 */
export const TRANSIENT_STATES: MCPServerStatus[] = [
  'VALIDATING',
  'STARTING',
  'STOPPING',
  'AUTHENTICATING',
  'TOKEN_REFRESHING',
]

/**
 * States where authentication is involved
 */
export const AUTH_STATES: MCPServerStatus[] = [
  'AUTH_REQUIRED',
  'AUTHENTICATING',
  'TOKEN_REFRESHING',
]

/**
 * Error states
 */
export const ERROR_STATES: MCPServerStatus[] = [
  'ERROR',
  'CONFIG_ERROR',
  'RUNTIME_ERROR',
  'CRASHED',
]

/**
 * States from which the server can be started
 */
export const STARTABLE_STATES: MCPServerStatus[] = [
  'IDLE',
  'STOPPED',
  'ERROR',
  'CONFIG_ERROR',
  'RUNTIME_ERROR',
  'CRASHED',
]

/**
 * States from which the server can be stopped
 */
export const STOPPABLE_STATES: MCPServerStatus[] = [
  'RUNNING',
  'STARTING',
  'VALIDATING',
]

/**
 * States that require user attention
 */
export const ATTENTION_REQUIRED_STATES: MCPServerStatus[] = [
  'AUTH_REQUIRED',
  'CONFIG_ERROR',
  'ERROR',
  'RUNTIME_ERROR',
  'CRASHED',
]

// =============================================================================
// State Metadata
// =============================================================================

/**
 * Metadata associated with a state
 */
export interface MCPStateMetadata {
  /** When the state was entered */
  enteredAt: number

  /** Previous state */
  previousState?: MCPServerStatus

  /** Error message (if in error state) */
  error?: string

  /** Error code */
  errorCode?: string

  /** Exit code (if process exited) */
  exitCode?: number

  /** Number of restart attempts */
  restartCount?: number

  /** Last restart attempt timestamp */
  lastRestartAt?: number

  /** Custom data */
  [key: string]: unknown
}

/**
 * State history entry
 */
export interface MCPStateHistoryEntry {
  /** Timestamp */
  timestamp: number

  /** State that was entered */
  state: MCPServerStatus

  /** Event that caused the transition */
  event: MCPStateEvent

  /** Previous state */
  previousState: MCPServerStatus

  /** Metadata at time of transition */
  metadata?: Partial<MCPStateMetadata>
}

// =============================================================================
// State UI Configuration
// =============================================================================

/**
 * UI configuration for each state
 */
export interface MCPStateUIConfig {
  /** Display label */
  label: string

  /** Short description */
  description: string

  /** Color variant for UI */
  variant: 'default' | 'success' | 'warning' | 'error' | 'info'

  /** Whether to show a loading indicator */
  loading: boolean

  /** Icon name (for UI libraries) */
  icon: string
}

/**
 * UI configuration for all states
 */
export const STATE_UI_CONFIG: Record<MCPServerStatus, MCPStateUIConfig> = {
  IDLE: {
    label: 'Idle',
    description: 'Server is not running',
    variant: 'default',
    loading: false,
    icon: 'circle',
  },
  VALIDATING: {
    label: 'Validating',
    description: 'Checking configuration...',
    variant: 'info',
    loading: true,
    icon: 'loader',
  },
  STARTING: {
    label: 'Starting',
    description: 'Starting server...',
    variant: 'info',
    loading: true,
    icon: 'loader',
  },
  RUNNING: {
    label: 'Running',
    description: 'Server is running',
    variant: 'success',
    loading: false,
    icon: 'check-circle',
  },
  STOPPING: {
    label: 'Stopping',
    description: 'Stopping server...',
    variant: 'info',
    loading: true,
    icon: 'loader',
  },
  STOPPED: {
    label: 'Stopped',
    description: 'Server has stopped',
    variant: 'default',
    loading: false,
    icon: 'circle-stop',
  },
  ERROR: {
    label: 'Error',
    description: 'An error occurred',
    variant: 'error',
    loading: false,
    icon: 'alert-circle',
  },
  AUTH_REQUIRED: {
    label: 'Auth Required',
    description: 'Authentication required',
    variant: 'warning',
    loading: false,
    icon: 'key',
  },
  AUTHENTICATING: {
    label: 'Authenticating',
    description: 'Authenticating...',
    variant: 'info',
    loading: true,
    icon: 'loader',
  },
  TOKEN_REFRESHING: {
    label: 'Refreshing',
    description: 'Refreshing token...',
    variant: 'info',
    loading: true,
    icon: 'loader',
  },
  CONFIG_ERROR: {
    label: 'Config Error',
    description: 'Configuration error',
    variant: 'error',
    loading: false,
    icon: 'settings',
  },
  RUNTIME_ERROR: {
    label: 'Runtime Error',
    description: 'Runtime error occurred',
    variant: 'error',
    loading: false,
    icon: 'alert-triangle',
  },
  CRASHED: {
    label: 'Crashed',
    description: 'Server crashed unexpectedly',
    variant: 'error',
    loading: false,
    icon: 'x-circle',
  },
}

// =============================================================================
// State Helpers
// =============================================================================

/**
 * Check if a transition is valid
 */
export function isValidTransition(
  fromState: MCPServerStatus,
  event: MCPStateEvent
): boolean {
  const transitions = STATE_TRANSITIONS[fromState]
  return transitions !== undefined && event in transitions
}

/**
 * Get the next state for a transition
 */
export function getNextState(
  fromState: MCPServerStatus,
  event: MCPStateEvent
): MCPServerStatus | undefined {
  return STATE_TRANSITIONS[fromState]?.[event]
}

/**
 * Check if a state is a rest state
 */
export function isRestState(state: MCPServerStatus): boolean {
  return REST_STATES.includes(state)
}

/**
 * Check if a state is a transient state
 */
export function isTransientState(state: MCPServerStatus): boolean {
  return TRANSIENT_STATES.includes(state)
}

/**
 * Check if a state is an error state
 */
export function isErrorState(state: MCPServerStatus): boolean {
  return ERROR_STATES.includes(state)
}

/**
 * Check if a state requires authentication
 */
export function isAuthState(state: MCPServerStatus): boolean {
  return AUTH_STATES.includes(state)
}

/**
 * Check if a server can be started from the given state
 */
export function canStart(state: MCPServerStatus): boolean {
  return STARTABLE_STATES.includes(state)
}

/**
 * Check if a server can be stopped from the given state
 */
export function canStop(state: MCPServerStatus): boolean {
  return STOPPABLE_STATES.includes(state)
}

/**
 * Check if a state requires user attention
 */
export function requiresAttention(state: MCPServerStatus): boolean {
  return ATTENTION_REQUIRED_STATES.includes(state)
}

/**
 * Get UI configuration for a state
 */
export function getStateUIConfig(state: MCPServerStatus): MCPStateUIConfig {
  return STATE_UI_CONFIG[state]
}
