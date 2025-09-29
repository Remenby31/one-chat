import { useState, useEffect } from 'react'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Thread } from '@/components/assistant-ui/thread'
import { Sidebar } from '@/components/Sidebar'
import { Settings } from '@/components/Settings'
import type { ModelConfig } from '@/types/model'
import { useModelRuntime } from '@/lib/useModelRuntime'

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [currentModel, setCurrentModel] = useState<ModelConfig | null>(null)

  // Load saved model on mount
  useEffect(() => {
    const savedModels = localStorage.getItem("models")
    const selectedModelId = localStorage.getItem("selectedModel")
    if (savedModels && selectedModelId) {
      const models = JSON.parse(savedModels)
      const model = models.find((m: ModelConfig) => m.id === selectedModelId)
      if (model) {
        setCurrentModel(model)
      }
    }
  }, [])

  // Use custom runtime that supports model configuration
  const runtime = useModelRuntime(currentModel)

  const handleModelChange = (model: ModelConfig | null) => {
    setCurrentModel(model)
    if (model) {
      localStorage.setItem("selectedModel", model.id)
    } else {
      localStorage.removeItem("selectedModel")
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
            <div className="border-b px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Modèle:</span>
                <span className="text-sm font-medium">
                  {currentModel ? currentModel.name : "Non configuré"}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <Thread />
            </div>
          </div>

          <Settings
            open={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
            onModelChange={handleModelChange}
          />
        </div>
      </AssistantRuntimeProvider>
    </TooltipProvider>
  )
}

export default App
