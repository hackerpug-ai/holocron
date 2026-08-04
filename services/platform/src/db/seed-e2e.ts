/**
 * DEPENDENCY-S24-E2E-SUBSTRATE — deterministic Maestro/e2e seed for Sprint 24+.
 *
 * Seeds the Zero-published Postgres surface:
 *   - 3 drawer conversations + 'Streaming' (Sprint 25 reactive) + Sprint 20 reference
 *   - 17 documents across multiple categories, including all Toolbelt filters
 *   - 5 feed_items (What's New feed)
 *   - 4 subscription sources and 4 researched subscription-content rows
 *
 * Refuse production-like DATABASE_URL (same guard as seed.ts).
 * Idempotent under --reset (truncate public tables then re-insert).
 */
import { createHash } from 'node:crypto';
import { createSql } from './client';
import { applyMigrations } from './migrate';
import {
  databaseNameFromUrl,
  isProdDatabaseUrl,
  NONPROD_DB_NAME,
  provisionNonprodNamespace,
} from './nonprod';
import { assertSeedTargetAllowed } from './seed';

export const E2E_SEED_VERSION = 9;

/** Deterministic UUIDs (uuid v4-shaped) so Maestro / Zero can target stable ids. */
export const E2E_CONVERSATION_IDS = [
  '00000000-0000-4000-8000-0000000000e1',
  '00000000-0000-4000-8000-0000000000e2',
  '00000000-0000-4000-8000-0000000000e3',
] as const;

/** Sprint 25 reactive Maestro oracle — title exactly 'Streaming', ≥1 message. */
export const E2E_STREAMING_CONVERSATION_ID = '00000000-0000-4000-8000-0000000000e4';

export const E2E_REFERENCE_CONVERSATION_ID = '00000000-0000-0000-0000-000000000020';

export const E2E_DOCUMENT_CATEGORIES = [
  'research',
  'deep-research',
  'business',
  'technical-analysis',
  'patterns',
  'general',
  'academic',
  'factual',
  'platforms',
  'libraries',
  'competitive-analysis',
  'ai-roi',
  'cli',
  'framework',
  'service',
  'database',
  'tool',
] as const;

const E2E_IMPROVEMENTS = [
  {
    id: e2eUuid('e', 1),
    title: 'E2E Improvement Open',
    description: 'A deterministic open improvement for native list, search, and detail coverage.',
    status: 'pending',
  },
  {
    id: e2eUuid('e', 2),
    title: 'E2E Improvement Closed',
    description: 'A deterministic completed improvement for the closed status filter.',
    status: 'completed',
  },
] as const;

const E2E_WHATS_NEW_FINDINGS = [
  {
    title: 'E2E Discovery: Native testing bridge',
    url: 'https://example.com/e2e-discovery-native-testing',
    source: 'Example Research',
    category: 'discovery',
    score: 91,
    summary: 'A deterministic discovery finding for native e2e coverage.',
  },
  {
    title: 'E2E Discovery: Durable knowledge graph',
    url: 'https://example.com/e2e-discovery-knowledge-graph',
    source: 'Example Research',
    category: 'discovery',
    score: 88,
    summary: 'A second discovery finding for category-filter membership checks.',
  },
  {
    title: 'E2E Release: Holocron 1.0',
    url: 'https://example.com/e2e-release-holocron-1',
    source: 'Example Releases',
    category: 'release',
    score: 95,
    summary: 'A deterministic release finding with a secure external source.',
  },
  {
    title: 'E2E Release: Native client update',
    url: 'https://example.com/e2e-release-native-client',
    source: 'Example Releases',
    category: 'release',
    score: 89,
    summary: 'A second release finding for category-filter membership checks.',
  },
  {
    title: 'E2E Trend: Agentic workflows',
    url: 'https://example.com/e2e-trend-agentic-workflows',
    source: 'Example Trends',
    category: 'trend',
    score: 84,
    summary: 'A deterministic trend finding for feed and source-navigation coverage.',
  },
  {
    title: 'E2E Discussion: Offline queue recovery',
    url: 'https://example.com/e2e-discussion-offline-queue',
    source: 'r/e2e',
    category: 'discussion',
    score: 82,
    summary: 'A deterministic social finding for native feed group coverage.',
  },
] as const;

const E2E_SUBSCRIPTION_SOURCES = [
  {
    id: e2eUuid('f', 1),
    creatorProfileId: e2eUuid('f', 101),
    sourceType: 'newsletter',
    identifier: 'e2e-aurora-newsletter',
    name: 'E2E Creator Aurora',
    url: 'https://example.com/e2e-aurora-newsletter',
    config: { platform: 'website' },
    autoResearch: true,
  },
  {
    id: e2eUuid('f', 2),
    creatorProfileId: e2eUuid('f', 101),
    sourceType: 'youtube',
    identifier: '@e2eaurora',
    name: 'E2E Creator Aurora',
    url: 'https://example.com/e2e-aurora-video',
    config: { platform: 'youtube' },
    autoResearch: true,
  },
  {
    id: e2eUuid('f', 3),
    creatorProfileId: null,
    sourceType: 'changelog',
    identifier: 'e2e-platform-release-notes',
    name: 'E2E Platform Release Notes',
    url: 'https://example.com/e2e-platform-release',
    config: { platform: 'website' },
    autoResearch: false,
  },
  {
    id: e2eUuid('f', 4),
    creatorProfileId: null,
    sourceType: 'reddit',
    identifier: 'r/e2e',
    name: 'E2E Community',
    url: 'https://example.com/e2e-community',
    config: {},
    autoResearch: false,
  },
] as const;

const E2E_SUBSCRIPTION_CONTENT = [
  {
    id: e2eUuid('f', 11),
    sourceId: E2E_SUBSCRIPTION_SOURCES[0].id,
    documentId: docId(1),
    title: 'E2E Aurora Article: Native Data Contracts',
    url: 'https://example.com/e2e-aurora-article',
    category: 'article',
    description:
      'A deterministic researched article for the Aurora creator group. It explains how durable data contracts keep native clients synchronized after a relaunch, including predictable fallback behavior when a field is unavailable.',
  },
  {
    id: e2eUuid('f', 12),
    sourceId: E2E_SUBSCRIPTION_SOURCES[1].id,
    documentId: docId(2),
    title: 'E2E Aurora Video: Zero Synchronization',
    url: 'https://example.com/e2e-aurora-video',
    category: 'video',
    description:
      'A deterministic researched video for the Aurora creator group. The walkthrough covers reactive synchronization, reconnect recovery, and the visible states a mobile operator should expect while data arrives.',
  },
  {
    id: e2eUuid('f', 13),
    sourceId: E2E_SUBSCRIPTION_SOURCES[2].id,
    documentId: docId(3),
    title: 'E2E Platform Release: Durable Commands',
    url: 'https://example.com/e2e-platform-release',
    category: 'release',
    description:
      'A deterministic researched release note for subscription search. It records the command durability changes, the migration expectations, and why retries do not create duplicate side effects.',
  },
  {
    id: e2eUuid('f', 14),
    sourceId: E2E_SUBSCRIPTION_SOURCES[3].id,
    documentId: docId(4),
    title: 'E2E Community Discussion: Offline Queue',
    url: 'https://example.com/e2e-community-discussion',
    category: 'social',
    description:
      'A deterministic researched social discussion for subscription search. The thread documents offline queue recovery, how pending work drains only once after reconnect, and the user-facing indicators that prove it.',
  },
] as const;

const E2E_RESEARCH_SESSIONS = [
  {
    id: e2eUuid('e', 51),
    topic: 'E2E Active Research: Native resilience',
    status: 'running',
    maxIterations: 4,
    currentIteration: 2,
    documentId: null,
  },
  {
    id: e2eUuid('e', 52),
    topic: 'E2E Completed Research: Durable mobile data',
    status: 'completed',
    maxIterations: 3,
    currentIteration: 3,
    documentId: null,
  },
  {
    id: e2eUuid('e', 53),
    topic: 'E2E Saved Research: Canonical document redirect',
    status: 'completed',
    maxIterations: 1,
    currentIteration: 1,
    documentId: docId(5),
  },
] as const;

const E2E_RESEARCH_ITERATIONS = [
  {
    id: e2eUuid('e', 61),
    sessionId: E2E_RESEARCH_SESSIONS[0].id,
    number: 1,
    status: 'completed',
    coverage: 2.5,
    summary: 'Established the baseline native synchronization and recovery constraints.',
  },
  {
    id: e2eUuid('e', 62),
    sessionId: E2E_RESEARCH_SESSIONS[0].id,
    number: 2,
    status: 'running',
    coverage: 3.2,
    summary:
      '## Current activity\nEvaluating interrupted requests and reconnection behavior without duplicate writes.\n\n## Next step\nCompare the recovered request sequence against the baseline before continuing.',
  },
  {
    id: e2eUuid('e', 63),
    sessionId: E2E_RESEARCH_SESSIONS[1].id,
    number: 1,
    status: 'completed',
    coverage: 2.8,
    summary: 'Collected durable data and offline recovery evidence.',
  },
  {
    id: e2eUuid('e', 64),
    sessionId: E2E_RESEARCH_SESSIONS[1].id,
    number: 2,
    status: 'completed',
    coverage: 3.7,
    summary: 'Validated mobile state transitions across background and relaunch.',
  },
  {
    id: e2eUuid('e', 65),
    sessionId: E2E_RESEARCH_SESSIONS[1].id,
    number: 3,
    status: 'completed',
    coverage: 4.4,
    summary:
      '## Executive summary\nDurable server commands and reactive reads preserve mobile correctness through transient failure.\n\n## Evidence\nThe recovery path resumes reads without duplicating durable writes and keeps the native view coherent after relaunch.',
    sources: [
      { title: 'React Native networking guide', url: 'https://reactnative.dev/docs/network' },
      {
        title: 'Expo development builds',
        url: 'https://docs.expo.dev/develop/development-builds/introduction/',
      },
    ],
  },
] as const;

const E2E_ASSIMILATION_SESSIONS = [
  {
    id: e2eUuid('e', 71),
    repositoryName: 'E2E Plan Render Repository',
    repositoryUrl: 'https://example.com/e2e/plan-render',
    planSummary: 'A reviewable native plan with durable approval controls.',
    planContent:
      '# E2E Assimilation Plan\n\n## Objective\nVerify that a proposed knowledge change is reviewable before execution.\n\n- Inspect the native data contract\n- Confirm the recovery path\n- Record the reviewer decision',
  },
  {
    id: e2eUuid('e', 72),
    repositoryName: 'E2E Feedback Repository',
    repositoryUrl: 'https://example.com/e2e/feedback',
    planSummary: 'A separate pending plan used to prove cancel and feedback behavior.',
    planContent:
      '# E2E Feedback Plan\n\n## Review\nCancel leaves this plan pending. Submitting feedback returns it to planning with the exact reviewer rationale.',
  },
  {
    id: e2eUuid('e', 73),
    repositoryName: 'E2E Approve Repository',
    repositoryUrl: 'https://example.com/e2e/approve',
    planSummary: 'A disposable plan used to prove a single durable approval execution.',
    planContent:
      '# E2E Approval Plan\n\n## Execute once\nApprove starts exactly one server-side execution and prevents a second approval.',
  },
] as const;

export type SeedE2eResult = {
  ok: boolean;
  database: string;
  seed_fingerprint: string;
  conversations: number;
  messages: number;
  documents: number;
  categories: number;
  feed_items: number;
  subscription_sources: number;
  subscription_content: number;
  research_sessions: number;
  research_iterations: number;
  assimilation_sessions: number;
  whats_new_reports: number;
  reset: boolean;
  messages_log: string[];
  errors: string[];
};

function fingerprint(parts: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
}

/** Build a deterministic UUID with a 12-hex trailing group. */
function e2eUuid(prefix: string, n: number): string {
  // prefix is a single hex nibble tag (a/b/c/d); n zero-padded to 11 hex digits → 12 total
  const tail = `${prefix}${n.toString(16).padStart(11, '0')}`;
  if (tail.length !== 12) {
    throw new Error(`e2eUuid tail must be 12 hex chars, got ${tail}`);
  }
  return `00000000-0000-4000-8000-${tail}`;
}

function msgId(convIndex: number, msgIndex: number): string {
  // encode conv*10+msg into the numeric payload
  return e2eUuid('a', convIndex * 10 + msgIndex);
}

function docId(n: number): string {
  return e2eUuid('b', n);
}

function feedId(n: number): string {
  return e2eUuid('c', n);
}

function whatsNewId(): string {
  return e2eUuid('d', 1);
}

/**
 * DOC-02 needs a real, scrollable Markdown surface instead of a placeholder.
 * Keep it tied to the stable AI-ROI document so the Articles list can exercise
 * rich rendering without a special test-only route.
 */
function seededDocumentContent(n: number, category: string): string {
  if (n !== 12) {
    return `Seeded e2e document #${n} in category ${category} for Maestro Zero reads.`;
  }

  return `# E2E Markdown Reading Fixture

## Native document fidelity

This seeded article verifies **bold emphasis**, *italic emphasis*, and a [secure source](https://example.com/e2e-markdown-source) inside the same real document reader used by saved knowledge.

> A quoted callout must remain visually distinct and constrained to the reader width.

### Recovery checklist

- Preserve the originating list position when returning.
- Keep long paragraphs readable without horizontal clipping.
- Retain document actions after scrolling to the end.

1. Synchronize durable data.
2. Render its structured content.
3. Recover navigation context.

| Surface | Expected behavior |
| --- | --- |
| Reader | Structured text remains legible |
| Back | Returns to the same article list |

\`\`\`ts
const result = await recoverDocument();
assert(result.isDurable);
\`\`\`

## Long-form evidence

Native readers must keep a coherent line length when a report contains detailed operational context. This paragraph intentionally describes the same deterministic fixture in enough prose to cross the initial viewport while remaining ordinary product content: a durable command produces a server-side record, Zero synchronizes that record to the device, and the article screen preserves both the content hierarchy and the operator's path back to the library.

The second long paragraph ensures that scrolling reaches a true ending rather than only a short body. It records that recovery should be observable, source links should be reachable, and document-level actions should remain available after the user has read the complete evidence. The fixture is deterministic so a manual run can distinguish rendering regressions from changing upstream content.

## Completion

The end of this fixture is intentional: reaching it proves that the real scroll container handles headings, lists, a quote, a table, code, links, and long prose together.`;
}

export async function seedE2eDatabase(options?: {
  databaseUrl?: string;
  reset?: boolean;
}): Promise<SeedE2eResult> {
  const databaseUrl =
    options?.databaseUrl ??
    process.env.DATABASE_URL ??
    `postgres://127.0.0.1:5432/${NONPROD_DB_NAME}`;
  const reset = options?.reset !== false;
  const messages_log: string[] = [];
  const errors: string[] = [];

  try {
    assertSeedTargetAllowed(databaseUrl);
  } catch (err) {
    return {
      ok: false,
      database: databaseNameFromUrl(databaseUrl),
      seed_fingerprint: '',
      conversations: 0,
      messages: 0,
      documents: 0,
      categories: 0,
      feed_items: 0,
      subscription_sources: 0,
      subscription_content: 0,
      research_sessions: 0,
      research_iterations: 0,
      assimilation_sessions: 0,
      whats_new_reports: 0,
      reset,
      messages_log,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  // Prefer nonprod provision path when targeting holocron_nonprod
  if (databaseNameFromUrl(databaseUrl) === NONPROD_DB_NAME) {
    const prov = await provisionNonprodNamespace({ ownerUrl: databaseUrl });
    messages_log.push(...prov.messages);
    if (!prov.ok) {
      return {
        ok: false,
        database: NONPROD_DB_NAME,
        seed_fingerprint: '',
        conversations: 0,
        messages: 0,
        documents: 0,
        categories: 0,
        feed_items: 0,
        subscription_sources: 0,
        subscription_content: 0,
        research_sessions: 0,
        research_iterations: 0,
        assimilation_sessions: 0,
        whats_new_reports: 0,
        reset,
        messages_log,
        errors: prov.errors,
      };
    }
  } else if (!isProdDatabaseUrl(databaseUrl)) {
    const mig = await applyMigrations({ databaseUrl });
    messages_log.push(...mig.messages);
    if (!mig.ok) errors.push(...mig.errors);
  }

  const sql = createSql(databaseUrl);
  try {
    if (reset) {
      const tables = await sql<{ relname: string }[]>`
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname NOT IN ('drizzle_migrations')
        ORDER BY c.relname
      `;
      if (tables.length) {
        const list = tables.map((t) => `"${t.relname.replaceAll('"', '')}"`).join(', ');
        await sql.unsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
        messages_log.push(`truncated ${tables.length} public tables`);
      }
    }

    // ── conversations + messages ──────────────────────────────────────────
    const titles = ['E2E Conversation Alpha', 'E2E Conversation Beta', 'E2E Conversation Gamma'];
    let messageCount = 0;
    for (let i = 0; i < E2E_CONVERSATION_IDS.length; i++) {
      const id = E2E_CONVERSATION_IDS[i]!;
      const title = titles[i]!;
      const preview = `Hello from ${title}`;
      await sql.unsafe(
        `INSERT INTO conversations (id, title, last_message_preview, created_at, updated_at)
         VALUES ($1::uuid, $2, $3, now(), now())
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           last_message_preview = EXCLUDED.last_message_preview,
           updated_at = now()`,
        [id, title, preview]
      );
      // user + assistant message per conversation
      for (const [j, role] of [
        ['1', 'user'],
        ['2', 'assistant'],
      ] as const) {
        const mid = msgId(i + 1, Number(j));
        const content =
          role === 'user' ? `User seed message for ${title}` : `Assistant seed reply for ${title}`;
        await sql.unsafe(
          `INSERT INTO chat_messages (id, conversation_id, role, content, message_type, created_at)
           VALUES ($1::uuid, $2, $3, $4, 'text', now())
           ON CONFLICT (id) DO UPDATE SET
             content = EXCLUDED.content,
             role = EXCLUDED.role`,
          [mid, id, role, content]
        );
        messageCount += 1;
      }
    }
    messages_log.push(
      `seeded ${E2E_CONVERSATION_IDS.length} conversations + ${messageCount} messages`
    );

    // REDHAT-FIX-01 / S-REACTIVE-01: deterministic 'Streaming' conversation so
    // Maestro visible: "Streaming" oracles and the seeded-streaming-conversation
    // fixture match real Postgres rows (not optional:true greenwash).
    {
      const id = E2E_STREAMING_CONVERSATION_ID;
      const title = 'Streaming';
      const preview = 'Hello from Streaming';
      await sql.unsafe(
        `INSERT INTO conversations (id, title, last_message_preview, created_at, updated_at)
         VALUES ($1::uuid, $2, $3, now(), now())
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           last_message_preview = EXCLUDED.last_message_preview,
           updated_at = now()`,
        [id, title, preview]
      );
      // conv index 4 keeps msg UUIDs distinct from Alpha/Beta/Gamma (1..3)
      for (const [j, role] of [
        ['1', 'user'],
        ['2', 'assistant'],
      ] as const) {
        const mid = msgId(4, Number(j));
        const content =
          role === 'user' ? `User seed message for ${title}` : `Assistant seed reply for ${title}`;
        await sql.unsafe(
          `INSERT INTO chat_messages (id, conversation_id, role, content, message_type, created_at)
           VALUES ($1::uuid, $2, $3, $4, 'text', now())
           ON CONFLICT (id) DO UPDATE SET
             content = EXCLUDED.content,
             role = EXCLUDED.role`,
          [mid, id, role, content]
        );
        messageCount += 1;
      }
      messages_log.push('seeded Streaming conversation + 2 messages');
    }

    // CHAT-15 uses the same stable reference route as the non-E2E seed. Keep
    // this conversation message-free so the manual run can prove exactly-once
    // creation of its unique user and assistant rows.
    await sql.unsafe(
      `INSERT INTO conversations (id, title, last_message_preview, created_at, updated_at)
       VALUES ($1::uuid, 'Sprint 20 reference conversation', '', now(), now())
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         last_message_preview = EXCLUDED.last_message_preview,
         updated_at = now()`,
      [E2E_REFERENCE_CONVERSATION_ID]
    );
    messages_log.push('seeded Sprint 20 reference conversation');

    // ── documents (17, multi-category) ────────────────────────────────────
    // HIGH-3 / GATE-FIX-002 + GATE-FIX-007: every seeded public doc carries a
    // stable share_token so share-url-mastra can assert Mastra /article/ on any
    // list card, regardless of its seed insertion order.
    for (let n = 1; n <= E2E_DOCUMENT_CATEGORIES.length; n++) {
      const id = docId(n);
      const category = E2E_DOCUMENT_CATEGORIES[(n - 1) % E2E_DOCUMENT_CATEGORIES.length]!;
      const title = `E2E Document ${n} (${category})`;
      const content = seededDocumentContent(n, category);
      const shareToken = `e2e-share-token-00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
      const isToolbeltDocument = [
        'libraries',
        'cli',
        'framework',
        'service',
        'database',
        'tool',
      ].includes(category);
      await sql.unsafe(
        `INSERT INTO documents (
           id, title, content, category, status, is_public, share_token, file_path, file_type, created_at
         ) VALUES ($1::uuid, $2, $3, $4, 'published', true, $5, $6, $7, now())
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           content = EXCLUDED.content,
           category = EXCLUDED.category,
           status = EXCLUDED.status,
           is_public = EXCLUDED.is_public,
           share_token = EXCLUDED.share_token,
           file_path = EXCLUDED.file_path,
           file_type = EXCLUDED.file_type`,
        [
          id,
          title,
          content,
          category,
          shareToken,
          isToolbeltDocument ? `https://example.com/e2e-toolbelt-${category}` : null,
          isToolbeltDocument ? 'website' : null,
        ]
      );
    }
    const categorySet = new Set(E2E_DOCUMENT_CATEGORIES);
    messages_log.push(
      `seeded ${E2E_DOCUMENT_CATEGORIES.length} documents across ${categorySet.size} categories`
    );

    // ── feed_items (5) ────────────────────────────────────────────────────
    for (let n = 1; n <= 5; n++) {
      const id = feedId(n);
      await sql.unsafe(
        `INSERT INTO feed_items (
           id, group_key, title, summary, content_type, item_count,
           creator_name, author_handle, viewed, published_at, discovered_at, created_at
         ) VALUES (
           $1::uuid, $2, $3, $4, 'article', 1,
           $5, $6, false, now() - ($7::int || ' hours')::interval, now(), now()
         )
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           summary = EXCLUDED.summary,
           group_key = EXCLUDED.group_key`,
        [
          id,
          `e2e-group-${n}`,
          `E2E Feed Item ${n}`,
          `Seeded What's New feed item ${n} for Sprint 24 e2e.`,
          `Creator ${n}`,
          `@creator${n}`,
          String(n),
        ]
      );
    }
    messages_log.push('seeded 5 feed_items');

    // ── subscriptions (sources + durable researched documents) ───────────
    for (const [index, source] of E2E_SUBSCRIPTION_SOURCES.entries()) {
      await sql.unsafe(
        `INSERT INTO subscription_sources (
           id, source_type, identifier, name, url, feed_url, config_json,
           auto_research, creator_profile_id, created_at, updated_at
         ) VALUES (
           $1::uuid, $2, $3, $4, $5, $5, $6::jsonb, $7, $8::text,
           now() - ($9::int || ' minutes')::interval, now()
         )
         ON CONFLICT (id) DO UPDATE SET
           source_type = EXCLUDED.source_type,
           identifier = EXCLUDED.identifier,
           name = EXCLUDED.name,
           url = EXCLUDED.url,
           feed_url = EXCLUDED.feed_url,
           config_json = EXCLUDED.config_json,
           auto_research = EXCLUDED.auto_research,
           creator_profile_id = EXCLUDED.creator_profile_id,
           updated_at = now()`,
        [
          source.id,
          source.sourceType,
          source.identifier,
          source.name,
          source.url,
          JSON.stringify(source.config),
          source.autoResearch,
          source.creatorProfileId,
          String(index),
        ]
      );
    }

    for (const [index, content] of E2E_SUBSCRIPTION_CONTENT.entries()) {
      await sql.unsafe(
        `INSERT INTO subscription_content (
           id, source_id, content_id, title, url, metadata_json, passed_filter,
           research_status, discovered_at, researched_at, document_id, in_feed,
           author_handle, content_category, ai_relevance_score, feed_item_id, created_at
         ) VALUES (
           $1::uuid, $2::uuid, $1::text, $3, $4, $5::jsonb, true,
           'researched', now() - ($6::int || ' hours')::interval,
           now() - ($6::int || ' hours')::interval, $7::uuid, true,
           '@e2e', $8, 0.9, $9::uuid, now()
         )
         ON CONFLICT (id) DO UPDATE SET
           source_id = EXCLUDED.source_id,
           title = EXCLUDED.title,
           url = EXCLUDED.url,
           metadata_json = EXCLUDED.metadata_json,
           research_status = EXCLUDED.research_status,
           document_id = EXCLUDED.document_id,
           content_category = EXCLUDED.content_category,
           ai_relevance_score = EXCLUDED.ai_relevance_score,
           feed_item_id = EXCLUDED.feed_item_id`,
        [
          content.id,
          content.sourceId,
          content.title,
          content.url,
          JSON.stringify({ description: content.description }),
          String(index + 1),
          content.documentId,
          content.category,
          feedId(index + 1),
        ]
      );
    }
    messages_log.push(
      `seeded ${E2E_SUBSCRIPTION_SOURCES.length} subscription_sources + ${E2E_SUBSCRIPTION_CONTENT.length} researched subscription_content rows`
    );

    for (const session of E2E_RESEARCH_SESSIONS) {
      await sql.unsafe(
        `INSERT INTO research_sessions (
           id, system, query, topic, status, max_iterations, current_iteration,
           coverage_score, findings, document_id, created_at, updated_at, completed_at
         ) VALUES (
           $1::uuid, 'deep', $2, $2, $3, $4, $5, $6,
           $7::jsonb, $8, now() - interval '20 minutes', now(),
           CASE WHEN $3 = 'completed' THEN now() ELSE NULL END
         )
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           max_iterations = EXCLUDED.max_iterations,
           current_iteration = EXCLUDED.current_iteration,
           coverage_score = EXCLUDED.coverage_score,
           findings = EXCLUDED.findings,
           document_id = EXCLUDED.document_id,
           updated_at = now(),
           completed_at = EXCLUDED.completed_at`,
        [
          session.id,
          session.topic,
          session.status,
          String(session.maxIterations),
          String(session.currentIteration),
          String(session.status === 'completed' ? 4.4 : 3.2),
          JSON.stringify(
            session.status === 'completed'
              ? 'Durable mobile data remains coherent across intermittent connectivity and relaunch.'
              : 'Research is actively evaluating resilient native request handling.'
          ),
          session.documentId,
        ]
      );
    }
    for (const iteration of E2E_RESEARCH_ITERATIONS) {
      await sql.unsafe(
        `INSERT INTO research_iterations (
           id, system, session_id, iteration_number, status, coverage_score, summary, findings, sources, created_at
         ) VALUES ($1::uuid, 'deep', $2::uuid, $3, $4, $5, $6, $7::jsonb, $8::jsonb, now())
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           coverage_score = EXCLUDED.coverage_score,
           summary = EXCLUDED.summary,
           findings = EXCLUDED.findings`,
        [
          iteration.id,
          iteration.sessionId,
          String(iteration.number),
          iteration.status,
          String(iteration.coverage),
          iteration.summary,
          JSON.stringify(iteration.summary),
          JSON.stringify('sources' in iteration ? iteration.sources : []),
        ]
      );
    }
    messages_log.push(
      `seeded ${E2E_RESEARCH_SESSIONS.length} research_sessions + ${E2E_RESEARCH_ITERATIONS.length} research_iterations`
    );

    // ── assimilation sessions (pending reviewer plans) ───────────────────
    for (const session of E2E_ASSIMILATION_SESSIONS) {
      await sql.unsafe(
        `INSERT INTO assimilation_sessions (
           id, repository_url, repository_name, profile, status, current_iteration,
           max_iterations, plan_content, plan_summary, auto_approve, created_at, updated_at, completed_at
         ) VALUES ($1::uuid, $2, $3, 'standard', 'pending_approval', 0, 3, $4, $5, false, now(), now(), NULL)
         ON CONFLICT (id) DO UPDATE SET
           repository_url = EXCLUDED.repository_url,
           repository_name = EXCLUDED.repository_name,
           profile = EXCLUDED.profile,
           status = EXCLUDED.status,
           current_iteration = EXCLUDED.current_iteration,
           max_iterations = EXCLUDED.max_iterations,
           plan_content = EXCLUDED.plan_content,
           plan_summary = EXCLUDED.plan_summary,
           plan_feedback = NULL,
           auto_approve = EXCLUDED.auto_approve,
           updated_at = now(),
           completed_at = NULL`,
        [
          session.id,
          session.repositoryUrl,
          session.repositoryName,
          session.planContent,
          session.planSummary,
        ]
      );
    }
    messages_log.push(`seeded ${E2E_ASSIMILATION_SESSIONS.length} pending assimilation_sessions`);

    // ── improvement_requests (representative open + closed list states) ──
    for (const improvement of E2E_IMPROVEMENTS) {
      await sql.unsafe(
        `INSERT INTO improvement_requests (id, title, description, status, source_screen, created_at, updated_at, processed_at)
         VALUES ($1::uuid, $2, $3, $4, 'e2e-seed', now(), now(), CASE WHEN $4 = 'completed' THEN now() ELSE NULL END)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           status = EXCLUDED.status,
           processed_at = EXCLUDED.processed_at,
           updated_at = now()`,
        [improvement.id, improvement.title, improvement.description, improvement.status]
      );
    }
    messages_log.push('seeded 2 improvement_requests');

    // ── whats_new_reports (1 report with representative external findings) ─
    await sql.unsafe(
      `INSERT INTO whats_new_reports (
         id, period_start, period_end, days, focus,
         discovery_only, findings_count, discovery_count, release_count, trend_count,
         summary_json, findings_json, created_at
       ) VALUES (
         $1::uuid, now() - interval '7 days', now(), 7, 'e2e-seed',
         false, 6, 2, 2, 1,
         $2::jsonb, $3::jsonb, now()
       )
       ON CONFLICT (id) DO UPDATE SET
         findings_count = EXCLUDED.findings_count,
         discovery_count = EXCLUDED.discovery_count,
         release_count = EXCLUDED.release_count,
         trend_count = EXCLUDED.trend_count,
         summary_json = EXCLUDED.summary_json,
         findings_json = EXCLUDED.findings_json`,
      [
        whatsNewId(),
        JSON.stringify({ seed: true, feed_items: 5, version: E2E_SEED_VERSION }),
        JSON.stringify(E2E_WHATS_NEW_FINDINGS),
      ]
    );
    messages_log.push('seeded 1 whats_new_report');

    const seed_fingerprint = fingerprint({
      version: E2E_SEED_VERSION,
      // Alpha/Beta/Gamma + Streaming + Sprint 20 reference
      conversations: E2E_CONVERSATION_IDS.length + 2,
      messages: messageCount,
      documents: E2E_DOCUMENT_CATEGORIES.length,
      categories: [...categorySet].sort(),
      feed_items: 5,
      subscription_sources: E2E_SUBSCRIPTION_SOURCES.length,
      subscription_content: E2E_SUBSCRIPTION_CONTENT.length,
      research_sessions: E2E_RESEARCH_SESSIONS.length,
      research_iterations: E2E_RESEARCH_ITERATIONS.length,
      assimilation_sessions: E2E_ASSIMILATION_SESSIONS.length,
      whats_new_reports: 1,
      conversation_ids: [
        ...E2E_CONVERSATION_IDS,
        E2E_STREAMING_CONVERSATION_ID,
        E2E_REFERENCE_CONVERSATION_ID,
      ],
    });

    return {
      ok: errors.length === 0,
      database: databaseNameFromUrl(databaseUrl),
      seed_fingerprint,
      conversations: E2E_CONVERSATION_IDS.length + 2,
      messages: messageCount,
      documents: E2E_DOCUMENT_CATEGORIES.length,
      categories: categorySet.size,
      feed_items: 5,
      subscription_sources: E2E_SUBSCRIPTION_SOURCES.length,
      subscription_content: E2E_SUBSCRIPTION_CONTENT.length,
      research_sessions: E2E_RESEARCH_SESSIONS.length,
      research_iterations: E2E_RESEARCH_ITERATIONS.length,
      assimilation_sessions: E2E_ASSIMILATION_SESSIONS.length,
      whats_new_reports: 1,
      reset,
      messages_log,
      errors,
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return {
      ok: false,
      database: databaseNameFromUrl(databaseUrl),
      seed_fingerprint: '',
      conversations: 0,
      messages: 0,
      documents: 0,
      categories: 0,
      feed_items: 0,
      subscription_sources: 0,
      subscription_content: 0,
      research_sessions: 0,
      research_iterations: 0,
      assimilation_sessions: 0,
      whats_new_reports: 0,
      reset,
      messages_log,
      errors,
    };
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}
