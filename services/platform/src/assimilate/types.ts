export const ASSIMILATE_DEPTHS = ['quick', 'normal', 'deep'] as const;
export type AssimilateDepth = (typeof ASSIMILATE_DEPTHS)[number];

export const ASSIMILATE_PROFILES = ['fast', 'standard', 'thorough'] as const;
export type AssimilateProfile = (typeof ASSIMILATE_PROFILES)[number];

export function profileToDepth(profile: AssimilateProfile | undefined): AssimilateDepth {
  if (profile === 'fast') return 'quick';
  if (profile === 'thorough') return 'deep';
  return 'normal';
}

export type AssimilateFileEntry = {
  path: string;
  bytes: number;
  lines: number;
  lang: string;
  shard: string;
  source_url?: string;
  transport?: string;
};

export type AssimilateExclusion = {
  pattern: string;
  reason: string;
  count: number;
};

export type AssimilateShard = {
  id: string;
  key: string;
  files: number;
  bytes: number;
};

export type AssimilateManifest = {
  schema: 'assimilate/manifest@1';
  target: {
    input: string;
    kind: 'git' | 'web';
    transport: 'git-clone' | 'git-reuse' | 'web-fetch';
    root: string;
    remote: string;
    sha: string;
    acquired_at: string;
  };
  depth: AssimilateDepth;
  totals: {
    tracked: number;
    in_scope: number;
    excluded: number;
    bytes_in_scope: number;
  };
  exclusions: AssimilateExclusion[];
  shards: AssimilateShard[];
  files: AssimilateFileEntry[];
  budget: {
    shards: number;
    lenses: number;
    est_worker_dispatches: number;
    advisory: string | null;
  };
  transport_mix?: Record<string, number>;
  fetch_failures?: string[];
};

export type WorkerFinding = {
  claim?: string;
  path?: string;
  line?: number;
  evidence?: string;
  kind?: string;
};

export type WorkerReceipt = {
  path?: string;
  lines?: number;
  opening_quote?: string;
};

export type WorkerReturn = {
  shard?: string;
  lens?: string;
  sophistication?: number;
  findings?: WorkerFinding[];
  receipts?: WorkerReceipt[];
  notable?: string[];
  gaps?: string[];
  _source?: string;
};

export type CiteDropCode =
  | 'unanchored'
  | 'path_not_in_manifest'
  | 'path_ambiguous'
  | 'line_out_of_range'
  | 'evidence_missing'
  | 'evidence_too_short'
  | 'unverified_quote'
  | 'file_unreadable';

export type CiteResult = {
  schema: 'assimilate/validated@1';
  target: AssimilateManifest['target'];
  kept_findings: Array<WorkerFinding & { path: string; quote_match: 'exact' | 'lines'; _worker: string }>;
  verified_paths: string[];
  totals: {
    submitted: number;
    kept_findings: number;
    verified_files: number;
    dropped: number;
  };
  quote_match: { exact: number; lines: number };
  shortened_paths_resolved: number;
  dropped_by_code: Partial<Record<CiteDropCode, number>>;
  dropped: Array<{ worker: string; code: CiteDropCode; path?: string; claim: string }>;
  per_worker: Array<{ worker: string; submitted: number; kept: number; barren: boolean }>;
  barren_workers: string[];
};

export type CoverShard = {
  id: string;
  key: string;
  total: number;
  covered: number;
  uncovered: string[];
  ratio: number;
};

export type CoverResult = {
  schema: 'assimilate/coverage@1';
  target: AssimilateManifest['target'];
  floor: number;
  in_scope: number;
  verified_read: number;
  ratio: number;
  meets_floor: boolean;
  shards: CoverShard[];
  uncovered_shards: string[];
  uncovered_total: number;
  stray_verified_paths: string[];
};

export type AssimilationPhase =
  | 'acquire'
  | 'plan'
  | 'crawl'
  | 'cite'
  | 'cover'
  | 'synthesize'
  | 'persist';

export type AssimilationStreamEvent =
  | { type: 'plan'; sessionId: string; plan: AssimilationPlan }
  | {
      type: 'phase';
      sessionId: string;
      phase: AssimilationPhase;
      status: 'started' | 'completed' | 'failed';
      detail?: string;
    }
  | {
      type: 'worker';
      sessionId: string;
      id: string;
      kind: 'shard' | 'lens' | 'external' | 'synthesis';
      status: 'started' | 'completed' | 'barren' | 'redispatched';
    }
  | { type: 'ledger'; sessionId: string; ledger: CoverResult }
  | {
      type: 'report';
      sessionId: string;
      markdown: string;
      verdict: 'COMPLETE' | 'PARTIAL';
      documentId?: string;
    };

export type AssimilationPlan = {
  repositoryUrl: string;
  sha: string;
  root: string;
  depth: AssimilateDepth;
  inScope: number;
  excluded: number;
  shards: AssimilateShard[];
  lenses: string[];
  estimatedDispatches: number;
  exclusions: AssimilateExclusion[];
  advisory: string | null;
};
