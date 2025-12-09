/**
 * MCP State Machine
 *
 * A robust state machine for managing MCP server lifecycle.
 * Framework-agnostic and fully testable.
 */

import type { MCPServerStatus } from './types'
import type { MCPStateEvent, MCPStateMetadata, MCPStateHistoryEntry } from './state'
import { STATE_TRANSITIONS, isValidTransition, getNextState } from './state'
import { MCPStateError, MCPErrorCode } from './errors'

// =============================================================================
// Types
// =============================================================================

/**
 * Callback for state change listeners
 */
export type MCPStateListener = (
  newState: MCPServerStatus,
  previousState: MCPServerStatus,
  metadata: MCPStateMetadata
) => void

/**
 * Hook called before a transition (can cancel by returning false)
 */
export type MCPBeforeTransitionHook = (
  fromState: MCPServerStatus,
  event: MCPStateEvent,
  toState: MCPServerStatus
) => boolean | Promise<boolean>

/**
 * Hook called after a transition
 */
export type MCPAfterTransitionHook = (
  fromState: MCPServerStatus,
  event: MCPStateEvent,
  toState: MCPServerStatus,
  metadata: MCPStateMetadata
) => void | Promise<void>

/**
 * Options for the state machine
 */
export interface MCPStateMachineOptions {
  /** Initial state (default: IDLE) */
  initialState?: MCPServerStatus

  /** Initial metadata */
  initialMetadata?: Partial<MCPStateMetadata>

  /** Maximum history entries to keep */
  maxHistorySize?: number

  /** Before transition hooks */
  beforeTransition?: MCPBeforeTransitionHook[]

  /** After transition hooks */
  afterTransition?: MCPAfterTransitionHook[]
}

/**
 * Serialized state machine state (for persistence)
 */
export interface MCPStateMachineSerialized {
  serverId: string
  state: MCPServerStatus
  metadata: MCPStateMetadata
  history: MCPStateHistoryEntry[]
}

// =============================================================================
// State Machine Class
// =============================================================================

/**
 * State machine for a single MCP server
 */
export class MCPStateMachine {
  private state: MCPServerStatus
  private metadata: MCPStateMetadata
  private history: MCPStateHistoryEntry[] = []
  private listeners = new Set<MCPStateListener>()
  private beforeHooks: MCPBeforeTransitionHook[] = []
  private afterHooks: MCPAfterTransitionHook[] = []
  private maxHistorySize: number
  readonly serverId: string

  constructor(
    serverId: string,
    options: MCPStateMachineOptions = {}
  ) {
    this.serverId = serverId
    this.state = options.initialState ?? 'IDLE'
    this.metadata = {
      enteredAt: Date.now(),
      ...options.initialMetadata,
    }
    this.maxHistorySize = options.maxHistorySize ?? 50
    this.beforeHooks = options.beforeTransition ?? []
    this.afterHooks = options.afterTransition ?? []
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get the current state
   */
  getState(): MCPServerStatus {
    return this.state
  }

  /**
   * Get the current metadata
   */
  getMetadata(): MCPStateMetadata {
    return { ...this.metadata }
  }

  /**
   * Get the state history
   */
  getHistory(): MCPStateHistoryEntry[] {
    return [...this.history]
  }

  /**
   * Get available events from the current state
   */
  getAvailableEvents(): MCPStateEvent[] {
    const transitions = STATE_TRANSITIONS[this.state]
    return Object.keys(transitions) as MCPStateEvent[]
  }

  /**
   * Check if a transition is possible
   */
  canTransition(event: MCPStateEvent): boolean {
    return isValidTransition(this.state, event)
  }

  /**
   * Transition to a new state
   *
   * @param event The event triggering the transition
   * @param metadata Optional metadata to merge
   * @returns true if the transition was successful
   * @throws MCPStateError if the transition is invalid
   */
  async transition(
    event: MCPStateEvent,
    metadata?: Partial<MCPStateMetadata>
  ): Promise<boolean> {
    const fromState = this.state
    const toState = getNextState(fromState, event)

    // Check if transition is valid
    if (!toState) {
      throw new MCPStateError(
        `Invalid transition: ${fromState} + ${event}`,
        MCPErrorCode.INVALID_TRANSITION,
        {
          serverId: this.serverId,
          fromState,
          event,
        }
      )
    }

    // Run before hooks (any can cancel)
    for (const hook of this.beforeHooks) {
      const canProceed = await hook(fromState, event, toState)
      if (!canProceed) {
        return false
      }
    }

    // Update state
    const previousState = this.state
    this.state = toState

    // Update metadata
    this.metadata = {
      ...this.metadata,
      ...metadata,
      enteredAt: Date.now(),
      previousState,
    }

    // Add to history
    this.addToHistory({
      timestamp: Date.now(),
      state: toState,
      event,
      previousState,
      metadata: metadata,
    })

    // Notify listeners
    this.notifyListeners(previousState)

    // Run after hooks
    for (const hook of this.afterHooks) {
      await hook(fromState, event, toState, this.metadata)
    }

    return true
  }

  /**
   * Force a state (use with caution - bypasses validation)
   */
  forceState(state: MCPServerStatus, metadata?: Partial<MCPStateMetadata>): void {
    const previousState = this.state
    this.state = state
    this.metadata = {
      ...this.metadata,
      ...metadata,
      enteredAt: Date.now(),
      previousState,
    }

    this.addToHistory({
      timestamp: Date.now(),
      state,
      event: 'RESET' as MCPStateEvent, // Forced transitions are logged as RESET
      previousState,
      metadata,
    })

    this.notifyListeners(previousState)
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.forceState('IDLE', {
      enteredAt: Date.now(),
      previousState: this.state,
    })
  }

  // ===========================================================================
  // Subscription
  // ===========================================================================

  /**
   * Subscribe to state changes
   *
   * @returns Unsubscribe function
   */
  subscribe(listener: MCPStateListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Add a before transition hook
   */
  addBeforeHook(hook: MCPBeforeTransitionHook): () => void {
    this.beforeHooks.push(hook)
    return () => {
      const index = this.beforeHooks.indexOf(hook)
      if (index !== -1) this.beforeHooks.splice(index, 1)
    }
  }

  /**
   * Add an after transition hook
   */
  addAfterHook(hook: MCPAfterTransitionHook): () => void {
    this.afterHooks.push(hook)
    return () => {
      const index = this.afterHooks.indexOf(hook)
      if (index !== -1) this.afterHooks.splice(index, 1)
    }
  }

  // ===========================================================================
  // Serialization
  // ===========================================================================

  /**
   * Serialize the state machine for persistence
   */
  serialize(): MCPStateMachineSerialized {
    return {
      serverId: this.serverId,
      state: this.state,
      metadata: this.metadata,
      history: this.history,
    }
  }

  /**
   * Restore from serialized state
   */
  static deserialize(
    data: MCPStateMachineSerialized,
    options: Omit<MCPStateMachineOptions, 'initialState' | 'initialMetadata'> = {}
  ): MCPStateMachine {
    const machine = new MCPStateMachine(data.serverId, {
      ...options,
      initialState: data.state,
      initialMetadata: data.metadata,
    })
    machine.history = data.history
    return machine
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private addToHistory(entry: MCPStateHistoryEntry): void {
    this.history.push(entry)

    // Maintain max size (circular buffer)
    while (this.history.length > this.maxHistorySize) {
      this.history.shift()
    }
  }

  private notifyListeners(previousState: MCPServerStatus): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.state, previousState, this.metadata)
      } catch (error) {
        console.error('[MCPStateMachine] Listener error:', error)
      }
    })
  }
}

// =============================================================================
// State Machine Manager
// =============================================================================

/**
 * Listener for registry-level events
 */
export type MCPStateMachineManagerListener = (
  serverId: string,
  newState: MCPServerStatus,
  previousState: MCPServerStatus,
  metadata: MCPStateMetadata
) => void

/**
 * Manager for multiple state machines
 */
export class MCPStateMachineManager {
  private machines = new Map<string, MCPStateMachine>()
  private listeners = new Set<MCPStateMachineManagerListener>()
  private machineListenerCleanup = new Map<string, () => void>()

  /**
   * Get or create a state machine for a server
   */
  getOrCreate(
    serverId: string,
    options: MCPStateMachineOptions = {}
  ): MCPStateMachine {
    let machine = this.machines.get(serverId)

    if (!machine) {
      machine = new MCPStateMachine(serverId, options)
      this.machines.set(serverId, machine)

      // Subscribe to state changes and forward to manager listeners
      const cleanup = machine.subscribe((newState, previousState, metadata) => {
        this.notifyListeners(serverId, newState, previousState, metadata)
      })
      this.machineListenerCleanup.set(serverId, cleanup)
    }

    return machine
  }

  /**
   * Get an existing state machine
   */
  get(serverId: string): MCPStateMachine | undefined {
    return this.machines.get(serverId)
  }

  /**
   * Check if a state machine exists
   */
  has(serverId: string): boolean {
    return this.machines.has(serverId)
  }

  /**
   * Remove a state machine
   */
  remove(serverId: string): boolean {
    const cleanup = this.machineListenerCleanup.get(serverId)
    if (cleanup) {
      cleanup()
      this.machineListenerCleanup.delete(serverId)
    }
    return this.machines.delete(serverId)
  }

  /**
   * Get all state machines
   */
  getAll(): Map<string, MCPStateMachine> {
    return new Map(this.machines)
  }

  /**
   * Get all server IDs
   */
  getServerIds(): string[] {
    return Array.from(this.machines.keys())
  }

  /**
   * Subscribe to state changes for all servers
   */
  subscribe(listener: MCPStateMachineManagerListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Clear all state machines
   */
  clear(): void {
    this.machineListenerCleanup.forEach((cleanup) => cleanup())
    this.machineListenerCleanup.clear()
    this.machines.clear()
  }

  /**
   * Serialize all state machines
   */
  serialize(): MCPStateMachineSerialized[] {
    return Array.from(this.machines.values()).map((m) => m.serialize())
  }

  /**
   * Restore from serialized state
   */
  deserialize(data: MCPStateMachineSerialized[]): void {
    this.clear()
    for (const entry of data) {
      const machine = MCPStateMachine.deserialize(entry)
      this.machines.set(entry.serverId, machine)

      const cleanup = machine.subscribe((newState, previousState, metadata) => {
        this.notifyListeners(entry.serverId, newState, previousState, metadata)
      })
      this.machineListenerCleanup.set(entry.serverId, cleanup)
    }
  }

  private notifyListeners(
    serverId: string,
    newState: MCPServerStatus,
    previousState: MCPServerStatus,
    metadata: MCPStateMetadata
  ): void {
    this.listeners.forEach((listener) => {
      try {
        listener(serverId, newState, previousState, metadata)
      } catch (error) {
        console.error('[MCPStateMachineManager] Listener error:', error)
      }
    })
  }
}
