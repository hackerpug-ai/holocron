/**
 * pipes-3 — standing subscriptions mission template.
 *
 * Invokes evidence-research as a **sub-workflow** (template reference, not direct
 * research executor chain) then publishes a document with source_run_id + published_at
 * through an idempotent path.
 *
 * CLI: holo mission run subscriptions
 * template_key: subscriptions
 *
 * Stage graph must contain executorRef `subworkflow:evidence-research` (TC-3).
 */
import type { MissionTemplateDefinition } from '../contract.ts';
import { EVIDENCE_RESEARCH_TEMPLATE_KEY } from './evidence-research.ts';

export const SUBSCRIPTIONS_TEMPLATE_KEY = 'subscriptions' as const;
export const SUBSCRIPTIONS_TEMPLATE_VERSION = '1.0.0' as const;

/** Literal executor ref grepped by TC-3: subworkflow:evidence-research */
export const SUBWORKFLOW_EVIDENCE_RESEARCH_REF =
  `subworkflow:${EVIDENCE_RESEARCH_TEMPLATE_KEY}` as const;

export const subscriptionsTemplateDefinition: MissionTemplateDefinition = {
  templateKey: SUBSCRIPTIONS_TEMPLATE_KEY,
  version: SUBSCRIPTIONS_TEMPLATE_VERSION,
  description:
    'Standing subscriptions: plan → subworkflow:evidence-research → checkpoint → idempotent document publish → commit.',
  trigger: { kind: 'on-demand' },
  stageGraph: [
    {
      id: 'plan',
      stageKind: 'subscriptions.plan@1',
      executorRef: 'builtin.subscriptions-plan@1',
      inputSchema: { schemaRef: 'mission.goal', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
    },
    {
      id: 'research_subworkflow',
      stageKind: 'subscriptions.subworkflow@1',
      // TC-3 / STRICTLY: template reference, not direct research executor chain.
      executorRef: SUBWORKFLOW_EVIDENCE_RESEARCH_REF,
      inputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.subscriptions.context', schemaVersion: 1 },
      checkpointKey: 'after-subworkflow',
    },
    {
      id: 'post_subworkflow',
      stageKind: 'subscriptions.checkpoint@1',
      executorRef: 'builtin.subscriptions-checkpoint@1',
      inputSchema: { schemaRef: 'mission.subscriptions.context', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.subscriptions.context', schemaVersion: 1 },
      checkpointKey: 'after-subworkflow-checkpoint',
    },
    {
      id: 'publish',
      stageKind: 'subscriptions.publish@1',
      executorRef: 'builtin.subscriptions-publish@1',
      inputSchema: { schemaRef: 'mission.subscriptions.context', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.subscriptions.context', schemaVersion: 1 },
      checkpointKey: 'after-publish',
    },
    {
      id: 'commit',
      stageKind: 'subscriptions.commit@1',
      executorRef: 'builtin.subscriptions-commit@1',
      inputSchema: { schemaRef: 'mission.subscriptions.context', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.subscriptions.output', schemaVersion: 1 },
    },
  ],
  toolGrants: [],
  modelRoleBindings: {
    plan: 'divergent',
  },
  budgets: { wallMs: 360_000, tokens: 24_000, cost: 0, maxSteps: 24 },
  gateRubric: null,
  humanGate: null,
  outputContract: { schemaRef: 'mission.subscriptions.output', schemaVersion: 1 },
  parameterSchema: {
    topic: {
      type: 'string',
      required: false,
      description: 'Topic handed to evidence-research sub-workflow.',
    },
  },
};
