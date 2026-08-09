# S31-MCP-01: Make the 44-tool dual-transport sweep fail on any non-success result

> **Task ID:** S31-MCP-01
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Agent:** `mcp-implementer`
> **Estimate:** 150 min
> **Type:** FEATURE
> **Priority:** P0 · **Effort:** M
> **PROPOSED-BY:** `mcp-planner`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

**Capabilities:** CAP-CUT-01
**PRD refs:** UC-SVC-04 AC-1, UC-SVC-04 AC-5, R35, R36

## What this does

Gives the 44-tool dual-transport sweep a failure predicate with teeth: a JSON-RPC error, an `isError: true` tool result, and an output-schema violation each count as a failure on both stdio and Streamable HTTP, with the two externally-dependent tools behind an allowlist whose contents are themselves asserted.

## Why

`gateway.ts:37-51` converts every throw into a `result` with `isError: true`, so the HTTP sweep's `(!body.result && !body.error)` test and the stdio sweep's `(response.error || !response.result)` test both pass when all 44 tools fail. The HTTP sweep also skips output-schema validation entirely when `isError === true`. And every live assertion is gated by `itLive = PLATFORM_IT ? it : it.skip`, so a cutover-gate lane can report green from a skip (R36).

## How to verify

`PLATFORM_IT=1 pnpm test:integration` shows both sweeps reporting `failures` length 0 with 42 of 44 tools strictly judged and 0 skipped; the allowlist test deep-equals `['findRecommendations','shop_products']`; running the gate lane without `PLATFORM_IT` exits non-zero naming the flag.

## Scope

Touches only the sweep test file and a new exported predicate helper. A failing tool is fixed by S31-05, never by softening this gate.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-MCP-01 - Make the 44-tool dual-transport sweep fail on any non-success result
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M
AGENT:      implementer=mcp-implementer | reviewer=mcp-reviewer
PROPOSED-BY: mcp-planner

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: AC-1..AC-5 TDD_STATE none · 0/5 complete

--------------------------------------------------------------------------------
OUTCOME (1 sentence, ≤30 words — observable success)
--------------------------------------------------------------------------------

Both 44-tool sweeps fail on any JSON-RPC error, `isError` result, or schema violation, with an
asserted 2-entry allowlist and a lane that fails rather than skips.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- NEVER widen the allowlist to make a Postgres-backed tool pass; it exists only for tools that
  cannot succeed without a live third-party credential (R35).
- NEVER weaken an assertion to accommodate a failing tool — a red sweep is the correct signal that
  S31-05's executable-tools work is incomplete.
- NEVER mock the transport, the Hono app, or Postgres in either sweep; both run against the real
  app and a real spawned stdio process.
- NEVER leave `itLive = PLATFORM_IT ? it : it.skip` as the only gate control — a skipped cutover
  proof that reports green is the exact failure R36 names.
- NEVER move this suite between vitest lanes to dodge the PLATFORM_IT guard.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] The HTTP sweep reports `failures` length 0 with 42 strictly-judged tools of 44 — maps to
      AC-1 (PRIMARY)
- [ ] The stdio sweep uses the identical predicate and its judged id set matches HTTP's — AC-2
- [ ] The allowlist deep-equals `['findRecommendations','shop_products']` with a reason each — AC-3
- [ ] The exported classifier flags jsonrpc_error, tool_is_error and output_schema_mismatch — AC-4
- [ ] The gate lane exits non-zero naming PLATFORM_IT with 0 skipped sweep tests — AC-5
- [ ] `PLATFORM_IT=1 pnpm test:integration` passes + `pnpm tsgo --noEmit` clean
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: Strict HTTP sweep passes for every non-allowlisted tool [PRIMARY]
  GIVEN: fixture sweep_seed_corpus and the real Hono app serving /mcp against real Postgres
  WHEN:  all 44 tools are invoked over Streamable HTTP under the strict predicate
  THEN:  failures is empty, 42 tools strictly judged, 2 allowlisted exemptions

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  mcp-http
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint19-mcp-rehost.test.ts
  TEST_FUNCTION: executes every manifest tool through the real HTTP gateway

  SCENARIO:
    START_REF:        sweep_seed_corpus
    NEGATIVE_CONTROL: would fail if stub | empty | mock | static | disconnect
    EVIDENCE:         api_response (capture required)
    CASE 0:
      ACTION: invoke tools/call for each of the 44 ids over the real /mcp route with schema-derived
              input; record status, body.error, result.isError and the safeParse verdict; classify.
      MUST_OBSERVE:
        - failures has length 0
        - the strictly-judged tool count equals 42
        - the exempted tool count equals 2
        - the total swept tool count equals 44
        - every strictly-judged response returned HTTP status 200 with body.error absent
      MUST_NOT_OBSERVE:
        - any strictly-judged response carrying body.error
        - any strictly-judged response carrying result.isError equal to true
        - any strictly-judged structuredContent failing the tool's shared output schema
        - a strictly-judged tool count of 44, which would mean 0 allowlist entries were applied

AC-2: Strict stdio sweep matches the HTTP sweep
  GIVEN: fixture sweep_seed_corpus and the real holo mcp:stdio process spawned over a pipe
  WHEN:  all 44 tools are invoked over stdio under the same strict predicate
  THEN:  stdio failures is empty and the judged id set equals the HTTP sweep's

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  mcp-stdio
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint19-mcp-rehost.test.ts
  TEST_FUNCTION: executes initialize, list, and a tool call over real stdio

  SCENARIO:
    START_REF:        sweep_seed_corpus
    NEGATIVE_CONTROL: would fail if stub | empty | mock | static | disconnect
    EVIDENCE:         stdout (capture required)
    CASE 0:
      ACTION: spawn holo mcp:stdio; initialize + notifications/initialized; tools/call all 44 ids;
              record error/result/isError/schema verdict; build stdioFailures.
      MUST_OBSERVE:
        - stdioFailures has length 0
        - the stdio strictly-judged id set of 42 ids is deep-equal to the HTTP strictly-judged set
        - the stdio strictly-judged count equals 42
        - tools/list over stdio returned 44 tools
      MUST_NOT_OBSERVE:
        - a stdio response carrying error counted as a pass
        - a stdio response carrying result.isError equal to true counted as a pass
        - the stdio predicate remaining `if (response.error || !response.result)`
        - a strictly-judged id count of 0 on either transport

AC-3: The external-dependency allowlist is exact and reasoned
  GIVEN: the sweep's exported allowlist const
  WHEN:  the test asserts its contents
  THEN:  deep-equals ['findRecommendations','shop_products'], reason per entry, a third id fails

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  mcp-http
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint19-mcp-rehost.test.ts
  TEST_FUNCTION: sweep allowlist contents are exact

  SCENARIO:
    START_REF:        sweep_seed_corpus
    NEGATIVE_CONTROL: would fail if static | empty | stub | hardcod
    EVIDENCE:         stdout (capture required)
    CASE 0:
      ACTION: read the exported allowlist const; record its sorted ids and reasons; deep-equal
              against the literal; confirm each id resolves via getTool().
      MUST_OBSERVE:
        - the sorted allowlist deep-equals ['findRecommendations','shop_products']
        - the allowlist length equals 2
        - both reason strings have length >= 1 and name the live third-party search API dependency
        - both allowlisted ids resolve via getTool() in the 44-tool registry
      MUST_NOT_OBSERVE:
        - an allowlist length other than 2
        - an allowlist entry with an empty reason string
        - an allowlist entry that is not one of the 44 registered tool ids
        - the allowlist being read from an env var or config file instead of an asserted const

AC-4: The strict predicate rejects a known-bad response
  GIVEN: the strict predicate extracted as an exported pure classifier
  WHEN:  fed a JSON-RPC error, an isError result, a schema-violating payload and one real good one
  THEN:  the 3 bad envelopes flag with their reason codes and the good one passes

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  mcp-http
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint19-mcp-rehost.test.ts
  TEST_FUNCTION: strict predicate classifies each failure class

  SCENARIO:
    START_REF:        sweep_seed_corpus
    NEGATIVE_CONTROL: would fail if static | stub | empty | no-op
    EVIDENCE:         api_response (capture required)
    CASE 0:
      ACTION: capture one real good list_documents envelope; construct the three bad variants;
              classify all four.
      MUST_OBSERVE:
        - the JSON-RPC error envelope classifies as a failure with reason 'jsonrpc_error'
        - the isError envelope classifies as a failure with reason 'tool_is_error'
        - the mutated-structuredContent envelope classifies with reason 'output_schema_mismatch'
        - the untouched real list_documents envelope classifies as a pass with 0 reason codes
        - 3 of the 4 classified envelopes are failures
      MUST_NOT_OBSERVE:
        - the isError envelope classifying as a pass
        - the schema check being skipped because isError was true
        - 0 failures across the 4 classified envelopes
        - the real good envelope classifying as a failure

AC-5: The gate lane fails rather than skips without PLATFORM_IT
  GIVEN: the gate lane invoked with PLATFORM_IT unset
  WHEN:  the sweep suite runs
  THEN:  non-zero exit naming PLATFORM_IT and 0 skipped sweep tests

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint19-mcp-rehost.test.ts
  TEST_FUNCTION: cutover gate requires PLATFORM_IT

  SCENARIO:
    START_REF:        sweep_seed_corpus
    NEGATIVE_CONTROL: would fail if static | stub | omit | no-op
    EVIDENCE:         stdout (capture required)
    CASE 0:
      ACTION: run the suite as a subprocess with PLATFORM_IT deleted and HOLO_MCP_GATE=1 set;
              capture exit code and output; record the skipped count; re-run with PLATFORM_IT=1.
      MUST_OBSERVE:
        - the PLATFORM_IT-unset run exits with a code other than 0
        - the captured output contains the literal string 'PLATFORM_IT'
        - the reported skipped-test count for the sweep block equals 0
        - the contrasting PLATFORM_IT=1 run exits with code 0 and 42 strictly-judged tools
      MUST_NOT_OBSERVE:
        - the PLATFORM_IT-unset run exiting with code 0
        - the sweep tests reported as skipped while the lane reports success
        - a skipped-test count greater than 0 in the gate lane

--------------------------------------------------------------------------------
FIXTURES (shared seed data — referenced by START_REF)
--------------------------------------------------------------------------------

sweep_seed_corpus (seed_method: public_api)
  One row per read-tool domain created through the real MCP gateway, so read tools return concrete
  non-empty payloads and an empty result is unambiguously a failure rather than an empty database.
  - 1 documents row via `tools/call store_document` with title `s31-sweep-doc`
  - 1 subscription_sources row via `tools/call add_subscription`, identifier `s31-sweep-sub`
  - 1 toolbelt_tools row via `tools/call store_tool` with title `s31-sweep-tool`
  - 1 improvement_requests row via `tools/call add_improvement`, description `s31-sweep-improvement`
  - 1 assimilation_sessions row via `tools/call start_assimilation`,
    repositoryUrl `https://example.com/s31-sweep`

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/tests/integration/sprint19-mcp-rehost.test.ts (MODIFY)
- services/platform/tests/integration/helpers/mcp-sweep-predicate.ts (NEW — the exported strict
  classifier and the allowlist const)

writeProhibited:
- services/platform/src/mcp/executor.ts — a failing tool is fixed by S31-05, never by softening
  this gate
- services/platform/src/mcp/gateway.ts — the isError contract is what the predicate reads, not
  what it changes
- services/platform/src/tools/registry.ts — S31-05 owns it
- .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml — S31-MCP-04
- vitest.config.ts — moving this suite between lanes to dodge the PLATFORM_IT guard defeats AC-5
- Any file not explicitly listed above

--------------------------------------------------------------------------------
BOUNDARIES (✅ Always / ⚠️ Ask First) — Never tier lives at CRITICAL CONSTRAINTS above
--------------------------------------------------------------------------------

✅ Always:
- Apply the identical exported classifier to both transports.
- Record failures as structured objects `{ id, transport, status, reason }`, never bare id strings.
- Run the output-schema check unconditionally, with no `isError` guard wrapping it.
- Assert concrete counts (44, 42, 2, 0) rather than relative or non-empty checks.
- Keep the allowlist an `as const` array of `{ id, reason }` literals in test source.

⚠️ Ask First:
- Adding a third entry to the allowlist (that is a scope decision, and R35 sets the promotion bar).
- Changing the schema-derived sample-input generator, which several tools depend on for valid args.
- Raising the suite timeout beyond the existing 180s wall.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- services/platform/tests/integration/helpers/mcp-sweep-predicate.ts (NEW): the exported strict
  classifier and allowlist const; the blocker file both sweeps import.
- services/platform/tests/integration/sprint19-mcp-rehost.test.ts (MODIFY): both sweeps rewired to
  the classifier, plus the allowlist, predicate-teeth and PLATFORM_IT-guard tests.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  READ:   Current AC definition, existing tests, code patterns (see READING LIST)
  WRITE:  ONE test that exercises GIVEN-WHEN-THEN
  RUN:    PLATFORM_IT=1 pnpm test:integration -- {test_file}
  VERIFY: Test FAILS (not errors — fails). Capture the RED run of the strict predicate against the
          tree as it stands today; that output is the evidence the old predicate was blind.
  RETURN: { phase: "RED", test_file, test_function, failure_output }

  Always: Show actual test failure output.
  Never:  Write ANY implementation code in RED phase.

### GREEN PHASE (after orchestrator VERIFY_RED passes)
  READ:   Failing test, AC definition, code patterns
  WRITE:  MINIMAL code to make test pass
  RUN:    PLATFORM_IT=1 pnpm test:integration -- {test_file}
  VERIFY: Test PASSES
  RETURN: { phase: "GREEN", files_changed, test_output }

  Always: Write the smallest change that turns the test green.
  Never:  Add features beyond the current AC.

### REFACTOR PHASE (after orchestrator VERIFY_GREEN passes)
  READ:   Implementation just written
  WRITE:  Improved code (if needed)
  RUN:    PLATFORM_IT=1 pnpm test:integration
  VERIFY: Tests still pass
  RETURN: { phase: "REFACTOR", files_changed, still_passing }

  Always: Keep tests green throughout.
  Never:  Introduce new behavior in REFACTOR.

## AFTER ALL ACs COMPLETE:
  Orchestrator dispatches mcp-reviewer.

--------------------------------------------------------------------------------
READING LIST (max 5 files — canonical pattern first)
--------------------------------------------------------------------------------

1. tests/integration/mcp-manifest-negative-controls.test.ts [PRIMARY PATTERN]
   - Lines: 63-99
   - Focus: the in-repo way to prove a gate has teeth — seed the violation, run the real
     entrypoint, assert the exact failure signature. AC-4 imitates this for the predicate itself.

2. services/platform/tests/integration/sprint19-mcp-rehost.test.ts
   - Lines: 392-427
   - Focus: the HTTP sweep's permissive predicate — `status !== 200 || (!body.result && !body.error)`
     lets a JSON-RPC error pass, and `if (body.result && body.result.isError !== true)` skips the
     schema check for every failing tool.

3. services/platform/tests/integration/sprint19-mcp-rehost.test.ts
   - Lines: 12, 326-341
   - Focus: `itLive = PLATFORM_IT ? it : it.skip` (the skip-to-green mechanism R36 names) and the
     weaker stdio predicate `if (response.error || !response.result)`.

4. services/platform/src/mcp/gateway.ts
   - Lines: 24-53
   - Focus: why the sweeps are blind — every throw becomes a 200 response with `result.isError` true
     and a text payload, so "a result exists" is always true.

5. .spec/prds/mk6-migration/10-technical-requirements/08-technical-risks.md
   - Lines: 56-57
   - Focus: R35 (allowlist must be self-asserting, degrading to 42/44 with a named cause) and R36
     (the gate lane must fail rather than skip), verbatim.

--------------------------------------------------------------------------------
EVIDENCE GATES (fast/cheap first — fail fast)
--------------------------------------------------------------------------------

Gate 1: RED phase evidence
  Required: the strict predicate's RED run against today's tree, showing which tools it catches
            that the old predicate passed.

Gate 2: Each AC has a test
  Verify: 5 test functions in the sweep file, one per AC.

Gate 3: Strict dual-transport sweep
  Command: PLATFORM_IT=1 pnpm test:integration
  Expected: both sweeps report failures length 0 with 42 strictly-judged tools of 44 and 0 skipped.

Gate 4: Allowlist exactness
  Command: PLATFORM_IT=1 pnpm vitest run --project integration
           services/platform/tests/integration/sprint19-mcp-rehost.test.ts
           -t 'sweep allowlist contents are exact'
  Expected: sorted allowlist deep-equals ['findRecommendations','shop_products'] with 2 non-empty
            reason strings.

Gate 5: Predicate teeth
  Command: PLATFORM_IT=1 pnpm vitest run --project integration
           services/platform/tests/integration/sprint19-mcp-rehost.test.ts
           -t 'strict predicate classifies each failure class'
  Expected: 3 of 4 classified envelopes are failures with reasons jsonrpc_error, tool_is_error and
            output_schema_mismatch.

Gate 6: Gate lane fails without PLATFORM_IT
  Command: pnpm vitest run --project integration
           services/platform/tests/integration/sprint19-mcp-rehost.test.ts
           -t 'cutover gate requires PLATFORM_IT'
  Expected: non-zero exit whose output contains the literal PLATFORM_IT, 0 skipped sweep tests.

Gate 7: Type check + lint
  Command: pnpm tsgo --noEmit ; pnpm biome check .
  Expected: 0 diagnostics on the sweep file and the new predicate helper; 0 lint errors.

Gate 8: Scenario is un-fakeable (PRIMARY)
  Verify: validate_scenario.py exits 0 on the contract below (5 scenarios, 0 violations).
  Verify: AC-1's strict predicate was watched FAIL before the sweep went green.
  Verify: the captured api_response artifact shows the 42/2/44 split, not merely 'tests passed'.
  Reject: a sweep that reports green because every tool returned isError.

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Fixing any tool the strict sweep turns red — that is S31-05's mandate, and importing it here
  would let a gate change absorb an implementation gap. (Most likely thing to be mistaken for
  in-scope.)
- Implementing rate limiting or new auth on the transport — excluded by 01-scope.md.
- Manifest content or the verify-manifest gate — S31-MCP-03 and S31-MCP-04.
- Replay/idempotency proof for mutation tools — S31-MCP-02.

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** Two sweeps exist and both report green. The HTTP sweep records a failure only
when `response.status !== 200` or when NEITHER `body.result` nor `body.error` is present, and it
skips output-schema validation whenever `body.result.isError === true`. The stdio sweep is weaker
still: `if (response.error || !response.result)`.

**Gap:** Because `gateway.ts:37-51` turns every throw into a 200 response carrying
`result.isError: true`, both sweeps pass in the world where all 44 tools fail. The sweep is the
behavioural half of the CAP-CUT-01 proof — `mcp:verify-rehost` only establishes by source regex
that a dispatch case exists, and `case 'x': throw` satisfies that. Two tools (`shop_products`,
`findRecommendations`) call a real third-party search API on every invocation, so a vendor outage
can redden the gate for reasons unrelated to the migration; R35 sets the allowlist bar.

--------------------------------------------------------------------------------
REVIEW (for mcp-reviewer)
--------------------------------------------------------------------------------

Must pass (≤5, evidence-gate-backed):
- One test per AC; both sweeps run against the real Hono app and a real spawned stdio process
- RED evidence: the strict predicate's failing run against the pre-change tree is recorded
- Minimal implementation: no production source touched, only the test file plus the helper
- Pattern consistent with READING LIST [PRIMARY PATTERN] (negative-control discipline)
- SCOPE respected (git diff --name-only ⊆ writeAllowed)

Should verify (≤5, judgment):
- The schema check runs unconditionally — no `isError` guard reintroduced anywhere
- Both transports consume the identical classifier, not two copies that can drift
- Failure records name the tool, transport and reason class so a red run is diagnosable
- The allowlist is asserted by value, not merely referenced
- The PLATFORM_IT guard throws rather than skipping, in the lane that reports the cutover verdict

Verdict: [APPROVED | NEEDS_FIXES]
Feedback (required if NEEDS_FIXES):
```
[Specific, actionable issues — reference file:line where possible]
```

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: S31-05 (the strict predicate can only be green once every tool actually succeeds; the
            RED capture should still be taken against the pre-S31-05 tree and committed as evidence)
Blocks:     none
Parallel:   S31-MCP-03, S31-MCP-04 (disjoint files)

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable)
--------------------------------------------------------------------------------
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-MCP-01",
  "task_type": "FEATURE",
  "tdd_mode": "red_first",
  "proposed_by": "mcp-planner",
  "agent": "mcp-implementer",
  "agent_rationale": "The bug is an MCP-protocol misreading: the sweep treats a JSON-RPC error envelope and an isError:true tool result as success because both are structurally 'a response'. Fixing it requires knowing that gateway.ts converts every throw into a result with isError:true and that structuredContent is legitimately absent for array-shaped outputs. mcp-implementer owns that envelope semantics.",
  "estimate_minutes": 150,
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "critical_constraints": {
    "must": [
      "MUST apply one identical strict predicate to BOTH sweeps — the HTTP sweep at sprint19-mcp-rehost.test.ts:407-421 and the weaker stdio sweep at :339 — so neither transport is the soft one.",
      "MUST count all three failure classes unconditionally: body.error present, body.result.isError === true, and output-schema safeParse failure on structuredContent ?? JSON.parse(content[0].text) — with no isError guard wrapping the schema check.",
      "MUST assert the allowlist's exact contents by deep-equal against the literal array, with a written reason per entry, so a future failure cannot be absorbed by appending an id (R35).",
      "MUST make the gate lane fail when PLATFORM_IT is unset — a guard assertion that throws, never an it.skip that reports green (R36)."
    ],
    "never": [
      "NEVER widen the allowlist to make a Postgres-backed tool pass; it exists only for tools that cannot succeed without a live third-party credential.",
      "NEVER weaken an assertion to accommodate a failing tool — a red sweep is the correct signal that the executable-tools work is incomplete.",
      "NEVER mock the transport, the Hono app, or Postgres in either sweep; both run against the real app and a real spawned stdio process."
    ],
    "strictly": [
      "STRICTLY keep each failure record informative — tool id, transport, HTTP status and reason class — so a red run names what broke.",
      "STRICTLY treat this sweep as the behavioural half of the CAP-CUT-01 proof that mcp:verify-rehost's source regex cannot provide."
    ]
  },
  "specification": {
    "objective": "Replace the permissive failure predicates in both 44-tool sweeps so a JSON-RPC error response, an isError:true tool result, and an output-schema violation each register as a failure for every tool; gate the two genuinely-external tools behind an allowlist whose contents are themselves asserted; and make the lane fail rather than skip when PLATFORM_IT is unset.",
    "success_state": "failures is empty only when 42 of the 44 tools return a schema-valid non-error result over BOTH stdio and Streamable HTTP against real Postgres; the allowlist is exactly ['findRecommendations','shop_products'] with a written reason each; a deliberately failing envelope makes failures non-empty; and running the gate lane without PLATFORM_IT produces a failing assertion rather than a skipped test."
  },
  "fixtures": {
    "sweep_seed_corpus": {
      "description": "One row per read-tool domain created through the real MCP gateway, so read tools return concrete non-empty payloads and an empty result is unambiguously a failure rather than an empty database.",
      "seed_method": "public_api",
      "records": [
        "1 `documents` row created via `tools/call store_document` with title `s31-sweep-doc`",
        "1 `subscription_sources` row created via `tools/call add_subscription` with identifier `s31-sweep-sub` and sourceType `github`",
        "1 `toolbelt_tools` row created via `tools/call store_tool` with title `s31-sweep-tool`",
        "1 `improvement_requests` row created via `tools/call add_improvement` with description `s31-sweep-improvement`",
        "1 `assimilation_sessions` row created via `tools/call start_assimilation` with repositoryUrl `https://example.com/s31-sweep`"
      ]
    }
  },
  "guardrails": {
    "write_allowed": [
      "services/platform/tests/integration/sprint19-mcp-rehost.test.ts",
      "services/platform/tests/integration/helpers/mcp-sweep-predicate.ts"
    ],
    "write_prohibited": [
      "services/platform/src/mcp/executor.ts — a failing tool is fixed by S31-05, never by softening this gate",
      "services/platform/src/mcp/gateway.ts — the isError contract is what the predicate reads, not what it changes",
      "services/platform/src/tools/registry.ts — S31-05 owns it",
      ".spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml — S31-MCP-04 owns the manifest",
      "vitest.config.ts — moving this suite between lanes to dodge the PLATFORM_IT guard defeats AC-5"
    ]
  },
  "design": {
    "references": [
      "UC-SVC-04 AC-1 — all 44 tools return manifest-backed Postgres results",
      "UC-SVC-04 AC-5 — the frozen-fixture proof this behavioural sweep complements",
      "R35 — external-dependency tools inside the cutover gate",
      "R36 — the behavioural proof is opt-in while the always-on proof is static",
      "brain/docs/mcp-rules/testing.md — real-transport test discipline for MCP servers"
    ],
    "pattern": "One exported pure classifier consumed by both transports, with the classifier's own failure classes covered by a negative-control test — the gate's teeth are proven, not asserted.",
    "pattern_source": "tests/integration/mcp-manifest-negative-controls.test.ts:63-99 — the in-repo precedent of proving a gate fails on a seeded disconnect rather than trusting a green run.",
    "anti_pattern": "Keeping `if (body.result && body.result.isError !== true)` so the schema check silently skips failing tools; adding a tool to the allowlist to turn a red sweep green; leaving `itLive = PLATFORM_IT ? it : it.skip` as the only gate control; asserting merely that a response exists."
  },
  "coding_standards": [
    "brain/docs/mcp-rules/testing.md",
    "brain/docs/mcp-rules/anti-patterns.md",
    "brain/docs/TESTING-HIERARCHY.md",
    "brain/docs/ANTI-STUB-REVIEW.md",
    "RULES.md"
  ],
  "verification_gates": [
    {
      "gate": "Strict dual-transport sweep",
      "command": "PLATFORM_IT=1 pnpm test:integration",
      "expected": "both sweeps report failures length 0 with 42 strictly-judged tools out of 44 and 0 skipped tests"
    },
    {
      "gate": "Allowlist exactness",
      "command": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'sweep allowlist contents are exact'",
      "expected": "the sorted allowlist deep-equals ['findRecommendations','shop_products'] with 2 non-empty reason strings"
    },
    {
      "gate": "Predicate teeth",
      "command": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'strict predicate classifies each failure class'",
      "expected": "3 of 4 classified envelopes are failures with reasons jsonrpc_error, tool_is_error and output_schema_mismatch"
    },
    {
      "gate": "Gate lane fails without PLATFORM_IT",
      "command": "pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'cutover gate requires PLATFORM_IT'",
      "expected": "non-zero exit whose output contains the literal PLATFORM_IT and reports 0 skipped sweep tests"
    },
    {
      "gate": "Typecheck",
      "command": "pnpm tsgo --noEmit",
      "expected": "0 diagnostics on the sweep test file and the new predicate helper"
    },
    {
      "gate": "Lint",
      "command": "pnpm biome check .",
      "expected": "0 errors reported on the changed files"
    },
    {
      "gate": "Unit",
      "command": "pnpm test:unit",
      "expected": "0 failing unit tests after the predicate extraction"
    }
  ],
  "acceptance_criteria": [
    {
      "id": "AC-1",
      "num": 1,
      "primary": true,
      "name": "Strict HTTP sweep passes for every non-allowlisted tool",
      "given": "GIVEN fixture sweep_seed_corpus and the real Hono app serving /mcp against real Postgres",
      "when": "WHEN all 44 tools are invoked over Streamable HTTP and judged by the strict predicate",
      "then": "THEN the failures array is empty, exactly 42 tools were strictly judged, and the 2 allowlisted tools were the only exemptions",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'executes every manifest tool through the real HTTP gateway'",
      "test_tier": "integration",
      "verification_service": "mcp-http",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-1",
      "test_file": "services/platform/tests/integration/sprint19-mcp-rehost.test.ts",
      "test_function": "executes every manifest tool through the real HTTP gateway",
      "tdd_state": "none"
    },
    {
      "id": "AC-2",
      "num": 2,
      "name": "Strict stdio sweep matches the HTTP sweep",
      "given": "GIVEN fixture sweep_seed_corpus and the real holo mcp:stdio process spawned over a pipe",
      "when": "WHEN all 44 tools are invoked over stdio and judged by the same strict predicate",
      "then": "THEN the stdio failures array is empty and the strictly-judged id set is deep-equal to the HTTP sweep's",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'executes initialize, list, and a tool call over real stdio'",
      "test_tier": "e2e",
      "verification_service": "mcp-stdio",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-1",
      "test_file": "services/platform/tests/integration/sprint19-mcp-rehost.test.ts",
      "test_function": "executes initialize, list, and a tool call over real stdio",
      "tdd_state": "none"
    },
    {
      "id": "AC-3",
      "num": 3,
      "name": "The external-dependency allowlist is exact and reasoned",
      "given": "GIVEN the sweep's exported allowlist const",
      "when": "WHEN the test asserts the allowlist's contents",
      "then": "THEN it deep-equals exactly ['findRecommendations','shop_products'], each entry carries a non-empty reason, and a third id fails the test",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'sweep allowlist contents are exact'",
      "test_tier": "integration",
      "verification_service": "mcp-http",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-5",
      "test_file": "services/platform/tests/integration/sprint19-mcp-rehost.test.ts",
      "test_function": "sweep allowlist contents are exact",
      "tdd_state": "none"
    },
    {
      "id": "AC-4",
      "num": 4,
      "name": "The strict predicate rejects a known-bad response",
      "given": "GIVEN the strict predicate extracted as an exported pure classifier",
      "when": "WHEN it is fed a JSON-RPC error, an isError result, a schema-violating payload, and one real good envelope",
      "then": "THEN it classifies the 3 bad envelopes as failures with reasons jsonrpc_error, tool_is_error and output_schema_mismatch, and the good envelope as a pass",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'strict predicate classifies each failure class'",
      "test_tier": "integration",
      "verification_service": "mcp-http",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-5",
      "test_file": "services/platform/tests/integration/sprint19-mcp-rehost.test.ts",
      "test_function": "strict predicate classifies each failure class",
      "tdd_state": "none"
    },
    {
      "id": "AC-5",
      "num": 5,
      "name": "The gate lane fails rather than skips without PLATFORM_IT",
      "given": "GIVEN the gate lane invoked with PLATFORM_IT unset",
      "when": "WHEN the sweep suite runs",
      "then": "THEN the run exits non-zero naming PLATFORM_IT and reports 0 skipped sweep tests",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'cutover gate requires PLATFORM_IT'",
      "test_tier": "integration",
      "verification_service": "cli",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-5",
      "test_file": "services/platform/tests/integration/sprint19-mcp-rehost.test.ts",
      "test_function": "cutover gate requires PLATFORM_IT",
      "tdd_state": "none"
    }
  ],
  "test_criteria": [
    {
      "id": "TC-1",
      "num": 1,
      "statement": "The HTTP sweep failures array length equals 0 under the strict predicate.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'executes every manifest tool through the real HTTP gateway'",
      "type": "boolean"
    },
    {
      "id": "TC-2",
      "num": 2,
      "statement": "The HTTP sweep strictly-judged tool count equals 42.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'executes every manifest tool through the real HTTP gateway'",
      "type": "boolean"
    },
    {
      "id": "TC-3",
      "num": 3,
      "statement": "The HTTP sweep total tool count equals 44.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'executes every manifest tool through the real HTTP gateway'",
      "type": "boolean"
    },
    {
      "id": "TC-4",
      "num": 4,
      "statement": "The stdio sweep failures array length equals 0 under the strict predicate.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'executes initialize, list, and a tool call over real stdio'",
      "type": "boolean"
    },
    {
      "id": "TC-5",
      "num": 5,
      "statement": "The stdio strictly-judged id set is deep-equal to the HTTP strictly-judged id set.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'executes initialize, list, and a tool call over real stdio'",
      "type": "boolean"
    },
    {
      "id": "TC-6",
      "num": 6,
      "statement": "The sorted sweep allowlist deep-equals the literal array ['findRecommendations','shop_products'].",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'sweep allowlist contents are exact'",
      "type": "boolean"
    },
    {
      "id": "TC-7",
      "num": 7,
      "statement": "Every sweep allowlist entry carries a reason string of length 1 or more.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'sweep allowlist contents are exact'",
      "type": "boolean"
    },
    {
      "id": "TC-8",
      "num": 8,
      "statement": "The strict predicate classifies a JSON-RPC error envelope as a failure with reason jsonrpc_error.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'strict predicate classifies each failure class'",
      "type": "boolean"
    },
    {
      "id": "TC-9",
      "num": 9,
      "statement": "The strict predicate classifies an isError-true result envelope as a failure with reason tool_is_error.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'strict predicate classifies each failure class'",
      "type": "boolean"
    },
    {
      "id": "TC-10",
      "num": 10,
      "statement": "The strict predicate classifies a schema-violating structuredContent as a failure with reason output_schema_mismatch.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'strict predicate classifies each failure class'",
      "type": "boolean"
    },
    {
      "id": "TC-11",
      "num": 11,
      "statement": "The sweep suite exit code is non-zero when PLATFORM_IT is unset in the gate lane.",
      "maps_to_ac": "AC-5",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'cutover gate requires PLATFORM_IT'",
      "type": "boolean"
    },
    {
      "id": "TC-12",
      "num": 12,
      "statement": "The gate lane reports a skipped-test count of 0 for the sweep block.",
      "maps_to_ac": "AC-5",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'cutover gate requires PLATFORM_IT'",
      "type": "boolean"
    }
  ],
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN fixture sweep_seed_corpus WHEN all 44 tools run over Streamable HTTP under the strict predicate THEN failures is empty with 42 tools strictly judged.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'executes every manifest tool through the real HTTP gateway'",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-1",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "mcp-http",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "mock",
            "static",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sweep_seed_corpus",
            "action": {
              "actor": "MCP HTTP client",
              "steps": [
                "Invoke `tools/call` for each of the 44 registry ids over the real Hono `/mcp` route with a schema-derived sample input",
                "For each response record the HTTP status, whether `body.error` is present, `body.result.isError`, and the output-schema safeParse verdict on `structuredContent ?? JSON.parse(content[0].text)`",
                "Classify every non-success into `failures` with `{ id, transport: 'http', status, reason }`",
                "Record the strictly-judged tool count and the exempted tool count"
              ]
            },
            "end_state": {
              "must_observe": [
                "`failures` has length 0",
                "the strictly-judged tool count equals 42",
                "the exempted tool count equals 2",
                "the total swept tool count equals 44",
                "every strictly-judged response returned HTTP status 200 with `body.error` absent"
              ],
              "must_not_observe": [
                "any strictly-judged response carrying `body.error`",
                "any strictly-judged response carrying `result.isError` equal to true",
                "any strictly-judged `structuredContent` failing the tool's shared output schema",
                "a strictly-judged tool count of 44, which would mean 0 allowlist entries were applied"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN the same seeded corpus WHEN all 44 tools run over real stdio under the same predicate THEN stdio failures is empty and matches the HTTP judged set.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'executes initialize, list, and a tool call over real stdio'",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-2",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "mcp-stdio",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "mock",
            "static",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sweep_seed_corpus",
            "action": {
              "actor": "MCP stdio client",
              "steps": [
                "Spawn `bun services/platform/src/cli/holo.ts mcp:stdio` with `DATABASE_URL` set",
                "Complete `initialize` and `notifications/initialized`",
                "Invoke `tools/call` for each of the 44 registry ids and record error, result, isError and the schema verdict",
                "Build `stdioFailures` with `{ id, transport: 'stdio', reason }` and record the strictly-judged id set"
              ]
            },
            "end_state": {
              "must_observe": [
                "`stdioFailures` has length 0",
                "the stdio strictly-judged id set of 42 ids is deep-equal to the HTTP strictly-judged id set",
                "the stdio strictly-judged count equals 42",
                "`tools/list` over stdio returned 44 tools"
              ],
              "must_not_observe": [
                "a stdio response carrying `error` counted as a pass",
                "a stdio response carrying `result.isError` equal to true counted as a pass",
                "the stdio predicate remaining `if (response.error || !response.result)`",
                "a strictly-judged id count of 0 on either transport"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN the allowlist const WHEN the test asserts its contents THEN it deep-equals exactly two reasoned ids and cannot silently grow.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'sweep allowlist contents are exact'",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-3",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "mcp-http",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static",
            "empty",
            "stub",
            "hardcod"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sweep_seed_corpus",
            "action": {
              "actor": "gate reviewer",
              "steps": [
                "Read the exported allowlist const and record its sorted id array",
                "Record each entry's written reason string",
                "Assert the sorted array deep-equals the literal `['findRecommendations','shop_products']`",
                "Assert every allowlisted id resolves via `getTool()` in the shared registry"
              ]
            },
            "end_state": {
              "must_observe": [
                "the sorted allowlist deep-equals `['findRecommendations','shop_products']`",
                "the allowlist length equals 2",
                "both reason strings have length >= 1 and each names the live third-party search API dependency",
                "both allowlisted ids resolve via `getTool()` in the 44-tool registry"
              ],
              "must_not_observe": [
                "an allowlist length other than 2",
                "an allowlist entry with an empty reason string",
                "an allowlist entry that is not one of the 44 registered tool ids",
                "the allowlist being read from an env var or config file instead of an asserted const"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN the exported classifier WHEN fed three known-bad envelopes and one real good one THEN it flags exactly the three with the right reason codes.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'strict predicate classifies each failure class'",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-4",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "mcp-http",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static",
            "stub",
            "empty",
            "no-op"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sweep_seed_corpus",
            "action": {
              "actor": "gate reviewer",
              "steps": [
                "Capture one real known-good envelope by calling `list_documents` through the live gateway",
                "Construct `{ error: { code: -32000, message: 'x' } }` and classify it",
                "Construct a result envelope with `isError: true` and classify it",
                "Take the real good envelope, replace `structuredContent` with `{ unexpected: true }`, and classify it",
                "Classify the untouched real good envelope"
              ]
            },
            "end_state": {
              "must_observe": [
                "the JSON-RPC error envelope classifies as a failure with reason 'jsonrpc_error'",
                "the isError envelope classifies as a failure with reason 'tool_is_error'",
                "the mutated-structuredContent envelope classifies as a failure with reason 'output_schema_mismatch'",
                "the untouched real `list_documents` envelope classifies as a pass with 0 reason codes attached",
                "3 of the 4 classified envelopes are failures"
              ],
              "must_not_observe": [
                "the isError envelope classifying as a pass",
                "the schema check being skipped because isError was true",
                "0 failures across the 4 classified envelopes",
                "the real good envelope classifying as a failure"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN PLATFORM_IT unset WHEN the gate lane runs the sweep suite THEN it exits non-zero naming PLATFORM_IT with 0 skipped sweep tests.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'cutover gate requires PLATFORM_IT'",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-5",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static",
            "stub",
            "omit",
            "no-op"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sweep_seed_corpus",
            "action": {
              "actor": "gate lane runner",
              "steps": [
                "Run the sweep suite as a subprocess with `PLATFORM_IT` deleted from the environment and `HOLO_MCP_GATE=1` set",
                "Capture the exit code, stdout and stderr verbatim",
                "Record the reported skipped-test count for the sweep describe block",
                "Re-run with `PLATFORM_IT=1` and record the exit code for contrast"
              ]
            },
            "end_state": {
              "must_observe": [
                "the PLATFORM_IT-unset run exits with a code other than 0",
                "the captured output contains the literal string 'PLATFORM_IT'",
                "the reported skipped-test count for the sweep block equals 0",
                "the contrasting `PLATFORM_IT=1` run exits with code 0 and 42 strictly-judged tools"
              ],
              "must_not_observe": [
                "the PLATFORM_IT-unset run exiting with code 0",
                "the sweep tests reported as skipped while the lane reports success",
                "a skipped-test count greater than 0 in the gate lane"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "The HTTP sweep failures array length equals 0 under the strict predicate.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'executes every manifest tool through the real HTTP gateway'"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "The HTTP sweep strictly-judged tool count equals 42.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'executes every manifest tool through the real HTTP gateway'"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "The HTTP sweep total tool count equals 44.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'executes every manifest tool through the real HTTP gateway'"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "The stdio sweep failures array length equals 0 under the strict predicate.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'executes initialize, list, and a tool call over real stdio'"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "The stdio strictly-judged id set is deep-equal to the HTTP strictly-judged id set.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'executes initialize, list, and a tool call over real stdio'"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "The sorted sweep allowlist deep-equals the literal array ['findRecommendations','shop_products'].",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'sweep allowlist contents are exact'"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "Every sweep allowlist entry carries a reason string of length 1 or more.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'sweep allowlist contents are exact'"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "The strict predicate classifies a JSON-RPC error envelope as a failure with reason jsonrpc_error.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'strict predicate classifies each failure class'"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "The strict predicate classifies an isError-true result envelope as a failure with reason tool_is_error.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'strict predicate classifies each failure class'"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "The strict predicate classifies a schema-violating structuredContent as a failure with reason output_schema_mismatch.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'strict predicate classifies each failure class'"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": "The sweep suite exit code is non-zero when PLATFORM_IT is unset in the gate lane.",
      "maps_to_ac": "AC-5",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'cutover gate requires PLATFORM_IT'"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": "The gate lane reports a skipped-test count of 0 for the sweep block.",
      "maps_to_ac": "AC-5",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint19-mcp-rehost.test.ts -t 'cutover gate requires PLATFORM_IT'"
    }
  ]
}
-->

</details>
