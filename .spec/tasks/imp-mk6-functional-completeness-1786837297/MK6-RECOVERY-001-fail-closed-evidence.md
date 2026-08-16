# MK6-RECOVERY-001: Make restore evidence retained-byte and application-complete

> Status: Backlog
> Assignee: devops-engineer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: bugfix
> Wave: 13
> Proposed by: mastra-planner
> Files: scripts/run-s32-d08-03-deletion-gate.sh, scripts/assert-s32-d08-03-deletion-gate.sh, scripts/run-s32-d08-03-resume-ac2.sh, scripts/verify-restore-isolation.sh, scripts/verify-restored-artifacts.sh, scripts/provision-fresh-restore-target.sh, scripts/verify-mk6-recovery-evidence.sh, services/platform/src/backup/fire-drill.ts, services/platform/src/backup/evidence-ledger-verify.ts, services/platform/src/backup/parity-report.ts, services/platform/tests/integration/sprint32-d08-03-deletion-gate.test.ts, tests/integration/s32-convex-decommission-oracle.test.ts, .gate-evidence/mk6-recovery
> Depends on: MK6-DATA-002, MK6-MCP-002, MK6-CLIENT-003, MK6-NATIVE-001

## Outcome

A fresh isolated real restore proves database/blob parity plus non-empty HTTP/MCP/Zero/native behavior, with retained bytes and redacted authority/candidate/timestamp receipts that fail on deletion or mutation.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --fresh-target --release "$MK6_CANDIDATE_ID" --json` restores with the distinct tuple and proves DB identity, row/FK/PONR/ledger parity, and blob SHA parity from retained canonical bytes.
- [ ] AC-2: `PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --application-smoke --release "$MK6_CANDIDATE_ID" --json` — Against that restored target, external HTTP sentinel, authenticated MCP get/list, a real Zero client, and the named native build all return the same non-empty sentinel/hash and one durable application mutation.
- [ ] AC-3: `PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --negative-control receipt-matrix --json` enumerates and rejects exactly nine cases: missing bytes, byte mutation, symlink, path escape, stale receipt, wrong authority, wrong candidate, wrong timestamp, and digest-only text. Each emits its named class while unaffected receipts remain valid.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | New restore proves non-empty database and blob parity from retained bytes. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --fresh-target --release "$MK6_CANDIDATE_ID" --json` |
| TC-2 | HTTP, MCP, Zero and native app match one restored sentinel and mutation. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --application-smoke --release "$MK6_CANDIDATE_ID" --json` |
| TC-3 | Missing retained bytes trigger `RECEIPT_MISSING`. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --negative-control missing-evidence --json` |
| TC-4 | One-byte mutation triggers `RECEIPT_DIGEST_MISMATCH`. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --negative-control byte-mutation --json` |
| TC-5 | The nine-case retained-evidence matrix rejects every authority, freshness, path, and byte-integrity variant. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --negative-control receipt-matrix --json` |

Receipt schema is allowlisted: `authorityFingerprint`, `candidateSha`, `imageDigest`, `composeGeneration`, `hostHash`, `databaseHash`, `capturedAt`, `expiresAt`, `manifestDigest`, per-target relative path/digest/size, and application-smoke counts/hashes. Raw credential/account values, headers, bodies, argv, environment, and absolute secret paths are prohibited. Historical PRD evidence is read-only and cannot pass. `MANUAL-ONLY RECOVERY-M1`: real R2 access, distinct restore tuple, and named native simulator.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "MK6-RECOVERY-001",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fresh_restore": {
      "seed_method": "cli",
      "description": "new isolated restore from real R2 with canonical bytes",
      "records": [
        "sentinelRows: 3",
        "blobCount: 1"
      ]
    },
    "restored_app": {
      "seed_method": "public_api",
      "description": "restored HTTP, MCP, Zero and native clients",
      "records": [
        "expectedAppSurfaceCount: 4"
      ]
    },
    "receipt_controls": {
      "seed_method": "cli",
      "description": "successful retained receipt set copied to disposable control roots",
      "records": [
        "controlCaseCount: 2"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a new real isolated restore WHEN retained bytes are rehashed THEN database and blob parity are non-empty and candidate-bound",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --fresh-target --release \"$MK6_CANDIDATE_ID\" --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "recovery-db-blob",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "postgres-r2-filesystem",
        "negative_control": {
          "would_fail_if": [
            "one retained file is deleted or hashes are hardcoded"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh_restore",
            "action": {
              "steps": [
                "restore from real R2 and rehash canonical retained bytes"
              ]
            },
            "end_state": {
              "must_observe": [
                "sentinelRows: 3",
                "blobParityCount: 1",
                "digestMismatchCount: 0"
              ],
              "must_not_observe": [
                "sentinelRows: 0",
                "empty manifest digest"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN the restored target WHEN four application surfaces read and mutate THEN all match one non-empty sentinel and durable result",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --application-smoke --release \"$MK6_CANDIDATE_ID\" --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "recovery-app-smoke",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "http-mcp-zero-ios-postgres",
        "negative_control": {
          "would_fail_if": [
            "one application surface is disconnected or mutation persistence is removed"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "restored_app",
            "action": {
              "steps": [
                "read sentinel through HTTP, MCP, Zero and native UI and submit one mutation"
              ]
            },
            "end_state": {
              "must_observe": [
                "matchingAppSurfaceCount: 4",
                "durableMutationCount: 1"
              ],
              "must_not_observe": [
                "matchingAppSurfaceCount: 0",
                "empty sentinel hash"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN successful retained receipts WHEN one is deleted or byte-mutated THEN distinct named failures preserve all other validity",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --negative-control receipt-matrix --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "recovery-receipt-controls",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "filesystem-receipt-verifier",
        "negative_control": {
          "would_fail_if": [
            "deleted or mutated retained bytes are accepted"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "receipt_controls",
            "action": {
              "steps": [
                "enumerate missing bytes, byte mutation, symlink, path escape, stale receipt, wrong authority, wrong candidate, wrong timestamp, and digest-only text"
              ]
            },
            "end_state": {
              "must_observe": [
                "enumeratedVariantCount: 9",
                "namedControlFailureCount: 9",
                "otherReceiptValidityCount > 0"
              ],
              "must_not_observe": [
                "namedControlFailureCount: 0",
                "empty expected digest"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Fresh restore proves database and blob parity",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --fresh-target --release \"$MK6_CANDIDATE_ID\" --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Restored application surfaces match",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --application-smoke --release \"$MK6_CANDIDATE_ID\" --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Missing receipt fails",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --negative-control missing-evidence --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Byte mutation fails",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --negative-control byte-mutation --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Nine retained-evidence variants fail named",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --negative-control receipt-matrix --json",
      "maps_to_ac": "AC-3"
    }
  ]
}
-->
