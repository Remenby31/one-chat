/**
 * Built-in MCP Servers Registry
 *
 * This file defines MCP servers that are bundled with the application.
 * Built-in servers:
 * - Are automatically initialized on first launch
 * - Are enabled by default
 * - Cannot be deleted (only disabled)
 * - Are located in mcp-servers/built-in/ directory
 */

import type { MCPServer } from '@/types/mcp'

/**
 * Template for defining a built-in server
 * This is the configuration structure without runtime state
 */
export interface BuiltInServerDefinition {
  id: string
  name: string
  description: string
  icon?: string
  category: 'productivity' | 'database' | 'api' | 'filesystem' | 'other'
  command: string
  // Args will be filled in by getBuiltInServers() with the correct path
  // based on whether we're in dev or production
  relativeServerPath: string // e.g., 'mcp-servers/built-in/obsidian-memory/dist/index.js'
  env?: Record<string, string>
  requiresAuth: boolean
  authType: 'oauth' | 'token' | 'none'
}

/**
 * Registry of all built-in MCP servers
 * Add new built-in servers here
 */
export const BUILT_IN_SERVERS: BuiltInServerDefinition[] = [
  {
    id: 'builtin-obsidian-memory',
    name: 'Obsidian Memory',
    description: 'Persistent memory system compatible with Obsidian vault format. Store and retrieve conversation context, notes, and knowledge across sessions.',
    icon: 'memory',
    category: 'productivity',
    command: 'node',
    relativeServerPath: 'mcp-servers/built-in/obsidian-memory/dist/index.js',
    requiresAuth: false,
    authType: 'none',
    env: {
      // OBSIDIAN_VAULT_PATH can be set by user in settings
      // Default will be created in user data directory
    }
  },
  // Add more built-in servers here as they are developed
  // Example:
  // {
  //   id: 'builtin-local-search',
  //   name: 'Local Search',
  //   description: 'Search files and content on your local system',
  //   icon: 'search',
  //   category: 'filesystem',
  //   command: 'node',
  //   relativeServerPath: 'mcp-servers/built-in/local-search/dist/index.js',
  //   requiresAuth: false,
  //   authType: 'none',
  // },
]

/**
 * Initialize built-in servers
 * This should be called on app startup to ensure all built-in servers are registered
 *
 * @param existingServers Current list of servers from storage
 * @returns Updated list of servers with built-in servers added/updated
 *
 * Note: This function uses electronAPI to get the app root path, so it must
 * be called in a renderer process with access to the Electron API.
 */
export async function initializeBuiltInServers(
  existingServers: MCPServer[]
): Promise<MCPServer[]> {
  console.log('[builtInServers] 🚀 Starting initialization with', existingServers.length, 'existing servers')
  console.log('[builtInServers] Built-in servers to initialize:', BUILT_IN_SERVERS.length)

  // Get app root path via IPC (if available)
  let appRoot = ''
  if (window.electronAPI?.getAppRoot) {
    console.log('[builtInServers] Fetching app root via Electron API...')
    appRoot = await window.electronAPI.getAppRoot()
    console.log('[builtInServers] ✅ App root obtained:', appRoot)
  } else {
    // Fallback for development - use current origin
    appRoot = window.location.origin
    console.warn('[builtInServers] ⚠️ Running without Electron API, using fallback path:', appRoot)
  }

  // Validate that appRoot is not an HTTP URL (invalid for file paths)
  if (appRoot.startsWith('http://') || appRoot.startsWith('https://')) {
    console.error('[builtInServers] ❌ ERROR: appRoot is an HTTP URL, not a file path! This will fail.')
    console.error('[builtInServers] Built-in servers require Electron to function properly.')
    // Return existing servers without modifications
    return existingServers
  }

  const servers = [...existingServers]

  // Process each built-in server
  for (const definition of BUILT_IN_SERVERS) {
    console.log(`[builtInServers] Processing "${definition.name}" (${definition.id})...`)

    const existingServer = servers.find(s => s.id === definition.id)

    // Construct absolute path to server entry point
    const serverPath = appRoot + '/' + definition.relativeServerPath
    console.log(`[builtInServers]   → Server path: ${serverPath}`)

    const builtInConfig: Omit<MCPServer, 'status' | 'stateMetadata'> = {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      icon: definition.icon,
      category: definition.category,
      command: definition.command,
      args: [serverPath],
      env: definition.env,
      enabled: true, // Built-in servers are enabled by default
      requiresAuth: definition.requiresAuth,
      authType: definition.authType,
      isBuiltIn: true, // Mark as built-in
    }

    if (existingServer) {
      // Server already exists - update its configuration but preserve user settings
      console.log(`[builtInServers]   → Server already exists, updating configuration...`)
      const index = servers.indexOf(existingServer)

      servers[index] = {
        ...builtInConfig,
        // Preserve user settings
        enabled: existingServer.enabled, // User can disable built-in servers
        env: {
          ...builtInConfig.env,
          ...existingServer.env, // User's env vars take precedence
        },
        // Preserve runtime state
        status: existingServer.status,
        stateMetadata: existingServer.stateMetadata,
        // Ensure isBuiltIn flag is set
        isBuiltIn: true,
      }
      console.log(`[builtInServers]   ✅ Updated existing server`)
    } else {
      // New built-in server - add it with default state
      console.log(`[builtInServers]   → New server, adding to list...`)
      servers.push({
        ...builtInConfig,
        status: 'IDLE',
      })
      console.log(`[builtInServers]   ✅ Added new server`)
    }
  }

  console.log('[builtInServers] ✅ Initialization complete. Total servers:', servers.length)
  return servers
}

/**
 * Check if a server ID corresponds to a built-in server
 */
export function isBuiltInServerId(serverId: string): boolean {
  return BUILT_IN_SERVERS.some(def => def.id === serverId)
}

/**
 * Get built-in server definition by ID
 */
export function getBuiltInServerDefinition(serverId: string): BuiltInServerDefinition | undefined {
  return BUILT_IN_SERVERS.find(def => def.id === serverId)
}
