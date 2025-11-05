import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plug2, Circle, CheckCircle } from "lucide-react"
import type { MCPServer } from "@/types/mcp"
import { STATE_UI_CONFIG } from "@/types/mcpState"
import { MCPOverview } from "./MCPOverview"
import { MCPToolsList } from "./MCPToolsList"
import { MCPServerLogs } from "./MCPServerLogs"
import { MCPResourcesList } from "./MCPResourcesList"
import { MCPPromptsList } from "./MCPPromptsList"
import { MCPConfigEditor } from "./MCPConfigEditor"
import { useMCPDetails } from "@/lib/useMCPDetails"
import { cn } from "@/lib/utils"
import { useEffect } from "react"

interface MCPServerDetailsDialogProps {
  server: MCPServer | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onServerUpdate?: (server: MCPServer) => void
  opacity?: number
}

export function MCPServerDetailsDialog({
  server,
  open,
  onOpenChange,
  onServerUpdate,
  opacity = 1,
}: MCPServerDetailsDialogProps) {
  const { tools, resources, prompts, isLoading } = useMCPDetails(server || undefined)

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange])

  if (!server) return null

  const stateConfig = STATE_UI_CONFIG[server.status]
  const toolsCount = isLoading ? '...' : tools.length
  const resourcesCount = isLoading ? '...' : resources.length
  const promptsCount = isLoading ? '...' : prompts.length

  const getStatusColor = () => {
    switch (stateConfig.color) {
      case 'success':
        return 'text-green-400'
      case 'error':
        return 'text-red-400'
      case 'warning':
        return 'text-orange-400'
      case 'info':
        return 'text-blue-400'
      default:
        return 'text-gray-400'
    }
  }

  const getStatusIcon = () => {
    if (server.status === 'RUNNING') {
      return <CheckCircle className="h-4 w-4" />
    }
    return <Circle className="h-4 w-4" />
  }

  const getIcon = () => {
    if (server.icon) {
      return (
        <img
          src={`/icons/${server.icon}.svg`}
          alt={server.name}
          className="h-6 w-6 dark:invert"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
            e.currentTarget.nextElementSibling?.classList.remove('hidden')
          }}
        />
      )
    }
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl h-[85vh] flex flex-col p-0"
        style={{ '--ui-opacity': `${opacity * 100}%` } as React.CSSProperties}
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="relative">
              {getIcon()}
              <Plug2 className={cn("h-6 w-6", server.icon ? "hidden" : "")} />
            </div>

            <div className="flex-1">
              <DialogTitle className="text-xl font-semibold">{server.name}</DialogTitle>
              {server.description && (
                <p className="text-sm text-muted-foreground mt-1">{server.description}</p>
              )}
            </div>

            {/* Status Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent">
              <span className={cn("fill-current", getStatusColor())}>
                {getStatusIcon()}
              </span>
              <span className={cn("text-sm font-medium", getStatusColor())}>
                {stateConfig.label}
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* Tabs Content */}
        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
          <div className="flex justify-center px-6 mt-4">
            <TabsList className="max-w-2xl">
              <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tools" className="gap-2">
              Tools
              {server.status === 'RUNNING' && (
                <span className="px-1.5 py-0.5 text-xs rounded bg-primary/20 text-primary">
                  {toolsCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="resources" className="gap-2">
              Resources
              {server.status === 'RUNNING' && (
                <span className="px-1.5 py-0.5 text-xs rounded bg-primary/20 text-primary">
                  {resourcesCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="prompts" className="gap-2">
              Prompts
              {server.status === 'RUNNING' && (
                <span className="px-1.5 py-0.5 text-xs rounded bg-primary/20 text-primary">
                  {promptsCount}
                </span>
              )}
            </TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
              <TabsTrigger value="config">Config</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden px-6 pb-6">
            <TabsContent value="overview" className="h-full mt-4 overflow-y-auto">
              <MCPOverview server={server} />
            </TabsContent>

            <TabsContent value="tools" className="h-full mt-4 overflow-y-auto">
              <MCPToolsList server={server} />
            </TabsContent>

            <TabsContent value="resources" className="h-full mt-4 overflow-y-auto">
              <MCPResourcesList server={server} />
            </TabsContent>

            <TabsContent value="prompts" className="h-full mt-4 overflow-y-auto">
              <MCPPromptsList server={server} />
            </TabsContent>

            <TabsContent value="logs" className="h-full mt-4 overflow-y-auto">
              <MCPServerLogs server={server} />
            </TabsContent>

            <TabsContent value="config" className="h-full mt-4 overflow-y-auto">
              <MCPConfigEditor server={server} onUpdate={onServerUpdate} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
