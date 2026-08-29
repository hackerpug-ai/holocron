/**
 * pipes-4 / AC-1 — RED: evidence-research template missing.
 *
 * Against empty mission registry, research must fail until the shared
 * evidence-research template exists. Real Postgres only (no mocks).
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *   HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test \
 *   pnpm vitest run packages/platform/tests/integration/red-evidence-research.test.ts -t 'RED missing template'
 *
 * Seeded data probe (TC-3): psql $DATABASE_URL -c "SELECT template_key FROM mission_templates"
 */
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureSystemMissionTemplates } from '../../src/mission/templates/ensure-system';
import { ensureRedTestEnvironment } from './mission-red.helpers';
import {
  captureHoloArtifact,
  countTemplatesByKeys,
  DATABASE_URL,
  ensurePipes4EvidenceDirs,
  PLATFORM_IT,
  PSQL_DATABASE_URL_MARKER,
  resetMissionState,
  runHolo,
  runPsql,
  writePipes4Artifact,
} from './pipes-4-red.helpers';

const CLAIMS_FIXTURE = resolve(import.meta.dirname, '../fixtures/research/claims-4.json');

describe.sequential('pipes-4 AC-1 RED — evidence-research template', () => {
  beforeAll(async () => {
    ensurePipes4EvidenceDirs();
    await ensureRedTestEnvironment();
    expect(PLATFORM_IT).toBe(true);
    expect(DATABASE_URL).toContain('/holocron_nonprod');
    // Anchor for TC-3: real psql $DATABASE_URL usage (not a mock).
    expect(PSQL_DATABASE_URL_MARKER).toContain('psql $DATABASE_URL');
  }, 120_000);

  beforeEach(async () => {
    await resetMissionState();
    await ensureSystemMissionTemplates({ databaseUrl: DATABASE_URL });
  }, 30_000);

  it('RED missing template: empty registry has no evidence-research; research run fails', async () => {
    // Real seed probe — must use live Postgres (psql $DATABASE_URL)
    const psqlProbe = runPsql(
      `SELECT template_key FROM mission_templates WHERE template_key = 'evidence-research'`
    );
    writePipes4Artifact('AC-1-psql-probe.txt', {
      marker: 'psql $DATABASE_URL',
      status: psqlProbe.status,
      stdout: psqlProbe.stdout,
      stderr: psqlProbe.stderr,
    });

    const evidenceResearchCount = await countTemplatesByKeys(['evidence-research']);
    writePipes4Artifact('AC-1-template-count.json', {
      evidenceResearchCount,
      databaseUrl: DATABASE_URL,
    });

    // Desired GREEN: evidence-research template row exists.
    // RED-against-start: empty registry → assertion fails with required messages.
    expect(
      evidenceResearchCount,
      'template not found: evidence-research — expected templates to exist'
    ).toBeGreaterThan(0);

    // Also exercise the public CLI entrypoint used by ops (topic/components + goal).
    const cli = runHolo('pipes4-ac1-research', [
      'mission',
      'run',
      'research',
      '--topic',
      'test',
      '--components',
      '1',
      '--goal',
      'test',
      '--claims',
      CLAIMS_FIXTURE,
      '--fresh',
      '--idempotency-key',
      `pipes4-ac1-${Date.now()}`,
      '--json',
    ]);
    captureHoloArtifact('AC-1-mission-run-research', cli);

    expect(
      cli.status,
      `template not found: evidence-research — expected templates to exist; cli=${cli.combined}`
    ).toBe(0);
    expect(cli.combined.toLowerCase(), 'template not found: evidence-research').not.toMatch(
      /template not found|mission template not found/
    );
  }, 90_000);
});
