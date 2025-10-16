import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SlimButton } from "@/components/ui/slim-button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FormField } from "@/components/ui/form-field"
import { CheckCircle2, ExternalLink, AlertCircle } from "lucide-react"
import type { MCPServer } from "@/types/mcp"
import { startOAuthFlow } from "@/lib/mcpAuth"
import { importSingleServerAsync } from "@/lib/mcpConfigAdapter"
import { useOAuthCallback } from "@/hooks/useOAuthCallback"

interface MCPDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  server?: MCPServer | null
  onSave: (server: Omit<MCPServer, 'id' | 'status' | 'connectedAt'>) => void
  opacity?: number
}

export function MCPDialog({ open, onOpenChange, server, onSave, opacity = 1 }: MCPDialogProps) {
  const [setupMode, setSetupMode] = useState<'manual' | 'json'>('manual')
  const [jsonInput, setJsonInput] = useState('')
  const [jsonError, setJsonError] = useState('')

  // OAuth discovery happens automatically in background during import

  const [formData, setFormData] = useState({
    name: '',
    command: 'npx',
    argsText: '',
    envText: '',
    requiresOAuth: false,
    oauthConfig: {
      clientId: '',
      clientSecret: undefined as string | undefined,
      authUrl: '',
      tokenUrl: '',
      scopes: [] as string[],
      accessToken: undefined as string | undefined,
      refreshToken: undefined as string | undefined,
      tokenExpiresAt: undefined as number | undefined,
      registrationAccessToken: undefined as string | undefined,
    }
  })

  // Handle OAuth callback
  useOAuthCallback(
    (serverId, oauthConfig) => {
      console.log('[MCPDialog] OAuth callback received:', { serverId, oauthConfig })

      // Update formData with received tokens
      setFormData(prev => ({
        ...prev,
        requiresOAuth: true,
        oauthConfig: {
          ...prev.oauthConfig,
          accessToken: oauthConfig.accessToken,
          refreshToken: oauthConfig.refreshToken,
          tokenExpiresAt: oauthConfig.tokenExpiresAt,
        }
      }))

      console.log('[MCPDialog] Form data updated with OAuth tokens')
    },
    (error) => {
      console.error('[MCPDialog] OAuth callback error:', error)
      alert(`OAuth authentication failed: ${error.message}`)
    }
  )

  // Load server data when editing
  useEffect(() => {
    if (server) {
      setFormData({
        name: server.name,
        command: server.command,
        argsText: server.args.join('\n'),
        envText: Object.entries(server.env || {})
          .map(([k, v]) => `${k}=${v}`)
          .join('\n'),
        requiresOAuth: server.requiresAuth && server.authType === 'oauth',
        oauthConfig: {
          clientId: server.oauthConfig?.clientId || '',
          clientSecret: server.oauthConfig?.clientSecret,
          authUrl: server.oauthConfig?.authUrl || '',
          tokenUrl: server.oauthConfig?.tokenUrl || '',
          scopes: server.oauthConfig?.scopes || [],
          accessToken: server.oauthConfig?.accessToken,
          refreshToken: server.oauthConfig?.refreshToken,
          tokenExpiresAt: server.oauthConfig?.tokenExpiresAt,
          registrationAccessToken: server.oauthConfig?.registrationAccessToken,
        }
      })
    } else {
      // Reset for new server
      setFormData({
        name: '',
        command: 'npx',
        argsText: '',
        envText: '',
        requiresOAuth: false,
        oauthConfig: {
          clientId: '',
          clientSecret: undefined,
          authUrl: '',
          tokenUrl: '',
          scopes: [],
          accessToken: undefined,
          refreshToken: undefined,
          tokenExpiresAt: undefined,
          registrationAccessToken: undefined,
        }
      })
    }
    setJsonInput('')
    setJsonError('')
    setSetupMode('manual')
  }, [server, open])

  // Parse args from textarea
  const parseArgs = (text: string): string[] => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
  }

  // Parse env from textarea (KEY=value format)
  const parseEnv = (text: string): Record<string, string> => {
    const env: Record<string, string> = {}
    text.split('\n').forEach(line => {
      const trimmed = line.trim()
      if (!trimmed) return

      const equalIndex = trimmed.indexOf('=')
      if (equalIndex === -1) return

      const key = trimmed.slice(0, equalIndex).trim()
      const value = trimmed.slice(equalIndex + 1).trim()

      if (key && value) {
        env[key] = value
      }
    })
    return env
  }

  // Handle JSON import (with automatic silent OAuth discovery)
  const handleImportJSON = async () => {
    setJsonError('')

    try {
      // OAuth discovery happens automatically in background via importSingleServerAsync
      const parsedServer = await importSingleServerAsync(jsonInput)

      if (!parsedServer) {
        setJsonError('Invalid JSON format. Expected: { "mcpServers": { "name": { "command": "...", "args": [...] } } } or HTTP format with "type": "http"')
        return
      }

      // Auto-fill form with parsed data (OAuth config included if discovered)
      setFormData({
        name: parsedServer.name,
        command: parsedServer.command,
        argsText: parsedServer.args.join('\n'),
        envText: Object.entries(parsedServer.env || {})
          .map(([k, v]) => `${k}=${v}`)
          .join('\n'),
        requiresOAuth: parsedServer.requiresAuth && parsedServer.authType === 'oauth',
        oauthConfig: {
          clientId: parsedServer.oauthConfig?.clientId || '',
          clientSecret: parsedServer.oauthConfig?.clientSecret,
          authUrl: parsedServer.oauthConfig?.authUrl || '',
          tokenUrl: parsedServer.oauthConfig?.tokenUrl || '',
          scopes: parsedServer.oauthConfig?.scopes || [],
          accessToken: parsedServer.oauthConfig?.accessToken,
          refreshToken: parsedServer.oauthConfig?.refreshToken,
          tokenExpiresAt: parsedServer.oauthConfig?.tokenExpiresAt,
          registrationAccessToken: parsedServer.oauthConfig?.registrationAccessToken,
        }
      })

      // Switch to manual tab to review
      setSetupMode('manual')
    } catch (error) {
      setJsonError(`Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Handle OAuth authentication
  const handleAuthenticate = async () => {
    if (!formData.name) {
      alert('Please enter a server name first')
      return
    }
    if (!formData.oauthConfig.authUrl) {
      alert('Please configure OAuth URLs first')
      return
    }

    console.log('[MCPDialog] Starting OAuth with config:', {
      clientId: formData.oauthConfig.clientId,
      authUrl: formData.oauthConfig.authUrl,
      tokenUrl: formData.oauthConfig.tokenUrl,
      scopes: formData.oauthConfig.scopes
    })

    try {
      const serverToAuth: MCPServer = {
        ...formData,
        id: server?.id || 'temp',
        enabled: true,
        args: parseArgs(formData.argsText),
        env: parseEnv(formData.envText),
        requiresAuth: formData.requiresOAuth,
        authType: formData.requiresOAuth ? 'oauth' : 'none',
        status: 'idle',
        oauthConfig: formData.oauthConfig // Explicitly pass oauthConfig
      } as MCPServer

      console.log('[MCPDialog] Server oauthConfig.clientId:', serverToAuth.oauthConfig?.clientId)

      await startOAuthFlow(serverToAuth)
    } catch (error) {
      console.error('OAuth flow error:', error)
      alert(`Failed to start OAuth flow: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Handle save
  const handleSave = () => {
    if (!formData.name || !formData.command) {
      alert('Please fill in required fields: Name and Command')
      return
    }

    const args = parseArgs(formData.argsText)
    if (args.length === 0) {
      alert('Please provide at least one argument')
      return
    }

    onSave({
      name: formData.name,
      command: formData.command,
      args,
      enabled: true,
      requiresAuth: formData.requiresOAuth,
      authType: formData.requiresOAuth ? 'oauth' : 'none',
      env: parseEnv(formData.envText),
      oauthConfig: formData.requiresOAuth ? formData.oauthConfig : undefined,
    })

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
        style={{ '--ui-opacity': `${opacity * 100}%` } as React.CSSProperties}
      >
        <DialogHeader>
          <DialogTitle>{server ? 'Edit MCP Server' : 'Add MCP Server'}</DialogTitle>
        </DialogHeader>

        <Tabs value={setupMode} onValueChange={(v) => setSetupMode(v as 'manual' | 'json')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Manual Setup</TabsTrigger>
            <TabsTrigger value="json">Import JSON</TabsTrigger>
          </TabsList>

          {/* Manual Setup Tab */}
          <TabsContent value="manual" className="space-y-4 mt-4">
            <FormField
              label="Name"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., stripe"
              required
            />

            <FormField
              label="Command"
              id="command"
              value={formData.command}
              onChange={(e) => setFormData({ ...formData, command: e.target.value })}
              placeholder="e.g., npx"
              required
            />

            <div>
              <Label htmlFor="args" className="text-sm font-medium block mb-2">
                Arguments <span className="text-muted-foreground font-normal">(one per line)</span>
              </Label>
              <Textarea
                id="args"
                value={formData.argsText}
                onChange={(e) => setFormData({ ...formData, argsText: e.target.value })}
                placeholder={`-y\n@stripe/mcp\n--tools=all`}
                rows={5}
                className="font-mono text-sm"
              />
            </div>

            <div>
              <Label htmlFor="env" className="text-sm font-medium block mb-2">
                Environment Variables <span className="text-muted-foreground font-normal">(KEY=value format)</span>
              </Label>
              <Textarea
                id="env"
                value={formData.envText}
                onChange={(e) => setFormData({ ...formData, envText: e.target.value })}
                placeholder={`STRIPE_KEY=$STRIPE_API_KEY\nAPI_URL=https://api.stripe.com`}
                rows={4}
                className="font-mono text-sm"
              />
            </div>

            {/* Discrete Authentication Status Indicator */}
            {formData.requiresOAuth && formData.oauthConfig.accessToken && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 pt-2">
                <CheckCircle2 className="h-4 w-4" />
                <span>Authenticated</span>
                {formData.oauthConfig.tokenExpiresAt && (
                  <span className="text-xs text-muted-foreground">
                    (expires {new Date(formData.oauthConfig.tokenExpiresAt).toLocaleDateString()})
                  </span>
                )}
              </div>
            )}
          </TabsContent>

          {/* Import JSON Tab */}
          <TabsContent value="json" className="space-y-4 mt-4">
            <div>
              <Label htmlFor="jsonInput" className="text-sm font-medium block mb-2">
                Paste JSON Configuration
              </Label>
              <Textarea
                id="jsonInput"
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder={`{\n  "mcpServers": {\n    "supabase": {\n      "type": "http",\n      "url": "https://mcp.supabase.com/mcp"\n    }\n  }\n}`}
                rows={12}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Paste the server configuration from Claude Desktop or MCP documentation
              </p>
            </div>

            {jsonError && (
              <div className="flex items-start gap-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-md">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                <p className="text-sm text-destructive">{jsonError}</p>
              </div>
            )}

            <SlimButton onClick={handleImportJSON} className="w-full">
              Parse and Auto-fill
            </SlimButton>
          </TabsContent>
        </Tabs>

        {/* Actions - Smart button based on OAuth authentication state */}
        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <SlimButton variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </SlimButton>

          {/* Show "Authenticate" if OAuth required and not authenticated, otherwise "Add Server" */}
          {formData.requiresOAuth && !formData.oauthConfig.accessToken ? (
            <SlimButton
              onClick={handleAuthenticate}
              disabled={!formData.oauthConfig.authUrl || !formData.name}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Authenticate
            </SlimButton>
          ) : (
            <SlimButton onClick={handleSave}>
              {server ? 'Save Changes' : 'Add Server'}
            </SlimButton>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
