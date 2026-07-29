# REDHAT-FIX-H5 — Require exact concrete restore-bucket and prefix ARNs instead of wildcard credential scope (review H-5)

## What this does

Close red-hat H-5 by requiring exact concrete restore-bucket and object-prefix ARNs for restore-scoped credentials, rejecting wildcard resource ARNs that authorize a bucket class, and aligning D05-06 verify-restore-creds.sh and policy emission with that contract.

## Why

Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-H5). Grounded in UC-PLAT-06 / T-PLAT-022 / T-PLAT-025 / CAP-BAK-01. Review evidence: `.spec/reviews/red-hat-20260728T235155Z-sprint-28.md` (reviewed SHA `a9b5b6e7ff2b707fddf15084e2895221c62c68cb`).

## How to verify

- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts` → RED when holocron-backup-* accepted; GREEN after exact ARN enforcement
- `bash scripts/verify-restore-creds.sh` → Exit 0 only for exact bucket + exact prefix List/Get; exit != 0 for wildcards
- `rg -n 'arn:aws:s3:::holocron-backup-\*' .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-06*.md scripts/verify-restore-creds.sh || true` → No remaining expected/accepted wildcard bucket-class ARN as PASS criterion
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm tsgo --noEmit && pnpm biome check .` → Exit 0

## Scope

Writes: scripts/verify-restore-creds.sh (MODIFY|NEW exact ARN verification + wildcard rejection), services/platform/src/backup/config.ts (MODIFY only if restore-scoped policy emission helper is added or corrected — keep backup RW policy distinct), services/platform/src/backup/fresh-target.md (MODIFY credential scope docs), services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts (NEW), .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-06-security-review-fresh-restore-target-trust-boundary.md (MODIFY AC-2 Resource expectations), .tmp/REDHAT-FIX-H5/** (NEW evidence)

Prohibited: Accepting arn:aws:s3:::holocron-backup-* as a literal bucket name, Mocking IAM policy inspection, Broadening restore token to PutObject/DeleteObject, Any file not listed under write_allowed

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-H5 — Require exact concrete restore-bucket and prefix ARNs instead of wildcard credential scope (review H-5)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (90 min)
AGENT:      implementer=security-reviewer | reviewer=code-reviewer
PROPOSED-BY: security-reviewer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 28 — Point-in-Time Restore and Fresh-Hardware Fire Drill](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
verify-restore-creds.sh and restore policy emission require exact bucket ARN + exact List/Get prefix resources; wildcards rejected fail-closed; D05-06 AC no longer claims literal name while expecting holocron-backup-*; integration suite RED then GREEN; typecheck and lint clean.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST require concrete bucket ARN with exact literal bucket name (no *) e.g. arn:aws:s3:::holocron-backup-<exact> matching the configured restore bucket
- MUST require exact ListBucket resource on the bucket ARN and exact GetObject (and List if applicable) object-prefix resources such as arn:aws:s3:::holocron-backup-<exact>/<restore-prefix>* without authorizing unrelated buckets
- MUST reject wildcard resource ARNs (arn:aws:s3:::holocron-backup-*, arn:aws:s3:::*, Resource '*') fail-closed in scripts/verify-restore-creds.sh and any restore-cred policy emission/verification
- MUST align D05-06 AC-2 text and verify-restore-creds.sh so 'literal bucket name' is not contradicted by a wildcard pattern
- MUST keep restore token read-only: List/Get only — no PutObject/DeleteObject (coordinates with H4)
- NEVER accept arn:aws:s3:::holocron-backup-* as a 'literal bucket name'
- NEVER authorize a bucket class rather than the single restore bucket/prefix
- NEVER mock IAM policy inspection — require real policy documents or real emitted policy JSON
- NEVER claim wildcards rejected while AC expected value still contains *
- NEVER expand product scope beyond restore-credential verification/emission alignment for this finding
- STRICTLY PRIMARY AC is integration inspecting real policy documents via verify-restore-creds.sh / config emission
- STRICTLY tdd_mode red_first: RED when holocron-backup-* is accepted as pass; GREEN only with exact ARNs
- STRICTLY flow_ref T-PLAT-025 for trust-boundary review; T-PLAT-022 for restore path credential emission
- STRICTLY coordinates with REDHAT-FIX-H4 sacrificial negative control (read-only exact scope)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN restore credential policy WHEN verify-restore-creds runs THEN PASS only for arn:aws:s3:::${exactBucketName} with n
- [ ] AC-2: GIVEN restore policy WHEN object resources inspected THEN exact prefix ARNs and read-only actions only
- [ ] AC-3: GIVEN wildcard policies WHEN verified THEN exit != 0 with explicit rejection
- [ ] AC-4: GIVEN D05-06 AC text and emission WHEN updated THEN no holocron-backup-* acceptance; exact ARN form only
- [ ] AC-5: GIVEN H-5 suite WHEN wildcard accepted THEN RED; GREEN only with exact ARN enforcement on real policy JSON
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — Exact concrete bucket ARN required (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN restore credential policy WHEN verify-restore-creds runs THEN PASS only for arn:aws:s3:::${exactBucketName} with no * in bucket segment
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: r2-credential-inspect
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts -t 'AC-1'; bash scripts/verify-restore-creds.sh`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if holocron-backup-* accepted as PASS; stub Resource check
  START_REF: exact-restore-bucket-policy
  MUST_OBSERVE: exact bucket ARN PASS
  MUST_NOT_OBSERVE: wildcard bucket ARN PASS
  EVIDENCE: stdout (required_capture=True)

### AC-2 — Exact List/Get object-prefix resources (flow_ref T-PLAT-022)
  GIVEN/WHEN/THEN: GIVEN restore policy WHEN object resources inspected THEN exact prefix ARNs and read-only actions only
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: r2-credential-inspect
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts -t 'AC-2'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if object Resource is holocron-backup-*/*; Put/Delete allowed
  START_REF: exact-restore-bucket-policy
  MUST_OBSERVE: exact prefix GetObject resource; PutObject/DeleteObject count = 0
  MUST_NOT_OBSERVE: bucket-class object wildcard with PASS
  EVIDENCE: stdout (required_capture=True)

### AC-3 — Wildcard resource ARNs rejected (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN wildcard policies WHEN verified THEN exit != 0 with explicit rejection
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: r2-credential-inspect
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts -t 'AC-3'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if wildcard accepted
  START_REF: wildcard-policy-negative
  MUST_OBSERVE: exit != 0 for wildcards
  MUST_NOT_OBSERVE: PASS for holocron-backup-*
  EVIDENCE: stdout (required_capture=True)

### AC-4 — D05-06 and emission aligned to exact ARNs (flow_ref T-PLAT-022)
  GIVEN/WHEN/THEN: GIVEN D05-06 AC text and emission WHEN updated THEN no holocron-backup-* acceptance; exact ARN form only
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: policy-emission-and-docs
  VERIFY: `rg holocron-backup-\* must not be an accepted expected Resource; PLATFORM_IT=1 pnpm vitest run … -t 'AC-4'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if docs still expect wildcard as literal
  START_REF: wildcard-bucket-arn-false-pass-baseline
  MUST_OBSERVE: exact ARN expectations
  MUST_NOT_OBSERVE: contradictory literal+wildcard AC
  EVIDENCE: file_artifact (required_capture=True)

### AC-5 — Red-first suite enforces exact ARNs (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN H-5 suite WHEN wildcard accepted THEN RED; GREEN only with exact ARN enforcement on real policy JSON
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: r2-credential-inspect
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if suite greens on wildcard accept; mocked IAM
  START_REF: wildcard-bucket-arn-false-pass-baseline
  MUST_OBSERVE: RED then GREEN with exact ARN verification
  MUST_NOT_OBSERVE: false green on holocron-backup-*
  EVIDENCE: stdout (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | verify-restore-creds requires exact concrete bucket ARN | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-` |
| TC-2 | Object resources exact prefix List/Get only | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-` |
| TC-3 | Wildcard resource ARNs fail closed | AC-3 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-` |
| TC-4 | D05-06 AC and emission no longer accept holocron-backup-* as literal | AC-4 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-` |
| TC-5 | Suite fails when wildcard bucket class accepted | AC-5 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-` |
| TC-6 | Typecheck and lint clean | AC-1 | `pnpm tsgo --noEmit && pnpm biome check .` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- scripts/verify-restore-creds.sh (MODIFY|NEW exact ARN verification + wildcard rejection)
- services/platform/src/backup/config.ts (MODIFY only if restore-scoped policy emission helper is added or corrected — keep backup RW policy distinct)
- services/platform/src/backup/fresh-target.md (MODIFY credential scope docs)
- services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts (NEW)
- .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-06-security-review-fresh-restore-target-trust-boundary.md (MODIFY AC-2 Resource expectations)
- .tmp/REDHAT-FIX-H5/** (NEW evidence)
writeProhibited:
- Accepting arn:aws:s3:::holocron-backup-* as a literal bucket name
- Mocking IAM policy inspection
- Broadening restore token to PutObject/DeleteObject
- Any file not listed under write_allowed

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260728T235155Z-sprint-28.md:124-129 [H-5 source finding: single-bucket credential scope specified as wildcard]
2. .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-06-security-review-fresh-restore-target-trust-boundary.md:102-109 [D05-06 AC-2 expects arn:aws:s3:::holocron-backup-* while claiming literal and rejecting wildcards]
3. .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-03-provision-a-genuinely-fresh-restore-target-zero-access-to-the-original-mini.md:106-115 [Credential scoping context; coordinates with H4 sacrificial control]
4. services/platform/src/backup/config.ts:83-116 [buildBackupCredentialPolicy uses exact ${bucketName} — restore-scope emission must be equally exact and read-only]
5. .spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:63-72 [CAP-BAK-01]
6. RULES.md:all [Project rules]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED exact-ARN suite: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts` → RED when holocron-backup-* accepted; GREEN after exact ARN enforcement
- verify-restore-creds exact scope: `bash scripts/verify-restore-creds.sh` → Exit 0 only for exact bucket + exact prefix List/Get; exit != 0 for wildcards
- No accepted wildcard expected Resource in D05-06 AC: `rg -n 'arn:aws:s3:::holocron-backup-\*' .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-06*.md scripts/verify-restore-creds.sh || true` → No remaining expected/accepted wildcard bucket-class ARN as PASS criterion
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260728T235155Z-sprint-28.md H-5, D05-06 AC-2, services/platform/src/backup/config.ts buildBackupCredentialPolicy exact bucket pattern, REDHAT-FIX-H4 read-only sacrificial coordination
Interaction notes:
- Parse real policy JSON Resource arrays; reject any resource containing '*' in the bucket name segment or bare '*'
- Allow trailing object-key prefix wildcards only after an exact bucket name and exact configured prefix root (arn:aws:s3:::exact-bucket/exact-prefix*)
- Restore token action set: ListBucket/GetBucketLocation/GetObject (and List* only if required) — never Put/Delete
- If restore policy emission is missing, add a dedicated buildRestoreCredentialPolicy(bucketName, prefix) separate from RW backup policy
pattern: Exact concrete bucket ARN + exact List/Get object-prefix resources; fail-closed wildcard rejection in verify-restore-creds; red_first integration on real policy documents
pattern_source: red-hat H-5; config.ts exact ${bucketName} emission style; D05-06 credential AC redesign
anti_pattern: arn:aws:s3:::holocron-backup-* labeled literal; authorizing a bucket class; AC text that both requires and rejects wildcards; mocked IAM

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: security-reviewer — Remediates red-hat H-5 wildcard credential scope defect. Agent remains security-reviewer per stub; verify-restore-creds and restore policy emission may be implemented by security-reviewer or devops under this ownership.
Reviewer: code-reviewer (+ security-reviewer when task is security-scoped)

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D05-06
Blocks: wildcard-restore-credential-false-pass
Coordinates with: REDHAT-FIX-H4, D05-03, D05-02

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Review evidence (immutable): `.spec/reviews/red-hat-20260728T235155Z-sprint-28.md` @ SHA `a9b5b6e7ff2b707fddf15084e2895221c62c68cb`.
- Do not claim gate pass; do not implement outside write_allowed.
- Preserve Sprint 28 CAP-BAK-01 restore-half scope.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H5",
  "proposed_by": "security-reviewer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "wildcard-bucket-arn-false-pass-baseline": {
      "description": "RED baseline matching H-5: D05-06 AC expects arn:aws:s3:::holocron-backup-* while claiming literal bucket name and also saying wildcards must be rejected",
      "seed_method": "recorded_external",
      "records": [
        "Review H-5 at .spec/reviews/red-hat-20260728T235155Z-sprint-28.md:124-129",
        "D05-06.md:102-109 Resource = 'arn:aws:s3:::holocron-backup-*' labeled literal",
        "Pattern authorizes a bucket class not one restore bucket/prefix",
        "Reviewed SHA a9b5b6e7ff2b707fddf15084e2895221c62c68cb"
      ]
    },
    "exact-restore-bucket-policy": {
      "description": "Real restore credential policy document scoped to one concrete bucket and exact object prefix",
      "seed_method": "public_api",
      "records": [
        "bucketName = concrete configured restore bucket (no * characters)",
        "Resource bucket: arn:aws:s3:::${bucketName}",
        "Resource objects: arn:aws:s3:::${bucketName}/${restorePrefix}* where restorePrefix is exact configured prefix (e.g. backup/ or drill-allowed list/get prefix)",
        "Actions: s3:ListBucket, s3:GetBucketLocation, s3:GetObject, s3:ListBucket (as needed) \u2014 no PutObject/DeleteObject",
        "Policy JSON inspectable by verify-restore-creds.sh without mocks"
      ]
    },
    "wildcard-policy-negative": {
      "description": "Policy documents that must fail verification",
      "seed_method": "public_api",
      "records": [
        "Resource arn:aws:s3:::holocron-backup-*",
        "Resource arn:aws:s3:::*",
        "Resource '*'",
        "Object resource arn:aws:s3:::holocron-backup-*/*",
        "Any Action set including s3:PutObject or s3:DeleteObject for restore token"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN restore credential policy WHEN verify-restore-creds runs THEN PASS only for arn:aws:s3:::${exactBucketName} with no * in bucket segment",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts -t 'AC-1'; bash scripts/verify-restore-creds.sh",
      "maps_to_ac": null,
      "primary": true,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "r2-credential-inspect",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "holocron-backup-* accepted as PASS",
            "stub Resource check"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "exact-restore-bucket-policy",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "verify exact bucket ARN"
              ]
            },
            "end_state": {
              "must_observe": [
                "exact bucket ARN PASS"
              ],
              "must_not_observe": [
                "wildcard bucket ARN PASS"
              ]
            }
          }
        ],
        "topology": "single-node"
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN restore policy WHEN object resources inspected THEN exact prefix ARNs and read-only actions only",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-022",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "r2-credential-inspect",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "object Resource is holocron-backup-*/*",
            "Put/Delete allowed"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "exact-restore-bucket-policy",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "inspect object ARNs and actions"
              ]
            },
            "end_state": {
              "must_observe": [
                "exact prefix GetObject resource",
                "PutObject/DeleteObject count = 0"
              ],
              "must_not_observe": [
                "bucket-class object wildcard with PASS"
              ]
            }
          }
        ],
        "topology": "single-node"
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN wildcard policies WHEN verified THEN exit != 0 with explicit rejection",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "r2-credential-inspect",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "wildcard accepted"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "wildcard-policy-negative",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "verify wildcard policies fail"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit != 0 for wildcards"
              ],
              "must_not_observe": [
                "PASS for holocron-backup-*"
              ]
            }
          }
        ],
        "topology": "single-node"
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN D05-06 AC text and emission WHEN updated THEN no holocron-backup-* acceptance; exact ARN form only",
      "verify": "rg holocron-backup-\\* must not be an accepted expected Resource; PLATFORM_IT=1 pnpm vitest run \u2026 -t 'AC-4'",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-022",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "policy-emission-and-docs",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "docs still expect wildcard as literal"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "wildcard-bucket-arn-false-pass-baseline",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "align docs and emission"
              ]
            },
            "end_state": {
              "must_observe": [
                "exact ARN expectations"
              ],
              "must_not_observe": [
                "contradictory literal+wildcard AC"
              ]
            }
          }
        ],
        "topology": "single-node"
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN H-5 suite WHEN wildcard accepted THEN RED; GREEN only with exact ARN enforcement on real policy JSON",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "r2-credential-inspect",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "suite greens on wildcard accept",
            "mocked IAM"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "wildcard-bucket-arn-false-pass-baseline",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "run suite"
              ]
            },
            "end_state": {
              "must_observe": [
                "RED then GREEN with exact ARN verification"
              ],
              "must_not_observe": [
                "false green on holocron-backup-*"
              ]
            }
          }
        ],
        "topology": "single-node"
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "verify-restore-creds requires exact concrete bucket ARN",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts -t 'AC-1'; bash scripts/verify-restore-creds.sh",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Object resources exact prefix List/Get only",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Wildcard resource ARNs fail closed",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "D05-06 AC and emission no longer accept holocron-backup-* as literal",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Suite fails when wildcard bucket class accepted",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h5-exact-restore-arns.test.ts",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Typecheck and lint clean",
      "verify": "pnpm tsgo --noEmit && pnpm biome check .",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->

</details>
