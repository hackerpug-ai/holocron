# D04-04 — Configure scheduled restic blob mirror with SHA-256 parity

## What this does

Configure a scheduled restic blob-mirror job over the content-addressed blob store (`services/platform/src/blob/` — `file_objects`) to the R2 bucket (separate prefix, encrypted), with every local↔remote object **SHA-256 parity-verified** after each run. On parity confirmation the job upserts `backup_heartbeat` for `job_name='restic_blob_mirror'` and emits an OTel span — the same heartbeat substrate D04-05 alerts on.

Provides: a restic repository on R2 (encrypted, separate prefix from pgBackRest); a scheduled (launchd) `restic backup` job over the blob store; a post-backup SHA-256 parity check (local hash set == remote hash set); the `restic_blob_mirror` heartbeat row; OTel span emission.

> **Platform seam (folded from mastra-implementer).** The restic job upserts `backup_heartbeat` for `job_name='restic_blob_mirror'` with `last_snapshot_id` + `object_count`; `last_success_at` is set ONLY after the SHA-256 parity check passes (never before). Idempotent `INSERT ... ON CONFLICT (job_name) DO UPDATE`; re-sync of unchanged objects is a no-op (restic is content-addressed). Span `name='backup:restic_blob_mirror'` via `langfuse-exporter.ts`, `trace_id` on the heartbeat row.

## Why

- CAP-BAK-01 boundary contract: the blob mirror content hash matches the source for every object — a restore must reproduce the blob store bit-for-bit.
- Skipping the hash compare is exactly the fake-healthy stub the gate rejects ("report success without parity").
- The heartbeat lets D04-05 detect a stalled/dead mirror (overdue) without polling a dashboard.
- Grounded in: UC-PLAT-06, T-PLAT-023, CAP-BAK-01.

## How to verify

- the restic repo is on R2 under a separate prefix (not the pgBackRest prefix), encrypted (`RESTIC_PASSWORD` set, no plaintext repo)
- after a scheduled run: `restic snapshots` returns ≥1; `restic check --read-data` exits 0; the SHA-256 set of local blob objects equals the set read from the remote snapshot
- `backup_heartbeat` for `job_name='restic_blob_mirror'` shows a recent `last_success_at`, a valid `last_snapshot_id`, `status='success'`, set only after parity passed

## Scope

Writes: `services/platform/src/backup/restic-mirror.ts` (NEW), `services/platform/src/backup/parity-check.ts` (NEW — local vs remote SHA-256 set compare), `services/platform/src/cli/holo.ts` (MODIFY — `holo backup:mirror`, reuse `holo backup:status`), a launchd job for the mirror schedule, restic repo init + `RESTIC_PASSWORD` in the secrets store

Prohibited: `restic backup` without the post-run `restic check --read-data` + parity compare; setting the heartbeat before parity passes; a plaintext (unencrypted) restic repo

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: D04-04 — Configure scheduled restic blob mirror with SHA-256 parity
================================================================================

TASK_TYPE:  INFRA
STATUS:     Completed
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 27 — Standing Off-Mini Backup Pipeline and Alerting](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
A scheduled restic blob mirror to R2 (separate encrypted prefix) with SHA-256 parity verified after every run; the local hash set equals the remote hash set; `backup_heartbeat` for `restic_blob_mirror` updated only after parity passes; an OTel span emitted. Proven against real blob storage + real R2.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST run a scheduled (launchd) `restic backup` job over `services/platform/src/blob/`
- MUST store the restic repo on R2 under a separate prefix from pgBackRest, encrypted (`RESTIC_PASSWORD` in the secrets store)
- MUST run `restic check --read-data` and a SHA-256 parity compare after each backup
- MUST upsert `backup_heartbeat` for `restic_blob_mirror` with `last_snapshot_id`, `object_count`, `last_success_at`, `status` ONLY after parity passes
- MUST emit an OTel span `backup:restic_blob_mirror` carrying job_name, status, snapshot id, storing trace_id on the heartbeat
- NEVER skip the hash compare or `restic check --read-data`
- NEVER set the heartbeat before parity confirmation
- NEVER use a plaintext (unencrypted) restic repo
- STRICTLY parity is computed from real local files vs the real remote snapshot (not asserted from restic exit code alone)
- STRICTLY the heartbeat upsert is idempotent (ON CONFLICT); unchanged objects re-sync as a no-op
- STRICTLY the restic password is NOT co-located with the backups it protects (D04-06 audits)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): restic snapshot in R2 + SHA-256 parity verified (local set == remote set)
- [x] AC-2: `restic_blob_mirror` heartbeat updated after parity + OTel span emitted
- [x] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — proven by real blob store + real R2)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] restic snapshot in R2 + SHA-256 parity (flow_ref T-PLAT-023)
  GIVEN the blob store has objects and R2 is reachable
  WHEN  the scheduled restic backup job runs
  THEN  restic creates a snapshot in R2; `restic check --read-data` exits 0; the SHA-256 hash set of local blob objects equals the SHA-256 hash set read from the remote snapshot (no missing/extra/mismatched object)
  TEST_TIER: integration · VERIFICATION_SERVICE: restic+R2 · TDD_STATE: red
  SCENARIO — start_ref: blob_store_populated · evidence: stdout
    NEGATIVE_CONTROL: would fail if restic backup skips --read-data verification; the hash compare is bypassed; parity is asserted from restic exit code alone; a local object is missing remotely (silent drop); a stub/static implementation that hardcodes a healthy result with no real service round-trip
    MUST_OBSERVE: restic snapshots returns one or more; restic check --read-data exit 0; local SHA-256 set == remote SHA-256 set (equal counts + every hash present both sides)
    MUST_NOT_OBSERVE: a hash mismatch (local object not in remote set); restic check --read-data failure; an extra/missing object between sets; restic snapshot count zero

AC-2 heartbeat updated after parity + OTel span (flow_ref T-PLAT-023)
  GIVEN AC-1 parity passed
  WHEN  the mirror job finishes
  THEN  `backup_heartbeat` for `job_name='restic_blob_mirror'` shows `last_snapshot_id` = the restic snapshot id, `object_count` = the verified object count, `last_success_at` within the run window, `status='success'`; an OTel span `backup:restic_blob_mirror` is emitted with trace_id stored on the heartbeat
  TEST_TIER: integration · VERIFICATION_SERVICE: Postgres+OTel · TDD_STATE: red
  SCENARIO — start_ref: parity_confirmed · evidence: db_query
    NEGATIVE_CONTROL: would fail if the heartbeat is set before parity passes; the span is missing; trace_id is not correlated; a stub/static implementation that hardcodes a healthy result with no real service round-trip
    MUST_OBSERVE: backup_heartbeat restic_blob_mirror.last_snapshot_id matches the restic snapshot id; object_count matches the verified count; last_success_at fresh; status='success'; span backup:restic_blob_mirror present; trace_id matches
    MUST_NOT_OBSERVE: last_snapshot_id NULL or mismatched; heartbeat set before parity; status='failed' on a successful mirror; no span / missing trace_id

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/backup/restic-mirror.ts (NEW)
- services/platform/src/backup/parity-check.ts (NEW)
- services/platform/src/cli/holo.ts (MODIFY — holon backup:mirror | reuse backup:status)
- restic repo init + RESTIC_PASSWORD in secrets store + a launchd schedule
writeProhibited: restic backup without --read-data + parity; heartbeat before parity; plaintext restic repo; services/platform/src/blob/** (MODIFY — Sprint 14 owns the blob store; this task only reads it)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:63-72 [CAP-BAK-01: blob store → restic snapshot → remote bucket, hash matches source]
2. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/11-e2e-testing-criteria.md:53-59 [T-PLAT-023 blob mirror, hash-verified]
3. /Users/inference1/Projects/holocron/services/platform/src/blob/ [the content-addressed blob store this mirror reads — file_objects]
4. /Users/inference1/Projects/holocron/services/platform/src/observability/langfuse-exporter.ts:1-60 [OTel span pattern]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Snapshot + parity: `restic snapshots | grep -E 'snapshot|ID'` non-empty; `restic check --read-data` exit 0; local SHA-256 set == remote set (script compares the two)
- Heartbeat: `SELECT last_snapshot_id, object_count, last_success_at, status FROM backup_heartbeat WHERE job_name='restic_blob_mirror'` → last_snapshot_id matches, fresh, status=success
- Encryption: restic repo on R2 separate prefix; `RESTIC_PASSWORD` in secrets store (not in the repo prefix)
- OTel: span backup:restic_blob_mirror present; backup_heartbeat.trace_id matches

--------------------------------------------------------------------------------
REVIEW (code-reviewer)
--------------------------------------------------------------------------------
Must pass: SHA-256 parity computed from real local files vs the real remote snapshot (not from restic exit code); heartbeat set only after parity; restic check --read-data exit 0; repo encrypted + separate prefix; password not co-located; heartbeat upsert idempotent.
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D04-02 · Blocks: D04-05

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D04-04",
  "proposed_by": "devops-engineer",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "blob_store_populated": {
      "description": "The content-addressed blob store (services/platform/src/blob, file_objects) has one or more objects to mirror",
      "seed_method": "public_api",
      "records": [
        "file_objects has rows",
        "the blob backing files exist on disk"
      ]
    },
    "parity_confirmed": {
      "description": "A restic backup completed and the local SHA-256 set equals the remote set",
      "seed_method": "public_api",
      "records": [
        "restic snapshots returns >=1",
        "restic check --read-data exit 0",
        "local hash set == remote hash set"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-023",
      "description": "GIVEN the blob store has objects + R2 reachable WHEN the scheduled restic backup runs THEN restic creates a snapshot in R2; restic check --read-data exits 0; the local SHA-256 set equals the remote SHA-256 set",
      "verify": "restic snapshots non-empty; restic check --read-data exit 0; local SHA-256 set == remote SHA-256 set",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "restic+R2",
        "flow_ref": "T-PLAT-023",
        "negative_control": {
          "would_fail_if": [
            "restic backup skips --read-data verification",
            "hash compare bypassed",
            "parity asserted from restic exit code alone",
            "a local object is missing remotely (silent drop)",
            "a stub/static implementation that hardcodes a healthy result with no real service round-trip"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "blob_store_populated",
            "action": {
              "actor": "system",
              "steps": [
                "trigger restic backup to R2 (separate encrypted prefix)",
                "restic completes the snapshot",
                "compute the local SHA-256 set",
                "read the remote SHA-256 set from the snapshot",
                "assert the sets are equal",
                "run restic check --read-data"
              ]
            },
            "end_state": {
              "must_observe": [
                "restic snapshots count >= 1",
                "restic check --read-data exit 0",
                "local SHA-256 set == remote SHA-256 set (equal counts, every hash on both sides)"
              ],
              "must_not_observe": [
                "restic snapshots count: (0)",
                "restic check --read-data exit non-zero",
                "hash mismatch / missing object between local and remote sets",
                "empty remote hash set"
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
      "flow_ref": "T-PLAT-023",
      "description": "GIVEN parity passed WHEN the mirror job finishes THEN backup_heartbeat restic_blob_mirror.last_snapshot_id = restic snapshot id, object_count = verified count, last_success_at fresh, status=success; span backup:restic_blob_mirror emitted with trace_id on the heartbeat",
      "verify": "SELECT from backup_heartbeat WHERE job_name='restic_blob_mirror' matches snapshot id + fresh + status=success; span present; trace_id matches",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres+OTel",
        "flow_ref": "T-PLAT-023",
        "negative_control": {
          "would_fail_if": [
            "heartbeat set before parity passes",
            "span missing",
            "trace_id not correlated",
            "a stub/static implementation that hardcodes a healthy result with no real service round-trip"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "parity_confirmed",
            "action": {
              "actor": "system",
              "steps": [
                "upsert backup_heartbeat restic_blob_mirror (last_snapshot_id, object_count, last_success_at, status=success)",
                "emit OTel span backup:restic_blob_mirror",
                "store trace_id on the heartbeat"
              ]
            },
            "end_state": {
              "must_observe": [
                "backup_heartbeat.restic_blob_mirror.last_snapshot_id == restic snapshot id (len >= 8)",
                "object_count == verified restic object count (integer match)",
                "last_success_at age_seconds < 900",
                "status: 'success'",
                "span name: \"backup:restic_blob_mirror\" count >= 1",
                "heartbeat.trace_id == span.trace_id (hex len >= 16)"
              ],
              "must_not_observe": [
                "last_snapshot_id: empty / NULL / Status=None / mismatched",
                "heartbeat written before parity confirmed",
                "status: 'failed' on a successful mirror",
                "span count: (0) / missing trace_id"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Restic snapshot + SHA-256 parity verified",
      "maps_to_ac": "AC-1",
      "verify": "restic snapshots non-empty; restic check --read-data exit 0; local SHA-256 set == remote set"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Heartbeat updated after parity + OTel span correlated",
      "maps_to_ac": "AC-2",
      "verify": "backup_heartbeat restic_blob_mirror matches snapshot id + fresh + status=success; span present; trace_id matches"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Restic repo encrypted on a separate R2 prefix",
      "maps_to_ac": "AC-1",
      "verify": "repo on R2 restic prefix (not pgbackrest); RESTIC_PASSWORD in secrets store; not plaintext"
    }
  ]
}
-->
</details>
