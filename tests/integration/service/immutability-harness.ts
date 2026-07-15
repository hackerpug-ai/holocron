/**
 * Shared helpers for ledger-2 immutability integration tests (real Postgres).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
} from './evidence-harness';

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

export const IMMUTABILITY_TMP = resolve(REPO_ROOT, '.tmp/ledger-2');

export function ensureImmutabilityTmp(): void {
  mkdirSync(IMMUTABILITY_TMP, { recursive: true });
}

export function writeImmutabilityArtifact(name: string, body: unknown): string {
  ensureImmutabilityTmp();
  const path = resolve(IMMUTABILITY_TMP, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

/** Seed open belief under advisory lock; returns belief id. */
export async function seedBeliefForTest(options?: {
  claimId?: string;
  statement?: string;
}): Promise<{ beliefId: string; claimId: string; statement: string }> {
  const { seedOpenBelief } = await import('../../../services/platform/src/db/evidence/index');
  const seeded = await seedOpenBelief({
    databaseUrl: DEFAULT_DATABASE_URL,
    claimId: options?.claimId,
    statement: options?.statement,
  });
  if (!seeded.ok || !seeded.beliefId) {
    throw new Error(`seedOpenBelief failed: ${seeded.errors.join('; ')}`);
  }
  return {
    beliefId: seeded.beliefId,
    claimId: seeded.claimId,
    statement: seeded.statement,
  };
}
