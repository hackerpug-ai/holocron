/**
 * DEPENDENCY-S24-E2E-SUBSTRATE — deterministic Maestro/e2e seed for Sprint 24.
 *
 * Seeds the Zero-published Postgres surface:
 *   - 3 conversations + messages
 *   - 12 documents across multiple categories
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

export const E2E_SEED_VERSION = 3;

/** Deterministic UUIDs (uuid v4-shaped) so Maestro / Zero can target stable ids. */
export const E2E_CONVERSATION_IDS = [
  '00000000-0000-4000-8000-0000000000e1',
  '00000000-0000-4000-8000-0000000000e2',
  '00000000-0000-4000-8000-0000000000e3',
] as const;

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
    description: 'A deterministic researched article for the Aurora creator group.',
  },
  {
    id: e2eUuid('f', 12),
    sourceId: E2E_SUBSCRIPTION_SOURCES[1].id,
    documentId: docId(2),
    title: 'E2E Aurora Video: Zero Synchronization',
    url: 'https://example.com/e2e-aurora-video',
    category: 'video',
    description: 'A deterministic researched video for the Aurora creator group.',
  },
  {
    id: e2eUuid('f', 13),
    sourceId: E2E_SUBSCRIPTION_SOURCES[2].id,
    documentId: docId(3),
    title: 'E2E Platform Release: Durable Commands',
    url: 'https://example.com/e2e-platform-release',
    category: 'release',
    description: 'A deterministic researched release note for subscription search.',
  },
  {
    id: e2eUuid('f', 14),
    sourceId: E2E_SUBSCRIPTION_SOURCES[3].id,
    documentId: docId(4),
    title: 'E2E Community Discussion: Offline Queue',
    url: 'https://example.com/e2e-community-discussion',
    category: 'social',
    description: 'A deterministic researched social discussion for subscription search.',
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

    // ── documents (12, multi-category) ────────────────────────────────────
    // HIGH-3 / GATE-FIX-002 + GATE-FIX-007: every seeded public doc carries a
    // stable share_token so share-url-mastra can assert Mastra /article/ on any
    // list card (articles sort created_at desc → index 0 is often doc 12).
    for (let n = 1; n <= 12; n++) {
      const id = docId(n);
      const category = E2E_DOCUMENT_CATEGORIES[(n - 1) % E2E_DOCUMENT_CATEGORIES.length]!;
      const title = `E2E Document ${n} (${category})`;
      const content = `Seeded e2e document #${n} in category ${category} for Maestro Zero reads.`;
      const shareToken = `e2e-share-token-00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
      await sql.unsafe(
        `INSERT INTO documents (id, title, content, category, status, is_public, share_token, created_at)
         VALUES ($1::uuid, $2, $3, $4, 'published', true, $5, now())
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           content = EXCLUDED.content,
           category = EXCLUDED.category,
           status = EXCLUDED.status,
           is_public = EXCLUDED.is_public,
           share_token = EXCLUDED.share_token`,
        [id, title, content, category, shareToken]
      );
    }
    const categorySet = new Set(E2E_DOCUMENT_CATEGORIES.slice(0, 12));
    messages_log.push(`seeded 12 documents across ${categorySet.size} categories`);

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
           author_handle, content_category, ai_relevance_score, created_at
         ) VALUES (
           $1::uuid, $2::uuid, $1::text, $3, $4, $5::jsonb, true,
           'researched', now() - ($6::int || ' hours')::interval,
           now() - ($6::int || ' hours')::interval, $7::uuid, true,
           '@e2e', $8, 0.9, now()
         )
         ON CONFLICT (id) DO UPDATE SET
           source_id = EXCLUDED.source_id,
           title = EXCLUDED.title,
           url = EXCLUDED.url,
           metadata_json = EXCLUDED.metadata_json,
           research_status = EXCLUDED.research_status,
           document_id = EXCLUDED.document_id,
           content_category = EXCLUDED.content_category,
           ai_relevance_score = EXCLUDED.ai_relevance_score`,
        [
          content.id,
          content.sourceId,
          content.title,
          content.url,
          JSON.stringify({ description: content.description }),
          String(index + 1),
          content.documentId,
          content.category,
        ]
      );
    }
    messages_log.push(
      `seeded ${E2E_SUBSCRIPTION_SOURCES.length} subscription_sources + ${E2E_SUBSCRIPTION_CONTENT.length} researched subscription_content rows`
    );

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
      conversations: E2E_CONVERSATION_IDS.length,
      messages: messageCount,
      documents: 12,
      categories: [...categorySet].sort(),
      feed_items: 5,
      subscription_sources: E2E_SUBSCRIPTION_SOURCES.length,
      subscription_content: E2E_SUBSCRIPTION_CONTENT.length,
      whats_new_reports: 1,
      conversation_ids: [...E2E_CONVERSATION_IDS],
    });

    return {
      ok: errors.length === 0,
      database: databaseNameFromUrl(databaseUrl),
      seed_fingerprint,
      conversations: E2E_CONVERSATION_IDS.length,
      messages: messageCount,
      documents: 12,
      categories: categorySet.size,
      feed_items: 5,
      subscription_sources: E2E_SUBSCRIPTION_SOURCES.length,
      subscription_content: E2E_SUBSCRIPTION_CONTENT.length,
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
      whats_new_reports: 0,
      reset,
      messages_log,
      errors,
    };
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}
