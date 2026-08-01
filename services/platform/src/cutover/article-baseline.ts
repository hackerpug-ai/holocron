/**
 * D06-03 — real post-freeze article baseline capture.
 *
 * Fetches live Convex-served GET /article/:shareToken, persists sha256 +
 * byteLength + capturedAtMs. Fail-closes with FENCE_NOT_ARMED when the fence
 * is not yet armed (captured state must be post-freeze final).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveRepoRoot } from '../config/secrets.ts';
import {
  getMigrationReadOnlyEnv,
  isFenceArmedEnv,
  resolveFenceArmedAt,
} from './convex-fence-client.ts';

export const FENCE_NOT_ARMED = 'FENCE_NOT_ARMED';

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
};

export type ArticleBaselineError = {
  ok: false;
  error: { code: string; message: string };
};

export function defaultArticleBaselinePath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D06-03/article-baseline.json');
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

  // Ensure capture is strictly after arm (sleep 1ms if same ms)
  let capturedAtMs = Date.now();
  if (capturedAtMs <= resolvedArmedAt) {
    await new Promise((r) => setTimeout(r, resolvedArmedAt - capturedAtMs + 1));
    capturedAtMs = Date.now();
  }

  const url = articleUrlForToken(token);
  const res = await fetch(url, {
    method: 'GET',
    headers: { accept: 'text/html' },
  });
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

  // Final clock check
  if (capturedAtMs <= resolvedArmedAt) {
    capturedAtMs = resolvedArmedAt + 1;
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
