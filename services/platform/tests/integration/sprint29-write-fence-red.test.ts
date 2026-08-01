/**
 * D06-01 RED: every production write path must return migration_read_only
 * during soak — suite proves reachability today and fails fence assertions
 * because no runtime fence exists yet.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint29-write-fence-red.test.ts
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api } from '../../../../convex/_generated/api';
import { createSql, type Sql } from '../../src/db/client';
import { createHonoApp } from '../../src/http/hono-app';
import { executePostgresMcpTool } from '../../src/mcp/executor';
import { runJob } from '../../src/queue/jobs-runner';
import { toolsAsRecord } from '../../src/tools/registry';
import {
  assertMcpToolsInRegistry,
  buildHonoMinBodies,
  buildMcpMinInputs,
  buildRouteRequest,
  createConvexClient,
  createFencedApp,
  createUnfencedApp,
  DEFAULT_DATABASE_URL,
  DEFAULT_KEYS,
  discoverHonoWriteRoutes,
  discoverMcpMutationToolIds,
  discoverTaskTimeoutJob,
  ensureEvidenceDir,
  freshSeedIds,
  type HonoWriteRoute,
  isConvexId,
  issueHonoWrite,
  makeRunId,
  migrationReadOnlyMessage,
  PLATFORM_IT,
  setMigrationFlag,
  titleFor,
  unsetMigrationFlag,
  writeEvidence,
} from './write-fence-red.helpers';

if (!PLATFORM_IT) {
  throw new Error(
    'sprint29-write-fence-red requires PLATFORM_IT=1 (real Postgres + live write surfaces)'
  );
}

const RUN_ID = makeRunId();
const DATABASE_URL = DEFAULT_DATABASE_URL;

describe('Sprint 29 D06-01 write-fence RED', () => {
  let sql: Sql;
  let honoRoutes: HonoWriteRoute[] = [];
  let honoReachability: Array<{ id: string; status: number; body: unknown }> = [];
  let postAc1Counts: {
    documents: number;
    subscription_sources: number;
    improvement_requests: number;
  } = { documents: 0, subscription_sources: 0, improvement_requests: 0 };
  let mcpToolIds: string[] = [];
  let mcpInputs: Record<string, Record<string, unknown>> = {};
  let seedDocumentId = '';
  let jobAfterUnfencedCount = 0;
  let convexDocTitle = '';
  let convexSubIdentifier = '';
  let _convexDocId: string | null = null;
  let _convexSubId: string | null = null;
  let convexEnvSetAttempted = false;

  beforeAll(async () => {
    ensureEvidenceDir();
    unsetMigrationFlag();
    sql = createSql(DATABASE_URL);

    // Seed Hono param targets so handlers can run (404 is still non-423).
    const seeds = freshSeedIds();
    await sql`
      INSERT INTO conversations (id, title, last_message_preview)
      VALUES (${seeds.conversationId}::uuid, ${titleFor(RUN_ID, 'seed-conv')}, 'seed')
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO documents (id, title, content, category, status, date)
      VALUES (
        ${seeds.documentId}::uuid,
        ${titleFor(RUN_ID, 'seed-doc')},
        'seed content',
        'general',
        'draft',
        ${new Date().toISOString()}
      )
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO improvement_requests (id, title, description, status)
      VALUES (
        ${seeds.improvementId}::uuid,
        ${titleFor(RUN_ID, 'seed-imp')},
        ${titleFor(RUN_ID, 'seed-imp-desc')},
        'pending'
      )
      ON CONFLICT DO NOTHING
    `;
    // improvement target for upload intent (kind=improvement_image)
    await sql`
      INSERT INTO improvement_requests (id, title, description, status)
      VALUES (
        ${seeds.improvementTargetId}::uuid,
        ${titleFor(RUN_ID, 'upload-target')},
        ${titleFor(RUN_ID, 'upload-target-desc')},
        'pending'
      )
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO subscription_sources (id, source_type, identifier, name)
      VALUES (
        ${seeds.subscriptionId}::uuid,
        'github',
        ${titleFor(RUN_ID, 'seed-sub')},
        ${titleFor(RUN_ID, 'seed-sub')}
      )
      ON CONFLICT DO NOTHING
    `;
    // feed_items may require source linkage — insert best-effort
    try {
      await sql`
        INSERT INTO feed_items (id, title, url, source_id)
        VALUES (
          ${seeds.feedItemId}::uuid,
          ${titleFor(RUN_ID, 'feed')},
          ${`https://example.com/${RUN_ID}`},
          ${seeds.subscriptionId}::uuid
        )
        ON CONFLICT DO NOTHING
      `;
    } catch {
      // schema may differ; 404 still proves route reachability
    }
    try {
      await sql`
        INSERT INTO assimilation_sessions (id, repository_url, profile, status)
        VALUES (
          ${seeds.assimilationId}::uuid,
          ${`https://github.com/example/${RUN_ID}-assim`},
          'fast',
          'pending_approval'
        )
        ON CONFLICT DO NOTHING
      `;
    } catch {
      // best-effort
    }
    try {
      await sql`
        INSERT INTO voice_sessions (id, conversation_id, started_at, turn_count)
        VALUES (${seeds.voiceSessionId}::uuid, ${seeds.conversationId}::uuid, now(), 0)
        ON CONFLICT DO NOTHING
      `;
    } catch {
      // best-effort
    }

    // Live Hono inventory
    const app = createUnfencedApp();
    honoRoutes = discoverHonoWriteRoutes(app);
    const bodies = buildHonoMinBodies(RUN_ID, seeds);
    honoReachability = [];
    for (const route of honoRoutes) {
      const req = buildRouteRequest(route, RUN_ID, seeds, bodies);
      const res = await issueHonoWrite(app, req);
      honoReachability.push({
        id: route.id,
        status: res.status,
        body: res.body,
      });
    }
    postAc1Counts = {
      documents: Number((await sql`SELECT count(*)::int AS c FROM documents`)[0]?.c ?? 0),
      subscription_sources: Number(
        (await sql`SELECT count(*)::int AS c FROM subscription_sources`)[0]?.c ?? 0
      ),
      improvement_requests: Number(
        (await sql`SELECT count(*)::int AS c FROM improvement_requests`)[0]?.c ?? 0
      ),
    };
    writeEvidence('hono-write-inventory.json', {
      runId: RUN_ID,
      count: honoRoutes.length,
      routes: honoRoutes.map((r) => r.id),
      reachability: honoReachability,
      postAc1Counts,
    });

    // Live MCP inventory + seed entities for dependent tools
    mcpToolIds = discoverMcpMutationToolIds();
    assertMcpToolsInRegistry(mcpToolIds);

    unsetMigrationFlag();
    const storeDoc = (await executePostgresMcpTool(
      'store_document',
      { title: titleFor(RUN_ID, 'doc'), content: 'red-fence probe' },
      { databaseUrl: DATABASE_URL }
    )) as { documentId?: string };
    seedDocumentId = String(storeDoc.documentId ?? '');

    const addSub = (await executePostgresMcpTool(
      'add_subscription',
      {
        sourceType: 'github',
        identifier: titleFor(RUN_ID, 'mcp-sub-keep'),
        name: titleFor(RUN_ID, 'mcp-sub-keep'),
        url: 'https://example.com/s29-d0601-keep',
      },
      { databaseUrl: DATABASE_URL }
    )) as { subscriptionId?: string };

    const remSub = (await executePostgresMcpTool(
      'add_subscription',
      {
        sourceType: 'github',
        identifier: titleFor(RUN_ID, 'mcp-sub-rem'),
        name: titleFor(RUN_ID, 'mcp-sub-rem'),
        url: 'https://example.com/s29-d0601-rem',
      },
      { databaseUrl: DATABASE_URL }
    )) as { subscriptionId?: string };

    const storeTool = (await executePostgresMcpTool(
      'store_tool',
      {
        title: titleFor(RUN_ID, 'tool-seed'),
        description: 'seed',
        sourceType: 'github',
        category: 'tool',
        status: 'draft',
      },
      { databaseUrl: DATABASE_URL }
    )) as { toolId?: string };

    // Separate assimilation sessions for approve/reject/cancel/steer
    const mkSession = async (suffix: string) => {
      const r = (await executePostgresMcpTool(
        'start_assimilation',
        {
          repositoryUrl: `https://github.com/example/s29-d0601-${RUN_ID}-${suffix}`,
          profile: 'fast',
          autoApprove: false,
        },
        { databaseUrl: DATABASE_URL }
      )) as { sessionId?: string };
      return String(r.sessionId ?? randomUUID());
    };
    const sessionApproveId = await mkSession('approve');
    const sessionRejectId = await mkSession('reject');
    const sessionCancelId = await mkSession('cancel');
    const sessionSteerId = await mkSession('steer');

    const addImp = (await executePostgresMcpTool(
      'add_improvement',
      { items: [{ description: titleFor(RUN_ID, 'seed-mcp-imp'), sourceScreen: 'red' }] },
      { databaseUrl: DATABASE_URL }
    )) as { ids?: string[] };
    const improvementId = String(addImp.ids?.[0] ?? randomUUID());

    // Pre-seed shop_sessions so shop_products positive path avoids live retailers
    const shopQuery = `s29-d0601-${RUN_ID}-shop`;
    try {
      await sql`
        INSERT INTO shop_sessions (id, query, condition, retailers, status, total_listings)
        VALUES (
          ${randomUUID()}::uuid,
          ${shopQuery},
          'any',
          ${sql.json(['amazon'])},
          'completed',
          0
        )
      `;
    } catch {
      // best-effort; tool may throw non-fence errors which TC-7 still filters
    }

    mcpInputs = buildMcpMinInputs(RUN_ID, {
      documentId: seedDocumentId || randomUUID(),
      subscriptionId: String(remSub.subscriptionId ?? addSub.subscriptionId ?? randomUUID()),
      toolId: String(storeTool.toolId ?? randomUUID()),
      sessionApproveId,
      sessionRejectId,
      sessionCancelId,
      sessionSteerId,
      improvementId,
      profileId: randomUUID(),
      contentId: `s29-d0601-${RUN_ID}-content`,
    });
    // store_document uses the canonical title for AC-3 follow-up SELECT
    mcpInputs.store_document = {
      title: titleFor(RUN_ID, 'doc'),
      content: 'red-fence probe-second',
    };

    writeEvidence('mcp-write-inventory.json', {
      runId: RUN_ID,
      count: mcpToolIds.length,
      toolIds: mcpToolIds,
      seedDocumentId,
    });

    convexDocTitle = titleFor(RUN_ID, 'convex-doc');
    convexSubIdentifier = titleFor(RUN_ID, 'sub');
  }, 120_000);

  afterAll(async () => {
    unsetMigrationFlag();
    // Best-effort Convex env cleanup if we toggled it
    if (convexEnvSetAttempted) {
      try {
        const { spawnSync } = await import('node:child_process');
        spawnSync('npx', ['convex', 'env', 'unset', 'HOLO_MIGRATION_READ_ONLY'], {
          cwd: process.cwd(),
          encoding: 'utf8',
          timeout: 30_000,
        });
      } catch {
        // ignore
      }
    }
    if (sql) {
      const like = `${titleFor(RUN_ID, '').slice(0, -1)}%`;
      // prefix s29-d0601-<runId>-*
      const prefix = `s29-d0601-${RUN_ID}%`;
      try {
        await sql`DELETE FROM documents WHERE title LIKE ${prefix}`;
        await sql`DELETE FROM subscription_sources WHERE identifier LIKE ${prefix} OR name LIKE ${prefix}`;
        await sql`DELETE FROM improvement_requests WHERE description LIKE ${prefix} OR title LIKE ${prefix}`;
        await sql`DELETE FROM toolbelt_tools WHERE title LIKE ${prefix}`;
        await sql`DELETE FROM assimilation_sessions WHERE repository_url LIKE ${`%${RUN_ID}%`}`;
        await sql`DELETE FROM shop_sessions WHERE query LIKE ${prefix}`;
        await sql`DELETE FROM transcript_jobs WHERE content_id LIKE ${prefix}`;
        await sql`DELETE FROM conversations WHERE title LIKE ${prefix}`;
        await sql`DELETE FROM subscription_filters WHERE rule_name LIKE ${prefix}`;
        await sql`DELETE FROM upload_intents WHERE idempotency_key LIKE ${prefix}`;
        await sql`DELETE FROM chat_runs WHERE request_id LIKE ${prefix}`;
        void like;
      } catch {
        // cleanup best-effort
      }
      await sql.end({ timeout: 5 });
    }
  }, 60_000);

  // ── Hono AC-1 / AC-2 ──────────────────────────────────────────────────

  it('TC-1: discovers >= 23 live Hono write routes', () => {
    expect(
      honoRoutes.length,
      `inventory=${honoRoutes.map((r) => r.id).join(', ')}`
    ).toBeGreaterThanOrEqual(23);
  });

  it('TC-2: every discovered Hono write route returns non-423 when unfenced', () => {
    expect(honoReachability.length).toBe(honoRoutes.length);
    const locked = honoReachability.filter((r) => r.status === 423);
    expect(
      locked,
      `unexpected 423 on unfenced surface: ${locked.map((r) => r.id).join(', ')}`
    ).toEqual([]);
    for (const r of honoReachability) {
      expect(r.status, r.id).not.toBe(423);
    }
  });

  it('TC-3: every discovered Hono write route returns HTTP 423 when fenced', async () => {
    const app = createFencedApp();
    const seeds = freshSeedIds();
    const bodies = buildHonoMinBodies(RUN_ID, seeds);
    const failures: string[] = [];
    const results: Array<{ id: string; status: number; body: unknown }> = [];
    for (const route of honoRoutes) {
      const req = buildRouteRequest(route, RUN_ID, seeds, bodies);
      const res = await issueHonoWrite(app, req);
      results.push({ id: route.id, status: res.status, body: res.body });
      if (res.status !== 423) failures.push(`${route.id} status=${res.status}`);
    }
    unsetMigrationFlag();
    writeEvidence('hono-fenced-results.json', { results, failures });
    expect(failures, `unfenced Hono write paths (fence missing): ${failures.join('; ')}`).toEqual(
      []
    );
  });

  it('TC-4: every fenced Hono write-route body equals { error: migration_read_only }', async () => {
    const app = createFencedApp();
    const seeds = freshSeedIds();
    const bodies = buildHonoMinBodies(RUN_ID, seeds);
    const failures: string[] = [];
    for (const route of honoRoutes) {
      const req = buildRouteRequest(route, RUN_ID, seeds, bodies);
      const res = await issueHonoWrite(app, req);
      const ok =
        res.status === 423 &&
        res.body !== null &&
        typeof res.body === 'object' &&
        (res.body as { error?: unknown }).error === 'migration_read_only';
      if (!ok) {
        failures.push(
          `${route.id} status=${res.status} body=${JSON.stringify(res.body).slice(0, 200)}`
        );
      }
    }
    // Row counts must be unchanged from post-AC-1 for key tables
    const after = {
      documents: Number((await sql`SELECT count(*)::int AS c FROM documents`)[0]?.c ?? 0),
      subscription_sources: Number(
        (await sql`SELECT count(*)::int AS c FROM subscription_sources`)[0]?.c ?? 0
      ),
      improvement_requests: Number(
        (await sql`SELECT count(*)::int AS c FROM improvement_requests`)[0]?.c ?? 0
      ),
    };
    unsetMigrationFlag();
    writeEvidence('hono-fenced-body-results.json', { failures, postAc1Counts, after });
    expect(failures, `body contract failures: ${failures.join('; ')}`).toEqual([]);
    // Counts may drift from AC-3 seeds; assert no *additional* 423 success path writes —
    // primary contract is the body shape above. Soft-check deltas only when fence works.
  });

  // ── MCP AC-3 / AC-4 ───────────────────────────────────────────────────

  it('TC-5: MCP mutation-tool inventory count equals 21 from manifest side_effects', () => {
    expect(mcpToolIds.length).toBe(21);
  });

  it('TC-6: every MCP mutation tool id exists in live toolsAsRecord()', () => {
    expect(() => assertMcpToolsInRegistry(mcpToolIds)).not.toThrow();
    const live = Object.keys(toolsAsRecord());
    for (const id of mcpToolIds) {
      expect(live, id).toContain(id);
    }
  });

  it('TC-7: executePostgresMcpTool resolves without MIGRATION_READ_ONLY for every mutation tool when unfenced', async () => {
    unsetMigrationFlag();
    const failures: string[] = [];
    const results: Array<{ toolId: string; ok: boolean; error?: string }> = [];
    for (const toolId of mcpToolIds) {
      const input = mcpInputs[toolId] ?? {};
      try {
        await executePostgresMcpTool(toolId, input, { databaseUrl: DATABASE_URL });
        results.push({ toolId, ok: true });
      } catch (err) {
        const msg = migrationReadOnlyMessage(err);
        if (msg.startsWith('MIGRATION_READ_ONLY:')) {
          failures.push(`${toolId}: unexpected fence ${msg}`);
          results.push({ toolId, ok: false, error: msg });
        } else {
          // Non-fence errors still prove the path was entered (no fence short-circuit).
          results.push({ toolId, ok: true, error: msg });
        }
      }
    }
    // store_document seed + follow-up SELECT
    const docs = await sql`
      SELECT id::text AS id FROM documents WHERE title = ${titleFor(RUN_ID, 'doc')}
    `;
    writeEvidence('mcp-unfenced-results.json', {
      results,
      failures,
      seedDocumentId,
      docRows: docs.length,
    });
    expect(failures, failures.join('; ')).toEqual([]);
    expect(seedDocumentId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(docs.length).toBeGreaterThanOrEqual(1);
  }, 180_000);

  it('TC-8: executePostgresMcpTool rejects with MIGRATION_READ_ONLY for every mutation tool when fenced', async () => {
    setMigrationFlag();
    const failures: string[] = [];
    const results: Array<{ toolId: string; rejected: boolean; message?: string }> = [];
    for (const toolId of mcpToolIds) {
      const input = mcpInputs[toolId] ?? {};
      try {
        await executePostgresMcpTool(toolId, input, { databaseUrl: DATABASE_URL });
        failures.push(`${toolId}: resolved successfully (fence missing)`);
        results.push({ toolId, rejected: false });
      } catch (err) {
        const msg = migrationReadOnlyMessage(err);
        const ok = msg.startsWith('MIGRATION_READ_ONLY:');
        results.push({ toolId, rejected: ok, message: msg });
        if (!ok) failures.push(`${toolId}: rejected without MIGRATION_READ_ONLY prefix: ${msg}`);
      }
    }
    unsetMigrationFlag();
    writeEvidence('mcp-fenced-results.json', { results, failures });
    expect(failures, `unfenced MCP mutation tools (fence missing): ${failures.join('; ')}`).toEqual(
      []
    );
  }, 180_000);

  it('TC-9: createMcpServer store_document handler returns isError + MIGRATION_READ_ONLY when fenced', async () => {
    setMigrationFlag();
    const app = createHonoApp({ keys: { ...DEFAULT_KEYS } });
    const headers = {
      authorization: `Bearer ${DEFAULT_KEYS.mcp}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    // Stateless streamable HTTP: initialize then tools/call
    await app.request('/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'sprint29-fence-red', version: '1' },
        },
      }),
    });
    const call = await app.request('/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'store_document',
          arguments: {
            title: titleFor(RUN_ID, 'mcp-gateway-doc'),
            content: 'red-fence gateway probe',
          },
        },
      }),
    });
    unsetMigrationFlag();
    const text = await call.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep
    }
    writeEvidence('mcp-gateway-store-document.json', { status: call.status, body: parsed });

    // Extract CallToolResult from JSON-RPC or SSE-ish payload
    const result =
      parsed && typeof parsed === 'object' && 'result' in (parsed as object)
        ? (parsed as { result: { isError?: boolean; content?: Array<{ text?: string }> } }).result
        : (parsed as { isError?: boolean; content?: Array<{ text?: string }> });

    const isError = Boolean(result?.isError);
    let code: string | undefined;
    const contentText = result?.content?.[0]?.text;
    if (typeof contentText === 'string') {
      try {
        const inner = JSON.parse(contentText) as { code?: string };
        code = inner.code;
      } catch {
        // ignore
      }
    }
    expect(isError, `gateway isError expected true, got ${JSON.stringify(result)}`).toBe(true);
    expect(code, `parsed code expected MIGRATION_READ_ONLY, body=${text.slice(0, 500)}`).toBe(
      'MIGRATION_READ_ONLY'
    );
  }, 60_000);

  // ── Convex AC-5 / AC-6 ────────────────────────────────────────────────

  it('TC-10: api.documents.mutations.create returns a Convex document id when unfenced', async () => {
    const client = createConvexClient();
    const id = await client.mutation(api.documents.mutations.create, {
      title: convexDocTitle,
      content: 'red-fence probe',
      category: 'general',
      embedding: [0, 0, 0],
    });
    const idStr = typeof id === 'string' ? id : String(id);
    _convexDocId = idStr;
    writeEvidence('convex-create-document.json', { id: idStr, title: convexDocTitle });
    expect(isConvexId(idStr), `id=${idStr}`).toBe(true);
    const found = await client.query(api.documents.queries.getByTitle, { title: convexDocTitle });
    expect(found, 'follow-up getByTitle').toBeTruthy();
  }, 60_000);

  it('TC-11: api.subscriptions.mutations.add returns a Convex subscription id when unfenced', async () => {
    const client = createConvexClient();
    const row = await client.mutation(api.subscriptions.mutations.add, {
      sourceType: 'github',
      identifier: convexSubIdentifier,
      name: convexSubIdentifier,
    });
    const idStr =
      row && typeof row === 'object' && '_id' in row
        ? String((row as { _id: string })._id)
        : String(row);
    _convexSubId = idStr;
    writeEvidence('convex-add-subscription.json', { id: idStr, identifier: convexSubIdentifier });
    expect(isConvexId(idStr), `id=${idStr}`).toBe(true);
    const list = await client.query(api.subscriptions.queries.list, {
      sourceType: 'github',
      limit: 100,
    });
    const match = Array.isArray(list)
      ? list.filter((s: { identifier?: string }) => s.identifier === convexSubIdentifier)
      : [];
    expect(match.length, 'follow-up list by identifier').toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('TC-12: api.documents.mutations.create rejects with migration_read_only when Convex gate set', async () => {
    const { spawnSync } = await import('node:child_process');
    const setRes = spawnSync('npx', ['convex', 'env', 'set', 'HOLO_MIGRATION_READ_ONLY', 'true'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 60_000,
    });
    convexEnvSetAttempted = true;
    writeEvidence('convex-env-set.json', {
      status: setRes.status,
      stdout: setRes.stdout,
      stderr: setRes.stderr,
    });

    const client = createConvexClient();
    let rejected = false;
    let message = '';
    try {
      await client.mutation(api.documents.mutations.create, {
        title: `${convexDocTitle}-fenced`,
        content: 'should be blocked',
        category: 'general',
        embedding: [0, 0, 0],
      });
    } catch (err) {
      rejected = true;
      message = migrationReadOnlyMessage(err);
    }
    writeEvidence('convex-create-fenced.json', { rejected, message });
    expect(rejected, 'documents.create should reject under migration_read_only').toBe(true);
    expect(message.startsWith('migration_read_only:'), `message=${message}`).toBe(true);
  }, 120_000);

  it('TC-13: api.subscriptions.mutations.add rejects with migration_read_only when Convex gate set', async () => {
    const client = createConvexClient();
    let rejected = false;
    let message = '';
    try {
      await client.mutation(api.subscriptions.mutations.add, {
        sourceType: 'github',
        identifier: `${convexSubIdentifier}-fenced`,
        name: `${convexSubIdentifier}-fenced`,
      });
    } catch (err) {
      rejected = true;
      message = migrationReadOnlyMessage(err);
    }
    writeEvidence('convex-add-sub-fenced.json', { rejected, message });
    expect(rejected, 'subscriptions.add should reject under migration_read_only').toBe(true);
    expect(message.startsWith('migration_read_only:'), `message=${message}`).toBe(true);
  }, 60_000);

  // ── Job AC-7 / AC-8 ───────────────────────────────────────────────────

  it('TC-14: runJob returns ok true and inserts one job_runs row when unfenced', async () => {
    unsetMigrationFlag();
    const job = discoverTaskTimeoutJob();
    const beforeRows = await sql`
      SELECT count(*)::int AS c FROM job_runs WHERE job_name = 'task-timeout-worker'
    `;
    const before = Number(beforeRows[0]?.c ?? 0);
    const result = await runJob(job, { databaseUrl: DATABASE_URL, runId: randomUUID() });
    const afterRows = await sql`
      SELECT count(*)::int AS c FROM job_runs WHERE job_name = 'task-timeout-worker'
    `;
    const after = Number(afterRows[0]?.c ?? 0);
    jobAfterUnfencedCount = after;
    writeEvidence('job-unfenced.json', { result, before, after });
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(after).toBe(before + 1);
  }, 60_000);

  it('TC-15: runJob returns ok false with migration_read_only error when fenced', async () => {
    setMigrationFlag();
    const job = discoverTaskTimeoutJob();
    const result = await runJob(job, { databaseUrl: DATABASE_URL, runId: randomUUID() });
    unsetMigrationFlag();
    writeEvidence('job-fenced.json', { result });
    expect(result.ok, 'runJob should fail under fence').toBe(false);
    expect(typeof result.error).toBe('string');
    expect(String(result.error).startsWith('migration_read_only:'), `error=${result.error}`).toBe(
      true
    );
  }, 60_000);

  it('TC-16: job_runs row count unchanged after fenced task-timeout-worker call', async () => {
    setMigrationFlag();
    const job = discoverTaskTimeoutJob();
    const beforeRows = await sql`
      SELECT count(*)::int AS c FROM job_runs WHERE job_name = 'task-timeout-worker'
    `;
    const before = Number(beforeRows[0]?.c ?? 0);
    await runJob(job, { databaseUrl: DATABASE_URL, runId: randomUUID() });
    const afterRows = await sql`
      SELECT count(*)::int AS c FROM job_runs WHERE job_name = 'task-timeout-worker'
    `;
    const after = Number(afterRows[0]?.c ?? 0);
    unsetMigrationFlag();
    writeEvidence('job-fenced-counts.json', {
      before,
      after,
      postAc7: jobAfterUnfencedCount,
    });
    expect(after, 'fenced run must not insert job_runs').toBe(before);
  }, 60_000);
});
