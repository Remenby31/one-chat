import { useChatRuntime } from '@assistant-ui/react-ai-sdk'
import type { ModelConfig } from '@/types/model'
import type { ApiKey } from '@/types/apiKey'
import { AssistantChatTransport } from '@assistant-ui/react-ai-sdk'

export function useModelRuntime(modelConfig: ModelConfig | null) {
  // Create a custom transport that handles our model configuration
  const transport = new AssistantChatTransport({
    async fetch(_url: RequestInfo | URL, options: RequestInit = {}) {
      // If no model is configured, return a helpful message
      if (!modelConfig) {
        return new Response(
          JSON.stringify({
            id: 'msg_' + Date.now(),
            object: 'chat.completion',
            created: Date.now(),
            model: 'assistant',
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: 'Welcome to OneChat! To get started, configure an AI model by clicking Settings in the sidebar.'
              },
              finish_reason: 'stop'
            }]
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Get the API key from storage
      let apiKeys: ApiKey[] = []
      if (window.electronAPI) {
        apiKeys = await window.electronAPI.readConfig('apiKeys.json') || []
      } else {
        apiKeys = JSON.parse(localStorage.getItem('apiKeys') || '[]')
      }
      const apiKey = apiKeys.find(k => k.id === modelConfig.apiKeyId)

      if (!apiKey) {
        return new Response(
          JSON.stringify({
            id: 'msg_' + Date.now(),
            object: 'chat.completion',
            created: Date.now(),
            model: modelConfig.model,
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: 'Endpoint not found. Please check your model configuration in Settings.'
              },
              finish_reason: 'stop'
            }]
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Resolve environment variables in API key
      let resolvedApiKey = apiKey.key
      if (window.electronAPI && apiKey.key.startsWith('$')) {
        resolvedApiKey = await window.electronAPI.resolveEnvVar(apiKey.key)
      }

      try {
        // Parse the request body to get messages
        const body = JSON.parse(options.body as string)

        // Make API call to the configured model using endpoint's base URL
        const response = await fetch(`${apiKey.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resolvedApiKey}`,
          },
          body: JSON.stringify({
            model: modelConfig.model,
            messages: body.messages,
            temperature: modelConfig.temperature || 0.7,
            max_tokens: modelConfig.maxTokens || 2048,
            stream: true,
          }),
          signal: options.signal,
        })

        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText}`)
        }

        // Return the streaming response directly
        return response
      } catch (error) {
        // Return error message
        return new Response(
          JSON.stringify({
            id: 'msg_' + Date.now(),
            object: 'chat.completion',
            created: Date.now(),
            model: modelConfig.model,
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: `Error connecting to API: ${error instanceof Error ? error.message : 'Unknown error'}. Please check your model configuration settings.`
              },
              finish_reason: 'stop'
            }]
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      }
    }
  })

  // Create runtime with custom transport
  return useChatRuntime({ transport })
}