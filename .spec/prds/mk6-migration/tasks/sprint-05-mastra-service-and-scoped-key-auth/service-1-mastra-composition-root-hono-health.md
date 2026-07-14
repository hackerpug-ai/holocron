# service-1 — Mastra composition root + Hono HTTP/SSE surface + /health readiness

## What this does

Stand up the single Mastra/Bun service (agents, tools, workflows, processors) fronted by a Hono HTTP + SSE surface on the tailnet mini, with `/health` proving real DB/fleet/queue readiness — the sole backend per AP-1, wiring Sprint 01's compatibility-locked runtime against Sprint 04's Postgres schema.

Provides: mastra-composition-root, hono-http-sse-surface, health-readiness-endpoint.

## Why

- One Mastra instance is the sole backend; nothing downstream boots without it (Sprint 06/08/11/12/13/15/18/19/21 all depend on it).
- `/health` must report live readiness, not a static 200 — a stopped Postgres or unreachable fleet must flip the probe so Sprint 06's `holo stack up` and Sprint 13's harness fail closed.
- Grounded in: UC-PLAT-02 (AC-1), T-PLAT-005, 02-system-components.md (C-2), 11-runtime-contracts.md (Mastra compatibility lock).

## How to verify

- `bun run services/platform/src/index.ts && curl -f http://localhost:4111/health | jq '.status == "ok" and .db.ready == true'` → Exit 0.
- Stop Postgres, then `curl -s http://localhost:4111/health | jq '.db.ready'` → `false` (probe is real, not static).
- `holo service:up && sleep 2 && curl -sf http://localhost:4111/health >/dev/null` → Exit 0.

## Scope

Writes: `services/platform/src/index.ts (NEW — Mastra composition root)` · `services/platform/src/http/hono-app.ts (NEW — Hono HTTP/SSE)` · `services/platform/src/http/health.ts (NEW — /health probes)` · `services/platform/src/cli/holo.ts (MODIFY — service:up)`.
Prohibited: `convex/** (read-only legacy)` · `app/** (not this sprint)` · `holocron-mcp/src/** (not this sprint)` · `services/platform/src/tools/** (service-2)` · `services/platform/src/http/middleware/** (service-3)`.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: service-1 — Mastra composition root + Hono HTTP/SSE surface + /health readiness
================================================================================

TASK_TYPE:  INFRA
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L  (240 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: True)
CAPABILITY: CAP-INF-01
SPRINT:     [Sprint 5 — Mastra Service and Scoped-Key Auth](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
The single Mastra/Bun service boots against Sprint 04's Postgres via `@mastra/pg`, listens on port 4111 over Hono, and `GET /health` reports live `{status:'ok', db:{ready:true}, fleet:{ready:true}, queue:{ready:true}}` — flipping to unhealthy the moment a real dependency is unreachable.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST boot exactly ONE Mastra instance (`new Mastra({...})`) in `services/platform/src/index.ts`
- MUST wire `@mastra/pg` PostgresStore against the Sprint 04 schema as the storage adapter
- MUST expose Hono HTTP + SSE on port 4111 (configurable via env)
- MUST implement `/health` that probes Postgres connection, fleet `:4545`, and queue readiness
- MUST add the `holo service:up` CLI command using the compatibility-locked `@mastra/core` from Sprint 01
- NEVER boot multiple Mastra instances or split agents/workflows across separate servers
- NEVER use SQLite or any datastore besides Postgres (AP-1 violation)
- NEVER return a static 200 from `/health` without probing real services
- NEVER implement RLS or multi-tenant auth (AP-7 single-user tailnet trust violation)
- NEVER stub resolveModel or fleet reachability checks
- STRICTLY `/health` must report live readiness, not a static response
- STRICTLY Hono must be the HTTP framework (no Express/Fastify); port 4111 is the default (overridable via env)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): Mastra composition root boots against Postgres on :4111
- [ ] AC-2: `/health` proves real DB/fleet/queue readiness (flips when a dependency stops)
- [ ] AC-3: `holo service:up` boots the service
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (completeness proven against a real booted service, not hand-asserted)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Mastra composition root boots against Postgres (flow_ref UC-PLAT-02 / T-PLAT-005)
  GIVEN Postgres 18 from Sprint 04 is running on the mini with the domain schema applied
  WHEN  an operator runs `bun run services/platform/src/index.ts`
  THEN  the Mastra instance boots without errors, PostgresStore connects via @mastra/pg, and the server listens on port 4111
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra-service · TDD_STATE: none
  SCENARIO — start_ref: postgres_running_with_schema · evidence: stdout
    NEGATIVE_CONTROL: would fail if Postgres not running; port 4111 already in use; @mastra/pg version mismatch (compatibility lock violated); database schema missing; storage adapter not configured; the required object/config is absent or a no-op stub
    MUST_OBSERVE: GET /health returns HTTP 200; response JSON `.status` equals "ok"; stdout line contains ":4111"; boot process exit code 0 and stays alive > 5 seconds
    MUST_NOT_OBSERVE: connection refused with 0 bytes response; EADDRINUSE error on port 4111; process exits with code 1 within 5 seconds; empty /health body (0 bytes)

AC-2 /health proves DB/fleet/queue readiness (flow_ref T-PLAT-005)
  GIVEN the Mastra service is booted
  WHEN  an operator calls GET /health with each dependency toggled
  THEN  the response reflects live probe state for db, fleet, and queue with latency_ms
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra-service · TDD_STATE: none
  SCENARIO — start_ref: mastra_service_booted · evidence: api_response
    NEGATIVE_CONTROL: would fail if Postgres down (db.ready false); fleet :4545 unreachable (fleet.ready false); health endpoint returns static response without probing; latency not measured; the required object/config is absent or a no-op stub
    MUST_OBSERVE: GET /health returns HTTP 200 with JSON body; stop Postgres => `.db.ready` becomes `false` and HTTP 503; restart Postgres => `.db.ready` becomes `true`; latency_ms field is a positive integer (e.g. 12); `.fleet.endpoint` equals "http://127.0.0.1:4545"
    MUST_NOT_OBSERVE: HTTP 200 static body with 0 real probes; /health returns HTTP 200 when Postgres is down; latency_ms field empty or 0; body has no db/fleet object (empty)

AC-3 holo service:up CLI command starts service (flow_ref T-PLAT-005)
  GIVEN the Mastra service code exists
  WHEN  an operator runs `holo service:up`
  THEN  the service boots on :4111 and /health responds ok
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: mastra_service_code_exists · evidence: stdout
    NEGATIVE_CONTROL: would fail if holo CLI not installed; service:up subcommand missing; service fails to boot; port 4111 not bound; the required object/config is absent or a no-op stub
    MUST_OBSERVE: `holo service:up` prints 'Starting Mastra service on :4111'; 'Listening' line appears within 5 seconds; GET /health returns HTTP 200; `.status` equals "ok"
    MUST_NOT_OBSERVE: 'command not found: holo' exit code 127; subcommand 'service:up' missing exit code 1; /health returns 0 bytes / connection refused; no port 4111 bound

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/index.ts (NEW — Mastra composition root)
- services/platform/src/http/hono-app.ts (NEW — Hono HTTP/SSE surface)
- services/platform/src/http/health.ts (NEW — /health readiness probes)
- services/platform/src/cli/holo.ts (MODIFY — add service:up subcommand)
writeProhibited: convex/** (read-only legacy), app/** (not this sprint), holocron-mcp/src/** (not this sprint), services/platform/src/tools/** (service-2 owns registry), services/platform/src/http/middleware/** (service-3 owns auth)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/10-technical-requirements/02-system-components.md:9-32 [C-2 Mastra Server component]
2. .spec/prds/mk6-migration/10-technical-requirements/04-api-design.md:11-31 [Hono HTTP/SSE routes, /health]
3. .spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md:11-16 [Mastra compatibility lock]
4. brain/docs/mastra/ROSETTA.md:1-80 [Mastra 1.x composition root `new Mastra({...})`]
5. services/platform/src/cli/holo.ts:1-50 [existing holo CLI structure for adding service:up]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- service-boots: `bun run services/platform/src/index.ts` → exits 0, stdout 'Listening on :4111' within 5s
- health-responds: `curl -f http://localhost:4111/health | jq '.status == "ok"'` → Exit 0
- health-probes-real: `curl -s http://localhost:4111/health | jq '.db.ready == true and .fleet.ready == true'` → both true
- holo-cli-works: `holo service:up && sleep 2 && curl -sf http://localhost:4111/health` → Exit 0
- typecheck: `pnpm tsgo --noEmit` → Exit 0
- lint: `pnpm biome check services/platform/src/index.ts services/platform/src/http/ services/platform/src/cli/holo.ts` → Exit 0

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: single Mastra instance (no multi-instance split); PostgresStore reuses Sprint 04 schema (AP-1, no SQLite); /health probes are real and flip when a dependency stops; resolveModel skeleton is wired (full CAP-INF-01 lands in Sprint 08); no RLS/multi-tenant (AP-7).
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: sprint-04-provision-postgres-and-domain-schema (clean Postgres schema + zero_pub) · sprint-01-mastra-compat-lock-fleet-manifest (holo CLI + compatibility-locked runtime)
Blocks: service-2 · service-3

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "service-1",
  "proposed_by": "mastra-planner",
  "tdd_mode": "skipped",
  "verification_policy": { "requires_tests": false, "requires_red_evidence": false, "requires_seeded_evidence": true },
  "fixtures": {
    "postgres_running_with_schema": { "description": "Postgres 18 from Sprint 04 with full domain schema applied and accepting connections", "seed_method": "recorded_external", "records": ["Postgres 18 running on mini", "pgvector installed", "wal_level=logical", "domain schema applied", "5432 listening over Tailscale"] },
    "mastra_service_booted": { "description": "Mastra service running and listening on port 4111", "seed_method": "public_api", "records": ["bun run index.ts succeeded", "Hono app listening on :4111", "/health accessible"] },
    "mastra_service_code_exists": { "description": "Mastra service source exists in services/platform/src/", "seed_method": "recorded_external", "records": ["index.ts exists", "hono-app.ts exists", "health.ts exists"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "flow_ref": "UC-PLAT-02", "description": "GIVEN Postgres running WHEN bun run index.ts THEN Mastra boots on :4111 and /health returns {status:'ok',db.ready:true}", "verify": "bun run services/platform/src/index.ts && curl -f http://localhost:4111/health | jq '.status == \"ok\" and .db.ready == true'", "maps_to_ac": null,
      "scenario": { "tier": "visible", "test_tier": "integration", "verification_service": "mastra-service", "flow_ref": "T-PLAT-005", "negative_control": { "would_fail_if": ["Postgres not running", "Port 4111 already in use", "@mastra/pg version mismatch (compatibility lock violated)", "Database schema missing", "Storage adapter not configured", "the required object/config is absent or a no-op stub"] }, "evidence": { "artifact_type": "stdout", "required_capture": true }, "cases": [ { "start_ref": "postgres_running_with_schema", "action": { "actor": "operator", "steps": ["bun run services/platform/src/index.ts", "curl http://localhost:4111/health"] }, "end_state": { "must_observe": ["GET /health returns HTTP 200", "response JSON `.status` equals \"ok\"", "stdout line contains \":4111\"", "boot process exit code 0 and stays alive > 5 seconds"], "must_not_observe": ["connection refused with 0 bytes response", "EADDRINUSE error on port 4111", "process exits with code 1 within 5 seconds", "empty /health body (0 bytes)"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "flow_ref": "T-PLAT-005", "description": "GIVEN service booted WHEN GET /health with deps toggled THEN live db/fleet/queue readiness with latency_ms", "verify": "curl -s http://localhost:4111/health | jq '.db.ready == true and .fleet.ready == true and .queue.ready == true'", "maps_to_ac": null,
      "scenario": { "tier": "visible", "test_tier": "integration", "verification_service": "mastra-service", "flow_ref": "T-PLAT-005", "negative_control": { "would_fail_if": ["Postgres down (db.ready false)", "fleet :4545 unreachable (fleet.ready false)", "health endpoint returns static response without probing", "latency not measured", "the required object/config is absent or a no-op stub"] }, "evidence": { "artifact_type": "api_response", "required_capture": true }, "cases": [ { "start_ref": "mastra_service_booted", "action": { "actor": "api_client", "steps": ["stop Postgres; curl /health", "restart Postgres; curl /health", "stop fleet; curl /health", "restart fleet; curl /health"] }, "end_state": { "must_observe": ["GET /health returns HTTP 200 with JSON body", "stop Postgres => `.db.ready` becomes `false` and HTTP 503", "restart Postgres => `.db.ready` becomes `true`", "latency_ms field is a positive integer (e.g. 12)", "`.fleet.endpoint` equals \"http://127.0.0.1:4545\""], "must_not_observe": ["HTTP 200 static body with 0 real probes", "/health returns HTTP 200 when Postgres is down", "latency_ms field empty or 0", "body has no db/fleet object (empty)"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "flow_ref": "T-PLAT-005", "description": "GIVEN service code exists WHEN holo service:up THEN service boots on :4111 and /health ok", "verify": "holo service:up && sleep 2 && curl -sf http://localhost:4111/health", "maps_to_ac": null,
      "scenario": { "tier": "visible", "test_tier": "integration", "verification_service": "holo-cli", "flow_ref": "T-PLAT-005", "negative_control": { "would_fail_if": ["holo CLI not installed", "service:up subcommand missing", "service fails to boot", "port 4111 not bound", "the required object/config is absent or a no-op stub"] }, "evidence": { "artifact_type": "stdout", "required_capture": true }, "cases": [ { "start_ref": "mastra_service_code_exists", "action": { "actor": "cli_user", "steps": ["holo service:up", "curl http://localhost:4111/health"] }, "end_state": { "must_observe": ["`holo service:up` prints 'Starting Mastra service on :4111'", "'Listening' line appears within 5 seconds", "GET /health returns HTTP 200", "`.status` equals \"ok\""], "must_not_observe": ["'command not found: holo' exit code 127", "subcommand 'service:up' missing exit code 1", "/health returns 0 bytes / connection refused", "no port 4111 bound"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "description": "Mastra service boots without errors when Postgres is running", "maps_to_ac": "AC-1", "verify": "bun run services/platform/src/index.ts exits 0 and shows listening" },
    { "id": "TC-2", "type": "test_criterion", "description": "/health returns 5xx or db.ready=false when Postgres is down", "maps_to_ac": "AC-2", "verify": "stop Postgres; curl /health fails or .db.ready == false" },
    { "id": "TC-3", "type": "test_criterion", "description": "holo service:up boots the service", "maps_to_ac": "AC-3", "verify": "holo service:up && curl http://localhost:4111/health succeeds" }
  ]
}
-->
</details>
