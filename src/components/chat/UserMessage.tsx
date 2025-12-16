import type { FC } from 'react'
import { useState } from 'react'
import { PencilIcon } from 'lucide-react'
import { TooltipIconButton } from '@/components/ui/tooltip-icon-button'
import { BranchNavigator } from '@/components/chat/BranchNavigator'
import { EditMessageDialog } from '@/components/chat/EditMessageDialog'
import type { ChatMessage } from '@/lib/chatStore'
import type { SiblingInfo } from '@/types/branching'

interface UserMessageProps {
  message: ChatMessage
  siblingInfo?: SiblingInfo | null
  onNavigateBranch?: (groupId: string, newIndex: number) => void
  onEdit?: (messageId: string, newContent: string) => void
}

export const UserMessage: FC<UserMessageProps> = ({
  message,
  siblingInfo,
  onNavigateBranch,
  onEdit,
}) => {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

  const handleEdit = (newContent: string) => {
    if (onEdit) {
      onEdit(message.id, newContent)
    }
    setIsEditDialogOpen(false)
  }

  return (
    <div
      className="group mx-auto grid w-full max-w-[var(--thread-max-width)] animate-in auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] gap-y-2 px-2 py-3 duration-200 fade-in slide-in-from-bottom-1 [&:where(>*)]:col-start-2"
      data-role="user"
    >
      {/* Attachments if any */}
      {message.attachments && message.attachments.length > 0 && (
        <div className="col-span-full col-start-1 row-start-1 flex w-full flex-row justify-end gap-2">
          {/* TODO: Render attachments */}
        </div>
      )}

      {/* Message content */}
      <div className="relative col-start-2 min-w-0">
        <div className="rounded-3xl bg-muted px-5 py-2.5 break-words text-foreground">
          {message.content}
        </div>

        {/* Action bar - edit button and branch navigator */}
        <div className="absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Branch navigator */}
          {siblingInfo && siblingInfo.totalCount > 1 && onNavigateBranch && (
            <BranchNavigator
              siblingInfo={siblingInfo}
              onNavigate={(newIndex) => onNavigateBranch(siblingInfo.groupId, newIndex)}
            />
          )}

          {/* Edit button */}
          {onEdit && (
            <TooltipIconButton
              tooltip="Edit"
              className="h-7 w-7 bg-transparent hover:bg-transparent"
              onClick={() => setIsEditDialogOpen(true)}
            >
              <PencilIcon className="size-3.5" />
            </TooltipIconButton>
          )}
        </div>
      </div>

      {/* Edit dialog */}
      <EditMessageDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        content={message.content}
        onSubmit={handleEdit}
      />
    </div>
  )
}
