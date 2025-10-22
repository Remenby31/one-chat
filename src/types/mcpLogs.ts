// MCP Logging types

export type MCPLogType = 'stdout' | 'stderr' | 'error' | 'jsonrpc' | 'system'

export interface MCPLogEntry {
  id: string
  serverId: string
  type: MCPLogType
  message: string
  timestamp: number
  data?: any // For structured data like JSON-RPC messages
}

export interface MCPLogBuffer {
  serverId: string
  logs: MCPLogEntry[]
  maxSize: number
}

export interface MCPLogFilter {
  types?: MCPLogType[]
  searchText?: string
  startTime?: number
  endTime?: number
}
