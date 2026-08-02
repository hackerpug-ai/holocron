# REDHAT-FIX-S29-R2-C04 — Implement rollback through the serving control plane with live acknowledgements (C-04; rollback-repoint.ts:67-74,284-341)

## What this does

Close red-hat C-04 (cycle-2) by making cutover:rollback-repoint re-point the actual serving data plane to frozen Convex via a control-plane configuration that running server/worker/routing modules read, with live process acknowledgements, and by refusing to treat unconsumed .tmp/D06-05/data-plane-config.json alone as success evidence for repointed:true.

## Why

Remediate cycle-2 red-hat finding for CAP-CUT-01 (`REDHAT-FIX-S29-R2-C04`). Grounded in UC-SYNC-03 / UC-SYNC-04 / T-SYNC-008–010 / CAP-CUT-01 (and CAP-MIG-01 when ETL parity applies). Review evidence: `.spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md` (reviewed SHA `cab5c0717974a96e33c338105b5d198d82cb607d`).

## How to verify

- `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c04-red.log`
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-rollback-repoint.test.ts services/platform/tests/integration/sprint29-*.test.ts`
- `bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json | jq -e '.ok==true and (.acknowledgements|length)>=1'`
- `jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c04-path.json`
- `pnpm tsgo --noEmit` → exit 0

## Scope

Writes: services/platform/src/cutover/rollback-repoint.ts — MODIFY write serving control-plane + collect live acks, services/platform/src/cutover/soak-fence.ts — MODIFY share HOLO_DATA_PLANE helpers if needed; unify registered path, services/platform/src/cli/holo.ts — MODIFY wire registered command to serving control-plane path, services/platform/src/config/secrets.ts — MODIFY only if HOLO_DATA_PLANE persistence helpers needed, services/platform/src/index.ts and/or Hono health/control routes — MODIFY expose observed data_plane for acks, services/platform/src/stack/supervisor.ts and/or launchd.ts — MODIFY reload ack if generation path, services/platform/tests/integration/sprint29-rollback-repoint.test.ts — MODIFY/extend live-ack cases, services/platform/tests/integration/redhat-fix-s29-r2-c04-*.test.ts — NEW optional

Prohibited: Docs-only rollback without executable control-plane + live ack, Deleting convex/ or Convex deployment as rollback, app/, components/, hooks/, screens/, Allowing re-point after accepted post-export writes, Second fence mechanism, Treating unconsumed .tmp config as sole success oracle

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S29-R2-C04 — Implement rollback through the serving control plane with live acknowledgements (C-04; rollback-repoint.ts:67-74,284-341)
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
Registered holo cutover:rollback-repoint updates durable serving control-plane keys (e.g. HOLO_DATA_PLANE / routing target) consumed by running processes; processes ack the new generation or re-read config; rollback report includes live acknowledgements; a post-repoint probe shows data-plane target convex-frozen observed by a serving process; .tmp-only writes without consumers cannot yield ok:true/repointed:true.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST implement rollback through the serving control plane actually read by running Hono/MCP/worker/routing modules (not only write .tmp/D06-05/data-plane-config.json at rollback-repoint.ts:67-74,284-301)
- MUST require live acknowledgements after changing data-plane target (process_generations ack and/or serving health probe reporting data_plane=='convex' / target convex-frozen)
- MUST keep UC-SYNC-04 preconditions: refuse when accepted post-export production writes exist; never delete convex/ as rollback
- MUST record rollback report with ok, repointed, target, data_plane, engaged_at, configured_target (consumer path), and acknowledgements[] with at least one live unit
- MUST capture RED evidence at cab5c071 proving registered command only writes unconsumed .tmp artifacts yet reports repointed:true
- NEVER claim repointed:true solely after writing .tmp/D06-05/data-plane-config.json and/or soak-state.json when no runtime module reads them (rollback-repoint.ts:284-341)
- NEVER leave the registered CLI on the unconsumed path while an alternate soak-fence runCutoverRollbackRepoint is unused (holo.ts:3316-3335 imports rollback-repoint.ts only)
- NEVER delete Convex cloud deployment or convex/ tree as 'rollback'
- NEVER allow re-point after accepted post-export production write (point of no return)
- NEVER invent a second fence mechanism; soak fence may remain armed during repoint
- STRICTLY tdd_mode red_first; evidence under .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c04-*
- STRICTLY PRIMARY ACs integration/e2e with a real serving process that reads the control-plane target
- STRICTLY convex/ still exists after successful re-point
- STRICTLY data_plane target identity is concrete (e.g. convex-frozen) not empty
- STRICTLY UC-SYNC-04:56-62 rollback eligibility only during read-only soak with zero accepted post-export writes

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN soak_fence_engaged_with_running_service and zero accepted post-export wri…
- [ ] AC-2: GIVEN running_service_after_repoint WHEN operator queries a serving health/cont…
- [ ] AC-3: GIVEN post_export_write_accepted_ledger with accepted_count >= 1 WHEN operator …
- [ ] AC-4: GIVEN pre_fix_tmp_only_repoint at cab5c071 WHEN implementer completes R2-C04 TH…
- [ ] AC-5: GIVEN post_fix_tree WHEN typecheck and lint run THEN tsgo and biome clean on wr…
- [ ] `pnpm tsgo --noEmit` clean + biome clean on touched paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — GIVEN soak_fence_engaged_with_running_service and zero accepted post-… (flow_ref UC-SYNC-04)
  GIVEN/WHEN/THEN: GIVEN soak_fence_engaged_with_running_service and zero accepted post-export writes with export watermark present WHEN operator runs bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json THEN serving control-plane stores data_plane=convex / target convex-frozen in a path the running service loads; report.repointed==true only with live ack
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: control-plane + hono
  VERIFY: `bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json | jq -e '.ok==true and .repointed==true and .data_plane=="convex" and (.target|length)>0 and (.acknowledgements|length)>=1'; rg -n "HOLO_DATA_PLANE|convex-frozen" "$HOLO_SECRETS_PATH"`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: soak_fence_engaged_with_running_service
  MUST_OBSERVE: AC-1 report field ok equals true OR exit_code equals 1; AC-1 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; report.ok === true; report.repointed === true; report.data_plane === 'convex'; report.target is non-empty string (e.g. convex-frozen length >= 6); report.configured_target is non-empty consumer path or labeled control-plane id length >= 8
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-2 [PRIMARY] — GIVEN running_service_after_repoint WHEN operator queries a serving h… (flow_ref UC-SYNC-04)
  GIVEN/WHEN/THEN: GIVEN running_service_after_repoint WHEN operator queries a serving health/control endpoint or process-local reader that reflects data-plane config THEN live process observes data_plane convex / target convex-frozen (acknowledgement evidence, not file existence alone)
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: hono serving process
  VERIFY: `curl -sS "$PLATFORM_URL/health" | jq -e '.data_plane=="convex" or .target=="convex-frozen" or .rollback.target!=null'; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-rollback-repoint.test.ts -t 'R2-C04|live-ack'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: running_service_after_repoint
  MUST_OBSERVE: AC-2 report field ok equals true OR exit_code equals 1; AC-2 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; live process reports data_plane equals 'convex' OR target equals 'convex-frozen' OR equivalent routing flag observed_target length >= 6; AC-2 observed_status equals literal 'PASS' and observed_count >= 1; AC-2 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-3 — GIVEN post_export_write_accepted_ledger with accepted_count >= 1 WHEN… (flow_ref UC-SYNC-04)
  GIVEN/WHEN/THEN: GIVEN post_export_write_accepted_ledger with accepted_count >= 1 WHEN operator runs cutover:rollback-repoint --json THEN command refuses; ok false; error.code POST_EXPORT_WRITE_ACCEPTED or ROLLBACK_INELIGIBLE; no serving control-plane repoint applied
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: cutover CLI
  VERIFY: `bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json; test $? -ne 0; jq -e '.ok==false and (.error.code=="POST_EXPORT_WRITE_ACCEPTED" or .error.code=="ROLLBACK_INELIGIBLE")'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: post_export_write_accepted_ledger
  MUST_OBSERVE: AC-3 report field ok equals true OR exit_code equals 1; AC-3 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; ok === false; AC-3 observed_status equals literal 'PASS' and observed_count >= 1; exit code != 0; AC-3 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-4 — GIVEN pre_fix_tmp_only_repoint at cab5c071 WHEN implementer completes… (flow_ref UC-SYNC-04)
  GIVEN/WHEN/THEN: GIVEN pre_fix_tmp_only_repoint at cab5c071 WHEN implementer completes R2-C04 THEN RED proves unconsumed .tmp path; GREEN requires live ack; path.json A devops-engineer
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: filesystem
  VERIFY: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c04-red.log && jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c04-path.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: pre_fix_tmp_only_repoint
  MUST_OBSERVE: AC-4 report field ok equals true OR exit_code equals 1; AC-4 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; red log size > 0 documenting no runtime consumer of data-plane-config.json; AC-4 observed_status equals literal 'PASS' and observed_count >= 1; AC-4 observed_status equals literal 'PASS' and observed_count >= 1; green suite requires acknowledgements length >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-5 — GIVEN post_fix_tree WHEN typecheck and lint run THEN tsgo and biome c… (flow_ref UC-SYNC-04)
  GIVEN/WHEN/THEN: GIVEN post_fix_tree WHEN typecheck and lint run THEN tsgo and biome clean on write_allowed paths
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: toolchain
  VERIFY: `pnpm tsgo --noEmit; pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/rollback-repoint.ts services/platform/src/cutover/soak-fence.ts services/platform/src/cli/holo.ts`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: post_fix_tree
  MUST_OBSERVE: AC-5 report field ok equals true OR exit_code equals 1; AC-5 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; tsgo 0; biome 0
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | cutover:rollback-repoint writes HOLO_DATA_PLANE=convex (or equivalent… | AC-1 | `rg HOLO_DATA_PLANE $HOLO_SECRETS_PATH; report.con…` |
| TC-2 | rollback report acknowledgements array length >= 1 with live unit obs… | AC-1 | `jq -e '(.acknowledgements|length)>=1' rollback re…` |
| TC-3 | running serving process observes data_plane convex after repoint | AC-2 | `health/control probe or cross-process reader` |
| TC-4 | accepted post-export writes cause refuse with POST_EXPORT_WRITE_ACCEP… | AC-3 | `CLI exit non-zero + error.code` |
| TC-5 | repository-wide runtime consumer of data-plane target exists outside … | AC-1 | `rg HOLO_DATA_PLANE or data-plane config reader in…` |
| TC-6 | RED evidence non-empty for tmp-only repoint defect | AC-4 | `test -s redhat-fix-s29-r2-c04-red.log` |
| TC-7 | typecheck and lint clean | AC-5 | `pnpm tsgo --noEmit && scoped biome` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/cutover/rollback-repoint.ts — MODIFY write serving control-plane + collect live acks
- services/platform/src/cutover/soak-fence.ts — MODIFY share HOLO_DATA_PLANE helpers if needed; unify registered path
- services/platform/src/cli/holo.ts — MODIFY wire registered command to serving control-plane path
- services/platform/src/config/secrets.ts — MODIFY only if HOLO_DATA_PLANE persistence helpers needed
- services/platform/src/index.ts and/or Hono health/control routes — MODIFY expose observed data_plane for acks
- services/platform/src/stack/supervisor.ts and/or launchd.ts — MODIFY reload ack if generation path
- services/platform/tests/integration/sprint29-rollback-repoint.test.ts — MODIFY/extend live-ack cases
- services/platform/tests/integration/redhat-fix-s29-r2-c04-*.test.ts — NEW optional
- .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c04-** — evidence
writeProhibited:
- Docs-only rollback without executable control-plane + live ack
- Deleting convex/ or Convex deployment as rollback
- app/, components/, hooks/, screens/
- Allowing re-point after accepted post-export writes
- Second fence mechanism
- Treating unconsumed .tmp config as sole success oracle

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md:67-73 — C-04 CRITICAL finding
2. .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md:110 — remediation #4 serving control plane + live acks
3. services/platform/src/cutover/rollback-repoint.ts:67-74 — defaultDataPlaneConfigPath .tmp only
4. services/platform/src/cutover/rollback-repoint.ts:284-341 — write config + soak-state local only
5. services/platform/src/cli/holo.ts:3316-3335 — registered command imports rollback-repoint.ts
6. services/platform/src/cutover/soak-fence.ts:563-637 — alternate runCutoverRollbackRepoint writes HOLO_DATA_PLANE to secrets (not registered path)
7. .spec/prds/mk6-migration/08-uc-sync.md:56-62 — UC-SYNC-04 rollback plan
8. REDHAT-FIX-S29-H05-prove-durable-fence-propagation-before-arm-timestamp-and-add-executable-rollback-repoint-evidence.md — prior H05 contract

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- gate: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c04-red.log` → Exit 0
- gate: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-rollback-repoint.test.ts services/platform/tests/integration/sprint29-*.test.ts` → Exit 0
- gate: `bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json | jq -e '.ok==true and (.acknowledgements|length)>=1'` → Exit 0
- gate: `jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c04-path.json` → Exit 0
- gate: `pnpm tsgo --noEmit` → Exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md#C-04, services/platform/src/cutover/rollback-repoint.ts:67-74,284-341, services/platform/src/cutover/soak-fence.ts:563-637, 08-uc-sync.md:56-62
Interaction notes:
- Coordinate with sibling R2 remediations; do not fake-pass incomplete siblings
pattern: Registered cutover:rollback-repoint writes HOLO_DATA_PLANE=convex (+ target) to durable secrets/control-plane that startService/routing modules load; reloads or re-reads with live acknowledgements from serving units; report.repointed true only with acks; preserve post-export write refuse. Optionally unify with soak-fence runCutoverRollbackRepoint secrets path.
pattern_source: UC-SYNC-04 + review remediation #4 + existing HOLO_DATA_PLANE constant in soak-fence.ts
anti_pattern: repointed:true after .tmp/D06-05/data-plane-config.json only; soak-state with zero consumers; docs-only rollback; deleting convex/

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — PRIMARY surface is UC-SYNC-04 executable data-plane rollback through the real serving control plane (secrets/stack/routing consumed by running Hono/MCP/workers) with live acknowledgements — not an unconsumed .tmp file. Prior H05/C02 registered cutover:rollback-repoint but C-04 proves consumers. Implementer = devops-engineer; planner = mastra-planner; reviewers = mastra-reviewer + test-quality-reviewer.
Reviewer: code-reviewer (+ mastra-reviewer / convex-reviewer / test-quality-reviewer when domain-scoped)
Proposed By: mastra-planner

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: REDHAT-FIX-S29-C02, REDHAT-FIX-S29-H05, D06-05
Blocks: unqualified-sprint-29-close

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
['Finding lineage: .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md finding C-04 CRITICAL; reviewed SHA cab5c0717974a96e33c338105b5d198d82cb607d', 'Cycle-2: H05 made the CLI executable but consumers of .tmp config are absent; this task completes UC-SYNC-04 evidence quality', 'Fakeability: AC-1/AC-2 fail if acknowledgements are hard-coded without contacting a real serving process']

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-R2-C04",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "soak_fence_engaged_with_running_service": {
      "description": "HOLO_MIGRATION_READ_ONLY engaged; Hono/MCP up; export watermark present; post-export write audit empty/zero accepted.",
      "seed_method": "cli",
      "records": [
        "flip or set durable fence 1",
        "GET health 200",
        "watermark report with export watermark ms > 0",
        "post-export write audit accepted_count == 0"
      ]
    },
    "running_service_after_repoint": {
      "description": "Same serving process after successful rollback-repoint with control-plane reload/reread.",
      "seed_method": "cli",
      "records": [
        "rollback report ok true",
        "process still listening or restarted with ack"
      ]
    },
    "post_export_write_accepted_ledger": {
      "description": "Audit ledger with accepted post-export production writes >= 1.",
      "seed_method": "migration_fixture",
      "records": [
        ".tmp/D06-05/post-export-write-audit.json accepted >= 1"
      ]
    },
    "pre_fix_tmp_only_repoint": {
      "description": "cab5c071: runRollbackRepoint writes .tmp data-plane-config.json + soak-state only; holo.ts registers that path; no runtime consumer.",
      "seed_method": "recorded_external",
      "records": [
        "services/platform/src/cutover/rollback-repoint.ts:67-74",
        "services/platform/src/cutover/rollback-repoint.ts:284-341",
        "services/platform/src/cli/holo.ts:3316-3335",
        ".spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md C-04"
      ]
    },
    "post_fix_tree": {
      "description": "Post-implementation tree with serving consumer + live ack path.",
      "seed_method": "cli",
      "records": [
        "write_allowed diffs only"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "UC-SYNC-04",
      "description": "GIVEN soak_fence_engaged_with_running_service and zero accepted post-export writes with export watermark present WHEN operator runs bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json THEN serving control-plane stores data_plane=convex / target convex-frozen in a path the running service loads; report.repointed==true only with live ack",
      "verify": "bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json | jq -e '.ok==true and .repointed==true and .data_plane==\"convex\" and (.target|length)>0 and (.acknowledgements|length)>=1'; rg -n \"HOLO_DATA_PLANE|convex-frozen\" \"$HOLO_SECRETS_PATH\"",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "scenario": {
        "topology": "single-node",
        "verification_service": "control-plane + hono",
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
            "start_ref": "soak_fence_engaged_with_running_service",
            "action": {
              "actor": "operator",
              "steps": [
                "ensure watermark + zero post-export writes",
                "run cutover:rollback-repoint --json",
                "inspect control-plane consumer path",
                "inspect acknowledgements"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-1 report field ok equals true OR exit_code equals 1",
                "AC-1 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "report.ok === true",
                "report.repointed === true",
                "report.data_plane === 'convex'",
                "report.target is non-empty string (e.g. convex-frozen length >= 6)",
                "report.configured_target is non-empty consumer path or labeled control-plane id length >= 8"
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
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "UC-SYNC-04",
      "description": "GIVEN running_service_after_repoint WHEN operator queries a serving health/control endpoint or process-local reader that reflects data-plane config THEN live process observes data_plane convex / target convex-frozen (acknowledgement evidence, not file existence alone)",
      "verify": "curl -sS \"$PLATFORM_URL/health\" | jq -e '.data_plane==\"convex\" or .target==\"convex-frozen\" or .rollback.target!=null'; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-rollback-repoint.test.ts -t 'R2-C04|live-ack'",
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
            "start_ref": "running_service_after_repoint",
            "action": {
              "actor": "operator",
              "steps": [
                "repoint",
                "probe serving process data-plane observation",
                "record ack"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-2 report field ok equals true OR exit_code equals 1",
                "AC-2 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "live process reports data_plane equals 'convex' OR target equals 'convex-frozen' OR equivalent routing flag observed_target length >= 6",
                "AC-2 observed_status equals literal 'PASS' and observed_count >= 1",
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
      "flow_ref": "UC-SYNC-04",
      "description": "GIVEN post_export_write_accepted_ledger with accepted_count >= 1 WHEN operator runs cutover:rollback-repoint --json THEN command refuses; ok false; error.code POST_EXPORT_WRITE_ACCEPTED or ROLLBACK_INELIGIBLE; no serving control-plane repoint applied",
      "verify": "bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json; test $? -ne 0; jq -e '.ok==false and (.error.code==\"POST_EXPORT_WRITE_ACCEPTED\" or .error.code==\"ROLLBACK_INELIGIBLE\")'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "topology": "single-node",
        "verification_service": "cutover CLI",
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
            "start_ref": "post_export_write_accepted_ledger",
            "action": {
              "actor": "operator",
              "steps": [
                "seed accepted writes",
                "rollback-repoint",
                "assert refuse"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-3 report field ok equals true OR exit_code equals 1",
                "AC-3 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "ok === false",
                "AC-3 observed_status equals literal 'PASS' and observed_count >= 1",
                "exit code != 0",
                "AC-3 observed_status equals literal 'PASS' and observed_count >= 1"
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
      "flow_ref": "UC-SYNC-04",
      "description": "GIVEN pre_fix_tmp_only_repoint at cab5c071 WHEN implementer completes R2-C04 THEN RED proves unconsumed .tmp path; GREEN requires live ack; path.json A devops-engineer",
      "verify": "test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c04-red.log && jq -e '.path==\"A\" and .agent==\"devops-engineer\"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c04-path.json",
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
            "start_ref": "pre_fix_tmp_only_repoint",
            "action": {
              "actor": "cli_user",
              "steps": [
                "red",
                "implement serving consumer",
                "green",
                "path.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-4 report field ok equals true OR exit_code equals 1",
                "AC-4 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "red log size > 0 documenting no runtime consumer of data-plane-config.json",
                "AC-4 observed_status equals literal 'PASS' and observed_count >= 1",
                "AC-4 observed_status equals literal 'PASS' and observed_count >= 1",
                "green suite requires acknowledgements length >= 1"
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
      "flow_ref": "UC-SYNC-04",
      "description": "GIVEN post_fix_tree WHEN typecheck and lint run THEN tsgo and biome clean on write_allowed paths",
      "verify": "pnpm tsgo --noEmit; pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/rollback-repoint.ts services/platform/src/cutover/soak-fence.ts services/platform/src/cli/holo.ts",
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
                "tsgo 0",
                "biome 0"
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
      "description": "cutover:rollback-repoint writes HOLO_DATA_PLANE=convex (or equivalent) to durable serving control-plane consumed by runtime",
      "maps_to_ac": "AC-1",
      "verify": "rg HOLO_DATA_PLANE $HOLO_SECRETS_PATH; report.configured_target consumer path"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "rollback report acknowledgements array length >= 1 with live unit observation",
      "maps_to_ac": "AC-1",
      "verify": "jq -e '(.acknowledgements|length)>=1' rollback report"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "running serving process observes data_plane convex after repoint",
      "maps_to_ac": "AC-2",
      "verify": "health/control probe or cross-process reader"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "accepted post-export writes cause refuse with POST_EXPORT_WRITE_ACCEPTED",
      "maps_to_ac": "AC-3",
      "verify": "CLI exit non-zero + error.code"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "repository-wide runtime consumer of data-plane target exists outside cutover/test producers",
      "maps_to_ac": "AC-1",
      "verify": "rg HOLO_DATA_PLANE or data-plane config reader in server/worker modules"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "RED evidence non-empty for tmp-only repoint defect",
      "maps_to_ac": "AC-4",
      "verify": "test -s redhat-fix-s29-r2-c04-red.log"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "typecheck and lint clean",
      "maps_to_ac": "AC-5",
      "verify": "pnpm tsgo --noEmit && scoped biome"
    }
  ],
  "touches_capabilities": [
    "CAP-CUT-01"
  ],
  "provides": [
    "uc-sync-04-serving-control-plane-repoint",
    "live-acknowledgement-rollback-evidence"
  ],
  "consumes": [
    "h05-rollback-repoint-cli",
    "d06-05-soak-fence",
    "platform-secrets-and-stack-supervisor"
  ],
  "boundary_contracts": [
    "repointed:true requires live serving acknowledgement",
    "UC-SYNC-04 refuse after accepted post-export writes",
    "convex/ remains live and un-deleted"
  ],
  "proposed_by": "mastra-planner",
  "source_finding": {
    "report": ".spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md",
    "reviewed_sha": "cab5c0717974a96e33c338105b5d198d82cb607d"
  }
}
-->

</details>
