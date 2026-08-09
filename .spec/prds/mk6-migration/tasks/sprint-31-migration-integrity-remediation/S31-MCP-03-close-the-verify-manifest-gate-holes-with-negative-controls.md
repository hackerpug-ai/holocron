# S31-MCP-03: Close the verify-manifest gate holes with negative controls

> **Task ID:** S31-MCP-03
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Agent:** `mcp-implementer`
> **Estimate:** 120 min
> **Type:** FEATURE
> **Priority:** P0 · **Effort:** M
> **PROPOSED-BY:** `mcp-planner`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

**Capabilities:** CAP-CUT-01
**PRD refs:** UC-SVC-04 AC-2, UC-SVC-04 AC-5

## What this does

Makes `mcp:verify-manifest` fail when a declared replay fixture is missing, folds that check into the covered tally so "44/44 tools covered" stops being true while artifacts are absent, adds the never-written negative controls for all three fixture kinds, and widens the Convex residue scan past `src/mcp` with a named, asserted allowlist.

## Why

`verify-manifest.ts:119` reads `if (entry.replay && existsSync(replayFixturePath))` — when the file is absent the condition is false and no issue is pushed. There is no `replay_fixture_missing` member in the 10-member `ManifestIssue.kind` union, and the covered tally never touches `replayFixturePath`, so deleting any of the 21 replay fixtures leaves the command printing "44/44 tools covered" and exiting 0. This hole shipped in a later Sprint-19 commit (`f3c8f420`, 2026-07-18) postdating all three Sprint-03 red-hat rounds (2026-07-14), so no review has ever evaluated it.

## How to verify

Deleting one replay, error, or success fixture from a temp copy each makes `mcp:verify-manifest` exit non-zero with the exact issue kind and `tools_covered: 43`; a seeded `convex/browser` import outside `src/mcp` makes `mcp:verify-rehost` report `convexRefs` length 1 while the real tree stays at 0.

## Scope

Touches the two verifier modules and their negative-control tests. The frozen fixture directory and the manifest itself are read-only here.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-MCP-03 - Close the verify-manifest gate holes with negative controls
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

Deleting any success, error, or replay fixture fails the manifest gate with the exact issue kind and
a covered tally of 43, and Convex residue is scanned across the whole served source root.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- NEVER mutate the committed fixture directory — every negative control operates on a temp copy made
  with `cpSync` and cleaned up in a `finally` block.
- NEVER broaden the residue allowlist to a whole package or to `services/platform/src`; an allowlist
  that swallows the served root reproduces the hole being closed.
- NEVER let a negative control assert only `ok === false` — it must assert the exact issue kind, or
  an unrelated bug satisfies it.
- NEVER hardcode the mutation-tool list; the 21 mutation tools are derived from `side_effects` being
  non-null, exactly as `isMutation` already does.
- NEVER push the new issue without also changing the covered predicate — an `ok: false` report that
  still prints "44/44 tools covered" is the same half-truth in a new place.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] A missing replay fixture yields kind `replay_fixture_missing` and `tools_covered: 43` — maps
      to AC-1 (PRIMARY)
- [ ] A missing error fixture yields kind `error_fixture_missing` and `tools_covered: 43` — AC-2
- [ ] The intact frozen set still reports 44/44 with 0 issues and an 11-member kind union — AC-3
- [ ] A missing success fixture still yields kind `fixtures_missing` and `tools_covered: 43` — AC-4
- [ ] A seeded Convex import outside `src/mcp` yields `convexRefs` length 1 with the allowlist
      asserted by value — AC-5
- [ ] `PLATFORM_IT=1 pnpm test:integration` passes + `pnpm tsgo --noEmit` clean
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: A missing replay fixture fails the gate and drops the tally [PRIMARY]
  GIVEN: fixture frozen_fixture_dir_copy with store_document_replay.json removed
  WHEN:  holo mcp:verify-manifest runs against the real manifest with that temp fixtures dir
  THEN:  non-zero exit, kind replay_fixture_missing for store_document, tools_covered 43 of 44

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TDD_STATE:     none
  TEST_FILE:     tests/integration/mcp-manifest-negative-controls.test.ts
  TEST_FUNCTION: AC-1 missing replay fixture fails the gate

  SCENARIO:
    START_REF:        frozen_fixture_dir_copy
    NEGATIVE_CONTROL: would fail if static | stub | empty | mock | deleted
    EVIDENCE:         stdout (capture required)
    CASE 0:
      ACTION: cpSync the fixtures dir to a temp dir and count *_replay.json; delete
              store_document_replay.json; run the real CLI with --fixtures-dir <tmp> --json.
      MUST_OBSERVE:
        - the exit code is a value other than 0
        - report.ok equals false
        - report.issues contains tool_id 'store_document' with kind 'replay_fixture_missing'
        - report.tools_covered equals 43 and report.tools_total equals 44
        - the pre-deletion temp copy contained 21 *_replay.json files
      MUST_NOT_OBSERVE:
        - an exit code of 0
        - report.tools_covered equal to 44
        - stdout containing the literal '44/44'
        - an issues array with 0 entries

AC-2: A missing error fixture fails the gate with the right kind
  GIVEN: fixture frozen_fixture_dir_copy with store_document_error.json removed
  WHEN:  the same verify-manifest command runs against that temp copy
  THEN:  non-zero exit, kind error_fixture_missing, tools_covered 43

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TDD_STATE:     none
  TEST_FILE:     tests/integration/mcp-manifest-negative-controls.test.ts
  TEST_FUNCTION: AC-2 missing error fixture fails the gate

  SCENARIO:
    START_REF:        frozen_fixture_dir_copy
    NEGATIVE_CONTROL: would fail if static | stub | empty | mock | deleted
    EVIDENCE:         stdout (capture required)
    CASE 0:
      ACTION: cpSync to a fresh temp dir; delete store_document_error.json; run the CLI with --json.
      MUST_OBSERVE:
        - the exit code is a value other than 0
        - report.issues contains tool_id 'store_document' with kind 'error_fixture_missing'
        - report.tools_covered equals 43
        - report.ok equals false
      MUST_NOT_OBSERVE:
        - an exit code of 0
        - report.tools_covered equal to 44
        - an issue kind of 'fixtures_missing' standing in for the error-fixture case
        - an issues array with 0 entries

AC-3: The intact frozen fixture set still passes 44/44
  GIVEN: fixture frozen_fixture_dir_copy untouched
  WHEN:  verify-manifest runs against it and the ManifestIssue.kind union is inspected
  THEN:  exit 0, tools_covered 44 of 44, 0 issues, 11-member kind union

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TDD_STATE:     none
  TEST_FILE:     tests/integration/mcp-manifest-negative-controls.test.ts
  TEST_FUNCTION: AC-3 intact frozen fixtures pass 44 of 44

  SCENARIO:
    START_REF:        frozen_fixture_dir_copy
    NEGATIVE_CONTROL: would fail if stub | empty | static | removed
    EVIDENCE:         stdout (capture required)
    CASE 0:
      ACTION: run the CLI against the untouched temp copy with --json; count the kind union members
              in verify-manifest.ts; confirm the new member is present.
      MUST_OBSERVE:
        - the exit code equals 0 and report.ok equals true
        - report.tools_covered equals 44 and report.tools_total equals 44
        - report.issues has length 0
        - the ManifestIssue.kind union has 11 members
        - the union carries the literal member 'replay_fixture_missing'
      MUST_NOT_OBSERVE:
        - an exit code other than 0 on the intact set
        - report.tools_covered below 44
        - a kind union with 10 members

AC-4: A missing success fixture still fails under the widened predicate
  GIVEN: fixture frozen_fixture_dir_copy with check_subscriptions_success.json removed
  WHEN:  verify-manifest runs against that temp copy
  THEN:  non-zero exit, kind fixtures_missing, tools_covered 43

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TDD_STATE:     none
  TEST_FILE:     tests/integration/mcp-manifest-negative-controls.test.ts
  TEST_FUNCTION: AC-4 missing success fixture still fails

  SCENARIO:
    START_REF:        frozen_fixture_dir_copy
    NEGATIVE_CONTROL: would fail if static | stub | empty | deleted
    EVIDENCE:         stdout (capture required)
    CASE 0:
      ACTION: cpSync to a fresh temp dir and count the 44 *_success.json; delete
              check_subscriptions_success.json; run the CLI with --json.
      MUST_OBSERVE:
        - the exit code is a value other than 0
        - report.issues contains tool_id 'check_subscriptions' with kind 'fixtures_missing'
        - report.tools_covered equals 43
        - the pre-deletion temp copy contained 44 *_success.json files
      MUST_NOT_OBSERVE:
        - an exit code of 0
        - report.tools_covered equal to 44
        - an issues array with 0 entries

AC-5: The widened Convex scan catches residue outside src/mcp
  GIVEN: fixture convex_residue_probe_tree with a seeded convex/browser import
  WHEN:  verifyMcpRehost runs on that tree and then on the real tree
  THEN:  the seeded run reports the probe path, the 4 allowlisted cutover modules stay clean

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TDD_STATE:     none
  TEST_FILE:     tests/integration/mcp-verify-rehost-residue-scan.test.ts
  TEST_FUNCTION: AC-5 widened Convex scan catches residue outside src/mcp

  SCENARIO:
    START_REF:        convex_residue_probe_tree
    NEGATIVE_CONTROL: would fail if static | stub | empty | mock
    EVIDENCE:         stdout (capture required)
    CASE 0:
      ACTION: cpSync services/platform/src to a temp tree; write tools/s31-residue-probe.ts with a
              convex/browser import; run verifyMcpRehost on the temp tree and on the real tree.
      MUST_OBSERVE:
        - the seeded run returns ok equal to false
        - convexRefs contains a path ending in 'tools/s31-residue-probe.ts'
        - convexRefs has length 1 on the seeded tree
        - the sorted residue allowlist deep-equals the declared literal set and has length >= 1
        - the unseeded real-tree run returns ok true with convexRefs length 0
      MUST_NOT_OBSERVE:
        - the seeded run returning ok true
        - a convexRefs length of 0 on the seeded tree
        - any of the 4 real cutover Convex-importing modules appearing in convexRefs
        - an allowlist entry equal to 'services/platform/src' covering the whole served root

--------------------------------------------------------------------------------
FIXTURES (shared seed data — referenced by START_REF)
--------------------------------------------------------------------------------

frozen_fixture_dir_copy (seed_method: migration_fixture)
  A temp copy of the real committed fixture directory made with cpSync from
  services/platform/tests/fixtures/mcp-manifest, so every control runs against the genuine frozen
  set without mutating it.
  - 44 files matching *_success.json copied from the committed fixture dir
  - 21 files matching *_replay.json copied from the committed fixture dir
  - 22 files matching *_error.json copied (21 mutation tools plus store_document_validation_error.json)
  - the real manifest at 14-mcp-compatibility-manifest.yaml used unmodified as the manifest input

convex_residue_probe_tree (seed_method: migration_fixture)
  A temp copy of the served source root carrying one seeded file that imports convex/browser outside
  the allowlisted directories, used to prove the widened scan reaches beyond src/mcp.
  - a recursive cpSync copy of services/platform/src
  - 1 seeded file at <tmp>/tools/s31-residue-probe.ts with `import { ConvexClient } from 'convex/browser';`
  - the 4 real Convex-importing cutover modules present unmodified: convex-fence-client.ts,
    convex-live-attestation.ts, data-plane-content.ts, ponr.ts

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/mcp/verify-manifest.ts (MODIFY)
- services/platform/src/mcp/verify-rehost.ts (MODIFY)
- tests/integration/mcp-manifest-negative-controls.test.ts (MODIFY)
- tests/integration/mcp-verify-rehost-residue-scan.test.ts (NEW)

writeProhibited:
- services/platform/tests/fixtures/mcp-manifest/ — the frozen fixture set; controls copy it,
  never edit it
- .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml — S31-MCP-04
  owns manifest content
- services/platform/src/mcp/manifest-loader.ts — the loader shape changes in S31-MCP-04, not here
- services/platform/src/cutover/convex-fence-client.ts — legitimately Convex-importing; allowlisted
- services/platform/src/mcp/executor.ts, services/platform/src/mcp/gateway.ts — out of scope
- Any file not explicitly listed above

--------------------------------------------------------------------------------
BOUNDARIES (✅ Always / ⚠️ Ask First) — Never tier lives at CRITICAL CONSTRAINTS above
--------------------------------------------------------------------------------

✅ Always:
- Add the new kind to the union type; never cast a stringly-typed kind past it.
- Use mkdtempSync + cpSync + try/finally rmSync in every control.
- Assert the exact issue kind AND the exact tools_covered integer.
- Export the residue allowlist as an `as const` array so the test can assert it by value.
- Derive the mutation population from `side_effects` being non-null, as `isMutation` already does.

⚠️ Ask First:
- Adding a directory to the residue allowlist beyond the four cutover modules and the confirmed
  ETL/migration-source dirs.
- Changing the `mcp:verify-manifest` CLI flags or its exit-code contract.
- Altering the replay-contract comparison semantics at verify-manifest.ts:120-142.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- services/platform/src/mcp/verify-manifest.ts (MODIFY): the 11th issue kind, the missing-replay
  push, and the widened covered predicate; blocker file for every control below.
- services/platform/src/mcp/verify-rehost.ts (MODIFY): the widened scan root and the exported
  residue allowlist.
- tests/integration/mcp-manifest-negative-controls.test.ts (MODIFY): AC-1, AC-2, AC-3, AC-4.
- tests/integration/mcp-verify-rehost-residue-scan.test.ts (NEW): AC-5.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  READ:   Current AC definition, existing tests, code patterns (see READING LIST)
  WRITE:  ONE test that exercises GIVEN-WHEN-THEN
  RUN:    PLATFORM_IT=1 pnpm test:integration -- {test_file}
  VERIFY: Test FAILS (not errors — fails). AC-1's RED is the gate printing '44/44 tools covered' and
          exiting 0 with the replay fixture deleted.
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
   - Lines: 81-99
   - Focus: the fixture-file-removed control to imitate exactly — mkdtempSync, cpSync, rmSync one
     file, run the real CLI, assert non-zero plus the named tool, clean up in finally.

2. services/platform/src/mcp/verify-manifest.ts
   - Lines: 17-30, 109-144, 168-185
   - Focus: the 10-member kind union; the hole at :119 where `entry.replay && existsSync(...)` means
     an absent file pushes nothing; the covered predicate that never touches replayFixturePath.

3. services/platform/src/mcp/verify-rehost.ts
   - Lines: 30-48
   - Focus: `const sourceRoot = resolve(cwd, 'services/platform/src/mcp')` — the scan that sees one
     directory of the served source, and the `issues` array the widened scan feeds.

4. services/platform/src/mcp/manifest-loader.ts
   - Lines: 8-25, 58-70
   - Focus: ReplayContract and ManifestTool — how `replay` and `side_effects` are typed, and so how
     the 21-tool mutation population is derived rather than hardcoded.

5. services/platform/src/cli/holo.ts
   - Lines: 1696-1721
   - Focus: the mcp:verify-manifest case — the --fixtures-dir override, --json output, and
     `process.exit(report.ok ? 0 : 1)` that every control drives.

--------------------------------------------------------------------------------
EVIDENCE GATES (fast/cheap first — fail fast)
--------------------------------------------------------------------------------

Gate 1: RED phase evidence
  Required: the pre-change run showing '44/44 tools covered' and exit 0 with a replay fixture
            deleted — the hole, reproduced.

Gate 2: Each AC has a test
  Verify: 4 control functions in the manifest control file plus 1 in the residue-scan file.

Gate 3: Fixture-kind negative controls
  Command: PLATFORM_IT=1 pnpm test:integration
  Expected: 3 controls each report tools_covered 43 of 44 with kinds replay_fixture_missing,
            error_fixture_missing and fixtures_missing.

Gate 4: Manifest gate on the real tree
  Command: cd services/platform && bun src/cli/holo.ts mcp:verify-manifest --json
  Expected: tools_covered 44, tools_total 44, issues [].

Gate 5: Residue scan control
  Command: PLATFORM_IT=1 pnpm test:integration
  Expected: the seeded tree reports convexRefs length 1 naming tools/s31-residue-probe.ts while the
            real tree reports length 0.

Gate 6: Rehost gate on the real tree
  Command: cd services/platform && bun src/cli/holo.ts mcp:verify-rehost --json
  Expected: ok true with convexRefs [] under the widened scan root.

Gate 7: Type check + lint
  Command: pnpm tsgo --noEmit ; pnpm biome check .
  Expected: 0 diagnostics after the union gains its 11th member; 0 lint errors.

Gate 8: Scenario is un-fakeable (PRIMARY)
  Verify: validate_scenario.py exits 0 on the contract below (5 scenarios, 0 violations).
  Verify: AC-1 was watched pass-when-broken before the fix — the RED is the false green.
  Verify: the captured stdout artifact shows the 43/44 tally, not merely a non-zero exit.
  Reject: a control that asserts ok:false without naming the issue kind.

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Changing any manifest content — the stale Convex prose, `allowed_origins`, `rate_limit` and the
  dead `fixtures:` field are all S31-MCP-04, which depends on this task. (Most likely thing to be
  mistaken for in-scope.)
- Adding provenance capture to the fixtures — explicitly excluded by 01-scope.md (2026-08-07);
  UC-SVC-04 AC-5 says "frozen", not "captured".
- Removing Convex imports from services/platform/src/cutover/** — those are the sanctioned rollback
  tooling and are allowlisted, not deleted.
- The dual-transport behavioural sweep — S31-MCP-01.

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** 21 of the 44 tools are mutations (`side_effects` non-null) and each declares a
`replay:` contract, with 21 matching `{toolId}_replay.json` files on disk. `buildVerifyReport`
compares a replay fixture to the manifest contract only when the file exists, and the covered tally
checks the success and error fixtures but not the replay one. The Convex residue scan resolves a
single directory, `services/platform/src/mcp`.

**Gap:** Delete a replay fixture and the gate still prints "44/44 tools covered" and exits 0 — there
is no issue kind that could fire and no tally that could move. Separately, the four modules under
`services/platform/src/cutover/` that legitimately import Convex are invisible to the residue scan,
which means so is any new Convex import anywhere else in the served source. The sibling
`error_fixture_missing` path is enforced in code but has never had the negative control
REDHAT-FIX-03's own DONE-WHEN required, so it is unproven rather than known-good.

--------------------------------------------------------------------------------
REVIEW (for mcp-reviewer)
--------------------------------------------------------------------------------

Must pass (≤5, evidence-gate-backed):
- One test per AC; each control drives the real CLI/verifier against a temp copy of the real artifact
- RED evidence: the false-green run (44/44 with a fixture deleted) is recorded
- Minimal implementation: one new union member, one push site, one predicate clause, one scan root
- Pattern consistent with READING LIST [PRIMARY PATTERN] (temp-copy negative control)
- SCOPE respected (git diff --name-only ⊆ writeAllowed)

Should verify (≤5, judgment):
- The covered predicate and the issue push changed together — no report that is ok:false at 44/44
- Controls assert the exact kind and the exact integer, never just a truthiness
- The residue allowlist names directories, is exported, and is asserted by value in the test
- The committed fixture directory is untouched by the test run (git status clean afterwards)
- The mutation population is still derived from side_effects, not a literal tool list

Verdict: [APPROVED | NEEDS_FIXES]
Feedback (required if NEEDS_FIXES):
```
[Specific, actionable issues — reference file:line where possible]
```

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: none
Blocks:     S31-MCP-04 (deleting the dead `fixtures:` field is only safe once the filename
            convention is load-bearing for all three fixture kinds)
Parallel:   S31-05, S31-MCP-01 (disjoint files)

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable)
--------------------------------------------------------------------------------
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-MCP-03",
  "task_type": "FEATURE",
  "tdd_mode": "red_first",
  "proposed_by": "mcp-planner",
  "agent": "mcp-implementer",
  "agent_rationale": "The fix turns on MCP manifest semantics — which tools are mutations (side_effects non-null), what a replay contract obligates, and which source roots legitimately still import Convex. Getting the covered-predicate and the residue-scan allowlist right requires knowing the manifest's own contract, which is mcp-implementer's surface.",
  "estimate_minutes": 120,
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "critical_constraints": {
    "must": [
      "MUST add replay_fixture_missing to the ManifestIssue.kind union (verify-manifest.ts:17-30, today 10 members) and push it when entry.replay is non-null and the {toolId}_replay.json file is absent — the condition at :119 silently skips today.",
      "MUST include the replay-fixture existence check in the covered predicate at :168-185 so the printed tally drops below 44, not just the issues list.",
      "MUST add a negative control for error_fixture_missing — the path at :110-117 is enforced in code but has never had the control REDHAT-FIX-03's own DONE-WHEN required.",
      "MUST assert the residue-scan allowlist's exact contents and scope it to directories that legitimately import Convex — the four services/platform/src/cutover modules plus any ETL/migration-source dir confirmed at implementation time."
    ],
    "never": [
      "NEVER mutate the committed fixture directory — every negative control operates on a temp copy made with cpSync.",
      "NEVER broaden the residue allowlist to a whole package or to services/platform/src; an allowlist that swallows the served root reproduces the hole being closed.",
      "NEVER let a negative control assert only ok === false; it must assert the exact issue kind, or an unrelated bug satisfies it."
    ],
    "strictly": [
      "STRICTLY keep the 21 mutation tools as the replay-check population, derived from side_effects being non-null — never hardcode a tool list.",
      "STRICTLY treat the printed 44/44 tools covered line as a load-bearing claim: if a fixture is missing, that number must change."
    ]
  },
  "specification": {
    "objective": "Close the two holes that let the manifest gate print 44/44 tools covered and exit 0 while artifacts are missing: a declared replay contract with no {toolId}_replay.json on disk produces no issue and does not reduce the covered tally, and the Convex residue scan at verify-rehost.ts:43 resolves only services/platform/src/mcp so Convex imports elsewhere in the served source are invisible.",
    "success_state": "Deleting any single success, error, or replay fixture for a mutation tool makes buildVerifyReport return ok false with the exact issue kind and tools_covered 43; the ManifestIssue.kind union has 11 members; verifyMcpRehost flags a Convex import seeded anywhere under the served source root outside the asserted allowlist, and still passes with the four real cutover modules allowlisted."
  },
  "fixtures": {
    "frozen_fixture_dir_copy": {
      "description": "A temp copy of the real committed fixture directory made with cpSync from services/platform/tests/fixtures/mcp-manifest, so every control runs against the genuine frozen set without mutating it.",
      "seed_method": "migration_fixture",
      "records": [
        "44 files matching `*_success.json` copied from the committed fixture dir",
        "21 files matching `*_replay.json` copied from the committed fixture dir",
        "22 files matching `*_error.json` copied from the committed fixture dir (21 mutation tools plus `store_document_validation_error.json`)",
        "the real manifest at `.spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml` used unmodified as the manifest input"
      ]
    },
    "convex_residue_probe_tree": {
      "description": "A temp copy of the served source root carrying one seeded file that imports convex/browser outside the allowlisted directories, used to prove the widened scan reaches beyond src/mcp.",
      "seed_method": "migration_fixture",
      "records": [
        "a recursive cpSync copy of `services/platform/src`",
        "1 seeded file at `<tmp>/tools/s31-residue-probe.ts` containing the literal `import { ConvexClient } from 'convex/browser';`",
        "the 4 real Convex-importing cutover modules present unmodified: `cutover/convex-fence-client.ts`, `cutover/convex-live-attestation.ts`, `cutover/data-plane-content.ts`, `cutover/ponr.ts`"
      ]
    }
  },
  "guardrails": {
    "write_allowed": [
      "services/platform/src/mcp/verify-manifest.ts",
      "services/platform/src/mcp/verify-rehost.ts",
      "tests/integration/mcp-manifest-negative-controls.test.ts",
      "tests/integration/mcp-verify-rehost-residue-scan.test.ts"
    ],
    "write_prohibited": [
      "services/platform/tests/fixtures/mcp-manifest/ — the frozen fixture set; controls copy it, never edit it",
      ".spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml — S31-MCP-04 owns manifest content",
      "services/platform/src/mcp/manifest-loader.ts — the loader shape changes in S31-MCP-04, not here",
      "services/platform/src/cutover/convex-fence-client.ts — legitimately Convex-importing; allowlisted, not modified",
      "services/platform/src/mcp/executor.ts — out of scope",
      "services/platform/src/mcp/gateway.ts — out of scope"
    ]
  },
  "design": {
    "references": [
      "UC-SVC-04 AC-5 — frozen success/error fixtures and replay/idempotency proof for mutation tools",
      "UC-SVC-04 AC-2 — zero Convex references in the served MCP source",
      "CAP-CUT-01 — the manifest gate is one of two proofs the cutover boundary rests on",
      "brain/docs/mcp-rules/maintenance.md — manifest as the server's public contract",
      "brain/docs/ANTI-STUB-REVIEW.md — a gate whose failure mode is unproven is a stub gate"
    ],
    "pattern": "Gate-with-negative-control: for every enforced condition there is a test that seeds the violation against a temp copy of the real artifact and asserts the exact issue kind plus the changed tally — the gate's failure mode is proven, not assumed.",
    "pattern_source": "tests/integration/mcp-manifest-negative-controls.test.ts:81-99 — the fixture-file-removed control: mkdtempSync, cpSync, rmSync one file, run the real CLI, assert non-zero plus the named tool.",
    "anti_pattern": "Pushing the new issue without touching the covered predicate so the tally keeps lying; asserting ok:false with no issue kind; mutating the committed fixture directory in place; allowlisting services/platform/src wholesale so the widened scan finds nothing anywhere."
  },
  "coding_standards": [
    "brain/docs/mcp-rules/maintenance.md",
    "brain/docs/mcp-rules/testing.md",
    "brain/docs/ANTI-STUB-REVIEW.md",
    "brain/docs/TESTING-HIERARCHY.md",
    "RULES.md"
  ],
  "verification_gates": [
    {
      "gate": "Fixture-kind negative controls",
      "command": "PLATFORM_IT=1 pnpm test:integration",
      "expected": "3 controls each report tools_covered 43 of 44 with issue kinds replay_fixture_missing, error_fixture_missing and fixtures_missing"
    },
    {
      "gate": "Manifest gate on the real tree",
      "command": "cd services/platform && bun src/cli/holo.ts mcp:verify-manifest --json",
      "expected": "stdout JSON shows tools_covered 44, tools_total 44 and issues []"
    },
    {
      "gate": "Residue scan control",
      "command": "PLATFORM_IT=1 pnpm test:integration",
      "expected": "the seeded tree reports convexRefs length 1 naming tools/s31-residue-probe.ts while the real tree reports length 0"
    },
    {
      "gate": "Rehost gate on the real tree",
      "command": "cd services/platform && bun src/cli/holo.ts mcp:verify-rehost --json",
      "expected": "stdout JSON shows ok true with convexRefs [] under the widened scan root"
    },
    {
      "gate": "Typecheck",
      "command": "pnpm tsgo --noEmit",
      "expected": "0 diagnostics after the ManifestIssue union gains its 11th member"
    },
    {
      "gate": "Lint",
      "command": "pnpm biome check .",
      "expected": "0 errors reported on the changed files"
    },
    {
      "gate": "Unit",
      "command": "pnpm test:unit",
      "expected": "0 failing unit tests after the covered-predicate change"
    }
  ],
  "acceptance_criteria": [
    {
      "id": "AC-1",
      "num": 1,
      "primary": true,
      "name": "A missing replay fixture fails the gate and drops the tally",
      "given": "GIVEN fixture frozen_fixture_dir_copy with store_document_replay.json removed from the temp copy",
      "when": "WHEN holo mcp:verify-manifest runs against the real manifest with that temp fixtures dir",
      "then": "THEN the command exits non-zero with an issue of kind replay_fixture_missing for store_document and tools_covered 43 of 44",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-1 missing replay fixture fails the gate'",
      "test_tier": "integration",
      "verification_service": "cli",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-5",
      "test_file": "tests/integration/mcp-manifest-negative-controls.test.ts",
      "test_function": "AC-1 missing replay fixture fails the gate",
      "tdd_state": "none"
    },
    {
      "id": "AC-2",
      "num": 2,
      "name": "A missing error fixture fails the gate with the right kind",
      "given": "GIVEN fixture frozen_fixture_dir_copy with store_document_error.json removed from the temp copy",
      "when": "WHEN the same verify-manifest command runs against that temp copy",
      "then": "THEN it exits non-zero with kind error_fixture_missing for store_document and tools_covered 43 — the first negative control this already-coded path has had",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-2 missing error fixture fails the gate'",
      "test_tier": "integration",
      "verification_service": "cli",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-5",
      "test_file": "tests/integration/mcp-manifest-negative-controls.test.ts",
      "test_function": "AC-2 missing error fixture fails the gate",
      "tdd_state": "none"
    },
    {
      "id": "AC-3",
      "num": 3,
      "name": "The intact frozen fixture set still passes 44/44",
      "given": "GIVEN fixture frozen_fixture_dir_copy untouched",
      "when": "WHEN verify-manifest runs against the intact temp copy and the ManifestIssue.kind union is inspected",
      "then": "THEN the command exits 0 with tools_covered 44 of 44 and 0 issues, and the kind union has 11 members including replay_fixture_missing",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-3 intact frozen fixtures pass 44 of 44'",
      "test_tier": "integration",
      "verification_service": "cli",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-5",
      "test_file": "tests/integration/mcp-manifest-negative-controls.test.ts",
      "test_function": "AC-3 intact frozen fixtures pass 44 of 44",
      "tdd_state": "none"
    },
    {
      "id": "AC-4",
      "num": 4,
      "name": "A missing success fixture still fails under the widened predicate",
      "given": "GIVEN fixture frozen_fixture_dir_copy with check_subscriptions_success.json removed",
      "when": "WHEN verify-manifest runs against that temp copy",
      "then": "THEN it exits non-zero with kind fixtures_missing for check_subscriptions and tools_covered 43, proving the widened predicate kept the pre-existing control",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-4 missing success fixture still fails'",
      "test_tier": "integration",
      "verification_service": "cli",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-5",
      "test_file": "tests/integration/mcp-manifest-negative-controls.test.ts",
      "test_function": "AC-4 missing success fixture still fails",
      "tdd_state": "none"
    },
    {
      "id": "AC-5",
      "num": 5,
      "name": "The widened Convex scan catches residue outside src/mcp",
      "given": "GIVEN fixture convex_residue_probe_tree with one seeded convex/browser import at tools/s31-residue-probe.ts",
      "when": "WHEN verifyMcpRehost runs with the scan rooted at that tree and then against the real tree",
      "then": "THEN the seeded run returns ok false naming the probe path while the 4 allowlisted cutover modules are not reported, and the real run stays clean",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-verify-rehost-residue-scan.test.ts -t 'AC-5 widened Convex scan catches residue outside src/mcp'",
      "test_tier": "integration",
      "verification_service": "cli",
      "unit_test_justified": false,
      "flow_ref": "UC-SVC-04 AC-2",
      "test_file": "tests/integration/mcp-verify-rehost-residue-scan.test.ts",
      "test_function": "AC-5 widened Convex scan catches residue outside src/mcp",
      "tdd_state": "none"
    }
  ],
  "test_criteria": [
    {
      "id": "TC-1",
      "num": 1,
      "statement": "verify-manifest exit code is non-zero when store_document_replay.json is absent from the fixtures dir.",
      "maps_to_ac": "AC-1",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-1 missing replay fixture fails the gate'",
      "type": "boolean"
    },
    {
      "id": "TC-2",
      "num": 2,
      "statement": "The report contains an issue of kind replay_fixture_missing for store_document when its replay fixture is absent.",
      "maps_to_ac": "AC-1",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-1 missing replay fixture fails the gate'",
      "type": "boolean"
    },
    {
      "id": "TC-3",
      "num": 3,
      "statement": "report.tools_covered equals 43 when one replay fixture is absent.",
      "maps_to_ac": "AC-1",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-1 missing replay fixture fails the gate'",
      "type": "boolean"
    },
    {
      "id": "TC-4",
      "num": 4,
      "statement": "The report contains an issue of kind error_fixture_missing for store_document when its error fixture is absent.",
      "maps_to_ac": "AC-2",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-2 missing error fixture fails the gate'",
      "type": "boolean"
    },
    {
      "id": "TC-5",
      "num": 5,
      "statement": "report.tools_covered equals 43 when one error fixture is absent.",
      "maps_to_ac": "AC-2",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-2 missing error fixture fails the gate'",
      "type": "boolean"
    },
    {
      "id": "TC-6",
      "num": 6,
      "statement": "verify-manifest exits 0 with tools_covered 44 and 0 issues against the intact frozen fixture set.",
      "maps_to_ac": "AC-3",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-3 intact frozen fixtures pass 44 of 44'",
      "type": "boolean"
    },
    {
      "id": "TC-7",
      "num": 7,
      "statement": "The ManifestIssue.kind union has 11 members including replay_fixture_missing.",
      "maps_to_ac": "AC-3",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-3 intact frozen fixtures pass 44 of 44'",
      "type": "boolean"
    },
    {
      "id": "TC-8",
      "num": 8,
      "statement": "The report contains an issue of kind fixtures_missing for check_subscriptions when its success fixture is absent.",
      "maps_to_ac": "AC-4",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-4 missing success fixture still fails'",
      "type": "boolean"
    },
    {
      "id": "TC-9",
      "num": 9,
      "statement": "verifyMcpRehost returns ok false when a convex/browser import is seeded outside src/mcp in the scanned tree.",
      "maps_to_ac": "AC-5",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-verify-rehost-residue-scan.test.ts -t 'AC-5 widened Convex scan catches residue outside src/mcp'",
      "type": "boolean"
    },
    {
      "id": "TC-10",
      "num": 10,
      "statement": "convexRefs length equals 1 and contains the seeded probe path on the seeded tree.",
      "maps_to_ac": "AC-5",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-verify-rehost-residue-scan.test.ts -t 'AC-5 widened Convex scan catches residue outside src/mcp'",
      "type": "boolean"
    },
    {
      "id": "TC-11",
      "num": 11,
      "statement": "The residue-scan allowlist deep-equals its declared literal contents.",
      "maps_to_ac": "AC-5",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-verify-rehost-residue-scan.test.ts -t 'AC-5 widened Convex scan catches residue outside src/mcp'",
      "type": "boolean"
    },
    {
      "id": "TC-12",
      "num": 12,
      "statement": "verifyMcpRehost returns ok true with convexRefs length 0 against the real unseeded served source root.",
      "maps_to_ac": "AC-5",
      "verify": "cd services/platform && bun src/cli/holo.ts mcp:verify-rehost --json",
      "type": "boolean"
    }
  ],
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a temp fixtures copy missing store_document_replay.json WHEN mcp:verify-manifest runs THEN it exits non-zero with kind replay_fixture_missing and tools_covered 43.",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-1 missing replay fixture fails the gate'",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-1",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static",
            "stub",
            "empty",
            "mock",
            "deleted"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "frozen_fixture_dir_copy",
            "action": {
              "actor": "operator CLI",
              "steps": [
                "cpSync the committed fixtures dir to a temp dir and count the `*_replay.json` files",
                "Delete `<tmp>/store_document_replay.json`",
                "Run `bun services/platform/src/cli/holo.ts mcp:verify-manifest --manifest <real manifest> --fixtures-dir <tmp> --json` and capture the exit code plus parsed JSON",
                "Record `report.ok`, `report.tools_covered`, `report.tools_total` and the issue kinds for tool_id 'store_document'"
              ]
            },
            "end_state": {
              "must_observe": [
                "the exit code is a value other than 0",
                "`report.ok` equals false",
                "`report.issues` contains an entry with tool_id 'store_document' and kind 'replay_fixture_missing'",
                "`report.tools_covered` equals 43 and `report.tools_total` equals 44",
                "the pre-deletion temp copy contained 21 `*_replay.json` files"
              ],
              "must_not_observe": [
                "an exit code of 0",
                "`report.tools_covered` equal to 44",
                "stdout containing the literal '44/44'",
                "an issues array with 0 entries"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN a temp fixtures copy missing store_document_error.json WHEN mcp:verify-manifest runs THEN it exits non-zero with kind error_fixture_missing and tools_covered 43.",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-2 missing error fixture fails the gate'",
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
            "mock",
            "deleted"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "frozen_fixture_dir_copy",
            "action": {
              "actor": "operator CLI",
              "steps": [
                "cpSync the committed fixtures dir to a fresh temp dir",
                "Delete `<tmp>/store_document_error.json`",
                "Run the verify-manifest CLI against that temp dir with `--json` and capture the exit code plus parsed JSON",
                "Record `report.ok`, `report.tools_covered` and the issue kinds for 'store_document'"
              ]
            },
            "end_state": {
              "must_observe": [
                "the exit code is a value other than 0",
                "`report.issues` contains an entry with tool_id 'store_document' and kind 'error_fixture_missing'",
                "`report.tools_covered` equals 43",
                "`report.ok` equals false"
              ],
              "must_not_observe": [
                "an exit code of 0",
                "`report.tools_covered` equal to 44",
                "an issue kind of 'fixtures_missing' standing in for the error-fixture case",
                "an issues array with 0 entries"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN the intact frozen fixture set WHEN mcp:verify-manifest runs THEN it exits 0 at 44/44 and the kind union carries 11 members.",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-3 intact frozen fixtures pass 44 of 44'",
      "maps_to_ac": null,
      "scenario": {
        "id": "AC-3",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "static",
            "removed"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "frozen_fixture_dir_copy",
            "action": {
              "actor": "operator CLI",
              "steps": [
                "Run the verify-manifest CLI against the untouched temp copy with `--json`",
                "Record the exit code, `report.ok`, `report.tools_covered`, `report.tools_total` and `report.issues.length`",
                "Read `verify-manifest.ts` and count the members of the `ManifestIssue.kind` union",
                "Confirm the union carries the literal member 'replay_fixture_missing'"
              ]
            },
            "end_state": {
              "must_observe": [
                "the exit code equals 0 and `report.ok` equals true",
                "`report.tools_covered` equals 44 and `report.tools_total` equals 44",
                "`report.issues` has length 0",
                "the `ManifestIssue.kind` union has 11 members",
                "the union carries the literal member 'replay_fixture_missing'"
              ],
              "must_not_observe": [
                "an exit code other than 0 on the intact set",
                "`report.tools_covered` below 44",
                "a kind union with 10 members"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN a temp fixtures copy missing check_subscriptions_success.json WHEN mcp:verify-manifest runs THEN kind fixtures_missing fires and tools_covered is 43.",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-4 missing success fixture still fails'",
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
            "stub",
            "empty",
            "deleted"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "frozen_fixture_dir_copy",
            "action": {
              "actor": "operator CLI",
              "steps": [
                "cpSync the committed fixtures dir to a fresh temp dir and count the 44 `*_success.json` files",
                "Delete `<tmp>/check_subscriptions_success.json`",
                "Run the verify-manifest CLI against that temp dir with `--json`",
                "Record the exit code, `report.tools_covered` and the issue kinds for 'check_subscriptions'"
              ]
            },
            "end_state": {
              "must_observe": [
                "the exit code is a value other than 0",
                "`report.issues` contains an entry with tool_id 'check_subscriptions' and kind 'fixtures_missing'",
                "`report.tools_covered` equals 43",
                "the pre-deletion temp copy contained 44 `*_success.json` files"
              ],
              "must_not_observe": [
                "an exit code of 0",
                "`report.tools_covered` equal to 44",
                "an issues array with 0 entries"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN a seeded convex/browser import outside src/mcp WHEN verifyMcpRehost scans the served root THEN it reports the probe path while the 4 allowlisted cutover modules stay clean.",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-verify-rehost-residue-scan.test.ts -t 'AC-5 widened Convex scan catches residue outside src/mcp'",
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
            "empty",
            "mock"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "convex_residue_probe_tree",
            "action": {
              "actor": "gate reviewer",
              "steps": [
                "cpSync `services/platform/src` to a temp tree",
                "Write `<tmp>/tools/s31-residue-probe.ts` containing `import { ConvexClient } from 'convex/browser';`",
                "Run `verifyMcpRehost` with the scan root pointed at the temp tree and capture the result",
                "Record `convexRefs`, `ok` and the resolved allowlist array",
                "Run `verifyMcpRehost` against the real unseeded tree and record `ok` plus `convexRefs`"
              ]
            },
            "end_state": {
              "must_observe": [
                "the seeded run returns `ok` equal to false",
                "`convexRefs` contains a path ending in 'tools/s31-residue-probe.ts'",
                "`convexRefs` has length 1 on the seeded tree",
                "the sorted residue allowlist deep-equals the declared literal set and has length >= 1",
                "the unseeded real-tree run returns `ok` true with `convexRefs` length 0"
              ],
              "must_not_observe": [
                "the seeded run returning `ok` true",
                "a `convexRefs` length of 0 on the seeded tree",
                "any of the 4 real cutover Convex-importing modules appearing in `convexRefs`",
                "an allowlist entry equal to 'services/platform/src' covering the whole served root"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "verify-manifest exit code is non-zero when store_document_replay.json is absent from the fixtures dir.",
      "maps_to_ac": "AC-1",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-1 missing replay fixture fails the gate'"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "The report contains an issue of kind replay_fixture_missing for store_document when its replay fixture is absent.",
      "maps_to_ac": "AC-1",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-1 missing replay fixture fails the gate'"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "report.tools_covered equals 43 when one replay fixture is absent.",
      "maps_to_ac": "AC-1",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-1 missing replay fixture fails the gate'"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "The report contains an issue of kind error_fixture_missing for store_document when its error fixture is absent.",
      "maps_to_ac": "AC-2",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-2 missing error fixture fails the gate'"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "report.tools_covered equals 43 when one error fixture is absent.",
      "maps_to_ac": "AC-2",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-2 missing error fixture fails the gate'"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "verify-manifest exits 0 with tools_covered 44 and 0 issues against the intact frozen fixture set.",
      "maps_to_ac": "AC-3",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-3 intact frozen fixtures pass 44 of 44'"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "The ManifestIssue.kind union has 11 members including replay_fixture_missing.",
      "maps_to_ac": "AC-3",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-3 intact frozen fixtures pass 44 of 44'"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "The report contains an issue of kind fixtures_missing for check_subscriptions when its success fixture is absent.",
      "maps_to_ac": "AC-4",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-manifest-negative-controls.test.ts -t 'AC-4 missing success fixture still fails'"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "verifyMcpRehost returns ok false when a convex/browser import is seeded outside src/mcp in the scanned tree.",
      "maps_to_ac": "AC-5",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-verify-rehost-residue-scan.test.ts -t 'AC-5 widened Convex scan catches residue outside src/mcp'"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "convexRefs length equals 1 and contains the seeded probe path on the seeded tree.",
      "maps_to_ac": "AC-5",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-verify-rehost-residue-scan.test.ts -t 'AC-5 widened Convex scan catches residue outside src/mcp'"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": "The residue-scan allowlist deep-equals its declared literal contents.",
      "maps_to_ac": "AC-5",
      "verify": "pnpm vitest run --project integration tests/integration/mcp-verify-rehost-residue-scan.test.ts -t 'AC-5 widened Convex scan catches residue outside src/mcp'"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": "verifyMcpRehost returns ok true with convexRefs length 0 against the real unseeded served source root.",
      "maps_to_ac": "AC-5",
      "verify": "cd services/platform && bun src/cli/holo.ts mcp:verify-rehost --json"
    }
  ]
}
-->

</details>
