/**
 * MCP Auth Types
 *
 * Types for OAuth authentication flows.
 */

/**
 * OAuth configuration discovered from server
 */
export interface OAuthDiscoveryResult {
  success: boolean
  config?: OAuthConfig
  error?: string
}

/**
 * OAuth configuration
 */
export interface OAuthConfig {
  /** OAuth client ID (from DCR or manual config) */
  clientId?: string

  /** OAuth client secret (from DCR) */
  clientSecret?: string

  /** Authorization endpoint URL */
  authUrl: string

  /** Token endpoint URL */
  tokenUrl: string

  /** Requested scopes */
  scopes: string[]

  /** Registration access token (for DCR management) */
  registrationAccessToken?: string
}

/**
 * OAuth tokens
 */
export interface OAuthTokens {
  /** Access token */
  accessToken: string

  /** Refresh token */
  refreshToken?: string

  /** Token type (usually "Bearer") */
  tokenType: string

  /** Expiration timestamp (ms) */
  expiresAt?: number

  /** Granted scopes */
  scope?: string
}

/**
 * OAuth state (for CSRF protection during flow)
 */
export interface OAuthState {
  /** Server ID this state is for */
  serverId: string

  /** PKCE code verifier */
  codeVerifier: string

  /** When this state expires */
  expiresAt: number

  /** Redirect URI used */
  redirectUri: string
}

/**
 * PKCE pair
 */
export interface PKCEPair {
  /** Code verifier (random string) */
  codeVerifier: string

  /** Code challenge (SHA-256 hash of verifier, base64url encoded) */
  codeChallenge: string
}

/**
 * Token refresh result
 */
export interface TokenRefreshResult {
  success: boolean
  tokens?: OAuthTokens
  error?: string
}

/**
 * Authorization server metadata (RFC 8414)
 */
export interface AuthServerMetadata {
  /** Issuer identifier */
  issuer: string

  /** Authorization endpoint URL */
  authorization_endpoint: string

  /** Token endpoint URL */
  token_endpoint: string

  /** Registration endpoint URL (for DCR) */
  registration_endpoint?: string

  /** Supported scopes */
  scopes_supported?: string[]

  /** Supported response types */
  response_types_supported?: string[]

  /** Supported grant types */
  grant_types_supported?: string[]

  /** Supported code challenge methods */
  code_challenge_methods_supported?: string[]

  /** Token endpoint auth methods */
  token_endpoint_auth_methods_supported?: string[]
}

/**
 * Protected resource metadata (RFC 8707)
 */
export interface ResourceMetadata {
  /** Resource identifier */
  resource: string

  /** Authorization servers */
  authorization_servers?: string[]
}

/**
 * Dynamic client registration response (RFC 7591)
 */
export interface DCRResponse {
  /** Client ID */
  client_id: string

  /** Client secret (if confidential client) */
  client_secret?: string

  /** When client secret expires */
  client_secret_expires_at?: number

  /** Registration access token for client management */
  registration_access_token?: string

  /** Granted redirect URIs */
  redirect_uris?: string[]

  /** Granted grant types */
  grant_types?: string[]

  /** Granted response types */
  response_types?: string[]

  /** Token endpoint auth method */
  token_endpoint_auth_method?: string
}

/**
 * Token manager options
 */
export interface TokenManagerOptions {
  /** Custom protocol scheme for OAuth callbacks (e.g., 'jarvis', 'myapp') */
  callbackScheme: string

  /** Token refresh buffer time in ms (refresh if token expires within this time) */
  refreshBuffer?: number

  /** OAuth flow timeout in ms */
  flowTimeout?: number
}
