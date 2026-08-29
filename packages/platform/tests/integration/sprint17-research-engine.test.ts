/** Sprint 17 real research gate: Postgres + fleet, no mocked inference. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql, type Sql } from '../../src/db/client';
import { runResearchMission } from '../../src/observability/mission-research';
import { inspectResearchSession } from '../../src/research/inspection';

const itLive = PLATFORM_IT ? it : it.skip;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const THIN = 'packages/platform/tests/fixtures/research/thin.json';
const FULL = 'packages/platform/tests/fixtures/research/claims.json';

describe('Sprint 17 deterministic research engine seam', () => {
  let sql: Sql | undefined;
  const runIds: string[] = [];

  beforeAll(() => {
    if (PLATFORM_IT) sql = createSql(DATABASE_URL);
  });

  afterAll(async () => {
    if (!sql) return;
    for (const runId of runIds) {
      await sql`DELETE FROM research_sessions WHERE id = ${runId}::uuid`;
      await sql`DELETE FROM inference_telemetry WHERE run_id = ${runId}`;
    }
    await sql.end({ timeout: 5 });
  });

  itLive(
    'keeps thin evidence running and records real ASSAY/CHALLENGE fleet instances',
    async () => {
      const runId = randomUUID();
      runIds.push(runId);
      const result = await runResearchMission({
        goal: 'Sprint 17 thin-evidence real gate',
        runId,
        role: 'divergent',
        evidenceFixturePath: THIN,
        throwOnExportFailure: false,
        langfuseBaseUrl: 'http://127.0.0.1:9',
      });
      expect(result.evidenceGate?.admitted).toBe(false);
      const inspection = await inspectResearchSession(runId, {
        databaseUrl: DATABASE_URL,
        processes: true,
      });
      expect(inspection.status).toBe('running');
      expect(inspection.assayChallengeDistinct).toBe(true);
      expect(inspection.processes).toEqual([
        'PLAN',
        'RETRIEVE',
        'EXTRACT',
        'ASSAY',
        'CHALLENGE',
        'GATE',
        'COMMIT',
      ]);
      if (!sql) throw new Error('Sprint 17 SQL client missing');
      const telemetry = await sql`
      SELECT step_id, role, provider FROM inference_telemetry WHERE run_id = ${runId} ORDER BY created_at
    `;
      expect(telemetry.map((row) => `${row.step_id}:${row.role}:${row.provider}`)).toEqual([
        'research-mission-generate:divergent:fleet',
        'research-challenge:convergent:fleet',
      ]);
    },
    120_000
  );

  itLive(
    'terminates only after the full deterministic gate admits evidence',
    async () => {
      const runId = randomUUID();
      runIds.push(runId);
      const result = await runResearchMission({
        goal: 'Sprint 17 full-evidence real gate',
        runId,
        role: 'divergent',
        evidenceFixturePath: FULL,
        throwOnExportFailure: false,
        langfuseBaseUrl: 'http://127.0.0.1:9',
      });
      expect(result.evidenceGate?.admitted).toBe(true);
      const inspection = await inspectResearchSession(runId, { databaseUrl: DATABASE_URL });
      expect(inspection.status).toBe('completed');
      expect(inspection.assayChallengeDistinct).toBe(true);
    },
    120_000
  );
});
