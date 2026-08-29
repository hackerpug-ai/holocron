import { describe, expect, it } from 'vitest';
import { coverageReport } from './cover.ts';
import type { AssimilateManifest, CiteResult } from './types.ts';

const manifest: AssimilateManifest = {
  schema: 'assimilate/manifest@1',
  target: {
    input: 'x',
    kind: 'git',
    transport: 'git-reuse',
    root: '/tmp/x',
    remote: '',
    sha: 'abc',
    acquired_at: 'now',
  },
  depth: 'normal',
  totals: { tracked: 3, in_scope: 3, excluded: 0, bytes_in_scope: 3 },
  exclusions: [],
  shards: [
    { id: 'S01', key: 'src', files: 2, bytes: 2 },
    { id: 'S02', key: 'ui', files: 1, bytes: 1 },
  ],
  files: [
    { path: 'a.rs', bytes: 1, lines: 1, lang: 'rust', shard: 'S01' },
    { path: 'b.rs', bytes: 1, lines: 1, lang: 'rust', shard: 'S01' },
    { path: 'c.rs', bytes: 1, lines: 1, lang: 'rust', shard: 'S02' },
  ],
  budget: { shards: 2, lenses: 5, est_worker_dispatches: 8, advisory: null },
};

describe('coverageReport', () => {
  it('computes coverage only from verified_paths, never files_read', () => {
    const validated: CiteResult = {
      schema: 'assimilate/validated@1',
      target: manifest.target,
      kept_findings: [],
      verified_paths: ['a.rs'],
      totals: { submitted: 1, kept_findings: 1, verified_files: 1, dropped: 0 },
      quote_match: { exact: 1, lines: 0 },
      shortened_paths_resolved: 0,
      dropped_by_code: {},
      dropped: [],
      per_worker: [],
      barren_workers: [],
    };
    const cover = coverageReport(manifest, validated, 1);
    expect(cover.verified_read).toBe(1);
    expect(cover.in_scope).toBe(3);
    expect(cover.meets_floor).toBe(false);
    expect(cover.uncovered_shards).toEqual(['S01', 'S02']);
    expect(cover.uncovered_total).toBe(2);
  });

  it('meets floor when every in-scope file has a verified quote', () => {
    const validated: CiteResult = {
      schema: 'assimilate/validated@1',
      target: manifest.target,
      kept_findings: [],
      verified_paths: ['a.rs', 'b.rs', 'c.rs'],
      totals: { submitted: 3, kept_findings: 3, verified_files: 3, dropped: 0 },
      quote_match: { exact: 3, lines: 0 },
      shortened_paths_resolved: 0,
      dropped_by_code: {},
      dropped: [],
      per_worker: [],
      barren_workers: [],
    };
    const cover = coverageReport(manifest, validated, 1);
    expect(cover.meets_floor).toBe(true);
    expect(cover.ratio).toBe(1);
    expect(cover.uncovered_total).toBe(0);
  });
});
