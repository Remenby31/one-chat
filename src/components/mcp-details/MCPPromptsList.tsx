import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Search, MessageSquare, ChevronRight, Info } from "lucide-react"
import type { MCPServer, MCPPrompt } from "@/types/mcp"
import { useMCPDetails } from "@/lib/useMCPDetails"
import { mcpManager } from "@/lib/mcpManager"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

interface MCPPromptsListProps {
  server: MCPServer
}

export function MCPPromptsList({ server }: MCPPromptsListProps) {
  const { prompts, isLoading } = useMCPDetails(server)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedPrompt, setSelectedPrompt] = useState<MCPPrompt | null>(null)
  const [promptContent, setPromptContent] = useState<string | null>(null)
  const [isLoadingContent, setIsLoadingContent] = useState(false)

  // Load prompt content when selected
  useEffect(() => {
    if (!selectedPrompt) {
      setPromptContent(null)
      return
    }

    const loadContent = async () => {
      setIsLoadingContent(true)
      try {
        const content = await mcpManager.getPromptContent(server.id, selectedPrompt.name)
        setPromptContent(content)
      } catch (error) {
        console.error('[MCPPromptsList] Failed to load prompt content:', error)
        setPromptContent(`Error loading content: ${error instanceof Error ? error.message : 'Unknown error'}`)
      } finally {
        setIsLoadingContent(false)
      }
    }

    loadContent()
  }, [selectedPrompt, server.id])

  // Filter prompts by search query
  const filteredPrompts = prompts.filter(prompt => {
    const query = searchQuery.toLowerCase()
    return (
      prompt.name.toLowerCase().includes(query) ||
      prompt.description?.toLowerCase().includes(query)
    )
  })

  // Get argument count
  const getArgCount = (prompt: MCPPrompt): number => {
    return prompt.arguments?.length || 0
  }

  // Detect conventional prompt type from name
  const getPromptType = (name: string): string | null => {
    const normalized = name.toLowerCase().trim()
    if (normalized === 'system_prompt') return 'System'
    if (normalized === 'tool_instructions') return 'Tool Instructions'
    if (normalized === 'user_prompt') return 'User Context'
    if (normalized === 'assistant_prompt') return 'Assistant'
    if (normalized.startsWith('tool_call')) return 'Tool Call'
    if (normalized.startsWith('tool_result') || normalized.startsWith('tool_answer')) return 'Tool Result'
    return null
  }

  if (server.state !== 'connected') {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Server must be connected to view prompts</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading prompts...</p>
      </div>
    )
  }

  if (prompts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No prompts available</p>
          <p className="text-xs text-muted-foreground mt-1">
            This server does not expose any prompts
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-4 h-full">
      {/* Prompts List */}
      <div className="w-2/5 flex flex-col gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search prompts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* List */}
        <ScrollArea className="flex-1">
          <div className="space-y-2">
            {filteredPrompts.map((prompt) => {
              const promptType = getPromptType(prompt.name)
              return (
                <button
                  key={prompt.name}
                  onClick={() => setSelectedPrompt(prompt)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-colors",
                    "hover:border-primary/50 hover:bg-accent/50",
                    selectedPrompt?.name === prompt.name
                      ? "border-primary bg-accent"
                      : "border-border"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <MessageSquare className="h-4 w-4 shrink-0" />
                        <span className="font-medium text-sm truncate">{prompt.name}</span>
                      </div>
                      {promptType && (
                        <Badge variant="secondary" className="text-xs mb-1">
                          {promptType}
                        </Badge>
                      )}
                      {prompt.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {prompt.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Argument count badge */}
                      {getArgCount(prompt) > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded bg-accent text-muted-foreground">
                          {getArgCount(prompt)} args
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </button>
              )
            })}

            {filteredPrompts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No prompts match your search
              </p>
            )}
          </div>
        </ScrollArea>

        {/* Count */}
        <div className="text-xs text-muted-foreground">
          Showing {filteredPrompts.length} of {prompts.length} prompts
        </div>
      </div>

      {/* Prompt Details */}
      <div className="flex-1 border-l pl-4">
        {selectedPrompt ? (
          <ScrollArea className="h-full">
            <div className="space-y-4">
              {/* Header */}
              <div>
                <div className="flex items-start gap-3 mb-2">
                  <MessageSquare className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{selectedPrompt.name}</h3>
                    {getPromptType(selectedPrompt.name) && (
                      <Badge variant="secondary" className="mt-1">
                        {getPromptType(selectedPrompt.name)}
                      </Badge>
                    )}
                  </div>
                </div>

                {selectedPrompt.description && (
                  <p className="text-sm text-muted-foreground ml-8">
                    {selectedPrompt.description}
                  </p>
                )}
              </div>

              {/* Conventional Prompt Info */}
              {getPromptType(selectedPrompt.name) && (
                <div className="ml-8 p-3 border rounded-lg bg-accent/50">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                    <div className="text-xs space-y-1">
                      <p className="font-medium">Conventional Prompt</p>
                      <p className="text-muted-foreground">
                        This prompt is automatically injected into conversations based on its name.
                        {getPromptType(selectedPrompt.name) === 'System' &&
                          " It will be added as a system message at the start."}
                        {getPromptType(selectedPrompt.name) === 'User Context' &&
                          " It will be added as initial user context."}
                        {getPromptType(selectedPrompt.name) === 'Tool Instructions' &&
                          " It will be concatenated to the system prompt."}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Arguments */}
              {selectedPrompt.arguments && selectedPrompt.arguments.length > 0 && (
                <div className="ml-8">
                  <h4 className="font-medium text-sm mb-2">Arguments</h4>
                  <div className="space-y-2">
                    {selectedPrompt.arguments.map((arg, idx) => (
                      <div key={idx} className="border rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-sm font-mono font-semibold">{arg.name}</code>
                          {arg.required && (
                            <Badge variant="destructive" className="text-xs">
                              Required
                            </Badge>
                          )}
                        </div>
                        {arg.description && (
                          <p className="text-xs text-muted-foreground">
                            {arg.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No Arguments */}
              {(!selectedPrompt.arguments || selectedPrompt.arguments.length === 0) && (
                <div className="ml-8 p-3 border rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    This prompt does not accept any arguments
                  </p>
                </div>
              )}

              {/* Prompt Content */}
              <div className="ml-8">
                <h4 className="font-medium text-sm mb-2">Content Preview</h4>
                <div className="border rounded-lg p-3 bg-muted/30">
                  {isLoadingContent ? (
                    <p className="text-sm text-muted-foreground">Loading content...</p>
                  ) : promptContent ? (
                    <pre className="text-xs whitespace-pre-wrap break-words font-mono max-h-96 overflow-y-auto">
                      {promptContent}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground">No content available</p>
                  )}
                </div>
              </div>

              {/* Usage Info */}
              <div className="ml-8 p-3 border rounded-lg bg-muted/50">
                <h4 className="font-medium text-sm mb-2">Usage</h4>
                <p className="text-xs text-muted-foreground">
                  Prompts can be invoked manually or automatically injected into conversations
                  based on naming conventions (system_prompt, user_prompt, etc.).
                </p>
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Select a prompt to view details</p>
          </div>
        )}
      </div>
    </div>
  )
}
