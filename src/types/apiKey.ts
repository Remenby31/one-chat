export interface ApiKey {
  id: string
  name: string
  key: string
  baseURL: string
}

// Provider detection based on API key prefix
export const API_KEY_PROVIDERS = {
  'sk-': { name: 'OpenAI', baseURL: 'https://api.openai.com/v1' },
  'sk-ant-': { name: 'Anthropic', baseURL: 'https://api.anthropic.com/v1' },
  'AIza': { name: 'Google Gemini', baseURL: 'https://generativelanguage.googleapis.com/v1' },
  'co-': { name: 'Cohere', baseURL: 'https://api.cohere.ai/v1' },
  'mis-': { name: 'Mistral', baseURL: 'https://api.mistral.ai/v1' },
  'hf_': { name: 'Hugging Face', baseURL: 'https://api-inference.huggingface.co/v1' },
  'ai21.': { name: 'AI21 Labs', baseURL: 'https://api.ai21.com/v1' },
  'r8_': { name: 'Replicate', baseURL: 'https://api.replicate.com/v1' },
  'pplx-': { name: 'Perplexity', baseURL: 'https://api.perplexity.ai/v1' },
  'eleven_': { name: 'ElevenLabs', baseURL: 'https://api.elevenlabs.io/v1' },
} as const

export function detectProvider(apiKey: string): { name: string; baseURL: string } | null {
  // Check for environment variable format
  if (apiKey.startsWith('$')) {
    return null
  }

  // Sort by prefix length (longest first) to match more specific prefixes first
  const sortedPrefixes = Object.keys(API_KEY_PROVIDERS).sort((a, b) => b.length - a.length)

  for (const prefix of sortedPrefixes) {
    if (apiKey.startsWith(prefix)) {
      return API_KEY_PROVIDERS[prefix as keyof typeof API_KEY_PROVIDERS]
    }
  }

  // Check for Azure (32 hex characters, no specific prefix)
  if (/^[0-9a-f]{32}$/i.test(apiKey)) {
    return { name: 'Azure OpenAI', baseURL: 'https://YOUR-RESOURCE.openai.azure.com' }
  }

  return null
}
