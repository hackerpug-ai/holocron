/**
 * AC-3 / TC-3 (REDHAT-FIX-H2): Migrate/admin retains owner URL and still works.
 *
 * NEGATIVE CONTROL (would fail if):
 * - createSql always rewrites to holocron_app including migrate
 * - db:migrate fails with permission denied
 * - owner URL path omitted from migrate
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-migrate-owner.test.ts
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
} from './evidence-harness';

const TMP = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-H2');

function writeArtifact(name: string, body: unknown): void {
  mkdirSync(TMP, { recursive: true });
  const path = resolve(TMP, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

describe('AC-3: migrate/admin retains owner URL', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('ensureMigrated / applyMigrations exit 0 and are not forced to holocron_app', async () => {
    const { applyMigrations } = await import('../../../services/platform/src/db/migrate');
    const { HOLOCRON_APP_ROLE } = await import('../../../services/platform/src/db/evidence/index');
    const { createSql } = await import('../../../services/platform/src/db/client');
    const { resolveOwnerDatabaseUrl } = await import(
      '../../../services/platform/src/db/connection'
    );

    const result = await applyMigrations({ databaseUrl: DEFAULT_DATABASE_URL });
    expect(result.ok).toBe(true);

    const sessionLine = result.messages.find((m) => m.startsWith('current_user:'));
    const sessionUser = sessionLine?.replace(/^current_user:\s*/, '') ?? '';
    expect(sessionUser).toBeTruthy();
    expect(sessionUser).not.toBe(HOLOCRON_APP_ROLE);
    expect(result.messages.some((m) => m === 'role_mode: owner/admin')).toBe(true);

    const ownerUrl = resolveOwnerDatabaseUrl({ preferHolocron: true });
    // Owner URL must not rewrite username to holocron_app.
    expect(ownerUrl.includes(`${HOLOCRON_APP_ROLE}@`)).toBe(false);

    const sql = createSql(DEFAULT_DATABASE_URL);
    try {
      const journal = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM drizzle_migrations
      `;
      const journalCount = Number(journal[0]?.count ?? 0);

      const cli = runHolo(['db:migrate', '--json']);
      expect(cli.status).toBe(0);
      const payload = parseJsonObject(cli.stdout) as {
        ok?: boolean;
        messages?: string[];
      };

      const green = {
        apply_ok: result.ok,
        migrate_session_user: sessionUser,
        journal_count: journalCount,
        cli_exit: cli.status,
        cli_ok: payload.ok,
        owner_url_not_app_role: !ownerUrl.includes(`${HOLOCRON_APP_ROLE}@`),
      };
      writeArtifact('AC-3-green-migrate-owner.json', green);

      expect(journalCount).toBeGreaterThanOrEqual(1);
      expect(payload.ok).toBe(true);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
