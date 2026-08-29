/**
 * observability group — service_events (durable redacted first-party signal ledger).
 *
 * The physical table is created by migration 0040. This Drizzle model mirrors it so
 * the schema barrel stays the single source of schema truth (S31-01). The public
 * writer (observability/service-events.ts) validates inputs and never bypasses the
 * redacted=true invariant; the DB CHECK is the independent backstop.
 */
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { createdAtColumn, idColumn, timestamptz } from '../columns';

export const SERVICE_EVENT_SOURCES = ['deployment', 'health', 'observability'] as const;

export const serviceEvents = pgTable(
  'service_events',
  {
    id: idColumn(),
    occurredAt: timestamptz('occurred_at').default(sql`now()`).notNull(),
    source: text('source').notNull(),
    category: text('category'),
    type: text('type').notNull(),
    severity: text('severity'),
    status: text('status'),
    traceId: text('trace_id'),
    runId: text('run_id'),
    entityId: text('entity_id'),
    durationMs: integer('duration_ms'),
    summary: text('summary').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    redacted: boolean('redacted').default(true).notNull(),
    releaseSha: text('release_sha'),
    imageDigest: text('image_digest'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    check('service_events_redacted_check', sql`${t.redacted} = true`),
    check(
      'service_events_duration_nonnegative_check',
      sql`${t.durationMs} IS NULL OR ${t.durationMs} >= 0`
    ),
    check(
      'service_events_source_check',
      sql`${t.source} IN ('deployment', 'health', 'observability')`
    ),
    check('service_events_summary_bounded_check', sql`char_length(${t.summary}) <= 4000`),
    index('service_events_occurred_at_id_idx').on(t.occurredAt.desc(), t.id),
    index('service_events_source_time_idx').on(t.source, t.occurredAt.desc()),
    index('service_events_trace_time_idx').on(t.traceId, t.occurredAt.desc()),
    index('service_events_run_time_idx').on(t.runId, t.occurredAt.desc()),
  ]
);
