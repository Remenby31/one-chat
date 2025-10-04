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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FormField } from "@/components/ui/form-field"
import { Plus, Trash2, Sun, Moon, Monitor, Check, Key, Download, Upload, DollarSign } from "lucide-react"
import type { ModelConfig } from "@/types/model"
import type { ApiKey } from "@/types/apiKey"
import { detectProvider } from "@/types/apiKey"
import { useTheme } from "@/components/ThemeProvider"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface SettingsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onModelChange: (model: ModelConfig | null) => void
  onModelsUpdate?: () => void
}

export function Settings({ open, onOpenChange, onModelChange, onModelsUpdate }: SettingsProps) {
  const { theme, setTheme } = useTheme()
  const [models, setModels] = useState<ModelConfig[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [newModel, setNewModel] = useState<Partial<ModelConfig>>({
    name: "",
    apiKeyId: "",
    model: "gpt-4",
  })
  const [newApiKey, setNewApiKey] = useState({ name: "", key: "", baseURL: "" })
  const [showAddModelDialog, setShowAddModelDialog] = useState(false)
  const [showAddApiKeyDialog, setShowAddApiKeyDialog] = useState(false)
  const [envVars, setEnvVars] = useState<Record<string, string>>({})

  // Load models and API keys from storage on mount
  useEffect(() => {
    const loadConfig = async () => {
      if (window.electronAPI) {
        // Use Electron file storage
        const savedApiKeys = await window.electronAPI.readConfig('apiKeys.json')
        const savedModels = await window.electronAPI.readConfig('models.json')

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
      } else {
        // Fallback to localStorage for development
        const savedModels = localStorage.getItem("models")
        const savedApiKeys = localStorage.getItem("apiKeys")

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
      }
    }

    loadConfig()
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
  const handleApiKeyChange = (key: string) => {
    setNewApiKey({ ...newApiKey, key })

    // Auto-detect provider and set base URL
    const provider = detectProvider(key)
    if (provider && !newApiKey.baseURL) {
      setNewApiKey({ ...newApiKey, key, baseURL: provider.baseURL })
    }
  }

  const handleDeleteApiKey = (id: string) => {
    // Check if any model is using this API key
    const isUsed = models.some(m => m.apiKeyId === id)
    if (isUsed) {
      alert("Cannot delete API key that is in use by a model")
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
      }
      const updatedModels = [...models, model]
      saveModels(updatedModels)
      setNewModel({
        name: "",
        apiKeyId: "",
        model: "gpt-4",
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
        alert(`Configuration exported successfully to ${result.path}`)
      } else if (!result.canceled && result.error) {
        alert(`Export failed: ${result.error}`)
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
      a.download = 'onechat-config.json'
      a.click()
      URL.revokeObjectURL(url)
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
        alert('Configuration imported successfully!')
      } else if (!result.canceled && result.error) {
        alert(`Import failed: ${result.error}`)
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
            alert('Configuration imported successfully!')
          } catch (error) {
            alert('Failed to import configuration: Invalid file format')
          }
        }
      }
      input.click()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[600px] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-lg font-semibold">Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="models" className="flex-1 flex overflow-hidden">
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

          <TabsContent value="models" className="flex-1 overflow-y-auto mt-0 p-6 space-y-4">
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

          <TabsContent value="apikeys" className="flex-1 overflow-y-auto mt-0 p-6 space-y-4">
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
                {apiKeys.map((apiKey) => (
                  <div
                    key={apiKey.id}
                    className="group relative rounded-lg border p-4 transition-colors hover:border-primary/50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Key className="h-4 w-4 text-muted-foreground" />
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
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="appearance" className="flex-1 overflow-y-auto mt-0 p-6 space-y-6">
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

          <TabsContent value="backup" className="flex-1 overflow-y-auto mt-0 p-6 space-y-6">
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Model</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                label="Display Name"
                id="name"
                value={newModel.name}
                onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                placeholder="e.g., My GPT-4"
              />
              <FormField
                label="Model ID"
                id="model"
                value={newModel.model}
                onChange={(e) => setNewModel({ ...newModel, model: e.target.value })}
                placeholder="e.g., gpt-4"
              />
            </div>

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

            <SlimButton onClick={handleAddModel} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Model
            </SlimButton>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Endpoint Dialog */}
      <Dialog open={showAddApiKeyDialog} onOpenChange={setShowAddApiKeyDialog}>
        <DialogContent className="max-w-md">
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

            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <FormField
                    label="API Key"
                    id="keyValue"
                    type="password"
                    value={newApiKey.key}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder="sk-... or $ENV_VAR_NAME"
                  />
                </div>
                {window.electronAPI && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <SlimButton variant="outline" className="mt-6 h-8 w-8 p-0" title="Select environment variable">
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
                                onClick={() => handleApiKeyChange(`$${key}`)}
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
              <p className="text-xs text-muted-foreground">
                Enter the key directly or use $ENV_VAR_NAME to read from environment variables
              </p>
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
    </Dialog>
  )
}