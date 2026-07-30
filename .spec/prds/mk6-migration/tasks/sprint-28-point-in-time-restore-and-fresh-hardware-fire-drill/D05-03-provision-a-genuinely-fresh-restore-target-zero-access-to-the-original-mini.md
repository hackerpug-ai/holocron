# D05-03 — Provision a genuinely fresh restore target (zero access to the original mini)
> Status: ✅ Completed
> Completed: 2026-07-29T01:13:23Z

## What this does

Provisions a genuinely isolated restore target (separate VM/container) with zero access paths to the original mini, proving CAP-BAK-01's fresh-hardware requirement


**Provides:** Fresh restore target provisioning script; Isolation probe command that proves zero access to original mini; R2 scoped READ-ONLY credentials template


**Consumes:** Sprint 27 pgBackRest R2 repo (D04-02); R2 scoped credentials template


## Why

CAP-BAK-01's fire drill must restore onto a fresh machine with zero dependency on the original mini surviving; a scratch directory on the same host is insufficient isolation


Grounded in: UC-PLAT-06, T-PLAT-025, CAP-BAK-01.


## How to verify

Run the isolation probe on the fresh target; it must prove (a) no route to mini's Postgres port, (b) no mount of mini's PGDATA/blob dirs, (c) R2 credentials are scoped READ-ONLY and distinct from app creds


## Scope


**Writes:** scripts/provision-fresh-restore-target.sh (NEW); scripts/prove-isolation.sh (NEW); services/platform/src/backup/fresh-target.md (NEW — documentation of the provisioning approach and isolation requirements); terraform/restore-target/ (NEW — if using Terraform for VM provisioning)


**Prohibited:** Modifying the mini's Postgres configuration or credentials; Creating restore target on the same host as the mini (even with separate directories); Using the app's R2 read-write credentials on the restore target; Mounting any of the mini's data directories on the restore target; Implementing isolation probe that returns success without actual checks


<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>


================================================================================
TASK: D05-03 — Provision a genuinely fresh restore target (zero access to the original mini)
================================================================================
TASK_TYPE:  INFRA
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      devops-engineer
PROPOSED-BY: devops-engineer
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
Provision a genuinely isolated restore target that satisfies CAP-BAK-01's fresh-hardware requirement, with zero access paths to the original mini

**Success state:** A separate VM/container is running with its own Postgres installation, its own writable PGDATA directory (empty), and R2 read-only credentials; the isolation probe confirms no route to mini's Postgres, no mount of mini's data dirs, and credentials are scoped read-only; the target is ready for D05-04's end-to-end fire drill

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST provision a separate machine/VM/container with no network route to the mini's Postgres
- MUST use scoped R2 READ-ONLY credentials (not the app's read-write creds)
- MUST ensure the target's PGDATA and blob directories start empty and are writable
- MUST provide an isolation probe that proves mini-unreachability
- MUST document the provisioning steps in an executable script
- NEVER use the mini's host for the restore target (even with scratch directories)
- NEVER mount or reference the mini's PGDATA directory
- NEVER mount or reference the mini's blob storage volume
- NEVER use the app's R2 read-write credentials on the restore target
- NEVER allow any network route from restore target to mini's Postgres port
- STRICTLY isolation probe exits non-zero if any mini access path exists
- STRICTLY R2 credentials on restore target are bucket-scoped read-only (list/get only, no put/delete)
- STRICTLY restore target's postgresql.conf and pgBackRest config are independent (no symlink to mini's config)
- STRICTLY the target is provisioned via an automated script, not manual steps

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): Fresh target has no route to original mini
- [ ] AC-2: Restore target uses scoped R2 read-only credentials
- [ ] AC-3: Target PGDATA and blob directories start empty and writable
- [ ] AC-4: Automated provisioning script produces target
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — proven by real services)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Fresh target has no route to original mini (flow_ref T-PLAT-025)
  GIVEN: A freshly provisioned restore target (separate VM/container) with the isolation probe script installed
  WHEN:  operator runs the isolation probe script
  THEN:  the probe exits 0 only if all isolation checks pass: (a) nc -zv <mini-host> 5432 fails or times out, (b) /mnt/mini-pgdata is not mounted, (c) /mnt/mini-blobs is not mounted, (d) environment variables contain no read-write R2 credentials
  TEST_TIER: integration · VERIFICATION_SERVICE: fresh-VM-provisioning · TDD_STATE: none
  SCENARIO — start_ref: fresh_target_provisioned · evidence: stdout
    NEGATIVE_CONTROL: would fail if probe exits 0 despite nc succeeding to mini:5432 (stub ignores failure); probe exits 0 despite /mnt/mini-pgdata being mounted (static check); probe returns success without checking mounts (no-op)
    MUST_OBSERVE: process exit code = 0; stdout contains 'PASS: no route to mini Postgres'; stdout contains 'PASS: no mini PGDATA mount'; stdout contains 'PASS: no mini blob mount'; stdout contains 'PASS: R2 credentials are read-only scoped'
    MUST_NOT_OBSERVE: process exit code != 0 (failure state); stdout contains 'FAIL: mini Postgres reachable'; nc -zv <mini-host> 5432 exit code = 0 (route exists — fake-success start state); mount shows /mnt/mini-* paths present
  verify: ./scripts/prove-isolation.sh; echo $? shows 0; nc -zv <mini-host> 5432 fails; mount | grep -v '/mnt/mini-*' returns nothing; env | grep R2_READ_WRITE_CREDENTIAL is empty

AC-2 Restore target uses scoped R2 read-only credentials (flow_ref T-PLAT-025)
  GIVEN: Fresh restore target with environment configured
  WHEN:  operator inspects the R2 credential environment variables
  THEN:  the credentials are bucket-scoped with only List and Get permissions (no Put or Delete); the credentials differ from the app's read-write creds
  TEST_TIER: integration · VERIFICATION_SERVICE: R2-credential-scoping · TDD_STATE: none
  SCENARIO — start_ref: fresh_target_provisioned · evidence: stdout
    NEGATIVE_CONTROL: would fail if R2 credentials are the app's read-write creds (stub reuses same); aws s3 cp test.txt s3://bucket/drill-neg/<uuid>/ succeeds (Put not blocked — mock); delete against sacrificial drill-neg key succeeds (Delete not blocked — no-op); destructive control targets live recovery key existing/backup/pgbackrest (REDHAT-FIX-H4 forbid)
    MUST_OBSERVE: env | grep -c 'R2_ACCESS_KEY_ID' = 1 AND env | grep -c 'R2_SECRET_ACCESS_KEY' = 1 (both set); aws s3 ls $R2_BUCKET exit code = 0 (List allowed); aws s3 cp /dev/null $R2_BUCKET/drill-neg/<uuid>-put-probe exit code != 0 AND stderr contains 'AccessDenied' (Put blocked); aws s3api delete-object on drill-neg/<uuid> sacrificial key exit code != 0 AND stderr contains 'AccessDenied' (Delete blocked) OR non-mutating policy inspect shows PutObject/DeleteObject action count = 0; denylist refuses backup/, archive/, pgbackrest/, restic/, literal existing before any delete API
    MUST_NOT_OBSERVE: env | grep -c 'R2_ACCESS_KEY_ID' = 0 (empty); aws s3 cp exit code = 0 (Put allowed — fake-success start state); delete exit = 0 on sacrificial key (Delete allowed); credentials match the app's read-write creds; delete API against denylisted live recovery prefixes (backup/, archive/, pgbackrest/, restic/, bucket-root key named existing)
  verify: env | grep R2_ shows R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY set; R2_BUCKET scoped to holocron-backup; REQUIRE_LIVE_R2_RO=1 ./scripts/prove-r2-readonly.sh (drill-neg sacrificial Put/Delete denial) and/or ./scripts/verify-restore-creds.sh (policy DeleteObject=0 + H-4 denylist); NEVER delete live recovery objects (use drill-neg sacrificial keys only)

AC-3 Target PGDATA and blob directories start empty and writable (flow_ref T-PLAT-025)
  GIVEN: Fresh restore target with directories provisioned
  WHEN:  operator checks the PGDATA and blob directories
  THEN:  both directories exist, are empty (no files/subdirs), and are writable by the restore user
  TEST_TIER: integration · VERIFICATION_SERVICE: fresh-VM-provisioning · TDD_STATE: none
  SCENARIO — start_ref: fresh_target_provisioned · evidence: stdout
    NEGATIVE_CONTROL: would fail if PGDATA directory contains existing base.tar or PG_VERSION (not empty — stub); blob directory contains existing objects (not empty); touch test fails with PermissionDenied (not writable — no-op)
    MUST_OBSERVE: test -d /var/lib/postgresql/restore exit code = 0 AND test -d /var/lib/holocron/blob-restore exit code = 0 (both directories exist); find /var/lib/postgresql/restore -mindepth 1 | wc -l = 0 (PGDATA empty); find /var/lib/holocron/blob-restore -mindepth 1 | wc -l = 0 (blob dir empty); touch /var/lib/postgresql/restore/test-write exit code = 0 (writable); touch /var/lib/holocron/blob-restore/test-write exit code = 0 (writable)
    MUST_NOT_OBSERVE: test -d /var/lib/postgresql/restore exit code != 0 (missing); find /var/lib/postgresql/restore -mindepth 1 | wc -l > 0 (not empty); touch exit code != 0 (PermissionDenied — fake-success start state); ls shows PG_VERSION or base.tar (files present)
  verify: ls -la /var/lib/postgresql/restore shows empty directory; touch /var/lib/postgresql/restore/test-write succeeds; ls -la /var/lib/holocron/blob-restore shows empty; touch /var/lib/holocron/blob-restore/test-write succeeds

AC-4 Automated provisioning script produces target (flow_ref T-PLAT-025)
  GIVEN: A base environment (Docker host, Proxmox, or AWS EC2)
  WHEN:  operator runs the provisioning script with the target hostname
  THEN:  the script creates the VM/container, installs Postgres, creates empty PGDATA/blob dirs, configures R2 read-only credentials, and runs the isolation probe successfully
  TEST_TIER: integration · VERIFICATION_SERVICE: fresh-VM-provisioning · TDD_STATE: none
  SCENARIO — start_ref: base_environment_ready · evidence: stdout
    NEGATIVE_CONTROL: would fail if script is a no-op that echoes 'done' without creating anything (stub); script creates the VM but skips Postgres installation (mock); script sets R2 credentials to read-write instead of read-only (static)
    MUST_OBSERVE: provisioning script exit code = 0; ssh fresh-restore-01 'echo ok' exit code = 0 (ssh succeeds); prove-isolation.sh exit code = 0; postgres --version on fresh-restore-01 stdout matches /PostgreSQL 18\.\d+/ (version present); test -d <PGDATA> exit code = 0 AND find <PGDATA> -mindepth 1 | wc -l = 0 (PGDATA empty and exists)
    MUST_NOT_OBSERVE: provisioning script exit code != 0; ssh fresh-restore-01 'echo ok' exit code != 0 (ssh fails — host not created); prove-isolation.sh exit code != 0; postgres --version returns 'command not found'
  verify: ./scripts/provision-fresh-restore-target.sh --host fresh-restore-01; echo $? shows 0; ssh fresh-restore-01 'echo ok' exit 0; ssh fresh-restore-01 './scripts/prove-isolation.sh <mini-host>' exits 0

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- scripts/provision-fresh-restore-target.sh (NEW)
- scripts/prove-isolation.sh (NEW)
- services/platform/src/backup/fresh-target.md (NEW — documentation of the provisioning approach and isolation requirements)
- terraform/restore-target/ (NEW — if using Terraform for VM provisioning)
writeProhibited: Modifying the mini's Postgres configuration or credentials; Creating restore target on the same host as the mini (even with separate directories); Using the app's R2 read-write credentials on the restore target; Mounting any of the mini's data directories on the restore target; Implementing isolation probe that returns success without actual checks

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/D04-03-configure-continuous-wal-archiving-and-scheduled-base-backups.md:32-280 [INFRA task structure with REQUIREMENT-CONTRACT v1 block, AC/TC pattern, scenario shaping with concrete must_observe values]
2. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements.md:1-100 [CAP-BAK-01 boundary contracts and fresh-hardware requirements]
3. https://developers.cloudflare.com/r2/api/s3/api/:1-80 [R2 S3-compatible API and credential scoping patterns]
4. /Users/inference1/Projects/holocron/services/platform/src/stack/probes.ts:88-162 [Health probe and verification patterns for isolation checks]
5. /Users/inference1/Projects/holocron/services/platform/src/cli/holo.ts:1831-1900 [CLI patterns for provisioning scripts and structured output]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Isolation probe passes: `./scripts/prove-isolation.sh <mini-host>` → Exit 0; all checks show PASS; no route to mini Postgres; no mounts; read-only credentials
- R2 credentials are read-only: `env | grep R2_; aws s3 ls $R2_BUCKET; aws s3 cp /dev/null $R2_BUCKET/test` → Credentials set; ls exits 0; cp fails with AccessDenied
- Directories empty and writable: `ls -la /var/lib/postgresql/restore; touch /var/lib/postgresql/restore/test; rm /var/lib/postgresql/restore/test` → ls shows empty; touch exits 0; rm exits 0
- Automated provisioning: `./scripts/provision-fresh-restore-target.sh --host test-target; ssh test-target './scripts/prove-isolation.sh <mini-host>'` → Provisioning exits 0; ssh succeeds; isolation probe exits 0

--------------------------------------------------------------------------------
DESIGN / ANTI-PATTERN
--------------------------------------------------------------------------------
pattern: Infrastructure provisioning script with automated verification probes that prove isolation and credential scoping
anti_pattern: Manual provisioning steps without automation; isolation probe that returns success without actual checks; using shared host with scratch directories instead of separate VM/container

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D04-02 · Blocks: D05-04, D05-06

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D05-03",
  "proposed_by": "devops-engineer",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fresh_target_provisioned": {
      "description": "A freshly provisioned restore target (separate VM/container) with Postgres installed, empty PGDATA/blob dirs, R2 read-only credentials configured, and the isolation probe script present",
      "seed_method": "cli",
      "records": [
        "VM/container is running and accessible via SSH",
        "postgres --version returns a valid version",
        "/var/lib/postgresql/restore exists and is empty",
        "/var/lib/holocron/blob-restore exists and is empty",
        "R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are set (read-only scoped)",
        "/scripts/prove-isolation.sh exists and is executable"
      ]
    },
    "base_environment_ready": {
      "description": "A base provisioning environment ready to create fresh restore targets (Docker host, Proxmox, or AWS EC2 with necessary tools installed)",
      "seed_method": "cli",
      "records": [
        "Docker/Promox/AWS CLI tools installed",
        "SSH key pair exists for VM access",
        "Network segment is isolated from the mini",
        "provision-fresh-restore-target.sh script exists and is executable"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-025",
      "description": "GIVEN fresh restore target WHEN operator runs isolation probe THEN probe exits 0 only if all checks pass: no route to mini Postgres; no mini PGDATA/blob mounts; no read-write R2 creds",
      "verify": "./scripts/prove-isolation.sh; echo $? shows 0; nc -zv <mini-host> 5432 fails; mount shows no /mnt/uni-*",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "fresh-VM-provisioning",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "probe exits 0 despite nc succeeding (stub)",
            "probe exits 0 despite mounts (static)",
            "probe returns success without checking (no-op)",
            "probe stubs all checks (mock)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh_target_provisioned",
            "action": {
              "actor": "operator",
              "steps": [
                "run ./scripts/prove-isolation.sh <mini-host>"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code = 0",
                "stdout contains 'PASS: no route to mini Postgres'",
                "stdout contains 'PASS: no mini PGDATA mount'",
                "stdout contains 'PASS: no mini blob mount'",
                "stdout contains 'PASS: R2 credentials read-only'",
                "nc -zv <mini-host> 5432 exit != 0"
              ],
              "must_not_observe": [
                "exit code != 0",
                "stdout contains 'FAIL: mini Postgres reachable'",
                "nc -zv exit = 0 (route exists — fake-success start state)",
                "mount shows /mnt/uni-* paths"
              ]
            }
          }
        ],
        "primary": true
      },
      "test_tier": "integration"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "description": "GIVEN fresh target WHEN operator inspects R2 credentials THEN credentials are bucket-scoped with only List and Get permissions; aws s3 ls succeeds but Put/Delete on sacrificial drill-neg/<uuid> keys fail with AccessDenied (or policy shows DeleteObject count=0); NEVER delete live recovery keys (REDHAT-FIX-H4)",
      "verify": "env shows R2 credentials set; aws s3 ls $R2_BUCKET succeeds; prove-r2-readonly drill-neg Put/Delete AccessDenied OR verify-restore-creds policy DeleteObject=0 + H-4 denylist; never delete live recovery object keys",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "R2-credential-scoping",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "credentials are read-write (stub)",
            "aws s3 cp succeeds on drill-neg (mock)",
            "delete succeeds on sacrificial drill-neg key (no-op)",
            "destructive control targets live recovery key existing/backup/pgbackrest",
            "credentials empty (static)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh_target_provisioned",
            "action": {
              "actor": "operator",
              "steps": [
                "env | grep R2_",
                "aws s3 ls $R2_BUCKET",
                "aws s3 cp /dev/null $R2_BUCKET/drill-neg/<uuid>-put-probe",
                "aws s3api delete-object --key drill-neg/<uuid>-redhat-fix-h4.txt (sacrificial only)",
                "prove-r2-readonly --assert-denylisted existing (must refuse before delete API)"
              ]
            },
            "end_state": {
              "must_observe": [
                "env | grep -c 'R2_ACCESS_KEY_ID' = 1 AND env | grep -c 'R2_SECRET_ACCESS_KEY' = 1",
                "aws s3 ls exit = 0",
                "aws s3 cp on drill-neg exit != 0 AND stderr contains 'AccessDenied'",
                "delete-object on drill-neg exit != 0 AND stderr contains 'AccessDenied' OR policy PutObject/DeleteObject count = 0",
                "denylist refuses key prefix `existing` / `backup` / `pgbackrest` before any delete API (exit != 0)"
              ],
              "must_not_observe": [
                "env | grep -c 'R2_ACCESS_KEY_ID' = 0",
                "aws s3 cp exit = 0 (Put allowed — fake-success start state)",
                "delete exit = 0 on sacrificial key",
                "delete API against live recovery keys (bucket-root existing, backup/, pgbackrest/)",
                "credentials match app read-write creds"
              ]
            }
          }
        ],
        "primary": false
      },
      "test_tier": "integration"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "description": "GIVEN fresh target WHEN operator checks PGDATA and blob dirs THEN both exist, are empty, and are writable by restore user",
      "verify": "ls -la shows empty directories; touch test-write exits 0; rm test-write exits 0",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "fresh-VM-provisioning",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "directories contain existing files (stub)",
            "touch fails (no-op)",
            "directories do not exist (static)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh_target_provisioned",
            "action": {
              "actor": "operator",
              "steps": [
                "ls -la /var/lib/postgresql/restore",
                "touch /var/lib/postgresql/restore/test",
                "rm /var/lib/postgresql/restore/test",
                "ls -la /var/lib/holocron/blob-restore",
                "touch /var/lib/holocron/blob-restore/test"
              ]
            },
            "end_state": {
              "must_observe": [
                "test -d <PGDATA> exit = 0 AND test -d <blob-dir> exit = 0 (both exist)",
                "find <PGDATA> -mindepth 1 | wc -l = 0 (PGDATA empty)",
                "find <blob-dir> -mindepth 1 | wc -l = 0 (blob empty)",
                "touch test exit = 0 (writable)"
              ],
              "must_not_observe": [
                "test -d <PGDATA> exit != 0 (missing)",
                "find <PGDATA> -mindepth 1 | wc -l > 0 (not empty)",
                "touch exit != 0 (PermissionDenied — fake-success start state)",
                "ls shows PG_VERSION or files"
              ]
            }
          }
        ],
        "primary": false
      },
      "test_tier": "integration"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "description": "GIVEN base environment WHEN operator runs provisioning script THEN script creates VM/container, installs Postgres, creates empty dirs, configures R2 read-only creds, and isolation probe passes",
      "verify": "./scripts/provision-fresh-restore-target.sh --host fresh-restore-01 exits 0; ssh to target succeeds; prove-isolation.sh exits 0",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "fresh-VM-provisioning",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "script is a no-op (stub)",
            "skips Postgres install (mock)",
            "sets read-write creds (static)",
            "isolation probe fails (no-op)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "base_environment_ready",
            "action": {
              "actor": "operator",
              "steps": [
                "run ./scripts/provision-fresh-restore-target.sh --host fresh-restore-01",
                "ssh fresh-restore-01",
                "./scripts/prove-isolation.sh <mini-host>"
              ]
            },
            "end_state": {
              "must_observe": [
                "provisioning exit = 0",
                "ssh fresh-restore-01 'echo ok' exit = 0",
                "prove-isolation.sh exit = 0",
                "postgres --version stdout matches /PostgreSQL 18\\.\\d+/",
                "test -d <PGDATA> exit = 0 AND find <PGDATA> -mindepth 1 | wc -l = 0"
              ],
              "must_not_observe": [
                "provisioning exit != 0",
                "ssh exit != 0 (host not created)",
                "prove-isolation.sh exit != 0",
                "postgres --version returns 'command not found'"
              ]
            }
          }
        ],
        "primary": false
      },
      "test_tier": "integration"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Fresh target has no route to original mini",
      "maps_to_ac": "AC-1",
      "verify": "./scripts/prove-isolation.sh exits 0; nc -zv <mini-host> 5432 fails; mount shows no /mnt/mini-*"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Restore target uses scoped R2 read-only credentials",
      "maps_to_ac": "AC-2",
      "verify": "env shows R2 credentials set; aws s3 ls succeeds; aws s3 cp/rm fail with AccessDenied"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Target PGDATA and blob directories start empty and writable",
      "maps_to_ac": "AC-3",
      "verify": "ls -la shows empty directories; touch test-write succeeds"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Automated provisioning script produces target",
      "maps_to_ac": "AC-4",
      "verify": "./scripts/provision-fresh-restore-target.sh exits 0; ssh to target succeeds; prove-isolation.sh exits 0"
    }
  ]
}
-->

</details>
