/// <reference types="vite/client" />

interface ElectronAPI {
  getVersion: () => Promise<string>
  readConfig: (filename: string) => Promise<any>
  writeConfig: (filename: string, data: any) => Promise<boolean>
  exportConfig: () => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>
  importConfig: () => Promise<{ success: boolean; config?: any; canceled?: boolean; error?: string }>
  resolveEnvVar: (value: string) => Promise<string>
  getEnvVars: () => Promise<Record<string, string>>
}

interface Window {
  electronAPI: ElectronAPI
}
