import { Button } from "@/components/ui/button"
import { Play, Square, RotateCw, Activity, ShieldAlert, Wrench, FileText, MessageSquare } from "lucide-react"
import type { MCPServer } from "@/types/mcp"
import { mcpManager } from "@/lib/mcpManager"
import { useMCPDetails } from "@/lib/useMCPDetails"
import { useState } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface MCPOverviewProps {
  server: MCPServer
}

export function MCPOverview({ server }: MCPOverviewProps) {
  const { capabilities, isLoading, error, fetchCapabilities } = useMCPDetails(server)
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [isTesting, setIsTesting] = useState(false)

  const isRunning = server.state === 'connected'
  const canStart = ['idle', 'error'].includes(server.state)

  const handleStart = async () => {
    setIsStarting(true)
    try {
      await mcpManager.startServer(server)
      toast.success(`Server ${server.name} started`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start server')
    } finally {
      setIsStarting(false)
    }
  }

  const handleStop = async () => {
    setIsStopping(true)
    try {
      await mcpManager.stopServer(server.id)
      toast.success(`Server ${server.name} stopped`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to stop server')
    } finally {
      setIsStopping(false)
    }
  }

  const handleRestart = async () => {
    await handleStop()
    setTimeout(() => handleStart(), 500)
  }

  const handleTest = async () => {
    setIsTesting(true)
    try {
      const result = await mcpManager.testConnection(server)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Test failed')
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Capabilities Summary */}
      {isRunning && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Capabilities</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className={cn(
              "border rounded-lg p-4 transition-all",
              capabilities?.tools && capabilities.tools.length > 0
                ? "bg-primary/5 border-primary/30 hover:border-primary/50"
                : "bg-accent/50 border-border opacity-60"
            )}>
              <div className="flex items-center justify-between mb-2">
                <Wrench className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">
                  {isLoading ? '...' : capabilities?.tools?.length || 0}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Tools Available</p>
            </div>

            <div className={cn(
              "border rounded-lg p-4 transition-all",
              capabilities?.resources && capabilities.resources.length > 0
                ? "bg-primary/5 border-primary/30 hover:border-primary/50"
                : "bg-accent/50 border-border opacity-60"
            )}>
              <div className="flex items-center justify-between mb-2">
                <FileText className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">
                  {isLoading ? '...' : capabilities?.resources?.length || 0}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Resources</p>
            </div>

            <div className={cn(
              "border rounded-lg p-4 transition-all",
              capabilities?.prompts && capabilities.prompts.length > 0
                ? "bg-primary/5 border-primary/30 hover:border-primary/50"
                : "bg-accent/50 border-border opacity-60"
            )}>
              <div className="flex items-center justify-between mb-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">
                  {isLoading ? '...' : capabilities?.prompts?.length || 0}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Prompts</p>
            </div>
          </div>
        </div>
      )}
      {/* Actions */}
      <div className="flex gap-2">
        {canStart && (
          <Button
            onClick={handleStart}
            disabled={isStarting}
            size="sm"
          >
            <Play className="h-4 w-4 mr-2" />
            {isStarting ? 'Starting...' : 'Start'}
          </Button>
        )}

        {isRunning && (
          <>
            <Button
              onClick={handleStop}
              disabled={isStopping}
              variant="outline"
              size="sm"
            >
              <Square className="h-4 w-4 mr-2" />
              {isStopping ? 'Stopping...' : 'Stop'}
            </Button>

            <Button
              onClick={handleRestart}
              disabled={isStarting || isStopping}
              variant="outline"
              size="sm"
            >
              <RotateCw className="h-4 w-4 mr-2" />
              Restart
            </Button>
          </>
        )}

        <Button
          onClick={handleTest}
          disabled={isTesting}
          variant="outline"
          size="sm"
        >
          <Activity className="h-4 w-4 mr-2" />
          {isTesting ? 'Testing...' : 'Test Connection'}
        </Button>
      </div>

      {/* Configuration */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Configuration</h3>
        <div className="bg-accent/50 rounded-lg p-3 text-sm">
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 items-start">
            <span className="text-muted-foreground">Command</span>
            <code className="font-mono text-xs bg-background/50 px-2 py-1 rounded break-all">
              {server.command} {(server.args || []).join(' ')}
            </code>

            <span className="text-muted-foreground">Auth</span>
            <code className="font-mono text-xs bg-background/50 px-2 py-1 rounded">
              {server.requiresAuth ? (
                <span className="flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  {server.authType === 'oauth' ? 'OAuth 2.1' : 'Token'}
                </span>
              ) : (
                'None'
              )}
            </code>

            {server.env && Object.keys(server.env).length > 0 && (
              Object.entries(server.env).map(([key, value]) => (
                <>
                  <span key={`${key}-label`} className="text-muted-foreground">{key}</span>
                  <code key={`${key}-value`} className="font-mono text-xs bg-background/50 px-2 py-1 rounded break-all">
                    {value}
                  </code>
                </>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-sm text-red-400">{error}</p>
          <Button
            onClick={() => fetchCapabilities(true)}
            variant="outline"
            size="sm"
            className="mt-2"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Error Message */}
      {server.error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-sm text-red-400">{server.error}</p>
        </div>
      )}
    </div>
  )
}
