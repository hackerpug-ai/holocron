#!/usr/bin/env bash
# REDHAT-FIX-S27-22: prove require_all_regex on steps 2–3 rejects single-token gamed logs.
set -euo pipefail
ROOT="${HOLO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT"
PLAN=.spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json
jq -e '.steps[] | select(.n==2) | .assertion | (has("or_semantics")|not or .or_semantics != "any") and (.require_all_regex|length>=2)' "$PLAN" >/dev/null
jq -e '.steps[] | select(.n==3) | .assertion | (has("or_semantics")|not or .or_semantics != "any") and (.require_all_regex|length>=2)' "$PLAN" >/dev/null
jq -e '[.steps[] | select(.n==2 or .n==3) | select(.assertion.or_semantics=="any")] | length == 0' "$PLAN" >/dev/null

match_all() {
  local log="$1"; shift
  local pat
  for pat in "$@"; do
    if ! grep -Eiq -- "$pat" "$log"; then
      return 1
    fi
  done
  return 0
}

# extract patterns
mapfile -t P2 < <(jq -r '.steps[]|select(.n==2)|.assertion.require_all_regex[]' "$PLAN")
mapfile -t P3 < <(jq -r '.steps[]|select(.n==3)|.assertion.require_all_regex[]' "$PLAN")

BASE_FULL=.tmp/redhat-fix-s27-22/base-full.log
MIRROR_FULL=.tmp/redhat-fix-s27-22/mirror-full.log
BASE_GAMED=.tmp/redhat-fix-s27-22/base-gamed.log
MIRROR_GAMED=.tmp/redhat-fix-s27-22/mirror-gamed.log
mkdir -p .tmp/redhat-fix-s27-22
cat > "$BASE_FULL" <<'LOG'
  status:         success
  manifest:       present
  overall:        OK
LOG
cat > "$MIRROR_FULL" <<'LOG'
  ok:              true
  parity:          PASS (local=11 remote=11)
  heartbeat:       upserted
LOG
printf '%s\n' 'overall:        OK' > "$BASE_GAMED"
printf '%s\n' 'ok:              true' > "$MIRROR_GAMED"

if match_all "$BASE_GAMED" "${P2[@]}"; then
  echo "FAIL: gamed base log matched all require_all tokens" >&2
  exit 1
fi
if match_all "$MIRROR_GAMED" "${P3[@]}"; then
  echo "FAIL: gamed mirror log matched all require_all tokens" >&2
  exit 1
fi
match_all "$BASE_FULL" "${P2[@]}"
match_all "$MIRROR_FULL" "${P3[@]}"
echo "S27_22_REQUIRE_ALL_ORACLE_OK"
