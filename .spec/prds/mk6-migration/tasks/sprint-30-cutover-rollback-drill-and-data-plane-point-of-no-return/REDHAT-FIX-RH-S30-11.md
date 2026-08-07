# REDHAT-FIX-RH-S30-11 — Authorize `recordFenceArmed` (no forged PONR prerequisite)

> **Task ID:** REDHAT-FIX-RH-S30-11
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** HIGH
> **Source finding:** H-1 (independent remediation red-hat)
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T085706Z-independent-remediation.md` (independent red-hat @ 2ff0e6c4)
> Status: Planned — not implemented

## Finding

**H-1 — `recordFenceArmed` remains a public, unauthenticated way to forge the PONR prerequisite.** Confidence: HIGH.

`convex/migrationFence/audit.ts` `recordFenceArmed` accepts a raw public mutation without `operatorSecret`. `cutover:enable-writes` accepts any nonempty `latestFenceArmed` row and can substitute an armed value when it cannot observe the deployment environment. The green fence scanner deliberately skips `migrationFence/**`, so RH-S30-04's empty unfenced scan does not cover this surface. RH-S30-04 gated `recordWriteAttempt` / drain / seed — not this mutation.

## Scope (WRITE-ALLOWED)

- `convex/migrationFence/audit.ts` (`recordFenceArmed`)
- `convex/lib/migrationFence.ts` if shared auth helper needs extension
- Call sites: `services/platform/src/cutover/convex-fence-client.ts`, freeze/quiet-check tooling that legitimately records arm
- Tests: security-review / RH-S30-04 style unauth reject + authorized success
- `.tmp/REDHAT-FIX-RH-S30-11/**`

## Acceptance Criteria

- [ ] **AC-1** Unauthenticated `recordFenceArmed` (no `operatorSecret` / wrong secret) rejects with the same operator-auth failure mode as `recordWriteAttempt` under an armed fence; **no** `migrationFenceAudit` row of kind `fence_armed` is inserted.
- [ ] **AC-2** Authorized operator path (matching `HOLO_CUTOVER_OPERATOR_SECRET` / established cutover operator contract) still records `fence_armed` and remains usable from `cutover:freeze` / fence-arm tooling.
- [ ] **AC-3** `cutover:enable-writes` must not treat a forged unauthenticated fence_armed row as a valid prerequisite — either because AC-1 makes forgery impossible, or because enable-writes independently verifies operator-bound arm provenance (documented which).
- [ ] **AC-4** Evidence under `.tmp/REDHAT-FIX-RH-S30-11/` includes unauth reject transcript + authorized success transcript against real Convex (or documented integration lane).

## Anti-stub

- Real Convex mutation behavior; do not only add a comment that the mutation "should" be authorized.
- Do not skip `migrationFence/**` in scanners and call that coverage.
- Preserve legitimate freeze/arm operator flow (do not hard-break cutover freeze).

## Evidence

`.tmp/REDHAT-FIX-RH-S30-11/`

Required artifacts (minimum):

| Artifact | Proves |
|----------|--------|
| `ac1-unauth-reject.json` | unauth mutation reject + no row side effect |
| `ac2-authorized-arm.json` | operator secret path inserts fence_armed |
| `ac3-enable-writes-prerequisite.md` | how enable-writes trusts arm provenance after fix |

## Disposition

Sprint 30 must not be marked complete until this task is dual-lens APPROVED, landed on main, and covered by the next tip-bound gate or explicit security probe evidence committed with the SHA (REDHAT-FIX-RH-S30-10).

AGENT: implementer=devops-engineer | technical-reviewer=security-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T09:02:29Z
finding_ids: [H-1, REDHAT-FIX-RH-S30-11]
