#!/usr/bin/env bun
/**
 * holo — operator CLI for MK-VI migration tooling.
 * Sprint 02: catalog:verify | catalog:coverage | catalog:merges | catalog:reconcile | catalog:assets
 * Sprint 03: mcp:verify-manifest | mcp:manifest-schema | mcp:manifest-replay | mcp:list-mutations
 * Sprint 04: compat:spike [--json] [--print-trace]
 * Sprint 04 schema-1: db:status
 * Sprint 04 schema-2: db:migrate | db:probe | db:verify | db:push
 * Sprint 04 schema-4: repl:status
 * Sprint 05 service-1: service:up
 * Sprint 05 service-2: registry:list | registry:probe | verify:identity | verify:no-dup-validation
 * Sprint 05 service-3: manifest:resolve
 * Sprint 06 D01-04: secrets doctor | secrets:doctor | verify-no-convex-env
 * Sprint 06 D01-03: stack up | stack down | stack status | stack:up | stack:down | stack:status
 * Sprint 07 ledger-1: evidence:seed
 * Sprint 07 ledger-2: evidence:revise | db:probe --raw
 * Sprint 07 ledger-3: evidence:belief --as-of | evidence:register-doc
 * Sprint 08 infer-1: infer:call | verify:no-provider-refs
 * Sprint 08 infer-2: budget:status | budget:set
 * Sprint 08 infer-3: infer:degraded (status / poll) + DegradedModeController on fleet-down
 * Sprint 09 struct-1: extract --schema <name> --input <text>
 * Sprint 09 struct-2: probe:capabilities
 * Sprint 10 search-2: embed:run | embed:verify
 * Sprint 10 GATE-FIX: search | search --explain | search --surface | search:recall
 * Sprint 12 obs-1: mission run research --goal <text> [--json]
 */
import { resolve } from 'node:path';
import { z } from 'zod';

// Suppress unhandled storage errors for the PG-down negative control
// (PostgresStore logs these asynchronously; they must not crash the spike)
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (msg.includes('ECONNREFUSED') || msg.includes('MASTRA_STORAGE')) {
    // Expected during PG-down negative control — swallow
    return;
  }
  console.error('Unhandled rejection:', msg);
});

import { buildAssetInventory, formatAssetsText } from '../catalog/assets';
import { defaultCatalogPath, loadCatalog, type SourceCatalog } from '../catalog/catalog-loader';
import { buildCoverageReport, formatCoverageText } from '../catalog/coverage';
import { readExport } from '../catalog/export-reader';
import { buildMergesReport, formatMergesText } from '../catalog/merges';
import { buildReconcileReport, formatReconcileText } from '../catalog/reconcile';
import { buildVerifyReport, formatVerifyText } from '../catalog/verify';
import { buildMutationsReport, formatMutationsText } from '../mcp/list-mutations';
import { defaultManifestPath, loadManifest } from '../mcp/manifest-loader';
import { buildReplayReport, formatReplayText } from '../mcp/manifest-replay';
import { buildSchemaReport, formatSchemaText } from '../mcp/manifest-schema';
import {
  buildVerifyReport as buildManifestVerifyReport,
  buildProtocolReport,
  formatVerifyText as formatManifestVerifyText,
  formatProtocolText,
} from '../mcp/verify-manifest';

interface CliArgs {
  command: string;
  positional: string[];
  exportDir: string | null;
  catalogPath: string;
  manifestPath: string;
  fixturesDir: string | null;
  protocol: boolean;
  json: boolean;
  dryRun: boolean;
  printTrace: boolean;
  help: boolean;
  jsonbColumn: string | null;
  statusProbe: boolean;
  mergesVerify: boolean;
  indexesVerify: boolean;
  /** registry:probe --for=agent,workflow,mcp */
  forConsumers: string | null;
  /** db:probe --raw "<SQL>" */
  rawSql: string | null;
  /** evidence:revise flags */
  actor: string | null;
  runId: string | null;
  idempotencyKey: string | null;
  statement: string | null;
  confidence: string | null;
  validFrom: string | null;
  validTo: string | null;
  /** evidence:belief flags */
  claimId: string | null;
  asOf: string | null;
  /** infer:call flags */
  role: string | null;
  escape: boolean;
  highStakes: boolean;
  cost: string | null;
  reason: string | null;
  /** infer:call --escape: optional prompt for runBudgetedEscape */
  prompt: string | null;
  /** budget:set --ceiling */
  ceiling: string | null;
  /** extract flags */
  schema: string | null;
  input: string | null;
  /** extract --fixture <name> (mutually exclusive with --schema/--input) */
  fixture: string | null;
  /** probe:capabilities flags */
  timeout: string | null;
  /** search flags */
  explain: boolean;
  surface: string | null;
  golden: string | null;
  limit: string | null;
  /** queue:enqueue --lane <interactive|background> */
  lane: string | null;
  /** queue:effect --boundary <before-commit|after-commit-before-enqueue|after-dispatch-before-ack> */
  boundary: string | null;
  /** queue:poison --max-attempts <n> */
  maxAttempts: string | null;
  /** mission run research --goal <text> */
  goal: string | null;
  /** evals:run --sample known-good|deliberately-bad */
  sample: string | null;
  /** evals:run / evals:drift --dataset <version> */
  dataset: string | null;
  /** evals:run --judge-endpoint (fail-closed probe override) */
  judgeEndpoint: string | null;
}

function printHelp(): void {
  console.log(`holo — holocron operator CLI

Usage:
  bun services/platform/src/cli/holo.ts <command> [options]

  Commands:
  catalog:verify        Coverage build-gate (60/60 tables + fields + storage refs)
  catalog:coverage      Per-field + per-storage-ref mapping with owner/approval
  catalog:merges        Business 12→3 + research 5→3 collapse proof
  catalog:reconcile     Per-table source vs expected-target; unexplained variance
  catalog:assets        Per-object retained storage inventory (sha256/bytes/mime)
  mcp:verify-manifest   44/44 tool completeness gate (manifest ↔ live registry cross-check)
  mcp:manifest-schema   Print a tool's input/output schema + defaults from the manifest
  mcp:manifest-replay   Print a tool's idempotency key + stored result from the manifest
  mcp:list-mutations    List all mutation tools (non-null side_effects)
  compat:spike          Run 5-cell compatibility matrix (agent+tool+workflow+MCP+OTel)
  db:status             Show Postgres connection facts
  db:migrate            Apply Drizzle migrations against DATABASE_URL (≥55 tables)
  db:probe              Live probes: --jsonb cardData | --status | --raw "<SQL>"
  db:verify             Live verify: --merges | --indexes
  db:push               Push Drizzle schema (dev convenience; prefer db:migrate)
  repl:status           CAP-SYNC-01: wal_level + zero_pub membership + replica identity
  service:up            Boot Mastra composition root + Hono on :4111 (PORT/HOLO_PORT)
  registry:list         List shared tool registry (≥44 tools with Zod schemas)
  registry:probe <id>   Probe a tool's Zod input/output schema (aliases: search, searchTool)
  verify:identity <id>  Prove agent/workflow/MCP share the same Zod instance (===)
  verify:no-dup-validation  Audit zero Zod .parse/.safeParse outside the shared registry
  manifest:resolve <role>  Resolve a Fleet Role Manifest role to a live :4545 endpoint
  secrets doctor            Resolve required keys from consolidated secrets (env + secrets.yaml)
  secrets:doctor            Alias for secrets doctor
  verify-no-convex-env      T-PLAT-017 build gate: fail if Convex env aliases remain
  stack up                  Launch Postgres + Mastra (launchd) and wait healthy (≤60s)
  stack down                Stop stack services; zero orphaned holocron PIDs
  stack status              Honest health (postgres/mastra/scheduler/zero_cache/embed)
  stack:up | stack:down | stack:status
                            Colon-form aliases for stack commands
  evidence:seed             Seed claim + 2 contradicting passages + relations + open belief
  evidence:revise <id>      Temporal revise via SECURITY DEFINER revise_belief(...)
  evidence:belief           As-of belief + net-support for a claim (--claim-id, --as-of)
  evidence:register-doc <id>
                            Register internal doc as self-sourced source (reuse passages)
  infer:call                Resolve fleet role; --escape runs budgeted Claude escape
                            (checkBudget → generateText → logEscape); fleet-down → degraded
  infer:degraded            Show / poll degraded-mode state (fleet-down reduced mode)
  verify:no-provider-refs   Audit platform src for banned claudeFlash/Pro/Ultra factories
  budget:status             Show escape budget spent / remaining / ceiling (real Postgres)
  budget:set                Set escape budget ceiling (--ceiling <usd>)
  telemetry:tail            Tail durable inference_telemetry rows (--run-id, --json)
  extract                   Extract structured data with Zod validation --schema <name> --input <text>
   extract:status <id>       Query extraction status by id (pending|success|extraction_failed|blocked)
  probe:capabilities        Probe all fleet roles for json_schema structured-output support
  embed:run                 Idempotent re-embed: WHERE embedding IS NULL … SKIP LOCKED (document mode)
  embed:verify              Report NULL / wrong-dimension passage embedding counts (expect 1024)
  search <query>            RRF hybrid search (pgvector HNSW + FTS, one round-trip)
  search:recall             Recall@k vs baseline from --golden set.json
  mission run research      Run a research mission with per-run Langfuse trace export
                            (requires --goal; flushes OTel → self-hosted Langfuse)
  evals:run                 Score a versioned fixture sample via local judge (--sample)
  evals:drift               Longitudinal drift over persisted eval_scores (--dataset)
  evals:ci                  Fail-closed CI gate: threshold + deterministic invariants (--fixture)

Options:
  --export <dir>        Path to unzipped convex export (or $CONVEX_EXPORT_DIR)
  --catalog <file>      Path to 12-convex-source-catalog.yaml
  --manifest <file>     Path to 14-mcp-compatibility-manifest.yaml (mcp:* commands)
  --fixtures-dir <dir>  Path to fixtures directory (mcp:verify-manifest, overrides default)
  --protocol            (mcp:verify-manifest) print protocol pin summary
  --jsonb <column>      (db:probe) polymorphic jsonb round-trip column (e.g. cardData)
  --status              (db:probe) status CHECK constraint probe
  --raw <sql>           (db:probe) execute SQL as holocron_app (permission probes)
  --merges              (db:verify) assert analysis/research merge collapse
  --indexes             (db:verify) assert HNSW/GIN/btree indexes + search_vector
  --for <consumers>     (registry:probe) comma list: agent,workflow,mcp
  --actor <name>        (evidence:revise) actor recorded on successor
  --run-id <id>         (evidence:revise) run id recorded on successor
  --idempotency-key <k> (evidence:revise) idempotency key (replay-safe)
  --statement <text>    (evidence:revise) new belief statement
  --confidence <n>      (evidence:revise) new confidence (0..1)
  --valid-from <ts>     (evidence:revise) optional valid_from timestamptz
  --valid-to <ts>       (evidence:revise) optional valid_to timestamptz
  --claim-id <id>       (evidence:belief) claim id to query
  --as-of <ts|now>      (evidence:belief) transaction-time as-of (default: now)
  --role <role>         (infer:call|infer:degraded) fleet role: divergent|convergent|judge|embed|rerank
  --escape              (infer:call) budgeted Claude escape via runBudgetedEscape
  --highStakes          (infer:call) alias for --escape (high-stakes step)
  --cost <usd>          (infer:call) estimated escape cost USD for budget pre-check
  --reason <text>       (infer:call) escape reason for audit trail
  --prompt <text>       (infer:call --escape) prompt for real Anthropic generateText
  --run-id <id>         (infer:call --escape / evidence:revise / telemetry:tail) run id
  --ceiling <usd>       (budget:set) escape budget ceiling in USD
  --schema <name>       (extract) schema name: simple|nested|tripwire
  --input <text>        (extract) input text or file path
  --fixture <name>      (extract) documented fixture entry point (mutually exclusive with --schema/--input)
                        good | malformed-once | always-malformed | tripwire
  --timeout <ms>        (probe:capabilities) timeout per role probe in ms (default 45000)
  --poll                (infer:degraded) run one real health probe (may auto-resume)
  --explain             (search) include RRF fusion explain payload (method, k, legs, scores)
  --surface <name>      (search) inline-HNSW surface KNN (research_findings|research_iterations|
                        subscription_content|toolbelt_tools|improvement_requests)
  --golden <path>       (search:recall) golden set JSON for recall@k evaluation
  --limit <n>           (search|search:recall|telemetry:tail) max results / rows (default 10 / 100)
  --goal <text>         (mission run research) research mission goal (required)
  --sample <id>         (evals:run) fixture sample: known-good | deliberately-bad
  --dataset <version>   (evals:run|evals:drift) dataset version (default research_v1)
  --judge-endpoint <url>(evals:run) override judge health endpoint (fail-closed tests)
  --fixture <name>      (evals:ci) known-good | deliberately-bad |
                        deterministic-invariant-regression | invalid-config
  --json                Emit JSON instead of text
  --print-trace         (compat:spike) emit OTel trace details
  --dry-run             (catalog:reconcile) dry-run mode (default)
  -h, --help            Show help
`);
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: '',
    positional: [],
    exportDir: process.env.CONVEX_EXPORT_DIR ?? null,
    catalogPath: defaultCatalogPath(),
    manifestPath: defaultManifestPath(),
    fixturesDir: null,
    protocol: false,
    json: false,
    dryRun: true,
    printTrace: false,
    help: false,
    jsonbColumn: null,
    statusProbe: false,
    mergesVerify: false,
    indexesVerify: false,
    forConsumers: null,
    rawSql: null,
    actor: null,
    runId: null,
    idempotencyKey: null,
    statement: null,
    confidence: null,
    validFrom: null,
    validTo: null,
    claimId: null,
    asOf: null,
    role: null,
    escape: false,
    highStakes: false,
    cost: null,
    reason: null,
    prompt: null,
    ceiling: null,
    schema: null,
    input: null,
    fixture: null,
    timeout: null,
    explain: false,
    surface: null,
    golden: null,
    limit: null,
    lane: null,
    boundary: null,
    maxAttempts: null,
    goal: null,
    sample: null,
    dataset: null,
    judgeEndpoint: null,
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      args.help = true;
    } else if (a === '--json') {
      args.json = true;
    } else if (a === '--goal') {
      args.goal = argv[++i] ?? null;
    } else if (a.startsWith('--goal=')) {
      args.goal = a.slice('--goal='.length);
    } else if (a === '--sample') {
      args.sample = argv[++i] ?? null;
    } else if (a.startsWith('--sample=')) {
      args.sample = a.slice('--sample='.length);
    } else if (a === '--dataset') {
      args.dataset = argv[++i] ?? null;
    } else if (a.startsWith('--dataset=')) {
      args.dataset = a.slice('--dataset='.length);
    } else if (a === '--judge-endpoint') {
      args.judgeEndpoint = argv[++i] ?? null;
    } else if (a.startsWith('--judge-endpoint=')) {
      args.judgeEndpoint = a.slice('--judge-endpoint='.length);
    } else if (a === '--explain') {
      args.explain = true;
    } else if (a === '--surface') {
      args.surface = argv[++i] ?? null;
    } else if (a.startsWith('--surface=')) {
      args.surface = a.slice('--surface='.length);
    } else if (a === '--golden') {
      args.golden = argv[++i] ?? null;
    } else if (a.startsWith('--golden=')) {
      args.golden = a.slice('--golden='.length);
    } else if (a === '--limit') {
      args.limit = argv[++i] ?? null;
    } else if (a.startsWith('--limit=')) {
      args.limit = a.slice('--limit='.length);
    } else if (a === '--lane') {
      args.lane = argv[++i] ?? null;
    } else if (a.startsWith('--lane=')) {
      args.lane = a.slice('--lane='.length);
    } else if (a === '--boundary') {
      args.boundary = argv[++i] ?? null;
    } else if (a.startsWith('--boundary=')) {
      args.boundary = a.slice('--boundary='.length);
    } else if (a === '--max-attempts') {
      args.maxAttempts = argv[++i] ?? null;
    } else if (a.startsWith('--max-attempts=')) {
      args.maxAttempts = a.slice('--max-attempts='.length);
    } else if (a === '--dry-run') {
      args.dryRun = true;
    } else if (a === '--protocol') {
      args.protocol = true;
    } else if (a === '--print-trace') {
      args.printTrace = true;
    } else if (a === '--status') {
      args.statusProbe = true;
    } else if (a === '--merges') {
      args.mergesVerify = true;
    } else if (a === '--indexes') {
      args.indexesVerify = true;
    } else if (a === '--jsonb') {
      args.jsonbColumn = argv[++i] ?? null;
    } else if (a.startsWith('--jsonb=')) {
      args.jsonbColumn = a.slice('--jsonb='.length);
    } else if (a === '--raw') {
      args.rawSql = argv[++i] ?? null;
    } else if (a.startsWith('--raw=')) {
      args.rawSql = a.slice('--raw='.length);
    } else if (a === '--actor') {
      args.actor = argv[++i] ?? null;
    } else if (a.startsWith('--actor=')) {
      args.actor = a.slice('--actor='.length);
    } else if (a === '--run-id') {
      args.runId = argv[++i] ?? null;
    } else if (a.startsWith('--run-id=')) {
      args.runId = a.slice('--run-id='.length);
    } else if (a === '--idempotency-key') {
      args.idempotencyKey = argv[++i] ?? null;
    } else if (a.startsWith('--idempotency-key=')) {
      args.idempotencyKey = a.slice('--idempotency-key='.length);
    } else if (a === '--statement') {
      args.statement = argv[++i] ?? null;
    } else if (a.startsWith('--statement=')) {
      args.statement = a.slice('--statement='.length);
    } else if (a === '--confidence') {
      args.confidence = argv[++i] ?? null;
    } else if (a.startsWith('--confidence=')) {
      args.confidence = a.slice('--confidence='.length);
    } else if (a === '--valid-from') {
      args.validFrom = argv[++i] ?? null;
    } else if (a.startsWith('--valid-from=')) {
      args.validFrom = a.slice('--valid-from='.length);
    } else if (a === '--valid-to') {
      args.validTo = argv[++i] ?? null;
    } else if (a.startsWith('--valid-to=')) {
      args.validTo = a.slice('--valid-to='.length);
    } else if (a === '--claim-id') {
      args.claimId = argv[++i] ?? null;
    } else if (a.startsWith('--claim-id=')) {
      args.claimId = a.slice('--claim-id='.length);
    } else if (a === '--as-of') {
      args.asOf = argv[++i] ?? null;
    } else if (a.startsWith('--as-of=')) {
      args.asOf = a.slice('--as-of='.length);
    } else if (a === '--role') {
      args.role = argv[++i] ?? null;
    } else if (a.startsWith('--role=')) {
      args.role = a.slice('--role='.length);
    } else if (a === '--escape') {
      args.escape = true;
    } else if (a === '--highStakes' || a === '--high-stakes') {
      args.highStakes = true;
      args.escape = true;
    } else if (a === '--cost') {
      args.cost = argv[++i] ?? null;
    } else if (a.startsWith('--cost=')) {
      args.cost = a.slice('--cost='.length);
    } else if (a === '--reason') {
      args.reason = argv[++i] ?? null;
    } else if (a.startsWith('--reason=')) {
      args.reason = a.slice('--reason='.length);
    } else if (a === '--prompt') {
      args.prompt = argv[++i] ?? null;
    } else if (a.startsWith('--prompt=')) {
      args.prompt = a.slice('--prompt='.length);
    } else if (a === '--ceiling') {
      args.ceiling = argv[++i] ?? null;
    } else if (a.startsWith('--ceiling=')) {
      args.ceiling = a.slice('--ceiling='.length);
    } else if (a === '--schema') {
      args.schema = argv[++i] ?? null;
    } else if (a.startsWith('--schema=')) {
      args.schema = a.slice('--schema='.length);
    } else if (a === '--input') {
      args.input = argv[++i] ?? null;
    } else if (a.startsWith('--input=')) {
      args.input = a.slice('--input='.length);
    } else if (a === '--fixture') {
      args.fixture = argv[++i] ?? null;
    } else if (a.startsWith('--fixture=')) {
      args.fixture = a.slice('--fixture='.length);
    } else if (a === '--timeout') {
      args.timeout = argv[++i] ?? null;
    } else if (a.startsWith('--timeout=')) {
      args.timeout = a.slice('--timeout='.length);
    } else if (a === '--for') {
      args.forConsumers = argv[++i] ?? null;
    } else if (a.startsWith('--for=')) {
      args.forConsumers = a.slice('--for='.length);
    } else if (a === '--export') {
      args.exportDir = argv[++i] ?? null;
    } else if (a === '--catalog') {
      args.catalogPath = resolve(argv[++i] ?? args.catalogPath);
    } else if (a === '--manifest') {
      args.manifestPath = resolve(argv[++i] ?? args.manifestPath);
    } else if (a === '--fixtures-dir') {
      args.fixturesDir = resolve(argv[++i] ?? '');
    } else if (a.startsWith('--export=')) {
      args.exportDir = a.slice('--export='.length);
    } else if (a.startsWith('--catalog=')) {
      args.catalogPath = resolve(a.slice('--catalog='.length));
    } else if (a.startsWith('--manifest=')) {
      args.manifestPath = resolve(a.slice('--manifest='.length));
    } else if (a.startsWith('--fixtures-dir=')) {
      args.fixturesDir = resolve(a.slice('--fixtures-dir='.length));
    } else if (a.startsWith('-')) {
      console.error(`unknown flag: ${a}`);
      process.exit(2);
    } else {
      positional.push(a);
    }
  }
  args.command = positional[0] ?? '';
  args.positional = positional;
  return args;
}

function requireExport(exportDir: string | null): string {
  if (!exportDir) {
    console.error('error: --export <dir> or CONVEX_EXPORT_DIR is required for this command');
    process.exit(2);
  }
  return resolve(exportDir);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.command) {
    printHelp();
    process.exit(args.help ? 0 : 2);
  }

  // Only catalog:* needs the source catalog; service/db/mcp/compat skip the load.
  const needsCatalog = args.command.startsWith('catalog:');
  const catalog: SourceCatalog | null = needsCatalog ? loadCatalog(args.catalogPath) : null;

  // For catalog commands, catalog is guaranteed non-null (loaded above when needsCatalog).
  // TypeScript needs the assertion because the switch is flat.
  const cat = catalog as SourceCatalog;

  switch (args.command) {
    case 'catalog:verify': {
      // Prefer export cross-check; if no export, still validate catalog self-consistency
      // but fail closed if export is expected for completeness.
      const exp = args.exportDir ? readExport(requireExport(args.exportDir)) : null;
      // When no export provided, still run catalog-only checks (tables/fields/storage).
      // Human gate and integration tests always pass --export.
      const report = buildVerifyReport(cat, exp);
      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatVerifyText(report));
      }
      // Also emit concise summary on stderr when failing so negative controls can match names
      if (!report.ok) {
        for (const issue of report.issues) {
          console.error(issue.message);
        }
      }
      process.exit(report.ok ? 0 : 1);
      break;
    }
    case 'catalog:coverage': {
      const report = buildCoverageReport(cat);
      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatCoverageText(report));
      }
      if (!report.ok) {
        for (const u of report.unmapped) {
          console.error(`unmapped: ${u}`);
        }
      }
      process.exit(report.ok ? 0 : 1);
      break;
    }
    case 'catalog:merges': {
      const report = buildMergesReport(cat);
      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatMergesText(report));
      }
      process.exit(report.ok ? 0 : 1);
      break;
    }
    case 'catalog:reconcile': {
      const exportDir = requireExport(args.exportDir);
      const exp = readExport(exportDir);
      const report = buildReconcileReport(cat, exp);
      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatReconcileText(report));
      }
      if (!report.ok) {
        for (const row of report.tables.filter((r) => r.unexplained)) {
          console.error(
            `${row.table}: expected=${row.expected_target} actual=${row.source_count} variance=${row.variance} (unexplained)`
          );
        }
      }
      process.exit(report.ok ? 0 : 1);
      break;
    }
    case 'catalog:assets': {
      const exportDir = requireExport(args.exportDir);
      const exp = readExport(exportDir);
      const inv = buildAssetInventory(cat, exp);
      if (args.json) {
        console.log(JSON.stringify(inv, null, 2));
      } else {
        console.log(formatAssetsText(inv));
      }
      process.exit(inv.ok ? 0 : 1);
      break;
    }
    case 'mcp:verify-manifest': {
      const manifest = loadManifest(args.manifestPath);
      if (args.protocol) {
        const protoReport = buildProtocolReport(manifest);
        console.log(formatProtocolText(protoReport));
        if (!protoReport.ok) {
          console.error('protocol coverage incomplete');
        }
        process.exit(protoReport.ok ? 0 : 1);
      }
      const fixturesDir =
        args.fixturesDir ?? resolve(process.cwd(), 'services/platform/tests/fixtures/mcp-manifest');
      const report = buildManifestVerifyReport(manifest, {
        manifestPath: args.manifestPath,
        fixturesDir,
      });
      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatManifestVerifyText(report));
      }
      if (!report.ok) {
        for (const issue of report.issues) {
          console.error(issue.message);
        }
      }
      process.exit(report.ok ? 0 : 1);
      break;
    }
    case 'mcp:manifest-schema': {
      const toolId = args.positional[1];
      if (!toolId) {
        console.error('error: mcp:manifest-schema requires a tool ID argument');
        process.exit(2);
      }
      const manifest = loadManifest(args.manifestPath);
      const report = buildSchemaReport(manifest, toolId);
      if (!report.found) {
        console.error(`tool not found: ${toolId}`);
        process.exit(1);
      }
      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatSchemaText(report));
      }
      process.exit(0);
      break;
    }
    case 'mcp:manifest-replay': {
      const toolId = args.positional[1];
      if (!toolId) {
        console.error('error: mcp:manifest-replay requires a tool ID argument');
        process.exit(2);
      }
      const manifest = loadManifest(args.manifestPath);
      const fixturesDir = resolve(process.cwd(), 'services/platform/tests/fixtures/mcp-manifest');
      const report = buildReplayReport(manifest, toolId, fixturesDir);
      if (!report.found) {
        console.error(`tool not found: ${toolId}`);
        process.exit(1);
      }
      if (!report.has_replay) {
        console.error(`no replay contract for: ${toolId}`);
        process.exit(1);
      }
      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatReplayText(report));
      }
      process.exit(0);
      break;
    }
    case 'mcp:list-mutations': {
      const manifest = loadManifest(args.manifestPath);
      const report = buildMutationsReport(manifest);
      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatMutationsText(report));
      }
      process.exit(0);
      break;
    }
    case 'compat:spike': {
      const { runSpike, formatMatrix, formatJson } = await import('../compat/spike.ts');

      // Suppress unhandled storage errors when PG is down (negative control)
      const origExit = process.exit;

      let result: Awaited<ReturnType<typeof runSpike>>;
      try {
        result = await runSpike();
      } catch {
        // If runSpike itself throws (e.g., unhandled storage error),
        // produce a fail-closed result
        result = {
          ok: false,
          runtime: {
            bun: (globalThis as unknown as { Bun?: { version: string } }).Bun?.version ?? 'unknown',
          },
          cells: {
            agent: { status: 'red' },
            tool: { status: 'red' },
            workflow: { status: 'red', detail: 'storage init failed' },
            mcp: { status: 'red' },
            otel: { status: 'red', detail: 'storage init failed' },
          },
          versions: {},
          cloudRequests: 0,
        };
      }

      if (args.json) {
        console.log(formatJson(result));
      } else {
        console.log(formatMatrix(result));
        if (args.printTrace && result.traceId) {
          console.log(`\n  --- OTel Trace ---`);
          console.log(`  traceId: ${result.traceId}`);
          console.log(`  spans:   ${result.otelSpans ?? 0}`);
        }
      }

      origExit.call(process, result.ok ? 0 : 1);
      break;
    }
    case 'db:status': {
      const { postgresConnectionFacts, resolveDatabaseUrl, countPublicTables } = await import(
        '../db/index.ts'
      );
      const url = resolveDatabaseUrl({ preferHolocron: true });
      let tableCount: number | null = null;
      let tableCountError: string | null = null;
      try {
        tableCount = await countPublicTables(url);
      } catch (err) {
        tableCountError = err instanceof Error ? err.message : String(err);
      }
      const payload = {
        ok: tableCountError === null,
        databaseUrl: url,
        facts: postgresConnectionFacts,
        tableCount,
        tableCountError,
        note: 'schema-2 domain migrations via holo db:migrate. See docs/postgres-provisioning.md.',
      };
      if (args.json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        console.log('holo db:status — Postgres connection facts');
        console.log(`  DATABASE_URL:     ${url}`);
        console.log(`  engine:           ${postgresConnectionFacts.engine}`);
        console.log(`  required major:   ${postgresConnectionFacts.majorVersionRequired}`);
        console.log(`  port:             ${postgresConnectionFacts.port}`);
        console.log(`  app database:     ${postgresConnectionFacts.databases.app}`);
        console.log(`  wal_level:        ${postgresConnectionFacts.walLevelRequired} (required)`);
        console.log(`  extensions:       vector + native FTS`);
        console.log(`  auth:             ${postgresConnectionFacts.authModel}`);
        console.log(`  public tables:    ${tableCount ?? `error: ${tableCountError}`}`);
        console.log(`  docs:             ${postgresConnectionFacts.provisioningDoc}`);
        console.log(`  note:             ${payload.note}`);
      }
      process.exit(payload.ok ? 0 : 1);
      break;
    }
    case 'db:migrate': {
      const { applyMigrations } = await import('../db/index.ts');
      const result = await applyMigrations();
      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('holo db:migrate — apply Drizzle domain migrations');
        for (const m of result.messages) console.log(`  ${m}`);
        console.log(`  migrations applied: ${result.migrationsApplied.length}`);
        console.log(`  already applied:    ${result.alreadyApplied.length}`);
        console.log(`  tables created:     ${result.tableCount}`);
        console.log(
          `  domain tables:      ${result.domainTablesPresent}/${result.domainTablesPresent + result.missingTables.length}`
        );
        if (result.errors.length) {
          console.log('  errors:');
          for (const e of result.errors) console.log(`    - ${e}`);
        } else {
          console.log('  0 errors');
        }
        console.log(result.ok ? '  status: OK' : '  status: FAIL');
      }
      process.exit(result.ok ? 0 : 1);
      break;
    }
    case 'db:probe': {
      if (args.rawSql) {
        const { probeRawSql } = await import('../db/evidence/index.ts');
        const result = await probeRawSql(args.rawSql);
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('holo db:probe --raw');
          console.log(result.report);
          if (result.permissionDenied) {
            console.log('  must_observe: ERROR 42501 permission denied');
          }
          console.log(result.ok ? '  status: OK' : '  status: FAIL');
        }
        process.exit(result.ok ? 0 : 1);
      }
      const { probeJsonbCardData, probeStatusCheck } = await import('../db/index.ts');
      if (args.jsonbColumn) {
        if (args.jsonbColumn !== 'cardData' && args.jsonbColumn !== 'card_data') {
          console.error(
            `error: db:probe --jsonb currently supports cardData (got ${args.jsonbColumn})`
          );
          process.exit(2);
        }
        const result = await probeJsonbCardData();
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('holo db:probe --jsonb cardData');
          for (const m of result.messages) console.log(`  ${m}`);
          console.log(`  table: ${result.table}`);
          console.log(`  column: card_data`);
          console.log(`  structural equality: ${result.structuralEquality}`);
          console.log(`  payload matches: ${result.structuralEquality}`);
          if (result.errors.length) {
            for (const e of result.errors) console.error(`  error: ${e}`);
          }
          console.log(result.ok ? '  status: OK' : '  status: FAIL');
        }
        process.exit(result.ok ? 0 : 1);
      }
      if (args.statusProbe) {
        const result = await probeStatusCheck();
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('holo db:probe --status');
          for (const m of result.messages) console.log(`  ${m}`);
          if (result.errors.length) {
            for (const e of result.errors) console.error(`  error: ${e}`);
          }
          console.log(result.ok ? '  status: OK' : '  status: FAIL');
        }
        process.exit(result.ok ? 0 : 1);
      }
      console.error('error: db:probe requires --jsonb <column>, --status, or --raw <sql>');
      process.exit(2);
      break;
    }
    case 'db:verify': {
      if (!args.mergesVerify && !args.indexesVerify) {
        console.error('error: db:verify requires --merges or --indexes');
        process.exit(2);
      }
      if (args.indexesVerify) {
        const { verifyIndexes } = await import('../db/index.ts');
        const result = await verifyIndexes();
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('holo db:verify --indexes');
          for (const m of result.messages) console.log(`  ${m}`);
          if (result.errors.length) {
            for (const e of result.errors) console.error(`  error: ${e}`);
          }
          console.log(result.ok ? '  status: OK' : '  status: FAIL');
        }
        process.exit(result.ok ? 0 : 1);
      }
      const { verifyMerges } = await import('../db/index.ts');
      const result = await verifyMerges();
      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('holo db:verify --merges');
        for (const m of result.messages) console.log(`  ${m}`);
        if (result.errors.length) {
          for (const e of result.errors) console.error(`  error: ${e}`);
        }
        console.log(result.ok ? '  status: OK' : '  status: FAIL');
      }
      process.exit(result.ok ? 0 : 1);
      break;
    }
    case 'db:push': {
      const msg =
        'db:push is intentionally not the primary path — use `holo db:migrate` to apply versioned SQL migrations.';
      if (args.json) {
        console.log(JSON.stringify({ ok: false, command: 'db:push', error: msg }, null, 2));
      } else {
        console.error(msg);
      }
      process.exit(2);
      break;
    }
    case 'repl:status': {
      const { getReplStatus, formatReplStatusText } = await import('../db/index.ts');
      const result = await getReplStatus();
      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatReplStatusText(result));
      }
      process.exit(result.ok ? 0 : 1);
      break;
    }
    case 'service:up': {
      const { startService, resolvePort, DEFAULT_PORT } = await import('../index.ts');
      const port = resolvePort();
      // AC-3: exact banner string uses :4111 default; include resolved port when overridden.
      if (port === DEFAULT_PORT) {
        console.log('Starting Mastra service on :4111');
      } else {
        console.log(`Starting Mastra service on :${port}`);
      }
      // startService also logs Starting/Listening; pass log:false for Starting to avoid dup,
      // but AC requires both "Starting Mastra service on :4111" and a "Listening" line — keep Listening.
      await startService({ port, log: false });
      console.log(`Listening on :${port}`);
      // Keep process alive (Hono/Bun.serve owns the event loop).
      await new Promise<void>(() => {});
      break;
    }
    case 'registry:list': {
      const { listTools, toolCount } = await import('../tools/registry.ts');
      const tools = listTools();
      const rows = tools.map((t) => ({
        id: t.id,
        description: t.description,
        inputSchema: {
          propertyCount: t.inputPropertyCount,
          present: true,
        },
        outputSchema: {
          propertyCount: t.outputPropertyCount,
          present: true,
        },
      }));
      const payload = {
        ok: tools.length >= 44,
        count: toolCount(),
        tools: rows,
      };
      // Always emit a JSON array so `holo registry:list | jq 'length'` works (AC gate).
      // With --json false still array; human summary goes to stderr when not --json.
      console.log(JSON.stringify(rows, null, 2));
      if (!args.json) {
        console.error(
          `holo registry:list — ${payload.count} tools (need ≥44) ${payload.ok ? 'OK' : 'FAIL'}`
        );
      }
      process.exit(payload.ok ? 0 : 1);
      break;
    }
    case 'registry:probe': {
      const toolId = args.positional[1];
      if (!toolId) {
        console.error(
          'error: registry:probe requires a tool id (e.g. search, hybrid_search, searchTool)'
        );
        process.exit(2);
      }
      const {
        probeToolSchema,
        getSchemaForAgent,
        getSchemaForWorkflow,
        getSchemaForMcp,
        getToolSchema,
        resolveToolId,
      } = await import('../tools/registry.ts');
      let probe: ReturnType<typeof probeToolSchema>;
      try {
        probe = probeToolSchema(toolId);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
        return;
      }
      const consumers = (args.forConsumers ?? 'agent,workflow,mcp')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const consumerSchemas: Record<string, { inputSame: boolean; outputSame: boolean }> = {};
      const baseSchemas = getToolSchema(toolId);
      for (const c of consumers) {
        const getter =
          c === 'agent'
            ? getSchemaForAgent
            : c === 'workflow'
              ? getSchemaForWorkflow
              : c === 'mcp'
                ? getSchemaForMcp
                : null;
        if (!getter) {
          console.error(`unknown consumer in --for: ${c}`);
          process.exit(2);
        }
        const s = getter(toolId);
        consumerSchemas[c] = {
          inputSame: s.inputSchema === baseSchemas.inputSchema,
          outputSame: s.outputSchema === baseSchemas.outputSchema,
        };
      }
      const payload = {
        ...probe,
        consumers: consumerSchemas,
        resolvedId: resolveToolId(toolId),
      };
      if (args.json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        console.log(`holo registry:probe ${toolId}`);
        console.log(`  resolvedId: ${payload.resolvedId}`);
        console.log(`  description: ${payload.description}`);
        console.log(
          `  inputSchema: type=${payload.inputSchema.type} properties=[${payload.inputSchema.properties.join(', ')}] count=${payload.inputSchema.propertyCount}`
        );
        console.log(
          `  outputSchema: type=${payload.outputSchema.type} properties=[${payload.outputSchema.properties.join(', ')}] count=${payload.outputSchema.propertyCount}`
        );
        for (const [c, v] of Object.entries(consumerSchemas)) {
          console.log(`  consumer.${c}: inputSame=${v.inputSame} outputSame=${v.outputSame}`);
        }
        // Print Zod-like JSON object for AC "prints a Zod schema JSON object"
        console.log(
          JSON.stringify(
            {
              inputSchema: payload.inputSchema,
              outputSchema: payload.outputSchema,
            },
            null,
            2
          )
        );
      }
      process.exit(0);
      break;
    }
    case 'verify:identity': {
      const toolId = args.positional[1];
      if (!toolId) {
        console.error('error: verify:identity requires a tool id (e.g. search)');
        process.exit(2);
      }
      const { getSchemasForAllConsumers, resolveToolId } = await import('../tools/registry.ts');
      let result: ReturnType<typeof getSchemasForAllConsumers>;
      try {
        result = getSchemasForAllConsumers(toolId);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
        return;
      }
      const payload = {
        toolId,
        resolvedId: resolveToolId(toolId),
        identity: result.identity,
        consumers: 3,
        uniqueInstances: result.identity ? 1 : 3,
      };
      // Always JSON so `holo verify:identity search | jq '.identity'` works (AC gate).
      console.log(JSON.stringify(payload, null, 2));
      if (!args.json) {
        console.error(
          `holo verify:identity ${toolId} identity:${payload.identity} ${payload.identity ? 'OK' : 'FAIL'}`
        );
      }
      process.exit(payload.identity ? 0 : 1);
      break;
    }
    case 'verify:no-dup-validation': {
      const { auditNoDupValidation } = await import('../tools/registry.ts');
      const report = auditNoDupValidation();
      const payload = {
        ok: report.ok,
        duplicates: report.duplicates,
        sites: report.sites,
        scannedCount: report.scanned.length,
      };
      // Always JSON so `holo verify:no-dup-validation | jq '.duplicates'` works (AC gate).
      console.log(JSON.stringify(payload, null, 2));
      if (!args.json) {
        console.error(
          `holo verify:no-dup-validation duplicates:${payload.duplicates} ${payload.ok ? 'OK' : 'FAIL'}`
        );
      }
      process.exit(payload.ok ? 0 : 1);
      break;
    }
    case 'manifest:resolve': {
      const role = args.positional[1];
      if (!role) {
        console.error(
          'error: manifest:resolve requires a role (e.g. divergent, convergent, judge, embed, rerank)'
        );
        process.exit(2);
      }
      const { resolveModel, UnknownFleetRoleError, RoleUnavailableError } = await import(
        '../inference/resolve-model.ts'
      );
      try {
        const resolved = await resolveModel(role);
        // Always JSON so `holo manifest:resolve divergent | jq '.endpoint'` works (AC gate).
        console.log(JSON.stringify(resolved, null, 2));
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code =
          err instanceof UnknownFleetRoleError
            ? 'UNKNOWN_ROLE'
            : err instanceof RoleUnavailableError
              ? 'ROLE_UNAVAILABLE'
              : 'RESOLVE_FAILED';
        const payload = {
          ok: false,
          error: code,
          role,
          message: msg,
        };
        console.error(JSON.stringify(payload, null, 2));
        process.exit(1);
      }
      break;
    }
    case 'secrets': {
      // Space form: `holo secrets doctor` (D01-04 verify gate + RED harness)
      const sub = args.positional[1];
      if (sub !== 'doctor') {
        console.error(
          sub ? `unknown command: secrets ${sub}` : 'error: secrets requires a subcommand (doctor)'
        );
        console.error('Usage: holo secrets doctor');
        process.exit(2);
      }
      const { runSecretsDoctor, formatDoctorText } = await import('../config/secrets.ts');
      const report = runSecretsDoctor();
      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatDoctorText(report));
      }
      process.exit(report.ok ? 0 : 1);
      break;
    }
    case 'secrets:doctor': {
      // Colon form alias for operators used to catalog:verify style commands
      const { runSecretsDoctor, formatDoctorText } = await import('../config/secrets.ts');
      const report = runSecretsDoctor();
      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatDoctorText(report));
      }
      process.exit(report.ok ? 0 : 1);
      break;
    }
    case 'verify-no-convex-env': {
      const { verifyNoConvexEnv, formatVerifyNoConvexEnvText } = await import(
        '../config/verify-no-convex-env.ts'
      );
      const report = verifyNoConvexEnv();
      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatVerifyNoConvexEnvText(report));
      }
      process.exit(report.ok ? 0 : 1);
      break;
    }
    case 'stack': {
      // Space form: `holo stack up|down|status` (D01-03 + RED harness)
      const sub = args.positional[1];
      if (sub !== 'up' && sub !== 'down' && sub !== 'status') {
        console.error(
          sub
            ? `unknown command: stack ${sub}`
            : 'error: stack requires a subcommand (up|down|status)'
        );
        console.error('Usage: holo stack up | holo stack down | holo stack status [--json]');
        process.exit(2);
      }
      const { stackUp, stackDown, stackStatus } = await import('../stack/index.ts');
      const result = sub === 'up' ? stackUp() : sub === 'down' ? stackDown() : stackStatus();
      if (args.json) {
        console.log(JSON.stringify(result.report, null, 2));
      } else {
        console.log(result.text);
      }
      process.exit(result.exitCode);
      break;
    }
    case 'stack:up': {
      const { stackUp } = await import('../stack/index.ts');
      const result = stackUp();
      if (args.json) {
        console.log(JSON.stringify(result.report, null, 2));
      } else {
        console.log(result.text);
      }
      process.exit(result.exitCode);
      break;
    }
    case 'stack:down': {
      const { stackDown } = await import('../stack/index.ts');
      const result = stackDown();
      if (args.json) {
        console.log(JSON.stringify(result.report, null, 2));
      } else {
        console.log(result.text);
      }
      process.exit(result.exitCode);
      break;
    }
    case 'stack:status': {
      const { stackStatus } = await import('../stack/index.ts');
      const result = stackStatus();
      if (args.json) {
        console.log(JSON.stringify(result.report, null, 2));
      } else {
        console.log(result.text);
      }
      process.exit(result.exitCode);
      break;
    }
    case 'evidence:seed': {
      const { seedEvidence } = await import('../db/evidence/index.ts');
      const result = await seedEvidence();
      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(
          'holo evidence:seed — claim + two contradicting passages + relations + open belief'
        );
        for (const m of result.messages) console.log(`  ${m}`);
        if (result.sourceId) console.log(`  sourceId:    ${result.sourceId}`);
        if (result.claimId) console.log(`  claimId:     ${result.claimId}`);
        if (result.beliefId) console.log(`  beliefId:    ${result.beliefId}`);
        if (result.passageIds.length) console.log(`  passageIds:  ${result.passageIds.join(', ')}`);
        if (result.relationIds.length)
          console.log(`  relationIds: ${result.relationIds.join(', ')}`);
        console.log(
          `  counts: sources=${result.counts.sources} passages=${result.counts.passages} claims=${result.counts.claims} relations=${result.counts.relations}`
        );
        if (result.errors.length) {
          for (const e of result.errors) console.error(`  error: ${e}`);
        }
        console.log(result.ok ? '  status: OK' : '  status: FAIL');
      }
      process.exit(result.ok ? 0 : 1);
      break;
    }
    case 'evidence:revise': {
      const beliefId = args.positional[1];
      if (!beliefId) {
        console.error(
          'error: evidence:revise requires <belief-id> --actor --run-id --idempotency-key --statement'
        );
        process.exit(2);
      }
      if (!args.actor || !args.runId || !args.idempotencyKey || !args.statement) {
        console.error(
          'error: evidence:revise requires --actor, --run-id, --idempotency-key, and --statement'
        );
        process.exit(2);
      }
      let confidence: number | null = null;
      if (args.confidence !== null && args.confidence !== undefined && args.confidence !== '') {
        confidence = Number(args.confidence);
        if (Number.isNaN(confidence)) {
          console.error(`error: --confidence must be a number (got ${args.confidence})`);
          process.exit(2);
        }
      }
      const { reviseBelief } = await import('../db/evidence/index.ts');
      const result = await reviseBelief({
        beliefId,
        actor: args.actor,
        runId: args.runId,
        idempotencyKey: args.idempotencyKey,
        statement: args.statement,
        confidence,
        validFrom: args.validFrom,
        validTo: args.validTo,
      });
      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('holo evidence:revise — SECURITY DEFINER revise_belief(...)');
        for (const m of result.messages) console.log(`  ${m}`);
        if (result.successorId) {
          console.log(`  successorId: ${result.successorId}`);
        }
        console.log(`  actor:       ${result.actor}`);
        console.log(`  runId:       ${result.runId}`);
        console.log(`  idempotencyKey: ${result.idempotencyKey}`);
        if (result.errors.length) {
          for (const e of result.errors) console.error(`  error: ${e}`);
        }
        console.log(result.ok ? '  status: OK' : '  status: FAIL');
      }
      process.exit(result.ok ? 0 : 1);
      break;
    }
    case 'evidence:belief': {
      const claimId = args.claimId ?? args.positional[1] ?? null;
      if (!claimId) {
        console.error('error: evidence:belief requires --claim-id <id>');
        process.exit(2);
      }
      const { getBeliefAsOf } = await import('../db/evidence/index.ts');
      const result = await getBeliefAsOf({
        claimId,
        asOf: args.asOf ?? 'now',
      });
      // Shape for RED / Studio: top-level beliefId|id|statement|netSupport + nested belief.
      const payload = {
        ok: result.ok,
        claimId: result.claimId,
        asOf: result.asOf,
        asOfResolved: result.asOfResolved,
        beliefId: result.beliefId,
        id: result.id,
        statement: result.statement,
        confidence: result.confidence,
        netSupport: result.netSupport,
        net_support: result.netSupport,
        sessionRole: result.sessionRole,
        current_user: result.sessionRole,
        belief: result.belief,
        messages: result.messages,
        errors: result.errors,
      };
      if (args.json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        console.log('holo evidence:belief — as-of belief + net-support');
        console.log(`  claimId:     ${result.claimId}`);
        console.log(`  asOf:        ${result.asOf} (resolved ${result.asOfResolved})`);
        if (result.beliefId) console.log(`  beliefId:    ${result.beliefId}`);
        if (result.statement) console.log(`  statement:   ${result.statement}`);
        if (result.confidence != null) console.log(`  confidence:  ${result.confidence}`);
        console.log(`  netSupport:  ${result.netSupport}`);
        for (const m of result.messages) console.log(`  ${m}`);
        if (result.errors.length) {
          for (const e of result.errors) console.error(`  error: ${e}`);
        }
        console.log(result.ok ? '  status: OK' : '  status: FAIL');
      }
      // Exit 0 when belief resolved; still emit netSupport on failure for CLI consumers.
      process.exit(result.ok ? 0 : 1);
      break;
    }
    case 'evidence:register-doc': {
      const documentId = args.positional[1];
      if (!documentId) {
        console.error('error: evidence:register-doc requires <document-id>');
        process.exit(2);
      }
      const { registerDoc } = await import('../db/evidence/index.ts');
      const result = await registerDoc({ documentId });
      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('holo evidence:register-doc — self-sourced (holocron_internal) source');
        console.log(`  documentId:   ${result.documentId}`);
        if (result.sourceId) console.log(`  sourceId:     ${result.sourceId}`);
        console.log(`  sourceKind:   ${result.sourceKind} (alias ${result.sourceKindAlias})`);
        console.log(`  passageIds:   ${result.passageIds.join(', ') || '(none)'}`);
        console.log(
          `  passages:     before=${result.passageCountBefore} after=${result.passageCountAfter} created=${result.passagesCreated}`
        );
        console.log(`  reusedSource: ${result.reusedExistingSource}`);
        for (const m of result.messages) console.log(`  ${m}`);
        if (result.errors.length) {
          for (const e of result.errors) console.error(`  error: ${e}`);
        }
        console.log(result.ok ? '  status: OK' : '  status: FAIL');
      }
      process.exit(result.ok ? 0 : 1);
      break;
    }
    case 'infer:call': {
      // Sprint 08: --escape → runBudgetedEscape; default → DegradedModeController + resolveModel
      const role =
        args.role ?? args.positional[1] ?? (args.escape || args.highStakes ? 'divergent' : null);
      if (!role) {
        console.error(
          'error: infer:call requires --role <role> (or --escape / --highStakes which defaults role=divergent)'
        );
        process.exit(2);
      }
      const allowEscape = args.escape || args.highStakes;
      let estimatedCostUsd = 0.01;
      if (args.cost !== null && args.cost !== undefined && args.cost !== '') {
        estimatedCostUsd = Number(args.cost);
        if (Number.isNaN(estimatedCostUsd)) {
          console.error(`error: --cost must be a number (got ${args.cost})`);
          process.exit(2);
        }
      }
      // REDHAT-FIX-H5: real escapes must reject non-positive estimates before Anthropic.
      if (allowEscape && !(Number.isFinite(estimatedCostUsd) && estimatedCostUsd > 0)) {
        const msg =
          'BUDGET_INVALID_ESTIMATE: --cost must be > 0 for escape (non-positive estimate refused)';
        if (args.json) {
          console.error(
            JSON.stringify({
              ok: false,
              code: 'BUDGET_INVALID_ESTIMATE',
              error: msg,
              estimatedCostUsd,
            })
          );
        } else {
          console.error(`error: ${msg}`);
        }
        process.exit(2);
      }

      type CapRow = { host: string; url: string; method: string; at: number };
      const captureRows: CapRow[] = [];
      const origFetch = globalThis.fetch;
      globalThis.fetch = (async (
        input: Parameters<typeof origFetch>[0],
        init?: Parameters<typeof origFetch>[1]
      ) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : ((input as { url?: string }).url ?? String(input));
        let host = '';
        try {
          host = new URL(url).host;
        } catch {
          host = '';
        }
        captureRows.push({
          host,
          url,
          method: String(init?.method ?? 'GET').toUpperCase(),
          at: Date.now(),
        });
        return origFetch(input as RequestInfo, init as RequestInit);
      }) as typeof globalThis.fetch;

      const anthropicHits = () =>
        captureRows.filter(
          (r) => r.host.includes('api.anthropic.com') || r.url.includes('api.anthropic.com')
        ).length;
      const fleetHits = () =>
        captureRows.filter((r) => r.url.includes(':4545') || r.host.includes('127.0.0.1')).length;

      try {
        if (allowEscape) {
          // Full escape path: checkBudget → real generateText → logEscape (NOT resolve-only probe)
          const { runBudgetedEscape, BudgetExceededError, BudgetLedgerWriteError } = await import(
            '../inference/budget-ledger.ts'
          );
          const { EscapeDegradedRefusedError, ESCAPE_DEGRADED_REFUSED_CODE } = await import(
            '../inference/escape-degraded-guard.ts'
          );
          const reason = args.reason ?? 'holo-infer-call-escape';
          const prompt =
            args.prompt ?? args.statement ?? 'Reply with exactly the single word: pong';
          try {
            // Shared never-cloud choke lives inside runBudgetedEscape (assertEscapeNotDegraded).
            // CLI must NOT invent a parallel Anthropic entry point.
            const escapeResult = await runBudgetedEscape({
              prompt,
              reason,
              estimatedCostUsd,
              runId: args.runId ?? undefined,
              stepId: 'holo-infer-call',
              role,
            });
            const anthropicCount = anthropicHits();
            const fleetCount = fleetHits();
            const payload = {
              ok: true,
              mode: 'runBudgetedEscape',
              allowEscape: true,
              role,
              escape: {
                text: escapeResult.text,
                tokens: escapeResult.tokens,
                cost: escapeResult.cost,
                ledgerId: escapeResult.ledgerId,
                modelId: escapeResult.modelId,
                inputTokens: escapeResult.inputTokens,
                outputTokens: escapeResult.outputTokens,
                anthropicHostContacted: escapeResult.anthropicHostContacted,
                reason,
              },
              resolved: {
                role,
                provider: 'anthropic' as const,
                endpoint: 'https://api.anthropic.com',
                baseURL: 'https://api.anthropic.com/v1',
                litellmModelId: escapeResult.modelId,
                modelRevision: `escape:${escapeResult.modelId}`,
                allowEscape: true,
              },
              networkCapture: {
                anthropicCount,
                fleetCount,
                rows: captureRows,
              },
            };
            if (args.json) {
              console.log(JSON.stringify(payload, null, 2));
            } else {
              console.log('holo infer:call — runBudgetedEscape (budgeted Claude escape)');
              console.log(`  role:            ${role}`);
              console.log(`  mode:            runBudgetedEscape`);
              console.log(`  modelId:         ${escapeResult.modelId}`);
              console.log(`  tokens:          ${escapeResult.tokens}`);
              console.log(`  cost:            ${escapeResult.cost}`);
              console.log(`  ledgerId:        ${escapeResult.ledgerId}`);
              console.log(`  reason:          ${reason}`);
              console.log(`  text:            ${escapeResult.text.slice(0, 200)}`);
              console.log(
                `  networkCapture:  anthropic=${anthropicCount} fleet=${fleetCount} total=${captureRows.length}`
              );
              console.log('  status: OK');
            }
            process.exit(0);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const code =
              err instanceof EscapeDegradedRefusedError
                ? err.code
                : err instanceof BudgetExceededError
                  ? err.code
                  : err instanceof BudgetLedgerWriteError
                    ? err.code
                    : /degraded|never-cloud/i.test(msg)
                      ? ESCAPE_DEGRADED_REFUSED_CODE
                      : /ANTHROPIC_API_KEY/i.test(msg)
                        ? 'ANTHROPIC_API_KEY_REQUIRED'
                        : 'ESCAPE_FAILED';
            const anthropicCount = anthropicHits();
            const payload = {
              ok: false,
              mode: 'runBudgetedEscape',
              error: code,
              role,
              allowEscape: true,
              message: msg,
              networkCapture: {
                anthropicCount,
                fleetCount: fleetHits(),
                rows: captureRows,
              },
            };
            if (args.json) {
              console.error(JSON.stringify(payload, null, 2));
            } else {
              console.error(`holo infer:call failed: ${code}`);
              console.error(`  ${msg}`);
              console.error(`  networkCapture.anthropicCount=${anthropicCount}`);
            }
            process.exit(1);
          }
        }

        // Default path: DegradedModeController (fleet resolve + degrade-on-unavailable)
        const { UnknownFleetRoleError, RoleUnavailableError, BudgetExceededError } = await import(
          '../inference/resolve-model.ts'
        );
        const { DegradedModeController } = await import('../inference/degraded-mode-controller.ts');
        const controller = new DegradedModeController({
          databaseUrl: process.env.DATABASE_URL,
          role: typeof role === 'string' ? role : 'divergent',
        });

        try {
          await controller.init();
          const result = await controller.resolveRole(role, {
            allowEscape: false,
            highStakes: false,
            estimatedCostUsd,
            reason: args.reason ?? 'holo-infer-call',
          });
          const anthropicCount = anthropicHits();
          const fleetCount = fleetHits();

          if (result.ok) {
            const resolved = result.resolved;
            const payload = {
              ok: true,
              mode: 'resolveModel',
              allowEscape: false,
              role,
              resolved,
              degradedState: controller.getState(),
              networkCapture: {
                anthropicCount,
                fleetCount,
                rows: captureRows,
              },
            };
            if (args.json) {
              console.log(JSON.stringify(payload, null, 2));
            } else {
              console.log('holo infer:call — resolveModel(role, { allowEscape: false })');
              console.log(`  role:            ${resolved.role}`);
              console.log(`  allowEscape:     false`);
              console.log(`  provider:        ${resolved.provider}`);
              console.log(`  endpoint:        ${resolved.endpoint}`);
              console.log(`  baseURL:         ${resolved.baseURL}`);
              console.log(`  litellmModelId:  ${resolved.litellmModelId}`);
              console.log(`  modelRevision:   ${resolved.modelRevision}`);
              console.log(`  degradation:     ${resolved.degradationAction}`);
              console.log(`  degraded-state:  ${controller.getState()['degraded-state']}`);
              console.log(
                `  networkCapture:  anthropic=${anthropicCount} fleet=${fleetCount} total=${captureRows.length}`
              );
              console.log('  status: OK');
            }
            process.exit(0);
          }

          const payload = {
            ok: false,
            error: 'ROLE_UNAVAILABLE',
            role,
            allowEscape: false,
            message: result.degradation.message,
            degradation: result.degradation,
            degradedState: controller.getState(),
            networkCapture: {
              anthropicCount,
              fleetCount: captureRows.filter((r) => r.url.includes(':4545')).length,
              rows: captureRows,
            },
          };
          if (args.json) {
            console.error(JSON.stringify(payload, null, 2));
          } else {
            console.error(`holo infer:call degraded: ROLE_UNAVAILABLE`);
            console.error(`  ${result.degradation.message}`);
            console.error(`  degraded-state: ${result.degradation['degraded-state']}`);
            console.error(`  degradationAction: ${result.degradation.degradationAction}`);
            console.error(`  networkCapture.anthropicCount=${anthropicCount}`);
          }
          process.exit(1);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const code =
            err instanceof UnknownFleetRoleError
              ? 'UNKNOWN_FLEET_ROLE'
              : err instanceof RoleUnavailableError
                ? 'ROLE_UNAVAILABLE'
                : err instanceof BudgetExceededError
                  ? err.code
                  : 'RESOLVE_FAILED';
          const anthropicCount = anthropicHits();
          const payload = {
            ok: false,
            error: code,
            role,
            allowEscape: false,
            message: msg,
            networkCapture: {
              anthropicCount,
              fleetCount: fleetHits(),
              rows: captureRows,
            },
          };
          if (args.json) {
            console.error(JSON.stringify(payload, null, 2));
          } else {
            console.error(`holo infer:call failed: ${code}`);
            console.error(`  ${msg}`);
            console.error(`  networkCapture.anthropicCount=${anthropicCount}`);
          }
          process.exit(1);
        } finally {
          await controller.close().catch(() => undefined);
        }
      } finally {
        globalThis.fetch = origFetch;
      }
      break;
    }
    case 'infer:degraded': {
      // Sprint 08 infer-3: operator visibility into degraded-mode + optional health poll
      const { DegradedModeController } = await import('../inference/degraded-mode-controller.ts');
      const role = args.role ?? 'divergent';
      const controller = new DegradedModeController({
        databaseUrl: process.env.DATABASE_URL,
        role,
      });
      try {
        await controller.init();
        let poll: { ok: boolean; resumed: boolean; endpoint?: string } | null = null;
        const wantPoll =
          args.positional.includes('poll') ||
          process.argv.includes('--poll') ||
          args.positional[1] === 'poll';
        if (wantPoll) {
          poll = await controller.pollOnce();
        }
        const state = controller.getState();
        const payload = {
          ok: true,
          'degraded-state': state['degraded-state'],
          'resume-state': state['resume-state'],
          message: state.message,
          degradationAction: state.degradationAction,
          role: state.role ?? role,
          endpoint: state.endpoint,
          missionMode: state.missionMode,
          extractionState: state.extractionState,
          lastProbeAt: state.lastProbeAt,
          lastProbeOk: state.lastProbeOk,
          poll,
        };
        if (args.json) {
          console.log(JSON.stringify(payload, null, 2));
        } else {
          console.log('holo infer:degraded — DegradedModeController status');
          console.log(`  degraded-state:   ${state['degraded-state']}`);
          console.log(`  resume-state:     ${state['resume-state']}`);
          console.log(`  message:          ${state.message ?? '(none)'}`);
          console.log(`  degradationAction:${state.degradationAction ?? '(none)'}`);
          console.log(`  role:             ${state.role ?? role}`);
          console.log(`  endpoint:         ${state.endpoint ?? '(none)'}`);
          console.log(`  missionMode:      ${state.missionMode}`);
          console.log(`  extractionState:  ${state.extractionState}`);
          if (poll) {
            console.log(`  poll.ok:          ${poll.ok}`);
            console.log(`  poll.resumed:     ${poll.resumed}`);
            console.log(`  poll.endpoint:    ${poll.endpoint ?? '(none)'}`);
          }
          console.log('  status: OK');
        }
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo infer:degraded failed: ${msg}`);
        }
        process.exit(1);
      } finally {
        await controller.close().catch(() => undefined);
      }
      break;
    }
    case 'verify:no-provider-refs': {
      const { verifyNoProviderRefs, formatNoProviderRefsText } = await import(
        '../inference/verify-no-provider-refs.ts'
      );
      const report = verifyNoProviderRefs();
      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatNoProviderRefsText(report));
      }
      process.exit(report.ok ? 0 : 1);
      break;
    }
    case 'budget:status': {
      const { getBudgetStatus } = await import('../inference/budget-ledger.ts');
      try {
        const status = await getBudgetStatus();
        if (args.json) {
          console.log(JSON.stringify({ ok: true, ...status }, null, 2));
        } else {
          console.log('holo budget:status — Claude escape budget ledger');
          console.log(`  spent:             ${status.spent}`);
          console.log(`  ceiling:           ${status.ceiling}`);
          console.log(`  effectiveCeiling:  ${status.effectiveCeiling}`);
          console.log(`  dbCeiling:         ${status.dbCeiling}`);
          console.log(`  ceilingSource:     ${status.ceilingSource}`);
          console.log(`  reserved:          ${status.reserved}`);
          console.log(`  remaining:         ${status.remaining}`);
          console.log(`  escapes:           ${status.escapeCount}`);
          console.log('  status: OK');
        }
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }));
        } else {
          console.error(`holo budget:status failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'telemetry:tail': {
      // obs-2: operator tail of durable inference_telemetry rows (not process buffers)
      const runId = args.runId ?? args.positional[1] ?? null;
      const limit = Math.max(1, Number.parseInt(args.limit ?? '100', 10) || 100);
      const { listInferenceTelemetry } = await import('../inference/telemetry.ts');
      try {
        const rows = await listInferenceTelemetry({
          runId: runId ?? undefined,
          limit,
        });
        const payload = {
          ok: true,
          runId: runId ?? null,
          count: rows.length,
          rows: rows.map((r) => ({
            id: r.id,
            runId: r.runId,
            stepId: r.stepId,
            traceId: r.traceId,
            role: r.role,
            provider: r.provider,
            endpoint: r.endpoint,
            modelId: r.modelId,
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            totalTokens: r.totalTokens,
            tokens: r.totalTokens,
            wallMs: r.wallMs,
            status: r.status,
            errorCode: r.errorCode,
            budgetLedgerId: r.budgetLedgerId,
            createdAt: r.createdAt,
          })),
        };
        if (args.json) {
          console.log(JSON.stringify(payload, null, 2));
        } else {
          console.log('holo telemetry:tail — inference_telemetry (durable Postgres)');
          console.log(`  runId:  ${runId ?? '(latest)'}`);
          console.log(`  count:  ${rows.length}`);
          if (rows.length === 0) {
            console.log('  (no rows)');
          } else {
            for (const r of rows) {
              console.log(
                `  ${r.status.padEnd(7)} role=${r.role} provider=${r.provider} ` +
                  `tokens=${r.totalTokens} wall-ms=${r.wallMs} endpoint=${r.endpoint} ` +
                  `run=${r.runId ?? '—'} trace=${r.traceId ?? '—'} ` +
                  (r.errorCode ? `err=${r.errorCode}` : '')
              );
            }
          }
          console.log(rows.length > 0 ? '  status: OK' : '  status: EMPTY');
        }
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo telemetry:tail failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'budget:set': {
      const raw = args.ceiling ?? args.positional[1] ?? null;
      if (raw === null || raw === '') {
        console.error('error: budget:set requires --ceiling <usd>');
        process.exit(2);
      }
      const ceiling = Number(raw);
      if (!Number.isFinite(ceiling) || ceiling < 0) {
        console.error(`error: --ceiling must be a non-negative number (got ${raw})`);
        process.exit(2);
      }
      const { setBudgetCeiling, getBudgetStatus } = await import('../inference/budget-ledger.ts');
      try {
        const updated = await setBudgetCeiling(ceiling);
        const status = await getBudgetStatus();
        if (args.json) {
          console.log(JSON.stringify({ ok: true, ceiling: updated.ceiling, status }, null, 2));
        } else {
          console.log('holo budget:set — escape budget ceiling updated');
          console.log(`  ceiling:   ${updated.ceiling}`);
          console.log(`  spent:     ${status.spent}`);
          console.log(`  remaining: ${status.remaining}`);
          console.log('  status: OK');
        }
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }));
        } else {
          console.error(`holo budget:set failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'extract': {
      // Sprint 09 struct-1: extract --schema <Foo> --input <good|path>
      // REDHAT-FIX-G-STEP3-4: extract --fixture <name> for documented gate steps 3-4.
      const role = args.role ?? 'divergent';

      const { extractStructured, ExtractionFailedError, BlockedError } = await import(
        '../inference/extract-structured.ts'
      );

      // Resolve the effective (schema, input, label) from EITHER --fixture OR
      // --schema/--input. --fixture is mutually exclusive with --schema/--input
      // (a fixture fully determines both schema and input).
      let schema: z.ZodType;
      let input: string;
      let schemaLabel: string;

      if (args.fixture) {
        if (args.schema !== null || args.input !== null) {
          console.error('error: --fixture is mutually exclusive with --schema/--input');
          process.exit(2);
        }
        const { getFixture, FIXTURE_NAMES } = await import('./extract-fixtures.js');
        const fixture = getFixture(args.fixture);
        if (!fixture) {
          console.error(
            `error: unknown fixture '${args.fixture}' (available: ${FIXTURE_NAMES.join(', ')})`
          );
          process.exit(2);
        }
        // Same extractStructured pipeline as --schema/--input; only the inputs differ.
        schema = fixture.schema;
        input = fixture.input;
        schemaLabel = args.fixture;
      } else {
        const schemaName = args.schema ?? args.positional[1] ?? null;
        const inputArg = args.input ?? args.positional[2] ?? null;

        if (!schemaName) {
          console.error(
            'error: extract requires --schema <name> (e.g., simple, nested) or --fixture <name>'
          );
          process.exit(2);
        }
        if (!inputArg) {
          console.error('error: extract requires --input <text or path>');
          process.exit(2);
        }

        // Define schemas based on schema name
        const schemas = {
          simple: z.object({
            title: z.string(),
            count: z.number(),
            tags: z.array(z.string()),
          }),
          nested: z.object({
            article: z.object({
              headline: z.string(),
              wordCount: z.number(),
              keywords: z.array(z.string()),
            }),
            metadata: z.object({
              author: z.string(),
              publishedAt: z.string(),
            }),
          }),
          tripwire: z.object({
            summary: z.string(),
            sentiment: z.string(),
          }),
        };

        const namedSchema = schemas[schemaName as keyof typeof schemas];
        if (!namedSchema) {
          console.error(
            `error: unknown schema '${schemaName}' (available: simple, nested, tripwire)`
          );
          process.exit(2);
        }

        // Resolve input - if it looks like a path, try to read it
        let resolvedInput = inputArg;
        if (inputArg.startsWith('<path=') || inputArg.endsWith('.txt') || inputArg.includes('/')) {
          try {
            const { readFile } = await import('node:fs/promises');
            const path = inputArg.replace('<path=', '').replace('>', '');
            resolvedInput = await readFile(path, 'utf-8');
          } catch (err) {
            console.error(`error: failed to read input from path: ${inputArg}`);
            console.error(`  ${err instanceof Error ? err.message : String(err)}`);
            process.exit(2);
          }
        }

        schema = namedSchema;
        input = resolvedInput;
        schemaLabel = schemaName;
      }

      try {
        // REDHAT-FIX-H1: generate an extraction ID for status tracking.
        const { randomUUID } = await import('node:crypto');
        const extractionId = randomUUID();
        const result = await extractStructured(schema, input, role, extractionId);
        if (args.json) {
          console.log(
            JSON.stringify({ ok: true, extractionId, result, schema: schemaLabel, role }, null, 2)
          );
        } else {
          console.log('holo extract — structured extraction');
          console.log(`  extractionId: ${extractionId}`);
          console.log(`  schema:  ${schemaLabel}`);
          console.log(`  role:    ${role}`);
          console.log(`  result:`);
          console.log(JSON.stringify(result, null, 2));
          console.log('  status: OK');
        }
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code =
          err instanceof ExtractionFailedError
            ? err.code
            : err instanceof BlockedError
              ? err.code
              : err instanceof UnknownFleetRoleError
                ? 'UNKNOWN_FLEET_ROLE'
                : err instanceof RoleUnavailableError
                  ? 'ROLE_UNAVAILABLE'
                  : 'EXTRACTION_FAILED';

        if (args.json) {
          console.error(
            JSON.stringify({
              ok: false,
              error: code,
              schema: schemaLabel,
              role,
              message: msg,
              ...(err instanceof ExtractionFailedError && {
                attempts: err.attempts,
                lastParseError: err.lastParseError.message,
                schemaErrors: err.schemaErrors.map((e) => ({
                  attempt: e.attempt,
                  error: e.error.message,
                })),
              }),
              ...(err instanceof BlockedError && {
                reason: err.reason,
                processorId: err.processorId,
                tripwirePayload: err.tripwirePayload,
              }),
            })
          );
        } else {
          console.error(`holo extract failed: ${code}`);
          console.error(`  ${msg}`);
          if (err instanceof ExtractionFailedError) {
            console.error(`  attempts: ${err.attempts}`);
          }
          if (err instanceof BlockedError) {
            console.error(`  reason: ${err.reason}`);
            console.error(`  processorId: ${err.processorId}`);
          }
        }
        process.exit(1);
      }
      break;
    }
    case 'extract:status': {
      // Sprint 09 struct-1 / REDHAT-FIX-H1: query extraction status by id.
      const extractionId = args.positional[1] ?? null;

      if (!extractionId) {
        console.error('error: extract:status requires an extraction ID');
        process.exit(2);
      }

      const { getExtractionStatus } = await import('../inference/extract-structured.ts');
      const status = await getExtractionStatus(extractionId);

      if (!status) {
        const payload = {
          ok: false,
          error: 'NOT_FOUND',
          extractionId,
          message: `no status record for extraction '${extractionId}'`,
        };
        if (args.json) {
          console.log(JSON.stringify(payload, null, 2));
        } else {
          console.log('holo extract:status — extraction status');
          console.log(`  extractionId: ${extractionId}`);
          console.log(`  status: NOT_FOUND`);
        }
        process.exit(1);
        break;
      }

      if (args.json) {
        console.log(JSON.stringify({ ok: true, ...status }, null, 2));
      } else {
        console.log('holo extract:status — extraction status');
        console.log(`  extractionId: ${status.id}`);
        console.log(`  status:       ${status.status}`);
        console.log(`  committed:    ${status.committed}`);
        console.log(`  role:         ${status.role}`);
        console.log(`  startedAt:    ${status.startedAt}`);
        if (status.endedAt) console.log(`  endedAt:      ${status.endedAt}`);
        if (status.status === 'extraction_failed' && status.error) {
          console.log(`  error.code:        ${status.error.code}`);
          console.log(`  error.message:     ${status.error.message}`);
          if (status.error.attempts !== undefined)
            console.log(`  error.attempts:    ${status.error.attempts}`);
          if (status.error.lastParseError)
            console.log(`  error.lastParseError: ${status.error.lastParseError.slice(0, 200)}`);
        }
        if (status.status === 'blocked') {
          console.log(`  blockedReason: ${status.blockedReason}`);
          console.log(`  processorId:   ${status.processorId}`);
        }
        console.log(
          `  status: ${status.status === 'success' ? 'OK' : status.status.toUpperCase()}`
        );
      }
      process.exit(0);
      break;
    }
    case 'probe:capabilities': {
      // Sprint 09 struct-2: probe all fleet roles for json_schema support
      const { probeCapabilities } = await import('../inference/probe-capability.ts');

      // Optional role filter (positional arg or --role)
      const roleFilter = args.role ?? args.positional[1] ?? null;

      // Parse timeout if provided
      let timeoutMs = 45_000; // Default 45s
      if (args.timeout !== null && args.timeout !== undefined && args.timeout !== '') {
        timeoutMs = Number(args.timeout);
        if (Number.isNaN(timeoutMs) || timeoutMs <= 0) {
          console.error(`error: --timeout must be a positive number (got ${args.timeout})`);
          process.exit(2);
        }
      }

      try {
        const capabilities = await probeCapabilities(roleFilter ?? undefined, {
          timeoutMs,
        });

        if (args.json) {
          console.log(JSON.stringify({ ok: true, capabilities }, null, 2));
        } else {
          console.log('holo probe:capabilities — per-role json_schema support');
          console.log(`  timeout: ${timeoutMs}ms per role`);
          if (roleFilter) {
            console.log(`  role filter: ${roleFilter}`);
          }
          console.log('');
          for (const [role, cap] of Object.entries(capabilities)) {
            console.log(`  ${role}:`);
            console.log(`    supportsJsonSchema: ${cap.supportsJsonSchema}`);
            console.log(`    mode: ${cap.mode}`);
            console.log(`    endpoint: ${cap.endpoint}`);
            console.log(`    litellmModelId: ${cap.litellmModelId}`);
            if (cap.error) {
              console.log(`    error: ${cap.error}`);
            }
          }
          console.log('');
          const constrainedCount = Object.values(capabilities).filter(
            (c) => c.mode === 'constrained'
          ).length;
          const repairCount = Object.values(capabilities).filter((c) => c.mode === 'repair').length;
          console.log(`  summary: ${constrainedCount} constrained, ${repairCount} repair`);
          console.log('  status: OK');
        }
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo probe:capabilities failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'embed:run': {
      // search-2: idempotent resumable re-embed of NULL passage embeddings (document mode).
      const { embedRun, EmbedRunError } = await import('../inference/embed-run.ts');
      try {
        const result = await embedRun();
        if (args.json) {
          console.log(JSON.stringify({ ok: result.remainingNull === 0, ...result }, null, 2));
        } else {
          console.log('holo embed:run — document-mode re-embed (WHERE embedding IS NULL)');
          console.log(`  processed:      ${result.processed}`);
          console.log(`  remainingNull:  ${result.remainingNull}`);
          console.log(result.remainingNull === 0 ? '  status: OK' : '  status: PARTIAL');
        }
        process.exit(result.remainingNull === 0 ? 0 : 1);
      } catch (err) {
        const isEmbedRun = err instanceof EmbedRunError;
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(
            JSON.stringify(
              {
                ok: false,
                error: msg,
                ...(isEmbedRun
                  ? {
                      code: err.code,
                      passageId: err.passageId,
                      completed: err.completed,
                    }
                  : {}),
              },
              null,
              2
            )
          );
        } else {
          console.error(`holo embed:run failed: ${msg}`);
          if (isEmbedRun) {
            console.error(`  code:       ${err.code}`);
            console.error(`  passageId:  ${err.passageId}`);
            console.error(`  completed:  ${err.completed}`);
          }
        }
        process.exit(1);
      }
      break;
    }
    case 'embed:verify': {
      // search-2: operator check — null / wrong-dimension embedding counts.
      const { embedVerify } = await import('../inference/embed-run.ts');
      try {
        const result = await embedVerify();
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('holo embed:verify — passage embedding health');
          console.log(`  total:              ${result.total}`);
          console.log(`  nullEmbeddings:     ${result.nullEmbeddings}`);
          console.log(`  wrongDimension:     ${result.wrongDimension}`);
          console.log(`  correctDimension:   ${result.correctDimension}`);
          console.log(`  expectedDimension:  ${result.expectedDimension}`);
          console.log(result.ok ? '  status: OK' : '  status: FAIL');
        }
        process.exit(result.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo embed:verify failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'search': {
      // GATE-FIX: human-gate RRF hybrid / surface KNN search against real Postgres + fleet embed.
      const query = args.positional.slice(1).join(' ').trim();
      if (!query) {
        console.error(
          'error: search requires a query (e.g. holo search "how to combine vector and keyword rankings")'
        );
        process.exit(2);
      }
      const limit = Math.max(1, Number.parseInt(args.limit ?? '10', 10) || 10);
      const { createDb, createSql } = await import('../db/client.ts');
      const sql = createSql();
      let exitCode = 0;
      try {
        const db = createDb(sql);
        if (args.surface) {
          const { searchSurface, INLINE_HNSW_SURFACES } = await import('../search/index.ts');
          const out = await searchSurface(db, sql, args.surface, { query, limit });
          const payload = {
            ok: true,
            query,
            surface: args.surface,
            limit,
            ...out,
            allowedSurfaces: INLINE_HNSW_SURFACES,
          };
          if (args.json) {
            console.log(JSON.stringify(payload, null, 2));
          } else {
            console.log(`holo search --surface ${args.surface}`);
            console.log(`  query:        ${query}`);
            console.log(`  searchMethod: ${out.searchMethod}`);
            console.log(`  totalResults: ${out.totalResults}`);
            if (out.results.length === 0) {
              console.log('  (no results)');
            } else {
              for (let i = 0; i < out.results.length; i++) {
                const r = out.results[i]!;
                const score =
                  typeof r.score === 'number' ? r.score.toFixed(6) : String(r.score ?? '');
                const title = (r.title ?? r.claim_text ?? r.content ?? '').toString().slice(0, 80);
                console.log(
                  `  ${String(i + 1).padStart(2)}  score=${score}  id=${r._id}  ${title}`
                );
              }
            }
          }
        } else {
          const { rrfHybridSearch, RRF_K } = await import('../search/index.ts');
          const out = await rrfHybridSearch(db, sql, { query, limit });
          const explain = args.explain
            ? {
                fusion: {
                  method: 'reciprocal_rank_fusion',
                  k: RRF_K,
                  formula: `COALESCE(1.0/(${RRF_K}+vec_rank),0) + COALESCE(1.0/(${RRF_K}+fts_rank),0)`,
                  legs: ['pgvector_hnsw', 'fts'],
                  roundTrips: 1,
                  note: 'Single CTE FULL OUTER JOIN — never 0.7/0.3 normalize-by-max',
                },
                resultScores: out.results.map((r, i) => ({
                  rank: i + 1,
                  _id: r._id,
                  title: r.title,
                  score: r.score,
                  rrf_score: r.rrf_score ?? r.score,
                  passage_id: r.passage_id,
                  document_id: r.document_id,
                })),
              }
            : undefined;
          const payload = {
            ok: true,
            query,
            limit,
            searchMethod: out.searchMethod,
            totalResults: out.totalResults,
            results: out.results,
            ...(explain ? { explain } : {}),
          };
          if (args.json) {
            console.log(JSON.stringify(payload, null, 2));
          } else {
            console.log('holo search — RRF hybrid (pgvector HNSW + FTS)');
            console.log(`  query:        ${query}`);
            console.log(`  searchMethod: ${out.searchMethod}`);
            console.log(`  totalResults: ${out.totalResults}`);
            if (args.explain) {
              console.log(`  fusion:       reciprocal_rank_fusion k=${RRF_K} (one round-trip)`);
              console.log(
                `  formula:      COALESCE(1.0/(${RRF_K}+vec_rank),0) + COALESCE(1.0/(${RRF_K}+fts_rank),0)`
              );
              console.log('  legs:         pgvector_hnsw + fts');
            }
            if (out.results.length === 0) {
              console.log('  (no results)');
            } else {
              for (let i = 0; i < out.results.length; i++) {
                const r = out.results[i]!;
                const score =
                  typeof r.score === 'number' ? r.score.toFixed(6) : String(r.score ?? '');
                const title = (r.title ?? r.content ?? '').toString().slice(0, 80);
                const rrf =
                  r.rrf_score != null && typeof r.rrf_score === 'number'
                    ? ` rrf=${r.rrf_score.toFixed(6)}`
                    : '';
                console.log(
                  `  ${String(i + 1).padStart(2)}  score=${score}${rrf}  id=${r._id}  ${title}`
                );
              }
            }
          }
        }
      } catch (err) {
        exitCode = 1;
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo search failed: ${msg}`);
        }
      } finally {
        await sql.end({ timeout: 5 }).catch(() => {});
      }
      process.exit(exitCode);
      break;
    }
    case 'search:recall': {
      // GATE-FIX: load golden set, run RRF per query, print recall new=X baseline=Y.
      if (!args.golden) {
        console.error(
          'error: search:recall requires --golden <path> (JSON golden set with queries + expected matches)'
        );
        process.exit(2);
      }
      const goldenPath = resolve(args.golden);
      const { readFileSync } = await import('node:fs');
      let goldenRaw: unknown;
      try {
        goldenRaw = JSON.parse(readFileSync(goldenPath, 'utf8'));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`error: failed to load golden set ${goldenPath}: ${msg}`);
        process.exit(2);
      }

      type GoldenQuery = {
        query: string;
        expected_ids?: string[];
        expected_titles?: string[];
        expected_content_contains?: string[];
        relevant_ids?: string[];
        relevant_titles?: string[];
      };
      type GoldenSet = {
        baseline?: number;
        recall_baseline?: number;
        k?: number;
        queries?: GoldenQuery[];
        items?: GoldenQuery[];
      };

      const golden = (goldenRaw ?? {}) as GoldenSet;
      const queries: GoldenQuery[] = (golden.queries ?? golden.items ?? []).filter(
        (q) => typeof q?.query === 'string' && q.query.trim().length > 0
      );
      if (queries.length === 0) {
        console.error(
          'error: golden set must include a non-empty queries[] (or items[]) array with {query, expected_*}'
        );
        process.exit(2);
      }

      const envBaseline = process.env.RECALL_BASELINE;
      const baselineRaw =
        envBaseline ??
        (golden.baseline != null ? String(golden.baseline) : null) ??
        (golden.recall_baseline != null ? String(golden.recall_baseline) : null) ??
        '1';
      const baseline = Number(baselineRaw);
      if (!Number.isFinite(baseline)) {
        console.error(`error: invalid baseline (RECALL_BASELINE / file field): ${baselineRaw}`);
        process.exit(2);
      }

      const k = Math.max(
        1,
        Number.parseInt(args.limit ?? (golden.k != null ? String(golden.k) : '10'), 10) || 10
      );

      const { createDb, createSql } = await import('../db/client.ts');
      const { rrfHybridSearch } = await import('../search/index.ts');
      const sql = createSql();
      let exitCode = 1;
      try {
        const db = createDb(sql);
        const perQuery: Array<{
          query: string;
          hit: boolean;
          topIds: string[];
          topTitles: string[];
        }> = [];
        let hits = 0;

        for (const gq of queries) {
          const out = await rrfHybridSearch(db, sql, { query: gq.query, limit: k });
          const top = out.results.slice(0, k);
          const topIds = top.map((r) => r._id).filter(Boolean);
          const topTitles = top
            .map((r) => r.title)
            .filter((t): t is string => typeof t === 'string' && t.length > 0);

          const expectedIds = [...(gq.expected_ids ?? []), ...(gq.relevant_ids ?? [])];
          const expectedTitles = [...(gq.expected_titles ?? []), ...(gq.relevant_titles ?? [])];
          const expectedContent = gq.expected_content_contains ?? [];

          const idHit = expectedIds.length > 0 && top.some((r) => expectedIds.includes(r._id));
          const titleHit =
            expectedTitles.length > 0 &&
            top.some((r) => typeof r.title === 'string' && expectedTitles.includes(r.title));
          const contentHit =
            expectedContent.length > 0 &&
            top.some(
              (r) =>
                typeof r.content === 'string' &&
                expectedContent.some((needle) => r.content!.includes(needle))
            );

          // If no expected criteria provided, treat non-empty top-k as a hit (smoke).
          const noCriteria =
            expectedIds.length === 0 && expectedTitles.length === 0 && expectedContent.length === 0;
          const hit = noCriteria ? top.length > 0 : idHit || titleHit || contentHit;
          if (hit) hits += 1;
          perQuery.push({ query: gq.query, hit, topIds, topTitles });
        }

        const recall = hits / queries.length;
        // Baseline may be absolute hit-count (e.g. 1) or a fraction (e.g. 0.8).
        // Fractions are in (0,1); integers / values >1 are hit-counts.
        const baselineIsFraction = baseline > 0 && baseline < 1;
        const ok = baselineIsFraction ? recall + 1e-12 >= baseline : hits >= baseline;
        const newDisplay = Number.isInteger(recall) ? String(recall) : recall.toFixed(4);
        const baselineDisplay = String(baseline);
        const line = `recall new=${newDisplay} baseline=${baselineDisplay}`;

        const payload = {
          ok,
          recall,
          new: recall,
          baseline,
          hits,
          total: queries.length,
          k,
          golden: goldenPath,
          searchMethod: 'rrf' as const,
          perQuery,
          line,
        };

        if (args.json) {
          console.log(JSON.stringify(payload, null, 2));
          // Gate scripts also look for the exact figure line.
          console.error(line);
        } else {
          console.log('holo search:recall — RRF recall@k vs baseline');
          console.log(`  golden:   ${goldenPath}`);
          console.log(`  k:        ${k}`);
          console.log(`  queries:  ${queries.length}`);
          console.log(`  hits:     ${hits}`);
          for (const pq of perQuery) {
            console.log(`    ${pq.hit ? 'HIT ' : 'MISS'}  ${pq.query.slice(0, 80)}`);
          }
          console.log(line);
          console.log(ok ? '  status: OK' : '  status: FAIL');
        }
        exitCode = ok ? 0 : 1;
      } catch (err) {
        exitCode = 1;
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo search:recall failed: ${msg}`);
        }
      } finally {
        await sql.end({ timeout: 5 }).catch(() => {});
      }
      process.exit(exitCode);
      break;
    }
    case 'jobs:list': {
      // queue-3 AC-2: migrated cron inventory (7/4/1/3→1/1 split).
      const { MIGRATED_JOBS, MIGRATED_JOB_COUNT, CATEGORY_SPLIT } = await import(
        '../queue/jobs-registry.ts'
      );
      const payload = {
        count: MIGRATED_JOB_COUNT,
        split: CATEGORY_SPLIT,
        jobs: MIGRATED_JOBS.map((j) => ({
          name: j.name,
          category: j.category,
          lane: j.lane,
          schedule: j.schedule,
        })),
      };
      if (args.json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        console.log('holo jobs:list — migrated cron inventory');
        console.log(
          `  split: janitor=${CATEGORY_SPLIT.janitor} workflow=${CATEGORY_SPLIT.workflow} consumer=${CATEGORY_SPLIT.consumer} backfill=${CATEGORY_SPLIT.backfill} digest=${CATEGORY_SPLIT.digest}`
        );
        console.log(`  total: ${MIGRATED_JOB_COUNT}`);
        for (const j of MIGRATED_JOBS) {
          console.log(
            `  ${j.category.padEnd(9)} ${j.lane.padEnd(12)} ${j.schedule.padEnd(16)} ${j.name}`
          );
        }
        console.log('  status: OK');
      }
      process.exit(MIGRATED_JOB_COUNT === 16 ? 0 : 1);
      break;
    }
    case 'jobs:run-all': {
      // queue-3 AC-1: fire all 16 migrated jobs through the durable queue.
      const { runAllJobs } = await import('../queue/jobs-runner.ts');
      const result = await runAllJobs({});
      if (args.json) {
        console.log(
          JSON.stringify(
            {
              jobs_fired: result.jobs_fired,
              jobs_total: result.jobs_total,
              side_effect_rows: result.side_effect_rows,
              run_id: result.run_id,
              runs: result.runs.map((r) => ({
                name: r.name,
                run_key: r.run_key,
                category: r.category,
                lane: r.lane,
                ok: r.ok,
                error: r.error,
              })),
            },
            null,
            2
          )
        );
      } else {
        console.log('holo jobs:run-all — fire all migrated crons');
        console.log(`  jobs_fired:      ${result.jobs_fired}/${result.jobs_total}`);
        console.log(`  side_effect_rows: ${result.side_effect_rows}`);
        console.log(`  run_id:          ${result.run_id}`);
        for (const r of result.runs) {
          console.log(
            `  ${r.ok ? '✓' : '✗'} ${r.category.padEnd(9)} ${r.lane.padEnd(12)} ${r.name}`
          );
          if (!r.ok && r.error) {
            console.log(`      ↳ error: ${r.error}`);
          }
        }
        console.log(result.jobs_fired === result.jobs_total ? '  status: OK' : '  status: FAIL');
      }
      process.exit(result.jobs_fired === result.jobs_total ? 0 : 1);
      break;
    }
    case 'queue:effect': {
      // queue-2 operator gate: durable-effect kill-9 boundary + recovery re-run,
      // then print the auditable exactly-once trail. Real production invocation.
      //   holo queue:effect <key> --boundary before-commit
      //   holo queue:effect <key> --boundary after-commit-before-enqueue
      //   holo queue:effect <key> --boundary after-dispatch-before-ack
      const key = args.positional[1];
      if (!key) {
        console.error('error: queue:effect requires <key>');
        process.exit(2);
      }
      const boundary = (args.boundary ?? 'before-commit') as
        | 'before-commit'
        | 'after-commit-before-enqueue'
        | 'after-dispatch-before-ack';
      const { runDurableEffectBoundary, resetDurable, auditEffect } = await import(
        '../queue/durable-effect.ts'
      );
      await resetDurable({ key });
      // Pass 1: kill at the boundary (real Postgres tx rollback = SIGKILL).
      await runDurableEffectBoundary({
        key,
        payload: { n: 1 },
        boundary,
      });
      // Pass 2: recovery re-run of the SAME key, no kill — must not double-apply.
      await runDurableEffectBoundary({
        key,
        payload: { n: 1 },
        boundary: 'none',
      });
      const audit = await auditEffect({ key });
      if (args.json) {
        console.log(
          JSON.stringify(
            {
              key,
              boundary,
              effect_count: audit.counts.effects,
              outbox_count: audit.counts.outbox,
              inbox_dedupe_count: audit.counts.inbox,
              fencing_token: audit.fenceToken,
              outbox_status: audit.outbox.status,
              inbox_outcome: audit.inbox.outcome,
              exactly_once: audit.counts.effects === 1,
            },
            null,
            2
          )
        );
      } else {
        console.log(`holo queue:effect — kill-9 boundary ${boundary} + recovery`);
        console.log(`  key=${key}`);
        console.log(`  effect_count: ${audit.counts.effects}`);
        console.log(`  outbox_count: ${audit.counts.outbox}`);
        console.log(`  inbox_dedupe_count: ${audit.counts.inbox}`);
        console.log(`  fencing_token: ${audit.fenceToken ?? '—'}`);
        console.log(`  outbox_status: ${audit.outbox.status ?? '—'}`);
        console.log(`  inbox_outcome: ${audit.inbox.outcome ?? '—'}`);
        const ok =
          audit.counts.effects === 1 &&
          audit.counts.outbox === 1 &&
          audit.counts.inbox === 1 &&
          Boolean(audit.fenceToken);
        console.log(ok ? '  exactly_once: true' : '  exactly_once: false');
        console.log(ok ? '  status: OK' : '  status: FAIL');
      }
      process.exit(
        audit.counts.effects === 1 &&
          audit.counts.outbox === 1 &&
          audit.counts.inbox === 1 &&
          audit.fenceToken
          ? 0
          : 1
      );
      break;
    }
    case 'queue:enqueue': {
      // queue-1/queue-3 operator gate: enqueue a job into the leased priority queue.
      //   holo queue:enqueue <name> --lane interactive|background
      const name = args.positional[1];
      if (!name) {
        console.error('error: queue:enqueue requires <name>');
        process.exit(2);
      }
      const lane = args.lane === 'interactive' ? 'interactive' : 'background';
      const { enqueue } = await import('../queue/priority.ts');
      const job = await enqueue({ name, lane, databaseUrl: undefined });
      if (args.json) {
        console.log(
          JSON.stringify(
            { name: job.name, lane: job.lane, priority: job.priority, id: job.id },
            null,
            2
          )
        );
      } else {
        console.log(`holo queue:enqueue — leased priority queue`);
        console.log(`  name=${job.name} lane=${job.lane} priority=${job.priority} id=${job.id}`);
        console.log('  status: OK');
      }
      process.exit(0);
      break;
    }
    case 'queue:dequeue': {
      // queue-1/queue-3 operator gate: dequeue next job (interactive wins).
      //   holo queue:dequeue
      const { dequeue } = await import('../queue/priority.ts');
      const job = await dequeue();
      if (!job) {
        if (args.json) {
          console.log(JSON.stringify({ dequeued: false, lane: null }));
        } else {
          console.log('holo queue:dequeue — queue empty');
        }
        process.exit(0);
      }
      if (args.json) {
        console.log(
          JSON.stringify(
            {
              dequeued: true,
              name: job.name,
              lane: job.lane,
              priority: job.priority,
              fence_token: job.fence_token,
              id: job.id,
            },
            null,
            2
          )
        );
      } else {
        console.log(`holo queue:dequeue — leased priority queue`);
        console.log(
          `  lane=${job.lane} priority=${job.priority} name=${job.name} fence_token=${job.fence_token ?? '—'} id=${job.id}`
        );
        console.log('  status: OK');
      }
      process.exit(0);
      break;
    }
    case 'queue:poison': {
      // queue-1 operator gate: seed a poison job and drive it to the dead-letter path.
      //   holo queue:poison <key> --max-attempts 3
      const key = args.positional[1];
      if (!key) {
        console.error('error: queue:poison requires <key>');
        process.exit(2);
      }
      const maxAttempts = Math.max(1, Number(args.maxAttempts ?? '3') || 3);
      const { seedPoisonJob, runUntilTerminal, resetDlq, getJob } = await import('../queue/dlq.ts');
      await resetDlq();
      await seedPoisonJob({ key, maxAttempts });
      const result = await runUntilTerminal({ key });
      const job = await getJob(key);
      if (args.json) {
        console.log(
          JSON.stringify(
            {
              key,
              status: result.status,
              attempts: result.attempts,
              dlq_count: result.dlq_count,
              max_attempts: maxAttempts,
              dead_letter: result.status === 'dead_letter',
            },
            null,
            2
          )
        );
      } else {
        console.log(`holo queue:poison — retry/backoff to dead-letter`);
        console.log(`  key=${key}`);
        console.log(`  status: ${result.status}`);
        console.log(`  attempts: ${result.attempts}/${maxAttempts}`);
        console.log(`  dlq_count: ${result.dlq_count}`);
        console.log(`  dead_letter: ${result.status === 'dead_letter'}`);
        console.log(result.status === 'dead_letter' ? '  status: OK' : '  status: FAIL');
      }
      void job;
      process.exit(result.status === 'dead_letter' && result.dlq_count >= 1 ? 0 : 1);
      break;
    }
    case 'queue:audit': {
      // queue-2 AC-2: durable-effect audit trail (outbox + inbox + fencing).
      const key = args.positional[1];
      if (!key) {
        console.error('error: queue:audit requires <key> (idempotency key)');
        process.exit(2);
      }
      const { auditEffect } = await import('../queue/durable-effect.ts');
      const result = await auditEffect({ key });
      if (args.json) {
        // Top-level count fields (effect_count/outbox_count/inbox_dedupe_count)
        // + fencing_token — the contract the queue-4 RED audit + operators read.
        console.log(
          JSON.stringify(
            {
              key: result.key,
              effect_count: result.counts.effects,
              outbox_count: result.counts.outbox,
              inbox_dedupe_count: result.counts.inbox,
              fencing_token: result.fenceToken,
              outbox: result.outbox,
              effect: result.effect,
              inbox: result.inbox,
              counts: result.counts,
              fenceToken: result.fenceToken,
            },
            null,
            2
          )
        );
      } else {
        console.log('holo queue:audit — durable-effect trail');
        console.log(`  key=${result.key}`);
        console.log(
          `  outbox_count: ${result.counts.outbox} (status=${result.outbox.status ?? '—'})`
        );
        console.log(`  effect_count: ${result.counts.effects} (id=${result.effect.id ?? '—'})`);
        console.log(
          `  inbox_dedupe_count: ${result.counts.inbox} (outcome=${result.inbox.outcome ?? '—'})`
        );
        console.log(`  fencing_token: ${result.fenceToken ?? '—'}`);
        const ok =
          result.counts.outbox === 1 &&
          result.counts.effects === 1 &&
          result.counts.inbox === 1 &&
          Boolean(result.fenceToken);
        console.log(ok ? '  status: OK' : '  status: INCOMPLETE');
      }
      process.exit(result.counts.outbox >= 1 && result.counts.inbox >= 1 ? 0 : 1);
      break;
    }
    case 'evals:run': {
      // obs-3: score versioned fixture via local judge; persist with versions
      const sample = args.sample ?? args.positional[1] ?? null;
      if (!sample || sample.trim().length === 0) {
        console.error('error: evals:run requires --sample <known-good|deliberately-bad>');
        process.exit(2);
      }
      const {
        runEvalSample,
        DatasetNotFoundError,
        SampleNotFoundError,
        BaselineNotFoundError,
        RubricNotFoundError,
        JudgeUnavailableError,
        JudgeInvalidScoreError,
        EvalScoreValidationError,
      } = await import('../evals/index.ts');

      try {
        const result = await runEvalSample({
          sample,
          datasetVersion: args.dataset ?? undefined,
          runId: args.runId ?? undefined,
          judgeEndpointOverride: args.judgeEndpoint ?? undefined,
        });
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('holo evals:run — local judge versioned score');
          console.log(`  sample:            ${result.sampleId}`);
          console.log(`  datasetVersion:    ${result.datasetVersion}`);
          console.log(`  score:             ${result.score}`);
          console.log(`  baseline:          ${result.baseline}`);
          console.log(`  meetsBaseline:     ${result.meetsBaseline}`);
          console.log(`  tag:               ${result.tag}`);
          console.log(`  runId:             ${result.runId}`);
          console.log(`  scoreId:           ${result.scoreId}`);
          console.log(`  judgeModelVersion: ${result.judgeModelVersion}`);
          console.log(`  promptVersion:     ${result.promptVersion}`);
          console.log(`  rubricVersion:     ${result.rubricVersion}`);
          console.log(`  baselineVersion:   ${result.baselineVersion}`);
          console.log(`  judgeEndpoint:     ${result.judgeEndpoint}`);
          console.log(result.ok ? '  status: OK' : '  status: FAIL');
        }
        process.exit(result.ok ? 0 : 1);
      } catch (err) {
        const code =
          err instanceof JudgeUnavailableError
            ? 'JUDGE_UNAVAILABLE'
            : err instanceof DatasetNotFoundError
              ? 'DATASET_NOT_FOUND'
              : err instanceof SampleNotFoundError
                ? 'SAMPLE_NOT_FOUND'
                : err instanceof BaselineNotFoundError
                  ? 'BASELINE_NOT_FOUND'
                  : err instanceof RubricNotFoundError
                    ? 'RUBRIC_NOT_FOUND'
                    : err instanceof JudgeInvalidScoreError
                      ? 'JUDGE_INVALID_SCORE'
                      : err instanceof EvalScoreValidationError
                        ? 'EVAL_SCORE_VALIDATION'
                        : err && typeof err === 'object' && 'code' in err
                          ? String((err as { code: unknown }).code)
                          : 'EVAL_FAILED';
        const message = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.log(JSON.stringify({ ok: false, errorCode: code, error: message }, null, 2));
        } else {
          console.error(`error code: ${code}`);
          console.error(message);
        }
        // Explicit JUDGE_UNAVAILABLE on stderr for greppability (AC-5)
        if (code === 'JUDGE_UNAVAILABLE') {
          console.error('error code: JUDGE_UNAVAILABLE');
        }
        process.exit(1);
      }
      break;
    }
    case 'evals:drift': {
      // obs-3: longitudinal drift over immutable eval_scores
      const datasetVersion = args.dataset ?? args.positional[1] ?? 'research_v1';
      const limit = Math.max(1, Number.parseInt(args.limit ?? '500', 10) || 500);
      const { queryDrift } = await import('../evals/index.ts');
      try {
        const report = await queryDrift({
          datasetVersion,
          limit,
        });
        if (args.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log('holo evals:drift — longitudinal versioned scores');
          console.log(`  datasetVersion: ${report.datasetVersion}`);
          console.log(`  entryCount:     ${report.entryCount}`);
          for (const e of report.entries) {
            console.log(
              `  score=${e.score.toFixed(3)} sample=${e.sampleId} ` +
                `model=${e.modelVersion} prompt=${e.promptVersion} ` +
                `run=${e.runId} at=${e.createdAt}`
            );
          }
          console.log(report.entryCount > 0 ? '  status: OK' : '  status: EMPTY');
        }
        process.exit(0);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.log(JSON.stringify({ ok: false, error: message }, null, 2));
        } else {
          console.error(`holo evals:drift failed: ${message}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'evals:ci': {
      // obs-4: fail-closed CI gate — threshold + deterministic invariants
      const fixture = args.fixture ?? args.positional[1] ?? null;
      if (!fixture || fixture.trim().length === 0) {
        console.error(
          'error: evals:ci requires --fixture <known-good|deliberately-bad|deterministic-invariant-regression|invalid-config>'
        );
        process.exit(2);
      }
      const { runCiGate } = await import('../evals/index.ts');
      try {
        const result = await runCiGate({
          fixture,
          datasetVersion: args.dataset ?? undefined,
          judgeEndpointOverride: args.judgeEndpoint ?? undefined,
          runId: args.runId ?? undefined,
        });
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('holo evals:ci — threshold + deterministic invariant gate');
          console.log(`  fixture:            ${result.fixture}`);
          console.log(`  datasetVersion:     ${result.datasetVersion ?? '—'}`);
          console.log(`  baselineVersion:    ${result.baselineVersion ?? '—'}`);
          console.log(`  modelVersion:       ${result.modelVersion ?? '—'}`);
          console.log(`  promptVersion:      ${result.promptVersion ?? '—'}`);
          console.log(`  score:              ${result.score ?? '—'}`);
          console.log(`  baseline:           ${result.baseline ?? '—'}`);
          console.log(`  threshold:          ${result.threshold ?? '—'}`);
          console.log(`  verdict:            ${result.verdict}`);
          console.log(`  exitCode:           ${result.exitCode}`);
          console.log(`  failureReason:      ${result.failureReason ?? '—'}`);
          console.log(`  exitReason:         ${result.exitReason ?? '—'}`);
          console.log(`  errorCode:          ${result.errorCode ?? '—'}`);
          console.log(`  runId:              ${result.runId ?? '—'}`);
          if (result.deterministicFailures.length > 0) {
            console.log('  deterministicFailures:');
            for (const f of result.deterministicFailures) {
              console.log(`    - ${f.invariantId}: ${f.reason}`);
            }
          }
          console.log(result.verdict === 'passed' ? '  status: OK' : '  status: FAIL');
        }
        process.exit(result.exitCode);
      } catch (err) {
        const code =
          err && typeof err === 'object' && 'code' in err
            ? String((err as { code: unknown }).code)
            : 'EVAL_CI_FAILED';
        const message = err instanceof Error ? err.message : String(err);
        const payload = {
          fixture,
          verdict: 'failed' as const,
          exitCode: 1,
          errorCode: code,
          failureReason: code === 'INVALID_THRESHOLD' ? 'invalid_threshold' : 'eval_ci_failed',
          exitReason: message,
          score: null,
          threshold: null,
          baseline: null,
          datasetVersion: null,
          baselineVersion: null,
          modelVersion: null,
          promptVersion: null,
          deterministicFailures: [] as Array<{ invariantId: string; reason: string }>,
          runId: null,
          scoreId: null,
          sampleId: null,
          meetsThreshold: false,
          invariantPassed: false,
        };
        if (args.json) {
          console.log(JSON.stringify(payload, null, 2));
        } else {
          console.error(`error code: ${code}`);
          console.error(message);
        }
        process.exit(1);
      }
      break;
    }
    case 'mission': {
      // obs-1: holo mission run research --goal '...' [--json]
      const sub = args.positional[1];
      const kind = args.positional[2];
      if (sub !== 'run' || kind !== 'research') {
        console.error(
          sub
            ? `unknown command: mission ${sub}${kind ? ` ${kind}` : ''}`
            : 'error: mission requires subcommand (run research)'
        );
        console.error("Usage: holo mission run research --goal '<text>' [--json]");
        process.exit(2);
      }
      const goal = args.goal ?? args.prompt;
      if (!goal || goal.trim().length === 0) {
        console.error('error: mission run research requires --goal <text>');
        process.exit(2);
      }

      const { runResearchMission } = await import('../observability/mission-research.ts');
      const { LANGFUSE_EXPORT_FAILED, LangfuseExportError } = await import(
        '../observability/langfuse-exporter.ts'
      );

      try {
        const result = await runResearchMission({
          goal,
          role: args.role ?? 'divergent',
          runId: args.runId ?? undefined,
          throwOnExportFailure: true,
        });
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('holo mission run research — Langfuse per-run trace');
          console.log(`  runId:        ${result.runId}`);
          console.log(`  traceId:      ${result.traceId ?? '—'}`);
          console.log(`  serviceName:  ${result.serviceName}`);
          console.log(`  role:         ${result.role}`);
          console.log(`  langfuseOk:   ${result.langfuseExportOk}`);
          console.log(`  text:         ${(result.text ?? '').slice(0, 200)}`);
          console.log(
            result.ok ? '  status: OK' : `  status: FAIL (${result.errorCode ?? 'error'})`
          );
        }
        process.exit(result.ok ? 0 : 1);
      } catch (err) {
        const missionResult =
          err && typeof err === 'object' && 'missionResult' in err
            ? (err as { missionResult: Record<string, unknown> }).missionResult
            : null;
        const code =
          err instanceof LangfuseExportError
            ? LANGFUSE_EXPORT_FAILED
            : ((missionResult?.errorCode as string | undefined) ?? 'MISSION_FAILED');
        const message = err instanceof Error ? err.message : String(err);
        const payload = missionResult ?? {
          ok: false,
          langfuseExportOk: false,
          errorCode: code,
          error: message,
          serviceName: 'holocron-platform',
          traceId: null,
        };
        if (args.json) {
          console.log(JSON.stringify(payload, null, 2));
        } else {
          console.error(`error code: ${code}`);
          console.error(message);
          console.error('green Langfuse verdict: false');
        }
        // Always surface the contract code on stderr for non-JSON greppability.
        if (code === LANGFUSE_EXPORT_FAILED) {
          console.error(`error code: ${LANGFUSE_EXPORT_FAILED}`);
        }
        process.exit(1);
      }
      break;
    }
    default:
      console.error(`unknown command: ${args.command}`);
      printHelp();
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
