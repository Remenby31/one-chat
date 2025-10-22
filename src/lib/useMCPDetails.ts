// Hook for fetching and managing MCP server details and capabilities
import { useState, useEffect, useCallback } from 'react'
import type { MCPServer, MCPServerCapabilities, MCPTool } from '@/types/mcp'
import { mcpManager } from './mcpManager'

export function useMCPDetails(server?: MCPServer) {
  const [capabilities, setCapabilities] = useState<MCPServerCapabilities | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch capabilities from server
  const fetchCapabilities = useCallback(async (forceFetch = false) => {
    if (!server) return

    // Use cached data unless force refresh
    if (capabilities && !forceFetch) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const caps = await mcpManager.getServerCapabilities(server.id)
      setCapabilities(caps)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch capabilities'
      setError(errorMsg)
      console.error('[useMCPDetails] Failed to fetch capabilities:', err)
    } finally {
      setIsLoading(false)
    }
  }, [server, capabilities])

  // Call a tool and return result
  const callTool = useCallback(async (toolName: string, args: Record<string, any>) => {
    if (!server) {
      throw new Error('No server available')
    }

    try {
      const result = await mcpManager.callTool(server.id, toolName, args)
      return result
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Tool call failed'
      throw new Error(errorMsg)
    }
  }, [server])

  // Auto-fetch capabilities when server changes
  useEffect(() => {
    if (server && server.status === 'RUNNING') {
      fetchCapabilities()
    }
  }, [server?.id, server?.status, fetchCapabilities])

  return {
    capabilities,
    isLoading,
    error,
    fetchCapabilities,
    callTool,
    tools: capabilities?.tools || [],
    resources: capabilities?.resources || [],
    prompts: capabilities?.prompts || [],
  }
}

// Hook for testing a specific tool with form state
export function useToolTester(server: MCPServer, tool: MCPTool) {
  const [args, setArgs] = useState<Record<string, any>>({})
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  const { callTool } = useMCPDetails(server)

  // Initialize args from schema
  useEffect(() => {
    const initialArgs: Record<string, any> = {}
    const schema = tool.inputSchema

    if (schema.properties) {
      Object.keys(schema.properties).forEach(key => {
        const prop = schema.properties![key]
        // Set default values based on type
        if (prop.default !== undefined) {
          initialArgs[key] = prop.default
        } else if (prop.type === 'string') {
          initialArgs[key] = ''
        } else if (prop.type === 'number' || prop.type === 'integer') {
          initialArgs[key] = 0
        } else if (prop.type === 'boolean') {
          initialArgs[key] = false
        } else if (prop.type === 'array') {
          initialArgs[key] = []
        } else if (prop.type === 'object') {
          initialArgs[key] = {}
        }
      })
    }

    setArgs(initialArgs)
  }, [tool])

  const updateArg = useCallback((key: string, value: any) => {
    setArgs(prev => ({ ...prev, [key]: value }))
  }, [])

  const runTool = useCallback(async () => {
    setIsRunning(true)
    setError(null)
    setResult(null)

    try {
      const toolResult = await callTool(tool.name, args)
      setResult(toolResult)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Tool execution failed'
      setError(errorMsg)
    } finally {
      setIsRunning(false)
    }
  }, [callTool, tool.name, args])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return {
    args,
    updateArg,
    result,
    error,
    isRunning,
    runTool,
    reset,
  }
}
