/**
 * holo verify:no-provider-refs — audit platform source for banned direct provider factories.
 *
 * Banned at call sites (actual factories / imports — not prose mentions):
 *   claudeFlash / claudePro / claudeUltra  (legacy Convex provider factories)
 *
 * Scans services/platform/src only (migration target). Convex tree is out of scope.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { platformPackageRoot } from '../fleet/manifest';

/** Factory identifiers that must not appear as imports or call expressions. */
export const BANNED_FACTORY_IDS = ['claudeFlash', 'claudePro', 'claudeUltra'] as const;

export type ProviderRefHit = {
  factory: string;
  file: string;
  line: number;
  snippet: string;
};

export type NoProviderRefsReport = {
  ok: boolean;
  directProviderCount: number;
  bannedFactories: string[];
  hits: ProviderRefHit[];
  scannedFiles: number;
  scanRoot: string;
};

function listTsFiles(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const full = join(dir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      listTsFiles(full, acc);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name) && !name.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

/** Strip // and /* *\/ comments so prose bans do not false-positive. */
function stripComments(source: string): string {
  // Block comments
  let s = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  // Line comments
  s = s.replace(/(^|[^:])\/\/.*$/gm, '$1');
  return s;
}

/**
 * Detect real factory usage:
 * - call: claudeFlash(
 * - import: import { claudeFlash } / import { claudeFlash as x }
 * - export re-export of the factory name
 * - const x = claudeFlash
 *
 * Does NOT match help-text strings that merely name the ban.
 */
function findFactoryUsages(
  code: string,
  factory: string
): Array<{ line: number; snippet: string }> {
  const hits: Array<{ line: number; snippet: string }> = [];
  const lines = code.split(/\r?\n/);
  // Call or import/export binding — not a string mention in help text
  const callRe = new RegExp(`\\b${factory}\\s*\\(`);
  const importRe = new RegExp(
    `(?:import|export)\\s*\\{[^}]*\\b${factory}\\b[^}]*\\}|\\bimport\\s+${factory}\\b`
  );
  const bindingRe = new RegExp(`\\b(?:const|let|var|function)\\s+${factory}\\b|\\b${factory}\\s*=`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Skip pure string/template prose lines (help text) — no call/import/binding
    if (!callRe.test(line) && !importRe.test(line) && !bindingRe.test(line)) {
      continue;
    }
    // If the only match is inside a string literal of help text, skip when
    // there is no unquoted identifier use. Cheap check: strip strings.
    const stripped = line
      .replace(/'([^'\\]|\\.)*'/g, "''")
      .replace(/"([^"\\]|\\.)*"/g, '""')
      .replace(/`([^`\\]|\\.)*`/g, '``');
    if (!callRe.test(stripped) && !importRe.test(stripped) && !bindingRe.test(stripped)) {
      continue;
    }
    hits.push({ line: i + 1, snippet: line.trim().slice(0, 200) });
  }
  return hits;
}

/**
 * Scan platform src for banned claudeFlash/Pro/Ultra factory references.
 */
export function verifyNoProviderRefs(options?: { scanRoot?: string }): NoProviderRefsReport {
  const scanRoot = options?.scanRoot ?? join(platformPackageRoot(), 'src');
  const files = listTsFiles(scanRoot);
  const hits: ProviderRefHit[] = [];
  const banned = new Set<string>();

  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const code = stripComments(text);
    const relFile = relative(platformPackageRoot(), file) || file;

    for (const factory of BANNED_FACTORY_IDS) {
      for (const h of findFactoryUsages(code, factory)) {
        banned.add(factory);
        hits.push({
          factory,
          file: relFile,
          line: h.line,
          snippet: h.snippet,
        });
      }
    }
  }

  return {
    ok: hits.length === 0,
    directProviderCount: hits.length,
    bannedFactories: [...banned].sort(),
    hits,
    scannedFiles: files.length,
    scanRoot,
  };
}

export function formatNoProviderRefsText(report: NoProviderRefsReport): string {
  const lines: string[] = [
    'holo verify:no-provider-refs — banned claudeFlash/claudePro/claudeUltra factories',
    `  scanRoot:            ${report.scanRoot}`,
    `  scannedFiles:        ${report.scannedFiles}`,
    `  direct-provider:     ${report.directProviderCount}`,
    `  bannedFactories:     ${report.bannedFactories.join(', ') || '(none)'}`,
  ];
  for (const h of report.hits.slice(0, 50)) {
    lines.push(`  HIT ${h.factory} ${h.file}:${h.line}  ${h.snippet}`);
  }
  lines.push(report.ok ? '  status: OK' : '  status: FAIL');
  return lines.join('\n');
}
