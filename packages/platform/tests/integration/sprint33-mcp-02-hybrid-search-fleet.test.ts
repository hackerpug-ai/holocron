/**
 * S33-MCP-02 RED-first integration contract.
 *
 * This suite intentionally drives the real Postgres/pgvector corpus, the real
 * fleet embed role, Hono Streamable HTTP, and the real mcp:stdio child. It is
 * fail-closed: PLATFORM_IT must be explicitly enabled rather than turning a
 * missing live dependency into a skipped green test.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client';
import { embed } from '../../src/inference/embed';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const FLEET_URL = process.env.FLEET_URL ?? 'http://127.0.0.1:4545';
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S33-MCP-02');
const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const KEY_PREFIX = ['s33', 'mcp', '02'].join('-');
const KEYS = {
  rn: `${KEY_PREFIX}-rn`,
  mcp: `${KEY_PREFIX}-mcp`,
  control: `${KEY_PREFIX}-control`,
} as const;

const SEMANTIC_CONTENT_HASH = 's33_mcp02_semantic_corpus';
const SEMANTIC_TITLE = 'S33-MCP-02 Fleet Retrieval Proof';
const SEMANTIC_PASSAGE =
  'The escape hatch engages whenever the on-premises token generator stops answering during a scheduled service window.';
const SEMANTIC_QUERY = 'what occurs if the local LLM box quits replying while being patched';
const LEXICAL_TITLE = 'S33-MCP-02 Lexical Anchor';
const LEXICAL_CONTENT = 'zylophonequux is the distinctive lexical anchor token for S33-MCP-02';

type McpToolResult = {
  content?: Array<{ type?: string; text?: string }>;
  isError?: boolean;
  structuredContent?: unknown;
};

type McpEnvelope = { error?: unknown; result?: McpToolResult };

type GatewayHandle = { baseUrl: string; stop: () => Promise<void> };

type StdioRun = {
  result: McpToolResult | undefined;
  frames: Array<Record<string, unknown>>;
  parseFailures: string[];
  stderr: string;
};

type FrameParseResult = { ok: true; frame: Record<string, unknown> } | { ok: false; error: string };

type InspectorRun = {
  command: string;
  args: string[];
  environmentSource: string;
  environmentNames: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
};

let sql: Sql | undefined;
let liveGateway: GatewayHandle | undefined;
let closedGateway: GatewayHandle | undefined;
let closedFleetUrl: string;
let secretsPath: string;
const temporaryDirectories: string[] = [];

function writeEvidence(name: string, value: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(join(EVIDENCE_DIR, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
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

function asEnvelope(value: unknown): McpEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`MCP response was not an object: ${JSON.stringify(value)}`);
  }
  return value as McpEnvelope;
}

function parseJsonRpcStdoutFrame(line: string): FrameParseResult {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      (parsed as Record<string, unknown>).jsonrpc !== '2.0'
    ) {
      return { ok: false, error: `stdout frame is not JSON-RPC 2.0: ${line}` };
    }
    return { ok: true, frame: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: `stdout frame is not valid JSON: ${line}` };
  }
}

function isJsonRpcFrame(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).jsonrpc === '2.0'
  );
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
        reject(new Error('failed to bind ephemeral port'));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

/** Bind and release a real port, then prove it rejects a fresh TCP connect. */
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

function makeSecretsPath(): string {
  const directory = mkdtempSync(join(EVIDENCE_DIR, 'secrets-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'secrets.yaml');
  writeFileSync(
    path,
    [
      'HOLO_MIGRATION_READ_ONLY: "0"',
      'HOLO_DATA_PLANE: postgres',
      'HOLO_ROLLBACK_TARGET: postgres',
      '',
    ].join('\n'),
    'utf8'
  );
  return path;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function makeInspectorConfig(fleetUrl: string): { configPath: string; environmentNames: string[] } {
  const directory = mkdtempSync(join(EVIDENCE_DIR, 'inspector-'));
  temporaryDirectories.push(directory);
  const environmentNames = [
    'DATABASE_URL',
    'FLEET_URL',
    'HOLO_HARNESS',
    'HOLO_KEY_RN',
    'HOLO_KEY_MCP',
    'HOLO_KEY_CONTROL',
    'HOLO_SECRETS_PATH',
  ];
  const environmentFile = join(directory, 'runtime.env');
  writeFileSync(
    environmentFile,
    environmentNames
      .map((name) => {
        const values: Record<string, string> = {
          DATABASE_URL,
          FLEET_URL: fleetUrl,
          HOLO_HARNESS: '1',
          HOLO_KEY_RN: KEYS.rn,
          HOLO_KEY_MCP: KEYS.mcp,
          HOLO_KEY_CONTROL: KEYS.control,
          HOLO_SECRETS_PATH: secretsPath,
        };
        return `${name}=${shellQuote(values[name] ?? '')}`;
      })
      .join('\n') + '\n',
    { encoding: 'utf8', mode: 0o600 }
  );
  const serverArgs = [
    '-c',
    `set -a; . ${shellQuote(environmentFile)}; exec bun ${shellQuote(
      resolve(REPO_ROOT, 'packages/platform/src/cli/holo.ts')
    )} mcp:stdio`,
  ];
  const configPath = join(directory, 'mcp.json');
  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        mcpServers: {
          's33-mcp-02': {
            type: 'stdio',
            command: 'sh',
            args: serverArgs,
            cwd: REPO_ROOT,
          },
        },
      },
      null,
      2
    )}\n`,
    { encoding: 'utf8', mode: 0o600 }
  );
  return { configPath, environmentNames };
}

async function startGateway(fleetUrl: string): Promise<GatewayHandle> {
  const port = await freePort();
  const honoPath = resolve(REPO_ROOT, 'packages/platform/src/http/hono-app.ts');
  const script = `
import { createHonoApp } from ${JSON.stringify(honoPath)};
const app = createHonoApp({ keys: ${JSON.stringify(KEYS)} });
const server = Bun.serve({ port: ${port}, hostname: '127.0.0.1', fetch: app.fetch });
console.error('s33-mcp-02-gateway-ready ' + server.port);
`;
  const child: ChildProcess = spawn('bun', ['-e', script], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DATABASE_URL,
      FLEET_URL: fleetUrl,
      HOLO_HARNESS: '1',
      HOLO_KEY_RN: KEYS.rn,
      HOLO_KEY_MCP: KEYS.mcp,
      HOLO_KEY_CONTROL: KEYS.control,
      HOLO_SECRETS_PATH: secretsPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (stderr.includes('s33-mcp-02-gateway-ready')) {
      ready = true;
      break;
    }
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(500) });
      if (response.status >= 200 && response.status < 600) {
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
    throw new Error(`S33-MCP-02 gateway failed to start\nstdout=${stdout}\nstderr=${stderr}`);
  }
  const probe = await mcpCall(baseUrl, 'search_fts', { query: 'probe-no-match' }, 330001);
  if (probe.error) {
    child.kill('SIGKILL');
    throw new Error(`S33-MCP-02 gateway MCP probe failed: ${JSON.stringify(probe)}`);
  }
  let exited = false;
  child.once('exit', () => (exited = true));
  return {
    baseUrl,
    stop: async () => {
      if (exited) return;
      child.kill('SIGTERM');
      await new Promise<void>((resolveStop) => {
        const timeout = setTimeout(() => {
          if (!exited) {
            child.kill('SIGKILL');
            exited = true;
          }
          resolveStop();
        }, 1_000);
        child.once('exit', () => {
          clearTimeout(timeout);
          resolveStop();
        });
      });
    },
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
  return asEnvelope(await response.json());
}

async function runInspector(
  fleetUrl: string,
  method: 'tools/list' | 'tools/call',
  toolArgs?: Record<string, unknown>
): Promise<InspectorRun> {
  const inspectorConfig = makeInspectorConfig(fleetUrl);
  const args = [
    '--yes',
    '@modelcontextprotocol/inspector',
    '--cli',
    '--config',
    inspectorConfig.configPath,
    '--server',
    's33-mcp-02',
    '--format',
    'json',
    '--method',
    method,
  ];
  if (method === 'tools/call') {
    args.push(
      '--tool-name',
      'hybrid_search',
      '--tool-args-json',
      JSON.stringify(toolArgs ?? { query: SEMANTIC_QUERY, limit: 10 })
    );
  }
  const environmentSource = 'task-local temporary Inspector env file; values omitted';
  const command = `npx ${args.join(' ')} (server env: ${environmentSource})`;
  return new Promise((resolveInspector, rejectInspector) => {
    const child = spawn('npx', args, {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        DATABASE_URL,
        FLEET_URL: fleetUrl,
        HOLO_HARNESS: '1',
        HOLO_KEY_RN: KEYS.rn,
        HOLO_KEY_MCP: KEYS.mcp,
        HOLO_KEY_CONTROL: KEYS.control,
        HOLO_SECRETS_PATH: secretsPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
    child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      rejectInspector(new Error(`MCP Inspector timed out: ${command}`));
    }, 60_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      rejectInspector(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      resolveInspector({
        command,
        args,
        environmentSource,
        environmentNames: inspectorConfig.environmentNames,
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function parseInspectorOutput(run: InspectorRun): Record<string, unknown> {
  const lines = run.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const lastLine = lines.at(-1);
  if (!lastLine) throw new Error(`MCP Inspector emitted no stdout JSON: ${run.command}`);
  const parsed = JSON.parse(lastLine) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`MCP Inspector emitted a non-object response: ${run.stdout}`);
  }
  return parsed as Record<string, unknown>;
}

async function readStdioResponse(
  child: ChildProcess,
  id: number,
  state: {
    buffer: string;
    frames: Array<Record<string, unknown>>;
    parseFailures: string[];
    stderr: string;
  },
  label: string
): Promise<McpEnvelope> {
  return new Promise((resolveResponse, rejectResponse) => {
    const deadline = setTimeout(() => {
      child.stdout?.off('data', onData);
      rejectResponse(
        new Error(`stdio response timeout for ${label}: ${state.stderr.slice(-2000)}`)
      );
    }, 30_000);
    const consume = (): void => {
      while (true) {
        const newline = state.buffer.indexOf('\n');
        if (newline < 0) return;
        const line = state.buffer.slice(0, newline).trim();
        state.buffer = state.buffer.slice(newline + 1);
        if (!line) continue;
        const parsed = parseJsonRpcStdoutFrame(line);
        if (!parsed.ok) {
          state.parseFailures.push(parsed.error);
          continue;
        }
        state.frames.push(parsed.frame);
        if (parsed.frame.id === id) {
          clearTimeout(deadline);
          child.stdout?.off('data', onData);
          resolveResponse(asEnvelope(parsed.frame));
          return;
        }
      }
    };
    const onData = (chunk: Buffer): void => {
      state.buffer += chunk.toString('utf8');
      consume();
    };
    child.stdout?.on('data', onData);
    consume();
  });
}

async function runStdio(fleetUrl: string, idBase: number): Promise<StdioRun> {
  const child = spawn('bun', ['packages/platform/src/cli/holo.ts', 'mcp:stdio'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DATABASE_URL,
      FLEET_URL: fleetUrl,
      HOLO_HARNESS: '1',
      HOLO_KEY_RN: KEYS.rn,
      HOLO_KEY_MCP: KEYS.mcp,
      HOLO_KEY_CONTROL: KEYS.control,
      HOLO_SECRETS_PATH: secretsPath,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const state = {
    buffer: '',
    frames: [] as Array<Record<string, unknown>>,
    parseFailures: [] as string[],
    stderr: '',
  };
  child.stderr?.on('data', (chunk: Buffer) => (state.stderr += chunk.toString('utf8')));
  const send = async (payload: Record<string, unknown>, id: number, label: string) => {
    const response = readStdioResponse(child, id, state, label);
    child.stdin?.write(`${JSON.stringify(payload)}\n`);
    return response;
  };
  let result: McpToolResult | undefined;
  try {
    const initialized = await send(
      {
        jsonrpc: '2.0',
        id: idBase,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 's33-mcp-02', version: '1' },
        },
      },
      idBase,
      'initialize'
    );
    if (initialized.error)
      throw new Error(`stdio initialize failed: ${JSON.stringify(initialized)}`);
    child.stdin?.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`
    );
    const called = await send(
      {
        jsonrpc: '2.0',
        id: idBase + 1,
        method: 'tools/call',
        params: { name: 'hybrid_search', arguments: { query: SEMANTIC_QUERY, limit: 10 } },
      },
      idBase + 1,
      'hybrid_search'
    );
    result = called.result;
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
    if (child.exitCode === null) child.kill('SIGKILL');
    if (state.buffer.trim()) state.parseFailures.push(state.buffer.trim());
  }
  return { result, frames: state.frames, parseFailures: state.parseFailures, stderr: state.stderr };
}

describe('S33-MCP-02 hybrid_search fleet-backed retrieval contract', () => {
  beforeAll(async () => {
    if (!PLATFORM_IT) throw new Error('S33-MCP-02 requires PLATFORM_IT=1 and real services');
    if (!DATABASE_URL.includes('holocron_nonprod')) {
      throw new Error('S33-MCP-02 requires DATABASE_URL to name holocron_nonprod');
    }
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    secretsPath = makeSecretsPath();
    sql = createSql(DATABASE_URL);
    await sql`SELECT pg_advisory_lock(330002)`;
    await sql`DELETE FROM passages WHERE source_id IN (SELECT id FROM sources WHERE content_hash = ${SEMANTIC_CONTENT_HASH})`;
    await sql`DELETE FROM sources WHERE content_hash = ${SEMANTIC_CONTENT_HASH}`;
    await sql`DELETE FROM documents WHERE title IN (${SEMANTIC_TITLE}, ${LEXICAL_TITLE})`;

    const sourceRows = await sql<{ id: string }[]>`
      INSERT INTO sources (source_kind, content_hash, title, document_id, metadata_json)
      VALUES ('document', ${SEMANTIC_CONTENT_HASH}, ${SEMANTIC_TITLE}, 's33_mcp02_semantic_document', ${JSON.stringify({ task: 'S33-MCP-02' })}::jsonb)
      RETURNING id::text AS id
    `;
    const sourceId = sourceRows[0]?.id;
    if (!sourceId) throw new Error('failed to seed semantic source');
    const documentVector = await embed(SEMANTIC_PASSAGE, 'document');
    if (documentVector.length !== 1024 || documentVector.every((value) => value === 0)) {
      throw new Error(
        `real document embedding invariant failed: dimension=${documentVector.length}`
      );
    }
    await sql`
      INSERT INTO passages (source_id, document_id, ordinal, text, embedding, metadata_json)
      VALUES (${sourceId}::uuid, 's33_mcp02_semantic_document', 0, ${SEMANTIC_PASSAGE}, ${vectorLiteral(documentVector)}::vector, ${JSON.stringify({ task: 'S33-MCP-02', seeded: true })}::jsonb)
    `;

    closedFleetUrl = `http://127.0.0.1:${await verifiedClosedPort()}`;
    liveGateway = await startGateway(FLEET_URL);
    const lexicalStore = await mcpCall(
      liveGateway.baseUrl,
      'store_document',
      { title: LEXICAL_TITLE, content: LEXICAL_CONTENT },
      330002
    );
    const lexicalPayload = parseToolPayload(lexicalStore.result);
    if (
      lexicalStore.error ||
      lexicalStore.result?.isError ||
      !lexicalPayload ||
      typeof lexicalPayload !== 'object' ||
      Array.isArray(lexicalPayload)
    ) {
      throw new Error(`real MCP store_document seed failed: ${JSON.stringify(lexicalStore)}`);
    }
    const lexicalRecord = lexicalPayload as Record<string, unknown>;
    if (lexicalRecord.title !== LEXICAL_TITLE || typeof lexicalRecord.documentId !== 'string') {
      throw new Error(
        `real MCP store_document seed payload was invalid: ${JSON.stringify(lexicalPayload)}`
      );
    }
    closedGateway = await startGateway(closedFleetUrl);
    writeEvidence('seeded-artifact.json', {
      semanticTitle: SEMANTIC_TITLE,
      semanticPassage: SEMANTIC_PASSAGE,
      semanticQuery: SEMANTIC_QUERY,
      lexicalTitle: LEXICAL_TITLE,
      lexicalContent: LEXICAL_CONTENT,
      embeddingDimension: documentVector.length,
      fleetUrl: FLEET_URL,
      closedFleetUrl,
      lexicalSeed: {
        transport: 'streamable-http',
        tool: 'store_document',
        documentId: lexicalRecord.documentId,
        response: lexicalStore,
      },
    });
  }, 120_000);

  afterAll(async () => {
    await closedGateway?.stop();
    await liveGateway?.stop();
    if (sql) {
      try {
        await sql`DELETE FROM passages WHERE source_id IN (SELECT id FROM sources WHERE content_hash = ${SEMANTIC_CONTENT_HASH})`;
        await sql`DELETE FROM sources WHERE content_hash = ${SEMANTIC_CONTENT_HASH}`;
        await sql`DELETE FROM documents WHERE title IN (${SEMANTIC_TITLE}, ${LEXICAL_TITLE})`;
        await sql`SELECT pg_advisory_unlock(330002)`;
      } finally {
        await sql.end({ timeout: 5 });
      }
    }
    for (const directory of temporaryDirectories)
      rmSync(directory, { recursive: true, force: true });
  }, 60_000);

  it('AC-1: retrieves the lexically-disjoint seeded passage through hybrid vector RRF over HTTP', async () => {
    if (!liveGateway) throw new Error('live gateway was not started');
    const hybrid = await mcpCall(
      liveGateway.baseUrl,
      'hybrid_search',
      { query: SEMANTIC_QUERY, limit: 10 },
      330101
    );
    const fts = await mcpCall(
      liveGateway.baseUrl,
      'search_fts',
      { query: SEMANTIC_QUERY, limit: 10 },
      330102
    );
    writeEvidence('red-ac-1-http.json', { hybrid, fts });
    const hybridPayload = parseToolPayload(hybrid.result) as Record<string, unknown> | undefined;
    const ftsPayload = parseToolPayload(fts.result) as Record<string, unknown> | undefined;
    const hybridResults = Array.isArray(hybridPayload?.results) ? hybridPayload.results : [];
    expect(hybrid.error).toBeUndefined();
    expect(hybrid.result?.isError ?? false).toBe(false);
    expect(hybridPayload?.searchMethod).toBe('hybrid');
    expect(hybridPayload?.totalResults).toBeGreaterThan(0);
    expect(hybridResults).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: SEMANTIC_TITLE })])
    );
    const semanticHit = hybridResults.find(
      (row): row is Record<string, unknown> =>
        typeof row === 'object' &&
        row !== null &&
        !Array.isArray(row) &&
        row.title === SEMANTIC_TITLE
    );
    expect(semanticHit?.score).toBeGreaterThan(0);
    expect(fts.result?.isError ?? false).toBe(false);
    expect(ftsPayload?.totalResults).toBe(0);
  }, 120_000);

  it('AC-2: fails closed with ROLE_UNAVAILABLE and the literal role and endpoint when fleet is unreachable', async () => {
    if (!closedGateway || !closedFleetUrl) throw new Error('closed gateway was not started');
    const hybrid = await mcpCall(
      closedGateway.baseUrl,
      'hybrid_search',
      { query: SEMANTIC_QUERY, limit: 10 },
      330201
    );
    const error = parseErrorPayload(hybrid.result);
    writeEvidence('red-ac-2-http-closed-fleet.json', { hybrid, error, closedFleetUrl });
    expect(hybrid.error).toBeUndefined();
    expect(hybrid.result?.isError).toBe(true);
    expect(error.code).toBe('ROLE_UNAVAILABLE');
    expect(error.message).toContain("fleet role 'embed'");
    expect(error.message).toContain(closedFleetUrl);
    expect(error.message).not.toContain('results');
    expect(hybrid.result?.structuredContent).toBeUndefined();
  }, 120_000);

  it('AC-3: keeps search_fts independent and returns the lexical anchor with fleet closed', async () => {
    if (!closedGateway) throw new Error('closed gateway was not started');
    const result = await mcpCall(
      closedGateway.baseUrl,
      'search_fts',
      { query: 'zylophonequux', limit: 10 },
      330301
    );
    const payload = parseToolPayload(result.result) as Record<string, unknown> | undefined;
    writeEvidence('red-ac-3-http-fts-closed-fleet.json', { result, payload, closedFleetUrl });
    const rows = Array.isArray(payload?.results) ? payload.results : [];
    expect(result.error).toBeUndefined();
    expect(result.result?.isError ?? false).toBe(false);
    expect(rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: LEXICAL_TITLE })])
    );
  }, 60_000);

  it('AC-4: stdio reproduces live and closed hybrid outcomes with zero stdout parse failures', async () => {
    if (!liveGateway || !closedGateway || !closedFleetUrl) {
      throw new Error('HTTP gateways were not started');
    }
    const httpLive = await mcpCall(
      liveGateway.baseUrl,
      'hybrid_search',
      { query: SEMANTIC_QUERY, limit: 10 },
      330400
    );
    const httpClosed = await mcpCall(
      closedGateway.baseUrl,
      'hybrid_search',
      { query: SEMANTIC_QUERY, limit: 10 },
      330410
    );
    const live = await runStdio(FLEET_URL, 330401);
    const closed = await runStdio(closedFleetUrl, 330411);
    const livePayload = parseToolPayload(live.result) as Record<string, unknown> | undefined;
    const httpLivePayload = parseToolPayload(httpLive.result) as
      | Record<string, unknown>
      | undefined;
    const httpClosedError = parseErrorPayload(httpClosed.result);
    const closedError = parseErrorPayload(closed.result);
    writeEvidence('red-ac-4-stdio.json', {
      httpLive,
      httpClosed,
      live,
      closed,
      livePayload,
      httpLivePayload,
      httpClosedError,
      closedError,
      closedFleetUrl,
    });
    expect(live.parseFailures).toEqual([]);
    expect(closed.parseFailures).toEqual([]);
    expect(live.frames.every(isJsonRpcFrame)).toBe(true);
    expect(closed.frames.every(isJsonRpcFrame)).toBe(true);
    expect(live.result?.isError ?? false).toBe(false);
    expect(livePayload?.searchMethod).toBe('hybrid');
    expect(livePayload?.results).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: SEMANTIC_TITLE })])
    );
    expect(livePayload).toEqual(httpLivePayload);
    expect(httpClosed.result?.isError).toBe(true);
    expect(closed.result?.isError).toBe(true);
    expect(closedError.code).toBe('ROLE_UNAVAILABLE');
    expect(closedError.message).toContain("fleet role 'embed'");
    expect(closedError.message).toContain(closedFleetUrl);
    expect(closedError).toEqual(httpClosedError);
  }, 180_000);

  it('AC-4 negative control: rejects JSON-valid stdout that is not JSON-RPC 2.0', () => {
    const invalid = parseJsonRpcStdoutFrame('{"jsonrpc":"1.0","id":1,"result":{}}');
    expect(invalid.ok).toBe(false);
    if (invalid.ok) throw new Error('JSON-valid non-JSON-RPC stdout was accepted');
    expect(invalid.error).toContain('not JSON-RPC 2.0');
    writeEvidence('stdio-parser-negative-control.json', {
      input: { jsonrpc: '1.0', id: 1, result: {} },
      accepted: invalid.ok,
      error: invalid.error,
    });
  });

  it('Inspector CLI: discovers hybrid_search and proves live and closed outcomes', async () => {
    if (!closedFleetUrl) throw new Error('closed fleet URL was not initialized');
    const list = await runInspector(FLEET_URL, 'tools/list');
    const live = await runInspector(FLEET_URL, 'tools/call', {
      query: SEMANTIC_QUERY,
      limit: 10,
    });
    const closed = await runInspector(closedFleetUrl, 'tools/call', {
      query: SEMANTIC_QUERY,
      limit: 10,
    });
    const listOutput = parseInspectorOutput(list);
    const liveOutput = parseInspectorOutput(live);
    const closedOutput = parseInspectorOutput(closed);
    const listText = JSON.stringify(listOutput);
    const liveText = JSON.stringify(liveOutput);
    const closedText = JSON.stringify(closedOutput);
    expect(list.exitCode).toBe(0);
    expect(listText).toContain('hybrid_search');
    expect(live.exitCode).toBe(0);
    expect(liveText).toContain(SEMANTIC_TITLE);
    expect(liveText).toContain('"searchMethod":"hybrid"');
    expect(closed.exitCode).toBe(5);
    expect(closedText).toContain('ROLE_UNAVAILABLE');
    expect(closedText).toContain("fleet role 'embed'");
    expect(closedText).toContain(closedFleetUrl);
    writeEvidence('inspector-smoke-output.json', {
      provenance: {
        transport: 'stdio',
        server: 'bun packages/platform/src/cli/holo.ts mcp:stdio',
        inspector: '@modelcontextprotocol/inspector --cli',
        environmentSource: 'task-local temporary Inspector env file; values omitted',
        environmentNames: closed.environmentNames,
        database: {
          host: '127.0.0.1',
          name: 'holocron_nonprod',
          credentials: 'task-local temporary env file; values omitted',
        },
        liveFleetUrl: FLEET_URL,
        closedFleetUrl,
        credentials: 'task-local temporary env file; values omitted',
      },
      toolsList: list,
      semanticSuccess: live,
      closedRoleUnavailable: closed,
    });
  }, 240_000);
});
