/**
 * useMCPRegistry Hook
 *
 * React hook for accessing and managing the MCP server registry.
 */

import { useSyncExternalStore, useCallback } from 'react'
import type { MCPServer } from '../core/types'
import type { MCPServerInstance, MCPRegistryEvent } from '../manager/types'
import { useMCPContext } from './context'

/**
 * Hook return type
 */
interface UseMCPRegistryReturn {
  /** All server instances */
  servers: MCPServerInstance[]

  /** All server configs */
  configs: MCPServer[]

  /** Running servers */
  running: MCPServerInstance[]

  /** Add a new server */
  add: (server: MCPServer) => Promise<void>

  /** Update a server */
  update: (serverId: string, updates: Partial<MCPServer>) => Promise<void>

  /** Remove a server */
  remove: (serverId: string) => Promise<void>

  /** Start a server */
  start: (serverId: string) => Promise<void>

  /** Stop a server */
  stop: (serverId: string) => Promise<void>

  /** Restart a server */
  restart: (serverId: string) => Promise<void>

  /** Stop all servers */
  stopAll: () => Promise<void>

  /** Get a server by ID */
  get: (serverId: string) => MCPServerInstance | undefined
}

/**
 * Hook to access and manage the MCP registry
 *
 * @example
 * ```tsx
 * function ServerList() {
 *   const { servers, start, stop } = useMCPRegistry()
 *
 *   return (
 *     <ul>
 *       {servers.map(server => (
 *         <li key={server.config.id}>
 *           {server.config.name} - {server.stateMachine.getState()}
 *           <button onClick={() => start(server.config.id)}>Start</button>
 *           <button onClick={() => stop(server.config.id)}>Stop</button>
 *         </li>
 *       ))}
 *     </ul>
 *   )
 * }
 * ```
 */
export function useMCPRegistry(): UseMCPRegistryReturn {
  const registry = useMCPContext()

  // Subscribe to registry changes
  const subscribe = useCallback(
    (callback: () => void) => {
      return registry.subscribe(() => callback())
    },
    [registry]
  )

  // Get current snapshot
  const getSnapshot = useCallback(() => {
    return registry.getAll()
  }, [registry])

  // Get server snapshot for SSR
  const getServerSnapshot = useCallback(() => {
    return [] as MCPServerInstance[]
  }, [])

  // Use sync external store for reactive updates
  const servers = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // Memoized actions
  const add = useCallback(
    (server: MCPServer) => registry.add(server),
    [registry]
  )

  const update = useCallback(
    (serverId: string, updates: Partial<MCPServer>) => registry.update(serverId, updates),
    [registry]
  )

  const remove = useCallback(
    (serverId: string) => registry.remove(serverId),
    [registry]
  )

  const start = useCallback(
    (serverId: string) => registry.start(serverId),
    [registry]
  )

  const stop = useCallback(
    (serverId: string) => registry.stop(serverId),
    [registry]
  )

  const restart = useCallback(
    (serverId: string) => registry.restart(serverId),
    [registry]
  )

  const stopAll = useCallback(() => registry.stopAll(), [registry])

  const get = useCallback(
    (serverId: string) => registry.get(serverId),
    [registry]
  )

  return {
    servers,
    configs: servers.map((s) => s.config),
    running: servers.filter((s) => s.stateMachine.getState() === 'RUNNING'),
    add,
    update,
    remove,
    start,
    stop,
    restart,
    stopAll,
    get,
  }
}

/**
 * Hook to subscribe to specific registry events
 *
 * @example
 * ```tsx
 * useMCPRegistryEvents((event) => {
 *   if (event.type === 'server_error') {
 *     toast.error(`Server error: ${event.error.message}`)
 *   }
 * })
 * ```
 */
export function useMCPRegistryEvents(
  onEvent: (event: MCPRegistryEvent) => void
): void {
  const registry = useMCPContext()

  // This effect subscribes to events
  // Using useCallback to stabilize the callback reference
  const stableCallback = useCallback(onEvent, [onEvent])

  // Subscribe on mount, unsubscribe on unmount
  useSyncExternalStore(
    (callback) => {
      const cleanup = registry.subscribe((event) => {
        stableCallback(event)
        callback() // Trigger re-render (though we don't use the value)
      })
      return cleanup
    },
    () => null, // We don't actually use the snapshot
    () => null
  )
}
