import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { SlimButton } from "@/components/ui/slim-button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FormField } from "@/components/ui/form-field"
import { Plus, Trash2, Sun, Moon, Monitor, Check, Key, Download, Upload, DollarSign, Eye, EyeOff, ChevronsUpDown, Plug2, RotateCcw } from "lucide-react"
import { MCPServerCard } from "@/components/MCPServerCard"
import { MCPDialog } from "@/components/MCPDialog"
import { MCPServerDetailsDialog } from "@/components/mcp-details/MCPServerDetailsDialog"
import type { MCPServer } from "@/types/mcp"
import { mcpManager } from "@/lib/mcpManager"
import { startOAuthFlow } from "@/lib/mcpAuth"
import { initializeBuiltInServers } from "@/lib/builtInServers"
import {
  Command,
  CommandInput,
} from "@/components/ui/command"
import type { ModelConfig } from "@/types/model"
import type { ApiKey } from "@/types/apiKey"
import { detectProvider, getProviderIcon } from "@/types/apiKey"
import { useTheme } from "@/components/ThemeProvider"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { MessageDialog, useMessageDialog } from "@/components/MessageDialog"
import { showSuccessToast, showErrorToast, showWarningToast } from "@/lib/errorToast"
import { Textarea } from "@/components/ui/textarea"
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/defaultSystemPrompt"

interface SettingsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onModelChange: (model: ModelConfig | null) => void
  onModelsUpdate?: () => void
  opacity?: number
  defaultTab?: string
}

export function Settings({ open, onOpenChange, onModelChange, onModelsUpdate, opacity = 1, defaultTab = 'models' }: SettingsProps) {
  const { theme, setTheme } = useTheme()
  const [activeTab, setActiveTab] = useState(defaultTab)
  const [models, setModels] = useState<ModelConfig[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([])
  const [newModel, setNewModel] = useState<Partial<ModelConfig>>({
    name: "",
    apiKeyId: "",
    model: "gpt-4",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
  })
  const [newApiKey, setNewApiKey] = useState({ name: "", key: "", baseURL: "" })
  const [showAddModelDialog, setShowAddModelDialog] = useState(false)
  const [showAddApiKeyDialog, setShowAddApiKeyDialog] = useState(false)
  const [showMCPDialog, setShowMCPDialog] = useState(false)
  const [editingMCPServer, setEditingMCPServer] = useState<MCPServer | null>(null)
  const [showMCPDetailsDialog, setShowMCPDetailsDialog] = useState(false)
  const [selectedMCPServer, setSelectedMCPServer] = useState<MCPServer | null>(null)
  const [envVars, setEnvVars] = useState<Record<string, string>>({})
  const [showApiKey, setShowApiKey] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [openModelCombobox, setOpenModelCombobox] = useState(false)
  const [testingServers, setTestingServers] = useState<Set<string>>(new Set())
  const { dialogState, showSuccess, showError, showWarning, closeDialog } = useMessageDialog()

  // Update active tab when defaultTab or dialog opens
  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab)
    }
  }, [defaultTab, open])

  // Load models, API keys, and MCP servers from storage on mount
  useEffect(() => {
    const loadConfig = async () => {
      if (window.electronAPI) {
        // Use Electron file storage
        const savedApiKeys = await window.electronAPI.readConfig('apiKeys.json')
        const savedModels = await window.electronAPI.readConfig('models.json')
        const savedMcpServers = await window.electronAPI.readConfig('mcpServers.json')

        if (savedApiKeys) {
          setApiKeys(savedApiKeys)
        }

        if (savedModels) {
          setModels(savedModels)
          if (savedModels.length > 0 && !selectedModel) {
            setSelectedModel(savedModels[0].id)
            onModelChange(savedModels[0])
          }
        }

        if (savedMcpServers) {
          // Initialize built-in servers first (ensures they exist)
          let servers = await initializeBuiltInServers(savedMcpServers)

          // Then initialize server statuses based on authentication state
          const serversWithStatus = servers.map((server: MCPServer) => ({
            ...server,
            status: server.requiresAuth && server.authType === 'oauth' && !server.oauthConfig?.accessToken
              ? 'AUTH_REQUIRED' as const
              : (server.status || 'IDLE' as const)
          }))
          setMcpServers(serversWithStatus)
        } else {
          // No saved servers - initialize with built-in servers only
          const builtInServers = await initializeBuiltInServers([])
          setMcpServers(builtInServers)
        }
      } else {
        // Fallback to localStorage for development
        const savedModels = localStorage.getItem("models")
        const savedApiKeys = localStorage.getItem("apiKeys")
        const savedMcpServers = localStorage.getItem("mcpServers")

        if (savedApiKeys) {
          setApiKeys(JSON.parse(savedApiKeys))
        }

        if (savedModels) {
          const parsed = JSON.parse(savedModels)
          setModels(parsed)
          if (parsed.length > 0 && !selectedModel) {
            setSelectedModel(parsed[0].id)
            onModelChange(parsed[0])
          }
        }

        if (savedMcpServers) {
          const parsed = JSON.parse(savedMcpServers)

          // Initialize built-in servers first (ensures they exist)
          let servers = await initializeBuiltInServers(parsed)

          // Then initialize server statuses based on authentication state
          const serversWithStatus = servers.map((server: MCPServer) => ({
            ...server,
            status: server.requiresAuth && server.authType === 'oauth' && !server.oauthConfig?.accessToken
              ? 'AUTH_REQUIRED' as const
              : (server.status || 'IDLE' as const)
          }))
          setMcpServers(serversWithStatus)
        } else {
          // No saved servers - initialize with built-in servers only
          const builtInServers = await initializeBuiltInServers([])
          setMcpServers(builtInServers)
        }
      }
    }

    loadConfig()
  }, [])

  // Sync MCP servers state with config file via file watcher
  useEffect(() => {
    if (!window.electronAPI?.onConfigChanged) return

    const handleConfigChanged = (filename: string, data: MCPServer[]) => {
      if (filename === 'mcpServers.json') {
        console.log('[Settings] Config file changed, syncing state from file watcher')
        setMcpServers(data)
      }
    }

    window.electronAPI.onConfigChanged(handleConfigChanged)

    // Listener stays active for the lifetime of the component
  }, [])

  // Subscribe to MCP server status changes
  useEffect(() => {
    const unsubscribe = mcpManager.onStatusChange((serverId, status, metadata) => {
      setMcpServers(prevServers => {
        const updatedServers = prevServers.map(server =>
          server.id === serverId ? { ...server, status, stateMetadata: metadata } : server
        )

        // Persist status changes to file (file watcher will sync oauthConfig back)
        if (window.electronAPI) {
          window.electronAPI.writeConfig('mcpServers.json', updatedServers)
        } else {
          localStorage.setItem("mcpServers", JSON.stringify(updatedServers))
        }

        return updatedServers
      })
    })

    return unsubscribe
  }, [])

  // Load environment variables when dialog opens
  useEffect(() => {
    const loadEnvVars = async () => {
      if (showAddApiKeyDialog && window.electronAPI) {
        const vars = await window.electronAPI.getEnvVars()
        setEnvVars(vars)
      }
    }
    loadEnvVars()
  }, [showAddApiKeyDialog])

  // Preload first endpoint when Add Model dialog opens
  useEffect(() => {
    if (showAddModelDialog && apiKeys.length > 0 && !newModel.apiKeyId) {
      setNewModel({ ...newModel, apiKeyId: apiKeys[0].id })
    }
  }, [showAddModelDialog])

  // Fetch available models when endpoint changes
  useEffect(() => {
    const fetchModels = async () => {
      if (!newModel.apiKeyId) {
        setAvailableModels([])
        return
      }

      const selectedApiKey = apiKeys.find(k => k.id === newModel.apiKeyId)
      if (!selectedApiKey) return

      setLoadingModels(true)
      try {
        if (window.electronAPI) {
          // Use Electron IPC to fetch models (bypasses CSP)
          const result = await window.electronAPI.fetchModels(selectedApiKey.baseURL, selectedApiKey.key)
          if (result.success && result.models) {
            setAvailableModels(result.models)
          } else {
            console.error('Failed to fetch models:', result.error)
            setAvailableModels([])
          }
        } else {
          // Fallback for web/dev mode - skip if env var
          if (selectedApiKey.key.startsWith('$')) {
            setAvailableModels([])
            return
          }

          const response = await fetch(`${selectedApiKey.baseURL}/models`, {
            headers: {
              'Authorization': `Bearer ${selectedApiKey.key}`,
              'Content-Type': 'application/json'
            }
          })

          if (response.ok) {
            const data = await response.json()
            if (data.data && Array.isArray(data.data)) {
              const modelIds = data.data.map((m: any) => m.id)
              setAvailableModels(modelIds)
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch models:', error)
        setAvailableModels([])
      } finally {
        setLoadingModels(false)
      }
    }

    fetchModels()
  }, [newModel.apiKeyId, apiKeys])

  // Save models to storage
  const saveModels = async (updatedModels: ModelConfig[]) => {
    if (window.electronAPI) {
      await window.electronAPI.writeConfig('models.json', updatedModels)
    } else {
      localStorage.setItem("models", JSON.stringify(updatedModels))
    }
    setModels(updatedModels)
    onModelsUpdate?.()
  }

  // Save API keys to storage
  const saveApiKeys = async (updatedKeys: ApiKey[]) => {
    if (window.electronAPI) {
      await window.electronAPI.writeConfig('apiKeys.json', updatedKeys)
    } else {
      localStorage.setItem("apiKeys", JSON.stringify(updatedKeys))
    }
    setApiKeys(updatedKeys)
  }

  const handleAddApiKey = () => {
    if (newApiKey.name && newApiKey.key && newApiKey.baseURL) {
      const apiKey: ApiKey = {
        id: Date.now().toString(),
        name: newApiKey.name,
        key: newApiKey.key,
        baseURL: newApiKey.baseURL,
      }
      saveApiKeys([...apiKeys, apiKey])
      setNewApiKey({ name: "", key: "", baseURL: "" })
      setShowAddApiKeyDialog(false)
    }
  }

  // Handle API key change and auto-detect provider
  const handleApiKeyChange = (key: string, envVarName?: string) => {
    const updates: Partial<typeof newApiKey> = { key }

    // Auto-fill name from environment variable name if provided and name is empty
    if (envVarName && !newApiKey.name) {
      updates.name = envVarName
    }

    // Auto-detect provider and set base URL
    const provider = detectProvider(key)
    if (provider && !newApiKey.baseURL) {
      updates.baseURL = provider.baseURL
    }

    setNewApiKey({ ...newApiKey, ...updates })
  }

  const handleDeleteApiKey = (id: string) => {
    // Check if any model is using this API key
    const isUsed = models.some(m => m.apiKeyId === id)
    if (isUsed) {
      showWarningToast("Cannot delete endpoint", "This endpoint is currently in use by a model")
      return
    }
    saveApiKeys(apiKeys.filter(k => k.id !== id))
  }

  const handleAddModel = () => {
    if (newModel.name && newModel.apiKeyId && newModel.model) {
      const model: ModelConfig = {
        id: Date.now().toString(),
        name: newModel.name,
        apiKeyId: newModel.apiKeyId,
        model: newModel.model,
        temperature: newModel.temperature || 0.7,
        maxTokens: newModel.maxTokens || 2048,
        systemPrompt: newModel.systemPrompt || undefined,
      }
      const updatedModels = [...models, model]
      saveModels(updatedModels)
      setNewModel({
        name: "",
        apiKeyId: "",
        model: "gpt-4",
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
      })
      setShowAddModelDialog(false)
      if (!selectedModel) {
        setSelectedModel(model.id)
        onModelChange(model)
      }
    }
  }

  const handleDeleteModel = (id: string) => {
    const updatedModels = models.filter(m => m.id !== id)
    saveModels(updatedModels)
    if (selectedModel === id) {
      const newSelected = updatedModels.length > 0 ? updatedModels[0] : null
      setSelectedModel(newSelected?.id || null)
      onModelChange(newSelected)
    }
  }

  const handleSelectModel = (id: string) => {
    const model = models.find(m => m.id === id)
    if (model) {
      setSelectedModel(id)
      onModelChange(model)
    }
  }

  const handleExportConfig = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.exportConfig()
      if (result.success && result.path) {
        showSuccessToast("Configuration exported", `Saved to ${result.path}`)
      } else if (!result.canceled && result.error) {
        showErrorToast("Export failed", result.error)
      }
    } else {
      // Fallback for web: download as file
      const config = {
        models,
        apiKeys
      }
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'jarvis-config.json'
      a.click()
      URL.revokeObjectURL(url)
      showSuccessToast("Configuration exported", "Downloaded as jarvis-config.json")
    }
  }

  const handleImportConfig = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.importConfig()
      if (result.success && result.config) {
        // Reload the configuration
        if (result.config.apiKeys) {
          setApiKeys(result.config.apiKeys)
        }
        if (result.config.models) {
          setModels(result.config.models)
          onModelsUpdate?.()
        }
        showSuccessToast('Configuration imported', 'Your settings have been restored successfully')
      } else if (!result.canceled && result.error) {
        showErrorToast('Import failed', result.error)
      }
    } else {
      // Fallback for web: file input
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'application/json'
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (file) {
          try {
            const text = await file.text()
            const config = JSON.parse(text)
            if (config.apiKeys) {
              localStorage.setItem("apiKeys", JSON.stringify(config.apiKeys))
              setApiKeys(config.apiKeys)
            }
            if (config.models) {
              localStorage.setItem("models", JSON.stringify(config.models))
              setModels(config.models)
              onModelsUpdate?.()
            }
            showSuccessToast('Configuration imported', 'Your settings have been restored successfully')
          } catch (error) {
            showErrorToast('Import failed', 'Invalid file format')
          }
        }
      }
      input.click()
    }
  }

  // MCP server management
  const saveMcpServers = async (updatedServers: MCPServer[]) => {
    if (window.electronAPI) {
      await window.electronAPI.writeConfig('mcpServers.json', updatedServers)
    } else {
      localStorage.setItem("mcpServers", JSON.stringify(updatedServers))
    }
    setMcpServers(updatedServers)
  }

  const handleAddMcpServer = (serverData: Omit<MCPServer, 'id' | 'status' | 'connectedAt'>) => {
    const newServer: MCPServer = {
      ...serverData,
      id: Date.now().toString(),
      status: 'IDLE',
    }
    saveMcpServers([...mcpServers, newServer])
    setEditingMCPServer(null)
    setActiveTab('mcp')
  }

  const handleEditMcpServer = (serverData: Omit<MCPServer, 'id' | 'status' | 'connectedAt'>) => {
    if (!editingMCPServer) return

    const updatedServers = mcpServers.map(server =>
      server.id === editingMCPServer.id
        ? { ...server, ...serverData }
        : server
    )
    saveMcpServers(updatedServers)
    setEditingMCPServer(null)
  }

  const handleDeleteMcpServer = (id: string) => {
    const server = mcpServers.find(s => s.id === id)

    // Prevent deletion of built-in servers
    if (server?.isBuiltIn) {
      alert('Built-in servers cannot be deleted. You can disable them instead.')
      return
    }

    if (confirm('Are you sure you want to delete this MCP server?')) {
      saveMcpServers(mcpServers.filter(server => server.id !== id))
    }
  }

  const handleToggleMcpServer = async (id: string, enabled: boolean) => {
    const server = mcpServers.find(s => s.id === id)
    if (!server) return

    console.log(`[Settings] Toggling MCP server ${server.name} to ${enabled ? 'ON' : 'OFF'}`)

    const updatedServers = mcpServers.map(s =>
      s.id === id ? { ...s, enabled } : s
    )
    saveMcpServers(updatedServers)

    // Start or stop the server via mcpManager
    try {
      if (enabled) {
        await mcpManager.startServer(server)
      } else {
        await mcpManager.stopServer(id)
      }
      console.log(`[Settings] Successfully toggled MCP server ${server.name}`)
    } catch (error) {
      console.error(`[Settings] Failed to toggle MCP server ${server.name}:`, error)
      // Only revert on actual errors (not "already stopped" cases)
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isAlreadyStoppedError = errorMessage.includes('not running') || errorMessage.includes('already stopped')

      if (!isAlreadyStoppedError) {
        console.warn(`[Settings] Reverting enabled state for ${server.name}`)
        const revertedServers = mcpServers.map(s =>
          s.id === id ? { ...s, enabled: !enabled } : s
        )
        saveMcpServers(revertedServers)
      } else {
        console.log(`[Settings] Server was already in desired state, not reverting`)
      }
    }
  }

  const handleTestMcpServer = async (id: string) => {
    const server = mcpServers.find(s => s.id === id)
    if (!server) return

    // Add to testing set
    setTestingServers(prev => new Set(prev).add(id))

    try {
      const result = await mcpManager.testConnection(server)

      if (result.success) {
        showSuccess('Connection Test Successful', result.message)
      } else {
        showError('Connection Test Failed', result.message)
      }
    } catch (error) {
      console.error('Test connection error:', error)
      showError('Connection Test Failed', error instanceof Error ? error.message : 'Unknown error')
    } finally {
      // Remove from testing set
      setTestingServers(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleAuthenticateMcpServer = async (id: string) => {
    const server = mcpServers.find(s => s.id === id)
    if (!server) return

    try {
      await startOAuthFlow(server)
    } catch (error) {
      console.error('OAuth authentication error:', error)
      showErrorToast('Authentication failed', error instanceof Error ? error.message : 'Unknown error')
    }
  }

  const handleOpenMcpServerDetails = (id: string) => {
    const server = mcpServers.find(s => s.id === id)
    if (server) {
      setSelectedMCPServer(server)
      setShowMCPDetailsDialog(true)
    }
  }

  const handleUpdateMcpServer = async (updatedServer: MCPServer) => {
    const newServers = mcpServers.map(s => s.id === updatedServer.id ? updatedServer : s)
    setMcpServers(newServers)

    if (window.electronAPI) {
      await window.electronAPI.writeConfig('mcpServers.json', newServers)
    } else {
      localStorage.setItem("mcpServers", JSON.stringify(newServers))
    }

    showSuccessToast('Server updated', 'Configuration saved successfully')
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl h-[600px] overflow-hidden flex flex-col p-0"
        style={{ '--ui-opacity': `${opacity * 100}%` } as React.CSSProperties}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex overflow-hidden">
          <TabsList className="w-48 flex flex-col items-stretch justify-start border-r bg-transparent p-4 h-auto gap-1">
            <TabsTrigger
              value="models"
              className="justify-start rounded-md data-[state=active]:bg-accent data-[state=active]:shadow-none"
            >
              Models
            </TabsTrigger>
            <TabsTrigger
              value="apikeys"
              className="justify-start rounded-md data-[state=active]:bg-accent data-[state=active]:shadow-none"
            >
              Endpoints
            </TabsTrigger>
            <TabsTrigger
              value="mcp"
              className="justify-start rounded-md data-[state=active]:bg-accent data-[state=active]:shadow-none"
            >
              MCP Servers
            </TabsTrigger>
            <TabsTrigger
              value="appearance"
              className="justify-start rounded-md data-[state=active]:bg-accent data-[state=active]:shadow-none"
            >
              Appearance
            </TabsTrigger>
            <TabsTrigger
              value="backup"
              className="justify-start rounded-md data-[state=active]:bg-accent data-[state=active]:shadow-none"
            >
              Backup & Restore
            </TabsTrigger>
          </TabsList>

          <TabsContent value="models" className="flex-1 overflow-y-auto mt-0 pt-8 px-6 pb-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Your Models</h3>
              <SlimButton onClick={() => setShowAddModelDialog(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Model
              </SlimButton>
            </div>

            {models.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground mb-3">No models configured</p>
                <SlimButton onClick={() => setShowAddModelDialog(true)} variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add your first model
                </SlimButton>
              </div>
            ) : (
              <div className="space-y-2">
                {models.map((model) => (
                  <div
                    key={model.id}
                    className={`group relative rounded-lg border p-4 transition-colors hover:border-primary/50 ${
                      selectedModel === model.id ? "border-primary bg-accent/50" : ""
                    }`}
                  >
                    <button
                      onClick={() => handleSelectModel(model.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{model.name}</span>
                            {selectedModel === model.id && (
                              <Check className="h-4 w-4 text-primary" />
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {model.model}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Key className="h-3 w-3" />
                            {apiKeys.find(k => k.id === model.apiKeyId)?.name || 'Unknown Endpoint'}
                          </div>
                        </div>
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDeleteModel(model.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="apikeys" className="flex-1 overflow-y-auto mt-0 pt-8 px-6 pb-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Your Endpoints</h3>
              <SlimButton onClick={() => setShowAddApiKeyDialog(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Endpoint
              </SlimButton>
            </div>

            {apiKeys.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground mb-3">No endpoints configured</p>
                <SlimButton onClick={() => setShowAddApiKeyDialog(true)} variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add your first endpoint
                </SlimButton>
              </div>
            ) : (
              <div className="space-y-2">
                {apiKeys.map((apiKey) => {
                  const providerIcon = getProviderIcon(apiKey.baseURL)
                  return (
                    <div
                      key={apiKey.id}
                      className="group relative rounded-lg border p-4 transition-colors hover:border-primary/50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {providerIcon ? (
                            <img
                              src={`/icons/${providerIcon}.svg`}
                              alt={apiKey.name}
                              className="h-5 w-5 dark:invert"
                            />
                          ) : (
                            <Key className="h-5 w-5 text-muted-foreground" />
                          )}
                          <div>
                            <div className="font-semibold">{apiKey.name}</div>
                            <div className="text-xs text-muted-foreground">{apiKey.baseURL}</div>
                            <div className="text-sm text-muted-foreground font-mono">
                              {apiKey.key.slice(0, 20)}...
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleDeleteApiKey(apiKey.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="mcp" className="flex-1 overflow-y-auto mt-0 pt-8 px-6 pb-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">MCP Servers</h3>
              <SlimButton onClick={() => { setEditingMCPServer(null); setShowMCPDialog(true); }} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Server
              </SlimButton>
            </div>

            {mcpServers.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <Plug2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-3">No MCP servers configured</p>
                <p className="text-xs text-muted-foreground mb-4">
                  MCP servers allow AI models to access external tools and data sources
                </p>
                <SlimButton onClick={() => { setEditingMCPServer(null); setShowMCPDialog(true); }} variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add your first server
                </SlimButton>
              </div>
            ) : (
              <div className="space-y-3">
                {mcpServers.map((server) => (
                  <MCPServerCard
                    key={server.id}
                    server={server}
                    onToggle={handleToggleMcpServer}
                    onDelete={handleDeleteMcpServer}
                    onTest={handleTestMcpServer}
                    onAuthenticate={handleAuthenticateMcpServer}
                    onClick={handleOpenMcpServerDetails}
                    isTesting={testingServers.has(server.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="appearance" className="flex-1 overflow-y-auto mt-0 pt-8 px-6 pb-6 space-y-6">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Theme</h3>

              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setTheme("light")}
                  className={`relative rounded-lg border-2 p-4 transition-all hover:border-primary/50 ${
                    theme === "light" ? "border-primary" : "border-border"
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <Sun className="h-5 w-5" />
                    <span className="text-sm font-medium">Light</span>
                  </div>
                  {theme === "light" && (
                    <Check className="absolute top-2 right-2 h-4 w-4 text-primary" />
                  )}
                </button>

                <button
                  onClick={() => setTheme("dark")}
                  className={`relative rounded-lg border-2 p-4 transition-all hover:border-primary/50 ${
                    theme === "dark" ? "border-primary" : "border-border"
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <Moon className="h-5 w-5" />
                    <span className="text-sm font-medium">Dark</span>
                  </div>
                  {theme === "dark" && (
                    <Check className="absolute top-2 right-2 h-4 w-4 text-primary" />
                  )}
                </button>

                <button
                  onClick={() => setTheme("system")}
                  className={`relative rounded-lg border-2 p-4 transition-all hover:border-primary/50 ${
                    theme === "system" ? "border-primary" : "border-border"
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <Monitor className="h-5 w-5" />
                    <span className="text-sm font-medium">System</span>
                  </div>
                  {theme === "system" && (
                    <Check className="absolute top-2 right-2 h-4 w-4 text-primary" />
                  )}
                </button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="backup" className="flex-1 overflow-y-auto mt-0 pt-8 px-6 pb-6 space-y-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">Export Configuration</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Export your models and API keys to a JSON file for backup or transfer.
                </p>
                <SlimButton onClick={handleExportConfig} variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export Configuration
                </SlimButton>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-2">Import Configuration</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Import previously exported configuration. This will replace your current settings.
                </p>
                <SlimButton onClick={handleImportConfig} variant="outline">
                  <Upload className="h-4 w-4 mr-2" />
                  Import Configuration
                </SlimButton>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>

      {/* Add Model Dialog */}
      <Dialog open={showAddModelDialog} onOpenChange={setShowAddModelDialog}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          style={{ '--ui-opacity': `${opacity * 100}%` } as React.CSSProperties}
        >
          <div className="space-y-4 py-4">
            <FormField
              label="Display Name"
              id="name"
              value={newModel.name}
              onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
              placeholder="e.g., My GPT-4"
            />

            <div>
              <Label htmlFor="apiKey" className="text-sm font-medium block mb-3">Endpoint</Label>
              <Select
                value={newModel.apiKeyId}
                onValueChange={(value) => setNewModel({ ...newModel, apiKeyId: value })}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select an endpoint" />
                </SelectTrigger>
                <SelectContent>
                  {apiKeys.length === 0 ? (
                    <SlimButton
                      variant="ghost"
                      className="w-full justify-start text-sm"
                      onClick={() => {
                        setShowAddModelDialog(false)
                        setShowAddApiKeyDialog(true)
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create new endpoint
                    </SlimButton>
                  ) : (
                    apiKeys.map((key) => (
                      <SelectItem key={key.id} value={key.id}>
                        {key.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="model" className="text-sm font-medium block mb-3">Model ID</Label>
              <Popover open={openModelCombobox} onOpenChange={setOpenModelCombobox}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openModelCombobox}
                    className="w-full h-8 justify-between font-normal"
                  >
                    <span className="truncate">{newModel.model || "Select or type a model..."}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="p-0"
                  align="start"
                  style={{ width: 'var(--radix-popover-trigger-width)', maxHeight: '400px' }}
                  collisionPadding={8}
                >
                  <Command shouldFilter={false} className="w-full">
                    <CommandInput
                      placeholder="Search or type model ID..."
                      value={newModel.model}
                      onValueChange={(value) => setNewModel({ ...newModel, model: value })}
                    />
                    <div
                      className="h-[300px] overflow-y-scroll overflow-x-hidden border-t"
                      style={{
                        overscrollBehavior: 'contain',
                        scrollbarWidth: 'thin',
                        scrollbarColor: 'hsl(var(--border)) transparent'
                      }}
                      onWheelCapture={(e) => {
                        e.stopPropagation()
                      }}
                    >
                      {loadingModels ? (
                        <div className="py-6 text-center text-sm">Loading models...</div>
                      ) : availableModels.length > 0 ? (
                        <div className="p-1">
                          {availableModels
                            .filter((modelId) =>
                              !newModel.model ||
                              modelId.toLowerCase().includes(newModel.model.toLowerCase())
                            )
                            .map((modelId) => (
                              <button
                                key={modelId}
                                onClick={() => {
                                  setNewModel({ ...newModel, model: modelId })
                                  setOpenModelCombobox(false)
                                }}
                                className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${
                                    newModel.model === modelId ? "opacity-100" : "opacity-0"
                                  }`}
                                />
                                {modelId}
                              </button>
                            ))}
                        </div>
                      ) : (
                        <div className="py-6 text-center text-sm">Type custom model ID (e.g., gpt-4)</div>
                      )}
                    </div>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <Label htmlFor="systemPrompt" className="text-sm font-medium">System Prompt</Label>
                <SlimButton
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setNewModel({ ...newModel, systemPrompt: DEFAULT_SYSTEM_PROMPT })}
                  title="Reset to default Jarvis prompt"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </SlimButton>
              </div>
              <Textarea
                id="systemPrompt"
                value={newModel.systemPrompt}
                onChange={(e) => setNewModel({ ...newModel, systemPrompt: e.target.value })}
                placeholder="Enter system prompt (optional)..."
                className="min-h-[200px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-2">
                The system prompt defines the AI's behavior and capabilities. Leave empty to use no system prompt.
              </p>
            </div>

            <SlimButton onClick={handleAddModel} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Model
            </SlimButton>
          </div>
        </DialogContent>
      </Dialog>

      {/* MCP Server Dialog */}
      <MCPDialog
        open={showMCPDialog}
        onOpenChange={(open) => {
          setShowMCPDialog(open)
          if (!open) setEditingMCPServer(null)
        }}
        server={editingMCPServer}
        onSave={editingMCPServer ? handleEditMcpServer : handleAddMcpServer}
        opacity={opacity}
      />

      {/* Add Endpoint Dialog */}
      <Dialog open={showAddApiKeyDialog} onOpenChange={setShowAddApiKeyDialog}>
        <DialogContent
          className="max-w-md"
          style={{ '--ui-opacity': `${opacity * 100}%` } as React.CSSProperties}
        >
          <DialogHeader>
            <DialogTitle>Add New Endpoint</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <FormField
              label="Name"
              id="keyName"
              value={newApiKey.name}
              onChange={(e) => setNewApiKey({ ...newApiKey, name: e.target.value })}
              placeholder="e.g., OpenAI Production"
            />

            <div>
              <Label htmlFor="keyValue" className="text-sm font-medium block mb-3">API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="keyValue"
                    type={showApiKey ? "text" : "password"}
                    value={newApiKey.key}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder="sk-... or $ENV_VAR_NAME"
                    className="h-8 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {window.electronAPI && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <SlimButton variant="outline" className="h-8 w-8 p-0" title="Select environment variable">
                        <DollarSign className="h-4 w-4" />
                      </SlimButton>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-2" align="end">
                      <div className="space-y-1">
                        <p className="text-sm font-medium mb-2">Environment Variables</p>
                        {Object.keys(envVars).length === 0 ? (
                          <p className="text-sm text-muted-foreground p-2">No API-related environment variables found</p>
                        ) : (
                          <div className="max-h-64 overflow-y-auto space-y-1">
                            {Object.entries(envVars).map(([key, value]) => (
                              <button
                                key={key}
                                onClick={() => handleApiKeyChange(value, key)}
                                className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                              >
                                <div className="font-mono font-medium">${key}</div>
                                <div className="text-xs text-muted-foreground truncate">{value.slice(0, 30)}...</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>

            <FormField
              label="Base URL"
              id="baseURL"
              value={newApiKey.baseURL}
              onChange={(e) => setNewApiKey({ ...newApiKey, baseURL: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />

            <SlimButton onClick={handleAddApiKey} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Endpoint
            </SlimButton>
          </div>
        </DialogContent>
      </Dialog>

      {/* Message Dialog for detailed messages */}
      <MessageDialog
        open={dialogState.open}
        onOpenChange={closeDialog}
        type={dialogState.type}
        title={dialogState.title}
        message={dialogState.message}
        opacity={opacity}
      />

      {/* MCP Server Details Dialog */}
      <MCPServerDetailsDialog
        server={selectedMCPServer}
        open={showMCPDetailsDialog}
        onOpenChange={setShowMCPDetailsDialog}
        onServerUpdate={handleUpdateMcpServer}
        opacity={opacity}
      />
    </Dialog>
  )
}