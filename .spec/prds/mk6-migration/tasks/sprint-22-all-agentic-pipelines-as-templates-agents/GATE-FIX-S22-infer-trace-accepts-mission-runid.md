# GATE-FIX-S22 — `holo infer:trace` must accept mission `runId` from a just-completed business report

> Status: ✅ Completed
> Commit: cf91abad0ff35f546cb9a029a35d2c6036820f1e
> Reviewer: mastra-reviewer
> Completed: 2026-07-21T23:01:04Z
> Sprint: [Sprint 22 — All Agentic Pipelines as Templates/Agents](./SPRINT.md)
> Agent: mastra-implementer
> Estimate: 90 min
> Type: FEATURE
> Priority: P0
> Proposed by: kb-run-sprint (post-remediation human gate fail)
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: Fresh post-REDHAT QA gate `2026-07-21T22:12:30Z` deliverable step 6 / plan step 7 fail

## Outcome

Public contract restored: after `holo mission run report … --json` returns `runId=R`, the documented command

```bash
bun run services/platform/src/cli/holo.ts infer:trace R --json
```

exits 0 with durable `modelCalls[]` showing `provider:"fleet"` (and zero `anthropic`) **without** substituting another command and **without** requiring a secret/undocumented identity.

**Success state:** Gate failure on runId `019f86be-b88a-7210-be80-13cd2ffef199` (and any future business-report runId) is fixed; fresh QA fail evidence under `.gate-evidence/2026-07-21T22:12:30Z/` is preserved untouched.

## Background

- **Fresh QA fail (preserved):**
  - Evidence dir: `.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/.gate-evidence/2026-07-21T22:12:30Z/`
  - Plan step 4 / deliverable step 3 log (`step4.log` in plan numbering; file also mirrored as step3 in shell scripts): completed `mission run report --kind revenue-validation --target acme-corp.com` with `runId=019f86be-b88a-7210-be80-13cd2ffef199`
  - Plan step 7 / deliverable step 6: `infer:trace 019f86be-b88a-7210-be80-13cd2ffef199 --json` → `exit 1`, `code=INFER_TRACE_NOT_FOUND`
  - `gate-results.json` `verdict:"fail"`, steps_passed 6/7
- **Root-cause (orchestrator-verified):**
  - Mission engine **always** persists to `holocron_nonprod` via `resolveHolocronNonprodDatabaseUrl` (`runtime.ts` `runMissionInternal`).
  - `loadInferTrace` / `listInferenceTelemetry` defaulted to `resolveDatabaseUrl({ preferHolocron: true })` → **`postgres://…/holocron`** when `DATABASE_URL` is unset.
  - Repro: `unset DATABASE_URL; holo infer:trace <runId>` → `INFER_TRACE_NOT_FOUND` even though `mission_runs` + `inference_telemetry` rows exist in `holocron_nonprod` for that runId (confirmed via `psql`).
  - With `DATABASE_URL=…/holocron_nonprod` the same id succeeds — so this is a **public DB identity mismatch**, not missing telemetry.
- **Out of scope:** re-running full QA gate / self-certifying human_test; C-1/C-2/H-2/H-3 product work; `task/obs-4`.

## Critical Constraints

### MUST
- MUST make `holo infer:trace <missionRunId>` resolve against the **same** nonprod DB identity missions use by default (`resolveHolocronNonprodDatabaseUrl` or equivalent), so the gate does not depend on ambient `DATABASE_URL` pointing at the right catalog
- MUST keep accepting the **mission run UUID** from `mission run report` JSON `runId` as the documented public id
- MUST still source `modelCalls` only from durable `inference_telemetry` (no invented rows; no re-run mission)
- MUST preserve `.gate-evidence/2026-07-21T22:12:30Z/**` fail evidence (never overwrite)
- MUST add a regression integration test that fails on HEAD without the fix (RED) and passes with the fix (GREEN)

### NEVER
- NEVER “fix” the gate by substituting `mission run report` for `infer:trace`
- NEVER invent `modelCalls` when neither mission nor telemetry exist in the mission nonprod DB
- NEVER touch `task/obs-4` or evals-ci-gate product surfaces
- NEVER delete or rewrite the preserved QA fail directory `2026-07-21T22:12:30Z`

### STRICTLY
- STRICTLY `unset DATABASE_URL` (or missing DATABASE_URL) + known nonprod mission runId with fleet telemetry → exit 0, `ok:true`, `count(provider==fleet)>=1`, `count(provider==anthropic)==0`
- STRICTLY unknown UUID still fails closed (`INFER_TRACE_NOT_FOUND` / non-zero exit) — no empty-success greenwash
- STRICTLY WRITE-ALLOWED only paths below

## Acceptance Criteria

### AC-1: Mission runId resolves without ambient DATABASE_URL [PRIMARY]
**GIVEN:** A completed business-report mission run R exists in holocron_nonprod with ≥1 `inference_telemetry` row for `run_id=R` AND process environment has **no** `DATABASE_URL` set
**WHEN:** Operator runs `bun run services/platform/src/cli/holo.ts infer:trace R --json`
**THEN:** Exit 0; JSON `ok:true`; `runId=R`; `modelCalls` length ≥ 1; ≥1 call has `provider=="fleet"`; 0 calls have `provider=="anthropic"`
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/gate-fix-s22-infer-trace-runid.test.ts -t 'AC-1'`

### AC-2: Fail-closed for unknown id still holds
**GIVEN:** UUID with no mission_runs row and no telemetry in nonprod
**WHEN:** `infer:trace <missing> --json`
**THEN:** Exit ≠ 0; `ok:false`; code `INFER_TRACE_NOT_FOUND` (or `MISSION_RUN_NOT_FOUND`); no invented modelCalls
**VERIFY:** same suite `-t 'AC-2'`

### AC-3: Documented public id remains mission runId (no substitute command)
**GIVEN:** Fresh `mission run report --kind competitive --target example.com --json` captures `runId`
**WHEN:** Immediately `infer:trace <runId> --json` (literal command contains `infer:trace`)
**THEN:** Exit 0 with fleet modelCalls; evidence artifact records CMD containing `infer:trace` (not `mission run report`)
**VERIFY:** same suite `-t 'AC-3'`

### AC-4: Preserved QA fail evidence remains intact
**GIVEN:** Directory `.gate-evidence/2026-07-21T22:12:30Z/`
**WHEN:** This task lands
**THEN:** That directory still exists with step7/step6 fail logs showing historical `INFER_TRACE_NOT_FOUND` for `019f86be-b88a-7210-be80-13cd2ffef199` (historical fail preserved)
**VERIFY:** `test -f …/2026-07-21T22:12:30Z/step7.log && grep -q INFER_TRACE_NOT_FOUND …/step7.log`

## Guardrails

### WRITE-ALLOWED
- `services/platform/src/inference/infer-trace.ts`
- `services/platform/src/inference/telemetry.ts` (only if default DB resolution must align; prefer fixing via infer-trace options)
- `services/platform/src/cli/holo.ts` (only if needed for DB wiring / help)
- `services/platform/tests/integration/gate-fix-s22-infer-trace-runid.test.ts` (NEW)
- `vitest.config.ts` (include new test only)
- `.tmp/sprint-22/gate-fix-s22-*` evidence artifacts (not committed)

### WRITE-PROHIBITED
- `.spec/prds/mk6-migration/tasks/sprint-22-…/.gate-evidence/2026-07-21T22:12:30Z/**` — **immutable fail archive**
- `task/obs-4` and any evals-ci-gate product code
- Unrelated REDHAT-FIX product surfaces except shared DB resolution used by infer:trace

## Dependencies
- depends_on: REDHAT-FIX-3 (command exists)
- blocks: honest post-remediation human gate pass for deliverable step 6

## Agent Instructions
1. RED: write test that unsets DATABASE_URL and expects fleet modelCalls for a nonprod mission run — fails on current HEAD.
2. GREEN: align `loadInferTrace` DB resolution with `resolveHolocronNonprodDatabaseUrl` (mission engine identity).
3. Optionally also resolve by `mission_runs.trace_id` when the operator passes a `mission:…` trace id — but **must** keep mission run UUID as primary public id.
4. Do not rewrite historical QA fail logs.
5. Do not self-certify the full sprint gate.

## Requirement Contract
<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-S22-infer-trace-runid",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "business_report_run_nonprod": {
      "description": "Completed business-report mission in holocron_nonprod with fleet inference_telemetry rows keyed by run_id",
      "seed_method": "cli"
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "infer:trace resolves mission runId without ambient DATABASE_URL against nonprod telemetry",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/gate-fix-s22-infer-trace-runid.test.ts -t 'AC-1'",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+cli+fleet",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["wrong default DB holocron", "stub", "empty", "invented modelCalls", "disconnect"] },
        "evidence": { "artifact_type": "api_response", "required_capture": true },
        "cases": [
          {
            "start_ref": "business_report_run_nonprod",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Unset DATABASE_URL",
                "Run holo infer:trace <missionRunId> --json"
              ]
            },
            "end_state": {
              "must_observe": [
                "\"ok\": true",
                "\"provider\": \"fleet\" count >= 1 in modelCalls",
                "exit_code == 0",
                "modelCalls.length >= 1"
              ],
              "must_not_observe": [
                "\"code\": \"INFER_TRACE_NOT_FOUND\"",
                "\"provider\": \"anthropic\"",
                "empty modelCalls",
                "\"ok\": true with modelCalls: []"
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
      "description": "Unknown id fails closed",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/gate-fix-s22-infer-trace-runid.test.ts -t 'AC-2'",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+cli",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["empty success", "stub"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "business_report_run_nonprod",
            "action": {
              "actor": "cli_user",
              "steps": ["infer:trace missing-uuid --json"]
            },
            "end_state": {
              "must_observe": [
                "\"ok\": false",
                "\"code\": \"INFER_TRACE_NOT_FOUND\"",
                "exit_code != 0"
              ],
              "must_not_observe": [
                "\"ok\": true",
                "empty success",
                "modelCalls: [] with ok true"
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
      "description": "Fresh report runId works via literal infer:trace command",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/gate-fix-s22-infer-trace-runid.test.ts -t 'AC-3'",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+cli+fleet",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["substitute mission run", "stub"] },
        "evidence": { "artifact_type": "api_response", "required_capture": true },
        "cases": [
          {
            "start_ref": "business_report_run_nonprod",
            "action": {
              "actor": "cli_user",
              "steps": [
                "mission run report --kind competitive --target example.com --json",
                "infer:trace <runId> --json"
              ]
            },
            "end_state": {
              "must_observe": [
                "CMD contains `infer:trace`",
                "\"provider\": \"fleet\" count >= 1",
                "exit_code == 0"
              ],
              "must_not_observe": [
                "CMD is only `mission run report` as substitute",
                "empty modelCalls",
                "\"code\": \"INFER_TRACE_NOT_FOUND\""
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
      "description": "Historical QA fail evidence preserved",
      "verify": "test -f .spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/.gate-evidence/2026-07-21T22:12:30Z/step7.log && grep -q INFER_TRACE_NOT_FOUND .spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/.gate-evidence/2026-07-21T22:12:30Z/step7.log",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["deleted archive", "rewritten pass"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "business_report_run_nonprod",
            "action": {
              "actor": "test_runner",
              "steps": ["assert historical fail dir intact"]
            },
            "end_state": {
              "must_observe": [
                "step7.log contains `INFER_TRACE_NOT_FOUND`",
                "step7.log contains runId `019f86be-b88a-7210-be80-13cd2ffef199`"
              ],
              "must_not_observe": [
                "archive directory missing",
                "empty step7.log",
                "rewritten pass evidence"
              ]
            }
          }
        ]
      }
    }
  ]
}
-->
