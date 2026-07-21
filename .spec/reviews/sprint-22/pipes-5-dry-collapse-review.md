# Mastra Review — Task pipes-5 (DRY collapse capstone)

**Verdict**: **NEEDS_FIXES**  
**Status**: **partial** (technical collapse largely complete; process RED-evidence artifact missing)  
**Reviewer**: mastra-reviewer  
**Branch**: `task/pipes-5` @ `515c2a25` (Merge task/pipes-3 into main)  
**Date**: 2026-07-21T17:33:03Z  
**Evidence root**: `.tmp/pipes-5/`

---

## Executive summary

Sprint 22 pipes-1..3 landed a real DRY collapse onto the mission-engine template system:

| Surface | Result |
|---|---|
| Per-domain platform shells (`services/platform/src/{whatsnew,assimilate,shop,subscriptions}/`) | **Absent** (count=0) |
| `holo verify:no-shells` | **0 per-domain modules found** (exit 0) |
| Convex agentic residuals | **All stubbed** with `MIGRATED_TO_MISSION_ENGINE`; no residual Anthropic/LLM calls in scanned files |
| Shared templates (source + `mission_templates` on `holocron_nonprod`) | **All 6 keys present** |
| `subworkflow:evidence-research` | **Resolved correctly** on subscriptions stage graph |
| Inline executable payloads in template *definitions* | **None** (closed DSL + registry executorRefs) |
| Client-side Claude for pipeline reasoning | **Not found** on client surfaces |
| Formal pipes-4 RED FAIL artifact at `.spec/reviews/sprint-22/pipes-4-red-evidence.md` | **MISSING** → **HIGH** |

Collapse architecture is sound. Formal AC-4/TC-4 evidence file required by the task contract is absent, so this review **does not rubber-stamp APPROVED**.

---

## HIGH (must fix)

### H1 — Missing pipes-4 RED evidence file [AC-4 / TC-4]

- **Contract verify**:  
  `git log --oneline --all | grep 'pipes-4 RED' | head -1 && test -f .spec/reviews/sprint-22/pipes-4-red-evidence.md`  
  and TC-4: file must contain `FAIL`.
- **Observed**:
  - RED commit **exists**: `678c89a8 pipes-4 RED: failing integration suite for pipeline templates / no-shells / publish`
  - RED suite files exist under `services/platform/tests/integration/red-*.test.ts` (+ path stubs under `src/__tests__/integration/`)
  - Evidence dir expected by helpers: `.tmp/pipes-4/` — **not present in worktree**
  - Formal path **`.spec/reviews/sprint-22/pipes-4-red-evidence.md` — does not exist**
- **Why HIGH**: pipes-5 MUST never approve without verifying RED test output. Git lineage proves a RED commit landed before GREEN, but the captured FAIL transcript required by the contract was never checked in.
- **Remediation** (implementer / follow-up): either
  1. Recover historical RED stdout from the pipes-4 run environment and commit `.spec/reviews/sprint-22/pipes-4-red-evidence.md` containing real `FAIL` lines, **or**
  2. Re-baseline: document an accepted lineage-only substitute in the task contract (not invent FAIL logs).

---

## MEDIUM (fix soon)

### M1 — AC-1 formal import grep is false-positive on shared templates

- Contract: `grep -r 'from.*whatsnew' services/platform/src --include='*.ts' | wc -l | grep 0`
- Live hits are **legitimate** shared-template imports:
  - `services/platform/src/mission/runtime.ts` → `./templates/whatsnew.ts`
  - `services/platform/src/mission/templates/ensure-system.ts` → `./whatsnew.ts`
- Intent of AC-1 (“no imports of **deleted per-domain modules**”) is satisfied:
  - No `services/platform/src/{whatsnew,assimilate,shop,subscriptions}/` dirs
  - No imports of those shell paths outside allowed templates/schemas/db
- **Remediation**: tighten verify to exclude `mission/templates/` (or grep for old shell paths only).

### M2 — TC-5 / AC-5 broad `function` grep false-positives

- Contract greps `inlineZod|rawSql|\bjs\b|javascript|executable|function` across `templates/*.ts`.
- Hits are TypeScript `function` / `export function` in helper modules (`pipeline-components.ts`, `business-report-components.ts`, resolvers) — **not** template payload keys.
- Refined check of the six **definition** files (`evidence-research`, `business-report`, `whatsnew`, `assimilate`, `shop`, `subscriptions`): **zero** `inlineZod` / `rawSql` / `javascript` / `executable` / `new Function` / `eval(` payload keys.
- Stage graphs use only closed `executorRef` strings (e.g. `builtin.whatsnew-plan@1`, `subworkflow:evidence-research`).
- **Remediation**: scope TC-5 to payload keys inside `stageGraph` / definition objects, not TS keywords.

### M3 — Immutable template drift on re-register (nonprod)

- Re-running `ensureSystemMissionTemplates` against `holocron_nonprod` failed:
  `immutable mission template conflict for evidence-research@1.0.2 … drifted … fleet_manifest_path`
- Rows already present and queryable (6/6). Drift is environment/manifest path, not missing templates.
- **Remediation**: pin `fleet_manifest_path` at compile time or document re-register override path.

### M4 — Live `holocron` (prod-like) DB has 0 mission_templates rows

- Registration correctly refuses production-like DB name `holocron` without `HOLO_DANGEROUS_ALLOW_PROD_DB=1`.
- Operator path is `holocron_nonprod` + ensure-system / mission run. Document for operators.

---

## LOW (track)

### L1 — `subworkflow:evidence-research` is a template-string constant

- Source uses `` `subworkflow:${EVIDENCE_RESEARCH_TEMPLATE_KEY}` ``; stage sets `executorRef: SUBWORKFLOW_EVIDENCE_RESEARCH_REF`.
- Runtime value verified: `subworkflow:evidence-research` (see `.tmp/pipes-5/final-verify-bundle.txt`).
- Comment/description strings also contain the literal (grep count ≥ 1). Fine; optional to inline literal for greppability.

### L2 — Helper modules sit under `templates/`

- `pipeline-components.ts` / `business-report-components.ts` are deterministic gather/scaffold helpers, not closed DSL payloads. Naming is slightly confusing vs “pure template definitions.”

---

## Acceptance criteria

### AC-1: Per-domain modules deleted — **SATISFIED**

| Check | Result | Evidence |
|---|---|---|
| `find … whatsnew\|assimilate\|shop\|subscriptions` under `services/platform/src` | **0** | `.tmp/pipes-5/ac1-per-domain-modules.txt`, `VERIFICATION-SNAPSHOT.txt` |
| Platform shell dirs | absent | `.tmp/pipes-5/ac1-refined.txt` |
| `holo verify:no-shells` | **0 per-domain modules found**, exit 0 | `.tmp/pipes-5/holo-verify-no-shells-run.txt`, `final-verify-bundle.txt` |
| Convex agentic files | all contain `MIGRATED_TO_MISSION_ENGINE`; no Anthropic/LLM calls | `.tmp/pipes-5/convex-migrated-stubs.txt`, `convex-stub-depth.txt` |

**Note**: literal import-grep half of AC-1 verify fails on shared template imports (M1); intent satisfied.

### AC-2: Shared templates used by all pipelines — **SATISFIED**

Source files:

- `evidence-research.ts`, `business-report.ts`, `whatsnew.ts`, `assimilate.ts`, `shop.ts`, `subscriptions.ts`
- Registered via `ensure-system.ts` `SYSTEM_TEMPLATES` (all six)

Live DB (`DATABASE_URL=postgres://postgres:postgres@localhost:5432/holocron_nonprod`):

```
assimilate        1.0.0
business-report   1.0.1
evidence-research 1.0.2
shop              1.0.0
subscriptions     1.0.0
whatsnew          1.0.0
```

`COUNT(DISTINCT template_key) = 6` — TC-2 PASS.  
Evidence: `.tmp/pipes-5/ac2-nonprod-register.txt`, `final-verify-bundle.txt`, `VERIFICATION-SNAPSHOT.txt`.

### AC-3: Sub-workflow uses template reference — **SATISFIED**

- File: `services/platform/src/mission/templates/subscriptions.ts`
- `SUBWORKFLOW_EVIDENCE_RESEARCH_REF === 'subworkflow:evidence-research'`
- Stage `research_subworkflow.executorRef` resolves to that value (not a direct research executor chain)
- No `executor_ref` alternate field; builtins used only for plan/checkpoint/publish/commit
- Evidence: `.tmp/pipes-5/ac3-subworkflow-refs.txt`, `subscriptions-template-full.txt`, `final-verify-bundle.txt`

### AC-4: TDD RED evidence exists — **NOT SATISFIED**

| Check | Result |
|---|---|
| `git log … \| grep 'pipes-4 RED'` | **PASS** — `678c89a8` |
| RED suite in tree | **PASS** — 5 red tests + helpers |
| Lineage RED → pipes-1 → pipes-2 → pipes-3 | **PASS** (see snapshot) |
| `.spec/reviews/sprint-22/pipes-4-red-evidence.md` | **FAIL — missing** |
| File contains `FAIL` | **FAIL — N/A** |

Evidence: `.tmp/pipes-5/ac4-tdd-red-evidence.txt`, `ac4-red-deeper.txt`, `VERIFICATION-SNAPSHOT.txt`.  
See **H1**.

### AC-5: No inline executable payloads — **SATISFIED** (intent)

- Six definition files: pure `MissionTemplateDefinition` data; executors are registry refs
- No `inlineZod` / `rawSql` / embedded JS payload keys in stage graphs
- Reasoning path is server-side mission runtime + fleet (`services/platform/src/mission/runtime.ts`, inference escape only under budgeted server path)
- No client-side Claude/Anthropic usage found for pipeline reasoning
- Literal TC-5 grep fails on TS `function` keyword (M2) — **not** a payload injection finding

Evidence: `.tmp/pipes-5/ac5-no-executable-payloads.txt`, `ac5-refined-payloads.txt`, `final-verify-bundle.txt`.

---

## Test criteria

| ID | Maps to | Satisfied | Evidence |
|---|---|---|---|
| TC-1 | AC-1 | **yes** | `directory_count=0` |
| TC-2 | AC-2 | **yes** | `distinct_count=6` on `holocron_nonprod` |
| TC-3 | AC-3 | **yes** | grep / runtime expand of `subworkflow:evidence-research` |
| TC-4 | AC-4 | **no** | missing `.spec/reviews/sprint-22/pipes-4-red-evidence.md` |
| TC-5 | AC-5 | **yes** (intent) | definition payloads clean; broad grep is false-positive |

---

## Stub detection (mastra-patterns)

Scoped to mission templates / pipeline collapse surface:

| Pattern | Result |
|---|---|
| Fake-success `execute: async () => ({ok:true})` in templates | N/A — templates are declarative, not createTool |
| `z.any()` on pipeline schemas | Not observed in pipeline-templates schema path during this review |
| `vi.mock('@mastra…')` in pipes integration tests | Not present in pipes-4 red suite design (real Postgres+fleet) |
| Convex residual “shells” still executing pipelines | **No** — thin stubs only, marker present |
| `holo verify:no-shells` | **0** |

Note: deterministic gather helpers in `pipeline-components.ts` are labeled scaffolding for plan/gather stages; fleet assay is fail-closed on empty text per pipes-3 FIX (`c1f54760`). Not treated as SUPREME RULE stubs for this review’s DRY-collapse scope.

---

## Plan-vs-implementation drift

| Planner intent | Shipped | Drift? |
|---|---|---|
| Delete per-domain modules | Deleted platform shells; Convex residuals stubbed | Honest residual path (documented by no-shells scanner) — **acceptable** |
| 6 shared templates | 6 source defs + 6 DB rows | None |
| Sub-workflow template ref | `subworkflow:evidence-research` | None |
| RED first (pipes-4) | RED commit + suite present; FAIL artifact missing | **Process drift — H1** |
| No executable template payloads | Closed DSL + registry | None (helpers are TS modules, not payload keys) |
| No client Claude reasoning | Server/fleet only for pipelines | None observed |

---

## Verification evidence reviewed

1. **Live CLI**: `bun services/platform/src/cli/holo.ts verify:no-shells` → `0 per-domain modules found`
2. **Live DB**: `psql` against `holocron_nonprod.mission_templates` → 6 keys
3. **Filesystem**: find/grep for shells, templates, convex markers
4. **Runtime expand**: bun import of `subscriptionsTemplateDefinition` executorRef
5. **Git**: `678c89a8` RED → `976a7cba`/`916ad768`/`d4ae96bd` GREEN lineage
6. **Missing**: Studio screenshot N/A (not a Studio agent task); RED FAIL transcript file **absent**

Captured under:

- `.tmp/pipes-5/VERIFICATION-SNAPSHOT.txt`
- `.tmp/pipes-5/ac1-*.txt`, `ac2-*.txt`, `ac3-*.txt`, `ac4-*.txt`, `ac5-*.txt`
- `.tmp/pipes-5/holo-verify-no-shells-run.txt`
- `.tmp/pipes-5/convex-*.txt`
- `.tmp/pipes-5/final-verify-bundle.txt`

Also mirrored at: `.spec/reviews/sprint-22/pipes-5-dry-collapse-review.md`

---

## Quality gate (reviewer self-check)

- [x] Read planner task `pipes-5-review-dry-collapse.md`
- [x] Read changed surfaces (templates, verify-no-shells, ensure-system, convex stubs, subscriptions)
- [x] Verified RED commit exists; noted missing FAIL artifact
- [x] Ran no-shells / find / psql / subworkflow expand
- [x] Findings cite paths / commands
- [x] No rubber-stamp; verdict explicit: **NEEDS_FIXES**

---

## Required follow-up before APPROVED

1. **H1**: Commit real RED FAIL capture to `.spec/reviews/sprint-22/pipes-4-red-evidence.md` (or renegotiate AC-4 contract to accept lineage-only with an explicit amendment).
2. Optional: tighten AC-1/TC-5 greps (M1/M2) so future gate runs do not false-fail.
