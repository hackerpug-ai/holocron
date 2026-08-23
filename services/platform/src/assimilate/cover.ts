/**
 * Coverage gate — TypeScript port of crawl-contract §5.
 * Denominator is in-scope files. Numerator is paths that survived cite().
 */
import type { AssimilateManifest, CiteResult, CoverResult, CoverShard } from './types.ts';

export function coverageReport(
  manifest: AssimilateManifest,
  validated: CiteResult,
  floor = 1
): CoverResult {
  const verified = new Set(validated.verified_paths);
  const byShard = new Map<string, CoverShard>();
  for (const s of manifest.shards) {
    byShard.set(s.id, {
      id: s.id,
      key: s.key,
      total: 0,
      covered: 0,
      uncovered: [],
      ratio: 1,
    });
  }
  const orphan: CoverShard = {
    id: '(unassigned)',
    key: '',
    total: 0,
    covered: 0,
    uncovered: [],
    ratio: 1,
  };

  for (const f of manifest.files) {
    const bucket = (f.shard && byShard.get(f.shard)) || orphan;
    bucket.total += 1;
    if (verified.has(f.path)) bucket.covered += 1;
    else bucket.uncovered.push(f.path);
  }
  if (orphan.total > 0) byShard.set('(unassigned)', orphan);

  const shards = [...byShard.values()].map((s) => ({
    ...s,
    ratio: s.total ? Math.round((s.covered / s.total) * 10_000) / 10_000 : 1,
  }));
  shards.sort((a, b) => a.ratio - b.ratio);

  const inScope = manifest.files.length;
  const covered = manifest.files.filter((f) => verified.has(f.path)).length;
  const ratio = inScope ? covered / inScope : 0;
  const scopePaths = new Set(manifest.files.map((f) => f.path));
  const stray = [...verified].filter((p) => !scopePaths.has(p)).sort();

  return {
    schema: 'assimilate/coverage@1',
    target: manifest.target,
    floor,
    in_scope: inScope,
    verified_read: covered,
    ratio: Math.round(ratio * 10_000) / 10_000,
    meets_floor: ratio >= floor,
    shards,
    uncovered_shards: shards
      .filter((s) => s.uncovered.length > 0)
      .map((s) => s.id)
      .sort(),
    uncovered_total: inScope - covered,
    stray_verified_paths: stray,
  };
}
