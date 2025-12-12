/**
 * MCP Favicon Utility
 * Extracts domain from MCP server commands/URLs and generates favicon URLs
 */

/**
 * Extract URLs from a command string
 * Examples:
 * - "npx -y mcp-remote https://mcp.notion.com/mcp" -> "https://mcp.notion.com/mcp"
 * - "npx @anthropic/mcp-server" -> null (no URL)
 */
function extractUrlFromCommand(command: string, args?: string[]): string | null {
  // Combine command and args
  const fullCommand = args ? `${command} ${args.join(' ')}` : command

  // Match URLs (http:// or https://)
  const urlRegex = /https?:\/\/[^\s"']+/gi
  const matches = fullCommand.match(urlRegex)

  return matches?.[0] || null
}

/**
 * Extract the base domain from a URL, removing subdomains
 * Examples:
 * - "https://mcp.notion.com/mcp" -> "notion.com"
 * - "https://api.github.com/v1" -> "github.com"
 * - "https://example.co.uk/path" -> "example.co.uk"
 */
function extractBaseDomain(url: string): string | null {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname

    // List of known multi-part TLDs
    const multiPartTlds = [
      'co.uk', 'co.jp', 'co.kr', 'co.nz', 'co.za', 'co.in',
      'com.au', 'com.br', 'com.cn', 'com.mx', 'com.tw',
      'org.uk', 'org.au', 'net.au', 'gov.uk', 'ac.uk'
    ]

    const parts = hostname.split('.')

    // Check for multi-part TLDs
    const lastTwoParts = parts.slice(-2).join('.')
    if (multiPartTlds.includes(lastTwoParts) && parts.length > 2) {
      // Return last 3 parts for multi-part TLDs
      return parts.slice(-3).join('.')
    }

    // For regular TLDs, return last 2 parts
    if (parts.length >= 2) {
      return parts.slice(-2).join('.')
    }

    return hostname
  } catch {
    return null
  }
}

/**
 * Get favicon URL for a domain using Google's favicon service
 * This is reliable and handles most cases well
 */
export function getFaviconUrl(domain: string, size: number = 32): string {
  // Google's favicon service - most reliable
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`
}

/**
 * Get favicon URL from an MCP server configuration
 * Extracts domain from command/args or httpUrl
 */
export function getMCPServerFaviconUrl(
  command?: string,
  args?: string[],
  httpUrl?: string,
  size: number = 32
): string | null {
  let url: string | null = null

  // First, try httpUrl (for HTTP transport servers)
  if (httpUrl) {
    url = httpUrl
  }
  // Then, try to extract from command/args (for stdio transport with remote URLs)
  else if (command) {
    url = extractUrlFromCommand(command, args)
  }

  if (!url) {
    return null
  }

  const domain = extractBaseDomain(url)
  if (!domain) {
    return null
  }

  return getFaviconUrl(domain, size)
}

/**
 * Extract domain info from MCP server for display purposes
 */
export function getMCPServerDomain(
  command?: string,
  args?: string[],
  httpUrl?: string
): string | null {
  let url: string | null = null

  if (httpUrl) {
    url = httpUrl
  } else if (command) {
    url = extractUrlFromCommand(command, args)
  }

  if (!url) {
    return null
  }

  return extractBaseDomain(url)
}
