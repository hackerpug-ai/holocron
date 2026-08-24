/**
 * acquireAdmissibleEvidence — end-to-end evidence acquisition pipeline.
 *
 * Search → read → provenance attest → claim extract (offset quotes) →
 * grade → entailment(+decoys) → disconfirm → assemble → evaluateEvidenceGate.
 *
 * evaluateEvidenceGate remains the only admission judge; floors unchanged.
 */
import { randomUUID } from 'node:crypto';
import type { Sql } from '../db/client.ts';
import { extractPassages } from '../web/extract.ts';
import { resolveOrigin } from '../web/origin.ts';
import {
  acquireDocument,
  createRunDocumentCache,
  type LadderOptions,
  ladderSearch,
} from '../web/provider.ts';
import type { CapturedSource, SearchHit, WebCallRecord } from '../web/types.ts';
import { type AssembleResult, assembleAndEvaluate } from './assemble.ts';
import { type ExtractedClaim, extractClaimsFromPassage } from './claims.ts';
import { assertComponentsFrozen, type FrozenComponents } from './components.ts';
import { RESEARCH_JUDGE_DISCRIMINATION_FAILED } from './decoys.ts';
import {
  createMemoryDisconfirmProbeStore,
  createSqlDisconfirmProbeStore,
  type DisconfirmProbeRecord,
  type DisconfirmProbeStore,
  runDisconfirmationProbe,
} from './disconfirm.ts';
import {
  buildEntailmentWindow,
  type EntailmentBatchResult,
  type JudgeFn,
  scoreEntailmentBatch,
} from './entailment.ts';
import type { EvidenceGateInput, EvidenceGateResult } from './evidence-gate.ts';
import { type GradeCandidate, gradeEvidence } from './grade.ts';
import { createProvenanceStore, type ProvenanceStore } from './provenance.ts';
import { normalizeQuote } from './quote-match.ts';
import {
  createMemoryWebCallLedger,
  createWebCallLedger,
  type WebCallLedger,
} from './web-call-ledger.ts';

/**
 * Outer per-passage budget for claim extraction. Must exceed the inner
 * role-aware call timeout inside extract-structured (divergent role
 * timeoutMs = 120s) or the outer race aborts first and extraction never
 * completes. 20s was the original value — it fired on every passage because
 * the uncapped local fleet took minutes per generation.
 */
const CLAIM_EXTRACT_TIMEOUT_MS = 150_000;

export type AcquireMode = 'shallow' | 'standard' | 'deep';

export type AcquireAdmissibleEvidenceInput = {
  question: string;
  components: FrozenComponents;
  mode: AcquireMode;
  runId: string;
  abortSignal?: AbortSignal;
  sql?: Sql;
  ledger?: WebCallLedger;
  provenance?: ProvenanceStore;
  probeStore?: DisconfirmProbeStore;
  /** Bound live fleet / web work. */
  maxHits?: number;
  maxPassagesPerDoc?: number;
  /** Test seams */
  search?: LadderOptions extends never
    ? never
    : (
        query: string,
        opts: LadderOptions
      ) => Promise<{ hits: SearchHit[]; calls: WebCallRecord[] }>;
  judge?: JudgeFn;
  skipDisconfirm?: boolean;
  skipEntailment?: boolean;
  skipClaimExtract?: boolean;
  /** Pre-captured sources for unit/integration seams (still graded via sourceTier). */
  capturedSources?: CapturedSource[];
};

export type AcquireAdmissibleEvidenceResult = {
  gateInput: EvidenceGateInput;
  gate: EvidenceGateResult;
  sources: CapturedSource[];
  findings: Array<{
    claimId: string;
    claimText: string;
    component: string;
    grade: number;
    entailment: number;
    disconfirmationResolved: boolean;
    sourceId: string;
    quote: string;
    sourceText: string;
    url: string;
  }>;
  webCalls: WebCallRecord[];
  probes: DisconfirmProbeRecord[];
  degraded: string[];
  entailment?: EntailmentBatchResult;
};

function modeMaxHits(mode: AcquireMode): number {
  switch (mode) {
    case 'shallow':
      return 5;
    case 'deep':
      return 8;
    default:
      return 5;
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function fallbackClaimFromSource(
  src: CapturedSource,
  question: string,
  component: string
): ExtractedClaim | null {
  const body = src.sourceText;
  if (body.trim().length < 40) return null;
  const keywords = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);
  const sentences = body.split(/(?<=[.!?])\s+/).map((s) => s.trim());
  const ranked = sentences
    .filter((s) => s.length >= 40 && s.length <= 360 && s !== body.trim())
    .map((s) => {
      const lower = s.toLowerCase();
      const hits = keywords.reduce((n, k) => n + (lower.includes(k) ? 1 : 0), 0);
      return { s, hits };
    })
    .sort((a, b) => b.hits - a.hits || b.s.length - a.s.length);
  const quote = ranked[0]?.s ?? null;
  if (!quote || quote.length < 12) return null;
  const quoteStart = body.indexOf(quote);
  if (quoteStart < 0) return null;
  return {
    claimText: quote.slice(0, 200),
    component,
    quote,
    quoteStart,
    quoteEnd: quoteStart + quote.length,
  };
}

/**
 * Acquire and judge evidence. Honest refusal (admitted=false + gap) is OK.
 */
export async function acquireAdmissibleEvidence(
  input: AcquireAdmissibleEvidenceInput
): Promise<AcquireAdmissibleEvidenceResult> {
  assertComponentsFrozen(input.components, [...input.components.components]);

  const degraded: string[] = [];
  const webCalls: WebCallRecord[] = [];
  const ledger =
    input.ledger ?? (input.sql ? createWebCallLedger(input.sql) : createMemoryWebCallLedger());
  const provenance = input.provenance ?? createProvenanceStore();
  const probeStore =
    input.probeStore ??
    (input.sql ? createSqlDisconfirmProbeStore(input.sql) : createMemoryDisconfirmProbeStore());

  const maxHits = input.maxHits ?? modeMaxHits(input.mode);
  const search = input.search ?? ladderSearch;
  const ladderOpts: LadderOptions = {
    runId: input.runId,
    signal: input.abortSignal,
    ledger,
  };

  // ── 1. Acquire sources ──────────────────────────────────────────────
  const sources: CapturedSource[] = [];
  if (input.capturedSources && input.capturedSources.length > 0) {
    sources.push(...input.capturedSources);
  } else {
    let hits: SearchHit[] = [];
    try {
      const searchResult = await search(input.question, ladderOpts);
      webCalls.push(...searchResult.calls);
      hits = searchResult.hits.slice(0, maxHits);
    } catch (err) {
      const code = err instanceof Error ? err.message.split(':')[0] : 'SEARCH_FAILED';
      degraded.push(code ?? 'SEARCH_FAILED');
      hits = [];
    }

    const cache = createRunDocumentCache(ladderOpts);
    for (const hit of hits) {
      if (input.abortSignal?.aborted) {
        degraded.push('ABORT_SIGNAL');
        break;
      }
      try {
        const acquired = await acquireDocument(hit, { ...ladderOpts, cache });
        if (acquired.call) webCalls.push(acquired.call);
        const doc = acquired.document;
        const origin = resolveOrigin({
          finalUrl: doc.finalUrl,
          text: doc.sourceText,
        });
        provenance.attest(doc.sourceText, {
          url: doc.url,
          finalUrl: doc.finalUrl,
          fetchedAt: doc.retrievedAt,
          provider: doc.provider,
          acquisition: doc.acquisition,
          webCallId: doc.webCallId,
          byteLength: Buffer.byteLength(doc.sourceText, 'utf8'),
        });
        sources.push({
          sourceId: origin.sourceId,
          canonicalDomain: origin.canonicalDomain,
          url: doc.finalUrl,
          publishedDate: doc.publishedAt,
          retrievedAt: doc.retrievedAt,
          sourceText: doc.sourceText,
          provider: doc.provider,
          webCallId: doc.webCallId,
        });
      } catch (err) {
        const code = err instanceof Error ? err.message.split(':')[0] : 'READ_FAILED';
        degraded.push(code ?? 'READ_FAILED');
      }
    }
  }

  // Attest any pre-captured / already-acquired sources (idempotent).
  for (const src of sources) {
    provenance.attest(src.sourceText, {
      url: src.url,
      finalUrl: src.url,
      fetchedAt: src.retrievedAt,
      provider: src.provider,
      acquisition: 'inline',
      webCallId: src.webCallId,
      byteLength: Buffer.byteLength(src.sourceText, 'utf8'),
    });
  }

  // ── 2. Extract claims (offset quotes) ───────────────────────────────
  type WorkingClaim = ExtractedClaim & {
    claimId: string;
    sourceId: string;
    sourceText: string;
    url: string;
    canonicalDomain: string;
    publishedAt: string | null;
    originKey?: string | null;
  };

  const working: WorkingClaim[] = [];
  const maxPassages = input.maxPassagesPerDoc ?? (input.mode === 'shallow' ? 1 : 2);

  if (input.skipClaimExtract) {
    // Integration seam: one claim per source using a verified substring.
    for (const src of sources) {
      const quote =
        src.sourceText.length > 80 ? src.sourceText.slice(0, 80).trim() : src.sourceText.trim();
      if (quote.length < 12) continue;
      const component = input.components.components[0] ?? 'evidence';
      working.push({
        claimId: randomUUID(),
        claimText: `${input.question}: ${quote.slice(0, 96)}`,
        component,
        quote,
        quoteStart: 0,
        quoteEnd: quote.length,
        sourceId: src.sourceId,
        sourceText: src.sourceText,
        url: src.url,
        canonicalDomain: src.canonicalDomain,
        publishedAt: src.publishedDate,
      });
    }
  } else {
    for (const src of sources) {
      if (input.abortSignal?.aborted) break;
      const passages = extractPassages(src.sourceText).slice(0, maxPassages);
      for (const passage of passages) {
        try {
          const claims = await withTimeout(
            extractClaimsFromPassage({
              passageText: passage.text,
              frozen: input.components,
              question: input.question,
            }),
            // Must exceed extract-structured's role-aware call budget (divergent
            // role timeoutMs = 120s) or the outer race always aborts first and
            // claims never extract. 20s previously killed EVERY extraction
            // because the uncapped local fleet took minutes per passage.
            CLAIM_EXTRACT_TIMEOUT_MS,
            'CLAIM_EXTRACT'
          );
          for (const claim of claims) {
            working.push({
              claimId: randomUUID(),
              claimText: claim.claimText,
              component: claim.component,
              quote: claim.quote,
              quoteStart: claim.quoteStart,
              quoteEnd: claim.quoteEnd,
              sourceId: src.sourceId,
              sourceText: src.sourceText,
              url: src.url,
              canonicalDomain: src.canonicalDomain,
              publishedAt: src.publishedDate,
            });
          }
        } catch (err) {
          const code =
            err instanceof Error && 'code' in err
              ? String((err as { code: unknown }).code)
              : 'CLAIM_EXTRACT_FAILED';
          degraded.push(code);
          const fallback = fallbackClaimFromSource(
            src,
            input.question,
            input.components.components[0] ?? 'evidence'
          );
          if (fallback) {
            working.push({
              claimId: randomUUID(),
              claimText: fallback.claimText,
              component: fallback.component,
              quote: fallback.quote,
              quoteStart: fallback.quoteStart,
              quoteEnd: fallback.quoteEnd,
              sourceId: src.sourceId,
              sourceText: src.sourceText,
              url: src.url,
              canonicalDomain: src.canonicalDomain,
              publishedAt: src.publishedDate,
            });
          }
        }
      }
    }
  }

  // ── 3. Grade (full-set corroboration) ───────────────────────────────
  const gradeCandidates: GradeCandidate[] = working.map((w) => ({
    sourceId: w.sourceId,
    canonicalDomain: w.canonicalDomain,
    url: w.url,
    publishedAt: w.publishedAt,
    text: w.sourceText,
    originKey: w.originKey,
  }));

  const grades = working.map((w, i) => {
    const candidate = gradeCandidates[i];
    if (!candidate) {
      throw new Error(`missing grade candidate at index ${i}`);
    }
    return {
      working: w,
      grade: gradeEvidence(candidate, gradeCandidates),
    };
  });

  // ── 4. Entailment + decoys ─────────────────────────────────────────
  let entailmentResult: EntailmentBatchResult | undefined;
  const entailmentByClaim = new Map<string, number>();

  function isIdentityEntailment(claimText: string, quote: string): boolean {
    const claim = normalizeQuote(claimText);
    const q = normalizeQuote(quote);
    if (claim.length < 12 || q.length < 12) return false;
    return q.includes(claim) || claim.includes(q);
  }

  const identityGrades = grades.filter(({ working: w }) =>
    isIdentityEntailment(w.claimText, w.quote)
  );
  const judgedGrades = grades.filter(
    ({ working: w }) => !isIdentityEntailment(w.claimText, w.quote)
  );
  for (const { working: w } of identityGrades) {
    entailmentByClaim.set(w.claimId, 0.9);
  }

  if (!input.skipEntailment && judgedGrades.length > 0) {
    try {
      entailmentResult = await withTimeout(
        scoreEntailmentBatch({
          runId: input.runId,
          items: judgedGrades.map(({ working: w }) => ({
            id: w.claimId,
            claimText: w.claimText,
            quote: w.quote,
            windowText: buildEntailmentWindow({
              sourceText: w.sourceText,
              quote: w.quote,
            }),
          })),
          judge: input.judge,
        }),
        90_000,
        'ENTAILMENT'
      );
    } catch (err) {
      const code = err instanceof Error ? err.message.split(':')[0] : 'ENTAILMENT_FAILED';
      degraded.push(code ?? 'ENTAILMENT_FAILED');
    }

    if (entailmentResult?.discarded) {
      degraded.push(RESEARCH_JUDGE_DISCRIMINATION_FAILED);
    } else if (entailmentResult) {
      for (const score of entailmentResult.admitted) {
        entailmentByClaim.set(score.id, score.score);
      }
    }
  } else if (input.skipEntailment) {
    for (const { working: w } of grades) {
      entailmentByClaim.set(w.claimId, 0.5);
    }
  }

  // ── 5. Disconfirmation probes ───────────────────────────────────────
  const probes: DisconfirmProbeRecord[] = [];
  const disconfirmByClaim = new Map<string, boolean>();

  if (!input.skipDisconfirm) {
    for (const { working: w } of grades) {
      if (input.abortSignal?.aborted) {
        disconfirmByClaim.set(w.claimId, false);
        degraded.push('ABORT_SIGNAL');
        continue;
      }
      // Only probe claims that survived entailment (or skipEntailment path).
      if (
        !entailmentResult?.discarded &&
        !entailmentByClaim.has(w.claimId) &&
        !input.skipEntailment
      ) {
        disconfirmByClaim.set(w.claimId, false);
        continue;
      }
      const result = await runDisconfirmationProbe({
        runId: input.runId,
        claimId: w.claimId,
        claimText: w.claimText,
        signal: input.abortSignal,
        ledger,
        store: probeStore,
      });
      probes.push(result.probe);
      webCalls.push(...result.calls);
      disconfirmByClaim.set(w.claimId, result.disconfirmationResolved);
    }
  } else {
    for (const { working: w } of grades) {
      disconfirmByClaim.set(w.claimId, false);
    }
  }

  // ── 6. Assemble + gate ──────────────────────────────────────────────
  const rows = grades
    .filter(({ working: w }) => {
      if (entailmentResult?.discarded) return false;
      if (input.skipEntailment === true) return true;
      if (entailmentResult) return entailmentByClaim.has(w.claimId);
      // Judge timed out — keep graded rows at entailment 0 so the gate can refuse honestly.
      return true;
    })
    .map(({ working: w, grade }) => ({
      claimId: w.claimId,
      claimText: w.claimText,
      component: w.component,
      sourceId: w.sourceId,
      quote: w.quote,
      sourceText: w.sourceText,
      url: w.url,
      grade: grade.grade,
      entailment: entailmentByClaim.get(w.claimId) ?? 0,
      disconfirmationResolved: disconfirmByClaim.get(w.claimId) ?? false,
      direction: 'supporting' as const,
    }));

  let assembled: AssembleResult;
  try {
    assembled = assembleAndEvaluate({
      frozen: input.components,
      rows,
      provenance,
      skipAttestation: rows.length === 0,
    });
  } catch (err) {
    // Honest empty gate on assembly failure.
    const code = err instanceof Error ? err.message : 'ASSEMBLE_FAILED';
    degraded.push(code);
    const emptyInput: EvidenceGateInput = {
      claims: [],
      evidence: [],
      requiredComponents: [...input.components.components],
      gradeFloor: 3,
      entailmentFloor: 0.8,
      independentSourceFloor: 2,
    };
    const { evaluateEvidenceGate } = await import('./evidence-gate.ts');
    return {
      gateInput: emptyInput,
      gate: evaluateEvidenceGate(emptyInput),
      sources,
      findings: [],
      webCalls,
      probes,
      degraded,
      entailment: entailmentResult,
    };
  }

  return {
    gateInput: assembled.gateInput,
    gate: assembled.gate,
    sources,
    findings: rows.map((r) => ({
      claimId: r.claimId,
      claimText: r.claimText,
      component: r.component,
      grade: r.grade,
      entailment: r.entailment,
      disconfirmationResolved: r.disconfirmationResolved,
      sourceId: r.sourceId,
      quote: r.quote,
      sourceText: r.sourceText,
      url: r.url,
    })),
    webCalls,
    probes,
    degraded,
    entailment: entailmentResult,
  };
}
