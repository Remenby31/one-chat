export interface ModelConfig {
  id: string
  name: string
  baseURL: string
  apiKey: string
  model: string
  maxTokens?: number
  temperature?: number
}

// Dummy export to ensure the module has a runtime export
export const __modelConfigType = true