# MK6-PROMOTION-001: Promote and soak the exact ledger-approved release

> Status: Backlog
> Assignee: devops-engineer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: manual verification
> Wave: 16
> Proposed by: mastra-planner
> Files: .gate-evidence/mk6-promotion/**, .gate-evidence/mk6-soak/**
> Depends on: imp-mk6-functional-completeness-1786837297-mk6-functional-completeness

## Outcome

The exact 105/105 ledger-approved immutable release is promoted and survives 24-hour and 72-hour operational checkpoints without identity drift or mandatory SLO violation.

## Acceptance Criteria

- [ ] AC-1: `MANUAL-ONLY PROMOTE-M1`: an authorized operator runs `bash scripts/run-mk6-promotion.sh --promote-ledger-manifest "$MK6_LEDGER_MANIFEST" --json`; installed SHA/image/generation/host exactly match the ledger and rollback remains armed.
- [ ] AC-2: `MANUAL-ONLY SOAK-M1`: the same installed release produces fresh 24h and 72h evidence with p95 latency, error rate, queue depth/lease age, backup ages, fleet success, tripwire rate, eval regression, and zero identity drift within immutable thresholds.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Installed identity byte-for-byte matches the ledger-approved candidate after promotion. | AC-1 | `bash scripts/run-mk6-promotion.sh --verify-installed --ledger-manifest "$MK6_LEDGER_MANIFEST" --json` |
| TC-2 | A fresh 72-hour report covers the same identity and every mandatory SLO. | AC-2 | `bash scripts/run-mk6-promotion.sh --verify-soak --hours 72 --ledger-manifest "$MK6_LEDGER_MANIFEST" --json` |

Elapsed time, host promotion authority, and installed service ownership are manual-only; source changes or synthetic timestamps cannot satisfy this task.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"MK6-PROMOTION-001","tdd_mode":"skipped","verification_policy":{"requires_tests":true,"requires_red_evidence":false,"requires_seeded_evidence":true},"fixtures":{"approved_release":{"seed_method":"recorded_external","description":"ledger-approved exact release installed by an authorized operator","records":["criterionEvaluations: 105","orderedReceiptCount: 10"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN a 105-of-105 approved manifest WHEN an operator promotes it THEN installed and manifest identities match exactly","verify":"bash scripts/run-mk6-promotion.sh --verify-installed --ledger-manifest \"$MK6_LEDGER_MANIFEST\" --json","maps_to_ac":null,"scenario":{"test_tier":"e2e","tier":"visible","verification_service":"installed-production-release","negative_control":{"would_fail_if":["the installed release differs or identity is hardcoded"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"approved_release","action":{"steps":["authorized operator promotes the exact manifest and queries installed identity"]},"end_state":{"must_observe":["criterionEvaluations: 105","identityMismatchCount: 0"],"must_not_observe":["criterionEvaluations: 0","empty installed identity"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"The same release survives fresh 24h and 72h SLO checkpoints","verify":"bash scripts/run-mk6-promotion.sh --verify-soak --hours 72 --ledger-manifest \"$MK6_LEDGER_MANIFEST\" --json","maps_to_ac":null},{"id":"TC-1","type":"test_criterion","description":"Installed identity matches the approved manifest","verify":"bash scripts/run-mk6-promotion.sh --verify-installed --ledger-manifest \"$MK6_LEDGER_MANIFEST\" --json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"The 72-hour report covers the same release and all SLOs","verify":"bash scripts/run-mk6-promotion.sh --verify-soak --hours 72 --ledger-manifest \"$MK6_LEDGER_MANIFEST\" --json","maps_to_ac":"AC-2"}]}
-->
