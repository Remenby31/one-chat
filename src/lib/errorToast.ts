import { toast } from 'sonner'

/**
 * Copy text to clipboard and show confirmation toast
 */
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard', {
      duration: 2000,
    })
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
    toast.error('Failed to copy to clipboard', {
      duration: 2000,
    })
  }
}

/**
 * Display a generic error toast with copy button
 */
export function showErrorToast(message: string, description?: string) {
  const fullErrorText = description ? `${message}\n\n${description}` : message

  toast.error(message, {
    description,
    duration: 5000,
    action: {
      label: '📋 Copy',
      onClick: () => copyToClipboard(fullErrorText),
    },
  })
}

/**
 * Display a success toast
 */
export function showSuccessToast(message: string, description?: string) {
  toast.success(message, {
    description,
    duration: 3000,
  })
}

/**
 * Display a warning toast
 */
export function showWarningToast(message: string, description?: string) {
  toast.warning(message, {
    description,
    duration: 4000,
  })
}

/**
 * Display an info toast
 */
export function showInfoToast(message: string, description?: string) {
  toast.info(message, {
    description,
    duration: 3000,
  })
}

/**
 * Parse HTTP error and display appropriate toast
 */
export function showApiErrorToast(error: Error | unknown) {
  if (!(error instanceof Error)) {
    showErrorToast('An unknown error occurred', 'Please try again')
    return
  }

  const errorMsg = error.message

  // Try to extract HTTP status and JSON error details
  const httpMatch = errorMsg.match(/HTTP (\d+): (.+)/)
  if (!httpMatch) {
    showErrorToast('Connection Error', errorMsg)
    return
  }

  const statusCode = httpMatch[1]
  const jsonPart = httpMatch[2]

  let message = ''
  let description = ''

  try {
    const errorData = JSON.parse(jsonPart)
    const errorDetail = errorData.error || {}
    const errorMessage = errorDetail.message || errorData.message || 'Unknown error'
    const errorType = errorDetail.type || ''
    const errorCode = errorDetail.code || ''

    // Create user-friendly messages based on status code
    switch (statusCode) {
      case '429':
        message = 'API Quota Exceeded'
        description = `${errorMessage}\n\nPlease check your API plan and billing details.`
        break
      case '401':
        message = 'Authentication Failed'
        description = `${errorMessage}\n\nPlease verify your API key in Settings.`
        break
      case '404':
        message = 'Endpoint Not Found'
        description = `${errorMessage}\n\nPlease check your model configuration in Settings.`
        break
      case '500':
      case '502':
      case '503':
        message = 'Server Error'
        description = `${errorMessage}\n\nThe API server is experiencing issues. Please try again later.`
        break
      default:
        message = `API Error (HTTP ${statusCode})`
        description = errorMessage
    }

    if (errorType || errorCode) {
      description += `\n\nType: ${errorType || 'N/A'} | Code: ${errorCode || 'N/A'}`
    }
  } catch {
    // If JSON parsing fails, use the raw message
    message = `API Error (HTTP ${statusCode})`
    description = errorMsg
  }

  showErrorToast(message, description)
}

/**
 * Display MCP-specific error toast
 */
export function showMcpErrorToast(serverName: string, error: Error | unknown, action?: string) {
  const errorMsg = error instanceof Error ? error.message : String(error)
  const actionText = action ? ` (${action})` : ''

  showErrorToast(
    `MCP Server Error: ${serverName}${actionText}`,
    errorMsg
  )
}

/**
 * Display OAuth-specific error toast
 */
export function showOAuthErrorToast(error: Error | unknown) {
  const errorMsg = error instanceof Error ? error.message : String(error)

  showErrorToast(
    'OAuth Authentication Failed',
    errorMsg
  )
}

/**
 * Display React error boundary error toast
 */
export function showReactErrorToast(error: Error, errorInfo?: { componentStack?: string }) {
  showErrorToast(
    'Application Error',
    `${error.message}\n\nThe application encountered an unexpected error. Please refresh the page.`
  )

  // Log full error to console for debugging
  console.error('React Error Boundary caught error:', error, errorInfo)
}

/**
 * Display global unhandled error toast
 */
export function showGlobalErrorToast(error: Error | string) {
  const errorMsg = error instanceof Error ? error.message : String(error)

  showErrorToast(
    'Unexpected Error',
    errorMsg
  )
}
