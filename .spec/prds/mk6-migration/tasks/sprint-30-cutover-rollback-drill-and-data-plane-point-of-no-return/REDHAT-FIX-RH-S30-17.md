# REDHAT-FIX-RH-S30-17 — Fail-closed Git-tree containment for tip-bound Sprint 30 gate (C-2 re-open)

> **Task ID:** REDHAT-FIX-RH-S30-17
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** CRITICAL
> **Source finding:** C-2 re-opened
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T092237Z-independent-closeout.md` (independent closeout @ 25db7f9e)
> **Proposed by:** `devops-engineer`
> Status: Backlog — plan only (do not treat as fixed until dual-lens APPROVED + landed)

## Finding

**C-2 re-opened — the claimed tip-bound gate is not bound to a commit that carries its evidence.** Confidence: HIGH.

Landed run `20260807T091354Z` binds `git_sha`/`source_sha` to `09aae0dd…`, but that commit does **not** contain `.gate-evidence/20260807T091354Z` (evidence first appears in `5433b6a5`; finalization at `25db7f9e` documents the split as `source_sha` vs `evidence_sha`). RH-S30-10 AC-3 containment is therefore broken: a claimed parent is valid only when it still carries the same evidence tree.

`assert-human-test-verdict.sh` only required a 40-hex SHA; `verify-gate-evidence.sh` still only recomputes log/plan consistency. `package-sprint30-gate-evidence.sh` can rewrite `git_sha` to a pre-amend package SHA then amend to a different final SHA, so it cannot produce a fixed-point evidence-containing binding.

## Scope (WRITE-ALLOWED)

- `scripts/assert-human-test-verdict.sh`
- `scripts/package-sprint30-gate-evidence.sh`
- `scripts/run-sprint30-human-gate.sh`
- `scripts/assert-gate-evidence-containment.sh` (NEW if needed)
- Sprint 30 gate artifacts under
  `.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/`
  (`gate-results.json`, `gate-verification.json`, `gate-verification.json.raw`, `.gate-evidence/<runId>/`)
- Cross-link updates on `REDHAT-FIX-RH-S30-10.md` / this task
- `.tmp/REDHAT-FIX-RH-S30-17/**`
- **Does not** invent pass evidence; only packages real runs

## Acceptance Criteria

- [ ] **AC-1** Fail-closed Git-tree containment: any `gate-results.json` accepted as Sprint 30 remediation proof must have `git_sha` (40-hex) naming a commit for which `git cat-file -e <git_sha>:<sprint>/.gate-evidence/<run_id>/gate-results.json` succeeds. If a two-field pair is used, `source_sha_at_run` / `sourceRevision` may name the deployed source tip while `git_sha` names the evidence-containing package tip; `git_sha` alone is never allowed to name a non-containing source commit.
- [ ] **AC-2** `assert-human-test-verdict.sh` (and/or a dedicated containment checker invoked by the gate/package path) MUST reject the current `09aae0dd` binding for run `20260807T091354Z` (exit non-zero with an explicit C-2 containment error). A pure 40-hex check is insufficient.
- [ ] **AC-3** Atomic packaging protocol is fixed and documented (**C-2-atomic-v2**): either (A) single commit containing source+results+evidence with `git_sha` fixed-point equal to that commit, or (B) two-commit flow where source tip is recorded as `source_sha_at_run` / `sourceRevision` and package tip is `git_sha` after a rewrite+amend **fixed-point loop** until `gate-results.git_sha == HEAD` and `git cat-file -e HEAD:<evidence path>` succeeds. `package-sprint30-gate-evidence.sh` must not leave `git_sha` equal to the pre-amend package SHA while HEAD is the final amend SHA.
- [ ] **AC-4** Fresh real tip-bound gate run after containment tooling lands: new `run_id`, packaged under the fixed protocol so committed `git_sha` names the evidence-containing commit. Do **not** hand-edit results or rebind `20260807T091354Z` by rewriting SHAs in place. Re-run both `assert-human-test-verdict` and `verify-gate-evidence` against the packaged tree; both exit 0.
- [ ] **AC-5** Evidence under `.tmp/REDHAT-FIX-RH-S30-17/` includes negative-control transcript for `09aae0dd`/`20260807T091354Z`, `git show`/`ls-tree`/`cat-file` transcript for the new package, assert+verifier exit-0 JSON, and the atomic protocol note.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | `git cat-file -e` succeeds for claimed `git_sha` + evidence path on accepted package | AC-1 | `git cat-file -e <git_sha>:<path>` |
| TC-2 | assert exits non-zero on historical `20260807T091354Z` bound to `09aae0dd` | AC-2 | assert script + `test $? -ne 0` |
| TC-3 | package script documents and implements fixed-point rebind (`git_sha == HEAD` post-package) | AC-3 | `rg` package script + protocol md |
| TC-4 | Fresh package: assert_rc=0 and verify_rc=0 without hand-edited results | AC-4 | `ac4-assert-and-verify-exit0.json` |
| TC-5 | Evidence dir has real git show/ls-tree transcripts | AC-5 | `ac1-*.txt` + `ac5-ls-tree-*.txt` non-empty |

## Anti-stub

- Do not hand-edit `gate-results.json` / `meta.json` SHAs to invent containment or pass.
- Do not mark C-2 closed solely because `source_is_ancestor_of_evidence` is true while `git_sha` still names a non-containing source commit (the `09aae0dd`/`5433b6a5` pattern).
- Do not satisfy containment by only documenting protocol without a fail-closed assert that rejects non-containing `git_sha`.
- Do not leave package-sprint30-gate-evidence writing pre-amend PACKAGE_SHA into `git_sha` then amending to a different FINAL_SHA without a fixed-point loop.
- Do not claim `verify-gate-evidence` alone proves Git-tree containment.
- Do not rebind the historical `20260807T091354Z` package by rewriting its SHAs in place; produce a fresh real run under the fixed protocol.

## Critical Constraints

- **MUST** fail closed: non-containing `git_sha` ⇒ assert/package exit non-zero
- **MUST** re-run both assert and verifier on the packaged tree; no hand-edited results
- **MUST** preserve source tip identity of the code that ran (`source_sha_at_run` / `sourceRevision`) when `git_sha` is rebound to package tip
- **NEVER** accept `source_sha:09aae0dd` + `evidence_sha:5433b6a5` as closed C-2 without rebinding `git_sha` to a containing commit
- **STRICTLY** containment is path-precise (`git cat-file -e`), not merely ancestor-of-HEAD

## Evidence

`.tmp/REDHAT-FIX-RH-S30-17/`

Required artifacts (minimum):

| Artifact | Proves |
|----------|--------|
| `ac2-negative-09aae0dd-containment-fail.txt` | assert/containment checker rejects non-containing SHA |
| `ac1-git-cat-file-containment.txt` | new package `git_sha` contains evidence path |
| `ac5-ls-tree-evidence-run.txt` | `git ls-tree -r <sha>` lists results + evidence run |
| `ac3-atomic-protocol.md` | C-2-atomic-v2 single-commit or two-commit fixed-point rules |
| `ac4-assert-and-verify-exit0.json` | fresh package assert_rc=0 + verify_rc=0 |
| `ac3-package-script-fixed-point.diff.txt` | package script fixed-point loop land |

## Reading List

- `.spec/reviews/red-hat-sprint-30-20260807T092237Z-independent-closeout.md` — C-2 re-open
- `REDHAT-FIX-RH-S30-10.md` — prior containment AC that re-opened
- `.gate-evidence/20260807T091354Z/gate-results.json` + `redhat-remediation-round2-completion.json`
- `scripts/assert-human-test-verdict.sh`, `scripts/package-sprint30-gate-evidence.sh`, `scripts/run-sprint30-human-gate.sh`
- `scripts/validate-sprint28-full-suite-sequence.sh` — ancestor/tree check pattern

## Disposition

Release-blocking packaging+assertion fix reopening RH-S30-10. Implement fail-closed evidence-tree containment, fix package fixed-point rebind, document C-2-atomic-v2, produce a fresh real gate package whose `git_sha` contains its evidence, re-run assert+verifier, and keep `20260807T091354Z`/`09aae0dd` as a negative control. Sprint 30 must not be marked complete until this task is dual-lens APPROVED on a landed containing SHA.

AGENT: implementer=devops-engineer | technical-reviewer=code-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T09:30:27Z
finding_ids: [C-2, REDHAT-FIX-RH-S30-17, REDHAT-FIX-RH-S30-10]
