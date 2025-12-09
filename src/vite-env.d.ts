/// <reference types="vite/client" />

interface ElectronAPI {
  getVersion: () => Promise<string>
  getAppRoot: () => Promise<string>
  getUserDataPath: () => Promise<string>
  readConfig: (filename: string) => Promise<any>
  writeConfig: (filename: string, data: any) => Promise<boolean>
  exportConfig: () => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>
  importConfig: () => Promise<{ success: boolean; config?: any; canceled?: boolean; error?: string }>
  onConfigChanged: (callback: (filename: string, data: any) => void) => () => void
  resolveEnvVar: (value: string) => Promise<string>
  getEnvVars: () => Promise<Record<string, string>>
  fetchModels: (baseURL: string, apiKey: string) => Promise<{ success: boolean; models?: string[]; error?: string }>
  // Note: Chat completion streaming now uses direct fetch() - no IPC needed

  // OAuth
  openExternal: (url: string) => Promise<void>
  onOAuthCallback: (callback: (url: string) => void) => () => void

  // MCP
  mcpStartServer: (server: any) => Promise<{ success: boolean; error?: string }>
  mcpStopServer: (serverId: string) => Promise<{ success: boolean; error?: string }>
  mcpListTools: (serverId: string) => Promise<{ success: boolean; tools?: any[]; error?: string }>
  mcpGetCapabilities: (serverId: string) => Promise<{ success: boolean; capabilities?: any; error?: string }>
  mcpCallTool: (serverId: string, toolName: string, args: Record<string, any>) => Promise<{ success: boolean; result?: any; error?: string }>
  mcpListPrompts: (serverId: string) => Promise<{ success: boolean; prompts?: any[]; error?: string }>
  mcpGetPrompt: (serverId: string, promptName: string, args?: Record<string, any>) => Promise<{ success: boolean; messages?: any[]; error?: string }>
  mcpGetLogs: (serverId: string) => Promise<{ success: boolean; logs?: any[]; error?: string }>
  mcpClearLogs: (serverId: string) => Promise<void>
  onMCPLog: (callback: (log: any) => void) => () => void
  onMcpServerExited: (callback: (data: { serverId: string; exitCode: number | null }) => void) => () => void

  // Generic invoke
  invoke: (channel: string, ...args: any[]) => Promise<any>
}

interface Window {
  electronAPI: ElectronAPI
}
