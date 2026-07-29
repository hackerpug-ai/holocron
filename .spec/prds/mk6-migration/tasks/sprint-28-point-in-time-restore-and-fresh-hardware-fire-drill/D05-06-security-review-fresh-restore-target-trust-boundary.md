# D05-06 — Security review: fresh-restore-target trust boundary
> Status: ✅ Completed
> Completed: 2026-07-29T01:13:23Z

## What this does

Adversarial read-only security review of the fresh-restore-target trust boundary over D05-02 (restore command), D05-03 (fresh target provisioning), D05-04 (end-to-end fire drill), D05-05 (periodic mission + runbook). Validates isolation from the original mini, read-only R2 credential scoping, zero secret leakage into restored artifacts, and that restored Postgres is not exposed beyond the target. Produces a findings doc (security-review-D05-06.md) with an APPROVED/NEEDS_FIXES verdict.


**Provides:** security-review-D05-06.md findings doc with APPROVED/NEEDS_FIXES verdict; isolation/credential/secret-scan/postgres-binding verify scripts


**Consumes:** D05-02 restore command; D05-03 fresh target; D05-04 fire drill + parity report; D05-05 runbook + mission output


## Why

CAP-BAK-01's restore half is security-critical: a restore target with lateral access to the original mini, write-capable R2 credentials, or secrets embedded in restored artifacts creates a trust breach. The review enforces the fresh-hardware contract: restore from R2 alone onto a machine with zero mini access, using scoped read-only credentials, producing sanitized artifacts.


Grounded in: UC-PLAT-06, T-PLAT-025, CAP-BAK-01.


## How to verify

Isolation probe confirms 0 reachable mini routes from the target; R2 credential inspection shows read-only bucket-scoped token; secret scan (gitleaks/trufflehog/grep) over restored artifacts returns 0 credential matches; restored Postgres is bound to localhost/unix socket only; parity report contains no secrets; findings doc exists with explicit verdict.


## Scope


**Writes:** .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/security-review-D05-06.md (NEW — findings log); scripts/verify-restore-isolation.sh (NEW — isolation probe helper); scripts/verify-restore-creds.sh (NEW — credential scope inspection); scripts/verify-restored-artifacts.sh (NEW — secret scan wrapper); scripts/verify-postgres-exposure.sh (NEW — Postgres binding check)


**Prohibited:** services/platform/** — review is read-only; CRITICAL findings route back to D05-02-D05-05; app/** + holocron-mcp/** — not this sprint; Any file not explicitly listed in write_allowed


<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>


================================================================================
TASK: D05-06 — Security review: fresh-restore-target trust boundary
================================================================================
TASK_TYPE:  INFRA
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (60 min)
AGENT:      implementer=security-reviewer | reviewer=mastra-reviewer
PROPOSED-BY: security-reviewer
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 28 — Point-in-Time Restore and Fresh-Hardware Fire Drill](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Adversarial security review proving the fresh-restore-target trust boundary holds: zero mini lateral access, read-only scoped R2 creds, no secret leakage, restored Postgres not exposed — producing a findings doc with explicit verdict.

**Success state:** All five trust-boundary ACs pass with real command-output evidence; security-review-D05-06.md carries Verdict: APPROVED (or NEEDS_FIXES routing CRITICAL findings back to D05-02-D05-05).

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST validate fresh restore target has NO reachable path to the original mini (no shared PGDATA/blob volume mount, no network route to Postgres/socket/IPC)
- MUST validate restore uses READ-ONLY R2-scoped credential distinct from app read-write credentials
- MUST validate restored artifacts contain NO embedded secrets/credentials/unredacted hostnames (Postgres rows, blobs, runbook, parity report, mission output)
- MUST validate restored Postgres is NOT exposed beyond the restore target
- MUST produce security-review-D05-06.md with APPROVED/NEEDS_FIXES verdict backed by trust-boundary assertions
- NEVER approve a restore target with mini lateral access or shared volumes
- NEVER approve restore credentials that are write-capable or usable on non-backup resources
- NEVER approve restored artifacts containing embedded secrets or credentials
- NEVER modify restore production code (D05-02-D05-05 scope)
- STRICTLY review is read-only; CRITICAL findings route back to D05-02-D05-05
- STRICTLY every AC proven by real command output (policy JSON, grep counts, probe exit codes) — zero attestation-only checks

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): Fresh target has zero mini access
- [ ] AC-2: Restore creds are read-only + scoped
- [ ] AC-3: Zero secret leakage in restored artifacts
- [ ] AC-4: Restored Postgres not exposed
- [ ] AC-5: Findings doc with explicit verdict
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — proven by real services)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Fresh target has zero mini access (flow_ref T-PLAT-025)
  GIVEN: GIVEN D05-03 provisioned a fresh restore target WHEN the reviewer runs an isolation probe THEN 0 reachable routes to the original mini are confirmed (no shared PGDATA/blob mount, no network route to mini Postgres/socket/IPC); probe exit 0
  TEST_TIER: integration · VERIFICATION_SERVICE: isolation-probe · TDD_STATE: none
  SCENARIO — start_ref: fresh_restore_target_provisioned · evidence: stdout
    NEGATIVE_CONTROL: would fail if isolation check is a no-op returning isolated without probing routes; probe accepts localhost as isolated when mini is co-located; stub/static implementation that hardcodes exit 0 without real connectivity test
    MUST_OBSERVE: probe exit 0; 0 reachable mini routes; mount table has 0 entries matching PGDATA or blob; nc -z mini 5432 exit 1 (unreachable)
    MUST_NOT_OBSERVE: 1 or more reachable mini routes (the insecure start state); a shared volume mount entry present; mini Postgres port 5432 reachable; mini unix socket path accessible
  verify: scripts/verify-restore-isolation.sh → exit 0 with 0 reachable mini routes, 0 shared mounts

AC-2 Restore creds are read-only + scoped (flow_ref T-PLAT-025)
  GIVEN: GIVEN D05-02 restore command WHEN the reviewer inspects R2 creds THEN the credential is read-only, scoped to the backup bucket/prefix only, distinct from app DATABASE_URL/Fleet creds, with NO write/delete actions
  TEST_TIER: integration · VERIFICATION_SERVICE: r2-credential-inspect · TDD_STATE: none
  SCENARIO — start_ref: restore_command_with_creds · evidence: stdout
    NEGATIVE_CONTROL: would fail if credential check is a stub returning read-only without inspecting policy; accepts wildcard resource without verifying bucket constraint; static implementation that hardcodes pass without real policy query
    MUST_OBSERVE: policy Action set size = 2 (GetObject, ListObject); PutObject/DeleteObject action count = 0; policy Resource = 'arn:aws:s3:::holocron-backup-*' (literal bucket name); R2 restore access-key-id != DATABASE_URL user; 0 shared credentials between restore token and app
    MUST_NOT_OBSERVE: >0 PutObject/DeleteObject actions (the write-capable start state); policy Resource = '*'; restore token usable on non-backup buckets; shared credentials between restore token and app
  verify: scripts/verify-restore-creds.sh → read-only actions, backup bucket ARN only, distinct from app

AC-3 Zero secret leakage in restored artifacts (flow_ref T-PLAT-025)
  GIVEN: GIVEN D05-04 restored Postgres rows, blobs, runbook, parity report WHEN the reviewer runs secret scan THEN 0 credential matches are returned in restored artifacts
  TEST_TIER: integration · VERIFICATION_SERVICE: secret-scan · TDD_STATE: none
  SCENARIO — start_ref: fire_drill_completed · evidence: stdout
    NEGATIVE_CONTROL: would fail if secret scan is skipped or returns cached results; scan excludes restored files or only checks file count; stub implementation that hardcodes 0 hits without real scan
    MUST_OBSERVE: secret-scan reports 0 credential matches; grep returns 0 AWS/R2 secret hits; 0 Postgres password/API key patterns
    MUST_NOT_OBSERVE: >0 credential matches (the insecure start state); an AWS/R2 secret in a restored file; a Postgres password or API key in restored rows; an unredacted hostname/endpoint in parity report
  verify: scripts/verify-restored-artifacts.sh (gitleaks/trufflehog/grep) → 0 credential matches

AC-4 Restored Postgres not exposed (flow_ref T-PLAT-025)
  GIVEN: GIVEN D05-04 restored Postgres on the target WHEN the reviewer checks binding THEN Postgres is bound to localhost/unix socket only, NOT a reachable external address; target torn down/access-scoped
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-binding-inspect · TDD_STATE: none
  SCENARIO — start_ref: postgres_restored · evidence: stdout
    NEGATIVE_CONTROL: would fail if binding check only confirms Postgres is running; accepts localhost when also bound to 0.0.0.0; stub implementation that returns true without real config inspection
    MUST_OBSERVE: listen_addresses = localhost (not '*' or '0.0.0.0'); pg_hba.conf has 0 host entries allowing external; ss -ltn shows 0 listeners on 0.0.0.0:5432
    MUST_NOT_OBSERVE: 1 or more 0.0.0.0:5432 listeners (the exposed start state); listen_addresses = '*'; pg_hba.conf host entry allowing external connections; Postgres reachable from outside target
  verify: scripts/verify-postgres-exposure.sh → localhost/unix socket only, 0 external listeners

AC-5 Findings doc with explicit verdict (flow_ref T-PLAT-025)
  GIVEN: GIVEN AC-1 through AC-4 checks completed WHEN the reviewer compiles findings THEN security-review-D05-06.md documents each check with evidence + a final Verdict; CRITICAL findings yield NEEDS_FIXES
  TEST_TIER: integration · VERIFICATION_SERVICE: documentation · TDD_STATE: none
  SCENARIO — start_ref: checks_completed · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if findings doc is a template without AC-specific verdicts; Verdict line missing or ambiguous; stub implementation that writes empty doc without evidence
    MUST_OBSERVE: test -f .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/security-review-D05-06.md exit 0; AC-1..AC-4 verdicts present with evidence; final line matches 'Verdict: APPROVED' or 'Verdict: NEEDS_FIXES'
    MUST_NOT_OBSERVE: findings file absent (byte-count = 0, empty start state); verdict line missing; AC sections missing evidence; ambiguous or unsigned verdict
  verify: test -f security-review-D05-06.md && grep -q 'Verdict: APPROVED\|Verdict: NEEDS_FIXES' security-review-D05-06.md

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/security-review-D05-06.md (NEW — findings log)
- scripts/verify-restore-isolation.sh (NEW — isolation probe helper)
- scripts/verify-restore-creds.sh (NEW — credential scope inspection)
- scripts/verify-restored-artifacts.sh (NEW — secret scan wrapper)
- scripts/verify-postgres-exposure.sh (NEW — Postgres binding check)
writeProhibited: services/platform/** — review is read-only; CRITICAL findings route back to D05-02-D05-05; app/** + holocron-mcp/** — not this sprint; Any file not explicitly listed in write_allowed

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:63-72 [CAP-BAK-01 restore half: PITR + fresh-hardware fire-drill from remote bucket alone]
2. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/D04-06-security-review-r2-bucket-credentials-and-encryption.md:1-175 [Precedent security-review findings doc format and AC structure]
3. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-06-headless-deployment-dev-prod-parity/D01-06-security-review-consolidated-secrets-store.md:1-175 [Security-review patterns for trust-boundary validation and credential scoping]
4. /Users/inference1/Projects/holocron/services/platform/src/blob/verify.ts:1-50 [Blob parity verification pattern for restored artifact integrity checks]
5. /Users/inference1/Projects/holocron/services/platform/src/db/schema/evidence.ts:1-50 [Evidence ledger schema that restored Postgres rows must not contain foreign-node/injected data]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Isolation Probe: `scripts/verify-restore-isolation.sh` → Exit 0 with 0 reachable mini routes, 0 shared volume mounts
- Credential Scope: `scripts/verify-restore-creds.sh` → Exit 0: read-only actions, backup bucket ARN only, distinct from app creds
- Secret Scan: `scripts/verify-restored-artifacts.sh` → Exit 0 with 0 credential matches in restored artifacts
- Postgres Binding: `scripts/verify-postgres-exposure.sh` → Exit 0: localhost/unix socket only, 0 external listeners
- Findings Doc: `test -f security-review-D05-06.md && grep -q 'Verdict: APPROVED\|Verdict: NEEDS_FIXES' security-review-D05-06.md` → Exit 0 with findings doc containing explicit verdict

--------------------------------------------------------------------------------
DESIGN / ANTI-PATTERN
--------------------------------------------------------------------------------
pattern: Read-only adversarial review: each AC proven by real command output (policy JSON, grep counts, probe exit codes), findings doc with explicit verdict
anti_pattern: Attestation-only checks ('looks right'); approving with mini reachable / write-capable creds / secret leaks; fixing production code in-review

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D05-02, D05-03, D05-04, D05-05 · Blocks: —

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D05-06",
  "proposed_by": "security-reviewer",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fresh_restore_target_provisioned": {
      "description": "D05-03 provisioned a genuinely fresh restore target with zero access to the original mini",
      "seed_method": "recorded_external",
      "records": [
        "target VM on separate network from mini",
        "no shared PGDATA/blob volume mounts",
        "mini hostname unreachable from target",
        "R2 read-only credential configured"
      ]
    },
    "restore_command_with_creds": {
      "description": "D05-02 implemented holo restore --pitr with scoped R2 credentials",
      "seed_method": "recorded_external",
      "records": [
        "holo restore command exists",
        "R2 read-only token configured",
        "token distinct from app DATABASE_URL/Fleet credentials"
      ]
    },
    "fire_drill_completed": {
      "description": "D05-04 completed full fire drill: Postgres PITR + blob restore from R2 alone",
      "seed_method": "recorded_external",
      "records": [
        "Postgres restored from R2 backup",
        "blob store restored via restic",
        "row counts + evidence-ledger chain match pre-failure snapshot",
        "parity report + runbook generated"
      ]
    },
    "postgres_restored": {
      "description": "Postgres restored on the fresh target, ready for binding inspection",
      "seed_method": "recorded_external",
      "records": [
        "Postgres running on target",
        "data directory restored from R2",
        "queryable database matches snapshot"
      ]
    },
    "checks_completed": {
      "description": "AC-1 through AC-4 security review checks have been executed",
      "seed_method": "recorded_external",
      "records": [
        "isolation probe run with output",
        "R2 credential inspected",
        "secret scan completed",
        "Postgres binding checked"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-025",
      "name": "Fresh target has zero mini access",
      "description": "GIVEN D05-03 provisioned a fresh restore target WHEN the reviewer runs an isolation probe THEN 0 reachable routes to the original mini are confirmed (no shared PGDATA/blob mount, no network route to mini Postgres/socket/IPC); probe exit 0",
      "verify": "scripts/verify-restore-isolation.sh \u2192 exit 0 with 0 reachable mini routes, 0 shared mounts",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "isolation-probe",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "isolation-probe",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "isolation check is a no-op returning isolated without probing routes",
            "probe accepts localhost as isolated when mini is co-located",
            "stub/static implementation that hardcodes exit 0 without real connectivity test"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh_restore_target_provisioned",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "run isolation probe from target (ping/nc/curl to mini hostname/IP)",
                "check volume mounts for shared PGDATA/blob dirs",
                "verify no route to mini Postgres 5432 or unix socket"
              ]
            },
            "end_state": {
              "must_observe": [
                "probe exit 0",
                "0 reachable mini routes",
                "mount table has 0 entries matching PGDATA or blob",
                "nc -z mini 5432 exit 1 (unreachable)"
              ],
              "must_not_observe": [
                "1 or more reachable mini routes (the insecure start state)",
                "a shared volume mount entry present",
                "mini Postgres port 5432 reachable",
                "mini unix socket path accessible"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "name": "Restore creds are read-only + scoped",
      "description": "GIVEN D05-02 restore command WHEN the reviewer inspects R2 creds THEN the credential is read-only, scoped to the backup bucket/prefix only, distinct from app DATABASE_URL/Fleet creds, with NO write/delete actions",
      "verify": "scripts/verify-restore-creds.sh \u2192 read-only actions, backup bucket ARN only, distinct from app",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "r2-credential-inspect",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "r2-credential-inspect",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "credential check is a stub returning read-only without inspecting policy",
            "accepts wildcard resource without verifying bucket constraint",
            "static implementation that hardcodes pass without real policy query"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "restore_command_with_creds",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "inspect restore R2 token policy actions/resources",
                "compare against app DATABASE_URL/Fleet scope",
                "verify token NOT usable on non-backup buckets"
              ]
            },
            "end_state": {
              "must_observe": [
                "policy Action set size = 2 (GetObject, ListObject); PutObject/DeleteObject action count = 0",
                "policy Resource = 'arn:aws:s3:::holocron-backup-*' (literal bucket name)",
                "R2 restore access-key-id != DATABASE_URL user; 0 shared credentials between restore token and app"
              ],
              "must_not_observe": [
                ">0 PutObject/DeleteObject actions (the write-capable start state)",
                "policy Resource = '*'",
                "restore token usable on non-backup buckets",
                "shared credentials between restore token and app"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "name": "Zero secret leakage in restored artifacts",
      "description": "GIVEN D05-04 restored Postgres rows, blobs, runbook, parity report WHEN the reviewer runs secret scan THEN 0 credential matches are returned in restored artifacts",
      "verify": "scripts/verify-restored-artifacts.sh (gitleaks/trufflehog/grep) \u2192 0 credential matches",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "secret-scan",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "secret-scan",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "secret scan is skipped or returns cached results",
            "scan excludes restored files or only checks file count",
            "stub implementation that hardcodes 0 hits without real scan"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fire_drill_completed",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "run gitleaks/trufflehog over restored Postgres dump dir",
                "scan restored blob store",
                "grep parity report/runbook/mission output for credential patterns"
              ]
            },
            "end_state": {
              "must_observe": [
                "secret-scan reports 0 credential matches",
                "grep returns 0 AWS/R2 secret hits",
                "0 Postgres password/API key patterns"
              ],
              "must_not_observe": [
                ">0 credential matches (the insecure start state)",
                "an AWS/R2 secret in a restored file",
                "a Postgres password or API key in restored rows",
                "an unredacted hostname/endpoint in parity report"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "name": "Restored Postgres not exposed",
      "description": "GIVEN D05-04 restored Postgres on the target WHEN the reviewer checks binding THEN Postgres is bound to localhost/unix socket only, NOT a reachable external address; target torn down/access-scoped",
      "verify": "scripts/verify-postgres-exposure.sh \u2192 localhost/unix socket only, 0 external listeners",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "postgres-binding-inspect",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-binding-inspect",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "binding check only confirms Postgres is running",
            "accepts localhost when also bound to 0.0.0.0",
            "stub implementation that returns true without real config inspection"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_restored",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "inspect Postgres listen_addresses and pg_hba.conf",
                "verify no 0.0.0.0 binding",
                "confirm target access-scoped/torn down"
              ]
            },
            "end_state": {
              "must_observe": [
                "listen_addresses = localhost (not '*' or '0.0.0.0')",
                "pg_hba.conf has 0 host entries allowing external",
                "ss -ltn shows 0 listeners on 0.0.0.0:5432"
              ],
              "must_not_observe": [
                "1 or more 0.0.0.0:5432 listeners (the exposed start state)",
                "listen_addresses = '*'",
                "pg_hba.conf host entry allowing external connections",
                "Postgres reachable from outside target"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "name": "Findings doc with explicit verdict",
      "description": "GIVEN AC-1 through AC-4 checks completed WHEN the reviewer compiles findings THEN security-review-D05-06.md documents each check with evidence + a final Verdict; CRITICAL findings yield NEEDS_FIXES",
      "verify": "test -f security-review-D05-06.md && grep -q 'Verdict: APPROVED\\|Verdict: NEEDS_FIXES' security-review-D05-06.md",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "documentation",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "documentation",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "findings doc is a template without AC-specific verdicts",
            "Verdict line missing or ambiguous",
            "stub implementation that writes empty doc without evidence"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "checks_completed",
            "action": {
              "actor": "security-reviewer",
              "steps": [
                "write findings per AC with command output evidence",
                "document trust-boundary assertions",
                "set final Verdict: APPROVED or NEEDS_FIXES"
              ]
            },
            "end_state": {
              "must_observe": [
                "test -f .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/security-review-D05-06.md exit 0",
                "AC-1..AC-4 verdicts present with evidence",
                "final line matches 'Verdict: APPROVED' or 'Verdict: NEEDS_FIXES'"
              ],
              "must_not_observe": [
                "findings file absent (byte-count = 0, empty start state)",
                "verdict line missing",
                "AC sections missing evidence",
                "ambiguous or unsigned verdict"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Isolation probe exit 0 with 0 reachable mini routes, 0 shared volumes",
      "maps_to_ac": "AC-1",
      "verify": "scripts/verify-restore-isolation.sh shows 0 reachable routes, 0 shared mounts, exit 0"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Restore credential is read-only, scoped to backup bucket only, distinct from app creds",
      "maps_to_ac": "AC-2",
      "verify": "scripts/verify-restore-creds.sh: read-only actions, backup bucket ARN only, not shared with app"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Secret scan returns 0 credential matches in all restored artifacts",
      "maps_to_ac": "AC-3",
      "verify": "scripts/verify-restored-artifacts.sh (gitleaks/trufflehog/grep) returns 0 credential hits"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Restored Postgres bound to localhost/unix socket only, not externally reachable",
      "maps_to_ac": "AC-4",
      "verify": "scripts/verify-postgres-exposure.sh: listen_addresses=localhost, pg_hba 0 external, 0 0.0.0.0 listeners"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Findings doc exists with explicit verdict and all AC evidence",
      "maps_to_ac": "AC-5",
      "verify": "test -f security-review-D05-06.md && grep -q 'Verdict: APPROVED\\|Verdict: NEEDS_FIXES'"
    }
  ]
}
-->

</details>
