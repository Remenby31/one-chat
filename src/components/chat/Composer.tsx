import type { FC, FormEvent, KeyboardEvent } from 'react'
import { useState, useRef, useEffect } from 'react'
import { ArrowUpIcon, Square, PlusIcon } from 'lucide-react'
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button'
import { Button } from '@/components/ui/button'
import { MCPButton } from '@/components/MCPButton'
import type { MCPServer } from '@/types/mcp'
import { m } from 'motion/react'

interface ComposerProps {
  onSend: (content: string) => void
  onStop: () => void
  isGenerating: boolean
  centered?: boolean
  mcpServers?: MCPServer[]
  onMcpToggle?: (id: string, enabled: boolean) => void
  onSettingsClick?: () => void
  opacity?: number
}

export const Composer: FC<ComposerProps> = ({
  onSend,
  onStop,
  isGenerating,
  centered = false,
  mcpServers = [],
  onMcpToggle,
  onSettingsClick,
  opacity = 1,
}) => {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [input])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (input.trim() && !isGenerating) {
      onSend(input.trim())
      setInput('')
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }

  const composerContent = (
    <form
      onSubmit={handleSubmit}
      className="relative flex w-full flex-col rounded-3xl border border-border bg-muted px-1 pt-2 shadow-[0_9px_9px_0px_rgba(0,0,0,0.01),0_2px_5px_0px_rgba(0,0,0,0.06)] dark:border-muted-foreground/15"
    >
      {/* Attachments area - TODO */}
      {/* <div className="mb-2 flex w-full flex-row items-center gap-2 overflow-x-auto px-1.5 pt-0.5 pb-1 empty:hidden">
        Attachments here
      </div> */}

      {/* Input */}
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Send a message..."
        className={`w-full resize-none bg-transparent px-3.5 text-base outline-none placeholder:text-muted-foreground focus:outline-primary ${
          centered ? 'max-h-32 h-10 py-2' : 'mb-1 max-h-32 min-h-16 pt-1.5 pb-3'
        }`}
        rows={1}
        autoFocus
        aria-label="Message input"
      />

      {/* Action bar */}
      <div className="relative mx-1 mt-2 mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {/* Add attachment button - TODO */}
          <TooltipIconButton
            tooltip="Add Attachment"
            side="bottom"
            variant="ghost"
            className="size-[34px] rounded-full p-1 text-xs font-semibold hover:bg-muted-foreground/15 dark:border-muted-foreground/15 dark:hover:bg-muted-foreground/30"
            aria-label="Add Attachment"
            onClick={() => {
              // TODO: Implement attachment
              console.log('Add attachment')
            }}
          >
            <PlusIcon className="size-5 stroke-[1.5px]" />
          </TooltipIconButton>

          {/* MCP Button */}
          {onMcpToggle && onSettingsClick && (
            <MCPButton
              servers={mcpServers}
              onToggle={onMcpToggle}
              onSettingsClick={onSettingsClick}
              opacity={opacity}
            />
          )}
        </div>

        {/* Send/Stop button */}
        {!isGenerating ? (
          <TooltipIconButton
            tooltip="Send message"
            side="bottom"
            type="submit"
            variant="default"
            size="icon"
            className="size-[34px] rounded-full p-1"
            aria-label="Send message"
            disabled={!input.trim()}
          >
            <ArrowUpIcon className="size-5" />
          </TooltipIconButton>
        ) : (
          <Button
            type="button"
            variant="default"
            size="icon"
            className="size-[34px] rounded-full border border-muted-foreground/60 hover:bg-primary/75 dark:border-muted-foreground/90"
            aria-label="Stop generating"
            onClick={onStop}
          >
            <Square className="size-3.5 fill-white dark:fill-black" />
          </Button>
        )}
      </div>
    </form>
  )

  if (centered) {
    return (
      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4"
      >
        {composerContent}
      </m.div>
    )
  }

  return (
    <div className="sticky bottom-0 mx-auto flex w-full flex-col gap-4 pb-4 md:pb-6">
      <div className="max-w-3xl mx-auto w-full px-4">
        {composerContent}
      </div>
    </div>
  )
}
