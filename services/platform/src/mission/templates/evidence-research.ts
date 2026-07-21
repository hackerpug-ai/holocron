/**
 * Shared evidence-research mission template (Sprint 22 / pipes-1).
 *
 * Instantiated by CLI aliases: research, deepResearch, subscriptions-research, fulcrum.
 * Pure data only — no executable payloads. Executors resolve via the mission registry.
 */
import type { MissionTemplateDefinition } from '../contract.ts';

export const EVIDENCE_RESEARCH_TEMPLATE_KEY = 'evidence-research' as const;

export const EVIDENCE_RESEARCH_INSTANTIATIONS = [
  'research',
  'deepResearch',
  'subscriptions-research',
  'fulcrum',
] as const;

export type EvidenceResearchInstantiation = (typeof EVIDENCE_RESEARCH_INSTANTIATIONS)[number];

/** Closed Mission Template DSL payload for the shared evidence-research core. */
export const evidenceResearchTemplateDefinition: MissionTemplateDefinition = {
  templateKey: EVIDENCE_RESEARCH_TEMPLATE_KEY,
  version: '1.0.0',
  description:
    'Shared evidence-research core: plan → retrieve → extract → assay → challenge → evidence-gate → commit. Instantiated by research/deepResearch/subscriptions-research/fulcrum.',
  trigger: { kind: 'on-demand' },
  stageGraph: [
    {
      id: 'plan',
      stageKind: 'research.plan@1',
      executorRef: 'builtin.research-plan@1',
      inputSchema: { schemaRef: 'mission.goal', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
    },
    {
      id: 'retrieve',
      stageKind: 'research.retrieve@1',
      executorRef: 'builtin.research-retrieve@1',
      inputSchema: { schemaRef: 'mission.probe.result', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.research.retrieve.output', schemaVersion: 1 },
      checkpointKey: 'after-retrieve',
    },
    {
      id: 'extract',
      stageKind: 'research.extract@1',
      executorRef: 'builtin.research-extract@1',
      inputSchema: { schemaRef: 'mission.research.retrieve.output', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.research.retrieve.output', schemaVersion: 1 },
      checkpointKey: 'after-extract',
    },
    {
      id: 'assay',
      stageKind: 'research.assay@1',
      executorRef: 'builtin.research-assay@1',
      inputSchema: { schemaRef: 'mission.research.retrieve.output', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.research.assay.output', schemaVersion: 1 },
      checkpointKey: 'after-assay',
    },
    {
      id: 'challenge',
      stageKind: 'research.challenge@1',
      executorRef: 'builtin.research-challenge@1',
      inputSchema: { schemaRef: 'mission.research.assay.output', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.research.challenge.output', schemaVersion: 1 },
      checkpointKey: 'after-challenge',
    },
    {
      id: 'gate',
      stageKind: 'research.gate@1',
      executorRef: 'evidence-gate',
      inputSchema: { schemaRef: 'mission.research.challenge.output', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.research.gate.output', schemaVersion: 1 },
      checkpointKey: 'after-gate',
    },
    {
      id: 'commit',
      stageKind: 'research.commit@1',
      executorRef: 'builtin.research-commit@1',
      inputSchema: { schemaRef: 'mission.research.gate.output', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.research.output', schemaVersion: 1 },
      checkpointKey: 'after-commit',
    },
  ],
  toolGrants: [],
  modelRoleBindings: {
    plan: 'divergent',
    assay: 'divergent',
    challenge: 'convergent',
  },
  budgets: { wallMs: 180_000, tokens: 12_000, cost: 0, maxSteps: 12 },
  gateRubric: null,
  humanGate: null,
  outputContract: { schemaRef: 'mission.research.output', schemaVersion: 1 },
};

export function isEvidenceResearchInstantiation(
  value: string
): value is EvidenceResearchInstantiation {
  return (EVIDENCE_RESEARCH_INSTANTIATIONS as readonly string[]).includes(value);
}

/**
 * Map operator-facing pipeline aliases onto the shared template key.
 * deepResearch/research/etc. never create distinct template rows.
 */
export function resolveEvidenceResearchTemplateKey(
  templateOrAlias: string
): typeof EVIDENCE_RESEARCH_TEMPLATE_KEY | null {
  if (templateOrAlias === EVIDENCE_RESEARCH_TEMPLATE_KEY) return EVIDENCE_RESEARCH_TEMPLATE_KEY;
  if (isEvidenceResearchInstantiation(templateOrAlias)) return EVIDENCE_RESEARCH_TEMPLATE_KEY;
  return null;
}
