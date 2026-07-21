/**
 * Deterministic component gatherers for whatsnew / assimilate / shop.
 *
 * Produces **structural scaffolding** for former pipeline output shapes so the
 * commit stage can assemble a typed document. Fields are **not** live feed
 * scrapes / marketplace APIs — honest provenance labels make that explicit.
 *
 * Fail-closed contract (pipes-3 anti-stub):
 * - Empty/invalid operator inputs throw (no soft-success empty shapes).
 * - Terminal mission outputs MUST also carry non-empty fleet `assayText`
 *   (wired in runtime commit stages). Scaffolding alone must never complete a
 *   mission when fleet is disconnected/empty.
 * - Subscriptions standing path (REDHAT-FIX-4) resolves evidence in runtime via
 *   PATH-A / honest provisional — not via this module. Use explicit `--claims`
 *   or `subscriptionsResearchEvidence` only as an operator/fixture override.
 */
import type {
  AssimilateArchitecture,
  AssimilateEvaluation,
  AssimilatePattern,
  ShopProduct,
  WhatsNewHeadline,
  WhatsNewSummary,
} from '../../tools/schemas/pipeline-templates.ts';

const SCAFFOLD_NOTE = 'Deterministic scaffolding (stable hash of inputs; not live source fetch)';

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

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
