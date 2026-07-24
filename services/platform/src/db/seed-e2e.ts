/**
 * DEPENDENCY-S24-E2E-SUBSTRATE — deterministic Maestro/e2e seed for Sprint 24.
 *
 * Seeds the Zero-published Postgres surface:
 *   - 3 conversations + messages
 *   - 12 documents across multiple categories
 *   - 5 feed_items (What's New feed)
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

export const E2E_SEED_VERSION = 1;

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

export type SeedE2eResult = {
  ok: boolean;
  database: string;
  seed_fingerprint: string;
  conversations: number;
  messages: number;
  documents: number;
  categories: number;
  feed_items: number;
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
    // HIGH-3 / GATE-FIX-002: at least one public doc must carry share_token so
    // share-url-mastra can assert Mastra /article/ without relying on publish-only path.
    const e2eShareToken = 'e2e-share-token-00000000-0000-4000-8000-0000000000b1';
    for (let n = 1; n <= 12; n++) {
      const id = docId(n);
      const category = E2E_DOCUMENT_CATEGORIES[(n - 1) % E2E_DOCUMENT_CATEGORIES.length]!;
      const title = `E2E Document ${n} (${category})`;
      const content = `Seeded e2e document #${n} in category ${category} for Maestro Zero reads.`;
      // First public document gets a stable share_token (uuid-shaped) for share flow.
      const shareToken = n === 1 ? e2eShareToken : null;
      await sql.unsafe(
        `INSERT INTO documents (id, title, content, category, status, is_public, share_token, created_at)
         VALUES ($1::uuid, $2, $3, $4, 'published', true, $5, now())
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           content = EXCLUDED.content,
           category = EXCLUDED.category,
           status = EXCLUDED.status,
           is_public = EXCLUDED.is_public,
           share_token = COALESCE(EXCLUDED.share_token, documents.share_token)`,
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

    // ── whats_new_reports (1 companion report; feed is primary) ───────────
    await sql.unsafe(
      `INSERT INTO whats_new_reports (
         id, period_start, period_end, days, focus,
         discovery_only, findings_count, discovery_count, release_count, trend_count,
         summary_json, created_at
       ) VALUES (
         $1::uuid, now() - interval '7 days', now(), 7, 'e2e-seed',
         false, 5, 2, 2, 1,
         $2::jsonb, now()
       )
       ON CONFLICT (id) DO UPDATE SET
         findings_count = EXCLUDED.findings_count,
         summary_json = EXCLUDED.summary_json`,
      [whatsNewId(), JSON.stringify({ seed: true, feed_items: 5, version: E2E_SEED_VERSION })]
    );
    messages_log.push('seeded 1 whats_new_report');

    const seed_fingerprint = fingerprint({
      version: E2E_SEED_VERSION,
      conversations: E2E_CONVERSATION_IDS.length,
      messages: messageCount,
      documents: 12,
      categories: [...categorySet].sort(),
      feed_items: 5,
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
      whats_new_reports: 0,
      reset,
      messages_log,
      errors,
    };
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}
