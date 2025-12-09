/**
 * MCP React Context
 *
 * Provides MCP registry access throughout the React component tree.
 */

import { createContext, useContext, type ReactNode } from 'react'
import type { MCPRegistry } from '../manager/registry'

/**
 * MCP Context value
 */
interface MCPContextValue {
  registry: MCPRegistry
}

/**
 * MCP Context
 */
const MCPContext = createContext<MCPContextValue | null>(null)

/**
 * MCP Provider props
 */
interface MCPProviderProps {
  registry: MCPRegistry
  children: ReactNode
}

/**
 * MCP Provider component
 *
 * Wrap your app with this to provide MCP registry access to all components.
 *
 * @example
 * ```tsx
 * const registry = new MCPRegistry(storage, process, tokenManager)
 *
 * function App() {
 *   return (
 *     <MCPProvider registry={registry}>
 *       <MyApp />
 *     </MCPProvider>
 *   )
 * }
 * ```
 */
export function MCPProvider({ registry, children }: MCPProviderProps) {
  return (
    <MCPContext.Provider value={{ registry }}>
      {children}
    </MCPContext.Provider>
  )
}

/**
 * Hook to access the MCP registry
 *
 * @throws Error if used outside of MCPProvider
 */
export function useMCPContext(): MCPRegistry {
  const context = useContext(MCPContext)

  if (!context) {
    throw new Error('useMCPContext must be used within an MCPProvider')
  }

  return context.registry
}

/**
 * Hook to check if MCP context is available
 */
export function useMCPContextOptional(): MCPRegistry | null {
  const context = useContext(MCPContext)
  return context?.registry ?? null
}
