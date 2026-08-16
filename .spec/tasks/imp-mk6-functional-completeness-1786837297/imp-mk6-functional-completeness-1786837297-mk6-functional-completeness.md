# imp-mk6-functional-completeness-1786837297-mk6-functional-completeness: Restore all MK-VI scoped functionality to specified operation

> Status: 🔴 Needs Fixes
> Cycle: 4
> Commit: 43fc73016629dab093f2feb3c8a5fc60323098ac
> Reviewer: mastra-implementer contract audit + orchestrator verification
> Fix: tt-004
> Updated: 2026-08-16T07:51:52Z
> Assignee: mastra-implementer
> Priority: P1
> Type: bugfix
> Wave: 15
> Proposed by: mastra-planner
> Files: services/platform/src/verify/mk6-capability-contract.ts, services/platform/src/verify/mk6-capability-ledger.ts, services/platform/src/verify/gate-registry.ts, scripts/verify-mk6-promotion-ledger.sh, services/platform/tests/integration/mk6-capability-ledger.test.ts
> Patterns: minimum-diff-discipline, anti-stub
> Scope: /Users/justinrich/.config/brain/improvements/imp-mk6-functional-completeness-1786837297.json
> Depends on: MK6-RELEASE-001

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

## Learned spec-repair unblock route

Review cycle 4 established that the original six-file ledger cannot itself implement the
five semantic controls or repair the H0-H4 product seams. The prerequisite task
map in `SPRINT.md` is follow-up dependency work, not an expansion of this task's
write scope and not a regeneration from an amended ScopeState. This task remains
blocked until MK6-RELEASE-001 supplies one immutable candidate and the following
commands exist and pass their real positive paths while failing their named
negative controls:

- `PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --negative-control missing-evidence --json`
- `PLATFORM_IT=1 bash scripts/verify-mk6-queue-lifecycle.sh --negative-control queue-recreation --json`
- `PLATFORM_IT=1 bash scripts/verify-mk6-mission-lifecycle.sh --negative-control mission-501 --json`
- `PLATFORM_IT=1 bash scripts/verify-mk6-mcp-executor.sh --negative-control mcp-semantic-no-op --json`
- `PLATFORM_IT=1 bash scripts/e2e/run-client-runtime-config-and-mutation.sh --negative-control client-fallback --json`

Exclusive `services/platform/src/cli/holo.ts` ownership transferred to
MK6-PROVENANCE-001 so the canonical CLI is repaired before this task. After
those prerequisites land, remediation resumes only in this task's remaining five
files: register the executable commands, close AC-2/AC-4 defects, and run the
full 105-criterion/10-receipt positive and corruption sequence. The remediation
trail below remains historical evidence and is not rewritten by this repair.

## Acceptance Criteria

- [x] AC-1: The immutable 105-criterion MK-VI contract is represented exactly once with criterion ID, domain, required real oracle, receipt kind, release identity fields, freshness requirement, and mapped H0-H4 recovery package.
- [ ] AC-2: A ledger run fails closed for a missing, stale, unhashed, wrong-release, skipped, structural-only, empty-data, or nonterminal receipt; it cannot convert a 501, zero-row read, or historical artifact into a pass. ← FAIL: The eight structural variants are discriminated, but omitted required fields can
- [ ] AC-3: The existing five negative-control verifier entries remain registered and are composed rather than replaced; seeded missing-evidence, queue-recreation, mission-501, MCP semantic-no-op, and client-fallback cases each produce a named failing ledger result. ← FAIL: All five contract-named controls are explicitly command=unavailable and executeS
- [ ] AC-4: The ledger emits a redacted machine-readable report that identifies failed criteria and the owning existing recovery package, while retaining no credential values. ← FAIL: The serializer is field-allowlisted, but attacker-controlled step IDs, criterion
- [ ] AC-5: A release can be marked promotable == true only after one newly captured, release-specific, real-service ledger run reports exactly criterionEvaluations == 105, exactly requiredPromotionGateSteps == 10, and failedCriteria == 0; its retained manifest contains exactly 10 non-symlink step-receipt entries keyed by H2-06's ten ordered step IDs, each with a 64-hex SHA-256 rehashed from retained bytes and matched to a read-only release-locked manifest bound to the same candidate source SHA, immutable image digest, compose generation, host identity, and deployment timestamp. The ten steps occur in H2-06 order: release identity; compose/secret-name preflight; Mastra-and-scheduler in-container fleet list and completion; three external private health 200 responses; non-empty Postgres identity across HTTP/MCP/Zero; terminal mission plus scheduler side effect; all-44 behavioral MCP sweep including declared failures; real iOS/Zero mission and durable-mutation proof; backup heartbeat and alert readiness; and automatic rollback before authority changes. The positive case invokes the actual candidate with real Postgres, fleet, HTTP/MCP/Zero, scheduler, and iOS environments; mocks, structural fixtures, cached or historical receipts, static-shell output, and receipt self-declared hashes cannot pass. Against that same successful release run, first deleting exactly one retained step receipt, then restoring it and byte-mutating exactly one retained step receipt, each returns promotable == false, failedCriteria >= 1, and a named failure record for the affected step: RECEIPT_MISSING with expected digest for deletion, or RECEIPT_DIGEST_MISMATCH with expected and actual digests for mutation, while the other nine receipts remain valid. The green case rejects an always-false implementation; each corruption case rejects an always-true implementation. ← FAIL: Exactly ten receipts now account for 105 evaluations, but live flags and the uns

## Test Criteria

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | The real ledger loads exactly 105 unique criteria with all required fields. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-promotion-ledger.sh --candidate-manifest "$MK6_CANDIDATE_MANIFEST" --json` | [x] TRUE [ ] FALSE |
| 2 | The real CLI rejects every named invalid-receipt matrix case. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-mk6-promotion-ledger.sh --candidate-manifest "$MK6_CANDIDATE_MANIFEST" --negative-control invalid-receipt-matrix --json` | [x] TRUE [ ] FALSE |
| 3 | The composed registry executes and fails all five real semantic controls. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-mk6-promotion-ledger.sh --candidate-manifest "$MK6_CANDIDATE_MANIFEST" --execute-semantic-controls --json` | [ ] TRUE [x] FALSE |
| 4 | A nested secret canary appears zero times in stdout, stderr, reports, and child captures. | AC-4 | `PLATFORM_IT=1 bash scripts/verify-mk6-promotion-ledger.sh --candidate-manifest "$MK6_CANDIDATE_MANIFEST" --redaction-control --json` | [ ] TRUE [x] FALSE |
| 5 | The same-root real candidate is promotable at exactly 105/10/0. | AC-5 | `PLATFORM_IT=1 bash scripts/verify-mk6-promotion-ledger.sh --candidate-manifest "$MK6_CANDIDATE_MANIFEST" --json` | [ ] TRUE [x] FALSE |
| 6 | Deleting one retained receipt makes the same candidate non-promotable and leaves nine valid receipts. | AC-5 | `PLATFORM_IT=1 bash scripts/verify-mk6-promotion-ledger.sh --candidate-manifest "$MK6_CANDIDATE_MANIFEST" --negative-control missing-receipt --json` | [ ] TRUE [x] FALSE |
| 7 | Byte-mutating one retained receipt makes the same candidate non-promotable and leaves nine valid receipts. | AC-5 | `PLATFORM_IT=1 bash scripts/verify-mk6-promotion-ledger.sh --candidate-manifest "$MK6_CANDIDATE_MANIFEST" --negative-control byte-mutation --json` | [ ] TRUE [x] FALSE |

`bun test services/platform/tests/integration/mk6-capability-ledger.test.ts` remains a supplemental deterministic test and cannot satisfy any behavioral criterion without the commands above.


## Remediation Trail
| Cycle | FIX | Failed Reqs | Reviewer | At |
|-------|-----|-------------|----------|----|
| 2 | tt-002 | AC-1, AC-2, AC-3, AC-4, AC-5, TC-1, TC-2, TC-3, TC-4, TC-5 | product-manager + mastra-reviewer | 2026-08-16T06:30:04Z |
| 3 | tt-003 | AC-2, AC-3, AC-4, AC-5, TC-3, TC-4, TC-5 | product-manager + mastra-reviewer | 2026-08-16T07:03:21Z |
| 4 | tt-004 | AC-2, AC-3, AC-4, AC-5, TC-3, TC-4, TC-5 | mastra-implementer contract audit + orchestrator verification | 2026-08-16T07:51:52Z |
<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"imp-mk6-functional-completeness-1786837297-mk6-functional-completeness","tdd_mode":"red_first","verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},"fixtures":{"real_candidate":{"seed_method":"cli","description":"new same-root real-service candidate manifest produced by MK6-RELEASE-001","records":["criterionEvaluations: 105","requiredPromotionGateSteps: 10"]},"invalid_receipts":{"seed_method":"cli","description":"disposable copies of one real candidate receipt set covering ten invalid states","records":["invalidVariantCount: 10"]},"semantic_controls":{"seed_method":"cli","description":"real positive baselines plus five producer-owned disposable controls","records":["semanticControlCount: 5"]},"redaction_canary":{"seed_method":"cli","description":"real candidate invocation with nested secret canary supplied outside argv","records":["expectedCanaryOccurrenceCount: 0"]},"same_root_controls":{"seed_method":"cli","description":"one successful retained candidate root copied only for missing and byte-mutation controls","records":["orderedReceiptCount: 10"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"Real ledger evaluates exactly 105 unique fully mapped criteria","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-promotion-ledger.sh --candidate-manifest \"$MK6_CANDIDATE_MANIFEST\" --json","maps_to_ac":null,"scenario":{"id":"ledger-105-contract","test_tier":"e2e","tier":"visible","verification_service":"mk6-real-candidate-ledger","negative_control":{"would_fail_if":["one criterion is removed or required fields are hardcoded empty"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"real_candidate","action":{"steps":["execute real ledger against new candidate manifest"]},"end_state":{"must_observe":["criterionEvaluations: 105","uniqueCriterionCount: 105","unmappedCriterionCount: 0"],"must_not_observe":["criterionEvaluations: 0","empty criterion identifier"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"Real ledger rejects every invalid receipt state","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-promotion-ledger.sh --candidate-manifest \"$MK6_CANDIDATE_MANIFEST\" --negative-control invalid-receipt-matrix --json","maps_to_ac":null,"scenario":{"id":"ledger-invalid-receipts","test_tier":"integration","tier":"visible","verification_service":"mk6-receipt-verifier","negative_control":{"would_fail_if":["one invalid receipt is accepted or empty data passes"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"invalid_receipts","action":{"steps":["omit one required field"]},"end_state":{"must_observe":["failureCount: 1","failureClass: RECEIPT_FIELD_MISSING"],"must_not_observe":["failureCount: 0","empty failure class"]}},{"start_ref":"invalid_receipts","action":{"steps":["use stale receipt"]},"end_state":{"must_observe":["failureCount: 1","failureClass: RECEIPT_STALE"],"must_not_observe":["failureCount: 0","empty capturedAt"]}},{"start_ref":"invalid_receipts","action":{"steps":["remove receipt digest"]},"end_state":{"must_observe":["failureCount: 1","failureClass: RECEIPT_DIGEST_MISSING"],"must_not_observe":["failureCount: 0","empty failure class"]}},{"start_ref":"invalid_receipts","action":{"steps":["bind receipt to wrong release"]},"end_state":{"must_observe":["failureCount: 1","failureClass: RELEASE_IDENTITY_MISMATCH"],"must_not_observe":["failureCount: 0","empty release identity"]}},{"start_ref":"invalid_receipts","action":{"steps":["mark mandatory lane skipped"]},"end_state":{"must_observe":["failureCount: 1","failureClass: MANDATORY_LANE_SKIPPED"],"must_not_observe":["failureCount: 0","empty lane identifier"]}},{"start_ref":"invalid_receipts","action":{"steps":["substitute structural-only receipt"]},"end_state":{"must_observe":["failureCount: 1","failureClass: BEHAVIORAL_EVIDENCE_MISSING"],"must_not_observe":["failureCount: 0","empty oracle identity"]}},{"start_ref":"invalid_receipts","action":{"steps":["substitute zero-row read"]},"end_state":{"must_observe":["failureCount: 1","failureClass: EMPTY_DATA_PLANE"],"must_not_observe":["failureCount: 0","empty sentinel accepted"]}},{"start_ref":"invalid_receipts","action":{"steps":["substitute nonterminal mission"]},"end_state":{"must_observe":["failureCount: 1","failureClass: MISSION_NOT_TERMINAL"],"must_not_observe":["failureCount: 0","empty terminal status"]}},{"start_ref":"invalid_receipts","action":{"steps":["substitute mission 501"]},"end_state":{"must_observe":["failureCount: 1","failureClass: MISSION_LIST_501"],"must_not_observe":["failureCount: 0","empty HTTP status"]}},{"start_ref":"invalid_receipts","action":{"steps":["substitute historical artifact"]},"end_state":{"must_observe":["failureCount: 1","failureClass: RECEIPT_NOT_CURRENT"],"must_not_observe":["failureCount: 0","empty capture timestamp"]}}]}},{"id":"AC-3","type":"acceptance_criterion","description":"Ledger executes all five producer-owned semantic controls","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-promotion-ledger.sh --candidate-manifest \"$MK6_CANDIDATE_MANIFEST\" --execute-semantic-controls --json","maps_to_ac":null,"scenario":{"id":"ledger-semantic-controls","test_tier":"e2e","tier":"visible","verification_service":"recovery-queue-mission-mcp-ios","negative_control":{"would_fail_if":["one semantic command is absent or mutant failure is ignored"]},"evidence":{"artifact_type":"event_log","required_capture":true},"cases":[{"start_ref":"semantic_controls","action":{"steps":["execute missing-evidence control after its real baseline"]},"end_state":{"must_observe":["executedControlCount: 1","failureClass: RECEIPT_MISSING"],"must_not_observe":["executedControlCount: 0","empty command"]}},{"start_ref":"semantic_controls","action":{"steps":["execute queue-recreation control after its real baseline"]},"end_state":{"must_observe":["executedControlCount: 1","failureClass: QUEUE_RECREATION_DETECTED"],"must_not_observe":["executedControlCount: 0","empty command"]}},{"start_ref":"semantic_controls","action":{"steps":["execute mission-501 control after its real baseline"]},"end_state":{"must_observe":["executedControlCount: 1","failureClass: MISSION_LIST_501"],"must_not_observe":["executedControlCount: 0","empty command"]}},{"start_ref":"semantic_controls","action":{"steps":["execute MCP semantic-no-op control after its real baseline"]},"end_state":{"must_observe":["executedControlCount: 1","failureClass: MCP_SEMANTIC_NO_OP"],"must_not_observe":["executedControlCount: 0","empty command"]}},{"start_ref":"semantic_controls","action":{"steps":["execute client-fallback control after its real baseline"]},"end_state":{"must_observe":["executedControlCount: 1","failureClass: CLIENT_FALLBACK_DETECTED"],"must_not_observe":["executedControlCount: 0","empty command"]}}]}},{"id":"AC-4","type":"acceptance_criterion","description":"Machine report is allowlisted and redacts nested canary everywhere","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-promotion-ledger.sh --candidate-manifest \"$MK6_CANDIDATE_MANIFEST\" --redaction-control --json","maps_to_ac":null,"scenario":{"id":"ledger-redaction","test_tier":"integration","tier":"visible","verification_service":"ledger-cli-child-processes","negative_control":{"would_fail_if":["redaction is removed or unknown nested fields are serialized"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"redaction_canary","action":{"steps":["run real ledger and scan stdout, stderr, report, and child captures"]},"end_state":{"must_observe":["canaryOccurrenceCount: 0","failedCriterionOwnerCount > 0"],"must_not_observe":["canaryOccurrenceCount: 1","empty redaction receipt"]}}]}},{"id":"AC-5","type":"acceptance_criterion","description":"Same-root candidate passes 105/10/0 then fails deletion and byte mutation","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-promotion-ledger.sh --candidate-manifest \"$MK6_CANDIDATE_MANIFEST\" --json","maps_to_ac":null,"scenario":{"id":"ledger-promotion-controls","test_tier":"e2e","tier":"visible","verification_service":"mk6-real-candidate-retained-bytes","negative_control":{"would_fail_if":["missing or mutated receipt is accepted or positive path is hardcoded false"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"same_root_controls","action":{"steps":["run positive ledger against retained candidate root"]},"end_state":{"must_observe":["promotableCount: 1","criterionEvaluations: 105","validReceiptCount: 10","failedCriteria: 0"],"must_not_observe":["promotableCount: 0","empty candidate identity"]}},{"start_ref":"same_root_controls","action":{"steps":["delete exactly one retained step receipt and rerun"]},"end_state":{"must_observe":["promotableCount: 0","failureClass: RECEIPT_MISSING","validReceiptCount: 9"],"must_not_observe":["validReceiptCount: 0","empty expected digest"]}},{"start_ref":"same_root_controls","action":{"steps":["restore then mutate one retained receipt byte and rerun"]},"end_state":{"must_observe":["promotableCount: 0","failureClass: RECEIPT_DIGEST_MISMATCH","validReceiptCount: 9"],"must_not_observe":["validReceiptCount: 0","empty actual digest"]}}]}},{"id":"TC-1","type":"test_criterion","description":"Real ledger evaluates 105 unique criteria","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-promotion-ledger.sh --candidate-manifest \"$MK6_CANDIDATE_MANIFEST\" --json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"Invalid receipt matrix fails","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-promotion-ledger.sh --candidate-manifest \"$MK6_CANDIDATE_MANIFEST\" --negative-control invalid-receipt-matrix --json","maps_to_ac":"AC-2"},{"id":"TC-3","type":"test_criterion","description":"Five semantic controls execute and fail","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-promotion-ledger.sh --candidate-manifest \"$MK6_CANDIDATE_MANIFEST\" --execute-semantic-controls --json","maps_to_ac":"AC-3"},{"id":"TC-4","type":"test_criterion","description":"Nested canary is redacted","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-promotion-ledger.sh --candidate-manifest \"$MK6_CANDIDATE_MANIFEST\" --redaction-control --json","maps_to_ac":"AC-4"},{"id":"TC-5","type":"test_criterion","description":"Positive candidate is 105/10/0","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-promotion-ledger.sh --candidate-manifest \"$MK6_CANDIDATE_MANIFEST\" --json","maps_to_ac":"AC-5"},{"id":"TC-6","type":"test_criterion","description":"Missing receipt fails same root","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-promotion-ledger.sh --candidate-manifest \"$MK6_CANDIDATE_MANIFEST\" --negative-control missing-receipt --json","maps_to_ac":"AC-5"},{"id":"TC-7","type":"test_criterion","description":"Byte mutation fails same root","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-promotion-ledger.sh --candidate-manifest \"$MK6_CANDIDATE_MANIFEST\" --negative-control byte-mutation --json","maps_to_ac":"AC-5"}]}
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
