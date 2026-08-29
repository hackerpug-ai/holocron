/**
 * Explicit migration/fixture seed helper for evidence-research tests.
 *
 * NOT used by the default retrieve path. Runtime retrieve is fail-closed:
 * without `researchEvidence` (CLI `--claims` / recorded_external fixture),
 * the gate sees empty evidence and will not admit.
 *
 * Call this only when writing fixture files under tests/fixtures/research/
 * or when a test explicitly seeds migration_fixture rows.
 */

import type { z } from 'zod';
import {
  type EvidenceGateInput,
  EvidenceGateInputSchema,
  type EvidenceItemSchema,
  type ResearchClaimSchema,
} from './evidence-gate.ts';

type Claim = z.infer<typeof ResearchClaimSchema>;
type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export type BuildEvidenceForComponentsInput = {
  topic: string;
  components: number;
  gradeFloor?: number;
  entailmentFloor?: number;
  independentSourceFloor?: number;
  direction?: 'supporting' | 'refuting';
  /** Required marker — prevents silent synthetic success on production paths. */
  seedKind: 'migration_fixture' | 'recorded_external';
};

/**
 * Produce fixture evidence covering `components` required components.
 * Must be called with an explicit seedKind; never invoke from retrieve for
 * arbitrary operator topics.
 */
export function buildEvidenceForComponents(
  raw: BuildEvidenceForComponentsInput
): EvidenceGateInput {
  if (raw.seedKind !== 'migration_fixture' && raw.seedKind !== 'recorded_external') {
    throw new Error(
      'buildEvidenceForComponents requires seedKind migration_fixture|recorded_external'
    );
  }
  const topic = raw.topic.trim() || 'research-topic';
  const components = Math.max(1, Math.floor(raw.components));
  const gradeFloor = raw.gradeFloor ?? 3;
  const entailmentFloor = raw.entailmentFloor ?? 0.8;
  const independentSourceFloor = Math.max(1, raw.independentSourceFloor ?? 2);
  const direction = raw.direction ?? 'supporting';

  const requiredComponents = Array.from(
    { length: components },
    (_, index) => `component_${index + 1}`
  );

  const claims: Claim[] = requiredComponents.map((component) => ({
    id: `claim-${component}`,
    text: `${topic}: ${component}`,
    component,
  }));

  const evidence: EvidenceItem[] = [];
  for (let i = 0; i < requiredComponents.length; i += 1) {
    const component = requiredComponents[i]!;
    const sourceOrdinal = (i % independentSourceFloor) + 1;
    const sourceId = `src-${sourceOrdinal}`;
    const quote = `${topic}::${component}`;
    evidence.push({
      id: `e-${component}-primary`,
      claimId: `claim-${component}`,
      component,
      sourceId,
      independenceGroup: sourceId,
      quote,
      sourceText: `Primary source material: ${quote} — durable evidence for ${component} on ${topic}.`,
      grade: Math.max(gradeFloor, 4),
      entailment: Math.max(entailmentFloor, 0.9),
      disconfirmationResolved: true,
      direction,
    });
  }

  const sourceIds = new Set(evidence.map((item) => item.sourceId));
  let pad = 0;
  while (sourceIds.size < independentSourceFloor) {
    pad += 1;
    const component = requiredComponents[0]!;
    const sourceId = `src-pad-${pad}`;
    if (sourceIds.has(sourceId)) continue;
    sourceIds.add(sourceId);
    const quote = `${topic}::${component}::pad-${pad}`;
    evidence.push({
      id: `e-${component}-pad-${pad}`,
      claimId: `claim-${component}`,
      component,
      sourceId,
      independenceGroup: sourceId,
      quote,
      sourceText: `Independent corroboration: ${quote} — additional durable evidence for ${component}.`,
      grade: Math.max(gradeFloor, 4),
      entailment: Math.max(entailmentFloor, 0.9),
      disconfirmationResolved: true,
      direction,
    });
  }

  return EvidenceGateInputSchema.parse({
    claims,
    evidence,
    requiredComponents,
    gradeFloor,
    entailmentFloor,
    independentSourceFloor,
  });
}
