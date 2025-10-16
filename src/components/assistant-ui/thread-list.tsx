import type { FC } from "react"
import {
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useThreadListItem,
  useThread,
} from "@assistant-ui/react"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button"
import { generateConversationTitle } from "@/lib/titleGenerator"

export const ThreadList: FC = () => {
  return (
    <ThreadListPrimitive.Root className="aui-root aui-thread-list-root">
      <ThreadListNew />
      <ThreadListItems />
    </ThreadListPrimitive.Root>
  )
}

const ThreadListNew: FC = () => {
  return (
    <ThreadListPrimitive.New asChild>
      <Button className="aui-thread-list-new w-full" variant="ghost">
        <PlusIcon className="h-4 w-4 mr-2" />
        New conversation
      </Button>
    </ThreadListPrimitive.New>
  )
}

const ThreadListItems: FC = () => {
  return <ThreadListPrimitive.Items components={{ ThreadListItem }} />
}

const ThreadListItem: FC = () => {
  return (
    <ThreadListItemPrimitive.Root className="aui-thread-list-item">
      <ThreadListItemPrimitive.Trigger className="aui-thread-list-item-trigger">
        <ThreadListItemTitle />
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemActions />
    </ThreadListItemPrimitive.Root>
  )
}

const ThreadListItemTitle: FC = () => {
  // Get the thread list item state (includes title if set)
  const threadListItem = useThreadListItem()

  // Try to access the thread messages (optional - might not be available for inactive threads)
  const thread = useThread({ optional: true })

  // Use the title from thread list item state if available (from backend/storage)
  if (threadListItem.title) {
    return (
      <p className="aui-thread-list-item-title">
        {threadListItem.title}
      </p>
    )
  }

  // Generate smart title from messages if available
  if (thread?.messages && thread.messages.length > 0) {
    const generatedTitle = generateConversationTitle(thread.messages)

    return (
      <p className="aui-thread-list-item-title">
        {generatedTitle}
      </p>
    )
  }

  // Fallback to default text for empty conversations
  return (
    <p className="aui-thread-list-item-title">
      New conversation
    </p>
  )
}

const ThreadListItemActions: FC = () => {
  return (
    <div className="flex gap-1">
      <ThreadListItemPrimitive.Delete asChild>
        <TooltipIconButton
          className="aui-thread-list-item-delete"
          variant="ghost"
          tooltip="Delete"
        >
          <Trash2Icon className="h-4 w-4" />
        </TooltipIconButton>
      </ThreadListItemPrimitive.Delete>
    </div>
  )
}