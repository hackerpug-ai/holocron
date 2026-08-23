/**
 * Citation gate — TypeScript port of crawl-contract §4.
 * Quotes must appear in the real file on disk. files_read self-report is ignored.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AssimilateManifest, CiteDropCode, CiteResult, WorkerReturn } from './types.ts';

const MIN_QUOTE_CHARS = 12;

export function normalizeQuote(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function substantiveLines(quote: string): string[] {
  return quote
    .split('\n')
    .map((l) => normalizeQuote(l))
    .filter((n) => n.replace(/ /g, '').length >= MIN_QUOTE_CHARS);
}

class PathResolver {
  private readonly exact: Set<string>;
  private readonly bySuffix = new Map<string, string[]>();
  private readonly root: string;

  constructor(manifestPaths: string[], root: string) {
    this.exact = new Set(manifestPaths);
    this.root = root.replace(/\/+$/, '');
    for (const p of manifestPaths) {
      const parts = p.split('/');
      for (let i = 0; i < parts.length; i += 1) {
        const suffix = parts.slice(i).join('/');
        const hits = this.bySuffix.get(suffix) ?? [];
        hits.push(p);
        this.bySuffix.set(suffix, hits);
      }
    }
  }

  resolve(cited: string | undefined): { path: string | null; error: CiteDropCode | null } {
    if (!cited) return { path: null, error: 'unanchored' };
    let c = cited.trim().replace(/\/+$/, '');
    if (this.root && c.startsWith(`${this.root}/`)) c = c.slice(this.root.length + 1);
    c = c.replace(/^\.\//, '');
    if (this.exact.has(c)) return { path: c, error: null };
    const hits = this.bySuffix.get(c);
    if (!hits || hits.length === 0) return { path: null, error: 'path_not_in_manifest' };
    if (hits.length > 1) return { path: null, error: 'path_ambiguous' };
    return { path: hits[0] ?? null, error: null };
  }
}

class FileCache {
  private readonly cache = new Map<string, string | null>();

  constructor(private readonly root: string) {}

  get(path: string): string | null {
    if (!this.cache.has(path)) {
      try {
        const text = readFileSync(join(this.root, path), 'utf8');
        this.cache.set(path, normalizeQuote(text));
      } catch {
        this.cache.set(path, null);
      }
    }
    return this.cache.get(path) ?? null;
  }
}

function checkQuote(
  cache: FileCache,
  index: Map<string, { lines: number }>,
  resolver: PathResolver,
  path: string | undefined,
  line: number | undefined,
  quote: string | undefined
):
  | { ok: true; mode: 'exact' | 'lines'; resolved: string }
  | { ok: false; code: CiteDropCode; resolved: string | null } {
  const { path: resolved, error } = resolver.resolve(path);
  if (error) return { ok: false, code: error, resolved };
  if (!resolved) return { ok: false, code: 'unanchored', resolved: null };
  const meta = index.get(resolved);
  if (line !== undefined && line !== null) {
    const n = Number(line);
    if (!Number.isInteger(n) || n < 1 || !meta || n > meta.lines) {
      return { ok: false, code: 'line_out_of_range', resolved };
    }
  }
  if (!quote) return { ok: false, code: 'evidence_missing', resolved };
  const nq = normalizeQuote(quote);
  if (nq.replace(/ /g, '').length < MIN_QUOTE_CHARS) {
    return { ok: false, code: 'evidence_too_short', resolved };
  }
  const body = cache.get(resolved);
  if (body === null) return { ok: false, code: 'file_unreadable', resolved };
  if (body.includes(nq)) return { ok: true, mode: 'exact', resolved };
  const parts = substantiveLines(quote);
  if (parts.length >= 2 && parts.every((p) => body.includes(p))) {
    return { ok: true, mode: 'lines', resolved };
  }
  return { ok: false, code: 'unverified_quote', resolved };
}

export function validateCitations(
  manifest: AssimilateManifest,
  returns: WorkerReturn[]
): CiteResult {
  const index = new Map(manifest.files.map((f) => [f.path, { lines: f.lines }]));
  const cache = new FileCache(manifest.target.root);
  const resolver = new PathResolver([...index.keys()], manifest.target.root);

  const kept: CiteResult['kept_findings'] = [];
  const dropped: CiteResult['dropped'] = [];
  const verified = new Set<string>();
  const perWorker: CiteResult['per_worker'] = [];
  const dropsByCode: Partial<Record<CiteDropCode, number>> = {};
  const matchCounts = { exact: 0, lines: 0 };
  let shortened = 0;

  const bumpDrop = (code: CiteDropCode) => {
    dropsByCode[code] = (dropsByCode[code] ?? 0) + 1;
  };

  for (const ret of returns) {
    const wid = ret.shard || ret.lens || ret._source || '(unnamed)';
    const findings = ret.findings ?? [];
    const receipts = ret.receipts ?? [];
    const submitted = findings.length + receipts.length;
    let wKept = 0;

    for (const fnd of findings) {
      const result = checkQuote(cache, index, resolver, fnd.path, fnd.line, fnd.evidence);
      if (result.ok) {
        if (result.resolved !== fnd.path) shortened += 1;
        kept.push({
          ...fnd,
          path: result.resolved,
          quote_match: result.mode,
          _worker: wid,
        });
        matchCounts[result.mode] += 1;
        verified.add(result.resolved);
        wKept += 1;
      } else {
        bumpDrop(result.code);
        dropped.push({
          worker: wid,
          code: result.code,
          path: fnd.path,
          claim: (fnd.claim ?? '').slice(0, 160),
        });
      }
    }

    for (const rcpt of receipts) {
      const result = checkQuote(cache, index, resolver, rcpt.path, undefined, rcpt.opening_quote);
      if (result.ok) {
        if (result.resolved !== rcpt.path) shortened += 1;
        matchCounts[result.mode] += 1;
        verified.add(result.resolved);
        wKept += 1;
      } else {
        bumpDrop(result.code);
        dropped.push({
          worker: wid,
          code: result.code,
          path: rcpt.path,
          claim: '(receipt)',
        });
      }
    }

    perWorker.push({
      worker: wid,
      submitted,
      kept: wKept,
      barren: submitted === 0 || wKept === 0,
    });
  }

  return {
    schema: 'assimilate/validated@1',
    target: manifest.target,
    kept_findings: kept,
    verified_paths: [...verified].sort(),
    totals: {
      submitted: perWorker.reduce((n, w) => n + w.submitted, 0),
      kept_findings: kept.length,
      verified_files: verified.size,
      dropped: dropped.length,
    },
    quote_match: matchCounts,
    shortened_paths_resolved: shortened,
    dropped_by_code: dropsByCode,
    dropped,
    per_worker: perWorker,
    barren_workers: perWorker.filter((w) => w.barren).map((w) => w.worker),
  };
}

export function isBarren(result: CiteResult): boolean {
  return result.barren_workers.length > 0;
}
