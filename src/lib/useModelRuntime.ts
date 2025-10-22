import { useLocalRuntime } from '@assistant-ui/react'
import type { ChatModelRunOptions } from '@assistant-ui/react'
import { useMemo } from 'react'
import type { ModelConfig } from '@/types/model'
import type { ApiKey } from '@/types/apiKey'
import { showApiErrorToast } from '@/lib/errorToast'

export function useModelRuntime(modelConfig: ModelConfig | null) {
  // Create a chat model adapter
  const adapter = useMemo(() => {
    return {
      async *run({ messages, abortSignal }: ChatModelRunOptions) {
        console.log('[useModelRuntime] run called', { modelConfig, messages })

        // If no model is configured, return a helpful message
        if (!modelConfig) {
          console.log('[useModelRuntime] No model configured')
          yield {
            content: [{
              type: 'text' as const,
              text: 'Welcome to Jarvis! To get started, configure an AI model by clicking Settings in the sidebar.'
            }]
          }
          return
        }

        // Get the API key from storage
        let apiKeys: ApiKey[] = []
        if (window.electronAPI) {
          apiKeys = await window.electronAPI.readConfig('apiKeys.json') || []
        } else {
          apiKeys = JSON.parse(localStorage.getItem('apiKeys') || '[]')
        }
        const apiKey = apiKeys.find(k => k.id === modelConfig.apiKeyId)
        console.log('[useModelRuntime] API key lookup', { apiKeyId: modelConfig.apiKeyId, found: !!apiKey })

        if (!apiKey) {
          console.log('[useModelRuntime] API key not found')
          yield {
            content: [{
              type: 'text' as const,
              text: 'Endpoint not found. Please check your model configuration in Settings.'
            }]
          }
          return
        }

        // Resolve environment variables in API key
        let resolvedApiKey = apiKey.key
        if (window.electronAPI && apiKey.key.startsWith('$')) {
          resolvedApiKey = await window.electronAPI.resolveEnvVar(apiKey.key)
        }

        try {
          // Convert assistant-ui messages to OpenAI format
          const convertedMessages = messages.map((msg) => ({
            role: msg.role,
            content: msg.content.map((part: any) => {
              if (part.type === 'text') return part.text
              return ''
            }).join('\n')
          }))

          const requestBody = {
            model: modelConfig.model,
            messages: convertedMessages,
            stream: true,
          }

          // Direct fetch streaming - works in both Electron and browser
          console.log('[useModelRuntime] Streaming request', { baseURL: apiKey.baseURL, model: modelConfig.model })

          const requestStartTime = performance.now()
          const response = await fetch(`${apiKey.baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${resolvedApiKey}`,
            },
              body: JSON.stringify(requestBody),
              signal: abortSignal,
            })

            const responseReceivedTime = performance.now()
            const connectionTime = (responseReceivedTime - requestStartTime).toFixed(0)
            console.log(`[useModelRuntime] ⚡ Connection established in ${connectionTime}ms (DNS + TCP + TLS + HTTP)`)

            if (!response.ok) {
              const errorText = await response.text()
              throw new Error(`HTTP ${response.status}: ${errorText}`)
            }

            // Parse streaming response
            const reader = response.body?.getReader()
            const decoder = new TextDecoder()

            if (!reader) {
              throw new Error('No response body')
            }

            let buffer = ''
            let fullText = ''
            let chunkCount = 0
            let lastChunkTime = performance.now()
            let firstTokenTime: number | null = null

            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              const chunkText = decoder.decode(value, { stream: true })
              buffer += chunkText
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim()
                  if (data === '[DONE]') break

                  try {
                    const parsed = JSON.parse(data)
                    const delta = parsed.choices?.[0]?.delta
                    if (delta?.content) {
                      const now = performance.now()
                      const elapsed = (now - requestStartTime).toFixed(0)
                      const deltaTime = (now - lastChunkTime).toFixed(0)
                      lastChunkTime = now

                      // Log TTFT on first token
                      if (firstTokenTime === null) {
                        firstTokenTime = now
                        const ttft = (now - requestStartTime).toFixed(0)
                        console.log(`[useModelRuntime] 🎯 FIRST TOKEN after ${ttft}ms`)
                      }

                      fullText += delta.content
                      chunkCount++

                      // Log every 10th chunk to avoid spam
                      if (chunkCount % 10 === 0) {
                        console.log(`[useModelRuntime] Chunk ${chunkCount} | +${deltaTime}ms (total: ${elapsed}ms) | length: ${fullText.length}`)
                      }

                      // Yield immediately after each delta
                      yield {
                        content: [{ type: 'text' as const, text: fullText }]
                      }
                    }
                  } catch (e) {
                    console.warn('[useModelRuntime] Failed to parse SSE line:', line, e)
                  }
                }
              }
            }

            const totalTime = (performance.now() - requestStartTime).toFixed(0)
            const ttft = firstTokenTime ? (firstTokenTime - requestStartTime).toFixed(0) : 'N/A'
            console.log(`[useModelRuntime] Stream complete. TTFT: ${ttft}ms, Total: ${totalTime}ms, Chunks: ${chunkCount}, Length: ${fullText.length}`)
        } catch (error) {
          console.error('[useModelRuntime] Error in run', error)

          // Show error toast instead of displaying in chat
          showApiErrorToast(error)

          // Optionally, still yield a brief error message in chat
          yield {
            content: [{
              type: 'text' as const,
              text: 'An error occurred while processing your request. Please check the notification for details.'
            }]
          }
        }
      }
    }
  }, [modelConfig])

  // Create runtime with the adapter
  const runtime = useLocalRuntime(adapter)

  return runtime
}
