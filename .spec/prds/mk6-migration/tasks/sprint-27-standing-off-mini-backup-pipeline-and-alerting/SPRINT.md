---
sequence: 27
timeline: Phase 6 — Standing Backup and Disaster Recovery
status: Completed
planned_from_roadmap_sha: 68052e642fdd86c4e8df21b9b5c46479ca623cd0297881d47e3dace46a6a0fa5
planned_from_source_sha: cb4e9183ecb1535d24d25e8a77d51c0929f1e712
source_kind: git-head
planned_at: 2026-07-24T23:22:56Z
---

# Sprint 27: Standing Off-Mini Backup Pipeline and Alerting

**Sequence:** 27
**Timeline:** Phase 6 — Standing Backup and Disaster Recovery
**Status:** Completed
> Progress: 7/7 tasks completed · updated 2026-07-28T05:01:12Z
> Status-Note: goal met — CAP-BAK-01 pipeline + alerts; status-file parity healed
**Proposed by:** devops-engineer
**Milestone:** — (`sprint-27`)
**Branch:** `mk6-backup`
**PR:** —

## Overview

Sprint 27 is the **standing off-mini backup pipeline** sprint — it stands up **CAP-BAK-01**: continuous Postgres WAL archiving + scheduled base backups (pgBackRest → R2) and a scheduled restic blob mirror, plus failure/overdue alerting that needs no human dashboard polling. This is a **standing platform capability** that runs in parallel with feature work and **outlasts the migration** — it is *not* a cutover-only safety net. It gates the final decommission (Sprint 31), not the feature build. The point-in-time *restore drill* (T-PLAT-022) is deliberately deferred to Sprint 28, which consumes this pipeline as its final gate.

**What is already proven before this sprint.** Sprint 04 provisioned Postgres 18 (`PGDATA` at `/usr/local/var/postgres`, `wal_level=logical`, the `zero_pub` publication over the reactive subset) and the `file_objects` content-addressed blob store (`services/platform/src/blob/`). Sprint 06 stood up the headless mini deployment: the four launchd plists (`~/Library/LaunchAgents/holocron-{postgres,mastra,scheduler,zerocache}.plist`), the `holo` stack CLI (`services/platform/src/cli/holo.ts` — `stack:up|down|status`, `db:status|migrate|probe|verify`, `blob:verify`), the consolidated secrets store (`holo secrets` / `holo secrets:doctor`), and the OTel observability substrate (`services/platform/src/observability/`). None of these is backup-specific: there is **no `services/platform/src/backup/` module, no `holo backup:*` command, and no R2/object-storage config** in the tree today — all of that is greenfield this sprint.

**What this sprint does.** (1) **D04-02** — provision an encrypted Cloudflare R2 bucket, scoped credentials (least-privilege, separate from app secrets), and the pgBackRest remote-repo configuration pointing at it. (2) **D04-03** — continuous Postgres WAL archiving (`archive_command` → `pgbackrest archive-push`) plus a scheduled full/incremental base-backup job, proven under real write traffic with **zero WAL-continuity gaps**. (3) **D04-04** — a scheduled restic blob-mirror job over `services/platform/src/blob/` content-addressed storage, with every local↔remote object **SHA-256 parity-verified**. (4) **D04-05** — failure/overdue alerting (webhook/push) that fires within 15 minutes of a missed/failed backup with **no dashboard polling** — including the credential-expiry and config-removed failure modes that must never go silently healthy. (5) **D04-01** — the RED integration test that *proves* the gate: an induced backup-job failure MUST alert and a healthy run MUST stay silent (the anti-fake-healthy negative control). (6) **D04-06** — an adversarial security review of the R2 bucket credentials, scoping, and encryption.

The gate is one un-fakeable outcome: **an operator who induces a backup-job failure gets an alert firing within 15 minutes, with zero dashboard-polling required** — and the three silent-failure modes the PRD calls out (WAL falls behind, credential expires, config removed) each surface as a loud alert, never a false-healthy state. The sprint owns **CAP-BAK-01** end-to-end (WAL+base backups via pgBackRest→R2, blob mirror via restic, failure/overdue alerting); the restore half of the capability (T-PLAT-022) is Sprint 28.

> **Dependency caveat (advisor, non-blocking).** Sprint 27 depends on Sprint 04 (✅ Completed — Postgres + blob store) and Sprint 06 (✅ Completed — launchd + `holo` CLI + secrets). This JIT expansion is planned against the current committed state (`cb4e9183`); it assumes R2 credentials are obtainable and that pgBackRest/restic binaries are installable on the mini. If the Sprint 06 secrets-store shape or the `holo.ts` CLI command pattern drifts, re-run `/kb-sprint-tasks-plan --sprint 27 --only D04-02,D04-05 --overwrite` to refresh those two tasks.

## Human Testing Gate

**Gate:** An operator who induces a backup-job failure gets an alert firing within 15 minutes, with zero dashboard-polling required.

## Human Test Deliverable

1. Run a live Postgres write burst via `holo backup:wal --json` — WAL archives to R2 continuously, zero continuity gaps (assert status=success, continuityOk, R2 growth, writeBurstRows≥1).
2. Run the scheduled base-backup job — full backup lands in the R2 bucket, verified by manifest.
3. Run the restic blob-mirror job — every local/remote object SHA-256 matches.
4. Kill the backup job mid-archive — alert fires within 15 minutes, no dashboard-polling needed.
5. Let the bucket credential expire in a test fixture — alert fires, not a silent failure.
6. Remove the backup config entirely — the alert still fires as overdue, never a false-healthy state.
7. Healthy-run zero-alert silence gate (REDHAT-FIX-S27-06 / D04-05 AC-4): `bun services/platform/src/cli/holo.ts backup:healthy --all && bun services/platform/src/cli/holo.ts backup:alert-sweep --json | jq -e '.alerted==0 and (.posts|length)==0'` — after S27-04 reset, assert `alerted: 0` and zero `post[]` lines (NEVER-tier silence; always-alert cannot pass).
8. Execute the D04-01 RED integration suite (`PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts`) — healthy silence + three failure modes against a real `http.Server`; dual-write vitest transcript and `.tmp/D04-01/*` webhook captures into `.gate-evidence/<run>/red-suite/` (expected_exit 0). Short windows are **non-SLA mechanics only**.
9. Install and verify the launchd alert-sweep schedule (`bun services/platform/src/cli/holo.ts backup:alert-sweep --install-schedule`) — `holocron-backup-alert-sweep` loaded under `gui/$UID` with StartInterval ≤300s and `ALERT_WEBHOOK_URL` present in the installed LaunchAgents plist EnvironmentVariables (not optional; standing CAP-BAK-01 daemon).
10. **Production 15-minute alert SLA** (REDHAT-FIX-S27-08 / F-8 / T-PLAT-024): `env -u BACKUP_ALERT_OVERDUE_MS` → `backup:alert-sweep --json` reports `overdueMs >= 900000` (`DEFAULT_OVERDUE_MS`); induce stale `last_success_at` age >15m; assert `overdue_by_minutes >= 15` + real independent webhook HTTP POST (`method`/`url`/`headers`/`receivedAt`) within the 15m window. Toy `BACKUP_ALERT_OVERDUE_MS=500/1000` steps are not SLA proof.

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| D04-01 | RED: induced backup failure must alert, healthy run must stay silent | red-test-generator | 75 min |
| D04-02 | Provision encrypted R2 bucket + scoped credentials + pgBackRest repo config | devops-engineer | 120 min |
| D04-03 | Configure continuous WAL archiving + scheduled base backups | devops-engineer | 150 min |
| D04-04 | Configure scheduled restic blob mirror with SHA-256 parity | devops-engineer | 120 min |
| D04-05 | Backup failure/overdue alerting (webhook/push, no dashboard-polling) | devops-engineer | 120 min |
| D04-06 | Security review: R2 bucket credentials + encryption | security-reviewer | 75 min |
| REDHAT-FIX-S27-01 | [F-1] Replace synthetic heartbeat poisoning with real backup-failure induction or an honest production-truth gate | devops-engineer | 120 min |
| REDHAT-FIX-S27-02 | [F-2] Make the gate run a real WAL write burst and assert pipeline health | devops-engineer | 120 min |
| REDHAT-FIX-S27-03 | [F-3] Replace the unrelated pg_stat_archiver failed counter oracle | test-quality-reviewer | 75 min |
| REDHAT-FIX-S27-04 | [F-4] Isolate failure modes and reset negative-control state between alert steps | test-quality-reviewer | 120 min |
| REDHAT-FIX-S27-05 | [F-5] Execute the D04-01 RED integration suite in the Human Testing Gate | red-test-generator | 90 min |
| REDHAT-FIX-S27-06 | [F-6] Add a healthy-run zero-alert silence gate | test-quality-reviewer | 75 min |
| REDHAT-FIX-S27-07 | [F-7] Capture real webhook HTTP requests with an independent receiver | red-test-generator | 90 min |
| REDHAT-FIX-S27-08 | [F-8] Verify the production fifteen-minute alert SLA and cadence | test-quality-reviewer | 90 min |
| REDHAT-FIX-S27-09 | [F-9] Strengthen gate-evidence verification beyond weak regex recomputation | test-quality-reviewer | 120 min |
| REDHAT-FIX-S27-10 | [F-10] Install and verify the launchd alert-sweep schedule | devops-engineer | 90 min |
| REDHAT-FIX-S27-11 | [F-11] Redact webhook credentials from alerting errors and disk logs | security-reviewer | 75 min |
| REDHAT-FIX-S27-12 | [F-14] Add the backup_heartbeat Drizzle migration and remove runtime DDL drift | mastra-implementer | 120 min |
| REDHAT-FIX-S27-13 | [F-15] Enable or honestly gate Langfuse backup span export | mastra-implementer | 90 min |
| REDHAT-FIX-S27-14 | [F-16] Bound webhook fetch time and prevent alert-sweep hangs | mastra-implementer | 75 min |
| REDHAT-FIX-S27-15 | [F-17] Continue alerting remaining failed jobs after one webhook failure | mastra-implementer | 75 min |

## Source Coverage

- UC-PLAT-06, T-PLAT-021, T-PLAT-023, T-PLAT-024
- `.spec/prds/mk6-migration/04-uc-plat.md`
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md`
- `.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md`
- `.spec/prds/mk6-migration/10-technical-requirements/02-system-components.md`
- `.spec/prds/mk6-migration/10-technical-requirements/01-architecture-posture.md`
- `.spec/prds/mk6-migration/README.md`

## Capability Coverage

- CAP-BAK-01: continuous off-mini WAL archiving + base backups (pgBackRest→R2) + blob mirror (restic) + failure/overdue alerting

## Blocks

- Blocks: Sprint 28, Sprint 31
- Depends on: Sprint 04, Sprint 06

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-07-24T23:22:56Z (specialist proposal: **devops-engineer** primary impl D04-02/03/04/05; **red-test-generator** D04-01; **security-reviewer** D04-06; platform-seam enrichments: **mastra-implementer** folded into D04-03/04/05). Avg quality **103/115** (min gate 80). Topological order: D04-01 (RED, gates D04-05's GREEN) ‖ D04-02 (repo/bucket) → D04-03 (WAL+base) + D04-04 (restic mirror) both depend on D04-02 → D04-05 (alerting, reads the heartbeats from 03/04, satisfies D04-01) → D04-06 (security review over 02–05).

**Fakeability audit — honest note:** `tools/validate-scenario/validate_scenario.py` is **not present in this checkout**, so the audit was run by hand against the SCENARIO-CONTRACT rules (must_observe concrete, must_not_observe silent/false-healthy signature, negative_control.would_fail_if carrying an explicit stub/static/mock variant, seed via a real entrypoint, ≥1 non-degenerate case). Result: **0 CRITICAL** across all behavioral ACs of all 6 tasks. Every behavioral AC's `would_fail_if` explicitly names a stub/static implementation that hardcodes a healthy result with no real service round-trip — so a fake-healthy backup pipeline cannot pass.

- D04-01-red-induced-backup-failure-must-alert-healthy-run-stays-silent.md
- D04-02-provision-encrypted-r2-bucket-scoped-credentials-pgbackrest-repo-config.md
- D04-03-configure-continuous-wal-archiving-and-scheduled-base-backups.md
- D04-04-configure-scheduled-restic-blob-mirror-with-sha-256-parity.md
- D04-05-backup-failure-overdue-alerting-no-dashboard-polling.md
- D04-06-security-review-r2-bucket-credentials-and-encryption.md

**Platform-seam notes folded in at consolidation (mastra-implementer, CAP-BAK-01 co-owner):**
- Each backup job (D04-03 `wal_archive`/`base_backup`, D04-04 `restic_blob_mirror`) upserts a `backup_heartbeat(job_name PK, last_success_at, last_wal_segment, last_snapshot_id, object_count, status, updated_at)` row via idempotent `INSERT ... ON CONFLICT (job_name) DO UPDATE`; `last_success_at` is set ONLY after R2 confirms receipt (anti-fake-healthy).
- Each job emits an OTel span (`backup:wal_archive` / `backup:base_backup` / `backup:restic_blob_mirror`) through `services/platform/src/observability/langfuse-exporter.ts`, with `trace_id` stored on the heartbeat row for alert↔trace correlation; attributes redacted.
- D04-05 detects `SELECT ... FROM backup_heartbeat WHERE (now() - last_success_at) > INTERVAL '15 minutes' OR status='failed'` and POSTs `{job_name, reason:'overdue'|'failed', last_success_at, overdue_by_minutes, last_wal_segment|last_snapshot_id, trace_id}` to `ALERT_WEBHOOK_URL`. The overdue path is what catches the three PRD silent-failure modes (killed job / expired-rotated credential / removed config) — each stops the heartbeat → overdue → alert.
- CI gate: `holo backup:status` (human-readable) + `holo verify:backup` (exit 1 if any heartbeat overdue/failed).

### REDHAT-FIX remediation tasks

Generated by /kb-sprint-tasks-plan on 2026-07-28T06:15:37Z (specialists: devops-engineer, test-quality-reviewer, red-test-generator, mastra-planner, security-reviewer). Avg quality ~111/115.

- REDHAT-FIX-S27-01-f-1-replace-synthetic-heartbeat-poisoning-with-real-backup-failure-induction-or-.md
- REDHAT-FIX-S27-02-f-2-make-the-gate-run-a-real-wal-write-burst-and-assert-pipeline-health.md
- REDHAT-FIX-S27-03-f-3-replace-the-unrelated-pg-stat-archiver-failed-counter-oracle.md
- REDHAT-FIX-S27-04-f-4-isolate-failure-modes-and-reset-negative-control-state-between-alert-steps.md
- REDHAT-FIX-S27-05-f-5-execute-the-d04-01-red-integration-suite-in-the-human-testing-gate.md
- REDHAT-FIX-S27-06-f-6-add-a-healthy-run-zero-alert-silence-gate.md
- REDHAT-FIX-S27-07-f-7-capture-real-webhook-http-requests-with-an-independent-receiver.md
- REDHAT-FIX-S27-08-f-8-verify-the-production-fifteen-minute-alert-sla-and-cadence.md
- REDHAT-FIX-S27-09-f-9-strengthen-gate-evidence-verification-beyond-weak-regex-recomputation.md
- REDHAT-FIX-S27-10-f-10-install-and-verify-the-launchd-alert-sweep-schedule.md
- REDHAT-FIX-S27-11-f-11-redact-webhook-credentials-from-alerting-errors-and-disk-logs.md
- REDHAT-FIX-S27-12-f-14-add-the-backup-heartbeat-drizzle-migration-and-remove-runtime-ddl-drift.md
- REDHAT-FIX-S27-13-f-15-enable-or-honestly-gate-langfuse-backup-span-export.md
- REDHAT-FIX-S27-14-f-16-bound-webhook-fetch-time-and-prevent-alert-sweep-hangs.md
- REDHAT-FIX-S27-15-f-17-continue-alerting-remaining-failed-jobs-after-one-webhook-failure.md
