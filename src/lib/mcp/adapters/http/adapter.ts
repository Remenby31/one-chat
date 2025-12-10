/**
 * HTTP Process Adapter
 *
 * Provides ProcessAdapter interface for HTTP-based MCP servers.
 */

import type { MCPProcess } from '../types'
import type { MCPHttpTransport } from '../../core/types'
import type { HttpTransportOptions } from './types'
import { HttpMCPClient } from './client'

/**
 * HTTP Process Adapter
 *
 * Adapts HTTP MCP servers to the ProcessAdapter interface.
 * Instead of spawning processes, it creates HTTP connections.
 */
export class HttpProcessAdapter {
  private clients = new Map<string, HttpMCPClient>()

  /**
   * Create a new HTTP connection to an MCP server
   */
  async connect(
    id: string,
    config: MCPHttpTransport,
    accessToken?: string
  ): Promise<MCPProcess> {
    // Close existing connection if any
    if (this.clients.has(id)) {
      await this.disconnect(id)
    }

    const options: HttpTransportOptions = {
      url: config.url,
      headers: config.headers,
      accessToken,
    }

    const client = new HttpMCPClient(id, options)
    this.clients.set(id, client)

    // Connect
    await client.connect()

    // Remove from map when connection closes
    client.onExit(() => {
      this.clients.delete(id)
    })

    return client
  }

  /**
   * Get an existing HTTP client by ID
   */
  get(id: string): HttpMCPClient | undefined {
    return this.clients.get(id)
  }

  /**
   * Disconnect an HTTP client by ID
   */
  async disconnect(id: string): Promise<void> {
    const client = this.clients.get(id)
    if (client) {
      await client.kill()
      this.clients.delete(id)
    }
  }

  /**
   * Disconnect all HTTP clients
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.clients.keys()).map((id) =>
      this.disconnect(id)
    )
    await Promise.all(disconnectPromises)
  }

  /**
   * Check if a client is connected
   */
  isConnected(id: string): boolean {
    const client = this.clients.get(id)
    return client?.isRunning ?? false
  }
}

/**
 * Create HTTP transport options from MCP server config
 */
export function createHttpTransportOptions(
  transport: MCPHttpTransport,
  accessToken?: string
): HttpTransportOptions {
  return {
    url: transport.url,
    headers: transport.headers,
    accessToken,
  }
}
