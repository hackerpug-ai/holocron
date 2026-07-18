import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createSql, type Sql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { type FleetRoleManifest, FleetRoleManifestSchema } from '../fleet/manifest.schema.ts';
import { getRoleEntry } from '../fleet/manifest.ts';
import { probeRoleHealth } from '../inference/resolve-model.ts';
import { canonicalJsonString, canonicalJsonValue } from './canonical-json.ts';
import { waitAtCheckpointBarrierIfRequested } from './checkpoint-barrier.ts';
import type { CompiledMissionStage, MissionResolvedRole } from './compiler.ts';
import {
  assertRegisteredExecutor,
  assertRegisteredSchema,
  assertRegisteredStage,
} from './registry.ts';

const LEASE_TTL_SECONDS = 60;
const RUN_TERMINAL_STATUSES = new Set(['completed', 'failed', 'blocked', 'budget_exceeded']);
const SUPPORTED_RUN_STATUSES = new Set([
  'pending',
  'running',
  'suspended',
  'failed',
  'blocked',
  'completed',
  'budget_exceeded',
]);

const CompiledMissionStageSchema = z
  .object({
    stageIndex: z.number().int().nonnegative(),
    stageKey: z.string().min(1),
    stageKind: z.string().min(1),
    executorRef: z.string().min(1),
    inputSchemaRef: z.string().min(1),
    inputSchemaVersion: z.number().int().positive(),
    outputSchemaRef: z.string().min(1),
    outputSchemaVersion: z.number().int().positive(),
    checkpointKey: z.string().min(1).nullable(),
    boundRole: z.string().min(1).nullable(),
  })
  .strict();

const MissionResolvedRoleSchema = z
  .object({
    stageId: z.string().min(1),
    role: z.string().min(1),
    endpoint: z.string().min(1),
    litellmModelId: z.string().min(1),
    modelRevision: z.string().min(1),
    provider: z.string().min(1),
    allowEscape: z.boolean(),
    fleetManifestVersion: z.string().min(1),
  })
  .strict();

const CompiledMissionPlanSchema = z.array(CompiledMissionStageSchema).min(1);
const MissionRoleResolutionMapSchema = z.record(z.string().min(1), MissionResolvedRoleSchema);
const MissionModelRevisionsSchema = z.record(z.string().min(1), z.string().min(1));

const MissionGoalArgsSchema = z
  .object({
    goal: z.string().min(1),
    operator: z.string().min(1).optional(),
  })
  .strict();

const MissionRunIdSchema = z.string().uuid();

const MissionBudgetPolicySchema = z
  .object({
    wallMs: z.number().int().positive(),
    tokens: z.number().int().nonnegative(),
    cost: z.number().nonnegative(),
    maxSteps: z.number().int().positive(),
  })
  .strict();

export class MissionRuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode: number = 1
  ) {
    super(message);
    this.name = 'MissionRuntimeError';
  }
}

export type MissionStatus =
  | 'pending'
  | 'running'
  | 'suspended'
  | 'failed'
  | 'blocked'
  | 'completed'
  | 'budget_exceeded';

export type MissionStatusPayload = {
  ok: boolean;
  runId: string | null;
  templateKey?: string;
  templateVersion?: string;
  idempotencyKey?: string;
  status?: MissionStatus;
  replay?: boolean;
  goal?: string | null;
  checkpointStageIndex?: number | null;
  attemptCount?: number;
  output?: unknown;
  provenance?: Record<string, unknown>;
  error?: string;
  code?: string;
  errorCode?: string;
};

type MissionTemplateVersionRuntimeRow = {
  template_key: string;
  version: string;
  description: string;
  definition_hash: string;
  compiled_plan_json: unknown;
  compiler_version: string;
  registry_snapshot_hash: string;
  output_schema_ref: string;
  output_schema_version: number;
  executor_ref: string;
  schema_ref: string;
  schema_version: number;
  budget_policy_json: unknown;
  no_cloud_fallback: boolean;
  fleet_manifest_version: string;
  fleet_manifest_path: string;
  fleet_manifest_hash: string;
  fleet_manifest_json: unknown;
  role_resolution_json: unknown;
  model_revisions_json: unknown;
};

type MissionRunRow = {
  id: string;
  template_key: string;
  template_version: string;
  idempotency_key: string;
  goal: string | null;
  args_json: unknown;
  status: string;
  checkpoint_stage_index: number | null;
  lease_owner: string | null;
  lease_token: string | null;
  lease_expires_at: Date | string | null;
  attempt_count: number;
  trace_id: string | null;
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
  usage_json: unknown;
  typed_output_json: unknown;
  no_cloud_fallback: boolean;
  fleet_manifest_version: string;
  fleet_manifest_path: string;
  fleet_manifest_hash: string;
  fleet_manifest_json: unknown;
  role_resolution_json: unknown;
  model_revisions_json: unknown;
  error_code: string | null;
  error_message: string | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
};

type MissionStageRunRow = {
  id: string;
  run_id: string;
  stage_index: number;
  stage_key: string;
  stage_kind: string;
  executor_ref: string;
  input_schema_ref: string;
  input_schema_version: number;
  output_schema_ref: string;
  output_schema_version: number;
  status: string;
  attempt: number;
  checkpoint_key: string | null;
  fence_token: string | null;
  input_json: unknown;
  output_json: unknown;
  role: string | null;
  model_revision: string | null;
  endpoint: string | null;
  error_code: string | null;
  error_message: string | null;
  committed_at: Date | string | null;
};

type MissionLease = {
  owner: string;
  token: string;
  expiresAtIso: string;
  attemptCount: number;
};

type MissionSqlExecutor = Sql | import('postgres').TransactionSql;

type PersistedMissionRuntime = {
  compiledPlan: CompiledMissionStage[];
  fleetManifest: FleetRoleManifest;
  roleResolution: Record<string, MissionResolvedRole>;
  modelRevisions: Record<string, string>;
  budgetPolicy: z.infer<typeof MissionBudgetPolicySchema>;
};

type StageExecutionContext = {
  run: MissionRunRow;
  stage: CompiledMissionStage;
  lease: MissionLease;
  runtime: PersistedMissionRuntime;
};

type StageExecutor = (input: unknown, context: StageExecutionContext) => Promise<unknown>;

const STAGE_EXECUTORS: Record<string, StageExecutor> = {
  'builtin.fleet-probe@1': async (input, context) => {
    const args = MissionGoalArgsSchema.parse(input);
    const boundRole = context.stage.boundRole;
    if (!boundRole) {
      throw new MissionRuntimeError(
        'MISSION_PINNED_ROLE_MISSING',
        `stage ${context.stage.stageKey} is missing its pinned role binding`
      );
    }

    const manifestRole = getRoleEntry(context.runtime.fleetManifest, boundRole);
    const health = await probeRoleHealth(manifestRole);
    if (!health.ok) {
      throw new MissionRuntimeError(
        'MISSION_FLEET_PROBE_UNAVAILABLE',
        `pinned fleet role ${boundRole} failed readiness probe: ${health.error}`
      );
    }

    const pinnedRole = context.runtime.roleResolution[context.stage.stageKey];
    if (!pinnedRole) {
      throw new MissionRuntimeError(
        'MISSION_PINNED_ROLE_MISSING',
        `run ${context.run.id} is missing pinned role resolution for stage ${context.stage.stageKey}`
      );
    }

    return canonicalJsonValue({
      goal: args.goal,
      role: pinnedRole.role,
      endpoint: pinnedRole.endpoint,
      litellmModelId: pinnedRole.litellmModelId,
      modelRevision: pinnedRole.modelRevision,
      fleetManifestVersion: pinnedRole.fleetManifestVersion,
    });
  },
  'builtin.test-echo@1': async (input) => {
    const probe = parseMissionSchemaValue(
      { schemaRef: 'mission.probe.result', schemaVersion: 1 },
      input,
      'mission.probe.result'
    ) as {
      goal: string;
      role: string;
    };

    return canonicalJsonValue({
      goal: probe.goal,
      echo: probe.goal,
      probeRole: probe.role,
    });
  },
  'builtin.test-checkpoint@1': async (input, context) => {
    const probe = parseMissionSchemaValue(
      { schemaRef: 'mission.probe.result', schemaVersion: 1 },
      input,
      'mission.probe.result'
    ) as {
      goal: string;
      role: string;
    };

    const checkpointKey = context.stage.checkpointKey;
    if (!checkpointKey) {
      throw new MissionRuntimeError(
        'MISSION_CHECKPOINT_KEY_REQUIRED',
        `stage ${context.stage.stageKey} requires checkpointKey`
      );
    }

    return canonicalJsonValue({
      goal: probe.goal,
      checkpointKey,
      probeRole: probe.role,
    });
  },
  'builtin.test-resume@1': async (input) => {
    const checkpoint = parseMissionSchemaValue(
      { schemaRef: 'mission.checkpoint.output', schemaVersion: 1 },
      input,
      'mission.checkpoint.output'
    ) as {
      goal: string;
      checkpointKey: string;
    };

    return canonicalJsonValue({
      goal: checkpoint.goal,
      resumed: true,
      checkpointKey: checkpoint.checkpointKey,
    });
  },
  'builtin.test-consume-budget@1': async () => {
    throw new MissionRuntimeError(
      'MISSION_BUDGET_STAGE_UNIMPLEMENTED',
      'test.consume-budget@1 is reserved for mission-3 budget termination work'
    );
  },
};

function parseMissionSchemaValue(
  schemaRef: { schemaRef: string; schemaVersion: number },
  value: unknown,
  label: string
): unknown {
  const registration = assertRegisteredSchema(schemaRef);
  const parsed = registration.schema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    });
    throw new MissionRuntimeError(
      'MISSION_SCHEMA_VALIDATION_FAILED',
      `${label} validation failed: ${issues.join('; ')}`
    );
  }
  return parsed.data;
}

function parseCompiledPlan(value: unknown): CompiledMissionStage[] {
  return CompiledMissionPlanSchema.parse(value) as CompiledMissionStage[];
}

function parseRoleResolution(value: unknown): Record<string, MissionResolvedRole> {
  return MissionRoleResolutionMapSchema.parse(value) as Record<string, MissionResolvedRole>;
}

function parseModelRevisions(value: unknown): Record<string, string> {
  return MissionModelRevisionsSchema.parse(value);
}

function parseBudgetPolicy(value: unknown): z.infer<typeof MissionBudgetPolicySchema> {
  return MissionBudgetPolicySchema.parse(value);
}

function isTerminalStatus(status: string): boolean {
  return RUN_TERMINAL_STATUSES.has(status);
}

function normalizeMissionStatus(run: MissionRunRow): MissionStatus {
  const raw = run.status;
  if (SUPPORTED_RUN_STATUSES.has(raw)) {
    if (raw === 'running' && !hasLiveLease(run)) {
      return 'suspended';
    }
    return raw as MissionStatus;
  }

  return hasLiveLease(run) ? 'running' : 'suspended';
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hasLiveLease(run: MissionRunRow): boolean {
  if (!run.lease_token || !run.lease_owner) return false;
  const expiresAt = toDate(run.lease_expires_at);
  if (!expiresAt) return false;
  return expiresAt.getTime() > Date.now();
}

function buildMissionProvenance(run: MissionRunRow): Record<string, unknown> {
  return canonicalJsonValue({
    templateKey: run.template_key,
    templateVersion: run.template_version,
    definitionHash: run.definition_hash,
    compilerVersion: run.compiler_version,
    registrySnapshotHash: run.registry_snapshot_hash,
    outputSchemaRef: run.output_schema_ref,
    outputSchemaVersion: run.output_schema_version,
    executorRef: run.executor_ref,
    schemaRef: run.schema_ref,
    schemaVersion: run.schema_version,
    noCloudFallback: run.no_cloud_fallback,
    fleetManifestVersion: run.fleet_manifest_version,
    fleetManifestPath: run.fleet_manifest_path,
    fleetManifestHash: run.fleet_manifest_hash,
    roleResolution: run.role_resolution_json,
    modelRevisions: run.model_revisions_json,
  });
}

function buildMissionPayload(
  run: MissionRunRow,
  options?: { replay?: boolean; ok?: boolean }
): MissionStatusPayload {
  return canonicalJsonValue({
    ok: options?.ok ?? true,
    runId: run.id,
    templateKey: run.template_key,
    templateVersion: run.template_version,
    idempotencyKey: run.idempotency_key,
    status: normalizeMissionStatus(run),
    replay: options?.replay ?? false,
    goal: run.goal,
    checkpointStageIndex: run.checkpoint_stage_index,
    attemptCount: run.attempt_count,
    output: run.typed_output_json ?? undefined,
    provenance: buildMissionProvenance(run),
    error: run.error_message ?? undefined,
    code: run.error_code ?? undefined,
    errorCode: run.error_code ?? undefined,
  });
}

function missionNotFoundPayload(runId: string): MissionStatusPayload {
  return {
    ok: false,
    runId: null,
    error: `mission run not found: ${runId}`,
    code: 'MISSION_NOT_FOUND',
    errorCode: 'MISSION_NOT_FOUND',
  };
}

function normalizeMissionRunId(runId: string): string | null {
  const parsed = MissionRunIdSchema.safeParse(runId);
  return parsed.success ? parsed.data : null;
}

function runtimeOwner(): string {
  return `mission-runtime:${process.pid}:${randomUUID().slice(0, 8)}`;
}

function runtimeToken(): string {
  return `mission-lease:${randomUUID()}`;
}

function assertRegisteredExecutorRuntime(executorRef: string): StageExecutor {
  const executorRegistration = assertRegisteredExecutor(executorRef);
  const executor = STAGE_EXECUTORS[executorRegistration.executorRef];
  if (!executor) {
    throw new MissionRuntimeError(
      'MISSION_PINNED_EXECUTOR_MISSING',
      `pinned executor ${executorRef} is not implemented by this runtime`
    );
  }
  return executor;
}

function assertCompiledStageMatchesRegistry(stage: CompiledMissionStage): void {
  const stageRegistration = assertRegisteredStage(stage.stageKind);
  const executorRegistration = assertRegisteredExecutor(stage.executorRef);
  if (stageRegistration.executorRef !== stage.executorRef) {
    throw new MissionRuntimeError(
      'MISSION_PINNED_EXECUTOR_MISMATCH',
      `pinned stage ${stage.stageKey} requires executor ${stageRegistration.executorRef}, found ${stage.executorRef}`
    );
  }
  if (executorRegistration.stageKind !== stage.stageKind) {
    throw new MissionRuntimeError(
      'MISSION_PINNED_STAGE_MISMATCH',
      `pinned executor ${stage.executorRef} no longer matches stage kind ${stage.stageKind}`
    );
  }

  const inputRegistration = assertRegisteredSchema({
    schemaRef: stage.inputSchemaRef,
    schemaVersion: stage.inputSchemaVersion,
  });
  const outputRegistration = assertRegisteredSchema({
    schemaRef: stage.outputSchemaRef,
    schemaVersion: stage.outputSchemaVersion,
  });

  if (
    inputRegistration.schemaRef !== stageRegistration.inputSchema.schemaRef ||
    inputRegistration.schemaVersion !== stageRegistration.inputSchema.schemaVersion
  ) {
    throw new MissionRuntimeError(
      'MISSION_PINNED_INPUT_SCHEMA_MISMATCH',
      `pinned stage ${stage.stageKey} input schema drifted from the registered stage contract`
    );
  }

  if (
    outputRegistration.schemaRef !== stageRegistration.outputSchema.schemaRef ||
    outputRegistration.schemaVersion !== stageRegistration.outputSchema.schemaVersion
  ) {
    throw new MissionRuntimeError(
      'MISSION_PINNED_OUTPUT_SCHEMA_MISMATCH',
      `pinned stage ${stage.stageKey} output schema drifted from the registered stage contract`
    );
  }

  if (stage.checkpointKey && !stageRegistration.checkpointAllowed) {
    throw new MissionRuntimeError(
      'MISSION_PINNED_CHECKPOINT_DISALLOWED',
      `pinned stage ${stage.stageKey} carries checkpointKey but the registered stage disallows checkpoints`
    );
  }
}

function parsePersistedRuntime(run: MissionRunRow): PersistedMissionRuntime {
  let compiledPlan: CompiledMissionStage[];
  let fleetManifest: FleetRoleManifest;
  let roleResolution: Record<string, MissionResolvedRole>;
  let modelRevisions: Record<string, string>;
  let budgetPolicy: z.infer<typeof MissionBudgetPolicySchema>;

  try {
    compiledPlan = parseCompiledPlan(run.compiled_plan_json);
    fleetManifest = FleetRoleManifestSchema.parse(run.fleet_manifest_json);
    roleResolution = parseRoleResolution(run.role_resolution_json);
    modelRevisions = parseModelRevisions(run.model_revisions_json);
    budgetPolicy = parseBudgetPolicy(run.budget_policy_json);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new MissionRuntimeError(
      'MISSION_PINNED_RUNTIME_INVALID',
      `run ${run.id} persisted runtime is invalid: ${message}`
    );
  }

  for (const stage of compiledPlan) {
    assertCompiledStageMatchesRegistry(stage);
    assertRegisteredExecutorRuntime(stage.executorRef);
    if (stage.boundRole) {
      const pinnedRole = roleResolution[stage.stageKey];
      if (!pinnedRole) {
        throw new MissionRuntimeError(
          'MISSION_PINNED_ROLE_MISSING',
          `run ${run.id} is missing pinned role resolution for stage ${stage.stageKey}`
        );
      }
      if (pinnedRole.role !== stage.boundRole) {
        throw new MissionRuntimeError(
          'MISSION_PINNED_ROLE_MISMATCH',
          `run ${run.id} pinned role mismatch for stage ${stage.stageKey}: expected ${stage.boundRole}, found ${pinnedRole.role}`
        );
      }
    }
  }

  return {
    compiledPlan,
    fleetManifest,
    roleResolution,
    modelRevisions,
    budgetPolicy,
  };
}

async function selectLatestTemplateVersion(
  sql: Sql,
  templateKey: string
): Promise<MissionTemplateVersionRuntimeRow | null> {
  const rows = await sql<MissionTemplateVersionRuntimeRow[]>`
    SELECT
      v.template_key,
      v.version,
      v.description,
      v.definition_hash,
      v.compiled_plan_json,
      v.compiler_version,
      v.registry_snapshot_hash,
      v.output_schema_ref,
      v.output_schema_version,
      v.executor_ref,
      v.schema_ref,
      v.schema_version,
      v.budget_policy_json,
      v.no_cloud_fallback,
      v.fleet_manifest_version,
      v.fleet_manifest_path,
      v.fleet_manifest_hash,
      v.fleet_manifest_json,
      v.role_resolution_json,
      v.model_revisions_json
    FROM mission_templates t
    JOIN mission_template_versions v
      ON v.template_key = t.template_key
     AND v.version = t.latest_version
    WHERE t.template_key = ${templateKey}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function selectMissionRunById(
  sql: MissionSqlExecutor,
  runId: string
): Promise<MissionRunRow | null> {
  const validatedRunId = normalizeMissionRunId(runId);
  if (!validatedRunId) return null;

  const rows = await sql<MissionRunRow[]>`
    SELECT *
    FROM mission_runs
    WHERE id = ${validatedRunId}::uuid
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function selectMissionRunByTemplateAndIdempotency(
  sql: MissionSqlExecutor,
  templateKey: string,
  idempotencyKey: string
): Promise<MissionRunRow | null> {
  const rows = await sql<MissionRunRow[]>`
    SELECT *
    FROM mission_runs
    WHERE template_key = ${templateKey}
      AND idempotency_key = ${idempotencyKey}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function createMissionRun(
  sql: Sql,
  templateVersion: MissionTemplateVersionRuntimeRow,
  args: z.infer<typeof MissionGoalArgsSchema>,
  idempotencyKey: string
): Promise<{ run: MissionRunRow; created: boolean }> {
  return sql.begin(async (tx) => {
    const existing = await selectMissionRunByTemplateAndIdempotency(
      tx,
      templateVersion.template_key,
      idempotencyKey
    );

    if (existing) {
      const existingArgs = MissionGoalArgsSchema.safeParse(existing.args_json);
      const comparableIncoming = canonicalJsonString(args);
      const comparableExisting = existingArgs.success
        ? canonicalJsonString(existingArgs.data)
        : canonicalJsonString({ goal: existing.goal ?? '', operator: 'holo' });
      if (comparableExisting !== comparableIncoming) {
        throw new MissionRuntimeError(
          'MISSION_IDEMPOTENCY_CONFLICT',
          `mission idempotency conflict for ${templateVersion.template_key}/${idempotencyKey}: persisted args differ from this request`
        );
      }
      return { run: existing, created: false };
    }

    const traceId = `mission:${randomUUID()}`;
    const rows = await tx<MissionRunRow[]>`
      INSERT INTO mission_runs (
        template_key,
        template_version,
        idempotency_key,
        goal,
        args_json,
        status,
        checkpoint_stage_index,
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
        typed_output_json,
        no_cloud_fallback,
        fleet_manifest_version,
        fleet_manifest_path,
        fleet_manifest_hash,
        fleet_manifest_json,
        role_resolution_json,
        model_revisions_json,
        error_code,
        error_message,
        started_at,
        completed_at
      )
      VALUES (
        ${templateVersion.template_key},
        ${templateVersion.version},
        ${idempotencyKey},
        ${args.goal},
        ${tx.json(canonicalJsonValue(args) as never)},
        'pending',
        NULL,
        0,
        ${traceId},
        ${templateVersion.definition_hash},
        ${templateVersion.compiler_version},
        ${templateVersion.registry_snapshot_hash},
        ${templateVersion.output_schema_ref},
        ${templateVersion.output_schema_version},
        ${templateVersion.executor_ref},
        ${templateVersion.schema_ref},
        ${templateVersion.schema_version},
        ${tx.json(templateVersion.compiled_plan_json as never)},
        ${tx.json(templateVersion.budget_policy_json as never)},
        NULL,
        NULL,
        ${templateVersion.no_cloud_fallback},
        ${templateVersion.fleet_manifest_version},
        ${templateVersion.fleet_manifest_path},
        ${templateVersion.fleet_manifest_hash},
        ${tx.json(templateVersion.fleet_manifest_json as never)},
        ${tx.json(templateVersion.role_resolution_json as never)},
        ${tx.json(templateVersion.model_revisions_json as never)},
        NULL,
        NULL,
        NULL,
        NULL
      )
      ON CONFLICT (template_key, idempotency_key) DO NOTHING
      RETURNING *
    `;

    const run = rows[0];
    if (run) {
      return { run, created: true };
    }

    const replay = await selectMissionRunByTemplateAndIdempotency(
      tx,
      templateVersion.template_key,
      idempotencyKey
    );
    if (!replay) {
      throw new MissionRuntimeError(
        'MISSION_RUN_CREATE_FAILED',
        `failed to create mission run for ${templateVersion.template_key}/${idempotencyKey}`
      );
    }

    const replayArgs = MissionGoalArgsSchema.safeParse(replay.args_json);
    const comparableIncoming = canonicalJsonString(args);
    const comparableReplay = replayArgs.success
      ? canonicalJsonString(replayArgs.data)
      : canonicalJsonString({ goal: replay.goal ?? '', operator: 'holo' });
    if (comparableReplay !== comparableIncoming) {
      throw new MissionRuntimeError(
        'MISSION_IDEMPOTENCY_CONFLICT',
        `mission idempotency conflict for ${templateVersion.template_key}/${idempotencyKey}: persisted args differ from this request`
      );
    }

    return { run: replay, created: false };
  });
}

async function acquireRunLease(sql: Sql, runId: string, owner: string): Promise<MissionLease> {
  return sql.begin(async (tx) => {
    const rows = await tx<MissionRunRow[]>`
      SELECT *
      FROM mission_runs
      WHERE id = ${runId}::uuid
      FOR UPDATE
    `;
    const run = rows[0];
    if (!run) {
      throw new MissionRuntimeError('MISSION_NOT_FOUND', `mission run not found: ${runId}`);
    }
    if (isTerminalStatus(run.status)) {
      throw new MissionRuntimeError(
        'MISSION_ALREADY_TERMINAL',
        `mission run ${runId} is already terminal (${run.status})`
      );
    }

    if (hasLiveLease(run)) {
      throw new MissionRuntimeError(
        'MISSION_LEASE_HELD',
        `mission run ${runId} is currently leased by ${run.lease_owner ?? '(unknown owner)'}`
      );
    }

    const leaseToken = runtimeToken();
    const updated = await tx<MissionRunRow[]>`
      UPDATE mission_runs
      SET
        status = 'running',
        lease_owner = ${owner},
        lease_token = ${leaseToken},
        lease_expires_at = now() + make_interval(secs => ${LEASE_TTL_SECONDS}),
        attempt_count = attempt_count + 1,
        started_at = COALESCE(started_at, now()),
        error_code = NULL,
        error_message = NULL,
        completed_at = NULL,
        updated_at = now()
      WHERE id = ${runId}::uuid
      RETURNING *
    `;
    const leased = updated[0];
    if (!leased) {
      throw new MissionRuntimeError(
        'MISSION_LEASE_FAILED',
        `failed to acquire lease for mission run ${runId}`
      );
    }

    const expiresAt = toDate(leased.lease_expires_at);
    if (!expiresAt || !leased.lease_token) {
      throw new MissionRuntimeError(
        'MISSION_LEASE_FAILED',
        `mission run ${runId} did not persist a valid lease`
      );
    }

    return {
      owner: leased.lease_owner ?? owner,
      token: leased.lease_token,
      expiresAtIso: expiresAt.toISOString(),
      attemptCount: leased.attempt_count,
    };
  });
}

async function assertLeaseStillOwned(
  tx: MissionSqlExecutor,
  runId: string,
  lease: MissionLease
): Promise<void> {
  const rows = await tx<MissionRunRow[]>`
    SELECT *
    FROM mission_runs
    WHERE id = ${runId}::uuid
    FOR UPDATE
  `;
  const run = rows[0];
  if (!run) {
    throw new MissionRuntimeError('MISSION_NOT_FOUND', `mission run not found: ${runId}`);
  }
  if (run.lease_token !== lease.token || run.lease_owner !== lease.owner) {
    throw new MissionRuntimeError(
      'MISSION_FENCE_VIOLATION',
      `mission run ${runId} fence violation: lease token mismatch`
    );
  }
  if (!hasLiveLease(run)) {
    throw new MissionRuntimeError(
      'MISSION_LEASE_EXPIRED',
      `mission run ${runId} lease expired before commit`
    );
  }
}

async function latestCommittedStageRuns(sql: Sql, runId: string): Promise<MissionStageRunRow[]> {
  const rows = await sql<MissionStageRunRow[]>`
    SELECT *
    FROM mission_stage_runs
    WHERE run_id = ${runId}::uuid
      AND status = 'committed'
    ORDER BY stage_index ASC, attempt DESC
  `;

  const latestByStage = new Map<number, MissionStageRunRow>();
  for (const row of rows) {
    if (!latestByStage.has(row.stage_index)) {
      latestByStage.set(row.stage_index, row);
    }
  }

  return [...latestByStage.values()].sort((left, right) => left.stage_index - right.stage_index);
}

async function findNextStage(
  sql: Sql,
  runId: string,
  compiledPlan: readonly CompiledMissionStage[]
): Promise<CompiledMissionStage | null> {
  const committed = await latestCommittedStageRuns(sql, runId);
  const committedIndexes = new Set(committed.map((row) => row.stage_index));
  for (const stage of compiledPlan) {
    if (!committedIndexes.has(stage.stageIndex)) {
      return stage;
    }
  }
  return null;
}

async function loadStageInput(
  sql: Sql,
  run: MissionRunRow,
  stage: CompiledMissionStage
): Promise<unknown> {
  if (stage.stageIndex === 0) {
    const args = MissionGoalArgsSchema.safeParse(run.args_json);
    if (args.success) return canonicalJsonValue(args.data);
    return canonicalJsonValue({ goal: run.goal ?? '', operator: 'holo' });
  }

  const rows = await sql<MissionStageRunRow[]>`
    SELECT *
    FROM mission_stage_runs
    WHERE run_id = ${run.id}::uuid
      AND stage_index = ${stage.stageIndex - 1}
      AND status = 'committed'
    ORDER BY attempt DESC
    LIMIT 1
  `;
  const previous = rows[0];
  if (!previous) {
    throw new MissionRuntimeError(
      'MISSION_PREVIOUS_STAGE_MISSING',
      `run ${run.id} is missing committed output for stage ${stage.stageIndex - 1}`
    );
  }

  return previous.output_json;
}

async function beginStageRun(
  sql: Sql,
  runId: string,
  stage: CompiledMissionStage,
  input: unknown,
  lease: MissionLease,
  runtime: PersistedMissionRuntime
): Promise<MissionStageRunRow> {
  return sql.begin(async (tx) => {
    await assertLeaseStillOwned(tx, runId, lease);

    const attemptRows = await tx<{ next_attempt: number }[]>`
      SELECT COALESCE(MAX(attempt), -1) + 1 AS next_attempt
      FROM mission_stage_runs
      WHERE run_id = ${runId}::uuid
        AND stage_index = ${stage.stageIndex}
    `;
    const nextAttempt = Number(attemptRows[0]?.next_attempt ?? 0);
    const pinnedRole = stage.boundRole ? runtime.roleResolution[stage.stageKey] : null;

    const rows = await tx<MissionStageRunRow[]>`
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
        error_code,
        error_message,
        committed_at
      )
      VALUES (
        ${runId}::uuid,
        ${stage.stageIndex},
        ${stage.stageKey},
        ${stage.stageKind},
        ${stage.executorRef},
        ${stage.inputSchemaRef},
        ${stage.inputSchemaVersion},
        ${stage.outputSchemaRef},
        ${stage.outputSchemaVersion},
        'running',
        ${nextAttempt},
        ${stage.checkpointKey},
        ${lease.token},
        ${tx.json(canonicalJsonValue(input) as never)},
        NULL,
        ${pinnedRole?.role ?? null},
        ${pinnedRole?.modelRevision ?? null},
        ${pinnedRole?.endpoint ?? null},
        NULL,
        NULL,
        NULL
      )
      RETURNING *
    `;

    const stageRun = rows[0];
    if (!stageRun) {
      throw new MissionRuntimeError(
        'MISSION_STAGE_RUN_CREATE_FAILED',
        `failed to create stage run for ${runId}/${stage.stageKey}`
      );
    }

    return stageRun;
  });
}

async function commitStageRun(
  sql: Sql,
  runId: string,
  stage: CompiledMissionStage,
  stageRun: MissionStageRunRow,
  output: unknown,
  lease: MissionLease
): Promise<void> {
  await sql.begin(async (tx) => {
    await assertLeaseStillOwned(tx, runId, lease);

    if (stage.checkpointKey) {
      await tx`
        INSERT INTO mission_checkpoints (
          run_id,
          stage_run_id,
          stage_index,
          checkpoint_key,
          checkpoint_json,
          provenance_json
        )
        VALUES (
          ${runId}::uuid,
          ${stageRun.id}::uuid,
          ${stage.stageIndex},
          ${stage.checkpointKey},
          ${tx.json(canonicalJsonValue(output) as never)},
          ${tx.json(
            canonicalJsonValue({
              stageIndex: stage.stageIndex,
              stageKey: stage.stageKey,
              stageKind: stage.stageKind,
              executorRef: stage.executorRef,
              fenceToken: lease.token,
              attempt: stageRun.attempt,
            }) as never
          )}
        )
        ON CONFLICT (run_id, stage_index, checkpoint_key) DO NOTHING
      `;
    }

    await tx`
      UPDATE mission_stage_runs
      SET
        status = 'committed',
        output_json = ${tx.json(canonicalJsonValue(output) as never)},
        committed_at = now(),
        error_code = NULL,
        error_message = NULL,
        updated_at = now()
      WHERE id = ${stageRun.id}::uuid
        AND run_id = ${runId}::uuid
        AND fence_token = ${lease.token}
    `;

    await tx`
      UPDATE mission_runs
      SET
        checkpoint_stage_index = ${stage.stageIndex},
        updated_at = now()
      WHERE id = ${runId}::uuid
        AND lease_token = ${lease.token}
    `;
  });
}

async function markStageRunFailure(
  sql: Sql,
  runId: string,
  stageRunId: string | null,
  lease: MissionLease,
  code: string,
  message: string,
  runStatus: 'failed' | 'blocked'
): Promise<void> {
  await sql.begin(async (tx) => {
    const run = await selectMissionRunById(tx, runId);
    if (!run) return;
    if (run.lease_token !== lease.token) return;

    if (stageRunId) {
      await tx`
        UPDATE mission_stage_runs
        SET
          status = ${runStatus === 'blocked' ? 'blocked' : 'failed'},
          error_code = ${code},
          error_message = ${message},
          updated_at = now()
        WHERE id = ${stageRunId}::uuid
      `;
    }

    await tx`
      UPDATE mission_runs
      SET
        status = ${runStatus},
        error_code = ${code},
        error_message = ${message},
        lease_owner = NULL,
        lease_token = NULL,
        lease_expires_at = NULL,
        updated_at = now()
      WHERE id = ${runId}::uuid
        AND lease_token = ${lease.token}
    `;
  });
}

async function latestCommittedOutput(sql: Sql, runId: string): Promise<unknown> {
  const rows = await sql<MissionStageRunRow[]>`
    SELECT *
    FROM mission_stage_runs
    WHERE run_id = ${runId}::uuid
      AND status = 'committed'
    ORDER BY stage_index DESC, attempt DESC
    LIMIT 1
  `;
  return rows[0]?.output_json ?? null;
}

async function finalizeRunWithoutCommit(
  sql: Sql,
  runId: string,
  lease: MissionLease
): Promise<void> {
  const output = await latestCommittedOutput(sql, runId);
  if (output == null) {
    throw new MissionRuntimeError(
      'MISSION_FINAL_OUTPUT_MISSING',
      `mission run ${runId} cannot finalize without a committed final stage output`
    );
  }

  await sql.begin(async (tx) => {
    await assertLeaseStillOwned(tx, runId, lease);
    await tx`
      UPDATE mission_runs
      SET
        status = 'completed',
        typed_output_json = ${tx.json(canonicalJsonValue(output) as never)},
        completed_at = now(),
        lease_owner = NULL,
        lease_token = NULL,
        lease_expires_at = NULL,
        error_code = NULL,
        error_message = NULL,
        updated_at = now()
      WHERE id = ${runId}::uuid
        AND lease_token = ${lease.token}
    `;
  });
}

async function executeRunWithLease(
  sql: Sql,
  runId: string,
  lease: MissionLease
): Promise<MissionRunRow> {
  const run = await selectMissionRunById(sql, runId);
  if (!run) {
    throw new MissionRuntimeError('MISSION_NOT_FOUND', `mission run not found: ${runId}`);
  }

  const runtime = parsePersistedRuntime(run);

  while (true) {
    const currentRun = await selectMissionRunById(sql, runId);
    if (!currentRun) {
      throw new MissionRuntimeError('MISSION_NOT_FOUND', `mission run not found: ${runId}`);
    }
    if (isTerminalStatus(currentRun.status)) {
      return currentRun;
    }

    const nextStage = await findNextStage(sql, runId, runtime.compiledPlan);
    if (!nextStage) {
      await finalizeRunWithoutCommit(sql, runId, lease);
      const finalized = await selectMissionRunById(sql, runId);
      if (!finalized) {
        throw new MissionRuntimeError('MISSION_NOT_FOUND', `mission run not found: ${runId}`);
      }
      return finalized;
    }

    const input = await loadStageInput(sql, currentRun, nextStage);
    parseMissionSchemaValue(
      {
        schemaRef: nextStage.inputSchemaRef,
        schemaVersion: nextStage.inputSchemaVersion,
      },
      input,
      `${nextStage.stageKey}.input`
    );

    const stageRun = await beginStageRun(sql, runId, nextStage, input, lease, runtime);
    const executor = assertRegisteredExecutorRuntime(nextStage.executorRef);

    try {
      const rawOutput = await executor(input, {
        run: currentRun,
        stage: nextStage,
        lease,
        runtime,
      });
      const output = parseMissionSchemaValue(
        {
          schemaRef: nextStage.outputSchemaRef,
          schemaVersion: nextStage.outputSchemaVersion,
        },
        rawOutput,
        `${nextStage.stageKey}.output`
      );
      await commitStageRun(sql, runId, nextStage, stageRun, output, lease);
      if (nextStage.checkpointKey) {
        await waitAtCheckpointBarrierIfRequested({
          runId,
          stageIndex: nextStage.stageIndex,
          checkpointKey: nextStage.checkpointKey,
          leaseToken: lease.token,
          leaseOwner: lease.owner,
        });
      }
    } catch (error) {
      const runtimeError =
        error instanceof MissionRuntimeError
          ? error
          : new MissionRuntimeError(
              'MISSION_STAGE_EXECUTION_FAILED',
              error instanceof Error ? error.message : String(error)
            );
      const runStatus = runtimeError.code.includes('BUDGET') ? 'blocked' : 'failed';
      await markStageRunFailure(
        sql,
        runId,
        stageRun.id,
        lease,
        runtimeError.code,
        runtimeError.message,
        runStatus
      );
      throw runtimeError;
    }
  }
}

async function runMissionInternal(
  templateKey: string,
  args: z.infer<typeof MissionGoalArgsSchema>,
  idempotencyKey: string,
  options?: { databaseUrl?: string }
): Promise<MissionStatusPayload> {
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'mission runtime',
  });
  const sql = createSql(databaseUrl);

  try {
    const templateVersion = await selectLatestTemplateVersion(sql, templateKey);
    if (!templateVersion) {
      throw new MissionRuntimeError(
        'MISSION_TEMPLATE_NOT_FOUND',
        `mission template not found: ${templateKey}`
      );
    }

    const created = await createMissionRun(sql, templateVersion, args, idempotencyKey);
    if (isTerminalStatus(created.run.status)) {
      return buildMissionPayload(created.run, { replay: !created.created });
    }

    const lease = await acquireRunLease(sql, created.run.id, runtimeOwner());
    try {
      const completed = await executeRunWithLease(sql, created.run.id, lease);
      return buildMissionPayload(completed, { replay: false });
    } catch (error) {
      const runtimeError =
        error instanceof MissionRuntimeError
          ? error
          : new MissionRuntimeError(
              'MISSION_RUNTIME_FAILED',
              error instanceof Error ? error.message : String(error)
            );
      const runStatus =
        runtimeError.code.includes('PINNED') || runtimeError.code.includes('SCHEMA')
          ? 'blocked'
          : 'failed';
      await markStageRunFailure(
        sql,
        created.run.id,
        null,
        lease,
        runtimeError.code,
        runtimeError.message,
        runStatus
      );
      throw runtimeError;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function resumeMissionInternal(
  runId: string,
  options?: { databaseUrl?: string }
): Promise<MissionStatusPayload> {
  if (!normalizeMissionRunId(runId)) {
    return missionNotFoundPayload(runId);
  }

  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'mission resume',
  });
  const sql = createSql(databaseUrl);

  try {
    const existing = await selectMissionRunById(sql, runId);
    if (!existing) {
      return missionNotFoundPayload(runId);
    }
    if (isTerminalStatus(existing.status)) {
      return buildMissionPayload(existing, { replay: true });
    }

    const lease = await acquireRunLease(sql, runId, runtimeOwner());
    try {
      const completed = await executeRunWithLease(sql, runId, lease);
      return buildMissionPayload(completed, { replay: false });
    } catch (error) {
      const runtimeError =
        error instanceof MissionRuntimeError
          ? error
          : new MissionRuntimeError(
              'MISSION_RUNTIME_FAILED',
              error instanceof Error ? error.message : String(error)
            );
      const runStatus =
        runtimeError.code.includes('PINNED') || runtimeError.code.includes('SCHEMA')
          ? 'blocked'
          : 'failed';
      await markStageRunFailure(
        sql,
        runId,
        null,
        lease,
        runtimeError.code,
        runtimeError.message,
        runStatus
      );
      throw runtimeError;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function runMissionTemplate(
  input: {
    templateKey: string;
    goal: string;
    idempotencyKey: string;
    operator?: string;
  },
  options?: { databaseUrl?: string }
): Promise<MissionStatusPayload> {
  const args = MissionGoalArgsSchema.parse(
    canonicalJsonValue({
      goal: input.goal,
      operator: input.operator ?? 'holo',
    })
  );
  return runMissionInternal(input.templateKey, args, input.idempotencyKey, options);
}

export async function resumeMissionRun(
  runId: string,
  options?: { databaseUrl?: string }
): Promise<MissionStatusPayload> {
  return resumeMissionInternal(runId, options);
}

export async function getMissionRunStatus(
  runId: string,
  options?: { databaseUrl?: string }
): Promise<MissionStatusPayload> {
  if (!normalizeMissionRunId(runId)) {
    return missionNotFoundPayload(runId);
  }

  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'mission status',
  });
  const sql = createSql(databaseUrl);

  try {
    const run = await selectMissionRunById(sql, runId);
    if (!run) return missionNotFoundPayload(runId);
    return buildMissionPayload(run, { replay: isTerminalStatus(run.status) });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
