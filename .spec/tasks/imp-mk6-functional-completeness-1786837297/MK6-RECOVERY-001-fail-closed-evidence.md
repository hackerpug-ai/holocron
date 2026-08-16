# MK6-RECOVERY-001: Make restore evidence retained-byte and fail-closed

> Status: Backlog
> Assignee: devops-engineer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: bugfix
> Wave: 3
> Proposed by: mastra-planner
> Files: scripts/run-s32-d08-03-deletion-gate.sh, scripts/assert-s32-d08-03-deletion-gate.sh, scripts/run-s32-d08-03-resume-ac2.sh, scripts/verify-restore-isolation.sh, scripts/verify-restored-artifacts.sh, scripts/provision-fresh-restore-target.sh, scripts/verify-mk6-recovery-evidence.sh, services/platform/src/backup/fire-drill.ts, services/platform/src/backup/evidence-ledger-verify.ts, services/platform/src/backup/parity-report.ts, services/platform/tests/integration/sprint32-d08-03-deletion-gate.test.ts, tests/integration/s32-convex-decommission-oracle.test.ts
> Depends on: MK6-BACKUP-001

## Outcome

A fresh isolated real restore retains immutable bytes, rehashes every canonical target, proves row/FK/PONR/ledger/blob parity, and rejects missing, mutated, stale, escaped, or wrong-identity evidence.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --fresh-target --json` restores with the distinct restore tuple and proves database identity, row/FK/PONR/ledger parity, and blob SHA parity from retained bytes under the canonical root.
- [ ] AC-2: Deleting exactly one retained receipt returns `RECEIPT_MISSING`; restoring then byte-mutating it returns `RECEIPT_DIGEST_MISMATCH`, while all other receipts remain valid. Symlink/path escape, stale host/DB/release, and digest text without bytes also fail.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | A new isolated restore proves non-empty database and blob parity. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --fresh-target --json` |
| TC-2 | Missing retained bytes trigger the named AC-3 control. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --negative-control missing-evidence --json` |
| TC-3 | One-byte mutation triggers digest mismatch without invalidating the other receipts. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --negative-control byte-mutation --json` |

The current D08-03 artifact is expected to fail and must not be edited into a pass. `MANUAL-ONLY RECOVERY-M1`: real R2 access and the distinct restore credential tuple are operator prerequisites.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"MK6-RECOVERY-001","tdd_mode":"red_first","verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},"fixtures":{"fresh_restore":{"seed_method":"cli","description":"new isolated restore from real R2 with retained canonical bytes","records":["sentinelRows: 3","blobCount > 0"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN a new real isolated restore WHEN canonical bytes are rehashed THEN database and blob parity are non-empty and release-bound","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --fresh-target --json","maps_to_ac":null,"scenario":{"test_tier":"integration","tier":"visible","verification_service":"postgres-r2-filesystem","negative_control":{"would_fail_if":["one retained evidence file is deleted or hashes are hardcoded"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"fresh_restore","action":{"steps":["restore from real R2 and rehash every canonical retained target"]},"end_state":{"must_observe":["sentinelRows: 3","digestMismatchCount: 0"],"must_not_observe":["sentinelRows: 0","empty retained evidence"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"Missing and mutated retained bytes produce distinct named failures","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --negative-control missing-evidence --json","maps_to_ac":null},{"id":"TC-1","type":"test_criterion","description":"The fresh restore proves non-empty parity","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --fresh-target --json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"Missing retained bytes are rejected","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --negative-control missing-evidence --json","maps_to_ac":"AC-2"},{"id":"TC-3","type":"test_criterion","description":"One-byte mutation is rejected","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --negative-control byte-mutation --json","maps_to_ac":"AC-2"}]}
-->
