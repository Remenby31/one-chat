import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { SlimButton } from "@/components/ui/slim-button"
import { CircleCheck, OctagonX, TriangleAlert, Info, Copy, Check } from "lucide-react"

export type MessageType = "success" | "error" | "warning" | "info"

interface MessageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: MessageType
  title: string
  message: string
}

export function MessageDialog({
  open,
  onOpenChange,
  type,
  title,
  message,
}: MessageDialogProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy to clipboard:", error)
    }
  }

  const getIcon = () => {
    switch (type) {
      case "success":
        return <CircleCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
      case "error":
        return <OctagonX className="h-5 w-5 text-red-600 dark:text-red-400" />
      case "warning":
        return <TriangleAlert className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
      case "info":
        return <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
    }
  }

  const getHeaderColor = () => {
    switch (type) {
      case "success":
        return "text-green-600 dark:text-green-400"
      case "error":
        return "text-red-600 dark:text-red-400"
      case "warning":
        return "text-yellow-600 dark:text-yellow-400"
      case "info":
        return "text-blue-600 dark:text-blue-400"
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${getHeaderColor()}`}>
            {getIcon()}
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">
            {message}
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          {type === "error" && (
            <SlimButton variant="outline" onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Error
                </>
              )}
            </SlimButton>
          )}
          <SlimButton onClick={() => onOpenChange(false)} className="flex-1">
            OK
          </SlimButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Hook to manage MessageDialog state
 */
export function useMessageDialog() {
  const [dialogState, setDialogState] = useState<{
    open: boolean
    type: MessageType
    title: string
    message: string
  }>({
    open: false,
    type: "info",
    title: "",
    message: "",
  })

  const showMessage = (
    type: MessageType,
    title: string,
    message: string
  ) => {
    setDialogState({
      open: true,
      type,
      title,
      message,
    })
  }

  const showSuccess = (title: string, message: string) => {
    showMessage("success", title, message)
  }

  const showError = (title: string, message: string) => {
    showMessage("error", title, message)
  }

  const showWarning = (title: string, message: string) => {
    showMessage("warning", title, message)
  }

  const showInfo = (title: string, message: string) => {
    showMessage("info", title, message)
  }

  const closeDialog = () => {
    setDialogState(prev => ({ ...prev, open: false }))
  }

  return {
    dialogState,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    closeDialog,
  }
}
