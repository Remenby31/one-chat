import { create } from 'zustand'

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

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
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  attachments?: MessageAttachment[]
  toolCalls?: ToolCall[]
  timestamp: number
  isStreaming?: boolean
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
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  updateLastMessage: (content: string) => void
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
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  messages: [],
  isGenerating: false,
  currentStreamingText: '',
  pendingAttachments: [],
  abortController: null,

  // Add a new message
  addMessage: (message) => {
    const newMessage: ChatMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    }
    set((state) => ({
      messages: [...state.messages, newMessage],
    }))
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
}))
