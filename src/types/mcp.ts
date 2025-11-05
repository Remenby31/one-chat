// MCP Server types and interfaces

import type { MCPServerState, MCPStateMetadata } from './mcpState'

// Legacy type alias for backwards compatibility
export type MCPServerStatus = MCPServerState

export type MCPAuthType = 'oauth' | 'token' | 'none';

export type MCPServerCategory = 'productivity' | 'database' | 'api' | 'filesystem' | 'other';

export interface MCPOAuthConfig {
  clientId?: string;
  clientSecret?: string; // From Dynamic Client Registration (required by some providers like Supabase)
  authUrl?: string;
  tokenUrl?: string;
  redirectUri?: string;
  scopes?: string[];
  // OAuth tokens
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number; // When the access token expires (typically 1 hour)
  tokenIssuedAt?: number; // When tokens were issued (for tracking refresh token age)
  // Dynamic Client Registration
  registrationAccessToken?: string; // Token for managing the dynamically registered client
}

export interface MCPServer {
  id: string;
  name: string;
  enabled: boolean;
  command: string;
  args: string[];
  env?: Record<string, string>;

  // Authentication configuration
  requiresAuth: boolean;
  authType: MCPAuthType;
  authToken?: string; // For simple token auth
  oauthConfig?: MCPOAuthConfig;

  // Runtime state - now using robust state machine
  status: MCPServerState; // Current state from state machine
  stateMetadata?: MCPStateMetadata; // Additional state context

  // Legacy fields (deprecated, kept for backwards compatibility)
  error?: string; // Deprecated: use stateMetadata.errorMessage
  connectedAt?: string; // Deprecated: use stateMetadata.timestamp
  lastError?: string; // Deprecated: use stateMetadata.errorMessage

  // Metadata - All optional for simplified setup
  description?: string;
  icon?: string;
  category?: MCPServerCategory;
  isBuiltIn?: boolean; // True for built-in servers (cannot be deleted, auto-initialized)
}

// Tool definition from MCP server
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
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

// OAuth flow state
export interface MCPOAuthState {
  serverId: string;
  state: string;
  codeVerifier: string;
  timestamp: number;
  // Store OAuth config temporarily for callback (server may not be saved yet)
  oauthConfig?: MCPOAuthConfig;
  serverName?: string;
}

// Pre-configured MCP server templates
export interface MCPServerTemplate {
  name: string;
  description: string;
  icon?: string;
  category: MCPServerCategory;
  command: string;
  args: string[];
  requiresAuth: boolean;
  authType: MCPAuthType;
  oauthConfig?: Partial<MCPOAuthConfig>;
  documentationUrl?: string;
}

// Popular MCP server templates
export const MCP_SERVER_TEMPLATES: MCPServerTemplate[] = [
  {
    name: 'Filesystem',
    description: 'Read and write files on your local system',
    icon: 'folder',
    category: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/directory'],
    requiresAuth: false,
    authType: 'none',
    documentationUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    name: 'GitHub',
    description: 'Access GitHub repositories, issues, and pull requests',
    icon: 'github',
    category: 'productivity',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    requiresAuth: true,
    authType: 'token',
    documentationUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    name: 'GitLab',
    description: 'Manage GitLab projects, issues, and merge requests',
    icon: 'gitlab',
    category: 'productivity',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gitlab'],
    requiresAuth: true,
    authType: 'token',
    documentationUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    name: 'PostgreSQL',
    description: 'Query and manage PostgreSQL databases',
    icon: 'database',
    category: 'database',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://user:password@localhost/dbname'],
    requiresAuth: false,
    authType: 'none',
    documentationUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    name: 'SQLite',
    description: 'Query and manage SQLite databases',
    icon: 'database',
    category: 'database',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', '/path/to/database.db'],
    requiresAuth: false,
    authType: 'none',
    documentationUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    name: 'Brave Search',
    description: 'Search the web using Brave Search API',
    icon: 'brave',
    category: 'api',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    requiresAuth: true,
    authType: 'token',
    documentationUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    name: 'Google Drive',
    description: 'Access and manage Google Drive files',
    icon: 'google-drive',
    category: 'productivity',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gdrive'],
    requiresAuth: true,
    authType: 'oauth',
    documentationUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    name: 'Google Maps',
    description: 'Search locations and get directions with Google Maps',
    icon: 'google-maps',
    category: 'api',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-google-maps'],
    requiresAuth: true,
    authType: 'token',
    documentationUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    name: 'Slack',
    description: 'Send messages and manage Slack workspaces',
    icon: 'slack',
    category: 'productivity',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    requiresAuth: true,
    authType: 'oauth',
    documentationUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    name: 'Memory',
    description: 'Persistent memory for conversation context',
    icon: 'memory',
    category: 'other',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    requiresAuth: false,
    authType: 'none',
    documentationUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    name: 'Puppeteer',
    description: 'Automate browser interactions and web scraping',
    icon: 'puppeteer',
    category: 'other',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    requiresAuth: false,
    authType: 'none',
    documentationUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    name: 'Fetch',
    description: 'Fetch and process web content',
    icon: 'fetch',
    category: 'api',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    requiresAuth: false,
    authType: 'none',
    documentationUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    name: 'Stripe',
    description: 'Access Stripe API for payment data and operations',
    icon: 'stripe',
    category: 'api',
    command: 'npx',
    args: ['-y', '@stripe/mcp'],
    requiresAuth: true,
    authType: 'oauth',
    oauthConfig: {
      authUrl: 'https://mcp.stripe.com/authorize',
      scopes: ['read_data'],
    },
    documentationUrl: 'https://docs.stripe.com/mcp',
  },
  {
    name: 'Supabase',
    description: 'Manage Supabase projects and databases',
    icon: 'supabase',
    category: 'database',
    command: 'npx',
    args: ['-y', '@supabase/mcp-server'],
    requiresAuth: true,
    authType: 'oauth',
    documentationUrl: 'https://supabase.com/docs/guides/getting-started/mcp',
  },
  {
    name: 'Sequential Thinking',
    description: 'Extended chain-of-thought reasoning for complex problems',
    icon: 'thinking',
    category: 'other',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    requiresAuth: false,
    authType: 'none',
    documentationUrl: 'https://github.com/modelcontextprotocol/servers',
  },
];
