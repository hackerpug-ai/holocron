/**
 * UNIT_TEST_JUSTIFIED: decideStop is pure ledger arithmetic with zero I/O.
 * Invariance under coverage_score is the critical contract — coverage is commit-only.
 */
import { describe, expect, it } from 'vitest';
import { DECIDE_STOP_FORBIDDEN_FIELDS, decideStop } from './decide-stop.ts';
import { emptyLedger, type ResearchLedger } from './schemas.ts';

function baseLedger(overrides: Partial<ResearchLedger> = {}): ResearchLedger {
  return {
    ...emptyLedger({
      query: 'what is RRF',
      mode: 'quick',
      maxRounds: 3,
      wallBudgetMs: 60_000,
      tokenBudget: 10_000,
      toolcallBudget: 20,
      startedAtMs: 1_000,
    }),
    subQuestions: [{ id: 'sq1', text: 'What is RRF?', component: 'definition', status: 'open' }],
    ...overrides,
  };
}

describe('decideStop', () => {
  it('returns null when open work remains and budgets allow', () => {
    const reason = decideStop({
      ledger: baseLedger(),
      roundJustFinished: 1,
      nowMs: 2_000,
    });
    expect(reason).toBeNull();
  });

  it('stops on all_closed when every sub-question is closed', () => {
    const reason = decideStop({
      ledger: baseLedger({
        subQuestions: [
          { id: 'sq1', text: 'What is RRF?', component: 'definition', status: 'closed' },
        ],
        findings: [
          {
            id: 'f1',
            claimText: 'RRF merges ranks',
            component: 'definition',
            quote: 'Reciprocal rank fusion merges rankings',
            sourceText:
              'Reciprocal rank fusion merges rankings from multiple retrievers into one list.',
            sourceUrl: 'https://example.com/rrf',
            sourceId: 'https://example.com/rrf',
            grade: 4,
            entailment: 0.9,
            disconfirmationResolved: true,
            direction: 'supporting',
          },
        ],
      }),
      roundJustFinished: 1,
      nowMs: 2_000,
    });
    expect(reason).toBe('all_closed');
  });

  it('stops on dry_rounds after consecutive empty rounds', () => {
    const reason = decideStop({
      ledger: baseLedger({ dryRounds: 2 }),
      roundJustFinished: 2,
      nowMs: 3_000,
    });
    expect(reason).toBe('dry_rounds');
  });

  it('stops on round_cap when finished round reaches maxRounds', () => {
    const reason = decideStop({
      ledger: baseLedger({ maxRounds: 2 }),
      roundJustFinished: 2,
      nowMs: 3_000,
    });
    expect(reason).toBe('round_cap');
  });

  it('stops on wall_budget when elapsed wall exceeds budget', () => {
    const reason = decideStop({
      ledger: baseLedger({ wallBudgetMs: 5_000, startedAtMs: 0 }),
      roundJustFinished: 1,
      nowMs: 6_000,
    });
    expect(reason).toBe('wall_budget');
  });

  it('does NOT stop on wall_budget when spend.wallMs alone would exceed budget (regression: wall elapsed must not double-count per-round wall time)', () => {
    // Regression for the double-count bug: wallElapsed was computed as
    // (nowMs - startedAtMs) + spend.wallMs, which double-counted per-round
    // wall time and truncated depth runs to a single round. Here the real
    // elapsed (nowMs - startedAtMs = 6_000) is under budget, but the
    // accumulated spend.wallMs (9_000) would have pushed the old formula
    // over. Correct behavior: continue (null), not wall_budget.
    const reason = decideStop({
      ledger: baseLedger({
        wallBudgetMs: 10_000,
        startedAtMs: 0,
        spend: { wallMs: 9_000, tokens: 0, toolCalls: 0, costUsd: 0 },
      }),
      roundJustFinished: 1,
      nowMs: 6_000,
    });
    expect(reason).toBeNull();
  });

  it('stops on token_budget / toolcall_budget', () => {
    expect(
      decideStop({
        ledger: baseLedger({ spend: { wallMs: 0, tokens: 10_000, toolCalls: 0, costUsd: 0 } }),
        roundJustFinished: 1,
        nowMs: 2_000,
      })
    ).toBe('token_budget');
    expect(
      decideStop({
        ledger: baseLedger({ spend: { wallMs: 0, tokens: 0, toolCalls: 20, costUsd: 0 } }),
        roundJustFinished: 1,
        nowMs: 2_000,
      })
    ).toBe('toolcall_budget');
  });

  it('stops on canceled / steered_stop / degraded_sense_only', () => {
    expect(
      decideStop({
        ledger: baseLedger({ stopReason: 'canceled' }),
        roundJustFinished: 1,
        nowMs: 2_000,
      })
    ).toBe('canceled');
    expect(
      decideStop({
        ledger: baseLedger({ steeredStop: true }),
        roundJustFinished: 1,
        nowMs: 2_000,
      })
    ).toBe('steered_stop');
    expect(
      decideStop({
        ledger: baseLedger({ degraded: true }),
        roundJustFinished: 1,
        nowMs: 2_000,
      })
    ).toBe('degraded_sense_only');
  });

  it('is invariant under coverageScore / admitted (never consults them)', () => {
    const low = decideStop({
      ledger: baseLedger({
        coverageScore: 0,
        admitted: false,
        subQuestions: [
          { id: 'sq1', text: 'What is RRF?', component: 'definition', status: 'closed' },
        ],
        findings: [
          {
            id: 'f1',
            claimText: 'RRF merges ranks',
            component: 'definition',
            quote: 'Reciprocal rank fusion merges rankings',
            sourceText:
              'Reciprocal rank fusion merges rankings from multiple retrievers into one list.',
            sourceUrl: 'https://example.com/rrf',
            sourceId: 'https://example.com/rrf',
            grade: 4,
            entailment: 0.9,
            disconfirmationResolved: true,
            direction: 'supporting',
          },
        ],
      } as Partial<ResearchLedger>),
      roundJustFinished: 1,
      nowMs: 2_000,
    });
    const high = decideStop({
      ledger: baseLedger({
        coverageScore: 1,
        admitted: true,
        subQuestions: [
          { id: 'sq1', text: 'What is RRF?', component: 'definition', status: 'closed' },
        ],
        findings: [
          {
            id: 'f1',
            claimText: 'RRF merges ranks',
            component: 'definition',
            quote: 'Reciprocal rank fusion merges rankings',
            sourceText:
              'Reciprocal rank fusion merges rankings from multiple retrievers into one list.',
            sourceUrl: 'https://example.com/rrf',
            sourceId: 'https://example.com/rrf',
            grade: 4,
            entailment: 0.9,
            disconfirmationResolved: true,
            direction: 'supporting',
          },
        ],
      } as Partial<ResearchLedger>),
      roundJustFinished: 1,
      nowMs: 2_000,
    });
    expect(low).toBe('all_closed');
    expect(high).toBe('all_closed');
    expect(low).toBe(high);
    for (const field of DECIDE_STOP_FORBIDDEN_FIELDS) {
      expect(field === 'coverageScore' || field === 'coverage_score' || field === 'admitted').toBe(
        true
      );
    }
  });
});
