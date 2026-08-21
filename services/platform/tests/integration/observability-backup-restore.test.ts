/**
 * OBS-04C — Langfuse consistent backup, isolated restore, restart, rollback.
 *
 * Uses a unique absent Compose project and fresh volumes. Never mounts
 * production volumes and never runs `docker compose down -v`.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/observability-backup-restore.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/OBS-04');

function requirePlatformIt(): void {
  if (!PLATFORM_IT) {
    throw new Error('PLATFORM_IT=1 required for OBS-04 backup/restore — refusing skip-to-green');
  }
}

function writeEvidence(name: string, content: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    resolve(EVIDENCE_DIR, name),
    typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`,
    'utf8'
  );
}

function dockerVolumeNames(): string[] {
  const r = spawnSync('docker', ['volume', 'ls', '--format', '{{.Name}}'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  expect(r.status).toBe(0);
  return r.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

describe('OBS-04 backup restore lifecycle', () => {
  it('AC-3: consistent backup restores witnesses into an isolated project', async () => {
    requirePlatformIt();

    const backupModule = await import('../../src/backup/langfuse-backup.ts');
    expect(
      'runLangfuseConsistentBackup' in backupModule,
      'langfuse-backup must export runLangfuseConsistentBackup'
    ).toBe(true);
    const restoreModule = await import('../../src/backup/langfuse-restore.ts');
    expect(
      'runIsolatedLangfuseRestore' in restoreModule,
      'langfuse-restore must export runIsolatedLangfuseRestore'
    ).toBe(true);

    const volumesBefore = new Set(dockerVolumeNames());

    const backup = await (
      backupModule as {
        runLangfuseConsistentBackup: (input: {
          evidenceDir: string;
          sourceProject: string;
        }) => Promise<{
          ok: boolean;
          resticSnapshotCount: number;
          expectedWitnessMismatchCount: number;
          manifestPath: string;
          witnesses: {
            traceId: string;
            observationId?: string;
            scoreId?: string;
            objectKey?: string;
            eventId?: string;
          };
          productionVolumeMountCount: number;
          otelQueueBackedUp: boolean;
          publicApiWitnessMismatchCount: number;
        }>;
      }
    ).runLangfuseConsistentBackup({
      evidenceDir: EVIDENCE_DIR,
      sourceProject: process.env.OBS04_SOURCE_PROJECT?.trim() || 'obs01-canary',
    });

    expect(backup.ok, 'backup must succeed against real services').toBe(true);
    expect(backup.resticSnapshotCount, 'resticSnapshotCount >= 1').toBeGreaterThanOrEqual(1);
    expect(backup.expectedWitnessMismatchCount, 'expectedWitnessMismatchCount:0').toBe(0);
    expect(backup.productionVolumeMountCount, 'productionVolumeMountCount').toBe(0);
    expect(existsSync(backup.manifestPath)).toBe(true);
    expect(backup.witnesses.traceId, 'seeded trace witness').toBeTruthy();
    expect(backup.witnesses.observationId, 'seeded observation witness').toBeTruthy();
    expect(backup.witnesses.scoreId, 'seeded Langfuse score witness required').toBeTruthy();
    expect(backup.witnesses.objectKey, 'seeded object/media witness required').toBeTruthy();
    expect(backup.witnesses.eventId, 'seeded first-party event witness').toBeTruthy();
    expect(
      backup.otelQueueBackedUp,
      'otel-queue backup must succeed fail-closed (not silent skip)'
    ).toBe(true);

    const restoreProject =
      process.env.OBS04_RESTORE_PROJECT?.trim() || `obs04-restore-${Date.now().toString(36)}`;

    const restore = await (
      restoreModule as {
        runIsolatedLangfuseRestore: (input: {
          evidenceDir: string;
          restoreProject: string;
          manifestPath: string;
          productionVolumeDenyList: string[];
        }) => Promise<{
          ok: boolean;
          restoreProjectDistinct: true;
          expectedWitnessMismatchCount: number;
          publicApiWitnessMismatchCount: number;
          eventSqlWitnessMismatchCount: number;
          productionVolumeMountCount: number;
          resticSnapshotCount: number;
          restoredInventoryEmpty: boolean;
        }>;
      }
    ).runIsolatedLangfuseRestore({
      evidenceDir: EVIDENCE_DIR,
      restoreProject,
      manifestPath: backup.manifestPath,
      productionVolumeDenyList: [
        'holocron-postgres',
        'holocron-blobs',
        'holocron-production',
        'langfuse-postgres',
        'clickhouse-data',
        'minio-data',
        'redis-data',
        'otel-collector-queue',
      ],
    });

    expect(restore.ok).toBe(true);
    expect(restore.restoreProjectDistinct).toBe(true);
    expect(restore.expectedWitnessMismatchCount, 'expectedWitnessMismatchCount:0').toBe(0);
    expect(
      restore.publicApiWitnessMismatchCount,
      'public API witness mismatch must be 0 (trace/observation/score/object)'
    ).toBe(0);
    expect(
      restore.eventSqlWitnessMismatchCount,
      'first-party event SQL witness mismatch must be 0'
    ).toBe(0);
    expect(restore.productionVolumeMountCount, 'productionVolumeMountCount').toBe(0);
    expect(restore.resticSnapshotCount).toBeGreaterThanOrEqual(1);
    expect(restore.restoredInventoryEmpty, 'empty restored inventory').toBe(false);

    const volumesAfter = dockerVolumeNames();
    for (const name of volumesBefore) {
      expect(volumesAfter.includes(name), `production/source volume ${name} must remain`).toBe(
        true
      );
    }

    const parity = {
      expectedWitnessMismatchCount: restore.expectedWitnessMismatchCount,
      publicApiWitnessMismatchCount: restore.publicApiWitnessMismatchCount,
      eventSqlWitnessMismatchCount: restore.eventSqlWitnessMismatchCount,
      restoreProjectDistinct: true,
      resticSnapshotCount: restore.resticSnapshotCount,
      productionVolumeMountCount: restore.productionVolumeMountCount,
      restoreProject,
      sourceProject: process.env.OBS04_SOURCE_PROJECT?.trim() || 'obs01-canary',
      scoreId: backup.witnesses.scoreId,
      objectKey: backup.witnesses.objectKey,
      otelQueueBackedUp: backup.otelQueueBackedUp,
    };
    writeEvidence('backup-manifest.json', JSON.parse(readFileSync(backup.manifestPath, 'utf8')));
    writeEvidence('isolated-restore-parity.json', parity);
    writeEvidence('AC-3-seeded-artifact.json', parity);
  }, 900_000);

  it('AC-4: cold restart retains witnesses and incompatible rollback refuses before mutation', async () => {
    requirePlatformIt();

    const restoreModule = await import('../../src/backup/langfuse-restore.ts');
    expect(
      'proveLangfuseColdRestart' in restoreModule,
      'langfuse-restore must export proveLangfuseColdRestart'
    ).toBe(true);
    expect(
      'evaluateLangfuseRollback' in restoreModule,
      'langfuse-restore must export evaluateLangfuseRollback'
    ).toBe(true);

    const volumesBefore = new Set(dockerVolumeNames());

    const parityPath = resolve(EVIDENCE_DIR, 'isolated-restore-parity.json');
    expect(existsSync(parityPath), 'AC-3 isolated-restore-parity.json required before AC-4').toBe(
      true
    );
    const parity = JSON.parse(readFileSync(parityPath, 'utf8')) as { restoreProject?: string };
    const project =
      process.env.OBS04_RESTORE_PROJECT?.trim() ||
      parity.restoreProject ||
      'obs04-restore-lifecycle';

    const restart = await (
      restoreModule as {
        proveLangfuseColdRestart: (input: { evidenceDir: string; project: string }) => Promise<{
          ok: boolean;
          restartWitnessMismatchCount: number;
          publicApiWitnessMismatchCount: number;
          stateVolumeRecreated: boolean;
        }>;
      }
    ).proveLangfuseColdRestart({
      evidenceDir: EVIDENCE_DIR,
      project,
    });

    expect(restart.ok).toBe(true);
    expect(restart.restartWitnessMismatchCount, 'restartWitnessMismatchCount:0').toBe(0);
    expect(
      restart.publicApiWitnessMismatchCount,
      'cold restart must retain full public API witness set'
    ).toBe(0);
    expect(restart.stateVolumeRecreated, 'stateVolumeRecreated').toBe(false);

    const postgresContainer = `${project}-langfuse-postgres-1`;
    const currentImage =
      'docker.io/langfuse/langfuse@sha256:c2350a95d710f726f6466ffd47675eb704d0ff77fa1df1b9e6751ada6134ef75';
    // Older local Langfuse image whose prisma migration set is a strict subset of current.
    const olderImage =
      'docker.io/langfuse/langfuse@sha256:cff59a366f9773f9e1d7060655cc63441b1e4ad27e8ad40ebdaebe2151a014cb';

    const compatible = await (
      restoreModule as {
        evaluateLangfuseRollback: (input: {
          previousImage: string;
          postgresContainer: string;
          mutate?: boolean;
        }) => Promise<{
          ok: boolean;
          compatibleRollbackMismatchCount: number;
          incompatibleRollbackExitCode: number;
          incompatibleApplyCount: number;
          reason?: string;
          probeMethod?: string;
        }>;
      }
    ).evaluateLangfuseRollback({
      previousImage: currentImage,
      postgresContainer,
      mutate: false,
    });
    expect(compatible.compatibleRollbackMismatchCount).toBe(0);
    expect(compatible.probeMethod, 'must use real previous-image schema probe').toBe(
      'previous-image-prisma-migrations'
    );

    const incompatible = await (
      restoreModule as {
        evaluateLangfuseRollback: (input: {
          previousImage: string;
          postgresContainer: string;
          mutate?: boolean;
        }) => Promise<{
          ok: boolean;
          compatibleRollbackMismatchCount: number;
          incompatibleRollbackExitCode: number;
          incompatibleApplyCount: number;
          reason?: string;
          probeMethod?: string;
        }>;
      }
    ).evaluateLangfuseRollback({
      previousImage: olderImage,
      postgresContainer,
      mutate: true,
    });
    expect(incompatible.incompatibleRollbackExitCode, 'incompatibleRollbackExitCode != 0').not.toBe(
      0
    );
    expect(incompatible.reason).toMatch(/ROLLBACK_SCHEMA_INCOMPATIBLE/);
    expect(incompatible.incompatibleApplyCount, 'incompatibleApplyCount').toBe(0);
    expect(incompatible.probeMethod).toBe('previous-image-prisma-migrations');

    for (const name of volumesBefore) {
      expect(dockerVolumeNames().includes(name)).toBe(true);
    }

    const matrix = {
      restartWitnessMismatchCount: restart.restartWitnessMismatchCount,
      compatibleRollbackMismatchCount: compatible.compatibleRollbackMismatchCount,
      incompatibleRollbackExitCode: incompatible.incompatibleRollbackExitCode,
      incompatibleApplyCount: incompatible.incompatibleApplyCount,
      stateVolumeRecreated: restart.stateVolumeRecreated,
    };
    writeEvidence('restart.json', restart);
    writeEvidence('rollback-matrix.json', matrix);
    writeEvidence('AC-4-seeded-artifact.json', matrix);
  }, 900_000);
});
