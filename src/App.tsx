import { useState, useEffect, useRef } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { ChatThread } from '@/components/chat/ChatThread'
import { Sidebar } from '@/components/Sidebar'
import { Settings } from '@/components/Settings'
import { ModelSelector } from '@/components/ModelSelector'
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

/**
 * Start MCP servers and sync their states from the SDK
 */
async function startAndSyncMcpServers(
  servers: MCPServer[],
  setMcpServers: React.Dispatch<React.SetStateAction<MCPServer[]>>
): Promise<void> {
  // Ensure all servers have initial state
  const serversWithState = servers.map(s => ({
    ...s,
    state: s.state || 'idle' as const
  }))

  // Start servers in parallel with setting React state
  const startPromise = mcpManager.startEnabledServers(serversWithState)
  setMcpServers(serversWithState)

  // Wait for all servers to finish connecting
  await startPromise

  // Fetch actual states from SDK and update
  if (window.electronAPI?.mcpGetAllServerStates) {
    const result = await window.electronAPI.mcpGetAllServerStates()
    if (result.success && result.states) {
      const updatedServers = serversWithState.map(server => {
        const actualState = result.states[server.id]
        if (actualState) {
          return { ...server, state: actualState.state as MCPServer['state'], error: actualState.error }
        }
        return server
      })
      setMcpServers(updatedServers)
    }
  }
}

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

  // Refs to prevent double initialization in StrictMode
  const configInitialized = useRef(false)
  const threadsInitialized = useRef(false)

  // Load saved model and MCP servers on mount
  useEffect(() => {
    // Prevent double initialization in StrictMode
    if (configInitialized.current) return
    configInitialized.current = true

    // IMPORTANT: Register listeners BEFORE starting servers to avoid race conditions
    // where state change events arrive before listeners are registered

    // Sync MCP servers state with config file via file watcher
    if (window.electronAPI?.onConfigChanged) {
      const handleConfigChanged = (filename: string, data: any) => {
        if (filename === 'mcpServers.json') {
          // Preserve runtime state from React (SDK events are the source of truth for state)
          // File watcher should only update config properties, not state
          setMcpServers(prevServers => {
            return data.map((newServer: MCPServer) => {
              const existing = prevServers.find(s => s.id === newServer.id)
              if (existing) {
                // Preserve existing runtime state (state, error) from React
                // Only update config properties from file
                return {
                  ...newServer,
                  state: existing.state,
                  error: existing.error
                }
              }
              // New server - use state from file or default to idle
              return { ...newServer, state: newServer.state || 'idle' }
            })
          })
        }
      }

      window.electronAPI.onConfigChanged(handleConfigChanged)
    }

    // Listen for MCP server state changes from main process
    // State is runtime-only, NOT persisted to file (config file = configuration only)
    // MUST be registered before starting servers!
    let stateChangeUnsubscribe: (() => void) | undefined
    if (window.electronAPI?.onMcpStateChanged) {
      stateChangeUnsubscribe = window.electronAPI.onMcpStateChanged((data) => {
        const { serverId, state, error } = data

        setMcpServers(prevServers =>
          prevServers.map(server =>
            server.id === serverId
              ? { ...server, state: state as MCPServer['state'], error }
              : server
          )
        )
        // Note: State is NOT written to file - it's runtime only
        // The SDK is the source of truth for state
      })
    }

    // NOW load config and start servers (after listeners are registered)
    const loadConfig = async () => {
      if (window.electronAPI) {
        // Use Electron file storage
        const savedModels = await window.electronAPI.readConfig('models.json')
        const savedApiKeys = await window.electronAPI.readConfig('apiKeys.json')
        const selectedModelId = await window.electronAPI.readConfig('selectedModel.json')
        const savedMcpServers = await window.electronAPI.readConfig('mcpServers.json')

        // Get user data path for MCP server configuration (vaults, etc.)
        const userDataPath = await window.electronAPI.getUserDataPath()

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

        // Initialize built-in servers (adds new ones, updates existing ones)
        const servers = await initializeBuiltInServers(savedMcpServers || [], userDataPath)

        // Start servers and sync states from SDK
        await startAndSyncMcpServers(servers, setMcpServers)
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
      console.error('[App] ❌ FATAL ERROR loading config:', error)
      console.error('[App] Stack trace:', error?.stack)
      showGlobalErrorToast(error)
    })

    // Cleanup: stop all servers and unregister listener on unmount
    return () => {
      stateChangeUnsubscribe?.()
      if (window.electronAPI) {
        mcpManager.stopAllServers(mcpServers)
      }
    }
  }, [])

  // Load threads and current thread on mount
  useEffect(() => {
    // Prevent double initialization in StrictMode
    if (threadsInitialized.current) return
    threadsInitialized.current = true

    const loadThreads = async () => {
      // Load thread list (for sidebar display)
      await threadStore.loadThreads()

      // Always create a new thread on startup (fresh conversation experience)
      await threadStore.createThread(DEFAULT_SYSTEM_PROMPT)
      chatStore.clearMessages()
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
    async (serverId, _oauthConfig) => {
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
    const { messages } = await threadStore.switchThread(threadId)
    chatStore.loadMessages(messages)
    // System prompt is already set in threadStore by switchThread
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar
          onSettingsClick={() => openSettingsTab('models')}
          onNewChat={handleNewChat}
          onThreadSelect={handleThreadSelect}
          currentThreadId={threadStore.currentThreadId}
        />

        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 py-3 flex items-center justify-between">
            <ModelSelector
              models={models}
              currentModel={currentModel}
              apiKeys={apiKeys}
              onModelChange={handleModelChange}
              onAddModel={() => openSettingsTab('models')}
            />
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <ChatThread
              modelConfig={currentModel}
              mcpServers={mcpServers}
              onMcpToggle={handleMcpToggle}
              onSettingsClick={() => openSettingsTab('mcp')}
            />
          </div>
        </div>

        <Settings
          open={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          onModelChange={handleModelChange}
          onModelsUpdate={handleModelsUpdate}
          defaultTab={settingsTab}
          mcpServers={mcpServers}
          onMcpServersChange={setMcpServers}
        />
      </div>
      <Toaster position="top-right" />
    </TooltipProvider>
  )
}

export default App
