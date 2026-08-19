/**
 * MK6-DATA-001 v2 — live composite-corpus contract.
 *
 * These tests are integration-gated. They deliberately require the canonical
 * operator corpus and never create a fixture or fake a database/service.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const enabled = process.env.PLATFORM_IT === '1';
const redEvidence = process.env.MK6_RED_EVIDENCE === '1';
const canonicalRoot = process.env.MK6_DATA_CANONICAL_ROOT ?? '/Users/justinrich/.holocron';
const runRoot = process.env.MK6_DATA_RUN_ROOT;
const repoRoot = resolve(import.meta.dirname, '../../../..');
const verifyScript = resolve(repoRoot, 'scripts/verify-mk6-data-plane-truth.sh');

const itLive = enabled && existsSync(canonicalRoot) ? it : it.skip;
const itRed = redEvidence ? it : it.skip;

async function runVerifier(args: string[]): Promise<Record<string, unknown>> {
  const { stdout } = await execFileAsync('bash', [verifyScript, ...args, '--json'], {
    cwd: repoRoot,
    env: { ...process.env, PLATFORM_IT: '1' },
    timeout: 2_400_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const lastJson = stdout
    .trim()
    .split('\n')
    .reverse()
    .find((line) => line.startsWith('{'));
  if (!lastJson) throw new Error(`verifier emitted no JSON: ${stdout.slice(0, 400)}`);
  return JSON.parse(lastJson) as Record<string, unknown>;
}

describe('MK6-DATA-001 composite corpus v2', () => {
  itRed('RED: complete semantic snapshot API is not yet implemented', async () => {
    const module = await import('../../src/etl/composite-corpus.ts');
    const result = await module.createCompositeCorpusSnapshot({
      canonicalRoot,
      ...(runRoot ? { runRoot } : {}),
    });
    expect(result.manifest.schema).toBe('holocron.mk6.composite-corpus.v2');
  });

  itLive(
    'admits and snapshots every canonical source with symmetric checkpoints',
    async () => {
      const module = await import('../../src/etl/composite-corpus.ts');
      const result = await module.createCompositeCorpusSnapshot({
        canonicalRoot,
        ...(runRoot ? { runRoot } : {}),
      });

      expect(result.manifest.schema).toBe('holocron.mk6.composite-corpus.v2');
      expect(result.manifest.inventory.schema).toBe('holocron.mk6.full-source-inventory.v1');
      expect(result.manifest.inventoryArrays).toHaveLength(9);
      expect(result.manifest.checkpoints.export.sourcePre).toBe(
        result.manifest.checkpoints.export.snapshotCopy
      );
      expect(result.manifest.checkpoints.export.sourcePost).toBe(
        result.manifest.checkpoints.export.snapshotCopy
      );
      expect(result.manifest.checkpoints.sqlite.sourceBackupPre).toBe(
        result.manifest.checkpoints.sqlite.snapshotCopy
      );
      expect(result.manifest.checkpoints.sqlite.sourceBackupPost).toBe(
        result.manifest.checkpoints.sqlite.snapshotCopy
      );
      expect(result.manifest.checkpoints.blobs.sourcePre).toBe(
        result.manifest.checkpoints.blobs.snapshotCopy
      );
      expect(result.manifest.checkpoints.blobs.sourcePost).toBe(
        result.manifest.checkpoints.blobs.snapshotCopy
      );
      expect(result.manifest.sqlite.quickCheck).toBe('ok');
      expect(result.manifest.accounting.unmappedSourceItemCount).toBe(0);
      expect(result.manifest.accounting.omittedSourceItemCount).toBe(0);
    },
    600_000
  );

  itLive(
    'loads the real corpus through the shipped verifier into isolated Postgres',
    async () => {
      const result = await runVerifier(['--case', 'composite-positive']);
      expect(result.ok).toBe(true);
      expect(result.manifestSchema).toBe('holocron.mk6.composite-corpus.v2');
      expect(result.inventorySchema).toBe('holocron.mk6.full-source-inventory.v1');
      expect(result.inventoryArrayCount).toBe(9);
      expect(result.sqliteQuickCheck).toBe('ok');
      expect(result.unmappedSourceItemCount).toBe(0);
      expect(result.omittedSourceItemCount).toBe(0);
      expect(result.semanticCheckpointMismatchCount).toBe(0);
      const load = result.load as { localDocumentLoadCount?: number; etlRunId?: string };
      const reconcile = result.reconcile as {
        ok?: boolean;
        sourceToTargetMismatchCount?: number;
        targetToSourceMismatchCount?: number;
        fkOrphanCount?: number;
      };
      const witnesses = result.witnesses as Array<{ sourceOrigin: string }>;
      expect(load.etlRunId).toEqual(expect.any(String));
      expect(load.etlRunId?.length).toBeGreaterThan(0);
      expect(reconcile.ok).toBe(true);
      expect(reconcile.sourceToTargetMismatchCount).toBe(0);
      expect(reconcile.targetToSourceMismatchCount).toBe(0);
      expect(typeof reconcile.fkOrphanCount).toBe('number');
      expect(witnesses.map((row) => row.sourceOrigin).sort()).toEqual(['convex', 'local']);
    },
    2_400_000
  );

  itLive(
    'rejects count-equal content corruption after a healthy isolated baseline',
    async () => {
      const result = await runVerifier(['--negative-control', 'count-equal-content-corrupt']);
      expect(result.ok).toBe(true);
      expect(result.failureClass).toBe('CONTENT_DIGEST_MISMATCH');
    },
    2_400_000
  );
});

afterAll(() => {
  // The verifier owns only its run-scoped derivative. The canonical source is
  // intentionally never cleaned or changed by this test.
});
