import { create } from 'zustand'
import { generateConversationTitle } from './titleGenerator'
import type { ChatMessage } from './chatStore'

export interface ThreadMetadata {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
  systemPrompt?: string
}

interface Thread {
  metadata: ThreadMetadata
  messages: ChatMessage[]
  systemPrompt?: string
}

interface ThreadState {
  // State
  currentThreadId: string | null
  threads: ThreadMetadata[]
  isLoading: boolean
  currentSystemPrompt: string | null

  // Actions
  loadThreads: () => Promise<void>
  createThread: (systemPrompt?: string) => Promise<string>
  switchThread: (threadId: string) => Promise<{ messages: ChatMessage[]; systemPrompt?: string }>
  deleteThread: (threadId: string) => Promise<void>
  saveThreadMessages: (threadId: string, messages: ChatMessage[], systemPrompt?: string) => Promise<void>
  updateThreadTitle: (threadId: string, messages: ChatMessage[]) => Promise<void>
  setCurrentThreadId: (threadId: string | null) => void
  setCurrentSystemPrompt: (systemPrompt: string | null) => void
}

/**
 * Generate a safe filename from title and timestamp
 */
function generateThreadFileName(threadId: string, title: string): string {
  // Create slug from title (safe for filenames)
  const slug = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove duplicate hyphens
    .substring(0, 50) // Limit length
    .replace(/-$/, '') // Remove trailing hyphen

  return `thread_${threadId}_${slug}.json`
}

/**
 * Extract metadata from filename
 */
function parseThreadFileName(filename: string): { id: string; title: string } | null {
  const match = filename.match(/^thread_([^_]+)_(.+)\.json$/)
  if (!match) return null

  const id = match[1]
  const slug = match[2]

  // Convert slug back to title (approximate)
  const title = slug
    .replace(/-/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

  return { id, title }
}

export const useThreadStore = create<ThreadState>((set, get) => ({
  // Initial state
  currentThreadId: null,
  threads: [],
  isLoading: false,
  currentSystemPrompt: null,

  /**
   * Load all threads from storage
   */
  loadThreads: async () => {
    set({ isLoading: true })

    try {
      let threadFiles: string[] = []

      if (window.electronAPI) {
        // Use Electron IPC to list conversation files
        threadFiles = await window.electronAPI.invoke('thread:list')
      } else {
        // Fallback: List from localStorage keys
        const keys = Object.keys(localStorage)
        threadFiles = keys.filter(k => k.startsWith('thread_') && k.endsWith('.json'))
      }

      // Load metadata for each thread
      const threads: ThreadMetadata[] = []

      for (const filename of threadFiles) {
        try {
          let threadData: Thread | null = null

          if (window.electronAPI) {
            threadData = await window.electronAPI.readConfig(`conversations/${filename}`)
          } else {
            const stored = localStorage.getItem(filename)
            threadData = stored ? JSON.parse(stored) : null
          }

          if (threadData && threadData.metadata) {
            threads.push(threadData.metadata)
          } else {
            // Try to parse from filename if metadata missing
            const parsed = parseThreadFileName(filename)
            if (parsed) {
              threads.push({
                id: parsed.id,
                title: parsed.title,
                createdAt: parseInt(parsed.id),
                updatedAt: parseInt(parsed.id),
                messageCount: threadData?.messages?.length || 0
              })
            }
          }
        } catch (error) {
          console.error(`[ThreadStore] Failed to load thread ${filename}:`, error)
        }
      }

      // Sort by updatedAt (most recent first)
      threads.sort((a, b) => b.updatedAt - a.updatedAt)

      set({ threads, isLoading: false })
    } catch (error) {
      console.error('[ThreadStore] Failed to load threads:', error)
      set({ isLoading: false })
    }
  },

  /**
   * Create a new thread
   */
  createThread: async (systemPrompt?: string) => {
    const threadId = Date.now().toString()
    const newThread: Thread = {
      metadata: {
        id: threadId,
        title: 'New conversation',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0,
        systemPrompt
      },
      messages: [],
      systemPrompt
    }

    // Save empty thread
    const filename = generateThreadFileName(threadId, 'New conversation')

    if (window.electronAPI) {
      await window.electronAPI.writeConfig(`conversations/${filename}`, newThread)
    } else {
      localStorage.setItem(filename, JSON.stringify(newThread))
    }

    // Add to list and set as current
    set((state) => ({
      threads: [newThread.metadata, ...state.threads],
      currentThreadId: threadId,
      currentSystemPrompt: systemPrompt || null
    }))

    // Save current thread ID
    if (window.electronAPI) {
      await window.electronAPI.writeConfig('currentThread.json', threadId)
    } else {
      localStorage.setItem('currentThread', threadId)
    }

    return threadId
  },

  /**
   * Switch to a different thread
   */
  switchThread: async (threadId: string) => {
    try {
      // Find thread metadata
      const thread = get().threads.find(t => t.id === threadId)
      if (!thread) {
        console.error(`[ThreadStore] Thread ${threadId} not found`)
        return { messages: [] }
      }

      // Load thread data
      const filename = generateThreadFileName(threadId, thread.title)
      let threadData: Thread | null = null

      if (window.electronAPI) {
        threadData = await window.electronAPI.readConfig(`conversations/${filename}`)
      } else {
        const stored = localStorage.getItem(filename)
        threadData = stored ? JSON.parse(stored) : null
      }

      if (!threadData) {
        console.error(`[ThreadStore] Failed to load thread data for ${threadId}`)
        return { messages: [] }
      }

      // Set as current thread
      set({
        currentThreadId: threadId,
        currentSystemPrompt: threadData.systemPrompt || null
      })

      // Save current thread ID
      if (window.electronAPI) {
        await window.electronAPI.writeConfig('currentThread.json', threadId)
      } else {
        localStorage.setItem('currentThread', threadId)
      }

      return {
        messages: threadData.messages,
        systemPrompt: threadData.systemPrompt
      }
    } catch (error) {
      console.error(`[ThreadStore] Failed to switch thread ${threadId}:`, error)
      return { messages: [] }
    }
  },

  /**
   * Delete a thread
   */
  deleteThread: async (threadId: string) => {
    try {
      // Find thread
      const thread = get().threads.find(t => t.id === threadId)
      if (!thread) {
        console.error(`[ThreadStore] Thread ${threadId} not found`)
        return
      }

      const filename = generateThreadFileName(threadId, thread.title)

      // Delete file
      if (window.electronAPI) {
        await window.electronAPI.invoke('thread:delete', filename)
      } else {
        localStorage.removeItem(filename)
      }

      // Remove from list
      set((state) => ({
        threads: state.threads.filter(t => t.id !== threadId),
        currentThreadId: state.currentThreadId === threadId ? null : state.currentThreadId
      }))
    } catch (error) {
      console.error(`[ThreadStore] Failed to delete thread ${threadId}:`, error)
    }
  },

  /**
   * Save thread messages
   */
  saveThreadMessages: async (threadId: string, messages: ChatMessage[], systemPrompt?: string) => {
    try {
      const thread = get().threads.find(t => t.id === threadId)
      if (!thread) {
        console.error(`[ThreadStore] Thread ${threadId} not found for save`)
        return
      }

      // Update metadata
      const updatedMetadata: ThreadMetadata = {
        ...thread,
        updatedAt: Date.now(),
        messageCount: messages.length,
        systemPrompt
      }

      const threadData: Thread = {
        metadata: updatedMetadata,
        messages,
        systemPrompt
      }

      // Save to storage
      const filename = generateThreadFileName(threadId, thread.title)

      if (window.electronAPI) {
        await window.electronAPI.writeConfig(`conversations/${filename}`, threadData)
      } else {
        localStorage.setItem(filename, JSON.stringify(threadData))
      }

      // Update in state
      set((state) => ({
        threads: state.threads.map(t => t.id === threadId ? updatedMetadata : t)
      }))
    } catch (error) {
      console.error(`[ThreadStore] Failed to save thread ${threadId}:`, error)
    }
  },

  /**
   * Update thread title based on messages
   */
  updateThreadTitle: async (threadId: string, messages: ChatMessage[]) => {
    try {
      const thread = get().threads.find(t => t.id === threadId)
      if (!thread) {
        console.error(`[ThreadStore] Thread ${threadId} not found for title update`)
        return
      }

      // Don't update if already has custom title
      if (thread.title !== 'New conversation' && thread.messageCount > 0) {
        return
      }

      // Generate title from messages
      // Convert ChatMessage to ThreadMessage format for titleGenerator
      const threadMessages = messages.map(msg => ({
        role: msg.role,
        content: [{ type: 'text' as const, text: msg.content }],
        id: msg.id,
        createdAt: new Date(msg.timestamp),
        metadata: {}
      }))

      const newTitle = generateConversationTitle(threadMessages)

      if (newTitle === 'New conversation' || newTitle === thread.title) {
        return // No change
      }

      // Rename file
      const oldFilename = generateThreadFileName(threadId, thread.title)
      const newFilename = generateThreadFileName(threadId, newTitle)

      // Load current data
      let threadData: Thread | null = null

      if (window.electronAPI) {
        threadData = await window.electronAPI.readConfig(`conversations/${oldFilename}`)

        // Save with new filename
        if (threadData) {
          threadData.metadata.title = newTitle
          await window.electronAPI.writeConfig(`conversations/${newFilename}`, threadData)

          // Delete old file
          await window.electronAPI.invoke('thread:delete', oldFilename)
        }
      } else {
        const stored = localStorage.getItem(oldFilename)
        threadData = stored ? JSON.parse(stored) : null

        if (threadData) {
          threadData.metadata.title = newTitle
          localStorage.setItem(newFilename, JSON.stringify(threadData))
          localStorage.removeItem(oldFilename)
        }
      }

      // Update in state
      set((state) => ({
        threads: state.threads.map(t =>
          t.id === threadId
            ? { ...t, title: newTitle, updatedAt: Date.now() }
            : t
        )
      }))
    } catch (error) {
      console.error(`[ThreadStore] Failed to update thread title ${threadId}:`, error)
    }
  },

  /**
   * Set current thread ID
   */
  setCurrentThreadId: (threadId: string | null) => {
    set({ currentThreadId: threadId })
  },

  /**
   * Set current system prompt
   */
  setCurrentSystemPrompt: (systemPrompt: string | null) => {
    set({ currentSystemPrompt: systemPrompt })
  }
}))
