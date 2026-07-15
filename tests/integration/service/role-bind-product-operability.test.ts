/**
 * AC-4 / TC-4 (REDHAT-FIX-H2): Product operability under app role (seed + revise).
 *
 * NEGATIVE CONTROL (would fail if):
 * - Bind without GRANT INSERT on sources/passages/claims/relations
 * - Operability fixed by granting UPDATE/DELETE on beliefs
 * - Seed stubs ok:true without DB writes
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-product-operability.test.ts
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
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function writeArtifact(name: string, body: unknown): void {
  mkdirSync(TMP, { recursive: true });
  const path = resolve(TMP, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

describe('AC-4: product operability under holocron_app', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('seed tables + revise_belief succeed; beliefs UPDATE/DELETE still false', async () => {
    await withEvidenceLock(async () => {
      const { createSql } = await import('../../../services/platform/src/db/client');
      const { HOLOCRON_APP_ROLE, reviseBelief, seedEvidence } = await import(
        '../../../services/platform/src/db/evidence/index'
      );

      const seed = await seedEvidence();
      expect(seed.ok, seed.errors.join('; ')).toBe(true);
      expect(seed.sessionRole).toBe(HOLOCRON_APP_ROLE);
      expect(seed.claimId).toMatch(UUID_RE);
      expect(seed.beliefId).toMatch(UUID_RE);
      expect(seed.passageIds).toHaveLength(2);
      expect(seed.errors.some((e) => /42501|permission denied/i.test(e))).toBe(false);

      // Product seed already creates the open belief via seed_open_belief (H3).
      // Revise that belief under holocron_app (one-open-per-claim unique index).
      const revise = await reviseBelief({
        beliefId: seed.beliefId as string,
        actor: 'role-bind-ac4',
        runId: `run-ac4-${Date.now()}`,
        idempotencyKey: `idem-ac4-${Date.now()}`,
        statement: 'operability-revised',
        confidence: 0.81,
      });
      expect(revise.ok, revise.errors.join('; ')).toBe(true);
      expect(revise.sessionRole).toBe(HOLOCRON_APP_ROLE);
      expect(revise.successorId).toMatch(UUID_RE);

      const ownerSql = createSql(DEFAULT_DATABASE_URL);
      try {
        const privs = await ownerSql<
          {
            can_update: boolean;
            can_delete: boolean;
            sources_insert: boolean;
            passages_insert: boolean;
            claims_insert: boolean;
            relations_insert: boolean;
          }[]
        >`
          SELECT
            has_table_privilege('holocron_app', 'beliefs', 'UPDATE') AS can_update,
            has_table_privilege('holocron_app', 'beliefs', 'DELETE') AS can_delete,
            has_table_privilege('holocron_app', 'sources', 'INSERT') AS sources_insert,
            has_table_privilege('holocron_app', 'passages', 'INSERT') AS passages_insert,
            has_table_privilege('holocron_app', 'claims', 'INSERT') AS claims_insert,
            has_table_privilege('holocron_app', 'relations', 'INSERT') AS relations_insert
        `;
        const p = privs[0];

        const green = {
          seed_ok: seed.ok,
          claimId: seed.claimId,
          passageIds_length: seed.passageIds.length,
          seed_session: seed.sessionRole,
          revise_ok: revise.ok,
          successorId: revise.successorId,
          revise_session: revise.sessionRole,
          beliefs_update: p?.can_update,
          beliefs_delete: p?.can_delete,
          seed_table_inserts: {
            sources: p?.sources_insert,
            passages: p?.passages_insert,
            claims: p?.claims_insert,
            relations: p?.relations_insert,
          },
        };
        writeArtifact('AC-4-green-operability.json', green);

        expect(p?.can_update).toBe(false);
        expect(p?.can_delete).toBe(false);
        expect(p?.sources_insert).toBe(true);
        expect(p?.passages_insert).toBe(true);
        expect(p?.claims_insert).toBe(true);
        expect(p?.relations_insert).toBe(true);
      } finally {
        await ownerSql.end({ timeout: 5 });
      }
    });
  });
});
