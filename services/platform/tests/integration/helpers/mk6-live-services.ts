/**
 * MK6-DEP-001 live dependency probes.
 *
 * This module intentionally has no test doubles. Every probe below performs a
 * real network or Postgres operation against the endpoints supplied by the
 * disposable verification stack (and the configured inference fleet).
 * Credentials are read from the environment and are never included in a
 * result, error, or command-line argument.
 */
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { readConversationViaZero } from './zero-oneshot.ts';

export const MK6_SENTINEL = 'mk6-dep-sentinel-1';

export type LiveServiceConfig = {
  databaseUrl: string;
  mastraUrl: string;
  zeroUrl: string;
  fleetUrl: string;
  fleetKey?: string;
  rnKey: string;
  timeoutMs: number;
};

export type DependencyName = 'postgres' | 'fleet' | 'mastra' | 'scheduler' | 'zero';

export type ProbeResult = {
  ready: boolean;
  dependency?: DependencyName;
  error?: string;
  [key: string]: unknown;
};

function nonEmpty(name: string, fallback = ''): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function timeoutFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name] ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 300_000) : fallback;
}

/** Remove credential-bearing URL/userinfo and known secret values from errors. */
export function redact(value: unknown): string {
  let message = value instanceof Error ? value.message : String(value);
  message = message.replace(/(postgres(?:ql)?:\/\/)[^\s/@]+@/gi, '$1[REDACTED]@');
  for (const secret of [
    process.env.FLEET_KEY,
    process.env.MK6_DATABASE_PASSWORD,
    process.env.MK6_DATABASE_URL_CONTAINER,
    process.env.MK6_ZERO_ADMIN_PASSWORD,
    process.env.MK6_RN_KEY,
    process.env.MK6_MCP_KEY,
    process.env.MK6_CONTROL_KEY,
    process.env.MASTRA_API_KEY,
  ]) {
    if (secret) message = message.split(secret).join('[REDACTED]');
  }
  return message.slice(0, 500);
}

function origin(raw: string): string {
  const parsed = new URL(raw);
  return parsed.origin;
}

function fleetOrigin(raw: string): string {
  const parsed = new URL(raw);
  return parsed.origin;
}

function headers(key?: string): Record<string, string> {
  return {
    accept: 'application/json',
    ...(key ? { authorization: `Bearer ${key}` } : {}),
  };
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.text();
  let parsed: unknown = body;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    // Keep the status as the authoritative failure; do not manufacture JSON.
  }
  if (!response.ok)
    throw new Error(`${url.replace(/\/v1\/.*/, '/v1/[redacted]')} HTTP ${response.status}`);
  return parsed;
}

export function configFromEnvironment(): LiveServiceConfig {
  const databaseUrl = nonEmpty('MK6_DATABASE_URL');
  const mastraUrl = nonEmpty('MK6_MASTRA_URL');
  const zeroUrl = nonEmpty('MK6_ZERO_URL');
  const fleetUrl = nonEmpty('FLEET_URL', 'http://127.0.0.1:4545');
  const rnKey = nonEmpty('MK6_RN_KEY');
  if (!databaseUrl || !mastraUrl || !zeroUrl || !rnKey) {
    throw new Error(
      'MK6 live probe requires MK6_DATABASE_URL, MK6_MASTRA_URL, MK6_ZERO_URL, and MK6_RN_KEY'
    );
  }
  return {
    databaseUrl,
    mastraUrl: origin(mastraUrl),
    zeroUrl: origin(zeroUrl),
    fleetUrl: fleetOrigin(fleetUrl),
    fleetKey: process.env.FLEET_KEY?.trim() || undefined,
    rnKey,
    timeoutMs: timeoutFromEnv('MK6_LIVE_TIMEOUT_MS', 120_000),
  };
}

export async function probePostgresWriteRead(
  databaseUrl: string,
  conversationId: string,
  sentinel = MK6_SENTINEL
): Promise<ProbeResult> {
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 2,
    prepare: false,
    onnotice: () => {},
  });
  try {
    await sql`SELECT 1 AS connected`;
    await sql`
      INSERT INTO conversations (id, title, last_message_preview)
      VALUES (${conversationId}::uuid, ${sentinel}, ${sentinel})
    `;
    const rows = await sql<{ title: string | null }[]>`
      SELECT title FROM conversations WHERE id = ${conversationId}::uuid
    `;
    if (rows[0]?.title !== sentinel) throw new Error('Postgres write/read sentinel mismatch');
    return { ready: true, dependency: 'postgres', databaseTarget: 'isolated', writeRead: true };
  } catch (error) {
    return { ready: false, dependency: 'postgres', error: redact(error) };
  } finally {
    await sql.end({ timeout: 3 }).catch(() => {});
  }
}

export async function probeMastraIdentity(
  mastraUrl: string,
  timeoutMs: number
): Promise<ProbeResult> {
  try {
    const body = (await fetchJson(
      `${origin(mastraUrl)}/health`,
      { headers: headers() },
      timeoutMs
    )) as {
      status?: unknown;
      deployment?: { ready?: unknown; identity?: Record<string, unknown> | null };
    };
    const identity = body.deployment?.identity;
    const identityFields = ['imageDigest', 'sourceRevision', 'composeGeneration', 'runtime'];
    if (
      body.status !== 'ok' ||
      body.deployment?.ready !== true ||
      !identity ||
      identityFields.some((field) => typeof identity[field] !== 'string' || identity[field] === '')
    ) {
      throw new Error('Mastra health did not return an observed ready release identity');
    }
    return { ready: true, dependency: 'mastra', releaseIdentity: identity };
  } catch (error) {
    return { ready: false, dependency: 'mastra', error: redact(error) };
  }
}

export async function probeFleetCompletion(
  fleetUrl: string,
  fleetKey: string | undefined,
  timeoutMs: number,
  sentinel = MK6_SENTINEL
): Promise<ProbeResult> {
  try {
    const base = fleetOrigin(fleetUrl);
    const models = (await fetchJson(
      `${base}/v1/models`,
      { headers: headers(fleetKey) },
      Math.min(timeoutMs, 10_000)
    )) as {
      data?: Array<{ id?: unknown }>;
    };
    const available = (models.data ?? [])
      .map((entry) => (typeof entry.id === 'string' ? entry.id : ''))
      .filter(Boolean);
    if (available.length === 0) throw new Error('fleet /v1/models returned no model identities');
    const requested = process.env.MK6_FLEET_MODEL?.trim() || 'implementer';
    const model = available.includes(requested) ? requested : available[0];
    const body = (await fetchJson(
      `${base}/v1/chat/completions`,
      {
        method: 'POST',
        headers: { ...headers(fleetKey), 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'Return one concise sentence. Do not call tools.' },
            { role: 'user', content: `Complete the live verification prompt: ${sentinel}` },
          ],
          max_tokens: 48,
          temperature: 0,
        }),
      },
      timeoutMs
    )) as {
      id?: unknown;
      model?: unknown;
      choices?: Array<{ message?: { content?: unknown }; text?: unknown }>;
    };
    const first = body.choices?.[0];
    const content =
      typeof first?.message?.content === 'string'
        ? first.message.content
        : typeof first?.text === 'string'
          ? first.text
          : '';
    if (!content.trim()) throw new Error('fleet completion returned empty content');
    return {
      ready: true,
      dependency: 'fleet',
      fleetCompletionCount: 1,
      model: typeof body.model === 'string' ? body.model : model,
      completionId: typeof body.id === 'string' && body.id ? body.id : 'observed-without-id',
      completionTextLength: content.trim().length,
    };
  } catch (error) {
    return { ready: false, dependency: 'fleet', error: redact(error) };
  }
}

async function readChatRun(
  config: LiveServiceConfig,
  runId: string,
  timeoutMs: number
): Promise<{ status?: string; finalText?: string; error?: string }> {
  const body = (await fetchJson(
    `${config.mastraUrl}/api/chat-runs/${encodeURIComponent(runId)}`,
    { headers: { ...headers(config.rnKey) } },
    timeoutMs
  )) as { status?: unknown; finalText?: unknown; error?: unknown };
  return {
    status: typeof body.status === 'string' ? body.status : undefined,
    finalText: typeof body.finalText === 'string' ? body.finalText : undefined,
    error: typeof body.error === 'string' ? body.error : undefined,
  };
}

export async function submitMastraSentinel(
  config: LiveServiceConfig,
  conversationId: string,
  sentinel = MK6_SENTINEL
): Promise<ProbeResult> {
  try {
    const response = await fetch(`${config.mastraUrl}/api/chat-runs`, {
      method: 'POST',
      headers: {
        ...headers(config.rnKey),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        requestId: `${sentinel}-${randomUUID()}`,
        msg: sentinel,
        conversationId,
        maxSteps: 2,
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    const body = (await response.json()) as { runId?: unknown; status?: unknown; error?: unknown };
    if (!response.ok || typeof body.runId !== 'string') {
      throw new Error(`Mastra chat sentinel rejected HTTP ${response.status}`);
    }
    const deadline = Date.now() + config.timeoutMs;
    let last: { status?: string; finalText?: string; error?: string } = {};
    while (Date.now() < deadline) {
      last = await readChatRun(config, body.runId, Math.min(config.timeoutMs, 10_000));
      if (last.status === 'completed') {
        if (!last.finalText?.trim())
          throw new Error('Mastra chat sentinel completed with empty text');
        return {
          ready: true,
          dependency: 'mastra',
          runId: body.runId,
          chatCompletion: 'completed',
          responseTextLength: last.finalText.trim().length,
        };
      }
      if (last.status === 'failed' || last.status === 'blocked') {
        throw new Error(`Mastra chat sentinel ${last.status}: ${last.error ?? 'no error detail'}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Mastra chat sentinel timed out (last status ${last.status ?? 'unknown'})`);
  } catch (error) {
    return { ready: false, dependency: 'mastra', error: redact(error) };
  }
}

export async function countSentinelRows(
  databaseUrl: string,
  conversationId: string,
  sentinel = MK6_SENTINEL
): Promise<ProbeResult> {
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    prepare: false,
    onnotice: () => {},
  });
  try {
    const rows = await sql<{ sentinel_count: number; agent_count: number }[]>`
      SELECT
        count(*) FILTER (WHERE role = 'user' AND content = ${sentinel})::int AS sentinel_count,
        count(*) FILTER (WHERE role = 'agent' AND content IS NOT NULL AND btrim(content) <> '')::int AS agent_count
      FROM chat_messages
      WHERE conversation_id = ${conversationId}
    `;
    const row = rows[0];
    if (!row || Number(row.sentinel_count) !== 1 || Number(row.agent_count) < 1) {
      throw new Error(
        `cross-service sentinel rows invalid (sentinel=${row?.sentinel_count ?? 0}, agent=${row?.agent_count ?? 0})`
      );
    }
    return {
      ready: true,
      dependency: 'postgres',
      sentinelCount: 1,
      agentRowCount: Number(row.agent_count),
    };
  } catch (error) {
    return { ready: false, dependency: 'postgres', error: redact(error) };
  } finally {
    await sql.end({ timeout: 3 }).catch(() => {});
  }
}

async function queueMeta(
  databaseUrl: string
): Promise<{ ready: boolean; updatedAt: string | null }> {
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    prepare: false,
    onnotice: () => {},
  });
  try {
    const rows = await sql<{ ready: boolean; updated_at: string | Date | null }[]>`
      SELECT ready, updated_at FROM queue_backend_meta WHERE id = 1
    `;
    const row = rows[0];
    return {
      ready: Boolean(row?.ready),
      updatedAt:
        row?.updated_at instanceof Date ? row.updated_at.toISOString() : (row?.updated_at ?? null),
    };
  } finally {
    await sql.end({ timeout: 3 }).catch(() => {});
  }
}

export async function probeSchedulerHeartbeat(
  databaseUrl: string,
  timeoutMs = timeoutFromEnv('MK6_SCHEDULER_HEARTBEAT_TIMEOUT_MS', 75_000)
): Promise<ProbeResult> {
  try {
    const before = await queueMeta(databaseUrl);
    if (!before.ready || !before.updatedAt)
      throw new Error('scheduler queue heartbeat is not ready');
    const beforeMs = Date.parse(before.updatedAt);
    const deadline = Date.now() + timeoutMs;
    let after = before;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      after = await queueMeta(databaseUrl);
      const afterMs = after.updatedAt ? Date.parse(after.updatedAt) : Number.NaN;
      if (after.ready && Number.isFinite(afterMs) && afterMs > beforeMs) {
        return {
          ready: true,
          dependency: 'scheduler',
          heartbeatAdvanced: true,
          heartbeatBefore: before.updatedAt,
          heartbeatAfter: after.updatedAt,
        };
      }
    }
    throw new Error('scheduler queue heartbeat did not advance');
  } catch (error) {
    return { ready: false, dependency: 'scheduler', error: redact(error) };
  }
}

export async function probeZeroReplication(
  zeroUrl: string,
  conversationId: string,
  timeoutMs: number
): Promise<ProbeResult> {
  try {
    const keepalive = await fetch(`${origin(zeroUrl)}/keepalive`, {
      signal: AbortSignal.timeout(Math.min(timeoutMs, 10_000)),
    });
    if (!keepalive.ok) throw new Error(`Zero keepalive HTTP ${keepalive.status}`);
    const read = await readConversationViaZero({
      server: origin(zeroUrl),
      conversationId,
      userId: `mk6-${randomUUID()}`,
      timeoutMs,
    });
    if (!read.ok || !read.conversationPresent || read.rowCount < 1 || !read.agentPresent) {
      throw new Error(
        `Zero replication incomplete (rows=${read.rowCount}, agent=${read.agentPresent})`
      );
    }
    return {
      ready: true,
      dependency: 'zero',
      zeroReplicated: true,
      zeroRowCount: read.rowCount,
      zeroAgentContentLength: read.agentContentLen,
    };
  } catch (error) {
    return { ready: false, dependency: 'zero', error: redact(error) };
  }
}

export async function verifyLiveStack(
  config = configFromEnvironment(),
  sentinel = MK6_SENTINEL
): Promise<ProbeResult> {
  const conversationId = randomUUID();
  const postgresResult = await probePostgresWriteRead(config.databaseUrl, conversationId, sentinel);
  if (!postgresResult.ready) return postgresResult;
  const mastraResult = await probeMastraIdentity(config.mastraUrl, config.timeoutMs);
  if (!mastraResult.ready) return mastraResult;
  const fleetResult = await probeFleetCompletion(
    config.fleetUrl,
    config.fleetKey,
    config.timeoutMs,
    sentinel
  );
  if (!fleetResult.ready) return fleetResult;
  const chatResult = await submitMastraSentinel(config, conversationId, sentinel);
  if (!chatResult.ready) return chatResult;
  const sentinelResult = await countSentinelRows(config.databaseUrl, conversationId, sentinel);
  if (!sentinelResult.ready) return sentinelResult;
  const schedulerResult = await probeSchedulerHeartbeat(config.databaseUrl);
  if (!schedulerResult.ready) return schedulerResult;
  const zeroResult = await probeZeroReplication(config.zeroUrl, conversationId, config.timeoutMs);
  if (!zeroResult.ready) return zeroResult;
  return {
    ready: true,
    namespace: 'isolated',
    conversationId,
    sentinel,
    sentinelCount: 1,
    fleetCompletionCount: 1,
    releaseIdentity: mastraResult.releaseIdentity,
    postgres: postgresResult,
    mastra: { ...mastraResult, ...chatResult },
    fleet: fleetResult,
    scheduler: schedulerResult,
    zero: zeroResult,
  };
}

export async function probeNegative(
  dependency: DependencyName,
  config = configFromEnvironment()
): Promise<ProbeResult> {
  const deadPort = String(49_000 + Math.floor(Math.random() * 500));
  if (dependency === 'postgres') {
    return (await probePostgresWriteRead(
      `postgres://127.0.0.1:${deadPort}/missing`,
      randomUUID()
    )) as ProbeResult;
  }
  if (dependency === 'fleet') {
    return await probeFleetCompletion(`http://127.0.0.1:${deadPort}`, undefined, 3_000);
  }
  if (dependency === 'mastra') {
    return await probeMastraIdentity(`http://127.0.0.1:${deadPort}`, 3_000);
  }
  if (dependency === 'zero') {
    return await probeZeroReplication(`http://127.0.0.1:${deadPort}`, randomUUID(), 3_000);
  }
  return await probeSchedulerHeartbeat(
    config.databaseUrl,
    timeoutFromEnv('MK6_SCHEDULER_NEGATIVE_TIMEOUT_MS', 5_000)
  );
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  try {
    const result =
      mode === '--negative'
        ? await probeNegative(nonEmpty('MK6_NEGATIVE_DEPENDENCY') as DependencyName)
        : await verifyLiveStack();
    console.log(JSON.stringify(result));
    process.exit(result.ready ? 0 : 1);
  } catch (error) {
    console.log(JSON.stringify({ ready: false, error: redact(error) }));
    process.exit(1);
  }
}

const invokedAsCli = process.argv[1]?.endsWith('/mk6-live-services.ts') === true;
if (invokedAsCli) void main();
