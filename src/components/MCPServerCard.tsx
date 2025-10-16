import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Trash2, Activity, Plug2, Circle, LoaderCircle } from "lucide-react"
import type { MCPServer } from "@/types/mcp"
import { cn } from "@/lib/utils"

interface MCPServerCardProps {
  server: MCPServer
  onToggle: (id: string, enabled: boolean) => void
  onDelete: (id: string) => void
  onTest?: (id: string) => void
  onAuthenticate?: (id: string) => void
  isTesting?: boolean
}

export function MCPServerCard({ server, onToggle, onDelete, onTest, onAuthenticate, isTesting = false }: MCPServerCardProps) {

  const getStatusColor = (status: MCPServer['status']) => {
    switch (status) {
      case 'running':
        return 'text-green-500'
      case 'error':
        return 'text-red-500'
      case 'starting':
        return 'text-yellow-500'
      case 'needs_auth':
        return 'text-orange-500'
      case 'stopped':
      case 'idle':
      default:
        return 'text-gray-400'
    }
  }

  const getStatusText = (status: MCPServer['status']) => {
    switch (status) {
      case 'running':
        return 'Connected'
      case 'error':
        return 'Error'
      case 'starting':
        return 'Starting...'
      case 'needs_auth':
        return 'Needs Auth'
      case 'stopped':
        return 'Stopped'
      case 'idle':
      default:
        return 'Idle'
    }
  }

  const getIcon = (icon?: string) => {
    if (icon) {
      // Try to load custom icon
      return (
        <img
          src={`/icons/${icon}.svg`}
          alt={server.name}
          className="h-5 w-5 dark:invert"
          onError={(e) => {
            // Fallback to Plug2 icon if image fails to load
            e.currentTarget.style.display = 'none'
            e.currentTarget.nextElementSibling?.classList.remove('hidden')
          }}
        />
      )
    }
    return null
  }

  return (
    <div
      className={cn(
        "group relative rounded-lg border p-4 transition-colors hover:border-primary/50",
        server.enabled && server.status === 'running' ? "border-primary/50 bg-accent/30" : ""
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Icon and Info */}
        <div className="flex items-start gap-3 flex-1">
          <div className="relative mt-1">
            {getIcon(server.icon)}
            <Plug2 className={cn("h-5 w-5", server.icon ? "hidden" : "")} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-semibold truncate">{server.name}</span>
              {server.status === 'needs_auth' && onAuthenticate ? (
                <button
                  onClick={() => onAuthenticate(server.id)}
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-500/10 hover:bg-orange-500/20 transition-colors cursor-pointer"
                  title="Click to authenticate"
                >
                  <Circle className="h-2 w-2 fill-current text-orange-500" />
                  <span className="font-medium text-orange-500">
                    Needs Auth
                  </span>
                </button>
              ) : (
                <div className="flex items-center gap-1 text-xs">
                  <Circle className={cn("h-2 w-2 fill-current", getStatusColor(server.status))} />
                  <span className={cn("font-medium", getStatusColor(server.status))}>
                    {getStatusText(server.status)}
                  </span>
                </div>
              )}
            </div>

            {server.description && (
              <p className="text-sm text-muted-foreground mb-2">{server.description}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Switch
            checked={server.enabled}
            onCheckedChange={(checked) => onToggle(server.id, checked)}
            className="data-[state=checked]:bg-primary"
          />

          <div className={cn(
            "flex gap-1 transition-opacity",
            isTesting ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}>
            {onTest && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onTest(server.id)}
                title="Test connection"
                disabled={isTesting}
              >
                {isTesting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Activity className="h-4 w-4" />
                )}
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onDelete(server.id)}
              title="Delete server"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
