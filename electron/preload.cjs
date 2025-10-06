const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),

  // Config file operations
  readConfig: (filename) => ipcRenderer.invoke('config:read', filename),
  writeConfig: (filename, data) => ipcRenderer.invoke('config:write', filename, data),
  exportConfig: () => ipcRenderer.invoke('config:export'),
  importConfig: () => ipcRenderer.invoke('config:import'),

  // Environment variable resolution
  resolveEnvVar: (value) => ipcRenderer.invoke('env:resolve', value),
  getEnvVars: () => ipcRenderer.invoke('env:list'),

  // API operations
  fetchModels: (baseURL, apiKey) => ipcRenderer.invoke('api:fetch-models', baseURL, apiKey),
});