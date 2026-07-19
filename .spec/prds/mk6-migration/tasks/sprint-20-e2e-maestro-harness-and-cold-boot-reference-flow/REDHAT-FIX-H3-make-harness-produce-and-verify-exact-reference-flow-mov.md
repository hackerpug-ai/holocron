# REDHAT-FIX-H3 — Make the harness produce and verify the exact non-empty `reference-flow.mov`, including recorder-failure handling and cleanup
> Status: Backlog
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: devops-engineer
> Estimate: 120 min
> Type: FEATURE
> Priority: P0
> Proposed by: devops-engineer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` H3 (High)

## Outcome

`scripts/e2e/run-maestro-reference-flow.sh` reliably produces a non-zero-byte `.tmp/maestro-reference-flow/reference-flow.mov` from every successful run, surfaces recorder-failure (`Host recording is already in progress` / `Resource busy`) as a non-zero exit, and removes stale `.mov.sb-*` sidecars so the artifact directory contains exactly the named `.mov` plus its sibling screenshot/junit artifacts.

**Success state:** A successful local run produces `reference-flow.mov` with byte size > 0 (no `.mov.sb-*` sidecar-only result); a recorder failure causes the harness to exit non-zero with a `video.log` line naming the failure; stale sidecars are cleaned up before/after the run; the capstone verifier (REDHAT-FIX-H1) accepts the produced `.mov` as evidence.

## Background

- **Specialist rationale:** Red-hat H3 (High) shows the only current video artifact is `reference-flow.mov.sb-99cdcea4-JsW9Yj` (270 MB sidecar) while the required exact `reference-flow.mov` does not exist; `video.log` reports `Error starting video recorder ... Resource busy` / `Host recording is already in progress`. D03-03:52,142, D03-05:53,112, D03-06:31,114, and D03-07:16,51 all require non-empty `reference-flow.mov`.
- **Planning rationale:** This task unblocks D03-03 AC-1/AC-4, D03-05 AC-1/AC-3, D03-06 AC-3, and D03-07 AC-1 — every gate that requires the exact named video. It is upstream of REDHAT-FIX-H1 (verifier needs a real video to derive green) and REDHAT-FIX-H2 (CI bundle must contain a real video).
- **How to verify (human):** Run `scripts/e2e/run-maestro-reference-flow.sh --run` on a clean simulator with no other recording in progress; observe `reference-flow.mov` (size > 0) in the artifact dir with no `.mov.sb-*` sidecar; then trigger a second concurrent recorder and confirm the harness exits non-zero with a `video.log` line.
- **Scope:** `run-maestro-reference-flow.sh` recorder lifecycle + sidecar cleanup; the matching test that asserts the file. Does NOT change the Maestro flow YAML itself.
- **PRD refs:** UC-SYNC-02, 10-e2e-testing, D03-03 AC-1/AC-4

## Critical Constraints

### MUST
- MUST produce a non-zero-byte `reference-flow.mov` at `.tmp/maestro-reference-flow/reference-flow.mov` on every successful run; if `xcrun simctl io dev record --codec=h264` (or equivalent) fails to finalize the file, the harness MUST exit non-zero
- MUST detect the `Host recording is already in progress` / `Resource busy` failure modes by parsing `video.log` and exit non-zero with a clear reason, NEVER silently leaving only a `.mov.sb-*` sidecar
- MUST clean up stale `.mov.sb-*` sidecars (and partial `.mov` files) before and after the run via a `cleanup_video_sidecars` trap on EXIT/INT/TERM

### NEVER
- NEVER treat a `.mov.sb-*` sidecar as a substitute for the exact named `reference-flow.mov`
- NEVER swallow the recorder's non-zero exit code or `video.log` failure lines

### STRICTLY
- STRICTLY the harness MUST verify `reference-flow.mov` is a valid MP4/MOV container (e.g. `file --mime-type` reports `video/quicktime` or `video/mp4`, and `stat -f%z` returns > 0) before exiting 0

## Specification

**Objective:** Fix `run-maestro-reference-flow.sh` so it reliably produces a real `reference-flow.mov`, surfaces recorder failure, and cleans up sidecars.

**Success state:** Successful run → non-empty `.mov` + verified container; recorder failure → non-zero exit + clear reason; no stale sidecars.

## Acceptance Criteria

### AC-1: Successful run produces a valid non-empty reference-flow.mov [PRIMARY]
**GIVEN:** the named iOS Simulator is booted, no other `simctl io` recording is in progress, and the Maestro reference flow runs to a successful junit result
**WHEN:** the operator runs `scripts/e2e/run-maestro-reference-flow.sh --run`
**THEN:** `.tmp/maestro-reference-flow/reference-flow.mov` exists, `stat -f%z` reports size > 0, `file --mime-type` reports `video/quicktime` or `video/mp4`, AND no `.mov.sb-*` sidecar remains in the artifact directory
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-video.test.ts -t 'AC-1'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** macos-runner+ios-simulator+simctl-io
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "macos-runner+ios-simulator+simctl-io",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "sidecar-only", "missing-simulator"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "coldboot_substrate_ready_clean_artifact_dir",
      "action": { "actor": "operator", "steps": ["Run scripts/e2e/run-maestro-reference-flow.sh --run.", "Inspect .tmp/maestro-reference-flow/."] },
      "end_state": {
        "must_observe": ["reference-flow.mov exists", "stat -f%z reference-flow.mov > 0", "file --mime-type reports video/quicktime OR video/mp4", "no .mov.sb-* sidecar in artifact dir"],
        "must_not_observe": ["empty/start signature: only .mov.sb-* sidecar present", "reference-flow.mov size: 0", "harness exitCode: 0 when recorder failed"]
      }
    }
  ]
}
```

### AC-2: Recorder failure surfaces as non-zero exit with named reason
**GIVEN:** a second `simctl io` recording is already in progress on the named simulator (simulating the documented `Host recording is already in progress` / `Resource busy` failure)
**WHEN:** the operator runs `scripts/e2e/run-maestro-reference-flow.sh --run`
**THEN:** the harness exits non-zero, `video.log` contains a line matching `(Host recording is already in progress|Resource busy|simctl io.*failed)`, and `capstone-verdict.sh` (REDHAT-FIX-H1) records `coldboot_gate: red` with a reason naming the video
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-video.test.ts -t 'AC-2'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** scripts/e2e/run-maestro-reference-flow.sh + simctl io failure injection
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "scripts/e2e/run-maestro-reference-flow.sh + simctl io failure injection",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "mock", "static", "swallowed-exit-code"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "coldboot_substrate_with_concurrent_recorder",
      "action": { "actor": "operator", "steps": ["Start a background simctl io record on the same simulator.", "Run the harness.", "Inspect video.log and exit code."] },
      "end_state": {
        "must_observe": ["exitCode != 0", "video.log contains 'Host recording is already in progress' OR 'Resource busy' OR 'simctl io.*failed'", "no reference-flow.mov recorded as success"],
        "must_not_observe": ["exitCode: 0", "empty/start signature: video.log absent or empty", "silent false-pass with only .mov.sb-* sidecar"]
      }
    }
  ]
}
```

### AC-3: Sidecar cleanup runs before AND after every run
**GIVEN:** the artifact directory has a stale `reference-flow.mov.sb-deadbeef-XYZ` from a prior crashed run
**WHEN:** the operator runs `scripts/e2e/run-maestro-reference-flow.sh --run`
**THEN:** the harness removes the stale sidecar at startup (pre-run cleanup), runs the flow, and on exit (success OR failure) leaves the artifact dir with no `.mov.sb-*` files (post-run cleanup trap fired on EXIT/INT/TERM)
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-video.test.ts -t 'AC-3'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** bash EXIT trap + glob cleanup
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "bash EXIT trap + glob cleanup",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "mock", "static", "no-trap"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "artifact_dir_with_stale_sidecar",
      "action": { "actor": "operator", "steps": ["Plant a stale .mov.sb-deadbeef-XYZ in the artifact dir.", "Run the harness.", "List the artifact dir post-run."] },
      "end_state": {
        "must_observe": ["pre-run: stale sidecar removed before maestro invocations begins", "post-run: no .mov.sb-* files remain in artifact dir"],
        "must_not_observe": ["empty/start signature: stale sidecar still present post-run", ".mov.sb-* count: > 0"]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | Successful run leaves a non-empty valid `reference-flow.mov` and no `.mov.sb-*` sidecar | AC-1 | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-video.test.ts -t 'AC-1'` | happy_path |
| TC-2 | Concurrent recorder causes non-zero exit + `video.log` failure line | AC-2 | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-video.test.ts -t 'AC-2'` | error |
| TC-3 | Pre/post-run sidecar cleanup leaves no `.mov.sb-*` files | AC-3 | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-video.test.ts -t 'AC-3'` | happy_path |

## Reading List

1. `scripts/e2e/run-maestro-reference-flow.sh` (1-161) [PRIMARY PATTERN] — the harness being fixed; video section + cleanup() are the edit sites
2. `.tmp/maestro-reference-flow/video.log` — current failure output: `Host recording is already in progress` / `Resource busy`
3. `.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/D03-03-build-maestro-runner-harness-boot-install-execute-capture.md` (52,142) — original AC requiring non-empty `reference-flow.mov`
4. `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` (42-45) — H3 finding: only sidecar exists, recorder failed
5. `docs/ci/maestro-harness.md` — harness operations reference

## Guardrails

### WRITE-ALLOWED
- scripts/e2e/run-maestro-reference-flow.sh (MODIFY — video recorder lifecycle + sidecar cleanup trap)
- tests/integration/sprint20-maestro-harness-video.test.ts (NEW)
- docs/ci/maestro-harness.md (MODIFY — document the recorder-failure handling + cleanup contract)

### WRITE-PROHIBITED
- .e2e/maestro/reference-flow.yaml — Maestro flow definition; out of scope (selectors owned by S-COLDBOOT-03 / REDHAT-FIX-H6)
- scripts/e2e/capstone-verdict.sh — owned by REDHAT-FIX-H1; this task only produces the file the verifier consumes
- .github/workflows/ci-e2e.yml — owned by D03-05; this task's changes propagate via the existing workflow invocation

### Boundaries
- **always:** Trap EXIT/INT/TERM for cleanup; verify container type with `file --mime-type`; parse `video.log` for known failure strings
- **ask_first:** Switching video codec (h264 vs heic) if the named simulator's default differs
- **never:** Treating a `.mov.sb-*` sidecar as success; swallowing recorder non-zero exit; recording green when the video file is absent

## Design

- **references:** scripts/e2e/run-maestro-reference-flow.sh, .tmp/maestro-reference-flow/video.log
- **pattern:** Add a `cleanup_video_sidecars()` bash function called at script start (pre-run) and registered via `trap cleanup_video_sidecars EXIT INT TERM`. After `xcrun simctl io "$device" recordVideo --codec=h264 "$artifact_dir/reference-flow.mov` (forced to the exact name), check `stat -f%z` and `file --mime-type`; on failure parse `video.log` for `(Host recording is already in progress|Resource busy|failed)` and exit non-zero.
- **pattern_source:** scripts/e2e/run-maestro-reference-flow.sh:109-115 (current cleanup())
- **anti_pattern:** Reporting success based on `xcrun simctl io` exit code alone — the recorder can exit 0 while leaving only a `.mov.sb-*` sidecar (observed in production).

## Agent Assignment

- **implementer:** devops-engineer — owns the harness
- **reviewer:** mastra-reviewer — verifies the recorder-failure handling and that no false-pass path remains

## Verification Gates

- **AC-1 valid mov:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-video.test.ts -t 'AC-1'` → Exit 0
- **AC-2 recorder fail:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-video.test.ts -t 'AC-2'` → Exit 0
- **AC-3 cleanup:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-video.test.ts -t 'AC-3'` → Exit 0
- **Scope compliance:** `git diff --name-only | sort -u` → Only guardrails.write_allowed paths

## Coding Standards

- RULES.md
- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

## Dependencies

- **depends_on:** D03-03 (owns the harness; this remediates it)
- **blocks:** REDHAT-FIX-H1 (verifier needs a real .mov), REDHAT-FIX-H2 (CI bundle needs a real .mov), D03-03 AC-1/AC-4, D03-05 AC-1/AC-3, D03-06 AC-3, D03-07 AC-1

## Notes

The `.mov.sb-*` sidecar is a `simctl` artifact left when the recorder process is interrupted. The current cleanup() removes only the named `.mov` and junit files; it does not glob `.mov.sb-*`. The fix MUST treat the absence of the exact named `.mov` AND the presence of any `.mov.sb-*` as a recorder failure, not a success.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H3",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "coldboot_substrate_ready_clean_artifact_dir": {
      "description": "Named iOS Simulator is booted, no concurrent recorder is active, the artifact directory has no stale .mov.sb-* files, and the Maestro reference flow runs to a successful junit.",
      "seed_method": "cli",
      "records": [
        "xcrun simctl boot '$MAESTRO_DEVICE' (or already booted)",
        "rm -f .tmp/maestro-reference-flow/.mov.sb-* .tmp/maestro-reference-flow/reference-flow.mov",
        "pgrep -f 'simctl io.*recordVideo' returns no other recorder"
      ]
    },
    "coldboot_substrate_with_concurrent_recorder": {
      "description": "A background simctl io recordVideo is already in progress on the named simulator to trigger the documented 'Host recording is already in progress' / 'Resource busy' failure.",
      "seed_method": "cli",
      "records": [
        "xcrun simctl io '$MAESTRO_DEVICE' recordVideo --codec=h264 /tmp/background.mov &",
        "background recorder PID captured for cleanup"
      ]
    },
    "artifact_dir_with_stale_sidecar": {
      "description": "A stale reference-flow.mov.sb-deadbeef-XYZ sidecar (and optionally a partial reference-flow.mov) is planted in the artifact dir to prove the pre/post-run cleanup.",
      "seed_method": "cli",
      "records": [
        "touch .tmp/maestro-reference-flow/reference-flow.mov.sb-deadbeef-XYZ",
        "echo partial > .tmp/maestro-reference-flow/reference-flow.mov"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN clean substrate WHEN operator runs run-maestro-reference-flow.sh --run THEN reference-flow.mov exists, size > 0, mime is video/quicktime or video/mp4, and no .mov.sb-* sidecar remains.",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-video.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "macos-runner+ios-simulator+simctl-io",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "sidecar-only", "missing-simulator"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "coldboot_substrate_ready_clean_artifact_dir",
            "action": { "actor": "operator", "steps": ["Run scripts/e2e/run-maestro-reference-flow.sh --run.", "Inspect .tmp/maestro-reference-flow/."] },
            "end_state": {
              "must_observe": ["reference-flow.mov exists", "stat -f%z reference-flow.mov > 0", "file --mime-type reports video/quicktime OR video/mp4", "no .mov.sb-* sidecar in artifact dir"],
              "must_not_observe": ["empty/start signature: only .mov.sb-* sidecar present", "reference-flow.mov size: 0", "harness exitCode: 0 when recorder failed"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN a concurrent recorder WHEN operator runs the harness THEN harness exits non-zero and video.log contains a known failure line.",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-video.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "scripts/e2e/run-maestro-reference-flow.sh + simctl io failure injection",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub", "mock", "static", "swallowed-exit-code"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "coldboot_substrate_with_concurrent_recorder",
            "action": { "actor": "operator", "steps": ["Start a background simctl io record on the same simulator.", "Run the harness.", "Inspect video.log and exit code."] },
            "end_state": {
              "must_observe": ["exitCode != 0", "video.log contains 'Host recording is already in progress' OR 'Resource busy' OR 'simctl io.*failed'", "no reference-flow.mov recorded as success"],
              "must_not_observe": ["exitCode: 0", "empty/start signature: video.log absent or empty", "silent false-pass with only .mov.sb-* sidecar"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN a stale sidecar in the artifact dir WHEN operator runs the harness THEN pre/post-run cleanup leaves no .mov.sb-* files.",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-video.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "bash EXIT trap + glob cleanup",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub", "mock", "static", "no-trap"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "artifact_dir_with_stale_sidecar",
            "action": { "actor": "operator", "steps": ["Plant a stale .mov.sb-deadbeef-XYZ in the artifact dir.", "Run the harness.", "List the artifact dir post-run."] },
            "end_state": {
              "must_observe": ["pre-run: stale sidecar removed before maestro invocations begins", "post-run: no .mov.sb-* files remain in artifact dir"],
              "must_not_observe": ["empty/start signature: stale sidecar still present post-run", ".mov.sb-* count: > 0"]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Successful run leaves a non-empty valid reference-flow.mov with no sidecar",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-video.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Concurrent recorder causes non-zero exit + video.log failure line",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-video.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Pre/post-run sidecar cleanup leaves no .mov.sb-* files",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-video.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    }
  ]
}
-->
