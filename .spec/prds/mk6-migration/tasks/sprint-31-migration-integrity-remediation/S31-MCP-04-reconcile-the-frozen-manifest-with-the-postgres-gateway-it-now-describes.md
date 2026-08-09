# S31-MCP-04: Reconcile the frozen manifest with the Postgres gateway it now describes

> **Task ID:** S31-MCP-04
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Agent:** `mcp-implementer`
> **Estimate:** 150 min
> **Type:** FEATURE
> **Priority:** P1 · **Effort:** M
> **PROPOSED-BY:** `mcp-planner`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

**Capabilities:** CAP-CUT-01
**PRD refs:** UC-SVC-04 AC-2, UC-SVC-04 AC-5, 01-scope.md Out of Scope (2026-08-07)

## What this does

Makes the frozen 1,845-line compatibility manifest describe the Postgres gateway that actually serves the 44 tools: declares and gates the enforced same-origin policy, records rate limiting as `not_applicable` with its scope citation, rewrites every stale Convex claim to name the real executor path, and deletes the dead per-tool `fixtures:` field.

## Why

The manifest still describes the system it replaced. `allowed_origins: null` sits beside `origin_validation: true` while `gateway.ts:68` enforces same-origin with DNS-rebinding protection. `rate_limit: null  # mcp-manifest-02 to populate` reads as unfinished work for something `01-scope.md` puts explicitly out of scope. `cancellation_policy.description` says long operations are "dispatched to Convex and are not directly cancellable" — factually wrong now. 21 `side_effects` strings name Convex modules and 15 error descriptions read "Convex query failed".

## How to verify

A foreign-`Origin` request to `/mcp` returns 403 while a same-origin one returns 200 with 44 tools, matching the now non-null declaration; `grep -ci convex` on the manifest returns 0; `rate_limit` is the literal `not_applicable`; `mcp:verify-manifest --json` still reports 44/44.

## Scope

Touches the manifest, the loader's shape, and the protocol-report header assertion. The gateway, executor and tool registry are read-only — the document is reconciled to the code, never the reverse.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-MCP-04 - Reconcile the frozen manifest with the Postgres gateway it now describes
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P1
EFFORT:     M
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

The compatibility manifest declares the origin, cancellation and side-effect behaviour the Postgres
gateway actually implements, with 0 Convex references and 44/44 coverage intact.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- NEVER implement rate limiting — 01-scope.md excludes it under the auth-hardening exclusion; the
  manifest records the exclusion, it does not create the work.
- NEVER change a tool id, input_schema, output_schema, transports list, or replay contract; this
  task reconciles prose and header policy, not the tool surface.
- NEVER declare a cancellation posture the gateway does not implement — the claim must trace to
  `extra.signal` threading at gateway.ts:24-31 and its proof at sprint19-mcp-rehost.test.ts:204-235.
- NEVER declare an origin allowlist the gateway does not enforce; `gateway.ts:68` derives
  `allowedOrigins` from the request URL, so the declaration is same-origin, not a hostname list.
- NEVER edit `services/platform/src/mcp/gateway.ts` to match the manifest — the code is the truth
  and the document is what changes.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] A foreign-Origin `/mcp` request returns 403 and a same-origin one returns 200 with 44 tools,
      matching a non-null `allowed_origins` — maps to AC-1 (PRIMARY)
- [ ] `mcp:verify-manifest --protocol` exits non-zero when `origin_validation: true` sits beside
      `allowed_origins: null` — AC-2
- [ ] `grep -ci convex` on the manifest returns 0 and all 21 `side_effects` name a Postgres path — AC-3
- [ ] `rate_limit` is the literal `not_applicable` with a 01-scope.md citation and 0 rate-limiting
      code was added — AC-4
- [ ] The `fixtures:` key appears 0 times, `ManifestTool` has no `fixtures`, coverage stays 44/44 — AC-5
- [ ] A reintroduced Convex cancellation claim fails the prose gate — AC-6
- [ ] `PLATFORM_IT=1 pnpm test:integration` passes + `pnpm tsgo --noEmit` clean
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: The declared origin policy equals the enforced one [PRIMARY]
  GIVEN: fixture reconciled_manifest and fixture live_gateway_stack
  WHEN:  the declared policy is read and two real /mcp requests are issued, foreign and same origin
  THEN:  403 for the foreign Origin, 200 with 44 tools for same-origin, matching the declaration

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  mcp-http
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts
  TEST_FUNCTION: AC-1 declared origin policy matches enforced behaviour

  SCENARIO:
    START_REF:        live_gateway_stack
    NEGATIVE_CONTROL: would fail if stub | mock | static | empty | disconnect
    EVIDENCE:         api_response (capture required)
    CASE 0:
      ACTION: load the manifest and read allowed_origins/origin_validation; POST tools/list with
              Origin https://evil.example; POST tools/list same-origin; confirm gateway.ts wiring.
      MUST_OBSERVE:
        - auth_policy.streamable_http.allowed_origins is non-null and declares a same-origin policy
        - auth_policy.streamable_http.origin_validation equals true
        - the foreign-Origin request returns HTTP status 403
        - the same-origin request returns HTTP status 200 listing 44 tools
      MUST_NOT_OBSERVE:
        - allowed_origins being null while origin_validation is true
        - the foreign-Origin request returning HTTP status 200
        - the same-origin request returning HTTP 403 or listing 0 tools
        - a declared origin list naming hosts the gateway does not accept

AC-2: The header gate refuses origin_validation without allowed_origins
  GIVEN: fixture regressed_manifest_copies copy A (allowed_origins null, origin_validation true)
  WHEN:  mcp:verify-manifest --protocol runs against copy A, then the reconciled manifest
  THEN:  copy A exits non-zero naming allowed_origins; the reconciled manifest exits 0

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts
  TEST_FUNCTION: AC-2 header gate refuses origin_validation without allowed_origins

  SCENARIO:
    START_REF:        regressed_manifest_copies
    NEGATIVE_CONTROL: would fail if static | stub | empty | removed
    EVIDENCE:         stdout (capture required)
    CASE 0:
      ACTION: copy the manifest to a temp path with allowed_origins null; run the CLI --protocol on
              it; run the same command on the real reconciled manifest.
      MUST_OBSERVE:
        - the copy-A run exits with a code other than 0
        - the copy-A output contains the literal 'allowed_origins'
        - the reconciled-manifest run exits with code 0
        - the reconciled-manifest output reports the protocol pin '2025-11-25'
      MUST_NOT_OBSERVE:
        - the copy-A run exiting with code 0
        - the reconciled-manifest run exiting with a code other than 0
        - output that names no field when the assertion fails

AC-3: Every stale Convex claim is replaced by the Postgres path
  GIVEN: fixture reconciled_manifest
  WHEN:  the manifest is scanned for Convex references and its declarations are read
  THEN:  0 matches; trust boundary names DATABASE_URL; 21 side_effects name a Postgres path

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts
  TEST_FUNCTION: AC-3 no stale Convex claims remain in the manifest

  SCENARIO:
    START_REF:        reconciled_manifest
    NEGATIVE_CONTROL: would fail if static | stub | empty | unchanged
    EVIDENCE:         stdout (capture required)
    CASE 0:
      ACTION: case-insensitive grep for convex; read auth_policy.stdio.trust_boundary; read
              cancellation_policy.description; collect non-null side_effects; count the old error text.
      MUST_OBSERVE:
        - the case-insensitive 'convex' match count over the manifest equals 0
        - auth_policy.stdio.trust_boundary contains the literal 'DATABASE_URL'
        - cancellation_policy.description names the Postgres executor and the threaded abort signal
        - 21 tool entries carry a non-null side_effects string
        - all 21 side_effects strings name a Postgres executor path and 0 name a Convex module
        - the count of error descriptions reading 'Convex query failed' equals 0, down from 15
      MUST_NOT_OBSERVE:
        - any occurrence of 'CONVEX_URL', 'CONVEX_DEPLOYMENT' or 'dispatched to Convex'
        - a side_effects count other than 21
        - a side_effects string still naming a module such as 'subscriptions/mutations:add'
        - a side_effects set with 0 entries, meaning the mutation tools lost their declarations

AC-4: Rate limiting is recorded as out of scope, not as unfinished work
  GIVEN: fixture reconciled_manifest
  WHEN:  auth_policy.streamable_http.rate_limit and its comment are read
  THEN:  literal not_applicable, a 01-scope.md citation, and 0 rate-limiting code introduced

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts
  TEST_FUNCTION: AC-4 rate limiting is recorded as not_applicable with its scope citation

  SCENARIO:
    START_REF:        reconciled_manifest
    NEGATIVE_CONTROL: would fail if static | empty | stub | unchanged
    EVIDENCE:         stdout (capture required)
    CASE 0:
      ACTION: read rate_limit and its raw YAML comment; grep for the old TODO text; grep the diff
              for rate-limit middleware identifiers.
      MUST_OBSERVE:
        - auth_policy.streamable_http.rate_limit equals the literal string 'not_applicable'
        - the rate_limit line comment contains the literal '01-scope.md'
        - the count of 'mcp-manifest-02 to populate' occurrences in the manifest equals 0
        - the count of newly introduced rate-limit middleware identifiers in the diff equals 0
      MUST_NOT_OBSERVE:
        - rate_limit still null
        - a comment reading as a TODO or future-population note
        - any new rate-limiting implementation, config key or dependency in the diff
        - a rate-limit middleware count other than 0 in the diff

AC-5: The dead fixtures field is gone and coverage is unchanged
  GIVEN: fixture reconciled_manifest with the per-tool fixtures key removed everywhere
  WHEN:  the manifest and loader are scanned and mcp:verify-manifest --json runs
  THEN:  0 fixtures keys, no ManifestTool property, 44/44 coverage, convention documented

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts
  TEST_FUNCTION: AC-5 dead fixtures field removed with coverage unchanged

  SCENARIO:
    START_REF:        reconciled_manifest
    NEGATIVE_CONTROL: would fail if static | empty | stub | removed
    EVIDENCE:         stdout (capture required)
    CASE 0:
      ACTION: grep the manifest for fixtures:; load it and check each tool entry; grep
              manifest-loader.ts; run the CLI --json; confirm the header documents the convention.
      MUST_OBSERVE:
        - the fixtures: key count in the manifest equals 0, down from 44
        - 0 loaded tool entries carry an own property named fixtures
        - the fixtures occurrence count in manifest-loader.ts equals 0
        - the verify-manifest run exits 0 with tools_covered 44 and tools_total 44
        - the header contains the literal convention '{toolId}_{success|error|replay}.json'
      MUST_NOT_OBSERVE:
        - any remaining 'fixtures: null' line in the manifest
        - a ManifestTool type still declaring fixtures: unknown
        - tools_covered dropping below 44 after the field removal
        - the convention left undocumented in the header
        - a fixtures: key count other than 0 in the manifest

AC-6: A reintroduced Convex claim fails the prose gate
  GIVEN: fixture regressed_manifest_copies copy B with the Convex cancellation description restored
  WHEN:  the Convex-prose assertion runs against copy B and the reconciled manifest
  THEN:  copy B fails naming cancellation_policy; the reconciled manifest passes

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts
  TEST_FUNCTION: AC-6 reintroduced Convex prose fails the gate

  SCENARIO:
    START_REF:        regressed_manifest_copies
    NEGATIVE_CONTROL: would fail if static | stub | empty | unchanged
    EVIDENCE:         stdout (capture required)
    CASE 0:
      ACTION: copy the reconciled manifest and restore the Convex cancellation description verbatim;
              run the assertion on copy B and on the real manifest; record both match counts.
      MUST_OBSERVE:
        - the assertion fails against copy B with 1 reported violation
        - the copy-B failure message names 'cancellation_policy'
        - copy B's case-insensitive 'convex' match count is >= 1
        - the reconciled manifest passes the assertion with a match count of 0
      MUST_NOT_OBSERVE:
        - copy B passing the assertion
        - the reconciled manifest failing the assertion
        - a failure message that names no field
        - a copy-B match count of 0, which would mean the regression was never seeded

--------------------------------------------------------------------------------
FIXTURES (shared seed data — referenced by START_REF)
--------------------------------------------------------------------------------

reconciled_manifest (seed_method: migration_fixture)
  The real committed manifest after this task's edits, loaded through the real manifest-loader and
  served by the real gateway — the artifact every AC reads.
  - 1 manifest file at 14-mcp-compatibility-manifest.yaml carrying 44 tool entries
  - auth_policy.streamable_http.allowed_origins declaring the enforced same-origin policy (non-null)
  - auth_policy.streamable_http.rate_limit equal to the literal not_applicable with a 01-scope.md
    citation comment
  - 21 side_effects strings naming a Postgres executor path instead of a Convex module
  - 0 occurrences of the substring 'onvex' anywhere in the file
  - 0 occurrences of the key fixtures: across all 44 entries

regressed_manifest_copies (seed_method: migration_fixture)
  Temp copies of the reconciled manifest with one regression reintroduced each, used as negative
  controls proving the new gate assertions have teeth.
  - copy A: allowed_origins set back to null while origin_validation stays true
  - copy B: cancellation_policy.description restored to the 'dispatched to Convex' text

live_gateway_stack (seed_method: cli)
  The real Hono app serving /mcp against real Postgres with the MCP scoped key.
  - createHonoApp started with a non-empty mcp scoped key configured
  - DATABASE_URL reachable so tools/list resolves the 44 registered tools
  - 1 documents row via `tools/call store_document` with title s31-mcp04-doc so the same-origin
    control returns real data

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml (MODIFY)
- services/platform/src/mcp/manifest-loader.ts (MODIFY — drop ManifestTool.fixtures and its
  assignment)
- services/platform/src/mcp/verify-manifest.ts (MODIFY — the header assertion in buildProtocolReport)
- services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts (NEW)

writeProhibited:
- services/platform/src/mcp/gateway.ts — the manifest is reconciled to the code, never the reverse
- services/platform/src/mcp/executor.ts — out of scope
- services/platform/src/tools/registry.ts — the tool surface is frozen for this task
- services/platform/tests/fixtures/mcp-manifest/ — fixtures are frozen; only the manifest's
  description of them changes
- services/platform/src/http/middleware/scoped-key.ts — no rate limiting, explicitly out of scope
- .spec/prds/mk6-migration/01-scope.md — cited, never edited
- Any file not explicitly listed above

--------------------------------------------------------------------------------
BOUNDARIES (✅ Always / ⚠️ Ask First) — Never tier lives at CRITICAL CONSTRAINTS above
--------------------------------------------------------------------------------

✅ Always:
- Trace every rewritten claim to a specific enforced line (gateway.ts:68 for origins, :24-31 for
  cancellation, the executor's dispatch case for each side_effects string).
- Preserve YAML indentation, key order and block-scalar style; reflow nothing untouched.
- Pair every new declaration with an assertion plus a negative control that reintroduces the old one.
- Copy the manifest to a temp path via mkdtempSync for controls; clean up in a finally block.
- Update the manifest's own stale header comment (:2-5), which still names holocron-mcp's stdio.ts
  as the source of truth for tool ids.

⚠️ Ask First:
- Adding any new top-level manifest key beyond the reconciliations listed here.
- Changing the `mcp:verify-manifest --protocol` exit-code contract.
- Rewording a side_effects string in a way that changes what the tool is documented to do (as
  opposed to where it does it).

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml (MODIFY):
  the reconciled contract; blocker artifact every gate and test below reads.
- services/platform/src/mcp/verify-manifest.ts (MODIFY): the allowed_origins/origin_validation
  header assertion in buildProtocolReport.
- services/platform/src/mcp/manifest-loader.ts (MODIFY): ManifestTool without `fixtures`.
- services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts (NEW): AC-1..AC-6.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  READ:   Current AC definition, existing tests, code patterns (see READING LIST)
  WRITE:  ONE test that exercises GIVEN-WHEN-THEN
  RUN:    PLATFORM_IT=1 pnpm test:integration -- {test_file}
  VERIFY: Test FAILS (not errors — fails). AC-1's RED is the null allowed_origins beside an
          enforced 403; AC-3's RED is the case-insensitive convex match count of 49.
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

1. services/platform/tests/integration/sprint19-mcp-rehost.test.ts [PRIMARY PATTERN]
   - Lines: 149-183, 204-235
   - Focus: the real 401/403 origin and sampling-refusal assertions against the live Hono app, and
     the twice-proven cancellation behaviour. AC-1 extends the first into a declaration-versus-
     enforcement comparison; AC-3's rewritten cancellation prose cites the second.

2. .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml
   - Lines: 1-36, 37-68
   - Focus: the header being reconciled (stdio trust_boundary naming CONVEX_URL at :18,
     allowed_origins null at :24, rate_limit null at :25, Convex cancellation text at :29-34) and a
     representative tool entry showing `fixtures: null` at :68 and 'Convex query failed' at :62 —
     both patterns repeat across all 44 entries.

3. services/platform/src/mcp/gateway.ts
   - Lines: 24-31, 63-73
   - Focus: the enforced truth — `extra.signal` threaded into executePostgresMcpTool, and
     `allowedOrigins: [new URL(request.url).origin]` with `enableDnsRebindingProtection: true` and
     `sessionIdGenerator: undefined`.

4. services/platform/src/mcp/verify-manifest.ts
   - Lines: 205-233
   - Focus: buildProtocolReport — where the allowed_origins/origin_validation header assertion
     belongs, and how it returns a named message-bearing failure rather than throwing.

5. .spec/prds/mk6-migration/01-scope.md
   - Lines: 56, 74
   - Focus: the auth-hardening exclusion and the 2026-08-07 'MCP transport rate limiting' entry that
     already prescribes `rate_limit: not_applicable` with this citation — copy the disposition, do
     not re-derive it.

--------------------------------------------------------------------------------
EVIDENCE GATES (fast/cheap first — fail fast)
--------------------------------------------------------------------------------

Gate 1: RED phase evidence
  Required: the pre-change case-insensitive convex match count of 49 and the null allowed_origins
            standing beside a real enforced 403.

Gate 2: Each AC has a test
  Verify: 6 test functions in sprint31-manifest-reconciliation.test.ts, one per AC.

Gate 3: Declared origin policy matches enforcement
  Command: PLATFORM_IT=1 pnpm test:integration
  Expected: a foreign-Origin /mcp request returns HTTP 403 and a same-origin request returns HTTP
            200 with 44 tools, against a non-null allowed_origins declaration.

Gate 4: Header policy gate
  Command: cd services/platform && bun src/cli/holo.ts mcp:verify-manifest --protocol
  Expected: protocol 2025-11-25 with both transports listed and allowed_origins non-null under
            origin_validation true.

Gate 5: Convex prose purge
  Command: PLATFORM_IT=1 pnpm test:integration
  Expected: the manifest's case-insensitive convex match count is 0 and 21 side_effects strings name
            a Postgres executor path.

Gate 6: Manifest coverage unchanged
  Command: cd services/platform && bun src/cli/holo.ts mcp:verify-manifest --json
  Expected: tools_covered 44, tools_total 44, issues [].

Gate 7: Type check + lint
  Command: pnpm tsgo --noEmit ; pnpm biome check .
  Expected: 0 diagnostics after ManifestTool loses its fixtures property; 0 lint errors.

Gate 8: Scenario is un-fakeable (PRIMARY)
  Verify: validate_scenario.py exits 0 on the contract below (6 scenarios, 0 violations).
  Verify: AC-1 was watched FAIL against the null-allowed_origins start state before it went green.
  Verify: the captured api_response artifact shows the 403/200 pair, not merely 'tests passed'.
  Reject: a prose edit with no gate, so the next drift is invisible.

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Implementing rate limiting of any kind — the manifest records it as `not_applicable`; that is a
  citation, not a licence. Excluded by 01-scope.md (2026-08-07). (Most likely thing to be mistaken
  for in-scope.)
- Adding provenance capture to the success/error/replay fixtures — also excluded by 01-scope.md;
  UC-SVC-04 AC-5 says "frozen", not "captured".
- Changing any tool id, schema, transports list, or replay contract — the surface is frozen.
- The verify-manifest replay/error-fixture gate holes — S31-MCP-03, which this task depends on.
- Making the 44 tools executable or repointing holocron-mcp — S31-05.

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** The manifest is 1,845 lines with 49 lines mentioning Convex, 44 `fixtures: null`
entries, 21 mutation tools whose `side_effects` name Convex modules, and 15 error descriptions
reading "Convex query failed". Its header still describes the Sprint-03 skeleton and names
`holocron-mcp/src/mastra/stdio.ts` as the source of truth for tool ids. `allowed_origins` and
`rate_limit` are both null, the latter with an "mcp-manifest-02 to populate" comment.

**Gap:** The frozen contract describes the system it replaced. The gateway enforces same-origin with
DNS-rebinding protection and threads a real abort signal into a Postgres executor; the manifest says
origins are unvalidated-by-declaration and that long operations are dispatched to Convex and are not
cancellable. Deleting `fixtures:` is safe precisely because fixtures resolve by filename convention
in both verify-manifest.ts and the sweep — S31-MCP-03 makes that convention load-bearing for all
three fixture kinds, which is why this task is sequenced after it. The 21 side_effects rewrites are
the bulk of the work and must be written by reading each tool's executor dispatch case, not by
find-and-replace on the module string.

--------------------------------------------------------------------------------
REVIEW (for mcp-reviewer)
--------------------------------------------------------------------------------

Must pass (≤5, evidence-gate-backed):
- One test per AC; AC-1 runs against the real Hono app and real Postgres, not a fixture
- RED evidence: the 49-match convex count and the null-allowed_origins state are recorded
- Minimal implementation: manifest prose + one header assertion + one loader field removal
- Pattern consistent with READING LIST [PRIMARY PATTERN] (declaration-versus-enforcement)
- SCOPE respected (git diff --name-only ⊆ writeAllowed)

Should verify (≤5, judgment):
- Every rewritten side_effects string names a concrete executor path for that specific tool, not a
  generic "writes to Postgres"
- No rate-limiting code, config key, or dependency appears anywhere in the diff
- gateway.ts is byte-identical before and after — the document moved, not the code
- The fixtures removal touched the interface and the loader assignment together, with no
  optional-property leftovers
- Coverage held at 44/44 across the whole change, not just at the end

Verdict: [APPROVED | NEEDS_FIXES]
Feedback (required if NEEDS_FIXES):
```
[Specific, actionable issues — reference file:line where possible]
```

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: S31-MCP-03 (the `{toolId}_{success|error|replay}.json` convention must be load-bearing
            for all three fixture kinds before the declarative `fixtures:` field is deleted)
Blocks:     none
Parallel:   S31-05, S31-MCP-01 (disjoint files)

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable)
--------------------------------------------------------------------------------
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-MCP-04",
  "task_type": "FEATURE",
  "tdd_mode": "red_first",
  "proposed_by": "mcp-planner",
  "agent": "mcp-implementer",
  "agent_rationale": "A contract-reconciliation task on the MCP compatibility manifest: it requires reading the enforced transport behaviour (allowedOrigins, DNS-rebinding protection, signal-threaded cancellation) out of the SDK wiring and re-expressing it as a declaration a gate can check. Origin policy, cancellation posture and the fixture-resolution convention are MCP-surface knowledge.",
  "estimate_minutes": 150,
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "critical_constraints": {
    "must": [
      "MUST declare the origin policy the gateway actually enforces — allowedOrigins derived from the request URL with enableDnsRebindingProtection true (gateway.ts:63-73) — never a hostname list invented for the manifest.",
      "MUST replace rate_limit null and its 'mcp-manifest-02 to populate' comment at :25 with rate_limit not_applicable plus the 01-scope.md citation.",
      "MUST rewrite every stale Convex claim to name the real Postgres path: the stdio trust_boundary at :18, the cancellation_policy description at :29-34, all 21 non-null side_effects strings, and the 15 error descriptions reading 'Convex query failed'.",
      "MUST delete the per-tool fixtures field from all 44 entries AND from ManifestTool plus loadManifest (manifest-loader.ts:24,69), documenting the {toolId}_{success|error|replay}.json convention the gate already uses."
    ],
    "never": [
      "NEVER implement rate limiting — 01-scope.md excludes it under the auth-hardening exclusion; the manifest records the exclusion, it does not create work.",
      "NEVER change a tool id, input_schema, output_schema, transports list, or replay contract — this task reconciles prose and header policy, not the tool surface.",
      "NEVER declare a cancellation posture the gateway does not implement; the claim must trace to extra.signal threading at gateway.ts:24-31 and its proof at sprint19-mcp-rehost.test.ts:204-235."
    ],
    "strictly": [
      "STRICTLY keep mcp:verify-manifest at 44/44 through the change — a reconciliation that drops coverage has broken the contract it was meant to describe.",
      "STRICTLY cite the scope document by path and date for the rate-limit disposition so a later reader does not re-open it as a TODO."
    ]
  },
  "specification": {
    "objective": "Bring the frozen 1,845-line compatibility manifest into agreement with the system it now describes: declare the same-origin policy the gateway enforces and gate it, record rate limiting as not_applicable with its scope citation, rewrite the 49 lines of stale Convex prose to name the Postgres executor path, and delete the dead per-tool fixtures field that manifest-loader.ts:24,69 loads and nothing reads.",
    "success_state": "The manifest's case-insensitive convex match count is 0; allowed_origins declares the enforced same-origin policy and rate_limit is the literal not_applicable with a 01-scope.md citation; a real foreign-Origin request to /mcp is refused while a same-origin request is served; a temp manifest with allowed_origins null under origin_validation true fails the header gate; the fixtures key appears 0 times and is absent from ManifestTool; and mcp:verify-manifest still reports 44/44."
  },
  "fixtures": {
    "reconciled_manifest": {
      "description": "The real committed manifest after this task's edits, loaded through the real manifest-loader and served by the real gateway — the artifact every AC reads.",
      "seed_method": "migration_fixture",
      "records": [
        "1 manifest file at `.spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml` carrying 44 tool entries",
        "`auth_policy.streamable_http.allowed_origins` declaring the enforced same-origin policy as a non-null value",
        "`auth_policy.streamable_http.rate_limit` equal to the literal `not_applicable` with a `01-scope.md` citation comment",
        "21 `side_effects` strings naming a Postgres executor path instead of a Convex module",
        "0 occurrences of the substring `onvex` anywhere in the file",
        "0 occurrences of the key `fixtures:` across all 44 entries"
      ]
    },
    "regressed_manifest_copies": {
      "description": "Temp copies of the reconciled manifest with one regression reintroduced each, used as negative controls proving the new gate assertions have teeth.",
      "seed_method": "migration_fixture",
      "records": [
        "copy A: identical to the reconciled manifest except `allowed_origins` set back to `null` while `origin_validation` stays `true`",
        "copy B: identical except `cancellation_policy.description` restored to the text claiming long operations are 'dispatched to Convex and are not directly cancellable'"
      ]
    },
    "live_gateway_stack": {
      "description": "The real Hono app serving /mcp against real Postgres with the MCP scoped key, used to confirm the declared origin policy equals the enforced one.",
      "seed_method": "cli",
      "records": [
        "`createHonoApp` started with a non-empty `mcp` scoped key configured",
        "`DATABASE_URL` reachable so `tools/list` resolves the 44 registered tools",
        "1 `documents` row created via `tools/call store_document` with title `s31-mcp04-doc` so the same-origin control returns real data"
      ]
    }
  },
  "guardrails": {
    "write_allowed": [
      ".spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml",
      "services/platform/src/mcp/manifest-loader.ts",
      "services/platform/src/mcp/verify-manifest.ts",
      "services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts"
    ],
    "write_prohibited": [
      "services/platform/src/mcp/gateway.ts — the manifest is reconciled to the code, never the reverse",
      "services/platform/src/mcp/executor.ts — out of scope",
      "services/platform/src/tools/registry.ts — the tool surface is frozen for this task",
      "services/platform/tests/fixtures/mcp-manifest/ — fixtures are frozen; only the manifest's description of them changes",
      "services/platform/src/http/middleware/scoped-key.ts — no rate limiting, explicitly out of scope",
      ".spec/prds/mk6-migration/01-scope.md — cited, never edited"
    ]
  },
  "design": {
    "references": [
      "UC-SVC-04 AC-2 — declared auth, cancellation, idempotency, origin validation, no server-to-client sampling",
      "UC-SVC-04 AC-5 — the manifest covers every registered tool and both transports",
      "01-scope.md (2026-08-07) — MCP transport rate limiting excluded, provenance-captured fixtures excluded",
      "CAP-CUT-01 — the manifest is the frozen contract the cutover boundary is measured against",
      "brain/docs/mcp-rules/transport.md — stateless Streamable HTTP and origin-validation posture"
    ],
    "pattern": "Declaration-matches-enforcement: every manifest claim is paired with an assertion that exercises the real behaviour it describes, plus a negative control that reintroduces the old claim and fails.",
    "pattern_source": "services/platform/tests/integration/sprint19-mcp-rehost.test.ts:149-183 — real 401/403 origin and sampling-refusal assertions against the live Hono app, extended here into a declaration-versus-enforcement comparison.",
    "anti_pattern": "Editing prose with no gate so the next drift is invisible; declaring an origin allowlist the gateway does not implement; treating rate_limit not_applicable as licence to add rate limiting; deleting the fixtures field while ManifestTool still declares it; find-and-replacing Convex module names into generic 'Postgres' text that names no actual executor path."
  },
  "coding_standards": [
    "brain/docs/mcp-rules/transport.md",
    "brain/docs/mcp-rules/security.md",
    "brain/docs/mcp-rules/maintenance.md",
    "brain/docs/ANTI-STUB-REVIEW.md",
    "RULES.md"
  ],
  "verification_gates": [
    {
      "gate": "Declared origin policy matches enforcement",
      "command": "PLATFORM_IT=1 pnpm test:integration",
      "expected": "a foreign-Origin /mcp request returns HTTP 403 and a same-origin request returns HTTP 200 with 44 tools, against a non-null allowed_origins declaration"
    },
    {
      "gate": "Header policy gate",
      "command": "cd services/platform && bun src/cli/holo.ts mcp:verify-manifest --protocol",
      "expected": "protocol 2025-11-25 with both transports listed and allowed_origins non-null under origin_validation true"
    },
    {
      "gate": "Convex prose purge",
      "command": "PLATFORM_IT=1 pnpm test:integration",
      "expected": "the manifest's case-insensitive convex match count is 0 and 21 side_effects strings name a Postgres executor path"
    },
    {
      "gate": "Manifest coverage unchanged",
      "command": "cd services/platform && bun src/cli/holo.ts mcp:verify-manifest --json",
      "expected": "stdout JSON shows tools_covered 44, tools_total 44 and issues []"
    },
    {
      "gate": "Typecheck",
      "command": "pnpm tsgo --noEmit",
      "expected": "0 diagnostics after ManifestTool loses its fixtures property"
    },
    {
      "gate": "Lint",
      "command": "pnpm biome check .",
      "expected": "0 errors reported on the changed files"
    },
    {
      "gate": "Unit",
      "command": "pnpm test:unit",
      "expected": "0 failing unit tests after the loader shape change"
    }
  ],
  "acceptance_criteria": [
    {
      "id": "AC-1",
      "num": 1,
      "primary": true,
      "name": "The declared origin policy equals the enforced one",
      "given": "GIVEN fixture reconciled_manifest and fixture live_gateway_stack",
      "when": "WHEN the declared streamable_http origin policy is read and two real /mcp requests are issued — one with a foreign Origin, one same-origin — both with a valid bearer key",
      "then": "THEN the foreign-Origin request is refused with HTTP 403 and the same-origin request is served with HTTP 200 returning 44 tools, matching the non-null same-origin declaration",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-1 declared origin policy matches enforced behaviour'",
      "test_tier": "integration",
      "verification_service": "mcp-http",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-2",
      "test_file": "services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts",
      "test_function": "AC-1 declared origin policy matches enforced behaviour",
      "tdd_state": "none"
    },
    {
      "id": "AC-2",
      "num": 2,
      "name": "The header gate refuses origin_validation without allowed_origins",
      "given": "GIVEN fixture regressed_manifest_copies copy A with allowed_origins null and origin_validation true",
      "when": "WHEN mcp:verify-manifest --protocol runs against copy A and then against the reconciled manifest",
      "then": "THEN copy A exits non-zero naming allowed_origins while the reconciled manifest exits 0, proving the assertion works in both directions",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-2 header gate refuses origin_validation without allowed_origins'",
      "test_tier": "integration",
      "verification_service": "cli",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-5",
      "test_file": "services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts",
      "test_function": "AC-2 header gate refuses origin_validation without allowed_origins",
      "tdd_state": "none"
    },
    {
      "id": "AC-3",
      "num": 3,
      "name": "Every stale Convex claim is replaced by the Postgres path",
      "given": "GIVEN fixture reconciled_manifest",
      "when": "WHEN the manifest is scanned for Convex references and its rewritten declarations are read",
      "then": "THEN the case-insensitive convex match count is 0, the stdio trust boundary names DATABASE_URL, the cancellation description names the signal-threaded Postgres executor, and all 21 side_effects strings name a Postgres executor path",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-3 no stale Convex claims remain in the manifest'",
      "test_tier": "integration",
      "verification_service": "cli",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-2",
      "test_file": "services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts",
      "test_function": "AC-3 no stale Convex claims remain in the manifest",
      "tdd_state": "none"
    },
    {
      "id": "AC-4",
      "num": 4,
      "name": "Rate limiting is recorded as out of scope, not as unfinished work",
      "given": "GIVEN fixture reconciled_manifest",
      "when": "WHEN auth_policy.streamable_http.rate_limit and its surrounding comment are read",
      "then": "THEN the value is the literal not_applicable, the comment cites 01-scope.md's 2026-08-07 exclusion, and 0 rate-limiting middleware was introduced anywhere in the change",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-4 rate limiting is recorded as not_applicable with its scope citation'",
      "test_tier": "integration",
      "verification_service": "cli",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-5",
      "test_file": "services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts",
      "test_function": "AC-4 rate limiting is recorded as not_applicable with its scope citation",
      "tdd_state": "none"
    },
    {
      "id": "AC-5",
      "num": 5,
      "name": "The dead fixtures field is gone and coverage is unchanged",
      "given": "GIVEN fixture reconciled_manifest with the per-tool fixtures key removed from all 44 entries and from the loader",
      "when": "WHEN the manifest is scanned for the key, ManifestTool is inspected, and mcp:verify-manifest --json runs",
      "then": "THEN the fixtures key appears 0 times, ManifestTool has no fixtures property, the gate still reports 44/44, and the filename convention is documented in the header",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-5 dead fixtures field removed with coverage unchanged'",
      "test_tier": "integration",
      "verification_service": "cli",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-5",
      "test_file": "services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts",
      "test_function": "AC-5 dead fixtures field removed with coverage unchanged",
      "tdd_state": "none"
    },
    {
      "id": "AC-6",
      "num": 6,
      "name": "A reintroduced Convex claim fails the prose gate",
      "given": "GIVEN fixture regressed_manifest_copies copy B whose cancellation_policy description again claims Convex dispatch",
      "when": "WHEN the Convex-prose assertion runs against copy B and then against the reconciled manifest",
      "then": "THEN copy B fails with a message naming cancellation_policy while the reconciled manifest passes, proving the prose check is a gate rather than a one-time edit",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-6 reintroduced Convex prose fails the gate'",
      "test_tier": "integration",
      "verification_service": "cli",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-2",
      "test_file": "services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts",
      "test_function": "AC-6 reintroduced Convex prose fails the gate",
      "tdd_state": "none"
    }
  ],
  "test_criteria": [
    {
      "id": "TC-1",
      "num": 1,
      "statement": "auth_policy.streamable_http.allowed_origins is non-null in the reconciled manifest.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-1 declared origin policy matches enforced behaviour'",
      "type": "boolean"
    },
    {
      "id": "TC-2",
      "num": 2,
      "statement": "A /mcp request with Origin https://evil.example and a valid bearer key returns HTTP status 403.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-1 declared origin policy matches enforced behaviour'",
      "type": "boolean"
    },
    {
      "id": "TC-3",
      "num": 3,
      "statement": "A same-origin /mcp tools/list request returns HTTP status 200 with 44 tools.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-1 declared origin policy matches enforced behaviour'",
      "type": "boolean"
    },
    {
      "id": "TC-4",
      "num": 4,
      "statement": "mcp:verify-manifest --protocol exits non-zero against a manifest with allowed_origins null and origin_validation true.",
      "maps_to_ac": "AC-2",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-2 header gate refuses origin_validation without allowed_origins'",
      "type": "boolean"
    },
    {
      "id": "TC-5",
      "num": 5,
      "statement": "mcp:verify-manifest --protocol exits 0 against the reconciled manifest.",
      "maps_to_ac": "AC-2",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-2 header gate refuses origin_validation without allowed_origins'",
      "type": "boolean"
    },
    {
      "id": "TC-6",
      "num": 6,
      "statement": "The case-insensitive convex match count over the manifest equals 0.",
      "maps_to_ac": "AC-3",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-3 no stale Convex claims remain in the manifest'",
      "type": "boolean"
    },
    {
      "id": "TC-7",
      "num": 7,
      "statement": "The manifest carries exactly 21 tool entries with a non-null side_effects string.",
      "maps_to_ac": "AC-3",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-3 no stale Convex claims remain in the manifest'",
      "type": "boolean"
    },
    {
      "id": "TC-8",
      "num": 8,
      "statement": "auth_policy.stdio.trust_boundary contains the literal DATABASE_URL.",
      "maps_to_ac": "AC-3",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-3 no stale Convex claims remain in the manifest'",
      "type": "boolean"
    },
    {
      "id": "TC-9",
      "num": 9,
      "statement": "auth_policy.streamable_http.rate_limit equals the literal string not_applicable.",
      "maps_to_ac": "AC-4",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-4 rate limiting is recorded as not_applicable with its scope citation'",
      "type": "boolean"
    },
    {
      "id": "TC-10",
      "num": 10,
      "statement": "The manifest carries 0 occurrences of the literal mcp-manifest-02 to populate.",
      "maps_to_ac": "AC-4",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-4 rate limiting is recorded as not_applicable with its scope citation'",
      "type": "boolean"
    },
    {
      "id": "TC-11",
      "num": 11,
      "statement": "The manifest carries 0 occurrences of the key fixtures.",
      "maps_to_ac": "AC-5",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-5 dead fixtures field removed with coverage unchanged'",
      "type": "boolean"
    },
    {
      "id": "TC-12",
      "num": 12,
      "statement": "manifest-loader.ts carries 0 occurrences of the identifier fixtures.",
      "maps_to_ac": "AC-5",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-5 dead fixtures field removed with coverage unchanged'",
      "type": "boolean"
    },
    {
      "id": "TC-13",
      "num": 13,
      "statement": "mcp:verify-manifest --json reports tools_covered 44 and tools_total 44 after the field removal.",
      "maps_to_ac": "AC-5",
      "verify": "cd services/platform && bun src/cli/holo.ts mcp:verify-manifest --json",
      "type": "boolean"
    },
    {
      "id": "TC-14",
      "num": 14,
      "statement": "The Convex-prose assertion fails against a manifest whose cancellation_policy description names Convex.",
      "maps_to_ac": "AC-6",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-6 reintroduced Convex prose fails the gate'",
      "type": "boolean"
    },
    {
      "id": "TC-15",
      "num": 15,
      "statement": "The Convex-prose assertion passes against the reconciled manifest.",
      "maps_to_ac": "AC-6",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-6 reintroduced Convex prose fails the gate'",
      "type": "boolean"
    }
  ],
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the reconciled manifest and a live gateway WHEN a foreign-Origin and a same-origin request hit /mcp THEN 403 and 200 respectively match the declared same-origin policy.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-1 declared origin policy matches enforced behaviour'",
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
            "mock",
            "static",
            "empty",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "live_gateway_stack",
            "action": {
              "actor": "MCP HTTP client",
              "steps": [
                "Load the reconciled manifest via `loadManifest` and record `auth_policy.streamable_http.allowed_origins` and `origin_validation`",
                "POST `tools/list` to `/mcp` with a valid bearer key and Origin 'https://evil.example'; record the HTTP status",
                "POST `tools/list` to `/mcp` with a valid bearer key and no foreign Origin; record the HTTP status and the tool count",
                "Confirm `gateway.ts` declares `enableDnsRebindingProtection: true` and derives `allowedOrigins` from the request URL"
              ]
            },
            "end_state": {
              "must_observe": [
                "`auth_policy.streamable_http.allowed_origins` is non-null and declares a same-origin policy",
                "`auth_policy.streamable_http.origin_validation` equals true",
                "the foreign-Origin request returns HTTP status 403",
                "the same-origin request returns HTTP status 200 listing 44 tools"
              ],
              "must_not_observe": [
                "`allowed_origins` being null while `origin_validation` is true",
                "the foreign-Origin request returning HTTP status 200",
                "the same-origin request returning HTTP 403 or listing 0 tools",
                "a declared origin list naming hosts the gateway does not accept"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN a regressed manifest with allowed_origins null WHEN mcp:verify-manifest --protocol runs THEN it exits non-zero naming allowed_origins while the reconciled manifest exits 0.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-2 header gate refuses origin_validation without allowed_origins'",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-2",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static",
            "stub",
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
            "start_ref": "regressed_manifest_copies",
            "action": {
              "actor": "operator CLI",
              "steps": [
                "Copy the reconciled manifest to a temp path and set `allowed_origins` back to `null` with `origin_validation` left `true`",
                "Run `bun services/platform/src/cli/holo.ts mcp:verify-manifest --manifest <copy A> --protocol` and capture the exit code plus output",
                "Run the same command against the real reconciled manifest and capture the exit code plus output"
              ]
            },
            "end_state": {
              "must_observe": [
                "the copy-A run exits with a code other than 0",
                "the copy-A output contains the literal 'allowed_origins'",
                "the reconciled-manifest run exits with code 0",
                "the reconciled-manifest output reports the protocol pin '2025-11-25'"
              ],
              "must_not_observe": [
                "the copy-A run exiting with code 0",
                "the reconciled-manifest run exiting with a code other than 0",
                "output that names no field when the assertion fails"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN the reconciled manifest WHEN it is scanned for Convex references THEN the match count is 0 and all 21 side_effects strings name a Postgres executor path.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-3 no stale Convex claims remain in the manifest'",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-3",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static",
            "stub",
            "empty",
            "unchanged"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "reconciled_manifest",
            "action": {
              "actor": "gate reviewer",
              "steps": [
                "Run a case-insensitive grep for 'convex' over the manifest and record the match count",
                "Load the manifest and read `auth_policy.stdio.trust_boundary`",
                "Read `cancellation_policy.description`",
                "Collect every tool entry whose `side_effects` is non-null and record the count plus each string",
                "Count error descriptions equal to 'Convex query failed'"
              ]
            },
            "end_state": {
              "must_observe": [
                "the case-insensitive 'convex' match count over the manifest equals 0",
                "`auth_policy.stdio.trust_boundary` contains the literal 'DATABASE_URL'",
                "`cancellation_policy.description` names the Postgres executor and the threaded abort signal",
                "21 tool entries carry a non-null `side_effects` string",
                "all 21 `side_effects` strings name a Postgres executor path and 0 name a Convex module",
                "the count of error descriptions reading 'Convex query failed' equals 0, down from 15"
              ],
              "must_not_observe": [
                "any occurrence of 'CONVEX_URL', 'CONVEX_DEPLOYMENT' or 'dispatched to Convex'",
                "a `side_effects` count other than 21",
                "a `side_effects` string still naming a module such as 'subscriptions/mutations:add'",
                "a `side_effects` set with 0 entries, which would mean the mutation tools lost their declarations"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN the reconciled manifest WHEN rate_limit is read THEN it is the literal not_applicable with a 01-scope.md citation and 0 rate limiting was implemented.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-4 rate limiting is recorded as not_applicable with its scope citation'",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-4",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static",
            "empty",
            "stub",
            "unchanged"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "reconciled_manifest",
            "action": {
              "actor": "gate reviewer",
              "steps": [
                "Load the manifest and read `auth_policy.streamable_http.rate_limit`",
                "Read the raw YAML line for `rate_limit` and record its trailing comment",
                "Grep the manifest for the literal 'mcp-manifest-02 to populate' and record the count",
                "Grep the diff for rate-limit middleware identifiers and record the count"
              ]
            },
            "end_state": {
              "must_observe": [
                "`auth_policy.streamable_http.rate_limit` equals the literal string 'not_applicable'",
                "the `rate_limit` line comment contains the literal '01-scope.md'",
                "the count of 'mcp-manifest-02 to populate' occurrences in the manifest equals 0",
                "the count of newly introduced rate-limit middleware identifiers in the diff equals 0"
              ],
              "must_not_observe": [
                "`rate_limit` still null",
                "a comment reading as a TODO or future-population note",
                "any new rate-limiting implementation, config key or dependency in the diff",
                "a rate-limit middleware count other than 0 in the diff"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN the fixtures field removed WHEN the manifest and loader are inspected and the gate runs THEN the key is gone and coverage stays 44/44.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-5 dead fixtures field removed with coverage unchanged'",
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
            "empty",
            "stub",
            "removed"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "reconciled_manifest",
            "action": {
              "actor": "operator CLI",
              "steps": [
                "Grep the manifest for the key `fixtures:` and record the count",
                "Load the manifest and check whether any tool entry carries a `fixtures` key",
                "Grep `manifest-loader.ts` for `fixtures` and record the count",
                "Run `bun services/platform/src/cli/holo.ts mcp:verify-manifest --json` and record the exit code, `tools_covered` and `tools_total`",
                "Confirm the manifest header documents the fixture-resolution convention"
              ]
            },
            "end_state": {
              "must_observe": [
                "the `fixtures:` key count in the manifest equals 0, down from 44",
                "0 loaded tool entries carry an own property named `fixtures`",
                "the `fixtures` occurrence count in `manifest-loader.ts` equals 0",
                "the verify-manifest run exits 0 with `tools_covered` 44 and `tools_total` 44",
                "the manifest header contains the literal convention string '{toolId}_{success|error|replay}.json'"
              ],
              "must_not_observe": [
                "any remaining `fixtures: null` line in the manifest",
                "a `ManifestTool` type still declaring `fixtures: unknown`",
                "`tools_covered` dropping below 44 after the field removal",
                "the convention left undocumented in the header",
                "a `fixtures:` key count other than 0 in the manifest"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "description": "GIVEN a regressed manifest whose cancellation description names Convex WHEN the prose assertion runs THEN it fails naming cancellation_policy while the reconciled manifest passes.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-6 reintroduced Convex prose fails the gate'",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-6",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static",
            "stub",
            "empty",
            "unchanged"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "regressed_manifest_copies",
            "action": {
              "actor": "gate reviewer",
              "steps": [
                "Copy the reconciled manifest to a temp path and restore the Convex cancellation description verbatim",
                "Run the Convex-prose assertion against copy B and capture the failure message",
                "Run the same assertion against the real reconciled manifest and capture the result",
                "Record the case-insensitive 'convex' match count for both files"
              ]
            },
            "end_state": {
              "must_observe": [
                "the assertion fails against copy B with 1 reported violation",
                "the copy-B failure message names 'cancellation_policy'",
                "copy B's case-insensitive 'convex' match count is >= 1",
                "the reconciled manifest passes the assertion with a match count of 0"
              ],
              "must_not_observe": [
                "copy B passing the assertion",
                "the reconciled manifest failing the assertion",
                "a failure message that names no field",
                "a copy-B match count of 0, which would mean the regression was never seeded"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "auth_policy.streamable_http.allowed_origins is non-null in the reconciled manifest.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-1 declared origin policy matches enforced behaviour'"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "A /mcp request with Origin https://evil.example and a valid bearer key returns HTTP status 403.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-1 declared origin policy matches enforced behaviour'"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "A same-origin /mcp tools/list request returns HTTP status 200 with 44 tools.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-1 declared origin policy matches enforced behaviour'"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "mcp:verify-manifest --protocol exits non-zero against a manifest with allowed_origins null and origin_validation true.",
      "maps_to_ac": "AC-2",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-2 header gate refuses origin_validation without allowed_origins'"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "mcp:verify-manifest --protocol exits 0 against the reconciled manifest.",
      "maps_to_ac": "AC-2",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-2 header gate refuses origin_validation without allowed_origins'"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "The case-insensitive convex match count over the manifest equals 0.",
      "maps_to_ac": "AC-3",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-3 no stale Convex claims remain in the manifest'"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "The manifest carries exactly 21 tool entries with a non-null side_effects string.",
      "maps_to_ac": "AC-3",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-3 no stale Convex claims remain in the manifest'"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "auth_policy.stdio.trust_boundary contains the literal DATABASE_URL.",
      "maps_to_ac": "AC-3",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-3 no stale Convex claims remain in the manifest'"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "auth_policy.streamable_http.rate_limit equals the literal string not_applicable.",
      "maps_to_ac": "AC-4",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-4 rate limiting is recorded as not_applicable with its scope citation'"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "The manifest carries 0 occurrences of the literal mcp-manifest-02 to populate.",
      "maps_to_ac": "AC-4",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-4 rate limiting is recorded as not_applicable with its scope citation'"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": "The manifest carries 0 occurrences of the key fixtures.",
      "maps_to_ac": "AC-5",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-5 dead fixtures field removed with coverage unchanged'"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": "manifest-loader.ts carries 0 occurrences of the identifier fixtures.",
      "maps_to_ac": "AC-5",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-5 dead fixtures field removed with coverage unchanged'"
    },
    {
      "id": "TC-13",
      "type": "test_criterion",
      "description": "mcp:verify-manifest --json reports tools_covered 44 and tools_total 44 after the field removal.",
      "maps_to_ac": "AC-5",
      "verify": "cd services/platform && bun src/cli/holo.ts mcp:verify-manifest --json"
    },
    {
      "id": "TC-14",
      "type": "test_criterion",
      "description": "The Convex-prose assertion fails against a manifest whose cancellation_policy description names Convex.",
      "maps_to_ac": "AC-6",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-6 reintroduced Convex prose fails the gate'"
    },
    {
      "id": "TC-15",
      "type": "test_criterion",
      "description": "The Convex-prose assertion passes against the reconciled manifest.",
      "maps_to_ac": "AC-6",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts -t 'AC-6 reintroduced Convex prose fails the gate'"
    }
  ]
}
-->

</details>
