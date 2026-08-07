# REDHAT-FIX-RH-S30-15 — Finalize gate `meta.json` to durable completed/pass state

> **Task ID:** REDHAT-FIX-RH-S30-15
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P1
> **Type:** FIX
> **Severity:** MEDIUM
> **Source finding:** M-1 (independent remediation red-hat)
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T085706Z-independent-remediation.md` (independent red-hat @ 2ff0e6c4)
> Status: Planned — not implemented

## Finding

**M-1 — Gate metadata permanently says `running`.** Confidence: HIGH.

The runner writes `.gate-evidence/<runId>/meta.json` with `status:"running"` at start and never updates it. The cited run's `meta.json` still says `running` while root `gate-results.json` claims a completed pass. Consumers that correctly privilege run metadata cannot distinguish a completed run from an interrupted one.

## Scope (WRITE-ALLOWED)

- `scripts/run-sprint30-human-gate.sh` (or active Sprint 30 human-gate runner)
- meta.json schema fields (`status`, optional `finished_at`, `verdict`)
- Tests or harness checks that completed runs are not left `running`
- `.tmp/REDHAT-FIX-RH-S30-15/**`

## Acceptance Criteria

- [ ] **AC-1** On successful gate completion (all steps pass + verifier pass), `meta.json` is rewritten with a durable terminal status of `completed` or `pass` (exact enum locked in implementation and cited in evidence) — never left as `running`.
- [ ] **AC-2** On failed/aborted gate, `meta.json` is rewritten to a durable terminal failure status (`failed` / `aborted` / equivalent) including enough context to distinguish from success (exit code or failed step id).
- [ ] **AC-3** Interrupted runs that die before finalization may remain `running`; that is the only legitimate `running` state. Evidence documents this and shows a completed run is not in that state.
- [ ] **AC-4** A post-run check (runner self-check or test) fails if root results claim pass while meta still says `running`.
- [ ] **AC-5** Evidence under `.tmp/REDHAT-FIX-RH-S30-15/` includes before/after meta.json for a real completed run.

## Anti-stub

- Do not only change the initial write to `completed` (that would lie about in-progress runs).
- Must finalize at end of success and failure paths.
- Real runner execution evidence preferred over unit-only string checks.

## Evidence

`.tmp/REDHAT-FIX-RH-S30-15/`

Required artifacts (minimum):

| Artifact | Proves |
|----------|--------|
| `ac1-meta-after-pass.json` | terminal completed/pass status |
| `ac2-meta-after-fail.json` | terminal failed status (can be forced fail step) |
| `ac4-mismatch-guard.txt` | check that pass+running is rejected |

## Disposition

Land with the next tip-bound gate so the committed evidence run's `meta.json` demonstrates the terminal state (coordinate REDHAT-FIX-RH-S30-10).

AGENT: implementer=devops-engineer | technical-reviewer=code-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T09:02:29Z
finding_ids: [M-1, REDHAT-FIX-RH-S30-15]
