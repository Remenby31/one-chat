/**
 * Message Validation Utilities
 *
 * Ensures messages sent to the API are valid and properly structured.
 * Handles edge cases like orphaned tool results and missing tool_calls.
 */

import type { ChatMessage } from './chatStore'

/**
 * OpenAI-compatible message format for API requests
 */
export interface APIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  name?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
}

/**
 * Convert ChatMessage to API format
 */
function toAPIMessage(msg: ChatMessage): APIMessage {
  const message: APIMessage = {
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
}

/**
 * Validate and prepare messages for API request
 *
 * This function:
 * 1. Filters out streaming messages
 * 2. Keeps messages with content OR assistant messages with tool_calls
 * 3. Validates tool message chains (each tool must follow an assistant with matching tool_call)
 * 4. Removes orphaned tool messages that would cause API errors
 *
 * @param messages - Raw messages from the chat store
 * @returns Valid API messages ready to send
 */
export function prepareMessagesForAPI(messages: ChatMessage[]): APIMessage[] {
  // Step 1: Filter out streaming messages and empty messages (except assistant with tool_calls)
  const filteredMessages = messages.filter(m => {
    if (m.isStreaming) return false
    if (m.content.trim() !== '') return true
    if (m.role === 'assistant' && m.tool_call_requests && m.tool_call_requests.length > 0) return true
    return false
  })

  // Step 2: Convert to API format
  const apiMessages = filteredMessages.map(toAPIMessage)

  // Step 3: Validate tool message chains
  return validateToolChains(apiMessages)
}

/**
 * Validate tool message chains
 *
 * OpenAI requires that every 'tool' message must be preceded by an 'assistant'
 * message with a matching tool_call_id in its tool_calls array.
 *
 * This function removes orphaned tool messages that would cause API errors.
 */
function validateToolChains(messages: APIMessage[]): APIMessage[] {
  // Build a set of valid tool_call_ids from assistant messages
  const validToolCallIds = new Set<string>()

  // Track which tool_call_ids have been "consumed" by a tool response
  const consumedToolCallIds = new Set<string>()

  // First pass: collect all valid tool_call_ids
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const toolCall of msg.tool_calls) {
        validToolCallIds.add(toolCall.id)
      }
    }
  }

  // Second pass: validate and filter messages
  const validatedMessages: APIMessage[] = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    if (msg.role === 'tool') {
      const toolCallId = msg.tool_call_id

      if (!toolCallId) {
        console.warn('[messageValidation] Tool message without tool_call_id, skipping:', msg)
        continue
      }

      if (!validToolCallIds.has(toolCallId)) {
        console.warn('[messageValidation] Orphaned tool message (no matching tool_call), skipping:', {
          tool_call_id: toolCallId,
          content: msg.content?.substring(0, 100)
        })
        continue
      }

      // Check if we've already seen a tool response for this tool_call_id
      if (consumedToolCallIds.has(toolCallId)) {
        console.warn('[messageValidation] Duplicate tool response for same tool_call_id, skipping:', toolCallId)
        continue
      }

      // Verify the tool message comes AFTER the assistant message with this tool_call
      const assistantIndex = findAssistantWithToolCall(validatedMessages, toolCallId)
      if (assistantIndex === -1) {
        console.warn('[messageValidation] Tool message before its assistant message, skipping:', toolCallId)
        continue
      }

      consumedToolCallIds.add(toolCallId)
    }

    validatedMessages.push(msg)
  }

  return validatedMessages
}

/**
 * Find the index of an assistant message with a specific tool_call_id
 */
function findAssistantWithToolCall(messages: APIMessage[], toolCallId: string): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'assistant' && msg.tool_calls) {
      if (msg.tool_calls.some(tc => tc.id === toolCallId)) {
        return i
      }
    }
  }
  return -1
}

/**
 * Check if a message array is valid for the API
 * Useful for pre-flight validation
 */
export function isValidMessageArray(messages: APIMessage[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const toolCallIds = new Set<string>()

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    // Collect tool_call_ids from assistant messages
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        toolCallIds.add(tc.id)
      }
    }

    // Validate tool messages
    if (msg.role === 'tool') {
      if (!msg.tool_call_id) {
        errors.push(`Message[${i}]: Tool message missing tool_call_id`)
      } else if (!toolCallIds.has(msg.tool_call_id)) {
        errors.push(`Message[${i}]: Tool message has tool_call_id '${msg.tool_call_id}' but no preceding assistant has this in tool_calls`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
