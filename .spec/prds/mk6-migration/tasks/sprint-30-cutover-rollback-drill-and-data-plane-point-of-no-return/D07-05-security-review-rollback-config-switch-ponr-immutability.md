# D07-05: Security review: rollback config switch + PONR immutability
> Status: ✅ Completed
> Commit: d4039439e7c2a9f6fc9dfd9e70ee455788093c9e
> Reviewer: dual-lens
> Completed: 2026-08-07T07:36:03Z

> **Task ID:** D07-05
> **Sprint:** [Sprint 30 — Cutover Rollback Drill and Data-Plane PONR](./SPRINT.md)
> **Agent:** `security-reviewer`
> **Estimate:** 60 min
> **Type:** REVIEW
> **Priority:** P0 · **Effort:** M
> **Proposed By:** `security-auditor`
> **TDD_MODE:** `skipped` · **RED_GREEN_REQUIRED:** no
> Status: Backlog

**Capabilities:** CAP-CUT-01
**PRD refs:** UC-SYNC-04, T-SYNC-012, T-SYNC-013, T-SYNC-014

## Specification

**Objective.** Prove or disprove, against the real frozen Convex deployment, the real cutover CLI, and the real Postgres data_plane_ponr ledger, whether (A) the data-plane rollback config switch (cutover:rollback-repoint plus the underlying HOLO_DATA_PLANE / HOLO_MIGRATION_READ_ONLY control plane) is actually gated by any authorization mechanism, and whether (B) the PONR record D07-04 builds is genuinely immutable under adversarial DML/DDL, filesystem tampering, and code-path substitution — and file every finding with a proven, reproduced, concrete observation rather than an inference from source.

**Success state.** A written security review exists whose every claim traces to a captured, reproducible artifact: an api_response body from an unauthenticated Convex mutation call, stdout from a real holo CLI invocation, or a db_query result from a real Postgres connection. The five Convex write surfaces convex-planner identified are independently re-probed (not just cited), the rollback-repoint authorization gap is demonstrated by a successful unauthenticated CLI flip, the CONVEX_DEPLOY_KEY disarm path is documented by source enumeration without ever being executed, and the PONR ledger's immutability is stress-tested past what D07-04's own AC-2 covers (including a TRUNCATE probe D07-04's design does not address) and past .tmp-artifact tampering, with every outcome — whether the system held or broke — recorded verbatim.

## Critical Constraints

- **MUST** — MUST prove every finding except AC-7 by directly invoking the real vulnerable surface (Convex mutation via createCutoverConvexClient(), the real holo CLI verb, or a real SQL statement over a live Postgres connection) and capturing the literal observed response — never assert from reading source alone.
- **MUST** — MUST tag every row seeded on the frozen Convex deployment during probing with the literal prefix s30-sec-probe and remove/cancel it after capture (AC-2's disableAndDrain probe may serve as the cleanup mechanism for AC-1's seeded tasks since it patches status to cancelled).
- **MUST** — MUST run AC-8 and AC-9 only after D07-04's migration 0030 and cutover:enable-writes have produced a real data_plane_ponr row; do not simulate the PONR row or its immutability guarantees.
- **MUST** — MUST record the OBSERVED outcome of the TRUNCATE probe in AC-8 verbatim regardless of which way it goes — the migration 0030 design in this sprint specifies only a BEFORE UPDATE OR DELETE FOR EACH ROW trigger, which PostgreSQL does not fire on TRUNCATE, so the outcome is genuinely unknown until probed.
- **NEVER** — NEVER run npx convex env unset HOLO_MIGRATION_READ_ONLY (or any other command that disarms the fence) against the frozen production deployment as part of this review; AC-7 is proven entirely by static call-site enumeration (isMigrationReadOnly's per-invocation env read, audit.ts's exactly-2 insert call sites, convexEnv()'s sole-wrapper status).
- **NEVER** — NEVER modify services/platform/src/cutover/**, convex/**, any migration file, or services/platform/src/cli/holo.ts; this task writes no production code, only a new probe test file and a disposable findings artifact.
- **NEVER** — NEVER cite verify:convex-fence-coverage matches:[] as evidence the frozen deployment is safe without independently enumerating and probing the five migrationFence/** exempt mutations (AC-4).
- **STRICTLY** — STRICTLY record the observed outcome of every probe verbatim, including when a probe unexpectedly fails to reproduce the vulnerability (e.g. a prior remediation already closed it) — never pre-assert the expected result in the written finding.
- **STRICTLY** — STRICTLY keep every probe's blast radius minimal and reversible: seedInFlightForDrainTest capped at 5 rows, forged audit rows tagged for identification, no attempt to actually reach 500-row ceilings or to disarm the durable write fence.

## Acceptance Criteria

#### AC-1 (PRIMARY)

- **GIVEN** GIVEN fixture frozen_soak_deployment with HOLO_MIGRATION_READ_ONLY confirmed as '1'
- **WHEN** WHEN the reviewer invokes api.migrationFence.drain.seedInFlightForDrainTest({activeTasks: 5, queuedSubscriptionContent: 0, tag: 's30-sec-probe'}) via createCutoverConvexClient() with no authentication token, API key, or Convex identity supplied
- **THEN** THEN the mutation succeeds and inserts real rows into the frozen production database, and the review records the observed outcome verbatim, classifying the T-SYNC-012 claim that ALL production writes are blocked as FALSE with severity CRITICAL if the mutation returns ok:true

`test_tier: e2e` · `service: convex` · `flow_ref: T-SYNC-012`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-1 seedInFlightForDrainTest unauthenticated'`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** api_response (capture required: True)
- **Case 0** — start_ref `frozen_soak_deployment`
    - action: Call getMigrationReadOnlyEnv() and confirm it returns the literal '1' before probing
    - action: Instantiate createCutoverConvexClient() with no auth token or API key configured
    - action: Invoke api.migrationFence.drain.seedInFlightForDrainTest({activeTasks: 5, queuedSubscriptionContent: 0, tag: 's30-sec-probe'}) as an unauthenticated caller
    - action: Record the exact response body verbatim
    - action: Locate and cancel/remove the 5 tagged 's30-sec-probe' tasks rows created by the probe
    - MUST observe: response.ok === true
    - MUST observe: response.taskIds.length === 5
    - MUST observe: response.activeTasks === 5
    - MUST observe: the finding classifies the "all production writes blocked" claim in T-SYNC-012 as FALSE with severity CRITICAL
    - MUST observe: getMigrationReadOnlyEnv() still returns '1' at the moment of the successful write, proving the fence was armed and bypassed rather than merely disarmed
    - MUST NOT observe: response.ok === false or an authorization/permission error in the response
    - MUST NOT observe: a 401 or 403 status blocking the mutation
    - MUST NOT observe: 0 taskIds inserted, proving the mutation was rejected
    - MUST NOT observe: the finding being downgraded to LOW or informational severity

</details>

#### AC-2

- **GIVEN** GIVEN fixture frozen_soak_deployment with HOLO_CUTOVER_SCHEDULES_DISABLED armed
- **WHEN** WHEN the reviewer invokes api.migrationFence.drain.disableAndDrain({surfaces: ['tasks','subscriptionContent'], reason: 's30-sec-probe-drain'}) with no authentication token, API key, or Convex identity
- **THEN** THEN the mass-patch mutation executes against real production tasks/subscriptionContent rows with no authorization check performed anywhere in the call path, and the review records that isCutoverSchedulesDisabled() is an availability guard, not an authorization guard

`test_tier: integration` · `service: convex` · `flow_ref: T-SYNC-012`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-2 disableAndDrain unauthenticated'`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** api_response (capture required: True)
- **Case 0** — start_ref `frozen_soak_deployment`
    - action: Confirm CUTOVER_SCHEDULES_DISABLED_ENV is armed via a scheduleDisableStatus() query returning disabled: true
    - action: Call api.migrationFence.drain.disableAndDrain({surfaces: ['tasks','subscriptionContent'], reason: 's30-sec-probe-drain'}) as an unauthenticated caller
    - action: Record response.ok, response.consumersHonored, and response.samples.tasksCancelled verbatim
    - action: Confirm no authorization header, API key, or Convex auth identity was supplied or required anywhere in the call
    - MUST observe: response.ok === true
    - MUST observe: response.consumersHonored === true
    - MUST observe: response.samples.tasksCancelled is an integer >= 0, patched with no authorization check performed
    - MUST observe: the finding records that isCutoverSchedulesDisabled() (convex/lib/migrationFence.ts:49-52) is an AVAILABILITY guard, not an authorization guard
    - MUST NOT observe: an authorization error such as 401 or 403 blocking the call
    - MUST NOT observe: 0 rows patched despite active tasks existing, which would mean the surface is not actually reachable
    - MUST NOT observe: any API key, bearer token, or Convex auth identity being required to invoke the mutation

</details>

#### AC-3

- **GIVEN** GIVEN fixture frozen_soak_deployment with export_watermark_ms = W read from .tmp/D06-04/watermark-report.json via loadExportWatermarkMs()
- **WHEN** WHEN the reviewer calls api.migrationFence.audit.recordWriteAttempt({outcome: 'accepted', surface: 's30-sec-probe-forged', atMs: W + 1000}) with no authentication, then queries api.migrationFence.audit.countAttemptsInWindow({sinceMs: W})
- **THEN** THEN acceptedWriteCount increases by exactly 1 attributable to the forged row, proving the same oracle formula that gates runQuietCheck's writeOraclesOk (convex-fence-client.ts:1181-1182) and the T-SYNC-013 zero-loss claim is forgeable by anyone holding the deployment URL

`test_tier: integration` · `service: convex` · `flow_ref: T-SYNC-013`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-3 recordWriteAttempt forgery'`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** api_response (capture required: True)
- **Case 0** — start_ref `frozen_soak_deployment`
    - action: Read export_watermark_ms = W from .tmp/D06-04/watermark-report.json via loadExportWatermarkMs()
    - action: Query api.migrationFence.audit.countAttemptsInWindow({sinceMs: W}) and record the baseline acceptedWriteCount
    - action: Call api.migrationFence.audit.recordWriteAttempt({outcome: 'accepted', surface: 's30-sec-probe-forged', atMs: W + 1000}) as an unauthenticated caller
    - action: Re-query api.migrationFence.audit.countAttemptsInWindow({sinceMs: W}) and compare acceptedWriteCount to the baseline
    - MUST observe: the second countAttemptsInWindow call returns acceptedWriteCount equal to baseline + 1
    - MUST observe: the forged row's kind === 'write_attempt' and outcome === 'accepted' as read back from migrationFenceAudit
    - MUST observe: the finding records that this same oracle formula (acceptedWriteCount === 0 && rejectedWriteCount > 0) gates runQuietCheck's writeOraclesOk at convex-fence-client.ts:1181-1182
    - MUST NOT observe: acceptedWriteCount unchanged from baseline after the forged call, which would mean the mutation was rejected
    - MUST NOT observe: an authorization error blocking recordWriteAttempt
    - MUST NOT observe: 0 change in acceptedWriteCount

</details>

#### AC-4

- **GIVEN** GIVEN the frozen deployment's Convex source tree
- **WHEN** WHEN the reviewer runs bun services/platform/src/cli/holo.ts verify:convex-fence-coverage --json and independently greps convex-fence-client.ts for the migrationFence/** exemption
- **THEN** THEN the report returns matches: [] with files_scanned > 0 while the exemption at convex-fence-client.ts:1233-1234 structurally excludes lib/migrationFence.ts and migrationFence/**, and the review enumerates all 5 exempt public mutations by name with an explicit disposition for each rather than citing matches:[] alone

`test_tier: integration` · `service: cli` · `flow_ref: T-SYNC-012`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-4 fence coverage blind spot'`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** stdout (capture required: True)
- **Case 0** — start_ref `frozen_soak_deployment`
    - action: Run bun services/platform/src/cli/holo.ts verify:convex-fence-coverage --json and capture stdout
    - action: Parse the JSON and record matches.length and files_scanned
    - action: grep -n "rel.startsWith('migrationFence/')" services/platform/src/cutover/convex-fence-client.ts and capture the matching line number
    - action: Enumerate the 5 unfenced public mutations by name with an explicit disposition for each: recordFenceArmed, recordWriteAttempt, disableAndDrain, probeScheduleConsumer, seedInFlightForDrainTest
    - MUST observe: matches.length === 0 and files_scanned > 0
    - MUST observe: the grep for "migrationFence/" in convex-fence-client.ts returns at least 1 matching line, confirming the structural exemption
    - MUST observe: the written finding lists all 5 mutation names verbatim: recordFenceArmed, recordWriteAttempt, disableAndDrain, probeScheduleConsumer, seedInFlightForDrainTest
    - MUST observe: each of the 5 mutations carries an explicit disposition string in the finding
    - MUST NOT observe: a finding that cites matches.length === 0 alone as evidence the deployment is frozen
    - MUST NOT observe: 0 named exempt mutations in the written finding
    - MUST NOT observe: the grep for the exemption returning no matches, which would mean the exemption code moved and this AC's line reference is stale

</details>

#### AC-5

- **GIVEN** GIVEN the frozen deployment's /article/:shareToken httpAction wrapped by fencedHttpAction
- **WHEN** WHEN the reviewer issues a real HTTP GET to CONVEX_SITE/article/<seeded shareToken> and reads convex/http.ts and convex/lib/migrationFence.ts:178-193
- **THEN** THEN the GET succeeds read-only today, but the code confirms the exact bypass condition (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') so any FUTURE GET/HEAD/OPTIONS route calling ctx.runMutation would silently bypass assertMigrationWritable, and the review files this as a standing constraint

`test_tier: integration` · `service: convex` · `flow_ref: UC-SYNC-04`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-5 fencedHttpAction GET bypass'`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** api_response (capture required: True)
- **Case 0** — start_ref `frozen_soak_deployment`
    - action: GET CONVEX_SITE/article/<seeded shareToken> and record HTTP status and Content-Type
    - action: grep -c 'ctx.runMutation' convex/http.ts and confirm the count for the GET-serving article route handler
    - action: Read convex/lib/migrationFence.ts lines 178-193 (fencedHttpAction) and confirm the exact bypass condition text
    - action: Record the standing constraint into the finding
    - MUST observe: GET /article/<shareToken> returns HTTP status 200 with Content-Type: text/html
    - MUST observe: grep -c 'ctx.runMutation' convex/http.ts returns 0 for the GET-serving article route handler
    - MUST observe: convex/lib/migrationFence.ts contains the literal condition `method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS'` bypassing assertMigrationWritable for those 3 methods
    - MUST observe: the finding records the standing constraint verbatim: "any future GET/HEAD/OPTIONS httpAction must not call ctx.runMutation"
    - MUST NOT observe: GET /article/ returning a 423 migration_read_only response, which would mean read routes are also blocked
    - MUST NOT observe: any ctx.runMutation call found in the GET-serving route (count > 0)
    - MUST NOT observe: no standing constraint recorded in the finding

</details>

#### AC-6

- **GIVEN** GIVEN fixture disposable_soak_stack with a valid export watermark and zero accepted post-export writes
- **WHEN** WHEN an operator with only local filesystem and CLI access (no application login, no API key, no Convex credential) runs bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json
- **THEN** THEN the command succeeds (repointed === true, stderr authorization/permission/credential match count === 0) writing HOLO_DATA_PLANE=convex to the durable secrets file with no authorization prompt, credential check, or approval gate anywhere in the call path, and a direct plain-text edit of secrets.yaml is observed identically by the runtime

`test_tier: integration` · `service: cli` · `flow_ref: T-SYNC-013`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-6 rollback-repoint no authorization'`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** stdout (capture required: True)
- **Case 0** — start_ref `disposable_soak_stack`
    - action: grep -c 'authoriz\|permission\|credential\|apiKey\|requireAuth' services/platform/src/cutover/rollback-repoint.ts and record the match count
    - action: Run bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json against the disposable secrets path with a valid watermark and zero accepted writes, with no auth env vars set beyond DATABASE_URL
    - action: Independently write HOLO_DATA_PLANE: "convex" directly into the disposable secrets.yaml with a plain text editor (no CLI at all) and confirm readDurableDataPlane() observes the same value
    - action: Record the exit code, stderr, and repointed value from the CLI run, and count stderr matches for /authoriz|permission|credential/
    - MUST observe: grep count for authorization/permission/credential tokens in rollback-repoint.ts equals 0
    - MUST observe: repointed === true
    - MUST observe: stderr match count for /authoriz|permission|credential/ across the CLI run's output equals 0
    - MUST observe: direct edit of secrets.yaml with HOLO_DATA_PLANE: "convex" is observed identically by readDurableDataPlane(), proving filesystem write access alone is sufficient
    - MUST observe: the finding names resolveSecretsPathFromEnv() (services/platform/src/config/secrets.ts:82-92) as the sole gate
    - MUST NOT observe: any authorization or credential check rejecting the CLI run
    - MUST NOT observe: a difference in observed HOLO_DATA_PLANE between the CLI-driven write and the direct file edit
    - MUST NOT observe: the review concluding no authorization gap exists

</details>

#### AC-7

- **GIVEN** GIVEN the fence armed via HOLO_MIGRATION_READ_ONLY set through npx convex env set under CONVEX_DEPLOY_KEY
- **WHEN** WHEN the reviewer inventories the disarm path by static source enumeration WITHOUT ever executing env unset against the live production deployment
- **THEN** THEN the review confirms isMigrationReadOnly() is a per-invocation process.env read with no caching, that convexEnv() is the sole wrapper shelling out to npx convex env, and that audit.ts contains exactly 2 ctx.db.insert call sites, neither reachable from the env set/unset CLI path — so disarming the fence via CONVEX_DEPLOY_KEY produces no Convex-side record, recorded in findings.json with credentials: ['CONVEX_DEPLOY_KEY']

`test_tier: integration` · `service: cli` · `flow_ref: UC-SYNC-04`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-7 CONVEX_DEPLOY_KEY disarm inventory'`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** stdout (capture required: True)
- **Case 0** — start_ref `frozen_soak_deployment`
    - action: grep -n "process.env\[MIGRATION_READ_ONLY_ENV\]" convex/lib/migrationFence.ts and confirm it is read inside isMigrationReadOnly() with no module-level cache variable
    - action: grep -c 'ctx.db.insert' convex/migrationFence/audit.ts and record the count
    - action: grep -rn 'convexEnv(' services/platform/src/cutover/convex-fence-client.ts and confirm convexEnv is the sole wrapper around npx convex env get|set|unset
    - action: grep -c 'CONVEX_DEPLOY_KEY' services/platform/src/config/verify-no-convex-env.ts and confirm it is named as a scoped/banned credential literal
    - action: Confirm by code reading that no path calls recordFenceArmed or recordWriteAttempt from the env set/unset flow
    - action: Write .tmp/D07-05/findings.json entry id 'convex-deploy-key-disarm-no-tamper-record' with field credentials: ['CONVEX_DEPLOY_KEY'] and the grep counts captured above
    - MUST observe: isMigrationReadOnly() reads process.env['HOLO_MIGRATION_READ_ONLY'] fresh on every call with 0 module-level cache variables
    - MUST observe: grep -c 'ctx.db.insert' convex/migrationFence/audit.ts returns exactly 2
    - MUST observe: convexEnv() at convex-fence-client.ts is confirmed as the only spawnSync wrapper around `npx convex env`
    - MUST observe: findings.json entry id 'convex-deploy-key-disarm-no-tamper-record' has field credentials deep-equal to ['CONVEX_DEPLOY_KEY']
    - MUST observe: grep -c 'CONVEX_DEPLOY_KEY' services/platform/src/config/verify-no-convex-env.ts >= 1
    - MUST NOT observe: a third ctx.db.insert call site in audit.ts wired to the env unset path
    - MUST NOT observe: any evidence that recordFenceArmed or recordWriteAttempt is invoked by the env unset flow
    - MUST NOT observe: 0 Convex mutations invoked as part of npx convex env unset — confirmed by code inspection, not by executing the unset against production

</details>

#### AC-8

- **GIVEN** GIVEN fixture ponr_recorded_row, one real data_plane_ponr row produced by D07-04
- **WHEN** WHEN the reviewer attempts UPDATE and DELETE as holocron_app and as the owner/migration connection, then additionally attempts TRUNCATE TABLE data_plane_ponr on the owner/migration connection — an attack vector NOT covered by a row-level BEFORE UPDATE OR DELETE trigger, since PostgreSQL does not fire per-row triggers on TRUNCATE
- **THEN** THEN the review records the observed outcome of every attempt verbatim in findings.json, including whichever way the TRUNCATE attempt actually goes (severity CRITICAL if it succeeds, INFO if it is rejected), because migration 0030's own design specifies only the row-level trigger and does not claim TRUNCATE protection

`test_tier: integration` · `service: postgres` · `flow_ref: T-SYNC-014`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-8 PONR immutability adversarial re-probe'`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** db_query (capture required: True)
- **Case 0** — start_ref `ponr_recorded_row`
    - action: Capture the row's id and write_row_digest_sha256 on the owner connection before any DML attempt
    - action: Open the app-role connection via toAppRoleDatabaseUrl(DATABASE_URL); attempt UPDATE and DELETE; capture err.code for both
    - action: On the owner/migration connection, attempt UPDATE and DELETE; capture err.code and err.message for both
    - action: On the owner/migration connection, attempt TRUNCATE TABLE data_plane_ponr; capture the outcome (success plus resulting row count, or err.code/err.message)
    - action: Re-SELECT count(*) FROM data_plane_ponr and compare against the pre-TRUNCATE-attempt count of 1
    - action: Write .tmp/D07-05/findings.json entry id 'ponr-truncate-bypass-probe' with fields truncate_succeeded (boolean), severity ('CRITICAL' if truncate_succeeded else 'INFO'), and ponr_truncate_probe.result (the captured SQLSTATE, or the literal 'none' if the TRUNCATE succeeded)
    - MUST observe: app-role UPDATE raises SQLSTATE 42501 and app-role DELETE raises SQLSTATE 42501
    - MUST observe: owner UPDATE and DELETE both raise SQLSTATE P0001 with message containing the literal 'PONR_IMMUTABLE'
    - MUST observe: post-TRUNCATE SELECT count(*) FROM data_plane_ponr is recorded as either 0 (TRUNCATE succeeded) or 1 (TRUNCATE rejected), with the captured SQLSTATE (or 'none' if it succeeded) written to findings.json field ponr_truncate_probe.result
    - MUST observe: findings.json contains an entry with id 'ponr-truncate-bypass-probe' and field truncate_succeeded === true or truncate_succeeded === false
    - MUST observe: findings.json entry 'ponr-truncate-bypass-probe'.severity === 'CRITICAL' when truncate_succeeded === true, and severity === 'INFO' when truncate_succeeded === false
    - MUST NOT observe: the review skipping the TRUNCATE attempt because UPDATE/DELETE were already blocked
    - MUST NOT observe: a TRUNCATE result being assumed in the finding rather than empirically observed
    - MUST NOT observe: SELECT count(*) FROM data_plane_ponr being left unchecked after the TRUNCATE attempt (no post-attempt count of 0 or 1 recorded)

</details>

#### AC-9

- **GIVEN** GIVEN fixture ponr_recorded_row, one real PONR row exists
- **WHEN** WHEN the reviewer deletes every .tmp cutover artifact (post-export write audit, data-plane config mirror, rollback-repoint report, enable-writes report) and additionally fabricates .tmp/D06-05/data-plane-config.json to claim a prior successful rollback (data_plane: 'convex', a past repointed_at)
- **THEN** THEN bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json still exits 2 with error.code === 'POST_PONR_INELIGIBLE' (never POST_EXPORT_WRITE_ACCEPTED) on both the post-deletion run and a subsequent run after the audit is rewritten to zero accepted writes, proving the latch's source of truth is the Postgres SELECT, not any audited .tmp file

`test_tier: integration` · `service: cli` · `flow_ref: T-SYNC-014`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-9 PONR latch tmp tamper resistance'`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** stdout (capture required: True)
- **Case 0** — start_ref `ponr_recorded_row`
    - action: Confirm SELECT count(*) FROM data_plane_ponr is 1
    - action: Delete .tmp/D06-05/post-export-write-audit.json, .tmp/D06-05/data-plane-config.json, .tmp/D06-05/rollback-repoint-report.json, and .tmp/D07-04/enable-writes-report.json
    - action: Fabricate a false prior success by writing .tmp/D06-05/data-plane-config.json with data_plane: 'convex' and a past repointed_at timestamp
    - action: Run bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json and capture exit code plus parsed JSON
    - action: Rewrite the audit file with accepted_writes: [] and run it a second time, capturing exit code plus parsed JSON again
    - MUST observe: both runs exit with code 2
    - MUST observe: error.code === 'POST_PONR_INELIGIBLE' on both runs, never 'POST_EXPORT_WRITE_ACCEPTED'
    - MUST observe: repointed === false on both runs despite the fabricated data-plane-config.json claiming a prior 'convex' repoint
    - MUST observe: SELECT count(*) FROM data_plane_ponr remains exactly 1 after both runs
    - MUST NOT observe: either run exiting 0 or reporting repointed: true
    - MUST NOT observe: the durable secrets file gaining a HOLO_DATA_PLANE: convex value from either run
    - MUST NOT observe: 0 difference detected between the pre-PONR fail-open behavior (POST_EXPORT_WRITE_ACCEPTED falls open when its .tmp file is deleted) and the PONR latch's behavior, which the finding must explicitly contrast

</details>

## Test Criteria

| ID | Boolean statement | Maps to | Verify |
|----|-------------------|---------|--------|
| TC-1 | seedInFlightForDrainTest response ok equals true when invoked unauthenticated against the frozen deployment. | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-1 seedInFlightForDrainTest unauthenticated'` |
| TC-2 | seedInFlightForDrainTest response taskIds length equals 5 when activeTasks is 5. | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-1 seedInFlightForDrainTest unauthenticated'` |
| TC-3 | disableAndDrain executes without an authorization error when called unauthenticated. | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-2 disableAndDrain unauthenticated'` |
| TC-4 | disableAndDrain consumersHonored equals true when HOLO_CUTOVER_SCHEDULES_DISABLED is armed. | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-2 disableAndDrain unauthenticated'` |
| TC-5 | countAttemptsInWindow acceptedWriteCount increases by exactly 1 when a forged recordWriteAttempt row is inserted. | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-3 recordWriteAttempt forgery'` |
| TC-6 | The forged migrationFenceAudit row outcome equals accepted when read back after recordWriteAttempt. | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-3 recordWriteAttempt forgery'` |
| TC-7 | verify:convex-fence-coverage matches array length equals 0 when run against the frozen deployment source. | AC-4 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-4 fence coverage blind spot'` |
| TC-8 | The written finding names 5 exempt mutations when the fence coverage exemption is documented. | AC-4 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-4 fence coverage blind spot'` |
| TC-9 | GET /article/ returns HTTP status 200 when the fence is armed. | AC-5 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-5 fencedHttpAction GET bypass'` |
| TC-10 | convex/http.ts contains 0 ctx.runMutation calls in the article GET handler when scanned by grep. | AC-5 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-5 fencedHttpAction GET bypass'` |
| TC-11 | cutover:rollback-repoint reports repointed equals true when run with no authorization credential present. | AC-6 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-6 rollback-repoint no authorization'` |
| TC-12 | rollback-repoint.ts contains 0 authorization or credential check tokens when scanned by grep. | AC-6 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-6 rollback-repoint no authorization'` |
| TC-13 | isMigrationReadOnly reads process.env directly on every call with 0 cached module-level variables. | AC-7 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-7 CONVEX_DEPLOY_KEY disarm inventory'` |
| TC-14 | convex/migrationFence/audit.ts contains exactly 2 ctx.db.insert call sites when scanned by grep. | AC-7 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-7 CONVEX_DEPLOY_KEY disarm inventory'` |
| TC-15 | App-role UPDATE on data_plane_ponr raises SQLSTATE 42501 when attempted after the PONR row is recorded. | AC-8 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-8 PONR immutability adversarial re-probe'` |
| TC-16 | TRUNCATE TABLE data_plane_ponr on the owner connection produces a recorded observed outcome when attempted. | AC-8 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-8 PONR immutability adversarial re-probe'` |
| TC-17 | cutover:rollback-repoint exit code equals 2 when the PONR row exists after all tmp cutover artifacts are deleted. | AC-9 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-9 PONR latch tmp tamper resistance'` |
| TC-18 | cutover:rollback-repoint error code equals POST_PONR_INELIGIBLE when a fabricated data-plane-config.json claims a prior successful repoint. | AC-9 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-9 PONR latch tmp tamper resistance'` |

## Fixtures (shared seed data)

- **`frozen_soak_deployment`** — The real Convex deployment armed by Sprint 29's cutover:freeze, reachable via convexUrl() (EXPO_PUBLIC_CONVEX_URL / VITE_CONVEX_HTTP_URL / CONVEX_URL), with HOLO_MIGRATION_READ_ONLY confirmed as '1' via getMigrationReadOnlyEnv() and HOLO_CUTOVER_SCHEDULES_DISABLED confirmed armed via scheduleDisableStatus() — both recorded in .tmp/D06-03/freeze-report.json and .tmp/D06-03/quiet-check-report.json from Sprint 29. This review reads and probes it; it never re-arms or re-freezes it.  
  seed_method: `recorded_external`
    - Convex deployment reachable at convexUrl() with the fence armed by the real Sprint 29 cutover:freeze run
    - HOLO_CUTOVER_SCHEDULES_DISABLED value visible as armed in the live Convex runtime per scheduleDisableStatus query
    - at least 1 pre-existing document reachable via api.documents.queries.count for reachability sanity-check before probing
- **`disposable_soak_stack`** — A disposable local control plane for CLI-level authorization probing, independent of the live Convex deployment: a real secrets file, a real export-watermark report, and a post-export-write-audit ledger reporting zero accepted writes.  
  seed_method: `cli`
    - file: .tmp/D07-05/secrets.yaml created via upsertSecretsFile() with no HOLO_DATA_PLANE key present, and no CONVEX_DEPLOY_KEY / API key / auth token set in its environment
    - file: watermark report with a concrete watermarkAtMs consumed by loadExportWatermarkMs()
    - file: .tmp/D07-05/post-export-write-audit.json with accepted_writes: [] and export_watermark_ms set to the same watermarkAtMs
- **`ponr_recorded_row`** — The single real data_plane_ponr row produced by D07-04's cutover:enable-writes run against a disposable soak stack, embedding a live Convex escape-hatch snapshot. This review does not create it; it reads and attacks the row D07-04 produced.  
  seed_method: `cli`
    - 1 row in data_plane_ponr created via bun services/platform/src/cli/holo.ts cutover:enable-writes --json (D07-04)
    - roles holocron_app (least-privilege) and the owner/migration connection both resolvable via toAppRoleDatabaseUrl(DATABASE_URL) and DATABASE_URL respectively

## Reading List

- `services/platform/src/cutover/rollback-repoint.ts` — lines 1-46,468-799 — runRollbackRepoint has zero authorization check anywhere; secretsPath resolved via resolveSecretsPathFromEnv with no credential gate.
- `services/platform/src/config/secrets.ts` — lines 82-92 — resolveSecretsPathFromEnv precedence — HOLO_SECRETS_PATH/HOLOCRON_SECRETS_PATH/SECRETS_PATH/default, no auth.
- `services/platform/src/config/verify-no-convex-env.ts` — lines 15-19 — CONVEX_DEPLOY_KEY assembled as a banned literal token, confirming its identity as the Convex-side credential.
- `services/platform/src/cli/holo.ts` — lines 3384-3434 — cutover:rollback-repoint CLI case — flag parsing straight into runRollbackRepoint, no auth middleware.
- `services/platform/src/cli/holo.ts` — lines 3547-3561 — verify:convex-fence-coverage CLI case — local source scan only, no live Convex I/O.
- `convex/lib/migrationFence.ts` — lines 1-213 — isMigrationReadOnly per-invocation env read (40-43); fencedHttpAction GET/HEAD/OPTIONS passthrough (178-193).
- `convex/migrationFence/audit.ts` — lines 1-101 — recordFenceArmed/recordWriteAttempt/latestFenceArmed/countAttemptsInWindow — public, unfenced, exactly 2 insert call sites.
- `convex/migrationFence/drain.ts` — lines 213-271,455-521 — disableAndDrain's availability-only guard; seedInFlightForDrainTest's unauthenticated 500-row ceiling.
- `services/platform/src/cutover/convex-fence-client.ts` — lines 237-298,1221-1270 — convexUrl/convexEnv/getMigrationReadOnlyEnv; verifyConvexFenceCoverage's migrationFence/** exemption at 1233-1234.
- `convex/http.ts` — lines 14-57 — The /article/ GET route — confirm it performs ctx.runQuery only, never ctx.runMutation.
- `tests/integration/service/immutability-dml-rejected.test.ts` — lines 1-100 — In-repo precedent for app-role vs owner DML-rejection probing; reuse toAppRoleDatabaseUrl pattern for AC-8.
- `.spec/prds/mk6-migration/10-technical-requirements/08-technical-risks.md` — lines 28 — R16 verbatim: first enabled Postgres write is the data-plane point of no return; recovery is restore, never Convex rollback.

## Guardrails

**WRITE-ALLOWED**

- `services/platform/tests/integration/sprint30-security-review.test.ts (NEW) - the probe suite implementing AC-1 through AC-9`
- `.tmp/D07-05/findings.json (NEW) - structured security findings report, an audit artifact only, never a latch input`

**WRITE-PROHIBITED**

- convex/** - probes invoke real deployed mutations at runtime but this task modifies no Convex source
- services/platform/src/cutover/** - read/probe-only; any remediation is a separate implementation task
- services/platform/src/cli/holo.ts - read/probe-only
- services/platform/src/db/migrations/** - the PONR migration belongs to D07-04; this task probes the landed result only
- .spec/** - PRD and task specs are upstream and read-only for this task

## Code Pattern / Design

- **Reference:** UC-SYNC-04, the rollback plan and its eligibility boundary
- **Reference:** T-SYNC-012/013/014, the three human-gate rows this review's findings inform
- **Reference:** R16 (08-technical-risks.md:28), the PONR framing this review stress-tests
- **Pattern:** Adversarial probe-and-record security review that reuses existing real Convex/CLI/Postgres surfaces; every finding is proven by directly invoking the vulnerable surface and capturing the literal response, never asserted from reading source alone (except the one credential-disarm finding that would itself be destructive to execute).
- **Pattern source:** `tests/integration/service/immutability-dml-rejected.test.ts:1-100 (app-role vs owner DML-rejection harness pattern, reused for AC-8)`
- **Anti-pattern:** Citing verify:convex-fence-coverage matches:[] as a frozen-deployment attestation without probing the exempted surfaces directly; assuming TRUNCATE is blocked by a row-level trigger without executing it; disarming the live production fence via CONVEX_DEPLOY_KEY as part of 'proving' the finding; leaving seeded probe rows unlabeled/uncleaned on the frozen deployment.
- AC-1/AC-2/AC-3 are live probes against the real frozen Convex deployment via createCutoverConvexClient() with no auth configured — the absence of any credential IS the test.
- AC-4/AC-5 combine a real CLI/HTTP probe with source-line confirmation, because the vulnerability is structural (an exemption in the scanner, a method-based bypass) rather than a single runtime observation.
- AC-6 pairs a CLI-driven write with an independent direct file edit to prove the two are indistinguishable to the runtime — the actual security boundary is the filesystem, not the CLI.
- AC-7 is the one review finding proven by static enumeration only, by design, because the live probe would be the vulnerability itself (disarming production).
- AC-8's TRUNCATE probe is the review's original contribution beyond D07-04's own AC-2: PostgreSQL's BEFORE UPDATE OR DELETE FOR EACH ROW trigger does not fire on TRUNCATE, and migration 0030's design (mastra.json) does not specify a BEFORE TRUNCATE STATEMENT trigger, so this is a real, currently-unverified gap.
- AC-9 extends D07-04's own AC-7 (tmp deletion) with an adversarial fabrication case (writing a false prior-success config) that D07-04's own oracle set does not cover.

## Verification Gates

| Gate | Command | Expected |
|------|---------|----------|
| Security probe suite (all 9 ACs) | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts` | Exit 0, every probe's OBSERVED outcome captured in .tmp/D07-05/findings.json regardless of pass/fail semantics |
| Lint | `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/tests/integration/sprint30-security-review.test.ts` | Exit 0 |
| Typecheck | `pnpm tsgo --noEmit` | Exit 0 |
| No fence-disarm executed | `grep -c "convex env unset" services/platform/tests/integration/sprint30-security-review.test.ts` | Exit 1 (zero matches — AC-7 must never shell out to disarm the live fence) |
| No production code touched | `git diff --name-only -- services/platform/src convex` | Exit 0 with empty output |

## Agent Assignment

- **Agent:** `security-reviewer`
- **Rationale:** This task audits authorization and immutability guarantees across two real systems (the frozen Convex deployment's write surfaces and the Postgres PONR ledger) and must prove every finding by directly invoking the vulnerable surface, not by reading source alone. security-reviewer owns OWASP-style probe-and-record review discipline and STRIDE framing; it writes no production code (REVIEW/skipped) but every AC still carries requires_seeded_evidence:true.

## Coding Standards

- TypeScript strict; export explicit types for every captured probe response and the findings report shape.
- Every probe writes its literal observed response into .tmp/D07-05/findings.json before any assertion, so a failed assertion still leaves the evidence on disk.
- No any; parameterize every SQL statement in AC-8/AC-9 through the postgres template tag, never string-concatenate the row id or table name.
- Tag every Convex row created by a probe with the literal prefix s30-sec-probe so cleanup and later audits can identify review artifacts unambiguously.

## Dependencies

- **Depends on:** D07-01, D07-03, D07-04
- **Blocks:** None

## Cross-Specialist Enrichments

### From `convex-planner`

- CONVEX-SIDE ATTACK SURFACE #1 (highest severity) — migrationFence.drain.seedInFlightForDrainTest (convex/migrationFence/drain.ts:460-521) is a PUBLIC, UNAUTHENTICATED, UNFENCED mutation deployed to the production Convex deployment. Its own docstring calls it a 'PLATFORM_IT seed helper' and states it is 'Intentionally unfenced ... so seeds work under HOLO_MIGRATION_READ_ONLY'. Anyone holding the deployment URL can insert up to 500 tasks rows, 500 subscriptionContent rows and a subscriptionSources row into the frozen production database. This single surface falsifies the 'frozen' claim outright and can silently diverge the rollback target from the export watermark. It does not touch documents, so a documents.count-only oracle would NOT detect it. The security review must recommend removing or auth-gating this mutation before the soak, or extending the D07-02 divergence oracle to cover tasks and subscriptionContent residual counts.
- ATTACK SURFACE #2 — migrationFence.drain.disableAndDrain (drain.ts:213-453) is public and unfenced and performs DESTRUCTIVE writes: it patches every tasks row in pending/queued/loading/running to status 'cancelled' with an error message (drain.ts:169-188) and every queued subscriptionContent row to researchStatus 'skipped' (drain.ts:190-200). It is guarded only by isCutoverSchedulesDisabled() reading HOLO_CUTOVER_SCHEDULES_DISABLED (drain.ts:252-271) — an availability guard, not an authorization one. While that env flag is set (which it is, throughout the soak), any caller can drive mass state mutation of the frozen deployment.
- ATTACK SURFACE #3 — migrationFence.audit.recordFenceArmed and recordWriteAttempt (convex/migrationFence/audit.ts:12-47) are public unfenced mutations that insert arbitrary rows into migrationFenceAudit. Consequences: (a) an attacker or careless operator can forge a later fence_armed row, which latestFenceArmed returns via .order('desc').take(1) (audit.ts:53-57), breaking the D07-02 identity binding and the D07-04 PONR snapshot; (b) recordWriteAttempt({outcome:'accepted'}) can inject accepted rows into the window countAttemptsInWindow reads (audit.ts:70-96), poisoning the zero-loss oracle in either direction — inflating acceptedWriteCount to block a legitimate rollback, or inflating rejectedWriteCount to manufacture the non-degenerate positive half of a quiet-check. runQuietCheck explicitly prefers audit rows as its oracle (convex-fence-client.ts:1184-1198), so this is a live oracle-forgery path.
- WHY THE COVERAGE SCAN DOES NOT CATCH ANY OF THIS — verifyConvexFenceCoverage() (convex-fence-client.ts:1242-1291) unconditionally continues on rel==='lib/migrationFence.ts' and rel.startsWith('migrationFence/') (lines 1254-1255). holo verify:convex-fence-coverage reporting matches:[] is therefore compatible with five open write surfaces. The review must state this explicitly; a green coverage report is not a frozen-deployment claim.
- WHAT WOULD MAKE THE 'FROZEN' CLAIM FALSE — enumerated, each checkable: (1) HOLO_MIGRATION_READ_ONLY is unset or changed on the deployment (a single npx convex env unset disarms every fenced surface repo-wide; the fence is a runtime env read at convex/lib/migrationFence.ts:40-43, so disarming is instantaneous and leaves no Convex-side record); (2) a convex deploy from a working tree where the fence codemod was reverted — FENCED_ALIAS/FENCED_IMPORT_NAMES (convex/lib/migrationFence.ts:154-170) is an import-swap applied by scripts/cutover/apply-convex-fence.ts, so a normal deploy from an unswapped branch silently unfences all 112 modules; (3) any call to the five exempt mutations above; (4) GET-method httpActions performing writes — fencedHttpAction (convex/lib/migrationFence.ts:135-151) passes GET/HEAD/OPTIONS straight through with NO write check, so a GET route calling ctx.runMutation would be unfenced; today the only GET route is /article/ which is read-only (convex/http.ts:14-37), but any future GET route inherits this hole; (5) internal scheduled work resuming if HOLO_CUTOVER_SCHEDULES_DISABLED is unset — internal builders check schedules-disabled FIRST then the write fence (convex/lib/migrationFence.ts:94-104), so the write fence still holds, but drained-to-zero residual would no longer be guaranteed.
- AUTHORIZATION GAP ON THE FLIP ITSELF — runRollbackRepoint has no authorization check whatsoever. Anyone who can run bun services/platform/src/cli/holo.ts cutover:rollback-repoint or write to the durable secrets file at resolveSecretsPathFromEnv() (imported at rollback-repoint.ts:25) can set HOLO_DATA_PLANE. Correspondingly, CONVEX_DEPLOY_KEY (named in services/platform/src/config/verify-no-convex-env.ts:18) is the credential granting npx convex env set/unset — i.e. the ability to disarm the fence. The review must scope who holds it during the soak and whether env-set is audited anywhere outside Convex's own dashboard log.
- PONR IMMUTABILITY — see D07-04. From the Convex side: there is no Convex-side surface suitable as an immutable ledger, and migrationFenceAudit must not be proposed as one, since its writers are open public mutations.

**References:**

- `convex/migrationFence/drain.ts:213-271`
- `convex/migrationFence/drain.ts:169-200`
- `convex/migrationFence/drain.ts:455-521`
- `convex/migrationFence/audit.ts:1-9,12-47,50-96`
- `convex/lib/migrationFence.ts:40-52,58-76,94-104,107-122,135-151,154-170`
- `services/platform/src/cutover/convex-fence-client.ts:1242-1291`
- `services/platform/src/cutover/convex-fence-client.ts:1184-1198`
- `services/platform/src/cutover/convex-fence-client.ts:255-298`
- `services/platform/src/cutover/rollback-repoint.ts:25,456-790`
- `services/platform/src/config/verify-no-convex-env.ts:15-19`
- `convex/http.ts:14-57`
- `convex/schema.ts:1521-1536`

**Gaps (do not plan around these):**

- No authorization exists on ANY of the five unfenced migrationFence mutations — they are public Convex mutations with no auth check, deployed to production.
- seedInFlightForDrainTest is a test-only seeder shipped to the production deployment; nothing gates it on a test environment.
- No authorization or approval check exists on runRollbackRepoint / cutover:rollback-repoint — the data-plane flip is unauthenticated at the CLI and control-plane-file level.
- No tamper-evidence exists for npx convex env set/unset of HOLO_MIGRATION_READ_ONLY outside Convex's own dashboard; the repo records the fence value only in .tmp/D06-03/freeze-report.json, which is operator-writable.
- verify:convex-fence-coverage cannot, by construction, report the exempted surfaces — there is no verb that enumerates unfenced-by-design Convex write surfaces.

### From `specialist`

- Review who/what can invoke cutover:rollback-repoint, cutover:rollback-drill (D07-03), and the PONR write-enablement verb (D07-04) — confirm these are gated beyond bare filesystem/CLI access to the repo (e.g. scoped-key middleware, operator auth) and are not reachable from any unauthenticated HTTP surface.
- Review PONR record immutability specifically (D07-04's output): confirm the ledger is genuinely append-only (no UPDATE/DELETE grant if Postgres-backed, or a verified hash-chain if file-backed) — a mutable 'point of no return' record is a critical finding.
- Review the durable secrets control-plane write path (resolveSecretsPathFromEnv/upsertSecretsFile, reused by both rollback-repoint.ts and D07-02's attestation/pin verbs) for file permissions and write-access scope — confirm HOLO_DATA_PLANE/HOLO_ROLLBACK_TARGET can only change via the intended CLI path, not arbitrary process.env manipulation by a lower-privileged caller.
- Review D07-02's pinned fallback build artifact and worktree (.tmp/D07-02/pinned-fallback-worktree) for secret leakage — confirm the exported bundle does not embed live Convex admin credentials or other secrets that a pre-rewrite revision's env handling might have baked in differently than HEAD.

### From `specialist`

- Two new authorization surfaces need review, both fail-closed by design: cutover:enable-writes (lifts HOLO_MIGRATION_READ_ONLY to '0' and passes the irreversible PONR) and cutover:rollback-repoint (writes HOLO_DATA_PLANE=convex). Ask specifically who can execute each and what evidence of authorization is persisted; today neither verb requires an operator identity beyond process access to the secrets file.
- Score the ASYMMETRY between the two latches explicitly. loadPostExportWriteAudit() (rollback-repoint.ts:181-211) is fail-open: deleting .tmp/D06-05/post-export-write-audit.json makes the POST_EXPORT_WRITE_ACCEPTED check report zero accepted writes. That is a live filesystem-tampering path against a data-loss guard that exists today, independent of Sprint 30. The new PONR latch (POST_PONR_INELIGIBLE) is DB-backed and must not share it; verify that yourself by deleting the .tmp artifacts and re-running cutover:rollback-repoint --json, expecting POST_PONR_INELIGIBLE.
- The queryable artifacts for your review: SELECT * FROM data_plane_ponr (append-only ledger with operator, run_id, base_url, fence_lifted_at, write_row_digest_sha256, and the convex_* escape-hatch snapshot), the durable secrets file at HOLO_SECRETS_PATH (HOLO_MIGRATION_READ_ONLY, HOLO_DATA_PLANE, HOLO_ROLLBACK_TARGET, HOLO_ROLLBACK_ENGAGED_AT), and the JSON reports under .tmp/D06-05/ and .tmp/D07-04/.
- Audit the Convex snapshot as evidence, not decoration: convex_accepted_writes_since_watermark must be 0 (enforced by a DB CHECK) and convex_newest_document_creation_time must be <= export_watermark_ms. If a PONR row exists that violates either, the rollback window was never real and the cutover's zero-loss claim is unsupported.
- Verify the immutability claim yourself at the DB level rather than reading the migration: connect as holocron_app via toAppRoleDatabaseUrl (services/platform/src/db/evidence/roles.ts) and expect SQLSTATE 42501, then connect on the owner/migration URL and expect SQLSTATE P0001 with PONR_IMMUTABLE. If both connections produce the same SQLSTATE, only one enforcement layer exists and the claim is overstated.
- Check whether ALTER TABLE data_plane_ponr DISABLE TRIGGER is reachable by any role the application or CI uses; that is the one documented escape from the trigger layer and it must be owner-only and auditable.
- Review the write-enablement ordering for a crash window: the Convex snapshot and divergence check run first, then the fence is lifted, then the PONR row is inserted. Assess the exposure if the process dies between the fence lift and the insert (fence open, no PONR recorded) and whether the idempotent re-run path closes it honestly.
- Assess PONR_LEDGER_UNREADABLE as a denial-of-rollback vector: an attacker who can make the ledger unreadable can block a legitimate rollback. Weigh that against the alternative (a reachable ledger check that silently passes) and state which risk the project should accept.
- The rollback control plane is a filesystem secrets file with exactly one runtime consumer, resolveObservedDataPlane() at http/health.ts:267. Confirm the file's permissions and ownership, and whether any non-operator process (CI runner, worker) can write HOLO_DATA_PLANE directly and thereby re-point the data plane without going through cutover:rollback-repoint and its PONR latch.
- Read .spec/prds/mk6-migration/10-technical-requirements/08-technical-risks.md for the cutover risk entries before scoring, and cross-check UC-SYNC-05: Convex deletion must remain gated on a later recovery-evidence drill, never on the PONR alone.

## Notes

- AC-8 and AC-9 cannot execute until D07-04 lands migration 0030 and a real cutover:enable-writes run produces a data_plane_ponr row; this task is sequenced after D07-04 in dependencies.depends_on.
- AC-7 is deliberately the one finding this task proves by source inspection rather than live execution: actually running npx convex env unset HOLO_MIGRATION_READ_ONLY against the frozen production deployment to 'prove' the disarm path would disarm the write fence for real, which is a destructive action this review must never take unilaterally. This is a scope decision, not an oversight — flagging it explicitly per the critical_constraints NEVER list.
- AC-1/AC-2/AC-3 write small, tagged, cleanable data to the real frozen Convex deployment (5 tasks, mass-patch of already-drained residual, 1 forged audit row). This is standard security-review practice (proving a vulnerability by exercising it) but the task caps blast radius explicitly (5-row ceiling, s30-sec-probe tag, cleanup steps) rather than reaching the seedInFlightForDrainTest's 500-row ceiling.
- AC-8's TRUNCATE finding is this review's most load-bearing original contribution: it is not covered by D07-04's own AC-2, AC-7, or any suggested_acs in mastra.json's D07-04 entry, and the migration 0030 design as specified (BEFORE UPDATE OR DELETE ... FOR EACH ROW only) does not defend against it. If the probe finds TRUNCATE succeeds, remediation (a BEFORE TRUNCATE STATEMENT trigger, or revoking TRUNCATE from the owner's effective grant via a role split) should be scoped as a fast-follow, not silently absorbed into this review task.
- Every scenario in this task was hand-verified against the literal source of brain/tools/validate-scenario/validate_scenario.py because the authoring agent has no Bash/execution tool available to actually run the validator. The orchestrator ran the real validator before merge.
- The authoring agent's toolset (Read/Grep/Glob/WebFetch/WebSearch/SendMessage/Task*) has no Write/Edit/Bash tool, so this result was delivered inline and transcribed verbatim by the orchestrator — same as convex-planner's transcription in the same scratchpad directory.

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "D07-05",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "frozen_soak_deployment": {
      "description": "The real Convex deployment armed by Sprint 29's cutover:freeze, reachable via convexUrl() (EXPO_PUBLIC_CONVEX_URL / VITE_CONVEX_HTTP_URL / CONVEX_URL), with HOLO_MIGRATION_READ_ONLY confirmed as '1' via getMigrationReadOnlyEnv() and HOLO_CUTOVER_SCHEDULES_DISABLED confirmed armed via scheduleDisableStatus() \u2014 both recorded in .tmp/D06-03/freeze-report.json and .tmp/D06-03/quiet-check-report.json from Sprint 29. This review reads and probes it; it never re-arms or re-freezes it.",
      "seed_method": "recorded_external",
      "records": [
        "Convex deployment reachable at convexUrl() with the fence armed by the real Sprint 29 cutover:freeze run",
        "HOLO_CUTOVER_SCHEDULES_DISABLED value visible as armed in the live Convex runtime per scheduleDisableStatus query",
        "at least 1 pre-existing document reachable via api.documents.queries.count for reachability sanity-check before probing"
      ]
    },
    "disposable_soak_stack": {
      "description": "A disposable local control plane for CLI-level authorization probing, independent of the live Convex deployment: a real secrets file, a real export-watermark report, and a post-export-write-audit ledger reporting zero accepted writes.",
      "seed_method": "cli",
      "records": [
        "file: .tmp/D07-05/secrets.yaml created via upsertSecretsFile() with no HOLO_DATA_PLANE key present, and no CONVEX_DEPLOY_KEY / API key / auth token set in its environment",
        "file: watermark report with a concrete watermarkAtMs consumed by loadExportWatermarkMs()",
        "file: .tmp/D07-05/post-export-write-audit.json with accepted_writes: [] and export_watermark_ms set to the same watermarkAtMs"
      ]
    },
    "ponr_recorded_row": {
      "description": "The single real data_plane_ponr row produced by D07-04's cutover:enable-writes run against a disposable soak stack, embedding a live Convex escape-hatch snapshot. This review does not create it; it reads and attacks the row D07-04 produced.",
      "seed_method": "cli",
      "records": [
        "1 row in data_plane_ponr created via bun services/platform/src/cli/holo.ts cutover:enable-writes --json (D07-04)",
        "roles holocron_app (least-privilege) and the owner/migration connection both resolvable via toAppRoleDatabaseUrl(DATABASE_URL) and DATABASE_URL respectively"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN the fence armed WHEN seedInFlightForDrainTest is invoked unauthenticated THEN it succeeds and inserts 5 real rows, falsifying the frozen-deployment claim.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-1 seedInFlightForDrainTest unauthenticated'"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN the fence armed WHEN disableAndDrain is invoked unauthenticated THEN it mass-patches real rows with no authorization check.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-2 disableAndDrain unauthenticated'"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN the export watermark WHEN recordWriteAttempt is invoked unauthenticated THEN the zero-loss oracle count is forged by exactly 1.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-3 recordWriteAttempt forgery'"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN verify:convex-fence-coverage WHEN it reports matches:[] THEN the review independently enumerates the 5 structurally exempt mutations rather than citing the clean report alone.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-4 fence coverage blind spot'"
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN fencedHttpAction WHEN GET/HEAD/OPTIONS are inspected THEN the bypass condition and standing constraint are confirmed and filed.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-5 fencedHttpAction GET bypass'"
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "description": "GIVEN no credential WHEN cutover:rollback-repoint is run THEN it succeeds, proving zero authorization on the flip.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-6 rollback-repoint no authorization'"
    },
    {
      "id": "AC-7",
      "type": "acceptance_criterion",
      "description": "GIVEN the disarm path WHEN statically enumerated THEN CONVEX_DEPLOY_KEY is confirmed as sole gate with no Convex-side tamper record, without ever executing the disarm.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-7 CONVEX_DEPLOY_KEY disarm inventory'"
    },
    {
      "id": "AC-8",
      "type": "acceptance_criterion",
      "description": "GIVEN a real PONR row WHEN UPDATE/DELETE/TRUNCATE are attempted THEN every outcome is recorded verbatim, including whether TRUNCATE bypasses the row-level trigger.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-8 PONR immutability adversarial re-probe'"
    },
    {
      "id": "AC-9",
      "type": "acceptance_criterion",
      "description": "GIVEN a real PONR row WHEN .tmp artifacts are deleted and fabricated THEN cutover:rollback-repoint still refuses with POST_PONR_INELIGIBLE on both runs.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-9 PONR latch tmp tamper resistance'"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "seedInFlightForDrainTest response ok equals true when invoked unauthenticated against the frozen deployment.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-1 seedInFlightForDrainTest unauthenticated'"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "seedInFlightForDrainTest response taskIds length equals 5 when activeTasks is 5.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-1 seedInFlightForDrainTest unauthenticated'"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "disableAndDrain executes without an authorization error when called unauthenticated.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-2 disableAndDrain unauthenticated'"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "disableAndDrain consumersHonored equals true when HOLO_CUTOVER_SCHEDULES_DISABLED is armed.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-2 disableAndDrain unauthenticated'"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "countAttemptsInWindow acceptedWriteCount increases by exactly 1 when a forged recordWriteAttempt row is inserted.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-3 recordWriteAttempt forgery'"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "The forged migrationFenceAudit row outcome equals accepted when read back after recordWriteAttempt.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-3 recordWriteAttempt forgery'"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "verify:convex-fence-coverage matches array length equals 0 when run against the frozen deployment source.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-4 fence coverage blind spot'"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "The written finding names 5 exempt mutations when the fence coverage exemption is documented.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-4 fence coverage blind spot'"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "GET /article/ returns HTTP status 200 when the fence is armed.",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-5 fencedHttpAction GET bypass'"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "convex/http.ts contains 0 ctx.runMutation calls in the article GET handler when scanned by grep.",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-5 fencedHttpAction GET bypass'"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": "cutover:rollback-repoint reports repointed equals true when run with no authorization credential present.",
      "maps_to_ac": "AC-6",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-6 rollback-repoint no authorization'"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": "rollback-repoint.ts contains 0 authorization or credential check tokens when scanned by grep.",
      "maps_to_ac": "AC-6",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-6 rollback-repoint no authorization'"
    },
    {
      "id": "TC-13",
      "type": "test_criterion",
      "description": "isMigrationReadOnly reads process.env directly on every call with 0 cached module-level variables.",
      "maps_to_ac": "AC-7",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-7 CONVEX_DEPLOY_KEY disarm inventory'"
    },
    {
      "id": "TC-14",
      "type": "test_criterion",
      "description": "convex/migrationFence/audit.ts contains exactly 2 ctx.db.insert call sites when scanned by grep.",
      "maps_to_ac": "AC-7",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-7 CONVEX_DEPLOY_KEY disarm inventory'"
    },
    {
      "id": "TC-15",
      "type": "test_criterion",
      "description": "App-role UPDATE on data_plane_ponr raises SQLSTATE 42501 when attempted after the PONR row is recorded.",
      "maps_to_ac": "AC-8",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-8 PONR immutability adversarial re-probe'"
    },
    {
      "id": "TC-16",
      "type": "test_criterion",
      "description": "TRUNCATE TABLE data_plane_ponr on the owner connection produces a recorded observed outcome when attempted.",
      "maps_to_ac": "AC-8",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-8 PONR immutability adversarial re-probe'"
    },
    {
      "id": "TC-17",
      "type": "test_criterion",
      "description": "cutover:rollback-repoint exit code equals 2 when the PONR row exists after all tmp cutover artifacts are deleted.",
      "maps_to_ac": "AC-9",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-9 PONR latch tmp tamper resistance'"
    },
    {
      "id": "TC-18",
      "type": "test_criterion",
      "description": "cutover:rollback-repoint error code equals POST_PONR_INELIGIBLE when a fabricated data-plane-config.json claims a prior successful repoint.",
      "maps_to_ac": "AC-9",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-security-review.test.ts -t 'AC-9 PONR latch tmp tamper resistance'"
    }
  ]
}
-->
