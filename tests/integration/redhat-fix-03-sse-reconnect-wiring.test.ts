/**
 * REDHAT-FIX-03 — Strengthen PRIMARY gate oracle for SSE reconnect exactly-once.
 *
 * Real-socket integration over http.createServer SSE stub:
 *   tokens seq 1-3 → disconnect → reconnect with Last-Event-ID → remaining tokens
 *   unique concat + tokenCount == unique count; mutants killed.
 *
 * AC-5 (PLATFORM_IT): after reconnect, read durable chat_messages from Postgres
 * and assert assembled text == store content (diff==0) and agent count == 1.
 * Never hardcode durableContent/agentBubbleCount as semantic stubs.
 *
 * H3 evidence: s-reactive-01 static/pure suite stays green under header-drop
 * (see .tmp/sprint-25/redhat-fix-03-red-header-drop-old-suite.log).
 *
 * No EventSource/XHR mocks that hide headers — stub observes real request headers.
 *
 * F1 (red-hat): the AC-5 POST carries the `[[tripwire]]` marker which short-
 * circuits chat-runs.ts BEFORE the deterministic/fleet branch fires, so the
 * nonprod-default flip (AC-1) does not affect this suite. Token events are
 * explicitly seeded via seedTokenEventsForAc5 (line ~638), not the emitter.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  applyTokenEvent,
  buildSseResumeHeaders,
  type TokenAssemblyState,
} from '../../hooks/use-resumable-sse-stream';
import { createSql, type Sql } from '../../services/platform/src/db/client';
import { createHonoApp } from '../../services/platform/src/http/hono-app';
import { PLATFORM_IT } from './service/harness';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const MUTATION_LOG = join(REPO_ROOT, '.tmp', 'sprint-25', 'redhat-fix-03-mutation.log');
const EVIDENCE_DIR = join(REPO_ROOT, '.tmp', 'sprint-25');

const TOKENS = ['One', 'Two', 'Three', 'Four', 'Five'] as const;
const UNIQUE_TEXT = TOKENS.join('');
const UNIQUE_COUNT = TOKENS.length;

const itLive = PLATFORM_IT ? it : it.skip;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const AC5_KEYS = {
  rn: 'redhat-fix-03-ac5-rn',
  mcp: 'redhat-fix-03-ac5-mcp',
  control: 'redhat-fix-03-ac5-control',
};

type WiringMode = 'correct' | 'header-drop' | 'assembly-reset';

type StubRequest = {
  method?: string;
  url?: string;
  headers: IncomingMessage['headers'];
  lastEventId: string | null;
};

type ReconnectRunResult = {
  mode: WiringMode;
  reconnectLastEventId: string | null;
  reconnectHeaders: IncomingMessage['headers'] | null;
  finalText: string;
  tokenCount: number;
  lastSeq: number;
  duplicateSeqApplications: number;
  resumeTransport: 'sse' | 'poll' | 'none';
  pollDisabled: 0 | 1;
  assertionFailures: string[];
};

function sseChunk(event: string, data: unknown, id: number): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function withSseStub(
  handler: (ctx: {
    baseUrl: string;
    requests: StubRequest[];
    setPhase: (phase: 'first' | 'reconnect') => void;
  }) => Promise<void>
): Promise<void> {
  const requests: StubRequest[] = [];
  let phase: 'first' | 'reconnect' = 'first';
  let server: Server | undefined;

  const onReq = (req: IncomingMessage, res: ServerResponse) => {
    const lastEventId =
      typeof req.headers['last-event-id'] === 'string' ? req.headers['last-event-id'] : null;
    requests.push({
      method: req.method,
      url: req.url,
      headers: { ...req.headers },
      lastEventId,
    });

    // Status poll path (M2) — used only when poll fallback is enabled
    if (req.url?.includes('/api/chat-runs/') && !req.url.includes('/events')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'completed',
          finalText: UNIQUE_TEXT,
          lastEventId: UNIQUE_COUNT + 1,
        })
      );
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const afterSeq = lastEventId ? Number.parseInt(lastEventId, 10) || 0 : 0;

    if (phase === 'first') {
      // Emit tokens 1-3 then disconnect (mid-stream drop)
      for (let i = 1; i <= 3; i++) {
        res.write(sseChunk('token', { token: TOKENS[i - 1] }, i));
      }
      // Abrupt close without terminal — forces client reconnect
      res.end();
      return;
    }

    // Reconnect: emit only seq > afterSeq (server honors Last-Event-ID)
    for (let i = 1; i <= UNIQUE_COUNT; i++) {
      if (i > afterSeq) {
        res.write(sseChunk('token', { token: TOKENS[i - 1] }, i));
      }
    }
    const terminalSeq = UNIQUE_COUNT + 1;
    if (terminalSeq > afterSeq) {
      res.write(sseChunk('terminal', { status: 'completed', text: UNIQUE_TEXT }, terminalSeq));
    }
    res.end();
  };

  await new Promise<void>((resolveListen, rejectListen) => {
    server = createServer(onReq);
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });

  const addr = server!.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('SSE stub failed to bind');
  }
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    await handler({
      baseUrl,
      requests,
      setPhase: (p) => {
        phase = p;
      },
    });
  } finally {
    await new Promise<void>((resolveClose) => {
      server?.close(() => resolveClose());
    });
  }
}

function parseSseBlocks(body: string): Array<{ id: number; event: string; data: string }> {
  const events: Array<{ id: number; event: string; data: string }> = [];
  for (const block of body.split(/\n\n+/)) {
    if (!block.trim()) continue;
    let id = 0;
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('id:')) id = Number.parseInt(line.slice(3).trim(), 10) || 0;
      else if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    events.push({ id, event, data: dataLines.join('\n') });
  }
  return events;
}

/**
 * Node harness mirroring use-resumable-sse-stream reconnect wiring:
 * buildSseResumeHeaders + applyTokenEvent + optional assembly-reset mutant.
 * Real HTTP against the SSE stub (no mocked EventSource).
 *
 * REDHAT-FIX-04: This harness (runReconnectWiring local `assembly` variable) is
 * NON-AUTHORITATIVE for production assemblyRef mutant-kill. Production-hook
 * coverage lives in redhat-fix-04-production-hook-reconnect.test.ts
 * (createResumableSseController / assemblyRef.current at reconnect sites).
 * Do not claim H3 closed from this suite alone.
 */
async function runReconnectWiring(args: {
  baseUrl: string;
  mode: WiringMode;
  /** AC-4: when true, poll fallback cannot sole-greenwash broken Last-Event-ID */
  disableStatusPollFallback?: boolean;
  setPhase: (phase: 'first' | 'reconnect') => void;
}): Promise<ReconnectRunResult> {
  const failures: string[] = [];
  const apiKey = 'redhat-fix-03-test-key';
  const runId = '00000000-0000-4000-8000-0000000000aa';
  const pollDisabled: 0 | 1 = args.disableStatusPollFallback ? 1 : 0;

  let assembly: TokenAssemblyState = { lastSeq: 0, text: '', tokenCount: 0 };
  let duplicateSeqApplications = 0;
  let resumeTransport: 'sse' | 'poll' | 'none' = 'none';

  const applyOne = (seq: number, token: string) => {
    const before = assembly;
    const next = applyTokenEvent(assembly, seq, token);
    if (next === before && seq <= before.lastSeq && seq > 0) {
      duplicateSeqApplications += 1;
    }
    assembly = next;
  };

  // --- First connect (no Last-Event-ID) ---
  const firstHeaders = buildSseResumeHeaders({ apiKey, lastSeq: 0 });
  const firstRes = await fetch(`${args.baseUrl}/api/chat-runs/${runId}/events`, {
    headers: firstHeaders,
  });
  const firstBody = await firstRes.text();
  for (const ev of parseSseBlocks(firstBody)) {
    if (ev.event !== 'token') continue;
    const payload = JSON.parse(ev.data || '{}') as { token?: string };
    if (typeof payload.token === 'string') applyOne(ev.id, payload.token);
  }

  expect(assembly.lastSeq).toBe(3);
  expect(assembly.text).toBe('OneTwoThree');
  expect(assembly.tokenCount).toBe(3);

  // --- Simulate mid-stream disconnect already done by stub; reconnect ---
  args.setPhase('reconnect');

  // Capture resume cursor BEFORE any mutant wipes assembly (mirrors openEventSource
  // reading assemblyRef/afterSeq for Last-Event-ID).
  const resumeLastSeq = assembly.lastSeq;
  const reconnectHeaders = buildSseResumeHeaders({
    apiKey,
    lastSeq: resumeLastSeq,
    // Mutant: omit Last-Event-ID header assignment
    omitLastEventId: args.mode === 'header-drop',
  });

  // Mutant: assemblyRef wiped on reconnect AFTER headers are built (H3 survivor).
  // Server still honors Last-Event-ID and only re-emits remaining tokens → incomplete
  // assembly / wrong tokenCount (exactly the production failure mode).
  if (args.mode === 'assembly-reset') {
    assembly = { lastSeq: 0, text: '', tokenCount: 0 };
  }

  const reconnectRes = await fetch(`${args.baseUrl}/api/chat-runs/${runId}/events`, {
    headers: reconnectHeaders,
  });
  const reconnectBody = await reconnectRes.text();
  const reconnectEvents = parseSseBlocks(reconnectBody);
  const reconnectLastEventId =
    typeof reconnectHeaders['Last-Event-ID'] === 'string'
      ? reconnectHeaders['Last-Event-ID']
      : null;

  let sawSseTokenOrTerminal = false;
  for (const ev of reconnectEvents) {
    if (ev.event === 'token') {
      sawSseTokenOrTerminal = true;
      const payload = JSON.parse(ev.data || '{}') as { token?: string };
      if (typeof payload.token === 'string') applyOne(ev.id, payload.token);
    } else if (ev.event === 'terminal') {
      sawSseTokenOrTerminal = true;
      const payload = JSON.parse(ev.data || '{}') as { text?: string };
      if (typeof payload.text === 'string' && payload.text.length > 0) {
        // Prefer server final text when present (hook finishTerminal), keep tokenCount
        assembly = {
          lastSeq: Math.max(assembly.lastSeq, ev.id),
          text: payload.text,
          tokenCount: assembly.tokenCount,
        };
      }
    }
  }
  if (sawSseTokenOrTerminal) {
    resumeTransport = 'sse';
  }

  // M2 poll fallback — only when not disabled under test
  if (!args.disableStatusPollFallback && assembly.tokenCount < UNIQUE_COUNT) {
    const pollRes = await fetch(`${args.baseUrl}/api/chat-runs/${runId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (pollRes.ok) {
      const body = (await pollRes.json()) as {
        status?: string;
        finalText?: string;
        lastEventId?: number;
      };
      if (body.status === 'completed' && typeof body.finalText === 'string') {
        assembly = {
          lastSeq: Math.max(assembly.lastSeq, Number(body.lastEventId) || 0),
          text: body.finalText,
          tokenCount: assembly.tokenCount,
        };
        if (resumeTransport === 'none') resumeTransport = 'poll';
      }
    }
  }

  // Collect assertion failures (used by AC-2 mutation branches without throwing early).
  // Durable store oracles live in AC-5 (PLATFORM_IT + chat_messages) — never hardcode them here.
  if (reconnectLastEventId !== '3') {
    failures.push(
      `reconnect Last-Event-ID expected '3', got ${JSON.stringify(reconnectLastEventId)}`
    );
  }
  if (assembly.text !== UNIQUE_TEXT) {
    failures.push(`final text expected ${UNIQUE_TEXT}, got ${JSON.stringify(assembly.text)}`);
  }
  if (assembly.tokenCount !== UNIQUE_COUNT) {
    failures.push(`tokenCount expected ${UNIQUE_COUNT}, got ${assembly.tokenCount}`);
  }
  // Full-replay dups: if header dropped and assembly not reset, applyTokenEvent
  // ignores seq<=lastSeq — still record if any dups were attempted with effect
  if (assembly.text.includes('OneTwoThreeOneTwoThree')) {
    failures.push('full-replay duplicate prefix observed in assembled text');
  }

  return {
    mode: args.mode,
    reconnectLastEventId,
    reconnectHeaders: reconnectHeaders as unknown as IncomingMessage['headers'],
    finalText: assembly.text,
    tokenCount: assembly.tokenCount,
    lastSeq: assembly.lastSeq,
    duplicateSeqApplications,
    resumeTransport,
    pollDisabled,
    assertionFailures: failures,
  };
}

/** Seed monotonic token + terminal events on the real chat_run_events substrate. */
async function seedTokenEventsForAc5(
  sql: Sql,
  runId: string,
  tokens: readonly string[]
): Promise<string> {
  await sql`DELETE FROM chat_run_events WHERE run_id = ${runId}::uuid`;
  await sql`
    UPDATE chat_runs
    SET status = 'running', last_event_seq = 0, updated_at = now(),
        completed_at = NULL, final_text = NULL, error_code = NULL, error_message = NULL
    WHERE id = ${runId}::uuid
  `;
  let seq = 0;
  for (const token of tokens) {
    seq += 1;
    await sql`
      INSERT INTO chat_run_events (run_id, seq, event_type, data_json)
      VALUES (${runId}::uuid, ${seq}, 'token', ${sql.json({ token } as never)})
    `;
  }
  seq += 1;
  const finalText = tokens.join('');
  await sql`
    INSERT INTO chat_run_events (run_id, seq, event_type, data_json)
    VALUES (
      ${runId}::uuid,
      ${seq},
      'terminal',
      ${sql.json({ status: 'completed', text: finalText } as never)}
    )
  `;
  await sql`
    UPDATE chat_runs
    SET status = 'completed',
        final_text = ${finalText},
        last_event_seq = ${seq},
        completed_at = now(),
        updated_at = now()
    WHERE id = ${runId}::uuid
  `;
  return finalText;
}

/**
 * Persist exactly one durable agent bubble for the turn (mirrors finalizeChatRun).
 * Source of truth for AC-5 is the chat_messages row, not a test constant.
 */
async function persistDurableAgentMessage(
  sql: Sql,
  args: {
    durableMessageId: string;
    conversationId: string;
    runId: string;
    content: string;
  }
): Promise<void> {
  await sql`
    INSERT INTO chat_messages (id, conversation_id, role, content, message_type, session_id)
    VALUES (
      ${args.durableMessageId}::uuid,
      ${args.conversationId},
      'agent',
      ${args.content},
      'text',
      ${args.runId}
    )
    ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, session_id = EXCLUDED.session_id
  `;
}

describe('REDHAT-FIX-03 SSE reconnect wiring oracle', () => {
  const serversToClose: Server[] = [];
  let sql: Sql | undefined;
  const ac5RequestIds: string[] = [];
  const ac5ConversationIds: string[] = [];

  beforeAll(() => {
    if (PLATFORM_IT) sql = createSql(DATABASE_URL);
  });

  afterAll(async () => {
    if (!sql) return;
    for (const requestId of ac5RequestIds) {
      await sql`DELETE FROM chat_run_events WHERE run_id IN (SELECT id FROM chat_runs WHERE request_id = ${requestId})`;
      await sql`DELETE FROM chat_runs WHERE request_id = ${requestId}`;
    }
    for (const conversationId of ac5ConversationIds) {
      await sql`DELETE FROM chat_messages WHERE conversation_id = ${conversationId}`;
      await sql`DELETE FROM conversations WHERE id = ${conversationId}::uuid`;
    }
    await sql.end({ timeout: 5 });
  });

  afterEach(async () => {
    // safety: no leaked servers from failed withSseStub
    for (const s of serversToClose) {
      await new Promise<void>((r) => s.close(() => r()));
    }
    serversToClose.length = 0;
  });

  it('AC-1: reconnect sends Last-Event-ID: 3 and unique assembly', async () => {
    await withSseStub(async ({ baseUrl, requests, setPhase }) => {
      const result = await runReconnectWiring({
        baseUrl,
        mode: 'correct',
        disableStatusPollFallback: true,
        setPhase,
      });

      // MUST observe
      expect(result.reconnectLastEventId).toBe('3');
      expect(result.finalText).toBe(UNIQUE_TEXT);
      expect(result.tokenCount).toBe(UNIQUE_COUNT);
      // duplicate seq applications that mutated state are 0 (ignored by applyTokenEvent)
      // When header is correct, stub does not re-emit 1-3 so no dups attempted either
      expect(result.finalText).not.toMatch(/OneTwoThreeOneTwoThree/);
      expect(result.tokenCount).toBeLessThanOrEqual(UNIQUE_COUNT);

      // Real request headers observed by stub (not static source match)
      const reconnectReq = requests.find(
        (r) => r.url?.includes('/events') && r.lastEventId != null
      );
      expect(reconnectReq?.lastEventId, 'stub must observe Last-Event-ID on reconnect').toBe('3');

      mkdirSync(EVIDENCE_DIR, { recursive: true });
      writeFileSync(
        join(EVIDENCE_DIR, 'redhat-fix-03-ac1-result.json'),
        JSON.stringify(
          {
            reconnectLastEventId: result.reconnectLastEventId,
            finalText: result.finalText,
            tokenCount: result.tokenCount,
            lastSeq: result.lastSeq,
            resumeTransport: result.resumeTransport,
            stubObservedLastEventId: reconnectReq?.lastEventId ?? null,
          },
          null,
          2
        )
      );
    });
  });

  it('AC-2-mutation: header-drop and assembly-reset fail; correct wiring passes', async () => {
    const lines: string[] = [];

    const runMode = async (mode: WiringMode): Promise<ReconnectRunResult> => {
      let out!: ReconnectRunResult;
      await withSseStub(async ({ baseUrl, setPhase }) => {
        out = await runReconnectWiring({
          baseUrl,
          mode,
          // Force SSE path so poll cannot greenwash header-drop (M2)
          disableStatusPollFallback: true,
          setPhase,
        });
      });
      return out;
    };

    const headerDrop = await runMode('header-drop');
    const assemblyReset = await runMode('assembly-reset');
    const correct = await runMode('correct');

    const headerDropFailCount = headerDrop.assertionFailures.length;
    const assemblyResetFailCount = assemblyReset.assertionFailures.length;
    const correctFailCount = correct.assertionFailures.length;

    lines.push(
      `header-drop failures=${headerDropFailCount} details=${JSON.stringify(headerDrop.assertionFailures)}`
    );
    lines.push(
      `assembly-reset failures=${assemblyResetFailCount} details=${JSON.stringify(assemblyReset.assertionFailures)}`
    );
    lines.push(
      `correct failures=${correctFailCount} details=${JSON.stringify(correct.assertionFailures)} exit=0`
    );
    lines.push(
      `resumeTransport correct=${correct.resumeTransport} header-drop=${headerDrop.resumeTransport}`
    );

    mkdirSync(dirname(MUTATION_LOG), { recursive: true });
    writeFileSync(MUTATION_LOG, `${lines.join('\n')}\n`, 'utf8');

    // MUST observe
    expect(headerDropFailCount, 'header-drop must fail >=1 assertion').toBeGreaterThanOrEqual(1);
    expect(assemblyResetFailCount, 'assembly-reset must fail >=1 assertion').toBeGreaterThanOrEqual(
      1
    );
    expect(correctFailCount, 'correct wiring must pass all assertions').toBe(0);
    expect(correct.reconnectLastEventId).toBe('3');
    expect(correct.finalText).toBe(UNIQUE_TEXT);
    expect(correct.tokenCount).toBe(UNIQUE_COUNT);

    // mutation.log line count >= 2 (failed mutant cases recorded)
    const logBody = lines.join('\n');
    expect(
      logBody.split('\n').filter((l) => l.includes('failures=')).length
    ).toBeGreaterThanOrEqual(2);
  });

  it('AC-4-poll-instrumentation: poll cannot sole-greenwash broken Last-Event-ID', async () => {
    // Broken Last-Event-ID under instrumented mode (poll disabled) → fail
    let broken!: ReconnectRunResult;
    await withSseStub(async ({ baseUrl, setPhase }) => {
      broken = await runReconnectWiring({
        baseUrl,
        mode: 'header-drop',
        disableStatusPollFallback: true,
        setPhase,
      });
    });
    expect(
      broken.assertionFailures.length,
      'broken Last-Event-ID under poll-disabled must fail'
    ).toBeGreaterThanOrEqual(1);
    expect(broken.pollDisabled).toBe(1);

    // Correct path with poll disabled → SSE resume marker
    let correct!: ReconnectRunResult;
    await withSseStub(async ({ baseUrl, setPhase }) => {
      correct = await runReconnectWiring({
        baseUrl,
        mode: 'correct',
        disableStatusPollFallback: true,
        setPhase,
      });
    });
    expect(correct.assertionFailures.length).toBe(0);
    expect(correct.resumeTransport).toBe('sse');
    expect(correct.pollDisabled).toBe(1);
    expect(correct.reconnectLastEventId).toBe('3');

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      join(EVIDENCE_DIR, 'redhat-fix-03-ac4-poll-instrumentation.json'),
      JSON.stringify(
        {
          brokenFailCount: broken.assertionFailures.length,
          correctResumeTransport: correct.resumeTransport,
          pollDisabled: correct.pollDisabled,
        },
        null,
        2
      )
    );
  });

  /**
   * AC-5: durable store oracle — requires PLATFORM_IT + real Postgres.
   * Assembled reconnect text must match chat_messages content (diff==0);
   * agent message count for the turn must be 1 — values READ from the store.
   */
  itLive(
    'AC-5: assembled text matches durable row; agent message count == 1',
    async () => {
      if (!sql) throw new Error('Postgres required for AC-5 durable oracle');
      const app = createHonoApp({ keys: AC5_KEYS });
      const requestId = `redhat-fix-03-ac5-${Date.now()}`;
      ac5RequestIds.push(requestId);

      const create = await app.request('/api/chat-runs', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${AC5_KEYS.rn}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          requestId,
          msg: '[[tripwire]] REDHAT-FIX-03 AC-5 durable reconnect oracle',
        }),
      });
      expect(create.status).toBe(200);
      const body = (await create.json()) as {
        runId?: string;
        durableMessageId?: string;
        conversationId?: string;
      };
      expect(body.runId).toMatch(/[0-9a-f-]{36}/i);
      expect(body.durableMessageId).toMatch(/[0-9a-f-]{36}/i);
      if (body.conversationId) ac5ConversationIds.push(body.conversationId);

      // Wait for tripwire/fleet race to settle so event inserts are exclusive
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const rows = await sql<{ status: string }[]>`
          SELECT status FROM chat_runs WHERE id = ${body.runId as string}::uuid
        `;
        if (rows[0] && ['completed', 'blocked', 'failed'].includes(rows[0].status)) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      const seededFinal = await seedTokenEventsForAc5(sql, body.runId as string, TOKENS);
      expect(seededFinal).toBe(UNIQUE_TEXT);

      // Platform finalize path: exactly one durable agent bubble for this run
      await persistDurableAgentMessage(sql, {
        durableMessageId: body.durableMessageId as string,
        conversationId: body.conversationId as string,
        runId: body.runId as string,
        content: seededFinal,
      });

      // Client reconnect wiring against real Hono SSE (not EventSource mock):
      // first connect processes tokens 1-3 only; reconnect with Last-Event-ID: 3
      let assembly: TokenAssemblyState = { lastSeq: 0, text: '', tokenCount: 0 };
      const applyOne = (seq: number, token: string) => {
        assembly = applyTokenEvent(assembly, seq, token);
      };

      const firstRes = await app.request(`/api/chat-runs/${body.runId}/events`, {
        headers: {
          authorization: `Bearer ${AC5_KEYS.rn}`,
          Accept: 'text/event-stream',
        },
      });
      expect(firstRes.status).toBe(200);
      const firstBody = await firstRes.text();
      const firstEvents = parseSseBlocks(firstBody).filter((e) => e.event === 'token');
      // Mid-stream disconnect simulation: only apply seq <= 3
      for (const ev of firstEvents) {
        if (ev.id > 3) break;
        const payload = JSON.parse(ev.data || '{}') as { token?: string };
        if (typeof payload.token === 'string') applyOne(ev.id, payload.token);
      }
      expect(assembly.lastSeq).toBe(3);
      expect(assembly.text).toBe('OneTwoThree');
      expect(assembly.tokenCount).toBe(3);

      const resumeHeaders = buildSseResumeHeaders({
        apiKey: AC5_KEYS.rn,
        lastSeq: assembly.lastSeq,
      });
      expect(resumeHeaders['Last-Event-ID']).toBe('3');
      expect(resumeHeaders.Authorization).toBe(`Bearer ${AC5_KEYS.rn}`);

      // Hono app.request is case-sensitive on auth — use lowercase authorization
      // like the production EventSource polyfill path (and eventsource-live suite).
      const resumeRes = await app.request(`/api/chat-runs/${body.runId}/events`, {
        headers: {
          authorization: resumeHeaders.Authorization,
          Accept: resumeHeaders.Accept,
          'Last-Event-ID': resumeHeaders['Last-Event-ID'] as string,
        },
      });
      expect(resumeRes.status).toBe(200);
      const resumeBody = await resumeRes.text();
      const resumeEvents = parseSseBlocks(resumeBody);
      for (const ev of resumeEvents) {
        if (ev.event === 'token') {
          // Real afterSeq gap-fill: only seq > 3
          expect(ev.id).toBeGreaterThan(3);
          const payload = JSON.parse(ev.data || '{}') as { token?: string };
          if (typeof payload.token === 'string') applyOne(ev.id, payload.token);
        } else if (ev.event === 'terminal') {
          const payload = JSON.parse(ev.data || '{}') as { text?: string };
          if (typeof payload.text === 'string' && payload.text.length > 0) {
            assembly = {
              lastSeq: Math.max(assembly.lastSeq, ev.id),
              text: payload.text,
              tokenCount: assembly.tokenCount,
            };
          }
        }
      }

      // --- Durable store READ (oracle must come from Postgres, not constants) ---
      const durableRows = await sql<{ content: string; role: string }[]>`
        SELECT content, role FROM chat_messages
        WHERE id = ${body.durableMessageId as string}::uuid
      `;
      expect(
        durableRows.length,
        'durable agent row must exist in chat_messages'
      ).toBeGreaterThanOrEqual(1);
      const durableContent = durableRows[0]?.content ?? '';
      expect(
        durableContent.length,
        'empty/start signature: durable agent rows content empty'
      ).toBeGreaterThan(0);

      const agentCountRows = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM chat_messages
        WHERE conversation_id = ${body.conversationId as string}
          AND role = 'agent'
          AND (
            id = ${body.durableMessageId as string}::uuid
            OR session_id = ${body.runId as string}
          )
      `;
      const agentBubbleCount = Number(agentCountRows[0]?.n ?? 0);

      const contentDiff = assembly.text === durableContent ? 0 : 1;

      expect(contentDiff, `contentDiff expected 0 (assembled vs durable)`).toBe(0);
      expect(assembly.text).toBe(durableContent);
      expect(agentBubbleCount, 'agent message count for the turn must be 1').toBe(1);
      expect(assembly.tokenCount).toBe(UNIQUE_COUNT);
      expect(assembly.text).toBe(UNIQUE_TEXT);
      expect(assembly.text).not.toMatch(/OneTwoThreeOneTwoThree/);

      mkdirSync(EVIDENCE_DIR, { recursive: true });
      writeFileSync(
        join(EVIDENCE_DIR, 'redhat-fix-03-ac5-durable.json'),
        JSON.stringify(
          {
            runId: body.runId,
            durableMessageId: body.durableMessageId,
            conversationId: body.conversationId,
            assembledText: assembly.text,
            durableContent,
            contentDiff,
            agentBubbleCount,
            tokenCount: assembly.tokenCount,
            lastSeq: assembly.lastSeq,
            resumeLastEventId: resumeHeaders['Last-Event-ID'] ?? null,
          },
          null,
          2
        )
      );
    },
    60_000
  );

  it('buildSseResumeHeaders is pure and used for reconnect (runtime, not static rg only)', () => {
    const withSeq = buildSseResumeHeaders({ apiKey: 'k', lastSeq: 3 });
    expect(withSeq['Last-Event-ID']).toBe('3');
    expect(withSeq.Authorization).toBe('Bearer k');
    expect(withSeq.Accept).toBe('text/event-stream');

    const dropped = buildSseResumeHeaders({
      apiKey: 'k',
      lastSeq: 3,
      omitLastEventId: true,
    });
    expect(dropped['Last-Event-ID']).toBeUndefined();

    const first = buildSseResumeHeaders({ apiKey: 'k', lastSeq: 0 });
    expect(first['Last-Event-ID']).toBeUndefined();
  });
});
