import { useChatRuntime } from '@assistant-ui/react-ai-sdk'
import type { ModelConfig } from '@/types/model'

export function useModelRuntime(modelConfig: ModelConfig | null) {
  // Create a runtime that can handle different model configurations
  return useChatRuntime({
    api: async (request: any) => {
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
                content: 'Bienvenue dans OneChat! Pour commencer, configurez un modèle d\'IA en cliquant sur Paramètres dans la barre latérale.'
              },
              finish_reason: 'stop'
            }]
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Parse the messages from the request
      const { messages } = await request.json()

      try {
        // Make API call to the configured model
        const response = await fetch(`${modelConfig.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${modelConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: modelConfig.model,
            messages: messages,
            temperature: modelConfig.temperature || 0.7,
            max_tokens: modelConfig.maxTokens || 2048,
            stream: true,
          }),
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
                content: `Erreur lors de la connexion à l'API: ${error instanceof Error ? error.message : 'Erreur inconnue'}. Vérifiez vos paramètres dans la configuration du modèle.`
              },
              finish_reason: 'stop'
            }]
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      }
    },
  })
}