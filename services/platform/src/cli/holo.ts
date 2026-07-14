#!/usr/bin/env bun
/**
 * holo — operator CLI for MK-VI migration tooling.
 * Sprint 02: catalog:verify | catalog:coverage | catalog:merges | catalog:reconcile | catalog:assets
 */
import { resolve } from 'node:path';
import { buildAssetInventory, formatAssetsText } from '../catalog/assets';
import { defaultCatalogPath, loadCatalog } from '../catalog/catalog-loader';
import { buildCoverageReport, formatCoverageText } from '../catalog/coverage';
import { readExport } from '../catalog/export-reader';
import { buildMergesReport, formatMergesText } from '../catalog/merges';
import { buildReconcileReport, formatReconcileText } from '../catalog/reconcile';
import { buildVerifyReport, formatVerifyText } from '../catalog/verify';

interface CliArgs {
  command: string;
  exportDir: string | null;
  catalogPath: string;
  json: boolean;
  dryRun: boolean;
  help: boolean;
}

function printHelp(): void {
  console.log(`holo — holocron operator CLI

Usage:
  bun services/platform/src/cli/holo.ts <command> [options]

Commands:
  catalog:verify      Coverage build-gate (60/60 tables + fields + storage refs)
  catalog:coverage    Per-field + per-storage-ref mapping with owner/approval
  catalog:merges      Business 12→3 + research 5→3 collapse proof
  catalog:reconcile   Per-table source vs expected-target; unexplained variance
  catalog:assets      Per-object retained storage inventory (sha256/bytes/mime)

Options:
  --export <dir>      Path to unzipped convex export (or $CONVEX_EXPORT_DIR)
  --catalog <file>    Path to 12-convex-source-catalog.yaml
  --json              Emit JSON instead of text
  --dry-run           (catalog:reconcile) dry-run mode (default)
  -h, --help          Show help
`);
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: '',
    exportDir: process.env.CONVEX_EXPORT_DIR ?? null,
    catalogPath: defaultCatalogPath(),
    json: false,
    dryRun: true,
    help: false,
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
    } else if (a === '--export') {
      args.exportDir = argv[++i] ?? null;
    } else if (a === '--catalog') {
      args.catalogPath = resolve(argv[++i] ?? args.catalogPath);
    } else if (a.startsWith('--export=')) {
      args.exportDir = a.slice('--export='.length);
    } else if (a.startsWith('--catalog=')) {
      args.catalogPath = resolve(a.slice('--catalog='.length));
    } else if (a.startsWith('-')) {
      console.error(`unknown flag: ${a}`);
      process.exit(2);
    } else {
      positional.push(a);
    }
  }
  args.command = positional[0] ?? '';
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

  const catalog = loadCatalog(args.catalogPath);

  switch (args.command) {
    case 'catalog:verify': {
      // Prefer export cross-check; if no export, still validate catalog self-consistency
      // but fail closed if export is expected for completeness.
      const exp = args.exportDir ? readExport(requireExport(args.exportDir)) : null;
      // When no export provided, still run catalog-only checks (tables/fields/storage).
      // Human gate and integration tests always pass --export.
      const report = buildVerifyReport(catalog, exp);
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
      const report = buildCoverageReport(catalog);
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
      const report = buildMergesReport(catalog);
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
      const report = buildReconcileReport(catalog, exp);
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
      const inv = buildAssetInventory(catalog, exp);
      if (args.json) {
        console.log(JSON.stringify(inv, null, 2));
      } else {
        console.log(formatAssetsText(inv));
      }
      process.exit(inv.ok ? 0 : 1);
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
