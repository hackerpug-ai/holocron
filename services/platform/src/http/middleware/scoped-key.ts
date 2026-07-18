/**
 * Scoped API-key middleware (RN / MCP / control).
 *
 * Personal-app control plane over Tailscale (AP-7) — NOT RLS / multi-tenant.
 * - unkeyed protected routes → 401
 * - wrong scope → 403
 * - correct scope → next()
 * - /health is exempt (tailnet-only)
 *
 * Env (either naming style):
 *   HOLO_KEY_RN | RN_API_KEY
 *   HOLO_KEY_MCP | MCP_API_KEY
 *   HOLO_KEY_CONTROL | CONTROL_API_KEY
 */
import type { Context, MiddlewareHandler, Next } from 'hono';

export type Scope = 'rn' | 'mcp' | 'control';

export type ScopedKeyConfig = {
  rn: string;
  mcp: string;
  control: string;
};

export type ScopedKeyVariables = {
  scope: Scope;
  keyFingerprint: string;
};

/**
 * Load scoped keys from process env. Empty strings mean "not configured"
 * (every request with that missing key fails as 401).
 */
export function loadScopedKeysFromEnv(env: NodeJS.ProcessEnv = process.env): ScopedKeyConfig {
  return {
    rn: env.HOLO_KEY_RN ?? env.RN_API_KEY ?? '',
    mcp: env.HOLO_KEY_MCP ?? env.MCP_API_KEY ?? '',
    control: env.HOLO_KEY_CONTROL ?? env.CONTROL_API_KEY ?? '',
  };
}

/** Log-safe fingerprint (never the full key). */
export function keyFingerprint(key: string): string {
  if (!key) return 'empty';
  if (key.length <= 8) return `${key.slice(0, 2)}…`;
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/**
 * Map a raw bearer token to a scope, or null if unrecognized / empty.
 * Exact match only — no prefix, no constant-time needed for personal tailnet keys
 * (still avoid logging the full key).
 */
export function resolveScopeFromKey(token: string, config: ScopedKeyConfig): Scope | null {
  if (!token) return null;
  if (config.rn && token === config.rn) return 'rn';
  if (config.mcp && token === config.mcp) return 'mcp';
  if (config.control && token === config.control) return 'control';
  return null;
}

/** Mission admin routes for the documented control alias. */
const CONTROL_ROUTE_RE = /^\/api\/missions\/[^/]+(?:\/(verdicts|steer))?\/?$/;

/**
 * Whether a resolved scope may access this path.
 *
 * | Scope   | Allowed paths                                             |
 * |---------|-----------------------------------------------------------|
 * | rn      | /api/* and /blobs/*                                       |
 * | mcp     | /mcp and /blobs/*                                         |
 * | control | /api/missions/:id plus the documented admin steer/verdict |
 */
export function isScopeAllowedForPath(scope: Scope, path: string): boolean {
  // Normalize trailing slash for matching (keep root "/mcp" exact-ish)
  const p = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;

  if (scope === 'mcp') {
    return p === '/mcp' || p.startsWith('/mcp/') || p === '/blobs' || p.startsWith('/blobs/');
  }

  if (scope === 'control') {
    return CONTROL_ROUTE_RE.test(p);
  }

  // rn — application client: all /api/* routes + tailnet blob reads
  if (scope === 'rn') {
    return p === '/api' || p.startsWith('/api/') || p === '/blobs' || p.startsWith('/blobs/');
  }

  return false;
}

/**
 * Paths that require a scoped key. /health and public /article/* are exempt.
 */
export function isProtectedPath(path: string): boolean {
  const p = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  if (p === '/health') return false;
  if (p.startsWith('/article')) return false;
  if (p === '/api' || p.startsWith('/api/')) return true;
  if (p === '/mcp' || p.startsWith('/mcp/')) return true;
  if (p === '/blobs' || p.startsWith('/blobs/')) return true;
  return false;
}

function extractBearer(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!m?.[1]) return null;
  return m[1].trim();
}

/**
 * Hono middleware factory. Apply once on the app (or on /api/* + /mcp groups).
 * Returns 401/403 JSON bodies; never falls through without a key on protected paths.
 */
export function createScopedKeyMiddleware(
  config: ScopedKeyConfig = loadScopedKeysFromEnv()
): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const path = new URL(c.req.url).pathname;

    if (!isProtectedPath(path)) {
      await next();
      return;
    }

    const token = extractBearer(c.req.header('Authorization'));
    if (!token) {
      return c.json(
        { error: 'unauthorized', message: 'missing or invalid Authorization Bearer token' },
        401
      );
    }

    const scope = resolveScopeFromKey(token, config);
    if (!scope) {
      return c.json({ error: 'unauthorized', message: 'unknown API key' }, 401);
    }

    if (!isScopeAllowedForPath(scope, path)) {
      return c.json(
        {
          error: 'forbidden',
          message: `scope '${scope}' is not allowed for ${path}`,
          scope,
        },
        403
      );
    }

    // Stash for handlers / logging (fingerprint only for logs)
    c.set('scope', scope);
    c.set('keyFingerprint', keyFingerprint(token));
    await next();
  };
}

/** Convenience alias matching the task file name. */
export const scopedKeyMiddleware = createScopedKeyMiddleware;
