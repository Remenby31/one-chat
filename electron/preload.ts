import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  getVersion: () => ipcRenderer.invoke('app:get-version'),

  // Config file operations
  readConfig: (filename: string) => ipcRenderer.invoke('config:read', filename),
  writeConfig: (filename: string, data: any) => ipcRenderer.invoke('config:write', filename, data),
  exportConfig: () => ipcRenderer.invoke('config:export'),
  importConfig: () => ipcRenderer.invoke('config:import'),

  // Environment variable resolution
  resolveEnvVar: (value: string) => ipcRenderer.invoke('env:resolve', value),
  getEnvVars: () => ipcRenderer.invoke('env:list'),

  // API operations
  fetchModels: (baseURL: string, apiKey: string) => ipcRenderer.invoke('api:fetch-models', baseURL, apiKey),
  chatCompletion: (baseURL: string, apiKey: string, body: any) => ipcRenderer.invoke('api:chat-completion', baseURL, apiKey, body),
};

console.log('[preload.ts] Exposing electronAPI with methods:', Object.keys(electronAPI));
console.log('[preload.ts] chatCompletion exists?', typeof electronAPI.chatCompletion);

contextBridge.exposeInMainWorld('electronAPI', electronAPI);