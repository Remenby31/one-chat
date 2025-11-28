import { create } from 'zustand'

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

// Streaming phases for fine-grained UI feedback
export type StreamingPhase =
  | 'idle'           // Not streaming
  | 'text'           // Streaming text content
  | 'tool_parsing'   // Parsing tool call (name + arguments)
  | 'tool_executing' // Executing tool
  | 'complete'       // Done

// Tool call status during streaming
export type ToolCallStatus = 'streaming' | 'ready' | 'executing' | 'complete' | 'error'

export interface MessageAttachment {
  id: string
  name: string
  type: string
  size: number
  data: string // base64 or URL
}

export interface ToolCall {
  id: string
  toolName: string
  args: Record<string, any>
  result?: any
  startTime?: number
  endTime?: number
  duration?: number
  status?: ToolCallStatus // For streaming state tracking
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  attachments?: MessageAttachment[]
  toolCalls?: ToolCall[]
  timestamp: number
  isStreaming?: boolean
  streamingPhase?: StreamingPhase // Current streaming phase
  // For tool messages
  tool_call_id?: string
  // For assistant messages with tool calls
  tool_call_requests?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
}

interface ChatState {
  // State
  messages: ChatMessage[]
  isGenerating: boolean
  currentStreamingText: string
  pendingAttachments: MessageAttachment[]
  abortController: AbortController | null

  // Actions
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => string // Returns message ID
  updateLastMessage: (content: string) => void
  updateMessageById: (id: string, updates: Partial<ChatMessage>) => boolean // Returns success
  setStreamingText: (text: string) => void
  startGeneration: () => void
  stopGeneration: () => void
  finishGeneration: () => void
  addAttachment: (attachment: MessageAttachment) => void
  removeAttachment: (id: string) => void
  clearAttachments: () => void
  addToolCall: (toolCall: ToolCall) => void
  updateToolCall: (id: string, result: any, endTime: number) => void
  setAbortController: (controller: AbortController | null) => void
  clearMessages: () => void
  loadMessages: (messages: ChatMessage[]) => void
  // New streaming actions
  updateStreamingPhase: (messageId: string, phase: StreamingPhase) => void
  updateStreamingToolCalls: (messageId: string, toolCalls: ToolCall[]) => void
  setToolCallStatus: (messageId: string, toolCallId: string, status: ToolCallStatus) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  messages: [],
  isGenerating: false,
  currentStreamingText: '',
  pendingAttachments: [],
  abortController: null,

  // Add a new message (returns the message ID)
  addMessage: (message) => {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const newMessage: ChatMessage = {
      ...message,
      id: messageId,
      timestamp: Date.now(),
    }
    set((state) => ({
      messages: [...state.messages, newMessage],
    }))
    return messageId
  },

  // Update the last message (for streaming)
  updateLastMessage: (content) => {
    set((state) => {
      const messages = [...state.messages]
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1]
        messages[messages.length - 1] = {
          ...lastMessage,
          content,
        }
      }
      return { messages }
    })
  },

  // Update a specific message by ID (returns true if found and updated)
  updateMessageById: (id, updates) => {
    const { messages } = get()
    const index = messages.findIndex(m => m.id === id)

    if (index === -1) {
      console.warn(`[chatStore] Message with ID ${id} not found for update`)
      return false
    }

    set((state) => {
      const newMessages = [...state.messages]
      newMessages[index] = {
        ...newMessages[index],
        ...updates,
      }
      return { messages: newMessages }
    })
    return true
  },

  // Set streaming text
  setStreamingText: (text) => {
    set({ currentStreamingText: text })
  },

  // Start generation
  startGeneration: () => {
    set({ isGenerating: true, currentStreamingText: '' })
  },

  // Stop generation (user cancellation)
  stopGeneration: () => {
    const { abortController } = get()
    if (abortController) {
      abortController.abort()
    }
    set({ isGenerating: false, currentStreamingText: '', abortController: null })
  },

  // Finish generation (normal completion)
  finishGeneration: () => {
    // Remove isStreaming flag from last message
    set((state) => {
      const messages = [...state.messages]
      if (messages.length > 0 && messages[messages.length - 1].isStreaming) {
        const lastMessage = messages[messages.length - 1]
        messages[messages.length - 1] = {
          ...lastMessage,
          isStreaming: false
        }
      }
      return { messages, isGenerating: false, currentStreamingText: '', abortController: null }
    })
  },

  // Add attachment
  addAttachment: (attachment) => {
    set((state) => ({
      pendingAttachments: [...state.pendingAttachments, attachment],
    }))
  },

  // Remove attachment
  removeAttachment: (id) => {
    set((state) => ({
      pendingAttachments: state.pendingAttachments.filter((a) => a.id !== id),
    }))
  },

  // Clear attachments
  clearAttachments: () => {
    set({ pendingAttachments: [] })
  },

  // Add tool call to last assistant message
  addToolCall: (toolCall) => {
    set((state) => {
      const messages = [...state.messages]
      if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
        const lastMessage = messages[messages.length - 1]
        messages[messages.length - 1] = {
          ...lastMessage,
          toolCalls: [...(lastMessage.toolCalls || []), toolCall],
        }
      }
      return { messages }
    })
  },

  // Update tool call result
  updateToolCall: (id, result, endTime) => {
    set((state) => {
      const messages = [...state.messages]
      if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
        const lastMessage = messages[messages.length - 1]
        const toolCalls = lastMessage.toolCalls?.map((tc) =>
          tc.id === id
            ? {
                ...tc,
                result,
                endTime,
                duration: tc.startTime ? endTime - tc.startTime : undefined,
              }
            : tc
        )
        messages[messages.length - 1] = {
          ...lastMessage,
          toolCalls,
        }
      }
      return { messages }
    })
  },

  // Set abort controller
  setAbortController: (controller) => {
    set({ abortController: controller })
  },

  // Clear all messages
  clearMessages: () => {
    set({ messages: [], currentStreamingText: '' })
  },

  // Load messages (from thread)
  loadMessages: (messages: ChatMessage[]) => {
    set({ messages, currentStreamingText: '' })
  },

  // Update streaming phase for a message
  updateStreamingPhase: (messageId, phase) => {
    set((state) => {
      const index = state.messages.findIndex(m => m.id === messageId)
      if (index === -1) return state

      const newMessages = [...state.messages]
      newMessages[index] = {
        ...newMessages[index],
        streamingPhase: phase,
      }
      return { messages: newMessages }
    })
  },

  // Update tool calls during streaming (real-time updates)
  updateStreamingToolCalls: (messageId, toolCalls) => {
    set((state) => {
      const index = state.messages.findIndex(m => m.id === messageId)
      if (index === -1) return state

      const newMessages = [...state.messages]
      newMessages[index] = {
        ...newMessages[index],
        toolCalls,
        streamingPhase: 'tool_parsing',
      }
      return { messages: newMessages }
    })
  },

  // Set status for a specific tool call
  setToolCallStatus: (messageId, toolCallId, status) => {
    set((state) => {
      const index = state.messages.findIndex(m => m.id === messageId)
      if (index === -1) return state

      const message = state.messages[index]
      if (!message.toolCalls) return state

      const newToolCalls = message.toolCalls.map(tc =>
        tc.id === toolCallId ? { ...tc, status } : tc
      )

      const newMessages = [...state.messages]
      newMessages[index] = {
        ...newMessages[index],
        toolCalls: newToolCalls,
        streamingPhase: status === 'executing' ? 'tool_executing' : message.streamingPhase,
      }
      return { messages: newMessages }
    })
  },
}))
