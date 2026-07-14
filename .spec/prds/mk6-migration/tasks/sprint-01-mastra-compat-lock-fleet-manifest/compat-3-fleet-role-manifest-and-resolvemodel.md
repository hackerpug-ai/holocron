# compat-3 — Fleet Role Manifest schema, loader, resolveModel skeleton, fail-closed startup validation

## What this does
Delivers the **CAP-INF-01** Fleet Role Manifest: a versioned Zod schema, a loader with fail-closed startup validation, and a `resolveModel(role,{allowEscape})` skeleton that binds live fleet roles to `@ai-sdk/openai-compatible` models and fails closed (never cloud) on any missing role/capability or unreachable role.

## Why
`11-runtime-contracts.md` § Fleet Role Manifest requires every mission to resolve its model roles through a versioned manifest that fails closed for any role that is unreachable or lacks a declared capability — never an implicit cloud fallback (UC-PLAT-02 AC-4, UC-INFER-01 AC-3/AC-4, T-PLAT-008, T-INFER-017).

## How to verify
Against a started fleet, `resolveModel('divergent')`/`resolveModel('convergent')` resolve to live `implementer`/`reviewer` at `:4545`; `holo fleet:validate manifest-missing-embed.json` exits non-zero; an unreachable role yields its declared degradation with zero cloud requests.

## Scope
Creates `services/platform/src/fleet/**`, `services/platform/fleet/manifest.json`, fixture manifests, and `tests/integration/fleet-manifest.test.ts`; adds `holo fleet:validate`. Does NOT wire the full research/chat pipelines (later sprints).

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: compat-3 — Fleet Role Manifest schema, loader, resolveModel skeleton, fail-closed startup validation
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (240 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes
CAPABILITY: CAP-INF-01 (manifest segment)
SPRINT:     [Sprint 1](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      pnpm test
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Loading the complete manifest passes validation; `resolveModel('divergent'|'convergent')` returns live-bound fleet models reachable at `:4545`; a manifest missing a required role/field/capability is rejected at startup; an unreachable role yields its declared degradation and zero cloud requests.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST define a versioned Zod manifest declaring per role (divergent, convergent, judge, embed, rerank): tailnet endpoint, LiteLLM model id, model revision, context limit, concurrency, timeout, structured-output capability, health probe, degradation action — plus embedding dimension + query/document prefix policy for embed.
- MUST validate at startup; a manifest missing any required role/field/capability/timeout-or-concurrency/degradation is REJECTED (fail closed) — T-INFER-017.
- MUST resolve divergent→`implementer`, convergent→`reviewer` to LIVE fleet models via @ai-sdk/openai-compatible at :4545, confirmed by the health probe — T-PLAT-008 / UC-INFER-01 AC-3.
- NEVER return a cloud/Anthropic model as a fallback when a role is unavailable (silent cloud fallback is the cardinal failure this contract prevents); NEVER warn-and-continue on an incomplete manifest; NEVER `z.any()`; NEVER hardcode a provider at a call site; NEVER wire the full research/chat pipelines here (skeleton only).
- STRICTLY: resolveModel returns an AI-SDK v2 model OBJECT; distinguish structural incompleteness (hard block at startup) from complete-but-unreachable (declared degradation for the calling mission); manifest carries an explicit schemaVersion.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): complete manifest validates; divergent/convergent resolve live to implementer/reviewer
- [ ] AC-2: incomplete (missing embed) manifest rejected at load with a typed error
- [ ] AC-3: unreachable role ⇒ declared degradation, zero cloud
- [ ] AC-4: missing capability/timeout/concurrency/degradation blocks startup (T-INFER-017)
- [ ] AC-5: embed role carries 1024-dim + query/document prefix policy
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean; only SCOPE.writeAllowed modified

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED against the incomplete/unreachable manifest first)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Complete manifest validates and resolves divergent+convergent to live fleet models
  GIVEN complete manifest (manifest_complete) + started fleet (implementer+reviewer live)
  WHEN  the loader validates it and resolveModel('divergent')/resolveModel('convergent') run their health probes
  THEN  validation passes; each returns a live-bound @ai-sdk/openai-compatible model whose litellmModelId is implementer/reviewer with a passing :4545 health probe
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet
  SCENARIO — start_ref: manifest_complete+pinned_set+live_fleet · evidence: api_response
    NEGATIVE_CONTROL: would fail if fleet is down / resolveModel returns a stubbed handle / a cloud model is substituted
    MUST_OBSERVE: resolveModel('divergent').litellmModelId==='implementer', resolveModel('convergent').litellmModelId==='reviewer', each health-probe 200 against http://127.0.0.1:4545/v1/models
    MUST_NOT_OBSERVE: a resolved model pointing at api.anthropic.com/api.openai.com, a health probe that never hit :4545

AC-2 Every role field validated; incomplete manifest rejected at load
  GIVEN incomplete manifest missing the embed role (manifest_missing_embed)
  WHEN  the loader validates it via `holo fleet:validate`
  THEN  rejected with a typed ManifestIncompleteError naming the missing role/field, exit non-zero
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra
  MUST_OBSERVE: exit ≠ 0 naming 'embed' (or missing field) via ManifestIncompleteError · MUST_NOT_OBSERVE: exit 0, a warning without a block

AC-3 Unreachable role fails closed to declared degradation — never cloud
  GIVEN complete manifest whose convergent endpoint is unreachable (role_down), allowEscape=false
  WHEN  resolveModel('convergent') runs and a network assertion watches provider requests
  THEN  yields the role's declared degradation (e.g. 'surface-unavailable') and zero Anthropic/OpenAI requests
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet
  MUST_OBSERVE: degradationAction='surface-unavailable' (or RoleUnavailableError) AND cloudRequests===0 · MUST_NOT_OBSERVE: any cloud request, a non-degraded model handle

AC-4 Startup blocked when manifest lacks capability/timeout/concurrency/degradation
  GIVEN manifest variants each dropping one required field (structuredOutput, timeoutMs, concurrency, degradationAction)
  WHEN  `holo fleet:validate` runs against each
  THEN  each is blocked (exit non-zero) naming the missing field — T-INFER-017
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra
  MUST_OBSERVE: all four variants exit ≠ 0 naming the dropped field · MUST_NOT_OBSERVE: any variant exiting 0

AC-5 Embed role carries dimension + query/document prefix policy
  GIVEN complete manifest (manifest_complete)
  WHEN  resolveModel('embed') is inspected
  THEN  embeddingDimension===1024 and a prefix policy applying the query prefix to queries only
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra
  MUST_OBSERVE: resolveModel('embed').embeddingDimension===1024, prefixPolicy.query non-empty while document prefix applied only to documents · MUST_NOT_OBSERVE: embeddingDimension null/wrong, query prefix applied to documents

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/fleet/manifest.schema.ts (NEW), manifest.ts (NEW loader), resolve-model.ts (NEW), validate-manifest.ts (NEW)
- services/platform/fleet/manifest.json (NEW), services/platform/tests/fixtures/manifest-*.json (NEW)
- services/platform/src/cli/holo.ts (MODIFY: add fleet:validate), tests/integration/fleet-manifest.test.ts (NEW)
writeProhibited: services/platform/src/compat/spike.ts (compat-1), services/platform/compat/compatibility-record.json (compat-2), convex/**, app/**, any research/chat pipeline code (later sprints)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md:27-31 [PRIMARY PATTERN] — Fleet Role Manifest per-role fields + fail-closed startup, no implicit cloud fallback
2. .spec/prds/mk6-migration/07-uc-infer.md:20-28 — resolveModel(role,{allowEscape}) via @ai-sdk/openai-compatible :4545; AC-3 divergent/convergent; AC-4 reject on missing role/capability
3. /Users/justinrich/models/RULES.md:15-95 — role→model ground truth: implementer(35B-A3B)=divergent, reviewer(27B)=convergent/judge; :4545; tailnet DNS; degraded/cooldown
4. .spec/prds/mk6-migration/04-uc-plat.md:40-42 — UC-PLAT-02 AC-4 resolve every role to a live endpoint, fail closed when a capability is absent
5. services/platform/src/mastra.ts:1-40 — compat-1 scaffold + openai-compatible fleet binding to extend

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- live role resolution vs started fleet: `COMPAT_SPIKE=1 pnpm vitest run tests/integration/fleet-manifest.test.ts` → Exit 0
- incomplete manifest blocked: `bun services/platform/src/cli/holo.ts fleet:validate services/platform/tests/fixtures/manifest-missing-embed.json; test $? -ne 0` → Exit 0
- no z.any in schema: `! grep -REn 'z\.any\(' services/platform/src/fleet` → Exit 0
- no cloud import in resolver default path: `! grep -REn '@ai-sdk/(anthropic|openai)\b' services/platform/src/fleet/resolve-model.ts` → Exit 0
- typecheck/lint → Exit 0
- Gate 8 (un-fakeable PRIMARY): AC-1 watched RED (fleet down / stubbed resolve) before green; api_response evidence shows the live litellmModelId + :4545 probe.

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: fail-closed on incomplete manifest (not warn); resolveModel never binds a cloud model on the default path; each role declares a degradation action; no z.any(); RED evidence present. Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: compat-1 (mastra scaffold + fleet binding) · Blocks: compat-4, compat-5

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "compat-3",
  "tdd_mode": "red_first",
  "verification_policy": { "requires_tests": true, "requires_red_evidence": true, "requires_seeded_evidence": true },
  "fixtures": {
    "manifest_complete": { "description": "All 5 roles fully declared; divergent->implementer, convergent->reviewer, judge->reviewer at :4545, embed->qwen3-embedding (1024-dim + prefix policy), rerank->qwen3-reranker, each with revision/context/concurrency/timeout/structuredOutput/healthProbe/degradationAction", "seed_method": "cli", "records": ["write services/platform/fleet/manifest.json; fleet-start; curl :4545/v1/models lists implementer,reviewer"] },
    "manifest_missing_embed": { "description": "Incomplete manifest with the embed role omitted (+ a variant omitting convergent.timeoutMs)", "seed_method": "migration_fixture", "records": ["services/platform/tests/fixtures/manifest-missing-embed.json"] },
    "role_down": { "description": "Complete manifest but the convergent(reviewer) endpoint unreachable", "seed_method": "cli", "records": ["manifest_complete with reviewer endpoint at http://127.0.0.1:1/v1 (or coder-stop)"] },
    "pinned_set": { "description": "services/platform installed under Bun with the pinned Mastra 1.x set", "seed_method": "cli", "records": ["cd services/platform && bun install"] },
    "live_fleet": { "description": "LiteLLM :4545 with implementer+reviewer loaded", "seed_method": "cli", "records": ["fleet-start; curl :4545/v1/models"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "maps_to_ac": null,
      "description": "GIVEN complete manifest + started fleet WHEN loader validates and resolveModel('divergent')/('convergent') probe THEN each resolves live to implementer/reviewer with a passing :4545 health probe",
      "verify": "COMPAT_SPIKE=1 pnpm vitest run tests/integration/fleet-manifest.test.ts -t 'resolves live divergent and convergent'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "litellm-fleet",
        "negative_control": { "would_fail_if": ["fleet down", "resolveModel returns a stubbed/static handle", "a cloud model substituted"] },
        "evidence": { "artifact_type": "api_response", "required_capture": true },
        "cases": [ { "start_ref": "manifest_complete", "action": { "actor": "api_client", "steps": ["resolveModel('divergent'); resolveModel('convergent'); run health probes"] },
          "end_state": { "must_observe": ["resolveModel('divergent').litellmModelId==='implementer'", "resolveModel('convergent').litellmModelId==='reviewer'", "health probe 200 against http://127.0.0.1:4545/v1/models"], "must_not_observe": ["a model pointing at api.anthropic.com/api.openai.com", "a probe that never hit :4545"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN a manifest missing the embed role WHEN `holo fleet:validate` runs THEN rejected with ManifestIncompleteError naming the missing role, exit non-zero",
      "verify": "bun services/platform/src/cli/holo.ts fleet:validate services/platform/tests/fixtures/manifest-missing-embed.json; test $? -ne 0",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "mastra",
        "negative_control": { "would_fail_if": ["the loader accepts or warns-and-continues on a manifest missing a required role/field"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "manifest_missing_embed", "action": { "actor": "cli_user", "steps": ["holo fleet:validate manifest-missing-embed.json"] },
          "end_state": { "must_observe": ["exit != 0", "names the missing role 'embed' via ManifestIncompleteError"], "must_not_observe": ["exit 0", "a warning without a block"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN a complete manifest with convergent unreachable + allowEscape=false WHEN resolveModel('convergent') runs THEN it yields the declared degradation and zero cloud requests",
      "verify": "COMPAT_SPIKE=1 pnpm vitest run tests/integration/fleet-manifest.test.ts -t 'fails closed, no cloud'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "litellm-fleet",
        "negative_control": { "would_fail_if": ["resolveModel silently returns a cloud model", "hangs", "ignores the declared degradation"] },
        "evidence": { "artifact_type": "api_response", "required_capture": true },
        "cases": [ { "start_ref": "role_down", "action": { "actor": "api_client", "steps": ["resolveModel('convergent') with reviewer endpoint dead"] },
          "end_state": { "must_observe": ["degradationAction='surface-unavailable' (or RoleUnavailableError)", "cloudRequests===0"], "must_not_observe": ["any api.anthropic.com/api.openai.com request", "a non-degraded model handle"] } } ] } },
    { "id": "AC-4", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN manifest variants each dropping one capability field WHEN `holo fleet:validate` runs THEN each is blocked (exit non-zero) naming the missing field (T-INFER-017)",
      "verify": "for f in structuredOutput timeoutMs concurrency degradationAction; do bun services/platform/src/cli/holo.ts fleet:validate services/platform/tests/fixtures/manifest-missing-$f.json; test $? -ne 0 || exit 1; done",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "mastra",
        "negative_control": { "would_fail_if": ["any missing-capability variant validates green (fails open)"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "manifest_missing_embed", "action": { "actor": "cli_user", "steps": ["validate each of manifest-missing-{structuredOutput,timeoutMs,concurrency,degradationAction}.json"] },
          "end_state": { "must_observe": ["all four variants exit != 0 naming the dropped field"], "must_not_observe": ["any variant exiting 0"] } } ] } },
    { "id": "AC-5", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN the complete manifest WHEN resolveModel('embed') is inspected THEN embeddingDimension===1024 and a query-only prefix policy",
      "verify": "COMPAT_SPIKE=1 pnpm vitest run tests/integration/fleet-manifest.test.ts -t 'embed dimension and prefix policy'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "mastra",
        "negative_control": { "would_fail_if": ["embed lacks dimension", "the query prefix is applied to documents too (asymmetry lost)"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "manifest_complete", "action": { "actor": "api_client", "steps": ["inspect resolveModel('embed')"] },
          "end_state": { "must_observe": ["embeddingDimension===1024", "prefixPolicy.query non-empty; document prefix applied only to documents"], "must_not_observe": ["embeddingDimension null/wrong", "query prefix applied to documents"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "against a started fleet, resolveModel divergent->implementer & convergent->reviewer with passing :4545 probes", "verify": "COMPAT_SPIKE=1 pnpm vitest run tests/integration/fleet-manifest.test.ts -t 'resolves live divergent and convergent'" },
    { "id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "`holo fleet:validate` rejects a manifest missing embed with ManifestIncompleteError, non-zero exit", "verify": "bun services/platform/src/cli/holo.ts fleet:validate services/platform/tests/fixtures/manifest-missing-embed.json; test $? -ne 0" },
    { "id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "unreachable convergent yields declared degradation, zero cloud requests", "verify": "COMPAT_SPIKE=1 pnpm vitest run tests/integration/fleet-manifest.test.ts -t 'fails closed, no cloud'" },
    { "id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "each missing-capability variant blocks startup", "verify": "for f in structuredOutput timeoutMs concurrency degradationAction; do bun services/platform/src/cli/holo.ts fleet:validate services/platform/tests/fixtures/manifest-missing-$f.json; test $? -ne 0 || exit 1; done" },
    { "id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "embed role exposes 1024-dim + query-only prefix policy", "verify": "COMPAT_SPIKE=1 pnpm vitest run tests/integration/fleet-manifest.test.ts -t 'embed dimension and prefix policy'" }
  ]
}
-->
</details>
