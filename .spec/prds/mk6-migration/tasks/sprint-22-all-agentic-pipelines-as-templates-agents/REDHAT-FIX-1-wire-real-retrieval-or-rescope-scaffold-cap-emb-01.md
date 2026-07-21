# REDHAT-FIX-1 — Wire real retrieval or explicitly re-scope scaffold-only gathers and CAP-EMB-01 composition (C-1)
> Status: Backlog
> Sprint: [Sprint 22 — All Agentic Pipelines as Templates/Agents](./SPRINT.md)
> Agent: mastra-implementer
> Reviewer: mastra-reviewer
> Estimate: 240 min
> Type: FEATURE
> Priority: P0
> Proposed by: mastra-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint-22-20260721T183000Z.md` **C-1** (CRITICAL; 3/3 agents + orchestrator-verified)

## Outcome

Sprint 22 no longer claims CAP-EMB-01 composition while shipping only deterministic scaffolding: either `builtin.research-retrieve@1` returns real hybrid-search evidence without `--claims`, or every CAP-EMB-01 / “live gather” claim is explicitly re-scoped and provenance stays honest.

**Success state:** An unseeded `holo mission run research --topic '…' --components N --json` against real Postgres either (PATH-A) completes with non-empty retrieve evidence whose provenance names RRF/hybrid search (`retrievalMethod: "rrf"` or equivalent), or (PATH-B) fails closed / documents seed-required research while SPRINT + pipes-1/3 no longer list CAP-EMB-01 as consumed. Scaffold gathers (whatsNew/shop/assimilate/business-report) either stay labeled scaffold with matching claim language, or are replaced by live sources — never silent scaffold under a live-data claim.

## Background

- **Finding (C-1):** All pipeline gather stages are deterministic scaffolding; CAP-EMB-01 is never wired.
- **Evidence (source at reviewed SHA `72b8eee`):**
  - `services/platform/src/mission/templates/pipeline-components.ts:26` — `SCAFFOLD_NOTE = 'Deterministic scaffolding (stable hash of inputs; not live source fetch)'`
  - `pipeline-components.ts:70-82` — whatsNew URLs fabricated as `` `https://${src.host}/item?d=${d}&i=${i+1}` ``
  - `pipeline-components.ts:212-271` — shop `PRODUCT_CATALOG` hardcoded (5 products); retailers labeled `deterministic-scaffolding:*`
  - `pipeline-components.ts:113-210` — assimilate: only `facebook/react` hardcodes a fixture; others get generic slots
  - `services/platform/src/mission/templates/business-report-components.ts:88-95` — TAM/SAM/SOM from `stableScore` hash; “not live market research”
  - `services/platform/src/mission/runtime.ts:530-553` — `builtin.research-retrieve@1` returns `{claims:[], evidence:[]}` unless `researchEvidence` is injected; **no** `rrfHybridSearch` / embed call on the retrieve path
- **Contradicts:** SPRINT.md overview (“retrieval served by the local embed/search stack (CAP-EMB-01)”), Capability Coverage composition note, pipes-1 **Consumes: CAP-EMB-01**, pipes-3 **Touches/Consumes CAP-EMB-01**.
- **Scope decision (implementer must record PATH-A or PATH-B in evidence artifact):**
  - **PATH-A (preferred):** Wire `builtin.research-retrieve@1` to CAP-EMB-01 (`rrfHybridSearch` + fleet embed QUERY mode). Keep scaffold gathers only if provenance stays explicit and SPRINT claims no longer imply live gather substance for those pipelines.
  - **PATH-B (explicit re-scope):** Remove CAP-EMB-01 from Sprint 22 composition claims (SPRINT.md + pipes-1/3 “Consumes”), document scaffold-only data plane for gathers + seed-required research, and leave retrieve as seed-only — still fail-closed on empty-success greenwashing.
- **Out of scope:** C-2 (idempotency keys), H-1 (`infer:trace`), H-2 (subscriptions claims flake), H-3 (GREEN suite breadth) — own REDHAT-FIX tasks.
- **PRD refs:** UC-SVC-02; CAP-EMB-01 (search-3 / hybrid search); CAP-INF-01 (fleet).

## Critical Constraints

### MUST
- MUST resolve C-1 with either PATH-A (real CAP-EMB-01 on retrieve) or PATH-B (explicit re-scope of CAP-EMB-01 claims) — record the chosen path in `.tmp/sprint-22/redhat-fix-1-path.json` as `{"path":"A"|"B","rationale":"…"}`
- MUST exercise real Postgres + real fleet embed on PATH-A (no mocked `rrfHybridSearch`, no stub embed vectors in production code)
- MUST keep scaffold provenance strings honest whenever scaffold code remains (`SCAFFOLD_NOTE` or equivalent must appear in operator-visible output / gatherProvenance)

### NEVER
- NEVER leave `Consumes: CAP-EMB-01` / SPRINT composition claims true while `builtin.research-retrieve@1` still returns empty claims/evidence without a seed and never calls hybrid search
- NEVER invent always-admissible grade/entailment evidence bundles to fake “retrieval worked”
- NEVER soft-succeed research with empty evidence when PATH-A is claimed and a matching corpus exists

### STRICTLY
- STRICTLY PATH-A retrieve output MUST name the search method (`retrievalMethod: "rrf"` or `searchMethod: "rrf"`) and include ≥1 claim **or** ≥1 evidence row sourced from search hits when the seeded corpus matches the topic
- STRICTLY PATH-B MUST update SPRINT.md Capability Coverage + pipes-1/3 capability sections in the same commit as any retained seed-only retrieve behavior
- STRICTLY disconnect / empty-corpus negative controls MUST fail closed (non-zero exit or structured error code) — not empty-success with status completed

## Specification

**Objective:** Close red-hat C-1 by making Sprint 22’s CAP-EMB-01 / gather claims true in code or true by honest re-scope.

**Success state:** Either (A) unseeded research retrieve returns real hybrid-search evidence against a seeded passages corpus with `retrievalMethod: "rrf"`, or (B) CAP-EMB-01 is removed from Sprint 22 composition claims and research is explicitly seed-required; scaffold gathers never masquerade as live CAP-EMB retrieval.

## Capability Chain

- **Touches:** CAP-EMB-01, CAP-INF-01
- **Provides:** honest-retrieval-or-rescope-contract
- **Consumes:** CAP-EMB-01 (PATH-A only), CAP-INF-01
- **Boundary contracts:**
  - research-retrieve → hybrid search (or explicit seed-only after re-scope)
  - gather provenance honesty vs sprint capability claims

## Acceptance Criteria

### AC-1: Unseeded research retrieve exercises CAP-EMB-01 or fails the composition claim [PRIMARY]
**GIVEN:** Real Postgres nonprod with a seeded passages corpus containing ≥3 passages whose text matches topic `MCP architecture` (embeddings present, 1024-dim) AND fleet embed QUERY is healthy AND PATH-A is chosen; OR PATH-B is chosen and SPRINT/pipes claims have been re-scoped
**WHEN:** Operator runs `bun run services/platform/src/cli/holo.ts mission run research --topic 'MCP architecture' --components 2 --json` **without** `--claims` / `researchEvidence`
**THEN:**
- **PATH-A:** Mission reaches retrieve with non-empty evidence payload: `claims.length >= 1` OR `evidence.length >= 1`, and stage/output includes `retrievalMethod: "rrf"` (or equivalent hybrid-search marker); must not complete solely on injected empty `{claims:[],evidence:[]}`
- **PATH-B:** Command fails closed with a structured seed-required / retrieval-out-of-scope error **or** completes only when docs no longer claim CAP-EMB-01, and `.tmp/sprint-22/redhat-fix-1-path.json` records `"path":"B"`
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-1'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** postgres+fleet-embed+rrfHybridSearch
**FLOW_REF:** UC-SVC-02
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null

#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "postgres+fleet-embed+rrfHybridSearch",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "empty", "static", "disconnect", "mock", "hardcoded claims without search"] },
  "evidence": { "artifact_type": "api_response", "required_capture": true },
  "cases": [
    {
      "start_ref": "seeded_passages_corpus_mcp",
      "action": {
        "actor": "cli_user",
        "steps": [
          "Record PATH-A or PATH-B in .tmp/sprint-22/redhat-fix-1-path.json",
          "Run holo mission run research --topic 'MCP architecture' --components 2 --json WITHOUT --claims",
          "Inspect mission JSON / stage retrieve output"
        ]
      },
      "end_state": {
        "must_observe": [
          "PATH-A: claims.length >= 1 OR evidence.length >= 1",
          "PATH-A: retrievalMethod: \"rrf\" OR searchMethod: \"rrf\"",
          "PATH-B: path.json path field equals \"B\" AND CAP-EMB-01 removed from SPRINT Consumes claims"
        ],
        "must_not_observe": [
          "PATH-A empty/start signature: claims:[] AND evidence:[] with status completed",
          "PATH-A retrievalMethod absent while CAP-EMB-01 still claimed",
          "PATH-B still lists Consumes CAP-EMB-01 in pipes-1"
        ]
      }
    }
  ]
}
```

### AC-2: Disconnect / empty-corpus fail-closed on the retrieve path
**GIVEN:** PATH-A implementation is active AND either (i) passages table has 0 rows for the topic or (ii) fleet embed endpoint is unreachable / DATABASE_URL points at a refused host
**WHEN:** Operator runs unseeded `holo mission run research --topic 'MCP architecture' --components 1 --json`
**THEN:** Mission does **not** green-complete with fabricated admissible evidence; exit non-zero **or** status in `{failed,blocked}` with a structured code mentioning retrieval/search/embed (e.g. `MISSION_RETRIEVAL_UNAVAILABLE` / `MISSION_RETRIEVE_EMPTY`), and output must not contain invented grade≥3 entailment bundles
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-2'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** postgres+fleet-embed
**FLOW_REF:** UC-SVC-02
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null

#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "postgres+fleet-embed",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "static", "mock"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "empty_passages_or_embed_down",
      "action": {
        "actor": "cli_user",
        "steps": [
          "Ensure passages corpus is empty OR embed endpoint is down",
          "Run holo mission run research --topic 'MCP architecture' --components 1 --json without --claims"
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode != 0 OR status equals \"failed\" OR status equals \"blocked\"",
          "error message or code contains substring \"retrieval\" OR \"search\" OR \"embed\" OR \"empty\" OR \"MISSION_RETRIEVAL\""
        ],
        "must_not_observe": [
          "status: \"completed\" with claims:[] soft-success",
          "empty/start signature: fabricated grade:4 entailment:0.9 bundle",
          "exitCode: 0 with invented evidence length >= 1 from scaffold"
        ]
      }
    }
  ]
}
```

### AC-3: Scaffold gather honesty matches sprint capability claims
**GIVEN:** Current whatsNew / shop / assimilate / business-report gather implementations (pipeline-components / business-report-components)
**WHEN:** Operator runs `holo mission run whatsNew --date 2026-07-20 --json` and `holo mission run shop --query keyboard --json` and `holo mission run report --kind revenue-validation --target example.com --json`
**THEN:** Each output either (i) shows non-scaffold live provenance (no `SCAFFOLD_NOTE` / “not live” hash notes for the primary fields) **or** (ii) still shows explicit scaffold provenance **and** SPRINT.md + pipes-3 no longer claim those gathers are served by CAP-EMB-01 / live source fetch; fabricated URL pattern `item?d=2026-07-20&i=` must not appear under a “live feed” claim
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-3'`
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
  "negative_control": { "would_fail_if": ["static", "stub", "empty", "disconnect", "mock", "silent scaffold under live claim"] },
  "evidence": { "artifact_type": "api_response", "required_capture": true },
  "cases": [
    {
      "start_ref": "pipeline_templates_registered",
      "action": {
        "actor": "cli_user",
        "steps": [
          "Run holo mission run whatsNew --date 2026-07-20 --json",
          "Run holo mission run shop --query keyboard --json",
          "Run holo mission run report --kind revenue-validation --target example.com --json",
          "Diff gatherProvenance / notes against SPRINT CAP-EMB claims"
        ]
      },
      "end_state": {
        "must_observe": [
          "gatherProvenance contains \"Deterministic scaffolding\" OR live source count >= 1 without SCAFFOLD_NOTE",
          "SCAFFOLD_NOTE remains implies SPRINT CAP-EMB-01 gather claim count == 0"
        ],
        "must_not_observe": [
          "empty/start signature: gatherProvenance omitted while CAP-EMB-01 claimed for gathers",
          "live-feed claim with fabricated URL substring \"item?d=2026-07-20&i=\"",
          "silent PRODUCT_CATALOG as hybrid_search results"
        ]
      }
    }
  ]
}
```

### AC-4: Anti-stub source audit — retrieve path references hybrid search (PATH-A) or claim removal is greppable (PATH-B)
**GIVEN:** Working tree after the fix commit
**WHEN:** Reviewer runs static + behavioral audit
**THEN:**
- **PATH-A:** `services/platform/src/mission/runtime.ts` (or the extract module it delegates to) imports/calls `rrfHybridSearch` (or `searchSurface`) on the `builtin.research-retrieve@1` path; `rg "rrfHybridSearch|searchSurface" services/platform/src/mission/runtime.ts` is non-empty on that path; integration test AC-1 is green
- **PATH-B:** `rg "CAP-EMB-01" .spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/pipes-1*.md` does **not** list CAP-EMB under Consumes; SPRINT.md overview no longer states retrieval is served by CAP-EMB-01 for Sprint 22 pipelines
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-4' && test -f .tmp/sprint-22/redhat-fix-1-path.json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** postgres+source-audit
**FLOW_REF:** UC-SVC-02
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null

#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "postgres+source-audit",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "static", "empty", "disconnect", "mock", "docs-only claim"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "post_fix_working_tree",
      "action": {
        "actor": "reviewer",
        "steps": [
          "Read .tmp/sprint-22/redhat-fix-1-path.json",
          "If path A: rg rrfHybridSearch|searchSurface on mission retrieve path",
          "If path B: rg CAP-EMB-01 Consumes claims in pipes-1 and SPRINT.md",
          "Run AC-4 vitest"
        ]
      },
      "end_state": {
        "must_observe": [
          "path.json path field equals \"A\" or \"B\"",
          "PATH-A: rrfHybridSearch or searchSurface appears on retrieve path (count >= 1)",
          "PATH-B: pipes-1 Consumes list does not include CAP-EMB-01"
        ],
        "must_not_observe": [
          "empty/start signature: path.json missing",
          "PATH-A retrieve still only args.researchEvidence ?? empty claims",
          "PATH-B still claims CAP-EMB-01 composition in SPRINT overview"
        ]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | Unseeded research retrieve returns ≥1 claim or ≥1 evidence row with `retrievalMethod: "rrf"` when PATH-A and corpus is seeded | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-1'` | happy_path |
| TC-2 | PATH-B records `path:"B"` and removes CAP-EMB-01 from pipes-1 Consumes when re-scope is chosen | AC-1 | `jq -r .path .tmp/sprint-22/redhat-fix-1-path.json \| grep -E 'A\|B' && (test "$(jq -r .path .tmp/sprint-22/redhat-fix-1-path.json)" != B \|\| ! rg -n "Consumes:.*CAP-EMB-01\|CAP-EMB-01" .spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/pipes-1-shared-evidence-research-core-template.md \| rg -q Consumes)` | boundary |
| TC-3 | Empty corpus or embed-down unseeded research fails closed (no fabricated evidence success) | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-2'` | error |
| TC-4 | Scaffold gather outputs carry explicit provenance or live data; CAP-EMB not claimed for pure scaffold gathers | AC-3 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-3'` | boundary |
| TC-5 | Source audit finds hybrid-search call on retrieve (PATH-A) or greppable claim removal (PATH-B) | AC-4 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-4'` | happy_path |

## Reading List

| Path | Lines / focus |
|---|---|
| `.spec/reviews/red-hat-sprint-22-20260721T183000Z.md` | C-1 (lines 23–32) — source finding + repro |
| `services/platform/src/mission/runtime.ts` | `builtin.research-retrieve@1` (~530–553) — empty seed path to replace or re-scope |
| `services/platform/src/search/rrf.ts` | `rrfHybridSearch` — CAP-EMB-01 production search API |
| `services/platform/src/search/index.ts` | public exports for hybrid search |
| `services/platform/src/mission/templates/pipeline-components.ts` | SCAFFOLD_NOTE, whatsNew/shop/assimilate gatherers |
| `services/platform/src/mission/templates/business-report-components.ts` | hash TAM/SAM/SOM scaffolding |
| `services/platform/src/mission/templates/evidence-research.ts` | stage graph using `builtin.research-retrieve@1` |
| `services/platform/tests/integration/rrf-search.test.ts` | pattern for seeding passages + asserting RRF results |
| `services/platform/tests/integration/evidence-research-template.test.ts` | current research integration (claims-seeded) |
| `services/platform/tests/integration/embed-run.test.ts` | passage seed + 1024-dim embed patterns |
| `.spec/prds/mk6-migration/tasks/sprint-22-…/SPRINT.md` | CAP-EMB-01 composition claims to keep or amend |
| `.spec/prds/mk6-migration/tasks/sprint-22-…/pipes-1-….md` | Consumes: CAP-EMB-01 |

## Guardrails

### WRITE-ALLOWED
- `services/platform/src/mission/runtime.ts` (MODIFY — wire or fail-close `builtin.research-retrieve@1`)
- `services/platform/src/mission/templates/pipeline-components.ts` (MODIFY — live gather **or** provenance-only touch)
- `services/platform/src/mission/templates/business-report-components.ts` (MODIFY — same)
- `services/platform/src/mission/templates/evidence-research.ts` (MODIFY if stage I/O schema needs retrievalMethod)
- `services/platform/src/tools/schemas/research.ts` (MODIFY — retrieve output schema fields)
- `services/platform/src/tools/schemas/pipeline-templates.ts` (MODIFY if provenance fields need typing)
- `services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts` (NEW)
- `services/platform/tests/fixtures/research/**` (NEW/MODIFY — corpus seed helpers if needed)
- `.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/SPRINT.md` (MODIFY — PATH-B claim amendment only)
- `.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/pipes-1-shared-evidence-research-core-template.md` (MODIFY — PATH-B Consumes amendment only)
- `.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/pipes-3-whatsnew-assimilate-shop-subscriptions-templates-sub-workflow-publish.md` (MODIFY — PATH-B capability amendment only)
- `.tmp/sprint-22/redhat-fix-1-path.json` (NEW — path decision evidence; not committed)

### WRITE-PROHIBITED
- `services/platform/src/search/rrf.ts` — CAP-EMB-01 search implementation is stable; consume it, do not reimplement RRF
- `services/platform/src/cli/holo.ts` — C-2 owns CLI idempotency defaults; H-1 owns `infer:trace`
- `services/platform/src/mcp/executor.ts` — shop MCP live Jina path is M-1 (out of scope); do not dual-write without explicit AC
- Other REDHAT-FIX-* task files — each finding is isolated

### Boundaries
- **always:** Prefer PATH-A when fleet embed + passages substrate are available; keep provenance honest; capture JSON artifacts under `.tmp/sprint-22/`
- **ask_first:** Expanding live whatsNew/shop scrapers beyond CAP-EMB retrieve (large scope); adding new npm deps
- **never:** Fabricate grade/entailment to satisfy evidence-gate; leave CAP-EMB claims while retrieve is still seed-only empty success

## Design

- **references:** `services/platform/src/search/rrf.ts`, `services/platform/src/mission/runtime.ts:530-553`, red-hat C-1
- **pattern:** Inside `builtin.research-retrieve@1`, if `args.researchEvidence` is absent: call `rrfHybridSearch(db, sql, { query: goal/topic, limit })`, map top hits → claims/evidence rows with real `sourceId`/quotes from passage text, set `retrievalMethod: 'rrf'`. If search returns 0 hits or embed fails: throw structured mission error (fail-closed). Keep explicit `--claims` seed path for subscriptions/H-2 fixtures.
- **pattern_source:** `services/platform/tests/integration/rrf-search.test.ts` + `services/platform/src/search/rrf.ts`
- **anti_pattern:** Returning `{claims:[],evidence:[]}` and letting later stages “complete” while SPRINT claims CAP-EMB-01; inventing high-grade evidence from hash scaffolds

## Agent Assignment

- **implementer:** `mastra-implementer` — owns mission runtime executors + template gather components
- **reviewer:** `mastra-reviewer` — adversarial anti-stub review of retrieve path + claim honesty
- **proposed_by:** `mastra-planner` — domain planner for Sprint 22; this file expands SPRINT Tasks table row REDHAT-FIX-1 from C-1 only (user-authorized `--only` expansion; no nested specialist fan-out)

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| AC-1 retrieve/path | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-1'` | Exit 0 |
| AC-2 fail-closed | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-2'` | Exit 0 |
| AC-3 gather honesty | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-3'` | Exit 0 |
| AC-4 source audit | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-4'` | Exit 0 |
| Full FIX-1 suite | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts` | Exit 0 |
| Typecheck | `pnpm typecheck` | Exit 0 |
| Scenario contract | `python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py` on this task’s REQUIREMENT-CONTRACT JSON | Exit 0; zero CRITICAL |
| Scope | `git diff --name-only` | Only WRITE-ALLOWED paths |

## Coding Standards

- `brain/docs/TDD-METHODOLOGY.md`
- `brain/docs/kanban/SCENARIO-CONTRACT-V1.md`
- `brain/docs/REQUIREMENT-TRACKING.md`
- `brain/docs/ANTI-STUB-REVIEW.md`
- Mastra/platform patterns in existing mission runtime + search modules

## Dependencies

- **depends_on:** pipes-1, pipes-2, pipes-3, pipes-4, pipes-5 (completed sprint body)
- **blocks:** Sprint 22 gate re-run / land decision; REDHAT-FIX-4 may consume real retrieve for subscriptions claims-less path later

## Agent Instructions

1. **RED first:** Write `redhat-fix-1-cap-emb-retrieve.test.ts` asserting AC-1 against current HEAD — expect fail (empty claims without `--claims`, no `rrfHybridSearch` on retrieve). Capture failure output.
2. Choose **PATH-A** unless blocked by missing embed/passages substrate; write path decision artifact.
3. **GREEN:** Wire retrieve → `rrfHybridSearch` (PATH-A) **or** amend claims + fail-closed seed policy (PATH-B). Keep scaffold gathers honest (AC-3).
4. **REFACTOR:** Share mapping helper for search hits → evidence-gate input; no duplicated RRF math.
5. Do not implement C-2/H-1/H-2/H-3 in this task.

## Review Criteria

- Every AC/TC stable; behavioral ACs carry scenarios that pass `validate_scenario`
- PATH-A: real hybrid search on retrieve path (source + runtime proof); PATH-B: greppable claim removal
- No fabricated evidence-gate payloads; disconnect/empty corpus fail closed
- Writes only under WRITE-ALLOWED
- C-1 closed without regressing pipes-1 evidence-gate determinism for `--claims` path

## Notes

- Repro from red-hat: `bun run services/platform/src/cli/holo.ts mission run whatsNew --date 2026-07-20 --json` → inspect `output.headlines[].url` / `gatherProvenance`.
- Subscriptions still may need `--claims` until REDHAT-FIX-4; this task only requires unseeded **research** retrieve honesty for CAP-EMB.
- Do not re-run the full human gate here; gate re-attestation is post all REDHAT-FIX-* remediations.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-1",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded_passages_corpus_mcp": {
      "description": "Postgres holocron_nonprod with ≥3 passages whose text mentions MCP architecture, each with non-null 1024-dim embedding; fleet embed QUERY healthy; evidence-research template registered.",
      "seed_method": "public_api",
      "records": [
        "INSERT passages with text containing 'MCP architecture' (count >= 3)",
        "passages.embedding is 1024-dim non-null for each seeded row",
        "mission_templates contains evidence-research"
      ]
    },
    "empty_passages_or_embed_down": {
      "description": "Either passages matching the topic are absent (0 rows) or the fleet embed endpoint / DATABASE_URL is unreachable so hybrid search cannot complete.",
      "seed_method": "cli",
      "records": [
        "DELETE or never insert matching passages for topic MCP architecture OR block embed endpoint",
        "evidence-research template still registered"
      ]
    },
    "pipeline_templates_registered": {
      "description": "Mission templates whatsnew, shop, business-report, evidence-research are registered; CLI holo mission run works against real Postgres.",
      "seed_method": "cli",
      "records": [
        "ensureSystemMissionTemplates or equivalent has registered pipeline templates",
        "DATABASE_URL points at holocron_nonprod"
      ]
    },
    "post_fix_working_tree": {
      "description": "Working tree after REDHAT-FIX-1 implementation commit with path decision artifact present.",
      "seed_method": "cli",
      "records": [
        ".tmp/sprint-22/redhat-fix-1-path.json exists with path A or B",
        "retrieve path or docs amended per path"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN seeded passages corpus (PATH-A) or re-scoped claims (PATH-B) WHEN unseeded holo mission run research --topic 'MCP architecture' --components 2 --json THEN PATH-A returns claims.length>=1 or evidence.length>=1 with retrievalMethod rrf, OR PATH-B records path B and removes CAP-EMB-01 composition claims",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+fleet-embed+rrfHybridSearch",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["stub", "empty", "static", "disconnect", "mock", "hardcoded claims without search"]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_passages_corpus_mcp",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Record PATH-A or PATH-B in .tmp/sprint-22/redhat-fix-1-path.json",
                "Run holo mission run research --topic 'MCP architecture' --components 2 --json WITHOUT --claims",
                "Inspect mission JSON / stage retrieve output"
              ]
            },
            "end_state": {
              "must_observe": [
                "PATH-A: claims.length >= 1 OR evidence.length >= 1",
                "PATH-A: retrievalMethod: \"rrf\" OR searchMethod: \"rrf\"",
                "PATH-B: path.json path field equals \"B\" AND CAP-EMB-01 removed from SPRINT Consumes claims"
              ],
              "must_not_observe": [
                "PATH-A empty/start signature: claims:[] AND evidence:[] with status completed",
                "PATH-A retrievalMethod absent while CAP-EMB-01 still claimed",
                "PATH-B still lists Consumes CAP-EMB-01 in pipes-1"
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
      "description": "GIVEN PATH-A with empty corpus or embed down WHEN unseeded research mission runs THEN mission fails closed (non-zero exit or failed|blocked) without fabricated evidence-gate bundles",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+fleet-embed",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["disconnect", "stub", "empty", "static", "mock"]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty_passages_or_embed_down",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Ensure passages corpus is empty OR embed endpoint is down",
                "Run holo mission run research --topic 'MCP architecture' --components 1 --json without --claims"
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode != 0 OR status equals \"failed\" OR status equals \"blocked\"",
                "error message or code contains substring \"retrieval\" OR \"search\" OR \"embed\" OR \"empty\" OR \"MISSION_RETRIEVAL\""
              ],
              "must_not_observe": [
                "status: \"completed\" with claims:[] soft-success",
                "empty/start signature: fabricated grade:4 entailment:0.9 bundle",
                "exitCode: 0 with invented evidence length >= 1 from scaffold"
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
      "description": "GIVEN pipeline templates registered WHEN whatsNew/shop/report missions run THEN each output has live provenance without SCAFFOLD_NOTE OR explicit scaffold provenance with SPRINT not claiming CAP-EMB-01 for those gathers",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["static", "stub", "empty", "disconnect", "mock", "silent scaffold under live claim"]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "pipeline_templates_registered",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run holo mission run whatsNew --date 2026-07-20 --json",
                "Run holo mission run shop --query keyboard --json",
                "Run holo mission run report --kind revenue-validation --target example.com --json",
                "Diff gatherProvenance / notes against SPRINT CAP-EMB claims"
              ]
            },
            "end_state": {
              "must_observe": [
                "gatherProvenance contains \"Deterministic scaffolding\" OR live source count >= 1 without SCAFFOLD_NOTE",
                "SCAFFOLD_NOTE remains implies SPRINT CAP-EMB-01 gather claim count == 0"
              ],
              "must_not_observe": [
                "empty/start signature: gatherProvenance omitted while CAP-EMB-01 claimed for gathers",
                "live-feed claim with fabricated URL substring \"item?d=2026-07-20&i=\"",
                "silent PRODUCT_CATALOG as hybrid_search results"
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
      "description": "GIVEN post-fix working tree WHEN source audit runs THEN PATH-A shows rrfHybridSearch|searchSurface on retrieve path (count>=1) OR PATH-B removes CAP-EMB-01 from pipes-1 Consumes; path.json records A or B",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-4' && test -f .tmp/sprint-22/redhat-fix-1-path.json",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+source-audit",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["stub", "static", "empty", "disconnect", "mock", "docs-only claim"]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "post_fix_working_tree",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Read .tmp/sprint-22/redhat-fix-1-path.json",
                "If path A: rg rrfHybridSearch|searchSurface on mission retrieve path",
                "If path B: rg CAP-EMB-01 Consumes claims in pipes-1 and SPRINT.md",
                "Run AC-4 vitest"
              ]
            },
            "end_state": {
              "must_observe": [
                "path.json path field equals \"A\" or \"B\"",
                "PATH-A: rrfHybridSearch or searchSurface appears on retrieve path (count >= 1)",
                "PATH-B: pipes-1 Consumes list does not include CAP-EMB-01"
              ],
              "must_not_observe": [
                "empty/start signature: path.json missing",
                "PATH-A retrieve still only args.researchEvidence ?? empty claims",
                "PATH-B still claims CAP-EMB-01 composition in SPRINT overview"
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
      "description": "Unseeded research retrieve returns >=1 claim or >=1 evidence row with retrievalMethod rrf when PATH-A and corpus is seeded",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "PATH-B records path B and removes CAP-EMB-01 from pipes-1 Consumes when re-scope is chosen",
      "verify": "jq -r .path .tmp/sprint-22/redhat-fix-1-path.json | grep -E 'A|B'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Empty corpus or embed-down unseeded research fails closed without fabricated evidence success",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Scaffold gather outputs carry explicit provenance or live data; CAP-EMB not claimed for pure scaffold gathers",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Source audit finds hybrid-search call on retrieve PATH-A or greppable claim removal PATH-B",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
