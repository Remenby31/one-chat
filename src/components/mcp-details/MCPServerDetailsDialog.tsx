import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plug2, Circle, CheckCircle } from "lucide-react"
import type { MCPServer } from "@/types/mcp"
import { MCPOverview } from "./MCPOverview"
import { MCPToolsList } from "./MCPToolsList"
import { MCPResourcesList } from "./MCPResourcesList"
import { MCPPromptsList } from "./MCPPromptsList"
import { MCPInjectedPrompts } from "./MCPInjectedPrompts"
import { useMCPDetails } from "@/lib/useMCPDetails"
import { mcpManager } from "@/lib/mcpManager"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { detectPromptType } from "@/lib/mcpPromptInjection"

interface MCPServerDetailsDialogProps {
  server: MCPServer | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onServerUpdate?: (server: MCPServer) => void
}

export function MCPServerDetailsDialog({
  server,
  open,
  onOpenChange,
  onServerUpdate,
}: MCPServerDetailsDialogProps) {
  const [actualState, setActualState] = useState<MCPServer['state']>(server?.state || 'idle')
  const { tools, resources, prompts, isLoading } = useMCPDetails(server || undefined)

  // Sync actual SDK state when dialog opens
  useEffect(() => {
    if (open && server) {
      mcpManager.getActualServerState(server.id).then((state) => {
        const mappedState = state as MCPServer['state']
        setActualState(mappedState)

        // If actual state differs from React state, notify parent to update
        if (mappedState !== server.state && onServerUpdate) {
          onServerUpdate({ ...server, state: mappedState })
        }
      })
    }
  }, [open, server?.id])

  // Update actualState when server prop changes
  useEffect(() => {
    if (server) {
      setActualState(server.state)
    }
  }, [server?.state])

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

  // Use actualState for display (synced with SDK)
  const displayState = actualState

  const toolsCount = isLoading ? '...' : tools.length
  const resourcesCount = isLoading ? '...' : resources.length
  const promptsCount = isLoading ? '...' : prompts.length
  const injectionCount = isLoading ? '...' : prompts.filter(p => detectPromptType(p.name)).length

  const getStatusColor = () => {
    switch (displayState) {
      case 'connected':
        return 'text-green-400'
      case 'error':
        return 'text-red-400'
      case 'auth_required':
        return 'text-orange-400'
      case 'connecting':
        return 'text-blue-400'
      default:
        return 'text-gray-400'
    }
  }

  const getStatusIcon = () => {
    if (displayState === 'connected') {
      return <CheckCircle className="h-4 w-4" />
    }
    return <Circle className="h-4 w-4" />
  }

  const getStatusLabel = () => {
    switch (displayState) {
      case 'idle':
        return 'Idle'
      case 'connecting':
        return 'Connecting'
      case 'connected':
        return 'Connected'
      case 'error':
        return 'Error'
      case 'auth_required':
        return 'Auth Required'
      case 'disconnected':
        return 'Disconnected'
      default:
        return 'Unknown'
    }
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
                {getStatusLabel()}
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* Tabs Content */}
        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
          <div className="flex justify-center px-6">
            <TabsList className="max-w-2xl">
              <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tools" className="gap-2">
              Tools
              {displayState === 'connected' && (
                <span className="px-1.5 py-0.5 text-xs rounded bg-primary/20 text-primary">
                  {toolsCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="resources" className="gap-2">
              Resources
              {displayState === 'connected' && (
                <span className="px-1.5 py-0.5 text-xs rounded bg-primary/20 text-primary">
                  {resourcesCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="prompts" className="gap-2">
              Prompts
              {displayState === 'connected' && (
                <span className="px-1.5 py-0.5 text-xs rounded bg-primary/20 text-primary">
                  {promptsCount}
                </span>
              )}
            </TabsTrigger>
              <TabsTrigger value="injection" className="gap-2">
                Injection
                {displayState === 'connected' && (
                  <span className="px-1.5 py-0.5 text-xs rounded bg-primary/20 text-primary">
                    {injectionCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden px-6 pb-6">
            <TabsContent value="overview" className="h-full mt-4 overflow-y-auto">
              <MCPOverview server={{ ...server, state: displayState }} />
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

            <TabsContent value="injection" className="h-full mt-4 overflow-y-auto">
              <MCPInjectedPrompts server={server} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
