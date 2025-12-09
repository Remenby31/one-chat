/**
 * PKCE (Proof Key for Code Exchange) Utilities
 *
 * Implements RFC 7636 for OAuth 2.0 public clients.
 */

import type { PKCEPair } from './types'

/**
 * Generate a cryptographically random string for code verifier
 *
 * @param length Length of the verifier (43-128 characters per RFC 7636)
 */
export function generateCodeVerifier(length = 64): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)

  let result = ''
  for (let i = 0; i < length; i++) {
    result += charset[randomValues[i] % charset.length]
  }

  return result
}

/**
 * Generate a code challenge from a code verifier using SHA-256
 *
 * @param verifier The code verifier
 * @returns Base64URL encoded SHA-256 hash
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(hashBuffer)
}

/**
 * Generate a PKCE pair (verifier + challenge)
 */
export async function generatePKCE(): Promise<PKCEPair> {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  return {
    codeVerifier,
    codeChallenge,
  }
}

/**
 * Base64URL encode an ArrayBuffer
 *
 * Per RFC 4648 Section 5:
 * - Uses - instead of +
 * - Uses _ instead of /
 * - No padding (=)
 */
export function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }

  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Base64URL decode to ArrayBuffer
 */
export function base64UrlDecode(str: string): ArrayBuffer {
  // Add padding back
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = base64.length % 4
  if (padding) {
    base64 += '='.repeat(4 - padding)
  }

  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes.buffer
}

/**
 * Generate a random state string for CSRF protection
 */
export function generateState(): string {
  return crypto.randomUUID()
}
