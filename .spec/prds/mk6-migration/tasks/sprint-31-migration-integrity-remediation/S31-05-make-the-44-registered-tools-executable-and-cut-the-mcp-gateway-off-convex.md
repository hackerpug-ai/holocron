# S31-05: Make the 44 registered tools executable and cut the MCP gateway off Convex

> **Task ID:** S31-05
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Agent:** `mcp-implementer`
> **Estimate:** 1200 min
> **Type:** FEATURE
> **Priority:** P0 · **Effort:** XL
> **PROPOSED-BY:** `mcp-planner`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

**Capabilities:** CAP-CUT-01
**PRD refs:** UC-SVC-04 AC-1, UC-SVC-04 AC-2, UC-PLAT-02 AC-2, R37

## What this does

Gives the 44 shared-registry MCP tools real execute bodies against Postgres, registers them on the single Mastra composition root, and removes the Convex client from `holocron-mcp/src/` so the legacy package serves Postgres results instead of proxying a deployment that is about to be deleted.

## Why

Sprint 32 deletes `convex/` irreversibly. Today `tools/registry.ts:66` throws `not implemented` for every tool, `src/index.ts:76-77` boots Mastra with `agents: {}, workflows: {}`, and `holocron-mcp/src/` still holds 86 `"module:fn" as any` Convex references that UC-SVC-04 AC-2 forbids by name. Only the HTTP/stdio gateway path is real; the shared registry every agent and workflow consumes is schemas with no bodies.

## How to verify

`PLATFORM_IT=1 pnpm test:integration` shows `createMastra().listTools()` returning 44 tools and a `documents` row titled `s31-05-registry-write`; `bun src/cli/holo.ts mcp:verify-rehost --json` reports `registeredTools: 44` with `convexRefs: []`; `grep -rn convex holocron-mcp/src` returns 0 matches.

## Scope

Touches the shared tool registry, the Mastra composition root, and the legacy `holocron-mcp` package's transport layer. The Postgres executor, the MCP gateway, the tool schemas, and the compatibility manifest are all read-only here.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-05 - Make the 44 registered tools executable and cut the MCP gateway off Convex
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     XL
AGENT:      implementer=mcp-implementer | reviewer=mcp-reviewer
PROPOSED-BY: mcp-planner

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: AC-1..AC-6 TDD_STATE none · 0/6 complete

--------------------------------------------------------------------------------
OUTCOME (1 sentence, ≤30 words — observable success)
--------------------------------------------------------------------------------

All 44 shared-registry tools execute against real Postgres from the composition root and both
transports, and `holocron-mcp/src/` holds zero Convex references.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- NEVER write to stdout from any code reachable by `holo mcp:stdio` or the `holocron-mcp` stdio
  boot — stdout is the JSON-RPC framing channel and any log line corrupts the protocol stream.
- NEVER throw out of a tool handler for an expected failure — return the `isError: true` envelope
  with a screaming-snake code, exactly as `gateway.ts:37-51` does.
- NEVER reintroduce `convex/browser`, `convex/server`, or a `"module:fn" as any` reference under
  `holocron-mcp/src/`; UC-SVC-04 AC-2 forbids them verbatim.
- NEVER let a repointed legacy tool fall back to a stub, an empty array, or a cached value when the
  platform is unreachable — the failure must surface as a typed error.
- NEVER rename, add, or remove a tool id; the 44 ids at `tools/registry.ts:103-374` are the cutover
  boundary and a rename is a MAJOR contract break (brain/docs/mcp-rules/maintenance.md).

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] `getTool('store_document').tool.execute(...)` writes a real `documents` row and
      `getTool('list_documents')` reads it back — maps to AC-1 (PRIMARY)
- [ ] `createMastra().listTools()` returns 44 tools and `mastra.getTool('list_documents')` executes
      against real Postgres — maps to AC-2
- [ ] An aborted signal on the registry path rejects with `MCP request cancelled` before dispatch —
      maps to AC-3
- [ ] `grep -rn convex holocron-mcp/src` returns 0 matches and the package still serves Postgres
      results over real stdio — maps to AC-4
- [ ] An unreachable `PLATFORM_URL` yields `isError: true` with a screaming-snake code, never an
      empty-array success — maps to AC-5
- [ ] `mcp:verify-rehost` reports `registeredTools: 44` / `convexRefs: []` and `deferredExecute`
      occurs 0 times in the registry — maps to AC-6
- [ ] `PLATFORM_IT=1 pnpm test:integration` passes + `pnpm tsgo --noEmit` clean
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: Registry execute bodies return real Postgres results [PRIMARY]
  GIVEN: fixture live_platform_stack with real Postgres reachable and the shared registry loaded
  WHEN:  the caller executes store_document with title 's31-05-registry-write', then list_documents
  THEN:  no 'not implemented' throw; exactly 1 documents row and the title in the list payload

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  postgres
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-registry-execute.test.ts
  TEST_FUNCTION: AC-1 registry execute writes and reads real Postgres

  SCENARIO:
    START_REF:        live_platform_stack
    NEGATIVE_CONTROL: would fail if stub | empty | mock | static | disconnect
    EVIDENCE:         db_query (capture required)
    CASE 0:
      ACTION: SELECT the pre-count for title 's31-05-registry-write'; execute store_document via
              getTool(); execute list_documents via getTool(); re-SELECT the row.
      MUST_OBSERVE:
        - the store_document execute resolves and returns a document id string of length >= 1
        - SELECT count(*) FROM documents WHERE title = 's31-05-registry-write' returns 1
        - the list_documents result JSON contains the literal substring 's31-05-registry-write'
        - the list_documents result carries >= 4 document entries (3 seeded plus 1 written)
      MUST_NOT_OBSERVE:
        - an Error message containing 'not implemented' or 'deferred to a later sprint'
        - a list_documents result with 0 documents
        - a returned document id with no matching row in documents

AC-2: Mastra composition root exposes all 44 executable tools
  GIVEN: fixture seeded_mcp_corpus and the single instance built by createMastra()
  WHEN:  listTools() is read and mastra.getTool('list_documents') executes against real Postgres
  THEN:  44 tools resolve, key set equals toolsAsRecord(), and the 3 seeded documents return

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  mastra
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-registry-execute.test.ts
  TEST_FUNCTION: AC-2 composition root exposes 44 executable tools

  SCENARIO:
    START_REF:        seeded_mcp_corpus
    NEGATIVE_CONTROL: would fail if stub | empty | mock | static | disconnect
    EVIDENCE:         db_query (capture required)
    CASE 0:
      ACTION: build createMastra(); read listTools() keys; compare to toolsAsRecord(); execute
              list_documents through the root; SELECT the seeded titles.
      MUST_OBSERVE:
        - Object.keys(mastra.listTools()).length equals 44
        - the listTools() key set is deep-equal to Object.keys(toolsAsRecord())
        - the result contains the 3 literals 's31-05-doc-1', 's31-05-doc-2', 's31-05-doc-3'
        - services/platform/src/index.ts contains 0 occurrences of 'service-2+ register tools/agents'
      MUST_NOT_OBSERVE:
        - mastra.listTools() returning undefined or an object with 0 keys
        - an executed tool throwing 'not implemented'
        - a list_documents result with 0 documents while 3 rows are seeded

AC-3: Cancellation propagates through the registry execute path
  GIVEN: fixture live_platform_stack and an AbortController aborted before the call
  WHEN:  a registry tool executes with that aborted signal in the Mastra execution context
  THEN:  rejection with 'MCP request cancelled' before dispatch and 0 rows written

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  postgres
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-registry-execute.test.ts
  TEST_FUNCTION: AC-3 registry execute honours an aborted signal

  SCENARIO:
    START_REF:        live_platform_stack
    NEGATIVE_CONTROL: would fail if stub | mock | static | disconnect
    EVIDENCE:         db_query (capture required)
    CASE 0:
      ACTION: pre-count 's31-05-cancelled'; abort() the controller; execute store_document with the
              aborted signal; record the rejection; re-count.
      MUST_OBSERVE:
        - the execute call rejects with a message containing 'MCP request cancelled'
        - SELECT count(*) FROM documents WHERE title = 's31-05-cancelled' returns 0 before and after
        - the seeded corpus still reports 3 rows matching 's31-05-doc-%', proving the connection lived
      MUST_NOT_OBSERVE:
        - the execute call resolving with a document id
        - a documents row titled 's31-05-cancelled' after the call
        - a rejection message containing 'not implemented'
        - a documents row count other than 0 for title 's31-05-cancelled'

AC-4: holocron-mcp serves Postgres over real stdio with zero Convex references
  GIVEN: fixture seeded_mcp_corpus, holocron-mcp/src/convex/ deleted, PLATFORM_URL + HOLO_KEY_MCP set
  WHEN:  the package is driven over real stdio and holocron-mcp/src is scanned for Convex references
  THEN:  the same seeded documents return as the gateway and the Convex scan finds 0 matches

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  mcp-stdio
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts
  TEST_FUNCTION: AC-4 legacy package serves Postgres over stdio with no Convex references

  SCENARIO:
    START_REF:        seeded_mcp_corpus
    NEGATIVE_CONTROL: would fail if stub | empty | mock | static | disconnect
    EVIDENCE:         stdout (capture required)
    CASE 0:
      ACTION: grep holocron-mcp/src for convex; check the deleted convex/ files; spawn the package
              over stdio; initialize; tools/list; tools/call list_documents; compare with /mcp.
      MUST_OBSERVE:
        - grep -rn convex holocron-mcp/src returns 0 matches
        - existsSync for holocron-mcp/src/convex/client.ts and .../types.ts both return false
        - the initialize response carries a serverInfo.name string of length >= 1
        - tools/list returns >= 1 tool and every name resolves via getTool()
        - the result contains the 3 literals 's31-05-doc-1', 's31-05-doc-2', 's31-05-doc-3'
        - the legacy structuredContent is deep-equal to the platform gateway payload
      MUST_NOT_OBSERVE:
        - any match for 'convex/browser', 'convex/server' or 'as any' under holocron-mcp/src
        - a tools/call result with 0 documents while 3 rows are seeded
        - a JSON-RPC error response to initialize or tools/list
        - non-JSON bytes on the package stdout stream

AC-5: Repointed legacy package fails loudly when the platform is unreachable
  GIVEN: the repointed package configured with a PLATFORM_URL that refuses connections
  WHEN:  a client calls tools/call list_documents through it
  THEN:  isError true with a screaming-snake code and 0 document objects, no Convex fallback

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  mcp-stdio
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts
  TEST_FUNCTION: AC-5 unreachable platform surfaces a typed error not a fabricated success

  SCENARIO:
    START_REF:        seeded_mcp_corpus
    NEGATIVE_CONTROL: would fail if stub | empty | static | mock
    EVIDENCE:         stdout (capture required)
    CASE 0:
      ACTION: spawn with a closed-port PLATFORM_URL; call list_documents; record the envelope; parse
              content[0].text; re-run the same call against the live platform as a control.
      MUST_OBSERVE:
        - the response carries result.isError equal to true
        - the parsed error code matches the pattern ^[A-Z][A-Z0-9_]+$
        - the parsed error message is a string of length >= 1 naming the unreachable platform
        - the control call against the live platform returns 3 documents matching 's31-05-doc-%'
      MUST_NOT_OBSERVE:
        - a result envelope with isError absent or false
        - a structuredContent carrying an empty documents: [] presented as success
        - any Convex client construction as a fallback
        - the process exiting 0 with no error surfaced

AC-6: Deferred-execute residue is gone and the rehost verifier still passes
  GIVEN: the landed change on a clean tree with fixture live_platform_stack running
  WHEN:  mcp:verify-rehost --json runs and the registry is scanned for the deferred marker
  THEN:  44 registered tools verify clean and the deferred markers occur 0 times

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-registry-execute.test.ts
  TEST_FUNCTION: AC-6 deferred execute residue is gone

  SCENARIO:
    START_REF:        live_platform_stack
    NEGATIVE_CONTROL: would fail if stub | static | empty | removed
    EVIDENCE:         stdout (capture required)
    CASE 0:
      ACTION: run mcp:verify-rehost --json; grep the registry for deferredExecute and for the
              'deferred to a later sprint' string.
      MUST_OBSERVE:
        - registeredTools equals 44 and manifestTools equals 44
        - missingExecutors, convexRefs, duplicateValidationSites and extraTools each have length 0
        - grep -c deferredExecute services/platform/src/tools/registry.ts returns 0
        - grep -c 'deferred to a later sprint' services/platform/src/tools/registry.ts returns 0
      MUST_NOT_OBSERVE:
        - a registeredTools value below 44
        - any remaining deferredExecute occurrence in the shared registry
        - a report with no registeredTools field at all
        - a convexRefs array with a length other than 0

--------------------------------------------------------------------------------
FIXTURES (shared seed data — referenced by START_REF)
--------------------------------------------------------------------------------

live_platform_stack (seed_method: cli)
  The real Mastra service on :4111 backed by real Postgres with the MCP scoped key present, started
  through the real CLI entrypoint so both the gateway and the repointed legacy package authenticate.
  - process started via `bun services/platform/src/cli/holo.ts service:up` on port 4111,
    `/health` reporting `db.ready: true`
  - env DATABASE_URL resolving to holocron_nonprod and HOLO_KEY_MCP set to a non-empty scoped key
  - all Drizzle migrations applied so documents, subscription_sources, toolbelt_tools and
    improvement_requests are queryable

seeded_mcp_corpus (seed_method: public_api)
  Domain rows created through the real MCP gateway rather than raw SQL, so read tools return
  concrete non-empty payloads and an empty result is unambiguously a failure.
  - 3 documents rows via `tools/call store_document`: 's31-05-doc-1', 's31-05-doc-2', 's31-05-doc-3'
  - 1 subscription_sources row via `tools/call add_subscription`: identifier 's31-05-sub-1'
  - 1 toolbelt_tools row via `tools/call store_tool`: title 's31-05-tool-1'
  - 1 improvement_requests row via `tools/call add_improvement`: description 's31-05-improvement-1'

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/tools/registry.ts (MODIFY)
- services/platform/src/index.ts (MODIFY)
- holocron-mcp/src/platform/mcp-client.ts (NEW)
- holocron-mcp/src/mastra/stdio.ts (MODIFY)
- holocron-mcp/src/config/env.ts (MODIFY)
- holocron-mcp/package.json (MODIFY — drop the convex dependency only)
- services/platform/tests/integration/sprint31-registry-execute.test.ts (NEW)
- services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts (NEW)
- holocron-mcp/src/convex/client.ts (DELETE)
- holocron-mcp/src/convex/types.ts (DELETE)
- holocron-mcp/src/config/validation.ts (DELETE — the 373-line duplicate Zod layer loses its
  consumers with the repoint; UC-SVC-04 AC-4 requires it gone)
- holocron-mcp/src/tools/*.ts (MODIFY — the 14 modules holding the 86 Convex call sites)

writeProhibited:
- services/platform/src/mcp/executor.ts — already real Postgres SQL for all 44 ids; editing it here
  masks the registry gap this task exists to close
- services/platform/src/mcp/gateway.ts — the reference contract this task imitates
- services/platform/src/tools/schemas/index.ts — Zod instance identity must not move
- .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml — S31-MCP-04
- convex/ — Sprint 32 owns Convex source deletion
- services/platform/src/cutover/convex-fence-client.ts — sanctioned rollback tooling, keeps Convex
- Any file not explicitly listed above

--------------------------------------------------------------------------------
BOUNDARIES (✅ Always / ⚠️ Ask First) — Never tier lives at CRITICAL CONSTRAINTS above
--------------------------------------------------------------------------------

✅ Always:
- Route every registry execute body through `executePostgresMcpTool(id, input, { signal })`.
- Thread the Mastra AbortSignal into the executor's `signal` option on every path.
- Reuse the existing Zod instances by reference so `getSchemasForAllConsumers().identity` stays true.
- Delete dead code outright rather than commenting it out.
- Send legacy-package diagnostics to stderr or the existing file logger, never stdout.

⚠️ Ask First:
- Adding any new runtime dependency to `holocron-mcp/package.json`.
- Changing `holocron-mcp`'s bin entry or build (`tsup`) configuration.
- Introducing an agent or workflow on the composition root (S31-04 owns the chat agents).

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- services/platform/src/tools/registry.ts (MODIFY): real execute bodies for all 44 tools, replacing
  `deferredExecute`; this is the blocker file every other consumer imports.
- services/platform/src/index.ts (MODIFY): the populated composition root exposing the 44 tools.
- holocron-mcp/src/platform/mcp-client.ts (NEW): the Streamable HTTP delegate replacing the Convex
  client; imported by all 14 legacy tool modules.
- holocron-mcp/src/tools/*.ts (MODIFY): 86 Convex call sites repointed at the delegate.
- services/platform/tests/integration/sprint31-registry-execute.test.ts (NEW): AC-1, AC-2, AC-3, AC-6.
- services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts (NEW): AC-4, AC-5.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  READ:   Current AC definition, existing tests, code patterns (see READING LIST)
  WRITE:  ONE test that exercises GIVEN-WHEN-THEN
  RUN:    PLATFORM_IT=1 pnpm test:integration -- {test_file}
  VERIFY: Test FAILS (not errors — fails). AC-1's RED is the literal
          `not implemented: tool 'store_document' execute is deferred to a later sprint` throw.
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

1. services/platform/src/mcp/gateway.ts [PRIMARY PATTERN]
   - Lines: 12-57
   - Focus: the exact shape to imitate — registerTool forwarding to executePostgresMcpTool with
     `extra.signal` threaded, structuredContent only for object results, and every throw converted
     into an `isError: true` envelope with a screaming-snake code.

2. services/platform/src/tools/registry.ts
   - Lines: 64-99, 103-374, 578-590
   - Focus: `deferredExecute`, the `register()` helper that applies it to all 44 tools at :96, the
     ENTRIES list, and `toolsAsRecord()` — the exact surface being changed.

3. services/platform/src/index.ts
   - Lines: 64-79, 109-130
   - Focus: `createMastra()` with `agents: {}, workflows: {}` and the placeholder log line; Mastra
     1.50's Config exposes `tools?: TTools` with `getTool()` / `listTools()` accessors.

4. holocron-mcp/src/tools/creators.ts
   - Lines: 195-250
   - Focus: a representative `"creators/queries:search" as any` call site — the pattern repeated 86
     times across the 14 legacy tool modules, all of which repoint to the same delegate.

5. services/platform/tests/integration/sprint19-mcp-rehost.test.ts
   - Lines: 104-235
   - Focus: the real-transport harness (spawned stdio child, Hono app request) and the proven
     cancellation assertion this task's AC-3 mirrors on the registry path.

--------------------------------------------------------------------------------
EVIDENCE GATES (fast/cheap first — fail fast)
--------------------------------------------------------------------------------

Gate 1: RED phase evidence
  Required: AC-1's RED output shows the literal 'deferred to a later sprint' throw.

Gate 2: Each AC has a test
  Verify: 6 test functions across the 2 new test files, one per AC.

Gate 3: Registry + composition root
  Command: PLATFORM_IT=1 pnpm test:integration
  Expected: 44 tools from createMastra().listTools() and a documents row titled
            's31-05-registry-write'; 0 tests skipped.

Gate 4: Legacy package repoint
  Command: PLATFORM_IT=1 pnpm test:integration
  Expected: 0 Convex matches under holocron-mcp/src and a stdio list_documents payload containing
            's31-05-doc-1'.

Gate 5: Rehost verifier
  Command: cd services/platform && bun src/cli/holo.ts mcp:verify-rehost --json
  Expected: registeredTools 44, manifestTools 44, convexRefs [], missingExecutors [],
            duplicateValidationSites [].

Gate 6: Manifest completeness unaffected
  Command: cd services/platform && bun src/cli/holo.ts mcp:verify-manifest --json
  Expected: tools_covered 44, tools_total 44, issues [].

Gate 7: Type check + lint
  Command: pnpm tsgo --noEmit ; pnpm biome check .
  Expected: 0 diagnostics across services/platform and holocron-mcp; 0 lint errors.

Gate 8: Scenario is un-fakeable (PRIMARY)
  Verify: validate_scenario.py exits 0 on the contract below (6 scenarios, 0 violations).
  Verify: AC-1 was watched FAIL against the deferred-execute start state before it went green.
  Verify: the captured db_query artifact shows the seeded row, not merely 'tests passed'.
  Reject: a PRIMARY test that passes with an in-memory shim behind holocron-mcp/src.

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Deleting the `holocron-mcp` package itself — Sprint 32 owns that; this task leaves it installed,
  buildable, and Convex-free. (Most likely thing to be mistaken for in-scope.)
- Rewriting `services/platform/src/mcp/executor.ts` — all 44 dispatch cases already exist and are
  real; the gap is the shared registry, not the SQL.
- Registering chat agents or workflows on the composition root — S31-04.
- Strengthening the 44-tool dual-transport sweep predicate — S31-MCP-01.
- Manifest prose, origin policy, or fixture-field changes — S31-MCP-04.

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** `executePostgresMcpTool` in services/platform/src/mcp/executor.ts carries a real
Postgres dispatch case for all 44 tool ids (verified — `mcp:verify-rehost` reports 0 missing
executors), so the HTTP and stdio gateway paths already work. The shared registry every agent and
workflow imports throws `not implemented` for all 44 (registry.ts:66, applied at :96), the Mastra
composition root boots with empty registries (index.ts:76-77), and `holocron-mcp/src/` still routes
through `HolocronConvexClient` with 86 `as any` module references.

**Gap:** Three seams, one change. (1) The registry has schemas with no bodies. (2) Nothing is
registered on the composition root. (3) The legacy package proxies a Convex client that
`convex/client.ts:14` points at `PLATFORM_URL` — the Mastra host, not the Convex deployment — so it
is neither a working legacy path nor a migrated one (R37), and `rollback-repoint.ts` never
references it. Note `holocron-mcp` is not in pnpm-workspace.yaml (only `.` and `services/platform`),
which is why the repoint delegates over the platform's Streamable HTTP `/mcp` endpoint keyed by
`HOLO_KEY_MCP` rather than importing across the package boundary.

--------------------------------------------------------------------------------
REVIEW (for mcp-reviewer)
--------------------------------------------------------------------------------

Must pass (≤5, evidence-gate-backed):
- One test per AC; tests verify behavior against real Postgres and real transports, not mocks
- RED evidence present: AC-1 failed with the 'deferred to a later sprint' throw before GREEN
- Minimal implementation: no SQL added to registry.ts, no second validation layer
- Pattern consistent with READING LIST [PRIMARY PATTERN] (gateway.ts:12-57)
- SCOPE respected (git diff --name-only ⊆ writeAllowed)

Should verify (≤5, judgment):
- No stdout writes on any stdio-reachable path in either the platform CLI or the legacy package
- Schema instance identity preserved (getSchemasForAllConsumers().identity still true for all 44)
- The unreachable-platform path returns a typed error, never a shaped default
- holocron-mcp/src/config/validation.ts removed with no orphaned imports left behind
- Tool ids unchanged — no MAJOR contract break smuggled in

Verdict: [APPROVED | NEEDS_FIXES]
Feedback (required if NEEDS_FIXES):
```
[Specific, actionable issues — reference file:line where possible]
```

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: none (Sprint 30's rollback drill completes before this sprint)
Blocks:     S31-MCP-01 (the strict sweep can only be green once every tool succeeds),
            S31-CX-05 (decommission inventory needs a working non-Convex MCP surface)
Parallel:   S31-MCP-03 (manifest gate holes — disjoint files)

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable)
--------------------------------------------------------------------------------
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-05",
  "task_type": "FEATURE",
  "tdd_mode": "red_first",
  "proposed_by": "mcp-planner",
  "agent": "mcp-implementer",
  "agent_rationale": "Spans the shared Mastra tool registry, the Mastra composition root, and the legacy package transport layer — three MCP-surface concerns that must land together so tool identity and schema identity stay one object across agents, workflows and both transports. mcp-implementer owns the SDK idioms (stdio stdout discipline, the isError contract, structuredContent shape) a generic implementer would break.",
  "estimate_minutes": 1200,
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "critical_constraints": {
    "must": [
      "MUST route every registry execute body through the existing executePostgresMcpTool(id, input, { signal }) — never re-implement SQL in tools/registry.ts and never add a second validation layer.",
      "MUST thread the Mastra AbortSignal into executePostgresMcpTool so cancellation behaves identically on the registry path and the gateway path (gateway.ts:24-31 is the reference).",
      "MUST keep holocron-mcp installed and buildable — delete only holocron-mcp/src/convex/ and the Convex call sites; Sprint 32 owns deleting the package.",
      "MUST preserve tool-id identity: the 44 ids at tools/registry.ts:103-374 are the cutover boundary, and renaming any one of them is a MAJOR contract break."
    ],
    "never": [
      "NEVER write to stdout from any code reachable by holo mcp:stdio or the holocron-mcp stdio boot — stdout is the JSON-RPC framing channel.",
      "NEVER throw out of a tool handler for an expected failure — return the isError:true envelope with a screaming-snake code.",
      "NEVER reintroduce convex/browser, convex/server, or a module:fn as-any reference under holocron-mcp/src/.",
      "NEVER let a repointed legacy tool fall back to a stub, an empty array, or a cached value when the platform is unreachable."
    ],
    "strictly": [
      "STRICTLY treat holocron-mcp/src/convex/client.ts:14 as a phantom, not a rollback path — R37 records it points at the Mastra host, and rollback-repoint.ts never references the package.",
      "STRICTLY preserve the Zod instance identity that getSchemasForAllConsumers().identity asserts — the execute change must not clone or rebuild schemas."
    ]
  },
  "specification": {
    "objective": "Replace deferredExecute (tools/registry.ts:64-72, applied to all 44 tools at :96) with real execute bodies dispatching to the already-real Postgres executor; register those 44 tools on the single Mastra composition root that boots today with agents:{} workflows:{} (src/index.ts:76-77); and repoint holocron-mcp/src/ off its Convex browser client onto the platform Streamable HTTP /mcp endpoint, deleting holocron-mcp/src/convex/ entirely.",
    "success_state": "getTool(id).tool.execute(...) returns real Postgres results for all 44 ids instead of throwing 'not implemented'; createMastra().listTools() returns exactly the 44 registry ids and mastra.getTool('list_documents') executes against real Postgres; grep -rn convex holocron-mcp/src returns 0 matches while the legacy package still answers initialize, tools/list and tools/call over real stdio with payloads deep-equal to the platform gateway's; holo mcp:verify-rehost exits 0 and grep -c deferredExecute services/platform/src/tools/registry.ts returns 0."
  },
  "fixtures": {
    "live_platform_stack": {
      "description": "The real Mastra service on :4111 backed by real Postgres with the MCP scoped key present, started through the real CLI entrypoint so both the gateway and the repointed legacy package can authenticate.",
      "seed_method": "cli",
      "records": [
        "process started via `bun services/platform/src/cli/holo.ts service:up` listening on port 4111 with `/health` reporting `db.ready: true`",
        "env `DATABASE_URL` resolving to `holocron_nonprod` and `HOLO_KEY_MCP` set to a non-empty scoped key",
        "all Drizzle migrations applied so tables `documents`, `subscription_sources`, `toolbelt_tools` and `improvement_requests` are queryable"
      ]
    },
    "seeded_mcp_corpus": {
      "description": "Domain rows created through the real MCP gateway rather than raw SQL, so read tools return concrete non-empty payloads and an empty result is unambiguously a failure.",
      "seed_method": "public_api",
      "records": [
        "3 `documents` rows created via `tools/call store_document` with titles `s31-05-doc-1`, `s31-05-doc-2`, `s31-05-doc-3`",
        "1 `subscription_sources` row created via `tools/call add_subscription` with identifier `s31-05-sub-1` and sourceType `github`",
        "1 `toolbelt_tools` row created via `tools/call store_tool` with title `s31-05-tool-1`",
        "1 `improvement_requests` row created via `tools/call add_improvement` with description `s31-05-improvement-1`"
      ]
    }
  },
  "guardrails": {
    "write_allowed": [
      "services/platform/src/tools/registry.ts",
      "services/platform/src/index.ts",
      "holocron-mcp/src/mastra/stdio.ts",
      "holocron-mcp/src/config/env.ts",
      "services/platform/tests/integration/sprint31-registry-execute.test.ts",
      "services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts",
      "holocron-mcp/src/platform/mcp-client.ts",
      "holocron-mcp/package.json"
    ],
    "write_prohibited": [
      "services/platform/src/mcp/executor.ts — already real Postgres SQL for all 44 ids; editing it here masks the registry gap",
      "services/platform/src/mcp/gateway.ts — the reference contract this task imitates, unchanged",
      "services/platform/src/tools/schemas/index.ts — schema instance identity must not move",
      ".spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml — S31-MCP-04 owns the manifest",
      "convex/ — Sprint 32 owns Convex source deletion",
      "services/platform/src/cutover/convex-fence-client.ts — the sanctioned rollback tooling keeps its Convex import"
    ]
  },
  "design": {
    "references": [
      "UC-SVC-04 AC-1 and AC-2 — 44 tools on Postgres with zero Convex refs in holocron-mcp/src",
      "UC-PLAT-02 AC-2 — one shared Zod schema set reachable identically by agents, workflows and the MCP gateway",
      "CAP-CUT-01 — the 44-tool surface is the cutover boundary",
      "R37 — the phantom rollback surface this task retires",
      "brain/docs/mcp-rules/tools.md — isError contract and Zod-everywhere invariants"
    ],
    "pattern": "Single-dispatch delegation: one shared registry whose execute bodies forward to one Postgres executor, consumed identically by the composition root, both transports and the legacy package — no per-consumer reimplementation and no second validation layer.",
    "pattern_source": "services/platform/src/mcp/gateway.ts:12-57 — registerTool forwarding to executePostgresMcpTool with signal threading and the isError envelope.",
    "anti_pattern": "Reimplementing SQL inside tools/registry.ts; adding a Zod re-validation layer on the registry path; pointing holocron-mcp/src at an in-memory shim so the Convex grep goes green while the tools stop returning real data; deleting the holocron-mcp package outright; swallowing an unreachable-platform failure into an empty-array success."
  },
  "coding_standards": [
    "brain/docs/mcp-rules/tools.md",
    "brain/docs/mcp-rules/logging-and-progress.md",
    "brain/docs/mcp-rules/maintenance.md",
    "brain/docs/ANTI-STUB-REVIEW.md",
    "RULES.md"
  ],
  "verification_gates": [
    {
      "gate": "Registry + composition root",
      "command": "PLATFORM_IT=1 pnpm test:integration",
      "expected": "sprint31-registry-execute reports 44 tools from createMastra().listTools() and a documents row titled 's31-05-registry-write'; 0 tests skipped"
    },
    {
      "gate": "Legacy package repoint",
      "command": "PLATFORM_IT=1 pnpm test:integration",
      "expected": "sprint31-legacy-mcp-repoint reports 0 Convex matches under holocron-mcp/src and a stdio list_documents payload containing 's31-05-doc-1'"
    },
    {
      "gate": "Rehost verifier",
      "command": "cd services/platform && bun src/cli/holo.ts mcp:verify-rehost --json",
      "expected": "stdout JSON shows registeredTools 44, manifestTools 44, convexRefs [], missingExecutors [], duplicateValidationSites []"
    },
    {
      "gate": "Manifest completeness unaffected",
      "command": "cd services/platform && bun src/cli/holo.ts mcp:verify-manifest --json",
      "expected": "stdout JSON shows tools_covered 44, tools_total 44, issues []"
    },
    {
      "gate": "Typecheck",
      "command": "pnpm tsgo --noEmit",
      "expected": "0 diagnostics emitted across services/platform and holocron-mcp"
    },
    {
      "gate": "Lint",
      "command": "pnpm biome check .",
      "expected": "0 errors reported on the changed files"
    },
    {
      "gate": "Unit",
      "command": "pnpm test:unit",
      "expected": "0 failing unit tests after the registry execute change"
    }
  ],
  "acceptance_criteria": [
    {
      "id": "AC-1",
      "num": 1,
      "primary": true,
      "name": "Registry execute bodies return real Postgres results",
      "given": "GIVEN fixture live_platform_stack with real Postgres reachable and the shared registry loaded in-process",
      "when": "WHEN the caller invokes getTool('store_document').tool.execute with title 's31-05-registry-write' and then getTool('list_documents').tool.execute with limit 50",
      "then": "THEN neither call throws 'not implemented', the store call returns a document id, and the list call returns a payload containing the literal 's31-05-registry-write' backed by exactly 1 documents row",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-1 registry execute writes and reads real Postgres'",
      "test_tier": "integration",
      "verification_service": "postgres",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-1",
      "test_file": "services/platform/tests/integration/sprint31-registry-execute.test.ts",
      "test_function": "AC-1 registry execute writes and reads real Postgres",
      "tdd_state": "none"
    },
    {
      "id": "AC-2",
      "num": 2,
      "name": "Mastra composition root exposes all 44 executable tools",
      "given": "GIVEN fixture seeded_mcp_corpus and the single Mastra instance built by createMastra()",
      "when": "WHEN the caller reads createMastra().listTools() and executes mastra.getTool('list_documents') against real Postgres",
      "then": "THEN listTools() returns exactly 44 entries whose key set equals Object.keys(toolsAsRecord()), and the executed tool returns the 3 seeded 's31-05-doc-' documents",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-2 composition root exposes 44 executable tools'",
      "test_tier": "integration",
      "verification_service": "mastra",
      "unit_test_justified": false,
      "flow_ref": "UC-PLAT-02 AC-2",
      "test_file": "services/platform/tests/integration/sprint31-registry-execute.test.ts",
      "test_function": "AC-2 composition root exposes 44 executable tools",
      "tdd_state": "none"
    },
    {
      "id": "AC-3",
      "num": 3,
      "name": "Cancellation propagates through the registry execute path",
      "given": "GIVEN fixture live_platform_stack and an AbortController whose signal is aborted before the call",
      "when": "WHEN the caller invokes a registry tool execute with that aborted signal in the Mastra execution context",
      "then": "THEN the call rejects with 'MCP request cancelled' before any database dispatch and writes 0 rows, matching the gateway path proven at sprint19-mcp-rehost.test.ts:204-235",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-3 registry execute honours an aborted signal'",
      "test_tier": "integration",
      "verification_service": "postgres",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-2",
      "test_file": "services/platform/tests/integration/sprint31-registry-execute.test.ts",
      "test_function": "AC-3 registry execute honours an aborted signal",
      "tdd_state": "none"
    },
    {
      "id": "AC-4",
      "num": 4,
      "name": "holocron-mcp serves Postgres results over real stdio with zero Convex references",
      "given": "GIVEN fixture seeded_mcp_corpus, holocron-mcp/src/convex/ deleted, and PLATFORM_URL plus HOLO_KEY_MCP pointing at the running platform",
      "when": "WHEN the legacy package is booted over real stdio for initialize, tools/list and tools/call list_documents, and holocron-mcp/src is scanned for Convex references",
      "then": "THEN the package returns the same 's31-05-doc-' documents the platform gateway returns for identical arguments and the Convex scan finds 0 matches",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-4 legacy package serves Postgres over stdio with no Convex references'",
      "test_tier": "e2e",
      "verification_service": "mcp-stdio",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-2",
      "test_file": "services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts",
      "test_function": "AC-4 legacy package serves Postgres over stdio with no Convex references",
      "tdd_state": "none"
    },
    {
      "id": "AC-5",
      "num": 5,
      "name": "Repointed legacy package fails loudly when the platform is unreachable",
      "given": "GIVEN the repointed legacy package configured with a PLATFORM_URL that refuses connections",
      "when": "WHEN a client calls tools/call list_documents through it",
      "then": "THEN the response carries isError true with a screaming-snake code and 0 document objects, with no empty-array default and no Convex fallback",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-5 unreachable platform surfaces a typed error not a fabricated success'",
      "test_tier": "integration",
      "verification_service": "mcp-stdio",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-2",
      "test_file": "services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts",
      "test_function": "AC-5 unreachable platform surfaces a typed error not a fabricated success",
      "tdd_state": "none"
    },
    {
      "id": "AC-6",
      "num": 6,
      "name": "Deferred-execute residue is gone and the rehost verifier still passes",
      "given": "GIVEN the landed change on a clean tree with fixture live_platform_stack running",
      "when": "WHEN holo mcp:verify-rehost --json runs and services/platform/src/tools/registry.ts is scanned for the deferred-execute marker",
      "then": "THEN the verifier reports 44 registered tools with 0 missing executors, 0 Convex refs and 0 duplicate validation sites, and the deferred markers appear 0 times",
      "verify": "cd services/platform && bun src/cli/holo.ts mcp:verify-rehost --json",
      "test_tier": "integration",
      "verification_service": "cli",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-2",
      "test_file": "services/platform/tests/integration/sprint31-registry-execute.test.ts",
      "test_function": "AC-6 deferred execute residue is gone",
      "tdd_state": "none"
    }
  ],
  "test_criteria": [
    {
      "id": "TC-1",
      "num": 1,
      "statement": "getTool('store_document').tool.execute resolves without throwing when invoked against real Postgres.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-1 registry execute writes and reads real Postgres'",
      "type": "boolean"
    },
    {
      "id": "TC-2",
      "num": 2,
      "statement": "The documents row count for title 's31-05-registry-write' equals 1 after the registry store call.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-1 registry execute writes and reads real Postgres'",
      "type": "boolean"
    },
    {
      "id": "TC-3",
      "num": 3,
      "statement": "The list_documents registry result contains the literal 's31-05-registry-write'.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-1 registry execute writes and reads real Postgres'",
      "type": "boolean"
    },
    {
      "id": "TC-4",
      "num": 4,
      "statement": "createMastra().listTools() key count equals 44.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-2 composition root exposes 44 executable tools'",
      "type": "boolean"
    },
    {
      "id": "TC-5",
      "num": 5,
      "statement": "The createMastra().listTools() key set is deep-equal to Object.keys(toolsAsRecord()).",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-2 composition root exposes 44 executable tools'",
      "type": "boolean"
    },
    {
      "id": "TC-6",
      "num": 6,
      "statement": "The mastra.getTool('list_documents') execution result contains all 3 seeded 's31-05-doc-' titles.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-2 composition root exposes 44 executable tools'",
      "type": "boolean"
    },
    {
      "id": "TC-7",
      "num": 7,
      "statement": "Registry execute with a pre-aborted signal rejects with a message containing 'MCP request cancelled'.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-3 registry execute honours an aborted signal'",
      "type": "boolean"
    },
    {
      "id": "TC-8",
      "num": 8,
      "statement": "The documents row count for title 's31-05-cancelled' equals 0 after the aborted execute call.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-3 registry execute honours an aborted signal'",
      "type": "boolean"
    },
    {
      "id": "TC-9",
      "num": 9,
      "statement": "The grep for 'convex' under holocron-mcp/src returns 0 matches.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-4 legacy package serves Postgres over stdio with no Convex references'",
      "type": "boolean"
    },
    {
      "id": "TC-10",
      "num": 10,
      "statement": "The file holocron-mcp/src/convex/client.ts is absent from disk.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-4 legacy package serves Postgres over stdio with no Convex references'",
      "type": "boolean"
    },
    {
      "id": "TC-11",
      "num": 11,
      "statement": "The legacy stdio list_documents structuredContent is deep-equal to the platform gateway result for identical arguments.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-4 legacy package serves Postgres over stdio with no Convex references'",
      "type": "boolean"
    },
    {
      "id": "TC-12",
      "num": 12,
      "statement": "The legacy tools/call response carries isError true when PLATFORM_URL refuses connections.",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-5 unreachable platform surfaces a typed error not a fabricated success'",
      "type": "boolean"
    },
    {
      "id": "TC-13",
      "num": 13,
      "statement": "The unreachable-platform error payload code matches the screaming-snake pattern.",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-5 unreachable platform surfaces a typed error not a fabricated success'",
      "type": "boolean"
    },
    {
      "id": "TC-14",
      "num": 14,
      "statement": "mcp:verify-rehost reports registeredTools 44 with a convexRefs array of length 0.",
      "maps_to_ac": "AC-6",
      "verify": "cd services/platform && bun src/cli/holo.ts mcp:verify-rehost --json",
      "type": "boolean"
    },
    {
      "id": "TC-15",
      "num": 15,
      "statement": "The count of 'deferredExecute' occurrences in services/platform/src/tools/registry.ts equals 0.",
      "maps_to_ac": "AC-6",
      "verify": "cd services/platform && bun src/cli/holo.ts mcp:verify-rehost --json",
      "type": "boolean"
    }
  ],
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN fixture live_platform_stack WHEN the shared registry executes store_document then list_documents THEN real Postgres rows are written and returned instead of a 'not implemented' throw.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-1 registry execute writes and reads real Postgres'",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-1",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
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
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "live_platform_stack",
            "action": {
              "actor": "in-process registry consumer",
              "steps": [
                "Run `SELECT count(*) FROM documents WHERE title = 's31-05-registry-write'` and record the pre-count",
                "Call `getTool('store_document').tool.execute` with context `{ title: 's31-05-registry-write', content: 'registry execute path' }`",
                "Call `getTool('list_documents').tool.execute` with context `{ limit: 50 }`",
                "Run `SELECT id, title FROM documents WHERE title = 's31-05-registry-write'` and record the rows"
              ]
            },
            "end_state": {
              "must_observe": [
                "the `store_document` execute resolves and returns a document id string of length >= 1",
                "`SELECT count(*) FROM documents WHERE title = 's31-05-registry-write'` returns 1",
                "the `list_documents` result JSON contains the literal substring 's31-05-registry-write'",
                "the `list_documents` result carries >= 4 document entries (3 seeded plus 1 written)"
              ],
              "must_not_observe": [
                "an Error message containing 'not implemented' or 'deferred to a later sprint'",
                "a `list_documents` result with 0 documents",
                "a returned document id with no matching row in `documents`"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN fixture seeded_mcp_corpus WHEN createMastra().listTools() is read and list_documents is executed through the root THEN 44 tools resolve and the 3 seeded documents come back.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-2 composition root exposes 44 executable tools'",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-2",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "mastra",
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
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_mcp_corpus",
            "action": {
              "actor": "composition-root consumer",
              "steps": [
                "Build the single instance via `createMastra()`",
                "Read `Object.keys(mastra.listTools() ?? {})` and record its length",
                "Compare that key set against `Object.keys(toolsAsRecord())`",
                "Execute `mastra.getTool('list_documents')` with `{ limit: 50 }` and record the returned titles",
                "Run `SELECT title FROM documents WHERE title LIKE 's31-05-doc-%'` and compare"
              ]
            },
            "end_state": {
              "must_observe": [
                "`Object.keys(mastra.listTools()).length` equals 44",
                "the `listTools()` key set is deep-equal to `Object.keys(toolsAsRecord())`",
                "the executed `list_documents` result contains the 3 literals 's31-05-doc-1', 's31-05-doc-2' and 's31-05-doc-3'",
                "`services/platform/src/index.ts` contains 0 occurrences of the comment 'service-2+ register tools/agents'"
              ],
              "must_not_observe": [
                "`mastra.listTools()` returning undefined or an object with 0 keys",
                "an executed tool throwing 'not implemented'",
                "a `list_documents` result with 0 documents while 3 rows are seeded"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN an aborted AbortSignal WHEN a registry tool executes THEN it rejects with 'MCP request cancelled' and writes 0 rows.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-3 registry execute honours an aborted signal'",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-3",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "mock",
            "static",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "live_platform_stack",
            "action": {
              "actor": "in-process registry consumer",
              "steps": [
                "Run `SELECT count(*) FROM documents WHERE title = 's31-05-cancelled'` and record the pre-count",
                "Create an `AbortController` and call `abort()` before invoking anything",
                "Invoke `getTool('store_document').tool.execute` with `{ title: 's31-05-cancelled', content: 'x' }` and the aborted signal",
                "Record the rejection message verbatim",
                "Run `SELECT count(*) FROM documents WHERE title = 's31-05-cancelled'` again"
              ]
            },
            "end_state": {
              "must_observe": [
                "the execute call rejects with an Error message containing the literal 'MCP request cancelled'",
                "`SELECT count(*) FROM documents WHERE title = 's31-05-cancelled'` returns 0 both before and after the call",
                "the seeded corpus still reports 3 rows matching 's31-05-doc-%' after the aborted call, proving the connection stayed live"
              ],
              "must_not_observe": [
                "the execute call resolving with a document id",
                "a `documents` row titled 's31-05-cancelled' after the call",
                "a rejection message containing 'not implemented'",
                "a `documents` row count other than 0 for title 's31-05-cancelled'"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN the Convex client deleted WHEN holocron-mcp is driven over real stdio THEN it returns the same Postgres payload as the gateway and 0 Convex references remain.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-4 legacy package serves Postgres over stdio with no Convex references'",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-4",
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
            "start_ref": "seeded_mcp_corpus",
            "action": {
              "actor": "MCP stdio client",
              "steps": [
                "Run `grep -rn convex holocron-mcp/src` and record the match count",
                "Check `holocron-mcp/src/convex/client.ts` and `holocron-mcp/src/convex/types.ts` on disk",
                "Spawn the legacy package over stdio with `PLATFORM_URL` and `HOLO_KEY_MCP` set",
                "Send `initialize` with protocolVersion '2025-11-25' and record `serverInfo`",
                "Send `tools/list` and record the returned name count",
                "Send `tools/call list_documents` with `{ limit: 50 }` and record the returned titles",
                "Send the identical `tools/call` to the platform `/mcp` gateway and compare both structuredContent payloads"
              ]
            },
            "end_state": {
              "must_observe": [
                "`grep -rn convex holocron-mcp/src` returns 0 matches",
                "`existsSync('holocron-mcp/src/convex/client.ts')` returns false and `existsSync('holocron-mcp/src/convex/types.ts')` returns false",
                "the `initialize` response carries a `serverInfo.name` string of length >= 1",
                "the `tools/list` response returns >= 1 tool and every returned name resolves via `getTool()`",
                "the `tools/call list_documents` result contains the 3 literals 's31-05-doc-1', 's31-05-doc-2' and 's31-05-doc-3'",
                "the legacy structuredContent for `list_documents` is deep-equal to the platform gateway payload"
              ],
              "must_not_observe": [
                "any match for 'convex/browser', 'convex/server' or 'as any' under holocron-mcp/src",
                "a `tools/call` result with 0 documents while 3 rows are seeded",
                "a JSON-RPC error response to `initialize` or `tools/list`",
                "non-JSON bytes on the package stdout stream"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN an unreachable PLATFORM_URL WHEN list_documents is called through the legacy package THEN a typed isError envelope is returned rather than a fabricated success.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-5 unreachable platform surfaces a typed error not a fabricated success'",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-5",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "mcp-stdio",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "static",
            "mock"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_mcp_corpus",
            "action": {
              "actor": "MCP stdio client",
              "steps": [
                "Spawn the legacy package with `PLATFORM_URL` set to a closed local port and `HOLO_KEY_MCP` set",
                "Send `tools/call list_documents` with `{ limit: 50 }`",
                "Record the full response envelope verbatim",
                "Parse `content[0].text` as JSON and record its `code` field",
                "Confirm the same call against the live platform still returns the 3 seeded documents"
              ]
            },
            "end_state": {
              "must_observe": [
                "the response carries `result.isError` equal to true",
                "the parsed error `code` matches the pattern `^[A-Z][A-Z0-9_]+$`",
                "the parsed error `message` is a string of length >= 1 naming the unreachable platform",
                "the control call against the live platform returns 3 documents matching 's31-05-doc-%'"
              ],
              "must_not_observe": [
                "a result envelope with `isError` absent or false",
                "a structuredContent carrying an empty `documents: []` presented as success",
                "any Convex client construction as a fallback",
                "the process exiting 0 with no error surfaced"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "description": "GIVEN the landed change WHEN mcp:verify-rehost runs and the registry is scanned THEN 44 tools verify clean and 0 deferred-execute markers remain.",
      "verify": "cd services/platform && bun src/cli/holo.ts mcp:verify-rehost --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-6",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "static",
            "empty",
            "removed"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "live_platform_stack",
            "action": {
              "actor": "operator CLI",
              "steps": [
                "Run `cd services/platform && bun src/cli/holo.ts mcp:verify-rehost --json` and capture stdout",
                "Run `grep -c deferredExecute services/platform/src/tools/registry.ts` and record the count",
                "Run `grep -c 'deferred to a later sprint' services/platform/src/tools/registry.ts` and record the count"
              ]
            },
            "end_state": {
              "must_observe": [
                "the report field `registeredTools` equals 44 and `manifestTools` equals 44",
                "the report arrays `missingExecutors`, `convexRefs`, `duplicateValidationSites` and `extraTools` each have length 0",
                "`grep -c deferredExecute services/platform/src/tools/registry.ts` returns 0",
                "`grep -c 'deferred to a later sprint' services/platform/src/tools/registry.ts` returns 0"
              ],
              "must_not_observe": [
                "a `registeredTools` value below 44",
                "any remaining 'deferredExecute' occurrence in the shared registry",
                "a report with no `registeredTools` field at all",
                "a `convexRefs` array with a length other than 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "getTool('store_document').tool.execute resolves without throwing when invoked against real Postgres.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-1 registry execute writes and reads real Postgres'"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "The documents row count for title 's31-05-registry-write' equals 1 after the registry store call.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-1 registry execute writes and reads real Postgres'"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "The list_documents registry result contains the literal 's31-05-registry-write'.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-1 registry execute writes and reads real Postgres'"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "createMastra().listTools() key count equals 44.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-2 composition root exposes 44 executable tools'"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "The createMastra().listTools() key set is deep-equal to Object.keys(toolsAsRecord()).",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-2 composition root exposes 44 executable tools'"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "The mastra.getTool('list_documents') execution result contains all 3 seeded 's31-05-doc-' titles.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-2 composition root exposes 44 executable tools'"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "Registry execute with a pre-aborted signal rejects with a message containing 'MCP request cancelled'.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-3 registry execute honours an aborted signal'"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "The documents row count for title 's31-05-cancelled' equals 0 after the aborted execute call.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-registry-execute.test.ts -t 'AC-3 registry execute honours an aborted signal'"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "The grep for 'convex' under holocron-mcp/src returns 0 matches.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-4 legacy package serves Postgres over stdio with no Convex references'"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "The file holocron-mcp/src/convex/client.ts is absent from disk.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-4 legacy package serves Postgres over stdio with no Convex references'"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": "The legacy stdio list_documents structuredContent is deep-equal to the platform gateway result for identical arguments.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-4 legacy package serves Postgres over stdio with no Convex references'"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": "The legacy tools/call response carries isError true when PLATFORM_URL refuses connections.",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-5 unreachable platform surfaces a typed error not a fabricated success'"
    },
    {
      "id": "TC-13",
      "type": "test_criterion",
      "description": "The unreachable-platform error payload code matches the screaming-snake pattern.",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-5 unreachable platform surfaces a typed error not a fabricated success'"
    },
    {
      "id": "TC-14",
      "type": "test_criterion",
      "description": "mcp:verify-rehost reports registeredTools 44 with a convexRefs array of length 0.",
      "maps_to_ac": "AC-6",
      "verify": "cd services/platform && bun src/cli/holo.ts mcp:verify-rehost --json"
    },
    {
      "id": "TC-15",
      "type": "test_criterion",
      "description": "The count of 'deferredExecute' occurrences in services/platform/src/tools/registry.ts equals 0.",
      "maps_to_ac": "AC-6",
      "verify": "cd services/platform && bun src/cli/holo.ts mcp:verify-rehost --json"
    }
  ]
}
-->

</details>
