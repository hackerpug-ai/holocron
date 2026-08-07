# REDHAT-FIX-RH-S30-16 — Preserve pinned fallback commit identity + document verifier scope

> **Task ID:** REDHAT-FIX-RH-S30-16
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P1
> **Type:** FIX
> **Severity:** MEDIUM / LOW
> **Source findings:** M-2, L-1 (independent remediation red-hat)
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T085706Z-independent-remediation.md` (independent red-hat @ 2ff0e6c4)
> Status: Implemented on main (awaiting independent dual-lens + fresh QA — not release-approved)

## Findings

**M-2 — The raw verifier proves log/plan consistency, not the underlying external state.** Confidence: HIGH.

`verify-gate-evidence.sh` checks command SHA, stored exit code, and regex matches; it has no external-state attestation for Postgres rows, Convex content bodies, installed Release artifacts, or deployed runtime. That scope is correct engineering — but must not be described as independent production re-execution.

**L-1 — Step 3's summary loses the pinned commit identity.** Confidence: HIGH.

`step3.log` first emits the verifier's `commit_sha`, but the final Python summary emits `short_sha:null` because it looks for `short_sha`/`commit`, not `commit_sha`. The step still has a real `ok:true` boot report; this is a traceability defect, not a boot failure.

## Scope (WRITE-ALLOWED)

- Gate plan step 3 summary / runner post-processing that emits step3 summary JSON
- `services/platform/src/cutover/pinned-fallback-build.ts` only if field naming must be normalized at the source
- Short durable note (sprint gate README comment, runner header comment, or gate-verification schema note) clarifying verifier scope vs external-state attestation
- `.tmp/REDHAT-FIX-RH-S30-16/**`

## Acceptance Criteria

- [x] **AC-1 (L-1)** After a successful step 3 (`cutover:verify-fallback-boot` with `ok:true`), the step summary / gate-consumed fields preserve the pinned fallback commit identity: non-null `commit_sha` **or** non-null `short_sha` derived from it (not `null` when the boot report contained `commit_sha`).
- [x] **AC-2 (L-1)** Raw `step3.log` and any JSON summary agree on the pin identity (same full SHA or unambiguous short form).
- [x] **AC-3 (M-2)** Durable documentation (in the gate runner header, verify-gate-evidence usage note, or sprint gate plan comment) states explicitly that `verify-gate-evidence` proves **log/plan consistency** (cmd_sha, exit, regex) and is **not** an independent re-execution of Postgres/Convex/Release external state. Reviewers must not treat `verified:true` alone as production-state attestation.
- [x] **AC-4** Evidence under `.tmp/REDHAT-FIX-RH-S30-16/` includes a step3 summary snippet with non-null pin identity and a citation to the verifier-scope documentation location.

## Anti-stub

- Do not "fix" L-1 by removing pin fields entirely.
- Do not claim M-2 fixed by making the verifier pretend to re-query production without real external probes (out of scope unless a separate task adds them).
- Documentation for M-2 must be in a path reviewers actually open during gate review (runner or gate-plan), not a buried unused file.

## Evidence

`.tmp/REDHAT-FIX-RH-S30-16/`

Required artifacts (minimum):

| Artifact | Proves |
|----------|--------|
| `ac1-step3-summary-pin.json` | non-null commit_sha/short_sha after boot |
| `ac2-log-vs-summary.txt` | agreement between raw log and summary |
| `ac3-verifier-scope-doc-path.md` | path + quoted scope language |

## Disposition

Land with gate packaging so step3 evidence in the landed SHA shows non-null pin identity (coordinate REDHAT-FIX-RH-S30-10).

AGENT: implementer=devops-engineer | technical-reviewer=code-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T09:02:29Z
finding_ids: [M-2, L-1, REDHAT-FIX-RH-S30-16]
