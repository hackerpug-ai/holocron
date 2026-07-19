# REDHAT-FIX-H1 — Add the executable Sprint 20 capstone verifier and replayable `capstone-verdict.json`; regenerate machine gate evidence from current main
> Status: Backlog
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: devops-engineer
> Estimate: 90 min
> Type: FEATURE
> Priority: P0
> Proposed by: devops-engineer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` H1 (Critical)

## Outcome

`scripts/e2e/capstone-verdict.sh` exists, is executable, derives `coldboot_gate` from real `junit.xml`/screenshot/video/DB evidence (never a hardcoded pass), writes a replayable `.tmp/maestro-reference-flow/capstone-verdict.json`, and a Sprint-20 `gate-results.json` is regenerated from the current `main` SHA by independently recomputing the gate.

**Success state:** `test -x scripts/e2e/capstone-verdict.sh && scripts/e2e/capstone-verdict.sh --check` exits 0; running the verifier after a real `run-maestro-reference-flow.sh --run` writes `capstone-verdict.json` whose `coldboot_gate` field is derived from `junit.xml` failures==0 + non-zero screenshot + non-zero video + Postgres agent row + Zero query — and the file names every evidence path it derived the verdict from; a fresh `gate-results.json` lives at the Sprint-20 root and records `committed_sha` equal to current `git rev-parse HEAD`.

## Background

- **Specialist rationale:** The red-hat review (H1, Critical) proved that D03-07's required artifacts (`scripts/e2e/capstone-verdict.sh`, `.tmp/maestro-reference-flow/capstone-verdict.json`) do not exist on `main`, and no Sprint-20 `gate-results.json` exists. `sprint-goal-state.json:45,83,211` substitutes the harness run and prose claims for the missing verifier — a proxy pass.
- **Planning rationale:** This is the keystone remediation: H2/H3 (CI dispatch, video) feed evidence INTO the capstone verdict, so the verifier must exist before their evidence can be folded into a replayable green. The verifier MUST derive from real artifacts (D03-07 AC-1 contract) — never echo CI status or a boolean.
- **How to verify (human):** Run the verifier against a known-green local run and inspect `capstone-verdict.json`; then run it against a deliberately emptied `.tmp/maestro-reference-flow/` and confirm it records `coldboot_gate: red` with a missing-evidence reason.
- **Scope:** New verifier script + JSON schema + Vitest test. Does NOT re-run the Maestro flow itself (that's D03-07 AC-1's job to produce the evidence).
- **PRD refs:** UC-SYNC-02, 10-e2e-testing, D03-07 AC-1/AC-2

## Critical Constraints

### MUST
- MUST derive `coldboot_gate` from real artifacts (`junit.xml` failure count, screenshot/video byte size, Postgres `chat_messages` row count, Zero-cache query result) — never from a hardcoded pass or a CI status flag
- MUST write `capstone-verdict.json` with a `committed_sha` field equal to `git rev-parse HEAD` at verifier-run time and an `evidence[]` array naming every file path + checksum it used
- MUST fail closed (exit non-zero + `coldboot_gate: red`) when any required evidence file is missing, empty, or contradicts the asserted gate

### NEVER
- NEVER record `coldboot_gate: green` when `EXPO_DEV_BUILD_PATH`, the named simulator, or any real backend dependency was missing during the run
- NEVER accept `sprint-goal-state.json` or the harness exit code as evidence — only the named artifact files count

### STRICTLY
- STRICTLY the verifier script is invokable as `capstone-verdict.sh --check` (static preflight, no DB query) and `capstone-verdict.sh` (full derivation); both forms MUST be deterministic and replayable from a clean checkout given the artifact directory

## Specification

**Objective:** Add `scripts/e2e/capstone-verdict.sh` per D03-07 AC-1 contract; regenerate Sprint-20 `gate-results.json` from the current `main` SHA via independent recomputation.

**Success state:** Verifier script exists + executable, derives verdict from real artifacts, emits replayable JSON, and `gate-results.json` is regenerated against current `main`.

## Acceptance Criteria

### AC-1: Capstone verifier exists and derives a green verdict from real evidence [PRIMARY]
**GIVEN:** a real local run has produced `.tmp/maestro-reference-flow/{junit.xml,final.png,reference-flow.mov}` with `junit.xml` reporting zero failures and a non-zero-byte video, AND a Postgres agent row exists for the reference conversation, AND a live Zero query returns it
**WHEN:** the operator runs `scripts/e2e/capstone-verdict.sh`
**THEN:** the script exits 0 and writes `.tmp/maestro-reference-flow/capstone-verdict.json` whose `"coldboot_gate": "green"`, whose `"committed_sha"` matches `git rev-parse HEAD`, and whose `"evidence"` array names every file path with a sha256 checksum
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'AC-1'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** scripts/e2e/capstone-verdict.sh + real junit.xml/screenshot/video + real Postgres + real Zero-cache
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "capstone-verdict.sh + real junit.xml/screenshot/video + real Postgres + real Zero-cache",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "hardcoded-pass", "missing-build", "missing-simulator"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "coldboot_substrate_ready_with_green_artifacts",
      "action": { "actor": "operator", "steps": ["Run the capstone verifier against a real green local run.", "Inspect capstone-verdict.json."] },
      "end_state": {
        "must_observe": ["coldboot_gate: green", "committed_sha equals git rev-parse HEAD (40 hex chars)", "evidence[].path includes junit.xml, final.png, reference-flow.mov", "evidence[].sha256 each 64 hex chars", "junit_failures: 0"],
        "must_not_observe": ["coldboot_gate: red", "empty/start signature: missing evidence[] entries", "hardcoded boolean without sha256 checksums"]
      }
    }
  ]
}
```

### AC-2: Verifier fails closed (red verdict) when evidence is missing or stale
**GIVEN:** `.tmp/maestro-reference-flow/junit.xml` is missing OR `reference-flow.mov` is zero bytes OR the Postgres agent row is absent
**WHEN:** the operator runs `scripts/e2e/capstone-verdict.sh`
**THEN:** the script exits non-zero and writes `capstone-verdict.json` with `"coldboot_gate": "red"` and a `"reason"` field naming the specific missing/empty/contradicting evidence
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'AC-2'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** scripts/e2e/capstone-verdict.sh
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "scripts/e2e/capstone-verdict.sh",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "hardcoded-pass"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "coldboot_substrate_with_video_removed",
      "action": { "actor": "operator", "steps": ["Remove or zero out reference-flow.mov.", "Run the verifier.", "Inspect the JSON."] },
      "end_state": {
        "must_observe": ["exitCode != 0", "coldboot_gate: red", "reason contains the substring 'reference-flow.mov'"],
        "must_not_observe": ["exitCode: 0", "coldboot_gate: green", "empty/start signature: reason absent OR empty string"]
      }
    }
  ]
}
```

### AC-3: Sprint-20 gate-results.json regenerated from current main
**GIVEN:** the verifier exists and the Sprint-20 directory currently has no `gate-results.json` (or a stale one referencing `b084dd5`)
**WHEN:** the operator runs `scripts/e2e/regenerate-sprint-gate.sh sprint-20` (or the documented equivalent)
**THEN:** `.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/gate-results.json` exists, records `committed_sha` equal to current `git rev-parse HEAD`, lists each of the 6 human-test steps with a real PASS/PARTIAL/FAIL verdict backed by an evidence path, and is idempotent on re-run
**VERIFY:** `scripts/e2e/regenerate-sprint-gate.sh sprint-20 && jq -r '.committed_sha' .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/gate-results.json | grep -q "$(git rev-parse HEAD)"`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** scripts/e2e/regenerate-sprint-gate.sh + jq
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "scripts/e2e/regenerate-sprint-gate.sh",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "stale-sha"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "sprint20_directory_with_verifier_present",
      "action": { "actor": "operator", "steps": ["Run regenerate-sprint-gate.sh sprint-20.", "Read gate-results.json."] },
      "end_state": {
        "must_observe": ["gate-results.json exists", "committed_sha matches git rev-parse HEAD (40 hex chars)", "steps[] has 6 entries", "at least one step has verdict PASS or PARTIAL with a non-empty evidence_path"],
        "must_not_observe": ["committed_sha: b084dd5 (stale)", "empty/start signature: steps[] empty OR evidence_path empty strings"]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | `scripts/e2e/capstone-verdict.sh` exists, is executable, and `--check` exits 0 on the trunk | AC-1 | `test -x scripts/e2e/capstone-verdict.sh && scripts/e2e/capstone-verdict.sh --check` | happy_path |
| TC-2 | Green-verdict derivation requires real non-empty evidence; missing video produces a red verdict | AC-2 | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'AC-2'` | error |
| TC-3 | gate-results.json committed_sha equals current `git rev-parse HEAD` and steps[] is non-empty | AC-3 | `jq -r '.committed_sha' .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/gate-results.json \| grep -q "$(git rev-parse HEAD)" && jq -e '.steps\|length >= 6' .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/gate-results.json` | happy_path |

## Reading List

1. `scripts/e2e/run-maestro-reference-flow.sh` (1-161) [PRIMARY PATTERN] — the fail-closed harness whose artifacts the verifier consumes; same bash + jq idiom
2. `.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/D03-07-prove-cold-boot-reference-flow-green-go-no-go-capstone.md` (44-131) — the AC-1/AC-2/AC-3 contract this verifier must satisfy
3. `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` (29-34) — H1 finding: missing script + JSON
4. `services/platform/src/cli/holo.ts` (1320-1400) — `repl:status` pattern; same exit-code + JSON shape
5. `brain/docs/kanban/SCENARIO-CONTRACT-V1.md` — scenario contract schema

## Guardrails

### WRITE-ALLOWED
- scripts/e2e/capstone-verdict.sh (NEW — derives coldboot_gate from real evidence)
- scripts/e2e/regenerate-sprint-gate.sh (NEW — emits Sprint-NN gate-results.json from current main)
- tests/integration/sprint20-capstone-verdict.test.ts (NEW)
- .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/gate-results.json (NEW — regenerated artifact)

### WRITE-PROHIBITED
- scripts/e2e/run-maestro-reference-flow.sh — owned by D03-03 / REDHAT-FIX-H3; this task only consumes its artifacts
- .github/workflows/** — owned by D03-05 / REDHAT-FIX-H2; this task only observes CI runs
- .spec/prds/mk6-migration/tasks/sprint-20-*/sprint-goal-state.json — owned by the sprint close handshake, NOT this verifier

### Boundaries
- **always:** Derive verdict from real artifact files; record sha256 checksums in evidence[]; emit deterministic JSON
- **ask_first:** Any change to run-maestro-reference-flow.sh discovered necessary
- **never:** Hardcode `coldboot_gate: green`; copy `sprint-goal-state.json` into `gate-results.json`; record a verdict without naming evidence paths

## Design

- **references:** scripts/e2e/run-maestro-reference-flow.sh, services/platform/src/cli/holo.ts (repl:status)
- **pattern:** Bash + jq. `capstone-verdict.sh` parses `junit.xml` via `xmlstarlet sel` or a small `node` helper (to avoid a new dep), checks `final.png` and `reference-flow.mov` byte sizes via `stat -f%z`, queries Postgres via `psql` for `select count(*) from chat_messages where conversation_id=... and role='agent'`, queries Zero via the documented zero-cache HTTP endpoint, then writes `capstone-verdict.json` with `{committed_sha, coldboot_gate, junit_failures, evidence:[{path,sha256,bytes}], reason?}`.
- **pattern_source:** scripts/e2e/run-maestro-reference-flow.sh:140-161
- **anti_pattern:** Recording `coldboot_gate: green` because the prior `sprint-goal-state.json` said so, or because the local harness exited 0, without recomputing from the artifacts.

## Agent Assignment

- **implementer:** devops-engineer — owns the composed go/no-go verdict and the gate-regeneration script
- **reviewer:** mastra-reviewer — verifies the verdict is evidence-derived, not a hardcoded pass

## Verification Gates

- **AC-1 verifier exists + green:** `test -x scripts/e2e/capstone-verdict.sh && scripts/e2e/capstone-verdict.sh --check` → Exit 0
- **AC-2 red verdict on missing evidence:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'AC-2'` → Exit 0
- **AC-3 gate-results.json current:** `jq -r '.committed_sha' .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/gate-results.json | grep -q "$(git rev-parse HEAD)"` → Exit 0
- **Scope compliance:** `git diff --name-only | sort -u` → Only guardrails.write_allowed paths

## Coding Standards

- RULES.md
- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

## Dependencies

- **depends_on:** D03-07 (defines the contract this verifier fulfills), REDHAT-FIX-H3 (must produce a non-empty `reference-flow.mov` for the green case)
- **blocks:** REDHAT-FIX-H2 (CI capstone reproduction consumes this verifier), the Sprint-20 close handshake

## Notes

The red-hat review (H1) explicitly calls out that `sprint-goal-state.json:45,83,211` substitutes the harness run and prose claims for the missing verifier. The remediation MUST NOT reuse that file as evidence — only real artifact files count. The verifier is the single source of truth for `coldboot_gate`; downstream Sprints 22-26 and 29 gate on it.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H1",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "coldboot_substrate_ready_with_green_artifacts": {
      "description": "A real local run of run-maestro-reference-flow.sh --run has produced .tmp/maestro-reference-flow/{junit.xml,final.png,reference-flow.mov} with zero junit failures and a non-zero-byte video; the reference conversation has an agent row in Postgres and is returned by a live Zero query.",
      "seed_method": "cli",
      "records": [
        ".tmp/maestro-reference-flow/junit.xml tests=1 failures=0",
        ".tmp/maestro-reference-flow/final.png size > 0",
        ".tmp/maestro-reference-flow/reference-flow.mov size > 0",
        "psql: select count(*) from chat_messages where conversation_id='reference' and role='agent' returns >= 1"
      ]
    },
    "coldboot_substrate_with_video_removed": {
      "description": "Same green substrate, but reference-flow.mov has been deleted (or replaced with a zero-byte file) to prove the verifier fails closed instead of false-passing.",
      "seed_method": "cli",
      "records": [
        "rm .tmp/maestro-reference-flow/reference-flow.mov"
      ]
    },
    "sprint20_directory_with_verifier_present": {
      "description": "Verifier script exists and is executable; the Sprint-20 directory currently has no gate-results.json or a stale one referencing b084dd5.",
      "seed_method": "cli",
      "records": [
        "test -x scripts/e2e/capstone-verdict.sh",
        "test ! -e .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/gate-results.json OR jq -r .committed_sha ... returns b084dd5"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN real green artifacts exist WHEN operator runs capstone-verdict.sh THEN JSON is written with coldboot_gate: green, committed_sha matching HEAD, and an evidence[] array naming junit.xml/final.png/reference-flow.mov with sha256 checksums.",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "capstone-verdict.sh + real junit.xml/screenshot/video + real Postgres + real Zero-cache",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "hardcoded-pass", "missing-build", "missing-simulator"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "coldboot_substrate_ready_with_green_artifacts",
            "action": { "actor": "operator", "steps": ["Run the capstone verifier against a real green local run.", "Inspect capstone-verdict.json."] },
            "end_state": {
              "must_observe": ["coldboot_gate: green", "committed_sha equals git rev-parse HEAD (40 hex chars)", "evidence[].path includes junit.xml, final.png, reference-flow.mov", "evidence[].sha256 each 64 hex chars", "junit_failures: 0"],
              "must_not_observe": ["coldboot_gate: red", "empty/start signature: missing evidence[] entries", "hardcoded boolean without sha256 checksums"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN a required evidence file is missing or zero bytes WHEN operator runs capstone-verdict.sh THEN exit is non-zero and JSON records coldboot_gate: red with a reason naming the offending file.",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "scripts/e2e/capstone-verdict.sh",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "hardcoded-pass"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "coldboot_substrate_with_video_removed",
            "action": { "actor": "operator", "steps": ["Remove or zero out reference-flow.mov.", "Run the verifier.", "Inspect the JSON."] },
            "end_state": {
              "must_observe": ["exitCode != 0", "coldboot_gate: red", "reason contains the substring 'reference-flow.mov'"],
              "must_not_observe": ["exitCode: 0", "coldboot_gate: green", "empty/start signature: reason absent OR empty string"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN the verifier exists WHEN operator runs regenerate-sprint-gate.sh sprint-20 THEN gate-results.json is written with committed_sha matching HEAD and a 6-entry steps[] array with non-empty evidence_path values.",
      "verify": "scripts/e2e/regenerate-sprint-gate.sh sprint-20 && jq -r '.committed_sha' .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/gate-results.json | grep -q \"$(git rev-parse HEAD)\"",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "scripts/e2e/regenerate-sprint-gate.sh + jq",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "stale-sha"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "sprint20_directory_with_verifier_present",
            "action": { "actor": "operator", "steps": ["Run regenerate-sprint-gate.sh sprint-20.", "Read gate-results.json."] },
            "end_state": {
              "must_observe": ["gate-results.json exists", "committed_sha matches git rev-parse HEAD (40 hex chars)", "steps[] has 6 entries", "at least one step has verdict PASS or PARTIAL with a non-empty evidence_path"],
              "must_not_observe": ["committed_sha: b084dd5 (stale)", "empty/start signature: steps[] empty OR evidence_path empty strings"]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Verifier script exists, is executable, and --check exits 0 on the trunk",
      "verify": "test -x scripts/e2e/capstone-verdict.sh && scripts/e2e/capstone-verdict.sh --check",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Missing/empty evidence produces red verdict with a reason naming the offending file",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "gate-results.json committed_sha matches HEAD and steps[] length >= 6",
      "verify": "jq -r '.committed_sha' .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/gate-results.json | grep -q \"$(git rev-parse HEAD)\" && jq -e '.steps|length >= 6' .spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/gate-results.json",
      "maps_to_ac": "AC-3"
    }
  ]
}
-->
