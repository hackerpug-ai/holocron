# REDHAT-FIX-H4 — Replace the destructive credential negative control with a sacrificial non-production object/policy proof (review H-4)

## What this does

Close red-hat H-4 by redesigning the restore-credential delete negative control so it cannot delete live recovery data if the target accidentally holds a write-capable token, using only sacrificial drill-neg objects or non-mutating policy simulation.

## Why

Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-H4). Grounded in UC-PLAT-06 / T-PLAT-022 / T-PLAT-025 / CAP-BAK-01. Review evidence: `.spec/reviews/red-hat-20260728T235155Z-sprint-28.md` (reviewed SHA `a9b5b6e7ff2b707fddf15084e2895221c62c68cb`).

## How to verify

- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h4-sacrificial-credential-negative.test.ts` → RED on live-key destructive control; GREEN after sacrificial/policy redesign
- `bash scripts/verify-restore-creds.sh` → Exit 0; delete denied on sacrificial key or policy shows no DeleteObject; never targets live recovery keys
- `rg -n 's3 rm \$R2_BUCKET/existing|aws s3 rm .*existing' .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-03*.md scripts/prove-isolation.sh scripts/verify-restore-creds.sh; test $? -eq 1` → Exit 1 from rg (no matches)
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm tsgo --noEmit && pnpm biome check .` → Exit 0

## Scope

Writes: scripts/prove-isolation.sh (MODIFY credential negative control only), scripts/verify-restore-creds.sh (MODIFY|NEW sacrificial/policy negative control), scripts/provision-fresh-restore-target.sh (MODIFY only if RO cred bootstrap needs drill-neg wiring), services/platform/src/backup/fresh-target.md (MODIFY credential negative control docs), services/platform/tests/integration/redhat-fix-h4-sacrificial-credential-negative.test.ts (NEW), .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-03-provision-a-genuinely-fresh-restore-target-zero-access-to-the-original-mini.md (MODIFY AC-2 negative control redesign), .tmp/REDHAT-FIX-H4/** (NEW evidence)

Prohibited: Destructive tests against live recovery keys (backup/, pgBackRest, restic, existing recovery objects), Mocking IAM or fabricating AccessDenied without real policy/API evidence, Changing source backup RW policy semantics except documentation that restore tokens must not use that policy, Any file not listed under write_allowed

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-H4 — Replace the destructive credential negative control with a sacrificial non-production object/policy proof (review H-4)
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
  test:      PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h4-sacrificial-credential-negative.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
D05-03 AC-2 / prove-isolation credential path and verify-restore-creds negative control use uniquely generated drill-neg objects or non-mutating policy inspection; live recovery prefixes are denylisted; AccessDenied proven without destroying recovery data; integration suite RED then GREEN; typecheck and lint clean.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST replace D05-03 AC-2 destructive control `aws s3 rm $R2_BUCKET/existing` with a uniquely generated sacrificial drill object under a protected test prefix (e.g. drill-neg/<uuid>) OR a non-mutating policy simulation/API inspection that proves DeleteObject is denied
- MUST prove delete denial only against the sacrificial key: create sacrificial object with a write-capable bootstrap/admin token if needed, then attempt delete with restore-scoped token and observe AccessDenied while sacrificial key remains
- MUST guard scripts and tests so they refuse to run destructive operations against live recovery prefixes (backup/, pgBackRest stanza paths, restic snapshots, or any configured recovery object prefix)
- MUST keep restore credential negative control fail-closed if put/delete unexpectedly succeed on sacrificial key
- MUST coordinate with REDHAT-FIX-H5 so resource ARNs for restore token remain exact and read-only
- NEVER target a plausible live recovery key (backup/, pgBackRest stanza paths, restic snapshot paths, $R2_BUCKET/existing recovery object) in destructive negative tests
- NEVER use the source RW backup token as the restore-target credential under test for the negative control without isolation from live recovery keys
- NEVER mock IAM or fabricate AccessDenied without a real policy document or real S3/R2 API response for the sacrificial key
- NEVER leave D05-03 AC-2 wording that instructs operators to `aws s3 rm $R2_BUCKET/existing`
- NEVER expand product restore runtime beyond credential-negative-control scripts/docs/tests for this finding
- STRICTLY PRIMARY AC is integration against real R2/S3 API or real policy document inspection — no mocked IAM
- STRICTLY tdd_mode red_first: RED if negative control still points at live recovery keys; GREEN only with sacrificial/non-mutating proof
- STRICTLY H4 MUST_NOT use live recovery object keys in destructive tests
- STRICTLY flow_ref T-PLAT-025 for fresh-target creds; T-PLAT-022 where restore path credential emission is touched

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN restore-scoped token WHEN delete negative control runs THEN only drill-neg/<uuid> sacrificial key is targeted; Acc
- [ ] AC-2: GIVEN denylisted recovery keys WHEN negative control invoked against them THEN refuse before any delete API call
- [ ] AC-3: GIVEN inspectable restore policy WHEN non-mutating path used THEN DeleteObject/PutObject absent or denied without deleti
- [ ] AC-4: GIVEN D05-03 and scripts WHEN updated THEN no aws s3 rm $R2_BUCKET/existing remains; sacrificial/policy path documented
- [ ] AC-5: GIVEN H-4 suite WHEN pre-fix destructive control present THEN RED; GREEN only after sacrificial redesign
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — Sacrificial drill-neg delete negative control (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN restore-scoped token WHEN delete negative control runs THEN only drill-neg/<uuid> sacrificial key is targeted; AccessDenied observed; object remains; never $R2_BUCKET/existing
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: r2-credential-negative-control
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h4-sacrificial-credential-negative.test.ts -t 'AC-1'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if aws s3 rm $R2_BUCKET/existing still used; live recovery key targeted; AccessDenied faked
  START_REF: sacrificial-drill-neg-object
  MUST_OBSERVE: AccessDenied on drill-neg key; object remains
  MUST_NOT_OBSERVE: rm of existing recovery key
  EVIDENCE: stdout (required_capture=True)

### AC-2 — Live recovery prefix denylist enforced (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN denylisted recovery keys WHEN negative control invoked against them THEN refuse before any delete API call
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: r2-credential-negative-control
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h4-sacrificial-credential-negative.test.ts -t 'AC-2'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if denylist not enforced
  START_REF: live-recovery-prefix-denylist
  MUST_OBSERVE: safety error before delete
  MUST_NOT_OBSERVE: delete API against backup/ or restic paths
  EVIDENCE: stdout (required_capture=True)

### AC-3 — Non-mutating policy simulation alternative (flow_ref T-PLAT-022)
  GIVEN/WHEN/THEN: GIVEN inspectable restore policy WHEN non-mutating path used THEN DeleteObject/PutObject absent or denied without deleting objects
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: r2-policy-inspect
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h4-sacrificial-credential-negative.test.ts -t 'AC-3'; bash scripts/verify-restore-creds.sh`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub policy check; mocked IAM
  START_REF: restore-scoped-read-only-token
  MUST_OBSERVE: DeleteObject count = 0 for restore token
  MUST_NOT_OBSERVE: DeleteObject allowed with PASS
  EVIDENCE: stdout (required_capture=True)

### AC-4 — Docs/scripts remove destructive existing-key control (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN D05-03 and scripts WHEN updated THEN no aws s3 rm $R2_BUCKET/existing remains; sacrificial/policy path documented
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: documentation-and-script-guard
  VERIFY: `rg -n 's3 rm \$R2_BUCKET/existing' D05-03 and scripts must be empty; PLATFORM_IT=1 pnpm vitest run … -t 'AC-4'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if existing-key rm still documented
  START_REF: destructive-existing-key-negative-baseline
  MUST_OBSERVE: 0 existing-key destructive instructions
  MUST_NOT_OBSERVE: aws s3 rm $R2_BUCKET/existing
  EVIDENCE: file_artifact (required_capture=True)

### AC-5 — Red-first suite enforces sacrificial control (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN H-4 suite WHEN pre-fix destructive control present THEN RED; GREEN only after sacrificial redesign
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: r2-credential-negative-control
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h4-sacrificial-credential-negative.test.ts`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if suite greens on live-key rm
  START_REF: destructive-existing-key-negative-baseline
  MUST_OBSERVE: RED then GREEN with sacrificial proof
  MUST_NOT_OBSERVE: false green with live recovery key target
  EVIDENCE: stdout (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Delete negative control uses drill-neg sacrificial key and proves AccessDenied without destroying it | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h4-` |
| TC-2 | Live recovery prefixes refused before any delete API call | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h4-` |
| TC-3 | Non-mutating policy inspection proves no DeleteObject for restore token | AC-3 | `bash scripts/verify-restore-creds.sh; PLATFORM_IT=1 pnpm vitest run services/pla` |
| TC-4 | No remaining aws s3 rm $R2_BUCKET/existing in D05-03/scripts | AC-4 | `rg -n 's3 rm \$R2_BUCKET/existing' .spec/prds/mk6-migration/tasks/sprint-28-poin` |
| TC-5 | Suite fails closed on live-key destructive control | AC-5 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h4-` |
| TC-6 | Typecheck and lint clean | AC-1 | `pnpm tsgo --noEmit && pnpm biome check .` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- scripts/prove-isolation.sh (MODIFY credential negative control only)
- scripts/verify-restore-creds.sh (MODIFY|NEW sacrificial/policy negative control)
- scripts/provision-fresh-restore-target.sh (MODIFY only if RO cred bootstrap needs drill-neg wiring)
- services/platform/src/backup/fresh-target.md (MODIFY credential negative control docs)
- services/platform/tests/integration/redhat-fix-h4-sacrificial-credential-negative.test.ts (NEW)
- .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-03-provision-a-genuinely-fresh-restore-target-zero-access-to-the-original-mini.md (MODIFY AC-2 negative control redesign)
- .tmp/REDHAT-FIX-H4/** (NEW evidence)
writeProhibited:
- Destructive tests against live recovery keys (backup/, pgBackRest, restic, existing recovery objects)
- Mocking IAM or fabricating AccessDenied without real policy/API evidence
- Changing source backup RW policy semantics except documentation that restore tokens must not use that policy
- Any file not listed under write_allowed

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260728T235155Z-sprint-28.md:117-122 [H-4 source finding: planned read-only credential negative test can delete recovery data]
2. .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-03-provision-a-genuinely-fresh-restore-target-zero-access-to-the-original-mini.md:106-115 [D05-03 AC-2 destructive aws s3 rm $R2_BUCKET/existing]
3. .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-06-security-review-fresh-restore-target-trust-boundary.md:102-109 [D05-06 credential scope AC to coordinate with H5]
4. services/platform/src/backup/config.ts:83-116 [buildBackupCredentialPolicy allows PutObject/DeleteObject on bucket object ARN (RW backup policy)]
5. .spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:63-72 [CAP-BAK-01]
6. RULES.md:all [Project rules; no destructive gate theatre]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED sacrificial credential suite: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h4-sacrificial-credential-negative.test.ts` → RED on live-key destructive control; GREEN after sacrificial/policy redesign
- verify-restore-creds sacrificial/policy path: `bash scripts/verify-restore-creds.sh` → Exit 0; delete denied on sacrificial key or policy shows no DeleteObject; never targets live recovery keys
- No existing-key destructive instruction remains: `rg -n 's3 rm \$R2_BUCKET/existing|aws s3 rm .*existing' .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-03*.md scripts/prove-isolation.sh scripts/verify-restore-creds.sh; test $? -eq 1` → Exit 1 from rg (no matches)
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260728T235155Z-sprint-28.md H-4, D05-03 AC-2, services/platform/src/backup/config.ts:105-108, REDHAT-FIX-H5 exact ARN coordination
Interaction notes:
- Preferred path: put sacrificial object with admin/bootstrap token under drill-neg/<uuid>; attempt delete with restore token; assert AccessDenied + object remains; cleanup with admin token
- Alternate path: non-mutating policy document inspection proving DeleteObject absent for restore token
- Denylist must hard-stop backup/, archive/, restic, and 'existing' recovery keys before any API call
- Coordinate with H5 so restore token resources are exact prefix ARNs and read-only
pattern: Sacrificial non-production object under drill-neg/ OR non-mutating policy simulation for delete-denied proof; hard denylist of live recovery keys
pattern_source: red-hat H-4; D05-03 credential AC redesign
anti_pattern: aws s3 rm $R2_BUCKET/existing; deleting plausible recovery objects to prove RO; mocked AccessDenied; using source RW token against live chain as negative control

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: security-reviewer — Remediates red-hat H-4 destructive credential negative control. Agent remains security-reviewer per stub; script changes may be implemented by security-reviewer or devops under this ownership.
Reviewer: code-reviewer (+ security-reviewer when task is security-scoped)

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D05-03
Blocks: unsafe-credential-negative-control
Coordinates with: REDHAT-FIX-H5, D05-06

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
  "task_id": "REDHAT-FIX-H4",
  "proposed_by": "security-reviewer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "destructive-existing-key-negative-baseline": {
      "description": "RED baseline matching H-4: D05-03 AC-2 asks operator to run aws s3 rm $R2_BUCKET/existing; source backup policy permits PutObject and DeleteObject over bucket object ARN",
      "seed_method": "recorded_external",
      "records": [
        "Review H-4 at .spec/reviews/red-hat-20260728T235155Z-sprint-28.md:117-122",
        "D05-03.md:106-115 destructive rm of existing key",
        "services/platform/src/backup/config.ts:105-108 allows s3:PutObject and s3:DeleteObject on arn:aws:s3:::${bucketName}/* for backup RW policy",
        "If restore target receives source RW token, live recovery object can be deleted"
      ]
    },
    "sacrificial-drill-neg-object": {
      "description": "Uniquely generated non-production object under drill-neg/ prefix for delete-denial proof only",
      "seed_method": "public_api",
      "records": [
        "key = drill-neg/<uuid>-redhat-fix-h4.txt with unique content marker SACRIFICIAL_DRILL_NEG_H4",
        "Created only under protected test prefix drill-neg/",
        "Not under backup/, pgBackRest stanza, or restic snapshot prefixes",
        "Cleanup after suite using bootstrap/admin token only if object still present"
      ]
    },
    "restore-scoped-read-only-token": {
      "description": "Restore-target R2 credential expected to List/Get only",
      "seed_method": "recorded_external",
      "records": [
        "R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY for restore scope",
        "Distinct from app/source backup RW credentials",
        "Expected DeleteObject AccessDenied on sacrificial key"
      ]
    },
    "live-recovery-prefix-denylist": {
      "description": "Prefixes that destructive negative controls must refuse to touch",
      "seed_method": "public_api",
      "records": [
        "backup/",
        "pgBackRest stanza paths (e.g. backup/<stanza>/, archive/<stanza>/)",
        "restic snapshot/index/data paths",
        "any configured HOLO_BACKUP_PREFIX / recovery object roots",
        "literal key 'existing' under bucket root as used in D05-03 AC-2"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN restore-scoped token WHEN delete negative control runs THEN only drill-neg/<uuid> sacrificial key is targeted; AccessDenied observed; object remains; never $R2_BUCKET/existing",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h4-sacrificial-credential-negative.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "primary": true,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "r2-credential-negative-control",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "aws s3 rm $R2_BUCKET/existing still used",
            "live recovery key targeted",
            "AccessDenied faked"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sacrificial-drill-neg-object",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "delete-deny against sacrificial key only"
              ]
            },
            "end_state": {
              "must_observe": [
                "AccessDenied on drill-neg key",
                "object remains"
              ],
              "must_not_observe": [
                "rm of existing recovery key"
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
      "description": "GIVEN denylisted recovery keys WHEN negative control invoked against them THEN refuse before any delete API call",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h4-sacrificial-credential-negative.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "r2-credential-negative-control",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "denylist not enforced"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "live-recovery-prefix-denylist",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "invoke with denylisted keys"
              ]
            },
            "end_state": {
              "must_observe": [
                "safety error before delete"
              ],
              "must_not_observe": [
                "delete API against backup/ or restic paths"
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
      "description": "GIVEN inspectable restore policy WHEN non-mutating path used THEN DeleteObject/PutObject absent or denied without deleting objects",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h4-sacrificial-credential-negative.test.ts -t 'AC-3'; bash scripts/verify-restore-creds.sh",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-022",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "r2-policy-inspect",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "stub policy check",
            "mocked IAM"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "restore-scoped-read-only-token",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "inspect real policy document"
              ]
            },
            "end_state": {
              "must_observe": [
                "DeleteObject count = 0 for restore token"
              ],
              "must_not_observe": [
                "DeleteObject allowed with PASS"
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
      "description": "GIVEN D05-03 and scripts WHEN updated THEN no aws s3 rm $R2_BUCKET/existing remains; sacrificial/policy path documented",
      "verify": "rg -n 's3 rm \\$R2_BUCKET/existing' D05-03 and scripts must be empty; PLATFORM_IT=1 pnpm vitest run \u2026 -t 'AC-4'",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "documentation-and-script-guard",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "existing-key rm still documented"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "destructive-existing-key-negative-baseline",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "search docs and scripts"
              ]
            },
            "end_state": {
              "must_observe": [
                "0 existing-key destructive instructions"
              ],
              "must_not_observe": [
                "aws s3 rm $R2_BUCKET/existing"
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
      "description": "GIVEN H-4 suite WHEN pre-fix destructive control present THEN RED; GREEN only after sacrificial redesign",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h4-sacrificial-credential-negative.test.ts",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "r2-credential-negative-control",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "suite greens on live-key rm"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "destructive-existing-key-negative-baseline",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "run suite"
              ]
            },
            "end_state": {
              "must_observe": [
                "RED then GREEN with sacrificial proof"
              ],
              "must_not_observe": [
                "false green with live recovery key target"
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
      "description": "Delete negative control uses drill-neg sacrificial key and proves AccessDenied without destroying it",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h4-sacrificial-credential-negative.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Live recovery prefixes refused before any delete API call",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h4-sacrificial-credential-negative.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Non-mutating policy inspection proves no DeleteObject for restore token",
      "verify": "bash scripts/verify-restore-creds.sh; PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h4-sacrificial-credential-negative.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "No remaining aws s3 rm $R2_BUCKET/existing in D05-03/scripts",
      "verify": "rg -n 's3 rm \\$R2_BUCKET/existing' .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-03*.md scripts/ || test $? = 1",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Suite fails closed on live-key destructive control",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-h4-sacrificial-credential-negative.test.ts",
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
