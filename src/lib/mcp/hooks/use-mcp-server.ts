/**
 * useMCPServer Hook
 *
 * React hook for managing a single MCP server.
 */

import { useSyncExternalStore, useCallback } from 'react'
import type { MCPServer, MCPServerStatus } from '../core/types'
import type { MCPStateMetadata } from '../core/state'
import type { MCPServerInstance } from '../manager/types'
import { useMCPContext } from './context'
import { canStart, canStop, getStateUIConfig, type MCPStateUIConfig } from '../core/state'

/**
 * Hook return type
 */
interface UseMCPServerReturn {
  /** Server instance (null if not found) */
  instance: MCPServerInstance | null

  /** Server config */
  config: MCPServer | null

  /** Current status */
  status: MCPServerStatus | null

  /** State metadata */
  metadata: MCPStateMetadata | null

  /** UI configuration for current state */
  stateUI: MCPStateUIConfig | null

  /** Whether server is running */
  isRunning: boolean

  /** Whether server can be started */
  canStart: boolean

  /** Whether server can be stopped */
  canStop: boolean

  /** Whether server has an error */
  hasError: boolean

  /** Start the server */
  start: () => Promise<void>

  /** Stop the server */
  stop: () => Promise<void>

  /** Restart the server */
  restart: () => Promise<void>

  /** Update the server config */
  update: (updates: Partial<MCPServer>) => Promise<void>

  /** Remove the server */
  remove: () => Promise<void>
}

/**
 * Hook to manage a single MCP server
 *
 * @param serverId The server ID to manage
 *
 * @example
 * ```tsx
 * function ServerCard({ serverId }) {
 *   const {
 *     config,
 *     status,
 *     stateUI,
 *     isRunning,
 *     canStart,
 *     start,
 *     stop
 *   } = useMCPServer(serverId)
 *
 *   if (!config) return <div>Server not found</div>
 *
 *   return (
 *     <div>
 *       <h3>{config.name}</h3>
 *       <span style={{ color: stateUI?.variant }}>{status}</span>
 *       {canStart && <button onClick={start}>Start</button>}
 *       {isRunning && <button onClick={stop}>Stop</button>}
 *     </div>
 *   )
 * }
 * ```
 */
export function useMCPServer(serverId: string): UseMCPServerReturn {
  const registry = useMCPContext()

  // Subscribe to registry changes for this specific server
  const subscribe = useCallback(
    (callback: () => void) => {
      return registry.subscribe((event) => {
        // Only trigger update for events related to this server
        if (
          ('serverId' in event && event.serverId === serverId) ||
          (event.type === 'server_added' && event.server.id === serverId) ||
          (event.type === 'server_updated' && event.server.id === serverId) ||
          (event.type === 'server_removed' && event.serverId === serverId)
        ) {
          callback()
        }
      })
    },
    [registry, serverId]
  )

  // Get current snapshot
  const getSnapshot = useCallback(() => {
    return registry.get(serverId) ?? null
  }, [registry, serverId])

  // SSR snapshot
  const getServerSnapshot = useCallback(() => null, [])

  // Use sync external store
  const instance = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // Derive values from instance
  const config = instance?.config ?? null
  const status = instance?.stateMachine.getState() ?? null
  const metadata = instance?.stateMachine.getMetadata() ?? null

  // Computed values
  const stateUI = status ? getStateUIConfig(status) : null
  const isRunning = status === 'RUNNING'
  const canStartServer = status ? canStart(status) : false
  const canStopServer = status ? canStop(status) : false
  const hasError = status ? ['ERROR', 'CONFIG_ERROR', 'RUNTIME_ERROR', 'CRASHED'].includes(status) : false

  // Actions
  const start = useCallback(async () => {
    await registry.start(serverId)
  }, [registry, serverId])

  const stop = useCallback(async () => {
    await registry.stop(serverId)
  }, [registry, serverId])

  const restart = useCallback(async () => {
    await registry.restart(serverId)
  }, [registry, serverId])

  const update = useCallback(
    async (updates: Partial<MCPServer>) => {
      await registry.update(serverId, updates)
    },
    [registry, serverId]
  )

  const remove = useCallback(async () => {
    await registry.remove(serverId)
  }, [registry, serverId])

  return {
    instance,
    config,
    status,
    metadata,
    stateUI,
    isRunning,
    canStart: canStartServer,
    canStop: canStopServer,
    hasError,
    start,
    stop,
    restart,
    update,
    remove,
  }
}

/**
 * Hook to get just the server status (lightweight)
 */
export function useMCPServerStatus(serverId: string): MCPServerStatus | null {
  const registry = useMCPContext()

  const subscribe = useCallback(
    (callback: () => void) => {
      return registry.subscribe((event) => {
        if ('serverId' in event && event.serverId === serverId) {
          callback()
        }
      })
    },
    [registry, serverId]
  )

  const getSnapshot = useCallback(() => {
    return registry.getState(serverId) ?? null
  }, [registry, serverId])

  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}
