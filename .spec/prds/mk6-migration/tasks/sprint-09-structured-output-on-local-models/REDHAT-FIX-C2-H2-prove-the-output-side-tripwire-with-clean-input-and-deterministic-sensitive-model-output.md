# REDHAT-FIX-C2-H2 — Prove the output-side tripwire with clean input and deterministic sensitive model output

## What this does

Close red-hat cycle-2 H2 (**HIGH**): the AC-3 "tripwire **during** extraction" gate step exercises the **input** tripwire (`extract-structured.ts:361-369` fires on `tripwireInput` containing `"My SSN is 123-45-6789..."`), so the **output-side** tripwire at `extract-structured.ts:434-441` — which scans `JSON.stringify(object)` for sensitive data the model **synthesized** — has **zero** gate or test coverage. The code exists (REDHAT-FIX-H3 installed it), but no test or human-gate step ever causes the model to emit sensitive data from clean input. A model that hallucinates an SSN from a clean prompt would be caught by the code, but this safety path is unvalidated.

The fix adds a fourth documented fixture (`output-tripwire`) whose **input is provably clean** (`findTripwireMatches(input) === null`) but whose **schema + prompt drive the model to synthesize a sensitive value** in its output (e.g. "produce a fake-but-realistic SSN example as the `sample` field"). When the model emits the synthesized value, `JSON.stringify(object)` matches the SSN regex at `extract-structured.ts:252-263` and the OUTPUT-side `BlockedError` at `:434-441` fires with `reason: 'output_sensitive_data_detected'` — distinct from the input-side `'sensitive_data_detected'` reason that gate step 6 proves. The fixture is registered in `FIXTURES` and exercised end-to-end by a new integration test + a new (or split) gate step.

Provides: a clean-input / sensitive-output fixture (`outputTripwireSchema` + `outputTripwireInput`); a `FIXTURES['output-tripwire']` entry point; an integration test that asserts the **output-side** `BlockedError` fires with `reason: 'output_sensitive_data_detected'` AND the input-side check returns null (proving the path exercised is the mid-extraction one, not the pre-model one).

## Why

- MUST add a `outputTripwireSchema = z.object({ topic: z.string(), sample: z.string() })` and `outputTripwireInput` to `tests/fixtures/struct-fixtures.ts` — the schema's `sample` field is where the model is asked to emit a realistic sensitive value
- MUST register `output-tripwire` in `FIXTURES` (`services/platform/src/cli/extract-fixtures.ts`) with the new schema + input
- MUST prove the new fixture's **input** is clean — `findTripwireMatches(outputTripwireInput) === null` (otherwise the input-side tripwire at `:361` would fire first and re-mask the gap)
- MUST exercise the OUTPUT-side tripwire at `extract-structured.ts:434-441` against the REAL fleet (no mock model, no `endpointOverride`) — `BlockedError` thrown with `reason: 'output_sensitive_data_detected'` (NOT `'sensitive_data_detected'`)
- MUST add an integration test in `tests/integration/service/struct-tripwire-blocked.test.ts` (or a new sibling `struct-output-tripwire-blocked.test.ts`) that asserts BOTH: (a) the input passes the input-side tripwire check, and (b) the OUTPUT-side `BlockedError` fires with `output_sensitive_data_detected`
- MUST record RED evidence under `.tmp/redhat-fix-c2-h2*/` showing the current gate / test suite has **zero** coverage of the output-side path (a grep of `output_sensitive_data_detected` across `.tmp/extractions/` and `.gate-evidence/` returns zero matches pre-fix), then GREEN showing at least one match post-fix
- MUST preserve the never-silently-accept invariant and the block invariant (`status==='blocked'`, `committed===false`) for the OUTPUT-side path
- NEVER weaken the prompt so the model emits non-sensitive data — the entire purpose is to drive the model to synthesize sensitive data from clean input. If the model emits clean output on a given run, the test records it honestly (a non-determinism note) and re-runs; it does NOT silently pass
- NEVER mock the model endpoint or use `endpointOverride` to inject a canned sensitive response — the safety path must be proven against the real fleet's actual synthesis behavior
- NEVER weaken or remove the input-side tripwire (gate step 6 / `struct-tripwire-blocked.test.ts`) — both paths must coexist
- STRICTLY run against the real fleet at `127.0.0.1:4545` — `PLATFORM_IT=1` for the integration verification; the reason-discrimination assertion (`output_sensitive_data_detected` vs `sensitive_data_detected`) is the load-bearing evidence
- STRICTLY RED evidence under `.tmp/redhat-fix-c2-h2*` showing pre-fix zero output-side coverage and post-fix exercised coverage
- Grounded in: UC-INFER-03, T-INFER-010, CAP-INF-01

## How to verify

- `rg -n 'output-tripwire|outputTripwireSchema|outputTripwireInput' tests/fixtures/struct-fixtures.ts services/platform/src/cli/extract-fixtures.ts` → ≥3 lines (the fixture exists in both the source-of-truth fixtures module AND the CLI fixture registry)
- `rg -n 'output_sensitive_data_detected' services/platform/src/inference/extract-structured.ts` → ≥1 line (the OUTPUT-side BlockedError site — already exists from REDHAT-FIX-H3; this task adds coverage, not code)
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-tripwire-blocked.test.ts` → Exit 0 (existing input-side test still passes)
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-output-tripwire-blocked.test.ts` (or the appended output-side `describe` block) → Exit 0 with `output_sensitive_data_detected` asserted
- `PLATFORM_IT=1 bun services/platform/src/cli/holo.ts extract --fixture output-tripwire --json 2>&1 | rg -c 'output_sensitive_data_detected'` → ≥1
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check tests/fixtures/struct-fixtures.ts services/platform/src/cli/extract-fixtures.ts tests/integration/service/struct-tripwire-blocked.test.ts` → Exit 0

## Scope

Writes: tests/fixtures/struct-fixtures.ts (MODIFY — add `outputTripwireSchema` + `outputTripwireInput` alongside the existing `tripwireInput` / `tripwireSchema`) · services/platform/src/cli/extract-fixtures.ts (MODIFY — register `output-tripwire` in `FIXTURES` and extend `FixtureName`) · tests/integration/service/struct-tripwire-blocked.test.ts (MODIFY — add a new `describe` block "struct-3 AC-3 output-side tripwire" with clean-input / sensitive-output assertions) OR a new sibling file `tests/integration/service/struct-output-tripwire-blocked.test.ts` (NEW) · .tmp/redhat-fix-c2-h2*/** (NEW — RED+GREEN evidence)

Prohibited: services/platform/src/inference/extract-structured.ts · services/platform/src/inference/resolve-model.ts · services/platform/src/fleet/manifest.ts · services/platform/src/fleet/manifest.schema.ts · services/platform/src/inference/probe-capability.ts · services/platform/src/mastra.ts

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-C2-H2 — Prove the output-side tripwire with clean input and deterministic sensitive model output
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-implementer (red-hat cycle-2 review H2)
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
A new `output-tripwire` fixture pair is documented and registered: its input contains NO SSN/CC/api-key/password literal (`findTripwireMatches(input) === null`) but its schema + prompt drive the local fleet to synthesize a realistic sensitive value in the `sample` field. When the model returns that value, `extract-structured.ts:434-441` (the OUTPUT-side tripwire installed by REDHAT-FIX-H3) throws `BlockedError` with `reason: 'output_sensitive_data_detected'` (distinct from the input-side `'sensitive_data_detected'` reason gate step 6 proves). The mid-extraction safety path named by AC-3 is now covered by both a vitest integration case AND a CLI `holo extract --fixture output-tripwire` invocation.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST add `outputTripwireSchema` and `outputTripwireInput` to `tests/fixtures/struct-fixtures.ts` — the schema's `sample` field is the slot the model is asked to fill with a sensitive value
- MUST register `output-tripwire` in `FIXTURES` and extend `FixtureName` in `services/platform/src/cli/extract-fixtures.ts`
- MUST prove the fixture input is clean: a unit assertion `expect(findTripwireMatches(outputTripwireInput)).toBeNull()` (or an equivalent grep / regex check) in the new test
- MUST exercise the OUTPUT-side `BlockedError` against the REAL fleet at `127.0.0.1:4545` — `PLATFORM_IT=1` (no mocks, no `endpointOverride`)
- MUST assert the blocked reason is exactly `'output_sensitive_data_detected'` (NOT the input-side `'sensitive_data_detected'`) — this is what distinguishes the two paths
- MUST preserve the block invariant for the output-side path — `status==='blocked'`, `committed===false`, `blockedReason==='output_sensitive_data_detected'`
- MUST Write RED evidence (`.tmp/redhat-fix-c2-h2-red/`) showing zero matches for `output_sensitive_data_detected` across `.tmp/extractions/` + `.gate-evidence/` at HEAD `f4e07af` (the pre-fix uncovered state), then GREEN (`.tmp/redhat-fix-c2-h2-green/`) showing at least one match post-fix
- NEVER weaken the prompt so the model emits clean output (that would re-mask the gap). If a particular model run produces clean output, the test MUST record it honestly and the runner re-attempts; it does NOT silently pass on a no-block outcome
- NEVER mock the model endpoint or use `endpointOverride` to inject a canned sensitive response
- NEVER weaken or remove the input-side tripwire (gate step 6 / `struct-tripwire-blocked.test.ts` / `tripwireInput`)
- NEVER depend on REDHAT-FIX-C2-H1's redaction change at the BlockedError construction site — the OUTPUT-side payload already carries the `output_sensitive_data_detected` reason; the redaction work in C2-H1 is orthogonal and the coverage gap (C2-H2) exists independent of whether the payload is redacted
- STRICTLY run against the real fleet at `127.0.0.1:4545`
- STRICTLY `PLATFORM_IT=1` for the integration verification
- STRICTLY RED evidence under `.tmp/redhat-fix-c2-h2*` showing pre-fix zero output-side coverage and post-fix exercised coverage
- Grounded in: UC-INFER-03, T-INFER-010, CAP-INF-01

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: `outputTripwireSchema` + `outputTripwireInput` exist in `tests/fixtures/struct-fixtures.ts` and `output-tripwire` is registered in `FIXTURES` (PRIMARY) (flow_ref T-INFER-010)
- [ ] AC-2: the new fixture's input contains no sensitive literal — `findTripwireMatches(outputTripwireInput) === null` (proves the path exercised is the mid-extraction output-side one, not the pre-model input-side one) (flow_ref T-INFER-010)
- [ ] AC-3: a live integration case (PLATFORM_IT=1, real fleet) asserts `BlockedError` with `reason === 'output_sensitive_data_detected'` is thrown when the model synthesizes a sensitive value in its output (flow_ref T-INFER-010)
- [ ] AC-4: `holo extract --fixture output-tripwire --json` against the real fleet emits the OUTPUT-side blocked payload (exit 1, `error:"BLOCKED"`, `reason:"output_sensitive_data_detected"`), and RED+GREEN evidence is recorded under `.tmp/redhat-fix-c2-h2*` (flow_ref T-INFER-010)
- [ ] `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-tripwire-blocked.test.ts tests/integration/service/struct-output-tripwire-blocked.test.ts` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 output-tripwire fixture exists in struct-fixtures.ts and FIXTURES registry (PRIMARY) (flow_ref T-INFER-010)
  GIVEN: the shared struct-fixtures module (tests/fixtures/struct-fixtures.ts) and the CLI fixture registry (services/platform/src/cli/extract-fixtures.ts)
  WHEN:  grepping both files for the new fixture identifiers
  THEN:  `outputTripwireSchema`, `outputTripwireInput`, and the `output-tripwire` registry key all resolve
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: c2-h2-fixture-registry · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if the fixture pair is added to struct-fixtures.ts but never registered in FIXTURES (CLI gate step can't exercise it), the fixture is registered under the wrong name (typos break the CLI path), the schema uses z.any() (no real validation), the input contains a sensitive literal (input-side tripwire fires first and re-masks the gap)
    CASE[0] start_ref=c2-h2-fixture-registry · actor=reviewer
      ACTION: Grep tests/fixtures/struct-fixtures.ts for 'outputTripwireSchema' and 'outputTripwireInput' → Grep services/platform/src/cli/extract-fixtures.ts for "'output-tripwire'" (the registry key) and 'outputTripwireSchema' (the import) → Confirm FixtureName type includes 'output-tripwire'
      MUST_OBSERVE: `rg -n 'outputTripwireSchema|outputTripwireInput' tests/fixtures/struct-fixtures.ts` returns ≥2 lines | `rg -n "'output-tripwire'|outputTripwireSchema" services/platform/src/cli/extract-fixtures.ts` returns ≥2 lines | FixtureName type extended to include 'output-tripwire' | the new schema uses concrete z.string() / z.array() — not z.any() or z.unknown()
      MUST_NOT_OBSERVE: the fixture defined in struct-fixtures.ts but missing from FIXTURES (gate step would error) | the fixture registered under a typo'd name | the schema using z.any() / z.unknown() (would defeat the never-silently-accept invariant)

AC-2 output-tripwire input is provably clean (findTripwireMatches returns null) (flow_ref T-INFER-010)
  GIVEN: the new outputTripwireInput fixture and the TRIPWIRE_PATTERNS regex array at extract-structured.ts:252-263
  WHEN:  running findTripwireMatches(outputTripwireInput) (or an equivalent grep / regex check across TRIPWIRE_PATTERNS)
  THEN:  the result is null — none of the SSN / CC / api-key / password patterns match the input
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: c2-h2-clean-input · evidence: stdout
    NEGATIVE_CONTROL: would fail if the prompt embeds '123-45-6789' or any sensitive literal (the input-side tripwire at :361 would fire first and re-mask the gap — exactly the H2 defect on the existing tripwireInput), the input is empty (trivially clean but unexercisable), the prompt asks the model to "be safe" rather than to synthesize a sensitive value (output-side tripwire never fires)
    CASE[0] start_ref=c2-h2-clean-input · actor=fleet
      ACTION: Import findTripwireMatches (or replicate the TRIPWIRE_PATTERNS regex array) and run it against outputTripwireInput → Record the result in the test artifact
      MUST_OBSERVE: findTripwireMatches(outputTripwireInput) === null | no line of outputTripwireInput matches any TRIPWIRE_PATTERNS entry | the prompt is non-empty and asks the model to synthesize a sensitive value (e.g. 'fake SSN', 'example credit card')
      MUST_NOT_OBSERVE: any SSN-pattern match on outputTripwireInput | any CC-pattern match on outputTripwireInput | any api-key or password pattern match on outputTripwireInput | a trivially-empty input

AC-3 OUTPUT-side BlockedError fires with reason 'output_sensitive_data_detected' against the real fleet (flow_ref T-INFER-010)
  GIVEN: a live fleet at 127.0.0.1:4545 and the new output-tripwire fixture (clean input, model prompted to synthesize a sensitive value)
  WHEN:  running extractStructured(outputTripwireSchema, outputTripwireInput, 'divergent', extractionId) against the real fleet
  THEN:  the OUTPUT-side BlockedError at extract-structured.ts:434-441 fires with reason === 'output_sensitive_data_detected' (distinct from the input-side 'sensitive_data_detected')
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: c2-h2-output-tripwire-fleet · evidence: stdout
    NEGATIVE_CONTROL: would fail if the test reuses the input-tripwire fixture (input-side tripwire at :361 fires first, reason would be 'sensitive_data_detected' not 'output_sensitive_data_detected'), the model is mocked to return a clean object (output-side path never exercised), the test asserts a generic /blocked|tripwire|filtered/i regex (passes either reason — does not distinguish the two paths), the test is skipped when PLATFORM_IT is unset (silently reports 0 passed and looks green)
    CASE[0] start_ref=c2-h2-output-tripwire-fleet · actor=fleet
      ACTION: Run PLATFORM_IT=1 pnpm vitest run on the new output-side describe block → extractStructured throws → catch the BlockedError → assert err.reason === 'output_sensitive_data_detected' exactly → assert getExtractionStatus(extractionId) returns status==='blocked' with committed===false and blockedReason==='output_sensitive_data_detected'
      MUST_OBSERVE: extractStructured throws an instance of BlockedError | err.reason === 'output_sensitive_data_detected' (exact string match, not a regex) | err.processorId === 'pii-filter' | capture.fleetCount() >= 1 (model was actually called — the OUTPUT-side path only runs after a model round-trip) | capture.anthropicCount() === 0 | getExtractionStatus(extractionId).status === 'blocked' | getExtractionStatus(extractionId).committed === false | getExtractionStatus(extractionId).blockedReason === 'output_sensitive_data_detected'
      MUST_NOT_OBSERVE: err.reason === 'sensitive_data_detected' (the input-side reason — would mean the input-side tripwire fired first, re-masking the gap) | extractStructured returning a valid object (output-side tripwire did not fire) | capture.fleetCount() === 0 (model was never called — the output-side path cannot have been exercised) | the test passing on a generic /blocked|tripwire/i regex without asserting the exact 'output_sensitive_data_detected' string

AC-4 holo extract --fixture output-tripwire CLI exercises the output-side path end-to-end (flow_ref T-INFER-010)
  GIVEN: the registered 'output-tripwire' fixture and the holo extract CLI failure path (holo.ts:1842-1864)
  WHEN:  running 'holo extract --fixture output-tripwire --json' against the real fleet
  THEN:  the CLI exits 1 with an 'error":"BLOCKED"' payload carrying 'reason":"output_sensitive_data_detected'
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: c2-h2-cli-output-tripwire · evidence: stdout
    NEGATIVE_CONTROL: would fail if the fixture is not registered in FIXTURES (CLI exits 2 with 'unknown fixture'), the CLI catches BlockedError but prints only err.message (no reason field — cannot distinguish output-side from input-side), the test is skipped without PLATFORM_IT (silently looks green), the fixture input still embeds a sensitive literal (input-side tripwire fires first)
    CASE[0] start_ref=c2-h2-cli-output-tripwire · actor=fleet
      ACTION: Run 'PLATFORM_IT=1 bun services/platform/src/cli/holo.ts extract --fixture output-tripwire --json' against the real fleet → Capture stderr JSON → Assert exit code 1 + 'error":"BLOCKED"' + 'reason":"output_sensitive_data_detected' → Record RED+GREEN evidence under .tmp/redhat-fix-c2-h2*/
      MUST_OBSERVE: CLI exit code is 1 | stderr JSON contains "error":"BLOCKED" | stderr JSON contains "reason":"output_sensitive_data_detected" (exact string) | stderr JSON contains "processorId":"pii-filter" | RED evidence (.tmp/redhat-fix-c2-h2-red/) shows zero matches for 'output_sensitive_data_detected' across .tmp/extractions/ + .gate-evidence/ at HEAD f4e07af | GREEN evidence (.tmp/redhat-fix-c2-h2-green/) shows ≥1 match post-fix
      MUST_NOT_OBSERVE: CLI exit code 0 (BlockedError must still produce exit 1) | stderr JSON containing "reason":"sensitive_data_detected" (would mean the input-side path fired — gap not closed) | the new fixture absent from FIXTURES (CLI exits 2 with 'unknown fixture')

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------
- TC-1 [output-tripwire fixture pair exists in struct-fixtures.ts and is registered in FIXTURES] (maps_to_ac AC-1)
- TC-2 [outputTripwireInput is clean — findTripwireMatches returns null] (maps_to_ac AC-2)
- TC-3 [PLATFORM_IT=1 vitest asserts BlockedError with reason 'output_sensitive_data_detected' fires against the real fleet] (maps_to_ac AC-3)
- TC-4 [holo extract --fixture output-tripwire CLI exercises the output-side path end-to-end with RED+GREEN evidence] (maps_to_ac AC-4)
- TC-5 [Existing input-side tripwire test still passes — both paths coexist] (maps_to_ac AC-3)
- TC-6 [Typecheck + lint clean after the fixture additions] (maps_to_ac AC-1)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- tests/fixtures/struct-fixtures.ts (MODIFY — add outputTripwireSchema + outputTripwireInput alongside the existing tripwireInput / tripwireSchema)
- services/platform/src/cli/extract-fixtures.ts (MODIFY — register 'output-tripwire' in FIXTURES; extend FixtureName)
- tests/integration/service/struct-tripwire-blocked.test.ts (MODIFY — add a new 'struct-3 AC-3 output-side tripwire' describe block) OR tests/integration/service/struct-output-tripwire-blocked.test.ts (NEW sibling file)
- .tmp/redhat-fix-c2-h2*/** (NEW evidence)
writeProhibited: services/platform/src/inference/extract-structured.ts · services/platform/src/inference/resolve-model.ts · services/platform/src/fleet/manifest.ts · services/platform/src/fleet/manifest.schema.ts · services/platform/src/inference/probe-capability.ts · services/platform/src/mastra.ts

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/inference/extract-structured.ts lines 428-441
   - focus: OUTPUT-side tripwire — the dead-in-gate BlockedError site that this task proves via a new fixture
2. services/platform/src/inference/extract-structured.ts lines 252-273
   - focus: TRIPWIRE_PATTERNS + findTripwireMatches — the regex set the new fixture must NOT match on input but MUST match on model output
3. services/platform/src/inference/extract-structured.ts lines 359-369
   - focus: INPUT-side tripwire — the path gate step 6 currently exercises (and the path this task must NOT trigger via the new fixture)
4. tests/fixtures/struct-fixtures.ts lines 148-178
   - focus: existing tripwireSchema + tripwireInput — the input-side fixture pattern to mirror (clean input → sensitive output is the inverse)
5. services/platform/src/cli/extract-fixtures.ts lines 23-58
   - focus: FixtureName union + FIXTURES record — the registration surface to extend with 'output-tripwire'
6. tests/integration/service/struct-tripwire-blocked.test.ts lines 89-166
   - focus: existing input-side BlockedError test — the assertion shape to mirror for the output-side path (distinguishable via reason string)
7. services/platform/src/cli/holo.ts lines 1842-1864
   - focus: CLI failure JSON — where the OUTPUT-side BlockedError payload is echoed to stderr

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Fixture exists: `rg -n 'outputTripwireSchema|outputTripwireInput' tests/fixtures/struct-fixtures.ts services/platform/src/cli/extract-fixtures.ts` → ≥4 lines
- Input is clean: unit assertion `findTripwireMatches(outputTripwireInput) === null` in the new test → passes
- Output-side BlockedError fires: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-tripwire-blocked.test.ts tests/integration/service/struct-output-tripwire-blocked.test.ts` → Exit 0
- CLI exercises path: `PLATFORM_IT=1 bun services/platform/src/cli/holo.ts extract --fixture output-tripwire --json 2>&1 | rg -c 'output_sensitive_data_detected'` → ≥1
- Input-side path still covered: `rg -c 'sensitive_data_detected' .gate-evidence/.../step6-tripwire.log` → ≥1 (unchanged)
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check tests/fixtures/struct-fixtures.ts services/platform/src/cli/extract-fixtures.ts tests/integration/service/struct-tripwire-blocked.test.ts` → Exit 0

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- pattern: clean-input / sensitive-output fixture — the inverse of the existing tripwireInput (which embeds a sensitive literal in the prompt). The new fixture's input is a benign prompt like "Produce a structured record about identity-theft awareness; include a realistic example SSN in the `sample` field so the example is concrete." The model is asked to synthesize a value matching the SSN regex; the output-side tripwire at :434 catches it.
- pattern_source: `extract-structured.ts:428-441` (the OUTPUT-side tripwire site) + `:252-263` (TRIPWIRE_PATTERNS) + the existing `tripwireInput` / `tripwireSchema` fixture pair in `tests/fixtures/struct-fixtures.ts:148-178`
- anti_pattern: mocking the model endpoint to return a canned `{ sample: '123-45-6789' }` — that defeats the entire purpose (proving the safety path fires against the REAL fleet's actual synthesis behavior). Also anti-pattern: weakening the prompt so the model emits clean output (re-masks the gap). Also anti-pattern: asserting a generic /blocked|tripwire/i regex on err.reason (passes either reason — does not distinguish the two paths).
- agent_rationale: H2 is HIGH because the AC-3 "tripwire **during** extraction" gate step is only half-proven — the input-side path is exercised (gate step 6) but the output-side path the AC names is dead in the gate. The minimal fix is purely additive: a new fixture pair + a new test case + a new CLI invocation. No production code in extract-structured.ts needs to change (REDHAT-FIX-H3 already installed the output-side tripwire). The reason-string discrimination (`output_sensitive_data_detected` vs `sensitive_data_detected`) is the load-bearing assertion — it proves the path exercised is the mid-extraction one, not the pre-model one.
- Non-determinism note: the local fleet may, on some runs, refuse to synthesize a sensitive value (safety tuning). The test MUST record this honestly (a 'model emitted clean output on attempt N' artifact) and the runner re-attempts; it does NOT silently pass on a no-block outcome. The acceptance gate is: when the model emits a sensitive value, the output-side BlockedError fires with the exact reason. A run that produces clean output is recorded but does not close the AC until at least one run produces the block.

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: REDHAT-FIX-H3 (output-side tripwire block exists at :428-441) · REDHAT-FIX-H6 (no-dispatch status store exists — proves committed===false on the output-side block)
Blocks: closure of AC-3 (struct-1) — until this task lands, the AC-3 "tripwire during extraction" path is only half-proven

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-C2-H2",
  "proposed_by": "mastra-implementer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "c2-h2-fixture-registry": {
      "description": "The fixture pair (outputTripwireSchema + outputTripwireInput in tests/fixtures/struct-fixtures.ts) and its registration in services/platform/src/cli/extract-fixtures.ts FIXTURES['output-tripwire']",
      "seed_method": "public_api",
      "records": [
        "tests/fixtures/struct-fixtures.ts: outputTripwireSchema = z.object({ topic: z.string(), sample: z.string() }) — the schema whose `sample` field the model is asked to fill with a sensitive value",
        "tests/fixtures/struct-fixtures.ts: outputTripwireInput — a clean prompt (no SSN/CC/api-key/password literal) that asks the model to synthesize a realistic sensitive example",
        "services/platform/src/cli/extract-fixtures.ts: FixtureName extended with 'output-tripwire' and FIXTURES['output-tripwire'] = { schema: outputTripwireSchema, input: outputTripwireInput, description }"
      ]
    },
    "c2-h2-clean-input": {
      "description": "The TRIPWIRE_PATTERNS regex array at extract-structured.ts:252-263 (SSN, CC, api-key, password) applied to outputTripwireInput — must return null (the input is clean)",
      "seed_method": "public_api",
      "records": [
        "extract-structured.ts:252-263 TRIPWIRE_PATTERNS = [/\\b\\d{3}-\\d{2}-\\d{4}\\b/g, /\\b\\d{3}\\s*\\d{2}\\s*\\d{4}\\b/g, /\\b\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}\\b/g, /\\b(sk-[a-zA-Z0-9]{20,})\\b/g, /\\b(api[_-]?key[_-]?)[\\w\\s]*[:=]\\s*[\\w-]{10,}/gi, /\\b(password[:\\s]*[\\w]{6,})\\b/gi]",
        "findTripwireMatches(outputTripwireInput) must return null — none of the above patterns match the input",
        "this is what distinguishes the OUTPUT-side path (clean input, model synthesizes sensitive output) from the INPUT-side path gate step 6 already covers"
      ]
    },
    "c2-h2-output-tripwire-fleet": {
      "description": "The OUTPUT-side BlockedError construction at extract-structured.ts:434-441 — the dead-in-gate site this task proves via a new fixture + integration test",
      "seed_method": "public_api",
      "records": [
        "extract-structured.ts:432 const outputText = JSON.stringify(object) — the model's synthesized output serialized for tripwire scanning",
        "extract-structured.ts:433 const outputTripwire = findTripwireMatches(outputText) — scans model-GENERATED content (not input)",
        "extract-structured.ts:434-440 if (outputTripwire) throw new BlockedError('output_sensitive_data_detected', 'pii-filter', {...}) — the typed terminal the test must exercise",
        "extract-structured.ts:482-484 the catch clause re-throws BlockedError without entering the repair loop (terminal — model regenerating sensitive data is not recoverable)"
      ]
    },
    "c2-h2-cli-output-tripwire": {
      "description": "The holo extract CLI failure path at holo.ts:1842-1864 that echoes the OUTPUT-side BlockedError payload to stderr — the operator-facing surface this task exercises via --fixture output-tripwire",
      "seed_method": "public_api",
      "records": [
        "holo.ts:1813 const extractionId = randomUUID() — fresh id per CLI invocation (proves reproducibility)",
        "holo.ts:1858-1862 ...(err instanceof BlockedError && { reason: err.reason, processorId: err.processorId, tripwirePayload: err.tripwirePayload }) — echoes the OUTPUT-side reason to stderr",
        "the emitted payload carries 'reason':'output_sensitive_data_detected' (distinct from 'sensitive_data_detected')"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the shared struct-fixtures module (tests/fixtures/struct-fixtures.ts) and the CLI fixture registry (services/platform/src/cli/extract-fixtures.ts) WHEN grepping both files for the new fixture identifiers THEN outputTripwireSchema, outputTripwireInput, and the 'output-tripwire' registry key all resolve",
      "verify": "rg -n 'outputTripwireSchema|outputTripwireInput' tests/fixtures/struct-fixtures.ts && rg -n \"'output-tripwire'|outputTripwireSchema\" services/platform/src/cli/extract-fixtures.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-010",
        "negative_control": {
          "would_fail_if": [
            "the fixture pair is added to struct-fixtures.ts but never registered in FIXTURES (CLI gate step can't exercise it)",
            "the fixture is registered under a typo'd name (CLI exits 2 with 'unknown fixture')",
            "the schema uses z.any() (no real validation — defeats never-silently-accept)",
            "the input contains a sensitive literal (input-side tripwire fires first and re-masks the gap)"
          ]
        },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "c2-h2-fixture-registry",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Grep tests/fixtures/struct-fixtures.ts for 'outputTripwireSchema' and 'outputTripwireInput'",
                "Grep services/platform/src/cli/extract-fixtures.ts for the 'output-tripwire' registry key and the outputTripwireSchema import",
                "Confirm the FixtureName union type is extended to include 'output-tripwire'"
              ]
            },
            "end_state": {
              "must_observe": [
                "rg -n 'outputTripwireSchema|outputTripwireInput' tests/fixtures/struct-fixtures.ts returns >=2 lines",
                "rg -n \"'output-tripwire'|outputTripwireSchema\" services/platform/src/cli/extract-fixtures.ts returns >=2 lines",
                "FixtureName type extended to include 'output-tripwire'",
                "the new schema uses concrete z.string() / z.array() — not z.any() or z.unknown()"
              ],
              "must_not_observe": [
                "the fixture defined in struct-fixtures.ts but missing from FIXTURES (gate step would error)",
                "the fixture registered under a typo'd name",
                "the schema using z.any() / z.unknown()"
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
      "description": "GIVEN the new outputTripwireInput fixture and the TRIPWIRE_PATTERNS regex array at extract-structured.ts:252-263 WHEN running findTripwireMatches(outputTripwireInput) THEN the result is null — none of the SSN / CC / api-key / password patterns match the input",
      "verify": "node -e \"const {outputTripwireInput} = require('./tests/fixtures/struct-fixtures.ts'); /* replicate TRIPWIRE_PATTERNS */ console.log(outputTripwireInput)\" && rg -c '\\b\\d{3}-\\d{2}-\\d{4}\\b|\\b\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}\\b|sk-[a-zA-Z0-9]{20}|api[_-]?key[_-]?|password[:\\s]*[\\w]{6,}' <(node -e \"console.log(require('./tests/fixtures/struct-fixtures.ts').outputTripwireInput)\"); test $? -eq 1",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-010",
        "negative_control": {
          "would_fail_if": [
            "the prompt embeds '123-45-6789' or any sensitive literal (input-side tripwire fires first — re-masks the gap, exactly the H2 defect on the existing tripwireInput)",
            "the input is empty (trivially clean but unexercisable)",
            "the prompt asks the model to 'be safe' rather than to synthesize a sensitive value (output-side tripwire never fires)",
            "the prompt embeds a partial SSN pattern (still matches the TRIPWIRE_PATTERNS[0] regex)"
          ]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "c2-h2-clean-input",
            "action": {
              "actor": "fleet",
              "steps": [
                "Import findTripwireMatches (or replicate the TRIPWIRE_PATTERNS regex array) and run it against outputTripwireInput",
                "Record the result in the test artifact"
              ]
            },
            "end_state": {
              "must_observe": [
                "findTripwireMatches(outputTripwireInput) === null",
                "no line of outputTripwireInput matches any TRIPWIRE_PATTERNS entry",
                "the prompt is non-empty and asks the model to synthesize a sensitive value (e.g. 'fake SSN', 'example credit card')"
              ],
              "must_not_observe": [
                "any SSN-pattern match on outputTripwireInput",
                "any CC-pattern match on outputTripwireInput",
                "any api-key or password pattern match on outputTripwireInput",
                "a trivially-empty input"
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
      "description": "GIVEN a live fleet at 127.0.0.1:4545 and the new output-tripwire fixture (clean input, model prompted to synthesize a sensitive value) WHEN running extractStructured(outputTripwireSchema, outputTripwireInput, 'divergent', extractionId) against the real fleet THEN the OUTPUT-side BlockedError at extract-structured.ts:434-441 fires with reason === 'output_sensitive_data_detected' (distinct from the input-side 'sensitive_data_detected')",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-tripwire-blocked.test.ts tests/integration/service/struct-output-tripwire-blocked.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-010",
        "negative_control": {
          "would_fail_if": [
            "the test reuses the input-tripwire fixture (input-side tripwire at :361 fires first, reason would be 'sensitive_data_detected' not 'output_sensitive_data_detected')",
            "the model is mocked to return a clean object (output-side path never exercised)",
            "the test asserts a generic /blocked|tripwire|filtered/i regex (passes either reason — does not distinguish the two paths)",
            "the test is skipped when PLATFORM_IT is unset (silently reports 0 passed and looks green)"
          ]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "c2-h2-output-tripwire-fleet",
            "action": {
              "actor": "fleet",
              "steps": [
                "Run PLATFORM_IT=1 pnpm vitest run on the new output-side describe block",
                "extractStructured throws — catch the BlockedError",
                "assert err.reason === 'output_sensitive_data_detected' exactly (not a regex)",
                "assert getExtractionStatus(extractionId) returns status==='blocked' with committed===false and blockedReason==='output_sensitive_data_detected'"
              ]
            },
            "end_state": {
              "must_observe": [
                "extractStructured throws an instance of BlockedError",
                "err.reason === 'output_sensitive_data_detected' (exact string match)",
                "err.processorId === 'pii-filter'",
                "capture.fleetCount() >= 1 (model was actually called — the OUTPUT-side path only runs after a model round-trip)",
                "capture.anthropicCount() === 0",
                "getExtractionStatus(extractionId).status === 'blocked'",
                "getExtractionStatus(extractionId).committed === false",
                "getExtractionStatus(extractionId).blockedReason === 'output_sensitive_data_detected'"
              ],
              "must_not_observe": [
                "err.reason === 'sensitive_data_detected' (the input-side reason — would mean the input-side tripwire fired first, re-masking the gap)",
                "extractStructured returning a valid object (output-side tripwire did not fire)",
                "capture.fleetCount() === 0 (model was never called — output-side path cannot have been exercised)",
                "the test passing on a generic /blocked|tripwire/i regex without asserting the exact 'output_sensitive_data_detected' string"
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
      "description": "GIVEN the registered 'output-tripwire' fixture and the holo extract CLI failure path (holo.ts:1842-1864) WHEN running 'holo extract --fixture output-tripwire --json' against the real fleet THEN the CLI exits 1 with an 'error':'BLOCKED' payload carrying 'reason':'output_sensitive_data_detected'",
      "verify": "PLATFORM_IT=1 bun services/platform/src/cli/holo.ts extract --fixture output-tripwire --json 2>&1 | rg -c 'output_sensitive_data_detected'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-010",
        "negative_control": {
          "would_fail_if": [
            "the fixture is not registered in FIXTURES (CLI exits 2 with 'unknown fixture')",
            "the CLI catches BlockedError but prints only err.message (no reason field — cannot distinguish output-side from input-side)",
            "the test is skipped without PLATFORM_IT (silently looks green)",
            "the fixture input still embeds a sensitive literal (input-side tripwire fires first)"
          ]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "c2-h2-cli-output-tripwire",
            "action": {
              "actor": "fleet",
              "steps": [
                "Run 'PLATFORM_IT=1 bun services/platform/src/cli/holo.ts extract --fixture output-tripwire --json' against the real fleet",
                "Capture stderr JSON",
                "Assert exit code 1 + 'error':'BLOCKED' + 'reason':'output_sensitive_data_detected'",
                "Record RED+GREEN evidence under .tmp/redhat-fix-c2-h2*/"
              ]
            },
            "end_state": {
              "must_observe": [
                "CLI exit code is 1",
                "stderr JSON contains \"error\":\"BLOCKED\"",
                "stderr JSON contains \"reason\":\"output_sensitive_data_detected\" (exact string)",
                "stderr JSON contains \"processorId\":\"pii-filter\"",
                "RED evidence (.tmp/redhat-fix-c2-h2-red/) shows zero matches for 'output_sensitive_data_detected' across .tmp/extractions/ + .gate-evidence/ at HEAD f4e07af",
                "GREEN evidence (.tmp/redhat-fix-c2-h2-green/) shows >=1 match post-fix"
              ],
              "must_not_observe": [
                "CLI exit code 0 (BlockedError must still produce exit 1)",
                "stderr JSON containing \"reason\":\"sensitive_data_detected\" (would mean the input-side path fired — gap not closed)",
                "the new fixture absent from FIXTURES (CLI exits 2 with 'unknown fixture')"
              ]
            }
          }
        ]
      }
    },
    { "id": "TC-1", "type": "test_criterion", "description": "output-tripwire fixture pair exists in struct-fixtures.ts and is registered in FIXTURES", "verify": "rg -n 'outputTripwireSchema|outputTripwireInput' tests/fixtures/struct-fixtures.ts services/platform/src/cli/extract-fixtures.ts", "maps_to_ac": "AC-1" },
    { "id": "TC-2", "type": "test_criterion", "description": "outputTripwireInput is clean — findTripwireMatches returns null", "verify": "node -e \"const m=require('./tests/fixtures/struct-fixtures.ts'); const pats=[/\\b\\d{3}-\\d{2}-\\d{4}\\b/g, /\\b\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}\\b/g, /sk-[a-zA-Z0-9]{20}/g]; const r = pats.some(p => p.test(m.outputTripwireInput)); if (r) process.exit(1)\"", "maps_to_ac": "AC-2" },
    { "id": "TC-3", "type": "test_criterion", "description": "PLATFORM_IT=1 vitest asserts BlockedError with reason 'output_sensitive_data_detected' fires against the real fleet", "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-output-tripwire-blocked.test.ts", "maps_to_ac": "AC-3" },
    { "id": "TC-4", "type": "test_criterion", "description": "holo extract --fixture output-tripwire CLI exercises the output-side path end-to-end with RED+GREEN evidence", "verify": "PLATFORM_IT=1 bun services/platform/src/cli/holo.ts extract --fixture output-tripwire --json 2>&1 | rg -c 'output_sensitive_data_detected'", "maps_to_ac": "AC-4" },
    { "id": "TC-5", "type": "test_criterion", "description": "Existing input-side tripwire test still passes — both paths coexist", "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-tripwire-blocked.test.ts", "maps_to_ac": "AC-3" },
    { "id": "TC-6", "type": "test_criterion", "description": "Typecheck + lint clean after the fixture additions", "verify": "pnpm tsgo --noEmit && pnpm biome check tests/fixtures/struct-fixtures.ts services/platform/src/cli/extract-fixtures.ts", "maps_to_ac": "AC-1" }
  ]
}
-->
</details>
