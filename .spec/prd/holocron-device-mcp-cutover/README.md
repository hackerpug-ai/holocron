# Holocron Device Cutover and Four-Harness MCP Migration

## Status

Approved for implementation on 2026-08-19. This umbrella plan reconciles and supersedes only the
obsolete constraints identified below; it does not erase prior task history or retained evidence.

## Outcome

The complete retained Holocron corpus is reconciled into production Postgres on the Holocron
device, the deployed service serves the Postgres data plane, all frozen 44 MCP tools have live
production evidence, and Codex, Claude, OpenCode, and Grok use the mutation-enabled remote MCP.

## Current gap

- The recovered `$HOME/.holocron` composite corpus is authoritative and includes the retained
  Convex export, every newer SQLite write, documents and articles, research, subscriptions,
  transcripts, toolbelt data, improvements, embeddings, and blob/file objects.
- The retained `MK6-DATA-001` implementation branch proves only an older export-only path and is
  not sufficient for this plan's composite-corpus contract.
- Production must not flip until an isolated candidate and a production rollback checkpoint have
  both been independently reconciled.
- The deployed backup command currently resolves host `127.0.0.1:5432` even though production
  Postgres is published by Compose on `127.0.0.1:44112`; the referenced pgBackRest paths and
  binaries do not exist in either current runtime. No checkpoint claim is valid until a
  Compose-aware checkpoint is independently restored with Postgres and blob parity.
- There is no deterministic, versioned exact-SHA staging/package/deploy command. A health payload
  cannot substitute for a staged release manifest bound to Git SHA, OCI digest, Compose digest,
  and the observed running containers.
- `S33-MCP-03` currently prohibits production writes. This conflicts with the approved,
  namespaced, reversible 44-tool production sweep and must be repaired without weakening cleanup,
  provenance, or real-service requirements.

## Required execution order

1. Finish `MK6-DATA-001` as an isolated-only proof and retain its reviewed immutable composite
   artifact; it does not write production Postgres or production blob volumes.
2. Stage, package, deploy, and independently observe one exact committed release while the serving
   plane remains Convex and `HOLO_MIGRATION_READ_ONLY=1`.
3. Create a Compose-aware production Postgres plus blob checkpoint and restore it into distinct
   empty Compose volumes; require independent database, ledger, and blob parity before proceeding.
4. Arm a durable local SQLite/blob write freeze, prove the current corpus still equals the reviewed
   MK6 manifest, then apply that exact artifact through the same reviewed transform to production
   and reconcile source-to-target plus target-to-source while the serving plane remains Convex.
5. Flip only `HOLO_DATA_PLANE=postgres` and `HOLO_ROLLBACK_TARGET=postgres`, prove migrated reads,
   and prove `HOLO_MIGRATION_READ_ONLY=1` remained armed before, during, and after the flip.
6. In a separate operator-authorized action bound to the composite manifest, production checkpoint,
   production reconcile receipt, and exact release, lift the write fence and durably record PONR.
7. Run the frozen 44 MCP tools in manifest order with guarded production writes. Stop at the first
   failure; classify it, make the narrowest production repair, deploy the repair SHA, retry that
   tool and its family, then resume.
8. Prove zero namespaced residue, then replace local MCP registrations for Codex, Claude,
   OpenCode, and Grok with the remote Streamable HTTP endpoint.
9. Independently smoke-test all four harnesses and leave production mutations enabled.

## Composite migration contract

- The canonical source root is `$HOME/.holocron`; baselines are discovered facts, never hardcoded
  expected counts.
- Source snapshots are immutable run artifacts. The retained local database and its pre-cutover
  snapshot remain available through the remote soak and are never deleted by this work.
- The migration preserves original identifier provenance and deterministic source-to-target maps.
- Every source identity is exactly one of materialized or explicitly nonmaterialized, and every
  referenced or unreferenced blob has an exact byte/hash disposition.
- Candidate and production loads use the same verified artifact and production transform path.
- Production reconciliation is symmetric: source-to-target and target-to-source inventories both
  match, including post-export SQLite rows and all blob/file objects.

## Guarded 44-tool verifier

The live verifier keeps the frozen tool names and schemas unchanged and adds:

- `--tool <id>` to run one frozen tool.
- `--run-id <id>` to bind evidence, writes, and cleanup to one run.
- An explicitly guarded production-write mode.

Production-write mode fails closed unless all of the following are proven in the same run:

- Expected tailnet host: `https://holocron.tail011a51.ts.net:44111`.
- Deployed exact SHA and running image identity.
- Postgres-backed health identity.
- Bearer credential resolved without printing it.
- A fresh rollback checkpoint.
- A unique `mcp-e2e-<run-id>` namespace.

Every created row and dependent job is recorded in a run ledger, verified through independent
Postgres or real external-service evidence, and removed only by recorded identifier in a scoped
transaction. Residual rows, queued jobs, or cleanup failures are blocking failures. A correct
oracle is never weakened to obtain green.

## Harness cutover contract

All four harnesses use native Streamable HTTP at:

`https://holocron.tail011a51.ts.net:44111/mcp`

- Codex resolves bearer auth from environment variable `HOLO_KEY_MCP`.
- Claude sends `Authorization: Bearer ${HOLO_KEY_MCP}`.
- OpenCode sends `Authorization: Bearer {env:HOLO_KEY_MCP}`.
- Grok has an explicit user-scoped remote entry using `${HOLO_KEY_MCP}` and does not inherit the
  old Claude-compatible local SQLite entry.

The credential value exists only in the ignored canonical
`services/platform/config/secrets.yaml`. A non-secret zsh/cmux bootstrap uses the existing secrets
parser to export `HOLO_KEY_MCP` without printing or duplicating it. Missing credentials fail closed.
If any harness switch fails, that harness's prior configuration is restored atomically.

## Reconciliation with existing work

- `MK6-DATA-001` owns immutable composite source capture, isolated candidate load, provenance, and
  exact isolated reconciliation. It never writes production Postgres or production blob volumes.
- `CUTOVER-RELEASE-001` owns deterministic exact-SHA staging/package/deploy while Convex still
  serves and the Postgres write fence remains armed.
- `CUTOVER-PLAT-001` owns the Compose-aware Postgres/blob rollback checkpoint and independent
  restore proof; `CUTOVER-DATA-001` owns the frozen production apply and reconciliation.
- `S33-PLAT-04` consumes the production reconcile receipt and flips reads while retaining
  `HOLO_MIGRATION_READ_ONLY=1`; `CUTOVER-PLAT-002` separately owns write enablement and PONR.
- `S33-MCP-03` owns deployed dual-transport and production live-tool proof. Its obsolete blanket
  production-write prohibition is replaced by the guarded namespace/ledger/cleanup contract here.
- `MK6-MCP-001` owns narrow executor semantics fixes discovered during the manifest-ordered live
  sweep; tool names and schemas remain frozen.
- Harness configuration and bootstrap changes start only after the server's final 44-tool sweep is
  green and residue-free.

## Task pipeline

The retired `/kb-project-plan` step is represented by the current governed task-planning output in
`.spec/tasks/holocron-device-mcp-cutover/`. The MCP specialist proposed the missing contracts and
the existing specialist-authored task files remain authoritative for the migration and flip:

1. `MK6-DATA-001` — immutable composite capture and isolated-only reconciliation.
2. `CUTOVER-RELEASE-001` — deterministic exact-SHA stage/package/deploy under the write fence.
3. `CUTOVER-PLAT-001` — Compose-aware Postgres/blob checkpoint and independent restore proof.
4. `CUTOVER-DATA-001` — durable local freeze, exact production apply, and symmetric reconcile.
5. `S33-PLAT-04` — proof-gated read flip that retains `HOLO_MIGRATION_READ_ONLY=1`.
6. `CUTOVER-PLAT-002` — separately authorized manifest/checkpoint-bound write enablement and PONR.
7. `CUTOVER-MCP-001` — guarded manifest-ordered production sweep, repair checkpointing, and cleanup.
8. `MK6-MCP-001` — narrow executor fixes discovered by the live sweep.
9. `S33-MCP-03` — final deployed dual-transport and all-tool proof under the repaired write policy.
10. `CUTOVER-HARNESS-001` — non-secret zsh/cmux credential bootstrap.
11. `CUTOVER-HARNESS-002` — atomic four-harness switch and independent live smoke.

## Acceptance gates

### Migration

- Fresh pre/post source snapshots match the Postgres corpus exactly.
- Zero missing IDs, unexpected rows, FK orphans, checksum mismatches, missing blobs, or ETL errors.
- A production rollback checkpoint exists and is independently restorable before the flip.

### Service and protocol

- `/health` reports the expected SHA and `data_plane: postgres`.
- A known migrated document is nonempty through Hono and MCP.
- Fleet-backed hybrid search succeeds against real inference.
- Unauthorized MCP HTTP receives 401; authorized initialization succeeds.
- Deployed HTTP and deployed stdio enumerate exactly the frozen 44 tools.

### Tools

- All 44 tools receive real calls in manifest order.
- Reads match independent database or external-service evidence.
- Mutations persist expected state, honor replay/idempotency contracts, and use real feeds,
  retailers, fleet services, and workflow dependencies.
- No mock, canned success, placeholder transport, skipped core behavior, or residual test namespace
  is accepted.

### Harnesses

Each of Codex, Claude, OpenCode, and Grok independently:

- Discovers exactly 44 remote tools.
- Reads a sentinel migrated document.
- Performs and reverses a namespaced subscription mutation.
- Shows no local SQLite MCP child process.

### Final verification

- Rerun all 44 tools after the last repair and prove zero namespace residue.
- Run typecheck, lint, full tests, build, and unskipped pre-commit hooks.
- Verify the deployed exact SHA, then run a fresh four-harness smoke test.

## Rollback boundary

Before `CUTOVER-PLAT-002` records PONR, an explicit rollback may restore the bound checkpoint and
re-point reads to frozen Convex. After PONR or the first accepted ordinary write, Convex rollback is
forbidden: rollback preserves Postgres and may only deploy a previously verified Postgres-capable
release. Harness rollback remains per-harness and atomic. The local SQLite database, blob corpus,
and immutable MK6 artifact remain retained through remote soak.
