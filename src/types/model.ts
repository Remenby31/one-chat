export interface ModelConfig {
  id: string
  name: string
  apiKeyId: string  // Reference to endpoint (formerly API key)
  model: string
  maxTokens?: number
  temperature?: number
}

// Dummy export to ensure the module has a runtime export
export const __modelConfigType = true