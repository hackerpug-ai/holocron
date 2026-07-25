# REDHAT-FIX-02 — Land the real production writer for research_sessions.current_iteration, or retitle S-REACTIVE-02/T-SYNC-005 to disclose the engine-trigger gap and drop "as the workflow reaches" gate language
> Status: ⬜ Pending
> Sprint: [Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded](./SPRINT.md)
> Agent: mastra-implementer
> Reviewer: mastra-reviewer
> Estimate: 90 min
> Type: FEATURE
> Priority: P0
> Effort: M
> Proposed by: mastra-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint25-reactive-20260725T165851Z.md#H2`

## Outcome

Either (A) production code advances research_sessions.current_iteration to 3 without advance-server.py, or (B) all workflow-reaches claims are removed and path.json records B; UI Zero binding remains real.

## Background

- **Finding:** .spec/reviews/red-hat-sprint25-reactive-20260725T165851Z.md#H2
- **Red-hat report:** `.spec/reviews/red-hat-sprint25-reactive-20260725T165851Z.md`
- **Why it matters:** Unqualified Sprint 25 gate 5/5 pass is blocked until H1/H2/H3 are closed.
- **PRD refs:** UC-SYNC-02, T-SYNC-005
- **Capability:** CAP-SYNC-01

## Critical Constraints

### MUST
- MUST resolve H2 with PATH-A (production writer) OR PATH-B (retitle S-REACTIVE-02/T-SYNC-005/SPRINT step 5) and record path+agent in .tmp/sprint-25/redhat-fix-02-path.json
- MUST keep Zero reactive binding intact under either path
- MUST PATH-A MUST prove advancement without importing advance-server.py / shelling to Maestro harness
- MUST PATH-B MUST remove greppable 'as the workflow reaches' claims from SPRINT/GATE/S-REACTIVE-02/T-SYNC-005

### NEVER
- NEVER leave SPRINT step 5 claiming workflow-driven 3/5 while only harness psql writes exist
- NEVER claim PATH-A complete if only tests or advance-server.py UPDATE the column
- NEVER bind mission_runs (still excluded from zero_pub)

### STRICTLY
- STRICTLY PATH-A: greppable production UPDATE/INSERT for current_iteration outside seed/schema/migrations/tests/maestro
- STRICTLY PATH-B: disclosure 'Zero reactive binding proven; engine trigger pending' (or equivalent) in same commit as claim purge
- STRICTLY tdd_mode red_first with red log of zero production writers on HEAD

## Specification

**Objective:** Close H2 by landing a real current_iteration writer (PATH-A) or honestly re-scoping gate language to Zero-binding-only (PATH-B).

**Success state:** Either (A) production code advances research_sessions.current_iteration to 3 without advance-server.py, or (B) all workflow-reaches claims are removed and path.json records B; UI Zero binding remains real.

## Capability Chain

- **Touches:** CAP-SYNC-01
- **Provides:** honest-research-progress-engine-or-rescope
- **Consumes:** live-research-progress-via-zero-sync, research-sessions-zero-pub-member
- **Boundary contracts:**
- research_sessions is zero_pub full-table member; UI Zero binding is real and stays in scope
- Production writers of current_iteration currently only seed + Maestro harness + tests — zero engine writers
- PATH-A: real engine/CLI/HTTP path UPDATEs current_iteration; PATH-B: drop 'as the workflow reaches' language

## Acceptance Criteria

### AC-1: Production writer or honest re-scope [PRIMARY]
- **GIVEN:** seeded research session at current_iteration==1 max_iterations==5
- **WHEN:** PATH-A production writer advances twice OR PATH-B claim purge runs
- **THEN:** PATH-A current_iteration==3 via production module, OR PATH-B path=B and workflow-reaches count==0
- **Test tier:** `integration` · **Verification service:** `postgres+research-engine-or-docs-audit` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'AC-1'`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** stub, empty, static, mock, harness-only psql, disconnect
  - **Evidence:** artifact `api_response`, required_capture=True
  - **Case 1** — start_ref `seeded-research-session`: actor `cli_user`
    - **Steps:**
    - Record path A|B in .tmp/sprint-25/redhat-fix-02-path.json
    - PATH-A: call advanceResearchSessionIteration (or production CLI/HTTP) twice 1→2, 2→3
    - PATH-A: SELECT current_iteration FROM research_sessions WHERE id=e00000000033
    - PATH-B: rg 'as the workflow reaches' on SPRINT.md S-REACTIVE-02 GATE-RESULTS T-SYNC-005
    - **MUST observe:**
    - `path.json path field equals 'A' or 'B'`
    - `PATH-A: current_iteration == 3 AND max_iterations == 5`
    - `PATH-A: production import path match count >= 1 under services/platform/src/ (not .maestro/)`
    - `PATH-B: 'as the workflow reaches' match count == 0 in SPRINT.md step 5 and S-REACTIVE-02 AC-1`
    - **MUST NOT observe:**
    - `empty/start signature: PATH-A current_iteration still == 1 after writer call`
    - `PATH-A success only via advance-server.py subprocess (maestro import count >= 1)`
    - `PATH-B SPRINT step 5 still claims workflow reaches iteration 3/5`

### AC-2: Zero binding non-regression [PRIMARY]
- **GIVEN:** either path after fix
- **WHEN:** s-reactive-02 research progress suite runs
- **THEN:** research_sessions zero_pub + useResearchProgress binding still pass
- **Test tier:** `integration` · **Verification service:** `vitest Zero binding` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `pnpm vitest run tests/integration/s-reactive-02-research-progress-zero.test.ts`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** disconnect, stub — hardcoded 3/5, empty — research_sessions removed from zero_pub, mock
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `seeded-research-session`: actor `cli_user`
    - **Steps:**
    - Run tests/integration/s-reactive-02-research-progress-zero.test.ts
    - **MUST observe:**
    - `research_sessions listed in ZERO_PUB_FULL_TABLES (match count >= 1)`
    - `useResearchProgress / researchSessionById match count >= 1`
    - `suite exit code == 0`
    - **MUST NOT observe:**
    - `empty/start signature: research_sessions removed from zero_pub (match count == 0)`
    - `hardcoded '3/5' progress with 0 column backing`

### AC-3: Source audit writer or disclosure
- **GIVEN:** production source tree + path.json
- **WHEN:** reviewer audits writers
- **THEN:** PATH-A greppable writer count >= 1 outside seed/tests OR PATH-B disclosure match count >= 1
- **Test tier:** `integration` · **Verification service:** `source-audit` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'AC-3'`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** static — PATH-A docs without rg hit, empty — PATH-B no disclosure, stub — SELECT counted as writer
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `pre-fix-no-production-writer`: actor `reviewer`
    - **Steps:**
    - rg current_iteration writers under services/platform/src excluding seed/tests/migrations
    - If PATH-B: rg 'engine trigger pending|Zero reactive binding' on S-REACTIVE-02 and SPRINT
    - **MUST observe:**
    - `PATH-A: production write site count >= 1 for current_iteration`
    - `PATH-B: disclosure match count >= 1 for 'engine trigger pending' or 'Zero reactive binding' in S-REACTIVE-02 or SPRINT.md`
    - `PATH-A or PATH-B: path.json path equals 'A' or 'B'`
    - **MUST NOT observe:**
    - `empty/start signature: PATH-A production writer count == 0`
    - `PATH-B S-REACTIVE-02 AC-1 still says Sprint 17 engine advances without footnote`

### AC-4: PATH-A fail-closed / PATH-B fixture honesty
- **GIVEN:** PATH-A writer or PATH-B fixture
- **WHEN:** unknown session / over-max OR fixture audit
- **THEN:** PATH-A fail-closed errors; PATH-B fixture engine-increments claim count==0
- **Test tier:** `integration` · **Verification service:** `postgres+writer-or-fixture-audit` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'AC-4'`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** stub soft-success, empty catch swallow, static fixture still claims engine under PATH-B
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `seeded-research-session`: actor `cli_user`
    - **Steps:**
    - PATH-A: call writer with random UUID session
    - PATH-A: call writer with currentIteration=9 maxIterations=5
    - PATH-B: read S-REACTIVE-02 fixture records vs path.json
    - **MUST observe:**
    - `PATH-A: unknown session yields structured error count >= 1 (ok:false or thrown)`
    - `PATH-A: over-max yields error match count >= 1 containing 'iteration' or 'bounds'`
    - `PATH-B: fixture engine-increments claim count == 0`
    - **MUST NOT observe:**
    - `empty/start signature: PATH-A ok:true with rows updated == 0`
    - `PATH-B fixture still claims 'Sprint 17 engine increments current_iteration' (match count >= 1)`


## Test Criteria

| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | PATH-A current_iteration==3 via production writer OR PATH-B path=B + claim purge | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'AC-1'` |
| TC-2 | s-reactive-02 Zero binding suite exit 0 | AC-2 | `pnpm vitest run tests/integration/s-reactive-02-research-progress-zero.test.ts` |
| TC-3 | Source audit: writer count>=1 (A) or disclosure count>=1 (B) | AC-3 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'AC-3'` |
| TC-4 | PATH-A fail-closed / PATH-B fixture honesty | AC-4 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'AC-4'` |
| TC-5 | path.json exists with path A or B | AC-1 | `test -f .tmp/sprint-25/redhat-fix-02-path.json && jq -e '.path=="A" or .path=="B"' .tmp/sprint-25/redhat-fix-02-path.json` |

## Reading List

- `.spec/reviews/red-hat-sprint25-reactive-20260725T165851Z.md:26-29` — H2
- `.maestro/reactive/advance-server.py:1-45` — simulated engine psql UPDATE
- `services/platform/src/db/schema/research.ts:25-68` — current_iteration columns
- `services/platform/src/observability/mission-research.ts:404-434` — INSERT without current_iteration
- `S-REACTIVE-02-live-research-progress-via-zero-synced-postgres-rows.md:all` — AC-1 engine claim
- `SPRINT.md:39-47` — gate step 5

## Guardrails

### WRITE-ALLOWED
- services/platform/src/research/progress.ts (NEW PATH-A)
- services/platform/src/observability/mission-research.ts (PATH-A)
- services/platform/src/mission/runtime.ts (PATH-A if needed)
- services/platform/src/cli/holo.ts (PATH-A optional CLI)
- services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts (NEW)
- tests/integration/s-reactive-02-research-progress-zero.test.ts
- .maestro/reactive/research-progress-advances.yml
- .maestro/reactive/advance-server.py (labels only unless PATH-A rewires)
- S-REACTIVE-02-live-research-progress-via-zero-synced-postgres-rows.md
- SPRINT.md
- GATE-RESULTS.md
- .spec/prds/mk6-migration/11-e2e-testing-criteria.md (T-SYNC-005 PATH-B)
- .tmp/sprint-25/redhat-fix-02-path.json

### WRITE-PROHIBITED
- Adding mission_runs to zero_pub
- hooks/use-resumable-sse-stream.ts — H3
- seed-e2e.ts Streaming title — H1
- Other REDHAT-FIX-0{1,3} task files

## Design

- **References:** `./SPRINT.md`, `red-hat#H2`, `S-REACTIVE-02`, `advance-server.py`, `research.ts`
- **Pattern:** Dual-path honesty (Sprint 22 REDHAT-FIX-1): make claim true in production OR true by re-scope
- **Pattern source:** Sprint 22 REDHAT-FIX-1; red-hat H2
- **Anti-pattern:** Calling advance-server.py PATH-A; counting seed INSERT as engine advance
- **Interaction notes:**
- PATH-A: services/platform/src/research/progress.ts advanceResearchSessionIteration + call from mission-research
- PATH-B: retitle S-REACTIVE-02/SPRINT step 5/T-SYNC-005; keep harness labeled simulate

## Agent Assignment

- **Agent:** `mastra-implementer`
- **Rationale:** PATH-A production writer is Mastra/platform ownership (preferred). PATH-B docs may be RN; record agent+path in path.json. Reassigned from SPRINT RN row at consolidation per mastra-planner.
- **Reviewer:** `mastra-reviewer`
- **Proposed by:** `mastra-planner` (plus cross-specialist enrichments at consolidation: react-native-ui-planner + mastra-planner)

## Agent Instructions

1. RED first: writer test expecting production import advances 1→3 without advance-server.py — fail on HEAD. Capture red log.
2. Prefer PATH-A: research/progress.ts + call site; PATH-B only with full claim purge.
3. Do not regress Zero binding suite. Do not implement H1/H3.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| RED baseline | `rg -n "SET current_iteration|current_iteration =" services/platform/src --glob '!**/migrations/**' --glob '!**/seed*' --glob '!**/*test*'` | Pre-fix: 0 production writers |
| AC suite | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts` | Exit 0 |
| Binding non-regression | `pnpm vitest run tests/integration/s-reactive-02-research-progress-zero.test.ts` | Exit 0 |
| path.json | `test -f .tmp/sprint-25/redhat-fix-02-path.json && jq -r .path .tmp/sprint-25/redhat-fix-02-path.json | grep -E '^[AB]$'` | Exit 0 |

## Dependencies

- **depends_on:** S-REACTIVE-02
- **blocks:** S-REACTIVE-05

## Review Criteria

- Every AC/TC stable; behavioral ACs pass `validate_scenario` with 0 CRITICAL
- Red-hat finding closed (PATH-A production truth or PATH-B honest re-scope)
- Writes only under WRITE-ALLOWED
- RED evidence captured under `.tmp/sprint-25/`

## Notes

- RN planner enrichment: UI binding PASS remains; H2 is engine trigger only.
- Seeded active session id: 00000000-0000-4000-8000-e00000000033.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-02",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-research-session": {
      "description": "research_sessions from holo seed:e2e --reset (active session e00000000033)",
      "seed_method": "public_api",
      "records": [
        "session id 00000000-0000-4000-8000-e00000000033",
        "max_iterations == 5",
        "current_iteration start == 1 for AC-1"
      ]
    },
    "pre-fix-no-production-writer": {
      "description": "RED baseline: only seed + harness + tests write current_iteration",
      "seed_method": "cli",
      "records": [
        "advance-server.py SET current_iteration",
        "seed-e2e.ts INSERT only in seed path"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN seeded session 1/5 WHEN H2 resolved THEN PATH-A current_iteration==3 via production writer OR PATH-B path=B with 'as the workflow reaches' match count==0",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+research-engine-or-docs-audit",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "static",
            "mock",
            "harness-only psql",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-research-session",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Record path A|B in .tmp/sprint-25/redhat-fix-02-path.json",
                "PATH-A: call advanceResearchSessionIteration (or production CLI/HTTP) twice 1\u21922, 2\u21923",
                "PATH-A: SELECT current_iteration FROM research_sessions WHERE id=e00000000033",
                "PATH-B: rg 'as the workflow reaches' on SPRINT.md S-REACTIVE-02 GATE-RESULTS T-SYNC-005"
              ]
            },
            "end_state": {
              "must_observe": [
                "path.json path field equals 'A' or 'B'",
                "PATH-A: current_iteration == 3 AND max_iterations == 5",
                "PATH-A: production import path match count >= 1 under services/platform/src/ (not .maestro/)",
                "PATH-B: 'as the workflow reaches' match count == 0 in SPRINT.md step 5 and S-REACTIVE-02 AC-1"
              ],
              "must_not_observe": [
                "empty/start signature: PATH-A current_iteration still == 1 after writer call",
                "PATH-A success only via advance-server.py subprocess (maestro import count >= 1)",
                "PATH-B SPRINT step 5 still claims workflow reaches iteration 3/5"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN either path WHEN s-reactive-02 suite runs THEN Zero binding still green (researchSessionById match count >= 1)",
      "verify": "pnpm vitest run tests/integration/s-reactive-02-research-progress-zero.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest Zero binding",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub \u2014 hardcoded 3/5",
            "empty \u2014 research_sessions removed from zero_pub",
            "mock"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-research-session",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run tests/integration/s-reactive-02-research-progress-zero.test.ts"
              ]
            },
            "end_state": {
              "must_observe": [
                "research_sessions listed in ZERO_PUB_FULL_TABLES (match count >= 1)",
                "useResearchProgress / researchSessionById match count >= 1",
                "suite exit code == 0"
              ],
              "must_not_observe": [
                "empty/start signature: research_sessions removed from zero_pub (match count == 0)",
                "hardcoded '3/5' progress with 0 column backing"
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
      "description": "GIVEN tree WHEN audited THEN PATH-A production writer count >= 1 OR PATH-B disclosure match count >= 1",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "source-audit",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static \u2014 PATH-A docs without rg hit",
            "empty \u2014 PATH-B no disclosure",
            "stub \u2014 SELECT counted as writer"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "pre-fix-no-production-writer",
            "action": {
              "actor": "reviewer",
              "steps": [
                "rg current_iteration writers under services/platform/src excluding seed/tests/migrations",
                "If PATH-B: rg 'engine trigger pending|Zero reactive binding' on S-REACTIVE-02 and SPRINT"
              ]
            },
            "end_state": {
              "must_observe": [
                "PATH-A: production write site count >= 1 for current_iteration",
                "PATH-B: disclosure match count >= 1 for 'engine trigger pending' or 'Zero reactive binding' in S-REACTIVE-02 or SPRINT.md",
                "PATH-A or PATH-B: path.json path equals 'A' or 'B'"
              ],
              "must_not_observe": [
                "empty/start signature: PATH-A production writer count == 0",
                "PATH-B S-REACTIVE-02 AC-1 still says Sprint 17 engine advances without footnote"
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
      "description": "GIVEN PATH-A WHEN unknown session or iteration>max THEN error; GIVEN PATH-B WHEN fixture audited THEN engine-increments claim count==0",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'AC-4'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+writer-or-fixture-audit",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub soft-success",
            "empty catch swallow",
            "static fixture still claims engine under PATH-B"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-research-session",
            "action": {
              "actor": "cli_user",
              "steps": [
                "PATH-A: call writer with random UUID session",
                "PATH-A: call writer with currentIteration=9 maxIterations=5",
                "PATH-B: read S-REACTIVE-02 fixture records vs path.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "PATH-A: unknown session yields structured error count >= 1 (ok:false or thrown)",
                "PATH-A: over-max yields error match count >= 1 containing 'iteration' or 'bounds'",
                "PATH-B: fixture engine-increments claim count == 0"
              ],
              "must_not_observe": [
                "empty/start signature: PATH-A ok:true with rows updated == 0",
                "PATH-B fixture still claims 'Sprint 17 engine increments current_iteration' (match count >= 1)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "PATH-A current_iteration==3 via production writer OR PATH-B path=B + claim purge",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "s-reactive-02 Zero binding suite exit 0",
      "verify": "pnpm vitest run tests/integration/s-reactive-02-research-progress-zero.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Source audit: writer count>=1 (A) or disclosure count>=1 (B)",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "PATH-A fail-closed / PATH-B fixture honesty",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "path.json exists with path A or B",
      "verify": "test -f .tmp/sprint-25/redhat-fix-02-path.json && jq -e '.path==\"A\" or .path==\"B\"' .tmp/sprint-25/redhat-fix-02-path.json",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->
