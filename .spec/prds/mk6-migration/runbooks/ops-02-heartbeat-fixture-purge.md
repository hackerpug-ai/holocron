# S31-OPS-02 — Production `backup_heartbeat` fixture purge (operator-only)

**Task:** S31-OPS-02 · **Risk R24** · **OPERATOR_EXECUTED:** yes  
**IRREVERSIBLE:** yes for production row DELETE — dump first  
**Agent policy:** Agents **never** DELETE production heartbeat rows. This runbook is human-only.

## Why

Sprint 27 gate fixtures left residue in production `backup_heartbeat`. Alert-sweep that only
sees fixtures (or treats **zero rows as healthy**) hides real backup failures. After purge,
alert-sweep must point at production `DATABASE_URL` and the zero-row floor must fail closed
(`ZERO_ROW_FLOOR`).

## Fixture job_name patterns (DELETE only these)

Identify fixture / harness residue with patterns such as:

| Pattern | Origin (typical) |
| --- | --- |
| `%fixture%` | Explicit fixture seeds |
| `s27-%` | Sprint 27 integration harness jobs |
| `s27-15-%`, `s27-19-%` | Alert-sweep continue / healthy-all suites |
| `prod-canary-overdue` | Test canary (if not a real standing job) |
| `redhat-fix-%`, `gate-fix-%` | Red-hat / gate-fix harness rows |
| `%synthetic%`, `%poison%` | Induce-failure synthetic poison |

**Do not** DELETE real production job names (`wal_archive`, `base_backup`, `restic_blob_mirror`,
`fire_drill_monthly`, etc.) unless you have independently confirmed they are residual junk.

Confirm the exact set with a SELECT before any DELETE.

## Checklist (operator)

### 1) Dump (required before DELETE)

```bash
set -euo pipefail
# Production URL from operator secrets — never commit the value
export DATABASE_URL="${DATABASE_URL:?set production DATABASE_URL}"

DUMP_DIR="${HOME}/.holocron/ops/s31-ops-02"
mkdir -p "$DUMP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="${DUMP_DIR}/backup_heartbeat-pre-purge-${STAMP}.sql"

# Full table dump of backup_heartbeat only (retain off-git)
pg_dump "$DATABASE_URL" \
  --data-only \
  --table=backup_heartbeat \
  --column-inserts \
  -f "$DUMP_FILE"

# Pre-delete inventory
psql "$DATABASE_URL" -c "
  SELECT job_name, status, last_success_at, updated_at
  FROM backup_heartbeat
  ORDER BY job_name;
" | tee "${DUMP_DIR}/pre-purge-inventory-${STAMP}.txt"

# Fixture-pattern counts (adjust patterns to match inventory)
psql "$DATABASE_URL" -c "
  SELECT count(*) AS fixture_like
  FROM backup_heartbeat
  WHERE job_name ILIKE '%fixture%'
     OR job_name ILIKE 's27-%'
     OR job_name ILIKE 'redhat-fix-%'
     OR job_name ILIKE 'gate-fix-%'
     OR job_name ILIKE '%synthetic%'
     OR job_name = 'prod-canary-overdue';
" | tee "${DUMP_DIR}/pre-purge-fixture-count-${STAMP}.txt"

test -s "$DUMP_FILE"
echo "Dump retained at: $DUMP_FILE"
```

### 2) DELETE fixture rows only (never TRUNCATE)

**NEVER TRUNCATE** `backup_heartbeat`. Truncate would wipe real production heartbeats and
create a silent-healthy false positive until the zero-row floor fires.

```bash
# Review the SELECT result set carefully, then DELETE only fixture patterns.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

-- Preview (must match what you intend to remove)
SELECT job_name, status, last_success_at
FROM backup_heartbeat
WHERE job_name ILIKE '%fixture%'
   OR job_name ILIKE 's27-%'
   OR job_name ILIKE 'redhat-fix-%'
   OR job_name ILIKE 'gate-fix-%'
   OR job_name ILIKE '%synthetic%'
   OR job_name = 'prod-canary-overdue'
ORDER BY job_name;

-- Fixture-only DELETE (same predicate as preview)
DELETE FROM backup_heartbeat
WHERE job_name ILIKE '%fixture%'
   OR job_name ILIKE 's27-%'
   OR job_name ILIKE 'redhat-fix-%'
   OR job_name ILIKE 'gate-fix-%'
   OR job_name ILIKE '%synthetic%'
   OR job_name = 'prod-canary-overdue';

COMMIT;
SQL
```

If the preview shows a row you are unsure about, **abort** (`ROLLBACK;`) and refine the predicate.

### 3) Recount + preserve non-fixture jobs

```bash
psql "$DATABASE_URL" -c "
  SELECT count(*) AS remaining_fixture_like
  FROM backup_heartbeat
  WHERE job_name ILIKE '%fixture%'
     OR job_name ILIKE 's27-%'
     OR job_name ILIKE 'redhat-fix-%'
     OR job_name ILIKE 'gate-fix-%'
     OR job_name ILIKE '%synthetic%'
     OR job_name = 'prod-canary-overdue';
"
# Expect: remaining_fixture_like == 0

psql "$DATABASE_URL" -c "
  SELECT job_name, status, last_success_at
  FROM backup_heartbeat
  ORDER BY job_name;
"
# Expect: real production jobs still present when they existed pre-purge
```

### 4) Verify alert-sweep truth paths

```bash
# Production secrets / env — launchd plist uses @DATABASE_URL@ expanded at install time
holo backup:alert-sweep --json
# Healthy chain → exit 0 with total > 0; overdue/failed → non-zero + alerts

holo verify:backup --json
# Empty table would fail with ZERO_ROW_FLOOR (proven on nonprod IT; production must not be empty)

# Confirm launchd job is not a stub
plutil -p ~/Library/LaunchAgents/holocron-backup-alert-sweep.plist | grep -E 'backup:alert-sweep|ProgramArguments'
# Must NOT be /usr/bin/true
```

## Agent / CI boundaries

| Allowed | Forbidden |
| --- | --- |
| Document patterns; nonprod DELETE for zero-row IT | Agent DELETE on production `backup_heartbeat` |
| Assert runbook path exists in IT | TRUNCATE `backup_heartbeat` |
| ZERO_ROW_FLOOR code + nonprod proof | Commit production `DATABASE_URL` / secrets |
| Plist placeholder `@DATABASE_URL@` | Bake harness capture host into committed plist |

## Related

- Task: `.spec/prds/mk6-migration/tasks/sprint-31-migration-integrity-remediation/S31-OPS-02-restore-alert-sweep-truth-purge-fixture-zero-row-floor.md`
- IT: `services/platform/tests/integration/sprint31-ops-02-alert-sweep.test.ts`
- Plist: `services/platform/deploy/launchd/holocron-backup-alert-sweep.plist`
- Code: `services/platform/src/backup/alerting.ts` (`runBackupAlertSweep`, `ZERO_ROW_FLOOR`)
