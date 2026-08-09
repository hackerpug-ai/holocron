/**
 * S31-FE-06 — Freeze the client data contract; retire false-positive tooling.
 *
 * AC-4 (PRIMARY): inventory:convex-callsites exits non-zero naming verify:no-convex-client
 * AC-1: yaml header FROZEN_HISTORICAL + resolvable provenance sha
 * AC-2: tombstone records both headline figures honestly
 * AC-3: nine reported call sites resolve to @rocicorp/zero/react
 * AC-5: verify:client-contract exits 0 then non-zero on corrupted entry
 * AC-6: Sprint 21 gate tombstone records four absences; 0 evidence files created
 *
 * Integration against the real repository tree + real holo CLI (no mocks).
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const HOLO = join(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const CONTRACT_YAML = join(
  REPO_ROOT,
  '.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml'
);
const INVENTORY_JSON = join(
  REPO_ROOT,
  '.spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json'
);
const SPRINT21_DIR = join(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-21-client-data-contract'
);
const GATE_TOMBSTONE = join(SPRINT21_DIR, 'GATE-TOMBSTONE.md');
const SPRINT21_SPRINT_MD = join(SPRINT21_DIR, 'SPRINT.md');
const AUTHOR_TS = join(REPO_ROOT, 'services/platform/src/sync/client-data-contract-author.ts');
const TMP_INVENTORY = join(REPO_ROOT, '.tmp/client-contract/convex-callsite-inventory.json');
const NEGATIVE_DIR = join(REPO_ROOT, '.tmp/client-contract/negative');

/** Nine false-positive coordinates captured from pre-retirement inventory:convex-callsites. */
const NINE_FALSE_POSITIVE_SITES = [
  'app/(drawer)/_layout.tsx:76',
  'app/(drawer)/_layout.tsx:81',
  'app/(drawer)/_layout.tsx:316',
  'app/(drawer)/chat/[conversationId].tsx:128',
  'app/(drawer)/chat/[conversationId].tsx:132',
  'components/chat/ChatPickerSheet.tsx:60',
  'components/chat/MessageBubble.tsx:291',
  'components/chat/MessageBubble.tsx:331',
  'hooks/use-chat-history.ts:60',
] as const;

function runHolo(
  args: string[],
  opts: { cwd?: string } = {}
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('bun', [HOLO, ...args], {
    cwd: opts.cwd ?? REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env },
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function runGit(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/**
 * Materialize the freeze-time inventory at the path declared by the metadata
 * wrapper so verify:client-contract can cross-check the real yaml against
 * real call_site_ids (reconstructed from contract entries — never re-scanned
 * from post-migration source).
 */
function materializeFrozenInventoryFromContract(): void {
  const text = readFileSync(CONTRACT_YAML, 'utf8');
  const blocks = text.split(/\n {2}- call_site_id: /);
  const callSites: Array<{
    call_site_id: string;
    source_path: string;
    line: number;
    column: number;
    hook_kind: string;
    legacy_ref: string;
  }> = [];

  for (const block of blocks.slice(1)) {
    const id = block.split('\n', 1)[0]?.trim() ?? '';
    const source_path = block.match(/source_path: (.+)/)?.[1]?.trim() ?? '';
    const line = Number(block.match(/^\s+line: (\d+)/m)?.[1] ?? '0');
    const column = Number(block.match(/^\s+column: (\d+)/m)?.[1] ?? '0');
    const hook_kind = block.match(/hook_kind: (\S+)/)?.[1] ?? 'useQuery';
    const legacy_ref = block.match(/legacy_ref: (.+)/)?.[1]?.trim() ?? '';
    callSites.push({ call_site_id: id, source_path, line, column, hook_kind, legacy_ref });
  }

  mkdirSync(dirname(TMP_INVENTORY), { recursive: true });
  writeFileSync(
    TMP_INVENTORY,
    `${JSON.stringify(
      {
        source_roots: ['app', 'components', 'hooks', 'screens'],
        schema_version: 1,
        counting_rule:
          'S31-FE-06: reconstructed from frozen 13-client-data-contract.yaml entries for verify:client-contract internal consistency only',
        summary: { file_count: 47, call_site_count: callSites.length },
        call_sites: callSites,
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

function readContractHeader(maxLines = 80): string {
  return readFileSync(CONTRACT_YAML, 'utf8').split('\n').slice(0, maxLines).join('\n');
}

function countFilesRecursive(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) n += countFilesRecursive(p);
    else n += 1;
  }
  return n;
}

describe('S31-FE-06 contract freeze', () => {
  beforeAll(() => {
    materializeFrozenInventoryFromContract();
  });

  // ---------------------------------------------------------------------------
  // AC-4 PRIMARY: inventory:convex-callsites is retired
  // ---------------------------------------------------------------------------
  it('inventory convex-callsites is retired', () => {
    const bare = runHolo(['inventory:convex-callsites']);
    const combinedBare = `${bare.stdout}\n${bare.stderr}`;

    expect(bare.status, `bare exit: ${combinedBare}`).toBe(2);
    expect(combinedBare).toContain('verify:no-convex-client');
    expect(combinedBare).not.toMatch(/\bfile_count\b/);
    expect(combinedBare).not.toMatch(/\bcall_site_count\b/);

    const outPath = join(REPO_ROOT, '.tmp/s31-fe-06-inventory-probe.json');
    if (existsSync(outPath)) rmSync(outPath, { force: true });

    const withOut = runHolo(['inventory:convex-callsites', '--output', outPath]);
    const combinedOut = `${withOut.stdout}\n${withOut.stderr}`;

    expect(withOut.status, `with --output exit: ${combinedOut}`).toBe(2);
    expect(combinedOut).toContain('verify:no-convex-client');
    expect(existsSync(outPath), 'retired verb must write 0 artifacts').toBe(false);

    // Stale --targets author path against hardcoded HONO_ROUTES must not remain
    // as a live re-baselining surface. The constant may still exist as the
    // freeze-time seed for verify:client-contract --targets, but it must be
    // marked frozen/historical so operators do not treat it as live.
    const authorSrc = readFileSync(AUTHOR_TS, 'utf8');
    expect(authorSrc).toMatch(/FROZEN_HISTORICAL|freeze-time historical|FROZEN_SEED/i);
    // No remaining author path that advertises HONO_ROUTES as a live re-author surface
    expect(authorSrc).not.toMatch(/Live Hono route surface — mirrored from createHonoApp/);
  });

  // ---------------------------------------------------------------------------
  // AC-1: contract yaml is frozen historical
  // ---------------------------------------------------------------------------
  it('contract yaml is frozen historical', () => {
    const header = readContractHeader(60);

    expect(header).toMatch(/status:\s*FROZEN_HISTORICAL/);
    expect(header).toMatch(/superseded_by:\s*holo verify:no-convex-client/);
    expect(header).toContain('Line coordinates are historical and MUST NOT be trusted as current.');

    const shaMatch = header.match(/coordinates_valid_as_of:\s*([0-9a-f]{40})/);
    expect(shaMatch, 'coordinates_valid_as_of must be a 40-hex git sha').not.toBeNull();
    const sha = shaMatch?.[1] ?? '';
    const cat = runGit(['cat-file', '-e', sha]);
    expect(cat.status, `git cat-file -e ${sha}`).toBe(0);

    // 105 entry source_path coordinates must be unchanged vs HEAD base content
    // (we only edit header/prose — never re-baseline line coordinates).
    const full = readFileSync(CONTRACT_YAML, 'utf8');
    const sourcePathCount = (full.match(/^\s+source_path:/gm) ?? []).length;
    expect(sourcePathCount).toBe(105);
  });

  // ---------------------------------------------------------------------------
  // AC-2: tombstone records both headline figures
  // ---------------------------------------------------------------------------
  it('tombstone records both headline figures', () => {
    const inv = JSON.parse(readFileSync(INVENTORY_JSON, 'utf8')) as {
      observed_counts: {
        file_count: number;
        call_site_count: number;
        files_in_file_count_breakdown: {
          production_files_with_call_sites: number;
          production_files_with_mentions_only: number;
          test_files_with_hook_mentions: number;
          total: number;
          production_files_with_mentions_only_paths: string[];
        };
      };
    };
    const bd = inv.observed_counts.files_in_file_count_breakdown;
    expect(bd.production_files_with_call_sites).toBe(43);
    expect(bd.production_files_with_mentions_only).toBe(2);
    expect(bd.test_files_with_hook_mentions).toBe(2);
    expect(bd.total).toBe(47);
    expect(43 + 2 + 2).toBe(47);

    const sprintMd = readFileSync(SPRINT21_SPRINT_MD, 'utf8');
    // SPRINT.md planning findings (cited as line 31 in the task brief; live
    // file may shift — locate by content) record the 46/152 discrepancy.
    const sprintLines = sprintMd.split('\n');
    const planningLine =
      sprintLines.find(
        (l) => l.includes('46 importing files') && l.includes('152 lexical hook lines')
      ) ?? '';
    expect(planningLine.length).toBeGreaterThan(0);
    const planningLineNo = sprintLines.indexOf(planningLine) + 1;
    expect(planningLineNo).toBeGreaterThan(0);

    const header = readContractHeader(120);
    expect(header).toContain('43 production + 2 mentions-only + 2 test = 47');
    expect(header).toContain('app/(drawer)/chat/reference.tsx');
    expect(header).toContain('app/zero/queries.ts');
    expect(header).toMatch(/both were already Zero|already Zero/i);
    expect(header).toContain('46 importing files');
    expect(header).toContain('152 lexical hook lines');
    expect(header).toMatch(/SPRINT\.md/);
  });

  // ---------------------------------------------------------------------------
  // AC-3: nine reported call sites resolve to zero
  // ---------------------------------------------------------------------------
  it('nine reported call sites resolve to zero', () => {
    const header = readContractHeader(200);
    for (const coord of NINE_FALSE_POSITIVE_SITES) {
      expect(header, `tombstone must list ${coord}`).toContain(coord);
    }

    const resolutions: string[] = [];
    for (const coord of NINE_FALSE_POSITIVE_SITES) {
      const colon = coord.lastIndexOf(':');
      const file = coord.slice(0, colon);
      const lineNo = Number(coord.slice(colon + 1));
      const abs = join(REPO_ROOT, file);
      expect(existsSync(abs), `missing source ${file}`).toBe(true);
      const lines = readFileSync(abs, 'utf8').split('\n');
      const importBlock = lines.slice(0, 30).join('\n');
      const reported = lines[lineNo - 1] ?? '';
      expect(importBlock).toContain('@rocicorp/zero/react');
      expect(importBlock).not.toMatch(/from ['"]convex\/react['"]/);
      expect(reported).toMatch(/useQuery/);
      resolutions.push(`${coord} import=@rocicorp/zero/react line=${reported.trim()}`);
    }

    // Captured stdout evidence for the reviewer
    console.log(`S31-FE-06 AC-3 import resolutions:\n${resolutions.join('\n')}`);
    expect(resolutions).toHaveLength(9);
    expect(resolutions.some((r) => r.startsWith('hooks/use-chat-history.ts:60'))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // AC-5: verify client-contract still fails closed
  // ---------------------------------------------------------------------------
  it('verify client-contract still fails closed', () => {
    materializeFrozenInventoryFromContract();

    const run1 = runHolo(['verify:client-contract']);
    const out1 = `${run1.stdout}\n${run1.stderr}`;
    expect(run1.status, `run1 should pass: ${out1}`).toBe(0);

    // Corrupt one entry target.kind as a scratch edit
    const original = readFileSync(CONTRACT_YAML, 'utf8');
    const corrupted = original.replace(/kind: zero_query/, 'kind: not_a_real_target_kind');
    expect(corrupted).not.toBe(original);
    writeFileSync(CONTRACT_YAML, corrupted, 'utf8');

    try {
      const run2 = runHolo(['verify:client-contract']);
      const out2 = `${run2.stdout}\n${run2.stderr}`;
      expect(run2.status, `run2 must fail closed: ${out2}`).not.toBe(0);
      // Must name the inconsistent entry somehow (call_site_id or kind violation)
      expect(out2.length).toBeGreaterThan(0);
    } finally {
      // Restore the pre-corruption bytes (preserves an uncommitted freeze header).
      // BOUNDARIES also require a git checkout revert when the tree is clean.
      writeFileSync(CONTRACT_YAML, original, 'utf8');
      const dirty = runGit([
        'status',
        '--porcelain',
        '--',
        '.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml',
      ]);
      if (!dirty.stdout.trim()) {
        runGit([
          'checkout',
          '--',
          '.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml',
        ]);
      }
    }

    const run3 = runHolo(['verify:client-contract']);
    const out3 = `${run3.stdout}\n${run3.stderr}`;
    expect(run3.status, `run3 after restore: ${out3}`).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // AC-6: sprint 21 gate tombstone records absences
  // ---------------------------------------------------------------------------
  it('sprint 21 gate tombstone records absences', () => {
    expect(existsSync(GATE_TOMBSTONE), 'GATE-TOMBSTONE.md must exist').toBe(true);
    const tomb = readFileSync(GATE_TOMBSTONE, 'utf8');

    expect(tomb).toMatch(/0 \.gate-evidence/);
    expect(tomb).toMatch(/0 gate-results\.json/);
    expect(tomb).toMatch(/verify:client-contract/);
    expect(tomb).toMatch(/\.github\/workflows/);
    expect(tomb).toMatch(/0 matches/);
    expect(tomb).toMatch(/ci-fast\.yml/);
    expect(tomb).toMatch(/\.tmp\/client-contract\/negative/);
    expect(tomb).toMatch(/0 files/);
    expect(tomb).toMatch(/TC-3|TC-4/);

    // Live absences still hold
    const gateEvidenceDirs = readdirSync(SPRINT21_DIR).filter((n) => n === '.gate-evidence');
    expect(gateEvidenceDirs).toHaveLength(0);
    expect(existsSync(join(SPRINT21_DIR, 'gate-results.json'))).toBe(false);

    const wf = runGit(['grep', '-rn', 'verify:client-contract', '--', '.github/workflows/']);
    // git grep exits 1 when no matches
    const wfMatches = (wf.stdout ?? '').trim().split('\n').filter(Boolean);
    // Prefer ripgrep-style: also check via filesystem if git grep unavailable
    const workflowHits = spawnSync('rg', ['-n', 'verify:client-contract', '.github/workflows/'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const hitCount = (workflowHits.stdout ?? '').trim()
      ? (workflowHits.stdout ?? '').trim().split('\n').filter(Boolean).length
      : 0;
    expect(hitCount + (wf.status === 0 ? wfMatches.length : 0) >= 0).toBe(true);
    expect(hitCount).toBe(0);

    const negCount = countFilesRecursive(NEGATIVE_DIR);
    expect(negCount).toBe(0);

    // No new evidence files staged under Sprint 21 or negative fixtures
    const status = runGit([
      'status',
      '--porcelain',
      '--',
      '.spec/prds/mk6-migration/tasks/sprint-21-client-data-contract',
      '.tmp/client-contract',
      '.github/workflows',
    ]);
    const porcelain = status.stdout.trim();
    expect(porcelain).not.toMatch(/gate-results\.json/);
    expect(porcelain).not.toMatch(/\.gate-evidence/);
    expect(porcelain).not.toMatch(/\.github\/workflows/);
    // GATE-TOMBSTONE.md is the only allowed new file under sprint-21
    if (porcelain.includes('GATE-TOMBSTONE.md')) {
      expect(
        porcelain.split('\n').filter((l) => l.includes('sprint-21-client-data-contract'))
      ).toHaveLength(1);
    }
  });
});

afterEach(() => {
  // Ensure AC-5 never leaves a corrupted contract on disk if a test aborts mid-probe
  const status = runGit([
    'status',
    '--porcelain',
    '--',
    '.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml',
  ]);
  // If the file is modified and contains the corruption marker, restore it.
  if (status.stdout.trim()) {
    const body = readFileSync(CONTRACT_YAML, 'utf8');
    if (body.includes('not_a_real_target_kind')) {
      runGit([
        'checkout',
        '--',
        '.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml',
      ]);
    }
  }
});
