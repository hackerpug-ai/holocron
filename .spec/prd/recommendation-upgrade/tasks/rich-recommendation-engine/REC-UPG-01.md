================================================================================
TASK: REC-UPG-01 - Expand the recommendation synthesis contract for additive trust metadata
================================================================================

TASK_TYPE: FEATURE
STATUS: Completed
TDD_PHASE: GREEN
CURRENT_AC: AC-1
PRIORITY: P0
EFFORT: M
TYPE: DEV
ITERATION: 1
AGENT: pi-agent-planner
COMPLETED_AT: 2026-04-16
ORCHESTRATOR_COMMIT: 20990bc29237ff67e0143ae95bc0c13d99844342
REVIEWER: worker (Carson)

--------------------------------------------------------------------------------
GOAL
--------------------------------------------------------------------------------

Extend the recommendation synthesis contract so the pipeline can carry trust metadata without changing existing tool inputs or breaking legacy outputs.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- [convex/chat/specialistPrompts.ts] (MODIFY): Add optional `reviewCount`, `platformLinks`, and `sourcePlatform` to the schema and prompt.
- [convex/research/actions.ts] (MODIFY): Align internal/public action return contracts with the additive recommendation shape.
- [convex/research/actions.test.ts] (MODIFY): Add validation coverage for legacy and rich payloads plus prompt assertions.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [x] Legacy recommendation payloads still validate successfully.
- [x] Rich payloads with `reviewCount`, `platformLinks`, and `sourcePlatform` validate successfully.
- [x] Prompt text explicitly requests trust metadata and omission of unsupported fields.
- [x] `pnpm exec vitest run convex/research/actions.test.ts` passes.
- [x] `pnpm typecheck` passes and tool input validators stay unchanged.

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Multi-platform fan-out implementation
- Enrichment pass orchestration
- UI rendering changes

--------------------------------------------------------------------------------
CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- MUST keep `find_recommendations` and MCP tool input schemas unchanged.
- MUST make all new trust fields optional and additive.
- MUST preserve the raw-JSON-only response contract in the synthesis prompt.
- NEVER fabricate unsupported optional fields with placeholders or guessed values.

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

Objective: update the synthesis schema, prompt, and Convex return validators so rich trust metadata is legal end-to-end.

Success looks like: legacy payloads and rich payloads both parse and return through Convex actions without drift between prompt, Zod schema, and return validators.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

| # | Given | When | Then | Verify |
|---|---|---|---|---|
| AC-1 | the current schema only supports `name`, `description`, `whyRecommended`, `rating`, `location`, `pricing`, and `contact` | the schema is expanded with `reviewCount`, `platformLinks`, and `sourcePlatform` | legacy payloads still parse and rich payloads also parse | `pnpm exec vitest run convex/research/actions.test.ts` |
| AC-2 | a synthesized item contains multiple platform links | the item is validated | each link accepts `platform`, `url`, optional `rating`, and optional `reviewCount` | `pnpm exec vitest run convex/research/actions.test.ts` |
| AC-3 | the synthesis prompt is updated | tests inspect prompt text | the prompt explicitly requests review counts, platform URLs, source platform metadata, and omission of unsupported fields | `pnpm exec vitest run convex/research/actions.test.ts` |
| AC-4 | internal and public action wrappers expose recommendation returns | return validators are updated | input validators remain unchanged and output remains an additive superset | `pnpm typecheck` |
| AC-5 | sources lack ratings, counts, or direct platform URLs | the model follows the new prompt and output is validated | those fields are omitted instead of fabricated | `pnpm exec vitest run convex/research/actions.test.ts` |

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|---|---|---|---|
| TC-1 | `RecommendationSynthesisSchema.safeParse(legacyPayload).success` is true when new fields are absent | AC-1 | `pnpm exec vitest run convex/research/actions.test.ts` | [x] TRUE [ ] FALSE |
| TC-2 | `RecommendationSynthesisSchema.safeParse(richPayloadWithPlatformLinks).success` is true when rich fields are present | AC-2 | `pnpm exec vitest run convex/research/actions.test.ts` | [x] TRUE [ ] FALSE |
| TC-3 | `RECOMMENDATION_SYNTHESIS_PROMPT` includes `reviewCount`, `platformLinks`, `sourcePlatform`, and non-fabrication guidance | AC-3 | `pnpm exec vitest run convex/research/actions.test.ts` | [x] TRUE [ ] FALSE |
| TC-4 | Convex action arg validators remain `{ query, count?, location?, constraints? }` after contract expansion | AC-4 | `pnpm typecheck` | [x] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `.spec/prd/recommendation-upgrade/README.md`
   - Lines: 23-84
   - Focus: rich schema, prompt, domain-agnostic, and backward-compatibility requirements

2. `convex/chat/specialistPrompts.ts`
   - Lines: 190-268
   - Focus: current schema and synthesis prompt

3. `convex/research/actions.ts`
   - Lines: 1617-1653, 1917-1994
   - Focus: current interfaces and Convex return validators

4. `convex/research/actions.test.ts`
   - Lines: 1-110, 210-327
   - Focus: current validation and happy-path expectations

5. `/Users/justinrich/Projects/brain/docs/TDD-METHODOLOGY.md`
   - Sections: The TDD Cycle, Responsibilities Matrix
   - Focus: RED -> GREEN -> REFACTOR workflow

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `convex/chat/specialistPrompts.ts`
- `convex/research/actions.ts`
- `convex/research/actions.test.ts`

WRITE-PROHIBITED:
- `convex/research/platformSearch.ts`
- `convex/research/enrichment.ts`
- `convex/chat/index.ts`
- `holocron-mcp/**`

MUST:
- [ ] Keep one additive recommendation item contract across prompt, parse, and return validation
- [ ] Preserve raw JSON-only prompt output rules
- [ ] Extend tests in place

MUST NOT:
- [ ] Make new fields required
- [ ] Change tool names or input args
- [ ] Introduce domain-category branching into the prompt

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------

References:
- `.spec/prd/recommendation-upgrade/README.md`
- `convex/chat/specialistPrompts.ts`
- `convex/research/actions.ts`
- `CLAUDE.md`

Pattern: validator-first additive contract shared by LLM output, runtime parse, and Convex returns.

Anti-pattern: prompt-only enrichment that validators reject, or required trust metadata that breaks legacy payloads.

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

- `pnpm exec eslint convex/chat/specialistPrompts.ts convex/research/actions.ts convex/research/actions.test.ts`
- `pnpm exec vitest run convex/research/actions.test.ts`
- `pnpm typecheck`

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

- None

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

- Specialist assignment: `pi-agent-planner`
- Rationale: this task primarily reshapes synthesis and extraction behavior, not pipeline orchestration

--------------------------------------------------------------------------------
REVIEW RESULTS
--------------------------------------------------------------------------------

- Review date: 2026-04-16
- Reviewer: Codex
- Commit reviewed: `20990bc29237ff67e0143ae95bc0c13d99844342`
- Verdict: APPROVED
- Stub behavior check: no stubbed implementation introduced in touched code; change is additive schema/prompt/validator work only

Verification:

- `pnpm exec eslint convex/chat/specialistPrompts.ts convex/research/actions.ts convex/research/actions.test.ts`
  - PASS (`exit 0`, no lint output)
- `pnpm exec vitest run convex/research/actions.test.ts`
  - PASS (`exit 0`, `1 passed`, `13 passed`)
- `pnpm typecheck`
  - PASS (`exit 0`)

Baseline / prior evidence:

- Prior evidence in `.worktrees/rec-upg-01/.tmp/REC-UPG-01/` was not a valid green baseline.
- `eslint.log` recorded `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "eslint" not found`.
- `vitest.log` recorded `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "vitest" not found`.
- `typecheck.log` recorded `sh: tsc: command not found`.
- `orchestrator-pre-commit.log` showed Vitest passing, but TypeScript verification did not complete to a passing result in that captured log.

Acceptance criteria review:

- AC-1: PASS
  - Evidence: `convex/chat/specialistPrompts.ts:195-233`, `convex/research/actions.test.ts:36-122`
  - Notes: legacy payload parsing and rich payload parsing are both explicitly covered.
- AC-2: PASS
  - Evidence: `convex/chat/specialistPrompts.ts:202-210`, `convex/research/actions.ts:1669-1678`, `convex/research/actions.test.ts:66-121`
  - Notes: `platformLinks` accepts `platform`, `url`, optional `rating`, and optional `reviewCount` in schema, return validator, and tests.
- AC-3: PASS
  - Evidence: `convex/chat/specialistPrompts.ts:247-291`, `convex/research/actions.test.ts:124-130`
  - Notes: prompt now requests `reviewCount`, `platformLinks`, `sourcePlatform`, and explicitly says to omit unsupported fields and never fabricate.
- AC-4: PASS
  - Evidence: `convex/research/actions.ts:1953-1997`
  - Notes: action arg validators remain `{ query, count?, location?, constraints? }`; return contract is an additive superset via `recommendationItemValidator`.
- AC-5: PASS
  - Evidence: `convex/chat/specialistPrompts.ts:284-291`, `convex/research/actions.test.ts:124-130`
  - Notes: non-fabrication is enforced at the prompt contract level and covered by prompt assertions.

Test criteria review:

- TC-1: TRUE
  - Evidence: `convex/research/actions.test.ts:37-64`
- TC-2: TRUE
  - Evidence: `convex/research/actions.test.ts:66-121`
- TC-3: TRUE
  - Evidence: `convex/research/actions.test.ts:124-130`
- TC-4: TRUE
  - Evidence: `convex/research/actions.ts:1954-1958`, `convex/research/actions.ts:1979-1983`, verified with `pnpm typecheck`
