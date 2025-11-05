import type { FC } from 'react'
import { useEffect, useRef, useState } from 'react'
import { ArrowDownIcon } from 'lucide-react'
import { TooltipIconButton } from '@/components/ui/tooltip-icon-button'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import type { ChatMessage } from '@/lib/chatStore'

interface MessageListProps {
  messages: ChatMessage[]
  onRegenerate?: () => void
}

export const MessageList: FC<MessageListProps> = ({ messages, onRegenerate }) => {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)

  // Check if we should show scroll button
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
      setShowScrollButton(!isNearBottom)
    }

    viewport.addEventListener('scroll', handleScroll)
    return () => viewport.removeEventListener('scroll', handleScroll)
  }, [])

  // Auto-scroll to bottom when new messages arrive or when streaming
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    // Check if user is near bottom
    const { scrollTop, scrollHeight, clientHeight } = viewport
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100

    // Only auto-scroll if user was already at bottom
    if (isNearBottom) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [messages])

  const scrollToBottom = () => {
    const viewport = viewportRef.current
    if (viewport) {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: 'smooth',
      })
    }
  }

  return (
    <div
      ref={viewportRef}
      className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll px-4 pt-20 bg-transparent"
    >
      {/* Messages */}
      {messages.map((message, index) => {
        // For assistant messages, collect tool results from subsequent tool messages
        const toolResults: Record<string, string> = {}
        if (message.role === 'assistant' && message.tool_call_requests) {
          // Look ahead for tool messages
          for (let i = index + 1; i < messages.length; i++) {
            const nextMsg = messages[i]
            if (nextMsg.role === 'tool' && nextMsg.tool_call_id) {
              toolResults[nextMsg.tool_call_id] = nextMsg.content
            } else if (nextMsg.role !== 'tool') {
              // Stop when we hit a non-tool message
              break
            }
          }
        }

        return (
          <div key={message.id}>
            {message.role === 'user' ? (
              <UserMessage message={message} />
            ) : message.role === 'assistant' ? (
              <AssistantMessage
                message={message}
                isLast={index === messages.length - 1}
                onRegenerate={onRegenerate}
                toolResults={toolResults}
              />
            ) : message.role === 'tool' ? (
              // Skip tool messages (they're shown in assistant messages)
              null
            ) : null}
          </div>
        )
      })}

      {/* Spacer when thread has messages */}
      {messages.length > 0 && <div className="min-h-8 grow" />}

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <TooltipIconButton
          tooltip="Scroll to bottom"
          variant="outline"
          className="absolute -top-12 z-10 self-center rounded-full h-7 w-7 dark:bg-background dark:hover:bg-accent"
          onClick={scrollToBottom}
        >
          <ArrowDownIcon className="size-4 text-foreground" />
        </TooltipIconButton>
      )}
    </div>
  )
}
