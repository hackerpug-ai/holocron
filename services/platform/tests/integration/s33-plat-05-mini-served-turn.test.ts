/**
 * S33-PLAT-05 live integration contract.
 *
 * This suite intentionally reaches the real fleet router and Postgres. It
 * does not replace a provider, database, HTTP transport, or Mastra primitive.
 */
import { randomUUID } from 'node:crypto';
import { Mastra } from '@mastra/core/mastra';
import { afterAll, describe, expect, it } from 'vitest';
import { createFleetAgentWithResolved, runAgentCell } from '../../src/compat/cells/agent.ts';
import { createSql } from '../../src/db/client.ts';
import { createChatRun, getChatRun } from '../../src/http/chat-runs.ts';
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

const sql = createSql(databaseUrl);

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

async function waitForTerminalRun(runId: string): Promise<Awaited<ReturnType<typeof getChatRun>>> {
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const result = await getChatRun(runId, { databaseUrl });
    if (!result) throw new Error(`chat run ${runId} disappeared`);
    if (['completed', 'blocked', 'failed'].includes(result.status)) return result;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`chat run ${runId} did not terminalize within 300 seconds`);
}

describe('S33-PLAT-05 real fleet and public chat accounting', () => {
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
  }, 300_000);

  it('AC-5: a real public chat run creates before its fleet stream is observed', async () => {
    const requestId = `s33-plat-05-${randomUUID()}`;
    const created = await createChatRun(
      {
        requestId,
        msg: `S33 nonce ${randomUUID()}: reply with one short sentence.`,
      },
      'mcp',
      { databaseUrl }
    );
    const terminal = await waitForTerminalRun(created.runId);

    expect(terminal).not.toBeNull();
    if (!terminal) throw new Error(`chat run ${created.runId} did not return a terminal row`);
    expect(terminal.status).toBe('completed');
    expect(terminal.finalText?.trim().length ?? 0).toBeGreaterThanOrEqual(10);

    const rows = await listInferenceTelemetry({ runId: created.runId, databaseUrl });
    expect(rows.length, 'public run telemetry').toBeGreaterThanOrEqual(1);
    expect(rows.every((row) => row.runId === created.runId)).toBe(true);
    expect(rows.every((row) => row.provider === 'fleet')).toBe(true);
    expect(rows.every((row) => row.endpoint === `${fleetOrigin.origin}/v1`)).toBe(true);

    const persisted = await getChatRun(created.runId, { databaseUrl });
    const accounting = persisted?.events.find((event) => event.event_type === 'model-accounting');
    expect(accounting, 'request-scoped terminal accounting event').toBeDefined();
    expect(accounting?.data_json).toMatchObject({
      requestId,
      runId: created.runId,
      terminalized: true,
      modelRequests: expect.any(Number),
      fleetRequests: expect.any(Number),
      cloudRequests: 0,
      unknownRequests: 0,
    });
  }, 300_000);
});
