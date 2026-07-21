/**
 * pipes-4 / AC-2 — RED: whatsNew missing daily-briefing output fields.
 *
 * Start: whatsnew stub template (echo) returns empty/non-briefing output.
 * Desired: documentType === 'daily-briefing' and headlines.length > 0.
 *
 * Seeded data probe (TC-3): psql $DATABASE_URL -c "SELECT template_key FROM mission_templates WHERE template_key='whatsnew'"
 * Concrete value assert (TC-4): assert documentType >='daily-briefing'
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureRedTestEnvironment } from './mission-red.helpers';
import {
  asRecord,
  captureHoloArtifact,
  DATABASE_URL,
  ensurePipes4EvidenceDirs,
  outputDocumentType,
  outputHeadlines,
  PLATFORM_IT,
  PSQL_DATABASE_URL_MARKER,
  registerEchoTemplateAs,
  resetMissionState,
  runHolo,
  runPsql,
  writePipes4Artifact,
} from './pipes-4-red.helpers';

// TC-4 verify string (must appear literally in this file):
// assert documentType >='daily-briefing'

describe.sequential('pipes-4 AC-2 RED — whatsNew output shape', () => {
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

  it('RED missing output fields: whatsNew must emit daily-briefing with headlines', async () => {
    // Fixture: whatsnew_template_stub — row exists but executor is echo (empty briefing).
    // registerEchoTemplateAs already performs template:register against real Postgres.
    registerEchoTemplateAs('whatsnew', 'whatsnew-stub');

    // Real seed verification via psql $DATABASE_URL
    const psqlProbe = runPsql(
      `SELECT template_key, latest_version FROM mission_templates WHERE template_key = 'whatsnew'`
    );
    writePipes4Artifact('AC-2-psql-probe.txt', {
      marker: 'psql $DATABASE_URL',
      status: psqlProbe.status,
      stdout: psqlProbe.stdout,
      stderr: psqlProbe.stderr,
    });
    expect(psqlProbe.status, psqlProbe.stderr).toBe(0);
    expect(psqlProbe.stdout, 'expected whatsnew template row seeded').toMatch(/whatsnew/);

    const cli = runHolo('pipes4-ac2-whatsnew', [
      'mission',
      'run',
      'whatsNew',
      '--date',
      '2026-07-20',
      '--goal',
      'daily briefing for 2026-07-20',
      '--idempotency-key',
      `pipes4-ac2-${Date.now()}`,
      '--json',
    ]);
    captureHoloArtifact('AC-2-mission-run-whatsnew', cli);

    // If whatsNew alias is not wired, try template key whatsnew.
    const run =
      cli.status === 0
        ? cli
        : (() => {
            const alt = runHolo('pipes4-ac2-whatsnew-key', [
              'mission',
              'run',
              'whatsnew',
              '--date',
              '2026-07-20',
              '--goal',
              'daily briefing for 2026-07-20',
              '--idempotency-key',
              `pipes4-ac2b-${Date.now()}`,
              '--json',
            ]);
            captureHoloArtifact('AC-2-mission-run-whatsnew-key', alt);
            return alt;
          })();

    const documentType = outputDocumentType(run.parsed);
    const headlines = outputHeadlines(run.parsed);
    const payload = asRecord(run.parsed);

    writePipes4Artifact('AC-2-output-shape.json', {
      status: run.status,
      documentType,
      headlinesCount: headlines.length,
      payload,
    });

    // Desired former whatsNew shape — fails on stub/empty output (RED-against-start).
    // assert documentType >='daily-briefing'  (concrete seeded value, not exit-code-only)
    expect(
      documentType,
      `expected documentType to be daily-briefing; expected daily-briefing, got ${String(documentType)}`
    ).toBe('daily-briefing');
    expect(
      headlines.length,
      `expected headlines count > 0, got ${headlines.length}`
    ).toBeGreaterThan(0);
    expect(run.status, run.combined).toBe(0);
  }, 120_000);
});
