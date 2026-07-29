import { readFileSync } from 'node:fs';
import { defaultManifestPath, loadFleetManifest } from '../fleet/manifest.ts';
import { resolveModel } from '../inference/resolve-model.ts';
import { canonicalJsonValue, sha256Hex } from './canonical-json.ts';
import {
  MISSION_TEMPLATE_DSL_VERSION,
  type MissionSchemaRef,
  type MissionTemplateDefinition,
  parseMissionTemplateDefinition,
} from './contract.ts';
import {
  assertNoUnsupportedToolGrants,
  assertRegisteredExecutor,
  assertRegisteredSchema,
  assertRegisteredStage,
  assertUniqueStageIds,
  MISSION_COMPILER_VERSION,
  missionRegistrySnapshotHash,
  snapshotMissionRegistry,
} from './registry.ts';

export type MissionResolvedRole = {
  stageId: string;
  role: string;
  endpoint: string;
  litellmModelId: string;
  modelRevision: string;
  provider: string;
  allowEscape: boolean;
  fleetManifestVersion: string;
};

export type CompiledMissionStage = {
  stageIndex: number;
  stageKey: string;
  stageKind: string;
  executorRef: string;
  inputSchemaRef: string;
  inputSchemaVersion: number;
  outputSchemaRef: string;
  outputSchemaVersion: number;
  checkpointKey: string | null;
  boundRole: string | null;
};

export type CompiledMissionTemplate = {
  dslVersion: typeof MISSION_TEMPLATE_DSL_VERSION;
  definition: MissionTemplateDefinition;
  definitionHash: string;
  compilerVersion: string;
  registrySnapshotHash: string;
  registrySnapshot: ReturnType<typeof snapshotMissionRegistry>;
  compiledStages: CompiledMissionStage[];
  outputSchemaRef: string;
  outputSchemaVersion: number;
  executorRef: string;
  schemaRef: string;
  schemaVersion: number;
  budgetPolicy: MissionTemplateDefinition['budgets'];
  noCloudFallback: true;
  fleetManifestPath: string;
  fleetManifestVersion: string;
  fleetManifestHash: string;
  fleetManifest: unknown;
  roleResolution: Record<string, MissionResolvedRole>;
  modelRevisions: Record<string, string>;
};

function sameSchema(left: MissionSchemaRef, right: MissionSchemaRef): boolean {
  return left.schemaRef === right.schemaRef && left.schemaVersion === right.schemaVersion;
}

function readTemplateFile(path: string): unknown {
  const text = readFileSync(path, 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`mission template file is not valid JSON: ${message}`);
  }
}

function assertLinearStageSchemas(definition: MissionTemplateDefinition): void {
  for (let index = 1; index < definition.stageGraph.length; index += 1) {
    const previous = definition.stageGraph[index - 1];
    const current = definition.stageGraph[index];
    if (!previous || !current) continue;
    if (!sameSchema(previous.outputSchema, current.inputSchema)) {
      throw new Error(
        `linear mission stage schema mismatch: ${previous.id} outputs ${previous.outputSchema.schemaRef}@${previous.outputSchema.schemaVersion} but ${current.id} expects ${current.inputSchema.schemaRef}@${current.inputSchema.schemaVersion}`
      );
    }
  }
}

function assertOutputContractMatches(definition: MissionTemplateDefinition): void {
  const lastStage = definition.stageGraph[definition.stageGraph.length - 1];
  if (!lastStage) {
    throw new Error('mission template must declare at least one stage');
  }

  if (!sameSchema(lastStage.outputSchema, definition.outputContract)) {
    throw new Error(
      `mission output contract mismatch: final stage outputs ${lastStage.outputSchema.schemaRef}@${lastStage.outputSchema.schemaVersion} but outputContract expects ${definition.outputContract.schemaRef}@${definition.outputContract.schemaVersion}`
    );
  }
}

function assertRoleBindingsOnlyReferenceKnownStages(definition: MissionTemplateDefinition): void {
  const knownStageIds = new Set(definition.stageGraph.map((stage) => stage.id));
  for (const stageId of Object.keys(definition.modelRoleBindings)) {
    if (!knownStageIds.has(stageId)) {
      throw new Error(`modelRoleBindings references unknown stage id: ${stageId}`);
    }
  }
}

export async function compileMissionTemplateFile(path: string): Promise<CompiledMissionTemplate> {
  return compileMissionTemplateDefinition(readTemplateFile(path));
}

export async function compileMissionTemplateDefinition(
  raw: unknown
): Promise<CompiledMissionTemplate> {
  const definition = parseMissionTemplateDefinition(raw);
  assertNoUnsupportedToolGrants(definition);
  assertUniqueStageIds(definition.stageGraph);
  assertRoleBindingsOnlyReferenceKnownStages(definition);
  assertLinearStageSchemas(definition);
  assertOutputContractMatches(definition);
  assertRegisteredSchema(definition.outputContract);

  const manifestPath = defaultManifestPath();
  const manifest = loadFleetManifest(manifestPath);
  const manifestVersion = manifest.schemaVersion;
  const manifestHash = sha256Hex(manifest);
  const registrySnapshot = snapshotMissionRegistry();
  const registrySnapshotHash = missionRegistrySnapshotHash();
  const roleResolution: Record<string, MissionResolvedRole> = {};
  const modelRevisions: Record<string, string> = {};
  const compiledStages: CompiledMissionStage[] = [];
  const resolvedRolesByName = new Map<string, Awaited<ReturnType<typeof resolveModel>>>();

  for (const [stageIndex, stage] of definition.stageGraph.entries()) {
    const registeredStage = assertRegisteredStage(stage.stageKind);
    const registeredExecutor = assertRegisteredExecutor(stage.executorRef);
    assertRegisteredSchema(stage.inputSchema);
    assertRegisteredSchema(stage.outputSchema);

    if (registeredExecutor.stageKind !== registeredStage.stageKind) {
      throw new Error(
        `executor ${stage.executorRef} is not registered for stage ${stage.stageKind}`
      );
    }

    if (registeredStage.executorRef !== stage.executorRef) {
      throw new Error(
        `stage ${stage.id} must use executor ${registeredStage.executorRef}, received ${stage.executorRef}`
      );
    }

    if (!sameSchema(registeredStage.inputSchema, stage.inputSchema)) {
      throw new Error(
        `stage ${stage.id} input schema mismatch: expected ${registeredStage.inputSchema.schemaRef}@${registeredStage.inputSchema.schemaVersion} but received ${stage.inputSchema.schemaRef}@${stage.inputSchema.schemaVersion}`
      );
    }

    if (!sameSchema(registeredStage.outputSchema, stage.outputSchema)) {
      throw new Error(
        `stage ${stage.id} output schema mismatch: expected ${registeredStage.outputSchema.schemaRef}@${registeredStage.outputSchema.schemaVersion} but received ${stage.outputSchema.schemaRef}@${stage.outputSchema.schemaVersion}`
      );
    }

    if (stage.checkpointKey && !registeredStage.checkpointAllowed) {
      throw new Error(`stage ${stage.id} does not allow checkpointKey`);
    }

    const boundRole = definition.modelRoleBindings[stage.id] ?? null;
    if (registeredStage.roleBinding === 'required' && !boundRole) {
      throw new Error(`stage ${stage.id} requires a model role binding`);
    }
    if (registeredStage.roleBinding === 'forbidden' && boundRole) {
      throw new Error(`stage ${stage.id} does not accept a model role binding`);
    }

    if (boundRole) {
      let resolvedRole = resolvedRolesByName.get(boundRole);
      if (!resolvedRole) {
        resolvedRole = await resolveModel(boundRole, {
          allowEscape: false,
          manifest,
          manifestPath,
        });
        resolvedRolesByName.set(boundRole, resolvedRole);
      }

      roleResolution[stage.id] = {
        stageId: stage.id,
        role: resolvedRole.role,
        endpoint: resolvedRole.endpoint,
        litellmModelId: resolvedRole.litellmModelId,
        modelRevision: resolvedRole.modelRevision,
        provider: resolvedRole.provider,
        allowEscape: resolvedRole.allowEscape,
        fleetManifestVersion: manifestVersion,
      };
      modelRevisions[stage.id] = resolvedRole.modelRevision;
    }

    compiledStages.push({
      stageIndex,
      stageKey: stage.id,
      stageKind: stage.stageKind,
      executorRef: stage.executorRef,
      inputSchemaRef: stage.inputSchema.schemaRef,
      inputSchemaVersion: stage.inputSchema.schemaVersion,
      outputSchemaRef: stage.outputSchema.schemaRef,
      outputSchemaVersion: stage.outputSchema.schemaVersion,
      checkpointKey: stage.checkpointKey ?? null,
      boundRole,
    });
  }

  if (Object.keys(roleResolution).length === 0) {
    // Ops/periodic missions (e.g. fire-drill-monthly) may declare only roleBinding:forbidden
    // stages and carry schedule/steps in definition_json without fleet model roles.
    const requiresModelRole = definition.stageGraph.some((stage) => {
      return assertRegisteredStage(stage.stageKind).roleBinding === 'required';
    });
    if (requiresModelRole) {
      throw new Error(
        'mission template must resolve at least one real model role through resolveModel(role)'
      );
    }
  }

  const definitionHash = sha256Hex(definition);
  const terminalStage = compiledStages[compiledStages.length - 1];
  if (!terminalStage) {
    throw new Error('mission template must declare at least one compiled stage');
  }

  // Evidence-research core: surface the pure-TS gate as the template's primary
  // executor identity (AC: executor_ref = 'evidence-gate'), not the terminal commit.
  const primaryExecutorStage =
    compiledStages.find(
      (stage) =>
        stage.executorRef === 'evidence-gate' ||
        stage.executorRef === 'builtin.research-gate@1' ||
        stage.stageKind === 'research.gate@1'
    ) ?? terminalStage;

  return canonicalJsonValue({
    dslVersion: MISSION_TEMPLATE_DSL_VERSION,
    definition,
    definitionHash,
    compilerVersion: MISSION_COMPILER_VERSION,
    registrySnapshotHash,
    registrySnapshot,
    compiledStages,
    outputSchemaRef: definition.outputContract.schemaRef,
    outputSchemaVersion: definition.outputContract.schemaVersion,
    executorRef: primaryExecutorStage.executorRef,
    schemaRef: definition.outputContract.schemaRef,
    schemaVersion: definition.outputContract.schemaVersion,
    budgetPolicy: definition.budgets,
    noCloudFallback: true,
    fleetManifestPath: manifestPath,
    fleetManifestVersion: manifestVersion,
    fleetManifestHash: manifestHash,
    fleetManifest: manifest,
    roleResolution,
    modelRevisions,
  });
}
