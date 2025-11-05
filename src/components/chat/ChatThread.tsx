import type { FC } from 'react'
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react'
import { Button } from '@/components/ui/button'
import { MessageList } from './MessageList'
import { Composer } from './Composer'
import { useStreamingChat } from '@/hooks/useStreamingChat'
import type { ModelConfig } from '@/types/model'
import type { MCPServer } from '@/types/mcp'
import { m } from 'motion/react'

interface ChatThreadProps {
  modelConfig: ModelConfig | null
  mcpServers?: MCPServer[]
  onMcpToggle?: (id: string, enabled: boolean) => void
  onSettingsClick?: () => void
  opacity?: number
}

// Welcome suggestions (exact copy from thread.tsx)
const WelcomeSuggestions: FC<{ onSend: (text: string) => void }> = ({ onSend }) => {
  const suggestions = [
    {
      title: "What's the weather",
      label: "in San Francisco?",
      action: "What's the weather in San Francisco?",
    },
    {
      title: "Explain React hooks",
      label: "like useState and useEffect",
      action: "Explain React hooks like useState and useEffect",
    },
    {
      title: "Write a SQL query",
      label: "to find top customers",
      action: "Write a SQL query to find top customers",
    },
    {
      title: "Create a meal plan",
      label: "for healthy weight loss",
      action: "Create a meal plan for healthy weight loss",
    },
  ]

  return (
    <div className="grid w-full gap-2 @md:grid-cols-2">
      {suggestions.map((suggestion, index) => (
        <m.div
          key={`suggestion-${index}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.05 * index }}
          className="[&:nth-child(n+3)]:hidden @md:[&:nth-child(n+3)]:block"
        >
          <Button
            variant="ghost"
            className="h-auto w-full flex-1 flex-wrap items-start justify-start gap-1 rounded-3xl border px-5 py-4 text-left text-sm @md:flex-col dark:hover:bg-accent/60"
            aria-label={suggestion.action}
            onClick={() => onSend(suggestion.action)}
          >
            <span className="font-medium">{suggestion.title}</span>
            <span className="text-muted-foreground">{suggestion.label}</span>
          </Button>
        </m.div>
      ))}
    </div>
  )
}

export const ChatThread: FC<ChatThreadProps> = ({
  modelConfig,
  mcpServers = [],
  onMcpToggle,
  onSettingsClick,
  opacity = 1,
}) => {
  const { messages, isGenerating, sendMessage, stopGeneration, clearChat } =
    useStreamingChat(modelConfig, mcpServers)

  const isEmpty = messages.length === 0

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <div
          className="@container flex flex-1 flex-col min-h-0 bg-transparent"
          style={{
            ['--thread-max-width' as string]: '65rem',
          }}
        >
          <div className="relative flex flex-1 flex-col min-h-0 bg-transparent">
            {/* Messages when not empty */}
            {!isEmpty && (
              <MessageList
                messages={messages}
                onRegenerate={() => {
                  // TODO: Implement regenerate
                }}
              />
            )}

            {/* Composer at bottom when thread has messages */}
            {!isEmpty && (
              <Composer
                onSend={sendMessage}
                onStop={stopGeneration}
                isGenerating={isGenerating}
                mcpServers={mcpServers}
                onMcpToggle={onMcpToggle}
                onSettingsClick={onSettingsClick}
                opacity={opacity}
              />
            )}

            {/* Centered composer when thread is empty */}
            {isEmpty && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="pointer-events-auto w-full max-w-3xl px-4">
                  <div className="mb-8">
                    <WelcomeSuggestions onSend={sendMessage} />
                  </div>
                  <Composer
                    onSend={sendMessage}
                    onStop={stopGeneration}
                    isGenerating={isGenerating}
                    centered
                    mcpServers={mcpServers}
                    onMcpToggle={onMcpToggle}
                    onSettingsClick={onSettingsClick}
                    opacity={opacity}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </MotionConfig>
    </LazyMotion>
  )
}
