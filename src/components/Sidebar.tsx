import { FC, useState } from "react"
import { Menu, Settings, Plus, MessageSquare, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThreadList } from "@/components/assistant-ui/thread-list"
import { cn } from "@/lib/utils"

interface SidebarProps {
  onSettingsClick: () => void
  onNewChat: () => void
}

export const Sidebar: FC<SidebarProps> = ({ onSettingsClick, onNewChat }) => {
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-background border-r transition-all duration-300",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex items-center justify-between p-4 border-b">
        {!isCollapsed && (
          <h1 className="text-xl font-semibold">OneChat</h1>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </Button>
      </div>

      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto p-2">
          <ThreadList />
        </div>
      )}

      {isCollapsed && (
        <div className="flex-1 flex flex-col gap-2 p-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onNewChat}
            className="w-full"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      )}

      <div className="border-t p-2">
        <Button
          variant="ghost"
          size={isCollapsed ? "icon" : "default"}
          onClick={onSettingsClick}
          className={cn("w-full", !isCollapsed && "justify-start")}
        >
          <Settings className="h-5 w-5" />
          {!isCollapsed && <span className="ml-2">Paramètres</span>}
        </Button>
      </div>
    </div>
  )
}