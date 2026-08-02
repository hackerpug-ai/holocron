# D07-04: Record the data-plane point of no return (first accepted Postgres write)

> **Task ID:** D07-04
> **Sprint:** [Sprint 30 — Cutover Rollback Drill and Data-Plane PONR](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Estimate:** 90 min
> **Type:** FEATURE
> **Priority:** P0 · **Effort:** M
> **Proposed By:** `mastra-planner`
> **TDD_MODE:** `shared` · **RED_GREEN_REQUIRED:** no
> Status: Backlog

**Capabilities:** CAP-CUT-01
**PRD refs:** UC-SYNC-04, UC-SYNC-05, T-SYNC-014

## Specification

**Objective.** Build the data-plane point of no return: an append-only, DB-immutable, singleton Postgres ledger recording the first accepted Postgres production write together with a live Convex escape-hatch snapshot; a cutover:enable-writes operator verb that fails closed on Convex divergence, lifts the migration_read_only fence, and records the PONR; and a reciprocal fail-closed latch that makes cutover:rollback-repoint permanently refuse afterwards with its own distinct error code, a latch that cannot be defeated by touching the filesystem.

**Success state.** bun services/platform/src/cli/holo.ts db:migrate creates data_plane_ponr. bun services/platform/src/cli/holo.ts cutover:enable-writes --json captures a live Convex snapshot, refuses with CONVEX_ESCAPE_HATCH_DIVERGED if Convex has drifted past the watermark, otherwise lifts HOLO_MIGRATION_READ_ONLY to '0' in the durable secrets control plane, drives one real POST /api/documents (HTTP 201) against the pre-existing serving process, and inserts exactly one data_plane_ponr row whose write_row_digest_sha256 matches a digest recomputed from the committed documents row and whose convex_* columns are populated from the live deployment. Re-running exits 0 with already_recorded:true and the same ponr_id, creating no second row and no second write. UPDATE/DELETE on the row are rejected by Postgres with SQLSTATE 42501 (holocron_app) and P0001/PONR_IMMUTABLE (owner). cutover:rollback-repoint --json thereafter exits 2 with error.code POST_PONR_INELIGIBLE and writes no HOLO_DATA_PLANE: convex, and continues to do so after every .tmp cutover artifact has been deleted and after the audit is rewritten to zero accepted writes. All D07-01 RED tests are green.

## Critical Constraints

- **MUST** — MUST enforce immutability at the DATABASE level with TWO layers: (a) role grants following the Sprint 07 precedent, REVOKE ALL then GRANT SELECT, INSERT only to holocron_app (services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql:38-51); AND (b) a BEFORE UPDATE OR DELETE ... FOR EACH ROW trigger raising PONR_IMMUTABLE with ERRCODE 'P0001', because table grants cannot stop the table owner.
- **MUST** — MUST make the PONR latch resistant to filesystem tampering: the ONLY source of truth for 'has the PONR passed' is a SELECT against data_plane_ponr. Deleting, truncating, or rewriting any .tmp artifact (post-export write audit, data-plane config mirror, rollback/enable-writes reports) MUST NOT change the latch's answer. This is the explicit corrective to the fail-open loadPostExportWriteAudit behaviour at rollback-repoint.ts:181-211.
- **MUST** — MUST add POST_PONR_INELIGIBLE as a SEPARATE precondition in runRollbackRepoint, evaluated BEFORE the accepted-post-export-writes check at rollback-repoint.ts:565-597, so a post-PONR rollback reports POST_PONR_INELIGIBLE even when accepted_post_export_writes is 0.
- **MUST** — MUST embed a live Convex escape-hatch snapshot in the PONR row: convex_fence_audit_id, convex_fence_env_value, convex_documents_total, convex_newest_document_creation_time, convex_accepted_writes_since_watermark, convex_rejected_writes_since_watermark, export_watermark_ms.
- **MUST** — MUST FAIL CLOSED in cutover:enable-writes with CONVEX_ESCAPE_HATCH_DIVERGED when convex_accepted_writes_since_watermark != 0 OR convex_newest_document_creation_time > export_watermark_ms, and MUST NOT lift the fence or insert a PONR row in that case.
- **MUST** — MUST enforce the singleton property in the database: a unique index admitting at most one row (CREATE UNIQUE INDEX data_plane_ponr_singleton_uidx ON data_plane_ponr ((true))) plus a unique idempotency_key, so a concurrent second cutover:enable-writes cannot create a second PONR.
- **MUST** — MUST create the migration as services/platform/src/db/migrations/0030_data_plane_ponr.sql with --> statement-breakpoint separators AND add the matching entry to services/platform/src/db/migrations/meta/_journal.json (next idx after the 0029 entry, which is idx 15).
- **MUST** — MUST bind the PONR row to a real first production write driven through the real network surface (POST /api/documents on an already-listening serving base URL, resolved with resolveVerifyBaseUrl / HOLO_VERIFY_BASE_URL), and compute write_row_digest_sha256 from a Postgres re-SELECT of the committed row.
- **MUST** — MUST add POST_PONR_INELIGIBLE and PONR_LEDGER_UNREADABLE to the exit-code-2 fail-closed set in the cutover:rollback-repoint CLI case (services/platform/src/cli/holo.ts:3413-3424).
- **NEVER** — NEVER create the table at runtime; holo db:migrate is the sole bootstrap path (precedent stated in 0029_backup_heartbeat.sql:1-4).
- **NEVER** — NEVER implement immutability only in application code; an app-level throw must not be able to satisfy AC-2.
- **NEVER** — NEVER read, write, or fall back to a .tmp file, a JSON report, an env var, or a secrets key when deciding whether the PONR has passed; a filesystem-backed latch is exactly the weakness this task exists to remove.
- **NEVER** — NEVER reuse POST_EXPORT_WRITE_ACCEPTED for the PONR refusal, and never let the PONR refusal depend on the value of accepted_post_export_writes.
- **NEVER** — NEVER record a PONR with a synthetic or absent Convex snapshot; if the Convex audit functions cannot be reached, fail closed rather than writing nulls.
- **NEVER** — NEVER let cutover:enable-writes record a PONR without a real committed Postgres row: no synthetic row id, no request-body digest, no ok:true on a failed write.
- **NEVER** — NEVER silently skip the PONR check in runRollbackRepoint when the ledger query throws; that would reopen the closed escape hatch.
- **NEVER** — NEVER add Convex I/O to runRollbackRepoint; it has none today and the PONR latch does not require any.
- **STRICTLY** — STRICTLY keep cutover:enable-writes idempotent: a re-run performs no second production write, no second Convex snapshot, creates no second PONR row, exits 0, and reports already_recorded:true with the original ponr_id.
- **STRICTLY** — STRICTLY order the steps so a crash is recoverable and never leaves a half-open hatch: capture the Convex snapshot and evaluate divergence FIRST, then lift the durable fence, then drive the write, then record the PONR; on re-run detect the existing PONR first (SELECT before INSERT). The singleton index is the backstop, not the primary path.

## Acceptance Criteria

#### AC-1 (PRIMARY)

- **GIVEN** GIVEN fixture migrated_soak_stack, migration 0030 applied, the fence armed at '1', an empty data_plane_ponr, an undiverged frozen Convex deployment, and a pre-existing serving process already answering GET /health
- **WHEN** WHEN the operator runs bun services/platform/src/cli/holo.ts cutover:enable-writes --json
- **THEN** THEN the command exits 0 with ok:true, already_recorded:false, a ponr_id uuid, and write_row_id matching the id returned by a real HTTP 201 POST /api/documents; SELECT count(*) FROM data_plane_ponr is exactly 1; and the stored write_row_digest_sha256 equals a digest independently recomputed from the committed documents row by the test

`test_tier: integration` · `service: postgres` · `flow_ref: T-SYNC-014`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** db_query (capture required: True)
- **Case 0** — start_ref `migrated_soak_stack`
    - action: Run bun services/platform/src/cli/holo.ts db:migrate and assert data_plane_ponr appears in information_schema.tables
    - action: Start the pre-existing serving process and confirm GET /health returns 200 before any cutover verb
    - action: Run bun services/platform/src/cli/holo.ts cutover:enable-writes --json with HOLO_SECRETS_PATH=.tmp/D07-04/secrets.yaml and HOLO_VERIFY_BASE_URL=<live base URL>
    - action: SELECT id, write_table, write_row_id, write_row_digest_sha256, write_committed_at, fence_lifted_at FROM data_plane_ponr
    - action: SELECT the referenced documents row and recompute the digest in the test, then compare
    - MUST observe: exit_code == 0 AND ok == true
    - MUST observe: SELECT count(*) FROM data_plane_ponr == 1
    - MUST observe: write_table == 'documents'
    - MUST observe: SELECT count(*) FROM documents WHERE id = write_row_id == 1
    - MUST observe: write_row_digest_sha256 matches /^[0-9a-f]{64}$/ AND write_row_digest_sha256 == sha256(canonical form of the committed row SELECTed independently by the test)
    - MUST observe: write_surface == 'hono.POST /api/documents'
    - MUST observe: stdout.write_row_id == document.id returned in the HTTP 201 response body
    - MUST observe: (write_committed_at - fence_lifted_at) > 0 milliseconds
    - MUST NOT observe: SELECT count(*) FROM data_plane_ponr == 0
    - MUST NOT observe: SELECT count(*) FROM data_plane_ponr == 2
    - MUST NOT observe: SELECT count(*) FROM documents WHERE id = write_row_id == 0 (a fabricated row id)
    - MUST NOT observe: write_row_digest_sha256 == sha256(HTTP request body) instead of the committed row
    - MUST NOT observe: ok == true while the HTTP status != 201

</details>

#### AC-2

- **GIVEN** GIVEN fixture first_production_write, exactly one row in data_plane_ponr
- **WHEN** WHEN UPDATE and DELETE are attempted against that row on the least-privilege holocron_app connection and again on the owner/migration connection
- **THEN** THEN the app-role attempts raise SQLSTATE 42501 (insufficient_privilege), the owner attempts raise SQLSTATE P0001 with a message containing PONR_IMMUTABLE, and after all four attempts the row count is still exactly 1 with an unchanged write_row_digest_sha256

`test_tier: integration` · `service: postgres` · `flow_ref: T-SYNC-014`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-immutability.test.ts`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** db_query (capture required: True)
- **Case 0** — start_ref `first_production_write`
    - action: Capture the row's id and write_row_digest_sha256 on the owner connection
    - action: Open the app-role connection via toAppRoleDatabaseUrl(DEFAULT_DATABASE_URL) and assert SELECT current_user returns 'holocron_app'
    - action: Attempt UPDATE data_plane_ponr SET write_row_id = 'forged' and DELETE FROM data_plane_ponr as holocron_app; capture err.code
    - action: Attempt the same two statements on the owner/migration connection; capture err.code and err.message
    - action: Re-SELECT the row on the owner connection and compare digest
    - MUST observe: app-role UPDATE err.code == '42501'
    - MUST observe: app-role DELETE err.code == '42501'
    - MUST observe: owner UPDATE err.code == 'P0001' AND err.message contains 'PONR_IMMUTABLE'
    - MUST observe: owner DELETE err.code == 'P0001' AND err.message contains 'PONR_IMMUTABLE'
    - MUST observe: SELECT count(*) FROM data_plane_ponr == 1 after all 4 attempts
    - MUST observe: write_row_digest_sha256_after == write_row_digest_sha256_before (64-hex, byte-identical)
    - MUST observe: SELECT current_user == 'holocron_app' on the app-role connection
    - MUST NOT observe: any of the 4 statements reporting rowcount == 1
    - MUST NOT observe: err.code == null (a rejection with no SQLSTATE, thrown by application code)
    - MUST NOT observe: app_role_sqlstate == owner_sqlstate (only 1 enforcement layer present)
    - MUST NOT observe: write_row_digest_sha256 == 'forged'
    - MUST NOT observe: SELECT count(*) FROM data_plane_ponr == 0

</details>

#### AC-3

- **GIVEN** GIVEN fixture first_production_write, the PONR is recorded and the post-export write audit reports zero accepted writes
- **WHEN** WHEN the operator runs bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json
- **THEN** THEN the command exits 2, error.code === 'POST_PONR_INELIGIBLE' (not POST_EXPORT_WRITE_ACCEPTED), repointed === false, precondition.accepted_post_export_writes === 0 proving the refusal is independent of the write audit, and the durable secrets file contains no HOLO_DATA_PLANE: convex; while the pre-PONR path still refuses with POST_EXPORT_WRITE_ACCEPTED and acceptedCount 3 when 3 real post-export writes are seeded

`test_tier: integration` · `service: cli` · `flow_ref: T-SYNC-014`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** stdout (capture required: True)
- **Case 0** — start_ref `first_production_write`
    - action: Confirm SELECT count(*) FROM data_plane_ponr is 1 and the post-export audit lists zero accepted writes
    - action: Run bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json against the disposable secrets path
    - action: Parse stdout JSON, capture the exit code, and read the durable secrets with loadSecretsFile()
    - MUST observe: exit_code == 2
    - MUST observe: error.code == 'POST_PONR_INELIGIBLE'
    - MUST observe: repointed == false
    - MUST observe: precondition.accepted_post_export_writes == 0
    - MUST observe: error.message contains the literal ponr_id AND error.code == 'POST_PONR_INELIGIBLE' AND error.message contains 'restore'
    - MUST observe: SELECT count(*) FROM data_plane_ponr == 1 after the refused rollback
    - MUST NOT observe: error.code == 'POST_EXPORT_WRITE_ACCEPTED' for a post-PONR refusal
    - MUST NOT observe: repointed == true OR exit_code == 0
    - MUST NOT observe: grep -c 'HOLO_DATA_PLANE: convex' .tmp/D07-04/secrets.yaml > 0
    - MUST NOT observe: HOLO_ROLLBACK_TARGET == 'convex-frozen' in the durable secrets after the refusal
- **Case 1** — start_ref `three_real_post_export_writes_d0704`
    - action: With NO PONR row present, seed 3 real accepted post-export writes via POST /api/documents + writePostExportWriteAudit()
    - action: Run bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json
    - MUST observe: exit_code == 2
    - MUST observe: error.code == 'POST_EXPORT_WRITE_ACCEPTED'
    - MUST observe: precondition.accepted_post_export_writes == 3
    - MUST observe: SELECT count(*) FROM data_plane_ponr == 0, so the two latches are independent code paths
    - MUST NOT observe: error.code == 'POST_PONR_INELIGIBLE' while SELECT count(*) FROM data_plane_ponr == 0
    - MUST NOT observe: precondition.accepted_post_export_writes == 0
    - MUST NOT observe: exit_code == 0

</details>

#### AC-4

- **GIVEN** GIVEN fixture first_production_write, one PONR row and one first-write documents row already exist
- **WHEN** WHEN the operator re-runs bun services/platform/src/cli/holo.ts cutover:enable-writes --json
- **THEN** THEN the second run exits 0 with already_recorded:true and the SAME ponr_id, SELECT count(*) FROM data_plane_ponr is still exactly 1, and SELECT count(*) FROM documents is unchanged from the pre-rerun baseline; no second production write and no second Convex snapshot are manufactured

`test_tier: integration` · `service: postgres` · `flow_ref: T-SYNC-014`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'idempotent'`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** db_query (capture required: True)
- **Case 0** — start_ref `first_production_write`
    - action: Capture ponr_id and convex_fence_audit_id from the first run and SELECT count(*) FROM documents as the baseline
    - action: Re-run bun services/platform/src/cli/holo.ts cutover:enable-writes --json
    - action: Re-query both counts and compare the reported ponr_id and the stored convex_fence_audit_id
    - MUST observe: exit_code == 0 on the second run
    - MUST observe: already_recorded == true
    - MUST observe: ponr_id_run2 == ponr_id_run1 AND SELECT count(*) FROM data_plane_ponr == 1
    - MUST observe: SELECT count(*) FROM documents == baseline_count captured before the re-run
    - MUST observe: write_row_id_run2 == write_row_id_run1
    - MUST observe: convex_fence_audit_id_run2 == convex_fence_audit_id_run1
    - MUST NOT observe: SELECT count(*) FROM data_plane_ponr == 2
    - MUST NOT observe: ponr_id_run2 != ponr_id_run1
    - MUST NOT observe: SELECT count(*) FROM documents == baseline_count + 1
    - MUST NOT observe: an unhandled crash with SQLSTATE 23505 instead of already_recorded == true
    - MUST NOT observe: SELECT count(*) FROM data_plane_ponr == 0 (ledger emptied, the never-ran start state)

</details>

#### AC-5

- **GIVEN** GIVEN a soak in which the PONR ledger cannot be queried (DATABASE_URL points at an unreachable Postgres, or the data_plane_ponr relation is absent)
- **WHEN** WHEN the operator runs bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json
- **THEN** THEN the command exits 2 with error.code === 'PONR_LEDGER_UNREADABLE', repointed === false, and no HOLO_DATA_PLANE: convex is written; the escape hatch is never opened on an unverifiable ledger

`test_tier: integration` · `service: cli` · `flow_ref: UC-SYNC-04`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'fails closed'`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** stdout (capture required: True)
- **Case 0** — start_ref `migrated_soak_stack`
    - action: Point DATABASE_URL at a real-format but unreachable Postgres endpoint (closed ephemeral port on 127.0.0.1)
    - action: Run bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json with a valid watermark and zero accepted post-export writes
    - action: Parse stdout JSON, capture the exit code, and read the durable secrets file
    - MUST observe: exit_code == 2
    - MUST observe: error.code == 'PONR_LEDGER_UNREADABLE'
    - MUST observe: repointed == false
    - MUST observe: error.message contains the literal '127.0.0.1' host:port that could not be reached
    - MUST observe: grep -c 'HOLO_DATA_PLANE: convex' .tmp/D07-04/secrets.yaml == 0
    - MUST NOT observe: exit_code == 0
    - MUST NOT observe: repointed == true
    - MUST NOT observe: error.code == 'LIVE_ACK_MISSING' (PONR check skipped, execution reached the acknowledgement stage)
    - MUST NOT observe: an unreadable ledger treated as 0 PONR rows with the rollback proceeding
    - MUST NOT observe: HOLO_ROLLBACK_TARGET == 'convex-frozen' written to the durable secrets

</details>

#### AC-6

- **GIVEN** GIVEN fixture migrated_soak_stack, the fence is armed and POST /api/documents on the pre-existing serving process returns HTTP 423 with the migration_read_only body
- **WHEN** WHEN cutover:enable-writes --json completes and a fresh POST /api/documents is issued against the SAME pre-existing serving process
- **THEN** THEN the durable secrets HOLO_MIGRATION_READ_ONLY reads '0', the new POST returns HTTP 201 with a document id that resolves to a real documents row, and the pre-armed 423 behaviour is observed before the verb and absent after it

`test_tier: integration` · `service: hono` · `flow_ref: T-SYNC-014`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'lifts the fence'`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** api_response (capture required: True)
- **Case 0** — start_ref `migrated_soak_stack`
    - action: With the fence armed, POST a document to <baseUrl>/api/documents and record the status and body
    - action: Run bun services/platform/src/cli/holo.ts cutover:enable-writes --json
    - action: POST another document to the SAME <baseUrl>/api/documents on the SAME pid and record the status and body
    - action: Read HOLO_MIGRATION_READ_ONLY from the disposable secrets with loadSecretsFile()
    - MUST observe: pre-verb POST /api/documents HTTP status == 423
    - MUST observe: pre-verb response body == {"error":"migration_read_only","code":"migration_read_only"}
    - MUST observe: post-verb POST /api/documents HTTP status == 201
    - MUST observe: SELECT count(*) FROM documents WHERE id = post_verb_document_id == 1
    - MUST observe: loadSecretsFile('.tmp/D07-04/secrets.yaml')['HOLO_MIGRATION_READ_ONLY'] == '0'
    - MUST observe: post_verb_serving_pid == pre_verb_serving_pid
    - MUST NOT observe: post-verb HTTP status == 423
    - MUST NOT observe: pre-verb HTTP status == 201 (the fence was never armed)
    - MUST NOT observe: HOLO_MIGRATION_READ_ONLY == '1' after the verb
    - MUST NOT observe: SELECT count(*) FROM documents WHERE id = post_verb_document_id == 0
    - MUST NOT observe: post_verb_serving_pid != pre_verb_serving_pid (a newly spawned process answered)

</details>

#### AC-7

- **GIVEN** GIVEN fixture first_production_write, a PONR row exists in Postgres, and an operator or cleanup job deletes the post-export write audit, the data-plane config mirror, the rollback-repoint report, and the enable-writes report from .tmp/
- **WHEN** WHEN bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json is run after those deletions, and again after the audit file is rewritten with accepted_writes: []
- **THEN** THEN BOTH runs still exit 2 with error.code === 'POST_PONR_INELIGIBLE' and repointed === false, whereas the contrasting pre-PONR case shows the existing POST_EXPORT_WRITE_ACCEPTED latch falling open when its .tmp audit file is deleted (loadPostExportWriteAudit, rollback-repoint.ts:181-211), proving the PONR latch is strictly stronger

`test_tier: integration` · `service: cli` · `flow_ref: T-SYNC-014`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'survives tmp deletion'`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** stdout (capture required: True)
- **Case 0** — start_ref `first_production_write`
    - action: Confirm SELECT count(*) FROM data_plane_ponr is 1
    - action: Delete the post-export write audit, the data-plane config mirror, the rollback-repoint report, and the enable-writes report under .tmp/
    - action: Run bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json and capture the exit code + JSON
    - action: Rewrite the audit file with {export_watermark_ms: T_export, accepted_writes: []} and run the command again
    - action: Re-query SELECT count(*) FROM data_plane_ponr
    - MUST observe: post-deletion run exit_code == 2 AND error.code == 'POST_PONR_INELIGIBLE'
    - MUST observe: post-rewrite run exit_code == 2 AND error.code == 'POST_PONR_INELIGIBLE'
    - MUST observe: repointed == false on both runs
    - MUST observe: SELECT count(*) FROM data_plane_ponr == 1 after both runs
    - MUST observe: grep -c 'HOLO_DATA_PLANE: convex' .tmp/D07-04/secrets.yaml == 0 after both runs
    - MUST observe: contrast case recorded: with SELECT count(*) FROM data_plane_ponr == 0 and the audit file deleted, error.code != 'POST_EXPORT_WRITE_ACCEPTED'
    - MUST NOT observe: either run exit_code == 0
    - MUST NOT observe: repointed == true
    - MUST NOT observe: error.code == 'EXPORT_WATERMARK_MISSING' masking the PONR latch
    - MUST NOT observe: SELECT count(*) FROM data_plane_ponr == 0 after the .tmp deletions
    - MUST NOT observe: ponr.ts reading a .tmp path, a report JSON, an env var, or a secrets key to answer 'has the PONR passed'

</details>

#### AC-8

- **GIVEN** GIVEN fixture migrated_soak_stack with an undiverged frozen Convex deployment, and separately fixture diverged_convex in which Convex has already accepted writes after the export watermark
- **WHEN** WHEN bun services/platform/src/cli/holo.ts cutover:enable-writes --json is run against each
- **THEN** THEN against the undiverged deployment the recorded PONR row carries a non-null convex_fence_audit_id matching the live latest fence-armed audit id, convex_documents_total > 0, convex_accepted_writes_since_watermark === 0, and convex_newest_document_creation_time <= export_watermark_ms; and against the diverged deployment the command exits 2 with error.code === 'CONVEX_ESCAPE_HATCH_DIVERGED', writes NO PONR row, and leaves HOLO_MIGRATION_READ_ONLY at '1'

`test_tier: integration` · `service: convex` · `flow_ref: T-SYNC-014`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'convex snapshot'`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** db_query (capture required: True)
- **Case 0** — start_ref `migrated_soak_stack`
    - action: Query the live Convex deployment directly in the test for the latest fence-armed audit id and the documents total
    - action: Run bun services/platform/src/cli/holo.ts cutover:enable-writes --json
    - action: SELECT convex_fence_audit_id, convex_fence_env_value, convex_documents_total, convex_newest_document_creation_time, convex_accepted_writes_since_watermark, convex_rejected_writes_since_watermark, export_watermark_ms FROM data_plane_ponr
    - action: Compare each stored value against the value the test read directly from Convex
    - MUST observe: convex_fence_audit_id == the _id read live from api.migrationFence.audit.latestFenceArmed, matching /^[a-z0-9]{32}$/
    - MUST observe: convex_fence_env_value == the live armed fence value AND len(convex_fence_env_value) > 0
    - MUST observe: convex_documents_total > 0 AND convex_documents_total == the count read live from Convex by the test
    - MUST observe: convex_accepted_writes_since_watermark == 0
    - MUST observe: convex_rejected_writes_since_watermark >= 0 (integer)
    - MUST observe: (export_watermark_ms - convex_newest_document_creation_time) >= 0
    - MUST observe: export_watermark_ms == watermarkAtMs in the watermark report
    - MUST NOT observe: convex_fence_audit_id == null OR convex_fence_env_value == '' OR convex_documents_total == 0
    - MUST NOT observe: convex_documents_total == 0 while the live deployment holds documents
    - MUST NOT observe: the snapshot read from a cached .tmp artifact instead of the live deployment
    - MUST NOT observe: SELECT count(*) FROM data_plane_ponr == 1 with convex_fence_audit_id == null
- **Case 1** — start_ref `diverged_convex`
    - action: Confirm directly against Convex that accepted writes since the watermark is >= 1 and the newest _creationTime exceeds export_watermark_ms
    - action: Run bun services/platform/src/cli/holo.ts cutover:enable-writes --json
    - action: Parse stdout JSON, capture the exit code, query SELECT count(*) FROM data_plane_ponr, and read HOLO_MIGRATION_READ_ONLY from the disposable secrets
    - MUST observe: exit_code == 2
    - MUST observe: error.code == 'CONVEX_ESCAPE_HATCH_DIVERGED'
    - MUST observe: error.message contains convex_accepted_writes_since_watermark >= 1 AND contains convex_newest_document_creation_time AND contains export_watermark_ms
    - MUST observe: SELECT count(*) FROM data_plane_ponr == 0
    - MUST observe: loadSecretsFile('.tmp/D07-04/secrets.yaml')['HOLO_MIGRATION_READ_ONLY'] == '1'
    - MUST NOT observe: exit_code == 0 OR ok == true
    - MUST NOT observe: SELECT count(*) FROM data_plane_ponr == 1 with convex_accepted_writes_since_watermark >= 1
    - MUST NOT observe: HOLO_MIGRATION_READ_ONLY == '0' (fence lifted before the divergence check ran)
    - MUST NOT observe: the divergence downgraded to a warning with exit_code == 0

</details>

## Test Criteria

| ID | Boolean statement | Maps to | Verify |
|----|-------------------|---------|--------|
| TC-1 | data_plane_ponr appears in information_schema.tables after holo db:migrate. | AC-1 | `bun services/platform/src/cli/holo.ts db:migrate && psql "$DATABASE_URL" -c "select 1 from information_schema.tables where table_name='data_plane_ponr'"` |
| TC-2 | cutover:enable-writes --json exits 0 on a stack with no existing PONR row. | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts` |
| TC-3 | The stored write_row_digest_sha256 equals the digest recomputed by the test from the committed documents row. | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts` |
| TC-4 | write_row_id resolves to exactly one row in the documents table. | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts` |
| TC-5 | UPDATE data_plane_ponr as holocron_app raises SQLSTATE 42501. | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-immutability.test.ts` |
| TC-6 | DELETE FROM data_plane_ponr on the owner connection raises SQLSTATE P0001 with a PONR_IMMUTABLE message. | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-immutability.test.ts` |
| TC-7 | The PONR row count is exactly 1 after four rejected DML attempts. | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-immutability.test.ts` |
| TC-8 | A second INSERT into data_plane_ponr raises a unique-violation SQLSTATE 23505. | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-immutability.test.ts` |
| TC-9 | cutover:rollback-repoint --json exits 2 with POST_PONR_INELIGIBLE when a PONR row exists. | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts` |
| TC-10 | cutover:rollback-repoint --json reports precondition.accepted_post_export_writes equal to 0 in the POST_PONR_INELIGIBLE refusal. | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts` |
| TC-11 | cutover:rollback-repoint --json exits 2 with POST_EXPORT_WRITE_ACCEPTED and acceptedCount 3 when 3 real post-export writes exist and no PONR row exists. | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts -t 'three accepted post-export writes'` |
| TC-12 | The durable secrets file contains no HOLO_DATA_PLANE value of convex after a post-PONR refusal. | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts` |
| TC-13 | The second cutover:enable-writes --json run reports already_recorded true. | AC-4 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'idempotent'` |
| TC-14 | The documents row count is unchanged across a cutover:enable-writes re-run. | AC-4 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'idempotent'` |
| TC-15 | convex_fence_audit_id is unchanged across a cutover:enable-writes re-run. | AC-4 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'idempotent'` |
| TC-16 | cutover:rollback-repoint --json exits 2 with PONR_LEDGER_UNREADABLE when DATABASE_URL is unreachable. | AC-5 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'fails closed'` |
| TC-17 | POST /api/documents returns HTTP 423 on the pre-existing serving process before cutover:enable-writes runs. | AC-6 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'lifts the fence'` |
| TC-18 | POST /api/documents returns HTTP 201 on the same pre-existing serving pid after cutover:enable-writes runs. | AC-6 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'lifts the fence'` |
| TC-19 | HOLO_MIGRATION_READ_ONLY reads '0' in the durable secrets file after cutover:enable-writes. | AC-6 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'lifts the fence'` |
| TC-20 | cutover:rollback-repoint --json exits 2 with POST_PONR_INELIGIBLE after every .tmp cutover artifact is deleted. | AC-7 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'survives tmp deletion'` |
| TC-21 | cutover:rollback-repoint --json exits 2 with POST_PONR_INELIGIBLE after the post-export write audit is rewritten to zero accepted writes. | AC-7 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'survives tmp deletion'` |
| TC-22 | services/platform/src/cutover/ponr.ts contains no .tmp path reference in the latch read path. | AC-7 | `grep -n '\.tmp' services/platform/src/cutover/ponr.ts` |
| TC-23 | convex_fence_audit_id on the recorded PONR row equals the audit id read directly from the live Convex deployment. | AC-8 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'convex snapshot'` |
| TC-24 | convex_documents_total on the recorded PONR row is strictly greater than 0. | AC-8 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'convex snapshot'` |
| TC-25 | cutover:enable-writes --json exits 2 with CONVEX_ESCAPE_HATCH_DIVERGED when Convex accepted writes since the watermark is at least 1. | AC-8 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'convex snapshot'` |
| TC-26 | data_plane_ponr contains 0 rows after a CONVEX_ESCAPE_HATCH_DIVERGED refusal. | AC-8 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'convex snapshot'` |
| TC-27 | HOLO_MIGRATION_READ_ONLY reads '1' after a CONVEX_ESCAPE_HATCH_DIVERGED refusal. | AC-8 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'convex snapshot'` |
| TC-28 | services/platform/src/db/migrations/meta/_journal.json contains an entry tagged 0030_data_plane_ponr. | AC-1 | `grep -n '0030_data_plane_ponr' services/platform/src/db/migrations/meta/_journal.json` |

## Fixtures (shared seed data)

- **`migrated_soak_stack`** — Migrated real Postgres (including migration 0030) plus a pre-existing Hono serving process listening on an ephemeral 127.0.0.1 port that re-reads the durable secrets control plane per request, a disposable secrets file holding HOLO_MIGRATION_READ_ONLY='1', an export watermark report on disk, and a reachable frozen Convex deployment whose fence is armed.  
  seed_method: `cli`
    - schema applied by bun services/platform/src/cli/holo.ts db:migrate; data_plane_ponr present in information_schema.tables
    - roles holocron_app + holocron_owner present (created by migration 0004, re-asserted idempotently)
    - process: real bun child serving GET /health and POST /api/documents on a free 127.0.0.1 port, started BEFORE any cutover verb runs
    - file: .tmp/D07-04/secrets.yaml with HOLO_MIGRATION_READ_ONLY: '1'
    - file: watermark report with a concrete watermarkAtMs consumed by loadExportWatermarkMs()
    - convex: frozen deployment reachable, fence armed, latest fence-armed audit row queryable
- **`first_production_write`** — The first accepted Postgres production write, its live Convex escape-hatch snapshot, and the PONR record, all created by the real operator verb.  
  seed_method: `cli`
    - 1 documents row created by cutover:enable-writes via HTTP 201 POST /api/documents on the live base URL
    - 1 data_plane_ponr row bound to that documents row: write_table='documents', write_row_id=<real uuid>, write_row_digest_sha256=<64-hex recomputed from the committed row>
    - convex_* columns on that row populated from the live Convex deployment at record time: convex_fence_audit_id, convex_fence_env_value, convex_documents_total, convex_newest_document_creation_time, convex_accepted_writes_since_watermark=0, convex_rejected_writes_since_watermark>=0, export_watermark_ms
    - durable secrets: HOLO_MIGRATION_READ_ONLY flipped from '1' to '0'
- **`three_real_post_export_writes_d0704`** — Exactly 3 real accepted post-export production writes, used to prove the pre-existing POST_EXPORT_WRITE_ACCEPTED latch still works and is a distinct code path from the new PONR latch.  
  seed_method: `public_api`
    - 3 documents rows created by 3 x HTTP 201 POST /api/documents with the fence lifted
    - post-export write audit written via writePostExportWriteAudit() with the 3 real ids and their Postgres-read commit timestamps
- **`diverged_convex`** — A frozen Convex deployment that has ALREADY drifted past the export watermark, proving the escape hatch was not intact.  
  seed_method: `recorded_external`
    - convex: at least 1 accepted write recorded after the export watermark, so countAttemptsInWindow reports accepted_writes_since_watermark >= 1
    - convex: newest document _creationTime strictly greater than export_watermark_ms
    - postgres: data_plane_ponr still empty (0 rows) at the start of the case

## Reading List

- `services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql` — lines 1-75 — THE ledger-immutability precedent to reuse: role creation guard, REVOKE ALL FROM PUBLIC, REVOKE ALL FROM holocron_app, GRANT SELECT+INSERT only, owner re-grant DO block, partial unique index for idempotent replay. Copy this structure for data_plane_ponr.
- `services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql` — lines 196-235 — How function ownership and EXECUTE grants are set. The BEFORE UPDATE OR DELETE trigger function needs the same REVOKE-from-PUBLIC / explicit-GRANT treatment.
- `services/platform/src/db/migrations/0025_deterministic_human_gate.sql` — lines 25-50 — In-repo precedent for RAISE EXCEPTION '<CODE>: message' USING ERRCODE = 'P0001' inside a trigger/constraint function, the exact idiom for PONR_IMMUTABLE.
- `services/platform/src/db/migrations/0029_backup_heartbeat.sql` — lines 1-50 — House style for the newest migration: header comment naming the capability and task, --> statement-breakpoint separators, idempotent DO blocks, and the explicit rule that runtime CREATE TABLE paths are prohibited.
- `services/platform/src/db/migrations/meta/_journal.json` — lines tail 25 lines — Journal format. The 0029 entry is idx 15, so add the 0030_data_plane_ponr entry with the next idx and a when value greater than 1784105000000.
- `services/platform/src/db/schema/backup.ts` — lines 1-45 — Drizzle table pattern (pgTable, timestamptz column helper, check() constraints, $inferSelect/$inferInsert exports). Mirror this for the new data_plane_ponr table definition.
- `services/platform/src/db/evidence/roles.ts` — lines 1-30 — HOLOCRON_APP_ROLE ('holocron_app') and toAppRoleDatabaseUrl, needed so the immutability AC can connect as the least-privilege role.
- `services/platform/src/cutover/rollback-repoint.ts` — lines 39-46 — Existing error-code constants. Add POST_PONR_INELIGIBLE and PONR_LEDGER_UNREADABLE here, distinct from POST_EXPORT_WRITE_ACCEPTED.
- `services/platform/src/cutover/rollback-repoint.ts` — lines 181-211 — CRITICAL. loadPostExportWriteAudit is FAIL-OPEN: when the audit file is absent it synthesizes {accepted_writes: []} from the watermark, so the existing POST_EXPORT_WRITE_ACCEPTED latch can be defeated by deleting a .tmp file. The PONR latch must NOT follow this pattern; it reads Postgres only, and AC-7 proves it.
- `services/platform/src/cutover/rollback-repoint.ts` — lines 565-597 — The ONLY current refusal precondition: accepted > 0 -> POST_EXPORT_WRITE_ACCEPTED. The PONR check is a SEPARATE branch inserted BEFORE this one, with its own code, firing even when accepted is 0.
- `services/platform/src/cutover/rollback-repoint.ts` — lines 85-114 — RollbackRepointReport type. Extend precondition with the PONR fields (ponr_recorded, ponr_id, ponr_recorded_at) so the refusal report is self-describing.
- `services/platform/src/cutover/convex-fence-client.ts` — lines 1-120 — The existing real-Convex client used for freeze/drain/quiet-check. Reuse its deployment resolution and auth path for the PONR escape-hatch snapshot. VERIFY the exact function paths api.migrationFence.audit.latestFenceArmed and api.migrationFence.audit.countAttemptsInWindow against the convex/ source before wiring; if either is absent, fail closed rather than writing null snapshot columns.
- `services/platform/src/cutover/export-watermark.ts` — lines 1-120 — captureExportWatermark and defaultWatermarkReportPath. export_watermark_ms on the PONR row must come from the same watermark the divergence check compares against.
- `services/platform/src/cutover/soak-fence.ts` — lines 112-136 — setMigrationReadOnlyEnv and writeDurableMigrationReadOnly, the exact call to lift the fence to '0' in the durable control plane.
- `services/platform/src/cutover/soak-fence.ts` — lines 902-1000 — runCutoverFlip: the report shape, durable-write-then-confirm-by-re-read, and fail-closed error-code discipline that cutover:enable-writes must mirror as the reciprocal verb.
- `services/platform/src/cutover/soak-fence.ts` — lines 1279-1300 — resolveVerifyBaseUrl, how to resolve the already-listening serving base URL (HOLO_VERIFY_BASE_URL / HOLO_SOAK_BASE_URL / PLATFORM_URL) for the real production write.
- `services/platform/src/http/health.ts` — lines 260-300 — resolveObservedDataPlane() at :267 echoed into the /health body at :293-297, the ONLY consumer of HOLO_DATA_PLANE in services/platform/src. Confirms the re-point has no Convex-side effect; do not add one to runRollbackRepoint.
- `services/platform/src/cli/holo.ts` — lines 3346-3383 — The cutover:flip case, the template for registering cutover:enable-writes: lazy import, --json/--output handling, exit-code mapping.
- `services/platform/src/cli/holo.ts` — lines 3384-3436 — The cutover:rollback-repoint case. Add POST_PONR_INELIGIBLE and PONR_LEDGER_UNREADABLE to the exit-2 set at lines 3413-3424.
- `services/platform/src/cli/holo.ts` — lines 324-357 — The cutover help block. Register the cutover:enable-writes help line alongside cutover:flip and cutover:rollback-repoint.
- `services/platform/src/http/hono-app.ts` — lines 350-378 — POST /api/documents, the real production write path the PONR binds to, and the RETURNING clause that yields the row id.
- `services/platform/src/http/hono-app.ts` — lines 190-195 — createSoakFenceMiddleware mounted on '*', the 423 the fence produces and that enable-writes must lift.
- `tests/integration/service/immutability-dml-rejected.test.ts` — lines 1-95 — The DB-level DML-rejection test shape D07-01 reuses against data_plane_ponr. Read it so the grants and trigger produce the SQLSTATEs it asserts.
- `.spec/prds/mk6-migration/08-uc-sync.md` — lines 56-64 — UC-SYNC-04 AC-3 verbatim: the PONR is the first accepted Postgres production write; Convex deletion is a separate later step.
- `.spec/prds/mk6-migration/08-uc-sync.md` — lines 67-75 — UC-SYNC-05, what the PONR gates: Convex deletion requires a later recovery-evidence drill, not the PONR alone.
- `.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md` — lines 22-31 — CAP-CUT-01 idempotency clause: write enablement records the data-plane point of no return; deletion is a separate irreversible source-destruction action.

## Guardrails

**WRITE-ALLOWED**

- `services/platform/src/db/migrations/0030_data_plane_ponr.sql (NEW)`
- `services/platform/src/db/migrations/meta/_journal.json (MODIFY, append the 0030 entry only)`
- `services/platform/src/db/schema/cutover.ts (NEW, data_plane_ponr drizzle table)`
- `services/platform/src/db/schema/index.ts (MODIFY, re-export the new table only)`
- `services/platform/src/cutover/ponr.ts (NEW, readDataPlanePonr / captureConvexEscapeHatchSnapshot / recordDataPlanePonr / runEnableWrites)`
- `services/platform/src/cutover/rollback-repoint.ts (MODIFY, add POST_PONR_INELIGIBLE + PONR_LEDGER_UNREADABLE constants and the separate pre-check)`
- `services/platform/src/cli/holo.ts (MODIFY, register cutover:enable-writes, extend the rollback-repoint exit-2 set, add help lines)`

**WRITE-PROHIBITED**

- services/platform/src/db/migrations/0001_*.sql through 0029_*.sql - applied migrations are immutable history; changes go in 0030
- services/platform/src/cutover/soak-fence.ts - the fence semantics are Sprint 29 evidence; enable-writes calls writeDurableMigrationReadOnly, it does not redefine the fence
- services/platform/src/cutover/convex-fence-client.ts - consume it read-only for the snapshot; changing freeze/drain semantics is out of scope
- services/platform/src/http/health.ts - the /health data_plane echo is Sprint 29 evidence and is read-only here
- services/platform/tests/integration/sprint30-*.test.ts - D07-01 owns these oracles; editing them to fit the implementation inverts the TDD contract
- services/platform/tests/integration/sprint29-*.test.ts - frozen Sprint 29 evidence
- services/platform/src/http/hono-app.ts - the production write path must not be modified to make the PONR easier to record
- convex/** - the frozen Convex deployment is read-only for this sprint
- .spec/** - PRD and task specs are upstream and read-only for this task

## Code Pattern / Design

- **Reference:** UC-SYNC-04 AC-3, the data-plane PONR is the first accepted Postgres production write
- **Reference:** CAP-CUT-01 idempotency, write enablement records the PONR; deletion is a separate irreversible action
- **Reference:** T-SYNC-014 human-gate row, first accepted Postgres production write records data-plane PONR
- **Pattern:** Append-only singleton Postgres ledger with dual-layer DB enforcement (role grants plus BEFORE UPDATE OR DELETE trigger) and a DB-invariant divergence CHECK, read as the sole source of truth for an irreversible latch, fronted by a fail-closed CLI verb that snapshots the live Convex escape hatch, writes the durable control plane, drives a real production write, and content-binds the ledger row to the committed Postgres row.
- **Pattern source:** `services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql:38-75 (grants plus idempotency index) and :196-235 (function ownership/grants); services/platform/src/db/migrations/0025_deterministic_human_gate.sql:25-50 (RAISE EXCEPTION ... USING ERRCODE = 'P0001'); services/platform/src/cutover/soak-fence.ts:902-1000 (runCutoverFlip durable-write-then-confirm plus fail-closed report shape)`
- **Anti-pattern:** Relying on grants alone (the table owner keeps DML and AC-2's owner case fails); enforcing immutability in TypeScript; mirroring the fail-open file-read pattern of loadPostExportWriteAudit (rollback-repoint.ts:181-211) so the latch can be defeated by rm; making the PONR refusal conditional on accepted_post_export_writes; recording the PONR from a request body or a synthetic uuid instead of a committed row; writing null or placeholder convex_* columns when the deployment is unreachable; capturing the Convex snapshot AFTER lifting the fence; treating a ledger query error as 'no PONR' and letting the rollback proceed; reusing POST_EXPORT_WRITE_ACCEPTED for the PONR refusal; creating the table via runtime DDL instead of holo db:migrate.
- Proposed table data_plane_ponr columns: id uuid PK default gen_random_uuid(); recorded_at timestamptz NOT NULL default now(); fence_lifted_at timestamptz NOT NULL; write_surface text NOT NULL; write_table text NOT NULL; write_row_id text NOT NULL; write_row_digest_sha256 text NOT NULL CHECK (write_row_digest_sha256 ~ '^[0-9a-f]{64}$'); write_committed_at timestamptz NOT NULL; base_url text NOT NULL; operator text NOT NULL; run_id text NOT NULL; idempotency_key text NOT NULL; export_watermark_ms bigint NOT NULL; convex_fence_audit_id text NOT NULL; convex_fence_env_value text NOT NULL; convex_documents_total bigint NOT NULL; convex_newest_document_creation_time bigint NOT NULL; convex_accepted_writes_since_watermark bigint NOT NULL CHECK (convex_accepted_writes_since_watermark = 0); convex_rejected_writes_since_watermark bigint NOT NULL.
- The CHECK on convex_accepted_writes_since_watermark = 0 makes the divergence rule a DATABASE invariant, not only an app-level guard: a PONR row can never exist alongside a record of Convex having accepted post-watermark writes.
- Singleton enforcement: CREATE UNIQUE INDEX data_plane_ponr_singleton_uidx ON data_plane_ponr ((true)), at most one row can ever exist, plus CREATE UNIQUE INDEX data_plane_ponr_idempotency_key_uidx ON data_plane_ponr (idempotency_key) for safe replay (the 0004 idempotency-index precedent).
- Immutability layer 1 (grants, 0004 precedent): REVOKE ALL ON TABLE data_plane_ponr FROM PUBLIC; REVOKE ALL FROM holocron_app; GRANT SELECT, INSERT TO holocron_app. Do NOT grant UPDATE/DELETE to holocron_owner; unlike beliefs there is no revision path.
- Immutability layer 2 (trigger, required because grants cannot bind the table owner): CREATE FUNCTION reject_data_plane_ponr_mutation() RETURNS trigger ... RAISE EXCEPTION 'PONR_IMMUTABLE: data_plane_ponr is append-only (UC-SYNC-04 point of no return)' USING ERRCODE = 'P0001', fired BEFORE UPDATE OR DELETE ON data_plane_ponr FOR EACH ROW.
- Latch source of truth: readDataPlanePonr() performs a single SELECT id, recorded_at, write_row_id FROM data_plane_ponr LIMIT 1 and returns row | null | throw. It touches no filesystem path whatsoever; that is what makes it strictly stronger than loadPostExportWriteAudit's fail-open file read.
- Proposed verb name cutover:enable-writes, chosen for the existing cutover:* family and as the natural reciprocal of cutover:flip (which arms the fence). Flags: --json, --output <path>, --base-url <url>, --operator <name>.
- Verb sequence (order matters for crash-safety): (1) SELECT existing PONR; if present return already_recorded:true with the stored ponr_id and perform NO write and NO Convex call; (2) load export_watermark_ms; (3) capture the LIVE Convex escape-hatch snapshot and evaluate divergence, refusing with CONVEX_ESCAPE_HATCH_DIVERGED before anything mutates; (4) resolve the already-listening base URL and prove GET /health responds; (5) writeDurableMigrationReadOnly('0') and re-read to confirm; (6) POST /api/documents against the live base URL, require HTTP 201; (7) SELECT the committed row and compute sha256 over its canonical serialization; (8) INSERT the PONR row with the write binding and the Convex snapshot; (9) write a JSON report under .tmp/D07-04/ as an operator audit mirror only, never as latch input.
- Latch placement in runRollbackRepoint: query the ledger FIRST, before the watermark and accepted-writes checks at rollback-repoint.ts:565-597, so a post-PONR rollback always reports POST_PONR_INELIGIBLE rather than a weaker upstream code. On query failure return PONR_LEDGER_UNREADABLE.

## Verification Gates

| Gate | Command | Expected |
|------|---------|----------|
| Lint | `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/ponr.ts services/platform/src/cutover/rollback-repoint.ts services/platform/src/db/schema/cutover.ts services/platform/src/db/schema/index.ts services/platform/src/cli/holo.ts` | Exit 0 |
| Typecheck | `pnpm tsgo --noEmit` | Exit 0 |
| Migration applies | `bun services/platform/src/cli/holo.ts db:migrate` | Exit 0 |
| Journal entry present | `grep -n '0030_data_plane_ponr' services/platform/src/db/migrations/meta/_journal.json` | Exit 0 |
| PONR latch, idempotency, fence-lift, tmp-resistance, convex snapshot (D07-01 oracles green) | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts` | Exit 0 |
| DB-level immutability (D07-01 oracle green) | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-immutability.test.ts` | Exit 0 |
| Zero-loss oracle still green (no regression to the POST_EXPORT_WRITE_ACCEPTED latch) | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts` | Exit 0 |
| Latch reads no filesystem path | `grep -n '\.tmp' services/platform/src/cutover/ponr.ts` | Exit 1 (no matches in the latch read path) |
| Sprint 29 cutover evidence not regressed | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-rollback-repoint.test.ts services/platform/tests/integration/sprint29-soak-flip.test.ts` | Exit 0 |
| Unit lane | `pnpm test:unit` | Exit 0 |
| No runtime DDL | `grep -rn 'CREATE TABLE' services/platform/src/cutover/ponr.ts` | Exit 1 (no matches) |

## Agent Assignment

- **Agent:** `devops-engineer`
- **Rationale:** This is cutover control-plane work: a schema migration with role-grant + trigger enforcement, a new operator CLI verb in the cutover:* family, a live Convex escape-hatch snapshot, and a fail-closed latch in the rollback mechanism. devops-engineer owns the cutover surface (it built D06-05 flip/rollback in Sprint 29) and the migration/control-plane discipline this requires.

## Coding Standards

- TypeScript strict; export explicit types for the PONR row, the Convex escape-hatch snapshot, and the enable-writes report, mirroring the RollbackRepointReport/FlipReport style in the cutover module.
- Every new fail-closed path writes a JSON report to disk before returning, matching the baseFail(...) plus writeFileSync pattern already used in rollback-repoint.ts; reports are audit mirrors, never latch inputs.
- SQL in the migration uses --> statement-breakpoint between statements and idempotent guards (IF NOT EXISTS / DO blocks) so re-running db:migrate is safe.
- The trigger function is SECURITY INVOKER (the default); it must fire for every role including the owner, so do not mark it SECURITY DEFINER.
- No any; parameterize every SQL value through the postgres template tag and never string-concatenate the row id, digest, or Convex audit id.
- Keep the CLI case thin: a lazy await import('../cutover/ponr.ts'), flag parsing, JSON/text output, and exit-code mapping; all logic lives in ponr.ts.

## Dependencies

- **Depends on:** D07-01
- **Blocks:** D07-05

## Cross-Specialist Enrichments

### From `convex-planner`

- The PONR record must be Convex-side falsifiable later, not just Postgres-side. At the instant the first Postgres production write is accepted, the PONR ledger row MUST embed a Convex state snapshot so a future auditor can prove the frozen deployment was intact and un-diverged when rollback eligibility closed. Without it, a post-PONR auditor cannot distinguish 'we closed rollback while Convex was healthy' from 'we closed rollback because Convex had already silently diverged'.
- REQUIRED CONVEX FIELDS IN THE PONR RECORD, every one from a real existing surface: convex_deployment_url (convexUrl(), convex-fence-client.ts:237-248); convex_fence_env_value (getMigrationReadOnlyEnv() literal, must be '1'|'true', convex-fence-client.ts:280-298); convex_fence_armed_at_ms and convex_fence_audit_id (api.migrationFence.audit.latestFenceArmed -> fenceArmedAtMs, _id, audit.ts:50-67); convex_drain_completed_at_ms and convex_drain_surfaces (api.migrationFence.drain.latestDrain, drain.ts:570-604); convex_documents_total (api.documents.queries.count, documents/queries.ts:78-87); convex_newest_document_creation_time and convex_newest_document_id (api.documents.queries.list({limit:1}), documents/queries.ts:36-72); convex_accepted_writes_since_watermark and convex_rejected_writes_since_watermark (api.migrationFence.audit.countAttemptsInWindow({sinceMs: watermarkAtMs}), audit.ts:70-96); export_watermark_ms (loadExportWatermarkMs(), rollback-repoint.ts:150-174).
- The PONR record MUST be written only if the Convex snapshot is un-diverged at that instant: convex_accepted_writes_since_watermark===0 AND convex_newest_document_creation_time <= export_watermark_ms. If Convex has already diverged, the honest outcome is a LOUD failure — closing rollback on top of an already-diverged escape hatch means the rollback window was never real and the sprint gate was never met. Fail closed; do not record a PONR with a divergence flag and continue.
- IMMUTABILITY BOUNDARY. The existing latch is weaker and lives elsewhere: runRollbackRepoint currently refuses only on accepted post-export writes (rollback-repoint.ts:591 message text references 'point of no return / UC-SYNC-04' but enforcement is countAcceptedPostExportWrites over a mutable .tmp JSON, rollback-repoint.ts:216-221). The PONR must NOT be a .tmp artifact for the same reason .tmp/D06-05/data-plane-config.json is explicitly documented as a non-authoritative audit mirror (rollback-repoint.ts:120-127) — it is git-tracked, operator-writable, and currently shows as modified in the working tree. The PONR ledger must be a Postgres table under services/platform/src/db/migrations/0030_*.sql with insert-only semantics enforced at the database level.
- The Convex side contributes NOTHING to PONR immutability — every Convex mutation on the frozen deployment is either fenced or one of the five unfenced migrationFence mutations, none suitable as an immutable ledger. Do not plan a Convex-side PONR row; migrationFenceAudit (convex/schema.ts:1521-1536) has no immutability guarantee and its writers recordFenceArmed/recordWriteAttempt (audit.ts:12-47) are open public mutations.
- Once the PONR is recorded, the Convex deployment stays live-but-irrelevant until UC-SYNC-05 (08-uc-sync.md:67-76) — deletion requires a fresh isolated Postgres/blob restore drill. The PONR record should carry an explicit convex_deployment_deleted: false assertion (the field name already exists in the rollback report shape at rollback-repoint.ts:673) so the deletion gate has a starting anchor.

**References:**

- `services/platform/src/cutover/rollback-repoint.ts:120-127`
- `services/platform/src/cutover/rollback-repoint.ts:150-174`
- `services/platform/src/cutover/rollback-repoint.ts:216-221`
- `services/platform/src/cutover/rollback-repoint.ts:585-600`
- `services/platform/src/cutover/rollback-repoint.ts:670-679`
- `services/platform/src/cutover/convex-fence-client.ts:237-298`
- `convex/migrationFence/audit.ts:50-96`
- `convex/migrationFence/drain.ts:570-604`
- `convex/documents/queries.ts:36-87`
- `convex/schema.ts:1521-1536`
- `.spec/prds/mk6-migration/08-uc-sync.md:56-63,67-76`

**Gaps (do not plan around these):**

- No PONR table, migration, ledger, or write-enablement verb exists.
- Nothing captures a Convex state snapshot at any point in the cutover, so the fields above must all be newly read at PONR time — there is no earlier snapshot to diff against except the freeze/quiet-check reports in .tmp/D06-03/.
- .tmp/D06-05/data-plane-config.json is git-tracked and currently shows as modified in the working tree, demonstrating concretely that .tmp artifacts are mutable operator state and unsuitable as the PONR of record.

### From `specialist`

- Verified during D07-02/D07-03 planning: runRollbackRepoint() today (services/platform/src/cutover/rollback-repoint.ts:565-597) refuses ONLY on accepted_post_export_writes>0. There is no PONR check anywhere — `grep -rn "ponr|point_of_no_return"` over services/platform/src returns zero hits. D07-04 must add a NEW, distinct, stronger precondition to rollback-repoint.ts (or the cutover:rollback-repoint CLI case at holo.ts:3384) that refuses with a NEW error code (e.g. POST_PONR_INELIGIBLE) once the PONR record exists — this must be a separate check from POST_EXPORT_WRITE_ACCEPTED, because PONR is defined by the PRD as irreversible even when accepted_post_export_writes happens to read 0 (e.g. a PONR recorded but no writes yet landed).
- The PONR ledger should be written as an append-only, tamper-evident record — reuse the hash-chain pattern D07-02 introduces for the Convex-live attestation evidence (services/platform/src/cutover/convex-live-attestation.ts) rather than inventing a second evidence format.
- Once D07-04 lands, D07-03's rollback-drill (services/platform/src/cutover/rollback-drill.ts) should be re-run/extended with a 6th case proving rollback is refused post-PONR with the new distinct error code, separate from the existing POST_EXPORT_WRITE_ACCEPTED case — this is flagged, not silently added to D07-03's scope, since D07-04 doesn't exist yet when D07-03 is implemented.

## Notes

- ERROR-CODE RECONCILIATION: devops-engineer proposed POST_PONR_INELIGIBLE; this planner had earlier drafted DATA_PLANE_PONR_PASSED. POST_PONR_INELIGIBLE is adopted as canonical because the implementing specialist owns the constant, and D07-01's RED oracles in this same JSON assert that exact literal. Do not introduce a second name.
- Verified against the real files: loadPostExportWriteAudit (rollback-repoint.ts:181-211) returns {audit: {export_watermark_ms: wm, accepted_writes: []}, path: null} when the audit file is absent, so the existing POST_EXPORT_WRITE_ACCEPTED latch is defeatable by rm of a .tmp file. AC-7, TC-20/21/22 and the never-read-a-.tmp-path constraint exist so the PONR latch does not inherit this.
- Verified against the real files: runRollbackRepoint's only refusal precondition today is accepted > 0 at rollback-repoint.ts:565-597. The PONR check must be a separate branch evaluated before it, with its own code, firing even when accepted reads 0, because the PRD makes the PONR irreversible independently of the write audit.
- Verified against the real files: resolveObservedDataPlane() is called at services/platform/src/http/health.ts:267 and echoed into the /health body at :293-297, the sole consumer of HOLO_DATA_PLANE in services/platform/src. runRollbackRepoint makes no Convex calls and must not start; the Convex snapshot belongs to cutover:enable-writes only.
- ATTRIBUTED, NOT INDEPENDENTLY VERIFIED BY THIS PLANNER: the Convex function paths api.migrationFence.audit.latestFenceArmed and api.migrationFence.audit.countAttemptsInWindow come from convex-planner. Confirm both exist in the convex/ source before wiring. If either is missing or renamed, fail closed (refuse to record a PONR) rather than writing null snapshot columns, and report the discrepancy instead of silently degrading.
- PONR_LEDGER_UNREADABLE and CONVEX_ESCAPE_HATCH_DIVERGED are additions beyond the stub's literal wording. Rationale: once the PONR gates the rollback, a ledger-query failure has only two possible behaviours, proceed (silently reopening a permanently-closed hatch) or refuse, and refusing with a self-describing code is the only fail-closed option; likewise, closing the rollback path while the escape hatch has already diverged would certify a rollback window that was never real. Flagging both as intended scope, not drift.
- The verb name cutover:enable-writes is a proposal grounded in the existing cutover:* family (cutover:flip arms the fence; cutover:enable-writes is its terminal reciprocal). D07-01's RED tests spawn this literal verb name; a rename must land in both places in one commit.
- Grants alone CANNOT satisfy AC-2's owner case: in Postgres the table owner always retains DML regardless of REVOKE. That is why the trigger layer is mandatory, not belt-and-suspenders. The 0004 beliefs precedent needed only grants because a SECURITY DEFINER function legitimately required owner UPDATE; the PONR ledger has no such revision path.
- Migration numbering: the last file is 0029_backup_heartbeat.sql but the last journal entry is idx 15 tagged 0029_backup_heartbeat. The journal idx and the filename prefix have already diverged in this repo, so use the next idx (16), not 30.
- The CLI default: branch at services/platform/src/cli/holo.ts:7036 has a broken template literal (unknown command: $args.command with no braces), so it prints the literal text. Since this task touches the same switch, fixing it is trivial and worth doing, but it must not be used as a substitute for any AC.
- Sprint 29 is Blocked at the planning SHA (1 CRITICAL, 4 HIGH). Every AC stands up its own disposable control plane (.tmp/D07-04/secrets.yaml) and its own serving child process rather than assuming a healthy production soak. Do NOT make any AC pass by pointing at production soak artifacts.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D07-04",
  "tdd_mode": "shared",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "migrated_soak_stack": {
      "description": "Migrated real Postgres (including migration 0030) plus a pre-existing Hono serving process listening on an ephemeral 127.0.0.1 port that re-reads the durable secrets control plane per request, a disposable secrets file holding HOLO_MIGRATION_READ_ONLY='1', an export watermark report on disk, and a reachable frozen Convex deployment whose fence is armed.",
      "seed_method": "cli",
      "records": [
        "schema applied by bun services/platform/src/cli/holo.ts db:migrate; data_plane_ponr present in information_schema.tables",
        "roles holocron_app + holocron_owner present (created by migration 0004, re-asserted idempotently)",
        "process: real bun child serving GET /health and POST /api/documents on a free 127.0.0.1 port, started BEFORE any cutover verb runs",
        "file: .tmp/D07-04/secrets.yaml with HOLO_MIGRATION_READ_ONLY: '1'",
        "file: watermark report with a concrete watermarkAtMs consumed by loadExportWatermarkMs()",
        "convex: frozen deployment reachable, fence armed, latest fence-armed audit row queryable"
      ]
    },
    "first_production_write": {
      "description": "The first accepted Postgres production write, its live Convex escape-hatch snapshot, and the PONR record, all created by the real operator verb.",
      "seed_method": "cli",
      "records": [
        "1 documents row created by cutover:enable-writes via HTTP 201 POST /api/documents on the live base URL",
        "1 data_plane_ponr row bound to that documents row: write_table='documents', write_row_id=<real uuid>, write_row_digest_sha256=<64-hex recomputed from the committed row>",
        "convex_* columns on that row populated from the live Convex deployment at record time: convex_fence_audit_id, convex_fence_env_value, convex_documents_total, convex_newest_document_creation_time, convex_accepted_writes_since_watermark=0, convex_rejected_writes_since_watermark>=0, export_watermark_ms",
        "durable secrets: HOLO_MIGRATION_READ_ONLY flipped from '1' to '0'"
      ]
    },
    "three_real_post_export_writes_d0704": {
      "description": "Exactly 3 real accepted post-export production writes, used to prove the pre-existing POST_EXPORT_WRITE_ACCEPTED latch still works and is a distinct code path from the new PONR latch.",
      "seed_method": "public_api",
      "records": [
        "3 documents rows created by 3 x HTTP 201 POST /api/documents with the fence lifted",
        "post-export write audit written via writePostExportWriteAudit() with the 3 real ids and their Postgres-read commit timestamps"
      ]
    },
    "diverged_convex": {
      "description": "A frozen Convex deployment that has ALREADY drifted past the export watermark, proving the escape hatch was not intact.",
      "seed_method": "recorded_external",
      "records": [
        "convex: at least 1 accepted write recorded after the export watermark, so countAttemptsInWindow reports accepted_writes_since_watermark >= 1",
        "convex: newest document _creationTime strictly greater than export_watermark_ms",
        "postgres: data_plane_ponr still empty (0 rows) at the start of the case"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN a migrated soak stack with an empty ledger WHEN cutover:enable-writes --json runs THEN exactly one data_plane_ponr row is created, content-bound to a real HTTP 201 POST /api/documents row, with a digest recomputed from Postgres.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN one PONR row WHEN UPDATE/DELETE are attempted as holocron_app and as owner THEN Postgres raises 42501 and P0001/PONR_IMMUTABLE respectively and the row is unchanged.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-immutability.test.ts"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN a recorded PONR WHEN cutover:rollback-repoint --json runs THEN exit 2 with POST_PONR_INELIGIBLE, a separate latch from POST_EXPORT_WRITE_ACCEPTED, firing even though accepted_post_export_writes is 0, and no HOLO_DATA_PLANE=convex written.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN a recorded PONR WHEN cutover:enable-writes --json is re-run THEN exit 0, already_recorded true, same ponr_id, PONR count 1, documents count unchanged, convex_fence_audit_id unchanged.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'idempotent'"
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN an unreadable PONR ledger WHEN cutover:rollback-repoint --json runs THEN exit 2 with PONR_LEDGER_UNREADABLE, repointed false, no control-plane write.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'fails closed'"
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "description": "GIVEN an armed fence returning 423 WHEN cutover:enable-writes completes THEN the same pre-existing serving pid returns 201 for POST /api/documents and the durable HOLO_MIGRATION_READ_ONLY reads '0'.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'lifts the fence'"
    },
    {
      "id": "AC-7",
      "type": "acceptance_criterion",
      "description": "GIVEN a recorded PONR WHEN every .tmp cutover artifact is deleted and the audit is rewritten to zero accepted writes THEN cutover:rollback-repoint --json still exits 2 with POST_PONR_INELIGIBLE, proving the latch is strictly stronger than the fail-open POST_EXPORT_WRITE_ACCEPTED check.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'survives tmp deletion'"
    },
    {
      "id": "AC-8",
      "type": "acceptance_criterion",
      "description": "GIVEN an undiverged frozen Convex deployment WHEN cutover:enable-writes runs THEN the PONR row carries a live Convex snapshot matching values read directly from Convex; GIVEN a diverged deployment THEN the command exits 2 with CONVEX_ESCAPE_HATCH_DIVERGED, writes no PONR row, and leaves the fence armed.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'convex snapshot'"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "data_plane_ponr appears in information_schema.tables after holo db:migrate.",
      "maps_to_ac": "AC-1",
      "verify": "bun services/platform/src/cli/holo.ts db:migrate && psql \"$DATABASE_URL\" -c \"select 1 from information_schema.tables where table_name='data_plane_ponr'\""
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "cutover:enable-writes --json exits 0 on a stack with no existing PONR row.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "The stored write_row_digest_sha256 equals the digest recomputed by the test from the committed documents row.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "write_row_id resolves to exactly one row in the documents table.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "UPDATE data_plane_ponr as holocron_app raises SQLSTATE 42501.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-immutability.test.ts"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "DELETE FROM data_plane_ponr on the owner connection raises SQLSTATE P0001 with a PONR_IMMUTABLE message.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-immutability.test.ts"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "The PONR row count is exactly 1 after four rejected DML attempts.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-immutability.test.ts"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "A second INSERT into data_plane_ponr raises a unique-violation SQLSTATE 23505.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-immutability.test.ts"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "cutover:rollback-repoint --json exits 2 with POST_PONR_INELIGIBLE when a PONR row exists.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "cutover:rollback-repoint --json reports precondition.accepted_post_export_writes equal to 0 in the POST_PONR_INELIGIBLE refusal.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": "cutover:rollback-repoint --json exits 2 with POST_EXPORT_WRITE_ACCEPTED and acceptedCount 3 when 3 real post-export writes exist and no PONR row exists.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts -t 'three accepted post-export writes'"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": "The durable secrets file contains no HOLO_DATA_PLANE value of convex after a post-PONR refusal.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts"
    },
    {
      "id": "TC-13",
      "type": "test_criterion",
      "description": "The second cutover:enable-writes --json run reports already_recorded true.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'idempotent'"
    },
    {
      "id": "TC-14",
      "type": "test_criterion",
      "description": "The documents row count is unchanged across a cutover:enable-writes re-run.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'idempotent'"
    },
    {
      "id": "TC-15",
      "type": "test_criterion",
      "description": "convex_fence_audit_id is unchanged across a cutover:enable-writes re-run.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'idempotent'"
    },
    {
      "id": "TC-16",
      "type": "test_criterion",
      "description": "cutover:rollback-repoint --json exits 2 with PONR_LEDGER_UNREADABLE when DATABASE_URL is unreachable.",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'fails closed'"
    },
    {
      "id": "TC-17",
      "type": "test_criterion",
      "description": "POST /api/documents returns HTTP 423 on the pre-existing serving process before cutover:enable-writes runs.",
      "maps_to_ac": "AC-6",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'lifts the fence'"
    },
    {
      "id": "TC-18",
      "type": "test_criterion",
      "description": "POST /api/documents returns HTTP 201 on the same pre-existing serving pid after cutover:enable-writes runs.",
      "maps_to_ac": "AC-6",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'lifts the fence'"
    },
    {
      "id": "TC-19",
      "type": "test_criterion",
      "description": "HOLO_MIGRATION_READ_ONLY reads '0' in the durable secrets file after cutover:enable-writes.",
      "maps_to_ac": "AC-6",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'lifts the fence'"
    },
    {
      "id": "TC-20",
      "type": "test_criterion",
      "description": "cutover:rollback-repoint --json exits 2 with POST_PONR_INELIGIBLE after every .tmp cutover artifact is deleted.",
      "maps_to_ac": "AC-7",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'survives tmp deletion'"
    },
    {
      "id": "TC-21",
      "type": "test_criterion",
      "description": "cutover:rollback-repoint --json exits 2 with POST_PONR_INELIGIBLE after the post-export write audit is rewritten to zero accepted writes.",
      "maps_to_ac": "AC-7",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'survives tmp deletion'"
    },
    {
      "id": "TC-22",
      "type": "test_criterion",
      "description": "services/platform/src/cutover/ponr.ts contains no .tmp path reference in the latch read path.",
      "maps_to_ac": "AC-7",
      "verify": "grep -n '\\.tmp' services/platform/src/cutover/ponr.ts"
    },
    {
      "id": "TC-23",
      "type": "test_criterion",
      "description": "convex_fence_audit_id on the recorded PONR row equals the audit id read directly from the live Convex deployment.",
      "maps_to_ac": "AC-8",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'convex snapshot'"
    },
    {
      "id": "TC-24",
      "type": "test_criterion",
      "description": "convex_documents_total on the recorded PONR row is strictly greater than 0.",
      "maps_to_ac": "AC-8",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'convex snapshot'"
    },
    {
      "id": "TC-25",
      "type": "test_criterion",
      "description": "cutover:enable-writes --json exits 2 with CONVEX_ESCAPE_HATCH_DIVERGED when Convex accepted writes since the watermark is at least 1.",
      "maps_to_ac": "AC-8",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'convex snapshot'"
    },
    {
      "id": "TC-26",
      "type": "test_criterion",
      "description": "data_plane_ponr contains 0 rows after a CONVEX_ESCAPE_HATCH_DIVERGED refusal.",
      "maps_to_ac": "AC-8",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'convex snapshot'"
    },
    {
      "id": "TC-27",
      "type": "test_criterion",
      "description": "HOLO_MIGRATION_READ_ONLY reads '1' after a CONVEX_ESCAPE_HATCH_DIVERGED refusal.",
      "maps_to_ac": "AC-8",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'convex snapshot'"
    },
    {
      "id": "TC-28",
      "type": "test_criterion",
      "description": "services/platform/src/db/migrations/meta/_journal.json contains an entry tagged 0030_data_plane_ponr.",
      "maps_to_ac": "AC-1",
      "verify": "grep -n '0030_data_plane_ponr' services/platform/src/db/migrations/meta/_journal.json"
    }
  ]
}
-->
