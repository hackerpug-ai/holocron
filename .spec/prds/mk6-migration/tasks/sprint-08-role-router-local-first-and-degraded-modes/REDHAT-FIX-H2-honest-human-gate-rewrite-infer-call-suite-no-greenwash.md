# REDHAT-FIX-H2 — Honest human gate: rewrite SPRINT human steps to runnable infer:call/suite surface (or implement mission) and re-gate without vitest substitutions (fresh red-hat H2: gate greenwash)

## What this does

Close red-hat H2 by making the human gate honest: documented steps match the real operator surface and gate artifacts no longer greenwash vitest substitutions as mission/mid-run human proofs.

Provides: honest-human-gate-steps, runnable-infer-call-surface-docs, gate-results-no-greenwash, step-inventory-matches-cli.

## Why

- MUST Rewrite SPRINT.md human steps to actual operator surface: infer:call / suite / verify:no-provider-refs / degraded proof via documented runnable commands
- MUST Remove or replace `holo mission run triage` — mission engine is Sprint 15; prefer rewrite over implementing mission
- MUST Replace mid-run mission fleet-kill fiction with honest degraded proof (CLI/controller suite) and label any automated suite steps as suite, not mission
- MUST Produce/update gate procedure so gate-results cannot claim pass on non-executable documented steps
- MUST Add automated inventory check: every documented human step maps to a real holo CLI case OR an explicitly labeled PLATFORM_IT suite command
- MUST Archive red evidence of prior greenwash (gate-results step-1-2/step-6 vitest substitutions vs SPRINT mission wording) under .spec/evidence/redhat-fix-h2*
- NEVER count vitest-only substitutions as successful execution of a documented mission CLI step
- NEVER leave SPRINT.md documenting holo mission run triage while CLI has no mission command
- NEVER implement full mission engine in this task (Sprint 15 scope) unless explicitly justified — prefer rewrite
- NEVER mark sprint-goal-state met:true / gate verdict pass while documented steps remain non-executable
- NEVER greenwash by renaming without runnable commands
- STRICTLY prefer rewrite of human steps to infer:call/suite over mission implementation
- STRICTLY H2 runs after H1/H3/H4/H5 so honest gate documents fixed surface
- STRICTLY automated inventory/grep or dry-run step map fails if mission command reappears without CLI case
- STRICTLY requires_seeded_evidence true even with tdd_mode skipped
- Grounded in: UC-INFER-01, UC-INFER-04, UC-INFER-05, T-INFER-011, T-INFER-013, T-INFER-014, CAP-INF-01

## How to verify

- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts` → Exit 0
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: .spec/prds/mk6-migration/tasks/sprint-08-role-router-local-first-and-degraded-modes/SPRINT.md (MODIFY) · .spec/prds/mk6-migration/tasks/sprint-08-role-router-local-first-and-degraded-modes/gate-results.json (MODIFY) · .spec/prds/mk6-migration/tasks/sprint-08-role-router-local-first-and-degraded-modes/gate-verification.json (MODIFY) · .spec/prds/mk6-migration/tasks/sprint-08-role-router-local-first-and-degraded-modes/sprint-goal-state.json (MODIFY if honesty fields) · .spec/prds/mk6-migration/tasks/sprint-08-role-router-local-first-and-degraded-modes/HUMAN-GATE.md (NEW optional procedure) · tests/integration/service/infer-gate-honesty-inventory.test.ts (NEW) · .spec/evidence/redhat-fix-h2* (NEW/MODIFY) · .tmp/redhat-fix-h2*/** (NEW)

Prohibited: services/platform/src/inference/** — behavioral fixes belong to H1/H3/H4/H5; H2 is honesty/docs/gate · Implementing full mission engine under services/** — Sprint 15 · app/** — out of scope

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-H2 — Honest human gate: rewrite SPRINT human steps to runnable infer:call/suite surface (or implement mission) and re-gate without vitest substitutions (fresh red-hat H2: gate greenwash)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (90 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: true)
CAPABILITY: CAP-INF-01
SPRINT:     [Sprint 8 — Role Router, Local-First and Degraded Modes](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
SPRINT.md human steps are executable as written (infer:call / labeled suite / verify); inventory test passes; gate procedure/results cannot pass while documenting non-existent mission; evidence archived under redhat-fix-h2*.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Rewrite SPRINT.md human steps to actual operator surface: infer:call / suite / verify:no-provider-refs / degraded proof via documented runnable commands
- MUST Remove or replace `holo mission run triage` — mission engine is Sprint 15; prefer rewrite over implementing mission
- MUST Replace mid-run mission fleet-kill fiction with honest degraded proof (CLI/controller suite) and label any automated suite steps as suite, not mission
- MUST Produce/update gate procedure so gate-results cannot claim pass on non-executable documented steps
- MUST Add automated inventory check: every documented human step maps to a real holo CLI case OR an explicitly labeled PLATFORM_IT suite command
- MUST Archive red evidence of prior greenwash (gate-results step-1-2/step-6 vitest substitutions vs SPRINT mission wording) under .spec/evidence/redhat-fix-h2*
- NEVER count vitest-only substitutions as successful execution of a documented mission CLI step
- NEVER leave SPRINT.md documenting holo mission run triage while CLI has no mission command
- NEVER implement full mission engine in this task (Sprint 15 scope) unless explicitly justified — prefer rewrite
- NEVER mark sprint-goal-state met:true / gate verdict pass while documented steps remain non-executable
- NEVER greenwash by renaming without runnable commands
- STRICTLY prefer rewrite of human steps to infer:call/suite over mission implementation
- STRICTLY H2 runs after H1/H3/H4/H5 so honest gate documents fixed surface
- STRICTLY automated inventory/grep or dry-run step map fails if mission command reappears without CLI case
- STRICTLY requires_seeded_evidence true even with tdd_mode skipped

--------------------------------------------------------------------------------
BOUNDARY CONTRACTS
--------------------------------------------------------------------------------
- SPRINT.md Human Test Deliverable steps MUST be executable as written against current CLI (no holo mission until Sprint 15)
- gate-results.json steps that claim operator human execution MUST NOT silently substitute vitest for documented CLI/mission commands without honest labeling
- Human gate narrative after remediation documents post-fix surface (degraded never-cloud, structural resolveModel path, hard budget) — not pre-fix fiction

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: SPRINT human steps drop non-existent mission CLI (PRIMARY)
- [ ] AC-2: Every documented human step maps to real CLI or labeled suite
- [ ] AC-3: Gate procedure forbids greenwash pass on non-executable docs
- [ ] AC-4: Degraded/mid-run step is honest post-fix surface
- [ ] AC-5: RED/green gate honesty evidence archived
- [ ] Verification gates green + typecheck + lint (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 SPRINT human steps drop non-existent mission CLI [PRIMARY] (flow_ref UC-INFER-01)
  GIVEN: SPRINT.md Human Test Deliverable after rewrite
  WHEN:  Operator reads steps 1..N
  THEN:  No step requires `holo mission run` (or any mission subcommand); default-path zero-Anthropic proof uses infer:call or explicitly labeled suite
  TEST_TIER: integration · VERIFICATION_SERVICE: filesystem · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts
  SCENARIO — start_ref: prior-greenwash-gate · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if SPRINT.md still contains holo mission run triage; inventory test greps only comments not SPRINT.md; static empty pass without reading SPRINT.md
    EVIDENCE: file_artifact (required_capture=True)
    CASE[0] start_ref: prior-greenwash-gate
      actor: operator
      - Parse SPRINT.md Human Test Deliverable steps
      - Assert no mission CLI tokens
      - Assert default-path step names infer:call or labeled suite command
      MUST_OBSERVE:
        - SPRINT.md human steps include `infer:call` literal
        - mission command count for holo mission run === 0 in SPRINT human steps
      MUST_NOT_OBSERVE:
        - holo mission run triage
        - mission engine as required human step without Sprint 15 implementation
AC-2 Every documented human step maps to real CLI or labeled suite (flow_ref T-INFER-013)
  GIVEN: Rewritten SPRINT steps + holo.ts case table
  WHEN:  Inventory test maps each step entry point to CLI case or PLATFORM_IT suite path with honest label
  THEN:  100% of steps resolve; suite-backed steps are labeled suite/automated not human-CLI-mission
  TEST_TIER: integration · VERIFICATION_SERVICE: cli · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts
  SCENARIO — start_ref: current-cli-surface · evidence: stdout
    NEGATIVE_CONTROL: would fail if documented command has no holo case; vitest path claimed as CLI human step without suite label; stub inventory always returning mapped:true
    EVIDENCE: stdout (required_capture=True)
    CASE[0] start_ref: current-cli-surface
      actor: operator
      - Extract step commands from SPRINT.md
      - For each CLI-shaped command, assert case exists in holo.ts
      - For suite steps, require label contains suite OR vitest OR PLATFORM_IT
      MUST_OBSERVE:
        - mapped_steps_count >= 5
        - unmapped_steps_count === 0
        - infer:call case present in holo.ts
      MUST_NOT_OBSERVE:
        - unmapped step with command holo mission
        - empty mapping table
        - suite step labeled as live mid-run mission without disclaimer
AC-3 Gate procedure forbids greenwash pass on non-executable docs (flow_ref UC-INFER-01)
  GIVEN: Updated gate procedure / gate-results schema or validation under .spec for sprint-08
  WHEN:  Validator compares SPRINT documented entry points vs gate-results step commands
  THEN:  Mismatch (mission doc + vitest execution labeled as that mission) fails validation; honest suite labels pass
  TEST_TIER: integration · VERIFICATION_SERVICE: filesystem · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts
  SCENARIO — start_ref: prior-greenwash-gate · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if gate-results can still pass with mission wording + vitest-only step-1-2; no validation of step.command against docs; static verdict:pass fixture
    EVIDENCE: file_artifact (required_capture=True)
    CASE[0] start_ref: prior-greenwash-gate
      actor: adversary
      - Feed synthetic gate-results that claim mission while command is vitest
      - Assert honesty validator fails
      - Feed honest suite-labeled steps matching SPRINT rewrite — assert pass
      MUST_OBSERVE:
        - greenwash fixture validation result: fail
        - honest suite-labeled fixture validation result: pass
        - validator output includes greenwash OR honesty OR non-executable literal
      MUST_NOT_OBSERVE:
        - greenwash fixture result: pass
        - empty validation output
AC-4 Degraded/mid-run step is honest post-fix surface (flow_ref T-INFER-014)
  GIVEN: Post H1/H4 degraded never-cloud and real operator surface
  WHEN:  SPRINT step for fleet-down is rewritten
  THEN:  Step documents runnable degraded proof (controller suite and/or infer:call under DB/process degraded) without claiming live mission mid-run fiction; never-cloud still required
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts tests/integration/service/infer-degraded-transition.test.ts
  SCENARIO — start_ref: current-cli-surface · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if step still says take divergent endpoint down mid-run mission without runnable command; step claims vitest endpointOverride is live fleet kill without label; never-cloud requirement dropped from degraded step
    EVIDENCE: file_artifact (required_capture=True)
    CASE[0] start_ref: current-cli-surface
      actor: operator
      - Read degraded human step text
      - Assert references degraded suite or documented degraded operator path
      - Assert never-cloud / zero Anthropic language retained
      MUST_OBSERVE:
        - degraded step text contains never-cloud OR zero Anthropic OR anthropicCount:0 language
        - degraded step command is labeled suite OR references real controller/CLI path
      MUST_NOT_OBSERVE:
        - undocumented mid-run mission fleet kill as sole step
        - vitest endpointOverride claimed as production fleet kill without suite label
AC-5 RED/green gate honesty evidence archived (flow_ref UC-INFER-01)
  GIVEN: prior-greenwash-gate fixture and post-rewrite SPRINT/gate artifacts
  WHEN:  Task completes
  THEN:  .spec/evidence/redhat-fix-h2* records red greenwash snapshot and green honest inventory pass
  TEST_TIER: integration · VERIFICATION_SERVICE: filesystem · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts
  SCENARIO — start_ref: prior-greenwash-gate · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if no evidence files; green-only without red greenwash capture; empty JSON
    EVIDENCE: file_artifact (required_capture=True)
    CASE[0] start_ref: prior-greenwash-gate
      actor: operator
      - Write red evidence citing gate-results step-1-2/step-6 vitest + mission wording
      - Write green evidence after rewrite with inventory pass
      MUST_OBSERVE:
        - artifact path matches .spec/evidence/redhat-fix-h2*
        - green evidence includes inventory_pass:true OR unmapped_steps_count:0
      MUST_NOT_OBSERVE:
        - empty evidence
        - verdict:pass while SPRINT still contains holo mission run

--------------------------------------------------------------------------------
TEST CRITERIA (boolean statements mapping to ACs)
--------------------------------------------------------------------------------
| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | SPRINT.md human steps contain zero holo mission run commands | AC-1 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts` | invariant |
| TC-2 | Every SPRINT human step maps to a real holo case or honestly labeled suite command (unmapped_steps_count===0) | AC-2 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts` | happy_path |
| TC-3 | Honesty validator fails greenwash mission-doc+vitest-exec fixture and passes honest suite-labeled fixture | AC-3 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts` | negative |
| TC-4 | Degraded human step retains never-cloud language and runnable labeled command | AC-4 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts` | invariant |
| TC-5 | redhat-fix-h2* red and green evidence artifacts exist with inventory_pass on green | AC-5 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts` | red_evidence |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- .spec/prds/mk6-migration/tasks/sprint-08-role-router-local-first-and-degraded-modes/SPRINT.md (MODIFY)
- .spec/prds/mk6-migration/tasks/sprint-08-role-router-local-first-and-degraded-modes/gate-results.json (MODIFY)
- .spec/prds/mk6-migration/tasks/sprint-08-role-router-local-first-and-degraded-modes/gate-verification.json (MODIFY)
- .spec/prds/mk6-migration/tasks/sprint-08-role-router-local-first-and-degraded-modes/sprint-goal-state.json (MODIFY if honesty fields)
- .spec/prds/mk6-migration/tasks/sprint-08-role-router-local-first-and-degraded-modes/HUMAN-GATE.md (NEW optional procedure)
- tests/integration/service/infer-gate-honesty-inventory.test.ts (NEW)
- .spec/evidence/redhat-fix-h2* (NEW/MODIFY)
- .tmp/redhat-fix-h2*/** (NEW)

writeProhibited:
- services/platform/src/inference/** — behavioral fixes belong to H1/H3/H4/H5; H2 is honesty/docs/gate
- Implementing full mission engine under services/** — Sprint 15
- app/** — out of scope

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
- `.spec/reviews/red-hat-2026-07-16T03-47-51Z-sprint08.md` (H2 section + Gate Pre-Check) — Binding greenwash finding and non-executable steps
- `.spec/prds/mk6-migration/tasks/sprint-08-role-router-local-first-and-degraded-modes/SPRINT.md` (32-43) — Human Test Deliverable mission fiction to rewrite
- `.spec/prds/mk6-migration/tasks/sprint-08-role-router-local-first-and-degraded-modes/gate-results.json` (all) — step-1-2 and step-6 vitest substitutions still verdict:pass
- `services/platform/src/cli/holo.ts` (130-180, 1220-1420, 1570-1640) — Real CLI cases: infer:call, budget:*, verify:no-provider-refs; no mission

--------------------------------------------------------------------------------
DESIGN / PATTERN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-2026-07-16T03-47-51Z-sprint08.md, .spec/prds/mk6-migration/tasks/sprint-08-role-router-local-first-and-degraded-modes/SPRINT.md, UC-INFER-01, T-INFER-013
- Depends on H1/H3/H4/H5 so rewritten steps mention post-fix never-cloud, structural path, durable degraded, hard budget
- Do not re-run a fake pass on old greenwash artifacts — refresh gate procedure honestly
Pattern: Rewrite human steps to runnable infer:call + honestly labeled PLATFORM_IT suite steps; inventory test enforces docs↔CLI parity
Pattern source: gate-pre-check table in red-hat-2026-07-16T03-47-51Z-sprint08.md
Anti-pattern: Vitest counted as human mission; mission CLI fiction; met:true with non-executable steps

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: mastra-implementer — Gate honesty + SPRINT/gate artifact rewrite against real CLI surface; no mission engine (Sprint 15). Implementer owns operator docs + automated inventory checks that fail on greenwash.
Reviewer: mastra-reviewer
Proposed by: mastra-planner

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- All Tests Pass: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts` → Exit 0
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
depends_on: ["REDHAT-FIX-H1", "REDHAT-FIX-H3", "REDHAT-FIX-H4", "REDHAT-FIX-H5"]
blocks: []

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- documentation-standards

--------------------------------------------------------------------------------
FIXTURES (shared seed map for scenario start_ref)
--------------------------------------------------------------------------------
- current-cli-surface: holo CLI help/cases include infer:call, budget:*, verify:no-provider-refs; no mission command [seed_method=cli]
  - bun holo --help / case table in holo.ts
  - case 'infer:call'
  - case 'verify:no-provider-refs'
- prior-greenwash-gate: Snapshot of gate-results.json showing step-1-2 and step-6 as vitest while SPRINT documented mission/mid-run [seed_method=file_artifact]
  - .spec/prds/mk6-migration/tasks/sprint-08-role-router-local-first-and-degraded-modes/gate-results.json
  - SPRINT.md lines 36-43 historical mission wording

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H2",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "current-cli-surface": {
      "description": "holo CLI help/cases include infer:call, budget:*, verify:no-provider-refs; no mission command",
      "seed_method": "cli",
      "records": [
        "bun holo --help / case table in holo.ts",
        "case 'infer:call'",
        "case 'verify:no-provider-refs'"
      ]
    },
    "prior-greenwash-gate": {
      "description": "Snapshot of gate-results.json showing step-1-2 and step-6 as vitest while SPRINT documented mission/mid-run",
      "seed_method": "file_artifact",
      "records": [
        ".spec/prds/mk6-migration/tasks/sprint-08-role-router-local-first-and-degraded-modes/gate-results.json",
        "SPRINT.md lines 36-43 historical mission wording"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN rewritten SPRINT WHEN reading human steps THEN no holo mission run; infer:call/suite used instead",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem",
        "negative_control": {
          "would_fail_if": [
            "SPRINT.md still contains holo mission run triage",
            "inventory test greps only comments not SPRINT.md",
            "static empty pass without reading SPRINT.md"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "prior-greenwash-gate",
            "action": {
              "actor": "operator",
              "steps": [
                "Parse SPRINT.md Human Test Deliverable steps",
                "Assert no mission CLI tokens",
                "Assert default-path step names infer:call or labeled suite command"
              ]
            },
            "end_state": {
              "must_observe": [
                "SPRINT.md human steps include `infer:call` literal",
                "mission command count for holo mission run === 0 in SPRINT human steps"
              ],
              "must_not_observe": [
                "holo mission run triage",
                "mission engine as required human step without Sprint 15 implementation"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "filesystem",
      "flow_ref": "UC-INFER-01"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN SPRINT steps and holo cases WHEN inventory runs THEN unmapped_steps_count===0",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "cli",
        "negative_control": {
          "would_fail_if": [
            "documented command has no holo case",
            "vitest path claimed as CLI human step without suite label",
            "stub inventory always returning mapped:true"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "current-cli-surface",
            "action": {
              "actor": "operator",
              "steps": [
                "Extract step commands from SPRINT.md",
                "For each CLI-shaped command, assert case exists in holo.ts",
                "For suite steps, require label contains suite OR vitest OR PLATFORM_IT"
              ]
            },
            "end_state": {
              "must_observe": [
                "mapped_steps_count >= 5",
                "unmapped_steps_count === 0",
                "infer:call case present in holo.ts"
              ],
              "must_not_observe": [
                "unmapped step with command holo mission",
                "empty mapping table",
                "suite step labeled as live mid-run mission without disclaimer"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "cli",
      "flow_ref": "T-INFER-013"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN greenwash vs honest fixtures WHEN validator runs THEN greenwash fails and honest passes",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem",
        "negative_control": {
          "would_fail_if": [
            "gate-results can still pass with mission wording + vitest-only step-1-2",
            "no validation of step.command against docs",
            "static verdict:pass fixture"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "prior-greenwash-gate",
            "action": {
              "actor": "adversary",
              "steps": [
                "Feed synthetic gate-results that claim mission while command is vitest",
                "Assert honesty validator fails",
                "Feed honest suite-labeled steps matching SPRINT rewrite \u2014 assert pass"
              ]
            },
            "end_state": {
              "must_observe": [
                "greenwash fixture validation result: fail",
                "honest suite-labeled fixture validation result: pass",
                "validator output includes greenwash OR honesty OR non-executable literal"
              ],
              "must_not_observe": [
                "greenwash fixture result: pass",
                "empty validation output"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "filesystem",
      "flow_ref": "UC-INFER-01"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN degraded human step WHEN rewritten THEN never-cloud retained and command honestly labeled",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts tests/integration/service/infer-degraded-transition.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "step still says take divergent endpoint down mid-run mission without runnable command",
            "step claims vitest endpointOverride is live fleet kill without label",
            "never-cloud requirement dropped from degraded step"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "current-cli-surface",
            "action": {
              "actor": "operator",
              "steps": [
                "Read degraded human step text",
                "Assert references degraded suite or documented degraded operator path",
                "Assert never-cloud / zero Anthropic language retained"
              ]
            },
            "end_state": {
              "must_observe": [
                "degraded step text contains never-cloud OR zero Anthropic OR anthropicCount:0 language",
                "degraded step command is labeled suite OR references real controller/CLI path"
              ],
              "must_not_observe": [
                "undocumented mid-run mission fleet kill as sole step",
                "vitest endpointOverride claimed as production fleet kill without suite label"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "postgres",
      "flow_ref": "T-INFER-014"
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN task complete WHEN inspecting evidence THEN redhat-fix-h2* red+green artifacts present",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem",
        "negative_control": {
          "would_fail_if": [
            "no evidence files",
            "green-only without red greenwash capture",
            "empty JSON"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "prior-greenwash-gate",
            "action": {
              "actor": "operator",
              "steps": [
                "Write red evidence citing gate-results step-1-2/step-6 vitest + mission wording",
                "Write green evidence after rewrite with inventory pass"
              ]
            },
            "end_state": {
              "must_observe": [
                "artifact path matches .spec/evidence/redhat-fix-h2*",
                "green evidence includes inventory_pass:true OR unmapped_steps_count:0"
              ],
              "must_not_observe": [
                "empty evidence",
                "verdict:pass while SPRINT still contains holo mission run"
              ]
            }
          }
        ]
      },
      "test_tier": "integration",
      "verification_service": "filesystem",
      "flow_ref": "UC-INFER-01"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Zero holo mission run in SPRINT human steps",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "unmapped_steps_count===0",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Greenwash fixture fails honesty validator",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Degraded step honest + never-cloud language",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "redhat-fix-h2* evidence present",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts"
    }
  ],
  "proposed_by": "mastra-planner",
  "dependencies": {
    "depends_on": [
      "REDHAT-FIX-H1",
      "REDHAT-FIX-H3",
      "REDHAT-FIX-H4",
      "REDHAT-FIX-H5"
    ],
    "blocks": []
  },
  "touches_capabilities": [
    "CAP-INF-01"
  ],
  "provides": [
    "honest-human-gate-steps",
    "runnable-infer-call-surface-docs",
    "gate-results-no-greenwash",
    "step-inventory-matches-cli"
  ],
  "consumes": [
    "holo infer:call",
    "holo verify:no-provider-refs",
    "holo budget:status",
    "DegradedModeController operator paths",
    "post-H1-H5 fixed escape/degraded/budget surface"
  ],
  "boundary_contracts": [
    "SPRINT.md Human Test Deliverable steps MUST be executable as written against current CLI (no holo mission until Sprint 15)",
    "gate-results.json steps that claim operator human execution MUST NOT silently substitute vitest for documented CLI/mission commands without honest labeling",
    "Human gate narrative after remediation documents post-fix surface (degraded never-cloud, structural resolveModel path, hard budget) \u2014 not pre-fix fiction"
  ]
}
-->
