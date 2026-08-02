import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCutoverParityArtifact } from '../../cutover/etl-orchestrate.ts';
import { loadEtlReconcileSnapshot, zeroWritePathOk } from '../../cutover/soak-fence.ts';
import { selectPast8kRetrievalAnchor } from '../../etl/vectors.ts';
import { chunkDocument } from '../../inference/chunk.ts';

describe('Sprint 29 production cutover artifacts', () => {
  it('derives a real past-8K retrieval anchor when the synthetic fixture marker is absent', () => {
    const prefix = 'intro '.repeat(1_500);
    const lateSentence =
      'Copper kestrel observability proves production retrieval beyond the legacy truncation boundary.';
    const content = `${prefix}${lateSentence} ${'tail '.repeat(900)}`;
    expect(content.indexOf(lateSentence)).toBeGreaterThan(8_000);

    const anchor = selectPast8kRetrievalAnchor('production-doc', chunkDocument(content));

    expect(anchor).not.toBeNull();
    expect(anchor?.documentId).toBe('production-doc');
    expect(anchor?.sourceOffset).toBeGreaterThanOrEqual(8_000);
    expect(anchor?.marker).toContain('Copper kestrel observability');
    expect(anchor?.query).toContain('Copper kestrel observability');
    expect(anchor?.marker).not.toContain('UNIQUE_PAST_8K_MARKER');
    expect(
      createHash('sha256')
        .update(anchor?.marker ?? '')
        .digest('hex')
    ).toMatch(/^[a-f0-9]{64}$/);
  });

  it('preserves the fixture marker oracle when the marker really exists past 8K', () => {
    const content = `${'A'.repeat(8_200)} UNIQUE_PAST_8K_MARKER retrieval tail`;
    const anchor = selectPast8kRetrievalAnchor('fixture-doc', chunkDocument(content));

    expect(anchor?.documentId).toBe('fixture-doc');
    expect(anchor?.marker).toBe('UNIQUE_PAST_8K_MARKER');
    expect(anchor?.sourceOffset).toBeGreaterThan(8_000);
  });

  it('builds immutable parity from unique catalog targets and sums merge sources', () => {
    const artifact = buildCutoverParityArtifact({
      exportArchiveHash: 'a'.repeat(64),
      exportRelPath: '.tmp/D06-04/exports/run/export',
      catalogRelPath:
        '.spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml',
      catalogId: '12-convex-source-catalog',
      runId: 'run-1',
      reconcileTables: [
        { table: 'documents', targetTable: 'documents', expectedTarget: 10 },
        { table: 'researchSessions', targetTable: 'research_sessions', expectedTarget: 2 },
        { table: 'deepResearchSessions', targetTable: 'research_sessions', expectedTarget: 7 },
        { table: 'documentCounters', targetTable: null, expectedTarget: 0 },
      ],
    });

    expect(artifact.loadedByTable).toEqual({ documents: 10, research_sessions: 9 });
    expect(artifact.catalog_table_count_expected).toBe(2);
    expect(artifact.boundExportArchiveHash).toBe('a'.repeat(64));
    expect(artifact.provenance.runId).toBe('run-1');

    const digest = createHash('sha256')
      .update(`${JSON.stringify(artifact, null, 2)}\n`)
      .digest('hex');
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('refuses a zero-variance ETL report when vectors failed', () => {
    const scratch = mkdtempSync(resolve(tmpdir(), 's29-etl-snapshot-'));
    const reportPath = resolve(scratch, 'watermark-report.json');
    try {
      writeFileSync(
        reportPath,
        `${JSON.stringify({
          ok: false,
          runId: 'stale-vector-failure',
          unexplainedVariance: 0,
          exportArchiveHash: 'a'.repeat(64),
          parityHash: 'b'.repeat(64),
          exportRelPath: '.tmp/D06-04/export',
          parityRelPath: '.tmp/D06-04/cutover-parity.json',
          loadedByTable: { documents: 10, conversations: 2 },
          reconcile: { ok: true, unexplainedVariance: 0 },
          fkAudit: { ok: true },
          vectors: { ok: false },
          stages: { nonEmpty: true, reconcile: true, fkAudit: true, vectors: false },
        })}\n`,
        'utf8'
      );

      expect(loadEtlReconcileSnapshot(reportPath)?.ok).toBe(false);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('requires deployed proof that the landed Zero write path is blocked', () => {
    expect(zeroWritePathOk(undefined)).toBe(false);
    expect(
      zeroWritePathOk({
        status: 'NOT_LANDED',
        note: 'historical planning-SHA claim',
      })
    ).toBe(false);
    expect(
      zeroWritePathOk({
        status: 'OPEN',
        note: 'a mutation reached Postgres',
      })
    ).toBe(false);
    expect(
      zeroWritePathOk({
        status: 'BLOCKED',
        note: 'both envelopes rejected and Postgres unchanged',
      })
    ).toBe(true);
  });
});
