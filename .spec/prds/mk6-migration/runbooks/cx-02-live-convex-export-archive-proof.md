# S31-CX-02 — Live Convex export archive proof (operator)

**Task:** `S31-CX-02` Prove the retained ETL archive is a faithful complete image of the live Convex deployment  
**PRIMARY AC:** AC-1 (visible, integration, `convex-deployment+filesystem`)  
**Capabilities:** CAP-MIG-01  
**Agent boundary:** Agents implement fail-closed provenance (AC-2) + hash compare tooling (AC-3) only.  
**Agents MUST NOT** invoke `npx convex export` against the live deployment for this task, and MUST NOT mark AC-1 green without this operator evidence.

## Why

Sprint 32 deletes the Convex deployment. The retained Sprint 29 immutable export is the only remaining full-corpus witness. Self-hash of a directory proves self-consistency only (R21) — a constructed tree can match its own digest. AC-1 requires a **fresh read-only export** from the live deployment compared to the retained archive.

## Preconditions

1. Deployment still exists and is write-frozen:
   - Target: `dev:acrobatic-echidna-253` (or the freeze-confirmed deployment name)
   - `HOLO_MIGRATION_READ_ONLY=1` and `HOLO_CUTOVER_SCHEDULES_DISABLED=1` on the deployment
2. Retained Sprint 29 export directory is on disk (from `etl_runs.export_root` for the cutover run) **or** recoverable from the off-mini archive mirror.
3. Platform CLI available from repo root / worktree:
   ```bash
   bun services/platform/src/cli/holo.ts --help
   ```
4. Optional but recommended for AC-3:
   ```bash
   export DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod
   # or the nonprod URL that holds the Sprint 29 etl_runs row
   ```

## AC-1 steps (operator)

### 1. Locate the retained archive

```bash
# From nonprod Postgres (adjust URL as needed)
psql "$DATABASE_URL" -c \
  "SELECT id, export_root, export_hash, status, completed_at
   FROM etl_runs
   WHERE status = 'succeeded'
   ORDER BY completed_at DESC NULLS LAST
   LIMIT 5;"
```

Record:

| Field | Value |
|-------|--------|
| `export_root` | … |
| `export_hash` (64 hex) | … |
| run `id` | … |

Confirm the directory exists and is non-empty (`_tables/documents.jsonl` present, table count ≈ 60 for full corpus).

### 2. Attach provenance if missing (does not change content hash)

The content `archiveHash` **excludes** `_export_provenance.json`. Adding the sidecar is required for `readImmutableExport` / `cutover:verify-archive-provenance` and is safe for AC-3 hash compare.

```bash
RETAINED_EXPORT="<export_root from etl_runs>"

# Only if sidecar absent:
test -f "$RETAINED_EXPORT/_export_provenance.json" || bun -e '
  const { writeExportProvenance } = await import("./services/platform/src/etl/archive.ts");
  writeExportProvenance(process.env.RETAINED_EXPORT, {
    deployment: "dev:acrobatic-echidna-253",
    exportedAt: "2026-08-05T00:00:00.000Z",
    source: "operator-attested",
    notes: "Sprint 29 cutover retained archive — operator-attached for S31-CX-02",
  });
' 
# Prefer setting RETAINED_EXPORT in the environment for the one-liner, or write the JSON by hand.
```

Hand-authored sidecar shape:

```json
{
  "schema": "holocron.export_provenance.v1",
  "deployment": "dev:acrobatic-echidna-253",
  "exportedAt": "2026-08-05T18:00:00.000Z",
  "source": "operator-attested",
  "notes": "Sprint 29 retained cutover export"
}
```

### 3. Fresh read-only `convex export` (live)

From the linked Convex project (same deployment as freeze):

```bash
FRESH_ROOT=".tmp/s31-cx-02-operator-fresh-export/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$FRESH_ROOT"
npx convex export --path "$FRESH_ROOT/convex-export.zip" --include-file-storage
unzip -q "$FRESH_ROOT/convex-export.zip" -d "$FRESH_ROOT/extracted"
# Resolve data root (may nest one directory):
FRESH_EXPORT="$FRESH_ROOT/extracted"
test -f "$FRESH_EXPORT/_tables/documents.jsonl" || \
  FRESH_EXPORT=$(find "$FRESH_ROOT/extracted" -type f -path '*/_tables/documents.jsonl' | head -1 | xargs dirname | xargs dirname)
```

**Do not** use fixture trees or re-zip the retained archive. The export must be spawned against the live deployment.

Attach provenance to the fresh export (or use `holo cutover:run-etl` export path which writes the sidecar automatically):

```json
{
  "schema": "holocron.export_provenance.v1",
  "deployment": "dev:acrobatic-echidna-253",
  "exportedAt": "<ISO now>",
  "source": "convex-export",
  "notes": "S31-CX-02 AC-1 fresh read-only export"
}
```

### 4. Verify retained archive provenance + hash (tooling)

```bash
bun services/platform/src/cli/holo.ts cutover:verify-archive-provenance --json \
  --export "$RETAINED_EXPORT" \
  --expected-hash "<etl_runs.export_hash>"
```

Expect:

- `ok: true`
- `provenancePresent: true`
- `hashMatch: true`
- `archiveHash` == `etl_runs.export_hash` (64 hex)

Sidecar-less refusal (negative control you can re-run safely on a **copy**):

```bash
TMP=$(mktemp -d)
cp -R "$RETAINED_EXPORT" "$TMP/export"
rm -f "$TMP/export/_export_provenance.json"
bun services/platform/src/cli/holo.ts cutover:verify-archive-provenance --json --export "$TMP/export"
# expect exit != 0 and message containing "provenance"
```

### 5. Compare fresh export ↔ retained archive (AC-1 end state)

Compare **table set**, **per-table row counts**, and **per-row content digests**.

Minimum checks:

```bash
# Table list
wc -l "$RETAINED_EXPORT/_tables/documents.jsonl" "$FRESH_EXPORT/_tables/documents.jsonl"
# Expect identical table names (60 domain tables for full corpus)

# documents row count (task signature: 1623)
wc -l "$RETAINED_EXPORT/documents/documents.jsonl" "$FRESH_EXPORT/documents/documents.jsonl"

# Per-table row counts
for t in $(jq -r '.name' < <(sed 's/$//' "$RETAINED_EXPORT/_tables/documents.jsonl" | while read l; do echo "$l"; done)); do
  :
done
# Prefer a small script: for each table dir, count non-empty JSONL lines in both trees.

# Content digests: sha256 of each table's documents.jsonl (sorted line order is fixed by export)
# All 60 tables must match.
```

Or, after both trees have provenance sidecars:

```bash
bun services/platform/src/cli/holo.ts cutover:verify-archive-provenance --json --export "$FRESH_EXPORT"
bun services/platform/src/cli/holo.ts cutover:verify-archive-provenance --json --export "$RETAINED_EXPORT" \
  --expected-hash "<etl_runs.export_hash>"
```

**AC-1 pass criteria (must observe):**

| Observation | Expected |
|-------------|----------|
| Fresh export table count | 60 (identical to retained) |
| `documents` rows | 1623 in both trees |
| Per-table digest match | 60 of 60 |
| `cutover:verify-archive-provenance` on retained | `ok: true` |

**Must not observe:** empty export, any table digest mismatch, `documents` rows = 0, mocked export.

### 6. Capture evidence

Write under the sprint task evidence area (example):

```text
.spec/prds/mk6-migration/tasks/sprint-31-migration-integrity-remediation/.gate-evidence/<run_id>/
  ac1-fresh-export-meta.json
  ac1-table-counts.json
  ac1-digest-match.json
  ac1-verify-archive-provenance-retained.json
  ac1-verify-archive-provenance-fresh.json
```

Include:

- deployment name
- fresh export path + started/finished timestamps
- retained `export_root` + `export_hash`
- row counts for `documents` and full table list
- statement that comparison was against live export (not fixtures)

## AC-2 / AC-3 (agent-safe; already automated)

| AC | What | How |
|----|------|-----|
| AC-2 | Sidecar-less refuse | `readImmutableExport` + `holo cutover:verify-archive-provenance` — integration test `s31-cx-02-archive-provenance.test.ts` |
| AC-3 | Hash == `etl_runs.export_hash` | Same CLI with `--expected-hash` or `DATABASE_URL` lookup; PLATFORM_IT path when live root exists |

## Exit criteria for task closure

- [ ] AC-1 operator evidence captured (fresh live export + 60/60 digests + documents 1623)
- [ ] AC-2 green in CI / local vitest (no live Convex)
- [ ] AC-3 green against nonprod `etl_runs` **or** explicit skip with recorded reason + fixture hybrid proof
- [ ] AC-1 is **not** marked green from agent-only fixture tests

## Related

- `services/platform/src/etl/archive.ts` — `readImmutableExport`, provenance sidecar, `archiveHash`
- `services/platform/src/etl/archive-provenance.ts` — verify report
- `services/platform/src/cutover/run-convex-export.ts` — live export writer (attaches sidecar)
- Risk R21 in `10-technical-requirements/08-technical-risks.md`
