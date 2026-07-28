# D04-03 — Configure continuous WAL archiving + scheduled base backups

## What this does

Configure continuous Postgres WAL archiving (`archive_command` → `pgbackrest archive-push`) and a scheduled full/incremental base-backup job to the R2 repo from D04-02 — proven under real write traffic with **zero WAL-continuity gaps**. Each successful archive/backup emits an OTel span and upserts a `backup_heartbeat` row so D04-05 can detect failure/overdue without dashboard polling.

Provides: Postgres `archive_mode=always` + `archive_command` calling pgBackRest; a scheduled (launchd) base-backup job; the `backup_heartbeat` table (`job_name`, `last_success_at`, `last_wal_segment`, `last_snapshot_id`, `object_count`, `status`); OTel span emission for `wal_archive` and `base_backup` jobs via `services/platform/src/observability/`.

> **Platform seam (folded from mastra-implementer, CAP-BAK-01 co-owner).** The WAL/base-backup job writes a structured last-success row to `backup_heartbeat(job_name TEXT PK, last_success_at TIMESTAMPTZ, last_wal_segment TEXT, last_snapshot_id TEXT, object_count BIGINT, status TEXT, updated_at TIMESTAMPTZ)` via idempotent `INSERT ... ON CONFLICT (job_name) DO UPDATE`. `last_success_at` is set ONLY after pgBackRest confirms the WAL segment / backup landed in R2 — never a synthetic 'ok' (anti-fake-healthy). The job emits a root span `name='backup:wal_archive'` / `'backup:base_backup'` through `langfuse-exporter.ts` (rhyme with HolocronLangfuseExporter span buffering; `redactForExport` on WAL paths), storing `trace_id` on the heartbeat row for alert↔trace correlation.

## Why

- WAL continuity with no gap across the retention window is a CAP-BAK-01 boundary contract — a silent gap means a restore can't reach the desired point in time.
- The heartbeat is what lets D04-05 detect failure/overdue (and the credential-expiry / config-removed silent failures) without a human polling a dashboard.
- `archive_command` must never be a no-op (`/bin/true`) — that is exactly the fake-healthy stub the gate rejects.
- Grounded in: UC-PLAT-06, T-PLAT-021, CAP-BAK-01.

## How to verify

- `SHOW archive_mode` returns `always`; `SHOW archive_command` contains `pgbackrest archive-push`
- after a write burst: the R2 WAL object count increases and the latest local WAL segment equals `backup_heartbeat.last_wal_segment` for `job_name='wal_archive'`, with `last_success_at` within the last minute and `status='success'`
- `pg_stat_archiver.last_archived_wal` advances with no `failed_count` growth; segment N is followed by N+1 with no gap
- the scheduled base-backup job produces a `pgbackrest backup` manifest in R2; `backup_heartbeat` for `job_name='base_backup'` shows a recent `last_success_at`

## Scope

Writes: `services/platform/src/backup/wal-archive.ts` (NEW), `services/platform/src/backup/base-backup.ts` (NEW), `services/platform/src/backup/heartbeat.ts` (NEW — the `backup_heartbeat` upsert + read), `services/platform/src/db/schema/backup.ts` (NEW — `backup_heartbeat` table), `services/platform/src/cli/holo.ts` (MODIFY — `holo backup:wal`, `holo backup:base`, `holo backup:status`), Postgres `archive_*` settings + a launchd job for the base-backup schedule

Prohibited: `archive_command = '/bin/true'` or any no-op, setting `backup_heartbeat.last_success_at` without confirming the WAL/backup landed in R2

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: D04-03 — Configure continuous WAL archiving + scheduled base backups
================================================================================

TASK_TYPE:  INFRA
STATUS:     Completed
PRIORITY:   P0
EFFORT:     L  (150 min)
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
Continuous WAL archiving to R2 via pgBackRest with no continuity gap under real write traffic; a scheduled full/incremental base-backup job landing in R2; a `backup_heartbeat` row updated (idempotently) only after R2 confirmation for `wal_archive` and `base_backup`; an OTel span emitted per job. All proven against real Postgres + real R2.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST set Postgres `archive_mode=always` and an `archive_command` that calls `pgbackrest archive-push`
- MUST run a scheduled (launchd) full/incremental base-backup job to the R2 repo
- MUST maintain WAL continuity (no gap) across the retention window
- MUST upsert `backup_heartbeat` for `wal_archive` and `base_backup` with `last_success_at`, `last_wal_segment`/`last_snapshot_id`, `object_count`, `status`
- MUST set `backup_heartbeat.last_success_at` ONLY after pgBackRest confirms the WAL/backup landed in R2 (anti-fake-healthy)
- MUST emit an OTel span (`backup:wal_archive` / `backup:base_backup`) carrying job_name, status, segment/snapshot id, storing trace_id on the heartbeat row
- NEVER set `archive_command` to `/bin/true` or any no-op
- NEVER update the heartbeat before R2 confirmation
- NEVER leave a WAL-continuity gap (segment N must be followed by N+1)
- STRICTLY `pg_stat_archiver` is read for real archive progress (last_archived_wal, failed_count), not asserted from config
- STRICTLY heartbeat upsert is `INSERT ... ON CONFLICT (job_name) DO UPDATE` (idempotent; re-runs update the same row)
- STRICTLY the OTel span attributes are redacted (no bucket creds / hostnames in WAL paths)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): WAL archives continuously to R2 with no continuity gap + heartbeat updates
- [x] AC-2: scheduled base-backup job lands in R2, manifest-verified + heartbeat updates
- [x] AC-3: backup span (local jsonl + optional Langfuse) per job + correlated to the heartbeat row
- [x] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — proven by real Postgres + real R2)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] continuous WAL archiving, no gap, heartbeat updates (flow_ref T-PLAT-021)
  GIVEN Postgres running with archive_mode=always and the pgBackRest repo from D04-02
  WHEN  a write burst generates WAL segments and archive_command fires
  THEN  each WAL segment lands in R2; the R2 WAL object count increases; `pg_stat_archiver.last_archived_wal` advances with no `failed_count` growth; `backup_heartbeat` for `job_name='wal_archive'` shows `last_wal_segment` = the latest WAL filename, `last_success_at` within the last minute, `status='success'`; segment N is followed by N+1 (no gap)
  TEST_TIER: integration · VERIFICATION_SERVICE: Postgres+pgBackRest+R2 · TDD_STATE: red
  SCENARIO — start_ref: postgres_wal_archiving_running · evidence: db_query
    NEGATIVE_CONTROL: would fail if archive_command is a no-op (`/bin/true`); pgBackRest push disabled; the heartbeat is updated before R2 confirms receipt; WAL segments are skipped (gap)
    MUST_OBSERVE: R2 WAL object count increases by one or more after a write burst; backup_heartbeat.last_wal_segment equals the latest WAL filename; last_success_at within now() - interval '1 minute'; status='success'; pg_stat_archiver.last_archived_wal advances; failed_count does not grow
    MUST_NOT_OBSERVE: a WAL-continuity gap (segment N+1 missing); last_success_at NULL or older than 15 minutes; status='failed' during a healthy run; archive_command = /bin/true

AC-2 scheduled base-backup lands in R2, manifest-verified (flow_ref T-PLAT-021)
  GIVEN the WAL archiving from AC-1 is running
  WHEN  the scheduled base-backup job runs
  THEN  `pgbackrest backup` writes a full/incremental backup to R2 with a manifest; `backup_heartbeat` for `job_name='base_backup'` shows a recent `last_success_at`, a valid `last_snapshot_id`, `status='success'`
  TEST_TIER: integration · VERIFICATION_SERVICE: pgBackRest+R2 · TDD_STATE: red
  SCENARIO — start_ref: wal_archiving_running · evidence: db_query
    NEGATIVE_CONTROL: would fail if the base-backup job is a no-op/stub; the manifest is missing; the heartbeat is set without a real backup completing
    MUST_OBSERVE: pgbackrest backup exits 0 and writes a manifest to R2; aws s3 ls shows the backup object; backup_heartbeat base_backup.last_snapshot_id is non-empty; last_success_at recent; status='success'
    MUST_NOT_OBSERVE: base-backup job no-op; missing manifest; last_snapshot_id NULL; status='failed' on a successful run

AC-3 Backup span emitted per job, correlated to the heartbeat (local-only when Langfuse disabled) (flow_ref T-PLAT-021)
  GIVEN a WAL archive or base backup completed
  WHEN  the job finishes
  THEN  a backup span `backup:wal_archive`/`backup:base_backup` is always written (local jsonl under `.tmp/D04-03/backup-spans.jsonl` + job result) carrying redacted job_name, status, segment/snapshot id and a hex trace_id; the heartbeat row carries the matching trace_id. When LANGFUSE_PUBLIC_KEY/SECRET_KEY/BASE_URL are configured, HolocronLangfuseExporter flushes with exportOk=true and exportError=null. When Langfuse is disabled/unconfigured, exportOk=false with exportError describing local-only mode — never claims Langfuse success while disabled (Path B honesty; REDHAT-FIX-S27-13).
  TEST_TIER: integration · VERIFICATION_SERVICE: backup-span+filesystem(+Langfuse when configured) · TDD_STATE: green
  SCENARIO — start_ref: backup_job_completed · evidence: event_log
    NEGATIVE_CONTROL: would fail if the span is emitted but not correlated to the heartbeat (no trace_id); attributes contain unredacted credentials/hostnames; exportOk hardcoded true while exportError says disabled; a stub/static implementation that hardcodes a healthy result with no real service round-trip
    MUST_OBSERVE: a span with name=backup:wal_archive|backup:base_backup exists; span attributes include job_name, status, segment/snapshot id; backup_heartbeat.trace_id matches the span trace id; attributes redacted (no creds/hostnames); exportOk consistent with exportError
    MUST_NOT_OBSERVE: no span emitted; trace_id missing from the heartbeat; unredacted credential/hostname in attributes; exportOk=true with exportError set

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/backup/wal-archive.ts (NEW)
- services/platform/src/backup/base-backup.ts (NEW)
- services/platform/src/backup/heartbeat.ts (NEW)
- services/platform/src/db/schema/backup.ts (NEW — backup_heartbeat table)
- services/platform/src/cli/holo.ts (MODIFY — holon backup:wal | backup:base | backup:status)
- Postgres archive_* settings + a launchd base-backup schedule
writeProhibited: archive_command = '/bin/true' or any no-op; heartbeat last_success_at set before R2 confirmation; services/platform/src/db/schema/* (non-backup tables — Sprint 04 owns the domain schema)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:63-72 [CAP-BAK-01 hops + boundary: WAL continuity no gap; failure mode WAL behind → alert]
2. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/11-e2e-testing-criteria.md:53-59 [T-PLAT-021 WAL+base backups to remote bucket]
3. /Users/inference1/Projects/holocron/services/platform/src/observability/langfuse-exporter.ts:1-60 [OTel/Langfuse span emission pattern — redactForExport]
4. /Users/inference1/Projects/holocron/services/platform/src/stack/probes.ts:88-162 [honest-health probe pattern the heartbeat should rhyme with]
5. /Users/inference1/Projects/holocron/services/platform/src/cli/holo.ts:1831-1900 [stack/launchd + secrets patterns to reuse for the backup schedule]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- WAL archiving configured: `psql -c "SHOW archive_mode"` → always; `psql -c "SHOW archive_command"` → contains pgbackrest archive-push
- No-gap WAL + heartbeat: write burst → `SELECT last_wal_segment, last_success_at, status FROM backup_heartbeat WHERE job_name='wal_archive'` returns last_success_at within 1 min, status=success, last_wal_segment = latest WAL; `pg_stat_archiver` last_archived_wal advances, failed_count stable
- Base backup in R2: `pgbackrest backup` exit 0; `aws s3 ls "$R2_BUCKET/pgbackrest/backup/"` non-empty; `backup_heartbeat` base_backup.last_snapshot_id non-empty
- OTel span: a span named backup:wal_archive|backup:base_backup present; `backup_heartbeat.trace_id` matches; attributes redacted

--------------------------------------------------------------------------------
REVIEW (code-reviewer)
--------------------------------------------------------------------------------
Must pass: archive_command is real pgBackRest (not /bin/true); WAL continuity has no gap (pg_stat_archiver real); heartbeat last_success_at set only after R2 confirmation; base-backup manifest present; OTel span correlated + redacted; heartbeat upsert idempotent (ON CONFLICT).
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D04-02 · Blocks: D04-05

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D04-03",
  "proposed_by": "devops-engineer",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "postgres_wal_archiving_running": {
      "description": "Postgres running with archive_mode=always and archive_command -> pgbackrest archive-push, repo from D04-02",
      "seed_method": "public_api",
      "records": [
        "SHOW archive_mode = always",
        "SHOW archive_command contains pgbackrest archive-push",
        "pgBackRest stanza exists (D04-02)"
      ]
    },
    "wal_archiving_running": {
      "description": "WAL archiving active: segments are being pushed to R2",
      "seed_method": "public_api",
      "records": [
        "pg_stat_archiver.last_archived_wal advances",
        "R2 WAL object count increasing"
      ]
    },
    "backup_job_completed": {
      "description": "A WAL archive or base backup job just completed successfully against R2",
      "seed_method": "public_api",
      "records": [
        "pgbackrest confirmed receipt in R2",
        "heartbeat upserted for wal_archive|base_backup"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-021",
      "description": "GIVEN Postgres with archive_mode=always + pgBackRest repo WHEN a write burst generates WAL THEN each segment lands in R2; R2 WAL count increases; pg_stat_archiver.last_archived_wal advances with no failed_count growth; backup_heartbeat wal_archive.last_wal_segment = latest WAL; last_success_at within 1 min; status=success; segment N followed by N+1 (no gap)",
      "verify": "SHOW archive_mode=always; SHOW archive_command contains archive-push; after burst: R2 WAL count up; SELECT from backup_heartbeat WHERE job_name='wal_archive' fresh + status=success; pg_stat_archiver last_archived_wal advances, failed_count stable",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres+pgBackRest+R2",
        "flow_ref": "T-PLAT-021",
        "negative_control": {
          "would_fail_if": [
            "archive_command is a no-op (/bin/true)",
            "pgBackRest push disabled",
            "heartbeat updated before R2 confirms receipt",
            "WAL segments skipped (gap)"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_wal_archiving_running",
            "action": {
              "actor": "system",
              "steps": [
                "generate WAL traffic (pgbench / writes)",
                "archive_command -> pgbackrest archive-push",
                "pgBackRest confirms the segment in R2",
                "INSERT ... ON CONFLICT (job_name) DO UPDATE backup_heartbeat SET last_success_at=now(), last_wal_segment=<wal>, status='success'",
                "emit OTel span backup:wal_archive"
              ]
            },
            "end_state": {
              "must_observe": [
                "R2 WAL object_count increases by >= 1 after archive-push",
                "backup_heartbeat.last_wal_segment: non-empty WAL filename (e.g. \"000000010000000000000001\")",
                "last_success_at within now()-interval '1 minute' (age_seconds < 60)",
                "status: 'success'",
                "pg_stat_archiver.last_archived_wal advances (failed_count delta: 0)"
              ],
              "must_not_observe": [
                "WAL object_count delta: (0) after archive-push",
                "last_wal_segment: empty / Status=None",
                "last_success_at NULL or age > 15 minutes",
                "status: 'failed' during healthy run",
                "archive_command: '/bin/true'"
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
      "flow_ref": "T-PLAT-021",
      "description": "GIVEN WAL archiving running WHEN the scheduled base-backup job runs THEN pgbackrest backup writes a full/incremental backup to R2 with a manifest; backup_heartbeat base_backup.last_snapshot_id non-empty; last_success_at recent; status=success",
      "verify": "pgbackrest backup exit 0; aws s3 ls backup object present; SELECT base_backup heartbeat last_snapshot_id non-empty + fresh + status=success",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "pgBackRest+R2",
        "flow_ref": "T-PLAT-021",
        "negative_control": {
          "would_fail_if": [
            "base-backup job is a no-op/stub",
            "manifest missing",
            "heartbeat set without a real backup completing"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "wal_archiving_running",
            "action": {
              "actor": "system",
              "steps": [
                "scheduled launchd job runs pgbackrest backup",
                "backup + manifest written to R2",
                "upsert backup_heartbeat base_backup with last_snapshot_id, last_success_at, status=success",
                "emit OTel span backup:base_backup"
              ]
            },
            "end_state": {
              "must_observe": [
                "pgbackrest backup --type=full exit 0",
                "aws s3 ls backup prefix object_count >= 1 (manifest present)",
                "backup_heartbeat.base_backup.last_snapshot_id: non-empty (len >= 8)",
                "last_success_at age_seconds < 900",
                "status: 'success'"
              ],
              "must_not_observe": [
                "base-backup job no-op / exit non-zero",
                "backup prefix object_count: (0)",
                "last_snapshot_id: empty / NULL / Status=None",
                "status: 'failed' on a successful run"
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
      "flow_ref": "T-PLAT-021",
      "description": "GIVEN a WAL archive or base backup completed WHEN the job finishes THEN an OTel span backup:wal_archive|backup:base_backup is emitted carrying job_name, status, segment/snapshot id; the heartbeat row carries the matching trace_id",
      "verify": "span name=backup:wal_archive|backup:base_backup present; attributes include job_name,status,segment/snapshot id; backup_heartbeat.trace_id matches; attributes redacted",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "OTel+langfuse",
        "flow_ref": "T-PLAT-021",
        "negative_control": {
          "would_fail_if": [
            "span emitted but not correlated to heartbeat (no trace_id)",
            "attributes contain unredacted credentials/hostnames",
            "a stub/static implementation that hardcodes a healthy result with no real service round-trip"
          ]
        },
        "evidence": {
          "artifact_type": "event_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "backup_job_completed",
            "action": {
              "actor": "system",
              "steps": [
                "build span with redacted attributes",
                "flush via langfuse-exporter",
                "store trace_id on backup_heartbeat"
              ]
            },
            "end_state": {
              "must_observe": [
                "span name: \"backup:wal_archive\" or \"backup:base_backup\" count >= 1",
                "span attributes include \"job_name\", \"status\", segment/snapshot id",
                "backup_heartbeat.trace_id matches span trace_id (hex len >= 16)",
                "attributes redacted: credential count (0), hostname count (0)"
              ],
              "must_not_observe": [
                "span count: (0) / no span emitted",
                "trace_id: empty / Status=None on heartbeat",
                "unredacted credential or hostname in span attributes"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Continuous WAL archiving with no gap + heartbeat",
      "maps_to_ac": "AC-1",
      "verify": "SHOW archive_mode=always; after burst: R2 WAL count up; backup_heartbeat wal_archive fresh + status=success + last_wal_segment=latest; pg_stat_archiver advances, failed_count stable"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Scheduled base backup lands in R2 + heartbeat",
      "maps_to_ac": "AC-2",
      "verify": "pgbackrest backup exit 0; R2 backup object present; base_backup heartbeat last_snapshot_id non-empty + fresh"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "OTel span emitted + correlated to heartbeat + redacted",
      "maps_to_ac": "AC-3",
      "verify": "span backup:wal_archive|backup:base_backup present; backup_heartbeat.trace_id matches; attributes redacted"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Heartbeat upsert is idempotent",
      "maps_to_ac": "AC-1",
      "verify": "INSERT ... ON CONFLICT (job_name) DO UPDATE — re-runs update the same row, no duplicates"
    }
  ]
}
-->
</details>
