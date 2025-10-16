import { useEffect, useRef } from 'react'
import { handleOAuthCallback } from '@/lib/mcpAuth'

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
 * @param onSuccess - Callback when OAuth flow completes successfully, receives serverId and oauthConfig
 * @param onError - Callback when OAuth flow fails
 */
export function useOAuthCallback(
  onSuccess: (serverId: string, oauthConfig: import('@/types/mcp').MCPOAuthConfig) => void,
  onError: (error: Error) => void
) {
  const listenerIdRef = useRef(`listener-${Math.random().toString(36).substring(7)}`)

  useEffect(() => {
    // Only works in Electron environment
    if (!window.electronAPI?.onOAuthCallback) {
      console.log('[useOAuthCallback] Not in Electron environment, skipping')
      return
    }

    console.log('[useOAuthCallback] Registering OAuth callback listener:', listenerIdRef.current)

    // Register listener for OAuth callbacks
    const cleanup = window.electronAPI.onOAuthCallback(async (url: string) => {
      console.log('[useOAuthCallback]', listenerIdRef.current, 'OAuth callback received:', url)

      // Prevent duplicate processing from multiple listeners
      if (processingCallbacks.has(url)) {
        console.log('[useOAuthCallback]', listenerIdRef.current, 'Already processing this callback, skipping')
        return
      }

      processingCallbacks.add(url)
      console.log('[useOAuthCallback]', listenerIdRef.current, 'Processing callback (locked)')

      try {
        // Process the OAuth callback
        const { serverId, oauthConfig } = await handleOAuthCallback(url)
        console.log('[useOAuthCallback]', listenerIdRef.current, 'OAuth flow completed successfully for server:', serverId)
        console.log('[useOAuthCallback]', listenerIdRef.current, 'Received OAuth config with tokens:', {
          hasAccessToken: !!oauthConfig.accessToken,
          hasRefreshToken: !!oauthConfig.refreshToken
        })
        onSuccess(serverId, oauthConfig)
      } catch (error) {
        console.error('[useOAuthCallback]', listenerIdRef.current, 'OAuth callback error:', error)
        onError(error as Error)
      } finally {
        // Remove from processing set after a delay to prevent immediate re-processing
        setTimeout(() => {
          processingCallbacks.delete(url)
          console.log('[useOAuthCallback]', listenerIdRef.current, 'Released callback lock')
        }, 1000)
      }
    })

    // Cleanup on unmount
    return () => {
      console.log('[useOAuthCallback]', listenerIdRef.current, 'Cleaning up OAuth callback listener')
      cleanup()
    }
  }, [onSuccess, onError])
}
