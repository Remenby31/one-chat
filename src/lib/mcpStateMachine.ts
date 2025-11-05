/**
 * MCP Server State Machine
 *
 * Provides a robust state management system for MCP servers with:
 * - Validated state transitions
 * - Event-driven architecture
 * - Transition hooks
 * - State history tracking
 * - Metadata management
 */

import type {
  MCPServerState,
  MCPStateEvent,
  MCPStateMetadata,
  MCPStateTransition,
  MCPServerStateInfo
} from '@/types/mcpState'
import { STATE_TRANSITIONS, STARTABLE_STATES, STOPPABLE_STATES } from '@/types/mcpState'

// ========================================
// State Machine Events
// ========================================

export type StateChangeListener = (
  serverId: string,
  from: MCPServerState,
  to: MCPServerState,
  event: MCPStateEvent,
  metadata?: Partial<MCPStateMetadata>
) => void

export type BeforeTransitionHook = (
  from: MCPServerState,
  to: MCPServerState,
  event: MCPStateEvent
) => boolean | Promise<boolean> // Return false to cancel transition

export type AfterTransitionHook = (
  from: MCPServerState,
  to: MCPServerState,
  event: MCPStateEvent,
  metadata?: Partial<MCPStateMetadata>
) => void | Promise<void>

// ========================================
// State Machine Class
// ========================================

/**
 * State machine for a single MCP server
 */
export class MCPStateMachine {
  private serverId: string
  private currentState: MCPServerState
  private previousState: MCPServerState | null = null
  private metadata: MCPStateMetadata
  private history: MCPStateTransition[] = []

  // Hooks
  private beforeTransitionHooks: BeforeTransitionHook[] = []
  private afterTransitionHooks: AfterTransitionHook[] = []
  private stateChangeListeners: StateChangeListener[] = []

  // Configuration
  private maxHistorySize: number = 50 // Limit history size

  constructor(serverId: string, initialState: MCPServerState = 'UNINITIALIZED') {
    this.serverId = serverId
    this.currentState = initialState
    this.metadata = {
      timestamp: Date.now()
    }
  }

  // ========================================
  // State Access
  // ========================================

  /**
   * Get current state
   */
  getState(): MCPServerState {
    return this.currentState
  }

  /**
   * Get previous state
   */
  getPreviousState(): MCPServerState | null {
    return this.previousState
  }

  /**
   * Get current metadata
   */
  getMetadata(): MCPStateMetadata {
    return { ...this.metadata }
  }

  /**
   * Get state information
   */
  getStateInfo(): MCPServerStateInfo {
    return {
      serverId: this.serverId,
      currentState: this.currentState,
      previousState: this.previousState,
      metadata: { ...this.metadata },
      history: [...this.history]
    }
  }

  /**
   * Get transition history
   */
  getHistory(): MCPStateTransition[] {
    return [...this.history]
  }

  // ========================================
  // State Transitions
  // ========================================

  /**
   * Check if a transition is valid from current state
   */
  canTransition(event: MCPStateEvent): boolean {
    const allowedTransitions = STATE_TRANSITIONS[this.currentState]
    return event in allowedTransitions
  }

  /**
   * Get the target state for an event (if valid)
   */
  getTargetState(event: MCPStateEvent): MCPServerState | null {
    const allowedTransitions = STATE_TRANSITIONS[this.currentState]
    return allowedTransitions[event] || null
  }

  /**
   * Get all valid events from current state
   */
  getValidEvents(): MCPStateEvent[] {
    const allowedTransitions = STATE_TRANSITIONS[this.currentState]
    return Object.keys(allowedTransitions) as MCPStateEvent[]
  }

  /**
   * Perform a state transition
   *
   * @param event - The event triggering the transition
   * @param metadata - Optional metadata to attach to the new state
   * @returns true if transition succeeded, false otherwise
   */
  async transition(
    event: MCPStateEvent,
    metadata?: Partial<MCPStateMetadata>
  ): Promise<boolean> {
    const targetState = this.getTargetState(event)

    if (!targetState) {
      console.warn(
        `[StateMachine:${this.serverId}] Invalid transition: ${this.currentState} --[${event}]--> (no valid target)`
      )
      return false
    }

    console.log(
      `[StateMachine:${this.serverId}] Attempting transition: ${this.currentState} --[${event}]--> ${targetState}`
    )

    // Run before-transition hooks
    for (const hook of this.beforeTransitionHooks) {
      try {
        const shouldContinue = await hook(this.currentState, targetState, event)
        if (!shouldContinue) {
          console.log(`[StateMachine:${this.serverId}] Transition cancelled by before-hook`)
          return false
        }
      } catch (error) {
        console.error(`[StateMachine:${this.serverId}] Before-hook error:`, error)
        return false
      }
    }

    // Perform transition
    const fromState = this.currentState
    this.previousState = fromState
    this.currentState = targetState

    // Update metadata
    this.metadata = {
      ...this.metadata,
      ...metadata,
      timestamp: Date.now()
    }

    // Record in history
    const transitionRecord: MCPStateTransition = {
      from: fromState,
      to: targetState,
      event,
      timestamp: Date.now(),
      metadata: metadata ? { ...metadata } : undefined
    }
    this.history.push(transitionRecord)

    // Trim history if needed
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize)
    }

    console.log(
      `[StateMachine:${this.serverId}] Transition complete: ${fromState} --> ${targetState}`
    )

    // Notify listeners
    for (const listener of this.stateChangeListeners) {
      try {
        listener(this.serverId, fromState, targetState, event, metadata)
      } catch (error) {
        console.error(`[StateMachine:${this.serverId}] Listener error:`, error)
      }
    }

    // Run after-transition hooks
    for (const hook of this.afterTransitionHooks) {
      try {
        await hook(fromState, targetState, event, metadata)
      } catch (error) {
        console.error(`[StateMachine:${this.serverId}] After-hook error:`, error)
      }
    }

    return true
  }

  /**
   * Force set a state (bypass validation)
   * Use with caution - prefer transition() for normal operations
   */
  forceSetState(
    state: MCPServerState,
    metadata?: Partial<MCPStateMetadata>
  ): void {
    console.warn(
      `[StateMachine:${this.serverId}] Force setting state: ${this.currentState} --> ${state}`
    )

    this.previousState = this.currentState
    this.currentState = state
    this.metadata = {
      ...this.metadata,
      ...metadata,
      timestamp: Date.now()
    }
  }

  // ========================================
  // Metadata Management
  // ========================================

  /**
   * Update metadata without changing state
   */
  updateMetadata(metadata: Partial<MCPStateMetadata>): void {
    this.metadata = {
      ...this.metadata,
      ...metadata
    }
  }

  /**
   * Clear error metadata
   */
  clearError(): void {
    const { errorMessage, errorCode, errorStack, ...rest } = this.metadata
    this.metadata = rest
  }

  /**
   * Set error metadata
   */
  setError(errorMessage: string, errorCode?: string, errorStack?: string): void {
    this.metadata = {
      ...this.metadata,
      errorMessage,
      errorCode,
      errorStack
    }
  }

  // ========================================
  // Convenience Methods
  // ========================================

  /**
   * Check if server can be started
   */
  canStart(): boolean {
    return STARTABLE_STATES.includes(this.currentState)
  }

  /**
   * Check if server can be stopped
   */
  canStop(): boolean {
    return STOPPABLE_STATES.includes(this.currentState)
  }

  /**
   * Check if server is in an error state
   */
  isError(): boolean {
    return this.currentState === 'CONFIG_ERROR' ||
           this.currentState === 'RUNTIME_ERROR' ||
           this.currentState === 'AUTH_FAILED'
  }

  /**
   * Check if server is operational
   */
  isRunning(): boolean {
    return this.currentState === 'RUNNING'
  }

  /**
   * Check if server is in a transient state
   */
  isTransitioning(): boolean {
    return ['VALIDATING', 'STARTING', 'STOPPING', 'AUTHENTICATING', 'TOKEN_REFRESHING'].includes(
      this.currentState
    )
  }

  /**
   * Check if server requires authentication
   */
  needsAuth(): boolean {
    return this.currentState === 'AUTH_REQUIRED' || this.currentState === 'AUTH_FAILED'
  }

  // ========================================
  // Hooks and Listeners
  // ========================================

  /**
   * Register a before-transition hook
   * Hook can return false to cancel the transition
   */
  beforeTransition(hook: BeforeTransitionHook): () => void {
    this.beforeTransitionHooks.push(hook)
    // Return unsubscribe function
    return () => {
      const index = this.beforeTransitionHooks.indexOf(hook)
      if (index > -1) {
        this.beforeTransitionHooks.splice(index, 1)
      }
    }
  }

  /**
   * Register an after-transition hook
   */
  afterTransition(hook: AfterTransitionHook): () => void {
    this.afterTransitionHooks.push(hook)
    // Return unsubscribe function
    return () => {
      const index = this.afterTransitionHooks.indexOf(hook)
      if (index > -1) {
        this.afterTransitionHooks.splice(index, 1)
      }
    }
  }

  /**
   * Register a state change listener
   */
  onStateChange(listener: StateChangeListener): () => void {
    this.stateChangeListeners.push(listener)
    // Return unsubscribe function
    return () => {
      const index = this.stateChangeListeners.indexOf(listener)
      if (index > -1) {
        this.stateChangeListeners.splice(index, 1)
      }
    }
  }

  /**
   * Remove all hooks and listeners
   */
  clearHooks(): void {
    this.beforeTransitionHooks = []
    this.afterTransitionHooks = []
    this.stateChangeListeners = []
  }

  // ========================================
  // Serialization
  // ========================================

  /**
   * Serialize state machine to JSON
   */
  toJSON(): object {
    return {
      serverId: this.serverId,
      currentState: this.currentState,
      previousState: this.previousState,
      metadata: this.metadata,
      history: this.history.slice(-10) // Only keep last 10 for serialization
    }
  }

  /**
   * Restore state machine from JSON
   */
  static fromJSON(data: any): MCPStateMachine {
    const machine = new MCPStateMachine(data.serverId, data.currentState)
    machine.previousState = data.previousState || null
    machine.metadata = data.metadata || { timestamp: Date.now() }
    machine.history = data.history || []
    return machine
  }
}

// ========================================
// Global State Machine Manager
// ========================================

/**
 * Global manager for all server state machines
 */
export class MCPStateMachineManager {
  private machines: Map<string, MCPStateMachine> = new Map()
  private globalListeners: StateChangeListener[] = []

  /**
   * Get or create a state machine for a server
   */
  getMachine(serverId: string, initialState: MCPServerState = 'UNINITIALIZED'): MCPStateMachine {
    if (!this.machines.has(serverId)) {
      const machine = new MCPStateMachine(serverId, initialState)

      // Register global listener on this machine
      machine.onStateChange((id, from, to, event, metadata) => {
        this.globalListeners.forEach(listener => {
          try {
            listener(id, from, to, event, metadata)
          } catch (error) {
            console.error('[StateMachineManager] Global listener error:', error)
          }
        })
      })

      this.machines.set(serverId, machine)
    }
    return this.machines.get(serverId)!
  }

  /**
   * Check if a machine exists
   */
  hasMachine(serverId: string): boolean {
    return this.machines.has(serverId)
  }

  /**
   * Remove a state machine
   */
  removeMachine(serverId: string): void {
    const machine = this.machines.get(serverId)
    if (machine) {
      machine.clearHooks()
      this.machines.delete(serverId)
    }
  }

  /**
   * Get all server IDs with state machines
   */
  getAllServerIds(): string[] {
    return Array.from(this.machines.keys())
  }

  /**
   * Get state info for all servers
   */
  getAllStateInfo(): MCPServerStateInfo[] {
    return Array.from(this.machines.values()).map(m => m.getStateInfo())
  }

  /**
   * Get all machines with their server IDs
   */
  getAllMachines(): Array<{ serverId: string; machine: MCPStateMachine }> {
    return Array.from(this.machines.entries()).map(([serverId, machine]) => ({
      serverId,
      machine
    }))
  }

  /**
   * Register a global state change listener
   * This listener will be called for ALL server state changes
   */
  onStateChange(listener: StateChangeListener): () => void {
    this.globalListeners.push(listener)
    // Return unsubscribe function
    return () => {
      const index = this.globalListeners.indexOf(listener)
      if (index > -1) {
        this.globalListeners.splice(index, 1)
      }
    }
  }

  /**
   * Clear all state machines
   */
  clear(): void {
    this.machines.forEach(machine => machine.clearHooks())
    this.machines.clear()
  }
}

// Singleton instance
export const stateMachineManager = new MCPStateMachineManager()
