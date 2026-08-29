/**
 * Build gate (T-PLAT-017): grep real repo surfaces for banned Convex env aliases.
 *
 * Scans: app/, holocron-mcp/, packages/platform/
 * Excludes: .git, node_modules, .spec, tests, and the temporary cutover adapter.
 * (matches RED suite independent rg so doctor/test literals do not false-positive)
 *
 * Pattern tokens are assembled at runtime so this source file does not itself
 * contain the banned substrings (which would fail the gate).
 */
import { spawnSync } from 'node:child_process';
import { resolveRepoRoot } from './secrets.ts';

/** Assemble banned tokens without embedding the full banned substrings in source. */
function bannedConvexEnvPatterns(): string[] {
  const cx = 'CONVEX';
  const holo = 'HOLOCRON';
  return [`${cx}_URL`, `${holo}_URL`, `EXPO_PUBLIC_${cx}_URL`, `${cx}_DEPLOY_KEY`];
}

export type ConvexAliasHit = {
  file: string;
  line: number;
  match: string;
  text: string;
};

export type VerifyNoConvexEnvReport = {
  ok: boolean;
  hitCount: number;
  hits: ConvexAliasHit[];
  scannedRoots: string[];
  message: string;
};

const RG_GLOBS = [
  '!**/.git/**',
  '!**/node_modules/**',
  '!**/.spec/**',
  '!**/__tests__/**',
  '!**/tests/**',
  // Sprint 29 must still address the frozen Convex control plane for
  // freeze/export/rollback. This bounded adapter is not a serving data-plane
  // dependency and is removed only after Sprint 30 rollback closure.
  '!packages/platform/src/cutover/**',
] as const;

const SCAN_ROOTS = ['app', 'holocron-mcp', 'packages/platform'] as const;

/**
 * Identify which banned token appears in a line (for reporting).
 */
function identifyToken(line: string, patterns: string[]): string {
  // Longest-first so EXPO_PUBLIC_…_URL wins over the shorter …_URL substring.
  const ordered = [...patterns].sort((a, b) => b.length - a.length);
  for (const token of ordered) {
    if (line.includes(token)) return token;
  }
  return 'ALIAS';
}

/**
 * Run real rg against the repo. Not mocked — fails if rg missing or hits found.
 */
export function verifyNoConvexEnv(options?: {
  repoRoot?: string;
  roots?: readonly string[];
}): VerifyNoConvexEnvReport {
  const repoRoot = options?.repoRoot ?? resolveRepoRoot();
  const roots = options?.roots ?? SCAN_ROOTS;
  const patterns = bannedConvexEnvPatterns();

  // --hidden: include dotfiles like app/.env
  // --no-ignore: do not skip gitignored .env (aliases there still fail the gate)
  // Explicit --glob excludes keep node_modules / .git / tests out.
  const args: string[] = ['-n', '--no-heading', '--color', 'never', '--hidden', '--no-ignore'];
  for (const g of RG_GLOBS) {
    args.push('--glob', g);
  }
  args.push('-e', patterns.join('|'));
  args.push(...roots);

  const result = spawnSync('rg', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    // rg exit 1 = no matches (clean); 0 = matches; 2 = error
  });

  if (result.error) {
    return {
      ok: false,
      hitCount: 0,
      hits: [],
      scannedRoots: [...roots],
      message: `rg failed to start: ${result.error.message}`,
    };
  }

  if (result.status === 2) {
    return {
      ok: false,
      hitCount: 0,
      hits: [],
      scannedRoots: [...roots],
      message: `rg error: ${result.stderr || result.stdout}`,
    };
  }

  const hits: ConvexAliasHit[] = [];
  if (result.status === 0) {
    const stdout = result.stdout ?? '';
    for (const raw of stdout.split('\n')) {
      const line = raw.trimEnd();
      if (!line) continue;
      // format: path:lineno:content
      const m = line.match(/^([^:]+):(\d+):(.*)$/);
      if (!m) {
        hits.push({ file: line, line: 0, match: identifyToken(line, patterns), text: line });
        continue;
      }
      const file = m[1];
      const lineNumber = m[2];
      const text = m[3];
      if (!file || !lineNumber || text === undefined) {
        hits.push({ file: line, line: 0, match: identifyToken(line, patterns), text: line });
        continue;
      }
      hits.push({
        file,
        line: Number(lineNumber),
        match: identifyToken(text, patterns),
        text,
      });
    }
  }

  const hitCount = hits.length;
  // status 1 with 0 hits = clean; status 0 with hits = dirty
  const clean = hitCount === 0 && result.status === 1;

  if (clean) {
    return {
      ok: true,
      hitCount: 0,
      hits: [],
      scannedRoots: [...roots],
      message: 'zero Convex env aliases found (clean)',
    };
  }

  if (hitCount === 0) {
    // Unexpected status
    return {
      ok: false,
      hitCount: 0,
      hits: [],
      scannedRoots: [...roots],
      message: `unexpected rg status ${result.status}: ${result.stderr || result.stdout}`,
    };
  }

  const noun = hitCount === 1 ? 'alias' : 'aliases';
  return {
    ok: false,
    hitCount,
    hits,
    scannedRoots: [...roots],
    message: `Found ${hitCount} Convex env ${noun}`,
  };
}

export function formatVerifyNoConvexEnvText(report: VerifyNoConvexEnvReport): string {
  const lines: string[] = [];
  lines.push('holo verify-no-convex-env — T-PLAT-017 build gate');
  lines.push(`  scanned: ${report.scannedRoots.join(', ')}`);
  lines.push(`  ${report.message}`);
  if (report.hits.length > 0) {
    lines.push('');
    for (const h of report.hits) {
      // AC-3 dirty: print `path: TOKEN` (e.g. app/.env: EXPO_PUBLIC_…_URL)
      lines.push(`${h.file}: ${h.match}`);
      if (h.line > 0) {
        lines.push(`  L${h.line}: ${h.text.trim()}`);
      }
    }
  }
  lines.push(report.ok ? '  status: OK' : '  status: FAIL');
  return lines.join('\n');
}

/** Exported for tests that need the runtime pattern list (assembled, not literals). */
export function getBannedConvexEnvPatterns(): string[] {
  return bannedConvexEnvPatterns();
}
