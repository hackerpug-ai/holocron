/**
 * pipes-4 / AC-4 — RED: no-shells fails while per-domain modules remain.
 *
 * Start: per_domain_modules_exist (whatsnew/, assimilate/, shop/, subscriptions/).
 * Desired: zero per-domain module directories; holo verify:no-shells exits 0.
 *
 * Named modules that must be deleted (STRICTLY):
 *   - whatsnew/
 *   - assimilate/
 *   - shop/
 *   - subscriptions/
 *
 * Seeded/path probe (TC-3): psql $DATABASE_URL (suite env) + real filesystem scan.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ensureRedTestEnvironment } from './mission-red.helpers';
import {
  captureHoloArtifact,
  DATABASE_URL,
  ensurePipes4EvidenceDirs,
  PER_DOMAIN_SHELL_DIRS,
  PLATFORM_IT,
  PSQL_DATABASE_URL_MARKER,
  REPO_ROOT,
  runHolo,
  runPsql,
  writePipes4Artifact,
} from './pipes-4-red.helpers';

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function listDirNames(path: string): string[] {
  try {
    if (!isDirectory(path)) return [];
    return readdirSync(path);
  } catch {
    return [];
  }
}

describe.sequential('pipes-4 AC-4 RED — no-shells / per-domain modules', () => {
  beforeAll(async () => {
    ensurePipes4EvidenceDirs();
    await ensureRedTestEnvironment();
    expect(PLATFORM_IT).toBe(true);
    expect(DATABASE_URL).toContain('/holocron_nonprod');
    expect(PSQL_DATABASE_URL_MARKER).toContain('psql $DATABASE_URL');
  }, 120_000);

  it('RED modules present: expected 0 modules, found N for whatsnew/ assimilate/ shop/ subscriptions/', () => {
    // Real env probe (suite requires live Postgres even for filesystem AC)
    const psqlProbe = runPsql(`SELECT current_database() AS db`);
    writePipes4Artifact('AC-4-psql-probe.txt', {
      marker: 'psql $DATABASE_URL',
      status: psqlProbe.status,
      stdout: psqlProbe.stdout,
      stderr: psqlProbe.stderr,
    });
    expect(psqlProbe.status, psqlProbe.stderr).toBe(0);

    const found: string[] = [];
    for (const rel of PER_DOMAIN_SHELL_DIRS) {
      const abs = resolve(REPO_ROOT, rel);
      if (isDirectory(abs)) {
        found.push(rel.endsWith('/') ? rel : `${rel}/`);
      }
    }

    // Also surface platform/src children matching shell names (case-insensitive).
    const platformSrc = resolve(REPO_ROOT, 'services/platform/src');
    for (const name of listDirNames(platformSrc)) {
      if (/^(whatsnew|assimilate|shop|subscriptions)$/i.test(name)) {
        const rel = `services/platform/src/${name}/`;
        if (!found.includes(rel)) found.push(rel);
      }
    }

    const n = found.length;
    writePipes4Artifact('AC-4-shell-scan.json', {
      found,
      n,
      scanned: PER_DOMAIN_SHELL_DIRS,
      platformSrcChildren: listDirNames(platformSrc),
    });

    // Optional CLI surface (may be unimplemented at RED start).
    const verify = runHolo('pipes4-ac4-verify-no-shells', ['verify:no-shells']);
    captureHoloArtifact('AC-4-verify-no-shells', verify);

    // Desired GREEN: zero per-domain modules.
    // RED-against-start: modules still present → expected 0 modules, found N
    expect(
      n,
      `expected 0 modules, found N=${n}; expected 0, found ${n}; shells=${found.join(', ')} (whatsnew/ assimilate/ shop/ subscriptions/)`
    ).toBe(0);
    expect(
      verify.status,
      `holo verify:no-shells must exit 0 when shells are gone; got ${verify.status}: ${verify.combined}`
    ).toBe(0);
  }, 60_000);
});
