import { useState, useEffect } from 'react'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Thread } from '@/components/assistant-ui/thread'
import { Sidebar } from '@/components/Sidebar'
import { Settings } from '@/components/Settings'
import { ModelSelector } from '@/components/ModelSelector'
import { FlickeringGrid } from '@/components/ui/flickering-grid'
import type { ModelConfig } from '@/types/model'
import type { MCPServer } from '@/types/mcp'
import { useMCPRuntime } from '@/lib/useMCPRuntime'
import { mcpManager } from '@/lib/mcpManager'
import { useOAuthCallback } from '@/hooks/useOAuthCallback'

// ============================================
// PARAMÈTRES DE LA GRILLE SCINTILLANTE ET UI
// ============================================
const GRID_CONFIG = {
  // Taille de chaque carré en pixels (2-8 recommandé)
  squareSize: 8,

  // Espacement entre les carrés en pixels (3-12 recommandé)
  gridGap: 10,

  // Probabilité de scintillement par frame (0-1)
  // Plus élevé = plus de carrés scintillent
  flickerChance: 0.1,

  // Vitesse d'apparition progressive des carrés (0.01-0.05 recommandé)
  // Plus bas = apparition plus lente et douce
  fadeInSpeed: 0.01,

  // Vitesse de disparition des carrés (0.90-0.98 recommandé)
  // Plus haut = disparition plus lente
  fadeOutSpeed: 0.99,

  // Configuration pour le thème CLAIR
  light: {
    color: "rgb(0, 0, 0)",  // Couleur des carrés (noir)
    maxOpacity: 0.1,         // Opacité maximale (0-1, plus bas = plus subtil)
  },

  // Configuration pour le thème SOMBRE
  dark: {
    color: "rgb(255, 255, 255)",  // Couleur des carrés (blanc)
    maxOpacity: 0.15,              // Opacité maximale (0-1, plus bas = plus subtil)
  },

  // Opacité des éléments UI (sidebar, dialogs) - 0-100
  uiOpacity: 0.5,
}
// ============================================

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState('models')
  const [currentModel, setCurrentModel] = useState<ModelConfig | null>(null)
  const [models, setModels] = useState<ModelConfig[]>([])
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([])

  // Load saved model and MCP servers on mount
  useEffect(() => {
    const loadConfig = async () => {
      if (window.electronAPI) {
        // Use Electron file storage
        const savedModels = await window.electronAPI.readConfig('models.json')
        const selectedModelId = await window.electronAPI.readConfig('selectedModel.json')
        const savedMcpServers = await window.electronAPI.readConfig('mcpServers.json')

        if (savedModels) {
          setModels(savedModels)
          if (selectedModelId) {
            const model = savedModels.find((m: ModelConfig) => m.id === selectedModelId)
            if (model) {
              setCurrentModel(model)
            }
          }
        }

        if (savedMcpServers) {
          setMcpServers(savedMcpServers)
          // Start enabled servers
          await mcpManager.startEnabledServers(savedMcpServers)
        }
      } else {
        // Fallback to localStorage for development
        const savedModels = localStorage.getItem("models")
        const selectedModelId = localStorage.getItem("selectedModel")
        const savedMcpServers = localStorage.getItem("mcpServers")

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

        if (savedMcpServers) {
          const parsedServers = JSON.parse(savedMcpServers)
          setMcpServers(parsedServers)
        }
      }
    }

    loadConfig()

    // Cleanup: stop all servers on unmount
    return () => {
      if (window.electronAPI) {
        mcpManager.stopAllServers(mcpServers)
      }
    }
  }, [])

  // Use custom runtime with MCP tools support
  const runtime = useMCPRuntime(currentModel, mcpServers)

  // Handle OAuth callbacks from custom protocol
  useOAuthCallback(
    async (serverId, oauthConfig) => {
      console.log('[App] OAuth success for server:', serverId)
      console.log('[App] Received OAuth config with tokens:', {
        hasAccessToken: !!oauthConfig.accessToken,
        hasRefreshToken: !!oauthConfig.refreshToken
      })

      // Reload MCP servers to get updated tokens
      if (window.electronAPI) {
        const updatedServers = await window.electronAPI.readConfig('mcpServers.json')
        if (updatedServers) {
          setMcpServers(updatedServers)

          // Start the server if it's enabled
          const server = updatedServers.find((s: MCPServer) => s.id === serverId)
          if (server?.enabled) {
            try {
              await mcpManager.startServer(server)
              console.log('[App] Server started successfully after OAuth')
            } catch (error) {
              console.error('[App] Failed to start server after OAuth:', error)
            }
          }
        }
      } else {
        // Fallback to localStorage
        const savedServers = localStorage.getItem('mcpServers')
        if (savedServers) {
          const updatedServers = JSON.parse(savedServers)
          setMcpServers(updatedServers)
        }
      }

      // TODO: Show success notification
      console.log('[App] OAuth flow completed successfully')
    },
    (error) => {
      console.error('[App] OAuth error:', error)
      // TODO: Show error notification
      alert(`OAuth authentication failed: ${error.message}`)
    }
  )

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

  const handleMcpToggle = async (id: string, enabled: boolean) => {
    const updatedServers = mcpServers.map(server =>
      server.id === id ? { ...server, enabled } : server
    )
    setMcpServers(updatedServers)

    // Save to storage
    if (window.electronAPI) {
      await window.electronAPI.writeConfig('mcpServers.json', updatedServers)
    } else {
      localStorage.setItem("mcpServers", JSON.stringify(updatedServers))
    }

    // Start or stop the server
    const server = updatedServers.find(s => s.id === id)
    if (server) {
      if (enabled) {
        await mcpManager.startServer(server)
      } else {
        await mcpManager.stopServer(id)
      }
    }
  }

  const openSettingsTab = (tab: string) => {
    setSettingsTab(tab)
    setIsSettingsOpen(true)
  }

  return (
    <TooltipProvider>
      <AssistantRuntimeProvider runtime={runtime}>
        <div
          className="flex h-screen bg-background relative overflow-hidden"
          style={{ '--ui-opacity': `${GRID_CONFIG.uiOpacity}%` } as React.CSSProperties}
        >
          {/* Flickering grid background - light theme */}
          <div className="fixed inset-0 dark:hidden pointer-events-none" style={{ zIndex: 0 }}>
            <FlickeringGrid
              squareSize={GRID_CONFIG.squareSize}
              gridGap={GRID_CONFIG.gridGap}
              flickerChance={GRID_CONFIG.flickerChance}
              color={GRID_CONFIG.light.color}
              maxOpacity={GRID_CONFIG.light.maxOpacity}
              fadeInSpeed={GRID_CONFIG.fadeInSpeed}
              fadeOutSpeed={GRID_CONFIG.fadeOutSpeed}
            />
          </div>

          {/* Flickering grid background - dark theme */}
          <div className="fixed inset-0 hidden dark:block pointer-events-none" style={{ zIndex: 0 }}>
            <FlickeringGrid
              squareSize={GRID_CONFIG.squareSize}
              gridGap={GRID_CONFIG.gridGap}
              flickerChance={GRID_CONFIG.flickerChance}
              color={GRID_CONFIG.dark.color}
              maxOpacity={GRID_CONFIG.dark.maxOpacity}
              fadeInSpeed={GRID_CONFIG.fadeInSpeed}
              fadeOutSpeed={GRID_CONFIG.fadeOutSpeed}
            />
          </div>

          <Sidebar
            opacity={GRID_CONFIG.uiOpacity}
            onSettingsClick={() => openSettingsTab('models')}
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
                onAddModel={() => openSettingsTab('models')}
              />
            </div>

            <div className="flex-1 overflow-hidden">
              <Thread
                mcpServers={mcpServers}
                onMcpToggle={handleMcpToggle}
                onSettingsClick={() => openSettingsTab('mcp')}
                opacity={GRID_CONFIG.uiOpacity}
              />
            </div>
          </div>

          <Settings
            open={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
            onModelChange={handleModelChange}
            onModelsUpdate={handleModelsUpdate}
            opacity={GRID_CONFIG.uiOpacity}
            defaultTab={settingsTab}
          />
        </div>
      </AssistantRuntimeProvider>
    </TooltipProvider>
  )
}

export default App
