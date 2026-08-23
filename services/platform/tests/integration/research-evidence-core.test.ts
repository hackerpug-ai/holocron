/**
 * Wave 3 evidence core — integration against real PG / fleet / Jina / Exa.
 *
 * No it.skip. beforeAll throws if required services/env are missing.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     FLEET_URL=http://127.0.0.1:4545/v1 \
 *     pnpm vitest run --project integration \
 *     services/platform/tests/integration/research-evidence-core.test.ts
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { getSecretValue } from '../../src/config/secrets.ts';
import { createSql } from '../../src/db/client.ts';
import { materializeClaims } from '../../src/research/claims.ts';
import { freezeComponents } from '../../src/research/components.ts';
import {
  buildDecoys,
  checkDecoyDiscrimination,
  RESEARCH_JUDGE_DISCRIMINATION_FAILED,
} from '../../src/research/decoys.ts';
import {
  buildDisconfirmQuery,
  createMemoryDisconfirmProbeStore,
  createSqlDisconfirmProbeStore,
  DISCONFIRM_QUERY_TEMPLATE,
  runDisconfirmationProbe,
} from '../../src/research/disconfirm.ts';
import { mapLabelToScore, scoreEntailmentBatch } from '../../src/research/entailment.ts';
import { gradeEvidence } from '../../src/research/grade.ts';
import { normalizeQuote } from '../../src/research/quote-match.ts';
import { sourceTier } from '../../src/research/source-tier.ts';
import { createWebCallLedger } from '../../src/research/web-call-ledger.ts';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const DATABASE_URL = process.env.DATABASE_URL?.trim() ?? '';
const FLEET_URL = process.env.FLEET_URL?.trim() ?? '';
const TIMEOUT = 180_000;

const SRC_ROOT = resolve(import.meta.dirname, '../../src');

beforeAll(async () => {
  if (!PLATFORM_IT) {
    throw new Error('research-evidence-core requires PLATFORM_IT=1 (no mocks / no skip)');
  }
  if (!DATABASE_URL.includes('holocron_nonprod')) {
    throw new Error(
      `research-evidence-core requires DATABASE_URL→holocron_nonprod; got ${DATABASE_URL || '(missing)'}`
    );
  }
  if (!FLEET_URL) {
    throw new Error('research-evidence-core requires FLEET_URL');
  }

  const jina = getSecretValue('JINA_API_KEY') || process.env.JINA_API_KEY;
  const exa = getSecretValue('EXA_API_KEY') || process.env.EXA_API_KEY;
  if (!jina) throw new Error('research-evidence-core requires JINA_API_KEY');
  if (!exa) throw new Error('research-evidence-core requires EXA_API_KEY');

  // Ensure fleet key for extractStructured paths.
  if (!process.env.FLEET_KEY) {
    process.env.FLEET_KEY = getSecretValue('FLEET_KEY') || 'sk-none';
  }

  const fleet = await fetch(`${FLEET_URL.replace(/\/$/, '')}/models`).catch(() => null);
  if (!fleet?.ok) {
    throw new Error(`fleet unreachable at ${FLEET_URL}/models`);
  }

  const sql = createSql(DATABASE_URL);
  try {
    await sql`SELECT 1`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}, 60_000);

describe('research-evidence-core (PLATFORM_IT)', () => {
  it('social grade ≤ 2: Reddit URL + supporting quote uses shipped sourceTier ceiling', () => {
    const url = 'https://www.reddit.com/r/science/comments/abc123/title/';
    expect(sourceTier({ url })).toBe(2);

    const sourceText =
      'Community discussion notes that intermittent fasting may improve insulin sensitivity in some adults. '.repeat(
        8
      );
    const quote = 'intermittent fasting may improve insulin sensitivity in some adults';
    expect(normalizeQuote(sourceText).includes(normalizeQuote(quote))).toBe(true);

    const set = [
      {
        sourceId: 'reddit-src',
        canonicalDomain: 'reddit.com',
        url,
        publishedAt: '2024-03-01T00:00:00Z',
        text: sourceText,
        modelProposal: 5,
      },
      {
        sourceId: 'other-src',
        canonicalDomain: 'example.org',
        url: 'https://example.org/article',
        publishedAt: '2024-03-01T00:00:00Z',
        text: sourceText,
        modelProposal: 5,
      },
    ];
    const reddit = set[0];
    if (!reddit) throw new Error('expected reddit candidate');
    const graded = gradeEvidence(reddit, set);
    expect(graded.tierCeiling).toBe(2);
    expect(graded.grade).toBeLessThanOrEqual(2);

    console.log(
      JSON.stringify({
        proof: 'social-grade-le-2',
        url,
        tierCeiling: graded.tierCeiling,
        grade: graded.grade,
        corroborationBonus: graded.corroborationBonus,
      })
    );
  });

  it(
    'entailment decoy: decoy mapped to 0.90 discards whole batch (discrimination control)',
    async () => {
      const runId = randomUUID();
      // Force mapper: real → entails (0.9), decoy → entails (0.9) via injected judge.
      // If the live judge rubber-stamps everything as entails, discard MUST fire.
      const forced = await scoreEntailmentBatch({
        runId,
        items: [
          {
            id: 'real-1',
            claimText: 'Insulin signaling regulates glucose uptake',
            quote: 'insulin signaling regulates glucose uptake in skeletal muscle',
            windowText:
              'In skeletal muscle, insulin signaling regulates glucose uptake via GLUT4 translocation.',
          },
        ],
        injectDecoys: true,
        judge: async () => 'entails',
      });

      expect(forced.discarded).toBe(true);
      expect(forced.degraded).toBe(RESEARCH_JUDGE_DISCRIMINATION_FAILED);
      expect(forced.admitted).toHaveLength(0);

      // Also prove the pure checker path used by the batch.
      const decoys = buildDecoys({ runId, realCount: 1 });
      const check = checkDecoyDiscrimination([
        { id: 'real-1', kind: 'real', score: mapLabelToScore('entails') },
        ...decoys.map((d) => ({
          id: d.id,
          kind: 'decoy' as const,
          score: 0.9,
        })),
      ]);
      expect(check.discarded).toBe(true);

      console.log(
        JSON.stringify({
          proof: 'decoy-discard',
          discarded: forced.discarded,
          degraded: forced.degraded,
          decoyCount: decoys.length,
          checkOffending: check.offendingDecoyIds,
        })
      );
    },
    TIMEOUT
  );

  it(
    'disconfirm: probe persisted; flag false when search aborted; query is code-templated',
    async () => {
      // Grep-stable: template is a string literal in disconfirm.ts — not model-authored.
      const disconfirmSrc = readFileSync(resolve(SRC_ROOT, 'research/disconfirm.ts'), 'utf8');
      expect(disconfirmSrc).toContain(DISCONFIRM_QUERY_TEMPLATE);
      expect(DISCONFIRM_QUERY_TEMPLATE).toContain('criticism OR refuted OR retracted');
      expect(DISCONFIRM_QUERY_TEMPLATE).toContain('{claim}');

      const claim = 'Intermittent fasting improves insulin sensitivity';
      const query = buildDisconfirmQuery(claim);
      expect(query).toContain(claim);
      expect(query).toContain('debunked');

      const runId = randomUUID();
      const sql = createSql(DATABASE_URL);
      const memory = createMemoryDisconfirmProbeStore();
      const store = createSqlDisconfirmProbeStore(sql, memory);
      const ledger = createWebCallLedger(sql);

      try {
        // Happy path: real search (bounded).
        const ok = await runDisconfirmationProbe({
          runId,
          claimId: randomUUID(),
          claimText: claim,
          ledger,
          store,
        });
        expect(ok.probe.status === 'completed' || ok.probe.status === 'failed').toBe(true);
        // Persist always happens (memory + research_web_calls breadcrumb).
        const stored = await store.get(ok.probe.probeId);
        expect(stored).toBeTruthy();
        expect(stored?.query).toBe(query);
        expect(ok.disconfirmationResolved).toBe(ok.probe.status === 'completed');

        const rows = await sql<{ id: string; query: string | null; branch_id: string | null }[]>`
          SELECT id::text AS id, query, branch_id
          FROM research_web_calls
          WHERE id = ${ok.probe.probeId}::uuid
        `;
        expect(rows.length).toBe(1);
        expect(rows[0]?.query).toBe(query);
        expect(rows[0]?.branch_id?.startsWith('disconfirm:')).toBe(true);

        // Aborted path → flag false.
        const aborted = await runDisconfirmationProbe({
          runId,
          claimId: randomUUID(),
          claimText: claim,
          signal: AbortSignal.abort(),
          store: memory,
        });
        expect(aborted.disconfirmationResolved).toBe(false);
        expect(aborted.probe.status).toBe('aborted');

        // Failed transport path → flag false.
        const failed = await runDisconfirmationProbe({
          runId,
          claimId: randomUUID(),
          claimText: claim,
          store: memory,
          search: async () => {
            throw new Error('WEB_PROVIDER_TIMEOUT: injected');
          },
        });
        expect(failed.disconfirmationResolved).toBe(false);
        expect(failed.probe.status).toBe('failed');

        console.log(
          JSON.stringify({
            proof: 'disconfirm-probe',
            okStatus: ok.probe.status,
            okResolved: ok.disconfirmationResolved,
            abortedResolved: aborted.disconfirmationResolved,
            failedResolved: failed.disconfirmationResolved,
            query,
          })
        );
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
    TIMEOUT
  );

  it('offset quotes: model offsets sliced from stored sourceText; whitespace-normalized exact match', () => {
    const sourceText =
      'Clinical reviews report that  time-restricted eating   can lower fasting insulin in adults with obesity.';
    const frozen = freezeComponents(['mechanisms']);
    // Simulate model offsets into a passage that is the full sourceText.
    const needle = 'time-restricted eating   can lower fasting insulin';
    const start = sourceText.indexOf(needle);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = start + needle.length;

    const claims = materializeClaims({
      passageText: sourceText,
      frozen,
      raw: [
        {
          claimText: 'Time-restricted eating lowers fasting insulin',
          component: 'mechanisms',
          quoteStart: start,
          quoteEnd: end,
        },
      ],
    });
    expect(claims).toHaveLength(1);
    const quote = claims[0]?.quote;
    expect(quote).toBe(sourceText.slice(start, end));
    expect(normalizeQuote(sourceText).includes(normalizeQuote(quote))).toBe(true);

    console.log(
      JSON.stringify({
        proof: 'offset-quotes',
        quote,
        normalizedMatch: true,
        start,
        end,
      })
    );
  });
});
