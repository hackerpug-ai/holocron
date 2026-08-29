/**
 * S31-FE-01 — Bound every chat-path request and stream with a terminating deadline.
 *
 * AC-1: healthy stream completes with 0 deadline firings (integration non-regression)
 * AC-2: accept-then-stall → degraded + composer unlock (isActive false)
 * AC-3: keepalive rearms idle watchdog
 * AC-4: reconnect cap terminates
 * AC-5: ios ontimeout / android status-0 + live hard-down transport
 * AC-6: all chat-path calls honour the shared deadline constants
 * TC-9: ChatStreamPhase union is frozen
 *
 * Uses a real scripts/e2e/stall-sse-server.py origin on an ephemeral port
 * (not mocked fetch/XHR). PLATFORM_IT=1 enables live origin cases.
 */

import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Node XMLHttpRequest polyfill — production openProgressiveSse uses XHR.
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
  ontimeout: (() => void) | null = null;

  private _method = 'GET';
  private _url = '';
  private _headers: Record<string, string> = {};
  private _req: import('node:http').ClientRequest | null = null;
  private _aborted = false;
  private _timeoutTimer: ReturnType<typeof setTimeout> | null = null;

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
    if (this._timeoutTimer) {
      clearTimeout(this._timeoutTimer);
      this._timeoutTimer = null;
    }
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

    if (this.timeout > 0) {
      this._timeoutTimer = setTimeout(() => {
        if (this._aborted) return;
        this._aborted = true;
        try {
          this._req?.destroy();
        } catch {
          /* ignore */
        }
        this.ontimeout?.();
      }, this.timeout);
    }

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
          if (this._timeoutTimer) {
            clearTimeout(this._timeoutTimer);
            this._timeoutTimer = null;
          }
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
      if (!this._aborted) {
        this.status = 0;
        this.onerror?.();
      }
    });
    this._req.end();
  }
}

const g = globalThis as typeof globalThis & { XMLHttpRequest?: typeof XMLHttpRequest };
g.XMLHttpRequest = NodeXMLHttpRequest as unknown as typeof XMLHttpRequest;
Object.assign(NodeXMLHttpRequest, {
  UNSENT: 0,
  OPENED: 1,
  HEADERS_RECEIVED: 2,
  LOADING: 3,
  DONE: 4,
});

import {
  applyChatNetworkDeadlineFailure,
  applyFleetFailureEnvelope,
  CHAT_NETWORK_DEADLINE_CODE,
  CHAT_NETWORK_DEADLINES,
  ChatNetworkDeadlineError,
  type ChatStreamPhase,
  createResumableSseController,
  fetchWithChatDeadline,
  isChatNetworkHardDownFailure,
  isFleetUnavailableFailure,
  SURFACE_UNAVAILABLE_MESSAGE,
} from '../../hooks/use-resumable-sse-stream';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const HOOK_PATH = join(REPO_ROOT, 'packages', 'mobile', 'hooks', 'use-resumable-sse-stream.ts');
const CHAT_SCREEN_PATH = join(
  REPO_ROOT,
  'packages',
  'mobile',
  'app',
  '(drawer)',
  'chat',
  '[conversationId].tsx'
);
const STALL_SERVER = join(REPO_ROOT, 'scripts', 'e2e', 'stall-sse-server.py');
const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const itLive = PLATFORM_IT ? it : it.skip;

const RUN_ID = '00000000-0000-4000-8000-0000000000e1';
const DURABLE_ID = '00000000-0000-4000-8000-0000000000d1';
const API_KEY = 's31-fe-01-test-key';
const SURFACE_MSG = 'Local fleet unavailable — running in reduced mode';

const deadlineSnapshot = { ...CHAT_NETWORK_DEADLINES };

function restoreDeadlines(): void {
  if (CHAT_NETWORK_DEADLINES && typeof CHAT_NETWORK_DEADLINES === 'object') {
    Object.assign(CHAT_NETWORK_DEADLINES, deadlineSnapshot);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(
  predicate: () => boolean,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {}
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const intervalMs = opts.intervalMs ?? 25;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await sleep(intervalMs);
  }
  throw new Error(`waitFor timeout${opts.label ? `: ${opts.label}` : ''}`);
}

async function freePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      if (!addr || typeof addr === 'string') {
        s.close();
        reject(new Error('failed to bind ephemeral port'));
        return;
      }
      const port = addr.port;
      s.close((err) => {
        if (err) reject(err);
        else resolvePort(port);
      });
    });
    s.on('error', reject);
  });
}

async function startStallServer(
  mode: 'stall' | 'keepalive' | 'drop-after-headers',
  extraArgs: string[] = []
): Promise<{
  baseUrl: string;
  port: number;
  child: ChildProcessWithoutNullStreams;
  stop: () => void;
}> {
  const port = await freePort();
  const child = spawn(
    'python3',
    [STALL_SERVER, '--mode', mode, '--host', '127.0.0.1', '--port', String(port), ...extraArgs],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let stderr = '';
  child.stderr.on('data', (b: Buffer) => {
    stderr += b.toString('utf8');
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const start = Date.now();
  while (Date.now() - start < 8000) {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(500) });
      if (res.ok) break;
    } catch {
      /* retry */
    }
    if (child.exitCode != null) {
      throw new Error(`stall-sse-server exited early code=${child.exitCode} stderr=${stderr}`);
    }
    await sleep(50);
  }

  // Confirm health once more.
  const health = await fetch(`${baseUrl}/health`);
  if (!health.ok) {
    child.kill('SIGKILL');
    throw new Error(`stall-sse-server health failed stderr=${stderr}`);
  }

  return {
    baseUrl,
    port,
    child,
    stop: () => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    },
  };
}

async function readConnectionCounter(baseUrl: string): Promise<number> {
  const res = await fetch(`${baseUrl}/__connections`);
  const body = (await res.json()) as { connections?: number };
  return Number(body.connections ?? 0);
}

describe('S31-FE-01 chat-path deadlines', () => {
  afterEach(() => {
    restoreDeadlines();
  });

  describe('static contracts', () => {
    it('CHAT_NETWORK_DEADLINES block is exported and used at every chat-path call site', () => {
      expect(existsSync(HOOK_PATH)).toBe(true);
      expect(existsSync(CHAT_SCREEN_PATH)).toBe(true);
      expect(existsSync(STALL_SERVER)).toBe(true);
      const hook = readFileSync(HOOK_PATH, 'utf8');
      const screen = readFileSync(CHAT_SCREEN_PATH, 'utf8');
      expect(hook).toMatch(/export const CHAT_NETWORK_DEADLINES/);
      expect(hook).toMatch(/sseFirstByteDeadlineMs/);
      expect(hook).toMatch(/sseIdleDeadlineMs/);
      expect(hook).toMatch(/httpRequestDeadlineMs/);
      expect(hook).toMatch(/reconnectMaxAttempts/);
      expect(hook).toMatch(/export async function fetchWithChatDeadline/);
      // Six call sites use the shared helper (no raw fetch at chat-path sites).
      const hookFetchSites = hook.match(/fetchWithChatDeadline\s*\(/g) ?? [];
      expect(hookFetchSites.length).toBeGreaterThanOrEqual(4);
      const screenFetchSites = screen.match(/fetchWithChatDeadline\s*\(/g) ?? [];
      expect(screenFetchSites.length).toBeGreaterThanOrEqual(2);
      // No numeric timeout literals at the six historical call sites region markers.
      expect(hook).not.toMatch(/xhr\.timeout\s*=\s*[1-9]/);
    });

    it('ChatStreamPhase union is frozen', async () => {
      const mod = await import('../../hooks/use-resumable-sse-stream');
      // Runtime smoke: degraded is a valid phase and applyChatNetworkDeadlineFailure lands there.
      const t = mod.applyChatNetworkDeadlineFailure({ phase: 'streaming' });
      expect(t.phase).toBe('degraded');
      expect(t.isDegraded).toBe(true);
      expect(t.message).toBe(SURFACE_MSG);
      // Source-level freeze: exactly the 6 members.
      const src = readFileSync(HOOK_PATH, 'utf8');
      const m = src.match(/export type ChatStreamPhase\s*=\s*([\s\S]*?);/);
      expect(m?.[1]).toBeTruthy();
      const members = [...(m?.[1].matchAll(/'([a-z]+)'/g) ?? [])].map((x) => x[1]);
      expect(members).toEqual([
        'idle',
        'streaming',
        'reconnecting',
        'complete',
        'cancelled',
        'degraded',
      ]);
    });
  });

  describe('AC-1 — healthy stream unaffected by deadlines', () => {
    itLive(
      'healthy stream completes with 0 deadline firings',
      async () => {
        // Real progressive SSE origin (not mocked) that streams tokens then terminal.
        const tokens = ['Healthy', ' ', 'reply', ' ', 'complete'] as const;
        const finalText = tokens.join('');
        let server: Server | undefined;
        const onReq = (req: IncomingMessage, res: ServerResponse) => {
          if (!(req.url ?? '').includes('/events')) {
            res.writeHead(404);
            res.end();
            return;
          }
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          let seq = 0;
          for (const token of tokens) {
            seq += 1;
            res.write(`id: ${seq}\nevent: token\ndata: ${JSON.stringify({ token })}\n\n`);
          }
          seq += 1;
          res.write(
            `id: ${seq}\nevent: terminal\ndata: ${JSON.stringify({
              status: 'completed',
              text: finalText,
            })}\n\n`
          );
          res.end();
        };
        await new Promise<void>((resolveListen, rejectListen) => {
          server = createServer(onReq);
          server.once('error', rejectListen);
          server.listen(0, '127.0.0.1', () => resolveListen());
        });
        const addr = server?.address();
        if (!addr || typeof addr === 'string') throw new Error('healthy SSE bind failed');
        const baseUrl = `http://127.0.0.1:${addr.port}`;

        const controller = createResumableSseController({
          platformUrl: baseUrl,
          apiKey: API_KEY,
          disableStatusPollFallback: true,
          reconnectDelayMs: 50,
        });
        try {
          controller.connect({ runId: RUN_ID, durableMessageId: DURABLE_ID });
          await waitFor(() => controller.getSnapshot().phase === 'complete', {
            timeoutMs: 8000,
            label: 'healthy stream → complete',
          });
          const snap = controller.getSnapshot();
          expect(snap.phase).toBe('complete');
          expect(snap.streamedText).toContain('Healthy');
          expect(snap.streamedText.length).toBeGreaterThanOrEqual(10);
          expect(snap.degradedMessage).toBeNull();
          expect(snap.deadlineFireCount).toBe(0);
          expect(snap.error).toBeNull();
        } finally {
          controller.dispose();
          await new Promise<void>((r) => server?.close(() => r()));
        }
      },
      15_000
    );
  });

  describe('AC-5 / TC-8 — ios ontimeout and android status-0 converge', () => {
    it('ios ontimeout and android status-0 converge', () => {
      const ios = applyChatNetworkDeadlineFailure({
        phase: 'streaming',
        reason: 'ontimeout',
      });
      const android = applyFleetFailureEnvelope({
        phase: 'streaming',
        code: CHAT_NETWORK_DEADLINE_CODE,
        error: 'SSE network error',
        message: SURFACE_UNAVAILABLE_MESSAGE,
        status: '0',
        text: SURFACE_UNAVAILABLE_MESSAGE,
      });
      // Status-0 alone is not enough; code/message carry CHAT_NETWORK_DEADLINE.
      const androidViaHelper = applyChatNetworkDeadlineFailure({
        phase: 'streaming',
        reason: 'status-0',
      });
      expect(ios).toEqual(androidViaHelper);
      expect(ios.phase).toBe('degraded');
      expect(ios.isDegraded).toBe(true);
      expect(ios.message).toBe(SURFACE_MSG);
      expect(android.phase).toBe('degraded');
      expect(android.isDegraded).toBe(true);
      expect(android.message).toBe(SURFACE_MSG);
      expect(ios).toEqual({
        phase: android.phase,
        message: android.message,
        isDegraded: android.isDegraded,
      });
    });

    itLive(
      'hard-down origin status-0 lands in degraded via live XHR transport',
      async () => {
        // Connection refused: free port with no listener → XHR onerror status===0
        // routes through the same transport-deadline handler as iOS ontimeout.
        const deadPort = await freePort();
        const controller = createResumableSseController({
          platformUrl: `http://127.0.0.1:${deadPort}`,
          apiKey: API_KEY,
          disableStatusPollFallback: true,
          reconnectDelayMs: 30,
        });
        try {
          controller.connect({ runId: RUN_ID, durableMessageId: DURABLE_ID });
          await waitFor(() => controller.getSnapshot().phase === 'degraded', {
            timeoutMs: 10_000,
            label: 'hard-down → degraded',
          });
          const snap = controller.getSnapshot();
          expect(snap.phase).toBe('degraded');
          expect(snap.degradedMessage).toBe(SURFACE_MSG);
          expect(snap.deadlineFireCount).toBeGreaterThanOrEqual(1);
          // Composer unlock equivalent: stream is not active on degraded.
          expect(snap.isActive).toBe(false);
        } finally {
          controller.dispose();
        }
      },
      15_000
    );

    itLive(
      'hard-down create POST fails at connect and reduces to degraded envelope',
      async () => {
        const deadPort = await freePort();
        const deadUrl = `http://127.0.0.1:${deadPort}/api/chat-runs`;
        const t0 = Date.now();
        let threw: Error | null = null;
        try {
          await fetchWithChatDeadline(deadUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ requestId: 's31-fe-01-hard-down', msg: 'ping' }),
            // Short deadline so a black-hole port still settles; refused usually fails faster.
            deadlineMs: 800,
          });
        } catch (err) {
          threw = err instanceof Error ? err : new Error(String(err));
        }
        const ms = Date.now() - t0;
        expect(threw).not.toBeNull();
        expect(ms).toBeLessThanOrEqual(1300);
        // Production throw shape alone — no force-apply fallback.
        expect(threw).toBeInstanceOf(ChatNetworkDeadlineError);
        expect((threw as ChatNetworkDeadlineError).code).toBe(CHAT_NETWORK_DEADLINE_CODE);
        expect(isChatNetworkHardDownFailure(threw)).toBe(true);
        expect(
          isFleetUnavailableFailure({
            error: threw?.message,
            message: threw?.message,
            code: (threw as ChatNetworkDeadlineError).code,
          })
        ).toBe(true);
        // Pure reducer on the production throw shape (same path as chat screen catch).
        const fleet = applyFleetFailureEnvelope({
          phase: 'streaming',
          error: threw?.message,
          message: threw?.message,
          code: (threw as ChatNetworkDeadlineError).code,
        });
        expect(fleet.isDegraded).toBe(true);
        expect(fleet.phase).toBe('degraded');
        expect(fleet.message).toBe(SURFACE_MSG);
      },
      10_000
    );

    itLive(
      'hard-down create POST lands controller in degraded without manual reducer injection',
      async () => {
        // Production create path: fetchWithChatDeadline → catch → enterDegradedFromEnvelope
        // (mirrors app/(drawer)/chat/[conversationId].tsx). No applyChatNetworkDeadlineFailure
        // injection in the test body.
        const deadPort = await freePort();
        const controller = createResumableSseController({
          platformUrl: `http://127.0.0.1:${deadPort}`,
          apiKey: API_KEY,
          disableStatusPollFallback: true,
          reconnectDelayMs: 30,
        });
        try {
          let threw: Error | null = null;
          try {
            await fetchWithChatDeadline(`http://127.0.0.1:${deadPort}/api/chat-runs`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ requestId: 's31-fe-01-create-hard-down', msg: 'ping' }),
              deadlineMs: 800,
            });
          } catch (err) {
            threw = err instanceof Error ? err : new Error(String(err));
            const errCode =
              err && typeof err === 'object' && 'code' in err
                ? String((err as { code?: unknown }).code ?? '')
                : '';
            const envelope = {
              error: threw.message,
              message: threw.message,
              code: errCode || undefined,
            };
            // Same gate as production chat screen catch.
            expect(isFleetUnavailableFailure(envelope)).toBe(true);
            const entered = controller.enterDegradedFromEnvelope(envelope);
            expect(entered).toBe(true);
          }
          expect(threw).toBeInstanceOf(ChatNetworkDeadlineError);

          const snap = controller.getSnapshot();
          expect(snap.phase).toBe('degraded');
          expect(snap.degradedMessage).toBe(SURFACE_MSG);
          // Composer unlock / agentBusy false equivalent.
          expect(snap.isActive).toBe(false);
        } finally {
          controller.dispose();
        }
      },
      10_000
    );

    it('raw hard-down throw shapes match isFleetUnavailableFailure without deadline wrap', () => {
      // RN / Node raw signatures must reduce even if a call site bypasses fetchWithChatDeadline.
      expect(isFleetUnavailableFailure({ error: 'Network request failed' })).toBe(true);
      expect(isFleetUnavailableFailure({ error: 'fetch failed' })).toBe(true);
      expect(
        isFleetUnavailableFailure({
          error: 'TypeError: Failed to fetch',
          message: 'Failed to fetch',
        })
      ).toBe(true);
      expect(
        isFleetUnavailableFailure({
          error: 'connect ECONNREFUSED 127.0.0.1:59999',
        })
      ).toBe(true);
      expect(isChatNetworkHardDownFailure(new TypeError('Network request failed'))).toBe(true);
      expect(isChatNetworkHardDownFailure(new Error('fetch failed'))).toBe(true);
    });
  });

  describe('AC-3 — keepalive rearms idle watchdog', () => {
    itLive(
      'keepalive rearms idle watchdog',
      async () => {
        CHAT_NETWORK_DEADLINES.sseIdleDeadlineMs = 1500;
        CHAT_NETWORK_DEADLINES.sseFirstByteDeadlineMs = 10_000;
        CHAT_NETWORK_DEADLINES.reconnectMaxAttempts = 3;

        const server = await startStallServer('keepalive', [
          '--keepalive-interval-ms',
          '500',
          '--token-after-ms',
          '4200',
        ]);
        const controller = createResumableSseController({
          platformUrl: server.baseUrl,
          apiKey: API_KEY,
          disableStatusPollFallback: true,
          reconnectDelayMs: 50,
        });

        try {
          controller.connect({ runId: RUN_ID, durableMessageId: DURABLE_ID });

          // At t≈4000ms (2x idle window of 1500) stream must still be live.
          await sleep(4000);
          const mid = controller.getSnapshot();
          expect(mid.phase).toBe('streaming');
          expect(mid.error).toBeNull();

          await waitFor(() => controller.getSnapshot().streamedText.includes('late'), {
            timeoutMs: 5000,
            label: 'late token applied',
          });
          const after = controller.getSnapshot();
          expect(after.streamedText).toContain('late');
          expect(after.lastSeq).toBeGreaterThanOrEqual(1);
          expect(after.phase === 'streaming' || after.phase === 'complete').toBe(true);
        } finally {
          controller.dispose();
          server.stop();
        }
      },
      20_000
    );
  });

  describe('AC-4 — reconnect cap terminates', () => {
    itLive(
      'reconnect cap terminates',
      async () => {
        const maxAttempts = CHAT_NETWORK_DEADLINES.reconnectMaxAttempts;
        expect(maxAttempts).toBeGreaterThanOrEqual(1);

        const server = await startStallServer('drop-after-headers');
        const controller = createResumableSseController({
          platformUrl: server.baseUrl,
          apiKey: API_KEY,
          disableStatusPollFallback: true,
          reconnectDelayMs: 50,
        });

        try {
          controller.connect({ runId: RUN_ID, durableMessageId: DURABLE_ID });

          await waitFor(() => controller.getSnapshot().phase === 'degraded', {
            timeoutMs: 15_000,
            label: 'phase degraded after reconnect cap',
          });

          const snap = controller.getSnapshot();
          expect(snap.phase).toBe('degraded');
          expect(snap.degradedMessage).toBe(SURFACE_MSG);

          const first = await readConnectionCounter(server.baseUrl);
          expect(first).toBe(maxAttempts);

          // Wait 3x reconnect delay — counter must not rise (no further attempts).
          await sleep(50 * 3 + 200);
          const second = await readConnectionCounter(server.baseUrl);
          expect(second).toBe(first);
          expect(controller.getSnapshot().phase).toBe('degraded');
          expect(controller.getSnapshot().phase).not.toBe('reconnecting' as ChatStreamPhase);
        } finally {
          controller.dispose();
          server.stop();
        }
      },
      25_000
    );
  });

  describe('AC-6 — shared deadline constants on all six chat-path calls', () => {
    itLive(
      'all chat-path calls honour the shared deadline constants',
      async () => {
        CHAT_NETWORK_DEADLINES.httpRequestDeadlineMs = 800;
        CHAT_NETWORK_DEADLINES.sseFirstByteDeadlineMs = 800;
        CHAT_NETWORK_DEADLINES.sseIdleDeadlineMs = 800;

        const server = await startStallServer('stall');
        const base = server.baseUrl.replace(/\/$/, '');
        const headers = {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        };

        const settle = async (label: string, fn: () => Promise<void>): Promise<number> => {
          const t0 = Date.now();
          await fn();
          const ms = Date.now() - t0;
          expect(ms, label).toBeLessThanOrEqual(1300);
          return ms;
        };

        const times: number[] = [];
        try {
          // 1) run-create POST
          times.push(
            await settle('run-create POST', async () => {
              await expect(
                fetchWithChatDeadline(`${base}/api/chat-runs`, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({ requestId: 's31-fe-01', msg: 'ping' }),
                })
              ).rejects.toMatchObject({ code: CHAT_NETWORK_DEADLINE_CODE });
              const fleet = applyChatNetworkDeadlineFailure({ phase: 'streaming' });
              expect(fleet.isDegraded).toBe(true);
            })
          );

          // 2) finalText hydrate GET
          times.push(
            await settle('finalText hydrate GET', async () => {
              await expect(
                fetchWithChatDeadline(`${base}/api/chat-runs/${RUN_ID}`, { headers })
              ).rejects.toMatchObject({ code: CHAT_NETWORK_DEADLINE_CODE });
              expect(applyChatNetworkDeadlineFailure({ phase: 'complete' }).isDegraded).toBe(true);
            })
          );

          // 3) status-poll GET
          times.push(
            await settle('status-poll GET', async () => {
              await expect(
                fetchWithChatDeadline(`${base}/api/chat-runs/${RUN_ID}`, { headers })
              ).rejects.toMatchObject({ code: CHAT_NETWORK_DEADLINE_CODE });
              expect(applyChatNetworkDeadlineFailure({ phase: 'reconnecting' }).isDegraded).toBe(
                true
              );
            })
          );

          // 4 + 5) both resume/hydrate fetches (same helper, two invocations)
          times.push(
            await settle('resume hydrate A', async () => {
              await expect(
                fetchWithChatDeadline(`${base}/api/chat-runs/${RUN_ID}`, { headers })
              ).rejects.toMatchObject({ code: CHAT_NETWORK_DEADLINE_CODE });
              expect(applyChatNetworkDeadlineFailure({ phase: 'streaming' }).isDegraded).toBe(true);
            })
          );
          times.push(
            await settle('resume hydrate B', async () => {
              await expect(
                fetchWithChatDeadline(`${base}/api/chat-runs/${RUN_ID}`, { headers })
              ).rejects.toMatchObject({ code: CHAT_NETWORK_DEADLINE_CODE });
              expect(applyChatNetworkDeadlineFailure({ phase: 'streaming' }).isDegraded).toBe(true);
            })
          );

          // 6) cancel POST
          times.push(
            await settle('cancel POST', async () => {
              await expect(
                fetchWithChatDeadline(`${base}/api/chat-runs/${RUN_ID}/cancel`, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({}),
                })
              ).rejects.toMatchObject({ code: CHAT_NETWORK_DEADLINE_CODE });
              expect(applyChatNetworkDeadlineFailure({ phase: 'streaming' }).isDegraded).toBe(true);
            })
          );

          expect(times).toHaveLength(6);
          for (const ms of times) {
            expect(ms).toBeLessThanOrEqual(1300);
          }

          // Source: no numeric timeout literals at the six call sites (helper only).
          const hook = readFileSync(HOOK_PATH, 'utf8');
          const screen = readFileSync(CHAT_SCREEN_PATH, 'utf8');
          // Ban AbortSignal.timeout(N) or setTimeout(..., NNN) at call sites — deadlines come from the block.
          const callSiteChunks = [
            ...hook.split('fetchWithChatDeadline'),
            ...screen.split('fetchWithChatDeadline'),
          ].slice(1);
          for (const chunk of callSiteChunks.slice(0, 8)) {
            const head = chunk.slice(0, 280);
            expect(head).not.toMatch(/timeout\s*:\s*\d{2,}/);
            expect(head).not.toMatch(/AbortSignal\.timeout\(\s*\d+/);
          }
        } finally {
          server.stop();
        }
      },
      30_000
    );
  });

  describe('AC-2 first-byte stall (controller + composer unlock)', () => {
    itLive(
      'accept-then-stall first-byte deadline lands in degraded',
      async () => {
        CHAT_NETWORK_DEADLINES.sseFirstByteDeadlineMs = 800;
        CHAT_NETWORK_DEADLINES.sseIdleDeadlineMs = 10_000;
        CHAT_NETWORK_DEADLINES.reconnectMaxAttempts = 2;

        const server = await startStallServer('stall');
        // Wire platformUrl exactly as the Maestro harness must for AC-2 (stall origin).
        const platformUrl = server.baseUrl;
        expect(platformUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

        const controller = createResumableSseController({
          platformUrl,
          apiKey: API_KEY,
          disableStatusPollFallback: true,
          reconnectDelayMs: 50,
        });

        try {
          controller.connect({ runId: RUN_ID, durableMessageId: DURABLE_ID });
          await waitFor(() => controller.getSnapshot().phase === 'degraded', {
            timeoutMs: 5000,
            label: 'first-byte stall → degraded',
          });
          const snap = controller.getSnapshot();
          // Banner-equivalent terminal: exact SURFACE copy + degraded phase.
          expect(snap.phase).toBe('degraded');
          expect(snap.degradedMessage).toBe(SURFACE_MSG);
          expect(snap.deadlineFireCount).toBeGreaterThanOrEqual(1);
          // Composer re-enable: isActive false clears agent-busy latch paths.
          expect(snap.isActive).toBe(false);
          // No reconnect loop after first-byte terminal.
          expect(snap.phase).not.toBe('reconnecting');
          expect(snap.phase).not.toBe('streaming');
        } finally {
          controller.dispose();
          server.stop();
        }
      },
      15_000
    );
  });
});
