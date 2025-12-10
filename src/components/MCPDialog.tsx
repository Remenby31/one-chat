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
import { FormField } from "@/components/ui/form-field"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { CheckCircle2, AlertCircle, ShieldAlert, ShieldCheck, Plus, Save, ChevronRight, ChevronLeft, HelpCircle } from "lucide-react"
import type { MCPServer } from "@/types/mcp"
import { mcpManager } from "@/lib/mcpManager"
import { useOAuthCallback } from "@/hooks/useOAuthCallback"
import { showErrorToast, showWarningToast } from "@/lib/errorToast"

interface MCPDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  server?: MCPServer | null
  onSave: (server: Omit<MCPServer, 'id' | 'state' | 'connectedAt'>) => void
}

export function MCPDialog({ open, onOpenChange, server, onSave }: MCPDialogProps) {
  const [setupMode, setSetupMode] = useState<'manual' | 'json'>('json')
  const [jsonInput, setJsonInput] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [isJsonValid, setIsJsonValid] = useState(false)
  const [parsedServer, setParsedServer] = useState<Omit<MCPServer, 'id' | 'state' | 'connectedAt'> | null>(null)
  const [isParsingJson, setIsParsingJson] = useState(false)
  const [autoSaveAfterOAuth, setAutoSaveAfterOAuth] = useState(false)

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
    }
  })

  // Handle OAuth callback
  useOAuthCallback(
    (serverId, oauthConfig) => {
      console.log('[MCPDialog] OAuth callback received:', { serverId, oauthConfig })

      // Check if we should auto-save (from JSON import flow)
      const shouldAutoSave = autoSaveAfterOAuth
      console.log('[MCPDialog] Auto-save after OAuth:', shouldAutoSave)

      // Update formData with received tokens
      setFormData(prev => {
        const updated = {
          ...prev,
          requiresOAuth: true,
          oauthConfig: {
            ...prev.oauthConfig,
            accessToken: oauthConfig.accessToken,
            refreshToken: oauthConfig.refreshToken,
            tokenExpiresAt: oauthConfig.tokenExpiresAt,
          }
        }

        return updated
      })

      // Update parsedServer with tokens if it exists
      if (parsedServer) {
        setParsedServer({
          ...parsedServer,
          oauthConfig: {
            ...parsedServer.oauthConfig!,
            accessToken: oauthConfig.accessToken,
            refreshToken: oauthConfig.refreshToken,
            tokenExpiresAt: oauthConfig.tokenExpiresAt,
          }
        })
      }

      // Auto-save if flag was set
      if (shouldAutoSave) {
        console.log('[MCPDialog] Auto-saving server after OAuth...')

        // Use current formData values
        setFormData(prev => {
          const args = parseArgs(prev.argsText)
          const env = parseEnv(prev.envText)

          onSave({
            name: prev.name,
            command: prev.command,
            args,
            enabled: true,
            requiresAuth: true,
            authType: 'oauth',
            env,
            oauthConfig: {
              ...prev.oauthConfig,
              accessToken: oauthConfig.accessToken,
              refreshToken: oauthConfig.refreshToken,
              tokenExpiresAt: oauthConfig.tokenExpiresAt,
            },
          })

          onOpenChange(false)
          setAutoSaveAfterOAuth(false)

          return prev
        })
      } else {
        console.log('[MCPDialog] OAuth complete, ready to add server')
      }
    },
    (error) => {
      console.error('[MCPDialog] OAuth callback error:', error)
      showErrorToast('OAuth authentication failed', error.message)
      setAutoSaveAfterOAuth(false)
    }
  )

  // Parse MCP server configuration from JSON
  const parseServerConfig = (text: string): Omit<MCPServer, 'id' | 'state' | 'connectedAt'> | null => {
    try {
      const parsed = JSON.parse(text)
      const mcpServers = parsed.mcpServers

      if (!mcpServers || typeof mcpServers !== 'object') {
        return null
      }

      // Get the first server
      const serverNames = Object.keys(mcpServers)
      if (serverNames.length === 0) return null

      const serverName = serverNames[0]
      const serverConfig = mcpServers[serverName]

      // Build server object
      const server: Omit<MCPServer, 'id' | 'state' | 'connectedAt'> = {
        name: serverName,
        command: serverConfig.command || 'npx',
        args: serverConfig.args || [],
        env: serverConfig.env || {},
        enabled: true,
        requiresAuth: false,
        authType: 'none',
      }

      // Handle HTTP URL (remote server)
      if (serverConfig.url) {
        server.httpUrl = serverConfig.url
        // HTTP servers often require OAuth
        server.requiresAuth = true
        server.authType = 'oauth'
        server.oauthConfig = {
          authUrl: serverConfig.url.replace(/\/mcp$/, '/oauth/authorize'),
          tokenUrl: serverConfig.url.replace(/\/mcp$/, '/oauth/token'),
          scopes: [],
        }
      }

      return server
    } catch {
      return null
    }
  }

  // Validate JSON input in real-time
  const validateJsonInput = (text: string) => {
    if (!text.trim()) {
      setIsJsonValid(false)
      setJsonError('')
      setParsedServer(null)
      return
    }

    // Basic JSON validation
    try {
      const parsed = JSON.parse(text)
      const hasMcpServers = parsed.mcpServers && typeof parsed.mcpServers === 'object'

      if (!hasMcpServers) {
        setIsJsonValid(false)
        setJsonError('Missing "mcpServers" object')
        setParsedServer(null)
        return
      }

      // Parse server configuration
      const server = parseServerConfig(text)

      if (server) {
        setIsJsonValid(true)
        setParsedServer(server)
        setJsonError('')
      } else {
        setIsJsonValid(false)
        setParsedServer(null)
        setJsonError('Unable to parse server configuration')
      }
    } catch {
      setIsJsonValid(false)
      setJsonError('Invalid JSON syntax')
      setParsedServer(null)
    }
  }

  // Handle JSON input change with debounced validation
  const handleJsonInputChange = (text: string) => {
    setJsonInput(text)
    // Validation will be triggered by useEffect with debounce
  }

  // Debounced validation - runs 500ms after user stops typing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      validateJsonInput(jsonInput)
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [jsonInput])

  // Load server data when editing
  useEffect(() => {
    if (server) {
      setFormData({
        name: server.name,
        command: server.command || 'npx',
        argsText: (server.args || []).join('\n'),
        envText: Object.entries(server.env || {})
          .map(([k, v]) => `${k}=${v}`)
          .join('\n'),
        requiresOAuth: !!(server.requiresAuth && server.authType === 'oauth'),
        oauthConfig: {
          clientId: server.oauthConfig?.clientId || '',
          clientSecret: server.oauthConfig?.clientSecret,
          authUrl: server.oauthConfig?.authUrl || '',
          tokenUrl: server.oauthConfig?.tokenUrl || '',
          scopes: server.oauthConfig?.scopes || [],
          accessToken: server.oauthConfig?.accessToken,
          refreshToken: server.oauthConfig?.refreshToken,
          tokenExpiresAt: server.oauthConfig?.tokenExpiresAt,
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
        }
      })
    }
    setJsonInput('')
    setJsonError('')
    setIsJsonValid(false)
    setParsedServer(null)
    setIsParsingJson(false)
    setAutoSaveAfterOAuth(false)
    setSetupMode('json')
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

  // Handle JSON import and direct save (already parsed with OAuth discovery)
  const handleImportJSON = async () => {
    // parsedServer is already set by validateJsonInput
    if (!parsedServer) {
      setJsonError('No server configuration to import')
      return
    }

    const requiresOAuth = parsedServer.requiresAuth && parsedServer.authType === 'oauth'
    const hasToken = !!parsedServer.oauthConfig?.accessToken

    // If OAuth required but no token yet, launch authentication directly
    if (requiresOAuth && !hasToken) {
      // Fill form with parsed data
      setFormData({
        name: parsedServer.name,
        command: parsedServer.command || 'npx',
        argsText: (parsedServer.args || []).join('\n'),
        envText: Object.entries(parsedServer.env || {})
          .map(([k, v]) => `${k}=${v}`)
          .join('\n'),
        requiresOAuth: true,
        oauthConfig: {
          clientId: parsedServer.oauthConfig?.clientId || '',
          clientSecret: parsedServer.oauthConfig?.clientSecret,
          authUrl: parsedServer.oauthConfig?.authUrl || '',
          tokenUrl: parsedServer.oauthConfig?.tokenUrl || '',
          scopes: parsedServer.oauthConfig?.scopes || [],
          accessToken: undefined,
          refreshToken: undefined,
          tokenExpiresAt: undefined,
        }
      })

      // Set auto-save flag so we save after OAuth completes
      setAutoSaveAfterOAuth(true)

      // Launch OAuth flow via mcpManager
      try {
        await mcpManager.startOAuthFlow('temp', parsedServer.oauthConfig)
      } catch (error) {
        console.error('OAuth flow error:', error)
        showErrorToast('Failed to start OAuth flow', error instanceof Error ? error.message : 'Unknown error')
        setAutoSaveAfterOAuth(false)
      }
      return
    }

    // Ready to save directly - no OAuth or already has token
    onSave(parsedServer)
    onOpenChange(false)
  }

  // Handle OAuth authentication
  const handleAuthenticate = async () => {
    if (!formData.name) {
      showWarningToast('Missing server name', 'Please enter a server name first')
      return
    }
    if (!formData.oauthConfig.authUrl) {
      showWarningToast('Missing OAuth configuration', 'Please configure OAuth URLs first')
      return
    }

    console.log('[MCPDialog] Starting OAuth with config:', {
      clientId: formData.oauthConfig.clientId,
      authUrl: formData.oauthConfig.authUrl,
      tokenUrl: formData.oauthConfig.tokenUrl,
      scopes: formData.oauthConfig.scopes
    })

    try {
      const serverId = server?.id || 'temp'
      await mcpManager.startOAuthFlow(serverId, formData.oauthConfig)
    } catch (error) {
      console.error('OAuth flow error:', error)
      showErrorToast('Failed to start OAuth flow', error instanceof Error ? error.message : 'Unknown error')
    }
  }

  // Determine primary button state
  const getPrimaryButtonConfig = () => {
    const isEditing = !!server
    const hasOAuth = formData.requiresOAuth
    const hasToken = !!formData.oauthConfig.accessToken
    const isTokenExpiringSoon = formData.oauthConfig.tokenExpiresAt
      ? (formData.oauthConfig.tokenExpiresAt - Date.now()) < (24 * 60 * 60 * 1000) // Less than 24h
      : false

    // OAuth required but not authenticated
    if (hasOAuth && !hasToken) {
      return {
        text: 'Authenticate',
        icon: ShieldAlert,
        action: handleAuthenticate,
        disabled: !formData.oauthConfig.authUrl || !formData.name,
        variant: 'default' as const
      }
    }

    // OAuth authenticated but token expiring soon - suggest re-auth
    if (hasOAuth && hasToken && isTokenExpiringSoon) {
      return {
        text: isEditing ? 'Save & Re-authenticate' : 'Add & Re-authenticate',
        icon: ShieldAlert,
        action: async () => {
          handleSave()
          await handleAuthenticate()
        },
        disabled: !formData.name || !formData.command,
        variant: 'default' as const,
        showWarning: true
      }
    }

    // Normal save/add
    return {
      text: isEditing ? 'Save Changes' : 'Add Server',
      icon: isEditing ? Save : Plus,
      action: handleSave,
      disabled: !formData.name || !formData.command,
      variant: 'default' as const
    }
  }

  // Handle save
  const handleSave = () => {
    if (!formData.name || !formData.command) {
      showWarningToast('Missing required fields', 'Please fill in Name and Command')
      return
    }

    const args = parseArgs(formData.argsText)
    if (args.length === 0) {
      showWarningToast('Missing arguments', 'Please provide at least one argument')
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
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{server ? 'Edit MCP Server' : 'Add MCP Server'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {setupMode === 'json' ? (
            <>
              {/* Import JSON Section */}
              <TooltipProvider>
                <div>
                  <div className="relative">
                    <Textarea
                      id="jsonInput"
                      value={jsonInput}
                      onChange={(e) => handleJsonInputChange(e.target.value)}
                      placeholder={`{\n  "mcpServers": {\n    "notion": {\n      "url": "https://mcp.notion.com/mcp"\n    }\n  }\n}`}
                      rows={8}
                      className="font-mono text-sm pr-10"
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <HelpCircle className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-md">
                        <div className="space-y-3 text-xs">
                          <div>
                            <p className="font-semibold mb-1">Qu'est-ce qu'un serveur MCP ?</p>
                            <p className="text-muted-foreground leading-relaxed">
                              Les serveurs MCP sont des extensions qui ajoutent de nouvelles capacités à l'IA :
                              accès à des bases de données (Supabase, PostgreSQL), services web (Stripe, GitHub),
                              ou outils spécialisés.
                            </p>
                          </div>

                          <div>
                            <p className="font-semibold mb-1">Comment ajouter un serveur ?</p>
                            <p className="text-muted-foreground leading-relaxed mb-2">
                              Copiez-collez la configuration JSON depuis la documentation du service ou
                              depuis votre fichier Claude Desktop.
                            </p>
                          </div>

                          <div className="space-y-2 pt-1 border-t">
                            <p className="font-semibold">Exemples de configurations :</p>
                            <div className="space-y-2">
                              <div>
                                <p className="text-muted-foreground mb-1">
                                  <span className="font-medium">Stripe</span> - Gestion des paiements
                                </p>
                                <code className="block text-xs bg-muted/50 p-1.5 rounded">
                                  {`{
  "mcpServers": {
    "stripe": {
      "command": "npx",
      "args": ["-y", "@stripe/mcp"]
    }
  }
}`}
                                </code>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-1">
                                  <span className="font-medium">Notion</span> - Notes et documentation
                                </p>
                                <code className="block text-xs bg-muted/50 p-1.5 rounded">
                                  {`{
  "mcpServers": {
    "notion": {
      "url": "https://mcp.notion.com/mcp"
    }
  }
}`}
                                </code>
                              </div>
                            </div>
                          </div>

                          <div className="pt-1 border-t">
                            <p className="text-muted-foreground leading-relaxed">
                              💡 Consultez la documentation du service pour obtenir sa configuration MCP.
                            </p>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  {jsonError && (
                    <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {jsonError}
                    </p>
                  )}
                </div>
              </TooltipProvider>

              <SlimButton
                onClick={handleImportJSON}
                disabled={!isJsonValid || isParsingJson}
                className="w-full transition-all duration-200"
              >
                {isParsingJson ? (
                  <>
                    <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Checking...
                  </>
                ) : parsedServer?.requiresAuth && parsedServer?.authType === 'oauth' && !parsedServer?.oauthConfig?.accessToken ? (
                  <>
                    <ShieldAlert className="h-4 w-4 mr-2" />
                    Authenticate
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Server
                  </>
                )}
              </SlimButton>

              {/* Subtle link to switch to manual setup */}
              <button
                type="button"
                onClick={() => setSetupMode('manual')}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-full justify-center pt-2"
              >
                <span>Advanced setup</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              {/* Back to import link */}
              <button
                type="button"
                onClick={() => setSetupMode('json')}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors -mt-2 mb-2"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Back to import</span>
              </button>

              {/* Manual Setup Section */}
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
                  Arguments
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
                  Environment Variables
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

              {/* Authentication Status Indicator */}
              {formData.requiresOAuth && (
                <>
                  {formData.oauthConfig.accessToken ? (
                    (() => {
                      const isExpiringSoon = formData.oauthConfig.tokenExpiresAt
                        ? (formData.oauthConfig.tokenExpiresAt - Date.now()) < (24 * 60 * 60 * 1000)
                        : false
                      const isExpired = formData.oauthConfig.tokenExpiresAt
                        ? formData.oauthConfig.tokenExpiresAt < Date.now()
                        : false

                      if (isExpired) {
                        return (
                          <div className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400 pt-2">
                            <AlertCircle className="h-4 w-4" />
                            <span>Token expired - please re-authenticate</span>
                          </div>
                        )
                      }

                      if (isExpiringSoon) {
                        return (
                          <div className="flex items-center gap-2 text-sm text-yellow-600 dark:text-yellow-400 pt-2">
                            <AlertCircle className="h-4 w-4" />
                            <span>Authenticated (expires soon)</span>
                            {formData.oauthConfig.tokenExpiresAt && (
                              <span className="text-xs text-muted-foreground">
                                ({new Date(formData.oauthConfig.tokenExpiresAt).toLocaleDateString()})
                              </span>
                            )}
                          </div>
                        )
                      }

                      return (
                        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 pt-2">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Authenticated</span>
                          {formData.oauthConfig.tokenExpiresAt && (
                            <span className="text-xs text-muted-foreground">
                              (expires {new Date(formData.oauthConfig.tokenExpiresAt).toLocaleDateString()})
                            </span>
                          )}
                        </div>
                      )
                    })()
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
                      <ShieldAlert className="h-4 w-4" />
                      <span>Authentication required - click Authenticate to continue</span>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Actions - Only show in manual mode */}
        {setupMode === 'manual' && (
          <div className="flex justify-end gap-2 pt-4 border-t mt-4">
            <SlimButton variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </SlimButton>

            {/* Secondary action: Authenticate/Re-authenticate if OAuth and already has token */}
            {formData.requiresOAuth && formData.oauthConfig.accessToken && (
              <SlimButton
                variant="outline"
                onClick={handleAuthenticate}
                disabled={!formData.oauthConfig.authUrl || !formData.name}
              >
                <ShieldCheck className="h-4 w-4 mr-2" />
                Re-authenticate
              </SlimButton>
            )}

            {/* Primary action: dynamically determined */}
            {(() => {
              const buttonConfig = getPrimaryButtonConfig()
              const Icon = buttonConfig.icon
              return (
                <SlimButton
                  variant={buttonConfig.variant}
                  onClick={buttonConfig.action}
                  disabled={buttonConfig.disabled}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {buttonConfig.text}
                </SlimButton>
              )
            })()}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
