/**
 * S31-05: holocron-mcp repointed off Convex onto platform Streamable HTTP /mcp.
 *
 * AC-4, AC-5 — real stdio child + live platform gateway.
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     packages/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts
 */
import { type ChildProcess, type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_KEYS, PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql, type Sql } from '../../src/db/client';
import { createHonoApp } from '../../src/http/hono-app';
import { getTool } from '../../src/tools/registry';

const itLive = PLATFORM_IT ? it : it.skip;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const HOLOCRON_MCP_SRC = resolve(REPO_ROOT, 'holocron-mcp/src');
const HOLOCRON_MCP_STDIO = resolve(REPO_ROOT, 'holocron-mcp/src/mastra/stdio.ts');
const KEYS = { ...DEFAULT_KEYS, mcp: 's31-05-mcp' };
const SEEDED_TITLES = ['s31-05-doc-1', 's31-05-doc-2', 's31-05-doc-3'] as const;

type GatewayHandle = {
  baseUrl: string;
  port: number;
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

/**
 * Minimal Hono /mcp gateway — skips serviceQueue/pg-boss so it boots under
 * multi-worktree load. Real Postgres + real gateway handlers.
 */
async function startMcpGateway(options: {
  port?: number;
  databaseUrl: string;
  keys: { rn: string; mcp: string; control: string };
}): Promise<GatewayHandle> {
  const port = options.port ?? (await freePort());
  const script = `
import { createHonoApp } from ${JSON.stringify(resolve(REPO_ROOT, 'packages/platform/src/http/hono-app.ts'))};
const app = createHonoApp({
  keys: {
    rn: ${JSON.stringify(options.keys.rn)},
    mcp: ${JSON.stringify(options.keys.mcp)},
    control: ${JSON.stringify(options.keys.control)},
  },
});
const server = Bun.serve({ port: ${port}, hostname: '127.0.0.1', fetch: app.fetch });
console.error('s31-05-gateway-ready ' + server.port);
`;
  const child: ChildProcess = spawn('bun', ['-e', script], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: options.databaseUrl,
      HOLO_KEY_RN: options.keys.rn,
      HOLO_KEY_MCP: options.keys.mcp,
      HOLO_KEY_CONTROL: options.keys.control,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  let stdout = '';
  child.stdout?.on('data', (b: Buffer) => {
    stdout += b.toString();
  });
  child.stderr?.on('data', (b: Buffer) => {
    stderr += b.toString();
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (stderr.includes('s31-05-gateway-ready') || stdout.includes('s31-05-gateway-ready')) {
      ready = true;
      break;
    }
    if (child.exitCode !== null) break;
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(500) });
      if (res.ok || res.status === 503) {
        ready = true;
        break;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) {
    child.kill('SIGKILL');
    throw new Error(`mcp gateway failed to start on :${port}\nstdout=${stdout}\nstderr=${stderr}`);
  }

  // Probe /mcp auth to ensure the app is actually serving
  const probe = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/list', params: {} }),
  });
  if (probe.status !== 401 && probe.status !== 200) {
    child.kill('SIGKILL');
    throw new Error(`mcp gateway probe unexpected status ${probe.status}`);
  }

  let exited = false;
  child.on('exit', () => {
    exited = true;
  });

  return {
    baseUrl,
    port,
    stop: async () => {
      if (exited) return;
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 300));
      if (!exited) child.kill('SIGKILL');
    },
  };
}

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      out.push(...walkTsFiles(p));
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      out.push(p);
    }
  }
  return out;
}

/** Case-sensitive scan matching `grep -rn convex holocron-mcp/src`. */
function grepConvexMatches(root: string): string[] {
  const matches: string[] = [];
  for (const file of walkTsFiles(root)) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if ((lines[i] ?? '').includes('convex')) {
        matches.push(`${file}:${i + 1}:${lines[i]}`);
      }
    }
  }
  return matches;
}

type McpMessage = {
  result?: {
    serverInfo?: { name?: string };
    tools?: Array<{ name: string }>;
    isError?: boolean;
    structuredContent?: unknown;
    content?: Array<{ type?: string; text?: string }>;
  };
  error?: unknown;
};

async function withStdioClient(
  env: NodeJS.ProcessEnv,
  run: (
    rpc: (payload: Record<string, unknown>, label: string) => Promise<McpMessage>
  ) => Promise<void>
): Promise<{ stderr: string }> {
  const child: ChildProcessWithoutNullStreams = spawn('bun', [HOLOCRON_MCP_STDIO], {
    cwd: REPO_ROOT,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buffer = '';
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const nextMessage = (label: string) =>
    new Promise<McpMessage>((resolveMsg, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(`stdio MCP timeout for ${label}${stderr ? `: ${stderr.slice(-2_000)}` : ''}`)
        );
      }, 20_000);

      const consume = (): boolean => {
        const newline = buffer.indexOf('\n');
        if (newline < 0) return false;
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) return consume();
        // Skip non-JSON noise if any
        if (!line.startsWith('{')) return consume();
        clearTimeout(timeout);
        child.stdout.off('data', onData);
        child.off('error', onError);
        try {
          resolveMsg(JSON.parse(line) as McpMessage);
        } catch (error) {
          reject(error);
        }
        return true;
      };

      const onData = (chunk: Buffer) => {
        buffer += chunk.toString();
        consume();
      };
      const onError = (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      };
      child.stdout.on('data', onData);
      child.once('error', onError);
      consume();
    });

  const rpc = async (payload: Record<string, unknown>, label: string): Promise<McpMessage> => {
    child.stdin.write(`${JSON.stringify(payload)}\n`);
    if (payload.method && String(payload.method).startsWith('notifications/')) {
      return {};
    }
    return nextMessage(label);
  };

  try {
    await run(rpc);
    return { stderr };
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 200));
    if (!child.killed) child.kill('SIGKILL');
  }
}

async function mcpHttpListDocuments(baseUrl: string, mcpKey: string): Promise<unknown> {
  const headers = {
    authorization: `Bearer ${mcpKey}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  const res = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 99,
      method: 'tools/call',
      params: { name: 'list_documents', arguments: { limit: 50 } },
    }),
  });
  const body = (await res.json()) as McpMessage;
  if (body.result?.isError) {
    throw new Error(`gateway list_documents error: ${JSON.stringify(body.result)}`);
  }
  return body.result?.structuredContent ?? body.result;
}

describe('S31-05 legacy holocron-mcp repoint', () => {
  let sql: Sql | undefined;
  let service: GatewayHandle | undefined;

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    sql = createSql(DATABASE_URL);
    // Serialize against the sibling registry-execute suite (shared holocron_nonprod).
    await sql`SELECT pg_advisory_lock(310005)`;
    await sql`DELETE FROM documents WHERE title LIKE 's31-05-%'`;
    for (const title of SEEDED_TITLES) {
      await sql`
        INSERT INTO documents (id, title, content, status, is_public)
        VALUES (gen_random_uuid(), ${title}, ${`seed content for ${title}`}, 'draft', false)
      `;
    }
    service = await startMcpGateway({
      keys: KEYS,
      databaseUrl: DATABASE_URL,
    });
  }, 60_000);

  afterAll(async () => {
    if (service) await service.stop();
    if (!sql) return;
    try {
      await sql`DELETE FROM documents WHERE title LIKE 's31-05-%'`;
    } finally {
      await sql`SELECT pg_advisory_unlock(310005)`;
      await sql.end({ timeout: 5 });
    }
  });

  itLive(
    'AC-4 legacy package serves Postgres over stdio with no Convex references',
    async () => {
      if (!service || !sql) throw new Error('live stack required');

      const convexMatches = grepConvexMatches(HOLOCRON_MCP_SRC);
      expect(convexMatches, convexMatches.slice(0, 10).join('\n')).toHaveLength(0);
      expect(existsSync(join(HOLOCRON_MCP_SRC, 'convex/client.ts'))).toBe(false);
      expect(existsSync(join(HOLOCRON_MCP_SRC, 'convex/types.ts'))).toBe(false);

      const asAnyMatches = walkTsFiles(HOLOCRON_MCP_SRC).flatMap((file) => {
        const text = readFileSync(file, 'utf8');
        return /as any\b/.test(text) ? [file] : [];
      });
      expect(asAnyMatches, asAnyMatches.join(', ')).toHaveLength(0);

      const gatewayPayload = await mcpHttpListDocuments(service.baseUrl, KEYS.mcp);

      let legacyStructured: unknown;
      const { stderr } = await withStdioClient(
        {
          ...process.env,
          PLATFORM_URL: service.baseUrl,
          HOLO_KEY_MCP: KEYS.mcp,
          MCP_API_KEY: KEYS.mcp,
          LOG_LEVEL: 'error',
        },
        async (rpc) => {
          const initialized = await rpc(
            {
              jsonrpc: '2.0',
              id: 1,
              method: 'initialize',
              params: {
                protocolVersion: '2025-11-25',
                capabilities: {},
                clientInfo: { name: 's31-05-legacy', version: '1' },
              },
            },
            'initialize'
          );
          expect(initialized.error).toBeUndefined();
          const serverName = initialized.result?.serverInfo?.name ?? '';
          expect(serverName.length).toBeGreaterThanOrEqual(1);

          await rpc(
            { jsonrpc: '2.0', method: 'notifications/initialized' },
            'notifications/initialized'
          );

          const listed = await rpc(
            { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
            'tools/list'
          );
          expect(listed.error).toBeUndefined();
          const tools = listed.result?.tools ?? [];
          expect(tools.length).toBeGreaterThanOrEqual(1);
          for (const tool of tools) {
            expect(() => getTool(tool.name)).not.toThrow();
          }

          const called = await rpc(
            {
              jsonrpc: '2.0',
              id: 3,
              method: 'tools/call',
              params: { name: 'list_documents', arguments: { limit: 50 } },
            },
            'list_documents'
          );
          expect(called.error).toBeUndefined();
          expect(called.result?.isError).not.toBe(true);
          legacyStructured =
            called.result?.structuredContent ??
            (called.result?.content?.[0]?.text
              ? JSON.parse(called.result.content[0].text)
              : undefined);
        }
      );

      const legacyJson = JSON.stringify(legacyStructured);
      for (const title of SEEDED_TITLES) {
        expect(legacyJson).toContain(title);
      }
      expect(legacyStructured).toEqual(gatewayPayload);
      // stdout discipline: child stderr may log, but we already required JSON-only reads
      expect(stderr).not.toMatch(/convex\/browser|convex\/server/i);
    },
    60_000
  );

  itLive(
    'AC-5 unreachable platform surfaces a typed error not a fabricated success',
    async () => {
      if (!service || !sql) throw new Error('live stack required');

      // Control: live platform still returns the seeded corpus
      const control = await mcpHttpListDocuments(service.baseUrl, KEYS.mcp);
      const controlJson = JSON.stringify(control);
      for (const title of SEEDED_TITLES) {
        expect(controlJson).toContain(title);
      }

      await withStdioClient(
        {
          ...process.env,
          // Closed port — TCP refused
          PLATFORM_URL: 'http://127.0.0.1:9',
          HOLO_KEY_MCP: KEYS.mcp,
          MCP_API_KEY: KEYS.mcp,
          LOG_LEVEL: 'error',
        },
        async (rpc) => {
          const initialized = await rpc(
            {
              jsonrpc: '2.0',
              id: 1,
              method: 'initialize',
              params: {
                protocolVersion: '2025-11-25',
                capabilities: {},
                clientInfo: { name: 's31-05-unreachable', version: '1' },
              },
            },
            'initialize'
          );
          expect(initialized.error).toBeUndefined();
          await rpc(
            { jsonrpc: '2.0', method: 'notifications/initialized' },
            'notifications/initialized'
          );

          const called = await rpc(
            {
              jsonrpc: '2.0',
              id: 2,
              method: 'tools/call',
              params: { name: 'list_documents', arguments: { limit: 50 } },
            },
            'list_documents-unreachable'
          );
          expect(called.error).toBeUndefined();
          expect(called.result?.isError).toBe(true);

          const text = called.result?.content?.[0]?.text ?? '';
          expect(text.length).toBeGreaterThanOrEqual(1);

          // Prefer JSON envelope {code,message}; fall back to CODE: message text.
          let code = '';
          let message = '';
          try {
            const parsed = JSON.parse(text) as { code?: string; message?: string };
            code = parsed.code ?? '';
            message = parsed.message ?? '';
          } catch {
            const stripped = text.replace(/^Error:\s*/i, '');
            const sep = stripped.indexOf(':');
            code = sep > 0 ? stripped.slice(0, sep).trim() : '';
            message = sep > 0 ? stripped.slice(sep + 1).trim() : stripped;
          }

          expect(code).toMatch(/^[A-Z][A-Z0-9_]+$/);
          expect(message.length).toBeGreaterThanOrEqual(1);
          expect(message.toLowerCase()).toMatch(
            /platform|unreachable|connect|refused|econnrefused/
          );

          // No fabricated empty success payload
          const structured = called.result?.structuredContent;
          if (structured && typeof structured === 'object' && structured !== null) {
            const docs = (structured as { documents?: unknown }).documents;
            if (Array.isArray(docs)) {
              expect(docs.length).not.toBe(0);
            }
          }
        }
      );

      // Hono control path still works after the unreachable trial (connection lived)
      const app = createHonoApp({ keys: KEYS });
      const list = await app.request('/mcp', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${KEYS.mcp}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: { name: 'list_documents', arguments: { limit: 50 } },
        }),
      });
      expect(list.status).toBe(200);
    },
    60_000
  );
});
