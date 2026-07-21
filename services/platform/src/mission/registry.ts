import { z } from 'zod';
import { EvidenceGateInputSchema } from '../research/evidence-gate.ts';
import { MissionGoalArgsSchema } from './args.ts';
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

const missionResearchRetrieveOutputSchema = z
  .object({
    goal: z.string().min(1),
    evidence: EvidenceGateInputSchema,
  })
  .strict();

const missionResearchAssayOutputSchema = z
  .object({
    goal: z.string().min(1),
    evidence: EvidenceGateInputSchema,
    instanceId: z.string().min(1),
    modelRevision: z.string().min(1),
    text: z.string(),
  })
  .strict();

const missionResearchChallengeOutputSchema = z
  .object({
    goal: z.string().min(1),
    assayInstanceId: z.string().min(1),
    challengeInstanceId: z.string().min(1),
    evidence: EvidenceGateInputSchema,
    assayText: z.string(),
    challengeText: z.string(),
  })
  .strict();

const missionResearchGateOutputSchema = z
  .object({
    goal: z.string().min(1),
    assayInstanceId: z.string().min(1),
    challengeInstanceId: z.string().min(1),
    evidence: EvidenceGateInputSchema,
    admitted: z.boolean(),
    direction: z.enum(['supporting', 'refuting', 'mixed', 'none']),
    coveredComponents: z.array(z.string()),
    missingComponents: z.array(z.string()),
    reason: z.string(),
    /** Count of components covered by admitted evidence (pipes-1 metrics). */
    componentsCovered: z.number().int().nonnegative(),
    independentSourceCount: z.number().int().nonnegative(),
    admittedEvidenceIds: z.array(z.string()),
    rejectedEvidenceIds: z.array(z.string()),
    executorRef: z.literal('evidence-gate'),
    topic: z.string().optional(),
    instantiation: z
      .enum(['research', 'deepResearch', 'subscriptions-research', 'fulcrum'])
      .optional(),
  })
  .strict();

const missionResearchOutputSchema = missionResearchGateOutputSchema.extend({
  assayInstanceId: z.string().min(1),
  challengeInstanceId: z.string().min(1),
});

export const MISSION_SCHEMAS: readonly MissionSchemaRegistration[] = [
  {
    schemaRef: 'mission.goal',
    schemaVersion: 1,
    schema: MissionGoalArgsSchema,
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
  {
    schemaRef: 'mission.research.retrieve.output',
    schemaVersion: 1,
    schema: missionResearchRetrieveOutputSchema,
    description: 'Retrieved evidence handed to extraction.',
  },
  {
    schemaRef: 'mission.research.assay.output',
    schemaVersion: 1,
    schema: missionResearchAssayOutputSchema,
    description: 'Fleet ASSAY output with pinned instance provenance.',
  },
  {
    schemaRef: 'mission.research.challenge.output',
    schemaVersion: 1,
    schema: missionResearchChallengeOutputSchema,
    description: 'Fleet CHALLENGE output with distinct instance provenance.',
  },
  {
    schemaRef: 'mission.research.gate.output',
    schemaVersion: 1,
    schema: missionResearchGateOutputSchema,
    description: 'Pure TypeScript evidence gate output.',
  },
  {
    schemaRef: 'mission.research.output',
    schemaVersion: 1,
    schema: missionResearchOutputSchema,
    description: 'Durable research mission terminal output.',
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
    description: 'Real fleet-backed budget consumer executor.',
  },
  {
    executorRef: 'builtin.research-plan@1',
    stageKind: 'research.plan@1',
    description: 'Durable PLAN phase with real fleet role resolution.',
  },
  {
    executorRef: 'builtin.research-retrieve@1',
    stageKind: 'research.retrieve@1',
    description: 'Durable RETRIEVE phase.',
  },
  {
    executorRef: 'builtin.research-extract@1',
    stageKind: 'research.extract@1',
    description: 'Durable EXTRACT phase.',
  },
  {
    executorRef: 'builtin.research-assay@1',
    stageKind: 'research.assay@1',
    description: 'Real fleet ASSAY model stage.',
  },
  {
    executorRef: 'builtin.research-challenge@1',
    stageKind: 'research.challenge@1',
    description: 'Real fleet CHALLENGE model stage.',
  },
  {
    executorRef: 'evidence-gate',
    stageKind: 'research.gate@1',
    description: 'Pure TypeScript evidence gate stage (deterministic admission).',
  },
  {
    // Backward-compat alias for Sprint 17 fixtures that still name the gate executor.
    executorRef: 'builtin.research-gate@1',
    stageKind: 'research.gate@1',
    description: 'Alias of evidence-gate (deprecated name).',
  },
  {
    executorRef: 'builtin.research-commit@1',
    stageKind: 'research.commit@1',
    description: 'Research terminal output stage.',
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
    description: 'Real token-consuming budget stage.',
    roleBinding: 'optional',
    checkpointAllowed: false,
  },
  {
    stageKind: 'research.plan@1',
    executorRef: 'builtin.research-plan@1',
    inputSchema: { schemaRef: 'mission.goal', schemaVersion: 1 },
    outputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
    description: 'PLAN phase with real fleet probe.',
    roleBinding: 'required',
    checkpointAllowed: true,
  },
  {
    stageKind: 'research.retrieve@1',
    executorRef: 'builtin.research-retrieve@1',
    inputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
    outputSchema: { schemaRef: 'mission.research.retrieve.output', schemaVersion: 1 },
    description: 'RETRIEVE phase persists retrieved evidence.',
    roleBinding: 'forbidden',
    checkpointAllowed: true,
  },
  {
    stageKind: 'research.extract@1',
    executorRef: 'builtin.research-extract@1',
    inputSchema: { schemaRef: 'mission.research.retrieve.output', schemaVersion: 1 },
    outputSchema: { schemaRef: 'mission.research.retrieve.output', schemaVersion: 1 },
    description: 'EXTRACT phase persists the extracted evidence boundary.',
    roleBinding: 'forbidden',
    checkpointAllowed: true,
  },
  {
    stageKind: 'research.assay@1',
    executorRef: 'builtin.research-assay@1',
    inputSchema: { schemaRef: 'mission.research.retrieve.output', schemaVersion: 1 },
    outputSchema: { schemaRef: 'mission.research.assay.output', schemaVersion: 1 },
    description: 'ASSAY generation on the bound fleet role.',
    roleBinding: 'required',
    checkpointAllowed: true,
  },
  {
    stageKind: 'research.challenge@1',
    executorRef: 'builtin.research-challenge@1',
    inputSchema: { schemaRef: 'mission.research.assay.output', schemaVersion: 1 },
    outputSchema: { schemaRef: 'mission.research.challenge.output', schemaVersion: 1 },
    description: 'CHALLENGE generation on a distinct bound fleet role.',
    roleBinding: 'required',
    checkpointAllowed: true,
  },
  {
    stageKind: 'research.gate@1',
    executorRef: 'evidence-gate',
    inputSchema: { schemaRef: 'mission.research.challenge.output', schemaVersion: 1 },
    outputSchema: { schemaRef: 'mission.research.gate.output', schemaVersion: 1 },
    description: 'Deterministic evidence admission stage; no model call.',
    roleBinding: 'forbidden',
    checkpointAllowed: true,
  },
  {
    stageKind: 'research.commit@1',
    executorRef: 'builtin.research-commit@1',
    inputSchema: { schemaRef: 'mission.research.gate.output', schemaVersion: 1 },
    outputSchema: { schemaRef: 'mission.research.output', schemaVersion: 1 },
    description: 'Terminal research output stage.',
    roleBinding: 'forbidden',
    checkpointAllowed: true,
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
