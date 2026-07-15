/**
 * REDHAT-FIX-H1 AC-2: Authorized open-belief seed via SECURITY DEFINER seed_open_belief.
 *
 * NEGATIVE CONTROL (would fail if):
 * - INSERT fully revoked without seed_open_belief definer
 * - seed_open_belief is SECURITY INVOKER and still requires table INSERT for holocron_app
 * - seedOpenBelief TypeScript still does raw INSERT after REVOKE
 * - stub seed_open_belief returning a hardcoded UUID without DB write
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-seed-open-belief-definer.test.ts
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function writeH1Artifact(name: string, body: unknown): void {
  mkdirSync(H1_TMP, { recursive: true });
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(resolve(H1_TMP, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

describe('REDHAT-FIX-H1 AC-2: seed_open_belief SECURITY DEFINER open seed', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('as holocron_app, seed_open_belief inserts open row and is DEFINER/owner', async () => {
    await withEvidenceLock(async () => {
      const { createSql } = await import('../../../services/platform/src/db/client');
      const { HOLOCRON_APP_ROLE, HOLOCRON_OWNER_ROLE, seedOpenBelief, toAppRoleDatabaseUrl } =
        await import('../../../services/platform/src/db/evidence/index');

      const claimId = `claim-h1-seed-open-${Date.now()}`;
      const statement = 'authorized-open-seed-via-definer';
      const appUrl = toAppRoleDatabaseUrl(DEFAULT_DATABASE_URL);

      writeImmutabilityArtifact('H1-AC-2-red-against-start.txt', {
        claimId,
        statement,
        note: 'without seed_open_belief DEFINER, app-role open seed fails after INSERT revoke',
      });

      const appSql = createSql(appUrl);
      let sessionUser = '';
      let sqlBeliefId: string | null = null;

      try {
        const who = await appSql<{ current_user: string }[]>`SELECT current_user::text`;
        sessionUser = who[0]?.current_user ?? '';
        expect(sessionUser).toBe(HOLOCRON_APP_ROLE);

        // Direct SQL path as holocron_app
        const sqlRows = await appSql<{ id: string }[]>`
          SELECT seed_open_belief(
            ${claimId},
            ${statement},
            0.55,
            'op-seed-h1',
            'run-seed-h1',
            NULL::timestamptz,
            NULL::timestamptz
          )::text AS id
        `;
        sqlBeliefId = sqlRows[0]?.id ?? null;
      } finally {
        await appSql.end({ timeout: 5 });
      }

      // TypeScript product path also under app role
      const tsClaimId = `${claimId}-ts`;
      const tsResult = await seedOpenBelief({
        databaseUrl: appUrl,
        claimId: tsClaimId,
        statement: `${statement}-ts`,
        confidence: 0.6,
        actor: 'op-seed-h1-ts',
      });

      const ownerSql = createSql(DEFAULT_DATABASE_URL);
      try {
        expect(sqlBeliefId).toBeTruthy();
        expect(sqlBeliefId).toMatch(UUID_RE);
        expect(tsResult.ok).toBe(true);
        expect(tsResult.beliefId).toMatch(UUID_RE);

        const seeded = await ownerSql<
          {
            id: string;
            claim_id: string;
            statement: string;
            tx_to: string | null;
            tx_from: string | null;
          }[]
        >`
          SELECT id::text AS id, claim_id, statement,
                 tx_to::text AS tx_to, tx_from::text AS tx_from
          FROM beliefs
          WHERE id = ${sqlBeliefId}::uuid
        `;
        const openCount = await ownerSql<{ count: string }[]>`
          SELECT count(*)::text AS count
          FROM beliefs
          WHERE claim_id = ${claimId} AND tx_to IS NULL
        `;
        const txFromCount = await ownerSql<{ count: string }[]>`
          SELECT count(*)::text AS count
          FROM beliefs
          WHERE id = ${sqlBeliefId}::uuid AND tx_from IS NOT NULL
        `;

        const meta = await ownerSql<{ prosecdef: boolean; owner: string }[]>`
          SELECT p.prosecdef,
                 pg_get_userbyid(p.proowner)::text AS owner
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'seed_open_belief'
          LIMIT 1
        `;

        const green = {
          must_observe: {
            session_user: sessionUser,
            beliefId: sqlBeliefId,
            ts_beliefId: tsResult.beliefId,
            tx_to_null: seeded[0]?.tx_to === null,
            open_count: Number(openCount[0]?.count ?? 0),
            tx_from_count: Number(txFromCount[0]?.count ?? 0),
            prosecdef: meta[0]?.prosecdef,
            owner: meta[0]?.owner,
            statement: seeded[0]?.statement,
          },
        };
        writeImmutabilityArtifact('H1-AC-2-green.json', green);
        writeH1Artifact('AC-2-seed-open-belief-definer.json', green);

        expect(sessionUser).toBe(HOLOCRON_APP_ROLE);
        expect(seeded[0]?.tx_to).toBeNull();
        expect(seeded[0]?.tx_from).not.toBeNull();
        expect(seeded[0]?.statement).toBe(statement);
        expect(seeded[0]?.claim_id).toBe(claimId);
        expect(Number(openCount[0]?.count ?? 0)).toBe(1);
        expect(Number(txFromCount[0]?.count ?? 0)).toBe(1);
        expect(meta[0]?.prosecdef).toBe(true);
        expect(meta[0]?.owner).toBe(HOLOCRON_OWNER_ROLE);
      } finally {
        await ownerSql.end({ timeout: 5 });
      }
    });
  });
});
