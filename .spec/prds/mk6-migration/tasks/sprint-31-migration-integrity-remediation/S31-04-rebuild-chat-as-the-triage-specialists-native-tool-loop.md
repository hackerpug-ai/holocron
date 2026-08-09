# S31-04: Rebuild chat as the triage→specialists→native tool loop the PRD specifies

> **Task ID:** S31-04
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Type:** FEATURE · **Priority:** P0 · **Effort:** L · **Estimate:** 720 min
> **PROPOSED-BY:** `mastra-planner`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> **Status:** Backlog

**Capabilities:** CAP-CUT-01, CAP-INF-01
**PRD refs:** UC-SVC-03, UC-INFER-01, R13, R20

## What this does

Ports the 10 chat specialists and their per-specialist tool subsets out of `convex/` into the platform, replaces the 5-word regex router with the real triage, makes `steps_used` reflect the actual agent loop so the `maxSteps` bound is observable, and registers the single processor that makes UC-SVC-03's typed `blocked` outcome fire for real.

## Why

`http/chat-runs.ts:29` defines exactly 2 roles, `:31-33` picks between them with `/\b(review|refute|challenge|verify|audit)\b/i`, and `:35-43` grants one tool whose `execute` echoes `{role, maxSteps}`. `steps_used` is hardcoded to `1` in SQL at `:138`, and `rg "inputProcessors|outputProcessors" services/platform/src` returns 0 hits — so the real tripwire branch at `:317-318` is dead code and only a `[[tripwire]]` string literal at `:280` fires. The 10 real specialists exist only in `convex/chat/specialists.ts:38-48`, which Sprint 32 deletes (risk R20).

## How to verify

- Send a research-shaped chat message and confirm `chat_runs.role` names a specialist beyond `divergent`/`convergent`.
- `PLATFORM_IT=1 pnpm test:integration` passes, including the specialist-routing, tool-grant, tool-loop and blocked-outcome suites.
- `PLATFORM_IT=1 pnpm test:live` passes the Convex-revoked chat run with zero captured Convex requests.

## Scope

Touches the chat HTTP path, a new chat specialist module, the shared tool registry and one Mastra processor. Registering a full moderation/PII/injection stack is explicitly excluded by `01-scope.md` (added 2026-08-07).

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-04 - Rebuild chat as the triage->specialists->native tool loop
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
AGENT_RATIONALE: Mastra agent architecture — 10 specialist agents with per-specialist grants from the shared registry, a native in-SDK tool loop, and the processor surface that makes the typed blocked outcome real; mastra-implementer is the only agent holding the Mastra 1.x processor/tripwire surface together with chat run persistence.
PROPOSED-BY: mastra-planner

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: AC-1..AC-5 TDD_STATE none · 0/5 complete

--------------------------------------------------------------------------------
OUTCOME (1 sentence, <=30 words — observable success)
--------------------------------------------------------------------------------

A chat message routes to one of 10 real specialists with its own least-privilege tools, a real step count, and a typed blocked outcome.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- NEVER build a moderation/PII/prompt-injection guardrail stack beyond the SINGLE processor needed to make the typed blocked outcome fire — 01-scope.md (2026-08-07) defers it explicitly; registering more is out-of-scope work, not thoroughness.
- NEVER keep the [[tripwire]] magic-string branch alongside the real processor; two paths to blocked means the fake one keeps the test green.
- NEVER grant a specialist the union of all tools; least-privilege grants are UC-SVC-03 AC-4, not an optimization.
- NEVER prove the specialist from a source-level assertion that the map exists — prove it from persisted state (chat_runs.role and the run's recorded tool grants).
- NEVER leave a runtime import of convex/ in the chat path, and never mock the fleet, Postgres, or the SSE transport.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] 10 labelled messages route to their ported specialist with more than 2 distinct roles observed — maps to AC-1 (PRIMARY)
- [ ] The knowledge run is granted exactly 4 registry tools and the commerce run exactly 1 — maps to AC-2
- [ ] steps_used reflects the real loop and a max_steps 2 run terminates at 2 — maps to AC-3
- [ ] A registered processor abort yields blocked + CHAT_PROCESSOR_BLOCKED with 0 agent rows and 0 tool dispatches — maps to AC-4
- [ ] Chat completes with Convex credentials revoked and 0 Convex requests captured — maps to AC-5
- [ ] PLATFORM_IT=1 pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: A chat message routes to a real named specialist [PRIMARY]
  GIVEN: a listening server, a reachable fleet, and 10 labelled messages one per specialist
  WHEN:  each is sent via POST /api/chat-runs and polled to terminal
  THEN:  chat_runs.role holds the ported specialist name; more than 2 distinct roles appear

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  fleet
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-chat-specialists.test.ts
  TEST_FUNCTION: chatRoutesToRealSpecialists

  SCENARIO:
    START_REF:        ten_specialist_probe_set
    NEGATIVE_CONTROL: would fail if stub triage | empty specialist table | mock fleet | static role constant | disconnect from the fleet
    EVIDENCE:         db_query
    CASES:
      - ACTION:           confirm /health 200 and fleet /v1/models 200, POST all 10, poll to terminal, SELECT id/role/status/final_text
        MUST_OBSERVE:     10 chat_runs rows · at least 8 roles match their label · COUNT(DISTINCT role) > 2 · at least 1 role outside {divergent, convergent} · every terminal row has non-empty final_text
        MUST_NOT_OBSERVE: all 10 rows in {divergent, convergent} · (0 rows) from chat_runs · a role outside the 10 ported names

AC-2: Each specialist gets exactly its least-privilege tool subset
  GIVEN: runs routed to the knowledge and commerce specialists on a real fleet
  WHEN:  the persisted tool-grant record for each run is read
  THEN:  knowledge has exactly 4 declared tools, commerce exactly 1, all registry-resolvable

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  postgres
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-chat-tool-grants.test.ts
  TEST_FUNCTION: specialistToolGrantsAreLeastPrivilege

AC-3: steps_used reflects the real loop and maxSteps terminates
  GIVEN: a message needing 2 tool calls, and a separate run bounded at max_steps 2
  WHEN:  both are driven to terminal through the real HTTP surface
  THEN:  steps_used >= 2 on the first; the bounded run stops at steps_used == max_steps

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  fleet
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-chat-tool-loop.test.ts
  TEST_FUNCTION: stepsUsedReflectsTheRealLoop

AC-4: A real processor abort produces the typed blocked outcome
  GIVEN: a message tripping the registered processor, with the [[tripwire]] literal deleted
  WHEN:  the run reaches terminal
  THEN:  blocked + CHAT_PROCESSOR_BLOCKED, 0 agent messages, 0 tool dispatches, agent_busy cleared

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  fleet
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-chat-blocked.test.ts
  TEST_FUNCTION: processorAbortProducesTypedBlocked

AC-5: Chat resolves with Convex unreachable
  GIVEN: Convex credentials revoked and any Convex host pointed at a closed port
  WHEN:  a chat message is driven to terminal
  THEN:  the run completes with a specialist role and 0 Convex requests are captured

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  fleet
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-chat-no-convex.test.ts
  TEST_FUNCTION: chatSurvivesConvexRevocation

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/http/chat-runs.ts (MODIFY)
- services/platform/src/chat/** (NEW)
- services/platform/src/mastra/tripwire.ts (MODIFY)
- services/platform/src/mastra/processors/** (NEW)
- services/platform/src/tools/registry.ts (MODIFY)
- services/platform/src/compat/cells/agent.ts (MODIFY)
- services/platform/tests/integration/sprint31-chat-specialists.test.ts (NEW)
- services/platform/tests/integration/sprint31-chat-tool-grants.test.ts (NEW)
- services/platform/tests/integration/sprint31-chat-tool-loop.test.ts (NEW)
- services/platform/tests/integration/sprint31-chat-blocked.test.ts (NEW)
- services/platform/tests/integration/sprint31-chat-no-convex.test.ts (NEW)
- .tmp/S31-04/** (NEW)

writeProhibited:
- convex/** — read-only source material for the specialist port; writing there re-creates R20 and Sprint 32 deletes it
- services/platform/src/db/migrations/** — any chat schema change (e.g. the tool-grant column) goes through S31-01
- apps/** — client chat surfaces are S31-FE-01/02; 01-scope.md excludes error-state UX redesign
- .spec/prds/mk6-migration/** — the PRD is the spec of record
- Any file not explicitly listed above

--------------------------------------------------------------------------------
BOUNDARIES (✅ Always / ⚠️ Ask First) — Never tier lives at CRITICAL CONSTRAINTS above
--------------------------------------------------------------------------------

✅ Always:
- Keep specialist definitions as one typed table (name, role binding, tool id list, system prompt) validated against the registry at module load.
- Resolve every tool grant through registry.getTool; an inline createTool in the chat path bypasses the shared Zod registry (UC-PLAT-02).
- Persist the tool-grant record per run, so AC-2 reads state rather than re-deriving it at assertion time.
- Name a role, never a provider (UC-INFER-01 AC-2); keep holo verify:no-provider-refs green.

⚠️ Ask First:
- Registering any processor beyond the single one AC-4 needs.
- Changing the SSE event shape or chat_run_events schema that the RN client already consumes.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- services/platform/src/chat/specialists.ts (NEW): the 10 ported specialists with role bindings and tool id lists (blocker — the HTTP path and tests import it)
- services/platform/src/chat/triage.ts (NEW): the ported intent→specialist map replacing the 5-word regex
- services/platform/src/http/chat-runs.ts (MODIFY): real triage, real tool grants, real steps_used, [[tripwire]] branch deleted
- services/platform/src/mastra/processors/** (NEW): the single registered chat processor whose abort reaches the persisted blocked event
- 5 integration/e2e test files (NEW)

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

TDD_MODE `red_first`. Depends on S31-05 delivering an executable tool registry — least-privilege grants are meaningless if the granted tools are not executable, so sequence AC-2 after that lands.

Triage runs on the fast divergent role and returns a specialist name; each specialist is a separately-constructed Mastra agent bound to its own role via createFleetAgentWithResolved. Do not collapse triage and specialist into one agent — UC-SVC-03 AC-4 requires the routing to be observable.

--------------------------------------------------------------------------------
READING LIST (max 5 files — canonical pattern first)
--------------------------------------------------------------------------------

1. convex/chat/specialists.ts [PRIMARY PATTERN]
   - Lines: 20-60
   - Focus: the SpecialistConfig shape to port — name, model, tools, systemPrompt — plus the 10 SpecialistName values and the intent map. This is the structure the new platform module should imitate. Port before Sprint 32 deletes it (R20).

2. convex/chat/tools.ts
   - Lines: 495-559
   - Focus: the 9 genuine per-specialist tool subsets; knowledgeTools has exactly 4 members and commerceTools exactly 1. These are the least-privilege grants AC-2 asserts.

3. services/platform/src/http/chat-runs.ts
   - Lines: 29-43, 134-141, 274-330
   - Focus: the whole defect — 2-value role type, the 5-word regex, the echo tool; the hardcoded steps_used at 138; and the [[tripwire]] branch at 280-290 versus the dead TripwireError branch at 317-318.

4. services/platform/src/tools/registry.ts
   - Lines: 381-430
   - Focus: getTool, getSchemaForAgent and listTools — the shared registry the ported grants must resolve through so agents, workflows and MCP share one schema set.

5. services/platform/src/compat/cells/agent.ts
   - Lines: 93-140
   - Focus: createFleetAgentWithResolved — binding a specialist to a fleet role without naming a provider.

--------------------------------------------------------------------------------
EVIDENCE GATES (fast/cheap first — fail fast)
--------------------------------------------------------------------------------

Gate 1: RED phase evidence
  Required: TDD_STATE history shows each test went red before green.

Gate 2: Each AC has a test
  Verify: the 5 test files contain one test per AC.

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
  Verify: AC-1 (PRIMARY) is TEST_TIER integration against the real fleet; AC-5 is e2e.

Gate 8: Scenario is un-fakeable (PRIMARY)
  Verify: validate_scenario.py passes on the embedded contract (exit 0).
  Verify: the captured artifact shows more than 2 distinct persisted roles — not merely "tests passed".
  Reject: a PRIMARY test satisfied while every row still carries divergent or convergent.

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- Specialist definitions live in one typed table (name, role binding, tool id list, system prompt) validated against the registry at module load.
- Every tool grant is a registry id resolved through getTool; an inline createTool in the chat path bypasses the shared Zod registry required by UC-PLAT-02 and is a review failure.
- Processors are Mastra 1.x Processor implementations with an explicit id on the agent's inputProcessors array; abort() carries a reason and processorId that reach the persisted blocked event.
- Model bindings name a role, never a provider (UC-INFER-01 AC-2); holo verify:no-provider-refs must stay green.
- Reference: brain/docs/mastra/agents-core.md, brain/docs/mastra/processors-guardrails.md

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Prompt-injection detection, moderation, PII redaction, cost ceilings and system-prompt scrubbing — deferred by 01-scope.md (2026-08-07); only the one processor AC-4 needs is in scope.
- Client-side chat surfaces, banners and error-state UX (S31-FE-01/02).
- Making the 44 MCP tools executable (S31-05) — this task consumes that registry.
- Per-specialist eval datasets and quality baselines (R13).

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** 2 roles chosen by a 5-word regex, one placeholder tool that echoes its arguments, steps_used hardcoded to 1, and a [[tripwire]] string literal standing in for a processor abort.

**Gap:** The PRD's triage→10 specialists→native tool loop does not exist on the platform, and the only real implementation is in convex/, which Sprint 32 deletes.

--------------------------------------------------------------------------------
REVIEW (for mastra-reviewer)
--------------------------------------------------------------------------------

Must pass (<=5, evidence-gate-backed):
- One test per AC; the specialist is proven from persisted state, not from source
- Exactly one processor registered; the [[tripwire]] literal is gone
- Tool grants resolve through the shared registry with no inline createTool in the chat path
- Pattern consistent with READING LIST [PRIMARY PATTERN] (convex SpecialistConfig shape)
- SCOPE respected (git diff --name-only ⊆ writeAllowed)

Should verify (<=5, judgment):
- steps_used is written from the loop, not from a CASE expression
- Model bindings name roles, never providers (verify:no-provider-refs green)
- The blocked path persists no assistant message and dispatches no tool
- No runtime convex/ import survives in the chat module graph

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: S31-05 (executable 44-tool registry)
Blocks:     (none)
Parallel:   S31-01, S31-02, S31-03

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable)
--------------------------------------------------------------------------------
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-04",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "ten_specialist_probe_set": {
      "description": "10 labelled chat messages, one per ported specialist, each carrying an intent the ported triage maps unambiguously.",
      "seed_method": "public_api",
      "records": [
        "a listening serving process answering GET /health with 200 and a reachable fleet at http://127.0.0.1:4545",
        "10 POST /api/chat-runs requests, each with a distinct requestId and a message labelled with its expected specialist name (knowledge, research, podcast, commerce, subscriptions, discovery, documents, analysis, improvements, planner)",
        "each request creates exactly 1 chat_runs row"
      ]
    },
    "two_tool_call_message": {
      "description": "A single chat message that genuinely requires at least 2 sequential tool calls to answer.",
      "seed_method": "public_api",
      "records": [
        "a listening serving process and a reachable fleet at http://127.0.0.1:4545",
        "1 real document row created through POST /api/documents that the knowledge specialist must search for and then read",
        "1 POST /api/chat-runs whose message requires search_knowledge_base followed by get_document"
      ]
    },
    "processor_tripping_message": {
      "description": "A chat message that trips the registered chat processor through its real detection path.",
      "seed_method": "public_api",
      "records": [
        "a listening serving process and a reachable fleet at http://127.0.0.1:4545",
        "1 POST /api/chat-runs carrying content the registered processor aborts on",
        "chat_messages holds exactly 1 user row and 0 agent rows for the conversation at the moment of the abort"
      ]
    },
    "maxsteps_bounded_run": {
      "description": "A chat run created with max_steps 2 against a task the specialist cannot finish inside that bound.",
      "seed_method": "public_api",
      "records": [
        "a listening serving process and a reachable fleet at http://127.0.0.1:4545",
        "1 chat_runs row with max_steps = 2 and a message requiring more than 2 tool calls"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "maps_to_ac": null,
      "description": "GIVEN 10 labelled chat messages and a reachable fleet WHEN each is sent via POST /api/chat-runs THEN chat_runs.role records a ported specialist name and more than 2 distinct roles are observed",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-chat-specialists.test.ts",
      "scenario": {
        "id": "S31-04-AC-1",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub triage",
            "empty specialist table",
            "mock fleet",
            "static role constant",
            "disconnect from the fleet"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "ten_specialist_probe_set",
            "action": {
              "actor": "user",
              "steps": [
                "Confirm `GET /health` returns `200` and the fleet `GET /v1/models` probe returns `200` BEFORE posting",
                "`POST /api/chat-runs` for all `10` labelled messages",
                "Poll each run to a terminal status inside its deadline",
                "`SELECT id, role, status, final_text FROM chat_runs` for the `10` request ids"
              ]
            },
            "end_state": {
              "must_observe": [
                "`10` `chat_runs` rows returned",
                "at least `8` rows whose `role` equals the message's labelled specialist name",
                "`COUNT(DISTINCT role)` across the `10` rows is greater than `2`",
                "at least `1` row whose `role` is outside the set `divergent`, `convergent`",
                "every terminal row has a `final_text` of length greater than `0`"
              ],
              "must_not_observe": [
                "all `10` rows carrying `role` in the set `divergent`, `convergent`",
                "`(0 rows)` from `chat_runs` for the request ids",
                "a `role` value outside the `10` ported specialist names"
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
      "description": "GIVEN runs routed to the knowledge and commerce specialists WHEN the persisted tool-grant record is read THEN each grant set equals exactly its declared subset and every id resolves through the shared registry",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-chat-tool-grants.test.ts",
      "scenario": {
        "id": "S31-04-AC-2",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub grant record",
            "empty registry",
            "static full tool list",
            "mock postgres"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "ten_specialist_probe_set",
            "action": {
              "actor": "system",
              "steps": [
                "Send the knowledge-labelled message and the commerce-labelled message via `POST /api/chat-runs`",
                "Read the persisted tool-grant record for each run from the database",
                "Resolve each granted tool id through `registry.getTool` and record whether it resolves"
              ]
            },
            "end_state": {
              "must_observe": [
                "the knowledge run's grant set has exactly `4` members: `search_knowledge_base`, `browse_category`, `knowledge_base_stats`, `get_document`",
                "the commerce run's grant set has exactly `1` member: `shop_search`",
                "every granted id resolves through `registry.getTool` with `0` throws"
              ],
              "must_not_observe": [
                "a grant set containing `chat_context`",
                "the commerce run granted any knowledge tool",
                "`(0 rows)` from the tool-grant record for either run"
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
      "description": "GIVEN a message needing 2 tool calls and a run bounded at max_steps 2 WHEN both are driven to terminal THEN steps_used reflects the real loop and the bounded run stops at its max_steps",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-chat-tool-loop.test.ts",
      "scenario": {
        "id": "S31-04-AC-3",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static steps_used constant",
            "stub tool loop",
            "mock fleet",
            "empty event log"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "two_tool_call_message",
            "action": {
              "actor": "user",
              "steps": [
                "Seed `1` real document row through `POST /api/documents` and confirm it is readable",
                "`POST /api/chat-runs` with the two-tool message and poll to terminal",
                "`SELECT steps_used, max_steps, status, final_text FROM chat_runs` for the run",
                "Count tool-call events in `chat_run_events` for the run"
              ]
            },
            "end_state": {
              "must_observe": [
                "`steps_used` is at least `2`",
                "`chat_run_events` holds at least `2` tool-call events for the run",
                "`status` is `completed` with a `final_text` of length greater than `0`",
                "the seeded document's title appears verbatim inside `final_text`"
              ],
              "must_not_observe": [
                "`steps_used` of `1` while `2` or more tool-call events exist",
                "`(0 rows)` from `chat_run_events` for the run"
              ]
            }
          },
          {
            "start_ref": "maxsteps_bounded_run",
            "action": {
              "actor": "user",
              "steps": [
                "Create a run with `max_steps` `2` against a task needing more than `2` tool calls",
                "Poll to terminal and read `steps_used`, `max_steps` and the terminal event payload"
              ]
            },
            "end_state": {
              "must_observe": [
                "`steps_used` equals `2`",
                "`steps_used` == `max_steps`",
                "the terminal event payload names `max_steps` `2` as the stop reason"
              ],
              "must_not_observe": [
                "`steps_used` greater than `max_steps`",
                "`steps_used` of `1`",
                "`0` terminal events for the run inside its deadline"
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
      "description": "GIVEN a message that trips the registered processor and the tripwire literal deleted WHEN the run reaches terminal THEN status is blocked with CHAT_PROCESSOR_BLOCKED, 0 agent messages and 0 tool dispatches",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-chat-blocked.test.ts",
      "scenario": {
        "id": "S31-04-AC-4",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub processor",
            "static blocked literal",
            "mock fleet",
            "removed guard",
            "disconnect from the fleet"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "processor_tripping_message",
            "action": {
              "actor": "user",
              "steps": [
                "Scan services/platform/src/http/chat-runs.ts for the literal `[[tripwire]]` and record the count",
                "Scan services/platform/src for `inputProcessors` and `outputProcessors` and record the hit count",
                "`POST /api/chat-runs` with the processor-tripping message and poll to terminal",
                "Query `chat_runs`, `chat_messages`, `chat_run_events` and `conversations` for the run"
              ]
            },
            "end_state": {
              "must_observe": [
                "`0` occurrences of `[[tripwire]]` in services/platform/src/http/chat-runs.ts",
                "at least `1` non-test hit for `inputProcessors` under services/platform/src",
                "`chat_runs.status` is `blocked` with `error_code` `CHAT_PROCESSOR_BLOCKED`",
                "the blocked event payload carries a `processorId` naming the registered processor",
                "`0` `chat_messages` rows with `role='agent'` for the conversation",
                "`0` tool-call events in `chat_run_events` for the run",
                "the conversation has `agent_busy` = `false`"
              ],
              "must_not_observe": [
                "`status` of `completed` for the tripping message",
                "an `agent` `chat_messages` row for the conversation",
                "`1` or more tool dispatches recorded for the run",
                "`(0)` terminal events recorded for the run inside its deadline"
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
      "maps_to_ac": null,
      "description": "GIVEN Convex credentials revoked and Convex hosts unreachable WHEN a chat message is driven to terminal THEN the run completes with a specialist role and 0 Convex requests are captured",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-chat-no-convex.test.ts",
      "scenario": {
        "id": "S31-04-AC-5",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub chat path",
            "mock fleet",
            "static reply",
            "empty chat_runs table",
            "disconnect from the fleet"
          ]
        },
        "evidence": {
          "artifact_type": "event_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "ten_specialist_probe_set",
            "action": {
              "actor": "operator",
              "steps": [
                "Unset every Convex credential in the serving process environment and point any Convex host at a closed port",
                "Confirm `GET /health` returns `200` and the fleet probe returns `200`",
                "`POST /api/chat-runs` with one specialist-routed message and poll to terminal",
                "Inspect the captured network log for requests to any `.convex.cloud` or `.convex.site` host",
                "Scan the chat-path module graph for runtime imports from `convex/`"
              ]
            },
            "end_state": {
              "must_observe": [
                "`chat_runs.status` is `completed` with a `final_text` of length greater than `0`",
                "`chat_runs.role` is a specialist name outside the set `divergent`, `convergent`",
                "`0` captured outbound requests to any `.convex.cloud` or `.convex.site` host",
                "`0` runtime imports from `convex/` in the chat-path module graph"
              ],
              "must_not_observe": [
                "a run failing with a Convex connection error",
                "`1` or more requests to a `.convex.cloud` or `.convex.site` host",
                "`(0 rows)` from `chat_runs` for the request id"
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
      "description": "Across 10 labelled messages, at least 8 chat_runs.role values equal their message labelled specialist.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-chat-specialists.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "COUNT(DISTINCT role) across the 10 runs is greater than 2.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-chat-specialists.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "At least one chat_runs.role value is outside the set divergent, convergent.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-chat-specialists.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "The knowledge run persisted tool-grant set has exactly 4 members equal to search_knowledge_base, browse_category, knowledge_base_stats, get_document.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-chat-tool-grants.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "The commerce run persisted tool-grant set has exactly 1 member equal to shop_search.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-chat-tool-grants.test.ts"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "No persisted tool-grant set contains the id chat_context.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-chat-tool-grants.test.ts"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "A run whose chat_run_events hold 2 or more tool-call events records steps_used of at least 2.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-chat-tool-loop.test.ts"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "A run created with max_steps 2 against a task needing more terminates with steps_used equal to 2.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-chat-tool-loop.test.ts"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "No chat_runs row records steps_used greater than its max_steps.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-chat-tool-loop.test.ts"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "services/platform/src/http/chat-runs.ts contains 0 occurrences of the literal double-bracket tripwire token.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-chat-blocked.test.ts"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "A grep for inputProcessors under services/platform/src returns at least 1 non-test hit.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-chat-blocked.test.ts"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "A processor-tripping message yields chat_runs.status blocked with error_code CHAT_PROCESSOR_BLOCKED.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-chat-blocked.test.ts"
    },
    {
      "id": "TC-13",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "A processor-tripping message leaves 0 chat_messages rows with role agent for the conversation.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-chat-blocked.test.ts"
    },
    {
      "id": "TC-14",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "A processor-tripping message produces 0 tool-call events in chat_run_events.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-chat-blocked.test.ts"
    },
    {
      "id": "TC-15",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "With Convex credentials revoked and Convex hosts unreachable, a chat run reaches status completed with a specialist role.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-chat-no-convex.test.ts"
    },
    {
      "id": "TC-16",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "With Convex credentials revoked, the completed chat run final_text length is greater than 0.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-chat-no-convex.test.ts"
    },
    {
      "id": "TC-17",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "The captured network log for a chat run contains 0 requests to any convex.cloud or convex.site host.",
      "verify": "PLATFORM_IT=1 pnpm test:live services/platform/tests/integration/sprint31-chat-no-convex.test.ts"
    }
  ]
}
-->

</details>
