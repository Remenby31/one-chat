/**
 * MCP Manager Types
 */

import type { MCPServer, MCPServerStatus, MCPTool, MCPResource, MCPPrompt } from '../core/types'
import type { MCPStateMachine } from '../core/state-machine'
import type { MCPStateMetadata } from '../core/state'
import type { MCPProcess } from '../adapters/types'

/**
 * Server instance (runtime state)
 */
export interface MCPServerInstance {
  /** Server configuration */
  config: MCPServer

  /** State machine for this server */
  stateMachine: MCPStateMachine

  /** Running process (if started) */
  process: MCPProcess | null

  /** Cached capabilities */
  capabilities?: MCPServerCapabilities
}

/**
 * Server capabilities (cached after connection)
 */
export interface MCPServerCapabilities {
  /** Available tools */
  tools: MCPTool[]

  /** Available resources */
  resources: MCPResource[]

  /** Available prompts */
  prompts: MCPPrompt[]

  /** When capabilities were fetched */
  fetchedAt: number
}

/**
 * Registry event types
 */
export type MCPRegistryEvent =
  | { type: 'server_added'; server: MCPServer }
  | { type: 'server_updated'; server: MCPServer; changes: Partial<MCPServer> }
  | { type: 'server_removed'; serverId: string }
  | { type: 'server_state_changed'; serverId: string; state: MCPServerStatus; metadata: MCPStateMetadata }
  | { type: 'server_started'; serverId: string }
  | { type: 'server_stopped'; serverId: string }
  | { type: 'server_error'; serverId: string; error: Error }
  | { type: 'capabilities_updated'; serverId: string; capabilities: MCPServerCapabilities }

/**
 * Registry listener
 */
export type MCPRegistryListener = (event: MCPRegistryEvent) => void

/**
 * Registry options
 */
export interface MCPRegistryOptions {
  /** Config filename for persistence */
  configFilename?: string

  /** Auto-start servers that were running before */
  autoRecover?: boolean

  /** Auto-refresh capabilities when server starts */
  autoFetchCapabilities?: boolean
}

/**
 * Server start options
 */
export interface MCPServerStartOptions {
  /** Skip validation */
  skipValidation?: boolean

  /** Force restart if already running */
  forceRestart?: boolean
}

/**
 * Server stop options
 */
export interface MCPServerStopOptions {
  /** Force kill without graceful shutdown */
  force?: boolean

  /** Timeout for graceful shutdown (ms) */
  timeout?: number
}
