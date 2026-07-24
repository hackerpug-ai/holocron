/**
 * pipes-3 — assimilate (repo architecture) mission template.
 *
 * CLI: holo mission run assimilate --target <owner/repo>
 * template_key: assimilate
 */
import type { MissionTemplateDefinition } from '../contract.ts';

export const ASSIMILATE_TEMPLATE_KEY = 'assimilate' as const;
export const ASSIMILATE_TEMPLATE_VERSION = '1.0.3' as const;

export const assimilateTemplateDefinition: MissionTemplateDefinition = {
  templateKey: ASSIMILATE_TEMPLATE_KEY,
  version: ASSIMILATE_TEMPLATE_VERSION,
  description:
    'Repo assimilation: plan → architecture/patterns gather → fleet assay → commit evaluation report.',
  trigger: { kind: 'on-demand' },
  stageGraph: [
    {
      id: 'plan',
      stageKind: 'assimilate.plan@1',
      executorRef: 'builtin.assimilate-plan@1',
      inputSchema: { schemaRef: 'mission.goal', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
    },
    {
      id: 'gather',
      stageKind: 'assimilate.gather@1',
      executorRef: 'builtin.assimilate-gather@1',
      inputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.assimilate.context', schemaVersion: 1 },
      checkpointKey: 'after-gather',
    },
    {
      id: 'assay',
      stageKind: 'assimilate.assay@1',
      executorRef: 'builtin.assimilate-assay@1',
      inputSchema: { schemaRef: 'mission.assimilate.context', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.assimilate.context', schemaVersion: 1 },
      checkpointKey: 'after-assay',
    },
    {
      id: 'commit',
      stageKind: 'assimilate.commit@1',
      executorRef: 'builtin.assimilate-commit@1',
      inputSchema: { schemaRef: 'mission.assimilate.context', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.assimilate.report', schemaVersion: 1 },
    },
  ],
  toolGrants: [],
  modelRoleBindings: {
    plan: 'divergent',
    assay: 'divergent',
  },
  budgets: { wallMs: 180_000, tokens: 12_000, cost: 0, maxSteps: 12 },
  gateRubric: null,
  humanGate: null,
  outputContract: { schemaRef: 'mission.assimilate.report', schemaVersion: 1 },
  parameterSchema: {
    target: {
      type: 'string',
      required: true,
      description: 'Repository (owner/repo or URL).',
    },
  },
};
