import { useEffect, useState } from 'react'
import { Loader2, Zap } from 'lucide-react'
import type { MCPServer } from '@/types/mcp'
import { mcpManager } from '@/lib/mcpManager'
import { detectPromptType, type ConventionalPromptType } from '@/lib/mcpPromptInjection'

interface InjectedPrompt {
  name: string
  type: ConventionalPromptType
  description?: string
}

const TYPE_LABELS: Record<ConventionalPromptType, string> = {
  system_prompt: 'System',
  tool_instructions: 'Instructions',
  user_prompt: 'User',
  assistant_prompt: 'Assistant',
  tool_call: 'Tool Call',
  tool_result: 'Tool Result'
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

        const conventional: InjectedPrompt[] = prompts
          .map(prompt => {
            const type = detectPromptType(prompt.name)
            if (!type) return null
            const result: InjectedPrompt = { name: prompt.name, type }
            if (prompt.description) result.description = prompt.description
            return result
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
        <p className="text-sm text-muted-foreground">Server must be connected</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    )
  }

  if (injectedPrompts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Zap className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No auto-injected prompts</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-none">
      <div className="space-y-2">
        {injectedPrompts.map((prompt, index) => (
          <div
            key={`${prompt.name}-${index}`}
            className="rounded-lg border p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-sm truncate">{prompt.name}</span>
              <span className="text-xs text-muted-foreground">
                {TYPE_LABELS[prompt.type]}
              </span>
            </div>
            {prompt.description && (
              <p className="text-xs text-muted-foreground mt-1">
                {prompt.description}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export { detectPromptType }
