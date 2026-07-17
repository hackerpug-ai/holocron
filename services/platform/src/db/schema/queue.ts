/**
 * Sprint 11 queue-1: leased queue tables (priority / DLQ / fencing).
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAtColumn, idColumn, timestamptz, updatedAtColumn } from '../columns';

export const queueJobs = pgTable(
  'queue_jobs',
  {
    id: idColumn(),
    key: text('key'),
    name: text('name').notNull(),
    lane: text('lane').notNull(),
    priority: integer('priority').notNull().default(0),
    payload: jsonb('payload').notNull().default({}),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    fenceToken: text('fence_token'),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamptz('lease_expires_at'),
    availableAt: timestamptz('available_at').notNull().default(sql`now()`),
    lastError: text('last_error'),
    poison: boolean('poison').notNull().default(false),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    completedAt: timestamptz('completed_at'),
  },
  (t) => [
    uniqueIndex('queue_jobs_key_uidx').on(t.key).where(sql`${t.key} IS NOT NULL`),
    index('queue_jobs_dequeue_idx').on(t.status, t.priority, t.availableAt, t.createdAt),
    index('queue_jobs_lane_status_idx').on(t.lane, t.status),
    check('queue_jobs_lane_check', sql`${t.lane} IN ('interactive', 'background')`),
    check(
      'queue_jobs_status_check',
      sql`${t.status} IN ('pending','leased','completed','failed','dead_letter','cancelled')`
    ),
  ]
);

export const queueDlq = pgTable(
  'queue_dlq',
  {
    id: idColumn(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => queueJobs.id, { onDelete: 'cascade' }),
    key: text('key'),
    name: text('name').notNull(),
    lane: text('lane'),
    priority: integer('priority'),
    payload: jsonb('payload').notNull().default({}),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lastError: text('last_error'),
    fenceToken: text('fence_token'),
    reason: text('reason').notNull().default('retry_exhausted'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    index('queue_dlq_key_idx').on(t.key),
    index('queue_dlq_job_id_idx').on(t.jobId),
    index('queue_dlq_created_at_idx').on(t.createdAt),
  ]
);

export const queueBackendMeta = pgTable(
  'queue_backend_meta',
  {
    id: integer('id').primaryKey().default(1).notNull(),
    backend: text('backend').notNull().default('pg-boss'),
    ready: boolean('ready').notNull().default(false),
    updatedAt: updatedAtColumn(),
  },
  (t) => [
    check('queue_backend_meta_singleton', sql`${t.id} = 1`),
    check('queue_backend_meta_backend_check', sql`${t.backend} IN ('pg-boss', 'graphile-worker')`),
  ]
);
