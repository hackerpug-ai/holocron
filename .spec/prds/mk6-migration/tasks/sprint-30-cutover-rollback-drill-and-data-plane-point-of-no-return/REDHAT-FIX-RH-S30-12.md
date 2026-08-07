# REDHAT-FIX-RH-S30-12 — Authorization boundaries on irreversible enable-writes and rollback-repoint CLIs

> **Task ID:** REDHAT-FIX-RH-S30-12
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** HIGH
> **Source finding:** H-2 (independent remediation red-hat)
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T085706Z-independent-remediation.md` (independent red-hat @ 2ff0e6c4)
> Status: Planned — not implemented

## Finding

**H-2 — Neither irreversible data-plane CLI has an authorization boundary.** Confidence: HIGH.

`runEnableWrites` accepts paths and operator metadata only (`ponr.ts`); `runRollbackRepoint` has no credential/approval check (`rollback-repoint.ts`) before writing the durable control plane. D07-05 AC-6 already documented this as a finding (`sprint30-security-review.test.ts`); RH-S30-01..08 did not remediate it. Local filesystem/CLI authority is required today — still a release risk for irreversible data-plane flips.

## Scope (WRITE-ALLOWED)

- `services/platform/src/cutover/ponr.ts` (`runEnableWrites`)
- `services/platform/src/cutover/rollback-repoint.ts` (`runRollbackRepoint`)
- `services/platform/src/cli/holo.ts` cutover verb wiring if flags/env for operator secret need plumbing
- Shared cutover operator auth helper if one exists or is introduced next to RH-S30-04/11
- Tests under `services/platform/tests/integration/sprint30-security-review.test.ts` (flip D07-05 AC-6 expectations from "documents missing auth" to "refuses without auth / accepts with auth")
- `.tmp/REDHAT-FIX-RH-S30-12/**`

## Acceptance Criteria

- [ ] **AC-1** `cutover:enable-writes` without a valid cutover operator credential (`HOLO_CUTOVER_OPERATOR_SECRET` or the project's established equivalent) refuses before lifting the fence or issuing the first production write; exit non-zero / `ok:false` with a stable auth error code (e.g. `OPERATOR_UNAUTHORIZED` — name locked in implementation, cited in evidence).
- [ ] **AC-2** `cutover:rollback-repoint` without a valid cutover operator credential refuses before writing durable `HOLO_DATA_PLANE` / control-plane state; no secrets-file mutation occurs.
- [ ] **AC-3** With a valid operator credential, both CLIs remain operable for legitimate drill/PONR flows (happy-path enable-writes and pre-PONR rollback-repoint still succeed under their other preconditions).
- [ ] **AC-4** D07-05 / security-review tests that previously only *documented* missing auth now **assert** refusal without credential and success with credential (no longer a permanent known-gap waiver).
- [ ] **AC-5** Evidence under `.tmp/REDHAT-FIX-RH-S30-12/` includes unauth refuse + auth success transcripts for both verbs.

## Anti-stub

- Do not implement auth as a docs-only warning or log line without hard refuse.
- Do not accept empty/default secrets as "authorized."
- Real CLI entrypoints (`bun services/platform/src/cli/holo.ts cutover:…`), not pure unit mocks of the check alone without wiring.

## Evidence

`.tmp/REDHAT-FIX-RH-S30-12/`

Required artifacts (minimum):

| Artifact | Proves |
|----------|--------|
| `ac1-enable-writes-unauth.json` | refuse before fence lift |
| `ac2-rollback-repoint-unauth.json` | refuse before control-plane write |
| `ac3-both-auth-ok.json` | authorized happy paths still work |
| `ac4-security-review-flip.txt` | test expectations flipped from gap-doc to assert |

## Disposition

Sprint 30 must not be marked complete until this task is dual-lens APPROVED, landed on main, and reflected in security-review evidence committed with the SHA.

AGENT: implementer=devops-engineer | technical-reviewer=security-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T09:02:29Z
finding_ids: [H-2, REDHAT-FIX-RH-S30-12]
