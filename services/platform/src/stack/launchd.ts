/**
 * launchctl helpers for Holocron stack units (bootstrap / bootout / ensure installed).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LAUNCHD_LABELS, plistPath, type StackConfig } from './config.ts';

function run(
  command: string,
  args: string[],
  options?: { timeoutMs?: number; env?: NodeJS.ProcessEnv }
): { status: number | null; stdout: string; stderr: string; combined: string } {
  const r = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options?.timeoutMs ?? 30_000,
    env: options?.env ?? process.env,
  });
  const stdout = r.stdout ?? '';
  const stderr = r.stderr ?? '';
  return {
    status: r.status,
    stdout,
    stderr,
    combined: `${stdout}\n${stderr}`,
  };
}

function substPlist(template: string, cfg: StackConfig): string {
  const bunDir = resolve(cfg.bunBin, '..');
  return template
    .replaceAll('@HOME@', cfg.home)
    .replaceAll('@HOLO_ROOT@', cfg.holoRoot)
    .replaceAll('@BUN_BIN@', cfg.bunBin)
    .replaceAll('@BUN_DIR@', bunDir)
    .replaceAll('@PG_BIN@', cfg.pgBin)
    .replaceAll('@PGDATA@', cfg.pgData)
    .replaceAll('@DATABASE_URL@', cfg.databaseUrl);
}

/** Materialize templates into LaunchAgents (same contract as install-launchd.sh). */
export function ensureLaunchAgentsInstalled(cfg: StackConfig): { ok: boolean; messages: string[] } {
  const messages: string[] = [];
  mkdirSync(cfg.launchAgentsDir, { recursive: true });
  mkdirSync(cfg.logDir, { recursive: true });

  // Prefer install script when present (keeps substitution logic centralized)
  if (existsSync(cfg.installScript)) {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOLO_ROOT: cfg.holoRoot,
      BUN_BIN: cfg.bunBin,
      PG_BIN: cfg.pgBin,
      PGDATA: cfg.pgData,
      DATABASE_URL: cfg.databaseUrl,
      LAUNCH_AGENTS_DIR: cfg.launchAgentsDir,
      HOME: cfg.home,
    };
    const r = run('bash', [cfg.installScript], { timeoutMs: 60_000, env });
    messages.push(...r.combined.split('\n').filter(Boolean).slice(0, 20));
    if (r.status === 0) {
      return { ok: true, messages };
    }
    // Fall through to inline install if script failed (e.g. brew missing in CI path)
    messages.push(`install-launchd.sh exited ${r.status}; trying inline materialize`);
  }

  const names = Object.values(LAUNCHD_LABELS).map((l) => `${l}.plist`);
  for (const name of names) {
    const src = resolve(cfg.templateDir, name);
    if (!existsSync(src)) {
      messages.push(`missing template ${src}`);
      return { ok: false, messages };
    }
    const dest = resolve(cfg.launchAgentsDir, name);
    const body = substPlist(readFileSync(src, 'utf8'), cfg);
    writeFileSync(dest, body, 'utf8');
    const lint = run('/usr/bin/plutil', ['-lint', dest]);
    if (lint.status !== 0) {
      messages.push(`plutil lint failed for ${dest}: ${lint.combined}`);
      return { ok: false, messages };
    }
    messages.push(`installed ${dest}`);
  }
  return { ok: true, messages };
}

export function bootoutLabel(cfg: StackConfig, label: string): void {
  run('launchctl', ['bootout', `${cfg.domain}/${label}`], { timeoutMs: 15_000 });
  // Older macOS / already unloaded — ignore failures
}

export function bootstrapLabel(cfg: StackConfig, label: string): { ok: boolean; detail: string } {
  const plist = plistPath(cfg, label);
  if (!existsSync(plist)) {
    return { ok: false, detail: `plist missing: ${plist}` };
  }
  // Idempotent: bootout then bootstrap
  bootoutLabel(cfg, label);
  const r = run('launchctl', ['bootstrap', cfg.domain, plist], { timeoutMs: 15_000 });
  if (r.status !== 0) {
    // Some systems use load -w as fallback
    const load = run('launchctl', ['load', '-w', plist], { timeoutMs: 15_000 });
    if (load.status !== 0) {
      return {
        ok: false,
        detail: `bootstrap failed for ${label}: ${r.combined.trim() || load.combined.trim()}`,
      };
    }
    return { ok: true, detail: `loaded ${label}` };
  }
  return { ok: true, detail: `bootstrapped ${label}` };
}

/**
 * Ensure service is loaded. If already listed with a PID, leave it;
 * if listed without PID or missing, re-bootstrap.
 */
export function ensureServiceLoaded(
  cfg: StackConfig,
  label: string,
  options?: { forceRestart?: boolean }
): { ok: boolean; detail: string; restarted: boolean } {
  const list = run('launchctl', ['list'], { timeoutMs: 10_000 });
  const line =
    list.stdout
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.split(/\s+/).pop() === label) ?? null;

  if (options?.forceRestart) {
    const boot = bootstrapLabel(cfg, label);
    return { ...boot, restarted: true };
  }

  if (line) {
    const pidRaw = line.split(/\s+/)[0] ?? '-';
    if (pidRaw !== '-' && /^\d+$/.test(pidRaw) && Number(pidRaw) > 0) {
      return { ok: true, detail: `${label} already running pid=${pidRaw}`, restarted: false };
    }
    // Listed but not running — kick it
    const boot = bootstrapLabel(cfg, label);
    return { ...boot, restarted: true };
  }

  const boot = bootstrapLabel(cfg, label);
  return { ...boot, restarted: true };
}

function pidsMatching(pattern: string): string[] {
  const r = run('pgrep', ['-f', pattern], { timeoutMs: 5_000 });
  if (r.status !== 0) return [];
  return r.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));
}

function signalPids(
  signal: 'TERM' | 'KILL',
  pids: string[],
  label: string,
  messages: string[]
): void {
  for (const pid of pids) {
    run('kill', [`-${signal}`, pid]);
    messages.push(`SIG${signal} ${label} pid ${pid}`);
  }
}

/**
 * Best-effort kill residual processes matching holocron stack patterns.
 * Postgres: SIGTERM → wait → SIGKILL (PGDATA-scoped only).
 * Mastra: same escalation for holo.ts service:up processes.
 */
export function killResidualStackProcesses(cfg: StackConfig): string[] {
  const messages: string[] = [];
  // Prefer clean pg_ctl stop for holocron PGDATA when available
  const pgCtl = resolve(cfg.pgBin, 'pg_ctl');
  if (existsSync(pgCtl) && existsSync(cfg.pgData)) {
    const stop = run(pgCtl, ['-D', cfg.pgData, 'stop', '-m', 'fast', '-t', '5'], {
      timeoutMs: 15_000,
    });
    if (stop.status === 0) {
      messages.push(`pg_ctl stop -m fast (PGDATA=${cfg.pgData})`);
    } else if (stop.combined.trim()) {
      messages.push(`pg_ctl stop: ${stop.combined.trim().slice(0, 120)}`);
    }
  }

  // Mastra: bun …/holo.ts service:up
  const mastraPattern = 'holo\\.ts service:up';
  signalPids('TERM', pidsMatching(mastraPattern), 'mastra-like', messages);
  // Postgres owned by holocron PGDATA only — avoid killing unrelated clusters
  // Escape path for pgrep -f (basic regex): treat as fixed substring of cmdline
  const pgPattern = `postgres.*-D[[:space:]]*${cfg.pgData.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
  signalPids('TERM', pidsMatching(pgPattern), `postgres (PGDATA=${cfg.pgData})`, messages);

  // After short wait, SIGKILL stubborn ones
  spawnSync('sleep', ['0.5']);
  signalPids('KILL', pidsMatching(mastraPattern), 'mastra-like', messages);
  signalPids('KILL', pidsMatching(pgPattern), `postgres (PGDATA=${cfg.pgData})`, messages);

  // Brief wait so port/state settles after SIGKILL
  if (pidsMatching(pgPattern).length > 0 || pidsMatching(mastraPattern).length > 0) {
    spawnSync('sleep', ['0.3']);
  }
  return messages;
}
