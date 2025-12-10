import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Trash2, Activity, Plug2, Circle, LoaderCircle, ShieldAlert, CheckCircle, XCircle } from "lucide-react"
import type { MCPServer, MCPServerState } from "@/types/mcp"
import { cn } from "@/lib/utils"

interface MCPServerCardProps {
  server: MCPServer
  onToggle: (id: string, enabled: boolean) => void
  onDelete: (id: string) => void
  onTest?: (id: string) => void
  onAuthenticate?: (id: string) => void
  onRetry?: (id: string) => void
  onClick?: (id: string) => void
  isTesting?: boolean
}

// UI configuration for each state
const STATE_CONFIG: Record<MCPServerState, { label: string; color: string }> = {
  idle: { label: 'Idle', color: 'gray' },
  connecting: { label: 'Connecting', color: 'blue' },
  connected: { label: 'Connected', color: 'green' },
  error: { label: 'Error', color: 'red' },
  auth_required: { label: 'Auth Required', color: 'orange' },
}

export function MCPServerCard({
  server,
  onToggle,
  onDelete,
  onTest,
  onAuthenticate,
  onRetry,
  onClick,
  isTesting = false
}: MCPServerCardProps) {

  const stateConfig = STATE_CONFIG[server.state] || STATE_CONFIG.idle

  const getStatusColor = () => {
    switch (stateConfig.color) {
      case 'green':
        return 'text-green-400'
      case 'red':
        return 'text-red-400'
      case 'orange':
        return 'text-orange-400'
      case 'blue':
        return 'text-blue-400'
      default:
        return 'text-gray-400'
    }
  }

  const getStatusIcon = () => {
    if (server.state === 'connecting') {
      return <LoaderCircle className="h-3 w-3 animate-spin" />
    }

    switch (server.state) {
      case 'connected':
        return <CheckCircle className="h-3 w-3" />
      case 'auth_required':
        return <ShieldAlert className="h-3 w-3" />
      case 'error':
        return <XCircle className="h-3 w-3" />
      default:
        return <Circle className="h-3 w-3" />
    }
  }

  const getIcon = (icon?: string) => {
    if (icon) {
      return (
        <img
          src={`/icons/${icon}.svg`}
          alt={server.name}
          className="h-5 w-5 dark:invert"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
            e.currentTarget.nextElementSibling?.classList.remove('hidden')
          }}
        />
      )
    }
    return null
  }

  const needsAttention = server.state === 'auth_required' || server.state === 'error'
  const isActive = server.state === 'connecting'

  return (
    <div
      className={cn(
        "group relative rounded-lg border p-4 transition-colors hover:border-primary/50",
        server.enabled && server.state === 'connected' ? "border-primary/50 bg-accent/30" : "",
        needsAttention ? "border-orange-400/50" : "",
        isActive ? "border-blue-400 animate-[mcp-loading-pulse_2s_ease-in-out_infinite]" : ""
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Icon and Info */}
        <button
          onClick={() => onClick?.(server.id)}
          className="flex items-start gap-3 flex-1 text-left hover:opacity-80 transition-opacity"
          disabled={!onClick}
        >
          <div className="relative mt-1">
            {getIcon(server.icon)}
            <Plug2 className={cn("h-5 w-5", server.icon ? "hidden" : "")} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-semibold truncate">{server.name}</span>
              {server.isBuiltIn && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                  Built-in
                </span>
              )}
            </div>

            {/* Description */}
            {server.description && (
              <p className="text-sm text-muted-foreground mb-2">{server.description}</p>
            )}

            {/* Error message */}
            {server.error && (
              <p className="text-xs text-red-400 mt-1">
                {server.error}
              </p>
            )}
          </div>
        </button>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Status Badge */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className={cn("fill-current", getStatusColor())}>
              {getStatusIcon()}
            </span>
            <span className={cn("font-medium", getStatusColor())}>
              {stateConfig.label}
            </span>
          </div>

          <Switch
            checked={server.enabled}
            onCheckedChange={(checked) => onToggle(server.id, checked)}
            className="data-[state=checked]:bg-primary"
            disabled={isActive}
          />

          <div className={cn(
            "flex gap-1 transition-opacity duration-200",
            isTesting || needsAttention ? "opacity-100" : "opacity-60 group-hover:opacity-100"
          )}>
            {/* Authenticate button for auth states */}
            {server.state === 'auth_required' && onAuthenticate && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onAuthenticate(server.id)}
                title="Authenticate this server"
              >
                <ShieldAlert className="h-3 w-3 mr-1" />
                Authenticate
              </Button>
            )}

            {/* Retry button for error states */}
            {server.state === 'error' && onRetry && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onRetry(server.id)}
                title="Retry starting the server"
              >
                <Activity className="h-3 w-3 mr-1" />
                Retry
              </Button>
            )}

            {/* Test connection button */}
            {onTest && !isActive && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onTest(server.id)}
                title="Test connection"
                disabled={isTesting}
              >
                {isTesting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Activity className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            )}

            {/* Delete button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onDelete(server.id)}
              title={server.isBuiltIn ? "Built-in servers cannot be deleted" : "Delete server"}
              disabled={isActive || server.isBuiltIn}
            >
              <Trash2 className={cn("h-4 w-4", server.isBuiltIn ? "text-muted-foreground/30" : "text-muted-foreground")} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
