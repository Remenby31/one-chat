import { useLocalRuntime } from '@assistant-ui/react'
import { useMemo } from 'react'
import type { ModelConfig } from '@/types/model'
import type { ApiKey } from '@/types/apiKey'

export function useModelRuntime(modelConfig: ModelConfig | null) {
  // Create a chat model adapter
  const adapter = useMemo(() => {
    return {
      async *run({ messages, abortSignal }) {
        console.log('[useModelRuntime] run called', { modelConfig, messages })

        // If no model is configured, return a helpful message
        if (!modelConfig) {
          console.log('[useModelRuntime] No model configured')
          yield {
            content: [{
              type: 'text' as const,
              text: 'Welcome to OneChat! To get started, configure an AI model by clicking Settings in the sidebar.'
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
            content: msg.content.map(part => {
              if (part.type === 'text') return part.text
              return ''
            }).join('\n')
          }))

          const requestBody = {
            model: modelConfig.model,
            messages: convertedMessages,
            stream: true,
          }

          // Use Electron IPC if available, otherwise fall back to direct fetch
          if (window.electronAPI) {
            console.log('[useModelRuntime] Using Electron IPC', { baseURL: apiKey.baseURL, requestBody })
            const result = await window.electronAPI.chatCompletion(
              apiKey.baseURL,
              resolvedApiKey,
              requestBody
            )

            console.log('[useModelRuntime] IPC result', { success: result.success, dataLength: result.data?.length })

            if (!result.success) {
              console.error('[useModelRuntime] IPC error', result.error)
              throw new Error(result.error || 'Unknown error')
            }

            // Parse SSE stream
            const lines = result.data.split('\n')
            console.log('[useModelRuntime] Parsing', lines.length, 'lines')
            let fullText = ''
            let yieldCount = 0

            for (const line of lines) {
              if (abortSignal?.aborted) break

              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                if (data === '[DONE]') {
                  console.log('[useModelRuntime] Received [DONE]')
                  break
                }

                try {
                  const parsed = JSON.parse(data)
                  const delta = parsed.choices?.[0]?.delta
                  if (delta?.content) {
                    fullText += delta.content
                    yieldCount++
                    yield {
                      content: [{ type: 'text' as const, text: fullText }]
                    }
                  }
                } catch (e) {
                  console.warn('[useModelRuntime] Failed to parse SSE line:', line.substring(0, 100), e)
                }
              }
            }
            console.log('[useModelRuntime] Yielded', yieldCount, 'chunks, total length:', fullText.length)
          } else {
            console.log('[useModelRuntime] Using direct fetch')
            // Fallback to direct fetch for development/browser mode
            const response = await fetch(`${apiKey.baseURL}/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${resolvedApiKey}`,
              },
              body: JSON.stringify(requestBody),
              signal: abortSignal,
            })

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
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              buffer += decoder.decode(value, { stream: true })
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
                      fullText += delta.content
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
          }
        } catch (error) {
          console.error('[useModelRuntime] Error in run', error)

          // Parse error message to extract detailed information
          let errorMessage = 'Unknown error'
          let errorDetails = ''

          if (error instanceof Error) {
            const errorMsg = error.message

            // Try to extract HTTP status and JSON error details
            const httpMatch = errorMsg.match(/HTTP (\d+): (.+)/)
            if (httpMatch) {
              const statusCode = httpMatch[1]
              const jsonPart = httpMatch[2]

              try {
                const errorData = JSON.parse(jsonPart)
                if (errorData.error) {
                  const { message, type, code } = errorData.error

                  // Create a user-friendly error message based on status code
                  if (statusCode === '429') {
                    errorMessage = '⚠️ API Quota Exceeded'
                    errorDetails = `\n\n**Error:** ${message}\n\n**Type:** ${type}\n**Code:** ${code}\n\nPlease check your API plan and billing details.`
                  } else if (statusCode === '401') {
                    errorMessage = '🔒 Authentication Failed'
                    errorDetails = `\n\n**Error:** ${message}\n\n**Type:** ${type}\n**Code:** ${code}\n\nPlease verify your API key in Settings.`
                  } else if (statusCode === '404') {
                    errorMessage = '❌ Endpoint Not Found'
                    errorDetails = `\n\n**Error:** ${message}\n\n**Type:** ${type}\n**Code:** ${code}\n\nPlease check your model configuration in Settings.`
                  } else if (statusCode === '500' || statusCode === '502' || statusCode === '503') {
                    errorMessage = '🔧 Server Error'
                    errorDetails = `\n\n**Error:** ${message}\n\n**Type:** ${type}\n**Code:** ${code}\n**Status:** HTTP ${statusCode}\n\nThe API server is experiencing issues. Please try again later.`
                  } else {
                    errorMessage = `⚠️ API Error (HTTP ${statusCode})`
                    errorDetails = `\n\n**Error:** ${message}\n\n**Type:** ${type}\n**Code:** ${code}`
                  }
                }
              } catch {
                // If JSON parsing fails, use the raw message
                errorMessage = `⚠️ API Error (HTTP ${statusCode})`
                errorDetails = `\n\n**Error:** ${errorMsg}`
              }
            } else {
              // No HTTP status found, use the error message as-is
              errorMessage = '❌ Connection Error'
              errorDetails = `\n\n**Error:** ${errorMsg}\n\nPlease check your network connection and model configuration in Settings.`
            }
          }

          // Yield error message
          yield {
            content: [{
              type: 'text' as const,
              text: `${errorMessage}${errorDetails}`
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
