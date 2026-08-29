import type { AssimilateManifest, CiteResult, CoverResult } from './types.ts';

export function coverageLedgerMarkdown(
  manifest: AssimilateManifest,
  cited: CiteResult,
  cover: CoverResult
): string {
  const excl = manifest.exclusions.map((e) => `${e.count} ${e.reason}`).join(', ') || 'none';
  const droppedBits = Object.entries(cited.dropped_by_code)
    .map(([code, n]) => `${n} ${code}`)
    .join(', ');
  const sha = manifest.target.sha.slice(0, 8) || '(no sha)';
  return `## Coverage Ledger

| | |
|---|---|
| Target | ${manifest.target.input} @ ${sha} |
| Files tracked | ${manifest.totals.tracked} |
| Files in scope | ${manifest.totals.in_scope} (depth: ${manifest.depth}) |
| Files verified read | ${cover.verified_read} (${(cover.ratio * 100).toFixed(1)}%) |
| Shards | ${manifest.shards.length} |
| Findings kept / dropped | ${cited.totals.kept_findings} / ${cited.totals.dropped}${droppedBits ? ` (${droppedBits})` : ''} |
| Excluded | ${manifest.totals.excluded} — ${excl} |
`;
}

export function assembleReport(opts: {
  manifest: AssimilateManifest;
  cited: CiteResult;
  cover: CoverResult;
  essence: string;
}): { markdown: string; verdict: 'COMPLETE' | 'PARTIAL' } {
  const verdict: 'COMPLETE' | 'PARTIAL' =
    opts.cover.meets_floor && opts.essence.trim().length > 0 ? 'COMPLETE' : 'PARTIAL';
  const ledger = coverageLedgerMarkdown(opts.manifest, opts.cited, opts.cover);
  const findings = opts.cited.kept_findings
    .slice(0, 40)
    .map((f) => `- ${f.claim ?? '(receipt)'} (\`${f.path}\`)`)
    .join('\n');
  const markdown = `# Assimilation: ${opts.manifest.target.input}

**Species** ${opts.manifest.target.remote || opts.manifest.target.input} @ ${opts.manifest.target.sha.slice(0, 8)}

${ledger}

## Essence

${opts.essence.trim() || '_No essence produced._'}

## Cited findings

${findings || '_None survived the citation gate._'}
`;
  return { markdown, verdict };
}
