/**
 * ledger-4 / AC-1 / TC-1 (T-PLAT-004, T-DATA-006):
 * Direct UPDATE/DELETE on beliefs via app role must raise SQLSTATE 42501.
 *
 * RED against current base (no immutability REVOKE): UPDATE/DELETE succeed → assertions fail.
 *
 * NEGATIVE CONTROL (would fail if GREEN claimed without):
 * - REVOKE UPDATE/DELETE omitted (app role retains privileges)
 * - PUBLIC/default grants still allow DML
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/RED/immutability-dml-rejection.RED.test.ts
 */
import { beforeAll, describe, expect } from 'vitest';
import { toAppRoleDatabaseUrl } from '../../../../services/platform/src/db/evidence/index';
import {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  insertOpenBelief,
  itLive,
  pgError,
  truncateEvidenceTables,
  withEvidenceLock,
  writeRedArtifact,
} from './red-harness';

async function insertOpenBeliefAsOwner(options: {
  statement: string;
}): Promise<{ id: string; claimId: string }> {
  const { createSql } = await import('../../../../services/platform/src/db/client');
  const ownerSql = createSql(DEFAULT_DATABASE_URL);
  try {
    return await insertOpenBelief(ownerSql, options);
  } finally {
    await ownerSql.end({ timeout: 5 });
  }
}

describe('AC-1 / TC-1: direct DML on beliefs raises 42501', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('UPDATE beliefs SET statement raises ERROR 42501 and changes 0 rows', async () => {
    await withEvidenceLock(async () => {
      await truncateEvidenceTables();
      const { createSql } = await import('../../../../services/platform/src/db/client');
      const sql = createSql(toAppRoleDatabaseUrl(DEFAULT_DATABASE_URL));

      try {
        const b = await insertOpenBeliefAsOwner({ statement: 'immutable-original' });

        let updateCode: string | null = null;
        let updateMessage = '';
        let updateSucceeded = false;
        try {
          await sql`
            UPDATE beliefs
            SET statement = 'changed-by-direct-dml'
            WHERE id = ${b.id}::uuid
          `;
          updateSucceeded = true;
        } catch (err) {
          const e = pgError(err);
          updateCode = e.code;
          updateMessage = e.message;
        }

        const after = await sql<{ statement: string; count: string }[]>`
          SELECT statement, count(*) OVER ()::text AS count
          FROM beliefs
          WHERE id = ${b.id}::uuid
        `;
        const statementAfter = after[0]?.statement ?? null;
        const hackedCount = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count
          FROM beliefs
          WHERE statement = 'changed-by-direct-dml'
        `;

        const artifact = {
          ac: 'AC-1',
          tc: 'TC-1',
          operation: 'UPDATE',
          must_observe: {
            'UPDATE raises SQLSTATE 42501': updateCode === '42501',
            updateCode,
            updateMessage,
            'row statement unchanged': statementAfter === 'immutable-original',
            'COUNT WHERE statement = changed = 0': Number(hackedCount[0]?.count ?? -1) === 0,
          },
          must_not_observe: {
            updateSucceeded,
            statementAfter,
          },
        };
        writeRedArtifact('AC-1-update-dml.json', artifact);

        expect(
          updateCode,
          `UPDATE must raise 42501; got code=${updateCode} msg=${updateMessage}`
        ).toBe('42501');
        expect(updateSucceeded).toBe(false);
        expect(statementAfter).toBe('immutable-original');
        expect(Number(hackedCount[0]?.count ?? -1)).toBe(0);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  itLive('DELETE FROM beliefs raises ERROR 42501 and leaves the row', async () => {
    await withEvidenceLock(async () => {
      await truncateEvidenceTables();
      const { createSql } = await import('../../../../services/platform/src/db/client');
      const sql = createSql(toAppRoleDatabaseUrl(DEFAULT_DATABASE_URL));

      try {
        const b = await insertOpenBeliefAsOwner({ statement: 'delete-me-not' });

        let deleteCode: string | null = null;
        let deleteMessage = '';
        let deleteSucceeded = false;
        try {
          await sql`DELETE FROM beliefs WHERE id = ${b.id}::uuid`;
          deleteSucceeded = true;
        } catch (err) {
          const e = pgError(err);
          deleteCode = e.code;
          deleteMessage = e.message;
        }

        const remaining = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count FROM beliefs WHERE id = ${b.id}::uuid
        `;

        const artifact = {
          ac: 'AC-1',
          tc: 'TC-1',
          operation: 'DELETE',
          must_observe: {
            'DELETE raises SQLSTATE 42501': deleteCode === '42501',
            deleteCode,
            deleteMessage,
            'belief row still present COUNT=1': Number(remaining[0]?.count ?? 0) === 1,
          },
          must_not_observe: {
            deleteSucceeded,
            remainingCount: Number(remaining[0]?.count ?? -1),
          },
        };
        writeRedArtifact('AC-1-delete-dml.json', artifact);

        expect(
          deleteCode,
          `DELETE must raise 42501; got code=${deleteCode} msg=${deleteMessage}`
        ).toBe('42501');
        expect(deleteSucceeded).toBe(false);
        expect(Number(remaining[0]?.count ?? 0)).toBe(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  itLive('has_table_privilege reports app role lacks UPDATE and DELETE on beliefs', async () => {
    const { createSql } = await import('../../../../services/platform/src/db/client');
    const sql = createSql(toAppRoleDatabaseUrl(DEFAULT_DATABASE_URL));
    try {
      const priv = await sql<{ can_update: boolean; can_delete: boolean; role: string }[]>`
        SELECT
          has_table_privilege(current_user, 'beliefs', 'UPDATE') AS can_update,
          has_table_privilege(current_user, 'beliefs', 'DELETE') AS can_delete,
          current_user AS role
      `;
      const row = priv[0];
      writeRedArtifact('AC-1-privileges.json', row);
      expect(row?.can_update, 'app role must NOT have UPDATE on beliefs').toBe(false);
      expect(row?.can_delete, 'app role must NOT have DELETE on beliefs').toBe(false);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
