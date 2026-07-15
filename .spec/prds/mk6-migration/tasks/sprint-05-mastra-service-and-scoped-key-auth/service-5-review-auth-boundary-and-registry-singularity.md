# service-5 — Review auth boundary + registry singularity

## What this does

Adversarially validate the scoped-key control plane (401/403/200) and the registry singularity (no duplicate validation), plus Mastra 1.x tripwire coverage at agent/stream call sites — blocking on any stubbed core logic, with curl + grep evidence in the review report.

Provides: review-report, adversarial-validation.

## Why

- The auth boundary and registry singularity are the two UC-PLAT-02 guarantees that, if stubbed, silently break every downstream sprint. An adversarial review with grep/curl evidence is the last gate before Sprint 06+ build on this service.
- This is the SUPREME RULE checkpoint: no fake-success, no static-response claims accepted without command output.
- Grounded in: UC-PLAT-02 (AC-2/AC-3), T-PLAT-006/007, brain/docs/ANTI-STUB-REVIEW.md, AP-7.

## How to verify

- `.spec/reviews/sprint-05-mastra-service-review.md` exists with a verdict line `APPROVED` or `NEEDS_FIXES`.
- The report embeds curl outputs showing HTTP 401 (unkeyed), 403 (wrong-scope), 200 (correct-scope).
- The report embeds grep audits: `grep -rn '.parse\|.safeParse' services/platform/src/` outside the registry, and tripwire-pattern coverage at agent/stream call sites.

## Scope

Writes: `.spec/reviews/sprint-05-mastra-service-review.md (NEW — review report)`.
Prohibited: `services/platform/src/** (no implementation changes in review)` · `tests/** (no test changes in review)`.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: service-5 — Review auth boundary + registry singularity
================================================================================

TASK_TYPE:  REVIEW
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (90 min)
AGENT:      implementer=mastra-reviewer | reviewer=(n/a — review is the deliverable)
PROPOSED-BY: mastra-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: False)
CAPABILITY: CAP-INF-01
SPRINT:     [Sprint 5 — Mastra Service and Scoped-Key Auth](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      (review produces a report; no test suite)
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
A review report at `.spec/reviews/sprint-05-mastra-service-review.md` that adversarially confirms — with curl and grep evidence — unkeyed→401 / wrong-scope→403 / keyed→200, zero duplicate validation layers outside the shared registry, real (non-static) `/health` probes, a fail-closed resolveModel, and Mastra 1.x tripwire coverage at agent/stream call sites.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST validate scoped-key middleware enforces unkeyed→401, wrong-scope→403, keyed→200 (with curl evidence)
- MUST validate no duplicate validation layer exists (grep audit)
- MUST validate `/health` probes are real, not static responses
- MUST validate resolveModel fails closed for unknown/unreachable roles
- MUST validate NO RLS, NO multi-tenant (AP-7 compliance)
- MUST validate Mastra 1.x tripwire handling at agent call sites
- MUST validate TDD evidence (RED→GREEN) for service-1/2/3/4
- MUST produce a review report with an explicit verdict (APPROVED/NEEDS_FIXES)
- NEVER approve without grep audits for duplicate validation
- NEVER approve without checking tripwire coverage at call sites
- NEVER approve without validating /health probes are real
- NEVER approve RLS or multi-tenant patterns (AP-7 violation)
- NEVER approve a stubbed resolveModel or fake fleet endpoints
- STRICTLY the auth boundary must be proven with curl outputs in the report
- STRICTLY registry singularity must be proven with `grep -rn '.parse\|.safeParse'`
- STRICTLY every AC must have captured TDD evidence; the review blocks on any stubbed core logic (SUPREME RULE)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): auth boundary enforcement validated (401/403/200 with curl evidence)
- [x] AC-2: registry singularity validated (grep audit, 0 duplicates)
- [x] AC-3: tripwire coverage validated at agent/stream call sites (grep)
- [ ] the review report carries a verdict line and exists at the scoped path

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (adversarial — every claim backed by command output)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Auth boundary enforcement validated (flow_ref T-PLAT-007)
  GIVEN the scoped-key middleware is implemented (service-3)
  WHEN  the reviewer audits the auth boundary
  THEN  the review confirms unkeyed→401, wrong-scope→403, keyed→200 with curl evidence
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra-service · TDD_STATE: none
  SCENARIO — start_ref: scoped_key_middleware_implemented · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if the review does not test auth with curl; passes without verifying the 401/403/200 gates; accepts static-response claims without evidence; the required object/config is absent or a no-op stub
    MUST_OBSERVE: review report includes curl output: HTTP 401 for unkeyed; review report includes curl output: HTTP 403 for wrong-scope; review report includes curl output: HTTP 200 for correct-scope; report verdict line is `APPROVED` or `NEEDS_FIXES`
    MUST_NOT_OBSERVE: 0 curl outputs in the report (empty); no HTTP 401/403/200 evidence (none); verdict line absent (none)

AC-2 Registry singularity validated (flow_ref T-PLAT-006)
  GIVEN the shared tool registry is implemented (service-2)
  WHEN  the reviewer audits for duplicate validation
  THEN  the review confirms zero duplicate `.parse()`/`.safeParse()` layers outside the registry with grep
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra-service · TDD_STATE: none
  SCENARIO — start_ref: shared_tool_registry_implemented · evidence: stdout
    NEGATIVE_CONTROL: would fail if the review does not run the grep audit; passes without checking for duplicates; accepts a 'no duplicates' claim without evidence; the required object/config is absent or a no-op stub
    MUST_OBSERVE: review report shows `grep '.parse'` returning 0 lines; review report shows `holo verify:no-dup-validation` printing duplicates:0; report verdict line is `APPROVED` or `NEEDS_FIXES`
    MUST_NOT_OBSERVE: grep returns >=1 line (duplicates found); no grep output in report (empty); verdict line absent (none)

AC-3 Tripwire coverage validated at call sites (flow_ref T-PLAT-006)
  GIVEN agents and workflows are implemented with Mastra 1.x patterns
  WHEN  the reviewer audits tripwire handling
  THEN  the review confirms `result.tripwire`/tripwire-chunk handling at agent/stream call sites with grep
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra-service · TDD_STATE: none
  SCENARIO — start_ref: agents_and_workflows_implemented · evidence: stdout
    NEGATIVE_CONTROL: would fail if the review does not check tripwire coverage; passes without a grep for tripwire patterns; accepts a 'tripwire handled' claim without evidence; the required object/config is absent or a no-op stub
    MUST_OBSERVE: review report shows `grep 'result.tripwire'` with >=1 hit at agent call sites; review report shows `grep tripwire` with >=1 hit in stream handlers; report verdict line is `APPROVED` or `NEEDS_FIXES`
    MUST_NOT_OBSERVE: 0 tripwire grep hits (none); no grep output in report (empty); verdict line absent (none)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/reviews/sprint-05-mastra-service-review.md (NEW — review report)
writeProhibited: services/platform/src/** (no implementation changes in review), tests/** (no test changes in review)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. brain/docs/ANTI-STUB-REVIEW.md [anti-stub gate + stub-detection patterns]
2. .spec/prds/mk6-migration/10-technical-requirements/01-architecture-posture.md:35-38 [AP-7 tailnet trust, NO RLS, NO multi-tenant]
3. .spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:43-52 [CAP-INF-01 boundary contracts]
4. .spec/prds/mk6-migration/10-technical-requirements/04-api-design.md:11-34 [Hono route policy + scoped-key control plane]
5. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:24-27 [T-PLAT-006/007 acceptance criteria]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- review-report-exists: `test -f .spec/reviews/sprint-05-mastra-service-review.md` → Exit 0
- review-includes-curl-evidence: `grep -q '401' .spec/reviews/sprint-05-mastra-service-review.md && grep -q '403' .spec/reviews/sprint-05-mastra-service-review.md && grep -q '200' .spec/reviews/sprint-05-mastra-service-review.md` → Exit 0
- review-includes-grep-audit: `grep -q 'parse' .spec/reviews/sprint-05-mastra-service-review.md && grep -q 'tripwire' .spec/reviews/sprint-05-mastra-service-review.md` → Exit 0
- review-has-verdict: `grep -qE 'Verdict.*APPROVED|Verdict.*NEEDS_FIXES' .spec/reviews/sprint-05-mastra-service-review.md` → Exit 0

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer — this task IS the review)
--------------------------------------------------------------------------------
This task produces the adversarial review report for service-1/2/3/4. The report must: prove the 401/403/200 boundary with curl; prove zero duplicate validation with grep; prove real /health probes (stop Postgres → unhealthy); prove fail-closed resolveModel; confirm AP-7 (no RLS/multi-tenant); confirm Mastra 1.x tripwire coverage; confirm RED→GREEN TDD evidence exists. Block (NEEDS_FIXES) on any stubbed core logic.
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: service-1 · service-2 · service-3 · service-4 (all implementations + RED suite complete before review)
Blocks: (none in-sprint; downstream sprints consume the reviewed service)

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "service-5",
  "proposed_by": "mastra-planner",
  "tdd_mode": "skipped",
  "verification_policy": { "requires_tests": false, "requires_red_evidence": false, "requires_seeded_evidence": false },
  "fixtures": {
    "scoped_key_middleware_implemented": { "description": "scoped-key.ts implemented and applied to Hono routes with 3 scopes", "seed_method": "recorded_external", "records": ["scoped-key.ts exists", "applied to Hono routes", "3 scopes (RN/MCP/control) defined"] },
    "shared_tool_registry_implemented": { "description": "registry.ts implemented with tools + getToolSchema", "seed_method": "recorded_external", "records": ["registry exists", "tools registered with schemas", "getToolSchema exported"] },
    "agents_and_workflows_implemented": { "description": "agents/workflows implemented with Mastra 1.x patterns", "seed_method": "recorded_external", "records": ["agents created", "workflows created", "agent.generate()/stream() called"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "flow_ref": "T-PLAT-007", "description": "GIVEN scoped middleware implemented WHEN reviewer audits auth boundary THEN confirms unkeyed->401, wrong-scope->403, keyed->200 with curl evidence", "verify": "review report includes curl command outputs and auth-gate validation", "maps_to_ac": null,
      "scenario": { "tier": "visible", "test_tier": "integration", "verification_service": "mastra-service", "flow_ref": "T-PLAT-007", "negative_control": { "would_fail_if": ["Review does not test auth with curl", "Review passes without verifying 401/403/200 gates", "Review accepts static response claims without evidence", "the required object/config is absent or a no-op stub"] }, "evidence": { "artifact_type": "file_artifact", "required_capture": true }, "cases": [ { "start_ref": "scoped_key_middleware_implemented", "action": { "actor": "mastra-reviewer", "steps": ["curl /api/missions (no key) -> 401", "curl -H RN_KEY /api/missions -> 200", "curl -H MCP_KEY /api/missions -> 403", "document findings"] }, "end_state": { "must_observe": ["review report includes curl output: HTTP 401 for unkeyed", "review report includes curl output: HTTP 403 for wrong-scope", "review report includes curl output: HTTP 200 for correct-scope", "report verdict line is `APPROVED` or `NEEDS_FIXES`"], "must_not_observe": ["0 curl outputs in the report (empty)", "no HTTP 401/403/200 evidence (none)", "verdict line absent (none)"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "flow_ref": "T-PLAT-006", "description": "GIVEN shared registry implemented WHEN reviewer audits duplicates THEN confirms zero .parse()/.safeParse() outside registry with grep", "verify": "review report includes grep audit results", "maps_to_ac": null,
      "scenario": { "tier": "visible", "test_tier": "integration", "verification_service": "mastra-service", "flow_ref": "T-PLAT-006", "negative_control": { "would_fail_if": ["Review does not run grep audit", "Review passes without checking for duplicates", "Review accepts 'no duplicates' claim without evidence", "the required object/config is absent or a no-op stub"] }, "evidence": { "artifact_type": "stdout", "required_capture": true }, "cases": [ { "start_ref": "shared_tool_registry_implemented", "action": { "actor": "mastra-reviewer", "steps": ["grep -rn '.parse\\|.safeParse' services/platform/src/ --exclude-dir=registry", "holo verify:no-dup-validation", "document findings"] }, "end_state": { "must_observe": ["review report shows `grep '.parse'` returning 0 lines", "review report shows `holo verify:no-dup-validation` printing duplicates:0", "report verdict line is `APPROVED` or `NEEDS_FIXES`"], "must_not_observe": ["grep returns >=1 line (duplicates found)", "no grep output in report (empty)", "verdict line absent (none)"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "flow_ref": "T-PLAT-006", "description": "GIVEN agents/workflows implemented WHEN reviewer audits tripwire THEN confirms result.tripwire + tripwire-chunk patterns with grep", "verify": "review report includes grep audit for tripwire patterns", "maps_to_ac": null,
      "scenario": { "tier": "visible", "test_tier": "integration", "verification_service": "mastra-service", "flow_ref": "T-PLAT-006", "negative_control": { "would_fail_if": ["Review does not check tripwire coverage", "Review passes without grep for tripwire patterns", "Review accepts 'tripwire handled' claim without evidence", "the required object/config is absent or a no-op stub"] }, "evidence": { "artifact_type": "stdout", "required_capture": true }, "cases": [ { "start_ref": "agents_and_workflows_implemented", "action": { "actor": "mastra-reviewer", "steps": ["grep -rn 'result.tripwire' services/platform/src/", "grep -rn 'tripwire' services/platform/src/ (stream handlers)", "document findings"] }, "end_state": { "must_observe": ["review report shows `grep 'result.tripwire'` with >=1 hit at agent call sites", "review report shows `grep tripwire` with >=1 hit in stream handlers", "report verdict line is `APPROVED` or `NEEDS_FIXES`"], "must_not_observe": ["0 tripwire grep hits (none)", "no grep output in report (empty)", "verdict line absent (none)"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "description": "Auth boundary is enforced with 401/403/200 gates", "maps_to_ac": "AC-1", "verify": "review report documents curl evidence for all three gates" },
    { "id": "TC-2", "type": "test_criterion", "description": "Registry singularity proven with grep audit", "maps_to_ac": "AC-2", "verify": "review report includes grep -rn '.parse|.safeParse' results" },
    { "id": "TC-3", "type": "test_criterion", "description": "Tripwire coverage validated at call sites", "maps_to_ac": "AC-3", "verify": "review report includes grep for tripwire patterns" }
  ]
}
-->
</details>
