import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Trash2, Download, Search, ToggleLeft, ToggleRight } from "lucide-react"
import type { MCPServer } from "@/types/mcp"
import type { MCPLogType, MCPLogFilter } from "@/types/mcpLogs"
import { useMCPLogs } from "@/lib/useMCPLogs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface MCPServerLogsProps {
  server: MCPServer
}

export function MCPServerLogs({ server }: MCPServerLogsProps) {
  const { getServerLogs, clearLogs, filterLogs, exportLogs } = useMCPLogs(server.id)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTypes, setSelectedTypes] = useState<MCPLogType[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  const allLogs = getServerLogs(server.id)

  // Apply filters
  const filter: MCPLogFilter = {
    types: selectedTypes.length > 0 ? selectedTypes : undefined,
    searchText: searchQuery || undefined,
  }
  const filteredLogs = filterLogs(allLogs, filter)

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filteredLogs, autoScroll])

  const handleClear = async () => {
    await clearLogs(server.id)
    toast.success('Logs cleared')
  }

  const handleExportJSON = () => {
    exportLogs(server.id, 'json')
    toast.success('Logs exported as JSON')
  }

  const handleExportText = () => {
    exportLogs(server.id, 'text')
    toast.success('Logs exported as text')
  }

  const toggleType = (type: MCPLogType) => {
    setSelectedTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    )
  }

  const getTypeColor = (type: MCPLogType): string => {
    switch (type) {
      case 'stdout':
        return 'text-blue-400'
      case 'stderr':
        return 'text-orange-400'
      case 'error':
        return 'text-red-400'
      case 'jsonrpc':
        return 'text-purple-400'
      case 'system':
        return 'text-green-400'
      default:
        return 'text-gray-400'
    }
  }

  const getTypeBadgeColor = (type: MCPLogType): string => {
    switch (type) {
      case 'stdout':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'stderr':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      case 'error':
        return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'jsonrpc':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
      case 'system':
        return 'bg-green-500/20 text-green-400 border-green-500/30'
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
  }

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    })
  }

  const logTypes: MCPLogType[] = ['stdout', 'stderr', 'error', 'jsonrpc', 'system']

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Auto-scroll toggle */}
        <Button
          onClick={() => setAutoScroll(!autoScroll)}
          variant="outline"
          size="sm"
          title={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}
        >
          {autoScroll ? (
            <ToggleRight className="h-4 w-4" />
          ) : (
            <ToggleLeft className="h-4 w-4" />
          )}
        </Button>

        {/* Clear */}
        <Button
          onClick={handleClear}
          variant="outline"
          size="sm"
          title="Clear logs"
        >
          <Trash2 className="h-4 w-4" />
        </Button>

        {/* Export dropdown */}
        <Button
          onClick={handleExportJSON}
          variant="outline"
          size="sm"
          title="Export as JSON"
        >
          <Download className="h-4 w-4 mr-1" />
          JSON
        </Button>

        <Button
          onClick={handleExportText}
          variant="outline"
          size="sm"
          title="Export as text"
        >
          <Download className="h-4 w-4 mr-1" />
          TXT
        </Button>
      </div>

      {/* Type Filters */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Filter:</span>
        {logTypes.map(type => (
          <button
            key={type}
            onClick={() => toggleType(type)}
            className={cn(
              "px-2 py-1 rounded text-xs border transition-colors",
              selectedTypes.includes(type) || selectedTypes.length === 0
                ? getTypeBadgeColor(type)
                : "bg-accent/30 text-muted-foreground border-border opacity-50"
            )}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Logs Display */}
      <ScrollArea className="flex-1 border rounded-lg bg-black/20" ref={scrollRef}>
        <div className="p-3 space-y-1 font-mono text-xs">
          {filteredLogs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {allLogs.length === 0 ? 'No logs yet' : 'No logs match your filters'}
            </p>
          ) : (
            filteredLogs.map(log => (
              <div
                key={log.id}
                className="flex gap-2 hover:bg-accent/30 px-2 py-1 rounded"
              >
                <span className="text-muted-foreground shrink-0">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span className={cn("shrink-0 font-semibold uppercase min-w-[60px]", getTypeColor(log.type))}>
                  [{log.type}]
                </span>
                <span className="flex-1 break-all whitespace-pre-wrap">
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Stats */}
      <div className="text-xs text-muted-foreground">
        Showing {filteredLogs.length} of {allLogs.length} logs
      </div>
    </div>
  )
}
