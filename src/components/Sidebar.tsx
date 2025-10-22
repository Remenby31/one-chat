import { useState, type FC } from "react"
import { Menu, Settings, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThreadList } from "@/components/assistant-ui/thread-list"
import { cn } from "@/lib/utils"

interface SidebarProps {
  onSettingsClick: () => void
  onNewChat: () => void
  opacity?: number
}

export const Sidebar: FC<SidebarProps> = ({ onSettingsClick, onNewChat, opacity = 95 }) => {
  const [isCollapsed, setIsCollapsed] = useState(true)

  return (
    <div
      className={cn(
        "flex flex-col h-full transition-all duration-300 ease-in-out",
        isCollapsed ? "w-12 border-none" : "w-64 border-r"
      )}
      style={!isCollapsed ? { backgroundColor: `hsl(var(--background) / ${opacity}%)` } : undefined}
    >
      <div className={cn(
        "flex items-center justify-between",
        isCollapsed ? "px-2 py-3" : "p-4"
      )}>
        <h1 className={cn(
          "text-xl font-semibold transition-opacity duration-200",
          isCollapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100 delay-200"
        )}>
          Jarvis
        </h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {isCollapsed && (
        <div className="px-2 pb-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onNewChat}
            className="w-full"
            aria-label="New chat"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      )}

      <div className={cn(
        "flex-1 overflow-y-auto p-2 scrollbar-hide transition-opacity duration-200",
        isCollapsed ? "opacity-0 invisible" : "opacity-100 delay-200"
      )}>
        <ThreadList />
      </div>

      <div className="p-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onSettingsClick}
          className="w-full"
        >
          <Settings className="h-5 w-5" />
          <span className={cn(
            "ml-2 transition-opacity duration-200",
            isCollapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100 delay-200"
          )}>
            Settings
          </span>
        </Button>
      </div>
    </div>
  )
}