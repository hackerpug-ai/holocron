/**
 * MK6-DATA-001 v2 — live composite-corpus contract.
 *
 * These tests are integration-gated. They deliberately require the canonical
 * operator corpus and never create a fixture or fake a database/service.
 */
import { existsSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';

const enabled = process.env.PLATFORM_IT === '1';
const redEvidence = process.env.MK6_RED_EVIDENCE === '1';
const canonicalRoot = process.env.MK6_DATA_CANONICAL_ROOT ?? '/Users/justinrich/.holocron';
const runRoot = process.env.MK6_DATA_RUN_ROOT;

const itLive = enabled && existsSync(canonicalRoot) ? it : it.skip;
const itRed = redEvidence ? it : it.skip;

describe('MK6-DATA-001 composite corpus v2', () => {
  itRed('RED: complete semantic snapshot API is not yet implemented', async () => {
    const module = await import('../../src/etl/composite-corpus.ts');
    const result = await module.createCompositeCorpusSnapshot({
      canonicalRoot,
      ...(runRoot ? { runRoot } : {}),
    });
    expect(result.manifest.schema).toBe('holocron.mk6.composite-corpus.v2');
  });

  itLive('admits and snapshots every canonical source with symmetric checkpoints', async () => {
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
  });
});

afterAll(() => {
  // The verifier owns only its run-scoped derivative. The canonical source is
  // intentionally never cleaned or changed by this test.
});
