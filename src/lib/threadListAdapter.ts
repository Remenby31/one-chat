/**
 * Thread List Adapter
 * Manages multiple conversation threads with persistence
 */

import type { ChatMessage } from "./chatStore"
import { generateConversationTitle } from "./titleGenerator"

// Type alias for compatibility
type ThreadMessage = ChatMessage

interface ThreadMetadata {
  id: string
  remoteId: string
  title?: string
  status: "regular" | "archived" | "new" | "deleted"
  createdAt: string
  updatedAt: string
}

interface RemoteThreadListResponse {
  threads: Array<{
    status: "regular" | "archived"
    remoteId: string
    title?: string
  }>
}

interface RemoteThreadInitializeResponse {
  remoteId: string
  externalId: string
}

/**
 * Create a thread list adapter that persists threads to storage
 */
export function createThreadListAdapter() {
  /**
   * Load threads from storage
   */
  async function loadThreads(): Promise<ThreadMetadata[]> {
    try {
      let threads: ThreadMetadata[] = []

      if (window.electronAPI) {
        threads = await window.electronAPI.readConfig('threads.json') || []
      } else {
        const stored = localStorage.getItem('threads.json')
        threads = stored ? JSON.parse(stored) : []
      }

      console.log(`[ThreadList] Loaded ${threads.length} threads`)
      return threads
    } catch (error) {
      console.error('[ThreadList] Failed to load threads:', error)
      return []
    }
  }

  /**
   * Save threads to storage
   */
  async function saveThreads(threads: ThreadMetadata[]): Promise<void> {
    try {
      if (window.electronAPI) {
        await window.electronAPI.writeConfig('threads.json', threads)
      } else {
        localStorage.setItem('threads.json', JSON.stringify(threads))
      }
      console.log(`[ThreadList] Saved ${threads.length} threads`)
    } catch (error) {
      console.error('[ThreadList] Failed to save threads:', error)
    }
  }

  return {
    /**
     * List all threads
     */
    async list(): Promise<RemoteThreadListResponse> {
      console.log('[ThreadList] Listing threads')
      const threads = await loadThreads()

      // Filter out deleted threads and map to response format
      const activeThreads = threads
        .filter(t => t.status !== "deleted")
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .map(t => ({
          status: t.status as "regular" | "archived",
          remoteId: t.remoteId,
          title: t.title
        }))

      console.log(`[ThreadList] Returning ${activeThreads.length} active threads`)
      return { threads: activeThreads }
    },

    /**
     * Initialize a new thread
     */
    async initialize(threadId: string): Promise<RemoteThreadInitializeResponse> {
      console.log(`[ThreadList] Initializing new thread: ${threadId}`)

      const threads = await loadThreads()
      const now = new Date().toISOString()

      // Create new thread metadata
      const newThread: ThreadMetadata = {
        id: threadId,
        remoteId: threadId,
        title: undefined, // Will be generated after first message
        status: "new",
        createdAt: now,
        updatedAt: now
      }

      threads.push(newThread)
      await saveThreads(threads)

      console.log(`[ThreadList] Thread ${threadId} initialized`)
      return { remoteId: threadId, externalId: threadId }
    },

    /**
     * Rename a thread
     */
    async rename(remoteId: string, newTitle: string): Promise<void> {
      console.log(`[ThreadList] Renaming thread ${remoteId} to: ${newTitle}`)

      const threads = await loadThreads()
      const thread = threads.find(t => t.remoteId === remoteId)

      if (thread) {
        thread.title = newTitle
        thread.updatedAt = new Date().toISOString()
        await saveThreads(threads)
        console.log(`[ThreadList] Thread ${remoteId} renamed`)
      } else {
        console.warn(`[ThreadList] Thread ${remoteId} not found for rename`)
      }
    },

    /**
     * Archive a thread
     */
    async archive(remoteId: string): Promise<void> {
      console.log(`[ThreadList] Archiving thread ${remoteId}`)

      const threads = await loadThreads()
      const thread = threads.find(t => t.remoteId === remoteId)

      if (thread) {
        thread.status = "archived"
        thread.updatedAt = new Date().toISOString()
        await saveThreads(threads)
        console.log(`[ThreadList] Thread ${remoteId} archived`)
      } else {
        console.warn(`[ThreadList] Thread ${remoteId} not found for archive`)
      }
    },

    /**
     * Unarchive a thread
     */
    async unarchive(remoteId: string): Promise<void> {
      console.log(`[ThreadList] Unarchiving thread ${remoteId}`)

      const threads = await loadThreads()
      const thread = threads.find(t => t.remoteId === remoteId)

      if (thread) {
        thread.status = "regular"
        thread.updatedAt = new Date().toISOString()
        await saveThreads(threads)
        console.log(`[ThreadList] Thread ${remoteId} unarchived`)
      } else {
        console.warn(`[ThreadList] Thread ${remoteId} not found for unarchive`)
      }
    },

    /**
     * Delete a thread and its messages
     */
    async delete(remoteId: string): Promise<void> {
      console.log(`[ThreadList] Deleting thread ${remoteId}`)

      // Remove thread from list
      const threads = await loadThreads()
      const filteredThreads = threads.filter(t => t.remoteId !== remoteId)
      await saveThreads(filteredThreads)

      // Delete thread messages
      try {
        const fileName = `threadMessages_${remoteId}.json`
        if (window.electronAPI) {
          // Note: writeConfig with null/empty to "delete" the file
          await window.electronAPI.writeConfig(fileName, [])
        } else {
          localStorage.removeItem(fileName)
        }
        console.log(`[ThreadList] Thread ${remoteId} and its messages deleted`)
      } catch (error) {
        console.error(`[ThreadList] Failed to delete messages for thread ${remoteId}:`, error)
      }
    },

    /**
     * Generate a title for a thread based on its messages
     */
    async generateTitle(remoteId: string, messages: readonly ThreadMessage[]): Promise<ReadableStream> {
      console.log(`[ThreadList] Generating title for thread ${remoteId}`)

      // Use our smart title generator
      const generatedTitle = generateConversationTitle(messages as ThreadMessage[])
      console.log(`[ThreadList] Generated title: ${generatedTitle}`)

      // Update thread metadata
      const threads = await loadThreads()
      const thread = threads.find(t => t.remoteId === remoteId)

      if (thread) {
        thread.title = generatedTitle
        thread.status = "regular" // Move from "new" to "regular"
        thread.updatedAt = new Date().toISOString()
        await saveThreads(threads)
      }

      // Return a ReadableStream with the title
      return new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          controller.enqueue(encoder.encode(generatedTitle))
          controller.close()
        }
      })
    }
  }
}
