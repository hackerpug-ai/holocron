/**
 * S31-MCP-02: Prove mutation replay leaves exactly one row for every
 * declared-idempotent (or semi-idempotent) MCP mutation tool.
 *
 * Real Postgres + real /mcp gateway. Sequential double-call only (R34).
 *
 *   PLATFORM_IT=1 pnpm test:integration -- \
 *     services/platform/tests/integration/sprint31-mcp-idempotent-replay.test.ts
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql, type Sql } from '../../src/db/client';
import { createHonoApp } from '../../src/http/hono-app';
import { buildMutationsReport } from '../../src/mcp/list-mutations';
import { defaultManifestPath, loadManifest } from '../../src/mcp/manifest-loader';
import {
  type ClassifiedMutation,
  classifyAllMutations,
  declaredIdempotentMutations,
  declaredNotIdempotentMutations,
  declaredSemiIdempotentMutations,
  sortedIds,
  sortedMutationToolIds,
} from './helpers/mcp-idempotency';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const KEYS = { rn: 's31-mcp02-rn', mcp: 's31-mcp02-mcp', control: 's31-mcp02-control' };
const RUN_SUFFIX = `s31-mcp02-${randomUUID().slice(0, 8)}`;

function requirePlatformIt(label: string): void {
  if (!PLATFORM_IT) {
    throw new Error(
      `${label} requires PLATFORM_IT=1 — refusing skip-to-green for MCP idempotent replay proof`
    );
  }
}

type McpToolResult = {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content?: Array<{ text?: string; type?: string }>;
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

function parseToolPayload(body: McpEnvelope): Record<string, unknown> {
  const result = body.result;
  if (!result) return {};
  if (result.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent;
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

type CallOutcome = {
  status: number;
  body: McpEnvelope;
  payload: Record<string, unknown>;
  isError: boolean;
};

type ToolCallContext = {
  app: ReturnType<typeof createHonoApp>;
  headers: Record<string, string>;
  rpcId: { n: number };
};

async function callTool(
  ctx: ToolCallContext,
  name: string,
  args: Record<string, unknown>
): Promise<CallOutcome> {
  const id = ctx.rpcId.n++;
  const response = await ctx.app.request('/mcp', {
    method: 'POST',
    headers: ctx.headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const body = mcpEnvelope(await response.json());
  return {
    status: response.status,
    body,
    payload: parseToolPayload(body),
    isError: body.result?.isError === true || body.error != null,
  };
}

/** Seed entities needed so each mutation can run against a real key. */
type ReplaySeed = {
  documentId: string;
  shareDocumentId: string;
  subscriptionIdForFilter: string;
  removableSubscriptionId: string;
  toolId: string;
  removableToolId: string;
  improvementIdClose: string;
  improvementIdStatus: string;
  approveSessionId: string;
  rejectSessionId: string;
  cancelSessionId: string;
  creatorProfileId: string;
  transcriptContentId: string;
  shopQuery: string;
  addSubSourceType: string;
  addSubIdentifier: string;
  startAssimRepoUrl: string;
  filterRuleName: string;
};

async function seedReplayCorpus(ctx: ToolCallContext, sql: Sql): Promise<ReplaySeed> {
  const doc = await callTool(ctx, 'store_document', {
    title: `${RUN_SUFFIX}-doc`,
    content: `${RUN_SUFFIX} seed document body`,
  });
  if (doc.isError || doc.status !== 200) {
    throw new Error(`seed store_document failed: ${JSON.stringify(doc.body)}`);
  }
  const shareDoc = await callTool(ctx, 'store_document', {
    title: `${RUN_SUFFIX}-share-doc`,
    content: `${RUN_SUFFIX} share seed body`,
  });
  if (shareDoc.isError || shareDoc.status !== 200) {
    throw new Error(`seed share store_document failed: ${JSON.stringify(shareDoc.body)}`);
  }

  const filterSub = await callTool(ctx, 'add_subscription', {
    sourceType: 'github',
    identifier: `${RUN_SUFFIX}-filter-sub`,
    name: `${RUN_SUFFIX}-filter-sub`,
  });
  if (filterSub.isError || filterSub.status !== 200) {
    throw new Error(`seed add_subscription (filter) failed: ${JSON.stringify(filterSub.body)}`);
  }
  const removableSub = await callTool(ctx, 'add_subscription', {
    sourceType: 'github',
    identifier: `${RUN_SUFFIX}-rm-sub`,
    name: `${RUN_SUFFIX}-rm-sub`,
  });
  if (removableSub.isError || removableSub.status !== 200) {
    throw new Error(`seed removable sub failed: ${JSON.stringify(removableSub.body)}`);
  }

  const tool = await callTool(ctx, 'store_tool', {
    title: `${RUN_SUFFIX}-tool`,
    sourceType: 'github',
    category: 'libraries',
    description: `${RUN_SUFFIX} tool seed`,
    status: 'draft',
  });
  if (tool.isError || tool.status !== 200) {
    throw new Error(`seed store_tool failed: ${JSON.stringify(tool.body)}`);
  }
  const removableTool = await callTool(ctx, 'store_tool', {
    title: `${RUN_SUFFIX}-tool-rm`,
    sourceType: 'github',
    category: 'libraries',
    description: `${RUN_SUFFIX} removable tool`,
    status: 'draft',
  });
  if (removableTool.isError || removableTool.status !== 200) {
    throw new Error(`seed removable tool failed: ${JSON.stringify(removableTool.body)}`);
  }

  const impClose = await callTool(ctx, 'add_improvement', {
    items: [{ description: `${RUN_SUFFIX}-imp-close` }],
  });
  if (impClose.isError || impClose.status !== 200) {
    throw new Error(`seed improvement close failed: ${JSON.stringify(impClose.body)}`);
  }
  const impStatus = await callTool(ctx, 'add_improvement', {
    items: [{ description: `${RUN_SUFFIX}-imp-status` }],
  });
  if (impStatus.isError || impStatus.status !== 200) {
    throw new Error(`seed improvement status failed: ${JSON.stringify(impStatus.body)}`);
  }

  const approve = await callTool(ctx, 'start_assimilation', {
    repositoryUrl: `https://example.com/${RUN_SUFFIX}-approve`,
  });
  if (approve.isError || approve.status !== 200) {
    throw new Error(`seed approve session failed: ${JSON.stringify(approve.body)}`);
  }
  const reject = await callTool(ctx, 'start_assimilation', {
    repositoryUrl: `https://example.com/${RUN_SUFFIX}-reject`,
  });
  if (reject.isError || reject.status !== 200) {
    throw new Error(`seed reject session failed: ${JSON.stringify(reject.body)}`);
  }
  const cancel = await callTool(ctx, 'start_assimilation', {
    repositoryUrl: `https://example.com/${RUN_SUFFIX}-cancel`,
  });
  if (cancel.isError || cancel.status !== 200) {
    throw new Error(`seed cancel session failed: ${JSON.stringify(cancel.body)}`);
  }

  const profileId = randomUUID();
  const contentId = `${RUN_SUFFIX}-vid`;
  await sql`
    INSERT INTO creator_profiles (id, name, handle, canonical_type)
    VALUES (${profileId}::uuid, ${`${RUN_SUFFIX}-creator`}, ${`${RUN_SUFFIX}-handle`}, 'youtube')
  `;
  await sql`
    INSERT INTO subscription_content (id, source_id, content_id, title, url, research_status)
    VALUES (
      ${randomUUID()}::uuid,
      ${profileId},
      ${contentId},
      ${`${RUN_SUFFIX} video`},
      ${`https://www.youtube.com/watch?v=${contentId}`},
      'pending'
    )
  `;

  // shop_products cold path: no completed pre-seed. First tools/call creates the
  // session (live Jina search); second call must replay that single row (H2).
  const shopQuery = `${RUN_SUFFIX} usb-c hub`;

  const closeIds = impClose.payload.ids;
  const statusIds = impStatus.payload.ids;
  const improvementIdClose =
    Array.isArray(closeIds) && typeof closeIds[0] === 'string' ? closeIds[0] : '';
  const improvementIdStatus =
    Array.isArray(statusIds) && typeof statusIds[0] === 'string' ? statusIds[0] : '';

  const seed: ReplaySeed = {
    documentId: String(doc.payload.documentId ?? ''),
    shareDocumentId: String(shareDoc.payload.documentId ?? ''),
    subscriptionIdForFilter: String(filterSub.payload.subscriptionId ?? ''),
    removableSubscriptionId: String(removableSub.payload.subscriptionId ?? ''),
    toolId: String(tool.payload.toolId ?? ''),
    removableToolId: String(removableTool.payload.toolId ?? ''),
    improvementIdClose,
    improvementIdStatus,
    approveSessionId: String(approve.payload.sessionId ?? ''),
    rejectSessionId: String(reject.payload.sessionId ?? ''),
    cancelSessionId: String(cancel.payload.sessionId ?? ''),
    creatorProfileId: profileId,
    transcriptContentId: contentId,
    shopQuery,
    addSubSourceType: 'github',
    addSubIdentifier: `${RUN_SUFFIX}-add-sub`,
    startAssimRepoUrl: `https://example.com/${RUN_SUFFIX}-start-assim`,
    filterRuleName: `${RUN_SUFFIX}-rule`,
  };

  for (const [key, value] of Object.entries(seed)) {
    if (value === '' || value == null) {
      throw new Error(`replay seed missing ${key}`);
    }
  }
  return seed;
}

type ToolCase = {
  toolId: string;
  kind: 'idempotent' | 'semi-idempotent';
  /** Build identical args for both calls. */
  buildArgs: (seed: ReplaySeed) => Record<string, unknown>;
  /**
   * Count durable rows for the tool's idempotency key after a call.
   * For delete tools the expected final count is 0 (row gone once).
   * For insert/update tools the expected final count is 1.
   */
  countRows: (sql: Sql, seed: ReplaySeed, args: Record<string, unknown>) => Promise<number>;
  expectedFinalCount: number;
  /** Extract stored_result identity for semi-idempotent equality checks. */
  extractStoredId?: (payload: Record<string, unknown>) => string | undefined;
  /** When true, second call may return isError (declared NOT_FOUND / INVALID_STATE). */
  allowSecondCallError?: boolean;
};

function buildToolCases(): ToolCase[] {
  return [
    {
      toolId: 'update_document',
      kind: 'idempotent',
      buildArgs: (seed) => ({
        documentId: seed.documentId,
        title: `${RUN_SUFFIX}-doc-updated`,
        content: `${RUN_SUFFIX} updated body`,
      }),
      countRows: async (sql, seed) => {
        const rows = await sql`
          SELECT count(*)::int AS n FROM documents WHERE id = ${seed.documentId}::uuid
        `;
        return Number(rows[0]?.n ?? 0);
      },
      expectedFinalCount: 1,
    },
    {
      toolId: 'share_document',
      kind: 'idempotent',
      buildArgs: (seed) => ({ documentId: seed.shareDocumentId }),
      countRows: async (sql, seed) => {
        const rows = await sql`
          SELECT count(*)::int AS n FROM documents WHERE id = ${seed.shareDocumentId}::uuid
        `;
        return Number(rows[0]?.n ?? 0);
      },
      expectedFinalCount: 1,
    },
    {
      toolId: 'add_subscription',
      kind: 'semi-idempotent',
      buildArgs: (seed) => ({
        sourceType: seed.addSubSourceType,
        identifier: seed.addSubIdentifier,
        name: `${RUN_SUFFIX}-add-sub-name`,
      }),
      countRows: async (sql, seed) => {
        const rows = await sql`
          SELECT count(*)::int AS n FROM subscription_sources
          WHERE source_type = ${seed.addSubSourceType} AND identifier = ${seed.addSubIdentifier}
        `;
        return Number(rows[0]?.n ?? 0);
      },
      expectedFinalCount: 1,
      extractStoredId: (p) => (typeof p.subscriptionId === 'string' ? p.subscriptionId : undefined),
    },
    {
      toolId: 'remove_subscription',
      kind: 'idempotent',
      buildArgs: (seed) => ({ subscriptionId: seed.removableSubscriptionId }),
      countRows: async (sql, seed) => {
        const rows = await sql`
          SELECT count(*)::int AS n FROM subscription_sources
          WHERE id = ${seed.removableSubscriptionId}::uuid
        `;
        return Number(rows[0]?.n ?? 0);
      },
      // After first delete the row is gone; second call must not resurrect it.
      expectedFinalCount: 0,
    },
    {
      toolId: 'set_subscription_filter',
      kind: 'idempotent',
      buildArgs: (seed) => ({
        sourceId: seed.subscriptionIdForFilter,
        ruleName: seed.filterRuleName,
        ruleType: 'whitelist',
        ruleValue: 'AI,ML',
        weight: 1,
      }),
      countRows: async (sql, seed) => {
        const rows = await sql`
          SELECT count(*)::int AS n FROM subscription_filters
          WHERE source_id = ${seed.subscriptionIdForFilter}
            AND rule_name = ${seed.filterRuleName}
        `;
        return Number(rows[0]?.n ?? 0);
      },
      expectedFinalCount: 1,
      extractStoredId: (p) => (typeof p.filterId === 'string' ? p.filterId : undefined),
    },
    {
      toolId: 'update_tool',
      kind: 'idempotent',
      buildArgs: (seed) => ({
        toolId: seed.toolId,
        title: `${RUN_SUFFIX}-tool-updated`,
        description: `${RUN_SUFFIX} updated desc`,
      }),
      countRows: async (sql, seed) => {
        const rows = await sql`
          SELECT count(*)::int AS n FROM toolbelt_tools WHERE id = ${seed.toolId}::uuid
        `;
        return Number(rows[0]?.n ?? 0);
      },
      expectedFinalCount: 1,
    },
    {
      toolId: 'remove_tool',
      kind: 'idempotent',
      buildArgs: (seed) => ({ toolId: seed.removableToolId }),
      countRows: async (sql, seed) => {
        const rows = await sql`
          SELECT count(*)::int AS n FROM toolbelt_tools WHERE id = ${seed.removableToolId}::uuid
        `;
        return Number(rows[0]?.n ?? 0);
      },
      expectedFinalCount: 0,
    },
    {
      toolId: 'shop_products',
      kind: 'idempotent',
      buildArgs: (seed) => ({
        query: seed.shopQuery,
        retailers: ['amazon', 'ebay'],
        condition: 'any',
        verifiedOnly: false,
      }),
      // H1: count ALL sessions matching the idempotency key — not only status=completed.
      // A broken cold path that inserts pending/failed duplicates must fail this suite.
      countRows: async (sql, seed) => {
        const retailers = ['amazon', 'ebay'];
        const rows = await sql`
          SELECT count(*)::int AS n FROM shop_sessions
          WHERE query = ${seed.shopQuery}
            AND condition = 'any'
            AND price_min IS NULL
            AND price_max IS NULL
            AND verified_only IS NOT DISTINCT FROM false
            AND retailers = ${sql.json(retailers)}
        `;
        return Number(rows[0]?.n ?? 0);
      },
      expectedFinalCount: 1,
      extractStoredId: (p) => (typeof p.sessionId === 'string' ? p.sessionId : undefined),
    },
    {
      toolId: 'start_assimilation',
      kind: 'semi-idempotent',
      buildArgs: (seed) => ({ repositoryUrl: seed.startAssimRepoUrl }),
      countRows: async (sql, seed) => {
        const rows = await sql`
          SELECT count(*)::int AS n FROM assimilation_sessions
          WHERE repository_url = ${seed.startAssimRepoUrl}
            AND status NOT IN ('cancelled', 'completed')
        `;
        return Number(rows[0]?.n ?? 0);
      },
      expectedFinalCount: 1,
      extractStoredId: (p) => (typeof p.sessionId === 'string' ? p.sessionId : undefined),
    },
    {
      toolId: 'approve_assimilation_plan',
      kind: 'idempotent',
      buildArgs: (seed) => ({ sessionId: seed.approveSessionId }),
      countRows: async (sql, seed) => {
        const rows = await sql`
          SELECT count(*)::int AS n FROM assimilation_sessions
          WHERE id = ${seed.approveSessionId}::uuid
        `;
        return Number(rows[0]?.n ?? 0);
      },
      expectedFinalCount: 1,
    },
    {
      toolId: 'reject_assimilation_plan',
      kind: 'idempotent',
      buildArgs: (seed) => ({
        sessionId: seed.rejectSessionId,
        feedback: `${RUN_SUFFIX}-reject-feedback`,
      }),
      countRows: async (sql, seed) => {
        const rows = await sql`
          SELECT count(*)::int AS n FROM assimilation_sessions
          WHERE id = ${seed.rejectSessionId}::uuid
        `;
        return Number(rows[0]?.n ?? 0);
      },
      expectedFinalCount: 1,
    },
    {
      toolId: 'cancel_assimilation',
      kind: 'idempotent',
      buildArgs: (seed) => ({ sessionId: seed.cancelSessionId }),
      countRows: async (sql, seed) => {
        const rows = await sql`
          SELECT count(*)::int AS n FROM assimilation_sessions
          WHERE id = ${seed.cancelSessionId}::uuid
        `;
        return Number(rows[0]?.n ?? 0);
      },
      expectedFinalCount: 1,
    },
    {
      toolId: 'assimilate_creator',
      kind: 'idempotent',
      buildArgs: (seed) => ({
        profileId: seed.creatorProfileId,
        forceRegenerate: false,
      }),
      countRows: async (sql, seed) => {
        const rows = await sql`
          SELECT count(*)::int AS n FROM transcript_jobs
          WHERE content_id = ${seed.transcriptContentId}
        `;
        return Number(rows[0]?.n ?? 0);
      },
      expectedFinalCount: 1,
    },
    {
      toolId: 'regenerate_transcript',
      kind: 'idempotent',
      buildArgs: (seed) => ({
        contentId: `${seed.transcriptContentId}-regen`,
        sourceUrl: `https://www.youtube.com/watch?v=${seed.transcriptContentId}-regen`,
      }),
      countRows: async (sql, seed) => {
        const contentId = `${seed.transcriptContentId}-regen`;
        const rows = await sql`
          SELECT count(*)::int AS n FROM transcript_jobs WHERE content_id = ${contentId}
        `;
        return Number(rows[0]?.n ?? 0);
      },
      expectedFinalCount: 1,
      extractStoredId: (p) => {
        const data = p.data;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          const jobId = (data as Record<string, unknown>).jobId;
          return typeof jobId === 'string' ? jobId : undefined;
        }
        return undefined;
      },
    },
    {
      toolId: 'close_improvement',
      kind: 'idempotent',
      buildArgs: (seed) => ({ id: seed.improvementIdClose, reason: `${RUN_SUFFIX}-closed` }),
      countRows: async (sql, seed) => {
        const rows = await sql`
          SELECT count(*)::int AS n FROM improvement_requests
          WHERE id = ${seed.improvementIdClose}::uuid
        `;
        return Number(rows[0]?.n ?? 0);
      },
      expectedFinalCount: 1,
    },
    {
      toolId: 'set_improvement_status',
      kind: 'idempotent',
      buildArgs: (seed) => ({ id: seed.improvementIdStatus, status: 'open' }),
      countRows: async (sql, seed) => {
        const rows = await sql`
          SELECT count(*)::int AS n FROM improvement_requests
          WHERE id = ${seed.improvementIdStatus}::uuid
        `;
        return Number(rows[0]?.n ?? 0);
      },
      expectedFinalCount: 1,
    },
  ];
}

describe('S31-MCP-02 mutation idempotent replay', () => {
  let sql: Sql | undefined;
  const toolCases = buildToolCases();
  const manifest = loadManifest(defaultManifestPath());

  beforeAll(() => {
    if (PLATFORM_IT) sql = createSql(DATABASE_URL);
  });

  afterAll(async () => {
    if (!sql) return;
    try {
      await sql`DELETE FROM shop_listings WHERE title LIKE ${`${RUN_SUFFIX}%`}`;
      await sql`DELETE FROM shop_sessions WHERE query LIKE ${`${RUN_SUFFIX}%`}`;
      await sql`DELETE FROM transcript_jobs WHERE content_id LIKE ${`${RUN_SUFFIX}%`}`;
      await sql`DELETE FROM subscription_content WHERE content_id LIKE ${`${RUN_SUFFIX}%`}`;
      await sql`DELETE FROM creator_profiles WHERE handle LIKE ${`${RUN_SUFFIX}%`}`;
      await sql`DELETE FROM subscription_filters WHERE rule_name LIKE ${`${RUN_SUFFIX}%`}`;
      await sql`DELETE FROM subscription_sources WHERE identifier LIKE ${`${RUN_SUFFIX}%`}`;
      await sql`DELETE FROM documents WHERE title LIKE ${`${RUN_SUFFIX}%`}`;
      await sql`DELETE FROM toolbelt_tools WHERE title LIKE ${`${RUN_SUFFIX}%`}`;
      await sql`DELETE FROM improvement_requests WHERE description LIKE ${`${RUN_SUFFIX}%`}`;
      await sql`DELETE FROM assimilation_sessions WHERE repository_url LIKE ${`%${RUN_SUFFIX}%`}`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('nonIdempotentToolsExplicitlyExcluded', () => {
    // AC-3: tools whose idempotency starts with "Not" are an asserted exclusion set.
    const excluded = declaredNotIdempotentMutations(manifest);
    const excludedIds = sortedIds(excluded);
    expect(excludedIds.length).toBeGreaterThan(0);
    expect(excludedIds).toEqual(
      [
        'add_improvement',
        'check_subscriptions',
        'steer_assimilation',
        'store_document',
        'store_tool',
      ].sort((a, b) => a.localeCompare(b))
    );
    // Suite does not claim single-row proof for any excluded id.
    const coveredIds = new Set(toolCases.map((c) => c.toolId));
    for (const id of excludedIds) {
      expect(coveredIds.has(id)).toBe(false);
    }
  });

  it('listMutationsMatchesSuite', () => {
    // AC-4: holo mcp:list-mutations --json cardinality matches suite's mutation set.
    const report = buildMutationsReport(manifest);
    const listIds = sortedMutationToolIds(manifest);
    const classified = classifyAllMutations(manifest);
    expect(report.total).toBe(listIds.length);
    expect(listIds).toEqual(sortedIds(classified));

    const declared = declaredIdempotentMutations(manifest);
    const suiteIds = toolCases.map((c) => c.toolId).sort((a, b) => a.localeCompare(b));
    const declaredIds = sortedIds(declared);
    expect(suiteIds).toEqual(declaredIds);

    // No orphan suite case outside list-mutations.
    const listSet = new Set(listIds);
    for (const id of suiteIds) {
      expect(listSet.has(id)).toBe(true);
    }
  });

  it('declaredIdempotentMutationsLeaveOneRow', async () => {
    // AC-1 PRIMARY: each Idempotent-by-* mutation double-call leaves row count == expected.
    requirePlatformIt('declaredIdempotentMutationsLeaveOneRow');
    if (!sql) throw new Error('Postgres is required');

    const declared = declaredIdempotentMutations(manifest).filter((m) => m.kind === 'idempotent');
    const idempotentCases = toolCases.filter((c) => c.kind === 'idempotent');
    expect(sortedIds(declared)).toEqual(
      idempotentCases.map((c) => c.toolId).sort((a, b) => a.localeCompare(b))
    );
    // tools covered count == number of Idempotent manifest entries with replay
    expect(idempotentCases.length).toBe(declared.length);
    expect(idempotentCases.length).toBeGreaterThan(0);

    const app = createHonoApp({ keys: KEYS });
    const ctx: ToolCallContext = {
      app,
      headers: {
        authorization: `Bearer ${KEYS.mcp}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      rpcId: { n: 1 },
    };
    const seed = await seedReplayCorpus(ctx, sql);
    const evidence: Array<{
      toolId: string;
      countAfterFirst: number;
      countAfterSecond: number;
      rowDeltaSecond: number;
      firstStatus: number;
      secondStatus: number;
      secondIsError: boolean;
    }> = [];

    for (const toolCase of idempotentCases) {
      const args = toolCase.buildArgs(seed);
      const first = await callTool(ctx, toolCase.toolId, args);
      expect(first.status, `${toolCase.toolId} first HTTP`).toBe(200);
      expect(first.isError, `${toolCase.toolId} first isError`).toBe(false);
      const countAfterFirst = await toolCase.countRows(sql, seed, args);

      const second = await callTool(ctx, toolCase.toolId, args);
      expect(second.status, `${toolCase.toolId} second HTTP`).toBe(200);
      if (!toolCase.allowSecondCallError) {
        expect(second.isError, `${toolCase.toolId} second isError`).toBe(false);
      }
      const countAfterSecond = await toolCase.countRows(sql, seed, args);
      const rowDeltaSecond = countAfterSecond - countAfterFirst;

      evidence.push({
        toolId: toolCase.toolId,
        countAfterFirst,
        countAfterSecond,
        rowDeltaSecond,
        firstStatus: first.status,
        secondStatus: second.status,
        secondIsError: second.isError,
      });

      // MUST_NOT_OBSERVE: row count 2 for any idempotency key (or any growth on 2nd call)
      expect(rowDeltaSecond, `${toolCase.toolId} row_delta second call`).toBe(0);
      expect(countAfterSecond, `${toolCase.toolId} final row count`).toBe(
        toolCase.expectedFinalCount
      );
      // Negative control: never observe 2 rows for insert-style keys
      if (toolCase.expectedFinalCount === 1) {
        expect(countAfterSecond).toBe(1);
        expect(countAfterSecond).not.toBe(2);
      }
    }

    // Every declared-idempotent tool was asserted (no silent skip).
    expect(evidence.map((e) => e.toolId).sort()).toEqual(
      declared.map((d: ClassifiedMutation) => d.toolId).sort()
    );
    // Emit DB evidence for the gate artifact.
    // eslint-disable-next-line no-console -- test evidence capture (vitest stdout, not stdio MCP)
    console.info('S31-MCP-02 AC-1 evidence', JSON.stringify(evidence, null, 2));
  }, 120_000);

  it('semiIdempotentReturnsExistingRow', async () => {
    // AC-2: semi-idempotent tools return the existing row id on second call.
    requirePlatformIt('semiIdempotentReturnsExistingRow');
    if (!sql) throw new Error('Postgres is required');

    const semi = declaredSemiIdempotentMutations(manifest);
    const semiCases = toolCases.filter((c) => c.kind === 'semi-idempotent');
    expect(sortedIds(semi)).toEqual(
      semiCases.map((c) => c.toolId).sort((a, b) => a.localeCompare(b))
    );
    expect(semiCases.length).toBeGreaterThan(0);

    const app = createHonoApp({ keys: KEYS });
    const ctx: ToolCallContext = {
      app,
      headers: {
        authorization: `Bearer ${KEYS.mcp}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      rpcId: { n: 5000 },
    };
    // Fresh seed so AC-1 delete side-effects do not bleed into semi cases.
    const seed = await seedReplayCorpus(ctx, sql);

    for (const toolCase of semiCases) {
      const args = toolCase.buildArgs(seed);
      const first = await callTool(ctx, toolCase.toolId, args);
      expect(first.status, `${toolCase.toolId} first HTTP`).toBe(200);
      expect(first.isError, `${toolCase.toolId} first isError`).toBe(false);
      const firstId = toolCase.extractStoredId?.(first.payload);
      expect(firstId, `${toolCase.toolId} first stored id`).toBeTruthy();

      const countAfterFirst = await toolCase.countRows(sql, seed, args);
      expect(countAfterFirst, `${toolCase.toolId} count after first`).toBe(1);

      const second = await callTool(ctx, toolCase.toolId, args);
      expect(second.status, `${toolCase.toolId} second HTTP`).toBe(200);
      expect(second.isError, `${toolCase.toolId} second isError`).toBe(false);
      const secondId = toolCase.extractStoredId?.(second.payload);
      expect(secondId, `${toolCase.toolId} second stored id`).toBe(firstId);

      const countAfterSecond = await toolCase.countRows(sql, seed, args);
      expect(countAfterSecond, `${toolCase.toolId} count after second`).toBe(1);
      expect(countAfterSecond - countAfterFirst).toBe(0);
    }
  }, 120_000);
});
