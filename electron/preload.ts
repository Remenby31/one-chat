import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  // App/System
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getAppRoot: () => ipcRenderer.invoke('app:get-root'),
  getUserDataPath: () => ipcRenderer.invoke('app:get-user-data-path'),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),

  // Config file operations
  readConfig: (filename: string) => ipcRenderer.invoke('config:read', filename),
  writeConfig: (filename: string, data: any) => ipcRenderer.invoke('config:write', filename, data),
  exportConfig: () => ipcRenderer.invoke('config:export'),
  importConfig: () => ipcRenderer.invoke('config:import'),
  onConfigChanged: (callback: (filename: string, data: any) => void) => {
    const handler = (_event: any, filename: string, data: any) => callback(filename, data);
    ipcRenderer.on('config:changed', handler);
    return () => {
      ipcRenderer.removeListener('config:changed', handler);
    };
  },

  // Environment variable resolution
  resolveEnvVar: (value: string) => ipcRenderer.invoke('env:resolve', value),
  getEnvVars: () => ipcRenderer.invoke('env:list'),

  // API operations
  fetchModels: (baseURL: string, apiKey: string) => ipcRenderer.invoke('api:fetch-models', baseURL, apiKey),

  // MCP operations (using SDK)
  mcpStartServer: (server: any) => ipcRenderer.invoke('mcp:start-server', server),
  mcpStopServer: (serverId: string) => ipcRenderer.invoke('mcp:stop-server', serverId),
  mcpListTools: (serverId: string) => ipcRenderer.invoke('mcp:list-tools', serverId),
  mcpGetCapabilities: (serverId: string) => ipcRenderer.invoke('mcp:get-capabilities', serverId),
  mcpCallTool: (serverId: string, toolName: string, args: any) => ipcRenderer.invoke('mcp:call-tool', serverId, toolName, args),
  mcpListPrompts: (serverId: string) => ipcRenderer.invoke('mcp:list-prompts', serverId),
  mcpGetPrompt: (serverId: string, promptName: string, args?: any) => ipcRenderer.invoke('mcp:get-prompt', serverId, promptName, args),

  // MCP OAuth operations
  mcpStartOAuth: (serverId: string, oauthConfig: any) => ipcRenderer.invoke('mcp:start-oauth', serverId, oauthConfig),
  mcpExchangeOAuthCode: (code: string, state: string, oauthConfig: any) => ipcRenderer.invoke('mcp:exchange-oauth-code', code, state, oauthConfig),

  // OAuth callback listener
  onOAuthCallback: (callback: (url: string) => void) => {
    const handler = (_event: any, url: string) => callback(url);
    ipcRenderer.on('oauth:callback', handler);
    return () => {
      ipcRenderer.removeListener('oauth:callback', handler);
    };
  },

  // MCP server process events
  onMcpServerExited: (callback: (data: { serverId: string; exitCode: number | null }) => void) => {
    const handler = (_event: any, data: { serverId: string; exitCode: number | null }) => callback(data);
    ipcRenderer.on('mcp:server-exited', handler);
    return () => {
      ipcRenderer.removeListener('mcp:server-exited', handler);
    };
  },

  // Generic invoke for custom IPC calls
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
