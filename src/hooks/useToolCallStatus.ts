import { useMemo } from 'react'
import type { ToolCall } from '@/lib/chatStore'
import { getToolCallStatus, getErrorMessage } from '@/lib/toolCallUtils'

/**
 * Tool call execution status with additional metadata
 */
export interface ToolCallStatus {
  /** Current execution status */
  status: 'running' | 'success' | 'error'
  /** Execution duration in milliseconds (if available) */
  duration?: number
  /** Error message (if status is 'error') */
  errorMessage?: string
}

/**
 * Hook to determine and track tool call execution status
 *
 * @param toolCall - The tool call to analyze
 * @returns Tool call status with metadata (memoized)
 *
 * @example
 * const status = useToolCallStatus(toolCall)
 * if (status.status === 'error') {
 *   console.error(status.errorMessage)
 * }
 */
export function useToolCallStatus(toolCall: ToolCall): ToolCallStatus {
  return useMemo(() => {
    const status = getToolCallStatus(toolCall.result)

    return {
      status,
      duration: toolCall.duration,
      errorMessage: status === 'error' ? getErrorMessage(toolCall.result) : undefined,
    }
  }, [toolCall.result, toolCall.duration])
}
