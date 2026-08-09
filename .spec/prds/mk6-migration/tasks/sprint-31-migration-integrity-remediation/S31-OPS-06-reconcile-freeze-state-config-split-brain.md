# S31-OPS-06: Reconcile the freeze-state config split-brain across secrets, env and live Convex

> **Task ID:** S31-OPS-06
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Type:** OPS · **Priority:** P0 · **Effort:** S · **Estimate:** 45 min
> **PROPOSED-BY:** `devops-engineer`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> **Status:** Backlog

**Capabilities:** CAP-MIG-01, CAP-CUT-01
**PRD refs:** UC-SYNC-05 cutover fence · 01-scope no thaw · R28 adjacent honesty

## What this does

Reconciles `HOLO_MIGRATION_READ_ONLY` / `HOLO_CUTOVER_SCHEDULES_DISABLED` so secrets.yaml, process env, and the live Convex deployment env tell the same freeze story. Adds a single `holo cutover:fence-status --json` (or equivalent) that fails closed on split-brain instead of letting platform and Convex disagree.

## Why

Cutover freeze is one-way (01-scope: no thaw). Split-brain — secrets say `"0"` while Convex still has the fence armed, or the reverse — makes quiet-check, ETL, and rollback-repoint decisions on false premises. Sprint 29 notes captured incomplete Convex-side evidence (R33); this task makes the control-plane reading unambiguous.

## How to verify

- `cd services/platform && bun src/cli/holo.ts cutover:fence-status --json` reports aligned|split_brain with per-source values for secrets, env, and Convex (when credentials present).
- Seeded mismatch fixture exits non-zero with FENCE_SPLIT_BRAIN.
- Operator docs state the single source of truth for post-PONR platform writes vs Convex fence (Convex remains fenced; no thaw command).

## Scope

Fence status command, config alignment, documentation. Does not implement cutover:thaw (explicitly out of scope). Does not re-run go/no-go (R28 larger item).

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-OPS-06 - Freeze-state config split-brain reconciliation
================================================================================

TASK_TYPE:  OPS
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S
AGENT:      implementer=devops-engineer | reviewer=devops-engineer
PROPOSED-BY: devops-engineer
ESTIMATE:   45 minutes
TDD_MODE:   red_first
CAPABILITIES: CAP-MIG-01, CAP-CUT-01
PRD_REFS:   UC-SYNC-05 · 01-scope.md no thaw · R33

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: 0/4 ACs complete

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------

A single fence-status command detects secrets/env/Convex disagreement and exits non-zero on split-brain.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- NEVER implement cutover:thaw or unset HOLO_MIGRATION_READ_ONLY on Convex (01-scope).
- NEVER treat missing Convex credentials as aligned without labeling convex_unreachable.
- NEVER write production secrets from tests.
- NEVER mock Convex when PLATFORM_IT claims live fence read — use fence client or explicit offline mode.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] fence-status --json reports per-source values and aligned boolean — AC-1 (PRIMARY)
- [ ] Seeded secrets/env mismatch exits non-zero FENCE_SPLIT_BRAIN — AC-2
- [ ] secrets.example.yaml documents the freeze keys and no-thaw rule — AC-3
- [ ] Live Convex read path (when creds present) is included in the report — AC-4

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

AC-1: fence-status reports per-source freeze state [PRIMARY]
  GIVEN: secrets + env readable
  WHEN:  holo cutover:fence-status --json
  THEN:  JSON includes secrets.HOLO_MIGRATION_READ_ONLY, env.HOLO_MIGRATION_READ_ONLY, convex value or unreachable, aligned boolean

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-06-fence-status.test.ts
  TEST_FUNCTION: fenceStatusReportsPerSource

  SCENARIO:
    START_REF:        fence_config_readable
    NEGATIVE_CONTROL: would fail if hardcoded aligned true | empty report | mock always-ok
    EVIDENCE:         api_response
    CASES:
      - ACTION: run cutover:fence-status --json
        MUST_OBSERVE:
          - keys for secrets, env, convex present
          - aligned is boolean
          - exit 0 only when aligned or when convex_unreachable is explicitly allowed by flag
        MUST_NOT_OBSERVE:
          - empty object
          - aligned true while secrets and env disagree

AC-2: Split-brain fails closed
  GIVEN: secrets HOLO_MIGRATION_READ_ONLY=1 and env HOLO_MIGRATION_READ_ONLY=0 (harness)
  WHEN:  fence-status runs
  THEN:  exit != 0; code FENCE_SPLIT_BRAIN

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-06-fence-status.test.ts
  TEST_FUNCTION: fenceSplitBrainFailsClosed

AC-3: Example secrets document freeze keys
  GIVEN: services/platform/config/secrets.example.yaml
  WHEN:  read
  THEN:  HOLO_MIGRATION_READ_ONLY and HOLO_CUTOVER_SCHEDULES_DISABLED documented; no thaw instruction

  TEST_TIER:             unit
  unit_test_justified: static file content
  VERIFICATION_SERVICE:  filesystem
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-06-fence-status.test.ts
  TEST_FUNCTION: secretsExampleDocumentsFreezeKeys

AC-4: Convex source included when credentials exist
  GIVEN: PLATFORM_IT with Convex credentials
  WHEN:  fence-status --json
  THEN:  convex.value is 0|1|true|false string form and source=convex_env

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  convex-deployment+cli
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-06-fence-status.test.ts
  TEST_FUNCTION: fenceStatusReadsConvexWhenCredsPresent

--------------------------------------------------------------------------------
FIXTURES
--------------------------------------------------------------------------------

fence_config_readable — ephemeral secrets+env for harness
split_brain_env — mismatched secrets vs env values

--------------------------------------------------------------------------------
SCOPE
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/cutover/convex-fence-client.ts (MODIFY read helpers)
- services/platform/src/cutover/** (NEW fence-status module if needed)
- services/platform/src/cli/holo.ts (MODIFY — cutover:fence-status case)
- services/platform/config/secrets.example.yaml (MODIFY docs)
- services/platform/tests/integration/sprint31-ops-06-fence-status.test.ts (NEW)
- .spec/prds/mk6-migration/runbooks/** (MODIFY freeze honesty notes)

writeProhibited:
- cutover:thaw command
- Lifting Convex HOLO_MIGRATION_READ_ONLY in production without operator incident process (still no product thaw)
- Re-running Sprint 29 go/no-go (R28)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. services/platform/src/cutover/convex-fence-client.ts — MIGRATION_READ_ONLY_ENV
2. services/platform/config/secrets.example.yaml — freeze key comments
3. 01-scope.md — no thaw exclusion
4. services/platform/src/cli/holo.ts cutover:freeze / quiet-check cases
5. 08-technical-risks.md R33

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Implementing thaw
- Full production go/no-go re-run (R28)
- Deleting Convex (Sprint 32)
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-OPS-06",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fence_config_readable": {
      "description": "Ephemeral secrets and env for fence-status",
      "seed_method": "migration_fixture",
      "records": ["HOLO_MIGRATION_READ_ONLY readable from secrets and env"]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "cli",
      "topology": "single-node",
      "primary": true,
      "negative_control": {
        "would_fail_if": ["hardcoded aligned true", "empty report", "mock always-ok"]
      },
      "evidence": { "artifact_type": "api_response", "required_capture": true },
      "cases": [
        {
          "start_ref": "fence_config_readable",
          "action": {
            "actor": "cli_user",
            "steps": ["run holo cutover:fence-status --json"]
          },
          "end_state": {
            "must_observe": [
              "report includes secrets, env, and convex keys",
              "aligned is boolean"
            ],
            "must_not_observe": [
              "empty object",
              "aligned true while secrets and env disagree"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-2",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "cli",
      "topology": "single-node",
      "primary": false,
      "negative_control": {
        "would_fail_if": ["split-brain exit 0", "disagreement ignored"]
      },
      "evidence": { "artifact_type": "stdout", "required_capture": true },
      "cases": [
        {
          "start_ref": "fence_config_readable",
          "action": {
            "actor": "cli_user",
            "steps": [
              "set secrets HOLO_MIGRATION_READ_ONLY=1",
              "set env HOLO_MIGRATION_READ_ONLY=0",
              "run fence-status"
            ]
          },
          "end_state": {
            "must_observe": ["exit code != 0", "output contains FENCE_SPLIT_BRAIN"],
            "must_not_observe": ["exit 0", "aligned true"]
          }
        }
      ]
    }
  ]
}
-->

</details>

---

**Report to:** team-lead once fence-status fails closed on split-brain.
