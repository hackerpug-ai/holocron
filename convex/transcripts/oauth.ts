/**
 * YouTube authentication token management
 * Supports both OAuth2 and Google Service Account authentication
 *
 * YouTube caption downloads require authentication.
 * This module manages token lifecycle: retrieval, caching, and refresh.
 *
 * "use node" directive - runs in Node.js environment (not V8 isolate)
 * Required for calling external OAuth2 endpoints and reading service account files
 */

"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";

/**
 * OAuth2 token response from Google
 */
interface OAuth2Token {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
  scope: string;
}

/**
 * Google Service Account credentials
 */
interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

/**
 * In-memory token cache
 * Tokens are cached across requests within the same Convex execution environment
 * Note: This cache resets when the Convex function environment restarts
 */
let cachedToken: OAuth2Token | null = null;
let tokenExpiry: number = 0;

/**
 * Get valid access token (Service Account or OAuth2)
 *
 * This function tries authentication methods in order:
 * 1. Google Service Account (recommended, no user interaction)
 * 2. OAuth2 refresh token (fallback, requires user setup)
 *
 * Service Account setup:
 * - Set GOOGLE_APPLICATION_CREDENTIALS to path of service account JSON
 * - Service account must have YouTube Data API v3 scope enabled
 *
 * OAuth2 setup:
 * - Set YOUTUBE_OAUTH_CLIENT_ID, YOUTUBE_OAUTH_CLIENT_SECRET, YOUTUBE_OAUTH_REFRESH_TOKEN
 *
 * Token refresh happens 60 seconds before actual expiration to prevent
 * race conditions during active use.
 *
 * @returns Access token string or null if unavailable
 */
export const getAccessToken = internalAction({
  handler: async (): Promise<string | null> => {
    // Return cached token if valid (refresh 60 seconds early)
    if (cachedToken && Date.now() < tokenExpiry) {
      const ttl = Math.floor((tokenExpiry - Date.now()) / 1000);
      return cachedToken.access_token;
    }

    // Try Service Account first (recommended)
    const serviceAccountToken = await getServiceAccountToken();
    if (serviceAccountToken) {
      return serviceAccountToken;
    }

    // Fall back to OAuth2 refresh token
    const oauthToken = await getOAuth2Token();
    if (oauthToken) {
      return oauthToken;
    }

    console.warn("[Auth] No authentication method configured");
    console.warn("[Auth] Set GOOGLE_APPLICATION_CREDENTIALS for service account (recommended)");
    console.warn("[Auth] Or set YOUTUBE_OAUTH_* variables for OAuth2");

    return null;
  },
});

/**
 * Get access token using Google Service Account
 *
 * Service accounts use JWT authentication and don't require user interaction.
 * This is the recommended method for server-to-server authentication.
 *
 * Environment variables required:
 * - GOOGLE_APPLICATION_CREDENTIALS: Path to service account JSON file
 *
 * @returns Access token string or null if unavailable
 */
async function getServiceAccountToken(): Promise<string | null> {
  // Try environment variable first (Convex env var)
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (!credentialsJson) {
    return null;
  }

  

  try {
    // Import Node.js crypto module (only available with "use node")
    const crypto = await import("crypto");

    // Parse service account credentials from environment variable
    const credentials: ServiceAccountCredentials = JSON.parse(credentialsJson);

    if (credentials.type !== "service_account") {
      console.error("[ServiceAccount] Invalid credentials file (not a service account)");
      return null;
    }

    // Create JWT for service account authentication
    const jwt = await createServiceAccountJWT(credentials, crypto);

    // Exchange JWT for access token
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ServiceAccount] Token exchange failed: ${response.status} ${errorText}`);
      return null;
    }

    const token: OAuth2Token = await response.json();

    // Cache token with expiry buffer (60 seconds early refresh)
    cachedToken = token;
    tokenExpiry = Date.now() + (token.expires_in - 60) * 1000;

    const ttl = Math.floor((token.expires_in - 60) / 1000);
    console.log(`[ServiceAccount] ✅ Authentication successful (expires in ${ttl}s)`);

    return token.access_token;
  } catch (error) {
    console.error("[ServiceAccount] Authentication error:", error);
    return null;
  }
}

/**
 * Get access token using OAuth2 refresh token
 *
 * Environment variables required:
 * - YOUTUBE_OAUTH_CLIENT_ID: OAuth2 client ID
 * - YOUTUBE_OAUTH_CLIENT_SECRET: OAuth2 client secret
 * - YOUTUBE_OAUTH_REFRESH_TOKEN: Long-lived refresh token
 *
 * @returns Access token string or null if unavailable
 */
async function getOAuth2Token(): Promise<string | null> {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OAuth2] Token refresh failed: ${response.status} ${errorText}`);
      return null;
    }

    const token: OAuth2Token = await response.json();

    // Cache token with expiry buffer (60 seconds early refresh)
    cachedToken = token;
    tokenExpiry = Date.now() + (token.expires_in - 60) * 1000;

    const ttl = Math.floor((token.expires_in - 60) / 1000);
    console.log(`[OAuth2] ✅ Token refreshed successfully (expires in ${ttl}s)`);

    return token.access_token;
  } catch (error) {
    console.error("[OAuth2] Token refresh error:", error);
    return null;
  }
}

/**
 * Create JWT for Google Service Account authentication
 *
 * JWT structure:
 * - Header: Algorithm (RS256) and key ID
 * - Payload: Issuer (service account email), Scope, Audience, Expiration
 * - Signature: Signed with service account private key
 *
 * @param credentials - Service account credentials
 * @param crypto - Node.js crypto module
 * @returns Signed JWT string
 */
async function createServiceAccountJWT(
  credentials: ServiceAccountCredentials,
  crypto: typeof import("crypto")
): Promise<string> {
  // JWT Header
  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: credentials.private_key_id,
  };

  // JWT Payload
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/youtube",
    aud: credentials.token_uri,
    exp: now + 3600,
    iat: now,
  };

  // Base64URL encode (without padding)
  function base64UrlEncode(data: string): string {
    const base64 = Buffer.from(data).toString("base64");
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  // Sign with private key
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signatureInput);
  sign.end();
  const signature = sign.sign(credentials.private_key, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${signatureInput}.${signature}`;
}

/**
 * Get OAuth2 authorization URL for initial setup
 *
 * This helper generates the Google OAuth2 consent screen URL.
 * Users visit this URL to authorize the app and receive a refresh token.
 *
 * Note: Service account authentication is preferred for server-to-server use.
 * Use OAuth2 only when you need user-specific YouTube access.
 *
 * Usage:
 * 1. Call this action to get the authorization URL
 * 2. Open URL in browser
 * 3. Authorize with Google account
 * 4. Copy the refresh_token from the callback
 * 5. Store refresh_token in environment variables
 *
 * Scopes requested:
 * - https://www.googleapis.com/auth/youtube.readonly: Read YouTube metadata
 *
 * @returns Authorization URL for OAuth2 consent screen
 */
export const getAuthorizationUrl = internalAction({
  handler: async (): Promise<string> => {
    const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;

    if (!clientId) {
      throw new Error("YOUTUBE_OAUTH_CLIENT_ID not configured");
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: "http://localhost:3000/oauth/callback",
      scope: "https://www.googleapis.com/auth/youtube.readonly",
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    
    

    return authUrl;
  },
});

/**
 * Exchange authorization code for refresh token
 *
 * This helper completes the OAuth2 flow by exchanging the
 * authorization code (from callback) for a refresh token.
 *
 * @param code - Authorization code from OAuth2 callback
 * @returns Refresh token for storage in environment variables
 */
export const exchangeCodeForToken = internalAction({
  args: {
    code: v.string(), // OAuth authorization code from Google
  },
  handler: async (_, args): Promise<{ refresh_token: string } | null> => {
    const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error("[OAuth2] Client credentials not configured");
      return null;
    }

    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: args.code,
          redirect_uri: "http://localhost:3000/oauth/callback",
          grant_type: "authorization_code",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OAuth2] Code exchange failed: ${response.status} ${errorText}`);
        return null;
      }

      const token: OAuth2Token & { refresh_token?: string } = await response.json();

      if (!token.refresh_token) {
        console.error("[OAuth2] No refresh token in response");
        return null;
      }

      
      

      return { refresh_token: token.refresh_token };
    } catch (error) {
      console.error("[OAuth2] Code exchange error:", error);
      return null;
    }
  },
});
