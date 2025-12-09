/**
 * MCP Module
 *
 * A complete, reusable MCP (Model Context Protocol) client library.
 *
 * @example
 * ```tsx
 * import {
 *   MCPRegistry,
 *   MCPProvider,
 *   useMCPRegistry,
 *   useMCPServer,
 *   ElectronStorageAdapter,
 *   ElectronProcessAdapter,
 *   ElectronBrowserAdapter,
 *   TokenManager,
 * } from '@/lib/mcp'
 *
 * // Create adapters
 * const storage = new ElectronStorageAdapter()
 * const process = new ElectronProcessAdapter()
 * const browser = new ElectronBrowserAdapter()
 * const tokenManager = new TokenManager(storage, browser, { callbackScheme: 'myapp' })
 *
 * // Create registry
 * const registry = new MCPRegistry(storage, process, tokenManager)
 * await registry.initialize()
 *
 * // Use in React
 * function App() {
 *   return (
 *     <MCPProvider registry={registry}>
 *       <ServerList />
 *     </MCPProvider>
 *   )
 * }
 *
 * function ServerList() {
 *   const { servers, start, stop } = useMCPRegistry()
 *   // ...
 * }
 * ```
 */

// Core types and errors
export * from './core'

// Adapters
export * from './adapters'

// Auth
export * from './auth'

// Manager - export specific items to avoid conflicts
export {
  MCPRegistry,
  ServerManager,
  type MCPServerInstance,
  type MCPRegistryEvent,
  type MCPRegistryListener,
  type MCPRegistryOptions,
  type MCPServerStartOptions,
  type MCPServerStopOptions,
} from './manager'

// Config
export * from './config'

// React Hooks
export { MCPProvider, useMCPContext, useMCPContextOptional } from './hooks/context'
export { useMCPRegistry, useMCPRegistryEvents } from './hooks/use-mcp-registry'
export { useMCPServer, useMCPServerStatus } from './hooks/use-mcp-server'
