import { Plug2, Loader2 } from "lucide-react"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import type { MCPServer } from "@/types/mcp"

interface MCPButtonProps {
  servers: MCPServer[]
  onToggle: (id: string, enabled: boolean) => void
  onSettingsClick: () => void
}

export function MCPButton({ servers, onSettingsClick }: MCPButtonProps) {
  // Count servers by state
  const connectedCount = servers.filter(s => s.enabled && s.state === 'connected').length
  const connectingCount = servers.filter(s => s.enabled && s.state === 'connecting').length
  const isLoading = connectingCount > 0

  // Build tooltip text
  const tooltipParts: string[] = []
  if (connectedCount > 0) tooltipParts.push(`${connectedCount} connected`)
  if (connectingCount > 0) tooltipParts.push(`${connectingCount} connecting...`)
  const tooltip = tooltipParts.length > 0
    ? `MCP Servers: ${tooltipParts.join(', ')}`
    : 'MCP Servers'

  return (
    <TooltipIconButton
      tooltip={tooltip}
      side="bottom"
      variant="ghost"
      className="aui-composer-mcp-button relative size-[34px] rounded-full p-1 text-xs font-semibold hover:bg-muted-foreground/15 dark:border-muted-foreground/15 dark:hover:bg-muted-foreground/30"
      aria-label="MCP Servers"
      onClick={onSettingsClick}
    >
      <Plug2 className="aui-mcp-icon size-5 stroke-[1.5px]" />

      {/* Loading indicator - shows when servers are connecting */}
      {isLoading && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </span>
      )}

      {/* Connected count badge - shows when not loading and has connected servers */}
      {!isLoading && connectedCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
          {connectedCount}
        </span>
      )}
    </TooltipIconButton>
  )
}
