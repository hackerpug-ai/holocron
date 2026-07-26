/**
 * REDHAT-FIX-04 — Production-hook (createResumableSseController) reconnect oracle.
 *
 * Exercises PRODUCTION assemblyRef + openEventSource reconnect against a real
 * http.createServer SSE stub. Kills the assemblyRef-reset mutant at production
 * reconnect sites (onError retry + online handler) — NOT a local harness wipe
 * (REDHAT-FIX-03 anti-pattern).
 *
 * AC-1: correct path Last-Event-ID=='3', unique concat, tokenCount==5, resumeTransport=='sse'
 * AC-2: production assembly-reset mutant → suite exit non-zero; mutation.log written
 * AC-3: pure + fix-03 non-regression (separate verify command)
 * AC-4: disableStatusPollFallback=true; poll cannot sole-greenwash
 * AC-5: TDD evidence files (red log + mutation log + path.json A)
 *
 * Never mock EventSource/XHR with canned headers — real request headers observed by stub.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Node XMLHttpRequest polyfill — production openProgressiveSse uses XHR.
// Progressive responseText + real headers (no canned EventSource mock).
// ---------------------------------------------------------------------------
class NodeXMLHttpRequest {
  static readonly UNSENT = 0;
  static readonly OPENED = 1;
  static readonly HEADERS_RECEIVED = 2;
  static readonly LOADING = 3;
  static readonly DONE = 4;

  readyState = 0;
  responseText = '';
  status = 0;
  timeout = 0;
  onreadystatechange: (() => void) | null = null;
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  private _method = 'GET';
  private _url = '';
  private _headers: Record<string, string> = {};
  private _req: import('node:http').ClientRequest | null = null;
  private _aborted = false;

  open(method: string, url: string, _async?: boolean): void {
    this._method = method;
    this._url = url;
    this.readyState = NodeXMLHttpRequest.OPENED;
  }

  setRequestHeader(key: string, value: string): void {
    this._headers[key] = value;
  }

  abort(): void {
    this._aborted = true;
    try {
      this._req?.destroy();
    } catch {
      /* ignore */
    }
    this.onabort?.();
  }

  send(_body?: unknown): void {
    const http = require('node:http') as typeof import('node:http');
    const https = require('node:https') as typeof import('node:https');
    const u = new URL(this._url);
    const lib = u.protocol === 'https:' ? https : http;
    const headers: Record<string, string> = { ...this._headers };

    this._req = lib.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: this._method,
        headers,
      },
      (res) => {
        if (this._aborted) return;
        this.status = res.statusCode ?? 0;
        this.readyState = NodeXMLHttpRequest.HEADERS_RECEIVED;
        this.onreadystatechange?.();

        res.on('data', (chunk: Buffer | string) => {
          if (this._aborted) return;
          this.responseText += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
          this.readyState = NodeXMLHttpRequest.LOADING;
          this.onreadystatechange?.();
          this.onprogress?.();
        });
        res.on('end', () => {
          if (this._aborted) return;
          this.readyState = NodeXMLHttpRequest.DONE;
          this.onreadystatechange?.();
          this.onload?.();
        });
        res.on('error', () => {
          if (this._aborted) return;
          this.onerror?.();
        });
      }
    );
    this._req.on('error', () => {
      if (!this._aborted) this.onerror?.();
    });
    this._req.end();
  }
}

// Install before production module evaluates openProgressiveSse
const g = globalThis as typeof globalThis & { XMLHttpRequest?: typeof XMLHttpRequest };
// This is a deliberately narrow Node test polyfill. The production code only
// reads the members implemented above; it does not need the browser-only XHR
// surface required by lib.dom's constructor type.
g.XMLHttpRequest = NodeXMLHttpRequest as unknown as typeof XMLHttpRequest;
// Match browser static constants used by openProgressiveSse
Object.assign(NodeXMLHttpRequest, {
  UNSENT: 0,
  OPENED: 1,
  HEADERS_RECEIVED: 2,
  LOADING: 3,
  DONE: 4,
});

import {
  createResumableSseController,
  type ResumableSseController,
} from '../../hooks/use-resumable-sse-stream';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const EVIDENCE_DIR = join(REPO_ROOT, '.tmp', 'sprint-25');
const MUTATION_LOG = join(EVIDENCE_DIR, 'redhat-fix-04-production-mutation.log');
const PATH_JSON = join(EVIDENCE_DIR, 'redhat-fix-04-path.json');
/** REDHAT-FIX-10 site-A (XHR onError) mutation + path evidence */
const FIX10_MUTATION_LOG = join(EVIDENCE_DIR, 'redhat-fix-10-site-a-mutation.log');
const FIX10_PATH_JSON = join(EVIDENCE_DIR, 'redhat-fix-10-path.json');

const TOKENS = ['One', 'Two', 'Three', 'Four', 'Five'] as const;
const UNIQUE_TEXT = TOKENS.join('');
const UNIQUE_COUNT = TOKENS.length;
const API_KEY = 'redhat-fix-04-test-key';
const RUN_ID = '00000000-0000-4000-8000-0000000000f4';
const DURABLE_ID = '00000000-0000-4000-8000-0000000000d4';

type StubRequest = {
  method?: string;
  url?: string;
  headers: IncomingMessage['headers'];
  lastEventId: string | null;
};

function sseChunk(event: string, data: unknown, id: number): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function withSseStub(
  handler: (ctx: {
    baseUrl: string;
    requests: StubRequest[];
    setPhase: (phase: 'first' | 'reconnect') => void;
    destroyActive: () => void;
  }) => Promise<void>
): Promise<void> {
  const requests: StubRequest[] = [];
  let phase: 'first' | 'reconnect' = 'first';
  let server: Server | undefined;
  const activeResponses = new Set<ServerResponse>();

  const onReq = (req: IncomingMessage, res: ServerResponse) => {
    const lastEventId =
      typeof req.headers['last-event-id'] === 'string' ? req.headers['last-event-id'] : null;
    requests.push({
      method: req.method,
      url: req.url,
      headers: { ...req.headers },
      lastEventId,
    });

    // Status poll path (M2) — must not sole-greenwash when disableStatusPollFallback=true
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
    activeResponses.add(res);
    res.on('close', () => activeResponses.delete(res));

    const afterSeq = lastEventId ? Number.parseInt(lastEventId, 10) || 0 : 0;

    if (phase === 'first') {
      for (let i = 1; i <= 3; i++) {
        res.write(sseChunk('token', { token: TOKENS[i - 1] }, i));
      }
      // Hold connection open so destroyActive() can force XHR onError (site A).
      // Site B still works: setOnline(false) aborts the client XHR intentionally.
      // Do NOT res.end() here — clean end fires onload, not onerror.
      return;
    }

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

  const addr = server?.address();
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
      destroyActive: () => {
        for (const res of activeResponses) {
          try {
            res.destroy();
          } catch {
            /* ignore */
          }
        }
        activeResponses.clear();
      },
    });
  } finally {
    await new Promise<void>((resolveClose) => {
      server?.close(() => resolveClose());
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(
  predicate: () => boolean,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {}
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const intervalMs = opts.intervalMs ?? 20;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await sleep(intervalMs);
  }
  throw new Error(`waitFor timeout${opts.label ? `: ${opts.label}` : ''}`);
}

/**
 * Drive production controller through mid-stream disconnect + online reconnect (site B).
 * Returns reconnect Last-Event-ID from the REAL stub request headers and final snapshot.
 */
async function runProductionReconnect(args: {
  baseUrl: string;
  requests: StubRequest[];
  setPhase: (phase: 'first' | 'reconnect') => void;
}): Promise<{
  reconnectLastEventId: string | null;
  snapshot: ReturnType<ResumableSseController['getSnapshot']>;
  controller: ResumableSseController;
}> {
  const controller = createResumableSseController({
    platformUrl: args.baseUrl,
    apiKey: API_KEY,
    disableStatusPollFallback: true,
    reconnectDelayMs: 50,
    initialIsOnline: true,
  });

  try {
    controller.connect({ runId: RUN_ID, durableMessageId: DURABLE_ID });

    await waitFor(() => controller.getSnapshot().lastSeq >= 3, {
      label: 'first-connect lastSeq>=3',
    });
    expect(controller.getSnapshot().streamedText).toBe('OneTwoThree');
    expect(controller.getSnapshot().tokenCount).toBe(3);
    expect(controller.assemblyRef.current.lastSeq).toBe(3);

    // Mid-stream disconnect → production online handler reconnect (site B ~:764)
    args.setPhase('reconnect');
    controller.setOnline(false);
    await waitFor(() => controller.getSnapshot().phase === 'reconnecting', {
      label: 'phase reconnecting after offline',
    });

    const requestsBeforeReconnect = args.requests.length;
    controller.setOnline(true);

    await waitFor(
      () => {
        const snap = controller.getSnapshot();
        return snap.phase === 'complete' || snap.lastSeq >= UNIQUE_COUNT;
      },
      { label: 'reconnect complete / lastSeq>=5', timeoutMs: 8000 }
    );

    // Prefer explicit complete; allow brief settle
    await waitFor(() => controller.getSnapshot().phase === 'complete', {
      label: 'phase complete',
      timeoutMs: 3000,
    }).catch(() => {
      /* terminal may already have set complete; re-check below */
    });

    const reconnectReqs = args.requests
      .slice(requestsBeforeReconnect)
      .filter((r) => (r.url ?? '').includes('/events'));
    const reconnectReq = reconnectReqs[0] ?? null;
    const reconnectLastEventId = reconnectReq?.lastEventId ?? null;

    return {
      reconnectLastEventId,
      snapshot: controller.getSnapshot(),
      controller,
    };
  } catch (err) {
    controller.dispose();
    throw err;
  }
}

/**
 * REDHAT-FIX-10 PATH-A: drive production site-A (XHR onError retry) WITHOUT setOnline(false).
 * destroyActive() kills the held-open first SSE response → production onError → openEventSource(resumeRunId, assemblyRef.lastSeq).
 */
async function runProductionSiteAOnErrorReconnect(args: {
  baseUrl: string;
  requests: StubRequest[];
  setPhase: (phase: 'first' | 'reconnect') => void;
  destroyActive: () => void;
}): Promise<{
  reconnectLastEventId: string | null;
  snapshot: ReturnType<ResumableSseController['getSnapshot']>;
  controller: ResumableSseController;
  setOnlineFalseCount: number;
}> {
  let setOnlineFalseCount = 0;
  const controller = createResumableSseController({
    platformUrl: args.baseUrl,
    apiKey: API_KEY,
    disableStatusPollFallback: true,
    reconnectDelayMs: 50,
    initialIsOnline: true,
  });
  const realSetOnline = controller.setOnline.bind(controller);
  controller.setOnline = (next: boolean) => {
    if (next === false) setOnlineFalseCount += 1;
    return realSetOnline(next);
  };

  try {
    controller.connect({ runId: RUN_ID, durableMessageId: DURABLE_ID });

    await waitFor(() => controller.getSnapshot().lastSeq >= 3, {
      label: 'site-A first-connect lastSeq>=3',
    });
    expect(controller.getSnapshot().streamedText).toBe('OneTwoThree');
    expect(controller.getSnapshot().tokenCount).toBe(3);
    expect(controller.assemblyRef.current.lastSeq).toBe(3);

    // Arm reconnect payload, then destroy active SSE response (XHR onError) — NOT setOnline
    args.setPhase('reconnect');
    const requestsBeforeReconnect = args.requests.length;
    args.destroyActive();

    await waitFor(
      () => {
        const snap = controller.getSnapshot();
        return snap.phase === 'complete' || snap.lastSeq >= UNIQUE_COUNT;
      },
      { label: 'site-A onError reconnect complete / lastSeq>=5', timeoutMs: 8000 }
    );

    await waitFor(() => controller.getSnapshot().phase === 'complete', {
      label: 'site-A phase complete',
      timeoutMs: 3000,
    }).catch(() => {
      /* terminal may already have set complete */
    });

    const reconnectReqs = args.requests
      .slice(requestsBeforeReconnect)
      .filter((r) => (r.url ?? '').includes('/events'));
    const reconnectReq = reconnectReqs[0] ?? null;
    const reconnectLastEventId = reconnectReq?.lastEventId ?? null;

    return {
      reconnectLastEventId,
      snapshot: controller.getSnapshot(),
      controller,
      setOnlineFalseCount,
    };
  } catch (err) {
    controller.dispose();
    throw err;
  }
}

const controllersToDispose: ResumableSseController[] = [];
afterEach(() => {
  while (controllersToDispose.length) {
    controllersToDispose.pop()?.dispose();
  }
});

describe('REDHAT-FIX-04 production-hook SSE reconnect', () => {
  it('AC-1: production controller reconnect sends Last-Event-ID=3 and unique assembly', async () => {
    await withSseStub(async ({ baseUrl, requests, setPhase }) => {
      const result = await runProductionReconnect({ baseUrl, requests, setPhase });
      controllersToDispose.push(result.controller);

      // Header observed on REAL reconnect request (not a local harness variable)
      expect(result.reconnectLastEventId).toBe('3');

      const snap = result.snapshot;
      expect(snap.streamedText).toBe(UNIQUE_TEXT);
      expect(snap.tokenCount).toBe(UNIQUE_COUNT);
      expect(snap.lastSeq).toBeGreaterThanOrEqual(UNIQUE_COUNT);
      expect(snap.resumeTransport).toBe('sse');
      expect(snap.streamedText.includes('OneTwoThreeOneTwoThree')).toBe(false);

      // Production assemblyRef is the source of truth (not a harness-local copy)
      expect(result.controller.assemblyRef.current.tokenCount).toBe(UNIQUE_COUNT);
      expect(result.controller.assemblyRef.current.text).toBe(UNIQUE_TEXT);

      // Write API-response style evidence for AC-1
      mkdirSync(EVIDENCE_DIR, { recursive: true });
      writeFileSync(
        join(EVIDENCE_DIR, 'redhat-fix-04-ac1-api-response.json'),
        JSON.stringify(
          {
            reconnectLastEventId: result.reconnectLastEventId,
            streamedText: snap.streamedText,
            tokenCount: snap.tokenCount,
            lastSeq: snap.lastSeq,
            resumeTransport: snap.resumeTransport,
            requestCount: requests.length,
            eventRequests: requests
              .filter((r) => (r.url ?? '').includes('/events'))
              .map((r) => ({ url: r.url, lastEventId: r.lastEventId })),
          },
          null,
          2
        )
      );
    });
  });

  it('AC-4-poll-cannot-greenwash: disableStatusPollFallback keeps resumeTransport=sse', async () => {
    await withSseStub(async ({ baseUrl, requests, setPhase }) => {
      const result = await runProductionReconnect({ baseUrl, requests, setPhase });
      controllersToDispose.push(result.controller);

      expect(result.snapshot.resumeTransport).toBe('sse');
      expect(result.snapshot.resumeTransport).not.toBe('poll');
      expect(result.reconnectLastEventId).toBe('3');
      expect(result.snapshot.tokenCount).toBe(UNIQUE_COUNT);

      // Poll endpoint may exist on stub but must not be the sole finalize path
      const pollReqs = requests.filter(
        (r) => (r.url ?? '').includes('/api/chat-runs/') && !(r.url ?? '').includes('/events')
      );
      // With disableStatusPollFallback=true, production must not rely on poll
      expect(result.snapshot.resumeTransport).toBe('sse');
      void pollReqs;
    });
  });

  it('AC-2-production-mutation: correct exit 0; production-assembly-reset exits non-zero', () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const lines: string[] = [];
    const stamp = new Date().toISOString();
    lines.push(`# REDHAT-FIX-04 production mutation probe ${stamp}`);
    lines.push(`repo_root=${REPO_ROOT}`);
    lines.push(
      `base_head=${spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim()}`
    );

    const vitestBin = join(REPO_ROOT, 'node_modules', '.bin', 'vitest');
    const testFile = 'tests/integration/redhat-fix-04-production-hook-reconnect.test.ts';
    const ac1Filter = 'AC-1';

    // --- Correct (unmutated) production path ---
    const correct = spawnSync(vitestBin, ['run', testFile, '-t', ac1Filter], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, REDHAT_FIX_04_MUTATION_CHILD: '1' },
      timeout: 120_000,
    });
    const correctExit = correct.status ?? 1;
    const correctFailed = (correct.stdout + correct.stderr).match(/(\d+) failed/);
    const correctFailures = correctFailed ? Number(correctFailed[1]) : correctExit === 0 ? 0 : 1;
    lines.push(
      `correct mode=unmutated exit=${correctExit} failures=${correctFailures} exit_ok=${correctExit === 0}`
    );
    if (correctExit !== 0) {
      lines.push('correct_stdout_tail:');
      lines.push((correct.stdout + correct.stderr).split('\n').slice(-40).join('\n'));
    }

    // --- Production assemblyRef-reset mutant at reconnect sites ---
    const hookPath = join(REPO_ROOT, 'hooks', 'use-resumable-sse-stream.ts');
    const original = readFileSync(hookPath, 'utf8');
    const mutantWipe =
      "assemblyRef.current = { lastSeq: 0, text: '', tokenCount: 0 };\n                ";

    // Site A: onError retry openEventSource call
    const siteA = 'openEventSource(resumeRunId, assemblyRef.current.lastSeq);';
    // Site B: online handler openEventSource call
    const siteB = 'openEventSource(runId, assemblyRef.current.lastSeq);';

    let mutated = original;
    // Only mutate the reconnect call sites (not connect's openEventSource(nextRunId, 0))
    const siteAIdx = mutated.indexOf(siteA);
    const siteBIdx = mutated.indexOf(siteB);
    if (siteAIdx === -1 || siteBIdx === -1) {
      lines.push(
        `production-assembly-reset ERROR: reconnect sites not found siteA=${siteAIdx} siteB=${siteBIdx}`
      );
      writeFileSync(MUTATION_LOG, lines.join('\n') + '\n');
      expect(siteAIdx, 'production reconnect site A must exist').toBeGreaterThanOrEqual(0);
      expect(siteBIdx, 'production reconnect site B must exist').toBeGreaterThanOrEqual(0);
      return;
    }

    // Insert wipe immediately before each reconnect openEventSource call
    // Process later index first to preserve earlier offsets
    const inserts = [
      {
        idx: siteAIdx,
        mark: '/* REDHAT-FIX-04 production-assembly-reset siteA */\n                ',
      },
      { idx: siteBIdx, mark: '/* REDHAT-FIX-04 production-assembly-reset siteB */\n      ' },
    ].sort((a, b) => b.idx - a.idx);

    for (const ins of inserts) {
      mutated = mutated.slice(0, ins.idx) + ins.mark + mutantWipe + mutated.slice(ins.idx);
    }
    writeFileSync(hookPath, mutated);

    let mutantExit = 0;
    let mutantFailures = 0;
    try {
      const mutant = spawnSync(vitestBin, ['run', testFile, '-t', ac1Filter], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env, REDHAT_FIX_04_MUTATION_CHILD: '1' },
        timeout: 120_000,
      });
      mutantExit = mutant.status ?? 1;
      const mutantFailed = (mutant.stdout + mutant.stderr).match(/(\d+) failed/);
      mutantFailures = mutantFailed ? Number(mutantFailed[1]) : mutantExit === 0 ? 0 : 1;
      lines.push(
        `production-assembly-reset mode=production-assembly-reset exit=${mutantExit} failures=${mutantFailures} exit_nonzero=${mutantExit !== 0}`
      );
      if (mutantExit === 0) {
        lines.push('production-assembly-reset SURVIVED (suite green under mutant) — FAIL');
        lines.push((mutant.stdout + mutant.stderr).split('\n').slice(-50).join('\n'));
      } else {
        lines.push('production-assembly-reset KILLED (suite exit non-zero under production wipe)');
        lines.push((mutant.stdout + mutant.stderr).split('\n').slice(-30).join('\n'));
      }
    } finally {
      writeFileSync(hookPath, original);
      lines.push('production file restored after mutant probe');
    }

    writeFileSync(MUTATION_LOG, lines.join('\n') + '\n');
    writeFileSync(PATH_JSON, JSON.stringify({ path: 'A', task: 'REDHAT-FIX-04' }, null, 2) + '\n');

    // Parent assertions: correct green, mutant killed
    expect(correctExit, 'correct production path must exit 0').toBe(0);
    expect(correctFailures).toBe(0);
    expect(mutantExit, 'production-assembly-reset must exit non-zero').not.toBe(0);
    expect(mutantFailures, 'production-assembly-reset failures>=1').toBeGreaterThanOrEqual(1);
    expect(existsSync(MUTATION_LOG)).toBe(true);
    const logBody = readFileSync(MUTATION_LOG, 'utf8');
    expect(logBody).toMatch(/production-assembly-reset/);
    expect(logBody).toMatch(/exit_nonzero=true|exit=[1-9]/);
  }, 180_000);

  it('AC-1-site-A: XHR onError reconnect without setOnline sends Last-Event-ID=3 and unique assembly', async () => {
    await withSseStub(async ({ baseUrl, requests, setPhase, destroyActive }) => {
      const result = await runProductionSiteAOnErrorReconnect({
        baseUrl,
        requests,
        setPhase,
        destroyActive,
      });
      controllersToDispose.push(result.controller);

      // Site A must not use setOnline(false) — that is site B
      expect(result.setOnlineFalseCount).toBe(0);

      // Header observed on REAL site-A onError reconnect request
      expect(result.reconnectLastEventId).toBe('3');

      const snap = result.snapshot;
      expect(snap.streamedText).toBe(UNIQUE_TEXT);
      expect(snap.tokenCount).toBe(UNIQUE_COUNT);
      expect(snap.lastSeq).toBeGreaterThanOrEqual(UNIQUE_COUNT);
      expect(snap.resumeTransport).toBe('sse');
      expect(snap.streamedText.includes('OneTwoThreeOneTwoThree')).toBe(false);
      expect(snap.resumeTransport).not.toBe('poll');

      expect(result.controller.assemblyRef.current.lastSeq).toBeGreaterThanOrEqual(UNIQUE_COUNT);
      expect(result.controller.assemblyRef.current.tokenCount).toBe(UNIQUE_COUNT);
      expect(result.controller.assemblyRef.current.text).toBe(UNIQUE_TEXT);

      mkdirSync(EVIDENCE_DIR, { recursive: true });
      writeFileSync(
        join(EVIDENCE_DIR, 'redhat-fix-10-ac1-site-a-api-response.json'),
        JSON.stringify(
          {
            site: 'A',
            path: 'onError-destroyActive',
            setOnlineFalseCount: result.setOnlineFalseCount,
            reconnectLastEventId: result.reconnectLastEventId,
            streamedText: snap.streamedText,
            tokenCount: snap.tokenCount,
            lastSeq: snap.lastSeq,
            resumeTransport: snap.resumeTransport,
            requestCount: requests.length,
            eventRequests: requests
              .filter((r) => (r.url ?? '').includes('/events'))
              .map((r) => ({ url: r.url, lastEventId: r.lastEventId })),
          },
          null,
          2
        )
      );
    });
  });

  it('AC-2-site-A-mutation: single-site-A wiped killed; single-site-B + dual-site still killed', () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const lines: string[] = [];
    const stamp = new Date().toISOString();
    lines.push(`# REDHAT-FIX-10 site-A / site-B / dual-site mutation probe ${stamp}`);
    lines.push(`repo_root=${REPO_ROOT}`);
    lines.push(
      `base_head=${spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim()}`
    );

    const vitestBin = join(REPO_ROOT, 'node_modules', '.bin', 'vitest');
    const testFile = 'tests/integration/redhat-fix-04-production-hook-reconnect.test.ts';
    const siteAFilter = 'AC-1-site-A';
    const siteBFilter = 'AC-1: production controller reconnect';
    const childEnv = { ...process.env, REDHAT_FIX_10_MUTATION_CHILD: '1' };

    const runFilter = (filter: string) => {
      const r = spawnSync(vitestBin, ['run', testFile, '-t', filter], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: childEnv,
        timeout: 120_000,
      });
      const exit = r.status ?? 1;
      const failedMatch = (r.stdout + r.stderr).match(/(\d+) failed/);
      const failures = failedMatch ? Number(failedMatch[1]) : exit === 0 ? 0 : 1;
      return { exit, failures, out: r.stdout + r.stderr };
    };

    // --- Correct (unmutated) site-A path ---
    const correct = runFilter(siteAFilter);
    lines.push(
      `correct site=A mode=unmutated exit=${correct.exit} failures=${correct.failures} exit_ok=${correct.exit === 0}`
    );
    if (correct.exit !== 0) {
      lines.push('correct_siteA_stdout_tail:');
      lines.push(correct.out.split('\n').slice(-40).join('\n'));
    }

    const hookPath = join(REPO_ROOT, 'hooks', 'use-resumable-sse-stream.ts');
    const original = readFileSync(hookPath, 'utf8');
    const mutantWipe =
      "assemblyRef.current = { lastSeq: 0, text: '', tokenCount: 0 };\n                ";
    const siteA = 'openEventSource(resumeRunId, assemblyRef.current.lastSeq);';
    const siteB = 'openEventSource(runId, assemblyRef.current.lastSeq);';

    const applyWipe = (targets: Array<'A' | 'B'>): boolean => {
      let mutated = original;
      const siteAIdx = mutated.indexOf(siteA);
      const siteBIdx = mutated.indexOf(siteB);
      if (siteAIdx === -1 || siteBIdx === -1) {
        lines.push(`ERROR: reconnect sites not found siteA=${siteAIdx} siteB=${siteBIdx}`);
        return false;
      }
      const inserts: Array<{ idx: number; mark: string }> = [];
      if (targets.includes('A')) {
        inserts.push({
          idx: siteAIdx,
          mark: '/* REDHAT-FIX-10 single-site-A wipe */\n                ',
        });
      }
      if (targets.includes('B')) {
        inserts.push({
          idx: siteBIdx,
          mark: '/* REDHAT-FIX-10 single-site-B wipe */\n      ',
        });
      }
      inserts.sort((a, b) => b.idx - a.idx);
      for (const ins of inserts) {
        mutated = mutated.slice(0, ins.idx) + ins.mark + mutantWipe + mutated.slice(ins.idx);
      }
      writeFileSync(hookPath, mutated);
      return true;
    };

    const restore = () => {
      writeFileSync(hookPath, original);
    };

    // --- single-site-A wipe vs site-A suite ---
    let singleAExit = 0;
    let singleAFailures = 0;
    try {
      if (!applyWipe(['A'])) {
        writeFileSync(FIX10_MUTATION_LOG, lines.join('\n') + '\n');
        expect(false, 'site A/B call sites must exist').toBe(true);
        return;
      }
      const singleA = runFilter(siteAFilter);
      singleAExit = singleA.exit;
      singleAFailures = singleA.failures;
      lines.push(
        `single-site-A mode=assemblyRef-reset-siteA-only suite=AC-1-site-A exit=${singleAExit} failures=${singleAFailures} exit_nonzero=${singleAExit !== 0}`
      );
      if (singleAExit === 0) {
        lines.push('single-site-A SURVIVES (suite green under site-A-only wipe) — FAIL');
        lines.push(singleA.out.split('\n').slice(-50).join('\n'));
      } else {
        lines.push(
          'single-site-A KILLED (suite exit non-zero under site-A-only wipe; failures>=1)'
        );
        lines.push(singleA.out.split('\n').slice(-30).join('\n'));
      }
    } finally {
      restore();
      lines.push('production file restored after single-site-A probe');
    }

    // --- single-site-B wipe vs site-B AC-1 ---
    let singleBExit = 0;
    let singleBFailures = 0;
    try {
      applyWipe(['B']);
      const singleB = runFilter(siteBFilter);
      singleBExit = singleB.exit;
      singleBFailures = singleB.failures;
      lines.push(
        `single-site-B mode=assemblyRef-reset-siteB-only suite=AC-1 exit=${singleBExit} failures=${singleBFailures} exit_nonzero=${singleBExit !== 0}`
      );
      if (singleBExit === 0) {
        lines.push('single-site-B SURVIVES — FAIL');
        lines.push(singleB.out.split('\n').slice(-40).join('\n'));
      } else {
        lines.push('single-site-B KILLED (site-B AC-1 exit non-zero under site-B-only wipe)');
      }
    } finally {
      restore();
      lines.push('production file restored after single-site-B probe');
    }

    // --- dual-site wipe vs site-A suite (or site-B) ---
    let dualExit = 0;
    let dualFailures = 0;
    try {
      applyWipe(['A', 'B']);
      const dual = runFilter(siteAFilter);
      dualExit = dual.exit;
      dualFailures = dual.failures;
      lines.push(
        `dual-site mode=assemblyRef-reset-A+B suite=AC-1-site-A exit=${dualExit} failures=${dualFailures} exit_nonzero=${dualExit !== 0}`
      );
      if (dualExit === 0) {
        lines.push('dual-site SURVIVES — FAIL');
        lines.push(dual.out.split('\n').slice(-40).join('\n'));
      } else {
        lines.push('dual-site KILLED (suite exit non-zero under dual wipe)');
      }
    } finally {
      restore();
      lines.push('production file restored after dual-site probe');
    }

    writeFileSync(FIX10_MUTATION_LOG, lines.join('\n') + '\n');
    writeFileSync(
      FIX10_PATH_JSON,
      JSON.stringify(
        {
          path: 'A',
          task: 'REDHAT-FIX-10',
          finding: 'F-E2',
          siteA: 'XHR-onError-destroyActive',
          singleSiteA: singleAExit !== 0 ? 'KILLED' : 'SURVIVES',
          singleSiteB: singleBExit !== 0 ? 'KILLED' : 'SURVIVES',
          dualSite: dualExit !== 0 ? 'KILLED' : 'SURVIVES',
        },
        null,
        2
      ) + '\n'
    );

    expect(correct.exit, 'PATH-A unmutated site-A suite must exit 0').toBe(0);
    expect(correct.failures).toBe(0);
    expect(singleAExit, 'single-site-A mutant must exit non-zero').not.toBe(0);
    expect(singleAFailures, 'single-site-A failures>=1').toBeGreaterThanOrEqual(1);
    expect(singleBExit, 'single-site-B mutant must still be killed').not.toBe(0);
    expect(dualExit, 'dual-site mutant must still be killed').not.toBe(0);
    expect(existsSync(FIX10_MUTATION_LOG)).toBe(true);
    const logBody = readFileSync(FIX10_MUTATION_LOG, 'utf8');
    expect(logBody).toMatch(/single-site-A/);
    expect(logBody).toMatch(/single-site-A.*KILLED|single-site-A.*exit_nonzero=true/);
    expect(logBody).toMatch(/single-site-B/);
    expect(logBody).toMatch(/dual-site/);
  }, 300_000);
});
