import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  
  // Model management
  saveModel: (model: any) => ipcRenderer.invoke('models:save', model),
  loadModels: () => ipcRenderer.invoke('models:load'),
  deleteModel: (id: string) => ipcRenderer.invoke('models:delete', id),
  
  // Conversations
  saveConversation: (conversation: any) => ipcRenderer.invoke('conversation:save', conversation),
  loadConversations: () => ipcRenderer.invoke('conversation:load'),
  deleteConversation: (id: string) => ipcRenderer.invoke('conversation:delete', id),
  
  // MCP
  connectMCP: (config: any) => ipcRenderer.invoke('mcp:connect', config),
  disconnectMCP: (id: string) => ipcRenderer.invoke('mcp:disconnect', id),
  getMCPTools: (id: string) => ipcRenderer.invoke('mcp:get-tools', id),
  
  // Settings
  saveSettings: (settings: any) => ipcRenderer.invoke('settings:save', settings),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
});