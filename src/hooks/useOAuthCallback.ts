import { useEffect } from 'react'
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
        // Process the OAuth callback
        const { serverId, oauthConfig } = await handleOAuthCallback(url)
        onSuccess(serverId, oauthConfig)
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
  }, [onSuccess, onError])
}
