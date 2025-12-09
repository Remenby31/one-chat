/**
 * Electron Storage Adapter
 *
 * Uses Electron IPC to persist data via the main process.
 */

import type { StorageAdapter } from '../types'

/**
 * Electron API interface (exposed via preload script)
 */
interface ElectronAPI {
  readConfig: <T>(filename: string) => Promise<T | null>
  writeConfig: <T>(filename: string, data: T) => Promise<boolean>
  onConfigChanged: (callback: (filename: string, data: unknown) => void) => () => void
}

/**
 * Get the Electron API from the window object
 */
function getElectronAPI(): ElectronAPI {
  const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI
  if (!api) {
    throw new Error('ElectronStorageAdapter requires Electron environment with electronAPI exposed')
  }
  return api
}

/**
 * Storage adapter using Electron IPC
 */
export class ElectronStorageAdapter implements StorageAdapter {
  private memoryCache = new Map<string, unknown>()

  /**
   * Read a value from storage (uses memory cache for non-config data)
   */
  async read<T>(key: string): Promise<T | null> {
    // For simple key-value storage, use memory cache
    // This is for session data like OAuth states
    return (this.memoryCache.get(key) as T) ?? null
  }

  /**
   * Write a value to storage
   */
  async write<T>(key: string, data: T): Promise<void> {
    this.memoryCache.set(key, data)
  }

  /**
   * Delete a value from storage
   */
  async delete(key: string): Promise<void> {
    this.memoryCache.delete(key)
  }

  /**
   * Read a configuration file via Electron IPC
   */
  async readConfig<T>(filename: string): Promise<T | null> {
    const api = getElectronAPI()
    return api.readConfig<T>(filename)
  }

  /**
   * Write a configuration file via Electron IPC
   */
  async writeConfig<T>(filename: string, data: T): Promise<void> {
    const api = getElectronAPI()
    await api.writeConfig(filename, data)
  }

  /**
   * Watch for changes to a configuration file
   */
  watchConfig(filename: string, callback: (data: unknown) => void): () => void {
    const api = getElectronAPI()
    return api.onConfigChanged((changedFilename, data) => {
      if (changedFilename === filename) {
        callback(data)
      }
    })
  }
}
