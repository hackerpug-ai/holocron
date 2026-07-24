/**
 * pipes-3 — shop product search mission template.
 *
 * CLI: holo mission run shop --query <term>
 * template_key: shop
 */
import type { MissionTemplateDefinition } from '../contract.ts';

export const SHOP_TEMPLATE_KEY = 'shop' as const;
export const SHOP_TEMPLATE_VERSION = '1.0.3' as const;

export const shopTemplateDefinition: MissionTemplateDefinition = {
  templateKey: SHOP_TEMPLATE_KEY,
  version: SHOP_TEMPLATE_VERSION,
  description:
    'Product shop search: plan → product gather → fleet assay → commit product list with prices/ratings/links.',
  trigger: { kind: 'on-demand' },
  stageGraph: [
    {
      id: 'plan',
      stageKind: 'shop.plan@1',
      executorRef: 'builtin.shop-plan@1',
      inputSchema: { schemaRef: 'mission.goal', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
    },
    {
      id: 'gather',
      stageKind: 'shop.gather@1',
      executorRef: 'builtin.shop-gather@1',
      inputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.shop.context', schemaVersion: 1 },
      checkpointKey: 'after-gather',
    },
    {
      id: 'assay',
      stageKind: 'shop.assay@1',
      executorRef: 'builtin.shop-assay@1',
      inputSchema: { schemaRef: 'mission.shop.context', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.shop.context', schemaVersion: 1 },
      checkpointKey: 'after-assay',
    },
    {
      id: 'commit',
      stageKind: 'shop.commit@1',
      executorRef: 'builtin.shop-commit@1',
      inputSchema: { schemaRef: 'mission.shop.context', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.shop.results', schemaVersion: 1 },
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
  outputContract: { schemaRef: 'mission.shop.results', schemaVersion: 1 },
  parameterSchema: {
    query: {
      type: 'string',
      required: true,
      description: 'Product search query.',
    },
  },
};
