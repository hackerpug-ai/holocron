# REDHAT-FIX-H1-R — Natural local-judge pass without post-judge score flooring

> Scoped follow-up to HIGH H-1-R in `.tmp/sprint-12-independent-readonly-remediation-review-20260718T045200Z.md`. Planning-only; implementation and review are separate stages. QA and Sprint close remain blocked.

## Provenance

- Finding: H-1-R, fresh independent review disposition REQUEST CHANGES.
- Current implementation: `aabe9042ba2ccbf8c253e2c912416cefbd8d9c3c`; landed merge `d536a866219d66f469b2f2c1618a57eb316381ca`.
- Defect: `services/platform/src/evals/scorers.ts` floors a real judge score in `[0.4, 0.8)` to `0.8` when citation-free; GREEN combined evidence contains judge prose saying the score should be below threshold.
- Preserve accepted H-2 evidence and do not reopen H-2 unless shared changes require it.

## Task metadata

```yaml
TASK: REDHAT-FIX-H1-R
TASK_TYPE: BUGFIX
STATUS: Complete
PRIORITY: P0
AGENT: implementer=mastra-evals-implementer | reviewer=mastra-reviewer
TDD_MODE: red_first
REAL_JUDGE_REQUIRED: yes
NO_POST_JUDGE_REWRITE: yes
SPRINT: Sprint 12 — Observability, Telemetry and Eval Gate
```

## Objective

Remove every post-judge numeric score override from the H-1 path and make the citation-free deterministic regression fixture naturally score `>= 0.8` through the real local judge. The public `evals:ci` result must preserve the judge’s raw numeric score exactly, report `meetsThreshold: true`, then fail solely through the deterministic `required-citation` invariant with `failureReason: deterministic_invariant_failure` and exit `1`.

## Scope and non-goals

In scope: remove the hard floor and any equivalent numeric rewrite; adjust only the fixture, rubric wording, prompt/setup, or test assertions needed for a naturally judge-passing citation-free structured brief; persist raw judge analysis/score alongside emitted score for audit; recapture one coherent direct+PIPESTATUS evidence package.

Non-goals: no mocked/stubbed judge, fabricated score, hard-coded payload, citation marker in the fixture, threshold change, weakening deterministic invariants, changes to H-2, gate-results, ROADMAP, historical reviews, or closure metadata.

## RED-first evidence

1. Add an assertion that emitted score equals the raw judge score/analysis score and that no floor branch can run; execute the current implementation and retain the failing RED log showing the floor or score mismatch.
2. Retain the current failing citation-free result as historical evidence under `.tmp/redhat-fix-h1r-red/`, with command, stdout/stderr, status, raw judge reasoning, and branch tip.
3. Only then remove the floor and improve the fixture/judge-facing setup.

## Acceptance criteria

### AC-1 — No post-judge numeric rewrite

`createResearchQualityScorer` returns the real judge numeric score unchanged. No path in the public eval gate changes a score solely to satisfy `>= 0.8`; tests fail if raw judge score differs from emitted `payload.score`.

### AC-2 — Natural citation-free judge pass

The committed regression fixture remains citation-free (no URL, DOI, bracket citation, or Sources block), but the real local judge naturally returns raw and emitted `score >= 0.8`, `threshold == 0.8`, and `meetsThreshold == true`. Judge reasoning must not say the response belongs below threshold while output reports 0.8.

### AC-3 — Deterministic-only failure

The public CLI JSON reports `invariantPassed: false`, a `required-citation` deterministic failure, `failureReason: deterministic_invariant_failure`, `verdict: failed`, `exitCode: 1`, and no `threshold_regression`.

### AC-4 — Coherent raw process evidence

Capture one exact CLI invocation with stdout/stderr, direct `$?`, and `PIPESTATUS[0]` from the same run or explicitly correlate both captures to one run identity. Both statuses are `1`; raw judge score, emitted score, runId, and scoreId are retained. Manifest hashes all evidence and binds to the reviewed implementation commit.

### AC-5 — Existing controls remain valid

Known-good exits 0 and passes threshold; deliberately-bad still fails as `threshold_regression`; invalid config remains fail-closed; H-2 accepted evidence remains ancestry-visible. Full relevant eval integration tests pass without skips.

## Test criteria

- TC-1: RED assertion fails on current floor implementation because raw judge score/reason conflicts with emitted score.
- TC-2: real local-judge GREEN run has raw score equal to emitted score and both `>= 0.8`; no post-judge floor code remains.
- TC-3: parse public CLI JSON and assert all AC-3 fields plus absence of citation markers in fixture.
- TC-4: verify direct status and `PIPESTATUS[0]` are both 1, files are nonempty/retained, and manifest hashes match.
- TC-5: run the full eval gate integration file with `PLATFORM_IT=1`; reject skipped required tests.
- TC-6: typecheck/lint touched files and prove implementation/evidence commits are ancestors of main.

## Expected implementation surfaces

- `services/platform/src/evals/scorers.ts` — remove score-floor/rewrite logic and preserve raw score.
- `services/platform/evals/fixtures/deterministic-invariant-regression.jsonl` and/or judge-facing rubric/setup — make the citation-free brief naturally high-quality, without citations.
- `services/platform/evals/rubrics/research-quality_v1.json` — only if wording can honestly guide the real judge; never force numeric output.
- `services/platform/tests/integration/evals-ci-gate.test.ts` — raw-vs-emitted equality and exact deterministic-only failure assertions.
- `.tmp/redhat-fix-h1r-red/**`, `.tmp/redhat-fix-h1r-green/**` — durable raw evidence and SHA-256 manifest.

## Verification commands

```sh
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/evals-ci-gate.test.ts
pnpm tsgo --noEmit
pnpm biome check services/platform/src/evals services/platform/tests/integration/evals-ci-gate.test.ts
bun services/platform/src/cli/holo.ts evals:ci --fixture deterministic-invariant-regression --json > .tmp/redhat-fix-h1r-green/stdout.txt 2> .tmp/redhat-fix-h1r-green/stderr.txt; direct_status=$?; printf 'direct_status=%s\n' "$direct_status"
set -o pipefail; bun services/platform/src/cli/holo.ts evals:ci --fixture deterministic-invariant-regression --json 2>&1 | tee .tmp/redhat-fix-h1r-green/combined.txt; printf 'PIPESTATUS[0]=%s\n' "${PIPESTATUS[0]}"
sha256sum .tmp/redhat-fix-h1r-green/* > .tmp/redhat-fix-h1r-green/MANIFEST.sha256
```

## Done / close criteria

- [x] RED proves current floor/reason mismatch before fix.
- [x] Floor and equivalent numeric rewrites are removed.
- [x] Raw local-judge score equals emitted score and naturally passes `>= 0.8` without citation markers.
- [x] Deterministic required-citation failure is sole failing reason; direct and PIPESTATUS exits are 1.
- [x] Coherent hash-bound evidence, full tests, typecheck, and lint pass.
- [ ] Fresh independent review is clean; parent controller alone authorizes QA and Sprint close.
