const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  
  // Model management
  saveModel: (model) => ipcRenderer.invoke('models:save', model),
  loadModels: () => ipcRenderer.invoke('models:load'),
  deleteModel: (id) => ipcRenderer.invoke('models:delete', id),
  
  // Conversations
  saveConversation: (conversation) => ipcRenderer.invoke('conversation:save', conversation),
  loadConversations: () => ipcRenderer.invoke('conversation:load'),
  deleteConversation: (id) => ipcRenderer.invoke('conversation:delete', id),
  
  // MCP
  connectMCP: (config) => ipcRenderer.invoke('mcp:connect', config),
  disconnectMCP: (id) => ipcRenderer.invoke('mcp:disconnect', id),
  getMCPTools: (id) => ipcRenderer.invoke('mcp:get-tools', id),
  
  // Settings
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
});