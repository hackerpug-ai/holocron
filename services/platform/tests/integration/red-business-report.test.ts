/**
 * pipes-4 / AC-3 — RED: business-report must be ONE parameterized template
 * covering 4 kinds (not 4 separate rows).
 *
 * Start: four_separate_templates (revenue-validation, competitive, ai-roi, flights).
 * Desired: exactly 1 mission_templates row with template_key='business-report'.
 *
 * Seeded data probe (TC-3): psql $DATABASE_URL -c "SELECT template_key FROM mission_templates"
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureRedTestEnvironment } from './mission-red.helpers';
import {
  BUSINESS_REPORT_KIND_KEYS,
  countTemplatesByKeys,
  DATABASE_URL,
  ensurePipes4EvidenceDirs,
  PLATFORM_IT,
  PSQL_DATABASE_URL_MARKER,
  registerEchoTemplateAs,
  resetMissionState,
  runPsql,
  writePipes4Artifact,
} from './pipes-4-red.helpers';

describe.sequential('pipes-4 AC-3 RED — business-report one template 4 kinds', () => {
  beforeAll(async () => {
    ensurePipes4EvidenceDirs();
    await ensureRedTestEnvironment();
    expect(PLATFORM_IT).toBe(true);
    expect(DATABASE_URL).toContain('/holocron_nonprod');
    expect(PSQL_DATABASE_URL_MARKER).toContain('psql $DATABASE_URL');
  }, 120_000);

  beforeEach(async () => {
    await resetMissionState();
  }, 30_000);

  it('RED one template: exactly 1 business-report row must cover all 4 kinds', async () => {
    // Fixture: four_separate_templates — anti-pattern seed (what collapse removes).
    for (const kind of BUSINESS_REPORT_KIND_KEYS) {
      registerEchoTemplateAs(kind, `business-kind-${kind}`);
    }

    // Real seed verification via psql $DATABASE_URL
    const psqlKinds = runPsql(
      `SELECT template_key FROM mission_templates WHERE template_key IN ('revenue-validation','competitive','ai-roi','flights','business-report') ORDER BY template_key`
    );
    writePipes4Artifact('AC-3-psql-probe.txt', {
      marker: 'psql $DATABASE_URL',
      status: psqlKinds.status,
      stdout: psqlKinds.stdout,
      stderr: psqlKinds.stderr,
    });
    expect(psqlKinds.status, psqlKinds.stderr).toBe(0);
    expect(psqlKinds.stdout, 'revenue-validation seed required').toMatch(/revenue-validation/);

    const separateCount = await countTemplatesByKeys([...BUSINESS_REPORT_KIND_KEYS]);
    const businessReportCount = await countTemplatesByKeys(['business-report']);

    writePipes4Artifact('AC-3-template-counts.json', {
      separateCount,
      businessReportCount,
      kinds: BUSINESS_REPORT_KIND_KEYS,
      databaseUrl: DATABASE_URL,
    });

    // Desired GREEN: one parameterized business-report template.
    // RED-against-start with 4 separate rows: expected 1 template, found 4
    expect(
      businessReportCount,
      `expected 1 template, found ${separateCount} — revenue-validation competitive ai-roi flights still separate`
    ).toBe(1);
    expect(
      separateCount,
      `expected 1 template, found ${separateCount}; revenue-validation and siblings must collapse into business-report`
    ).toBe(0);
  }, 120_000);
});
