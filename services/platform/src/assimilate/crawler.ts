import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AssimilateManifest, WorkerReturn } from './types.ts';

export type CrawlerJob = {
  kind: 'shard' | 'lens' | 'external';
  id: string;
  key: string;
  files: string[];
  root: string;
  returnsDir: string;
};

export type CrawlerFn = (job: CrawlerJob) => Promise<WorkerReturn>;
export type SynthesizerFn = (input: {
  manifest: AssimilateManifest;
  returnsDir: string;
}) => Promise<string>;

export const STANDING_LENSES = [
  'architecture',
  'patterns',
  'docs',
  'dependencies',
  'testing',
] as const;

export function jobsFromManifest(manifest: AssimilateManifest, returnsDir: string): CrawlerJob[] {
  const jobs: CrawlerJob[] = manifest.shards.map((s) => ({
    kind: 'shard' as const,
    id: s.id,
    key: s.key,
    files: manifest.files.filter((f) => f.shard === s.id).map((f) => f.path),
    root: manifest.target.root,
    returnsDir,
  }));
  for (const lens of STANDING_LENSES) {
    jobs.push({
      kind: 'lens',
      id: `lens-${lens}`,
      key: lens,
      files: manifest.files.map((f) => f.path),
      root: manifest.target.root,
      returnsDir,
    });
  }
  jobs.push({
    kind: 'external',
    id: 'external',
    key: 'external',
    files: [],
    root: manifest.target.root,
    returnsDir,
  });
  return jobs;
}

export async function runJobs(
  jobs: CrawlerJob[],
  crawler: CrawlerFn,
  concurrency: number
): Promise<WorkerReturn[]> {
  const out: WorkerReturn[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (i < jobs.length) {
      const idx = i;
      i += 1;
      const job = jobs[idx];
      if (!job) break;
      out[idx] = await crawler(job);
    }
  });
  await Promise.all(workers);
  return out.filter(Boolean);
}

export function writeReturn(job: CrawlerJob, ret: WorkerReturn): string {
  mkdirSync(job.returnsDir, { recursive: true });
  const path = join(job.returnsDir, `${job.id}.json`);
  writeFileSync(path, `${JSON.stringify(ret, null, 2)}\n`);
  return path;
}

export function loadReturns(returnsDir: string): WorkerReturn[] {
  try {
    return readdirSync(returnsDir)
      .filter((n) => n.endsWith('.json'))
      .sort()
      .map((n) => {
        const obj = JSON.parse(readFileSync(join(returnsDir, n), 'utf8')) as WorkerReturn;
        obj._source = n;
        return obj;
      });
  } catch {
    return [];
  }
}

/** Planted crawler: one receipt per assigned file using the first non-blank line. */
export function plantedReceiptCrawler(): CrawlerFn {
  return async (job) => {
    const receipts = job.files.map((path) => {
      let opening = path;
      try {
        const text = readFileSync(join(job.root, path), 'utf8');
        const normalized = text.replace(/\s+/g, ' ').trim();
        opening = normalized.slice(0, 120) || path;
      } catch {
        opening = path;
      }
      return { path, opening_quote: opening, lines: 1 };
    });
    const ret: WorkerReturn = {
      shard: job.kind === 'shard' ? job.id : undefined,
      lens: job.kind === 'lens' ? job.key : undefined,
      findings: [],
      receipts: job.kind === 'external' ? [] : receipts,
    };
    writeReturn(job, ret);
    return ret;
  };
}
