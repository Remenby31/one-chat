/**
 * MCP Adapters Module
 *
 * Exports all adapter interfaces and implementations.
 */

// Adapter interfaces
export * from './types'

// Console logger (works everywhere)
export * from './console-logger'

// Electron adapters
export * from './electron'

// Memory adapters (for testing)
export * from './memory'

// HTTP transport (for remote servers)
export * from './http'
