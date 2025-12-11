import { useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Zap, AlertCircle } from 'lucide-react'
import type { MCPServer } from '@/types/mcp'
import { mcpManager } from '@/lib/mcpManager'
import { detectPromptType, type ConventionalPromptType } from '@/lib/mcpPromptInjection'

interface InjectedPrompt {
  name: string
  type: ConventionalPromptType
  content: string
  description?: string
}

const TYPE_LABELS: Record<ConventionalPromptType, { label: string; description: string; color: string }> = {
  system_prompt: {
    label: 'System Prompt',
    description: 'Merged with thread system prompt',
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20'
  },
  tool_instructions: {
    label: 'Tool Instructions',
    description: 'Concatenated to system prompt',
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
  },
  user_prompt: {
    label: 'User Context',
    description: 'Injected before conversation',
    color: 'bg-green-500/10 text-green-400 border-green-500/20'
  },
  assistant_prompt: {
    label: 'Assistant Prefill',
    description: 'Response example/guidance',
    color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
  },
  tool_call: {
    label: 'Tool Call Example',
    description: 'Demonstrates tool usage',
    color: 'bg-orange-500/10 text-orange-400 border-orange-500/20'
  },
  tool_result: {
    label: 'Tool Result Example',
    description: 'Shows expected tool output',
    color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
  }
}

interface MCPInjectedPromptsProps {
  server: MCPServer
}

export function MCPInjectedPrompts({ server }: MCPInjectedPromptsProps) {
  const [injectedPrompts, setInjectedPrompts] = useState<InjectedPrompt[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (server.state !== 'connected') {
      setInjectedPrompts([])
      setIsLoading(false)
      return
    }

    const loadInjectedPrompts = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const prompts = await mcpManager.listPromptsFromServer(server.id)

        // Filter and detect conventional prompts
        const conventional: InjectedPrompt[] = prompts
          .map(prompt => {
            const type = detectPromptType(prompt.name)
            if (!type) return null

            return {
              name: prompt.name,
              type,
              content: '', // Will be loaded on expand
              description: prompt.description
            } as InjectedPrompt
          })
          .filter((p): p is InjectedPrompt => p !== null)

        setInjectedPrompts(conventional)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load prompts')
      } finally {
        setIsLoading(false)
      }
    }

    loadInjectedPrompts()
  }, [server])

  if (server.state !== 'connected') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            Server must be connected to view injected prompts
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </div>
    )
  }

  if (injectedPrompts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <Zap className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">No Auto-Injected Prompts</p>
          <p className="text-xs text-muted-foreground max-w-md">
            This server doesn't define any conventional prompts (system_prompt, user_prompt, tool_call, etc.)
            that would be automatically injected into conversations.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3">
        {/* Header */}
        <div className="rounded-lg border bg-accent/30 p-4">
          <div className="flex items-start gap-3">
            <Zap className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-sm mb-1">Auto-Injection System</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                These prompts are automatically injected into every conversation when this server is connected.
                They provide context, instructions, and examples to guide the AI's behavior.
              </p>
            </div>
          </div>
        </div>

        {/* Prompts List */}
        <div className="space-y-2">
          {injectedPrompts.map((prompt, index) => {
            const typeInfo = prompt.type ? TYPE_LABELS[prompt.type] : null

            return (
              <div
                key={`${prompt.name}-${index}`}
                className="rounded-lg border p-4 space-y-2"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">{prompt.name}</h4>
                    {prompt.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {prompt.description}
                      </p>
                    )}
                  </div>

                  {typeInfo && (
                    <div className={`px-2 py-1 rounded text-xs font-medium border whitespace-nowrap ${typeInfo.color}`}>
                      {typeInfo.label}
                    </div>
                  )}
                </div>

                {/* Type Description */}
                {typeInfo && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Injection: </span>
                    {typeInfo.description}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer Info */}
        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium">Injection Order:</p>
          <ol className="list-decimal list-inside space-y-0.5 ml-1">
            <li>System prompts are merged with thread system prompt</li>
            <li>User context prompts are prepended to conversation</li>
            <li>Tool call/result examples demonstrate usage patterns</li>
            <li>Assistant prefills guide response style</li>
          </ol>
        </div>
      </div>
    </ScrollArea>
  )
}

// Export the detect function for reuse
export { detectPromptType }
