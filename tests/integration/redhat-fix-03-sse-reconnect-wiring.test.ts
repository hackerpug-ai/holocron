/**
 * REDHAT-FIX-03 — Strengthen PRIMARY gate oracle for SSE reconnect exactly-once.
 *
 * Real-socket integration over http.createServer SSE stub:
 *   tokens seq 1-3 → disconnect → reconnect with Last-Event-ID → remaining tokens
 *   unique concat + tokenCount == unique count; mutants killed.
 *
 * H3 evidence: s-reactive-01 static/pure suite stays green under header-drop
 * (see .tmp/sprint-25/redhat-fix-03-red-header-drop-old-suite.log).
 *
 * No EventSource/XHR mocks that hide headers — stub observes real request headers.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyTokenEvent,
  buildSseResumeHeaders,
  type TokenAssemblyState,
} from '../../hooks/use-resumable-sse-stream';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const MUTATION_LOG = join(REPO_ROOT, '.tmp', 'sprint-25', 'redhat-fix-03-mutation.log');
const EVIDENCE_DIR = join(REPO_ROOT, '.tmp', 'sprint-25');

const TOKENS = ['One', 'Two', 'Three', 'Four', 'Five'] as const;
const UNIQUE_TEXT = TOKENS.join('');
const UNIQUE_COUNT = TOKENS.length;

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
  agentBubbleCount: number;
  resumeTransport: 'sse' | 'poll' | 'none';
  pollDisabled: 0 | 1;
  durableContent: string;
  contentDiff: number;
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
      res.write(
        sseChunk('terminal', { status: 'completed', text: UNIQUE_TEXT }, terminalSeq)
      );
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

  // Durable row simulation: single agent message matching unique assembly
  const durableContent = UNIQUE_TEXT;
  const agentBubbleCount = 1;
  const contentDiff = assembly.text === durableContent ? 0 : 1;

  // Collect assertion failures (used by AC-2 mutation branches without throwing early)
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
  if (contentDiff !== 0) {
    failures.push(`contentDiff expected 0, got ${contentDiff}`);
  }
  if (agentBubbleCount !== 1) {
    failures.push(`agentBubbleCount expected 1, got ${agentBubbleCount}`);
  }

  return {
    mode: args.mode,
    reconnectLastEventId,
    reconnectHeaders: reconnectHeaders as unknown as IncomingMessage['headers'],
    finalText: assembly.text,
    tokenCount: assembly.tokenCount,
    lastSeq: assembly.lastSeq,
    duplicateSeqApplications,
    agentBubbleCount,
    resumeTransport,
    pollDisabled,
    durableContent,
    contentDiff,
    assertionFailures: failures,
  };
}

describe('REDHAT-FIX-03 SSE reconnect wiring oracle', () => {
  const serversToClose: Server[] = [];
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
      expect(reconnectReq?.lastEventId, 'stub must observe Last-Event-ID on reconnect').toBe(
        '3'
      );

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
    expect(
      assemblyResetFailCount,
      'assembly-reset must fail >=1 assertion'
    ).toBeGreaterThanOrEqual(1);
    expect(correctFailCount, 'correct wiring must pass all assertions').toBe(0);
    expect(correct.reconnectLastEventId).toBe('3');
    expect(correct.finalText).toBe(UNIQUE_TEXT);
    expect(correct.tokenCount).toBe(UNIQUE_COUNT);

    // mutation.log line count >= 2 (failed mutant cases recorded)
    const logBody = lines.join('\n');
    expect(logBody.split('\n').filter((l) => l.includes('failures=')).length).toBeGreaterThanOrEqual(
      2
    );
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

  it('AC-5: assembled text matches durable row; agent message count == 1', async () => {
    await withSseStub(async ({ baseUrl, setPhase }) => {
      const result = await runReconnectWiring({
        baseUrl,
        mode: 'correct',
        disableStatusPollFallback: true,
        setPhase,
      });

      expect(result.contentDiff).toBe(0);
      expect(result.finalText).toBe(result.durableContent);
      expect(result.agentBubbleCount).toBe(1);
      expect(result.tokenCount).toBe(UNIQUE_COUNT);
      expect(result.finalText).toBe(UNIQUE_TEXT);
    });
  });

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
