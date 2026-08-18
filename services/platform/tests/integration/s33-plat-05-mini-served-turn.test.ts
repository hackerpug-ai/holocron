/**
 * S33-PLAT-05 live integration contract.
 *
 * This suite intentionally reaches the real fleet router and Postgres. It
 * does not replace a provider, database, HTTP transport, or Mastra primitive.
 */
import { randomUUID } from 'node:crypto';
import { access, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Mastra } from '@mastra/core/mastra';
import { Hono } from 'hono';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createFleetAgentWithResolved,
  isAllowedFleetRouterEndpoint,
  runAgentCell,
} from '../../src/compat/cells/agent.ts';
import { createSql } from '../../src/db/client.ts';
import { createHonoApp, type HonoAppVariables } from '../../src/http/hono-app.ts';
import { createScopedKeyMiddleware } from '../../src/http/middleware/scoped-key.ts';
import { listInferenceTelemetry } from '../../src/inference/telemetry.ts';
import { createStorage } from '../../src/mastra.ts';

const platformIt = process.env.PLATFORM_IT === '1';
const fleetUrl = process.env.FLEET_URL?.trim();
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!platformIt) {
  throw new Error('S33-PLAT-05 requires PLATFORM_IT=1; this suite only runs against real services');
}
if (!fleetUrl) {
  throw new Error('S33-PLAT-05 requires FLEET_URL for the real fleet router');
}
const fleetOrigin = new URL(fleetUrl);
if (['localhost', '127.0.0.1', '::1'].includes(fleetOrigin.hostname)) {
  throw new Error('S33-PLAT-05 requires a non-loopback fleet router endpoint');
}
if (!databaseUrl) {
  throw new Error('S33-PLAT-05 requires DATABASE_URL for real Postgres readback');
}
const scopedRnKey: string = process.env.HOLO_KEY_RN?.trim() ?? '';
if (!scopedRnKey) {
  throw new Error('S33-PLAT-05 requires HOLO_KEY_RN for the real scoped Hono route');
}

const sql = createSql(databaseUrl);

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

type PublicChatRun = {
  status: string;
  finalText?: string;
  errorCode?: string;
  events: Array<{ event_type: string; data_json: unknown }>;
};

type MutatedChatRuns = typeof import('../../src/http/chat-runs.ts');

async function importMutatedChatRuns(
  root: string,
  name: string,
  source: string
): Promise<MutatedChatRuns> {
  const sourceRoot = join(root, name, 'services/platform/src');
  const httpRoot = join(sourceRoot, 'http');
  await mkdir(httpRoot, { recursive: true });
  const copyPath = join(httpRoot, 'chat-runs.ts');
  await writeFile(copyPath, source, 'utf8');
  const copyStat = await lstat(copyPath);
  if (!copyStat.isFile() || copyStat.isSymbolicLink()) {
    throw new Error(`mutation source copy is not a regular file: ${copyPath}`);
  }

  const actualSourceRoot = join(process.cwd(), 'services/platform/src');
  for (const directory of ['chat', 'compat', 'db', 'inference', 'mastra']) {
    await symlink(join(actualSourceRoot, directory), join(sourceRoot, directory), 'dir');
  }
  await symlink(
    join(actualSourceRoot, 'http/chat-stream-gate.ts'),
    join(httpRoot, 'chat-stream-gate.ts'),
    'file'
  );
  await symlink(join(actualSourceRoot, 'mastra.ts'), join(sourceRoot, 'mastra.ts'), 'file');

  return import(`${pathToFileURL(copyPath).href}?mutation=${name}-${randomUUID()}`);
}

function createMutatedHonoApp(
  chatRuns: MutatedChatRuns,
  databaseUrlForMutation: string
): Hono<{ Variables: HonoAppVariables }> {
  const app = new Hono<{ Variables: HonoAppVariables }>();
  app.use(
    '*',
    createScopedKeyMiddleware({
      rn: scopedRnKey,
      mcp: '',
      control: '',
    })
  );
  app.post('/api/chat-runs', async (c) => {
    try {
      const result = await chatRuns.createChatRun(await c.req.json(), 'rn', {
        databaseUrl: databaseUrlForMutation,
      });
      return c.json(result, 200);
    } catch (error) {
      return Response.json(
        {
          error: 'chat_run_error',
          message: error instanceof Error ? error.message : String(error),
        },
        { status: 422 }
      );
    }
  });
  app.get('/api/chat-runs/:id', async (c) => {
    const result = await chatRuns.getChatRun(c.req.param('id'), {
      ownerScope: 'rn',
      databaseUrl: databaseUrlForMutation,
    });
    if (!result) return c.json({ error: 'not_found', message: 'chat run not found' }, 404);
    return c.json(result, 200);
  });
  return app;
}

async function waitForTerminalRun(
  app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> },
  runId: string
): Promise<PublicChatRun> {
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const response = await app.request(`/api/chat-runs/${runId}`, {
      headers: { authorization: `Bearer ${scopedRnKey}` },
    });
    if (!response.ok) throw new Error(`public GET chat run ${runId} returned ${response.status}`);
    const result = (await response.json()) as PublicChatRun;
    if (['completed', 'blocked', 'failed'].includes(result.status)) return result;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`chat run ${runId} did not terminalize within 300 seconds`);
}

describe('S33-PLAT-05 real fleet and public chat accounting', () => {
  it('AC-5 guard control: only approved Holocron fleet routers pass preflight', () => {
    expect(isAllowedFleetRouterEndpoint(fleetUrl)).toBe(true);
    expect(isAllowedFleetRouterEndpoint('https://api.openai.com/v1')).toBe(false);
    expect(isAllowedFleetRouterEndpoint('http://unknown.invalid:4545/v1')).toBe(false);
    expect(isAllowedFleetRouterEndpoint('http://holocron.tail011a51.ts.net:4545/v1/evil')).toBe(
      false
    );
  });

  it('AC-3: a real non-loopback fleet request reports request accounting and its endpoint', async () => {
    const result = await runAgentCell(new Mastra({ storage: createStorage() }));

    expect(result.ok, result.error).toBe(true);
    expect(result.text?.trim().length ?? 0).toBeGreaterThanOrEqual(1);
    expect(result.cloudRequests).toBe(0);
    expect(typeof result.runId, 'run-scoped fleet accounting run id').toBe('string');
    expect(
      result.fleetRequests,
      'resolved non-loopback fleet request count'
    ).toBeGreaterThanOrEqual(1);

    const rows = await sql<
      { endpoint: string; provider: string; role: string; step_id: string | null }[]
    >`
      SELECT endpoint, provider, role, step_id
      FROM inference_telemetry
      WHERE run_id = ${result.runId}
        AND step_id = 'compat/cells/agent'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    expect(rows, 'real compat/cells/agent telemetry row').toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: 'fleet', role: 'divergent' });
    expect(rows[0]?.endpoint).toBe(
      `${fleetOrigin.origin + fleetOrigin.pathname.replace(/\/$/, '').replace(/\/v1$/i, '')}/v1`
    );
    console.info(
      'S33-PLAT-05-EVIDENCE',
      JSON.stringify({
        ac: 'AC-3',
        runId: result.runId,
        textLength: result.text?.trim().length ?? 0,
        modelRequests: result.modelRequests,
        fleetRequests: result.fleetRequests,
        cloudRequests: result.cloudRequests,
        unknownRequests: result.unknownRequests,
        endpoint: rows[0]?.endpoint,
        provider: rows[0]?.provider,
      })
    );
  }, 300_000);

  it('AC-5: the public agent.stream boundary accounts for every real model transport call', async () => {
    const runId = randomUUID();
    const bundle = await createFleetAgentWithResolved({
      role: 'divergent',
      agentId: `s33-plat-05-${runId}`,
      resolveOptions: { endpointOverride: fleetUrl },
    });
    const stream = await bundle.agent.stream(
      `S33 public boundary ${runId}: reply with one short sentence.`,
      { maxSteps: 1 }
    );
    let text = '';
    for await (const chunk of stream.fullStream) {
      if (chunk.type === 'text-delta') text += chunk.payload?.text ?? '';
    }

    expect(text.trim().length).toBeGreaterThanOrEqual(1);
    const rows = await listInferenceTelemetry({ runId, databaseUrl });
    expect(
      rows.length,
      'one durable row per underlying public model invocation'
    ).toBeGreaterThanOrEqual(1);
    expect(rows.every((row) => row.runId === runId)).toBe(true);
    expect(rows.every((row) => row.provider === 'fleet')).toBe(true);
    expect(rows.every((row) => row.endpoint === `${fleetOrigin.origin}/v1`)).toBe(true);
    console.info(
      'S33-PLAT-05-EVIDENCE',
      JSON.stringify({
        ac: 'AC-5-public-boundary',
        runId,
        textLength: text.trim().length,
        modelRequests: rows.length,
        fleetRequests: rows.length,
        cloudRequests: 0,
        unknownRequests: 0,
        endpoint: rows[0]?.endpoint,
        provider: rows[0]?.provider,
      })
    );
  }, 300_000);

  it('AC-5: a real public chat run creates before its fleet stream is observed', async () => {
    const app = createHonoApp({ keys: { rn: scopedRnKey, mcp: '', control: '' } });
    const requestId = `s33-plat-05-${randomUUID()}`;
    const createResponse = await app.request('/api/chat-runs', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${scopedRnKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        requestId,
        msg: `S33 nonce ${randomUUID()}: reply with one short sentence.`,
      }),
    });
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as { runId: string };
    expect(created.runId).toMatch(/^[0-9a-f-]{36}$/i);
    const terminal = await waitForTerminalRun(app, created.runId);

    expect(terminal).not.toBeNull();
    if (!terminal) throw new Error(`chat run ${created.runId} did not return a terminal row`);
    expect(terminal.status).toBe('completed');
    expect(terminal.finalText?.trim().length ?? 0).toBeGreaterThanOrEqual(10);

    const rows = await listInferenceTelemetry({ runId: created.runId, databaseUrl });
    expect(rows.length, 'public run telemetry').toBeGreaterThanOrEqual(1);
    expect(rows.every((row) => row.runId === created.runId)).toBe(true);
    expect(rows.every((row) => row.provider === 'fleet')).toBe(true);
    expect(rows.every((row) => row.endpoint === `${fleetOrigin.origin}/v1`)).toBe(true);

    const persistedResponse = await app.request(`/api/chat-runs/${created.runId}`, {
      headers: { authorization: `Bearer ${scopedRnKey}` },
    });
    expect(persistedResponse.status).toBe(200);
    const persisted = (await persistedResponse.json()) as PublicChatRun;
    const accounting = persisted.events.find((event) => event.event_type === 'model-accounting');
    expect(accounting, 'request-scoped terminal accounting event').toBeDefined();
    expect(accounting?.data_json).toMatchObject({
      requestId,
      runId: created.runId,
      terminalized: true,
      modelRequests: expect.any(Number),
      fleetRequests: expect.any(Number),
      cloudRequests: 0,
      unknownRequests: 0,
      reconciliationComplete: true,
    });
    const accountingData = accounting?.data_json as Record<string, unknown>;
    expect(accountingData.modelRequests).toBeGreaterThanOrEqual(1);
    expect(accountingData.fleetRequests).toBeGreaterThanOrEqual(1);
    expect(accountingData.cloudRequests).toBe(0);
    expect(accountingData.unknownRequests).toBe(0);
    expect(accountingData.underlyingTransportCalls).toBe(rows.length);
    expect(accountingData.modelRequests).toBe(rows.length);
    expect(accountingData.telemetryRows).toBe(rows.length);
    expect(accountingData.instrumentationBoundary).toBe('provider-model');
    expect(accountingData.responseHeaderApiBases).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^http:\/\/inference[12]\.tail011a51\.ts\.net:8003\/v1$/),
      ])
    );
    expect(accountingData.responseHeaderApiBases).toHaveLength(rows.length);
    expect(
      (accountingData.responseHeaderApiBases as string[]).every((value) =>
        /^http:\/\/inference[12]\.tail011a51\.ts\.net:8003\/v1$/.test(value)
      )
    ).toBe(true);
    expect(accountingData.responseHeaderApiBase).toBe(
      (accountingData.responseHeaderApiBases as string[])[0]
    );
    expect(accountingData.modelRequests).toBe(
      Number(accountingData.fleetRequests) +
        Number(accountingData.cloudRequests) +
        Number(accountingData.unknownRequests)
    );
    expect(accountingData.responseHeaderApiBase).toMatch(
      /^http:\/\/inference[12]\.tail011a51\.ts\.net:8003\/v1$/
    );
    console.info(
      'S33-PLAT-05-EVIDENCE',
      JSON.stringify({
        ac: 'AC-5-public-chat',
        requestId,
        runId: created.runId,
        status: terminal.status,
        textLength: terminal.finalText?.trim().length ?? 0,
        telemetryRows: rows.length,
        accounting: accounting?.data_json,
      })
    );
  }, 300_000);

  it('AC-5: a real public tool loop records at least two underlying model calls', async () => {
    const app = createHonoApp({ keys: { rn: scopedRnKey, mcp: '', control: '' } });
    const requestId = `s33-plat-05-tool-loop-${randomUUID()}`;
    const createResponse = await app.request('/api/chat-runs', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${scopedRnKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        requestId,
        maxSteps: 2,
        msg: 'Planner MUST call create_plan. Perform at least 2 sequential tool calls before answering.',
      }),
    });
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as { runId: string };
    const terminal = await waitForTerminalRun(app, created.runId);
    expect(terminal.status).toBe('completed');

    const rows = await listInferenceTelemetry({ runId: created.runId, databaseUrl });
    expect(rows.length, 'real tool-loop model telemetry').toBeGreaterThanOrEqual(2);
    expect(rows.every((row) => row.provider === 'fleet')).toBe(true);
    expect(rows.every((row) => row.endpoint === `${fleetOrigin.origin}/v1`)).toBe(true);
    const persistedResponse = await app.request(`/api/chat-runs/${created.runId}`, {
      headers: { authorization: `Bearer ${scopedRnKey}` },
    });
    expect(persistedResponse.status).toBe(200);
    const persisted = (await persistedResponse.json()) as PublicChatRun;
    const accounting = persisted.events.find((event) => event.event_type === 'model-accounting');
    expect(accounting).toBeDefined();
    const data = accounting?.data_json as Record<string, unknown>;
    expect(data.modelRequests).toBe(rows.length);
    expect(data.modelRequests).toBeGreaterThanOrEqual(2);
    expect(data.underlyingTransportCalls).toBe(rows.length);
    expect(data.telemetryRows).toBe(rows.length);
    expect(data.fleetRequests).toBeGreaterThanOrEqual(2);
    expect(data.cloudRequests).toBe(0);
    expect(data.unknownRequests).toBe(0);
    expect(data.instrumentationBoundary).toBe('provider-model');
    expect(data.responseHeaderApiBases).toHaveLength(rows.length);
    expect(
      (data.responseHeaderApiBases as string[]).every((value) =>
        /^http:\/\/inference[12]\.tail011a51\.ts\.net:8003\/v1$/.test(value)
      )
    ).toBe(true);
    expect(data.responseHeaderApiBase).toBe((data.responseHeaderApiBases as string[])[0]);
    expect(data.reconciliationComplete).toBe(true);
    console.info(
      'S33-PLAT-05-EVIDENCE',
      JSON.stringify({
        ac: 'AC-5-public-tool-loop',
        requestId,
        runId: created.runId,
        status: terminal.status,
        telemetryRows: rows.length,
        accounting: data,
      })
    );
  }, 300_000);

  it('AC-5: executable source-copy mutations fail through the real public boundary', async () => {
    const sourcePath = new URL('../../src/http/chat-runs.ts', import.meta.url);
    const source = await readFile(sourcePath, 'utf8');
    const root = await mkdtemp(join(tmpdir(), 's33-plat-05-accounting-'));
    const mutations: Array<{
      name: string;
      mutate: (input: string) => string;
      maxSteps: number;
      message: string;
    }> = [
      {
        name: 'missing-wrapper',
        mutate: (input) =>
          input.replace(
            'await runWithModelRequestAccounting(requestAccounting, () =>',
            'await (async () =>'
          ),
        maxSteps: 1,
        message: `S33 missing wrapper ${randomUUID()}: reply with one short sentence.`,
      },
      {
        name: 'outer-stream-only',
        mutate: (input) =>
          input.replace(
            'await runWithModelRequestAccounting(requestAccounting, async () => {',
            'await (async () => {'
          ),
        maxSteps: 2,
        message:
          'Planner MUST call create_plan. Perform at least 2 sequential tool calls before answering.',
      },
      {
        name: 'global-fetch-patch',
        mutate: (input) => {
          const withPatch = input.replace(
            'const result = await runWithModelRequestAccounting(requestAccounting, () =>',
            `const mutationOriginalFetch = globalThis.fetch;
          globalThis.fetch = ((...args: Parameters<typeof fetch>) => mutationOriginalFetch(...args)) as typeof fetch;
          requestAccounting.instrumentationBoundary = 'global-fetch';
          const result = await runWithModelRequestAccounting(requestAccounting, () =>`
          );
          return withPatch.replace(
            '          await runWithModelRequestAccounting(requestAccounting, async () => {',
            `          globalThis.fetch = mutationOriginalFetch;
          await runWithModelRequestAccounting(requestAccounting, async () => {`
          );
        },
        maxSteps: 1,
        message: `S33 global fetch ${randomUUID()}: reply with one short sentence.`,
      },
      {
        name: 'direct-cloud-api-openai',
        mutate: (input) =>
          input.replace(
            'role: specialist.fleetRole,\n          agentId:',
            'role: specialist.fleetRole,\n          resolveOptions: { endpointOverride: "https://api.openai.com/v1" },\n          agentId:'
          ),
        maxSteps: 1,
        message: `S33 direct cloud ${randomUUID()}: reply with one short sentence.`,
      },
      {
        name: 'unknown-transport',
        mutate: (input) =>
          input.replace(
            'role: specialist.fleetRole,\n          agentId:',
            'role: specialist.fleetRole,\n          resolveOptions: { endpointOverride: "http://unknown.invalid:4545/v1" },\n          agentId:'
          ),
        maxSteps: 1,
        message: `S33 unknown transport ${randomUUID()}: reply with one short sentence.`,
      },
      {
        name: 'counter-mismatch',
        mutate: (input) =>
          input.replace(
            'createModelRequestAccountingEvent(accountingSnapshot, telemetryRows)',
            'createModelRequestAccountingEvent(accountingSnapshot, telemetryRows + 1)'
          ),
        maxSteps: 1,
        message: `S33 counter mismatch ${randomUUID()}: reply with one short sentence.`,
      },
    ];

    try {
      for (const mutation of mutations) {
        const mutated = mutation.mutate(source);
        expect(mutated, `${mutation.name} must mutate a source copy`).not.toBe(source);
        const chatRuns = await importMutatedChatRuns(root, mutation.name, mutated);
        const app = createMutatedHonoApp(chatRuns, databaseUrl);
        const requestId = `s33-plat-05-mutation-${mutation.name}-${randomUUID()}`;
        const createResponse = await app.request('/api/chat-runs', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${scopedRnKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            requestId,
            maxSteps: mutation.maxSteps,
            msg: mutation.message,
          }),
        });
        expect(createResponse.status, `${mutation.name} public POST`).toBe(200);
        const created = (await createResponse.json()) as { runId: string };
        const terminal = await waitForTerminalRun(app, created.runId);
        expect(terminal.status, `${mutation.name} must fail closed`).toBe('failed');
        const persistedResponse = await app.request(`/api/chat-runs/${created.runId}`, {
          headers: { authorization: `Bearer ${scopedRnKey}` },
        });
        expect(persistedResponse.status).toBe(200);
        const persisted = (await persistedResponse.json()) as PublicChatRun;
        const accounting = persisted.events.find(
          (event) => event.event_type === 'model-accounting'
        );
        expect(
          accounting,
          `${mutation.name} must not persist successful accounting`
        ).toBeUndefined();
        const rows = await listInferenceTelemetry({ runId: created.runId, databaseUrl });
        if (mutation.name === 'direct-cloud-api-openai' || mutation.name === 'unknown-transport') {
          expect(rows, `${mutation.name} must fail before provider request`).toHaveLength(0);
        }
        expect(terminal.errorCode, `${mutation.name} must expose a terminal rejection`).toMatch(
          /ROLE_UNAVAILABLE|CHAT_RUN_FAILED/
        );
        console.info(
          'S33-PLAT-05-MUTATION-RECEIPT',
          JSON.stringify({
            mutation: mutation.name,
            runId: created.runId,
            status: terminal.status,
            errorCode: terminal.errorCode,
            telemetryRows: rows.length,
            successfulAccountingEvent: false,
            regularSourceCopy: true,
          })
        );
      }
      console.info(
        'S33-PLAT-05-EVIDENCE',
        JSON.stringify({
          ac: 'AC-5-accounting-mutations-executed',
          controls: mutations.map(({ name }) => name),
          allRejected: true,
          executableSourceTopology: root,
          realPublicHono: true,
          realPostgres: true,
          realFleet: true,
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
      await expect(access(root)).rejects.toThrow();
    }
  }, 300_000);
});
