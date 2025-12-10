/**
 * HTTP Transport Types
 *
 * Types for MCP HTTP/SSE transport.
 */

import type { JSONRPCMessage } from '../../core/types'

/**
 * HTTP connection state
 */
export type HttpConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

/**
 * HTTP transport options
 */
export interface HttpTransportOptions {
  /** Base URL of the MCP server */
  url: string

  /** HTTP headers to include in requests */
  headers?: Record<string, string>

  /** OAuth access token (will be added as Bearer token) */
  accessToken?: string

  /** Connection timeout in ms (default: 30000) */
  connectionTimeout?: number

  /** Request timeout in ms (default: 60000) */
  requestTimeout?: number

  /** Enable automatic reconnection (default: true) */
  autoReconnect?: boolean

  /** Reconnection delay in ms (default: 1000) */
  reconnectDelay?: number

  /** Maximum reconnection attempts (default: 5) */
  maxReconnectAttempts?: number

  /** SSE endpoint path (default: '/sse' or auto-detect) */
  sseEndpoint?: string

  /** Messages endpoint path (default: '/messages' or auto-detect) */
  messagesEndpoint?: string
}

/**
 * HTTP transport events
 */
export interface HttpTransportEvents {
  /** Called when connection state changes */
  onStateChange?: (state: HttpConnectionState) => void

  /** Called when a message is received */
  onMessage?: (message: JSONRPCMessage) => void

  /** Called when an error occurs */
  onError?: (error: Error) => void

  /** Called when the connection is closed */
  onClose?: (reason?: string) => void
}

/**
 * SSE event types
 */
export interface SSEEvent {
  type: string
  data: string
  id?: string
  retry?: number
}

/**
 * MCP Initialize request params
 */
export interface MCPInitializeParams {
  protocolVersion: string
  capabilities: Record<string, unknown>
  clientInfo: {
    name: string
    version: string
  }
}

/**
 * MCP Initialize response
 */
export interface MCPInitializeResponse {
  protocolVersion: string
  capabilities: {
    tools?: Record<string, unknown>
    resources?: Record<string, unknown>
    prompts?: Record<string, unknown>
    logging?: Record<string, unknown>
  }
  serverInfo: {
    name: string
    version: string
  }
}

/**
 * HTTP MCP API response wrapper
 */
export interface HttpMCPResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  errorCode?: number
}
