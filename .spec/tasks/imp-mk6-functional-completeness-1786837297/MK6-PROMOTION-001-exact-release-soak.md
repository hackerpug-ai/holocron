# MK6-PROMOTION-001: Land, push, and install the exact ledger-approved release

> Status: Backlog
> Assignee: integrator
> Reviewer: integration-validator
> Priority: P0
> Type: manual verification
> Wave: 16
> Proposed by: mastra-planner
> Files: .gate-evidence/mk6-promotion/**
> Depends on: imp-mk6-functional-completeness-1786837297-mk6-functional-completeness

## Outcome

Reviewed commits are on remote trunk, the ledger-approved immutable image digest is installed without rebuild, and installed runtime identity exactly matches the 105/105 manifest.

## Acceptance Criteria

- [ ] AC-1: `MANUAL-ONLY PROMOTE-M1`: the integrator proves each reviewed task commit is an ancestor of local and remote `main`, pushes the exact trunk SHA through normal protection, and records remote ancestry without force or bypass.
- [ ] AC-2: `MANUAL-ONLY PROMOTE-M2`: `bash scripts/run-mk6-promotion.sh --promote-ledger-manifest "$MK6_LEDGER_MANIFEST" --json` installs only the manifest's existing image digest; installed `build-info --json`, SHA, digest, generation, host, and deployment timestamp match exactly.
- [ ] AC-3: A planted identity drift or install failure runs automatic rollback and proves authority/current-generation identity is unchanged or restored before any completion claim.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Every reviewed commit is on local and remote trunk at one exact SHA. | AC-1 | `MANUAL-ONLY: integrator records git merge-base --is-ancestor for every task commit and git ls-remote origin refs/heads/main in .gate-evidence/mk6-promotion/ancestry.json` |
| TC-2 | Installed runtime matches the approved immutable digest without rebuild. | AC-2 | `bash scripts/run-mk6-promotion.sh --verify-installed --promote-ledger-manifest "$MK6_LEDGER_MANIFEST" --json` |
| TC-3 | Identity drift triggers rollback with authority unchanged. | AC-3 | `PLATFORM_IT=1 MK6_PROMOTION_NEGATIVE=identity-drift bash scripts/run-mk6-promotion.sh --verify-rollback-authority --promote-ledger-manifest "$MK6_LEDGER_MANIFEST" --json` |

No worker/subagent merges or pushes. No rebuild between candidate verification and install. Missing trunk/push/install authority blocks the task.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"MK6-PROMOTION-001","tdd_mode":"shared","verification_policy":{"requires_tests":true,"requires_red_evidence":false,"requires_seeded_evidence":true},"fixtures":{"reviewed_commits":{"seed_method":"recorded_external","description":"reviewed task commits and protected remote trunk","records":["expectedMissingAncestryCount: 0"]},"approved_manifest":{"seed_method":"recorded_external","description":"105-of-105 ledger manifest with immutable image digest","records":["criterionEvaluations: 105","orderedReceiptCount: 10"]},"drift_case":{"seed_method":"cli","description":"disposable promotion preflight with mismatched candidate identity","records":["expectedAuthorityChangeCount: 0"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN reviewed commits WHEN the integrator lands and pushes THEN every commit is ancestor of one local and remote trunk SHA","verify":"MANUAL-ONLY: git merge-base --is-ancestor TASK_SHA main; git ls-remote origin refs/heads/main; retain .gate-evidence/mk6-promotion/ancestry.json","maps_to_ac":null,"scenario":{"id":"promotion-ancestry","test_tier":"e2e","tier":"visible","verification_service":"git-remote-trunk","negative_control":{"would_fail_if":["one reviewed commit is removed from trunk or remote push is absent"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"reviewed_commits","action":{"steps":["verify ancestry for every task commit and query protected remote main"]},"end_state":{"must_observe":["missingAncestryCount: 0","distinctTrunkShaCount: 1"],"must_not_observe":["distinctTrunkShaCount: 0","empty remote SHA"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"GIVEN an approved manifest WHEN its digest is installed THEN installed identity matches all release fields without rebuild","verify":"bash scripts/run-mk6-promotion.sh --verify-installed --promote-ledger-manifest \"$MK6_LEDGER_MANIFEST\" --json","maps_to_ac":null,"scenario":{"id":"promotion-installed-identity","test_tier":"e2e","tier":"visible","verification_service":"installed-production-release","negative_control":{"would_fail_if":["the image is rebuilt or installed identity is hardcoded"]},"evidence":{"artifact_type":"api_response","required_capture":true},"cases":[{"start_ref":"approved_manifest","action":{"steps":["install the approved digest and query installed build-info and health identity"]},"end_state":{"must_observe":["criterionEvaluations: 105","identityMismatchCount: 0"],"must_not_observe":["criterionEvaluations: 0","empty installed digest"]}}]}},{"id":"AC-3","type":"acceptance_criterion","description":"GIVEN an identity drift WHEN promotion preflight fails THEN rollback preserves or restores authority before completion","verify":"PLATFORM_IT=1 MK6_PROMOTION_NEGATIVE=identity-drift bash scripts/run-mk6-promotion.sh --verify-rollback-authority --promote-ledger-manifest \"$MK6_LEDGER_MANIFEST\" --json","maps_to_ac":null,"scenario":{"id":"promotion-rollback","test_tier":"integration","tier":"visible","verification_service":"promotion-rollback","negative_control":{"would_fail_if":["rollback is removed or authority changes on failed preflight"]},"evidence":{"artifact_type":"event_log","required_capture":true},"cases":[{"start_ref":"drift_case","action":{"steps":["run disposable identity-drift preflight and rollback verification"]},"end_state":{"must_observe":["rollbackPassCount: 1","authorityChangeCount: 0"],"must_not_observe":["rollbackPassCount: 0","empty authority identity"]}}]}},{"id":"TC-1","type":"test_criterion","description":"All commits are on remote trunk","verify":"MANUAL-ONLY: git merge-base --is-ancestor TASK_SHA main; git ls-remote origin refs/heads/main; retain .gate-evidence/mk6-promotion/ancestry.json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"Installed digest matches manifest","verify":"bash scripts/run-mk6-promotion.sh --verify-installed --promote-ledger-manifest \"$MK6_LEDGER_MANIFEST\" --json","maps_to_ac":"AC-2"},{"id":"TC-3","type":"test_criterion","description":"Identity drift rolls back without authority change","verify":"PLATFORM_IT=1 MK6_PROMOTION_NEGATIVE=identity-drift bash scripts/run-mk6-promotion.sh --verify-rollback-authority --promote-ledger-manifest \"$MK6_LEDGER_MANIFEST\" --json","maps_to_ac":"AC-3"}]}
-->
