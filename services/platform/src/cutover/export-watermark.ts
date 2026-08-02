/**
 * D06-04 — export watermark capture (pre-export).
 *
 * Binds D06-03 fence/quiet state to a concrete ISO timestamp + final-write
 * audit count. STRICTLY runs before any convex export subprocess is spawned.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveRepoRoot } from '../config/secrets.ts';
import {
  defaultQuietCheckReportPath,
  getMigrationReadOnlyEnv,
  isFenceArmedEnv,
  resolveFenceArmedAt,
} from './convex-fence-client.ts';

export const FENCE_NOT_ENGAGED = 'FENCE_NOT_ENGAGED';
/** Quiet-check report missing or quiet_ok !== true — fail-closed before export. */
export const QUIET_CHECK_REQUIRED = 'QUIET_CHECK_REQUIRED';

export type ExportWatermark = {
  /** ISO-8601 timestamp captured before export spawn. */
  watermarkAt: string;
  /** Epoch-ms twin of watermarkAt (ordering proofs). */
  watermarkAtMs: number;
  /**
   * Final-write audit accepted count from D06-03 quiet-check
   * (must be 0 for a quiet fence).
   */
  lastWriteAuditCount: number;
  fence_armed_at: number | null;
  fence_env: string;
  quiet_check_path: string | null;
  quiet_ok: boolean | null;
};

export type FenceNotEngagedError = {
  ok: false;
  error: { code: typeof FENCE_NOT_ENGAGED; message: string };
};

export type QuietCheckRequiredError = {
  ok: false;
  error: { code: typeof QUIET_CHECK_REQUIRED; message: string };
};

/**
 * Fail-closed when D06-03 quiet-check evidence is missing or not ok.
 * Call AFTER watermark capture and BEFORE convex export / Postgres load.
 *
 * C-03: also rejects pre-fix theatre reports that lack drain proof or a
 * measured post-drain quiet window (even if report.ok was true).
 */
export function assertQuietCheckConfirmed(
  watermark: ExportWatermark
): QuietCheckRequiredError | null {
  if (!watermark.quiet_check_path || watermark.quiet_ok !== true) {
    return {
      ok: false,
      error: {
        code: QUIET_CHECK_REQUIRED,
        message:
          `Quiet-check not confirmed (path=${watermark.quiet_check_path ?? 'missing'}, ` +
          `quiet_ok=${String(watermark.quiet_ok)}). Run holo cutover:quiet-check first.`,
      },
    };
  }

  // Re-read report for C-03 drain + measured-window requirements
  try {
    const j = JSON.parse(readFileSync(watermark.quiet_check_path, 'utf8')) as {
      ok?: boolean;
      acceptedWriteCount?: number;
      rejectedWriteCount?: number;
      windowSeconds?: number;
      drainCompletedAtMs?: number;
      quietSinceMs?: number;
      quietUntilMs?: number;
      sinceMs?: number;
      untilMs?: number;
      elapsedMs?: number;
      drain?: {
        ok?: boolean;
        surfaces?: string[];
        consumersHonored?: boolean;
        convexDrainOk?: boolean;
        samples?: {
          afterActiveTasks?: number;
          afterRunningTasks?: number;
          afterQueuedSubscriptionContent?: number;
        };
      };
      oracle?: string;
      auditRejectedWriteCount?: number;
    };

    const drainOk = j.drain?.ok === true;
    const drainCompletedAtMs = typeof j.drainCompletedAtMs === 'number' ? j.drainCompletedAtMs : 0;
    const consumersHonored = j.drain?.consumersHonored === true;
    const convexDrainOk = j.drain?.convexDrainOk === true;
    if (!drainOk || drainCompletedAtMs <= 0 || !consumersHonored || !convexDrainOk) {
      return {
        ok: false,
        error: {
          code: QUIET_CHECK_REQUIRED,
          message:
            'Quiet-check missing real drain proof (drain.ok/drainCompletedAtMs/' +
            'consumersHonored/convexDrainOk). Pre-fix theatre (env flag + audit row ' +
            'without consumers reading HOLO_CUTOVER_SCHEDULES_DISABLED) is refused. ' +
            'Re-run holo cutover:quiet-check (C-03).',
        },
      };
    }

    // C-02: refuse residual>0 even if a forged report claims drain.ok
    const samples = j.drain?.samples;
    if (samples) {
      const aa = samples.afterActiveTasks;
      const ar = samples.afterRunningTasks;
      const aq = samples.afterQueuedSubscriptionContent;
      const residualPresent =
        (typeof aa === 'number' && aa !== 0) ||
        (typeof ar === 'number' && ar !== 0) ||
        (typeof aq === 'number' && aq !== 0);
      if (residualPresent) {
        return {
          ok: false,
          error: {
            code: QUIET_CHECK_REQUIRED,
            message:
              `Quiet-check drain residual not zero (afterActiveTasks=${String(aa)}, ` +
              `afterRunningTasks=${String(ar)}, afterQueuedSubscriptionContent=${String(aq)}). ` +
              'C-02 requires residual-zero drain before quiet/export (D06-04).',
          },
        };
      }
    }

    const windowSeconds =
      typeof j.windowSeconds === 'number' && j.windowSeconds > 0 ? j.windowSeconds : 30;
    const quietSinceMs =
      typeof j.quietSinceMs === 'number'
        ? j.quietSinceMs
        : typeof j.sinceMs === 'number'
          ? j.sinceMs
          : 0;
    const quietUntilMs =
      typeof j.quietUntilMs === 'number'
        ? j.quietUntilMs
        : typeof j.untilMs === 'number'
          ? j.untilMs
          : 0;
    const elapsedMs = typeof j.elapsedMs === 'number' ? j.elapsedMs : quietUntilMs - quietSinceMs;
    const elapsedFromDrain = quietUntilMs - drainCompletedAtMs;
    const minMs = windowSeconds * 1000;

    if (quietUntilMs <= 0 || elapsedMs < minMs || elapsedFromDrain < minMs) {
      return {
        ok: false,
        error: {
          code: QUIET_CHECK_REQUIRED,
          message:
            `Quiet-check window was not measured post-drain ` +
            `(elapsedMs=${elapsedMs}, drainElapsed=${elapsedFromDrain}, need>=${minMs}). ` +
            'Retrospective closed windows without wait are refused (C-03).',
        },
      };
    }

    if (quietSinceMs < drainCompletedAtMs) {
      return {
        ok: false,
        error: {
          code: QUIET_CHECK_REQUIRED,
          message:
            `Quiet-check quietSinceMs (${quietSinceMs}) is before drainCompletedAtMs ` +
            `(${drainCompletedAtMs}) — quiet window must start after drain (C-03).`,
        },
      };
    }

    const accepted = typeof j.acceptedWriteCount === 'number' ? j.acceptedWriteCount : -1;
    const rejected = typeof j.rejectedWriteCount === 'number' ? j.rejectedWriteCount : 0;
    if (accepted !== 0 || rejected <= 0) {
      return {
        ok: false,
        error: {
          code: QUIET_CHECK_REQUIRED,
          message:
            `Quiet-check write oracles failed (accepted=${accepted}, rejected=${rejected}; ` +
            'need accepted==0 and rejected>0 from post-drain interval).',
        },
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: {
        code: QUIET_CHECK_REQUIRED,
        message: `Quiet-check report unreadable at ${watermark.quiet_check_path}: ${msg}`,
      },
    };
  }

  return null;
}

export function defaultWatermarkReportPath(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D06-04/watermark-report.json');
}

export function defaultExportRoot(cwd = process.cwd()): string {
  return resolve(cwd, '.tmp/D06-04/exports');
}

/**
 * Fail-closed fence precondition for cutover ETL.
 * Returns null when armed; structured error when disengaged.
 */
export function assertFenceEngaged(cwd?: string): FenceNotEngagedError | null {
  const root = cwd ?? resolveRepoRoot();
  const envVal = getMigrationReadOnlyEnv(root);
  if (!isFenceArmedEnv(envVal)) {
    return {
      ok: false,
      error: {
        code: FENCE_NOT_ENGAGED,
        message:
          "Fence is not engaged (HOLO_MIGRATION_READ_ONLY != '1'). Run holo cutover:freeze first.",
      },
    };
  }
  return null;
}

type QuietCheckSnapshot = {
  acceptedWriteCount: number;
  ok: boolean | null;
  path: string | null;
};

function loadQuietCheckSnapshot(options?: {
  quietCheckPath?: string;
  cwd?: string;
}): QuietCheckSnapshot {
  const cwd = options?.cwd ?? resolveRepoRoot();
  const path = options?.quietCheckPath ?? defaultQuietCheckReportPath(cwd);
  if (!existsSync(path)) {
    return { acceptedWriteCount: 0, ok: null, path: null };
  }
  try {
    const j = JSON.parse(readFileSync(path, 'utf8')) as {
      acceptedWriteCount?: number;
      auditAcceptedWriteCount?: number;
      ok?: boolean;
    };
    // Prefer independent audit accepted count when present; fall back to oracle total.
    const accepted =
      typeof j.auditAcceptedWriteCount === 'number'
        ? j.auditAcceptedWriteCount
        : typeof j.acceptedWriteCount === 'number'
          ? j.acceptedWriteCount
          : 0;
    return {
      acceptedWriteCount: accepted,
      ok: typeof j.ok === 'boolean' ? j.ok : null,
      path,
    };
  } catch {
    return { acceptedWriteCount: 0, ok: null, path };
  }
}

/**
 * Capture the export watermark. Call this BEFORE spawning convex export.
 * Does not perform the fence refuse itself — caller uses assertFenceEngaged first.
 */
export async function captureExportWatermark(options?: {
  quietCheckPath?: string;
  freezeReportPath?: string;
  cwd?: string;
}): Promise<ExportWatermark> {
  const cwd = options?.cwd ?? resolveRepoRoot();
  const watermarkAtMs = Date.now();
  const watermarkAt = new Date(watermarkAtMs).toISOString();
  const fence_env = getMigrationReadOnlyEnv(cwd);
  const fence_armed_at = await resolveFenceArmedAt({
    cwd,
    freezeReportPath: options?.freezeReportPath,
  });
  const quiet = loadQuietCheckSnapshot({
    quietCheckPath: options?.quietCheckPath,
    cwd,
  });

  return {
    watermarkAt,
    watermarkAtMs,
    lastWriteAuditCount: quiet.acceptedWriteCount,
    fence_armed_at,
    fence_env,
    quiet_check_path: quiet.path,
    quiet_ok: quiet.ok,
  };
}

export function writeWatermarkSideArtifact(watermark: ExportWatermark, path: string): void {
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(watermark, null, 2)}\n`, 'utf8');
}
