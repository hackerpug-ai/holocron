import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createSql, type Sql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { MissionCreateArgsSchema } from '../mission/args.ts';
import { canonicalJsonString, canonicalJsonValue, sha256Hex } from '../mission/canonical-json.ts';
import {
  getMissionRunStatus,
  type MissionRunAccessScope,
  type MissionRunOwnerScope,
  MissionRuntimeError,
  type MissionStatusPayload,
  resumeMissionRun,
  runMissionTemplate,
} from '../mission/runtime.ts';
import { enqueue } from '../queue/priority.ts';
import type { Scope } from './middleware/scoped-key.ts';

/**
 * When true, POST /api/missions runs the mission inline on the request thread
 * (legacy behaviour). Default is off-HTTP: admit + background queue_jobs row.
 */
function missionInlineOnRequest(): boolean {
  return process.env.HOLO_MISSION_INLINE === '1';
}

const MissionCreateBodySchema = z
  .object({
    templateKey: z.string().min(1),
    goal: z.string().min(1),
    idempotencyKey: z.string().min(1),
    args: MissionCreateArgsSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const argsGoal = value.args?.goal;
    if (typeof argsGoal === 'string' && argsGoal.trim().length > 0 && argsGoal !== value.goal) {
      ctx.addIssue({
        code: 'custom',
        path: ['args', 'goal'],
        message: 'args.goal must match goal when provided',
      });
    }
  });

const MissionRunIdSchema = z.string().uuid();
const MissionVerdictEnum = z.enum(['kill', 'advance', 'redirect', 'boost']);
const HUMAN_GATE_TEST_CRASH_ENV = 'HOLO_TEST_MISSION_VERDICT_CRASH_AT';
const HUMAN_GATE_TEST_CRASH_BOUNDARY = 'after_violation_before_rollback';

const MissionSteerBodySchema = z
  .object({
    actor: z.string().min(1).optional(),
    requestKey: z.string().min(1).optional(),
    instruction: z.string().min(1).optional(),
    note: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.instruction && !value.note) {
      ctx.addIssue({
        code: 'custom',
        path: ['instruction'],
        message: 'instruction or note is required',
      });
    }
  });

const MissionVerdictBodySchema = z
  .object({
    actor: z.string().min(1).optional(),
    requestKey: z.string().min(1).optional(),
    verdict: MissionVerdictEnum,
    rationale: z.string().min(1).optional(),
    citation: z.string().uuid().optional(),
    targetStatus: z.literal('validated').optional(),
  })
  .strict();

type MissionControlEventRow = {
  id: string;
  run_id: string;
  event_index: number;
  event_type: string;
  stage_index: number | null;
  checkpoint_key: string | null;
  payload_json: unknown;
  created_at: Date | string;
};

type MissionSteeringRow = {
  id: string;
  run_id: string;
  actor: string | null;
  request_key: string | null;
  instruction: string | null;
  payload_json: unknown;
  created_at: Date | string;
};

type MissionVerdictRow = {
  id: string;
  run_id: string;
  actor: string | null;
  request_key: string | null;
  verdict: string;
  rationale: string | null;
  payload_json: unknown;
  created_at: Date | string;
};

type MissionVerdictRejectionRow = {
  id: string;
  run_id: string;
  request_key: string;
  payload_json: unknown;
  error_code: string;
  error_message: string;
};

type MissionAuthorizedRunRow = {
  id: string;
  owner_scope: string | null;
};

type MissionEventIndexRow = {
  event_index: number;
};

type HttpMissionErrorBody = {
  ok: false;
  error: string;
  code: string;
  errorCode: string;
};

type HttpMissionError = {
  status: number;
  body: HttpMissionErrorBody;
};

export type MissionSteeringMutationResult = {
  replay: boolean;
  run: MissionStatusPayload;
  steering: ReturnType<typeof mapMissionSteeringRow>;
  event: ReturnType<typeof mapMissionEventRow>;
};

export type MissionVerdictMutationResult = {
  replay: boolean;
  run: MissionStatusPayload;
  verdict: ReturnType<typeof mapMissionVerdictRow>;
  event: ReturnType<typeof mapMissionEventRow>;
};

type MissionControlSql = Sql | import('postgres').TransactionSql;

function missionHttpError(status: number, code: string, error: string): HttpMissionError {
  return {
    status,
    body: {
      ok: false,
      error,
      code,
      errorCode: code,
    },
  };
}

function validationIssueMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

function missionControlAccessScope(scope: Scope | undefined): MissionRunAccessScope {
  return scope === 'control' ? 'control' : 'rn';
}

function missionCreateOwnerScope(): MissionRunOwnerScope {
  return 'rn';
}

function controlRequestKey(kind: 'steer' | 'verdict', payload: unknown): string {
  return `${kind}:${sha256Hex(payload)}`;
}

function sameCanonicalPayload(left: unknown, right: unknown): boolean {
  return canonicalJsonString(left) === canonicalJsonString(right);
}

function missionConflict(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function missionNotFound(runId: string): Error {
  return Object.assign(new Error(`mission run not found: ${runId}`), {
    code: 'MISSION_NOT_FOUND',
  });
}

function missionRuleViolationCode(error: unknown): string | null {
  const code =
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : null;
  if (
    code === 'UNCITED_KILL_REJECTED' ||
    code === 'WIP_ONE_EXCEEDED' ||
    code === 'PROBE_REQUIRED_FOR_VALIDATED'
  ) {
    return code;
  }
  const message = error instanceof Error ? error.message : String(error);
  for (const ruleCode of [
    'UNCITED_KILL_REJECTED',
    'WIP_ONE_EXCEEDED',
    'PROBE_REQUIRED_FOR_VALIDATED',
  ]) {
    if (message.includes(ruleCode)) return ruleCode;
  }
  if (
    error &&
    typeof error === 'object' &&
    (('constraint_name' in error &&
      error.constraint_name === 'mission_runs_active_subject_wip_one_uidx') ||
      ('constraint' in error && error.constraint === 'mission_runs_active_subject_wip_one_uidx'))
  ) {
    return 'WIP_ONE_EXCEEDED';
  }
  return null;
}

function requestedHumanGateCrashBoundary(): boolean {
  return process.env[HUMAN_GATE_TEST_CRASH_ENV] === HUMAN_GATE_TEST_CRASH_BOUNDARY;
}

function assertMissionRunHttpAccess(run: MissionAuthorizedRunRow, scope: Scope): void {
  if (scope === 'control') {
    return;
  }
  if (scope === 'rn' && run.owner_scope === 'rn') {
    return;
  }
  throw missionConflict(
    'MISSION_FORBIDDEN',
    `mission run ${run.id} is not authorized for scope ${scope}`
  );
}

export function missionHttpErrorFromUnknown(error: unknown): HttpMissionError {
  if (error instanceof z.ZodError) {
    return missionHttpError(422, 'INVALID_REQUEST', validationIssueMessage(error));
  }
  if (error instanceof SyntaxError) {
    return missionHttpError(422, 'INVALID_REQUEST', 'invalid JSON body');
  }

  const code =
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'MISSION_RUNTIME_FAILED';
  const humanGateCode = missionRuleViolationCode(error);
  if (humanGateCode === 'UNCITED_KILL_REJECTED') {
    return missionHttpError(
      422,
      humanGateCode,
      error instanceof Error
        ? error.message
        : 'a kill verdict requires an immutable belief citation'
    );
  }
  if (humanGateCode === 'WIP_ONE_EXCEEDED' || humanGateCode === 'PROBE_REQUIRED_FOR_VALIDATED') {
    return missionHttpError(
      403,
      humanGateCode,
      error instanceof Error ? error.message : 'mission human gate rejected the request'
    );
  }

  if (code === 'MISSION_NOT_FOUND') {
    return missionHttpError(
      404,
      code,
      error instanceof Error ? error.message : 'mission run not found'
    );
  }
  if (code === 'MISSION_FORBIDDEN') {
    return missionHttpError(
      403,
      code,
      error instanceof Error ? error.message : 'mission run is not authorized for this scope'
    );
  }
  if (code === 'MISSION_TEMPLATE_NOT_FOUND') {
    return missionHttpError(
      404,
      code,
      error instanceof Error ? error.message : 'mission template not found'
    );
  }
  if (code === 'MISSION_IDEMPOTENCY_CONFLICT') {
    return missionHttpError(
      409,
      code,
      error instanceof Error ? error.message : 'mission idempotency conflict'
    );
  }
  if (
    code === 'MISSION_ALREADY_TERMINAL' ||
    code === 'MISSION_LEASE_CONFLICT' ||
    code === 'MISSION_FENCE_VIOLATION'
  ) {
    return missionHttpError(409, code, error instanceof Error ? error.message : 'mission conflict');
  }
  if (
    code.includes('SCHEMA') ||
    code.includes('BUDGET') ||
    code.includes('ROLE') ||
    code.includes('PINNED') ||
    code.includes('PROBE')
  ) {
    return missionHttpError(
      422,
      code,
      error instanceof Error ? error.message : 'mission request rejected'
    );
  }

  return missionHttpError(500, 'MISSION_RUNTIME_FAILED', 'mission request failed');
}

async function nextMissionEventIndex(sql: MissionControlSql, runId: string): Promise<number> {
  const rows = await sql<MissionEventIndexRow[]>`
    SELECT COALESCE(MAX(event_index), -1) + 1 AS event_index
    FROM mission_events
    WHERE run_id = ${runId}::uuid
  `;
  return Number(rows[0]?.event_index ?? 0);
}

async function selectMissionRunForMutation(
  sql: MissionControlSql,
  runId: string,
  scope: Scope
): Promise<MissionAuthorizedRunRow | null> {
  const rows = await sql<MissionAuthorizedRunRow[]>`
    SELECT id, owner_scope
    FROM mission_runs
    WHERE id = ${runId}::uuid
    FOR UPDATE
  `;
  const run = rows[0] ?? null;
  if (run) {
    assertMissionRunHttpAccess(run, scope);
  }
  return run;
}

async function selectMissionSteeringByRequestKey(
  sql: MissionControlSql,
  runId: string,
  requestKey: string
): Promise<MissionSteeringRow | null> {
  const rows = await sql<MissionSteeringRow[]>`
    SELECT *
    FROM mission_steering
    WHERE run_id = ${runId}::uuid
      AND request_key = ${requestKey}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function selectMissionVerdictByRequestKey(
  sql: MissionControlSql,
  runId: string,
  requestKey: string
): Promise<MissionVerdictRow | null> {
  const rows = await sql<MissionVerdictRow[]>`
    SELECT *
    FROM mission_verdicts
    WHERE run_id = ${runId}::uuid
      AND request_key = ${requestKey}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function selectMissionVerdictRejectionByRequestKey(
  sql: MissionControlSql,
  runId: string,
  requestKey: string
): Promise<MissionVerdictRejectionRow | null> {
  const rows = await sql<MissionVerdictRejectionRow[]>`
    SELECT *
    FROM mission_verdict_rejections
    WHERE run_id = ${runId}::uuid
      AND request_key = ${requestKey}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function persistMissionVerdictRejection(
  sql: Sql,
  input: {
    runId: string;
    requestKey: string;
    payload: unknown;
    errorCode: string;
    errorMessage: string;
  }
): Promise<void> {
  await sql.begin(async (tx) => {
    const rows = await tx<MissionVerdictRejectionRow[]>`
      INSERT INTO mission_verdict_rejections (
        run_id,
        request_key,
        payload_json,
        error_code,
        error_message
      )
      VALUES (
        ${input.runId}::uuid,
        ${input.requestKey},
        ${tx.json(input.payload as never)},
        ${input.errorCode},
        ${input.errorMessage}
      )
      ON CONFLICT (run_id, request_key) DO NOTHING
      RETURNING *
    `;
    if (rows[0]) return;

    const existing = await selectMissionVerdictRejectionByRequestKey(
      tx,
      input.runId,
      input.requestKey
    );
    if (!existing || !sameCanonicalPayload(existing.payload_json, input.payload)) {
      throw missionConflict(
        'MISSION_IDEMPOTENCY_CONFLICT',
        `mission verdict rejection key conflict for run ${input.runId}`
      );
    }
  });
}

async function selectMissionControlEventByReference(
  sql: MissionControlSql,
  runId: string,
  eventType: 'steer' | 'verdict',
  key: 'steeringId' | 'verdictId',
  value: string
): Promise<MissionControlEventRow | null> {
  const rows = await sql<MissionControlEventRow[]>`
    SELECT *
    FROM mission_events
    WHERE run_id = ${runId}::uuid
      AND event_type = ${eventType}
      AND payload_json @> ${sql.json(canonicalJsonValue({ [key]: value }) as never)}
    ORDER BY event_index ASC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function mapMissionEventRow(row: MissionControlEventRow) {
  return canonicalJsonValue({
    id: row.id,
    runId: row.run_id,
    eventIndex: row.event_index,
    eventType: row.event_type,
    stageIndex: row.stage_index,
    checkpointKey: row.checkpoint_key,
    payload: row.payload_json,
    createdAt: new Date(String(row.created_at)).toISOString(),
  });
}

function mapMissionSteeringRow(row: MissionSteeringRow) {
  return canonicalJsonValue({
    id: row.id,
    runId: row.run_id,
    actor: row.actor,
    requestKey: row.request_key,
    instruction: row.instruction,
    payload: row.payload_json,
    createdAt: new Date(String(row.created_at)).toISOString(),
  });
}

function mapMissionVerdictRow(row: MissionVerdictRow) {
  return canonicalJsonValue({
    id: row.id,
    runId: row.run_id,
    actor: row.actor,
    requestKey: row.request_key,
    verdict: row.verdict,
    rationale: row.rationale,
    payload: row.payload_json,
    createdAt: new Date(String(row.created_at)).toISOString(),
  });
}

async function loadMissionStatusOrThrow(
  runId: string,
  options?: { databaseUrl?: string; accessScope?: MissionRunAccessScope }
): Promise<MissionStatusPayload> {
  const run = await getMissionRunStatus(runId, options);
  if (run.errorCode === 'MISSION_NOT_FOUND') {
    throw missionNotFound(runId);
  }
  return run;
}

type MissionTemplateVersionRow = {
  template_key: string;
  version: string;
  definition_hash: string;
  compiler_version: string;
  registry_snapshot_hash: string;
  output_schema_ref: string;
  output_schema_version: number;
  executor_ref: string;
  schema_ref: string;
  schema_version: number;
  compiled_plan_json: unknown;
  budget_policy_json: unknown;
  no_cloud_fallback: boolean;
  fleet_manifest_version: string;
  fleet_manifest_path: string;
  fleet_manifest_hash: string;
  fleet_manifest_json: unknown;
  role_resolution_json: unknown;
  model_revisions_json: unknown;
};

/**
 * Admit a mission run (status=pending) without executing stages — S31-02 AC-4.
 * Execution is driven by the scheduler consumer via resumeMissionRun.
 */
async function admitMissionRunPending(
  body: z.infer<typeof MissionCreateBodySchema>,
  operator: string,
  options?: { databaseUrl?: string; scope?: Scope }
): Promise<MissionStatusPayload> {
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'mission admit http',
  });
  const ownerScope = missionCreateOwnerScope();
  const sql = createSql(databaseUrl);
  const args = canonicalJsonValue({
    goal: body.goal,
    operator,
    title: body.args?.title,
    description: body.args?.description,
    category: body.args?.category,
    sourceUrl: body.args?.sourceUrl,
    sourceType: body.args?.sourceType,
    language: body.args?.language,
    toolTags: body.args?.tags,
    useCases: body.args?.useCases,
  });

  try {
    // Idempotent replay: return existing run for the same template+key.
    const existing = await sql<
      { id: string; status: string; trace_id: string | null; template_version: string }[]
    >`
      SELECT id::text AS id, status, trace_id, template_version
      FROM mission_runs
      WHERE template_key = ${body.templateKey}
        AND idempotency_key = ${body.idempotencyKey}
      LIMIT 1
    `;
    if (existing[0]) {
      const row = existing[0];
      // Enqueue again only if still non-terminal (consumer may have crashed).
      if (!['completed', 'failed', 'blocked', 'cancelled', 'canceled'].includes(row.status)) {
        await enqueue({
          name: 'mission:execute',
          lane: 'background',
          key: `mission-exec:${row.id}`,
          payload: { runId: row.id, templateKey: body.templateKey },
          databaseUrl,
        }).catch(() => {});
      }
      return {
        ok: true,
        runId: row.id,
        templateKey: body.templateKey,
        templateVersion: row.template_version,
        idempotencyKey: body.idempotencyKey,
        traceId: row.trace_id,
        status: row.status as MissionStatusPayload['status'],
        replay: true,
        goal: body.goal,
      };
    }

    const templates = await sql<MissionTemplateVersionRow[]>`
      SELECT
        template_key,
        version,
        definition_hash,
        compiler_version,
        registry_snapshot_hash,
        output_schema_ref,
        output_schema_version,
        executor_ref,
        schema_ref,
        schema_version,
        compiled_plan_json,
        budget_policy_json,
        no_cloud_fallback,
        fleet_manifest_version,
        fleet_manifest_path,
        fleet_manifest_hash,
        fleet_manifest_json,
        role_resolution_json,
        model_revisions_json
      FROM mission_template_versions
      WHERE template_key = ${body.templateKey}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const tv = templates[0];
    if (!tv) {
      throw new MissionRuntimeError(
        'MISSION_TEMPLATE_NOT_FOUND',
        `mission template not found: ${body.templateKey}`
      );
    }

    const traceId = `mission:${randomUUID()}`;
    const inserted = await sql<
      { id: string; status: string; trace_id: string | null; template_version: string }[]
    >`
      INSERT INTO mission_runs (
        template_key,
        template_version,
        idempotency_key,
        owner_scope,
        goal,
        args_json,
        status,
        attempt_count,
        trace_id,
        definition_hash,
        compiler_version,
        registry_snapshot_hash,
        output_schema_ref,
        output_schema_version,
        executor_ref,
        schema_ref,
        schema_version,
        compiled_plan_json,
        budget_policy_json,
        usage_json,
        no_cloud_fallback,
        fleet_manifest_version,
        fleet_manifest_path,
        fleet_manifest_hash,
        fleet_manifest_json,
        role_resolution_json,
        model_revisions_json,
        executor_version
      )
      VALUES (
        ${tv.template_key},
        ${tv.version},
        ${body.idempotencyKey},
        ${ownerScope},
        ${body.goal},
        ${sql.json(args as never)},
        'pending',
        0,
        ${traceId},
        ${tv.definition_hash},
        ${tv.compiler_version},
        ${tv.registry_snapshot_hash},
        ${tv.output_schema_ref},
        ${tv.output_schema_version},
        ${tv.executor_ref},
        ${tv.schema_ref},
        ${tv.schema_version},
        ${sql.json(tv.compiled_plan_json as never)},
        ${sql.json(tv.budget_policy_json as never)},
        ${sql.json({} as never)},
        ${tv.no_cloud_fallback},
        ${tv.fleet_manifest_version},
        ${tv.fleet_manifest_path},
        ${tv.fleet_manifest_hash},
        ${sql.json(tv.fleet_manifest_json as never)},
        ${sql.json(tv.role_resolution_json as never)},
        ${sql.json(tv.model_revisions_json as never)},
        ${tv.version}
      )
      ON CONFLICT (template_key, idempotency_key) DO NOTHING
      RETURNING id::text AS id, status, trace_id, template_version
    `;

    const run = inserted[0];
    if (!run) {
      // Concurrent insert — re-read.
      const again = await sql<
        { id: string; status: string; trace_id: string | null; template_version: string }[]
      >`
        SELECT id::text AS id, status, trace_id, template_version
        FROM mission_runs
        WHERE template_key = ${body.templateKey}
          AND idempotency_key = ${body.idempotencyKey}
        LIMIT 1
      `;
      if (!again[0]) {
        throw new MissionRuntimeError(
          'MISSION_RUN_CREATE_FAILED',
          `failed to admit mission run for ${body.templateKey}`
        );
      }
      return {
        ok: true,
        runId: again[0].id,
        templateKey: body.templateKey,
        templateVersion: again[0].template_version,
        idempotencyKey: body.idempotencyKey,
        traceId: again[0].trace_id,
        status: again[0].status as MissionStatusPayload['status'],
        replay: true,
        goal: body.goal,
      };
    }

    await enqueue({
      name: 'mission:execute',
      lane: 'background',
      key: `mission-exec:${run.id}`,
      payload: { runId: run.id, templateKey: body.templateKey },
      databaseUrl,
    });

    return {
      ok: true,
      runId: run.id,
      templateKey: body.templateKey,
      templateVersion: run.template_version,
      idempotencyKey: body.idempotencyKey,
      traceId: run.trace_id,
      status: 'pending',
      replay: false,
      goal: body.goal,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function createMissionRunFromHttp(
  raw: unknown,
  options?: { databaseUrl?: string; scope?: Scope }
): Promise<MissionStatusPayload> {
  const body = MissionCreateBodySchema.parse(raw);
  const operator =
    typeof body.args?.operator === 'string' && body.args.operator.trim().length > 0
      ? body.args.operator
      : `hono:${options?.scope ?? 'rn'}`;

  try {
    // S31-02 AC-4: default path leaves the request thread; execution is queued.
    if (!missionInlineOnRequest()) {
      return await admitMissionRunPending(body, operator, options);
    }

    return await runMissionTemplate(
      {
        templateKey: body.templateKey,
        goal: body.goal,
        idempotencyKey: body.idempotencyKey,
        operator,
        title: body.args?.title,
        description: body.args?.description,
        category: body.args?.category as
          | 'libraries'
          | 'cli'
          | 'framework'
          | 'service'
          | 'database'
          | 'tool'
          | undefined,
        sourceUrl: body.args?.sourceUrl,
        sourceType: body.args?.sourceType as
          | 'github'
          | 'npm'
          | 'pypi'
          | 'website'
          | 'cargo'
          | 'go'
          | 'other'
          | undefined,
        language: body.args?.language,
        toolTags: body.args?.tags,
        useCases: body.args?.useCases,
      },
      {
        databaseUrl: options?.databaseUrl,
        ownerScope: missionCreateOwnerScope(),
      }
    );
  } catch (error) {
    if (missionRuleViolationCode(error) === 'WIP_ONE_EXCEEDED') {
      throw missionConflict(
        'WIP_ONE_EXCEEDED',
        'only one active mission run is allowed for this template and goal'
      );
    }
    if (error instanceof MissionRuntimeError && error.code === 'MISSION_FORBIDDEN') {
      throw missionConflict('MISSION_IDEMPOTENCY_CONFLICT', 'mission idempotency conflict');
    }
    throw error;
  }
}

/** Execute a previously admitted mission run (scheduler consumer entrypoint). */
export async function executeQueuedMissionRun(
  runId: string,
  options?: { databaseUrl?: string }
): Promise<MissionStatusPayload> {
  return resumeMissionRun(runId, { databaseUrl: options?.databaseUrl });
}

export async function getMissionStatusFromHttp(
  runId: string,
  options?: { databaseUrl?: string; scope?: Scope }
): Promise<MissionStatusPayload> {
  const normalizedRunId = MissionRunIdSchema.safeParse(runId);
  if (!normalizedRunId.success) {
    return {
      ok: false,
      runId: null,
      error: `mission run not found: ${runId}`,
      code: 'MISSION_NOT_FOUND',
      errorCode: 'MISSION_NOT_FOUND',
    };
  }
  return getMissionRunStatus(normalizedRunId.data, {
    databaseUrl: options?.databaseUrl,
    accessScope: missionControlAccessScope(options?.scope),
  });
}

export async function appendMissionSteeringFromHttp(
  runId: string,
  scope: Scope,
  raw: unknown,
  options?: { databaseUrl?: string }
): Promise<MissionSteeringMutationResult> {
  const normalizedRunIdResult = MissionRunIdSchema.safeParse(runId);
  if (!normalizedRunIdResult.success) {
    throw missionNotFound(runId);
  }
  const normalizedRunId = normalizedRunIdResult.data;
  const body = MissionSteerBodySchema.parse(raw);
  const actor = body.actor ?? `api:${scope}`;
  const requestPayloadBase = canonicalJsonValue({
    actor,
    instruction: body.instruction ?? undefined,
    note: body.note ?? undefined,
  });
  const requestKey = body.requestKey ?? controlRequestKey('steer', requestPayloadBase);
  const payload = canonicalJsonValue({
    ...requestPayloadBase,
    requestKey,
  });
  const instruction = body.instruction ?? body.note ?? null;
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'mission steer http',
  });
  const sql = createSql(databaseUrl);

  try {
    const inserted = await sql.begin(async (tx) => {
      const run = await selectMissionRunForMutation(tx, normalizedRunId, scope);
      if (!run) {
        return null;
      }

      const steeringRows = await tx<MissionSteeringRow[]>`
        INSERT INTO mission_steering (
          run_id,
          actor,
          request_key,
          instruction,
          payload_json
        )
        VALUES (
          ${normalizedRunId}::uuid,
          ${actor},
          ${requestKey},
          ${instruction},
          ${tx.json(payload as never)}
        )
        ON CONFLICT (run_id, request_key) DO NOTHING
        RETURNING *
      `;
      const steering = steeringRows[0];
      if (!steering) {
        const existing = await selectMissionSteeringByRequestKey(tx, normalizedRunId, requestKey);
        if (!existing) {
          throw new Error('mission steering replay lookup returned no row');
        }
        if (!sameCanonicalPayload(existing.payload_json, payload)) {
          throw missionConflict(
            'MISSION_IDEMPOTENCY_CONFLICT',
            `mission steer request key conflict for run ${normalizedRunId}: persisted payload differs from this request`
          );
        }
        const existingEvent = await selectMissionControlEventByReference(
          tx,
          normalizedRunId,
          'steer',
          'steeringId',
          existing.id
        );
        if (!existingEvent) {
          throw new Error('mission steer replay is missing its event row');
        }
        return { steering: existing, event: existingEvent, replay: true };
      }

      const eventIndex = await nextMissionEventIndex(tx, normalizedRunId);
      const eventPayload = canonicalJsonValue({
        actor,
        requestKey,
        instruction,
        note: body.note ?? null,
        payload,
        steeringId: steering.id,
      });
      const eventRows = await tx<MissionControlEventRow[]>`
        INSERT INTO mission_events (
          run_id,
          event_index,
          event_type,
          stage_index,
          checkpoint_key,
          payload_json
        )
        VALUES (
          ${normalizedRunId}::uuid,
          ${eventIndex},
          ${'steer'},
          NULL,
          NULL,
          ${tx.json(eventPayload as never)}
        )
        RETURNING *
      `;
      const event = eventRows[0];
      if (!event) {
        throw new Error('mission steer event insert returned no row');
      }

      return { steering, event, replay: false };
    });

    if (!inserted) {
      throw missionNotFound(normalizedRunId);
    }

    return {
      replay: inserted.replay,
      run: await loadMissionStatusOrThrow(normalizedRunId, {
        databaseUrl,
        accessScope: missionControlAccessScope(scope),
      }),
      steering: mapMissionSteeringRow(inserted.steering),
      event: mapMissionEventRow(inserted.event),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function appendMissionVerdictFromHttp(
  runId: string,
  scope: Scope,
  raw: unknown,
  options?: { databaseUrl?: string }
): Promise<MissionVerdictMutationResult> {
  const normalizedRunIdResult = MissionRunIdSchema.safeParse(runId);
  if (!normalizedRunIdResult.success) {
    throw missionNotFound(runId);
  }
  const normalizedRunId = normalizedRunIdResult.data;
  const body = MissionVerdictBodySchema.parse(raw);
  const actor = body.actor ?? `api:${scope}`;
  const requestPayloadBase = canonicalJsonValue({
    actor,
    verdict: body.verdict,
    rationale: body.rationale ?? undefined,
    citation: body.citation ?? undefined,
    targetStatus: body.targetStatus ?? undefined,
  });
  const requestKey = body.requestKey ?? controlRequestKey('verdict', requestPayloadBase);
  const payload = canonicalJsonValue({
    ...requestPayloadBase,
    requestKey,
  });
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'mission verdict http',
  });
  const sql = createSql(databaseUrl);

  try {
    const inserted = await sql.begin(async (tx) => {
      const run = await selectMissionRunForMutation(tx, normalizedRunId, scope);
      if (!run) {
        return null;
      }

      if (requestedHumanGateCrashBoundary()) {
        await tx`SELECT set_config('holocron.test_human_gate_crash_boundary', ${HUMAN_GATE_TEST_CRASH_BOUNDARY}, true)`;
      }

      const persistedRejection = await selectMissionVerdictRejectionByRequestKey(
        tx,
        normalizedRunId,
        requestKey
      );
      if (persistedRejection) {
        if (!sameCanonicalPayload(persistedRejection.payload_json, payload)) {
          throw missionConflict(
            'MISSION_IDEMPOTENCY_CONFLICT',
            `mission verdict request key conflict for run ${normalizedRunId}: persisted payload differs from this request`
          );
        }
        throw missionConflict(persistedRejection.error_code, persistedRejection.error_message);
      }

      const verdictRows = await tx<MissionVerdictRow[]>`
        INSERT INTO mission_verdicts (
          run_id,
          actor,
          request_key,
          verdict,
          rationale,
          payload_json
        )
        VALUES (
          ${normalizedRunId}::uuid,
          ${actor},
          ${requestKey},
          ${body.verdict},
          ${body.rationale ?? null},
          ${tx.json(payload as never)}
        )
        ON CONFLICT (run_id, request_key) DO NOTHING
        RETURNING *
      `;
      const verdict = verdictRows[0];
      if (!verdict) {
        const existing = await selectMissionVerdictByRequestKey(tx, normalizedRunId, requestKey);
        if (!existing) {
          throw new Error('mission verdict replay lookup returned no row');
        }
        if (!sameCanonicalPayload(existing.payload_json, payload)) {
          throw missionConflict(
            'MISSION_IDEMPOTENCY_CONFLICT',
            `mission verdict request key conflict for run ${normalizedRunId}: persisted payload differs from this request`
          );
        }
        const existingEvent = await selectMissionControlEventByReference(
          tx,
          normalizedRunId,
          'verdict',
          'verdictId',
          existing.id
        );
        if (!existingEvent) {
          throw new Error('mission verdict replay is missing its event row');
        }
        return { verdict: existing, event: existingEvent, replay: true };
      }

      const eventIndex = await nextMissionEventIndex(tx, normalizedRunId);
      const eventPayload = canonicalJsonValue({
        actor,
        requestKey,
        verdict: body.verdict,
        rationale: body.rationale ?? null,
        payload,
        verdictId: verdict.id,
      });
      const eventRows = await tx<MissionControlEventRow[]>`
        INSERT INTO mission_events (
          run_id,
          event_index,
          event_type,
          stage_index,
          checkpoint_key,
          payload_json
        )
        VALUES (
          ${normalizedRunId}::uuid,
          ${eventIndex},
          ${'verdict'},
          NULL,
          NULL,
          ${tx.json(eventPayload as never)}
        )
        RETURNING *
      `;
      const event = eventRows[0];
      if (!event) {
        throw new Error('mission verdict event insert returned no row');
      }

      return { verdict, event, replay: false };
    });

    if (!inserted) throw missionNotFound(normalizedRunId);

    return {
      replay: inserted.replay,
      run: await loadMissionStatusOrThrow(normalizedRunId, {
        databaseUrl,
        accessScope: missionControlAccessScope(scope),
      }),
      verdict: mapMissionVerdictRow(inserted.verdict),
      event: mapMissionEventRow(inserted.event),
    };
  } catch (error) {
    const humanGateCode = missionRuleViolationCode(error);
    if (!humanGateCode) throw error;

    const message =
      error instanceof Error ? error.message : `mission human gate rejected: ${humanGateCode}`;
    await persistMissionVerdictRejection(sql, {
      runId: normalizedRunId,
      requestKey,
      payload,
      errorCode: humanGateCode,
      errorMessage: message,
    });
    throw missionConflict(humanGateCode, message);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
