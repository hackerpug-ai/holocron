# compat-5 — Review compatibility lock + fleet manifest

## What this does
Adversarially validates that the compat lock is real (green five-cell spike, dated exact-pin record) and the Fleet Role Manifest fails closed (CAP-INF-01) — approving the Sprint 1 gate only on **reproduced evidence**, never on "all green."

## Why
Per the project's Subagent-Awareness and anti-stub rules, an implementer's completion claim is not evidence. This review reproduces a real green spike + a real PG-down RED, greps for stubbed cells / false-friends / range pins, and confirms no silent cloud path — the last line of defense before the sprint gate.

## How to verify
Reviewer re-runs `holo compat:spike` (5/5 green, no stub patterns in `src/compat`), `holo fleet:validate manifest-missing-embed.json` (blocks) with no cloud import in the resolver default path, and a PG-down `holo compat:spike` (exits non-zero) with no `*.skip` on the controls.

## Scope
Review-only — makes NO source edits; emits a structured verdict as the agent message.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: compat-5 — Review compatibility lock + fleet manifest
================================================================================

TASK_TYPE:  CHORE (review)
STATUS:     Backlog
PRIORITY:   P1
EFFORT:     S  (75 min)
AGENT:      implementer=mastra-reviewer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no   (review; reproduces real evidence — seeded-evidence required)
CAPABILITY: CAP-INF-01 (fail-closed sign-off)
SPRINT:     [Sprint 1](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      pnpm test
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
A structured verdict recording a reproduced 5/5 green spike, a reproduced PG-down RED, confirmed exact pins + dated record, confirmed fail-closed manifest (no silent cloud), confirmed 1.x correctness, and no toothless/skipped controls — or an itemized blocking-findings list.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST reproduce ≥1 real green `holo compat:spike` (5/5 vs real Postgres + fleet) and ≥1 PG-down RED run.
- MUST confirm no stubbed cell (grep for fake-success), CAP-INF-01 fail-closed (resolveModel never binds a cloud model on the default path; startup blocks on an incomplete manifest; every role declares a degradation action), and Mastra 1.x correctness (subpath imports, Observability not `telemetry:{}`, tool `(inputData,context)`, workflow `.commit()`/status narrowing, no `z.any()`).
- MUST confirm exact pins (no `^`/`~`) + committed bun.lock + dated record matching the proven set; negative controls have teeth (no `it.skip`).
- NEVER approve on "tests pass" alone — reproduce the real green + the real RED; NEVER accept a range-pinned dep, a `telemetry:{}` block, or a cloud fallback; NEVER relay an implementer's "pre-existing/out-of-scope" rationalization without verifying it.
- STRICTLY: emit a structured verdict with blocking findings + reproduced-evidence list; review-only, make no source edits.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): compat lock reproduced real (5/5 green), no stubbed cells, versions match record
- [ ] AC-2: manifest fails closed, no silent cloud in the resolver default path
- [ ] AC-3: 1.x correctness + exact-pin discipline (no telemetry/z.any/root-barrel/range)
- [ ] AC-4: negative controls reproduced RED, no skip guards
- [ ] structured verdict emitted with reproduced-evidence list

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Compat lock reproduced real — no stubbed cells
  GIVEN the committed spike + record + full stack (full_stack)
  WHEN  the reviewer runs `holo compat:spike` and greps the harness for fake-success patterns
  THEN  spike exit 0 with 5/5 green, printed versions match the dated record, no cell stubbed
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra
  MUST_OBSERVE: spike exit 0 with 5/5 green AND grep finds zero fake-success patterns in services/platform/src/compat · MUST_NOT_OBSERVE: any ok:true/mock/stub/TODO fake-success, version mismatch vs record

AC-2 Fleet manifest fails closed — no silent cloud
  GIVEN the committed manifest + resolver (full_stack)
  WHEN  the reviewer runs the incomplete-manifest validate and greps the resolver for cloud imports
  THEN  validate blocks the incomplete manifest; the resolver default path has no @ai-sdk/anthropic|openai binding
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra
  MUST_OBSERVE: incomplete manifest ⇒ validate exit ≠ 0 AND no cloud-provider import in resolve-model.ts default path · MUST_NOT_OBSERVE: validate exit 0 on incomplete manifest, a cloud import/binding in the resolver default path

AC-3 1.x correctness + exact-pin discipline
  GIVEN the service source + package.json + record
  WHEN  the reviewer greps for 0.x false-friends and range pins
  THEN  no `telemetry:{}` / `z.any()` / root-barrel import of Agent|createTool|createWorkflow / range pins; Observability + subpath imports + exact pins present
  TEST_TIER: unit · UNIT_TEST_JUSTIFIED: static 1.x-correctness + exact-pin invariants over source/config — grep is the correct oracle; behavioral correctness is covered by compat-1/compat-3 integration ACs.

AC-4 Negative controls have teeth (reproduced RED)
  GIVEN the compat-4 suite + the ability to take Postgres down
  WHEN  the reviewer reproduces the PG-down run and scans for skip guards
  THEN  `holo compat:spike` exits non-zero with Postgres down and no control is guarded by *.skip
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres
  MUST_OBSERVE: PG-down `holo compat:spike` exit ≠ 0 AND grep finds no *.skip on the controls · MUST_NOT_OBSERVE: exit 0 on PG-down, any it.skip/test.skip on a negative control

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- (none — review is read-only; verdict returned as the agent message)
writeProhibited: services/platform/**, tests/**, convex/**, app/**, any source file

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md:11-31 [PRIMARY PATTERN] — the two contracts under review (compat lock + fleet manifest, fail-closed, no implicit cloud)
2. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:24-27 — T-PLAT-005/008 rows to reproduce
3. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:155-158 — T-INFER-017 fail-closed row to reproduce
4. services/platform/compat/compatibility-record.json:1-60 — confirm exact versions + dates + verified combo match the proven set
5. services/platform/fleet/manifest.json:1-120 — confirm every role declares endpoint/model/revision/context/concurrency/timeout/structuredOutput/probe/degradation (+ embed dim/prefix)

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- reproduce green spike + stub grep: `bun services/platform/src/cli/holo.ts compat:spike && ! grep -REn 'return[[:space:]]*\{[[:space:]]*ok:[[:space:]]*true|mock|stub' services/platform/src/compat` → Exit 0
- manifest fail-closed + no cloud import: `bun services/platform/src/cli/holo.ts fleet:validate services/platform/tests/fixtures/manifest-missing-embed.json; test $? -ne 0 && ! grep -REn '@ai-sdk/(anthropic|openai)\b' services/platform/src/fleet/resolve-model.ts` → Exit 0
- 1.x correctness + exact pins: `! grep -REn 'telemetry:\s*\{|z\.any\(' services/platform/src && ! grep -REn "from '@mastra/core'" services/platform/src` → Exit 0
- reproduce PG-down RED: `DATABASE_URL=postgres://127.0.0.1:1/dead bun services/platform/src/cli/holo.ts compat:spike; test $? -ne 0` → Exit 0 (asserts spike exited non-zero)

--------------------------------------------------------------------------------
REVIEW (verdict shape)
--------------------------------------------------------------------------------
{ approved: boolean, blocking_findings: [], evidence_reproduced: ["5/5 green spike", "PG-down RED", "incomplete-manifest block", ...] }

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: compat-1, compat-2, compat-3, compat-4 · Blocks: (sprint gate)

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "compat-5",
  "tdd_mode": "skipped",
  "verification_policy": { "requires_tests": false, "requires_red_evidence": false, "requires_seeded_evidence": true },
  "fixtures": {
    "full_stack": { "description": "Real Postgres up + fleet started + committed manifest + record + suite from compat-1..4", "seed_method": "cli", "records": ["reuse compat-1 real_pg + live_fleet; services/platform manifest.json + compatibility-record.json + bun.lock committed"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "maps_to_ac": null,
      "description": "GIVEN the committed spike + record + full stack WHEN the reviewer runs `holo compat:spike` and greps for fake-success THEN spike exit 0 with 5/5 green, versions match the record, no cell stubbed",
      "verify": "bun services/platform/src/cli/holo.ts compat:spike && ! grep -REn 'return[[:space:]]*\\{[[:space:]]*ok:[[:space:]]*true|TODO|FIXME|mock|stub' services/platform/src/compat",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "mastra",
        "negative_control": { "would_fail_if": ["a cell returns a canned result", "the printed versions diverge from the record"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "full_stack", "action": { "actor": "cli_user", "steps": ["reproduce holo compat:spike; grep services/platform/src/compat for fake-success"] },
          "end_state": { "must_observe": ["spike exit 0 with 5/5 green", "grep finds zero fake-success patterns in services/platform/src/compat"], "must_not_observe": ["any ok:true/mock/stub/TODO fake-success in a cell", "version mismatch vs record"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN the committed manifest + resolver WHEN the reviewer runs the incomplete-manifest validate and greps the resolver THEN validate blocks and the resolver default path has no cloud binding",
      "verify": "bun services/platform/src/cli/holo.ts fleet:validate services/platform/tests/fixtures/manifest-missing-embed.json; test $? -ne 0 && ! grep -REn '@ai-sdk/(anthropic|openai)\\b' services/platform/src/fleet/resolve-model.ts",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "mastra",
        "negative_control": { "would_fail_if": ["validate accepts an incomplete manifest", "the resolver imports a cloud provider on the default path"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "full_stack", "action": { "actor": "cli_user", "steps": ["fleet:validate manifest-missing-embed.json; grep resolve-model.ts"] },
          "end_state": { "must_observe": ["incomplete manifest => validate exit != 0", "no cloud-provider import in resolve-model.ts default path"], "must_not_observe": ["validate exit 0 on incomplete manifest", "a cloud import/binding in the resolver default path"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN the service source + package.json WHEN the reviewer greps for 0.x false-friends and range pins THEN no telemetry:{}/z.any()/root-barrel import/range pins appear",
      "verify": "! grep -REn 'telemetry:\\s*\\{|z\\.any\\(' services/platform/src && ! grep -REn \"from '@mastra/core'\" services/platform/src && ! grep -REn '\"(@mastra/(core|pg|mcp)|ai|@ai-sdk/openai-compatible|zod)\":[[:space:]]*\"[\\^~]' services/platform/package.json" },
    { "id": "AC-4", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN the compat-4 suite WHEN the reviewer reproduces PG-down and scans for skip guards THEN `holo compat:spike` exits non-zero with Postgres down and no control is *.skip-guarded",
      "verify": "DATABASE_URL=postgres://127.0.0.1:1/dead bun services/platform/src/cli/holo.ts compat:spike; test $? -ne 0 && ! grep -REn 'it\\.skip|test\\.skip|describe\\.skip' tests/integration/compat-spike.test.ts tests/integration/fleet-manifest.test.ts",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "postgres",
        "negative_control": { "would_fail_if": ["the spike exits 0 with Postgres down", "a control is it.skip-guarded"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "full_stack", "action": { "actor": "cli_user", "steps": ["reproduce PG-down spike; grep tests for *.skip"] },
          "end_state": { "must_observe": ["PG-down `holo compat:spike` exit != 0", "grep finds no *.skip on the controls"], "must_not_observe": ["exit 0 on PG-down", "any it.skip/test.skip on a negative control"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "reviewer reproduces 5/5 green spike and grep finds no fake-success patterns in the cells", "verify": "bun services/platform/src/cli/holo.ts compat:spike && ! grep -REn 'return[[:space:]]*\\{[[:space:]]*ok:[[:space:]]*true|TODO|FIXME|mock|stub' services/platform/src/compat" },
    { "id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "incomplete manifest blocks and resolver default path has no cloud import", "verify": "bun services/platform/src/cli/holo.ts fleet:validate services/platform/tests/fixtures/manifest-missing-embed.json; test $? -ne 0 && ! grep -REn '@ai-sdk/(anthropic|openai)\\b' services/platform/src/fleet/resolve-model.ts" },
    { "id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "no telemetry:{}/z.any()/root-barrel import/range pins in the service", "verify": "! grep -REn 'telemetry:\\s*\\{|z\\.any\\(' services/platform/src && ! grep -REn \"from '@mastra/core'\" services/platform/src && ! grep -REn '\"(@mastra/(core|pg|mcp)|ai|@ai-sdk/openai-compatible|zod)\":[[:space:]]*\"[\\^~]' services/platform/package.json" },
    { "id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "PG-down spike exits non-zero and no *.skip guards on controls", "verify": "DATABASE_URL=postgres://127.0.0.1:1/dead bun services/platform/src/cli/holo.ts compat:spike; test $? -ne 0 && ! grep -REn 'it\\.skip|test\\.skip|describe\\.skip' tests/integration/compat-spike.test.ts tests/integration/fleet-manifest.test.ts" }
  ]
}
-->
</details>
