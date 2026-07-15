/**
 * REDHAT-FIX-H3 — product seed → belief path (HT-1→HT-2) without gate-setup scaffold.
 *
 * AC-1..AC-5 / TC-1..TC-5: holo evidence:seed creates exactly one open belief via
 * seed_open_belief DEFINER; immediate evidence:belief --as-of now succeeds with
 * product actor/statement (not gate-setup); holocron_app session; substrate intact.
 *
 * NEGATIVE CONTROL (would fail if):
 * - seedEvidence still inserts only source+passages+claim+relations with NO belief
 * - beliefId invented in JSON without DB row
 * - Test inserts gate-setup belief between seed and belief (scaffold)
 * - actor=gate-setup / statement='initial gate belief from seed claim'
 * - seed reconnects as owner for raw INSERT after H1 REVOKE
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     pnpm vitest run tests/integration/service/evidence-seed-belief-path.test.ts
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

const TMP = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-H3');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GATE_ACTOR = 'gate-setup';
const GATE_STATEMENT = 'initial gate belief from seed claim';

function writeArtifact(name: string, body: unknown): string {
  mkdirSync(TMP, { recursive: true });
  const path = resolve(TMP, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

describe('REDHAT-FIX-H3: product seed creates open belief (HT-1→HT-2)', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive(
    'AC-1..AC-5: evidence:seed → open belief → evidence:belief --as-of now (no scaffold)',
    async () => {
      await withEvidenceLock(async () => {
        await truncateEvidenceTables();

        // ── HT-1 product seed only (no gate-setup SQL, no harness belief insert) ──
        const seed = runHolo(['evidence:seed', '--json']);
        const seedOut = `${seed.stdout}\n${seed.stderr}`;
        expect(seed.status, seedOut).toBe(0);
        const seedPayload = parseJsonObject(seed.stdout) as {
          ok?: boolean;
          claimId?: string | null;
          beliefId?: string | null;
          passageIds?: string[];
          relationIds?: string[];
          sessionRole?: string | null;
          counts?: { openRelations?: number };
          errors?: string[];
        };

        expect(seedPayload.ok, seedOut).toBe(true);
        expect(seedPayload.claimId, 'claimId present').toMatch(UUID_RE);
        expect(seedPayload.beliefId, 'beliefId present on seed JSON').toMatch(UUID_RE);
        expect(seedPayload.passageIds).toHaveLength(2);
        expect(seedPayload.relationIds).toHaveLength(2);
        expect(seedPayload.sessionRole).toBe('holocron_app');

        const claimId = seedPayload.claimId as string;
        const beliefId = seedPayload.beliefId as string;

        const { createSql } = await import('../../../services/platform/src/db/client');
        const { HOLOCRON_APP_ROLE, SEED_CLAIM_TEXT, SEED_BELIEF_ACTOR } = await import(
          '../../../services/platform/src/db/evidence/index'
        );

        const sql = createSql(DEFAULT_DATABASE_URL);
        try {
          // AC-1: exactly one open belief for claimId; beliefId row is open
          const openRows = await sql<
            {
              id: string;
              claim_id: string;
              tx_to: string | null;
              actor: string | null;
              statement: string;
              confidence: number | null;
            }[]
          >`
            SELECT id::text AS id, claim_id, tx_to::text AS tx_to, actor, statement, confidence
            FROM beliefs
            WHERE claim_id = ${claimId}
              AND tx_to IS NULL
          `;
          expect(openRows).toHaveLength(1);
          expect(openRows[0]?.id).toBe(beliefId);
          expect(openRows[0]?.tx_to).toBeNull();
          expect(openRows[0]?.claim_id).toBe(claimId);

          // AC-3: product actor/statement — not gate-setup scaffold
          const actor = openRows[0]?.actor ?? '';
          const statement = openRows[0]?.statement ?? '';
          expect(actor.length).toBeGreaterThan(0);
          expect(actor).not.toBe(GATE_ACTOR);
          expect(actor).toBe(SEED_BELIEF_ACTOR);
          expect(statement).not.toBe(GATE_STATEMENT);
          expect(statement).toBe(SEED_CLAIM_TEXT);
          expect(statement).toMatch(/Quarterly revenue grew year-over-year/i);

          // AC-4: holocron_app cannot raw INSERT beliefs; seed still wrote via DEFINER
          const privs = await sql<{ can_insert: boolean }[]>`
            SELECT has_table_privilege('holocron_app', 'beliefs', 'INSERT') AS can_insert
          `;
          expect(privs[0]?.can_insert).toBe(false);

          // AC-5 substrate: 2 passages, 2 supports/contradicts, open relations
          const sc = await sql<{ count: string }[]>`
            SELECT count(*)::text AS count
            FROM relations
            WHERE relation_type IN ('supports', 'contradicts')
              AND tx_to IS NULL
          `;
          expect(Number(sc[0]?.count ?? 0)).toBeGreaterThanOrEqual(2);
          expect(seedPayload.counts?.openRelations ?? 0).toBeGreaterThanOrEqual(2);

          writeArtifact('AC-1-green-seed-belief.json', {
            seed: seedPayload,
            openBelief: openRows[0],
            holocron_app_insert_beliefs: privs[0]?.can_insert,
            product_actor: actor,
            product_statement: statement,
            sessionRole: seedPayload.sessionRole,
          });
        } finally {
          await sql.end({ timeout: 5 });
        }

        // ── HT-2: immediately after product seed only — no scaffold ──
        const belief = runHolo([
          'evidence:belief',
          '--claim-id',
          claimId,
          '--as-of',
          'now',
          '--json',
        ]);
        const beliefOut = `${belief.stdout}\n${belief.stderr}`;
        expect(belief.status, beliefOut).toBe(0);
        const beliefPayload = parseJsonObject(belief.stdout) as {
          ok?: boolean;
          beliefId?: string | null;
          statement?: string | null;
          netSupport?: number | null;
          errors?: string[];
          sessionRole?: string | null;
        };

        expect(beliefPayload.ok, beliefOut).toBe(true);
        expect(beliefPayload.beliefId).toBe(beliefId);
        expect((beliefPayload.statement ?? '').length).toBeGreaterThan(0);
        expect(typeof beliefPayload.netSupport).toBe('number');
        // Seed baseline: supports closed 2024-H1, contradicts open → netSupport -1 at now
        expect(beliefPayload.netSupport).toBe(-1);
        expect(beliefPayload.errors ?? []).not.toEqual(
          expect.arrayContaining([expect.stringMatching(/no belief for claim/i)])
        );
        expect(beliefPayload.sessionRole).toBe(HOLOCRON_APP_ROLE);

        writeArtifact('AC-2-green-belief-asof.json', {
          seedBeliefId: beliefId,
          claimId,
          belief: beliefPayload,
        });

        // Spec evidence copy for reviewer
        const summary = {
          task: 'REDHAT-FIX-H3',
          phase: 'GREEN',
          seed_ok: seedPayload.ok,
          claimId,
          beliefId,
          sessionRole: seedPayload.sessionRole,
          actor: SEED_BELIEF_ACTOR,
          statement: SEED_CLAIM_TEXT,
          belief_asof_ok: beliefPayload.ok,
          netSupport: beliefPayload.netSupport,
          passageIds_length: seedPayload.passageIds?.length,
          relationIds_length: seedPayload.relationIds?.length,
        };
        writeArtifact('REDHAT-FIX-H3-green-summary.json', summary);
        mkdirSync(resolve(REPO_ROOT, '.spec/evidence'), { recursive: true });
        writeFileSync(
          resolve(REPO_ROOT, '.spec/evidence/redhat-fix-h3-green.json'),
          `${JSON.stringify(summary, null, 2)}\n`,
          'utf8'
        );
      });
    }
  );
});
