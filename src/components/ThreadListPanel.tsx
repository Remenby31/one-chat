import { type FC, useEffect } from 'react'
import { useThreadStore } from '@/lib/threadStore'
import { Button } from '@/components/ui/button'
import { Trash2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ThreadListPanelProps {
  onThreadSelect: (threadId: string) => void
  currentThreadId: string | null
}

export const ThreadListPanel: FC<ThreadListPanelProps> = ({
  onThreadSelect,
  currentThreadId
}) => {
  const { threads, loadThreads, deleteThread } = useThreadStore()

  // Load threads on mount
  useEffect(() => {
    loadThreads()
  }, [loadThreads])

  const handleDelete = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    // Confirm deletion
    if (!confirm('Delete this conversation?')) {
      return
    }

    await deleteThread(threadId)
  }

  if (threads.length === 0) {
    return (
      <div className="text-muted-foreground text-sm p-4">
        No conversations yet. Start a new chat!
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {threads.map((thread) => (
        <div
          key={thread.id}
          className={cn(
            "group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors",
            "hover:bg-accent/60",
            currentThreadId === thread.id && "bg-accent"
          )}
          onClick={() => onThreadSelect(thread.id)}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {thread.title}
            </p>
            <p className="text-xs text-muted-foreground">
              {thread.messageCount} message{thread.messageCount !== 1 ? 's' : ''}
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => handleDelete(thread.id, e)}
          >
            <Trash2Icon className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  )
}
