/**
 * Branching System Types
 *
 * This module defines types for the conversation branching system,
 * allowing multiple alternative responses (regenerations) and user message edits.
 */

import type { ChatMessage } from '@/lib/chatStore'

/**
 * Extended message with branching support
 */
export interface BranchingFields {
  /** ID of the parent message (user message for assistant, previous message for user) */
  parentId?: string
  /** Shared identifier for all sibling alternatives */
  siblingGroupId?: string
  /** Position in sibling group (0 = original, 1+ = regenerations/edits) */
  siblingIndex?: number
}

/**
 * ChatMessage with branching fields
 */
export type BranchedChatMessage = ChatMessage & BranchingFields

/**
 * Sibling navigation info for UI
 */
export interface SiblingInfo {
  /** Sibling group identifier */
  groupId: string
  /** Currently active sibling index */
  currentIndex: number
  /** Total number of siblings */
  totalCount: number
  /** All siblings in order by index */
  siblings: BranchedChatMessage[]
}

/**
 * Thread format version 2 with branching support
 */
export interface BranchedThread {
  metadata: BranchedThreadMetadata
  messages: BranchedChatMessage[]
  systemPrompt?: string
  /** Active branch selection per sibling group: groupId -> activeIndex */
  activeBranches: Record<string, number>
  /** Schema version for migration detection */
  version: 2
}

/**
 * Thread metadata with branching version
 */
export interface BranchedThreadMetadata {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
  systemPrompt?: string
}

/**
 * Legacy thread format (version 1 - no branching)
 */
export interface LegacyThread {
  metadata: {
    id: string
    title: string
    createdAt: number
    updatedAt: number
    messageCount: number
    systemPrompt?: string
  }
  messages: ChatMessage[]
  systemPrompt?: string
}

/**
 * Type guard to check if thread is version 2
 */
export function isBranchedThread(data: unknown): data is BranchedThread {
  return (
    typeof data === 'object' &&
    data !== null &&
    'version' in data &&
    (data as BranchedThread).version === 2
  )
}
