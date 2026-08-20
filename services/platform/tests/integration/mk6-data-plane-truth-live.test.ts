/**
 * MK6-DATA-001 v2 — live composite-corpus contract.
 *
 * These tests are integration-gated. They deliberately require the canonical
 * operator corpus and never create a fixture or fake a database/service.
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const enabled = process.env.PLATFORM_IT === '1';
const redEvidence = process.env.MK6_RED_EVIDENCE === '1';
const canonicalRoot = process.env.MK6_DATA_CANONICAL_ROOT ?? '/Users/justinrich/.holocron';
const runRoot = process.env.MK6_DATA_RUN_ROOT;
const repoRoot = resolve(import.meta.dirname, '../../../..');
const verifyScript = resolve(repoRoot, 'scripts/verify-mk6-data-plane-truth.sh');

const itLive = enabled && existsSync(canonicalRoot) ? it : it.skip;
const itRed = redEvidence ? it : it.skip;

let hono: ChildProcess | undefined;
const isolatedDb =
  process.env.MK6_DATA_DATABASE_URL ?? 'postgres://justinrich@127.0.0.1:5432/holocron_mk6_isolated';

async function runVerifier(
  args: string[]
): Promise<{ result: Record<string, unknown>; exitCode: number }> {
  try {
    const { stdout } = await execFileAsync('bash', [verifyScript, ...args, '--json'], {
      cwd: repoRoot,
      env: { ...process.env, PLATFORM_IT: '1', MK6_DATA_DATABASE_URL: isolatedDb },
      timeout: 2_400_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    const lastJson = stdout
      .trim()
      .split('\n')
      .reverse()
      .find((line) => line.startsWith('{'));
    if (!lastJson) throw new Error(`verifier emitted no JSON: ${stdout.slice(0, 400)}`);
    return { result: JSON.parse(lastJson) as Record<string, unknown>, exitCode: 0 };
  } catch (error) {
    const err = error as { stdout?: string; status?: number };
    const lastJson = (err.stdout ?? '')
      .trim()
      .split('\n')
      .reverse()
      .find((line) => line.startsWith('{'));
    if (!lastJson) throw error;
    return {
      result: JSON.parse(lastJson) as Record<string, unknown>,
      exitCode: typeof err.status === 'number' ? err.status : 1,
    };
  }
}

beforeAll(async () => {
  if (!enabled || existsSync(canonicalRoot) === false) return;
  if (process.env.MK6_DATA_EXTERNAL_BASE_URL) return;
  const evidence = resolve(repoRoot, '.tmp/MK6-DATA-001/live-hono');
  mkdirSync(evidence, { recursive: true });
  const rnKey = process.env.HOLO_KEY_RN ?? 'mk6-isolated-live';
  const secrets = resolve(evidence, 'secrets.yaml');
  writeFileSync(
    secrets,
    `HOLO_DATA_PLANE: postgres\nHOLO_ROLLBACK_TARGET: postgres\nHOLO_MIGRATION_READ_ONLY: "1"\nHOLO_KEY_RN: ${rnKey}\n`
  );
  const port = 43111 + Math.floor(Math.random() * 400);
  const sourceRevision = (
    await execFileAsync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'])
  ).stdout.trim();
  const imageDigest = `sha256:${(await execFileAsync('shasum', ['-a', '256', resolve(repoRoot, 'services/platform/src/http/hono-app.ts')])).stdout.split(' ')[0]}`;
  const composeSha = (
    await execFileAsync('shasum', [
      '-a',
      '256',
      resolve(repoRoot, 'services/platform/deploy/nonprod/mk6-verification.compose.yaml'),
    ])
  ).stdout.split(' ')[0];
  hono = spawn(
    'bun',
    [resolve(repoRoot, 'services/platform/src/etl/composite-corpus.ts'), '--serve-isolated'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: String(port),
        DATABASE_URL: isolatedDb,
        HOLO_DANGEROUS_ALLOW_PROD_DB: '1',
        HOLO_SECRETS_PATH: secrets,
        HOLOCRON_SECRETS_PATH: secrets,
        HOLO_DATA_PLANE: 'postgres',
        HOLO_ROLLBACK_TARGET: 'postgres',
        HOLO_MIGRATION_READ_ONLY: '1',
        HOLO_KEY_RN: rnKey,
        HOLO_KEY_MCP: 'mk6-mcp-live',
        HOLO_KEY_CONTROL: 'mk6-ctl-live',
        HOLO_DEPLOY_HOST: '127.0.0.1',
        HOLO_DEPLOY_RUNTIME: 'container',
        HOLO_IMAGE_DIGEST: imageDigest,
        HOLO_SOURCE_REVISION: sourceRevision,
        HOLO_COMPOSE_GENERATION: 'mk6iso-livetest',
        HOLO_COMPOSE_SHA256: composeSha,
        HOLO_DEPLOYED_AT: new Date().toISOString().replace(/\.\d+Z$/, '.000Z'),
      },
      stdio: 'ignore',
    }
  );
  process.env.MK6_DATA_EXTERNAL_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.HOLO_KEY_RN = rnKey;
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`${process.env.MK6_DATA_EXTERNAL_BASE_URL}/health`);
      if (res.status === 200 || res.status === 503) return;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
  }
  throw new Error('pre-existing isolated Hono did not become reachable');
}, 30_000);

afterAll(() => {
  hono?.kill('SIGTERM');
});

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
      const { result, exitCode } = await runVerifier(['--case', 'composite-positive']);
      expect(exitCode).toBe(0);
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
        missingReferencedBlobCount?: number;
        blobHashMismatchCount?: number;
        contentDigestMismatchCount?: number;
      };
      const witnesses = result.witnesses as Array<{ sourceOrigin: string }>;
      expect(load.etlRunId).toEqual(expect.any(String));
      expect(load.etlRunId?.length).toBeGreaterThan(0);
      expect(reconcile.ok).toBe(true);
      expect(reconcile.sourceToTargetMismatchCount).toBe(0);
      expect(reconcile.targetToSourceMismatchCount).toBe(0);
      expect(reconcile.fkOrphanCount).toBe(0);
      expect(reconcile.missingReferencedBlobCount).toBe(0);
      expect(reconcile.blobHashMismatchCount).toBe(0);
      expect(reconcile.contentDigestMismatchCount).toBe(0);
      expect(witnesses.map((row) => row.sourceOrigin).sort()).toEqual(['convex', 'local']);
    },
    2_400_000
  );

  itLive(
    'rejects count-equal content corruption after a healthy isolated baseline',
    async () => {
      const { result, exitCode } = await runVerifier([
        '--negative-control',
        'count-equal-content-corrupt',
      ]);
      expect(exitCode).toBe(0);
      expect(result.ok).toBe(true);
      expect(result.failureClass).toBe('CONTENT_DIGEST_MISMATCH');
    },
    2_400_000
  );

  itLive('fails closed on an unknown negative-control name', async () => {
    const { result, exitCode } = await runVerifier(['--negative-control', 'not-a-real-control']);
    expect(exitCode).not.toBe(0);
    expect(result.ok).toBe(false);
    expect(result.failureClass).toBe('UNKNOWN_NEGATIVE_CONTROL');
  });

  itLive('rejects identity-source mutants instead of loading them', async () => {
    const { result, exitCode } = await runVerifier(['--negative-control', 'identity-source-matrix']);
    expect(exitCode).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.failureClass).toBe('SOURCE_ADMISSION_REJECTED');
  }, 120_000);

  itLive('rejects a verifier-created self-minted listener', async () => {
    const { result, exitCode } = await runVerifier([
      '--negative-control',
      'external-binding-matrix',
    ]);
    expect(exitCode).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.failureClass).toBe('HONO_PID_INVALID');
  });

  itLive(
    'rejects provenance, snapshot, inventory, auth, and witness-route mutants',
    async () => {
      const cases = [
        ['provenance-matrix', 'SOURCE_SET_INCOMPLETE'],
        ['snapshot-blob-matrix', 'SNAPSHOT_DRIFT_REJECTED'],
        ['full-inventory-matrix', 'INVENTORY_OMITTED'],
        ['witness-auth-matrix', 'WITNESS_AUTH_REJECTED'],
        ['external-witness-contract-matrix', 'WITNESS_ROUTE_REJECTED'],
      ] as const;
      for (const [name, failureClass] of cases) {
        const { result, exitCode } = await runVerifier(['--negative-control', name]);
        expect(exitCode, name).toBe(0);
        expect(result.ok, name).toBe(true);
        expect(result.failureClass, name).toBe(failureClass);
      }
    },
    2_400_000
  );
});
