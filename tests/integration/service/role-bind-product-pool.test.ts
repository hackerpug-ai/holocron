/**
 * AC-1 / TC-1 (REDHAT-FIX-H2): Product evidence helpers connect as holocron_app.
 *
 * NEGATIVE CONTROL (would fail if):
 * - resolveDatabaseUrl still used unchanged by seed/revise/belief/register-doc
 * - Only probe-raw rewrites to holocron_app
 * - Test only asserts URL string rewrite without product entrypoints
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-product-pool.test.ts
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

describe('AC-1: product evidence helpers connect as holocron_app', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive(
    'seed / revise / belief / register-doc sessions report current_user=holocron_app',
    async () => {
      await withEvidenceLock(async () => {
        const { createSql } = await import('../../../services/platform/src/db/client');
        const { HOLOCRON_APP_ROLE, getBeliefAsOf, registerDoc, reviseBelief, seedEvidence } =
          await import('../../../services/platform/src/db/evidence/index');

        // Contrast: owner connection is NOT holocron_app.
        const ownerSql = createSql(DEFAULT_DATABASE_URL);
        let ownerUser = '';
        try {
          const who = await ownerSql<{ current_user: string }[]>`SELECT current_user::text`;
          ownerUser = who[0]?.current_user ?? '';
        } finally {
          await ownerSql.end({ timeout: 5 });
        }
        expect(ownerUser).not.toBe(HOLOCRON_APP_ROLE);
        expect(ownerUser.length).toBeGreaterThan(0);

        writeArtifact('AC-1-red-owner-contrast.json', {
          owner_current_user: ownerUser,
          note: 'owner URL session is not holocron_app (product must not share this role)',
        });

        // Product seed (default pool — no explicit databaseUrl) also creates open belief (H3).
        const seed = await seedEvidence();
        expect(seed.sessionRole).toBe(HOLOCRON_APP_ROLE);
        expect(seed.messages.some((m) => m === `current_user: ${HOLOCRON_APP_ROLE}`)).toBe(true);
        expect(seed.beliefId).toBeTruthy();
        expect(seed.claimId).toBeTruthy();

        const revise = await reviseBelief({
          beliefId: seed.beliefId as string,
          actor: 'role-bind-ac1',
          runId: `run-ac1-${Date.now()}`,
          idempotencyKey: `idem-ac1-${Date.now()}`,
          statement: 'role-bind-revised',
          confidence: 0.7,
        });
        expect(revise.sessionRole).toBe(HOLOCRON_APP_ROLE);
        expect(revise.messages.some((m) => m === `current_user: ${HOLOCRON_APP_ROLE}`)).toBe(true);

        const belief = await getBeliefAsOf({
          claimId: seed.claimId as string,
          asOf: 'now',
        });
        expect(belief.sessionRole).toBe(HOLOCRON_APP_ROLE);
        expect(belief.messages.some((m) => m === `current_user: ${HOLOCRON_APP_ROLE}`)).toBe(true);

        // register-doc: session role is observed even when document has no passages.
        const reg = await registerDoc({ documentId: `missing-doc-role-bind-${Date.now()}` });
        expect(reg.sessionRole).toBe(HOLOCRON_APP_ROLE);
        expect(reg.messages.some((m) => m === `current_user: ${HOLOCRON_APP_ROLE}`)).toBe(true);

        const roles = [seed.sessionRole, revise.sessionRole, belief.sessionRole, reg.sessionRole];
        const appCount = roles.filter((r) => r === HOLOCRON_APP_ROLE).length;

        const green = {
          must_observe: {
            seed_current_user: seed.sessionRole,
            revise_current_user: revise.sessionRole,
            belief_current_user: belief.sessionRole,
            register_doc_current_user: reg.sessionRole,
            product_paths_holocron_app_count: appCount,
            owner_current_user: ownerUser,
          },
          must_not_observe: {
            product_equals_owner: roles.some((r) => r === ownerUser),
            product_equals_postgres: roles.some((r) => r === 'postgres'),
            empty_session_role: roles.some((r) => !r),
          },
        };
        writeArtifact('AC-1-green-product-pool.json', green);

        expect(appCount).toBe(4);
        expect(roles.every((r) => r === HOLOCRON_APP_ROLE)).toBe(true);
        expect(roles.some((r) => r === ownerUser)).toBe(false);
        expect(roles.some((r) => r === 'postgres')).toBe(false);
      });
    }
  );
});
