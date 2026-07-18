/** Sprint 17 Mission Engine integration: thin evidence suspends, full evidence resumes. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql, type Sql } from '../../src/db/client';
import { registerMissionTemplateFile } from '../../src/mission/repository';
import { resumeMissionRun, runMissionTemplate } from '../../src/mission/runtime';

const itLive = PLATFORM_IT ? it : it.skip;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const TEMPLATE = 'services/platform/tests/fixtures/mission-engine/template-research.json';
const THIN = 'services/platform/tests/fixtures/research/thin.json';
const FULL = 'services/platform/tests/fixtures/research/claims.json';

describe('Sprint 17 research mission template', () => {
  let sql: Sql | undefined;
  let runId = '';

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    sql = createSql(DATABASE_URL);
    await registerMissionTemplateFile(TEMPLATE);
  });

  afterAll(async () => {
    if (!sql) return;
    if (runId) {
      await sql`DELETE FROM mission_events WHERE run_id = ${runId}`;
      await sql`DELETE FROM mission_commits WHERE run_id = ${runId}`;
      await sql`DELETE FROM mission_checkpoints WHERE run_id = ${runId}`;
      await sql`DELETE FROM mission_stage_runs WHERE run_id = ${runId}`;
      await sql`DELETE FROM mission_runs WHERE id = ${runId}::uuid`;
    }
    await sql.end({ timeout: 5 });
  });

  itLive(
    'suspends at the deterministic gate, then resumes and commits after full evidence',
    async () => {
      runId = randomUUID();
      const previous = process.env.HOLO_RESEARCH_EVIDENCE_FIXTURE;
      process.env.HOLO_RESEARCH_EVIDENCE_FIXTURE = THIN;
      try {
        const suspended = await runMissionTemplate(
          {
            templateKey: 'research',
            goal: 'Sprint 17 generic thin gate',
            idempotencyKey: `s17-template-${runId}`,
          },
          { databaseUrl: DATABASE_URL }
        );
        expect(suspended.status).toBe('suspended');
        expect(suspended.checkpointStageIndex).toBe(2);
        if (!suspended.runId) throw new Error('Sprint 17 suspended run missing id');
        runId = suspended.runId;

        process.env.HOLO_RESEARCH_EVIDENCE_FIXTURE = FULL;
        const completed = await resumeMissionRun(runId, { databaseUrl: DATABASE_URL });
        expect(completed.status).toBe('completed');
        expect(completed.checkpointStageIndex).toBe(4);
        expect(completed.output).toMatchObject({ admitted: true });

        if (!sql) throw new Error('Sprint 17 SQL client missing');
        const stages = await sql`
        SELECT stage_key, status, attempt FROM mission_stage_runs WHERE run_id = ${runId}::uuid ORDER BY stage_index, attempt
      `;
        expect(stages.map((row) => `${row.stage_key}:${row.status}:${row.attempt}`)).toContain(
          'gate:pending:0'
        );
        expect(stages.map((row) => `${row.stage_key}:${row.status}:${row.attempt}`)).toContain(
          'gate:committed:1'
        );
        const events =
          await sql`        SELECT event_type FROM mission_events WHERE run_id = ${runId}::uuid ORDER BY event_index
      `;
        expect(events.map((row) => row.event_type)).toEqual(['research_gate_pending', 'completed']);
      } finally {
        if (previous === undefined) delete process.env.HOLO_RESEARCH_EVIDENCE_FIXTURE;
        else process.env.HOLO_RESEARCH_EVIDENCE_FIXTURE = previous;
      }
    },
    180_000
  );
});
