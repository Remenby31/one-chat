/**
 * Branch Utilities
 *
 * Helper functions for working with branched conversation messages.
 */

import type {
  BranchedChatMessage,
  SiblingInfo,
  BranchedThread,
  LegacyThread,
} from '@/types/branching'
import { isBranchedThread } from '@/types/branching'

/**
 * Get all siblings for a given sibling group
 */
export function getSiblings(
  messages: BranchedChatMessage[],
  siblingGroupId: string
): BranchedChatMessage[] {
  return messages
    .filter((m) => m.siblingGroupId === siblingGroupId)
    .sort((a, b) => (a.siblingIndex ?? 0) - (b.siblingIndex ?? 0))
}

/**
 * Get sibling info for UI display
 * Returns null if message has no siblings (or only one sibling = itself)
 */
export function getSiblingInfo(
  messages: BranchedChatMessage[],
  message: BranchedChatMessage,
  activeBranches: Record<string, number>
): SiblingInfo | null {
  if (!message.siblingGroupId) return null

  const siblings = getSiblings(messages, message.siblingGroupId)
  if (siblings.length <= 1) return null // No navigation needed

  return {
    groupId: message.siblingGroupId,
    currentIndex: activeBranches[message.siblingGroupId] ?? 0,
    totalCount: siblings.length,
    siblings,
  }
}

/**
 * Filter messages to show only the active branch path
 * Messages without siblings always show
 */
export function getActiveBranchMessages(
  messages: BranchedChatMessage[],
  activeBranches: Record<string, number>
): BranchedChatMessage[] {
  return messages.filter((msg) => {
    // Messages without siblings always show
    if (!msg.siblingGroupId) return true

    // Only show if this is the active sibling
    const activeIndex = activeBranches[msg.siblingGroupId] ?? 0
    return (msg.siblingIndex ?? 0) === activeIndex
  })
}

/**
 * Generate next sibling index for a group
 */
export function getNextSiblingIndex(
  messages: BranchedChatMessage[],
  siblingGroupId: string
): number {
  const siblings = getSiblings(messages, siblingGroupId)
  if (siblings.length === 0) return 0

  const maxIndex = Math.max(...siblings.map((s) => s.siblingIndex ?? 0))
  return maxIndex + 1
}

/**
 * Get all tool messages belonging to a specific branch
 */
export function getBranchToolMessages(
  messages: BranchedChatMessage[],
  assistantMessage: BranchedChatMessage
): BranchedChatMessage[] {
  return messages.filter(
    (m) =>
      m.role === 'tool' &&
      m.siblingGroupId === assistantMessage.siblingGroupId &&
      m.siblingIndex === assistantMessage.siblingIndex
  )
}

/**
 * Find the preceding user message for a given message index
 */
export function findPrecedingUserMessage(
  messages: BranchedChatMessage[],
  index: number
): BranchedChatMessage | null {
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i]
    }
  }
  return null
}

/**
 * Find the last user message in the array
 */
export function findLastUserMessage(
  messages: BranchedChatMessage[]
): BranchedChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i]
    }
  }
  return null
}

/**
 * Generate a sibling group ID for a message
 */
export function generateSiblingGroupId(parentMessageId: string, role: 'user' | 'assistant'): string {
  return `sibling_${role}_${parentMessageId}`
}

/**
 * Migrate a legacy thread (v1) to branched format (v2)
 */
export function migrateThreadToV2(
  data: LegacyThread | BranchedThread
): BranchedThread {
  // Already v2
  if (isBranchedThread(data)) {
    return data
  }

  const legacyData = data as LegacyThread

  // Migrate v1 to v2
  const migratedMessages: BranchedChatMessage[] = legacyData.messages.map(
    (msg, i) => {
      // For assistant messages, find their parent user message
      if (msg.role === 'assistant') {
        const parentUser = findPrecedingUserMessage(
          legacyData.messages as BranchedChatMessage[],
          i
        )

        if (parentUser) {
          return {
            ...msg,
            parentId: parentUser.id,
            siblingGroupId: generateSiblingGroupId(parentUser.id, 'assistant'),
            siblingIndex: 0, // Original response = index 0
          }
        }
      }

      // For tool messages, inherit parent from their assistant message
      if (msg.role === 'tool' && msg.tool_call_id) {
        // Find the assistant message with this tool_call
        for (let j = i - 1; j >= 0; j--) {
          const prev = legacyData.messages[j] as BranchedChatMessage
          if (
            prev.role === 'assistant' &&
            prev.tool_call_requests?.some((tc) => tc.id === msg.tool_call_id)
          ) {
            return {
              ...msg,
              parentId: prev.parentId,
              siblingGroupId: prev.siblingGroupId,
              siblingIndex: prev.siblingIndex,
            }
          }
        }
      }

      // User and system messages - no branching metadata needed initially
      return msg as BranchedChatMessage
    }
  )

  return {
    metadata: legacyData.metadata,
    messages: migratedMessages,
    systemPrompt: legacyData.systemPrompt,
    activeBranches: {}, // All at index 0 (original)
    version: 2,
  }
}

/**
 * Check if a message is on the active branch path
 */
export function isOnActiveBranch(
  message: BranchedChatMessage,
  activeBranches: Record<string, number>
): boolean {
  if (!message.siblingGroupId) return true
  const activeIndex = activeBranches[message.siblingGroupId] ?? 0
  return (message.siblingIndex ?? 0) === activeIndex
}

/**
 * Get the conversation path for sending to API
 * This follows the active branches and returns messages in order
 */
export function getConversationPath(
  messages: BranchedChatMessage[],
  activeBranches: Record<string, number>
): BranchedChatMessage[] {
  const activePath = getActiveBranchMessages(messages, activeBranches)

  // Sort by timestamp to ensure correct order
  return activePath.sort((a, b) => a.timestamp - b.timestamp)
}
