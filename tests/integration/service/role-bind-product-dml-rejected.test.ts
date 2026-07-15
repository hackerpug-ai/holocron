/**
 * AC-2 / TC-2 (REDHAT-FIX-H2): Default product client cannot UPDATE/DELETE beliefs.
 *
 * NEGATIVE CONTROL (would fail if):
 * - Product client still connects as owner and UPDATE succeeds
 * - Test only uses probe-raw rewrite while product seed remains owner
 * - Stub raises 42501 without real Postgres
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-product-dml-rejected.test.ts
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
} from './evidence-harness';

const TMP = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-H2');

function writeArtifact(name: string, body: unknown): void {
  mkdirSync(TMP, { recursive: true });
  const path = resolve(TMP, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

describe('AC-2: product pool rejects UPDATE/DELETE on beliefs', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('UPDATE and DELETE via product connection resolution raise SQLSTATE 42501', async () => {
    await withEvidenceLock(async () => {
      const { createSql } = await import('../../../services/platform/src/db/client');
      const { HOLOCRON_APP_ROLE, resolveProductDatabaseUrl, seedOpenBelief } = await import(
        '../../../services/platform/src/db/evidence/index'
      );

      const statement = 'role-bind-dml-seed-statement';
      // Fixture seed may use owner URL (tests); DML attempt uses product resolution only.
      const seeded = await seedOpenBelief({
        databaseUrl: DEFAULT_DATABASE_URL,
        statement,
        claimId: `claim-dml-${Date.now()}`,
      });
      expect(seeded.ok).toBe(true);
      expect(seeded.beliefId).toBeTruthy();
      const beliefId = seeded.beliefId as string;

      // Same resolution product helpers use (resolveProductDatabaseUrl).
      const productUrl = resolveProductDatabaseUrl({ preferHolocron: true });
      const productSql = createSql(productUrl);

      let sessionUser = '';
      let updateCode: string | null = null;
      let deleteCode: string | null = null;
      let updateRowcount: number | null = null;
      let deleteRowcount: number | null = null;

      try {
        const who = await productSql<{ current_user: string }[]>`SELECT current_user::text`;
        sessionUser = who[0]?.current_user ?? '';
        expect(sessionUser).toBe(HOLOCRON_APP_ROLE);

        try {
          const updated = await productSql`
            UPDATE beliefs SET statement = 'hacked' WHERE id = ${beliefId}::uuid
          `;
          updateRowcount = Array.isArray(updated) ? (updated.count ?? updated.length) : null;
        } catch (err) {
          const e = err as { code?: string };
          updateCode = e.code ?? null;
        }

        try {
          const deleted = await productSql`DELETE FROM beliefs WHERE id = ${beliefId}::uuid`;
          deleteRowcount = Array.isArray(deleted) ? (deleted.count ?? deleted.length) : null;
        } catch (err) {
          const e = err as { code?: string };
          deleteCode = e.code ?? null;
        }
      } finally {
        await productSql.end({ timeout: 5 });
      }

      const ownerSql = createSql(DEFAULT_DATABASE_URL);
      try {
        const rows = await ownerSql<{ statement: string; count: string }[]>`
          SELECT statement, count(*) OVER()::text AS count
          FROM beliefs
          WHERE id = ${beliefId}::uuid
        `;
        const still = rows[0];

        const green = {
          session_user: sessionUser,
          update_sqlstate: updateCode,
          delete_sqlstate: deleteCode,
          update_rowcount: updateRowcount,
          delete_rowcount: deleteRowcount,
          statement: still?.statement,
          row_count: Number(still?.count ?? 0),
        };
        writeArtifact('AC-2-green-dml-rejected.json', green);

        expect(updateCode).toBe('42501');
        expect(deleteCode).toBe('42501');
        expect(still?.statement).toBe(statement);
        expect(still?.statement).not.toBe('hacked');
        expect(Number(still?.count ?? 0)).toBeGreaterThanOrEqual(1);
      } finally {
        await ownerSql.end({ timeout: 5 });
      }
    });
  });
});
