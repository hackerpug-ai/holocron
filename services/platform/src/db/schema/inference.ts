/**
 * obs-2 — Inference telemetry schema (per-model-call detective control).
 *
 * Distinct from legacy agent_telemetry (classification events). This table
 * records one redacted row per real model call: tokens, wall-ms, endpoint,
 * role, provider, run/trace identity, terminal status.
 */

import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAtColumn, idColumn } from '../columns';

export const inferenceTelemetry = pgTable(
  'inference_telemetry',
  {
    id: idColumn(),
    runId: text('run_id'),
    stepId: text('step_id'),
    traceId: text('trace_id'),
    role: text('role').notNull(),
    /** 'fleet' | 'anthropic' */
    provider: text('provider').notNull(),
    endpoint: text('endpoint').notNull(),
    modelId: text('model_id'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    wallMs: integer('wall_ms').notNull(),
    /** 'success' | 'error' | 'degraded' */
    status: text('status').notNull(),
    errorCode: text('error_code'),
    /** Short redacted operator message — NEVER prompt/response bodies. */
    errorMessage: text('error_message'),
    /** Optional correlation to budget_ledger.id for budgeted escapes. */
    budgetLedgerId: uuid('budget_ledger_id'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    index('inference_telemetry_run_id_idx').on(t.runId),
    index('inference_telemetry_trace_id_idx').on(t.traceId),
    index('inference_telemetry_created_at_idx').on(t.createdAt),
    index('inference_telemetry_provider_idx').on(t.provider),
    check(
      'inference_telemetry_tokens_nonneg',
      sql`${t.inputTokens} >= 0 AND ${t.outputTokens} >= 0 AND ${t.totalTokens} >= 0`
    ),
    check('inference_telemetry_wall_ms_nonneg', sql`${t.wallMs} >= 0`),
    check('inference_telemetry_status_check', sql`${t.status} IN ('success', 'error', 'degraded')`),
    check('inference_telemetry_provider_check', sql`${t.provider} IN ('fleet', 'anthropic')`),
  ]
);

export type InferenceTelemetryRow = typeof inferenceTelemetry.$inferSelect;
export type InferenceTelemetryInsert = typeof inferenceTelemetry.$inferInsert;
