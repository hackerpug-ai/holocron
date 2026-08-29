/** Sprint 19 gateway baseline: real MCP SDK transport, auth/origin, and 44-tool registry parity. */
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql, type Sql } from '../../src/db/client';
import { createHonoApp } from '../../src/http/hono-app';
import { executePostgresMcpTool } from '../../src/mcp/executor';
import { defaultManifestPath, loadManifest } from '../../src/mcp/manifest-loader';
import { getTool, toolsAsRecord } from '../../src/tools/registry';
import {
  classifySweepToolResult,
  isSweepAllowlisted,
  SWEEP_EXTERNAL_DEPENDENCY_ALLOWLIST,
  type SweepFailureRecord,
  sortedSweepAllowlistIds,
} from './helpers/mcp-sweep-predicate';

/**
 * Live-only cases that still self-skip without PLATFORM_IT.
 * The dual-transport cutover sweeps below MUST NOT use this — R36 requires
 * fail-closed (throw) rather than skip-to-green for the behavioural proof.
 */
const itLive = PLATFORM_IT ? it : it.skip;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const KEYS = { rn: 's19-rn', mcp: 's19-mcp', control: 's19-control' };

/** Shared judged-id sets so AC-2 can deep-equal stdio against HTTP. */
let httpStrictlyJudgedIds: string[] = [];
let stdioStrictlyJudgedIds: string[] = [];

function requirePlatformItForCutoverSweep(label: string): void {
  if (!PLATFORM_IT) {
    throw new Error(
      `${label} requires PLATFORM_IT=1 — refusing skip-to-green for MCP dual-transport cutover proof (R36)`
    );
  }
}

type OutputSchema = { safeParse: (value: unknown) => { success: boolean } };

function toolOutputSchema(toolId: string): OutputSchema | undefined {
  const tool = toolsAsRecord()[toolId] as unknown as { outputSchema?: OutputSchema };
  return tool.outputSchema;
}

type SweepSeedIds = {
  documentId: string;
  subscriptionId: string;
  /** Extra subscription reserved for remove_subscription (deleted during sweep). */
  removableSubscriptionId: string;
  toolId: string;
  improvementId: string;
  /** Distinct assimilation sessions so state-mutating tools do not race. */
  approveSessionId: string;
  rejectSessionId: string;
  cancelSessionId: string;
  steerSessionId: string;
};

function schemaSampleInput(schema: unknown, key: string): unknown {
  const def = (schema as { def?: Record<string, unknown> }).def ?? {};
  const type = def.type;
  if (type === 'optional' || type === 'nullable' || type === 'default') {
    // Prefer omitting optional status so DB defaults apply (enum first value
    // "complete" is not in the toolbelt_tools status check constraint).
    if (key === 'status') return undefined;
    return schemaSampleInput(def.innerType, key);
  }
  if (type === 'object') {
    const shape = (def.shape ?? {}) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(shape)
        .map(([name, value]) => [name, schemaSampleInput(value, name)] as const)
        .filter(([, value]) => value !== undefined)
    );
  }
  if (type === 'array') return [schemaSampleInput(def.element, key)];
  if (type === 'enum') {
    const entries = def.entries as Record<string, string>;
    const values = Object.values(entries);
    // Prefer DB-safe status literals when present.
    if (key === 'status') {
      if (values.includes('draft')) return 'draft';
      if (values.includes('open')) return 'open';
      if (values.includes('pending')) return 'pending';
    }
    return values[0];
  }
  if (type === 'number') return key === 'count' || key === 'limit' ? 5 : 1;
  if (type === 'boolean') return false;
  if (type === 'record' || type === 'unknown') return {};
  if (type === 'string') {
    if (key === 'url' || key === 'feedUrl' || key === 'sourceUrl' || key === 'repositoryUrl')
      return 'https://example.com/s31-sweep';
    // Any *Id / id field must be a real UUID for Postgres uuid columns.
    if (key === 'id' || /Id$/i.test(key)) return crypto.randomUUID();
    if (key === 'sourceType') return 'github';
    if (key === 'category') return 'libraries';
    if (key === 'status') return 'draft';
    return `s31-sweep-${key}`;
  }
  return {};
}

/**
 * Build tool arguments for the sweep, wiring seeded entity ids so mutation
 * tools succeed under the strict predicate (not random dead UUIDs).
 */
function sampleArgsForSweepTool(toolId: string, inputSchema: unknown, seed: SweepSeedIds): unknown {
  const base = schemaSampleInput(inputSchema, toolId) as Record<string, unknown>;
  switch (toolId) {
    case 'get_document':
    case 'update_document':
      return { ...base, documentId: seed.documentId };
    case 'share_document':
      return { documentId: seed.documentId };
    case 'unshare_document':
      return { documentId: seed.documentId };
    case 'remove_subscription':
      return { subscriptionId: seed.removableSubscriptionId };
    case 'get_subscription_content':
    case 'set_subscription_filter':
    case 'get_subscription_filters':
      return { ...base, subscriptionId: seed.subscriptionId };
    case 'get_tool':
    case 'update_tool':
    case 'remove_tool':
      return { ...base, toolId: seed.toolId };
    case 'store_tool':
      return { ...base, status: 'draft' };
    case 'get_improvement':
    case 'close_improvement':
    case 'set_improvement_status':
      return { ...base, id: seed.improvementId };
    case 'get_assimilation_status':
      return { sessionId: seed.approveSessionId };
    case 'approve_assimilation_plan':
      return { sessionId: seed.approveSessionId };
    case 'reject_assimilation_plan':
      return { sessionId: seed.rejectSessionId, feedback: 's31-sweep-feedback' };
    case 'cancel_assimilation':
      return { sessionId: seed.cancelSessionId };
    case 'steer_assimilation':
      return { sessionId: seed.steerSessionId, note: 's31-sweep-steer' };
    default:
      return base;
  }
}

function parseToolPayload(body: McpEnvelope): Record<string, unknown> {
  const result = body.result;
  if (!result) return {};
  if (result.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent as Record<string, unknown>;
  }
  const text = result.content?.[0]?.text;
  if (typeof text === 'string' && text.length > 0) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

/** Seed one row per read-tool domain so empty results are unambiguous failures. */
async function seedSweepCorpus(
  app: ReturnType<typeof createHonoApp>,
  headers: Record<string, string>
): Promise<SweepSeedIds> {
  const call = async (
    name: string,
    args: Record<string, unknown>,
    rpcId: number
  ): Promise<Record<string, unknown>> => {
    const response = await app.request('/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: rpcId,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    });
    const body = mcpEnvelope(await response.json());
    if (response.status !== 200 || body.error || body.result?.isError === true) {
      throw new Error(
        `sweep_seed_corpus failed for ${name}: status=${response.status} body=${JSON.stringify(body)}`
      );
    }
    return parseToolPayload(body);
  };

  const doc = await call(
    'store_document',
    { title: 's31-sweep-doc', content: 's31 sweep seed document body' },
    9001
  );
  const sub = await call(
    'add_subscription',
    { sourceType: 'github', identifier: 's31-sweep-sub', name: 's31-sweep-sub' },
    9002
  );
  const removable = await call(
    'add_subscription',
    {
      sourceType: 'github',
      identifier: `s31-sweep-sub-rm-${Date.now()}`,
      name: 's31-sweep-sub-rm',
    },
    9003
  );
  const tool = await call(
    'store_tool',
    {
      title: 's31-sweep-tool',
      sourceType: 'github',
      category: 'libraries',
      description: 's31 sweep seed toolbelt entry',
      status: 'draft',
    },
    9004
  );
  const improvement = await call(
    'add_improvement',
    { items: [{ description: 's31-sweep-improvement' }] },
    9005
  );
  const approve = await call(
    'start_assimilation',
    { repositoryUrl: `https://example.com/s31-sweep-approve-${Date.now()}` },
    9006
  );
  const reject = await call(
    'start_assimilation',
    { repositoryUrl: `https://example.com/s31-sweep-reject-${Date.now()}` },
    9007
  );
  const cancel = await call(
    'start_assimilation',
    { repositoryUrl: `https://example.com/s31-sweep-cancel-${Date.now()}` },
    9008
  );
  const steer = await call(
    'start_assimilation',
    { repositoryUrl: `https://example.com/s31-sweep-steer-${Date.now()}` },
    9009
  );

  const improvementIds = improvement.ids;
  const improvementId =
    Array.isArray(improvementIds) && typeof improvementIds[0] === 'string' ? improvementIds[0] : '';

  const seed: SweepSeedIds = {
    documentId: String(doc.documentId ?? ''),
    subscriptionId: String(sub.subscriptionId ?? ''),
    removableSubscriptionId: String(removable.subscriptionId ?? ''),
    toolId: String(tool.toolId ?? ''),
    improvementId,
    approveSessionId: String(approve.sessionId ?? ''),
    rejectSessionId: String(reject.sessionId ?? ''),
    cancelSessionId: String(cancel.sessionId ?? ''),
    steerSessionId: String(steer.sessionId ?? ''),
  };

  for (const [key, value] of Object.entries(seed)) {
    if (!value) {
      throw new Error(`sweep_seed_corpus missing ${key}`);
    }
  }
  return seed;
}

type McpStructuredContent = {
  status?: string;
  error?: unknown;
  totalListings?: number;
  listings?: unknown[];
  sessionId?: string;
  videosFound?: number;
  session?: { status?: string };
};

type McpToolResult = {
  isError?: boolean;
  structuredContent?: McpStructuredContent;
  content?: Array<{ text?: string }>;
};

type McpEnvelope = {
  result?: McpToolResult;
  error?: unknown;
};

function mcpEnvelope(value: unknown): McpEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MCP response was not a JSON object');
  }
  return value as McpEnvelope;
}

function requiredMcpResult(body: McpEnvelope): McpToolResult {
  if (!body.result) throw new Error('MCP response omitted result');
  return body.result;
}

function requiredStructuredContent(result: McpToolResult): McpStructuredContent {
  if (!result.structuredContent) throw new Error('MCP result omitted structuredContent');
  return result.structuredContent;
}

describe('Sprint 19 MCP rehost gateway', () => {
  let sql: Sql | undefined;
  beforeAll(() => {
    if (PLATFORM_IT) sql = createSql(DATABASE_URL);
  });
  afterAll(async () => {
    if (sql) {
      await sql`DELETE FROM documents WHERE title LIKE 's19-mcp-%'`;
      await sql`DELETE FROM documents WHERE title LIKE 's19-parity-%'`;
      await sql`DELETE FROM documents WHERE title LIKE 's31-sweep-%'`;
      await sql`DELETE FROM subscription_sources WHERE identifier LIKE 's19-mcp-%' OR identifier LIKE 's19-parity-%' OR identifier LIKE 's31-sweep-%'`;
      await sql`DELETE FROM toolbelt_tools WHERE title LIKE 's19-parity-%' OR title LIKE 's31-sweep-%'`;
      await sql`DELETE FROM improvement_requests WHERE description LIKE 's19-parity-%' OR description LIKE 's31-sweep-%'`;
      await sql`DELETE FROM shop_sessions WHERE query LIKE 's19-parity-%' OR query LIKE 'USB-C hub%' OR query LIKE 's19 replay product%' OR query LIKE 's19-cancel-%' OR query LIKE 's31-sweep-%'`;
      await sql`DELETE FROM assimilation_sessions WHERE repository_url LIKE 's19-parity-%' OR repository_url LIKE '%s31-sweep%'`;
      await sql`DELETE FROM transcript_jobs WHERE content_id LIKE 's19-parity-%' OR content_id LIKE 's19-creator-%'`;
      await sql`DELETE FROM subscription_content WHERE content_id LIKE 's19-creator-%'`;
      await sql`DELETE FROM creator_profiles WHERE handle = 's19-creator'`;
      await sql.end({ timeout: 5 });
    }
  });

  it('serves initialize and tools/list over stateless Streamable HTTP', async () => {
    const app = createHonoApp({ keys: KEYS });
    const headers = {
      authorization: `Bearer ${KEYS.mcp}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    const initialize = await app.request('/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'sprint-19-test', version: '1' },
        },
      }),
    });
    expect(initialize.status).toBe(200);
    const initialized = (await initialize.json()) as {
      result?: { serverInfo?: { name?: string } };
    };
    expect(initialized.result?.serverInfo?.name).toBe('holocron-postgres');

    const list = await app.request('/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });
    const listed = (await list.json()) as {
      result?: { tools?: Array<{ name: string }> };
    };
    expect(list.status).toBe(200);
    expect(listed.result?.tools).toHaveLength(45);
    const listedTools = listed.result?.tools;
    if (!listedTools) throw new Error('tools/list response omitted tools');
    expect(new Set(listedTools.map((tool) => tool.name))).toEqual(
      new Set(Object.keys(toolsAsRecord()))
    );
    expect(loadManifest(defaultManifestPath()).tools).toHaveLength(45);
  });

  it('fails closed on missing key and foreign origin', async () => {
    const app = createHonoApp({ keys: KEYS });
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    expect((await app.request('/mcp', { method: 'POST', body })).status).toBe(401);
    expect(
      (
        await app.request('/mcp', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${KEYS.mcp}`,
            origin: 'https://evil.example',
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
          },
          body,
        })
      ).status
    ).toBe(403);
    const sampling = await app.request('/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${KEYS.mcp}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 10,
        method: 'sampling/createMessage',
        params: {},
      }),
    });
    const samplingBody = mcpEnvelope(await sampling.json());
    expect(samplingBody.error).toBeDefined();
  });

  it('validates every frozen success fixture against the shared output schema', () => {
    const fixtureDir = 'packages/platform/tests/fixtures/mcp-manifest';
    const tools = toolsAsRecord();
    const successFixtures = readdirSync(fixtureDir).filter((name) =>
      name.endsWith('_success.json')
    );
    expect(successFixtures).toHaveLength(45);
    for (const fixture of successFixtures) {
      const id = fixture.slice(0, -'_success.json'.length);
      const value = JSON.parse(readFileSync(`${fixtureDir}/${fixture}`, 'utf8'));
      const outputSchema = (
        tools[id] as unknown as {
          outputSchema: { safeParse: (value: unknown) => { success: boolean } };
        }
      ).outputSchema;
      expect(outputSchema.safeParse(value).success, `${id} fixture`).toBe(true);
    }
  });

  it('rejects an already-cancelled tool request before database dispatch', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      executePostgresMcpTool(
        'list_documents',
        {},
        {
          databaseUrl: DATABASE_URL,
          signal: controller.signal,
        }
      )
    ).rejects.toThrow('MCP request cancelled');
  });

  itLive(
    'cancels an active retailer request and marks its Postgres session cancelled',
    async () => {
      if (!sql) throw new Error('Postgres is required');
      const controller = new AbortController();
      const query = `s19-cancel-${Date.now()}`;
      const request = executePostgresMcpTool(
        'shop_products',
        { query, retailers: ['amazon'] },
        { databaseUrl: DATABASE_URL, signal: controller.signal }
      );
      controller.abort();
      await expect(request).rejects.toThrow(/cancel/i);
      const rows = await sql`SELECT status FROM shop_sessions WHERE query = ${query}`;
      expect(rows[0]?.status).toBe('cancelled');
    }
  );

  it('sweep allowlist contents are exact', () => {
    const sortedIds = sortedSweepAllowlistIds();
    expect(sortedIds).toEqual(['findRecommendations', 'shop_products']);
    expect(SWEEP_EXTERNAL_DEPENDENCY_ALLOWLIST).toHaveLength(2);
    for (const entry of SWEEP_EXTERNAL_DEPENDENCY_ALLOWLIST) {
      expect(entry.reason.length).toBeGreaterThanOrEqual(1);
      expect(entry.reason.toLowerCase()).toMatch(/third-party|search api|retailer search/i);
      // Must resolve in the 44-tool registry — not a free-floating string.
      expect(() => getTool(entry.id)).not.toThrow();
      expect(isSweepAllowlisted(entry.id)).toBe(true);
    }
    // A third id must not be silently absorbed: allowlist length is locked at 2.
    expect(sortedIds).not.toContain('list_documents');
    expect(isSweepAllowlisted('list_documents')).toBe(false);
  });

  it('strict predicate classifies each failure class', async () => {
    requirePlatformItForCutoverSweep('strict predicate classifies each failure class');
    const app = createHonoApp({ keys: KEYS });
    const headers = {
      authorization: `Bearer ${KEYS.mcp}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    const goodResponse = await app.request('/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 50,
        method: 'tools/call',
        params: { name: 'list_documents', arguments: { limit: 1 } },
      }),
    });
    const goodBody = mcpEnvelope(await goodResponse.json());
    expect(goodResponse.status).toBe(200);
    expect(goodBody.error).toBeUndefined();
    expect(goodBody.result?.isError).not.toBe(true);

    const listDocumentsSchema = toolOutputSchema('list_documents');
    expect(listDocumentsSchema).toBeDefined();

    const jsonrpcError = classifySweepToolResult({
      transport: 'http',
      status: 200,
      body: { error: { code: -32000, message: 'x' } },
      outputSchema: listDocumentsSchema,
    });
    const isErrorEnvelope = classifySweepToolResult({
      transport: 'http',
      status: 200,
      body: {
        result: {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ code: 'INTERNAL', message: 'x' }) }],
        },
      },
      outputSchema: listDocumentsSchema,
    });
    const schemaMismatch = classifySweepToolResult({
      transport: 'http',
      status: 200,
      body: {
        result: {
          isError: false,
          structuredContent: { unexpected: true },
          content: [{ type: 'text', text: JSON.stringify({ unexpected: true }) }],
        },
      },
      outputSchema: listDocumentsSchema,
    });
    const good = classifySweepToolResult({
      transport: 'http',
      status: goodResponse.status,
      body: goodBody,
      outputSchema: listDocumentsSchema,
    });

    expect(jsonrpcError.ok).toBe(false);
    expect(jsonrpcError.reasons).toContain('jsonrpc_error');
    expect(isErrorEnvelope.ok).toBe(false);
    expect(isErrorEnvelope.reasons).toContain('tool_is_error');
    expect(schemaMismatch.ok).toBe(false);
    expect(schemaMismatch.reasons).toContain('output_schema_mismatch');
    expect(good.ok).toBe(true);
    expect(good.reasons).toEqual([]);

    const classified = [jsonrpcError, isErrorEnvelope, schemaMismatch, good];
    expect(classified.filter((c) => !c.ok)).toHaveLength(3);
    expect(classified.filter((c) => c.ok)).toHaveLength(1);
  });

  it('cutover gate requires PLATFORM_IT', () => {
    if (!PLATFORM_IT) {
      throw new Error(
        'cutover gate requires PLATFORM_IT=1 — refusing skip-to-green for MCP dual-transport sweep (R36)'
      );
    }

    // Prove the fail-closed path: HOLO_MCP_GATE=1 with PLATFORM_IT deleted must
    // exit non-zero naming PLATFORM_IT, with zero skipped sweep tests.
    const env: NodeJS.ProcessEnv = { ...process.env, HOLO_MCP_GATE: '1' };
    delete env.PLATFORM_IT;
    const child = spawnSync(
      'pnpm',
      [
        'vitest',
        'run',
        '--project',
        'integration',
        'packages/platform/tests/integration/sprint19-mcp-rehost.test.ts',
        '-t',
        'cutover gate requires PLATFORM_IT|executes every manifest tool through the real HTTP gateway|executes initialize, list, and a tool call over real stdio',
      ],
      {
        cwd: process.cwd(),
        env,
        encoding: 'utf8',
        timeout: 120_000,
      }
    );
    const out = `${child.stdout ?? ''}\n${child.stderr ?? ''}`;
    expect(child.status, out).not.toBe(0);
    expect(out).toContain('PLATFORM_IT');
    // Sweep-block tests must fail closed (×), never skip (↓). Vitest may report
    // unrelated suite members as filter-skipped; only the cutover block is gated.
    const sweepTitles = [
      'cutover gate requires PLATFORM_IT',
      'executes initialize, list, and a tool call over real stdio',
      'executes every manifest tool through the real HTTP gateway',
    ] as const;
    let sweepSkipped = 0;
    let sweepFailed = 0;
    for (const title of sweepTitles) {
      // Vitest tree: "× title" = failed, "↓ title" = skipped
      if (out.includes(`↓ ${title}`)) sweepSkipped += 1;
      if (out.includes(`× ${title}`)) sweepFailed += 1;
    }
    expect(sweepSkipped, `expected 0 skipped sweep tests, got output:\n${out}`).toBe(0);
    expect(sweepFailed, `expected 3 failed sweep tests, got output:\n${out}`).toBe(3);
  });

  it('executes initialize, list, and a tool call over real stdio', async () => {
    requirePlatformItForCutoverSweep('executes initialize, list, and a tool call over real stdio');
    // Seed via HTTP gateway so stdio read tools see non-empty domain rows.
    const app = createHonoApp({ keys: KEYS });
    const headers = {
      authorization: `Bearer ${KEYS.mcp}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    const seed = await seedSweepCorpus(app, headers);

    const child = spawn('bun', ['packages/platform/src/cli/holo.ts', 'mcp:stdio'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buffer = '';
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const nextMessage = (requestLabel: string) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const timeout = setTimeout(
          () =>
            reject(
              new Error(
                `stdio MCP response timeout for ${requestLabel}${stderr ? `: ${stderr.slice(-2_000)}` : ''}`
              )
            ),
          30_000
        );
        const consume = () => {
          const newline = buffer.indexOf('\n');
          if (newline < 0) return false;
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          clearTimeout(timeout);
          child.stdout.off('data', onData);
          child.off('error', onError);
          try {
            resolve(JSON.parse(line) as Record<string, unknown>);
          } catch (error) {
            reject(error);
          }
          return true;
        };
        const onData = (chunk: Buffer) => {
          buffer += chunk.toString();
          consume();
        };
        const onError = (error: Error) => reject(error);
        child.stdout.on('data', onData);
        child.once('error', onError);
        consume();
      });
    try {
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'sprint-19-stdio-test', version: '1' },
          },
        })}\n`
      );
      const initialized = await nextMessage('initialize');
      expect((initialized.result as { serverInfo: { name: string } }).serverInfo.name).toBe(
        'holocron-postgres'
      );
      child.stdin.write(
        `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`
      );
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        })}\n`
      );
      const listed = await nextMessage('tools/list');
      expect((listed.result as { tools: unknown[] }).tools).toHaveLength(45);
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'list_documents', arguments: { limit: 1 } },
        })}\n`
      );
      const called = await nextMessage('list_documents');
      expect(called.result).toBeDefined();
      expect((called.result as { isError?: boolean }).isError).not.toBe(true);

      const tools = Object.keys(toolsAsRecord());
      const stdioFailures: SweepFailureRecord[] = [];
      const judged: string[] = [];
      let exempted = 0;
      for (const [index, id] of tools.entries()) {
        const inputSchema = (toolsAsRecord()[id] as unknown as { inputSchema: unknown })
          .inputSchema;
        child.stdin.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: index + 1000,
            method: 'tools/call',
            params: { name: id, arguments: sampleArgsForSweepTool(id, inputSchema, seed) },
          })}\n`
        );
        const response = await nextMessage(id);
        if (isSweepAllowlisted(id)) {
          exempted += 1;
          continue;
        }
        judged.push(id);
        const result =
          response.result && typeof response.result === 'object' && !Array.isArray(response.result)
            ? (response.result as {
                isError?: boolean;
                structuredContent?: unknown;
                content?: Array<{ text?: string; type?: string }>;
              })
            : undefined;
        const verdict = classifySweepToolResult({
          transport: 'stdio',
          body: {
            error: response.error,
            result,
          },
          outputSchema: toolOutputSchema(id),
        });
        if (!verdict.ok) {
          stdioFailures.push({
            id,
            transport: 'stdio',
            reason: verdict.reasons[0] ?? 'missing_result',
            reasons: verdict.reasons,
          });
        }
      }
      stdioStrictlyJudgedIds = [...judged].sort();
      expect(tools).toHaveLength(45);
      expect(judged).toHaveLength(43);
      expect(exempted).toBe(2);
      expect(stdioFailures, JSON.stringify(stdioFailures, null, 2)).toEqual([]);
      const expectedJudged = tools.filter((id) => !isSweepAllowlisted(id)).sort();
      expect(stdioStrictlyJudgedIds).toEqual(expectedJudged);
      if (httpStrictlyJudgedIds.length > 0) {
        expect(stdioStrictlyJudgedIds).toEqual([...httpStrictlyJudgedIds].sort());
      }
    } finally {
      child.kill('SIGTERM');
    }
  }, 180_000);

  it('executes every manifest tool through the real HTTP gateway', async () => {
    requirePlatformItForCutoverSweep('executes every manifest tool through the real HTTP gateway');
    const app = createHonoApp({ keys: KEYS });
    const headers = {
      authorization: `Bearer ${KEYS.mcp}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    const seed = await seedSweepCorpus(app, headers);

    const tools = Object.keys(toolsAsRecord());
    const failures: SweepFailureRecord[] = [];
    const judged: string[] = [];
    let exempted = 0;
    for (const [index, id] of tools.entries()) {
      const inputSchema = (toolsAsRecord()[id] as unknown as { inputSchema: unknown }).inputSchema;
      const response = await app.request('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: index + 100,
          method: 'tools/call',
          params: { name: id, arguments: sampleArgsForSweepTool(id, inputSchema, seed) },
        }),
      });
      const body = mcpEnvelope(await response.json());
      if (isSweepAllowlisted(id)) {
        exempted += 1;
        continue;
      }
      judged.push(id);
      const verdict = classifySweepToolResult({
        transport: 'http',
        status: response.status,
        body,
        outputSchema: toolOutputSchema(id),
      });
      if (!verdict.ok) {
        failures.push({
          id,
          transport: 'http',
          status: response.status,
          reason: verdict.reasons[0] ?? 'missing_result',
          reasons: verdict.reasons,
        });
      }
    }
    httpStrictlyJudgedIds = [...judged].sort();
    expect(tools).toHaveLength(45);
    expect(judged).toHaveLength(43);
    expect(exempted).toBe(2);
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
    // A judged count of 45 would mean the allowlist was not applied.
    expect(judged).not.toHaveLength(45);
    const expectedJudged = tools.filter((id) => !isSweepAllowlisted(id)).sort();
    expect(httpStrictlyJudgedIds).toEqual(expectedJudged);
    if (stdioStrictlyJudgedIds.length > 0) {
      expect(httpStrictlyJudgedIds).toEqual([...stdioStrictlyJudgedIds].sort());
    }
  }, 180_000);

  itLive(
    'runs shop_products through a real retailer search and persists its result',
    async () => {
      const app = createHonoApp({ keys: KEYS });
      // Unique query avoids replaying a prior empty completed session; multi-retailer
      // keeps the path real while surviving a single retailer SERP omission.
      const query = `USB-C hub s19-${Date.now().toString(36)}`;
      const response = await app.request('/mcp', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${KEYS.mcp}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 20,
          method: 'tools/call',
          params: {
            name: 'shop_products',
            arguments: {
              query,
              retailers: ['amazon', 'ebay', 'newegg', 'bestbuy'],
            },
          },
        }),
      });
      const body = mcpEnvelope(await response.json());
      const result = requiredMcpResult(body);
      const structuredContent = requiredStructuredContent(result);
      expect(response.status).toBe(200);
      expect(result.isError).not.toBe(true);
      expect(structuredContent.status).toBe('completed');
      expect(structuredContent.error).toBeUndefined();
      expect(structuredContent.totalListings).toBeGreaterThan(0);
      expect(structuredContent.listings?.length).toBeGreaterThan(0);
      if (!structuredContent.sessionId) throw new Error('shop result omitted sessionId');
      const session = await app.request('/mcp', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${KEYS.mcp}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 21,
          method: 'tools/call',
          params: {
            name: 'get_shop_session',
            arguments: { sessionId: structuredContent.sessionId },
          },
        }),
      });
      const sessionBody = mcpEnvelope(await session.json());
      const sessionContent = requiredStructuredContent(requiredMcpResult(sessionBody));
      expect(sessionContent.session?.status).toBe('completed');
    },
    120_000
  );

  itLive(
    'runs findRecommendations through the real search service',
    async () => {
      const app = createHonoApp({ keys: KEYS });
      const response = await app.request('/mcp', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${KEYS.mcp}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 30,
          method: 'tools/call',
          params: {
            name: 'findRecommendations',
            arguments: { query: 'Salt Lake City independent bookstores', count: 3 },
          },
        }),
      });
      const body = mcpEnvelope(await response.json());
      const result = requiredMcpResult(body);
      expect(response.status).toBe(200);
      expect(result.isError).not.toBe(true);
      const recommendationText = result.content?.[0]?.text;
      if (!recommendationText) throw new Error('recommendations result omitted text content');
      const recommendations = JSON.parse(recommendationText) as unknown;
      expect(recommendations).toBeInstanceOf(Array);
      if (!Array.isArray(recommendations))
        throw new Error('recommendations result was not an array');
      expect(recommendations.length).toBeGreaterThan(0);
    },
    60_000
  );

  itLive('queues creator transcript jobs against real Postgres', async () => {
    if (!sql) throw new Error('Postgres is required');
    const profileId = crypto.randomUUID();
    const contentId = `s19-creator-${Date.now()}`;
    await sql`
      INSERT INTO creator_profiles (id, name, handle, canonical_type)
      VALUES (${profileId}::uuid, 'Sprint 19 Creator', 's19-creator', 'creator')
    `;
    await sql`
      INSERT INTO subscription_content (id, source_id, content_id, title, url)
      VALUES (${crypto.randomUUID()}::uuid, ${profileId}, ${contentId}, 'Sprint 19 Video', 'https://example.com/s19-video')
    `;
    const app = createHonoApp({ keys: KEYS });
    const response = await app.request('/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${KEYS.mcp}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 40,
        method: 'tools/call',
        params: { name: 'assimilate_creator', arguments: { profileId } },
      }),
    });
    const body = mcpEnvelope(await response.json());
    const result = requiredMcpResult(body);
    const structuredContent = requiredStructuredContent(result);
    expect(response.status).toBe(200);
    expect(result.isError).not.toBe(true);
    expect(structuredContent.status).toBe('queued');
    expect(structuredContent.videosFound).toBe(1);
    const job = await sql`SELECT status FROM transcript_jobs WHERE content_id = ${contentId}`;
    expect(job[0]?.status).toBe('pending');
  });

  itLive(
    'executes document tools against real Postgres',
    async () => {
      const app = createHonoApp({ keys: KEYS });
      const headers = {
        authorization: `Bearer ${KEYS.mcp}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      };
      const call = await app.request('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'store_document',
            arguments: { title: 's19-mcp-real', content: 'Postgres gateway' },
          },
        }),
      });
      const resultBody = mcpEnvelope(await call.json());
      const result = requiredMcpResult(resultBody);
      expect(call.status).toBe(200);
      expect(result.isError).not.toBe(true);
      expect(JSON.stringify(resultBody)).toContain('s19-mcp-real');
      const search = await app.request('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'hybrid_search', arguments: { query: 'Postgres gateway', limit: 10 } },
        }),
      });
      expect(search.status).toBe(200);
      expect(JSON.stringify(await search.json())).toContain('s19-mcp-real');

      const addBody = {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'add_subscription',
          arguments: {
            sourceType: 'github',
            identifier: `s19-mcp-${Date.now()}`,
            name: 'Sprint 19',
          },
        },
      };
      const add = await app.request('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify(addBody),
      });
      const addAgain = await app.request('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...addBody, id: 6 }),
      });
      const addResult = requiredMcpResult(mcpEnvelope(await add.json()));
      const addAgainResult = requiredMcpResult(mcpEnvelope(await addAgain.json()));
      expect(addResult).toEqual(addAgainResult);

      const shopBody = {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'shop_products',
          arguments: { query: 'USB-C hub replay', condition: 'any', retailers: ['amazon'] },
        },
      };
      const shop = await app.request('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify(shopBody),
      });
      const shopAgain = await app.request('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...shopBody, id: 8 }),
      });
      const firstShop = requiredMcpResult(mcpEnvelope(await shop.json()));
      const replayShop = requiredMcpResult(mcpEnvelope(await shopAgain.json()));
      const firstShopContent = requiredStructuredContent(firstShop);
      const replayShopContent = requiredStructuredContent(replayShop);
      expect(firstShopContent).toEqual(replayShopContent);
      const conflicting = await app.request('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...shopBody,
          id: 8,
          params: {
            name: 'shop_products',
            arguments: {
              query: 'USB-C hub replay',
              condition: 'any',
              retailers: ['bestbuy'],
              verifiedOnly: true,
            },
          },
        }),
      });
      const conflictingBody = requiredStructuredContent(
        requiredMcpResult(mcpEnvelope(await conflicting.json()))
      );
      expect(conflictingBody.sessionId).not.toBe(firstShopContent.sessionId);

      const invalidApprove = await app.request('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 9,
          method: 'tools/call',
          params: {
            name: 'approve_assimilation_plan',
            arguments: { sessionId: crypto.randomUUID() },
          },
        }),
      });
      const invalidBody = requiredMcpResult(mcpEnvelope(await invalidApprove.json()));
      expect(invalidBody.isError).toBe(true);
      const invalidText = invalidBody.content?.[0]?.text;
      if (!invalidText) throw new Error('invalid-state result omitted text content');
      const invalidError = JSON.parse(invalidText) as { code?: string };
      expect(invalidError.code).toBe('INVALID_STATE');
    },
    // Real store_document + hybrid_search + dual shop_products (amazon/bestbuy)
    // regularly exceeds 60s under serial go-no-go load (sibling shop-only case
    // already measured ~58s). Keep the live retailer oracle; raise the wall.
    180_000
  );
});
