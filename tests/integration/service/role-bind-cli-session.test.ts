/**
 * AC-5 / TC-5 (REDHAT-FIX-H2): CLI product commands inherit app-role binding.
 *
 * NEGATIVE CONTROL (would fail if):
 * - CLI still uses resolveDatabaseUrl without app-role rewrite for evidence
 * - Only unit-testing toAppRoleDatabaseUrl without CLI process
 * - Stub CLI prints holocron_app without connecting
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-cli-session.test.ts
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
  withEvidenceLock,
} from './evidence-harness';

const TMP = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-H2');

function writeArtifact(name: string, body: unknown): void {
  mkdirSync(TMP, { recursive: true });
  const path = resolve(TMP, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

describe('AC-5: CLI product commands inherit holocron_app binding', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('db:probe --raw and evidence:belief report holocron_app', async () => {
    await withEvidenceLock(async () => {
      const { HOLOCRON_APP_ROLE, seedOpenBelief } = await import(
        '../../../services/platform/src/db/evidence/index'
      );

      // Owner DATABASE_URL is injected by runHolo harness — product must still be app role.
      const probe = runHolo(['db:probe', '--raw', 'SELECT current_user::text AS u', '--json']);
      const probeOut = `${probe.stdout}\n${probe.stderr}`;
      expect(probe.status, probeOut).toBe(0);
      const probePayload = parseJsonObject(probe.stdout) as {
        role?: string;
        messages?: string[];
        report?: string;
      };
      const probeReport = probePayload.report ?? probeOut;
      const probeHasApp =
        probePayload.role === HOLOCRON_APP_ROLE ||
        /role:\s*holocron_app/i.test(probeReport) ||
        /current_user:\s*holocron_app/i.test(probeReport);
      expect(probeHasApp).toBe(true);

      const open = await seedOpenBelief({
        databaseUrl: DEFAULT_DATABASE_URL,
        claimId: `claim-cli-role-${Date.now()}`,
        statement: 'cli-session-open',
      });
      expect(open.ok).toBe(true);

      const belief = runHolo([
        'evidence:belief',
        '--claim-id',
        open.claimId,
        '--as-of',
        'now',
        '--json',
      ]);
      // belief may exit 0 when found; role must still be present in JSON/messages.
      const beliefPayload = parseJsonObject(belief.stdout) as {
        sessionRole?: string | null;
        current_user?: string | null;
        messages?: string[];
      };
      const evidenceRole =
        beliefPayload.sessionRole ??
        beliefPayload.current_user ??
        beliefPayload.messages
          ?.find((m) => m.startsWith('current_user:'))
          ?.replace(/^current_user:\s*/, '') ??
        '';

      expect(evidenceRole).toBe(HOLOCRON_APP_ROLE);
      expect(evidenceRole).not.toBe('');

      // Owner username must not appear as product session role.
      const ownerName = (() => {
        try {
          return new URL(DEFAULT_DATABASE_URL).username || '';
        } catch {
          return '';
        }
      })();

      const appPathCount = [probeHasApp, evidenceRole === HOLOCRON_APP_ROLE].filter(Boolean).length;

      const green = {
        probe_exit: probe.status,
        probe_role: probePayload.role,
        probe_report_snippet: probeReport.split('\n').slice(0, 8),
        evidence_exit: belief.status,
        evidence_session_role: evidenceRole,
        cli_product_paths_holocron_app_count: appPathCount,
        owner_username_in_url: ownerName,
      };
      writeArtifact('AC-5-green-cli-session.json', green);

      expect(appPathCount).toBeGreaterThanOrEqual(1);
      if (ownerName && ownerName !== HOLOCRON_APP_ROLE) {
        expect(evidenceRole).not.toBe(ownerName);
      }
    });
  });
});
