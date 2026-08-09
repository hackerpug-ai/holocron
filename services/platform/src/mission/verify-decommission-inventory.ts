/**
 * holo verify:decommission-inventory — S31-CX-05
 *
 * Machine-checkable proof that no in-scope capability lives only in Convex.
 * Walks the whole convex/ tree (supersedes the 11-file verify:no-shells set),
 * classifies every file, and fail-closes on sole-implementation / unclassified.
 *
 * Also inventories RN typecheck blockers: type-only imports of Doc/Id from
 * convex/_generated/dataModel under app|components|hooks|screens.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { MIGRATED_TO_MISSION_ENGINE } from './verify-no-shells.ts';

/** Files known (R20) to be the sole implementation of an in-scope capability. */
export const SOLE_IMPLEMENTATION_FILES = [
  'convex/chat/specialists.ts',
  'convex/taskCrons.ts',
] as const;

/** RN roots scanned for typecheck blockers (type-only dataModel imports). */
export const TYPECHECK_BLOCKER_ROOTS = ['app', 'components', 'hooks', 'screens'] as const;

/**
 * File-level decommission dispositions.
 * - sole-implementation / unclassified → block Sprint 32 deletion
 * - migrated-stub / runtime-fenced / infrastructure / archive / drop → classified OK-to-delete forms
 */
export const FILE_CLASSIFICATIONS = [
  'sole-implementation',
  'migrated-stub',
  'runtime-fenced',
  'infrastructure',
  'archive',
  'drop',
  'unclassified',
] as const;

export type FileClassification = (typeof FILE_CLASSIFICATIONS)[number];

export type InventoryFileVerdict = {
  path: string;
  classification: FileClassification;
  reason: string;
};

export type TypecheckBlocker = {
  file: string;
  imported_symbol: 'Doc' | 'Id';
  line: number;
  text: string;
};

export type DecommissionInventoryReport = {
  ok: boolean;
  walked_file_count: number;
  research_file_count: number;
  unclassified_count: number;
  sole_implementation_count: number;
  classification_counts: Record<FileClassification, number>;
  files: InventoryFileVerdict[];
  refusal_list: string[];
  typecheck_blockers: TypecheckBlocker[];
  typecheck_blocker_count: number;
  message: string;
  scanned_root: string;
};

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Recursive walk of all files under dir; deterministic lexicographic order. */
export function walkFiles(absDir: string, acc: string[] = []): string[] {
  if (!isDirectory(absDir)) return acc;
  let entries: string[];
  try {
    entries = readdirSync(absDir).sort((a, b) => a.localeCompare(b));
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git') continue;
    const full = join(absDir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkFiles(full, acc);
    } else if (st.isFile()) {
      acc.push(full);
    }
  }
  return acc;
}

function toPosixRel(repoRoot: string, absPath: string): string {
  return relative(repoRoot, absPath).split(sep).join('/');
}

function readText(absPath: string): string {
  try {
    return readFileSync(absPath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Classify one convex/ file. Order is intentional — sole-implementation wins
 * over content heuristics so taskCrons (which uses fenced builders) is never
 * mislabeled as runtime-fenced or migrated-stub without the marker.
 */
export function classifyConvexFile(
  relPath: string,
  body: string
): { classification: FileClassification; reason: string } {
  if ((SOLE_IMPLEMENTATION_FILES as readonly string[]).includes(relPath)) {
    return {
      classification: 'sole-implementation',
      reason: 'R20 sole-implementation capability — no resolving non-Convex replacement registered',
    };
  }

  // Archive residual backup copies retained under convex/
  if (/\.bak\d*$/i.test(relPath) || relPath.endsWith('.bak')) {
    return {
      classification: 'archive',
      reason: 'backup residual (.bak); deleted with convex/ tree',
    };
  }

  // Generated / scaffold infrastructure
  if (
    relPath.startsWith('convex/_generated/') ||
    relPath === 'convex/tsconfig.json' ||
    relPath === 'convex/README.md' ||
    relPath === 'convex/convex.config.ts'
  ) {
    return {
      classification: 'infrastructure',
      reason: 'generated or scaffold infrastructure; deleted with convex/ tree',
    };
  }

  if (body.includes(MIGRATED_TO_MISSION_ENGINE)) {
    return {
      classification: 'migrated-stub',
      reason: `contains ${MIGRATED_TO_MISSION_ENGINE} deprecation marker`,
    };
  }

  // Runtime fence usage (fencedAction / fencedInternalAction / migrationFence import)
  if (
    /from\s+['"][^'"]*migrationFence['"]/.test(body) ||
    /\bfenced(?:Internal)?(?:Action|Mutation)\b/.test(body) ||
    /\bisMigrationReadOnly\b/.test(body) ||
    /\bisCutoverSchedulesDisabled\b/.test(body)
  ) {
    return {
      classification: 'runtime-fenced',
      reason: 'imports or uses migrationFence / fenced builders',
    };
  }

  // Pure schema / values / table definitions — catalog owns disposition of data,
  // the module itself is drop-with-convex.
  if (
    relPath === 'convex/schema.ts' ||
    relPath.endsWith('/schema.ts') ||
    relPath === 'convex/tables.ts'
  ) {
    return {
      classification: 'drop',
      reason: 'schema/table definition; data dispositions live in source catalog',
    };
  }

  // No resolving classification — fail closed
  return {
    classification: 'unclassified',
    reason: 'no disposition rule resolved a replacement or drop rationale',
  };
}

/**
 * Scan app|components|hooks|screens for type imports of Doc/Id from
 * convex/_generated/dataModel (typecheck blockers for Sprint 32 deletion).
 */
export function scanTypecheckBlockers(repoRoot: string): TypecheckBlocker[] {
  const blockers: TypecheckBlocker[] = [];
  const importRe =
    /import\s+type\s*\{([^}]+)\}\s*from\s*['"](?:@\/)?convex\/_generated\/dataModel['"]/;
  const importRe2 = /import\s*\{([^}]+)\}\s*from\s*['"](?:@\/)?convex\/_generated\/dataModel['"]/;

  for (const root of TYPECHECK_BLOCKER_ROOTS) {
    const absRoot = join(repoRoot, root);
    if (!isDirectory(absRoot)) continue;
    const files = walkFiles(absRoot).filter((f) => /\.(ts|tsx)$/.test(f));
    for (const abs of files) {
      const rel = toPosixRel(repoRoot, abs);
      // Skip tests
      if (/\.(test|spec)\.(ts|tsx)$/.test(rel) || rel.includes('/__tests__/')) continue;
      const body = readText(abs);
      const lines = body.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const m = line.match(importRe) ?? line.match(importRe2);
        if (!m) continue;
        const names = m[1] ?? '';
        for (const raw of names.split(',')) {
          const token = raw
            .trim()
            .split(/\s+as\s+/)[0]
            ?.trim();
          if (token === 'Doc' || token === 'Id') {
            blockers.push({
              file: rel,
              imported_symbol: token,
              line: i + 1,
              text: line.trim().slice(0, 200),
            });
          }
        }
      }
    }
  }

  // Stable order
  blockers.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.line !== b.line) return a.line - b.line;
    return a.imported_symbol.localeCompare(b.imported_symbol);
  });
  return blockers;
}

export function buildDecommissionInventory(repoRoot: string): DecommissionInventoryReport {
  const convexRoot = join(repoRoot, 'convex');
  const emptyCounts = (): Record<FileClassification, number> => ({
    'sole-implementation': 0,
    'migrated-stub': 0,
    'runtime-fenced': 0,
    infrastructure: 0,
    archive: 0,
    drop: 0,
    unclassified: 0,
  });

  if (!isDirectory(convexRoot)) {
    return {
      ok: false,
      walked_file_count: 0,
      research_file_count: 0,
      unclassified_count: 0,
      sole_implementation_count: 0,
      classification_counts: emptyCounts(),
      files: [],
      refusal_list: ['convex/ directory missing'],
      typecheck_blockers: [],
      typecheck_blocker_count: 0,
      message: 'convex/ directory missing — inventory walked 0 files',
      scanned_root: 'convex',
    };
  }

  const absFiles = walkFiles(convexRoot);
  const files: InventoryFileVerdict[] = [];
  const classification_counts = emptyCounts();

  for (const abs of absFiles) {
    const rel = toPosixRel(repoRoot, abs);
    const body = isFile(abs) ? readText(abs) : '';
    const { classification, reason } = classifyConvexFile(rel, body);
    classification_counts[classification] += 1;
    files.push({ path: rel, classification, reason });
  }

  // Deterministic order by path
  files.sort((a, b) => a.path.localeCompare(b.path));

  const research_file_count = files.filter((f) => f.path.startsWith('convex/research/')).length;
  const unclassified_count = classification_counts.unclassified;
  const sole_implementation_count = classification_counts['sole-implementation'];

  const refusal_list = files
    .filter(
      (f) => f.classification === 'sole-implementation' || f.classification === 'unclassified'
    )
    .map((f) => f.path);

  const typecheck_blockers = scanTypecheckBlockers(repoRoot);
  const typecheck_blocker_count = typecheck_blockers.length;

  // ok only when nothing sole-impl / unclassified remains (Sprint 32 green condition)
  const ok = sole_implementation_count === 0 && unclassified_count === 0;

  const parts: string[] = [
    `walked ${files.length} files under convex/`,
    `research=${research_file_count}`,
    `sole-implementation=${sole_implementation_count}`,
    `unclassified=${unclassified_count}`,
    `typecheck_blockers=${typecheck_blocker_count}`,
  ];
  if (!ok) {
    parts.push(`refusal=${refusal_list.length}`);
  }

  return {
    ok,
    walked_file_count: files.length,
    research_file_count,
    unclassified_count,
    sole_implementation_count,
    classification_counts,
    files,
    refusal_list,
    typecheck_blockers,
    typecheck_blocker_count,
    message: parts.join('; '),
    scanned_root: 'convex',
  };
}

export function formatDecommissionInventoryText(report: DecommissionInventoryReport): string {
  const lines: string[] = [
    `holo verify:decommission-inventory — ${report.message}`,
    `  ok:                         ${report.ok}`,
    `  walked_file_count:          ${report.walked_file_count}`,
    `  research_file_count:        ${report.research_file_count}`,
    `  sole_implementation_count:  ${report.sole_implementation_count}`,
    `  unclassified_count:         ${report.unclassified_count}`,
    `  typecheck_blocker_count:    ${report.typecheck_blocker_count}`,
  ];

  if (report.refusal_list.length > 0) {
    lines.push('  refusal_list:');
    for (const p of report.refusal_list) {
      const verdict = report.files.find((f) => f.path === p);
      const cls = verdict?.classification ?? 'unknown';
      lines.push(`    - ${p}  [${cls}]`);
    }
  }

  if (report.typecheck_blockers.length > 0) {
    lines.push('  typecheck_blockers:');
    for (const b of report.typecheck_blockers) {
      lines.push(`    - ${b.file}:${b.line}  imported_symbol=${b.imported_symbol}`);
    }
  }

  // Highlight sole-implementation explicitly for operator readability
  const sole = report.files.filter((f) => f.classification === 'sole-implementation');
  if (sole.length > 0) {
    lines.push('  sole-implementation:');
    for (const f of sole) {
      lines.push(`    - ${f.path}  (${f.reason})`);
    }
  }

  lines.push(`  status: ${report.ok ? 'OK' : 'REFUSED'}`);
  return lines.join('\n');
}
