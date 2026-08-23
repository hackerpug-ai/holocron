/**
 * Wave 8 — Deterministic research scorers over real persisted Postgres rows.
 *
 * Reads research_sessions / research_iterations / research_findings / citations /
 * research_web_calls. Never scores in-memory fakes.
 *
 * Hard thresholds:
 *   quote-verifiability = 1.0 (verifyQuote exact-normalized; allowLines:false)
 *   citation-accuracy  ≥ 0.90
 *   remaining scorers  = 1.0 unless documented otherwise
 *
 * Judged scorers (gap-honesty / completeness / coherence) are drift-gated only;
 * gap-honesty is implemented deterministically (gap-token required when gate not admitted).
 */

import { createSql, type Sql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { type EvidenceGateResult, evaluateEvidenceGate } from '../research/evidence-gate.ts';
import { verifyQuote } from '../research/quote-match.ts';
import { etldPlusOne } from '../web/origin.ts';

export const RESEARCH_SCORER_IDS = [
  'quote-verifiability',
  'citation-accuracy',
  'no-fabricated-source',
  'iteration-monotonicity',
  'coverage',
  'independence',
  'resolvability',
  'diversity',
  'recency',
  'report-invariants',
  'gap-honesty',
  'completeness',
  'coherence',
] as const;

export type ResearchScorerId = (typeof RESEARCH_SCORER_IDS)[number];

/** Hard CI thresholds. Judged scorers are drift-only (threshold null). */
export const RESEARCH_SCORER_THRESHOLDS: Record<ResearchScorerId, number | null> = {
  'quote-verifiability': 1.0,
  'citation-accuracy': 0.9,
  'no-fabricated-source': 1.0,
  'iteration-monotonicity': 1.0,
  coverage: 1.0,
  independence: 1.0,
  resolvability: 1.0,
  diversity: 1.0,
  recency: 1.0,
  'report-invariants': 1.0,
  'gap-honesty': null, // drift-gated; absolute score does not fail CI
  completeness: null,
  coherence: null,
};

export type ResearchQuotePair = {
  quote: string;
  sourceText: string;
  url?: string | null;
  sourceId?: string | null;
  independenceGroup?: string | null;
  publishedDate?: string | null;
  citationId?: string | null;
};

export type ResearchSessionSnapshot = {
  sessionId: string;
  status: string;
  coverageScore: number | null;
  currentCoverageScore: number | null;
  findings: unknown;
  plan: unknown;
  finalConfidenceSummary: unknown;
  errorText: string | null;
  iterations: Array<{
    id: string;
    iterationNumber: number | null;
    summary: string | null;
    feedback: string | null;
    coverageScore: number | null;
    sources: unknown;
    reviewGaps: unknown;
    status: string;
  }>;
  findingsRows: Array<{
    id: string;
    claimText: string | null;
    citationIds: unknown;
  }>;
  citations: Array<{
    id: string;
    sourceUrl: string | null;
    sourceDomain: string | null;
    claimText: string | null;
    claimMarker: string | null;
    publishedDate: string | null;
    metadataJson: unknown;
  }>;
  webCalls: Array<{
    id: string;
    url: string | null;
    sourceId: string | null;
    createdAt: Date | string | null;
  }>;
};

export type ResearchScorerResult = {
  id: ResearchScorerId;
  score: number;
  threshold: number | null;
  passed: boolean;
  /** When threshold is null, absolute score never fails CI (drift-only). */
  driftOnly: boolean;
  reason: string;
  details?: Record<string, unknown>;
};

export type ResearchEvalReport = {
  sessionId: string;
  scores: ResearchScorerResult[];
  passed: boolean;
  failures: ResearchScorerResult[];
  exitCode: number;
};

type SqlOpts = { databaseUrl?: string; sql?: Sql };

function resolveSql(opts: SqlOpts, context: string): { sql: Sql; ownsSql: boolean } {
  if (opts.sql) return { sql: opts.sql, ownsSql: false };
  return {
    sql: createSql(
      resolveHolocronNonprodDatabaseUrl({
        databaseUrl: opts.databaseUrl,
        context,
      })
    ),
    ownsSql: true,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const GAP_TOKEN_RE = /\b(gap|gaps|insufficient|not\s+admitted|inadmissible|missing\s+evidence)\b/i;

/**
 * Load a durable research session + related rows for scoring.
 */
export async function loadResearchSessionSnapshot(
  sessionId: string,
  opts: SqlOpts = {}
): Promise<ResearchSessionSnapshot> {
  const { sql, ownsSql } = resolveSql(opts, 'research eval scorers');
  try {
    const sessions = await sql<
      {
        id: string;
        status: string;
        coverage_score: number | null;
        current_coverage_score: number | null;
        findings: unknown;
        plan: unknown;
        final_confidence_summary: unknown;
        error_text: string | null;
      }[]
    >`
      SELECT
        id::text AS id,
        status,
        coverage_score,
        current_coverage_score,
        findings,
        plan,
        final_confidence_summary,
        error_text
      FROM research_sessions
      WHERE id = ${sessionId}::uuid
      LIMIT 1
    `;
    const session = sessions[0];
    if (!session) {
      throw new Error(`research session not found: ${sessionId}`);
    }

    const iterations = await sql<
      {
        id: string;
        iteration_number: number | null;
        summary: string | null;
        feedback: string | null;
        coverage_score: number | null;
        sources: unknown;
        review_gaps: unknown;
        status: string;
      }[]
    >`
      SELECT
        id::text AS id,
        iteration_number,
        summary,
        feedback,
        coverage_score,
        sources,
        review_gaps,
        status
      FROM research_iterations
      WHERE session_id = ${sessionId}::uuid
      ORDER BY iteration_number ASC NULLS LAST, created_at ASC
    `;

    const findingsRows = await sql<
      { id: string; claim_text: string | null; citation_ids: unknown }[]
    >`
      SELECT id::text AS id, claim_text, citation_ids
      FROM research_findings
      WHERE session_id = ${sessionId}::uuid
      ORDER BY created_at ASC
    `;

    const citations = await sql<
      {
        id: string;
        source_url: string | null;
        source_domain: string | null;
        claim_text: string | null;
        claim_marker: string | null;
        published_date: string | null;
        metadata_json: unknown;
      }[]
    >`
      SELECT
        id::text AS id,
        source_url,
        source_domain,
        claim_text,
        claim_marker,
        published_date,
        metadata_json
      FROM citations
      WHERE session_id = ${sessionId}::uuid
         OR deep_research_session_id = ${sessionId}::uuid
      ORDER BY created_at ASC
    `;

    const webCalls = await sql<
      {
        id: string;
        url: string | null;
        source_id: string | null;
        created_at: Date | string | null;
      }[]
    >`
      SELECT id::text AS id, url, source_id, created_at
      FROM research_web_calls
      WHERE session_id = ${sessionId}::uuid
      ORDER BY created_at ASC
    `;

    return {
      sessionId: session.id,
      status: session.status,
      coverageScore: session.coverage_score,
      currentCoverageScore: session.current_coverage_score,
      findings: session.findings,
      plan: session.plan,
      finalConfidenceSummary: session.final_confidence_summary,
      errorText: session.error_text,
      iterations: iterations.map((row) => ({
        id: row.id,
        iterationNumber: row.iteration_number,
        summary: row.summary,
        feedback: row.feedback,
        coverageScore: row.coverage_score,
        sources: row.sources,
        reviewGaps: row.review_gaps,
        status: row.status,
      })),
      findingsRows: findingsRows.map((row) => ({
        id: row.id,
        claimText: row.claim_text,
        citationIds: row.citation_ids,
      })),
      citations: citations.map((row) => ({
        id: row.id,
        sourceUrl: row.source_url,
        sourceDomain: row.source_domain,
        claimText: row.claim_text,
        claimMarker: row.claim_marker,
        publishedDate: row.published_date,
        metadataJson: row.metadata_json,
      })),
      webCalls: webCalls.map((row) => ({
        id: row.id,
        url: row.url,
        sourceId: row.source_id,
        createdAt: row.created_at,
      })),
    };
  } finally {
    if (ownsSql) await sql.end({ timeout: 5 });
  }
}

function pushQuotePair(out: ResearchQuotePair[], pair: ResearchQuotePair): void {
  const quote = pair.quote?.trim() ?? '';
  const sourceText = pair.sourceText?.trim() ?? '';
  if (!quote || !sourceText) return;
  out.push({ ...pair, quote, sourceText });
}

function extractFromEvidenceItem(item: unknown, out: ResearchQuotePair[]): void {
  const rec = asRecord(item);
  if (!rec) return;
  const quote = str(rec.quote);
  const sourceText = str(rec.sourceText) ?? str(rec.source_text);
  if (quote && sourceText) {
    pushQuotePair(out, {
      quote,
      sourceText,
      url: str(rec.url) ?? str(rec.sourceUrl),
      sourceId: str(rec.sourceId) ?? str(rec.source_id),
      independenceGroup: str(rec.independenceGroup) ?? str(rec.independence_group),
      publishedDate:
        str(rec.publishedDate) ?? str(rec.published_date) ?? str(rec.publishedAt) ?? null,
      citationId: str(rec.citationId) ?? str(rec.citation_id),
    });
  }
}

/**
 * Collect quote/sourceText pairs from session findings JSON, citation metadata,
 * and iteration findings payloads.
 */
export function extractQuotePairs(snapshot: ResearchSessionSnapshot): ResearchQuotePair[] {
  const out: ResearchQuotePair[] = [];

  const findingsRoot = snapshot.findings;
  const findingsRec = asRecord(findingsRoot);
  if (findingsRec) {
    for (const item of asArray(findingsRec.evidence)) extractFromEvidenceItem(item, out);
    for (const item of asArray(findingsRec.items)) extractFromEvidenceItem(item, out);
    for (const item of asArray(findingsRec.quotes)) extractFromEvidenceItem(item, out);
  }
  for (const item of asArray(findingsRoot)) extractFromEvidenceItem(item, out);

  for (const citation of snapshot.citations) {
    const meta = asRecord(citation.metadataJson);
    if (!meta) continue;
    const quote = str(meta.quote) ?? str(meta.claimQuote);
    const sourceText = str(meta.sourceText) ?? str(meta.source_text);
    if (quote && sourceText) {
      pushQuotePair(out, {
        quote,
        sourceText,
        url: citation.sourceUrl,
        sourceId: str(meta.sourceId) ?? str(meta.source_id),
        independenceGroup: str(meta.independenceGroup) ?? str(meta.independence_group),
        publishedDate: citation.publishedDate ?? str(meta.publishedDate),
        citationId: citation.id,
      });
    }
  }

  for (const iter of snapshot.iterations) {
    const sources = asArray(iter.sources);
    for (const src of sources) {
      const rec = asRecord(src);
      if (!rec) continue;
      const quote = str(rec.quote);
      const sourceText = str(rec.sourceText) ?? str(rec.source_text);
      if (quote && sourceText) {
        pushQuotePair(out, {
          quote,
          sourceText,
          url: str(rec.url) ?? str(rec.sourceUrl),
          sourceId: str(rec.sourceId),
          independenceGroup: str(rec.independenceGroup),
          publishedDate: str(rec.publishedDate),
          citationId: str(rec.citationId),
        });
      }
    }
  }

  return out;
}

function resolveGate(snapshot: ResearchSessionSnapshot): {
  admitted: boolean | null;
  reason: string | null;
  independentSourceCount: number | null;
  gate: EvidenceGateResult | null;
} {
  const summary = asRecord(snapshot.finalConfidenceSummary);
  const plan = asRecord(snapshot.plan);
  const planGate = asRecord(plan?.gate);

  const candidate = summary ?? planGate;
  if (candidate && typeof candidate.admitted === 'boolean') {
    return {
      admitted: candidate.admitted,
      reason: str(candidate.reason) ?? str(candidate.gateReasonCode),
      independentSourceCount: num(candidate.independentSourceCount),
      gate: candidate as unknown as EvidenceGateResult,
    };
  }

  // Recompute from persisted findings when shape matches EvidenceGateInput.
  const findings = asRecord(snapshot.findings);
  if (findings && Array.isArray(findings.claims) && Array.isArray(findings.evidence)) {
    try {
      const gate = evaluateEvidenceGate(findings as never);
      return {
        admitted: gate.admitted,
        reason: gate.reason,
        independentSourceCount: gate.independentSourceCount,
        gate,
      };
    } catch {
      // fall through
    }
  }

  return { admitted: null, reason: null, independentSourceCount: null, gate: null };
}

function citedUrls(snapshot: ResearchSessionSnapshot): string[] {
  const urls = new Set<string>();
  for (const c of snapshot.citations) {
    if (c.sourceUrl?.trim()) urls.add(c.sourceUrl.trim());
  }
  for (const iter of snapshot.iterations) {
    for (const src of asArray(iter.sources)) {
      const rec = asRecord(src);
      const url = str(rec?.url) ?? str(rec?.sourceUrl);
      if (url) urls.add(url);
    }
  }
  for (const pair of extractQuotePairs(snapshot)) {
    if (pair.url?.trim()) urls.add(pair.url.trim());
  }
  return [...urls];
}

function scoreResult(
  id: ResearchScorerId,
  score: number,
  reason: string,
  details?: Record<string, unknown>
): ResearchScorerResult {
  const threshold = RESEARCH_SCORER_THRESHOLDS[id];
  const driftOnly = threshold == null;
  const clamped = Math.min(1, Math.max(0, score));
  const passed = driftOnly ? true : clamped >= (threshold as number);
  return { id, score: clamped, threshold, passed, driftOnly, reason, details };
}

/** 1. quote-verifiability — every quote must verify via exact-normalized match. */
export function scoreQuoteVerifiability(snapshot: ResearchSessionSnapshot): ResearchScorerResult {
  const pairs = extractQuotePairs(snapshot);
  if (pairs.length === 0) {
    return scoreResult('quote-verifiability', 0, 'no quote/sourceText pairs persisted', {
      pairCount: 0,
    });
  }
  let ok = 0;
  const failures: Array<{ quotePreview: string; mode: string | null }> = [];
  for (const pair of pairs) {
    const check = verifyQuote(pair.quote, pair.sourceText, { allowLines: false });
    if (check.ok) ok += 1;
    else {
      failures.push({
        quotePreview: pair.quote.slice(0, 48),
        mode: check.mode,
      });
    }
  }
  const score = ok / pairs.length;
  return scoreResult(
    'quote-verifiability',
    score,
    score >= 1
      ? `all ${pairs.length} quotes verify (exact-normalized)`
      : `${pairs.length - ok}/${pairs.length} quotes failed verifyQuote`,
    { pairCount: pairs.length, okCount: ok, failures }
  );
}

/** 2. citation-accuracy — cited URLs/quotes match stored citation + web-call sources. */
export function scoreCitationAccuracy(snapshot: ResearchSessionSnapshot): ResearchScorerResult {
  const pairs = extractQuotePairs(snapshot);
  const citationUrls = new Set(
    snapshot.citations.map((c) => c.sourceUrl?.trim()).filter((u): u is string => Boolean(u))
  );
  const webUrls = new Set(
    snapshot.webCalls.map((c) => c.url?.trim()).filter((u): u is string => Boolean(u))
  );
  const urls = citedUrls(snapshot);
  if (urls.length === 0 && pairs.length === 0) {
    return scoreResult('citation-accuracy', 0, 'no citations or quote pairs to score', {
      urlCount: 0,
    });
  }

  let matched = 0;
  let total = 0;
  for (const url of urls) {
    total += 1;
    if (citationUrls.has(url) || webUrls.has(url)) matched += 1;
  }
  // Quote pairs without URL still contribute via verifyQuote against their sourceText.
  for (const pair of pairs) {
    total += 1;
    const verified = verifyQuote(pair.quote, pair.sourceText, { allowLines: false }).ok;
    const urlOk = pair.url ? citationUrls.has(pair.url) || webUrls.has(pair.url) : true;
    if (verified && urlOk) matched += 1;
  }

  const score = total === 0 ? 0 : matched / total;
  return scoreResult('citation-accuracy', score, `matched ${matched}/${total} citation checks`, {
    matched,
    total,
    citationUrlCount: citationUrls.size,
    webUrlCount: webUrls.size,
  });
}

/** 3. no-fabricated-source — every cited URL has a prior research_web_calls row. */
export function scoreNoFabricatedSource(snapshot: ResearchSessionSnapshot): ResearchScorerResult {
  const urls = citedUrls(snapshot);
  if (urls.length === 0) {
    // No citations ⇒ nothing fabricated.
    return scoreResult('no-fabricated-source', 1, 'no cited URLs (vacuously pass)', {
      urlCount: 0,
    });
  }
  const webUrls = new Set(
    snapshot.webCalls.map((c) => c.url?.trim()).filter((u): u is string => Boolean(u))
  );
  const missing = urls.filter((u) => !webUrls.has(u));
  const score = missing.length === 0 ? 1 : Math.max(0, 1 - missing.length / urls.length);
  return scoreResult(
    'no-fabricated-source',
    score,
    missing.length === 0
      ? `all ${urls.length} cited URLs have research_web_calls rows`
      : `${missing.length} cited URLs lack research_web_calls`,
    { urlCount: urls.length, missingCount: missing.length, missingPreview: missing.slice(0, 5) }
  );
}

/** 4. iteration-monotonicity — iteration_number strictly increasing + unique. */
export function scoreIterationMonotonicity(
  snapshot: ResearchSessionSnapshot
): ResearchScorerResult {
  const nums = snapshot.iterations
    .map((i) => i.iterationNumber)
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  if (nums.length === 0) {
    return scoreResult('iteration-monotonicity', 1, 'no iterations (vacuously pass)', {
      count: 0,
    });
  }
  const unique = new Set(nums);
  if (unique.size !== nums.length) {
    return scoreResult('iteration-monotonicity', 0, 'duplicate iteration_number in session', {
      nums,
    });
  }
  for (let i = 1; i < nums.length; i++) {
    if (nums[i]! <= nums[i - 1]!) {
      return scoreResult(
        'iteration-monotonicity',
        0,
        `iteration_number not strictly increasing at index ${i}`,
        { nums }
      );
    }
  }
  return scoreResult('iteration-monotonicity', 1, `strictly increasing unique ${nums.join(',')}`, {
    nums,
  });
}

/** 5. coverage — coverage_score in 1..5 when terminal. */
export function scoreCoverage(snapshot: ResearchSessionSnapshot): ResearchScorerResult {
  const terminal = ['completed', 'failed', 'cancelled'].includes(snapshot.status);
  if (!terminal) {
    return scoreResult(
      'coverage',
      1,
      `non-terminal status ${snapshot.status} — coverage deferred`,
      {
        status: snapshot.status,
      }
    );
  }
  const candidates = [
    snapshot.coverageScore,
    snapshot.currentCoverageScore,
    ...snapshot.iterations.map((i) => i.coverageScore),
  ].filter((n): n is number => typeof n === 'number' && Number.isFinite(n));

  if (candidates.length === 0) {
    return scoreResult('coverage', 0, 'terminal session missing coverage_score', {
      status: snapshot.status,
    });
  }
  const last = candidates[candidates.length - 1]!;
  // Accept either 1..5 integer scale or 0..1 fraction mapped (*5).
  const onFive = last >= 1 && last <= 5 ? last : last >= 0 && last <= 1 ? last * 5 : last;
  const ok = onFive >= 1 && onFive <= 5;
  return scoreResult(
    'coverage',
    ok ? 1 : 0,
    ok ? `coverage_score ${last} within 1..5` : `coverage_score ${last} outside 1..5`,
    { raw: last, onFive, status: snapshot.status }
  );
}

/** 6. independence — count distinct sourceId (never independenceGroup). */
export function scoreIndependence(snapshot: ResearchSessionSnapshot): ResearchScorerResult {
  const pairs = extractQuotePairs(snapshot);
  const sourceIds = new Set(
    pairs.map((p) => p.sourceId).filter((id): id is string => Boolean(id?.trim()))
  );
  const gate = resolveGate(snapshot);
  const expected = gate.independentSourceCount;
  if (sourceIds.size === 0 && expected == null) {
    // Fall back to web-call source_id / citation count as weak signal.
    const webIds = new Set(
      snapshot.webCalls.map((c) => c.sourceId).filter((id): id is string => Boolean(id?.trim()))
    );
    if (webIds.size >= 1) {
      return scoreResult('independence', 1, `distinct web-call sourceId count=${webIds.size}`, {
        sourceIds: [...webIds],
      });
    }
    return scoreResult('independence', 0, 'no distinct sourceId values found', { sourceIds: [] });
  }
  if (expected != null && sourceIds.size < expected) {
    return scoreResult(
      'independence',
      Math.min(1, sourceIds.size / Math.max(1, expected)),
      `sourceId count ${sourceIds.size} < gate independentSourceCount ${expected}`,
      { sourceIds: [...sourceIds], expected }
    );
  }
  return scoreResult('independence', 1, `distinct sourceId count=${sourceIds.size}`, {
    sourceIds: [...sourceIds],
    expected,
  });
}

/** 7. resolvability — quotes resolve into sourceText (alias of verifyQuote). */
export function scoreResolvability(snapshot: ResearchSessionSnapshot): ResearchScorerResult {
  const pairs = extractQuotePairs(snapshot);
  if (pairs.length === 0) {
    return scoreResult('resolvability', 0, 'no quote pairs to resolve', { pairCount: 0 });
  }
  let ok = 0;
  for (const pair of pairs) {
    if (verifyQuote(pair.quote, pair.sourceText, { allowLines: false }).ok) ok += 1;
  }
  const score = ok / pairs.length;
  return scoreResult(
    'resolvability',
    score,
    `${ok}/${pairs.length} quotes resolve into sourceText`,
    { ok, pairCount: pairs.length }
  );
}

/** 8. diversity — distinct canonical domains among cited sources. */
export function scoreDiversity(snapshot: ResearchSessionSnapshot): ResearchScorerResult {
  const domains = new Set<string>();
  for (const c of snapshot.citations) {
    const host = c.sourceDomain?.trim() || (c.sourceUrl ? etldPlusOne(c.sourceUrl) : '');
    if (host) domains.add(host.toLowerCase());
  }
  for (const url of citedUrls(snapshot)) {
    try {
      domains.add(etldPlusOne(url).toLowerCase());
    } catch {
      // ignore
    }
  }
  if (domains.size === 0) {
    return scoreResult('diversity', 0, 'no canonical domains among citations', { domains: [] });
  }
  // Pass when ≥1 domain present; richer diversity is informational.
  return scoreResult('diversity', 1, `distinct canonical domains=${domains.size}`, {
    domains: [...domains],
  });
}

/**
 * 9. recency — publishedDate present-or-null, never invented.
 * Null counts as pass. Invented future dates (> now + 1d) fail.
 */
export function scoreRecency(
  snapshot: ResearchSessionSnapshot,
  now: Date = new Date()
): ResearchScorerResult {
  const dates: Array<string | null> = [];
  for (const c of snapshot.citations) {
    dates.push(c.publishedDate ?? null);
  }
  for (const pair of extractQuotePairs(snapshot)) {
    if ('publishedDate' in pair) dates.push(pair.publishedDate ?? null);
  }
  if (dates.length === 0) {
    return scoreResult('recency', 1, 'no publishedDate fields (vacuously pass)', { count: 0 });
  }

  const horizon = now.getTime() + 24 * 60 * 60 * 1000;
  const invented: string[] = [];
  for (const d of dates) {
    if (d == null || d === '') continue;
    const parsed = new Date(d);
    if (Number.isNaN(parsed.valueOf())) {
      invented.push(d);
      continue;
    }
    if (parsed.getTime() > horizon) invented.push(d);
  }
  const score = invented.length === 0 ? 1 : 0;
  return scoreResult(
    'recency',
    score,
    invented.length === 0
      ? 'publishedDate present-or-null; no invented future dates'
      : `${invented.length} invented/invalid publishedDate values`,
    { inventedPreview: invented.slice(0, 5), dateCount: dates.length }
  );
}

/** Collect report/summary/gap text for structural report checks. */
function reportCorpus(snapshot: ResearchSessionSnapshot): string {
  const parts: string[] = [];
  if (snapshot.errorText) parts.push(snapshot.errorText);
  for (const iter of snapshot.iterations) {
    if (iter.summary) parts.push(iter.summary);
    if (iter.feedback) parts.push(iter.feedback);
    const gaps = iter.reviewGaps;
    if (typeof gaps === 'string') parts.push(gaps);
    else if (gaps != null) parts.push(JSON.stringify(gaps));
  }
  const summary = asRecord(snapshot.finalConfidenceSummary);
  if (summary) parts.push(JSON.stringify(summary));
  const findings = snapshot.findings;
  if (typeof findings === 'string') parts.push(findings);
  else if (findings != null) parts.push(JSON.stringify(findings));
  return parts.join('\n');
}

/**
 * 10. report-invariants — non-empty report when completed; gaps stated when not admitted.
 */
export function scoreReportInvariants(snapshot: ResearchSessionSnapshot): ResearchScorerResult {
  const gate = resolveGate(snapshot);
  const corpus = reportCorpus(snapshot).trim();
  const completed = snapshot.status === 'completed';

  if (completed && corpus.length === 0) {
    return scoreResult('report-invariants', 0, 'completed session has empty report/summary', {
      status: snapshot.status,
    });
  }

  if (gate.admitted === false) {
    if (!GAP_TOKEN_RE.test(corpus)) {
      return scoreResult(
        'report-invariants',
        0,
        'gate not admitted but report/summary/gaps lack gap token',
        { admitted: false }
      );
    }
  }

  return scoreResult('report-invariants', 1, 'report invariants satisfied', {
    status: snapshot.status,
    admitted: gate.admitted,
    corpusLength: corpus.length,
  });
}

/**
 * gap-honesty (deterministic stand-in for judged scorer).
 * When evaluateEvidenceGate.admitted===false, summary/feedback must contain a gap token.
 * Absolute score is drift-only in CI (does not fail the hard gate alone).
 */
export function scoreGapHonesty(snapshot: ResearchSessionSnapshot): ResearchScorerResult {
  const gate = resolveGate(snapshot);
  if (gate.admitted !== false) {
    return scoreResult('gap-honesty', 1, 'gate admitted or unknown — gap-honesty N/A', {
      admitted: gate.admitted,
      note: 'deterministic stand-in; CI uses drift-only gating for judged scorers',
    });
  }
  const corpus = reportCorpus(snapshot);
  const ok = GAP_TOKEN_RE.test(corpus);
  return scoreResult(
    'gap-honesty',
    ok ? 1 : 0,
    ok ? 'gap token present when gate not admitted' : 'missing gap token when gate not admitted',
    {
      admitted: false,
      note: 'deterministic stand-in for judged gap-honesty; drift-only in CI',
    }
  );
}

/** completeness — drift-only judged placeholder scored structurally from coverage+citations. */
export function scoreCompleteness(snapshot: ResearchSessionSnapshot): ResearchScorerResult {
  const hasCitations = snapshot.citations.length > 0 || citedUrls(snapshot).length > 0;
  const hasFindings = snapshot.findingsRows.length > 0 || extractQuotePairs(snapshot).length > 0;
  const score = (hasCitations ? 0.5 : 0) + (hasFindings ? 0.5 : 0);
  return scoreResult('completeness', score, `structural completeness=${score}`, {
    hasCitations,
    hasFindings,
    note: 'drift-only judged scorer proxy',
  });
}

/** coherence — drift-only judged placeholder: iterations present + monotonic. */
export function scoreCoherence(snapshot: ResearchSessionSnapshot): ResearchScorerResult {
  const mono = scoreIterationMonotonicity(snapshot);
  const hasReport = reportCorpus(snapshot).trim().length > 0;
  const score = (mono.score >= 1 ? 0.5 : 0) + (hasReport ? 0.5 : 0);
  return scoreResult('coherence', score, `structural coherence=${score}`, {
    monotonic: mono.score >= 1,
    hasReport,
    note: 'drift-only judged scorer proxy',
  });
}

const HARD_SCORERS: Array<(s: ResearchSessionSnapshot) => ResearchScorerResult> = [
  scoreQuoteVerifiability,
  scoreCitationAccuracy,
  scoreNoFabricatedSource,
  scoreIterationMonotonicity,
  scoreCoverage,
  scoreIndependence,
  scoreResolvability,
  scoreDiversity,
  scoreRecency,
  scoreReportInvariants,
];

const DRIFT_SCORERS: Array<(s: ResearchSessionSnapshot) => ResearchScorerResult> = [
  scoreGapHonesty,
  scoreCompleteness,
  scoreCoherence,
];

/**
 * Run all research scorers against a loaded snapshot (pure).
 */
export function scoreResearchSnapshot(snapshot: ResearchSessionSnapshot): ResearchEvalReport {
  const scores = [...HARD_SCORERS, ...DRIFT_SCORERS].map((fn) => fn(snapshot));
  const failures = scores.filter((s) => !s.passed && !s.driftOnly);
  return {
    sessionId: snapshot.sessionId,
    scores,
    passed: failures.length === 0,
    failures,
    exitCode: failures.length === 0 ? 0 : 1,
  };
}

/**
 * Load session from Postgres and score. Real I/O — no in-memory fakes.
 */
export async function scoreResearchSession(
  sessionId: string,
  opts: SqlOpts = {}
): Promise<ResearchEvalReport> {
  const snapshot = await loadResearchSessionSnapshot(sessionId, opts);
  return scoreResearchSnapshot(snapshot);
}

export function getScorerScore(
  report: ResearchEvalReport,
  id: ResearchScorerId
): ResearchScorerResult | undefined {
  return report.scores.find((s) => s.id === id);
}
