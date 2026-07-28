/**
 * DegradedModeController — fleet-down → defined reduced mode + auto-resume.
 *
 * Catches RoleUnavailableError from resolveModel, reads degradationAction from
 * the error (manifest-sourced), transitions to a defined reduced mode:
 *   - chat / default surface → surface-unavailable message
 *   - research mission → sense-only + retry-queue for ASSAY/CHALLENGE
 *
 * NEVER falls back to cloud. Health-probe polling (real probeRoleHealth)
 * detects endpoint return and auto-resumes to normal.
 *
 * State is persisted in Postgres (degraded_mode, research_mission, retry_queue)
 * for cross-request consistency when PLATFORM_IT / production DB is available.
 */
import postgres, { type Sql } from 'postgres';
import type { DegradationAction } from '../fleet/manifest.schema.ts';
import { getFleetManifest, getRoleEntry } from '../fleet/manifest.ts';
import { resetProcessDegradedFlag, setProcessDegradedState } from './degraded-process-flag.ts';
import {
  isCloudEndpoint,
  normalizeEndpointBase,
  probeRoleHealth,
  type ResolvedModel,
  type ResolveModelOptions,
  RoleUnavailableError,
  resolveModel,
} from './resolve-model.ts';

export {
  getProcessDegradedState,
  isProcessInDegradedMode,
  resetProcessDegradedFlag,
  setProcessDegradedState,
} from './degraded-process-flag.ts';

export const SURFACE_UNAVAILABLE_MESSAGE = 'Local fleet unavailable — running in reduced mode';

export const QUEUED_RETRY_MESSAGE = 'Local fleet unavailable — step queued for retry';

export type DegradedStateValue =
  | 'normal'
  | 'surface-unavailable'
  | 'queue-and-retry'
  | 'fail-closed'
  | 'sense-only';

export type MissionMode = 'full' | 'sense-only';
export type ExtractionState = 'running' | 'failed' | 'paused';
export type ResearchStepType = 'SENSE' | 'GENERATE' | 'ASSAY' | 'CHALLENGE' | 'MAP' | 'COMMIT';

export type DegradedModeSnapshot = {
  'degraded-state': DegradedStateValue;
  'resume-state': DegradedStateValue;
  message: string | null;
  degradationAction: DegradationAction | null;
  role: string | null;
  endpoint: string | null;
  missionMode: MissionMode;
  extractionState: ExtractionState;
  lastProbeAt: string | null;
  lastProbeOk: boolean | null;
};

export type DegradationResult = {
  degraded: true;
  degradationAction: DegradationAction;
  'degraded-state': DegradedStateValue;
  message: string;
  /** Always false — never-cloud structural invariant. */
  allowCloud: false;
  role: string;
  endpoint: string;
};

export type ResolveRoleResult =
  | { ok: true; resolved: ResolvedModel }
  | {
      ok: false;
      degradation: DegradationResult;
      error: RoleUnavailableError;
    };

export type AttemptReasoningResult = {
  outcome: 'resolved' | 'surfaced' | 'queued';
  message?: string;
  allowCloud: false;
  endpoint?: string;
  resolved?: ResolvedModel;
};

export type DegradedModeControllerOptions = {
  databaseUrl?: string;
  /** Health poll interval (default 30s). Tests use a short interval. */
  pollIntervalMs?: number;
  /** Role whose fleet endpoint is probed for resume (default divergent). */
  role?: string;
  manifestPath?: string;
  fetchImpl?: typeof fetch;
  onStateChange?: (snap: DegradedModeSnapshot) => void;
  /** Optional shared postgres.js client (tests). Controller owns end() only if it created sql. */
  sql?: Sql;
};

const GLOBAL_ROW_ID = 'global';

/** Serialize ensureSchema across concurrent controller instances (parallel vitest). */
let schemaInitChain: Promise<void> = Promise.resolve();

function setProcessDegraded(state: DegradedStateValue): void {
  setProcessDegradedState(state);
}

async function runEnsureSchema(sql: Sql): Promise<void> {
  // Advisory lock avoids CREATE TABLE races on pg_type under parallel tests
  await sql`SELECT pg_advisory_lock(8723145601)`;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS degraded_mode (
        id TEXT PRIMARY KEY DEFAULT 'global',
        degraded_state TEXT NOT NULL DEFAULT 'normal',
        resume_state TEXT NOT NULL DEFAULT 'normal',
        message TEXT,
        role TEXT,
        endpoint TEXT,
        degradation_action TEXT,
        mission_mode TEXT NOT NULL DEFAULT 'full',
        extraction_state TEXT NOT NULL DEFAULT 'running',
        last_probe_at TIMESTAMPTZ,
        last_probe_ok BOOLEAN,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS research_mission (
        mission_id TEXT PRIMARY KEY,
        mode TEXT NOT NULL DEFAULT 'full',
        extraction_state TEXT NOT NULL DEFAULT 'running',
        degraded_state TEXT NOT NULL DEFAULT 'normal',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS retry_queue (
        id SERIAL PRIMARY KEY,
        mission_id TEXT NOT NULL,
        step_type TEXT NOT NULL,
        role TEXT,
        endpoint TEXT,
        reason TEXT,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`
      INSERT INTO degraded_mode (id)
      VALUES (${GLOBAL_ROW_ID})
      ON CONFLICT (id) DO NOTHING
    `;
  } finally {
    await sql`SELECT pg_advisory_unlock(8723145601)`;
  }
}

function mapActionToState(action: DegradationAction): DegradedStateValue {
  switch (action) {
    case 'surface-unavailable':
      return 'surface-unavailable';
    case 'queue-and-retry':
      return 'queue-and-retry';
    case 'fail-closed':
      return 'fail-closed';
    default:
      return 'surface-unavailable';
  }
}

function messageForAction(action: DegradationAction): string {
  switch (action) {
    case 'queue-and-retry':
      return QUEUED_RETRY_MESSAGE;
    case 'fail-closed':
      return SURFACE_UNAVAILABLE_MESSAGE;
    default:
      return SURFACE_UNAVAILABLE_MESSAGE;
  }
}

export class DegradedModeController {
  private sql: Sql;
  private ownsSql: boolean;
  private pollIntervalMs: number;
  private role: string;
  private manifestPath?: string;
  private fetchImpl?: typeof fetch;
  private onStateChange?: (snap: DegradedModeSnapshot) => void;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private probeEndpointOverride: string | null | undefined = undefined;
  private snapshot: DegradedModeSnapshot = {
    'degraded-state': 'normal',
    'resume-state': 'normal',
    message: null,
    degradationAction: null,
    role: null,
    endpoint: null,
    missionMode: 'full',
    extractionState: 'running',
    lastProbeAt: null,
    lastProbeOk: null,
  };
  private initialized = false;

  constructor(options: DegradedModeControllerOptions = {}) {
    this.pollIntervalMs = options.pollIntervalMs ?? 30_000;
    this.role = options.role ?? 'divergent';
    this.manifestPath = options.manifestPath;
    this.fetchImpl = options.fetchImpl;
    this.onStateChange = options.onStateChange;
    if (options.sql) {
      this.sql = options.sql;
      this.ownsSql = false;
    } else {
      const url =
        options.databaseUrl ?? process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';
      this.sql = postgres(url, {
        max: 4,
        prepare: false,
        onnotice: () => {},
      });
      this.ownsSql = true;
    }
  }

  async init(): Promise<void> {
    await this.ensureSchema();
    await this.loadGlobalState();
    this.initialized = true;
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialized) await this.init();
  }

  private async ensureSchema(): Promise<void> {
    const next = schemaInitChain.then(() => runEnsureSchema(this.sql));
    // Keep chain alive even if one init fails so subsequent tests can retry
    schemaInitChain = next.catch(() => undefined);
    await next;
  }

  private async loadGlobalState(): Promise<void> {
    const rows = await this.sql<
      {
        degraded_state: string;
        resume_state: string;
        message: string | null;
        role: string | null;
        endpoint: string | null;
        degradation_action: string | null;
        mission_mode: string;
        extraction_state: string;
        last_probe_at: Date | string | null;
        last_probe_ok: boolean | null;
      }[]
    >`
      SELECT degraded_state, resume_state, message, role, endpoint,
             degradation_action, mission_mode, extraction_state,
             last_probe_at, last_probe_ok
      FROM degraded_mode
      WHERE id = ${GLOBAL_ROW_ID}
    `;
    const row = rows[0];
    if (!row) return;
    this.snapshot = {
      'degraded-state': row.degraded_state as DegradedStateValue,
      'resume-state': row.resume_state as DegradedStateValue,
      message: row.message,
      degradationAction: (row.degradation_action as DegradationAction | null) ?? null,
      role: row.role,
      endpoint: row.endpoint,
      missionMode: (row.mission_mode as MissionMode) || 'full',
      extractionState: (row.extraction_state as ExtractionState) || 'running',
      lastProbeAt: row.last_probe_at ? new Date(row.last_probe_at).toISOString() : null,
      lastProbeOk: row.last_probe_ok,
    };
    setProcessDegraded(this.snapshot['degraded-state']);
  }

  private async persistGlobal(): Promise<void> {
    const s = this.snapshot;
    await this.sql`
      UPDATE degraded_mode SET
        degraded_state = ${s['degraded-state']},
        resume_state = ${s['resume-state']},
        message = ${s.message},
        role = ${s.role},
        endpoint = ${s.endpoint},
        degradation_action = ${s.degradationAction},
        mission_mode = ${s.missionMode},
        extraction_state = ${s.extractionState},
        last_probe_at = ${s.lastProbeAt ? new Date(s.lastProbeAt) : null},
        last_probe_ok = ${s.lastProbeOk},
        updated_at = now()
      WHERE id = ${GLOBAL_ROW_ID}
    `;
  }

  private emit(): void {
    setProcessDegraded(this.snapshot['degraded-state']);
    this.onStateChange?.(this.getState());
  }

  getState(): DegradedModeSnapshot {
    return { ...this.snapshot };
  }

  /**
   * Override resume probe endpoint (tests: keep dead, or null = use manifest).
   * Production never sets this — probes the role's configured fleet endpoint.
   */
  setProbeEndpointOverride(endpoint: string | null): void {
    this.probeEndpointOverride = endpoint;
  }

  /**
   * Execute degradationAction from a RoleUnavailableError (manifest-sourced).
   * Never allows cloud fallback.
   */
  async handleUnavailable(
    err: RoleUnavailableError,
    context?: {
      surface?: 'chat' | 'research';
      missionId?: string;
      stepType?: ResearchStepType;
    }
  ): Promise<DegradationResult> {
    await this.ensureInit();

    const action = err.degradationAction;
    let state = mapActionToState(action);

    // Research surface with generative steps → sense-only reduced mode
    if (context?.surface === 'research' || context?.missionId) {
      state = 'surface-unavailable';
      this.snapshot.missionMode = 'sense-only';
      this.snapshot.extractionState = 'running';
    }

    const message = messageForAction(action);
    this.snapshot = {
      ...this.snapshot,
      'degraded-state': state,
      // resume-state stays non-normal until health probe confirms return
      'resume-state': state,
      message,
      degradationAction: action,
      role: err.role,
      endpoint: err.endpoint,
    };
    await this.persistGlobal();
    this.emit();

    // Surface to operator stdout (AC-1 must_observe)
    console.log(message);
    console.log(
      `degraded-state=${state} degradationAction=${action} role=${err.role} endpoint=${err.endpoint}`
    );

    if (action === 'fail-closed' && context?.surface !== 'research') {
      // Still record + surface; caller may rethrow. Never cloud.
    }

    return {
      degraded: true,
      degradationAction: action,
      'degraded-state': state,
      message,
      allowCloud: false,
      role: err.role,
      endpoint: err.endpoint,
    };
  }

  /**
   * resolveModel wrapper: on RoleUnavailableError execute degradationAction.
   * While degraded, refuse allowEscape (never-cloud).
   */
  async resolveRole(role: string, options: ResolveModelOptions = {}): Promise<ResolveRoleResult> {
    await this.ensureInit();

    // Structural never-cloud: while degraded, strip escape even if caller asked
    const opts: ResolveModelOptions = { ...options };
    if (this.snapshot['degraded-state'] !== 'normal') {
      opts.allowEscape = false;
      opts.highStakes = false;
    }

    try {
      const resolved = await resolveModel(role, {
        ...opts,
        manifestPath: opts.manifestPath ?? this.manifestPath,
        fetchImpl: opts.fetchImpl ?? this.fetchImpl,
      });

      // Never-cloud on the default (fleet) path only. Explicit escape is budgeted
      // and already blocked when isProcessInDegradedMode() inside resolveModel.
      const escapeRequested = opts.allowEscape === true || opts.highStakes === true;
      if (
        !escapeRequested &&
        (isCloudEndpoint(resolved.endpoint) || resolved.provider === 'deepseek')
      ) {
        throw new RoleUnavailableError(
          role,
          resolved.endpoint,
          'fail-closed',
          'degraded-mode controller refused cloud endpoint on default path (never-cloud)'
        );
      }

      return { ok: true, resolved };
    } catch (err) {
      if (err instanceof RoleUnavailableError) {
        // Escape-path failures while not fleet-down should surface as errors, not
        // degrade the whole process (budget exceeded, deepseek probe fail).
        const escapeRequested = opts.allowEscape === true || opts.highStakes === true;
        if (escapeRequested && this.snapshot['degraded-state'] === 'normal') {
          throw err;
        }
        const degradation = await this.handleUnavailable(err, { surface: 'chat' });
        return { ok: false, degradation, error: err };
      }
      throw err;
    }
  }

  /**
   * Attempt a reasoning call under degraded-mode policy.
   * Outcomes: resolved (fleet only), surfaced, or queued — never cloud.
   */
  async attemptReasoning(
    role: string,
    options: ResolveModelOptions = {}
  ): Promise<AttemptReasoningResult> {
    await this.ensureInit();

    if (this.snapshot['degraded-state'] !== 'normal') {
      const action = this.snapshot.degradationAction ?? 'surface-unavailable';
      if (action === 'queue-and-retry') {
        console.log(QUEUED_RETRY_MESSAGE);
        return {
          outcome: 'queued',
          message: QUEUED_RETRY_MESSAGE,
          allowCloud: false,
        };
      }
      console.log(SURFACE_UNAVAILABLE_MESSAGE);
      return {
        outcome: 'surfaced',
        message: this.snapshot.message ?? SURFACE_UNAVAILABLE_MESSAGE,
        allowCloud: false,
      };
    }

    const result = await this.resolveRole(role, options);
    if (result.ok) {
      return {
        outcome: 'resolved',
        allowCloud: false,
        endpoint: result.resolved.endpoint,
        resolved: result.resolved,
      };
    }

    const action = result.degradation.degradationAction;
    if (action === 'queue-and-retry') {
      return {
        outcome: 'queued',
        message: result.degradation.message,
        allowCloud: false,
        endpoint: result.error.endpoint,
      };
    }
    return {
      outcome: 'surfaced',
      message: result.degradation.message,
      allowCloud: false,
      endpoint: result.error.endpoint,
    };
  }

  /**
   * Single real health probe tick. Resumes only when probe succeeds.
   */
  async pollOnce(): Promise<{ ok: boolean; resumed: boolean; endpoint?: string }> {
    await this.ensureInit();

    const manifest = getFleetManifest(this.manifestPath);
    const entry = getRoleEntry(manifest, this.role);
    const endpointOverride =
      this.probeEndpointOverride === undefined
        ? undefined
        : (this.probeEndpointOverride ?? undefined);

    // When override is explicitly null, use manifest endpoint (live fleet)
    const probeOpts =
      this.probeEndpointOverride === null
        ? { fetchImpl: this.fetchImpl }
        : {
            endpointOverride: endpointOverride ?? this.snapshot.endpoint ?? undefined,
            fetchImpl: this.fetchImpl,
          };

    // Prefer probing the role's configured endpoint for resume (real fleet)
    const health = await probeRoleHealth(entry, {
      endpointOverride:
        this.probeEndpointOverride === null ? undefined : (this.probeEndpointOverride ?? undefined),
      fetchImpl: this.fetchImpl,
    });

    const now = new Date().toISOString();
    this.snapshot.lastProbeAt = now;
    this.snapshot.lastProbeOk = health.ok;

    if (!health.ok) {
      await this.persistGlobal();
      this.emit();
      return { ok: false, resumed: false, endpoint: health.endpoint };
    }

    const endpoint = normalizeEndpointBase(health.endpoint);
    if (isCloudEndpoint(endpoint)) {
      // Never treat cloud as a valid resume target
      this.snapshot.lastProbeOk = false;
      await this.persistGlobal();
      this.emit();
      return { ok: false, resumed: false, endpoint };
    }

    const wasDegraded = this.snapshot['degraded-state'] !== 'normal';
    this.snapshot = {
      ...this.snapshot,
      'degraded-state': 'normal',
      'resume-state': 'normal',
      message: null,
      degradationAction: null,
      endpoint,
      lastProbeAt: now,
      lastProbeOk: true,
    };
    // Research missions stay sense-only until operator/mission resumes separately;
    // global routing returns to normal so resolveModel works again.
    await this.persistGlobal();
    this.emit();

    if (wasDegraded) {
      console.log(
        `degraded-state=normal resume-state=normal endpoint=${endpoint} (auto-resume after health probe)`
      );
    }

    void probeOpts; // reserved for probe option logging
    return { ok: true, resumed: wasDegraded, endpoint };
  }

  startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      void this.pollOnce().catch((err) => {
        console.error(
          `degraded-mode health poll error: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }, this.pollIntervalMs);
    // Don't keep the process alive solely for polling
    if (typeof this.pollTimer === 'object' && this.pollTimer && 'unref' in this.pollTimer) {
      (this.pollTimer as NodeJS.Timeout).unref();
    }
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // ── Research mission API ─────────────────────────────────────────────────

  async startResearchMission(missionId: string): Promise<{
    missionId: string;
    mode: MissionMode;
    extractionState: ExtractionState;
  }> {
    await this.ensureInit();
    await this.sql`
      INSERT INTO research_mission (mission_id, mode, extraction_state, degraded_state)
      VALUES (${missionId}, 'full', 'running', 'normal')
      ON CONFLICT (mission_id) DO UPDATE SET
        mode = 'full',
        extraction_state = 'running',
        degraded_state = 'normal',
        updated_at = now()
    `;
    return { missionId, mode: 'full', extractionState: 'running' };
  }

  async handleResearchStepUnavailable(
    missionId: string,
    stepType: ResearchStepType,
    err: RoleUnavailableError
  ): Promise<{
    mode: MissionMode;
    extractionState: ExtractionState;
    'degraded-state': DegradedStateValue;
    queued: boolean;
  }> {
    await this.ensureInit();

    // Global degraded transition (research surface)
    await this.handleUnavailable(err, {
      surface: 'research',
      missionId,
      stepType,
    });

    const queueGenerative = stepType === 'ASSAY' || stepType === 'CHALLENGE';
    if (queueGenerative) {
      await this.sql.unsafe(
        `INSERT INTO retry_queue (mission_id, step_type, role, endpoint, reason, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          missionId,
          stepType,
          err.role,
          err.endpoint,
          err.message,
          JSON.stringify({
            code: err.code,
            degradationAction: err.degradationAction,
          }),
        ]
      );
    }

    // Mission → sense-only; extraction keeps running (SENSE can continue)
    await this.sql`
      INSERT INTO research_mission (mission_id, mode, extraction_state, degraded_state)
      VALUES (${missionId}, 'sense-only', 'running', 'surface-unavailable')
      ON CONFLICT (mission_id) DO UPDATE SET
        mode = 'sense-only',
        extraction_state = 'running',
        degraded_state = 'surface-unavailable',
        updated_at = now()
    `;

    this.snapshot.missionMode = 'sense-only';
    this.snapshot.extractionState = 'running';
    await this.persistGlobal();
    this.emit();

    return {
      mode: 'sense-only',
      extractionState: 'running',
      'degraded-state': 'surface-unavailable',
      queued: queueGenerative,
    };
  }

  async getResearchMission(missionId: string): Promise<{
    mode: MissionMode;
    extractionState: ExtractionState;
    'degraded-state': DegradedStateValue;
  }> {
    await this.ensureInit();
    const rows = await this.sql<
      { mode: string; extraction_state: string; degraded_state: string }[]
    >`
      SELECT mode, extraction_state, degraded_state
      FROM research_mission
      WHERE mission_id = ${missionId}
    `;
    const row = rows[0];
    if (!row) {
      throw new Error(`research mission not found: ${missionId}`);
    }
    return {
      mode: row.mode as MissionMode,
      extractionState: row.extraction_state as ExtractionState,
      'degraded-state': row.degraded_state as DegradedStateValue,
    };
  }

  async countRetryQueue(missionId: string, stepTypes?: string[]): Promise<number> {
    await this.ensureInit();
    if (stepTypes && stepTypes.length > 0) {
      const rows = await this.sql<{ n: string }[]>`
        SELECT COUNT(*)::text AS n
        FROM retry_queue
        WHERE mission_id = ${missionId}
          AND step_type = ANY(${stepTypes})
      `;
      return Number(rows[0]?.n ?? 0);
    }
    const rows = await this.sql<{ n: string }[]>`
      SELECT COUNT(*)::text AS n
      FROM retry_queue
      WHERE mission_id = ${missionId}
    `;
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * Force normal routing (operator/test helper). Does NOT skip health probe for
   * auto-resume production path — use pollOnce() for real resume. This is for
   * suite isolation and explicit operator override after maintenance.
   */
  async forceNormal(): Promise<void> {
    await this.ensureInit();
    this.snapshot = {
      'degraded-state': 'normal',
      'resume-state': 'normal',
      message: null,
      degradationAction: null,
      role: null,
      endpoint: null,
      missionMode: 'full',
      extractionState: 'running',
      lastProbeAt: this.snapshot.lastProbeAt,
      lastProbeOk: this.snapshot.lastProbeOk,
    };
    await this.persistGlobal();
    this.emit();
  }

  async close(options?: { resetToNormal?: boolean }): Promise<void> {
    this.stopPolling();
    if (options?.resetToNormal) {
      try {
        await this.forceNormal();
      } catch {
        // best-effort cleanup
      }
    }
    if (this.ownsSql) {
      await this.sql.end({ timeout: 5 });
    }
    // Always clear process flag on close so other tests don't inherit degraded.
    resetProcessDegradedFlag();
  }
}
