import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAtColumn, idColumn, timestamptz, typedJsonb, updatedAtColumn } from '../columns';

export const missionTemplates = pgTable(
  'mission_templates',
  {
    templateKey: text('template_key').primaryKey().notNull(),
    latestVersion: text('latest_version').notNull(),
    latestDefinitionHash: text('latest_definition_hash').notNull(),
    description: text('description').notNull(),
    latestRegisteredAt: timestamptz('latest_registered_at').notNull().default(sql`now()`),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [index('mission_templates_latest_registered_at_idx').on(t.latestRegisteredAt)]
);

export const missionTemplateVersions = pgTable(
  'mission_template_versions',
  {
    id: idColumn(),
    templateKey: text('template_key')
      .notNull()
      .references(() => missionTemplates.templateKey, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    dslVersion: text('dsl_version').notNull(),
    description: text('description').notNull(),
    definitionHash: text('definition_hash').notNull(),
    definitionJson: typedJsonb('definition_json').notNull(),
    compiledPlanJson: typedJsonb('compiled_plan_json').notNull(),
    compilerVersion: text('compiler_version').notNull(),
    registrySnapshotHash: text('registry_snapshot_hash').notNull(),
    registrySnapshotJson: typedJsonb('registry_snapshot_json').notNull(),
    outputSchemaRef: text('output_schema_ref').notNull(),
    outputSchemaVersion: integer('output_schema_version').notNull(),
    executorRef: text('executor_ref').notNull(),
    schemaRef: text('schema_ref').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    budgetPolicyJson: typedJsonb('budget_policy_json').notNull(),
    noCloudFallback: boolean('no_cloud_fallback').notNull().default(true),
    fleetManifestVersion: text('fleet_manifest_version').notNull(),
    fleetManifestPath: text('fleet_manifest_path').notNull(),
    fleetManifestHash: text('fleet_manifest_hash').notNull(),
    fleetManifestJson: typedJsonb('fleet_manifest_json').notNull(),
    roleResolutionJson: typedJsonb('role_resolution_json').notNull(),
    modelRevisionsJson: typedJsonb('model_revisions_json').notNull(),
    createdAt: createdAtColumn(),
  },
  (t) => [
    uniqueIndex('mission_template_versions_template_version_uidx').on(t.templateKey, t.version),
    index('mission_template_versions_template_key_idx').on(t.templateKey),
    check(
      'mission_template_versions_output_schema_version_check',
      sql`${t.outputSchemaVersion} > 0`
    ),
    check('mission_template_versions_schema_version_check', sql`${t.schemaVersion} > 0`),
  ]
);

export const missionRuns = pgTable(
  'mission_runs',
  {
    id: idColumn(),
    templateKey: text('template_key').notNull(),
    templateVersion: text('template_version').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    ownerScope: text('owner_scope').notNull().default('runtime'),
    goal: text('goal'),
    argsJson: typedJsonb('args_json'),
    status: text('status').notNull().default('pending'),
    checkpointStageIndex: integer('checkpoint_stage_index'),
    leaseOwner: text('lease_owner'),
    leaseToken: text('lease_token'),
    leaseExpiresAt: timestamptz('lease_expires_at'),
    attemptCount: integer('attempt_count').notNull().default(0),
    traceId: text('trace_id'),
    definitionHash: text('definition_hash').notNull(),
    compilerVersion: text('compiler_version').notNull(),
    registrySnapshotHash: text('registry_snapshot_hash').notNull(),
    outputSchemaRef: text('output_schema_ref').notNull(),
    outputSchemaVersion: integer('output_schema_version').notNull(),
    executorRef: text('executor_ref').notNull(),
    schemaRef: text('schema_ref').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    compiledPlanJson: typedJsonb('compiled_plan_json').notNull(),
    budgetPolicyJson: typedJsonb('budget_policy_json').notNull(),
    usageJson: typedJsonb('usage_json'),
    typedOutputJson: typedJsonb('typed_output_json'),
    noCloudFallback: boolean('no_cloud_fallback').notNull().default(true),
    fleetManifestVersion: text('fleet_manifest_version').notNull(),
    fleetManifestPath: text('fleet_manifest_path').notNull(),
    fleetManifestHash: text('fleet_manifest_hash').notNull(),
    fleetManifestJson: typedJsonb('fleet_manifest_json').notNull(),
    roleResolutionJson: typedJsonb('role_resolution_json').notNull(),
    modelRevisionsJson: typedJsonb('model_revisions_json').notNull(),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    /** Denormalized research metrics (pipes-1 evidence-research). */
    componentsCovered: integer('components_covered'),
    independentSourceCount: integer('independent_source_count'),
    admittedEvidenceIds: typedJsonb('admitted_evidence_ids'),
    executorVersion: text('executor_version'),
    /** pipes-3: sub-workflow template keys invoked during this run. */
    subworkflowCalls: typedJsonb('subworkflow_calls'),
    /** pipes-3: published document id (standing subscriptions publish). */
    documentId: text('document_id'),
    startedAt: timestamptz('started_at'),
    completedAt: timestamptz('completed_at'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [
    uniqueIndex('mission_runs_template_idempotency_uidx').on(t.templateKey, t.idempotencyKey),
    uniqueIndex('mission_runs_active_subject_wip_one_uidx')
      .on(t.templateKey, t.goal)
      .where(sql`${t.status} IN ('pending', 'running', 'suspended') AND ${t.goal} IS NOT NULL`),
    index('mission_runs_status_idx').on(t.status),
    index('mission_runs_template_key_idx').on(t.templateKey),
    index('mission_runs_trace_id_idx').on(t.traceId),
    check(
      'mission_runs_checkpoint_stage_index_nonneg',
      sql`${t.checkpointStageIndex} IS NULL OR ${t.checkpointStageIndex} >= 0`
    ),
    check('mission_runs_attempt_count_nonneg', sql`${t.attemptCount} >= 0`),
    check('mission_runs_owner_scope_check', sql`${t.ownerScope} IN ('rn', 'runtime')`),
    check('mission_runs_output_schema_version_check', sql`${t.outputSchemaVersion} > 0`),
    check('mission_runs_schema_version_check', sql`${t.schemaVersion} > 0`),
    check(
      'mission_runs_status_check',
      sql`${t.status} IN ('pending', 'running', 'suspended', 'completed', 'failed', 'blocked', 'budget_exceeded')`
    ),
    check(
      'mission_runs_components_covered_nonneg',
      sql`${t.componentsCovered} IS NULL OR ${t.componentsCovered} >= 0`
    ),
    check(
      'mission_runs_independent_source_count_nonneg',
      sql`${t.independentSourceCount} IS NULL OR ${t.independentSourceCount} >= 0`
    ),
  ]
);

/** Operator-facing pipeline aliases attached to a shared template run (research/deepResearch/…). */
export const missionRunTags = pgTable(
  'mission_run_tags',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => missionRuns.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
    createdAt: createdAtColumn(),
  },
  (t) => [
    uniqueIndex('mission_run_tags_run_tag_uidx').on(t.runId, t.tag),
    index('mission_run_tags_tag_idx').on(t.tag),
  ]
);

export const missionStageRuns = pgTable(
  'mission_stage_runs',
  {
    id: idColumn(),
    runId: uuid('run_id')
      .notNull()
      .references(() => missionRuns.id, { onDelete: 'cascade' }),
    stageIndex: integer('stage_index').notNull(),
    stageKey: text('stage_key').notNull(),
    stageKind: text('stage_kind').notNull(),
    executorRef: text('executor_ref').notNull(),
    inputSchemaRef: text('input_schema_ref').notNull(),
    inputSchemaVersion: integer('input_schema_version').notNull(),
    outputSchemaRef: text('output_schema_ref').notNull(),
    outputSchemaVersion: integer('output_schema_version').notNull(),
    status: text('status').notNull().default('pending'),
    attempt: integer('attempt').notNull().default(0),
    checkpointKey: text('checkpoint_key'),
    fenceToken: text('fence_token'),
    inputJson: typedJsonb('input_json'),
    outputJson: typedJsonb('output_json'),
    role: text('role'),
    modelRevision: text('model_revision'),
    endpoint: text('endpoint'),
    traceId: text('trace_id'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    committedAt: timestamptz('committed_at'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [
    uniqueIndex('mission_stage_runs_run_stage_attempt_uidx').on(t.runId, t.stageIndex, t.attempt),
    index('mission_stage_runs_run_stage_idx').on(t.runId, t.stageIndex),
    check('mission_stage_runs_stage_index_nonneg', sql`${t.stageIndex} >= 0`),
    check('mission_stage_runs_attempt_nonneg', sql`${t.attempt} >= 0`),
    check('mission_stage_runs_input_schema_version_check', sql`${t.inputSchemaVersion} > 0`),
    check('mission_stage_runs_output_schema_version_check', sql`${t.outputSchemaVersion} > 0`),
    check(
      'mission_stage_runs_status_check',
      sql`${t.status} IN ('pending', 'running', 'committed', 'failed', 'blocked')`
    ),
  ]
);

export const missionCheckpoints = pgTable(
  'mission_checkpoints',
  {
    id: idColumn(),
    runId: uuid('run_id')
      .notNull()
      .references(() => missionRuns.id, { onDelete: 'cascade' }),
    stageRunId: uuid('stage_run_id').references(() => missionStageRuns.id, { onDelete: 'cascade' }),
    stageIndex: integer('stage_index').notNull(),
    checkpointKey: text('checkpoint_key').notNull(),
    checkpointJson: typedJsonb('checkpoint_json').notNull(),
    provenanceJson: typedJsonb('provenance_json'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    uniqueIndex('mission_checkpoints_run_stage_checkpoint_uidx').on(
      t.runId,
      t.stageIndex,
      t.checkpointKey
    ),
    index('mission_checkpoints_run_idx').on(t.runId),
    check('mission_checkpoints_stage_index_nonneg', sql`${t.stageIndex} >= 0`),
  ]
);

export const missionCommits = pgTable(
  'mission_commits',
  {
    id: idColumn(),
    runId: uuid('run_id')
      .notNull()
      .references(() => missionRuns.id, { onDelete: 'cascade' }),
    commitName: text('commit_name').notNull(),
    outputSchemaRef: text('output_schema_ref').notNull(),
    outputSchemaVersion: integer('output_schema_version').notNull(),
    schemaRef: text('schema_ref').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    executorRef: text('executor_ref').notNull(),
    definitionHash: text('definition_hash').notNull(),
    compilerVersion: text('compiler_version').notNull(),
    registrySnapshotHash: text('registry_snapshot_hash').notNull(),
    typedOutputJson: typedJsonb('typed_output_json').notNull(),
    usageJson: typedJsonb('usage_json'),
    noCloudFallback: boolean('no_cloud_fallback').notNull().default(true),
    fleetManifestVersion: text('fleet_manifest_version').notNull(),
    fleetManifestPath: text('fleet_manifest_path').notNull(),
    fleetManifestHash: text('fleet_manifest_hash').notNull(),
    roleResolutionJson: typedJsonb('role_resolution_json').notNull(),
    modelRevisionsJson: typedJsonb('model_revisions_json').notNull(),
    checkpointId: uuid('checkpoint_id').references(() => missionCheckpoints.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAtColumn(),
  },
  (t) => [
    uniqueIndex('mission_commits_run_uidx').on(t.runId),
    index('mission_commits_created_at_idx').on(t.createdAt),
    check('mission_commits_output_schema_version_check', sql`${t.outputSchemaVersion} > 0`),
    check('mission_commits_schema_version_check', sql`${t.schemaVersion} > 0`),
  ]
);

export const missionEvents = pgTable(
  'mission_events',
  {
    id: idColumn(),
    runId: uuid('run_id')
      .notNull()
      .references(() => missionRuns.id, { onDelete: 'cascade' }),
    eventIndex: integer('event_index').notNull(),
    eventType: text('event_type').notNull(),
    stageIndex: integer('stage_index'),
    checkpointKey: text('checkpoint_key'),
    payloadJson: typedJsonb('payload_json'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    uniqueIndex('mission_events_run_event_idx_uidx').on(t.runId, t.eventIndex),
    index('mission_events_run_event_type_idx').on(t.runId, t.eventType),
    check('mission_events_event_index_nonneg', sql`${t.eventIndex} >= 0`),
  ]
);

export const missionSteering = pgTable(
  'mission_steering',
  {
    id: idColumn(),
    runId: uuid('run_id')
      .notNull()
      .references(() => missionRuns.id, { onDelete: 'cascade' }),
    actor: text('actor'),
    requestKey: text('request_key').notNull(),
    instruction: text('instruction'),
    payloadJson: typedJsonb('payload_json'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    uniqueIndex('mission_steering_run_request_key_uidx').on(t.runId, t.requestKey),
    index('mission_steering_run_idx').on(t.runId),
  ]
);

export const missionVerdicts = pgTable(
  'mission_verdicts',
  {
    id: idColumn(),
    runId: uuid('run_id')
      .notNull()
      .references(() => missionRuns.id, { onDelete: 'cascade' }),
    actor: text('actor'),
    requestKey: text('request_key').notNull(),
    verdict: text('verdict').notNull(),
    rationale: text('rationale'),
    payloadJson: typedJsonb('payload_json'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    uniqueIndex('mission_verdicts_run_request_key_uidx').on(t.runId, t.requestKey),
    index('mission_verdicts_run_idx').on(t.runId),
  ]
);

/** Persisted HTTP rejection replay records; never a substitute for a verdict/event row. */
export const missionVerdictRejections = pgTable(
  'mission_verdict_rejections',
  {
    id: idColumn(),
    runId: uuid('run_id')
      .notNull()
      .references(() => missionRuns.id, { onDelete: 'cascade' }),
    requestKey: text('request_key').notNull(),
    payloadJson: typedJsonb('payload_json').notNull(),
    errorCode: text('error_code').notNull(),
    errorMessage: text('error_message').notNull(),
    createdAt: createdAtColumn(),
  },
  (t) => [
    uniqueIndex('mission_verdict_rejections_run_request_key_uidx').on(t.runId, t.requestKey),
    index('mission_verdict_rejections_run_idx').on(t.runId),
  ]
);

export type MissionTemplateRow = typeof missionTemplates.$inferSelect;
export type MissionTemplateVersionRow = typeof missionTemplateVersions.$inferSelect;
export type MissionRunRow = typeof missionRuns.$inferSelect;
export type MissionStageRunRow = typeof missionStageRuns.$inferSelect;
export type MissionCheckpointRow = typeof missionCheckpoints.$inferSelect;
export type MissionCommitRow = typeof missionCommits.$inferSelect;
export type MissionEventRow = typeof missionEvents.$inferSelect;
export type MissionSteeringRow = typeof missionSteering.$inferSelect;
export type MissionVerdictRow = typeof missionVerdicts.$inferSelect;
export type MissionVerdictRejectionRow = typeof missionVerdictRejections.$inferSelect;
