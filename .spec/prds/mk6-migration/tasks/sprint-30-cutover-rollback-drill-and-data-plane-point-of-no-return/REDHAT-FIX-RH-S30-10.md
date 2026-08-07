# REDHAT-FIX-RH-S30-10 — Atomic commit of gate results, evidence, and remediation status with source SHA

> **Task ID:** REDHAT-FIX-RH-S30-10
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** CRITICAL
> **Source finding:** C-2 (independent remediation red-hat)
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T085706Z-independent-remediation.md` (independent red-hat @ 2ff0e6c4)
> Status: Finalized on main with tip-bound gate 20260807T091354Z (awaiting independent dual-lens + fresh QA — not release-approved)

## Finding

**C-2 — The claimed remediation gate and raw evidence are not part of the reviewed SHA.** Confidence: HIGH.

At review of `2ff0e6c4`, `gate-results.json`, both root verifier files, RH-S30 remediation task/status updates, and the entire `20260807T084614Z` evidence directory were dirty/untracked. `git ls-tree HEAD` still contained only older `071128Z`–`073351Z` evidence. Landing that SHA could not reproduce or audit the claimed 5/5 tip-bound run. This breaks RH-S30-07's purpose (bind evidence to the reviewed/landed revision) and the landing contract's auditable-SHA requirement.

## Scope (WRITE-ALLOWED)

- Sprint 30 gate artifacts under
  `.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/`
  (`gate-results.json`, `gate-verification.json`, `gate-verification.json.raw`, `.gate-evidence/<runId>/`)
- Gate runner / post-gate packaging only if needed to stage evidence into the git tree before commit
- Process/docs for "evidence lands with source" (short note in runner or sprint gate script)
- `.tmp/REDHAT-FIX-RH-S30-10/**`
- **Does not** invent pass evidence; only commits real runs produced by the tip-bound runner

## Acceptance Criteria

- [x] **AC-1** After a tip-bound Sprint 30 human gate that is claimed as remediation proof, a single git commit (or an atomic merge result on the base branch) contains **all** of: source changes under review, `gate-results.json` for that run, `gate-verification.json` + `gate-verification.json.raw` (byte-identical verified stdout), and `.gate-evidence/<runId>/` step logs + meta for that same `runId`.
- [x] **AC-2** `git ls-tree -r HEAD --name-only` includes the claimed evidence run directory and the root gate files; an independent reviewer can `git show HEAD:…/gate-results.json` and recompute `verify-gate-evidence.sh` to exit 0 without needing the working tree dirty files.
- [x] **AC-3** `gate-results.json.git_sha` (or equivalent binding field) equals the commit that contains those artifacts (or a documented parent SHA that is an ancestor of the landed tip and still carries the same evidence tree). Fail closed if results claim a SHA that does not contain the evidence files.
- [x] **AC-4** REDHAT-FIX task status updates that assert "gate-verified" for RH-S30-09..16 are only checked after the evidence commit exists on the base branch — never only as dirty working-tree edits.
- [x] **AC-5** Evidence under `.tmp/REDHAT-FIX-RH-S30-10/` includes a `git ls-tree` / `git show` transcript proving AC-1..AC-3 for the remediation SHA.

## Anti-stub

- Do not hand-edit `gate-results.json` to invent a pass.
- Do not claim AC pass by leaving evidence only under `.tmp/` or untracked `.gate-evidence/`.
- Do not weaken RH-S30-07/08; this task makes their binding land-auditable.
- Real `verify-gate-evidence.sh` recompute required.

## Evidence

`.tmp/REDHAT-FIX-RH-S30-10/`

Required artifacts (minimum):

| Artifact | Proves |
|----------|--------|
| `ac1-tree-listing.txt` | `git ls-tree -r <sha>` lists results + verifier + evidence run |
| `ac2-recompute.json` | independent verify-gate-evidence exit 0 on tree contents |
| `ac3-sha-binding.json` | gate-results git_sha ↔ containing commit relationship |
| `ac4-no-dirty-only-status.md` | checklist that status checkboxes track landed evidence |

## Disposition

This task is a release-blocking process+packaging fix. Sprint 30 remediation is not reviewable until the SHA under review contains the gate it claims.

AGENT: implementer=devops-engineer | technical-reviewer=code-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T09:02:29Z
finding_ids: [C-2, REDHAT-FIX-RH-S30-10]
