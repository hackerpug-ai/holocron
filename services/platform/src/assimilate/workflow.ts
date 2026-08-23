import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { acquireTarget } from './acquire.ts';
import { validateCitations } from './cite.ts';
import { coverageReport } from './cover.ts';
import {
  type CrawlerFn,
  jobsFromManifest,
  loadReturns,
  plantedReceiptCrawler,
  runJobs,
  type SynthesizerFn,
} from './crawler.ts';
import { assembleReport } from './report.ts';
import type {
  AssimilateManifest,
  AssimilationPlan,
  CiteResult,
  CoverResult,
  WorkerReturn,
} from './types.ts';
import { profileToDepth } from './types.ts';

export const ASSIMILATE_ACP_CONCURRENCY = 2;
export const COVER_RETRY_BUDGET = 2;

const inputSchema = z.object({
  repositoryUrl: z.string().min(1),
  profile: z.enum(['fast', 'standard', 'thorough']).optional(),
  autoApprove: z.boolean().optional(),
  sessionId: z.string().optional(),
  focus: z.array(z.string()).optional(),
  allowSelf: z.boolean().optional(),
  scratchRoot: z.string().optional(),
  plantedCrawler: z.boolean().optional(),
});

const outputSchema = z.object({
  sessionId: z.string(),
  status: z.string(),
  verdict: z.enum(['COMPLETE', 'PARTIAL']),
  markdown: z.string(),
  documentId: z.string().optional(),
  coverageRatio: z.number(),
  verifiedRead: z.number(),
  inScope: z.number(),
});

type Ctx = {
  sessionId: string;
  autoApprove: boolean;
  plantedCrawler: boolean;
  workDir: string;
  returnsDir: string;
  manifest: AssimilateManifest;
  plan: AssimilationPlan;
  returns: WorkerReturn[];
  cited: CiteResult;
  cover: CoverResult;
  essence: string;
  markdown: string;
  verdict: 'COMPLETE' | 'PARTIAL';
};

function ctxSchema() {
  return z.custom<Ctx>((v): v is Ctx => typeof v === 'object' && v !== null);
}

function resolveCrawler(planted: boolean | undefined, injected?: CrawlerFn): CrawlerFn {
  if (injected) return injected;
  if (planted) return plantedReceiptCrawler();
  return (job) => import('./acp-dispatch.ts').then(({ acpCrawler }) => acpCrawler()(job));
}

const acquireStep = createStep({
  id: 'acquire',
  inputSchema,
  outputSchema: ctxSchema(),
  execute: async ({ inputData, runId }) => {
    const sessionId = inputData.sessionId ?? runId;
    const scratchParent = inputData.scratchRoot ?? process.env.SCRATCH_ROOT ?? '/tmp';
    mkdirSync(scratchParent, { recursive: true });
    const workDir = mkdtempSync(join(scratchParent, 'assim-run-'));
    const returnsDir = join(workDir, 'returns');
    mkdirSync(returnsDir, { recursive: true });
    const manifest = acquireTarget({
      target: inputData.repositoryUrl,
      depth: profileToDepth(inputData.profile),
      focus: inputData.focus,
      allowSelf: inputData.allowSelf,
      scratchRoot: inputData.scratchRoot,
    });
    const plan: AssimilationPlan = {
      repositoryUrl: inputData.repositoryUrl,
      sha: manifest.target.sha,
      root: manifest.target.root,
      depth: manifest.depth,
      inScope: manifest.totals.in_scope,
      excluded: manifest.totals.excluded,
      shards: manifest.shards,
      lenses: ['architecture', 'patterns', 'docs', 'dependencies', 'testing'],
      estimatedDispatches: manifest.budget.est_worker_dispatches,
      exclusions: manifest.exclusions,
      advisory: manifest.budget.advisory,
    };
    return {
      sessionId,
      autoApprove: Boolean(inputData.autoApprove),
      plantedCrawler: Boolean(inputData.plantedCrawler),
      workDir,
      returnsDir,
      manifest,
      plan,
      returns: [],
      cited: emptyCite(manifest),
      cover: emptyCover(manifest),
      essence: '',
      markdown: '',
      verdict: 'PARTIAL',
    } satisfies Ctx;
  },
});

const planStep = createStep({
  id: 'plan',
  inputSchema: ctxSchema(),
  outputSchema: ctxSchema(),
  execute: async ({ inputData }) => inputData,
});

const approvalGate = createStep({
  id: 'approval-gate',
  inputSchema: ctxSchema(),
  outputSchema: ctxSchema(),
  resumeSchema: z.object({ approved: z.boolean() }),
  suspendSchema: z.object({ sessionId: z.string(), plan: z.custom<AssimilationPlan>() }),
  execute: async ({ inputData, resumeData, suspend }) => {
    if (inputData.autoApprove) return inputData;
    if (resumeData?.approved) return { ...inputData, autoApprove: true };
    return suspend({ sessionId: inputData.sessionId, plan: inputData.plan });
  },
});

const analyzeStep = createStep({
  id: 'analyze',
  inputSchema: ctxSchema(),
  outputSchema: ctxSchema(),
  execute: async ({ inputData }) => {
    const crawler = resolveCrawler(inputData.plantedCrawler);
    let returns: WorkerReturn[] = [];
    let cited = inputData.cited;
    let cover = inputData.cover;
    const jobs = jobsFromManifest(inputData.manifest, inputData.returnsDir);
    const shardJobs = jobs.filter((j) => j.kind === 'shard' || j.kind === 'lens');

    for (let attempt = 0; attempt <= COVER_RETRY_BUDGET; attempt += 1) {
      const pending =
        attempt === 0
          ? shardJobs
          : shardJobs.filter(
              (j) => cover.uncovered_shards.includes(j.id) || cited.barren_workers.includes(j.id)
            );
      if (pending.length === 0 && attempt > 0) break;
      const batch = await runJobs(pending, crawler, ASSIMILATE_ACP_CONCURRENCY);
      returns = loadReturns(inputData.returnsDir);
      if (returns.length === 0) returns = batch;
      cited = validateCitations(inputData.manifest, returns);
      cover = coverageReport(inputData.manifest, cited, 1);
      if (cover.meets_floor) break;
    }

    return { ...inputData, returns, cited, cover };
  },
});

const synthesizeStep = createStep({
  id: 'synthesize',
  inputSchema: ctxSchema(),
  outputSchema: ctxSchema(),
  execute: async ({ inputData, requestContext }) => {
    const injected = requestContext?.get?.('synthesizer') as SynthesizerFn | undefined;
    let essence = '';
    if (injected) {
      essence = await injected({ manifest: inputData.manifest, returnsDir: inputData.returnsDir });
    } else if (inputData.plantedCrawler) {
      essence =
        'Load-bearing abstraction is the acquired checkout plus quote-verified findings. ' +
        'Coverage is the invariant: every in-scope file must appear in a surviving quote.';
    } else {
      const { acpSynthesizer } = await import('./acp-dispatch.ts');
      essence = await acpSynthesizer()({
        manifest: inputData.manifest,
        returnsDir: inputData.returnsDir,
      });
    }
    const { markdown, verdict } = assembleReport({
      manifest: inputData.manifest,
      cited: inputData.cited,
      cover: inputData.cover,
      essence,
    });
    return { ...inputData, essence, markdown, verdict };
  },
});

const persistStep = createStep({
  id: 'persist',
  inputSchema: ctxSchema(),
  outputSchema: outputSchema,
  execute: async ({ inputData }) => ({
    sessionId: inputData.sessionId,
    status: inputData.verdict === 'COMPLETE' ? 'completed' : 'completed',
    verdict: inputData.verdict,
    markdown: inputData.markdown,
    coverageRatio: inputData.cover.ratio,
    verifiedRead: inputData.cover.verified_read,
    inScope: inputData.cover.in_scope,
  }),
});

export const assimilateRepoWorkflow = createWorkflow({
  id: 'assimilate-repo',
  inputSchema,
  outputSchema,
})
  .then(acquireStep)
  .then(planStep)
  .then(approvalGate)
  .then(analyzeStep)
  .then(synthesizeStep)
  .then(persistStep)
  .commit();

function emptyCite(manifest: AssimilateManifest): CiteResult {
  return {
    schema: 'assimilate/validated@1',
    target: manifest.target,
    kept_findings: [],
    verified_paths: [],
    totals: { submitted: 0, kept_findings: 0, verified_files: 0, dropped: 0 },
    quote_match: { exact: 0, lines: 0 },
    shortened_paths_resolved: 0,
    dropped_by_code: {},
    dropped: [],
    per_worker: [],
    barren_workers: [],
  };
}

function emptyCover(manifest: AssimilateManifest): CoverResult {
  return coverageReport(manifest, emptyCite(manifest), 1);
}

export { acquireStep, analyzeStep, approvalGate, persistStep, planStep, synthesizeStep };
