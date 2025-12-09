/**
 * Memory Storage Adapter
 *
 * In-memory storage for testing and development.
 */

import type { StorageAdapter } from '../types'

/**
 * Storage adapter using in-memory Map
 *
 * Useful for:
 * - Unit testing
 * - Development without Electron
 * - SSR environments
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private data = new Map<string, unknown>()
  private configData = new Map<string, unknown>()
  private listeners = new Map<string, Set<(data: unknown) => void>>()

  /**
   * Read a value from storage
   */
  async read<T>(key: string): Promise<T | null> {
    return (this.data.get(key) as T) ?? null
  }

  /**
   * Write a value to storage
   */
  async write<T>(key: string, data: T): Promise<void> {
    this.data.set(key, data)
  }

  /**
   * Delete a value from storage
   */
  async delete(key: string): Promise<void> {
    this.data.delete(key)
  }

  /**
   * Read a configuration file
   */
  async readConfig<T>(filename: string): Promise<T | null> {
    return (this.configData.get(filename) as T) ?? null
  }

  /**
   * Write a configuration file
   */
  async writeConfig<T>(filename: string, data: T): Promise<void> {
    this.configData.set(filename, data)

    // Notify listeners
    const fileListeners = this.listeners.get(filename)
    if (fileListeners) {
      fileListeners.forEach((callback) => callback(data))
    }
  }

  /**
   * Watch for changes to a configuration file
   */
  watchConfig(filename: string, callback: (data: unknown) => void): () => void {
    let fileListeners = this.listeners.get(filename)
    if (!fileListeners) {
      fileListeners = new Set()
      this.listeners.set(filename, fileListeners)
    }

    fileListeners.add(callback)

    return () => {
      fileListeners?.delete(callback)
      if (fileListeners?.size === 0) {
        this.listeners.delete(filename)
      }
    }
  }

  /**
   * Clear all data (useful for testing)
   */
  clear(): void {
    this.data.clear()
    this.configData.clear()
  }

  /**
   * Get all stored keys (useful for debugging)
   */
  getKeys(): { data: string[]; config: string[] } {
    return {
      data: Array.from(this.data.keys()),
      config: Array.from(this.configData.keys()),
    }
  }
}
