# REDHAT-FIX-2 — Make default CLI idempotency keys deterministic for equivalent pipeline requests (C-2)
> Status: Backlog
> Sprint: [Sprint 22 — All Agentic Pipelines as Templates/Agents](./SPRINT.md)
> Agent: mastra-implementer
> Reviewer: mastra-reviewer
> Estimate: 120 min
> Type: FEATURE
> Priority: P0
> Proposed by: mastra-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint-22-20260721T183000Z.md` **C-2** (CRITICAL; code-reviewer + orchestrator-reproduced)

## Outcome

CLI default idempotency keys for mission pipeline entry points are a pure function of template identity + operator params (no wall-clock entropy), so retries and equivalent requests reuse the runtime’s existing dedup path instead of always creating a new `mission_runs` row.

**Success state:** Running the same `holo mission run <pipeline>` twice **without** `--idempotency-key` (and without any explicit uniqueness opt-in) yields the **same** default key and the **same** `runId` / replay path. Timestamped uniqueness is available only behind an explicit opt-in flag. `MISSION_IDEMPOTENCY_CONFLICT` remains reachable when the same key is reused with differing args.

## Background

- **Finding (C-2):** Default idempotency keys embed `Date.now()`, defeating dedup on every CLI entry point.
- **Evidence (source at reviewed SHA `72b8eee`):**
  - `services/platform/src/cli/holo.ts:3909` — research/deepResearch/subscriptions-research/fulcrum: `` `${instantiation}:${goal}:${components ?? 'default'}:${Date.now()}` ``
  - `holo.ts:3947` — whatsNew: `` `whatsnew:${date}:${Date.now()}` ``
  - `holo.ts:3992` — assimilate: `` `assimilate:${target}:${Date.now()}` ``
  - `holo.ts:4038` — shop: `` `shop:${query}:${Date.now()}` ``
  - `holo.ts:4072` — subscriptions: `` `subscriptions:${topic}:${Date.now()}` ``
  - `holo.ts:4146` — report: `` `report:${reportKind}:${subject}:${Date.now()}` ``
- **Runtime is correct:** `runtime.ts` `createMissionRun` SELECT/ON CONFLICT on `(template_key, idempotency_key)` and throws `MISSION_IDEMPOTENCY_CONFLICT` when args diverge — but defaults make every CLI call unique, so conflict/dedup is unreachable by default. Gate logs showed keys like `whatsnew:2026-07-20:1784656064046`.
- **Fix (from red-hat):** default key = deterministic identity of template+params (`whatsnew:${date}`, `report:${kind}:${subject}`, …); timestamp suffix only behind an explicit opt-in flag.
- **Out of scope:** C-1 (retrieval/scaffold — REDHAT-FIX-1), H-1 (`infer:trace` — REDHAT-FIX-3), H-2 (subscriptions claims — REDHAT-FIX-4), H-3 (GREEN suite breadth — REDHAT-FIX-5). Do not rewire gather stages or CAP-EMB claims here.
- **PRD refs:** UC-SVC-02; mission engine durability (Sprint 15) composed by Sprint 22 pipelines.

## Critical Constraints

### MUST
- MUST default every Sprint-22 mission CLI entry point’s idempotency key to a **deterministic** function of template identity + required operator params (no `Date.now()`, no `randomUUID()`, no process pid) when neither `--idempotency-key` nor the uniqueness opt-in is set
- MUST preserve explicit `--idempotency-key <value>` as the highest-precedence override (trimmed non-empty string wins)
- MUST provide exactly one documented uniqueness opt-in (recommended name: `--fresh`) that appends a unique suffix only when that flag is present — never by default
- MUST prove double-invoke without override returns the same `runId` against real Postgres (integration, not unit-only)

### NEVER
- NEVER leave `Date.now()` (or equivalent wall-clock / random entropy) in the **default** key expression for research / whatsNew / assimilate / shop / subscriptions / report
- NEVER change runtime conflict semantics (`MISSION_IDEMPOTENCY_CONFLICT` when same key + different args) as a “fix” for defaults
- NEVER implement C-1/H-1/H-2/H-3 work in this task’s commit set

### STRICTLY
- STRICTLY default keys MUST match the identity tables below (or a documented equivalent pure function of the same fields — no extra entropy):
  | CLI surface | Default key (no override, no `--fresh`) |
  |---|---|
  | `mission run research\|deepResearch\|…` | `${instantiation}:${goal}:${components\|\|'default'}` |
  | `mission run whatsNew` | `whatsnew:${date}` |
  | `mission run assimilate` | `assimilate:${target}` |
  | `mission run shop` | `shop:${query}` |
  | `mission run subscriptions` | `subscriptions:${topic}` |
  | `mission run report` | `report:${reportKind}:${subject}` |
- STRICTLY source audit: `rg "Date\\.now\\(\\)" services/platform/src/cli/holo.ts` on default-key lines in the six mission `run` handlers MUST be empty for those default expressions (opt-in `--fresh` path may use `Date.now()` or `randomUUID()` **only** after the flag check)
- STRICTLY integration proof uses real Postgres (`PLATFORM_IT=1`); no mock of `createMissionRun` / SQL

## Specification

**Objective:** Close red-hat C-2 by making CLI default idempotency keys deterministic so the existing runtime dedup path is exercised by normal operator retries.

**Success state:** Equivalent CLI invocations without `--idempotency-key` share one key and one `mission_runs` row; uniqueness requires an explicit opt-in; source defaults no longer embed wall-clock entropy.

## Capability Chain

- **Touches:** N/A (Sprint 22 Capability Coverage is N/A; this is a CLI contract fix over the Sprint 15 mission engine)
- **Provides:** deterministic-cli-idempotency-defaults
- **Consumes:** mission-runtime idempotency / ON CONFLICT path
- **Boundary contracts:**
  - CLI default key → `createMissionRun(template_key, idempotency_key)` dedup
  - explicit `--idempotency-key` / `--fresh` override precedence

## Acceptance Criteria

### AC-1: Default whatsNew double-invoke reuses the same run [PRIMARY]
**GIVEN:** Real Postgres nonprod with the `whatsnew` mission template registered AND no pre-existing `mission_runs` row for template_key `whatsnew` with idempotency_key exactly `whatsnew:2026-07-20`
**WHEN:** Operator runs twice, 100–500ms apart, **without** `--idempotency-key` and **without** uniqueness opt-in:
1. `bun run services/platform/src/cli/holo.ts mission run whatsNew --date 2026-07-20 --json`
2. the identical command again
**THEN:** Both JSON payloads report the same `idempotencyKey` equal to the literal `whatsnew:2026-07-20` (no trailing `:` + digits), and both report the **same** `runId` (second call is replay/dedup, not a second insert); `SELECT count(*) FROM mission_runs WHERE template_key = 'whatsnew' AND idempotency_key = 'whatsnew:2026-07-20'` equals `1`
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-1'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** postgres+cli
**FLOW_REF:** UC-SVC-02
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null

#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "postgres+cli",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "empty", "static", "mock", "Date.now default key", "disconnect"] },
  "evidence": { "artifact_type": "api_response", "required_capture": true },
  "cases": [
    {
      "start_ref": "whatsnew_template_clean_key",
      "action": {
        "actor": "cli_user",
        "steps": [
          "Ensure no mission_runs row for whatsnew / whatsnew:2026-07-20",
          "Run holo mission run whatsNew --date 2026-07-20 --json (no --idempotency-key, no --fresh)",
          "Run the identical command a second time",
          "Compare idempotencyKey and runId; count mission_runs rows for that key"
        ]
      },
      "end_state": {
        "must_observe": [
          "idempotencyKey equals literal whatsnew:2026-07-20 on both responses",
          "runId equality: first.runId === second.runId",
          "mission_runs count for template_key whatsnew and idempotency_key whatsnew:2026-07-20 equals 1"
        ],
        "must_not_observe": [
          "empty/start signature: two distinct runId values for the same default key",
          "idempotencyKey matching regex whatsnew:2026-07-20:[0-9]{10,}",
          "mission_runs count >= 2 for whatsnew:2026-07-20"
        ]
      }
    }
  ]
}
```

### AC-2: Explicit `--idempotency-key` override and `--fresh` uniqueness opt-in
**GIVEN:** Real Postgres with `whatsnew` template registered
**WHEN:** Operator runs:
1. `… mission run whatsNew --date 2026-07-20 --idempotency-key operator-fixed-key-c2 --json` twice → same `runId`
2. `… mission run whatsNew --date 2026-07-20 --fresh --json` twice (or equivalent documented uniqueness flag) → two **different** `runId`s and keys that are **not** equal to the bare default `whatsnew:2026-07-20`
**THEN:** Override path honors the operator key exactly (`operator-fixed-key-c2`); uniqueness opt-in produces distinct runs/keys; bare default path remains deterministic when neither flag is set
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-2'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** postgres+cli
**FLOW_REF:** UC-SVC-02
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null

#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "postgres+cli",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "empty", "static", "mock", "override ignored", "disconnect"] },
  "evidence": { "artifact_type": "api_response", "required_capture": true },
  "cases": [
    {
      "start_ref": "whatsnew_template_registered",
      "action": {
        "actor": "cli_user",
        "steps": [
          "Run whatsNew twice with --idempotency-key operator-fixed-key-c2",
          "Run whatsNew twice with uniqueness opt-in (--fresh) and no --idempotency-key",
          "Compare keys and runIds"
        ]
      },
      "end_state": {
        "must_observe": [
          "override path: idempotencyKey equals operator-fixed-key-c2 on both runs",
          "override path: first.runId === second.runId",
          "fresh path: first.runId !== second.runId",
          "fresh path: neither key equals bare whatsnew:2026-07-20"
        ],
        "must_not_observe": [
          "empty/start signature: --idempotency-key ignored (key still whatsnew:2026-07-20)",
          "fresh path: both runIds identical",
          "override path: two distinct runIds for the same operator-fixed-key-c2"
        ]
      }
    }
  ]
}
```

### AC-3: All six default key formulas are deterministic (no wall-clock suffix)
**GIVEN:** Working tree after the fix (or the integration harness that exercises key construction via CLI JSON output / exported helper)
**WHEN:** For each of the six surfaces, the default key is observed for fixed params (research goal `c2-goal` components `2`; whatsNew date `2026-07-20`; assimilate target `acme/widget`; shop query `keyboard`; subscriptions topic `c2-topic`; report kind `competitive` subject `example.com`) **without** override/opt-in
**THEN:** Observed keys equal exactly:
- research: `research:c2-goal:2`
- whatsNew: `whatsnew:2026-07-20`
- assimilate: `assimilate:acme/widget`
- shop: `shop:keyboard`
- subscriptions: `subscriptions:c2-topic`
- report: `report:competitive:example.com`  
and **none** match `/:\\d{10,}$/` (trailing unix-ms style suffix)
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-3'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** postgres+cli
**FLOW_REF:** UC-SVC-02
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null

#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "postgres+cli",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "static", "empty", "mock", "Date.now default", "disconnect"] },
  "evidence": { "artifact_type": "api_response", "required_capture": true },
  "cases": [
    {
      "start_ref": "six_pipeline_cli_surfaces",
      "action": {
        "actor": "cli_user",
        "steps": [
          "Invoke each of the six mission run surfaces once with fixed params and no --idempotency-key / no --fresh",
          "Collect idempotencyKey from each JSON (or unit helper that mirrors CLI defaults used by holo.ts)",
          "Assert exact string equality to the six expected defaults"
        ]
      },
      "end_state": {
        "must_observe": [
          "research key equals research:c2-goal:2",
          "whatsnew key equals whatsnew:2026-07-20",
          "assimilate key equals assimilate:acme/widget",
          "shop key equals shop:keyboard",
          "subscriptions key equals subscriptions:c2-topic",
          "report key equals report:competitive:example.com"
        ],
        "must_not_observe": [
          "empty/start signature: any default key matching /:[0-9]{10,}$/",
          "any default key containing substring Date.now",
          "research key still ending with a millisecond timestamp"
        ]
      }
    }
  ]
}
```

### AC-4: Source audit — default-key lines no longer call `Date.now()` without opt-in guard
**GIVEN:** Working tree after the fix commit
**WHEN:** Reviewer audits `services/platform/src/cli/holo.ts` mission `run` handlers for research/whatsNew/assimilate/shop/subscriptions/report
**THEN:** Every default key assignment is free of unguarded `Date.now()` / `randomUUID()`; any entropy appears only inside an `if (args.fresh)` (or equivalent documented flag) branch; a static grep of default-key construction for those six handlers does not match `` `...${Date.now()}` `` style templates
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-4'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** source-audit+cli
**FLOW_REF:** UC-SVC-02
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null

#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "source-audit+cli",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "static", "empty", "mock", "docs-only claim", "disconnect"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "post_fix_cli_source",
      "action": {
        "actor": "reviewer",
        "steps": [
          "Read mission run handlers in services/platform/src/cli/holo.ts for the six pipelines",
          "Assert default key templates lack Date.now()/randomUUID()",
          "Assert any Date.now() is only under an explicit uniqueness flag branch",
          "Run AC-4 vitest"
        ]
      },
      "end_state": {
        "must_observe": [
          "default key assignment count for six surfaces equals 6",
          "unguarded Date.now() in those default assignments equals 0",
          "AC-4 vitest exit code 0"
        ],
        "must_not_observe": [
          "empty/start signature: `:${Date.now()}` still present on whatsNew default key line",
          "all six surfaces still concatenating Date.now() into defaults",
          "entropy used without a fresh/unique flag guard"
        ]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | Two default whatsNew runs for date `2026-07-20` share `idempotencyKey` `whatsnew:2026-07-20` and the same `runId` with mission_runs count = 1 | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-1'` | happy_path |
| TC-2 | `--idempotency-key operator-fixed-key-c2` is honored and double-invoke reuses that run | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-2'` | boundary |
| TC-3 | Uniqueness opt-in (`--fresh`) produces two distinct runIds and keys ≠ `whatsnew:2026-07-20` | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-2'` | boundary |
| TC-4 | All six pipeline default keys equal the deterministic formulas with zero trailing ms suffixes | AC-3 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-3'` | happy_path |
| TC-5 | Source audit finds zero unguarded `Date.now()` on the six default-key assignments | AC-4 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-4'` | happy_path |

## Reading List

| Path | Lines / focus |
|---|---|
| `.spec/reviews/red-hat-sprint-22-20260721T183000Z.md` | C-2 (lines 34–40) — finding + fix guidance |
| `services/platform/src/cli/holo.ts` | ~3907–4146 — six default key sites; flag parse ~543–545 for `--idempotency-key` |
| `services/platform/src/mission/runtime.ts` | `createMissionRun` / `MISSION_IDEMPOTENCY_CONFLICT` (~2112–2266) — correct runtime to exercise |
| `services/platform/tests/integration/pipeline-templates.test.ts` | existing CLI spawn patterns (today force unique keys via `--idempotency-key` + `Date.now()`) |
| `services/platform/tests/integration/red-whatsnew.test.ts` | whatsNew CLI invocation helper |
| `services/platform/src/cli/holo.ts` | `printMissionRuntimeResult` — surfaces `idempotencyKey` in human output; JSON path returns runtime result fields |

## Guardrails

### WRITE-ALLOWED
- `services/platform/src/cli/holo.ts` (MODIFY — default key formulas + uniqueness opt-in flag parse/help)
- `services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts` (NEW)
- `services/platform/tests/integration/helpers/**` (MODIFY only if a shared CLI-spawn helper is needed for double-invoke)
- Optional pure helper extract **only if** co-located and imported by `holo.ts`, e.g. `services/platform/src/cli/mission-idempotency-key.ts` (NEW) — keep defaults single-sourced

### WRITE-PROHIBITED
- `services/platform/src/mission/runtime.ts` — runtime idempotency is already correct; do not “fix” C-2 by weakening conflict checks
- `services/platform/src/mission/templates/**` — C-1 / gather scope (REDHAT-FIX-1)
- `services/platform/src/search/**` — CAP-EMB-01 (out of scope)
- Other REDHAT-FIX-* task files and product fixes for H-1/H-2/H-3
- `services/platform/tests/integration/pipeline-templates.test.ts` — only touch if a default-key assertion must be added **and** it is listed in WRITE-ALLOWED after review; prefer the dedicated redhat-fix-2 test file

### Boundaries
- **always:** Prefer a small pure `defaultMissionIdempotencyKey(surface, params)` helper so tests can assert formulas without full mission execution for AC-3, while AC-1/AC-2 still hit real Postgres
- **ask_first:** Renaming the uniqueness flag away from `--fresh`; changing runtime unique constraint semantics
- **never:** Reintroduce wall-clock defaults; implement retrieval / infer:trace / subscriptions claims work here

## Design

- **references:** red-hat C-2; `holo.ts` default key sites; `runtime.ts` `createMissionRun`
- **pattern:**  
  ```ts
  function defaultMissionIdempotencyKey(
    kind: 'research' | 'whatsnew' | 'assimilate' | 'shop' | 'subscriptions' | 'report',
    params: { /* surface fields */ },
    opts?: { fresh?: boolean; override?: string | null }
  ): string {
    if (opts?.override?.trim()) return opts.override.trim();
    const base = /* pure formula from STRICTLY table */;
    if (opts?.fresh) return `${base}:${Date.now()}`; // entropy ONLY here
    return base;
  }
  ```
- **pattern_source:** red-hat C-2 expected defaults + existing `--idempotency-key` parse in `holo.ts:543-545`
- **anti_pattern:** `` `whatsnew:${date}:${Date.now()}` `` as the unconditional default (current code); testing uniqueness by deleting the runtime unique index

## Agent Assignment

- **implementer:** `mastra-implementer` — owns platform CLI + mission entry points
- **reviewer:** `mastra-reviewer` — adversarial check that defaults are deterministic and opt-in uniqueness is explicit
- **proposed_by:** `mastra-planner` — expands SPRINT Tasks table row REDHAT-FIX-2 from C-2 only (user-authorized `/kb-sprint-tasks-plan --only REDHAT-FIX-2`; no nested specialist fan-out; product code not implemented in this planning pass)

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| AC-1 dedup | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-1'` | Exit 0 |
| AC-2 override/fresh | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-2'` | Exit 0 |
| AC-3 six formulas | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-3'` | Exit 0 |
| AC-4 source audit | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-4'` | Exit 0 |
| Full FIX-2 suite | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts` | Exit 0 |
| Typecheck | `pnpm typecheck` | Exit 0 |
| Scenario contract | `python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py` on this task’s REQUIREMENT-CONTRACT JSON | Exit 0; zero CRITICAL |
| Scope | `git diff --name-only` | Only WRITE-ALLOWED paths |

## Coding Standards

- `brain/docs/TDD-METHODOLOGY.md`
- `brain/docs/kanban/SCENARIO-CONTRACT-V1.md`
- `brain/docs/REQUIREMENT-TRACKING.md`
- `brain/docs/ANTI-STUB-REVIEW.md`

## Dependencies

- **depends_on:** pipes-1, pipes-2, pipes-3, pipes-4, pipes-5 (completed sprint body)
- **blocks:** safer standing-subscription scheduling; reduces duplicate `mission_runs` before Sprint 23 fulcrum work compounds retries

## Agent Instructions

1. **RED first:** Write `redhat-fix-2-cli-idempotency-defaults.test.ts` asserting AC-1 against current HEAD — expect **fail** (two distinct `runId`s / timestamped keys). Capture failure output as RED evidence.
2. **GREEN:** Replace the six default key expressions; add `--fresh` (or documented equivalent) parse + help text; keep `--idempotency-key` highest precedence.
3. **REFACTOR:** Optional pure helper for default key construction so AC-3 does not require six full mission executions if CLI-exported helper is cleaner — still keep AC-1/AC-2 on real Postgres.
4. Do not implement C-1 / H-1 / H-2 / H-3 in this task.
5. Existing integration tests that pass unique `--idempotency-key` with `Date.now()` remain valid (they test isolation, not defaults).

## Review Criteria

- Every AC/TC stable; behavioral ACs carry scenarios that pass `validate_scenario`
- Double-invoke proof on real Postgres (same `runId`, count = 1)
- All six default formulas deterministic; entropy only behind explicit opt-in
- Writes only under WRITE-ALLOWED; runtime conflict path untouched
- C-2 closed without changing gather/retrieval behavior

## Notes

- Repro from red-hat: run `holo mission run whatsNew --date 2026-07-20 --json` twice and compare `idempotencyKey` — today they differ by millisecond suffix.
- Tests that need unique runs under concurrent suites should keep using explicit `--idempotency-key` (current pattern) or switch to `--fresh`.
- Do not re-run the full human gate here; gate re-attestation is post all REDHAT-FIX-* remediations.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-2",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "whatsnew_template_clean_key": {
      "description": "Postgres holocron_nonprod with whatsnew mission template registered and zero mission_runs rows for template_key=whatsnew AND idempotency_key=whatsnew:2026-07-20.",
      "seed_method": "public_api",
      "records": [
        "ensureSystemMissionTemplates registers whatsnew",
        "DELETE FROM mission_runs WHERE template_key = 'whatsnew' AND idempotency_key = 'whatsnew:2026-07-20' (or assert none exist)",
        "DATABASE_URL points at holocron_nonprod"
      ]
    },
    "whatsnew_template_registered": {
      "description": "Postgres with whatsnew template registered; CLI holo mission run whatsNew works; operator may use distinct override keys for isolation.",
      "seed_method": "cli",
      "records": [
        "whatsnew template registered",
        "CLI accepts --idempotency-key and uniqueness opt-in flag"
      ]
    },
    "six_pipeline_cli_surfaces": {
      "description": "All six Sprint-22 mission CLI surfaces are wired (research, whatsNew, assimilate, shop, subscriptions, report) so default key construction can be observed for fixed params.",
      "seed_method": "cli",
      "records": [
        "holo.ts mission run handlers exist for six surfaces",
        "JSON output or exported defaultMissionIdempotencyKey helper exposes the key used"
      ]
    },
    "post_fix_cli_source": {
      "description": "Working tree after REDHAT-FIX-2 implementation with deterministic defaults and optional --fresh branch.",
      "seed_method": "cli",
      "records": [
        "services/platform/src/cli/holo.ts updated default key formulas",
        "integration test redhat-fix-2-cli-idempotency-defaults.test.ts present"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN whatsnew template registered and no row for whatsnew:2026-07-20 WHEN holo mission run whatsNew --date 2026-07-20 --json is run twice without --idempotency-key or uniqueness opt-in THEN both responses have idempotencyKey whatsnew:2026-07-20, the same runId, and mission_runs count equals 1",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["stub", "empty", "static", "mock", "Date.now default key", "disconnect"]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "whatsnew_template_clean_key",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Ensure no mission_runs row for whatsnew / whatsnew:2026-07-20",
                "Run holo mission run whatsNew --date 2026-07-20 --json (no --idempotency-key, no --fresh)",
                "Run the identical command a second time",
                "Compare idempotencyKey and runId; count mission_runs rows for that key"
              ]
            },
            "end_state": {
              "must_observe": [
                "idempotencyKey equals literal whatsnew:2026-07-20 on both responses",
                "runId equality: first.runId === second.runId",
                "mission_runs count for template_key whatsnew and idempotency_key whatsnew:2026-07-20 equals 1"
              ],
              "must_not_observe": [
                "empty/start signature: two distinct runId values for the same default key",
                "idempotencyKey matching regex whatsnew:2026-07-20:[0-9]{10,}",
                "mission_runs count >= 2 for whatsnew:2026-07-20"
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
      "description": "GIVEN whatsnew template registered WHEN operator uses --idempotency-key operator-fixed-key-c2 twice THEN same runId; WHEN operator uses uniqueness opt-in --fresh twice THEN different runIds and keys not equal to bare whatsnew:2026-07-20",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["stub", "empty", "static", "mock", "override ignored", "disconnect"]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "whatsnew_template_registered",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run whatsNew twice with --idempotency-key operator-fixed-key-c2",
                "Run whatsNew twice with uniqueness opt-in (--fresh) and no --idempotency-key",
                "Compare keys and runIds"
              ]
            },
            "end_state": {
              "must_observe": [
                "override path: idempotencyKey equals operator-fixed-key-c2 on both runs",
                "override path: first.runId === second.runId",
                "fresh path: first.runId !== second.runId",
                "fresh path: neither key equals bare whatsnew:2026-07-20"
              ],
              "must_not_observe": [
                "empty/start signature: --idempotency-key ignored (key still whatsnew:2026-07-20)",
                "fresh path: both runIds identical",
                "override path: two distinct runIds for the same operator-fixed-key-c2"
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
      "description": "GIVEN six pipeline CLI surfaces WHEN default keys are observed for fixed params without override/opt-in THEN keys equal research:c2-goal:2, whatsnew:2026-07-20, assimilate:acme/widget, shop:keyboard, subscriptions:c2-topic, report:competitive:example.com with no trailing ms suffix",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["stub", "static", "empty", "mock", "Date.now default", "disconnect"]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "six_pipeline_cli_surfaces",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Invoke each of the six mission run surfaces once with fixed params and no --idempotency-key / no --fresh",
                "Collect idempotencyKey from each JSON (or unit helper that mirrors CLI defaults used by holo.ts)",
                "Assert exact string equality to the six expected defaults"
              ]
            },
            "end_state": {
              "must_observe": [
                "research key equals research:c2-goal:2",
                "whatsnew key equals whatsnew:2026-07-20",
                "assimilate key equals assimilate:acme/widget",
                "shop key equals shop:keyboard",
                "subscriptions key equals subscriptions:c2-topic",
                "report key equals report:competitive:example.com"
              ],
              "must_not_observe": [
                "empty/start signature: any default key matching /:[0-9]{10,}$/",
                "any default key containing substring Date.now",
                "research key still ending with a millisecond timestamp"
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
      "description": "GIVEN post-fix CLI source WHEN mission run default-key handlers are audited THEN unguarded Date.now()/randomUUID() count on six default assignments is 0; entropy only under explicit uniqueness flag branch",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-4'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "source-audit+cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["stub", "static", "empty", "mock", "docs-only claim", "disconnect"]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "post_fix_cli_source",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Read mission run handlers in services/platform/src/cli/holo.ts for the six pipelines",
                "Assert default key templates lack Date.now()/randomUUID()",
                "Assert any Date.now() is only under an explicit uniqueness flag branch",
                "Run AC-4 vitest"
              ]
            },
            "end_state": {
              "must_observe": [
                "default key assignment count for six surfaces equals 6",
                "unguarded Date.now() in those default assignments equals 0",
                "AC-4 vitest exit code 0"
              ],
              "must_not_observe": [
                "empty/start signature: `:${Date.now()}` still present on whatsNew default key line",
                "all six surfaces still concatenating Date.now() into defaults",
                "entropy used without a fresh/unique flag guard"
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
      "description": "Two default whatsNew runs for date 2026-07-20 share idempotencyKey whatsnew:2026-07-20 and the same runId with mission_runs count equals 1",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Explicit --idempotency-key operator-fixed-key-c2 is honored and double-invoke reuses that run",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Uniqueness opt-in --fresh produces two distinct runIds and keys not equal to bare whatsnew:2026-07-20",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "All six pipeline default keys equal the deterministic formulas with zero trailing ms suffixes",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Source audit finds zero unguarded Date.now on the six default-key assignments",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
