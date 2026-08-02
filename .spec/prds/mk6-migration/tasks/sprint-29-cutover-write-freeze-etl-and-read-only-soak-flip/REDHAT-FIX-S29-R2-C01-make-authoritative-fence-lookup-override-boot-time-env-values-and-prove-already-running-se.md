# REDHAT-FIX-S29-R2-C01 — Make authoritative fence lookup override boot-time env values and prove already-running service propagation (C-01; secrets.ts:252-261, soak-fence.ts:94-103)

## What this does

Close red-hat C-01 (cycle-2) by making the authoritative durable HOLO_MIGRATION_READ_ONLY control-plane value win over boot-time process.env overlays from applyConsolidatedSecretsToEnv, and by proving an already-running serving process (started with HOLO_MIGRATION_READ_ONLY=0 / disarmed) observes cutover:flip without the test injecting HOLO_MIGRATION_READ_ONLY=1 into the child environment.

## Why

Remediate cycle-2 red-hat finding for CAP-CUT-01 (`REDHAT-FIX-S29-R2-C01`). Grounded in UC-SYNC-03 / UC-SYNC-04 / T-SYNC-008–010 / CAP-CUT-01 (and CAP-MIG-01 when ETL parity applies). Review evidence: `.spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md` (reviewed SHA `cab5c0717974a96e33c338105b5d198d82cb607d`).

## How to verify

- `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c01-red.log`
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts`
- `pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/soak-fence.ts services/platform/src/config/secrets.ts && pnpm tsgo --noEmit`
- `jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c01-path.json`
- `pnpm tsgo --noEmit` → exit 0

## Scope

Writes: services/platform/src/cutover/soak-fence.ts — MODIFY isMigrationReadOnly lookup order / durable override / flip report fields, services/platform/src/config/secrets.ts — MODIFY only if fence key must not be boot-pinned as '0' or must support reload, services/platform/src/index.ts — MODIFY only if boot overlay of HOLO_MIGRATION_READ_ONLY needs special-case, services/platform/src/stack/supervisor.ts and/or services/platform/src/stack/launchd.ts — MODIFY reload/restart acknowledgements if generation path chosen, services/platform/src/cli/holo.ts — MODIFY cutover:flip report fields only if needed, services/platform/tests/integration/sprint29-soak-flip.test.ts — MODIFY remove inject-only green; add already-running disarmed cases, services/platform/tests/integration/redhat-fix-s29-r2-c01-*.test.ts — NEW optional suite split, .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c01-** — evidence

Prohibited: app/, components/, hooks/, screens/ — RN flip Sprint 24, convex/** deletion — Convex stays live for rollback, services/platform/src/db/migrations/ — no Postgres fence table, Second fence mechanism (Redis flag, cutover_soak table, alternate env key), Re-scoping C-03 schedule drain (separate finding), Re-implementing rollback serving control plane (R2-C04 owns that)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S29-R2-C01 — Make authoritative fence lookup override boot-time env values and prove already-running service propagation (C-01; secrets.ts:252-261, soak-fence.ts:94-103)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L  (150 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-CUT-01
SPRINT:     [Sprint 29 — Cutover: Write Freeze, ETL and Read-Only Soak Flip](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
After cutover:flip writes HOLO_MIGRATION_READ_ONLY=1 to the durable control-plane, every pre-existing Hono/MCP/worker generation either reloads/restarts and acknowledges the new generation OR isMigrationReadOnly() re-reads durable on every call and treats durable '1' as armed even when process.env still holds boot-time '0'; a clean-env client POST write against that already-running service returns HTTP 423 dual-key migration_read_only; the soak suite no longer starts liveService with extraEnv HOLO_MIGRATION_READ_ONLY=1 as the sole propagation proof.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST preserve the single pinned fence key HOLO_MIGRATION_READ_ONLY (literal '1'/'true' armed; no second Postgres/Redis fence mechanism) at every write chokepoint (Hono middleware, MCP executor, queue runJob) — cite finding C-01 remediation #1
- MUST make authoritative durable control-plane lookup override boot-time process.env HOLO_MIGRATION_READ_ONLY:'0' applied by applyConsolidatedSecretsToEnv (secrets.ts:252-261) so an explicit process '0' cannot permanently disarm a post-flip durable '1' (soak-fence.ts:94-103)
- MUST prove fence propagation against an already-running serving process that booted disarmed (env HOLO_MIGRATION_READ_ONLY unset or '0' at startService) — after flip, clean-env client write is blocked without the test/client setting HOLO_MIGRATION_READ_ONLY=1
- MUST remove or replace the concealing pattern in sprint29-soak-flip.test.ts:159-172 that starts the live child with extraEnv HOLO_MIGRATION_READ_ONLY:'1' as the only path to a green C02/propagation case
- MUST capture RED evidence first at reviewed SHA cab5c0717974a96e33c338105b5d198d82cb607d proving boot-time '0' defeats durable flip for an already-running process
- NEVER invent a second fencing mechanism beyond HOLO_MIGRATION_READ_ONLY
- NEVER prove propagation solely by injecting HOLO_MIGRATION_READ_ONLY=1 into the child/client environment (sprint29-soak-flip.test.ts:159-172 anti-pattern; gate-plan client inject anti-pattern)
- NEVER leave isMigrationReadOnly() returning false solely because process.env still holds boot-applied '0' while durable secrets hold '1' (soak-fence.ts:98-103 short-circuit)
- NEVER delete convex/ or touch app/, components/, hooks/, screens/
- NEVER claim green via process-local setMigrationReadOnlyEnv alone without already-running service observation
- STRICTLY tdd_mode red_first with red log at .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c01-red.log
- STRICTLY PRIMARY ACs are test_tier integration or e2e against a real Hono/MCP child that was started disarmed, then flipped via durable control-plane
- STRICTLY rejection shapes unchanged: Hono 423 dual-key body; MCP Error('MIGRATION_READ_ONLY: ...'); queue {ok:false, error:'migration_read_only: ...'}
- STRICTLY secrets.yaml values are never committed; tests use disposable HOLO_SECRETS_PATH / HOLOCRON_SECRETS_PATH
- STRICTLY evidence under .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c01-*

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN disposable secrets control-plane with HOLO_MIGRATION_READ_ONLY set to lit…
- [ ] AC-2: GIVEN an already-running Hono/MCP serving child started WITHOUT extraEnv HOLO_M…
- [ ] AC-3: GIVEN MCP mutation tool and one queue write job against the post-flip already-r…
- [ ] AC-4: GIVEN pre-fix HEAD behavior at cab5c071 where boot overlay '0' defeats durable …
- [ ] AC-5: GIVEN source tree after R2-C01 WHEN typecheck and lint run on touched cutover/s…
- [ ] `pnpm tsgo --noEmit` clean + biome clean on touched paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — GIVEN disposable secrets control-plane with HOLO_MIGRATION_READ_ONLY … (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN disposable secrets control-plane with HOLO_MIGRATION_READ_ONLY set to literal '0' and a Node process env that has already applied that value via applyConsolidatedSecretsToEnv (boot overlay path secrets.ts:252-261) WHEN operator runs holo cutover:flip --json after a green D06-04 ETL precondition, writing durable HOLO_MIGRATION_READ_ONLY=1 THEN isMigrationReadOnly() in that same long-lived process returns true (authoritative durable wins over boot-time env '0'); flip-report records durable engage + lookup mode
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: control-plane + cutover CLI
  VERIFY: `HOLO_SECRETS_PATH=$TMP/secrets.yaml bun services/platform/src/cli/holo.ts cutover:flip --json; node -e "process.env.HOLO_MIGRATION_READ_ONLY='0'; process.env.HOLO_SECRETS_PATH=process.env.HOLO_SECRETS_PATH; const {isMigrationReadOnly}=require('./services/platform/src/cutover/soak-fence.ts'); if(!isMigrationReadOnly()) process.exit(2)"; jq -e '.ok==true and (.env_value=="1" or .durable_value=="1")' .tmp/D06-05/flip-report.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: boot_overlay_zero_then_flip
  MUST_OBSERVE: AC-1 report field ok equals true OR exit_code equals 1; AC-1 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; isMigrationReadOnly() === true with process.env.HOLO_MIGRATION_READ_ONLY still '0' OR process reloaded so env and durable both '1' with flip-report.process_generations.after differing from before; flip-report.ok === true; durable control-plane file contains HOLO_MIGRATION_READ_ONLY set to literal 1 (match count >= 1); flip-report documents lookup_mode 'durable_overrides_env' OR durable_reread==true OR process_generations.after differs for >=1 serving unit
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-2 [PRIMARY] — GIVEN an already-running Hono/MCP serving child started WITHOUT extra… (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN an already-running Hono/MCP serving child started WITHOUT extraEnv HOLO_MIGRATION_READ_ONLY=1 (disarmed boot; process may hold secrets-applied '0') WHEN operator completes cutover:flip against disposable control-plane and issues POST /api/documents from a clean-env client (env -u HOLO_MIGRATION_READ_ONLY) THEN HTTP status is literal 423; body.error and body.code equal 'migration_read_only'; documents row count unchanged
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: hono serving process
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'R2-C01|already-running|durable-override'; env -u HOLO_MIGRATION_READ_ONLY curl -sS -o /tmp/r2-c01-write.json -w '%{http_code}' -X POST "$PLATFORM_URL/api/documents" -H "authorization: Bearer $HOLO_KEY_RN" -H 'content-type: application/json' -d '{"title":"r2-c01","content":"x"}'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: already_running_disarmed_service
  MUST_OBSERVE: AC-2 report field ok equals true OR exit_code equals 1; AC-2 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; live child start env does not set HOLO_MIGRATION_READ_ONLY=1 (extraEnv omits key or sets '0'); HTTP status of clean-env POST equals the literal 423; response body.error equals the literal string 'migration_read_only'; response body.code equals the literal string 'migration_read_only'; AC-2 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-3 — GIVEN MCP mutation tool and one queue write job against the post-flip… (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN MCP mutation tool and one queue write job against the post-flip already-running service WHEN operator invokes one mutation tools/call and one runJob write path without client fence inject THEN MCP returns MIGRATION_READ_ONLY error shape and job returns ok:false with migration_read_only prefix
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: mcp-gateway + queue
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'R2-C01|mcp|job'; jq -e '.mcp_blocked==true and .job_blocked==true' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c01-mcp-job.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: already_running_disarmed_service
  MUST_OBSERVE: AC-3 report field ok equals true OR exit_code equals 1; AC-3 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; MCP isError === true; MCP code or message starts with 'MIGRATION_READ_ONLY'; job result ok === false; job error string includes 'migration_read_only'
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-4 — GIVEN pre-fix HEAD behavior at cab5c071 where boot overlay '0' defeat… (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN pre-fix HEAD behavior at cab5c071 where boot overlay '0' defeats durable flip for long-lived processes WHEN implementer completes R2-C01 red→green THEN non-empty red log, green evidence, and path.json path=A agent=devops-engineer exist under the R2-C01 evidence tree
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: filesystem
  VERIFY: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c01-red.log && test -f .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c01-path.json && jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c01-path.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: pre_fix_boot_overlay_defeats_fence
  MUST_OBSERVE: AC-4 report field ok equals true OR exit_code equals 1; AC-4 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; redhat-fix-s29-r2-c01-red.log exists and size > 0; path.json path field equals 'A'; path.json agent equals 'devops-engineer'; at least one green evidence file size > 0 under redhat-fix-s29-r2-c01-*
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-5 — GIVEN source tree after R2-C01 WHEN typecheck and lint run on touched… (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN source tree after R2-C01 WHEN typecheck and lint run on touched cutover/secrets/test paths THEN pnpm tsgo --noEmit exit 0 and biome check exit 0 on write_allowed surfaces
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: toolchain
  VERIFY: `pnpm tsgo --noEmit; pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/soak-fence.ts services/platform/src/config/secrets.ts services/platform/tests/integration/sprint29-soak-flip.test.ts`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: post_fix_tree
  MUST_OBSERVE: AC-5 report field ok equals true OR exit_code equals 1; AC-5 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; tsgo exit code == 0; biome exit code == 0
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | isMigrationReadOnly returns true when durable control-plane is '1' ev… | AC-1 | `unit/integration probe with env='0' + durable sec…` |
| TC-2 | already-running liveService started without HOLO_MIGRATION_READ_ONLY=… | AC-2 | `PLATFORM_IT=1 vitest sprint29-soak-flip R2-C01 al…` |
| TC-3 | documents row count is unchanged across the blocked cross-process wri… | AC-2 | `SELECT count(*) before/after POST` |
| TC-4 | MCP mutation and queue write job are blocked with MIGRATION_READ_ONLY… | AC-3 | `tools/call + runJob assertions` |
| TC-5 | sprint29-soak-flip.test.ts does not start the live child with extraEn… | AC-2 | `rg -n "HOLO_MIGRATION_READ_ONLY: '1'" services/pl…` |
| TC-6 | RED evidence log is non-empty for boot-overlay-defeats-fence HEAD beh… | AC-4 | `test -s .tmp/.../redhat-fix-s29-r2-c01-red.log` |
| TC-7 | Typecheck and lint are clean on write_allowed surfaces | AC-5 | `pnpm tsgo --noEmit && scoped biome` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/cutover/soak-fence.ts — MODIFY isMigrationReadOnly lookup order / durable override / flip report fields
- services/platform/src/config/secrets.ts — MODIFY only if fence key must not be boot-pinned as '0' or must support reload
- services/platform/src/index.ts — MODIFY only if boot overlay of HOLO_MIGRATION_READ_ONLY needs special-case
- services/platform/src/stack/supervisor.ts and/or services/platform/src/stack/launchd.ts — MODIFY reload/restart acknowledgements if generation path chosen
- services/platform/src/cli/holo.ts — MODIFY cutover:flip report fields only if needed
- services/platform/tests/integration/sprint29-soak-flip.test.ts — MODIFY remove inject-only green; add already-running disarmed cases
- services/platform/tests/integration/redhat-fix-s29-r2-c01-*.test.ts — NEW optional suite split
- .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c01-** — evidence
writeProhibited:
- app/, components/, hooks/, screens/ — RN flip Sprint 24
- convex/** deletion — Convex stays live for rollback
- services/platform/src/db/migrations/ — no Postgres fence table
- Second fence mechanism (Redis flag, cutover_soak table, alternate env key)
- Re-scoping C-03 schedule drain (separate finding)
- Re-implementing rollback serving control plane (R2-C04 owns that)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md:43-49 — C-01 CRITICAL finding
2. .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md:105-106 — remediation #1 authoritative fence vs boot env
3. services/platform/src/config/secrets.ts:252-261 — applyConsolidatedSecretsToEnv skips existing env keys
4. services/platform/src/cutover/soak-fence.ts:94-103 — isMigrationReadOnly process-first short-circuit on '0'
5. services/platform/src/index.ts:84-89 — startService applyConsolidatedSecretsToEnv at boot
6. services/platform/tests/integration/sprint29-soak-flip.test.ts:159-172 — child started with HOLO_MIGRATION_READ_ONLY=1 conceals defect
7. services/platform/src/cutover/soak-fence.ts:66-79 — readDurableMigrationReadOnly
8. .spec/prds/mk6-migration/08-uc-sync.md:44-52 — UC-SYNC-03 write paths return migration_read_only
9. D06-01-red-every-write-path-returns-migration-read-only-during-soak.md — fence contract parent
10. REDHAT-FIX-S29-C02-implement-a-durable-distributed-production-write-fence-and-reciprocal-rollback-repoint-c-02.md — prior durable fence task

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- gate: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c01-red.log` → Exit 0
- gate: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts` → Exit 0
- gate: `pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/soak-fence.ts services/platform/src/config/secrets.ts && pnpm tsgo --noEmit` → Exit 0
- gate: `jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c01-path.json` → Exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md#C-01, services/platform/src/config/secrets.ts:252-261, services/platform/src/cutover/soak-fence.ts:94-103, services/platform/tests/integration/sprint29-soak-flip.test.ts:159-172, REDHAT-FIX-S29-C02 durable fence contract
Interaction notes:
- Coordinate with sibling R2 remediations; do not fake-pass incomplete siblings
pattern: Authoritative durable control-plane HOLO_MIGRATION_READ_ONLY wins over boot-time process.env for fence decisions (prefer durable re-read every call when process holds '0'/'false' OR exclude HOLO_MIGRATION_READ_ONLY from applyConsolidatedSecretsToEnv sticky skip and reload/restart generations with ack). Prove with already-running disarmed child + clean-env write block. Keep single-key contract.
pattern_source: Review remediation #1 + D06-01/C02 pinned HOLO_MIGRATION_READ_ONLY contract + secrets overlay semantics
anti_pattern: process.env '0' short-circuit without durable reread (soak-fence.ts:98-103); boot apply pins '0' forever (secrets.ts:252-261); starting child with HOLO_MIGRATION_READ_ONLY=1 to green tests (sprint29-soak-flip.test.ts:159-172); inventing a second fence key

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — PRIMARY surface is production control-plane fence observation in already-running Hono/MCP/worker processes: boot secrets overlay (secrets.ts), isMigrationReadOnly() lookup order (soak-fence.ts), and live-service flip propagation without client/child HOLO_MIGRATION_READ_ONLY inject. This is operator-facing cutover infra on CAP-CUT-01, not Mastra agent/tool framework code. Implementer stays devops-engineer; planner is mastra-planner; reviewers = mastra-reviewer + test-quality-reviewer on process-env override and already-running-service oracles.
Reviewer: code-reviewer (+ mastra-reviewer / convex-reviewer / test-quality-reviewer when domain-scoped)
Proposed By: mastra-planner

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: REDHAT-FIX-S29-C02, D06-01, D06-05
Blocks: unqualified-sprint-29-close, REDHAT-FIX-S29-R2-H02

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
['Finding lineage: .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md finding C-01 CRITICAL; reviewed SHA cab5c0717974a96e33c338105b5d198d82cb607d', "Cycle-2 fix: C02 durable file write is insufficient while process.env boot '0' wins; this task closes the already-running service gap without a second fence mechanism", 'Fakeability: AC-2 must fail if suite reintroduces startLiveService extraEnv HOLO_MIGRATION_READ_ONLY=1 as sole proof', 'Coordinates with R2-C04 (serving control plane for rollback) but does not implement data-plane repoint']

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-R2-C01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "boot_overlay_zero_then_flip": {
      "description": "Disposable secrets.yaml with HOLO_MIGRATION_READ_ONLY: '0' applied into process.env via applyConsolidatedSecretsToEnv, then flip writes durable '1'.",
      "seed_method": "migration_fixture",
      "records": [
        "HOLO_SECRETS_PATH disposable file initially HOLO_MIGRATION_READ_ONLY: '0'",
        "process.env.HOLO_MIGRATION_READ_ONLY === '0' after applyConsolidatedSecretsToEnv",
        "green D06-04 watermark/etl precondition for flip admit"
      ]
    },
    "already_running_disarmed_service": {
      "description": "Real Hono/MCP child started via startLiveService WITHOUT extraEnv HOLO_MIGRATION_READ_ONLY=1, listening on free port, accepting HTTP before flip.",
      "seed_method": "cli",
      "records": [
        "GET $PLATFORM_URL/health returns 200",
        "child process env omits HOLO_MIGRATION_READ_ONLY=1",
        "pid/generation recorded before flip"
      ]
    },
    "pre_fix_boot_overlay_defeats_fence": {
      "description": "Recorded defect at cab5c071: secrets.ts:252-261 skips overwrite when env already set; soak-fence.ts:94-103 returns false on explicit '0' without durable reread; test injects fence at :159-172.",
      "seed_method": "recorded_external",
      "records": [
        "services/platform/src/config/secrets.ts:252-261",
        "services/platform/src/cutover/soak-fence.ts:94-103",
        "services/platform/tests/integration/sprint29-soak-flip.test.ts:159-172",
        ".spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md C-01"
      ]
    },
    "post_fix_tree": {
      "description": "Post-implementation working tree with R2-C01 changes only on write_allowed paths.",
      "seed_method": "cli",
      "records": [
        "git status shows only write_allowed paths for product changes",
        "evidence tree redhat-fix-s29-r2-c01-* present"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN disposable secrets control-plane with HOLO_MIGRATION_READ_ONLY set to literal '0' and a Node process env that has already applied that value via applyConsolidatedSecretsToEnv (boot overlay path secrets.ts:252-261) WHEN operator runs holo cutover:flip --json after a green D06-04 ETL precondition, writing durable HOLO_MIGRATION_READ_ONLY=1 THEN isMigrationReadOnly() in that same long-lived process returns true (authoritative durable wins over boot-time env '0'); flip-report records durable engage + lookup mode",
      "verify": "HOLO_SECRETS_PATH=$TMP/secrets.yaml bun services/platform/src/cli/holo.ts cutover:flip --json; node -e \"process.env.HOLO_MIGRATION_READ_ONLY='0'; process.env.HOLO_SECRETS_PATH=process.env.HOLO_SECRETS_PATH; const {isMigrationReadOnly}=require('./services/platform/src/cutover/soak-fence.ts'); if(!isMigrationReadOnly()) process.exit(2)\"; jq -e '.ok==true and (.env_value==\"1\" or .durable_value==\"1\")' .tmp/D06-05/flip-report.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "topology": "single-node",
        "verification_service": "control-plane + cutover CLI",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "boot_overlay_zero_then_flip",
            "action": {
              "actor": "operator",
              "steps": [
                "seed disposable secrets HOLO_MIGRATION_READ_ONLY=0",
                "applyConsolidatedSecretsToEnv into process env bag",
                "run cutover:flip writing durable 1",
                "call isMigrationReadOnly with process.env still holding '0'"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-1 report field ok equals true OR exit_code equals 1",
                "AC-1 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "isMigrationReadOnly() === true with process.env.HOLO_MIGRATION_READ_ONLY still '0' OR process reloaded so env and durable both '1' with flip-report.process_generations.after differing from before",
                "flip-report.ok === true",
                "durable control-plane file contains HOLO_MIGRATION_READ_ONLY set to literal 1 (match count >= 1)",
                "flip-report documents lookup_mode 'durable_overrides_env' OR durable_reread==true OR process_generations.after differs for >=1 serving unit"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "integration"
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN an already-running Hono/MCP serving child started WITHOUT extraEnv HOLO_MIGRATION_READ_ONLY=1 (disarmed boot; process may hold secrets-applied '0') WHEN operator completes cutover:flip against disposable control-plane and issues POST /api/documents from a clean-env client (env -u HOLO_MIGRATION_READ_ONLY) THEN HTTP status is literal 423; body.error and body.code equal 'migration_read_only'; documents row count unchanged",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'R2-C01|already-running|durable-override'; env -u HOLO_MIGRATION_READ_ONLY curl -sS -o /tmp/r2-c01-write.json -w '%{http_code}' -X POST \"$PLATFORM_URL/api/documents\" -H \"authorization: Bearer $HOLO_KEY_RN\" -H 'content-type: application/json' -d '{\"title\":\"r2-c01\",\"content\":\"x\"}'",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "scenario": {
        "topology": "single-node",
        "verification_service": "hono serving process",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "already_running_disarmed_service",
            "action": {
              "actor": "operator",
              "steps": [
                "start live service without fence inject",
                "record pid/generation",
                "cutover:flip",
                "clean-env POST /api/documents"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-2 report field ok equals true OR exit_code equals 1",
                "AC-2 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "live child start env does not set HOLO_MIGRATION_READ_ONLY=1 (extraEnv omits key or sets '0')",
                "HTTP status of clean-env POST equals the literal 423",
                "response body.error equals the literal string 'migration_read_only'",
                "response body.code equals the literal string 'migration_read_only'",
                "AC-2 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "e2e"
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN MCP mutation tool and one queue write job against the post-flip already-running service WHEN operator invokes one mutation tools/call and one runJob write path without client fence inject THEN MCP returns MIGRATION_READ_ONLY error shape and job returns ok:false with migration_read_only prefix",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'R2-C01|mcp|job'; jq -e '.mcp_blocked==true and .job_blocked==true' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c01-mcp-job.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "topology": "single-node",
        "verification_service": "mcp-gateway + queue",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "already_running_disarmed_service",
            "action": {
              "actor": "operator",
              "steps": [
                "flip",
                "MCP mutation tools/call",
                "enqueue/run write job"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-3 report field ok equals true OR exit_code equals 1",
                "AC-3 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "MCP isError === true",
                "MCP code or message starts with 'MIGRATION_READ_ONLY'",
                "job result ok === false",
                "job error string includes 'migration_read_only'"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "integration"
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN pre-fix HEAD behavior at cab5c071 where boot overlay '0' defeats durable flip for long-lived processes WHEN implementer completes R2-C01 red\u2192green THEN non-empty red log, green evidence, and path.json path=A agent=devops-engineer exist under the R2-C01 evidence tree",
      "verify": "test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c01-red.log && test -f .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c01-path.json && jq -e '.path==\"A\" and .agent==\"devops-engineer\"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c01-path.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "topology": "single-node",
        "verification_service": "filesystem",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "pre_fix_boot_overlay_defeats_fence",
            "action": {
              "actor": "cli_user",
              "steps": [
                "capture red against cab5c071 defect",
                "implement durable override / reload",
                "capture green",
                "write path.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-4 report field ok equals true OR exit_code equals 1",
                "AC-4 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "redhat-fix-s29-r2-c01-red.log exists and size > 0",
                "path.json path field equals 'A'",
                "path.json agent equals 'devops-engineer'",
                "at least one green evidence file size > 0 under redhat-fix-s29-r2-c01-*"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "integration"
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN source tree after R2-C01 WHEN typecheck and lint run on touched cutover/secrets/test paths THEN pnpm tsgo --noEmit exit 0 and biome check exit 0 on write_allowed surfaces",
      "verify": "pnpm tsgo --noEmit; pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/soak-fence.ts services/platform/src/config/secrets.ts services/platform/tests/integration/sprint29-soak-flip.test.ts",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "topology": "single-node",
        "verification_service": "toolchain",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "post_fix_tree",
            "action": {
              "actor": "cli_user",
              "steps": [
                "tsgo",
                "biome"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-5 report field ok equals true OR exit_code equals 1",
                "AC-5 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "tsgo exit code == 0",
                "biome exit code == 0"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "integration"
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "isMigrationReadOnly returns true when durable control-plane is '1' even if process.env.HOLO_MIGRATION_READ_ONLY is still '0'",
      "maps_to_ac": "AC-1",
      "verify": "unit/integration probe with env='0' + durable secrets='1'"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "already-running liveService started without HOLO_MIGRATION_READ_ONLY=1 blocks clean-env POST with HTTP 423 after flip",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 vitest sprint29-soak-flip R2-C01 already-running case"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "documents row count is unchanged across the blocked cross-process write",
      "maps_to_ac": "AC-2",
      "verify": "SELECT count(*) before/after POST"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "MCP mutation and queue write job are blocked with MIGRATION_READ_ONLY / migration_read_only after flip on the already-running service",
      "maps_to_ac": "AC-3",
      "verify": "tools/call + runJob assertions"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "sprint29-soak-flip.test.ts does not start the live child with extraEnv HOLO_MIGRATION_READ_ONLY=1 as the sole propagation proof",
      "maps_to_ac": "AC-2",
      "verify": "rg -n \"HOLO_MIGRATION_READ_ONLY: '1'\" services/platform/tests/integration/sprint29-soak-flip.test.ts; suite still greens R2-C01"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "RED evidence log is non-empty for boot-overlay-defeats-fence HEAD behavior at cab5c071",
      "maps_to_ac": "AC-4",
      "verify": "test -s .tmp/.../redhat-fix-s29-r2-c01-red.log"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "Typecheck and lint are clean on write_allowed surfaces",
      "maps_to_ac": "AC-5",
      "verify": "pnpm tsgo --noEmit && scoped biome"
    }
  ],
  "touches_capabilities": [
    "CAP-CUT-01"
  ],
  "provides": [
    "authoritative-fence-overrides-boot-env",
    "already-running-service-fence-propagation-proof"
  ],
  "consumes": [
    "d06-01-pinned-holo-migration-read-only-contract",
    "redhat-fix-s29-c02-durable-control-plane-write",
    "platform-secrets-overlay"
  ],
  "boundary_contracts": [
    "HOLO_MIGRATION_READ_ONLY remains the sole fence key",
    "Already-running process observation required without child env inject",
    "Tripwire/write block shapes unchanged across Hono/MCP/queue"
  ],
  "proposed_by": "mastra-planner",
  "source_finding": {
    "report": ".spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md",
    "reviewed_sha": "cab5c0717974a96e33c338105b5d198d82cb607d"
  }
}
-->

</details>
