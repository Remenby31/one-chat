import { useEffect } from 'react'
import type { MCPOAuthConfig } from '@/types/mcp'

// Global flag to prevent duplicate callback processing
const processingCallbacks = new Set<string>()

/**
 * React hook to listen for OAuth callbacks from the custom protocol handler
 *
 * When the user completes OAuth authentication in their browser,
 * they are redirected to jarvis://oauth/callback?code=xxx&state=xxx
 *
 * This hook listens for those redirects and processes them automatically.
 *
 * @param onSuccess - Callback when OAuth flow completes successfully, receives serverId and tokens
 * @param onError - Callback when OAuth flow fails
 * @param oauthConfig - OAuth configuration for token exchange
 */
export function useOAuthCallback(
  onSuccess: (serverId: string, oauthConfig: MCPOAuthConfig) => void,
  onError: (error: Error) => void,
  oauthConfig?: MCPOAuthConfig
) {
  useEffect(() => {
    // Only works in Electron environment
    if (!window.electronAPI?.onOAuthCallback) {
      return
    }

    // Register listener for OAuth callbacks
    const cleanup = window.electronAPI.onOAuthCallback(async (url: string) => {
      // Prevent duplicate processing from multiple listeners
      if (processingCallbacks.has(url)) {
        return
      }

      processingCallbacks.add(url)

      try {
        // Parse the callback URL
        const callbackUrl = new URL(url)
        const code = callbackUrl.searchParams.get('code')
        const state = callbackUrl.searchParams.get('state')
        const error = callbackUrl.searchParams.get('error')
        const errorDescription = callbackUrl.searchParams.get('error_description')

        // Check for OAuth errors
        if (error) {
          throw new Error(`OAuth error: ${errorDescription || error}`)
        }

        if (!code || !state) {
          throw new Error('Invalid OAuth callback: missing code or state')
        }

        // Exchange the code for tokens via IPC
        if (!window.electronAPI?.mcpExchangeOAuthCode) {
          throw new Error('OAuth functionality requires Electron')
        }

        if (!oauthConfig) {
          throw new Error('OAuth configuration not provided')
        }

        const result = await window.electronAPI.mcpExchangeOAuthCode(code, state, oauthConfig)

        if (!result.success) {
          throw new Error(result.error || 'Failed to exchange OAuth code')
        }

        // Build updated OAuth config with tokens
        const updatedConfig: MCPOAuthConfig = {
          ...oauthConfig,
          accessToken: result.tokens.access_token,
          refreshToken: result.tokens.refresh_token,
          tokenExpiresAt: result.tokens.expires_in
            ? Date.now() + result.tokens.expires_in * 1000
            : undefined,
          tokenIssuedAt: Date.now(),
        }

        onSuccess(result.serverId || 'unknown', updatedConfig)
      } catch (error) {
        console.error('[useOAuthCallback] OAuth callback error:', error)
        onError(error as Error)
      } finally {
        // Remove from processing set after a delay to prevent immediate re-processing
        setTimeout(() => {
          processingCallbacks.delete(url)
        }, 1000)
      }
    })

    // Cleanup on unmount
    return () => {
      cleanup()
    }
  }, [onSuccess, onError, oauthConfig])
}
