/**
 * D07-01 RED — data_plane_ponr DB-level immutability (UC-SYNC-04 / T-SYNC-014).
 *
 * AC-4: holocron_app UPDATE/DELETE → SQLSTATE 42501;
 *       owner UPDATE/DELETE → SQLSTATE P0001 PONR_IMMUTABLE;
 *       row count remains 1 with digest unchanged.
 * FAILS at planning SHA: relation "data_plane_ponr" does not exist.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint30-ponr-immutability.test.ts
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSql } from '../../src/db/client.ts';
import { HOLOCRON_APP_ROLE, toAppRoleDatabaseUrl } from '../../src/db/evidence/roles.ts';
import {
  DISPOSABLE_SECRETS,
  ENABLE_WRITES_REPORT_PATH,
  holo,
  holoEnv,
  PLATFORM_IT,
  type PreexistingServing,
  resolveTestDatabaseUrl,
  seedDisposableSecrets,
  seedEmptyPostExportAudit,
  seedExportWatermark,
  selectPonrRow,
  startPreexistingServing,
  waitHealth,
  withCutoverSharedLock,
  writeEvidence,
} from './sprint30-cutover-harness.ts';

if (!PLATFORM_IT) {
  throw new Error('sprint30-ponr-immutability requires PLATFORM_IT=1');
}

describe('D07-01 RED: data_plane_ponr immutability (DB SQLSTATE)', () => {
  const priorSecrets = process.env.HOLO_SECRETS_PATH;
  let liveServing: PreexistingServing | undefined;

  beforeEach(() => {
    seedDisposableSecrets({ readOnly: '1' });
    const { exportMs } = seedExportWatermark();
    seedEmptyPostExportAudit(exportMs);
    process.env.HOLO_SECRETS_PATH = DISPOSABLE_SECRETS;
    liveServing = undefined;
  });

  afterEach(async () => {
    if (liveServing) {
      await liveServing.stop();
      liveServing = undefined;
    }
    if (priorSecrets !== undefined) process.env.HOLO_SECRETS_PATH = priorSecrets;
    else delete process.env.HOLO_SECRETS_PATH;
  });

  it('AC-2: app-role 42501 and owner P0001 PONR_IMMUTABLE; second INSERT 23505', async () => {
    await withCutoverSharedLock(async () => {
      seedDisposableSecrets({ readOnly: '1' });
      const { exportMs } = seedExportWatermark();
      seedEmptyPostExportAudit(exportMs);

      liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
      await waitHealth(liveServing.baseUrl);
      const env = holoEnv(liveServing.baseUrl, liveServing.pid);

      // Record PONR via cutover:enable-writes (idempotent if already present)
      const enable = holo(
        ['cutover:enable-writes', '--json', '--output', ENABLE_WRITES_REPORT_PATH],
        env
      );
      writeEvidence('ac4-enable-writes.json', {
        status: enable.status,
        stdout: enable.stdout,
        stderr: enable.stderr,
      });

      const databaseUrl = resolveTestDatabaseUrl();
      const ownerSql = createSql(databaseUrl);

      let beforeId = '';
      let beforeDigest: string | null = null;
      try {
        const before = await selectPonrRow();
        expect(enable.status).toBe(0);
        expect(before).not.toBeNull();
        beforeId = before!.id;
        beforeDigest = before!.write_row_digest_sha256;

        // ── App role: UPDATE + DELETE → 42501 ────────────────────────────────
        const appUrl = toAppRoleDatabaseUrl(databaseUrl);
        const appSql = createSql(appUrl);
        let appUpdateCode: string | null = null;
        let appDeleteCode: string | null = null;
        let appUser = '';
        let appUpdateRowcount: number | null = null;
        let appDeleteRowcount: number | null = null;

        try {
          const who = await appSql<{ current_user: string }[]>`SELECT current_user::text`;
          appUser = who[0]?.current_user ?? '';
          expect(appUser).toBe(HOLOCRON_APP_ROLE);

          try {
            const updated = await appSql`
              UPDATE data_plane_ponr SET write_row_id = 'forged' WHERE id = ${beforeId}::uuid
            `;
            appUpdateRowcount = Array.isArray(updated) ? updated.count : null;
          } catch (err) {
            const e = err as { code?: string; message?: string };
            appUpdateCode = e.code ?? null;
          }

          try {
            const deleted = await appSql`
              DELETE FROM data_plane_ponr WHERE id = ${beforeId}::uuid
            `;
            appDeleteRowcount = Array.isArray(deleted) ? deleted.count : null;
          } catch (err) {
            const e = err as { code?: string; message?: string };
            appDeleteCode = e.code ?? null;
          }
        } finally {
          await appSql.end({ timeout: 5 });
        }

        // ── Owner/migration connection: UPDATE + DELETE → P0001 PONR_IMMUTABLE ─
        let ownerUpdateCode: string | null = null;
        let ownerDeleteCode: string | null = null;
        let ownerUpdateMessage = '';
        let ownerDeleteMessage = '';
        let ownerUpdateRowcount: number | null = null;
        let ownerDeleteRowcount: number | null = null;

        try {
          const updated = await ownerSql`
            UPDATE data_plane_ponr SET write_row_id = 'forged' WHERE id = ${beforeId}::uuid
          `;
          ownerUpdateRowcount = Array.isArray(updated) ? updated.count : null;
        } catch (err) {
          const e = err as { code?: string; message?: string };
          ownerUpdateCode = e.code ?? null;
          ownerUpdateMessage = e.message ?? String(err);
        }

        try {
          const deleted = await ownerSql`
            DELETE FROM data_plane_ponr WHERE id = ${beforeId}::uuid
          `;
          ownerDeleteRowcount = Array.isArray(deleted) ? deleted.count : null;
        } catch (err) {
          const e = err as { code?: string; message?: string };
          ownerDeleteCode = e.code ?? null;
          ownerDeleteMessage = e.message ?? String(err);
        }

        const afterRows = await ownerSql<{ c: string; dig: string | null }[]>`
          SELECT count(*)::text AS c,
                 max(write_row_digest_sha256)::text AS dig
          FROM data_plane_ponr
        `;
        const afterCount = Number(afterRows[0]?.c ?? 0);
        const afterDigest = afterRows[0]?.dig ?? null;

        writeEvidence('ac4-immutability.json', {
          appUser,
          appUpdateCode,
          appDeleteCode,
          appUpdateRowcount,
          appDeleteRowcount,
          ownerUpdateCode,
          ownerDeleteCode,
          ownerUpdateMessage,
          ownerDeleteMessage,
          ownerUpdateRowcount,
          ownerDeleteRowcount,
          beforeId,
          beforeDigest,
          afterCount,
          afterDigest,
        });

        // GREEN assertions
        expect(appUpdateCode).toBe('42501');
        expect(appDeleteCode).toBe('42501');
        expect(ownerUpdateCode).toBe('P0001');
        expect(ownerDeleteCode).toBe('P0001');
        expect(ownerUpdateMessage).toContain('PONR_IMMUTABLE');
        expect(ownerDeleteMessage).toContain('PONR_IMMUTABLE');
        // Distinct SQLSTATEs for app vs owner
        expect(appUpdateCode).not.toBe(ownerUpdateCode);
        // No statement may report a successful row mutation
        expect(appUpdateRowcount === 1 || appDeleteRowcount === 1).toBe(false);
        expect(ownerUpdateRowcount === 1 || ownerDeleteRowcount === 1).toBe(false);
        expect(afterCount).toBe(1);
        expect(afterDigest).toBe(beforeDigest);
        // Must not be an app-code throw with null SQLSTATE
        expect(appUpdateCode).not.toBeNull();
        expect(ownerUpdateCode).not.toBeNull();

        // TC-8: second INSERT → unique-violation SQLSTATE 23505 (singleton)
        let secondInsertCode: string | null = null;
        let secondInsertMessage = '';
        try {
          await ownerSql`
            INSERT INTO data_plane_ponr (
              fence_lifted_at,
              write_surface,
              write_table,
              write_row_id,
              write_row_digest_sha256,
              write_committed_at,
              base_url,
              operator,
              run_id,
              idempotency_key,
              export_watermark_ms,
              convex_fence_audit_id,
              convex_fence_env_value,
              convex_documents_total,
              convex_newest_document_creation_time,
              convex_accepted_writes_since_watermark,
              convex_rejected_writes_since_watermark
            ) VALUES (
              now(),
              'hono.POST /api/documents',
              'documents',
              '00000000-0000-4000-8000-000000000099',
              'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              now(),
              'http://127.0.0.1:9',
              'tc8-singleton',
              'tc8-second-insert',
              'tc8-distinct-idempotency-key',
              1,
              'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              '1',
              1,
              0,
              0,
              0
            )
          `;
        } catch (err) {
          const e = err as { code?: string; message?: string };
          secondInsertCode = e.code ?? null;
          secondInsertMessage = e.message ?? String(err);
        }
        const countAfterSecond = await ownerSql<{ c: string }[]>`
          SELECT count(*)::text AS c FROM data_plane_ponr
        `;
        writeEvidence('tc8-singleton-insert.json', {
          secondInsertCode,
          secondInsertMessage,
          countAfterSecond: Number(countAfterSecond[0]?.c ?? -1),
        });
        expect(secondInsertCode).toBe('23505');
        expect(Number(countAfterSecond[0]?.c ?? 0)).toBe(1);
      } finally {
        await ownerSql.end({ timeout: 5 });
      }
    });
  }, 180_000);
});
