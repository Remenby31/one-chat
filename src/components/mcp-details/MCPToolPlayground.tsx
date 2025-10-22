import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Play, RotateCcw, Copy, Check } from "lucide-react"
import type { MCPServer, MCPTool } from "@/types/mcp"
import { useToolTester } from "@/lib/useMCPDetails"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useState } from "react"
import { toast } from "sonner"

interface MCPToolPlaygroundProps {
  server: MCPServer
  tool: MCPTool
}

export function MCPToolPlayground({ server, tool }: MCPToolPlaygroundProps) {
  const { args, updateArg, result, error, isRunning, runTool, reset } = useToolTester(server, tool)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const text = result ? JSON.stringify(result, null, 2) : ''
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  const renderInput = (key: string, prop: any, isRequired: boolean) => {
    const type = prop.type

    if (type === 'boolean') {
      return (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={args[key] || false}
            onChange={(e) => updateArg(key, e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <Label htmlFor={key} className="text-sm">
            {prop.description || key}
          </Label>
        </div>
      )
    }

    if (type === 'number' || type === 'integer') {
      return (
        <div className="space-y-1">
          <Label htmlFor={key} className="text-xs text-muted-foreground">
            {key}
            {isRequired && <span className="text-red-400 ml-1">*</span>}
          </Label>
          <Input
            id={key}
            type="number"
            value={args[key] ?? ''}
            onChange={(e) => updateArg(key, type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value))}
            placeholder={prop.description}
          />
        </div>
      )
    }

    if (type === 'array' || type === 'object') {
      return (
        <div className="space-y-1">
          <Label htmlFor={key} className="text-xs text-muted-foreground">
            {key}
            {isRequired && <span className="text-red-400 ml-1">*</span>}
          </Label>
          <Textarea
            id={key}
            value={typeof args[key] === 'string' ? args[key] : JSON.stringify(args[key], null, 2)}
            onChange={(e) => {
              try {
                updateArg(key, JSON.parse(e.target.value))
              } catch {
                updateArg(key, e.target.value)
              }
            }}
            placeholder={`JSON ${type}`}
            className="font-mono text-xs"
            rows={3}
          />
          {prop.description && (
            <p className="text-xs text-muted-foreground">{prop.description}</p>
          )}
        </div>
      )
    }

    // Default: string
    return (
      <div className="space-y-1">
        <Label htmlFor={key} className="text-xs text-muted-foreground">
          {key}
          {isRequired && <span className="text-red-400 ml-1">*</span>}
        </Label>
        <Input
          id={key}
          type="text"
          value={args[key] ?? ''}
          onChange={(e) => updateArg(key, e.target.value)}
          placeholder={prop.description}
        />
        {prop.description && (
          <p className="text-xs text-muted-foreground">{prop.description}</p>
        )}
      </div>
    )
  }

  const properties = tool.inputSchema.properties || {}
  const requiredFields = tool.inputSchema.required || []

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 pr-2">
        {/* Tool Header */}
        <div>
          <h3 className="text-lg font-semibold">{tool.name}</h3>
          {tool.description && (
            <p className="text-sm text-muted-foreground mt-1">{tool.description}</p>
          )}
        </div>

        {/* Parameters Form */}
        {Object.keys(properties).length > 0 ? (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Parameters</h4>
            {Object.entries(properties).map(([key, prop]: [string, any]) => (
              <div key={key}>
                {renderInput(key, prop, requiredFields.includes(key))}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No parameters required</p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            onClick={runTool}
            disabled={isRunning}
            size="sm"
          >
            <Play className="h-4 w-4 mr-2" />
            {isRunning ? 'Running...' : 'Run Tool'}
          </Button>

          {(result || error) && (
            <Button
              onClick={reset}
              variant="outline"
              size="sm"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Clear
            </Button>
          )}
        </div>

        {/* Result Display */}
        {result && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Result</h4>
              <Button
                onClick={handleCopy}
                variant="ghost"
                size="sm"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="bg-accent rounded-lg p-4 overflow-x-auto">
              <pre className="text-xs font-mono whitespace-pre-wrap">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-red-400 mb-2">Error</h4>
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Schema Display */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Input Schema</h4>
          <div className="bg-accent rounded-lg p-4 overflow-x-auto">
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {JSON.stringify(tool.inputSchema, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}
