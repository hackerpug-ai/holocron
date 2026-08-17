/**
 * S33-MCP-01 RED-first integration contract.
 *
 * This suite intentionally exercises the real Postgres database, the real
 * Hono Streamable HTTP gateway, and the real holo mcp:stdio child.  It is
 * live-only by contract: run with PLATFORM_IT=1 and an explicit
 * holocron_nonprod DATABASE_URL.
 */
import { type ChildProcess, type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql, type Sql } from '../../src/db/client';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const itLive = it;
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const TEST_TMP_ROOT = resolve(REPO_ROOT, '.tmp/S33-MCP-01');
const TEST_TITLE = 'S33-MCP-01 Postgres Plane Proof';
const TEST_CONTENT =
  'sentinel-s33-mcp-01-postgres-content-9f2c the retired plane must not answer this read';
const KEYS = {
  rn: 's33-mcp-01-rn',
  mcp: 's33-mcp-01-mcp',
  control: 's33-mcp-01-control',
};

type McpToolResult = {
  content?: Array<{ type?: string; text?: string }>;
  isError?: boolean;
  structuredContent?: unknown;
};

type McpEnvelope = {
  error?: unknown;
  result?: McpToolResult;
};

type GatewayHandle = {
  baseUrl: string;
  stop: () => Promise<void>;
};

type StdioRun = {
  result: McpToolResult | undefined;
  frames: unknown[];
  parseFailures: string[];
  stderr: string;
};

const gateways: GatewayHandle[] = [];
const temporaryDirectories: string[] = [];
let sql: Sql | undefined;
let normalGateway: GatewayHandle | undefined;
let postgresSecretsPath: string;
let retiredSecretsPath: string;
let seededDocumentId: string | undefined;

function writeEvidence(name: string, value: unknown): void {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  writeFileSync(join(TEST_TMP_ROOT, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makeSecretsFile(plane: 'postgres' | 'convex', target: string): string {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const dir = mkdtempSync(join(TEST_TMP_ROOT, 'secrets-'));
  temporaryDirectories.push(dir);
  const path = join(dir, 'secrets.yaml');
  writeFileSync(
    path,
    [
      'HOLO_MIGRATION_READ_ONLY: "0"',
      `HOLO_DATA_PLANE: ${plane}`,
      `HOLO_ROLLBACK_TARGET: ${target}`,
      '',
    ].join('\n'),
    'utf8'
  );
  return path;
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('failed to bind an ephemeral gateway port'));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

/** Bind and release a real port, then prove a fresh TCP connection is refused. */
async function verifiedClosedPort(): Promise<number> {
  const port = await freePort();
  await new Promise<void>((resolvePort, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      reject(new Error(`port ${port} unexpectedly accepted a connection`));
    });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') resolvePort();
      else reject(error);
    });
  });
  return port;
}

async function startMcpGateway(options: {
  databaseUrl: string;
  secretsPath: string;
}): Promise<GatewayHandle> {
  const port = await freePort();
  const honoPath = resolve(REPO_ROOT, 'services/platform/src/http/hono-app.ts');
  const script = `
import { createHonoApp } from ${JSON.stringify(honoPath)};
const app = createHonoApp({
  keys: {
    rn: ${JSON.stringify(KEYS.rn)},
    mcp: ${JSON.stringify(KEYS.mcp)},
    control: ${JSON.stringify(KEYS.control)},
  },
});
const server = Bun.serve({ port: ${port}, hostname: '127.0.0.1', fetch: app.fetch });
console.error('s33-mcp-01-gateway-ready ' + server.port);
`;
  const child: ChildProcess = spawn('bun', ['-e', script], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: options.databaseUrl,
      HOLO_HARNESS: '1',
      HOLO_KEY_RN: KEYS.rn,
      HOLO_KEY_MCP: KEYS.mcp,
      HOLO_KEY_CONTROL: KEYS.control,
      HOLO_SECRETS_PATH: options.secretsPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString('utf8');
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (
      stderr.includes('s33-mcp-01-gateway-ready') ||
      stdout.includes('s33-mcp-01-gateway-ready')
    ) {
      ready = true;
      break;
    }
    if (child.exitCode !== null) break;
    try {
      const health = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(500) });
      if (health.status >= 200 && health.status < 600) {
        ready = true;
        break;
      }
    } catch {
      // The child is still booting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  if (!ready) {
    child.kill('SIGKILL');
    throw new Error(`S33-MCP-01 gateway failed to start\nstdout=${stdout}\nstderr=${stderr}`);
  }

  const probe = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${KEYS.mcp}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/list', params: {} }),
  });
  if (probe.status !== 200) {
    child.kill('SIGKILL');
    throw new Error(`S33-MCP-01 gateway probe returned ${probe.status}: ${await probe.text()}`);
  }

  let exited = false;
  child.once('exit', () => {
    exited = true;
  });
  const handle: GatewayHandle = {
    baseUrl,
    stop: async () => {
      if (exited) return;
      child.kill('SIGTERM');
      await new Promise<void>((resolveStop) => {
        const deadline = setTimeout(() => {
          if (!exited) {
            child.kill('SIGKILL');
            exited = true;
          }
          resolveStop();
        }, 1_000);
        child.once('exit', () => {
          clearTimeout(deadline);
          resolveStop();
        });
      });
    },
  };
  gateways.push(handle);
  return handle;
}

function asEnvelope(value: unknown): McpEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`MCP response was not an object: ${JSON.stringify(value)}`);
  }
  return value as McpEnvelope;
}

function parseToolPayload(result: McpToolResult | undefined): unknown {
  if (!result) return undefined;
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = result.content?.[0]?.text;
  if (typeof text !== 'string') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function parseErrorPayload(result: McpToolResult | undefined): { code?: string; message?: string } {
  const payload = parseToolPayload(result);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const record = payload as Record<string, unknown>;
  return {
    code: typeof record.code === 'string' ? record.code : undefined,
    message: typeof record.message === 'string' ? record.message : undefined,
  };
}

async function mcpCall(
  baseUrl: string,
  tool: string,
  args: Record<string, unknown>,
  id: number
): Promise<McpEnvelope> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${KEYS.mcp}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: tool, arguments: args },
    }),
  });
  const body = asEnvelope(await response.json());
  return body;
}

async function readResponseLine(
  child: ChildProcessWithoutNullStreams,
  id: number,
  state: {
    buffer: string;
    frames: unknown[];
    parseFailures: string[];
    stderr: string;
  },
  label: string
): Promise<McpEnvelope> {
  return new Promise((resolveResponse, rejectResponse) => {
    const deadline = setTimeout(() => {
      child.stdout.off('data', onData);
      rejectResponse(
        new Error(
          `stdio response timeout for ${label}${state.stderr ? `: ${state.stderr.slice(-2_000)}` : ''}`
        )
      );
    }, 20_000);

    const consume = (): void => {
      while (true) {
        const newline = state.buffer.indexOf('\n');
        if (newline < 0) return;
        const line = state.buffer.slice(0, newline).trim();
        state.buffer = state.buffer.slice(newline + 1);
        if (!line) continue;
        try {
          const parsed = JSON.parse(line) as unknown;
          state.frames.push(parsed);
          if (
            parsed &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed) &&
            (parsed as Record<string, unknown>).id === id
          ) {
            clearTimeout(deadline);
            child.stdout.off('data', onData);
            resolveResponse(asEnvelope(parsed));
            return;
          }
        } catch {
          state.parseFailures.push(line);
        }
      }
    };
    const onData = (chunk: Buffer): void => {
      state.buffer += chunk.toString('utf8');
      consume();
    };
    child.stdout.on('data', onData);
    child.once('error', (error) => {
      clearTimeout(deadline);
      child.stdout.off('data', onData);
      rejectResponse(error);
    });
    consume();
  });
}

async function runStdio(documentId: string, secretsPath: string): Promise<StdioRun> {
  const child = spawn('bun', ['services/platform/src/cli/holo.ts', 'mcp:stdio'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DATABASE_URL,
      HOLO_HARNESS: '1',
      HOLO_KEY_RN: KEYS.rn,
      HOLO_KEY_MCP: KEYS.mcp,
      HOLO_KEY_CONTROL: KEYS.control,
      HOLO_SECRETS_PATH: secretsPath,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const state = { buffer: '', frames: [] as unknown[], parseFailures: [] as string[], stderr: '' };
  child.stderr.on('data', (chunk: Buffer) => {
    state.stderr += chunk.toString('utf8');
  });

  const send = async (payload: Record<string, unknown>, id: number, label: string) => {
    const response = readResponseLine(child, id, state, label);
    child.stdin.write(`${JSON.stringify(payload)}\n`);
    return response;
  };

  let result: McpToolResult | undefined;
  try {
    const initialized = await send(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 's33-mcp-01-red', version: '1' },
        },
      },
      1,
      'initialize'
    );
    expect(initialized.error).toBeUndefined();
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`
    );
    const called = await send(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'get_document', arguments: { documentId } },
      },
      2,
      'get_document'
    );
    result = called.result;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
    if (child.exitCode === null) child.kill('SIGKILL');
    if (state.buffer.trim()) state.parseFailures.push(state.buffer.trim());
  }
  return { result, frames: state.frames, parseFailures: state.parseFailures, stderr: state.stderr };
}

describe('S33-MCP-01 get_document data-plane contract', () => {
  beforeAll(async () => {
    if (!PLATFORM_IT) {
      throw new Error('S33-MCP-01 requires PLATFORM_IT=1 and real holocron_nonprod Postgres');
    }
    if (!DATABASE_URL.includes('holocron_nonprod')) {
      throw new Error('S33-MCP-01 requires DATABASE_URL to name holocron_nonprod');
    }
    mkdirSync(TEST_TMP_ROOT, { recursive: true });
    postgresSecretsPath = makeSecretsFile('postgres', 'postgres-soak');
    retiredSecretsPath = makeSecretsFile('convex', 'convex-frozen');
    sql = createSql(DATABASE_URL);
    await sql`SELECT pg_advisory_lock(330001)`;
    await sql`DELETE FROM documents WHERE title = ${TEST_TITLE}`;
    normalGateway = await startMcpGateway({
      databaseUrl: DATABASE_URL,
      secretsPath: postgresSecretsPath,
    });
  }, 60_000);

  afterAll(async () => {
    for (const gateway of gateways.reverse()) await gateway.stop();
    if (sql) {
      try {
        await sql`DELETE FROM documents WHERE title = ${TEST_TITLE}`;
        await sql`SELECT pg_advisory_unlock(330001)`;
      } finally {
        await sql.end({ timeout: 5 });
      }
    }
    for (const directory of temporaryDirectories)
      rmSync(directory, { recursive: true, force: true });
  });

  itLive(
    'AC-1: returns seeded Postgres content and literal null for an absent UUID over Streamable HTTP',
    async () => {
      if (!sql || !normalGateway) throw new Error('S33-MCP-01 live setup was not initialized');
      const seeded = await mcpCall(
        normalGateway.baseUrl,
        'store_document',
        { title: TEST_TITLE, content: TEST_CONTENT },
        330101
      );
      const seededPayload = parseToolPayload(seeded.result);
      if (!seededPayload || typeof seededPayload !== 'object' || Array.isArray(seededPayload)) {
        throw new Error(
          `store_document did not return a document payload: ${JSON.stringify(seeded)}`
        );
      }
      const returnedId = (seededPayload as Record<string, unknown>).documentId;
      if (typeof returnedId !== 'string') {
        throw new Error(`store_document omitted documentId: ${JSON.stringify(seededPayload)}`);
      }
      seededDocumentId = returnedId;
      const seededRows =
        await sql`SELECT count(*)::int AS count FROM documents WHERE id = ${returnedId}::uuid`;
      const absentId = crypto.randomUUID();
      const absentRows =
        await sql`SELECT count(*)::int AS count FROM documents WHERE id = ${absentId}::uuid`;
      const read = await mcpCall(
        normalGateway.baseUrl,
        'get_document',
        { documentId: returnedId },
        330102
      );
      const absent = await mcpCall(
        normalGateway.baseUrl,
        'get_document',
        { documentId: absentId },
        330103
      );
      writeEvidence('red-ac-1-http.json', {
        seeded,
        seededRows,
        read,
        absentId,
        absentRows,
        absent,
      });

      expect(seeded.result?.isError).not.toBe(true);
      expect(seededRows[0]?.count).toBe(1);
      expect(absentRows[0]?.count).toBe(0);
      expect(read.error).toBeUndefined();
      expect(read.result?.isError ?? false).toBe(false);
      const payload = read.result?.structuredContent;
      expect(payload).toEqual(
        expect.objectContaining({
          documentId: returnedId,
          title: TEST_TITLE,
          content: TEST_CONTENT,
          data_plane: 'postgres',
          source: 'postgres',
        })
      );
      expect(payload && typeof payload === 'object' ? Object.keys(payload) : []).toEqual(
        expect.arrayContaining([
          'documentId',
          'title',
          'content',
          'status',
          'isPublic',
          'shareToken',
          'date',
          'createdAt',
          'data_plane',
          'source',
        ])
      );
      expect(absent.error).toBeUndefined();
      expect(absent.result?.isError ?? false).toBe(false);
      expect(absent.result?.content?.[0]?.text).toBe('null');
      expect(absent.result?.content).toHaveLength(1);
    },
    60_000
  );

  itLive(
    'AC-2: names the retired cloud plane over MCP and matches the HTTP 410 response',
    async () => {
      if (!seededDocumentId) throw new Error('AC-1 did not seed a documentId');
      const gateway = await startMcpGateway({
        databaseUrl: DATABASE_URL,
        secretsPath: retiredSecretsPath,
      });
      const httpResponse = await fetch(
        `${gateway.baseUrl}/api/documents/${encodeURIComponent(seededDocumentId)}`,
        { headers: { authorization: `Bearer ${KEYS.rn}` } }
      );
      const httpBody = (await httpResponse.json()) as unknown;
      const mcp = await mcpCall(
        gateway.baseUrl,
        'get_document',
        { documentId: seededDocumentId },
        330201
      );
      const mcpError = parseErrorPayload(mcp.result);
      writeEvidence('red-ac-2-retired-plane.json', {
        http: { status: httpResponse.status, body: httpBody },
        mcp,
        mcpError,
        secretsPath: retiredSecretsPath,
      });
      await gateway.stop();

      expect(httpResponse.status).toBe(410);
      expect(JSON.stringify(httpBody)).toContain('retired_cloud_plane_removed_d08_02');
      expect(mcp.error).toBeUndefined();
      expect(mcp.result?.isError).toBe(true);
      expect(mcpError.code).toBe('RETIRED_DATA_PLANE');
      expect(mcpError.message).toContain('retired_cloud_plane_removed_d08_02');
      expect(mcpError.message).toContain('data_plane=convex');
      expect(mcp.result?.content?.[0]?.text).not.toBe('null');
    },
    60_000
  );

  itLive(
    'AC-3: keeps stdio byte frames valid and equivalent to HTTP for postgres and retired planes',
    async () => {
      if (!seededDocumentId || !normalGateway) throw new Error('AC-1 did not seed a documentId');
      const http = await mcpCall(
        normalGateway.baseUrl,
        'get_document',
        { documentId: seededDocumentId },
        330301
      );
      const postgresStdio = await runStdio(seededDocumentId, postgresSecretsPath);
      const retiredStdio = await runStdio(seededDocumentId, retiredSecretsPath);
      const retiredError = parseErrorPayload(retiredStdio.result);
      writeEvidence('red-ac-3-stdio.json', {
        http,
        postgresStdio,
        retiredStdio,
        retiredError,
      });

      expect(postgresStdio.parseFailures).toEqual([]);
      expect(retiredStdio.parseFailures).toEqual([]);
      const frames = [...postgresStdio.frames, ...retiredStdio.frames];
      expect(frames.length).toBeGreaterThanOrEqual(2);
      for (const frame of frames) {
        expect(frame).toEqual(expect.objectContaining({ jsonrpc: '2.0' }));
      }
      expect(postgresStdio.result?.isError ?? false).toBe(false);
      expect(postgresStdio.result?.structuredContent).toEqual(http.result?.structuredContent);
      expect(retiredStdio.result?.isError).toBe(true);
      expect(retiredError.code).toBe('RETIRED_DATA_PLANE');
      expect(retiredError.message).toContain('retired_cloud_plane_removed_d08_02');
      expect(retiredStdio.result?.content?.[0]?.text).not.toBe('null');
    },
    120_000
  );

  itLive(
    'AC-4: returns DATA_PLANE_READ_FAILED when the Postgres TCP port is really closed',
    async () => {
      const closedPort = await verifiedClosedPort();
      const unreachableGateway = await startMcpGateway({
        databaseUrl: `postgres://127.0.0.1:${closedPort}/holocron_nonprod`,
        secretsPath: postgresSecretsPath,
      });
      const mcp = await mcpCall(
        unreachableGateway.baseUrl,
        'get_document',
        { documentId: crypto.randomUUID() },
        330401
      );
      const mcpError = parseErrorPayload(mcp.result);
      writeEvidence('red-ac-4-unreachable-postgres.json', {
        closedPort,
        mcp,
        mcpError,
      });
      await unreachableGateway.stop();

      expect(mcp.error).toBeUndefined();
      expect(mcp.result?.isError).toBe(true);
      expect(mcpError.code).toBe('DATA_PLANE_READ_FAILED');
      expect(mcpError.message).toContain('postgres_document_read_failed');
      expect(mcp.result?.content?.[0]?.text).not.toBe('null');
    },
    60_000
  );
});
