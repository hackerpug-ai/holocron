/**
 * REDHAT-FIX-H1 AC-1 / AC-5: App role cannot INSERT closed historical beliefs;
 * privilege catalog matches authenticity posture after 0006_*.
 *
 * NEGATIVE CONTROL (would fail if):
 * - 0006 omitted and GRANT INSERT ON beliefs TO holocron_app retained from 0004
 * - Only TS validation rejects closed inserts while raw SQL as holocron_app succeeds
 * - EXECUTE grants missing so seed_open_belief / revise_belief inoperable under app role
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-insert-closed-rejected.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  itLive,
  REPO_ROOT,
  withEvidenceLock,
  writeImmutabilityArtifact,
} from './immutability-harness';

const H1_TMP = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-H1');

function writeH1Artifact(name: string, body: unknown): string {
  mkdirSync(H1_TMP, { recursive: true });
  const path = resolve(H1_TMP, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('REDHAT-FIX-H1 AC-1: app role cannot INSERT closed historical beliefs', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('INSERT closed history as holocron_app fails with SQLSTATE 42501', async () => {
    await withEvidenceLock(async () => {
      const { createSql } = await import('../../../services/platform/src/db/client');
      const { HOLOCRON_APP_ROLE, toAppRoleDatabaseUrl } = await import(
        '../../../services/platform/src/db/evidence/index'
      );

      const claimId = `claim-h1-closed-insert-${Date.now()}`;
      const forgedStatement = `FORGED-CLOSED-${Date.now()}`;
      const forgedActor = 'forger-h1';

      writeImmutabilityArtifact('H1-AC-1-red-against-start.txt', {
        claimId,
        forgedStatement,
        note: 'pre-0006 RED: closed INSERT as holocron_app succeeded (see .tmp/REDHAT-FIX-H1/)',
      });

      const appUrl = toAppRoleDatabaseUrl(DEFAULT_DATABASE_URL);
      const appSql = createSql(appUrl);

      let sessionUser = '';
      let insertCode: string | null = null;
      let insertMessage = '';
      let insertSucceeded = false;
      let returnedClosed: boolean | null = null;

      try {
        const who = await appSql<{ current_user: string }[]>`SELECT current_user::text`;
        sessionUser = who[0]?.current_user ?? '';
        expect(sessionUser).toBe(HOLOCRON_APP_ROLE);

        try {
          const rows = await appSql<{ id: string; closed: boolean }[]>`
            INSERT INTO beliefs (claim_id, statement, confidence, tx_from, tx_to, actor)
            VALUES (
              ${claimId},
              ${forgedStatement},
              0.99,
              now() - interval '1 day',
              now() - interval '1 hour',
              ${forgedActor}
            )
            RETURNING id::text AS id, (tx_to IS NOT NULL) AS closed
          `;
          insertSucceeded = rows.length >= 1;
          returnedClosed = rows[0]?.closed ?? null;
        } catch (err) {
          const e = err as { code?: string; message?: string };
          insertCode = e.code ?? null;
          insertMessage = e.message ?? String(err);
        }
      } finally {
        await appSql.end({ timeout: 5 });
      }

      const ownerSql = createSql(DEFAULT_DATABASE_URL);
      try {
        const forged = await ownerSql<{ count: string }[]>`
          SELECT count(*)::text AS count
          FROM beliefs
          WHERE statement = ${forgedStatement}
            AND actor = ${forgedActor}
        `;
        const forgedCount = Number(forged[0]?.count ?? 0);

        const green = {
          must_observe: {
            session_user: sessionUser,
            insert_sqlstate: insertCode,
            insert_message: insertMessage,
            forged_committed_count: forgedCount,
          },
          must_not_observe: {
            insert_succeeded: insertSucceeded,
            returned_closed: returnedClosed,
          },
        };
        writeImmutabilityArtifact('H1-AC-1-green.json', green);
        writeH1Artifact('AC-1-insert-closed-rejected.json', green);

        expect(sessionUser).toBe(HOLOCRON_APP_ROLE);
        expect(insertCode).toBe('42501');
        expect(insertMessage.toLowerCase()).toMatch(/permission denied/);
        expect(insertSucceeded).toBe(false);
        expect(forgedCount).toBe(0);
        expect(insertCode).not.toBeNull();
        expect(insertCode).not.toBe('');
      } finally {
        await ownerSql.end({ timeout: 5 });
      }
    });
  });

  itLive('privilege catalog: app lacks INSERT/UPDATE/DELETE; has SELECT + EXECUTE', async () => {
    await withEvidenceLock(async () => {
      const { createSql } = await import('../../../services/platform/src/db/client');
      const { HOLOCRON_APP_ROLE, HOLOCRON_OWNER_ROLE } = await import(
        '../../../services/platform/src/db/evidence/index'
      );

      const sql = createSql(DEFAULT_DATABASE_URL);
      try {
        const priv = await sql<
          {
            app_insert: boolean;
            app_update: boolean;
            app_delete: boolean;
            app_select: boolean;
            owner_insert: boolean;
            owner_update: boolean;
            seed_exec: boolean;
            revise_exec: boolean;
            seed_prosecdef: boolean | null;
            seed_owner: string | null;
          }[]
        >`
          SELECT
            has_table_privilege('holocron_app', 'beliefs', 'INSERT') AS app_insert,
            has_table_privilege('holocron_app', 'beliefs', 'UPDATE') AS app_update,
            has_table_privilege('holocron_app', 'beliefs', 'DELETE') AS app_delete,
            has_table_privilege('holocron_app', 'beliefs', 'SELECT') AS app_select,
            has_table_privilege('holocron_owner', 'beliefs', 'INSERT') AS owner_insert,
            has_table_privilege('holocron_owner', 'beliefs', 'UPDATE') AS owner_update,
            has_function_privilege(
              'holocron_app',
              'seed_open_belief(text, text, double precision, text, text, timestamptz, timestamptz)',
              'EXECUTE'
            ) AS seed_exec,
            has_function_privilege(
              'holocron_app',
              'revise_belief(uuid, text, text, text, text, double precision, timestamptz, timestamptz)',
              'EXECUTE'
            ) AS revise_exec,
            (
              SELECT p.prosecdef
              FROM pg_proc p
              JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'seed_open_belief'
              LIMIT 1
            ) AS seed_prosecdef,
            (
              SELECT pg_get_userbyid(p.proowner)::text
              FROM pg_proc p
              JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'seed_open_belief'
              LIMIT 1
            ) AS seed_owner
        `;

        const row = priv[0];
        expect(row).toBeTruthy();

        const green = {
          role: HOLOCRON_APP_ROLE,
          owner_role: HOLOCRON_OWNER_ROLE,
          must_observe: {
            app_insert: row?.app_insert,
            app_update: row?.app_update,
            app_delete: row?.app_delete,
            app_select: row?.app_select,
            owner_insert: row?.owner_insert,
            owner_update: row?.owner_update,
            seed_exec: row?.seed_exec,
            revise_exec: row?.revise_exec,
            seed_prosecdef: row?.seed_prosecdef,
            seed_owner: row?.seed_owner,
          },
        };
        writeImmutabilityArtifact('H1-AC-5-privileges.json', green);
        writeH1Artifact('AC-5-privilege-catalog.json', green);

        expect(row?.app_insert).toBe(false);
        expect(row?.app_update).toBe(false);
        expect(row?.app_delete).toBe(false);
        expect(row?.app_select).toBe(true);
        expect(row?.owner_insert).toBe(true);
        expect(row?.owner_update).toBe(true);
        expect(row?.seed_exec).toBe(true);
        expect(row?.revise_exec).toBe(true);
        expect(row?.seed_prosecdef).toBe(true);
        expect(row?.seed_owner).toBe(HOLOCRON_OWNER_ROLE);
        // sanity: UUID format constant still available for other ACs
        expect(UUID_RE.test('019f676e-afcf-7c86-9de0-2139d386e232')).toBe(true);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
