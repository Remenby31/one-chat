/**
 * Syntax highlighting utilities for code and JSON display
 */

/**
 * Format a value for display with syntax highlighting
 * Handles JSON objects, strings, and other types
 */
export function formatForDisplay(value: any): string {
  if (typeof value === 'string') {
    try {
      // Try to parse as JSON for pretty printing
      const parsed = JSON.parse(value)
      return JSON.stringify(parsed, null, 2)
    } catch {
      // Not JSON, return as-is
      return value
    }
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, 2)
  }

  return String(value)
}

/**
 * Extract a preview of parameters for inline display
 * Shows the first few key-value pairs in a compact format
 */
export function getParamsPreview(args: Record<string, any>, maxLength = 60): string {
  const entries = Object.entries(args)

  if (entries.length === 0) {
    return 'no parameters'
  }

  const previews: string[] = []
  let totalLength = 0

  for (const [key, value] of entries) {
    let displayValue: string

    if (typeof value === 'string') {
      displayValue = `"${value}"`
    } else if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        displayValue = `[${value.length} items]`
      } else {
        displayValue = '{...}'
      }
    } else {
      displayValue = String(value)
    }

    const preview = `${key}: ${displayValue}`
    const newLength = totalLength + preview.length + (previews.length > 0 ? 2 : 0) // +2 for ", "

    if (newLength > maxLength && previews.length > 0) {
      previews.push('...')
      break
    }

    previews.push(preview)
    totalLength = newLength
  }

  return previews.join(', ')
}

/**
 * Detect the language/type of content for syntax highlighting
 */
export function detectLanguage(content: string): string {
  // Try to parse as JSON
  try {
    JSON.parse(content)
    return 'json'
  } catch {
    // Not JSON
  }

  // Check for common code patterns
  if (content.includes('function') || content.includes('const') || content.includes('let')) {
    return 'javascript'
  }

  if (content.includes('def ') || content.includes('import ')) {
    return 'python'
  }

  // Default to plain text
  return 'text'
}

/**
 * Get appropriate theme colors for syntax highlighting based on dark/light mode
 */
export function getSyntaxTheme(isDark: boolean): string {
  return isDark ? 'tomorrow' : 'github'
}
