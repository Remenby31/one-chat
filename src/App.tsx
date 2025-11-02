import { useState, useEffect } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { ChatThread } from '@/components/chat/ChatThread'
import { Sidebar } from '@/components/Sidebar'
import { Settings } from '@/components/Settings'
import { ModelSelector } from '@/components/ModelSelector'
import { FlickeringGrid } from '@/components/ui/flickering-grid'
import type { ModelConfig } from '@/types/model'
import type { ApiKey } from '@/types/apiKey'
import type { MCPServer } from '@/types/mcp'
import { mcpManager } from '@/lib/mcpManager'
import { useOAuthCallback } from '@/hooks/useOAuthCallback'
import { showSuccessToast, showOAuthErrorToast, showGlobalErrorToast } from '@/lib/errorToast'
import { useThreadStore } from '@/lib/threadStore'
import { useChatStore } from '@/lib/chatStore'
import { DEFAULT_SYSTEM_PROMPT } from '@/lib/defaultSystemPrompt'
import { initializeBuiltInServers } from '@/lib/builtInServers'

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
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([])

  // Thread management
  const threadStore = useThreadStore()
  const chatStore = useChatStore()

  // Load saved model and MCP servers on mount
  useEffect(() => {
    const loadConfig = async () => {
      if (window.electronAPI) {
        // Use Electron file storage
        const savedModels = await window.electronAPI.readConfig('models.json')
        const savedApiKeys = await window.electronAPI.readConfig('apiKeys.json')
        const selectedModelId = await window.electronAPI.readConfig('selectedModel.json')
        const savedMcpServers = await window.electronAPI.readConfig('mcpServers.json')

        if (savedApiKeys) {
          setApiKeys(savedApiKeys)
        }

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
          // Recover stuck servers first
          let recoveredServers = await mcpManager.recoverStuckServers(savedMcpServers)

          // Initialize built-in servers (adds new built-in servers, updates existing ones)
          recoveredServers = await initializeBuiltInServers(recoveredServers)

          setMcpServers(recoveredServers)

          // Save recovered and initialized state
          await window.electronAPI.writeConfig('mcpServers.json', recoveredServers)

          // Start enabled servers
          await mcpManager.startEnabledServers(recoveredServers)
        } else {
          // No saved servers - initialize with built-in servers only
          const builtInServers = await initializeBuiltInServers([])
          setMcpServers(builtInServers)
          await window.electronAPI.writeConfig('mcpServers.json', builtInServers)

          // Start enabled built-in servers
          await mcpManager.startEnabledServers(builtInServers)
        }
      } else {
        // Fallback to localStorage for development
        const savedModels = localStorage.getItem("models")
        const savedApiKeys = localStorage.getItem("apiKeys")
        const selectedModelId = localStorage.getItem("selectedModel")
        const savedMcpServers = localStorage.getItem("mcpServers")

        if (savedApiKeys) {
          setApiKeys(JSON.parse(savedApiKeys))
        }

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

    loadConfig().catch(error => {
      console.error('[App] Error loading config:', error)
    })

    // Register listener for MCP server status changes
    // This keeps React state synchronized with internal state machines
    const unsubscribe = mcpManager.onStatusChange((serverId, status, metadata) => {
      setMcpServers(prevServers => {
        const updatedServers = prevServers.map(server =>
          server.id === serverId
            ? { ...server, status, stateMetadata: metadata }
            : server
        )

        // Persist updated state to storage
        if (window.electronAPI) {
          window.electronAPI.writeConfig('mcpServers.json', updatedServers)
            .catch(error => console.error('[App] Failed to persist MCP server state:', error))
        } else {
          localStorage.setItem('mcpServers', JSON.stringify(updatedServers))
        }

        return updatedServers
      })
    })

    // Cleanup: stop all servers and unregister listener on unmount
    return () => {
      unsubscribe()
      if (window.electronAPI) {
        mcpManager.stopAllServers(mcpServers)
      }
    }
  }, [])

  // Load threads and current thread on mount
  useEffect(() => {
    const loadThreads = async () => {
      // Load thread list
      await threadStore.loadThreads()

      // Load current thread ID
      let currentThreadId: string | null = null
      if (window.electronAPI) {
        currentThreadId = await window.electronAPI.readConfig('currentThread.json')
      } else {
        currentThreadId = localStorage.getItem('currentThread')
      }

      if (currentThreadId) {
        // Load messages for current thread
        const { messages, systemPrompt } = await threadStore.switchThread(currentThreadId)
        chatStore.loadMessages(messages)
        // System prompt is already set in threadStore by switchThread
      } else {
        // Create a new thread if none exists with default system prompt
        await threadStore.createThread(DEFAULT_SYSTEM_PROMPT)
        chatStore.clearMessages()
      }
    }

    loadThreads()
  }, [])

  // Global error handlers
  useEffect(() => {
    // Handle uncaught errors
    const handleError = (event: ErrorEvent) => {
      console.error('[Global] Uncaught error:', event.error)
      showGlobalErrorToast(event.error || event.message)
      event.preventDefault() // Prevent default browser error handling
    }

    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('[Global] Unhandled promise rejection:', event.reason)
      showGlobalErrorToast(event.reason)
      event.preventDefault() // Prevent default browser error handling
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  // Handle OAuth callbacks from custom protocol
  useOAuthCallback(
    async (serverId, oauthConfig) => {
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

      // Show success notification
      showSuccessToast('OAuth Authentication Successful', 'MCP server authenticated successfully')
    },
    (error) => {
      console.error('[App] OAuth error:', error)
      // Show error notification
      showOAuthErrorToast(error)
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

  // Thread management handlers
  const handleNewChat = async () => {
    await threadStore.createThread(DEFAULT_SYSTEM_PROMPT)
    chatStore.clearMessages()
  }

  const handleThreadSelect = async (threadId: string) => {
    // Don't switch if already on this thread
    if (threadId === threadStore.currentThreadId) {
      return
    }

    // Load messages for selected thread
    const { messages, systemPrompt } = await threadStore.switchThread(threadId)
    chatStore.loadMessages(messages)
    // System prompt is already set in threadStore by switchThread
  }

  return (
    <TooltipProvider>
      <div
        className="flex h-screen overflow-hidden bg-background relative"
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
          onNewChat={handleNewChat}
          onThreadSelect={handleThreadSelect}
          currentThreadId={threadStore.currentThreadId}
        />

        <div className="flex-1 flex flex-col min-h-0 bg-transparent">
          <div className="px-4 py-3 flex items-center justify-between bg-transparent">
            <ModelSelector
              models={models}
              currentModel={currentModel}
              apiKeys={apiKeys}
              onModelChange={handleModelChange}
              onAddModel={() => openSettingsTab('models')}
              opacity={GRID_CONFIG.uiOpacity}
            />
          </div>

          <div className="flex-1 flex flex-col min-h-0 bg-transparent">
            <ChatThread
              modelConfig={currentModel}
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
      <Toaster position="top-right" />
    </TooltipProvider>
  )
}

export default App
