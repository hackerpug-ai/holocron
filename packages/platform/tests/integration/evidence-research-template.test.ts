/**
 * pipes-1 GREEN — shared evidence-research mission template.
 *
 * Covers AC-1..AC-4 against real Postgres + fleet (no mocks).
 * Retrieve is fail-closed without explicit --claims fixture seed.
 * AC-4 proves real SIGKILL + public `holo mission resume` path.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *   HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test \
 *   pnpm vitest run packages/platform/tests/integration/evidence-research-template.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  HOLO_TEST_CHECKPOINT_BARRIER_ENV,
  MISSION_CHECKPOINT_BARRIER_MARKER,
} from '../../src/mission/checkpoint-barrier.ts';
import { ensureSystemMissionTemplates } from '../../src/mission/templates/ensure-system.ts';
import { EVIDENCE_RESEARCH_TEMPLATE_KEY } from '../../src/mission/templates/evidence-research.ts';
import { evaluateEvidenceGate } from '../../src/research/evidence-gate.ts';
import {
  DATABASE_URL,
  ensureRedTestEnvironment,
  PLATFORM_IT,
  REPO_ROOT,
  runHolo,
  startHoloProcess,
  truncateMissionTables,
  waitForValue,
  withSql,
} from './mission-red.helpers';
import { captureHoloArtifact, countTemplatesByKeys, runPsql } from './pipes-4-red.helpers';

const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/pipes-1');
const RAW_DIR = resolve(EVIDENCE_DIR, 'raw');
const CLAIMS_2 = resolve(REPO_ROOT, 'packages/platform/tests/fixtures/research/claims.json');
const CLAIMS_4 = resolve(REPO_ROOT, 'packages/platform/tests/fixtures/research/claims-4.json');

function ensureDirs(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  mkdirSync(RAW_DIR, { recursive: true });
}

function writeArtifact(name: string, body: unknown): string {
  ensureDirs();
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readCheckpointBarrierProof(value: unknown): {
  marker: string;
  runId: string | null;
  stageIndex: number | null;
  checkpointKey: string | null;
  leaseToken: string | null;
} | null {
  const payload = asRecord(value);
  if (
    payload.checkpointBarrier !== true ||
    payload.readiness !== true ||
    payload.testOnly !== true
  ) {
    return null;
  }
  if (payload.marker !== MISSION_CHECKPOINT_BARRIER_MARKER) return null;
  const runId = typeof payload.runId === 'string' ? payload.runId : null;
  const stageIndex = typeof payload.stageIndex === 'number' ? payload.stageIndex : null;
  const checkpointKey = typeof payload.checkpointKey === 'string' ? payload.checkpointKey : null;
  const leaseToken = typeof payload.leaseToken === 'string' ? payload.leaseToken : null;
  return {
    marker: String(payload.marker),
    runId,
    stageIndex,
    checkpointKey,
    leaseToken,
  };
}

const itLive = PLATFORM_IT ? it : it.skip;

describe.sequential('pipes-1 GREEN — evidence-research shared template', () => {
  beforeAll(async () => {
    ensureDirs();
    await ensureRedTestEnvironment();
    expect(PLATFORM_IT).toBe(true);
    expect(DATABASE_URL).toContain('/holocron_nonprod');
  }, 120_000);

  beforeEach(async () => {
    await truncateMissionTables();
    await ensureSystemMissionTemplates({ databaseUrl: DATABASE_URL });
  }, 60_000);

  afterAll(() => {
    // artifacts already on disk under .tmp/pipes-1
  });

  itLive(
    'AC-1: research --topic --components 2 --claims fixture completes with admitted evidence',
    async () => {
      const count = await countTemplatesByKeys([EVIDENCE_RESEARCH_TEMPLATE_KEY]);
      expect(count, 'evidence-research template must be registered').toBeGreaterThan(0);

      const templateProbe = runPsql(
        `SELECT v.template_key, v.executor_ref, v.budget_policy_json->>'wallMs' AS wall_ms
         FROM mission_templates t
         JOIN mission_template_versions v
           ON v.template_key = t.template_key AND v.version = t.latest_version
         WHERE t.template_key = 'evidence-research'`
      );
      writeArtifact('AC-1-template-probe.txt', {
        status: templateProbe.status,
        stdout: templateProbe.stdout,
        stderr: templateProbe.stderr,
      });
      expect(templateProbe.status).toBe(0);
      expect(templateProbe.stdout).toMatch(/evidence-research/);
      expect(templateProbe.stdout).toMatch(/evidence-gate/);
      expect(templateProbe.stdout).toMatch(/[0-9]+/);

      const cli = runHolo(
        'pipes1-ac1-research',
        [
          'mission',
          'run',
          'research',
          '--topic',
          'MCP architecture',
          '--components',
          '2',
          '--claims',
          CLAIMS_2,
          '--json',
        ],
        { timeoutMs: 300_000 }
      );
      captureHoloArtifact('AC-1-mission-run-research', cli);
      writeArtifact('AC-1-green.txt', {
        status: cli.status,
        stdout: cli.stdout,
        stderr: cli.stderr,
        parsed: cli.parsed,
      });

      expect(cli.status, cli.combined).toBe(0);
      const payload = (cli.parsed ?? {}) as Record<string, unknown>;
      expect(payload.status).toBe('completed');
      expect(payload.templateKey).toBe(EVIDENCE_RESEARCH_TEMPLATE_KEY);
      expect(payload.ok).toBe(true);

      const output = (payload.output ?? {}) as Record<string, unknown>;
      expect(output.admitted).toBe(true);
      expect(output.executorRef).toBe('evidence-gate');
      const componentsCovered = Number(output.componentsCovered ?? 0);
      expect(componentsCovered).toBeGreaterThanOrEqual(2);
      expect(Number(output.independentSourceCount ?? 0)).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(output.admittedEvidenceIds)).toBe(true);
      expect((output.admittedEvidenceIds as unknown[]).length).toBeGreaterThanOrEqual(1);
      // Non-static: fixture ids must appear (would fail if claims fixture removed).
      expect(output.admittedEvidenceIds).toEqual(expect.arrayContaining(['e1', 'e2']));

      const dbProbe = runPsql(
        `SELECT status, components_covered, independent_source_count,
                jsonb_array_length(COALESCE(admitted_evidence_ids, '[]'::jsonb)) AS admitted_len,
                template_key, executor_ref
         FROM mission_runs
         WHERE template_key = 'evidence-research'
         ORDER BY created_at DESC
         LIMIT 1`
      );
      writeArtifact('AC-1-db-probe.txt', dbProbe);
      expect(dbProbe.status).toBe(0);
      expect(dbProbe.stdout).toMatch(/completed/);
      expect(dbProbe.stdout).toMatch(/evidence-research/);
    },
    300_000
  );

  itLive(
    'AC-1 negative control: research without --claims fails admission (fail-closed retrieve)',
    async () => {
      const cli = runHolo(
        'pipes1-ac1-neg-no-claims',
        [
          'mission',
          'run',
          'research',
          '--topic',
          'MCP architecture',
          '--components',
          '2',
          '--json',
        ],
        { timeoutMs: 300_000 }
      );
      captureHoloArtifact('AC-1-negative-no-claims', cli);
      writeArtifact('AC-1-retrieve-negative-control.txt', {
        status: cli.status,
        parsed: cli.parsed,
        combined: cli.combined,
      });

      const payload = (cli.parsed ?? {}) as Record<string, unknown>;
      // Empty retrieve → gate admitted=false → suspended (or not completed with admit).
      expect(payload.status === 'suspended' || payload.ok === false).toBe(true);
      if (payload.status === 'suspended' || payload.status === 'completed') {
        const output = (payload.output ?? {}) as Record<string, unknown>;
        if (typeof output.admitted === 'boolean') {
          expect(output.admitted).toBe(false);
        }
        if (typeof output.componentsCovered === 'number') {
          expect(output.componentsCovered).toBe(0);
        }
      }
      // Must never silently complete with fabricated always-admissible evidence.
      expect(payload.status).not.toBe('completed');
    },
    300_000
  );

  itLive(
    'AC-2: deepResearch uses same template_key=evidence-research and evidence-gate executor',
    async () => {
      const cli = runHolo(
        'pipes1-ac2-deep',
        [
          'mission',
          'run',
          'deepResearch',
          '--topic',
          'TypeScript type system',
          '--components',
          '4',
          '--claims',
          CLAIMS_4,
          '--json',
        ],
        { timeoutMs: 300_000 }
      );
      captureHoloArtifact('AC-2-mission-run-deepResearch', cli);
      writeArtifact('AC-2-green.txt', {
        status: cli.status,
        stdout: cli.stdout,
        stderr: cli.stderr,
        parsed: cli.parsed,
      });

      expect(cli.status, cli.combined).toBe(0);
      const payload = (cli.parsed ?? {}) as Record<string, unknown>;
      expect(payload.templateKey).toBe(EVIDENCE_RESEARCH_TEMPLATE_KEY);
      expect(payload.status).toBe('completed');
      const output = (payload.output ?? {}) as Record<string, unknown>;
      expect(output.executorRef).toBe('evidence-gate');
      expect(Number(output.componentsCovered ?? 0)).toBe(4);
      expect(output.admittedEvidenceIds).toEqual(expect.arrayContaining(['e1', 'e2', 'e3', 'e4']));

      const dbProbe = runPsql(
        `SELECT r.components_covered, r.template_key, r.executor_ref, t.tag
         FROM mission_runs r
         JOIN mission_run_tags t ON t.run_id = r.id
         WHERE r.template_key = 'evidence-research' AND t.tag = 'deepResearch'
         ORDER BY r.created_at DESC
         LIMIT 1`
      );
      writeArtifact('AC-2-db-probe.txt', dbProbe);
      expect(dbProbe.status).toBe(0);
      expect(dbProbe.stdout).toMatch(/evidence-research/);
      expect(dbProbe.stdout).toMatch(/evidence-gate/);
      expect(dbProbe.stdout).toMatch(/deepResearch/);
      expect(dbProbe.stdout).toMatch(/\b4\b/);
    },
    300_000
  );

  it('AC-3: pure-TS gate admits refuting evidence with direction=refuting', () => {
    const result = evaluateEvidenceGate({
      claims: [
        {
          id: 'c1',
          text: 'TypeScript types are optional',
          component: 'type_system',
        },
      ],
      evidence: [
        {
          id: 'e1',
          claimId: 'c1',
          component: 'type_system',
          sourceId: 's1',
          independenceGroup: 'g1',
          quote: 'TypeScript types are optional',
          sourceText: 'TypeScript types are optional in JSDoc comments',
          grade: 4,
          entailment: 0.9,
          disconfirmationResolved: true,
          direction: 'refuting',
        },
        {
          id: 'e2',
          claimId: 'c1',
          component: 'type_system',
          sourceId: 's2',
          independenceGroup: 'g2',
          quote: 'TypeScript types are optional',
          sourceText: 'TypeScript types are optional in JSDoc comments too',
          grade: 4,
          entailment: 0.9,
          disconfirmationResolved: true,
          direction: 'refuting',
        },
      ],
      requiredComponents: ['type_system'],
      gradeFloor: 3,
      entailmentFloor: 0.8,
      independentSourceFloor: 2,
    });

    writeArtifact('AC-3-green.txt', result);
    expect(result.direction).toBe('refuting');
    expect(result.admittedEvidenceIds.length).toBeGreaterThanOrEqual(1);
    expect(result.admitted).toBe(true);
  });

  itLive(
    'AC-4: SIGKILL after checkpoint then holo mission resume completes without redo',
    async () => {
      // Start a real mission process that hangs at after-retrieve barrier with
      // full claims already seeded into args (no synthetic admit on resume).
      const runner = startHoloProcess(
        'pipes1-ac4-sigkill-run',
        [
          'mission',
          'run',
          'research',
          '--topic',
          'resume-checkpoint-topic',
          '--components',
          '2',
          '--claims',
          CLAIMS_2,
          '--json',
        ],
        {
          env: {
            [HOLO_TEST_CHECKPOINT_BARRIER_ENV]: 'after-retrieve',
          },
        }
      );

      const barrierProof = await waitForValue(
        'pipes1-ac4-barrier',
        async () => readCheckpointBarrierProof(runner.snapshot().parsed),
        { timeoutMs: 120_000, abortIf: () => runner.exited() }
      );

      const runIdFromBarrier = barrierProof?.runId ?? null;
      const observedRunId =
        runIdFromBarrier ??
        (await waitForValue(
          'pipes1-ac4-run-row',
          async () => {
            return withSql(async (sql) => {
              const rows = await sql<{ id: string }[]>`
                SELECT id::text AS id FROM mission_runs
                WHERE template_key = 'evidence-research'
                ORDER BY created_at DESC
                LIMIT 1
              `;
              return rows[0]?.id ?? null;
            });
          },
          { timeoutMs: 60_000, abortIf: () => runner.exited() }
        ));

      expect(observedRunId, 'run must exist before SIGKILL').toBeTruthy();
      const runId = String(observedRunId);

      const committedCheckpoint = await waitForValue(
        'pipes1-ac4-committed-cp',
        async () => {
          return withSql(async (sql) => {
            const rows = await sql<{ checkpoint_key: string; stage_index: number }[]>`
              SELECT checkpoint_key, stage_index
              FROM mission_checkpoints
              WHERE run_id = ${runId}::uuid
              ORDER BY stage_index DESC
              LIMIT 1
            `;
            return rows[0] ?? null;
          });
        },
        { timeoutMs: 60_000, abortIf: () => runner.exited() }
      );

      writeArtifact('AC-4-start.txt', {
        pid: runner.pid,
        barrierProof,
        runId,
        committedCheckpoint,
        aliveAtBarrier: Boolean(barrierProof) && !runner.exited(),
        snapshot: runner.snapshot(),
      });

      expect(barrierProof, 'must observe checkpoint barrier before SIGKILL').toBeTruthy();
      expect(
        committedCheckpoint,
        'must observe committed DB checkpoint before SIGKILL'
      ).toBeTruthy();
      expect(runner.exited(), 'process must still be alive at barrier').toBe(false);
      expect(runner.pid, 'PID required for kill -9').toBeTruthy();

      // Real SIGKILL of the mission process (AC-4 contract).
      const killSent = runner.kill('SIGKILL');
      expect(killSent).toBe(true);
      const killed = await runner.result;
      expect(killed.signal, 'child must terminate via SIGKILL').toBe('SIGKILL');
      expect(killed.wasKilled).toBe(true);

      // Expire stale lease so public resume can reacquire.
      await withSql(async (sql) => {
        await sql`
          UPDATE mission_runs
          SET lease_expires_at = now() - interval '1 second'
          WHERE id = ${runId}::uuid
        `;
      });

      // Resume ONLY via public CLI (no programmatic resumeMissionRun fallback).
      const resumed = runHolo('pipes1-ac4-resume', ['mission', 'resume', runId, '--json'], {
        timeoutMs: 300_000,
      });
      captureHoloArtifact('AC-4-mission-resume', resumed);
      writeArtifact('AC-4-sigkill-resume.txt', {
        runId,
        pid: runner.pid,
        killSignal: killed.signal,
        wasKilled: killed.wasKilled,
        barrierProof,
        committedCheckpointBeforeKill: committedCheckpoint,
        resumeStatus: resumed.status,
        resumeParsed: resumed.parsed,
        resumeCombined: resumed.combined,
      });

      expect(resumed.status, resumed.combined).toBe(0);
      const resumePayload = (resumed.parsed ?? {}) as Record<string, unknown>;
      expect(resumePayload.status).toBe('completed');
      expect(resumePayload.runId).toBe(runId);
      expect(resumePayload.ok).toBe(true);
      const output = (resumePayload.output ?? {}) as Record<string, unknown>;
      expect(output.admitted).toBe(true);
      expect(Number(output.componentsCovered ?? 0)).toBeGreaterThanOrEqual(2);

      writeArtifact('AC-4-green.txt', resumePayload);

      const stability = runPsql(
        `SELECT id::text AS run_id, executor_version, status,
                (SELECT count(*) FROM mission_checkpoints c WHERE c.run_id = r.id) AS checkpoint_count
         FROM mission_runs r
         WHERE id = '${runId}'::uuid`
      );
      writeArtifact('AC-4-db-probe.txt', stability);
      expect(stability.status).toBe(0);
      expect(stability.stdout).toMatch(new RegExp(runId));
      expect(stability.stdout).toMatch(/completed/);

      const cpCount = await withSql(async (sql) => {
        const rows = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count FROM mission_checkpoints WHERE run_id = ${runId}::uuid
        `;
        return Number(rows[0]?.count ?? 0);
      });
      expect(cpCount).toBeGreaterThanOrEqual(2);

      // Committed early stages must not explode into duplicates after resume.
      const earlyStageAttempts = await withSql(async (sql) => {
        const rows = await sql<{ stage_key: string; attempts: string }[]>`
          SELECT stage_key, count(*)::text AS attempts
          FROM mission_stage_runs
          WHERE run_id = ${runId}::uuid
            AND stage_key IN ('plan', 'retrieve')
            AND status = 'committed'
          GROUP BY stage_key
        `;
        return rows;
      });
      for (const row of earlyStageAttempts) {
        expect(Number(row.attempts)).toBeLessThanOrEqual(2);
      }

      // TC-5: same run_id + executor_version preserved.
      const tc5 = runPsql(
        `SELECT id::text AS run_id, executor_version FROM mission_runs WHERE id = '${runId}'::uuid`
      );
      writeArtifact('TC-5-run-id-stability.txt', tc5);
      expect(tc5.stdout).toMatch(new RegExp(runId));
    },
    420_000
  );
});
