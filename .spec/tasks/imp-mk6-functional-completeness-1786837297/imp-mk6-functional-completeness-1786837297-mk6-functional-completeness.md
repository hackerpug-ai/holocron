# imp-mk6-functional-completeness-1786837297-mk6-functional-completeness: Restore all MK-VI scoped functionality to specified operation

> Status: 🔴 Needs Fixes
> Cycle: 3
> Commit: 2f79a511a861553c236f980d2a5f07f95acfb451
> Reviewer: product-manager + mastra-reviewer
> Fix: tt-003
> Updated: 2026-08-16T07:03:21Z
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

- [x] AC-1: The immutable 105-criterion MK-VI contract is represented exactly once with criterion ID, domain, required real oracle, receipt kind, release identity fields, freshness requirement, and mapped H0-H4 recovery package.
- [ ] AC-2: A ledger run fails closed for a missing, stale, unhashed, wrong-release, skipped, structural-only, empty-data, or nonterminal receipt; it cannot convert a 501, zero-row read, or historical artifact into a pass. ← FAIL: Eight variants pass technical review, but omitted fields and step-level 501 or z
- [ ] AC-3: The existing five negative-control verifier entries remain registered and are composed rather than replaced; seeded missing-evidence, queue-recreation, mission-501, MCP semantic-no-op, and client-fallback cases each produce a named failing ledger result. ← FAIL: The contract-named controls are absent and any non-zero child result becomes a n
- [ ] AC-4: The ledger emits a redacted machine-readable report that identifies failed criteria and the owning existing recovery package, while retaining no credential values. ← FAIL: Attacker-controlled IDs and release strings can reach redacted report fields or 
- [ ] AC-5: A release can be marked promotable == true only after one newly captured, release-specific, real-service ledger run reports exactly criterionEvaluations == 105, exactly requiredPromotionGateSteps == 10, and failedCriteria == 0; its retained manifest contains exactly 10 non-symlink step-receipt entries keyed by H2-06's ten ordered step IDs, each with a 64-hex SHA-256 rehashed from retained bytes and matched to a read-only release-locked manifest bound to the same candidate source SHA, immutable image digest, compose generation, host identity, and deployment timestamp. The ten steps occur in H2-06 order: release identity; compose/secret-name preflight; Mastra-and-scheduler in-container fleet list and completion; three external private health 200 responses; non-empty Postgres identity across HTTP/MCP/Zero; terminal mission plus scheduler side effect; all-44 behavioral MCP sweep including declared failures; real iOS/Zero mission and durable-mutation proof; backup heartbeat and alert readiness; and automatic rollback before authority changes. The positive case invokes the actual candidate with real Postgres, fleet, HTTP/MCP/Zero, scheduler, and iOS environments; mocks, structural fixtures, cached or historical receipts, static-shell output, and receipt self-declared hashes cannot pass. Against that same successful release run, first deleting exactly one retained step receipt, then restoring it and byte-mutating exactly one retained step receipt, each returns promotable == false, failedCriteria >= 1, and a named failure record for the affected step: RECEIPT_MISSING with expected digest for deletion, or RECEIPT_DIGEST_MISMATCH with expected and actual digests for mutation, while the other nine receipts remain valid. The green case rejects an always-false implementation; each corruption case rejects an always-true implementation. ← FAIL: Ten receipts now carry 105 evaluations, but self-attestation is forgeable and no

## Test Criteria

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | The ledger loads exactly 105 unique MK-VI criteria and every criterion carries its required domain, oracle, receipt, release, freshness, and owner fields. | AC-1 | `bun test services/platform/tests/integration/mk6-capability-ledger.test.ts` | [x] TRUE [ ] FALSE |
| 2 | The real ledger CLI rejects all eight named invalid receipt states with a non-zero result and named failed criteria. | AC-2 | `bun test services/platform/tests/integration/mk6-capability-ledger.test.ts` | [x] TRUE [ ] FALSE |
| 3 | The composed registry preserves five existing verifiers and fails all five named semantic negative controls. | AC-3 | `bun test services/platform/tests/integration/mk6-capability-ledger.test.ts` | [ ] TRUE [x] FALSE |
| 4 | The machine-readable report names failed criteria and owners while a nested secret canary appears zero times in stdout, stderr, and the report. | AC-4 | `bun test services/platform/tests/integration/mk6-capability-ledger.test.ts` | [ ] TRUE [x] FALSE |
| 5 | A real candidate is promotable only at 105 evaluations, 10 valid step receipts, and zero failures; deleting or mutating one receipt produces the named failure and leaves nine valid receipts. | AC-5 | `bun test services/platform/tests/integration/mk6-capability-ledger.test.ts` | [ ] TRUE [x] FALSE |


## Remediation Trail
| Cycle | FIX | Failed Reqs | Reviewer | At |
|-------|-----|-------------|----------|----|
| 2 | tt-002 | AC-1, AC-2, AC-3, AC-4, AC-5, TC-1, TC-2, TC-3, TC-4, TC-5 | product-manager + mastra-reviewer | 2026-08-16T06:30:04Z |
| 3 | tt-003 | AC-2, AC-3, AC-4, AC-5, TC-3, TC-4, TC-5 | product-manager + mastra-reviewer | 2026-08-16T07:03:21Z |
<!-- REQUIREMENT-CONTRACT v1
AC-1: The immutable 105-criterion MK-VI contract is represented exactly once with criterion ID, domain, required real oracle, receipt kind, release identity fields, freshness requirement, and mapped H0-H4 recovery package.
  verify: bun test services/platform/tests/integration/mk6-capability-ledger.test.ts
  satisfied: true
  evidence: Both lenses verified source digest, exact 105 rows, unique required fields, and owner mapping.
  last_evaluated_cycle: 3
  last_evaluated_commit: 2f79a511
AC-2: A ledger run fails closed for a missing, stale, unhashed, wrong-release, skipped, structural-only, empty-data, or nonterminal receipt; it cannot convert a 501, zero-row read, or historical artifact into a pass.
  verify: bun test services/platform/tests/integration/mk6-capability-ledger.test.ts
  satisfied: false
  evidence: Eight variants pass technical review, but omitted fields and step-level 501 or zero-row outcomes can pass.
  last_evaluated_cycle: 3
  last_evaluated_commit: 2f79a511
AC-3: The existing five negative-control verifier entries remain registered and are composed rather than replaced; seeded missing-evidence, queue-recreation, mission-501, MCP semantic-no-op, and client-fallback cases each produce a named failing ledger result.
  verify: bun test services/platform/tests/integration/mk6-capability-ledger.test.ts
  satisfied: false
  evidence: The contract-named controls are absent and any non-zero child result becomes a named semantic failure.
  last_evaluated_cycle: 3
  last_evaluated_commit: 2f79a511
AC-4: The ledger emits a redacted machine-readable report that identifies failed criteria and the owning existing recovery package, while retaining no credential values.
  verify: bun test services/platform/tests/integration/mk6-capability-ledger.test.ts
  satisfied: false
  evidence: Attacker-controlled IDs and release strings can reach redacted report fields or messages.
  last_evaluated_cycle: 3
  last_evaluated_commit: 2f79a511
AC-5: A release can be marked promotable == true only after one newly captured, release-specific, real-service ledger run reports exactly criterionEvaluations == 105, exactly requiredPromotionGateSteps == 10, and failedCriteria == 0; its retained manifest contains exactly 10 non-symlink step-receipt entries keyed by H2-06's ten ordered step IDs, each with a 64-hex SHA-256 rehashed from retained bytes and matched to a read-only release-locked manifest bound to the same candidate source SHA, immutable image digest, compose generation, host identity, and deployment timestamp. The ten steps occur in H2-06 order: release identity; compose/secret-name preflight; Mastra-and-scheduler in-container fleet list and completion; three external private health 200 responses; non-empty Postgres identity across HTTP/MCP/Zero; terminal mission plus scheduler side effect; all-44 behavioral MCP sweep including declared failures; real iOS/Zero mission and durable-mutation proof; backup heartbeat and alert readiness; and automatic rollback before authority changes. The positive case invokes the actual candidate with real Postgres, fleet, HTTP/MCP/Zero, scheduler, and iOS environments; mocks, structural fixtures, cached or historical receipts, static-shell output, and receipt self-declared hashes cannot pass. Against that same successful release run, first deleting exactly one retained step receipt, then restoring it and byte-mutating exactly one retained step receipt, each returns promotable == false, failedCriteria >= 1, and a named failure record for the affected step: RECEIPT_MISSING with expected digest for deletion, or RECEIPT_DIGEST_MISMATCH with expected and actual digests for mutation, while the other nine receipts remain valid. The green case rejects an always-false implementation; each corruption case rejects an always-true implementation.
  verify: bun test services/platform/tests/integration/mk6-capability-ledger.test.ts
  satisfied: false
  evidence: Ten receipts now carry 105 evaluations, but self-attestation is forgeable and no fresh real candidate proof exists.
  last_evaluated_cycle: 3
  last_evaluated_commit: 2f79a511
TC-1: Maps to AC-1 (inherits AC-1's scenario)
  satisfied: true
  evidence: Exact-105 and source-tamper tests with RED-to-GREEN lineage were verified.
  last_evaluated_cycle: 3
  last_evaluated_commit: 2f79a511
TC-2: Maps to AC-2 (inherits AC-2's scenario)
  satisfied: true
  evidence: Eight named CLI variants plus poison cases were verified.
  last_evaluated_cycle: 3
  last_evaluated_commit: 2f79a511
TC-3: Maps to AC-3 (inherits AC-3's scenario)
  satisfied: false
  evidence: Tests accept wrong control IDs and any non-zero exit.
  last_evaluated_cycle: 3
  last_evaluated_commit: 2f79a511
TC-4: Maps to AC-4 (inherits AC-4's scenario)
  satisfied: false
  evidence: Canary misses raw ID, release-field, and child-output leak paths.
  last_evaluated_cycle: 3
  last_evaluated_commit: 2f79a511
TC-5: Maps to AC-5 (inherits AC-5's scenario)
  satisfied: false
  evidence: No real successful root exists and symlink or path discriminators are incomplete.
  last_evaluated_cycle: 3
  last_evaluated_commit: 2f79a511
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
