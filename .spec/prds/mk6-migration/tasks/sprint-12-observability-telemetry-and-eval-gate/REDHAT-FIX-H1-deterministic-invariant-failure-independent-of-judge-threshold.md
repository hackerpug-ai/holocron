# REDHAT-FIX-H1 — Deterministic invariant failure independent of judge threshold

> Remediation task for Sprint 12 H-1. This artifact is planning-only: implementation must be performed by the assigned implementer and independently reviewed before Sprint closure.

## Provenance

- **Finding:** HIGH H-1 from `.tmp/sprint-12-independent-readonly-review-20260718T041606Z.md` (reviewed `2026-07-18T04:16:06Z`).
- **Review baseline:** `main` at `1e9c61431038fb930d6271cd721d94ac5eb7b86c`; review reports obs-4 implementation ancestor `cc386d1` and raw-exit package ancestor `254f1c7`.
- **Current deficient evidence:** `.tmp/obs-4/raw-exit-evidence/deterministic-invariant-regression/{case-record.json,stdout.txt,stderr.txt}`. It exits 1, but records `score: 0.5`, `threshold: 0.8`, and `failureReason: threshold_regression`; the deterministic branch is therefore not exercised.
- **Authoritative feature task:** `obs-4-deterministic-invariant-threshold-ci-regression-gate-with-bad-fixture-proof.md` (AC-3, TC-3, and its real local-judge requirement).
- **Sprint reference:** `SPRINT.md` REDHAT-FIX-H1 row and remediation table. Do not edit SPRINT.md, ROADMAP.md, gate results, or existing feature task files.

## Task metadata

```yaml
TASK: REDHAT-FIX-H1
TASK_TYPE: FEATURE
STATUS: Backlog
PRIORITY: P0
EFFORT: S (120 min)
AGENT: implementer=mastra-evals-implementer | reviewer=mastra-reviewer
PROPOSED-BY: independent Sprint 12 review
TDD_MODE: red_first
RED_GREEN_REQUIRED: yes
SEEDED_EVIDENCE_REQUIRED: yes
CAPABILITY: CAP-INF-01
SPRINT: Sprint 12 — Observability, Telemetry and Eval Gate
```

## Objective and outcome

Make the deterministic-invariant negative control genuinely independent of the probabilistic judge threshold. The committed citation-free fixture must be otherwise acceptable to the real local judge, producing a score `>= 0.8` and `meetsThreshold: true`, while `required-citation` fails deterministically. `holo evals:ci --fixture deterministic-invariant-regression --json` must then return a failed verdict with `failureReason: deterministic_invariant_failure` and process exit `1`.

The resulting evidence must prove both direct process status (`$?`) and pipeline status (`PIPESTATUS[0]`), with raw stdout and stderr retained and hash-bound to the implementation commit.

## Scope

### In scope

- Adjust the deterministic-invariant regression fixture and/or its judge-facing setup so its output is citation-free but sufficiently long and substantively acceptable for the real local judge to score at least `0.8`.
- Preserve deterministic `required-citation` failure and ensure it is evaluated after the real judge result, not replaced by threshold failure.
- Strengthen `services/platform/tests/integration/evals-ci-gate.test.ts` AC-3 assertions to require exact independence facts: score `>= 0.8`, threshold `0.8`, `meetsThreshold === true`, `invariantPassed === false`, a `deterministicFailures` entry with `invariantId === 'required-citation'`, `failureReason === 'deterministic_invariant_failure'`, `verdict === 'failed'`, and `exitCode === 1`.
- Re-run the public CLI against the real local judge and capture raw stdout/stderr, direct `$?`, `PIPESTATUS[0]`, and the complete case record.
- Retain new RED and GREEN artifacts under `.tmp/redhat-fix-h1*/` (or the repository’s approved evidence location), including hashes and command/environment provenance.

### Non-goals

- Do not weaken, remove, or make citation checks judge-dependent.
- Do not change the `0.8` versioned threshold, known-good or deliberately-bad semantics, or invalid-config behavior.
- Do not replace the real local judge with a stub, fixture score, mocked response, or hard-coded payload.
- Do not edit SPRINT.md, ROADMAP.md, gate-results, the authoritative review, or existing closure metadata.
- Do not address H-2 budgeted-escape telemetry/ledger behavior, Langfuse reasoning retention, or unrelated eval functionality.

## Dependencies and constraints

- Requires Postgres migrations and the local inference/judge fleet available to `PLATFORM_IT=1`.
- Uses the committed fixture/rubric/baseline surfaces in `services/platform/evals/fixtures/`, `services/platform/evals/rubrics/`, `services/platform/evals/baselines/`, and `services/platform/evals/thresholds/`.
- Must preserve the existing `runCiGate` contract: real `scoreFixture`, deterministic `runDeterministicInvariants`, immutable persisted score, and fail-closed exit semantics.
- Evidence must be generated from the public `bun services/platform/src/cli/holo.ts evals:ci ...` entrypoint, not by calling internal functions alone.
- The citation-free output must not accidentally contain URL, DOI, numeric bracket citation, or `Sources:` markers; it must remain non-empty and at least 80 characters so the only intended deterministic failure is `required-citation`.

## RED-first evidence

1. Before implementation, add/enable the failing AC-3 assertions in `services/platform/tests/integration/evals-ci-gate.test.ts` (or a dedicated remediation integration test) and run the real fixture. The test must fail on the current evidence because `score < 0.8` and/or `failureReason` is `threshold_regression`.
2. Save the failing test output and the pre-fix raw CLI record under `.tmp/redhat-fix-h1-red/`, clearly recording the current branch tip and the fact that the deterministic branch was not reached.
3. Only after the RED artifact exists, change the fixture/setup and implementation as necessary.
4. After GREEN, retain the raw CLI package under `.tmp/redhat-fix-h1-green/` with `stdout.txt`, `stderr.txt`, `case-record.json`, and SHA-256 manifest. The record must bind the output to the implementation commit and include both status capture methods.

## Exact implementation files and surfaces

Expected write surfaces (modify only what the implementation requires):

- `services/platform/evals/fixtures/deterministic-invariant-regression.jsonl` — citation-free, judge-acceptable output/sample identity.
- `services/platform/src/evals/ci-gate.ts` — only if result ordering/field propagation needs correction; retain deterministic failure precedence once `meetsThreshold` is true.
- `services/platform/src/evals/deterministic-scorers.ts` — only if a narrowly justified invariant/fixture boundary correction is required; keep `required-citation` deterministic and independent.
- `services/platform/tests/integration/evals-ci-gate.test.ts` — strengthen AC-3 and add raw status/evidence assertions; do not weaken existing AC-1/2/4/5.
- `services/platform/src/cli/holo.ts` — only if JSON/exit propagation prevents required fields from reaching stdout; preserve exit 1.
- `.tmp/redhat-fix-h1-red/**` and `.tmp/redhat-fix-h1-green/**` — RED/GREEN evidence artifacts, including raw stdout/stderr, case record, and hash manifest.

No source change is justified merely to make a score pass: inspect the judge response and fixture output, then keep the deterministic scorer independent of judge prose.

## Acceptance criteria

### AC-1 — Citation-free fixture is judge-passing [PRIMARY]

**Given** the committed deterministic-invariant regression fixture and `research_v1` baseline, **when** the real local judge scores it through `holo evals:ci`, **then** JSON reports numeric `score >= 0.8`, `threshold == 0.8`, and `meetsThreshold == true`, while the output contains no citation marker and deterministic failures include `required-citation`.

**Must not observe:** fabricated score, skipped judge call, citation marker, threshold change, or missing persisted eval score.

### AC-2 — Deterministic failure is the selected failure reason

**Given** AC-1’s judge-passing, citation-free result, **when** the CI gate completes, **then** it reports `verdict: "failed"`, `exitCode: 1`, `invariantPassed: false`, `deterministicFailures` with `invariantId: "required-citation"`, and exact `failureReason: "deterministic_invariant_failure"` (not `threshold_regression`).

### AC-3 — Integration assertion proves independence

The strengthened integration test must assert all AC-1/AC-2 facts from the parsed public CLI JSON, including `Number(payload.score) >= 0.8`, `Number(payload.threshold) === 0.8`, `payload.meetsThreshold === true`, `payload.failureReason === 'deterministic_invariant_failure'`, and the required-citation failure reason. A test that only asserts nonzero exit or a nonempty failure array is insufficient.

### AC-4 — Raw exit evidence is complete and agrees

The retained case record must prove, for the exact command, both:

```sh
bun services/platform/src/cli/holo.ts evals:ci --fixture deterministic-invariant-regression --json >stdout.txt 2>stderr.txt
status=$?
printf 'direct_status=%s\n' "$status"
set -o pipefail
bun services/platform/src/cli/holo.ts evals:ci --fixture deterministic-invariant-regression --json 2>&1 | tee combined.txt
pipe_status=${PIPESTATUS[0]}
printf 'PIPESTATUS[0]=%s\n' "$pipe_status"
```

The direct `$?` and `PIPESTATUS[0]` values must both be `1`; raw stdout must contain the machine-readable payload, raw stderr must be retained even when empty, and hashes must be recorded.

### AC-5 — Existing gate controls remain green and persisted

Known-good remains exit `0` with score `>= 0.8`; deliberately-bad remains exit `1` with `threshold_regression`; invalid-config remains fail-closed; and the deterministic result persists a score row containing the run identity, threshold, deterministic failures, and `meetsThreshold` metadata.

## Test criteria

- **TC-1:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/evals-ci-gate.test.ts -t 'deterministic invariant blocks independently'` passes only with a real local-judge score `>= 0.8` and exact deterministic failure reason.
- **TC-2:** Parse the captured raw stdout and assert `score >= 0.8`, `meetsThreshold: true`, `deterministicFailures[].invariantId: required-citation`, `failureReason: deterministic_invariant_failure`, `exitCode: 1`; assert raw stderr exists as a retained file.
- **TC-3:** Verify the direct status and `PIPESTATUS[0]` status are both `1`; reject evidence that reports only `tee`’s status.
- **TC-4:** Query Postgres `eval_scores` by emitted `runId` and assert one row with `analysis.meetsThreshold` true, `analysis.invariantPassed` false, and deterministic failure `required-citation`.
- **TC-5:** Run the full eval integration file and verify AC-1, AC-2, AC-4, and AC-5 remain passing; no test is skipped under `PLATFORM_IT=1`.
- **TC-6:** Inspect the fixture output for absence of URL/DOI/bracket/Sources citation markers and non-empty length >= 80; this is a structural control, not a substitute for the real judge run.

## Verification commands

```sh
PLATFORM_IT=1 DATABASE_URL=postgres://inference1@127.0.0.1:5432/holocron \
  pnpm vitest run services/platform/tests/integration/evals-ci-gate.test.ts

PLATFORM_IT=1 DATABASE_URL=postgres://inference1@127.0.0.1:5432/holocron \
  pnpm vitest run services/platform/tests/integration/evals-ci-gate.test.ts -t 'deterministic invariant blocks independently'

bun services/platform/src/cli/holo.ts evals:ci --fixture deterministic-invariant-regression --json > .tmp/redhat-fix-h1-green/stdout.txt 2> .tmp/redhat-fix-h1-green/stderr.txt; status=$?; printf 'direct_status=%s\n' "$status"
set -o pipefail; bun services/platform/src/cli/holo.ts evals:ci --fixture deterministic-invariant-regression --json 2>&1 | tee .tmp/redhat-fix-h1-green/combined.txt; printf 'PIPESTATUS[0]=%s\n' "${PIPESTATUS[0]}"

pnpm tsgo --noEmit
pnpm biome check services/platform/src/evals services/platform/src/cli services/platform/tests/integration/evals-ci-gate.test.ts
```

Use the repository’s configured Bun/DB environment if the explicit `DATABASE_URL` is not applicable; record the exact environment and command in the evidence case record. Do not claim success from skipped tests.

## Done / close criteria

- [ ] RED artifact exists before the fix and documents the failing strengthened assertion.
- [ ] Citation-free fixture receives a real local-judge score `>= 0.8`.
- [ ] Deterministic result has `meetsThreshold: true`, `required-citation`, `deterministic_invariant_failure`, and exit `1`.
- [ ] Direct `$?` and `PIPESTATUS[0]` are both captured as `1`; stdout/stderr and SHA-256 manifest are retained.
- [ ] Integration assertions require the exact independence facts and full eval gate suite passes without skips.
- [ ] Typecheck and lint pass for touched source/test files.
- [ ] Implementer and reviewer commits are ancestry-visible; evidence is hash-bound to the reviewed implementation tip.
- [ ] Fresh independent review is requested; parent controller, not this task, decides Sprint close.

## Closure evidence checklist

- RED test log and pre-fix case record.
- GREEN `stdout.txt`, `stderr.txt`, `combined.txt`, `case-record.json`, and hash manifest.
- Parsed JSON excerpt showing score/threshold/meetsThreshold/deterministicFailures/failureReason/exitCode.
- Postgres `eval_scores` query artifact for the remediation run.
- Test, typecheck, and lint command logs with exit statuses.
