import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Search, FileText, Link as LinkIcon } from "lucide-react"
import type { MCPServer, MCPResource } from "@/types/mcp"
import { useMCPDetails } from "@/lib/useMCPDetails"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MCPResourceViewer } from "./MCPResourceViewer"
import { cn } from "@/lib/utils"

interface MCPResourcesListProps {
  server: MCPServer
}

export function MCPResourcesList({ server }: MCPResourcesListProps) {
  const { resources, isLoading } = useMCPDetails(server)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedResource, setSelectedResource] = useState<MCPResource | null>(null)

  // Filter resources by search query
  const filteredResources = resources.filter(resource => {
    const query = searchQuery.toLowerCase()
    return (
      resource.name.toLowerCase().includes(query) ||
      resource.uri.toLowerCase().includes(query) ||
      resource.description?.toLowerCase().includes(query)
    )
  })

  if (server.state !== 'connected') {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Server must be connected to view resources</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading resources...</p>
      </div>
    )
  }

  if (resources.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No resources available</p>
          <p className="text-xs text-muted-foreground mt-1">
            This server does not expose any resources
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-4 h-full">
      {/* List (left side - 40%) */}
      <div className="w-2/5 flex flex-col gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search resources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Resources List */}
        <ScrollArea className="flex-1">
          <div className="space-y-3">
            {filteredResources.map((resource, index) => (
              <button
                key={`${resource.uri}-${index}`}
                onClick={() => setSelectedResource(resource)}
                className={cn(
                  "w-full text-left border rounded-lg p-4 transition-colors",
                  "hover:border-primary/50 hover:bg-accent/50",
                  selectedResource?.uri === resource.uri
                    ? "border-primary bg-accent"
                    : "border-border"
                )}
              >
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 shrink-0 mt-0.5 text-primary" />

                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm mb-1">{resource.name}</h4>

                    {resource.description && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {resource.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-xs">
                      <LinkIcon className="h-3 w-3" />
                      <code className="bg-accent px-2 py-0.5 rounded font-mono">
                        {resource.uri}
                      </code>
                    </div>

                    {resource.mimeType && (
                      <div className="mt-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-accent text-muted-foreground">
                          {resource.mimeType}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}

            {filteredResources.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No resources match your search
              </p>
            )}
          </div>
        </ScrollArea>

        {/* Count */}
        <div className="text-xs text-muted-foreground">
          Showing {filteredResources.length} of {resources.length} resources
        </div>
      </div>

      {/* Viewer (right side - 60%) */}
      <div className="w-3/5 border rounded-lg overflow-hidden">
        {selectedResource ? (
          <MCPResourceViewer
            serverId={server.id}
            resource={selectedResource}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Select a resource to view its content</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
