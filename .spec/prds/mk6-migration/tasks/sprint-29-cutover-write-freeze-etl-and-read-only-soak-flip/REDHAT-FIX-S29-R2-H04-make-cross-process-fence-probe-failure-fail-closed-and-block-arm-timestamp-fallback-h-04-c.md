# REDHAT-FIX-S29-R2-H04 — Make cross-process fence probe failure fail closed and block arm timestamp fallback (H-04; convex-fence-client.ts:341-382,442-465)

## What this does

Close cycle-2 HIGH H-04: if child process output cannot be parsed, runCrossProcessBlockedWriteProbe falls back to an in-process mutation (convex-fence-client.ts:341-382) and freeze stamps fence_armed_at after that fallback (:442-465) without requiring child_pid. H05 requires cross-process blocked-write observation before arm; in-process fallback cannot prove deployment propagation and must fail closed instead.

## Why

Remediate cycle-2 red-hat finding for CAP-CUT-01 (`REDHAT-FIX-S29-R2-H04`). Grounded in UC-SYNC-03 / UC-SYNC-04 / T-SYNC-008–010 / CAP-CUT-01 (and CAP-MIG-01 when ETL parity applies). Review evidence: `.spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md` (reviewed SHA `cab5c0717974a96e33c338105b5d198d82cb607d`).

## How to verify

- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-fence-arm-order.test.ts → exit 0`
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts → exit 0`
- `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h04-red.log`
- `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h04-green.log`
- `pnpm tsgo --noEmit` → exit 0

## Scope

Writes: services/platform/src/cutover/convex-fence-client.ts (MODIFY) — remove in-process success fallback; fail closed; require child_pid before arm, services/platform/src/cli/holo.ts (MODIFY) — only if freeze error codes/output need exposure, services/platform/tests/integration/sprint29-fence-arm-order.test.ts (MODIFY) — fail-closed + child_pid RED/GREEN, services/platform/tests/integration/sprint29-convex-fence.test.ts (MODIFY) — only if shared freeze assertions, .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/ (evidence logs and freeze-report samples)

Prohibited: Reintroducing arm-before-confirm Date.now() authority (H05 regression), Treating in-process mutation rejection as durable deployment propagation proof, Mocking child process identity without real OS spawn, Any file not listed in write_allowed

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S29-R2-H04 — Make cross-process fence probe failure fail closed and block arm timestamp fallback (H-04; convex-fence-client.ts:341-382,442-465)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (90 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: convex-planner
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
Unparseable child / spawn failure / timeout causes probe fail-closed (rejected false or throw); runCutoverFreeze refuses arm and does not write authoritative fence_armed_at; successful arm requires cross_process_probe.rejected==true, migration_read_only: prefix, and non-null child_pid; RED fails against HEAD fallback path; GREEN blocks arm on probe failure; evidence under .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h04-*.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST make runCrossProcessBlockedWriteProbe refuse to treat in-process mutation as a success path for freeze arming (remove or hard-fail the pre-fix fallback at convex-fence-client.ts:341-382)
- MUST fail closed on unparseable child output, spawn failure, timeout, or missing rejected boolean — return rejected:false with explicit error message and/or throw; freeze must refuse arm
- MUST stamp fence_armed_at ONLY after successful cross-process probe with non-null child_pid (or equivalent real process identity from OS-spawned child) AND rejected==true AND migration_read_only: message prefix
- MUST make runCutoverFreeze distinguish cross-process success vs in-process fallback before arm (pre-fix :442-465 does not check child_pid)
- MUST produce RED evidence against current fallback path (unparseable/spawn-fail still arms via in-process) and GREEN proving arm blocked when probe fails
- MUST write evidence under .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h04-red.log and ...-green.log (plus freeze-report samples)
- MUST keep real live deployment mutation in the child process path (never mock rejection as proof)
- NEVER fall back to in-process client.mutation(docsCreate) as a success path that can arm the fence (pre-fix :341-382)
- NEVER stamp fence_armed_at when cross_process_probe.child_pid is null after a fallback (pre-fix :381 + :464-465)
- NEVER treat in-process rejection as proof of deployment-wide durable fence propagation
- NEVER soft-pass unparseable child stdout by arming after fallback
- NEVER reintroduce arm-before-confirm ordering fixed by H05
- NEVER mock cross-process probe without real child process identity
- STRICTLY finding id H-04 HIGH preserved with lineage to report + convex-fence-client.ts:341-382,442-465 + SHA cab5c0717974a96e33c338105b5d198d82cb607d
- STRICTLY flow_ref T-SYNC-009 confirm-then-arm; residual of REDHAT-FIX-S29-H05 AC-2
- STRICTLY tdd_mode red_first: RED proves HEAD fallback arms; GREEN proves fail-closed blocks arm
- STRICTLY freeze-report.cross_process_probe.child_pid is non-null number on successful arm
- STRICTLY related H05 arm-after-confirm remains; this task closes cross-process-only probe integrity

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN child spawn fails or stdout cannot be parsed into CrossProcessProbe WHEN …
- [ ] AC-2: GIVEN cross-process probe fails closed (spawn/unparseable/timeout/accepted writ…
- [ ] AC-3: GIVEN successful OS-spawned child probe WHEN freeze arms THEN freeze-report.cro…
- [ ] AC-4: GIVEN integration RED tests for H-04 WHEN suite runs against unfixed HEAD fallb…
- [ ] `pnpm tsgo --noEmit` clean + biome clean on touched paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — GIVEN child spawn fails or stdout cannot be parsed into CrossProcessP… (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN child spawn fails or stdout cannot be parsed into CrossProcessProbe WHEN runCrossProcessBlockedWriteProbe runs THEN it MUST NOT fall back to in-process mutation as a success path; it fails closed (rejected:false with diagnostic and/or throws) so freeze cannot treat it as durable cross-process proof (H-04; pre-fix :341-382).
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: convex
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-fence-arm-order.test.ts -t 'cross-process-probe-fail-closed-no-inprocess-fallback'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: cross_process_child_output_unparseable
  MUST_OBSERVE: AC-1 report field ok equals true OR exit_code equals 1; AC-1 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; probe fails closed (rejected==false OR thrown error); AC-1 observed_status equals literal 'PASS' and observed_count >= 1; AC-1 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-2 — GIVEN cross-process probe fails closed (spawn/unparseable/timeout/acc… (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN cross-process probe fails closed (spawn/unparseable/timeout/accepted write) WHEN operator runs cutover:freeze THEN freeze refuses arm — does not stamp authoritative fence_armed_at, does not persist success freeze-report ok:true, and does not record final arm audit as armed-on-fallback.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: convex
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-fence-arm-order.test.ts -t 'freeze-refuses-arm-when-cross-process-probe-fails'; bun services/platform/src/cli/holo.ts cutover:freeze --reason s29-r2-h04-probe-fail --json; test $? -ne 0`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: fence_env_confirmable_probe_forced_fail
  MUST_OBSERVE: AC-2 report field ok equals true OR exit_code equals 1; AC-2 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; AC-2 observed_status equals literal 'PASS' and observed_count >= 1; no ok:true freeze-report with authoritative fence_armed_at after fallback; AC-2 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-3 — GIVEN successful OS-spawned child probe WHEN freeze arms THEN freeze-… (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN successful OS-spawned child probe WHEN freeze arms THEN freeze-report.cross_process_probe has rejected==true, message starts with migration_read_only:, child_pid is a non-null number (process identity), and fence_armed_at is stamped only after that probe success.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: convex
  VERIFY: `bun services/platform/src/cli/holo.ts cutover:freeze --reason s29-r2-h04 --json | jq -e '.ok==true and .cross_process_probe.rejected==true and (.cross_process_probe.message|startswith("migration_read_only:")) and (.cross_process_probe.child_pid|type=="number") and .fence_armed_at>=.confirmed_at_ms'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: convex_dev_deployment_writes_enabled
  MUST_OBSERVE: AC-3 report field ok equals true OR exit_code equals 1; AC-3 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; AC-3 observed_status equals literal 'PASS' and observed_count >= 1; cross_process_probe.rejected==true; AC-3 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-4 — GIVEN integration RED tests for H-04 WHEN suite runs against unfixed … (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN integration RED tests for H-04 WHEN suite runs against unfixed HEAD fallback path (:341-382 arms via in-process; :442-465 does not require child_pid) THEN tests fail; WHEN fail-closed lands THEN suite GREEN with evidence logs.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: convex
  VERIFY: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h04-red.log; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-fence-arm-order.test.ts -t 'r2-h04|cross-process-probe-fail-closed|child_pid'; test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h04-green.log`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: pre_fix_inprocess_probe_fallback_path
  MUST_OBSERVE: AC-4 report field ok equals true OR exit_code equals 1; AC-4 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; AC-4 observed_status equals literal 'PASS' and observed_count >= 1; GREEN exit 0 with fail-closed + non-null child_pid arm; evidence files non-empty under .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Unparseable/spawn failure does not use in-process fallback success pa… | AC-1 | `vitest -t cross-process-probe-fail-closed-no-inpr…` |
| TC-2 | freeze refuses arm when probe fails closed | AC-2 | `vitest -t freeze-refuses-arm-when-cross-process-p…` |
| TC-3 | successful arm requires non-null child_pid | AC-3 | `jq -e '.cross_process_probe.child_pid|type=="numb…` |
| TC-4 | successful probe rejected==true with migration_read_only: prefix | AC-3 | `jq -e '.cross_process_probe.rejected==true'` |
| TC-5 | fence_armed_at only after cross-process success (not fallback) | AC-2 | `no arm when child_pid null` |
| TC-6 | RED fails on unfixed :341-382/:442-465; GREEN after fail-closed | AC-4 | `redhat-fix-s29-r2-h04-red.log + green suite` |
| TC-7 | child_pid:null is never accepted as freeze ok:true | AC-3 | `assert freeze ok implies child_pid number` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/cutover/convex-fence-client.ts (MODIFY) — remove in-process success fallback; fail closed; require child_pid before arm
- services/platform/src/cli/holo.ts (MODIFY) — only if freeze error codes/output need exposure
- services/platform/tests/integration/sprint29-fence-arm-order.test.ts (MODIFY) — fail-closed + child_pid RED/GREEN
- services/platform/tests/integration/sprint29-convex-fence.test.ts (MODIFY) — only if shared freeze assertions
- .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/ (evidence logs and freeze-report samples)
writeProhibited:
- Reintroducing arm-before-confirm Date.now() authority (H05 regression)
- Treating in-process mutation rejection as durable deployment propagation proof
- Mocking child process identity without real OS spawn
- Any file not listed in write_allowed

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md — §H-04 HIGH (lines 99-103) — cross-process probe degrades to in-process; freeze arms after fallback
2. .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md — H05 FAIL matrix (line 39) — Convex arm flow may fall back to in-process probe
3. services/platform/src/cutover/convex-fence-client.ts:341-382 — unparseable child → in-process mutation fallback; child_pid:null
4. services/platform/src/cutover/convex-fence-client.ts:442-465 — arm after rejected check without child_pid / cross-process identity gate
5. services/platform/src/cutover/convex-fence-client.ts:43-51 — CrossProcessProbe.child_pid documents null-if-fallback
6. services/platform/src/cutover/convex-fence-client.ts:273-398 — runCrossProcessBlockedWriteProbe full path including spawnSync bun --eval
7. services/platform/src/cutover/convex-fence-client.ts:400-471 — runCutoverFreeze confirm-then-arm sequence
8. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/REDHAT-FIX-S29-H05-prove-durable-fence-propagation-before-arm-timestamp-and-add-executable-rollback-repoint-evidence.md — prior H05 cross-process requirement this residual hardens
9. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/D06-03-durable-write-fence-cron-queue-drain-quiet-interval.md — AC-1 arm emission
10. services/platform/tests/integration/sprint29-fence-arm-order.test.ts — extend with fail-closed + child_pid RED/GREEN

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- G1: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-fence-arm-order.test.ts → exit 0` → Exit 0
- G2: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts → exit 0` → Exit 0
- G3: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h04-red.log` → Exit 0
- G4: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h04-green.log` → Exit 0
- G5: `bun services/platform/src/cli/holo.ts cutover:freeze --reason s29-r2-h04 --json | jq -e '.ok==true and .cross_process_probe.rejected==true and (.cross_process_probe.child_pid|type=="number")' → exit 0 (happy path)` → Exit 0
- G6: `pnpm tsgo --noEmit → exit 0` → Exit 0
- G7: `pnpm biome check . → exit 0` → Exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md, SPRINT.md
Interaction notes:
- Coordinate with sibling R2 remediations; do not fake-pass incomplete siblings
pattern: Strict cross-process probe protocol: spawn OS-separate child → parse JSON probe → require rejected + migration_read_only: + non-null child_pid → then stamp fence_armed_at. On unparseable/spawn/timeout/accept: fail closed; never fall back to parent in-process mutation for arm eligibility.
pattern_source: services/platform/src/cutover/convex-fence-client.ts:341-382, services/platform/src/cutover/convex-fence-client.ts:442-465, .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md §H-04
anti_pattern: In-process docsCreate fallback after unparseable child (:341-382); arm after rejected only without child_pid (:442-465); treating parent process mutation as deployment propagation proof.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — Cycle-2 residual of REDHAT-FIX-S29-H05: cross-process blocked-write probe degrades to in-process mutation fallback and freeze still stamps fence_armed_at. devops-engineer owns cutover freeze client arm ordering and durable probe evidence on convex-fence-client.ts; fail-closed probe is operational freeze safety, not schema design. Reviewer: code-reviewer (+ convex-reviewer).
Reviewer: code-reviewer (+ mastra-reviewer / convex-reviewer / test-quality-reviewer when domain-scoped)
Proposed By: convex-planner

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D06-03, REDHAT-FIX-S29-H05
Blocks: D06-03 AC-1 re-proof, freeze arm honesty for cutover

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
['Expanded by convex-planner for Sprint 29 cycle-2 red-hat remediation. Finding id H-04 HIGH preserved. Lineage: .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md §H-04 + services/platform/src/cutover/convex-fence-client.ts:341-382,442-465 + reviewed SHA cab5c0717974a96e33c338105b5d198d82cb607d. Residual of REDHAT-FIX-S29-H05 which required cross-process probe before arm but allowed in-process fallback when child output unparseable. Implementer must produce RED evidence of fallback arm path before GREEN fail-closed + child_pid gate.']

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-R2-H04",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "cross_process_child_output_unparseable": {
      "description": "Harness/mutant that makes bun --eval child emit non-JSON or omit rejected boolean so pre-fix fallback at :341 would engage.",
      "seed_method": "cli",
      "records": [
        "child stdout unparseable or missing rejected boolean",
        "pre-fix path falls back to in-process mutation with child_pid:null"
      ]
    },
    "fence_env_confirmable_probe_forced_fail": {
      "description": "Durable env can be set+confirmed to '1' but cross-process probe is forced to fail (spawn/parse) so arm must refuse.",
      "seed_method": "cli",
      "records": [
        "npx convex env set HOLO_MIGRATION_READ_ONLY 1 can succeed",
        "probe forced unparseable/spawn-fail",
        "expect freeze FAIL CLOSED before fence_armed_at"
      ]
    },
    "convex_dev_deployment_writes_enabled": {
      "description": "Real Convex deployment reachable for successful cross-process probe after confirm.",
      "seed_method": "public_api",
      "records": [
        "CONVEX_URL / EXPO_PUBLIC_CONVEX_URL set",
        "documents.create rejectable under fence",
        "child bun spawn works for happy path"
      ]
    },
    "pre_fix_inprocess_probe_fallback_path": {
      "description": "Documented pre-fix defect at reviewed SHA cab5c071: unparseable child \u2192 in-process fallback success; freeze arms without child_pid check.",
      "seed_method": "recorded_external",
      "records": [
        "services/platform/src/cutover/convex-fence-client.ts:341-382 in-process fallback returns rejected with child_pid:null",
        "services/platform/src/cutover/convex-fence-client.ts:442-465 arm after rejected check only \u2014 no child_pid gate",
        ".spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md \u00a7H-04"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-009",
      "description": "GIVEN child spawn fails or stdout cannot be parsed into CrossProcessProbe WHEN runCrossProcessBlockedWriteProbe runs THEN it MUST NOT fall back to in-process mutation as a success path; it fails closed (rejected:false with diagnostic and/or throws) so freeze cannot treat it as durable cross-process proof (H-04; pre-fix :341-382).",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-fence-arm-order.test.ts -t 'cross-process-probe-fail-closed-no-inprocess-fallback'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "convex",
        "topology": "single-node",
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
            "start_ref": "cross_process_child_output_unparseable",
            "action": {
              "actor": "test-runner",
              "steps": [
                "force unparseable child stdout or spawn failure (harness/mutant)",
                "call runCrossProcessBlockedWriteProbe",
                "assert no in-process success path; rejected false or throw; child_pid null only on failure path"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-1 report field ok equals true OR exit_code equals 1",
                "AC-1 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "probe fails closed (rejected==false OR thrown error)",
                "AC-1 observed_status equals literal 'PASS' and observed_count >= 1",
                "AC-1 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-009",
      "description": "GIVEN cross-process probe fails closed (spawn/unparseable/timeout/accepted write) WHEN operator runs cutover:freeze THEN freeze refuses arm \u2014 does not stamp authoritative fence_armed_at, does not persist success freeze-report ok:true, and does not record final arm audit as armed-on-fallback.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-fence-arm-order.test.ts -t 'freeze-refuses-arm-when-cross-process-probe-fails'; bun services/platform/src/cli/holo.ts cutover:freeze --reason s29-r2-h04-probe-fail --json; test $? -ne 0",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "convex",
        "topology": "single-node",
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
            "start_ref": "fence_env_confirmable_probe_forced_fail",
            "action": {
              "actor": "operator",
              "steps": [
                "set env so confirm can succeed but force probe parse/spawn failure",
                "run cutover:freeze --json",
                "assert non-zero exit / thrown FAIL CLOSED; no arm timestamp authority"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-2 report field ok equals true OR exit_code equals 1",
                "AC-2 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "AC-2 observed_status equals literal 'PASS' and observed_count >= 1",
                "no ok:true freeze-report with authoritative fence_armed_at after fallback",
                "AC-2 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-009",
      "description": "GIVEN successful OS-spawned child probe WHEN freeze arms THEN freeze-report.cross_process_probe has rejected==true, message starts with migration_read_only:, child_pid is a non-null number (process identity), and fence_armed_at is stamped only after that probe success.",
      "verify": "bun services/platform/src/cli/holo.ts cutover:freeze --reason s29-r2-h04 --json | jq -e '.ok==true and .cross_process_probe.rejected==true and (.cross_process_probe.message|startswith(\"migration_read_only:\")) and (.cross_process_probe.child_pid|type==\"number\") and .fence_armed_at>=.confirmed_at_ms'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "convex",
        "topology": "single-node",
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
            "start_ref": "convex_dev_deployment_writes_enabled",
            "action": {
              "actor": "operator",
              "steps": [
                "run cutover:freeze --json on real deployment",
                "inspect cross_process_probe.child_pid and arm ordering"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-3 report field ok equals true OR exit_code equals 1",
                "AC-3 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "AC-3 observed_status equals literal 'PASS' and observed_count >= 1",
                "cross_process_probe.rejected==true",
                "AC-3 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-009",
      "description": "GIVEN integration RED tests for H-04 WHEN suite runs against unfixed HEAD fallback path (:341-382 arms via in-process; :442-465 does not require child_pid) THEN tests fail; WHEN fail-closed lands THEN suite GREEN with evidence logs.",
      "verify": "test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h04-red.log; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-fence-arm-order.test.ts -t 'r2-h04|cross-process-probe-fail-closed|child_pid'; test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-h04-green.log",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "convex",
        "topology": "single-node",
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
            "start_ref": "pre_fix_inprocess_probe_fallback_path",
            "action": {
              "actor": "test-runner",
              "steps": [
                "RED: assert HEAD allows fallback arm (or new tests fail on HEAD)",
                "capture redhat-fix-s29-r2-h04-red.log",
                "GREEN: fail-closed + child_pid required",
                "capture redhat-fix-s29-r2-h04-green.log"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-4 report field ok equals true OR exit_code equals 1",
                "AC-4 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "AC-4 observed_status equals literal 'PASS' and observed_count >= 1",
                "GREEN exit 0 with fail-closed + non-null child_pid arm",
                "evidence files non-empty under .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Unparseable/spawn failure does not use in-process fallback success path",
      "maps_to_ac": "AC-1",
      "verify": "vitest -t cross-process-probe-fail-closed-no-inprocess-fallback"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "freeze refuses arm when probe fails closed",
      "maps_to_ac": "AC-2",
      "verify": "vitest -t freeze-refuses-arm-when-cross-process-probe-fails; freeze exit !=0"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "successful arm requires non-null child_pid",
      "maps_to_ac": "AC-3",
      "verify": "jq -e '.cross_process_probe.child_pid|type==\"number\"' freeze-report"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "successful probe rejected==true with migration_read_only: prefix",
      "maps_to_ac": "AC-3",
      "verify": "jq -e '.cross_process_probe.rejected==true'"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "fence_armed_at only after cross-process success (not fallback)",
      "maps_to_ac": "AC-2",
      "verify": "no arm when child_pid null"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "RED fails on unfixed :341-382/:442-465; GREEN after fail-closed",
      "maps_to_ac": "AC-4",
      "verify": "redhat-fix-s29-r2-h04-red.log + green suite"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "child_pid:null is never accepted as freeze ok:true",
      "maps_to_ac": "AC-3",
      "verify": "assert freeze ok implies child_pid number"
    }
  ],
  "touches_capabilities": [
    "CAP-CUT-01"
  ],
  "provides": [
    "fail-closed cross-process blocked-write probe without in-process success fallback",
    "fence_armed_at only after true cross-process probe with non-null child_pid",
    "freeze refusal when child spawn/output cannot prove deployment propagation"
  ],
  "consumes": [
    "HOLO_MIGRATION_READ_ONLY confirm-then-arm ordering from REDHAT-FIX-S29-H05",
    "CrossProcessProbe type (rejected, message, child_pid)",
    "migration_read_only: rejection prefix from durable env fence"
  ],
  "boundary_contracts": [
    "H05 requires cross-process blocked-write observation before arm; in-process fallback cannot prove deployment propagation",
    "CAP-CUT-01 freeze arm authority: env set \u2192 confirm \u2192 cross-process reject (child_pid non-null) \u2192 fence_armed_at",
    "child_pid:null is the signature of the forbidden fallback success path (pre-fix :381)",
    "NEVER stamp fence_armed_at after unparseable child output or spawn failure"
  ],
  "proposed_by": "convex-planner",
  "source_finding": {
    "id": "H-04",
    "severity": "HIGH",
    "report": ".spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md",
    "reviewed_sha": "cab5c0717974a96e33c338105b5d198d82cb607d",
    "related": [
      "REDHAT-FIX-S29-H05",
      "D06-03"
    ],
    "locations": [
      "services/platform/src/cutover/convex-fence-client.ts:341-382",
      "services/platform/src/cutover/convex-fence-client.ts:442-465",
      "services/platform/src/cutover/convex-fence-client.ts:43-51"
    ]
  }
}
-->

</details>
