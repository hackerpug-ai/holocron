#!/usr/bin/env bash
# GATE-FIX-gate-preflight-fence-rearm AC-4 — prove data_plane_ponr empty via the
# SAME resolution path as readDataPlanePonr / cutover:rollback-repoint
# (resolveDatabaseUrl({ preferHolocron: true })), not psql-only against a
# scraped DATABASE_URL that may diverge.
#
# Usage:
#   bash scripts/assert-sprint30-prep-ponr-clear.sh [--out path.json]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      OUT="${2:?--out requires path}"
      shift 2
      ;;
    -h|--help)
      sed -n '1,12p' "$0"
      exit 0
      ;;
    *)
      echo "error: unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

RESULT="$(
  bun -e '
import { resolveDatabaseUrl } from "./packages/platform/src/db/connection.ts";
import { createSql } from "./packages/platform/src/db/client.ts";
import { readDataPlanePonr } from "./packages/platform/src/cutover/ponr.ts";

const platformUrl = resolveDatabaseUrl({ preferHolocron: true });
const row = await readDataPlanePonr({ databaseUrl: platformUrl });
const sql = createSql(platformUrl);
let count = -1;
try {
  const rows = await sql`SELECT count(*)::int AS c FROM data_plane_ponr`;
  count = Number(rows[0]?.c ?? -1);
} finally {
  await sql.end({ timeout: 5 });
}

// Optional scraped DATABASE_URL comparison (dual-path honesty)
const scraped = process.env.DATABASE_URL || process.env.HOLO_DATABASE_URL || "";
let scrapedCount: number | null = null;
if (scraped && scraped !== platformUrl) {
  const sql2 = createSql(scraped);
  try {
    const rows = await sql2`SELECT count(*)::int AS c FROM data_plane_ponr`;
    scrapedCount = Number(rows[0]?.c ?? -1);
  } catch {
    scrapedCount = -1;
  } finally {
    await sql2.end({ timeout: 5 }).catch(() => {});
  }
} else if (scraped) {
  scrapedCount = count;
}

const dualMismatch =
  scrapedCount != null && scrapedCount >= 0 && scrapedCount !== count;

const ok = row === null && count === 0 && !dualMismatch;
const out = {
  ok,
  tool: "scripts/assert-sprint30-prep-ponr-clear.sh",
  platform_path: "readDataPlanePonr+resolveDatabaseUrl({preferHolocron:true})",
  ponr_row: row
    ? { id: row.id, write_row_id: row.write_row_id, run_id: row.run_id }
    : null,
  platform_count: count,
  scraped_count: scrapedCount,
  dual_path_mismatch: dualMismatch,
};
if (!ok) {
  out.error = {
    code: dualMismatch ? "PONR_DUAL_PATH_MISMATCH" : "PONR_NOT_CLEAR",
    message: dualMismatch
      ? `platform_count=${count} scraped_count=${scrapedCount} disagree`
      : `readDataPlanePonr still sees row or count=${count} (residual must be cleared before step1)`,
  };
}
console.log(JSON.stringify(out, null, 2));
process.exit(ok ? 0 : 2);
'
)"
echo "$RESULT"
if [[ -n "$OUT" ]]; then
  mkdir -p "$(dirname "$OUT")"
  printf '%s\n' "$RESULT" >"$OUT"
fi
echo "$RESULT" | python3 -c 'import json,sys; j=json.load(sys.stdin); sys.exit(0 if j.get("ok") else 2)'
