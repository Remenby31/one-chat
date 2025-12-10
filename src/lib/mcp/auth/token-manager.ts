/**
 * Token Manager
 *
 * Manages OAuth tokens: validation, refresh, and flow orchestration.
 */

import type { StorageAdapter, BrowserAdapter } from '../adapters/types'
import type { MCPServer, MCPOAuthConfig } from '../core/types'
import type {
  OAuthTokens,
  OAuthState,
  TokenRefreshResult,
  TokenManagerOptions,
} from './types'
import { MCPAuthError, MCPErrorCode } from '../core/errors'
import { generatePKCE, generateState } from './pkce'

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<TokenManagerOptions> = {
  callbackScheme: 'mcp-app',
  refreshBuffer: 5 * 60 * 1000, // 5 minutes
  flowTimeout: 5 * 60 * 1000, // 5 minutes
}

/**
 * Token refresh scheduler for background refresh
 */
interface TokenRefreshSchedule {
  serverId: string
  timeoutId: ReturnType<typeof setTimeout>
  scheduledAt: number
}

/**
 * Pending authentication promise
 */
interface PendingAuth {
  resolve: (tokens: OAuthTokens) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

/**
 * Token refresh callback type
 */
export type TokenRefreshCallback = (serverId: string, tokens: OAuthTokens) => void | Promise<void>

/**
 * Token Manager class
 *
 * Handles OAuth token lifecycle including:
 * - Token validation and expiry checking
 * - Token refresh
 * - OAuth authorization flow
 * - Background token refresh scheduling
 */
export class TokenManager {
  private options: Required<TokenManagerOptions>
  private pendingAuth = new Map<string, PendingAuth>()
  private protocolCleanup: (() => void) | null = null
  private storage: StorageAdapter
  private browser: BrowserAdapter
  private refreshSchedules = new Map<string, TokenRefreshSchedule>()
  private refreshCallbacks = new Set<TokenRefreshCallback>()

  constructor(
    storage: StorageAdapter,
    browser: BrowserAdapter,
    options: TokenManagerOptions
  ) {
    this.storage = storage
    this.browser = browser
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /**
   * Subscribe to token refresh events
   * Called when a token is successfully refreshed in background
   */
  onTokenRefresh(callback: TokenRefreshCallback): () => void {
    this.refreshCallbacks.add(callback)
    return () => this.refreshCallbacks.delete(callback)
  }

  /**
   * Schedule background token refresh for a server
   * Will automatically refresh the token before it expires
   */
  scheduleBackgroundRefresh(server: MCPServer): void {
    const auth = server.auth
    if (!auth || auth.type !== 'oauth') return

    const tokens = auth.tokens
    if (!tokens?.expiresAt || !tokens.refreshToken) return

    // Cancel existing schedule
    this.cancelBackgroundRefresh(server.id)

    const now = Date.now()
    const refreshTime = tokens.expiresAt - this.options.refreshBuffer

    // Don't schedule if already expired or too close
    if (refreshTime <= now) return

    const delay = refreshTime - now

    const timeoutId = setTimeout(async () => {
      this.refreshSchedules.delete(server.id)
      await this.performBackgroundRefresh(server)
    }, delay)

    this.refreshSchedules.set(server.id, {
      serverId: server.id,
      timeoutId,
      scheduledAt: refreshTime,
    })
  }

  /**
   * Cancel scheduled background refresh for a server
   */
  cancelBackgroundRefresh(serverId: string): void {
    const schedule = this.refreshSchedules.get(serverId)
    if (schedule) {
      clearTimeout(schedule.timeoutId)
      this.refreshSchedules.delete(serverId)
    }
  }

  /**
   * Perform background token refresh
   */
  private async performBackgroundRefresh(server: MCPServer): Promise<void> {
    try {
      const result = await this.refreshToken(server)
      if (result.success && result.tokens) {
        // Notify callbacks
        for (const callback of this.refreshCallbacks) {
          try {
            await callback(server.id, result.tokens)
          } catch {
            // Ignore callback errors
          }
        }

        // Re-schedule next refresh if we got a new expiry
        if (result.tokens.expiresAt) {
          // Create updated server config for re-scheduling
          const updatedServer: MCPServer = {
            ...server,
            auth: {
              ...(server.auth as MCPOAuthConfig),
              tokens: result.tokens,
            },
          }
          this.scheduleBackgroundRefresh(updatedServer)
        }
      }
    } catch {
      // Background refresh failed - will be handled on next ensureValidToken call
    }
  }

  /**
   * Ensure a server has a valid token
   *
   * If the token is expired or missing, throws MCPAuthError.
   * If the token is close to expiry, attempts to refresh it.
   *
   * @returns The valid access token
   */
  async ensureValidToken(server: MCPServer): Promise<string> {
    const auth = server.auth
    if (!auth || auth.type !== 'oauth') {
      throw new MCPAuthError('Server does not use OAuth', MCPErrorCode.AUTH_REQUIRED, {
        serverId: server.id,
      })
    }

    const tokens = auth.tokens
    if (!tokens?.accessToken) {
      throw new MCPAuthError('No access token available', MCPErrorCode.AUTH_REQUIRED, {
        serverId: server.id,
      })
    }

    // Check if token is expired or close to expiry
    if (tokens.expiresAt) {
      const now = Date.now()
      const bufferTime = this.options.refreshBuffer

      if (now >= tokens.expiresAt) {
        // Token is expired
        throw new MCPAuthError('Token has expired', MCPErrorCode.TOKEN_EXPIRED, {
          serverId: server.id,
        })
      }

      if (now >= tokens.expiresAt - bufferTime) {
        // Token is close to expiry, try to refresh
        if (tokens.refreshToken) {
          const refreshResult = await this.refreshToken(server)
          if (refreshResult.success && refreshResult.tokens) {
            return refreshResult.tokens.accessToken
          }
          // Refresh failed, but current token is still valid
        }
      }
    }

    return tokens.accessToken
  }

  /**
   * Check if a server needs authentication
   */
  needsAuth(server: MCPServer): boolean {
    const auth = server.auth
    if (!auth || auth.type !== 'oauth') {
      return false
    }

    const tokens = auth.tokens
    if (!tokens?.accessToken) {
      return true
    }

    // Check expiry
    if (tokens.expiresAt && Date.now() >= tokens.expiresAt) {
      // Check if we can refresh
      if (!tokens.refreshToken) {
        return true
      }
    }

    return false
  }

  /**
   * Start the OAuth authorization flow
   *
   * Opens the browser to the authorization URL and returns a promise
   * that resolves when the callback is received.
   */
  async authenticate(server: MCPServer): Promise<OAuthTokens> {
    const auth = server.auth as MCPOAuthConfig | undefined
    if (!auth || auth.type !== 'oauth') {
      throw new MCPAuthError('Server does not use OAuth', MCPErrorCode.AUTH_REQUIRED, {
        serverId: server.id,
      })
    }

    if (!auth.authUrl || !auth.tokenUrl) {
      throw new MCPAuthError('OAuth configuration incomplete', MCPErrorCode.AUTH_REQUIRED, {
        serverId: server.id,
      })
    }

    // Generate PKCE pair
    const pkce = await generatePKCE()

    // Generate state for CSRF protection
    const state = generateState()

    // Build redirect URI
    const redirectUri = `${this.options.callbackScheme}://oauth/callback`

    // Store OAuth state
    const oauthState: OAuthState = {
      serverId: server.id,
      codeVerifier: pkce.codeVerifier,
      expiresAt: Date.now() + this.options.flowTimeout,
      redirectUri,
    }
    await this.storage.write(`oauth_state_${state}`, oauthState)

    // Build authorization URL
    const authUrl = this.buildAuthUrl(auth, pkce.codeChallenge, state, redirectUri)

    // Set up protocol handler if not already done
    this.ensureProtocolHandler()

    // Create pending auth promise
    return new Promise<OAuthTokens>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingAuth.delete(state)
        this.storage.delete(`oauth_state_${state}`)
        reject(new MCPAuthError('OAuth flow timed out', MCPErrorCode.OAUTH_TIMEOUT, {
          serverId: server.id,
        }))
      }, this.options.flowTimeout)

      this.pendingAuth.set(state, { resolve, reject, timeoutId })

      // Open browser
      this.browser.open(authUrl).catch((error) => {
        this.pendingAuth.delete(state)
        clearTimeout(timeoutId)
        reject(new MCPAuthError(
          `Failed to open browser: ${error.message}`,
          MCPErrorCode.OAUTH_DISCOVERY_FAILED,
          { serverId: server.id }
        ))
      })
    })
  }

  /**
   * Handle OAuth callback URL
   *
   * Called when the callback URL is received (e.g., from custom protocol handler).
   */
  async handleCallback(callbackUrl: string): Promise<void> {
    const url = new URL(callbackUrl)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    // Check for error response
    if (error) {
      const errorDescription = url.searchParams.get('error_description') || error
      const pending = state ? this.pendingAuth.get(state) : null
      if (pending) {
        clearTimeout(pending.timeoutId)
        this.pendingAuth.delete(state!)
        pending.reject(new MCPAuthError(errorDescription, MCPErrorCode.AUTH_FAILED))
      }
      return
    }

    if (!code || !state) {
      throw new MCPAuthError('Invalid callback: missing code or state', MCPErrorCode.OAUTH_CALLBACK_INVALID)
    }

    // Get stored state
    const storedState = await this.storage.read<OAuthState>(`oauth_state_${state}`)
    if (!storedState) {
      throw new MCPAuthError('Invalid state: not found', MCPErrorCode.OAUTH_STATE_INVALID)
    }

    // Check expiry
    if (Date.now() >= storedState.expiresAt) {
      await this.storage.delete(`oauth_state_${state}`)
      throw new MCPAuthError('OAuth state expired', MCPErrorCode.OAUTH_STATE_INVALID)
    }

    // Get pending auth promise
    const pending = this.pendingAuth.get(state)
    if (!pending) {
      await this.storage.delete(`oauth_state_${state}`)
      throw new MCPAuthError('No pending authentication for state', MCPErrorCode.OAUTH_STATE_INVALID)
    }

    try {
      // Exchange code for tokens
      const tokens = await this.exchangeCode(
        code,
        storedState.codeVerifier,
        storedState.redirectUri,
        storedState.serverId
      )

      // Cleanup
      clearTimeout(pending.timeoutId)
      this.pendingAuth.delete(state)
      await this.storage.delete(`oauth_state_${state}`)

      // Resolve the pending promise
      pending.resolve(tokens)
    } catch (error) {
      clearTimeout(pending.timeoutId)
      this.pendingAuth.delete(state)
      await this.storage.delete(`oauth_state_${state}`)
      pending.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }

  /**
   * Refresh an expired token
   */
  async refreshToken(server: MCPServer): Promise<TokenRefreshResult> {
    const auth = server.auth as MCPOAuthConfig | undefined
    if (!auth || auth.type !== 'oauth') {
      return { success: false, error: 'Server does not use OAuth' }
    }

    const tokens = auth.tokens
    if (!tokens?.refreshToken) {
      return { success: false, error: 'No refresh token available' }
    }

    if (!auth.tokenUrl) {
      return { success: false, error: 'No token URL configured' }
    }

    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
      })

      if (auth.clientId) {
        params.set('client_id', auth.clientId)
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      }

      // Use Basic auth if we have client secret
      if (auth.clientId && auth.clientSecret) {
        const credentials = btoa(`${auth.clientId}:${auth.clientSecret}`)
        headers['Authorization'] = `Basic ${credentials}`
      }

      const response = await fetch(auth.tokenUrl, {
        method: 'POST',
        headers,
        body: params.toString(),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        return { success: false, error: `Token refresh failed: ${response.status} ${errorBody}` }
      }

      const tokenResponse = await response.json()

      const newTokens: OAuthTokens = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || tokens.refreshToken,
        tokenType: tokenResponse.token_type || 'Bearer',
        expiresAt: tokenResponse.expires_in
          ? Date.now() + tokenResponse.expires_in * 1000
          : undefined,
        scope: tokenResponse.scope,
      }

      return { success: true, tokens: newTokens }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Token refresh failed',
      }
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    // Clear all pending auth
    this.pendingAuth.forEach((pending) => {
      clearTimeout(pending.timeoutId)
      pending.reject(new MCPAuthError('Token manager disposed', MCPErrorCode.AUTH_FAILED))
    })
    this.pendingAuth.clear()

    // Clear all refresh schedules
    this.refreshSchedules.forEach((schedule) => {
      clearTimeout(schedule.timeoutId)
    })
    this.refreshSchedules.clear()
    this.refreshCallbacks.clear()

    // Cleanup protocol handler
    if (this.protocolCleanup) {
      this.protocolCleanup()
      this.protocolCleanup = null
    }
  }

  /**
   * Get scheduled refresh info for a server
   */
  getScheduledRefresh(serverId: string): { scheduledAt: number } | null {
    const schedule = this.refreshSchedules.get(serverId)
    return schedule ? { scheduledAt: schedule.scheduledAt } : null
  }

  /**
   * Check if a server has a scheduled refresh
   */
  hasScheduledRefresh(serverId: string): boolean {
    return this.refreshSchedules.has(serverId)
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private buildAuthUrl(
    config: MCPOAuthConfig,
    codeChallenge: string,
    state: string,
    redirectUri: string
  ): string {
    const params = new URLSearchParams({
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      redirect_uri: redirectUri,
    })

    if (config.clientId) {
      params.set('client_id', config.clientId)
    }

    if (config.scopes && config.scopes.length > 0) {
      params.set('scope', config.scopes.join(' '))
    }

    return `${config.authUrl}?${params.toString()}`
  }

  private async exchangeCode(
    code: string,
    codeVerifier: string,
    redirectUri: string,
    serverId: string
  ): Promise<OAuthTokens> {
    // We need to get the server config to get tokenUrl and client credentials
    // This is a bit awkward - the caller should pass the full config
    // For now, we'll need to read from storage
    const servers = await this.storage.readConfig<MCPServer[]>('mcpServers.json')
    const server = servers?.find((s) => s.id === serverId)

    if (!server) {
      throw new MCPAuthError('Server not found', MCPErrorCode.SERVER_NOT_FOUND, { serverId })
    }

    const auth = server.auth as MCPOAuthConfig | undefined
    if (!auth || auth.type !== 'oauth' || !auth.tokenUrl) {
      throw new MCPAuthError('Invalid OAuth config', MCPErrorCode.AUTH_REQUIRED, { serverId })
    }

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    })

    if (auth.clientId) {
      params.set('client_id', auth.clientId)
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    }

    // Use Basic auth if we have client secret
    if (auth.clientId && auth.clientSecret) {
      const credentials = btoa(`${auth.clientId}:${auth.clientSecret}`)
      headers['Authorization'] = `Basic ${credentials}`
    }

    const response = await fetch(auth.tokenUrl, {
      method: 'POST',
      headers,
      body: params.toString(),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new MCPAuthError(
        `Code exchange failed: ${response.status} ${errorBody}`,
        MCPErrorCode.OAUTH_CODE_EXCHANGE_FAILED,
        { serverId }
      )
    }

    const tokenResponse = await response.json()

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      tokenType: tokenResponse.token_type || 'Bearer',
      expiresAt: tokenResponse.expires_in
        ? Date.now() + tokenResponse.expires_in * 1000
        : undefined,
      scope: tokenResponse.scope,
    }
  }

  private ensureProtocolHandler(): void {
    if (this.protocolCleanup) {
      return
    }

    this.protocolCleanup = this.browser.registerProtocolHandler(
      this.options.callbackScheme,
      (url: string) => {
        this.handleCallback(url).catch((error) => {
          console.error('[TokenManager] Callback handling failed:', error)
        })
      }
    )
  }
}
