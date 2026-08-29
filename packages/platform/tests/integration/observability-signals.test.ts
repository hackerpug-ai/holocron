/**
 * OBS-03-SIGNALS — durable redacted first-party signals + observability-aware health.
 *
 * Real Postgres only (DATABASE_URL). No mocks, no PLATFORM_IT gate (the loop gate
 * drives this suite with a live DATABASE_URL; a missing URL fails closed, never skips).
 *
 *   - AC-1: subscription-monitor advancing last_checked persists a redacted durable
 *           heartbeat (type/summary carry "last_checked") that survives a reconnect.
 *   - AC-2: the public writer persists a redacted, allowlisted-metadata event across
 *           a reconnect.
 *   - AC-3: observability-only outage → HTTP 200 "degraded"; Postgres core outage → 503.
 *   - AC-4: invalid writer input (unknown metadata key, oversized summary, secret
 *           sentinel, redacted=false) fails closed before INSERT (zero rows gained).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client.ts';
import { runHealthCheck } from '../../src/http/health.ts';
import { probeObservabilityHealth } from '../../src/observability/health.ts';
import {
  SERVICE_EVENT_MAX_SUMMARY_LENGTH,
  SERVICE_EVENT_METADATA_ALLOWLIST,
  type ServiceEventWriteInput,
  writeServiceEvent,
} from '../../src/observability/service-events.ts';
import { subscriptionMonitor } from '../../src/queue/jobs-handlers/subscription-monitor.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const DATABASE_URL = process.env.DATABASE_URL ?? '';

const MIGRATION_PATH = resolve(
  REPO_ROOT,
  'packages/platform/src/db/migrations/0040_service_events_observability_state.sql'
);
const MIGRATION_SQL = readFileSync(MIGRATION_PATH, 'utf8');

const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/OBS-03-SIGNALS');
const ALLOWLIST_SET = new Set<string>(SERVICE_EVENT_METADATA_ALLOWLIST);

function requireDatabaseUrl(): void {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required for OBS-03-SIGNALS — refusing skip-to-green');
  }
}

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    resolve(EVIDENCE_DIR, name),
    typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`,
    'utf8'
  );
}

async function withSql<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = createSql(DATABASE_URL);
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Apply the OBS-03 migration directly (idempotent; mirrors the migrate runner). */
async function applyServiceEventsMigration(): Promise<void> {
  await withSql(async (sql) => {
    await sql.unsafe(MIGRATION_SQL);
  });
}

async function truncateServiceEvents(): Promise<void> {
  await withSql(async (sql) => {
    await sql.unsafe('TRUNCATE TABLE service_events');
  });
}

async function countServiceEvents(): Promise<number> {
  return withSql(async (sql) => {
    const rows = await sql<{ count: string }[]>`SELECT count(*)::text AS count FROM service_events`;
    return Number(rows[0]?.count ?? 0);
  });
}

describe('OBS-03-SIGNALS observability signals', () => {
  beforeAll(async () => {
    requireDatabaseUrl();
    await applyServiceEventsMigration();
  }, 60_000);

  beforeEach(async () => {
    await truncateServiceEvents();
  });

  afterAll(async () => {
    await truncateServiceEvents();
  });

  it('OBS-03-SIGNALS-AC-1: subscription-monitor advancing last_checked persists a redacted durable heartbeat', async () => {
    const seedIdentifier = `obs03-ac1-${Date.now()}`;
    const sourceId = await withSql(async (sql) => {
      const rows = await sql<{ id: string }[]>`
        INSERT INTO subscription_sources (source_type, identifier, name, url)
        VALUES ('rss', ${seedIdentifier}, 'OBS-03 AC-1 source', 'https://example.com/feed.xml')
        RETURNING id::text AS id
      `;
      return rows[0]?.id ?? '';
    });
    expect(sourceId).toBeTruthy();

    try {
      const result = await subscriptionMonitor({ databaseUrl: DATABASE_URL, now: new Date() });
      expect(result.ok).toBe(true);

      const lastCheckedAdvanceCount = await withSql(async (sql) => {
        const rows = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count
          FROM subscription_sources
          WHERE id = ${sourceId}::uuid AND last_checked IS NOT NULL
        `;
        return Number(rows[0]?.count ?? 0);
      });
      const expectedLastCheckedAdvanceCount = 1;
      expect(lastCheckedAdvanceCount).toBe(expectedLastCheckedAdvanceCount);

      const heartbeatEvents = await withSql(async (sql) => {
        return await sql<{ id: string; type: string; summary: string; redacted: boolean }[]>`
          SELECT id::text AS id, type, summary, redacted
          FROM service_events
          WHERE source = 'observability'
            AND (type LIKE '%last_checked%' OR summary LIKE '%last_checked%')
          ORDER BY occurred_at DESC
        `;
      });
      const persistedHeartbeatEventCount = heartbeatEvents.length;
      expect(persistedHeartbeatEventCount).toBeGreaterThanOrEqual(1);
      expect(heartbeatEvents.every((e) => e.redacted === true)).toBe(true);
      expect(
        heartbeatEvents.every(
          (e) => e.type.includes('last_checked') || e.summary.includes('last_checked')
        ),
        'heartbeat type or summary must contain the literal last_checked'
      ).toBe(true);

      // The reported heartbeat id must resolve to a real persisted row (not fabricated).
      const reportedEventId = String(result.detail.heartbeat_event_id ?? '');
      expect(reportedEventId.length).toBeGreaterThanOrEqual(36);
      const reportedRowCount = await withSql(async (sql) => {
        const rows = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count FROM service_events WHERE id = ${reportedEventId}::uuid
        `;
        return Number(rows[0]?.count ?? 0);
      });
      expect(reportedRowCount).toBe(1);

      // Durability: a fresh connection (reconnect) still returns the same heartbeat rows.
      const reconnectCount = await withSql(async (sql) => {
        const rows = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count
          FROM service_events
          WHERE source = 'observability'
            AND (type LIKE '%last_checked%' OR summary LIKE '%last_checked%')
        `;
        return Number(rows[0]?.count ?? 0);
      });
      const reconnectMismatchCount = Math.abs(reconnectCount - persistedHeartbeatEventCount);
      expect(reconnectMismatchCount).toBe(0);

      // No fabricated events: the ledger contains exactly the real heartbeats.
      const totalEvents = await countServiceEvents();
      const fabricatedEventCount = totalEvents - persistedHeartbeatEventCount;
      expect(fabricatedEventCount).toBe(0);

      writeEvidence('ac1-signals.json', {
        expectedLastCheckedAdvanceCount,
        lastCheckedAdvanceCount,
        persistedHeartbeatEventCount,
        reconnectCount,
        reconnectMismatchCount,
        fabricatedEventCount,
        redacted: heartbeatEvents.every((e) => e.redacted === true),
      });
    } finally {
      await withSql(async (sql) => {
        await sql`DELETE FROM subscription_sources WHERE id = ${sourceId}::uuid`;
      });
    }
  }, 60_000);

  it('OBS-03-SIGNALS-AC-2: writer persists a redacted allowlisted event across reconnect', async () => {
    const write = await writeServiceEvent(
      {
        source: 'health',
        category: 'probe',
        type: 'health.observability.storage',
        severity: 'info',
        status: 'ok',
        summary: 'observability storage reachable',
        metadata: { service_name: 'holocron-platform', ready: true, latency_ms: 1 },
        redacted: true,
      },
      { databaseUrl: DATABASE_URL }
    );
    expect(write.ok).toBe(true);
    if (!write.ok) return;

    const expectedPersistedEventCount = 1;

    // Reconnect (fresh connection) and match the event by its id.
    const reconnectMatchCount = await withSql(async (sql) => {
      const rows = await sql<{ id: string }[]>`
        SELECT id::text AS id FROM service_events WHERE id = ${write.eventId}::uuid
      `;
      return rows.length;
    });
    expect(reconnectMatchCount).toBe(expectedPersistedEventCount);

    const persisted = await withSql(async (sql) => {
      return await sql<{ redacted: boolean; metadata: unknown; summary: string }[]>`
        SELECT redacted, metadata, summary FROM service_events WHERE id = ${write.eventId}::uuid
      `;
    });
    expect(persisted.length).toBe(1);
    const persistedRow = persisted[0];
    expect(persistedRow).toBeTruthy();
    expect(persistedRow?.redacted).toBe(true);

    const metadata = (persistedRow?.metadata ?? null) as Record<string, unknown> | null;
    const metadataKeys = metadata ? Object.keys(metadata) : [];
    const unknownMetadataKeyCount = metadataKeys.filter((k) => !ALLOWLIST_SET.has(k)).length;
    expect(unknownMetadataKeyCount).toBe(0);

    const rawPromptContentCount = metadataKeys.filter((k) =>
      /prompt|output|query|message|body|content|text/i.test(k)
    ).length;
    expect(rawPromptContentCount).toBe(0);

    writeEvidence('ac2-writer.json', {
      expectedPersistedEventCount,
      reconnectMatchCount,
      redacted: persistedRow?.redacted,
      unknownMetadataKeyCount,
      rawPromptContentCount,
      metadataKeys,
    });
  }, 60_000);

  it('OBS-03-SIGNALS-AC-3: observability-only failure is 200 degraded; postgres core outage is 503', async () => {
    // Observability-only down: real DATABASE_URL Postgres is up (storage reachable),
    // but the external export (Langfuse/Collector) is unavailable in this environment.
    const observability = await probeObservabilityHealth(DATABASE_URL);
    expect(observability.storageReady).toBe(true);
    expect(observability.exportReady).toBe(false);
    expect(observability.ready).toBe(false);

    const health = await runHealthCheck({ databaseUrl: DATABASE_URL });
    const observabilityHttpStatus = health.statusCode;
    const observabilityBodyStatus = health.body.status;
    expect(observabilityHttpStatus).toBe(200);
    expect(observabilityBodyStatus).toBe('degraded');
    expect(health.body.observability.ready).toBe(false);

    // Separate Postgres core outage → HTTP 503 (core dependency gates the status code).
    const outage = await runHealthCheck({
      databaseUrl: 'postgres://127.0.0.1:1/holocron_nonprod',
    });
    const coreOutageHttpStatus = outage.statusCode;
    expect(coreOutageHttpStatus).toBe(503);

    writeEvidence('ac3-health.json', {
      observabilityHttpStatus,
      observabilityBodyStatus,
      coreOutageHttpStatus,
      storageReady: observability.storageReady,
      exportState: observability.exportState,
    });
  }, 60_000);

  it('OBS-03-SIGNALS-AC-4: invalid writer input fails closed with zero inserts', async () => {
    const before = await countServiceEvents();

    const invalidPayloads: ServiceEventWriteInput[] = [
      // unknown metadata key
      {
        source: 'health',
        type: 'health.test',
        summary: 'valid summary',
        metadata: { prompt: 'raw prompt content' },
        redacted: true,
      },
      // oversized summary
      {
        source: 'health',
        type: 'health.test',
        summary: 'a'.repeat(SERVICE_EVENT_MAX_SUMMARY_LENGTH + 1),
        redacted: true,
      },
      // secret sentinel
      {
        source: 'health',
        type: 'health.test',
        summary: 'contains OBS03-SECRET-SENTINEL-abc here',
        redacted: true,
      },
      // redacted=false
      { source: 'health', type: 'health.test', summary: 'valid summary', redacted: false },
    ];

    let rejectedAttemptCount = 0;
    let acceptedInvalidCount = 0;
    for (const payload of invalidPayloads) {
      const result = await writeServiceEvent(payload, { databaseUrl: DATABASE_URL });
      if (result.ok) {
        acceptedInvalidCount += 1;
      } else {
        rejectedAttemptCount += 1;
      }
    }

    expect(rejectedAttemptCount).toBe(4);
    expect(acceptedInvalidCount).toBe(0);

    const after = await countServiceEvents();
    const insertedDeltaCount = after - before;
    expect(insertedDeltaCount).toBe(0);

    writeEvidence('ac4-rejections.json', {
      rejectedAttemptCount,
      acceptedInvalidCount,
      insertedDeltaCount,
    });
  }, 60_000);

  it('OBS-03-SIGNALS-AC-4-redaction: sensitive-assignment and bearer-token paths are order-independent', async () => {
    // Regression for the stateful-global-regex bug: SENSITIVE_ASSIGN_RE and
    // BEARER_TOKEN_RE previously carried the /g flag, so RegExp.prototype.test()
    // advanced lastIndex across calls and the SAME secret could be ACCEPTED
    // depending on prior call order. This sequence interleaves matching and
    // non-matching strings so a stale lastIndex would surface as an acceptance.
    const sensitiveAssignments: string[] = [
      'has secret=abc token',
      'api_key=zzz here',
      'password=x now',
      'token=y here',
      'Authorization: Bearer deadbeef',
    ];
    const bearerTokens: string[] = ['Bearer abc123def', 'Bearer deadbeef1234'];

    let sensitiveAccepted = 0;
    for (const summary of sensitiveAssignments) {
      const r = await writeServiceEvent(
        { source: 'health', type: 'health.test', summary, redacted: true },
        { databaseUrl: DATABASE_URL }
      );
      if (r.ok) sensitiveAccepted += 1;
    }
    let bearerAccepted = 0;
    for (const summary of bearerTokens) {
      const r = await writeServiceEvent(
        { source: 'health', type: 'health.test', summary, redacted: true },
        { databaseUrl: DATABASE_URL }
      );
      if (r.ok) bearerAccepted += 1;
    }

    // Metadata VALUES carrying a secret must be rejected too. validateServiceEventInput
    // recursively scans allowlisted-key values (containsSecretSentinel(input.metadata)),
    // but the AC-4 suite only exercised the summary path — leaving this redaction branch
    // unproven. Drive a secret inside an allowlisted key's value to prove it also fails
    // closed (order-independent, no stale-lastIndex acceptance).
    const secretMetadataPayloads: Array<{ key: string; value: string }> = [
      { key: 'job_name', value: 'Bearer abc123def' },
      { key: 'category', value: 'password=supersecret' },
      { key: 'service_name', value: 'api_key=deadbeef' },
      { key: 'endpoint', value: 'token=zzz' },
    ];
    let metadataSecretAccepted = 0;
    for (const { key, value } of secretMetadataPayloads) {
      const r = await writeServiceEvent(
        {
          source: 'health',
          type: 'health.test',
          summary: 'valid summary',
          metadata: { [key]: value },
          redacted: true,
        },
        { databaseUrl: DATABASE_URL }
      );
      if (r.ok) metadataSecretAccepted += 1;
    }

    expect(sensitiveAccepted).toBe(0);
    expect(bearerAccepted).toBe(0);
    expect(metadataSecretAccepted).toBe(0);

    // No row may have been inserted by any of the sensitive/bearer/metadata payloads.
    const totalEvents = await countServiceEvents();
    expect(totalEvents).toBe(0);

    writeEvidence('ac4-redaction-order-independence.json', {
      sensitiveAccepted,
      bearerAccepted,
      metadataSecretAccepted,
      sensitiveAssignments,
      bearerTokens,
      secretMetadataPayloads,
      totalEvents,
    });
  }, 60_000);
});
