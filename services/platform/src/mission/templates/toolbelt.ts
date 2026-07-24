/**
 * Durable one-click Toolbelt capture.
 *
 * The incoming deep link already supplies the validated tool metadata, so this
 * path deliberately does not spend fleet budget. Its single stage atomically
 * publishes a source-backed document and records it against the mission run.
 */
import type { MissionTemplateDefinition } from '../contract.ts';

export const TOOLBELT_TEMPLATE_KEY = 'toolbelt' as const;
export const TOOLBELT_TEMPLATE_VERSION = '1.0.0' as const;

export const toolbeltTemplateDefinition: MissionTemplateDefinition = {
  templateKey: TOOLBELT_TEMPLATE_KEY,
  version: TOOLBELT_TEMPLATE_VERSION,
  description:
    'Persist a validated Toolbelt deep-link entry as an idempotent source-backed document.',
  trigger: { kind: 'on-demand' },
  stageGraph: [
    {
      id: 'plan',
      stageKind: 'fleet.probe@1',
      executorRef: 'builtin.fleet-probe@1',
      inputSchema: { schemaRef: 'mission.goal', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
    },
    {
      id: 'commit',
      stageKind: 'toolbelt.commit@1',
      executorRef: 'builtin.toolbelt-commit@1',
      inputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.toolbelt.output', schemaVersion: 1 },
    },
  ],
  toolGrants: [],
  modelRoleBindings: { plan: 'divergent' },
  budgets: { wallMs: 30_000, tokens: 0, cost: 0, maxSteps: 2 },
  gateRubric: null,
  humanGate: null,
  outputContract: { schemaRef: 'mission.toolbelt.output', schemaVersion: 1 },
  parameterSchema: {
    title: { type: 'string', required: true },
    description: { type: 'string', required: true },
    category: {
      type: 'enum',
      values: ['libraries', 'cli', 'framework', 'service', 'database', 'tool'],
      required: true,
    },
    sourceUrl: { type: 'string', required: true },
    sourceType: {
      type: 'enum',
      values: ['github', 'npm', 'pypi', 'website', 'cargo', 'go', 'other'],
      required: true,
    },
  },
};
