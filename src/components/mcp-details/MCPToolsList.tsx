import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Search, Wrench, ChevronRight } from "lucide-react"
import type { MCPServer, MCPTool } from "@/types/mcp"
import { useMCPDetails } from "@/lib/useMCPDetails"
import { MCPToolPlayground } from "./MCPToolPlayground"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"

interface MCPToolsListProps {
  server: MCPServer
}

export function MCPToolsList({ server }: MCPToolsListProps) {
  const { tools, isLoading } = useMCPDetails(server)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTool, setSelectedTool] = useState<MCPTool | null>(null)

  // Filter tools by search query
  const filteredTools = tools.filter(tool => {
    const query = searchQuery.toLowerCase()
    return (
      tool.name.toLowerCase().includes(query) ||
      tool.description?.toLowerCase().includes(query)
    )
  })

  // Get parameter count
  const getParamCount = (tool: MCPTool): number => {
    return Object.keys(tool.inputSchema.properties || {}).length
  }

  // Get required parameter count
  const getRequiredParamCount = (tool: MCPTool): number => {
    return tool.inputSchema.required?.length || 0
  }

  if (server.status !== 'RUNNING') {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Server must be running to view tools</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading tools...</p>
      </div>
    )
  }

  if (tools.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No tools available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-4 h-full">
      {/* Tools List */}
      <div className="w-2/5 flex flex-col gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* List */}
        <ScrollArea className="flex-1">
          <div className="space-y-2">
            {filteredTools.map((tool) => (
              <button
                key={tool.name}
                onClick={() => setSelectedTool(tool)}
                className={cn(
                  "w-full text-left p-3 rounded-lg border transition-colors",
                  "hover:border-primary/50 hover:bg-accent/50",
                  selectedTool?.name === tool.name
                    ? "border-primary bg-accent"
                    : "border-border"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 shrink-0" />
                      <span className="font-medium text-sm truncate">{tool.name}</span>
                    </div>
                    {tool.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {tool.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Parameter count badge */}
                    <span className="text-xs px-2 py-0.5 rounded bg-accent text-muted-foreground">
                      {getParamCount(tool)} params
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </button>
            ))}

            {filteredTools.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No tools match your search
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Tool Details & Playground */}
      <div className="flex-1 border-l pl-4">
        {selectedTool ? (
          <MCPToolPlayground server={server} tool={selectedTool} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Select a tool to view details</p>
          </div>
        )}
      </div>
    </div>
  )
}
