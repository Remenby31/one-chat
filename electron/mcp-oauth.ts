/**
 * MCP OAuth Provider
 *
 * Implements OAuthClientProvider interface from the SDK for OAuth-protected MCP servers.
 * Handles PKCE flow, token storage, and refresh.
 */

import type {
  OAuthClientProvider,
  OAuthTokens,
  OAuthClientInformation,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { shell } from 'electron';
import * as crypto from 'crypto';

export interface MCPOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  authUrl?: string;
  tokenUrl?: string;
  scopes?: string[];
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  tokenIssuedAt?: number;
}

interface OAuthState {
  serverId: string;
  codeVerifier: string;
  timestamp: number;
}

// In-memory storage for OAuth states (PKCE verifiers)
const oauthStates = new Map<string, OAuthState>();

/**
 * Generate a cryptographically random code verifier for PKCE
 */
function generateCodeVerifier(): string {
  const buffer = crypto.randomBytes(32);
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate code challenge from verifier using SHA-256
 */
function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * OAuth Client Provider for MCP servers
 *
 * This class implements the OAuthClientProvider interface required by the SDK
 * for connecting to OAuth-protected MCP servers.
 */
export class ElectronOAuthProvider implements OAuthClientProvider {
  private serverId: string;
  private config: MCPOAuthConfig;
  private storedCodeVerifier: string | undefined;
  private onTokensUpdated?: (tokens: OAuthTokens) => void;

  constructor(
    serverId: string,
    config: MCPOAuthConfig,
    onTokensUpdated?: (tokens: OAuthTokens) => void
  ) {
    this.serverId = serverId;
    this.config = config;
    this.onTokensUpdated = onTokensUpdated;
  }

  /**
   * The redirect URL for OAuth callbacks
   */
  get redirectUrl(): string {
    return 'jarvis://oauth/callback';
  }

  /**
   * Get stored OAuth tokens
   */
  async tokens(): Promise<OAuthTokens | undefined> {
    if (!this.config.accessToken) {
      return undefined;
    }

    return {
      access_token: this.config.accessToken,
      refresh_token: this.config.refreshToken,
      token_type: 'Bearer',
      expires_in: this.config.tokenExpiresAt
        ? Math.floor((this.config.tokenExpiresAt - Date.now()) / 1000)
        : undefined,
    };
  }

  /**
   * Save OAuth tokens after successful authorization
   */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this.config.accessToken = tokens.access_token;
    this.config.refreshToken = tokens.refresh_token;

    if (tokens.expires_in) {
      this.config.tokenExpiresAt = Date.now() + tokens.expires_in * 1000;
    }

    this.config.tokenIssuedAt = Date.now();

    // Notify callback to persist tokens
    if (this.onTokensUpdated) {
      this.onTokensUpdated(tokens);
    }

    console.log(`[MCP-OAuth] Tokens saved for server ${this.serverId}`);
  }

  /**
   * Redirect user to authorization URL
   */
  async redirectToAuthorization(url: URL): Promise<void> {
    console.log(`[MCP-OAuth] Redirecting to authorization: ${url.toString()}`);
    await shell.openExternal(url.toString());
  }

  /**
   * Save PKCE code verifier before redirect
   */
  async saveCodeVerifier(verifier: string): Promise<void> {
    this.storedCodeVerifier = verifier;

    // Also store in map for callback handling
    oauthStates.set(this.serverId, {
      serverId: this.serverId,
      codeVerifier: verifier,
      timestamp: Date.now(),
    });

    console.log(`[MCP-OAuth] Code verifier saved for server ${this.serverId}`);
  }

  /**
   * Retrieve stored code verifier for token exchange
   */
  async codeVerifier(): Promise<string> {
    if (this.storedCodeVerifier) {
      return this.storedCodeVerifier;
    }

    const state = oauthStates.get(this.serverId);
    if (state) {
      return state.codeVerifier;
    }

    throw new Error('No code verifier found');
  }

  /**
   * Get client information for OAuth requests
   */
  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    if (!this.config.clientId) {
      return undefined;
    }

    return {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    };
  }

  /**
   * Save client information from dynamic registration
   */
  async saveClientInformation(info: OAuthClientInformation): Promise<void> {
    this.config.clientId = info.client_id;
    this.config.clientSecret = info.client_secret;
    console.log(`[MCP-OAuth] Client information saved for server ${this.serverId}`);
  }
}

/**
 * Start OAuth flow manually (for servers that need explicit OAuth initiation)
 */
export async function startOAuthFlow(
  serverId: string,
  config: MCPOAuthConfig
): Promise<{ state: string; codeVerifier: string }> {
  if (!config.authUrl) {
    throw new Error('OAuth configuration missing: authUrl is required');
  }

  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // Generate state parameter for CSRF protection
  const state = crypto.randomUUID();

  // Store state for callback
  oauthStates.set(state, {
    serverId,
    codeVerifier,
    timestamp: Date.now(),
  });

  // Build authorization URL
  const authUrl = new URL(config.authUrl);
  authUrl.searchParams.set('client_id', config.clientId || 'jarvis-mcp-client');
  authUrl.searchParams.set('redirect_uri', 'jarvis://oauth/callback');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  if (config.scopes && config.scopes.length > 0) {
    authUrl.searchParams.set('scope', config.scopes.join(' '));
  }

  // Open in browser
  await shell.openExternal(authUrl.toString());

  console.log(`[MCP-OAuth] OAuth flow started for server ${serverId}`);

  return { state, codeVerifier };
}

/**
 * Handle OAuth callback and exchange code for tokens
 */
export async function handleOAuthCallback(
  callbackUrl: string
): Promise<{
  serverId: string;
  tokens: OAuthTokens;
  config: MCPOAuthConfig;
}> {
  const url = new URL(callbackUrl);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  // Check for OAuth errors
  if (error) {
    throw new Error(`OAuth error: ${errorDescription || error}`);
  }

  if (!code || !state) {
    throw new Error('Invalid OAuth callback: missing code or state');
  }

  // Retrieve stored state
  const oauthState = oauthStates.get(state);
  if (!oauthState) {
    throw new Error('Invalid or expired OAuth state');
  }

  // Check state expiry (10 minutes)
  if (Date.now() - oauthState.timestamp > 10 * 60 * 1000) {
    oauthStates.delete(state);
    throw new Error('OAuth state expired');
  }

  // Clean up state
  oauthStates.delete(state);

  // We need the token URL from the server config
  // This should be passed when the OAuth flow was initiated
  // For now, return partial result - the renderer will complete the token exchange
  console.log(`[MCP-OAuth] Callback received for server ${oauthState.serverId}`);

  return {
    serverId: oauthState.serverId,
    tokens: {} as OAuthTokens, // Will be filled by renderer
    config: {} as MCPOAuthConfig,
  };
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  config: MCPOAuthConfig
): Promise<OAuthTokens> {
  if (!config.tokenUrl) {
    throw new Error('OAuth configuration missing: tokenUrl is required');
  }

  const tokenParams: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: 'jarvis://oauth/callback',
    code_verifier: codeVerifier,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  // Add client authentication
  if (config.clientSecret) {
    const clientId = config.clientId || 'jarvis-mcp-client';
    const credentials = Buffer.from(`${clientId}:${config.clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  } else if (config.clientId) {
    tokenParams.client_id = config.clientId;
  } else {
    tokenParams.client_id = 'jarvis-mcp-client';
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers,
    body: new URLSearchParams(tokenParams),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.statusText} - ${errorText}`);
  }

  const tokens = await response.json();

  console.log(`[MCP-OAuth] Token exchange successful`);

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type || 'Bearer',
    expires_in: tokens.expires_in,
  };
}

/**
 * Refresh an expired access token
 */
export async function refreshAccessToken(config: MCPOAuthConfig): Promise<OAuthTokens> {
  if (!config.refreshToken) {
    throw new Error('No refresh token available');
  }

  if (!config.tokenUrl) {
    throw new Error('OAuth configuration missing: tokenUrl is required');
  }

  const tokenParams: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: config.refreshToken,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  // Add client authentication
  if (config.clientSecret) {
    const clientId = config.clientId || 'jarvis-mcp-client';
    const credentials = Buffer.from(`${clientId}:${config.clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  } else if (config.clientId) {
    tokenParams.client_id = config.clientId;
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers,
    body: new URLSearchParams(tokenParams),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.statusText} - ${errorText}`);
  }

  const tokens = await response.json();

  console.log(`[MCP-OAuth] Token refresh successful`);

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || config.refreshToken, // Keep old if not rotated
    token_type: tokens.token_type || 'Bearer',
    expires_in: tokens.expires_in,
  };
}

/**
 * Check if token needs refresh (expired or expiring soon)
 */
export function needsTokenRefresh(config: MCPOAuthConfig): boolean {
  if (!config.tokenExpiresAt) {
    return false;
  }

  // Refresh if expiring within 5 minutes
  const FIVE_MINUTES = 5 * 60 * 1000;
  return Date.now() + FIVE_MINUTES > config.tokenExpiresAt;
}

/**
 * Get OAuth state by state parameter (for callback handling)
 */
export function getOAuthState(state: string): OAuthState | undefined {
  return oauthStates.get(state);
}

/**
 * Clean up expired OAuth states
 */
export function cleanupExpiredStates(): void {
  const TEN_MINUTES = 10 * 60 * 1000;
  const now = Date.now();

  for (const [key, state] of oauthStates.entries()) {
    if (now - state.timestamp > TEN_MINUTES) {
      oauthStates.delete(key);
    }
  }
}
