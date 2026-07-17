/**
 * search-5 AC-3 recall measure against live Postgres + fleet.
 * Baseline: search-recall.test.ts RECALL_BASELINE = 1 (golden must appear in top-10).
 * Note: scripts/benchmark-search.ts is legacy Convex↔Supabase cloud and cannot run without
 * EXPO_PUBLIC_SUPABASE_* / CONVEX_* credentials — not the RRF parity harness.
 */
import { createDb, createSql } from '../../services/platform/src/db/client.ts';
import { resolveDatabaseUrl } from '../../services/platform/src/db/connection.ts';
import { rrfHybridSearch } from '../../services/platform/src/search/rrf.ts';

const GOLDEN_TITLE = 'Local Re-embedding & RRF Design';
const MARKER = 'ZZZ_RELEVANT_SPAN_AT_8400_ZZZ';
/** Documented unit baseline in search-recall.test.ts (RECALL_BASELINE = 1). */
const BASELINE = 1;
const GOLDEN_QUERIES = [
  'how to combine vector and keyword rankings in one database query',
  'ZZZ_RELEVANT_SPAN_AT_8400_ZZZ reciprocal rank fusion past 8K span',
  'reciprocal rank fusion single CTE round-trip past 8K',
] as const;

function isGolden(r: { title?: string; content?: string }): boolean {
  return r.title === GOLDEN_TITLE || (typeof r.content === 'string' && r.content.includes(MARKER));
}

const sql = createSql(resolveDatabaseUrl({ preferHolocron: true }));
const db = createDb(sql);

let hits = 0;
for (const query of GOLDEN_QUERIES) {
  const out = await rrfHybridSearch(db, sql, { query, limit: 10 });
  const hit = out.results.some(isGolden);
  if (hit) hits += 1;
  const rank = out.results.findIndex(isGolden);
  console.log(
    `query="${query.slice(0, 60)}..." hit=${hit} rank=${rank} totalResults=${out.totalResults} searchMethod=${out.searchMethod} topTitle=${out.results[0]?.title ?? 'n/a'}`
  );
}

// Per-query hit rate over golden set (all variants must hit golden → 1.0).
const recallNew = hits / GOLDEN_QUERIES.length;
// search-recall harness also asserts binary recall@10 for the single golden query ≥ baseline 1.
const binaryRecallAt10 = hits >= BASELINE ? 1.0 : 0.0;

console.log(`golden_set_size=${GOLDEN_QUERIES.length}`);
console.log(`recall new=${recallNew} baseline=${BASELINE}`);
console.log(`recall@10 binary=${binaryRecallAt10} (hits=${hits}/${GOLDEN_QUERIES.length})`);
console.log(
  `parity: new (${recallNew}) >= baseline (${BASELINE}) ? ${recallNew >= BASELINE && binaryRecallAt10 >= 1.0}`
);

await sql.end({ timeout: 5 });
if (!(recallNew >= BASELINE && hits === GOLDEN_QUERIES.length)) process.exit(2);
