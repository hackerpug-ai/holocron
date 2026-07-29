# REDHAT-FIX-H2 — Make every Sprint 28 Human Testing Gate command and oracle executable against the implemented restore path (review H-2)

## What this does

Make every Sprint 28 Human Testing Gate step command executable with real oracles (row counts, ledger chain, blob SHA-256, fail-closed empty chain). Update SPRINT.md / gate-plan.json (if present) so literal_cmd invocations work against the implemented restore path. Negative control (step 6) must observe a named restore failure, not `unknown flag: --pitr`.

## Why

Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-H2). Grounded in UC-PLAT-06 / T-PLAT-022 / T-PLAT-025 / CAP-BAK-01. Review evidence: `.spec/reviews/red-hat-20260728T235155Z-sprint-28.md` (reviewed SHA `a9b5b6e7ff2b707fddf15084e2895221c62c68cb`).

## How to verify

- `test -f /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json` → exit 0
- `bun services/platform/src/cli/holo.ts restore --pitr 2099-01-01T00:00:00Z --scratch /tmp/h2-gate-smoke 2>&1 | tee /tmp/h2-cli.txt; ! grep -q 'unknown flag: --pitr' /tmp/h2-cli.txt` → named restore error or validation error — not unknown flag
- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-human-gate-oracles.test.ts` → steps 1–6 oracles pass against real path
- `pnpm tsgo --noEmit` → exit 0
- `pnpm tsgo --noEmit && pnpm biome check .` → Exit 0

## Scope

Writes: /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/SPRINT.md, /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json (NEW or MODIFY), /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/HUMAN-GATE.md (NEW — optional), services/platform/src/cli/holo.ts (MODIFY only if gate verb/flag naming alignment needed), scripts/fire-drill.sh (MODIFY if gate wrapper), services/platform/tests/integration/sprint28-human-gate-oracles.test.ts (NEW), .tmp/REDHAT-FIX-H2/**, /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/.gate-evidence/**

Prohibited: Weakening oracles to match stubs, Deleting fail-closed requirements, Using PATH holo stub that only implements unrelated commands without documenting the real dispatcher

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-H2 — Make every Sprint 28 Human Testing Gate command and oracle executable against the implemented restore path (review H-2)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 28 — Point-in-Time Restore and Fresh-Hardware Fire Drill](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-human-gate-oracles.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
All 6 gate steps run to a restore-domain outcome: steps 1–5 produce documented numeric/digest oracles; step 6 exits non-zero with named backup-chain error and zero fake-success; gate-plan or SPRINT commands do not rely on unknown flags; a dry gate smoke can distinguish parser errors (exit 2 unknown flag) from restore fail-closed.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Provide/update gate-plan.json and/or SPRINT.md Human Test Deliverable commands with working literal_cmd against implemented CLI
- MUST Step 1: restore --pitr works and stops at named point (oracle: queryable DB + sentinel/row proof)
- MUST Step 2: fresh target provision + R2-alone restore (oracle: isolation pass + queryable DB)
- MUST Step 3: row-count parity oracle (concrete counts)
- MUST Step 4: evidence-ledger chain oracle (SHA-256 baseline match)
- MUST Step 5: blob SHA-256 parity oracle (matched_objects > 0 on healthy set)
- NEVER treat exit 2 'unknown flag: --pitr' as restore fail-closed success for step 6
- NEVER leave gate commands that the CLI cannot parse
- NEVER mock gate oracles
- NEVER document optional steps that skip CAP-BAK-01 oracles
- STRICTLY step 6 stderr/stdout must match named restore errors (no base backup available|backup chain missing|integrity|outside available WAL) and must_not_observe 'unknown flag: --pitr' as the sole failure mode
- STRICTLY gate commands use bun services/platform/src/cli/holo.ts or a repo-local dispatcher that implements restore
- STRICTLY oracles are concrete (counts, digests, exit codes) not 'looks good'

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN implemented restore path WHEN gate step 1 runs the documented `holo restore --pitr <timestamp> --scratch <dir>` (v
- [ ] AC-2: GIVEN steps 2–5 documented in SPRINT/gate-plan WHEN executed against healthy_r2_chain + fresh target THEN each produces 
- [ ] AC-3: GIVEN empty_or_corrupt_chain WHEN gate step 6 runs restore against it THEN exit code != 0 AND stderr/stdout contains a n
- [ ] AC-4: GIVEN SPRINT.md Human Test Deliverable and gate-plan.json WHEN reviewed after H2 THEN every step has a literal_cmd using
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — GIVEN implemented restore path WHEN gate step 1 runs the documented `holo restor (flow_ref T-PLAT-022)
  GIVEN/WHEN/THEN: GIVEN implemented restore path WHEN gate step 1 runs the documented `holo restore --pitr <timestamp> --scratch <dir>` (via bun dispatcher) THEN exit 0 on valid window, DB queryable, and oracle captures concrete restored proof (SELECT 1 exit 0 and sentinel/row count >= 1) — command must not fail with unknown flag.
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: holo-restore+Postgres+R2
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-human-gate-oracles.test.ts -t 'step-1|pitr'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if unknown flag: --pitr; exit 0 without queryable DB; gate still documents non-existent flags only
  START_REF: implemented_restore_path
  MUST_OBSERVE: exit code = 0; psql SELECT 1 exit 0; row or pitr_test/sentinel count >= 1; stderr does not contain 'unknown flag: --pitr'
  MUST_NOT_OBSERVE: unknown flag: --pitr; exit 2 parser failure; empty/start signature: no DB
  EVIDENCE: stdout (required_capture=True)

### AC-2 — GIVEN steps 2–5 documented in SPRINT/gate-plan WHEN executed against healthy_r2_ (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN steps 2–5 documented in SPRINT/gate-plan WHEN executed against healthy_r2_chain + fresh target THEN each produces its oracle: isolation PASS lines; parity-report.json row_counts match; LEDGER_CHECKSUM_MATCH true with SHA-256; BLOB_PARITY_PASS true with matched_objects >= 1 on healthy fixture.
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: fire-drill+isolation+parity
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-human-gate-oracles.test.ts -t 'step-2|step-3|step-4|step-5|parity'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if missing provision/fire-drill commands; oracles are greps for 'ok' only; blob matched_objects=0 accepted as pass without empty-set justification
  START_REF: healthy_r2_chain
  MUST_OBSERVE: isolation probe exit 0 with PASS markers; jq .row_counts shows concrete integer fields; jq .LEDGER_CHECKSUM_MATCH == true with SHA-256 ledger field; jq .BLOB_PARITY_PASS == true AND jq .matched_objects >= 1
  MUST_NOT_OBSERVE: commands not found / unknown flag; parity-report.json missing; empty/start signature: all oracles skipped
  EVIDENCE: file_artifact (required_capture=True)

### AC-3 — GIVEN empty_or_corrupt_chain WHEN gate step 6 runs restore against it THEN exit  (flow_ref T-PLAT-022)
  GIVEN/WHEN/THEN: GIVEN empty_or_corrupt_chain WHEN gate step 6 runs restore against it THEN exit code != 0 AND stderr/stdout contains a named restore failure (no base backup available|backup chain missing|manifest checksum mismatch|WAL segment corrupted|backup chain integrity) AND must_not_observe the sole error 'unknown flag: --pitr'; PGDATA not promoted queryable success.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: holo-restore+R2
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-human-gate-oracles.test.ts -t 'step-6|fail-closed|empty'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if step 6 passes because CLI parse fails; exit 0 on empty chain; generic error without naming chain problem
  START_REF: empty_or_corrupt_chain
  MUST_OBSERVE: exit code != 0; stderr matches named restore failure pattern; stderr does not match only unknown flag: --pitr; no fake-success heartbeat/parity success row
  MUST_NOT_OBSERVE: unknown flag: --pitr as the only observed failure; exit code 0; empty/start signature: parser exit 2 treated as pass
  EVIDENCE: stdout (required_capture=True)

### AC-4 — GIVEN SPRINT.md Human Test Deliverable and gate-plan.json WHEN reviewed after H2 (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN SPRINT.md Human Test Deliverable and gate-plan.json WHEN reviewed after H2 THEN every step has a literal_cmd using the real dispatcher (`bun services/platform/src/cli/holo.ts` or repo bin/holo), expected exit codes, and concrete must_observe oracles; gate-plan schema validates; no step documents a flag the CLI rejects as unknown.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: gate-plan+cli
  VERIFY: `test -f /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json && rg -n 'restore|fire-drill|parity|literal' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/SPRINT.md`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if gate-plan missing; commands still show unknown flags; oracles not concrete
  START_REF: implemented_restore_path
  MUST_OBSERVE: gate-plan.json exists with 6 steps; each step has literal_cmd and oracle/must_observe; step 6 oracle explicitly forbids unknown-flag-only success; CLI accepts flags used in steps 1 and 6 (no unknown flag on those tokens)
  MUST_NOT_OBSERVE: gate-plan absent; step commands still produce unknown flag: --pitr; empty/start signature: SPRINT steps unchanged and unexecutable
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | gate-plan.json exists with 6 steps | AC-4 | `test -f /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprin` |
| TC-2 | Human gate oracle integration test | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-human` |
| TC-3 | Step 6 distinguishes restore fail-closed from unknown flag | AC-3 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-human` |
| TC-4 | CLI smoke: --pitr is not unknown flag | AC-1 | `bun services/platform/src/cli/holo.ts restore --pitr 2099-01-01T00:00:00Z --scra` |
| TC-5 | Typecheck + lint if CLI touched | AC-4 | `pnpm tsgo --noEmit && pnpm biome check services/platform/src/cli/holo.ts` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/SPRINT.md
- /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json (NEW or MODIFY)
- /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/HUMAN-GATE.md (NEW — optional)
- services/platform/src/cli/holo.ts (MODIFY only if gate verb/flag naming alignment needed)
- scripts/fire-drill.sh (MODIFY if gate wrapper)
- services/platform/tests/integration/sprint28-human-gate-oracles.test.ts (NEW)
- .tmp/REDHAT-FIX-H2/**
- /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/.gate-evidence/**
writeProhibited:
- Weakening oracles to match stubs
- Deleting fail-closed requirements
- Using PATH holo stub that only implements unrelated commands without documenting the real dispatcher

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/inference1/Projects/holocron/.spec/reviews/red-hat-20260728T235155Z-sprint-28.md:103-108 [H-2 finding: human gate not executable; unknown flag --pitr]
2. /Users/inference1/Projects/holocron/.spec/reviews/red-hat-20260728T235155Z-sprint-28.md:25-26 [D05-01 AC-1 verdict: unknown flag]
3. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/SPRINT.md:36-47 [Human Testing Gate + 6 deliverable steps]
4. services/platform/src/cli/holo.ts:436-446 [exitUnknownFlag]
5. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-01-red-restore-fails-closed-on-empty-corrupted-backup-chain.md [fail-closed oracles]
6. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/11-e2e-testing-criteria.md:57-60 [T-PLAT-022/025]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- gate-plan-present: `test -f /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json` → exit 0
- cli-pitr-known: `bun services/platform/src/cli/holo.ts restore --pitr 2099-01-01T00:00:00Z --scratch /tmp/h2-gate-smoke 2>&1 | tee /tmp/h2-cli.txt; ! grep -q 'unknown flag: --pitr' /tmp/h2-cli.txt` → named restore error or validation error — not unknown flag
- human-gate-oracles: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-human-gate-oracles.test.ts` → steps 1–6 oracles pass against real path
- typecheck: `pnpm tsgo --noEmit` → exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260728T235155Z-sprint-28.md, ./SPRINT.md
Interaction notes:
- —
pattern: Gate-plan literal commands bind to real holo dispatcher; each step has machine-checkable oracles; negative control distinguishes parser errors from domain fail-closed.
pattern_source: Sprint human-gate patterns (gate-plan.json); H-2 review evidence; D05-01 named error strings
anti_pattern: Documenting commands the CLI cannot parse; treating unknown-flag exit 2 as restore failure proof; attestation-only gate steps.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — H-2 is gate executability: documented Human Testing Gate steps cannot produce oracles because restore flags are unknown and downstream tools are missing. After H1 lands capability, DevOps must make every gate step's literal_cmd and oracle executable, with step 6 observing named restore fail-closed — not parser exit 2.
Reviewer: code-reviewer (+ security-reviewer when task is security-scoped)

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: REDHAT-FIX-H1
Blocks: —
Coordinates with: D05-01, D05-02, D05-04, REDHAT-FIX-C1, REDHAT-FIX-C3

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
  "task_id": "REDHAT-FIX-H2",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "implemented_restore_path": {
      "description": "H1 has landed restore + fire-drill CLI verbs",
      "seed_method": "cli",
      "records": [
        "backup/restore.ts exists",
        "holo restore --pitr is a known flag path"
      ]
    },
    "healthy_r2_chain": {
      "description": "Real pgBackRest + restic + recovery baseline in R2",
      "seed_method": "public_api",
      "records": [
        "valid PITR window",
        "baseline present",
        "blobs mirrored"
      ]
    },
    "empty_or_corrupt_chain": {
      "description": "Empty or corrupted test-scoped prefix for step 6",
      "seed_method": "public_api",
      "records": [
        "0 base backup OR corrupted WAL",
        "restore must fail closed"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN implemented restore path WHEN gate step 1 runs the documented `holo restore --pitr <timestamp> --scratch <dir>` (via bun dispatcher) THEN exit 0 on valid window, DB queryable, and oracle captures concrete restored proof (SELECT 1 exit 0 and sentinel/row count >= 1) \u2014 command must not fail with unknown flag.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-human-gate-oracles.test.ts -t 'step-1|pitr'",
      "maps_to_ac": null,
      "primary": true,
      "flow_ref": "T-PLAT-022",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "holo-restore+Postgres+R2",
        "topology": "single-node",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "unknown flag: --pitr",
            "exit 0 without queryable DB",
            "gate still documents non-existent flags only"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "implemented_restore_path",
            "action": {
              "actor": "operator",
              "steps": [
                "Run documented step-1 literal_cmd",
                "Capture exit, stderr, psql SELECT 1, row/sentinel count"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code = 0",
                "psql SELECT 1 exit 0",
                "row or pitr_test/sentinel count >= 1",
                "stderr does not contain 'unknown flag: --pitr'"
              ],
              "must_not_observe": [
                "unknown flag: --pitr",
                "exit 2 parser failure",
                "empty/start signature: no DB"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN steps 2\u20135 documented in SPRINT/gate-plan WHEN executed against healthy_r2_chain + fresh target THEN each produces its oracle: isolation PASS lines; parity-report.json row_counts match; LEDGER_CHECKSUM_MATCH true with SHA-256; BLOB_PARITY_PASS true with matched_objects >= 1 on healthy fixture.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-human-gate-oracles.test.ts -t 'step-2|step-3|step-4|step-5|parity'",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "fire-drill+isolation+parity",
        "topology": "single-node",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "missing provision/fire-drill commands",
            "oracles are greps for 'ok' only",
            "blob matched_objects=0 accepted as pass without empty-set justification"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "healthy_r2_chain",
            "action": {
              "actor": "operator",
              "steps": [
                "Run gate steps 2\u20135 literal commands from gate-plan/SPRINT",
                "Collect isolation stdout + parity-report.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "isolation probe exit 0 with PASS markers",
                "jq .row_counts shows concrete integer fields",
                "jq .LEDGER_CHECKSUM_MATCH == true with SHA-256 ledger field",
                "jq .BLOB_PARITY_PASS == true AND jq .matched_objects >= 1"
              ],
              "must_not_observe": [
                "commands not found / unknown flag",
                "parity-report.json missing",
                "empty/start signature: all oracles skipped"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN empty_or_corrupt_chain WHEN gate step 6 runs restore against it THEN exit code != 0 AND stderr/stdout contains a named restore failure (no base backup available|backup chain missing|manifest checksum mismatch|WAL segment corrupted|backup chain integrity) AND must_not_observe the sole error 'unknown flag: --pitr'; PGDATA not promoted queryable success.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-human-gate-oracles.test.ts -t 'step-6|fail-closed|empty'",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-022",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-restore+R2",
        "topology": "single-node",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "step 6 passes because CLI parse fails",
            "exit 0 on empty chain",
            "generic error without naming chain problem"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty_or_corrupt_chain",
            "action": {
              "actor": "operator",
              "steps": [
                "Point restore at empty/corrupt prefix per gate step 6",
                "Capture exit + stderr"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code != 0",
                "stderr matches named restore failure pattern",
                "stderr does not match only unknown flag: --pitr",
                "no fake-success heartbeat/parity success row"
              ],
              "must_not_observe": [
                "unknown flag: --pitr as the only observed failure",
                "exit code 0",
                "empty/start signature: parser exit 2 treated as pass"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN SPRINT.md Human Test Deliverable and gate-plan.json WHEN reviewed after H2 THEN every step has a literal_cmd using the real dispatcher (`bun services/platform/src/cli/holo.ts` or repo bin/holo), expected exit codes, and concrete must_observe oracles; gate-plan schema validates; no step documents a flag the CLI rejects as unknown.",
      "verify": "test -f /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json && rg -n 'restore|fire-drill|parity|literal' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/SPRINT.md",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-plan+cli",
        "topology": "single-node",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "gate-plan missing",
            "commands still show unknown flags",
            "oracles not concrete"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "implemented_restore_path",
            "action": {
              "actor": "operator",
              "steps": [
                "Author/update gate-plan.json for 6 steps",
                "Align SPRINT.md Human Test Deliverable",
                "Smoke each literal_cmd --help or dry invalid args for parse acceptance"
              ]
            },
            "end_state": {
              "must_observe": [
                "gate-plan.json exists with 6 steps",
                "each step has literal_cmd and oracle/must_observe",
                "step 6 oracle explicitly forbids unknown-flag-only success",
                "CLI accepts flags used in steps 1 and 6 (no unknown flag on those tokens)"
              ],
              "must_not_observe": [
                "gate-plan absent",
                "step commands still produce unknown flag: --pitr",
                "empty/start signature: SPRINT steps unchanged and unexecutable"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "gate-plan.json exists with 6 steps",
      "verify": "test -f /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json && python3 -c \"import json;p=json.load(open('/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json')); assert len(p.get('steps',p.get('human_steps',[])))>=6\"",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Human gate oracle integration test",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-human-gate-oracles.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Step 6 distinguishes restore fail-closed from unknown flag",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-human-gate-oracles.test.ts -t 'step-6'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "CLI smoke: --pitr is not unknown flag",
      "verify": "bun services/platform/src/cli/holo.ts restore --pitr 2099-01-01T00:00:00Z --scratch /tmp/h2-gate-smoke 2>&1 | tee /tmp/h2-cli.txt; ! grep -q 'unknown flag: --pitr' /tmp/h2-cli.txt",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Typecheck + lint if CLI touched",
      "verify": "pnpm tsgo --noEmit && pnpm biome check services/platform/src/cli/holo.ts",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->

</details>
