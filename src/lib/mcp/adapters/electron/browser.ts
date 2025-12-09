/**
 * Electron Browser Adapter
 *
 * Uses Electron shell.openExternal and custom protocol handling.
 */

import type { BrowserAdapter } from '../types'

/**
 * Electron API interface for browser operations
 */
interface ElectronBrowserAPI {
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>
  onOAuthCallback: (callback: (url: string) => void) => () => void
}

/**
 * Get the Electron API from the window object
 */
function getElectronAPI(): ElectronBrowserAPI {
  const api = (window as unknown as { electronAPI?: ElectronBrowserAPI }).electronAPI
  if (!api) {
    throw new Error('ElectronBrowserAdapter requires Electron environment with electronAPI exposed')
  }
  return api
}

/**
 * Browser adapter using Electron APIs
 */
export class ElectronBrowserAdapter implements BrowserAdapter {
  private protocolHandlers = new Map<string, Set<(url: string) => void>>()
  private globalCleanup: (() => void) | null = null

  /**
   * Open a URL in the system default browser
   */
  async open(url: string): Promise<void> {
    const api = getElectronAPI()
    const result = await api.openExternal(url)

    if (!result.success) {
      throw new Error(result.error || 'Failed to open URL')
    }
  }

  /**
   * Register a custom protocol handler for OAuth callbacks
   *
   * Note: In Electron, the protocol is registered at the app level.
   * This method sets up a listener for when URLs with the scheme are received.
   */
  registerProtocolHandler(scheme: string, callback: (url: string) => void): () => void {
    // Get or create handler set for this scheme
    let handlers = this.protocolHandlers.get(scheme)
    if (!handlers) {
      handlers = new Set()
      this.protocolHandlers.set(scheme, handlers)
    }

    handlers.add(callback)

    // Set up global OAuth callback listener if not already done
    if (!this.globalCleanup) {
      const api = getElectronAPI()
      this.globalCleanup = api.onOAuthCallback((url: string) => {
        // Extract scheme from URL
        const urlScheme = url.split(':')[0]
        const schemeHandlers = this.protocolHandlers.get(urlScheme)

        if (schemeHandlers) {
          schemeHandlers.forEach((handler) => handler(url))
        }
      })
    }

    // Return cleanup function
    return () => {
      handlers?.delete(callback)

      // If no more handlers for this scheme, remove the set
      if (handlers?.size === 0) {
        this.protocolHandlers.delete(scheme)
      }

      // If no more handlers at all, cleanup global listener
      if (this.protocolHandlers.size === 0 && this.globalCleanup) {
        this.globalCleanup()
        this.globalCleanup = null
      }
    }
  }
}
