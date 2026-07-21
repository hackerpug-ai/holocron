# REDHAT-FIX-5 — Add behavioral GREEN and fleet-down fail-closed coverage for the pipeline runtime (H-3)
> Status: Backlog
> Sprint: [Sprint 22 — All Agentic Pipelines as Templates/Agents](./SPRINT.md)
> Agent: mastra-implementer
> Reviewer: mastra-reviewer
> Estimate: 180 min
> Type: FEATURE
> Priority: P0
> Proposed by: mastra-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint-22-20260721T183000Z.md` **H-3** (HIGH; mastra-reviewer Findings 6/7/9 + code-reviewer Gap 5; mcp-reviewer MEDIUM on unhandledRejection)

## Outcome

Sprint 22’s pipeline runtime has a **behavioral GREEN integration suite** (not mere template-existence checks) and a **fleet-DOWN fail-closed test** for `builtin.fleet-probe@1`. Positive pipeline behavior is proven by automated tests against real Postgres+fleet, not only by human-gate logs. When the fleet is unreachable, missions fail closed with `MISSION_FLEET_PROBE_UNAVAILABLE` (or equivalent structured code) instead of soft-completing. The global `unhandledRejection` swallow of `ECONNREFUSED`/`MASTRA_STORAGE` is narrowed so it does not mask fleet-down / infra failures outside an explicit negative-control gate.

**Success state:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts` exits 0 with:
1. GREEN happy-path assertions on fleet-probe UP (pinned role + real endpoint + `fleetManifestVersion` present) and ≥2 pipeline behavioral oracles (concrete field values, not template counts alone);
2. fleet-DOWN run fails closed with `MISSION_FLEET_PROBE_UNAVAILABLE` (non-zero exit / failed status — never soft-completed);
3. `ECONNREFUSED` swallow is env-gated (or otherwise scoped) so the fleet-down test’s failures surface.

## Background

- **Finding (H-3):** Test-integrity gaps — RED suite is existence-checks; no GREEN behavioral integration suite; fleet-degradation untested.
- **Evidence (source at reviewed SHA `72b8eee`):**
  - pipes-4 RED tests (`services/platform/tests/integration/red-*.ts`) assert template-count / documentId presence, not runtime behavior (“template exists”, not “fleet-probe returns a real endpoint” / “mission fails when fleet is down”)
  - Positive behavior is verified mainly by human gate logs (`.gate-evidence/step*.log`), not a durable automated GREEN suite keyed to H-3
  - `services/platform/fleet/manifest.json` declares `degradationAction: "surface-unavailable"` (and embed `fail-closed`) but **no** test exercises fleet-DOWN fail-closed through `builtin.fleet-probe@1`
  - `services/platform/src/mission/runtime.ts:388-405` — fleet-probe throws `MISSION_FLEET_PROBE_UNAVAILABLE` when `probeRoleHealth` is not ok — **path untested**
  - `services/platform/src/cli/holo.ts:37-44` globally swallows `ECONNREFUSED`/`MASTRA_STORAGE` in `unhandledRejection`, masking infra failures outside the PG-down negative-control intent (mcp-reviewer MEDIUM, tied to H-3 integrity)
- **Remediation (from red-hat):** Add behavioral GREEN tests; add fleet-DOWN fail-closed test for `builtin.fleet-probe@1`; stop silently masking infra failures outside negative controls.
- **Out of scope:** C-1 CAP-EMB-01 wire/rescope (REDHAT-FIX-1), C-2 idempotency defaults (REDHAT-FIX-2), H-1 `infer:trace` (REDHAT-FIX-3), H-2 subscriptions bare claims (REDHAT-FIX-4). Do not touch `task/obs-4` or other non-WRITE-ALLOWED surfaces.
- **PRD refs:** UC-SVC-02; CAP-INF-01 (fleet reasoning / probe); SPRINT.md Human Testing Gate (fleet-backed runs).

## Critical Constraints

### MUST
- MUST add a durable GREEN integration suite under `services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts` (NEW) that runs with `PLATFORM_IT=1` against real Postgres + real fleet health probes (no mocked `probeRoleHealth`, no stub fleet)
- MUST assert **behavior**, not mere existence: fleet-probe UP returns concrete `role` + `endpoint` + `fleetManifestVersion`; pipeline happy paths assert concrete output fields (e.g. `documentType: "daily-briefing"`, `headlines.length >= 3`, or `reasoningProvider: "fleet"`)
- MUST add a fleet-DOWN fail-closed case that drives `builtin.fleet-probe@1` against an unreachable fleet endpoint and expects `MISSION_FLEET_PROBE_UNAVAILABLE` (or non-zero exit + failed/blocked status) — never soft-complete with fabricated probe success
- MUST narrow `holo.ts` global `unhandledRejection` swallow so fleet-down / infra failures surface outside an explicit negative-control env flag (e.g. only swallow when `PLATFORM_PG_DOWN_NEG=1` or equivalent)
- MUST capture RED-against-start evidence before GREEN (failing suite or failing fleet-down assertion on current HEAD)

### NEVER
- NEVER treat “template row count == N” or “documentId is non-empty” alone as sufficient GREEN for this task’s primary AC
- NEVER mock `probeRoleHealth`, fleet HTTP, or `STAGE_EXECUTORS['builtin.fleet-probe@1']` in the GREEN/DOWN tests
- NEVER soft-succeed a mission when the pinned fleet role probe fails
- NEVER implement C-1 / C-2 / H-1 / H-2 product work in this task’s commit set
- NEVER touch `task/obs-4` or other non-WRITE-ALLOWED product surfaces

### STRICTLY
- STRICTLY fleet-DOWN: exit ≠ 0 **or** status ∈ `{failed,blocked}` **and** error/code contains `MISSION_FLEET_PROBE_UNAVAILABLE` (or `FLEET_PROBE` / `fleet` + `unavailable`)
- STRICTLY fleet-UP GREEN: probe stage output (or mission JSON) includes `endpoint` matching a real manifest host pattern (`http://` or `https://`) and a non-empty `role` string and a non-empty `fleetManifestVersion` (or equivalent pin fields from `runtime.ts:415-422`)
- STRICTLY ≥2 pipeline behavioral oracles with concrete field anchors (not existence-only)
- STRICTLY integration proof uses real Postgres (`PLATFORM_IT=1`); no mock of `runMissionTemplate` SQL paths

## Specification

**Objective:** Close red-hat H-3 by adding behavioral GREEN integration coverage and fleet-DOWN fail-closed tests for the pipeline runtime’s `builtin.fleet-probe@1` guard path, and by unmasking infra failures outside explicit negative controls.

**Success state:** Automated GREEN suite proves fleet-probe UP + multi-pipeline behavioral oracles; fleet-DOWN proves fail-closed; unhandledRejection swallow is scoped; H-3 is closed without expanding into C-1/C-2/H-1/H-2.

## Capability Chain

- **Touches:** CAP-INF-01 (fleet probe / degradation contract)
- **Provides:** pipeline-runtime-behavioral-green-contract; fleet-probe-fail-closed-contract
- **Consumes:** CAP-INF-01 (fleet health probe)
- **Boundary contracts:**
  - `builtin.fleet-probe@1` → real `probeRoleHealth` (UP success / DOWN fail-closed)
  - CLI `unhandledRejection` → must not mask fleet-down outside explicit neg-control flag

## Acceptance Criteria

### AC-1: GREEN fleet-probe UP returns concrete pinned role + endpoint [PRIMARY]
**GIVEN:** Real Postgres nonprod with system mission templates registered AND the live fleet health endpoint is reachable for a bound role used by `whatsNew` (or any template whose first/guard stage is `builtin.fleet-probe@1`)
**WHEN:** Operator/test runs  
`bun run services/platform/src/cli/holo.ts mission run whatsNew --date 2026-07-20 --json`  
(or equivalent `runMissionTemplate({ templateKey: 'whatsnew', … })` through the real runtime)
**THEN:** Exit code is 0; mission status is `completed`; the fleet-probe stage output (or stage-run row / mission JSON pin fields) includes:
- non-empty `role` string
- `endpoint` matching `^https?://` (real URL, not empty/mock)
- non-empty `fleetManifestVersion` (or `modelRevision` + `litellmModelId` both non-empty as pin substitutes)
AND a `mission_stage_runs` row for the fleet-probe stage has `status = 'completed'` (not skipped/stubbed)
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-1'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** postgres+fleet+cli
**FLOW_REF:** UC-SVC-02
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null

#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "postgres+fleet+cli",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "stub",
      "empty",
      "static",
      "mock",
      "disconnect",
      "template-count-only oracle"
    ]
  },
  "evidence": {
    "artifact_type": "api_response",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "fleet_up_templates_registered",
      "action": {
        "actor": "cli_user",
        "steps": [
          "Ensure system mission templates registered in Postgres",
          "Ensure fleet health probe endpoint is reachable",
          "Run holo mission run whatsNew --date 2026-07-20 --json",
          "Inspect fleet-probe stage output / mission_stage_runs for role+endpoint+fleetManifestVersion"
        ]
      },
      "end_state": {
        "must_observe": [
          "exit code equals 0",
          "status equals \"completed\"",
          "fleet-probe role string length >= 1",
          "fleet-probe endpoint matches https?:// pattern",
          "fleet-probe fleetManifestVersion length >= 1 OR (modelRevision length >= 1 AND litellmModelId length >= 1)",
          "mission_stage_runs fleet-probe status equals \"completed\""
        ],
        "must_not_observe": [
          "empty/start signature: template count only with no endpoint field",
          "endpoint empty or missing",
          "role empty or missing",
          "fleet-probe stage skipped with soft success"
        ]
      }
    }
  ]
}
```

### AC-2: Fleet-DOWN fail-closed on `builtin.fleet-probe@1`
**GIVEN:** Real Postgres with templates registered AND fleet endpoint is forced unreachable for the pinned role (e.g. point role health at `http://127.0.0.1:1` / refuse-all port, or stop the fleet process / inject a per-test manifest with dead `healthProbe` endpoint — **without** mocking the probe executor itself)
**WHEN:** Operator/test runs a fleet-gated mission (e.g. `holo mission run whatsNew --date 2026-07-20 --json` or `runMissionTemplate` for a template that executes `builtin.fleet-probe@1`)
**THEN:** Mission does **not** complete successfully: exit code ≠ 0 **or** status ∈ `{failed,blocked}`; error message/code contains `MISSION_FLEET_PROBE_UNAVAILABLE` (preferred) or clearly names fleet probe unavailability; output must **not** include a fabricated successful probe payload with a real-looking endpoint while fleet is down; artifact `.tmp/sprint-22/redhat-fix-5-fleet-down.json` records `{"ok":false,"code":"MISSION_FLEET_PROBE_UNAVAILABLE","exit":<n>}`
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-2'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** postgres+fleet-down+cli
**FLOW_REF:** UC-SVC-02
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null

#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "postgres+fleet-down+cli",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "static",
      "mock",
      "soft-complete on fleet down"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "fleet_down_dead_endpoint",
      "action": {
        "actor": "cli_user",
        "steps": [
          "Point fleet role health at an unreachable endpoint (127.0.0.1:1 or equivalent) without mocking STAGE_EXECUTORS",
          "Run a fleet-gated mission (whatsNew or equivalent) with --json",
          "Write redhat-fix-5-fleet-down.json with exit/code"
        ]
      },
      "end_state": {
        "must_observe": [
          "exit code != 0 OR status equals \"failed\" OR status equals \"blocked\"",
          "error or code contains substring \"MISSION_FLEET_PROBE_UNAVAILABLE\" OR (\"FLEET_PROBE\" AND \"unavailable\")",
          "redhat-fix-5-fleet-down.json ok equals false"
        ],
        "must_not_observe": [
          "empty/start signature: status equals \"completed\" with exit 0 while fleet is down",
          "fabricated probe endpoint success payload",
          "ok equals true in redhat-fix-5-fleet-down.json"
        ]
      }
    }
  ]
}
```

### AC-3: Multi-pipeline GREEN behavioral oracles (not existence-only)
**GIVEN:** Real Postgres+fleet healthy (same substrate as AC-1)
**WHEN:** Test runs at least two of:
1. `holo mission run whatsNew --date 2026-07-20 --json`
2. `holo mission run report --kind competitive --target example.com --json`  
   (or `shop --query keyboard` / `assimilate --target facebook/react` as substitutes if report is blocked)
**THEN:** For each run: exit 0; **and** concrete behavioral fields hold:
- whatsNew: `output.documentType === "daily-briefing"` **and** `output.headlines.length >= 3`
- business-report (if run): `output.reasoningProvider === "fleet"` **or** role-resolution shows `provider:"fleet"` / `noCloudFallback:true` in stored run JSON **and** at least one non-empty assay/analysis text field length ≥ 8
- shop (if used as substitute): `products.length >= 1` **and** first product has non-null `price` and non-empty `url`
Assertions must **fail** if only template registry counts are checked (tests must call the CLI/runtime and assert output fields)
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-3'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** postgres+fleet+cli
**FLOW_REF:** UC-SVC-02
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null

#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "postgres+fleet+cli",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "stub",
      "empty",
      "static",
      "mock",
      "disconnect",
      "template-count-only"
    ]
  },
  "evidence": {
    "artifact_type": "api_response",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "fleet_up_templates_registered",
      "action": {
        "actor": "cli_user",
        "steps": [
          "Run holo mission run whatsNew --date 2026-07-20 --json",
          "Run holo mission run report --kind competitive --target example.com --json (or shop/assimilate substitute)",
          "Assert concrete output fields (documentType/headlines or reasoningProvider/products)"
        ]
      },
      "end_state": {
        "must_observe": [
          "whatsNew documentType equals \"daily-briefing\"",
          "whatsNew headlines.length >= 3",
          "second pipeline: reasoningProvider equals \"fleet\" OR products.length >= 1 with non-null price OR assimilate patterns.length >= 1"
        ],
        "must_not_observe": [
          "empty/start signature: only mission_templates count asserted",
          "whatsNew headlines length equals 0",
          "documentType missing or not daily-briefing"
        ]
      }
    }
  ]
}
```

### AC-4: `unhandledRejection` ECONNREFUSED swallow is scoped to explicit negative control
**GIVEN:** Current `holo.ts` process-level `unhandledRejection` handler that swallows messages containing `ECONNREFUSED` or `MASTRA_STORAGE`
**WHEN:** Implementer scopes the swallow behind an explicit env flag (e.g. only when `PLATFORM_PG_DOWN_NEG=1` / `HOLO_SWALLOW_STORAGE_REJECTIONS=1`) **or** removes the global swallow and moves it into the PG-down negative-control test harness only
**THEN:**
1. Source shows the swallow is **not** unconditional for all CLI runs (grep proves a gate flag or test-only registration)
2. AC-2 fleet-down run still surfaces a non-zero / failed outcome (swallow does not convert fleet-down into silent success)
3. Artifact `.tmp/sprint-22/redhat-fix-5-unhandled-rejection-scope.json` records `{"scoped":true,"flag":"<name-or-test-only>","fleetDownStillFails":true}`
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-4'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** cli+source
**FLOW_REF:** UC-SVC-02
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null

#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "cli+source",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "stub",
      "empty",
      "static",
      "mock",
      "global unconditional swallow",
      "disconnect masked as success"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "holo_unhandled_rejection_handler",
      "action": {
        "actor": "implementer",
        "steps": [
          "Scope ECONNREFUSED/MASTRA_STORAGE swallow behind env flag or test-only harness",
          "Re-run fleet-down path (AC-2 conditions)",
          "Write redhat-fix-5-unhandled-rejection-scope.json"
        ]
      },
      "end_state": {
        "must_observe": [
          "redhat-fix-5-unhandled-rejection-scope.json scoped equals true",
          "redhat-fix-5-unhandled-rejection-scope.json fleetDownStillFails equals true",
          "redhat-fix-5-unhandled-rejection-scope.json flag length >= 1 OR flag equals \"test-only\"",
          "rg count of unconditional ECONNREFUSED swallow without env gate equals 0"
        ],
        "must_not_observe": [
          "empty/start signature: unconditional process.on('unhandledRejection') swallow with no flag",
          "fleetDownStillFails equals false",
          "scoped equals false",
          "flag empty string"
        ]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | Fleet-probe UP GREEN returns non-empty role and `https?://` endpoint | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-1'` | happy_path |
| TC-2 | Fleet-probe UP GREEN records completed mission_stage_runs for the probe stage | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-1'` | happy_path |
| TC-3 | Fleet-DOWN mission fails with `MISSION_FLEET_PROBE_UNAVAILABLE` (or failed/blocked + fleet probe unavailable) | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-2'` | error_path |
| TC-4 | Fleet-DOWN does not soft-complete with exit 0 / status completed | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-2'` | error_path |
| TC-5 | whatsNew GREEN asserts `documentType: "daily-briefing"` and `headlines.length >= 3` | AC-3 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-3'` | happy_path |
| TC-6 | Second pipeline GREEN asserts concrete behavioral fields (fleet reasoning or products/patterns) | AC-3 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-3'` | happy_path |
| TC-7 | `unhandledRejection` ECONNREFUSED swallow is env-gated or test-only | AC-4 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-4'` | happy_path |
| TC-8 | Fleet-DOWN still fails after swallow scoping | AC-4 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-4'` | error_path |

## Reading List

| Path | Lines / focus |
|---|---|
| `.spec/reviews/red-hat-sprint-22-20260721T183000Z.md` | H-3 (L48–50); recommendations (L72) |
| `SPRINT.md` | Tasks row REDHAT-FIX-5; Human Testing Gate (fleet-backed runs) |
| `services/platform/src/mission/runtime.ts` | `builtin.fleet-probe@1` (~388–423) — `MISSION_FLEET_PROBE_UNAVAILABLE` |
| `services/platform/src/inference/resolve-model.ts` | `probeRoleHealth` |
| `services/platform/fleet/manifest.json` | `degradationAction: "surface-unavailable"` / embed `fail-closed` |
| `services/platform/src/cli/holo.ts` | `unhandledRejection` swallow (~37–44) |
| `services/platform/tests/integration/red-*.ts` | pipes-4 existence-style RED suite (contrast) |
| `services/platform/tests/integration/pipeline-templates.test.ts` | existing pipes-3 GREEN shape tests — **extend/complement, do not delete without replacement** |
| `services/platform/src/mission/registry.ts` | stages using `executorRef: 'builtin.fleet-probe@1'` |

## Guardrails

### WRITE-ALLOWED
- `services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts` (NEW)
- Optional helpers under `services/platform/tests/integration/` (e.g. small fleet-down harness) if needed for dead-endpoint injection **without** mocking executors
- `services/platform/src/cli/holo.ts` (MODIFY — scope `unhandledRejection` swallow only)
- Optional: `services/platform/src/mission/runtime.ts` (MODIFY **only** if fleet-down path needs clearer structured error fields for the test oracle — prefer not changing probe semantics)
- Optional: `services/platform/tests/integration/pipeline-templates.test.ts` (MODIFY only to de-dupe or point at the new suite — do not weaken existing oracles)
- `.tmp/sprint-22/redhat-fix-5-fleet-down.json` (NEW)
- `.tmp/sprint-22/redhat-fix-5-unhandled-rejection-scope.json` (NEW)
- `.tmp/sprint-22/redhat-fix-5-red-evidence.*` (NEW — RED capture)

### WRITE-PROHIBITED
- CAP-EMB-01 wire/rescope — C-1 (REDHAT-FIX-1)
- Default CLI idempotency `Date.now()` formulas — C-2 (REDHAT-FIX-2)
- `infer:trace` implementation — H-1 (REDHAT-FIX-3)
- Standing subscriptions bare `--claims` path — H-2 (REDHAT-FIX-4)
- Other REDHAT-FIX-* / pipes-* task markdown files (except SPRINT.md footnote list update by planner)
- `task/obs-4` and any obs-* task surfaces
- Mocking `probeRoleHealth` / fleet HTTP / STAGE_EXECUTORS to fake GREEN or DOWN outcomes
- Softening `MISSION_FLEET_PROBE_UNAVAILABLE` into a soft success

### Boundaries
- **always:** Prefer real dead-endpoint injection for fleet-down; keep GREEN on live fleet; scope swallow carefully so PG-down negative controls still work if retained
- **ask_first:** Changing fleet manifest defaults for production (tests should use per-test override, not rewrite shared prod manifest permanently)
- **never:** Existence-only GREEN; unconditional global swallow; C-1/C-2/H-1/H-2/obs-4 scope creep

## Design

- **references:** red-hat H-3; `runtime.ts` fleet-probe; `fleet/manifest.json` degradationAction; pipes-4 RED vs missing behavioral GREEN
- **pattern:**
  ```ts
  // AC-2 fleet-down — real unreachable endpoint, not a mocked executor
  const deadManifest = loadManifestWithEndpoint('http://127.0.0.1:1');
  await expectMissionFail({
    templateKey: 'whatsnew',
    date: '2026-07-20',
    fleetManifest: deadManifest,
  }).toMatch(/MISSION_FLEET_PROBE_UNAVAILABLE/);

  // AC-4 — scoped swallow
  process.on('unhandledRejection', (reason) => {
    if (process.env.PLATFORM_PG_DOWN_NEG !== '1') {
      console.error('Unhandled rejection:', reason);
      return;
    }
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (msg.includes('ECONNREFUSED') || msg.includes('MASTRA_STORAGE')) return;
    console.error('Unhandled rejection:', msg);
  });
  ```
- **pattern_source:** `runtime.ts:388-405`; `holo.ts:37-44`; pipes-3 GREEN shape tests for oracle style
- **anti_pattern:** GREEN that only counts template rows; mocking `probeRoleHealth` to return ok/not-ok; leaving unconditional `ECONNREFUSED` swallow; soft-completing when fleet is down

## Agent Assignment

- **implementer:** `mastra-implementer` — owns mission runtime fleet-probe path + CLI unhandledRejection scoping + integration tests
- **reviewer:** `mastra-reviewer` — adversarial check that GREEN is behavioral (not existence), fleet-down is real fail-closed, and swallow scoping does not hide failures
- **proposed_by:** `mastra-planner` — expands SPRINT Tasks table row REDHAT-FIX-5 from H-3 only (user-authorized `/kb-sprint-tasks-plan --only REDHAT-FIX-5` with direct write / no nested specialist fan-out; product code not implemented in this planning pass)

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| AC-1 fleet-probe UP GREEN | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-1'` | Exit 0 |
| AC-2 fleet-DOWN fail-closed | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-2'` | Exit 0 |
| AC-3 multi-pipeline behavioral | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-3'` | Exit 0 |
| AC-4 swallow scope | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-4'` | Exit 0 |
| Full FIX-5 suite | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts` | Exit 0 |
| Source: probe throw present | `rg -n "MISSION_FLEET_PROBE_UNAVAILABLE" services/platform/src/mission/runtime.ts` | Match on fail-closed path |
| Source: swallow scoped | `rg -n "unhandledRejection|ECONNREFUSED|PLATFORM_PG_DOWN_NEG|HOLO_SWALLOW" services/platform/src/cli/holo.ts` | No unconditional bare swallow of ECONNREFUSED without flag |
| Typecheck | `pnpm typecheck` | Exit 0 |
| Scenario contract | `python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py` on this task’s REQUIREMENT-CONTRACT JSON | Exit 0; zero CRITICAL |
| Scope | `git diff --name-only` | Only WRITE-ALLOWED paths |

## Coding Standards

- `brain/docs/TDD-METHODOLOGY.md`
- `brain/docs/kanban/SCENARIO-CONTRACT-V1.md`
- `brain/docs/REQUIREMENT-TRACKING.md`
- `brain/docs/ANTI-STUB-REVIEW.md`
- `brain/docs/TESTING-HIERARCHY.md` (integration-first)

## Dependencies

- **depends_on:** pipes-1, pipes-2, pipes-3, pipes-4, pipes-5 (completed sprint body; fleet-probe + pipeline templates must exist)
- **soft_depends_on:** none required (independent of REDHAT-FIX-1..4 product outcomes; tests assert runtime contracts that already exist for probe throw)
- **blocks:** Honest test integrity for Sprint 22 pipeline runtime; closes H-3 before treating gate logs as sole GREEN proof

## Agent Instructions

1. **RED first:** Write `redhat-fix-5-behavioral-green-fleet-down.test.ts` AC-2 (and any missing AC-1 oracles not already covered) against current HEAD. If fleet-down is currently untested, the new test may fail to compile helpers or fail assertions if soft-success paths exist — capture RED output under `.tmp/sprint-22/redhat-fix-5-red-evidence.*`.
2. **GREEN behavioral suite:** Implement AC-1 + AC-3 oracles against real Postgres+fleet — assert role/endpoint/fleetManifestVersion and multi-pipeline concrete fields. Reuse helpers from `mission-red.helpers.ts` / `pipes-4-red.helpers.ts` where useful; do not replace them with mocks.
3. **Fleet-DOWN:** Inject a dead health endpoint for the pinned role (per-test manifest override or env) **without** mocking `STAGE_EXECUTORS['builtin.fleet-probe@1']`. Expect `MISSION_FLEET_PROBE_UNAVAILABLE`. Write `redhat-fix-5-fleet-down.json`.
4. **Scope unhandledRejection:** Gate the ECONNREFUSED/MASTRA_STORAGE swallow; verify AC-2 still fails closed; write `redhat-fix-5-unhandled-rejection-scope.json`.
5. **REFACTOR:** Optional extract `withDeadFleetEndpoint(fn)` test helper; keep integration tests on real runtime.
6. Do not implement C-1/C-2/H-1/H-2 in this task. Do not touch `task/obs-4`.

## Review Criteria

- Every AC/TC stable; behavioral ACs carry scenarios that pass `validate_scenario`
- GREEN asserts concrete runtime behavior (role/endpoint/output fields), not template existence alone
- Fleet-DOWN is real fail-closed with `MISSION_FLEET_PROBE_UNAVAILABLE` (or equivalent)
- `unhandledRejection` swallow is scoped; fleet-down still surfaces
- Writes only under WRITE-ALLOWED; no C-1/C-2/H-1/H-2/obs-4 scope creep
- H-3 closed

## Notes

- Repro from red-hat: pipes-4 RED is existence-heavy; no automated fleet-down coverage for `builtin.fleet-probe@1`; human gate is the main positive behavioral proof; global ECONNREFUSED swallow can mask infra failures.
- Existing `pipeline-templates.test.ts` already has shape GREEN for whatsNew/shop/assimilate — this task **adds** fleet-probe UP/DOWN integrity and a dedicated H-3 suite; do not delete pipes-3 coverage without equivalent oracles.
- H-3 is about **test integrity**, not re-litigating C-1 scaffold substance. Behavioral oracles here may still accept scaffold gather provenance as long as fleet-probe and stage completion contracts are real.
- Full multi-step human-gate re-attestation is not owned by this task (H-1/H-2 own steps 6/5); this task owns automated GREEN + fleet-down fail-closed.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-5",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fleet_up_templates_registered": {
      "description": "Postgres holocron_nonprod with system mission templates registered (whatsnew/business-report/etc.) and live fleet health probe reachable for the bound role used by fleet-probe stages.",
      "seed_method": "cli",
      "records": [
        "mission_templates contains whatsnew (and at least one second pipeline template)",
        "fleet healthProbe endpoint returns 200 for bound role",
        "PLATFORM_IT=1"
      ]
    },
    "fleet_down_dead_endpoint": {
      "description": "Same Postgres substrate but pinned fleet role health points at an unreachable endpoint (e.g. http://127.0.0.1:1) without mocking STAGE_EXECUTORS or probeRoleHealth internals.",
      "seed_method": "cli",
      "records": [
        "fleet role health endpoint refuses connections or times out",
        "mission templates still registered",
        "no mock of builtin.fleet-probe@1"
      ]
    },
    "holo_unhandled_rejection_handler": {
      "description": "CLI entrypoint services/platform/src/cli/holo.ts currently registers process unhandledRejection; task scopes ECONNREFUSED/MASTRA_STORAGE swallow behind explicit flag or test harness.",
      "seed_method": "public_api",
      "records": [
        "services/platform/src/cli/holo.ts process.on('unhandledRejection') present",
        "target artifact .tmp/sprint-22/redhat-fix-5-unhandled-rejection-scope.json"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN templates registered and fleet UP WHEN holo mission run whatsNew --date 2026-07-20 --json THEN exit 0, status completed, fleet-probe stage returns non-empty role, endpoint matching https?://, fleetManifestVersion length >= 1 (or modelRevision+litellmModelId), mission_stage_runs fleet-probe status completed",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+fleet+cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "static",
            "mock",
            "disconnect",
            "template-count-only oracle"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fleet_up_templates_registered",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Ensure system mission templates registered in Postgres",
                "Ensure fleet health probe endpoint is reachable",
                "Run holo mission run whatsNew --date 2026-07-20 --json",
                "Inspect fleet-probe stage output / mission_stage_runs for role+endpoint+fleetManifestVersion"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code equals 0",
                "status equals \"completed\"",
                "fleet-probe role string length >= 1",
                "fleet-probe endpoint matches https?:// pattern",
                "fleet-probe fleetManifestVersion length >= 1 OR (modelRevision length >= 1 AND litellmModelId length >= 1)",
                "mission_stage_runs fleet-probe status equals \"completed\""
              ],
              "must_not_observe": [
                "empty/start signature: template count only with no endpoint field",
                "endpoint empty or missing",
                "role empty or missing",
                "fleet-probe stage skipped with soft success"
              ]
            }
          }
        ],
        "primary": true
      },
      "unit_test_justified": null
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN fleet health endpoint unreachable WHEN a fleet-gated mission runs THEN exit != 0 OR status failed/blocked with MISSION_FLEET_PROBE_UNAVAILABLE (or FLEET_PROBE unavailable); redhat-fix-5-fleet-down.json ok false; never soft-complete",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+fleet-down+cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "static",
            "mock",
            "soft-complete on fleet down"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fleet_down_dead_endpoint",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Point fleet role health at an unreachable endpoint (127.0.0.1:1 or equivalent) without mocking STAGE_EXECUTORS",
                "Run a fleet-gated mission (whatsNew or equivalent) with --json",
                "Write redhat-fix-5-fleet-down.json with exit/code"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code != 0 OR status equals \"failed\" OR status equals \"blocked\"",
                "error or code contains substring \"MISSION_FLEET_PROBE_UNAVAILABLE\" OR (\"FLEET_PROBE\" AND \"unavailable\")",
                "redhat-fix-5-fleet-down.json ok equals false"
              ],
              "must_not_observe": [
                "empty/start signature: status equals \"completed\" with exit 0 while fleet is down",
                "fabricated probe endpoint success payload",
                "ok equals true in redhat-fix-5-fleet-down.json"
              ]
            }
          }
        ],
        "primary": false
      },
      "unit_test_justified": null
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN fleet UP WHEN whatsNew and a second pipeline run THEN whatsNew documentType daily-briefing and headlines.length >= 3 and second pipeline asserts reasoningProvider fleet OR products.length >= 1 with price OR assimilate patterns.length >= 1 — not template-count-only",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+fleet+cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "static",
            "mock",
            "disconnect",
            "template-count-only"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fleet_up_templates_registered",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run holo mission run whatsNew --date 2026-07-20 --json",
                "Run holo mission run report --kind competitive --target example.com --json (or shop/assimilate substitute)",
                "Assert concrete output fields (documentType/headlines or reasoningProvider/products)"
              ]
            },
            "end_state": {
              "must_observe": [
                "whatsNew documentType equals \"daily-briefing\"",
                "whatsNew headlines.length >= 3",
                "second pipeline: reasoningProvider equals \"fleet\" OR products.length >= 1 with non-null price OR assimilate patterns.length >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: only mission_templates count asserted",
                "whatsNew headlines length equals 0",
                "documentType missing or not daily-briefing"
              ]
            }
          }
        ],
        "primary": false
      },
      "unit_test_justified": null
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN global unhandledRejection swallow WHEN scoped behind env flag or test harness THEN redhat-fix-5-unhandled-rejection-scope.json scoped true and fleetDownStillFails true; no unconditional ECONNREFUSED swallow",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-4'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "cli+source",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "static",
            "mock",
            "global unconditional swallow",
            "disconnect masked as success"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "holo_unhandled_rejection_handler",
            "action": {
              "actor": "implementer",
              "steps": [
                "Scope ECONNREFUSED/MASTRA_STORAGE swallow behind env flag or test-only harness",
                "Re-run fleet-down path (AC-2 conditions)",
                "Write redhat-fix-5-unhandled-rejection-scope.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "redhat-fix-5-unhandled-rejection-scope.json scoped equals true",
                "redhat-fix-5-unhandled-rejection-scope.json fleetDownStillFails equals true",
                "redhat-fix-5-unhandled-rejection-scope.json flag length >= 1 OR flag equals \"test-only\"",
                "rg count of unconditional ECONNREFUSED swallow without env gate equals 0"
              ],
              "must_not_observe": [
                "empty/start signature: unconditional process.on('unhandledRejection') swallow with no flag",
                "fleetDownStillFails equals false",
                "scoped equals false",
                "flag empty string"
              ]
            }
          }
        ],
        "primary": false
      },
      "unit_test_justified": null
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Fleet-probe UP GREEN returns non-empty role and https?:// endpoint",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Fleet-probe UP GREEN records completed mission_stage_runs for the probe stage",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Fleet-DOWN mission fails with MISSION_FLEET_PROBE_UNAVAILABLE (or failed/blocked + fleet probe unavailable)",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Fleet-DOWN does not soft-complete with exit 0 / status completed",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "whatsNew GREEN asserts documentType daily-briefing and headlines.length >= 3",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Second pipeline GREEN asserts concrete behavioral fields (fleet reasoning or products/patterns)",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "unhandledRejection ECONNREFUSED swallow is env-gated or test-only",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "Fleet-DOWN still fails after swallow scoping",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-5-behavioral-green-fleet-down.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    }
  ]
}

-->
