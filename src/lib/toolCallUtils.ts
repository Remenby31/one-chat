import type { ToolCall, ChatMessage } from './chatStore'

/**
 * Parse tool name in format: serverId__toolName
 *
 * @param fullName - The full tool name (e.g., "shadcn__add_component" or "simple_tool")
 * @returns Object with serverId and toolName
 *
 * @example
 * parseToolName("shadcn__add_component") // { serverId: "shadcn", toolName: "add_component" }
 * parseToolName("simple_tool") // { serverId: "unknown", toolName: "simple_tool" }
 */
export function parseToolName(fullName: string): { serverId: string; toolName: string } {
  const parts = fullName.split('__')

  if (parts.length >= 2) {
    return {
      serverId: parts[0],
      toolName: parts.slice(1).join('__'),
    }
  }

  return {
    serverId: 'unknown',
    toolName: fullName,
  }
}

/**
 * Safely parse JSON string, return original value if invalid or non-JSON
 *
 * @param value - String to parse as JSON
 * @returns Parsed JSON object/array or original string
 *
 * @example
 * tryParseJSON('{"foo": "bar"}') // { foo: "bar" }
 * tryParseJSON('plain text') // "plain text"
 * tryParseJSON(undefined) // {}
 */
export function tryParseJSON(value: string | undefined): any {
  if (!value) return {}

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

/**
 * Convert API tool_call_request to ToolCall display format
 *
 * @param request - The tool call request from API (OpenAI format)
 * @param result - Optional result string (may be JSON or plain text)
 * @returns ToolCall object ready for display
 *
 * @example
 * const request = {
 *   id: "call_123",
 *   type: "function",
 *   function: { name: "shadcn__add", arguments: '{"component":"button"}' }
 * }
 * convertToolCallRequestToToolCall(request, '{"success":true}')
 * // { id: "call_123", toolName: "shadcn__add", args: {component:"button"}, result: {success:true}, ... }
 */
export function convertToolCallRequestToToolCall(
  request: NonNullable<ChatMessage['tool_call_requests']>[0],
  result?: string
): ToolCall {
  let parsedResult: any = undefined

  if (result !== undefined) {
    // Try to parse result as JSON, fallback to original string
    parsedResult = tryParseJSON(result)
  }

  return {
    id: request.id,
    toolName: request.function.name,
    args: tryParseJSON(request.function.arguments),
    result: parsedResult,
    startTime: undefined,
    endTime: undefined,
    duration: undefined,
  }
}

/**
 * Get tool results for an assistant message by looking ahead in the message array
 *
 * @param messages - Array of all chat messages
 * @param assistantMessageIndex - Index of the assistant message to find results for
 * @returns Record mapping tool_call_id to result content
 *
 * @example
 * const messages = [
 *   { role: "assistant", tool_call_requests: [...] }, // index 0
 *   { role: "tool", tool_call_id: "call_1", content: "result 1" }, // index 1
 *   { role: "tool", tool_call_id: "call_2", content: "result 2" }, // index 2
 *   { role: "user", content: "..." }, // index 3
 * ]
 * getToolResultsForMessage(messages, 0)
 * // { "call_1": "result 1", "call_2": "result 2" }
 */
export function getToolResultsForMessage(
  messages: ChatMessage[],
  assistantMessageIndex: number
): Record<string, string> {
  const toolResults: Record<string, string> = {}

  const message = messages[assistantMessageIndex]

  // Only process if it's an assistant message with tool call requests
  if (message?.role !== 'assistant' || !message.tool_call_requests) {
    return toolResults
  }

  // Look ahead for tool messages immediately following this assistant message
  for (let i = assistantMessageIndex + 1; i < messages.length; i++) {
    const nextMsg = messages[i]

    if (nextMsg.role === 'tool' && nextMsg.tool_call_id) {
      toolResults[nextMsg.tool_call_id] = nextMsg.content
    } else if (nextMsg.role !== 'tool') {
      // Stop when we hit a non-tool message
      break
    }
  }

  return toolResults
}

/**
 * Determine tool call execution status
 *
 * @param result - The tool call result (can be undefined, error object, or success data)
 * @returns Status: 'running' | 'success' | 'error'
 *
 * @example
 * getToolCallStatus(undefined) // 'running'
 * getToolCallStatus({ error: "Failed" }) // 'error'
 * getToolCallStatus({ data: "Success" }) // 'success'
 */
export function getToolCallStatus(result?: any): 'running' | 'success' | 'error' {
  if (result === undefined) {
    return 'running'
  }

  // Check if result is an error object
  if (typeof result === 'object' && result !== null && 'error' in result) {
    return 'error'
  }

  return 'success'
}

/**
 * Format tool execution duration for display
 *
 * @param startTime - Start timestamp in milliseconds
 * @param endTime - End timestamp in milliseconds
 * @returns Formatted duration string or undefined if timing not available
 *
 * @example
 * formatToolDuration(1000, 2500) // "1500ms"
 * formatToolDuration(1000, 3000) // "2.00s"
 * formatToolDuration(undefined, 2000) // undefined
 */
export function formatToolDuration(startTime?: number, endTime?: number): string | undefined {
  if (startTime === undefined || endTime === undefined) {
    return undefined
  }

  const durationMs = endTime - startTime

  if (durationMs < 1000) {
    return `${durationMs.toFixed(0)}ms`
  }

  return `${(durationMs / 1000).toFixed(2)}s`
}

/**
 * Extract error message from tool call result
 *
 * @param result - The tool call result
 * @returns Error message string or undefined if no error
 *
 * @example
 * getErrorMessage({ error: "Connection failed" }) // "Connection failed"
 * getErrorMessage({ error: { message: "Not found" } }) // "Not found"
 * getErrorMessage({ success: true }) // undefined
 */
export function getErrorMessage(result: any): string | undefined {
  if (!result || typeof result !== 'object') {
    return undefined
  }

  if ('error' in result) {
    const error = result.error

    // If error is a string
    if (typeof error === 'string') {
      return error
    }

    // If error is an object with a message
    if (typeof error === 'object' && error !== null && 'message' in error) {
      return error.message
    }

    // Fallback: stringify the error
    return JSON.stringify(error)
  }

  return undefined
}
