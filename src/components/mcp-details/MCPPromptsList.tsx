import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Search, MessageSquare, ChevronRight } from "lucide-react"
import type { MCPServer, MCPPrompt } from "@/types/mcp"
import { useMCPDetails } from "@/lib/useMCPDetails"
import { mcpManager } from "@/lib/mcpManager"
import { cn } from "@/lib/utils"

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
        <div className="flex-1 overflow-y-auto scrollbar-none">
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
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 shrink-0" />
                        <span className="font-medium text-sm truncate">{prompt.name}</span>
                        {promptType && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                            {promptType}
                          </span>
                        )}
                      </div>
                      {prompt.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {prompt.description}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
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
        </div>
      </div>

      {/* Prompt Details */}
      <div className="flex-1 border-l pl-4">
        {selectedPrompt ? (
          <div className="h-full overflow-y-auto scrollbar-none">
            <div className="space-y-4">
              {/* Header */}
              <div>
                <h3 className="font-semibold text-lg">{selectedPrompt.name}</h3>
                {selectedPrompt.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedPrompt.description}
                  </p>
                )}
              </div>

              {/* Arguments */}
              {selectedPrompt.arguments && selectedPrompt.arguments.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Arguments</h4>
                  <div className="bg-accent/50 rounded-lg p-3 text-sm">
                    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 items-start">
                      {selectedPrompt.arguments.map((arg, idx) => (
                        <>
                          <span key={`${idx}-name`} className="text-xs font-medium">
                            {arg.name}
                            {arg.required && <span className="text-red-400 ml-0.5">*</span>}
                          </span>
                          <span key={`${idx}-desc`} className="text-xs text-muted-foreground">
                            {arg.description || 'No description'}
                          </span>
                        </>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Content */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Content</h4>
                <div className="bg-accent/50 rounded-lg p-3">
                  {isLoadingContent ? (
                    <p className="text-xs text-muted-foreground">Loading...</p>
                  ) : promptContent ? (
                    <pre className="text-xs whitespace-pre-wrap break-words font-mono">
                      {promptContent}
                    </pre>
                  ) : (
                    <p className="text-xs text-muted-foreground">No content</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Select a prompt to view details</p>
          </div>
        )}
      </div>
    </div>
  )
}
