# REDHAT-FIX-G-STEP3-4 — Add documented CLI fixture entry points for malformed-once and always-malformed scenarios

## What this does

The `holo extract` command accepts `--fixture <name>` which loads a named scenario (malformed-once or always-malformed) from tests/fixtures/struct-fixtures.ts and feeds it through the real extractStructured pipeline. SPRINT.md gate steps 3-4 are now executable exactly as documented via the operator CLI.

Provides: CLI flag → fixture loader (name → {schema, input} from struct-fixtures.ts) → extractStructured(schema, input, role, extractionId) → existing pipeline. The fixture loader is a thin map, not a copy..

## Why

- MUST Add a `--fixture <name>` flag to the `holo extract` command in services/platform/src/cli/holo.ts — accepted values: `malformed-once`, `always-malformed` (and the existing `simple` path continues to work via `--schema`/`--input`)
- MUST Load the named fixture (schema + input pair) from tests/fixtures/struct-fixtures.ts — the fixtures ALREADY EXIST (simpleSchema, malformedOnceInput, alwaysFailingSchema, alwaysMalformedInput); expose them via the CLI rather than duplicating
- MUST Feed the fixture through the REAL extractStructured pipeline (same code path as `--schema`/`--input`) — no shortcut, no mock, no bypass of the repair loop or Zod validation
- MUST Make `holo extract --fixture malformed-once` exit 0 with a Zod-valid object (repair loop exercises, then succeeds) and `holo extract --fixture always-malformed` exit 1 with code EXTRACTION_FAILED (repair exhausts)
- MUST Write RED evidence FIRST: a CLI test that runs `holo extract --fixture malformed-once` and FAILS because the flag does not exist yet (CommanderError / exit 2 unknown flag)
- NEVER Mock the fleet, the model, or extractStructured in the CLI fixture path — the fixture feeds REAL input through the REAL pipeline against the REAL fleet
- NEVER Duplicate the fixture schemas/inputs into holo.ts — import from tests/fixtures/struct-fixtures.ts (single source of truth)
- NEVER Accept `--fixture` as a silent alias for `--schema` — the fixture carries BOTH schema and input as a named pair; `--fixture` is mutually exclusive with `--schema`/`--input`
- STRICTLY Run against the real fleet at :4545 — PLATFORM_IT=1 for all integration tests
- STRICTLY `holo extract --fixture malformed-once` must reproduce SPRINT.md gate step 3 EXACTLY as documented; `holo extract --fixture always-malformed` must reproduce gate step 4 EXACTLY

## How to verify

- PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-fixture-cli.test.ts → Exit 0
- rg -c 'struct-fixtures' services/platform/src/cli/holo.ts → >= 1 (or extract-fixtures.ts loader)
- rg -c 'malformedOnceInput|alwaysMalformedInput' services/platform/src/cli/holo.ts → 0 (no duplication)
- pnpm tsgo --noEmit → Exit 0
- pnpm biome check . → Exit 0

## Scope

Writes: services/platform/src/cli/holo.ts (MODIFY — add --fixture flag to parseArgs + extract case; import fixtures from struct-fixtures.ts; add mutual-exclusivity check) · services/platform/src/cli/extract-fixtures.ts (NEW — thin loader mapping fixture names to {schema, input} pairs from tests/fixtures/struct-fixtures.ts; avoids importing test-only paths directly into prod CLI) · tests/integration/service/struct-fixture-cli.test.ts (NEW — CLI integration test running real holo extract --fixture subprocess against real fleet) · .tmp/redhat-fix-g-step3-4*/** (NEW evidence)

Prohibited: services/platform/src/fleet/manifest.ts · services/platform/src/fleet/manifest.schema.ts · services/platform/src/inference/resolve-model.ts · services/platform/src/inference/extract-structured.ts · services/platform/src/inference/probe-capability.ts · services/platform/src/mastra.ts

<details>
<summary>▾ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-G-STEP3-4 — Add documented CLI fixture entry points for malformed-once and always-malformed scenarios
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (90 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-reviewer
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
The `holo extract` command accepts `--fixture <name>` which loads a named scenario (malformed-once or always-malformed) from tests/fixtures/struct-fixtures.ts and feeds it through the real extractStructured pipeline. SPRINT.md gate steps 3-4 are now executable exactly as documented via the operator CLI.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Add a `--fixture <name>` flag to the `holo extract` command in services/platform/src/cli/holo.ts — accepted values: `malformed-once`, `always-malformed` (and the existing `simple` path continues to work via `--schema`/`--input`)
- MUST Load the named fixture (schema + input pair) from tests/fixtures/struct-fixtures.ts — the fixtures ALREADY EXIST (simpleSchema, malformedOnceInput, alwaysFailingSchema, alwaysMalformedInput); expose them via the CLI rather than duplicating
- MUST Feed the fixture through the REAL extractStructured pipeline (same code path as `--schema`/`--input`) — no shortcut, no mock, no bypass of the repair loop or Zod validation
- MUST Make `holo extract --fixture malformed-once` exit 0 with a Zod-valid object (repair loop exercises, then succeeds) and `holo extract --fixture always-malformed` exit 1 with code EXTRACTION_FAILED (repair exhausts)
- MUST Write RED evidence FIRST: a CLI test that runs `holo extract --fixture malformed-once` and FAILS because the flag does not exist yet (CommanderError / exit 2 unknown flag)
- NEVER Mock the fleet, the model, or extractStructured in the CLI fixture path — the fixture feeds REAL input through the REAL pipeline against the REAL fleet
- NEVER Duplicate the fixture schemas/inputs into holo.ts — import from tests/fixtures/struct-fixtures.ts (single source of truth)
- NEVER Accept `--fixture` as a silent alias for `--schema` — the fixture carries BOTH schema and input as a named pair; `--fixture` is mutually exclusive with `--schema`/`--input`
- STRICTLY Run against the real fleet at :4545 — PLATFORM_IT=1 for all integration tests
- STRICTLY `holo extract --fixture malformed-once` must reproduce SPRINT.md gate step 3 EXACTLY as documented; `holo extract --fixture always-malformed` must reproduce gate step 4 EXACTLY

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: `holo extract --fixture malformed-once` runs against the real fleet, exercises the repair loop, and exits 0 with a Zod-valid object (flow_ref T-INFER-008)
- [ ] AC-2: `holo extract --fixture always-malformed` runs against the real fleet, exhausts the repair loop, and exits 1 with code EXTRACTION_FAILED and attempts=3 (flow_ref T-INFER-008)
- [ ] AC-3: `--fixture` is mutually exclusive with `--schema`/`--input`; providing both exits 2 with a clear error (flow_ref T-INFER-010)
- [ ] AC-4: fixtures are imported from tests/fixtures/struct-fixtures.ts (single source of truth) — zero schema/input duplication in holo.ts (flow_ref T-INFER-010)
- [ ] PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-fixture-cli.test.ts green + pnpm tsgo --noEmit clean + pnpm biome check . clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 GIVEN the holo CLI at services/platform/src/cli/holo.ts WHEN running `holo extract --fixture malformed-once` against the real fleet THEN the command loads the malformedOnceInput + simpleSchema fixture from struct-fixtures.ts, feeds it through the real extractStructured pipeline, the repair loop exercises, and the command exits 0 with a Zod-valid {title, count, tags} object (PRIMARY) (flow_ref T-INFER-008)
  GIVEN: the holo extract command after adding --fixture support, with the real fleet running at :4545
  WHEN:  running `holo extract --fixture malformed-once --json`
  THEN:  exit 0; JSON output has ok:true, result matches simpleSchema ({title:string, count:number, tags:string[]}), extractionId present; the repair loop was exercised (fleetCount >= 1)
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: holo-cli-extract-command · evidence: stdout
    NEGATIVE_CONTROL: would fail if the --fixture flag is not implemented (CommanderError unknown flag), the fixture path mocks extractStructured instead of calling the real pipeline, the command exits 1 despite the model returning valid output after repair, the schema is duplicated inline rather than imported from struct-fixtures.ts, the fleet is mocked (fleetCount == 0)
    CASE start_ref=holo-cli-extract-command · actor=fleet
      ACTION: Start the real fleet at :4545 (PLATFORM_IT=1)
      ACTION: Run `holo extract --fixture malformed-once --json` via the real CLI subprocess
      ACTION: Parse the JSON stdout
      ACTION: Assert exit 0 and ok:true and result matches {title, count, tags} shape
      MUST_OBSERVE: exit code == 0 | stdout JSON contains 'ok': true | result object has title (string), count (number), tags (array of strings) | extractionId is present in output
      MUST_NOT_OBSERVE: exit code == 2 (unknown flag — the RED state) | ok: false | result is free-text or missing fields | error: EXTRACTION_FAILED

AC-2 GIVEN the holo CLI WHEN running `holo extract --fixture always-malformed` against the real fleet THEN the command loads the alwaysFailingSchema + alwaysMalformedInput fixture, feeds it through the real extractStructured pipeline, the repair loop exhausts at MAX_REPAIR_ATTEMPTS=3, and the command exits 1 with code EXTRACTION_FAILED and attempts=3 (flow_ref T-INFER-008)
  GIVEN: the holo extract command after adding --fixture support, with the real fleet running at :4545
  WHEN:  running `holo extract --fixture always-malformed --json`
  THEN:  exit 1; JSON output has ok:false, error:EXTRACTION_FAILED, attempts:3; no committed row (the extraction status shows extraction_failed)
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: holo-cli-extract-command · evidence: stdout
    NEGATIVE_CONTROL: would fail if the --fixture flag is not implemented, the always-malformed fixture silently accepts invalid output (no ExtractionFailedError), the repair loop is unbounded (attempts > 3), the fixture path bypasses Zod validation, the fleet is mocked
    CASE start_ref=holo-cli-extract-command · actor=fleet
      ACTION: Start the real fleet at :4545 (PLATFORM_IT=1)
      ACTION: Run `holo extract --fixture always-malformed --json` via the real CLI subprocess
      ACTION: Parse the JSON stderr/stdout
      ACTION: Assert exit 1 and error:EXTRACTION_FAILED and attempts:3
      MUST_OBSERVE: exit code == 1 | JSON error contains 'error': 'EXTRACTION_FAILED' | JSON error contains 'attempts': 3 | schemaErrors array present (3 entries)
      MUST_NOT_OBSERVE: exit code == 0 (silently accepted invalid output) | exit code == 2 (unknown flag — the RED state) | attempts > 3 (unbounded loop) | ok: true

AC-3 GIVEN the holo extract command WHEN providing both --fixture and --schema (or --input) THEN the command exits 2 with a clear error message stating they are mutually exclusive (flow_ref T-INFER-010)
  GIVEN: the holo extract command after adding --fixture with mutual-exclusivity validation
  WHEN:  running `holo extract --fixture malformed-once --schema simple --input good`
  THEN:  exit 2; stderr states --fixture is mutually exclusive with --schema/--input
  TEST_TIER: integration · VERIFICATION_SERVICE: local-cli · TDD_STATE: red→green
  SCENARIO — start_ref: holo-cli-extract-command · evidence: stdout
    NEGATIVE_CONTROL: would fail if no mutual-exclusivity check (--fixture silently overrides --schema), the command proceeds with both flags without error, the error message is unclear
    CASE start_ref=holo-cli-extract-command · actor=reviewer
      ACTION: Run `holo extract --fixture malformed-once --schema simple --input good`
      ACTION: Assert exit 2 and stderr mentions 'mutually exclusive'
      MUST_OBSERVE: exit code == 2 | stderr contains 'mutually exclusive'
      MUST_NOT_OBSERVE: exit code == 0 or 1 (proceeded with both flags) | no error message

AC-4 GIVEN holo.ts and tests/fixtures/struct-fixtures.ts WHEN grepping for the fixture schemas/inputs in holo.ts THEN zero duplicates — the fixture definitions are imported from struct-fixtures.ts (single source of truth) (flow_ref T-INFER-010)
  GIVEN: holo.ts after the --fixture implementation
  WHEN:  grepping for the inline schema definitions (simpleSchema, alwaysFailingSchema) or input strings (malformedOnceInput, alwaysMalformedInput) in holo.ts
  THEN:  zero inline duplicates; holo.ts imports from tests/fixtures/struct-fixtures.ts
  TEST_TIER: integration · VERIFICATION_SERVICE: local-shell · TDD_STATE: red→green
  SCENARIO — start_ref: holo-cli-extract-command · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if the schema/input definitions are copy-pasted into holo.ts, struct-fixtures.ts is not imported by holo.ts
    CASE start_ref=holo-cli-extract-command · actor=reviewer
      ACTION: rg -c 'struct-fixtures' services/platform/src/cli/holo.ts → expect >= 1 (import present)
      ACTION: rg -c 'malformedOnceInput|alwaysMalformedInput' services/platform/src/cli/holo.ts → expect 0 (no inline duplicate of the input strings)
      MUST_OBSERVE: rg count for 'struct-fixtures' in holo.ts >= 1 | rg count for 'malformedOnceInput|alwaysMalformedInput' literal strings in holo.ts == 0 (imported, not duplicated)
      MUST_NOT_OBSERVE: no import of struct-fixtures in holo.ts | inline schema/input definitions duplicated in holo.ts

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------
- TC-1 [holo extract --fixture malformed-once exits 0 with Zod-valid object] (maps_to_ac AC-1)
- TC-2 [holo extract --fixture always-malformed exits 1 with EXTRACTION_FAILED attempts=3] (maps_to_ac AC-2)
- TC-3 [--fixture and --schema are mutually exclusive (exit 2)] (maps_to_ac AC-3)
- TC-4 [Fixtures imported from struct-fixtures.ts (no duplication)] (maps_to_ac AC-4)
- TC-5 [Typecheck and lint clean] (maps_to_ac AC-1)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/cli/holo.ts (MODIFY — add --fixture flag to parseArgs + extract case; import fixtures from struct-fixtures.ts; add mutual-exclusivity check)
- services/platform/src/cli/extract-fixtures.ts (NEW — thin loader mapping fixture names to {schema, input} pairs from tests/fixtures/struct-fixtures.ts; avoids importing test-only paths directly into prod CLI)
- tests/integration/service/struct-fixture-cli.test.ts (NEW — CLI integration test running real holo extract --fixture subprocess against real fleet)
- .tmp/redhat-fix-g-step3-4*/** (NEW evidence)
writeProhibited: services/platform/src/fleet/manifest.ts · services/platform/src/fleet/manifest.schema.ts · services/platform/src/inference/resolve-model.ts · services/platform/src/inference/extract-structured.ts · services/platform/src/inference/probe-capability.ts · services/platform/src/mastra.ts

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/cli/holo.ts 1702-1836
   - focus: The extract case — add --fixture handling before the --schema/--input requirement check; the fixture loads schema+input as a pair and skips the --schema/--input requirement
2. services/platform/src/cli/holo.ts 323-334
   - focus: parseArgs --schema/--input handling — add --fixture alongside (both --fixture <name> and --fixture=<name> forms)
3. tests/fixtures/struct-fixtures.ts 19-131
   - focus: simpleSchema, alwaysFailingSchema, malformedOnceInput, alwaysMalformedInput — the existing fixtures to expose via CLI
4. services/platform/src/inference/extract-structured.ts 1-60
   - focus: extractStructured signature and ExtractionFailedError — the pipeline the fixture feeds into (read-only; not modified)

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-fixture-cli.test.ts → Exit 0
- rg -c 'struct-fixtures' services/platform/src/cli/holo.ts → >= 1 (or extract-fixtures.ts loader)
- rg -c 'malformedOnceInput|alwaysMalformedInput' services/platform/src/cli/holo.ts → 0 (no duplication)
- pnpm tsgo --noEmit → Exit 0
- pnpm biome check . → Exit 0

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- pattern: CLI flag → fixture loader (name → {schema, input} from struct-fixtures.ts) → extractStructured(schema, input, role, extractionId) → existing pipeline. The fixture loader is a thin map, not a copy.
- pattern_source: holo.ts extract case (line 1702-1836) existing --schema/--input pattern; struct-fixtures.ts existing fixture definitions
- anti_pattern: copy-pasting the schema/input definitions into holo.ts (violates DRY — struct-fixtures.ts is the single source of truth); mocking extractStructured in the fixture path (the fixture must exercise the REAL pipeline)
- agent_rationale: Gate steps 3-4 in SPRINT.md specify `holo extract --fixture malformed-once` and `holo extract --fixture always-malformed` but the CLI has no --fixture flag. The fixtures (schema + input pairs) already exist in tests/fixtures/struct-fixtures.ts. This task exposes them via a CLI flag so the documented human gate steps are runnable exactly as written. The fixture feeds through the REAL extractStructured pipeline (repair loop, Zod validation, typed errors) — no shortcuts.

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: none · Blocks: none

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-G-STEP3-4",
  "proposed_by": "mastra-reviewer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "holo-cli-extract-command": {
      "description": "The holo extract command in holo.ts as it exists today — accepts --schema and --input but has no --fixture flag. This is the start state (RED) for the CLI fixture test.",
      "seed_method": "public_api",
      "records": [
        "services/platform/src/cli/holo.ts extract case at lines 1702-1836",
        "parseArgs has --schema (line 323) and --input (line 327) but NO --fixture flag",
        "tests/fixtures/struct-fixtures.ts exports simpleSchema, alwaysFailingSchema, malformedOnceInput, alwaysMalformedInput",
        "extractStructured pipeline at services/platform/src/inference/extract-structured.ts accepts (schema, input, role, extractionId)"
      ]
    },
    "struct-fixtures-source": {
      "description": "The existing fixture definitions in tests/fixtures/struct-fixtures.ts — the single source of truth for schema + input pairs.",
      "seed_method": "public_api",
      "records": [
        "simpleSchema = z.object({title, count, tags})",
        "alwaysFailingSchema = z.object({title, count: z.number().refine(()=>false), tags})",
        "malformedOnceInput = 'Extract structured data: The Model Returns Bad JSON Once...'",
        "alwaysMalformedInput = 'Extract data from a model that always fails validation...'"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "primary": true,
      "description": "GIVEN the holo CLI at services/platform/src/cli/holo.ts WHEN running `holo extract --fixture malformed-once` against the real fleet THEN the command loads the malformedOnceInput + simpleSchema fixture from struct-fixtures.ts, feeds it through the real extractStructured pipeline, the repair loop exercises, and the command exits 0 with a Zod-valid {title, count, tags} object",
      "given": "the holo extract command after adding --fixture support, with the real fleet running at :4545",
      "when": "running `holo extract --fixture malformed-once --json`",
      "then": "exit 0; JSON output has ok:true, result matches simpleSchema ({title:string, count:number, tags:string[]}), extractionId present; the repair loop was exercised (fleetCount >= 1)",
      "flow_ref": "T-INFER-008",
      "test_tier": "integration",
      "verification_service": "litellm-fleet",
      "tdd_state": "red→green",
      "scenario": {
        "tier": "visible",
        "negative_control": {
          "would_fail_if": [
            "the --fixture flag is not implemented (CommanderError unknown flag)",
            "the fixture path mocks extractStructured instead of calling the real pipeline",
            "the command exits 1 despite the model returning valid output after repair",
            "the schema is duplicated inline rather than imported from struct-fixtures.ts",
            "the fleet is mocked (fleetCount == 0)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "holo-cli-extract-command",
            "action": {
              "actor": "fleet",
              "steps": [
                "Start the real fleet at :4545 (PLATFORM_IT=1)",
                "Run `holo extract --fixture malformed-once --json` via the real CLI subprocess",
                "Parse the JSON stdout",
                "Assert exit 0 and ok:true and result matches {title, count, tags} shape"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code == 0",
                "stdout JSON contains 'ok': true",
                "result object has title (string), count (number), tags (array of strings)",
                "extractionId is present in output"
              ],
              "must_not_observe": [
                "exit code == 2 (unknown flag — the RED state)",
                "ok: false",
                "result is free-text or missing fields",
                "error: EXTRACTION_FAILED"
              ]
            }
          }
        ]
      },
      "type": "acceptance_criterion",
      "maps_to_ac": null
    },
    {
      "id": "AC-2",
      "primary": false,
      "description": "GIVEN the holo CLI WHEN running `holo extract --fixture always-malformed` against the real fleet THEN the command loads the alwaysFailingSchema + alwaysMalformedInput fixture, feeds it through the real extractStructured pipeline, the repair loop exhausts at MAX_REPAIR_ATTEMPTS=3, and the command exits 1 with code EXTRACTION_FAILED and attempts=3",
      "given": "the holo extract command after adding --fixture support, with the real fleet running at :4545",
      "when": "running `holo extract --fixture always-malformed --json`",
      "then": "exit 1; JSON output has ok:false, error:EXTRACTION_FAILED, attempts:3; no committed row (the extraction status shows extraction_failed)",
      "flow_ref": "T-INFER-008",
      "test_tier": "integration",
      "verification_service": "litellm-fleet",
      "tdd_state": "red→green",
      "scenario": {
        "tier": "visible",
        "negative_control": {
          "would_fail_if": [
            "the --fixture flag is not implemented",
            "the always-malformed fixture silently accepts invalid output (no ExtractionFailedError)",
            "the repair loop is unbounded (attempts > 3)",
            "the fixture path bypasses Zod validation",
            "the fleet is mocked"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "holo-cli-extract-command",
            "action": {
              "actor": "fleet",
              "steps": [
                "Start the real fleet at :4545 (PLATFORM_IT=1)",
                "Run `holo extract --fixture always-malformed --json` via the real CLI subprocess",
                "Parse the JSON stderr/stdout",
                "Assert exit 1 and error:EXTRACTION_FAILED and attempts:3"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code == 1",
                "JSON error contains 'error': 'EXTRACTION_FAILED'",
                "JSON error contains 'attempts': 3",
                "schemaErrors array present (3 entries)"
              ],
              "must_not_observe": [
                "exit code == 0 (silently accepted invalid output)",
                "exit code == 2 (unknown flag — the RED state)",
                "attempts > 3 (unbounded loop)",
                "ok: true"
              ]
            }
          }
        ]
      },
      "type": "acceptance_criterion",
      "maps_to_ac": null
    },
    {
      "id": "AC-3",
      "primary": false,
      "description": "GIVEN the holo extract command WHEN providing both --fixture and --schema (or --input) THEN the command exits 2 with a clear error message stating they are mutually exclusive",
      "given": "the holo extract command after adding --fixture with mutual-exclusivity validation",
      "when": "running `holo extract --fixture malformed-once --schema simple --input good`",
      "then": "exit 2; stderr states --fixture is mutually exclusive with --schema/--input",
      "flow_ref": "T-INFER-010",
      "test_tier": "integration",
      "verification_service": "local-cli",
      "tdd_state": "red→green",
      "scenario": {
        "tier": "visible",
        "negative_control": {
          "would_fail_if": [
            "no mutual-exclusivity check (--fixture silently overrides --schema)",
            "the command proceeds with both flags without error",
            "the error message is unclear"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "holo-cli-extract-command",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Run `holo extract --fixture malformed-once --schema simple --input good`",
                "Assert exit 2 and stderr mentions 'mutually exclusive'"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code == 2",
                "stderr contains 'mutually exclusive'"
              ],
              "must_not_observe": [
                "exit code == 0 or 1 (proceeded with both flags)",
                "no error message"
              ]
            }
          }
        ]
      },
      "type": "acceptance_criterion",
      "maps_to_ac": null
    },
    {
      "id": "AC-4",
      "primary": false,
      "description": "GIVEN holo.ts and tests/fixtures/struct-fixtures.ts WHEN grepping for the fixture schemas/inputs in holo.ts THEN zero duplicates — the fixture definitions are imported from struct-fixtures.ts (single source of truth)",
      "given": "holo.ts after the --fixture implementation",
      "when": "grepping for the inline schema definitions (simpleSchema, alwaysFailingSchema) or input strings (malformedOnceInput, alwaysMalformedInput) in holo.ts",
      "then": "zero inline duplicates; holo.ts imports from tests/fixtures/struct-fixtures.ts",
      "flow_ref": "T-INFER-010",
      "test_tier": "integration",
      "verification_service": "local-shell",
      "tdd_state": "red→green",
      "scenario": {
        "tier": "visible",
        "negative_control": {
          "would_fail_if": [
            "the schema/input definitions are copy-pasted into holo.ts",
            "struct-fixtures.ts is not imported by holo.ts"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "holo-cli-extract-command",
            "action": {
              "actor": "reviewer",
              "steps": [
                "rg -c 'struct-fixtures' services/platform/src/cli/holo.ts → expect >= 1 (import present)",
                "rg -c 'malformedOnceInput|alwaysMalformedInput' services/platform/src/cli/holo.ts → expect 0 (no inline duplicate of the input strings)"
              ]
            },
            "end_state": {
              "must_observe": [
                "rg count for 'struct-fixtures' in holo.ts >= 1",
                "rg count for 'malformedOnceInput|alwaysMalformedInput' literal strings in holo.ts == 0 (imported, not duplicated)"
              ],
              "must_not_observe": [
                "no import of struct-fixtures in holo.ts",
                "inline schema/input definitions duplicated in holo.ts"
              ]
            }
          }
        ]
      },
      "type": "acceptance_criterion",
      "maps_to_ac": null
    },
    {
      "id": "TC-1",
      "description": "holo extract --fixture malformed-once exits 0 with Zod-valid object",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-fixture-cli.test.ts -t 'malformed-once'",
      "maps_to_ac": "AC-1",
      "type": "test_criterion"
    },
    {
      "id": "TC-2",
      "description": "holo extract --fixture always-malformed exits 1 with EXTRACTION_FAILED attempts=3",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-fixture-cli.test.ts -t 'always-malformed'",
      "maps_to_ac": "AC-2",
      "type": "test_criterion"
    },
    {
      "id": "TC-3",
      "description": "--fixture and --schema are mutually exclusive (exit 2)",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-fixture-cli.test.ts -t 'mutually exclusive'",
      "maps_to_ac": "AC-3",
      "type": "test_criterion"
    },
    {
      "id": "TC-4",
      "description": "Fixtures imported from struct-fixtures.ts (no duplication)",
      "verify": "rg -c 'struct-fixtures' services/platform/src/cli/holo.ts → >= 1; rg -c 'malformedOnceInput|alwaysMalformedInput' services/platform/src/cli/holo.ts → 0",
      "maps_to_ac": "AC-4",
      "type": "test_criterion"
    },
    {
      "id": "TC-5",
      "description": "Typecheck and lint clean",
      "verify": "pnpm tsgo --noEmit && pnpm biome check .",
      "maps_to_ac": "AC-1",
      "type": "test_criterion"
    }
  ]
}
-->
