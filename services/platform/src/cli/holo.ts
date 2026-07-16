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
 */
import { resolve } from 'node:path';

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
  --run-id <id>         (infer:call --escape / evidence:revise) run id for ledger
  --ceiling <usd>       (budget:set) escape budget ceiling in USD
  --poll                (infer:degraded) run one real health probe (may auto-resume)
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
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      args.help = true;
    } else if (a === '--json') {
      args.json = true;
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
          const { runBudgetedEscape, BudgetExceededError } = await import(
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
          console.log(`  spent:     ${status.spent}`);
          console.log(`  ceiling:   ${status.ceiling}`);
          console.log(`  remaining: ${status.remaining}`);
          console.log(`  escapes:   ${status.escapeCount}`);
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
