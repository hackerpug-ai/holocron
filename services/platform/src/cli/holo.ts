#!/usr/bin/env bun
/**
 * holo — operator CLI for MK-VI migration tooling.
 * Sprint 02: catalog:verify | catalog:coverage | catalog:merges | catalog:reconcile | catalog:assets
 * Sprint 03: mcp:verify-manifest | mcp:manifest-schema | mcp:manifest-replay | mcp:list-mutations
 * Sprint 04: compat:spike [--json] [--print-trace]
 * Sprint 04 schema-1: db:status
 * Sprint 04 schema-2: db:migrate | db:probe | db:verify | db:push
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
  db:probe              Live probes: --jsonb cardData | --status
  db:verify             Live verify: --merges (analysis/research trios)
  db:push               Push Drizzle schema (dev convenience; prefer db:migrate)

Options:
  --export <dir>        Path to unzipped convex export (or $CONVEX_EXPORT_DIR)
  --catalog <file>      Path to 12-convex-source-catalog.yaml
  --manifest <file>     Path to 14-mcp-compatibility-manifest.yaml (mcp:* commands)
  --fixtures-dir <dir>  Path to fixtures directory (mcp:verify-manifest, overrides default)
  --protocol            (mcp:verify-manifest) print protocol pin summary
  --jsonb <column>      (db:probe) polymorphic jsonb round-trip column (e.g. cardData)
  --status              (db:probe) status CHECK constraint probe
  --merges              (db:verify) assert analysis/research merge collapse
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
    } else if (a === '--jsonb') {
      args.jsonbColumn = argv[++i] ?? null;
    } else if (a.startsWith('--jsonb=')) {
      args.jsonbColumn = a.slice('--jsonb='.length);
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

  const isMcpCommand = args.command.startsWith('mcp:');
  const catalog: SourceCatalog | null = isMcpCommand ? null : loadCatalog(args.catalogPath);

  // For catalog commands, catalog is guaranteed non-null (loaded above when !isMcpCommand).
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
      console.error('error: db:probe requires --jsonb <column> or --status');
      process.exit(2);
      break;
    }
    case 'db:verify': {
      if (!args.mergesVerify) {
        console.error('error: db:verify requires --merges');
        process.exit(2);
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
