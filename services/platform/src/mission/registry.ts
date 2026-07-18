import { z } from 'zod';
import { canonicalJsonValue, sha256Hex } from './canonical-json.ts';
import type {
  MissionSchemaRef,
  MissionStageDefinition,
  MissionTemplateDefinition,
} from './contract.ts';

export const MISSION_COMPILER_VERSION = 'mission-compiler@1.0.0';

export type MissionSchemaRegistration = {
  schemaRef: string;
  schemaVersion: number;
  schema: z.ZodType;
  description: string;
};

export type MissionStageRegistration = {
  stageKind: string;
  executorRef: string;
  inputSchema: MissionSchemaRef;
  outputSchema: MissionSchemaRef;
  description: string;
  roleBinding: 'required' | 'optional' | 'forbidden';
  checkpointAllowed: boolean;
};

export type MissionExecutorRegistration = {
  executorRef: string;
  stageKind: string;
  description: string;
};

const missionGoalSchema = z
  .object({
    goal: z.string().min(1),
    operator: z.string().min(1).optional(),
  })
  .strict();

const missionProbeResultSchema = z
  .object({
    goal: z.string().min(1),
    role: z.string().min(1),
    endpoint: z.string().url(),
    litellmModelId: z.string().min(1),
    modelRevision: z.string().min(1),
    fleetManifestVersion: z.string().min(1),
  })
  .strict();

const missionTestEchoOutputSchema = z
  .object({
    goal: z.string().min(1),
    echo: z.string().min(1),
    probeRole: z.string().min(1),
  })
  .strict();

const missionCheckpointOutputSchema = z
  .object({
    goal: z.string().min(1),
    checkpointKey: z.string().min(1),
    probeRole: z.string().min(1),
  })
  .strict();

const missionTestSigkillOutputSchema = z
  .object({
    goal: z.string().min(1),
    resumed: z.literal(true),
    checkpointKey: z.string().min(1),
  })
  .strict();

const missionTestBudgetOutputSchema = z
  .object({
    goal: z.string().min(1),
    budgetExceeded: z.boolean(),
  })
  .strict();

export const MISSION_SCHEMAS: readonly MissionSchemaRegistration[] = [
  {
    schemaRef: 'mission.goal',
    schemaVersion: 1,
    schema: missionGoalSchema,
    description: 'Operator-provided mission goal input.',
  },
  {
    schemaRef: 'mission.probe.result',
    schemaVersion: 1,
    schema: missionProbeResultSchema,
    description: 'Pinned fleet probe output.',
  },
  {
    schemaRef: 'mission.test.echo.output',
    schemaVersion: 1,
    schema: missionTestEchoOutputSchema,
    description: 'Deterministic echo output.',
  },
  {
    schemaRef: 'mission.checkpoint.output',
    schemaVersion: 1,
    schema: missionCheckpointOutputSchema,
    description: 'Deterministic checkpoint output.',
  },
  {
    schemaRef: 'mission.test.sigkill.output',
    schemaVersion: 1,
    schema: missionTestSigkillOutputSchema,
    description: 'Deterministic resumed output.',
  },
  {
    schemaRef: 'mission.test.budget.output',
    schemaVersion: 1,
    schema: missionTestBudgetOutputSchema,
    description: 'Deterministic budget output.',
  },
] as const;

export const MISSION_EXECUTORS: readonly MissionExecutorRegistration[] = [
  {
    executorRef: 'builtin.fleet-probe@1',
    stageKind: 'fleet.probe@1',
    description: 'Resolve and pin a real fleet role.',
  },
  {
    executorRef: 'builtin.test-echo@1',
    stageKind: 'test.echo@1',
    description: 'Deterministic echo executor.',
  },
  {
    executorRef: 'builtin.test-checkpoint@1',
    stageKind: 'test.checkpoint@1',
    description: 'Deterministic checkpoint executor.',
  },
  {
    executorRef: 'builtin.test-resume@1',
    stageKind: 'test.resume@1',
    description: 'Deterministic resume executor.',
  },
  {
    executorRef: 'builtin.test-consume-budget@1',
    stageKind: 'test.consume-budget@1',
    description: 'Deterministic budget consumer executor.',
  },
] as const;

export const MISSION_STAGES: readonly MissionStageRegistration[] = [
  {
    stageKind: 'fleet.probe@1',
    executorRef: 'builtin.fleet-probe@1',
    inputSchema: { schemaRef: 'mission.goal', schemaVersion: 1 },
    outputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
    description: 'Real resolveModel(role) probe stage.',
    roleBinding: 'required',
    checkpointAllowed: false,
  },
  {
    stageKind: 'test.echo@1',
    executorRef: 'builtin.test-echo@1',
    inputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
    outputSchema: { schemaRef: 'mission.test.echo.output', schemaVersion: 1 },
    description: 'Deterministic echo stage.',
    roleBinding: 'forbidden',
    checkpointAllowed: false,
  },
  {
    stageKind: 'test.checkpoint@1',
    executorRef: 'builtin.test-checkpoint@1',
    inputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
    outputSchema: { schemaRef: 'mission.checkpoint.output', schemaVersion: 1 },
    description: 'Deterministic checkpoint stage.',
    roleBinding: 'forbidden',
    checkpointAllowed: true,
  },
  {
    stageKind: 'test.resume@1',
    executorRef: 'builtin.test-resume@1',
    inputSchema: { schemaRef: 'mission.checkpoint.output', schemaVersion: 1 },
    outputSchema: { schemaRef: 'mission.test.sigkill.output', schemaVersion: 1 },
    description: 'Deterministic resume stage.',
    roleBinding: 'forbidden',
    checkpointAllowed: false,
  },
  {
    stageKind: 'test.consume-budget@1',
    executorRef: 'builtin.test-consume-budget@1',
    inputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
    outputSchema: { schemaRef: 'mission.test.budget.output', schemaVersion: 1 },
    description: 'Deterministic budget stage.',
    roleBinding: 'forbidden',
    checkpointAllowed: false,
  },
] as const;

function schemaKey(value: MissionSchemaRef): string {
  return `${value.schemaRef}@${value.schemaVersion}`;
}

const schemaMap = new Map(MISSION_SCHEMAS.map((schema) => [schemaKey(schema), schema]));
const executorMap = new Map(MISSION_EXECUTORS.map((executor) => [executor.executorRef, executor]));
const stageMap = new Map(MISSION_STAGES.map((stage) => [stage.stageKind, stage]));

export function getMissionSchemaRegistration(
  schemaRef: MissionSchemaRef
): MissionSchemaRegistration | null {
  return schemaMap.get(schemaKey(schemaRef)) ?? null;
}

export function getMissionExecutorRegistration(
  executorRef: string
): MissionExecutorRegistration | null {
  return executorMap.get(executorRef) ?? null;
}

export function getMissionStageRegistration(stageKind: string): MissionStageRegistration | null {
  return stageMap.get(stageKind) ?? null;
}

export function assertRegisteredSchema(schemaRef: MissionSchemaRef): MissionSchemaRegistration {
  const registration = getMissionSchemaRegistration(schemaRef);
  if (!registration) {
    throw new Error(
      `unknown or unregistered mission schema: ${schemaRef.schemaRef}@${schemaRef.schemaVersion}`
    );
  }
  return registration;
}

export function assertRegisteredExecutor(executorRef: string): MissionExecutorRegistration {
  const registration = getMissionExecutorRegistration(executorRef);
  if (!registration) {
    throw new Error(`unknown or unregistered mission executor: ${executorRef}`);
  }
  return registration;
}

export function assertRegisteredStage(stageKind: string): MissionStageRegistration {
  const registration = getMissionStageRegistration(stageKind);
  if (!registration) {
    throw new Error(`unknown or unregistered mission stage: ${stageKind}`);
  }
  return registration;
}

function registrySchemaSnapshot() {
  return MISSION_SCHEMAS.map((schema) => ({
    schemaRef: schema.schemaRef,
    schemaVersion: schema.schemaVersion,
    description: schema.description,
  }));
}

function registryExecutorSnapshot() {
  return MISSION_EXECUTORS.map((executor) => ({
    executorRef: executor.executorRef,
    stageKind: executor.stageKind,
    description: executor.description,
  }));
}

function registryStageSnapshot() {
  return MISSION_STAGES.map((stage) => ({
    stageKind: stage.stageKind,
    executorRef: stage.executorRef,
    inputSchema: stage.inputSchema,
    outputSchema: stage.outputSchema,
    description: stage.description,
    roleBinding: stage.roleBinding,
    checkpointAllowed: stage.checkpointAllowed,
  }));
}

export function snapshotMissionRegistry() {
  return canonicalJsonValue({
    compilerVersion: MISSION_COMPILER_VERSION,
    schemas: registrySchemaSnapshot(),
    executors: registryExecutorSnapshot(),
    stages: registryStageSnapshot(),
  });
}

export function missionRegistrySnapshotHash(): string {
  return sha256Hex(snapshotMissionRegistry());
}

export function assertNoUnsupportedToolGrants(definition: MissionTemplateDefinition): void {
  if (definition.toolGrants.length > 0) {
    throw new Error('tool grants are not registered for mission DSL v1');
  }
}

export function assertUniqueStageIds(stageGraph: readonly MissionStageDefinition[]): void {
  const seen = new Set<string>();
  for (const stage of stageGraph) {
    if (seen.has(stage.id)) {
      throw new Error(`duplicate stage id in mission template: ${stage.id}`);
    }
    seen.add(stage.id);
  }
}
