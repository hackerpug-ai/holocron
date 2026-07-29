# Red-Hat Final Severity Review — Sprint 28

**Reviewed SHA:** `a5b32f30678c167fbae69f2cd370431eec1af25b` (`main`)
**Review date:** 2026-07-29T11:20:18Z
**Scope:** Fresh independent final closeout review after `GATE-FIX-S28R3-QA6`. Read-only, SHA-pinned inspection of the Sprint 28 manifest and task/fix contracts; the prior clean independent report at `61da2cbe7da045c0ad77de46180e5a041b7c2f97`; the QA6 contract and its product/technical dual-lens reviews; committed implementation and Sprint 28 tests; the six-step `gate-plan.json` and rendered `HUMAN-GATE.md`; and the active failed QA artifacts.
**Mode:** Product code, gate verdict/evidence artifacts, branches, and checkout state were not changed. This report is the sole review write.
**Review panel:** independent code/platform review plus the mandatory test-reality lens (implemented-mode source, oracle, negative-path, and isolated execution review).

## Executive summary

The QA6 host derivation itself is sound: valid 1–64-character run IDs deterministically map to a valid 1–64-character host, long IDs use a SHA-256-derived suffix, and the full ID remains the evidence key. The exact failed QA ID now passes host validation and reaches provision.

However, the landed cumulative Sprint 28 regression suite is red. An always-on QA3 test still requires the old, now-invalid bare Step 3 assignment. This is a HIGH closeout blocker because `vitest run` executes the assertion regardless of `PLATFORM_IT`; a clean closeout requires no HIGH findings.

## Acceptance / closeout matrix

| # | Requirement | Verdict | Evidence |
|---:|---|---|---|
| 1 | Every accepted ID derives a deterministic host matching the unchanged 1–64 host allowlist; long IDs use a digest and short IDs remain readable; invalid/unset IDs fail closed | **PASS** | `scripts/assert-gate-run-id.sh:13-35` retains the authoritative 1–64 allowlist and side-effect-free refusal. `scripts/derive-s28-fresh-host.sh:18-35` reuses it, preserves readable `s28r3-gate-<id>` when it fits, and `:38-70` derives `s28r3-` plus 16 hex chars from SHA-256 otherwise, then checks the host regex/length. Isolated QA6 execution passed its exact-ID, max-length, short-ID, determinism, and invalid/unset cases. |
| 2 | The exact 54-character QA ID no longer produces the old invalid 65-character host; same-prefix long IDs differ | **PASS** | The isolated committed-suite run derived `s28r3-9da1b3a8a7b07af9` (22 chars) for `qa28-20260729T104535Z-420995be4d2d4690911d9bb2e7f96678`; the prior naïve value is 65 chars. QA6 test `:128-152,203-232` proves the exact digest and the same-prefix collision pair. |
| 3 | Step 3 uses one derived host for provision, fire-drill, and exact cleanup; full run ID remains in evidence; no evaluation/injection/false-green seam | **PASS** | Step 3 begins with authoritative preflight, derives `HOST` once, stores `EVID=.tmp/REDHAT-FIX-S28R3/${GATE_RUN_ID}`, passes only `$HOST` to provision/fire-drill, and its trap removes `$HOST`, `${HOST}-pgdata`, `${HOST}-blobs`, and `${HOST}-net`: `gate-plan.json` Step 3 / `HUMAN-GATE.md:63-67`. The helper has fixed command paths, quoted values, no `eval`, and fails if no digest tool is available. QA6 source assertions `:267-290` cover the real plan seam. |
| 4 | Only Step 3 changed; steps 1, 2, 4, 5, 6 are byte-identical to `61da2cbe…`; render has literal-command digest parity | **PASS** | QA6 frozen digests in `sprint28-s28r3-qa6-gate-fix.test.ts:38-47,292-320` match the five base commands and compare Step 3's rendered fenced block to the plan. Independent diff review confirms only Step 3's command changed; `assert-gate-run-id.sh` and `provision-fresh-restore-target.sh` are byte-identical to the pre-QA6 SHA. |
| 5 | QA6 regressions genuinely cover all stated host/evidence/traversal cases | **PASS** | Isolated SHA-pinned execution: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa6-gate-fix.test.ts` → **13/13 passed**. The live provision seam wrote staging/env/compose and Docker accepted/created the derived QA host before the environment-specific bind mount failed; it did not emit `refuse invalid host name` or `length 1-64`. Post-test inspection found no QA-host Docker container, volume, or network left behind. |
| 6 | Cumulative CRITICAL/HIGH remediation remains substantively closed | **PASS, except the test-suite finding below** | Reinspection confirms exact R2 action/resource pairing (`scripts/prove-isolation.sh:850-938`), baseline-only fire-drill behavior and `env -i` child separation (`scripts/run-fire-drill-on-fresh-target.sh:603-679`), distinct restore-vs-writer credential refusal (`:465-564`), named-volume enforcement, run-ID preflight, parity-report validation (`scripts/assert-fire-drill-report.sh:19-51`), and no-Docker fail-closed controls. None is weakened by QA6. |
| 7 | Failed QA artifacts remain honest history; missing live RO credentials remain an external blocker | **PASS** | The active untracked QA record reports `verdict:"fail"`, 2/6 passes, recomputed fail with no discrepancies, and its Step 3 command hash is the old `90e9…` command at reviewed SHA `61da2…`; it is not hand-edited green. It honestly attributes Step 2/4/5 to `DEPENDENCY-S28-R2-RO`. The target SHA does not commit a false active pass. Missing distinct live `R2_RESTORE_*` remains an external dependency, not a new software-severity finding. |

## Findings

### HIGH-1 — Cumulative QA3 always-on regression is stale and makes the committed suite red

**Confidence:** HIGH (independent test execution and independent platform review agree)

`services/platform/tests/integration/sprint28-s28r3-qa3-gate-fix.test.ts:147` still asserts that the authoritative Step 3 command contains:

```ts
HOST="s28r3-gate-${GATE_RUN_ID}"
```

QA6 correctly changes the authoritative command to `HOST="$(bash scripts/derive-s28-fresh-host.sh)"`. Thus, against the exact reviewed commit:

```text
pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa3-gate-fix.test.ts
→ 1 failed | 9 passed | 6 skipped
→ expected ... to match /HOST="s28r3-gate-\$\{GATE_RUN_ID\}"/
```

This is not an environmental Docker/R2 failure: the failed assertion is in the always-on contract block (`it`, not `itLive`) and runs with `PLATFORM_IT` unset. It makes the normal `vitest run` gate red and retains a test oracle that rejects the required security/correctness fix.

**Required RUN-lane remediation:** update the assertion at line 147 to require `HOST="$(bash scripts/derive-s28-fresh-host.sh)"` and explicitly reject the bare naïve assignment, while retaining the preflight and network-cleanup assertions. Re-run both the QA3 and QA6 focused suites, then the complete Sprint 28 integration selection. Do not change the five frozen literal commands, loosen either validator, or modify gate evidence/results.

### MEDIUM-1 — QA2 credential-inventory “always-on” test is not self-contained

**Confidence:** MEDIUM (reproduced in a clean archive; the platform lens independently identified the same missing committed input)

`services/platform/tests/integration/sprint28-s28r3-qa2-gate-fix.test.ts:346-351` requires either `HOLO_SECRETS_PATH`/`HOLOCRON_SECRETS_PATH` or the ignored, uncommitted `services/platform/config/secrets.yaml` before it can execute the credential-inventory script. In a clean archive of the reviewed SHA, that precondition is absent and the test fails at `expect(secretsCandidates.length).toBeGreaterThan(0)` rather than exercising its intended presence/length-only oracle. The related gate-bind inventory test has the same external input requirement.

Supplying the existing local secrets path makes the two focused files pass (22 passed, 6 expected live skips), so this is not a fail-open restore behavior or a reason to fabricate credentials. It is nevertheless test portability/theatre risk: a fresh clone or CI that lacks personal secrets gets a red “always-on” test before the claimed oracle runs.

**Required RUN-lane remediation:** make the inventory unit contract self-contained with a committed non-secret fixture containing absent/placeholder-shaped values, or explicitly classify this check as a live/secret-backed test and skip it unless its input is supplied. Preserve the test's prohibition on emitting credential values.

## Prior CRITICAL/HIGH disposition

| Tranche | Disposition at `a5b32f…` |
|---|---|
| QA2 C-1/C-2/C-3; H-1/H-2 | **Closed.** Writer/restore identity is resolved and compared before child start; child environment excludes DB/PG sources; active result is not a pass; exact named volumes and exact bucket/prefix checks are retained. |
| QA3 C-1/C-2/C-3; H-1 | **Closed in product behavior.** File-only identity equality fails, fresh target is baseline-only, each gate producer preflights run ID, and Allow-policy bypass forms fail. **QA3 test maintenance is reopened by HIGH-1 only** because the old host assertion conflicts with QA6. |
| QA4 C-1; H-1/H-2 | **Closed.** Explicit source blob roots fail before child invocation, `NotAction`/`NotResource` do not bypass policy validation, and Step 2 preflights its run ID before evidence writes. |
| QA5 H-1/H-2; M-1 | **Closed.** Action/resource pairing is per Allow statement; Step 3–5 evidence is full-ID scoped; zero-exit/incomplete parity reports and no-Docker paths fail closed. |
| QA6 host-length defect | **Closed.** Derived hosts fix the false 65-character refusal without changing the run-ID or provision host contracts. |

## Test-reality and execution evidence

- `bash -n` passed for `assert-gate-run-id.sh`, `derive-s28-fresh-host.sh`, `provision-fresh-restore-target.sh`, and `run-fire-drill-on-fresh-target.sh` in an isolated archive of the reviewed SHA.
- QA6 suite, including its live provision traversal: **13/13 passed**. The live case reached Docker resource creation with `s28r3-9da1b3a8a7b07af9`; later mount failure is environment-specific and distinct from host validation.
- Max accepted 64-character ID derived to a 22-character valid digest host; empty, traversal, semicolon, leading/trailing separator, slash, and whitespace IDs refused.
- `sprint28-s28r3-gate-bind.test.ts` and `sprint28-s28r3-qa2-gate-fix.test.ts` passed **22/22** (6 expected live skips) when given the existing local secrets path without exposing secret values.
- The QA3 focused suite fails exactly as HIGH-1 describes. The initial archive-only QA2/gate-bind inventory failures are recorded as MEDIUM-1: they are an uncommitted-input dependency, even though a supplied local path makes their intended assertions pass.

## Verdict

**NEEDS-FIXES**

| Severity | Count |
|---|---:|
| CRITICAL | **0** |
| HIGH | **1** |
| MEDIUM | **1** |
| LOW | **0** |

The QA6 implementation fixes the actual host defect and preserves the honest external `DEPENDENCY-S28-R2-RO` blocker. It is not approved for Sprint 28 final code-severity closeout because the landed cumulative regression suite contains HIGH-1. The RUN lane must repair that stale test oracle and re-run the stated test selection; this review does not alter implementation, gate artifacts, branches, or checkout state.
