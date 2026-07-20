---
sprint: 20
title: E2E Maestro Harness and Cold-Boot Reference Flow
sequence: 20
timeline: Phase 4 — Reference-Flow Gate and Deep Services
status: Blocked
prd: ../../README.md
capability_coverage: CAP-SYNC-01, CAP-CUT-01
planned_from_roadmap_sha: 6201400e2aabbf15e9457d14c1a9949fd0776e4173a7a760908d91374d38a289
planned_from_source_sha: 1b7b518f213cd3c09004bec33830305527dcfa42
source_kind: git-head
planned_at: 2026-07-18T21:44:20Z
---

# Sprint 20: E2E Maestro Harness and Cold-Boot Reference Flow

**Sequence:** 20
**Timeline:** Phase 4 — Reference-Flow Gate and Deep Services
**Status:** Blocked — open GATE-FIX-G1/G2/G4/G5/G6 + REDHAT-FIX-H2 (external CI)
> Progress: 19/25 completed · 1 blocked · 5 pending (GATE-FIX) · updated 2026-07-20T01:24:31Z
**Proposed by:** react-native-ui-planner + devops-engineer
**Branch:** `mk6-reference-flow`
**Opened:** 2026-07-18 — generated JIT by /kb-sprint-tasks-plan

## Progress Note (inherited from ROADMAP.md, 2026-07-18)

The fail-closed Maestro harness, real zero-cache bootstrap, deterministic `holo namespace reset`, Expo Zero schema/provider seam, stable chat selectors, and a Hono/Zero reference-chat route are implemented and committed (`4d56349`, `9109e32`, `23e425b`, `ad63aad`, `6b3ee1a`, `610846b`). The boundary proof passes against real Postgres, the Expo iOS bundle exports, and the reset seeds the deterministic conversation. The cold-boot flow is not yet green: a real Expo development build on the named simulator, real fleet completion, and end-to-end Zero sync artifacts remain unproven; Sprint 20 stays In Progress. This task-file expansion is JIT relative to that in-flight state — implementers should audit existing commits before re-doing completed work.

## Overview

A complete, decisive migration of holocron off Convex — cloud database and all services — onto a Mastra (Bun) + Postgres platform on the tailnet mini, with the RN app resyncing via Zero and all reasoning on the local inference fleet. This sprint is the **proven-reference-flow gate**: per the E2E Harness Constitution, the deep feature/client build (Sprints 22–26) and the cutover (Sprint 29) do not proceed until this thin cold-boot vertical is green on the real Maestro harness. It merges the RN journey/thin-chat half (react-native-ui-planner) with the Maestro runner/CI/go-no-go half (devops-engineer).

## Human Testing Deliverable

An operator can run the Maestro reference flow on a named iOS Simulator and get a cold-boot chat message that round-trips through the fleet to Postgres, syncs back via Zero, with a passing JUnit result plus screenshot/video artifacts; pointing the runner at a missing Expo dev build fails closed instead of a false pass; running `holo namespace reset` before the flow brings the nonprod Postgres/Zero namespace to a known seed.

## Human Testing Gate

**Gate:** An operator running the Maestro reference flow on a named iOS Simulator gets a cold-boot chat message that round-trips through the fleet to Postgres, syncs back via Zero, with a passing JUnit result plus screenshot/video artifacts.

## Test Deliverable

Each step is a real documented operator invocation against the named iOS Simulator / CI substrate (not a mocked suite).

1. Run the Maestro reference flow on the named iOS Simulator — cold boot completes, app opens.
2. Send a chat message in the flow — specialist runs on the fleet, tool call hits Postgres.
3. Observe the reply — durable message syncs to the app via Zero, screenshot captures it.
4. Check CI artifacts — JUnit result, log, video all attached to the e2e run.
5. Point the runner at a missing Expo dev build — harness fails closed, not a false pass.
6. Run `holo namespace reset` before the flow — nonprod Postgres/Zero namespace reaches known seed.

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| S-COLDBOOT-01 | Swap ConvexProvider for the Zero provider in app/_layout.tsx; boot without CONVEX_URL | react-native-ui-implementer | 120 min |
| S-COLDBOOT-02 | Thin chat vertical: send via Hono command, read durable message via Zero | react-native-ui-implementer | 210 min |
| S-COLDBOOT-03 | Maestro cold-boot journey + testID audit + deterministic seed content | red-test-generator | 240 min |
| D03-01 | RED: Maestro harness fails closed without simulator/build/backend | red-test-generator | 60 min |
| D03-02 | Provision self-hosted macOS runner: named iOS Simulator + Expo dev build pipeline | devops-engineer | 180 min |
| D03-03 | Build Maestro runner harness (boot, install, execute, capture artifacts) | devops-engineer | 180 min |
| D03-04 | Extend deterministic seed/reset to the Zero-synced namespace | devops-engineer | 90 min |
| D03-05 | Implement e2e GitHub Actions workflow for the Maestro lane | ghactions-implementer | 120 min |
| D03-06 | Review e2e workflow + macOS runner trust boundary | ghactions-reviewer | 60 min |
| D03-07 | Prove the cold-boot reference flow green on the harness (go/no-go capstone) | devops-engineer | 90 min |

## Source Coverage

- UC-SYNC-01, UC-SYNC-02 (`08-uc-sync.md`) — Zero integration & app rewrite; reactive surfaces
- T-PLAT-019 (self-hosted runner substrate — provisioned in Sprint 13; this sprint owns the named iOS Simulator + Expo dev build pipeline on that substrate)
- T-SYNC-001, T-SYNC-003 (`11-e2e-testing-criteria.md`)
- `10-technical-requirements/10-e2e-testing.md` — real-service e2e lane requirements
- `10-technical-requirements/11-runtime-contracts.md` — runtime compatibility contract this harness proves against
- Existing stack: `.e2e/maestro/reference-flow.yaml`, `app/_layout.tsx`, `services/platform/src/cli/holo.ts` (namespace reset), Hono chat-run route, `.github/workflows/`
- Depends on Sprint 04 (Postgres schema), Sprint 06 (headless stack up/down/status), Sprint 13 (self-hosted runner + Vitest integration harness substrate), Sprint 18 (chat redesign — native tool loop + resumable SSE)

## Capability Coverage

- CAP-SYNC-01: the cold-boot proof that a committed Postgres write reaches the RN client via Zero
- CAP-CUT-01: the thin client-flip vertical (provider swap, boot without `EXPO_PUBLIC_CONVEX_URL`)

## Blocks

- Sprint 24: Full RN App Rewrite off Convex onto Zero
- Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded
- Sprint 26: Image and Voice Upload Lifecycle Client
- Sprint 29: Cutover — Write Freeze, ETL and Read-Only Soak Flip (the go/no-go before the deep client build + cutover)

## Dependencies

- Depends on: Sprint 04, Sprint 06, Sprint 13, Sprint 18.
- Task graph: D03-01 (RED fail-closed harness) ∥ S-COLDBOOT-03 (RED Maestro journey) → S-COLDBOOT-01 (provider swap) → S-COLDBOOT-02 (thin chat vertical) ∥ D03-02 (macOS runner + simulator) → D03-03 (Maestro runner harness; needs D03-02) ∥ D03-04 (seed/reset extension) → D03-05 (e2e GH Actions workflow; needs D03-03+D03-04+S-COLDBOOT-02) → D03-06 (review) → D03-07 (capstone go/no-go proof; needs everything green).

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-07-18T21:44:20Z (specialist proposals: red-test-generator, react-native-ui-planner, devops-engineer, ghactions-planner). Red-hat remediation tasks (REDHAT-FIX-H1..H10) added 2026-07-19.

- S-COLDBOOT-01-swap-convexprovider-for-zero-provider.md
- S-COLDBOOT-02-thin-chat-vertical-hono-command-zero-read.md
- S-COLDBOOT-03-maestro-cold-boot-journey-testid-audit-seed.md
- D03-01-red-maestro-harness-fails-closed-without-simulator-build-backend.md
- D03-02-provision-self-hosted-macos-runner-simulator-expo-dev-build.md
- D03-03-build-maestro-runner-harness-boot-install-execute-capture.md
- D03-04-extend-deterministic-seed-reset-to-zero-synced-namespace.md
- D03-05-implement-e2e-github-actions-workflow-maestro-lane.md
- D03-06-review-e2e-workflow-macos-runner-trust-boundary.md
- D03-07-prove-cold-boot-reference-flow-green-go-no-go-capstone.md
- REDHAT-FIX-H1-add-capstone-verifier-and-regenerate-machine-gate-evidence.md
- REDHAT-FIX-H2-produce-ci-dispatched-maestro-evidence-and-preserve-artifact-metadata.md
- REDHAT-FIX-H3-make-harness-produce-and-verify-exact-reference-flow-mov.md
- REDHAT-FIX-H4-add-d03-06-adversarial-review-and-executable-fork-safety-test.md
- REDHAT-FIX-H5-add-and-run-durable-zero-synced-message-integration-test.md
- REDHAT-FIX-H6-add-and-run-required-testid-uniqueness-audit-for-reference-chat-flow.md
- REDHAT-FIX-H7-add-and-run-live-zero-cache-namespace-reset-read-proof.md
- REDHAT-FIX-H8-fix-invalid-bundle-fail-closed-test-timeout.md
- REDHAT-FIX-H9-add-forced-failure-coverage-and-strengthen-lifecycle-oracle.md
- REDHAT-FIX-H10-correct-dev-client-mode-regex-and-add-deterministic-reset-idempotency-contracts.md

## Red-hat remediation tasks (fresh review 2026-07-19)

The fresh independent review in `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` found blocking gaps in the claimed completion proof. These first-class remediation rows must be expanded by `/kb-sprint-tasks-plan` and completed before the sprint can return to the parent close handshake:

| ID | Objective | Evidence / finding |
|----|-----------|--------------------|
| REDHAT-FIX-H1 | Add the executable Sprint 20 capstone verifier and replayable `capstone-verdict.json`; regenerate machine gate evidence from current main. | Review H1: D03-07 requires `scripts/e2e/capstone-verdict.sh` and `.tmp/maestro-reference-flow/capstone-verdict.json`; neither exists and no Sprint 20 `gate-results.json` exists. |
| REDHAT-FIX-H2 | Produce provenance-valid CI-dispatched Maestro evidence and preserve downloadable artifact metadata for the self-hosted lane. | Review H2: D03-05/D03-07 CI run and artifact are not evidenced; local files cannot substitute for the CI artifact requirement. |
| REDHAT-FIX-H3 | Make the harness produce and verify the exact non-empty `reference-flow.mov`, including recorder-failure handling and cleanup. | Review H3: only a `.mov.sb-*` sidecar exists and `video.log` reports recorder resource-busy failure. |
| REDHAT-FIX-H4 | Add the required D03-06 adversarial review artifact and executable fork-safety test, with actionlint evidence or an equivalent fail-closed check. | Review H4: `docs/ci/D03-06-adversarial-review.md` and `tests/ci/fork-safety.test.ts` are absent. |
| REDHAT-FIX-H5 | Add and run the durable Zero-synced message integration test against the real nonprod namespace. | Review H5: required `services/platform/tests/integration/sprint20-reference-zero-durable.test.ts` is absent; builder-query source checks do not prove durable Zero reads. |
| REDHAT-FIX-H6 | Add and run the required testID uniqueness audit for the reference chat flow. | Review H6: `tests/integration/sprint20-testid-audit.test.tsx` is absent and repeated assistant selectors are material. |
| REDHAT-FIX-H7 | Add and run the live Zero-cache namespace reset/read proof, including deterministic seed and replica membership assertions. | Review H7: required `nonprod-namespace-zero-sync.test.ts` is absent; reset JSON alone proves only CLI/Postgres behavior. |
| REDHAT-FIX-H8 | Fix the invalid-bundle fail-closed boundary test so the real `PLATFORM_IT` lane completes without timeout. | Review H8: current Sprint 20 harness test timed out on the invalid bundle case; 17 passed, 1 failed. |
| REDHAT-FIX-H9 | Add explicit forced-failure coverage proving harness cleanup and artifact preservation, and strengthen lifecycle artifact assertions. | Review M1/M3: uninstall evidence can be empty while the oracle passes; forced-failure fixture and TC-4 are absent. |
| REDHAT-FIX-H10 | Correct dev-client mode validation and add deterministic reset/idempotency and capstone replay contracts named by S-COLDBOOT-03/D03-04. | Review M2/M4: documented mode regex rejects the `+` mode, and named reset/idempotency test contracts are absent or skipped. |

## Human-gate remediation tasks (expanded 2026-07-20T00:59:23Z)

Failing/partial Human Testing Gate steps after the honest blocked cycle (gate-results.json 2026-07-20):
step1 FAIL (app crash), step3 PARTIAL (no fresh green sim), step4 FAIL (no CI provenance), step5 PARTIAL (step5 dual-evidence missing).
Specialists dispatched: devops-engineer, react-native-ui-planner, ghactions-planner, red-test-generator.

| ID | Title | Agent | Proposed by | Gates |
|----|-------|-------|-------------|-------|
| GATE-FIX-G1 | Rebuild non-crashing Expo development-simulator holocron.app via eas | devops-engineer | devops-engineer | 1,5 |
| GATE-FIX-G2 | Prove this-cycle Maestro cold-boot green (junit/screenshot/video/capst | react-native-ui-implementer | react-native-ui-planner | 1,3,5 |
| GATE-FIX-G4 | Fail-closed CI probes + real ci-e2e dispatch provenance for human gate | devops-engineer | ghactions-planner | 4 |
| GATE-FIX-G5 | RED: this-cycle junit honesty — refuse green on failures>0 and reject  | devops-engineer | red-test-generator | 1,3 |
| GATE-FIX-G6 | RED: Human Gate Step-5 PASS only with PLATFORM_IT suite green AND miss | devops-engineer | red-test-generator | 5 |
