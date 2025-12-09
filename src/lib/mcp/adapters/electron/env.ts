/**
 * Electron Environment Adapter
 *
 * Uses Electron IPC to resolve environment variables from the main process.
 */

import type { EnvAdapter } from '../types'

/**
 * Electron API interface for environment operations
 */
interface ElectronEnvAPI {
  resolveEnv: (value: string) => Promise<string>
  listEnv: () => Promise<Record<string, string>>
}

/**
 * Get the Electron API from the window object
 */
function getElectronAPI(): ElectronEnvAPI {
  const api = (window as unknown as { electronAPI?: ElectronEnvAPI }).electronAPI
  if (!api) {
    throw new Error('ElectronEnvAdapter requires Electron environment with electronAPI exposed')
  }
  return api
}

/**
 * Environment adapter using Electron IPC
 */
export class ElectronEnvAdapter implements EnvAdapter {
  private cache = new Map<string, string>()

  /**
   * Get an environment variable value
   */
  async get(name: string): Promise<string | undefined> {
    // Check cache first
    if (this.cache.has(name)) {
      return this.cache.get(name)
    }

    const api = getElectronAPI()
    const value = await api.resolveEnv(`$${name}`)

    // If the value is the same as the input, the env var doesn't exist
    if (value === `$${name}`) {
      return undefined
    }

    // Cache the value
    this.cache.set(name, value)
    return value
  }

  /**
   * Resolve a value that may be an env var reference ($VAR_NAME)
   */
  async resolve(value: string): Promise<string> {
    // If not an env var reference, return as-is
    if (!value.startsWith('$')) {
      return value
    }

    const envVarName = value.slice(1)

    // Check cache first
    if (this.cache.has(envVarName)) {
      return this.cache.get(envVarName)!
    }

    const api = getElectronAPI()
    const resolved = await api.resolveEnv(value)

    // Cache if resolved successfully
    if (resolved !== value) {
      this.cache.set(envVarName, resolved)
    }

    return resolved
  }

  /**
   * List all environment variables matching a filter
   */
  async list(filter?: (name: string) => boolean): Promise<Record<string, string>> {
    const api = getElectronAPI()
    const allEnvVars = await api.listEnv()

    if (!filter) {
      return allEnvVars
    }

    // Filter the results
    const filtered: Record<string, string> = {}
    for (const [name, value] of Object.entries(allEnvVars)) {
      if (filter(name)) {
        filtered[name] = value
      }
    }

    return filtered
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear()
  }
}
