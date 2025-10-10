/// <reference types="vite/client" />

interface ElectronAPI {
  getVersion: () => Promise<string>
  readConfig: (filename: string) => Promise<any>
  writeConfig: (filename: string, data: any) => Promise<boolean>
  exportConfig: () => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>
  importConfig: () => Promise<{ success: boolean; config?: any; canceled?: boolean; error?: string }>
  resolveEnvVar: (value: string) => Promise<string>
  getEnvVars: () => Promise<Record<string, string>>
  fetchModels: (baseURL: string, apiKey: string) => Promise<{ success: boolean; models?: string[]; error?: string }>
  chatCompletion: (baseURL: string, apiKey: string, body: any) => Promise<{ success: boolean; data?: string; error?: string }>
}

interface Window {
  electronAPI: ElectronAPI
}
