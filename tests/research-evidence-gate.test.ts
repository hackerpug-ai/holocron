import { describe, expect, it } from 'vitest';
import { evaluateEvidenceGate } from '../services/platform/src/research/evidence-gate';

const base = {
  claims: [
    { id: 'claim-a', text: 'a', component: 'market' },
    { id: 'claim-b', text: 'b', component: 'risk' },
  ],
  requiredComponents: ['market', 'risk'],
  gradeFloor: 3,
  entailmentFloor: 0.8,
  independentSourceFloor: 2,
};

const evidence = [
  {
    id: 'e1',
    claimId: 'claim-a',
    component: 'market',
    sourceId: 's1',
    independenceGroup: 'publisher-a',
    quote: 'a',
    sourceText: 'Evidence says a',
    grade: 4,
    entailment: 0.9,
    disconfirmationResolved: true,
    direction: 'supporting' as const,
  },
  {
    id: 'e2',
    claimId: 'claim-b',
    component: 'risk',
    sourceId: 's2',
    independenceGroup: 'publisher-b',
    quote: 'b',
    sourceText: 'Evidence says b',
    grade: 3,
    entailment: 0.8,
    disconfirmationResolved: true,
    direction: 'supporting' as const,
  },
];

describe('pure TypeScript evidence gate', () => {
  it('does not terminate on high-confidence thin evidence', () => {
    const result = evaluateEvidenceGate({ ...base, evidence: [evidence[0]] });
    expect(result.admitted).toBe(false);
    expect(result.missingComponents).toEqual(['risk']);
  });

  it('admits complete independent evidence deterministically', () => {
    expect(evaluateEvidenceGate({ ...base, evidence }).admitted).toBe(true);
  });

  it('applies the identical admission gate to refuting evidence', () => {
    const result = evaluateEvidenceGate({
      ...base,
      evidence: evidence.map((item) => ({ ...item, direction: 'refuting' as const })),
    });
    expect(result.admitted).toBe(true);
    expect(result.direction).toBe('refuting');
  });

  it('rejects evidence without a verbatim quote or resolved disconfirmation', () => {
    const result = evaluateEvidenceGate({
      ...base,
      evidence: evidence.map((item) => ({
        ...item,
        quote: 'missing quote',
        disconfirmationResolved: false,
      })),
    });
    expect(result.admitted).toBe(false);
    expect(result.admittedEvidenceIds).toEqual([]);
  });

  it('does not let caller labels spoof source independence or claim coverage', () => {
    const result = evaluateEvidenceGate({
      ...base,
      evidence: evidence.map((item, index) => ({
        ...item,
        sourceId: 'same-canonical-source',
        independenceGroup: `fake-group-${index}`,
        component: index === 0 ? 'risk' : item.component,
      })),
    });
    expect(result.admitted).toBe(false);
    expect(result.independentSourceCount).toBe(1);
    expect(result.missingComponents).toContain('market');
  });
});
