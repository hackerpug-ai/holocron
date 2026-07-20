#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
conv_id="${REFERENCE_CONVERSATION_ID:-${EXPO_PUBLIC_REFERENCE_CONVERSATION_ID:-00000000-0000-0000-0000-000000000020}}"
zero_url="${ZERO_CACHE_URL:-${EXPO_PUBLIC_ZERO_CACHE_URL:-http://127.0.0.1:4848}}"
[[ -n "${DATABASE_URL:-}" && "$DATABASE_URL" == *holocron_nonprod* ]] || { echo 'reset-and-verify-zero: nonprod DATABASE_URL required' >&2; exit 1; }

reset_log="$(mktemp "${TMPDIR:-/tmp}/holocron-reset.XXXXXX")"
trap 'rm -f -- "$reset_log"' EXIT
bun "$repo_root/services/platform/src/cli/holo.ts" namespace reset --json >"$reset_log"
reset_json="$(python3 - "$reset_log" <<'PY'
import json, sys
text = open(sys.argv[1]).read()
for i, ch in enumerate(text):
    if ch != '{':
        continue
    try:
        value = json.loads(text[i:])
        print(json.dumps(value))
        break
    except json.JSONDecodeError:
        pass
else:
    raise SystemExit(1)
PY
)"
[[ "$(jq -r '.ok // false' <<<"$reset_json")" == "true" ]] || exit 1

zero_json=""
for _ in {1..15}; do
  zero_json="$(ZERO_CACHE_URL="$zero_url" REFERENCE_CONVERSATION_ID="$conv_id" bun "$repo_root/scripts/e2e/zero-reference-read.ts" 2>/dev/null || true)"
  if [[ "$(jq -r '.ok // false' <<<"$zero_json" 2>/dev/null || echo false)" == "true" \
    && "$(jq -r '.rowCount // -1' <<<"$zero_json")" == "0" \
    && "$(jq -r '.conversationPresent // false' <<<"$zero_json")" == "true" ]]; then
    break
  fi
  sleep 2
done
pg_count="$(psql "$DATABASE_URL" -t -A -v conv_id="$conv_id" -c "select count(*) from chat_messages where conversation_id=:'conv_id';" | tr -d '[:space:]')"
result="$(jq -nc --argjson reset "$reset_json" --argjson zero "$zero_json" --argjson pg_count "$pg_count" \
  '{ok:($reset.ok == true and $zero.ok == true and $zero.rowCount == 0 and $zero.conversationPresent == true and $pg_count == 0),seed_fingerprint:$reset.seed_fingerprint,postgres_row_count:$pg_count,zero_row_count:$zero.rowCount,zero_conversation_present:$zero.conversationPresent,zero_conversation_title:$zero.conversationTitle}'
)"
printf '%s\n' "$result"
[[ "$(jq -r '.ok' <<<"$result")" == "true" ]]
