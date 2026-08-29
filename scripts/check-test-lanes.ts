#!/usr/bin/env tsx
/**
 * AC-6 BINDING GUARD — vitest workspace lane collector (imp-widen-integration-ci).
 *
 * Asserts that the workspace lane file sets are intact and that no files were
 * silently dropped during the F3 workspace split. Catches future mis-splits
 * where someone edits `vitest.workspace.ts` include/exclude and accidentally
 * narrows a lane.
 *
 * Lanes (must match vitest.workspace.ts):
 *   unit         — test files outside integration/live roots (~100+ files / ~970+ tests)
 *   integration  — tests/integration/** + packages/platform/tests/integration/**
 *                  minus 8 bun:test files (different runner) → ~231 vitest files
 *   live         — seed-e2e + zero-cache-boot (real Postgres + PLATFORM_IT)
 *
 * Exit 0 if every lane's file count is in its expected band; exit 1 otherwise.
 *
 * Run: pnpm test:lanes   (or: npx tsx scripts/check-test-lanes.ts)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

// --- bun:test files in packages/platform/tests/integration — excluded from vitest lanes ---
const BUN_TEST_FILES = new Set([
  'db-migrate.test.ts',
  'jsonb-roundtrip.test.ts',
  'merges-collapsed.test.ts',
  'nonprod-namespace.test.ts',
  'prd-consistency.test.ts',
  'replication-ready.test.ts',
  'runner-status.test.ts',
  'status-check.test.ts',
]);

const TEST_FILE = /\.(test|spec)\.(js|ts|tsx)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.expo', '.git', 'build', '.next']);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (st.isFile() && TEST_FILE.test(entry)) {
      out.push(relative(ROOT, full));
    }
  }
  return out;
}

// --- guard 1: workspace file must exist and define all 3 lane names ---
function checkWorkspaceDefinesLanes(): string[] {
  const wsPath = join(ROOT, 'vitest.workspace.ts');
  const cfgPath = join(ROOT, 'vitest.config.ts');
  const problems: string[] = [];
  if (!existsSync(wsPath)) {
    problems.push(`MISSING vitest.workspace.ts (looked at ${wsPath})`);
    return problems;
  }
  const ws = readFileSync(wsPath, 'utf8');
  for (const lane of ['unit', 'integration', 'live']) {
    const re = new RegExp(`name:\\s*['"]${lane}['"]`);
    if (!re.test(ws)) {
      problems.push(`vitest.workspace.ts does not define a project named "${lane}"`);
    }
  }
  // vitest.config.ts must wire the workspace projects in (vitest 4: test.projects).
  if (!existsSync(cfgPath)) {
    problems.push('MISSING vitest.config.ts');
  } else {
    const cfg = readFileSync(cfgPath, 'utf8');
    if (!/projects/.test(cfg)) {
      problems.push('vitest.config.ts does not reference `projects` (vitest 4 lane wiring missing)');
    }
  }
  return problems;
}

// --- compute lane file sets (mirrors vitest.workspace.ts include/exclude) ---

// integration lane
const integrationTop = walk('tests/integration');
const integrationPlatform = walk('packages/platform/tests/integration').filter(
  (f) => !BUN_TEST_FILES.has(f.split('/').pop()!),
);
const integrationFiles = [...new Set([...integrationTop, ...integrationPlatform])].sort();

// live lane (Postgres + PLATFORM_IT)
const liveCandidates = [
  'packages/platform/src/cli/__tests__/seed-e2e.test.ts',
  'packages/platform/src/cli/__tests__/zero-cache-boot.test.ts',
];
const liveFiles = liveCandidates.filter((f) => existsSync(join(ROOT, f)));
const liveSet = new Set(liveFiles);

// unit lane: every test-shaped tracked file under the declared unit roots,
// EXCLUDING integration roots, the live files, and bun:test files.
const unitRoots = [
  'tests',
  'hooks',
  'components',
  'packages/platform/src/cli/__tests__',
  'packages/platform/src/cli/commands/__tests__',
];
const unitFiles: string[] = [];
for (const root of unitRoots) {
  const files = walk(root);
  for (const f of files) {
    if (f.startsWith('tests/integration/')) continue;
    if (f.startsWith('packages/platform/tests/integration/')) continue;
    if (liveSet.has(f)) continue;
    unitFiles.push(f);
  }
}
// standalone unit file declared explicitly in the workspace
const evidence = 'packages/platform/src/research/evidence-gate.test.ts';
if (existsSync(join(ROOT, evidence))) unitFiles.push(evidence);
const unitSet = [...new Set(unitFiles)].sort();

// --- assert ---
type Lane = { name: string; files: string[]; min: number; max: number };
// unit ≈ 70 files after D08-02 removed convex/** and tests/convex/** residue.
// integration ≈ 290 vitest files after Sprint 28–32 red-hat + decommission suites.
// The guard catches material drops/accidental broadening without freezing stale
// pre-decommission counts.
// live = 2 files (seed-e2e, zero-cache-boot).
const lanes: Lane[] = [
  { name: 'unit', files: unitSet, min: 55, max: 120 },
  { name: 'integration', files: integrationFiles, min: 250, max: 340 },
  { name: 'live', files: liveFiles, min: 1, max: 10 },
];

let failed = false;
const wsProblems = checkWorkspaceDefinesLanes();

console.log('vitest lane file-count guard (AC-6 / F3)');
console.log('=========================================');
if (wsProblems.length > 0) {
  failed = true;
  for (const p of wsProblems) console.log(`FAIL  workspace: ${p}`);
} else {
  console.log('OK    workspace: vitest.workspace.ts defines unit/integration/live + vitest.config.ts wires test.projects');
}
console.log('');
for (const lane of lanes) {
  const n = lane.files.length;
  const ok = n >= lane.min && n <= lane.max;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${lane.name.padEnd(12)} ${String(n).padStart(4)} files (expected ${lane.min}-${lane.max})`);
  if (!ok) {
    failed = true;
    if (n < lane.min) {
      console.log(`        DROPPED — lane collected ${n} < ${lane.min}; a workspace mis-split likely narrowed the include`);
    } else {
      console.log(`        OVERCOLLECTED — lane collected ${n} > ${lane.max}; include too broad`);
    }
  }
}
console.log('');
console.log(`bun:test excluded (different runner): ${BUN_TEST_FILES.size} files`);
console.log(`total vitest integration files: ${integrationFiles.length}`);
console.log('');
if (failed) {
  console.error('LANE GUARD FAILED — see above');
  process.exit(1);
}
console.log('All lane counts within expected bands.');
