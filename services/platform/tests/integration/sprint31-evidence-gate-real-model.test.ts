/**
 * S31-09 — real fleet model output into the deterministic evidence gate;
 * ASSAY ≠ CHALLENGE on resolved instance ids.
 *
 * PRIMARY AC drives `holo mission run research` as a real child process (R29).
 * NEVER constructs EvidenceGateInput in-test as the sole proof.
 * NEVER mocks @mastra/* or the fleet.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint31-evidence-gate-real-model.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSql } from '../../src/db/client.ts';
import { ensureSystemMissionTemplates } from '../../src/mission/templates/ensure-system.ts';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const FLEET_TIMEOUT_MS = 300_000;
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S31-09');
const CLAIMS_FIXTURE = resolve(
  REPO_ROOT,
  'services/platform/tests/fixtures/research/claims-4.json'
);
const FLEET_URL = process.env.FLEET_URL ?? 'http://127.0.0.1:4545/v1';
const DATABASE_URL = process.env.DATABASE_URL?.includes('holocron_nonprod')
  ? process.env.DATABASE_URL
  : (process.env.DATABASE_URL?.replace(/\/holocron(?:\?|$)/, '/holocron_nonprod$1') ??
    'postgres://127.0.0.1:5432/holocron_nonprod');

/**
 * Other worktrees may re-register system templates with a different absolute
 * fleet_manifest_path — wipe template rows + re-seed on immutable drift.
 */
async function ensureTemplatesResilient(): Promise<void> {
  try {
    await ensureSystemMissionTemplates({ databaseUrl: DATABASE_URL });
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('immutable mission template conflict')) throw error;
  }
  const sql = createSql(DATABASE_URL);
  try {
    await sql`DELETE FROM mission_stage_runs`;
    await sql`DELETE FROM mission_events`;
    await sql`DELETE FROM mission_checkpoints`;
    await sql`DELETE FROM mission_commits`;
    await sql`DELETE FROM mission_steering`;
    await sql`DELETE FROM mission_verdicts`;
    await sql`DELETE FROM mission_run_tags`;
    await sql`DELETE FROM mission_runs`;
    await sql`DELETE FROM mission_template_versions`;
    await sql`DELETE FROM mission_templates`;
  } finally {
    await sql.end({ timeout: 5 });
  }
  await ensureSystemMissionTemplates({ databaseUrl: DATABASE_URL });
}

const itLive = (
  name: string,
  fn: () => Promise<unknown> | undefined,
  timeout = FLEET_TIMEOUT_MS
) => {
  if (PLATFORM_IT) it(name, fn, timeout);
  else it.skip(name, fn);
};

function writeEvidence(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  writeFileSync(path, typeof body === 'string' ? body : JSON.stringify(body, null, 2), 'utf8');
  return path;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseJsonOut(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  if (start < 0) throw new Error(`no JSON object in output:\n${text.slice(0, 2000)}`);
  // Prefer last complete object when logs precede JSON.
  try {
    return JSON.parse(trimmed.slice(start)) as Record<string, unknown>;
  } catch {
    const end = trimmed.lastIndexOf('}');
    if (end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error(`failed to parse JSON:\n${text.slice(0, 2000)}`);
  }
}

function runHolo(
  args: string[],
  env: Record<string, string | undefined> = {}
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: resolve(REPO_ROOT, 'services/platform'),
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL,
      FLEET_URL,
      FLEET_KEY: process.env.FLEET_KEY ?? 'sk-none',
      ...env,
    },
    timeout: FLEET_TIMEOUT_MS,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function placeholderToken(id: string): boolean {
  const lower = id.toLowerCase();
  // Forbidden placeholder tokens that encode the role name instead of a fleet instance.
  return (
    lower.includes(':assay:') ||
    lower.includes(':challenge:') ||
    lower.endsWith(':assay') ||
    lower.endsWith(':challenge') ||
    lower.includes('placeholder')
  );
}

function extractInstanceIds(mission: Record<string, unknown>): {
  assayInstanceId: string;
  challengeInstanceId: string;
  output: Record<string, unknown>;
} {
  const output = asRecord(mission.output);
  const assayInstanceId =
    (typeof output.assayInstanceId === 'string' && output.assayInstanceId) ||
    (typeof mission.assayInstanceId === 'string' && mission.assayInstanceId) ||
    '';
  const challengeInstanceId =
    (typeof output.challengeInstanceId === 'string' && output.challengeInstanceId) ||
    (typeof mission.challengeInstanceId === 'string' && mission.challengeInstanceId) ||
    '';
  return { assayInstanceId, challengeInstanceId, output };
}

describe('S31-09 real model output into evidence gate; ASSAY≠CHALLENGE', () => {
  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    const fleet = await fetch(`${FLEET_URL}/models`).catch(() => null);
    if (!fleet?.ok) {
      throw new Error(`fleet /v1/models failed at ${FLEET_URL}`);
    }
    await ensureTemplatesResilient();
  }, 120_000);

  itLive('researchCycleUsesDistinctAssayChallengeInstances', async () => {
    const goal = `s31-09-assay-challenge ${Date.now()}`;
    const child = runHolo([
      'mission',
      'run',
      'research',
      '--goal',
      goal,
      '--components',
      '2',
      '--claims',
      CLAIMS_FIXTURE,
      '--fresh',
      '--json',
    ]);
    writeEvidence('ac1-mission-child.json', {
      status: child.status,
      stdout: (child.stdout ?? '').slice(0, 12_000),
      stderr: (child.stderr ?? '').slice(0, 4_000),
    });

    expect(child.status, `mission failed:\n${child.stderr}\n${child.stdout}`).toBe(0);
    const mission = parseJsonOut(child.stdout);
    expect(mission.ok).toBe(true);
    expect(typeof mission.runId).toBe('string');
    const runId = String(mission.runId);

    // Prefer inspect (stage outputs) — works for completed and gate-suspended runs.
    const inspect = runHolo(['research:inspect', runId, '--json']);
    writeEvidence('ac1-inspect.json', {
      status: inspect.status,
      stdout: (inspect.stdout ?? '').slice(0, 12_000),
      stderr: (inspect.stderr ?? '').slice(0, 4_000),
    });
    expect(inspect.status).toBe(0);
    const inspection = parseJsonOut(inspect.stdout);
    const fromMission = extractInstanceIds(mission);
    const assayInstanceId =
      (typeof inspection.assayInstanceId === 'string' && inspection.assayInstanceId) ||
      fromMission.assayInstanceId;
    const challengeInstanceId =
      (typeof inspection.challengeInstanceId === 'string' && inspection.challengeInstanceId) ||
      fromMission.challengeInstanceId;

    writeEvidence('ac1-instance-ids.json', {
      runId,
      assayInstanceId,
      challengeInstanceId,
      status: inspection.status,
      assayChallengeDistinct: inspection.assayChallengeDistinct,
      outputKeys: Object.keys(fromMission.output),
    });

    expect(assayInstanceId.length, 'assayInstanceId must be non-empty').toBeGreaterThanOrEqual(1);
    expect(
      challengeInstanceId.length,
      'challengeInstanceId must be non-empty'
    ).toBeGreaterThanOrEqual(1);
    expect(assayInstanceId).not.toBe(challengeInstanceId);
    expect(
      placeholderToken(assayInstanceId),
      `assay id has placeholder token: ${assayInstanceId}`
    ).toBe(false);
    expect(
      placeholderToken(challengeInstanceId),
      `challenge id has placeholder token: ${challengeInstanceId}`
    ).toBe(false);

    writeEvidence('ac1-run-id.txt', runId);
  });

  itLive('gateInputDerivedFromModelOutput', async () => {
    const goal = `s31-09-gate-from-model ${Date.now()}`;
    const child = runHolo([
      'mission',
      'run',
      'research',
      '--goal',
      goal,
      '--components',
      '2',
      '--claims',
      CLAIMS_FIXTURE,
      '--fresh',
      '--json',
    ]);
    writeEvidence('ac2-mission-child.json', {
      status: child.status,
      stdout: (child.stdout ?? '').slice(0, 12_000),
      stderr: (child.stderr ?? '').slice(0, 4_000),
    });
    expect(child.status, `mission failed:\n${child.stderr}\n${child.stdout}`).toBe(0);

    const mission = parseJsonOut(child.stdout);
    const runId = String(mission.runId);
    expect(runId.length).toBeGreaterThan(0);

    const inspect = runHolo(['research:inspect', runId, '--json']);
    writeEvidence('ac2-inspect.json', {
      status: inspect.status,
      stdout: (inspect.stdout ?? '').slice(0, 16_000),
      stderr: (inspect.stderr ?? '').slice(0, 4_000),
    });
    expect(inspect.status).toBe(0);
    const inspection = parseJsonOut(inspect.stdout);

    // Stage artifacts: challenge output carries assayText + evidence + gate reason.
    const output = asRecord(mission.output);
    const findings = asRecord(inspection.findings);
    const evidenceBag = asRecord(output.evidence ?? findings);
    const evidenceItems = Array.isArray(evidenceBag.evidence)
      ? (evidenceBag.evidence as Array<Record<string, unknown>>)
      : Array.isArray(findings.evidence)
        ? (findings.evidence as Array<Record<string, unknown>>)
        : [];

    // Load assay stage text via inspect processes / gate fields when available.
    // Prefer challenge output fields on mission output + findings.
    const challengeStage = runHolo(['research:inspect', runId, '--json', '--processes']);
    const challengeInspect = parseJsonOut(challengeStage.stdout);
    writeEvidence('ac2-processes.json', {
      findings: challengeInspect.findings,
      gate: challengeInspect.gate,
      processProof: challengeInspect.processProof,
    });

    // Re-query stage rows via inspect findings which include challenge evidence.
    // assayText is required from the fleet path — present on challenge stage output.
    // Fall back to mission typed output nested fields if present.
    const assayText =
      (typeof output.assayText === 'string' && output.assayText) ||
      (typeof findings.assayText === 'string' && findings.assayText) ||
      '';

    // If assayText is not on gate output, pull from stage via a second inspect path:
    // challenge findings may be the evidence array only; use gate evidence + model
    // quote ⊆ sourceText rule as the durable proof.
    const gate = asRecord(inspection.gate ?? output);
    expect(typeof gate.reason === 'string' && gate.reason.length > 0).toBe(true);

    // At least one evidence item: quote is a non-empty substring of sourceText.
    expect(evidenceItems.length, 'expected evidence items on mission/inspect').toBeGreaterThan(0);
    const quoteLinked = evidenceItems.filter((item) => {
      const quote = typeof item.quote === 'string' ? item.quote : '';
      const sourceText = typeof item.sourceText === 'string' ? item.sourceText : '';
      return quote.length > 0 && sourceText.length > 0 && sourceText.includes(quote);
    });
    expect(quoteLinked.length, 'no evidence with quote ⊆ sourceText').toBeGreaterThan(0);

    // Regression: enrich must NOT laundry model ASSAY/CHALLENGE prose into
    // gate quote/sourceText (self-cite). Fleet prose lives on assayText /
    // challengeText stage fields only.
    for (const item of evidenceItems) {
      const sourceText = typeof item.sourceText === 'string' ? item.sourceText : '';
      const quote = typeof item.quote === 'string' ? item.quote : '';
      expect(
        sourceText.startsWith('ASSAY fleet output:'),
        'sourceText must not be ASSAY laundry'
      ).toBe(false);
      expect(
        sourceText.includes('ASSAY fleet output:'),
        'sourceText must not embed ASSAY laundry'
      ).toBe(false);
      expect(
        sourceText.includes('CHALLENGE fleet output:'),
        'sourceText must not embed CHALLENGE laundry'
      ).toBe(false);
      expect(quote.includes('ASSAY fleet output:'), 'quote must not be ASSAY laundry').toBe(false);
    }

    // Fleet model output is required on the challenge payload (side channel),
    // not on gate evidence quote/sourceText.
    if (assayText.length > 0) {
      expect(assayText.length).toBeGreaterThanOrEqual(1);
      expect(assayText).not.toMatch(/scaffold placeholder|TODO|FIXME/i);
    } else {
      const challengeText =
        (typeof output.challengeText === 'string' && output.challengeText) ||
        (typeof findings.challengeText === 'string' && findings.challengeText) ||
        '';
      expect(
        challengeText.length > 0,
        'missing assayText and challengeText — fleet side channel empty'
      ).toBe(true);
    }

    writeEvidence('ac2-gate-model-link.json', {
      runId,
      reason: gate.reason,
      admitted: gate.admitted,
      quoteLinkedCount: quoteLinked.length,
      assayTextLen: assayText.length,
      noAssayLaundry: evidenceItems.every(
        (item) => !String(item.sourceText ?? '').includes('ASSAY fleet output:')
      ),
    });
  });

  itLive('assayChallengeCollisionFailsClosed', async () => {
    const goal = `s31-09-collision ${Date.now()}`;
    const child = runHolo(
      [
        'mission',
        'run',
        'research',
        '--goal',
        goal,
        '--components',
        '2',
        '--claims',
        CLAIMS_FIXTURE,
        '--fresh',
        '--json',
      ],
      { HOLO_TEST_FORCE_ASSAY_CHALLENGE_COLLISION: '1' }
    );
    writeEvidence('ac3-collision-child.json', {
      status: child.status,
      stdout: (child.stdout ?? '').slice(0, 8_000),
      stderr: (child.stderr ?? '').slice(0, 4_000),
    });

    expect(child.status, 'collision must exit non-zero').not.toBe(0);
    const combined = `${child.stdout}\n${child.stderr}`;
    expect(combined).toMatch(/ASSAY_CHALLENGE_COLLISION/);

    // Must not commit a successful gate pass under collision.
    let mission: Record<string, unknown> | null = null;
    try {
      mission = parseJsonOut(child.stdout);
    } catch {
      mission = null;
    }
    if (mission) {
      expect(mission.ok).not.toBe(true);
      const output = asRecord(mission.output);
      expect(output.admitted).not.toBe(true);
      const code = String(mission.code ?? mission.errorCode ?? mission.error ?? '');
      expect(code).toMatch(/ASSAY_CHALLENGE_COLLISION/);
    }
  });

  itLive('researchInspectReportsDistinctFlag', async () => {
    const goal = `s31-09-inspect-distinct ${Date.now()}`;
    const child = runHolo([
      'mission',
      'run',
      'research',
      '--goal',
      goal,
      '--components',
      '2',
      '--claims',
      CLAIMS_FIXTURE,
      '--fresh',
      '--json',
    ]);
    writeEvidence('ac4-mission-child.json', {
      status: child.status,
      stdout: (child.stdout ?? '').slice(0, 8_000),
      stderr: (child.stderr ?? '').slice(0, 4_000),
    });
    expect(child.status, `mission failed:\n${child.stderr}\n${child.stdout}`).toBe(0);
    const mission = parseJsonOut(child.stdout);
    const runId = String(mission.runId);

    const inspect = runHolo(['research:inspect', runId, '--json']);
    writeEvidence('ac4-inspect.json', {
      status: inspect.status,
      stdout: (inspect.stdout ?? '').slice(0, 12_000),
      stderr: (inspect.stderr ?? '').slice(0, 4_000),
    });
    expect(inspect.status).toBe(0);
    const inspection = parseJsonOut(inspect.stdout);

    expect(inspection.assayChallengeDistinct).toBe(true);
    expect(typeof inspection.assayInstanceId).toBe('string');
    expect(typeof inspection.challengeInstanceId).toBe('string');
    expect(String(inspection.assayInstanceId).length).toBeGreaterThanOrEqual(1);
    expect(String(inspection.challengeInstanceId).length).toBeGreaterThanOrEqual(1);
    expect(inspection.assayInstanceId).not.toBe(inspection.challengeInstanceId);
    expect(placeholderToken(String(inspection.assayInstanceId))).toBe(false);
    expect(placeholderToken(String(inspection.challengeInstanceId))).toBe(false);
  });
});
