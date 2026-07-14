# compat-1 — Real-Bun compatibility spike harness (agent+tool+workflow+MCP+OTel vs real Postgres)

## What this does
Bootstraps the greenfield `holo` operator CLI and a minimal Mastra/Bun service, and proves one exact `Bun + @mastra/core + @mastra/pg + @mastra/mcp + ai + Zod` set boots a **green five-cell smoke matrix** (agent, tool, workflow, MCP transport, OTel trace) against **real Postgres** and a **live fleet** — and fails closed when Postgres is stopped.

## Why
This is the leading INFRA lock (`11-runtime-contracts.md` § Mastra compatibility lock, T-PLAT-005). No feature sprint may start until this exact combination is proven bootable on real Bun against real Postgres — "Mastra 1.x" as a range is not an acceptance contract.

## How to verify
Run `COMPAT_SPIKE=1 pnpm vitest run tests/integration/compat-spike.test.ts` against real Postgres + a started fleet → exit 0, 5/5 cells green + resolved version table. Then `DATABASE_URL=postgres://127.0.0.1:1/dead bun services/platform/src/cli/holo.ts compat:spike` → non-zero exit, storage cells red.

## Scope
Creates `services/platform/**` (CLI + Mastra scaffold + spike cells) and `tests/integration/compat-spike.test.ts`. Does NOT touch `convex/**`, `app/**`, or the durable queue (UC-PLAT-03, later sprint).

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: compat-1 — Real-Bun compatibility spike harness (agent+tool+workflow+MCP+OTel vs real Postgres)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (300 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes
SPRINT:     [Sprint 1 — Mastra Compatibility Lock and Fleet Role Manifest](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      pnpm test        (vitest; single file: pnpm vitest run <path>)
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
`bun services/platform/src/cli/holo.ts compat:spike` exits 0 against real Postgres + a started fleet with 5/5 cells green, the resolved pinned version set, otelSpans≥1 and cloudRequests===0 — and exits non-zero with storage cells red when DATABASE_URL points at a dead Postgres.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST boot under REAL Bun (assert `Bun.version`); every one of the five cells exercises a REAL dependency; CLI exits 0 iff 5/5 green.
- MUST persist the workflow + OTel cells to REAL Postgres via `@mastra/pg` PostgresStore; OTel via `new Observability({ configs:{ default:{ exporters:[ new MastraStorageExporter() ] } } })`.
- MUST resolve the agent cell to a LIVE fleet model via `@ai-sdk/openai-compatible` (LiteLLM `:4545`, `implementer`/`reviewer`).
- NEVER fake a green cell / canned result / in-memory (LibSQL) fallback when Postgres is unreachable.
- NEVER use a cloud router-string model or `@ai-sdk/anthropic` for the agent cell; NEVER use `telemetry:{}` (silently ignored in 1.x); NEVER `z.any()`.
- STRICTLY: Mastra 1.x subpath imports only (root `@mastra/core` exports only `Mastra`); tool `execute(inputData, context)` validated against a real `outputSchema`; workflow ends in `.commit()`, run via `createRun()`, narrow on `result.status`.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): green 5/5 smoke matrix under Bun vs real Postgres + live fleet, prints pinned versions
- [ ] AC-2: OTel span persisted to Postgres (otelSpans≥1) via MastraStorageExporter
- [ ] AC-3: workflow reaches success on `@mastra/pg` and MCP transport round-trips a tool
- [ ] AC-4: Postgres-down ⇒ spike exits non-zero, storage cells red (primary negative control)
- [ ] AC-5: agent cell hits the live fleet with zero cloud requests
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean; only SCOPE.writeAllowed files modified

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED against the absent stack first)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Green five-cell smoke matrix under real Bun against real Postgres + live fleet
  GIVEN pinned set installed (pinned_set), real Postgres up (real_pg), fleet started (live_fleet)
  WHEN  `bun services/platform/src/cli/holo.ts compat:spike --json` runs under Bun
  THEN  exit 0, cells all green (agent, tool, workflow, MCP, OTel) + live-resolved version table
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra · TDD_STATE: none
  SCENARIO — start_ref: pinned_set+real_pg+live_fleet · evidence: stdout
    NEGATIVE_CONTROL: would fail if Postgres stopped / fleet down / a cell stubbed / run under node not bun
    MUST_OBSERVE: exit 0, JSON cells={agent,tool,workflow,mcp,otel all green} (5/5), runtime.bun === Bun.version
    MUST_NOT_OBSERVE: any cell red/absent, exit ≠ 0, missing runtime.bun, a "boots correctly" string with no per-cell result

AC-2 OTel trace cell persists a real span to Postgres
  GIVEN Observability wired to MastraStorageExporter over @mastra/pg (real_pg)
  WHEN  the spike runs one agent/workflow call then queries the trace store for the run's traceId
  THEN  ≥1 span row exists for that traceId; CLI reports otelSpans≥1
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres
  MUST_OBSERVE: db_query returns otelSpans ≥ 1 for the emitted traceId · MUST_NOT_OBSERVE: otelSpans===0, no trace table, a hard-coded count

AC-3 Workflow reaches success on real Postgres and MCP transport round-trips a tool
  GIVEN locked set installed, Postgres up (real_pg)
  WHEN  a 2-step `.then` workflow (committed, createRun/start, @mastra/pg snapshot) runs and a @mastra/mcp server+client lists+calls one tool over a real transport
  THEN  workflow result.status==='success' with typed output; MCP client receives validated tool output
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra
  MUST_OBSERVE: workflow.status='success' with typed output AND mcp.tools≥1 with the called tool returning its validated payload

AC-4 Fail closed when Postgres is unreachable (PRIMARY NEGATIVE CONTROL)
  GIVEN locked set installed, DATABASE_URL at a dead Postgres (pg_down)
  WHEN  `holo compat:spike` runs
  THEN  exits non-zero, storage cells (workflow, OTel) red — no cell falsely green
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres
  MUST_OBSERVE: exit ≠ 0, cells.workflow='red', cells.otel='red' · MUST_NOT_OBSERVE: exit 0, any storage cell green, a fallback-storage message

AC-5 Agent cell hits the live fleet with zero cloud calls
  GIVEN fleet started (live_fleet), Postgres up
  WHEN  the agent cell calls a live fleet model via @ai-sdk/openai-compatible and a network assertion counts outbound provider requests
  THEN  agent returns non-empty text; cloudRequests===0
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet
  MUST_OBSERVE: agent.text non-empty, cloudRequests===0, ≥1 request to http://127.0.0.1:4545/v1 · MUST_NOT_OBSERVE: any api.anthropic.com/api.openai.com request

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/package.json (NEW), services/platform/tsconfig.json (NEW)
- services/platform/src/mastra.ts (NEW), services/platform/src/cli/holo.ts (NEW)
- services/platform/src/compat/spike.ts (NEW), services/platform/src/compat/cells/*.ts (NEW)
- tests/integration/compat-spike.test.ts (NEW), tsconfig.json (MODIFY: exclude services/platform)
writeProhibited: convex/**, app/**, components/**, holocron-mcp/** (read-only), any existing *.test.ts, services/platform/fleet/** (compat-3), services/platform/compat/compatibility-record.json (compat-2)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md:11-16 [PRIMARY PATTERN] — compat lock, spike-green definition
2. holocron-mcp/src/mastra/stdio.ts:1-80 — existing @mastra/mcp stdio transport to mirror in the MCP cell
3. /Users/justinrich/models/RULES.md:15-75 — LiteLLM :4545 model ids (implementer/reviewer), fleet-start, no auth
4. tests/integration/research-models.test.ts:1-44 — repo integration/env-gated live-call pattern (do NOT skip negative controls)
5. .spec/prds/mk6-migration/10-technical-requirements/06-external-dependencies.md:9-25 — exact dep families to boot

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- five-cell spike green vs real Postgres + fleet: `COMPAT_SPIKE=1 pnpm vitest run tests/integration/compat-spike.test.ts` → Exit 0
- raw CLI green under Bun: `bun services/platform/src/cli/holo.ts compat:spike` → 5/5 cells green + version table
- PG-down negative control fails closed: `DATABASE_URL=postgres://127.0.0.1:1/dead bun services/platform/src/cli/holo.ts compat:spike; test $? -ne 0` → Exit 0
- root typecheck `pnpm tsgo --noEmit` → Exit 0 · lint `pnpm biome check .` → Exit 0
- Gate 8 (un-fakeable PRIMARY): AC-1 was watched RED against the empty/disconnected start (Postgres down) before green; captured stdout shows 5/5 green, not merely "Exit 0".

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: one test per AC; RED evidence present; no stubbed cell (grep the harness); real @mastra/pg + live fleet on the cells; SCOPE respected. Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: none · Blocks: compat-2, compat-3, compat-4, compat-5

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "compat-1",
  "tdd_mode": "red_first",
  "verification_policy": { "requires_tests": true, "requires_red_evidence": true, "requires_seeded_evidence": true },
  "fixtures": {
    "real_pg": { "description": "Real Postgres 18 + pgvector at $DATABASE_URL", "seed_method": "cli", "records": ["docker run pgvector/pgvector:pg18 or tailnet mini; psql \"$DATABASE_URL\" -c 'select 1' ok"] },
    "live_fleet": { "description": "LiteLLM :4545 with implementer+reviewer loaded", "seed_method": "cli", "records": ["fleet-start; curl :4545/v1/models lists implementer,reviewer"] },
    "pinned_set": { "description": "services/platform installed under Bun with candidate exact-pinned Mastra 1.x deps", "seed_method": "cli", "records": ["cd services/platform && bun install"] },
    "pg_down": { "description": "Postgres-absent negative control", "seed_method": "cli", "records": ["DATABASE_URL=postgres://127.0.0.1:1/dead"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "maps_to_ac": null,
      "description": "GIVEN pinned set + real Postgres + started fleet WHEN `holo compat:spike --json` runs under Bun THEN exit 0 with 5/5 cells green + version table",
      "verify": "COMPAT_SPIKE=1 pnpm vitest run tests/integration/compat-spike.test.ts",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "mastra",
        "negative_control": { "would_fail_if": ["Postgres stopped", "fleet down", "a cell stubbed to a canned result", "run under node not bun"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "real_pg", "action": { "actor": "cli_user", "steps": ["bun services/platform/src/cli/holo.ts compat:spike --json"] },
          "end_state": { "must_observe": ["exit 0", "cells {agent,tool,workflow,mcp,otel} all green (5/5)", "runtime.bun === Bun.version"], "must_not_observe": ["any cell red/absent", "exit != 0", "a 'boots correctly' string with no per-cell result"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN Observability→MastraStorageExporter over @mastra/pg WHEN the spike runs one call then queries the trace store THEN otelSpans>=1 for that traceId",
      "verify": "COMPAT_SPIKE=1 pnpm vitest run tests/integration/compat-spike.test.ts -t 'otel'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "postgres",
        "negative_control": { "would_fail_if": ["telemetry:{} used (dropped in 1.x)", "spans in-memory only", "Postgres unreachable"] },
        "evidence": { "artifact_type": "db_query", "required_capture": true },
        "cases": [ { "start_ref": "real_pg", "action": { "actor": "cli_user", "steps": ["run spike, query @mastra/pg trace store for traceId"] },
          "end_state": { "must_observe": ["otelSpans >= 1 read from Postgres"], "must_not_observe": ["otelSpans === 0", "hard-coded span count"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN locked set + Postgres up WHEN a committed 2-step workflow persists via @mastra/pg and a @mastra/mcp client calls one tool over a real transport THEN workflow.status==='success' and MCP round-trips the tool",
      "verify": "COMPAT_SPIKE=1 pnpm vitest run tests/integration/compat-spike.test.ts -t 'workflow|mcp'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "mastra",
        "negative_control": { "would_fail_if": ["workflow snapshot in-memory (no @mastra/pg)", "MCP tool stubbed", "transport mocked"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "real_pg", "action": { "actor": "cli_user", "steps": ["run workflow + mcp cells"] },
          "end_state": { "must_observe": ["workflow.status='success' with typed output", "mcp.tools >= 1 returning its validated payload"], "must_not_observe": ["workflow.status 'failed'/absent", "mcp.tools===0", "tool result not matching outputSchema"] } } ] } },
    { "id": "AC-4", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN DATABASE_URL at a dead Postgres WHEN `holo compat:spike` runs THEN it exits non-zero with workflow+otel cells red (no false green)",
      "verify": "DATABASE_URL=postgres://127.0.0.1:1/dead bun services/platform/src/cli/holo.ts compat:spike; test $? -ne 0",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "postgres",
        "negative_control": { "would_fail_if": ["the spike swallows the connect error and reports green", "silent LibSQL/in-memory fallback"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "pg_down", "action": { "actor": "cli_user", "steps": ["holo compat:spike with dead DATABASE_URL"] },
          "end_state": { "must_observe": ["exit code != 0", "cells.workflow='red'", "cells.otel='red'"], "must_not_observe": ["exit 0", "any storage cell green", "a fallback-storage message"] } } ] } },
    { "id": "AC-5", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN fleet started + Postgres up WHEN the agent cell calls a live fleet model and a network assertion counts provider requests THEN agent.text non-empty and cloudRequests===0",
      "verify": "COMPAT_SPIKE=1 pnpm vitest run tests/integration/compat-spike.test.ts -t 'agent|cloud'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "litellm-fleet",
        "negative_control": { "would_fail_if": ["agent binds a cloud model", "fleet down and a cloud fallback fires"] },
        "evidence": { "artifact_type": "api_response", "required_capture": true },
        "cases": [ { "start_ref": "live_fleet", "action": { "actor": "api_client", "steps": ["agent.generate() via @ai-sdk/openai-compatible :4545"] },
          "end_state": { "must_observe": ["agent.text non-empty", "cloudRequests===0", ">=1 request to http://127.0.0.1:4545/v1"], "must_not_observe": ["any api.anthropic.com/api.openai.com request", "empty agent.text", "cloudRequests>0"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "compat-spike test spawns real `holo compat:spike` under Bun vs real Postgres+fleet and asserts exit 0, 5/5 green, version table", "verify": "COMPAT_SPIKE=1 pnpm vitest run tests/integration/compat-spike.test.ts -t 'green five-cell'" },
    { "id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "test asserts the CLI Postgres trace query returns otelSpans>=1 for the run traceId", "verify": "COMPAT_SPIKE=1 pnpm vitest run tests/integration/compat-spike.test.ts -t 'otel'" },
    { "id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "test asserts workflow.status==='success' persisted via @mastra/pg and MCP round-trips >=1 tool over a real transport", "verify": "COMPAT_SPIKE=1 pnpm vitest run tests/integration/compat-spike.test.ts -t 'workflow|mcp'" },
    { "id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "with DATABASE_URL at a dead port the spike exits non-zero and marks workflow+otel red", "verify": "DATABASE_URL=postgres://127.0.0.1:1/dead bun services/platform/src/cli/holo.ts compat:spike; test $? -ne 0" },
    { "id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "test asserts agent.text non-empty from the live fleet and cloudRequests===0 via network assertion", "verify": "COMPAT_SPIKE=1 pnpm vitest run tests/integration/compat-spike.test.ts -t 'agent|cloud'" }
  ]
}
-->
</details>
