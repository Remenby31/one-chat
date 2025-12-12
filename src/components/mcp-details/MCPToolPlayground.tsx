import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Play, RotateCcw, Copy, Check } from "lucide-react"
import type { MCPServer, MCPTool } from "@/types/mcp"
import { useToolTester } from "@/lib/useMCPDetails"
import { useState } from "react"
import { toast } from "sonner"

interface MCPToolPlaygroundProps {
  server: MCPServer
  tool: MCPTool
}

export function MCPToolPlayground({ server, tool }: MCPToolPlaygroundProps) {
  const { args, updateArg, result, error, isRunning, runTool, reset } = useToolTester(server, tool)
  const [copied, setCopied] = useState(false)

  // Extract actual content from MCP result format
  const getDisplayResult = () => {
    if (!result) return ''

    // MCP returns { content: [{ type: "text", text: "..." }] }
    if (result.content && Array.isArray(result.content)) {
      const texts = result.content
        .filter((c: any) => c.type === 'text' && c.text)
        .map((c: any) => {
          // Try to parse nested JSON
          try {
            const parsed = JSON.parse(c.text)
            return JSON.stringify(parsed, null, 2)
          } catch {
            return c.text
          }
        })
      return texts.join('\n')
    }

    return JSON.stringify(result, null, 2)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(getDisplayResult())
    setCopied(true)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  const renderInput = (key: string, prop: any, isRequired: boolean) => {
    const type = prop.type
    const labelWithDescription = (
      <div className="space-y-0.5">
        <span className="text-xs font-medium">
          {key}
          {isRequired && <span className="text-red-400 ml-0.5">*</span>}
          <span className="text-muted-foreground font-normal ml-2">{type}</span>
        </span>
        {prop.description && (
          <p className="text-xs text-muted-foreground">{prop.description}</p>
        )}
      </div>
    )

    if (type === 'boolean') {
      return (
        <div className="flex items-start gap-3 py-1">
          <input
            type="checkbox"
            checked={args[key] || false}
            onChange={(e) => updateArg(key, e.target.checked)}
            className="h-4 w-4 rounded border-input mt-0.5"
          />
          {labelWithDescription}
        </div>
      )
    }

    if (type === 'number' || type === 'integer') {
      return (
        <div className="space-y-1.5">
          {labelWithDescription}
          <Input
            id={key}
            type="number"
            value={args[key] ?? ''}
            onChange={(e) => updateArg(key, type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value))}
            className="h-8"
          />
        </div>
      )
    }

    if (type === 'array' || type === 'object') {
      return (
        <div className="space-y-1.5">
          {labelWithDescription}
          <Input
            id={key}
            value={typeof args[key] === 'string' ? args[key] : JSON.stringify(args[key])}
            onChange={(e) => {
              try {
                updateArg(key, JSON.parse(e.target.value))
              } catch {
                updateArg(key, e.target.value)
              }
            }}
            placeholder="[]"
            className="h-8 font-mono text-xs"
          />
        </div>
      )
    }

    // Default: string
    return (
      <div className="space-y-1.5">
        {labelWithDescription}
        <Input
          id={key}
          type="text"
          value={args[key] ?? ''}
          onChange={(e) => updateArg(key, e.target.value)}
          className="h-8"
        />
      </div>
    )
  }

  const properties = tool.inputSchema.properties || {}
  const requiredFields = tool.inputSchema.required || []

  return (
    <div className="h-full overflow-y-auto scrollbar-none">
      <div className="space-y-4">
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
            className="flex-1 h-8"
          >
            <Play className="h-3 w-3 mr-2" />
            {isRunning ? 'Running...' : 'Run'}
          </Button>

          {(result || error) && (
            <Button
              onClick={reset}
              variant="outline"
              className="h-8"
            >
              <RotateCcw className="h-3 w-3" />
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
            <div className="bg-accent rounded-lg p-3 overflow-x-auto">
              <pre className="text-xs font-mono whitespace-pre-wrap">
                {getDisplayResult()}
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
      </div>
    </div>
  )
}
