/**
 * ledger-4 / AC-5 / TC-5 (T-DATA-008):
 * Net-support computed from validity-windowed supports/contradicts edges.
 *
 * GIVEN:
 *   R1 supports  valid 2024-01-01 → 2024-06-01  (+1)
 *   R2 contradicts valid 2024-03-01 → 2024-12-01 (-1)
 *   R3 supports  valid 2024-07-01 → 2024-12-01  (+1, excluded at 2024-04-01)
 * WHEN computing net-support as-of 2024-04-01
 * THEN net-support = 0 (R1 +1, R2 -1, R3 excluded)
 *
 * RED against current base: net-support query/CLI missing → fails.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/RED/evidence-net-support.RED.test.ts
 */
import { beforeAll, describe, expect } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  itLive,
  parseJsonObject,
  runHolo,
  truncateEvidenceTables,
  withEvidenceLock,
  writeRedArtifact,
} from './red-harness';

describe('AC-5 / TC-5: net-support from validity-windowed supports/contradicts', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('as-of 2024-04-01 net-support = 0 (R1 +1, R2 -1, R3 excluded)', async () => {
    await withEvidenceLock(async () => {
      await truncateEvidenceTables();
      const { createSql } = await import('../../../../services/platform/src/db/client');
      const sql = createSql(DEFAULT_DATABASE_URL);

      try {
        const claimRows = await sql<{ id: string }[]>`
            INSERT INTO claims (claim_text, confidence, metadata_json)
            VALUES (
              'Net support fixture claim',
              0.5,
              ${sql.json({ fixture: 'ledger-4-net-support' })}
            )
            RETURNING id::text AS id
          `;
        const objectId = claimRows[0]?.id;
        expect(objectId).toBeTruthy();

        // R1 supports 2024-01 → 2024-06
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
        // R2 contradicts 2024-03 → 2024-12
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
        // R3 supports 2024-07 → 2024-12 (excluded at 2024-04-01)
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

        // Public surfaces (either is acceptable when GREEN lands):
        // 1) CLI: holo evidence:belief --claim-id --as-of --json → netSupport
        // 2) SQL: belief_net_support(claim_id, as_of)
        const claimKey = objectId ?? '';
        const cli = runHolo(['evidence:belief', '--claim-id', claimKey, '--as-of', asOf, '--json']);

        let cliPayload: Record<string, unknown> | null = null;
        try {
          cliPayload = parseJsonObject(cli.stdout);
        } catch {
          cliPayload = null;
        }

        let sqlNet: number | null = null;
        let sqlError: string | null = null;
        try {
          const rows = await sql<{ net: string }[]>`
              SELECT belief_net_support(${objectId}, ${asOf}::timestamptz)::text AS net
            `;
          sqlNet = Number(rows[0]?.net);
        } catch (err) {
          sqlError = err instanceof Error ? err.message : String(err);
        }

        const cliNet =
          (cliPayload?.netSupport as number | undefined) ??
          (cliPayload?.net_support as number | undefined) ??
          (cliPayload?.belief as { netSupport?: number } | undefined)?.netSupport ??
          null;

        // Prefer SQL function if present; otherwise CLI field.
        const netSupport = sqlNet ?? cliNet;

        const artifact = {
          ac: 'AC-5',
          tc: 'TC-5',
          objectId,
          asOf,
          cli: {
            status: cli.status,
            stdout: cli.stdout.slice(0, 2000),
            stderr: cli.stderr.slice(0, 2000),
            netSupport: cliNet,
          },
          sql: { net: sqlNet, error: sqlError },
          must_observe: {
            'net-support = 0': netSupport === 0,
          },
          must_not_observe: {
            'net-support missing': netSupport == null,
            'net-support counts R3 (+1 without window filter) => 1': netSupport === 1,
            'net-support = +2 (all supports, no contradicts)': netSupport === 2,
          },
        };
        writeRedArtifact('AC-5-net-support.json', artifact);

        expect(
          netSupport,
          `net-support as-of ${asOf} must be 0 (R1+1 R2-1 R3 excluded); got ${String(netSupport)}; sqlError=${sqlError}; cliStatus=${cli.status}`
        ).toBe(0);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  itLive('as-of 2024-08-01 net-support = +1 (R1/R2 expired; R3 +1)', async () => {
    await withEvidenceLock(async () => {
      await truncateEvidenceTables();
      const { createSql } = await import('../../../../services/platform/src/db/client');
      const sql = createSql(DEFAULT_DATABASE_URL);

      try {
        const claimRows = await sql<{ id: string }[]>`
          INSERT INTO claims (claim_text, confidence)
          VALUES ('Net support late window', 0.5)
          RETURNING id::text AS id
        `;
        const objectId = claimRows[0]?.id;
        expect(objectId).toBeTruthy();

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
        let netSupport: number | null = null;
        let path = 'none';

        try {
          const rows = await sql<{ net: string }[]>`
            SELECT belief_net_support(${objectId}, ${asOf}::timestamptz)::text AS net
          `;
          netSupport = Number(rows[0]?.net);
          path = 'sql:belief_net_support';
        } catch {
          const claimKey = objectId ?? '';
          const cli = runHolo([
            'evidence:belief',
            '--claim-id',
            claimKey,
            '--as-of',
            asOf,
            '--json',
          ]);
          try {
            const payload = parseJsonObject(cli.stdout);
            netSupport =
              (payload.netSupport as number | undefined) ??
              (payload.net_support as number | undefined) ??
              null;
            path = `cli:status=${cli.status}`;
          } catch {
            netSupport = null;
            path = `cli-parse-fail:status=${cli.status}`;
          }
        }

        writeRedArtifact('AC-5-net-support-aug.json', { objectId, asOf, netSupport, path });
        expect(netSupport, `net-support as-of ${asOf} must be +1 via ${path}`).toBe(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
