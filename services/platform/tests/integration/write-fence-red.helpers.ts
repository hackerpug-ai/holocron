/**
 * Sprint 29 D06-01 — write-fence RED helpers.
 *
 * Inventory is ALWAYS derived live (app.routes / buildMutationsReport /
 * MIGRATED_JOBS). Never hardcode write-path arrays here — only min-body
 * builders keyed by discovered route/tool ids.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConvexHttpClient } from 'convex/browser';
import {
  DEFAULT_DATABASE_URL,
  DEFAULT_KEYS,
  PLATFORM_IT,
} from '../../../../tests/integration/service/harness';
import type { HonoApp } from '../../src/http/hono-app';
import { createHonoApp } from '../../src/http/hono-app';
import { buildMutationsReport } from '../../src/mcp/list-mutations';
import { defaultManifestPath, loadManifest } from '../../src/mcp/manifest-loader';
import { MIGRATED_JOBS, type MigratedJob } from '../../src/queue/jobs-registry';
import { toolsAsRecord } from '../../src/tools/registry';

export { DEFAULT_DATABASE_URL, DEFAULT_KEYS, PLATFORM_IT };

export const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const EVIDENCE_DIR = resolve(process.cwd(), '.tmp/D06-01');
export const RUN_PREFIX = 's29-d0601';
export const MIGRATION_ENV = 'HOLO_MIGRATION_READ_ONLY';

export type HonoWriteRoute = {
  method: string;
  path: string;
  /** Stable inventory id: "METHOD /api/..." */
  id: string;
};

export type RouteRequest = {
  path: string;
  method: string;
  body: BodyInit | undefined;
  headers: Record<string, string>;
};

export function ensureEvidenceDir(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
}

export function writeEvidence(name: string, body: unknown): string {
  ensureEvidenceDir();
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

export function makeRunId(): string {
  return randomUUID();
}

export function titleFor(runId: string, suffix: string): string {
  return `${RUN_PREFIX}-${runId}-${suffix}`;
}

/** Live Hono write inventory from a real createHonoApp() route table. */
export function discoverHonoWriteRoutes(app: HonoApp): HonoWriteRoute[] {
  const seen = new Set<string>();
  const out: HonoWriteRoute[] = [];
  for (const route of app.routes) {
    const method = String(route.method).toUpperCase();
    const path = String(route.path);
    if (!WRITE_METHODS.has(method)) continue;
    if (!path.startsWith('/api/')) continue;
    const id = `${method} ${path}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ method, path, id });
  }
  return out;
}

/** Live MCP mutation inventory from the manifest side_effects field. */
export function discoverMcpMutationToolIds(): string[] {
  const report = buildMutationsReport(loadManifest(defaultManifestPath()));
  return report.mutations.map((m) => m.tool_id);
}

/** Cross-check every mutation tool_id against the live tools registry. */
export function assertMcpToolsInRegistry(toolIds: string[]): void {
  const live = new Set(Object.keys(toolsAsRecord()));
  const missing = toolIds.filter((id) => !live.has(id));
  if (missing.length > 0) {
    throw new Error(
      `fx-mcp-write-inventory ids missing from toolsAsRecord(): ${missing.join(', ')}`
    );
  }
}

/** Live job entry for task-timeout-worker from MIGRATED_JOBS. */
export function discoverTaskTimeoutJob(): MigratedJob {
  const job = MIGRATED_JOBS.find((j) => j.name === 'task-timeout-worker');
  if (!job) {
    throw new Error('task-timeout-worker missing from MIGRATED_JOBS (live registry)');
  }
  return job;
}

export function createUnfencedApp(): HonoApp {
  delete process.env[MIGRATION_ENV];
  return createHonoApp({ keys: { ...DEFAULT_KEYS } });
}

export function createFencedApp(): HonoApp {
  process.env[MIGRATION_ENV] = '1';
  return createHonoApp({ keys: { ...DEFAULT_KEYS } });
}

export function unsetMigrationFlag(): void {
  delete process.env[MIGRATION_ENV];
}

export function setMigrationFlag(): void {
  process.env[MIGRATION_ENV] = '1';
}

/**
 * Substitute :param segments with concrete UUIDs so app.request hits the
 * registered handler (Hono matches the concrete path).
 */
export function materializePath(pathTemplate: string, paramIds: Record<string, string>): string {
  return pathTemplate.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_m, name: string) => {
    return paramIds[name] ?? paramIds.id ?? randomUUID();
  });
}

export type HonoSeedIds = {
  conversationId: string;
  documentId: string;
  improvementId: string;
  subscriptionId: string;
  feedItemId: string;
  assimilationId: string;
  voiceSessionId: string;
  chatRunId: string;
  uploadId: string;
  missionId: string;
  improvementTargetId: string;
};

export function freshSeedIds(): HonoSeedIds {
  return {
    conversationId: randomUUID(),
    documentId: randomUUID(),
    improvementId: randomUUID(),
    subscriptionId: randomUUID(),
    feedItemId: randomUUID(),
    assimilationId: randomUUID(),
    voiceSessionId: randomUUID(),
    chatRunId: randomUUID(),
    uploadId: randomUUID(),
    missionId: randomUUID(),
    improvementTargetId: randomUUID(),
  };
}

/**
 * Minimal-valid bodies for every discovered Hono write route.
 * Built from route handlers in hono-app.ts — not a static inventory of paths.
 */
export function buildHonoMinBodies(
  runId: string,
  seeds: HonoSeedIds
): Record<string, unknown | undefined> {
  const sha = createHash('sha256').update(`probe-${runId}`).digest('hex');
  return {
    'POST /api/chat-runs': {
      requestId: `s29-d0601-${runId}-chat`,
      msg: `s29-d0601 ${runId} red-fence chat probe`,
      conversationTitle: titleFor(runId, 'conv'),
    },
    'POST /api/chat-runs/:id/cancel': undefined,
    'PATCH /api/conversations/:id': { title: titleFor(runId, 'renamed') },
    'DELETE /api/conversations/:id': undefined,
    'POST /api/documents': {
      title: titleFor(runId, 'hono-doc'),
      content: 'red-fence probe',
      category: 'general',
    },
    'POST /api/documents/:id/narration': { force: false },
    'POST /api/documents/:id/import': { text: `import-${runId}` },
    'POST /api/documents/:id/publish': undefined,
    'POST /api/voice-sessions': { conversationId: seeds.conversationId },
    'POST /api/voice-sessions/:id/end': undefined,
    'POST /api/improvements': {
      title: titleFor(runId, 'imp'),
      description: titleFor(runId, 'imp-desc'),
      sourceScreen: 'red-fence',
    },
    'PATCH /api/improvements/:id': { status: 'pending', title: titleFor(runId, 'imp-edit') },
    'DELETE /api/improvements/:id': undefined,
    'PATCH /api/subscriptions/:id': { autoResearch: false },
    'DELETE /api/subscriptions/:id': undefined,
    'POST /api/feed-items/:id/feedback': { feedback: 'up' },
    'PATCH /api/assimilations/:id': { decision: 'approve' },
    'POST /api/uploads': {
      kind: 'improvement_image',
      targetId: seeds.improvementTargetId,
      idempotencyKey: `s29-d0601-${runId}-upload`,
      sha256: sha,
      byteLength: 4,
      mimeType: 'text/plain',
      originalName: 'probe.txt',
    },
    'PUT /api/uploads/:id': undefined,
    'POST /api/uploads/:id/finalize': undefined,
    'POST /api/missions': {
      templateKey: 'whatsnew',
      goal: titleFor(runId, 'mission-goal'),
      idempotencyKey: `s29-d0601-${runId}-mission`,
    },
    'POST /api/missions/:id/verdicts': {
      verdict: 'advance',
      note: `s29-d0601-${runId}-verdict`,
      idempotencyKey: `s29-d0601-${runId}-verdict`,
    },
    'POST /api/missions/:id/steer': {
      note: `s29-d0601-${runId}-steer`,
      idempotencyKey: `s29-d0601-${runId}-steer`,
    },
  };
}

export function buildRouteRequest(
  route: HonoWriteRoute,
  _runId: string,
  seeds: HonoSeedIds,
  bodies: Record<string, unknown | undefined>
): RouteRequest {
  const paramIds: Record<string, string> = {
    id: route.path.includes('/chat-runs/')
      ? seeds.chatRunId
      : route.path.includes('/conversations/')
        ? seeds.conversationId
        : route.path.includes('/documents/')
          ? seeds.documentId
          : route.path.includes('/voice-sessions/')
            ? seeds.voiceSessionId
            : route.path.includes('/improvements/')
              ? seeds.improvementId
              : route.path.includes('/subscriptions/')
                ? seeds.subscriptionId
                : route.path.includes('/feed-items/')
                  ? seeds.feedItemId
                  : route.path.includes('/assimilations/')
                    ? seeds.assimilationId
                    : route.path.includes('/uploads/')
                      ? seeds.uploadId
                      : route.path.includes('/missions/')
                        ? seeds.missionId
                        : randomUUID(),
  };
  const path = materializePath(route.path, paramIds);
  const rawBody = bodies[route.id];
  const headers: Record<string, string> = {
    authorization: `Bearer ${DEFAULT_KEYS.rn}`,
    accept: 'application/json',
  };

  if (route.method === 'PUT' && route.path === '/api/uploads/:id') {
    headers['content-type'] = 'application/octet-stream';
    headers['content-length'] = '4';
    return {
      path,
      method: route.method,
      body: new Uint8Array([0x70, 0x72, 0x6f, 0x62]), // "prob"
      headers,
    };
  }

  if (rawBody !== undefined) {
    headers['content-type'] = 'application/json';
    return {
      path,
      method: route.method,
      body: JSON.stringify(rawBody),
      headers,
    };
  }

  // DELETE / body-less POSTs still need a method; empty JSON for handlers that parse.
  if (route.method === 'POST' || route.method === 'PATCH') {
    headers['content-type'] = 'application/json';
    return { path, method: route.method, body: JSON.stringify({}), headers };
  }

  return { path, method: route.method, body: undefined, headers };
}

export async function issueHonoWrite(
  app: HonoApp,
  req: RouteRequest
): Promise<{ status: number; body: unknown; text: string; id: string }> {
  const res = await app.request(req.path, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep raw
  }
  return { status: res.status, body, text, id: `${req.method} ${req.path}` };
}

/**
 * Build minimal valid MCP inputs for every discovered mutation tool.
 * Dependent tools receive seed ids produced by earlier seed calls in the suite.
 */
export function buildMcpMinInputs(
  runId: string,
  seeds: {
    documentId: string;
    subscriptionId: string;
    toolId: string;
    sessionApproveId: string;
    sessionRejectId: string;
    sessionCancelId: string;
    sessionSteerId: string;
    improvementId: string;
    profileId: string;
    contentId: string;
  }
): Record<string, Record<string, unknown>> {
  const docTitle = titleFor(runId, 'doc');
  return {
    store_document: {
      title: docTitle,
      content: 'red-fence probe',
    },
    update_document: {
      documentId: seeds.documentId,
      content: `updated-${runId}`,
    },
    share_document: {
      documentId: seeds.documentId,
      isPublic: true,
    },
    add_subscription: {
      sourceType: 'github',
      identifier: titleFor(runId, 'sub'),
      name: titleFor(runId, 'sub'),
      url: 'https://example.com/s29-d0601',
    },
    remove_subscription: {
      subscriptionId: seeds.subscriptionId,
    },
    check_subscriptions: {},
    set_subscription_filter: {
      sourceType: 'github',
      ruleName: `s29-d0601-${runId}-rule`,
      ruleType: 'keyword',
      ruleValue: 'red-fence',
      weight: 1,
    },
    store_tool: {
      title: titleFor(runId, 'tool'),
      description: 'red-fence tool probe',
      sourceType: 'github',
      category: 'tool',
      status: 'draft',
    },
    update_tool: {
      toolId: seeds.toolId,
      description: `updated-${runId}`,
    },
    remove_tool: {
      toolId: seeds.toolId,
    },
    shop_products: {
      // Unique query so we hit the insert path; suite seeds a matching session first
      // when needed so live retailer I/O is avoided for the positive control.
      query: `s29-d0601-${runId}-shop`,
      retailers: ['amazon'],
      condition: 'any',
    },
    start_assimilation: {
      repositoryUrl: `https://github.com/example/s29-d0601-${runId}`,
      profile: 'fast',
      autoApprove: false,
    },
    approve_assimilation_plan: {
      sessionId: seeds.sessionApproveId,
    },
    reject_assimilation_plan: {
      sessionId: seeds.sessionRejectId,
      feedback: 'red-fence reject',
    },
    cancel_assimilation: {
      sessionId: seeds.sessionCancelId,
    },
    steer_assimilation: {
      sessionId: seeds.sessionSteerId,
      note: `steer-${runId}`,
    },
    assimilate_creator: {
      profileId: seeds.profileId,
      forceRegenerate: false,
    },
    regenerate_transcript: {
      contentId: seeds.contentId,
      sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      priority: 1,
    },
    add_improvement: {
      items: [{ description: titleFor(runId, 'mcp-imp'), sourceScreen: 'red-fence' }],
    },
    close_improvement: {
      id: seeds.improvementId,
      reason: 'red-fence close',
    },
    set_improvement_status: {
      id: seeds.improvementId,
      status: 'open',
    },
  };
}

export function createConvexClient(): ConvexHttpClient {
  const url =
    process.env.EXPO_PUBLIC_CONVEX_URL ??
    process.env.VITE_CONVEX_HTTP_URL ??
    process.env.CONVEX_URL;
  if (!url) {
    throw new Error(
      'EXPO_PUBLIC_CONVEX_URL (or VITE_CONVEX_HTTP_URL) is required for Convex fence RED tests'
    );
  }
  return new ConvexHttpClient(url);
}

export function isConvexId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]{32}$/.test(value);
}

/**
 * Extract the migration_read_only / MIGRATION_READ_ONLY payload from a thrown
 * value. ConvexHttpClient wraps server throws as:
 *   "[Request ID: …] Server Error\nUncaught Error: migration_read_only: …"
 * so callers that assert startsWith('migration_read_only:') need the inner line.
 */
export function migrationReadOnlyMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.match(/(migration_read_only:\s*[^\n]*)/i);
  if (m?.[1]) return m[1].trim();
  const m2 = raw.match(/(MIGRATION_READ_ONLY:\s*[^\n]*)/);
  if (m2?.[1]) return m2[1].trim();
  return raw;
}
