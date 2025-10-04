import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),

  // Config file operations
  readConfig: (filename: string) => ipcRenderer.invoke('config:read', filename),
  writeConfig: (filename: string, data: any) => ipcRenderer.invoke('config:write', filename, data),
  exportConfig: () => ipcRenderer.invoke('config:export'),
  importConfig: () => ipcRenderer.invoke('config:import'),

  // Environment variable resolution
  resolveEnvVar: (value: string) => ipcRenderer.invoke('env:resolve', value),
  getEnvVars: () => ipcRenderer.invoke('env:list'),
});