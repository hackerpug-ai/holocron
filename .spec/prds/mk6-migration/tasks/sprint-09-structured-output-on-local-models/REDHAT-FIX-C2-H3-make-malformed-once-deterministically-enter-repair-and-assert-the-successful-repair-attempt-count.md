# REDHAT-FIX-C2-H3 — Make malformed-once deterministically enter repair and assert the successful repair attempt count

## What this does

Close red-hat cycle-2 H3 (**HIGH**): the test titled "malformed-once enters repair loop" (`tests/integration/service/struct-repair-loop.test.ts:138-174`) asserts only `simpleSchema.safeParse(result).success` + `capture.fleetCount() >= 1` + `capture.anthropicCount() === 0`. It **never** asserts `attempts > 1`, never reads loop state, and never verifies a repair actually occurred. The `malformedOnceInput` fixture is **prompt-based** ("a text asking the model to return bad JSON once then good") — non-deterministic; if the model returns valid JSON on attempt 1, the repair loop is never entered and the test still passes. **A stub `extractStructured` returning the hardcoded `goodOutput` fixture would pass this test** — the cap is honestly exercised by `struct-explicit-fail` (always-malformed → 3 real `AI_NoObjectGeneratedError`), but the repair-SUCCESS half of AC-1 is unproven.

The fix has two halves:

1. **Instrument the loop** — expose `attempts` (the actual loop counter at success) on the **success** path of `ExtractionStatus` (`extract-structured.ts:468-476`). Today `attempts` is only recorded on the **failure** path (`error.attempts` at `:219`); the success path records `result` + `committed:true` but not how many repair iterations actually ran. The success-status write at `:468-476` must include `attempts: attempt` so `holo extract:status <id>` and the integration test can both observe it.

2. **Make malformed-once deterministic** — replace the prompt-based `malformedOnceInput` with a **schema-side** fail-once fixture (modeled on the existing `alwaysFailingSchema` pattern at `struct-fixtures.ts:42-49`). The new `malformedOnceSchema` is a `simpleSchema`-shaped schema whose `.refine()` returns `false` exactly once (via a module-level counter) then `true` — so the **first** `schema.parse(object)` call inside the loop fails (forcing a repair iteration), and the **second** call passes. The model is called for real both times (real fleet traffic, no mocks); only the schema's refine toggles. This is the same honest pattern `alwaysFailingSchema` already uses (real fleet, schema-impossible), inverted to fail-N-times-then-pass.

Provides: an `attempts` field on the success-status record; a `malformedOnceSchema` fixture (schema-side deterministic fail-once); a `struct-repair-loop.test.ts` assertion that `status.attempts === 2` (or `>= 2`) for the malformed-once case — proving the repair loop was actually entered and a real repair occurred (not a first-try success).

## Why

- MUST add `attempts: attempt` to the success-status write at `extract-structured.ts:468-476` (currently the success path records `result` + `committed:true` but not the loop counter)
- MUST extend the `ExtractionStatus` type (`extract-structured.ts:101-123`) to include an optional `attempts?: number` field on the success path (mirrors the existing `error.attempts` on the failure path)
- MUST add a `malformedOnceSchema` fixture in `tests/fixtures/struct-fixtures.ts` modeled on `alwaysFailingSchema` (`:42-49`) but with a stateful `.refine()` that returns `false` exactly once then `true` — so the first `schema.parse()` inside the loop fails and the second passes
- MUST update the `malformed-once` entry in `FIXTURES` (`services/platform/src/cli/extract-fixtures.ts:44-48`) to use the new `malformedOnceSchema` instead of `simpleSchema` — the input can stay prompt-based (it's just text), but the schema is what forces the deterministic repair
- MUST extend `struct-repair-loop.test.ts:138-174` to assert `status.attempts >= 2` for the malformed-once case (the load-bearing assertion — proves the repair loop was entered)
- MUST assert `status.status === 'success'` AND `status.committed === true` AND `status.attempts >= 2` for the malformed-once case (all three — the never-silently-accept invariant + the repair-was-entered proof)
- MUST Write RED evidence under `.tmp/redhat-fix-c2-h3*` showing: (a) pre-fix `struct-repair-loop.test.ts:138-174` passes with zero `attempts` assertions (grep for `attempts` in the test file → 0 matches), and (b) a stub `extractStructured` returning `goodOutput` would pass the pre-fix test (demonstrate by temporarily stubbing or by reasoning over the assertions)
- MUST preserve the never-silently-accept invariant — adding `attempts` to the success status does not change what gets committed; only the observability surface changes
- MUST preserve the cap invariant — `MAX_REPAIR_ATTEMPTS=3` is unchanged; the malformed-once fixture must repair at attempt 2 (well within the cap)
- NEVER weaken or remove the existing `simpleSchema.safeParse(result).success` assertion in `struct-repair-loop.test.ts` — add the `attempts` assertion IN ADDITION, not as a replacement
- NEVER mock the model endpoint or use `endpointOverride` to inject a canned malformed-then-valid sequence — the schema-side fail-once pattern (modeled on `alwaysFailingSchema`) is the honest deterministic path against the real fleet
- NEVER use a stateful counter that persists across test runs without reset — the `malformedOnceSchema` refine counter MUST reset between test invocations (module-level `let` re-initialized on import, or a `resetMalformedOnceCounter()` helper the test calls in `beforeEach`)
- STRICTLY run against the real fleet at `127.0.0.1:4545` — `PLATFORM_IT=1` for the integration verification; the `status.attempts >= 2` assertion is the load-bearing evidence
- STRICTLY RED evidence under `.tmp/redhat-fix-c2-h3*` showing pre-fix zero attempts-assertion coverage and post-fix exercised coverage
- Grounded in: UC-INFER-03, T-INFER-008, CAP-INF-01

## How to verify

- `rg -n 'attempts' services/platform/src/inference/extract-structured.ts` → ≥5 lines (the type field, the success-status write, the failure-status write, and the ExtractionFailedError constructor surface)
- `rg -n 'malformedOnceSchema' tests/fixtures/struct-fixtures.ts services/platform/src/cli/extract-fixtures.ts` → ≥3 lines (definition in fixtures, import + registration in extract-fixtures)
- `rg -n 'status.attempts|status\!\\.attempts|attempts.*>=.*2' tests/integration/service/struct-repair-loop.test.ts` → ≥1 line (the load-bearing assertion)
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts` → Exit 0 with the new `attempts >= 2` assertion passing
- `PLATFORM_IT=1 bun services/platform/src/cli/holo.ts extract --fixture malformed-once --json` → exits 0, payload includes `extractionId`; follow-up `extract:status <id>` shows `attempts >= 2`
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check services/platform/src/inference/extract-structured.ts tests/fixtures/struct-fixtures.ts tests/integration/service/struct-repair-loop.test.ts` → Exit 0

## Scope

Writes: services/platform/src/inference/extract-structured.ts (MODIFY — add optional `attempts?: number` to `ExtractionStatus` success path at `:101-123`; include `attempts: attempt` in the success-status write at `:468-476`) · tests/fixtures/struct-fixtures.ts (MODIFY — add `malformedOnceSchema` with stateful `.refine()` fail-once; add `resetMalformedOnceCounter()` helper) · services/platform/src/cli/extract-fixtures.ts (MODIFY — point `malformed-once` fixture at the new `malformedOnceSchema` instead of `simpleSchema`) · tests/integration/service/struct-repair-loop.test.ts (MODIFY — add `status.attempts >= 2` assertion to the malformed-once case; call `resetMalformedOnceCounter()` in `beforeEach`) · .tmp/redhat-fix-c2-h3*/** (NEW — RED+GREEN evidence)

Prohibited: services/platform/src/inference/resolve-model.ts · services/platform/src/fleet/manifest.ts · services/platform/src/fleet/manifest.schema.ts · services/platform/src/inference/probe-capability.ts · services/platform/src/mastra.ts · services/platform/src/cli/holo.ts (the CLI already reads status verbatim — no change needed)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-C2-H3 — Make malformed-once deterministically enter repair and assert the successful repair attempt count
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-implementer (red-hat cycle-2 review H3)
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: true)
CAPABILITY: CAP-INF-01
SPRINT:     [Sprint 9 — Structured Output on Local Models](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
The `ExtractionStatus` success record carries an `attempts` field (the loop counter value at success), the `malformed-once` fixture uses a schema-side deterministic fail-once refine (modeled on `alwaysFailingSchema` — real fleet, no mocks), and `struct-repair-loop.test.ts:138-174` asserts `status.attempts >= 2` for the malformed-once case. A stub `extractStructured` returning the hardcoded `goodOutput` fixture on attempt 1 would now fail this test (its `status.attempts` would be 1, not >= 2). The repair-SUCCESS half of AC-1 is proven, not just the cap.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST add `attempts?: number` to the `ExtractionStatus` type at `extract-structured.ts:101-123` (optional — only present on success and extraction_failed paths)
- MUST include `attempts: attempt` in the success-status write at `extract-structured.ts:468-476` (the load-bearing instrumentation — currently absent)
- MUST add a `malformedOnceSchema` fixture in `tests/fixtures/struct-fixtures.ts` whose `.refine()` returns `false` exactly once (via a module-level counter) then `true` — same honest pattern as `alwaysFailingSchema` at `:42-49`
- MUST add a `resetMalformedOnceCounter()` helper (exported from struct-fixtures.ts) so the test can reset the counter in `beforeEach` — never let state leak across test invocations
- MUST point the `malformed-once` entry in `FIXTURES` (`services/platform/src/cli/extract-fixtures.ts:44-48`) at the new `malformedOnceSchema` instead of `simpleSchema`
- MUST add `expect(status.attempts).toBeGreaterThanOrEqual(2)` (or `=== 2` if the refine is strictly fail-once) to the malformed-once case in `struct-repair-loop.test.ts:138-174`
- MUST preserve the existing `simpleSchema.safeParse(result).success` assertion — add the `attempts` assertion IN ADDITION
- MUST Write RED evidence (`.tmp/redhat-fix-c2-h3-red/`) showing: (a) `rg -c 'attempts' tests/integration/service/struct-repair-loop.test.ts` returns 0 at HEAD `f4e07af` (pre-fix — no attempts assertion), and (b) a stub `extractStructured` returning `goodOutput` passes the pre-fix test (demonstrate by reasoning over the assertions or by a stub script)
- MUST preserve the never-silently-accept invariant — `attempts` is observability, not a new commit path
- NEVER weaken or remove the existing `simpleSchema.safeParse(result).success` assertion
- NEVER mock the model endpoint or use `endpointOverride` — the schema-side fail-once is the honest deterministic path (real fleet, real Zod validation)
- NEVER use a stateful counter that persists across test runs without reset — the refine counter MUST reset between invocations
- NEVER replace the prompt-based `malformedOnceInput` text with a mock model fixture — the input is just text fed to the real model; only the schema forces determinism
- STRICTLY run against the real fleet at `127.0.0.1:4545` — `PLATFORM_IT=1`
- STRICTLY the `status.attempts >= 2` assertion is the load-bearing evidence (not the schema change alone)
- STRICTLY RED evidence under `.tmp/redhat-fix-c2-h3*`
- Grounded in: UC-INFER-03, T-INFER-008, CAP-INF-01

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: `ExtractionStatus` type includes optional `attempts?: number`; the success-status write at `:468-476` records `attempts: attempt` (PRIMARY) (flow_ref T-INFER-008)
- [ ] AC-2: `malformedOnceSchema` exists in `tests/fixtures/struct-fixtures.ts` with a stateful `.refine()` that fails exactly once then passes; `resetMalformedOnceCounter()` is exported (flow_ref T-INFER-008)
- [ ] AC-3: `FIXTURES['malformed-once']` uses `malformedOnceSchema` (not `simpleSchema`); the `malformed-once` case in `struct-repair-loop.test.ts` asserts `status.attempts >= 2` (flow_ref T-INFER-008)
- [ ] AC-4: A stub returning `goodOutput` on attempt 1 FAILS the new `attempts >= 2` assertion (RED evidence demonstrates this); GREEN evidence shows the real fleet + schema-side fail-once produces `status.attempts === 2` (flow_ref T-INFER-008)
- [ ] `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 ExtractionStatus success path records the loop attempt count (PRIMARY) (flow_ref T-INFER-008)
  GIVEN: the ExtractionStatus type at extract-structured.ts:101-123 and the success-status write at :468-476
  WHEN:  grepping the file for the attempts field on the success path
  THEN:  the type includes `attempts?: number` and the success-status write includes `attempts: attempt`
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: c2-h3-success-attempts-instrumentation · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if the attempts field is added to the type but never written on the success path (the assertion would observe undefined), the attempts field is only on the failure path (the malformed-once case never reaches the failure path — it succeeds), the attempts value is hardcoded to 1 (defeats the assertion — would pass a stub), the attempts field is added but the success-status write is unchanged (type-only change with no runtime effect)
    CASE[0] start_ref=c2-h3-success-attempts-instrumentation · actor=reviewer
      ACTION: Grep extract-structured.ts for the ExtractionStatus type definition → confirm an optional `attempts?: number` field exists → Grep for the success-status writeExtractionStatus call at :468-476 → confirm it includes `attempts: attempt` (the loop counter variable)
      MUST_OBSERVE: `rg -n 'attempts\\?: number' services/platform/src/inference/extract-structured.ts` returns ≥1 line (type field) | `rg -n 'attempts: attempt' services/platform/src/inference/extract-structured.ts` returns ≥1 line in the success-status block (near :468-476) | the attempts value is the loop counter variable `attempt`, not a hardcoded constant
      MUST_NOT_OBSERVE: the attempts field only on the failure-status write at :208-222 (the malformed-once case succeeds — never reaches that path) | a hardcoded `attempts: 1` or `attempts: 2` literal (defeats the determinism assertion) | the type field present but the write unchanged

AC-2 malformedOnceSchema fixture exists with stateful fail-once refine (flow_ref T-INFER-008)
  GIVEN: the shared struct-fixtures module (tests/fixtures/struct-fixtures.ts) and the existing alwaysFailingSchema pattern at :42-49
  WHEN:  grepping for the new fixture
  THEN:  malformedOnceSchema is defined as a simpleSchema-shaped schema whose .refine() returns false exactly once then true; resetMalformedOnceCounter() is exported
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: c2-h3-malformed-once-schema-fixture · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if the refine always returns false (becomes alwaysFailingSchema — repair loop exhausts, no success), the refine always returns true (becomes simpleSchema — repair loop never entered, attempts===1), the counter is not resettable (state leaks across test runs — flaky), the schema is z.any() with a refine (no real shape validation)
    CASE[0] start_ref=c2-h3-malformed-once-schema-fixture · actor=reviewer
      ACTION: Grep tests/fixtures/struct-fixtures.ts for 'malformedOnceSchema' and 'resetMalformedOnceCounter' → read the refine implementation → confirm the counter is module-level and resettable
      MUST_OBSERVE: `rg -n 'malformedOnceSchema|resetMalformedOnceCounter' tests/fixtures/struct-fixtures.ts` returns ≥3 lines | the refine calls a module-level counter that increments per parse | the counter starts at 0 (or 1) and the refine returns false while counter <= 1, true after | resetMalformedOnceCounter() zeroes the counter | the schema shape matches simpleSchema ({ title: z.string(), count: z.number(), tags: z.array(z.string()) })
      MUST_NOT_OBSERVE: the refine always returning false (alwaysFailingSchema variant) | the refine always returning true (simpleSchema variant) | a non-resettable counter | the schema using z.any() or z.unknown()

AC-3 struct-repair-loop.test.ts asserts status.attempts >= 2 for the malformed-once case (flow_ref T-INFER-008)
  GIVEN: the malformed-once test case at struct-repair-loop.test.ts:138-174 and the new attempts field on the success-status record
  WHEN:  running the test against the real fleet (PLATFORM_IT=1) with the new malformedOnceSchema fixture
  THEN:  the test asserts status.attempts >= 2 (or === 2) for the malformed-once case — proving the repair loop was entered and a real repair occurred
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: c2-h3-attempts-assertion · evidence: stdout
    NEGATIVE_CONTROL: would fail if the assertion is absent (the pre-fix state — test passes regardless of whether repair ran), the assertion is `attempts >= 1` (passes a stub returning goodOutput on attempt 1 — does not prove repair ran), the test stubs the model to return valid output on attempt 1 (schema refine forces fail on attempt 1 regardless — but if the refine is removed, the test would pass without repair), the test is skipped without PLATFORM_IT (silently looks green)
    CASE[0] start_ref=c2-h3-attempts-assertion · actor=fleet
      ACTION: Run PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts → confirm the malformed-once case includes an assertion on status.attempts → query getExtractionStatus(extractionId).attempts and confirm >= 2 → record the artifact
      MUST_OBSERVE: the test passes | the test includes `expect(status.attempts).toBeGreaterThanOrEqual(2)` or equivalent exact assertion | getExtractionStatus(extractionId).status === 'success' | getExtractionStatus(extractionId).committed === true | getExtractionStatus(extractionId).attempts >= 2 | capture.fleetCount() >= 2 (model called at least twice — once per repair iteration) | capture.anthropicCount() === 0
      MUST_NOT_OBSERVE: the test passing with status.attempts === 1 (would mean the repair loop was never entered — the schema refine didn't fire) | the test passing without any attempts assertion (the pre-fix state) | capture.fleetCount() === 1 (model called only once — repair loop never entered) | the test skipped without PLATFORM_IT

AC-4 a stub returning goodOutput on attempt 1 fails the new assertion (RED proof) (flow_ref T-INFER-008)
  GIVEN: the RED evidence directory .tmp/redhat-fix-c2-h3-red/ and a stub extractStructured that returns goodOutput on attempt 1 (no repair loop entered)
  WHEN:  running the new struct-repair-loop.test.ts assertion against the stub
  THEN:  the assertion fails — status.attempts would be 1 (or undefined pre-instrumentation), not >= 2; the stub passes the pre-fix test but fails the post-fix test
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: c2-h3-stub-fails-assertion · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if the RED evidence is absent (cannot prove the assertion catches a stub), the stub is not actually a stub (uses the real extractStructured — would pass if the schema refine fires), the RED evidence only shows the test passing pre-fix (does not demonstrate the stub path), the GREEN evidence is absent (no proof the real fleet + schema-side fail-once produces attempts===2)
    CASE[0] start_ref=c2-h3-stub-fails-assertion · actor=reviewer
      ACTION: Read the RED evidence at .tmp/redhat-fix-c2-h3-red/ → confirm it shows (a) rg -c 'attempts' on the pre-fix struct-repair-loop.test.ts returns 0, and (b) a stub demonstration showing status.attempts===1 (or undefined) fails the >= 2 assertion → Read the GREEN evidence at .tmp/redhat-fix-c2-h3-green/ → confirm it shows status.attempts===2 against the real fleet
      MUST_OBSERVE: .tmp/redhat-fix-c2-h3-red/ exists and contains a pre-fix attempts-grep artifact showing 0 matches | .tmp/redhat-fix-c2-h3-red/ contains a stub-demonstration artifact showing status.attempts===1 fails >= 2 | .tmp/redhat-fix-c2-h3-green/ exists and contains a real-fleet artifact showing status.attempts===2 | the GREEN artifact shows capture.fleetCount() >= 2
      MUST_NOT_OBSERVE: the RED evidence absent (cannot prove the assertion catches a stub) | the GREEN evidence showing status.attempts===1 (would mean the schema refine didn't fire) | the GREEN evidence showing capture.fleetCount()===1 (repair loop never entered)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------
- TC-1 [ExtractionStatus success path includes attempts field + write] (maps_to_ac AC-1)
- TC-2 [malformedOnceSchema fixture exists with stateful fail-once refine + reset helper] (maps_to_ac AC-2)
- TC-3 [struct-repair-loop.test.ts asserts status.attempts >= 2 for malformed-once against the real fleet] (maps_to_ac AC-3)
- TC-4 [RED evidence shows stub passes pre-fix / fails post-fix; GREEN evidence shows real fleet attempts===2] (maps_to_ac AC-4)
- TC-5 [Existing good-input and cap tests still pass — no regression] (maps_to_ac AC-1)
- TC-6 [Typecheck + lint clean after the instrumentation + fixture additions] (maps_to_ac AC-1)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/inference/extract-structured.ts (MODIFY — add optional `attempts?: number` to ExtractionStatus type at :101-123; include `attempts: attempt` in the success-status write at :468-476)
- tests/fixtures/struct-fixtures.ts (MODIFY — add malformedOnceSchema with stateful .refine() fail-once; export resetMalformedOnceCounter())
- services/platform/src/cli/extract-fixtures.ts (MODIFY — point FIXTURES['malformed-once'] at malformedOnceSchema instead of simpleSchema)
- tests/integration/service/struct-repair-loop.test.ts (MODIFY — add `expect(status.attempts).toBeGreaterThanOrEqual(2)` to the malformed-once case at :138-174; call resetMalformedOnceCounter() in beforeEach)
- .tmp/redhat-fix-c2-h3*/** (NEW evidence)
writeProhibited: services/platform/src/inference/resolve-model.ts · services/platform/src/fleet/manifest.ts · services/platform/src/fleet/manifest.schema.ts · services/platform/src/inference/probe-capability.ts · services/platform/src/mastra.ts · services/platform/src/cli/holo.ts

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/inference/extract-structured.ts lines 397-477
   - focus: the bounded repair loop and the success-status write site (:468-476) where `attempts: attempt` must be added
2. services/platform/src/inference/extract-structured.ts lines 101-123
   - focus: ExtractionStatus type — add `attempts?: number` alongside the existing error.attempts field
3. services/platform/src/inference/extract-structured.ts lines 208-222
   - focus: failure-status write — the existing `error.attempts` pattern to mirror on the success path
4. tests/fixtures/struct-fixtures.ts lines 42-49
   - focus: alwaysFailingSchema — the existing stateful-refine pattern to mirror (inverted: fail-once instead of fail-always)
5. tests/fixtures/struct-fixtures.ts lines 19-23
   - focus: simpleSchema — the shape malformedOnceSchema must match (so the model's output is schema-shaped and only the refine toggles)
6. services/platform/src/cli/extract-fixtures.ts lines 44-48
   - focus: FIXTURES['malformed-once'] entry — currently points at simpleSchema; repoint to malformedOnceSchema
7. tests/integration/service/struct-repair-loop.test.ts lines 138-174
   - focus: the malformed-once test case — where `expect(status.attempts).toBeGreaterThanOrEqual(2)` must be added
8. tests/integration/service/struct-explicit-fail.test.ts lines 1-50 (skim)
   - focus: the always-malformed cap test — confirms the cap path is honestly exercised; this task complements it by proving the repair-SUCCESS path

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Type field added: `rg -n 'attempts\?: number' services/platform/src/inference/extract-structured.ts` → ≥1 line
- Success-status write: `rg -n 'attempts: attempt' services/platform/src/inference/extract-structured.ts` → ≥1 line (in the success-status block)
- Fixture exists: `rg -n 'malformedOnceSchema|resetMalformedOnceCounter' tests/fixtures/struct-fixtures.ts` → ≥3 lines
- Fixture registered: `rg -n 'malformedOnceSchema' services/platform/src/cli/extract-fixtures.ts` → ≥1 line
- Assertion added: `rg -n 'attempts' tests/integration/service/struct-repair-loop.test.ts` → ≥1 line (was 0 pre-fix)
- Repair-loop test passes: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts` → Exit 0
- Cap test still passes (no regression): `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-explicit-fail.test.ts` → Exit 0
- CLI status shows attempts: `PLATFORM_IT=1 bun services/platform/src/cli/holo.ts extract --fixture malformed-once --json | jq -r .extractionId | xargs -I {} bun services/platform/src/cli/holo.ts extract:status {} --json | jq -r .attempts` → ≥2
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check services/platform/src/inference/extract-structured.ts tests/fixtures/struct-fixtures.ts tests/integration/service/struct-repair-loop.test.ts` → Exit 0

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- pattern: Schema-side deterministic fail-once — mirror the existing `alwaysFailingSchema` (`struct-fixtures.ts:42-49`) but invert the refine: a module-level `let malformedOnceCounter = 0;` incremented per `.parse()` call, with `.refine(() => { malformedOnceCounter++; return malformedOnceCounter > 1; }, 'fail-once fixture')`. The first parse fails (forcing a repair iteration), the second passes. The model is called for real both times (real fleet traffic, real Zod validation); only the schema's refine toggles. This is the same honest pattern `alwaysFailingSchema` uses, inverted.
- pattern_source: `tests/fixtures/struct-fixtures.ts:42-49` (alwaysFailingSchema) + `services/platform/src/inference/extract-structured.ts:397-477` (the repair loop and success-status site) + `:208-222` (the existing failure-path error.attempts pattern to mirror on success)
- anti_pattern: Mocking the model endpoint to return malformed-then-valid JSON (`endpointOverride` or a stub `extractStructured`). Also anti-pattern: asserting only `attempts >= 1` (passes a stub returning goodOutput on attempt 1 — does not prove repair ran). Also anti-pattern: hardcoding `attempts: 2` in the status write (defeats the determinism assertion — would pass regardless of whether the loop actually iterated). Also anti-pattern: a non-resettable counter (state leaks across test runs — flaky).
- agent_rationale: H3 is HIGH because the AC-1 "malformed → repair → valid" half is only proven by a tautology (`safeParse().success === true`), not by the repair loop actually running. The instrumentation (success-status `attempts` field) is the smallest blast-radius change — no new abstraction, no commit-path change, only observability. The schema-side fail-once fixture is the deterministic path that doesn't mock the model — it composes naturally with the existing `alwaysFailingSchema` pattern. Together they close the "a stub would pass this test" gap: a stub returning `goodOutput` on attempt 1 would now produce `status.attempts === 1`, failing the `>= 2` assertion.
- counter_reset_pattern: export `function resetMalformedOnceCounter() { malformedOnceCounter = 0; }` from struct-fixtures.ts; the test calls it in `beforeEach` (or before the malformed-once `it` block) so the refine fails on the first parse of each test run. Without this, the counter would persist across the good-input test and the malformed-once test would see `counter === 2+` on its first parse (refine returns true immediately — repair loop never entered — flaky fail).
- Composes with REDHAT-FIX-C2-H4: the success-status `attempts` field is also what makes the `holo extract:status <id>` CLI output meaningful for the malformed-once case (operator can see how many repair iterations ran). H4's self-contained gate step 5 will benefit from this instrumentation when it queries status after a real extract.

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: REDHAT-FIX-H1 (the success-status write at :468-476 exists) · struct-1 (the repair loop exists at :397-477)
Blocks: closure of AC-1 (struct-1) — until this task lands, the repair-SUCCESS half of AC-1 is only proven by a tautology

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-C2-H3",
  "proposed_by": "mastra-implementer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "c2-h3-success-attempts-instrumentation": {
      "description": "The ExtractionStatus success-status write at extract-structured.ts:468-476 — where the `attempts: attempt` field must be added (currently absent, defeating any attempts-based assertion on the success path)",
      "seed_method": "public_api",
      "records": [
        "extract-structured.ts:101-123 ExtractionStatus type — add optional `attempts?: number` (mirrors the existing error.attempts on the failure path at :219)",
        "extract-structured.ts:467 await writeExtractionStatus({ id: extractionId, status: 'success', role, startedAt, endedAt: ..., committed: true, result: validated }) — current success-status write (no attempts field)",
        "extract-structured.ts:468-476 the writeExtractionStatus call site — add `attempts: attempt` (the loop counter variable from :397)",
        "extract-structured.ts:397 for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) — the loop counter variable that must be persisted to status"
      ]
    },
    "c2-h3-malformed-once-schema-fixture": {
      "description": "The new malformedOnceSchema fixture in tests/fixtures/struct-fixtures.ts — a simpleSchema-shaped schema whose .refine() fails exactly once then passes (modeled on alwaysFailingSchema at :42-49, inverted)",
      "seed_method": "public_api",
      "records": [
        "tests/fixtures/struct-fixtures.ts:42-49 alwaysFailingSchema = z.object({ title: z.string(), count: z.number().refine(() => false, 'unsatisfiable: always-malformed fixture'), tags: z.array(z.string()) }) — the existing pattern to mirror",
        "tests/fixtures/struct-fixtures.ts: new let malformedOnceCounter = 0; (module-level stateful counter)",
        "tests/fixtures/struct-fixtures.ts: new malformedOnceSchema = z.object({ title: z.string(), count: z.number().refine(() => { malformedOnceCounter++; return malformedOnceCounter > 1; }, 'fail-once fixture'), tags: z.array(z.string()) })",
        "tests/fixtures/struct-fixtures.ts: new export function resetMalformedOnceCounter() { malformedOnceCounter = 0; } — reset hook for test beforeEach",
        "services/platform/src/cli/extract-fixtures.ts:44-48 FIXTURES['malformed-once'] repointed from simpleSchema to malformedOnceSchema"
      ]
    },
    "c2-h3-attempts-assertion": {
      "description": "The malformed-once test case at struct-repair-loop.test.ts:138-174 — where `expect(status.attempts).toBeGreaterThanOrEqual(2)` must be added alongside the existing simpleSchema.safeParse(result).success assertion",
      "seed_method": "public_api",
      "records": [
        "tests/integration/service/struct-repair-loop.test.ts:138-174 the malformed-once itLive block — currently asserts only result, safeParse().success, fleetCount, anthropicCount",
        "the test must query getExtractionStatus(extractionId) after the successful extractStructured call and assert status.attempts >= 2",
        "beforeEach (or before the malformed-once it block) must call resetMalformedOnceCounter() so the refine deterministically fails on the first parse of each run"
      ]
    },
    "c2-h3-stub-fails-assertion": {
      "description": "The RED evidence demonstrating a stub extractStructured returning goodOutput on attempt 1 produces status.attempts===1 (or undefined pre-instrumentation), which fails the new >= 2 assertion — proving the assertion catches a stub",
      "seed_method": "file_artifact",
      "records": [
        ".tmp/redhat-fix-c2-h3-red/pre-fix-attempts-grep.txt: rg -c 'attempts' tests/integration/service/struct-repair-loop.test.ts returns 0 at HEAD f4e07af (no attempts assertion pre-fix)",
        ".tmp/redhat-fix-c2-h3-red/stub-demonstration.json: a stub extractStructured returning goodOutput on attempt 1 would produce status.attempts===1 — failing the new >= 2 assertion",
        ".tmp/redhat-fix-c2-h3-green/real-fleet-attempts.json: against the real fleet with malformedOnceSchema, status.attempts===2 (repair loop entered once, succeeded on second iteration)"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the ExtractionStatus type at extract-structured.ts:101-123 and the success-status write at :468-476 WHEN grepping the file for the attempts field on the success path THEN the type includes attempts?: number and the success-status write includes attempts: attempt",
      "verify": "rg -n 'attempts\\?: number' services/platform/src/inference/extract-structured.ts && rg -n 'attempts: attempt' services/platform/src/inference/extract-structured.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-008",
        "negative_control": {
          "would_fail_if": [
            "the attempts field is added to the type but never written on the success path (the assertion would observe undefined)",
            "the attempts field is only on the failure path at :208-222 (the malformed-once case succeeds — never reaches that path)",
            "the attempts value is hardcoded to 1 (defeats the assertion — would pass a stub)",
            "the attempts field is added but the success-status write at :468-476 is unchanged (type-only change with no runtime effect)"
          ]
        },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "c2-h3-success-attempts-instrumentation",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Grep extract-structured.ts for the ExtractionStatus type definition",
                "Confirm an optional `attempts?: number` field exists in the type",
                "Grep for the success-status writeExtractionStatus call near :468-476",
                "Confirm it includes `attempts: attempt` (the loop counter variable from :397)"
              ]
            },
            "end_state": {
              "must_observe": [
                "rg -n 'attempts\\?: number' services/platform/src/inference/extract-structured.ts returns >=1 line",
                "rg -n 'attempts: attempt' services/platform/src/inference/extract-structured.ts returns >=1 line in the success-status block near :468-476",
                "the attempts value is the loop counter variable `attempt`, not a hardcoded constant"
              ],
              "must_not_observe": [
                "the attempts field only on the failure-status write at :208-222",
                "a hardcoded `attempts: 1` or `attempts: 2` literal",
                "the type field present but the write unchanged"
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
      "description": "GIVEN the shared struct-fixtures module and the existing alwaysFailingSchema pattern at :42-49 WHEN grepping for the new fixture THEN malformedOnceSchema is defined as a simpleSchema-shaped schema whose .refine() returns false exactly once then true; resetMalformedOnceCounter() is exported",
      "verify": "rg -n 'malformedOnceSchema|resetMalformedOnceCounter' tests/fixtures/struct-fixtures.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-008",
        "negative_control": {
          "would_fail_if": [
            "the refine always returns false (becomes alwaysFailingSchema — repair loop exhausts, no success)",
            "the refine always returns true (becomes simpleSchema — repair loop never entered, attempts===1)",
            "the counter is not resettable (state leaks across test runs — flaky)",
            "the schema is z.any() with a refine (no real shape validation — defeats never-silently-accept)"
          ]
        },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "c2-h3-malformed-once-schema-fixture",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Grep tests/fixtures/struct-fixtures.ts for 'malformedOnceSchema' and 'resetMalformedOnceCounter'",
                "Read the refine implementation",
                "Confirm the counter is module-level and resettable"
              ]
            },
            "end_state": {
              "must_observe": [
                "rg -n 'malformedOnceSchema|resetMalformedOnceCounter' tests/fixtures/struct-fixtures.ts returns >=3 lines",
                "the refine calls a module-level counter that increments per parse",
                "the counter starts at 0 (or 1) and the refine returns false while counter <= 1, true after",
                "resetMalformedOnceCounter() zeroes the counter",
                "the schema shape matches simpleSchema ({ title: z.string(), count: z.number(), tags: z.array(z.string()) })"
              ],
              "must_not_observe": [
                "the refine always returning false (alwaysFailingSchema variant)",
                "the refine always returning true (simpleSchema variant)",
                "a non-resettable counter",
                "the schema using z.any() or z.unknown()"
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
      "description": "GIVEN the malformed-once test case at struct-repair-loop.test.ts:138-174 and the new attempts field on the success-status record WHEN running the test against the real fleet (PLATFORM_IT=1) with the new malformedOnceSchema fixture THEN the test asserts status.attempts >= 2 (or === 2) — proving the repair loop was entered and a real repair occurred",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-008",
        "negative_control": {
          "would_fail_if": [
            "the assertion is absent (the pre-fix state — test passes regardless of whether repair ran)",
            "the assertion is `attempts >= 1` (passes a stub returning goodOutput on attempt 1 — does not prove repair ran)",
            "the test stubs the model to return valid output on attempt 1 (schema refine forces fail on attempt 1 regardless — but if the refine is removed, the test would pass without repair)",
            "the test is skipped without PLATFORM_IT (silently looks green)"
          ]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "c2-h3-attempts-assertion",
            "action": {
              "actor": "fleet",
              "steps": [
                "Run PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts",
                "Confirm the malformed-once case includes an assertion on status.attempts",
                "Query getExtractionStatus(extractionId).attempts and confirm >= 2",
                "Record the artifact"
              ]
            },
            "end_state": {
              "must_observe": [
                "the test passes",
                "the test includes expect(status.attempts).toBeGreaterThanOrEqual(2) or equivalent exact assertion",
                "getExtractionStatus(extractionId).status === 'success'",
                "getExtractionStatus(extractionId).committed === true",
                "getExtractionStatus(extractionId).attempts >= 2",
                "capture.fleetCount() >= 2 (model called at least twice — once per repair iteration)",
                "capture.anthropicCount() === 0"
              ],
              "must_not_observe": [
                "the test passing with status.attempts === 1 (would mean the repair loop was never entered — the schema refine didn't fire)",
                "the test passing without any attempts assertion (the pre-fix state)",
                "capture.fleetCount() === 1 (model called only once — repair loop never entered)",
                "the test skipped without PLATFORM_IT"
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
      "description": "GIVEN the RED evidence directory .tmp/redhat-fix-c2-h3-red/ and a stub extractStructured that returns goodOutput on attempt 1 (no repair loop entered) WHEN running the new struct-repair-loop.test.ts assertion against the stub THEN the assertion fails — status.attempts would be 1 (or undefined pre-instrumentation), not >= 2; the stub passes the pre-fix test but fails the post-fix test",
      "verify": "test -d .tmp/redhat-fix-c2-h3-red && test -d .tmp/redhat-fix-c2-h3-green && rg -c 'attempts' .tmp/redhat-fix-c2-h3-green/real-fleet-attempts.json",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-008",
        "negative_control": {
          "would_fail_if": [
            "the RED evidence is absent (cannot prove the assertion catches a stub)",
            "the stub is not actually a stub (uses the real extractStructured — would pass if the schema refine fires)",
            "the RED evidence only shows the test passing pre-fix (does not demonstrate the stub path)",
            "the GREEN evidence is absent (no proof the real fleet + schema-side fail-once produces attempts===2)"
          ]
        },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "c2-h3-stub-fails-assertion",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Read the RED evidence at .tmp/redhat-fix-c2-h3-red/",
                "Confirm it shows (a) rg -c 'attempts' on the pre-fix struct-repair-loop.test.ts returns 0, and (b) a stub demonstration showing status.attempts===1 fails >= 2",
                "Read the GREEN evidence at .tmp/redhat-fix-c2-h3-green/",
                "Confirm it shows status.attempts===2 against the real fleet"
              ]
            },
            "end_state": {
              "must_observe": [
                ".tmp/redhat-fix-c2-h3-red/ exists and contains a pre-fix attempts-grep artifact showing 0 matches",
                ".tmp/redhat-fix-c2-h3-red/ contains a stub-demonstration artifact showing status.attempts===1 fails >= 2",
                ".tmp/redhat-fix-c2-h3-green/ exists and contains a real-fleet artifact showing status.attempts===2",
                "the GREEN artifact shows capture.fleetCount() >= 2"
              ],
              "must_not_observe": [
                "the RED evidence absent (cannot prove the assertion catches a stub)",
                "the GREEN evidence showing status.attempts===1 (would mean the schema refine didn't fire)",
                "the GREEN evidence showing capture.fleetCount()===1 (repair loop never entered)"
              ]
            }
          }
        ]
      }
    },
    { "id": "TC-1", "type": "test_criterion", "description": "ExtractionStatus success path includes attempts field + write", "verify": "rg -n 'attempts\\?: number' services/platform/src/inference/extract-structured.ts && rg -n 'attempts: attempt' services/platform/src/inference/extract-structured.ts", "maps_to_ac": "AC-1" },
    { "id": "TC-2", "type": "test_criterion", "description": "malformedOnceSchema fixture exists with stateful fail-once refine + reset helper", "verify": "rg -n 'malformedOnceSchema|resetMalformedOnceCounter' tests/fixtures/struct-fixtures.ts", "maps_to_ac": "AC-2" },
    { "id": "TC-3", "type": "test_criterion", "description": "struct-repair-loop.test.ts asserts status.attempts >= 2 for malformed-once against the real fleet", "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts", "maps_to_ac": "AC-3" },
    { "id": "TC-4", "type": "test_criterion", "description": "RED evidence shows stub passes pre-fix / fails post-fix; GREEN evidence shows real fleet attempts===2", "verify": "test -d .tmp/redhat-fix-c2-h3-red && test -d .tmp/redhat-fix-c2-h3-green", "maps_to_ac": "AC-4" },
    { "id": "TC-5", "type": "test_criterion", "description": "Existing good-input and cap tests still pass — no regression", "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-explicit-fail.test.ts", "maps_to_ac": "AC-1" },
    { "id": "TC-6", "type": "test_criterion", "description": "Typecheck + lint clean after the instrumentation + fixture additions", "verify": "pnpm tsgo --noEmit && pnpm biome check services/platform/src/inference/extract-structured.ts tests/fixtures/struct-fixtures.ts tests/integration/service/struct-repair-loop.test.ts", "maps_to_ac": "AC-1" }
  ]
}
-->
</details>
