/**
 * Shared helpers for ledger-1 evidence integration tests (real Postgres).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { it } from 'vitest';
import { BUN_BIN, DEFAULT_DATABASE_URL, HOLO_CLI, PLATFORM_IT, REPO_ROOT } from './harness';

export { DEFAULT_DATABASE_URL, PLATFORM_IT, REPO_ROOT };

export const itLive = PLATFORM_IT ? it : it.skip;

export const EVIDENCE_TMP = resolve(REPO_ROOT, '.tmp/ledger-1');

export function ensureEvidenceTmp(): void {
  mkdirSync(EVIDENCE_TMP, { recursive: true });
}

export function writeEvidenceArtifact(name: string, body: unknown): string {
  ensureEvidenceTmp();
  const path = resolve(EVIDENCE_TMP, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

export function runHolo(args: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: DEFAULT_DATABASE_URL },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function parseJsonObject(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf('{');
  if (start < 0) throw new Error(`no JSON object in stdout:\n${stdout}`);
  return JSON.parse(trimmed.slice(start)) as Record<string, unknown>;
}

/** Ensure domain migrations (including 0003) are applied. */
export function ensureMigrated(): void {
  const r = runHolo(['db:migrate', '--json']);
  if (r.status !== 0) {
    throw new Error(`db:migrate failed:\n${r.stdout}\n${r.stderr}`);
  }
}

/** Truncate evidence tables for empty-evidence-db start_ref. */
export async function truncateEvidenceTables(): Promise<void> {
  const { createSql } = await import('../../../services/platform/src/db/client');
  const sql = createSql(DEFAULT_DATABASE_URL);
  try {
    await sql`
      TRUNCATE TABLE
        beliefs,
        relations,
        claims,
        entities,
        passages,
        sources
      RESTART IDENTITY CASCADE
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Serialize evidence IT suites across vitest workers via Postgres advisory lock.
 * Key is stable hash of 'ledger-1-evidence' (pg_advisory_lock is session-scoped).
 */
export async function withEvidenceLock<T>(fn: () => Promise<T>): Promise<T> {
  const { createSql } = await import('../../../services/platform/src/db/client');
  const sql = createSql(DEFAULT_DATABASE_URL);
  try {
    await sql`SELECT pg_advisory_lock(hashtext('ledger-1-evidence'))`;
    return await fn();
  } finally {
    try {
      await sql`SELECT pg_advisory_unlock(hashtext('ledger-1-evidence'))`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}
