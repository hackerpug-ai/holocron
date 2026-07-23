# GATE-FIX-002 — Gate step 2 proves real WIP=1 without self-matching grep
> Status: ⬜ Pending
> Sprint: [Sprint 23](./SPRINT.md)
> Agent: devops-engineer
> Reviewer: code-reviewer
> Estimate: 60 min
> Type: CONFIG
> Priority: P0
> Proposed By: kb-run-human-tests (wiring gap on verified run `20260723T050041Z`)
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome
Step 2 uses a **real successful research burst** (at least one winner lands) and an assertion that **cannot** pass by matching its own `# literal_cmd:` echo while still proving `WIP_ONE_EXCEEDED`.

## Evidence (immutable)
- Run: `20260723T050041Z` · step 2 contract-pass but functional claim **not** proven
- `.gate-evidence/20260723T050041Z/step2.log` — all 6× `MISSION_RUNTIME_FAILED`; `NO_WIP_IN_BURST`; regex matched `WIP_ONE_EXCEEDED` only via command echo
- `gate-results.json` caveats[] documents self-referential grep leak
- Preserve `.gate-evidence/20260723T050041Z/**` untouched

## Critical Constraints
### MUST
- MUST rewrite step 2 `literal_cmd` so a real concurrent research burst can land a winner (HTTP 2xx / ok run) **and** at least one refusal with body code `WIP_ONE_EXCEEDED`
- MUST set assertion so pass requires response-body (or constructed sentinel) evidence that **does not appear as a continuous token in the `# literal_cmd:` line**
- MUST preserve `20260723T050041Z` evidence
### NEVER
- NEVER change product source or migrations to “greenwash” the gate
- NEVER leave `expect_log_regex` as bare `WIP_ONE_EXCEEDED` while that string remains inside `literal_cmd` (self-match)
### STRICTLY
- STRICTLY proof = real WIP refusal from API body/DB, not log-header echo of the grep string
- STRICTLY WRITE-ALLOWED only gate plan / gate notes (no `services/**`)

## Specification
- **Objective:** Close step 2 wiring gap: self-matching grep + all-runtime-failed burst.
- **Success state:** Fresh step 2 evidence shows ≥1 success create and ≥1 `WIP_ONE_EXCEEDED` in a response body; assertion cannot pass on command-echo alone.

## Acceptance Criteria
### AC-1: Assertion cannot match command echo alone [PRIMARY]
**GIVEN:** step 2 `literal_cmd` is echoed into `step2.log` as `# literal_cmd: …`
**WHEN:** assertion `expect_log_regex` is evaluated against a log that has **only** the command echo (no body hits)
**THEN:** assertion fails (regex must not match the echo line alone)
**VERIFY:** Documented check: strip body; only `# literal_cmd` line present → `python3 re.search(expect_log_regex, echo_only)` is False
**TEST_TIER:** integration · **FLOW_REF:** UC-SVC-05

### AC-2: Real successful research burst + WIP refusal
**GIVEN:** platform on `:4111` + fleet healthy enough for research template to accept ≥1 create
**WHEN:** step 2 concurrent burst runs (same subject)
**THEN:** evidence shows ≥1 successful create **and** ≥1 response body with `WIP_ONE_EXCEEDED` (not all `MISSION_RUNTIME_FAILED`)
**VERIFY:** Fresh `.gate-evidence/<new>/step2.log` contains a success marker and a body-level WIP code; `NO_WIP_IN_BURST` absent when WIP proven

### AC-3: Fail archive preserved
**GIVEN:** `.gate-evidence/20260723T050041Z/step2.log`
**WHEN:** task lands
**THEN:** historical log still shows all `MISSION_RUNTIME_FAILED` + `NO_WIP_IN_BURST`
**VERIFY:** `grep -q NO_WIP_IN_BURST .gate-evidence/20260723T050041Z/step2.log`

## Test Criteria
| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | expect_log_regex does not match echo-only log | AC-1 | AC-1 VERIFY |
| TC-2 | Fresh burst has success + WIP body code | AC-2 | AC-2 VERIFY |
| TC-3 | 20260723T050041Z step2.log preserved | AC-3 | AC-3 VERIFY |

## Guardrails
**WRITE-ALLOWED:** `gate-plan.json` (step 2 `literal_cmd` + assertion + method_note); optional `GATE-RESULTS.md`
**WRITE-PROHIBITED:** `services/**`, migrations, `.gate-evidence/20260723T050041Z/**`

## Agent Instructions
1. Change step 2 assertion off bare `WIP_ONE_EXCEEDED` if that token remains in `literal_cmd` (prefer body fragment like `"code"\s*:\s*"WIP_ONE_EXCEEDED"` **or** a sentinel string that is **not** a contiguous substring of the `# literal_cmd:` line — e.g. split-quoted construction).
2. Ensure burst can land a real winner (healthy fleet / research path) so partial unique index collides.
3. Do not modify product handlers or migrations.
4. Preserve historical evidence; re-run gate for new proof under a new run id.

## Verification Gates
1. AC-1/TC-1 (echo-only fail)
2. Fresh step 2 evidence for AC-2
3. `git diff` ⊆ writeAllowed

## Dependencies
- depends_on: gate-1 (WIP=1 product already landed)
- blocks: honest human-gate re-pass for step 2

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-002",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "s23_step2_wiring_gap_log": {
      "description": "Historical step2.log: self-matching WIP_ONE_EXCEEDED echo, all MISSION_RUNTIME_FAILED",
      "seed_method": "file_artifact",
      "records": [".gate-evidence/20260723T050041Z/step2.log"]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "Assertion fails on command-echo-only log",
      "verify": "re.search(expect_log_regex, echo_only) is False",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-plan+file_artifact",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["self-matching grep token in literal_cmd", "stub", "empty"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [{
          "start_ref": "s23_step2_wiring_gap_log",
          "action": { "actor": "operator", "steps": ["Evaluate expect_log_regex against # literal_cmd line only"] },
          "end_state": {
            "must_observe": ["no match on echo-only"],
            "must_not_observe": ["pass solely because WIP_ONE_EXCEEDED appears in literal_cmd"]
          }
        }]
      }
    },
    { "id": "AC-2", "type": "acceptance_criterion", "description": "Real burst: success create + WIP_ONE_EXCEEDED body", "verify": "fresh step2.log body-level proof" },
    { "id": "AC-3", "type": "acceptance_criterion", "description": "Historical step2.log preserved", "verify": "grep NO_WIP_IN_BURST historical log" },
    { "id": "TC-1", "type": "test_criterion", "description": "Echo-only does not satisfy assertion", "maps_to_ac": "AC-1", "verify": "AC-1 VERIFY" },
    { "id": "TC-2", "type": "test_criterion", "description": "Fresh evidence has success and WIP body", "maps_to_ac": "AC-2", "verify": "AC-2 VERIFY" },
    { "id": "TC-3", "type": "test_criterion", "description": "Archive preserved", "maps_to_ac": "AC-3", "verify": "AC-3 VERIFY" }
  ]
}
-->
