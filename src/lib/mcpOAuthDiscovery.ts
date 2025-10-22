/**
 * MCP OAuth Discovery Module
 *
 * Implements automatic OAuth configuration discovery using:
 * - OAuth 2.0 Protected Resource Metadata (www-authenticate header)
 * - OAuth 2.0 Authorization Server Metadata (RFC 8414)
 *
 * This allows users to add MCP servers by just providing the URL,
 * without manually configuring OAuth endpoints.
 */

import type { MCPOAuthConfig } from '@/types/mcp'

/**
 * Resource metadata from the MCP server
 */
interface ResourceMetadata {
  resource: string
  authorization_servers?: string[]
  scopes_supported?: string[]
  bearer_methods_supported?: string[]
}

/**
 * Authorization server metadata (RFC 8414)
 */
interface AuthServerMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  scopes_supported?: string[]
  response_types_supported?: string[]
  grant_types_supported?: string[]
  code_challenge_methods_supported?: string[]
  revocation_endpoint?: string
  introspection_endpoint?: string
  registration_endpoint?: string // For Dynamic Client Registration (RFC 7591)
}

/**
 * Result of OAuth discovery
 */
export interface OAuthDiscoveryResult {
  success: boolean
  config?: MCPOAuthConfig
  error?: string
  resourceMetadata?: ResourceMetadata
  authServerMetadata?: AuthServerMetadata
}

/**
 * Parse the WWW-Authenticate header to extract resource_metadata URL
 *
 * Example header:
 * Bearer error="invalid_request", error_description="No access token", resource_metadata="https://example.com/.well-known/oauth-protected-resource"
 */
export function parseWWWAuthenticate(header: string): string | null {
  if (!header) return null

  // Look for resource_metadata parameter
  const resourceMetadataMatch = header.match(/resource_metadata="([^"]+)"/)
  if (resourceMetadataMatch && resourceMetadataMatch[1]) {
    return resourceMetadataMatch[1]
  }

  return null
}

/**
 * Fetch resource metadata from the well-known URL
 */
async function fetchResourceMetadata(url: string): Promise<ResourceMetadata> {
  console.log('[OAuth Discovery] Fetching resource metadata from:', url)

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch resource metadata: ${response.statusText}`)
  }

  const metadata = await response.json() as ResourceMetadata
  console.log('[OAuth Discovery] Resource metadata:', metadata)

  return metadata
}

/**
 * Register a dynamic OAuth client with the authorization server (RFC 7591)
 * Returns client_id and optionally client_secret and registration_access_token
 */
async function registerDynamicClient(
  registrationEndpoint: string,
  appName: string = 'Jarvis'
): Promise<{
  client_id: string
  client_secret?: string
  registration_access_token?: string
}> {
  console.log('[OAuth Discovery] Registering dynamic client at:', registrationEndpoint)

  try {
    const response = await fetch(registrationEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_name: appName,
        application_type: 'native', // Desktop application
        redirect_uris: ['jarvis://oauth/callback'],
        token_endpoint_auth_method: 'none', // Public client with PKCE, no client_secret
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code']
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[OAuth Discovery] DCR failed:', errorText)
      throw new Error(`Dynamic client registration failed: ${response.statusText}`)
    }

    const registration = await response.json()
    console.log('[OAuth Discovery] Dynamic client registered:', {
      client_id: registration.client_id,
      hasSecret: !!registration.client_secret,
      hasRegistrationToken: !!registration.registration_access_token
    })

    return registration
  } catch (error) {
    console.error('[OAuth Discovery] DCR error:', error)
    throw error
  }
}

/**
 * Fetch authorization server metadata using RFC 8414 well-known URL
 */
async function fetchAuthServerMetadata(serverUrl: string): Promise<AuthServerMetadata> {
  // Try both OAuth 2.0 and OpenID Connect well-known URLs
  const wellKnownUrls = [
    `${serverUrl}/.well-known/oauth-authorization-server`,
    `${serverUrl}/.well-known/openid-configuration`
  ]

  console.log('[OAuth Discovery] Fetching auth server metadata from:', serverUrl)

  for (const wellKnownUrl of wellKnownUrls) {
    try {
      const response = await fetch(wellKnownUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      })

      if (response.ok) {
        const metadata = await response.json() as AuthServerMetadata
        console.log('[OAuth Discovery] Auth server metadata:', metadata)
        return metadata
      }
    } catch (error) {
      console.warn('[OAuth Discovery] Failed to fetch from', wellKnownUrl, ':', error)
      continue
    }
  }

  throw new Error('Failed to fetch authorization server metadata from well-known URLs')
}

/**
 * Probe an MCP server URL to check if it requires OAuth
 * Returns the resource_metadata URL if OAuth is required
 */
async function probeForOAuth(url: string): Promise<string | null> {
  console.log('[OAuth Discovery] Probing URL:', url)

  try {
    // Try HEAD first (faster), then GET if HEAD fails
    for (const method of ['HEAD', 'GET']) {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Accept': 'application/json'
          }
        })

        // Check for 401 with WWW-Authenticate header
        if (response.status === 401) {
          const wwwAuth = response.headers.get('www-authenticate')
          if (wwwAuth) {
            console.log('[OAuth Discovery] Found www-authenticate header:', wwwAuth)
            const resourceMetadataUrl = parseWWWAuthenticate(wwwAuth)
            if (resourceMetadataUrl) {
              return resourceMetadataUrl
            }
          }
        }

        // If we get here and response is OK, server doesn't require OAuth
        if (response.ok) {
          console.log('[OAuth Discovery] Server does not require OAuth (200 OK)')
          return null
        }

        break // If GET/HEAD succeeded (even with non-401), don't try the other method
      } catch (error) {
        console.warn(`[OAuth Discovery] ${method} request failed:`, error)
        continue
      }
    }

    return null
  } catch (error) {
    console.error('[OAuth Discovery] Probe error:', error)
    return null
  }
}

/**
 * Discover OAuth configuration for an MCP server URL
 *
 * Steps:
 * 1. Probe the MCP URL for OAuth requirement (check for 401 + www-authenticate)
 * 2. If OAuth required, fetch resource metadata from www-authenticate URL
 * 3. Extract authorization server URLs from resource metadata
 * 4. Fetch authorization server metadata for each server
 * 5. Return discovered OAuth configuration
 *
 * @param url - MCP server URL to probe
 * @returns Discovery result with OAuth configuration
 */
export async function discoverOAuthConfig(url: string): Promise<OAuthDiscoveryResult> {
  try {
    console.log('[OAuth Discovery] Starting discovery for:', url)

    // Step 1: Probe for OAuth requirement
    const resourceMetadataUrl = await probeForOAuth(url)

    if (!resourceMetadataUrl) {
      console.log('[OAuth Discovery] No OAuth required for this URL')
      return {
        success: false,
        error: 'Server does not advertise OAuth requirement via www-authenticate header'
      }
    }

    // Step 2: Fetch resource metadata
    const resourceMetadata = await fetchResourceMetadata(resourceMetadataUrl)

    if (!resourceMetadata.authorization_servers || resourceMetadata.authorization_servers.length === 0) {
      return {
        success: false,
        error: 'Resource metadata does not specify authorization servers',
        resourceMetadata
      }
    }

    // Step 3: Fetch authorization server metadata for the first server
    // (Most MCP servers will only have one auth server)
    const authServerUrl = resourceMetadata.authorization_servers[0]
    const authServerMetadata = await fetchAuthServerMetadata(authServerUrl)

    // Step 4: Build OAuth configuration
    const config: MCPOAuthConfig = {
      authUrl: authServerMetadata.authorization_endpoint,
      tokenUrl: authServerMetadata.token_endpoint,
      scopes: resourceMetadata.scopes_supported || authServerMetadata.scopes_supported || [],
    }

    // Step 5: Dynamic Client Registration (DCR) if supported
    if (authServerMetadata.registration_endpoint) {
      console.log('[OAuth Discovery] Registration endpoint found, attempting DCR...')

      try {
        const registration = await registerDynamicClient(
          authServerMetadata.registration_endpoint,
          'Jarvis'
        )

        // Add obtained client_id and client_secret to config
        config.clientId = registration.client_id

        // Store client_secret if provided (some providers like Supabase require it)
        if (registration.client_secret) {
          config.clientSecret = registration.client_secret
        }

        // Store registration access token for future client management
        if (registration.registration_access_token) {
          config.registrationAccessToken = registration.registration_access_token
        }

        console.log('[OAuth Discovery] DCR successful, client_id obtained:', registration.client_id, ', has secret:', !!registration.client_secret)
      } catch (error) {
        console.warn('[OAuth Discovery] DCR failed, will use default client_id:', error)
        // Continue without client_id - will use default 'jarvis-mcp-client' in startOAuthFlow
      }
    } else {
      console.log('[OAuth Discovery] No registration endpoint, will use default client_id')
    }

    console.log('[OAuth Discovery] Successfully discovered OAuth config:', config)

    return {
      success: true,
      config,
      resourceMetadata,
      authServerMetadata
    }
  } catch (error) {
    console.error('[OAuth Discovery] Discovery failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during OAuth discovery'
    }
  }
}

/**
 * Check if a URL looks like it might be an OAuth-protected MCP server
 * This is a heuristic check before doing full discovery
 */
export function looksLikeOAuthServer(url: string): boolean {
  const urlLower = url.toLowerCase()

  // Known OAuth MCP server domains
  const knownOAuthDomains = [
    'mcp.stripe.com',
    'mcp.supabase.com',
    'oauth',
    '/authorize',
    '/token'
  ]

  return knownOAuthDomains.some(domain => urlLower.includes(domain))
}
