/**
 * D06-03 / R2-H03 — article baseline capture + immutable load.
 *
 * Capture (operator cutover:capture-article-baseline): fetches live
 * GET /article/:shareToken after fence arm, persists sha256 + byteLength +
 * capturedAtMs. Fail-closes with FENCE_NOT_ARMED when the fence is not armed.
 *
 * Verify (cutover:verify-article / runVerifyArticle): loads an *immutable*
 * pre-freeze / D06-03 baseline file and compares network GET bytes to it.
 * NEVER re-authors the baseline from the SUT under test in the same run.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveRepoRoot } from '../config/secrets.ts';
import { renderPublicArticle } from '../http/article.ts';
import {
  getMigrationReadOnlyEnv,
  isFenceArmedEnv,
  resolveFenceArmedAt,
} from './convex-fence-client.ts';

export const FENCE_NOT_ARMED = 'FENCE_NOT_ARMED';
export const BASELINE_MISSING = 'BASELINE_MISSING';
export const BASELINE_CORRUPT = 'BASELINE_CORRUPT';
export const BASELINE_INVALID_SHA = 'BASELINE_INVALID_SHA';

/** Committed frozen fixture path (R2-H03 immutable pre-freeze comparator template). */
export function immutablePreFreezeArticleBaselineFixturePath(cwd = process.cwd()): string {
  return resolve(cwd, 'services/platform/tests/fixtures/sprint29/article-baseline-pre-freeze.json');
}

export type ArticleBaselinePhase = 'pre-freeze' | 'd06-03-post-arm';

export type ArticleBaselineProvenance = {
  kind: 'immutable-pre-freeze-article-baseline';
  /** How bytes were obtained (never post-fence SUT child of the same verify run). */
  source: string;
  note?: string;
};

export type ArticleBaseline = {
  ok: boolean;
  sha256: string;
  byteLength: number;
  capturedAtMs: number;
  fence_armed_at: number;
  shareToken: string;
  url: string;
  status: number;
  path: string;
  /** R2-H03: documented capture phase (pre-freeze or D06-03 post-arm). */
  phase?: ArticleBaselinePhase;
  provenance?: ArticleBaselineProvenance;
};

export type ArticleBaselineError = {
  ok: false;
  error: { code: string; message: string };
};

export function defaultArticleBaselinePath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D06-03/article-baseline.json');
}

const SHA256_HEX = /^[0-9a-f]{64}$/i;

/**
 * Fail-closed structural validation of a baseline object (no I/O).
 * Requires 64-hex sha256, byteLength > 0, non-empty shareToken, capturedAtMs > 0.
 */
export function validateArticleBaselineFields(
  b: Partial<ArticleBaseline> | null | undefined
): { ok: true; baseline: ArticleBaseline } | { ok: false; code: string; message: string } {
  if (!b || typeof b !== 'object') {
    return { ok: false, code: BASELINE_CORRUPT, message: 'baseline is not an object' };
  }
  const sha256 = typeof b.sha256 === 'string' ? b.sha256.trim() : '';
  const byteLength = typeof b.byteLength === 'number' ? b.byteLength : 0;
  const shareToken = typeof b.shareToken === 'string' ? b.shareToken.trim() : '';
  const capturedAtMs = typeof b.capturedAtMs === 'number' ? b.capturedAtMs : 0;
  const status = typeof b.status === 'number' ? b.status : 0;

  if (!sha256 || !SHA256_HEX.test(sha256)) {
    return {
      ok: false,
      code: BASELINE_INVALID_SHA,
      message: `baseline.sha256 must be 64-hex, got length=${sha256.length}`,
    };
  }
  if (!(byteLength > 0)) {
    return {
      ok: false,
      code: BASELINE_CORRUPT,
      message: `baseline.byteLength must be > 0, got ${byteLength}`,
    };
  }
  if (!shareToken) {
    return {
      ok: false,
      code: BASELINE_CORRUPT,
      message: 'baseline.shareToken is required',
    };
  }
  if (!(capturedAtMs > 0)) {
    return {
      ok: false,
      code: BASELINE_CORRUPT,
      message: 'baseline.capturedAtMs must be > 0',
    };
  }
  if (status !== 0 && status !== 200) {
    return {
      ok: false,
      code: BASELINE_CORRUPT,
      message: `baseline.status at capture must be 200 (or omitted), got ${status}`,
    };
  }

  return {
    ok: true,
    baseline: {
      ok: b.ok !== false,
      sha256: sha256.toLowerCase(),
      byteLength,
      capturedAtMs,
      fence_armed_at: typeof b.fence_armed_at === 'number' ? b.fence_armed_at : 0,
      shareToken,
      url: typeof b.url === 'string' ? b.url : '',
      status: status === 0 ? 200 : status,
      path: typeof b.path === 'string' ? b.path : '',
      phase: b.phase,
      provenance: b.provenance,
    },
  };
}

/**
 * Read-only load of an immutable article baseline. Never fetches SUT.
 * Fail-closed: missing path / empty / corrupt / invalid sha256.
 */
export function loadArticleBaseline(
  baselinePath: string
): { ok: true; baseline: ArticleBaseline; path: string } | ArticleBaselineError {
  if (!baselinePath || !existsSync(baselinePath)) {
    return {
      ok: false,
      error: {
        code: BASELINE_MISSING,
        message: `article baseline missing: ${baselinePath || '(empty path)'}`,
      },
    };
  }
  let raw: string;
  try {
    raw = readFileSync(baselinePath, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: {
        code: BASELINE_MISSING,
        message: `article baseline unreadable at ${baselinePath}: ${msg}`,
      },
    };
  }
  if (!raw.trim()) {
    return {
      ok: false,
      error: {
        code: BASELINE_CORRUPT,
        message: `article baseline empty at ${baselinePath}`,
      },
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: {
        code: BASELINE_CORRUPT,
        message: `article baseline JSON parse failed at ${baselinePath}: ${msg}`,
      },
    };
  }
  const v = validateArticleBaselineFields(parsed as Partial<ArticleBaseline>);
  if (!v.ok) {
    return {
      ok: false,
      error: { code: v.code, message: `${v.message} (path=${baselinePath})` },
    };
  }
  return {
    ok: true,
    baseline: { ...v.baseline, path: v.baseline.path || baselinePath },
    path: baselinePath,
  };
}

/**
 * Capture a pre-freeze article baseline from Postgres-backed HTML render
 * (same articleHtml path as Hono GET /article/:token) WITHOUT talking to the
 * post-fence SUT child. Used by integration suites to author the D06-03
 * comparator before arming the soak child.
 */
export async function capturePreFreezeArticleBaseline(options: {
  token: string;
  outputPath?: string;
  cwd?: string;
  databaseUrl?: string;
}): Promise<ArticleBaseline | ArticleBaselineError> {
  const cwd = options.cwd ?? resolveRepoRoot();
  const token = options.token?.trim();
  if (!token) {
    return {
      ok: false,
      error: {
        code: 'TOKEN_REQUIRED',
        message: 'capturePreFreezeArticleBaseline requires token',
      },
    };
  }

  const html = await renderPublicArticle(token, options.databaseUrl);
  if (!html || html.length === 0) {
    return {
      ok: false,
      error: {
        code: 'ARTICLE_FETCH_FAILED',
        message: `renderPublicArticle returned empty/null for token=${token}`,
      },
    };
  }

  const buf = Buffer.from(html, 'utf8');
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const byteLength = buf.byteLength;
  const capturedAtMs = Date.now();
  const path = options.outputPath ?? defaultArticleBaselinePath(cwd);
  mkdirSync(resolve(path, '..'), { recursive: true });

  const baseline: ArticleBaseline = {
    ok: true,
    sha256,
    byteLength,
    capturedAtMs,
    // Pre-freeze: fence not yet armed (0). Ordering: capturedAtMs is the freeze watermark.
    fence_armed_at: 0,
    shareToken: token,
    url: `pre-freeze://renderPublicArticle/article/${encodeURIComponent(token)}`,
    status: 200,
    path,
    phase: 'pre-freeze',
    provenance: {
      kind: 'immutable-pre-freeze-article-baseline',
      source: 'renderPublicArticle',
      note: 'R2-H03: captured before post-fence SUT child; verify must only READ this file',
    },
  };
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  return baseline;
}

function convexSiteBase(): string {
  const site =
    process.env.EXPO_PUBLIC_CONVEX_SITE_URL ??
    process.env.CONVEX_SITE_URL ??
    process.env.VITE_CONVEX_SITE_URL;
  if (site) return site.replace(/\/$/, '');

  // Derive .convex.site from .convex.cloud deployment URL
  const cloud =
    process.env.EXPO_PUBLIC_CONVEX_URL ??
    process.env.VITE_CONVEX_HTTP_URL ??
    process.env.CONVEX_URL;
  if (cloud) {
    return cloud.replace(/\.convex\.cloud\/?$/, '.convex.site').replace(/\/$/, '');
  }
  throw new Error(
    'EXPO_PUBLIC_CONVEX_SITE_URL (or EXPO_PUBLIC_CONVEX_URL) required for article baseline'
  );
}

export function articleUrlForToken(shareToken: string): string {
  return `${convexSiteBase()}/article/${encodeURIComponent(shareToken)}`;
}

/** D06-03 mutating httpAction probe path (POST). */
export function cutoverWriteProbeUrl(): string {
  return `${convexSiteBase()}/cutover/write-probe`;
}

/**
 * Capture article baseline. Throws / returns error with code FENCE_NOT_ARMED
 * when fence is not armed.
 */
export async function captureArticleBaseline(options: {
  token: string;
  outputPath?: string;
  cwd?: string;
  freezeReportPath?: string;
}): Promise<ArticleBaseline | ArticleBaselineError> {
  const cwd = options.cwd ?? resolveRepoRoot();
  const token = options.token?.trim();
  if (!token) {
    return {
      ok: false,
      error: {
        code: 'TOKEN_REQUIRED',
        message: 'cutover:capture-article-baseline requires --token',
      },
    };
  }

  const envVal = getMigrationReadOnlyEnv(cwd);
  const fenceArmedAt = await resolveFenceArmedAt({
    cwd,
    freezeReportPath: options.freezeReportPath,
  });

  const armed = isFenceArmedEnv(envVal) || (fenceArmedAt != null && fenceArmedAt > 0);
  if (!armed || !isFenceArmedEnv(envVal)) {
    // Strict: env must be armed; missing audit alone is not enough if env unset
    if (!isFenceArmedEnv(envVal)) {
      return {
        ok: false,
        error: {
          code: FENCE_NOT_ARMED,
          message:
            'Fence is not armed (HOLO_MIGRATION_READ_ONLY != 1). Run holo cutover:freeze first.',
        },
      };
    }
  }

  const resolvedArmedAt = fenceArmedAt != null && fenceArmedAt > 0 ? fenceArmedAt : Date.now() - 1;

  // Ensure capture is strictly after arm by waiting on a real clock — never synthesize
  // capturedAtMs = armedAt+1 (MEDIUM FIX-D06-03-AC2).
  let capturedAtMs = Date.now();
  let waitGuard = 0;
  while (capturedAtMs <= resolvedArmedAt && waitGuard < 20) {
    await new Promise((r) => setTimeout(r, Math.max(2, resolvedArmedAt - capturedAtMs + 2)));
    capturedAtMs = Date.now();
    waitGuard += 1;
  }
  if (capturedAtMs <= resolvedArmedAt) {
    return {
      ok: false,
      error: {
        code: 'CAPTURE_CLOCK_RACE',
        message: `capturedAtMs (${capturedAtMs}) not strictly greater than fence_armed_at (${resolvedArmedAt}) after wait`,
      },
    };
  }

  const url = articleUrlForToken(token);
  const res = await fetch(url, {
    method: 'GET',
    headers: { accept: 'text/html' },
  });
  // Stamp capture time from wall clock after the real HTTP fetch completes
  capturedAtMs = Date.now();
  if (capturedAtMs <= resolvedArmedAt) {
    await new Promise((r) => setTimeout(r, resolvedArmedAt - capturedAtMs + 2));
    capturedAtMs = Date.now();
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const byteLength = buf.byteLength;

  if (res.status !== 200 || byteLength === 0) {
    return {
      ok: false,
      error: {
        code: 'ARTICLE_FETCH_FAILED',
        message: `GET ${url} returned status=${res.status} byteLength=${byteLength}`,
      },
    };
  }

  if (capturedAtMs <= resolvedArmedAt) {
    return {
      ok: false,
      error: {
        code: 'CAPTURE_CLOCK_RACE',
        message: `post-fetch capturedAtMs (${capturedAtMs}) not strictly greater than fence_armed_at (${resolvedArmedAt})`,
      },
    };
  }

  const path = options.outputPath ?? defaultArticleBaselinePath(cwd);
  mkdirSync(resolve(path, '..'), { recursive: true });

  const baseline: ArticleBaseline = {
    ok: true,
    sha256,
    byteLength,
    capturedAtMs,
    fence_armed_at: resolvedArmedAt,
    shareToken: token,
    url,
    status: res.status,
    path,
    phase: 'd06-03-post-arm',
    provenance: {
      kind: 'immutable-pre-freeze-article-baseline',
      source: 'network-GET-after-fence-arm',
      note: 'D06-03 operator capture; immutable for later cutover:verify-article (do not re-author from SUT)',
    },
  };
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  return baseline;
}

export function formatArticleBaselineText(r: ArticleBaseline | ArticleBaselineError): string {
  if (!r.ok) {
    const err = r as ArticleBaselineError;
    return [
      'holo cutover:capture-article-baseline FAILED',
      `  code:    ${err.error.code}`,
      `  message: ${err.error.message}`,
    ].join('\n');
  }
  const b = r as ArticleBaseline;
  return [
    'holo cutover:capture-article-baseline',
    `  ok:              ${b.ok}`,
    `  sha256:          ${b.sha256}`,
    `  byteLength:      ${b.byteLength}`,
    `  capturedAtMs:    ${b.capturedAtMs}`,
    `  fence_armed_at:  ${b.fence_armed_at}`,
    `  token:           ${b.shareToken}`,
    `  path:            ${b.path}`,
  ].join('\n');
}

export function articleBaselineExists(cwd = process.cwd()): boolean {
  return existsSync(defaultArticleBaselinePath(cwd));
}
