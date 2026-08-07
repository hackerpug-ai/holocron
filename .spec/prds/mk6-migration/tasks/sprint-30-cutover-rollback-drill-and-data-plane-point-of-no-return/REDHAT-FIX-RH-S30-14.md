# REDHAT-FIX-RH-S30-14 — Implement and invoke `assert-human-test-verdict` in the Sprint 30 gate

> **Task ID:** REDHAT-FIX-RH-S30-14
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** HIGH
> **Source finding:** H-4 (independent remediation red-hat)
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T085706Z-independent-remediation.md` (independent red-hat @ 2ff0e6c4)
> Status: Finalized on main with tip-bound gate 20260807T091354Z (awaiting independent dual-lens + fresh QA — not release-approved)

## Finding

**H-4 — RH-S30-08 AC-2 is asserted checked but neither of its claimed provenance gate runs is captured.** Confidence: HIGH.

RH-S30-08 AC-2 requires `assert-human-test-verdict` + `verify-gate-evidence` both exit 0 against tip. The runner only runs `verify-gate-evidence.sh`; repository search finds no `assert-human-test-verdict` implementation or captured result. RH-S30-08 AC-1 (same-stdout recompute) can pass while AC-2 remains unsupported.

## Scope (WRITE-ALLOWED)

- New or existing assertion entrypoint named `assert-human-test-verdict` (script under `scripts/` or brain/tools path wired for this repo — implementer chooses one real path and locks it in evidence)
- `scripts/run-sprint30-human-gate.sh` (or successor) to invoke it and capture exit + stdout
- Storage of assertion stdout/exit beside gate evidence (e.g. `.gate-evidence/<runId>/assert-human-test-verdict.{json,exit}` and/or root sprint dir)
- Binding so a pass requires both assertion and verifier success
- `.tmp/REDHAT-FIX-RH-S30-14/**`

## Acceptance Criteria

- [x] **AC-1** A real executable entrypoint `assert-human-test-verdict` exists in-repo (or as a pinned brain/tools path invoked by the gate runner with a stable absolute/relative reference checked into the sprint runner). `rg` / path lookup no longer returns zero hits for the command the gate claims to run.
- [x] **AC-2** `run-sprint30-human-gate.sh` (or the active Sprint 30 human-gate runner) invokes that entrypoint against the gate plan + evidence for the run; captures stdout and exit code into the evidence directory; fails the gate if assertion exit ≠ 0.
- [x] **AC-3** A successful tip-bound gate stores both: (a) verifier raw/json with `verified:true`, and (b) assertion capture with exit 0. Independent recompute: re-run assertion + verifier on stored artifacts → both exit 0.
- [x] **AC-4** RH-S30-08 task status may only claim AC-2 checked when AC-1..AC-3 hold on a landed SHA (coordinate with REDHAT-FIX-RH-S30-10).
- [x] **AC-5** Evidence under `.tmp/REDHAT-FIX-RH-S30-14/` includes the entrypoint path, sample assertion stdout, and runner snippet showing invocation order (assertion relative to verifier).

## Anti-stub

- Do not satisfy AC-1 with a shell function that always `exit 0` without reading plan/results.
- Do not only document "operators should run assert-human-test-verdict" without runner wiring.
- Assertion must bind to the same plan + evidence the verifier uses (or a strictly stronger provenance check).

## Evidence

`.tmp/REDHAT-FIX-RH-S30-14/`

Required artifacts (minimum):

| Artifact | Proves |
|----------|--------|
| `ac1-entrypoint-path.txt` | real path + `--help` or usage |
| `ac2-runner-invoke-snippet.sh` | runner lines that call + capture |
| `ac3-dual-exit-zero.json` | assertion exit 0 + verifier verified:true |
| `ac4-recompute-transcript.txt` | independent re-run of both tools |

## Disposition

Sprint 30 must not be marked complete until this task is dual-lens APPROVED, landed on main, and a fresh tip-bound gate captures both provenance tools' outputs in the landed SHA.

AGENT: implementer=devops-engineer | technical-reviewer=code-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T09:02:29Z
finding_ids: [H-4, REDHAT-FIX-RH-S30-14]
