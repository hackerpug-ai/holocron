# compat-4 — RED tests: smoke-matrix fails on disconnected Postgres; manifest fails on missing role/capability

## What this does
Delivers the failing-first **negative-control suite** that gives the compat lock and fleet manifest their teeth: Postgres-down ⇒ spike red, missing-role/capability ⇒ manifest blocks, and zero silent cloud fallback — each driving the REAL `holo` entrypoints, no mocks, no skip-to-green.

## Why
A gate is only real if it fails when the behavior is absent. This task proves the compat spike and fleet manifest genuinely depend on the real stack, closing the anti-stub cardinal rule (`~/.claude/CLAUDE.md` THE SUPREME RULE) and the CAP-INF-01 negative-control clause.

## How to verify
`DATABASE_URL=postgres://127.0.0.1:1/dead pnpm vitest run tests/integration/compat-spike.test.ts -t 'fails closed when Postgres is unreachable'` passes (because the spike exited non-zero); the suite carries no `*.skip` on any negative control.

## Scope
Modifies `tests/integration/compat-spike.test.ts` + `tests/integration/fleet-manifest.test.ts` (adds negative controls). Touches NO production/service code under `services/platform/src`.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: compat-4 — RED tests: smoke-matrix fails on disconnected Postgres; manifest fails on missing role/capability
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (120 min)
AGENT:      implementer=red-test-generator | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes
CAPABILITY: CAP-INF-01 (un-fakeability guard)
SPRINT:     [Sprint 1](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      pnpm test
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
The negative-control suite passes only against the real up stack; against the absent stack (Postgres down / role missing / cloud fallback) the targeted controls report RED, and the captured RED output demonstrates the teeth — no skip-to-green.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST drive the REAL `holo` entrypoints (compat:spike, fleet:validate, resolveModel) — no mocking of @mastra/*, the provider, or Postgres.
- MUST assert the concrete failure signature: Postgres-down ⇒ `holo compat:spike` exit non-zero (RED if it reports green); missing-role ⇒ `holo fleet:validate` exit non-zero (RED if the loader accepts it); normal run ⇒ zero Anthropic requests (RED if any cloud request occurs).
- NEVER use `it.skip`/conditional skip to make a control pass when the stack is absent — a skipped control has no teeth (review-blocking anti-pattern).
- NEVER weaken an assertion (`exit>=0`, `toBeTruthy`) to pass; NEVER touch `services/platform/src` (RED tests only); NEVER assert "works"/"boots correctly".
- STRICTLY: each control names its would-fail-if disconnect; controls seed real start state via real entrypoints (dead DATABASE_URL, fixture manifests), never view-injection.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): Postgres-down control has teeth (spike red)
- [ ] AC-2: missing-role/capability control has teeth (validate blocks)
- [ ] AC-3: no-silent-cloud control has teeth (cloudRequests===0)
- [ ] AC-4: suite green on up-stack, RED on absent-stack, no skip guards
- [ ] `pnpm biome check .` clean; only test files modified

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Postgres-down negative control has teeth
  GIVEN the compat spike entrypoint (compat-1) + DATABASE_URL at a dead Postgres (pg_down)
  WHEN  the negative-control test drives `holo compat:spike`
  THEN  it asserts non-zero exit + red storage cells, and would itself FAIL if the spike reported green
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres
  MUST_OBSERVE: test passes because `holo compat:spike` exited ≠ 0 with cells.workflow=red && cells.otel=red · MUST_NOT_OBSERVE: test green while spike exited 0

AC-2 Missing-role/capability manifest control has teeth
  GIVEN the fleet loader (compat-3) + fixtures missing embed / a capability (manifest_missing)
  WHEN  the control drives `holo fleet:validate`
  THEN  asserts non-zero exit + named missing field, would FAIL if the loader accepted it
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra
  MUST_OBSERVE: test passes because fleet:validate exited ≠ 0 naming 'embed'/the missing capability · MUST_NOT_OBSERVE: test green while validate exited 0

AC-3 No-silent-cloud control has teeth
  GIVEN the up stack (up_stack) + a network assertion around a normal spike run
  WHEN  the control runs the spike and inspects outbound provider requests
  THEN  asserts cloudRequests===0, would FAIL if any Anthropic/OpenAI request occurred
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet
  MUST_OBSERVE: test passes because cloudRequests===0 and ≥1 request to :4545 · MUST_NOT_OBSERVE: any api.anthropic.com/api.openai.com request

AC-4 Suite green on up-stack, RED on absent-stack (documented RED evidence)
  GIVEN the full negative-control suite
  WHEN  run against the up stack then the absent stack (pg_down + manifest_missing)
  THEN  up-stack ⇒ passes; absent-stack ⇒ targeted controls RED; no *.skip guards
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra
  MUST_OBSERVE: up-stack run passes AND no *.skip on controls AND absent-stack run shows controls failing · MUST_NOT_OBSERVE: any it.skip/test.skip on a negative control, a control that passes regardless of stack state

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- tests/integration/compat-spike.test.ts (MODIFY: add Postgres-down + zero-cloud controls)
- tests/integration/fleet-manifest.test.ts (MODIFY: add incomplete-manifest controls)
- tests/integration/compat-negative-controls.test.ts (NEW, optional aggregation)
writeProhibited: services/platform/src/** (production/service code — RED tests only), services/platform/fleet/manifest.json, services/platform/compat/compatibility-record.json, convex/**, app/**

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:24-27 [PRIMARY PATTERN] — T-PLAT-005/008 pass/fail signatures to assert
2. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:155-158 — T-INFER-001/017 zero-cloud + manifest-fails-closed signatures
3. .spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md:11-31 — compat-lock spike-green + manifest fail-closed (no implicit cloud fallback)
4. tests/integration/research-models.test.ts:1-44 — existing env-gated integration pattern — but do NOT use it.skip to hide controls
5. services/platform/src/cli/holo.ts:1-60 — the real entrypoints + JSON result contract to assert against

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- PG-down control RED-with-teeth: `DATABASE_URL=postgres://127.0.0.1:1/dead pnpm vitest run tests/integration/compat-spike.test.ts -t 'fails closed when Postgres is unreachable'` → Exit 0 (control passes because spike exited non-zero)
- incomplete-manifest control: `pnpm vitest run tests/integration/fleet-manifest.test.ts -t 'blocks incomplete manifest'` → Exit 0
- no skip guards: `! grep -REn 'it\.skip|test\.skip|describe\.skip' tests/integration/compat-spike.test.ts tests/integration/fleet-manifest.test.ts` → Exit 0
- lint → Exit 0

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: each control asserts a concrete failure signature; no skip-to-green; no mocks of @mastra/*/provider/Postgres; RED reproduced against the absent stack. Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: compat-1 (spike entrypoint), compat-3 (fleet loader) · Blocks: compat-5

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "compat-4",
  "tdd_mode": "red_first",
  "verification_policy": { "requires_tests": true, "requires_red_evidence": true, "requires_seeded_evidence": true },
  "fixtures": {
    "up_stack": { "description": "Real Postgres up + fleet started + complete manifest committed", "seed_method": "cli", "records": ["reuse compat-1 real_pg + live_fleet + compat-3 manifest_complete"] },
    "pg_down": { "description": "Postgres-absent control", "seed_method": "cli", "records": ["DATABASE_URL=postgres://127.0.0.1:1/dead"] },
    "manifest_missing": { "description": "manifest missing embed / a capability", "seed_method": "migration_fixture", "records": ["services/platform/tests/fixtures/manifest-missing-embed.json + manifest-missing-timeoutMs.json"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "maps_to_ac": null,
      "description": "GIVEN the spike entrypoint + DATABASE_URL at a dead Postgres WHEN the control drives `holo compat:spike` THEN it asserts non-zero exit + red storage cells and would FAIL if the spike reported green",
      "verify": "DATABASE_URL=postgres://127.0.0.1:1/dead pnpm vitest run tests/integration/compat-spike.test.ts -t 'fails closed when Postgres is unreachable'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "postgres",
        "negative_control": { "would_fail_if": ["the spike swallows the connect error and exits 0", "falls back to in-memory storage"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "pg_down", "action": { "actor": "cli_user", "steps": ["run the control test against a dead DATABASE_URL"] },
          "end_state": { "must_observe": ["test passes because `holo compat:spike` exited != 0 with cells.workflow=red && cells.otel=red"], "must_not_observe": ["test green while spike exited 0"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN the fleet loader + fixtures missing embed/a capability WHEN the control drives `holo fleet:validate` THEN it asserts non-zero exit + named missing field and would FAIL if the loader accepted it",
      "verify": "pnpm vitest run tests/integration/fleet-manifest.test.ts -t 'blocks incomplete manifest'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "mastra",
        "negative_control": { "would_fail_if": ["the loader validates an incomplete manifest green (fails open)"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "manifest_missing", "action": { "actor": "cli_user", "steps": ["run the control test on fleet:validate against the incomplete fixtures"] },
          "end_state": { "must_observe": ["test passes because fleet:validate exited != 0 naming 'embed'/the missing capability"], "must_not_observe": ["test green while validate exited 0"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN the up stack + a network assertion around a normal spike run WHEN the control runs THEN it asserts cloudRequests===0 and would FAIL on any cloud request",
      "verify": "COMPAT_SPIKE=1 pnpm vitest run tests/integration/compat-spike.test.ts -t 'zero cloud on default path'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "litellm-fleet",
        "negative_control": { "would_fail_if": ["a cloud model is bound anywhere on the default path, producing an api.anthropic.com/api.openai.com request"] },
        "evidence": { "artifact_type": "api_response", "required_capture": true },
        "cases": [ { "start_ref": "up_stack", "action": { "actor": "api_client", "steps": ["run spike with a network assertion"] },
          "end_state": { "must_observe": ["test passes because cloudRequests===0 and >=1 request went to :4545"], "must_not_observe": ["any recorded api.anthropic.com/api.openai.com request"] } } ] } },
    { "id": "AC-4", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN the full suite WHEN run against up-stack then absent-stack THEN up-stack passes, absent-stack controls RED, no *.skip guards",
      "verify": "COMPAT_SPIKE=1 pnpm vitest run tests/integration/compat-spike.test.ts tests/integration/fleet-manifest.test.ts && ! grep -REn 'it\\.skip|test\\.skip|describe\\.skip' tests/integration/compat-spike.test.ts tests/integration/fleet-manifest.test.ts",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "mastra",
        "negative_control": { "would_fail_if": ["any control is guarded by it.skip so it neither passes-with-teeth nor fails on an absent stack"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "up_stack", "action": { "actor": "cli_user", "steps": ["run the suite up-stack; scan for skip; run absent-stack"] },
          "end_state": { "must_observe": ["up-stack run passes", "no *.skip guards on the negative controls", "absent-stack run shows the controls failing"], "must_not_observe": ["any it.skip/test.skip on a negative control", "a control that passes regardless of stack state"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Postgres-down control passes only because `holo compat:spike` exited non-zero with red storage cells", "verify": "DATABASE_URL=postgres://127.0.0.1:1/dead pnpm vitest run tests/integration/compat-spike.test.ts -t 'fails closed when Postgres is unreachable'" },
    { "id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "missing-role/capability control passes only because `holo fleet:validate` exited non-zero naming the field", "verify": "pnpm vitest run tests/integration/fleet-manifest.test.ts -t 'blocks incomplete manifest'" },
    { "id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "no-silent-cloud control asserts cloudRequests===0 on a normal run", "verify": "COMPAT_SPIKE=1 pnpm vitest run tests/integration/compat-spike.test.ts -t 'zero cloud on default path'" },
    { "id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "suite passes on up-stack and carries no *.skip guards on negative controls", "verify": "COMPAT_SPIKE=1 pnpm vitest run tests/integration/compat-spike.test.ts tests/integration/fleet-manifest.test.ts && ! grep -REn 'it\\.skip|test\\.skip|describe\\.skip' tests/integration/compat-spike.test.ts tests/integration/fleet-manifest.test.ts" }
  ]
}
-->
</details>
