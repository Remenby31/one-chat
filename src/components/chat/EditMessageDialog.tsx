import type { FC } from 'react'
import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface EditMessageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  content: string
  onSubmit: (newContent: string) => void
}

export const EditMessageDialog: FC<EditMessageDialogProps> = ({
  open,
  onOpenChange,
  content,
  onSubmit,
}) => {
  const [editedContent, setEditedContent] = useState(content)

  // Reset content when dialog opens
  useEffect(() => {
    if (open) {
      setEditedContent(content)
    }
  }, [open, content])

  const handleSubmit = () => {
    if (editedContent.trim() && editedContent !== content) {
      onSubmit(editedContent.trim())
    } else {
      onOpenChange(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit message</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <Textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[120px] resize-none"
            placeholder="Enter your message..."
            autoFocus
          />
          <p className="text-xs text-muted-foreground mt-2">
            Press Ctrl+Enter to submit
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!editedContent.trim() || editedContent === content}
          >
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
