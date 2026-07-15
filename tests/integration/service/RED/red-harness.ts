/**
 * Shared helpers for ledger-4 RED immutability suite (real Postgres, PLATFORM_IT=1).
 * WRITE-ALLOWED: tests/integration/service/RED/** only.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Sql } from '../../../../services/platform/src/db/client';
import {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  itLive,
  PLATFORM_IT,
  parseJsonObject,
  REPO_ROOT,
  runHolo,
  truncateEvidenceTables,
  withEvidenceLock,
} from '../evidence-harness';

export {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  itLive,
  PLATFORM_IT,
  parseJsonObject,
  REPO_ROOT,
  runHolo,
  truncateEvidenceTables,
  withEvidenceLock,
};

export const LEDGER4_TMP = resolve(REPO_ROOT, '.tmp/ledger-4');

export function ensureLedger4Tmp(): void {
  mkdirSync(LEDGER4_TMP, { recursive: true });
}

export function writeRedArtifact(name: string, body: unknown): string {
  ensureLedger4Tmp();
  const path = resolve(LEDGER4_TMP, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

/** Insert one open belief row; returns id + claim_id. */
export async function insertOpenBelief(
  sql: Sql,
  options?: {
    claimId?: string;
    statement?: string;
    confidence?: number;
    actor?: string;
  }
): Promise<{ id: string; claimId: string; statement: string }> {
  const claimId = options?.claimId ?? `claim-red-${Date.now()}`;
  const statement = options?.statement ?? 'RED open belief statement-1';
  const confidence = options?.confidence ?? 0.5;
  const actor = options?.actor ?? 'seed-op';
  const rows = await sql<{ id: string; claim_id: string }[]>`
    INSERT INTO beliefs (claim_id, statement, confidence, tx_from, tx_to, actor)
    VALUES (${claimId}, ${statement}, ${confidence}, now(), NULL, ${actor})
    RETURNING id::text AS id, claim_id
  `;
  const row = rows[0];
  if (!row?.id) throw new Error('insertOpenBelief failed');
  return { id: row.id, claimId: row.claim_id, statement };
}

export function pgError(err: unknown): { code: string | null; message: string } {
  const e = err as { code?: string; message?: string };
  return {
    code: e.code ?? null,
    message: e.message ?? String(err),
  };
}
