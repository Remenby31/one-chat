import { useMemo } from 'react'
import type { ToolCall, ToolCallStatus as StreamingStatus } from '@/lib/chatStore'
import { getToolCallStatus, getErrorMessage } from '@/lib/toolCallUtils'

/**
 * Tool call execution status with additional metadata
 */
export interface ToolCallStatus {
  /** Current execution status - includes streaming states */
  status: 'streaming' | 'ready' | 'running' | 'success' | 'error'
  /** Execution duration in milliseconds (if available) */
  duration?: number
  /** Error message (if status is 'error') */
  errorMessage?: string
}

/**
 * Map streaming status to display status
 */
function mapStreamingStatus(streamingStatus: StreamingStatus): ToolCallStatus['status'] {
  switch (streamingStatus) {
    case 'streaming':
      return 'streaming'
    case 'ready':
      return 'ready'
    case 'executing':
      return 'running'
    case 'complete':
      return 'success'
    case 'error':
      return 'error'
    default:
      return 'running'
  }
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
    // First check for explicit streaming status (real-time updates)
    if (toolCall.status) {
      return {
        status: mapStreamingStatus(toolCall.status),
        duration: toolCall.duration,
        errorMessage: toolCall.status === 'error' ? getErrorMessage(toolCall.result) : undefined,
      }
    }

    // Fall back to legacy result-based status detection
    const status = getToolCallStatus(toolCall.result)

    return {
      status,
      duration: toolCall.duration,
      errorMessage: status === 'error' ? getErrorMessage(toolCall.result) : undefined,
    }
  }, [toolCall.status, toolCall.result, toolCall.duration])
}
