/**
 * search-5 AC-5: seed (if empty) + searchSurface over all 5 inline surfaces;
 * assert zero outbound api.cohere.ai calls and searchMethod hnsw:<surface>.
 */
import { createDb, createSql } from '../../services/platform/src/db/client.ts';
import { resolveDatabaseUrl } from '../../services/platform/src/db/connection.ts';
import { embed } from '../../services/platform/src/inference/embed.ts';
import { INLINE_HNSW_SURFACES, searchSurface } from '../../services/platform/src/search/surfaces.ts';

const CLAIM = 'MLX prefill-tuned Qwen3 embedding server on Apple Silicon';

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

const sql = createSql(resolveDatabaseUrl({ preferHolocron: true }));
const db = createDb(sql);

const cohereHosts: string[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
  if (/cohere\.ai|api\.cohere/i.test(url)) cohereHosts.push(url);
  return originalFetch(input, init);
}) as typeof fetch;

try {
  // Seed missing surfaces with fleet document embeddings.
  const seeds: Array<{ surface: string; text: string; insert: (v: string) => Promise<void> }> = [
    {
      surface: 'research_findings',
      text: CLAIM,
      insert: async (v) => {
        const existing = await sql`SELECT id FROM research_findings WHERE embedding IS NOT NULL LIMIT 1`;
        if (existing.length) return;
        await sql`INSERT INTO research_findings (system, claim_text, legacy_convex_id, embedding)
          VALUES ('deep', ${CLAIM}, 'search-5-surface-finding', ${v}::vector)`;
      },
    },
    {
      surface: 'research_iterations',
      text: 'Iteration summary covering local Qwen3 embedding prefill on Apple Silicon MLX',
      insert: async (v) => {
        const existing = await sql`SELECT id FROM research_iterations WHERE embedding IS NOT NULL LIMIT 1`;
        if (existing.length) return;
        await sql`INSERT INTO research_iterations (system, status, findings_summary, summary, legacy_convex_id, embedding)
          VALUES ('deep', 'completed', ${'Iteration summary covering local Qwen3 embedding prefill on Apple Silicon MLX'}, ${'MLX Qwen3 embed iteration'}, 'search-5-surface-iteration', ${v}::vector)`;
      },
    },
    {
      surface: 'subscription_content',
      text: 'Local Qwen3 embedding fleet on Apple Silicon for Holocron search',
      insert: async (v) => {
        const existing = await sql`SELECT id FROM subscription_content WHERE embedding IS NOT NULL LIMIT 1`;
        if (existing.length) return;
        await sql`INSERT INTO subscription_content (title, url, legacy_convex_id, embedding)
          VALUES (${'Local Qwen3 embedding fleet on Apple Silicon for Holocron search'}, 'https://example.local/qwen3-embed', 'search-5-surface-sub', ${v}::vector)`;
      },
    },
    {
      surface: 'toolbelt_tools',
      text: 'Tool for running Qwen3 embedding inference via MLX on Apple Silicon',
      insert: async (v) => {
        const existing = await sql`SELECT id FROM toolbelt_tools WHERE embedding IS NOT NULL LIMIT 1`;
        if (existing.length) return;
        await sql`INSERT INTO toolbelt_tools (title, description, content, status, legacy_convex_id, embedding)
          VALUES (${'Qwen3 MLX Embed Tool'}, ${'Tool for running Qwen3 embedding inference via MLX on Apple Silicon'}, ${'local embed helper'}, 'active', 'search-5-surface-tool', ${v}::vector)`;
      },
    },
    {
      surface: 'improvement_requests',
      text: 'Request to improve local Qwen3 embedding throughput on Apple Silicon',
      insert: async (v) => {
        const existing = await sql`SELECT id FROM improvement_requests WHERE embedding IS NOT NULL LIMIT 1`;
        if (existing.length) return;
        await sql`INSERT INTO improvement_requests (title, description, summary, status, legacy_convex_id, embedding)
          VALUES (${'Faster local embeddings'}, ${'Request to improve local Qwen3 embedding throughput on Apple Silicon'}, ${'embed performance'}, 'pending', 'search-5-surface-improve', ${v}::vector)`;
      },
    },
  ];

  for (const s of seeds) {
    const vector = await embed(s.text, 'document');
    if (vector.length !== 1024) throw new Error(`bad dim ${vector.length} for ${s.surface}`);
    await s.insert(toVectorLiteral(vector));
    console.log(`seeded/ensured ${s.surface}`);
  }

  const query = 'local embedding server optimized for Mac prefill';
  const results: Record<string, unknown> = {};
  for (const surface of INLINE_HNSW_SURFACES) {
    const out = await searchSurface(db, sql, surface, { query, limit: 5 });
    results[surface] = {
      totalResults: out.totalResults,
      searchMethod: out.searchMethod,
      top: out.results[0]
        ? {
            content: out.results[0].content?.slice(0, 120),
            claim_text: out.results[0].claim_text?.slice(0, 120),
            title: out.results[0].title,
            score: out.results[0].score,
          }
        : null,
    };
    console.log(
      `surface=${surface} totalResults=${out.totalResults} searchMethod=${out.searchMethod} topContent=${JSON.stringify(out.results[0]?.content ?? out.results[0]?.claim_text ?? out.results[0]?.title)}`
    );
    if (out.totalResults < 1) throw new Error(`surface ${surface} returned 0 results`);
    if (out.searchMethod !== `hnsw:${surface}`) {
      throw new Error(`bad searchMethod ${out.searchMethod}`);
    }
  }

  // Explicit research_findings claim check
  const rf = results.research_findings as { top: { claim_text?: string; content?: string } | null };
  const claim = rf.top?.claim_text ?? rf.top?.content ?? '';
  if (!String(claim).includes(CLAIM)) {
    throw new Error(`research_findings missing claim: ${claim}`);
  }

  console.log(`cohere_hosts=${JSON.stringify(cohereHosts)}`);
  console.log(`zero_cohere=${cohereHosts.length === 0}`);
  console.log(`surfaces_ok=${INLINE_HNSW_SURFACES.length}`);
  console.log(JSON.stringify({ results, cohereHosts }, null, 2));

  if (cohereHosts.length > 0) process.exit(3);
} finally {
  globalThis.fetch = originalFetch;
  await sql.end({ timeout: 5 });
}
