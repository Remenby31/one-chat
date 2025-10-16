/**
 * Thread History Adapter
 * Handles persistence of messages for individual threads
 */

import type { ThreadMessage } from "@assistant-ui/react"

export interface ThreadHistoryAdapter {
  load(): Promise<{ messages: ThreadMessage[] }>
  append(message: ThreadMessage): Promise<void>
}

/**
 * Create a thread history adapter for a specific thread
 * Stores messages in threadMessages_{threadId}.json
 */
export function createThreadHistoryAdapter(threadId: string | undefined): ThreadHistoryAdapter {
  return {
    async load() {
      if (!threadId) {
        console.log('[ThreadHistory] No threadId provided, returning empty messages')
        return { messages: [] }
      }

      try {
        const fileName = `threadMessages_${threadId}.json`
        console.log(`[ThreadHistory] Loading messages from ${fileName}`)

        let messages: ThreadMessage[] = []

        if (window.electronAPI) {
          // Load from Electron storage
          messages = await window.electronAPI.readConfig(fileName) || []
        } else {
          // Load from localStorage
          const stored = localStorage.getItem(fileName)
          messages = stored ? JSON.parse(stored) : []
        }

        console.log(`[ThreadHistory] Loaded ${messages.length} messages for thread ${threadId}`)
        return { messages }
      } catch (error) {
        console.error('[ThreadHistory] Failed to load messages:', error)
        return { messages: [] }
      }
    },

    async append(message: ThreadMessage) {
      if (!threadId) {
        console.warn('[ThreadHistory] Cannot save message - no threadId')
        return
      }

      try {
        const fileName = `threadMessages_${threadId}.json`
        console.log(`[ThreadHistory] Appending message to ${fileName}`, {
          role: message.role,
          contentLength: message.content.length
        })

        // Load existing messages
        let messages: ThreadMessage[] = []
        if (window.electronAPI) {
          messages = await window.electronAPI.readConfig(fileName) || []
        } else {
          const stored = localStorage.getItem(fileName)
          messages = stored ? JSON.parse(stored) : []
        }

        // Add new message
        messages.push(message)

        // Save back to storage
        if (window.electronAPI) {
          await window.electronAPI.writeConfig(fileName, messages)
        } else {
          localStorage.setItem(fileName, JSON.stringify(messages))
        }

        console.log(`[ThreadHistory] Message saved. Total messages: ${messages.length}`)
      } catch (error) {
        console.error('[ThreadHistory] Failed to append message:', error)
      }
    }
  }
}
