# REDHAT-FIX-RH-S30-35 — C-2 residual: current executable HEAD must be gate-covered (reject post-source runtime drift)

> **Task ID:** REDHAT-FIX-RH-S30-35
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** HIGH
> **Source finding:** C-2 residual (executable-HEAD coverage)
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T114032Z-eighth-independent-final-closeout.md` (eighth independent final closeout @ 9151324a)
> **Proposed by:** `devops-engineer`
> **TDD:** red_first · RED_GREEN_REQUIRED=yes · seeded_evidence=yes
> Status: Implemented on tip package 20260807T115948Z — dual-lens independent re-review pending; Sprint In Progress
> **Branch:** implementer task branch; plan-only on main via orchestrator; unreviewed NEVER merges; merge only after dual-lens APPROVED via `kb-orchestrate` `references/merge-to-main.sh` (orchestrator-only)

## Finding

**C-2 — HEAD predicate treats old gate evidence as current after runtime changes.** Severity: **HIGH**. Confidence: **HIGH**.

### What works (preserve)

- P1/A1/lock object binding (`hist_oid == sub_oid`)
- `ASSERT_PACKAGE_HEAD` lock blob OID bind (RH-S30-29)
- C-2-atomic-v5 protocol

### What remains broken

Package `20260807T113518Z` ran source `74c3846c…`. Later commits introduced durable control-plane re-arm scripts (`8b681dcc…`) and gate-ledger reset + modified `run-sprint30-human-gate.sh` (tip `9151324a…`). Neither is in the source revision recorded by the 113518Z gate. C-2 assertion passes because it only demands that source be an **ancestor** of P1 (`scripts/assert-gate-evidence-containment.sh:197-204`) and that old lock/results blobs remain at HEAD (`:206-228`). This is object-integrity, **not** executable-HEAD coverage.

**Required remediation:** Commit runtime first; execute/package a new gate whose `git_sha`, `source_sha_at_run`, and deployed `sourceRevision` equal that committed source. Make C-2 assertion reject non-evidence/runtime changes after the gate source (Option A fail-closed allowlist delta). Fresh source-matching package required; historical 113518Z alone cannot certify current tip.

## Design (Option A — chosen)

When `ASSERT_PACKAGE_HEAD=1` (default) and/or `ASSERT_SOURCE_HEAD=1` (default ON with PACKAGE_HEAD), after existing C-2-atomic-v5 object integrity succeeds:

1. Resolve `source_sha_at_run` from submitted results (40-hex).
2. Compute post-source path delta: `git diff --name-only --diff-filter=ACMRTUXB <source_sha_at_run>..HEAD`.
3. Every changed path MUST match the fail-closed **post-package allowlist** (evidence/meta only).
4. Fail with explicit wording containing `executable-HEAD` / `post-source runtime` / `source_sha_at_run` coverage.

**Allowlist (evidence/meta ONLY):** sprint `.gate-evidence/**`, `evidence-attestation.json`, `evidence-attestation.lock.json`, `gate-results.json`, `gate-verification.json(.raw)`, post-package assert JSON under the sprint evidence tree.

**NEVER allowlisted:** `scripts/**`, `services/**`, `convex/**`, `apps/**`, `packages/**`, or other product/runtime paths.

Ancestor-only `source ⊆ package_commit` remains necessary but **not sufficient**. `ASSERT_SOURCE_HEAD=0` is test-only; package path forces coverage ON.

## Scope (WRITE-ALLOWED)

- `scripts/assert-gate-evidence-containment.sh` (source/HEAD coverage predicate)
- `scripts/assert-human-test-verdict.sh` (must not weaken; may pass through `ASSERT_SOURCE_HEAD`)
- `scripts/package-sprint30-gate-evidence.sh` (record/export source binding; force coverage on)
- `scripts/run-sprint30-human-gate.sh` (source_sha_at_run / sourceRevision honesty only if needed)
- Optional `scripts/assert-c2-source-head-coverage-negative.sh` (NEW)
- Optional allowlist file for post-package-only paths (evidence/meta only)
- `.tmp/REDHAT-FIX-RH-S30-35/**`
- Cross-link `REDHAT-FIX-RH-S30-29.md` / `REDHAT-FIX-RH-S30-32.md` disposition
- **Does not** invent gate pass evidence; **does not** re-open C-3/M-3 product oracles
- **Does not** weaken `hist_oid==sub_oid` or HEAD lock OID bind

## Acceptance Criteria

- [ ] **AC-1 (PRIMARY)** C-2 assert rejects residual class: runtime scripts (or other non-allowlisted paths) changed after `source_sha_at_run` while ancestor-only + lock/results retention would still pass. Non-zero exit with explicit executable-HEAD / post-source runtime wording.
- [ ] **AC-2** Positive path when `source_sha_at_run` / `sourceRevision` / `git_sha` match the committed gated source and HEAD has only allowlisted evidence/meta post-source delta. `assert_rc=0`, `blob_identity_ok=true`, `source_head_coverage_ok=true`.
- [ ] **AC-3** Fresh gate package after runtime commits: commit runtime first → redeploy so live `sourceRevision` equals that source → run human gate → package with equal binding; C-2-atomic-v5 retained. Package forces `ASSERT_PACKAGE_HEAD=1` + source-head coverage ON (never inherits silent disable).
- [ ] **AC-4** Historical `20260807T113518Z` alone **cannot** certify tip `9151324a` (or any tip with non-allowlisted post-source runtime delta vs source `74c3846c…`) under the new predicate — even if `hist_oid==sub_oid` and HEAD lock OID still match.
- [ ] **AC-5** Object integrity preserved: `hist_oid==sub_oid`, attestation git-bound, HEAD lock OID bind (RH-S30-29), C-2-atomic-v5 protocol. Do not weaken blob identity to close this residual.
- [ ] **AC-6** Negative fixture documents residual and fails assert: disposable Git-backed v5 package→attestation→lock with `source_sha_at_run=S0`, then post-source commit changing `scripts/**` while retaining lock/results blobs; assert fails on executable-HEAD coverage. Optional `assert-c2-source-head-coverage-negative.sh`.
- [ ] **AC-7** Disposition supersedes RH-S30-29 residual for **executable-HEAD coverage only**; RED baseline at reviewed tip `9151324a`; cross-link RH-S30-32 package as historical object-bound but not tip-certifying under new predicate.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Post-source runtime script change fails with executable-HEAD wording | AC-1 | `ac1-runtime-drift-negative.*` |
| TC-2 | Allowlist-only delta positive path exits 0 with `source_head_coverage_ok` | AC-2 | `ac2-positive-source-head.*` |
| TC-3 | Fresh package records equal git_sha/source_sha_at_run/sourceRevision | AC-3 | `ac3-fresh-package-binding.*` |
| TC-4 | 113518Z under tip with post-74c3846c runtime fails new predicate | AC-4 | `ac4-historical-113518Z-vs-tip-fail.*` |
| TC-5 | hist_oid==sub_oid + HEAD lock OID still enforced | AC-5 | `ac5-object-integrity.*` + e1-bind negative |
| TC-6 | Disposable negative harness: v5 chain then runtime commit after S0 | AC-6 | `assert-c2-source-head-coverage-negative.sh` |
| TC-7 | RED baseline + disposition supersedes RH-S30-29 executable-HEAD residual only | AC-7 | `ac7-red-*` + `ac7-disposition.md` |
| TC-8 | Allowlist boundary: `scripts/**` never allowed; evidence-only ok | AC-1 | `ac1-allowlist-boundary.*` |
| TC-9 | human-test-verdict does not weaken; fails closed on residual fixture | AC-2 | `ac2-htv-passthrough.*` |
| TC-10 | package forces source-head assert on; does not silent-disable | AC-3 | `ac3-package-env-audit.txt` |

## Anti-stub

- Ancestor-only `source_sha_at_run` ⊆ `package_commit` is **NOT** executable-HEAD coverage.
- Lock/results blob retention at HEAD alone is **NOT** source coverage.
- `hist_oid==sub_oid` alone does **NOT** close post-source runtime drift.
- RH-S30-29 HEAD lock OID bind alone does **NOT** prove current runtime was gated.
- Historical `20260807T113518Z` alone **cannot** certify tip `9151324a`.
- Allowlisting `scripts/**` or `services/**` is a false green.
- Invented gate pass evidence / hand-edited SHAs are **NOT** proof.
- Harness skip exit 0 is **NOT** a pass.

## Critical Constraints

- **MUST** fail closed on any non-allowlisted path in `source_sha_at_run..HEAD` under production assert defaults
- **MUST** preserve P1/A1/lock OID chain and ASSERT_PACKAGE_HEAD lock bind
- **MUST** require fresh source-matching package for tip approval
- **MUST** use real git oracles (diff/rev-parse/cat-file); no mocked git
- **MUST** implementer branch; merge only after dual-lens APPROVED (orchestrator-only)
- **NEVER** expand allowlist to product/runtime scripts
- **NEVER** invent pass evidence; never re-open C-3/M-3 product oracles
- **STRICTLY** disposition supersedes RH-S30-29 residual for executable-HEAD coverage only
- **STRICTLY** red_first: record residual RED (old pass / new fail) before green

## Evidence

`.tmp/REDHAT-FIX-RH-S30-35/`

| Artifact | Proves |
|----------|--------|
| `ac1-runtime-drift-negative.*` | AC-1 residual rejected |
| `ac1-allowlist-boundary.*` | TC-8 allowlist |
| `ac2-positive-source-head.*` | AC-2 positive |
| `ac2-htv-passthrough.*` | TC-9 HTV |
| `ac3-fresh-package-binding.*` | AC-3 |
| `ac3-package-env-audit.txt` | Package forces coverage on |
| `ac4-historical-113518Z-vs-tip-fail.*` | AC-4 |
| `ac5-object-integrity.*` | AC-5 |
| `ac6-*` | AC-6 disposable negative |
| `ac7-red-*` + `ac7-disposition.md` | AC-7 |

## Reading List

- Closeout C-2 HIGH @ 9151324a — `.spec/reviews/red-hat-sprint-30-20260807T114032Z-eighth-independent-final-closeout.md:43-47`
- `scripts/assert-gate-evidence-containment.sh:197-228` — ancestor-only + lock/results retention gap
- `scripts/package-sprint30-gate-evidence.sh` — source binding / post-package assert
- `scripts/assert-human-test-verdict.sh` — containment passthrough
- `scripts/assert-c2-e1-bind-mismatch-negative.sh` — disposable v5 negative pattern
- `REDHAT-FIX-RH-S30-29.md` — HEAD lock OID (preserve)
- `REDHAT-FIX-RH-S30-32.md` — package 113518Z (historical only)

## Design

- **Pattern:** Option A fail-closed post-source path-delta allowlist (evidence/meta only) under `ASSERT_PACKAGE_HEAD=1` / `ASSERT_SOURCE_HEAD=1`. Package forces coverage on. Negative harness builds v5 chain then adds runtime path commit after S0. Fresh gate: commit runtime → redeploy sourceRevision → gate → package with equal binding.
- **Anti-pattern:** Ancestor-only source check as coverage; lock/results retention as coverage; allowlisting `scripts/**`; claiming 113518Z certifies tip 9151324a.

## Disposition

HIGH residual after RH-S30-29 closed HEAD-lock OID bind: C-2 still treats historical package object integrity as current executable-HEAD coverage. Close by Option A fail-closed post-source runtime-tree/allowlist coverage + fresh source-matching package. Supersedes RH-S30-29 residual for **executable-HEAD coverage only**. Do not approve Sprint 30 on 113518Z alone.

AGENT: implementer=devops-engineer | proposed_by=devops-engineer | technical-reviewer=code-reviewer | standing-test-reality=test-quality-reviewer  
planned_at: 2026-08-07T12:15:00Z  
finding_ids: [C-2, REDHAT-FIX-RH-S30-35, REDHAT-FIX-RH-S30-29, REDHAT-FIX-RH-S30-32]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-RH-S30-35",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "proposed_by": "devops-engineer",
  "agent": "devops-engineer",
  "touches_capabilities": ["CAP-CUT-01"],
  "design_option": "A-fail-closed-post-source-allowlist",
  "branch_discipline": "implementer task branch; merge only after dual-lens APPROVED via kb-orchestrate references/merge-to-main.sh",
  "fixtures": {
    "residual_tip_9151324a_vs_113518Z_source_74c3846c": {
      "description": "Real residual: package source 74c3846c; tip 9151324a has post-source runtime scripts",
      "seed_method": "recorded_external+git"
    },
    "disposable_v5_then_runtime_script_drift": {
      "description": "v5 chain then scripts/** change after S0; assert must fail",
      "seed_method": "git"
    },
    "disposable_v5_allowlist_only_post_package": {
      "description": "v5 chain then only evidence/meta after S0; assert must pass",
      "seed_method": "git"
    },
    "fresh_source_matching_package_post_runtime": {
      "description": "Real gate+package with equal source binding after runtime commit",
      "seed_method": "cli+git"
    }
  },
  "requirements": [
    {"id": "AC-1", "type": "acceptance_criterion", "description": "C-2 assert rejects post-source runtime drift while ancestor-only would pass", "verify": "ac1-runtime-drift-negative"},
    {"id": "AC-2", "type": "acceptance_criterion", "description": "Positive path: equal source binding + allowlist-only delta", "verify": "ac2-positive-source-head"},
    {"id": "AC-3", "type": "acceptance_criterion", "description": "Fresh gate package with equal git_sha/source_sha_at_run/sourceRevision; package forces coverage on", "verify": "ac3-fresh-package-binding + ac3-package-env-audit"},
    {"id": "AC-4", "type": "acceptance_criterion", "description": "Historical 113518Z alone cannot certify tip 9151324a", "verify": "ac4-historical-113518Z-vs-tip-fail"},
    {"id": "AC-5", "type": "acceptance_criterion", "description": "Object integrity hist_oid==sub_oid and HEAD lock OID bind preserved", "verify": "ac5-object-integrity"},
    {"id": "AC-6", "type": "acceptance_criterion", "description": "Negative fixture documents residual and fails assert", "verify": "ac6 + assert-c2-source-head-coverage-negative"},
    {"id": "AC-7", "type": "acceptance_criterion", "description": "Disposition supersedes RH-S30-29 for executable-HEAD coverage only; RED at 9151324a", "verify": "ac7-*"},
    {"id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Runtime drift fails with executable-HEAD wording", "verify": "ac1"},
    {"id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Allowlist-only positive path", "verify": "ac2"},
    {"id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "Fresh equal source binding", "verify": "ac3"},
    {"id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "113518Z cannot certify 9151324a", "verify": "ac4"},
    {"id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "Object integrity preserved", "verify": "ac5"},
    {"id": "TC-6", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "Disposable negative harness", "verify": "ac6"},
    {"id": "TC-7", "type": "test_criterion", "maps_to_ac": "AC-7", "description": "RED + disposition", "verify": "ac7"},
    {"id": "TC-8", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Allowlist boundary scripts/** never allowed", "verify": "ac1-allowlist-boundary"},
    {"id": "TC-9", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "HTV non-weakening", "verify": "ac2-htv"},
    {"id": "TC-10", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "Package forces source-head assert on", "verify": "ac3-package-env-audit"}
  ]
}
-->
