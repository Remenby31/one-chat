import type { FC } from "react"
import {
  ThreadListItemPrimitive,
  ThreadListPrimitive,
} from "@assistant-ui/react"
import { ArchiveIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button"

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
        Nouvelle conversation
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
  return (
    <p className="aui-thread-list-item-title">
      <ThreadListItemPrimitive.Title fallback="Nouvelle conversation" />
    </p>
  )
}

const ThreadListItemActions: FC = () => {
  return (
    <div className="flex gap-1">
      <ThreadListItemPrimitive.Archive asChild>
        <TooltipIconButton
          className="aui-thread-list-item-archive"
          variant="ghost"
          tooltip="Archiver"
        >
          <ArchiveIcon className="h-4 w-4" />
        </TooltipIconButton>
      </ThreadListItemPrimitive.Archive>
      <ThreadListItemPrimitive.Delete asChild>
        <TooltipIconButton
          className="aui-thread-list-item-delete"
          variant="ghost"
          tooltip="Supprimer"
        >
          <Trash2Icon className="h-4 w-4" />
        </TooltipIconButton>
      </ThreadListItemPrimitive.Delete>
    </div>
  )
}