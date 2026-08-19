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
- `S33-MCP-03` currently prohibits production writes. This conflicts with the approved,
  namespaced, reversible 44-tool production sweep and must be repaired without weakening cleanup,
  provenance, or real-service requirements.

## Required execution order

1. Preserve unrelated `.tmp` evidence. Snapshot the SQLite database with SQLite backup semantics,
   recursively inventory and hash the blob and export sources without following links, and create
   a production Postgres rollback checkpoint before changing production data.
2. Load the full composite corpus into an isolated Postgres candidate on the Holocron device.
3. Require exact inventory, identifier, checksum, relationship, blob, embedding, and API
   reconciliation with zero missing IDs, unexpected rows, FK orphans, checksum mismatches, or ETL
   errors.
4. Freeze local writes, re-snapshot the source, require the pre/copy/post semantic identities to
   match, and apply that verified artifact to production.
5. Deploy an exact committed SHA, flip `HOLO_DATA_PLANE=postgres`, verify known migrated reads, and
   disable `HOLO_MIGRATION_READ_ONLY` only after reconciliation and rollback proof pass.
6. Run the frozen 44 MCP tools in manifest order with guarded production writes. Stop at the first
   failure; classify it, make the narrowest production repair, deploy the repair SHA, retry that
   tool and its family, then resume.
7. Prove zero namespaced residue, then replace local MCP registrations for Codex, Claude,
   OpenCode, and Grok with the remote Streamable HTTP endpoint.
8. Independently smoke-test all four harnesses and leave production mutations enabled.

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

- `MK6-DATA-001` owns immutable composite source capture, candidate and production load,
  provenance, and exact reconciliation. Its export-only retained implementation is WIP, not proof.
- `S33-PLAT-04` consumes a fresh passing `MK6-DATA-001` production corpus proof at flip time.
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

1. `MK6-DATA-001` — composite source capture, isolated candidate, load, and exact reconciliation.
2. `S33-PLAT-04` — proof-gated production flip to Postgres.
3. `CUTOVER-MCP-001` — guarded manifest-ordered production sweep, repair checkpointing, and cleanup.
4. `MK6-MCP-001` — narrow executor fixes discovered by the live sweep.
5. `S33-MCP-03` — final deployed dual-transport and all-tool proof under the repaired write policy.
6. `CUTOVER-HARNESS-001` — non-secret zsh/cmux credential bootstrap.
7. `CUTOVER-HARNESS-002` — atomic four-harness switch and independent live smoke.

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

Before ordinary remote writes begin, service rollback may restore the pre-cutover state. After
ordinary remote writes begin, rollback preserves the Postgres database and reverts only to a
previously verified Postgres-capable release. Harness configuration rollback is per-harness and
atomic. The local SQLite database and pre-cutover snapshot remain retained through remote soak.
