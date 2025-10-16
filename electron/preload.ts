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

  // MCP operations
  mcpStartServer: (server: any) => ipcRenderer.invoke('mcp:start-server', server),
  mcpStopServer: (serverId: string) => ipcRenderer.invoke('mcp:stop-server', serverId),
  mcpListTools: (serverId: string) => ipcRenderer.invoke('mcp:list-tools', serverId),
  mcpGetCapabilities: (serverId: string) => ipcRenderer.invoke('mcp:get-capabilities', serverId),
  mcpCallTool: (serverId: string, toolName: string, args: any) => ipcRenderer.invoke('mcp:call-tool', serverId, toolName, args),
  mcpImportClaudeDesktop: () => ipcRenderer.invoke('mcp:import-claude-desktop'),

  // OAuth operations
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  onOAuthCallback: (callback: (url: string) => void) => {
    const handler = (_event: any, url: string) => callback(url);
    ipcRenderer.on('oauth:callback', handler);
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('oauth:callback', handler);
    };
  },

  // Note: Chat completion streaming is now handled directly via fetch() in frontend
  // No IPC needed thanks to permissive CSP
};

console.log('[preload.ts] ============================================');
console.log('[preload.ts] VERSION: 4.0 - TYPESCRIPT MIGRATION');
console.log('[preload.ts] Exposing electronAPI with methods:', Object.keys(electronAPI));
console.log('[preload.ts] ============================================');

contextBridge.exposeInMainWorld('electronAPI', electronAPI);