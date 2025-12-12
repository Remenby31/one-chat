/**
 * MCP Types - Simplified for SDK-based implementation
 */

// Server state (simplified from ~20 states to 6)
export type MCPServerState =
  | 'idle'           // Not started
  | 'connecting'     // Starting up
  | 'connected'      // Running and ready
  | 'disconnected'   // Was connected, now disconnected (SDK state)
  | 'error'          // Error occurred
  | 'auth_required'; // OAuth authentication needed

// Legacy alias for backwards compatibility during migration
export type MCPServerStatus = MCPServerState;

export type MCPAuthType = 'oauth' | 'token' | 'none';

export type MCPServerCategory = 'productivity' | 'database' | 'api' | 'filesystem' | 'other';

export interface MCPOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  authUrl?: string;
  tokenUrl?: string;
  redirectUri?: string;
  scopes?: string[];
  // OAuth tokens
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  tokenIssuedAt?: number;
}

export interface MCPServer {
  id: string;
  name: string;
  enabled: boolean;

  // Stdio transport (local servers)
  command?: string;
  args?: string[];
  env?: Record<string, string>;

  // HTTP transport (remote servers)
  httpUrl?: string;

  // Authentication
  requiresAuth?: boolean;
  authType?: MCPAuthType;
  authToken?: string;
  oauthConfig?: MCPOAuthConfig;

  // Runtime state
  state: MCPServerState;
  error?: string;

  // Metadata
  description?: string;
  icon?: string;
  category?: MCPServerCategory;
  isBuiltIn?: boolean;
}

// Tool definition from MCP server
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

// Resource definition from MCP server
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// Resource content from MCP server
export interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;    // For text-based resources
  blob?: string;    // For binary resources (base64 encoded)
}

// Prompt template from MCP server
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

// MCP Server capabilities
export interface MCPServerCapabilities {
  tools?: MCPTool[];
  resources?: MCPResource[];
  prompts?: MCPPrompt[];
}

// Result of MCP server connection test
export interface MCPTestResult {
  success: boolean;
  message: string;
  capabilities?: MCPServerCapabilities;
}
