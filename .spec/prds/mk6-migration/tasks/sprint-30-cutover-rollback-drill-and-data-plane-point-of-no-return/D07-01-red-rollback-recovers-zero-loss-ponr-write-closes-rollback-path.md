# D07-01: RED: rollback recovers zero-loss, PONR write closes rollback path
> Status: ✅ Completed
> Commit: 5338229d32d974536d466ce1680ca80dab51f03f
> Reviewer: product-manager+test-quality-reviewer
> Completed: 2026-08-07T07:35:58Z

> **Task ID:** D07-01
> **Sprint:** [Sprint 30 — Cutover Rollback Drill and Data-Plane PONR](./SPRINT.md)
> **Agent:** `red-test-generator`
> **Estimate:** 75 min
> **Type:** FEATURE
> **Priority:** P0 · **Effort:** M
> **Proposed By:** `mastra-planner`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

**Capabilities:** CAP-CUT-01
**PRD refs:** UC-SYNC-04, T-SYNC-013, T-SYNC-014

## Specification

**Objective.** Author the failing real-services integration oracles for (a) zero-loss rollback during the read-only soak and (b) the data-plane point-of-no-return latch that permanently closes the rollback path, so D07-03 and D07-04 have an unfakeable definition of done.

**Success state.** Three new integration test files exist: sprint30-rollback-zero-loss.test.ts, sprint30-ponr-latch.test.ts, sprint30-ponr-immutability.test.ts. Under PLATFORM_IT=1 pnpm vitest run --project integration, the drill, PONR-latch, PONR-immutability, PONR-idempotency, tmp-deletion-resistance, and Convex-snapshot cases FAIL at the planning SHA (unknown CLI verb cutover:rollback-drill / cutover:enable-writes exiting 2 with the printHelp banner; relation "data_plane_ponr" does not exist), while the mechanism-anchor case (3 seeded real accepted post-export writes -> cutover:rollback-repoint refuses with POST_EXPORT_WRITE_ACCEPTED and acceptedCount 3) PASSES, proving the harness reaches real services. RED output is captured under .tmp/D07-01/red/.

## Critical Constraints

- **MUST** — MUST author tests that FAIL at the planning SHA for the stated reason, and capture that failure output as RED evidence under .tmp/D07-01/.
- **MUST** — MUST seed the non-degenerate positive case from REAL Postgres rows created through the network POST /api/documents surface on an already-listening serving process, then record those real row ids and commit timestamps into the post-export audit via the real entrypoint writePostExportWriteAudit() (services/platform/src/cutover/rollback-repoint.ts:226).
- **MUST** — MUST assert the durable secrets control-plane (loadSecretsFile(HOLO_SECRETS_PATH)) directly as the independent oracle for whether a re-point actually happened; the .tmp/D06-05/data-plane-config.json audit mirror is NEVER the success oracle (rollback-repoint.ts:120-127).
- **MUST** — MUST include a case proving the PONR latch survives deletion of the post-export write audit file, because loadPostExportWriteAudit() (rollback-repoint.ts:181-211) is FAIL-OPEN and synthesizes zero accepted writes when that file is absent.
- **MUST** — MUST assert the PONR refusal fires while precondition.accepted_post_export_writes is 0, proving it is a separate latch from the accepted-writes check at rollback-repoint.ts:565-597.
- **MUST** — MUST run every test against a disposable secrets path (HOLO_SECRETS_PATH pointing under .tmp/D07-01/) so the RED run cannot mutate the real soak control plane.
- **NEVER** — NEVER implement cutover:rollback-drill, cutover:enable-writes, migration 0030_*.sql, or the POST_PONR_INELIGIBLE latch; those are D07-03 / D07-04 build surfaces and authoring them here destroys the RED.
- **NEVER** — NEVER mock Postgres, node:fs, fetch, or the holo CLI dispatcher; NEVER shell out to a PATH holo stub.
- **NEVER** — NEVER let a test pass while the pre-existing serving process is down; a rollback ack that survives a dead server is proof the oracle is fake.
- **NEVER** — NEVER write a test whose only assertion on the clean path is accepted_post_export_writes === 0.
- **NEVER** — NEVER let a .tmp file be the sole evidence a PONR exists; the PONR oracle queries Postgres.
- **STRICTLY** — STRICTLY assert exit codes from the real CLI process (spawnSync('bun', ['services/platform/src/cli/holo.ts', ...])): 0 on success, 2 on the fail-closed refusal codes (holo.ts:3413-3424).
- **STRICTLY** — STRICTLY keep the PONR-immutability oracle at the DATABASE level, two distinct SQLSTATEs (42501 for the app role, P0001 for the owner-path trigger); an app-code throw must not be able to satisfy it.

## Acceptance Criteria

#### AC-1 (PRIMARY)

- **GIVEN** GIVEN a real read-only soak (fixture soaked_stack_live) with zero accepted post-export production writes and a pre-existing serving process already answering GET /health
- **WHEN** WHEN the test drives bun services/platform/src/cli/holo.ts cutover:rollback-drill --json as the operator would during a Sev-1 gate failure
- **THEN** THEN the test asserts a drill report with repointed:true, target 'convex-frozen', lost_accepted_writes:0, accepted_post_export_writes_recomputed:0 independently recomputed from raw audit evidence, and at least 1 authorizing acknowledgement, AND the test FAILS at the planning SHA because cutover:rollback-drill is not a registered verb (exit 2, unknown command banner from holo.ts:7035-7038)

`test_tier: integration` · `service: cli` · `flow_ref: T-SYNC-013`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** stdout (capture required: True)
- **Case 0** — start_ref `soaked_stack_live`
    - action: Start the pre-existing serving process on a free 127.0.0.1 port and confirm GET /health returns HTTP 200 BEFORE any rollback command runs
    - action: Write the export watermark report with a concrete watermarkAtMs
    - action: Run bun services/platform/src/cli/holo.ts cutover:rollback-drill --json with HOLO_SECRETS_PATH=.tmp/D07-01/secrets.yaml and HOLO_VERIFY_BASE_URL=<the live base URL>
    - action: Capture stdout JSON and the process exit code into .tmp/D07-01/red/ac1-drill.json
    - MUST observe: exit_code == 2 AND stderr contains 'unknown command' at the planning SHA (the RED signal)
    - MUST observe: the authored assertion demands repointed == true
    - MUST observe: the authored assertion demands target == 'convex-frozen'
    - MUST observe: the authored assertion demands lost_accepted_writes == 0 AND accepted_post_export_writes_recomputed == 0, both recomputed from the raw audit file rather than copied from the drill report
    - MUST observe: the authored assertion demands acknowledgements.length >= 1 with every entry preexisting == true
    - MUST observe: the authored assertion demands loadSecretsFile('.tmp/D07-01/secrets.yaml')['HOLO_DATA_PLANE'] == 'convex'
    - MUST observe: the authored assertion demands GET <baseUrl>/health on the same pid reports data_plane == 'convex'
    - MUST NOT observe: exit_code == 0 (the drill verb is already registered and the task is not RED)
    - MUST NOT observe: lost_accepted_writes copied verbatim from the rollback-repoint report
    - MUST NOT observe: an acknowledgement with preexisting == false OR unit == 'cutover-cli' counted as authorizing
    - MUST NOT observe: assertions passing with 0 live serving child processes

</details>

#### AC-2

- **GIVEN** GIVEN fixture three_real_post_export_writes, exactly 3 real documents rows created through POST /api/documents after T_export and recorded via writePostExportWriteAudit()
- **WHEN** WHEN the test drives bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json
- **THEN** THEN the CLI exits 2, error.code === 'POST_EXPORT_WRITE_ACCEPTED', precondition.accepted_post_export_writes === 3, repointed === false, and the disposable durable secrets file contains NO HOLO_DATA_PLANE: convex key, proving the refusal happened before any control-plane write

`test_tier: integration` · `service: cli` · `flow_ref: T-SYNC-013`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts -t 'three accepted post-export writes'`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** stdout (capture required: True)
- **Case 0** — start_ref `three_real_post_export_writes`
    - action: Lift the fence on the disposable secrets path and POST 3 documents to <baseUrl>/api/documents, capturing the 3 returned ids
    - action: SELECT date FROM documents WHERE id = ANY($ids) to obtain the REAL commit timestamps
    - action: Call writePostExportWriteAudit() with export_watermark_ms = T_export and the 3 real {id, committed_at_ms, surface} records
    - action: Re-arm the fence, then run bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json
    - action: Parse stdout JSON and read the disposable secrets file with loadSecretsFile()
    - MUST observe: exit_code == 2
    - MUST observe: error.code == 'POST_EXPORT_WRITE_ACCEPTED'
    - MUST observe: precondition.accepted_post_export_writes == 3
    - MUST observe: repointed == false
    - MUST observe: SELECT count(*) FROM documents WHERE id = ANY(seeded_ids) == 3
    - MUST observe: each of the 3 audit committed_at_ms values > export_watermark_ms
    - MUST NOT observe: precondition.accepted_post_export_writes == 0 (a stub that always reports zero)
    - MUST NOT observe: grep -c 'HOLO_DATA_PLANE: convex' .tmp/D07-01/secrets.yaml > 0
    - MUST NOT observe: exit_code == 0
    - MUST NOT observe: error.code == 'EXPORT_WATERMARK_MISSING'

</details>

#### AC-3

- **GIVEN** GIVEN fixture ponr_recorded, the data-plane point of no return has been recorded by cutover:enable-writes and zero accepted post-export writes are present in the audit
- **WHEN** WHEN the test drives bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json
- **THEN** THEN the test asserts the CLI exits 2 with error.code === 'POST_PONR_INELIGIBLE', a code textually distinct from POST_EXPORT_WRITE_ACCEPTED, repointed === false, precondition.accepted_post_export_writes === 0, and no HOLO_DATA_PLANE: convex in the durable secrets, AND the test FAILS at the planning SHA because neither cutover:enable-writes nor the latch exists

`test_tier: integration` · `service: cli` · `flow_ref: T-SYNC-014`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** stdout (capture required: True)
- **Case 0** — start_ref `ponr_recorded`
    - action: Run bun services/platform/src/cli/holo.ts cutover:enable-writes --json against the disposable control plane and real Postgres
    - action: Assert SELECT count(*) FROM data_plane_ponr returns exactly 1 and the convex_* snapshot columns are non-null
    - action: Run bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json
    - action: Capture stdout JSON, exit code, and the durable secrets contents into .tmp/D07-01/red/ac3-latch.json
    - MUST observe: at the planning SHA cutover:enable-writes exit_code == 2 with the printHelp banner (the RED signal)
    - MUST observe: the authored assertion demands error.code == 'POST_PONR_INELIGIBLE'
    - MUST observe: the authored assertion demands error.code != 'POST_EXPORT_WRITE_ACCEPTED'
    - MUST observe: the authored assertion demands exit_code == 2 AND repointed == false
    - MUST observe: the authored assertion demands precondition.accepted_post_export_writes == 0
    - MUST observe: the authored assertion demands SELECT count(*) FROM data_plane_ponr == 1 before and after the refused rollback
    - MUST observe: the authored assertion demands len(convex_fence_audit_id) > 0 on the PONR row
    - MUST NOT observe: repointed == true while SELECT count(*) FROM data_plane_ponr == 1
    - MUST NOT observe: an oracle accepting error.code == 'POST_EXPORT_WRITE_ACCEPTED' as satisfying the PONR latch
    - MUST NOT observe: grep -c 'HOLO_DATA_PLANE: convex' .tmp/D07-01/secrets.yaml > 0
    - MUST NOT observe: SELECT count(*) FROM data_plane_ponr == 0 with ponr_id == '' (the never-ran start state)

</details>

#### AC-4

- **GIVEN** GIVEN fixture ponr_recorded, exactly one row exists in data_plane_ponr
- **WHEN** WHEN the test attempts UPDATE data_plane_ponr SET write_row_id = 'forged' and DELETE FROM data_plane_ponr as the holocron_app role AND again on the owner/migration connection
- **THEN** THEN the test asserts SQLSTATE 42501 (insufficient_privilege) on the app-role connection and SQLSTATE P0001 with message prefix PONR_IMMUTABLE on the owner connection, and that SELECT count(*) is still exactly 1 with the original write_row_digest_sha256 unchanged, AND the test FAILS at the planning SHA with relation "data_plane_ponr" does not exist

`test_tier: integration` · `service: postgres` · `flow_ref: T-SYNC-014`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-immutability.test.ts`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** db_query (capture required: True)
- **Case 0** — start_ref `ponr_recorded`
    - action: Read the PONR row's id and write_row_digest_sha256 on the owner connection
    - action: Open an app-role connection with toAppRoleDatabaseUrl(DEFAULT_DATABASE_URL) and assert SELECT current_user is 'holocron_app'
    - action: Attempt UPDATE then DELETE as holocron_app and capture err.code
    - action: Attempt UPDATE then DELETE on the owner/migration connection and capture err.code and err.message
    - action: Re-SELECT the row on the owner connection
    - MUST observe: the authored assertion demands app-role UPDATE err.code == '42501'
    - MUST observe: the authored assertion demands app-role DELETE err.code == '42501'
    - MUST observe: the authored assertion demands owner UPDATE err.code == 'P0001' with err.message containing 'PONR_IMMUTABLE'
    - MUST observe: the authored assertion demands owner DELETE err.code == 'P0001' with err.message containing 'PONR_IMMUTABLE'
    - MUST observe: the authored assertion demands SELECT count(*) FROM data_plane_ponr == 1 after all 4 attempts
    - MUST observe: the authored assertion demands write_row_digest_sha256_after == write_row_digest_sha256_before
    - MUST observe: at the planning SHA the run fails with 'relation "data_plane_ponr" does not exist' (the RED signal)
    - MUST NOT observe: any of the 4 statements reporting rowcount == 1
    - MUST NOT observe: err.code == null (rejection thrown by application code with no SQLSTATE)
    - MUST NOT observe: app_role_sqlstate == owner_sqlstate
    - MUST NOT observe: SELECT count(*) FROM data_plane_ponr == 0 after the attempts

</details>

#### AC-5

- **GIVEN** GIVEN fixture ponr_recorded, cutover:enable-writes has already run once and exactly one PONR row and one first-write documents row exist
- **WHEN** WHEN the operator re-runs bun services/platform/src/cli/holo.ts cutover:enable-writes --json
- **THEN** THEN the test asserts the second run exits 0 with already_recorded === true and the SAME ponr_id as the first run, SELECT count(*) FROM data_plane_ponr is still exactly 1, and the documents row count is unchanged, so no second production write is manufactured

`test_tier: integration` · `service: postgres` · `flow_ref: T-SYNC-014`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'idempotent'`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** db_query (capture required: True)
- **Case 0** — start_ref `ponr_recorded`
    - action: Capture ponr_id from the first cutover:enable-writes --json run and SELECT count(*) FROM documents as the baseline
    - action: Re-run bun services/platform/src/cli/holo.ts cutover:enable-writes --json
    - action: Parse the second run's stdout JSON and re-query both counts
    - MUST observe: the authored assertion demands the second run exit_code == 0
    - MUST observe: the authored assertion demands already_recorded == true
    - MUST observe: the authored assertion demands ponr_id_run2 == ponr_id_run1
    - MUST observe: the authored assertion demands SELECT count(*) FROM data_plane_ponr == 1 after the second run
    - MUST observe: the authored assertion demands SELECT count(*) FROM documents == baseline_count
    - MUST observe: at the planning SHA both runs exit_code == 2 with the printHelp banner (the RED signal)
    - MUST NOT observe: SELECT count(*) FROM data_plane_ponr == 2
    - MUST NOT observe: ponr_id_run2 != ponr_id_run1
    - MUST NOT observe: SELECT count(*) FROM documents == baseline_count + 1
    - MUST NOT observe: SELECT count(*) FROM data_plane_ponr == 0 with ponr_id == '' (the never-ran start state)

</details>

#### AC-6

- **GIVEN** GIVEN fixture ponr_recorded, a PONR row exists in Postgres, and every .tmp cutover artifact has been deleted (post-export write audit, data-plane config mirror, rollback report, enable-writes report)
- **WHEN** WHEN the operator runs bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json
- **THEN** THEN the test asserts the CLI STILL exits 2 with error.code === 'POST_PONR_INELIGIBLE', proving the PONR latch is strictly stronger than the pre-existing POST_EXPORT_WRITE_ACCEPTED latch, which loadPostExportWriteAudit() (rollback-repoint.ts:181-211) lets fall open when its .tmp ledger file is removed

`test_tier: integration` · `service: cli` · `flow_ref: T-SYNC-014`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'survives tmp deletion'`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** stdout (capture required: True)
- **Case 0** — start_ref `ponr_recorded`
    - action: Confirm SELECT count(*) FROM data_plane_ponr is 1
    - action: Delete the post-export write audit, the data-plane config mirror, the rollback-repoint report, and the enable-writes report under .tmp/
    - action: Run bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json
    - action: Rewrite the audit file with accepted_writes: [] and run the command again
    - action: Capture stdout JSON and exit codes into .tmp/D07-01/red/ac6-tmp-deleted.json
    - MUST observe: the authored assertion demands exit_code == 2 AND error.code == 'POST_PONR_INELIGIBLE' after 0 .tmp cutover artifacts remain
    - MUST observe: the authored assertion demands error.code == 'POST_PONR_INELIGIBLE' after the audit file is rewritten with accepted_writes == []
    - MUST observe: the authored assertion demands SELECT count(*) FROM data_plane_ponr == 1 after the deletions
    - MUST observe: the contrast assertion records that with SELECT count(*) FROM data_plane_ponr == 0 and the audit deleted, error.code != 'POST_EXPORT_WRITE_ACCEPTED'
    - MUST observe: at the planning SHA cutover:enable-writes exit_code == 2 with the printHelp banner (the RED signal)
    - MUST NOT observe: exit_code == 0 after the .tmp deletion
    - MUST NOT observe: error.code == 'EXPORT_WATERMARK_MISSING' masking the PONR latch
    - MUST NOT observe: an oracle deciding the PONR passed from the presence of 1 .tmp file
    - MUST NOT observe: SELECT count(*) FROM data_plane_ponr == 0 with ponr_id == '' as a side effect of the deletions

</details>

#### AC-7

- **GIVEN** GIVEN all three new test files exist at the planning SHA
- **WHEN** WHEN PLATFORM_IT=1 pnpm vitest run --project integration is executed over them and its full output is captured
- **THEN** THEN the captured artifact shows the drill, PONR-latch, immutability, idempotency, and tmp-deletion cases FAILING for their stated reasons (unknown CLI verb; missing relation), the mechanism-anchor case (AC-2) PASSING, and a manifest at .tmp/D07-01/red/manifest.json mapping each failing test name to its expected-failure reason

`test_tier: integration` · `service: cli` · `flow_ref: UC-SYNC-04`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts services/platform/tests/integration/sprint30-ponr-latch.test.ts services/platform/tests/integration/sprint30-ponr-immutability.test.ts 2>&1 | tee .tmp/D07-01/red/full-run.log`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** file_artifact (capture required: True)
- **Case 0** — start_ref `soaked_stack_live`
    - action: Run the three new test files under the integration project with PLATFORM_IT=1 and tee the output
    - action: Write .tmp/D07-01/red/manifest.json listing test name, expected failure reason, observed failure reason
    - MUST observe: '.tmp/D07-01/red/full-run.log' file size > 0 bytes
    - MUST observe: grep -c 'FAIL' .tmp/D07-01/red/full-run.log >= 5
    - MUST observe: the log contains the literal substring 'unknown command'
    - MUST observe: the log contains the literal substring 'data_plane_ponr'
    - MUST observe: exactly 1 passing test: the AC-2 anchor asserting accepted_post_export_writes == 3
    - MUST observe: '.tmp/D07-01/red/manifest.json' has 1 entry per failing test with observed_reason == expected_reason
    - MUST NOT observe: grep -c 'FAIL' .tmp/D07-01/red/full-run.log == 0
    - MUST NOT observe: 0 passing tests (the harness never reached real services)
    - MUST NOT observe: a failure reason of 'PLATFORM_IT is not set' or 'ECONNREFUSED'
    - MUST NOT observe: '.tmp/D07-01/red/full-run.log' file size == 0 bytes

</details>

## Test Criteria

| ID | Boolean statement | Maps to | Verify |
|----|-------------------|---------|--------|
| TC-1 | cutover:rollback-drill --json exits 2 with an unknown command banner when run at the planning SHA. | AC-1 | `bun services/platform/src/cli/holo.ts cutover:rollback-drill --json; echo $?` |
| TC-2 | The zero-loss test file asserts lost_accepted_writes === 0 recomputed from the raw audit file rather than read from the drill report. | AC-1 | `grep -n 'lost_accepted_writes' services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts` |
| TC-3 | The zero-loss test asserts at least one acknowledgement with preexisting === true. | AC-1 | `grep -n 'preexisting' services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts` |
| TC-4 | cutover:rollback-repoint --json reports precondition.accepted_post_export_writes === 3 when 3 real post-export writes are seeded. | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts -t 'three accepted post-export writes'` |
| TC-5 | The 3 seeded post-export write ids resolve to 3 real rows in the Postgres documents table. | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts -t 'three accepted post-export writes'` |
| TC-6 | The disposable secrets file contains no HOLO_DATA_PLANE value of convex after a POST_EXPORT_WRITE_ACCEPTED refusal. | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts -t 'three accepted post-export writes'` |
| TC-7 | The PONR latch test asserts error.code === 'POST_PONR_INELIGIBLE'. | AC-3 | `grep -n 'POST_PONR_INELIGIBLE' services/platform/tests/integration/sprint30-ponr-latch.test.ts` |
| TC-8 | The PONR latch test asserts the returned error code is not equal to POST_EXPORT_WRITE_ACCEPTED. | AC-3 | `grep -n 'POST_EXPORT_WRITE_ACCEPTED' services/platform/tests/integration/sprint30-ponr-latch.test.ts` |
| TC-9 | The PONR latch test asserts precondition.accepted_post_export_writes === 0 in the refused report. | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts` |
| TC-10 | The immutability test asserts SQLSTATE 42501 for the holocron_app role UPDATE attempt. | AC-4 | `grep -n '42501' services/platform/tests/integration/sprint30-ponr-immutability.test.ts` |
| TC-11 | The immutability test asserts SQLSTATE P0001 with a PONR_IMMUTABLE message for the owner-connection DELETE attempt. | AC-4 | `grep -n 'PONR_IMMUTABLE' services/platform/tests/integration/sprint30-ponr-immutability.test.ts` |
| TC-12 | The immutability test asserts the PONR row count is exactly 1 after all four DML attempts. | AC-4 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-immutability.test.ts` |
| TC-13 | The idempotency test asserts the second cutover:enable-writes run returns the same ponr_id as the first. | AC-5 | `grep -n 'ponr_id' services/platform/tests/integration/sprint30-ponr-latch.test.ts` |
| TC-14 | The idempotency test asserts the documents row count is unchanged across the re-run. | AC-5 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'idempotent'` |
| TC-15 | The tmp-deletion test asserts error.code === 'POST_PONR_INELIGIBLE' after the post-export write audit file is removed. | AC-6 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'survives tmp deletion'` |
| TC-16 | The tmp-deletion test asserts the PONR row count is exactly 1 after all .tmp artifacts are deleted. | AC-6 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'survives tmp deletion'` |
| TC-17 | .tmp/D07-01/red/full-run.log records at least 5 failing tests at the planning SHA. | AC-7 | `grep -c 'FAIL' .tmp/D07-01/red/full-run.log` |
| TC-18 | .tmp/D07-01/red/full-run.log records exactly 1 passing test at the planning SHA. | AC-7 | `grep -c 'passed' .tmp/D07-01/red/full-run.log` |
| TC-19 | No new test file imports vi.mock for postgres, node:fs, or the holo CLI module. | AC-7 | `grep -n 'vi.mock' services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts services/platform/tests/integration/sprint30-ponr-latch.test.ts services/platform/tests/integration/sprint30-ponr-immutability.test.ts` |

## Fixtures (shared seed data)

- **`soaked_stack_live`** — A real read-only soak: migrated Postgres, a pre-existing Hono serving process listening on an ephemeral 127.0.0.1 port that re-reads the durable secrets control-plane on every GET /health, a disposable secrets file at .tmp/D07-01/secrets.yaml with HOLO_MIGRATION_READ_ONLY=1, and an export watermark report on disk.  
  seed_method: `cli`
    - postgres: schema applied by bun services/platform/src/cli/holo.ts db:migrate against DATABASE_URL
    - process: bun child spawned BEFORE any rollback command, bound to a free 127.0.0.1 port, serving GET /health from readDurableDataPlane() (pattern: services/platform/tests/integration/sprint29-rollback-repoint.test.ts:78-95)
    - file: .tmp/D07-01/secrets.yaml containing HOLO_MIGRATION_READ_ONLY: '1'
    - file: watermark report with watermarkAtMs set to a concrete epoch-ms (T_export), consumed by loadExportWatermarkMs()
- **`three_real_post_export_writes`** — Exactly 3 real accepted production writes committed AFTER the export watermark, created through the real network write surface with the fence lifted, then recorded into the post-export write audit ledger via the real audit entrypoint.  
  seed_method: `public_api`
    - 3 rows in documents created by 3 x POST /api/documents (HTTP 201) against the pre-existing serving base URL, real ids returned in the response body
    - audit file written by writePostExportWriteAudit({export_watermark_ms: T_export, accepted_writes: [{committed_at_ms: <real row commit ms>, surface: 'hono.POST /api/documents', id: <real documents.id>} x 3]}, auditPath)
    - each committed_at_ms re-read from Postgres (SELECT date FROM documents WHERE id = $1), not invented by the test
- **`ponr_recorded`** — The data-plane point of no return has been passed: the write fence is lifted and exactly one PONR ledger row exists, content-bound to a real first Postgres production write and carrying a live Convex escape-hatch snapshot.  
  seed_method: `cli`
    - 1 row in data_plane_ponr created by bun services/platform/src/cli/holo.ts cutover:enable-writes --json (D07-04 surface)
    - 1 row in documents, the first accepted Postgres production write the PONR row is bound to
    - convex_* snapshot columns populated on that row from the live frozen Convex deployment
    - durable secrets: HOLO_MIGRATION_READ_ONLY flipped to '0'

## Reading List

- `services/platform/src/cutover/rollback-repoint.ts` — lines 39-46 — Existing fail-closed error codes (POST_EXPORT_WRITE_ACCEPTED, ROLLBACK_INELIGIBLE, EXPORT_WATERMARK_MISSING, LIVE_ACK_MISSING, CONTROL_PLANE_WRITE_FAILED) and TARGET_CONVEX_FROZEN. The new PONR code POST_PONR_INELIGIBLE must be distinct from all of these.
- `services/platform/src/cutover/rollback-repoint.ts` — lines 181-211 — loadPostExportWriteAudit is FAIL-OPEN: when the audit file is absent it synthesizes {accepted_writes: []} from the watermark. This is why AC-6 exists; the existing latch can be defeated by deleting a .tmp file and the PONR latch must not share that weakness.
- `services/platform/src/cutover/rollback-repoint.ts` — lines 565-597 — The ONLY current refusal precondition (accepted > 0 -> POST_EXPORT_WRITE_ACCEPTED) and the exact shape of that failure report your positive case must assert. The PONR latch is a separate branch before it.
- `services/platform/src/cutover/rollback-repoint.ts` — lines 216-229 — countAcceptedPostExportWrites (strictly greater than the watermark) and writePostExportWriteAudit, the real audit entrypoint for seeding N>0.
- `services/platform/src/cutover/rollback-repoint.ts` — lines 716-790 — Acknowledgement collection and the ok/repointed success report, the fields the drill oracle must demand.
- `services/platform/src/cutover/soak-fence.ts` — lines 138-240 — DATA_PLANE_ENV / ROLLBACK_TARGET_ENV, readDurableDataPlane, writeDurableDataPlane, the durable secrets control-plane you assert directly as the independent oracle.
- `services/platform/src/cutover/soak-fence.ts` — lines 51-136 — MIGRATION_READ_ONLY_ENV, isMigrationReadOnly, writeDurableMigrationReadOnly, how to arm and lift the fence on a disposable secrets path.
- `services/platform/src/http/health.ts` — lines 260-300 — resolveObservedDataPlane() at :267 echoed into the /health body at :293-297, the ONLY consumer of HOLO_DATA_PLANE in services/platform/src. This is the network oracle the drill test reads to confirm a pre-existing process observed the re-point.
- `services/platform/src/cli/holo.ts` — lines 3384-3436 — The registered cutover:rollback-repoint case: --json/--output/--target/--etl-report flags and the exit-code 2 mapping for fail-closed codes.
- `services/platform/src/cli/holo.ts` — lines 7035-7038 — The default: unknown-command branch, exit code 2 plus printHelp. This is the exact RED signal for cutover:rollback-drill and cutover:enable-writes. NOTE: the message template is broken ($args.command without braces), so assert on the exit code and the help banner, never on the verb name appearing in stderr.
- `services/platform/tests/integration/sprint29-rollback-repoint.test.ts` — lines 1-120 — The pre-existing-serving-process harness: freePort(), startPreexistingServing() spawning a real bun child that re-reads durable secrets on /health, disposable secrets path, REPO_ROOT discipline. Reuse this rather than re-inventing it.
- `services/platform/src/http/hono-app.ts` — lines 350-378 — POST /api/documents, the real production write path that produces the real documents rows the positive case binds to.
- `services/platform/src/http/hono-app.ts` — lines 190-195 — createSoakFenceMiddleware mounted on '*', how a fenced POST returns 423 with the migration_read_only body.
- `tests/integration/service/immutability-dml-rejected.test.ts` — lines 1-95 — The canonical DB-enforced DML-rejection test shape: app-role connection via toAppRoleDatabaseUrl, current_user assertion, SQLSTATE capture, owner re-SELECT. Mirror this for data_plane_ponr.
- `services/platform/src/db/evidence/roles.ts` — lines 1-30 — HOLOCRON_APP_ROLE and toAppRoleDatabaseUrl, how to obtain the least-privilege connection.
- `tests/integration/service/harness.ts` — lines 20-40 — PLATFORM_IT, REPO_ROOT, DEFAULT_DATABASE_URL, the integration-lane entry points.
- `.spec/prds/mk6-migration/08-uc-sync.md` — lines 56-64 — UC-SYNC-04 AC-2 and AC-3 verbatim, the zero-loss and PONR obligations your oracles encode.
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` — lines 216-220 — T-SYNC-013 and T-SYNC-014 human-gate rows, the flow_refs.

## Guardrails

**WRITE-ALLOWED**

- `services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts (NEW)`
- `services/platform/tests/integration/sprint30-ponr-latch.test.ts (NEW)`
- `services/platform/tests/integration/sprint30-ponr-immutability.test.ts (NEW)`
- `services/platform/tests/integration/sprint30-cutover-harness.ts (NEW, shared fixture helpers only, no production logic)`
- `.tmp/D07-01/** (NEW, RED evidence artifacts)`

**WRITE-PROHIBITED**

- services/platform/src/cutover/rollback-repoint.ts - implementing the POST_PONR_INELIGIBLE latch here destroys the RED; D07-04 owns it
- services/platform/src/cli/holo.ts - registering cutover:rollback-drill or cutover:enable-writes is D07-03/D07-04 work
- services/platform/src/db/migrations/** - migration 0030 is D07-04's build surface
- services/platform/src/db/schema/** - the data_plane_ponr drizzle table is D07-04's build surface
- services/platform/tests/integration/sprint29-*.test.ts - Sprint 29 tests are frozen evidence; do not edit to make Sprint 30 pass
- services/platform/src/cutover/soak-fence.ts - no fence changes from a RED task
- services/platform/src/http/health.ts - the /health data_plane echo is Sprint 29 evidence and is read-only here

## Code Pattern / Design

- **Reference:** UC-SYNC-04 AC-2 (zero accepted post-export production writes lost)
- **Reference:** UC-SYNC-04 AC-3 (first accepted Postgres production write is the data-plane PONR)
- **Reference:** CAP-CUT-01 failure modes (after the first accepted Postgres write, never claim Convex rollback)
- **Pattern:** Real-CLI plus real-Postgres plus pre-existing-serving-process integration oracle. Seed through real entrypoints, assert on the durable control plane and on Postgres directly, and pair every zero-assertion with a concrete N>0 case.
- **Pattern source:** `services/platform/tests/integration/sprint29-rollback-repoint.test.ts:1-120 (serving-process harness) plus tests/integration/service/immutability-dml-rejected.test.ts:20-95 (DB-level DML rejection with SQLSTATE capture)`
- **Anti-pattern:** Calling runRollbackRepoint() in-process as the PRIMARY oracle; asserting only accepted_post_export_writes === 0; treating .tmp/D06-05/data-plane-config.json as proof the data plane moved; treating the presence of a .tmp file as proof a PONR exists; accepting any non-zero exit code as 'the latch worked' without pinning the error code; using vi.mock on postgres/fs/fetch.
- Operator surface under test is the CLI dispatcher invoked as bun services/platform/src/cli/holo.ts <verb> --json, spawned as a real child process so exit codes are real.
- The pre-existing serving process must be started and proven listening BEFORE any rollback command; rollback-repoint.ts:502-508 snapshots pre-existing units before the control-plane write and will refuse with LIVE_ACK_MISSING otherwise.
- The only network-observable effect of a re-point is the /health body (health.ts:267 -> :293-297). Read it on the SAME pre-existing pid to prove a real serving process saw the new plane.
- Point HOLO_SECRETS_PATH at a disposable file under .tmp/D07-01 so the RED run never touches the real soak control plane.

## Verification Gates

| Gate | Command | Expected |
|------|---------|----------|
| Lint | `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts services/platform/tests/integration/sprint30-ponr-latch.test.ts services/platform/tests/integration/sprint30-ponr-immutability.test.ts services/platform/tests/integration/sprint30-cutover-harness.ts` | Exit 0 |
| Typecheck | `pnpm tsgo --noEmit` | Exit 0 |
| RED evidence capture | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts services/platform/tests/integration/sprint30-ponr-latch.test.ts services/platform/tests/integration/sprint30-ponr-immutability.test.ts 2>&1 | tee .tmp/D07-01/red/full-run.log` | Non-zero exit with at least 5 reason-specific failures and exactly 1 pass (this gate is expected RED) |
| Unknown-verb RED signal | `bun services/platform/src/cli/holo.ts cutover:rollback-drill --json` | Exit 2 |
| No-mock guard | `grep -rn 'vi.mock' services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts services/platform/tests/integration/sprint30-ponr-latch.test.ts services/platform/tests/integration/sprint30-ponr-immutability.test.ts` | Exit 1 (no matches) |
| Unit lane unaffected | `pnpm test:unit` | Exit 0 |

## Agent Assignment

- **Agent:** `red-test-generator`
- **Rationale:** This is the sprint's RED-phase oracle task: it authors failing real-services integration tests that D07-03 (drill) and D07-04 (PONR) must turn green. red-test-generator owns RED authoring and must not implement the production surfaces it tests.

## Coding Standards

- TypeScript strict; no any in test helpers. Type CLI stdout with the exported RollbackRepointReport type where applicable.
- Import production constants (POST_EXPORT_WRITE_ACCEPTED, TARGET_CONVEX_FROZEN) from services/platform/src/cutover/rollback-repoint.ts rather than re-typing string literals, except the intentionally not-yet-existing POST_PONR_INELIGIBLE, which is asserted as a literal until D07-04 exports it.
- Every spawned child process is torn down in afterEach with an awaited stop(); no orphaned ports.
- Every test writes its evidence artifact under .tmp/D07-01/ with a stable filename so the reviewer can replay the oracle.
- One assertion concept per test; split compound assertions into named cases so RED failures are reason-specific.

## Dependencies

- **Depends on:** None
- **Blocks:** D07-03, D07-04, D07-05

## Cross-Specialist Enrichments

### From `specialist`

- RED must target the code that does NOT exist yet at planning time — rollback-repoint.ts itself already exists and already passes Sprint 29's tests, so a RED suite that only re-drives cutover:rollback-repoint proves nothing new. RED needs failing tests against: (a) the new cutover:attest-convex-live / cutover:pin-fallback-build / cutover:verify-fallback-boot verbs D07-02 adds, (b) the new cutover:rollback-drill orchestrator D07-03 adds, and (c) the PONR write-enablement verb + its rollback-refusal precondition D07-04 adds — none of these exist at 6de957d3.
- RED must include the non-degenerate N>0 accepted-post-export-write refusal case and (once D07-04 lands) the post-PONR refusal case as FAILING tests before implementation, not only the zero-loss happy path — a RED suite that only exercises the degenerate zero case would pass trivially against a stub.

## Notes

- ERROR-CODE RECONCILIATION: this RED asserts the literal POST_PONR_INELIGIBLE, adopting devops-engineer's proposed constant over the earlier draft name DATA_PLANE_PONR_PASSED. D07-04 in this same JSON exports that constant. If D07-04 renames it, this file must change in the same commit.
- loadPostExportWriteAudit() (rollback-repoint.ts:181-211) is FAIL-OPEN: with the audit file absent it synthesizes {accepted_writes: []} from the watermark alone, so the existing POST_EXPORT_WRITE_ACCEPTED latch is defeatable by deleting a .tmp file. AC-6 exists specifically to prove the new PONR latch does not inherit that weakness.
- runRollbackRepoint's only refusal precondition today is accepted > 0 (rollback-repoint.ts:565-597). AC-3 therefore asserts the PONR refusal fires while accepted_post_export_writes reads 0, which is the only way to prove the two latches are separate code paths.
- HOLO_DATA_PLANE has exactly ONE consumer in services/platform/src: resolveObservedDataPlane() at http/health.ts:267, echoed into the /health body at :293-297. runRollbackRepoint performs ZERO Convex I/O, so 'the data plane was re-pointed' is observable only as the durable secrets value and the /health echo. Assert both; do not author an oracle expecting Convex-side effects from the rollback path.
- The CLI unknown-command branch (services/platform/src/cli/holo.ts:7035-7038) has a real defect: the template literal is 'unknown command: $args.command' with no braces, so it prints the literal text. Assert on exit code 2 plus the printHelp banner, not on the verb name in stderr. Out of scope to fix here; flagged for D07-04, which touches the same switch.
- Verb names cutover:rollback-drill (D07-03) and cutover:enable-writes (D07-04) are PROPOSALS from this planning pass. If the owning specialists register different names, these RED oracles must be updated in the same commit; the RED and the verb name must never drift.
- AC-2 is expected to PASS at the planning SHA. That is deliberate: it is the harness-reality anchor proving the tests reach real Postgres, a real serving process, and the real CLI. A run where AC-2 also fails means the environment is broken, not that the sprint is RED.
- Sprint 29 is Blocked (1 CRITICAL, 4 HIGH at 6de957d3). These oracles stand up their OWN disposable soak (disposable secrets path, own serving child, own watermark report) rather than assuming a healthy production soak, and must never fixture-substitute the production soak to go green.

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "D07-01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "soaked_stack_live": {
      "description": "A real read-only soak: migrated Postgres, a pre-existing Hono serving process listening on an ephemeral 127.0.0.1 port that re-reads the durable secrets control-plane on every GET /health, a disposable secrets file at .tmp/D07-01/secrets.yaml with HOLO_MIGRATION_READ_ONLY=1, and an export watermark report on disk.",
      "seed_method": "cli",
      "records": [
        "postgres: schema applied by bun services/platform/src/cli/holo.ts db:migrate against DATABASE_URL",
        "process: bun child spawned BEFORE any rollback command, bound to a free 127.0.0.1 port, serving GET /health from readDurableDataPlane() (pattern: services/platform/tests/integration/sprint29-rollback-repoint.test.ts:78-95)",
        "file: .tmp/D07-01/secrets.yaml containing HOLO_MIGRATION_READ_ONLY: '1'",
        "file: watermark report with watermarkAtMs set to a concrete epoch-ms (T_export), consumed by loadExportWatermarkMs()"
      ]
    },
    "three_real_post_export_writes": {
      "description": "Exactly 3 real accepted production writes committed AFTER the export watermark, created through the real network write surface with the fence lifted, then recorded into the post-export write audit ledger via the real audit entrypoint.",
      "seed_method": "public_api",
      "records": [
        "3 rows in documents created by 3 x POST /api/documents (HTTP 201) against the pre-existing serving base URL, real ids returned in the response body",
        "audit file written by writePostExportWriteAudit({export_watermark_ms: T_export, accepted_writes: [{committed_at_ms: <real row commit ms>, surface: 'hono.POST /api/documents', id: <real documents.id>} x 3]}, auditPath)",
        "each committed_at_ms re-read from Postgres (SELECT date FROM documents WHERE id = $1), not invented by the test"
      ]
    },
    "ponr_recorded": {
      "description": "The data-plane point of no return has been passed: the write fence is lifted and exactly one PONR ledger row exists, content-bound to a real first Postgres production write and carrying a live Convex escape-hatch snapshot.",
      "seed_method": "cli",
      "records": [
        "1 row in data_plane_ponr created by bun services/platform/src/cli/holo.ts cutover:enable-writes --json (D07-04 surface)",
        "1 row in documents, the first accepted Postgres production write the PONR row is bound to",
        "convex_* snapshot columns populated on that row from the live frozen Convex deployment",
        "durable secrets: HOLO_MIGRATION_READ_ONLY flipped to '0'"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN a real read-only soak with zero accepted post-export writes and a pre-existing serving process WHEN the test drives cutover:rollback-drill --json THEN it asserts repointed:true and lost_accepted_writes:0 recomputed from raw evidence, and FAILS at the planning SHA on unknown verb.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN 3 real accepted post-export writes seeded through POST /api/documents plus writePostExportWriteAudit WHEN cutover:rollback-repoint --json runs THEN exit 2, POST_EXPORT_WRITE_ACCEPTED, acceptedCount 3, no HOLO_DATA_PLANE=convex written.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts -t 'three accepted post-export writes'"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN a recorded PONR WHEN cutover:rollback-repoint --json runs THEN exit 2 with POST_PONR_INELIGIBLE, distinct from POST_EXPORT_WRITE_ACCEPTED, with accepted_post_export_writes 0; RED at planning SHA.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN one PONR row WHEN UPDATE/DELETE are attempted as holocron_app and as owner THEN SQLSTATE 42501 and P0001 PONR_IMMUTABLE respectively, row count still 1; RED at planning SHA on missing relation.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-immutability.test.ts"
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN a recorded PONR WHEN cutover:enable-writes --json is re-run THEN already_recorded true, same ponr_id, PONR count 1, documents count unchanged.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'idempotent'"
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "description": "GIVEN a recorded PONR and all .tmp cutover artifacts deleted WHEN cutover:rollback-repoint --json runs THEN it still exits 2 with POST_PONR_INELIGIBLE, proving the latch is stronger than the fail-open POST_EXPORT_WRITE_ACCEPTED check.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'survives tmp deletion'"
    },
    {
      "id": "AC-7",
      "type": "acceptance_criterion",
      "description": "GIVEN the three new files WHEN the integration lane runs THEN at least 5 reason-specific failures plus exactly 1 pass are captured in .tmp/D07-01/red/full-run.log with a matching manifest.json.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts services/platform/tests/integration/sprint30-ponr-latch.test.ts services/platform/tests/integration/sprint30-ponr-immutability.test.ts 2>&1 | tee .tmp/D07-01/red/full-run.log"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "cutover:rollback-drill --json exits 2 with an unknown command banner when run at the planning SHA.",
      "maps_to_ac": "AC-1",
      "verify": "bun services/platform/src/cli/holo.ts cutover:rollback-drill --json; echo $?"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "The zero-loss test file asserts lost_accepted_writes === 0 recomputed from the raw audit file rather than read from the drill report.",
      "maps_to_ac": "AC-1",
      "verify": "grep -n 'lost_accepted_writes' services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "The zero-loss test asserts at least one acknowledgement with preexisting === true.",
      "maps_to_ac": "AC-1",
      "verify": "grep -n 'preexisting' services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "cutover:rollback-repoint --json reports precondition.accepted_post_export_writes === 3 when 3 real post-export writes are seeded.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts -t 'three accepted post-export writes'"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "The 3 seeded post-export write ids resolve to 3 real rows in the Postgres documents table.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts -t 'three accepted post-export writes'"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "The disposable secrets file contains no HOLO_DATA_PLANE value of convex after a POST_EXPORT_WRITE_ACCEPTED refusal.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts -t 'three accepted post-export writes'"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "The PONR latch test asserts error.code === 'POST_PONR_INELIGIBLE'.",
      "maps_to_ac": "AC-3",
      "verify": "grep -n 'POST_PONR_INELIGIBLE' services/platform/tests/integration/sprint30-ponr-latch.test.ts"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "The PONR latch test asserts the returned error code is not equal to POST_EXPORT_WRITE_ACCEPTED.",
      "maps_to_ac": "AC-3",
      "verify": "grep -n 'POST_EXPORT_WRITE_ACCEPTED' services/platform/tests/integration/sprint30-ponr-latch.test.ts"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "The PONR latch test asserts precondition.accepted_post_export_writes === 0 in the refused report.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "The immutability test asserts SQLSTATE 42501 for the holocron_app role UPDATE attempt.",
      "maps_to_ac": "AC-4",
      "verify": "grep -n '42501' services/platform/tests/integration/sprint30-ponr-immutability.test.ts"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": "The immutability test asserts SQLSTATE P0001 with a PONR_IMMUTABLE message for the owner-connection DELETE attempt.",
      "maps_to_ac": "AC-4",
      "verify": "grep -n 'PONR_IMMUTABLE' services/platform/tests/integration/sprint30-ponr-immutability.test.ts"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": "The immutability test asserts the PONR row count is exactly 1 after all four DML attempts.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-immutability.test.ts"
    },
    {
      "id": "TC-13",
      "type": "test_criterion",
      "description": "The idempotency test asserts the second cutover:enable-writes run returns the same ponr_id as the first.",
      "maps_to_ac": "AC-5",
      "verify": "grep -n 'ponr_id' services/platform/tests/integration/sprint30-ponr-latch.test.ts"
    },
    {
      "id": "TC-14",
      "type": "test_criterion",
      "description": "The idempotency test asserts the documents row count is unchanged across the re-run.",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'idempotent'"
    },
    {
      "id": "TC-15",
      "type": "test_criterion",
      "description": "The tmp-deletion test asserts error.code === 'POST_PONR_INELIGIBLE' after the post-export write audit file is removed.",
      "maps_to_ac": "AC-6",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'survives tmp deletion'"
    },
    {
      "id": "TC-16",
      "type": "test_criterion",
      "description": "The tmp-deletion test asserts the PONR row count is exactly 1 after all .tmp artifacts are deleted.",
      "maps_to_ac": "AC-6",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-ponr-latch.test.ts -t 'survives tmp deletion'"
    },
    {
      "id": "TC-17",
      "type": "test_criterion",
      "description": ".tmp/D07-01/red/full-run.log records at least 5 failing tests at the planning SHA.",
      "maps_to_ac": "AC-7",
      "verify": "grep -c 'FAIL' .tmp/D07-01/red/full-run.log"
    },
    {
      "id": "TC-18",
      "type": "test_criterion",
      "description": ".tmp/D07-01/red/full-run.log records exactly 1 passing test at the planning SHA.",
      "maps_to_ac": "AC-7",
      "verify": "grep -c 'passed' .tmp/D07-01/red/full-run.log"
    },
    {
      "id": "TC-19",
      "type": "test_criterion",
      "description": "No new test file imports vi.mock for postgres, node:fs, or the holo CLI module.",
      "maps_to_ac": "AC-7",
      "verify": "grep -n 'vi.mock' services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts services/platform/tests/integration/sprint30-ponr-latch.test.ts services/platform/tests/integration/sprint30-ponr-immutability.test.ts"
    }
  ]
}
-->
