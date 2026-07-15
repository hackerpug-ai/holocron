/**
 * AC-2 / TC-2 (T-DATA-008): net-support from validity-windowed supports/contradicts.
 *
 * GIVEN R1 supports 2024-01→06 (+1), R2 contradicts 2024-03→12 (-1), R3 supports 2024-07→12 (+1)
 * WHEN computing net-support as-of 2024-04-01
 * THEN net-support = 0 (R1 +1, R2 -1, R3 excluded)
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-net-support.test.ts
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

describe('AC-2: net-support from validity-windowed relations', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('as-of 2024-04-01 net-support = 0 (R1 +1, R2 -1, R3 excluded)', async () => {
    await withEvidenceLock(async () => {
      await truncateEvidenceTables();
      const { createSql } = await import('../../../services/platform/src/db/client');
      const sql = createSql(DEFAULT_DATABASE_URL);

      try {
        const claimRows = await sql<{ id: string }[]>`
          INSERT INTO claims (claim_text, confidence, metadata_json)
          VALUES (
            'Net support fixture claim',
            0.5,
            ${sql.json({ fixture: 'ledger-3-net-support' })}
          )
          RETURNING id::text AS id
        `;
        const objectId = claimRows[0]?.id;
        expect(objectId).toBeTruthy();

        await sql`
          INSERT INTO relations (
            relation_type, subject_id, subject_kind, object_id, object_kind,
            valid_from, valid_to, tx_from, tx_to
          ) VALUES (
            'supports', 'passage-r1', 'passage', ${objectId}, 'claim',
            '2024-01-01T00:00:00Z'::timestamptz,
            '2024-06-01T00:00:00Z'::timestamptz,
            now(), NULL
          )
        `;
        await sql`
          INSERT INTO relations (
            relation_type, subject_id, subject_kind, object_id, object_kind,
            valid_from, valid_to, tx_from, tx_to
          ) VALUES (
            'contradicts', 'passage-r2', 'passage', ${objectId}, 'claim',
            '2024-03-01T00:00:00Z'::timestamptz,
            '2024-12-01T00:00:00Z'::timestamptz,
            now(), NULL
          )
        `;
        await sql`
          INSERT INTO relations (
            relation_type, subject_id, subject_kind, object_id, object_kind,
            valid_from, valid_to, tx_from, tx_to
          ) VALUES (
            'supports', 'passage-r3', 'passage', ${objectId}, 'claim',
            '2024-07-01T00:00:00Z'::timestamptz,
            '2024-12-01T00:00:00Z'::timestamptz,
            now(), NULL
          )
        `;

        const asOf = '2024-04-01T00:00:00Z';
        writeArtifact('AC-2-red-against-start.json', {
          objectId,
          asOf,
          note: 'would fail if R3 counted without validity filter (net=1) or all supports (net=2)',
        });

        const claimKey = objectId ?? '';
        const rows = await sql<{ net: string }[]>`
          SELECT belief_net_support(${objectId}, ${asOf}::timestamptz)::text AS net
        `;
        const sqlNet = Number(rows[0]?.net);
        expect(sqlNet, 'SQL belief_net_support must be 0').toBe(0);

        // Helper path
        const { computeNetSupport } = await import(
          '../../../services/platform/src/db/evidence/index'
        );
        const helper = await computeNetSupport({
          claimId: claimKey,
          asOf,
          databaseUrl: DEFAULT_DATABASE_URL,
        });
        expect(helper.netSupport).toBe(0);

        // CLI path (belief may be absent → status non-zero is ok if netSupport present)
        const cli = runHolo(['evidence:belief', '--claim-id', claimKey, '--as-of', asOf, '--json']);
        let cliNet: number | null = null;
        try {
          const payload = parseJsonObject(cli.stdout);
          cliNet =
            (payload.netSupport as number | undefined) ??
            (payload.net_support as number | undefined) ??
            null;
        } catch {
          cliNet = null;
        }

        writeArtifact('AC-2-green.json', {
          objectId,
          asOf,
          sqlNet,
          helperNet: helper.netSupport,
          cliNet,
          cliStatus: cli.status,
        });

        expect(cliNet).toBe(0);
        // must_not_observe
        expect(sqlNet).not.toBe(1);
        expect(sqlNet).not.toBe(2);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  itLive('as-of 2024-08-01: R1 expired; R2 short window expired → R3 only (+1)', async () => {
    await withEvidenceLock(async () => {
      await truncateEvidenceTables();
      const { createSql } = await import('../../../services/platform/src/db/client');
      const sql = createSql(DEFAULT_DATABASE_URL);

      try {
        const claimRows = await sql<{ id: string }[]>`
          INSERT INTO claims (claim_text, confidence)
          VALUES ('Net support late window', 0.5)
          RETURNING id::text AS id
        `;
        const objectId = claimRows[0]?.id;
        expect(objectId).toBeTruthy();

        // R1 supports Jan→Jun (expired at Aug)
        // R2 contradicts Mar→Jul-15 (expired at Aug)
        // R3 supports Jul→Dec (active) ⇒ net = +1
        await sql`
          INSERT INTO relations (
            relation_type, subject_id, object_id, valid_from, valid_to, tx_from, tx_to
          ) VALUES
            ('supports', 'p1', ${objectId},
              '2024-01-01T00:00:00Z'::timestamptz, '2024-06-01T00:00:00Z'::timestamptz, now(), NULL),
            ('contradicts', 'p2', ${objectId},
              '2024-03-01T00:00:00Z'::timestamptz, '2024-07-15T00:00:00Z'::timestamptz, now(), NULL),
            ('supports', 'p3', ${objectId},
              '2024-07-01T00:00:00Z'::timestamptz, '2024-12-01T00:00:00Z'::timestamptz, now(), NULL)
        `;

        const asOf = '2024-08-01T00:00:00Z';
        const rows = await sql<{ net: string }[]>`
          SELECT belief_net_support(${objectId}, ${asOf}::timestamptz)::text AS net
        `;
        const netSupport = Number(rows[0]?.net);
        writeArtifact('AC-2-green-aug.json', { objectId, asOf, netSupport });
        expect(netSupport).toBe(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
