/**
 * AC-1 / TC-1: App role cannot directly UPDATE or DELETE beliefs (ERROR 42501).
 *
 * NEGATIVE CONTROL (would fail if):
 * - REVOKE omitted (app role retains UPDATE/DELETE)
 * - App role still has UPDATE/DELETE via PUBLIC grant
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-dml-rejected.test.ts
 */
import { beforeAll, describe, expect } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  itLive,
  seedBeliefForTest,
  withEvidenceLock,
  writeImmutabilityArtifact,
} from './immutability-harness';

describe('AC-1: app role cannot UPDATE or DELETE beliefs', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('UPDATE and DELETE as holocron_app raise SQLSTATE 42501', async () => {
    await withEvidenceLock(async () => {
      const { createSql } = await import('../../../services/platform/src/db/client');
      const { HOLOCRON_APP_ROLE, toAppRoleDatabaseUrl } = await import(
        '../../../services/platform/src/db/evidence/index'
      );

      const { beliefId, statement } = await seedBeliefForTest({
        statement: 'immutable-seed-statement',
      });

      writeImmutabilityArtifact('AC-1-red-against-start.txt', {
        beliefId,
        statement,
        note: 'open belief seeded; app role has not yet attempted DML',
      });

      const appUrl = toAppRoleDatabaseUrl(DEFAULT_DATABASE_URL);
      const appSql = createSql(appUrl);

      let updateCode: string | null = null;
      let updateMessage = '';
      let deleteCode: string | null = null;
      let deleteMessage = '';
      let sessionUser = '';

      try {
        const who = await appSql<{ current_user: string }[]>`SELECT current_user::text`;
        sessionUser = who[0]?.current_user ?? '';
        expect(sessionUser).toBe(HOLOCRON_APP_ROLE);

        try {
          await appSql`
            UPDATE beliefs SET statement = 'changed' WHERE id = ${beliefId}::uuid
          `;
        } catch (err) {
          const e = err as { code?: string; message?: string };
          updateCode = e.code ?? null;
          updateMessage = e.message ?? String(err);
        }

        try {
          await appSql`DELETE FROM beliefs WHERE id = ${beliefId}::uuid`;
        } catch (err) {
          const e = err as { code?: string; message?: string };
          deleteCode = e.code ?? null;
          deleteMessage = e.message ?? String(err);
        }
      } finally {
        await appSql.end({ timeout: 5 });
      }

      // Superuser/owner connection verifies row unchanged
      const ownerSql = createSql(DEFAULT_DATABASE_URL);
      try {
        const rows = await ownerSql<{ statement: string; count: string }[]>`
          SELECT statement, count(*) OVER()::text AS count
          FROM beliefs
          WHERE id = ${beliefId}::uuid
        `;
        const still = rows[0];

        const green = {
          must_observe: {
            session_user: sessionUser,
            update_sqlstate: updateCode,
            delete_sqlstate: deleteCode,
            update_message: updateMessage,
            delete_message: deleteMessage,
            statement_unchanged: still?.statement === statement,
            row_still_exists: Number(still?.count ?? 0) >= 1,
          },
        };
        writeImmutabilityArtifact('AC-1-green.txt', green);
        writeImmutabilityArtifact(
          'AC-1-seeded-belief.json',
          JSON.stringify({ beliefId, statement }, null, 2)
        );

        expect(updateCode).toBe('42501');
        expect(deleteCode).toBe('42501');
        expect(updateMessage.toLowerCase()).toMatch(/permission denied/);
        expect(deleteMessage.toLowerCase()).toMatch(/permission denied/);
        expect(still?.statement).toBe(statement);
      } finally {
        await ownerSql.end({ timeout: 5 });
      }
    });
  });
});
