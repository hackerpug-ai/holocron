# REDHAT-FIX-S29-H05 — Prove durable fence propagation before arm timestamp and add executable rollback repoint evidence (H-05; convex-fence-client.ts:199-237, 08-uc-sync.md:56-62)

## What this does

Close red-hat H-05 HIGH: record fence_armed_at ONLY after durable HOLO_MIGRATION_READ_ONLY deployment set+confirmation, prove with a successful cross-process blocked-write observation, and land an executable auditable config re-point action that restores the data plane to frozen Convex under a no-accepted-post-export-write precondition (UC-SYNC-04).

## Why

Remediate red-hat finding for CAP-CUT-01 (REDHAT-FIX-S29-H05). Grounded in UC-SYNC-03 / UC-SYNC-04 / UC-SYNC-04, UC-SYNC-03, T-SYNC-009, T-SYNC-010. Review evidence: `.spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md` (reviewed SHA `2b966c7b60559ec9986cf737ed5322a6146c7960`).

## How to verify

- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-fence-arm-order.test.ts → exit 0`
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-rollback-repoint.test.ts → exit 0`
- `bun services/platform/src/cli/holo.ts cutover:freeze --reason s29-h05 --json | jq -e '.ok==true and .fence_armed_at>=.confirmed_at_ms and .cross_process_probe.rejected==true' → exi`
- `bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json | jq -e '(.ok==true and .repointed==true) or (.error.code=="POST_EXPORT_WRITE_ACCEPTED" or .error.code=="ROLLB`
- `pnpm tsgo --noEmit → exit 0`
- `pnpm tsgo --noEmit` → exit 0

## Scope

Writes: services/platform/src/cutover/convex-fence-client.ts (MODIFY) — arm-after-confirm ordering + cross-process probe fields, services/platform/src/cutover/rollback-repoint.ts (NEW) — executable re-point + precondition, services/platform/src/cutover/soak-fence.ts (MODIFY) — only if flip/repoint shared config surface, services/platform/src/cli/holo.ts (MODIFY) — cutover:rollback-repoint (+ freeze output fields if needed), convex/migrationFence/audit.ts or equivalent (MODIFY) — only if arm audit must move after confirm, services/platform/tests/integration/sprint29-fence-arm-order.test.ts (NEW), services/platform/tests/integration/sprint29-rollback-repoint.test.ts (NEW), services/platform/tests/integration/sprint29-convex-fence.test.ts (MODIFY), .tmp/D06-03/** .tmp/D06-05/** .tmp/REDHAT-FIX-S29-H05/** (evidence)

Prohibited: Docs-only rollback without executable CLI/control-plane action, Deleting Convex deployment as rollback, Reintroducing arm-before-set Date.now() authority, Mocking cross-process probe without real mutation against deployment, Allowing re-point after accepted post-export write, Any file not listed in write_allowed

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S29-H05 — Prove durable fence propagation before arm timestamp and add executable rollback repoint evidence (H-05; convex-fence-client.ts:199-237, 08-uc-sync.md:56-62)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: convex-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-CUT-01, CAP-MIG-01
SPRINT:     [Sprint 29 — Cutover: Write Freeze, ETL and Read-Only Soak Flip](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-fence-arm-order.test.ts services/platform/tests/integration/sprint29-rollback-repoint.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/convex-fence-client.ts services/platform/src/cutover/soak-fence.ts services/platform/tests/integration/sprint29-fence-arm-order.test.ts services/platform/tests/integration/sprint29-rollback-repoint.test.ts

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
holo cutover:freeze emits fence_armed_at strictly after confirmed env=='1' and after a cross-process mutation rejection is observed; freeze-report/audit timestamps cannot precede confirmation; holo cutover:rollback-repoint (or documented equivalent) executes a real config re-point with evidence artifact, refuses when any post-export production write was accepted, and is not docs-only.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST record fence_armed_at ONLY after npx convex env set HOLO_MIGRATION_READ_ONLY=1 succeeds AND getMigrationReadOnlyEnv confirms '1'|'true'
- MUST prove durable fence propagation with a successful cross-process blocked-write observation before (or as the final gate of) arm timestamp finalization
- MUST fail freeze if confirmation fails (existing fail-closed) AND must not persist optimistic pre-confirmation fence_armed_at as the authoritative arm time
- MUST add an executable, auditable control-plane/config re-point action that points the data plane back to frozen Convex (UC-SYNC-04)
- MUST enforce no-accepted-post-export-write precondition on rollback re-point (refuse if any accepted production write after export watermark)
- MUST emit machine-readable freeze-report fields: confirmed_at_ms, cross_process_probe, fence_armed_at with fence_armed_at >= confirmed_at_ms
- MUST emit machine-readable rollback-repoint report with precondition result and config target evidence
- NEVER set fence_armed_at = Date.now() before env set/confirmation (pre-fix :199 ordering)
- NEVER treat article-baseline capturedAtMs > optimistic pre-confirmation timestamp as proof of durable fence propagation
- NEVER ship rollback as documentation-only runbook without an executable CLI/control-plane action and evidence artifact
- NEVER allow rollback re-point when accepted post-export production writes exist (point of no return)
- NEVER delete Convex cloud deployment as a 'rollback' (rollback is re-point, not decommission)
- STRICTLY arm ordering: env set → confirm → cross-process blocked write observed → then fence_armed_at + audit record
- STRICTLY UC-SYNC-04:56-62 rollback eligibility only during read-only soak with zero accepted post-export writes
- STRICTLY finding id H-05 preserved with evidence lineage to convex-fence-client.ts:199-237 and 08-uc-sync.md:56-62

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN convex_dev_deployment_writes_enabled WHEN operator runs cutover:freeze THEN fence...
- [ ] AC-2: GIVEN freeze confirmation succeeded WHEN freeze finalizes arm THEN a cross-process bloc...
- [ ] AC-3: GIVEN read-only soak with export watermark and zero accepted post-export writes WHEN op...
- [ ] AC-4: GIVEN any accepted post-export production write (point of no return) WHEN operator runs...
- [ ] AC-5: GIVEN article baseline capture AFTER corrected freeze WHEN capturedAtMs is compared to ...
- [ ] `pnpm tsgo --noEmit` clean + biome clean on touched paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 — AC-1 (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN convex_dev_deployment_writes_enabled WHEN operator runs cutover:freeze THEN fence_armed_at is recorded only after durable env confirmation; freeze-report shows confirmed_at_ms <= fence_armed_at and no authoritative arm timestamp exists from pre-confirmation Date.now().
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: convex
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-fence-arm-order.test.ts -t 'arm-after-confirm'; bun services/platform/src/cli/holo.ts cutover:freeze --reason 's29-h05' --json | jq -e '.ok==true and .confirmed_at_ms>0 and .fence_armed_at>=.confirmed_at_ms'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if fence_armed_at is stamped at function entry before convex env set (pre-fix :199); audit recordFenceArmed runs before confirmation with that optimistic timestamp (:204-208 before :219-237); confirmed_at_ms is missing and fence_armed_at alone is treated as proof of deployment; arm_at is pre-confirmation but article-baseline still compares capturedAtMs > fence_armed_at as sufficient
  START_REF: convex_dev_deployment_writes_enabled
  MUST_OBSERVE: npx convex env get HOLO_MIGRATION_READ_ONLY returns '1'; confirmed_at_ms is a real epoch-ms > 0; fence_armed_at >= confirmed_at_ms; migrationFenceAudit fenceArmedAtMs equals freeze-report fence_armed_at (post-confirmation value)
  MUST_NOT_OBSERVE: fence_armed_at < confirmed_at_ms; authoritative arm timestamp taken before env set returns; audit row with pre-confirmation optimistic ms as final fence_armed_at
  EVIDENCE: file_artifact (required_capture=True)

### AC-2 — AC-2 (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN freeze confirmation succeeded WHEN freeze finalizes arm THEN a cross-process blocked-write observation proves the durable fence (separate process/client mutation rejected with migration_read_only:) before fence_armed_at is committed; freeze fails if probe accepts a write.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: convex
  VERIFY: `jq -e '.cross_process_probe.rejected==true and (.cross_process_probe.message|startswith("migration_read_only:"))' .tmp/D06-03/freeze-report.json; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-fence-arm-order.test.ts -t 'cross-process-blocked-write'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if probe runs in the same optimistic path without observing durable deployment env; probe is skipped and freeze still ok:true; probe accepts a write (row count increases) yet freeze reports armed; only in-process mock of rejection without real Convex mutation call
  START_REF: fence_env_confirmed_awaiting_arm
  MUST_OBSERVE: cross_process_probe.rejected==true; cross_process_probe.message starts with migration_read_only:; documents row count unchanged across probe; fence_armed_at recorded only after probe success (rejection)
  MUST_NOT_OBSERVE: probe accepted with new _id; freeze ok without cross_process_probe; row count increase
  EVIDENCE: api_response (required_capture=True)

### AC-3 — AC-3 (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN read-only soak with export watermark and zero accepted post-export writes WHEN operator runs cutover:rollback-repoint (executable CLI/control-plane action) THEN data plane config is re-pointed to frozen Convex with auditable evidence; action is not docs-only.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: platform
  VERIFY: `bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json | jq -e '.ok==true and .repointed==true and .target=="convex-frozen"'; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-rollback-repoint.test.ts -t 'executable-repoint'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if rollback exists only as markdown runbook text without CLI case / executable module (docs-only); command is a no-op that prints success without writing config/control-plane state; no rollback-repoint-report.json (or equivalent) audit artifact; unknown command: cutover:rollback-repoint
  START_REF: soak_export_complete_zero_accepted_post_export
  MUST_OBSERVE: CLI verb is registered (not unknown command); report.ok==true and report.repointed==true; report includes target identity for frozen Convex and config write evidence path/digest; executable module under services/platform/src/cutover/ (or equivalent) performs the re-point
  MUST_NOT_OBSERVE: docs-only mention without CLI; ok:true with no config mutation evidence; unknown command
  EVIDENCE: file_artifact (required_capture=True)

### AC-4 — AC-4 (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN any accepted post-export production write (point of no return) WHEN operator runs cutover:rollback-repoint THEN command refuses with a named error (e.g. POST_EXPORT_WRITE_ACCEPTED / ROLLBACK_INELIGIBLE) and does not re-point.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: platform
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-rollback-repoint.test.ts -t 'no-accepted-post-export-write-precondition'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if re-point proceeds despite accepted post-export write; precondition is not checked (docs claim only); exit 0 with repointed true when writes_accepted_after_export>0
  START_REF: post_export_write_accepted
  MUST_OBSERVE: non-zero exit; error.code is POST_EXPORT_WRITE_ACCEPTED or ROLLBACK_INELIGIBLE (literal); repointed is false or absent; config target remains pre-command state
  MUST_NOT_OBSERVE: ok:true; repointed:true; silent success
  EVIDENCE: stdout (required_capture=True)

### AC-5 — AC-5 (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN article baseline capture AFTER corrected freeze WHEN capturedAtMs is compared to fence_armed_at THEN ordering proves post-confirmation durable fence (capturedAtMs > fence_armed_at where fence_armed_at itself is post-confirmation), and RED tests fail against pre-fix :199-237 ordering.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: convex
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-fence-arm-order.test.ts -t 'baseline-after-confirmed-arm'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if baseline only proves capturedAtMs > optimistic pre-confirmation Date.now() from :199; tests green against unfixed arm-before-set ordering; freeze-report lacks confirmed_at_ms so ordering cannot be validated
  START_REF: post_confirmation_fence_armed
  MUST_OBSERVE: fence_armed_at >= confirmed_at_ms; capturedAtMs > fence_armed_at; RED suite fails on pre-fix ordering implementation
  MUST_NOT_OBSERVE: capturedAtMs proof only against pre-confirmation optimistic arm; GREEN on unfixed :199-237
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | fence_armed_at >= confirmed_at_ms after freeze | AC-1 | `jq -e '.fence_armed_at >= .confirmed_at_ms' .tmp/D06-03/freeze-report.json` |
| TC-2 | cross_process_probe.rejected==true with migration_read_only: prefix | AC-2 | `jq -e '.cross_process_probe.rejected==true' .tmp/D06-03/freeze-report.json` |
| TC-3 | cutover:rollback-repoint is a registered executable command | AC-3 | `bun services/platform/src/cli/holo.ts cutover:rollback-repoint --help; echo $? != unknown` |
| TC-4 | rollback re-point emits auditable report with repointed evidence | AC-3 | `jq -e '.ok==true and .repointed==true' .tmp/D06-05/rollback-repoint-report.json` |
| TC-5 | rollback refuses when post-export write accepted | AC-4 | `expect error.code POST_EXPORT_WRITE_ACCEPTED\|ROLLBACK_INELIGIBLE` |
| TC-6 | article baseline capturedAtMs > post-confirmation fence_armed_at | AC-5 | `jq compare baseline vs freeze-report` |
| TC-7 | RED fails against pre-fix arm-before-set ordering at :199-237 | AC-1 | `vitest non-zero on unfixed SHA for arm-order tests` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/cutover/convex-fence-client.ts (MODIFY) — arm-after-confirm ordering + cross-process probe fields
- services/platform/src/cutover/rollback-repoint.ts (NEW) — executable re-point + precondition
- services/platform/src/cutover/soak-fence.ts (MODIFY) — only if flip/repoint shared config surface
- services/platform/src/cli/holo.ts (MODIFY) — cutover:rollback-repoint (+ freeze output fields if needed)
- convex/migrationFence/audit.ts or equivalent (MODIFY) — only if arm audit must move after confirm
- services/platform/tests/integration/sprint29-fence-arm-order.test.ts (NEW)
- services/platform/tests/integration/sprint29-rollback-repoint.test.ts (NEW)
- services/platform/tests/integration/sprint29-convex-fence.test.ts (MODIFY)
- .tmp/D06-03/** .tmp/D06-05/** .tmp/REDHAT-FIX-S29-H05/** (evidence)
writeProhibited:
- Docs-only rollback without executable CLI/control-plane action
- Deleting Convex deployment as rollback
- Reintroducing arm-before-set Date.now() authority
- Mocking cross-process probe without real mutation against deployment
- Allowing re-point after accepted post-export write
- Any file not listed in write_allowed

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md — §H-05 HIGH (lines 110-116) — arm timestamp before env set/confirmation; no executable rollback re-point despite UC-SYNC-04
2. .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md — D06-03 AC-1 PARTIAL (line 35); AC-5 PARTIAL (line 39) — timestamp before durable set; baseline vs pre-confirmation arm
3. services/platform/src/cutover/convex-fence-client.ts:199-237 — runCutoverFreeze: fence_armed_at=Date.now() FIRST, recordFenceArmed, then convexEnv set, then confirm loop
4. services/platform/src/cutover/convex-fence-client.ts:199 — fence_armed_at = Date.now() before any durable propagation
5. services/platform/src/cutover/convex-fence-client.ts:204-208 — auditApi.recordFenceArmed with pre-confirmation timestamp
6. services/platform/src/cutover/convex-fence-client.ts:219-237 — env set + fail-closed confirmation AFTER arm timestamp
7. .spec/prds/mk6-migration/08-uc-sync.md:56-62 — UC-SYNC-04: re-point data plane to frozen Convex after Sev-1 with zero accepted post-export writes
8. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/D06-03-durable-write-fence-cron-queue-drain-quiet-interval.md — AC-1 arm emission; AC-5 baseline ordering; STRICTLY reversible flag
9. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/D06-05-flip-app-plus-mcp-into-rollbackable-read-only-soak-run-verification-ga.md — soak flip surface; related C-02 durable fence
10. services/platform/src/cutover/article-baseline.ts — capturedAtMs vs fence_armed_at consumer
11. services/platform/src/cutover/soak-fence.ts — current flip writes process.env + .tmp only (C-02 related; H-05 adds reciprocal re-point)
12. services/platform/tests/integration/sprint29-convex-fence.test.ts — existing freeze/baseline tests to extend

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-fence-arm-order.test.ts → exit 0
- PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-rollback-repoint.test.ts → exit 0
- bun services/platform/src/cli/holo.ts cutover:freeze --reason s29-h05 --json | jq -e '.ok==true and .fence_armed_at>=.confirmed_at_ms and .cross_process_probe.rejected==true' → exit 0
- bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json | jq -e '(.ok==true and .repointed==true) or (.error.code=="POST_EXPORT_WRITE_ACCEPTED" or .error.code=="ROLLBACK_INELIGIBLE")' → exit 0 under appropriate fixture
- pnpm tsgo --noEmit → exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: services/platform/src/cutover/convex-fence-client.ts:199-237, .spec/prds/mk6-migration/08-uc-sync.md:56-62, services/platform/src/cutover/article-baseline.ts, .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md §H-05
Interaction notes:
- —
pattern: Confirm-then-arm freeze protocol: set durable env → confirm via convex env get → cross-process blocked write → stamp fence_armed_at/audit → write freeze-report. Rollback protocol: verify accepted_post_export_writes==0 → write control-plane config re-point to frozen Convex → emit auditable report; refuse at point of no return.
pattern_source: ['services/platform/src/cutover/convex-fence-client.ts:199-237', '.spec/prds/mk6-migration/08-uc-sync.md:56-62', 'services/platform/src/cutover/article-baseline.ts', '.spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md §H-05']
anti_pattern: Optimistic Date.now() arm before set/confirm (:199-237); baseline ordering against optimistic timestamp; docs-only UC-SYNC-04 rollback; silent no-op re-point.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — H-05 spans cutover freeze client arm-ordering and UC-SYNC-04 rollback control-plane repoint. Both are deployment/runtime cutover surfaces already owned by devops-engineer on D06-03/D06-05; ordering fix is in runCutoverFreeze and rollback is an executable config operation, not Convex schema design.
Reviewer: code-reviewer (+ mastra-reviewer / convex-reviewer when domain-scoped)
Proposed By: convex-planner

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D06-03, REDHAT-FIX-S29-C02
Blocks: D06-03 AC-1/AC-5 re-proof, UC-SYNC-04 rollback drill readiness (Sprint 30)

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
Expanded by convex-planner for Sprint 29 red-hat remediation. Finding id H-05 HIGH preserved. Pre-fix arm order is fence_armed_at first (:199), audit (:204-208), set (:219), confirm (:227-237). Related CRITICAL C-02 owns durable distributed new-stack fence; H-05 owns Convex arm ordering + executable rollback re-point evidence. Coordinate config surface with REDHAT-FIX-S29-C02 without duplicating scope.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-H05",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "convex_dev_deployment_writes_enabled": {
      "description": "Real Convex dev deployment reachable; HOLO_MIGRATION_READ_ONLY unset or '0'; baseline mutation succeeds.",
      "seed_method": "public_api",
      "records": [
        "npx convex env get HOLO_MIGRATION_READ_ONLY returns '' or '0'",
        "documents.create returns a new _id"
      ]
    },
    "fence_env_confirmed_awaiting_arm": {
      "description": "HOLO_MIGRATION_READ_ONLY confirmed '1' via convex env get after set, but authoritative fence_armed_at not yet finalized pending cross-process probe.",
      "seed_method": "cli",
      "records": [
        "npx convex env set HOLO_MIGRATION_READ_ONLY 1 succeeded",
        "getMigrationReadOnlyEnv returns '1'|'true'",
        "cross_process_probe not yet recorded"
      ]
    },
    "post_confirmation_fence_armed": {
      "description": "Freeze completed with post-confirmation fence_armed_at and cross-process rejection evidence; ready for article baseline.",
      "seed_method": "cli",
      "records": [
        "freeze-report.json has confirmed_at_ms and fence_armed_at with fence_armed_at>=confirmed_at_ms",
        "cross_process_probe.rejected==true",
        "shareToken document available for baseline capture"
      ]
    },
    "soak_export_complete_zero_accepted_post_export": {
      "description": "Read-only soak state after export watermark: freeze armed, ETL/export done, zero accepted production writes after export \u2014 UC-SYNC-04 rollback-eligible.",
      "seed_method": "cli",
      "records": [
        "export watermark present",
        "accepted_post_export_writes==0",
        "Convex deployment still live (not deleted)",
        "new-stack soak config currently active (flip state)"
      ]
    },
    "post_export_write_accepted": {
      "description": "Point-of-no-return fixture: at least one accepted Postgres/production write after export watermark; Convex rollback re-point must refuse.",
      "seed_method": "cli",
      "records": [
        "export watermark timestamp T_export",
        "accepted write with committed_at > T_export recorded",
        "rollback eligibility false"
      ]
    },
    "pre_fix_arm_before_confirm_ordering": {
      "description": "Pre-fix runCutoverFreeze ordering at convex-fence-client.ts:199-237: Date.now arm first, audit, then env set, then confirm.",
      "seed_method": "file_artifact",
      "records": [
        "services/platform/src/cutover/convex-fence-client.ts:199 fence_armed_at = Date.now() FIRST",
        "services/platform/src/cutover/convex-fence-client.ts:204-208 recordFenceArmed before set",
        "services/platform/src/cutover/convex-fence-client.ts:219-237 set+confirm after arm",
        ".spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md \u00a7H-05"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-009",
      "description": "Record fence_armed_at only after durable env confirmation (H-05); fail if arm_at is pre-confirmation",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verify": "jq -e '.fence_armed_at >= .confirmed_at_ms' freeze-report.json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "convex",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "fence_armed_at stamped before env set (pre-fix :199)",
            "audit uses optimistic pre-confirmation timestamp as authority"
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
                "run cutover:freeze --json"
              ]
            },
            "end_state": {
              "must_observe": [
                "fence_armed_at >= confirmed_at_ms",
                "env value '1'"
              ],
              "must_not_observe": [
                "pre-confirmation arm as authority"
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
      "description": "Cross-process blocked-write observation before arm commit (H-05)",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verify": "jq -e '.cross_process_probe.rejected==true' freeze-report.json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "convex",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "probe skipped",
            "probe accepts write",
            "in-process mock only"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fence_env_confirmed_awaiting_arm",
            "action": {
              "actor": "operator",
              "steps": [
                "cross-process documents.create",
                "record arm"
              ]
            },
            "end_state": {
              "must_observe": [
                "migration_read_only: rejection",
                "arm after probe"
              ],
              "must_not_observe": [
                "accepted write",
                "arm without probe"
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
      "flow_ref": "T-SYNC-010",
      "description": "Executable auditable rollback re-point to frozen Convex (H-05 / UC-SYNC-04); fail if docs-only",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verify": "holo cutover:rollback-repoint --json; jq .repointed",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "platform",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "rollback is docs-only runbook without CLI",
            "no-op success without config write evidence"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "soak_export_complete_zero_accepted_post_export",
            "action": {
              "actor": "operator",
              "steps": [
                "run cutover:rollback-repoint --json"
              ]
            },
            "end_state": {
              "must_observe": [
                "repointed==true",
                "auditable report"
              ],
              "must_not_observe": [
                "unknown command",
                "docs-only success"
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
      "flow_ref": "T-SYNC-010",
      "description": "No-accepted-post-export-write precondition on rollback re-point (H-05 / UC-SYNC-04:56-62)",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verify": "expect non-zero + POST_EXPORT_WRITE_ACCEPTED|ROLLBACK_INELIGIBLE",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "platform",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "re-point proceeds after accepted post-export write",
            "precondition docs-only"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "post_export_write_accepted",
            "action": {
              "actor": "operator",
              "steps": [
                "run rollback-repoint"
              ]
            },
            "end_state": {
              "must_observe": [
                "named error",
                "repointed false"
              ],
              "must_not_observe": [
                "ok:true"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-009",
      "description": "Article baseline ordering vs post-confirmation arm; RED kills pre-fix :199-237",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verify": "jq capturedAtMs > fence_armed_at; vitest arm-order RED/GREEN",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "convex",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "baseline only beats optimistic pre-confirmation timestamp",
            "tests green on unfixed ordering"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "post_confirmation_fence_armed",
            "action": {
              "actor": "operator",
              "steps": [
                "capture baseline",
                "compare timestamps"
              ]
            },
            "end_state": {
              "must_observe": [
                "capturedAtMs > fence_armed_at >= confirmed_at_ms"
              ],
              "must_not_observe": [
                "GREEN on pre-fix arm-before-set"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "fence_armed_at >= confirmed_at_ms",
      "maps_to_ac": "AC-1",
      "verify": "jq compare"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "cross_process_probe rejected",
      "maps_to_ac": "AC-2",
      "verify": "jq .cross_process_probe"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "rollback-repoint CLI registered",
      "maps_to_ac": "AC-3",
      "verify": "holo cutover:rollback-repoint"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "repoint report auditable",
      "maps_to_ac": "AC-3",
      "verify": "jq .repointed"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "post-export write blocks rollback",
      "maps_to_ac": "AC-4",
      "verify": "error.code"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "baseline after confirmed arm",
      "maps_to_ac": "AC-5",
      "verify": "jq capturedAtMs"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "RED on :199-237 pre-fix",
      "maps_to_ac": "AC-1",
      "verify": "vitest non-zero"
    }
  ],
  "touches_capabilities": [
    "CAP-CUT-01",
    "CAP-MIG-01"
  ],
  "provides": [
    "post-confirmation fence_armed_at with cross-process blocked-write proof",
    "holo cutover:rollback-repoint executable with no-accepted-post-export-write precondition"
  ],
  "consumes": [
    "HOLO_MIGRATION_READ_ONLY durable env fence",
    "migrationFenceAudit record/latest",
    "export watermark / post-export write audit for rollback precondition",
    "soak flip config surface (reciprocal of C-02 durable fence)"
  ],
  "boundary_contracts": [
    "UC-SYNC-04: rollback only during read-only soak; first accepted Postgres production write ends Convex rollback eligibility",
    "H-05 evidence lineage: convex-fence-client.ts:199-237 + 08-uc-sync.md:56-62 must be remediated"
  ],
  "proposed_by": "convex-planner"
}
-->

</details>
