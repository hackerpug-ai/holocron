/**
 * Sprint 14 — Big-Bang ETL + content-addressed BlobStore integration.
 *
 * Real-service lane only: live Postgres + live fleet + real filesystem blobs.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     pnpm vitest run services/platform/tests/integration/sprint14-etl-and-blob.test.ts
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client';
import {
  DANGEROUS_PROD_DB_OVERRIDE_ENV,
  resolveHolocronNonprodDatabaseUrl,
} from '../../src/db/connection';
import { deterministicUuidV7 } from '../../src/etl/deterministic-uuidv7';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const itLive = PLATFORM_IT ? it : it.skip;
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const HOLO = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const EXPORT_FIXTURE = resolve(REPO_ROOT, 'services/platform/tests/fixtures/etl-valid-export');
const CATALOG = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml'
);
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/sprint-14-impl');
const BLOB_ROOT = resolve(EVIDENCE_DIR, 'blob-store');
const DATABASE_URL = requireNonprodDatabaseUrl(
  process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod'
);

function requireNonprodDatabaseUrl(url: string): string {
  const databaseName = new URL(url).pathname.replace(/^\//, '');
  if (databaseName !== 'holocron_nonprod') {
    throw new Error(
      `Sprint 14 ETL tests must target holocron_nonprod (got ${databaseName || '(empty)'})`
    );
  }
  return url;
}

function requireSql(client: Sql | null): Sql {
  if (!client) {
    throw new Error('Sprint 14 ETL SQL client was not initialized');
  }
  return client;
}

function writeArtifact(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function runHolo(
  args: string[],
  env: Record<string, string | undefined> = {}
): { status: number | null; stdout: string; stderr: string } {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL,
    HOLO_BLOB_ROOT: BLOB_ROOT,
    ...env,
  };
  delete childEnv.DATABASE_URL_OWNER;
  const result = spawnSync('bun', [HOLO, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: childEnv,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function rewriteFirstJsonlRow(
  filePath: string,
  mutate: (row: Record<string, unknown>) => Record<string, unknown>
) {
  const lines = readFileSync(filePath, 'utf8').trimEnd().split('\n');
  const first = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
  lines[0] = JSON.stringify(mutate(first));
  writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

async function truncateSprint14Tables(sql: Sql): Promise<void> {
  await sql.unsafe(`
    TRUNCATE TABLE
      upload_intents,
      etl_stage,
      etl_runs,
      file_objects,
      convex_id_map,
      passages,
      sources,
      chat_messages,
      tool_calls,
      agent_plan_steps,
      agent_plans,
      agent_telemetry,
      citations,
      imports,
      research_findings,
      research_iterations,
      research_sessions,
      analysis_evidence,
      analysis_items,
      analysis_sessions,
      audio_segments,
      audio_jobs,
      video_transcripts,
      transcript_jobs,
      audio_transcripts,
      audio_transcript_jobs,
      improvement_images,
      improvement_requests,
      voice_commands,
      voice_sessions,
      tasks,
      documents,
      conversations
    RESTART IDENTITY CASCADE
  `);
}

describe('Sprint 14 ETL + blob verify', () => {
  let sql: Sql | null = null;

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    rmSync(BLOB_ROOT, { recursive: true, force: true });

    const migrate = runHolo(['db:migrate', '--json']);
    expect(migrate.status, `${migrate.stdout}\n${migrate.stderr}`).toBe(0);
    writeArtifact('etl-db-migrate.json', JSON.parse(migrate.stdout));

    sql = createSql(DATABASE_URL);
    await truncateSprint14Tables(sql);
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 }).catch(() => {});
  });

  it('runtime resolver ignores DATABASE_URL_OWNER and rejects production-like DATABASE_URL', () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousOwnerUrl = process.env.DATABASE_URL_OWNER;
    const previousDangerous = process.env[DANGEROUS_PROD_DB_OVERRIDE_ENV];

    process.env.DATABASE_URL = 'postgres://127.0.0.1:5432/holocron_nonprod';
    process.env.DATABASE_URL_OWNER = 'postgres://127.0.0.1:5432/holocron';
    delete process.env[DANGEROUS_PROD_DB_OVERRIDE_ENV];

    expect(resolveHolocronNonprodDatabaseUrl({ context: 'sprint14-etl-test' })).toContain(
      '/holocron_nonprod'
    );

    process.env.DATABASE_URL = 'postgres://127.0.0.1:5432/holocron';
    expect(() => resolveHolocronNonprodDatabaseUrl({ context: 'sprint14-etl-test' })).toThrow(
      /holocron_nonprod|production-like|non-nonprod/i
    );

    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousOwnerUrl === undefined) delete process.env.DATABASE_URL_OWNER;
    else process.env.DATABASE_URL_OWNER = previousOwnerUrl;
    if (previousDangerous === undefined) delete process.env[DANGEROUS_PROD_DB_OVERRIDE_ENV];
    else process.env[DANGEROUS_PROD_DB_OVERRIDE_ENV] = previousDangerous;
  });

  itLive(
    'etl/upload control-surface columns are UUID-typed and etl_stage.run_id is FK-backed',
    async () => {
      const db = requireSql(sql);
      const columns = await db<
        Array<{
          table_name: string;
          column_name: string;
          data_type: string;
          udt_name: string;
        }>
      >`
        SELECT table_name, column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (table_name = 'etl_stage' AND column_name = 'run_id') OR
            (table_name = 'upload_intents' AND column_name = 'target_id')
          )
        ORDER BY table_name, column_name
      `;
      expect(columns).toEqual([
        {
          table_name: 'etl_stage',
          column_name: 'run_id',
          data_type: 'uuid',
          udt_name: 'uuid',
        },
        {
          table_name: 'upload_intents',
          column_name: 'target_id',
          data_type: 'uuid',
          udt_name: 'uuid',
        },
      ]);

      const constraints = await db<Array<{ conname: string; definition: string }>>`
        SELECT conname, pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = 'etl_stage'::regclass
          AND conname = 'etl_stage_run_id_fkey'
      `;
      expect(constraints).toHaveLength(1);
      expect(constraints[0]?.definition).toMatch(
        /FOREIGN KEY \(run_id\) REFERENCES etl_runs\(id\) ON DELETE CASCADE/i
      );
    }
  );

  itLive(
    'etl:run stages immutable export, builds a stable id map, loads rows in canonical form, and reruns idempotently',
    async () => {
      const db = requireSql(sql);
      const sharedFixtureBytes = readFileSync(
        join(EXPORT_FIXTURE, '_storage', 'storage_improvementImages_storageId')
      );
      const sharedFixtureHash = createHash('sha256').update(sharedFixtureBytes).digest('hex');
      const preseedFileObjectId = deterministicUuidV7(0, `upload-file:${sharedFixtureHash}`);

      await db`
        INSERT INTO file_objects (
          id,
          legacy_convex_id,
          content_hash,
          mime_type,
          byte_size,
          storage_path,
          original_name,
          metadata_json
        )
        VALUES (
          ${preseedFileObjectId}::uuid,
          NULL,
          ${sharedFixtureHash},
          'image/png',
          ${sharedFixtureBytes.length},
          'preseed/upload-image.png',
          NULL,
          ${db.json({ source: 'upload', producers: ['upload'] })}
        )
      `;

      const first = runHolo([
        'etl:run',
        '--export',
        EXPORT_FIXTURE,
        '--catalog',
        CATALOG,
        '--json',
      ]);
      expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0);
      const firstReport = JSON.parse(first.stdout) as {
        ok: boolean;
        runId: string;
        archiveHash: string;
        stageRowCount: number;
        idMapCount: number;
        fileObjectCount: number;
      };
      expect(firstReport.ok).toBe(true);
      expect(firstReport.stageRowCount).toBeGreaterThan(0);
      expect(firstReport.idMapCount).toBeGreaterThan(20);
      expect(firstReport.fileObjectCount).toBe(5);

      const idRows = await db<Array<{ old_id: string; new_id: string }>>`
        SELECT old_id, new_id
        FROM convex_id_map
        ORDER BY old_id
      `;
      const mapDigest = createHash('sha256')
        .update(idRows.map((row) => `${row.old_id}:${row.new_id}`).join('\n'))
        .digest('hex');

      const loadedDoc = await db<
        Array<{
          id: string;
          legacy_convex_id: string;
          status: string;
        }>
      >`
        SELECT id::text AS id, legacy_convex_id, status
        FROM documents
        WHERE legacy_convex_id = 'doc_legacy_1'
      `;
      expect(loadedDoc[0]?.legacy_convex_id).toBe('doc_legacy_1');
      expect(loadedDoc[0]?.status).toBe('in_progress');

      const loadedMessage = await db<
        Array<{
          conversation_id: string | null;
          document_id: string | null;
          tool_call_id: string | null;
        }>
      >`
        SELECT conversation_id, document_id, tool_call_id
        FROM chat_messages
        WHERE legacy_convex_id = 'chat_legacy_1'
      `;
      expect(loadedMessage[0]?.conversation_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(loadedMessage[0]?.document_id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(loadedMessage[0]?.tool_call_id).toMatch(/^[0-9a-f-]{36}$/i);

      const sharedBlobRows = await db<
        Array<{
          id: string;
          legacy_convex_id: string | null;
          metadata_json: string | null;
        }>
      >`
        SELECT id::text AS id, legacy_convex_id, metadata_json::text AS metadata_json
        FROM file_objects
        WHERE content_hash = ${sharedFixtureHash}
      `;
      expect(sharedBlobRows).toHaveLength(1);
      expect(sharedBlobRows[0]?.id).toBe(preseedFileObjectId);
      expect(sharedBlobRows[0]?.legacy_convex_id).toBe('storage_improvementImages_storageId');
      const sharedBlobMetadata = JSON.parse(sharedBlobRows[0]?.metadata_json ?? '{}') as {
        legacyIds?: string[];
        producers?: string[];
      };
      expect(sharedBlobMetadata.legacyIds ?? []).toContain('storage_improvementImages_storageId');
      expect(sharedBlobMetadata.producers ?? []).toEqual(expect.arrayContaining(['etl', 'upload']));

      const improvementImageRows = await db<
        Array<{
          blob_id: string | null;
          file_object_id: string | null;
        }>
      >`
        SELECT blob_id, file_object_id
        FROM improvement_images
        WHERE legacy_convex_id = 'improvement_image_legacy_1'
      `;
      expect(improvementImageRows).toHaveLength(1);
      expect(improvementImageRows[0]?.blob_id).toBe(sharedFixtureHash);
      expect(improvementImageRows[0]?.file_object_id).toBe(preseedFileObjectId);

      const stageCount = await db<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM etl_stage
        WHERE run_id = ${firstReport.runId}::uuid
      `;
      expect(Number(stageCount[0]?.count ?? 0)).toBe(firstReport.stageRowCount);

      writeArtifact('etl-run-first.json', {
        firstReport,
        mapDigest,
        loadedDoc: loadedDoc[0],
        loadedMessage: loadedMessage[0],
        sharedBlob: sharedBlobRows[0],
      });

      const second = runHolo([
        'etl:run',
        '--export',
        EXPORT_FIXTURE,
        '--catalog',
        CATALOG,
        '--json',
      ]);
      expect(second.status, `${second.stdout}\n${second.stderr}`).toBe(0);
      const secondReport = JSON.parse(second.stdout) as {
        ok: boolean;
        archiveHash: string;
        idMapCount: number;
        fileObjectCount: number;
      };
      expect(secondReport.ok).toBe(true);
      expect(secondReport.archiveHash).toBe(firstReport.archiveHash);
      expect(secondReport.idMapCount).toBe(firstReport.idMapCount);
      expect(secondReport.fileObjectCount).toBe(firstReport.fileObjectCount);

      const idRowsAfter = await db<Array<{ old_id: string; new_id: string }>>`
        SELECT old_id, new_id
        FROM convex_id_map
        ORDER BY old_id
      `;
      const mapDigestAfter = createHash('sha256')
        .update(idRowsAfter.map((row) => `${row.old_id}:${row.new_id}`).join('\n'))
        .digest('hex');
      expect(mapDigestAfter).toBe(mapDigest);

      const counts = await db<
        Array<{
          documents_count: string;
          messages_count: string;
          file_objects_count: string;
        }>
      >`
        SELECT
          (SELECT count(*)::text FROM documents) AS documents_count,
          (SELECT count(*)::text FROM chat_messages) AS messages_count,
          (SELECT count(*)::text FROM file_objects) AS file_objects_count
      `;
      expect(Number(counts[0]?.documents_count ?? 0)).toBe(2);
      expect(Number(counts[0]?.messages_count ?? 0)).toBe(1);
      expect(Number(counts[0]?.file_objects_count ?? 0)).toBe(5);

      writeArtifact('etl-run-rerun.json', {
        secondReport,
        mapDigestAfter,
        counts: counts[0],
      });
    },
    240_000
  );

  itLive(
    'tampered archive fails closed before mutating target rows',
    async () => {
      const db = requireSql(sql);
      const before = await db<{ count: string }[]>`
        SELECT count(*)::text AS count FROM documents
      `;
      const tmp = mkdtempSync(join(tmpdir(), 'etl-tamper-'));
      const tampered = join(tmp, 'export');
      cpSync(EXPORT_FIXTURE, tampered, { recursive: true });
      writeFileSync(
        join(tampered, '_storage', 'storage_audioSegments_storageId'),
        'tampered-bytes'
      );

      const result = runHolo(['etl:run', '--export', tampered, '--catalog', CATALOG, '--json']);
      rmSync(tmp, { recursive: true, force: true });

      expect(result.status, `${result.stdout}\n${result.stderr}`).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/tamper|mismatch|sha|immutable/i);

      const after = await db<{ count: string }[]>`
        SELECT count(*)::text AS count FROM documents
      `;
      expect(after[0]?.count).toBe(before[0]?.count);

      writeArtifact('etl-run-tampered-red.json', {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        before: before[0]?.count,
        after: after[0]?.count,
      });
    },
    120_000
  );

  itLive(
    'catalog coverage and retained asset completeness fail closed before writes',
    async () => {
      const db = requireSql(sql);
      const before = await db<{ count: string }[]>`
        SELECT count(*)::text AS count FROM documents
      `;
      const tmp = mkdtempSync(join(tmpdir(), 'etl-coverage-'));
      const results: Record<string, { status: number | null; stdout: string; stderr: string }> = {};

      try {
        const rogueFieldExport = join(tmp, 'rogue-field');
        cpSync(EXPORT_FIXTURE, rogueFieldExport, { recursive: true });
        rewriteFirstJsonlRow(join(rogueFieldExport, 'documents', 'documents.jsonl'), (row) => ({
          ...row,
          rogueField: 'uncatalogued',
        }));
        results.rogueField = runHolo([
          'etl:run',
          '--export',
          rogueFieldExport,
          '--catalog',
          CATALOG,
          '--json',
        ]);
        expect(results.rogueField.status).not.toBe(0);
        expect(`${results.rogueField.stdout}\n${results.rogueField.stderr}`).toMatch(
          /unmapped field|rogueField/i
        );

        const rogueTableExport = join(tmp, 'rogue-table');
        cpSync(EXPORT_FIXTURE, rogueTableExport, { recursive: true });
        mkdirSync(join(rogueTableExport, 'rogueTable'), { recursive: true });
        writeFileSync(
          join(rogueTableExport, 'rogueTable', 'documents.jsonl'),
          `${JSON.stringify({ _id: 'rogue_1', _creationTime: 1700000002000, title: 'rogue' })}\n`,
          'utf8'
        );
        writeFileSync(
          join(rogueTableExport, '_tables', 'documents.jsonl'),
          `${readFileSync(join(rogueTableExport, '_tables', 'documents.jsonl'), 'utf8').trimEnd()}\n${JSON.stringify({ name: 'rogueTable' })}\n`,
          'utf8'
        );
        results.rogueTable = runHolo([
          'etl:run',
          '--export',
          rogueTableExport,
          '--catalog',
          CATALOG,
          '--json',
        ]);
        expect(results.rogueTable.status).not.toBe(0);
        expect(`${results.rogueTable.stdout}\n${results.rogueTable.stderr}`).toMatch(
          /unmapped table|rogueTable/i
        );

        const missingMetaExport = join(tmp, 'missing-meta');
        cpSync(EXPORT_FIXTURE, missingMetaExport, { recursive: true });
        rmSync(join(missingMetaExport, '_blob_meta.json'));
        results.missingMeta = runHolo([
          'etl:run',
          '--export',
          missingMetaExport,
          '--catalog',
          CATALOG,
          '--json',
        ]);
        expect(results.missingMeta.status).not.toBe(0);
        expect(`${results.missingMeta.stdout}\n${results.missingMeta.stderr}`).toMatch(
          /_blob_meta|missing required/i
        );

        const missingBlobExport = join(tmp, 'missing-blob');
        cpSync(EXPORT_FIXTURE, missingBlobExport, { recursive: true });
        rmSync(join(missingBlobExport, '_storage', 'storage_audioSegments_storageId'));
        results.missingBlob = runHolo([
          'etl:run',
          '--export',
          missingBlobExport,
          '--catalog',
          CATALOG,
          '--json',
        ]);
        expect(results.missingBlob.status).not.toBe(0);
        expect(`${results.missingBlob.stdout}\n${results.missingBlob.stderr}`).toMatch(
          /missing required blob|retained storage ref|_storage/i
        );

        const rogueBlobExport = join(tmp, 'rogue-blob');
        cpSync(EXPORT_FIXTURE, rogueBlobExport, { recursive: true });
        const rogueBlobBytes = Buffer.from('rogue-storage-blob-for-sprint-14');
        const rogueBlobId = 'storage_rogue_unmapped_blob';
        writeFileSync(join(rogueBlobExport, '_storage', rogueBlobId), rogueBlobBytes);
        const rogueBlobMeta = JSON.parse(
          readFileSync(join(rogueBlobExport, '_blob_meta.json'), 'utf8')
        ) as Record<string, { sha256: string; bytes: number; ref: string }>;
        rogueBlobMeta[rogueBlobId] = {
          sha256: createHash('sha256').update(rogueBlobBytes).digest('hex'),
          bytes: rogueBlobBytes.length,
          ref: 'rogue.storageRef',
        };
        writeFileSync(
          join(rogueBlobExport, '_blob_meta.json'),
          `${JSON.stringify(rogueBlobMeta, null, 2)}\n`,
          'utf8'
        );
        results.rogueBlob = runHolo([
          'catalog:verify',
          '--export',
          rogueBlobExport,
          '--catalog',
          CATALOG,
          '--json',
        ]);
        expect(results.rogueBlob.status).not.toBe(0);
        expect(`${results.rogueBlob.stdout}\n${results.rogueBlob.stderr}`).toMatch(
          /unmapped storage blob|approved retained or dropped storage ref|rogue_unmapped_blob/i
        );

        const rogueMetaExport = join(tmp, 'rogue-meta');
        cpSync(EXPORT_FIXTURE, rogueMetaExport, { recursive: true });
        const rogueMeta = JSON.parse(
          readFileSync(join(rogueMetaExport, '_blob_meta.json'), 'utf8')
        ) as Record<string, { sha256: string; bytes: number; ref: string }>;
        rogueMeta.storage_rogue_meta_only = {
          sha256: '1'.repeat(64),
          bytes: 17,
          ref: 'rogue.storageRef',
        };
        writeFileSync(
          join(rogueMetaExport, '_blob_meta.json'),
          `${JSON.stringify(rogueMeta, null, 2)}\n`,
          'utf8'
        );
        results.rogueMeta = runHolo([
          'etl:run',
          '--export',
          rogueMetaExport,
          '--catalog',
          CATALOG,
          '--json',
        ]);
        expect(results.rogueMeta.status).not.toBe(0);
        expect(`${results.rogueMeta.stdout}\n${results.rogueMeta.stderr}`).toMatch(
          /_blob_meta entry|matching blob file|storage_rogue_meta_only/i
        );
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }

      const after = await db<{ count: string }[]>`
        SELECT count(*)::text AS count FROM documents
      `;
      expect(after[0]?.count).toBe(before[0]?.count);

      writeArtifact('etl-coverage-and-assets-red.json', {
        before: before[0]?.count,
        after: after[0]?.count,
        results,
      });
    },
    180_000
  );

  itLive(
    'etl:reconcile, etl:fk-audit, etl:vectors, and blob:verify pass with seeded negatives that fail closed',
    async () => {
      const db = requireSql(sql);
      const reconcile = runHolo(['etl:reconcile', '--json']);
      expect(reconcile.status, `${reconcile.stdout}\n${reconcile.stderr}`).toBe(0);
      const reconcileReport = JSON.parse(reconcile.stdout) as {
        ok: boolean;
        unexplainedVariance: number;
        tableUnexplainedVariance: number;
        storageRefUnexplainedVariance: number;
        tables: Array<{
          table: string;
          expectedTargetFormula: string;
          approvalId: string;
          approvedExceptionId: string | null;
          catalogChecksumOrSample: string;
          sourceChecksum: string;
          sourceSampleLegacyIds: string[];
        }>;
        storageRefs: Array<{
          storageRef: string;
          expectedTargetFormula: string;
          approvalId: string;
          approvedExceptionId: string | null;
          catalogChecksumOrSample: string | null;
          sourceChecksum: string;
          sourceSampleLegacyIds: string[];
          sourceObjectCount: number;
          retainedExpectedCount: number;
          retainedLoadedCount: number;
          variance: number;
        }>;
        blobVerify: {
          parityFailures: number;
        };
      };
      expect(reconcileReport.ok).toBe(true);
      expect(reconcileReport.unexplainedVariance).toBe(0);
      expect(reconcileReport.tableUnexplainedVariance).toBe(0);
      expect(reconcileReport.storageRefUnexplainedVariance).toBe(0);
      expect(reconcileReport.blobVerify.parityFailures).toBe(0);
      const documentsRow = reconcileReport.tables.find((row) => row.table === 'documents');
      expect(documentsRow?.expectedTargetFormula).toBe('count(source)');
      expect(documentsRow?.approvalId).toMatch(/^APR-/);
      expect(documentsRow?.catalogChecksumOrSample).toBeTruthy();
      expect(documentsRow?.sourceChecksum).toMatch(/^[0-9a-f]{64}$/i);
      expect(documentsRow?.sourceSampleLegacyIds.length ?? 0).toBeGreaterThan(0);
      const dropRow = reconcileReport.tables.find((row) => row.approvedExceptionId != null);
      expect(dropRow?.approvedExceptionId).toMatch(/^APR-/);

      const retainedStorageRef = reconcileReport.storageRefs.find(
        (row) => row.storageRef === 'audioSegments.storageId'
      );
      expect(retainedStorageRef?.expectedTargetFormula).toBe('count(source_objects)');
      expect(retainedStorageRef?.approvalId).toBe('APR-MIG-STORAGE-001');
      expect(retainedStorageRef?.catalogChecksumOrSample).toBe('sha256-from-blob-bytes');
      expect(retainedStorageRef?.sourceChecksum).toMatch(/^[0-9a-f]{64}$/i);
      expect(retainedStorageRef?.sourceSampleLegacyIds.length ?? 0).toBeGreaterThan(0);
      expect(retainedStorageRef?.sourceObjectCount).toBe(1);
      expect(retainedStorageRef?.retainedExpectedCount).toBe(1);
      expect(retainedStorageRef?.retainedLoadedCount).toBe(1);
      expect(retainedStorageRef?.variance).toBe(0);

      const droppedStorageRef = reconcileReport.storageRefs.find(
        (row) => row.storageRef === 'audioTranscriptJobs.audioStorageId'
      );
      expect(droppedStorageRef?.expectedTargetFormula).toBe('0');
      expect(droppedStorageRef?.approvedExceptionId).toBe('APR-MIG-DROP-TEMP-AUDIO-001');
      expect(droppedStorageRef?.retainedExpectedCount).toBe(0);
      expect(droppedStorageRef?.retainedLoadedCount).toBe(0);
      expect(droppedStorageRef?.variance).toBe(0);

      const fkAudit = runHolo(['etl:fk-audit', '--json']);
      expect(fkAudit.status, `${fkAudit.stdout}\n${fkAudit.stderr}`).toBe(0);
      const fkReport = JSON.parse(fkAudit.stdout) as {
        ok: boolean;
        orphans: number;
        checkedRelationships: number;
      };
      expect(fkReport.ok).toBe(true);
      expect(fkReport.orphans).toBe(0);
      expect(fkReport.checkedRelationships).toBeGreaterThan(0);

      const vectors = runHolo(['etl:vectors', '--json']);
      expect(vectors.status, `${vectors.stdout}\n${vectors.stderr}`).toBe(0);
      const vectorReport = JSON.parse(vectors.stdout) as {
        ok: boolean;
        documentsProcessed: number;
        passagesInserted: number;
        embed: {
          processed: number;
          remainingNull: number;
          modelId: string;
          modelRevision: string;
          endpoint: string;
          provider: string;
          embeddingDimension: number;
        };
        fleetProbe: {
          probeVectorNorm: number;
          probeUnitNormOk: boolean;
        };
        unitNorm: { checked: number; violations: number; maxDeviation: number; tolerance: number };
        retrieval: {
          ok: boolean;
          matchedMarker: boolean;
          hitPassageId: string | null;
          hitDocumentId: string | null;
          searchMethod: string | null;
        };
        markerFoundPast8k: boolean;
      };
      expect(vectorReport.ok).toBe(true);
      expect(vectorReport.documentsProcessed).toBeGreaterThanOrEqual(1);
      expect(vectorReport.passagesInserted).toBeGreaterThanOrEqual(2);
      expect(vectorReport.embed.remainingNull).toBe(0);
      expect(vectorReport.embed.modelId).toBeTruthy();
      expect(vectorReport.embed.modelRevision).toBeTruthy();
      expect(vectorReport.embed.embeddingDimension).toBe(1024);
      expect(vectorReport.unitNorm.checked).toBeGreaterThanOrEqual(2);
      expect(vectorReport.unitNorm.violations).toBe(0);
      expect(vectorReport.retrieval.ok).toBe(true);
      expect(vectorReport.retrieval.matchedMarker).toBe(true);
      expect(vectorReport.retrieval.hitPassageId).toBeTruthy();
      expect(vectorReport.retrieval.searchMethod).toBe('rrf');
      expect(vectorReport.markerFoundPast8k).toBe(true);
      expect(Number.isFinite(vectorReport.fleetProbe.probeVectorNorm)).toBe(true);
      expect(vectorReport.fleetProbe.probeUnitNormOk).toBe(true);
      expect(Math.abs(vectorReport.fleetProbe.probeVectorNorm - 1)).toBeLessThanOrEqual(0.02);

      const passageStats = await db<
        Array<{
          total: string;
          nulls: string;
          wrong_dims: string;
          non_unit: string;
        }>
      >`
        SELECT
          count(*)::text AS total,
          count(*) FILTER (WHERE embedding IS NULL)::text AS nulls,
          count(*) FILTER (WHERE vector_dims(embedding) <> 1024)::text AS wrong_dims,
          count(*) FILTER (
            WHERE embedding IS NOT NULL
              AND abs(sqrt(greatest((embedding <#> embedding) * -1, 0)) - 1.0) > 0.02
          )::text AS non_unit
        FROM passages
      `;
      expect(Number(passageStats[0]?.total ?? 0)).toBeGreaterThanOrEqual(2);
      expect(Number(passageStats[0]?.nulls ?? -1)).toBe(0);
      expect(Number(passageStats[0]?.wrong_dims ?? -1)).toBe(0);
      expect(Number(passageStats[0]?.non_unit ?? -1)).toBe(0);

      const verify = runHolo(['blob:verify', '--json']);
      expect(verify.status, `${verify.stdout}\n${verify.stderr}`).toBe(0);
      const verifyReport = JSON.parse(verify.stdout) as {
        ok: boolean;
        retainedCount: number;
        parityFailures: number;
        rangeProbe: { status: number; exact: boolean };
      };
      expect(verifyReport.ok).toBe(true);
      expect(verifyReport.retainedCount).toBe(5);
      expect(verifyReport.parityFailures).toBe(0);
      expect(verifyReport.rangeProbe.status).toBe(206);
      expect(verifyReport.rangeProbe.exact).toBe(true);

      writeArtifact('etl-green-gates.json', {
        reconcileReport,
        fkReport,
        vectorReport,
        verifyReport,
        passageStats: passageStats[0],
      });

      const badFormulaTmp = mkdtempSync(join(tmpdir(), 'etl-reconcile-formula-'));
      const badFormulaCatalog = join(badFormulaTmp, 'catalog.yaml');
      writeFileSync(
        badFormulaCatalog,
        readFileSync(CATALOG, 'utf8').replace(
          'expected_target_formula: count(source_objects)',
          'expected_target_formula: count(source_objects)+1'
        ),
        'utf8'
      );
      const reconcileRed = runHolo(['etl:reconcile', '--catalog', badFormulaCatalog, '--json']);
      rmSync(badFormulaTmp, { recursive: true, force: true });
      expect(reconcileRed.status, `${reconcileRed.stdout}\n${reconcileRed.stderr}`).not.toBe(0);
      expect(`${reconcileRed.stdout}\n${reconcileRed.stderr}`).toMatch(
        /unsupported expected_target_formula|count\(source_objects\)\+1/i
      );
      writeArtifact('etl-reconcile-red-unsupported-formula.json', {
        status: reconcileRed.status,
        stdout: reconcileRed.stdout,
        stderr: reconcileRed.stderr,
      });

      const seededOrphan = await db<Array<{ id: string }>>`
        SELECT id::text AS id
        FROM chat_messages
        WHERE legacy_convex_id = 'chat_legacy_1'
      `;
      await db`
        UPDATE chat_messages
        SET document_id = '00000000-0000-7000-8000-000000000999'
        WHERE id = ${seededOrphan[0]?.id}::uuid
      `;
      const fkRed = runHolo(['etl:fk-audit', '--json']);
      expect(fkRed.status, `${fkRed.stdout}\n${fkRed.stderr}`).not.toBe(0);
      expect(`${fkRed.stdout}\n${fkRed.stderr}`).toMatch(/orphan|document_id|chat_messages/i);
      writeArtifact('etl-fk-audit-red.json', {
        status: fkRed.status,
        stdout: fkRed.stdout,
        stderr: fkRed.stderr,
      });

      await db`
        UPDATE chat_messages
        SET document_id = (
          SELECT new_id FROM convex_id_map WHERE old_id = 'doc_legacy_1'
        )
        WHERE id = ${seededOrphan[0]?.id}::uuid
      `;

      await db`
        DELETE FROM convex_id_map
        WHERE old_id = 'doc_legacy_1'
      `;
      const fkMissingMap = runHolo(['etl:fk-audit', '--json']);
      expect(fkMissingMap.status, `${fkMissingMap.stdout}\n${fkMissingMap.stderr}`).not.toBe(0);
      expect(`${fkMissingMap.stdout}\n${fkMissingMap.stderr}`).toMatch(
        /missing_id_map|doc_legacy_1|document_id/i
      );
      writeArtifact('etl-fk-audit-red-missing-id-map.json', {
        status: fkMissingMap.status,
        stdout: fkMissingMap.stdout,
        stderr: fkMissingMap.stderr,
      });

      const restoreRun = runHolo([
        'etl:run',
        '--export',
        EXPORT_FIXTURE,
        '--catalog',
        CATALOG,
        '--json',
      ]);
      expect(restoreRun.status, `${restoreRun.stdout}\n${restoreRun.stderr}`).toBe(0);

      const storedBlob = await db<Array<{ storage_path: string }>>`
        SELECT storage_path
        FROM file_objects
        WHERE legacy_convex_id = 'storage_improvementImages_storageId'
      `;
      const blobPath = join(BLOB_ROOT, storedBlob[0]?.storage_path ?? 'missing');
      const original = readFileSync(blobPath);
      const tampered = Buffer.concat([
        original.subarray(0, original.length - 1),
        Buffer.from([0x00]),
      ]);
      writeFileSync(blobPath, tampered);

      const blobRed = runHolo(['blob:verify', '--json']);
      expect(blobRed.status, `${blobRed.stdout}\n${blobRed.stderr}`).not.toBe(0);
      expect(`${blobRed.stdout}\n${blobRed.stderr}`).toMatch(/sha|bytes|parity|mismatch/i);
      writeArtifact('blob-verify-red.json', {
        status: blobRed.status,
        stdout: blobRed.stdout,
        stderr: blobRed.stderr,
      });

      writeFileSync(blobPath, original);
      const restore = runHolo(['blob:verify', '--json']);
      expect(restore.status, `${restore.stdout}\n${restore.stderr}`).toBe(0);

      const deadFleet = runHolo(['etl:vectors', '--json'], {
        FLEET_URL: 'http://127.0.0.1:1',
      });
      expect(deadFleet.status, `${deadFleet.stdout}\n${deadFleet.stderr}`).not.toBe(0);
      expect(`${deadFleet.stdout}\n${deadFleet.stderr}`).toMatch(
        /unreachable|refused|health|down|ECONNREFUSED|embed/i
      );
      writeArtifact('etl-vectors-red-dead-fleet.json', {
        status: deadFleet.status,
        stdout: deadFleet.stdout,
        stderr: deadFleet.stderr,
      });
    },
    360_000
  );
});
