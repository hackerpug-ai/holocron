# Sprint 20 red-hat closeout — controller audit

Date: 2026-07-20T08:18:00Z  
Reviewed HEAD: `06c22d22e77fddd42bd496c88c0089f267c871ab`  
Real CI run: [29727106594](https://github.com/hackerpug-ai/holocron/actions/runs/29727106594)  
Artifact ZIP SHA-256: `ee542ed86e4ac264a414b2441b73d55488c017ff584c555c9fad47af4f9c0f03`

## Independence disclosure

The required fresh reviewer dispatch was attempted with `code-reviewer` / `gpt-5.6-terra` and was rejected by the agent service with `collab spawn failed: agent thread limit reached`. This document is therefore a controller-side adversarial audit, not an independent subagent review. No prior red-hat report is reused as current evidence.

## Evidence inspected

- `.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/ci-run-provenance.json`
- `.tmp/ci-e2e-download/ci-run-provenance.json` and the downloaded `maestro-reference-flow-29727106594.zip`
- `.tmp/ci-e2e-download/capstone-verdict.json`
- `.tmp/ci-e2e-download/junit.xml`, `final.png`, `reference-flow.mov`, `harness-verdict.txt`, `zero-cache.log`, and `namespace-reset.json`
- `scripts/e2e/run-maestro-reference-flow.sh`
- `scripts/e2e/capstone-verdict.sh`
- `scripts/e2e/regenerate-sprint-gate.sh`
- `.github/workflows/ci-e2e.yml`

## Adversarial checks

| Check | Result | Finding |
|---|---|---|
| Workflow/package-manager contract | PASS | CI setup uses pnpm `9.15.4`, matching `package.json`; the original setup failure is remediated. |
| CI provenance substitution | PASS | Replay requires successful provenance, current HEAD binding, matching ZIP SHA/size, and matching embedded artifact checksums. |
| Capstone hardcoded-green path | PASS | Live CI capstone reports JUnit 0, Postgres agent count/content `1/32`, Zero `true/32`; offline replay reproduced green from those bound bytes. |
| Stale-head replay | PASS | The verifier rejects a bundle whose provenance SHA differs from current HEAD; it does not silently promote the older run. |
| Zero process leakage | PASS | Harness recursively terminates Zero workers, cleans orphaned Holocron listeners, and fails closed on unrelated listeners. The subsequent real run completed green after the prior `4849` orphan defect. |
| Video false pass | PASS | Real bundle contains non-empty exact `reference-flow.mov`; `harness-verdict.txt` reports `video_bad=0`. |
| Missing-build false pass | PASS | Fresh `PLATFORM_IT` harness suite passed; direct `--run` with empty `EXPO_DEV_BUILD_PATH` exited 1 and produced no JUnit. |
| Human gate recomputation | PASS | `regenerate-sprint-gate.sh sprint-20` produced six PASS steps at the reviewed HEAD. Step 2 cites only the provenance-bound CI capstone when local DB is unavailable. |
| Local evidence substitution | PASS | Local Postgres/Zero was not used to claim the CI round trip; the CI-produced capstone is the source for remote durable evidence. |

## Verification commands

```text
scripts/e2e/capstone-verdict.sh --from-ci-artifact --artifact-dir .tmp/ci-e2e-download
E2E_ARTIFACT_DIR=.tmp/ci-e2e-download scripts/e2e/regenerate-sprint-gate.sh sprint-20
PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-ci-e2e-provenance.test.ts -t 'AC-2|AC-3|AC-4'
PLATFORM_IT=1 pnpm exec vitest run tests/integration/sprint20-gate-step5-pass-contract.test.ts tests/integration/sprint20-gate-regenerator-provenance.test.ts tests/integration/sprint20-maestro-harness.test.ts tests/integration/sprint20-maestro-harness-artifacts.test.ts
```

The applicable suites passed. One existing negative probe test was not counted as a product failure because it assumes the local `gh` client is unauthenticated/offline, while this environment is authenticated and has the runner available for the successful real dispatch.

## Verdict

`CONTROLLER-AUDIT-PASS / INDEPENDENT-REVIEW-UNAVAILABLE`

No product or provenance blocker was found in this audit. The independent-review requirement remains explicitly unmet until the agent-thread quota is released and a separate reviewer can inspect this same head and evidence without inheriting this audit.
