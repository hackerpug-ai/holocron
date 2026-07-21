/**
 * Pure-TS evidence gate unit tests (pipes-1 AC-3 / TC-2 / TC-4).
 * No I/O — deterministic admission only.
 */
import { describe, expect, it } from 'vitest';
import { evaluateEvidenceGate } from './evidence-gate.ts';

describe('evaluateEvidenceGate', () => {
  it('refuting direction: admits refuting evidence and sets direction=refuting', () => {
    const result = evaluateEvidenceGate({
      claims: [
        {
          id: 'c1',
          text: 'TypeScript types are optional',
          component: 'type_system',
        },
      ],
      evidence: [
        {
          id: 'e1',
          claimId: 'c1',
          component: 'type_system',
          sourceId: 's1',
          independenceGroup: 'g1',
          quote: 'TypeScript types are optional',
          sourceText: 'TypeScript types are optional in JSDoc comments',
          grade: 4,
          entailment: 0.9,
          disconfirmationResolved: true,
          direction: 'refuting',
        },
        {
          id: 'e2',
          claimId: 'c1',
          component: 'type_system',
          sourceId: 's2',
          independenceGroup: 'g2',
          quote: 'TypeScript types are optional',
          sourceText: 'TypeScript types are optional at the boundary',
          grade: 4,
          entailment: 0.85,
          disconfirmationResolved: true,
          direction: 'refuting',
        },
      ],
      requiredComponents: ['type_system'],
      gradeFloor: 3,
      entailmentFloor: 0.8,
      independentSourceFloor: 2,
    });

    expect(result.admitted).toBe(true);
    expect(result.direction).toBe('refuting');
    expect(result.admittedEvidenceIds.length).toBeGreaterThanOrEqual(1);
    expect(result.admittedEvidenceIds).toEqual(expect.arrayContaining(['e1', 'e2']));
    expect(result.independentSourceCount).toBeGreaterThanOrEqual(2);
  });

  it('independence floor: rejects when fewer than required independent sources', () => {
    const result = evaluateEvidenceGate({
      claims: [{ id: 'c1', text: 'claim', component: 'market' }],
      evidence: [
        {
          id: 'e1',
          claimId: 'c1',
          component: 'market',
          sourceId: 'same-source',
          independenceGroup: 'g1',
          quote: 'claim',
          sourceText: 'claim body',
          grade: 5,
          entailment: 1,
          disconfirmationResolved: true,
          direction: 'supporting',
        },
        {
          id: 'e2',
          claimId: 'c1',
          component: 'market',
          // Same sourceId — must not count as independent even if independenceGroup differs.
          sourceId: 'same-source',
          independenceGroup: 'g2',
          quote: 'claim',
          sourceText: 'claim body again',
          grade: 5,
          entailment: 1,
          disconfirmationResolved: true,
          direction: 'supporting',
        },
      ],
      requiredComponents: ['market'],
      gradeFloor: 3,
      entailmentFloor: 0.8,
      independentSourceFloor: 2,
    });

    expect(result.admitted).toBe(false);
    expect(result.independentSourceCount).toBe(1);
    expect(result.reason).toMatch(/independent source/i);
  });

  it('independence floor: admits with two distinct sourceIds', () => {
    const result = evaluateEvidenceGate({
      claims: [{ id: 'c1', text: 'claim', component: 'market' }],
      evidence: [
        {
          id: 'e1',
          claimId: 'c1',
          component: 'market',
          sourceId: 's1',
          independenceGroup: 'g1',
          quote: 'claim',
          sourceText: 'claim from s1',
          grade: 4,
          entailment: 0.9,
          disconfirmationResolved: true,
          direction: 'supporting',
        },
        {
          id: 'e2',
          claimId: 'c1',
          component: 'market',
          sourceId: 's2',
          independenceGroup: 'g2',
          quote: 'claim',
          sourceText: 'claim from s2',
          grade: 4,
          entailment: 0.9,
          disconfirmationResolved: true,
          direction: 'supporting',
        },
      ],
      requiredComponents: ['market'],
      gradeFloor: 3,
      entailmentFloor: 0.8,
      independentSourceFloor: 2,
    });

    expect(result.admitted).toBe(true);
    expect(result.independentSourceCount).toBe(2);
  });
});
