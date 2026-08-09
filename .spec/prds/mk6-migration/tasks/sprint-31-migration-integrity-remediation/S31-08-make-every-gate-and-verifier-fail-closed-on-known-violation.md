# S31-08: Make every gate and verifier fail closed when fed a known violation

> **Task ID:** S31-08
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Type:** FEATURE · **Priority:** P0 · **Effort:** L · **Estimate:** 540 min
> **PROPOSED-BY:** `mastra-planner`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> **Status:** Backlog

**Capabilities:** CAP-CUT-01, CAP-MIG-01, CAP-INF-01
**PRD refs:** UC-PLAT-04, UC-DATA-05, R30, R36 · SPRINT human-gate step 8

## What this does

Gives every migration/cutover gate and verifier a negative control: seed one synthetic violation and prove the command exits non-zero with a named reason. Closes the five structurally toothless verifiers that can report green without ever observing a real failure.

## Why

The integrity audit found verifier commands that are structurally incapable of failing — the mechanism by which false-green claims shipped. Human-gate step 8 requires seeding one synthetic violation per verifier and confirming each exits non-zero. A gate that cannot fail is theatre, not a gate.

## How to verify

- `PLATFORM_IT=1 pnpm test:integration -- services/platform/tests/integration/sprint31-verifier-teeth.test.ts` exits 0 with one seeded-violation case per registered verifier.
- For each of the five toothless commands, the negative-control subprocess exits non-zero and stdout/stderr names the violation class.
- `cd services/platform && bun src/cli/holo.ts verify:gate-registry --json` reports every registered verifier with a `negative_control` fixture path that exists on disk.

## Scope

Touches verifier implementations that hardcode success, the gate registry, and the integration negative-control suite. Does not re-implement product capabilities owned by S31-01..S31-07, S31-CX-*, or S31-MCP-*.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-08 - Make every gate and verifier fail closed on a known violation
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L
AGENT:      implementer=mastra-evals-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
ESTIMATE:   540 minutes
TDD_MODE:   red_first
CAPABILITIES: CAP-CUT-01, CAP-MIG-01, CAP-INF-01
PRD_REFS:   UC-PLAT-04 · UC-DATA-05 · R30 · R36 · SPRINT.md human-gate step 8

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: 0/5 ACs complete

--------------------------------------------------------------------------------
OUTCOME (1 sentence, ≤30 words — observable success)
--------------------------------------------------------------------------------

Every registered migration verifier refuses a seeded violation with a non-zero exit and a named reason code.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- NEVER soft-pass a seeded violation by catching and logging only — exit code must be non-zero.
- NEVER mock the CLI entrypoint; each negative control spawns `bun src/cli/holo.ts …` as a child process.
- NEVER invent a green path by skipping the seed step; the violation must be present on disk/DB before the command runs.
- NEVER weaken S31-MCP-03 / S31-CX-04 / S31-FE-06 gates — extend them if needed, do not replace.
- NEVER point a negative-control harness at production secrets or production PGDATA (R24).

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] Five previously-toothless verifiers each exit non-zero on a seeded violation — AC-1 (PRIMARY)
- [ ] A machine-readable gate registry lists every cutover verifier with a negative_control fixture — AC-2
- [ ] catalog:assets no longer hardcodes ok:true when a retained blob is missing on disk — AC-3
- [ ] mcp:verify-rehost fails when a dispatch case is throw-only without a real executor — AC-4
- [ ] The integration suite covers every registry entry exactly once — AC-5
- [ ] PLATFORM_IT=1 pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only SCOPE.writeAllowed files modified

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: Five toothless verifiers refuse seeded violations [PRIMARY]
  GIVEN: fixtures for catalog:assets missing-blob, mcp:verify-rehost throw-only case,
         catalog:reconcile planted variance, verify:no-shells sole-implementation residue,
         and etl fk-audit zero-constraint DB
  WHEN:  each verifier CLI is run against its fixture
  THEN:  every exit code is non-zero and names a violation class

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TEST_FILE:     services/platform/tests/integration/sprint31-verifier-teeth.test.ts
  TEST_FUNCTION: fiveToothlessVerifiersRefuseSeededViolations

  SCENARIO:
    START_REF:        seeded_verifier_violations
    NEGATIVE_CONTROL: would fail if stub exit 0 | empty fixture | mock CLI | hardcod pass
    EVIDENCE:         stdout
    CASES:
      - ACTION: for each of the five commands, seed violation, spawn holo CLI, capture exit+output
        MUST_OBSERVE:
          - 5 of 5 commands exit with code != 0
          - each stdout/stderr contains a non-empty reason token
          - catalog:assets output does not report ok:true with missing blobs
        MUST_NOT_OBSERVE:
          - any of the five exiting 0
          - a skip/it.skip of the negative control under PLATFORM_IT=1
          - ok:true while the seeded violation is still present

AC-2: Gate registry enumerates every cutover verifier with a fixture path
  GIVEN: the gate registry module committed under services/platform
  WHEN:  holo verify:gate-registry --json runs
  THEN:  every entry has id, command, negative_control path that exists

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TEST_FILE:     services/platform/tests/integration/sprint31-verifier-teeth.test.ts
  TEST_FUNCTION: gateRegistryListsVerifiersWithFixtures

  SCENARIO:
    START_REF:        real-repo-tree
    NEGATIVE_CONTROL: would fail if empty registry | missing fixture path | hardcoded empty list
    EVIDENCE:         api_response
    CASES:
      - ACTION: run verify:gate-registry --json; for each entry assert fixture exists on disk
        MUST_OBSERVE: registry.entries.length >= 5 · every negative_control path exists · exit 0
        MUST_NOT_OBSERVE: entries.length 0 · a path that does not exist · duplicate command ids

AC-3: catalog:assets fails when a retained blob is missing on disk
  GIVEN: an export inventory claiming a retained object whose file is deleted
  WHEN:  holo catalog:assets --export <dir> --json runs
  THEN:  ok is false and exit is non-zero

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  filesystem+cli
  TEST_FILE:     services/platform/tests/integration/sprint31-verifier-teeth.test.ts
  TEST_FUNCTION: catalogAssetsRefusesMissingBlob

AC-4: mcp:verify-rehost fails on throw-only dispatch cases
  GIVEN: a temporary tool registry entry whose case body is only throw new Error(...)
  WHEN:  holo mcp:verify-rehost runs against that tree
  THEN:  exit non-zero naming the tool id

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TEST_FILE:     services/platform/tests/integration/sprint31-verifier-teeth.test.ts
  TEST_FUNCTION: mcpVerifyRehostRefusesThrowOnlyCase

AC-5: Integration suite maps 1:1 to registry entries
  GIVEN: the gate registry and the sprint31-verifier-teeth suite
  WHEN:  the suite introspects the registry
  THEN:  every registry id has exactly one test case and no orphan tests

  TEST_TIER:             unit
  unit_test_justified: pure mapping of registry ids to test names; no service required
  VERIFICATION_SERVICE:  typescript
  TEST_FILE:     services/platform/tests/integration/sprint31-verifier-teeth.test.ts
  TEST_FUNCTION: suiteCoversRegistryExactlyOnce

--------------------------------------------------------------------------------
FIXTURES
--------------------------------------------------------------------------------

seeded_verifier_violations (seed_method: migration_fixture)
  - assets_missing_blob: export dir with catalog-retained legacy_id and deleted blob file
  - rehost_throw_only: tool id with dispatch case that only throws
  - reconcile_planted_variance: archive vs DB row-count mismatch of +1 on documents
  - no_shells_residue: sole-implementation path listed in inventory
  - fk_audit_zero_constraints: nonprod namespace with domain tables and 0 FOREIGN KEY constraints

real-repo-tree (seed_method: public_api)
  - the worktree as checked out, with services/platform present

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/catalog/assets.ts (MODIFY — stop hardcoding ok:true)
- services/platform/src/mcp/** (MODIFY — rehost verify teeth only)
- services/platform/src/cli/holo.ts (MODIFY — register verify:gate-registry)
- services/platform/src/verify/gate-registry.ts (NEW)
- services/platform/tests/integration/sprint31-verifier-teeth.test.ts (NEW)
- services/platform/tests/fixtures/verifier-teeth/** (NEW)
- services/platform/src/etl/fk-audit.ts (MODIFY only if needed so ok requires enforced edges — coordinate with S31-CX-04)
- services/platform/src/etl/reconcile.ts (MODIFY only for fail-closed hooks used by negative controls; content digests are S31-CX-03)

writeProhibited:
- Production secrets, pgbackrest.conf on the mini, live Convex env (R24)
- Softening S31-MCP-01 sweep predicate
- RN client code
- Re-running production ETL load (01-scope re-exec ETL exclusion)

--------------------------------------------------------------------------------
READING LIST (max 5)
--------------------------------------------------------------------------------

1. services/platform/src/catalog/assets.ts — ok:true hardcode at inventory return
2. services/platform/tests/integration/mcp-manifest-negative-controls.test.ts — negative-control pattern
3. services/platform/src/etl/fk-audit.ts — ok without gating enforced FK count (R30)
4. services/platform/src/cli/holo.ts — verify:* / catalog:* / mcp:verify-* surface
5. .spec/prds/mk6-migration/tasks/sprint-31-migration-integrity-remediation/SPRINT.md — human-gate step 8

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Content-level digests (S31-CX-03) and RED proof of content-blindness (S31-CX-01)
- Dual-transport strict sweep (S31-MCP-01) and manifest holes (S31-MCP-03)
- Full CI blind-spot rewrite (deferred past S31-OPS-05 per R27)
- Deleting convex/ (Sprint 32)
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-08",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded_verifier_violations": {
      "description": "Five seeded violation fixtures, one per toothless verifier",
      "seed_method": "migration_fixture",
      "records": [
        "assets_missing_blob present",
        "rehost_throw_only present",
        "reconcile_planted_variance present",
        "no_shells_residue present",
        "fk_audit_zero_constraints present"
      ]
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
        "would_fail_if": ["stub exit 0", "empty fixture", "mock CLI", "hardcod pass"]
      },
      "evidence": { "artifact_type": "stdout", "required_capture": true },
      "cases": [
        {
          "start_ref": "seeded_verifier_violations",
          "action": {
            "actor": "cli_user",
            "steps": [
              "seed each of the five violations",
              "run the corresponding holo verifier CLI",
              "capture exit code and reason token"
            ]
          },
          "end_state": {
            "must_observe": [
              "5 of 5 commands exit with code != 0",
              "each output names a non-empty violation reason",
              "no it.skip under PLATFORM_IT=1"
            ],
            "must_not_observe": [
              "any of the five exiting 0",
              "ok:true while the seeded violation remains",
              "empty reason with only a stack trace"
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
        "would_fail_if": ["empty registry", "missing fixture path", "hardcoded empty list"]
      },
      "evidence": { "artifact_type": "api_response", "required_capture": true },
      "cases": [
        {
          "start_ref": "seeded_verifier_violations",
          "action": {
            "actor": "cli_user",
            "steps": ["run holo verify:gate-registry --json", "stat each negative_control path"]
          },
          "end_state": {
            "must_observe": [
              "registry.entries.length >= 5",
              "every negative_control path exists on disk",
              "exit code 0 for the registry command itself"
            ],
            "must_not_observe": [
              "entries.length 0",
              "duplicate command ids",
              "a listed path that does not exist"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-3",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "filesystem",
      "topology": "single-node",
      "primary": false,
      "negative_control": {
        "would_fail_if": ["ok:true hardcoded", "missing blob skipped with continue", "empty inventory"]
      },
      "evidence": { "artifact_type": "stdout", "required_capture": true },
      "cases": [
        {
          "start_ref": "seeded_verifier_violations",
          "action": {
            "actor": "cli_user",
            "steps": ["delete one retained blob file", "run holo catalog:assets --export <dir> --json"]
          },
          "end_state": {
            "must_observe": ["exit code != 0", "ok == false", "missing legacy_id named in output"],
            "must_not_observe": ["ok:true", "exit 0", "silent omit of the missing blob"]
          }
        }
      ]
    }
  ]
}
-->

</details>

---

**Report to:** team-lead once RED evidence and GREEN closeout are recorded.
