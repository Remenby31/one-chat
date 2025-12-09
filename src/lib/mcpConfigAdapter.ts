// MCP Configuration format adapter
// Converts between Claude Desktop format and Jarvis format

import type { MCPServer } from '@/types/mcp'
import { discoverOAuthConfig } from './mcpOAuthDiscovery'

/**
 * Claude Desktop config format
 * Example:
 * {
 *   "mcpServers": {
 *     "postgres": {
 *       "command": "npx",
 *       "args": ["-y", "@modelcontextprotocol/server-postgres"],
 *       "env": { "KEY": "value" }
 *     }
 *   }
 * }
 */
export interface ClaudeDesktopConfig {
  mcpServers: Record<string, {
    command: string
    args: string[]
    env?: Record<string, string>
  }>
}

/**
 * Convert Claude Desktop config format to Jarvis MCPServer array
 */
export function importFromClaudeDesktop(config: ClaudeDesktopConfig): MCPServer[] {
  const servers: MCPServer[] = []

  for (const [name, serverConfig] of Object.entries(config.mcpServers || {})) {
    const server: MCPServer = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      name,
      enabled: false, // Don't auto-enable imported servers
      command: serverConfig.command,
      args: serverConfig.args || [],
      env: serverConfig.env || {},
      requiresAuth: false,
      authType: 'none',
      status: 'IDLE',
      category: 'other', // Could be inferred from server name or package
      description: `Imported from Claude Desktop`,
    }

    // Try to infer category from package name
    const packageName = serverConfig.args.find(arg => arg.includes('@'))?.toLowerCase() || ''
    if (packageName.includes('postgres') || packageName.includes('database') || packageName.includes('sqlite')) {
      server.category = 'database'
    } else if (packageName.includes('filesystem') || packageName.includes('files')) {
      server.category = 'filesystem'
    } else if (packageName.includes('github') || packageName.includes('gitlab')) {
      server.category = 'productivity'
    } else if (packageName.includes('api') || packageName.includes('stripe') || packageName.includes('supabase')) {
      server.category = 'api'
    }

    servers.push(server)
  }

  return servers
}

/**
 * Convert Jarvis MCPServer array to Claude Desktop config format
 */
export function exportToClaudeDesktop(servers: MCPServer[]): ClaudeDesktopConfig {
  const config: ClaudeDesktopConfig = {
    mcpServers: {}
  }

  for (const server of servers) {
    // Skip servers that require OAuth (Claude Desktop doesn't support OAuth)
    if (server.authType === 'oauth') {
      console.warn(`Skipping server ${server.name} - OAuth not supported in Claude Desktop format`)
      continue
    }

    config.mcpServers[server.name] = {
      command: server.command,
      args: server.args,
      env: server.env || {}
    }

    // Add auth token to env if present
    if (server.authType === 'token' && server.authToken) {
      config.mcpServers[server.name].env = {
        ...config.mcpServers[server.name].env,
        AUTH_TOKEN: server.authToken,
        API_TOKEN: server.authToken,
      }
    }
  }

  return config
}

/**
 * Validate Claude Desktop config format
 */
export function validateClaudeDesktopConfig(config: any): config is ClaudeDesktopConfig {
  if (!config || typeof config !== 'object') {
    return false
  }

  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    return false
  }

  for (const [, serverConfig] of Object.entries(config.mcpServers)) {
    if (!serverConfig || typeof serverConfig !== 'object') {
      return false
    }

    const server = serverConfig as any
    if (typeof server.command !== 'string') {
      return false
    }

    if (!Array.isArray(server.args)) {
      return false
    }

    if (server.env !== undefined && typeof server.env !== 'object') {
      return false
    }
  }

  return true
}

/**
 * Generate a single-server JSON config (for copy/paste)
 */
export function exportSingleServer(server: MCPServer): string {
  const config = {
    [server.name]: {
      command: server.command,
      args: server.args,
      env: server.env || {}
    }
  }

  if (server.authType === 'token' && server.authToken) {
    config[server.name].env = {
      ...config[server.name].env,
      AUTH_TOKEN: server.authToken,
      API_TOKEN: server.authToken,
    }
  }

  return JSON.stringify(config, null, 2)
}


/**
 * Infer category from package name
 */
function inferCategory(packageName: string): import('@/types/mcp').MCPServerCategory {
  const lower = packageName.toLowerCase()

  if (lower.includes('postgres') || lower.includes('database') || lower.includes('sqlite')) {
    return 'database'
  } else if (lower.includes('filesystem') || lower.includes('files')) {
    return 'filesystem'
  } else if (lower.includes('github') || lower.includes('gitlab')) {
    return 'productivity'
  } else if (lower.includes('api') || lower.includes('stripe') || lower.includes('supabase')) {
    return 'api'
  }

  return 'other'
}

/**
 * Parse a single-server JSON config
 * Supports multiple formats:
 * 1. Simple format: { "name": { "command": "...", "args": [...] } }
 * 2. Claude Desktop format: { "mcpServers": { "name": { "command": "...", "args": [...] } } }
 * 3. HTTP server format: { "mcpServers": { "name": { "url": "..." } } }
 *    (type: "http" is optional, url alone is sufficient)
 *
 * Note: OAuth discovery is done asynchronously in importSingleServerAsync().
 * This synchronous version returns the server without OAuth config.
 */
export function importSingleServer(jsonStr: string): MCPServer | null {
  try {
    const config = JSON.parse(jsonStr)

    let serverEntries: Array<[string, any]> = []

    // Check if this is Claude Desktop format with mcpServers wrapper
    if (config.mcpServers && typeof config.mcpServers === 'object') {
      serverEntries = Object.entries(config.mcpServers)
    } else {
      // Simple format: direct server config
      serverEntries = Object.entries(config)
    }

    if (serverEntries.length === 0) {
      return null
    }

    // Get the first server
    const [name, serverConfig] = serverEntries[0]
    const server = serverConfig as any

    let command: string
    let args: string[]
    const env: Record<string, string> = server.env || {}
    let isHttpServer = false

    // Handle different server types
    if (server.url) {
      // HTTP/Remote MCP server - url alone is sufficient (type: "http" is optional)
      command = 'npx'
      args = ['-y', 'mcp-remote', server.url]
      isHttpServer = true
    } else if (server.command && Array.isArray(server.args)) {
      // Standard local server
      command = server.command
      args = server.args
      // Check if it's using mcp-remote
      isHttpServer = server.args.includes('mcp-remote')
    } else {
      // Invalid format
      return null
    }

    const packageName = args.find((arg: string) => arg.includes('@')) || ''

    // For HTTP servers, OAuth will be discovered async - don't set requiresAuth here
    const baseServer: MCPServer = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      name,
      enabled: false,
      command,
      args,
      env,
      requiresAuth: false,
      authType: 'none',
      status: 'IDLE',
      category: isHttpServer ? 'api' : inferCategory(packageName),
    }

    return baseServer
  } catch (error) {
    console.error('Failed to parse server JSON:', error)
    return null
  }
}

/**
 * Async version of importSingleServer that performs OAuth discovery for HTTP servers
 *
 * This function will:
 * 1. Parse the JSON config (same as importSingleServer)
 * 2. If it's an HTTP server, attempt OAuth discovery
 * 3. Auto-fill OAuth configuration if discovery succeeds
 * 4. Return the server with discovered OAuth config
 */
export async function importSingleServerAsync(jsonStr: string): Promise<MCPServer | null> {
  try {
    // First, parse the server using the synchronous method
    const server = importSingleServer(jsonStr)
    if (!server) {
      return null
    }

    // Check if this is an HTTP server (uses mcp-remote)
    const isHttpServer = server.args.includes('mcp-remote')
    if (!isHttpServer) {
      return server
    }

    // Extract the MCP URL from args
    const mcpRemoteIndex = server.args.indexOf('mcp-remote')
    const mcpUrl = server.args[mcpRemoteIndex + 1]

    if (!mcpUrl) {
      console.warn('[importSingleServerAsync] HTTP server detected but no URL found in args')
      return server
    }

    // Attempt OAuth discovery
    try {
      const discoveryResult = await discoverOAuthConfig(mcpUrl)

      if (discoveryResult.success && discoveryResult.config) {
        // Merge discovered config with existing config
        server.requiresAuth = true
        server.authType = 'oauth'
        server.oauthConfig = {
          ...server.oauthConfig,
          clientId: discoveryResult.config.clientId || server.oauthConfig?.clientId, // Include clientId from DCR
          clientSecret: discoveryResult.config.clientSecret || server.oauthConfig?.clientSecret, // Include clientSecret from DCR
          authUrl: discoveryResult.config.authUrl || server.oauthConfig?.authUrl,
          tokenUrl: discoveryResult.config.tokenUrl || server.oauthConfig?.tokenUrl,
          scopes: discoveryResult.config.scopes || server.oauthConfig?.scopes || [],
          registrationAccessToken: discoveryResult.config.registrationAccessToken, // Store registration token
        }
      } else {
        console.warn('[importSingleServerAsync] OAuth discovery failed:', discoveryResult.error)
        // Continue with the original server config (may have hardcoded OAuth config)
      }
    } catch (error) {
      console.error('[importSingleServerAsync] OAuth discovery error:', error)
      // Continue with the original server config
    }

    return server
  } catch (error) {
    console.error('[importSingleServerAsync] Failed to parse server JSON:', error)
    return null
  }
}

/**
 * Enhanced import from Claude Desktop with OAuth discovery for HTTP servers
 */
export async function importFromClaudeDesktopAsync(config: ClaudeDesktopConfig): Promise<MCPServer[]> {
  const servers: MCPServer[] = []

  for (const [name, serverConfig] of Object.entries(config.mcpServers || {})) {
    // Create base server object
    const server: MCPServer = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      name,
      enabled: false,
      command: serverConfig.command,
      args: serverConfig.args || [],
      env: serverConfig.env || {},
      requiresAuth: false,
      authType: 'none',
      status: 'IDLE',
      category: 'other',
      description: `Imported from Claude Desktop`,
    }

    // Try to infer category
    const packageName = serverConfig.args.find(arg => arg.includes('@'))?.toLowerCase() || ''
    if (packageName.includes('postgres') || packageName.includes('database') || packageName.includes('sqlite')) {
      server.category = 'database'
    } else if (packageName.includes('filesystem') || packageName.includes('files')) {
      server.category = 'filesystem'
    } else if (packageName.includes('github') || packageName.includes('gitlab')) {
      server.category = 'productivity'
    } else if (packageName.includes('api') || packageName.includes('stripe') || packageName.includes('supabase')) {
      server.category = 'api'
    }

    // Check if this is an HTTP server and attempt OAuth discovery
    const isHttpServer = server.args.includes('mcp-remote')
    if (isHttpServer) {
      const mcpRemoteIndex = server.args.indexOf('mcp-remote')
      const mcpUrl = server.args[mcpRemoteIndex + 1]

      if (mcpUrl) {
        try {
          const discoveryResult = await discoverOAuthConfig(mcpUrl)

          if (discoveryResult.success && discoveryResult.config) {
            server.requiresAuth = true
            server.authType = 'oauth'
            server.oauthConfig = discoveryResult.config
          }
        } catch (error) {
          console.warn(`OAuth discovery failed for ${name}:`, error)
        }
      }
    }

    servers.push(server)
  }

  return servers
}
