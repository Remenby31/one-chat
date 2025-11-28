import type { FC } from 'react'
import { useState } from 'react'
import { CopyIcon, CheckIcon, RefreshCwIcon } from 'lucide-react'
import { TooltipIconButton } from '@/components/ui/tooltip-icon-button'
import { ToolCallDisplay } from '@/components/chat/ToolCall'
import { MarkdownContent } from '@/components/chat/MarkdownContent'
import type { ChatMessage } from '@/lib/chatStore'
import { convertToolCallRequestToToolCall } from '@/lib/toolCallUtils'

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

  // Determine which tool calls to display (real-time or persisted)
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0
  const hasToolRequests = message.tool_call_requests && message.tool_call_requests.length > 0

  // Convert tool_call_requests to ToolCall format if needed
  const displayToolCalls = hasToolRequests
    ? message.tool_call_requests!.map((request) =>
        convertToolCallRequestToToolCall(request, toolResults[request.id])
      )
    : message.toolCalls

  return (
    <div
      className="relative mx-auto w-full max-w-[var(--thread-max-width)] animate-in py-4 duration-200 fade-in slide-in-from-bottom-1 last:mb-24"
      data-role="assistant"
    >
      {/* Tool calls (rendered outside bubble) */}
      {(hasToolCalls || hasToolRequests) && displayToolCalls && (
        <div className="mx-2 mb-3">
          {displayToolCalls.map((toolCall) => (
            <ToolCallDisplay key={toolCall.id} toolCall={toolCall} />
          ))}
        </div>
      )}

      {/* Message content (inside bubble) */}
      {message.content && (
        <div className="mx-2 leading-none break-words text-foreground rounded-3xl border shadow-2xl px-5 py-2.5 bg-muted/60">
          <MarkdownContent content={message.content} />
        </div>
      )}

      {/* Action bar */}
      <div className="mt-2 ml-2 flex gap-1 text-muted-foreground">
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

        {isLast && onRegenerate && (
          <TooltipIconButton
            tooltip="Refresh"
            className="h-7 w-7 bg-transparent hover:bg-transparent"
            onClick={handleRegenerate}
          >
            <RefreshCwIcon className="size-3.5" />
          </TooltipIconButton>
        )}
      </div>
    </div>
  )
}
