import { Plug2 } from "lucide-react"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import type { MCPServer } from "@/types/mcp"

interface MCPButtonProps {
  servers: MCPServer[]
  onToggle: (id: string, enabled: boolean) => void
  onSettingsClick: () => void
}

export function MCPButton({ servers, onSettingsClick }: MCPButtonProps) {
  // Count active servers
  const activeServersCount = servers.filter(s => s.enabled && s.state === 'connected').length

  return (
    <TooltipIconButton
      tooltip="MCP Servers"
      side="bottom"
      variant="ghost"
      className="aui-composer-mcp-button relative size-[34px] rounded-full p-1 text-xs font-semibold hover:bg-muted-foreground/15 dark:border-muted-foreground/15 dark:hover:bg-muted-foreground/30"
      aria-label="MCP Servers"
      onClick={onSettingsClick}
    >
      <Plug2 className="aui-mcp-icon size-5 stroke-[1.5px]" />
      {activeServersCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
          {activeServersCount}
        </span>
      )}
    </TooltipIconButton>
  )
}
