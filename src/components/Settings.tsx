import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radix-ui/react-tabs"
import { Plus, Trash2, Sun, Moon, Monitor } from "lucide-react"
import type { ModelConfig } from "@/types/model"
import { useTheme } from "@/components/ThemeProvider"

interface SettingsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onModelChange: (model: ModelConfig | null) => void
}

export function Settings({ open, onOpenChange, onModelChange }: SettingsProps) {
  const { theme, setTheme } = useTheme()
  const [models, setModels] = useState<ModelConfig[]>([])
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [newModel, setNewModel] = useState<Partial<ModelConfig>>({
    name: "",
    baseURL: "",
    apiKey: "",
    model: "gpt-3.5-turbo",
  })

  // Load models from localStorage on mount
  useEffect(() => {
    const savedModels = localStorage.getItem("models")
    if (savedModels) {
      const parsed = JSON.parse(savedModels)
      setModels(parsed)
      if (parsed.length > 0 && !selectedModel) {
        setSelectedModel(parsed[0].id)
        onModelChange(parsed[0])
      }
    }
  }, [])

  // Save models to localStorage
  const saveModels = (updatedModels: ModelConfig[]) => {
    localStorage.setItem("models", JSON.stringify(updatedModels))
    setModels(updatedModels)
  }

  const handleAddModel = () => {
    if (newModel.name && newModel.baseURL && newModel.apiKey && newModel.model) {
      const model: ModelConfig = {
        id: Date.now().toString(),
        name: newModel.name,
        baseURL: newModel.baseURL,
        apiKey: newModel.apiKey,
        model: newModel.model,
        temperature: newModel.temperature || 0.7,
        maxTokens: newModel.maxTokens || 2048,
      }
      const updatedModels = [...models, model]
      saveModels(updatedModels)
      setNewModel({
        name: "",
        baseURL: "",
        apiKey: "",
        model: "gpt-3.5-turbo",
      })
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Paramètres</DialogTitle>
          <DialogDescription>
            Configurez vos modèles d'IA et les paramètres de l'application.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-3">Thème</h3>
              <div className="flex gap-2">
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("light")}
                >
                  <Sun className="h-4 w-4 mr-2" />
                  Clair
                </Button>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("dark")}
                >
                  <Moon className="h-4 w-4 mr-2" />
                  Sombre
                </Button>
                <Button
                  variant={theme === "system" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("system")}
                >
                  <Monitor className="h-4 w-4 mr-2" />
                  Système
                </Button>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-3">Modèles configurés</h3>
              {models.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun modèle configuré</p>
              ) : (
                <div className="space-y-2">
                  {models.map((model) => (
                    <div
                      key={model.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        selectedModel === model.id ? "bg-accent" : ""
                      }`}
                    >
                      <button
                        onClick={() => handleSelectModel(model.id)}
                        className="flex-1 text-left"
                      >
                        <div className="font-medium">{model.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {model.model} • {model.baseURL}
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteModel(model.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-3">Ajouter un modèle</h3>
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Nom du modèle</Label>
                    <Input
                      id="name"
                      value={newModel.name}
                      onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                      placeholder="Mon modèle OpenAI"
                    />
                  </div>
                  <div>
                    <Label htmlFor="model">Modèle</Label>
                    <Input
                      id="model"
                      value={newModel.model}
                      onChange={(e) => setNewModel({ ...newModel, model: e.target.value })}
                      placeholder="gpt-3.5-turbo"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="baseURL">URL de base de l'API</Label>
                  <Input
                    id="baseURL"
                    value={newModel.baseURL}
                    onChange={(e) => setNewModel({ ...newModel, baseURL: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
                <div>
                  <Label htmlFor="apiKey">Clé API</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    value={newModel.apiKey}
                    onChange={(e) => setNewModel({ ...newModel, apiKey: e.target.value })}
                    placeholder="sk-..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="temperature">Température</Label>
                    <Input
                      id="temperature"
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={newModel.temperature || 0.7}
                      onChange={(e) => setNewModel({ ...newModel, temperature: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxTokens">Tokens max</Label>
                    <Input
                      id="maxTokens"
                      type="number"
                      min="1"
                      max="32000"
                      value={newModel.maxTokens || 2048}
                      onChange={(e) => setNewModel({ ...newModel, maxTokens: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
                <Button onClick={handleAddModel} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter le modèle
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}