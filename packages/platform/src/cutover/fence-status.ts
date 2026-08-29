/**
 * S31-OPS-06 — freeze-state config split-brain reconciliation.
 *
 * Single operator command surface: `holo cutover:fence-status --json`
 * Reads HOLO_MIGRATION_READ_ONLY (+ HOLO_CUTOVER_SCHEDULES_DISABLED) from:
 *   1. durable secrets.yaml (control-plane for platform post-PONR writes)
 *   2. process.env
 *   3. live Convex deployment env (when credentials present)
 *
 * Fail-closed on secrets↔env↔convex disagreement (FENCE_SPLIT_BRAIN).
 * Missing Convex credentials are NEVER treated as aligned — labeled
 * source=convex_unreachable (exit 0 only with --allow-convex-unreachable when
 * secrets and env agree).
 *
 * No thaw: 01-scope. This module only reports; never unsets Convex fence.
 */
import { existsSync } from 'node:fs';
import { loadSecretsFile, resolveSecretsPathFromEnv } from '../config/secrets.ts';
import {
  CUTOVER_SCHEDULES_DISABLED_ENV,
  convexEnv,
  getMigrationReadOnlyEnv,
  isFenceArmedEnv,
  MIGRATION_READ_ONLY_ENV,
} from './convex-fence-client.ts';

export const FENCE_SPLIT_BRAIN = 'FENCE_SPLIT_BRAIN';
export const CONVEX_UNREACHABLE = 'CONVEX_UNREACHABLE';

/** Normalize raw fence flag to armed | disarmed | unknown. */
export type FenceArmState = 'armed' | 'disarmed' | 'unknown';

export function normalizeFenceValue(raw: string | null | undefined): FenceArmState {
  if (raw == null) return 'unknown';
  const v = String(raw).trim();
  if (v === '') return 'unknown';
  if (isFenceArmedEnv(v)) return 'armed';
  if (v === '0' || v === 'false') return 'disarmed';
  // Any other non-empty value is unknown (fail closed when comparing).
  return 'unknown';
}

export function rawStringOrNull(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const v = String(raw).trim();
  return v.length > 0 ? v : null;
}

export type FenceSourceSecrets = {
  HOLO_MIGRATION_READ_ONLY: string | null;
  HOLO_CUTOVER_SCHEDULES_DISABLED: string | null;
  source: 'secrets';
  path: string;
  present: boolean;
};

export type FenceSourceEnv = {
  HOLO_MIGRATION_READ_ONLY: string | null;
  HOLO_CUTOVER_SCHEDULES_DISABLED: string | null;
  source: 'env';
};

export type FenceSourceConvex =
  | {
      value: string | null;
      HOLO_MIGRATION_READ_ONLY: string | null;
      HOLO_CUTOVER_SCHEDULES_DISABLED: string | null;
      source: 'convex_env';
    }
  | {
      value: null;
      HOLO_MIGRATION_READ_ONLY: null;
      HOLO_CUTOVER_SCHEDULES_DISABLED: null;
      source: 'convex_unreachable';
      error: string;
    };

export type FenceStatusReport = {
  ok: boolean;
  aligned: boolean;
  status: 'aligned' | 'split_brain' | 'convex_unreachable';
  code: typeof FENCE_SPLIT_BRAIN | typeof CONVEX_UNREACHABLE | null;
  secrets: FenceSourceSecrets;
  env: FenceSourceEnv;
  convex: FenceSourceConvex;
  /** Per-key disagreement notes for operators. */
  mismatches: string[];
  /** Truth table used for alignment (armed/disarmed/unknown). */
  states: {
    secrets: FenceArmState;
    env: FenceArmState;
    convex: FenceArmState | 'unreachable';
  };
};

export type FenceStatusOptions = {
  env?: NodeJS.ProcessEnv;
  secretsPath?: string;
  /**
   * Skip Convex env get entirely (tests / airplane mode). Still labels
   * source=convex_unreachable — never pretends aligned without the label.
   */
  offline?: boolean;
  /**
   * When secrets+env agree but Convex is unreachable, allow exit 0.
   * Never hides a secrets/env split-brain.
   */
  allowConvexUnreachable?: boolean;
  /**
   * Optional cwd for `npx convex env get` (defaults to repo root via fence client).
   */
  cwd?: string;
  /**
   * Test / harness inject of Convex values. When provided, skips live CLI.
   * Production CLI never passes this.
   */
  convexOverride?: {
    migrationReadOnly: string | null;
    schedulesDisabled?: string | null;
    unreachable?: boolean;
    error?: string;
  };
};

function readSecretsFence(
  secretsPath: string
): Omit<FenceSourceSecrets, 'source' | 'path'> & { present: boolean } {
  if (!existsSync(secretsPath)) {
    return {
      HOLO_MIGRATION_READ_ONLY: null,
      HOLO_CUTOVER_SCHEDULES_DISABLED: null,
      present: false,
    };
  }
  try {
    const map = loadSecretsFile(secretsPath);
    return {
      HOLO_MIGRATION_READ_ONLY: rawStringOrNull(map[MIGRATION_READ_ONLY_ENV]),
      HOLO_CUTOVER_SCHEDULES_DISABLED: rawStringOrNull(map[CUTOVER_SCHEDULES_DISABLED_ENV]),
      present: true,
    };
  } catch {
    return {
      HOLO_MIGRATION_READ_ONLY: null,
      HOLO_CUTOVER_SCHEDULES_DISABLED: null,
      present: false,
    };
  }
}

function readEnvFence(env: NodeJS.ProcessEnv): FenceSourceEnv {
  return {
    HOLO_MIGRATION_READ_ONLY: rawStringOrNull(env[MIGRATION_READ_ONLY_ENV]),
    HOLO_CUTOVER_SCHEDULES_DISABLED: rawStringOrNull(env[CUTOVER_SCHEDULES_DISABLED_ENV]),
    source: 'env',
  };
}

function hasConvexCredentials(env: NodeJS.ProcessEnv): boolean {
  const url =
    env.EXPO_PUBLIC_CONVEX_URL?.trim() ||
    env.CONVEX_URL?.trim() ||
    env.VITE_CONVEX_HTTP_URL?.trim() ||
    '';
  return url.length > 0;
}

function readConvexSchedulesDisabled(cwd?: string): string {
  const r = convexEnv('get', CUTOVER_SCHEDULES_DISABLED_ENV, undefined, cwd);
  const raw = (r.stdout || '').trim();
  if (r.status !== 0) {
    if (!raw || /not set|not found|undefined/i.test(raw + r.stderr)) return '';
  }
  const eq = raw.indexOf('=');
  if (eq > 0 && raw.slice(0, eq).includes(CUTOVER_SCHEDULES_DISABLED_ENV)) {
    return raw.slice(eq + 1).trim();
  }
  return raw;
}

function readConvexFence(options: FenceStatusOptions, env: NodeJS.ProcessEnv): FenceSourceConvex {
  if (options.convexOverride) {
    if (options.convexOverride.unreachable) {
      return {
        value: null,
        HOLO_MIGRATION_READ_ONLY: null,
        HOLO_CUTOVER_SCHEDULES_DISABLED: null,
        source: 'convex_unreachable',
        error: options.convexOverride.error ?? 'convex_override_unreachable',
      };
    }
    const v = rawStringOrNull(options.convexOverride.migrationReadOnly);
    return {
      value: v,
      HOLO_MIGRATION_READ_ONLY: v,
      HOLO_CUTOVER_SCHEDULES_DISABLED: rawStringOrNull(options.convexOverride.schedulesDisabled),
      source: 'convex_env',
    };
  }

  if (options.offline) {
    return {
      value: null,
      HOLO_MIGRATION_READ_ONLY: null,
      HOLO_CUTOVER_SCHEDULES_DISABLED: null,
      source: 'convex_unreachable',
      error: 'offline mode — Convex env get skipped',
    };
  }

  if (!hasConvexCredentials(env)) {
    return {
      value: null,
      HOLO_MIGRATION_READ_ONLY: null,
      HOLO_CUTOVER_SCHEDULES_DISABLED: null,
      source: 'convex_unreachable',
      error:
        'missing Convex credentials (EXPO_PUBLIC_CONVEX_URL / CONVEX_URL / VITE_CONVEX_HTTP_URL)',
    };
  }

  try {
    const migration = getMigrationReadOnlyEnv(options.cwd);
    const schedules = readConvexSchedulesDisabled(options.cwd);
    const migrationRaw = rawStringOrNull(migration);
    return {
      value: migrationRaw,
      HOLO_MIGRATION_READ_ONLY: migrationRaw,
      HOLO_CUTOVER_SCHEDULES_DISABLED: rawStringOrNull(schedules),
      source: 'convex_env',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      value: null,
      HOLO_MIGRATION_READ_ONLY: null,
      HOLO_CUTOVER_SCHEDULES_DISABLED: null,
      source: 'convex_unreachable',
      error: msg,
    };
  }
}

/**
 * Compare arm states for HOLO_MIGRATION_READ_ONLY across sources.
 * Unknown values disagree with everything (fail closed).
 */
function statesAgree(a: FenceArmState, b: FenceArmState): boolean {
  if (a === 'unknown' || b === 'unknown') return false;
  return a === b;
}

/**
 * Build the freeze-state report. Pure of process.exit — CLI maps exit codes.
 */
export function collectFenceStatus(options: FenceStatusOptions = {}): FenceStatusReport {
  const env = options.env ?? process.env;
  const secretsPath = options.secretsPath ?? resolveSecretsPathFromEnv(env);
  const secretsRaw = readSecretsFence(secretsPath);
  const secrets: FenceSourceSecrets = {
    ...secretsRaw,
    source: 'secrets',
    path: secretsPath,
  };
  const envSrc = readEnvFence(env);
  const convex = readConvexFence(options, env);

  const secretsState = normalizeFenceValue(secrets.HOLO_MIGRATION_READ_ONLY);
  const envState = normalizeFenceValue(envSrc.HOLO_MIGRATION_READ_ONLY);
  const convexState: FenceArmState | 'unreachable' =
    convex.source === 'convex_unreachable'
      ? 'unreachable'
      : normalizeFenceValue(convex.HOLO_MIGRATION_READ_ONLY);

  const mismatches: string[] = [];

  if (!statesAgree(secretsState, envState)) {
    mismatches.push(
      `secrets.HOLO_MIGRATION_READ_ONLY=${JSON.stringify(secrets.HOLO_MIGRATION_READ_ONLY)} ` +
        `(${secretsState}) != env.HOLO_MIGRATION_READ_ONLY=${JSON.stringify(envSrc.HOLO_MIGRATION_READ_ONLY)} ` +
        `(${envState})`
    );
  }

  if (convexState !== 'unreachable') {
    if (!statesAgree(secretsState, convexState)) {
      mismatches.push(
        `secrets.HOLO_MIGRATION_READ_ONLY=${JSON.stringify(secrets.HOLO_MIGRATION_READ_ONLY)} ` +
          `(${secretsState}) != convex.HOLO_MIGRATION_READ_ONLY=${JSON.stringify(convex.HOLO_MIGRATION_READ_ONLY)} ` +
          `(${convexState})`
      );
    }
    if (!statesAgree(envState, convexState)) {
      mismatches.push(
        `env.HOLO_MIGRATION_READ_ONLY=${JSON.stringify(envSrc.HOLO_MIGRATION_READ_ONLY)} ` +
          `(${envState}) != convex.HOLO_MIGRATION_READ_ONLY=${JSON.stringify(convex.HOLO_MIGRATION_READ_ONLY)} ` +
          `(${convexState})`
      );
    }
  }

  // Also surface schedules-disabled disagreement as advisory mismatches when all
  // three sources are present (does not alone drive FENCE_SPLIT_BRAIN unless
  // migration flags already disagree — migration is the write fence).
  if (convex.source === 'convex_env') {
    const sSched = normalizeFenceValue(secrets.HOLO_CUTOVER_SCHEDULES_DISABLED);
    const eSched = normalizeFenceValue(envSrc.HOLO_CUTOVER_SCHEDULES_DISABLED);
    const cSched = normalizeFenceValue(convex.HOLO_CUTOVER_SCHEDULES_DISABLED);
    if (sSched !== 'unknown' && eSched !== 'unknown' && !statesAgree(sSched, eSched)) {
      mismatches.push(
        `secrets.HOLO_CUTOVER_SCHEDULES_DISABLED=${JSON.stringify(secrets.HOLO_CUTOVER_SCHEDULES_DISABLED)} ` +
          `!= env.HOLO_CUTOVER_SCHEDULES_DISABLED=${JSON.stringify(envSrc.HOLO_CUTOVER_SCHEDULES_DISABLED)}`
      );
    }
    if (sSched !== 'unknown' && cSched !== 'unknown' && !statesAgree(sSched, cSched)) {
      mismatches.push(
        `secrets.HOLO_CUTOVER_SCHEDULES_DISABLED != convex.HOLO_CUTOVER_SCHEDULES_DISABLED ` +
          `(${JSON.stringify(secrets.HOLO_CUTOVER_SCHEDULES_DISABLED)} vs ${JSON.stringify(convex.HOLO_CUTOVER_SCHEDULES_DISABLED)})`
      );
    }
  }

  const secretsEnvAgree = statesAgree(secretsState, envState);
  const migrationMismatches = mismatches.filter((m) => m.includes('HOLO_MIGRATION_READ_ONLY'));
  const hasMigrationSplit = migrationMismatches.length > 0;

  let aligned = false;
  let status: FenceStatusReport['status'] = 'split_brain';
  let code: FenceStatusReport['code'] = FENCE_SPLIT_BRAIN;

  if (hasMigrationSplit) {
    aligned = false;
    status = 'split_brain';
    code = FENCE_SPLIT_BRAIN;
  } else if (convexState === 'unreachable') {
    // Secrets+env agree (or both unknown — still not fully aligned).
    // Never claim aligned when Convex is unreadable.
    aligned = false;
    status = 'convex_unreachable';
    code = CONVEX_UNREACHABLE;
  } else if (secretsEnvAgree && statesAgree(secretsState, convexState as FenceArmState)) {
    aligned = true;
    status = 'aligned';
    code = null;
  } else {
    aligned = false;
    status = 'split_brain';
    code = FENCE_SPLIT_BRAIN;
  }

  // Both unknown and no convex → still not aligned / split if we can't assert.
  if (secretsState === 'unknown' && envState === 'unknown' && convexState === 'unreachable') {
    aligned = false;
    status = 'convex_unreachable';
    code = CONVEX_UNREACHABLE;
    if (!mismatches.some((m) => m.includes('HOLO_MIGRATION_READ_ONLY'))) {
      mismatches.push(
        'HOLO_MIGRATION_READ_ONLY unset in secrets and env; Convex unreachable — cannot assert freeze state'
      );
    }
  }

  return {
    ok: aligned,
    aligned,
    status,
    code,
    secrets,
    env: envSrc,
    convex,
    mismatches,
    states: {
      secrets: secretsState,
      env: envState,
      convex: convexState,
    },
  };
}

/**
 * Map report → process exit code.
 * 0: aligned, OR (convex_unreachable + allowConvexUnreachable + secrets/env agree on migration)
 * 2: FENCE_SPLIT_BRAIN
 * 3: CONVEX_UNREACHABLE without allow flag
 * 1: other
 */
export function fenceStatusExitCode(
  report: FenceStatusReport,
  options: { allowConvexUnreachable?: boolean } = {}
): number {
  if (report.aligned && report.code === null) return 0;
  if (report.status === 'split_brain' || report.code === FENCE_SPLIT_BRAIN) return 2;
  if (report.status === 'convex_unreachable' || report.code === CONVEX_UNREACHABLE) {
    const secretsEnvAgree = statesAgree(report.states.secrets, report.states.env);
    if (options.allowConvexUnreachable && secretsEnvAgree) return 0;
    return 3;
  }
  return report.ok ? 0 : 1;
}

export function formatFenceStatusText(report: FenceStatusReport): string {
  const lines = [
    'holo cutover:fence-status — freeze-state reconciliation',
    `  ok:                 ${report.ok}`,
    `  aligned:            ${report.aligned}`,
    `  status:             ${report.status}`,
    `  code:               ${report.code ?? '—'}`,
    `  secrets.path:       ${report.secrets.path}`,
    `  secrets.${MIGRATION_READ_ONLY_ENV}: ${report.secrets.HOLO_MIGRATION_READ_ONLY ?? '—'} (${report.states.secrets})`,
    `  secrets.${CUTOVER_SCHEDULES_DISABLED_ENV}: ${report.secrets.HOLO_CUTOVER_SCHEDULES_DISABLED ?? '—'}`,
    `  env.${MIGRATION_READ_ONLY_ENV}:     ${report.env.HOLO_MIGRATION_READ_ONLY ?? '—'} (${report.states.env})`,
    `  env.${CUTOVER_SCHEDULES_DISABLED_ENV}: ${report.env.HOLO_CUTOVER_SCHEDULES_DISABLED ?? '—'}`,
    `  convex.source:      ${report.convex.source}`,
    `  convex.value:       ${report.convex.value ?? '—'} (${report.states.convex})`,
  ];
  if (report.convex.source === 'convex_unreachable') {
    lines.push(`  convex.error:       ${report.convex.error}`);
  }
  if (report.mismatches.length > 0) {
    lines.push('  mismatches:');
    for (const m of report.mismatches) {
      lines.push(`    - ${m}`);
    }
  }
  lines.push(
    '  note: Convex remains the live cutover write fence (HOLO_MIGRATION_READ_ONLY).',
    '        Platform post-PONR writes use secrets.yaml soak fence. No thaw command (01-scope).'
  );
  return lines.join('\n');
}
