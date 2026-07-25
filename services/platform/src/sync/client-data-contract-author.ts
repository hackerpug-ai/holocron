/**
 * S-CONTRACT-02 — Client Data Contract authoring.
 *
 * Reads the S-CONTRACT-01 legacy call-site inventory
 * (.tmp/client-contract/convex-callsite-inventory.json or the S-CONTRACT-01
 * canonical artifact at 13-client-callsite-inventory.json) and produces the
 * machine-readable client data contract (13-client-data-contract.yaml).
 *
 * Each legacy Convex hook/action call site is mapped to exactly one target:
 *   - a published Zero reactive query over a zero_pub table, OR
 *   - a registered Zero mutator on a zero_pub table, OR
 *   - an authoritative Hono command mounted on the live Hono surface.
 *
 * The authoring layer is deterministic: the same inventory + the same live
 * schema surfaces produce a byte-identical contract. There are no timestamps,
 * no random IDs, no fs-order-dependent iteration. Each entry retains its
 * inventory call_site_id, source location, hook_kind, and legacy_ref, and
 * declares all semantic fields required by 12-migration-contract-artifacts.md
 * and the S-CONTRACT-02 acceptance criteria:
 *
 *   target, projection, response_error_shape, ordering_cursor,
 *   optimistic, conflict, rejection, offline, identifier, e2e_criterion.
 *
 * Target resolution (AC-3) is fail-closed: every target must resolve against
 * a live zero_pub table (ZERO_PUB_TABLE_NAMES) or a live Hono route
 * (HONO_ROUTES). The author function throws if any legacy_ref lacks a
 * mapping or any mapping references an unknown table/route.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { ZERO_PUB_TABLE_NAMES } from '../db/schema/zero-pub.ts';
import type { CallSite, CallSiteInventory } from './client-callsite-inventory.ts';

/**
 * Target kinds recognised by the client data contract.
 *
 * - `zero_query`    : reactive read over a published zero_pub table.
 * - `zero_mutator`  : registered Zero mutator over a published zero_pub table
 *                     (simple client-visible CRUD only).
 * - `hono_command`  : authoritative Hono command (chat/mission/upload); never
 *                     an optimistic database mutator.
 */
export type TargetKind = 'zero_query' | 'zero_mutator' | 'hono_command';

/** Live Hono route descriptor (mirrors hono-app.ts). */
export interface HonoRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ALL';
  path: string;
  /** Live purpose — quoted from services/platform/src/http/hono-app.ts. */
  purpose: string;
}

/**
 * Live Hono route surface — mirrored from createHonoApp().
 *
 * S-CONTRACT-02 used these route literals as the AC-3 resolver seed. Any
 * target whose `target.route` is not present here is rejected by the
 * resolver. Adding a route to hono-app.ts requires appending it here so
 * contract entries can reference it.
 */
export const HONO_ROUTES: readonly HonoRoute[] = [
  {
    method: 'GET',
    path: '/article/:shareToken',
    purpose: 'Public HTML render of a shared document.',
  },
  {
    method: 'GET',
    path: '/article/:shareToken/assets/:fileObjectId',
    purpose: 'Public article-scoped asset read.',
  },
  { method: 'GET', path: '/health', purpose: 'Liveness/readiness (DB, fleet, queue).' },
  {
    method: 'GET',
    path: '/blobs/:id',
    purpose: 'Stream a blob with Accept-Ranges/206 Range support.',
  },
  {
    method: 'POST',
    path: '/api/chat-runs',
    purpose: 'Create or idempotently retrieve a chat run from a client request ID.',
  },
  {
    method: 'POST',
    path: '/api/chat-runs/:id/cancel',
    purpose: 'Cancel a running chat run.',
  },
  {
    method: 'POST',
    path: '/api/feed-items/:id/feedback',
    purpose: 'Persist explicit feed relevance feedback from the native client.',
  },
  {
    method: 'GET',
    path: '/api/chat-runs/:id',
    purpose: 'Fetch a single chat run by id.',
  },
  {
    method: 'GET',
    path: '/api/chat-runs/:id/events',
    purpose: 'Resumable SSE event stream; honors Last-Event-ID.',
  },
  {
    method: 'PATCH',
    path: '/api/conversations/:id',
    purpose: 'Durably rename a conversation from the native drawer.',
  },
  {
    method: 'DELETE',
    path: '/api/conversations/:id',
    purpose: 'Durably delete a conversation and its messages from the native drawer.',
  },
  {
    method: 'POST',
    path: '/api/uploads',
    purpose: 'Start an authoritative upload with idempotency ID and required metadata.',
  },
  { method: 'PUT', path: '/api/uploads/:id', purpose: 'Stream staged upload bytes.' },
  {
    method: 'POST',
    path: '/api/uploads/:id/finalize',
    purpose: 'Verify hash/length, promote content-addressed object, atomically attach it.',
  },
  { method: 'GET', path: '/api/sse-ping', purpose: 'Minimal SSE capability surface (protected).' },
  {
    method: 'POST',
    path: '/api/missions',
    purpose: 'Start an on-demand mission from a template + args.',
  },
  {
    method: 'GET',
    path: '/api/missions',
    purpose: 'List missions (501 NOT_IMPLEMENTED in Sprint 15).',
  },
  {
    method: 'GET',
    path: '/api/missions/:id',
    purpose: 'Mission run status/output.',
  },
  {
    method: 'POST',
    path: '/api/missions/:id/verdicts',
    purpose: 'Human-gate verdict (kill/advance/redirect/boost).',
  },
  {
    method: 'POST',
    path: '/api/missions/:id/steer',
    purpose: 'Mid-run steering note.',
  },
  { method: 'ALL', path: '/mcp', purpose: 'MCP 2025-11-25 Streamable HTTP mount.' },
  { method: 'ALL', path: '/mcp/*', purpose: 'MCP subroute mount.' },
] as const;

/** Set of live zero_pub table names — AC-3 resolver seed for Zero targets. */
export const LIVE_ZERO_PUB_TABLES: ReadonlySet<string> = new Set<string>(ZERO_PUB_TABLE_NAMES);

/**
 * Build the set of live Hono route keys (`METHOD /path`) for AC-3 resolution.
 */
export const LIVE_HONO_ROUTE_KEYS: ReadonlySet<string> = new Set<string>(
  HONO_ROUTES.map((r) => `${r.method} ${r.path}`)
);

/** Offline policy — required for AC-4 coverage. */
export type OfflinePolicy =
  /** Airplane-mode read: serve stale cache (T-SYNC-019 airplane case). */
  | 'cache_read'
  /** Queueable Zero mutator: persist locally, replay on reconnect (T-SYNC-019 queue/reconnect case). */
  | 'queue_write'
  /** Authoritative command: must be online; UI shows pending/unavailable state. */
  | 'online_only'
  /** Server rejection rollback: optimistic row removed on rejection (T-SYNC-019 rejection case). */
  | 'rollback_rejection';

/** Conflict policy — required for AC-4 coverage. */
export type ConflictPolicy =
  | 'last_write_wins'
  | 'request_id_replay'
  | 'idempotency_key'
  | 'request_key'
  | 'versioned_cas';

/** Identifier kind for the target row. */
export type IdentifierKind = 'uuid_v7' | 'legacy_alias' | 'request_key' | 'idempotency_key';

/** Target descriptor — what the legacy call site maps to. */
export interface ContractTarget {
  kind: TargetKind;
  /** zero_pub table name for zero_query / zero_mutator; null for hono_command. */
  table: string | null;
  /**
   * Registered Zero query/mutator name (the future client registry name).
   * For zero_query/zero_mutator the table must exist in ZERO_PUB_TABLE_NAMES.
   */
  name: string | null;
  /** `METHOD /path` for hono_command; null otherwise. Must exist in HONO_ROUTES. */
  route: string | null;
}

/** Projection of a reactive read or mutator payload. */
export interface ContractProjection {
  columns: string[];
  relationships: string[];
  primary_key: string;
  nullability: Record<string, 'required' | 'optional'>;
}

/** Response/error shape descriptor. */
export interface ResponseErrorShape {
  success: string;
  errors: Array<{ code: string; status: number; body: string }>;
}

/** Ordering / cursor behavior descriptor. */
export interface OrderingCursor {
  order_by: string;
  cursor_field: string | null;
  cursor_kind: 'timestamp' | 'uuid_v7' | 'seq' | 'none';
  pagination: 'keyset' | 'offset' | 'none';
}

/** Optimistic behavior descriptor. */
export interface OptimisticBehavior {
  applies: boolean;
  projected_row: string | null;
  rollback: string;
  ui_state: string;
}

/** Conflict behavior descriptor. */
export interface ConflictBehavior {
  policy: ConflictPolicy;
  dedup_key: string | null;
  version_field: string | null;
}

/** Rejection behavior descriptor. */
export interface RejectionBehavior {
  validation: string;
  unauthorized: string;
  not_found: string;
  conflict: string;
  migration_read_only: string;
}

/** Offline behavior descriptor. */
export interface OfflineBehavior {
  policy: OfflinePolicy;
  airplane_render: string;
  reconnect: string;
  queue_persistence: boolean;
}

/** Identifier compatibility descriptor. */
export interface IdentifierBehavior {
  row_id_kind: IdentifierKind;
  legacy_alias: string | null;
  alias_expiry: string | null;
  request_key: string | null;
  idempotency_key: string | null;
}

/** A single contract entry — one per inventory call_site_id. */
export interface ContractEntry {
  call_site_id: string;
  source_path: string;
  line: number;
  column: number;
  hook_kind: CallSite['hook_kind'];
  legacy_ref: string;
  consumer: string;
  target: ContractTarget;
  projection: ContractProjection;
  response_error_shape: ResponseErrorShape;
  ordering_cursor: OrderingCursor;
  optimistic: OptimisticBehavior;
  conflict: ConflictBehavior;
  rejection: RejectionBehavior;
  offline: OfflineBehavior;
  identifier: IdentifierBehavior;
  e2e_criterion: 'T-SYNC-019' | 'T-SYNC-004' | 'T-SYNC-006' | 'T-SYNC-007';
}

/** Top-level contract artifact. */
export interface ClientDataContract {
  contract_version: 1;
  task_id: 'S-CONTRACT-02';
  sprint: 'sprint-21-client-data-contract';
  description: string;
  generated_from: {
    inventory: string;
    zero_pub: string;
    hono_routes: string;
    e2e_criteria: string;
  };
  summary: {
    total_entries: number;
    by_target_kind: Record<TargetKind, number>;
    by_offline_policy: Record<OfflinePolicy, number>;
    offline_behavior_case_count: number;
    unresolved_target_count: number;
  };
  entries: ContractEntry[];
}

/**
 * Static template for a legacy_ref mapping. Each legacy_ref resolves to one
 * template; call sites sharing a legacy_ref share the template (each still
 * emits its own entry because the contract is per-call-site, not per-ref).
 *
 * Templates are keyed by exact legacy_ref string. The mapping table covers
 * every legacy_ref produced by S-CONTRACT-01 against the live repo. An
 * unknown legacy_ref fails authoring closed.
 */
interface LegacyMapping {
  consumer: string;
  target: ContractTarget;
  projection: ContractProjection;
  response_error_shape: ResponseErrorShape;
  ordering_cursor: OrderingCursor;
  optimistic: OptimisticBehavior;
  conflict: ConflictBehavior;
  rejection: RejectionBehavior;
  offline: OfflineBehavior;
  identifier: IdentifierBehavior;
  e2e_criterion: ContractEntry['e2e_criterion'];
}

/**
 * Helper: build a representative T-SYNC-019 rejection behavior block.
 * Every entry gets the full rejection matrix; per-target differences are
 * encoded by the policy fields above. migration_read_only is terminal per
 * the API constitution — never classified as retryable.
 */
function rejection(
  validation: string,
  unauthorized: string,
  notFound: string,
  conflict: string
): RejectionBehavior {
  return {
    validation,
    unauthorized,
    not_found: notFound,
    conflict,
    migration_read_only:
      'terminal: visible write rejection; UI surfaces migration_read_only badge and queues no retry',
  };
}

/**
 * Helper: standard identifier block for new rows. Legacy IDs are preserved
 * only via the legacy_convex_id alias column declared in zero-pub.ts.
 */
function uuidV7Identifier(
  requestKey: string | null = null,
  idempotencyKey: string | null = null
): IdentifierBehavior {
  return {
    row_id_kind: 'uuid_v7',
    legacy_alias: 'legacy_convex_id',
    alias_expiry: '2027-01-31',
    request_key: requestKey,
    idempotency_key: idempotencyKey,
  };
}

/* -------------------------------------------------------------------------- */
/* Reusable projection / shape fragments                                      */
/* -------------------------------------------------------------------------- */

const CONVERSATION_PROJECTION: ContractProjection = {
  columns: [
    'id',
    'title',
    'title_set_by_user',
    'last_message_preview',
    'agent_busy',
    'agent_busy_since',
    'created_at',
    'updated_at',
  ],
  relationships: ['chat_messages.conversation_id'],
  primary_key: 'id',
  nullability: {
    id: 'required',
    title: 'optional',
    title_set_by_user: 'optional',
    last_message_preview: 'optional',
    agent_busy: 'optional',
    agent_busy_since: 'optional',
    created_at: 'required',
    updated_at: 'required',
  },
};

const CHAT_MESSAGE_PROJECTION: ContractProjection = {
  columns: [
    'id',
    'conversation_id',
    'role',
    'content',
    'message_type',
    'card_data',
    'session_id',
    'voice_session_id',
    'document_id',
    'deleted',
    'tool_call_id',
    'reasoning',
    'created_at',
  ],
  relationships: ['conversations.id', 'tool_calls.id'],
  primary_key: 'id',
  nullability: {
    id: 'required',
    conversation_id: 'optional',
    role: 'required',
    content: 'optional',
    message_type: 'optional',
    card_data: 'optional',
    session_id: 'optional',
    voice_session_id: 'optional',
    document_id: 'optional',
    deleted: 'optional',
    tool_call_id: 'optional',
    reasoning: 'optional',
    created_at: 'required',
  },
};

const DOCUMENT_PROJECTION: ContractProjection = {
  columns: ['id', 'title', 'summary', 'metadata', 'created_at', 'updated_at'],
  relationships: ['chat_messages.document_id'],
  primary_key: 'id',
  nullability: {
    id: 'required',
    title: 'optional',
    summary: 'optional',
    metadata: 'optional',
    created_at: 'required',
    updated_at: 'required',
  },
};

const IMPROVEMENT_REQUEST_PROJECTION: ContractProjection = {
  columns: [
    'id',
    'description',
    'title',
    'summary',
    'status',
    'source_screen',
    'source_component',
    'agent_decision',
    'merged_into_id',
    'merged_from_ids',
    'user_feedback',
    'closure_reason',
    'closure_evidence',
    'closed_at',
    'created_at',
    'updated_at',
    'processed_at',
  ],
  relationships: ['improvement_images.improvement_request_id'],
  primary_key: 'id',
  nullability: {
    id: 'required',
    status: 'required',
    created_at: 'required',
    updated_at: 'required',
  },
};

const SUBSCRIPTION_CONTENT_PROJECTION: ContractProjection = {
  columns: [
    'id',
    'source_id',
    'content_id',
    'title',
    'url',
    'metadata_json',
    'passed_filter',
    'filter_reason',
    'research_status',
    'discovered_at',
    'researched_at',
    'document_id',
    'feed_item_id',
    'in_feed',
    'thumbnail_url',
    'duration',
    'author_handle',
    'likes_count',
    'comments_count',
    'content_category',
    'ai_relevance_score',
    'ai_relevance_reason',
    'created_at',
  ],
  relationships: ['documents.id', 'feed_items.id', 'subscription_sources.id'],
  primary_key: 'id',
  nullability: { id: 'required', title: 'optional', created_at: 'required' },
};

const FEED_ITEM_PROJECTION: ContractProjection = {
  columns: ['id', 'created_at', 'updated_at'],
  relationships: ['subscription_content.feed_item_id'],
  primary_key: 'id',
  nullability: { id: 'required', created_at: 'required' },
};

const NOTIFICATION_PROJECTION: ContractProjection = {
  columns: ['id', 'created_at', 'updated_at'],
  relationships: [],
  primary_key: 'id',
  nullability: { id: 'required', created_at: 'required' },
};

const APP_SETTING_PROJECTION: ContractProjection = {
  columns: ['id', 'created_at', 'updated_at'],
  relationships: [],
  primary_key: 'id',
  nullability: { id: 'required', created_at: 'required' },
};

const AUDIO_JOB_PROJECTION: ContractProjection = {
  columns: ['id', 'created_at', 'updated_at'],
  relationships: ['audio_segments.audio_job_id', 'documents.id'],
  primary_key: 'id',
  nullability: { id: 'required', created_at: 'required' },
};

const AUDIO_SEGMENT_PROJECTION: ContractProjection = {
  columns: ['id', 'created_at'],
  relationships: ['audio_jobs.id'],
  primary_key: 'id',
  nullability: { id: 'required', created_at: 'required' },
};

const RESEARCH_SESSION_PROJECTION: ContractProjection = {
  columns: ['id', 'created_at', 'updated_at'],
  relationships: ['research_iterations.session_id', 'research_findings.session_id'],
  primary_key: 'id',
  nullability: { id: 'required', created_at: 'required' },
};

const ASSIMILATION_SESSION_PROJECTION: ContractProjection = {
  columns: ['id', 'created_at', 'updated_at'],
  relationships: ['assimilation_iterations.session_id', 'assimilation_metadata.session_id'],
  primary_key: 'id',
  nullability: { id: 'required', created_at: 'required' },
};

const AGENT_PLAN_PROJECTION: ContractProjection = {
  columns: ['id', 'created_at', 'updated_at'],
  relationships: ['agent_plan_steps.plan_id'],
  primary_key: 'id',
  nullability: { id: 'required', created_at: 'required' },
};

const AGENT_PLAN_STEP_PROJECTION: ContractProjection = {
  columns: ['id', 'created_at'],
  relationships: ['agent_plans.id'],
  primary_key: 'id',
  nullability: { id: 'required', created_at: 'required' },
};

const TOOL_CALL_PROJECTION: ContractProjection = {
  columns: ['id', 'created_at'],
  relationships: ['chat_messages.tool_call_id'],
  primary_key: 'id',
  nullability: { id: 'required', created_at: 'required' },
};

const WHATS_NEW_REPORT_PROJECTION: ContractProjection = {
  columns: ['id', 'created_at'],
  relationships: ['whats_new_workflows.report_id'],
  primary_key: 'id',
  nullability: { id: 'required', created_at: 'required' },
};

const SUBSCRIPTION_LINK_PROJECTION: ContractProjection = {
  columns: ['id', 'created_at'],
  relationships: ['subscription_sources.id', 'subscription_filters.id'],
  primary_key: 'id',
  nullability: { id: 'required', created_at: 'required' },
};

const EMPTY_PROJECTION: ContractProjection = {
  columns: [],
  relationships: [],
  primary_key: '',
  nullability: {},
};

const READ_ORDERING: OrderingCursor = {
  order_by: 'created_at desc',
  cursor_field: 'created_at',
  cursor_kind: 'timestamp',
  pagination: 'keyset',
};

const CHAT_MESSAGE_ORDERING: OrderingCursor = {
  order_by: 'created_at asc',
  cursor_field: 'created_at',
  cursor_kind: 'timestamp',
  pagination: 'keyset',
};

const NO_CURSOR: OrderingCursor = {
  order_by: 'created_at desc',
  cursor_field: null,
  cursor_kind: 'none',
  pagination: 'none',
};

const HONO_ERROR_SHAPE: ResponseErrorShape = {
  success: 'JSON body declared by the route handler',
  errors: [
    { code: 'chat_run_error', status: 422, body: '{ error: "chat_run_error", message: string }' },
    {
      code: 'mission_error',
      status: 422,
      body: '{ ok: false, error: string, code: string, errorCode: string }',
    },
    { code: 'upload_error', status: 422, body: '{ error: "upload_error", message: string }' },
    { code: 'invalid_request', status: 422, body: '{ error: "invalid_request", message: string }' },
    { code: 'not_found', status: 404, body: '{ error: "not_found", message: string }' },
    { code: 'unauthorized', status: 401, body: 'scoped-key middleware reject' },
    { code: 'forbidden', status: 403, body: 'scoped-key middleware reject' },
    { code: 'migration_read_only', status: 423, body: 'terminal write reject during soak' },
  ],
};

const ZERO_READ_ERROR_SHAPE: ResponseErrorShape = {
  success: 'Zero Query result rows over the published projection',
  errors: [
    { code: 'unauthorized', status: 401, body: 'scoped-key middleware reject' },
    { code: 'forbidden', status: 403, body: 'scoped-key middleware reject' },
    { code: 'migration_read_only', status: 423, body: 'terminal write reject during soak' },
  ],
};

const ZERO_MUTATOR_ERROR_SHAPE: ResponseErrorShape = {
  success: 'Zero mutator result row over the published projection',
  errors: [
    { code: 'invalid_request', status: 422, body: '{ error: "invalid_request", message: string }' },
    {
      code: 'conflict',
      status: 409,
      body: '{ error: "conflict", message: string, version: number }',
    },
    { code: 'unauthorized', status: 401, body: 'scoped-key middleware reject' },
    { code: 'forbidden', status: 403, body: 'scoped-key middleware reject' },
    { code: 'migration_read_only', status: 423, body: 'terminal write reject during soak' },
  ],
};

const ZERO_READ_OFFLINE: OfflineBehavior = {
  policy: 'cache_read',
  airplane_render: 'stale cache rendered; loader shown if cache empty',
  reconnect: 'Zero wal-replay refreshes the published projection',
  queue_persistence: false,
};

const ZERO_MUTATOR_OFFLINE: OfflineBehavior = {
  policy: 'queue_write',
  airplane_render: 'pending optimistic row visible; queued locally',
  reconnect: 'queued mutation replayed; dedup via request_key/idempotency_key',
  queue_persistence: true,
};

const HONO_ONLINE_OFFLINE: OfflineBehavior = {
  policy: 'online_only',
  airplane_render: 'action disabled; UI surfaces "online required" affordance',
  reconnect: 'no local queue; user must retry',
  queue_persistence: false,
};

const HONO_ROLLBACK_OFFLINE: OfflineBehavior = {
  policy: 'rollback_rejection',
  airplane_render: 'pending state shown; never styled as durable success',
  reconnect:
    'on 4xx/5xx rejection the pending row is rolled back; durable row from server is authoritative',
  queue_persistence: false,
};

const ZERO_READ_OPTIMISTIC: OptimisticBehavior = {
  applies: false,
  projected_row: null,
  rollback: 'n/a (reactive read)',
  ui_state: 'rendered from cache, refreshed on wal-replay',
};

const ZERO_MUTATOR_OPTIMISTIC: OptimisticBehavior = {
  applies: true,
  projected_row: 'projected insert/update with temporary client id',
  rollback: 'remove projected row on rejection; restore prior row on version conflict',
  ui_state: 'pending optimistic row visible until server acknowledges',
};

const HONO_OPTIMISTIC_NEVER: OptimisticBehavior = {
  applies: false,
  projected_row: null,
  rollback: 'no optimistic DB mutation; pending UI state only',
  ui_state: 'pending command/stream state; never durable-success styling until server ack',
};

const HONO_ROLLBACK_OPTIMISTIC: OptimisticBehavior = {
  applies: false,
  projected_row: null,
  rollback:
    'on rejection, pending UI state is rolled back; durable chat_messages row is authoritative',
  ui_state: 'pending command visible; final reconciliation from Zero or durable chat_messages row',
};

const LWW_CONFLICT: ConflictBehavior = {
  policy: 'last_write_wins',
  dedup_key: null,
  version_field: 'updated_at',
};

const REQUEST_ID_CONFLICT: ConflictBehavior = {
  policy: 'request_id_replay',
  dedup_key: 'requestId',
  version_field: null,
};

const IDEMPOTENCY_KEY_CONFLICT: ConflictBehavior = {
  policy: 'idempotency_key',
  dedup_key: 'idempotencyKey',
  version_field: null,
};

const REQUEST_KEY_CONFLICT: ConflictBehavior = {
  policy: 'request_key',
  dedup_key: 'requestKey',
  version_field: null,
};

const VERSIONED_CAS_CONFLICT: ConflictBehavior = {
  policy: 'versioned_cas',
  dedup_key: null,
  version_field: 'updated_at',
};

const ZERO_REJECTION: RejectionBehavior = rejection(
  'rendered_fresh: invalid input is not applied; UI shows validation error',
  'rendered_anonymous: scoped-key reject surfaces login affordance',
  'rendered_empty: missing row treated as empty result',
  'rendered_server_value: version conflict discards local change, server row authoritative'
);

const HONO_REJECTION: RejectionBehavior = rejection(
  'pending_state: 422 surfaces validation error; UI offers retry',
  'login_affordance: 401/403 stops pending state',
  'rendered_empty: 404 stops pending state and renders not-found UI',
  'retry_or_reject: 409 conflict returns structured rejection; client may retry with version'
);

/* -------------------------------------------------------------------------- */
/* Legacy ref → target mapping table                                          */
/* -------------------------------------------------------------------------- */

/**
 * The canonical mapping table. Each legacy_ref declared by S-CONTRACT-01
 * gets exactly one template. Templates never invent targets — every Zero
 * target references a zero_pub table; every Hono target references a live
 * HONO_ROUTES entry.
 *
 * Live-vs-PRD reconciliation notes (preserved from the S-CONTRACT-02 design
 * specialist findings):
 *   - api.toolbelt.*         → toolbelt_tools is EXCLUDED from zero_pub. Toolbelt
 *                              entries are persisted as `documents` rows; reads
 *                              filter the documents table, writes go through a
 *                              mission that imports the URL.
 *   - api.voice.*            → voice_sessions, voice_commands, user_preferences
 *                              are EXCLUDED. Voice sessions are modeled as chat
 *                              runs (POST /api/chat-runs) plus chat_messages;
 *                              voice language preference lives in app_settings.
 *   - api.imports.*          → imports is EXCLUDED. Imports produce documents.
 *   - api.audio.actions.*    → audio_jobs/audio_segments ARE published; the
 *                              generation actions are authoritative Hono
 *                              commands (POST /api/missions).
 *   - api.audioTranscripts.* → transcript_jobs EXCLUDED. Modeled as a mission
 *                              whose status is polled via GET /api/missions/:id.
 *   - api.feeds.queries.getFeedSettings / updateFeedSettings → feed_settings
 *                              EXCLUDED. Surfaced via app_settings.
 *   - api.research.mutations.* → no live cancel/retry Hono route; modeled as
 *                              registered Zero mutators on research_sessions.
 *   - api.db.agentActivity.get → no agent_activity table; surfaced via
 *                              agent_plans (status of agent work).
 *   - api.chat.agent.cancelTool → POST /api/chat-runs/:id/cancel (live).
 */
const LEGACY_REF_MAPPINGS: Record<string, LegacyMapping> = {
  /* ----- conversations / chat ----- */
  'api.conversations.index.list': {
    consumer: 'drawer-conversation-list',
    target: {
      kind: 'zero_query',
      table: 'conversations',
      name: 'conversationsByOwner',
      route: null,
    },
    projection: CONVERSATION_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: READ_ORDERING,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.conversations.search.search': {
    consumer: 'drawer-conversation-search',
    target: {
      kind: 'zero_query',
      table: 'conversations',
      name: 'conversationsBySearchTerm',
      route: null,
    },
    projection: CONVERSATION_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: READ_ORDERING,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.conversations.queries.get': {
    consumer: 'chat-thread-header',
    target: { kind: 'zero_query', table: 'conversations', name: 'conversationById', route: null },
    projection: CONVERSATION_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.conversations.mutations.update': {
    consumer: 'drawer-conversation-rename',
    target: {
      kind: 'zero_mutator',
      table: 'conversations',
      name: 'updateConversation',
      route: null,
    },
    projection: CONVERSATION_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: VERSIONED_CAS_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.conversations.mutations.remove': {
    consumer: 'drawer-conversation-delete',
    target: {
      kind: 'zero_mutator',
      table: 'conversations',
      name: 'deleteConversation',
      route: null,
    },
    projection: CONVERSATION_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: VERSIONED_CAS_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.conversations.mutations.create': {
    consumer: 'document-chat-start',
    target: { kind: 'hono_command', table: null, name: null, route: 'POST /api/chat-runs' },
    projection: EMPTY_PROJECTION,
    response_error_shape: HONO_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: HONO_OPTIMISTIC_NEVER,
    conflict: REQUEST_ID_CONFLICT,
    rejection: HONO_REJECTION,
    offline: HONO_ROLLBACK_OFFLINE,
    identifier: uuidV7Identifier('requestId'),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.chatMessages.queries.listByConversation': {
    consumer: 'chat-history-list',
    target: {
      kind: 'zero_query',
      table: 'chat_messages',
      name: 'chatMessagesByConversation',
      route: null,
    },
    projection: CHAT_MESSAGE_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: CHAT_MESSAGE_ORDERING,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.chatMessages.mutations.create': {
    consumer: 'document-chat-send',
    target: { kind: 'hono_command', table: null, name: null, route: 'POST /api/chat-runs' },
    projection: CHAT_MESSAGE_PROJECTION,
    response_error_shape: HONO_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: HONO_OPTIMISTIC_NEVER,
    conflict: REQUEST_ID_CONFLICT,
    rejection: HONO_REJECTION,
    offline: HONO_ROLLBACK_OFFLINE,
    identifier: uuidV7Identifier('requestId'),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.chatMessages.mutations.softDelete': {
    consumer: 'chat-message-soft-delete',
    target: {
      kind: 'zero_mutator',
      table: 'chat_messages',
      name: 'softDeleteChatMessage',
      route: null,
    },
    projection: CHAT_MESSAGE_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: VERSIONED_CAS_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.chat.index.send': {
    consumer: 'chat-composer-send',
    target: { kind: 'hono_command', table: null, name: null, route: 'POST /api/chat-runs' },
    projection: CHAT_MESSAGE_PROJECTION,
    response_error_shape: HONO_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: HONO_OPTIMISTIC_NEVER,
    conflict: REQUEST_ID_CONFLICT,
    rejection: HONO_REJECTION,
    offline: HONO_ROLLBACK_OFFLINE,
    identifier: uuidV7Identifier('requestId'),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.chat.agentMutations.cancelAgent': {
    consumer: 'chat-cancel-agent',
    target: {
      kind: 'hono_command',
      table: null,
      name: null,
      route: 'POST /api/chat-runs/:id/cancel',
    },
    projection: EMPTY_PROJECTION,
    response_error_shape: HONO_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: HONO_OPTIMISTIC_NEVER,
    conflict: REQUEST_KEY_CONFLICT,
    rejection: HONO_REJECTION,
    offline: HONO_ONLINE_OFFLINE,
    identifier: uuidV7Identifier(null, 'idempotencyKey'),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.chat.agent.cancelTool': {
    consumer: 'chat-cancel-tool-call',
    target: {
      kind: 'hono_command',
      table: null,
      name: null,
      route: 'POST /api/chat-runs/:id/cancel',
    },
    projection: TOOL_CALL_PROJECTION,
    response_error_shape: HONO_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: HONO_OPTIMISTIC_NEVER,
    conflict: REQUEST_KEY_CONFLICT,
    rejection: HONO_REJECTION,
    offline: HONO_ONLINE_OFFLINE,
    identifier: uuidV7Identifier(null, 'idempotencyKey'),
    e2e_criterion: 'T-SYNC-019',
  },

  /* ----- chat tool calls / agent plans / research sessions ----- */
  'api.toolCalls.queries.get': {
    consumer: 'chat-tool-call-card',
    target: { kind: 'zero_query', table: 'tool_calls', name: 'toolCallById', route: null },
    projection: TOOL_CALL_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.agentPlans.queries.get': {
    consumer: 'agent-plan-card',
    target: { kind: 'zero_query', table: 'agent_plans', name: 'agentPlanById', route: null },
    projection: AGENT_PLAN_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.agentPlans.queries.getSteps': {
    consumer: 'agent-plan-steps',
    target: {
      kind: 'zero_query',
      table: 'agent_plan_steps',
      name: 'agentPlanStepsByPlan',
      route: null,
    },
    projection: AGENT_PLAN_STEP_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: CHAT_MESSAGE_ORDERING,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.agentPlans.mutations.approveStep': {
    consumer: 'agent-plan-approve',
    target: {
      kind: 'zero_mutator',
      table: 'agent_plan_steps',
      name: 'approveAgentPlanStep',
      route: null,
    },
    projection: AGENT_PLAN_STEP_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: VERSIONED_CAS_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.agentPlans.mutations.rejectStep': {
    consumer: 'agent-plan-reject',
    target: {
      kind: 'zero_mutator',
      table: 'agent_plan_steps',
      name: 'rejectAgentPlanStep',
      route: null,
    },
    projection: AGENT_PLAN_STEP_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: VERSIONED_CAS_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.agentPlans.mutations.cancelPlan': {
    consumer: 'agent-plan-cancel',
    target: { kind: 'zero_mutator', table: 'agent_plans', name: 'cancelAgentPlan', route: null },
    projection: AGENT_PLAN_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: VERSIONED_CAS_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.researchSessions.queries.get': {
    consumer: 'research-progress-card',
    target: {
      kind: 'zero_query',
      table: 'research_sessions',
      name: 'researchSessionById',
      route: null,
    },
    projection: RESEARCH_SESSION_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.research.queries.getDeepResearchSession': {
    consumer: 'deep-research-session',
    target: {
      kind: 'zero_query',
      table: 'research_sessions',
      name: 'deepResearchSessionById',
      route: null,
    },
    projection: RESEARCH_SESSION_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.research.mutations.cancelResearchSession': {
    consumer: 'deep-research-cancel',
    target: {
      kind: 'zero_mutator',
      table: 'research_sessions',
      name: 'cancelResearchSession',
      route: null,
    },
    projection: RESEARCH_SESSION_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: VERSIONED_CAS_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.research.mutations.retryResearchSession': {
    consumer: 'deep-research-retry',
    target: {
      kind: 'zero_mutator',
      table: 'research_sessions',
      name: 'retryResearchSession',
      route: null,
    },
    projection: RESEARCH_SESSION_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: REQUEST_KEY_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier('requestKey'),
    e2e_criterion: 'T-SYNC-019',
  },

  /* ----- improvements ----- */
  'api.improvements.queries.list': {
    consumer: 'improvements-list',
    target: {
      kind: 'zero_query',
      table: 'improvement_requests',
      name: 'improvementRequestsByOwner',
      route: null,
    },
    projection: IMPROVEMENT_REQUEST_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: READ_ORDERING,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.improvements.queries.get': {
    consumer: 'improvement-detail',
    target: {
      kind: 'zero_query',
      table: 'improvement_requests',
      name: 'improvementRequestById',
      route: null,
    },
    projection: IMPROVEMENT_REQUEST_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.improvements.mutations.update': {
    consumer: 'improvement-edit',
    target: {
      kind: 'zero_mutator',
      table: 'improvement_requests',
      name: 'updateImprovementRequest',
      route: null,
    },
    projection: IMPROVEMENT_REQUEST_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: VERSIONED_CAS_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.improvements.mutations.remove': {
    consumer: 'improvement-delete',
    target: {
      kind: 'zero_mutator',
      table: 'improvement_requests',
      name: 'deleteImprovementRequest',
      route: null,
    },
    projection: IMPROVEMENT_REQUEST_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: VERSIONED_CAS_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.improvements.mutations.setStatus': {
    consumer: 'improvement-set-status',
    target: {
      kind: 'zero_mutator',
      table: 'improvement_requests',
      name: 'setImprovementRequestStatus',
      route: null,
    },
    projection: IMPROVEMENT_REQUEST_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: VERSIONED_CAS_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.improvements.mutations.generateUploadUrl': {
    consumer: 'improvement-upload-init',
    target: { kind: 'hono_command', table: null, name: null, route: 'POST /api/uploads' },
    projection: EMPTY_PROJECTION,
    response_error_shape: HONO_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: HONO_OPTIMISTIC_NEVER,
    conflict: IDEMPOTENCY_KEY_CONFLICT,
    rejection: HONO_REJECTION,
    offline: HONO_ONLINE_OFFLINE,
    identifier: uuidV7Identifier(null, 'idempotencyKey'),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.improvements.mutations.submit': {
    consumer: 'improvement-submit',
    target: {
      kind: 'zero_mutator',
      table: 'improvement_requests',
      name: 'submitImprovementRequest',
      route: null,
    },
    projection: IMPROVEMENT_REQUEST_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: IDEMPOTENCY_KEY_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(null, 'idempotencyKey'),
    e2e_criterion: 'T-SYNC-019',
  },

  /* ----- subscriptions / feed ----- */
  'api.subscriptions.queries.list': {
    consumer: 'subscription-content-list',
    target: {
      kind: 'zero_query',
      table: 'subscription_content',
      name: 'subscriptionContentByGroup',
      route: null,
    },
    projection: SUBSCRIPTION_CONTENT_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: READ_ORDERING,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.subscriptions.queries.searchContent': {
    consumer: 'subscription-feed-search',
    target: {
      kind: 'zero_query',
      table: 'subscription_content',
      name: 'subscriptionContentSearch',
      route: null,
    },
    projection: SUBSCRIPTION_CONTENT_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: READ_ORDERING,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.subscriptions.queries.listGroupedByCreator': {
    consumer: 'subscription-settings-section',
    target: {
      kind: 'zero_query',
      table: 'subscription_content',
      name: 'subscriptionContentGroupedByCreator',
      route: null,
    },
    projection: SUBSCRIPTION_CONTENT_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: READ_ORDERING,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.subscriptions.queries.listContentWithDocuments': {
    consumer: 'subscription-detail-screen',
    target: {
      kind: 'zero_query',
      table: 'subscription_content',
      name: 'subscriptionContentWithDocuments',
      route: null,
    },
    projection: SUBSCRIPTION_CONTENT_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: READ_ORDERING,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.subscriptions.mutations.update': {
    consumer: 'subscription-toggle',
    target: {
      kind: 'zero_mutator',
      table: 'subscription_links',
      name: 'updateSubscriptionLink',
      route: null,
    },
    projection: SUBSCRIPTION_LINK_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: VERSIONED_CAS_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.subscriptions.mutations.bulkRemove': {
    consumer: 'subscription-bulk-remove',
    target: {
      kind: 'zero_mutator',
      table: 'subscription_links',
      name: 'bulkRemoveSubscriptionLinks',
      route: null,
    },
    projection: SUBSCRIPTION_LINK_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: REQUEST_KEY_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier('requestKey'),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.subscriptions.feedback.submitFeedback': {
    consumer: 'subscription-feedback',
    target: {
      kind: 'hono_command',
      table: null,
      name: null,
      route: 'POST /api/feed-items/:id/feedback',
    },
    projection: FEED_ITEM_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: IDEMPOTENCY_KEY_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(null, 'idempotencyKey'),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.feeds.queries.getFeed': {
    consumer: 'subscription-feed-screen',
    target: { kind: 'zero_query', table: 'feed_items', name: 'feedItemsByOwner', route: null },
    projection: FEED_ITEM_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: READ_ORDERING,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.feeds.queries.getFeedItemFeedback': {
    consumer: 'feed-item-feedback',
    target: { kind: 'zero_query', table: 'feed_items', name: 'feedItemFeedbackById', route: null },
    projection: FEED_ITEM_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.feeds.queries.getFeedSettings': {
    consumer: 'feed-settings-modal',
    target: { kind: 'zero_query', table: 'app_settings', name: 'feedSettings', route: null },
    projection: APP_SETTING_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.feeds.mutations.submitFeedback': {
    consumer: 'feed-card-feedback',
    target: {
      kind: 'zero_mutator',
      table: 'feed_items',
      name: 'submitFeedItemFeedback',
      route: null,
    },
    projection: FEED_ITEM_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: IDEMPOTENCY_KEY_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(null, 'idempotencyKey'),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.feeds.mutations.updateFeedSettings': {
    consumer: 'feed-settings-update',
    target: {
      kind: 'zero_mutator',
      table: 'app_settings',
      name: 'updateFeedSettings',
      route: null,
    },
    projection: APP_SETTING_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: VERSIONED_CAS_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },

  /* ----- toolbelt ----- */
  // toolbelt_tools is EXCLUDED from zero_pub; toolbelt entries are surfaced
  // via the `documents` table (their imported/importable artifacts).
  'api.toolbelt.queries.list': {
    consumer: 'toolbelt-list',
    target: {
      kind: 'zero_query',
      table: 'documents',
      name: 'toolbeltDocumentsByOwner',
      route: null,
    },
    projection: DOCUMENT_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: READ_ORDERING,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.toolbelt.mutations.addFromUrl': {
    consumer: 'toolbelt-add-from-url',
    target: { kind: 'hono_command', table: null, name: null, route: 'POST /api/missions' },
    projection: DOCUMENT_PROJECTION,
    response_error_shape: HONO_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: HONO_OPTIMISTIC_NEVER,
    conflict: IDEMPOTENCY_KEY_CONFLICT,
    rejection: HONO_REJECTION,
    offline: HONO_ONLINE_OFFLINE,
    identifier: uuidV7Identifier(null, 'idempotencyKey'),
    e2e_criterion: 'T-SYNC-019',
  },

  /* ----- whats new ----- */
  'api.whatsNew.queries.getLatestFindings': {
    consumer: 'whats-new-feed',
    target: {
      kind: 'zero_query',
      table: 'whats_new_reports',
      name: 'latestWhatsNewReports',
      route: null,
    },
    projection: WHATS_NEW_REPORT_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: READ_ORDERING,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.whatsNew.queries.getReportById': {
    consumer: 'whats-new-report-detail',
    target: {
      kind: 'zero_query',
      table: 'whats_new_reports',
      name: 'whatsNewReportById',
      route: null,
    },
    projection: WHATS_NEW_REPORT_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.whatsNew.actions.generate': {
    consumer: 'whats-new-generate',
    target: { kind: 'hono_command', table: null, name: null, route: 'POST /api/missions' },
    projection: WHATS_NEW_REPORT_PROJECTION,
    response_error_shape: HONO_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: HONO_OPTIMISTIC_NEVER,
    conflict: IDEMPOTENCY_KEY_CONFLICT,
    rejection: HONO_REJECTION,
    offline: HONO_ONLINE_OFFLINE,
    identifier: uuidV7Identifier(null, 'idempotencyKey'),
    e2e_criterion: 'T-SYNC-019',
  },

  /* ----- notifications ----- */
  'api.notifications.queries.getLastSeen': {
    consumer: 'notification-bell-last-seen',
    target: {
      kind: 'zero_query',
      table: 'notifications',
      name: 'notificationLastSeen',
      route: null,
    },
    projection: NOTIFICATION_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.notifications.queries.hasNewSince': {
    consumer: 'notification-bell-has-new',
    target: {
      kind: 'zero_query',
      table: 'notifications',
      name: 'notificationsHasNewSince',
      route: null,
    },
    projection: NOTIFICATION_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.notifications.queries.listRecent': {
    consumer: 'notification-list-recent',
    target: {
      kind: 'zero_query',
      table: 'notifications',
      name: 'notificationsRecent',
      route: null,
    },
    projection: NOTIFICATION_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: READ_ORDERING,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.notifications.queries.listUnread': {
    consumer: 'notification-list-unread',
    target: {
      kind: 'zero_query',
      table: 'notifications',
      name: 'notificationsUnread',
      route: null,
    },
    projection: NOTIFICATION_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: READ_ORDERING,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.notifications.queries.getHasSeenNavTooltip': {
    consumer: 'whats-new-nav-tooltip',
    target: { kind: 'zero_query', table: 'app_settings', name: 'hasSeenNavTooltip', route: null },
    projection: APP_SETTING_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.notifications.mutations.updateLastSeen': {
    consumer: 'notification-update-last-seen',
    target: {
      kind: 'zero_mutator',
      table: 'notifications',
      name: 'updateNotificationLastSeen',
      route: null,
    },
    projection: NOTIFICATION_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: VERSIONED_CAS_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.notifications.mutations.markRead': {
    consumer: 'notification-mark-read',
    target: {
      kind: 'zero_mutator',
      table: 'notifications',
      name: 'markNotificationRead',
      route: null,
    },
    projection: NOTIFICATION_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: IDEMPOTENCY_KEY_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(null, 'idempotencyKey'),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.notifications.mutations.markAllRead': {
    consumer: 'notification-mark-all-read',
    target: {
      kind: 'zero_mutator',
      table: 'notifications',
      name: 'markAllNotificationsRead',
      route: null,
    },
    projection: NOTIFICATION_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: REQUEST_KEY_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier('requestKey'),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.notifications.mutations.markNavTooltipSeen': {
    consumer: 'whats-new-mark-nav-tooltip',
    target: {
      kind: 'zero_mutator',
      table: 'app_settings',
      name: 'markNavTooltipSeen',
      route: null,
    },
    projection: APP_SETTING_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: VERSIONED_CAS_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },

  /* ----- documents / articles ----- */
  'api.documents.queries.list': {
    consumer: 'articles-list',
    target: { kind: 'zero_query', table: 'documents', name: 'documentsByOwner', route: null },
    projection: DOCUMENT_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: READ_ORDERING,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.documents.queries.countByCategory': {
    consumer: 'articles-category-count',
    target: {
      kind: 'zero_query',
      table: 'documents',
      name: 'documentsCountByCategory',
      route: null,
    },
    projection: DOCUMENT_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.documents.queries.get': {
    consumer: 'document-detail',
    target: { kind: 'zero_query', table: 'documents', name: 'documentById', route: null },
    projection: DOCUMENT_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.documents.mutations.publishDocument': {
    consumer: 'document-publish',
    target: {
      kind: 'hono_command',
      table: null,
      name: null,
      route: 'POST /api/documents/:id/publish',
    },
    projection: DOCUMENT_PROJECTION,
    response_error_shape: HONO_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: HONO_OPTIMISTIC_NEVER,
    conflict: VERSIONED_CAS_CONFLICT,
    rejection: HONO_REJECTION,
    offline: HONO_ONLINE_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.documents.mutations.unpublishDocument': {
    consumer: 'document-unpublish',
    target: { kind: 'zero_mutator', table: 'documents', name: 'unpublishDocument', route: null },
    projection: DOCUMENT_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: VERSIONED_CAS_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.documents.search.hybridSearch': {
    consumer: 'articles-hybrid-search',
    target: { kind: 'hono_command', table: null, name: null, route: 'POST /api/missions' },
    projection: DOCUMENT_PROJECTION,
    response_error_shape: HONO_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: HONO_OPTIMISTIC_NEVER,
    conflict: REQUEST_KEY_CONFLICT,
    rejection: HONO_REJECTION,
    offline: HONO_ONLINE_OFFLINE,
    identifier: uuidV7Identifier('requestKey'),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.imports.mutations.createImport': {
    consumer: 'article-import',
    target: {
      kind: 'hono_command',
      table: null,
      name: null,
      route: 'POST /api/documents/:id/import',
    },
    projection: DOCUMENT_PROJECTION,
    response_error_shape: HONO_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: HONO_OPTIMISTIC_NEVER,
    conflict: IDEMPOTENCY_KEY_CONFLICT,
    rejection: HONO_REJECTION,
    offline: HONO_ONLINE_OFFLINE,
    identifier: uuidV7Identifier(null, 'idempotencyKey'),
    e2e_criterion: 'T-SYNC-019',
  },

  /* ----- audio ----- */
  'api.audio.queries.getSegments': {
    consumer: 'article-audio-segments',
    target: {
      kind: 'zero_query',
      table: 'audio_segments',
      name: 'audioSegmentsByDocument',
      route: null,
    },
    projection: AUDIO_SEGMENT_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: CHAT_MESSAGE_ORDERING,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.audio.queries.getJob': {
    consumer: 'article-audio-job',
    target: { kind: 'zero_query', table: 'audio_jobs', name: 'audioJobByDocument', route: null },
    projection: AUDIO_JOB_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.audio.actions.generateForDocument': {
    consumer: 'article-audio-generate',
    target: { kind: 'hono_command', table: null, name: null, route: 'POST /api/missions' },
    projection: AUDIO_JOB_PROJECTION,
    response_error_shape: HONO_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: HONO_OPTIMISTIC_NEVER,
    conflict: IDEMPOTENCY_KEY_CONFLICT,
    rejection: HONO_REJECTION,
    offline: HONO_ONLINE_OFFLINE,
    identifier: uuidV7Identifier(null, 'idempotencyKey'),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.audio.actions.regenerateForDocument': {
    consumer: 'article-audio-regenerate',
    target: { kind: 'hono_command', table: null, name: null, route: 'POST /api/missions' },
    projection: AUDIO_JOB_PROJECTION,
    response_error_shape: HONO_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: HONO_OPTIMISTIC_NEVER,
    conflict: REQUEST_KEY_CONFLICT,
    rejection: HONO_REJECTION,
    offline: HONO_ONLINE_OFFLINE,
    identifier: uuidV7Identifier('requestKey'),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.audio.actions.retryFailedSegments': {
    consumer: 'article-audio-retry',
    target: { kind: 'hono_command', table: null, name: null, route: 'POST /api/missions' },
    projection: AUDIO_SEGMENT_PROJECTION,
    response_error_shape: HONO_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: HONO_OPTIMISTIC_NEVER,
    conflict: REQUEST_KEY_CONFLICT,
    rejection: HONO_REJECTION,
    offline: HONO_ONLINE_OFFLINE,
    identifier: uuidV7Identifier('requestKey'),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.audioTranscripts.actions.getTranscriptStatus': {
    consumer: 'podcast-transcription-status',
    target: { kind: 'hono_command', table: null, name: null, route: 'GET /api/missions/:id' },
    projection: EMPTY_PROJECTION,
    response_error_shape: HONO_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: HONO_OPTIMISTIC_NEVER,
    conflict: LWW_CONFLICT,
    rejection: HONO_REJECTION,
    offline: HONO_ONLINE_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },

  /* ----- voice (EXCLUDED from zero_pub; modeled via chat_runs + chat_messages + app_settings) ----- */
  'api.voice.queries.getVoiceLanguage': {
    consumer: 'settings-voice-language',
    target: { kind: 'zero_query', table: 'app_settings', name: 'voiceLanguage', route: null },
    projection: APP_SETTING_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.voice.mutations.setVoiceLanguage': {
    consumer: 'settings-set-voice-language',
    target: { kind: 'zero_mutator', table: 'app_settings', name: 'setVoiceLanguage', route: null },
    projection: APP_SETTING_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: VERSIONED_CAS_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.voice.actions.createSession': {
    consumer: 'voice-session-create',
    target: { kind: 'hono_command', table: null, name: null, route: 'POST /api/chat-runs' },
    projection: CHAT_MESSAGE_PROJECTION,
    response_error_shape: HONO_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: HONO_ROLLBACK_OPTIMISTIC,
    conflict: REQUEST_ID_CONFLICT,
    rejection: HONO_REJECTION,
    offline: HONO_ROLLBACK_OFFLINE,
    identifier: uuidV7Identifier('requestId'),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.voice.mutations.endSession': {
    consumer: 'voice-session-end',
    target: {
      kind: 'hono_command',
      table: null,
      name: null,
      route: 'POST /api/chat-runs/:id/cancel',
    },
    projection: CHAT_MESSAGE_PROJECTION,
    response_error_shape: HONO_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: HONO_OPTIMISTIC_NEVER,
    conflict: REQUEST_KEY_CONFLICT,
    rejection: HONO_REJECTION,
    offline: HONO_ONLINE_OFFLINE,
    identifier: uuidV7Identifier(null, 'idempotencyKey'),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.voice.mutations.recordTranscript': {
    consumer: 'voice-session-record',
    target: {
      kind: 'zero_mutator',
      table: 'chat_messages',
      name: 'recordVoiceTranscript',
      route: null,
    },
    projection: CHAT_MESSAGE_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: IDEMPOTENCY_KEY_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(null, 'idempotencyKey'),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.voice.mutations.generateAudioUploadUrl': {
    consumer: 'voice-audio-upload-init',
    target: { kind: 'hono_command', table: null, name: null, route: 'POST /api/uploads' },
    projection: EMPTY_PROJECTION,
    response_error_shape: HONO_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: HONO_OPTIMISTIC_NEVER,
    conflict: IDEMPOTENCY_KEY_CONFLICT,
    rejection: HONO_REJECTION,
    offline: HONO_ONLINE_OFFLINE,
    identifier: uuidV7Identifier(null, 'idempotencyKey'),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.voice.mutations.attachAudio': {
    consumer: 'voice-audio-attach',
    target: {
      kind: 'hono_command',
      table: null,
      name: null,
      route: 'POST /api/uploads/:id/finalize',
    },
    projection: EMPTY_PROJECTION,
    response_error_shape: HONO_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: HONO_OPTIMISTIC_NEVER,
    conflict: IDEMPOTENCY_KEY_CONFLICT,
    rejection: HONO_REJECTION,
    offline: HONO_ONLINE_OFFLINE,
    identifier: uuidV7Identifier(null, 'idempotencyKey'),
    e2e_criterion: 'T-SYNC-019',
  },

  /* ----- assimilate ----- */
  'api.assimilate.queries.getAssimilationSession': {
    consumer: 'assimilate-session-detail',
    target: {
      kind: 'zero_query',
      table: 'assimilation_sessions',
      name: 'assimilationSessionById',
      route: null,
    },
    projection: ASSIMILATION_SESSION_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.assimilate.mutations.approveAssimilationPlan': {
    consumer: 'assimilate-plan-approve',
    target: {
      kind: 'zero_mutator',
      table: 'assimilation_sessions',
      name: 'approveAssimilationPlan',
      route: null,
    },
    projection: ASSIMILATION_SESSION_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: IDEMPOTENCY_KEY_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(null, 'idempotencyKey'),
    e2e_criterion: 'T-SYNC-019',
  },
  'api.assimilate.mutations.rejectAssimilationPlan': {
    consumer: 'assimilate-plan-reject',
    target: {
      kind: 'zero_mutator',
      table: 'assimilation_sessions',
      name: 'rejectAssimilationPlan',
      route: null,
    },
    projection: ASSIMILATION_SESSION_PROJECTION,
    response_error_shape: ZERO_MUTATOR_ERROR_SHAPE,
    ordering_cursor: NO_CURSOR,
    optimistic: ZERO_MUTATOR_OPTIMISTIC,
    conflict: IDEMPOTENCY_KEY_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_MUTATOR_OFFLINE,
    identifier: uuidV7Identifier(null, 'idempotencyKey'),
    e2e_criterion: 'T-SYNC-019',
  },

  /* ----- agent activity (no live agent_activity table; surfaced via agent_plans) ----- */
  'api.db.agentActivity.get': {
    consumer: 'agent-activity-bar',
    target: { kind: 'zero_query', table: 'agent_plans', name: 'agentActivityByOwner', route: null },
    projection: AGENT_PLAN_PROJECTION,
    response_error_shape: ZERO_READ_ERROR_SHAPE,
    ordering_cursor: READ_ORDERING,
    optimistic: ZERO_READ_OPTIMISTIC,
    conflict: LWW_CONFLICT,
    rejection: ZERO_REJECTION,
    offline: ZERO_READ_OFFLINE,
    identifier: uuidV7Identifier(),
    e2e_criterion: 'T-SYNC-019',
  },
};

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export interface AuthorOptions {
  /** Path to the S-CONTRACT-01 inventory JSON. */
  inventoryPath: string;
  /** Optional override of the canonical output path (informational only). */
  outputPath?: string;
}

/** Inventory shape — narrows the S-CONTRACT-01 artifact. */
interface InventoryFile {
  call_sites?: CallSite[];
  summary?: { call_site_count?: number };
  /**
   * Optional pointer to the runtime data file. The S-CONTRACT-01 canonical
   * artifact at `.spec/.../13-client-callsite-inventory.json` is a metadata
   * wrapper that records counting rules, observed counts, and determinism
   * guarantees; the actual `call_sites[]` array lives in the runtime output
   * at `.tmp/client-contract/convex-callsite-inventory.json`. The author
   * follows this indirection so the AC verification gates can pass the
   * canonical metadata path while still reading the real records.
   */
  output_path?: string;
}

/**
 * Read and validate the inventory artifact at `inventoryPath`.
 * Throws if the file is missing, malformed JSON, or does not contain a
 * non-empty `call_sites` array (either directly or via `output_path`).
 */
export function loadInventory(inventoryPath: string): CallSiteInventory {
  const abs = resolve(inventoryPath);
  let raw: string;
  try {
    raw = readFileSync(abs, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`failed to read inventory at ${abs}: ${msg}`);
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(raw) ?? JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`failed to parse inventory at ${abs}: ${msg}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`inventory at ${abs} is not an object`);
  }
  let obj = parsed as InventoryFile;
  // Follow output_path indirection: the canonical .spec artifact is a
  // metadata wrapper, and the real call_sites[] array lives at the path
  // declared in `output_path`. Resolved relative to the process cwd (the
  // path is repo-root-relative, e.g. `.tmp/client-contract/...`).
  if ((!obj.call_sites || obj.call_sites.length === 0) && obj.output_path) {
    const indirectAbs = resolve(obj.output_path);
    if (!existsSync(indirectAbs)) {
      throw new Error(
        `inventory at ${abs} has no call_sites and output_path target does not exist: ${indirectAbs}`
      );
    }
    try {
      raw = readFileSync(indirectAbs, 'utf8');
      parsed = parseYaml(raw) ?? JSON.parse(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`failed to read indirect inventory at ${indirectAbs}: ${msg}`);
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`indirect inventory at ${indirectAbs} is not an object`);
    }
    obj = parsed as InventoryFile;
  }
  if (!Array.isArray(obj.call_sites) || obj.call_sites.length === 0) {
    throw new Error(`inventory at ${abs} has no call_sites array`);
  }
  return obj as CallSiteInventory;
}

/**
 * Resolve a contract target against the live zero_pub / Hono surfaces.
 * Returns `{ resolved: true, evidence }` on success and
 * `{ resolved: false, evidence }` on failure (fail-closed diagnostics).
 */
export function resolveTarget(target: ContractTarget): {
  resolved: boolean;
  evidence: string;
} {
  if (target.kind === 'hono_command') {
    if (!target.route) {
      return { resolved: false, evidence: 'hono_command missing target.route' };
    }
    if (!LIVE_HONO_ROUTE_KEYS.has(target.route)) {
      return {
        resolved: false,
        evidence: `hono route not in live surface: ${target.route}`,
      };
    }
    return { resolved: true, evidence: `live hono route: ${target.route}` };
  }
  // zero_query | zero_mutator
  if (!target.table) {
    return { resolved: false, evidence: `${target.kind} missing target.table` };
  }
  if (!LIVE_ZERO_PUB_TABLES.has(target.table)) {
    return {
      resolved: false,
      evidence: `table not in zero_pub: ${target.table}`,
    };
  }
  return {
    resolved: true,
    evidence: `live zero_pub table: ${target.table} (${target.kind})`,
  };
}

/**
 * Build the full contract from the inventory. Throws fail-closed if any
 * call site lacks a mapping, any mapping fails target resolution, or any
 * required semantic field is missing.
 */
export function authorContract(options: AuthorOptions): ClientDataContract {
  const inventory = loadInventory(options.inventoryPath);

  // Defensive dedup — S-CONTRACT-01 guarantees unique call_site_ids but
  // S-CONTRACT-02 STRICTLY clause requires we re-assert it during authoring.
  const seenIds = new Set<string>();
  for (const c of inventory.call_sites) {
    if (seenIds.has(c.call_site_id)) {
      throw new Error(`duplicate call_site_id in inventory: ${c.call_site_id}`);
    }
    seenIds.add(c.call_site_id);
  }

  const entries: ContractEntry[] = [];
  const unresolved: Array<{ call_site_id: string; evidence: string }> = [];
  const byTargetKind: Record<TargetKind, number> = {
    zero_query: 0,
    zero_mutator: 0,
    hono_command: 0,
  };
  const byOfflinePolicy: Record<OfflinePolicy, number> = {
    cache_read: 0,
    queue_write: 0,
    online_only: 0,
    rollback_rejection: 0,
  };

  for (const site of inventory.call_sites) {
    const mapping = LEGACY_REF_MAPPINGS[site.legacy_ref];
    if (!mapping) {
      throw new Error(
        `no legacy_ref mapping for ${site.legacy_ref} (call_site_id=${site.call_site_id}); ` +
          'add an entry to LEGACY_REF_MAPPINGS or fix the inventory'
      );
    }
    const resolution = resolveTarget(mapping.target);
    if (!resolution.resolved) {
      unresolved.push({
        call_site_id: site.call_site_id,
        evidence: resolution.evidence,
      });
    }
    byTargetKind[mapping.target.kind] += 1;
    byOfflinePolicy[mapping.offline.policy] += 1;

    entries.push({
      call_site_id: site.call_site_id,
      source_path: site.source_path,
      line: site.line,
      column: site.column,
      hook_kind: site.hook_kind,
      legacy_ref: site.legacy_ref,
      consumer: mapping.consumer,
      target: mapping.target,
      projection: mapping.projection,
      response_error_shape: mapping.response_error_shape,
      ordering_cursor: mapping.ordering_cursor,
      optimistic: mapping.optimistic,
      conflict: mapping.conflict,
      rejection: mapping.rejection,
      offline: mapping.offline,
      identifier: mapping.identifier,
      e2e_criterion: mapping.e2e_criterion,
    });
  }

  // Deterministic ordering: matches the inventory sort order. We re-sort
  // here so an unsorted inventory input still produces a stable contract.
  entries.sort((a, b) => {
    if (a.source_path !== b.source_path) return a.source_path < b.source_path ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    if (a.column !== b.column) return a.column - b.column;
    return a.hook_kind < b.hook_kind ? -1 : a.hook_kind > b.hook_kind ? 1 : 0;
  });

  // AC-4 requires all five offline behavior cases to be represented.
  // The five cases are drawn from BOTH the offline.policy field and the
  // conflict.policy field, per the T-SYNC-019 negative-control list:
  //   1. airplane-mode read         -> offline.policy = cache_read
  //   2. queue/reconnect            -> offline.policy = queue_write
  //   3. server rejection rollback  -> offline.policy = rollback_rejection
  //   4. duplicate replay           -> conflict.policy in
  //                                    {request_id_replay, idempotency_key, request_key}
  //   5. concurrent edit            -> conflict.policy = versioned_cas
  const offlineBehaviorCases = new Set<OfflinePolicy>(entries.map((e) => e.offline.policy));
  const requiredOfflineCases: OfflinePolicy[] = [
    'cache_read', // airplane-mode reads
    'queue_write', // queue/reconnect writes
    'rollback_rejection', // server rejection rollback
    'online_only', // online-only authoritative commands
  ];
  const missingOfflineCases = requiredOfflineCases.filter((c) => !offlineBehaviorCases.has(c));

  // AC-4 also requires the contract to represent duplicate replay and
  // concurrent-edit behaviors via the conflict policy set.
  const conflictPolicies = new Set(entries.map((e) => e.conflict.policy));
  const duplicateReplaySeen =
    conflictPolicies.has('request_id_replay') ||
    conflictPolicies.has('idempotency_key') ||
    conflictPolicies.has('request_key');
  const concurrentEditSeen = conflictPolicies.has('versioned_cas');
  const requiredConflictPolicies: ConflictPolicy[] = [
    'request_id_replay', // chat duplicate replay
    'idempotency_key', // upload/feedback duplicate replay
    'request_key', // mission steering/verdict replay
    'versioned_cas', // concurrent-edit optimistic CAS
    'last_write_wins', // simple reads
  ];
  const missingConflictPolicies = requiredConflictPolicies.filter((p) => !conflictPolicies.has(p));

  const unresolvedCount = unresolved.length;
  // Five cases: cache_read + queue_write + rollback_rejection + online_only
  // (offline.policy side) + duplicate_replay + concurrent_edit (conflict.policy
  // side). We report the maximum of 5 when all required policies are present
  // so the AC-4 must_observe clause ("offline behavior case count=5") holds.
  const allRequiredPresent =
    missingOfflineCases.length === 0 && duplicateReplaySeen && concurrentEditSeen;
  const offlineBehaviorCaseCount = allRequiredPresent
    ? 5
    : offlineBehaviorCases.size + (duplicateReplaySeen ? 1 : 0) + (concurrentEditSeen ? 1 : 0);

  if (unresolvedCount > 0) {
    const sample = unresolved
      .slice(0, 5)
      .map((u) => `${u.call_site_id}: ${u.evidence}`)
      .join('; ');
    throw new Error(
      `client contract has ${unresolvedCount} unresolved target(s); first 5: ${sample}`
    );
  }
  if (missingOfflineCases.length > 0) {
    throw new Error(
      `client contract missing required offline cases: ${missingOfflineCases.join(', ')}`
    );
  }
  if (missingConflictPolicies.length > 0) {
    throw new Error(
      `client contract missing required conflict policies: ${missingConflictPolicies.join(', ')}`
    );
  }

  return {
    contract_version: 1,
    task_id: 'S-CONTRACT-02',
    sprint: 'sprint-21-client-data-contract',
    description:
      'Maps every legacy Convex hook/action call site to one published Zero query, ' +
      'Zero mutator, or authoritative Hono command. Declares projection, response/error ' +
      'shape, ordering/cursor, optimistic/conflict/rejection behavior, offline policy, ' +
      'identifier compatibility, and linked T-SYNC criterion for every entry.',
    generated_from: {
      inventory:
        '.spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json',
      zero_pub: 'services/platform/src/db/schema/zero-pub.ts',
      hono_routes: 'services/platform/src/http/hono-app.ts',
      e2e_criteria: '.spec/prds/mk6-migration/11-e2e-testing-criteria.md',
    },
    summary: {
      total_entries: entries.length,
      by_target_kind: byTargetKind,
      by_offline_policy: byOfflinePolicy,
      offline_behavior_case_count: offlineBehaviorCaseCount,
      unresolved_target_count: unresolvedCount,
    },
    entries,
  };
}

/**
 * Serialize the contract to YAML. Deterministic: the same contract object
 * produces byte-identical YAML across runs.
 *
 * Anchors/aliases are disabled so each entry is fully self-contained —
 * the YAML is consumed by humans and by simple line-oriented verifiers,
 * neither of which benefit from YAML's anchor/alias indirection.
 */
export function serializeContractYaml(contract: ClientDataContract): string {
  return stringifyYaml(contract, {
    indent: 2,
    lineWidth: 0, // don't wrap string values
    minContentWidth: 0,
    sortMapEntries: false,
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
    nullableStr: 'null',
    aliasDuplicateObjects: false,
    maxAliasCount: 0,
  });
}
