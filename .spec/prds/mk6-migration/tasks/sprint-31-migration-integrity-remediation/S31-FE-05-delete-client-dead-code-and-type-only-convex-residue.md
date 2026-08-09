# S31-FE-05 — Delete client dead code and type-only Convex residue that blocks Sprint 32

**PROPOSED-BY:** react-native-ui-planner · **Sprint:** sprint-31-migration-integrity-remediation · **Template:** TASK-TEMPLATE v5.2

## What this does
Retargets three integration assertions onto live surfaces, then deletes four orphan client files and three type-only Convex imports so `grep -ri convex components/` returns nothing.

## Why
`components/ResearchProgressWithConvex.tsx` fails UC-SYNC-05 AC-1 on its FILENAME alone — the hard Sprint 32 blocker. But two tests currently accept that orphan as a valid surface, so deleting it first would silently narrow coverage to a false green.

## How to verify
`grep -ri convex components/` returns zero lines and `pnpm verify:no-convex-client` exits 0. Each retargeted test must FAIL when its live target is scratch-removed and PASS again after `git checkout`.

## Scope
Retargets three test files, deletes four orphans, removes the unused `eventsource` import, replaces three Convex type imports. `lib/eventsource-rn-polyfill.js` is load-bearing and stays.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-FE-05 - Delete client dead code and type-only Convex residue that blocks Sprint 32
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M
AGENT:      implementer=react-native-ui-implementer | reviewer=react-native-ui-reviewer
PROPOSED-BY: react-native-ui-planner
ESTIMATE:   150 minutes
TDD_MODE:   red_first
CAPABILITIES: CAP-CUT-01, CAP-SYNC-01
PRD_REFS:   08-uc-sync.md UC-SYNC-05 AC-1 · 08-uc-sync.md UC-SYNC-05 AC-2 · 01-scope.md:82

RUNTIME_COMMANDS:
  test:      pnpm test:unit ; PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: 0/6 ACs complete

--------------------------------------------------------------------------------
OUTCOME (1 sentence, <=30 words — observable success)
--------------------------------------------------------------------------------

The components tree holds zero Convex residue including filenames, and every retargeted assertion is pinned to a live surface rather than a deleted orphan.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- NEVER delete an orphan before retargeting the tests. tests/integration/s-reactive-02-research-progress-zero.test.ts:83-92 JOINS the orphan's source with the live surface's, so the ORPHAN ALONE satisfies every assertion; s-rewrite-04:25-26 lists both orphans in CLUSTER_ROOTS and throws on a missing file. Fix both first, or coverage narrows to a false green.
- NEVER delete or weaken tests/integration/s-reactive-01-resumable-sse.test.ts. Its subject is real; only its mechanism is wrong. After the eventsource import is removed its /EventSource/ regex would still pass on the prose comments at hooks/use-resumable-sse-stream.ts:32 and :62 — retarget it to the XHR path and keep its 3 mock-rejection assertions.
- NEVER delete lib/eventsource-rn-polyfill.js — it is required at hooks/use-resumable-sse-stream.ts:21 and load-bearing. Note lib/eventsource-rn-polyfill.ts ALSO exists and the s-reactive-01 test asserts the .ts variant; establish which is loaded before touching either.
- NEVER remove `eventsource` from package.json:114 without a captured grep proving 0 importers remain repo-wide.
- NEVER add a component, testID, error surface, `any` alias, or ts-expect-error. This task is subtraction only; a replacement type must name concrete fields.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] `grep -ri convex components/` returns 0 lines and `pnpm verify:no-convex-client` exits 0 — AC-1 (PRIMARY)
- [ ] The retargeted progress-surface test FAILS when the live marker is removed — AC-2
- [ ] The retargeted transport test FAILS when the XHR path is removed — AC-3
- [ ] `pnpm tsgo --noEmit` exits 0 with 0 `convex/_generated` references under the client roots — AC-4
- [ ] The app cold-boots and both live surfaces render real seeded data — AC-5
- [ ] pnpm test:unit + PLATFORM_IT=1 pnpm test:integration pass with no reduction in suite count
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: The components tree is free of Convex residue including filenames [PRIMARY]
  GIVEN: the four orphans deleted and three type-only Convex imports replaced
  WHEN:  the Convex residue checks run
  THEN:  the components grep returns 0 hits and verify:no-convex-client exits 0

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  holo CLI verify:no-convex-client executed against the real repository tree
  TDD_STATE:     none
  TEST_FILE:     tests/integration/s31-fe-05-convex-residue.test.ts
  TEST_FUNCTION: components tree holds no convex residue

  SCENARIO:
    START_REF:        repo-tree-at-head
    NEGATIVE_CONTROL: would fail if the orphan file is left present so its filename still matches, the imports are hardcoded to any, or verify:no-convex-client is stubbed
    EVIDENCE:         stdout
    CASES:
      - ACTION:           run grep -ri convex components/, run pnpm verify:no-convex-client, run ls components/ | grep -i convex
        MUST_OBSERVE:     'grep -ri convex components/' produces 0 output lines and returns exit status 1; verify:no-convex-client returns exit status 0
        MUST_NOT_OBSERVE: 'components/ResearchProgressWithConvex.tsx' appears 0 times in any output

AC-2: The retargeted progress-surface assertion is pinned to the live surface
  GIVEN: the orphan removed from the surfaces array
  WHEN:  the live marker is scratch-removed and the test re-run
  THEN:  the test fails, and passes again after git checkout

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  vitest integration lane PLATFORM_IT=1 against the real source tree
  TDD_STATE:     none
  TEST_FILE:     tests/integration/s-reactive-02-research-progress-zero.test.ts
  TEST_FUNCTION: progress surface

AC-3: The retargeted SSE-transport test proves the real XHR path, not a comment
  GIVEN: the eventsource import and its void statement deleted
  WHEN:  the XHR path is scratch-removed and the test re-run
  THEN:  the test fails rather than passing on prose

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  vitest integration lane PLATFORM_IT=1 against the real source tree
  TDD_STATE:     none
  TEST_FILE:     tests/integration/s-reactive-01-resumable-sse.test.ts
  TEST_FUNCTION: resumable sse transport

AC-4: Typecheck passes with no import reaching convex/_generated
  GIVEN: the three type-only Convex imports replaced
  WHEN:  tsgo and the residue grep run
  THEN:  typecheck exits 0 and 0 client files reference convex/_generated

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  tsgo typechecker plus grep against the real repository tree
  TDD_STATE:     none
  TEST_FILE:     tests/integration/s31-fe-05-convex-residue.test.ts
  TEST_FUNCTION: no convex generated types under the client roots

AC-5: The app still boots and the live surfaces still render real data
  GIVEN: all deletions applied and the Metro cache cleared
  WHEN:  the operator cold-launches and opens the research and chat surfaces
  THEN:  both render real seeded data with 0 module resolution failures

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  maestro-ios-simulator + real Metro bundle + real Postgres + real zero-cache on 4848 + real Mastra on 4111
  TDD_STATE:     none
  TEST_FILE:     .maestro/research/session-loads.yml
  TEST_FUNCTION: session-loads

AC-6: The eventsource dependency is removed only when provably unimported
  GIVEN: the eventsource import deleted
  WHEN:  the importer grep runs
  THEN:  the dependency drops only on 0 importers and the polyfill is retained

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  grep plus pnpm against the real repository tree
  TDD_STATE:     none
  TEST_FILE:     tests/integration/s31-fe-05-convex-residue.test.ts
  TEST_FUNCTION: eventsource dependency removal is importer-gated

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- tests/integration/s-reactive-01-resumable-sse.test.ts (MODIFY — retarget only)
- tests/integration/s-reactive-02-research-progress-zero.test.ts (MODIFY — retarget only)
- tests/integration/s-rewrite-04-research-cluster-zero.test.ts (MODIFY — CLUSTER_ROOTS only)
- tests/integration/s31-fe-05-convex-residue.test.ts (NEW)
- hooks/use-resumable-sse-stream.ts (MODIFY — the import block at :19-36 only)
- components/AssimilationCard.tsx (MODIFY)
- components/subscriptions/types.ts (MODIFY)
- components/subscriptions/SubscriptionCard.tsx (MODIFY)
- package.json (MODIFY — the eventsource line only, and only if unimported)
- lib/rn-sse-fetch.ts, components/ResearchProgressWithConvex.tsx, components/ResearchProgress.tsx, screens/ChatScreen.tsx (DELETE)

writeProhibited:
- lib/eventsource-rn-polyfill.js — LOAD-BEARING, required at hooks/use-resumable-sse-stream.ts:21
- components/deep-research/DeepResearchDetailView.tsx — probe scratch edits must be reverted, never committed
- app/(drawer)/chat/[conversationId].tsx — S31-FE-01 and S31-FE-04 own it
- convex/** — Sprint 32 owns directory deletion
- Any file not explicitly listed above

--------------------------------------------------------------------------------
BOUNDARIES (✅ Always / ⚠️ Ask First)
--------------------------------------------------------------------------------

✅ Always:
- Work in this order: retarget the three tests, confirm they pass, delete the orphans, delete the eventsource import, replace the type imports, re-run the gates.
- Capture every zero-importer check as stdout evidence, never as a claim in a commit message.
- Run the negative-control probe for AC-2 and AC-3 and revert each scratch edit with git checkout.
- Delete files outright; leave 0 stub re-exports and 0 commented-out blocks (01-scope.md:82).
- Record the integration suite count before deletion so a silent reduction is detectable.

⚠️ Ask First:
- Removing any test assertion rather than retargeting it.
- Choosing a locally declared type where a matching Zero table exists in app/zero/schema.ts.
- Deleting or renaming either eventsource-rn-polyfill variant.
- Any deletion whose importer grep is not empty.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- tests/integration/s-reactive-02-research-progress-zero.test.ts + s-rewrite-04-research-cluster-zero.test.ts (MODIFY): assertions repinned to live surfaces — blocker, must land before any deletion
- tests/integration/s-reactive-01-resumable-sse.test.ts (MODIFY): retargeted to the XHR transport, mock-rejection assertions intact
- hooks/use-resumable-sse-stream.ts (MODIFY): unused eventsource import and its void statement removed
- components/AssimilationCard.tsx, components/subscriptions/types.ts, components/subscriptions/SubscriptionCard.tsx (MODIFY): Zero-derived or locally declared types
- lib/rn-sse-fetch.ts, components/ResearchProgressWithConvex.tsx, components/ResearchProgress.tsx, screens/ChatScreen.tsx (DELETE)

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  READ:   the AC, existing tests, the READING LIST
  WRITE:  ONE test exercising GIVEN-WHEN-THEN
  RUN:    the AC's TEST_FILE
  VERIFY: the test FAILS (not errors — fails)
  RETURN: { phase: "RED", test_file, test_function, failure_output }

### GREEN PHASE (after orchestrator VERIFY_RED passes)
  WRITE:  MINIMAL code to pass
  RETURN: { phase: "GREEN", files_changed, test_output }

### REFACTOR PHASE (after orchestrator VERIFY_GREEN passes)
  WRITE:  improved code if needed; tests stay green
  RETURN: { phase: "REFACTOR", files_changed, still_passing }

## AFTER ALL ACs COMPLETE:
  Orchestrator dispatches react-native-ui-reviewer.

--------------------------------------------------------------------------------
READING LIST (max 5 files — canonical pattern first)
--------------------------------------------------------------------------------

1. components/chat/ChatThread.tsx [PRIMARY PATTERN]
   - Lines: 434-450
   - Focus: the canonical failure presentation, untouched by this task. Read it to confirm the cleanup introduces 0 components and 0 testIDs — subtraction only.

2. tests/integration/s-reactive-02-research-progress-zero.test.ts + tests/integration/s-rewrite-04-research-cluster-zero.test.ts
   - Lines: 83-92 and 18-40
   - Focus: THE TRAP. The surfaces array joins the orphan's source with the live surface's before asserting, so the orphan alone satisfies research-progress-bar, SafeAreaView and useResearchProgress. CLUSTER_ROOTS at :25-26 reads both orphan paths and throws if they are missing.

3. tests/integration/s-reactive-01-resumable-sse.test.ts
   - Lines: 70-84
   - Focus: the test named 'hook uses EventSource (not a mock stub)'. Its /EventSource/ regex survives on comments once the import is gone; retarget to openProgressiveSse/XMLHttpRequest and keep the mock-rejection assertions at :80-82. It also asserts existsSync of the .ts polyfill variant while the hook requires the .js.

4. hooks/use-resumable-sse-stream.ts
   - Lines: 19-36, 60-143
   - Focus: :21 requires the .js polyfill (KEEP); :23-26 import the unused WhatWG EventSource with a comment admitting the live transport is XHR; :35 is the void. Delete 23-26 and 35 only. openProgressiveSse at :64-143 is the real transport the retargeted test pins to.

5. components/subscriptions/types.ts + components/AssimilationCard.tsx + app/zero/schema.ts
   - Lines: 1-30, 1-30, 1-80
   - Focus: the `Doc` and `Id` type-only imports to replace and the Zero table row types that replace them. Zero uses uuid string keys, so `Id` is most likely a locally declared branded string alias.

--------------------------------------------------------------------------------
EVIDENCE GATES (fast/cheap first — fail fast)
--------------------------------------------------------------------------------

Gate 1: RED evidence — TDD_STATE shows each test went red before green.
Gate 2: One test per AC.
Gate 3: pnpm test:unit and PLATFORM_IT=1 pnpm test:integration exit 0 with no reduction in suite count vs the recorded baseline.
Gate 4: pnpm tsgo --noEmit exits 0.
Gate 5: pnpm biome check . exits 0.
Gate 6: git diff --name-only ⊆ SCOPE.writeAllowed.
Gate 7: AC-1 (PRIMARY) is integration against the real CLI; no PRIMARY unit test.
Gate 8: validate_scenario.py exits 0 on the PRIMARY scenario; the captured stdout shows the 0-line grep and the verify:no-convex-client pass summary, and the AC-2/AC-3 probes recorded a genuine FAIL before restore.

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Deleting the convex/ directory itself — Sprint 32 owns that
- Stub-rewriting residual convex modules (01-scope.md:82 — deletion supersedes stubbing)
- Any new component, testID, or error surface
- Behavior changes to the SSE transport — this removes an unused import only

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** four orphan client files with zero production importers, two tests that accept an orphan as a valid surface, an unused eventsource import kept alive solely to satisfy a source-regex test, and three type-only Convex imports forcing convex/ to survive typecheck.

**Gap:** components/ResearchProgressWithConvex.tsx fails UC-SYNC-05 AC-1 on its filename, and deleting it naively converts two tests into false greens.

--------------------------------------------------------------------------------
REVIEW (for react-native-ui-reviewer)
--------------------------------------------------------------------------------

Must pass (<=5, evidence-gate-backed):
- One test per AC; tests verify behavior not implementation
- RED evidence present in TDD_STATE history
- Minimal implementation; no gold-plating
- Pattern consistent with READING LIST [PRIMARY PATTERN] — 0 additions of any kind
- SCOPE respected; lib/eventsource-rn-polyfill.js intact

Should verify (<=5, judgment):
- Tests were retargeted BEFORE deletion, evidenced by commit or run ordering
- The AC-2 and AC-3 negative-control probes genuinely failed, with output captured
- Replacement types name concrete fields; 0 `any` aliases and 0 ts-expect-error added
- The integration suite count did not shrink versus the recorded baseline
- If SafeAreaView matching came from the deleted orphan, the assertion was repointed to the live ScreenLayout mechanism rather than a hand-rolled SafeAreaView

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: none
Blocks:     Sprint 32 Convex decommission (removes the last components/ filename blocker)
Parallel:   S31-FE-01, S31-FE-02, S31-FE-04, S31-FE-06

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable)
--------------------------------------------------------------------------------
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-FE-05",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-research-and-chat": {
      "description": "Real Postgres seeded through the platform CLI with 1 research session and 1 conversation, replicated over zero-cache, used to prove the live surfaces still render after the deletions",
      "seed_method": "cli",
      "records": [
        "deep_research_sessions: 1 row with topic text",
        "conversations: 1 row id=00000000-0000-4000-8000-0000000000e1",
        "chat_messages: >=2 durable rows"
      ]
    },
    "live-surface-scratch-probe": {
      "description": "Working tree with a temporary scratch edit applied through git that removes the research-progress-bar marker from the live surface or the XHR transport from the hook, reverted with git checkout immediately after the probe",
      "seed_method": "cli",
      "records": [
        "scratch edit applied: 1 file",
        "test run before edit: PASS",
        "test run with edit: expected FAIL",
        "git checkout restores 1 file"
      ]
    },
    "repo-tree-at-head": {
      "description": "The real repository working tree with dependencies installed so pnpm verify:no-convex-client, tsgo and the integration lane all execute against live source",
      "seed_method": "cli",
      "records": [
        "pnpm install completed",
        "integration suite baseline count recorded before deletion",
        "4 orphan files present at start"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the four orphans deleted and three Convex type imports replaced WHEN the Convex residue checks run THEN the components grep returns no hits and verify:no-convex-client exits zero",
      "verify": "grep -ri convex components/ ; pnpm verify:no-convex-client",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-05-AC-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI verify:no-convex-client executed against the real repository tree",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the orphan file is left present so its filename still matches the grep",
            "the type-only imports are hardcoded to any instead of removed",
            "verify:no-convex-client is stubbed to always exit 0"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "repo-tree-at-head",
            "action": {
              "actor": "system",
              "steps": [
                "run 'grep -ri convex components/' and capture stdout plus exit status",
                "run 'pnpm verify:no-convex-client' and capture stdout plus exit status",
                "run 'ls components/ | grep -i convex' and capture the match count"
              ]
            },
            "end_state": {
              "must_observe": [
                "'grep -ri convex components/' produces 0 output lines and returns exit status 1",
                "'pnpm verify:no-convex-client' prints its pass summary and returns exit status 0",
                "'ls components/ | grep -i convex' returns 0 filename matches"
              ],
              "must_not_observe": [
                "the path 'components/ResearchProgressWithConvex.tsx' appears 0 times in any output",
                "0 lines matching 'convex/_generated' remain under components/"
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
      "description": "GIVEN the progress-surface assertion retargeted to the live surface WHEN its marker is temporarily removed THEN the test fails and passes again after restore",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'progress surface'",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-05-AC-2",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest integration lane PLATFORM_IT=1 executed against the real source tree",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the orphan remains in the surfaces array so a deleted file still satisfies the assertion",
            "the assertion is a static string match with no live target",
            "the test is stubbed"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "live-surface-scratch-probe",
            "action": {
              "actor": "system",
              "steps": [
                "run PLATFORM_IT=1 pnpm test:integration -t 'progress surface' and record the exit status",
                "remove the research-progress-bar marker from components/deep-research/DeepResearchDetailView.tsx as a scratch edit",
                "re-run the same test and record the exit status",
                "run git checkout on the scratch edit and re-run the test"
              ]
            },
            "end_state": {
              "must_observe": [
                "run 1 returns exit status 0",
                "run 2 with the marker removed returns a non-zero exit status and names 'research-progress-bar'",
                "run 3 after git checkout returns exit status 0"
              ],
              "must_not_observe": [
                "run 2 returns exit status 0 while the live marker is removed",
                "'components/ResearchProgressWithConvex.tsx' appears 0 times in the retargeted test file"
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
      "description": "GIVEN the eventsource import deleted and the transport assertion retargeted WHEN the XHR path is temporarily removed THEN the test fails rather than passing on a prose comment",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'resumable sse transport'",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-05-AC-3",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest integration lane PLATFORM_IT=1 executed against the real source tree",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the assertion still matches the word EventSource inside a comment so a removed transport is undetected",
            "the mock-rejection assertions are deleted",
            "the hook is stubbed"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "live-surface-scratch-probe",
            "action": {
              "actor": "system",
              "steps": [
                "run the retargeted transport test and record the exit status",
                "rename openProgressiveSse and its XMLHttpRequest usage in hooks/use-resumable-sse-stream.ts as a scratch edit",
                "re-run the test and record the exit status",
                "run git checkout on the scratch edit and re-run"
              ]
            },
            "end_state": {
              "must_observe": [
                "run 1 returns exit status 0",
                "run 2 with the XHR path removed returns a non-zero exit status",
                "the retargeted test still asserts absence of 'mockEventSource', 'FakeEventSource' and 'stubEventSource', 3 assertions retained"
              ],
              "must_not_observe": [
                "run 2 returns exit status 0 on the strength of a comment containing the word EventSource",
                "0 mock-rejection assertions remain in the retargeted test"
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
      "description": "GIVEN the type-only Convex imports replaced with Zero-derived or locally declared types WHEN typecheck and the residue grep run THEN typecheck exits zero and no client file references convex/_generated",
      "verify": "pnpm tsgo --noEmit && grep -rn 'convex/_generated' app/ components/ hooks/ lib/ screens/",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-05-AC-4",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "tsgo typechecker plus grep executed against the real repository tree",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the replacement type is hardcoded to any so nothing is really typed",
            "a ts-expect-error is added to force compilation",
            "the convex directory is still required for typecheck"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "repo-tree-at-head",
            "action": {
              "actor": "system",
              "steps": [
                "run 'pnpm tsgo --noEmit' and capture the exit status",
                "run \"grep -rn 'convex/_generated' app/ components/ hooks/ lib/ screens/\" and capture the line count",
                "inspect the 3 replaced type declarations for an any alias or a ts-expect-error"
              ]
            },
            "end_state": {
              "must_observe": [
                "'pnpm tsgo --noEmit' returns exit status 0",
                "the convex/_generated grep returns 0 lines across the 5 client roots",
                "all 3 replacement declarations name concrete fields"
              ],
              "must_not_observe": [
                "a ts-expect-error or ts-ignore was added, 0 permitted",
                "a replacement type aliased to any, 0 permitted"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN all deletions applied and the Metro cache cleared WHEN the operator cold-launches and opens the research and chat surfaces THEN both render real seeded data with no module resolution failure",
      "verify": "maestro test .maestro/research/session-loads.yml && maestro test .maestro/chat/send-streams.yml",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-05-AC-5",
        "primary": false,
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro-ios-simulator + real Metro bundle + real Postgres + real zero-cache on 4848 + real Mastra on 4111",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "a still-imported dependency was removed so Metro cannot resolve a module",
            "the surfaces render mocked data while zero-cache is disconnected",
            "the screens are static shells"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-research-and-chat",
            "action": {
              "actor": "user",
              "steps": [
                "restart Metro with --clear after the deletions and the package.json change",
                "launchApp with clearState true on the named iOS Simulator",
                "openLink MAESTRO_RESEARCH_SESSION_URL and wait for id 'research-detail-view'",
                "openLink MAESTRO_CHAT_URL, send a message and wait for the streamed reply"
              ]
            },
            "end_state": {
              "must_observe": [
                "`research-detail-view` renders the seeded topic text with >=10 characters",
                "`chat-assistant-message-latest` carries >=20 characters of live streamed reply text",
                "`research-progress-bar` resolves to 1 node on the live research surface"
              ],
              "must_not_observe": [
                "the text 'Unable to resolve module' appears 0 times",
                "the text 'Metro has encountered an error' appears 0 times",
                "0 red-screen error overlays are present"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the eventsource import deleted WHEN the importer grep runs THEN the dependency is dropped only on zero importers and the load-bearing polyfill is retained",
      "verify": "grep -rn \"from 'eventsource'\" --exclude-dir=node_modules . ; test -e lib/eventsource-rn-polyfill.js",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-05-AC-6",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "grep plus pnpm executed against the real repository tree",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the dependency is removed while an importer still exists so the bundle breaks",
            "the load-bearing polyfill is deleted",
            "the importer count is asserted from memory instead of a captured grep"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "repo-tree-at-head",
            "action": {
              "actor": "system",
              "steps": [
                "run \"grep -rn \\\"from 'eventsource'\\\" --exclude-dir=node_modules .\" and capture the match count",
                "if the count is 0, remove eventsource from package.json and run pnpm install",
                "run 'test -e lib/eventsource-rn-polyfill.js' and capture the exit status",
                "run \"grep -n 'eventsource-rn-polyfill' hooks/use-resumable-sse-stream.ts\" and capture the matched line number"
              ]
            },
            "end_state": {
              "must_observe": [
                "the captured grep output records an importer count of 0 for `from 'eventsource'` outside node_modules",
                "'test -e lib/eventsource-rn-polyfill.js' returns exit status 0",
                "hooks/use-resumable-sse-stream.ts line 21 still requires 'eventsource-rn-polyfill'"
              ],
              "must_not_observe": [
                "eventsource was removed from package.json while the importer count was greater than 0",
                "lib/eventsource-rn-polyfill.js is deleted, 0 deletions permitted"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "grep -ri convex components/ returns 0 matching lines",
      "verify": "grep -ri convex components/",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "pnpm verify:no-convex-client exits 0",
      "verify": "pnpm verify:no-convex-client",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "tests/integration/s-reactive-02-research-progress-zero.test.ts contains 0 references to components/ResearchProgressWithConvex.tsx",
      "verify": "grep -c ResearchProgressWithConvex tests/integration/s-reactive-02-research-progress-zero.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "with research-progress-bar removed from the live surface the retargeted progress-surface test exits non-zero",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'progress surface'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "s-rewrite-04 CLUSTER_ROOTS contains 0 entries for components/ResearchProgress.tsx and components/ResearchProgressWithConvex.tsx",
      "verify": "grep -n 'ResearchProgress' tests/integration/s-rewrite-04-research-cluster-zero.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "hooks/use-resumable-sse-stream.ts contains 0 imports from eventsource and 0 void WhatWgEventSource statements",
      "verify": "grep -n \"from 'eventsource'\\|WhatWgEventSource\" hooks/use-resumable-sse-stream.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "with the XHR openProgressiveSse path removed the retargeted transport test exits non-zero",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'resumable sse transport'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "the retargeted transport test retains its mockEventSource, FakeEventSource and stubEventSource rejection assertions",
      "verify": "grep -n 'mockEventSource\\|FakeEventSource\\|stubEventSource' tests/integration/s-reactive-01-resumable-sse.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "grep -rn convex/_generated across the 5 client roots returns 0 lines",
      "verify": "grep -rn 'convex/_generated' app/ components/ hooks/ lib/ screens/",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "pnpm tsgo --noEmit exits 0",
      "verify": "pnpm tsgo --noEmit",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": "the 4 orphan files do not exist on disk",
      "verify": "test ! -e lib/rn-sse-fetch.ts && test ! -e components/ResearchProgressWithConvex.tsx && test ! -e components/ResearchProgress.tsx && test ! -e screens/ChatScreen.tsx",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": "lib/eventsource-rn-polyfill.js exists and is required at hooks/use-resumable-sse-stream.ts line 21",
      "verify": "test -e lib/eventsource-rn-polyfill.js && grep -n 'eventsource-rn-polyfill' hooks/use-resumable-sse-stream.ts",
      "maps_to_ac": "AC-6"
    },
    {
      "id": "TC-13",
      "type": "test_criterion",
      "description": ".maestro/research/session-loads.yml passes after the deletions with a cleared Metro cache",
      "verify": "maestro test .maestro/research/session-loads.yml",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-14",
      "type": "test_criterion",
      "description": ".maestro/chat/send-streams.yml passes after the deletions with a cleared Metro cache",
      "verify": "maestro test .maestro/chat/send-streams.yml",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-15",
      "type": "test_criterion",
      "description": "PLATFORM_IT=1 pnpm test:integration exits 0 with no reduction in suite count versus the recorded baseline",
      "verify": "PLATFORM_IT=1 pnpm test:integration",
      "maps_to_ac": "AC-2"
    }
  ]
}
-->

</details>
