import { createSql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { canonicalJsonString, canonicalJsonValue } from './canonical-json.ts';
import {
  type CompiledMissionTemplate,
  compileMissionTemplateDefinition,
  compileMissionTemplateFile,
} from './compiler.ts';
import { MISSION_TEMPLATE_DSL_VERSION } from './contract.ts';

export type MissionTemplateRegistrationResult = {
  ok: true;
  created: boolean;
  templateKey: string;
  version: string;
  dslVersion: string;
  definitionHash: string;
  compilerVersion: string;
  registrySnapshotHash: string;
  outputSchemaRef: string;
  outputSchemaVersion: number;
  executorRef: string;
  schemaRef: string;
  schemaVersion: number;
  fleetManifestVersion: string;
  fleetManifestPath: string;
  fleetManifestHash: string;
  noCloudFallback: boolean;
};

type SqlExecutor = {
  unsafe<T>(query: string, params?: readonly unknown[]): Promise<T>;
};

type ExistingVersionRow = {
  template_key: string;
  version: string;
  dsl_version: string;
  description: string;
  definition_hash: string;
  definition_json: unknown;
  compiled_plan_json: unknown;
  compiler_version: string;
  registry_snapshot_hash: string;
  registry_snapshot_json: unknown;
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

type MissionTemplateImmutableSurface = {
  dslVersion: string;
  definitionHash: string;
  definition: unknown;
  compiledPlan: unknown;
  compilerVersion: string;
  registrySnapshotHash: string;
  registrySnapshot: unknown;
  outputSchemaRef: string;
  outputSchemaVersion: number;
  executorRef: string;
  schemaRef: string;
  schemaVersion: number;
  budgetPolicy: unknown;
  noCloudFallback: boolean;
  fleetManifestVersion: string;
  fleetManifestPath: string;
  fleetManifestHash: string;
  fleetManifest: unknown;
  roleResolution: unknown;
  modelRevisions: unknown;
};

const VERSION_ROW_COLUMNS = `
  template_key,
  version,
  dsl_version,
  description,
  definition_hash,
  definition_json,
  compiled_plan_json,
  compiler_version,
  registry_snapshot_hash,
  registry_snapshot_json,
  output_schema_ref,
  output_schema_version,
  executor_ref,
  schema_ref,
  schema_version,
  budget_policy_json,
  no_cloud_fallback,
  fleet_manifest_version,
  fleet_manifest_path,
  fleet_manifest_hash,
  fleet_manifest_json,
  role_resolution_json,
  model_revisions_json
`;

const IMMUTABLE_SURFACE_FIELDS: ReadonlyArray<{
  label: string;
  read: (surface: MissionTemplateImmutableSurface) => unknown;
}> = [
  { label: 'dsl_version', read: (surface) => surface.dslVersion },
  { label: 'definition_hash', read: (surface) => surface.definitionHash },
  { label: 'definition_json', read: (surface) => surface.definition },
  { label: 'compiled_plan_json', read: (surface) => surface.compiledPlan },
  { label: 'compiler_version', read: (surface) => surface.compilerVersion },
  { label: 'registry_snapshot_hash', read: (surface) => surface.registrySnapshotHash },
  { label: 'registry_snapshot_json', read: (surface) => surface.registrySnapshot },
  { label: 'output_schema_ref', read: (surface) => surface.outputSchemaRef },
  { label: 'output_schema_version', read: (surface) => surface.outputSchemaVersion },
  { label: 'executor_ref', read: (surface) => surface.executorRef },
  { label: 'schema_ref', read: (surface) => surface.schemaRef },
  { label: 'schema_version', read: (surface) => surface.schemaVersion },
  { label: 'budget_policy_json', read: (surface) => surface.budgetPolicy },
  { label: 'no_cloud_fallback', read: (surface) => surface.noCloudFallback },
  { label: 'fleet_manifest_version', read: (surface) => surface.fleetManifestVersion },
  { label: 'fleet_manifest_path', read: (surface) => surface.fleetManifestPath },
  { label: 'fleet_manifest_hash', read: (surface) => surface.fleetManifestHash },
  { label: 'fleet_manifest_json', read: (surface) => surface.fleetManifest },
  { label: 'role_resolution_json', read: (surface) => surface.roleResolution },
  { label: 'model_revisions_json', read: (surface) => surface.modelRevisions },
];

function immutableSurfaceFromCompiled(
  compiled: CompiledMissionTemplate
): MissionTemplateImmutableSurface {
  return canonicalJsonValue({
    dslVersion: compiled.dslVersion,
    definitionHash: compiled.definitionHash,
    definition: compiled.definition,
    compiledPlan: compiled.compiledStages,
    compilerVersion: compiled.compilerVersion,
    registrySnapshotHash: compiled.registrySnapshotHash,
    registrySnapshot: compiled.registrySnapshot,
    outputSchemaRef: compiled.outputSchemaRef,
    outputSchemaVersion: compiled.outputSchemaVersion,
    executorRef: compiled.executorRef,
    schemaRef: compiled.schemaRef,
    schemaVersion: compiled.schemaVersion,
    budgetPolicy: compiled.budgetPolicy,
    noCloudFallback: compiled.noCloudFallback,
    fleetManifestVersion: compiled.fleetManifestVersion,
    fleetManifestPath: compiled.fleetManifestPath,
    fleetManifestHash: compiled.fleetManifestHash,
    fleetManifest: compiled.fleetManifest,
    roleResolution: compiled.roleResolution,
    modelRevisions: compiled.modelRevisions,
  });
}

function immutableSurfaceFromRow(row: ExistingVersionRow): MissionTemplateImmutableSurface {
  return canonicalJsonValue({
    dslVersion: row.dsl_version,
    definitionHash: row.definition_hash,
    definition: row.definition_json,
    compiledPlan: row.compiled_plan_json,
    compilerVersion: row.compiler_version,
    registrySnapshotHash: row.registry_snapshot_hash,
    registrySnapshot: row.registry_snapshot_json,
    outputSchemaRef: row.output_schema_ref,
    outputSchemaVersion: row.output_schema_version,
    executorRef: row.executor_ref,
    schemaRef: row.schema_ref,
    schemaVersion: row.schema_version,
    budgetPolicy: row.budget_policy_json,
    noCloudFallback: row.no_cloud_fallback,
    fleetManifestVersion: row.fleet_manifest_version,
    fleetManifestPath: row.fleet_manifest_path,
    fleetManifestHash: row.fleet_manifest_hash,
    fleetManifest: row.fleet_manifest_json,
    roleResolution: row.role_resolution_json,
    modelRevisions: row.model_revisions_json,
  });
}

function immutableSurfaceDriftFields(
  row: ExistingVersionRow,
  compiled: CompiledMissionTemplate
): string[] {
  const existing = immutableSurfaceFromRow(row);
  const incoming = immutableSurfaceFromCompiled(compiled);

  return IMMUTABLE_SURFACE_FIELDS.filter(
    ({ read }) => canonicalJsonString(read(existing)) !== canonicalJsonString(read(incoming))
  ).map(({ label }) => label);
}

function toRegistrationResult(
  row: ExistingVersionRow,
  created: boolean
): MissionTemplateRegistrationResult {
  return canonicalJsonValue({
    ok: true,
    created,
    templateKey: row.template_key,
    version: row.version,
    dslVersion: row.dsl_version,
    definitionHash: row.definition_hash,
    compilerVersion: row.compiler_version,
    registrySnapshotHash: row.registry_snapshot_hash,
    outputSchemaRef: row.output_schema_ref,
    outputSchemaVersion: row.output_schema_version,
    executorRef: row.executor_ref,
    schemaRef: row.schema_ref,
    schemaVersion: row.schema_version,
    fleetManifestVersion: row.fleet_manifest_version,
    fleetManifestPath: row.fleet_manifest_path,
    fleetManifestHash: row.fleet_manifest_hash,
    noCloudFallback: row.no_cloud_fallback,
  });
}

async function selectExistingVersion(
  sql: SqlExecutor,
  templateKey: string,
  version: string
): Promise<ExistingVersionRow | null> {
  const rows = await sql.unsafe<Array<ExistingVersionRow>>(
    `
      SELECT
        ${VERSION_ROW_COLUMNS}
      FROM mission_template_versions
      WHERE template_key = $1 AND version = $2
      LIMIT 1
    `,
    [templateKey, version]
  );
  return rows[0] ?? null;
}

async function ensureMissionTemplate(
  sql: SqlExecutor,
  compiled: CompiledMissionTemplate
): Promise<void> {
  const { definition } = compiled;
  await sql.unsafe(
    `
      INSERT INTO mission_templates (
        template_key,
        latest_version,
        latest_definition_hash,
        description,
        latest_registered_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, now(), now(), now())
      ON CONFLICT (template_key) DO NOTHING
    `,
    [definition.templateKey, definition.version, compiled.definitionHash, definition.description]
  );
}

async function updateMissionTemplateLatest(
  sql: SqlExecutor,
  compiled: CompiledMissionTemplate
): Promise<void> {
  const { definition } = compiled;
  await sql.unsafe(
    `
      UPDATE mission_templates
      SET
        latest_version = $2,
        latest_definition_hash = $3,
        description = $4,
        latest_registered_at = now(),
        updated_at = now()
      WHERE template_key = $1
    `,
    [definition.templateKey, definition.version, compiled.definitionHash, definition.description]
  );
}

async function insertMissionTemplateVersion(
  sql: SqlExecutor,
  compiled: CompiledMissionTemplate
): Promise<ExistingVersionRow | null> {
  const { definition } = compiled;
  const rows = await sql.unsafe<Array<ExistingVersionRow>>(
    `
      INSERT INTO mission_template_versions (
        template_key,
        version,
        dsl_version,
        description,
        definition_hash,
        definition_json,
        compiled_plan_json,
        compiler_version,
        registry_snapshot_hash,
        registry_snapshot_json,
        output_schema_ref,
        output_schema_version,
        executor_ref,
        schema_ref,
        schema_version,
        budget_policy_json,
        no_cloud_fallback,
        fleet_manifest_version,
        fleet_manifest_path,
        fleet_manifest_hash,
        fleet_manifest_json,
        role_resolution_json,
        model_revisions_json,
        created_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6::jsonb,
        $7::jsonb,
        $8,
        $9,
        $10::jsonb,
        $11,
        $12,
        $13,
        $14,
        $15,
        $16::jsonb,
        $17,
        $18,
        $19,
        $20,
        $21::jsonb,
        $22::jsonb,
        $23::jsonb,
        now()
      )
      ON CONFLICT (template_key, version) DO NOTHING
      RETURNING
        ${VERSION_ROW_COLUMNS}
    `,
    [
      definition.templateKey,
      definition.version,
      compiled.dslVersion,
      definition.description,
      compiled.definitionHash,
      compiled.definition,
      compiled.compiledStages,
      compiled.compilerVersion,
      compiled.registrySnapshotHash,
      compiled.registrySnapshot,
      compiled.outputSchemaRef,
      compiled.outputSchemaVersion,
      compiled.executorRef,
      compiled.schemaRef,
      compiled.schemaVersion,
      compiled.budgetPolicy,
      compiled.noCloudFallback,
      compiled.fleetManifestVersion,
      compiled.fleetManifestPath,
      compiled.fleetManifestHash,
      compiled.fleetManifest,
      compiled.roleResolution,
      compiled.modelRevisions,
    ]
  );
  return rows[0] ?? null;
}

export async function registerCompiledMissionTemplate(
  compiled: CompiledMissionTemplate,
  options?: { databaseUrl?: string }
): Promise<MissionTemplateRegistrationResult> {
  if (compiled.dslVersion !== MISSION_TEMPLATE_DSL_VERSION) {
    throw new Error(
      `unsupported mission template DSL version ${compiled.dslVersion}; expected ${MISSION_TEMPLATE_DSL_VERSION}`
    );
  }

  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'mission template registration',
  });
  const sql = createSql(databaseUrl);

  try {
    return await sql.begin(async (tx) => {
      const executor = tx as unknown as SqlExecutor;
      await ensureMissionTemplate(executor, compiled);

      const inserted = await insertMissionTemplateVersion(executor, compiled);
      if (inserted) {
        await updateMissionTemplateLatest(executor, compiled);
        return toRegistrationResult(inserted, true);
      }

      const existing = await selectExistingVersion(
        executor,
        compiled.definition.templateKey,
        compiled.definition.version
      );
      if (!existing) {
        throw new Error(
          `mission template registration lost authoritative row for ${compiled.definition.templateKey}@${compiled.definition.version}`
        );
      }

      const driftFields = immutableSurfaceDriftFields(existing, compiled);
      if (driftFields.length > 0) {
        throw new Error(
          `immutable mission template conflict for ${compiled.definition.templateKey}@${compiled.definition.version}: persisted row drifted from this compile on ${driftFields.join(', ')}`
        );
      }

      return toRegistrationResult(existing, false);
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function registerMissionTemplateFile(
  path: string,
  options?: { databaseUrl?: string }
): Promise<MissionTemplateRegistrationResult> {
  const compiled = await compileMissionTemplateFile(path);
  return registerCompiledMissionTemplate(compiled, options);
}

export async function registerMissionTemplateDefinition(
  raw: unknown,
  options?: { databaseUrl?: string }
): Promise<MissionTemplateRegistrationResult> {
  const compiled = await compileMissionTemplateDefinition(raw);
  return registerCompiledMissionTemplate(compiled, options);
}
