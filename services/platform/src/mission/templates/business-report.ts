/**
 * pipes-2 — parameterized business-report mission template (4 kinds).
 *
 * Single template_key `business-report`; kind is a run parameter, not a row.
 * Reasoning runs server-side on the local inference fleet (CAP-INF-01).
 * ASSAY ≠ CHALLENGE role bindings for claim validation.
 */

import { BUSINESS_REPORT_KINDS } from '../../tools/schemas/business.ts';
import type { MissionTemplateDefinition } from '../contract.ts';

export const BUSINESS_REPORT_TEMPLATE_KEY = 'business-report' as const;
export const BUSINESS_REPORT_TEMPLATE_VERSION = '1.0.0' as const;

export const businessReportTemplateDefinition: MissionTemplateDefinition = {
  templateKey: BUSINESS_REPORT_TEMPLATE_KEY,
  version: BUSINESS_REPORT_TEMPLATE_VERSION,
  description:
    'Parameterized business report (revenue-validation | competitive | ai-roi | flights) with fleet ASSAY≠CHALLENGE reasoning.',
  trigger: { kind: 'on-demand' },
  stageGraph: [
    {
      id: 'plan',
      stageKind: 'business.plan@1',
      executorRef: 'builtin.business-plan@1',
      inputSchema: { schemaRef: 'mission.goal', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
    },
    {
      id: 'component_validation',
      stageKind: 'business.component-validate@1',
      executorRef: 'builtin.business-component-validate@1',
      inputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.business.context', schemaVersion: 1 },
    },
    {
      id: 'pre_reasoning',
      stageKind: 'business.checkpoint@1',
      executorRef: 'builtin.business-checkpoint@1',
      inputSchema: { schemaRef: 'mission.business.context', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.business.context', schemaVersion: 1 },
      checkpointKey: 'before-reasoning',
    },
    {
      id: 'assay',
      stageKind: 'business.assay@1',
      executorRef: 'builtin.business-assay@1',
      inputSchema: { schemaRef: 'mission.business.context', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.business.context', schemaVersion: 1 },
      checkpointKey: 'after-assay',
    },
    {
      id: 'challenge',
      stageKind: 'business.challenge@1',
      executorRef: 'builtin.business-challenge@1',
      inputSchema: { schemaRef: 'mission.business.context', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.business.context', schemaVersion: 1 },
      checkpointKey: 'after-challenge',
    },
    {
      id: 'post_reasoning',
      stageKind: 'business.checkpoint@1',
      executorRef: 'builtin.business-checkpoint@1',
      inputSchema: { schemaRef: 'mission.business.context', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.business.context', schemaVersion: 1 },
      checkpointKey: 'after-reasoning',
    },
    {
      id: 'commit',
      stageKind: 'business.commit@1',
      executorRef: 'builtin.business-commit@1',
      inputSchema: { schemaRef: 'mission.business.context', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.business.report', schemaVersion: 1 },
    },
  ],
  toolGrants: [],
  modelRoleBindings: {
    // Fleet health probe + ASSAY use divergent; CHALLENGE uses convergent (ASSAY≠CHALLENGE).
    plan: 'divergent',
    assay: 'divergent',
    challenge: 'convergent',
  },
  budgets: {
    wallMs: 300_000,
    tokens: 24_000,
    cost: 0,
    maxSteps: 16,
  },
  gateRubric: null,
  humanGate: null,
  outputContract: { schemaRef: 'mission.business.report', schemaVersion: 1 },
  parameterSchema: {
    kind: {
      type: 'enum',
      values: [...BUSINESS_REPORT_KINDS],
      required: true,
      description: 'Business report kind (one template, four kinds).',
    },
    target: {
      type: 'string',
      required: false,
      description: 'Company / product / site target for the report.',
    },
    destination: {
      type: 'string',
      required: false,
      description: 'Flight route (e.g. SFO-JFK) for flights kind.',
    },
  },
};

/** JSON-serializable definition for fixture registration. */
export function businessReportTemplateJson(): string {
  return `${JSON.stringify(businessReportTemplateDefinition, null, 2)}\n`;
}
