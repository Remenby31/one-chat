/**
 * MCP Core Types
 *
 * Defines all core types for MCP (Model Context Protocol) servers.
 * These types are framework-agnostic and can be reused across projects.
 */

// =============================================================================
// Server Types
// =============================================================================

/**
 * MCP Server configuration
 */
export interface MCPServer {
  /** Unique identifier */
  id: string

  /** Display name */
  name: string

  /** Whether the server is enabled */
  enabled: boolean

  /** Transport configuration */
  transport: MCPTransport

  /** Current status (managed by state machine) */
  status: MCPServerStatus

  /** Authentication configuration (optional) */
  auth?: MCPAuthConfig

  /** Server metadata */
  metadata?: MCPServerMetadata

  /** Server category for UI grouping */
  category?: MCPServerCategory

  /** Description */
  description?: string
}

/**
 * Server categories for UI organization
 */
export type MCPServerCategory =
  | 'productivity'
  | 'database'
  | 'filesystem'
  | 'api'
  | 'ai'
  | 'development'
  | 'communication'
  | 'other'

/**
 * Server metadata
 */
export interface MCPServerMetadata {
  /** Server version */
  version?: string

  /** Server capabilities */
  capabilities?: MCPServerCapabilities

  /** When the server was last connected */
  connectedAt?: number

  /** Last error message */
  lastError?: string

  /** Custom metadata */
  [key: string]: unknown
}

/**
 * Server capabilities as reported by the server
 */
export interface MCPServerCapabilities {
  tools?: boolean
  resources?: boolean
  prompts?: boolean
  logging?: boolean
}

// =============================================================================
// Transport Types
// =============================================================================

/**
 * Transport configuration (stdio or http)
 */
export type MCPTransport = MCPStdioTransport | MCPHttpTransport

/**
 * Standard I/O transport (local process)
 */
export interface MCPStdioTransport {
  type: 'stdio'

  /** Command to execute */
  command: string

  /** Command arguments */
  args: string[]

  /** Environment variables */
  env?: Record<string, string>

  /** Working directory */
  cwd?: string
}

/**
 * HTTP transport (remote server)
 */
export interface MCPHttpTransport {
  type: 'http'

  /** Server URL */
  url: string

  /** HTTP headers */
  headers?: Record<string, string>
}

// =============================================================================
// Authentication Types
// =============================================================================

/**
 * Authentication configuration
 */
export type MCPAuthConfig =
  | MCPNoAuth
  | MCPTokenAuth
  | MCPOAuthConfig

/**
 * No authentication required
 */
export interface MCPNoAuth {
  type: 'none'
}

/**
 * Token-based authentication
 */
export interface MCPTokenAuth {
  type: 'token'

  /** The token value (or env var reference like $ENV_VAR) */
  token: string

  /** Header name (default: Authorization) */
  headerName?: string

  /** Token prefix (default: Bearer) */
  prefix?: string
}

/**
 * OAuth 2.0 authentication
 */
export interface MCPOAuthConfig {
  type: 'oauth'

  /** OAuth client ID */
  clientId?: string

  /** OAuth client secret (from DCR) */
  clientSecret?: string

  /** Authorization endpoint URL */
  authUrl?: string

  /** Token endpoint URL */
  tokenUrl?: string

  /** Requested scopes */
  scopes?: string[]

  /** Current tokens */
  tokens?: MCPOAuthTokens

  /** Registration access token (for DCR management) */
  registrationAccessToken?: string
}

/**
 * OAuth tokens
 */
export interface MCPOAuthTokens {
  /** Access token */
  accessToken: string

  /** Refresh token */
  refreshToken?: string

  /** Token type (usually "Bearer") */
  tokenType?: string

  /** Expiration timestamp (ms) */
  expiresAt?: number

  /** Granted scopes */
  scope?: string
}

// =============================================================================
// Tool Types
// =============================================================================

/**
 * MCP Tool definition
 */
export interface MCPTool {
  /** Tool name */
  name: string

  /** Tool description */
  description?: string

  /** Input schema (JSON Schema) */
  inputSchema: JSONSchema
}

/**
 * Tool call request
 */
export interface MCPToolCall {
  /** Tool name */
  name: string

  /** Tool arguments */
  arguments: Record<string, unknown>
}

/**
 * Tool call result
 */
export interface MCPToolResult {
  /** Result content */
  content: MCPContent[]

  /** Whether the call resulted in an error */
  isError?: boolean
}

// =============================================================================
// Resource Types
// =============================================================================

/**
 * MCP Resource definition
 */
export interface MCPResource {
  /** Resource URI */
  uri: string

  /** Resource name */
  name: string

  /** MIME type */
  mimeType?: string

  /** Description */
  description?: string
}

/**
 * Resource contents
 */
export interface MCPResourceContents {
  /** Resource URI */
  uri: string

  /** MIME type */
  mimeType?: string

  /** Text content */
  text?: string

  /** Binary content (base64) */
  blob?: string
}

// =============================================================================
// Prompt Types
// =============================================================================

/**
 * MCP Prompt definition
 */
export interface MCPPrompt {
  /** Prompt name */
  name: string

  /** Prompt description */
  description?: string

  /** Prompt arguments */
  arguments?: MCPPromptArgument[]
}

/**
 * Prompt argument definition
 */
export interface MCPPromptArgument {
  /** Argument name */
  name: string

  /** Argument description */
  description?: string

  /** Whether the argument is required */
  required?: boolean
}

/**
 * Prompt message
 */
export interface MCPPromptMessage {
  /** Message role */
  role: 'user' | 'assistant'

  /** Message content */
  content: MCPContent
}

// =============================================================================
// Content Types
// =============================================================================

/**
 * Content types
 */
export type MCPContent =
  | MCPTextContent
  | MCPImageContent
  | MCPResourceContent

/**
 * Text content
 */
export interface MCPTextContent {
  type: 'text'
  text: string
}

/**
 * Image content
 */
export interface MCPImageContent {
  type: 'image'
  data: string
  mimeType: string
}

/**
 * Embedded resource content
 */
export interface MCPResourceContent {
  type: 'resource'
  resource: MCPResourceContents
}

// =============================================================================
// JSON-RPC Types
// =============================================================================

/**
 * JSON-RPC request
 */
export interface JSONRPCRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: Record<string, unknown>
}

/**
 * JSON-RPC response
 */
export interface JSONRPCResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: JSONRPCError
}

/**
 * JSON-RPC error
 */
export interface JSONRPCError {
  code: number
  message: string
  data?: unknown
}

/**
 * JSON-RPC notification (no id)
 */
export interface JSONRPCNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

/**
 * Any JSON-RPC message
 */
export type JSONRPCMessage = JSONRPCRequest | JSONRPCResponse | JSONRPCNotification

// =============================================================================
// Utility Types
// =============================================================================

/**
 * JSON Schema (simplified)
 */
export interface JSONSchema {
  type?: string | string[]
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
  description?: string
  enum?: unknown[]
  default?: unknown
  [key: string]: unknown
}

/**
 * Server status (managed by state machine)
 */
export type MCPServerStatus =
  | 'IDLE'
  | 'VALIDATING'
  | 'STARTING'
  | 'RUNNING'
  | 'STOPPING'
  | 'STOPPED'
  | 'ERROR'
  | 'AUTH_REQUIRED'
  | 'AUTHENTICATING'
  | 'TOKEN_REFRESHING'
  | 'CONFIG_ERROR'
  | 'RUNTIME_ERROR'
  | 'CRASHED'
