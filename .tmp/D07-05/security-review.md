# D07-05 Security Review — Rollback Config Switch + PONR Immutability

Generated: 2026-08-07T07:06:45.584Z

## SECURITY REVIEW VERDICT

STATUS: NEEDS_FIXES

CRITICAL findings present on unauthenticated Convex write surfaces and (if observed) PONR TRUNCATE.
HIGH: cutover:rollback-repoint has zero authorization; CONVEX_DEPLOY_KEY disarm leaves no Convex-side record.

## AC Enumeration

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | CRITICAL — seedInFlightForDrainTest succeeds unauthenticated under armed HOLO_MIGRATION_READ_ONLY | findings.json#unauth-seedInFlightForDrainTest |
| AC-2 | CRITICAL — disableAndDrain mass-patches production rows with no authorization check; isCutoverSchedulesDisabled is availability-only | findings.json#unauth-disableAndDrain |
| AC-3 | CRITICAL — Unauthenticated recordWriteAttempt forges acceptedWriteCount; poisons T-SYNC-013 zero-loss / runQuietCheck writeOraclesOk | findings.json#audit-oracle-forgery-recordWriteAttempt |
| AC-4 | HIGH — verify:convex-fence-coverage matches:[] is compatible with 5 unfenced migrationFence/** write surfaces | findings.json#fence-coverage-migrationFence-exemption |
| AC-5 | MEDIUM — fencedHttpAction passes GET/HEAD/OPTIONS without assertMigrationWritable; article GET is read-only today | findings.json#fencedHttpAction-GET-bypass-standing-constraint |
| AC-6 | HIGH — cutover:rollback-repoint flips HOLO_DATA_PLANE with zero authorization; filesystem write alone is sufficient | findings.json#rollback-repoint-no-authorization |
| AC-7 | HIGH — CONVEX_DEPLOY_KEY can disarm HOLO_MIGRATION_READ_ONLY with no Convex-side tamper record | findings.json#convex-deploy-key-disarm-no-tamper-record |
| AC-8 | CRITICAL — TRUNCATE TABLE data_plane_ponr succeeds — row-level PONR_IMMUTABLE trigger does not fire on TRUNCATE | findings.json#ponr-truncate-bypass-probe |
| AC-9 | INFO — PONR latch refuses rollback-repoint with POST_PONR_INELIGIBLE despite tmp deletion + fabricated convex data-plane-config | findings.json#ponr-latch-tmp-tamper-resistance |

## Findings (verbatim observations)

### unauth-seedInFlightForDrainTest (AC-1) — CRITICAL

**seedInFlightForDrainTest succeeds unauthenticated under armed HOLO_MIGRATION_READ_ONLY**

Classification: T-SYNC-012 claim that ALL production writes are blocked is FALSE (severity CRITICAL)

```json
{
  "fence_env_before": "1",
  "fence_env_after": "1",
  "response": {
    "activeTasks": 5,
    "contentIds": [],
    "ok": true,
    "queuedSubscriptionContent": 0,
    "sourceId": null,
    "tag": "s30-sec-probe",
    "taskIds": [
      "k577cvrqfkjn34sby4mkfnc75x8c0fzt",
      "k5795c7hzjdy23egb701mt5z018c1p93",
      "k579f6ts8vdnqrwftcf9j749p58c0m0p",
      "k57bxn4he43qhtq1eqkny2446x8c0mz0",
      "k57bw27sm48esjskm3xfwejyad8c1n3d"
    ]
  },
  "auth_supplied": false,
  "api_key_supplied": false,
  "convex_identity_supplied": false
}
```

### unauth-disableAndDrain (AC-2) — CRITICAL

**disableAndDrain mass-patches production rows with no authorization check; isCutoverSchedulesDisabled is availability-only**

Classification: isCutoverSchedulesDisabled() (convex/lib/migrationFence.ts:49-52) is an AVAILABILITY guard, not an authorization guard

```json
{
  "schedule_disable_status": {
    "consumers": {
      "fencedInternalBuilders": true,
      "taskCrons": true
    },
    "disabled": true,
    "env": "HOLO_CUTOVER_SCHEDULES_DISABLED",
    "envValue": "1"
  },
  "response": {
    "consumers": {
      "env": "HOLO_CUTOVER_SCHEDULES_DISABLED",
      "envValue": "1",
      "fencedInternalBuilders": true,
      "isCutoverSchedulesDisabled": true,
      "taskCrons": true
    },
    "consumersHonored": true,
    "drainCompletedAtMs": 1786086376861,
    "id": "vn79418r52e5t97zcvkkrn10858c0v2s",
    "ok": true,
    "samples": {
      "activeTasks": 3,
      "afterActiveTasks": 0,
      "afterQueuedSubscriptionContent": 0,
      "afterRunningTasks": 0,
      "batchesProcessed": 1,
      "contentSkipped": 0,
      "drainBatches": 1,
      "measuredSurfaces": [
        "tasks",
        "subscriptionContent"
      ],
      "queuedSubscriptionContent": 0,
      "runningTasks": 0,
      "surfaceResiduals": {
        "subscriptionContent": {
          "after": 0,
          "before": 0
        },
        "tasks": {
          "after": 0,
          "before": 3,
          "runningAfter": 0,
          "runningBefore": 0
        }
      },
      "tasksCancelled": 3,
      "unknownSurfaces": []
    },
    "surfaces": [
      "tasks",
      "subscriptionContent"
    ]
  },
  "auth_supplied": false,
  "note": "HOLO_CUTOVER_SCHEDULES_DISABLED armed → any unauthenticated caller can drive mass cancel/skip"
}
```

### audit-oracle-forgery-recordWriteAttempt (AC-3) — CRITICAL

**Unauthenticated recordWriteAttempt forges acceptedWriteCount; poisons T-SYNC-013 zero-loss / runQuietCheck writeOraclesOk**

Classification: Same formula (acceptedWriteCount === 0 && rejectedWriteCount > 0) gates runQuietCheck writeOraclesOk at convex-fence-client.ts (writeOraclesOk)

```json
{
  "export_watermark_ms": 1786086256923,
  "baseline_acceptedWriteCount": 0,
  "after_acceptedWriteCount": 1,
  "delta": 1,
  "forge_response": {
    "atMs": 1786086257923,
    "id": "vn7bhkxkt89pxvrawfwx6vk2k98c1ppg",
    "outcome": "accepted"
  },
  "forged_surface": "s30-sec-probe-forged",
  "forged_outcome": "accepted",
  "auth_supplied": false
}
```

### fence-coverage-migrationFence-exemption (AC-4) — HIGH

**verify:convex-fence-coverage matches:[] is compatible with 5 unfenced migrationFence/** write surfaces**

Exempt mutation dispositions:
- `recordFenceArmed`: PUBLIC unfenced insert into migrationFenceAudit; can forge fence_armed identity for PONR snapshot / D07-02 binding
- `recordWriteAttempt`: PUBLIC unfenced insert; forges accepted/rejected write oracle (proven AC-3)
- `disableAndDrain`: PUBLIC unfenced destructive mass-patch; gated only by isCutoverSchedulesDisabled availability flag (proven AC-2)
- `probeScheduleConsumer`: PUBLIC unfenced probe mutation; intentionally unfenced for quiet-check sequencing
- `seedInFlightForDrainTest`: PUBLIC unfenced seeder up to 500 rows; shipped to production as PLATFORM_IT helper (proven AC-1)

```json
{
  "cli_status": 0,
  "matches_length": 0,
  "files_scanned": 244,
  "exemption_grep_lines": [
    "1344:    if (rel.startsWith('migrationFence/')) continue;"
  ],
  "exempt_mutations": [
    "recordFenceArmed",
    "recordWriteAttempt",
    "disableAndDrain",
    "probeScheduleConsumer",
    "seedInFlightForDrainTest"
  ]
}
```

### fencedHttpAction-GET-bypass-standing-constraint (AC-5) — MEDIUM

**fencedHttpAction passes GET/HEAD/OPTIONS without assertMigrationWritable; article GET is read-only today**

Standing constraint: any future GET/HEAD/OPTIONS httpAction must not call ctx.runMutation

```json
{
  "url": "https://acrobatic-echidna-253.convex.site/article/9cf8cd35-42e0-4f2a-9b32-1316f3081521",
  "http_status": 200,
  "content_type": "text/html; charset=utf-8",
  "body_snippet": "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <title>s29-d0603-article-f22362af</title>\n  <meta name=\"de",
  "runMutation_count_in_article_route": 0,
  "bypass_condition_present": true,
  "bypass_literal": "method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS'",
  "standing_constraint": "any future GET/HEAD/OPTIONS httpAction must not call ctx.runMutation"
}
```

### rollback-repoint-no-authorization (AC-6) — HIGH

**cutover:rollback-repoint flips HOLO_DATA_PLANE with zero authorization; filesystem write alone is sufficient**

Classification: Sole gate is resolveSecretsPathFromEnv() (services/platform/src/config/secrets.ts:82-92); no credential/approval middleware

```json
{
  "auth_token_grep_count_in_rollback_repoint_ts": 17,
  "auth_token_grep_note": "Hits are R3-H03 serving-ack \"authorize\" language (network_health/process_generation), not operator login/API-key gates",
  "operator_credential_token_count": 0,
  "cli_status": 0,
  "cli_stderr_auth_match_count": 0,
  "repointed": true,
  "report": {
    "ok": true,
    "repointed": true,
    "target": "convex-frozen",
    "target_kind": "convex",
    "data_plane": "convex",
    "engaged_at": "2026-08-07T07:06:22.445Z",
    "engaged_at_ms": 1786086382445,
    "configured_target": "/private/tmp/holocron-s30-D07-05/.tmp/D07-01/secrets.yaml",
    "precondition": {
      "ok": true,
      "accepted_post_export_writes": 0,
      "export_watermark_ms": 1786172777576,
      "audit_path": "/private/tmp/holocron-s30-D07-05/.tmp/D06-05/post-export-write-audit.json"
    },
    "config": {
      "path": "/private/tmp/holocron-s30-D07-05/.tmp/D06-05/data-plane-config.json",
      "digest_sha256": "b420e396c0cc2d25ecf8e528421a9a41aa170fc285d6983a33f12107a5b9f9ce",
      "prior_target": "postgres-soak"
    },
    "acknowledgements": [
      {
        "unit": "network-serving-health",
        "kind": "network_health",
        "observed_data_plane": "convex",
        "observed_target": "convex-frozen",
        "observed_at": "2026-08-07T07:06:23.585Z",
        "source": "http://127.0.0.1:51226/health",
        "pid": 16723,
        "preexisting": true
      },
      {
        "unit": "verify-pid:16723",
        "kind": "process_generation",
        "observed_data_plane": "convex",
        "observed_target": "convex-frozen",
        "observed_at": "2026-08-07T07:06:23.585Z",
        "source": "HOLO_VERIFY_PID+network_health",
        "pid": 16723,
        "preexisting": true
      }
    ],
    "report_path": "/private/tmp/holocron-s30-D07-05/.tmp/D07-05/ac6-rollback-repoint-report.json"
  },
  "durable_after_cli": {
    "data_plane": "convex",
    "target": "convex-frozen",
    "secrets_path": "/private/tmp/holocron-s30-D07-05/.tmp/D07-01/secrets.yaml"
  },
  "direct_edit_observed": {
    "data_plane": "convex",
    "target": "postgres-soak",
    "secrets_path": "/private/tmp/holocron-s30-D07-05/.tmp/D07-05/secrets-direct-edit.yaml"
  },
  "sole_gate": "resolveSecretsPathFromEnv()"
}
```

### convex-deploy-key-disarm-no-tamper-record (AC-7) — HIGH

**CONVEX_DEPLOY_KEY can disarm HOLO_MIGRATION_READ_ONLY with no Convex-side tamper record**

Credentials: `CONVEX_DEPLOY_KEY`

```json
{
  "isMigrationReadOnly_reads_process_env_per_call": true,
  "module_level_fence_cache_present": false,
  "audit_ts_ctx_db_insert_count": 2,
  "convexEnv_wrapper_sites": [
    "256:export function convexEnv(",
    "268:  const r = spawnSync('npx', args, {"
  ],
  "verify_no_convex_env_literal_CONVEX_DEPLOY_KEY_grep": 0,
  "verify_no_convex_env_assembles_DEPLOY_KEY_at_runtime": true,
  "assembled_credential": "CONVEX_DEPLOY_KEY",
  "unset_path_invokes_audit_mutations": false,
  "never_executed": "npx convex env unset HOLO_MIGRATION_READ_ONLY",
  "note": "isMigrationReadOnly is a fresh process.env read; convexEnv is sole npx convex env wrapper; audit.ts has exactly 2 insert sites neither on env-disarm path"
}
```

### ponr-truncate-bypass-probe (AC-8) — CRITICAL

**TRUNCATE TABLE data_plane_ponr succeeds — row-level PONR_IMMUTABLE trigger does not fire on TRUNCATE**

```json
{
  "before_id": "a5335d69-3e0c-4917-a1f5-739ff2ac43b5",
  "before_digest": "f4dae7df807343d61a0eaf0925f9a52f3eb8663188f5878d17c5381704d4fa16",
  "app_user": "holocron_app",
  "app_update_sqlstate": "42501",
  "app_delete_sqlstate": "42501",
  "owner_update_sqlstate": "P0001",
  "owner_delete_sqlstate": "P0001",
  "owner_update_message": "PONR_IMMUTABLE: data_plane_ponr is append-only (UC-SYNC-04 point of no return)",
  "owner_delete_message": "PONR_IMMUTABLE: data_plane_ponr is append-only (UC-SYNC-04 point of no return)",
  "truncate_succeeded": true,
  "truncate_sqlstate": null,
  "truncate_message": "TRUNCATE succeeded (no error)",
  "post_truncate_count": 0,
  "pre_truncate_count": 1,
  "migration_0030_trigger": "BEFORE UPDATE OR DELETE FOR EACH ROW only"
}
```

### ponr-latch-tmp-tamper-resistance (AC-9) — INFO

**PONR latch refuses rollback-repoint with POST_PONR_INELIGIBLE despite tmp deletion + fabricated convex data-plane-config**

Classification: Asymmetry: loadPostExportWriteAudit is fail-open on missing .tmp audit; POST_PONR_INELIGIBLE is DB SELECT-backed and survives filesystem tampering

```json
{
  "deleted_artifacts": [
    "/private/tmp/holocron-s30-D07-05/.tmp/D06-05/post-export-write-audit.json",
    "/private/tmp/holocron-s30-D07-05/.tmp/D06-05/data-plane-config.json",
    "/private/tmp/holocron-s30-D07-05/.tmp/D07-01/enable-writes-report.json",
    "/private/tmp/holocron-s30-D07-05/.tmp/D07-04/enable-writes-report.json"
  ],
  "fabricated_config": "/private/tmp/holocron-s30-D07-05/.tmp/D06-05/data-plane-config.json",
  "run1_status": 2,
  "run1_error_code": "POST_PONR_INELIGIBLE",
  "run1_repointed": false,
  "run2_status": 2,
  "run2_error_code": "POST_PONR_INELIGIBLE",
  "run2_repointed": false,
  "ponr_count_after": 1,
  "durable_HOLO_DATA_PLANE_after": "postgres",
  "contrast": "Pre-PONR fail-open: deleting post-export-write-audit.json reports zero accepted writes. Post-PONR: DELETE of all .tmp artifacts still yields POST_PONR_INELIGIBLE from Postgres SELECT."
}
```

## Quality Gate Checklist

- [x] Findings proven against real Convex / CLI / Postgres (not source inference alone)
- [x] No live fence-disarm CLI executed against frozen deployment
- [x] Probe seeds tagged s30-sec-probe and cleaned via disableAndDrain
- [x] No production code modified (cutover/**, convex/**, migrations, holo.ts)


## Remediation Recommendations (out of scope for this REVIEW task)

1. **Remove or auth-gate** `migrationFence.drain.seedInFlightForDrainTest` before soak/prod; do not ship PLATFORM_IT seeders to the frozen deployment URL.
2. **Auth-gate** `disableAndDrain`, `recordWriteAttempt`, `recordFenceArmed`, `probeScheduleConsumer` (admin-only Convex identity or internalMutation only).
3. **Extend** `verify:convex-fence-coverage` (or a sibling verb) to enumerate unfenced-by-design surfaces rather than silently exempting `migrationFence/**`.
4. **Authorize** `cutover:rollback-repoint` and `cutover:enable-writes` beyond filesystem access (operator identity + dual control for data-plane flips).
5. **Audit** `npx convex env set|unset HOLO_MIGRATION_READ_ONLY` outside Convex dashboard; bind fence state to a tamper-evident record.
6. **PONR TRUNCATE (CRITICAL):** add `BEFORE TRUNCATE` statement-level trigger and/or revoke TRUNCATE from roles used by app/CI; dual-layer design currently only covers UPDATE/DELETE FOR EACH ROW.
7. **Standing constraint (AC-5):** any future GET/HEAD/OPTIONS httpAction must not call `ctx.runMutation`.
8. **Keep** PONR latch DB-backed (AC-9 held) — do not regress to filesystem-only zero-loss guards.

## Quality Gate Evidence

- Probe suite: 9/9 passed (`PLATFORM_IT=1 pnpm vitest run --project integration …sprint30-security-review.test.ts`)
- No production code under `services/platform/src` or `convex/` modified
- No live fence-disarm CLI executed
- Probe seeds tagged `s30-sec-probe` and cleaned via `disableAndDrain`
