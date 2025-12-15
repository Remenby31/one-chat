import type { FC } from 'react'
import { useState, useMemo } from 'react'
import { CopyIcon, CheckIcon, RefreshCwIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { m, LazyMotion, domAnimation, AnimatePresence } from 'motion/react'
import { TooltipIconButton } from '@/components/ui/tooltip-icon-button'
import { ToolCallDisplay } from '@/components/chat/ToolCall'
import { MarkdownContent } from '@/components/chat/MarkdownContent'
import type { ChatMessage, ToolCall } from '@/lib/chatStore'
import { convertToolCallRequestToToolCall } from '@/lib/toolCallUtils'

// Shared animation configs
const messageAnimation = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.2, ease: 'easeOut' as const }
}

// Typing cursor component
const TypingCursor: FC = () => (
  <m.span
    animate={{ opacity: [1, 0] }}
    transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
    className="inline-block w-0.5 h-4 bg-foreground/70 ml-0.5 align-middle"
  />
)

interface AssistantMessageProps {
  message: ChatMessage
  isLast: boolean
  onRegenerate?: () => void
  toolResults?: Record<string, string>
}

export const AssistantMessage: FC<AssistantMessageProps> = ({
  message,
  isLast,
  onRegenerate,
  toolResults = {},
}) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (message.content) {
      navigator.clipboard.writeText(message.content).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  const handleRegenerate = () => {
    if (onRegenerate && isLast) {
      onRegenerate()
    }
  }

  // Streaming state
  const isStreaming = message.isStreaming ?? false
  const streamingPhase = message.streamingPhase ?? 'idle'

  // Determine which tool calls to display
  // Priority: real-time toolCalls > persisted tool_call_requests
  const displayToolCalls = useMemo((): ToolCall[] => {
    // First check for real-time streaming tool calls
    if (message.toolCalls && message.toolCalls.length > 0) {
      return message.toolCalls
    }
    // Fall back to persisted tool_call_requests
    if (message.tool_call_requests && message.tool_call_requests.length > 0) {
      return message.tool_call_requests.map((request) =>
        convertToolCallRequestToToolCall(request, toolResults[request.id])
      )
    }
    return []
  }, [message.toolCalls, message.tool_call_requests, toolResults])

  const hasToolCalls = displayToolCalls.length > 0
  const hasContent = !!message.content

  // Detect error/status messages that shouldn't show copy button
  const isStatusMessage = useMemo(() => {
    const content = message.content?.trim() || ''
    const statusPatterns = [
      'Stopped.',
      'Rate limit exceeded',
      'Invalid API key',
      'Model not found',
      'Request error',
      'Connection failed',
      'An error occurred',
      /^Error \d+/,
    ]
    return statusPatterns.some(pattern =>
      typeof pattern === 'string' ? content.startsWith(pattern) : pattern.test(content)
    )
  }, [message.content])

  // Determine if we should show typing cursor
  // Show when streaming text and no tool calls yet
  const showTypingCursor = isStreaming &&
    (streamingPhase === 'text' || streamingPhase === 'idle') &&
    !hasToolCalls

  // Reduce padding for messages with only tool calls (no text content)
  const paddingClass = hasToolCalls && !hasContent ? 'py-0' : 'py-3'

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        {...messageAnimation}
        className={`relative mx-auto w-full max-w-[var(--thread-max-width)] ${paddingClass}`}
        data-role="assistant"
      >
        {/* 1. Message content FIRST (chronological order) */}
        <AnimatePresence mode="wait">
          {hasContent && (
            <m.div
              key="content"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="mx-2 break-words text-foreground"
            >
              <MarkdownContent content={message.content} />
              {showTypingCursor && <TypingCursor />}
            </m.div>
          )}
        </AnimatePresence>

        {/* Empty state with typing cursor when no content yet */}
        {!hasContent && isStreaming && !hasToolCalls && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mx-2"
          >
            <TypingCursor />
          </m.div>
        )}

        {/* 2. Tool calls AFTER content (chronological order) */}
        <AnimatePresence>
          {hasToolCalls && (
            <m.div
              key="tools"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className={cn('mx-2 space-y-1 pb-1', hasContent && 'mt-1.5')}
            >
              {displayToolCalls.map((toolCall) => (
                <ToolCallDisplay
                  key={toolCall.id}
                  toolCall={toolCall}
                />
              ))}
            </m.div>
          )}
        </AnimatePresence>

        {/* Action bar - only show when not streaming, not a status message, and no tool calls */}
        {!isStreaming && !isStatusMessage && hasContent && !hasToolCalls && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="mt-2 ml-2 flex gap-1 text-muted-foreground"
          >
            {hasContent && (
              <TooltipIconButton
                tooltip="Copy"
                className="h-7 w-7 bg-transparent hover:bg-transparent"
                onClick={handleCopy}
              >
                {copied ? (
                  <CheckIcon className="size-3.5" />
                ) : (
                  <CopyIcon className="size-3.5" />
                )}
              </TooltipIconButton>
            )}

            {isLast && onRegenerate && (
              <TooltipIconButton
                tooltip="Regenerate"
                className="h-7 w-7 bg-transparent hover:bg-transparent"
                onClick={handleRegenerate}
              >
                <RefreshCwIcon className="size-3.5" />
              </TooltipIconButton>
            )}
          </m.div>
        )}
      </m.div>
    </LazyMotion>
  )
}
