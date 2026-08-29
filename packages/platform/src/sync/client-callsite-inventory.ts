/**
 * S-CONTRACT-01 — Legacy Convex call-site inventory scanner.
 *
 * Scans the approved RN source roots (app/, components/, hooks/, screens/) for
 * legacy Convex consumer call sites: useQuery, useMutation, useAction,
 * ConvexProvider JSX mounts, and ConvexReactClient constructor calls.
 *
 * Counting rule (documented in 13-client-callsite-inventory.json):
 *
 *   FILE COUNT (file_count):
 *     A file is counted when its source contains a lexical mention of any
 *     legacy Convex consumer name: useQuery, useMutation, useAction,
 *     useConvex, ConvexProvider, or ConvexReactClient. The mention may appear
 *     in an import statement, a comment, a type annotation, or a real call —
 *     all of these signal "this file participates in the legacy Convex surface"
 *     and must be considered by the rewrite. This intentionally INCLUDES test
 *     files (they import/mock the legacy hooks and must be migrated alongside
 *     production code) and intentionally EXCLUDES Storybook stories (which are
 *     component-isolated visual tests and do not consume the production data
 *     plane).
 *
 *   CALL SITES (call_site_count and call_sites[]):
 *     A call site is a real invocation or JSX mount of a legacy Convex
 *     consumer that drives the production data plane. Exactly ONE record is
 *     emitted per occurrence of:
 *       - useQuery(           — React hook invocation (not import, not comment)
 *       - useMutation(        — React hook invocation
 *       - useAction(          — React hook invocation
 *       - JSX ConvexProvider  — JSX mount of the ConvexReactClient provider
 *       - new ConvexReactClient — constructor of the legacy network client
 *
 *     useConvex() is intentionally excluded from the call-site count because
 *     the S-CONTRACT-01 PRD section 07-ui-infrastructure.md defines the 105
 *     call-site contract as useQuery (~48) + useMutation/useAction (~57). The
 *     useConvex client handle in hooks/use-voice-session.ts is still captured
 *     indirectly: the file appears in file_count, and its other call sites
 *     (useAction, useMutation) are counted. The useConvex handle itself is a
 *     network client accessor that S-CONTRACT-02 will map to the Zero mutator
 *     surface (the migration mapping layer consumes the file inventory, not
 *     just the call-site records).
 *
 *     Import statements (e.g., `import { useQuery } from 'convex/react'`) do
 *     NOT emit call-site records — they have no `(` directly after the
 *     identifier. Line comments (slash-slash) and block comments
 *     (slash-star star-slash) are stripped before scanning so hook names
 *     mentioned in prose do not produce records. Type/interface/declare
 *     statements are skipped to avoid emitting records for type-level
 *     references.
 *
 * Exclusions (per AC-4):
 *   - node_modules/
 *   - convex/_generated/
 *   - .git/
 *   - .spec/
 *   - .tmp/
 *   - *.stories.ts, *.stories.tsx (Storybook visual tests; not data-plane consumers)
 *
 *   Test files (*.test.ts, *.test.tsx) are INCLUDED in file_count because they
 *   participate in the legacy migration surface, but EXCLUDED from
 *   call_sites[] because they mock the hooks rather than invoking them
 *   against a real Convex backend.
 *
 * Determinism (per AC-3):
 *   - Records are sorted by (source_path, line, column, hook_kind).
 *   - call_site_id is the first 16 hex chars of SHA-256 over
 *     `${source_path}:${line}:${column}:${hook_kind}` — stable across reruns.
 *   - No timestamps, no random IDs, no fs-order-dependent iteration
 *     (readdir results are lexicographically sorted before recursion).
 *
 * Output JSON shape:
 *   {
 *     "source_roots": ["app", "components", "hooks", "screens"],
 *     "schema_version": 1,
 *     "counting_rule": "...",
 *     "summary": { "file_count": N, "call_site_count": M },
 *     "call_sites": [ { call_site_id, source_path, line, column, hook_kind, legacy_ref } ]
 *   }
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Approved RN source roots — order is stable for the output artifact. */
export const APPROVED_SOURCE_ROOTS = ['app', 'components', 'hooks', 'screens'] as const;
export type SourceRoot = (typeof APPROVED_SOURCE_ROOTS)[number];

/** Hook kinds that count as legacy Convex call sites (the 105-site contract). */
export type HookKind =
  | 'useQuery'
  | 'useMutation'
  | 'useAction'
  | 'ConvexProvider'
  | 'ConvexReactClient';

/**
 * Hook kinds recognized as legacy Convex surface for file_count purposes.
 *
 * This is broader than HookKind because it also includes useConvex: a file
 * that imports or mentions useConvex is part of the legacy migration surface
 * even though useConvex() invocations are not counted as call sites (see
 * the file-header rationale).
 */
export type FileMentionKind = HookKind | 'useConvex';

/** A single line-addressed legacy Convex call-site record. */
export interface CallSite {
  call_site_id: string;
  source_path: string;
  line: number;
  column: number;
  hook_kind: HookKind;
  legacy_ref: string;
}

/** Aggregate inventory result emitted to disk and stdout. */
export interface CallSiteInventory {
  source_roots: readonly SourceRoot[];
  schema_version: number;
  counting_rule: string;
  summary: {
    file_count: number;
    call_site_count: number;
  };
  call_sites: CallSite[];
}

/** Top-level directories that must never be scanned. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '_generated',
  '__tests__',
  '__mocks__',
  '__fixtures__',
  '.spec',
  '.tmp',
  '.rnstorybook',
  'storybook-static',
]);

/** File extensions we scan for legacy Convex call sites. */
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx']);

/** Test-file suffixes — counted in file_count but excluded from call_sites. */
function isTestFile(name: string): boolean {
  return (
    name.endsWith('.test.ts') ||
    name.endsWith('.test.tsx') ||
    name.endsWith('.spec.ts') ||
    name.endsWith('.spec.tsx')
  );
}

/**
 * Storybook stories — excluded entirely.
 *
 * Per AC-4 the four approved source roots must be app, components, hooks,
 * screens and must exclude node_modules, convex/_generated, and test-only
 * files. Storybook stories are visual-test fixtures: they may import
 * `convex/react` to mount a provider mock, but they do not consume the
 * production data plane. Counting them would over-state the migration
 * surface; excluding them keeps the inventory focused on real consumers.
 */
function isStoriesFile(name: string): boolean {
  return name.endsWith('.stories.ts') || name.endsWith('.stories.tsx');
}

/** A file is included in the file walk iff it is a scannable TS/TSX file
 *  that is NOT a stories file. Test files pass through so they can contribute
 *  to file_count when they mention a legacy hook. */
function isWalkableScript(name: string): boolean {
  if (isStoriesFile(name)) return false;
  for (const ext of SCAN_EXTENSIONS) {
    if (name.endsWith(ext)) return true;
  }
  return false;
}

/** Recursively walk a directory and yield file paths (deterministic lexicographic order). */
function walkDir(dir: string, onFile: (absPath: string) => void): void {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });
  // Sort entries by name for deterministic traversal.
  const sorted = entries.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const ent of sorted) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      walkDir(full, onFile);
    } else if (ent.isFile()) {
      if (isWalkableScript(ent.name)) {
        onFile(full);
      }
    }
  }
}

/** Strip block comments, replacing them with blank lines to preserve line numbers. */
function stripBlockComments(src: string): string {
  let out = '';
  let i = 0;
  let inString: "'" | '"' | '`' | null = null;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (inString) {
      out += ch;
      if (ch === '\\' && next !== undefined) {
        out += next;
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      // consume until */
      out += '  ';
      i += 2;
      while (i < src.length) {
        const c = src[i];
        const n = src[i + 1];
        if (c === '*' && n === '/') {
          out += '  ';
          i += 2;
          break;
        }
        out += c === '\n' ? '\n' : ' ';
        i += 1;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
      out += ch;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Strip `// ...` line comments from a single line, respecting string literals.
 * Block comments must already be stripped by stripBlockComments.
 */
function stripLineComment(line: string): string {
  let out = '';
  let inString: "'" | '"' | '`' | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (inString) {
      out += ch;
      if (ch === '\\' && next !== undefined) {
        out += next;
        i += 1;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '/' && next === '/') {
      // line comment begins — drop the rest
      break;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
    }
    out += ch;
  }
  return out;
}

/** Match configs for each call-site hook kind. */
interface HookPattern {
  kind: HookKind;
  regex: RegExp;
  /** Whether to extract legacy_ref from the first call argument. */
  takesApiRef: boolean;
}

/**
 * Patterns that emit call-site records. Note: useConvex is intentionally
 * absent — see the file-header rationale.
 */
const HOOK_PATTERNS: HookPattern[] = [
  // Function-call hooks — `\b` ensures we don't match `myuseQuery(`.
  // Skips `useQuery as ...` import aliases naturally because no `(` follows.
  { kind: 'useQuery', regex: /\buseQuery\s*\(/g, takesApiRef: true },
  { kind: 'useMutation', regex: /\buseMutation\s*\(/g, takesApiRef: true },
  { kind: 'useAction', regex: /\buseAction\s*\(/g, takesApiRef: true },
  // JSX mount
  { kind: 'ConvexProvider', regex: /<\s*ConvexProvider\b/g, takesApiRef: false },
  // Constructor
  { kind: 'ConvexReactClient', regex: /\bnew\s+ConvexReactClient\s*\(/g, takesApiRef: false },
];

/**
 * File-mention pattern (broad). Used to decide whether a file participates in
 * the legacy Convex surface. Includes useConvex because files that mention
 * useConvex are still part of the migration inventory.
 */
const FILE_MENTION_REGEX =
  /\b(useQuery|useMutation|useAction|useConvex|ConvexProvider|ConvexReactClient)\b/;

/**
 * Extract the first call argument starting after `(` at position `parenPos` in
 * the cleaned source. Returns the literal text of the first argument (trimmed).
 * Walks forward respecting nested () and strings, stopping at top-level `,` or `)`.
 */
function extractFirstArg(src: string, parenPos: number): string {
  let i = parenPos + 1;
  let depth = 1;
  let inString: "'" | '"' | '`' | null = null;
  let buf = '';
  while (i < src.length) {
    const ch = src[i];
    if (inString) {
      buf += ch;
      if (ch === '\\' && src[i + 1] !== undefined) {
        buf += src[i + 1];
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
      buf += ch;
      i += 1;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1;
      buf += ch;
      i += 1;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) break;
      buf += ch;
      i += 1;
      continue;
    }
    if (ch === ',' && depth === 1) break;
    buf += ch;
    i += 1;
  }
  // Trim trailing whitespace/newlines that arise from multi-line calls.
  return buf.trim().replace(/\s+/g, ' ');
}

/**
 * Reduce an extracted first-arg expression to a stable legacy_ref string.
 * For canonical call sites this yields `api.foo.bar.queries.listByConversation`.
 * Falls back to the trimmed expression text when the shape is non-canonical.
 */
function toLegacyRef(rawArg: string | null, kind: HookKind): string {
  if (!rawArg) return kind;
  // Match dotted api.* reference (the canonical generated-api shape).
  const m = rawArg.match(/\b(api\b(?:\.[A-Za-z_$][\w$]*)+)/);
  if (m?.[1]) return m[1];
  // Fall back to the first identifier-looking token of the arg.
  const id = rawArg.match(/^[A-Za-z_$][\w$]*/);
  if (id?.[0]) return id[0];
  return kind;
}

/**
 * Scan a single file for legacy Convex call sites.
 * Returns an array of records (without assigned call_site_id — caller assigns).
 */
function scanFileForCallSites(absPath: string): Array<Omit<CallSite, 'call_site_id'>> {
  let raw: string;
  try {
    raw = readFileSync(absPath, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`failed to read ${absPath}: ${msg}`);
  }
  const cleaned = stripBlockComments(raw);
  const lines = cleaned.split('\n');
  const out: Array<Omit<CallSite, 'call_site_id'>> = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx] ?? '';
    // Skip import / re-export statements — they never contain real call sites
    // and matching `useQuery(` would otherwise catch aliased re-exports.
    const trimmedStart = rawLine.slice(0, rawLine.length - rawLine.trimStart().length);
    const codeAfterIndent = rawLine.slice(trimmedStart.length);
    if (
      codeAfterIndent.startsWith('import ') ||
      codeAfterIndent.startsWith('import{') ||
      codeAfterIndent.startsWith('export ') ||
      codeAfterIndent.startsWith('export{')
    ) {
      // Still process if this is a side-effect call buried in a multi-statement line — unlikely.
      // Conservative: skip whole line.
      continue;
    }
    const line = stripLineComment(rawLine);
    // Skip type/interface/declare statements — they are type-level, not runtime call sites.
    if (/^\s*(export\s+)?(type|interface|declare)\b/.test(line)) continue;
    // Find all hook matches on this line.
    for (const pat of HOOK_PATTERNS) {
      pat.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pat.regex.exec(line)) !== null) {
        const matchStart = m.index;
        // Column is 1-indexed; matchStart is 0-indexed offset into the line.
        const column = matchStart + 1;
        let legacyRef: string;
        if (pat.takesApiRef) {
          // Find the `(` position in the original (cleaned) source for arg extraction.
          // We need the absolute offset into `cleaned` to handle multi-line calls.
          const lineOffsetStart = cleaned.length === 0 ? 0 : offsetOfLineStart(lines, lineIdx);
          const parenOffsetInLine = line.indexOf('(', matchStart);
          if (parenOffsetInLine === -1) {
            legacyRef = pat.kind;
          } else {
            const argExpr = extractFirstArg(cleaned, lineOffsetStart + parenOffsetInLine);
            legacyRef = toLegacyRef(argExpr, pat.kind);
          }
        } else {
          legacyRef = pat.kind;
        }
        out.push({
          source_path: '', // filled by caller
          line: lineIdx + 1,
          column,
          hook_kind: pat.kind,
          legacy_ref: legacyRef,
        });
      }
    }
  }
  return out;
}

/** Compute the absolute offset of the start of line `lineIdx` in the original joined source. */
function offsetOfLineStart(lines: string[], lineIdx: number): number {
  let offset = 0;
  for (let i = 0; i < lineIdx; i++) {
    // +1 for the '\n' that was consumed by split.
    offset += (lines[i]?.length ?? 0) + 1;
  }
  return offset;
}

/** Build a deterministic call_site_id from the stable source-location tuple. */
function buildCallSiteId(sourcePath: string, line: number, column: number, kind: HookKind): string {
  const h = createHash('sha256');
  h.update(`${sourcePath}:${line}:${column}:${kind}`);
  return h.digest('hex').slice(0, 16);
}

/** Convert an absolute path to a POSIX-style relative source_path (forward slashes). */
function toRelativeSourcePath(root: string, absPath: string): string {
  let rel = relative(root, absPath);
  if (sep !== '/') rel = rel.split(sep).join('/');
  return rel;
}

/** Validate that a relative path stays within an approved source root. */
function withinApprovedRoot(relPath: string): boolean {
  const top = relPath.split('/')[0] ?? '';
  return (APPROVED_SOURCE_ROOTS as readonly string[]).includes(top);
}

/** Quick check: does the file's source contain any legacy hook mention? */
function fileMentionsLegacyHook(absPath: string): boolean {
  let raw: string;
  try {
    raw = readFileSync(absPath, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`failed to read ${absPath}: ${msg}`);
  }
  return FILE_MENTION_REGEX.test(raw);
}

export interface ScanOptions {
  /** Repository root containing the four approved source roots. */
  root: string;
  /** Optional override of source roots (defaults to APPROVED_SOURCE_ROOTS). */
  roots?: readonly SourceRoot[];
}

/**
 * Run the inventory scan against the approved source roots.
 * Throws on file-read failures (fail-closed per spec STRICTLY clause).
 */
export function scanCallSites(options: ScanOptions): CallSiteInventory {
  const root = options.root;
  const roots = options.roots ?? APPROVED_SOURCE_ROOTS;
  const sites: CallSite[] = [];
  const filesWithLegacyMentions = new Set<string>();

  for (const r of roots) {
    const dir = join(root, r);
    if (!existsSync(dir)) continue;
    const stat = statSync(dir);
    if (!stat.isDirectory()) continue;
    walkDir(dir, (absPath) => {
      const rel = toRelativeSourcePath(root, absPath);
      if (!withinApprovedRoot(rel)) return;
      // Belt-and-suspenders: skip any path that slipped through with node_modules or _generated.
      if (
        rel.includes('node_modules/') ||
        rel.includes('/_generated/') ||
        rel.startsWith('_generated/')
      ) {
        return;
      }
      // file_count: any file whose source mentions a legacy Convex hook name.
      // This intentionally includes test files (they import/mock the hooks).
      if (fileMentionsLegacyHook(absPath)) {
        filesWithLegacyMentions.add(rel);
      }
      // call_sites: real invocations, only from non-test files.
      // AC-4 forbids test paths in call_site paths.
      const base = rel.split('/').pop() ?? '';
      if (isTestFile(base)) return;
      const found = scanFileForCallSites(absPath);
      for (const f of found) {
        const id = buildCallSiteId(rel, f.line, f.column, f.hook_kind);
        sites.push({
          call_site_id: id,
          source_path: rel,
          line: f.line,
          column: f.column,
          hook_kind: f.hook_kind,
          legacy_ref: f.legacy_ref,
        });
      }
    });
  }

  // Deterministic sort: source_path → line → column → hook_kind
  sites.sort((a, b) => {
    if (a.source_path !== b.source_path) return a.source_path < b.source_path ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    if (a.column !== b.column) return a.column - b.column;
    return a.hook_kind < b.hook_kind ? -1 : a.hook_kind > b.hook_kind ? 1 : 0;
  });

  // Defensive dedup — no two records may share the same (source_path, line, column).
  // The spec forbids duplicate source-location tuples.
  const seen = new Set<string>();
  for (const s of sites) {
    const k = `${s.source_path}:${s.line}:${s.column}`;
    if (seen.has(k)) {
      throw new Error(
        `duplicate call-site coordinate: ${k} (${s.hook_kind}) — scanner rule must collapse or relocate`
      );
    }
    seen.add(k);
  }

  return {
    source_roots: roots,
    schema_version: 1,
    counting_rule:
      'file_count: any .ts/.tsx file under an approved root whose source contains a lexical ' +
      'mention of useQuery, useMutation, useAction, useConvex, ConvexProvider, or ' +
      'ConvexReactClient (including imports, comments, type annotations, and test files; ' +
      'excluding *.stories.*, node_modules/, _generated/, .spec/, .tmp/). ' +
      'call_sites: ONE record per real invocation or JSX mount of useQuery, useMutation, ' +
      'useAction, ConvexProvider, or new ConvexReactClient — import statements, // line ' +
      'comments, /* block */ comments, and type/interface/declare statements are excluded. ' +
      'useConvex() is intentionally not emitted as a call site (PRD §07 defines the 105-site ' +
      'contract as useQuery+useMutation+useAction). Test files (*.test.*, *.spec.*) are ' +
      'excluded from call_sites[] but included in file_count.',
    summary: {
      file_count: filesWithLegacyMentions.size,
      call_site_count: sites.length,
    },
    call_sites: sites,
  };
}
