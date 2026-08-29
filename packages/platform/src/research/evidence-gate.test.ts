/**
 * Pure-TS evidence gate unit tests (pipes-1 AC-3 / TC-2 / TC-4).
 * No I/O — deterministic admission only.
 *
 * UNIT_TEST_JUSTIFIED: pure string/schema admission with zero I/O.
 */
import { describe, expect, it } from 'vitest';
import { evaluateEvidenceGate } from './evidence-gate.ts';

const LONG_QUOTE = 'TypeScript types are optional';

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
          quote: LONG_QUOTE,
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
          quote: LONG_QUOTE,
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
      claims: [{ id: 'c1', text: 'market claim text', component: 'market' }],
      evidence: [
        {
          id: 'e1',
          claimId: 'c1',
          component: 'market',
          sourceId: 'same-source',
          independenceGroup: 'g1',
          quote: 'market claim text',
          sourceText: 'market claim text body',
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
          quote: 'market claim text',
          sourceText: 'market claim text body again',
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
      claims: [{ id: 'c1', text: 'market claim text', component: 'market' }],
      evidence: [
        {
          id: 'e1',
          claimId: 'c1',
          component: 'market',
          sourceId: 's1',
          independenceGroup: 'g1',
          quote: 'market claim text',
          sourceText: 'market claim text from s1',
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
          quote: 'market claim text',
          sourceText: 'market claim text from s2',
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

  it('admits whitespace-rewrapped quote that would fail raw includes', () => {
    const sourceText =
      'The runtime verifies that market claim text appears verbatim in the source body.';
    // Quote with extra newlines/spaces — raw sourceText.includes(quote) is false.
    const rewrappedQuote = 'market\n  claim   text';
    expect(sourceText.includes(rewrappedQuote)).toBe(false);

    const result = evaluateEvidenceGate({
      claims: [{ id: 'c1', text: 'market claim text', component: 'market' }],
      evidence: [
        {
          id: 'e1',
          claimId: 'c1',
          component: 'market',
          sourceId: 's1',
          independenceGroup: 'g1',
          quote: rewrappedQuote,
          sourceText,
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
          quote: rewrappedQuote,
          sourceText: `${sourceText} (corroborating)`,
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
    expect(result.admittedEvidenceIds).toEqual(expect.arrayContaining(['e1', 'e2']));
  });
});
