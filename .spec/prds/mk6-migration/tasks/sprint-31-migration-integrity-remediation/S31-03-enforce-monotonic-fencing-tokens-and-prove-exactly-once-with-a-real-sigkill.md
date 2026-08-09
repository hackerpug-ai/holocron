# S31-03: Enforce monotonic fencing tokens and prove exactly-once with a real SIGKILL

> **Task ID:** S31-03
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Type:** FEATURE · **Priority:** P0 · **Effort:** L · **Estimate:** 420 min
> **PROPOSED-BY:** `mastra-planner`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> **Status:** Backlog

**Capabilities:** CAP-CUT-01
**PRD refs:** UC-PLAT-03, UC-SVC-01, R9

## What this does

Replaces the per-call `fence-${randomUUID()}` mint with a monotonic per-key token allocated and persisted inside the effect transaction, adds the comparison site that rejects a superseded holder, and replaces the in-process fake crash tests with real child-process SIGKILL tests copied from the mission suite's proven harness.

## Why

`durable-effect.ts` mints a fresh random token at line 123 and a second, independent one at line 174, and nothing anywhere compares them — `holo queue:audit effect-kill9-1` shows the outbox row and effect row for one key carrying different tokens today. The kill-9 tests are fiction: they take a `crashAt` parameter and `throw new Error('CRASH:...')` inside `sql.begin`, which proves transaction rollback works, not that a killed process recovers exactly-once.

## How to verify

- `cd services/platform && bun src/cli/holo.ts queue:audit fence-mono-1 --json` shows one identical token across outbox, effect and inbox, and a strictly greater token on the second lifecycle.
- `PLATFORM_IT=1 pnpm test:integration` passes, with every crash case asserting exit `signal === 'SIGKILL'` after a captured boundary marker.
- `rg 'crashAt' services/platform/src` returns zero hits.

## Scope

Touches `queue/durable-effect.ts`, `queue/priority.ts`, the runner call sites and the two new crash suites. The migration adding any token column goes through S31-01.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-03 - Enforce monotonic fencing tokens and prove exactly-once with a real SIGKILL
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
AGENT_RATIONALE: Postgres transaction-boundary work inside services/platform/src/queue plus a crash harness that must copy an existing in-repo real-SIGKILL pattern; mastra-implementer owns both the queue module and the mission-red harness, and the fix is inseparable from the transaction it lives in.
PROPOSED-BY: mastra-planner

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: AC-1..AC-4 TDD_STATE none · 0/4 complete

--------------------------------------------------------------------------------
OUTCOME (1 sentence, <=30 words — observable success)
--------------------------------------------------------------------------------

One idempotency key carries one monotonic token that is actually compared, and a real SIGKILL at every boundary still yields exactly one effect.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- NEVER simulate a crash with an in-process throw inside sql.begin — a rolled-back transaction is not a killed process and cannot prove recovery of committed-but-unacked work.
- NEVER mint a token outside the transaction that persists it; an in-memory mint before the write reintroduces the current defect in a new shape.
- NEVER let a crash case pass when the child exited normally — signal must be exactly 'SIGKILL' and wasKilled true, after a boundary marker proving the boundary was reached.
- NEVER mock Postgres, node:child_process, or the holo CLI dispatcher.
- NEVER point a SIGKILL harness at production Postgres; every crash test is scoped to a disposable nonprod namespace (R24).

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] One lifecycle carries one identical token across outbox, effect and inbox; the next lifecycle's token is strictly greater — maps to AC-1 (PRIMARY)
- [ ] A superseded holder is refused with STALE_FENCE_TOKEN and queue_effects stays at 1 row — maps to AC-2
- [ ] A real SIGKILL at all 3 boundaries, each after a captured marker, replays to exactly 1 effect — maps to AC-3
- [ ] crashAt and the CRASH: throws are deleted and a caller passing crashAt fails typecheck — maps to AC-4
- [ ] PLATFORM_IT=1 pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: One key, one token per lifecycle, strictly increasing [PRIMARY]
  GIVEN: one key driven through 2 complete durable-effect lifecycles on real Postgres
  WHEN:  holo queue:audit inspects each lifecycle
  THEN:  outbox, effect and inbox tokens are identical per lifecycle and T2 > T1

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  postgres
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-fence-monotonic.test.ts
  TEST_FUNCTION: oneKeyCarriesOneMonotonicToken

  SCENARIO:
    START_REF:        single_key_two_lifecycles
    NEGATIVE_CONTROL: would fail if stub token allocator | empty effects table | mock postgres | static token | disconnect from postgres
    EVIDENCE:         stdout
    CASES:
      - ACTION:           assert 0 effect rows, drive lifecycle 1 and capture queue:audit, reset, drive lifecycle 2 and capture again, compare tokens
        MUST_OBSERVE:     lifecycle 1 outbox.fenceToken == effect.fenceToken == inbox.fenceToken (non-null) · same for lifecycle 2 · T2 strictly greater than T1 (e.g. 1 then 2) · exactly 1 queue_effects row per lifecycle
        MUST_NOT_OBSERVE: 3 distinct token values inside a single lifecycle · a token matching ^fence-[0-9a-f-]{36}$ · (0 rows) from queue_effects

AC-2: A superseded holder is rejected
  GIVEN: a key whose persisted token advanced to T2 while consumer A holds T1
  WHEN:  consumer A applies the effect presenting T1
  THEN:  STALE_FENCE_TOKEN naming both tokens; queue_effects still holds 1 row carrying T2

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  postgres
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-fence-monotonic.test.ts
  TEST_FUNCTION: staleHolderIsRefused

AC-3: A real SIGKILL at every boundary yields exactly one effect
  GIVEN: a real spawned holo child emitting a boundary marker before pausing
  WHEN:  the harness SIGKILLs it at each of the 3 boundaries, then replays
  THEN:  every child exits on SIGKILL and replay leaves exactly 1 queue_effects row per key

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-fence-kill9.test.ts
  TEST_FUNCTION: realSigkillAtEveryBoundaryIsExactlyOnce

AC-4: The fake crash path cannot return
  GIVEN: the post-change durable-effect module and its callers
  WHEN:  the source is scanned and a crashAt call site is typechecked
  THEN:  crashAt and CRASH: are absent and the call fails pnpm tsgo --noEmit

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  typescript
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-fence-kill9.test.ts
  TEST_FUNCTION: crashInjectionCannotBeReintroduced

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/queue/durable-effect.ts (MODIFY)
- services/platform/src/queue/priority.ts (MODIFY)
- services/platform/src/queue/jobs-runner.ts (MODIFY)
- services/platform/src/cli/holo.ts (MODIFY)
- services/platform/tests/integration/sprint31-fence-monotonic.test.ts (NEW)
- services/platform/tests/integration/sprint31-fence-kill9.test.ts (NEW)
- services/platform/tests/integration/queue-exactly-once.test.ts (MODIFY)
- .tmp/S31-03/** (NEW)

writeProhibited:
- services/platform/tests/integration/mission-red.helpers.ts — the reference pattern being copied; it is load-bearing for the mission suite
- services/platform/tests/integration/mission-engine-red.test.ts — assertion style is copied, not modified; its exit-137 oracle guards a different capability
- services/platform/src/db/migrations/** — any token column goes through S31-01's migration discipline (R26)
- convex/** — decommission target
- Any file not explicitly listed above

--------------------------------------------------------------------------------
BOUNDARIES (✅ Always / ⚠️ Ask First) — Never tier lives at CRITICAL CONSTRAINTS above
--------------------------------------------------------------------------------

✅ Always:
- Allocate the token from a Postgres sequence or per-key counter row updated in the SAME transaction as the outbox insert, and have dispatchAndAck READ it rather than mint its own.
- Make the token type explicit and ordered (bigint sequence value or lexicographically-ordered string), documented at the type definition.
- Give the child a BLOCKING pause hook (await a signal or a file) so it is killable; a throw is not a crash.
- Write raw stdout/stderr and the parsed audit to .tmp/S31-03/ per crash case, mirroring mission-red.helpers.ts's writeArtifact discipline.

⚠️ Ask First:
- Unifying the lease token (priority.ts dequeue) with the effect token — decide and document what each guards before collapsing them.
- Adding a production-visible pause flag to the CLI surface.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- services/platform/src/queue/durable-effect.ts (MODIFY): monotonic allocation inside the transaction, the STALE_FENCE_TOKEN comparison, crashAt/CrashBoundary/DurableBoundary removed, auditEffect exposing all three tokens separately (line 303 currently collapses them and hides the divergence)
- services/platform/tests/integration/sprint31-fence-kill9.test.ts (NEW): real spawn + SIGKILL harness with boundary-marker proof
- services/platform/tests/integration/sprint31-fence-monotonic.test.ts (NEW): token identity + monotonicity + stale-holder refusal

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

TDD_MODE `red_first`. Start by REPRODUCING the live break: assert that `holo queue:audit effect-kill9-1` currently reports divergent tokens on the outbox and effect rows, and capture that as RED evidence before changing anything.

Then: allocation inside the transaction → the comparison site → delete crashAt → build the real SIGKILL harness by copying the mission-red pattern.

--------------------------------------------------------------------------------
READING LIST (max 5 files — canonical pattern first)
--------------------------------------------------------------------------------

1. services/platform/tests/integration/mission-red.helpers.ts [PRIMARY PATTERN]
   - Lines: 310-380
   - Focus: the complete in-repo real-crash harness to copy — spawn with piped stdio, stdout/stderr accumulation, an exit handler capturing status AND signal, artifact capture, and the returned kill/exited/result contract including wasKilled. Line 1 carries the node:child_process import.

2. services/platform/src/queue/durable-effect.ts
   - Lines: 110-251
   - Focus: beginEffect mints at 123 with the crash throw at 136-138; dispatchAndAck mints a SECOND independent token at 174 and writes it to queue_effects and queue_inbox, with its crash throw at 225-227. There is no comparison anywhere.

3. services/platform/tests/integration/mission-engine-red.test.ts
   - Lines: 1810-1830
   - Focus: how the assertions must read — a boundary-proof marker required BEFORE accepting the kill, signal toBe('SIGKILL'), wasKilled toBe(true), zero-row assertion for the crashed scope.

4. services/platform/src/queue/priority.ts
   - Lines: 84-135
   - Focus: dequeue() mints its own fence-${randomUUID()} lease token at line 86 — decide explicitly whether lease token and effect token are one sequence or two named concepts.

5. services/platform/src/db/migrations/0011_outbox_inbox.sql
   - Lines: 1-60
   - Focus: the declared outbox/effect/inbox shape the monotonic token column must be added to, via S31-01's forward-migration discipline.

--------------------------------------------------------------------------------
EVIDENCE GATES (fast/cheap first — fail fast)
--------------------------------------------------------------------------------

Gate 1: RED phase evidence
  Required: the live token-divergence reproduction captured under .tmp/S31-03/red/ before any fix.

Gate 2: Each AC has a test
  Verify: the 2 new test files contain one test per AC.

Gate 3: All tests pass
  Command: PLATFORM_IT=1 pnpm test:integration
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
  Verify: AC-1 (PRIMARY) is TEST_TIER integration against real Postgres.

Gate 8: Scenario is un-fakeable (PRIMARY)
  Verify: validate_scenario.py passes on the embedded contract (exit 0).
  Verify: every crash case captured a boundary marker AND signal 'SIGKILL'; a case with signal null is a FAIL.
  Reject: any surviving in-process crash path.

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- The token type is explicit and ordered (bigint sequence value or lexicographically-ordered string), never an opaque UUID; the ordering is documented at the type definition.
- STALE_FENCE_TOKEN is a typed error class carrying presentedToken and currentToken fields, not a message string.
- Crash-test helpers live in the test tree and import node:child_process directly; no production module gains a test-only parameter.
- Every crash case writes raw stdout/stderr and the parsed audit to .tmp/S31-03/, mirroring mission-red.helpers.ts's writeArtifact discipline.
- Reference: brain/docs/kanban/SCENARIO-CONTRACT-V1.md, brain/docs/TDD-METHODOLOGY.md

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Adding the token column via a migration authored here; coordinate with S31-01 (R26).
- Handler execution inside jobs-runner (S31-02) — this task changes the boundary those handlers cross, not the handlers.
- Mission-engine crash recovery; mission-red.helpers.ts is read as a pattern and left untouched.

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** Two independent random tokens per key, zero comparison sites, and crash tests that throw inside sql.begin with no child process and no signal.

**Gap:** UC-PLAT-03 AC-2 requires a kill-9 at every commit/dispatch boundary to produce one observable side effect; nothing in the repo proves that today.

--------------------------------------------------------------------------------
REVIEW (for mastra-reviewer)
--------------------------------------------------------------------------------

Must pass (<=5, evidence-gate-backed):
- One test per AC; every crash case asserts signal 'SIGKILL' after a captured boundary marker
- Token allocated inside the persisting transaction and READ by dispatchAndAck, never minted twice
- crashAt / CRASH: / CrashBoundary fully removed and unreintroducible (typecheck-enforced)
- Pattern consistent with READING LIST [PRIMARY PATTERN] (mission-red.helpers.ts spawn+kill contract)
- SCOPE respected (git diff --name-only ⊆ writeAllowed)

Should verify (<=5, judgment):
- STALE_FENCE_TOKEN is a typed error carrying presentedToken and currentToken
- auditEffect exposes all three tokens separately rather than collapsing them
- The pause hook blocks rather than throws
- No production module gained a test-only parameter

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: S31-01 (migration discipline for the token column)
Blocks:     (none)
Parallel:   S31-04, S31-06, S31-07

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable)
--------------------------------------------------------------------------------
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-03",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "single_key_two_lifecycles": {
      "description": "One idempotency key driven through 2 complete durable-effect lifecycles via the real CLI so token monotonicity across lifecycles is observable.",
      "seed_method": "cli",
      "records": [
        "a disposable migrated namespace with queue_outbox, queue_effects and queue_inbox holding 0 rows for key fence-mono-1",
        "lifecycle 1 driven by `holo queue:effect --key fence-mono-1 --json`",
        "the key reset via the real CLI and lifecycle 2 driven by the same command"
      ]
    },
    "stale_holder_race": {
      "description": "Two consumers for one key where the second has already advanced the persisted token, so the first is a genuinely superseded holder.",
      "seed_method": "cli",
      "records": [
        "a committed outbox intent for key fence-stale-1 carrying token T1 captured from the real allocation",
        "a second lifecycle for the same key that advances the persisted token to T2 greater than T1",
        "consumer A still holding T1 and about to call the effect application path"
      ]
    },
    "kill9_boundary_child": {
      "description": "A real spawned holo child process driving one durable-effect lifecycle for a scoped key, emitting a boundary marker before pausing at the requested boundary.",
      "seed_method": "cli",
      "records": [
        "a disposable migrated namespace with the scoped key absent from queue_outbox, queue_effects and queue_inbox",
        "a child process spawned as `bun services/platform/src/cli/holo.ts queue:effect --key <scoped> --pause-at <boundary>` with piped stdout and stderr",
        "the boundary marker observed on stdout, stderr or as a DB row BEFORE the kill signal is sent"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "maps_to_ac": null,
      "description": "GIVEN one key driven through 2 durable-effect lifecycles WHEN holo queue:audit inspects each THEN outbox, effect and inbox carry one identical token per lifecycle and the second lifecycle's token is strictly greater",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fence-monotonic.test.ts",
      "scenario": {
        "id": "S31-03-AC-1",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub token allocator",
            "empty effects table",
            "mock postgres",
            "static token",
            "disconnect from postgres"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "single_key_two_lifecycles",
            "action": {
              "actor": "operator",
              "steps": [
                "Assert `queue_effects` holds `0` rows for key `fence-mono-1` BEFORE lifecycle 1",
                "Drive lifecycle 1 through the real CLI and capture `holo queue:audit fence-mono-1 --json`",
                "Reset the key through the real CLI, drive lifecycle 2 and capture the audit again",
                "Compare the three token fields inside each audit and the two lifecycle tokens against each other"
              ]
            },
            "end_state": {
              "must_observe": [
                "lifecycle 1 audit: `outbox.fenceToken` == `effect.fenceToken` == `inbox.fenceToken`, all non-null",
                "lifecycle 2 audit: `outbox.fenceToken` == `effect.fenceToken` == `inbox.fenceToken`, all non-null",
                "the lifecycle 2 token is strictly greater than the lifecycle 1 token under the declared ordering, e.g. `1` then `2`",
                "each lifecycle leaves exactly `1` `queue_effects` row for the key"
              ],
              "must_not_observe": [
                "`3` distinct token values inside a single lifecycle",
                "a token matching `^fence-[0-9a-f-]{36}$`",
                "`(0 rows)` from `queue_effects` for the key"
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
      "description": "GIVEN a key whose persisted token advanced to T2 while consumer A holds T1 WHEN consumer A applies the effect THEN it is refused with STALE_FENCE_TOKEN and queue_effects still holds exactly 1 row carrying T2",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fence-monotonic.test.ts",
      "scenario": {
        "id": "S31-03-AC-2",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub comparison",
            "static allow verdict",
            "mock postgres",
            "removed guard"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "stale_holder_race",
            "action": {
              "actor": "system",
              "steps": [
                "Capture `T1` from the real allocation for consumer A",
                "Advance the persisted token to `T2` through a second real lifecycle",
                "Have consumer A call the effect-application path presenting `T1`",
                "Query `queue_effects` and `queue_inbox` for the key"
              ]
            },
            "end_state": {
              "must_observe": [
                "an error whose code is `STALE_FENCE_TOKEN`",
                "the error names both `T1` (presented) and `T2` (current)",
                "`queue_effects` holds exactly `1` row for the key",
                "that row's `fence_token` equals `T2`"
              ],
              "must_not_observe": [
                "`2` `queue_effects` rows for the key",
                "a `queue_inbox` row attributable to the refused attempt",
                "a silent no-op return with `0` errors raised"
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
      "description": "GIVEN a real spawned child driving one lifecycle WHEN the harness SIGKILLs it at each of the 3 boundaries after a boundary marker THEN every child exits on SIGKILL and replay leaves exactly 1 queue_effects row per key",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fence-kill9.test.ts",
      "scenario": {
        "id": "S31-03-AC-3",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub crash injection",
            "mock child process",
            "static replay result",
            "empty effects table",
            "disconnect from postgres"
          ]
        },
        "evidence": {
          "artifact_type": "event_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "kill9_boundary_child",
            "action": {
              "actor": "harness",
              "steps": [
                "For boundary `before-commit`: spawn the child, poll stdout, stderr and the DB until the boundary marker appears, then call `child.kill('SIGKILL')`",
                "Await the child's exit and record `status` and `signal`",
                "Query `queue_outbox`, `queue_effects` and `queue_inbox` for the scoped key immediately after the kill",
                "Replay the lifecycle through the real CLI to completion and capture `holo queue:audit <key> --json`",
                "Repeat every step for `after-commit-before-dispatch` and `after-dispatch-before-ack` with distinct scoped keys"
              ]
            },
            "end_state": {
              "must_observe": [
                "for all `3` boundaries the exit `signal` is `SIGKILL` and `wasKilled` is `true`",
                "for all `3` boundaries a captured boundary marker names the requested boundary and is timestamped before the kill",
                "after the `before-commit` kill, `queue_effects` and `queue_outbox` each hold `0` rows for the key",
                "after replay at every boundary `queue_effects` holds exactly `1` row for the key",
                "after replay at every boundary `outbox.fenceToken` == `effect.fenceToken` == `inbox.fenceToken`"
              ],
              "must_not_observe": [
                "an exit `signal` of `null` on any boundary case",
                "a passing boundary case with `0` captured markers",
                "`2` or more `queue_effects` rows for any key after replay",
                "the string `CRASH:` in the captured child output"
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
      "description": "GIVEN the post-change durable-effect module WHEN the source is scanned and a crashAt call site is typechecked THEN crashAt and CRASH: are absent and the call fails typecheck",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fence-kill9.test.ts",
      "scenario": {
        "id": "S31-03-AC-4",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "typescript",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static grep pass",
            "stub typecheck",
            "removed guard",
            "empty scan result"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "kill9_boundary_child",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Scan services/platform/src/queue/durable-effect.ts for `crashAt` and `CRASH:`",
                "Scan the whole services/platform/src tree for remaining `crashAt` call sites",
                "Write a temporary probe module calling `beginEffect` with a `crashAt` argument and run `pnpm tsgo --noEmit`",
                "Delete the probe module"
              ]
            },
            "end_state": {
              "must_observe": [
                "`0` occurrences of `crashAt` in services/platform/src/queue/durable-effect.ts",
                "`0` occurrences of `CRASH:` in services/platform/src/queue/durable-effect.ts",
                "`0` occurrences of `crashAt` anywhere under services/platform/src",
                "`pnpm tsgo --noEmit` exits with a code other than `0` while the probe module is present, naming the unknown `crashAt` property"
              ],
              "must_not_observe": [
                "a surviving `CrashBoundary` union containing `before-commit`",
                "`pnpm tsgo --noEmit` exiting `0` with the probe module present"
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
      "description": "Inside one durable-effect lifecycle, queue:audit reports outbox.fenceToken, effect.fenceToken and inbox.fenceToken as three equal non-null values.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fence-monotonic.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "A second lifecycle for the same key reports a token strictly greater than the first lifecycle token.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fence-monotonic.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "No token emitted by the durable-effect path matches the randomUUID fence pattern.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fence-monotonic.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "Applying an effect while presenting a token lower than the persisted token raises an error with code STALE_FENCE_TOKEN.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fence-monotonic.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "After a STALE_FENCE_TOKEN refusal, queue_effects holds exactly 1 row for the key carrying the current token.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fence-monotonic.test.ts"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "For each of the three boundaries the spawned child exit signal is SIGKILL.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fence-kill9.test.ts"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "For each of the three boundaries the spawned child wasKilled flag is true.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fence-kill9.test.ts"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "For each of the three boundaries a boundary marker naming the requested boundary is captured before the kill signal is sent.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fence-kill9.test.ts"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "After a before-commit SIGKILL, queue_outbox holds 0 rows for the scoped key.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fence-kill9.test.ts"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "After a before-commit SIGKILL, queue_effects holds 0 rows for the scoped key.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fence-kill9.test.ts"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "After replay following a SIGKILL at any boundary, queue_effects holds exactly 1 row for the scoped key.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fence-kill9.test.ts"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "services/platform/src/queue/durable-effect.ts contains 0 occurrences of crashAt.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fence-kill9.test.ts"
    },
    {
      "id": "TC-13",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "services/platform/src/queue/durable-effect.ts contains 0 occurrences of the literal CRASH:.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-fence-kill9.test.ts"
    },
    {
      "id": "TC-14",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "With a probe module passing crashAt to beginEffect present, pnpm tsgo --noEmit exits non-zero.",
      "verify": "pnpm tsgo --noEmit"
    }
  ]
}
-->

</details>
