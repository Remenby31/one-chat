/**
 * OAuth Discovery
 *
 * Implements RFC 8414 (OAuth 2.0 Authorization Server Metadata)
 * and RFC 7591 (Dynamic Client Registration).
 */

import type {
  OAuthDiscoveryResult,
  OAuthConfig,
  AuthServerMetadata,
  ResourceMetadata,
  DCRResponse,
} from './types'

/**
 * Discover OAuth configuration for an MCP server URL
 *
 * This function:
 * 1. Probes the server for OAuth requirements (401 + www-authenticate)
 * 2. Fetches resource metadata to find auth server
 * 3. Fetches auth server metadata (RFC 8414)
 * 4. Optionally performs Dynamic Client Registration (RFC 7591)
 *
 * @param mcpUrl The MCP server URL
 * @param clientName The client name for DCR (default: 'MCP Client')
 * @returns Discovery result with OAuth config if successful
 */
export async function discoverOAuthConfig(
  mcpUrl: string,
  clientName = 'MCP Client'
): Promise<OAuthDiscoveryResult> {
  try {
    // Step 1: Check if server requires OAuth
    const probeResult = await probeForOAuth(mcpUrl)
    if (!probeResult.requiresAuth) {
      return { success: false, error: 'Server does not require OAuth authentication' }
    }

    // Step 2: Get resource metadata to find auth server
    const resourceMetadata = await fetchResourceMetadata(mcpUrl)
    if (!resourceMetadata?.authorization_servers?.length) {
      return { success: false, error: 'No authorization servers found in resource metadata' }
    }

    const authServerUrl = resourceMetadata.authorization_servers[0]

    // Step 3: Get auth server metadata
    const authMetadata = await fetchAuthServerMetadata(authServerUrl)
    if (!authMetadata) {
      return { success: false, error: 'Failed to fetch authorization server metadata' }
    }

    // Step 4: Perform Dynamic Client Registration if supported
    let clientId: string | undefined
    let clientSecret: string | undefined
    let registrationAccessToken: string | undefined

    if (authMetadata.registration_endpoint) {
      try {
        const dcrResult = await registerClient(authMetadata.registration_endpoint, clientName)
        if (dcrResult) {
          clientId = dcrResult.client_id
          clientSecret = dcrResult.client_secret
          registrationAccessToken = dcrResult.registration_access_token
        }
      } catch (dcrError) {
        // DCR failed, continue without it (client may need manual registration)
        console.warn('[OAuth Discovery] DCR failed:', dcrError)
      }
    }

    // Build OAuth config
    const config: OAuthConfig = {
      clientId,
      clientSecret,
      authUrl: authMetadata.authorization_endpoint,
      tokenUrl: authMetadata.token_endpoint,
      scopes: authMetadata.scopes_supported || [],
      registrationAccessToken,
    }

    return { success: true, config }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'OAuth discovery failed',
    }
  }
}

/**
 * Probe the MCP server to check if it requires OAuth
 */
export async function probeForOAuth(
  mcpUrl: string
): Promise<{ requiresAuth: boolean; authServerUrl?: string }> {
  try {
    const response = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'probe', version: '1.0.0' },
        },
      }),
    })

    if (response.status === 401) {
      // Check for www-authenticate header
      const wwwAuth = response.headers.get('www-authenticate')
      if (wwwAuth) {
        // Parse Bearer realm from www-authenticate header
        const realmMatch = wwwAuth.match(/realm="([^"]+)"/)
        return {
          requiresAuth: true,
          authServerUrl: realmMatch?.[1],
        }
      }
      return { requiresAuth: true }
    }

    // Server responded without auth requirement
    return { requiresAuth: false }
  } catch {
    // Network error or other issue
    return { requiresAuth: false }
  }
}

/**
 * Fetch OAuth 2.0 Protected Resource Metadata (RFC 8707)
 */
export async function fetchResourceMetadata(resourceUrl: string): Promise<ResourceMetadata | null> {
  try {
    const url = new URL(resourceUrl)
    const metadataUrl = `${url.origin}/.well-known/oauth-protected-resource`

    const response = await fetch(metadataUrl)
    if (!response.ok) {
      return null
    }

    return await response.json()
  } catch {
    return null
  }
}

/**
 * Fetch OAuth 2.0 Authorization Server Metadata (RFC 8414)
 */
export async function fetchAuthServerMetadata(
  authServerUrl: string
): Promise<AuthServerMetadata | null> {
  // Try .well-known/oauth-authorization-server first
  const url = new URL(authServerUrl)

  const wellKnownUrls = [
    `${url.origin}/.well-known/oauth-authorization-server`,
    `${url.origin}/.well-known/openid-configuration`,
  ]

  for (const metadataUrl of wellKnownUrls) {
    try {
      const response = await fetch(metadataUrl)
      if (response.ok) {
        return await response.json()
      }
    } catch {
      // Try next URL
    }
  }

  return null
}

/**
 * Register a client using Dynamic Client Registration (RFC 7591)
 */
export async function registerClient(
  registrationEndpoint: string,
  clientName: string,
  redirectUri?: string
): Promise<DCRResponse | null> {
  try {
    const response = await fetch(registrationEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_name: clientName,
        redirect_uris: redirectUri ? [redirectUri] : undefined,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_basic',
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`DCR failed: ${response.status} ${error}`)
    }

    return await response.json()
  } catch (error) {
    console.error('[OAuth Discovery] Client registration failed:', error)
    return null
  }
}

/**
 * Check if a URL looks like it might require OAuth
 * (heuristic based on common patterns)
 */
export function mightRequireOAuth(url: string): boolean {
  const oauthPatterns = [
    // Known MCP servers with OAuth
    /mcp\.supabase\.com/i,
    /mcp\.linear\.app/i,
    /mcp\.notion\.com/i,
    // General patterns
    /supabase\.(co|com)/i,
    /notion\.com/i,
    /linear\.app/i,
    /github\.com/i,
    /googleapis\.com/i,
    /microsoft\.com/i,
    /azure\.com/i,
    /slack\.com/i,
    /atlassian\.(com|net)/i,
    /jira\.com/i,
    /confluence\.com/i,
    /salesforce\.com/i,
  ]

  return oauthPatterns.some((pattern) => pattern.test(url))
}

/**
 * Known MCP server URLs with their OAuth requirements
 */
export const KNOWN_MCP_SERVERS: Record<string, { requiresOAuth: boolean; name: string }> = {
  'mcp.supabase.com': { requiresOAuth: true, name: 'Supabase' },
  'mcp.linear.app': { requiresOAuth: true, name: 'Linear' },
  'mcp.notion.com': { requiresOAuth: true, name: 'Notion' },
}

/**
 * Check if a URL is a known MCP server
 */
export function isKnownMCPServer(url: string): { known: boolean; requiresOAuth?: boolean; name?: string } {
  try {
    const urlObj = new URL(url)
    const host = urlObj.host.toLowerCase()
    const serverInfo = KNOWN_MCP_SERVERS[host]

    if (serverInfo) {
      return { known: true, requiresOAuth: serverInfo.requiresOAuth, name: serverInfo.name }
    }

    return { known: false }
  } catch {
    return { known: false }
  }
}
