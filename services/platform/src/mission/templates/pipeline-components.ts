/**
 * Component gatherers for whatsnew / assimilate / shop.
 *
 * Happy path (S31-10): real retrieval from product-declared sources —
 * subscription corpus (Postgres), repository content (GitHub Contents API /
 * hermetic fixture base), and shop listings (Postgres + optional live Jina).
 *
 * Scaffold builders remain for degraded/fixture use and honesty labels only.
 * Scaffold-only outputs cannot satisfy commit success (runtime commit guards).
 *
 * Fail-closed contract (pipes-3 anti-stub + S31-10):
 * - Empty/invalid operator inputs throw (no soft-success empty shapes).
 * - Terminal mission outputs MUST also carry non-empty fleet `assayText`.
 * - Scaffolding alone must never complete a mission.
 */
import type { Sql } from '../../db/client.ts';
import type {
  AssimilateArchitecture,
  AssimilateEvaluation,
  AssimilatePattern,
  AssimilateRetrievalPayload,
  PipelineRetrievalSource,
  ShopProduct,
  WhatsNewHeadline,
  WhatsNewSummary,
} from '../../tools/schemas/pipeline-templates.ts';

export const SCAFFOLD_NOTE =
  'Deterministic scaffolding (stable hash of inputs; not live source fetch)';
export const SCAFFOLD_RETAILER_PREFIX = 'deterministic-scaffolding';

/** Test seam: force scaffold gather so commit fail-closed can be exercised. */
export const HOLO_TEST_FORCE_PIPELINE_SCAFFOLD_ENV = 'HOLO_TEST_FORCE_PIPELINE_SCAFFOLD';

/** Optional hermetic GitHub Contents API base (tests / offline fixture server). */
export const HOLO_ASSIMILATE_API_BASE_ENV = 'HOLO_ASSIMILATE_API_BASE';

export function isForcePipelineScaffold(): boolean {
  return process.env[HOLO_TEST_FORCE_PIPELINE_SCAFFOLD_ENV] === '1';
}

export function isScaffoldRetailer(retailer: string | undefined | null): boolean {
  return String(retailer ?? '').startsWith(SCAFFOLD_RETAILER_PREFIX);
}

export function isScaffoldProvenance(provenance: string | undefined | null): boolean {
  const p = String(provenance ?? '');
  return /deterministic scaffolding|not live source fetch|not live marketplace/i.test(p);
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ── scaffold builders (labeled; unused on happy path) ──────────────────────

/**
 * Structural daily-briefing skeleton for `date`. Requires YYYY-MM-DD.
 * Does not scrape feeds — fleet ASSAY must still supply real synthesis text.
 */
export function gatherWhatsNewBriefing(date: string): {
  headlines: WhatsNewHeadline[];
  summaries: WhatsNewSummary[];
  links: string[];
  provenance: string;
} {
  const d = date.trim();
  if (!d) {
    throw new Error('whatsnew requires non-empty --date YYYY-MM-DD (fail-closed)');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error(`whatsnew requires YYYY-MM-DD date; got ${date}`);
  }
  const seed = hashSeed(d);
  const sources = [
    { name: 'Hacker News', host: 'news.ycombinator.com' },
    { name: 'GitHub Trending', host: 'github.com/trending' },
    { name: 'arXiv cs.AI', host: 'arxiv.org' },
    { name: 'Lobsters', host: 'lobste.rs' },
    { name: 'Dev.to', host: 'dev.to' },
  ];
  const topics = [
    'local inference fleet routing',
    'agentic mission templates',
    'hybrid search RRF',
    'structured output guardrails',
    'durable workflow checkpoints',
  ];

  const headlines: WhatsNewHeadline[] = [];
  for (let i = 0; i < 5; i += 1) {
    const src = sources[(seed + i) % sources.length]!;
    const topic = topics[(seed + i * 3) % topics.length]!;
    const title = `${d}: ${topic} — scaffold signal #${i + 1}`;
    const url = `https://${src.host}/item?d=${d}&i=${i + 1}`;
    headlines.push({
      title,
      summary: `${SCAFFOLD_NOTE}. Topic slot: ${topic} / source slot: ${src.name}.`,
      url,
      source: src.name,
      category: i % 2 === 0 ? 'discovery' : 'trend',
    });
  }

  const summaries: WhatsNewSummary[] = [
    {
      title: `Daily briefing scaffold — ${d}`,
      body: `${SCAFFOLD_NOTE}. Headline slots: ${headlines
        .slice(0, 3)
        .map((h) => h.title)
        .join(' · ')}`,
    },
    {
      title: 'Cross-source pattern slots',
      body: `${SCAFFOLD_NOTE}. Watching ${topics[seed % topics.length]} and ${
        topics[(seed + 1) % topics.length]
      } on ${d}.`,
    },
  ];

  const links = headlines.map((h) => h.url);
  if (headlines.length === 0 || summaries.length === 0 || links.length === 0) {
    throw new Error('whatsnew gather produced empty headlines/summaries/links (fail-closed)');
  }
  return { headlines, summaries, links, provenance: SCAFFOLD_NOTE };
}

/**
 * Structural assimilation report for a repo target.
 * Known fixture `facebook/react` uses documented public architecture notes
 * labeled as scaffolding; arbitrary targets get generic slots only.
 */
export function gatherAssimilateReport(repoUrl: string): {
  architecture: AssimilateArchitecture;
  patterns: AssimilatePattern[];
  evaluation: AssimilateEvaluation;
  provenance: string;
} {
  const repo = repoUrl.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '');
  if (!repo || repo.length < 3) {
    throw new Error(`assimilate requires non-empty --target repo; got ${repoUrl}`);
  }

  const known: Record<
    string,
    {
      architecture: AssimilateArchitecture;
      patterns: AssimilatePattern[];
      evaluation: AssimilateEvaluation;
    }
  > = {
    'facebook/react': {
      architecture: {
        overview: `${SCAFFOLD_NOTE}. React: declarative UI library with fiber reconciler, concurrent rendering, packages monorepo.`,
        components: [
          {
            name: 'reconciler',
            path: 'packages/react-reconciler',
            responsibility: 'Fiber scheduling',
          },
          { name: 'react-dom', path: 'packages/react-dom', responsibility: 'DOM host config' },
          { name: 'scheduler', path: 'packages/scheduler', responsibility: 'Priority lanes' },
          { name: 'react', path: 'packages/react', responsibility: 'Public API surface' },
        ],
      },
      patterns: [
        {
          name: 'hooks',
          description: 'useState/useEffect hooks as the primary state primitive.',
          examples: ['packages/react/src/ReactHooks.js'],
        },
        {
          name: 'fiber tree',
          description: 'Incremental rendering via linked fiber nodes and lanes.',
          examples: ['packages/react-reconciler/src/ReactFiber.js'],
        },
        {
          name: 'host config',
          description: 'Pluggable host configs for DOM, native, and test renderers.',
        },
      ],
      evaluation: {
        architecture: 5,
        patterns: 5,
        documentation: 4,
        testing: 5,
        notes: `${SCAFFOLD_NOTE}. Documented public monorepo conventions for facebook/react fixture.`,
      },
    },
  };

  if (known[repo]) {
    return { ...known[repo]!, provenance: SCAFFOLD_NOTE };
  }

  const short = repo.split('/').pop() ?? repo;
  return {
    architecture: {
      overview: `${SCAFFOLD_NOTE}. ${repo}: modular layout slots (core + tooling).`,
      components: [
        { name: 'core', path: 'src/', responsibility: `Primary ${short} implementation slot` },
        { name: 'api', path: 'packages/ or lib/', responsibility: 'Public exports slot' },
        {
          name: 'tests',
          path: 'test/ or __tests__/',
          responsibility: 'Unit and integration coverage slot',
        },
        { name: 'docs', path: 'docs/ or README', responsibility: 'Docs slot' },
      ],
    },
    patterns: [
      {
        name: 'layered modules',
        description: `${SCAFFOLD_NOTE}. ${short} separates domain logic from transport/adapters (slot).`,
      },
      {
        name: 'test co-location',
        description: `${SCAFFOLD_NOTE}. Tests near source or under a dedicated suite directory (slot).`,
      },
    ],
    evaluation: {
      architecture: 3,
      patterns: 3,
      documentation: 3,
      testing: 3,
      notes: `${SCAFFOLD_NOTE}. Heuristic slots for ${repo}; fleet ASSAY required for real evaluation.`,
    },
    provenance: SCAFFOLD_NOTE,
  };
}

const PRODUCT_CATALOG: Array<{
  keywords: string[];
  products: ShopProduct[];
}> = [
  {
    keywords: ['keyboard', 'ergonomic', 'mechanical'],
    products: [
      {
        title: 'Keychron Q10 Alice (Barebone)',
        price: 174.0,
        currency: 'USD',
        rating: 4.6,
        url: 'https://www.keychron.com/products/keychron-q10',
        retailer: 'deterministic-scaffolding:Keychron',
        condition: 'new',
      },
      {
        title: 'Kinesis Freestyle2 Ergonomic Keyboard',
        price: 99.0,
        currency: 'USD',
        rating: 4.4,
        url: 'https://kinesis-ergo.com/shop/freestyle2/',
        retailer: 'deterministic-scaffolding:Kinesis',
        condition: 'new',
      },
      {
        title: 'Microsoft Sculpt Ergonomic Keyboard',
        price: 59.99,
        currency: 'USD',
        rating: 4.2,
        url: 'https://www.microsoft.com/sculpt-ergonomic-keyboard',
        retailer: 'deterministic-scaffolding:Microsoft',
        condition: 'new',
      },
    ],
  },
  {
    keywords: ['monitor', 'display', 'ultrawide'],
    products: [
      {
        title: 'LG 34WN80C-B 34" Ultrawide',
        price: 549.0,
        currency: 'USD',
        rating: 4.5,
        url: 'https://www.lg.com/us/monitors/lg-34wn80c-b',
        retailer: 'deterministic-scaffolding:LG',
        condition: 'new',
      },
      {
        title: 'Dell UltraSharp U2723QE',
        price: 629.0,
        currency: 'USD',
        rating: 4.7,
        url: 'https://www.dell.com/ultrasharp-u2723qe',
        retailer: 'deterministic-scaffolding:Dell',
        condition: 'new',
      },
    ],
  },
];

/**
 * Structural product list for a shop query.
 * Catalog slots are labeled `deterministic-scaffolding:*` retailers — not live marketplace results.
 * Unknown queries get hash-stable scaffold products (still labeled).
 */
export function gatherShopProducts(query: string): ShopProduct[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    throw new Error('shop requires non-empty --query (fail-closed)');
  }

  const matches: ShopProduct[] = [];
  for (const entry of PRODUCT_CATALOG) {
    if (entry.keywords.some((k) => q.includes(k))) {
      matches.push(...entry.products);
    }
  }

  if (matches.length === 0) {
    const seed = hashSeed(q);
    for (let i = 0; i < 3; i += 1) {
      const price = 29.99 + ((seed + i * 17) % 500);
      const rating = 3.5 + ((seed + i) % 15) / 10;
      matches.push({
        title: `${query.trim()} — scaffold option ${i + 1}`,
        price: Math.round(price * 100) / 100,
        currency: 'USD',
        rating: Math.min(5, Math.round(rating * 10) / 10),
        url: `https://shop.example.com/scaffold?q=${encodeURIComponent(query.trim())}&i=${i + 1}`,
        retailer: 'deterministic-scaffolding:catalog',
        condition: 'new',
      });
    }
  }

  if (matches.length === 0) {
    throw new Error(`shop gather produced zero products for query=${query} (fail-closed)`);
  }
  for (const p of matches) {
    if (p.price == null || p.rating == null || !p.url) {
      throw new Error(`shop product missing price/rating/url: ${p.title}`);
    }
  }
  return matches;
}

/**
 * Explicit fixture-seed helper for subscriptions → evidence-research sub-workflow.
 *
 * ONLY use when the operator supplies `--claims` / `researchEvidence` and the
 * runtime chooses to expand a named fixture. Standing bare path does NOT call
 * this (REDHAT-FIX-4 resolves PATH-A / provisional in runtime instead).
 */
export function subscriptionsResearchEvidence(topic: string) {
  const t = topic.trim() || 'subscription digest';
  return {
    claims: [
      { id: 'sub-claim-a', text: `${t} signal A`, component: 'market' },
      { id: 'sub-claim-b', text: `${t} signal B`, component: 'risk' },
    ],
    evidence: [
      {
        id: 'sub-e1',
        claimId: 'sub-claim-a',
        component: 'market',
        sourceId: 'sub-s1',
        independenceGroup: 'publisher-a',
        grade: 4,
        entailment: 0.9,
        direction: 'supporting' as const,
        quote: 'signal A',
        sourceText: `Evidence supporting ${t} signal A`,
        disconfirmationResolved: true,
      },
      {
        id: 'sub-e2',
        claimId: 'sub-claim-b',
        component: 'risk',
        sourceId: 'sub-s2',
        independenceGroup: 'publisher-b',
        grade: 3,
        entailment: 0.85,
        direction: 'supporting' as const,
        quote: 'signal B',
        sourceText: `Evidence supporting ${t} signal B`,
        disconfirmationResolved: true,
      },
    ],
    requiredComponents: ['market', 'risk'],
    gradeFloor: 3,
    entailmentFloor: 0.8,
    independentSourceFloor: 2,
  };
}

// ── real retrieval (S31-10 happy path) ─────────────────────────────────────

export type WhatsNewRetrieval = {
  headlines: WhatsNewHeadline[];
  summaries: WhatsNewSummary[];
  links: string[];
  provenance: string;
  retrievalSources: PipelineRetrievalSource[];
  realSourceCount: number;
};

/**
 * Load real subscription content for a daily briefing.
 * Prefers content discovered on `date`, then falls back to most-recent researched rows.
 */
export async function retrieveWhatsNewFromSubscriptions(
  sql: Sql,
  date: string
): Promise<WhatsNewRetrieval> {
  const d = date.trim();
  if (!d) {
    throw new Error('whatsnew requires non-empty --date YYYY-MM-DD (fail-closed)');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error(`whatsnew requires YYYY-MM-DD date; got ${date}`);
  }

  type Row = {
    content_id: string;
    source_id: string;
    title: string | null;
    url: string | null;
    source_name: string | null;
    source_type: string | null;
    description: string | null;
  };

  // Prefer same-day discoveries; fall back to recent researched corpus.
  let rows = await sql<Row[]>`
    SELECT
      c.id::text AS content_id,
      c.source_id::text AS source_id,
      c.title,
      c.url,
      s.name AS source_name,
      s.source_type,
      c.metadata_json->>'description' AS description
    FROM subscription_content c
    JOIN subscription_sources s ON s.id::text = c.source_id
    WHERE (c.discovered_at AT TIME ZONE 'UTC')::date = ${d}::date
       OR (c.created_at AT TIME ZONE 'UTC')::date = ${d}::date
    ORDER BY c.discovered_at DESC NULLS LAST, c.created_at DESC
    LIMIT 25
  `;

  if (rows.length === 0) {
    rows = await sql<Row[]>`
      SELECT
        c.id::text AS content_id,
        c.source_id::text AS source_id,
        c.title,
        c.url,
        s.name AS source_name,
        s.source_type,
        c.metadata_json->>'description' AS description
      FROM subscription_content c
      JOIN subscription_sources s ON s.id::text = c.source_id
      WHERE c.title IS NOT NULL AND length(trim(c.title)) > 0
        AND c.url IS NOT NULL AND length(trim(c.url)) > 0
      ORDER BY c.discovered_at DESC NULLS LAST, c.created_at DESC
      LIMIT 25
    `;
  }

  if (rows.length === 0) {
    throw new Error(
      'whatsnew empty retrieval: no subscription_content rows available (fail-closed)'
    );
  }

  const retrievalSources: PipelineRetrievalSource[] = [];
  const seen = new Set<string>();
  const headlines: WhatsNewHeadline[] = [];

  for (const row of rows) {
    const title = (row.title ?? '').trim();
    const url = (row.url ?? '').trim();
    if (!title || !url) continue;
    const sourceName = (row.source_name ?? row.source_type ?? 'subscription').trim();
    headlines.push({
      title,
      summary: (row.description ?? `${title} from ${sourceName}`).slice(0, 500),
      url,
      source: sourceName,
      category: row.source_type ?? 'subscription',
    });
    if (!seen.has(row.source_id)) {
      seen.add(row.source_id);
      retrievalSources.push({
        id: row.source_id,
        title: sourceName,
        url,
        kind: 'subscription_source',
      });
    }
    // Also record content id for Postgres resolvability.
    if (!seen.has(row.content_id)) {
      seen.add(row.content_id);
      retrievalSources.push({
        id: row.content_id,
        title,
        url,
        kind: 'subscription_content',
      });
    }
  }

  if (headlines.length === 0 || retrievalSources.length === 0) {
    throw new Error('whatsnew empty retrieval: rows lacked title/url (fail-closed)');
  }

  const summaries: WhatsNewSummary[] = [
    {
      title: `Daily briefing — ${d}`,
      body: `Retrieved ${headlines.length} subscription item(s) from ${
        new Set(rows.map((r) => r.source_id)).size
      } source(s). Top: ${headlines
        .slice(0, 3)
        .map((h) => h.title)
        .join(' · ')}`,
    },
    {
      title: 'Source corpus',
      body: retrievalSources
        .filter((s) => s.kind === 'subscription_source')
        .map((s) => s.title ?? s.id)
        .slice(0, 8)
        .join(', '),
    },
  ];

  return {
    headlines,
    summaries,
    links: headlines.map((h) => h.url),
    provenance: `subscription_content Postgres retrieval for ${d} (${retrievalSources.length} provenance ids)`,
    retrievalSources,
    realSourceCount: retrievalSources.length,
  };
}

function normalizeRepoPath(repoUrl: string): string {
  return repoUrl
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
}

async function fetchJson(
  url: string,
  fetchImpl: typeof fetch,
  headers?: Record<string, string>
): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'holocron-assimilate/1.0',
      ...headers,
    },
  });
  if (!response.ok) {
    throw new Error(`assimilate fetch HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

function decodeGithubFileContent(payload: unknown): { path: string; text: string } | null {
  if (!isRecord(payload)) return null;
  const path =
    typeof payload.path === 'string'
      ? payload.path
      : typeof payload.name === 'string'
        ? payload.name
        : '';
  if (!path) return null;
  if (typeof payload.content === 'string' && payload.content.length > 0) {
    const encoding = typeof payload.encoding === 'string' ? payload.encoding : 'base64';
    if (encoding === 'base64') {
      try {
        const text = Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8');
        if (text.trim().length > 0) return { path, text };
      } catch {
        /* fall through */
      }
    } else if (payload.content.trim().length > 0) {
      return { path, text: payload.content };
    }
  }
  return null;
}

export type AssimilateRetrieval = {
  architecture: AssimilateArchitecture;
  patterns: AssimilatePattern[];
  evaluation: AssimilateEvaluation;
  provenance: string;
  retrievalPayload: AssimilateRetrievalPayload;
};

/**
 * Fetch real repository content (README + root listing) and derive architecture slots.
 * Uses HOLO_ASSIMILATE_API_BASE when set (hermetic fixture), else api.github.com.
 */
export async function retrieveAssimilateFromRepository(
  repoUrl: string,
  options?: {
    fetchImpl?: typeof fetch;
    apiBase?: string;
  }
): Promise<AssimilateRetrieval> {
  const repo = normalizeRepoPath(repoUrl);
  if (!repo || repo.length < 3 || !repo.includes('/')) {
    throw new Error(`assimilate requires owner/repo target; got ${repoUrl}`);
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  const apiBase = (
    options?.apiBase ??
    process.env[HOLO_ASSIMILATE_API_BASE_ENV] ??
    'https://api.github.com'
  ).replace(/\/+$/, '');

  const files: Array<{ path: string; text: string }> = [];
  let listingNames: string[] = [];

  // README (GitHub Contents API shape)
  try {
    const readme = await fetchJson(`${apiBase}/repos/${repo}/readme`, fetchImpl);
    const decoded = decodeGithubFileContent(readme);
    if (decoded) files.push(decoded);
  } catch {
    try {
      const readmeAlt = await fetchJson(`${apiBase}/readme`, fetchImpl);
      const decoded = decodeGithubFileContent(readmeAlt);
      if (decoded) files.push(decoded);
    } catch {
      /* optional */
    }
  }

  // Root listing
  try {
    const listing = await fetchJson(`${apiBase}/repos/${repo}/contents/`, fetchImpl);
    if (Array.isArray(listing)) {
      listingNames = listing
        .map((item) => (isRecord(item) && typeof item.name === 'string' ? item.name : ''))
        .filter(Boolean);
      // Capture listing as a synthetic file so payload is non-empty even without README.
      files.push({
        path: '__root_listing__',
        text: listing
          .map((item) => {
            if (!isRecord(item)) return '';
            const name = typeof item.name === 'string' ? item.name : '';
            const type = typeof item.type === 'string' ? item.type : 'unknown';
            return `${type}\t${name}`;
          })
          .filter(Boolean)
          .join('\n'),
      });
    }
  } catch {
    try {
      const listing = await fetchJson(`${apiBase}/contents`, fetchImpl);
      if (Array.isArray(listing)) {
        listingNames = listing
          .map((item) => (isRecord(item) && typeof item.name === 'string' ? item.name : ''))
          .filter(Boolean);
        files.push({
          path: '__root_listing__',
          text: listingNames.join('\n'),
        });
      }
    } catch {
      /* optional */
    }
  }

  // package.json when present in listing
  if (listingNames.includes('package.json')) {
    try {
      const pkg = await fetchJson(`${apiBase}/repos/${repo}/contents/package.json`, fetchImpl);
      const decoded = decodeGithubFileContent(pkg);
      if (decoded) files.push(decoded);
    } catch {
      try {
        const pkg = await fetchJson(`${apiBase}/package.json`, fetchImpl);
        const decoded = decodeGithubFileContent(pkg);
        if (decoded) files.push(decoded);
      } catch {
        /* optional */
      }
    }
  }

  if (files.length === 0 || files.every((f) => f.text.trim().length === 0)) {
    throw new Error(`assimilate empty retrieval: no file/text payload for ${repo} (fail-closed)`);
  }

  const readmeText = files.find((f) => /readme/i.test(f.path))?.text ?? files[0]?.text ?? '';
  const dirs = listingNames.filter((n) =>
    /^(src|lib|packages|apps|docs|test|tests|__tests__|pkg|cmd|internal)$/i.test(n)
  );
  const short = repo.split('/').pop() ?? repo;

  const components =
    dirs.length > 0
      ? dirs.slice(0, 8).map((name) => ({
          name,
          path: `${name}/`,
          responsibility: `Observed top-level ${name} entry in ${repo}`,
        }))
      : [
          {
            name: 'root',
            path: '/',
            responsibility: `Repository root for ${short}`,
          },
          {
            name: 'docs',
            path: 'README.md',
            responsibility: 'Primary documentation surface',
          },
        ];

  const architecture: AssimilateArchitecture = {
    overview: `Retrieved repository content for ${repo}. README excerpt: ${readmeText
      .replace(/\s+/g, ' ')
      .slice(0, 280)}`,
    components,
  };

  const patterns: AssimilatePattern[] = [
    {
      name: 'documented entrypoints',
      description: `Repository listing includes: ${listingNames.slice(0, 12).join(', ') || '(files only)'}`,
      examples: files.map((f) => f.path).slice(0, 5),
    },
    {
      name: 'readme-driven orientation',
      description: `README/text payload length ${readmeText.length} chars bound to ${repo}.`,
    },
  ];

  const evaluation: AssimilateEvaluation = {
    architecture: Math.min(5, Math.max(2, components.length >= 3 ? 4 : 3)),
    patterns: 3,
    documentation: /readme/i.test(files.map((f) => f.path).join(' ')) ? 4 : 2,
    testing: listingNames.some((n) => /test/i.test(n)) ? 4 : 2,
    notes: `Real repository retrieval for ${repo}; fleet ASSAY supplies qualitative synthesis.`,
  };

  const repositoryUrl = repoUrl.includes('://') ? repoUrl.trim() : `https://github.com/${repo}`;
  return {
    architecture,
    patterns,
    evaluation,
    provenance: `repository content retrieval via ${apiBase} for ${repo}`,
    retrievalPayload: {
      repositoryUrl,
      files,
      fetchedAt: new Date().toISOString(),
    },
  };
}

export type ShopRetrieval = {
  products: ShopProduct[];
  provenance: string;
  realProductCount: number;
};

function mapListingRow(row: {
  title: string | null;
  price: number | string | null;
  retailer: string | null;
  url: string | null;
  condition: string | null;
  deal_score?: number | string | null;
}): ShopProduct | null {
  const title = (row.title ?? '').trim();
  const url = (row.url ?? '').trim();
  const retailer = (row.retailer ?? '').trim();
  const price = Number(row.price);
  if (!title || !url || !Number.isFinite(price)) return null;
  if (isScaffoldRetailer(retailer)) return null;
  const deal = Number(row.deal_score);
  const rating = Number.isFinite(deal) ? Math.min(5, Math.max(0, deal * 5 || 4)) : 4;
  return {
    title,
    price,
    currency: 'USD',
    rating: Math.round(rating * 10) / 10,
    url,
    retailer: retailer || 'marketplace',
    condition: (row.condition ?? 'new').trim() || 'new',
  };
}

/**
 * Retrieve non-scaffold shop products for a query.
 * Prefers completed shop_listings in Postgres; optional live path via existing
 * MCP shop_products executor when listings are empty and JINA is configured.
 */
export async function retrieveShopProducts(
  sql: Sql,
  query: string,
  options?: {
    /** Inject live listings (tests / MCP bridge); must not use scaffold retailers. */
    liveSearch?: (query: string) => Promise<ShopProduct[]>;
  }
): Promise<ShopRetrieval> {
  const q = query.trim();
  if (!q) {
    throw new Error('shop requires non-empty --query (fail-closed)');
  }

  const like = `%${q.toLowerCase()}%`;
  const rows = await sql<
    Array<{
      title: string | null;
      price: number | string | null;
      retailer: string | null;
      url: string | null;
      condition: string | null;
      deal_score: number | string | null;
    }>
  >`
    SELECT l.title, l.price, l.retailer, l.url, l.condition, l.deal_score
    FROM shop_listings l
    LEFT JOIN shop_sessions s ON s.id::text = l.session_id
    WHERE (
      lower(coalesce(l.title, '')) LIKE ${like}
      OR lower(coalesce(s.query, '')) LIKE ${like}
    )
      AND coalesce(l.retailer, '') NOT LIKE ${`${SCAFFOLD_RETAILER_PREFIX}%`}
      AND l.url IS NOT NULL
      AND l.price IS NOT NULL
    ORDER BY l.deal_score DESC NULLS LAST, l.price ASC
    LIMIT 20
  `;

  let products = rows.map(mapListingRow).filter((p): p is ShopProduct => p !== null);

  let provenance = `shop_listings Postgres retrieval for query=${q}`;

  if (products.length === 0 && options?.liveSearch) {
    const live = await options.liveSearch(q);
    products = live.filter((p) => !isScaffoldRetailer(p.retailer));
    provenance = `live shop search for query=${q}`;
  }

  if (products.length === 0) {
    throw new Error(`shop empty retrieval: no non-scaffold products for query=${q} (fail-closed)`);
  }

  return {
    products,
    provenance,
    realProductCount: products.length,
  };
}
