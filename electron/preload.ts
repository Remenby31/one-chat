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

  // Note: Chat completion streaming is now handled directly via fetch() in frontend
  // No IPC needed thanks to permissive CSP
};

console.log('[preload.ts] ============================================');
console.log('[preload.ts] VERSION: 4.0 - TYPESCRIPT MIGRATION');
console.log('[preload.ts] Exposing electronAPI with methods:', Object.keys(electronAPI));
console.log('[preload.ts] ============================================');

contextBridge.exposeInMainWorld('electronAPI', electronAPI);