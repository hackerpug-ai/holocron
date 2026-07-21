/**
 * pipes-3 — whatsNew / daily-briefing mission template.
 *
 * CLI: holo mission run whatsNew --date YYYY-MM-DD
 * template_key: whatsnew
 */
import type { MissionTemplateDefinition } from '../contract.ts';

export const WHATSNEW_TEMPLATE_KEY = 'whatsnew' as const;
export const WHATSNEW_TEMPLATE_VERSION = '1.0.0' as const;

export const WHATSNEW_ALIASES = ['whatsNew', 'whatsnew'] as const;

export const whatsNewTemplateDefinition: MissionTemplateDefinition = {
  templateKey: WHATSNEW_TEMPLATE_KEY,
  version: WHATSNEW_TEMPLATE_VERSION,
  description:
    'Daily briefing (whatsNew): plan → gather headlines → fleet assay → commit daily-briefing document.',
  trigger: { kind: 'on-demand' },
  stageGraph: [
    {
      id: 'plan',
      stageKind: 'whatsnew.plan@1',
      executorRef: 'builtin.whatsnew-plan@1',
      inputSchema: { schemaRef: 'mission.goal', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
    },
    {
      id: 'gather',
      stageKind: 'whatsnew.gather@1',
      executorRef: 'builtin.whatsnew-gather@1',
      inputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.whatsnew.context', schemaVersion: 1 },
      checkpointKey: 'after-gather',
    },
    {
      id: 'assay',
      stageKind: 'whatsnew.assay@1',
      executorRef: 'builtin.whatsnew-assay@1',
      inputSchema: { schemaRef: 'mission.whatsnew.context', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.whatsnew.context', schemaVersion: 1 },
      checkpointKey: 'after-assay',
    },
    {
      id: 'commit',
      stageKind: 'whatsnew.commit@1',
      executorRef: 'builtin.whatsnew-commit@1',
      inputSchema: { schemaRef: 'mission.whatsnew.context', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.whatsnew.briefing', schemaVersion: 1 },
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
  outputContract: { schemaRef: 'mission.whatsnew.briefing', schemaVersion: 1 },
  parameterSchema: {
    date: {
      type: 'string',
      required: true,
      description: 'Briefing date (YYYY-MM-DD).',
    },
  },
};

export function resolveWhatsNewTemplateKey(
  templateOrAlias: string
): typeof WHATSNEW_TEMPLATE_KEY | null {
  if (templateOrAlias === WHATSNEW_TEMPLATE_KEY) return WHATSNEW_TEMPLATE_KEY;
  if ((WHATSNEW_ALIASES as readonly string[]).includes(templateOrAlias))
    return WHATSNEW_TEMPLATE_KEY;
  return null;
}
