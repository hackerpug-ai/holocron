# service-3 — Scoped API-key middleware (RN/MCP/control scopes) + fleet resolution wired in

## What this does

Implement the scoped-key control plane over Tailscale (RN/MCP/control scopes → 401/403/200) and wire `resolveModel(role)` against the Sprint 01 Fleet Role Manifest inside the running service, failing closed when a declared capability is absent.

Provides: scoped-key-middleware, fleet-resolution, scope-enforcement.

## Why

- The auth boundary is the human-testing gate: unkeyed tailnet request → 401, correctly-scoped → 200, wrong-scope → 403.
- `resolveModel` is the seam every later inference task extends (Sprint 08 adds budget + degraded mode); wiring it here against the manifest is what makes the service capable of role-routed reasoning.
- NO RLS, NO multi-tenant (AP-7) — this is authorization over a private tailnet, not tenant isolation.
- Grounded in: UC-PLAT-02 (AC-3 + AC-4), T-PLAT-007, T-PLAT-008, 11-runtime-contracts.md (Fleet Role Manifest), 09-capability-chains.md (CAP-INF-01).

## How to verify

- `curl -o /dev/null -w '%{http_code}' http://localhost:4111/api/missions/x/steer` (no key) → `401`.
- `curl -H 'Authorization: Bearer RN_KEY' -o /dev/null -w '%{http_code}' http://localhost:4111/api/missions` → `200`.
- `curl -H 'Authorization: Bearer MCP_KEY' -o /dev/null -w '%{http_code}' http://localhost:4111/api/missions` → `403`.
- `holo manifest:resolve divergent | jq '.endpoint'` → a `:4545` endpoint; `holo manifest:resolve nonexistent; echo $?` → nonzero exit.
- `pnpm vitest run services/platform/src/http/middleware/__tests__/scoped-key.test.ts` → RED before impl, GREEN after.

## Scope

Writes: `services/platform/src/http/middleware/scoped-key.ts (NEW — scoped-key middleware)` · `services/platform/src/inference/resolve-model.ts (MODIFY — wire resolveModel to running service)` · `services/platform/src/http/hono-app.ts (MODIFY — apply middleware)` · `services/platform/src/cli/holo.ts (MODIFY — manifest:resolve)` · `services/platform/src/http/middleware/__tests__/scoped-key.test.ts (NEW — RED suite)`.
Prohibited: `convex/** (read-only legacy)` · `app/** (not this sprint)` · `holocron-mcp/src/** (not this sprint)` · `services/platform/src/db/** (not this sprint)` · `services/platform/src/storage/** (not this sprint)`.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: service-3 — Scoped API-key middleware (RN/MCP/control scopes) + fleet resolution wired in
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Completed
PRIORITY:   P0
EFFORT:     M  (210 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-INF-01
SPRINT:     [Sprint 5 — Mastra Service and Scoped-Key Auth](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run services/platform/src/http/middleware/__tests__/scoped-key.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
An Agent Client reaches the Hono API surface over Tailscale only with its scoped key — unkeyed → 401, wrong-scope → 403, correctly-scoped → 200 — and `resolveModel(role)` resolves every required Fleet Role Manifest role to a live `:4545` endpoint from inside the running service, failing closed when a role is absent.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST implement scoped-key middleware in `services/platform/src/http/middleware/scoped-key.ts`
- MUST support three scopes: RN (application client), MCP (MCP gateway), control (verdict/steer operators)
- MUST return 401 for unkeyed requests to protected routes
- MUST return 403 for wrong-scope requests
- MUST return 200 for correctly-scoped requests
- MUST wire `resolveModel(role)` in `services/platform/src/inference/resolve-model.ts` against the Sprint 01 Fleet Role Manifest
- MUST apply the middleware to `/api/*` and `/mcp` routes
- NEVER use RLS or multi-tenant isolation (AP-7 single-user tailnet trust violation)
- NEVER return 200 for an unkeyed request
- NEVER allow a wrong-scope request to succeed
- NEVER stub resolveModel or return fake endpoints
- NEVER silently fall back when a fleet role is unreachable (must fail closed)
- STRICTLY unkeyed → 401 is mandatory for `/api/missions`, `/api/missions/:id/verdicts`, `/api/missions/:id/steer`, `/mcp`
- STRICTLY wrong-scope → 403 is mandatory (RN key cannot call /mcp; MCP key cannot call /api/missions)
- STRICTLY resolveModel MUST fail closed when a role is declared but unreachable; `/health` is exempt (tailnet-only, no key); control scope is verdict/steer only

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): scoped-key middleware enforces three scopes (401/403/200)
- [x] AC-2: `resolveModel` wired to the Fleet Role Manifest; unknown/unreachable roles fail closed
- [x] AC-3: control scope limited to verdict/steer routes
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, the 401/403/200 boundary proven by curl)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Scoped-key middleware enforces three scopes (flow_ref UC-PLAT-02 / T-PLAT-007)
  GIVEN the Mastra service is booted with scoped-key middleware
  WHEN  an operator makes requests with different keys to different routes
  THEN  unkeyed → 401, wrong-scope → 403, correct-scope → 200
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra-service · TDD_STATE: red
  SCENARIO — start_ref: mastra_service_with_scoped_keys · evidence: api_response
    NEGATIVE_CONTROL: would fail if middleware not applied to routes; key validation not implemented; 401 not returned for unkeyed; 403 not returned for wrong-scope; middleware stubbed (always returns 200); the required object/config is absent or a no-op stub
    MUST_OBSERVE: unkeyed POST /api/missions/x/steer returns HTTP 401; RN_KEY POST returns HTTP 200; MCP_KEY POST to /api/missions returns HTTP 403; CONTROL_KEY POST /api/missions/x/verdicts returns HTTP 200; MCP_KEY POST to /mcp returns HTTP 200
    MUST_NOT_OBSERVE: unkeyed POST returns HTTP 200; wrong-scope MCP_KEY POST to /api/missions returns HTTP 200; 0 key-check (static HTTP 200); middleware bypassed with no HTTP 401

AC-2 resolveModel wired to Fleet Role Manifest (flow_ref T-PLAT-008)
  GIVEN the Fleet Role Manifest from Sprint 01 exists and is loaded
  WHEN  an operator calls resolveModel(role) from within the service
  THEN  a live fleet endpoint is returned for declared roles; unknown/unreachable roles fail closed
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra-service · TDD_STATE: red
  SCENARIO — start_ref: fleet_role_manifest_exists · evidence: api_response
    NEGATIVE_CONTROL: would fail if resolveModel not implemented; Fleet Role Manifest not loaded; resolveModel returns fake endpoint; unknown role does not fail closed; the required object/config is absent or a no-op stub
    MUST_OBSERVE: `holo manifest:resolve divergent` prints endpoint http://127.0.0.1:4545; `holo manifest:resolve convergent` prints a :4545 endpoint; `holo manifest:resolve nonexistent` exits with code 1 + error; fleet :4545 down => resolve exits code 1 (nonzero)
    MUST_NOT_OBSERVE: `holo manifest:resolve nonexistent` exits code 0 (accepted); resolveModel returns null/undefined (empty); silent fallback to a fake endpoint with 0 error

AC-3 Control scope limited to verdict/steer routes (flow_ref T-PLAT-007)
  GIVEN the scoped-key middleware is active
  WHEN  an operator uses a control key against non-control routes
  THEN  control key works on verdict/steer but fails (403) on /api/missions and /mcp
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra-service · TDD_STATE: red
  SCENARIO — start_ref: scoped_key_middleware_active · evidence: api_response
    NEGATIVE_CONTROL: would fail if control scope not restricted to verdict/steer; control key works on /api/missions (should be 403); control key works on /mcp (should be 403); middleware does not check route + scope pairing; the required object/config is absent or a no-op stub
    MUST_OBSERVE: CONTROL_KEY POST /api/missions/x/verdicts returns HTTP 200; CONTROL_KEY POST /api/missions/x/steer returns HTTP 200; CONTROL_KEY GET /api/missions returns HTTP 403; CONTROL_KEY POST /mcp returns HTTP 403
    MUST_NOT_OBSERVE: CONTROL_KEY GET /api/missions returns HTTP 200 (wrong scope); scope check absent with no HTTP 403; 0 scope enforcement

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/http/middleware/scoped-key.ts (NEW — scoped-key middleware)
- services/platform/src/inference/resolve-model.ts (MODIFY — wire resolveModel to the running service)
- services/platform/src/http/hono-app.ts (MODIFY — apply middleware to /api/* and /mcp)
- services/platform/src/cli/holo.ts (MODIFY — add manifest:resolve subcommand)
- services/platform/src/http/middleware/__tests__/scoped-key.test.ts (NEW — RED test suite)
writeProhibited: convex/** (read-only legacy), app/** (not this sprint), holocron-mcp/src/** (not this sprint), services/platform/src/db/** (not this sprint), services/platform/src/storage/** (not this sprint)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/10-technical-requirements/04-api-design.md:32-34 [route policy + scoped-key control plane]
2. .spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md:27-32 [Fleet Role Manifest + resolveModel contract]
3. .spec/prds/mk6-migration/10-technical-requirements/01-architecture-posture.md:35-38 [AP-7 tailnet trust, NO RLS, NO multi-tenant]
4. .spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:43-52 [CAP-INF-01 segment this sprint owns]
5. .spec/prds/mk6-migration/tasks/sprint-01-mastra-compat-lock-fleet-manifest/compat-3-fleet-role-manifest-and-resolvemodel.md [manifest structure + role definitions]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- unkeyed-401: `curl -o /dev/null -w '%{http_code}' http://localhost:4111/api/missions` → `401`
- correct-scope-200: `curl -H 'Authorization: Bearer RN_KEY' -o /dev/null -w '%{http_code}' http://localhost:4111/api/missions` → `200`
- wrong-scope-403: `curl -H 'Authorization: Bearer MCP_KEY' -o /dev/null -w '%{http_code}' http://localhost:4111/api/missions` → `403`
- fleet-resolution-works: `holo manifest:resolve divergent | jq '.endpoint | contains(":4545")'` → true
- unknown-role-fails: `holo manifest:resolve nonexistent; echo $?` → nonzero
- red-tests: `pnpm vitest run services/platform/src/http/middleware/__tests__/scoped-key.test.ts` → RED exits nonzero before impl; GREEN exits 0 after
- typecheck: `pnpm tsgo --noEmit` → Exit 0
- lint: `pnpm biome check services/platform/src/http/middleware/` → Exit 0

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: the 401/403/200 boundary proven by curl (not asserted statically); resolveModel fails closed on unknown/unreachable roles (no silent fallback, no fake endpoint); control scope restricted to verdict/steer; `/health` exempt; NO RLS, NO multi-tenant (AP-7); full CAP-INF-01 router/degraded-mode logic correctly deferred to Sprint 08 (resolveModel is the seam only).
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: service-1 (composition root + Hono app) · sprint-01-mastra-compat-lock-fleet-manifest (Fleet Role Manifest + resolveModel skeleton from compat-3)
Blocks: service-4 · service-5

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "service-3",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": { "requires_tests": true, "requires_red_evidence": true, "requires_seeded_evidence": true },
  "fixtures": {
    "mastra_service_with_scoped_keys": { "description": "Mastra service running with scoped-key middleware configured and test keys (RN_KEY/MCP_KEY/CONTROL_KEY) in env", "seed_method": "public_api", "records": ["Mastra service booted", "scoped-key middleware active", "RN_KEY, MCP_KEY, CONTROL_KEY in env"] },
    "fleet_role_manifest_exists": { "description": "Fleet Role Manifest from Sprint 01 loaded by the service", "seed_method": "recorded_external", "records": ["compat-3 fleet-manifest exists", "service loads manifest at startup", "manifest declares divergent/convergent/judge/embed/rerank"] },
    "scoped_key_middleware_active": { "description": "Scoped-key middleware applied to Hono routes and enforcing scopes", "seed_method": "public_api", "records": ["middleware registered in Hono app", "routes protected", "key validation functional"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "flow_ref": "UC-PLAT-02", "description": "GIVEN service booted with middleware WHEN requests with different keys THEN unkeyed->401, wrong-scope->403, correct-scope->200", "verify": "curl /api/missions -> 401; curl -H 'Authorization: Bearer RN_KEY' /api/missions -> 200; curl -H 'Authorization: Bearer MCP_KEY' /api/missions -> 403", "maps_to_ac": null,
      "scenario": { "tier": "visible", "test_tier": "integration", "verification_service": "mastra-service", "flow_ref": "T-PLAT-007", "negative_control": { "would_fail_if": ["Middleware not applied to routes", "Key validation not implemented", "401 not returned for unkeyed", "403 not returned for wrong-scope", "Middleware stubbed (always returns 200)", "the required object/config is absent or a no-op stub"] }, "evidence": { "artifact_type": "api_response", "required_capture": true }, "cases": [ { "start_ref": "mastra_service_with_scoped_keys", "action": { "actor": "api_client", "steps": ["curl /api/missions (no key)", "curl -H 'Authorization: Bearer RN_KEY' /api/missions", "curl -H 'Authorization: Bearer MCP_KEY' /api/missions", "curl -H 'Authorization: Bearer CONTROL_KEY' /api/missions/x/verdicts", "curl -H 'Authorization: Bearer MCP_KEY' /mcp"] }, "end_state": { "must_observe": ["unkeyed POST /api/missions/x/steer returns HTTP 401", "RN_KEY POST returns HTTP 200", "MCP_KEY POST to /api/missions returns HTTP 403", "CONTROL_KEY POST /api/missions/x/verdicts returns HTTP 200", "MCP_KEY POST to /mcp returns HTTP 200"], "must_not_observe": ["unkeyed POST returns HTTP 200", "wrong-scope MCP_KEY POST to /api/missions returns HTTP 200", "0 key-check (static HTTP 200)", "middleware bypassed with no HTTP 401"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "flow_ref": "T-PLAT-008", "description": "GIVEN Fleet Role Manifest exists WHEN resolveModel(role) called THEN returns live :4545 endpoint for declared roles; unknown/unreachable roles fail closed", "verify": "curl /inference/resolve/divergent | jq '.endpoint'; curl /inference/resolve/nonexistent returns 404", "maps_to_ac": null,
      "scenario": { "tier": "visible", "test_tier": "integration", "verification_service": "mastra-service", "flow_ref": "T-PLAT-008", "negative_control": { "would_fail_if": ["resolveModel not implemented", "Fleet Role Manifest not loaded", "resolveModel returns fake endpoint", "Unknown role does not fail closed", "the required object/config is absent or a no-op stub"] }, "evidence": { "artifact_type": "api_response", "required_capture": true }, "cases": [ { "start_ref": "fleet_role_manifest_exists", "action": { "actor": "api_client", "steps": ["holo manifest:resolve divergent", "holo manifest:resolve convergent", "holo manifest:resolve nonexistent", "stop fleet :4545; holo manifest:resolve divergent"] }, "end_state": { "must_observe": ["`holo manifest:resolve divergent` prints endpoint http://127.0.0.1:4545", "`holo manifest:resolve convergent` prints a :4545 endpoint", "`holo manifest:resolve nonexistent` exits with code 1 + error", "fleet :4545 down => resolve exits code 1 (nonzero)"], "must_not_observe": ["`holo manifest:resolve nonexistent` exits code 0 (accepted)", "resolveModel returns null/undefined (empty)", "silent fallback to a fake endpoint with 0 error"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "flow_ref": "T-PLAT-007", "description": "GIVEN scoped middleware active WHEN control key used THEN works on verdict/steer but fails on /api/missions and /mcp", "verify": "curl -H 'Authorization: Bearer CONTROL_KEY' /api/missions/x/verdicts -> 200; curl -H 'Authorization: Bearer CONTROL_KEY' /api/missions -> 403", "maps_to_ac": null,
      "scenario": { "tier": "visible", "test_tier": "integration", "verification_service": "mastra-service", "flow_ref": "T-PLAT-007", "negative_control": { "would_fail_if": ["Control scope not restricted to verdict/steer", "Control key works on /api/missions (should be 403)", "Control key works on /mcp (should be 403)", "Middleware does not check route + scope pairing", "the required object/config is absent or a no-op stub"] }, "evidence": { "artifact_type": "api_response", "required_capture": true }, "cases": [ { "start_ref": "scoped_key_middleware_active", "action": { "actor": "api_client", "steps": ["curl -H CONTROL_KEY /verdicts", "curl -H CONTROL_KEY /steer", "curl -H CONTROL_KEY /api/missions", "curl -H CONTROL_KEY /mcp"] }, "end_state": { "must_observe": ["CONTROL_KEY POST /api/missions/x/verdicts returns HTTP 200", "CONTROL_KEY POST /api/missions/x/steer returns HTTP 200", "CONTROL_KEY GET /api/missions returns HTTP 403", "CONTROL_KEY POST /mcp returns HTTP 403"], "must_not_observe": ["CONTROL_KEY GET /api/missions returns HTTP 200 (wrong scope)", "scope check absent with no HTTP 403", "0 scope enforcement"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "description": "Unkeyed request returns 401", "maps_to_ac": "AC-1", "verify": "curl /api/missions returns 401" },
    { "id": "TC-2", "type": "test_criterion", "description": "Correctly-scoped request returns 200", "maps_to_ac": "AC-1", "verify": "curl -H 'Authorization: Bearer RN_KEY' /api/missions returns 200" },
    { "id": "TC-3", "type": "test_criterion", "description": "Wrong-scope request returns 403", "maps_to_ac": "AC-1", "verify": "curl -H 'Authorization: Bearer MCP_KEY' /api/missions returns 403" },
    { "id": "TC-4", "type": "test_criterion", "description": "resolveModel returns the fleet endpoint", "maps_to_ac": "AC-2", "verify": "holo manifest:resolve divergent returns a :4545 endpoint" },
    { "id": "TC-5", "type": "test_criterion", "description": "Unknown role fails closed", "maps_to_ac": "AC-2", "verify": "holo manifest:resolve nonexistent returns nonzero exit" }
  ]
}
-->
</details>
