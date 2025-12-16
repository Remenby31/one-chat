import type { FC } from 'react'
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { ArrowDownIcon } from 'lucide-react'
import { TooltipIconButton } from '@/components/ui/tooltip-icon-button'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import type { ChatMessage } from '@/lib/chatStore'
import { getToolResultsForMessage } from '@/lib/toolCallUtils'
import { useBranchStore } from '@/lib/branchStore'
import { getActiveBranchMessages, getSiblingInfo } from '@/lib/branchUtils'
import type { BranchedChatMessage, SiblingInfo } from '@/types/branching'

interface MessageListProps {
  messages: ChatMessage[]
  onRegenerate?: () => void
  onEditUserMessage?: (messageId: string, newContent: string) => void
}

export const MessageList: FC<MessageListProps> = ({ messages, onRegenerate, onEditUserMessage }) => {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const { activeBranches, setActiveBranch } = useBranchStore()

  // Filter messages to show only active branch
  const visibleMessages = useMemo(() => {
    return getActiveBranchMessages(messages as BranchedChatMessage[], activeBranches)
  }, [messages, activeBranches])

  // Handle branch navigation
  const handleNavigateBranch = useCallback((groupId: string, newIndex: number) => {
    setActiveBranch(groupId, newIndex)
  }, [setActiveBranch])

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
  }, [visibleMessages])

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
      className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll px-4 pt-20 pb-40 bg-transparent"
    >
      {/* Messages */}
      {visibleMessages.map((message, index) => {
        // Get sibling info for this message (for branch navigation UI)
        const siblingInfo = getSiblingInfo(
          messages as BranchedChatMessage[],
          message,
          activeBranches
        )

        // For assistant messages, collect tool results from subsequent tool messages
        const toolResults =
          message.role === 'assistant' && message.tool_call_requests
            ? getToolResultsForMessage(visibleMessages, index)
            : {}

        // Skip tool messages (they're shown in assistant messages)
        if (message.role === 'tool') return null

        return message.role === 'user' ? (
          <UserMessage
            key={message.id}
            message={message}
            siblingInfo={siblingInfo}
            onNavigateBranch={handleNavigateBranch}
            onEdit={onEditUserMessage}
          />
        ) : message.role === 'assistant' ? (
          <AssistantMessage
            key={message.id}
            message={message}
            isLast={index === visibleMessages.length - 1}
            onRegenerate={onRegenerate}
            toolResults={toolResults}
            siblingInfo={siblingInfo}
            onNavigateBranch={handleNavigateBranch}
          />
        ) : null
      })}


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
