# S31-CX-05: Decommission-blocker inventory — prove no in-scope capability lives only in Convex

**SPRINT:** [Sprint 31](./SPRINT.md)
**AGENT:** convex-reviewer
**ESTIMATE:** 150 min
**TYPE:** FEATURE
**TDD_MODE:** red_first
**RED_GREEN_REQUIRED:** yes

> Status: Backlog
> **PROPOSED-BY:** convex-planner

## What this does

Inventory all Convex files with required dispositions; fail if any lack classification.

## Why

Sprint 32 deletes convex/ irreversibly. The precondition is machine-checkable proof that no in-scope capability depends solely on Convex. An unclassified file blocks deletion.

## How to verify

- Run all 0 acceptance criteria in sequence (RED → GREEN → REFACTOR per AC)
- Validate via `validate_scenario.py`: exit 0 with all PRIMARY scenarios un-fakeable
- Confirm: one test per AC, RED evidence captured, minimal implementation only

## Scope

**Must complete in this task:**
- Extract and validate the artifact per AC-1 (primary)
- Fail-closed gate implementation (AC-2 or later)
- All tests passing; no gold-plating

**Out of scope:**
- Applying constraints or implementing replacements (other sprint's work)
- Re-running one-time-only operations
- Modifying Convex source code

---

<details>
<summary>▸ Full agent specification (S31-CX-05 — required reading for implementer + reviewer)</summary>

## Task Specification: S31-CX-05

**Purpose:** Sprint 32 deletes convex/ irreversibly, so the precondition is a machine-checkable proof that nothing there is the sole implementation of an in-scope ...

**PlatformRef:** UC-SYNC-05 AC-1, UC-SYNC-05 AC-4

### Acceptance Criteria


### Fixtures

- **convex_dir_at_head**: the convex/ directory as it stands at HEAD, fully present and runtime-fenced


### Reading List

1. services/platform/src/mission/verify-no-shells.ts  [PRIMARY PATTERN] — the 11-file hardcoded scan set this inventory must supersede
2. convex/lib/migrationFence.ts — fencedAction/fencedInternalAction, the runtime-fenced classification
3. convex/chat/specialists.ts — the 10 specialists with no platform replacement
4. convex/taskCrons.ts — the 16 legacy cron implementations the new registry lacks
5. services/platform/src/catalog/verify.ts — the source-catalog disposition vocabulary to classify against


### REQUIREMENT-CONTRACT v1

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-CX-05",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "convex_dir_at_head": {
      "description": "the convex/ directory as it stands at HEAD, fully present and runtime-fenced",
      "seed_method": "migration_fixture",
      "records": [
        "convex/research/ contains 34 files",
        "convex/chat/specialists.ts present",
        "convex/taskCrons.ts present",
        "convex/research/intent.ts imports claudeFlash"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "expected_state": "red_until_sprint_32",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "filesystem",
      "topology": "single-node",
      "primary": true,
      "negative_control": {
        "would_fail_if": [
          "stub - classifier returns a constant verdict",
          "omit - convex/research/ excluded from the walk as verify:no-shells excludes it",
          "empty - inventory walks 0 files"
        ]
      },
      "evidence": {
        "artifact_type": "file_artifact",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "convex_dir_at_head",
          "action": {
            "actor": "cli_user",
            "steps": [
              "run `holo verify:decommission-inventory --json`",
              "capture the per-file verdict"
            ]
          },
          "end_state": {
            "must_observe": [
              "walked file count >= 246 (whole convex/ tree, not the 11-file scan set)",
              "convex/research/ files appearing in the inventory: 34",
              "unclassified count: 0 is the green condition (expected non-zero in Sprint 31)"
            ],
            "must_not_observe": [
              "walked file count: 0 (inventory ran against nothing)",
              "convex/research/ absent from the walk",
              "a default 'classified' verdict applied with no resolving replacement"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-2",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "filesystem",
      "topology": "single-node",
      "primary": true,
      "negative_control": {
        "would_fail_if": [
          "stub - refusal path never exercised",
          "hardcod - exit code fixed at 0",
          "empty - refusal list empty while sole-implementation files exist"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "convex_dir_at_head",
          "action": {
            "actor": "cli_user",
            "steps": [
              "run `holo verify:decommission-inventory`",
              "read the refusal list and exit code"
            ]
          },
          "end_state": {
            "must_observe": [
              "exit code 1 (non-zero refusal)",
              "refusal list names `convex/chat/specialists.ts` and `convex/taskCrons.ts`",
              "sole-implementation classification count >= 2"
            ],
            "must_not_observe": [
              "exit code 0 with unclassified files present",
              "refusal list empty",
              "convex/taskCrons.ts marked as a migrated stub with no MIGRATED_TO_MISSION_ENGINE marker"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-3",
      "tier": "visible",
      "test_tier": "unit",
      "unit_test_justified": "pure classification of file content against the catalog disposition vocabulary; no service required",
      "verification_service": "typescript",
      "topology": "single-node",
      "primary": false,
      "negative_control": {
        "would_fail_if": [
          "stub - RN blocker detection hardcoded",
          "removed - dataModel import scan omitted",
          "empty - 0 blockers reported while the imports remain"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "convex_dir_at_head",
          "action": {
            "actor": "cli_user",
            "steps": [
              "scan app/, components/, hooks/, screens/ for convex/_generated imports",
              "emit the typecheck-blocker list"
            ]
          },
          "end_state": {
            "must_observe": [
              "typecheck blockers reported: 3",
              "list contains `components/subscriptions/types.ts`",
              "each blocker records the imported symbol (`Doc` or `Id`)"
            ],
            "must_not_observe": [
              "blockers reported: 0 while the imports are present",
              "type-only imports treated as absent",
              "an empty blocker list"
            ]
          }
        }
      ]
    }
  ]
}
-->

</details>

---

**Report to:** team-lead via SendMessage once all files are written and validated.
