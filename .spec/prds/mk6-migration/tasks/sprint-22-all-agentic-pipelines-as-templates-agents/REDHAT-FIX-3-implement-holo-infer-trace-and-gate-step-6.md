# REDHAT-FIX-3 — Implement the documented `holo infer:trace <id>` evidence command and execute it in the gate (H-1)
> Status: ✅ Completed
> Cycle: 1
> Reviewer: mastra-reviewer
> Completed: 2026-07-21T21:46:16Z
> Sprint: [Sprint 22 — All Agentic Pipelines as Templates/Agents](./SPRINT.md)
> Agent: mastra-implementer
> Estimate: 150 min
> Type: FEATURE
> Priority: P0
> Proposed by: mastra-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint-22-20260721T183000Z.md` **H-1 / GATE-1** (HIGH; gate-pre-check + mastra-reviewer + mcp-reviewer)

## Outcome

The Human Test Deliverable step 6 command exists and is honest: `holo infer:trace <id>` dumps stored model-call provider/endpoint evidence for a business-report run so fleet-side reasoning is provable **without** substituting `mission run report`. Gate step 6 is re-executed as documented and recorded with that exact argv.

**Success state:** After a completed `holo mission run report --kind competitive --target example.com --json`, `bun run services/platform/src/cli/holo.ts infer:trace <runId> --json` exits 0 and prints a JSON payload with `modelCalls[]` where each entry exposes `provider` and `endpoint`, at least one call has `provider == "fleet"`, and zero calls have `provider == "anthropic"`. Step 6 evidence log’s `CMD:` line is literally the `infer:trace` invocation (not a substituted mission run). `rg 'infer:trace'` across the repo is non-empty.

## Background

- **Finding (H-1 / GATE-1):** `holo infer:trace <id>` is fictional; gate step 6 “passed” via a substitute command.
- **Evidence (source at reviewed SHA `72b8eee`):**
  - `SPRINT.md:33` Human Test Deliverable step 6: *Run `holo infer:trace <id>` on a business report — reasoning ran server-side on the fleet (no client-side Claude skill).*
  - `rg infer:trace` across the entire repo returned **zero matches** at review time — no CLI case, route, or script.
  - `.gate-evidence/step6.log:2` executed: `bun run services/platform/src/cli/holo.ts mission run report --kind competitive --target example.com --json` — a **substitute**, while `gate-results.json` step 6 recorded `executed:true, result:pass`.
  - `sprint-goal-state.json` attested `human_test.verdict:"pass", steps_passed:6/6` for a step never run as documented.
  - Fleet reasoning **did** run on the substitute path (`reasoningProvider:"fleet"`, qwen instance IDs, real assay/challenge CoT) — the failure is the **missing proof command**, not the absence of fleet calls (red-hat Agent Contradictions table).
- **Remediation (from red-hat):** Implement `holo infer:trace <id>` (dump `modelCalls[].provider/endpoint` from stored trace) **or** amend SPRINT.md step 6 to a real command and re-run the gate. **This task chooses implement + re-run as documented** (no SPRINT step-6 wording change that weakens the fleet oracle).
- **Data already exists:** `runFleetModelCall` (used by `builtin.business-assay@1` / `builtin.business-challenge@1`) records durable `inference_telemetry` rows with `run_id`, `provider`, `endpoint`, `model_id`, `role`, `trace_id`. Pattern siblings: `telemetry:tail`, `chat:trace`, `research:trace`. pipes-2 AC-3 already assumes this CLI shape.
- **Out of scope:** C-1 (retrieval/scaffold — REDHAT-FIX-1), C-2 (idempotency keys — REDHAT-FIX-2), H-2 (subscriptions claims — REDHAT-FIX-4), H-3 (GREEN suite breadth — REDHAT-FIX-5). Do not rewire gather stages, CAP-EMB claims, or default idempotency keys here.
- **PRD refs:** UC-SVC-02; CAP-INF-01 (fleet reasoning); pipes-2 AC-3 fleet-trace oracle; SPRINT.md Human Test Deliverable step 6.

## Critical Constraints

### MUST
- MUST implement CLI command `infer:trace` on `services/platform/src/cli/holo.ts` such that `bun run services/platform/src/cli/holo.ts infer:trace <id> [--json]` is a real dispatched case (not docs-only)
- MUST accept `<id>` as a **mission run id** (UUID from `mission run report` JSON `runId` / `id`); may also resolve by `trace_id` if that is cheaper, but the documented gate path is run-id from a business report
- MUST dump a JSON-serializable payload including `modelCalls` array where each element includes at least `provider` (string) and `endpoint` (string); recommended fields: `role`, `modelId`, `status`, `traceId`, `stepId`
- MUST source `modelCalls` from durable stored state (`inference_telemetry` keyed by run_id and/or mission_runs.trace_id) — not by re-running the mission and not by inventing rows
- MUST re-execute Human Test Deliverable **step 6 as documented** after the command exists: capture evidence where `CMD:` contains `infer:trace` and the payload proves fleet provider (update `.gate-evidence/step6.log` and ensure step 6 in `gate-results.json` reflects the real command when the gate is re-run for this task’s proof)

### NEVER
- NEVER “pass” step 6 by substituting `mission run report` (or any other command) for `infer:trace`
- NEVER invent `modelCalls` rows that were not recorded at model-call time
- NEVER implement C-1 / C-2 / H-2 / H-3 product work in this task’s commit set
- NEVER amend SPRINT.md step 6 wording to drop the `infer:trace` requirement as a shortcut (implement the command instead)

### STRICTLY
- STRICTLY for a completed business-report run that used fleet ASSAY/CHALLENGE, `infer:trace <runId> --json` MUST show `count(modelCalls where provider=="fleet") >= 1` and `count(modelCalls where provider=="anthropic") == 0`
- STRICTLY unknown / missing id MUST exit non-zero with a structured error code (e.g. `INFER_TRACE_NOT_FOUND` / `MISSION_RUN_NOT_FOUND`) — not empty success with `modelCalls:[]` pretending the run existed
- STRICTLY `rg -n "infer:trace" services/platform/src/cli/holo.ts` MUST match help text **and** a `case 'infer:trace':` (or equivalent dispatcher registration)
- STRICTLY integration proof uses real Postgres (`PLATFORM_IT=1`) and a real prior fleet business-report run (or runs one in-setup); no mock of `listInferenceTelemetry` / SQL

## Specification

**Objective:** Close red-hat H-1 / GATE-1 by implementing the documented `holo infer:trace <id>` evidence command and running gate step 6 exactly as written.

**Success state:** Operators can dump fleet model-call provider/endpoint evidence for a business-report run via `holo infer:trace <id>`; gate step 6 evidence uses that command; substitute-command attestation is no longer the only “proof.”

## Capability Chain

- **Touches:** CAP-INF-01 (fleet reasoning evidence surface)
- **Provides:** operator-infer-trace-evidence-contract
- **Consumes:** mission run id + durable `inference_telemetry` (from `runFleetModelCall`)
- **Boundary contracts:**
  - CLI `infer:trace <id>` → durable model-call rows for that mission run
  - Human gate step 6 → executed argv matches documented command

## Acceptance Criteria

### AC-1: `holo infer:trace <runId>` dumps fleet modelCalls for a business report [PRIMARY]
**GIVEN:** Real Postgres nonprod with a completed business-report mission run R produced by  
`bun run services/platform/src/cli/holo.ts mission run report --kind competitive --target example.com --json`  
(fleet healthy; ASSAY+CHALLENGE executed via `runFleetModelCall`, so ≥1 `inference_telemetry` row exists with `run_id = R.id`)
**WHEN:** Operator runs  
`bun run services/platform/src/cli/holo.ts infer:trace <R.id> --json`
**THEN:** Exit code is 0; stdout is JSON with top-level `ok: true`, `runId` equal to `R.id`, and `modelCalls` array length ≥ 1; every `modelCalls[i]` has non-empty string fields `provider` and `endpoint`; at least one entry has `provider` equal to the literal `fleet`; zero entries have `provider` equal to the literal `anthropic`
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-1'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** postgres+cli+fleet
**FLOW_REF:** UC-SVC-02
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null

#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "postgres+cli+fleet",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "empty", "static", "mock", "command missing", "disconnect", "invented modelCalls"] },
  "evidence": { "artifact_type": "api_response", "required_capture": true },
  "cases": [
    {
      "start_ref": "completed_business_report_run_with_telemetry",
      "action": {
        "actor": "cli_user",
        "steps": [
          "Ensure a completed competitive business-report mission run R exists with inference_telemetry rows for R.id",
          "Run bun run services/platform/src/cli/holo.ts infer:trace <R.id> --json",
          "Parse JSON; assert modelCalls provider/endpoint and fleet-only oracle"
        ]
      },
      "end_state": {
        "must_observe": [
          "exit code equals 0",
          "ok equals \"true\"",
          "runId equals R.id (JSON runId == mission run UUID, length >= 36)",
          "modelCalls.length >= 1",
          "count of modelCalls missing provider or endpoint equals 0",
          "count of modelCalls with provider \"fleet\" is >= 1",
          "count of modelCalls with provider \"anthropic\" equals 0"
        ],
        "must_not_observe": [
          "empty/start signature: exit non-zero because infer:trace is unknown command",
          "modelCalls equals [] while telemetry rows exist for R.id",
          "provider anthropic present on any modelCall",
          "missing provider or endpoint keys on a modelCall entry"
        ]
      }
    }
  ]
}
```

### AC-2: Unknown id fails closed (not empty success)
**GIVEN:** Real Postgres; no mission_runs row (and no telemetry) for id `00000000-0000-4000-8000-000000000099`
**WHEN:** Operator runs  
`bun run services/platform/src/cli/holo.ts infer:trace 00000000-0000-4000-8000-000000000099 --json`
**THEN:** Exit code is non-zero; JSON (stdout or stderr) includes `ok: false` and a stable error `code` in `{INFER_TRACE_NOT_FOUND, MISSION_RUN_NOT_FOUND, TRACE_NOT_FOUND}` (or documented equivalent); payload MUST NOT report `ok: true` with `modelCalls: []` as a success for a missing run
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-2'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** postgres+cli
**FLOW_REF:** UC-SVC-02
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null

#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "postgres+cli",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "empty", "static", "mock", "soft-success on missing id"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "missing_run_id",
      "action": {
        "actor": "cli_user",
        "steps": [
          "Confirm no mission_runs / inference_telemetry for 00000000-0000-4000-8000-000000000099",
          "Run holo infer:trace 00000000-0000-4000-8000-000000000099 --json"
        ]
      },
      "end_state": {
        "must_observe": [
          "exit code is non-zero (exit_code >= 1)",
          "ok equals \"false\"",
          "error code is one of \"INFER_TRACE_NOT_FOUND\", \"MISSION_RUN_NOT_FOUND\", \"TRACE_NOT_FOUND\""
        ],
        "must_not_observe": [
          "empty/start signature: ok true with modelCalls []",
          "exit code equals 0",
          "fabricated fleet modelCalls for the missing id"
        ]
      }
    }
  ]
}
```

### AC-3: Source + help surface register `infer:trace` (command is discoverable)
**GIVEN:** Working tree after the fix commit
**WHEN:** Reviewer / test audits CLI registration:
1. `rg -n "infer:trace" services/platform/src/cli/holo.ts`
2. `bun run services/platform/src/cli/holo.ts --help` (or help path that lists commands)
**THEN:** Help text lists `infer:trace <id>`; source contains a real dispatcher branch for `infer:trace` (not only a comment); `rg infer:trace` repo-wide is **non-empty** (closes the red-hat zero-match audit)
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-3'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** source-audit+cli
**FLOW_REF:** UC-SVC-02
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null

#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "source-audit+cli",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "static", "docs-only claim", "help text without dispatcher"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "post_fix_cli_source_infer_trace",
      "action": {
        "actor": "reviewer",
        "steps": [
          "rg -n infer:trace services/platform/src/cli/holo.ts",
          "Run holo --help and assert infer:trace is listed",
          "Confirm case/dispatcher exists for infer:trace"
        ]
      },
      "end_state": {
        "must_observe": [
          "rg match count for \"infer:trace\" in holo.ts is >= 2",
          "help stdout contains literal \"infer:trace\"",
          "dispatcher case \"infer:trace\" count >= 1"
        ],
        "must_not_observe": [
          "empty/start signature: rg infer:trace returns zero matches",
          "only a markdown/doc mention without CLI case",
          "help lists infer:trace while main switch has no case"
        ]
      }
    }
  ]
}
```

### AC-4: Gate step 6 executed as documented (no substitute command)
**GIVEN:** AC-1 is green (command works) AND a completed business-report run id R is available
**WHEN:** Operator executes Human Test Deliverable step 6 **exactly as documented** (not `mission run report` as the step-6 proof):  
`bun run services/platform/src/cli/holo.ts infer:trace <R.id> --json`  
and writes the command + stdout to  
`.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/.gate-evidence/step6.log`  
(and, if re-emitting gate results for this remediation, updates step 6 metadata so the logged command is `infer:trace`)
**THEN:** The step6 evidence file’s `CMD:` (or equivalent first command line) contains the substring `infer:trace` and does **not** use `mission run report` as the step-6 oracle command; stdout in the log shows `provider` fleet evidence (`"provider": "fleet"` or human-form `provider=fleet`); file `.tmp/sprint-22/redhat-fix-3-gate-step6.json` records `{"command":"infer:trace","runId":"<R.id>","fleetModelCalls":N,"anthropicModelCalls":0}` with `N >= 1`
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-4'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** cli+gate-evidence
**FLOW_REF:** UC-SVC-02
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null

#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "cli+gate-evidence",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "empty", "static", "mock", "substitute mission run report", "docs-only claim"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "gate_step6_infer_trace_execution",
      "action": {
        "actor": "cli_user",
        "steps": [
          "Obtain completed business-report runId R",
          "Run holo infer:trace R.id --json as the step-6 command",
          "Write CMD + stdout to .gate-evidence/step6.log",
          "Write redhat-fix-3-gate-step6.json summary with fleet/anthropic counts"
        ]
      },
      "end_state": {
        "must_observe": [
          "step6.log CMD line contains literal \"infer:trace\"",
          "step6.log body contains \"provider\": \"fleet\" or provider=fleet",
          "redhat-fix-3-gate-step6.json fleetModelCalls >= 1",
          "redhat-fix-3-gate-step6.json anthropicModelCalls equals 0"
        ],
        "must_not_observe": [
          "empty/start signature: step6.log CMD is mission run report without infer:trace",
          "step6 passed solely by re-running mission run report",
          "fleetModelCalls equals 0 in redhat-fix-3-gate-step6.json"
        ]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | `infer:trace <runId> --json` for a completed competitive report exits 0 with `modelCalls.length >= 1` | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-1'` | happy_path |
| TC-2 | Every modelCall entry exposes non-empty `provider` and `endpoint` strings | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-1'` | happy_path |
| TC-3 | Fleet modelCall count is ≥ 1 and anthropic modelCall count is 0 for the business-report run | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-1'` | happy_path |
| TC-4 | Unknown run id exits non-zero with structured not-found code (not ok:true empty modelCalls) | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-2'` | error_path |
| TC-5 | `holo.ts` help + dispatcher register `infer:trace` (rg non-empty) | AC-3 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-3'` | happy_path |
| TC-6 | Gate step 6 evidence CMD contains `infer:trace` and records fleetModelCalls ≥ 1 | AC-4 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-4'` | happy_path |

## Reading List

| Path | Lines / focus |
|---|---|
| `.spec/reviews/red-hat-sprint-22-20260721T183000Z.md` | GATE-1 (L15–16), H-1 (L44), recommendations (L71) |
| `SPRINT.md` | Human Test Deliverable step 6 (L33); Tasks row REDHAT-FIX-3 |
| `services/platform/src/cli/holo.ts` | help command list (~219–248); `infer:call` / `infer:degraded` cases (~1930–2294); `telemetry:tail` (~2365–2425); `chat:trace` / `research:trace` (~3549–3618) — copy dispatcher patterns |
| `services/platform/src/inference/telemetry.ts` | `listInferenceTelemetry`, `recordInferenceTelemetry`, `runFleetModelCall` — durable source for modelCalls |
| `services/platform/src/mission/runtime.ts` | `builtin.business-assay@1` / `builtin.business-challenge@1` — already call `runFleetModelCall` with runId/traceId |
| `pipes-2-parameterized-business-report-template-4-kinds.md` | AC-3 expected oracle: `holo infer:trace $RUN_ID \| jq '.modelCalls[]…'` |
| `.gate-evidence/step6.log` | current **bad** substitute evidence (mission run report) — replace after implement |

## Guardrails

### WRITE-ALLOWED
- `services/platform/src/cli/holo.ts` (MODIFY — add `infer:trace` help + parse + case; do **not** change mission default idempotency keys here)
- `services/platform/src/inference/telemetry.ts` (MODIFY only if a small pure mapper / by-run list helper is needed and is not already covered by `listInferenceTelemetry`)
- Optional: `services/platform/src/inference/infer-trace.ts` (NEW) — pure “load modelCalls for run id” used by CLI
- `services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts` (NEW)
- `.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/.gate-evidence/step6.log` (MODIFY — rewrite with real `infer:trace` CMD after implement)
- `.tmp/sprint-22/redhat-fix-3-gate-step6.json` (NEW — AC-4 summary artifact)
- Optional: step-6-only fields in this sprint’s `gate-results.json` **only** when re-emitting after real step-6 execution (do not invent pass without running the command)

### WRITE-PROHIBITED
- `services/platform/src/mission/templates/**` — C-1 / gather scope (REDHAT-FIX-1)
- Default idempotency key formulas in `holo.ts` mission run handlers — C-2 (REDHAT-FIX-2)
- Subscriptions claims injection path — H-2 (REDHAT-FIX-4)
- Fleet-down GREEN suite breadth — H-3 (REDHAT-FIX-5)
- Other REDHAT-FIX-* task files
- Amending SPRINT.md step 6 text to remove `infer:trace` (implement instead)
- Mocking / deleting `inference_telemetry` recording on fleet path to “simplify” empty traces

### Boundaries
- **always:** Prefer reusing `listInferenceTelemetry({ runId })` and mapping rows → `modelCalls[{provider,endpoint,modelId,role,…}]`
- **ask_first:** Accepting only Langfuse remote IDs (not mission run ids); changing pipes-2 AC-3 oracle shape
- **never:** Pass gate step 6 via substitute command; invent modelCalls; scope-creep into C-1/C-2/H-2/H-3

## Design

- **references:** red-hat H-1/GATE-1; pipes-2 AC-3; `telemetry:tail` / `chat:trace` CLI patterns; `runFleetModelCall` telemetry rows
- **pattern:**  
  ```ts
  case 'infer:trace': {
    const id = args.positional[1];
    if (!id) { /* exit 2, INFER_TRACE_ID_REQUIRED */ }
    const rows = await listInferenceTelemetry({ runId: id, limit: 500 });
    // Optional: also resolve mission_runs by id to confirm existence + attach traceId
    if (!runExists && rows.length === 0) { /* exit 1, INFER_TRACE_NOT_FOUND */ }
    const modelCalls = rows.map((r) => ({
      provider: r.provider,
      endpoint: r.endpoint,
      modelId: r.modelId,
      role: r.role,
      status: r.status,
      traceId: r.traceId,
      stepId: r.stepId,
    }));
    console.log(JSON.stringify({ ok: true, runId: id, modelCalls }, null, 2));
  }
  ```
- **pattern_source:** `holo.ts` `telemetry:tail` + `chat:trace`; pipes-2 verify line for `modelCalls[].provider`
- **anti_pattern:** Passing step 6 by re-running `mission run report` and grepping `reasoningProvider` in the mission JSON (current gate evidence); docs-only mention of `infer:trace` without a CLI case; returning `ok:true, modelCalls:[]` for unknown ids

## Agent Assignment

- **implementer:** `mastra-implementer` — owns platform CLI + inference telemetry surface
- **reviewer:** `mastra-reviewer` — adversarial check that step 6 is no longer substitute-commandable and modelCalls are durable
- **proposed_by:** `mastra-planner` — expands SPRINT Tasks table row REDHAT-FIX-3 from H-1/GATE-1 only (user-authorized `/kb-sprint-tasks-plan --only REDHAT-FIX-3` with direct write / no nested specialist fan-out; product code not implemented in this planning pass)

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| AC-1 fleet modelCalls | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-1'` | Exit 0 |
| AC-2 unknown id | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-2'` | Exit 0 |
| AC-3 registration | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-3'` | Exit 0 |
| AC-4 gate step 6 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-4'` | Exit 0 |
| Full FIX-3 suite | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts` | Exit 0 |
| Command exists | `rg -n "infer:trace" services/platform/src/cli/holo.ts` | ≥1 match in help + case |
| Typecheck | `pnpm typecheck` | Exit 0 |
| Scenario contract | `python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py` on this task’s REQUIREMENT-CONTRACT JSON | Exit 0; zero CRITICAL |
| Scope | `git diff --name-only` | Only WRITE-ALLOWED paths |

## Coding Standards

- `brain/docs/TDD-METHODOLOGY.md`
- `brain/docs/kanban/SCENARIO-CONTRACT-V1.md`
- `brain/docs/REQUIREMENT-TRACKING.md`
- `brain/docs/ANTI-STUB-REVIEW.md`
- `brain/docs/HUMAN-TESTING-GATE-FIELD-GUIDE.md` (gate-provability: executed-as-documented)

## Dependencies

- **depends_on:** pipes-1, pipes-2, pipes-3, pipes-4, pipes-5 (completed sprint body; business-report fleet path must exist)
- **blocks:** Honest re-attestation of Human Testing Gate step 6; closes H-1 before Sprint 22 can claim 6/6 as-documented

## Agent Instructions

1. **RED first:** Write `redhat-fix-3-infer-trace.test.ts` AC-1 against current HEAD — expect **fail** (`infer:trace` unknown / non-zero exit). Capture failure output as RED evidence under `.tmp/sprint-22/` or `.spec/reviews/sprint-22/`.
2. **GREEN:** Add help line + argv parse + `case 'infer:trace':` that loads durable telemetry (and optionally confirms mission run exists), maps to `modelCalls[{provider,endpoint,…}]`, fail-closed on missing id.
3. **Gate step 6:** After GREEN, run a real business report if needed, then run `infer:trace <id> --json` and rewrite `.gate-evidence/step6.log` with the real CMD; write `.tmp/sprint-22/redhat-fix-3-gate-step6.json`.
4. **REFACTOR:** Optional extract `loadInferTrace(runId)` helper for unit clarity; keep integration tests on real Postgres.
5. Do not implement C-1 / C-2 / H-2 / H-3 in this task. Do not change SPRINT.md step 6 wording to dodge the command.

## Review Criteria

- Every AC/TC stable; behavioral ACs carry scenarios that pass `validate_scenario`
- `infer:trace` is a real CLI command with fleet modelCalls from durable storage
- Unknown id fail-closed; no empty-success greenwash
- Gate step 6 evidence uses `infer:trace`, not substituted `mission run report`
- Writes only under WRITE-ALLOWED; no C-1/C-2/H-2/H-3 scope creep
- H-1 / GATE-1 closed

## Notes

- Repro from red-hat: `rg infer:trace` → zero hits; step6.log shows `mission run report` while gate-results claims step 6 pass.
- Full multi-step human-gate re-attestation for steps 1–5 may still wait on other REDHAT-FIX-* items; **this task owns step 6 honesty** (command + evidence for that step).
- If a completed report has zero telemetry rows because of an environment issue, fix the recording path only if it is already supposed to record via `runFleetModelCall` — do not invent rows in the CLI.
- pipes-2 already documents the jq oracle against this command; keep the `modelCalls` key name stable for that AC.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-3",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "completed_business_report_run_with_telemetry": {
      "description": "Postgres holocron_nonprod with a completed business-report mission run (kind=competitive, target=example.com) that executed fleet ASSAY+CHALLENGE via runFleetModelCall, leaving >=1 inference_telemetry rows keyed by run_id.",
      "seed_method": "cli",
      "records": [
        "holo mission run report --kind competitive --target example.com --json completes with status completed",
        "SELECT count(*) FROM inference_telemetry WHERE run_id = <runId> is >= 1",
        "runFleetModelCall recorded provider=fleet and a non-empty endpoint"
      ]
    },
    "missing_run_id": {
      "description": "No mission_runs row and no inference_telemetry rows for UUID 00000000-0000-4000-8000-000000000099.",
      "seed_method": "public_api",
      "records": [
        "UUID 00000000-0000-4000-8000-000000000099 absent from mission_runs",
        "UUID absent from inference_telemetry.run_id"
      ]
    },
    "post_fix_cli_source_infer_trace": {
      "description": "Working tree after REDHAT-FIX-3 with infer:trace help text and dispatcher case in holo.ts.",
      "seed_method": "cli",
      "records": [
        "services/platform/src/cli/holo.ts registers infer:trace",
        "integration test redhat-fix-3-infer-trace.test.ts present"
      ]
    },
    "gate_step6_infer_trace_execution": {
      "description": "Completed business-report runId available; operator will execute step 6 as documented with infer:trace and write gate evidence artifacts.",
      "seed_method": "cli",
      "records": [
        "completed business-report runId R available",
        "target evidence path .gate-evidence/step6.log",
        "target summary path .tmp/sprint-22/redhat-fix-3-gate-step6.json"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a completed competitive business-report mission run R with fleet inference_telemetry WHEN holo infer:trace R.id --json is run THEN exit 0, ok true, modelCalls.length >= 1, every entry has provider+endpoint, fleet count >= 1, anthropic count == 0",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+cli+fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["stub", "empty", "static", "mock", "command missing", "disconnect", "invented modelCalls"]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "completed_business_report_run_with_telemetry",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Ensure a completed competitive business-report mission run R exists with inference_telemetry rows for R.id",
                "Run bun run services/platform/src/cli/holo.ts infer:trace <R.id> --json",
                "Parse JSON; assert modelCalls provider/endpoint and fleet-only oracle"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code equals 0",
                "ok equals \"true\"",
                "runId equals R.id (JSON runId == mission run UUID, length >= 36)",
                "modelCalls.length >= 1",
                "count of modelCalls missing provider or endpoint equals 0",
                "count of modelCalls with provider \"fleet\" is >= 1",
                "count of modelCalls with provider \"anthropic\" equals 0"
              ],
              "must_not_observe": [
                "empty/start signature: exit non-zero because infer:trace is unknown command",
                "modelCalls equals [] while telemetry rows exist for R.id",
                "provider anthropic present on any modelCall",
                "missing provider or endpoint keys on a modelCall entry"
              ]
            }
          }
        ],
        "primary": true
      },
      "unit_test_justified": null
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN no mission/telemetry for UUID 00000000-0000-4000-8000-000000000099 WHEN holo infer:trace that id --json THEN exit non-zero, ok false, structured not-found code; never ok true with empty modelCalls",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["stub", "empty", "static", "mock", "soft-success on missing id"]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "missing_run_id",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Confirm no mission_runs / inference_telemetry for 00000000-0000-4000-8000-000000000099",
                "Run holo infer:trace 00000000-0000-4000-8000-000000000099 --json"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code is non-zero (exit_code >= 1)",
                "ok equals \"false\"",
                "error code is one of \"INFER_TRACE_NOT_FOUND\", \"MISSION_RUN_NOT_FOUND\", \"TRACE_NOT_FOUND\""
              ],
              "must_not_observe": [
                "empty/start signature: ok true with modelCalls []",
                "exit code equals 0",
                "fabricated fleet modelCalls for the missing id"
              ]
            }
          }
        ],
        "primary": false
      },
      "unit_test_justified": null
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN post-fix CLI source WHEN help and rg are audited THEN infer:trace appears in help and dispatcher case; rg infer:trace is non-empty",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "source-audit+cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["stub", "static", "docs-only claim", "help text without dispatcher"]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "post_fix_cli_source_infer_trace",
            "action": {
              "actor": "reviewer",
              "steps": [
                "rg -n infer:trace services/platform/src/cli/holo.ts",
                "Run holo --help and assert infer:trace is listed",
                "Confirm case/dispatcher exists for infer:trace"
              ]
            },
            "end_state": {
              "must_observe": [
                "rg match count for \"infer:trace\" in holo.ts is >= 2",
                "help stdout contains literal \"infer:trace\"",
                "dispatcher case \"infer:trace\" count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: rg infer:trace returns zero matches",
                "only a markdown/doc mention without CLI case",
                "help lists infer:trace while main switch has no case"
              ]
            }
          }
        ],
        "primary": false
      },
      "unit_test_justified": null
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN working infer:trace and completed report run R WHEN gate step 6 is executed as documented THEN step6.log CMD contains infer:trace (not mission run report) and redhat-fix-3-gate-step6.json has fleetModelCalls >= 1 and anthropicModelCalls == 0",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-4'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "cli+gate-evidence",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["stub", "empty", "static", "mock", "substitute mission run report", "docs-only claim"]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "gate_step6_infer_trace_execution",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Obtain completed business-report runId R",
                "Run holo infer:trace R.id --json as the step-6 command",
                "Write CMD + stdout to .gate-evidence/step6.log",
                "Write redhat-fix-3-gate-step6.json summary with fleet/anthropic counts"
              ]
            },
            "end_state": {
              "must_observe": [
                "step6.log CMD line contains literal \"infer:trace\"",
                "step6.log body contains \"provider\": \"fleet\" or provider=fleet",
                "redhat-fix-3-gate-step6.json fleetModelCalls >= 1",
                "redhat-fix-3-gate-step6.json anthropicModelCalls equals 0"
              ],
              "must_not_observe": [
                "empty/start signature: step6.log CMD is mission run report without infer:trace",
                "step6 passed solely by re-running mission run report",
                "fleetModelCalls equals 0 in redhat-fix-3-gate-step6.json"
              ]
            }
          }
        ],
        "primary": false
      },
      "unit_test_justified": null
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "infer:trace runId --json for a completed competitive report exits 0 with modelCalls.length >= 1",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Every modelCall entry exposes non-empty provider and endpoint strings",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Fleet modelCall count is >= 1 and anthropic modelCall count is 0 for the business-report run",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Unknown run id exits non-zero with structured not-found code not ok true empty modelCalls",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "holo.ts help and dispatcher register infer:trace with non-empty rg matches",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Gate step 6 evidence CMD contains infer:trace and records fleetModelCalls >= 1",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
