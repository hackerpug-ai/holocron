# S31-06: Route extraction through the boot capability probe; stop the manifest advertising unproven capabilities

> **Task ID:** S31-06
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Type:** FEATURE · **Priority:** P0 · **Effort:** M · **Estimate:** 300 min
> **PROPOSED-BY:** `mastra-planner`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> **Status:** Backlog

**Capabilities:** CAP-INF-01
**PRD refs:** UC-INFER-03, UC-INFER-01, R5

## What this does

Makes the boot-time capability probe the actual input to extraction strategy selection, reconciles the Fleet Role Manifest's `structuredOutput` flags against the real fleet, and turns a declared-but-unconfirmable capability into a startup error instead of a silent slide into repair mode.

## Why

`inference/extract-structured.ts` has zero references to `probe-capability` — it reads `resolved.structuredOutput` directly at line 433, so constrained json_schema decode is production-dead and the only non-test importer of the probe is the CLI. The gate's own evidence proves the contradiction: `.gate-evidence/2026-07-17T08-25-00Z/step1.log` reports `"mode": "repair"` for all five roles with 0 of 213 real extractions succeeding at attempts=1, while `fleet/manifest.json:13,30,47` still advertises `structuredOutput: true` for three roles. Either the probe is right and the manifest lies, or the reverse.

## How to verify

- `cd services/platform && bun src/cli/holo.ts probe:capabilities --json` against the live fleet, compared to the committed manifest, yields zero drift across all 5 roles.
- A manifest declaring a capability the probe cannot confirm makes startup exit non-zero with `MANIFEST_CAPABILITY_UNCONFIRMED`.
- `PLATFORM_IT=1 pnpm test:live` passes the probe-driven extraction and fail-closed manifest suites.

## Scope

Touches the inference probe, the extraction strategy selector, the manifest and its schema. The bounded repair loop and its explicit terminal failure are preserved, not removed.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-06 - Route extraction through the boot capability probe
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
AGENT_RATIONALE: The work joins the boot capability probe to the extraction strategy selector and makes the Fleet Role Manifest fail closed at startup, all inside services/platform/src/inference; mastra-implementer owns the role router, resolveModel and the repair loop, and must verify against the live fleet at :4545.
PROPOSED-BY: mastra-planner

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:live
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: AC-1..AC-4 TDD_STATE none · 0/4 complete

--------------------------------------------------------------------------------
OUTCOME (1 sentence, <=30 words — observable success)
--------------------------------------------------------------------------------

Extraction picks its strategy from a live boot probe, and a manifest capability the probe cannot confirm stops the service instead of degrading it.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- NEVER guess the direction of the fix — run the probe against the REAL fleet first and let its captured output decide whether the manifest lies or the earlier gate evidence was produced against a misconfigured fleet.
- NEVER cache the probe result to disk or synthesize it from the manifest; probe-capability.ts makes a real generateObject call on the wire, and its own header forbids a /health proxy or static cache.
- NEVER let the adaptive in-loop fallback substitute for the boot probe — an adaptive downgrade after a failed first attempt still means the manifest advertised a capability the role lacks.
- NEVER silently accept an unvalidated generation; "schema-valid, or an explicit typed failure" is unchanged.
- NEVER mock the fleet, generateObject, or the manifest loader.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] Extraction reads the probe result and a probe-constrained role commits at attempts 1 on the live fleet — maps to AC-1 (PRIMARY)
- [ ] A declared-but-unconfirmable capability makes startup exit non-zero with MANIFEST_CAPABILITY_UNCONFIRMED — maps to AC-2
- [ ] Live probe and committed manifest agree with 0 drift across 5 roles — maps to AC-3
- [ ] A probe-repair role still fails explicitly with EXTRACTION_FAILED and committed false — maps to AC-4
- [ ] PLATFORM_IT=1 pnpm test:live passes + pnpm tsgo --noEmit clean
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: Extraction takes its strategy from the boot probe [PRIMARY]
  GIVEN: a live fleet at :4545 and a boot probe capability map for all 5 roles
  WHEN:  holo extract --role <constrained-role> --json runs through the real entrypoint
  THEN:  the status record names the probe-selected mode and commits at attempts 1

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  fleet
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-probe-driven-extraction.test.ts
  TEST_FUNCTION: extractionConsumesTheBootProbe

  SCENARIO:
    START_REF:        live_fleet_probed
    NEGATIVE_CONTROL: would fail if stub probe | mock fleet | static capability map | empty probe result | disconnect from the fleet
    EVIDENCE:         stdout
    CASES:
      - ACTION:           confirm /v1/models 200, run probe:capabilities --json, pick a constrained role, run extract --role <role> --json, scan extract-structured.ts for the probe module
        MUST_OBSERVE:     5 roles each with a non-null mode · at least 1 role with mode constrained · status record initial mode == the probe mode · attempts 1 and committed true · at least 1 probe reference in extract-structured.ts
        MUST_NOT_OBSERVE: all 5 roles reporting repair while the manifest declares structuredOutput true for 3 · 0 probe-capability references · committed false on the constrained path

AC-2: An unconfirmable declared capability is a startup error
  GIVEN: a manifest declaring structuredOutput true for a role the live probe cannot confirm
  WHEN:  the service is started against that manifest with the fleet reachable
  THEN:  exit non-zero with MANIFEST_CAPABILITY_UNCONFIRMED and no health-ready state

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  fleet
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-manifest-fail-closed.test.ts
  TEST_FUNCTION: manifestFailsClosedOnUnconfirmedCapability

AC-3: The committed manifest matches the real fleet with zero drift
  GIVEN: the live fleet and the reconciled committed manifest
  WHEN:  probe results are compared to the manifest structuredOutput flags
  THEN:  drift is 0 across 5 roles; a deliberately flipped flag yields exactly 1 named entry

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  fleet
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-manifest-fail-closed.test.ts
  TEST_FUNCTION: manifestMatchesLiveFleet

AC-4: Repair-mode roles still fail explicitly past the cap
  GIVEN: a probe-repair role and a prompt/schema pairing the model cannot satisfy
  WHEN:  extraction runs through the real entrypoint
  THEN:  EXTRACTION_FAILED after MAX_REPAIR_ATTEMPTS with committed false and no persisted result

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  fleet
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-probe-driven-extraction.test.ts
  TEST_FUNCTION: repairModeStillFailsExplicitly

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/inference/extract-structured.ts (MODIFY)
- services/platform/src/inference/probe-capability.ts (MODIFY)
- services/platform/src/inference/resolve-model.ts (MODIFY)
- services/platform/fleet/manifest.json (MODIFY)
- services/platform/src/fleet/manifest.ts (MODIFY)
- services/platform/src/fleet/manifest.schema.ts (MODIFY)
- services/platform/src/cli/holo.ts (MODIFY)
- services/platform/tests/integration/sprint31-probe-driven-extraction.test.ts (NEW)
- services/platform/tests/integration/sprint31-manifest-fail-closed.test.ts (NEW)
- .tmp/S31-06/** (NEW)

writeProhibited:
- .spec/prds/mk6-migration/tasks/**/.gate-evidence/** — the 2026-07-17 step1.log recording repair for all 5 roles and 0/213 attempts=1 successes is the evidence this task remediates; rewriting it destroys the record
- convex/** — decommission target; holds no part of the extraction path
- services/platform/src/db/migrations/** — schema changes belong to S31-01 (R26)
- .spec/prds/mk6-migration/** — UC-INFER-01 AC-4 is the constraint, not a negotiable
- Any file not explicitly listed above

--------------------------------------------------------------------------------
BOUNDARIES (✅ Always / ⚠️ Ask First) — Never tier lives at CRITICAL CONSTRAINTS above
--------------------------------------------------------------------------------

✅ Always:
- Run the boot probe once at service start and hold the map in process memory for the process lifetime; never per-extraction, never to disk.
- Pass the probe map explicitly into the extraction path (parameter or typed process-scoped accessor); a module-level mutable global is a review failure.
- Commit the captured probe artifact under .tmp/S31-06/probe/ alongside any manifest flag change that it justifies.
- Log an adaptive in-loop downgrade distinctly from a probe-selected mode, so the two are never indistinguishable.

⚠️ Ask First:
- Flipping any manifest structuredOutput flag — it is a committed artifact and the change must be justified by captured probe output.
- Changing the conservative downgrade when the probe fails because a role endpoint is unreachable (distinct from declared-true / probed-false).

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- services/platform/src/inference/probe-capability.ts (MODIFY): invert the G-ORACLE asymmetry at 154-155 so declared-true / probed-false is an error rather than a silent downgrade (blocker — the boot path and extraction both consume it)
- services/platform/src/inference/extract-structured.ts (MODIFY): initial mode selected from the probe map, not from resolved.structuredOutput
- services/platform/fleet/manifest.json (MODIFY): flags reconciled to the live probe, with the captured artifact as justification
- 2 e2e test files (NEW)

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

TDD_MODE `red_first`. Run the live probe FIRST and capture it as evidence — the result decides the direction of every subsequent change. If the fleet genuinely cannot honour json_schema on divergent/convergent/judge, three manifest flags flip to false. If it can, the earlier gate evidence came from a misconfigured fleet and the probe wiring is the whole fix.

Then: wire the probe into strategy selection → make the manifest fail closed → reconcile flags → keep the repair loop's explicit terminal failure intact.

--------------------------------------------------------------------------------
READING LIST (max 5 files — canonical pattern first)
--------------------------------------------------------------------------------

1. services/platform/src/inference/probe-capability.ts [PRIMARY PATTERN]
   - Lines: 88-179
   - Focus: probeJsonSchemaSupport makes a REAL generateObject call on the wire — the pattern to preserve. probeRoleCapability then ANDs it with resolved.structuredOutput at 154-155, so the manifest can only downgrade the probe and never be contradicted by it; that asymmetry is why an overclaim is invisible today.

2. services/platform/src/inference/extract-structured.ts
   - Lines: 354-470
   - Focus: buildStructuredModel (constrained keeps response_format json_schema on the wire; repair strips it), and the selector at 433 reading resolved.structuredOutput with zero probe references.

3. services/platform/fleet/manifest.json
   - Lines: 1-70
   - Focus: structuredOutput true at 13 (divergent), 30 (convergent) and 47 (judge); false for embed — the three claims to reconcile.

4. .spec/prds/mk6-migration/07-uc-infer.md
   - Sections: UC-INFER-01 AC-4 (line 28), UC-INFER-03 AC-1/AC-2 (lines 48-51)
   - Focus: the fail-closed startup mandate and the requirement that a boot-time per-role probe SELECTS the structuring strategy.

5. services/platform/src/inference/resolve-model.ts
   - Lines: ResolvedModel definition and the structuredOutput carry
   - Focus: how the manifest flag reaches the extraction path today — the seam the probe map replaces.

--------------------------------------------------------------------------------
EVIDENCE GATES (fast/cheap first — fail fast)
--------------------------------------------------------------------------------

Gate 1: RED phase evidence
  Required: the live probe output captured under .tmp/S31-06/probe/ BEFORE any code change, showing the current contradiction.

Gate 2: Each AC has a test
  Verify: the 2 test files contain one test per AC.

Gate 3: All tests pass
  Command: PLATFORM_IT=1 pnpm test:live
  Expected: Exit 0.

Gate 4: Type check
  Command: pnpm tsgo --noEmit
  Expected: Exit 0.

Gate 5: Lint
  Command: pnpm biome check .
  Expected: Exit 0.

Gate 6: Scope compliance
  Command: git diff --name-only
  Expected: Only SCOPE.writeAllowed files modified.

Gate 7: Integration/E2E coverage
  Verify: AC-1 (PRIMARY) is TEST_TIER e2e against the real fleet at :4545.

Gate 8: Scenario is un-fakeable (PRIMARY)
  Verify: validate_scenario.py passes on the embedded contract (exit 0).
  Verify: the artifact shows a schema-valid object at attempts 1 on the wire — the thing the current evidence shows happening 0 of 213 times.
  Reject: a PRIMARY test satisfied by inspecting a mode string rather than a committed extraction.

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- MANIFEST_CAPABILITY_UNCONFIRMED is a typed error carrying role, declaredCapability and probedValue — not a message string.
- The probe map is passed explicitly into the extraction path (parameter or typed process-scoped accessor); a module-level mutable global holding probe state is a review failure.
- Every manifest flag change ships with the captured probe artifact under .tmp/S31-06/probe/ that justifies it.
- Model bindings name roles, never providers; holo verify:no-provider-refs must stay green.
- Reference: brain/docs/mastra/agents-core.md, .spec/prds/mk6-migration/07-uc-infer.md

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Removing the bounded repair loop; this task narrows WHEN repair is used, never whether it exists.
- Instrumenting the probe with telemetry (S31-07 owns the single instrumented fleet client).
- Fleet hardware or LiteLLM routing changes — the fleet is consumed as-is per 01-scope.md.
- Rewriting the historical gate evidence that recorded the contradiction.

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** A real boot probe exists, is tested, and is imported only by the CLI, while production extraction reads the manifest flag directly and adaptively downgrades on failure.

**Gap:** A manifest advertising constrained decode for three roles and a fleet honouring it for none both report green; UC-INFER-01 AC-4 requires that disagreement to stop startup.

--------------------------------------------------------------------------------
REVIEW (for mastra-reviewer)
--------------------------------------------------------------------------------

Must pass (<=5, evidence-gate-backed):
- One test per AC; the constrained path is proven by a committed extraction at attempts 1, not a mode string
- extract-structured.ts references the probe module; the probe map is passed explicitly
- Any manifest flag change is accompanied by its captured probe artifact
- Pattern consistent with READING LIST [PRIMARY PATTERN] (real on-the-wire generateObject probe)
- SCOPE respected (git diff --name-only ⊆ writeAllowed)

Should verify (<=5, judgment):
- MANIFEST_CAPABILITY_UNCONFIRMED is a typed error carrying role, declaredCapability and probedValue
- The probe still runs on the wire — no disk cache, no manifest synthesis
- The repair loop's ExtractionFailedError and committed:false are unchanged
- Roles still resolve by name, never by provider

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: (none)
Blocks:     S31-07 (probe-capability instrumentation touches the same file)
Parallel:   S31-01, S31-02, S31-03, S31-04

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable)
--------------------------------------------------------------------------------
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-06",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "live_fleet_probed": {
      "description": "The real fleet at http://127.0.0.1:4545 with all 5 manifest roles reachable, probed through the real CLI so the capability map is live output rather than a fixture file.",
      "seed_method": "cli",
      "records": [
        "GET http://127.0.0.1:4545/v1/models returns 200 before any probe runs",
        "`holo probe:capabilities --json` executed against the live fleet",
        "the captured per-role capability map (role, supportsJsonSchema, mode, endpoint, litellmModelId) stored under .tmp/S31-06/probe/"
      ]
    },
    "manifest_overclaims": {
      "description": "A harness-scoped copy of the Fleet Role Manifest declaring structuredOutput true for a role the live probe reports as unsupported.",
      "seed_method": "migration_fixture",
      "records": [
        "a copy of services/platform/fleet/manifest.json under .tmp/S31-06/manifest-overclaim.json",
        "the embed role structuredOutput flipped from false to true",
        "the live fleet still reachable so the probe genuinely runs and genuinely cannot confirm"
      ]
    },
    "malformed_generation_role": {
      "description": "A role the live probe reports as repair mode, driven with a prompt and schema pairing the model cannot satisfy.",
      "seed_method": "cli",
      "records": [
        "the live fleet reachable at http://127.0.0.1:4545",
        "a role whose live probe result is mode repair",
        "a Zod schema and prompt pairing the model provably fails to satisfy across MAX_REPAIR_ATTEMPTS rounds"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "maps_to_ac": null,
      "description": "GIVEN a live fleet and a boot capability map WHEN holo extract runs for a probe-constrained role THEN the status record names the probe-selected mode and commits a schema-valid result at attempts 1",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-probe-driven-extraction.test.ts",
      "scenario": {
        "id": "S31-06-AC-1",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub probe",
            "mock fleet",
            "static capability map",
            "empty probe result",
            "disconnect from the fleet"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "live_fleet_probed",
            "action": {
              "actor": "operator",
              "steps": [
                "Confirm `GET http://127.0.0.1:4545/v1/models` returns `200` BEFORE probing",
                "Run `cd services/platform && bun src/cli/holo.ts probe:capabilities --json` and capture the `5`-role map",
                "Pick a role whose probe `mode` is `constrained`",
                "Run `cd services/platform && bun src/cli/holo.ts extract --role <that role> --json` and capture the status record",
                "Scan services/platform/src/inference/extract-structured.ts for `probe-capability` or `probeRoleCapability`"
              ]
            },
            "end_state": {
              "must_observe": [
                "the probe map contains `5` roles, each with a non-null `mode`",
                "at least `1` role with `mode` `constrained`",
                "the extraction status record's initial mode == the probe `mode` for that role",
                "the extraction status record has `attempts` `1` and `committed` `true`",
                "at least `1` reference to the probe module inside services/platform/src/inference/extract-structured.ts"
              ],
              "must_not_observe": [
                "all `5` roles reporting `mode` `repair` while the manifest declares `structuredOutput` `true` for `3` of them",
                "`0` references to `probe-capability` in services/platform/src/inference/extract-structured.ts",
                "`committed` `false` on the constrained path"
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
      "maps_to_ac": null,
      "description": "GIVEN a manifest declaring a capability the live probe cannot confirm WHEN the service starts THEN it exits non-zero with MANIFEST_CAPABILITY_UNCONFIRMED and never becomes health-ready",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-manifest-fail-closed.test.ts",
      "scenario": {
        "id": "S31-06-AC-2",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub probe",
            "static pass verdict",
            "mock fleet",
            "removed startup guard"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "manifest_overclaims",
            "action": {
              "actor": "operator",
              "steps": [
                "Confirm the fleet is reachable so the boot probe genuinely executes",
                "Start the service as a real child process pointed at the overclaiming manifest",
                "Capture exit code, stderr, and whether `GET /health` ever returned `200`"
              ]
            },
            "end_state": {
              "must_observe": [
                "process exit code is not `0`",
                "stderr contains `MANIFEST_CAPABILITY_UNCONFIRMED` naming the `embed` role",
                "`GET /health` returned `200` exactly `0` times during the case"
              ],
              "must_not_observe": [
                "exit code `0`",
                "a health-ready service on the overclaiming manifest",
                "a log line downgrading the role to `repair` and continuing"
              ]
            }
          },
          {
            "start_ref": "live_fleet_probed",
            "action": {
              "actor": "operator",
              "steps": [
                "Start the service as a real child process pointed at the reconciled committed manifest",
                "Poll `GET /health` until `200` or a bounded deadline"
              ]
            },
            "end_state": {
              "must_observe": [
                "`GET /health` returns `200`",
                "`0` `MANIFEST_CAPABILITY_UNCONFIRMED` entries in stderr"
              ],
              "must_not_observe": [
                "an exit code other than `0`",
                "a startup that succeeds while `1` or more roles disagree with the probe"
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
      "maps_to_ac": null,
      "description": "GIVEN the live fleet and the reconciled committed manifest WHEN probe results are compared to structuredOutput flags THEN drift is 0 across 5 roles and a flipped flag yields exactly 1 named drift entry",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-manifest-fail-closed.test.ts",
      "scenario": {
        "id": "S31-06-AC-3",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static probe map",
            "stub comparison",
            "mock fleet",
            "empty drift list",
            "disconnect from the fleet"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "live_fleet_probed",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `cd services/platform && bun src/cli/holo.ts probe:capabilities --json` against the live fleet and store the output under `.tmp/S31-06/probe/`",
                "Read services/platform/fleet/manifest.json and extract `structuredOutput` per role",
                "Compare the two sets and emit a drift list"
              ]
            },
            "end_state": {
              "must_observe": [
                "`5` roles compared",
                "drift list length is `0`",
                "the stored probe artifact records a non-placeholder `endpoint` and `litellmModelId` for each of the `5` roles"
              ],
              "must_not_observe": [
                "`3` roles declaring `structuredOutput` `true` while the probe reports `repair` for all `5`",
                "a comparison run against a cached or fixture probe map",
                "a drift list computed with `0` reachable fleet endpoints"
              ]
            }
          },
          {
            "start_ref": "live_fleet_probed",
            "action": {
              "actor": "operator",
              "steps": [
                "Copy the reconciled manifest and flip the `divergent` role `structuredOutput` flag",
                "Re-run the comparison against the same live probe output"
              ]
            },
            "end_state": {
              "must_observe": [
                "drift list length is exactly `1`",
                "the single drift entry names the `divergent` role and both the declared and probed values"
              ],
              "must_not_observe": [
                "a drift list length of `0` with a flipped flag present"
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
      "maps_to_ac": null,
      "description": "GIVEN a probe-repair role and an unsatisfiable schema pairing WHEN extraction runs THEN the bounded loop terminates with EXTRACTION_FAILED, committed false and attempts equal to the cap",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-probe-driven-extraction.test.ts",
      "scenario": {
        "id": "S31-06-AC-4",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub repair loop",
            "mock fleet",
            "static success verdict",
            "empty schema errors"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "malformed_generation_role",
            "action": {
              "actor": "operator",
              "steps": [
                "Confirm the fleet is reachable and the chosen role probe `mode` is `repair`",
                "Run `cd services/platform && bun src/cli/holo.ts extract --role <repair-role> --json` with the unsatisfiable schema and prompt pairing",
                "Read the extraction status record via `cd services/platform && bun src/cli/holo.ts extract:status <id> --json`",
                "Assert `0` downstream rows were committed for the extraction id"
              ]
            },
            "end_state": {
              "must_observe": [
                "the terminal error code is `EXTRACTION_FAILED`",
                "the status record `status` is `extraction_failed` with `committed` `false`",
                "the recorded `attempts` equals `MAX_REPAIR_ATTEMPTS` = `3`",
                "the status record carries a `schemaErrors` list with `3` entries"
              ],
              "must_not_observe": [
                "`status` of `success` for the unsatisfiable pairing",
                "`committed` `true`",
                "an `attempts` count of `0` or `1`",
                "a persisted result object on the failure path"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "services/platform/src/inference/extract-structured.ts contains at least 1 reference to the probe-capability module.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-probe-driven-extraction.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "For a role whose probe mode is constrained, the extraction status record initial mode equals constrained.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-probe-driven-extraction.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "An extraction on a probe-constrained role against the live fleet records attempts equal to 1.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-probe-driven-extraction.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "An extraction on a probe-constrained role against the live fleet records committed true.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-probe-driven-extraction.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "Starting the service against a manifest declaring structuredOutput true for the embed role exits non-zero with MANIFEST_CAPABILITY_UNCONFIRMED on stderr.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-manifest-fail-closed.test.ts"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "During the overclaiming-manifest startup, GET /health never returns 200.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-manifest-fail-closed.test.ts"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "Starting the service against the reconciled committed manifest reaches GET /health 200 with 0 MANIFEST_CAPABILITY_UNCONFIRMED entries.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-manifest-fail-closed.test.ts"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "Comparing the live probe result to the committed manifest across all 5 roles yields a drift list of length 0.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-manifest-fail-closed.test.ts"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "Flipping the divergent role structuredOutput flag yields a drift list of length exactly 1 naming that role.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-manifest-fail-closed.test.ts"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "The stored probe artifact records a non-placeholder endpoint for each of the 5 roles.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-manifest-fail-closed.test.ts"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "The stored probe artifact records a non-placeholder litellmModelId for each of the 5 roles.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-manifest-fail-closed.test.ts"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "An unsatisfiable extraction on a probe-repair role terminates with error code EXTRACTION_FAILED.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-probe-driven-extraction.test.ts"
    },
    {
      "id": "TC-13",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "The failed extraction status record has status extraction_failed.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-probe-driven-extraction.test.ts"
    },
    {
      "id": "TC-14",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "The failed extraction status record has committed false.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-probe-driven-extraction.test.ts"
    },
    {
      "id": "TC-15",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "The failed extraction status record has attempts equal to 3.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-probe-driven-extraction.test.ts"
    },
    {
      "id": "TC-16",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "No result object is persisted on the extraction_failed path.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-probe-driven-extraction.test.ts"
    }
  ]
}
-->

</details>
