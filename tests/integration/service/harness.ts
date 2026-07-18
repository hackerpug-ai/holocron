/**
 * service-4 integration harness — boots the REAL Mastra platform service
 * as a Bun subprocess (no mocks of Hono / Postgres / fleet / middleware).
 *
 * Prefer spawning `bun services/platform/src/index.ts` with env keys and an
 * ephemeral PORT so parallel suites do not collide on :4111.
 *
 * Run suite:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test \
 *     pnpm vitest run tests/integration/service/
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

export const REPO_ROOT = resolve(import.meta.dirname, '../../..');
export const SERVICE_ENTRY = resolve(REPO_ROOT, 'services/platform/src/index.ts');
export const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
export const BUN_BIN = process.env.BUN_BIN ?? 'bun';

export const DEFAULT_KEYS = {
  rn: process.env.HOLO_KEY_RN ?? process.env.RN_API_KEY ?? 'rn-test',
  mcp: process.env.HOLO_KEY_MCP ?? process.env.MCP_API_KEY ?? 'mcp-test',
  control: process.env.HOLO_KEY_CONTROL ?? process.env.CONTROL_API_KEY ?? 'ctl-test',
} as const;

export const DEFAULT_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';

function buildNonprodRuntimeEnv(overrides?: Record<string, string>) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...overrides,
  };
  delete env.DATABASE_URL_OWNER;
  return env;
}

/** Gate: live platform integration tests require PLATFORM_IT=1. */
export const PLATFORM_IT = process.env.PLATFORM_IT === '1';

export type LiveService = {
  baseUrl: string;
  port: number;
  pid: number | undefined;
  stdout: string;
  stderr: string;
  stop: () => Promise<void>;
};

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        srv.close();
        reject(new Error('failed to bind ephemeral port'));
        return;
      }
      const port = addr.port;
      srv.close((err) => (err ? reject(err) : resolvePort(port)));
    });
  });
}

async function waitForHealth(baseUrl: string, timeoutMs = 20_000): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      // Any HTTP response means the server accepted the connection.
      return res;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(
    `service did not become ready at ${baseUrl}/health within ${timeoutMs}ms: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`
  );
}

/**
 * Spawn the real composition root and wait until /health responds.
 * Keys + DATABASE_URL are injected into the child env (middleware loads from env).
 */
export async function startLiveService(options?: {
  port?: number;
  keys?: Partial<typeof DEFAULT_KEYS>;
  databaseUrl?: string;
  extraEnv?: Record<string, string>;
  readyTimeoutMs?: number;
}): Promise<LiveService> {
  const port = options?.port ?? (await freePort());
  const keys = { ...DEFAULT_KEYS, ...options?.keys };
  const databaseUrl = options?.databaseUrl ?? DEFAULT_DATABASE_URL;

  let stdout = '';
  let stderr = '';

  const child: ChildProcess = spawn(BUN_BIN, [SERVICE_ENTRY], {
    cwd: REPO_ROOT,
    env: buildNonprodRuntimeEnv({
      PORT: String(port),
      HOLO_PORT: String(port),
      DATABASE_URL: databaseUrl,
      HOLO_KEY_RN: keys.rn,
      HOLO_KEY_MCP: keys.mcp,
      HOLO_KEY_CONTROL: keys.control,
      RN_API_KEY: keys.rn,
      MCP_API_KEY: keys.mcp,
      CONTROL_API_KEY: keys.control,
      ...options?.extraEnv,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (buf: Buffer) => {
    stdout += buf.toString('utf8');
  });
  child.stderr?.on('data', (buf: Buffer) => {
    stderr += buf.toString('utf8');
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  let exited = false;
  let exitCode: number | null = null;
  child.on('exit', (code) => {
    exited = true;
    exitCode = code;
  });

  try {
    await waitForHealth(baseUrl, options?.readyTimeoutMs ?? 20_000);
  } catch (err) {
    if (!exited) {
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 200));
      if (!exited) child.kill('SIGKILL');
    }
    throw new Error(
      `failed to start live service on :${port}\nexit=${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}\ncause: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const stop = async () => {
    if (exited) return;
    child.kill('SIGTERM');
    const deadline = Date.now() + 3_000;
    while (!exited && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!exited) child.kill('SIGKILL');
  };

  return {
    baseUrl,
    port,
    pid: child.pid,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
    stop,
  };
}

export function bearer(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}` };
}

/** Narrow optional service handle after PLATFORM_IT beforeAll. */
export function requireService(svc: LiveService | undefined): LiveService {
  if (!svc) {
    throw new Error('live service was not started (set PLATFORM_IT=1 and ensure boot succeeded)');
  }
  return svc;
}

export async function httpJson(
  baseUrl: string,
  method: string,
  path: string,
  options?: { key?: string; body?: string }
): Promise<{ status: number; body: unknown; text: string }> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
    ...(options?.key ? bearer(options.key) : {}),
  };
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : (options?.body ?? '{}'),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text
  }
  return { status: res.status, body, text };
}

/** Run holo CLI as a real Bun subprocess (registry / identity gates). */
export function runHolo(args: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: buildNonprodRuntimeEnv({ DATABASE_URL: DEFAULT_DATABASE_URL }),
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}
