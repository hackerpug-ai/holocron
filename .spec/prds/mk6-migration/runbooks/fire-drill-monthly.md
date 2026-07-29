# Fire Drill Monthly Runbook (CAP-BAK-01 / D05-05)

**Mission template:** `fire-drill-monthly` @ `1.0.0`  
**Command under test:** `holo restore:fire-drill`  
**Cadence:** **monthly** (never more frequent — full restore is disruptive)  
**Artifact:** `parity-report.json` (must show all `*_PARITY_PASS: true` for SUCCESS)

This runbook covers scheduled and manual execution of the fresh-hardware fire drill:
pre-failure snapshot → Postgres PITR from R2 → restic blob restore → row-count +
ledger-checksum + blob SHA-256 parity.

---

## Pre-Drill Checklist

Complete every item before starting. Do **not** skip isolation checks.

- [ ] **Backup chain healthy** — recent base + WAL archive heartbeats green (see D04-05 alerting).
  ```bash
  holo backup:healthy --json
  # optional: confirm heartbeats
  psql "$DATABASE_URL" -c "SELECT job, last_success_at, status FROM backup_heartbeat ORDER BY job;"
  ```
- [ ] **R2 credentials present** for **read** restore (pgBackRest repo + restic mirror). Never paste secrets into tickets/logs.
- [ ] **Scratch targets empty and distinct from live mini mounts**
  ```bash
  export SCRATCH_PGDATA="$PWD/.tmp/fire-drill-monthly/scratch-pgdata"
  export SCRATCH_BLOBS="$PWD/.tmp/fire-drill-monthly/scratch-blobs"
  export REPORT="$PWD/.tmp/fire-drill-monthly/parity-report.json"
  rm -rf "$SCRATCH_PGDATA" "$SCRATCH_BLOBS"
  mkdir -p "$SCRATCH_PGDATA" "$SCRATCH_BLOBS" "$(dirname "$REPORT")"
  # Refuse live paths (examples — adjust if your mini uses different mounts)
  test "$SCRATCH_PGDATA" != "${HOLO_LIVE_PGDATA:-/var/lib/postgresql/data}"
  test "$SCRATCH_BLOBS" != "${HOLO_BLOB_ROOT:-$PWD/.tmp/holocron-blobs}"
  ```
- [ ] **Choose PITR target** (ISO-8601). Prefer a timestamp *after* the last known-good base backup and *before* any suspected failure.
  ```bash
  export TARGET_TS="$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '1 hour ago' --iso-8601=seconds)"
  echo "TARGET_TS=$TARGET_TS"
  ```
- [ ] **Mission template registered**
  ```bash
  holo mission template:register \
    services/platform/src/mission/templates/fire-drill-monthly.json --json
  # Expect: templateKey=fire-drill-monthly, version=1.0.0, created true|false
  psql "$DATABASE_URL" -c \
    "SELECT template_key, latest_version, description FROM mission_templates WHERE template_key='fire-drill-monthly';"
  psql "$DATABASE_URL" -c \
    "SELECT definition_json->>'schedule' AS schedule,
            jsonb_array_length(definition_json->'steps') AS steps
     FROM mission_template_versions
     WHERE template_key='fire-drill-monthly' AND version='1.0.0';"
  # Expect schedule=monthly and steps >= 1
  ```
- [ ] **Disk headroom** — scratch PGDATA + blob restore need roughly 2× current DB+blob size free.
- [ ] **Alerting path** (D04-05) reachable so a FAILED mission is visible.

---

## Execution Steps

### A) Preferred: mission executor (records run + artifacts)

```bash
export DATABASE_URL="${DATABASE_URL:-postgres://127.0.0.1:5432/holocron}"
export HOLO_FIRE_DRILL_TARGET_TIMESTAMP="$TARGET_TS"
export HOLO_FIRE_DRILL_SCRATCH="$SCRATCH_PGDATA"
export HOLO_FIRE_DRILL_BLOB_DIR="$SCRATCH_BLOBS"
export HOLO_FIRE_DRILL_REPORT="$REPORT"

IDEM="fire-drill-monthly:$(date -u +%Y-%m)"
holo mission run fire-drill-monthly \
  --goal "CAP-BAK-01 monthly fire drill" \
  --idempotency-key "$IDEM" \
  --target-timestamp "$TARGET_TS" \
  --scratch "$SCRATCH_PGDATA" \
  --blob-dir "$SCRATCH_BLOBS" \
  --report "$REPORT" \
  --json
```

### B) Direct CLI (same restore path the mission stage invokes)

```bash
holo restore:fire-drill \
  --target-timestamp "$TARGET_TS" \
  --scratch "$SCRATCH_PGDATA" \
  --blob-dir "$SCRATCH_BLOBS" \
  --report "$REPORT" \
  --json
# exit 0 only when all parity gates pass
```

### C) Monthly schedule (launchd)

Install once per mini (or operator workstation that holds restore credentials). Cadence is **monthly** via `StartCalendarInterval` (day 1, 04:00 local) — **not** a sub-monthly interval.

```bash
# Version-controlled template:
#   services/platform/deploy/launchd/holocron-fire-drill-monthly.plist
#
# Install (example — substitute HOME / HOLO_ROOT / BUN_BIN / DATABASE_URL):
PLIST="$HOME/Library/LaunchAgents/holocron-fire-drill-monthly.plist"
cp services/platform/deploy/launchd/holocron-fire-drill-monthly.plist "$PLIST"
# Edit placeholders, then:
launchctl bootout "gui/$(id -u)/holocron-fire-drill-monthly" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl print "gui/$(id -u)/holocron-fire-drill-monthly" | head
```

The scheduled job should invoke either path A or B with **env-provided** timestamps and scratch dirs (never hardcode credentials or fixed PITR timestamps in the template JSON).

---

## Verification

After SUCCESS or FAILED, always inspect the parity artifact and mission record.

```bash
# 1) File exists and is non-empty
test -f "$REPORT" && wc -c "$REPORT"

# 2) All three gates must be true for SUCCESS
jq '{
  ok,
  POSTGRES_PARITY_PASS,
  LEDGER_CHECKSUM_MATCH,
  BLOB_PARITY_PASS,
  matched_objects,
  ledger_checksum,
  errors
}' "$REPORT"

# 3) Mission run status (mission path)
psql "$DATABASE_URL" -c \
  "SELECT id, template_key, status, error_code, error_message, completed_at
   FROM mission_runs
   WHERE template_key='fire-drill-monthly'
   ORDER BY created_at DESC LIMIT 3;"

# typed_output_json.output_artifacts should include parity-report.json on success path
psql "$DATABASE_URL" -c \
  "SELECT typed_output_json->'output_artifacts' AS artifacts,
          typed_output_json->>'POSTGRES_PARITY_PASS' AS pg,
          typed_output_json->>'LEDGER_CHECKSUM_MATCH' AS ledger,
          typed_output_json->>'BLOB_PARITY_PASS' AS blob
   FROM mission_runs
   WHERE template_key='fire-drill-monthly'
   ORDER BY created_at DESC LIMIT 1;"
```

**Pass criteria (CAP-BAK-01):**

| Check | Field | Required |
|-------|--------|----------|
| Postgres row counts | `POSTGRES_PARITY_PASS` | `true` |
| Evidence ledger chain | `LEDGER_CHECKSUM_MATCH` | `true` |
| Blob SHA-256 set | `BLOB_PARITY_PASS` | `true` |
| Overall | `ok` | `true` |

If **any** `*_PARITY_PASS` is `false`, mission status must be **failed** (not completed). The stage error message includes `PARITY_PASS false`.

---

## Troubleshooting

### `refusing fire-drill into live mini PGDATA / blob storage`

- Cause: `--scratch` or `--blob-dir` resolved to a live mini mount.
- Fix: use empty dirs under `.tmp/fire-drill-monthly/…` (or a dedicated restore host). Never point at production PGDATA or `HOLO_BLOB_ROOT`.

### `scratch PGDATA must be empty before fire-drill restore`

```bash
rm -rf "$SCRATCH_PGDATA" && mkdir -p "$SCRATCH_PGDATA"
```

### `pre-failure snapshot captured zero domain tables` / empty ledger checksum

- Source DB has no domain data or wrong `DATABASE_URL`.
- Fix: point `HOLO_FIRE_DRILL_SOURCE_DATABASE_URL` / `DATABASE_URL` at the live holocron DB that backups protect.

### `POSTGRES_PARITY_PASS: false`

- Inspect `row_count_mismatches` in the report.
- Confirm PITR target is after a successful base backup and WAL is continuous through `TARGET_TS`.
- Re-run D05-02 PITR alone: `holo restore --pitr "$TARGET_TS" --scratch "$SCRATCH_PGDATA"`.

### `LEDGER_CHECKSUM_MATCH: false`

- Ledger tables diverged or restore stopped before the target.
- Check `actual_stop_timestamp` vs `target_timestamp` in the report; re-run with a slightly earlier target if stop was incomplete.

### `BLOB_PARITY_PASS: false`

- restic mirror stale or wrong repo password/env.
- Verify restic mirror heartbeat (D04-04) and re-run blob mirror before the drill.
- Confirm `--source-blob-root` (pre-failure manifest) is the live content-addressed blob root, while `--blob-dir` is a distinct empty restore target.

### Mission `MISSION_FIRE_DRILL_PARITY_FAILED`

- Expected when any parity gate fails — this is fail-closed behavior (AC-3).
- Open `reportPath` from the error message; fix the underlying backup/restore issue; re-run with a fresh idempotency key (`--fresh` or new monthly key).

### Template registration conflict / immutable surface drift

```bash
# Re-register only when the JSON content intentionally changes (version bump required for material edits).
holo mission template:register \
  services/platform/src/mission/templates/fire-drill-monthly.json --json
```

### Schedule ran more than monthly

- **Never** set launchd `StartInterval` to sub-monthly for this drill.
- Use `StartCalendarInterval` day-of-month = 1 only (see deploy plist).

---

## References

- Template: `services/platform/src/mission/templates/fire-drill-monthly.json`
- Registration helper: `services/platform/src/mission/index.ts` → `registerFireDrillMonthlyTemplate()`
- Implementation: `services/platform/src/backup/fire-drill.ts`, `parity-report.ts`
- Prior tasks: D05-04 (`holo restore:fire-drill`), D05-02 (PITR), D04-05 (alerting)
- Capability: CAP-BAK-01 · Flow: T-PLAT-025 · UC-PLAT-06
