// Hook for managing MCP server logs in the renderer
import { useState, useEffect, useCallback } from 'react'
import type { MCPLogEntry, MCPLogFilter } from '@/types/mcpLogs'

export function useMCPLogs(serverId?: string) {
  const [logs, setLogs] = useState<Map<string, MCPLogEntry[]>>(new Map())
  const [isLoading, setIsLoading] = useState(false)

  // Load initial logs for a server
  const loadLogs = useCallback(async (serverIdToLoad: string) => {
    if (!window.electronAPI?.mcpGetLogs) {
      console.warn('MCP logs not available in browser mode')
      return
    }

    setIsLoading(true)
    try {
      const result = await window.electronAPI.mcpGetLogs(serverIdToLoad)
      setLogs(prev => {
        const next = new Map(prev)
        next.set(serverIdToLoad, result)
        return next
      })
    } catch (error) {
      console.error('[useMCPLogs] Failed to load logs:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Clear logs for a server
  const clearLogs = useCallback(async (serverIdToClear: string) => {
    if (!window.electronAPI?.mcpClearLogs) return

    try {
      await window.electronAPI.mcpClearLogs(serverIdToClear)
      setLogs(prev => {
        const next = new Map(prev)
        next.set(serverIdToClear, [])
        return next
      })
    } catch (error) {
      console.error('[useMCPLogs] Failed to clear logs:', error)
    }
  }, [])

  // Filter logs
  const filterLogs = useCallback((serverLogs: MCPLogEntry[], filter: MCPLogFilter): MCPLogEntry[] => {
    let filtered = serverLogs

    // Filter by type
    if (filter.types && filter.types.length > 0) {
      filtered = filtered.filter(log => filter.types!.includes(log.type))
    }

    // Filter by search text
    if (filter.searchText) {
      const search = filter.searchText.toLowerCase()
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(search) ||
        (log.data && JSON.stringify(log.data).toLowerCase().includes(search))
      )
    }

    // Filter by time range
    if (filter.startTime) {
      filtered = filtered.filter(log => log.timestamp >= filter.startTime!)
    }
    if (filter.endTime) {
      filtered = filtered.filter(log => log.timestamp <= filter.endTime!)
    }

    return filtered
  }, [])

  // Export logs as JSON or text
  const exportLogs = useCallback((serverIdToExport: string, format: 'json' | 'text' = 'json') => {
    const serverLogs = logs.get(serverIdToExport) || []

    if (format === 'json') {
      const json = JSON.stringify(serverLogs, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mcp-logs-${serverIdToExport}-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } else {
      const text = serverLogs.map(log => {
        const date = new Date(log.timestamp).toISOString()
        return `[${date}] [${log.type.toUpperCase()}] ${log.message}`
      }).join('\n')
      const blob = new Blob([text], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mcp-logs-${serverIdToExport}-${Date.now()}.txt`
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [logs])

  // Subscribe to real-time log updates
  useEffect(() => {
    if (!window.electronAPI?.onMCPLog) return

    const cleanup = window.electronAPI.onMCPLog((log: MCPLogEntry) => {
      setLogs(prev => {
        const next = new Map(prev)
        const serverLogs = next.get(log.serverId) || []
        next.set(log.serverId, [...serverLogs, log])
        return next
      })
    })

    return cleanup
  }, [])

  // Auto-load logs for specified server
  useEffect(() => {
    if (serverId) {
      loadLogs(serverId)
    }
  }, [serverId, loadLogs])

  return {
    logs,
    isLoading,
    loadLogs,
    clearLogs,
    filterLogs,
    exportLogs,
    getServerLogs: (id: string) => logs.get(id) || [],
  }
}
