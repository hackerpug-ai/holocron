# S31-FE-06 — Freeze the client data contract; retire the tooling that now reports false positives

**PROPOSED-BY:** react-native-ui-planner · **Sprint:** sprint-31-migration-integrity-remediation · **Template:** TASK-TEMPLATE v5.2

## What this does
Marks the Sprint 21 client-data contract `FROZEN_HISTORICAL` with an honest tombstone, retires `holo inventory:convex-callsites`, and records what the Sprint 21 gate never executed.

## Why
All 105 recorded coordinates are stale, so "105/105 mapped" passes forever regardless of the client. Meanwhile `inventory:convex-callsites` reports nine Convex call sites that are all Zero queries. Two tools disagreeing at the decommission gate is worse than one.

## How to verify
`bun services/platform/src/cli/holo.ts inventory:convex-callsites` exits non-zero naming `verify:no-convex-client`, while `verify:client-contract` still exits 0 and still fails closed on a corrupted entry.

## Scope
Header and prose of the contract yaml, the CLI verb, the stale `--targets` author path, and a Sprint 21 gate tombstone. No RN rendering; no coordinate re-baselining; no evidence back-fill.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-FE-06 - Freeze the client data contract; retire the tooling that now reports false positives
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P2
EFFORT:     S
AGENT:      implementer=react-native-ui-implementer | reviewer=react-native-ui-reviewer
PROPOSED-BY: react-native-ui-planner
ESTIMATE:   120 minutes
TDD_MODE:   red_first
CAPABILITIES: CAP-SYNC-01, CAP-CUT-01
PRD_REFS:   08-uc-sync.md UC-SYNC-01 AC-1 · 08-uc-sync.md UC-SYNC-01 AC-5 · 01-scope.md:75 · 01-scope.md:76

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: 0/6 ACs complete

--------------------------------------------------------------------------------
OUTCOME (1 sentence, <=30 words — observable success)
--------------------------------------------------------------------------------

The client-data contract reads as a frozen audit record with honest numbers, and verify:no-convex-client is the single Convex-residue authority for the RN client.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- NEVER update the yaml's 105 line coordinates to match current source. Re-baselining is explicitly Out of Scope (01-scope.md:75); freeze the file and state that its coordinates are historical.
- NEVER back-fill Sprint 21 gate evidence. That sprint has 0 .gate-evidence directories and 0 gate-results.json files; `grep -rn verify:client-contract .github/workflows/` returns 0 matches while S-CONTRACT-03 AC-5 requires it in ci-fast.yml; .tmp/client-contract/negative/ holds 0 files so TC-3 and TC-4 could not execute. State each absence rather than manufacturing evidence.
- NEVER fix the inventory:convex-callsites regex instead of retiring it, and never delete the yaml or its verifier — services/platform/src/sync/client-data-contract-verify.ts still proves internal consistency and is retained.
- NEVER write a call site into the tombstone as a false positive without a captured import resolution proving it reaches @rocicorp/zero/react.
- NEVER split the spec tombstone and the CLI retirement across commits. A window in which the yaml names a successor that is not yet retired is the exact two-tools-disagreeing state this task ends.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] `inventory:convex-callsites` exits non-zero naming verify:no-convex-client and writes 0 artifacts — AC-4 (PRIMARY)
- [ ] The yaml header carries FROZEN_HISTORICAL, a git-resolvable sha, and the do-not-trust sentence — AC-1
- [ ] The tombstone records both headline figures with the discrepancy explained — AC-2
- [ ] All 9 reported call sites are verified to resolve to the Zero react package — AC-3
- [ ] `verify:client-contract` exits 0 normally and non-zero on a corrupted entry — AC-5
- [ ] The Sprint 21 gate tombstone records 4 absences and creates 0 evidence files — AC-6
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only), in ONE commit

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-4: The retired verb fails closed and points at its successor [PRIMARY]
  GIVEN: inventory:convex-callsites retired
  WHEN:  the operator runs it, with and without --output
  THEN:  it exits non-zero naming verify:no-convex-client and writes 0 artifacts

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  holo CLI executed against the real repository tree
  TDD_STATE:     none
  TEST_FILE:     tests/integration/s31-fe-06-contract-freeze.test.ts
  TEST_FUNCTION: inventory convex-callsites is retired

  SCENARIO:
    START_REF:        real-repo-tree
    NEGATIVE_CONTROL: would fail if the verb still exits 0 and emits a file_count report, the retirement message is absent, or the stale --targets author path remains
    EVIDENCE:         stdout
    CASES:
      - ACTION:           run the verb bare and with --output, then test -e the output path and grep the author module for HONO_ROUTES
        MUST_OBSERVE:     both invocations return exit status 2, a non-zero value; the output contains the literal string 'verify:no-convex-client'
        MUST_NOT_OBSERVE: the verb returns exit status 0; a 'file_count' report is emitted, 0 permitted

AC-1: The contract yaml is marked frozen with a resolvable provenance sha
  GIVEN: the contract yaml frozen
  WHEN:  the operator reads its header and resolves the provenance sha
  THEN:  the frozen fields are present and the sha resolves in git

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  git plus the real repository tree
  TDD_STATE:     none
  TEST_FILE:     tests/integration/s31-fe-06-contract-freeze.test.ts
  TEST_FUNCTION: contract yaml is frozen historical

AC-2: The tombstone records both headline figures honestly
  GIVEN: the tombstone prose
  WHEN:  its figures are recomputed from the inventory JSON and Sprint 21 SPRINT.md
  THEN:  both numbers appear and the discrepancy is explained

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  the real inventory JSON plus the real Sprint 21 SPRINT.md
  TDD_STATE:     none
  TEST_FILE:     tests/integration/s31-fe-06-contract-freeze.test.ts
  TEST_FUNCTION: tombstone records both headline figures

AC-3: The nine reported call sites are verified before being called false positives
  GIVEN: inventory:convex-callsites reporting file_count 33 and call_site_count 9
  WHEN:  each hook import is resolved to its source module
  THEN:  all nine resolve to the Zero react package

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  holo CLI inventory run plus the real source files
  TDD_STATE:     none
  TEST_FILE:     tests/integration/s31-fe-06-contract-freeze.test.ts
  TEST_FUNCTION: nine reported call sites resolve to zero

AC-5: The retained verifier still passes and still fails closed
  GIVEN: the header changed and the CLI retired
  WHEN:  verify:client-contract runs normally and against a corrupted entry
  THEN:  it exits 0 then non-zero

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  holo CLI verify:client-contract against the real yaml and frozen inventory
  TDD_STATE:     none
  TEST_FILE:     tests/integration/s31-fe-06-contract-freeze.test.ts
  TEST_FUNCTION: verify client-contract still fails closed

AC-6: The Sprint 21 gate tombstone states what was never executed
  GIVEN: the Sprint 21 task directory and the repository workflows
  WHEN:  the four absences are checked
  THEN:  each is recorded as an absence and 0 evidence files are created

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  the real repository tree plus git status
  TDD_STATE:     none
  TEST_FILE:     tests/integration/s31-fe-06-contract-freeze.test.ts
  TEST_FUNCTION: sprint 21 gate tombstone records absences

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml (MODIFY — HEADER AND PROSE ONLY)
- services/platform/src/cli/holo.ts (MODIFY — the inventory:convex-callsites case and its help text)
- services/platform/src/sync/client-data-contract-author.ts (MODIFY — remove the --targets HONO_ROUTES path)
- .spec/prds/mk6-migration/tasks/sprint-21-client-data-contract/GATE-TOMBSTONE.md (NEW)
- tests/integration/s31-fe-06-contract-freeze.test.ts (NEW)
- package.json (MODIFY — only if an inventory:convex-callsites script alias exists and must be retired with it)

writeProhibited:
- Any source_path or line coordinate inside the yaml's 105 entries — re-baselining is Out of Scope
- .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json — frozen
- services/platform/src/sync/client-data-contract-verify.ts — the verifier is retained unchanged
- .github/workflows/** — back-filling the missing ci-fast wiring is Out of Scope
- Any new file under a Sprint 21 .gate-evidence/ directory, and .tmp/client-contract/negative/**
- app/, components/, hooks/ — this task touches no RN rendering

--------------------------------------------------------------------------------
BOUNDARIES (✅ Always / ⚠️ Ask First)
--------------------------------------------------------------------------------

✅ Always:
- State facts with the file and line each number was computed from.
- Record absences as absences; create 0 evidence files to satisfy an unmet criterion.
- Name the successor explicitly in the retired verb's message; a bare non-zero exit is insufficient.
- Land the spec tombstone and the CLI retirement in ONE commit (atomicity requirement — this task spans .spec/ and services/platform/).
- Revert the AC-5 corruption probe with git checkout.

⚠️ Ask First:
- Recording a provenance sha if the authoring commit cannot be identified from git log.
- Any edit to client-data-contract-verify.ts.
- Changing the retired verb's exit code away from a stable non-zero value.
- Removing any other CLI verb alongside this one.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml (MODIFY): FROZEN_HISTORICAL header, frozen_at, coordinates_valid_as_of, superseded_by, do-not-trust prose, and the tombstone figures
- services/platform/src/cli/holo.ts (MODIFY): inventory:convex-callsites exits non-zero naming verify:no-convex-client
- services/platform/src/sync/client-data-contract-author.ts (MODIFY): the --targets path against the stale 22-entry HONO_ROUTES removed
- .spec/prds/mk6-migration/tasks/sprint-21-client-data-contract/GATE-TOMBSTONE.md (NEW): the four recorded absences
- tests/integration/s31-fe-06-contract-freeze.test.ts (NEW): AC-1 through AC-6

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  READ:   the AC, existing tests, the READING LIST
  WRITE:  ONE test exercising GIVEN-WHEN-THEN
  RUN:    the AC's TEST_FILE
  VERIFY: the test FAILS (not errors — fails)
  RETURN: { phase: "RED", test_file, test_function, failure_output }

### GREEN PHASE (after orchestrator VERIFY_RED passes)
  WRITE:  MINIMAL code to pass
  RETURN: { phase: "GREEN", files_changed, test_output }

### REFACTOR PHASE (after orchestrator VERIFY_GREEN passes)
  WRITE:  improved code if needed; tests stay green
  RETURN: { phase: "REFACTOR", files_changed, still_passing }

## AFTER ALL ACs COMPLETE:
  Orchestrator dispatches react-native-ui-reviewer.

--------------------------------------------------------------------------------
READING LIST (max 5 files — canonical pattern first)
--------------------------------------------------------------------------------

1. components/chat/ChatThread.tsx [PRIMARY PATTERN]
   - Lines: 434-450
   - Focus: cited to record what this task does NOT do. It introduces no UI and reuses no surface; the mobile-pattern checklist is N/A and the human verification hook is a CLI observation.

2. .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml
   - Lines: 1-25
   - Focus: the existing header — contract_version, task_id S-CONTRACT-02, sprint sprint-21-client-data-contract, generated_from, and summary.total_entries 105 split zero_query 48 / zero_mutator 37 / hono_command 20. The frozen fields go here; the 105 entries below are untouchable.

3. services/platform/src/sync/client-data-contract-verify.ts
   - Lines: 225-245, 415-435
   - Focus: verifySchema at :232-235 and verifyTargets at :423-428 — both load the yaml plus the frozen inventory and cross-check two static files, never app source. Understand why this remains a true statement before writing the tombstone; the verifier is retained.

4. services/platform/src/cli/holo.ts + services/platform/src/sync/client-data-contract-author.ts
   - Lines: 470-500, 4060-4095, 50-80
   - Focus: the help text listing inventory:convex-callsites (:485) and verify:client-contract (:498); the verify:no-convex-client case at :4068 that becomes the named successor; the hardcoded 22-entry HONO_ROUTES at :62 against 34 mounted routes.

5. hooks/use-chat-history.ts + .spec/prds/mk6-migration/01-scope.md
   - Lines: 13-14 and 60, and 75-76
   - Focus: one of the nine reported call sites — `import { useQuery } from '@rocicorp/zero/react'` at :13 with the call at :60, a Zero query the regex reports as Convex. Confirm the same shape at the other eight. 01-scope.md:75-76 records both Out-of-Scope decisions this task implements.

--------------------------------------------------------------------------------
EVIDENCE GATES (fast/cheap first — fail fast)
--------------------------------------------------------------------------------

Gate 1: RED evidence — TDD_STATE shows each test went red before green.
Gate 2: One test per AC.
Gate 3: PLATFORM_IT=1 pnpm test:integration exits 0.
Gate 4: pnpm tsgo --noEmit exits 0.
Gate 5: pnpm biome check . exits 0.
Gate 6: git diff --name-only ⊆ SCOPE.writeAllowed, and the spec plus CLI changes appear in ONE commit.
Gate 7: AC-4 (PRIMARY) is integration against the real CLI; no PRIMARY unit test.
Gate 8: validate_scenario.py exits 0 on the PRIMARY scenario; the captured stdout shows the non-zero exit and the successor name, and AC-4 was watched FAIL against the pre-retirement verb (which exits 0 with a file_count report).

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Re-baselining the 105 line coordinates against post-migration source (01-scope.md:75 — frozen historical artifact)
- Maintaining Convex-discovery tooling past decommission (01-scope.md:76 — rejected, superseded)
- Back-filling Sprint 21 gate evidence or adding verify:client-contract to ci-fast.yml
- Any RN rendering change — this task touches no screen

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** an 8,126-line contract with 105 entries whose verifier cross-checks two static files and never reads app source, and a discovery CLI reporting 9 Convex call sites that are all Zero queries.

**Gap:** "105/105 mapped" passes forever regardless of the client, and two tools give contradictory Convex-residue answers at the decommission gate.

--------------------------------------------------------------------------------
REVIEW (for react-native-ui-reviewer)
--------------------------------------------------------------------------------

Must pass (<=5, evidence-gate-backed):
- One test per AC; tests verify behavior not implementation
- RED evidence present in TDD_STATE history
- Minimal implementation; no gold-plating
- Pattern consistent with READING LIST [PRIMARY PATTERN] — 0 UI introduced
- SCOPE respected; 0 entry coordinates changed and 0 evidence files created

Should verify (<=5, judgment):
- Every tombstone number was recomputed, not copied from the brief
- All 9 call-site resolutions are captured as stdout, not asserted on trust
- The spec tombstone and the CLI retirement are in a single commit
- The retained verifier's fail-closed behaviour was proven with a real corruption probe
- The recorded provenance sha resolves with git cat-file -e

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: none
Blocks:     none
Parallel:   S31-FE-01, S31-FE-02, S31-FE-04, S31-FE-05

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable)
--------------------------------------------------------------------------------
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-FE-06",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "real-repo-tree": {
      "description": "The real repository working tree with dependencies installed so bun services/platform/src/cli/holo.ts executes, the frozen contract yaml and inventory JSON are readable, and the 9 reported call sites are open for import resolution",
      "seed_method": "cli",
      "records": [
        "13-client-data-contract.yaml: 8126 lines, 105 entries",
        "13-client-callsite-inventory.json present",
        "inventory:convex-callsites reports file_count 33 and call_site_count 9"
      ]
    },
    "sprint21-provenance-sha": {
      "description": "The commit sha that authored 13-client-data-contract.yaml, identified by running git log against that path and verified resolvable in this repository",
      "seed_method": "cli",
      "records": [
        "git log --follow on the yaml path returns >=1 commit",
        "the authoring commit sha is 40 hex characters",
        "git cat-file -e on that sha returns exit status 0"
      ]
    },
    "corrupted-contract-entry": {
      "description": "The frozen contract yaml with 1 entry target_kind deliberately corrupted as a scratch edit, used as the negative control that the retained verifier still fails closed, reverted with git checkout immediately after",
      "seed_method": "cli",
      "records": [
        "entries corrupted: 1",
        "verify:client-contract before edit: exit 0",
        "verify:client-contract with edit: expected non-zero"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the contract yaml frozen WHEN the operator reads its header and resolves the provenance sha THEN the frozen fields are present and the sha resolves in git",
      "verify": "head -40 .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-06-AC-1",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "git plus the real repository tree",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the sha is a hardcoded placeholder that git cannot resolve",
            "the header is absent so the file still reads as current",
            "the coordinates were re-baselined instead of frozen"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sprint21-provenance-sha",
            "action": {
              "actor": "system",
              "steps": [
                "run 'head -40' on the contract yaml and capture the header block",
                "extract coordinates_valid_as_of and run 'git cat-file -e' on it",
                "grep the header for 'FROZEN_HISTORICAL' and for 'verify:no-convex-client'",
                "diff the 105 entry source_path lines against the pre-task file"
              ]
            },
            "end_state": {
              "must_observe": [
                "the header contains 'status: FROZEN_HISTORICAL'",
                "the header contains 'superseded_by: holo verify:no-convex-client'",
                "'git cat-file -e' on the recorded sha returns exit status 0",
                "the header carries the literal sentence 'Line coordinates are historical and MUST NOT be trusted as current.'"
              ],
              "must_not_observe": [
                "0 source_path line coordinates changed versus the pre-task file",
                "a placeholder sha such as 'TBD' or 'unknown' appears 0 times"
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
      "description": "GIVEN the tombstone prose WHEN its figures are recomputed from the inventory JSON and Sprint 21 SPRINT.md THEN both headline numbers appear and the discrepancy is explained",
      "verify": "grep -n '46 importing files' .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-06-AC-2",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "the real inventory JSON plus the real Sprint 21 SPRINT.md in the repository tree",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "a single reconciled number is presented so the discrepancy is hidden",
            "the counts are hardcoded prose contradicted by the inventory JSON",
            "the mentions-only files are omitted"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real-repo-tree",
            "action": {
              "actor": "system",
              "steps": [
                "recompute the production, mentions-only and test file counts from 13-client-callsite-inventory.json",
                "open both mentions-only files and record what each match actually is",
                "read Sprint 21 SPRINT.md line 31",
                "compare all recomputed figures against the tombstone text"
              ]
            },
            "end_state": {
              "must_observe": [
                "the tombstone states the decomposition '43 production + 2 mentions-only + 2 test = 47'",
                "the tombstone names 'app/(drawer)/chat/reference.tsx' and 'app/zero/queries.ts' as the 2 mentions-only files and records that both were already Zero",
                "the tombstone states '46 importing files' and '152 lexical hook lines' citing SPRINT.md line 31"
              ],
              "must_not_observe": [
                "a single reconciled headline number with 0 explanation of the discrepancy",
                "a tombstone figure the recomputation contradicts, 0 permitted"
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
      "description": "GIVEN the nine reported call sites WHEN each hook import is resolved to its source module THEN all nine resolve to the Zero react package confirming nine false positives",
      "verify": "grep -n \"@rocicorp/zero/react\" app/\\(drawer\\)/_layout.tsx components/chat/ChatPickerSheet.tsx components/chat/MessageBubble.tsx hooks/use-chat-history.ts",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-06-AC-3",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI inventory run plus the real source files in the repository tree",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "a call site is asserted as a false positive with no captured import resolution",
            "the 9 coordinates are hardcoded from the brief instead of read from the CLI output",
            "a real convex/react import is present and missed"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real-repo-tree",
            "action": {
              "actor": "system",
              "steps": [
                "run the pre-retirement inventory:convex-callsites and capture its 9 reported coordinates",
                "for each of the 9, print the import block of the containing file and the reported line",
                "record the resolved import module for each of the 9 locations"
              ]
            },
            "end_state": {
              "must_observe": [
                "all 9 reported locations resolve their hook import to '@rocicorp/zero/react'",
                "the captured output names all 9 file:line coordinates including 'hooks/use-chat-history.ts:60'",
                "the tombstone lists the same 9 coordinates"
              ],
              "must_not_observe": [
                "a location asserted as a false positive with 0 captured import resolution",
                "0 of the 9 locations resolve to 'convex/react'"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN inventory:convex-callsites retired WHEN the operator runs it THEN it exits non-zero naming verify:no-convex-client and writes no inventory artifact",
      "verify": "bun services/platform/src/cli/holo.ts inventory:convex-callsites",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-06-AC-4",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI executed against the real repository tree",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the verb still exits 0 and emits a file_count report",
            "the retirement message is absent so the successor is unnamed",
            "the --targets author path against the stale hardcoded route list remains"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real-repo-tree",
            "action": {
              "actor": "system",
              "steps": [
                "run 'bun services/platform/src/cli/holo.ts inventory:convex-callsites' and capture exit status plus output",
                "run the same verb with '--output /tmp/holo-inventory-probe.json' and capture exit status",
                "run 'test -e /tmp/holo-inventory-probe.json' and capture the exit status",
                "run \"grep -n 'HONO_ROUTES' services/platform/src/sync/client-data-contract-author.ts\" and capture the match count"
              ]
            },
            "end_state": {
              "must_observe": [
                "both invocations return exit status 2, a non-zero value",
                "the output contains the literal string 'verify:no-convex-client'",
                "'test -e /tmp/holo-inventory-probe.json' returns a non-zero exit status because 0 artifacts were written"
              ],
              "must_not_observe": [
                "the verb returns exit status 0",
                "a 'file_count' or 'call_site_count' report is emitted, 0 permitted",
                "0 remaining --targets author paths resolve against the hardcoded HONO_ROUTES list"
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
      "description": "GIVEN the header changed and the CLI retired WHEN verify:client-contract runs normally and against a corrupted entry THEN it exits zero then non-zero",
      "verify": "bun services/platform/src/cli/holo.ts verify:client-contract",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-06-AC-5",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI verify:client-contract executed against the real yaml and the real frozen inventory",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the verifier is stubbed to always exit 0 so corruption is undetected",
            "the header change silently breaks the normal run",
            "the corrupted entry is mocked rather than written to the real file"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "corrupted-contract-entry",
            "action": {
              "actor": "system",
              "steps": [
                "run 'bun services/platform/src/cli/holo.ts verify:client-contract' and capture the exit status",
                "corrupt 1 entry target_kind in the yaml as a scratch edit",
                "re-run the verifier and capture the exit status plus the named entry",
                "run git checkout on the yaml and re-run the verifier"
              ]
            },
            "end_state": {
              "must_observe": [
                "run 1 returns exit status 0",
                "run 2 with 1 corrupted entry returns a non-zero exit status and names the inconsistent entry",
                "run 3 after git checkout returns exit status 0"
              ],
              "must_not_observe": [
                "run 2 returns exit status 0 with a corrupted entry present",
                "the header change causes run 1 to fail, 0 permitted"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the Sprint 21 gate tombstone WHEN the four absences are checked THEN each is recorded as an absence and no evidence file is created to fill it",
      "verify": "git status --porcelain .spec/prds/mk6-migration/tasks",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-06-AC-6",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "the real repository tree plus git status",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "a gate-results.json is fabricated so the absent evidence is hidden",
            "the workflow is edited to back-fill the missing wiring, making an absent gate look present",
            "the empty negative fixture directory is stubbed with invented files so unexecutable cases look executed"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real-repo-tree",
            "action": {
              "actor": "system",
              "steps": [
                "list the Sprint 21 task directory checking for a .gate-evidence directory and a gate-results.json",
                "run 'grep -rn verify:client-contract .github/workflows/' and capture the match count",
                "list .tmp/client-contract/negative/ and capture the file count",
                "compare all 3 results against the tombstone text and run 'git status --porcelain'"
              ]
            },
            "end_state": {
              "must_observe": [
                "the tombstone states Sprint 21 holds 0 .gate-evidence directories and 0 gate-results.json files",
                "the tombstone states 'grep -rn verify:client-contract .github/workflows/' returns 0 matches while S-CONTRACT-03 AC-5 requires it in ci-fast.yml",
                "the tombstone states '.tmp/client-contract/negative/' holds 0 files so TC-3 and TC-4 could not execute"
              ],
              "must_not_observe": [
                "a newly created gate-results.json under Sprint 21, 0 permitted",
                "0 new files were added under .tmp/client-contract/negative/",
                "a .github/workflows edit appears in git status, 0 permitted"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "the contract yaml header contains status FROZEN_HISTORICAL",
      "verify": "grep -n 'FROZEN_HISTORICAL' .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "git cat-file -e on the recorded coordinates_valid_as_of sha exits 0",
      "verify": "git cat-file -e $(grep coordinates_valid_as_of .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml | awk '{print $2}')",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "the contract yaml header contains superseded_by holo verify:no-convex-client",
      "verify": "grep -n 'superseded_by' .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "the recomputed inventory decomposition 43 plus 2 plus 2 equals 47 and matches the tombstone figure",
      "verify": "python3 -c \"import json;d=json.load(open('.spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json'));print(d)\"",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "the tombstone contains the strings 46 importing files and 152 lexical hook lines",
      "verify": "grep -n '46 importing files' .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "each of the 9 reported call sites resolves its hook import to @rocicorp/zero/react",
      "verify": "grep -n '@rocicorp/zero/react' hooks/use-chat-history.ts components/chat/ChatPickerSheet.tsx components/chat/MessageBubble.tsx",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "bun services/platform/src/cli/holo.ts inventory:convex-callsites exits non-zero",
      "verify": "bun services/platform/src/cli/holo.ts inventory:convex-callsites",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "the retired verb output contains the string verify:no-convex-client",
      "verify": "bun services/platform/src/cli/holo.ts inventory:convex-callsites 2>&1 | grep verify:no-convex-client",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "services/platform/src/sync/client-data-contract-author.ts contains 0 --targets paths resolving against HONO_ROUTES",
      "verify": "grep -n 'HONO_ROUTES' services/platform/src/sync/client-data-contract-author.ts",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "verify:client-contract exits 0 against the frozen yaml",
      "verify": "bun services/platform/src/cli/holo.ts verify:client-contract",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": "with 1 yaml entry corrupted verify:client-contract exits non-zero",
      "verify": "bun services/platform/src/cli/holo.ts verify:client-contract",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": "0 gate-results.json and 0 .gate-evidence directories are created under the Sprint 21 task directory",
      "verify": "git status --porcelain .spec/prds/mk6-migration/tasks",
      "maps_to_ac": "AC-6"
    },
    {
      "id": "TC-13",
      "type": "test_criterion",
      "description": ".tmp/client-contract/negative/ contains 0 new files after this task",
      "verify": "git status --porcelain .tmp/client-contract",
      "maps_to_ac": "AC-6"
    },
    {
      "id": "TC-14",
      "type": "test_criterion",
      "description": "the spec tombstone and the CLI retirement appear in a single commit",
      "verify": "git show --stat HEAD",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-15",
      "type": "test_criterion",
      "description": "pnpm biome check . exits 0 and pnpm tsgo --noEmit exits 0",
      "verify": "pnpm biome check . && pnpm tsgo --noEmit",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->

</details>
