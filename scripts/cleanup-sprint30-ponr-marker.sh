#!/usr/bin/env bash
# Exact C-3 marker cleanup. URLs are env-only; --out is the sole accepted flag.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_PATH=""
while (($# > 0)); do
  case "$1" in
    --out)
      [[ $# -ge 2 ]] || { echo 'error: --out requires a path' >&2; exit 2; }
      OUT_PATH="$2"
      shift 2
      ;;
    --out=*)
      OUT_PATH="${1#--out=}"
      shift
      ;;
    *)
      echo 'error: cleanup accepts only --out <evidence-path>; URLs are environment-only' >&2
      exit 2
      ;;
  esac
done

: "${DATABASE_URL:?DATABASE_URL required (gate target)}"
: "${HOLO_PROBE_MARKER_MISS_DATABASE_URL:?HOLO_PROBE_MARKER_MISS_DATABASE_URL required (marker target)}"

if [[ -n "$OUT_PATH" ]]; then
  mkdir -p "$(dirname "$OUT_PATH")"
fi

set +e
REPORT_JSON="$(cd "$ROOT" && bun --eval '
  import { cleanupExactPonrMarkerFromEnv } from "./packages/platform/src/cutover/ponr-marker.ts";
  try {
    const report = await cleanupExactPonrMarkerFromEnv();
    process.stdout.write(JSON.stringify(report));
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const knownValidation = /^DATABASE_TARGET_[A-Z_]+(?:: [A-Za-z0-9 ._-]+)?$/;
    process.stderr.write(knownValidation.test(message) ? message : "marker cleanup failed");
    process.exit(2);
  }
')"
RC=$?
set -e

if [[ -n "$OUT_PATH" ]]; then
  printf '%s\n' "$REPORT_JSON" >"$OUT_PATH"
fi
if [[ -n "$REPORT_JSON" ]]; then
  printf '%s\n' "$REPORT_JSON"
fi
exit "$RC"
