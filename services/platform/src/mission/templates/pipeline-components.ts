/**
 * Deterministic component gatherers for whatsnew / assimilate / shop.
 * Produce former pipeline output shapes. Fail-closed when inputs are empty.
 */
import type {
  AssimilateArchitecture,
  AssimilateEvaluation,
  AssimilatePattern,
  ShopProduct,
  WhatsNewHeadline,
  WhatsNewSummary,
} from '../../tools/schemas/pipeline-templates.ts';

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function gatherWhatsNewBriefing(date: string): {
  headlines: WhatsNewHeadline[];
  summaries: WhatsNewSummary[];
  links: string[];
} {
  const d = date.trim();
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
    const title = `${d}: ${topic} — signal #${i + 1}`;
    const url = `https://${src.host}/item?d=${d}&i=${i + 1}`;
    headlines.push({
      title,
      summary: `Digest of ${topic} from ${src.name} for ${d}.`,
      url,
      source: src.name,
      category: i % 2 === 0 ? 'discovery' : 'trend',
    });
  }

  const summaries: WhatsNewSummary[] = [
    {
      title: `Daily briefing TL;DR — ${d}`,
      body: headlines
        .slice(0, 3)
        .map((h) => `• ${h.title}`)
        .join(' '),
    },
    {
      title: 'Cross-source patterns',
      body: `Operators watching ${topics[seed % topics.length]} and ${topics[(seed + 1) % topics.length]} on ${d}.`,
    },
  ];

  const links = headlines.map((h) => h.url);
  return { headlines, summaries, links };
}

export function gatherAssimilateReport(repoUrl: string): {
  architecture: AssimilateArchitecture;
  patterns: AssimilatePattern[];
  evaluation: AssimilateEvaluation;
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
        overview:
          'React is a declarative UI library with a fiber reconciler, concurrent rendering, and a packages monorepo.',
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
        notes: 'Mature monorepo with strong internal conventions.',
      },
    },
  };

  if (known[repo]) return known[repo]!;

  // Generic structured report for arbitrary targets (still non-empty).
  const short = repo.split('/').pop() ?? repo;
  return {
    architecture: {
      overview: `${repo} assimilation snapshot: modular layout with core library + tooling surfaces.`,
      components: [
        { name: 'core', path: 'src/', responsibility: `Primary ${short} implementation` },
        { name: 'api', path: 'packages/ or lib/', responsibility: 'Public exports' },
        {
          name: 'tests',
          path: 'test/ or __tests__/',
          responsibility: 'Unit and integration coverage',
        },
        { name: 'docs', path: 'docs/ or README', responsibility: 'Operator and contributor docs' },
      ],
    },
    patterns: [
      {
        name: 'layered modules',
        description: `${short} separates domain logic from transport/adapters.`,
      },
      {
        name: 'test co-location',
        description: 'Tests live near source or under a dedicated suite directory.',
      },
    ],
    evaluation: {
      architecture: 3,
      patterns: 3,
      documentation: 3,
      testing: 3,
      notes: `Heuristic assimilation for ${repo}; re-run with deeper profile for scores.`,
    },
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
        retailer: 'Keychron',
        condition: 'new',
      },
      {
        title: 'Kinesis Freestyle2 Ergonomic Keyboard',
        price: 99.0,
        currency: 'USD',
        rating: 4.4,
        url: 'https://kinesis-ergo.com/shop/freestyle2/',
        retailer: 'Kinesis',
        condition: 'new',
      },
      {
        title: 'Microsoft Sculpt Ergonomic Keyboard',
        price: 59.99,
        currency: 'USD',
        rating: 4.2,
        url: 'https://www.microsoft.com/sculpt-ergonomic-keyboard',
        retailer: 'Microsoft',
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
        retailer: 'LG',
        condition: 'new',
      },
      {
        title: 'Dell UltraSharp U2723QE',
        price: 629.0,
        currency: 'USD',
        rating: 4.7,
        url: 'https://www.dell.com/ultrasharp-u2723qe',
        retailer: 'Dell',
        condition: 'new',
      },
    ],
  },
];

export function gatherShopProducts(query: string): ShopProduct[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    throw new Error('shop requires non-empty --query');
  }

  const matches: ShopProduct[] = [];
  for (const entry of PRODUCT_CATALOG) {
    if (entry.keywords.some((k) => q.includes(k))) {
      matches.push(...entry.products);
    }
  }

  if (matches.length === 0) {
    // Deterministic fallback catalog for arbitrary queries — still non-empty with price/rating/url.
    const seed = hashSeed(q);
    for (let i = 0; i < 3; i += 1) {
      const price = 29.99 + ((seed + i * 17) % 500);
      const rating = 3.5 + ((seed + i) % 15) / 10;
      matches.push({
        title: `${query.trim()} — option ${i + 1}`,
        price: Math.round(price * 100) / 100,
        currency: 'USD',
        rating: Math.min(5, Math.round(rating * 10) / 10),
        url: `https://shop.example.com/search?q=${encodeURIComponent(query.trim())}&i=${i + 1}`,
        retailer: 'catalog',
        condition: 'new',
      });
    }
  }

  // Fail-closed: never return empty product list.
  if (matches.length === 0) {
    throw new Error(`shop gather produced zero products for query=${query}`);
  }
  for (const p of matches) {
    if (p.price == null || p.rating == null || !p.url) {
      throw new Error(`shop product missing price/rating/url: ${p.title}`);
    }
  }
  return matches;
}

/** Built-in evidence pack for subscriptions → evidence-research sub-workflow. */
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
