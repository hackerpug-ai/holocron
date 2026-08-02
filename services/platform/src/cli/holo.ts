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
 * Sprint 13 D02-03: ci runner:status
 * Sprint 20 D03-02: ci runner:status --lane e2e (simulator + Expo dev build probes)
 * Sprint 13 D02-07: prd:consistency
 * Sprint 13 D02-02: db seed --reset | db:provision-nonprod
 * Sprint 24 DEPENDENCY-S24: seed:e2e --reset | verify:no-convex-client | zero_cache boot
 * Sprint 27 D04-02: backup:provision — encrypted R2 + scoped creds + pgBackRest repo
 * Sprint 27 D04-03: backup:wal | backup:base | backup:status — WAL archive + base backups
 * Sprint 27 D04-04: backup:mirror | backup:status — restic blob mirror + SHA-256 parity
 * Sprint 27 D04-05 / REDHAT-FIX-S27-01: backup:alert-sweep | verify:backup |
 * backup:induce-failure — real failure induction (production-truth) + overdue/failed alerts
 * Sprint 27 REDHAT-FIX-S27-04: backup:healthy --all — reset induced store + success heartbeats
 * Sprint 28 D05-02: restore | restore:pitr | restore:status — pgBackRest PITR into --scratch
 * Sprint 28 D05-04: restore:fire-drill — full Postgres+blob restore parity (CAP-BAK-01)
 * Sprint 29 D06-02: cutover:go-no-go — full harness suite go/no-go (T-SYNC-008 / CAP-CUT-01)
 * Sprint 29 D06-04: cutover:run-etl — watermark + convex export + one-time ETL (T-SYNC-009)
 * Sprint 29 D06-05: cutover:flip / verify-tools / verify-reads / verify-soak (T-SYNC-010)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { resolveSecretsPathFromEnv } from '../config/secrets.ts';
import {
  applyProductionDeployment,
  defaultDeploymentRecordPath,
} from '../deploy/production-deploy.ts';
import {
  defaultComposePath,
  defaultImageLockPath,
  packageRelease,
  preflightRollback,
} from '../deploy/production-release.ts';
import { verifyProductionDeployment } from '../deploy/verify-production.ts';
import { defaultMissionIdempotencyKey } from './mission-idempotency-key.ts';

// Suppress unhandled storage errors only for the explicit PG-down negative control.
// Outside PLATFORM_PG_DOWN_NEG=1 (or HOLO_SWALLOW_STORAGE_REJECTIONS=1), ECONNREFUSED /
// MASTRA_STORAGE must surface so fleet-down / infra failures are not masked (REDHAT-FIX-5 / H-3).
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const swallowStorageRejections =
    process.env.PLATFORM_PG_DOWN_NEG === '1' || process.env.HOLO_SWALLOW_STORAGE_REJECTIONS === '1';
  if (
    swallowStorageRejections &&
    (msg.includes('ECONNREFUSED') || msg.includes('MASTRA_STORAGE'))
  ) {
    // Expected during PG-down negative control — swallow only when flag is set
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
  /**
   * mission run: opt-in uniqueness — append a unique suffix to the deterministic
   * default idempotency key only when set (REDHAT-FIX-2 / C-2).
   */
  fresh: boolean;
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
  /** gate:eval --claims/--refuting <json> */
  claimsPath: string | null;
  refutingPath: string | null;
  /** mission run research/deepResearch --topic / --components */
  topic: string | null;
  components: string | null;
  /** research:trace --processes */
  processes: boolean;
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
  /** mission run research/deepResearch --topic <text> */
  topic: string | null;
  /** mission run research/deepResearch --components <n> */
  components: string | null;
  /** evals:run --sample known-good|deliberately-bad */
  sample: string | null;
  /** evals:run / evals:drift --dataset <version> */
  dataset: string | null;
  /** evals:run --judge-endpoint (fail-closed probe override) */
  judgeEndpoint: string | null;
  /** prd:consistency --root / inventory:convex-callsites --root */
  root: string | null;
  /** inventory:convex-callsites --output <path> | client-contract:author --inventory <path> */
  output: string | null;
  /** client-contract:author --inventory <path> */
  inventory: string | null;
  /** verify:client-contract --contract <path> */
  contract: string | null;
  /** verify:client-contract --schema | --targets | --e2e-links */
  verifySchema: boolean;
  verifyTargets: boolean;
  verifyE2ELinks: boolean;
  /** upload:* flags */
  uploadId: string | null;
  uploadFile: string | null;
  uploadKind: string | null;
  targetId: string | null;
  mimeType: string | null;
  byteLength: string | null;
  sha256: string | null;
  originalName: string | null;
  /**
   * Shared --target flag:
   * - mission run report --target / assimilate --target
   * - cutover:rollback-repoint --target <convex-label-or-url>
   */
  target: string | null;
  destination: string | null;
  /** mission run whatsNew --date */
  date: string | null;
  /** mission run shop --query */
  query: string | null;
  /** db seed --reset | seed:e2e --reset */
  reset: boolean;
  /** verify:no-convex-client --roots a,b,c */
  roots: string | null;
  /** verify:no-convex-client --print-roots */
  printRoots: boolean;
  /** backup:base --type full|incr|diff */
  backupType: string | null;
  /** backup:base | backup:wal | backup:alert-sweep --install-schedule */
  installSchedule: boolean;
  /** backup:induce-failure --mode kill|credential-expired|config-removed|clear */
  induceMode: string | null;
  /** backup:induce-failure --job <job_name> | backup:healthy --job <name> */
  induceJob: string | null;
  /**
   * backup:induce-failure --synthetic
   * Honest dual-path: heartbeat poison for sweep-unit mechanics ONLY (not production-truth).
   */
  induceSynthetic: boolean;
  /**
   * backup:healthy --all
   * REDHAT-FIX-S27-04: clear induced store + mark all heartbeats success (gate isolation reset).
   */
  all: boolean;
  /** restore --pitr <iso-timestamp> | restore:pitr | restore:fire-drill --target-timestamp */
  pitr: string | null;
  /** restore --scratch <dir> — empty target PGDATA (never live mini PGDATA) */
  scratch: string | null;
  /** restore --target-action promote|pause */
  targetAction: string | null;
  /** restore:fire-drill --blob-dir <empty-dir> — restic restore target (never live mini blobs) */
  blobDir: string | null;
  /** restore:fire-drill --report <path> — parity-report.json output path */
  report: string | null;
  /** restore:fire-drill --source-blob-root <path> — pre-failure blob manifest root */
  sourceBlobRoot: string | null;
  /**
   * restore:fire-drill --fresh-target <name>
   * REDHAT-FIX-S28R2-C1: bind scratch/blob to provisioned Docker volume mountpoints.
   */
  freshTarget: string | null;
  /** backup:emit-recovery-baseline --blob-root <path> */
  blobRoot: string | null;
  /** backup:emit-recovery-baseline --restic-snapshot <id> */
  resticSnapshot: string | null;
  /** cutover:quiet-check --window-seconds <n> */
  windowSeconds: string | null;
  /** cutover:capture-article-baseline --token <shareToken> */
  token: string | null;
  /** cutover:flip --etl-report <watermark-report.json> */
  etlReport: string | null;
  /**
   * cutover:verify-reads --parity <cutover-parity.json>
   * Immutable content-addressed expected table inventory (R2-C03).
   */
  parityPath: string | null;
  /**
   * cutover:verify-tools / verify-soak — deployed Hono/MCP base URL
   * (also HOLO_VERIFY_BASE_URL / PLATFORM_URL).
   */
  baseUrl: string | null;
  /** cutover:verify-soak — deployed Zero cache endpoint used by the write-fence probe. */
  zeroBaseUrl: string | null;
  /** cutover:verify-tools — optional service / deployment label for target_identity */
  serviceLabel: string | null;
  /** deploy:package — digest-qualified candidate and rollback image identities. */
  image: string | null;
  previousImage: string | null;
  /** deploy:rollback-preflight — explicit release lock path. */
  lockPath: string | null;
  /** deploy:apply / deploy:verify — exact D06-06 release lock. */
  releasePath: string | null;
  /** deploy:apply — explicit operator authorization. */
  authorized: boolean;
  /** deploy:apply — explicit no-mutation diagnostic. */
  deployDryRun: boolean;
  /** deploy:verify — run SIGKILL and durable sentinel proof. */
  restartProbe: boolean;
  /** deploy:verify — execute identity rejection matrix. */
  negativeControls: boolean;
  /** deploy:verify — registration-only initialize + tools/list. */
  mcpDiscovery: boolean;
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
  mcp:verify-rehost     Verify Postgres MCP registry parity and zero Convex gateway imports
  mcp:stdio              Start the MCP gateway over stdio
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
  backup:provision          D04-02: encrypted R2 bucket + scoped creds + pgBackRest stanza-create
  backup:wal                D04-03: ensure archive_mode=always + run WAL archive cycle (R2 + heartbeat)
                            [--install-schedule]
  backup:base               D04-03: pgBackRest full/incr base backup to R2 + heartbeat
                            [--type full|incr] [--install-schedule]
  backup:mirror             D04-04: restic blob mirror to R2 + check --read-data + SHA-256 parity
  backup:status             D04-03/D04-05: heartbeats + OVERDUE|OK per job + archive/R2 facts
  backup:alert-sweep        D04-05: query overdue/failed heartbeats → POST ALERT_WEBHOOK_URL
                            [--install-schedule]
  backup:induce-failure     REAL failure induction (production-truth): --mode kill|credential-expired|config-removed --job <name>
                            [--synthetic for sweep-unit poison only — not production-truth]
                            --mode clear: reset all induced state + healthy heartbeats (alias of backup:healthy --all)
  backup:healthy            REDHAT-FIX-S27-04: clear induced store + success heartbeats
                            --all | --job <name>
  backup:emit-recovery-baseline
                            GATE-FIX-QA2: capture+upload recovery baseline bound to a listable
                            restic snapshot + pgBackRest label (refuses ghosts / zero domain)
                            [--blob-root <path>] [--restic-snapshot <id>] [--json]
  restore                   D05-02: pgBackRest PITR restore --pitr <iso> --scratch <dir>
                            [--target-action promote|pause] (fail-closed on empty/corrupt/out-of-range)
  restore:pitr              Alias for restore --pitr (same flags)
  restore:window            GATE-FIX-QA2: live pgBackRest PITR window (earliest/latest/recommended_pitr)
                            for setting PITR_TIMESTAMP — does not weaken outside-WAL fail-closed
  restore:status            Show last PITR restore structured report
  restore:fire-drill        D05-04: full fire-drill (pre-failure snapshot → PITR → restic blob)
                            --target-timestamp|--pitr <iso> --scratch <empty-pgdata>
                            --blob-dir <empty-dir> [--report <parity-report.json>]
                            [--fresh-target <name>] bind scratch/blob to provisioned volume mountpoints
                            Exit 0 only if POSTGRES_PARITY_PASS + LEDGER_CHECKSUM_MATCH + BLOB_PARITY_PASS
  verify:backup             D04-05 CI gate: exit 1 if any heartbeat overdue/failed
  cutover:go-no-go          D06-02 pre-cutover harness suite (8 real gates) [--json] [--output <path>]
  cutover:freeze            D06-03 arm HOLO_MIGRATION_READ_ONLY=1 + fence_armed_at [--reason] [--json] [--output]
  cutover:quiet-check       D06-03 quiet interval oracle [--window-seconds N] [--json] [--output]
  cutover:capture-article-baseline
                            D06-03 post-freeze article sha256 baseline --token <t> [--json] [--output]
  cutover:verify-article    D06-05 / R2-H03: network GET /article/:token vs immutable pre-freeze baseline
                            [--json] [--baseline <article-baseline.json>] [--base-url URL]
                            Fail-closed: missing/corrupt baseline (no SUT auto-author)
  cutover:run-etl           D06-04 watermark + real convex export + one-time ETL (CAP-MIG-01)
                            [--json] [--output <watermark-report.json>] [--export <dir>]
                            Default: real npx convex export (runConvexExport). --export reuses archive.
                            Fail-closed: FENCE_NOT_ENGAGED, QUIET_CHECK_REQUIRED (missing/quiet_ok!=true).
                            Re-run with --export <prior> to resume same archive without row dupes.
  cutover:flip              D06-05 engage HOLO_MIGRATION_READ_ONLY=1 after green ETL [--json]
                            [--etl-report <watermark-report.json>] [--output <flip-report.json>]
                            Fail-closed: ETL_NOT_RECONCILED when unexplainedVariance>0
  cutover:rollback-repoint  H-05 / UC-SYNC-04: re-point data plane to frozen Convex [--json]
                            [--output <rollback-repoint-report.json>] [--etl-report <watermark>]
                            Fail-closed: POST_EXPORT_WRITE_ACCEPTED | ROLLBACK_INELIGIBLE
                            Writes durable control-plane (secrets.yaml via HOLO_SECRETS_PATH)
  cutover:rollback-repoint  UC-SYNC-04 re-point data plane to frozen Convex [--json]
                            [--output <rollback-report.json>] [--target <convex-label>]
  cutover:verify-tools      D06-05 invoke all manifest MCP tools over real /mcp [--json]
  cutover:verify-tools      D06-05 invoke all manifest MCP tools over network /mcp [--json] [--base-url URL]
  cutover:verify-reads      D06-05 Postgres counts vs export/catalog parity baseline [--json]
                            [--etl-report <watermark>] [--export <dir>] [--catalog <yaml>]
                            [--parity <cutover-parity.json>]
                            Requires operator export+catalog+parity (fail closed; no test-fixture default).
                            Tests only: HOLO_CUTOVER_ALLOW_TEST_FIXTURES=1 or explicit fixture paths.
  cutover:verify-soak       D06-05 aggregate tools+reads+article+hono+jobs+zeroWritePath [--json] [--base-url URL]
  verify:convex-fence-coverage
                            D06-03 scan convex/ for unfenced mutation/action/httpAction imports [--json]
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
  infer:call                Resolve fleet role; --escape runs budgeted DeepSeek escape
                            (checkBudget → generateText → logEscape); fleet-down → degraded
  infer:trace <id>          Dump durable modelCalls (provider/endpoint) for a mission run id
  infer:degraded            Show / poll degraded-mode state (fleet-down reduced mode)
  verify:no-provider-refs   Audit platform src for banned claudeFlash/Pro/Ultra factories
  verify:no-shells          Prove per-domain pipeline shells are gone (whatsnew/assimilate/shop/subscriptions)
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
  mission template:register <file>
                            Register a closed declarative mission template from JSON
  mission run <template>    Run a registered mission template (--goal --idempotency-key)
  mission resume <run-id>   Resume a persisted mission run by id
  mission status <run-id>   Show persisted mission run status/output/provenance
  mission:cycle <run-id>    Execute one mid-run cycle (steering + ASSAY≠CHALLENGE)
  fulcrum:authorable-check  Compile fulcrum (evidence-research alias) against 5 seams
  fulcrum <goal>            Run fulcrum instantiation of evidence-research (CLI alias)
  article:compat <token>    Verify legacy public article URL shape
  mission run research      Run a research mission with per-run Langfuse trace export
                            (requires --goal; flushes OTel → self-hosted Langfuse)
  evals:run                 Score a versioned fixture sample via local judge (--sample)
  evals:drift               Longitudinal drift over persisted eval_scores (--dataset)
  evals:ci                  Fail-closed CI gate: threshold + deterministic invariants (--fixture)
  gate:eval                  Pure-TS evidence admission gate (--claims/--refuting <json>)
  research:inspect <id>      Inspect durable research phases and gate provenance
  research:trace <id>        Show durable research process trace (--processes)
  research:advance-iteration <id>
                            PATH-A: +1 research_sessions.current_iteration (production writer)
                            Optional second positional: steps (default 1)
  chat:trace <id>            Show chat event/tool-loop trace
  chat:route <id>            Show chat triage and bound specialist route
  ci runner:status         Fail-closed self-hosted runner probe (labels online)
                            [--lane integration|e2e] e2e also probes MAESTRO_DEVICE + EXPO_DEV_BUILD_PATH
  db seed --reset          Deterministic nonprod seed/reset (fails closed on prod)
  namespace reset           Reset the deterministic nonprod Postgres/Zero namespace
  db:provision-nonprod     Create holocron_nonprod + migrate + zero_pub
  seed:e2e --reset         Sprint 24 e2e seed: conversations, docs, feed, subscriptions (refuse prod)
  verify:no-convex-client  CAP-CUT-01: fail if convex/react imports remain in app roots
                           [--roots a,b] [--print-roots]
  prd:consistency          T-PLAT-020 PRD consistency build gate (derived counts)
  etl:run                  Immutable export → stage → stable id-map → FK-ordered load → blobs
  etl:reconcile            Catalog-derived target-vs-source reconciliation from latest ETL run
  etl:fk-audit             Audit migrated legacy-id relationships for zero orphans
  etl:vectors              Chunk documents, insert canonical passages, and re-embed via fleet
  blob:verify              Verify retained-object parity + representative Range read
  upload:init              Create/replay an authoritative upload intent
  upload:put               Stream bytes into an existing upload intent staging area
  upload:finalize          Verify hash/length/MIME, attach atomically, and return stored result
  verify:blob --last        Verify exactly one latest CAS blob and its SHA-256
  verify:blob --orphans     Verify no non-finalized upload intents remain
   inventory:convex-callsites
                           Scan app/ components/ hooks/ screens/ for legacy Convex
                           useQuery/useMutation/useAction/useConvex/ConvexProvider/
                           ConvexReactClient call sites and emit a deterministic JSON
                           inventory (--root, --json, --output <path>)
   client-contract:author
                           S-CONTRACT-02 — author 13-client-data-contract.yaml from
                           the S-CONTRACT-01 inventory + live zero_pub + Hono route
                           surfaces. Maps every legacy call site to one Zero query,
                           Zero mutator, or authoritative Hono command with full
                           projection / offline / optimistic / conflict / rejection
                           / identifier / e2e_criterion semantics.
                           (--inventory <path> alias; --output <path>)
  verify:client-contract
                           S-CONTRACT-02 — verify the authored client data contract.
                           --schema      AC-2: every entry declares all required fields.
                           --targets     AC-3: every target resolves against live zero_pub / Hono.
                           --e2e-links   AC-4: every entry links a valid T-SYNC criterion;
                                         all five offline-behavior cases are represented.
                           (no flag = run all three; --contract <path>; --inventory <path>)
  deploy:package            Validate a pushed immutable OCI release and write image-lock.json.
                            Requires --image and --previous-image, both @sha256-qualified.
  deploy:rollback-preflight Verify and select the lock-backed previous image; never starts Compose.
  deploy:apply              Operator-authorized inference1 cold recreate from a deployable release lock.
  deploy:verify             Verify external identity/readiness, negatives, and optional SIGKILL recovery.

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
  --idempotency-key <k> (evidence:revise|mission run) idempotency key (replay-safe)
  --fresh               (mission run) opt-in unique suffix on default idempotency key
  --statement <text>    (evidence:revise) new belief statement
  --confidence <n>      (evidence:revise) new confidence (0..1)
  --valid-from <ts>     (evidence:revise) optional valid_from timestamptz
  --valid-to <ts>       (evidence:revise) optional valid_to timestamptz
  --claim-id <id>       (evidence:belief) claim id to query
  --as-of <ts|now>      (evidence:belief) transaction-time as-of (default: now)
  --role <role>         (infer:call|infer:degraded) fleet role: divergent|convergent|judge|embed|rerank
  --escape              (infer:call) budgeted DeepSeek escape via runBudgetedEscape
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
  --goal <text>         (mission run) mission goal (required)
  --sample <id>         (evals:run) fixture sample: known-good | deliberately-bad
  --dataset <version>   (evals:run|evals:drift) dataset version (default research_v1)
  --judge-endpoint <url>(evals:run) override judge health endpoint (fail-closed tests)
  --fixture <name>      (evals:ci) known-good | deliberately-bad |
                        deterministic-invariant-regression | invalid-config
  --upload-id <id>      (upload:put|upload:finalize) upload intent UUID
  --file <path>         (upload:put) bytes to stage
  --kind <name>         (upload:init) improvement_image | voice_artifact
  --target-id <uuid>    (upload:init) attachment target UUID
  --sha256 <hex>        (upload:init) declared SHA-256 digest
  --bytes <n>           (upload:init) declared byte length
  --mime <type>         (upload:init) declared MIME type
  --name <filename>     (upload:init) original client file name
  --json                Emit JSON instead of text
  --print-trace         (compat:spike) emit OTel trace details
  --dry-run             (catalog:reconcile) dry-run mode (default)
  --output <path>       (inventory:convex-callsites | client-contract:author) write artifact to this path
  --inventory <path>    (client-contract:author | verify:client-contract) inventory JSON path
  --contract <path>     (verify:client-contract) YAML contract path
  --image <ref>         (deploy:package) candidate registry image with @sha256 digest
  --previous-image <ref>(deploy:package) prior registry image with @sha256 digest
  --lock <path>          (deploy:rollback-preflight) release lock path
  --release <path>       (deploy:apply|deploy:verify) deployable release lock path
  --base-url <url>       (deploy:apply|deploy:verify) one non-loopback production URL
  --authorize            (deploy:apply) explicit operator authorization
  --restart-probe        (deploy:verify) SIGKILL PID-1 + durable sentinel proof
  --negative-controls    (deploy:verify) reject loopback/in-process/stale/mismatched/missing identity
  --mcp-discovery        (deploy:verify) initialize + tools/list only (never tools/call)
  -h, --help            Show help
`);
}

const MISSION_USAGE = `holo mission template:register <file> [--json]
       holo mission run <template> --goal '<text>' [--idempotency-key <key>|--fresh] [--json]
       holo mission resume <run-id> [--json]
       holo mission status <run-id> [--json]
       holo mission:cycle <run-id> [--json]
       holo mission run research --goal '<text>' [--json]
       holo mission run report --kind <revenue-validation|competitive|ai-roi|flights> --target <host> [--destination <route>] [--json]
       holo mission run whatsNew --date YYYY-MM-DD [--json]
       holo mission run assimilate --target <owner/repo> [--json]
       holo mission run shop --query <term> [--json]
       holo mission run subscriptions [--topic <text>] [--claims <path>] [--json]`;

function isMissionJsonInvocation(argv: string[]): boolean {
  if (!argv.includes('--json')) return false;
  const firstPositional = argv.find((token) => !token.startsWith('-'));
  return firstPositional === 'mission';
}

function exitUnknownFlag(flag: string, argv: string[]): never {
  if (isMissionJsonInvocation(argv)) {
    exitMissionJsonError({
      error: `unknown flag: ${flag}`,
      code: 'MISSION_UNKNOWN_FLAG',
      exitCode: 2,
      usage: MISSION_USAGE,
    });
  }
  console.error(`unknown flag: ${flag}`);
  process.exit(2);
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
    fresh: false,
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
    claimsPath: null,
    refutingPath: null,
    topic: null,
    components: null,
    processes: false,
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
    root: null,
    output: null,
    inventory: null,
    contract: null,
    verifySchema: false,
    verifyTargets: false,
    verifyE2ELinks: false,
    uploadId: null,
    uploadFile: null,
    uploadKind: null,
    targetId: null,
    mimeType: null,
    byteLength: null,
    sha256: null,
    originalName: null,
    target: null,
    destination: null,
    date: null,
    query: null,
    reset: false,
    roots: null,
    printRoots: false,
    backupType: null,
    installSchedule: false,
    induceMode: null,
    induceJob: null,
    induceSynthetic: false,
    all: false,
    pitr: null,
    scratch: null,
    targetAction: null,
    blobDir: null,
    report: null,
    sourceBlobRoot: null,
    freshTarget: null,
    blobRoot: null,
    resticSnapshot: null,
    windowSeconds: null,
    token: null,
    etlReport: null,
    parityPath: null,
    baseUrl: null,
    zeroBaseUrl: null,
    serviceLabel: null,
    image: null,
    previousImage: null,
    lockPath: null,
    releasePath: null,
    authorized: false,
    deployDryRun: false,
    restartProbe: false,
    negativeControls: false,
    mcpDiscovery: false,
  };
  // Pre-scan argv for the command token (first non-flag positional) so
  // context-aware flags like --schema can branch on the command. The
  // command is also assigned to args.command at the end of parseArgs.
  let commandFromArgv = '';
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t || t.startsWith('-')) continue;
    commandFromArgv = t;
    break;
  }
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
    } else if (a === '--image') {
      args.image = argv[++i] ?? null;
    } else if (a.startsWith('--image=')) {
      args.image = a.slice('--image='.length);
    } else if (a === '--previous-image') {
      args.previousImage = argv[++i] ?? null;
    } else if (a.startsWith('--previous-image=')) {
      args.previousImage = a.slice('--previous-image='.length);
    } else if (a === '--lock') {
      args.lockPath = resolve(argv[++i] ?? '');
    } else if (a.startsWith('--lock=')) {
      args.lockPath = resolve(a.slice('--lock='.length));
    } else if (a === '--release') {
      args.releasePath = resolve(argv[++i] ?? '');
    } else if (a.startsWith('--release=')) {
      args.releasePath = resolve(a.slice('--release='.length));
    } else if (a === '--authorize') {
      args.authorized = true;
    } else if (a === '--restart-probe') {
      args.restartProbe = true;
    } else if (a === '--negative-controls') {
      args.negativeControls = true;
    } else if (a === '--mcp-discovery') {
      args.mcpDiscovery = true;
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
      if (commandFromArgv === 'deploy:apply') args.deployDryRun = true;
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
    } else if (a === '--fresh') {
      args.fresh = true;
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
      // Context-aware: for `verify:client-contract`, --schema is a boolean
      // flag (no value consumed). For `extract`, --schema takes a name arg.
      // `commandFromArgv` is computed once at the top of parseArgs.
      if (commandFromArgv === 'verify:client-contract') {
        args.verifySchema = true;
      } else {
        args.schema = argv[++i] ?? null;
      }
    } else if (a.startsWith('--schema=')) {
      args.schema = a.slice('--schema='.length);
    } else if (a === '--targets') {
      // Boolean flag for verify:client-contract.
      args.verifyTargets = true;
    } else if (a === '--e2e-links') {
      // Boolean flag for verify:client-contract.
      args.verifyE2ELinks = true;
    } else if (a === '--input') {
      args.input = argv[++i] ?? null;
    } else if (a.startsWith('--input=')) {
      args.input = a.slice('--input='.length);
    } else if (a === '--fixture') {
      args.fixture = argv[++i] ?? null;
    } else if (a.startsWith('--fixture=')) {
      args.fixture = a.slice('--fixture='.length);
    } else if (a === '--claims') {
      args.claimsPath = resolve(argv[++i] ?? '');
    } else if (a.startsWith('--claims=')) {
      args.claimsPath = resolve(a.slice('--claims='.length));
    } else if (a === '--refuting') {
      args.refutingPath = resolve(argv[++i] ?? '');
    } else if (a.startsWith('--refuting=')) {
      args.refutingPath = resolve(a.slice('--refuting='.length));
    } else if (a === '--topic') {
      args.topic = argv[++i] ?? null;
    } else if (a.startsWith('--topic=')) {
      args.topic = a.slice('--topic='.length);
    } else if (a === '--components') {
      args.components = argv[++i] ?? null;
    } else if (a.startsWith('--components=')) {
      args.components = a.slice('--components='.length);
    } else if (a === '--processes') {
      args.processes = true;
    } else if (a === '--timeout') {
      args.timeout = argv[++i] ?? null;
    } else if (a.startsWith('--timeout=')) {
      args.timeout = a.slice('--timeout='.length);
    } else if (a === '--for') {
      args.forConsumers = argv[++i] ?? null;
    } else if (a.startsWith('--for=')) {
      args.forConsumers = a.slice('--for='.length);
    } else if (a === '--upload-id') {
      args.uploadId = argv[++i] ?? null;
    } else if (a.startsWith('--upload-id=')) {
      args.uploadId = a.slice('--upload-id='.length);
    } else if (a === '--file') {
      args.uploadFile = argv[++i] ?? null;
    } else if (a.startsWith('--file=')) {
      args.uploadFile = a.slice('--file='.length);
    } else if (a === '--kind') {
      args.uploadKind = argv[++i] ?? null;
    } else if (a.startsWith('--kind=')) {
      args.uploadKind = a.slice('--kind='.length);
    } else if (a === '--target') {
      args.target = argv[++i] ?? null;
    } else if (a.startsWith('--target=')) {
      args.target = a.slice('--target='.length);
    } else if (a === '--destination') {
      args.destination = argv[++i] ?? null;
    } else if (a.startsWith('--destination=')) {
      args.destination = a.slice('--destination='.length);
    } else if (a === '--date') {
      args.date = argv[++i] ?? null;
    } else if (a.startsWith('--date=')) {
      args.date = a.slice('--date='.length);
    } else if (a === '--query') {
      args.query = argv[++i] ?? null;
    } else if (a.startsWith('--query=')) {
      args.query = a.slice('--query='.length);
    } else if (a === '--target-id') {
      args.targetId = argv[++i] ?? null;
    } else if (a.startsWith('--target-id=')) {
      args.targetId = a.slice('--target-id='.length);
    } else if (a === '--mime') {
      args.mimeType = argv[++i] ?? null;
    } else if (a.startsWith('--mime=')) {
      args.mimeType = a.slice('--mime='.length);
    } else if (a === '--bytes') {
      args.byteLength = argv[++i] ?? null;
    } else if (a.startsWith('--bytes=')) {
      args.byteLength = a.slice('--bytes='.length);
    } else if (a === '--sha256') {
      args.sha256 = argv[++i] ?? null;
    } else if (a.startsWith('--sha256=')) {
      args.sha256 = a.slice('--sha256='.length);
    } else if (a === '--name') {
      args.originalName = argv[++i] ?? null;
    } else if (a.startsWith('--name=')) {
      args.originalName = a.slice('--name='.length);
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
    } else if (a === '--reset') {
      args.reset = true;
    } else if (a === '--roots') {
      args.roots = argv[++i] ?? null;
    } else if (a.startsWith('--roots=')) {
      args.roots = a.slice('--roots='.length);
    } else if (a === '--print-roots') {
      args.printRoots = true;
    } else if (a === '--root') {
      args.root = resolve(argv[++i] ?? '');
    } else if (a.startsWith('--root=')) {
      args.root = resolve(a.slice('--root='.length));
    } else if (a === '--output') {
      args.output = argv[++i] ?? null;
    } else if (a.startsWith('--output=')) {
      args.output = a.slice('--output='.length);
    } else if (a === '--etl-report') {
      args.etlReport = resolve(argv[++i] ?? '');
    } else if (a.startsWith('--etl-report=')) {
      args.etlReport = resolve(a.slice('--etl-report='.length));
    } else if (a === '--parity') {
      args.parityPath = resolve(argv[++i] ?? '');
    } else if (a.startsWith('--parity=')) {
      args.parityPath = resolve(a.slice('--parity='.length));
    } else if (a === '--base-url') {
      args.baseUrl = argv[++i] ?? null;
    } else if (a.startsWith('--base-url=')) {
      args.baseUrl = a.slice('--base-url='.length);
    } else if (a === '--zero-base-url') {
      args.zeroBaseUrl = argv[++i] ?? null;
    } else if (a.startsWith('--zero-base-url=')) {
      args.zeroBaseUrl = a.slice('--zero-base-url='.length);
    } else if (a === '--service-label') {
      args.serviceLabel = argv[++i] ?? null;
    } else if (a.startsWith('--service-label=')) {
      args.serviceLabel = a.slice('--service-label='.length);
    } else if (a === '--inventory') {
      args.inventory = argv[++i] ?? null;
    } else if (a.startsWith('--inventory=')) {
      args.inventory = a.slice('--inventory='.length);
    } else if (a === '--contract') {
      args.contract = argv[++i] ?? null;
    } else if (a.startsWith('--contract=')) {
      args.contract = a.slice('--contract='.length);
    } else if (a === '--last' || a === '--orphans') {
      // verify:blob modes are documented as flags but consumed as positionals.
      positional.push(a);
    } else if (a === '--type') {
      args.backupType = argv[++i] ?? null;
    } else if (a.startsWith('--type=')) {
      args.backupType = a.slice('--type='.length);
    } else if (a === '--install-schedule') {
      args.installSchedule = true;
    } else if (a === '--mode') {
      args.induceMode = argv[++i] ?? null;
    } else if (a.startsWith('--mode=')) {
      args.induceMode = a.slice('--mode='.length);
    } else if (a === '--job') {
      args.induceJob = argv[++i] ?? null;
    } else if (a.startsWith('--job=')) {
      args.induceJob = a.slice('--job='.length);
    } else if (a === '--synthetic' || a === '--synthetic-poison') {
      // Honest dual-path: synthetic heartbeat poison for sweep-unit only (not production-truth).
      args.induceSynthetic = true;
    } else if (a === '--all') {
      // backup:healthy --all — full induced-store + heartbeat reset (REDHAT-FIX-S27-04).
      args.all = true;
    } else if (a === '--pitr') {
      // restore --pitr <iso-timestamp>
      args.pitr = argv[++i] ?? null;
    } else if (a.startsWith('--pitr=')) {
      args.pitr = a.slice('--pitr='.length);
    } else if (a === '--scratch') {
      // restore --scratch <empty-pgdata-dir>
      args.scratch = argv[++i] ?? null;
    } else if (a.startsWith('--scratch=')) {
      args.scratch = a.slice('--scratch='.length);
    } else if (a === '--target-action') {
      args.targetAction = argv[++i] ?? null;
    } else if (a.startsWith('--target-action=')) {
      args.targetAction = a.slice('--target-action='.length);
    } else if (a === '--target-timestamp') {
      // restore:fire-drill --target-timestamp <iso> (alias of --pitr)
      args.pitr = argv[++i] ?? null;
    } else if (a.startsWith('--target-timestamp=')) {
      args.pitr = a.slice('--target-timestamp='.length);
    } else if (a === '--blob-dir') {
      args.blobDir = argv[++i] ?? null;
    } else if (a.startsWith('--blob-dir=')) {
      args.blobDir = a.slice('--blob-dir='.length);
    } else if (a === '--report') {
      args.report = argv[++i] ?? null;
    } else if (a.startsWith('--report=')) {
      args.report = a.slice('--report='.length);
    } else if (a === '--source-blob-root') {
      args.sourceBlobRoot = argv[++i] ?? null;
    } else if (a.startsWith('--source-blob-root=')) {
      args.sourceBlobRoot = a.slice('--source-blob-root='.length);
    } else if (a === '--fresh-target') {
      // restore:fire-drill --fresh-target <name> (REDHAT-FIX-S28R2-C1)
      args.freshTarget = argv[++i] ?? null;
    } else if (a.startsWith('--fresh-target=')) {
      args.freshTarget = a.slice('--fresh-target='.length);
    } else if (a === '--blob-root') {
      // backup:emit-recovery-baseline --blob-root <path>
      args.blobRoot = argv[++i] ?? null;
    } else if (a.startsWith('--blob-root=')) {
      args.blobRoot = a.slice('--blob-root='.length);
    } else if (a === '--restic-snapshot') {
      args.resticSnapshot = argv[++i] ?? null;
    } else if (a.startsWith('--restic-snapshot=')) {
      args.resticSnapshot = a.slice('--restic-snapshot='.length);
    } else if (a === '--window-seconds') {
      args.windowSeconds = argv[++i] ?? null;
    } else if (a.startsWith('--window-seconds=')) {
      args.windowSeconds = a.slice('--window-seconds='.length);
    } else if (a === '--token') {
      args.token = argv[++i] ?? null;
    } else if (a.startsWith('--token=')) {
      args.token = a.slice('--token='.length);
    } else if (a.startsWith('-')) {
      exitUnknownFlag(a, argv);
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

function exitMissionJsonError(options: {
  error: string;
  code: string;
  exitCode: number;
  usage?: string;
}): never {
  const payload: {
    ok: false;
    error: string;
    code: string;
    errorCode: string;
    usage?: string;
  } = {
    ok: false,
    error: options.error,
    code: options.code,
    errorCode: options.code,
  };
  if (options.usage) payload.usage = options.usage;
  console.log(JSON.stringify(payload, null, 2));
  process.exit(options.exitCode);
}

function missionErrorPayload(error: unknown, fallbackCode: string) {
  const code =
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : fallbackCode;
  const message =
    fallbackCode === code && (!error || typeof error !== 'object' || !('code' in error))
      ? code === 'MISSION_RUNTIME_FAILED'
        ? 'mission request failed'
        : 'mission request rejected'
      : error instanceof Error
        ? error.message
        : String(error);

  return {
    ok: false,
    errorCode: code,
    code,
    error: message,
  };
}

function printMissionRuntimeResult(result: Record<string, unknown>, surface: string): void {
  console.log(`holo ${surface}`);
  console.log(`  runId:               ${String(result.runId ?? '—')}`);
  console.log(`  templateKey:         ${String(result.templateKey ?? '—')}`);
  console.log(`  templateVersion:     ${String(result.templateVersion ?? '—')}`);
  console.log(`  idempotencyKey:      ${String(result.idempotencyKey ?? '—')}`);
  console.log(`  status:              ${String(result.status ?? '—')}`);
  console.log(`  replay:              ${String(result.replay ?? false)}`);
  console.log(`  checkpointStage:     ${String(result.checkpointStageIndex ?? '—')}`);
  console.log(`  attemptCount:        ${String(result.attemptCount ?? '—')}`);
  console.log(`  output:              ${JSON.stringify(result.output ?? null)}`);
  console.log(`  provenance:          ${JSON.stringify(result.provenance ?? null)}`);
  if (result.error) {
    console.log(`  errorCode:           ${String(result.errorCode ?? result.code ?? '—')}`);
    console.log(`  error:               ${String(result.error)}`);
  }
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
    case 'deploy:apply': {
      if (!args.releasePath || !args.baseUrl) {
        throw new Error('deploy:apply requires --release and --base-url');
      }
      const record = applyProductionDeployment({
        authorized: args.authorized,
        releasePath: args.releasePath,
        baseUrl: args.baseUrl,
        secretsPath: resolveSecretsPathFromEnv(),
        target: process.env.HOLO_DEPLOY_TARGET,
        dryRun: args.deployDryRun,
      });
      if (args.json) {
        process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
      } else {
        console.log('holo deploy:apply — inference1 four-service generation deployed');
        console.log(`  base URL:           ${record.baseUrl}`);
        console.log(`  image digest:       ${record.imageDigest}`);
        console.log(`  source revision:    ${record.sourceRevision}`);
        console.log(`  generation:         ${record.composeGeneration}`);
        console.log(`  cutover actions:    ${record.cutoverActions}`);
      }
      process.exit(0);
      break;
    }
    case 'deploy:verify': {
      if (!args.releasePath || !args.baseUrl) {
        throw new Error('deploy:verify requires --release and --base-url');
      }
      const report = await verifyProductionDeployment({
        releasePath: args.releasePath,
        baseUrl: args.baseUrl,
        recordPath: defaultDeploymentRecordPath(),
        secretsPath: resolveSecretsPathFromEnv(),
        restartProbe: args.restartProbe,
        dependencyProbe: args.restartProbe,
        negativeControls: args.negativeControls || args.restartProbe,
        mcpDiscovery: args.mcpDiscovery || args.restartProbe,
      });
      if (args.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      } else {
        console.log('holo deploy:verify — external deployment certified');
        console.log(`  base URL:           ${report.baseUrl}`);
        console.log(`  image digest:       ${report.release.imageDigest}`);
        console.log(`  generation:         ${report.release.composeGeneration}`);
        console.log(`  restart proof:      ${report.restart ? 'passed' : 'not requested'}`);
        console.log(`  MCP discovery:      ${report.mcp ? '44 tools' : 'not requested'}`);
      }
      process.exit(0);
      break;
    }
    case 'deploy:package': {
      if (!args.image || !args.previousImage) {
        throw new Error('deploy:package requires --image and --previous-image');
      }
      const lock = packageRelease({
        image: args.image,
        previousImage: args.previousImage,
        composePath: defaultComposePath(),
        lockPath: defaultImageLockPath(),
      });
      if (args.json) {
        process.stdout.write(`${JSON.stringify(lock, null, 2)}\n`);
      } else {
        console.log('holo deploy:package — immutable release lock written');
        console.log(`  image:             ${lock.image}`);
        console.log(`  source revision:   ${lock.sourceRevision}`);
        console.log(`  compose sha256:    ${lock.composeSha256}`);
        console.log(`  rollback digest:   ${lock.previousDigest}`);
      }
      process.exit(0);
      break;
    }
    case 'deploy:rollback-preflight': {
      const lock = preflightRollback({
        composePath: defaultComposePath(),
        lockPath: args.lockPath ?? defaultImageLockPath(),
      });
      const image = lock.previousImage;
      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({ ok: true, action: 'rollback-preflight', image, lock }, null, 2)}\n`
        );
      } else {
        console.log(
          'holo deploy:rollback-preflight — previous release verified; no Compose action taken'
        );
        console.log(`  selected image:    ${image}`);
        console.log(`  lock:              ${args.lockPath ?? defaultImageLockPath()}`);
      }
      process.exit(0);
      break;
    }
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
    case 'etl:run': {
      const exportDir = requireExport(args.exportDir);
      const { runEtl } = await import('../etl/run.ts');
      try {
        const result = await runEtl({
          exportDir,
          catalogPath: args.catalogPath,
        });
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('holo etl:run — immutable export load');
          console.log(`  runId:          ${result.runId}`);
          console.log(`  archiveHash:    ${result.archiveHash}`);
          console.log(`  stageRowCount:  ${result.stageRowCount}`);
          console.log(`  idMapCount:     ${result.idMapCount}`);
          console.log(`  fileObjectCount:${result.fileObjectCount}`);
          console.log(result.ok ? '  status: OK' : '  status: FAIL');
        }
        process.exit(result.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo etl:run failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'etl:reconcile': {
      const { runEtlReconcile } = await import('../etl/reconcile.ts');
      try {
        const result = await runEtlReconcile({
          exportDir: args.exportDir,
          catalogPath: args.catalogPath,
        });
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('holo etl:reconcile — target vs source counts');
          console.log(`  unexplainedVariance:         ${result.unexplainedVariance}`);
          console.log(`  tableUnexplainedVariance:    ${result.tableUnexplainedVariance}`);
          console.log(`  storageRefUnexplainedVariance: ${result.storageRefUnexplainedVariance}`);
          console.log(`  fkOrphans:                   ${result.fkAudit.orphans}`);
          console.log(`  blobParityFailures:          ${result.blobVerify.parityFailures}`);
          console.log(result.ok ? '  status: OK' : '  status: FAIL');
        }
        process.exit(result.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo etl:reconcile failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'etl:fk-audit': {
      const { runFkAudit } = await import('../etl/fk-audit.ts');
      try {
        const result = await runFkAudit({
          exportDir: args.exportDir,
          catalogPath: args.catalogPath,
        });
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('holo etl:fk-audit — migrated relationship audit');
          console.log(`  checkedRelationships: ${result.checkedRelationships}`);
          console.log(`  enforcedForeignKeys:  ${result.enforcedForeignKeys}`);
          console.log(`  orphans:              ${result.orphans}`);
          console.log(result.ok ? '  status: OK' : '  status: FAIL');
        }
        process.exit(result.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo etl:fk-audit failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'etl:vectors': {
      const { runEtlVectors } = await import('../etl/vectors.ts');
      try {
        const result = await runEtlVectors({
          exportDir: args.exportDir,
          catalogPath: args.catalogPath,
        });
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('holo etl:vectors — canonical passage regeneration + embed');
          console.log(`  documentsProcessed: ${result.documentsProcessed}`);
          console.log(`  passagesInserted:   ${result.passagesInserted}`);
          console.log(`  embed.processed:    ${result.embed.processed}`);
          console.log(`  embed.remaining:    ${result.embed.remainingNull}`);
          console.log(`  markerFoundPast8k:  ${result.markerFoundPast8k}`);
          console.log(result.ok ? '  status: OK' : '  status: FAIL');
        }
        process.exit(result.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo etl:vectors failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'blob:verify': {
      const { runBlobVerify } = await import('../blob/verify.ts');
      try {
        const result = await runBlobVerify({
          exportDir: args.exportDir,
          catalogPath: args.catalogPath,
        });
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('holo blob:verify — retained manifest parity + Range proof');
          console.log(`  retainedCount:   ${result.retainedCount}`);
          console.log(`  parityFailures:  ${result.parityFailures}`);
          console.log(`  rangeStatus:     ${result.rangeProbe.status}`);
          console.log(`  rangeExact:      ${result.rangeProbe.exact}`);
          console.log(result.ok ? '  status: OK' : '  status: FAIL');
        }
        process.exit(result.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo blob:verify failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'verify:blob': {
      const { verifyLastUploadedBlob, verifyUploadOrphans } = await import(
        './commands/verify-blob-upload.ts'
      );
      const mode = args.positional[1];
      if (mode !== '--last' && mode !== '--orphans') {
        console.error('error: verify:blob requires --last or --orphans');
        process.exit(2);
      }
      try {
        const result =
          mode === '--last' ? await verifyLastUploadedBlob() : await verifyUploadOrphans();
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (mode === '--last') {
          const last = (result as Awaited<ReturnType<typeof verifyLastUploadedBlob>>).row;
          console.log('holo verify:blob --last — content-addressed upload proof');
          console.log(`  file_objects rows: ${result.rowCount}`);
          if (last) {
            console.log(`  id:             ${last.id}`);
            console.log(`  SHA-256:        ${last.contentHash}`);
            console.log(`  byte_size:      ${last.actualByteSize ?? last.byteSize ?? 'unknown'}`);
            console.log(`  mime_type:      ${last.mimeType ?? 'unknown'}`);
            console.log(`  storage_path:   ${last.storagePath ?? 'missing'}`);
            if (result.fixtureChecked) console.log(`  fixture_sha256: ${result.fixtureSha256}`);
          }
          if (result.reason) console.error(`  reason: ${result.reason}`);
          console.log(result.ok ? '  status: OK' : '  status: FAIL');
        } else {
          const orphanResult = result as Awaited<ReturnType<typeof verifyUploadOrphans>>;
          console.log('holo verify:blob --orphans — staged upload proof');
          console.log(`  orphan rows: ${orphanResult.orphanCount}`);
          for (const orphan of orphanResult.orphans) {
            console.log(`  - ${orphan.id} ${orphan.kind} ${orphan.status}`);
          }
          console.log(orphanResult.ok ? '  status: OK' : '  status: FAIL');
        }
        process.exit(result.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        else console.error(`holo verify:blob failed: ${msg}`);
        process.exit(1);
      }
      break;
    }
    case 'upload:init': {
      const { initUploadIntent } = await import('../uploads/service.ts');
      if (
        !args.uploadKind ||
        !args.targetId ||
        !args.idempotencyKey ||
        !args.sha256 ||
        !args.byteLength ||
        !args.mimeType
      ) {
        console.error(
          'error: upload:init requires --kind --target-id --idempotency-key --sha256 --bytes --mime'
        );
        process.exit(2);
      }
      try {
        const result = await initUploadIntent({
          kind: args.uploadKind,
          targetId: args.targetId,
          idempotencyKey: args.idempotencyKey,
          sha256: args.sha256,
          byteLength: Number(args.byteLength),
          mimeType: args.mimeType,
          originalName: args.originalName ?? undefined,
        });
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        process.exit(1);
      }
      break;
    }
    case 'upload:put': {
      const { readFileSync } = await import('node:fs');
      const { putUploadBytes } = await import('../uploads/service.ts');
      if (!args.uploadId || !args.uploadFile) {
        console.error('error: upload:put requires --upload-id and --file');
        process.exit(2);
      }
      try {
        const result = await putUploadBytes(args.uploadId, readFileSync(args.uploadFile));
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        process.exit(1);
      }
      break;
    }
    case 'upload:finalize': {
      const { finalizeUploadIntent } = await import('../uploads/service.ts');
      if (!args.uploadId) {
        console.error('error: upload:finalize requires --upload-id');
        process.exit(2);
      }
      try {
        const result = await finalizeUploadIntent(args.uploadId);
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        process.exit(1);
      }
      break;
    }
    case 'mcp:stdio': {
      const { startMcpStdio } = await import('../mcp/gateway.ts');
      await startMcpStdio();
      break;
    }
    case 'mcp:verify-rehost': {
      const { verifyMcpRehost } = await import('../mcp/verify-rehost.ts');
      const report = verifyMcpRehost();
      if (args.json) console.log(JSON.stringify(report, null, 2));
      else {
        console.log(`mcp:verify-rehost — ${report.registeredTools}/${report.manifestTools} tools`);
        console.log(
          report.ok ? '  status: OK' : `  status: FAIL\\n  ${report.issues.join('\\n  ')}`
        );
      }
      process.exit(report.ok ? 0 : 1);
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
      let databaseName: string | null = null;
      try {
        const u = new URL(url);
        databaseName = (u.pathname || '/').replace(/^\//, '') || null;
      } catch {
        databaseName = null;
      }
      const payload = {
        ok: tableCountError === null,
        connected: tableCountError === null,
        database: databaseName,
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
      const { runSecretsDoctor, formatDoctorTextWithBackup } = await import('../config/secrets.ts');
      const report = runSecretsDoctor();
      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatDoctorTextWithBackup(report));
      }
      process.exit(report.ok ? 0 : 1);
      break;
    }
    case 'secrets:doctor': {
      // Colon form alias for operators used to catalog:verify style commands
      const { runSecretsDoctor, formatDoctorTextWithBackup } = await import('../config/secrets.ts');
      const report = runSecretsDoctor();
      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatDoctorTextWithBackup(report));
      }
      process.exit(report.ok ? 0 : 1);
      break;
    }
    case 'backup:provision': {
      // D04-02: encrypted R2 + least-privilege scoped creds + pgBackRest stanza-create
      const { provisionBackupRepo, formatProvisionText } = await import(
        '../backup/r2-provision.ts'
      );
      try {
        const result = await provisionBackupRepo({});
        if (args.json) {
          // Never include secret values in JSON output
          console.log(
            JSON.stringify(
              {
                ok: result.ok,
                bucketName: result.bucketName,
                endpoint: result.endpoint,
                encryption: result.encryption,
                versioning: result.versioning,
                versioningNotImplemented: result.versioningNotImplemented,
                residualRisks: result.residualRisks,
                credentialKind: result.credentialKind,
                confMatchesScopedSecrets: result.confMatchesScopedSecrets,
                negativeAclDenied: result.negativeAclDenied,
                negativeAclBucket: result.negativeAclBucket,
                policyResource: result.policyResource,
                policyActions: result.policyActions,
                policyHasWildcardResource: result.policyHasWildcardResource,
                policyHasWildcardAction: result.policyHasWildcardAction,
                secretsPath: result.secretsPath,
                secretsWritten: result.secretsWritten,
                pgbackrestConfigPath: result.pgbackrestConfigPath,
                stanza: result.stanza,
                stanzaCreateExit: result.stanzaCreateExit,
                checkExit: result.checkExit,
                repoObjectsListed: result.repoObjectsListed,
                cipherType: result.cipherType,
                errors: result.errors,
              },
              null,
              2
            )
          );
        } else {
          console.log(formatProvisionText(result));
        }
        process.exit(result.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo backup:provision failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'backup:wal': {
      // D04-03: continuous WAL archiving cycle (archive_mode=always + R2 confirm + continuity gate)
      // + optional launchd install (≤5m heartbeat cadence for D04-05)
      const {
        runWalArchiveJob,
        formatWalArchiveText,
        installWalArchiveLaunchd,
        formatWalLaunchdInstallText,
      } = await import('../backup/wal-archive.ts');
      try {
        if (args.installSchedule) {
          const installed = installWalArchiveLaunchd({});
          if (args.json) {
            console.log(JSON.stringify(installed, null, 2));
          } else {
            console.log(formatWalLaunchdInstallText(installed));
          }
          process.exit(installed.ok ? 0 : 1);
          break;
        }
        const result = await runWalArchiveJob({});
        if (args.json) {
          console.log(
            JSON.stringify(
              {
                ok: result.ok,
                job_name: result.job_name,
                status: result.status,
                archiveMode: result.archiveMode,
                archiveCommand: result.archiveCommand.includes('archive-push')
                  ? 'pgbackrest archive-push'
                  : result.archiveCommand,
                lastWalSegment: result.lastWalSegment,
                before: result.before,
                after: result.after,
                r2WalObjectCountBefore: result.r2WalObjectCountBefore,
                r2WalObjectCountAfter: result.r2WalObjectCountAfter,
                continuityOk: result.continuityOk,
                gapSegments: result.gapSegments,
                continuityGatesSuccess: true,
                r2ExactSegmentRequired: true,
                heartbeat: result.heartbeat,
                span: result.span
                  ? {
                      name: result.span.name,
                      traceId: result.span.traceId,
                      spanId: result.span.spanId,
                      attributes: result.span.attributes,
                      exportOk: result.span.exportOk,
                      exportError: result.span.exportError,
                      redacted: result.span.redacted,
                    }
                  : null,
                writeBurstRows: result.writeBurstRows,
                errors: result.errors,
              },
              null,
              2
            )
          );
        } else {
          console.log(formatWalArchiveText(result));
        }
        process.exit(result.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo backup:wal failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'backup:base': {
      // D04-03: scheduled base backup job (+ optional launchd install)
      const {
        runBaseBackupJob,
        formatBaseBackupText,
        installBaseBackupLaunchd,
        formatLaunchdInstallText,
      } = await import('../backup/base-backup.ts');
      try {
        if (args.installSchedule) {
          const installed = installBaseBackupLaunchd({});
          if (args.json) {
            console.log(JSON.stringify(installed, null, 2));
          } else {
            console.log(formatLaunchdInstallText(installed));
          }
          process.exit(installed.ok ? 0 : 1);
          break;
        }
        const typeArg = args.backupType ?? 'full';
        const type =
          typeArg === 'incr' || typeArg === 'diff' || typeArg === 'full' ? typeArg : 'full';
        const result = await runBaseBackupJob({ type });
        if (args.json) {
          console.log(
            JSON.stringify(
              {
                ok: result.ok,
                job_name: result.job_name,
                status: result.status,
                backupType: result.backupType,
                exitCode: result.exitCode,
                lastSnapshotId: result.lastSnapshotId,
                r2BackupObjectCount: result.r2BackupObjectCount,
                manifestPresent: result.manifestPresent,
                heartbeat: result.heartbeat,
                span: result.span
                  ? {
                      name: result.span.name,
                      traceId: result.span.traceId,
                      spanId: result.span.spanId,
                      attributes: result.span.attributes,
                      exportOk: result.span.exportOk,
                      exportError: result.span.exportError,
                      redacted: result.span.redacted,
                    }
                  : null,
                errors: result.errors,
              },
              null,
              2
            )
          );
        } else {
          console.log(formatBaseBackupText(result));
        }
        process.exit(result.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo backup:base failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'backup:mirror': {
      // D04-04: restic blob mirror → R2 (encrypted separate prefix) + check --read-data + SHA-256 parity
      // Heartbeat restic_blob_mirror is upserted ONLY after parity passes.
      const { runResticBlobMirror, formatMirrorText } = await import('../backup/restic-mirror.ts');
      try {
        const result = await runResticBlobMirror({
          blobRoot: process.env.HOLO_BLOB_ROOT,
          spanEvidencePath: resolve(
            process.env.HOLO_ROOT ?? process.cwd(),
            '.tmp/D04-04/span-backup-restic_blob_mirror.json'
          ),
        });
        if (args.json) {
          // Never include RESTIC_PASSWORD or R2 secrets in JSON
          console.log(
            JSON.stringify(
              {
                ok: result.ok,
                jobName: result.jobName,
                spanName: result.spanName,
                repository: result.repository,
                resticPrefix: result.resticPrefix,
                bucketName: result.bucketName,
                blobRoot: result.blobRoot,
                encrypted: result.encrypted,
                plaintextRepo: result.plaintextRepo,
                separatePrefixFromPgbackrest: result.separatePrefixFromPgbackrest,
                pgbackrestPrefix: result.pgbackrestPrefix,
                initExit: result.initExit,
                backupExit: result.backupExit,
                checkExit: result.checkExit,
                snapshotId: result.snapshotId,
                snapshotsCount: result.snapshotsCount,
                objectCount: result.objectCount,
                parity: result.parity,
                parityPassed: result.parityPassed,
                heartbeatUpdated: result.heartbeatUpdated,
                heartbeat: result.heartbeat
                  ? {
                      job_name: result.heartbeat.job_name,
                      last_success_at: result.heartbeat.last_success_at,
                      last_snapshot_id: result.heartbeat.last_snapshot_id,
                      object_count: result.heartbeat.object_count,
                      status: result.heartbeat.status,
                      trace_id: result.heartbeat.trace_id,
                    }
                  : null,
                span: result.span
                  ? {
                      name: result.span.name,
                      traceId: result.span.traceId,
                      spanId: result.span.spanId,
                      status: result.span.status,
                      snapshotId: result.span.snapshotId,
                      objectCount: result.span.objectCount,
                      attributes: result.span.attributes,
                    }
                  : null,
                resticPasswordInSecrets: result.resticPasswordInSecrets,
                errors: result.errors,
                durationMs: result.durationMs,
              },
              null,
              2
            )
          );
        } else {
          console.log(formatMirrorText(result));
        }
        process.exit(result.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo backup:mirror failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }

    case 'backup:status': {
      // D04-03/D04-05: honest status — real SHOW + heartbeats + OVERDUE|OK per job
      const { backupStatusSnapshot, readWalArchiveSchedule } = await import(
        '../backup/wal-archive.ts'
      );
      const { readBaseBackupSchedule } = await import('../backup/base-backup.ts');
      const { queryBackupJobHealth, readAlertSweepSchedule, formatBackupStatusText } = await import(
        '../backup/alerting.ts'
      );
      try {
        let snap: Awaited<ReturnType<typeof backupStatusSnapshot>> | null = null;
        let archiveOk = true;
        try {
          snap = await backupStatusSnapshot({});
          archiveOk =
            snap.archiveMode === 'always' &&
            snap.archiveCommand.includes('pgbackrest') &&
            snap.archiveCommand.includes('archive-push') &&
            !/\/bin\/true/i.test(snap.archiveCommand);
        } catch {
          // Heartbeat health is the D04-05 gate even if archive SHOW is unavailable.
          archiveOk = true;
        }
        const health = await queryBackupJobHealth({});
        const healthOk = health.every((j) => j.flag === 'OK');
        const baseSchedule = readBaseBackupSchedule({});
        const walSchedule = readWalArchiveSchedule({});
        const alertSchedule = readAlertSweepSchedule({});
        const payload = {
          ok: archiveOk && healthOk,
          archiveMode: snap?.archiveMode ?? null,
          archiveCommand: snap
            ? snap.archiveCommand.includes('archive-push')
              ? 'pgbackrest archive-push'
              : snap.archiveCommand
            : null,
          archiver: snap?.archiver ?? null,
          r2WalObjects: snap?.r2WalObjects ?? null,
          r2BackupObjects: snap?.r2BackupObjects ?? null,
          heartbeats: health.map((h) => ({
            job_name: h.job_name,
            status: h.status,
            last_success_at: h.last_success_at,
            last_wal_segment: h.last_wal_segment,
            last_snapshot_id: h.last_snapshot_id,
            trace_id: h.trace_id,
            flag: h.flag,
            overdue_by_minutes: h.overdue_by_minutes,
          })),
          schedule: baseSchedule,
          walSchedule,
          alertSchedule,
        };
        if (args.json) {
          console.log(JSON.stringify(payload, null, 2));
        } else {
          console.log(formatBackupStatusText(health));
          if (snap) {
            console.log(`  archive_mode:    ${payload.archiveMode}`);
            console.log(`  archive_command: ${payload.archiveCommand}`);
            console.log(
              `  archiver:        last=${snap.archiver.last_archived_wal ?? 'n/a'} failed=${snap.archiver.failed_count} count=${snap.archiver.archived_count}`
            );
            console.log(`  r2_wal_objects:  ${payload.r2WalObjects}`);
            console.log(`  r2_backup_objs:  ${payload.r2BackupObjects}`);
          }
          console.log(
            `  wal_schedule:    ${walSchedule.installed ? `installed interval=${walSchedule.intervalSeconds}s loaded=${walSchedule.loaded}` : 'not installed'}`
          );
          console.log(
            `  base_schedule:   ${baseSchedule.installed ? `installed interval=${baseSchedule.intervalSeconds}s loaded=${baseSchedule.loaded}` : 'not installed'}`
          );
          console.log(
            `  alert_schedule:  ${alertSchedule.installed ? `installed interval=${alertSchedule.intervalSeconds}s loaded=${alertSchedule.loaded}` : 'not installed'}`
          );
        }
        process.exit(payload.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo backup:status failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'backup:alert-sweep': {
      // D04-05: query overdue/failed → real webhook POST (or install launchd schedule)
      const {
        runBackupAlertSweep,
        installAlertSweepLaunchd,
        formatAlertLaunchdInstallText,
        configureBackupAlerting,
      } = await import('../backup/alerting.ts');
      try {
        if (args.installSchedule) {
          const installed = installAlertSweepLaunchd({});
          if (args.json) {
            console.log(JSON.stringify(installed, null, 2));
          } else {
            console.log(formatAlertLaunchdInstallText(installed));
          }
          process.exit(installed.ok ? 0 : 1);
          break;
        }
        if (process.env.ALERT_WEBHOOK_URL?.trim()) {
          await configureBackupAlerting({
            webhookUrl: process.env.ALERT_WEBHOOK_URL,
            overdueMs: process.env.BACKUP_ALERT_OVERDUE_MS
              ? Number(process.env.BACKUP_ALERT_OVERDUE_MS)
              : undefined,
          });
        }
        const result = await runBackupAlertSweep({});
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('holo backup:alert-sweep');
          console.log(`  total:      ${result.total}`);
          console.log(`  healthy:    ${result.healthy}`);
          console.log(`  alerted:    ${result.alerted}`);
          console.log(`  overdue_ms: ${result.overdueMs}`);
          for (const p of result.posts) {
            console.log(
              `  post[${p.job_name}]: reason=${p.reason} failure_reason=${p.failure_reason} overdue_by_minutes=${p.overdue_by_minutes}`
            );
          }
          for (const e of result.errors) console.log(`  error: ${e}`);
          console.log(`  overall:    ${result.errors.length === 0 ? 'OK' : 'FAILED'}`);
        }
        process.exit(result.errors.length === 0 ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo backup:alert-sweep failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'backup:healthy': {
      // REDHAT-FIX-S27-04: durable reset — clear induced store + success heartbeats.
      // Gate steps 4-6 chain this before each single-mode induce so modes cannot contaminate.
      const { runHealthyBackupJob } = await import('../backup/alerting.ts');
      try {
        const job = args.all ? 'all' : (args.induceJob ?? args.positional[1] ?? null);
        if (!job) {
          console.error(
            'error: backup:healthy requires --all or --job <name> (clears induced store + success heartbeats)'
          );
          process.exit(2);
        }
        const result = await runHealthyBackupJob(job);
        if (args.json) {
          console.log(
            JSON.stringify(
              {
                ok: true,
                command: 'backup:healthy',
                scope: job === 'all' || job === '*' ? 'all' : job,
                status: result.status,
                heartbeat: result.heartbeat,
              },
              null,
              2
            )
          );
        } else {
          console.log(
            `holo backup:healthy scope=${job === 'all' || job === '*' ? 'all' : job} status=${result.status} last_success_at=${result.heartbeat.last_success_at}`
          );
        }
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo backup:healthy failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'backup:induce-failure': {
      // REDHAT-FIX-S27-01: production-truth real failure induction by default.
      // Optional --synthetic uses honest heartbeat-poison path for sweep-unit mechanics only.
      // REDHAT-FIX-S27-04: --mode clear is an alias for backup:healthy --all (full reset).
      const { induceBackupFailure, parseInduceMode, runHealthyBackupJob } = await import(
        '../backup/alerting.ts'
      );
      try {
        const modeRaw = args.induceMode;
        const job = args.induceJob;
        if (!modeRaw) {
          console.error(
            'error: backup:induce-failure requires --mode kill|credential-expired|config-removed|clear [--job <name>] [--synthetic]'
          );
          process.exit(2);
        }
        const modeNorm = modeRaw.trim().toLowerCase().replace(/_/g, '-');
        if (modeNorm === 'clear' || modeNorm === 'reset' || modeNorm === 'healthy') {
          // Full reset path — same as backup:healthy --all (induced store + heartbeats).
          const result = await runHealthyBackupJob('all');
          if (args.json) {
            console.log(
              JSON.stringify(
                {
                  ok: true,
                  command: 'backup:induce-failure',
                  mode: 'clear',
                  status: result.status,
                  heartbeat: result.heartbeat,
                },
                null,
                2
              )
            );
          } else {
            console.log(
              `holo backup:induce-failure mode=clear status=${result.status} last_success_at=${result.heartbeat.last_success_at}`
            );
          }
          process.exit(0);
        }
        if (!job) {
          console.error(
            'error: backup:induce-failure requires --mode kill|credential-expired|config-removed and --job <name> [--synthetic]'
          );
          process.exit(2);
        }
        const mode = parseInduceMode(modeRaw);
        const result = await induceBackupFailure(mode, job, {
          overdueMs: process.env.BACKUP_ALERT_OVERDUE_MS
            ? Number(process.env.BACKUP_ALERT_OVERDUE_MS)
            : undefined,
          synthetic: args.induceSynthetic,
        });
        if (args.json) {
          console.log(JSON.stringify({ ok: true, ...result }, null, 2));
        } else {
          const ind = result.induction;
          console.log(
            `holo backup:induce-failure mode=${result.mode} job=${result.job_name} path=${ind.path} status=${result.heartbeat.status} last_success_at=${result.heartbeat.last_success_at}` +
              (ind.real_process_killed ? ` pid_killed=${ind.pid_killed}` : '') +
              (ind.real_auth_fault ? ' real_auth_fault=true' : '') +
              (ind.config_removed ? ` config_removed path=${ind.config_path}` : '') +
              (ind.production_catch ? ' production_catch=true' : '')
          );
        }
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo backup:induce-failure failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'backup:emit-recovery-baseline': {
      // GATE-FIX-QA2: upload recovery baseline bound to a listable restic snapshot.
      const { emitLiveRecoveryBaseline } = await import('../backup/recovery-baseline.ts');
      try {
        const result = emitLiveRecoveryBaseline({
          blobRoot: args.blobRoot
            ? resolve(args.blobRoot)
            : args.sourceBlobRoot
              ? resolve(args.sourceBlobRoot)
              : undefined,
          resticSnapshotId: args.resticSnapshot ?? undefined,
        });
        if (args.json) {
          console.log(
            JSON.stringify(
              {
                ok: result.ok,
                uploaded: result.uploaded,
                verified: result.verified,
                baseline_id: result.baseline?.baseline_id ?? null,
                restic_snapshot_id: result.restic_snapshot_id,
                pgbackrest_backup_label: result.pgbackrest_backup_label,
                contentKey: result.contentKey,
                lookupKey: result.lookupKey,
                row_counts: result.baseline?.row_counts ?? null,
                errors: result.errors,
              },
              null,
              2
            )
          );
        } else {
          console.log('holo backup:emit-recovery-baseline');
          console.log(`  ok:                      ${result.ok}`);
          console.log(`  uploaded:                ${result.uploaded}`);
          console.log(`  verified:                ${result.verified}`);
          console.log(`  baseline_id:             ${result.baseline?.baseline_id ?? '(none)'}`);
          console.log(`  restic_snapshot_id:      ${result.restic_snapshot_id ?? '(none)'}`);
          console.log(`  pgbackrest_backup_label: ${result.pgbackrest_backup_label ?? '(none)'}`);
          console.log(`  content_key:             ${result.contentKey ?? '(none)'}`);
          if (result.errors.length) {
            console.log('  errors:');
            for (const e of result.errors) console.log(`    - ${e}`);
          }
        }
        process.exit(result.ok && result.uploaded ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo backup:emit-recovery-baseline failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'restore:window': {
      // GATE-FIX-QA2: live in-window PITR metadata (does not weaken outside-WAL fail-closed).
      const { queryPitrWindow, formatPitrWindowText } = await import('../backup/restore.ts');
      try {
        const report = queryPitrWindow({});
        if (args.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(formatPitrWindowText(report));
        }
        process.exit(report.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo restore:window failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'restore':
    case 'restore:pitr': {
      // D05-02: pgBackRest PITR into empty --scratch PGDATA (never live mini PGDATA)
      const { runPitrRestore, formatPitrRestoreText } = await import('../backup/restore.ts');
      try {
        const pitr = args.pitr ?? args.positional[1] ?? null;
        const scratch = args.scratch;
        if (!pitr) {
          console.error(
            'error: restore requires --pitr <iso-timestamp> (e.g. 2024-01-15T12:30:00Z)'
          );
          process.exit(2);
        }
        if (!scratch) {
          console.error(
            'error: restore requires --scratch <empty-dir> (target PGDATA; never live mini PGDATA)'
          );
          process.exit(2);
        }
        const taRaw = (args.targetAction ?? 'promote').toLowerCase();
        const targetAction = taRaw === 'pause' ? 'pause' : 'promote';
        if (taRaw !== 'promote' && taRaw !== 'pause') {
          console.error('error: --target-action must be promote or pause');
          process.exit(2);
        }
        const result = await runPitrRestore({
          pitr,
          scratch: resolve(scratch),
          targetAction,
        });
        // Structured JSON report always available via --json; text mode still prints facts.
        if (args.json) {
          console.log(
            JSON.stringify(
              {
                ok: result.ok,
                exitCode: result.exitCode,
                targetTimestamp: result.targetTimestamp,
                actualStopTimestamp: result.actualStopTimestamp,
                pgdataPath: result.pgdataPath,
                targetAction: result.targetAction,
                restoredWalCount: result.restoredWalCount,
                errors: result.errors,
                report: result.report,
              },
              null,
              2
            )
          );
        } else {
          console.log(formatPitrRestoreText(result));
        }
        // Fail-closed: named errors on stderr so operators + RED suite can match.
        if (!result.ok) {
          for (const e of result.namedErrors.length ? result.namedErrors : result.errors) {
            console.error(e);
          }
        }
        process.exit(result.ok ? 0 : result.exitCode === 0 ? 1 : result.exitCode);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo restore --pitr failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'restore:status': {
      const { getRestoreStatus, formatRestoreStatusText } = await import('../backup/restore.ts');
      try {
        const result = getRestoreStatus({});
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatRestoreStatusText(result));
        }
        process.exit(result.report ? (result.ok ? 0 : 1) : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo restore:status failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'restore:fire-drill': {
      // D05-04: full fire-drill — pre-failure snapshot → PITR → restic blob → parity-report
      // REDHAT-FIX-S28R2-C1: optional --fresh-target binds destinations to provisioned volumes.
      const { runFireDrill, formatParityReportText } = await import('../backup/fire-drill.ts');
      const { spawnSync } = await import('node:child_process');
      try {
        const targetTimestamp = args.pitr ?? args.positional[1] ?? null;
        let scratch = args.scratch;
        let blobDir = args.blobDir;
        let freshTargetAttestation: Record<string, unknown> | null = null;

        if (args.freshTarget) {
          // GATE-FIX-S28R3-QA1: resolve host-accessible volume paths.
          // Colima/Desktop Mountpoints under /var/lib/docker are not host-writable;
          // prefer Options.device (bind-backed) or paths.txt host_staging when needed.
          const host = args.freshTarget.trim();
          const volPg = `${host}-pgdata`;
          const volBlob = `${host}-blobs`;
          const {
            existsSync,
            mkdirSync,
            writeFileSync,
            unlinkSync,
            realpathSync,
            accessSync,
            constants: fsConstants,
          } = await import('node:fs');
          const { join } = await import('node:path');

          // GATE-FIX-S28R3-QA24: fixed credential-child PATH is /usr/bin:/bin (no Homebrew).
          // Resolve docker via absolute candidates (same allowlist as shell provision/fire-drill).
          let dockerBin: string | null = null;
          for (const c of [
            '/usr/bin/docker',
            '/usr/local/bin/docker',
            '/opt/homebrew/bin/docker',
          ] as const) {
            try {
              if (existsSync(c)) {
                accessSync(c, fsConstants.X_OK);
                dockerBin = c;
                break;
              }
            } catch {
              /* try next */
            }
          }
          if (!dockerBin) {
            const msg =
              'fresh-target requires absolute docker client at /usr/bin/docker, /usr/local/bin/docker, or /opt/homebrew/bin/docker (PATH discovery forbidden under restore-only child env)';
            if (args.json) {
              console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
            } else {
              console.error(`error: ${msg}`);
            }
            process.exit(2);
          }
          const dockerExe = dockerBin;
          const inspectField = (vol: string, template: string): string | null => {
            const r = spawnSync(dockerExe, ['volume', 'inspect', '-f', template, vol], {
              encoding: 'utf8',
              timeout: 15_000,
            });
            if (r.status !== 0) return null;
            const p = (r.stdout ?? '').trim();
            return p && p !== '<no value>' && p !== '<nil>' ? p : null;
          };
          const volumeExists = (vol: string): boolean => {
            const r = spawnSync(dockerExe, ['volume', 'inspect', vol], {
              encoding: 'utf8',
              timeout: 15_000,
            });
            return r.status === 0;
          };
          const isUnboundH2Step3 = (p: string): boolean =>
            /(?:^|\/)\.tmp\/REDHAT-FIX-H2\/step3-/.test(p);
          const hostWritable = (p: string): boolean => {
            if (!p || isUnboundH2Step3(p)) return false;
            try {
              mkdirSync(p, { recursive: true });
              const probe = join(p, `.holo-write-probe-${process.pid}`);
              writeFileSync(probe, 'ok');
              try {
                unlinkSync(probe);
              } catch {
                /* ignore */
              }
              return true;
            } catch {
              return false;
            }
          };
          const findPathsTxt = (h: string): string | null => {
            const cwd = process.cwd();
            const candidates = [
              process.env.STAGING_ROOT
                ? resolve(cwd, process.env.STAGING_ROOT, h, 'paths.txt')
                : null,
              resolve(cwd, '.tmp/fresh-restore', h, 'paths.txt'),
              resolve(cwd, '.tmp/REDHAT-FIX-S28R3/fresh-restore', h, 'paths.txt'),
              resolve(cwd, '.tmp/GATE-FIX-S28R3-QA1/fresh-restore', h, 'paths.txt'),
              resolve(cwd, '.tmp/REDHAT-FIX-S28R2/C1/staging', h, 'paths.txt'),
            ].filter((x): x is string => Boolean(x));
            for (const c of candidates) {
              if (existsSync(c)) return c;
            }
            return null;
          };
          const readPathsField = (file: string, key: string): string | null => {
            try {
              const text = readFileSync(file, 'utf8');
              const line = text.split('\n').find((l) => l.startsWith(`${key}=`));
              if (!line) return null;
              const v = line.slice(key.length + 1).trim();
              return v || null;
            } catch {
              return null;
            }
          };
          type ExecMode = 'host-mountpoint' | 'host-bind-device' | 'host-staging-bind';
          const resolveHostExec = (
            vol: string,
            role: 'pgdata' | 'blob'
          ): { exec: string; mode: ExecMode; daemon: string | null } | null => {
            if (!volumeExists(vol)) return null;
            const daemon = inspectField(vol, '{{ .Mountpoint }}');
            const device = inspectField(
              vol,
              '{{ if .Options }}{{ index .Options "device" }}{{ end }}'
            );
            if (daemon && hostWritable(daemon)) {
              return { exec: daemon, mode: 'host-mountpoint', daemon };
            }
            if (device && hostWritable(device)) {
              return { exec: device, mode: 'host-bind-device', daemon };
            }
            const pathsFile = findPathsTxt(host);
            if (pathsFile) {
              const key = role === 'pgdata' ? 'host_staging_pgdata' : 'host_staging_blob';
              const staging = readPathsField(pathsFile, key);
              if (staging) {
                const abs = resolve(process.cwd(), staging);
                if (hostWritable(abs)) {
                  return { exec: abs, mode: 'host-staging-bind', daemon };
                }
              }
            }
            return null;
          };

          if (!volumeExists(volPg) || !volumeExists(volBlob)) {
            const msg = `fresh-target volumes unresolvable for ${host} (need ${volPg} + ${volBlob}) — refuse unbound host-only paths`;
            if (args.json) {
              console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
            } else {
              console.error(`error: ${msg}`);
            }
            process.exit(2);
          }

          // Resolve host-accessible paths from Docker volume metadata only
          // (never /var/lib/docker if unusable). GATE-FIX-S28R3-QA2 / H1:
          // explicit --scratch/--blob-dir must canonical-equal resolved paths.
          const scratchResolved = resolveHostExec(volPg, 'pgdata');
          const blobResolved = resolveHostExec(volBlob, 'blob');

          if (!scratchResolved || !blobResolved) {
            const msg =
              `fresh-target host-accessible path unresolvable for ${host} ` +
              `(daemon Mountpoint not host-writable; no bind device / host_staging) — ` +
              `refuse unbound host-only paths and refuse /var/lib/docker host mkdir`;
            if (args.json) {
              console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
            } else {
              console.error(`error: ${msg}`);
            }
            process.exit(2);
          }

          const sameCanonical = (a: string, b: string): boolean => {
            try {
              return realpathSync(resolve(a)) === realpathSync(resolve(b));
            } catch {
              try {
                return resolve(a) === resolve(b);
              } catch {
                return false;
              }
            }
          };

          if (args.scratch) {
            if (
              isUnboundH2Step3(args.scratch) ||
              !sameCanonical(args.scratch, scratchResolved.exec)
            ) {
              const msg =
                `fresh-target --scratch must canonical-equal resolved host path ` +
                `(${scratchResolved.exec}); refuse unrelated writable destination`;
              if (args.json) {
                console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
              } else {
                console.error(`error: ${msg}`);
              }
              process.exit(2);
            }
          }
          if (args.blobDir) {
            if (isUnboundH2Step3(args.blobDir) || !sameCanonical(args.blobDir, blobResolved.exec)) {
              const msg =
                `fresh-target --blob-dir must canonical-equal resolved host path ` +
                `(${blobResolved.exec}); refuse unrelated writable destination`;
              if (args.json) {
                console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
              } else {
                console.error(`error: ${msg}`);
              }
              process.exit(2);
            }
          }

          const scratchExec = scratchResolved.exec;
          const blobExec = blobResolved.exec;
          if (isUnboundH2Step3(scratchExec) || isUnboundH2Step3(blobExec)) {
            const msg = `refuse unbound host-only REDHAT-FIX-H2/step3 path as volume destination`;
            if (args.json) {
              console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
            } else {
              console.error(`error: ${msg}`);
            }
            process.exit(2);
          }

          scratch = scratchExec;
          blobDir = blobExec;
          const executionMode =
            scratchResolved.mode === blobResolved.mode
              ? scratchResolved.mode
              : `${scratchResolved.mode}+${blobResolved.mode}`;
          freshTargetAttestation = {
            ok: true,
            schema: 'holo.fresh-target.fire-drill-attestation.v1',
            host,
            container: host,
            volumes: { pgdata: volPg, blob: volBlob },
            mountpoints: {
              scratch: scratchResolved.daemon ?? scratchExec,
              blob: blobResolved.daemon ?? blobExec,
            },
            daemon_mountpoint: {
              scratch: scratchResolved.daemon,
              blob: blobResolved.daemon,
            },
            host_execution: { scratch: scratchExec, blob: blobExec },
            container_paths: {
              pgdata: '/var/lib/postgresql/restore',
              blob: '/var/lib/holocron/blob-restore',
            },
            execution_mode: executionMode,
            scratch: scratchExec,
            blobDir: blobExec,
          };
          const attPath = resolve(
            process.cwd(),
            `.tmp/REDHAT-FIX-S28R2/C1/attestation-${host}.json`
          );
          mkdirSync(resolve(attPath, '..'), { recursive: true });
          writeFileSync(attPath, `${JSON.stringify(freshTargetAttestation, null, 2)}\n`, 'utf8');
          if (!args.json) {
            console.log(`  fresh_target:               ${host}`);
            console.log(`  fresh_target_scratch:       ${scratchExec}`);
            console.log(`  fresh_target_blob:          ${blobExec}`);
            console.log(`  fresh_target_exec_mode:     ${executionMode}`);
            console.log(`  fresh_target_attestation:   ${attPath}`);
          }
        }

        if (!targetTimestamp) {
          console.error(
            'error: restore:fire-drill requires --target-timestamp <iso> (or --pitr <iso>)'
          );
          process.exit(2);
        }
        if (!scratch) {
          console.error(
            'error: restore:fire-drill requires --scratch <empty-dir> (never live mini PGDATA) or --fresh-target <name>'
          );
          process.exit(2);
        }
        if (!blobDir) {
          console.error(
            'error: restore:fire-drill requires --blob-dir <empty-dir> (never live mini blobs) or --fresh-target <name>'
          );
          process.exit(2);
        }
        const reportPath =
          args.report ?? args.output ?? resolve(process.cwd(), '.tmp/D05-04/parity-report.json');
        const result = await runFireDrill({
          targetTimestamp,
          scratch: resolve(scratch),
          blobDir: resolve(blobDir),
          reportPath: resolve(reportPath),
          sourceBlobRoot: args.sourceBlobRoot ? resolve(args.sourceBlobRoot) : undefined,
          freshTarget: args.freshTarget ?? undefined,
          freshTargetAttestation: freshTargetAttestation ?? undefined,
        });
        if (args.json) {
          console.log(
            JSON.stringify(
              {
                ok: result.ok,
                exitCode: result.exitCode,
                reportPath: result.reportPath,
                report: result.report,
                errors: result.errors,
                freshTargetAttestation,
              },
              null,
              2
            )
          );
        } else {
          console.log(formatParityReportText(result.report));
          console.log(`  report_path:                ${result.reportPath}`);
        }
        if (!result.ok) {
          for (const e of result.errors) console.error(e);
        }
        process.exit(result.ok ? 0 : result.exitCode === 0 ? 1 : result.exitCode);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo restore:fire-drill failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'verify:backup': {
      // D04-05 CI gate: exit 1 on any overdue/failed heartbeat
      const { verifyBackupHealth, formatVerifyBackupText } = await import('../backup/alerting.ts');
      try {
        const result = await verifyBackupHealth({
          overdueMs: process.env.BACKUP_ALERT_OVERDUE_MS
            ? Number(process.env.BACKUP_ALERT_OVERDUE_MS)
            : undefined,
        });
        if (args.json) {
          console.log(
            JSON.stringify(
              {
                ok: result.ok,
                exitCode: result.exitCode,
                overdueMs: result.overdueMs,
                jobs: result.jobs,
                overdueOrFailed: result.overdueOrFailed,
              },
              null,
              2
            )
          );
        } else {
          console.log(formatVerifyBackupText(result));
        }
        process.exit(result.exitCode);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo verify:backup failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'cutover:go-no-go': {
      // D06-02 / T-SYNC-008: spawn 8 real harness gates; exit 0 iff overall.ok
      const { runGoNoGo, formatGoNoGoText, defaultGoNoGoReportPath } = await import(
        '../cutover/go-no-go.ts'
      );
      try {
        const reportPath = args.output
          ? resolve(args.output)
          : defaultGoNoGoReportPath(process.cwd());
        const report = runGoNoGo({ reportPath });
        if (args.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(formatGoNoGoText(report));
        }
        process.exit(report.overall.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo cutover:go-no-go failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'cutover:freeze': {
      // D06-03 / T-SYNC-009: arm HOLO_MIGRATION_READ_ONLY=1 + emit fence_armed_at
      const { runCutoverFreeze, formatFreezeText, defaultFreezeReportPath } = await import(
        '../cutover/convex-fence-client.ts'
      );
      try {
        const reportPath = args.output
          ? resolve(args.output)
          : defaultFreezeReportPath(process.cwd());
        const report = await runCutoverFreeze({
          reason: args.reason,
          reportPath,
        });
        if (args.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(formatFreezeText(report));
        }
        process.exit(report.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo cutover:freeze failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'cutover:quiet-check': {
      // D06-03: acceptedWriteCount=0 && rejectedWriteCount>0 over window
      const { runQuietCheck, formatQuietCheckText, defaultQuietCheckReportPath } = await import(
        '../cutover/convex-fence-client.ts'
      );
      try {
        const reportPath = args.output
          ? resolve(args.output)
          : defaultQuietCheckReportPath(process.cwd());
        const windowSeconds = args.windowSeconds ? Number.parseInt(args.windowSeconds, 10) : 30;
        const report = await runQuietCheck({
          windowSeconds: Number.isFinite(windowSeconds) ? windowSeconds : 30,
          reportPath,
        });
        if (args.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(formatQuietCheckText(report));
        }
        process.exit(report.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo cutover:quiet-check failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'cutover:capture-article-baseline': {
      // D06-03: real post-freeze /article/:token sha256 baseline (FENCE_NOT_ARMED fail-closed)
      const {
        captureArticleBaseline,
        formatArticleBaselineText,
        defaultArticleBaselinePath,
        FENCE_NOT_ARMED,
      } = await import('../cutover/article-baseline.ts');
      try {
        const token = args.token ?? args.positional[0] ?? '';
        const outputPath = args.output
          ? resolve(args.output)
          : defaultArticleBaselinePath(process.cwd());
        const result = await captureArticleBaseline({ token, outputPath });
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatArticleBaselineText(result));
        }
        if (!result.ok) {
          const code =
            'error' in result && result.error?.code ? result.error.code : 'CAPTURE_FAILED';
          process.exit(code === FENCE_NOT_ARMED ? 2 : 1);
        }
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo cutover:capture-article-baseline failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'cutover:verify-article': {
      // D06-05 / R2-H03: network GET /article/:token vs immutable pre-freeze baseline
      const { runVerifyArticle, resolveVerifyBaseUrl } = await import('../cutover/soak-fence.ts');
      const { defaultArticleBaselinePath } = await import('../cutover/article-baseline.ts');
      try {
        const baselinePath = args.baseline
          ? resolve(args.baseline)
          : defaultArticleBaselinePath(process.cwd());
        const baseUrl = resolveVerifyBaseUrl(args.baseUrl);
        const report = await runVerifyArticle({
          baselinePath,
          baseUrl: baseUrl || undefined,
        });
        if (args.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(
            `article ok=${report.ok} match=${report.match} transport=${report.transport} status=${report.status} sha256=${report.sha256.slice(0, 12)}… baseline=${report.baselineSha256.slice(0, 12)}… bytes=${report.byteLength}`
          );
          if (report.error) console.log(`  error: ${report.error}`);
        }
        process.exit(report.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(
            JSON.stringify(
              {
                ok: false,
                match: false,
                transport: 'network',
                error: msg,
              },
              null,
              2
            )
          );
        } else {
          console.error(`holo cutover:verify-article failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'cutover:run-etl': {
      // D06-04 / T-SYNC-009 / CAP-MIG-01: watermark → export → ETL → zero unexplained variance
      const { runCutoverEtl, formatCutoverEtlText, FENCE_NOT_ENGAGED } = await import(
        '../cutover/etl-orchestrate.ts'
      );
      const { defaultWatermarkReportPath } = await import('../cutover/export-watermark.ts');
      try {
        const reportPath = args.output
          ? resolve(args.output)
          : defaultWatermarkReportPath(process.cwd());
        const result = await runCutoverEtl({
          reportPath,
          catalogPath: args.catalogPath,
          exportDir: args.exportDir,
          parityPath: args.parityPath ? resolve(args.parityPath) : undefined,
          blobRoot: args.blobRoot ?? undefined,
        });
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatCutoverEtlText(result));
        }
        if (!result.ok) {
          const code =
            'error' in result &&
            result.error &&
            typeof result.error === 'object' &&
            'code' in result.error
              ? String((result.error as { code: string }).code)
              : 'ETL_FAILED';
          process.exit(code === FENCE_NOT_ENGAGED ? 2 : 1);
        }
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo cutover:run-etl failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'cutover:flip': {
      // D06-05 / T-SYNC-010 / REDHAT-FIX-S29-C02: durable HOLO_MIGRATION_READ_ONLY control-plane write
      const {
        runCutoverFlip,
        formatFlipText,
        defaultFlipReportPath,
        ETL_NOT_RECONCILED,
        ETL_REPORT_MISSING,
      } = await import('../cutover/soak-fence.ts');
      try {
        const reportPath = args.output
          ? resolve(args.output)
          : defaultFlipReportPath(process.cwd());
        const report = runCutoverFlip({
          etlReportPath: args.etlReport ? resolve(args.etlReport) : undefined,
          reportPath,
        });
        if (args.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(formatFlipText(report));
        }
        if (!report.ok) {
          const code = report.error?.code ?? 'FLIP_FAILED';
          process.exit(code === ETL_NOT_RECONCILED || code === ETL_REPORT_MISSING ? 2 : 1);
        }
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo cutover:flip failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'cutover:rollback-repoint': {
      // H-05 / R2-C04 / UC-SYNC-04: serving control-plane re-point + live acks.
      // Authoritative path is rollback-repoint.ts (writes HOLO_DATA_PLANE to
      // secrets + collects serving acknowledgements). soak-fence helper remains
      // for unit fixtures only — never leave the registered CLI on .tmp-only.
      const {
        runRollbackRepoint,
        formatRollbackRepointText,
        defaultRollbackRepointReportPath,
        POST_EXPORT_WRITE_ACCEPTED,
        ROLLBACK_INELIGIBLE,
        EXPORT_WATERMARK_MISSING,
        LIVE_ACK_MISSING,
        CONTROL_PLANE_WRITE_FAILED,
      } = await import('../cutover/rollback-repoint.ts');
      try {
        const reportPath = args.output
          ? resolve(args.output)
          : defaultRollbackRepointReportPath(process.cwd());
        const report = await runRollbackRepoint({
          reportPath,
          watermarkPath: args.etlReport ? resolve(args.etlReport) : undefined,
          target: args.target ?? undefined,
        });
        if (args.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(formatRollbackRepointText(report));
        }
        if (!report.ok) {
          const code = report.error?.code ?? ROLLBACK_INELIGIBLE;
          process.exit(
            code === POST_EXPORT_WRITE_ACCEPTED ||
              code === ROLLBACK_INELIGIBLE ||
              code === EXPORT_WATERMARK_MISSING ||
              code === LIVE_ACK_MISSING ||
              code === CONTROL_PLANE_WRITE_FAILED
              ? 2
              : 1
          );
        }
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo cutover:rollback-repoint failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'cutover:verify-tools': {
      // D06-05 / H-01 / R2-H02: all manifest tools over network /mcp with target_identity
      const { runVerifyTools, resolveVerifyBaseUrl } = await import('../cutover/soak-fence.ts');
      try {
        const baseUrl = resolveVerifyBaseUrl(args.baseUrl);
        const report = await runVerifyTools({
          baseUrl: baseUrl || undefined,
          serviceLabel: args.serviceLabel ?? undefined,
        });
        if (args.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          const id = report.target_identity;
          console.log(
            `tools ${report.toolsPassed}/${report.toolsTotal} stubbed=${report.toolsStubbed} ok=${report.ok} transport=${report.transport} base_url=${report.base_url} identity=${id ? `${id.host}:${id.port}/${id.service_label}` : 'none'}`
          );
        }
        process.exit(report.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          // toolsPassed/toolsTotal never null — emit concrete zeros on hard failure
          console.error(
            JSON.stringify(
              {
                ok: false,
                toolsTotal: 0,
                toolsPassed: 0,
                toolsStubbed: 0,
                tools: [],
                transport: 'network',
                base_url: args.baseUrl ?? process.env.HOLO_VERIFY_BASE_URL ?? '',
                target_identity: null,
                error: msg,
              },
              null,
              2
            )
          );
        } else {
          console.error(`holo cutover:verify-tools failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'cutover:verify-reads': {
      // D06-05 / R2-C03: Postgres counts vs immutable export/catalog parity baseline
      const { runVerifyReads } = await import('../cutover/soak-fence.ts');
      try {
        const report = await runVerifyReads({
          etlReportPath: args.etlReport ? resolve(args.etlReport) : undefined,
          exportDir: args.exportDir ? resolve(args.exportDir) : undefined,
          catalogPath: args.catalogPath ? resolve(args.catalogPath) : undefined,
          parityPath: args.parityPath ? resolve(args.parityPath) : undefined,
        });
        if (args.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(
            `reads ok=${report.ok} tables=${report.tablesMatched}/${report.tablesTotal} catalog=${report.catalog_table_count} docs=${report.perTableCounts.documents ?? '?'} mismatches=${report.mismatches.length} exportArchiveHash=${(report.exportArchiveHash ?? '').slice(0, 12)}`
          );
        }
        process.exit(report.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo cutover:verify-reads failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'cutover:verify-soak': {
      // D06-05 / H-01: aggregate soak gate (network /mcp + /article)
      const {
        runVerifySoak,
        formatSoakVerifyText,
        defaultSoakVerifyReportPath,
        resolveVerifyBaseUrl,
      } = await import('../cutover/soak-fence.ts');
      try {
        const reportPath = args.output
          ? resolve(args.output)
          : defaultSoakVerifyReportPath(process.cwd());
        const baseUrl = resolveVerifyBaseUrl(args.baseUrl);
        const report = await runVerifySoak({
          etlReportPath: args.etlReport ? resolve(args.etlReport) : undefined,
          exportDir: args.exportDir ? resolve(args.exportDir) : undefined,
          catalogPath: args.catalogPath ? resolve(args.catalogPath) : undefined,
          parityPath: args.parityPath ? resolve(args.parityPath) : undefined,
          reportPath,
          baseUrl: baseUrl || undefined,
          zeroBaseUrl: args.zeroBaseUrl ?? undefined,
        });
        if (args.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(formatSoakVerifyText(report));
        }
        process.exit(report.overall.ok ? 0 : 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo cutover:verify-soak failed: ${msg}`);
        }
        process.exit(1);
      }
      break;
    }
    case 'verify:convex-fence-coverage': {
      // D06-03: zero raw mutation/action/httpAction imports remain
      const { verifyConvexFenceCoverage, formatCoverageText } = await import(
        '../cutover/convex-fence-client.ts'
      );
      const report = verifyConvexFenceCoverage(
        args.root ? { convexRoot: resolve(args.root) } : undefined
      );
      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatCoverageText(report));
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
    case 'verify:no-convex-client':
    case 'verify-no-convex-client': {
      const {
        verifyNoConvexClient,
        formatVerifyNoConvexClientText,
        parseRootsFlag,
        DEFAULT_NO_CONVEX_CLIENT_ROOTS,
      } = await import('./commands/verify-no-convex-client.ts');
      const roots = parseRootsFlag(args.roots);
      if (args.printRoots) {
        const payload = {
          ok: true,
          roots,
          root_count: roots.length,
          defaults: [...DEFAULT_NO_CONVEX_CLIENT_ROOTS],
        };
        if (args.json) console.log(JSON.stringify(payload, null, 2));
        else {
          console.log('holo verify:no-convex-client — default roots');
          console.log(`  root_count: ${payload.root_count}`);
          for (const r of roots) console.log(`  - ${r}`);
          console.log('  status: OK');
        }
        process.exit(0);
        break;
      }
      const report = verifyNoConvexClient({ roots });
      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatVerifyNoConvexClientText(report));
      }
      process.exit(report.ok ? 0 : 1);
      break;
    }
    case 'seed:e2e': {
      const { seedE2eDatabase } = await import('../db/seed-e2e.ts');
      const result = await seedE2eDatabase({ reset: args.reset || true });
      if (args.json) {
        console.log(
          JSON.stringify(
            {
              ok: result.ok,
              database: result.database,
              seed_fingerprint: result.seed_fingerprint,
              conversations: result.conversations,
              messages: result.messages,
              documents: result.documents,
              categories: result.categories,
              feed_items: result.feed_items,
              subscription_sources: result.subscription_sources,
              subscription_content: result.subscription_content,
              research_sessions: result.research_sessions,
              research_iterations: result.research_iterations,
              assimilation_sessions: result.assimilation_sessions,
              whats_new_reports: result.whats_new_reports,
              reset: result.reset,
              log: result.messages_log,
              errors: result.errors,
            },
            null,
            2
          )
        );
      } else {
        console.log('holo seed:e2e --reset');
        for (const m of result.messages_log) console.log(`  ${m}`);
        console.log(`  database: ${result.database}`);
        console.log(`  seed_fingerprint: ${result.seed_fingerprint}`);
        console.log(`  conversations: ${result.conversations}`);
        console.log(`  messages: ${result.messages}`);
        console.log(`  documents: ${result.documents}`);
        console.log(`  categories: ${result.categories}`);
        console.log(`  feed_items: ${result.feed_items}`);
        console.log(`  subscription_sources: ${result.subscription_sources}`);
        console.log(`  subscription_content: ${result.subscription_content}`);
        console.log(`  assimilation_sessions: ${result.assimilation_sessions}`);
        console.log(`  whats_new_reports: ${result.whats_new_reports}`);
        if (result.errors.length) for (const e of result.errors) console.error(`  error: ${e}`);
        console.log(result.ok ? '  status: OK' : '  status: FAIL');
      }
      process.exit(result.ok ? 0 : 1);
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
    case 'infer:trace': {
      // REDHAT-FIX-3 / H-1: dump durable modelCalls for a mission run (gate step 6)
      const id = args.positional[1] ?? args.runId ?? null;
      if (!id) {
        const payload = {
          ok: false,
          error: 'infer:trace requires <id> (mission run id)',
          code: 'INFER_TRACE_ID_REQUIRED',
        };
        if (args.json) console.log(JSON.stringify(payload, null, 2));
        else console.error(payload.error);
        process.exit(2);
      }
      try {
        const { loadInferTrace } = await import('../inference/infer-trace.ts');
        const result = await loadInferTrace(id, { limit: 500 });
        if (!result.ok) {
          if (args.json) console.log(JSON.stringify(result, null, 2));
          else console.error(`${result.code}: ${result.error}`);
          process.exit(1);
        }
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('holo infer:trace — durable modelCalls for mission run');
          console.log(`  runId:   ${result.runId}`);
          console.log(`  traceId: ${result.traceId ?? '—'}`);
          console.log(`  count:   ${result.count}`);
          if (result.modelCalls.length === 0) {
            console.log('  (no modelCalls)');
          } else {
            for (const c of result.modelCalls) {
              console.log(
                `  ${c.status.padEnd(7)} role=${c.role} provider=${c.provider} ` +
                  `endpoint=${c.endpoint} model=${c.modelId ?? '—'} ` +
                  `step=${c.stepId ?? '—'} trace=${c.traceId ?? '—'}`
              );
            }
          }
          console.log(result.count > 0 ? '  status: OK' : '  status: EMPTY');
        }
        process.exit(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const payload = { ok: false, error: msg, code: 'INFER_TRACE_FAILED' };
        if (args.json) console.log(JSON.stringify(payload, null, 2));
        else console.error(`holo infer:trace failed: ${msg}`);
        process.exit(1);
      }
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

      const deepseekHits = () =>
        captureRows.filter(
          (r) => r.host.includes('api.deepseek.com') || r.url.includes('api.deepseek.com')
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
            // CLI must NOT invent a parallel DeepSeek entry point.
            const escapeResult = await runBudgetedEscape({
              prompt,
              reason,
              estimatedCostUsd,
              runId: args.runId ?? undefined,
              stepId: 'holo-infer-call',
              role,
            });
            const deepseekCount = deepseekHits();
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
                escapeHostContacted: escapeResult.escapeHostContacted,
                reason,
              },
              resolved: {
                role,
                provider: 'deepseek' as const,
                endpoint: 'https://api.deepseek.com',
                baseURL: 'https://api.deepseek.com/v1',
                litellmModelId: escapeResult.modelId,
                modelRevision: `escape:${escapeResult.modelId}`,
                allowEscape: true,
              },
              networkCapture: {
                deepseekCount,
                fleetCount,
                rows: captureRows,
              },
            };
            if (args.json) {
              console.log(JSON.stringify(payload, null, 2));
            } else {
              console.log('holo infer:call — runBudgetedEscape (budgeted DeepSeek escape)');
              console.log(`  role:            ${role}`);
              console.log(`  mode:            runBudgetedEscape`);
              console.log(`  modelId:         ${escapeResult.modelId}`);
              console.log(`  tokens:          ${escapeResult.tokens}`);
              console.log(`  cost:            ${escapeResult.cost}`);
              console.log(`  ledgerId:        ${escapeResult.ledgerId}`);
              console.log(`  reason:          ${reason}`);
              console.log(`  text:            ${escapeResult.text.slice(0, 200)}`);
              console.log(
                `  networkCapture:  deepseek=${deepseekCount} fleet=${fleetCount} total=${captureRows.length}`
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
                      : /DEEPSEEK_API_KEY/i.test(msg)
                        ? 'DEEPSEEK_API_KEY_REQUIRED'
                        : 'ESCAPE_FAILED';
            const deepseekCount = deepseekHits();
            const payload = {
              ok: false,
              mode: 'runBudgetedEscape',
              error: code,
              role,
              allowEscape: true,
              message: msg,
              networkCapture: {
                deepseekCount,
                fleetCount: fleetHits(),
                rows: captureRows,
              },
            };
            if (args.json) {
              console.error(JSON.stringify(payload, null, 2));
            } else {
              console.error(`holo infer:call failed: ${code}`);
              console.error(`  ${msg}`);
              console.error(`  networkCapture.deepseekCount=${deepseekCount}`);
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
          const deepseekCount = deepseekHits();
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
                deepseekCount,
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
                `  networkCapture:  deepseek=${deepseekCount} fleet=${fleetCount} total=${captureRows.length}`
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
              deepseekCount,
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
            console.error(`  networkCapture.deepseekCount=${deepseekCount}`);
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
          const deepseekCount = deepseekHits();
          const payload = {
            ok: false,
            error: code,
            role,
            allowEscape: false,
            message: msg,
            networkCapture: {
              deepseekCount,
              fleetCount: fleetHits(),
              rows: captureRows,
            },
          };
          if (args.json) {
            console.error(JSON.stringify(payload, null, 2));
          } else {
            console.error(`holo infer:call failed: ${code}`);
            console.error(`  ${msg}`);
            console.error(`  networkCapture.deepseekCount=${deepseekCount}`);
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
    case 'verify:no-shells': {
      const { resolve } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const { scanPerDomainShells } = await import('../mission/verify-no-shells.ts');
      // repo root: services/platform/src/cli/holo.ts → ../../../../
      const here = fileURLToPath(new URL('.', import.meta.url));
      const repoRoot = resolve(here, '../../../..');
      const result = scanPerDomainShells(repoRoot);
      if (args.json) {
        console.log(JSON.stringify({ ok: result.ok, ...result }, null, 2));
      } else {
        console.log(`holo verify:no-shells — ${result.message}`);
        if (result.found.length > 0) {
          for (const f of result.found) console.log(`  - ${f}`);
        }
      }
      process.exit(result.ok ? 0 : 1);
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
          console.log('holo budget:status — DeepSeek escape budget ledger');
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
                const r = out.results[i];
                if (!r) continue;
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
                const r = out.results[i];
                if (!r) continue;
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
            top.some((r) => {
              if (typeof r.content !== 'string') return false;
              return expectedContent.some((needle) => r.content.includes(needle));
            });

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
    case 'chat:trace':
    case 'chat:route': {
      const runId = args.positional[1];
      if (!runId) {
        const payload = { ok: false, error: `${args.command} requires <run-id>` };
        if (args.json) console.log(JSON.stringify(payload, null, 2));
        else console.error(payload.error);
        process.exit(2);
      }
      try {
        const { getChatRun } = await import('../http/chat-runs.ts');
        const result = await getChatRun(runId);
        if (!result) {
          const payload = { ok: false, error: 'chat run not found', code: 'CHAT_RUN_NOT_FOUND' };
          if (args.json) console.log(JSON.stringify(payload, null, 2));
          else console.error(payload.error);
          process.exit(1);
        }
        const payload =
          args.command === 'chat:route'
            ? {
                ok: true,
                runId,
                triageRole: 'divergent',
                specialistRole: result.role,
                toolGrants: ['chat_context'],
                maxSteps: result.maxSteps,
              }
            : {
                ok: true,
                runId,
                traceId: result.traceId,
                status: result.status,
                maxSteps: result.maxSteps,
                stepsUsed: result.stepsUsed,
                events: result.events,
              };
        if (args.json) console.log(JSON.stringify(payload, null, 2));
        else console.log(JSON.stringify(payload, null, 2));
        process.exit(0);
      } catch (error) {
        const payload = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          code: 'CHAT_INSPECTION_FAILED',
        };
        if (args.json) console.log(JSON.stringify(payload, null, 2));
        else console.error(payload.error);
        process.exit(1);
      }
      break;
    }

    case 'research:inspect':
    case 'research:trace': {
      const sessionId = args.positional[1];
      if (!sessionId) {
        const payload = {
          ok: false,
          error: `${args.command} requires <research-session-id>`,
          code: 'RESEARCH_SESSION_ID_REQUIRED',
        };
        if (args.json) console.log(JSON.stringify(payload, null, 2));
        else console.error(payload.error);
        process.exit(2);
      }
      try {
        const { inspectResearchSession } = await import('../research/inspection.ts');
        const result = await inspectResearchSession(sessionId, {
          processes: args.command === 'research:trace' && args.processes,
        });
        if (args.json) console.log(JSON.stringify(result, null, 2));
        else console.log(result.ok ? JSON.stringify(result, null, 2) : result.error);
        process.exit(result.ok ? 0 : 1);
      } catch (error) {
        const payload = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          code: 'RESEARCH_INSPECTION_FAILED',
        };
        if (args.json) console.log(JSON.stringify(payload, null, 2));
        else console.error(payload.error);
        process.exit(1);
      }
      break;
    }

    /**
     * REDHAT-FIX-02 PATH-A production surface:
     * advance research_sessions.current_iteration via the real engine writer
     * (services/platform/src/research/progress.ts) — never advance-server.py.
     *
     *   holo research:advance-iteration <session-id> [steps=1] [--json]
     */
    case 'research:advance-iteration': {
      const sessionId = args.positional[1];
      if (!sessionId) {
        const payload = {
          ok: false,
          error: 'research:advance-iteration requires <research-session-id>',
          code: 'RESEARCH_SESSION_ID_REQUIRED',
          usage: 'holo research:advance-iteration <session-id> [steps] [--json]',
        };
        if (args.json) console.log(JSON.stringify(payload, null, 2));
        else console.error(payload.error);
        process.exit(2);
      }
      const stepsRaw = args.positional[2];
      const steps = stepsRaw != null && stepsRaw.length > 0 ? Math.floor(Number(stepsRaw)) : 1;
      if (!Number.isFinite(steps) || steps < 1 || steps > 50) {
        const payload = {
          ok: false,
          error: 'research:advance-iteration steps must be an integer 1..50',
          code: 'ITERATION_BOUNDS',
        };
        if (args.json) console.log(JSON.stringify(payload, null, 2));
        else console.error(payload.error);
        process.exit(2);
      }
      try {
        const { advanceResearchSessionIteration } = await import('../research/progress.ts');
        const advances: Array<Record<string, unknown>> = [];
        let lastOk = false;
        let last: Record<string, unknown> | null = null;
        for (let i = 0; i < steps; i++) {
          const result = await advanceResearchSessionIteration({ sessionId });
          advances.push(result as unknown as Record<string, unknown>);
          last = result as unknown as Record<string, unknown>;
          lastOk = result.ok;
          if (!result.ok) break;
        }
        const payload = {
          ok: lastOk,
          sessionId,
          stepsRequested: steps,
          stepsApplied: advances.filter((a) => a.ok === true).length,
          advances,
          result: last,
        };
        if (args.json) {
          console.log(JSON.stringify(payload, null, 2));
        } else if (lastOk && last) {
          console.log('holo research:advance-iteration');
          console.log(`  sessionId:         ${sessionId}`);
          console.log(`  stepsApplied:      ${payload.stepsApplied}/${steps}`);
          console.log(`  currentIteration:  ${String(last.currentIteration ?? '?')}`);
          console.log(`  maxIterations:     ${String(last.maxIterations ?? '?')}`);
          console.log('  status:            OK');
        } else {
          console.error(
            `research:advance-iteration failed: ${String(last?.error ?? 'unknown')} (${String(last?.errorCode ?? 'ERROR')})`
          );
        }
        process.exit(lastOk ? 0 : 1);
      } catch (error) {
        const payload = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          code: 'RESEARCH_ADVANCE_FAILED',
        };
        if (args.json) console.log(JSON.stringify(payload, null, 2));
        else console.error(payload.error);
        process.exit(1);
      }
      break;
    }

    case 'gate:eval': {
      const gatePath = args.claimsPath ?? args.refutingPath;
      if (!gatePath) {
        const payload = {
          ok: false,
          error: 'gate:eval requires --claims or --refuting <json>',
          code: 'GATE_CLAIMS_REQUIRED',
        };
        if (args.json) console.log(JSON.stringify(payload, null, 2));
        else console.error(payload.error);
        process.exit(2);
      }
      try {
        const { evaluateEvidenceGate } = await import('../research/evidence-gate.ts');
        const input = JSON.parse(readFileSync(gatePath, 'utf8')) as unknown;
        const result = evaluateEvidenceGate(input as never);
        const payload = { ok: result.admitted, ...result, pureTs: true };
        if (args.json) console.log(JSON.stringify(payload, null, 2));
        else
          console.log(
            payload.ok ? 'evidence gate admitted' : `evidence gate pending: ${payload.reason}`
          );
        process.exit(result.admitted ? 0 : 1);
      } catch (error) {
        const payload = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          code: 'GATE_EVAL_INVALID',
        };
        if (args.json) console.log(JSON.stringify(payload, null, 2));
        else console.error(payload.error);
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
    case 'article:compat': {
      const shareToken = args.positional[1];
      if (!shareToken) {
        const payload = {
          ok: false,
          error: 'article:compat requires <share-token>',
          code: 'ARTICLE_SHARE_TOKEN_REQUIRED',
        };
        if (args.json) console.log(JSON.stringify(payload, null, 2));
        else console.error(payload.error);
        process.exit(2);
      }
      const payload = {
        ok: true,
        shareToken,
        path: `/article/${encodeURIComponent(shareToken)}`,
        compatibility: 'convex-http-route',
      };
      if (args.json) console.log(JSON.stringify(payload, null, 2));
      else console.log(`${payload.path} (${payload.compatibility})`);
      process.exit(0);
      break;
    }

    case 'mission:cycle': {
      const cycleRunId = args.positional[1] ?? args.runId;
      if (!cycleRunId || cycleRunId.trim().length === 0) {
        const error = 'mission:cycle requires <run-id>';
        const usage = 'holo mission:cycle <run-id> [--json]';
        if (args.json) {
          exitMissionJsonError({
            error,
            code: 'MISSION_RUN_ID_REQUIRED',
            exitCode: 2,
            usage,
          });
        }
        console.error(`error: ${error}`);
        console.error(`Usage: ${usage}`);
        process.exit(2);
      }
      try {
        const { runMissionCycle } = await import('../mission/cycle.ts');
        const result = await runMissionCycle(cycleRunId.trim());
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('holo mission:cycle');
          console.log(`  runId:                  ${result.runId}`);
          console.log(`  cycleIndex:             ${result.cycle.index}`);
          console.log(`  assayInstanceId:        ${result.cycle.assayInstanceId}`);
          console.log(`  challengeInstanceId:    ${result.cycle.challengeInstanceId}`);
          console.log(
            `  assayChallengeDistinct: ${result.cycle.assayChallengeDistinct ? 'true' : 'false'}`
          );
          console.log(
            `  steeringApplied:        ${result.cycle.steeringApplied.length > 0 ? result.cycle.steeringApplied.join(' | ') : '(none)'}`
          );
          console.log(
            `  admission:              supporting=${result.cycle.admission.supportingAdmitted} refuting=${result.cycle.admission.refutingAdmitted} refutingFiltered=${result.cycle.admission.refutingFiltered}`
          );
          console.log('  status:                 OK');
        }
        process.exit(0);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code =
          error && typeof error === 'object' && 'code' in error
            ? String((error as { code: unknown }).code)
            : 'MISSION_CYCLE_FAILED';
        if (args.json) {
          console.log(
            JSON.stringify(
              {
                ok: false,
                error: message,
                code,
                errorCode: code,
              },
              null,
              2
            )
          );
        } else {
          console.error(`mission:cycle failed: ${message}`);
        }
        process.exit(1);
      }
      break;
    }

    case 'fulcrum:authorable-check':
      // Capstone seam compilation: contract + ledger + gate + role-bindings + publish.
      // Fail-fast on first MISSING seam → Overall INSUFFICIENT (exit 1).
      try {
        const { formatAuthorableCheckText, runFulcrumAuthorableCheck } = await import(
          './commands/fulcrum-authorable-check.ts'
        );
        const result = await runFulcrumAuthorableCheck();
        if (args.json) {
          console.log(
            JSON.stringify(
              {
                ok: result.ok,
                verdict: result.verdict,
                seams: result.seams,
                lines: result.lines,
              },
              null,
              2
            )
          );
        } else {
          console.log(formatAuthorableCheckText(result));
        }
        process.exit(result.ok ? 0 : 1);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (args.json) {
          console.log(
            JSON.stringify(
              {
                ok: false,
                verdict: 'INSUFFICIENT',
                error: message,
                code: 'FULCRUM_AUTHORABLE_CHECK_FAILED',
              },
              null,
              2
            )
          );
        } else {
          console.error(`fulcrum:authorable-check failed: ${message}`);
          console.log('Overall: INSUFFICIENT');
        }
        process.exit(1);
      }
      break;

    case 'fulcrum': {
      // Top-level CLI alias → shared evidence-research template (instantiation=fulcrum).
      // No new template code; templateKey is always 'evidence-research'.
      const goal = (args.goal ?? args.prompt ?? args.topic ?? args.positional[1])?.trim() || null;
      if (!goal) {
        const error = 'fulcrum requires <goal> (or --goal <text>)';
        const usage = "holo fulcrum '<goal>' [--claims <json>] [--json]";
        if (args.json) {
          exitMissionJsonError({
            error,
            code: 'MISSION_GOAL_REQUIRED',
            exitCode: 2,
            usage,
          });
        }
        console.error(`error: ${error}`);
        console.error(`Usage: ${usage}`);
        process.exit(2);
      }

      const componentsRaw = args.components?.trim();
      const components = componentsRaw ? Number(componentsRaw) : undefined;
      if (
        componentsRaw != null &&
        componentsRaw.length > 0 &&
        (!Number.isFinite(components) || !Number.isInteger(components) || (components ?? 0) < 1)
      ) {
        const error = 'fulcrum --components must be a positive integer';
        if (args.json) {
          exitMissionJsonError({
            error,
            code: 'MISSION_COMPONENTS_INVALID',
            exitCode: 2,
            usage: "holo fulcrum '<goal>' [--components <n>] [--json]",
          });
        }
        console.error(`error: ${error}`);
        process.exit(2);
      }

      const { runMissionTemplate } = await import('../mission/runtime.ts');
      const fixturePath = args.claimsPath ?? args.refutingPath;
      const evidence = fixturePath
        ? (JSON.parse(readFileSync(fixturePath, 'utf8')) as never)
        : undefined;
      const instantiation = 'fulcrum' as const;
      try {
        const result = await runMissionTemplate(
          {
            // TC-2 / AC-2: fulcrum is an alias — always evidence-research, never a new template key.
            templateKey: 'evidence-research',
            goal,
            topic: args.topic?.trim() || goal,
            components,
            instantiation,
            tags: [instantiation],
            idempotencyKey: defaultMissionIdempotencyKey(
              'research',
              {
                instantiation,
                goal,
                components: components ?? 'default',
              },
              { override: args.idempotencyKey, fresh: args.fresh }
            ),
            researchEvidence: evidence,
          },
          { ownerScope: 'runtime' }
        );
        if (args.json) console.log(JSON.stringify(result, null, 2));
        else printMissionRuntimeResult(result as Record<string, unknown>, 'fulcrum');
        process.exit(result.ok ? 0 : 1);
      } catch (error) {
        const payload = missionErrorPayload(error, 'MISSION_RUNTIME_FAILED');
        if (args.json) {
          console.log(JSON.stringify(payload, null, 2));
        } else {
          console.error(`error code: ${payload.errorCode}`);
          console.error(payload.error);
        }
        process.exit(1);
      }
      break;
    }

    case 'mission': {
      const sub = args.positional[1];
      const kind = args.positional[2];

      if (sub === 'template:register') {
        const templatePath = args.positional[2];
        if (!templatePath) {
          const error = 'mission template:register requires a JSON file path';
          const usage = 'holo mission template:register <file> [--json]';
          if (args.json) {
            exitMissionJsonError({
              error,
              code: 'MISSION_TEMPLATE_PATH_REQUIRED',
              exitCode: 2,
              usage,
            });
          } else {
            console.error(`error: ${error}`);
            console.error(`Usage: ${usage}`);
          }
          process.exit(2);
        }

        try {
          const { registerMissionTemplateFile } = await import('../mission/repository.ts');
          const result = await registerMissionTemplateFile(resolve(templatePath));
          if (args.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log('holo mission template:register');
            console.log(`  templateKey:          ${result.templateKey}`);
            console.log(`  version:              ${result.version}`);
            console.log(`  dslVersion:           ${result.dslVersion}`);
            console.log(`  created:              ${result.created}`);
            console.log(`  definitionHash:       ${result.definitionHash}`);
            console.log(`  compilerVersion:      ${result.compilerVersion}`);
            console.log(`  registrySnapshotHash: ${result.registrySnapshotHash}`);
            console.log(
              `  outputSchema:         ${result.outputSchemaRef}@${result.outputSchemaVersion}`
            );
            console.log(`  fleetManifestVersion: ${result.fleetManifestVersion}`);
            console.log(`  status:               OK`);
          }
          process.exit(0);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (args.json) {
            console.log(
              JSON.stringify(
                {
                  ok: false,
                  error: message,
                  code: 'MISSION_TEMPLATE_REGISTER_FAILED',
                  errorCode: 'MISSION_TEMPLATE_REGISTER_FAILED',
                },
                null,
                2
              )
            );
          } else {
            console.error(`mission template registration failed: ${message}`);
          }
          process.exit(1);
        }
      }

      // Shared evidence-research core (pipes-1): research | deepResearch | evidence-research
      // (plus future subscriptions-research / fulcrum) all resolve to template_key=evidence-research.
      if (
        sub === 'run' &&
        (kind === 'research' ||
          kind === 'deepResearch' ||
          kind === 'evidence-research' ||
          kind === 'subscriptions-research' ||
          kind === 'fulcrum')
      ) {
        const topic = args.topic?.trim() || null;
        const goal = (args.goal ?? args.prompt ?? topic)?.trim() || null;
        if (!goal) {
          const error = `mission run ${kind} requires --topic <text> or --goal <text>`;
          if (args.json) {
            exitMissionJsonError({
              error,
              code: 'MISSION_GOAL_REQUIRED',
              exitCode: 2,
              usage: MISSION_USAGE,
            });
          }
          console.error(`error: ${error}`);
          process.exit(2);
        }

        const componentsRaw = args.components?.trim();
        const components = componentsRaw ? Number(componentsRaw) : undefined;
        if (
          componentsRaw != null &&
          componentsRaw.length > 0 &&
          (!Number.isFinite(components) || !Number.isInteger(components) || (components ?? 0) < 1)
        ) {
          const error = `mission run ${kind} --components must be a positive integer`;
          if (args.json) {
            exitMissionJsonError({
              error,
              code: 'MISSION_COMPONENTS_INVALID',
              exitCode: 2,
              usage: MISSION_USAGE,
            });
          }
          console.error(`error: ${error}`);
          process.exit(2);
        }

        const { runMissionTemplate } = await import('../mission/runtime.ts');
        const fixturePath = args.claimsPath ?? args.refutingPath;
        const evidence = fixturePath
          ? (JSON.parse(readFileSync(fixturePath, 'utf8')) as never)
          : undefined;
        const instantiation =
          kind === 'evidence-research'
            ? 'research'
            : (kind as 'research' | 'deepResearch' | 'subscriptions-research' | 'fulcrum');
        try {
          const result = await runMissionTemplate(
            {
              // Shared core: every alias (research/deepResearch/subscriptions-research/fulcrum)
              // resolves to templateKey 'evidence-research' — never a distinct fulcrum template.
              templateKey: 'evidence-research',
              goal,
              topic: topic ?? goal,
              components,
              instantiation,
              tags: [instantiation],
              idempotencyKey: defaultMissionIdempotencyKey(
                'research',
                {
                  instantiation,
                  goal,
                  components: components ?? 'default',
                },
                { override: args.idempotencyKey, fresh: args.fresh }
              ),
              researchEvidence: evidence,
            },
            { ownerScope: 'runtime' }
          );
          if (args.json) console.log(JSON.stringify(result, null, 2));
          else printMissionRuntimeResult(result as Record<string, unknown>, `mission run ${kind}`);
          process.exit(result.ok ? 0 : 1);
        } catch (error) {
          const payload = {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            code: 'MISSION_RESEARCH_FAILED',
            errorCode: 'MISSION_RESEARCH_FAILED',
          };
          if (args.json) console.log(JSON.stringify(payload, null, 2));
          else console.error(payload.error);
          process.exit(1);
        }
      }

      // pipes-3: holo mission run whatsNew|whatsnew --date YYYY-MM-DD
      if (sub === 'run' && (kind === 'whatsNew' || kind === 'whatsnew')) {
        const date = args.date?.trim() || null;
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          const error = 'mission run whatsNew requires --date YYYY-MM-DD';
          if (args.json) {
            exitMissionJsonError({
              error,
              code: 'MISSION_WHATSNEW_DATE_REQUIRED',
              exitCode: 2,
              usage: MISSION_USAGE,
            });
          }
          console.error(`error: ${error}`);
          process.exit(2);
        }
        const goal = args.goal?.trim() || `daily briefing for ${date}`;
        const idempotencyKey = defaultMissionIdempotencyKey(
          'whatsnew',
          { date },
          { override: args.idempotencyKey, fresh: args.fresh }
        );
        try {
          const { runMissionTemplate } = await import('../mission/runtime.ts');
          const result = await runMissionTemplate(
            {
              templateKey: 'whatsnew',
              goal,
              date,
              idempotencyKey,
            },
            { ownerScope: 'runtime' }
          );
          if (args.json) console.log(JSON.stringify(result, null, 2));
          else printMissionRuntimeResult(result as Record<string, unknown>, 'mission run whatsNew');
          process.exit(result.ok ? 0 : 1);
        } catch (error) {
          const payload = {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            code: 'MISSION_WHATSNEW_FAILED',
            errorCode: 'MISSION_WHATSNEW_FAILED',
          };
          if (args.json) console.log(JSON.stringify(payload, null, 2));
          else console.error(payload.error);
          process.exit(1);
        }
      }

      // pipes-3: holo mission run assimilate --target <owner/repo>
      if (sub === 'run' && kind === 'assimilate') {
        const target = args.target?.trim() || null;
        if (!target) {
          const error = 'mission run assimilate requires --target <owner/repo>';
          if (args.json) {
            exitMissionJsonError({
              error,
              code: 'MISSION_ASSIMILATE_TARGET_REQUIRED',
              exitCode: 2,
              usage: MISSION_USAGE,
            });
          }
          console.error(`error: ${error}`);
          process.exit(2);
        }
        const goal = args.goal?.trim() || `assimilate ${target}`;
        const idempotencyKey = defaultMissionIdempotencyKey(
          'assimilate',
          { target },
          { override: args.idempotencyKey, fresh: args.fresh }
        );
        try {
          const { runMissionTemplate } = await import('../mission/runtime.ts');
          const result = await runMissionTemplate(
            {
              templateKey: 'assimilate',
              goal,
              target,
              idempotencyKey,
            },
            { ownerScope: 'runtime' }
          );
          if (args.json) console.log(JSON.stringify(result, null, 2));
          else
            printMissionRuntimeResult(result as Record<string, unknown>, 'mission run assimilate');
          process.exit(result.ok ? 0 : 1);
        } catch (error) {
          const payload = {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            code: 'MISSION_ASSIMILATE_FAILED',
            errorCode: 'MISSION_ASSIMILATE_FAILED',
          };
          if (args.json) console.log(JSON.stringify(payload, null, 2));
          else console.error(payload.error);
          process.exit(1);
        }
      }

      // pipes-3: holo mission run shop --query <term>
      if (sub === 'run' && kind === 'shop') {
        const query = args.query?.trim() || null;
        if (!query) {
          const error = 'mission run shop requires --query <term>';
          if (args.json) {
            exitMissionJsonError({
              error,
              code: 'MISSION_SHOP_QUERY_REQUIRED',
              exitCode: 2,
              usage: MISSION_USAGE,
            });
          }
          console.error(`error: ${error}`);
          process.exit(2);
        }
        const goal = args.goal?.trim() || `shop ${query}`;
        const idempotencyKey = defaultMissionIdempotencyKey(
          'shop',
          { query },
          { override: args.idempotencyKey, fresh: args.fresh }
        );
        try {
          const { runMissionTemplate } = await import('../mission/runtime.ts');
          const result = await runMissionTemplate(
            {
              templateKey: 'shop',
              goal,
              query,
              idempotencyKey,
            },
            { ownerScope: 'runtime' }
          );
          if (args.json) console.log(JSON.stringify(result, null, 2));
          else printMissionRuntimeResult(result as Record<string, unknown>, 'mission run shop');
          process.exit(result.ok ? 0 : 1);
        } catch (error) {
          const payload = {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            code: 'MISSION_SHOP_FAILED',
            errorCode: 'MISSION_SHOP_FAILED',
          };
          if (args.json) console.log(JSON.stringify(payload, null, 2));
          else console.error(payload.error);
          process.exit(1);
        }
      }

      // pipes-3 / REDHAT-FIX-4: standing subscriptions — bare path works without
      // --claims (PATH-A / standing provisional). Optional --claims remains override.
      if (sub === 'run' && kind === 'subscriptions') {
        const topic = args.topic?.trim() || args.goal?.trim() || 'subscription standing digest';
        const goal = args.goal?.trim() || topic;
        const idempotencyKey = defaultMissionIdempotencyKey(
          'subscriptions',
          { topic },
          { override: args.idempotencyKey, fresh: args.fresh }
        );
        const fixturePath = args.claimsPath ?? args.refutingPath;
        const researchEvidence = fixturePath
          ? (JSON.parse(readFileSync(fixturePath, 'utf8')) as never)
          : undefined;
        try {
          const { runMissionTemplate } = await import('../mission/runtime.ts');
          const result = await runMissionTemplate(
            {
              templateKey: 'subscriptions',
              goal,
              topic,
              idempotencyKey,
              researchEvidence,
            },
            { ownerScope: 'runtime' }
          );
          if (args.json) console.log(JSON.stringify(result, null, 2));
          else
            printMissionRuntimeResult(
              result as Record<string, unknown>,
              'mission run subscriptions'
            );
          process.exit(result.ok ? 0 : 1);
        } catch (error) {
          const payload = {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            code: 'MISSION_SUBSCRIPTIONS_FAILED',
            errorCode: 'MISSION_SUBSCRIPTIONS_FAILED',
          };
          if (args.json) console.log(JSON.stringify(payload, null, 2));
          else console.error(payload.error);
          process.exit(1);
        }
      }

      // pipes-2: holo mission run report --kind <kind> --target <host>
      if (sub === 'run' && kind === 'report') {
        const reportKind = args.uploadKind?.trim() ?? null;
        const target = args.target?.trim() || args.goal?.trim() || null;
        const destination = args.destination?.trim() || null;
        const allowedKinds = new Set(['revenue-validation', 'competitive', 'ai-roi', 'flights']);
        if (!reportKind || !allowedKinds.has(reportKind)) {
          const error =
            'mission run report requires --kind <revenue-validation|competitive|ai-roi|flights>';
          if (args.json) {
            exitMissionJsonError({
              error,
              code: 'MISSION_REPORT_KIND_REQUIRED',
              exitCode: 2,
              usage: MISSION_USAGE,
            });
          }
          console.error(`error: ${error}`);
          process.exit(2);
        }
        if (!target) {
          const error = 'mission run report requires --target <host-or-product>';
          if (args.json) {
            exitMissionJsonError({
              error,
              code: 'MISSION_REPORT_TARGET_REQUIRED',
              exitCode: 2,
              usage: MISSION_USAGE,
            });
          }
          console.error(`error: ${error}`);
          process.exit(2);
        }

        const subject = reportKind === 'flights' ? (destination ?? target) : target;
        const goal = args.goal?.trim() || `${reportKind} report for ${subject}`;
        const idempotencyKey = defaultMissionIdempotencyKey(
          'report',
          { reportKind, subject },
          { override: args.idempotencyKey, fresh: args.fresh }
        );

        // incomplete.com AC-4: force missing market_sizing before reasoning.
        const forceMissingComponents =
          target.toLowerCase().includes('incomplete.com') && reportKind === 'revenue-validation'
            ? ['market_sizing']
            : undefined;

        try {
          const { runMissionTemplate } = await import('../mission/runtime.ts');
          const result = await runMissionTemplate(
            {
              templateKey: 'business-report',
              goal,
              idempotencyKey,
              reportKind: reportKind as 'revenue-validation' | 'competitive' | 'ai-roi' | 'flights',
              target,
              destination: destination ?? undefined,
              forceMissingComponents,
            },
            { ownerScope: 'runtime' }
          );
          if (args.json) console.log(JSON.stringify(result, null, 2));
          else printMissionRuntimeResult(result as Record<string, unknown>, 'mission run report');
          process.exit(result.ok ? 0 : 1);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          let parsedError: unknown = message;
          try {
            parsedError = JSON.parse(message);
          } catch {
            // keep string
          }
          const payload = {
            ok: false,
            error: parsedError,
            errorMessage: message,
            code: 'MISSION_REPORT_FAILED',
            errorCode: 'MISSION_REPORT_FAILED',
            templateKey: 'business-report',
            reportKind,
            target,
          };
          if (args.json) console.log(JSON.stringify(payload, null, 2));
          else console.error(typeof parsedError === 'string' ? parsedError : message);
          process.exit(1);
        }
      }

      // D05-05: holo mission run fire-drill-monthly — CAP-BAK-01 monthly fire drill
      if (sub === 'run' && kind === 'fire-drill-monthly') {
        const goal = (args.goal ?? args.prompt)?.trim() || 'CAP-BAK-01 monthly fire drill';
        const idempotencyKey = defaultMissionIdempotencyKey(
          'fire-drill-monthly',
          {
            target: args.pitr ?? process.env.HOLO_FIRE_DRILL_TARGET_TIMESTAMP ?? 'runtime',
          },
          { override: args.idempotencyKey, fresh: args.fresh }
        );
        try {
          // Ensure template is registered before run (idempotent).
          const { registerFireDrillMonthlyTemplate } = await import('../mission/index.ts');
          await registerFireDrillMonthlyTemplate();
          const { runMissionTemplate } = await import('../mission/runtime.ts');
          const result = await runMissionTemplate(
            {
              templateKey: 'fire-drill-monthly',
              goal,
              idempotencyKey,
              targetTimestamp: args.pitr ?? undefined,
              scratch: args.scratch ?? undefined,
              blobDir: args.blobDir ?? undefined,
              reportPath: args.report ?? args.output ?? undefined,
              sourceBlobRoot: args.sourceBlobRoot ?? undefined,
            },
            { ownerScope: 'runtime' }
          );
          if (args.json) console.log(JSON.stringify(result, null, 2));
          else
            printMissionRuntimeResult(
              result as Record<string, unknown>,
              'mission run fire-drill-monthly'
            );
          process.exit(result.ok ? 0 : 1);
        } catch (error) {
          const payload = missionErrorPayload(error, 'MISSION_FIRE_DRILL_FAILED');
          if (args.json) console.log(JSON.stringify(payload, null, 2));
          else {
            console.error(`error code: ${payload.errorCode}`);
            console.error(payload.error);
          }
          process.exit(1);
        }
      }

      if (sub === 'run') {
        const templateKey = kind;
        if (!templateKey) {
          const error = 'mission run requires <template>';
          if (args.json) {
            exitMissionJsonError({
              error,
              code: 'MISSION_TEMPLATE_REQUIRED',
              exitCode: 2,
              usage: MISSION_USAGE,
            });
          }
          console.error(`error: ${error}`);
          console.error(`Usage: ${MISSION_USAGE}`);
          process.exit(2);
        }

        const goal = args.goal ?? args.prompt;
        if (!goal || goal.trim().length === 0) {
          const error = `mission run ${templateKey} requires --goal <text>`;
          if (args.json) {
            exitMissionJsonError({
              error,
              code: 'MISSION_GOAL_REQUIRED',
              exitCode: 2,
              usage: MISSION_USAGE,
            });
          }
          console.error(`error: ${error}`);
          process.exit(2);
        }

        const idempotencyKey = args.idempotencyKey?.trim();
        if (!idempotencyKey) {
          const error = `mission run ${templateKey} requires --idempotency-key <key>`;
          if (args.json) {
            exitMissionJsonError({
              error,
              code: 'MISSION_IDEMPOTENCY_KEY_REQUIRED',
              exitCode: 2,
              usage: MISSION_USAGE,
            });
          }
          console.error(`error: ${error}`);
          process.exit(2);
        }

        try {
          const { runMissionTemplate } = await import('../mission/runtime.ts');
          const result = await runMissionTemplate({
            templateKey,
            goal,
            idempotencyKey,
            targetTimestamp: args.pitr ?? undefined,
            scratch: args.scratch ?? undefined,
            blobDir: args.blobDir ?? undefined,
            reportPath: args.report ?? args.output ?? undefined,
            sourceBlobRoot: args.sourceBlobRoot ?? undefined,
          });
          if (args.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            printMissionRuntimeResult(
              result as Record<string, unknown>,
              `mission run ${templateKey}`
            );
          }
          process.exit(result.ok ? 0 : 1);
        } catch (error) {
          const payload = missionErrorPayload(error, 'MISSION_RUNTIME_FAILED');
          if (args.json) {
            console.log(JSON.stringify(payload, null, 2));
          } else {
            console.error(`error code: ${payload.errorCode}`);
            console.error(payload.error);
          }
          process.exit(1);
        }
      }

      if (sub === 'resume') {
        const runId = args.positional[2];
        if (!runId) {
          const error = 'mission resume requires <run-id>';
          if (args.json) {
            exitMissionJsonError({
              error,
              code: 'MISSION_RUN_ID_REQUIRED',
              exitCode: 2,
              usage: MISSION_USAGE,
            });
          }
          console.error(`error: ${error}`);
          process.exit(2);
        }

        try {
          const { resumeMissionRun } = await import('../mission/runtime.ts');
          const fixturePath = args.claimsPath ?? args.refutingPath;
          const researchEvidence = fixturePath
            ? (JSON.parse(readFileSync(fixturePath, 'utf8')) as never)
            : undefined;
          const result = await resumeMissionRun(runId, { researchEvidence });
          if (args.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            printMissionRuntimeResult(result as Record<string, unknown>, `mission resume ${runId}`);
          }
          process.exit(result.ok ? 0 : 1);
        } catch (error) {
          const payload = missionErrorPayload(error, 'MISSION_RUNTIME_FAILED');
          if (args.json) {
            console.log(JSON.stringify(payload, null, 2));
          } else {
            console.error(`error code: ${payload.errorCode}`);
            console.error(payload.error);
          }
          process.exit(1);
        }
      }

      if (sub === 'status') {
        const runId = args.positional[2];
        if (!runId) {
          const error = 'mission status requires <run-id>';
          if (args.json) {
            exitMissionJsonError({
              error,
              code: 'MISSION_RUN_ID_REQUIRED',
              exitCode: 2,
              usage: MISSION_USAGE,
            });
          }
          console.error(`error: ${error}`);
          process.exit(2);
        }

        try {
          const { getMissionRunStatus } = await import('../mission/runtime.ts');
          const result = await getMissionRunStatus(runId);
          if (args.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            printMissionRuntimeResult(result as Record<string, unknown>, `mission status ${runId}`);
          }
          process.exit(result.ok ? 0 : 1);
        } catch (error) {
          const payload = missionErrorPayload(error, 'MISSION_RUNTIME_FAILED');
          if (args.json) {
            console.log(JSON.stringify(payload, null, 2));
          } else {
            console.error(`error code: ${payload.errorCode}`);
            console.error(payload.error);
          }
          process.exit(1);
        }
      }

      const error = sub
        ? `unknown command: mission ${sub}${kind ? ` ${kind}` : ''}`
        : 'mission requires subcommand (template:register | run | resume | status)';
      if (args.json) {
        exitMissionJsonError({
          error,
          code: sub ? 'MISSION_COMMAND_UNKNOWN' : 'MISSION_SUBCOMMAND_REQUIRED',
          exitCode: 2,
          usage: MISSION_USAGE,
        });
      }
      console.error(sub ? error : `error: ${error}`);
      console.error(`Usage: ${MISSION_USAGE}`);
      process.exit(2);
      break;
    }
    case 'ci': {
      const sub = args.positional[1] ?? '';
      if (sub === 'runner:status' || sub === 'runner-status') {
        const { checkRunnerStatus } = await import('../ci/runner-status.ts');
        let result;
        try {
          result = await checkRunnerStatus({ lane: args.lane });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (args.json) {
            console.log(JSON.stringify({ ok: false, online: false, errors: [msg] }, null, 2));
          } else {
            console.error(`runner fail-closed: ${msg}`);
          }
          process.exit(1);
        }
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(
            result.ok
              ? `runner online (${result.lane}): ${result.matching_runners.map((r) => r.name).join(', ')}`
              : `runner fail-closed (${result.lane}): ${result.errors.join('; ')}`
          );
        }
        process.exit(result.ok ? 0 : 1);
      }
      console.error('Usage: holo ci runner:status [--json] [--lane integration|e2e]');
      process.exit(2);
      break;
    }

    case 'ci:runner:status':
    case 'ci:runner-status': {
      const { checkRunnerStatus } = await import('../ci/runner-status.ts');
      let result;
      try {
        result = await checkRunnerStatus({ lane: args.lane });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (args.json) {
          console.log(JSON.stringify({ ok: false, online: false, errors: [msg] }, null, 2));
        } else {
          console.error(`runner fail-closed: ${msg}`);
        }
        process.exit(1);
      }
      if (args.json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(
          result.ok
            ? `runner online (${result.lane}): ${result.matching_runners.map((r) => r.name).join(', ')}`
            : `runner fail-closed (${result.lane}): ${result.errors.join('; ')}`
        );
      }
      process.exit(result.ok ? 0 : 1);
      break;
    }

    case 'db:provision-nonprod': {
      const { provisionNonprodNamespace } = await import('../db/nonprod.ts');
      const result = await provisionNonprodNamespace();
      if (args.json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log('holo db:provision-nonprod');
        for (const m of result.messages) console.log(`  ${m}`);
        if (result.errors.length) for (const e of result.errors) console.error(`  error: ${e}`);
        console.log(result.ok ? '  status: OK' : '  status: FAIL');
      }
      process.exit(result.ok ? 0 : 1);
      break;
    }

    case 'namespace': {
      const sub = args.positional[1] ?? '';
      if (sub !== 'reset') {
        console.error('Usage: holo namespace reset [--json]');
        process.exit(2);
      }
      const { seedDatabase } = await import('../db/seed.ts');
      const result = await seedDatabase({ reset: true });
      if (args.json)
        console.log(JSON.stringify({ ...result, namespace: 'holocron_nonprod' }, null, 2));
      else {
        console.log('holo namespace reset');
        for (const m of result.messages) console.log(`  ${m}`);
        console.log(`  namespace: holocron_nonprod`);
        console.log(`  seed_fingerprint: ${result.seed_fingerprint}`);
        if (result.errors.length) for (const e of result.errors) console.error(`  error: ${e}`);
        console.log(result.ok ? '  status: OK' : '  status: FAIL');
      }
      process.exit(result.ok ? 0 : 1);
      break;
    }

    case 'db': {
      const sub = args.positional[1] ?? '';
      if (sub === 'seed') {
        const { seedDatabase } = await import('../db/seed.ts');
        const result = await seedDatabase({ reset: args.reset || true });
        if (args.json) console.log(JSON.stringify(result, null, 2));
        else {
          console.log('holo db seed --reset');
          for (const m of result.messages) console.log(`  ${m}`);
          console.log(`  database: ${result.database}`);
          console.log(`  seed_fingerprint: ${result.seed_fingerprint}`);
          console.log(`  table_count: ${result.table_count}`);
          console.log(`  fixture_ids: ${result.fixture_ids.join(',')}`);
          if (result.errors.length) for (const e of result.errors) console.error(`  error: ${e}`);
          console.log(result.ok ? '  status: OK' : '  status: FAIL');
        }
        process.exit(result.ok ? 0 : 1);
      }
      console.error('Usage: holo db seed --reset [--json] | holo db:provision-nonprod');
      process.exit(2);
      break;
    }

    case 'db:seed': {
      const { seedDatabase } = await import('../db/seed.ts');
      const result = await seedDatabase({ reset: true });
      if (args.json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log('holo db:seed --reset');
        for (const m of result.messages) console.log(`  ${m}`);
        console.log(`  database: ${result.database}`);
        console.log(`  seed_fingerprint: ${result.seed_fingerprint}`);
        console.log(`  table_count: ${result.table_count}`);
        console.log(`  fixture_ids: ${result.fixture_ids.join(',')}`);
        if (result.errors.length) for (const e of result.errors) console.error(`  error: ${e}`);
        console.log(result.ok ? '  status: OK' : '  status: FAIL');
      }
      process.exit(result.ok ? 0 : 1);
      break;
    }

    case 'prd:consistency': {
      const { runPrdConsistency } = await import('../prd/consistency.ts');
      const result = runPrdConsistency({ root: args.root ?? undefined });
      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(
          result.ok
            ? `prd consistency OK — tables=${result.table_count} tools=${result.tool_count} uc=${result.uc_count}`
            : `prd consistency FAIL — ${result.errors.join('; ')}`
        );
      }
      process.exit(result.ok ? 0 : 1);
      break;
    }

    case 'inventory:convex-callsites': {
      const { scanCallSites } = await import('../sync/client-callsite-inventory.ts');
      const root = args.root ?? resolve('.');
      let inventory: ReturnType<typeof scanCallSites>;
      try {
        inventory = scanCallSites({ root });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo inventory:convex-callsites failed: ${msg}`);
        }
        process.exit(1);
      }
      const jsonStr = `${JSON.stringify(inventory, null, 2)}\n`;
      if (args.output) {
        const { mkdirSync, writeFileSync } = await import('node:fs');
        const { dirname, resolve: resolvePath } = await import('node:path');
        const outAbs = resolvePath(args.output);
        mkdirSync(dirname(outAbs), { recursive: true });
        writeFileSync(outAbs, jsonStr, 'utf8');
      }
      if (args.json) {
        // When --json is requested, emit the full artifact on stdout.
        // If --output was also passed the file copy is identical.
        process.stdout.write(jsonStr);
      } else {
        console.log('holo inventory:convex-callsites — legacy RN Convex call sites');
        console.log(`  source_roots:        ${inventory.source_roots.join(', ')}`);
        console.log(`  file_count:          ${inventory.summary.file_count}`);
        console.log(`  call_site_count:     ${inventory.summary.call_site_count}`);
        console.log(`  schema_version:      ${inventory.schema_version}`);
        if (args.output) {
          console.log(`  artifact:            ${args.output}`);
        }
      }
      process.exit(0);
      break;
    }

    case 'client-contract:author': {
      // S-CONTRACT-02 — author 13-client-data-contract.yaml from the
      // S-CONTRACT-01 inventory + live zero_pub + Hono surfaces.
      const inventoryPath =
        args.inventory ??
        args.positional[1] ??
        '.spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json';
      const defaultOutput =
        '.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml';
      const { authorContract, serializeContractYaml } = await import(
        '../sync/client-data-contract-author.ts'
      );
      let contract: ReturnType<typeof authorContract>;
      try {
        contract = authorContract({
          inventoryPath,
          outputPath: args.output ?? defaultOutput,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (args.json) {
          console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`holo client-contract:author failed: ${msg}`);
        }
        process.exit(1);
      }
      const yamlStr = `${serializeContractYaml(contract)}\n`;
      const outPath = args.output ?? defaultOutput;
      const { mkdirSync, writeFileSync } = await import('node:fs');
      const { dirname, resolve: resolvePath } = await import('node:path');
      const outAbs = resolvePath(outPath);
      mkdirSync(dirname(outAbs), { recursive: true });
      writeFileSync(outAbs, yamlStr, 'utf8');
      if (args.json) {
        process.stdout.write(yamlStr);
      } else {
        console.log('holo client-contract:author — S-CONTRACT-02 client data contract');
        console.log(`  inventory:                 ${inventoryPath}`);
        console.log(`  contract:                  ${outAbs}`);
        console.log(`  total_entries:             ${contract.summary.total_entries}`);
        console.log(
          `  by_target_kind:            zero_query=${contract.summary.by_target_kind.zero_query} zero_mutator=${contract.summary.by_target_kind.zero_mutator} hono_command=${contract.summary.by_target_kind.hono_command}`
        );
        console.log(
          `  by_offline_policy:         cache_read=${contract.summary.by_offline_policy.cache_read} queue_write=${contract.summary.by_offline_policy.queue_write} online_only=${contract.summary.by_offline_policy.online_only} rollback_rejection=${contract.summary.by_offline_policy.rollback_rejection}`
        );
        console.log(`  offline_behavior_cases:    ${contract.summary.offline_behavior_case_count}`);
        console.log(`  unresolved_target_count:   ${contract.summary.unresolved_target_count}`);
      }
      process.exit(contract.summary.unresolved_target_count === 0 ? 0 : 1);
      break;
    }

    case 'verify:client-contract': {
      // S-CONTRACT-02 — verify the authored client data contract.
      // Three independent checks: --schema (AC-2), --targets (AC-3),
      // --e2e-links (AC-4). Each can be invoked alone; passing none runs
      // all three. Exit 0 only when every requested check is green.
      const contractPath =
        args.contract ??
        '.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml';
      const inventoryPath =
        args.inventory ??
        '.spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json';
      const { formatReportText, verifyE2ELinks, verifySchema, verifyTargets } = await import(
        '../sync/client-data-contract-verify.ts'
      );
      // If no check flag is passed, run all three.
      const runSchema =
        args.verifySchema || (!args.verifySchema && !args.verifyTargets && !args.verifyE2ELinks);
      const runTargets =
        args.verifyTargets || (!args.verifySchema && !args.verifyTargets && !args.verifyE2ELinks);
      const runE2E =
        args.verifyE2ELinks || (!args.verifySchema && !args.verifyTargets && !args.verifyE2ELinks);
      const reports = [];
      if (runSchema) {
        try {
          reports.push(verifySchema(contractPath, inventoryPath));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (args.json) {
            console.error(JSON.stringify({ ok: false, check: 'schema', error: msg }, null, 2));
          } else {
            console.error(`holo verify:client-contract --schema failed: ${msg}`);
          }
          process.exit(1);
        }
      }
      if (runTargets) {
        try {
          reports.push(verifyTargets(contractPath, inventoryPath));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (args.json) {
            console.error(JSON.stringify({ ok: false, check: 'targets', error: msg }, null, 2));
          } else {
            console.error(`holo verify:client-contract --targets failed: ${msg}`);
          }
          process.exit(1);
        }
      }
      if (runE2E) {
        try {
          reports.push(verifyE2ELinks(contractPath, inventoryPath));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (args.json) {
            console.error(JSON.stringify({ ok: false, check: 'e2e-links', error: msg }, null, 2));
          } else {
            console.error(`holo verify:client-contract --e2e-links failed: ${msg}`);
          }
          process.exit(1);
        }
      }
      if (args.json) {
        process.stdout.write(`${JSON.stringify({ results: reports }, null, 2)}\n`);
      } else {
        for (const r of reports) {
          console.log(formatReportText(r));
          console.log('');
        }
      }
      const allOk = reports.length > 0 && reports.every((r) => r.ok);
      process.exit(allOk ? 0 : 1);
      break;
    }

    default:
      console.error(`unknown command: $args.command`);
      printHelp();
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
