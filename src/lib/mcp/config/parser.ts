/**
 * MCP Config Parser
 *
 * Parses various MCP configuration formats into normalized MCPServer objects.
 */

import type { MCPServer, MCPTransport, MCPServerCategory } from '../core/types'
import { MCPConfigError, MCPErrorCode } from '../core/errors'

/**
 * Supported config formats
 */
export type MCPConfigFormat =
  | 'array'           // [{ id, name, ... }]
  | 'mcpServers'      // { mcpServers: { name: { command, args } } }
  | 'single'          // { name: { command, args } }

/**
 * Raw server config (before normalization)
 */
interface RawServerConfig {
  // Standard fields
  command?: string
  args?: string[]
  env?: Record<string, string>

  // HTTP transport
  url?: string
  type?: 'stdio' | 'http'

  // Metadata
  description?: string
  category?: MCPServerCategory
  enabled?: boolean
}

/**
 * MCP Config Parser
 *
 * Handles multiple configuration formats:
 * 1. Array format: [{ id, name, transport, ... }]
 * 2. mcpServers format: { mcpServers: { serverName: { command, args } } }
 * 3. Single server format: { serverName: { command, args } }
 */
export class MCPConfigParser {
  /**
   * Parse configuration from string or object
   */
  parse(input: string | object): MCPServer[] {
    const config = typeof input === 'string' ? this.parseJSON(input) : input
    return this.parseConfig(config)
  }

  /**
   * Parse a single server configuration
   */
  parseSingle(input: string | object): MCPServer | null {
    const servers = this.parse(input)
    return servers.length > 0 ? servers[0] : null
  }

  /**
   * Detect the config format
   */
  detectFormat(config: unknown): MCPConfigFormat {
    if (Array.isArray(config)) {
      return 'array'
    }

    if (typeof config === 'object' && config !== null) {
      const obj = config as Record<string, unknown>

      if ('mcpServers' in obj && typeof obj.mcpServers === 'object') {
        return 'mcpServers'
      }

      // Check if it looks like a single server config
      const keys = Object.keys(obj)
      if (keys.length === 1) {
        const value = obj[keys[0]]
        if (typeof value === 'object' && value !== null) {
          const serverObj = value as Record<string, unknown>
          if ('command' in serverObj || 'url' in serverObj) {
            return 'single'
          }
        }
      }
    }

    // Default to mcpServers format for object input
    return 'mcpServers'
  }

  /**
   * Validate a config string without parsing
   */
  validate(input: string): { valid: boolean; error?: string; format?: MCPConfigFormat } {
    try {
      const config = JSON.parse(input)
      const format = this.detectFormat(config)
      this.parseConfig(config) // This will throw if invalid
      return { valid: true, format }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid configuration',
      }
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private parseJSON(input: string): unknown {
    try {
      return JSON.parse(input)
    } catch (error) {
      throw new MCPConfigError(
        `Invalid JSON: ${error instanceof Error ? error.message : 'Parse error'}`,
        MCPErrorCode.INVALID_CONFIG
      )
    }
  }

  private parseConfig(config: unknown): MCPServer[] {
    const format = this.detectFormat(config)

    switch (format) {
      case 'array':
        return this.parseArrayFormat(config as unknown[])
      case 'mcpServers':
        return this.parseMcpServersFormat(config as { mcpServers: Record<string, RawServerConfig> })
      case 'single':
        return this.parseSingleFormat(config as Record<string, RawServerConfig>)
      default:
        throw new MCPConfigError('Unknown config format', MCPErrorCode.INVALID_CONFIG)
    }
  }

  private parseArrayFormat(config: unknown[]): MCPServer[] {
    return config.map((item, index) => {
      if (typeof item !== 'object' || item === null) {
        throw new MCPConfigError(
          `Invalid server at index ${index}: expected object`,
          MCPErrorCode.INVALID_CONFIG
        )
      }

      const server = item as MCPServer

      // If it's already in MCPServer format, validate and return
      if (server.id && server.transport) {
        this.validateServer(server)
        return server
      }

      // Otherwise, try to parse as raw config
      const raw = item as RawServerConfig & { id?: string; name?: string }
      return this.parseRawServer(
        raw.name || raw.id || `server-${index}`,
        raw,
        raw.id
      )
    })
  }

  private parseMcpServersFormat(config: { mcpServers: Record<string, RawServerConfig> }): MCPServer[] {
    const servers: MCPServer[] = []

    for (const [name, rawConfig] of Object.entries(config.mcpServers || {})) {
      servers.push(this.parseRawServer(name, rawConfig))
    }

    return servers
  }

  private parseSingleFormat(config: Record<string, RawServerConfig>): MCPServer[] {
    const entries = Object.entries(config)
    if (entries.length === 0) {
      return []
    }

    const [name, rawConfig] = entries[0]
    return [this.parseRawServer(name, rawConfig)]
  }

  private parseRawServer(name: string, raw: RawServerConfig, existingId?: string): MCPServer {
    // Determine transport type
    let transport: MCPTransport

    if (raw.url || raw.type === 'http') {
      // HTTP transport
      if (!raw.url) {
        throw new MCPConfigError(
          `Server "${name}": URL required for HTTP transport`,
          MCPErrorCode.INVALID_CONFIG
        )
      }

      transport = {
        type: 'http',
        url: raw.url,
      }
    } else if (raw.command) {
      // Stdio transport
      transport = {
        type: 'stdio',
        command: raw.command,
        args: raw.args || [],
        env: raw.env,
      }
    } else {
      throw new MCPConfigError(
        `Server "${name}": either 'command' or 'url' is required`,
        MCPErrorCode.MISSING_TRANSPORT
      )
    }

    const server: MCPServer = {
      id: existingId || this.generateId(),
      name,
      enabled: raw.enabled ?? false,
      transport,
      status: 'IDLE',
      category: raw.category || this.inferCategory(name, raw),
      description: raw.description,
    }

    this.validateServer(server)
    return server
  }

  private validateServer(server: MCPServer): void {
    if (!server.id) {
      throw new MCPConfigError('Server ID is required', MCPErrorCode.MISSING_SERVER_ID)
    }

    if (!server.name) {
      throw new MCPConfigError('Server name is required', MCPErrorCode.INVALID_CONFIG)
    }

    if (!server.transport) {
      throw new MCPConfigError(
        `Server "${server.name}": transport is required`,
        MCPErrorCode.MISSING_TRANSPORT
      )
    }

    if (server.transport.type === 'stdio' && !server.transport.command) {
      throw new MCPConfigError(
        `Server "${server.name}": command is required for stdio transport`,
        MCPErrorCode.INVALID_CONFIG
      )
    }

    if (server.transport.type === 'http' && !server.transport.url) {
      throw new MCPConfigError(
        `Server "${server.name}": URL is required for HTTP transport`,
        MCPErrorCode.INVALID_CONFIG
      )
    }
  }

  private inferCategory(name: string, raw: RawServerConfig): MCPServerCategory {
    const searchText = [
      name,
      raw.command,
      ...(raw.args || []),
      raw.description,
    ].filter(Boolean).join(' ').toLowerCase()

    if (/postgres|mysql|sqlite|database|db/.test(searchText)) {
      return 'database'
    }
    if (/filesystem|files?|fs/.test(searchText)) {
      return 'filesystem'
    }
    if (/github|gitlab|git/.test(searchText)) {
      return 'development'
    }
    if (/slack|discord|email|teams/.test(searchText)) {
      return 'communication'
    }
    if (/notion|todoist|asana|jira/.test(searchText)) {
      return 'productivity'
    }
    if (/openai|anthropic|claude|gpt/.test(searchText)) {
      return 'ai'
    }
    if (/api|stripe|supabase/.test(searchText)) {
      return 'api'
    }

    return 'other'
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }
}

/**
 * Singleton parser instance
 */
export const configParser = new MCPConfigParser()
