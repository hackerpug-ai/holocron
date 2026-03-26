/**
 * YouTube OAuth2 token management
 * Handles OAuth2 access token refresh for YouTube Data API v3
 *
 * YouTube caption downloads require OAuth2 authentication.
 * This module manages token lifecycle: retrieval, caching, and refresh.
 *
 * "use node" directive - runs in Node.js environment (not V8 isolate)
 * Required for calling external OAuth2 endpoints
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
 * In-memory token cache
 * Tokens are cached across requests within the same Convex execution environment
 * Note: This cache resets when the Convex function environment restarts
 */
let cachedToken: OAuth2Token | null = null;
let tokenExpiry: number = 0;

/**
 * Get valid OAuth2 access token
 *
 * This function:
 * 1. Returns cached token if still valid (not expired)
 * 2. Refreshes token using refresh_token if expired or missing
 * 3. Caches new token for future requests
 * 4. Returns null if OAuth2 not configured or refresh fails
 *
 * Environment variables required:
 * - YOUTUBE_OAUTH_CLIENT_ID: OAuth2 client ID from Google Cloud Console
 * - YOUTUBE_OAUTH_CLIENT_SECRET: OAuth2 client secret
 * - YOUTUBE_OAUTH_REFRESH_TOKEN: Long-lived refresh token
 *
 * Token refresh happens 60 seconds before actual expiration to prevent
 * race conditions during active use.
 *
 * @returns Access token string or null if unavailable
 */
export const getAccessToken = internalAction({
  handler: async (): Promise<string | null> => {
    const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
    const refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;

    // Check OAuth2 credentials
    if (!clientId || !clientSecret || !refreshToken) {
      console.warn("[OAuth2] Credentials not configured (YOUTUBE_OAUTH_CLIENT_ID, YOUTUBE_OAUTH_CLIENT_SECRET, YOUTUBE_OAUTH_REFRESH_TOKEN)");
      return null;
    }

    // Return cached token if valid (refresh 60 seconds early)
    if (cachedToken && Date.now() < tokenExpiry) {
      const ttl = Math.floor((tokenExpiry - Date.now()) / 1000);
      console.log(`[OAuth2] Using cached token (expires in ${ttl}s)`);
      return cachedToken.access_token;
    }

    // Token expired or not cached, refresh it
    console.log("[OAuth2] Token expired or missing, refreshing...");

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
      console.log(`[OAuth2] Token refreshed successfully (expires in ${ttl}s)`);

      return token.access_token;
    } catch (error) {
      console.error("[OAuth2] Token refresh error:", error);
      return null;
    }
  },
});

/**
 * Get OAuth2 authorization URL for initial setup
 *
 * This helper generates the Google OAuth2 consent screen URL.
 * Users visit this URL to authorize the app and receive a refresh token.
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

    console.log("[OAuth2] Authorization URL generated");
    console.log("[OAuth2] Open this URL in a browser to authorize:");

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

      console.log("[OAuth2] Authorization code exchanged successfully");
      console.log("[OAuth2] Store this refresh token in YOUTUBE_OAUTH_REFRESH_TOKEN:");

      return { refresh_token: token.refresh_token };
    } catch (error) {
      console.error("[OAuth2] Code exchange error:", error);
      return null;
    }
  },
});
