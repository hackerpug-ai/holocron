/**
 * AC-1 / TC-1 (T-DATA-005): as-of belief query returns historical belief state.
 *
 * GIVEN Postgres with B1, B2, B3 revisions
 * WHEN holo evidence:belief --claim-id <id> --as-of <timestamp between B1 and B2>
 * THEN Returns B1, not B2 or B3
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-asof-transaction.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  itLive,
  parseJsonObject,
  REPO_ROOT,
  runHolo,
  truncateEvidenceTables,
  withEvidenceLock,
} from './evidence-harness';

const TMP = resolve(REPO_ROOT, '.tmp/ledger-3');

function writeArtifact(name: string, body: unknown): void {
  mkdirSync(TMP, { recursive: true });
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(resolve(TMP, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

describe('AC-1: as-of query returns historical belief state', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('evidence:belief --as-of between B1 and B2 returns B1 not B2/B3', async () => {
    await withEvidenceLock(async () => {
      await truncateEvidenceTables();
      const { createSql } = await import('../../../services/platform/src/db/client');
      const sql = createSql(DEFAULT_DATABASE_URL);

      try {
        const claimId = 'claim-asof-tx-1';
        const t0 = '2024-01-01T00:00:00Z';
        const tMid = '2024-02-01T00:00:00Z';
        const t1 = '2024-03-01T00:00:00Z';
        const t2 = '2024-05-01T00:00:00Z';

        const b1Rows = await sql<{ id: string }[]>`
          INSERT INTO beliefs (claim_id, statement, confidence, tx_from, tx_to, actor, run_id)
          VALUES (
            ${claimId}, 'belief-B1', 0.4,
            ${t0}::timestamptz, ${t1}::timestamptz, 'op-seed', 'run-b1'
          )
          RETURNING id::text AS id
        `;
        const b1Id = b1Rows[0]?.id;
        expect(b1Id).toBeTruthy();

        const b2Rows = await sql<{ id: string }[]>`
          INSERT INTO beliefs (
            claim_id, statement, confidence, supersedes_id, tx_from, tx_to, actor, run_id
          )
          VALUES (
            ${claimId}, 'belief-B2', 0.7, ${b1Id},
            ${t1}::timestamptz, ${t2}::timestamptz, 'op-rev', 'run-b2'
          )
          RETURNING id::text AS id
        `;
        const b2Id = b2Rows[0]?.id;
        expect(b2Id).toBeTruthy();

        const b3Rows = await sql<{ id: string }[]>`
          INSERT INTO beliefs (
            claim_id, statement, confidence, supersedes_id, tx_from, tx_to, actor, run_id
          )
          VALUES (
            ${claimId}, 'belief-B3', 0.95, ${b2Id},
            ${t2}::timestamptz, NULL, 'op-rev', 'run-b3'
          )
          RETURNING id::text AS id
        `;
        const b3Id = b3Rows[0]?.id;
        expect(b3Id).toBeTruthy();

        writeArtifact('AC-1-red-against-start.json', {
          claimId,
          b1Id,
          b2Id,
          b3Id,
          asOf: tMid,
          note: 'must return B1 at midpoint; would fail without as-of filter',
        });

        const asOf = runHolo(['evidence:belief', '--claim-id', claimId, '--as-of', tMid, '--json']);
        const out = `${asOf.stdout}\n${asOf.stderr}`;
        expect(asOf.status, `evidence:belief must exit 0:\n${out}`).toBe(0);

        const payload = parseJsonObject(asOf.stdout);
        const beliefId =
          (payload.beliefId as string | undefined) ??
          (payload.id as string | undefined) ??
          (payload.belief as { id?: string } | undefined)?.id ??
          null;
        const statement =
          (payload.statement as string | undefined) ??
          (payload.belief as { statement?: string } | undefined)?.statement ??
          null;

        writeArtifact('AC-1-green.json', {
          status: asOf.status,
          beliefId,
          statement,
          b1Id,
          b2Id,
          b3Id,
          payload,
        });

        expect(beliefId).toBe(b1Id);
        expect(statement).toBe('belief-B1');
        expect(beliefId).not.toBe(b2Id);
        expect(beliefId).not.toBe(b3Id);
        expect(statement).not.toBe('belief-B2');
        expect(statement).not.toBe('belief-B3');

        // Full audit chain still present in DB (as-of is read-only).
        const chain = await sql<{ id: string; statement: string }[]>`
          SELECT id::text AS id, statement FROM beliefs
          WHERE claim_id = ${claimId}
          ORDER BY tx_from
        `;
        expect(chain).toHaveLength(3);
        expect(chain.map((r) => r.statement)).toEqual(['belief-B1', 'belief-B2', 'belief-B3']);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
