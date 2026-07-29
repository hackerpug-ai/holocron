# REDHAT-FIX-C2 — Make the D05-01 no-fake-success oracle fail closed on unavailable database state (review C-2)

## What this does

Close red-hat C-2 by rewriting the D05-01 no-fake-success oracle so DB unavailability, missing backup_heartbeat, or COUNT query failure fails the test closed with a named reason (e.g. 'database unreachable' or 'backup_heartbeat missing'), and zero success/OK rows are asserted only after a successful real query against PLATFORM_IT Postgres following a restore-path (not parser-only) failure on empty/corrupt fixtures.

## Why

Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-C2). Grounded in UC-PLAT-06 / T-PLAT-022 / T-PLAT-025 / CAP-BAK-01. Review evidence: `.spec/reviews/red-hat-20260728T235155Z-sprint-28.md` (reviewed SHA `a9b5b6e7ff2b707fddf15084e2895221c62c68cb`).

## How to verify

- `rg -n 'database unreachable|backup_heartbeat missing|heartbeat query failed' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts && ! rg -U 'if \(tableExists\.status !== 0 \|\| tableExists\.stdout !== .t.\) \{[\s\S]*?successRows: 0' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts` → Named fail-closed reasons present; old zero-return on missing table removed
- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'no fake-success'` → Honest RED/GREEN: fails closed on DB issues; does not false-green on fabricated zeroes; parser-only not claimed as restore-path AC-4
- `test -f .tmp/D05-01/ac4-no-fake-success-row.json && jq -e 'has("db_probe_ok") and has("successRows")' .tmp/D05-01/ac4-no-fake-success-row.json` → Evidence includes db_probe_ok and concrete counts
- `! rg -Eq 'vi\.mock\(.*restore|mock.*backup_heartbeat|stub.*psql' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts` → Exit 0 (no matches)
- `pnpm tsgo --noEmit && pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/tests/integration/sprint28-restore-fails-closed.test.ts (MODIFY — fail-closed countFakeSuccessHeartbeats / AC-4 oracle only), services/platform/tests/** (optional tiny test-only helper for fail-closed heartbeat probe; no production imports required), .tmp/D05-01/** (evidence refresh for ac4-no-fake-success-row.json and related), .tmp/REDHAT-FIX-C2/** (red-output, verification-summary, path evidence)

Prohibited: services/platform/src/backup/restore.ts and any production restore implementation (D05-02 owns), services/platform/src/cli/holo.ts restore command wiring (D05-02 owns), services/platform/src/backup/** product modules except read-only reference, services/platform/src/db/migrations/** (heartbeat schema owned by Sprint 27; do not DDL from test), Mocking R2, pgBackRest, holo restore, psql, or backup_heartbeat, Converting DB failure into zero counts, Owning REDHAT-FIX-C1 healthy real pgBackRest fixture work beyond coordination notes, Weakening D05-01 AC-1/AC-2 empty/corrupt named-error assertions

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-C2 — Make the D05-01 no-fake-success oracle fail closed on unavailable database state (review C-2)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (90 min)
AGENT:      implementer=red-test-generator | reviewer=code-reviewer
PROPOSED-BY: red-test-generator
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 28 — Point-in-Time Restore and Fresh-Hardware Fire Drill](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'no fake-success'
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
sprint28-restore-fails-closed.test.ts no longer returns fabricated zeroes from countFakeSuccessHeartbeats on missing table/unreachable DB; AC-4 records query_ok=true and concrete COUNT results; unknown flag: --pitr alone does not satisfy AC-4; PLATFORM_IT suite fails closed with named reason when DB probe fails; evidence under .tmp/D05-01/ and .tmp/REDHAT-FIX-C2/; typecheck and biome clean on write_allowed paths.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST rewrite countFakeSuccessHeartbeats() (or equivalent helper) so that when psql/DATABASE_URL is unreachable, backup_heartbeat is missing (to_regclass IS NULL / status!=0), or any COUNT query fails, the helper throws or returns a structured fail-closed error — NEVER {successRows:0, okRows:0, restoreParityRows:0}
- MUST make the AC-4 itLive case fail with an explicit named reason containing 'database unreachable' OR 'backup_heartbeat missing' OR 'heartbeat query failed' when the DB probe cannot run
- MUST observe real query success (psql status===0 AND stdout is a non-empty integer COUNT) against real PLATFORM_IT Postgres before asserting successRows===0 and okRows===0
- MUST record oracle evidence fields: db_probe_ok, table_present, success_count_query_status, successRows, okRows, restoreParityRows, emptyRestore.combined, corruptRestore.combined
- MUST distinguish CLI parse/unknown-flag failures from restore-path failures: AC-4 zero-row assertion requires that failed restores are NOT solely 'unknown flag: --pitr' / parser usage errors (stderr must not be only the flag parser path when claiming restore-path AC-4)
- MUST keep real-service integration: spawnSync real holo restore; real psql against DATABASE_URL; no vi.mock of restore/R2/pgBackRest/DB
- NEVER convert connection/query failure into zero counts that look like 'no fake success'
- NEVER treat unknown flag: --pitr alone as proof of AC-4 restore-path fail-closed behavior
- NEVER mock DATABASE_URL, psql, backup_heartbeat, R2, pgBackRest, or holo restore for the no-fake-success oracle
- NEVER implement production restore code in this task (D05-02 owns restore.ts / holo restore --pitr)
- NEVER soft-pass missing backup_heartbeat as COUNT=0 success
- STRICTLY verification observes real database state via successful public_api psql queries before zero-row claims
- STRICTLY flow_ref T-PLAT-022 / CAP-BAK-01 — restore NEVER reports OK against an unverifiable chain, and the oracle itself never false-greens
- STRICTLY write_allowed is the RED test file + .tmp evidence (+ optional tiny test helper under services/platform/tests/); production restore implementation is write_prohibited unless a tiny test-only helper under tests/

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN PLATFORM_IT Postgres is unreachable OR public.backup_heartbeat is missing OR the heartbeat COUNT query cannot run 
- [ ] AC-2: GIVEN a real PLATFORM_IT Postgres with public.backup_heartbeat present WHEN AC-4 asserts no fake-success rows THEN the o
- [ ] AC-3: GIVEN holo restore invocations for empty and corrupted fixtures WHEN asserting AC-4 no-fake-success THEN the oracle MUST
- [ ] AC-4: GIVEN restore-path failures against empty and corrupted fixtures AND a successful real backup_heartbeat COUNT probe WHEN
- [ ] AC-5: GIVEN write_allowed test and evidence paths change WHEN typecheck and lint run THEN pnpm tsgo --noEmit and pnpm biome ch
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — GIVEN PLATFORM_IT Postgres is unreachable OR public.backup_heartbeat is missing  (flow_ref T-PLAT-022)
  GIVEN/WHEN/THEN: GIVEN PLATFORM_IT Postgres is unreachable OR public.backup_heartbeat is missing OR the heartbeat COUNT query cannot run WHEN the D05-01 no-fake-success oracle probes for fake-success rows THEN the test MUST fail closed with a named reason ('database unreachable' OR 'backup_heartbeat missing' OR 'heartbeat query failed') and MUST NOT treat fabricated zero counts as AC proof.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: holo-restore-cli+psql+PLATFORM_IT-Postgres
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'no fake-success'; rg -n 'database unreachable|backup_heartbeat missing|heartbeat query failed|countFakeSuccessHeartbeats' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if countFakeSuccessHeartbeats returns successRows:0/okRows:0 when tableExists.status!==0 or stdout!=='t'; AC-4 expects heartbeats.successRows===0 without first asserting db probe succeeded; missing backup_heartbeat is treated as zero fake-success proof; broken DATABASE_URL greens AC-4
  START_REF: db_unreachable_or_heartbeat_missing
  MUST_OBSERVE: test failure message contains 'database unreachable' OR 'backup_heartbeat missing' OR 'heartbeat query failed'; helper does not return {successRows:0, okRows:0, restoreParityRows:0} on probe failure; evidence JSON includes db_probe_ok=false OR equivalent fail-closed marker
  MUST_NOT_OBSERVE: fabricated zeroes accepted as AC-4 pass; raw: { table: 'missing_or_unreachable' } followed by expect(successRows).toBe(0) green; empty/start signature: silent zero-count soft-pass
  EVIDENCE: db_query (required_capture=True)

### AC-2 — GIVEN a real PLATFORM_IT Postgres with public.backup_heartbeat present WHEN AC-4 (flow_ref T-PLAT-022)
  GIVEN/WHEN/THEN: GIVEN a real PLATFORM_IT Postgres with public.backup_heartbeat present WHEN AC-4 asserts no fake-success rows THEN the oracle MUST first observe successful COUNT queries (psql exit 0, integer stdout) for success/OK restore-scoped heartbeats before asserting COUNT=0.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: psql+backup_heartbeat
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'no fake-success'; test -f .tmp/D05-01/ac4-no-fake-success-row.json && jq -e '.db_probe_ok==true and .table_present==true and (.success_count_query_status==0)' .tmp/D05-01/ac4-no-fake-success-row.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if zero-row assertion runs without recording query status===0; oracle skips SELECT to_regclass and COUNT against real DATABASE_URL; evidence omits successRows/okRows after a successful query; mock/stub replaces psql for heartbeat counts
  START_REF: platform_it_postgres_with_backup_heartbeat
  MUST_OBSERVE: db_probe_ok === true; table_present === true; success_count_query_status === 0; successRows is integer from successful COUNT (may be 0 only after query_ok); okRows is integer from successful COUNT
  MUST_NOT_OBSERVE: zero counts without query_ok; table missing accepted as success; empty/start signature: raw.table=='missing_or_unreachable' with green AC-4
  EVIDENCE: db_query (required_capture=True)

### AC-3 — GIVEN holo restore invocations for empty and corrupted fixtures WHEN asserting A (flow_ref T-PLAT-022)
  GIVEN/WHEN/THEN: GIVEN holo restore invocations for empty and corrupted fixtures WHEN asserting AC-4 no-fake-success THEN the oracle MUST distinguish CLI parse/unknown-flag failures from restore-path failures — unknown flag: --pitr alone MUST NOT satisfy the AC-4 restore-path contract.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: holo-restore-cli
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'no fake-success'; rg -n 'unknown flag|parser|restore-path|restore_path' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if both empty and corrupt restores fail only with 'unknown flag: --pitr' and AC-4 still claims restore-path no-fake-success proven; oracle treats any non-zero exit as restore-path proof without inspecting stderr class; parser error is conflated with 'no base backup available' / corruption named errors
  START_REF: empty_r2_repo_and_corrupted_manifest_repo
  MUST_OBSERVE: evidence records emptyRestore.failure_class and corruptRestore.failure_class as 'parser' OR 'restore_path'; when both classes are 'parser', AC-4 does NOT claim restore-path no-fake-success proven (suite remains honestly RED or fails the restore-path assertion); when class is 'restore_path', stderr contains named restore failure (e.g. 'no base backup available' OR 'backup chain missing' OR 'manifest checksum mismatch' OR 'WAL segment corrupted' OR 'backup chain integrity check failed') AND exit code != 0
  MUST_NOT_OBSERVE: unknown flag: --pitr alone recorded as AC-4 restore-path pass; exit 2 parser-only treated as verified empty-chain fail-closed product behavior; empty/start signature: ac4-no-fake-success-row.json green with only parser errors
  EVIDENCE: stdout (required_capture=True)

### AC-4 — GIVEN restore-path failures against empty and corrupted fixtures AND a successfu (flow_ref T-PLAT-022)
  GIVEN/WHEN/THEN: GIVEN restore-path failures against empty and corrupted fixtures AND a successful real backup_heartbeat COUNT probe WHEN the restores exit non-zero on the restore path THEN ZERO rows exist in backup_heartbeat with status success/OK for restore/pitr jobs and ZERO parity restore-completed claims — never fabricated from a failed DB probe.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: holo-restore-cli+psql+backup_heartbeat
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'no fake-success'; jq -e '.db_probe_ok==true and .successRows==0 and .okRows==0 and .restoreParityRows==0' .tmp/D05-01/ac4-no-fake-success-row.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if restore writes a success/OK heartbeat for a failed restore and oracle still greens; oracle fabricates zeroes without query_ok; parity tracking claims restore completed despite exit != 0; unknown-flag-only path is used as the sole failed-restore evidence
  START_REF: empty_r2_repo
  MUST_OBSERVE: emptyRestore.status != 0; db_probe_ok === true before zero asserts; COUNT(*) success/OK restore-scoped rows === 0; restoreParityRows === 0 when parity tables queried successfully
  MUST_NOT_OBSERVE: backup_heartbeat row with status 'success' or 'OK' for failed empty restore; zero counts without db_probe_ok; empty/start signature: any OK record COUNT(*) >= 1 for restore jobs
  EVIDENCE: db_query (required_capture=True)

### AC-5 — GIVEN write_allowed test and evidence paths change WHEN typecheck and lint run T (flow_ref T-PLAT-022)
  GIVEN/WHEN/THEN: GIVEN write_allowed test and evidence paths change WHEN typecheck and lint run THEN pnpm tsgo --noEmit and pnpm biome check . exit 0 on the touched RED test.
  TEST_TIER: unit · TDD_STATE: red→green
  VERIFICATION_SERVICE: toolchain
  VERIFY: `pnpm tsgo --noEmit; pnpm biome check services/platform/tests/integration/sprint28-restore-fails-closed.test.ts`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if typecheck or lint failures ignored on the RED test file; biome/ts errors introduced by fail-closed helper rewrite
  START_REF: write_allowed_red_test_paths
  MUST_OBSERVE: typecheck exit 0; biome check exit 0 on sprint28-restore-fails-closed.test.ts
  MUST_NOT_OBSERVE: unchecked write_allowed TypeScript errors; biome diagnostics ignored
  EVIDENCE: stdout (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | countFakeSuccessHeartbeats (or successor) hard-fails on missing table / unreachable DB — no fabricat | AC-1 | `rg -n 'missing_or_unreachable|successRows: 0' services/platform/tests/integratio` |
| TC-2 | AC-4 evidence requires db_probe_ok/table_present and query status 0 before zero asserts | AC-2 | `rg -n 'db_probe_ok|table_present|success_count_query_status' services/platform/t` |
| TC-3 | AC-4 distinguishes parser unknown-flag from restore_path failure class | AC-3 | `rg -n 'unknown flag|failure_class|restore_path|parser' services/platform/tests/i` |
| TC-4 | PLATFORM_IT live no-fake-success case still spawns real holo restore and queries real backup_heartbe | AC-4 | `rg -n 'runHoloRestore|spawnSync.*holo|backup_heartbeat|psqlDb' services/platform` |
| TC-5 | RED evidence for C-2 fail-closed oracle recorded under .tmp | AC-1 | `test -f .tmp/REDHAT-FIX-C2/red-output.txt || test -f .tmp/D05-01/ac4-no-fake-suc` |
| TC-6 | Typecheck + biome clean on RED test | AC-5 | `pnpm tsgo --noEmit; pnpm biome check services/platform/tests/integration/sprint2` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/tests/integration/sprint28-restore-fails-closed.test.ts (MODIFY — fail-closed countFakeSuccessHeartbeats / AC-4 oracle only)
- services/platform/tests/** (optional tiny test-only helper for fail-closed heartbeat probe; no production imports required)
- .tmp/D05-01/** (evidence refresh for ac4-no-fake-success-row.json and related)
- .tmp/REDHAT-FIX-C2/** (red-output, verification-summary, path evidence)
writeProhibited:
- services/platform/src/backup/restore.ts and any production restore implementation (D05-02 owns)
- services/platform/src/cli/holo.ts restore command wiring (D05-02 owns)
- services/platform/src/backup/** product modules except read-only reference
- services/platform/src/db/migrations/** (heartbeat schema owned by Sprint 27; do not DDL from test)
- Mocking R2, pgBackRest, holo restore, psql, or backup_heartbeat
- Converting DB failure into zero counts
- Owning REDHAT-FIX-C1 healthy real pgBackRest fixture work beyond coordination notes
- Weakening D05-01 AC-1/AC-2 empty/corrupt named-error assertions

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260728T235155Z-sprint-28.md:66-71 (C-2 — D05-01 AC-4 false-green side-effect oracle)
2. services/platform/tests/integration/sprint28-restore-fails-closed.test.ts:612-687 (countFakeSuccessHeartbeats fabricated zeroes on missing table)
3. services/platform/tests/integration/sprint28-restore-fails-closed.test.ts:911-966 (AC-4 no fake-success assertions)
4. services/platform/tests/integration/sprint28-restore-fails-closed.test.ts:618-625 (tableExists soft-return zeros — defect locus)
5. services/platform/tests/integration/sprint28-restore-fails-closed.test.ts:952-963 (zero asserts without query_ok gate)
6. .tmp/D05-01/ac4-no-fake-success-row.json (recorded AC-4 green under unknown flag: --pitr)
7. .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-01-red-restore-fails-closed-on-empty-corrupted-backup-chain.md (parent RED task AC-4)
8. services/platform/src/db/migrations/0029_backup_heartbeat.sql (Sprint 27 heartbeat schema)
9. .spec/prds/mk6-migration/11-e2e-testing-criteria.md (T-PLAT-022 PITR fail-closed)
10. .spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md (CAP-BAK-01)
11. Reviewed SHA a9b5b6e7ff2b707fddf15084e2895221c62c68cb

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Fail-closed oracle static proof: `rg -n 'database unreachable|backup_heartbeat missing|heartbeat query failed' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts && ! rg -U 'if \(tableExists\.status !== 0 \|\| tableExists\.stdout !== .t.\) \{[\s\S]*?successRows: 0' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts` → Named fail-closed reasons present; old zero-return on missing table removed
- PLATFORM_IT no-fake-success suite: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'no fake-success'` → Honest RED/GREEN: fails closed on DB issues; does not false-green on fabricated zeroes; parser-only not claimed as restore-path AC-4
- AC-4 evidence shape: `test -f .tmp/D05-01/ac4-no-fake-success-row.json && jq -e 'has("db_probe_ok") and has("successRows")' .tmp/D05-01/ac4-no-fake-success-row.json` → Evidence includes db_probe_ok and concrete counts
- No restore mocks: `! rg -Eq 'vi\.mock\(.*restore|mock.*backup_heartbeat|stub.*psql' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts` → Exit 0 (no matches)
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check services/platform/tests/integration/sprint28-restore-fails-closed.test.ts` → Exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: ./SPRINT.md, .spec/reviews/red-hat-20260728T235155Z-sprint-28.md#C-2, D05-01-red-restore-fails-closed-on-empty-corrupted-backup-chain.md AC-4, services/platform/tests/integration/sprint28-restore-fails-closed.test.ts:612-687,911-966, services/platform/src/db/migrations/0029_backup_heartbeat.sql, REDHAT-FIX-C1 (coordinate healthy real pgBackRest fixture; C2 does not own AC-3)
Interaction notes:
- Coordinate with REDHAT-FIX-C1: C1 fixes healthy fixture realism; C2 only hardens AC-4 fail-closed DB oracle and failure_class discrimination
- Until D05-02 lands restore --pitr, suite may remain RED; honesty requires not claiming AC-4 restore-path green on parser-only failures
- Optional tiny helper under services/platform/tests/ is allowed if it keeps the main file readable; must remain test-scoped
- Do not change production heartbeat writers; only the RED observation oracle
pattern: Replace soft-return zeros in countFakeSuccessHeartbeats with fail-closed probe: (1) psql connectivity check, (2) to_regclass('public.backup_heartbeat') must be t, (3) COUNT queries must status===0, (4) only then return numeric counts; AC-4 asserts query_ok then zeros; classify restore stderr into failure_class 'parser' vs 'restore_path' so unknown flag: --pitr cannot sole-green AC-4; keep spawnSync real holo + real psql.
pattern_source: red-hat-20260728T235155Z-sprint-28.md
anti_pattern: return {successRows:0,...} when table missing_or_unreachable; assert toBe(0) without db_probe_ok; treat parser exit 2 as restore-path no-fake-success proof; mock DATABASE_URL/psql; implement production restore in this task

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: red-test-generator — Owns the D05-01 RED integration suite at services/platform/tests/integration/sprint28-restore-fails-closed.test.ts. C-2 is a test-oracle honesty defect: countFakeSuccessHeartbeats() fabricates zero counts when backup_heartbeat is missing or the query cannot run, then AC-4 treats those zeroes as proof of no fake-success. Remediation is confined to the RED test oracle (fail-closed DB probe, real query-success gate, restore-path vs parser-error discrimination). No production restore implementation is in scope (D05-02 / REDHAT-FIX-C1 own product paths and healthy pgBackRest fixtures).
Reviewer: code-reviewer (+ security-reviewer when task is security-scoped)

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D05-01
Blocks: D05-02 false-green on D05-01 AC-4, false greens on D05-02 no-fake-success claims that reuse the soft zero oracle
Coordinates with: REDHAT-FIX-C1

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Review evidence (immutable): `.spec/reviews/red-hat-20260728T235155Z-sprint-28.md` @ SHA `a9b5b6e7ff2b707fddf15084e2895221c62c68cb`.
- Do not claim gate pass; do not implement outside write_allowed.
- Preserve Sprint 28 CAP-BAK-01 restore-half scope.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-C2",
  "proposed_by": "red-test-generator",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "db_unreachable_or_heartbeat_missing": {
      "description": "Negative probe state where DATABASE_URL is wrong/unreachable OR public.backup_heartbeat is absent OR COUNT query fails. Used to prove the oracle fails closed instead of fabricating zero counts.",
      "seed_method": "public_api",
      "records": [
        "psql against DATABASE_URL returns non-zero OR connection refused",
        "OR SELECT to_regclass('public.backup_heartbeat') IS NOT NULL returns f / non-t",
        "OR COUNT query status != 0 with ON_ERROR_STOP=1",
        "Oracle must throw/fail with named reason \u2014 never successRows:0 soft-pass"
      ]
    },
    "platform_it_postgres_with_backup_heartbeat": {
      "description": "Real PLATFORM_IT Postgres (DATABASE_URL / DATABASE_URL_OWNER) with Sprint 27 migration 0029 backup_heartbeat present so COUNT queries can succeed.",
      "seed_method": "public_api",
      "records": [
        "DATABASE_URL points at live holocron nonprod Postgres",
        "public.backup_heartbeat exists (0029_backup_heartbeat.sql)",
        "psql -v ON_ERROR_STOP=1 -tAc COUNT queries return integer stdout and status 0",
        "No mocks of psql or heartbeat table"
      ]
    },
    "empty_r2_repo": {
      "description": "Test-scoped R2 prefix with zero backup objects \u2014 empty chain for failed restore. Reuses D05-01 empty fixture seeding.",
      "seed_method": "public_api",
      "records": [
        "R2 bucket prefix exists but is empty (0 objects)",
        "pgBackRest repo config points at this empty prefix",
        "No base backup manifest present",
        "No WAL segment files present"
      ]
    },
    "corrupted_manifest_repo": {
      "description": "Test-scoped R2 prefix with base backup and corrupted WAL/manifest for failed restore. Reuses D05-01 corrupt fixture seeding.",
      "seed_method": "public_api",
      "records": [
        "R2 bucket prefix contains a base backup manifest",
        "At least one WAL segment or manifest checksum is corrupted",
        "Restore-path failure should name corruption when D05-02 lands",
        "Pre-D05-02 may still hit parser class \u2014 must be classified honestly"
      ]
    },
    "empty_r2_repo_and_corrupted_manifest_repo": {
      "description": "Combined empty + corrupt restore invocations for AC-4 dual-case classification of failure_class parser vs restore_path.",
      "seed_method": "public_api",
      "records": [
        "empty fixture prefix from D05-01 seed",
        "corrupt fixture prefix from D05-01 seed",
        "two real spawnSync holo restore --pitr invocations",
        "stderr/status captured for failure_class discrimination"
      ]
    },
    "write_allowed_red_test_paths": {
      "description": "Files this task may modify for typecheck/lint verification.",
      "seed_method": "cli",
      "records": [
        "services/platform/tests/integration/sprint28-restore-fails-closed.test.ts",
        "optional tiny helper under services/platform/tests/**",
        ".tmp/D05-01/** and .tmp/REDHAT-FIX-C2/** evidence only"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN PLATFORM_IT Postgres is unreachable OR public.backup_heartbeat is missing OR the heartbeat COUNT query cannot run WHEN the D05-01 no-fake-success oracle probes for fake-success rows THEN the test MUST fail closed with a named reason ('database unreachable' OR 'backup_heartbeat missing' OR 'heartbeat query failed') and MUST NOT treat fabricated zero counts as AC proof.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'no fake-success'; rg -n 'database unreachable|backup_heartbeat missing|heartbeat query failed|countFakeSuccessHeartbeats' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts",
      "maps_to_ac": null,
      "primary": true,
      "flow_ref": "T-PLAT-022",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-restore-cli+psql+PLATFORM_IT-Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "countFakeSuccessHeartbeats returns successRows:0/okRows:0 when tableExists.status!==0 or stdout!=='t'",
            "AC-4 expects heartbeats.successRows===0 without first asserting db probe succeeded",
            "missing backup_heartbeat is treated as zero fake-success proof",
            "broken DATABASE_URL greens AC-4"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "db_unreachable_or_heartbeat_missing",
            "action": {
              "actor": "test_oracle",
              "steps": [
                "Invoke the no-fake-success DB probe path used by AC-4 (countFakeSuccessHeartbeats or successor)",
                "Force or observe DB unreachable OR to_regclass('public.backup_heartbeat') not true OR COUNT query status!=0",
                "Assert the suite fails closed rather than asserting zero rows"
              ]
            },
            "end_state": {
              "must_observe": [
                "test failure message contains 'database unreachable' OR 'backup_heartbeat missing' OR 'heartbeat query failed'",
                "helper does not return {successRows:0, okRows:0, restoreParityRows:0} on probe failure",
                "evidence JSON includes db_probe_ok=false OR equivalent fail-closed marker"
              ],
              "must_not_observe": [
                "fabricated zeroes accepted as AC-4 pass",
                "raw: { table: 'missing_or_unreachable' } followed by expect(successRows).toBe(0) green",
                "empty/start signature: silent zero-count soft-pass"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN a real PLATFORM_IT Postgres with public.backup_heartbeat present WHEN AC-4 asserts no fake-success rows THEN the oracle MUST first observe successful COUNT queries (psql exit 0, integer stdout) for success/OK restore-scoped heartbeats before asserting COUNT=0.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'no fake-success'; test -f .tmp/D05-01/ac4-no-fake-success-row.json && jq -e '.db_probe_ok==true and .table_present==true and (.success_count_query_status==0)' .tmp/D05-01/ac4-no-fake-success-row.json",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-022",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "psql+backup_heartbeat",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "zero-row assertion runs without recording query status===0",
            "oracle skips SELECT to_regclass and COUNT against real DATABASE_URL",
            "evidence omits successRows/okRows after a successful query",
            "mock/stub replaces psql for heartbeat counts"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "platform_it_postgres_with_backup_heartbeat",
            "action": {
              "actor": "test_oracle",
              "steps": [
                "Connect via real psql to DATABASE_URL / DATABASE_URL_OWNER",
                "Confirm SELECT to_regclass('public.backup_heartbeat') IS NOT NULL returns t",
                "Run COUNT(*) for success/OK restore/pitr-scoped rows with ON_ERROR_STOP=1",
                "Only then assert counts equal 0"
              ]
            },
            "end_state": {
              "must_observe": [
                "db_probe_ok === true",
                "table_present === true",
                "success_count_query_status === 0",
                "successRows is integer from successful COUNT (may be 0 only after query_ok)",
                "okRows is integer from successful COUNT"
              ],
              "must_not_observe": [
                "zero counts without query_ok",
                "table missing accepted as success",
                "empty/start signature: raw.table=='missing_or_unreachable' with green AC-4"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN holo restore invocations for empty and corrupted fixtures WHEN asserting AC-4 no-fake-success THEN the oracle MUST distinguish CLI parse/unknown-flag failures from restore-path failures \u2014 unknown flag: --pitr alone MUST NOT satisfy the AC-4 restore-path contract.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'no fake-success'; rg -n 'unknown flag|parser|restore-path|restore_path' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-022",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-restore-cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "both empty and corrupt restores fail only with 'unknown flag: --pitr' and AC-4 still claims restore-path no-fake-success proven",
            "oracle treats any non-zero exit as restore-path proof without inspecting stderr class",
            "parser error is conflated with 'no base backup available' / corruption named errors"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty_r2_repo_and_corrupted_manifest_repo",
            "action": {
              "actor": "cli_user",
              "steps": [
                "spawnSync real holo restore --pitr against empty fixture scratch",
                "spawnSync real holo restore --pitr against corrupted fixture scratch",
                "Classify each failure: parser/unknown-flag vs restore-path (named missing/corrupt chain)",
                "Gate AC-4 zero-row claim on restore-path class OR explicitly mark RED pending D05-02 with parser-class non-proof"
              ]
            },
            "end_state": {
              "must_observe": [
                "evidence records emptyRestore.failure_class and corruptRestore.failure_class as 'parser' OR 'restore_path'",
                "when both classes are 'parser', AC-4 does NOT claim restore-path no-fake-success proven (suite remains honestly RED or fails the restore-path assertion)",
                "when class is 'restore_path', stderr contains named restore failure (e.g. 'no base backup available' OR 'backup chain missing' OR 'manifest checksum mismatch' OR 'WAL segment corrupted' OR 'backup chain integrity check failed') AND exit code != 0"
              ],
              "must_not_observe": [
                "unknown flag: --pitr alone recorded as AC-4 restore-path pass",
                "exit 2 parser-only treated as verified empty-chain fail-closed product behavior",
                "empty/start signature: ac4-no-fake-success-row.json green with only parser errors"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN restore-path failures against empty and corrupted fixtures AND a successful real backup_heartbeat COUNT probe WHEN the restores exit non-zero on the restore path THEN ZERO rows exist in backup_heartbeat with status success/OK for restore/pitr jobs and ZERO parity restore-completed claims \u2014 never fabricated from a failed DB probe.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'no fake-success'; jq -e '.db_probe_ok==true and .successRows==0 and .okRows==0 and .restoreParityRows==0' .tmp/D05-01/ac4-no-fake-success-row.json",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-022",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-restore-cli+psql+backup_heartbeat",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "restore writes a success/OK heartbeat for a failed restore and oracle still greens",
            "oracle fabricates zeroes without query_ok",
            "parity tracking claims restore completed despite exit != 0",
            "unknown-flag-only path is used as the sole failed-restore evidence"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty_r2_repo",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run real holo restore --pitr against empty R2 repo fixture",
                "Confirm restore-path (or honest RED classification per AC-3)",
                "Run fail-closed heartbeat COUNT probe with query_ok gate",
                "Assert successRows===0 and okRows===0 only if query_ok"
              ]
            },
            "end_state": {
              "must_observe": [
                "emptyRestore.status != 0",
                "db_probe_ok === true before zero asserts",
                "COUNT(*) success/OK restore-scoped rows === 0",
                "restoreParityRows === 0 when parity tables queried successfully"
              ],
              "must_not_observe": [
                "backup_heartbeat row with status 'success' or 'OK' for failed empty restore",
                "zero counts without db_probe_ok",
                "empty/start signature: any OK record COUNT(*) >= 1 for restore jobs"
              ]
            }
          },
          {
            "start_ref": "corrupted_manifest_repo",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run real holo restore --pitr against corrupted manifest fixture",
                "Confirm restore-path (or honest RED classification per AC-3)",
                "Run fail-closed heartbeat COUNT probe with query_ok gate",
                "Assert successRows===0 and okRows===0 only if query_ok"
              ]
            },
            "end_state": {
              "must_observe": [
                "corruptRestore.status != 0",
                "db_probe_ok === true before zero asserts",
                "COUNT(*) success/OK restore-scoped rows === 0",
                "restoreParityRows === 0 when parity tables queried successfully"
              ],
              "must_not_observe": [
                "backup_heartbeat row with status 'success' for corrupted-chain restore",
                "parity row claiming restore completed despite corruption",
                "empty/start signature: fabricated zeroes on missing table"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN write_allowed test and evidence paths change WHEN typecheck and lint run THEN pnpm tsgo --noEmit and pnpm biome check . exit 0 on the touched RED test.",
      "verify": "pnpm tsgo --noEmit; pnpm biome check services/platform/tests/integration/sprint28-restore-fails-closed.test.ts",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-022",
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": "toolchain",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "typecheck or lint failures ignored on the RED test file",
            "biome/ts errors introduced by fail-closed helper rewrite"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "write_allowed_red_test_paths",
            "action": {
              "actor": "developer",
              "steps": [
                "Run pnpm tsgo --noEmit",
                "Run pnpm biome check on the RED test file"
              ]
            },
            "end_state": {
              "must_observe": [
                "typecheck exit 0",
                "biome check exit 0 on sprint28-restore-fails-closed.test.ts"
              ],
              "must_not_observe": [
                "unchecked write_allowed TypeScript errors",
                "biome diagnostics ignored"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "countFakeSuccessHeartbeats (or successor) hard-fails on missing table / unreachable DB \u2014 no fabricated zeroes",
      "verify": "rg -n 'missing_or_unreachable|successRows: 0' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts | head; ! rg -U 'if \\(tableExists\\.status !== 0 \\|\\| tableExists\\.stdout !== .t.\\) \\{[\\s\\S]*?successRows: 0' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts; rg -n 'database unreachable|backup_heartbeat missing|heartbeat query failed' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "AC-4 evidence requires db_probe_ok/table_present and query status 0 before zero asserts",
      "verify": "rg -n 'db_probe_ok|table_present|success_count_query_status' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "AC-4 distinguishes parser unknown-flag from restore_path failure class",
      "verify": "rg -n 'unknown flag|failure_class|restore_path|parser' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "PLATFORM_IT live no-fake-success case still spawns real holo restore and queries real backup_heartbeat",
      "verify": "rg -n 'runHoloRestore|spawnSync.*holo|backup_heartbeat|psqlDb' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts; ! rg -Eq 'vi\\.mock\\(.*restore|mock.*backup_heartbeat' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "RED evidence for C-2 fail-closed oracle recorded under .tmp",
      "verify": "test -f .tmp/REDHAT-FIX-C2/red-output.txt || test -f .tmp/D05-01/ac4-no-fake-success-row.json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Typecheck + biome clean on RED test",
      "verify": "pnpm tsgo --noEmit; pnpm biome check services/platform/tests/integration/sprint28-restore-fails-closed.test.ts",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->

</details>
