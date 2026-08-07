# REDHAT-FIX-RH-S30-34 — M-3 residual: production-path RED/mutation capture must require real Vitest and real runEnableWrites identity oracle

> **Task ID:** REDHAT-FIX-RH-S30-34
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `mastra-implementer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** CRITICAL
> **Source finding:** M-3 residual (RED/mutation theatre / missing Vitest)
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T114032Z-eighth-independent-final-closeout.md` (eighth independent final closeout @ 9151324a)
> **Proposed by:** `mastra-planner`
> **TDD:** red_first · RED_GREEN_REQUIRED=yes · seeded_evidence=yes
> Status: Implemented on tip package 20260807T115948Z — dual-lens independent re-review pending; Sprint In Progress
> **Branch:** implementer task branch; plan-only on main via orchestrator; unreviewed NEVER merges; merge only after dual-lens APPROVED via `kb-orchestrate` `references/merge-to-main.sh` (orchestrator-only)

## Finding

**M-3 — RED/mutation control can pass when Vitest never ran and is disconnected from production M-3 behavior.** Severity: **CRITICAL**. Confidence: **HIGH**.

### What works (structural)

- Package-bound `m3-identity/` tree, fail-closed package staging, valid non-self manifest, and object binding from RH-S30-31/32 remain structurally sound.
- Real production M-3 integration oracle exists at `services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts:408-483` (`runEnableWrites` / independent HTTP-201 / reselect_miss).

### What remains broken

1. `scripts/capture-m3-identity-red-mutation.sh:20-59` synthesizes an untracked unit fixture with only synthetic IDs and `expect()` calls — no production import.
2. Capture accepts any nonzero exit (`:42-44`, `:65-73`); isolated worktree succeeded with `exit_code=127` and `vitest: command not found`.
3. Metadata prepend (`:47-59`) injects FAIL/expect/vitest labels that satisfy `assert-m3-identity-evidence.sh:77-119` even when framework never executed.
4. Capture never imports or mutates the real production M-3 path.

**Required remediation:** Require `command -v vitest` and expected Vitest failure code; validate raw framework output **before** metadata; reject command-not-found / exit 127; replace synthetic fixture with controlled mutation of actual `runEnableWrites` / independent HTTP-201 identity path; assert rejects 127 theatre; fresh honest package.

## Scope (WRITE-ALLOWED)

- `scripts/capture-m3-identity-red-mutation.sh`
- `scripts/assert-m3-identity-evidence.sh` (signature / exit-code rigor)
- `services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts` (controlled mutation hook only — **do not** weaken oracles)
- Optional `scripts/assert-m3-red-mutation-negative.sh` (NEW)
- Optional promote/package wiring for m3-identity only
- `.tmp/REDHAT-FIX-RH-S30-34/**`
- Cross-link `REDHAT-FIX-RH-S30-31.md` / `REDHAT-FIX-RH-S30-32.md` disposition
- **Does not** re-open C-2/C-3 product predicates
- **Does not** invent RED logs; real vitest only

## Acceptance Criteria

- [ ] **AC-1 (PRIMARY)** Capture requires `command -v vitest` (with `node_modules/.bin` on PATH check); exits non-zero when binary missing; does not certify RED from missing binary.
- [ ] **AC-2** Capture rejects `exit_code=127` / `command not found` even if FAIL/expect/vitest labels would be prepended; residual any-nonzero-accept is removed.
- [ ] **AC-3** Capture uses controlled, disposable mutation of the **actual** production M-3 path (`runEnableWrites` / `independentHttp201Id` / `reselect_miss` in `sprint30-redhat-rh-s30.test.ts`), not a synthetic-only unit fixture. Production source restored after capture (no weakened oracle committed).
- [ ] **AC-4** Raw vitest transcript validated **before** metadata prepend; requires real `FAIL` / `AssertionError` / `Tests N failed` from framework output. Metadata alone is insufficient.
- [ ] **AC-5** `assert-m3-identity-evidence.sh` rejects package transcripts with `exit_code=127` or `command not found` even when FAIL/expect/vitest labels are present.
- [ ] **AC-6** Negative fixture of residual capture shape (synthetic + exit 127) fails assert. Optional `assert-m3-red-mutation-negative.sh`.
- [ ] **AC-7** Positive path: real vitest RED from production-path mutation stages into package-bound `m3-identity` and assert exits 0. Fresh package after fix.
- [ ] **AC-8** Disposition supersedes RH-S30-31 residual for **RED/mutation capture honesty only** (package tree contract remains). RH-S30-05 + independent 201 still green; `allowFileFallback:false` retained. Does not re-open C-2/C-3.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Capture exits ≠ 0 when vitest missing | AC-1 | PATH-stripped capture |
| TC-2 | Capture source has `command -v vitest` before run | AC-1 | `rg` capture script |
| TC-3 | Capture rejects RED_RC=127 / command not found | AC-2 | `rg` + residual shape |
| TC-4 | Capture mutates production M-3 path | AC-3 | `rg runEnableWrites\|sprint30-redhat` |
| TC-5 | Production oracle restored after capture | AC-3 | `git diff --exit-code` post-capture |
| TC-6 | Raw FAIL checked before metadata prepend | AC-4 | script order audit |
| TC-7 | Assert rejects exit_code=127 package transcript | AC-5 | assert on negative fixture |
| TC-8 | Assert rejects command-not-found despite FAIL labels | AC-5 | assert errors |
| TC-9 | Negative residual fixture fails assert | AC-6 | negative harness |
| TC-10 | Positive real vitest RED packages assert exit 0 | AC-7 | capture → stage → assert |
| TC-11 | Positive transcript has framework body (not metadata-only) | AC-4 | `rg AssertionError\|Test Files` |
| TC-12 | PLATFORM_IT suite green (RH-S30-05 + independent 201) | AC-8 | vitest integration |
| TC-13 | `allowFileFallback:false` retained | AC-8 | `rg` |
| TC-14 | Package still requires RED + mutation files (RH-S30-31/32) | AC-7 | `rg` package + assert |

## Anti-stub

- `vitest: command not found` is **NOT** RED.
- Synthetic-only unit fixture without production import is **NOT** production-path mutation.
- Prepending FAIL labels to empty/missing-binary output is **NOT** closed.
- Accepting any nonzero exit (including 127) as mutation success is **NOT** closed.
- Assert `ok:true` on 127 theatre transcripts is **NOT** M-3 closed.
- Do not invent RED logs; real vitest only.
- Do not weaken RH-S30-05 / independent 201 oracles or `allowFileFallback:false`.
- Do not re-open C-2/C-3 product under this task.

## Critical Constraints

- **MUST** require `command -v vitest` before capture success
- **MUST** validate raw framework FAIL signatures before metadata prepend
- **MUST** reject exit 127 / command-not-found in capture and assert
- **MUST** mutate production M-3 path (restore after); not synthetic-only sole source
- **MUST** keep RH-S30-05 + independent 201 green; retain `allowFileFallback:false`
- **MUST** implementer branch; merge only after dual-lens APPROVED (orchestrator-only)
- **NEVER** treat command-not-found as RED; never invent RED logs
- **NEVER** commit a permanently weakened production oracle
- **STRICTLY** disposition supersedes RH-S30-31 residual for capture honesty only
- **STRICTLY** package-bound m3-identity fail-closed contract from RH-S30-31/32 is not regressed

## Evidence

`.tmp/REDHAT-FIX-RH-S30-34/`

| Artifact | Proves |
|----------|--------|
| `missing-vitest-out/**` | AC-1 capture fails closed |
| `negative-exit-127-evidence/**` / `negative-residual-fixture/**` | AC-5 / AC-6 |
| `positive-red-mutation/**` | AC-7 raw + packaged RED |
| `assert-negative.json` / assert positive JSON | AC-5 / AC-7 |
| `ac8-platform-it-green.txt` | AC-8 regression |
| `ac8-disposition.md` | supersede capture-honesty residual |

## Reading List

- Closeout M-3 CRITICAL @ 9151324a — `.spec/reviews/red-hat-sprint-30-20260807T114032Z-eighth-independent-final-closeout.md:37-41,59`
- `scripts/capture-m3-identity-red-mutation.sh:20-73`
- `scripts/assert-m3-identity-evidence.sh:77-119`
- `services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts:408-483` — production oracle (do not weaken)
- `REDHAT-FIX-RH-S30-31.md` / `REDHAT-FIX-RH-S30-32.md` — package-bound tree (preserve)

## Design

- **Pattern:** (1) RED prove capture exits 0 under missing vitest and assert accepts 127 theatre. (2) Capture: `command -v vitest`; controlled disposable mutation of production reselect/`independentHttp201Id` oracle under trap cleanup; validate raw FAIL/AssertionError/Tests N failed + reject 127 **before** metadata; require expected vitest failure code (typically 1). (3) Assert: hard-fail if RED/mutation text matches `exit_code=127` or `command not found` regardless of FAIL/expect labels. (4) Negative fixture + optional negative harness. (5) Positive package assert. (6) PLATFORM_IT regression green.
- **Anti-pattern:** Synthetic-only local string IDs; accept any nonzero exit; prepend labels that satisfy assert without framework execution; leave production oracle weakened in tree.

## Disposition

CRITICAL M-3 residual after RH-S30-31/32 package-bound tree: capture honesty only. Close by requiring real vitest + raw framework FAIL before metadata, production-path mutation, and assert rejection of 127 theatre. Supersedes RH-S30-31 residual for **capture honesty only**. Sprint 30 remains **In Progress** until dual-lens APPROVED on a landed SHA with honest production-path RED/mutation evidence.

AGENT: implementer=mastra-implementer | proposed_by=mastra-planner | technical-reviewer=mastra-reviewer | standing-test-reality=test-quality-reviewer  
planned_at: 2026-08-07T12:15:00Z  
finding_ids: [M-3, REDHAT-FIX-RH-S30-34, REDHAT-FIX-RH-S30-31, REDHAT-FIX-RH-S30-32, REDHAT-FIX-RH-S30-22, REDHAT-FIX-RH-S30-25]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-RH-S30-34",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "proposed_by": "mastra-planner",
  "agent": "mastra-implementer",
  "touches_capabilities": ["CAP-CUT-01"],
  "branch_discipline": "implementer task branch; merge only after dual-lens APPROVED via kb-orchestrate references/merge-to-main.sh",
  "fixtures": {
    "residual_exit_127_command_not_found": {
      "description": "Isolated capture exit_code=127 accepted by assert",
      "seed_method": "recorded_external"
    },
    "production_m3_reselect_identity_oracle": {
      "description": "sprint30-redhat-rh-s30.test.ts:408-483 runEnableWrites reselect_miss + independentHttp201Id",
      "seed_method": "suite"
    },
    "negative_residual_127_package_transcript": {
      "description": "synthetic labels + exit 127 body must fail assert",
      "seed_method": "synthetic_negative_fixture"
    },
    "positive_production_path_red_package": {
      "description": "real vitest RED from production-path mutation packages assert exit 0",
      "seed_method": "suite_emit_then_promote"
    }
  },
  "requirements": [
    {"id": "AC-1", "type": "acceptance_criterion", "description": "capture requires command -v vitest; rejects missing binary", "verify": "PATH-stripped capture non-zero"},
    {"id": "AC-2", "type": "acceptance_criterion", "description": "capture rejects exit 127 / command not found even with prepended labels", "verify": "capture validators"},
    {"id": "AC-3", "type": "acceptance_criterion", "description": "controlled mutation of real production M-3 path not synthetic-only", "verify": "rg production path in capture"},
    {"id": "AC-4", "type": "acceptance_criterion", "description": "raw vitest validated BEFORE metadata prepend", "verify": "script order + raw FAIL"},
    {"id": "AC-5", "type": "acceptance_criterion", "description": "assert rejects 127/command-not-found package transcripts", "verify": "assert on negative fixture"},
    {"id": "AC-6", "type": "acceptance_criterion", "description": "negative residual fixture fails assert", "verify": "assert-m3-red-mutation-negative"},
    {"id": "AC-7", "type": "acceptance_criterion", "description": "positive real vitest RED packages assert exit 0", "verify": "capture+assert"},
    {"id": "AC-8", "type": "acceptance_criterion", "description": "supersede RH-S30-31 capture honesty only; RH-S30-05/201 green; allowFileFallback:false", "verify": "PLATFORM_IT + rg"},
    {"id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "capture exits non-zero when vitest missing", "verify": "PATH-stripped capture"},
    {"id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "command -v vitest in capture", "verify": "rg"},
    {"id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "capture rejects exit 127", "verify": "rg + residual"},
    {"id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "production-path mutation wired", "verify": "rg"},
    {"id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "oracle restored after capture", "verify": "git diff"},
    {"id": "TC-6", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "raw validated before metadata", "verify": "script order"},
    {"id": "TC-7", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "assert rejects exit 127", "verify": "assert fixture"},
    {"id": "TC-8", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "assert rejects command not found despite labels", "verify": "assert errors"},
    {"id": "TC-9", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "negative residual fails", "verify": "negative harness"},
    {"id": "TC-10", "type": "test_criterion", "maps_to_ac": "AC-7", "description": "positive real vitest assert exit 0", "verify": "capture+assert"},
    {"id": "TC-11", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "framework body not metadata-only", "verify": "rg transcript"},
    {"id": "TC-12", "type": "test_criterion", "maps_to_ac": "AC-8", "description": "PLATFORM_IT suite green", "verify": "vitest"},
    {"id": "TC-13", "type": "test_criterion", "maps_to_ac": "AC-8", "description": "allowFileFallback:false retained", "verify": "rg"},
    {"id": "TC-14", "type": "test_criterion", "maps_to_ac": "AC-7", "description": "package requires RED+mutation files", "verify": "rg package assert"}
  ]
}
-->
