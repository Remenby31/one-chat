import { useEffect, useState, useMemo, useCallback } from 'react'
import { useChatStore, type ToolCall } from '@/lib/chatStore'
import { useThreadStore } from '@/lib/threadStore'
import type { ModelConfig } from '@/types/model'
import type { ApiKey } from '@/types/apiKey'
import type { MCPServer, MCPTool } from '@/types/mcp'
import { mcpManager } from '@/lib/mcpManager'
import { getInjectedMessages } from '@/lib/mcpPromptInjection'
import { prepareMessagesForAPI, type APIMessage } from '@/lib/messageValidation'

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
      s => s.enabled && s.state === 'connected'
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

    // Track the current assistant message ID for updates
    let currentAssistantMessageId: string | null = null

    try {
      // Get current state synchronously (Zustand updates are async, so we need getState())
      const currentMessages = useChatStore.getState().messages

      // Fetch and inject conventional prompts from MCP servers
      let injectedMessages: APIMessage[] = []
      try {
        injectedMessages = await getInjectedMessages(mcpServers) as APIMessage[]
      } catch (error) {
        console.warn('[useStreamingChat] Failed to fetch conventional prompts:', error)
      }

      // Add system prompt if available (merge with injected system prompts)
      const systemPrompt = threadStore.currentSystemPrompt

      // If we have both injected system prompts and thread system prompt, concatenate them
      if (systemPrompt && injectedMessages.length > 0 && injectedMessages[0].role === 'system') {
        injectedMessages[0].content += `\n\n---\n\n[Thread System Prompt]\n${systemPrompt}`
      } else if (systemPrompt) {
        // No injected system prompt, just add thread system prompt
        injectedMessages.unshift({ role: 'system' as const, content: systemPrompt })
      }

      // Prepare messages for API using the validation function
      // This handles filtering, mapping, and validates tool chains
      const userConversationMessages = prepareMessagesForAPI(currentMessages)

      // Build final conversation: injected prompts + user conversation
      let conversationMessages: APIMessage[] = [
        ...injectedMessages,
        ...userConversationMessages
      ]

      // Multi-turn loop to handle tool calls (unlimited)
      let turnCount = 0

      while (true) {
        turnCount++

        // At the start of each turn, get the current assistant message ID
        // (created at line 148 for turn 1, or at the end of previous turn for turns 2+)
        const storeMessages = useChatStore.getState().messages
        const lastMessage = storeMessages[storeMessages.length - 1]
        if (lastMessage?.role === 'assistant' && lastMessage.isStreaming) {
          currentAssistantMessageId = lastMessage.id
        }

        const requestBody: any = {
          model: modelConfig.model,
          messages: conversationMessages,
          stream: true,
        }

        // Add tools if available
        if (openaiTools.length > 0) {
          requestBody.tools = openaiTools
        }

        // Log raw JSON request for debugging
        console.log(`📤 API Request #${turnCount}`, {
          model: requestBody.model,
          messageCount: requestBody.messages.length,
          toolCount: requestBody.tools?.length || 0,
          stream: requestBody.stream,
        })
        console.log('📋 Raw JSON Messages:', JSON.stringify(requestBody, null, 2))

        const response = await fetch(`${apiKey.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resolvedApiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: abortController.signal,
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
        let toolCalls: any[] = []
        let streamingToolCalls: ToolCall[] = [] // For real-time UI updates
        let firstTokenTime: number | null = null
        let chunkCounter = 0

        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            break
          }

          chunkCounter++

          const chunkText = decoder.decode(value, { stream: true })

          buffer += chunkText
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') {
                break
              }

              try {
                const parsed = JSON.parse(data)
                const delta = parsed.choices?.[0]?.delta

                // Handle text content
                if (delta?.content) {
                  if (firstTokenTime === null) {
                    firstTokenTime = performance.now()
                    // Set streaming phase to text on first token
                    if (currentAssistantMessageId) {
                      store.updateStreamingPhase(currentAssistantMessageId, 'text')
                    }
                  }

                  fullText += delta.content

                  store.updateLastMessage(fullText)
                  store.setStreamingText(fullText)
                }

                // Handle tool calls - with real-time UI updates
                if (delta?.tool_calls) {
                  for (const toolCallDelta of delta.tool_calls) {
                    const index = toolCallDelta.index

                    // Initialize tool call if new
                    if (!toolCalls[index]) {
                      toolCalls[index] = {
                        id: toolCallDelta.id || `tc_${Date.now()}_${index}`,
                        type: 'function',
                        function: {
                          name: toolCallDelta.function?.name || '',
                          arguments: ''
                        }
                      }
                      // Initialize streaming tool call for UI
                      streamingToolCalls[index] = {
                        id: toolCalls[index].id,
                        toolName: toolCallDelta.function?.name || '',
                        args: {},
                        status: 'streaming'
                      }
                    }

                    // Update name if received
                    if (toolCallDelta.function?.name) {
                      toolCalls[index].function.name = toolCallDelta.function.name
                      streamingToolCalls[index].toolName = toolCallDelta.function.name
                    }

                    // Accumulate arguments
                    if (toolCallDelta.function?.arguments) {
                      toolCalls[index].function.arguments += toolCallDelta.function.arguments
                      // Try to parse partial args for preview (may fail, that's ok)
                      try {
                        streamingToolCalls[index].args = JSON.parse(toolCalls[index].function.arguments)
                      } catch {
                        // Keep previous args if parsing fails (incomplete JSON)
                      }
                    }
                  }

                  // Update UI with streaming tool calls in real-time
                  if (currentAssistantMessageId && streamingToolCalls.length > 0) {
                    store.updateStreamingToolCalls(currentAssistantMessageId, [...streamingToolCalls])
                  }
                }
              } catch (e) {
                // Silently skip unparseable lines
              }
            }
          }
        }

        // If no tool calls, we're done
        if (toolCalls.length === 0) {
          break
        }

        // Format tool_call_requests for storage
        const formattedToolCalls = toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments
          }
        }))

        // Update the assistant message with tool_call_requests using ID tracking (robust)
        if (currentAssistantMessageId) {
          const updated = store.updateMessageById(currentAssistantMessageId, {
            content: fullText || '',
            tool_call_requests: formattedToolCalls,
            isStreaming: false
          })

          if (!updated) {
            console.error('[useStreamingChat] Failed to update assistant message with tool_calls, ID:', currentAssistantMessageId)
          }
        } else {
          console.error('[useStreamingChat] No assistant message ID tracked, cannot update with tool_calls')
        }

        // Add assistant message with tool_calls to conversation for API (next turn)
        const assistantMessageForAPI: APIMessage = {
          role: 'assistant',
          content: fullText || '',
          tool_calls: formattedToolCalls
        }
        conversationMessages.push(assistantMessageForAPI)

        // Mark all tool calls as ready for execution
        if (currentAssistantMessageId) {
          streamingToolCalls.forEach(tc => {
            store.setToolCallStatus(currentAssistantMessageId!, tc.id, 'ready')
          })
        }

        // Execute each tool call
        const toolResults: APIMessage[] = []
        for (let i = 0; i < toolCalls.length; i++) {
          const toolCall = toolCalls[i]
          const startTime = performance.now()

          // Mark as executing and update with startTime
          if (currentAssistantMessageId) {
            const currentMessages = useChatStore.getState().messages
            const messageIndex = currentMessages.findIndex(m => m.id === currentAssistantMessageId)

            if (messageIndex !== -1) {
              const message = currentMessages[messageIndex]
              if (message.toolCalls) {
                const updatedToolCalls = message.toolCalls.map(tc =>
                  tc.id === toolCall.id ? { ...tc, startTime, status: 'executing' as const } : tc
                )
                store.updateMessageById(currentAssistantMessageId, {
                  toolCalls: updatedToolCalls,
                  streamingPhase: 'tool_executing'
                })
              }
            }
          }

          try {
            const [serverId, ...toolNameParts] = toolCall.function.name.split('__')
            const toolName = toolNameParts.join('__')

            let args: Record<string, unknown> = {}
            try {
              args = JSON.parse(toolCall.function.arguments)
            } catch (e) {
              console.error('[useStreamingChat] Failed to parse tool arguments:', e)
              throw new Error('Invalid tool arguments')
            }

            // Call the tool (tool call already added via updateStreamingToolCalls during streaming)
            const result = await mcpManager.callTool(serverId, toolName, args)
            const endTime = performance.now()

            // Update tool call with result
            store.updateToolCall(toolCall.id, result, endTime)

            // Mark as complete
            if (currentAssistantMessageId) {
              store.setToolCallStatus(currentAssistantMessageId, toolCall.id, 'complete')
            }

            toolResults.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: typeof result === 'string' ? result : JSON.stringify(result)
            })
          } catch (error) {
            const endTime = performance.now()
            console.error('[useStreamingChat] Tool call error:', error)
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'

            store.updateToolCall(toolCall.id, { error: errorMessage }, endTime)

            // Mark as error
            if (currentAssistantMessageId) {
              store.setToolCallStatus(currentAssistantMessageId, toolCall.id, 'error')
            }

            toolResults.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: errorMessage })
            })
          }
        }

        // Add tool results to conversation for API
        conversationMessages.push(...toolResults)

        // Add tool result messages to store (maintains proper order after assistant message)
        for (const toolResult of toolResults) {
          store.addMessage({
            role: 'tool',
            content: toolResult.content || '',
            tool_call_id: toolResult.tool_call_id
          })
        }

        // Create new assistant message for next turn
        // The ID will be tracked at the start of the next iteration
        store.addMessage({
          role: 'assistant',
          content: '',
          isStreaming: true,
        })
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
