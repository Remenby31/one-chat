/**
 * HTTP MCP Client
 *
 * Implements MCP communication over HTTP/SSE transport.
 * Supports both SSE (Server-Sent Events) and Streamable HTTP patterns.
 */

import type { MCPProcess } from '../types'
import type { JSONRPCMessage, JSONRPCRequest, JSONRPCResponse } from '../../core/types'
import type {
  HttpTransportOptions,
  HttpTransportEvents,
  HttpConnectionState,
  MCPInitializeResponse,
} from './types'
import { MCPCommunicationError, MCPErrorCode } from '../../core/errors'

/**
 * Default options
 */
const DEFAULT_OPTIONS = {
  connectionTimeout: 30000,
  requestTimeout: 60000,
  autoReconnect: true,
  reconnectDelay: 1000,
  maxReconnectAttempts: 5,
  sseEndpoint: '/sse',
  messagesEndpoint: '/messages',
} as const

/**
 * HTTP MCP Client
 *
 * Provides MCP communication over HTTP transport with SSE for server-to-client
 * messages and POST for client-to-server messages.
 */
/**
 * Internal options type
 */
interface InternalOptions {
  url: string
  headers?: Record<string, string>
  accessToken?: string
  connectionTimeout: number
  requestTimeout: number
  autoReconnect: boolean
  reconnectDelay: number
  maxReconnectAttempts: number
  sseEndpoint: string
  messagesEndpoint: string
}

export class HttpMCPClient implements MCPProcess {
  readonly id: string
  private options: InternalOptions
  private state: HttpConnectionState = 'disconnected'
  private eventSource: EventSource | null = null
  private messageCallbacks = new Set<(message: JSONRPCMessage) => void>()
  private stderrCallbacks = new Set<(data: string) => void>()
  private exitCallbacks = new Set<(code: number | null) => void>()
  private stateCallbacks = new Set<(state: HttpConnectionState) => void>()
  private pendingRequests = new Map<string | number, {
    resolve: (response: JSONRPCResponse) => void
    reject: (error: Error) => void
    timeout: ReturnType<typeof setTimeout>
  }>()
  private requestId = 0
  private reconnectAttempts = 0
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private sessionId: string | null = null
  private serverCapabilities: MCPInitializeResponse['capabilities'] | null = null

  constructor(id: string, options: HttpTransportOptions, events?: HttpTransportEvents) {
    this.id = id
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    }

    // Register event handlers
    if (events?.onStateChange) this.stateCallbacks.add(events.onStateChange)
    if (events?.onMessage) this.messageCallbacks.add(events.onMessage)
    if (events?.onError) {
      this.stderrCallbacks.add((data) => events.onError!(new Error(data)))
    }
    if (events?.onClose) {
      this.exitCallbacks.add((code) => events.onClose!(code !== null ? `Exit code: ${code}` : undefined))
    }
  }

  get isRunning(): boolean {
    return this.state === 'connected'
  }

  get connectionState(): HttpConnectionState {
    return this.state
  }

  get capabilities(): MCPInitializeResponse['capabilities'] | null {
    return this.serverCapabilities
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return
    }

    this.setState('connecting')

    try {
      // Initialize the MCP connection
      const initResponse = await this.initialize()
      this.serverCapabilities = initResponse.capabilities

      // Set up SSE connection for server-to-client messages
      await this.setupSSE()

      this.setState('connected')
      this.reconnectAttempts = 0
    } catch (error) {
      this.setState('error')
      throw error
    }
  }

  /**
   * Initialize MCP connection
   */
  private async initialize(): Promise<MCPInitializeResponse> {
    const params = {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'Jarvis MCP Client',
        version: '1.0.0',
      },
    }

    const response = await this.sendRequest('initialize', params as Record<string, unknown>)

    if (!response.result) {
      throw new MCPCommunicationError(
        'Initialize failed: no result',
        MCPErrorCode.CONNECTION_FAILED,
        { serverId: this.id }
      )
    }

    // Send initialized notification
    await this.sendNotification('notifications/initialized', {})

    return response.result as MCPInitializeResponse
  }

  /**
   * Set up SSE connection
   */
  private async setupSSE(): Promise<void> {
    const sseUrl = this.buildUrl(this.options.sseEndpoint)

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new MCPCommunicationError(
          'SSE connection timeout',
          MCPErrorCode.CONNECTION_TIMEOUT,
          { serverId: this.id }
        ))
      }, this.options.connectionTimeout)

      // Create EventSource with custom headers via fetch polyfill approach
      // Note: Native EventSource doesn't support custom headers
      // For OAuth, we need to use a different approach
      this.connectSSEWithAuth(sseUrl)
        .then(() => {
          clearTimeout(timeout)
          resolve()
        })
        .catch((error) => {
          clearTimeout(timeout)
          reject(error)
        })
    })
  }

  /**
   * Connect SSE with authentication support
   */
  private async connectSSEWithAuth(url: string): Promise<void> {
    // For servers that support query param auth
    const urlWithSession = this.sessionId
      ? `${url}${url.includes('?') ? '&' : '?'}session=${this.sessionId}`
      : url

    // Use fetch-based SSE reader for better auth support
    const headers: Record<string, string> = {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...this.options.headers,
    }

    if (this.options.accessToken) {
      headers['Authorization'] = `Bearer ${this.options.accessToken}`
    }

    const response = await fetch(urlWithSession, {
      method: 'GET',
      headers,
      credentials: 'include',
    })

    if (!response.ok) {
      throw new MCPCommunicationError(
        `SSE connection failed: ${response.status} ${response.statusText}`,
        response.status === 401 ? MCPErrorCode.AUTH_REQUIRED : MCPErrorCode.CONNECTION_FAILED,
        { serverId: this.id }
      )
    }

    if (!response.body) {
      throw new MCPCommunicationError(
        'SSE response has no body',
        MCPErrorCode.CONNECTION_FAILED,
        { serverId: this.id }
      )
    }

    // Read SSE stream
    this.readSSEStream(response.body)
  }

  /**
   * Read SSE stream
   */
  private async readSSEStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const processEvents = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            this.handleSSEClose()
            break
          }

          buffer += decoder.decode(value, { stream: true })

          // Process complete events
          const events = buffer.split('\n\n')
          buffer = events.pop() || ''

          for (const eventStr of events) {
            if (eventStr.trim()) {
              this.processSSEEvent(eventStr)
            }
          }
        }
      } catch (error) {
        this.handleSSEError(error instanceof Error ? error : new Error(String(error)))
      }
    }

    // Start processing in background
    processEvents()
  }

  /**
   * Process a single SSE event
   */
  private processSSEEvent(eventStr: string): void {
    const lines = eventStr.split('\n')
    let eventType = 'message'
    let data = ''

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        data += line.slice(5).trim()
      }
      // Note: 'id:' is parsed but not used currently
    }

    if (!data) return

    try {
      const message = JSON.parse(data) as JSONRPCMessage

      // Handle session ID if provided
      if (eventType === 'session' && 'sessionId' in message) {
        this.sessionId = (message as unknown as { sessionId: string }).sessionId
        return
      }

      // Handle JSON-RPC response
      if ('id' in message && message.id !== undefined && message.id !== null) {
        const messageId = message.id as string | number
        const pending = this.pendingRequests.get(messageId)
        if (pending) {
          clearTimeout(pending.timeout)
          this.pendingRequests.delete(messageId)
          if ('error' in message && message.error) {
            pending.reject(new MCPCommunicationError(
              message.error.message,
              MCPErrorCode.JSONRPC_ERROR,
              { serverId: this.id }
            ))
          } else {
            pending.resolve(message as JSONRPCResponse)
          }
          return
        }
      }

      // Notify message listeners
      this.messageCallbacks.forEach((cb) => cb(message))
    } catch {
      // Log parse error but don't throw
      this.stderrCallbacks.forEach((cb) => cb(`Failed to parse SSE event: ${data}`))
    }
  }

  /**
   * Handle SSE connection close
   */
  private handleSSEClose(): void {
    if (this.state === 'connected' && this.options.autoReconnect) {
      this.scheduleReconnect()
    } else {
      this.setState('disconnected')
      this.exitCallbacks.forEach((cb) => cb(0))
    }
  }

  /**
   * Handle SSE error
   */
  private handleSSEError(error: Error): void {
    this.stderrCallbacks.forEach((cb) => cb(error.message))

    if (this.options.autoReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this.scheduleReconnect()
    } else {
      this.setState('error')
      this.exitCallbacks.forEach((cb) => cb(1))
    }
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return

    this.setState('reconnecting')
    this.reconnectAttempts++

    const delay = this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null
      try {
        await this.connect()
      } catch {
        if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.scheduleReconnect()
        } else {
          this.setState('error')
          this.exitCallbacks.forEach((cb) => cb(1))
        }
      }
    }, delay)
  }

  /**
   * Send a JSON-RPC request and wait for response
   */
  async sendRequest(method: string, params?: Record<string, unknown>): Promise<JSONRPCResponse> {
    const id = ++this.requestId
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new MCPCommunicationError(
          `Request timeout: ${method}`,
          MCPErrorCode.REQUEST_TIMEOUT,
          { serverId: this.id }
        ))
      }, this.options.requestTimeout)

      this.pendingRequests.set(id, { resolve, reject, timeout })

      this.sendMessage(request).catch((error) => {
        clearTimeout(timeout)
        this.pendingRequests.delete(id)
        reject(error)
      })
    })
  }

  /**
   * Send a JSON-RPC notification (no response expected)
   */
  async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    await this.sendMessage({
      jsonrpc: '2.0',
      method,
      params,
    })
  }

  /**
   * Send a JSON-RPC message
   */
  async send(message: JSONRPCMessage): Promise<void> {
    await this.sendMessage(message)
  }

  /**
   * Internal send message
   */
  private async sendMessage(message: JSONRPCMessage): Promise<void> {
    const url = this.buildUrl(this.options.messagesEndpoint)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.options.headers,
    }

    if (this.options.accessToken) {
      headers['Authorization'] = `Bearer ${this.options.accessToken}`
    }

    if (this.sessionId) {
      headers['X-Session-Id'] = this.sessionId
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(message),
      credentials: 'include',
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText)
      throw new MCPCommunicationError(
        `HTTP request failed: ${response.status} ${errorText}`,
        response.status === 401 ? MCPErrorCode.AUTH_REQUIRED : MCPErrorCode.JSONRPC_ERROR,
        { serverId: this.id }
      )
    }

    // Some servers respond with JSON-RPC response in body
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      const responseData = await response.json()
      if ('id' in message && responseData.id === message.id) {
        // Handle inline response
        const pending = this.pendingRequests.get(message.id as string | number)
        if (pending) {
          clearTimeout(pending.timeout)
          this.pendingRequests.delete(message.id as string | number)
          if (responseData.error) {
            pending.reject(new MCPCommunicationError(
              responseData.error.message,
              MCPErrorCode.JSONRPC_ERROR,
              { serverId: this.id }
            ))
          } else {
            pending.resolve(responseData)
          }
        }
      }
    }
  }

  /**
   * Build full URL from base and path
   */
  private buildUrl(path: string): string {
    const base = this.options.url.replace(/\/$/, '')
    return `${base}${path}`
  }

  /**
   * Set connection state
   */
  private setState(state: HttpConnectionState): void {
    this.state = state
    this.stateCallbacks.forEach((cb) => cb(state))
  }

  // ==========================================================================
  // MCPProcess interface implementation
  // ==========================================================================

  onMessage(callback: (message: JSONRPCMessage) => void): () => void {
    this.messageCallbacks.add(callback)
    return () => this.messageCallbacks.delete(callback)
  }

  onStderr(callback: (data: string) => void): () => void {
    this.stderrCallbacks.add(callback)
    return () => this.stderrCallbacks.delete(callback)
  }

  onExit(callback: (code: number | null) => void): () => void {
    this.exitCallbacks.add(callback)
    return () => this.exitCallbacks.delete(callback)
  }

  onStateChange(callback: (state: HttpConnectionState) => void): () => void {
    this.stateCallbacks.add(callback)
    return () => this.stateCallbacks.delete(callback)
  }

  async kill(): Promise<void> {
    // Cancel pending requests
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout)
      reject(new MCPCommunicationError(
        'Connection closed',
        MCPErrorCode.CONNECTION_CLOSED,
        { serverId: this.id }
      ))
    })
    this.pendingRequests.clear()

    // Cancel reconnect
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    // Close EventSource if using native
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }

    this.setState('disconnected')
    this.exitCallbacks.forEach((cb) => cb(0))
  }

  // ==========================================================================
  // MCP API Methods
  // ==========================================================================

  /**
   * List available tools
   */
  async listTools(): Promise<Array<{ name: string; description?: string; inputSchema: unknown }>> {
    const response = await this.sendRequest('tools/list', {})
    const result = response.result as { tools?: Array<{ name: string; description?: string; inputSchema: unknown }> }
    return result?.tools || []
  }

  /**
   * Call a tool
   */
  async callTool(name: string, args: unknown): Promise<unknown> {
    const response = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    })
    return response.result
  }

  /**
   * List available resources
   */
  async listResources(): Promise<Array<{ uri: string; name: string; mimeType?: string; description?: string }>> {
    const response = await this.sendRequest('resources/list', {})
    const result = response.result as { resources?: Array<{ uri: string; name: string; mimeType?: string; description?: string }> }
    return result?.resources || []
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<unknown> {
    const response = await this.sendRequest('resources/read', { uri })
    return response.result
  }

  /**
   * List available prompts
   */
  async listPrompts(): Promise<Array<{ name: string; description?: string; arguments?: unknown[] }>> {
    const response = await this.sendRequest('prompts/list', {})
    const result = response.result as { prompts?: Array<{ name: string; description?: string; arguments?: unknown[] }> }
    return result?.prompts || []
  }

  /**
   * Get a prompt
   */
  async getPrompt(name: string, args?: Record<string, unknown>): Promise<unknown> {
    const response = await this.sendRequest('prompts/get', {
      name,
      arguments: args,
    })
    return response.result
  }

  /**
   * Set logging level
   */
  async setLoggingLevel(level: 'debug' | 'info' | 'warning' | 'error'): Promise<void> {
    await this.sendRequest('logging/setLevel', { level })
  }
}
