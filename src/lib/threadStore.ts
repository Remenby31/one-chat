import { create } from 'zustand'
import { generateConversationTitle } from './titleGenerator'
import type { ChatMessage } from './chatStore'
import { useBranchStore } from './branchStore'
import { migrateThreadToV2 } from './branchUtils'
import type { BranchedThread, LegacyThread } from '@/types/branching'

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
  // Branching support (v2)
  activeBranches?: Record<string, number>
  version?: 2
}

interface ThreadState {
  // State
  currentThreadId: string | null
  threads: ThreadMetadata[]
  isLoading: boolean
  currentSystemPrompt: string | null
  draftThreads: Map<string, Thread>  // Draft threads (in-memory, not persisted to disk)

  // Actions
  loadThreads: () => Promise<void>
  createThread: (systemPrompt?: string) => Promise<string>
  switchThread: (threadId: string) => Promise<{ messages: ChatMessage[]; systemPrompt?: string }>
  deleteThread: (threadId: string) => Promise<void>
  saveThreadMessages: (threadId: string, messages: ChatMessage[], systemPrompt?: string) => Promise<void>
  updateThreadTitle: (threadId: string, messages: ChatMessage[]) => Promise<void>
  setCurrentThreadId: (threadId: string | null) => void
  setCurrentSystemPrompt: (systemPrompt: string | null) => void
  isDraftThread: (threadId: string) => boolean  // Helper to check if thread is a draft
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
  draftThreads: new Map(),  // In-memory draft threads

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

      // Preserve draft threads (they exist in memory but not on disk yet)
      const currentDrafts = get().draftThreads
      const draftMetadatas = Array.from(currentDrafts.values()).map(d => d.metadata)

      // Merge drafts with loaded threads (drafts first, then dedupe by ID)
      const existingIds = new Set(threads.map(t => t.id))
      const draftsToAdd = draftMetadatas.filter(d => !existingIds.has(d.id))
      const allThreads = [...draftsToAdd, ...threads]

      set({ threads: allThreads, isLoading: false })
    } catch (error) {
      console.error('[ThreadStore] Failed to load threads:', error)
      set({ isLoading: false })
    }
  },

  /**
   * Create a new thread (draft - not persisted to disk yet)
   * Thread will be persisted when first message is saved via saveThreadMessages()
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

    // Add to draft threads (in-memory only, NOT saved to disk)
    set((state) => {
      const newDrafts = new Map(state.draftThreads)
      newDrafts.set(threadId, newThread)

      return {
        threads: [newThread.metadata, ...state.threads],
        draftThreads: newDrafts,
        currentThreadId: threadId,
        currentSystemPrompt: systemPrompt || null
      }
    })

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

      // Check if it's a draft thread first
      const draftThread = get().draftThreads.get(threadId)
      if (draftThread) {
        // Load from draft (in-memory)
        set({
          currentThreadId: threadId,
          currentSystemPrompt: draftThread.systemPrompt || null
        })

        // Clear branches for new draft thread
        useBranchStore.getState().clearBranches()

        return {
          messages: draftThread.messages,
          systemPrompt: draftThread.systemPrompt
        }
      }

      // Load thread data from disk
      const filename = generateThreadFileName(threadId, thread.title)
      let threadData: Thread | LegacyThread | BranchedThread | null = null

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

      // Migrate to v2 if needed (handles branching)
      const migratedData = migrateThreadToV2(threadData as LegacyThread | BranchedThread)

      // Load branches into branch store
      useBranchStore.getState().loadBranches(migratedData.activeBranches)

      // Set as current thread
      set({
        currentThreadId: threadId,
        currentSystemPrompt: migratedData.systemPrompt || null
      })

      return {
        messages: migratedData.messages,
        systemPrompt: migratedData.systemPrompt
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
   * If thread is a draft (not yet persisted), it will be persisted on first save
   */
  saveThreadMessages: async (threadId: string, messages: ChatMessage[], systemPrompt?: string) => {
    try {
      let thread = get().threads.find(t => t.id === threadId)

      // Check if this is a draft thread
      const isDraft = get().draftThreads.has(threadId)

      // If thread not found in threads list, try to get from drafts (race condition recovery)
      if (!thread && isDraft) {
        const draftThread = get().draftThreads.get(threadId)
        if (draftThread) {
          thread = draftThread.metadata
          // Re-add to threads list
          set((state) => ({
            threads: [draftThread.metadata, ...state.threads.filter(t => t.id !== threadId)]
          }))
        }
      }

      if (!thread) {
        console.error(`[ThreadStore] Thread ${threadId} not found for save (not in threads or drafts)`)
        return
      }

      // Update metadata
      const updatedMetadata: ThreadMetadata = {
        ...thread,
        updatedAt: Date.now(),
        messageCount: messages.length,
        systemPrompt
      }

      // Get current branch state
      const activeBranches = useBranchStore.getState().activeBranches

      const threadData: Thread = {
        metadata: updatedMetadata,
        messages,
        systemPrompt,
        activeBranches,
        version: 2
      }

      // Save to storage
      const filename = generateThreadFileName(threadId, thread.title)

      if (window.electronAPI) {
        await window.electronAPI.writeConfig(`conversations/${filename}`, threadData)
      } else {
        localStorage.setItem(filename, JSON.stringify(threadData))
      }

      // If this was a draft, remove it from draft map (now persisted)
      if (isDraft) {
        set((state) => {
          const newDrafts = new Map(state.draftThreads)
          newDrafts.delete(threadId)
          return { draftThreads: newDrafts }
        })
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
      let thread = get().threads.find(t => t.id === threadId)

      // If thread not found, try to recover from drafts
      if (!thread) {
        const draftThread = get().draftThreads.get(threadId)
        if (draftThread) {
          thread = draftThread.metadata
        }
      }

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
        content: msg.content,
        id: msg.id,
        timestamp: msg.timestamp,
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
  },

  /**
   * Check if a thread is a draft (not yet persisted to disk)
   */
  isDraftThread: (threadId: string) => {
    return get().draftThreads.has(threadId)
  }
}))
