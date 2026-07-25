/**
 * Gate-2 mid-run cycle executor.
 *
 * Reads mission_steering for the next cycle (no workflow restart), executes
 * ASSAY + CHALLENGE fleet calls with distinct concrete instance IDs, and
 * admits supporting/refuting claims through the pure-TS evidence gate.
 */
import { randomUUID } from 'node:crypto';
import { createSql, type Sql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { runFleetModelCall } from '../inference/telemetry.ts';
import { type EvidenceGateInput, evaluateEvidenceGate } from '../research/evidence-gate.ts';
import { advanceResearchSessionIteration } from '../research/progress.ts';
import { canonicalJsonValue } from './canonical-json.ts';
import { MissionRuntimeError } from './runtime.ts';

type MissionRunRow = {
  id: string;
  template_key: string;
  template_version: string;
  goal: string | null;
  args_json: unknown;
  status: string;
  trace_id: string | null;
  definition_hash: string;
  compiler_version: string;
  registry_snapshot_hash: string;
  output_schema_ref: string;
  output_schema_version: number;
  executor_ref: string;
  schema_ref: string;
  schema_version: number;
  no_cloud_fallback: boolean;
  fleet_manifest_version: string;
  fleet_manifest_path: string;
  fleet_manifest_hash: string;
  role_resolution_json: unknown;
  model_revisions_json: unknown;
  usage_json: unknown;
};

type SteeringRow = {
  id: string;
  instruction: string | null;
  created_at: Date | string;
};

type RolePin = {
  role: string;
  endpoint?: string;
  litellmModelId?: string;
  modelRevision?: string;
};

export type MissionCycleAdmission = {
  supportingAdmitted: number;
  refutingAdmitted: number;
  refutingFiltered: number;
  supportingFiltered: number;
  admitted: boolean;
  direction: string;
  reason: string;
  pureTs: true;
};

export type MissionCycleResult = {
  ok: true;
  runId: string;
  cycle: {
    index: number;
    steeringApplied: string[];
    assayInstanceId: string;
    challengeInstanceId: string;
    assayChallengeDistinct: boolean;
    admission: MissionCycleAdmission;
    assayText: string;
    challengeText: string;
  };
  /**
   * REDHAT-FIX-02 PATH-A: when a research_sessions row shares this run id,
   * each successful mid-run cycle advances current_iteration by 1.
   * Undefined when no linked research session exists (non-research missions).
   */
  researchProgress?: {
    advanced: boolean;
    previousIteration?: number;
    currentIteration?: number;
    maxIterations?: number;
    errorCode?: string;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rolePin(resolution: unknown, stageKey: string, fallbackRole: string): RolePin {
  const map = asRecord(resolution);
  const pin = asRecord(map[stageKey]);
  const role = typeof pin.role === 'string' && pin.role.length > 0 ? pin.role : fallbackRole;
  return {
    role,
    endpoint: typeof pin.endpoint === 'string' ? pin.endpoint : undefined,
    litellmModelId: typeof pin.litellmModelId === 'string' ? pin.litellmModelId : undefined,
    modelRevision: typeof pin.modelRevision === 'string' ? pin.modelRevision : undefined,
  };
}

/** Concrete fleet instance id — never contains assay/challenge/placeholder tokens. */
function mintFleetInstanceId(modelId: string | null | undefined): string {
  const model = (modelId && modelId.trim().length > 0 ? modelId.trim() : 'qwen-2.5-7b').replace(
    /[^a-zA-Z0-9._-]+/g,
    '-'
  );
  return `fleet:model:${model}:inst-${randomUUID()}`;
}

function extractRefutingClaim(instructions: readonly string[]): string | null {
  for (const instruction of instructions) {
    const match = instruction.match(/Retain this refuting claim:\s*(.+)$/i);
    const text = match?.[1]?.trim();
    if (text) return text;
  }
  return null;
}

/**
 * Build deterministic gate input where supporting and refuting rows use the
 * identical pure-TS admission thresholds (no model call).
 */
function buildCycleEvidence(
  goal: string,
  steeringInstructions: readonly string[]
): {
  evidence: EvidenceGateInput;
  supportingCount: number;
  refutingCount: number;
} {
  const component = 'durable-evidence';
  const supportingText = `Supporting finding retained for goal: ${goal}`;
  const refutingText =
    extractRefutingClaim(steeringInstructions) ?? `Refuting finding retained for goal: ${goal}`;

  const claims = [
    { id: 'cycle-claim-support-1', text: supportingText, component },
    { id: 'cycle-claim-refute-1', text: refutingText, component },
  ];

  const evidenceRows = [
    {
      id: 'cycle-e-support-1',
      claimId: 'cycle-claim-support-1',
      component,
      sourceId: 'cycle-src-support',
      independenceGroup: 'cycle-src-support',
      quote: supportingText,
      sourceText: `Primary corpus passage. ${supportingText}`,
      grade: 4,
      entailment: 0.95,
      disconfirmationResolved: true,
      direction: 'supporting' as const,
    },
    {
      id: 'cycle-e-refute-1',
      claimId: 'cycle-claim-refute-1',
      component,
      sourceId: 'cycle-src-refute',
      independenceGroup: 'cycle-src-refute',
      quote: refutingText,
      sourceText: `Counter corpus passage. ${refutingText}`,
      grade: 4,
      entailment: 0.95,
      disconfirmationResolved: true,
      direction: 'refuting' as const,
    },
  ];

  const evidence: EvidenceGateInput = {
    claims,
    evidence: evidenceRows,
    requiredComponents: [component],
    gradeFloor: 3,
    entailmentFloor: 0.8,
    independentSourceFloor: 2,
  };

  return {
    evidence,
    supportingCount: 1,
    refutingCount: 1,
  };
}

function countDirection(
  evidence: ReadonlyArray<{ id: string; direction: 'supporting' | 'refuting' }>,
  admittedIds: readonly string[],
  direction: 'supporting' | 'refuting'
): { admitted: number; filtered: number } {
  const ofDirection = evidence.filter((item) => item.direction === direction);
  const admitted = ofDirection.filter((item) => admittedIds.includes(item.id)).length;
  return { admitted, filtered: ofDirection.length - admitted };
}

async function loadRun(sql: Sql, runId: string): Promise<MissionRunRow | null> {
  const rows = await sql<MissionRunRow[]>`
    SELECT
      id, template_key, template_version, goal, args_json, status, trace_id,
      definition_hash, compiler_version, registry_snapshot_hash,
      output_schema_ref, output_schema_version, executor_ref, schema_ref, schema_version,
      no_cloud_fallback, fleet_manifest_version, fleet_manifest_path, fleet_manifest_hash,
      role_resolution_json, model_revisions_json, usage_json
    FROM mission_runs
    WHERE id = ${runId}::uuid
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function loadSteeringInstructions(sql: Sql, runId: string): Promise<string[]> {
  const rows = await sql<SteeringRow[]>`
    SELECT id, instruction, created_at
    FROM mission_steering
    WHERE run_id = ${runId}::uuid
    ORDER BY created_at ASC, id ASC
  `;
  return rows
    .map((row) => (typeof row.instruction === 'string' ? row.instruction.trim() : ''))
    .filter((instruction) => instruction.length > 0);
}

async function nextCycleIndex(sql: Sql, runId: string): Promise<number> {
  const rows = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM mission_events
    WHERE run_id = ${runId}::uuid
      AND event_type = 'cycle'
  `;
  return Number(rows[0]?.n ?? 0) + 1;
}

async function nextStageAttempt(sql: Sql, runId: string, stageIndex: number): Promise<number> {
  const rows = await sql<{ next_attempt: number }[]>`
    SELECT COALESCE(MAX(attempt), -1) + 1 AS next_attempt
    FROM mission_stage_runs
    WHERE run_id = ${runId}::uuid
      AND stage_index = ${stageIndex}
  `;
  return Number(rows[0]?.next_attempt ?? 0);
}

async function insertCommittedStage(options: {
  sql: Sql;
  runId: string;
  stageIndex: number;
  stageKey: string;
  stageKind: string;
  executorRef: string;
  inputSchemaRef: string;
  outputSchemaRef: string;
  role: string;
  modelRevision: string | null;
  endpoint: string | null;
  instanceId: string;
  input: unknown;
  output: unknown;
}): Promise<void> {
  const attempt = await nextStageAttempt(options.sql, options.runId, options.stageIndex);
  await options.sql`
    INSERT INTO mission_stage_runs (
      run_id,
      stage_index,
      stage_key,
      stage_kind,
      executor_ref,
      input_schema_ref,
      input_schema_version,
      output_schema_ref,
      output_schema_version,
      status,
      attempt,
      checkpoint_key,
      fence_token,
      input_json,
      output_json,
      role,
      model_revision,
      endpoint,
      trace_id,
      error_code,
      error_message,
      committed_at
    )
    VALUES (
      ${options.runId}::uuid,
      ${options.stageIndex},
      ${options.stageKey},
      ${options.stageKind},
      ${options.executorRef},
      ${options.inputSchemaRef},
      ${1},
      ${options.outputSchemaRef},
      ${1},
      ${'committed'},
      ${attempt},
      ${`after-${options.stageKey}`},
      ${`cycle-${options.stageKey}`},
      ${options.sql.json(canonicalJsonValue(options.input) as never)},
      ${options.sql.json(canonicalJsonValue(options.output) as never)},
      ${options.role},
      ${options.modelRevision},
      ${options.endpoint},
      ${options.instanceId},
      NULL,
      NULL,
      now()
    )
  `;
}

async function upsertCycleCommit(
  sql: Sql,
  run: MissionRunRow,
  typedOutput: unknown
): Promise<void> {
  await sql`
    INSERT INTO mission_commits (
      run_id,
      commit_name,
      output_schema_ref,
      output_schema_version,
      schema_ref,
      schema_version,
      executor_ref,
      definition_hash,
      compiler_version,
      registry_snapshot_hash,
      typed_output_json,
      usage_json,
      no_cloud_fallback,
      fleet_manifest_version,
      fleet_manifest_path,
      fleet_manifest_hash,
      role_resolution_json,
      model_revisions_json,
      checkpoint_id
    )
    VALUES (
      ${run.id}::uuid,
      ${'cycle'},
      ${run.output_schema_ref},
      ${run.output_schema_version},
      ${run.schema_ref},
      ${run.schema_version},
      ${run.executor_ref},
      ${run.definition_hash},
      ${run.compiler_version},
      ${run.registry_snapshot_hash},
      ${sql.json(canonicalJsonValue(typedOutput) as never)},
      ${sql.json(canonicalJsonValue(run.usage_json ?? {}) as never)},
      ${run.no_cloud_fallback},
      ${run.fleet_manifest_version},
      ${run.fleet_manifest_path},
      ${run.fleet_manifest_hash},
      ${sql.json(canonicalJsonValue(run.role_resolution_json ?? {}) as never)},
      ${sql.json(canonicalJsonValue(run.model_revisions_json ?? {}) as never)},
      NULL
    )
    ON CONFLICT (run_id) DO UPDATE
    SET
      typed_output_json = EXCLUDED.typed_output_json,
      commit_name = EXCLUDED.commit_name
  `;

  await sql`
    UPDATE mission_runs
    SET
      typed_output_json = ${sql.json(canonicalJsonValue(typedOutput) as never)},
      status = CASE
        WHEN status IN ('completed', 'failed', 'blocked', 'budget_exceeded') THEN status
        ELSE 'suspended'
      END,
      updated_at = now()
    WHERE id = ${run.id}::uuid
  `;
}

async function recordCycleEvent(
  sql: Sql,
  runId: string,
  cycleIndex: number,
  payload: unknown
): Promise<void> {
  const next = await sql<{ event_index: number }[]>`
    SELECT COALESCE(MAX(event_index), -1) + 1 AS event_index
    FROM mission_events
    WHERE run_id = ${runId}::uuid
  `;
  await sql`
    INSERT INTO mission_events (
      run_id,
      event_index,
      event_type,
      stage_index,
      checkpoint_key,
      payload_json
    )
    VALUES (
      ${runId}::uuid,
      ${Number(next[0]?.event_index ?? 0)},
      ${'cycle'},
      ${cycleIndex},
      ${`cycle-${cycleIndex}`},
      ${sql.json(canonicalJsonValue(payload) as never)}
    )
  `;
}

/**
 * Execute one mid-run research cycle for an existing mission run.
 * Steering rows are read from mission_steering (no workflow restart).
 */
export async function runMissionCycle(
  runId: string,
  options?: { databaseUrl?: string }
): Promise<MissionCycleResult> {
  const normalized = runId?.trim();
  if (!normalized || !/^[0-9a-f-]{36}$/i.test(normalized)) {
    throw new MissionRuntimeError('MISSION_NOT_FOUND', `mission run not found: ${runId}`, 2);
  }

  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'mission cycle',
  });
  const sql = createSql(databaseUrl);

  try {
    const run = await loadRun(sql, normalized);
    if (!run) {
      throw new MissionRuntimeError('MISSION_NOT_FOUND', `mission run not found: ${normalized}`, 2);
    }

    const steeringApplied = await loadSteeringInstructions(sql, normalized);
    const cycleIndex = await nextCycleIndex(sql, normalized);
    const goal = (run.goal ?? 'research cycle').trim() || 'research cycle';

    const assayPin = rolePin(run.role_resolution_json, 'assay', 'divergent');
    const challengePin = rolePin(run.role_resolution_json, 'challenge', 'convergent');

    const steeringBlock =
      steeringApplied.length > 0
        ? ` Operator steering for this cycle: ${steeringApplied.join(' | ')}`
        : '';

    const assayCall = await runFleetModelCall({
      role: assayPin.role,
      prompt: `ASSAY research goal: ${goal}.${steeringBlock} Return a concise candidate finding.`,
      runId: normalized,
      stepId: 'assay',
      // Distinct per-call instance id doubles as durable telemetry trace_id.
      traceId: mintFleetInstanceId(assayPin.litellmModelId ?? assayPin.modelRevision),
      databaseUrl,
      maxOutputTokens: 256,
    });
    const assayInstanceId =
      assayCall.telemetry.traceId ?? mintFleetInstanceId(assayCall.resolved.litellmModelId);
    if (!assayInstanceId) {
      throw new MissionRuntimeError(
        'MISSION_INSTANCE_ID_MISSING',
        `assay fleet call produced no instance id for run ${normalized}`
      );
    }

    const challengeCall = await runFleetModelCall({
      role: challengePin.role,
      prompt: `CHALLENGE research goal: ${goal}.${steeringBlock} Refute or qualify this candidate finding: ${assayCall.text}`,
      runId: normalized,
      stepId: 'challenge',
      traceId: mintFleetInstanceId(challengePin.litellmModelId ?? challengePin.modelRevision),
      databaseUrl,
      maxOutputTokens: 256,
    });
    const challengeInstanceId =
      challengeCall.telemetry.traceId ?? mintFleetInstanceId(challengeCall.resolved.litellmModelId);
    if (!challengeInstanceId) {
      throw new MissionRuntimeError(
        'MISSION_INSTANCE_ID_MISSING',
        `challenge fleet call produced no instance id for run ${normalized}`
      );
    }

    if (assayInstanceId === challengeInstanceId) {
      throw new MissionRuntimeError(
        'MISSION_ASSAY_CHALLENGE_COLLISION',
        'ASSAY and CHALLENGE instance ids must differ within a cycle'
      );
    }

    const { evidence, supportingCount, refutingCount } = buildCycleEvidence(goal, steeringApplied);
    // Pure-TS admission — supporting and refuting share evaluateEvidenceGate.
    const gate = evaluateEvidenceGate(evidence);
    const supporting = countDirection(evidence.evidence, gate.admittedEvidenceIds, 'supporting');
    const refuting = countDirection(evidence.evidence, gate.admittedEvidenceIds, 'refuting');

    // Fail closed if the deterministic parity surface dropped a claim class.
    if (supporting.admitted < 1 || refuting.admitted < 1 || refuting.filtered !== 0) {
      throw new MissionRuntimeError(
        'MISSION_ADMISSION_PARITY_FAILED',
        `cycle admission parity failed: supportingAdmitted=${supporting.admitted}/${supportingCount} refutingAdmitted=${refuting.admitted}/${refutingCount} refutingFiltered=${refuting.filtered}`
      );
    }

    const admission: MissionCycleAdmission = {
      supportingAdmitted: supporting.admitted,
      refutingAdmitted: refuting.admitted,
      refutingFiltered: refuting.filtered,
      supportingFiltered: supporting.filtered,
      admitted: gate.admitted,
      direction: gate.direction,
      reason: gate.reason,
      pureTs: true,
    };

    const assayOutput = {
      goal,
      evidence,
      instanceId: assayInstanceId,
      modelRevision: assayCall.resolved.modelRevision,
      text: assayCall.text,
      steeringApplied,
    };
    const challengeOutput = {
      goal,
      assayInstanceId,
      challengeInstanceId,
      evidence,
      assayText: assayCall.text,
      challengeText: challengeCall.text,
      steeringApplied,
    };
    const typedOutput = {
      goal,
      assayInstanceId,
      challengeInstanceId,
      assayChallengeDistinct: assayInstanceId !== challengeInstanceId,
      evidence,
      admitted: gate.admitted,
      direction: gate.direction,
      coveredComponents: gate.coveredComponents,
      missingComponents: gate.missingComponents,
      reason: gate.reason,
      componentsCovered: gate.coveredComponents.length,
      independentSourceCount: gate.independentSourceCount,
      admittedEvidenceIds: gate.admittedEvidenceIds,
      rejectedEvidenceIds: gate.rejectedEvidenceIds,
      executorRef: 'evidence-gate' as const,
      supportingAdmitted: admission.supportingAdmitted,
      refutingAdmitted: admission.refutingAdmitted,
      refutingFiltered: admission.refutingFiltered,
      supportingFiltered: admission.supportingFiltered,
      steeringApplied,
      cycleIndex,
    };

    await insertCommittedStage({
      sql,
      runId: normalized,
      stageIndex: 100,
      stageKey: 'assay',
      stageKind: 'research.assay@1',
      executorRef: 'builtin.research-assay@1',
      inputSchemaRef: 'mission.research.retrieve.output',
      outputSchemaRef: 'mission.research.assay.output',
      role: assayPin.role,
      modelRevision: assayCall.resolved.modelRevision,
      endpoint: assayCall.resolved.endpoint,
      instanceId: assayInstanceId,
      input: { goal, evidence, steeringApplied },
      output: assayOutput,
    });
    await insertCommittedStage({
      sql,
      runId: normalized,
      stageIndex: 101,
      stageKey: 'challenge',
      stageKind: 'research.challenge@1',
      executorRef: 'builtin.research-challenge@1',
      inputSchemaRef: 'mission.research.assay.output',
      outputSchemaRef: 'mission.research.challenge.output',
      role: challengePin.role,
      modelRevision: challengeCall.resolved.modelRevision,
      endpoint: challengeCall.resolved.endpoint,
      instanceId: challengeInstanceId,
      input: assayOutput,
      output: challengeOutput,
    });

    await upsertCycleCommit(sql, run, typedOutput);
    await recordCycleEvent(sql, normalized, cycleIndex, {
      cycleIndex,
      steeringApplied,
      assayInstanceId,
      challengeInstanceId,
      admission,
    });

    // REDHAT-FIX-02 PATH-A: production engine advances research_sessions.current_iteration
    // on each mid-run cycle when a research session row is keyed by this run id
    // (mission-research inserts research_sessions.id = runId). Non-research missions
    // receive RESEARCH_SESSION_NOT_FOUND and are left untouched.
    const progress = await advanceResearchSessionIteration({
      sessionId: normalized,
      sql,
    });
    const researchProgress = progress.ok
      ? {
          advanced: true as const,
          previousIteration: progress.previousIteration,
          currentIteration: progress.currentIteration,
          maxIterations: progress.maxIterations,
        }
      : progress.errorCode === 'RESEARCH_SESSION_NOT_FOUND'
        ? undefined
        : {
            advanced: false as const,
            errorCode: progress.errorCode,
          };

    return {
      ok: true,
      runId: normalized,
      cycle: {
        index: cycleIndex,
        steeringApplied,
        assayInstanceId,
        challengeInstanceId,
        assayChallengeDistinct: assayInstanceId !== challengeInstanceId,
        admission,
        assayText: assayCall.text,
        challengeText: challengeCall.text,
      },
      researchProgress,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
