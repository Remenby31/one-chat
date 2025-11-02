import { useEffect, useState, useMemo, useCallback } from 'react'
import { useChatStore } from '@/lib/chatStore'
import { useThreadStore } from '@/lib/threadStore'
import type { ModelConfig } from '@/types/model'
import type { ApiKey } from '@/types/apiKey'
import type { MCPServer, MCPTool } from '@/types/mcp'
import { mcpManager } from '@/lib/mcpManager'

/**
 * Main hook for managing streaming chat with MCP tool support
 *
 * This hook:
 * - Manages chat state via chatStore
 * - Handles streaming API requests
 * - Executes MCP tool calls
 * - Updates UI in real-time during streaming
 */
export function useStreamingChat(
  modelConfig: ModelConfig | null,
  mcpServers: MCPServer[]
) {
  const store = useChatStore()
  const threadStore = useThreadStore()
  const [mcpTools, setMcpTools] = useState<Record<string, MCPTool[]>>({})

  // Fetch tools from all active MCP servers
  useEffect(() => {
    // Helper to fetch tools with retry (handles race condition during server startup)
    const fetchToolsWithRetry = async (
      server: MCPServer,
      maxRetries = 3,
      delay = 500
    ): Promise<{ serverId: string; serverName: string; tools: MCPTool[] }> => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const tools = await mcpManager.getServerTools(server.id)
          return { serverId: server.id, serverName: server.name, tools }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'

          // If server not running yet, retry with exponential backoff
          if (errorMsg.includes('Server not running') && attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delay * attempt))
            continue
          }

          // Log only on final failure or non-retryable errors
          if (attempt === maxRetries || !errorMsg.includes('Server not running')) {
            console.warn(`[useStreamingChat] Failed to get tools from ${server.name}: ${errorMsg}`)
          }

          return { serverId: server.id, serverName: server.name, tools: [] }
        }
      }

      return { serverId: server.id, serverName: server.name, tools: [] }
    }

    const activeServers = mcpServers.filter(
      s => s.enabled && s.status === 'RUNNING'
    )

    if (activeServers.length === 0) {
      setMcpTools({})
      return
    }

    Promise.allSettled(
      activeServers.map(server => fetchToolsWithRetry(server))
    ).then(results => {
      const toolsMap: Record<string, MCPTool[]> = {}
      let totalTools = 0

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          toolsMap[result.value.serverId] = result.value.tools
          totalTools += result.value.tools.length
        }
      })

      setMcpTools(toolsMap)
    })
  }, [mcpServers])

  // Auto-save messages to current thread
  useEffect(() => {
    const currentThreadId = threadStore.currentThreadId
    if (!currentThreadId) return

    // Filter out streaming messages before saving
    const messagesToSave = store.messages.filter(m => !m.isStreaming)
    if (messagesToSave.length === 0) return

    // Debounce saves (don't save while streaming)
    if (store.isGenerating) return

    // Save to thread store with system prompt
    const systemPrompt = threadStore.currentSystemPrompt || undefined
    threadStore.saveThreadMessages(currentThreadId, messagesToSave, systemPrompt)

    // Update title after first complete exchange (user + assistant)
    const hasCompleteExchange = messagesToSave.filter(m => m.role === 'user').length > 0 &&
                                messagesToSave.filter(m => m.role === 'assistant').length > 0

    if (hasCompleteExchange && messagesToSave.length >= 2) {
      threadStore.updateThreadTitle(currentThreadId, messagesToSave)
    }
  }, [store.messages, store.isGenerating, threadStore.currentThreadId, threadStore.currentSystemPrompt])

  // Convert MCP tools to OpenAI function calling format
  const openaiTools = useMemo(() => {
    const tools: any[] = []

    Object.entries(mcpTools).forEach(([serverId, serverTools]) => {
      serverTools.forEach(tool => {
        const toolName = `${serverId}__${tool.name}`
        tools.push({
          type: 'function',
          function: {
            name: toolName,
            description: tool.description || `Tool ${tool.name} from server ${serverId}`,
            parameters: tool.inputSchema
          }
        })
      })
    })

    return tools
  }, [mcpTools])

  // Send message and handle streaming response
  const sendMessage = useCallback(async (content: string) => {
    // Add user message to store
    store.addMessage({
      role: 'user',
      content,
      attachments: store.pendingAttachments.length > 0 ? [...store.pendingAttachments] : undefined,
    })

    // Clear pending attachments
    store.clearAttachments()

    // Start generation
    store.startGeneration()

    // Add empty assistant message that will be updated during streaming
    store.addMessage({
      role: 'assistant',
      content: '',
      isStreaming: true,
    })

    // Check if model is configured
    if (!modelConfig) {
      store.updateLastMessage('Welcome to Jarvis! To get started, configure an AI model by clicking Settings in the sidebar.')
      store.finishGeneration()
      return
    }

    // Get API key
    let apiKeys: ApiKey[] = []
    if (window.electronAPI) {
      apiKeys = await window.electronAPI.readConfig('apiKeys.json') || []
    } else {
      apiKeys = JSON.parse(localStorage.getItem('apiKeys') || '[]')
    }
    const apiKey = apiKeys.find(k => k.id === modelConfig.apiKeyId)

    if (!apiKey) {
      store.updateLastMessage('Endpoint not found. Please check your model configuration in Settings.')
      store.finishGeneration()
      return
    }

    // Resolve environment variables in API key
    let resolvedApiKey = apiKey.key
    if (window.electronAPI && apiKey.key.startsWith('$')) {
      resolvedApiKey = await window.electronAPI.resolveEnvVar(apiKey.key)
    }

    // Create abort controller
    const abortController = new AbortController()
    store.setAbortController(abortController)

    try {
      // Get current state synchronously (Zustand updates are async, so we need getState())
      const currentMessages = useChatStore.getState().messages

      // Add system prompt if available
      const systemPrompt = threadStore.currentSystemPrompt
      const systemMessage = systemPrompt
        ? [{ role: 'system' as const, content: systemPrompt }]
        : []

      // Convert store messages to OpenAI format (exclude empty and streaming messages)
      let conversationMessages = [
        ...systemMessage,
        ...currentMessages
          .filter(m => m.content.trim() !== '' && !m.isStreaming)
          .map((msg) => {
            // Include tool_calls if present
            const message: any = {
              role: msg.role,
              content: msg.content
            }

            // Add tool_call_id for tool messages
            if (msg.role === 'tool' && msg.tool_call_id) {
              message.tool_call_id = msg.tool_call_id
            }

            // Add tool_calls for assistant messages with tool requests
            if (msg.role === 'assistant' && msg.tool_call_requests) {
              message.tool_calls = msg.tool_call_requests
            }

            return message
          })
      ]

      // Multi-turn loop to handle tool calls
      let turnCount = 0
      const MAX_TURNS = 10

      while (turnCount < MAX_TURNS) {
        turnCount++

        const requestBody: any = {
          model: modelConfig.model,
          messages: conversationMessages,
          stream: true,
        }

        // Add tools if available
        if (openaiTools.length > 0) {
          requestBody.tools = openaiTools
        }

        console.log(`[SSE] 🌐 Initiating request to: ${apiKey.baseURL}/chat/completions`)
        console.log(`[SSE] 📤 Request body: ${JSON.stringify({ model: modelConfig.model, messages: conversationMessages.length + ' messages', stream: true, tools: openaiTools.length > 0 ? openaiTools.length + ' tools' : 'none' })}`)

        const requestStartTime = performance.now()
        const response = await fetch(`${apiKey.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resolvedApiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: abortController.signal,
        })

        const responseReceivedTime = performance.now()
        const connectionTime = responseReceivedTime - requestStartTime
        console.log(`[SSE] ✅ Response received in ${connectionTime.toFixed(0)}ms (HTTP ${response.status})`)

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
        let toolCalls: any[] = []
        let firstTokenTime: number | null = null
        let chunkCounter = 0

        console.log('[SSE] 🚀 Starting SSE stream processing...')

        while (true) {
          // Measure time waiting for next chunk from network
          const readStart = performance.now()
          const { done, value } = await reader.read()
          const readEnd = performance.now()
          const readTime = readEnd - readStart

          if (done) {
            console.log('[SSE] ✅ Stream complete, reader done')
            break
          }

          chunkCounter++
          const chunkSize = value?.length || 0

          // Log read timing and chunk size
          if (readTime > 10) {
            console.warn(`[SSE] ⏱️  Chunk #${chunkCounter}: reader.read() took ${readTime.toFixed(0)}ms (slow!) | Size: ${chunkSize} bytes`)
          } else {
            console.log(`[SSE] 📦 Chunk #${chunkCounter}: received in ${readTime.toFixed(0)}ms | Size: ${chunkSize} bytes`)
          }

          const decodeStart = performance.now()
          const chunkText = decoder.decode(value, { stream: true })
          const decodeEnd = performance.now()

          console.log(`[SSE] 🔤 Decoded (${(decodeEnd - decodeStart).toFixed(1)}ms): "${chunkText.substring(0, 80).replace(/\n/g, '\\n')}${chunkText.length > 80 ? '...' : ''}"`)

          buffer += chunkText
          const lines = buffer.split('\n')
          const lineCount = lines.length - 1 // -1 because last element is the incomplete line
          buffer = lines.pop() || ''

          console.log(`[SSE] 📋 Split into ${lineCount} complete lines | Buffer remaining: ${buffer.length} chars ${buffer.length > 0 ? `("${buffer.substring(0, 30)}...")` : ''}`)

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') {
                console.log('[SSE] 🏁 Received [DONE] marker')
                break
              }

              try {
                const parseStart = performance.now()
                const parsed = JSON.parse(data)
                const delta = parsed.choices?.[0]?.delta
                const parseEnd = performance.now()

                // Handle text content
                if (delta?.content) {
                  if (firstTokenTime === null) {
                    firstTokenTime = performance.now()
                    const ttft = firstTokenTime - requestStartTime
                    console.log(`[SSE] 🎯 FIRST TOKEN! TTFT: ${ttft.toFixed(0)}ms`)
                  }

                  const contentLength = delta.content.length
                  console.log(`[SSE] 💬 Delta content (parse: ${(parseEnd - parseStart).toFixed(1)}ms): "${delta.content.substring(0, 50).replace(/\n/g, '\\n')}${delta.content.length > 50 ? '...' : ''}" (${contentLength} chars)`)

                  fullText += delta.content

                  const updateStart = performance.now()
                  store.updateLastMessage(fullText)
                  store.setStreamingText(fullText)
                  const updateEnd = performance.now()
                  const updateTime = updateEnd - updateStart

                  if (updateTime > 5) {
                    console.warn(`[SSE] ⚠️  Store update took ${updateTime.toFixed(1)}ms (slow!)`)
                  } else {
                    console.log(`[SSE] 💾 Store updated in ${updateTime.toFixed(1)}ms | Total text length: ${fullText.length}`)
                  }
                }

                // Handle tool calls
                if (delta?.tool_calls) {
                  for (const toolCallDelta of delta.tool_calls) {
                    const index = toolCallDelta.index

                    if (!toolCalls[index]) {
                      toolCalls[index] = {
                        id: toolCallDelta.id || '',
                        type: 'function',
                        function: {
                          name: toolCallDelta.function?.name || '',
                          arguments: ''
                        }
                      }
                    }

                    if (toolCallDelta.function?.arguments) {
                      toolCalls[index].function.arguments += toolCallDelta.function.arguments
                    }
                  }
                }
              } catch (e) {
                console.warn('[SSE] ❌ Failed to parse SSE line:', line, e)
              }
            }
          }
        }

        // Log final statistics
        const streamEndTime = performance.now()
        const totalStreamTime = streamEndTime - requestStartTime
        const ttft = firstTokenTime ? (firstTokenTime - requestStartTime) : null
        console.log(`[SSE] 📊 Stream Statistics:`)
        console.log(`  • Total chunks received: ${chunkCounter}`)
        console.log(`  • Total characters: ${fullText.length}`)
        console.log(`  • TTFT (Time To First Token): ${ttft ? ttft.toFixed(0) + 'ms' : 'N/A'}`)
        console.log(`  • Total stream time: ${totalStreamTime.toFixed(0)}ms`)
        console.log(`  • Average throughput: ${(fullText.length / (totalStreamTime / 1000)).toFixed(0)} chars/sec`)
        if (buffer.length > 0) {
          console.warn(`[SSE] ⚠️  Incomplete data remaining in buffer: "${buffer.substring(0, 50)}..."`)
        }

        // If no tool calls, we're done
        if (toolCalls.length === 0) {
          break
        }

        // Save tool calls to the last assistant message in store
        if (toolCalls.length > 0) {
          const currentStoreMessages = useChatStore.getState().messages
          if (currentStoreMessages.length > 0 && currentStoreMessages[currentStoreMessages.length - 1].role === 'assistant') {
            const lastMessage = currentStoreMessages[currentStoreMessages.length - 1]
            const updatedMessage = {
              ...lastMessage,
              tool_call_requests: toolCalls.map(tc => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                  name: tc.function.name,
                  arguments: tc.function.arguments
                }
              }))
            }
            // Update the last message with tool_call_requests
            const newMessages = [...currentStoreMessages]
            newMessages[newMessages.length - 1] = updatedMessage
            store.loadMessages(newMessages)
          }
        }

        // Execute tool calls
        // Add assistant message with tool calls to conversation
        conversationMessages.push({
          role: 'assistant',
          content: fullText || '',
          tool_calls: toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments
            }
          }))
        } as any)

        // Execute each tool call
        const toolResults = []
        for (const toolCall of toolCalls) {
          const startTime = performance.now()

          try {
            const [serverId, ...toolNameParts] = toolCall.function.name.split('__')
            const toolName = toolNameParts.join('__')

            let args: any = {}
            try {
              args = JSON.parse(toolCall.function.arguments)
            } catch (e) {
              console.error('[useStreamingChat] Failed to parse tool arguments:', e)
              throw new Error('Invalid tool arguments')
            }

            // Add tool call to store
            store.addToolCall({
              id: toolCall.id,
              toolName: toolCall.function.name,
              args,
              startTime,
            })

            // Call the tool
            const result = await mcpManager.callTool(serverId, toolName, args)
            const endTime = performance.now()

            // Update tool call with result
            store.updateToolCall(toolCall.id, result, endTime)

            toolResults.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: typeof result === 'string' ? result : JSON.stringify(result)
            } as any)
          } catch (error) {
            const endTime = performance.now()
            console.error('[useStreamingChat] Tool call error:', error)
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'

            store.updateToolCall(toolCall.id, { error: errorMessage }, endTime)

            toolResults.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: errorMessage })
            } as any)
          }
        }

        // Add tool results to conversation
        conversationMessages.push(...toolResults as any)

        // Save tool result messages to store
        for (const toolResult of toolResults) {
          store.addMessage({
            role: 'tool',
            content: toolResult.content,
            tool_call_id: toolResult.tool_call_id
          })
        }

        // Add new assistant message for next turn (so updateLastMessage doesn't overwrite tool messages)
        store.addMessage({
          role: 'assistant',
          content: '',
          isStreaming: true,
        })
      }

      if (turnCount >= MAX_TURNS) {
        console.warn('[useStreamingChat] Max turns reached')
        const currentContent = store.messages[store.messages.length - 1]?.content || ''
        store.updateLastMessage(currentContent + '\n\n_[Max conversation turns reached. Please start a new message if you need more assistance.]_')
      }

      store.finishGeneration()
    } catch (error) {
      console.error('[useStreamingChat] Error:', error)

      // Format error for display
      let errorMessage = '❌ Error'
      let errorDetails = ''

      if (error instanceof Error) {
        const errorMsg = error.message

        if (errorMsg.includes('abort')) {
          errorMessage = '🛑 Generation Stopped'
          errorDetails = '\n\nGeneration was stopped by user.'
        } else {
          const httpMatch = errorMsg.match(/HTTP (\d+): (.+)/)
          if (httpMatch) {
            const statusCode = httpMatch[1]
            const jsonPart = httpMatch[2]

            try {
              const errorData = JSON.parse(jsonPart)
              if (errorData.error) {
                const { message, type, code } = errorData.error

                if (statusCode === '429') {
                  errorMessage = '⚠️ API Quota Exceeded'
                  errorDetails = `\n\n**Error:** ${message}\n\n**Type:** ${type}\n**Code:** ${code}\n\nPlease check your API plan.`
                } else if (statusCode === '401') {
                  errorMessage = '🔒 Authentication Failed'
                  errorDetails = `\n\n**Error:** ${message}\n\nPlease verify your API key in Settings.`
                } else if (statusCode === '404') {
                  errorMessage = '❌ Endpoint Not Found'
                  errorDetails = `\n\n**Error:** ${message}\n\nPlease check your model configuration.`
                } else {
                  errorMessage = `⚠️ API Error (HTTP ${statusCode})`
                  errorDetails = `\n\n**Error:** ${message}`
                }
              }
            } catch {
              errorMessage = `⚠️ API Error (HTTP ${statusCode})`
              errorDetails = `\n\n**Error:** ${errorMsg}`
            }
          } else {
            errorMessage = '❌ Connection Error'
            errorDetails = `\n\n**Error:** ${errorMsg}\n\nPlease check your network connection.`
          }
        }
      }

      store.updateLastMessage(`${errorMessage}${errorDetails}`)
      store.finishGeneration()
    }
  }, [modelConfig, openaiTools, store])

  const stopGeneration = useCallback(() => {
    store.stopGeneration()
  }, [store])

  const clearChat = useCallback(() => {
    store.clearMessages()
  }, [store])

  return {
    messages: store.messages,
    isGenerating: store.isGenerating,
    pendingAttachments: store.pendingAttachments,
    sendMessage,
    stopGeneration,
    clearChat,
    addAttachment: store.addAttachment,
    removeAttachment: store.removeAttachment,
  }
}
