import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isBarren, validateCitations } from './cite.ts';
import type { AssimilateManifest, WorkerReturn } from './types.ts';

function fixtureRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'cite-'));
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'ui'));
  writeFileSync(
    join(root, 'src', 'frame.rs'),
    'use crate::theme::Palette;\n\nfn draw(prev: &Cell, next: &Cell) {\n    /// only redraw cells that actually changed\n    if prev_cell == next_cell { continue; }\n}\n'
  );
  writeFileSync(join(root, 'src', 'color.rs'), 'pub const RESET: &str = "esc[0m";\n');
  writeFileSync(join(root, 'ui', 'color.rs'), 'pub fn tint(base: Rgb, amount: f32) -> Rgb { base }\n');
  return root;
}

function manifestFor(root: string): AssimilateManifest {
  return {
    schema: 'assimilate/manifest@1',
    target: {
      input: root,
      kind: 'git',
      transport: 'git-reuse',
      root,
      remote: '',
      sha: 'deadbeef',
      acquired_at: new Date().toISOString(),
    },
    depth: 'deep',
    totals: { tracked: 3, in_scope: 3, excluded: 0, bytes_in_scope: 1 },
    exclusions: [],
    shards: [
      { id: 'S01', key: 'src', files: 2, bytes: 1 },
      { id: 'S02', key: 'ui', files: 1, bytes: 1 },
    ],
    files: [
      { path: 'src/frame.rs', bytes: 160, lines: 6, lang: 'rust', shard: 'S01' },
      { path: 'src/color.rs', bytes: 32, lines: 1, lang: 'rust', shard: 'S01' },
      { path: 'ui/color.rs', bytes: 60, lines: 1, lang: 'rust', shard: 'S02' },
    ],
    budget: { shards: 2, lenses: 5, est_worker_dispatches: 8, advisory: null },
  };
}

describe('validateCitations', () => {
  it('keeps a verbatim quote and drops fabricated / hallucinated / ambiguous ones', () => {
    const root = fixtureRepo();
    const returns: WorkerReturn[] = [
      {
        shard: 'S01',
        findings: [
          {
            claim: 'diffs cells before flush',
            path: 'src/frame.rs',
            line: 5,
            evidence: 'if prev_cell   ==   next_cell { continue; }',
          },
          {
            claim: 'has a scheduler',
            path: 'src/scheduler.rs',
            line: 3,
            evidence: 'fn schedule() {}',
          },
          {
            claim: 'uses double buffering',
            path: 'src/color.rs',
            line: 1,
            evidence: 'let back_buffer = Buffer::new(width, height);',
          },
          {
            claim: 'late claim',
            path: 'src/color.rs',
            line: 99,
            evidence: 'pub const RESET',
          },
          {
            claim: 'frame diffs cells',
            path: 'frame.rs',
            line: 5,
            evidence: 'if prev_cell == next_cell { continue; }',
          },
          {
            claim: 'some color thing',
            path: 'color.rs',
            line: 1,
            evidence: 'pub const RESET: &str =',
          },
        ],
        receipts: [{ path: 'src/color.rs', opening_quote: 'pub const RESET: &str = "esc[0m";' }],
      },
    ];

    const result = validateCitations(manifestFor(root), returns);
    expect(result.verified_paths).toEqual(['src/color.rs', 'src/frame.rs']);
    expect(result.quote_match.exact).toBeGreaterThan(0);
    expect(result.dropped_by_code.path_not_in_manifest).toBe(1);
    expect(result.dropped_by_code.unverified_quote).toBe(1);
    expect(result.dropped_by_code.line_out_of_range).toBe(1);
    expect(result.dropped_by_code.path_ambiguous).toBe(1);
    expect(result.shortened_paths_resolved).toBeGreaterThanOrEqual(1);
    expect(isBarren(result)).toBe(false);
  });

  it('does not count files_read self-report as evidence', () => {
    const root = fixtureRepo();
    const returns: WorkerReturn[] = [
      {
        shard: 'S01',
        findings: [],
        receipts: [],
      },
    ];
    const result = validateCitations(manifestFor(root), returns);
    expect(result.verified_paths).toEqual([]);
    expect(result.barren_workers).toEqual(['S01']);
    expect(isBarren(result)).toBe(true);
  });
});
