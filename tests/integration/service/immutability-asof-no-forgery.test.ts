/**
 * REDHAT-FIX-H1 AC-4: belief_as_of cannot return app-forged mid-window closed history.
 *
 * NEGATIVE CONTROL (would fail if):
 * - App role can still INSERT closed rows (H1 unfixed) and belief_as_of returns forged statement
 * - Test only asserts INSERT failure without querying belief_as_of after forgery attempt
 * - Forgery performed as table owner treated as app-role control proof
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-asof-no-forgery.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  itLive,
  REPO_ROOT,
  seedBeliefForTest,
  withEvidenceLock,
  writeImmutabilityArtifact,
} from './immutability-harness';

const H1_TMP = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-H1');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORGED = 'FORGED-ASOF-HIJACK';

function writeH1Artifact(name: string, body: unknown): void {
  mkdirSync(H1_TMP, { recursive: true });
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(resolve(H1_TMP, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

describe('REDHAT-FIX-H1 AC-4: belief_as_of ignores failed app-role mid-window forgery', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('forged closed INSERT fails; belief_as_of(t_mid) returns B1 not FORGED', async () => {
    await withEvidenceLock(async () => {
      const { createSql } = await import('../../../services/platform/src/db/client');
      const { HOLOCRON_APP_ROLE, reviseBelief, toAppRoleDatabaseUrl } = await import(
        '../../../services/platform/src/db/evidence/index'
      );

      const claimId = `claim-h1-asof-forge-${Date.now()}`;
      const b1Statement = 'real-predecessor-B1-statement';

      // Build B1 → B2 chain via authorized paths (app role DEFINER).
      const { beliefId: b1Id } = await seedBeliefForTest({
        claimId,
        statement: b1Statement,
      });

      const appUrl = toAppRoleDatabaseUrl(DEFAULT_DATABASE_URL);
      const revise = await reviseBelief({
        beliefId: b1Id,
        actor: 'op-h1-asof',
        runId: 'run-h1-asof',
        idempotencyKey: `key-h1-asof-${Date.now()}`,
        statement: 'real-successor-B2-statement',
        confidence: 0.9,
        databaseUrl: appUrl,
      });
      expect(revise.ok).toBe(true);
      expect(revise.successorId).toMatch(UUID_RE);
      const b2Id = revise.successorId ?? '';

      const ownerSql = createSql(DEFAULT_DATABASE_URL);
      let tMid = '';
      let b1TxFrom = '';
      let b2TxFrom = '';

      try {
        const chain = await ownerSql<
          { id: string; statement: string; tx_from: string; tx_to: string | null }[]
        >`
          SELECT id::text AS id, statement,
                 tx_from::text AS tx_from, tx_to::text AS tx_to
          FROM beliefs
          WHERE claim_id = ${claimId}
          ORDER BY tx_from ASC
        `;
        expect(chain.length).toBeGreaterThanOrEqual(2);
        const b1 = chain.find((r) => r.id === b1Id);
        const b2 = chain.find((r) => r.id === b2Id);
        expect(b1).toBeTruthy();
        expect(b2).toBeTruthy();
        b1TxFrom = b1?.tx_from ?? '';
        b2TxFrom = b2?.tx_from ?? '';
        expect(b1?.tx_to).not.toBeNull();
        expect(b2?.tx_to).toBeNull();

        // Midpoint between B1.tx_from and B2.tx_from for as-of.
        const midRows = await ownerSql<{ t_mid: string }[]>`
          SELECT (
            ${b1TxFrom}::timestamptz
            + ((${b2TxFrom}::timestamptz - ${b1TxFrom}::timestamptz) / 2)
          )::text AS t_mid
        `;
        tMid = midRows[0]?.t_mid ?? '';
        expect(tMid.length).toBeGreaterThan(0);

        writeImmutabilityArtifact('H1-AC-4-red-against-start.json', {
          claimId,
          b1Id,
          b2Id,
          b1Statement,
          b1TxFrom,
          b2TxFrom,
          tMid,
          note: 'pre-0006: app could INSERT closed mid-window and hijack belief_as_of',
        });
      } finally {
        await ownerSql.end({ timeout: 5 });
      }

      // Adversary as holocron_app attempts mid-window closed forgery.
      const appSql = createSql(appUrl);
      let sessionUser = '';
      let forgeCode: string | null = null;
      let forgeMessage = '';
      let forgeSucceeded = false;

      try {
        const who = await appSql<{ current_user: string }[]>`SELECT current_user::text`;
        sessionUser = who[0]?.current_user ?? '';
        expect(sessionUser).toBe(HOLOCRON_APP_ROLE);

        try {
          const forged = await appSql<{ id: string }[]>`
            INSERT INTO beliefs (
              claim_id, statement, confidence,
              tx_from, tx_to, actor
            ) VALUES (
              ${claimId},
              ${FORGED},
              0.99,
              ${b1TxFrom}::timestamptz + interval '1 millisecond',
              ${b2TxFrom}::timestamptz,
              'forger-asof'
            )
            RETURNING id::text AS id
          `;
          forgeSucceeded = forged.length >= 1;
        } catch (err) {
          const e = err as { code?: string; message?: string };
          forgeCode = e.code ?? null;
          forgeMessage = e.message ?? String(err);
        }

        // belief_as_of after failed forgery — must return real B1.
        const asOf = await appSql<{ id: string; statement: string }[]>`
          SELECT id::text AS id, statement
          FROM belief_as_of(${claimId}, ${tMid}::timestamptz)
        `;

        const verifySql = createSql(DEFAULT_DATABASE_URL);
        try {
          const forgedCount = await verifySql<{ count: string }[]>`
            SELECT count(*)::text AS count
            FROM beliefs
            WHERE claim_id = ${claimId} AND statement = ${FORGED}
          `;

          const green = {
            must_observe: {
              session_user: sessionUser,
              forge_sqlstate: forgeCode,
              forge_message: forgeMessage,
              asof_id: asOf[0]?.id,
              asof_statement: asOf[0]?.statement,
              b1_id: b1Id,
              b1_statement: b1Statement,
              forged_committed_count: Number(forgedCount[0]?.count ?? 0),
            },
            must_not_observe: {
              forge_succeeded: forgeSucceeded,
              asof_forged: asOf[0]?.statement === FORGED,
            },
          };
          writeImmutabilityArtifact('H1-AC-4-green.json', green);
          writeH1Artifact('AC-4-asof-no-forgery.json', green);

          expect(sessionUser).toBe(HOLOCRON_APP_ROLE);
          expect(forgeCode).toBe('42501');
          expect(forgeMessage.toLowerCase()).toMatch(/permission denied/);
          expect(forgeSucceeded).toBe(false);
          expect(Number(forgedCount[0]?.count ?? 0)).toBe(0);
          expect(asOf.length).toBe(1);
          expect(asOf[0]?.id).toBe(b1Id);
          expect(asOf[0]?.statement).toBe(b1Statement);
          expect(asOf[0]?.statement).not.toBe(FORGED);
        } finally {
          await verifySql.end({ timeout: 5 });
        }
      } finally {
        await appSql.end({ timeout: 5 });
      }
    });
  });
});
