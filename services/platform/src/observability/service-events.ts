/**
 * Public service-event writer — the single first-party signal sink (OBS-03).
 *
 * Persists bounded, redacted events into the real `service_events` table. Every
 * write validates its input BEFORE reaching Postgres and the INSERT is hardcoded
 * to redacted=true (the DB CHECK is an independent backstop, not the only gate).
 *
 * Rejections (fail closed, zero rows inserted):
 *   - redacted=false
 *   - unknown metadata key (only allowlisted operational keys)
 *   - oversized summary
 *   - secret sentinel or sensitive assignment in summary/metadata
 *   - negative duration_ms / unknown source / empty type
 */
import { createSql, type Sql } from '../db/client.ts';

export const SERVICE_EVENT_SOURCES = ['deployment', 'health', 'observability'] as const;
export type ServiceEventSource = (typeof SERVICE_EVENT_SOURCES)[number];

/** Bounded deterministic summary ceiling (mirrors the DB char_length CHECK). */
export const SERVICE_EVENT_MAX_SUMMARY_LENGTH = 4000;

/**
 * Operational metadata keys allowed on a service event. Raw bodies, prompts,
 * queries, source text, URLs, and unbounded content are NOT here by design.
 */
export const SERVICE_EVENT_METADATA_ALLOWLIST = [
  'job_name',
  'category',
  'sources_checked',
  'rows_affected',
  'source_count',
  'latency_ms',
  'ready',
  'backend',
  'endpoint',
  'external_state',
  'queue_depth',
  'queue_capacity',
  'last_success_at',
  'last_failure_at',
  'last_failure_code',
  'service_name',
  'release_sha',
  'image_digest',
] as const;

export type ServiceEventMetadataKey = (typeof SERVICE_EVENT_METADATA_ALLOWLIST)[number];

const METADATA_ALLOWLIST_SET: ReadonlySet<string> = new Set(SERVICE_EVENT_METADATA_ALLOWLIST);

/**
 * Secret-sentinel + sensitive-assignment detection. Matches the OBS-02/03 sentinel
 * convention and the assignment/header patterns that must never be persisted.
 */
const SECRET_SENTINEL_RE = /\b(?:trace-secret|OBS0[1-3]-SECRET-SENTINEL)[0-9a-zA-Z_-]*\b/i;
// NOTE: no /g flag. A global regex used with RegExp.prototype.test() is stateful
// (lastIndex advances on match and the next .test() resumes from that index), so
// secret detection would become call-order-dependent. Keep these presence checks
// deterministic: /i only, never /g.
const SENSITIVE_ASSIGN_RE =
  /\b(secret|password|token|api[_-]?key|authorization|bearer)\s*[:=]\s*([^\s,;]+)/i;
const BEARER_TOKEN_RE = /\bBearer\s+[A-Za-z0-9._-]+/i;

function containsSecretSentinel(value: unknown): boolean {
  if (typeof value === 'string') {
    if (SECRET_SENTINEL_RE.test(value)) return true;
    if (SENSITIVE_ASSIGN_RE.test(value)) return true;
    if (BEARER_TOKEN_RE.test(value)) return true;
    return false;
  }
  if (Array.isArray(value)) return value.some((item) => containsSecretSentinel(item));
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, child]) =>
        // A sensitive key name with a non-trivial value is itself a secret signal.
        (SENSITIVE_ASSIGN_RE.test(`${key}=value`) &&
          typeof child === 'string' &&
          child.length >= 3) ||
        containsSecretSentinel(child)
    );
  }
  return false;
}

export type ServiceEventWriteInput = {
  source: ServiceEventSource;
  type: string;
  summary: string;
  category?: string;
  severity?: string;
  status?: string;
  traceId?: string;
  runId?: string;
  entityId?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  releaseSha?: string;
  imageDigest?: string;
  /** Must be true. An explicit false is rejected before INSERT (AC-4). */
  redacted?: boolean;
};

export type ServiceEventWriteResult =
  | { ok: true; eventId: string; redacted: true }
  | { ok: false; error: string };

/** Fail-closed input validation. Pure — no I/O, safe to call repeatedly. */
export function validateServiceEventInput(
  input: ServiceEventWriteInput
): { ok: true } | { ok: false; error: string } {
  if (input.redacted === false) {
    return { ok: false, error: 'SERVICE_EVENT_REJECTED: redacted must be true' };
  }
  if (!SERVICE_EVENT_SOURCES.includes(input.source)) {
    return { ok: false, error: 'SERVICE_EVENT_REJECTED: unknown source' };
  }
  if (typeof input.type !== 'string' || input.type.trim().length === 0) {
    return { ok: false, error: 'SERVICE_EVENT_REJECTED: type is required' };
  }
  if (typeof input.summary !== 'string' || input.summary.trim().length === 0) {
    return { ok: false, error: 'SERVICE_EVENT_REJECTED: summary is required' };
  }
  if (input.summary.length > SERVICE_EVENT_MAX_SUMMARY_LENGTH) {
    return { ok: false, error: 'SERVICE_EVENT_REJECTED: summary exceeds size bound' };
  }
  if (input.durationMs !== undefined && input.durationMs < 0) {
    return { ok: false, error: 'SERVICE_EVENT_REJECTED: duration_ms must be non-negative' };
  }
  if (input.metadata !== undefined) {
    if (
      typeof input.metadata !== 'object' ||
      input.metadata === null ||
      Array.isArray(input.metadata)
    ) {
      return { ok: false, error: 'SERVICE_EVENT_REJECTED: metadata must be an object' };
    }
    for (const key of Object.keys(input.metadata)) {
      if (!METADATA_ALLOWLIST_SET.has(key)) {
        return { ok: false, error: `SERVICE_EVENT_REJECTED: unknown metadata key "${key}"` };
      }
    }
    if (containsSecretSentinel(input.metadata)) {
      return { ok: false, error: 'SERVICE_EVENT_REJECTED: secret sentinel in metadata' };
    }
  }
  if (containsSecretSentinel(input.summary)) {
    return { ok: false, error: 'SERVICE_EVENT_REJECTED: secret sentinel in summary' };
  }
  return { ok: true };
}

/**
 * Insert a validated service event into real Postgres.
 *
 * The INSERT never carries a caller-supplied redacted value — it is always true,
 * so a caller who somehow slips redacted=false past validation cannot corrupt the
 * durable ledger.
 */
export async function writeServiceEvent(
  input: ServiceEventWriteInput,
  options?: { databaseUrl?: string }
): Promise<ServiceEventWriteResult> {
  const validation = validateServiceEventInput(input);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const sql: Sql = createSql(options?.databaseUrl);
  try {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO service_events (
        source,
        category,
        type,
        severity,
        status,
        trace_id,
        run_id,
        entity_id,
        duration_ms,
        summary,
        metadata,
        redacted,
        release_sha,
        image_digest
      )
      VALUES (
        ${input.source},
        ${input.category ?? null},
        ${input.type},
        ${input.severity ?? null},
        ${input.status ?? null},
        ${input.traceId ?? null},
        ${input.runId ?? null},
        ${input.entityId ?? null},
        ${input.durationMs ?? null},
        ${input.summary},
        ${input.metadata ? sql.json(input.metadata) : null},
        true,
        ${input.releaseSha ?? null},
        ${input.imageDigest ?? null}
      )
      RETURNING id::text AS id
    `;
    const eventId = rows[0]?.id ?? '';
    if (!eventId) {
      return { ok: false, error: 'SERVICE_EVENT_INSERT_FAILED: no row returned' };
    }
    return { ok: true, eventId, redacted: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
