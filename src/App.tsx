import { useState, useEffect } from 'react'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Thread } from '@/components/assistant-ui/thread'
import { Sidebar } from '@/components/Sidebar'
import { Settings } from '@/components/Settings'
import { ModelSelector } from '@/components/ModelSelector'
import type { ModelConfig } from '@/types/model'
import { useModelRuntime } from '@/lib/useModelRuntime'

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [currentModel, setCurrentModel] = useState<ModelConfig | null>(null)
  const [models, setModels] = useState<ModelConfig[]>([])

  // Load saved model on mount
  useEffect(() => {
    const loadConfig = async () => {
      if (window.electronAPI) {
        // Use Electron file storage
        const savedModels = await window.electronAPI.readConfig('models.json')
        const selectedModelId = await window.electronAPI.readConfig('selectedModel.json')

        if (savedModels) {
          setModels(savedModels)
          if (selectedModelId) {
            const model = savedModels.find((m: ModelConfig) => m.id === selectedModelId)
            if (model) {
              setCurrentModel(model)
            }
          }
        }
      } else {
        // Fallback to localStorage for development
        const savedModels = localStorage.getItem("models")
        const selectedModelId = localStorage.getItem("selectedModel")
        if (savedModels) {
          const parsedModels = JSON.parse(savedModels)
          setModels(parsedModels)
          if (selectedModelId) {
            const model = parsedModels.find((m: ModelConfig) => m.id === selectedModelId)
            if (model) {
              setCurrentModel(model)
            }
          }
        }
      }
    }

    loadConfig()
  }, [])

  // Use custom runtime that supports model configuration
  const runtime = useModelRuntime(currentModel)

  const handleModelChange = async (model: ModelConfig | null) => {
    setCurrentModel(model)
    if (window.electronAPI) {
      if (model) {
        await window.electronAPI.writeConfig('selectedModel.json', model.id)
      } else {
        await window.electronAPI.writeConfig('selectedModel.json', null)
      }
    } else {
      if (model) {
        localStorage.setItem("selectedModel", model.id)
      } else {
        localStorage.removeItem("selectedModel")
      }
    }
  }

  const handleModelsUpdate = async () => {
    if (window.electronAPI) {
      const savedModels = await window.electronAPI.readConfig('models.json')
      if (savedModels) {
        setModels(savedModels)
      }
    } else {
      const savedModels = localStorage.getItem("models")
      if (savedModels) {
        setModels(JSON.parse(savedModels))
      }
    }
  }

  return (
    <TooltipProvider>
      <AssistantRuntimeProvider runtime={runtime}>
        <div className="flex h-screen bg-background">
          <Sidebar
            onSettingsClick={() => setIsSettingsOpen(true)}
            onNewChat={() => {
              // Handle new chat - will implement later
              window.location.reload()
            }}
          />

          <div className="flex-1 flex flex-col">
            <div className="px-4 py-3 flex items-center justify-between">
              <ModelSelector
                models={models}
                currentModel={currentModel}
                onModelChange={handleModelChange}
                onAddModel={() => setIsSettingsOpen(true)}
              />
            </div>

            <div className="flex-1 overflow-hidden">
              <Thread />
            </div>
          </div>

          <Settings
            open={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
            onModelChange={handleModelChange}
            onModelsUpdate={handleModelsUpdate}
          />
        </div>
      </AssistantRuntimeProvider>
    </TooltipProvider>
  )
}

export default App
