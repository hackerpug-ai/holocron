/**
 * Sprint 11 queue-2: transactional outbox/inbox + observable effects.
 *
 * Exactly-once observable effects: each table carries a stable idempotency key
 * with a UNIQUE constraint. The fenced consumer writes the effect AND the inbox
 * dedupe row in a single transaction (see queue/durable.ts).
 */
import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAtColumn, idColumn, timestamptz } from '../columns';

export const queueOutbox = pgTable(
  'queue_outbox',
  {
    id: idColumn(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    payload: jsonb('payload').notNull().default({}),
    status: text('status').notNull().default('pending'),
    fenceToken: text('fence_token'),
    effectId: uuid('effect_id'),
    createdAt: createdAtColumn(),
    dispatchedAt: timestamptz('dispatched_at'),
    ackedAt: timestamptz('acked_at'),
  },
  (t) => [
    uniqueIndex('queue_outbox_key_uidx').on(t.key),
    index('queue_outbox_status_idx').on(t.status),
    check('queue_outbox_status_check', sql`${t.status} IN ('pending', 'dispatched', 'acked')`),
  ]
);

export const queueEffects = pgTable(
  'queue_effects',
  {
    id: idColumn(),
    key: text('key').notNull(),
    payload: jsonb('payload').notNull().default({}),
    fenceToken: text('fence_token').notNull(),
    createdAt: createdAtColumn(),
  },
  (t) => [uniqueIndex('queue_effects_key_uidx').on(t.key)]
);

export const queueInbox = pgTable(
  'queue_inbox',
  {
    id: idColumn(),
    key: text('key').notNull(),
    outboxId: uuid('outbox_id').references(() => queueOutbox.id, { onDelete: 'cascade' }),
    effectId: uuid('effect_id').references(() => queueEffects.id, { onDelete: 'cascade' }),
    fenceToken: text('fence_token').notNull(),
    outcome: text('outcome').notNull(),
    createdAt: createdAtColumn(),
  },
  (t) => [
    uniqueIndex('queue_inbox_key_uidx').on(t.key),
    index('queue_inbox_outcome_idx').on(t.outcome),
    check('queue_inbox_outcome_check', sql`${t.outcome} IN ('applied', 'deduped')`),
  ]
);
