#!/usr/bin/env bash
# REDHAT-FIX-S27-07 / F-7 — Promote independent HTTP webhook captures to gate evidence.
#
# Reads RED suite dual-write artifacts (failure-*-alert.json with .alert envelope)
# and writes durable alerts-http-captures.json as a top-level AlertPost array.
#
# Oracle (must pass post-fix; MUST fail on payload-only alerts-received.json):
#   jq -e '.[0].method and .[0].url and .[0].headers and .[0].rawBody and .[0].receivedAt'
#
# Usage:
#   promote-backup-alert-http-captures.sh <red-suite-dir> <out-captures-json>
#   promote-backup-alert-http-captures.sh .gate-evidence/<run>/red-suite .gate-evidence/<run>/alerts-http-captures.json
#
# Negative control (mutation M1): stub postBackupAlert without fetch → red-suite has
# zero envelope captures → this script exits non-zero (empty array fails oracle).
set -euo pipefail

RED_DIR="${1:?usage: $0 <red-suite-dir> <out-captures-json>}"
OUT="${2:?usage: $0 <red-suite-dir> <out-captures-json>}"

if [[ ! -d "$RED_DIR" ]]; then
  echo "promote-backup-alert-http-captures: red-suite dir missing: $RED_DIR" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"

# Collect .alert objects (and bare AlertPost files) that carry the full HTTP envelope.
# Never invent method/url/headers client-side; only promote server-side captures.
tmp="$(mktemp)"
# Prefer the dual-written aggregate array when present (dedupes failure-* + captures).
if [[ -f "$RED_DIR/alerts-http-captures.json" ]] &&
  jq -e 'type=="array" and length>=1 and .[0].method and .[0].url and .[0].headers and .[0].rawBody and .[0].receivedAt' \
    "$RED_DIR/alerts-http-captures.json" >/dev/null 2>&1; then
  jq '.' "$RED_DIR/alerts-http-captures.json" >"$tmp"
else
  # shellcheck disable=SC2016
  {
    echo '['
    first=1
    shopt -s nullglob
    for f in "$RED_DIR"/failure-*-alert.json; do
      [[ -f "$f" ]] || continue
      # { alert: AlertPost }
      if jq -e '.alert | type=="object" and has("method") and has("url") and has("headers") and has("rawBody") and has("receivedAt")' \
        "$f" >/dev/null 2>&1; then
        if [[ $first -eq 0 ]]; then echo ','; fi
        jq -c '.alert' "$f"
        first=0
        continue
      fi
      # bare AlertPost object
      if jq -e 'type=="object" and has("method") and has("url") and has("headers") and has("rawBody") and has("receivedAt")' \
        "$f" >/dev/null 2>&1; then
        if [[ $first -eq 0 ]]; then echo ','; fi
        jq -c '.' "$f"
        first=0
      fi
    done
    echo ']'
  } >"$tmp"
fi

# Pretty-print + envelope oracle (same as gate)
jq '.' "$tmp" >"$OUT"
rm -f "$tmp"

if ! jq -e 'type=="array" and length>=1 and .[0].method and .[0].url and .[0].headers and .[0].rawBody and .[0].receivedAt' \
  "$OUT" >/dev/null; then
  echo "promote-backup-alert-http-captures: envelope oracle FAILED for $OUT" >&2
  echo "  (payload-only posts[] dumps / empty receiver are not wire-delivery proof)" >&2
  echo "  negative_control: stub postBackupAlert without fetch → zero HTTP captures" >&2
  exit 1
fi

# Explicit reject: if someone points this at pre-fix alerts-received.json alone, fail hard
# (already fails envelope, but document the contract in stderr on success path)
count="$(jq 'length' "$OUT")"
echo "ALERT_HTTP_CAPTURES_OK count=$count out=$OUT"
exit 0
