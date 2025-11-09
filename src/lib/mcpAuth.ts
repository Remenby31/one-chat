/**
 * MCP OAuth Authentication Library
 *
 * Implements OAuth 2.1 with PKCE (Proof Key for Code Exchange) for MCP servers.
 * Supports authorization code flow with automatic token refresh.
 * Integrates with state machine for proper state transitions.
 */

import type { MCPServer, MCPOAuthState } from '@/types/mcp'
import { stateMachineManager } from '@/lib/mcpStateMachine'

// ========================================
// PKCE Helper Functions
// ========================================

/**
 * Generates a cryptographically random code verifier (43-128 characters)
 * Used in PKCE flow to prevent authorization code interception attacks
 */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64URLEncode(array)
}

/**
 * Generates the code challenge from the verifier using SHA-256
 * The challenge is sent in the authorization request, verifier in token request
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return base64URLEncode(new Uint8Array(hash))
}

/**
 * Base64URL encoding (URL-safe base64 without padding)
 * Required by OAuth 2.1 PKCE specification
 */
function base64URLEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer))
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// ========================================
// OAuth State Management
// ========================================

/**
 * In-memory storage for active OAuth flows
 * Maps state parameter to OAuth flow data
 *
 * Note: We also persist to sessionStorage to survive hot module replacement (HMR)
 */
const oauthStates = new Map<string, MCPOAuthState>()

const OAUTH_STATES_KEY = 'jarvis_oauth_states'

/**
 * Load OAuth states from sessionStorage (survives HMR)
 */
function loadOAuthStates(): void {
  try {
    const stored = sessionStorage.getItem(OAUTH_STATES_KEY)
    if (stored) {
      const states = JSON.parse(stored) as Array<[string, MCPOAuthState]>
      states.forEach(([key, value]) => oauthStates.set(key, value))
    }
  } catch (error) {
    console.warn('[OAuth] Failed to load states from sessionStorage:', error)
  }
}

/**
 * Save OAuth states to sessionStorage
 */
function saveOAuthStates(): void {
  try {
    const states = Array.from(oauthStates.entries())
    sessionStorage.setItem(OAUTH_STATES_KEY, JSON.stringify(states))
  } catch (error) {
    console.warn('[OAuth] Failed to save states to sessionStorage:', error)
  }
}

// Load states on module initialization
loadOAuthStates()

/**
 * Creates a new OAuth state for tracking the flow
 * State parameter prevents CSRF attacks
 */
function createOAuthState(
  serverId: string,
  codeVerifier: string,
  oauthConfig?: import('@/types/mcp').MCPOAuthConfig,
  serverName?: string
): MCPOAuthState {
  const state: MCPOAuthState = {
    serverId,
    state: crypto.randomUUID(), // Random state for CSRF protection
    codeVerifier,
    timestamp: Date.now(),
    oauthConfig, // Store config for callback
    serverName
  }
  oauthStates.set(state.state, state)
  saveOAuthStates() // Persist to sessionStorage
  return state
}

/**
 * Retrieves and validates an OAuth state
 * States expire after 10 minutes for security
 */
function getOAuthState(stateId: string): MCPOAuthState | null {
  // Try to load from sessionStorage if not in memory (HMR recovery)
  if (!oauthStates.has(stateId)) {
    loadOAuthStates()
  }

  const state = oauthStates.get(stateId)
  if (!state) {
    console.warn('[OAuth] State not found:', stateId)
    return null
  }

  // Expire states after 10 minutes
  const TEN_MINUTES = 10 * 60 * 1000
  if (Date.now() - state.timestamp > TEN_MINUTES) {
    console.warn('[OAuth] State expired:', stateId)
    oauthStates.delete(stateId)
    saveOAuthStates()
    return null
  }

  return state
}

/**
 * Removes an OAuth state after use
 */
function consumeOAuthState(stateId: string): void {
  oauthStates.delete(stateId)
  saveOAuthStates() // Update sessionStorage
}

// ========================================
// OAuth Flow Functions
// ========================================

/**
 * Starts the OAuth authorization flow
 *
 * 1. Generates PKCE code_verifier and code_challenge
 * 2. Creates OAuth state for tracking
 * 3. Constructs authorization URL with all parameters
 * 4. Opens URL in system browser
 * 5. Transitions server state to AUTHENTICATING
 *
 * User will authenticate in browser and be redirected to jarvis://oauth/callback
 *
 * @param server - MCP server configuration with OAuth settings
 */
export async function startOAuthFlow(server: MCPServer): Promise<void> {
  if (!server.oauthConfig?.authUrl) {
    throw new Error('OAuth configuration missing: authUrl is required')
  }

  // client_id is optional for OAuth 2.1 public clients with PKCE
  // Some MCP servers may not require it, or use a default public client_id

  // Transition to AUTHENTICATING state
  const machine = stateMachineManager.getMachine(server.id, server.status)
  await machine.transition('AUTHENTICATE', {
    authUrl: server.oauthConfig.authUrl,
    userMessage: 'Complete authentication in your browser'
  })

  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  // Create OAuth state with config (for callback when server not yet saved)
  const oauthState = createOAuthState(server.id, codeVerifier, server.oauthConfig, server.name)

  // Construct authorization URL
  const authUrl = new URL(server.oauthConfig.authUrl)

  // Use provided client_id or default for Jarvis
  const clientId = server.oauthConfig.clientId || 'jarvis-mcp-client'
  authUrl.searchParams.set('client_id', clientId)

  authUrl.searchParams.set('redirect_uri', 'jarvis://oauth/callback')
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('state', oauthState.state)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  // Add scopes if provided
  if (server.oauthConfig.scopes && server.oauthConfig.scopes.length > 0) {
    authUrl.searchParams.set('scope', server.oauthConfig.scopes.join(' '))
  }

  // Open in system browser
  if (window.electronAPI?.openExternal) {
    await window.electronAPI.openExternal(authUrl.toString())
  } else {
    window.open(authUrl.toString(), '_blank')
  }
}

/**
 * Handles the OAuth callback after user authorization
 *
 * 1. Parses callback URL for code and state
 * 2. Validates state matches the original request
 * 3. Exchanges authorization code for access token
 * 4. Stores tokens in server configuration
 * 5. Saves updated configuration
 *
 * @param callbackUrl - The jarvis://oauth/callback URL with code and state
 * @returns Server ID, tokens, and updated OAuth config
 */
export async function handleOAuthCallback(
  callbackUrl: string
): Promise<{ serverId: string; tokens: any; oauthConfig: import('@/types/mcp').MCPOAuthConfig }> {
  const url = new URL(callbackUrl)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')

  // Check for OAuth errors
  if (error) {
    const message = errorDescription || error
    console.error('[OAuth] Authorization error:', message)

    // Try to get the state to update the machine
    if (state) {
      const oauthState = getOAuthState(state)
      if (oauthState) {
        const machine = stateMachineManager.getMachine(oauthState.serverId)
        await machine.transition('AUTH_FAILURE', {
          errorMessage: `OAuth error: ${message}`,
          userMessage: 'Authentication failed. Please try again.'
        })
      }
    }

    throw new Error(`OAuth error: ${message}`)
  }

  // Validate required parameters
  if (!code || !state) {
    console.error('[OAuth] Missing code or state in callback')
    throw new Error('Invalid OAuth callback: missing code or state')
  }

  // Retrieve and validate OAuth state
  const oauthState = getOAuthState(state)
  if (!oauthState) {
    throw new Error('Invalid or expired OAuth state. Please try again.')
  }

  // Consume the state (one-time use)
  consumeOAuthState(state)

  // Try to get OAuth config from state first (server may not be saved yet)
  let oauthConfig = oauthState.oauthConfig
  let serverToUpdate: MCPServer | undefined

  // If config not in state, try to load from saved servers
  if (!oauthConfig) {
    let mcpServers: MCPServer[] = []
    if (window.electronAPI) {
      mcpServers = await window.electronAPI.readConfig('mcpServers.json') || []
    } else {
      mcpServers = JSON.parse(localStorage.getItem('mcpServers') || '[]')
    }

    serverToUpdate = mcpServers.find(s => s.id === oauthState.serverId)
    if (!serverToUpdate || !serverToUpdate.oauthConfig) {
      throw new Error('Server OAuth configuration not found')
    }
    oauthConfig = serverToUpdate.oauthConfig
  }

  if (!oauthConfig.tokenUrl) {
    throw new Error('OAuth configuration missing: tokenUrl is required')
  }

  // Exchange authorization code for tokens
  try {
    const tokenParams: Record<string, string> = {
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: 'jarvis://oauth/callback',
      code_verifier: oauthState.codeVerifier
    }

    // Build headers with OAuth 2.0 standard authentication
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded'
    }

    // OAuth 2.0 standard (RFC 6749 Section 2.3.1):
    // Confidential clients MUST authenticate via Basic Auth header
    // Public clients include client_id in request body
    if (oauthConfig.clientSecret) {
      // Confidential client: Use Basic Authentication with client_id:client_secret
      const clientId = oauthConfig.clientId || 'jarvis-mcp-client'
      const credentials = btoa(`${clientId}:${oauthConfig.clientSecret}`)
      headers['Authorization'] = `Basic ${credentials}`
    } else if (oauthConfig.clientId) {
      // Public client: Include client_id in body (no secret)
      tokenParams.client_id = oauthConfig.clientId
    } else {
      // Fallback: Use default client_id
      tokenParams.client_id = 'jarvis-mcp-client'
      console.warn('[OAuth] Using fallback client_id (no client configuration)')
    }

    const tokenResponse = await fetch(oauthConfig.tokenUrl, {
      method: 'POST',
      headers,
      body: new URLSearchParams(tokenParams)
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('[OAuth] Token exchange failed:', errorText)
      throw new Error(`Token exchange failed: ${tokenResponse.statusText}`)
    }

    const tokens = await tokenResponse.json()

    // Update OAuth config with tokens
    oauthConfig.accessToken = tokens.access_token
    oauthConfig.refreshToken = tokens.refresh_token

    // Store when tokens were issued (for tracking refresh token age)
    oauthConfig.tokenIssuedAt = Date.now()

    // Calculate token expiration time
    if (tokens.expires_in) {
      oauthConfig.tokenExpiresAt = Date.now() + (tokens.expires_in * 1000)
    }

    // Transition to AUTH_SUCCESS
    const machine = stateMachineManager.getMachine(oauthState.serverId)
    await machine.transition('AUTH_SUCCESS', {
      tokenExpiresAt: oauthConfig.tokenExpiresAt,
      userMessage: 'Authentication successful!'
    })

    // Save updated configuration only if server was already saved
    if (serverToUpdate) {
      let mcpServers: MCPServer[] = []
      if (window.electronAPI) {
        mcpServers = await window.electronAPI.readConfig('mcpServers.json') || []
      } else {
        mcpServers = JSON.parse(localStorage.getItem('mcpServers') || '[]')
      }

      const serverIndex = mcpServers.findIndex(s => s.id === oauthState.serverId)
      if (serverIndex !== -1) {
        mcpServers[serverIndex].oauthConfig = oauthConfig

        if (window.electronAPI) {
          await window.electronAPI.writeConfig('mcpServers.json', mcpServers)
        } else {
          localStorage.setItem('mcpServers', JSON.stringify(mcpServers))
        }
      }
    } else {
      // Update the state with tokens for the dialog to retrieve
      if (oauthState.oauthConfig) {
        oauthState.oauthConfig.accessToken = tokens.access_token
        oauthState.oauthConfig.refreshToken = tokens.refresh_token
        oauthState.oauthConfig.tokenExpiresAt = oauthConfig.tokenExpiresAt
      }
    }

    return {
      serverId: oauthState.serverId,
      tokens,
      oauthConfig // Return the updated config for the dialog
    }
  } catch (error) {
    console.error('[OAuth] Token exchange error:', error)
    throw error
  }
}

/**
 * Refreshes an expired OAuth access token
 *
 * Uses the refresh token to obtain a new access token without user interaction
 * Updates state machine with refresh progress
 *
 * @param server - MCP server with OAuth configuration and refresh token
 * @returns Updated server with new tokens
 */
export async function refreshOAuthToken(server: MCPServer): Promise<MCPServer> {
  if (!server.oauthConfig?.refreshToken) {
    throw new Error('Cannot refresh token: no refresh token available')
  }

  if (!server.oauthConfig.tokenUrl) {
    throw new Error('OAuth configuration missing: tokenUrl is required')
  }

  // Transition to TOKEN_REFRESHING if not already there
  const machine = stateMachineManager.getMachine(server.id, server.status)
  if (machine.getState() !== 'TOKEN_REFRESHING') {
    await machine.transition('TOKEN_EXPIRED', {
      userMessage: 'Refreshing authentication token...'
    })
  }

  try {
    const tokenParams: Record<string, string> = {
      grant_type: 'refresh_token',
      refresh_token: server.oauthConfig.refreshToken
    }

    // Build headers with OAuth 2.0 standard authentication
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded'
    }

    // OAuth 2.0 standard (RFC 6749 Section 2.3.1):
    // Confidential clients MUST authenticate via Basic Auth header
    // Public clients include client_id in request body
    if (server.oauthConfig.clientSecret) {
      // Confidential client: Use Basic Authentication with client_id:client_secret
      const clientId = server.oauthConfig.clientId || 'jarvis-mcp-client'
      const credentials = btoa(`${clientId}:${server.oauthConfig.clientSecret}`)
      headers['Authorization'] = `Basic ${credentials}`
    } else if (server.oauthConfig.clientId) {
      // Public client: Include client_id in body (no secret)
      tokenParams.client_id = server.oauthConfig.clientId
    } else {
      // Fallback: Use default client_id
      tokenParams.client_id = 'jarvis-mcp-client'
    }

    const tokenResponse = await fetch(server.oauthConfig.tokenUrl, {
      method: 'POST',
      headers,
      body: new URLSearchParams(tokenParams)
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('[OAuth] Token refresh failed:', errorText)

      // Special handling for 404 - usually means refresh token doesn't exist or expired
      if (tokenResponse.status === 404) {
        throw new Error('Refresh token expired or invalid. Please re-authenticate.')
      }

      // Special handling for 401 - invalid credentials
      if (tokenResponse.status === 401) {
        throw new Error('OAuth client authentication failed. Please check credentials.')
      }

      throw new Error(`Token refresh failed: ${tokenResponse.statusText}`)
    }

    const tokens = await tokenResponse.json()

    // Update tokens
    server.oauthConfig.accessToken = tokens.access_token

    // Some providers return a new refresh token (token rotation)
    if (tokens.refresh_token) {
      server.oauthConfig.refreshToken = tokens.refresh_token
      // New refresh token issued - update issuedAt timestamp
      server.oauthConfig.tokenIssuedAt = Date.now()
    }
    // If no new refresh token, keep existing tokenIssuedAt (refresh token is reused)

    // Update expiration time
    if (tokens.expires_in) {
      server.oauthConfig.tokenExpiresAt = Date.now() + (tokens.expires_in * 1000)
    }

    // Transition to REFRESH_SUCCESS (this will move to STARTING if in start sequence)
    await machine.transition('REFRESH_SUCCESS', {
      tokenExpiresAt: server.oauthConfig.tokenExpiresAt,
      userMessage: 'Token refreshed successfully'
    })

    // Persist refreshed tokens to storage
    // This ensures tokens survive app restarts and prevents using stale refresh tokens
    try {
      let mcpServers: MCPServer[] = []
      if (window.electronAPI) {
        mcpServers = await window.electronAPI.readConfig('mcpServers.json') || []
      } else {
        const stored = localStorage.getItem('mcpServers')
        mcpServers = stored ? JSON.parse(stored) : []
      }

      const serverIndex = mcpServers.findIndex(s => s.id === server.id)
      if (serverIndex !== -1) {
        // Update only the OAuth config to preserve other server properties
        mcpServers[serverIndex].oauthConfig = server.oauthConfig

        if (window.electronAPI) {
          await window.electronAPI.writeConfig('mcpServers.json', mcpServers)
        } else {
          localStorage.setItem('mcpServers', JSON.stringify(mcpServers))
        }
      }
    } catch (persistError) {
      console.error('[OAuth] Failed to persist refreshed tokens:', persistError)
      // Don't fail the refresh operation if persistence fails
    }

    return server
  } catch (error) {
    console.error('[OAuth] Token refresh error:', error)

    // Transition to REFRESH_FAILURE
    await machine.transition('REFRESH_FAILURE', {
      errorMessage: error instanceof Error ? error.message : 'Token refresh failed',
      userMessage: 'Failed to refresh authentication. Please re-authenticate.'
    })

    throw error
  }
}

/**
 * Ensures a server has a valid OAuth token, refreshing if necessary
 *
 * Checks if the token is expired or will expire soon (within 5 minutes)
 * Also checks if refresh token might be too old (30+ days)
 * Automatically refreshes if needed
 *
 * @param server - MCP server to check
 * @returns Server with valid token
 * @throws Error if refresh token is likely expired
 */
export async function ensureValidToken(server: MCPServer): Promise<MCPServer> {
  // No OAuth or no expiration time
  if (!server.oauthConfig?.tokenExpiresAt) {
    return server
  }

  // Check refresh token age (if we have tokenIssuedAt)
  // Many OAuth providers expire refresh tokens after 30 days of inactivity
  if (server.oauthConfig.tokenIssuedAt) {
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
    const tokenAge = Date.now() - server.oauthConfig.tokenIssuedAt

    if (tokenAge > THIRTY_DAYS) {
      const ageInDays = Math.floor(tokenAge / (24 * 60 * 60 * 1000))
      console.warn(`[OAuth] Refresh token is ${ageInDays} days old, may be expired`)
      console.warn('[OAuth] If refresh fails, re-authentication will be required')
    }
  }

  // Check if access token is expired or will expire soon (5 minute buffer)
  const FIVE_MINUTES = 5 * 60 * 1000
  const timeUntilExpiry = server.oauthConfig.tokenExpiresAt - Date.now()

  if (timeUntilExpiry < FIVE_MINUTES) {
    return await refreshOAuthToken(server)
  }

  return server
}
