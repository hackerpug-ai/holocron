# imp-mk6-functional-completeness-1786837297-mk6-functional-completeness: Restore all MK-VI scoped functionality to specified operation

> Status: 🟡 In Progress
> Cycle: 1
> Updated: 2026-08-16T05:59:56Z
> Assignee: mastra-implementer
> Priority: P1
> Type: bugfix
> Files: services/platform/src/verify/mk6-capability-contract.ts, services/platform/src/verify/mk6-capability-ledger.ts, services/platform/src/verify/gate-registry.ts, services/platform/src/cli/holo.ts, scripts/verify-mk6-promotion-ledger.sh, services/platform/tests/integration/mk6-capability-ledger.test.ts
> Patterns: minimum-diff-discipline, anti-stub
> Scope: /Users/justinrich/.config/brain/improvements/imp-mk6-functional-completeness-1786837297.json

## Context

Holocron must have all functionality scoped by `.spec/prds/mk6-migration`
operating as specified. The current evidence instead shows independent failures
across the runtime, data plane, Mastra composition, MCP behavior, RN/Zero client,
backup/recovery, and decommission gates. This task does not repair those H0-H4
surfaces; it installs the release-bound, fail-closed capability ledger that makes
their completion measurable and prevents false promotion.

Root cause summary: the requested outcome depends on multiple independently
broken runtime and semantic surfaces plus absent or false-green real-service
evidence. No single production symbol owns the full MK-VI contract, and the
existing five-entry verifier registry cannot bind all 105 criteria to current,
release-specific proof.

For full reproduction evidence, root-cause file:line references, considered
alternatives, challenger notes, and the binding security review, read the
ScopeState named on the `> Scope:` line above. That contract is binding. Do not
touch files outside the `> Files:` list.

## Acceptance Criteria

- [ ] AC-1: The immutable 105-criterion MK-VI contract is represented exactly once with criterion ID, domain, required real oracle, receipt kind, release identity fields, freshness requirement, and mapped H0-H4 recovery package.
- [ ] AC-2: A ledger run fails closed for a missing, stale, unhashed, wrong-release, skipped, structural-only, empty-data, or nonterminal receipt; it cannot convert a 501, zero-row read, or historical artifact into a pass.
- [ ] AC-3: The existing five negative-control verifier entries remain registered and are composed rather than replaced; seeded missing-evidence, queue-recreation, mission-501, MCP semantic-no-op, and client-fallback cases each produce a named failing ledger result.
- [ ] AC-4: The ledger emits a redacted machine-readable report that identifies failed criteria and the owning existing recovery package, while retaining no credential values.
- [ ] AC-5: A release can be marked promotable == true only after one newly captured, release-specific, real-service ledger run reports exactly criterionEvaluations == 105, exactly requiredPromotionGateSteps == 10, and failedCriteria == 0; its retained manifest contains exactly 10 non-symlink step-receipt entries keyed by H2-06's ten ordered step IDs, each with a 64-hex SHA-256 rehashed from retained bytes and matched to a read-only release-locked manifest bound to the same candidate source SHA, immutable image digest, compose generation, host identity, and deployment timestamp. The ten steps occur in H2-06 order: release identity; compose/secret-name preflight; Mastra-and-scheduler in-container fleet list and completion; three external private health 200 responses; non-empty Postgres identity across HTTP/MCP/Zero; terminal mission plus scheduler side effect; all-44 behavioral MCP sweep including declared failures; real iOS/Zero mission and durable-mutation proof; backup heartbeat and alert readiness; and automatic rollback before authority changes. The positive case invokes the actual candidate with real Postgres, fleet, HTTP/MCP/Zero, scheduler, and iOS environments; mocks, structural fixtures, cached or historical receipts, static-shell output, and receipt self-declared hashes cannot pass. Against that same successful release run, first deleting exactly one retained step receipt, then restoring it and byte-mutating exactly one retained step receipt, each returns promotable == false, failedCriteria >= 1, and a named failure record for the affected step: RECEIPT_MISSING with expected digest for deletion, or RECEIPT_DIGEST_MISMATCH with expected and actual digests for mutation, while the other nine receipts remain valid. The green case rejects an always-false implementation; each corruption case rejects an always-true implementation.

## Test Criteria

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | The ledger loads exactly 105 unique MK-VI criteria and every criterion carries its required domain, oracle, receipt, release, freshness, and owner fields. | AC-1 | `bun test services/platform/tests/integration/mk6-capability-ledger.test.ts` | [ ] TRUE [ ] FALSE |
| 2 | The real ledger CLI rejects all eight named invalid receipt states with a non-zero result and named failed criteria. | AC-2 | `bun test services/platform/tests/integration/mk6-capability-ledger.test.ts` | [ ] TRUE [ ] FALSE |
| 3 | The composed registry preserves five existing verifiers and fails all five named semantic negative controls. | AC-3 | `bun test services/platform/tests/integration/mk6-capability-ledger.test.ts` | [ ] TRUE [ ] FALSE |
| 4 | The machine-readable report names failed criteria and owners while a nested secret canary appears zero times in stdout, stderr, and the report. | AC-4 | `bun test services/platform/tests/integration/mk6-capability-ledger.test.ts` | [ ] TRUE [ ] FALSE |
| 5 | A real candidate is promotable only at 105 evaluations, 10 valid step receipts, and zero failures; deleting or mutating one receipt produces the named failure and leaves nine valid receipts. | AC-5 | `bun test services/platform/tests/integration/mk6-capability-ledger.test.ts` | [ ] TRUE [ ] FALSE |

<!-- REQUIREMENT-CONTRACT v1
fixtures: {"reproduction":{"description":"The 2026-08-15 red-hat review records 105 MK-VI criteria, an existing five-entry gate registry, and independent live/source failures across fleet, Postgres, Mastra, MCP, Zero, backup, and decommission evidence.","seed_method":"cli","records":[{"review_ref":".spec/reviews/red-hat-mk6-code-deployment-20260815T232122Z.md","criterion_count":105,"existing_gate_registry_count":5,"observed_failure_domains":7}]},"successful_release":{"description":"One newly captured release-specific run produced the ten H2-06 step receipts by driving the actual candidate through real Postgres, fleet, HTTP/MCP/Zero, scheduler, iOS, backup, alert, and rollback entrypoints.","seed_method":"cli","records":[{"criterionEvaluations":105,"requiredPromotionGateSteps":10,"failedCriteria":0,"retainedStepReceipts":10,"digestAlgorithm":"SHA-256"}]}}
AC-1: The immutable 105-criterion MK-VI contract is represented exactly once with criterion ID, domain, required real oracle, receipt kind, release identity fields, freshness requirement, and mapped H0-H4 recovery package.
  verify: bun test services/platform/tests/integration/mk6-capability-ledger.test.ts
  scenario: {"id":"AC-1","primary":true,"test_tier":"integration","verification_service":"Bun CLI plus real filesystem contract loader","negative_control":{"would_fail_if":["criterion AC-PLAT-01-01 is removed from the contract","a required oracle field is hardcoded or omitted"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"reproduction","action":{"steps":["Run bun test services/platform/tests/integration/mk6-capability-ledger.test.ts against the checked-in immutable MK-VI criterion source through the real contract loader"]},"end_state":{"must_observe":["criterion_count == 105","criteria_with_domain_oracle_receipt_release_freshness_and_owner == 105","duplicate_criterion_ids == 0"],"must_not_observe":["criterion_count == 0","contract is empty","missing required field"]}}]}
AC-2: A ledger run fails closed for a missing, stale, unhashed, wrong-release, skipped, structural-only, empty-data, or nonterminal receipt; it cannot convert a 501, zero-row read, or historical artifact into a pass.
  verify: bun test services/platform/tests/integration/mk6-capability-ledger.test.ts
  scenario: {"id":"AC-2","primary":true,"test_tier":"integration","verification_service":"Bun CLI plus real filesystem receipt root","negative_control":{"would_fail_if":["the verifier accepts an empty receipt root","receipt status is hardcoded to pass","wrong-release validation is removed"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"reproduction","action":{"steps":["Invoke the real MK-VI ledger CLI on release-scoped filesystem roots containing one missing, stale, unhashed, wrong-release, skipped, structural-only, empty-data, and nonterminal receipt case"]},"end_state":{"must_observe":["invalid_receipt_variants_rejected == 8","CLI exit_code == 1","failed_criteria_count >= 8"],"must_not_observe":["CLI exit_code == 0","failed criteria list is empty","promotable == true"]}}]}
AC-3: The existing five negative-control verifier entries remain registered and are composed rather than replaced; seeded missing-evidence, queue-recreation, mission-501, MCP semantic-no-op, and client-fallback cases each produce a named failing ledger result.
  verify: bun test services/platform/tests/integration/mk6-capability-ledger.test.ts
  scenario: {"id":"AC-3","primary":true,"test_tier":"integration","verification_service":"existing gate registry composed through the real MK-VI ledger CLI","negative_control":{"would_fail_if":["one registered negative control is removed","the MCP semantic no-op fixture is replaced by a static success","client fallback detection is stubbed"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"reproduction","action":{"steps":["Execute the composed registry through the real ledger entrypoint with seeded missing-evidence, queue-recreation, mission-501, MCP-semantic-no-op, and client-fallback violations"]},"end_state":{"must_observe":["named_negative_controls_failed == 5","existing_registered_verifiers_preserved == 5","CLI exit_code == 1"],"must_not_observe":["named_negative_controls_failed == 0","negative-control result set is empty","CLI exit_code == 0"]}}]}
AC-4: The ledger emits a redacted machine-readable report that identifies failed criteria and the owning existing recovery package, while retaining no credential values.
  verify: bun test services/platform/tests/integration/mk6-capability-ledger.test.ts
  scenario: {"id":"AC-4","primary":true,"test_tier":"integration","verification_service":"Bun CLI stdout, stderr, and machine-readable report file","negative_control":{"would_fail_if":["a nested operator secret is emitted unchanged","report serialization passes unknown fields through","redaction is removed"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"reproduction","action":{"steps":["Invoke the real ledger CLI with a known secret canary placed in nested receipt input, HTTP-like headers/body fields, process environment, and argv-shaped fields, then capture stdout, stderr, exit code, and the report file"]},"end_state":{"must_observe":["failed_criteria_count >= 1","reported_failed_criteria_with_owner == failed_criteria_count","credential_value_occurrences_across_stdout_stderr_report == 0","CLI exit_code == 1"],"must_not_observe":["secret canary value appears in output","machine-readable report is empty","unknown nested secret field is retained"]}}]}
AC-5: A release can be marked promotable == true only after one newly captured, release-specific, real-service ledger run reports exactly criterionEvaluations == 105, exactly requiredPromotionGateSteps == 10, and failedCriteria == 0; its retained manifest contains exactly 10 non-symlink step-receipt entries keyed by H2-06's ten ordered step IDs, each with a 64-hex SHA-256 rehashed from retained bytes and matched to a read-only release-locked manifest bound to the same candidate source SHA, immutable image digest, compose generation, host identity, and deployment timestamp. The ten steps occur in H2-06 order: release identity; compose/secret-name preflight; Mastra-and-scheduler in-container fleet list and completion; three external private health 200 responses; non-empty Postgres identity across HTTP/MCP/Zero; terminal mission plus scheduler side effect; all-44 behavioral MCP sweep including declared failures; real iOS/Zero mission and durable-mutation proof; backup heartbeat and alert readiness; and automatic rollback before authority changes. The positive case invokes the actual candidate with real Postgres, fleet, HTTP/MCP/Zero, scheduler, and iOS environments; mocks, structural fixtures, cached or historical receipts, static-shell output, and receipt self-declared hashes cannot pass. Against that same successful release run, first deleting exactly one retained step receipt, then restoring it and byte-mutating exactly one retained step receipt, each returns promotable == false, failedCriteria >= 1, and a named failure record for the affected step: RECEIPT_MISSING with expected digest for deletion, or RECEIPT_DIGEST_MISMATCH with expected and actual digests for mutation, while the other nine receipts remain valid. The green case rejects an always-false implementation; each corruption case rejects an always-true implementation.
  verify: bun test services/platform/tests/integration/mk6-capability-ledger.test.ts
  scenario: {"id":"AC-5","primary":true,"test_tier":"e2e","verification_service":"actual candidate plus real Postgres, fleet, HTTP/MCP/Zero, scheduler, iOS, backup, alert, rollback, and retained release receipt root","negative_control":{"would_fail_if":["promotable is hardcoded true","promotable is an always-false stub","one required step receipt is omitted","cached historical receipts are accepted"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"successful_release","action":{"steps":["Run the real ledger CLI over the newly captured release-locked manifest and all ten retained H2-06 step receipts without altering them"]},"end_state":{"must_observe":["criterionEvaluations == 105","requiredPromotionGateSteps == 10","failedCriteria == 0","receiptDigestMatches == 10","promotable == true"],"must_not_observe":["promotable == false","retained receipt set is empty","failedCriteria >= 1"]}},{"start_ref":"successful_release","action":{"steps":["Delete exactly one retained step receipt from the successful release root, then rerun the real ledger CLI"]},"end_state":{"must_observe":["promotable == false","failedCriteria >= 1","failures[0].code == \"RECEIPT_MISSING\"","validStepReceipts == 9","missingStepReceipts == 1"],"must_not_observe":["promotable == true","failure list is empty","validStepReceipts == 10"]}},{"start_ref":"successful_release","action":{"steps":["Restore the deleted receipt, byte-mutate exactly one retained step receipt, then rerun the real ledger CLI"]},"end_state":{"must_observe":["promotable == false","failedCriteria >= 1","failures[0].code == \"RECEIPT_DIGEST_MISMATCH\"","validStepReceipts == 9","digestMismatchStepReceipts == 1"],"must_not_observe":["promotable == true","failure list is empty","validStepReceipts == 10"]}}]}
TC-1: Maps to AC-1 (inherits AC-1's scenario)
TC-2: Maps to AC-2 (inherits AC-2's scenario)
TC-3: Maps to AC-3 (inherits AC-3's scenario)
TC-4: Maps to AC-4 (inherits AC-4's scenario)
TC-5: Maps to AC-5 (inherits AC-5's scenario)
-->

## Out of scope

- Fixing the independently identified H0-H4 runtime, MCP, Mastra, client,
  backup, deployment, and decommission defects themselves; the ledger must
  expose them as failed program work until their real oracles pass.
- Changing immutable MK-VI PRD/task artifacts, running deployments, restarting
  services, operating on credentials, or authorizing Convex deletion.

## Risks

- A ledger is only a truthful boundary; it does not repair product behavior and
  must not be presented as restoration.
- Human-gate criteria require an authorized host, simulator, and real-service
  window; the ledger must report them unproven rather than synthesize success.
- The active `mcp-sqlite-local` worktree has no proposed-path overlap but may
  change MCP behavior that must be re-proven before relevant ledger entries pass.
- Binding security review: report and receipt schemas must be allowlisted and
  must never serialize raw receipt bytes, headers/bodies, environment, argv, or
  unknown nested fields. The canary test must cover stdout, stderr, and reports.
- Receipt paths must remain beneath the immutable release-specific evidence
  root; reject symlink/path escape and rehash bytes against the release-locked
  manifest rather than trusting self-declared hashes.
- `promotable` is a derived, read-only result. The ledger may not deploy,
  restart, operate on credentials, delete, force, or skip product behavior.

## Verification posture

Per `AGENTS.md` Supreme Rule, the task is complete only when each AC is verified
against real services. The scenario validator has accepted the five embedded
contracts, but that validates oracle shape only; it does not prove product
behavior. AC-5 therefore remains incomplete until the actual release candidate,
real Postgres, fleet, HTTP/MCP/Zero, scheduler, iOS, backup, alert, rollback, and
ten retained step receipts have been exercised and captured.
