# Red-Hat Review Report

**Report Date**: 2026-07-20T10:45:17Z  
**Target**: Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow  
**Reviewed Surface**: independent `review-red-hat` review  
**Implementation identity**: `origin/main` / `5c22ed1c88259b3bb880fe7f9642996533f35dc7`  
**Fresh CI identity**: `ci-e2e` run `29734931990`, `workflow_dispatch`, completed `success`  
**Run URL**: https://github.com/hackerpug-ai/holocron/actions/runs/29734931990  
**Artifact**: `maestro-reference-flow-29734931990`, GitHub artifact id `8457985861`, 23,601,350 bytes  
**Artifact SHA256**: `725875018a255f058cd631e0c73950b3250fd7669658d1b48179385e7d4b27ed`  
**Local artifact directory**: `.tmp/ci-e2e-download-29734931990`

## AC VERDICT TABLE (review analysis; not a hand-written gate result)

| # | Six-step evidence contract | Review result | Evidence | Notes |
|---|---|---|---|---|
| 1 | Cold boot on the named iPhone 17 simulator | PARTIAL | Artifact `junit.xml`: one `reference-flow` testcase, failures `0`; `simctl-device-resolution.json` names iPhone 17 | Fresh CI proves the all-in-one flow, not the native gate's scoped step-1 evidence. |
| 2 | Send message through fleet to Postgres | PARTIAL | CI `capstone-verdict.json`: Postgres agent count `1`, content length `30` | The backend proof is global to the all-in-one CI flow and is not bound to native gate step 2. |
| 3 | Observe durable Zero-synced reply | PARTIAL | CI capstone: `zero_cache_ok=true`, content length `30`; `final.png` and `reference-flow.mov` are non-empty | The fresh artifact does not contain native step-3 evidence or a per-step Zero oracle. |
| 4 | JUnit/log/video attached to CI run | PASS (narrow) | Provenance JSON, GitHub artifact digest, ZIP hash, JUnit, `video.log`, and non-empty `reference-flow.mov` all agree | This is the part genuinely closed by run `29734931990`. |
| 5 | Missing Expo build fails closed | FAIL for this fresh run | ZIP has no `step5-harness-suite.json` and no `step5-missing-build-run.json`; workflow only runs the positive flow | No fresh negative-control evidence was captured. |
| 6 | Namespace reset reaches known seed | PARTIAL | Artifact `namespace-reset.json` has `ok:true`, `reset:true`, seed fingerprint, and fixture ids | The six-step native adapter was not run; the gate-plan oracle only requires `ok:true`, not the known-seed fields. |

## Executive Summary

The fresh CI evidence is authentic and provenance-bound to the requested source commit. An isolated replay of `scripts/e2e/capstone-verdict.sh --from-ci-artifact` returned exit `0` with `coldboot_gate:"green"`, JUnit failures `0`, one Postgres agent row with content length `30`, and a successful Zero read with content length `30`; the replay used a temporary copy and did not alter the downloaded artifact.

It does not, however, certify the six-step native human-gate contract. The CI workflow ran one all-in-one `.e2e/maestro/reference-flow.yaml` flow, while the native gate adapter and shared verifier require three independently scoped native actions plus two separate terminal negative/seed checks. Blocking HIGH findings remain explicit below. No `gate-results.json`, sprint state, or implementation fix was written by this review.

## Severity Table

| ID | Severity | Finding | Confidence | Status |
|---|---|---|---|---|
| RH-S20-01 | HIGH | Fresh CI run is not execution evidence for the six-step native gate; it runs only the all-in-one reference flow and its artifact lacks native per-step and step-5 dual evidence. | HIGH | OPEN |
| RH-S20-02 | HIGH | `run-sprint20-native-human-gate.sh` writes `verdict:"pass"` before deterministic verification and does not replace the claim when `verify-gate-evidence.sh` recomputes fail/blocked. | HIGH | OPEN |
| RH-S20-03 | HIGH | Native `maestro_native` verification proves driver/action/artifact structure, not the step-2 fleet/Postgres or step-3 durable Zero semantics; the CI capstone is not bound to those scoped actions. | HIGH | OPEN |
| RH-S20-04 | HIGH | The reviewed commit's durable provenance and `gate-results.json` still identify stale run `29729692898` / SHA `364e052abcd3854abefaf1b49272aedaeea121bf`; the requested fresh provenance is only an uncommitted working-tree change plus external artifact files. | HIGH | OPEN |
| RH-S20-05 | MEDIUM | The shared verifier fixture reported `28 passed, 2 failed` (RED5 DOM cross-check and RED11 native-action collision assertions) during this review; the shared transport regression surface is not clean. | HIGH | OPEN |

## Findings

### RH-S20-01 — HIGH — CI success does not execute the six-step native gate

**Evidence**:

- `.github/workflows/ci-e2e.yml:205-223` invokes `scripts/e2e/run-maestro-reference-flow.sh --run` and uploads `maestro-reference-flow-${{ github.run_id }}`.
- The downloaded ZIP contains one `junit.xml` testcase named `reference-flow` and the positive-flow artifacts, but no `step1/`, `step2/`, or `step3/` `maestro-evidence.json`, no scoped native-gate logs, and no `step5-harness-suite.json` / `step5-missing-build-run.json`.
- The six-step adapter is a separate local command in `scripts/e2e/run-sprint20-native-human-gate.sh:128-151`; the workflow never calls it.

**Impact**: A successful run can prove the real positive reference flow, but it cannot be substituted for independent execution of all six documented human-gate steps. Step 4 is genuinely evidenced; steps 1–3 and 5 are not fresh CI gate evidence.

### RH-S20-02 — HIGH — Native adapter leaves a stale pass claim after verifier rejection

`run-sprint20-native-human-gate.sh:154-169` derives `verdict` from six runner claims and atomically writes `gate-results.json`. It then invokes `verify-gate-evidence.sh` at lines `171-181`, copies the verifier output, and exits with the verifier return code, but never changes the already-written `gate-results.json.verdict` to the recomputed result.

The shared contract requires the deterministic proof to control the result (`kb-run-human-tests/SKILL.md:94-100, 631-640, 652-664`). A verifier failure can therefore leave a durable `verdict:"pass"` claim beside `gate-verification.json` showing `verified:false` / `recomputed_verdict:"fail"` or `"blocked"`. The provenance-only `assert-gate-verdict.sh` checks the pass claim and step logs; it does not itself consume this proof. Any consumer that does not chain both checks can accept the false claim.

### RH-S20-03 — HIGH — Native transport has no domain oracle for steps 2 and 3

The scoped Maestro flows are structurally narrow:

- `.e2e/maestro/gate/step-2-send.yaml:5-13` asserts the chat screen, types text, taps send, and takes a screenshot.
- `.e2e/maestro/gate/step-3-observe.yaml:5-11` waits for `chat-assistant-message`, asserts visibility, and takes a screenshot.
- The shared verifier's `maestro_native` branch, `/Users/inference1/Projects/brain/skills/kb-run-human-tests/references/verify-gate-evidence.sh:298-397`, checks exact driver/action/flow/device identity, command provenance, JUnit failures, screenshot, and video. It does not inspect Postgres, fleet execution, Zero-cache reads, message identity, or the sent text.

The fresh CI capstone does prove Postgres and Zero independently, but it was generated by the separate all-in-one reference flow and contains no binding to the native step-2/step-3 action ids or their scoped evidence. Thus a native step can structurally pass without its claimed backend/transport oracle being observed.

### RH-S20-04 — HIGH — Fresh provenance is not durable on the reviewed commit

At `5c22ed1c88259b3bb880fe7f9642996533f35dc7`, the committed
`.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/ci-run-provenance.json` still points to run `29729692898` and tested SHA `364e052abcd3854abefaf1b49272aedaeea121bf`. The current working tree has an uncommitted edit pointing to the requested run `29734931990`, while the current `gate-results.json` also still cites the older run.

The fresh external artifact is valid, but a clean checkout of the reviewed commit does not carry its provenance. This is a durability/reproducibility gap, not a defect in the GitHub run itself.

### RH-S20-05 — MEDIUM — Shared verifier regression fixture is red

Running `/Users/inference1/.codex/skills/kb-run-human-tests/references/test-verify-gate-evidence.sh` during this review reported `28 passed, 2 failed`: the RED5 DOM cross-check assertion and RED11 native-action collision assertion. The project-native static test passed, but it only proves source wiring and invokes the shared fixture as a subprocess; the standalone shared fixture output remains non-green and requires resolution before the transport can be considered regression-clean.

## Exact CI and Replay Verification

| Check | Result |
|---|---|
| GitHub run | `workflow_name=ci-e2e`, `status=completed`, `conclusion=success`, `head_sha=5c22ed1c88259b3bb880fe7f9642996533f35dc7` |
| Provenance identity | `head_sha`, `committed_sha`, `tested_sha`, and `evidence_capture_sha` all equal the pinned SHA |
| Artifact identity | `maestro-reference-flow-29734931990`, 23,601,350 bytes, GitHub digest and local ZIP SHA256 both `725875018a255f058cd631e0c73950b3250fd7669658d1b48179385e7d4b27ed` |
| Capstone replay | Isolated temporary-copy replay exit `0`; `coldboot_gate=green`; JUnit `0`; Postgres `1/30`; Zero `true/30`; reasons `[]` |
| Positive artifacts | JUnit 371 bytes; final screenshot 154,864 bytes; reference video 23,365,935 bytes |
| Native gate adapter test | Project static/preflight test: 4 tests passed; this does not replace a real six-step native execution |

## Red-Hat Conclusion

**BLOCKED — remediation required.** The fresh CI/capstone evidence is real and closes the exact CI-artifact/provenance claim for step 4, but RH-S20-01 through RH-S20-04 are HIGH findings. This review does not approve the Sprint 20 six-step native human-gate contract.

No machine gate verdict was authored or changed in this review.

## Metadata

- **Review method**: `review-red-hat` adversarial protocol; exact pinned source and exact fresh artifact inspected.
- **Prior/stale runs excluded from evidence**: run `29729692898` and all earlier Sprint 20 bundles were not used as proof of the fresh CI result; they are cited only to identify stale committed metadata.
- **Working-tree policy**: pre-existing dirty files and artifacts were preserved; only this durable report was added.
