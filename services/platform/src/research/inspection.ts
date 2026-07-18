import { createSql } from '../db/client';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection';

export type ResearchInspection = {
  ok: boolean;
  sessionId: string;
  traceId?: string | null;
  status?: string;
  assayInstanceId?: string | null;
  challengeInstanceId?: string | null;
  assayChallengeDistinct?: boolean;
  gate?: unknown;
  plan?: unknown;
  findings?: unknown;
  processProof?: unknown;
  error?: string;
  errorCode?: string;
};

type MissionStageTraceRow = {
  stage_run_id: string;
  stage_index: number;
  stage_key: string;
  status: string;
  attempt: number;
  role: string | null;
  model_revision: string | null;
  endpoint: string | null;
  trace_id: string | null;
  provider: string | null;
  model_id: string | null;
  telemetry_step_id: string | null;
  output_json: unknown;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stageInstance(rows: MissionStageTraceRow[], key: string, field: string): string | null {
  const row = rows.find(
    (candidate) => candidate.stage_key === key && candidate.status === 'committed'
  );
  const value = objectValue(row?.output_json)[field];
  return typeof value === 'string' ? value : null;
}

function stageProcesses(rows: MissionStageTraceRow[]): unknown[] {
  return rows.map((row) => ({
    stageIndex: row.stage_index,
    stageKey: row.stage_key,
    status: row.status,
    attempt: row.attempt,
    kind: row.provider === 'fleet' ? 'fleet-model-call' : 'deterministic-stage',
    role: row.role,
    modelRevision: row.model_revision,
    endpoint: row.endpoint,
    provider: row.provider,
    modelId: row.model_id,
    telemetryStepId: row.telemetry_step_id,
    traceId: row.trace_id,
  }));
}

async function inspectMissionRun(
  sql: ReturnType<typeof createSql>,
  sessionId: string,
  includeProcesses: boolean
): Promise<(ResearchInspection & { processes?: unknown[] }) | null> {
  const runs = await sql<
    {
      id: string;
      trace_id: string | null;
      status: string;
      template_key: string;
      compiled_plan_json: unknown;
      args_json: unknown;
      typed_output_json: unknown;
      role_resolution_json: unknown;
      model_revisions_json: unknown;
    }[]
  >`
    SELECT id, trace_id, status, template_key, compiled_plan_json, args_json, typed_output_json,
           role_resolution_json, model_revisions_json
    FROM mission_runs
    WHERE id = ${sessionId}::uuid AND template_key = 'research'
    LIMIT 1
  `;
  const run = runs[0];
  if (!run) return null;

  const stages = await sql<MissionStageTraceRow[]>`
    SELECT s.id::text AS stage_run_id, s.stage_index, s.stage_key, s.status, s.attempt,
           s.role, s.model_revision, s.endpoint, s.trace_id, s.output_json,
           t.provider, t.model_id, t.step_id AS telemetry_step_id
    FROM mission_stage_runs s
    LEFT JOIN LATERAL (
      SELECT provider, model_id, step_id
      FROM inference_telemetry
      WHERE run_id = ${sessionId}
        AND step_id = s.id::text
      ORDER BY created_at DESC
      LIMIT 1
    ) t ON true
    WHERE s.run_id = ${sessionId}::uuid
    ORDER BY s.stage_index, s.attempt
  `;
  const output = objectValue(run.typed_output_json);
  const eventRows = await sql<{ event_type: string; payload_json: unknown }[]>`
    SELECT event_type, payload_json
    FROM mission_events
    WHERE run_id = ${sessionId}::uuid
      AND event_type IN ('research_gate_pending', 'research_process_proof')
    ORDER BY event_index DESC
  `;
  const pendingEvent = eventRows.find((event) => event.event_type === 'research_gate_pending');
  const processProof = eventRows.find((event) => event.event_type === 'research_process_proof');
  const gate =
    output.admitted !== undefined ? output : objectValue(pendingEvent?.payload_json).gate;
  const assayInstanceId = stageInstance(stages, 'assay', 'instanceId');
  const challengeInstanceId = stageInstance(stages, 'challenge', 'challengeInstanceId');
  const result: ResearchInspection & { processes?: unknown[] } = {
    ok: true,
    sessionId,
    traceId: run.trace_id,
    status: run.status,
    assayInstanceId,
    challengeInstanceId,
    assayChallengeDistinct:
      assayInstanceId !== null &&
      challengeInstanceId !== null &&
      assayInstanceId !== challengeInstanceId,
    gate,
    plan: {
      compiledStages: run.compiled_plan_json,
      roleResolution: run.role_resolution_json,
      modelRevisions: run.model_revisions_json,
      args: run.args_json,
    },
    findings: objectValue(run.args_json).researchEvidence ?? null,
    processProof: processProof?.payload_json ?? null,
  };
  if (includeProcesses) result.processes = stageProcesses(stages);
  return result;
}

export async function inspectResearchSession(
  sessionId: string,
  options?: { databaseUrl?: string; processes?: boolean }
): Promise<ResearchInspection & { processes?: unknown[] }> {
  const sql = createSql(
    resolveHolocronNonprodDatabaseUrl({
      databaseUrl: options?.databaseUrl,
      context: 'research inspection',
    })
  );
  try {
    const mission = await inspectMissionRun(sql, sessionId, options?.processes ?? false);
    if (mission) return mission;

    // Compatibility for legacy observability sessions created before the
    // durable research mission template existed.
    const rows = await sql<
      {
        id: string;
        status: string;
        plan: unknown;
        findings: unknown;
        final_confidence_summary: unknown;
      }[]
    >`
      SELECT id, status, plan, findings, final_confidence_summary
      FROM research_sessions
      WHERE id = ${sessionId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
      return {
        ok: false,
        sessionId,
        errorCode: 'RESEARCH_NOT_FOUND',
        error: `research session not found: ${sessionId}`,
      };
    }
    const plan = objectValue(row.plan);
    const assayInstanceId = typeof plan.assayInstanceId === 'string' ? plan.assayInstanceId : null;
    const challengeInstanceId =
      typeof plan.challengeInstanceId === 'string' ? plan.challengeInstanceId : null;
    return {
      ok: true,
      sessionId,
      status: row.status,
      assayInstanceId,
      challengeInstanceId,
      assayChallengeDistinct:
        assayInstanceId !== null &&
        challengeInstanceId !== null &&
        assayInstanceId !== challengeInstanceId,
      gate: row.final_confidence_summary,
      plan: row.plan,
      findings: row.findings,
      ...(options?.processes ? { processes: Array.isArray(plan.phases) ? plan.phases : [] } : {}),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
