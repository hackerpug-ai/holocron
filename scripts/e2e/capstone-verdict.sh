#!/usr/bin/env bash
# REDHAT-FIX-H1 — Sprint 20 capstone verifier.
#
# Derives a single `coldboot_gate` verdict from REAL evidence only:
#   - junit.xml            (failures == 0)
#   - screenshot            (final.png OR reference-chat-reply.png, non-zero bytes)
#   - reference-flow.mov    (non-zero bytes)
#   - Postgres agent row    (count >= 1 AND content length > 0 for the reference conversation)
#   - live zero-cache query (returns the same agent row with content length > 0)
#
# NEVER hardcodes green. NEVER reads sprint-goal-state.json or the harness exit
# code. Records sha256 checksums for every artifact it used. When any required
# evidence is missing, empty, or contradicts the asserted gate, it writes a RED
# verdict naming the offending evidence and exits non-zero.
#
# Usage:
#   capstone-verdict.sh --check              # static preflight (no DB/network); exit 0
#   capstone-verdict.sh                      # full derivation against $E2E_ARTIFACT_DIR
#   capstone-verdict.sh --artifact-dir DIR   # full derivation against DIR
set -Eeuo pipefail

mode="full"
artifact_dir=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) mode="check"; shift ;;
    --artifact-dir) artifact_dir="${2:?--artifact-dir requires a path}"; shift 2 ;;
    --from-ci-artifact) artifact_dir="${2:?--from-ci-artifact requires a path}"; mode="full"; shift 2 ;;
    -h|--help)
      sed -n '2,21p' "$0"; exit 0 ;;
    *) echo "capstone-verdict: unknown arg: $1" >&2; exit 2 ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
artifact_dir="${artifact_dir:-${E2E_ARTIFACT_DIR:-$repo_root/.tmp/maestro-reference-flow}}"
out_json="$artifact_dir/capstone-verdict.json"
zero_url="${ZERO_CACHE_URL:-http://127.0.0.1:4848}"
conv_id="${REFERENCE_CONVERSATION_ID:-00000000-0000-0000-0000-000000000020}"

sha() { shasum -a 256 "$1" | awk '{print $1}'; }
bytes() { stat -f%z "$1" 2>/dev/null || echo 0; }

emit() { # emit <json> <exit>
  mkdir -p "$artifact_dir"
  printf '%s\n' "$1" >"$out_json"
  echo "$1"
  exit "$2"
}

# ---- static preflight ---------------------------------------------------------
if [[ "$mode" == "check" ]]; then
  test -x "$repo_root/scripts/e2e/capstone-verdict.sh"
  command -v jq >/dev/null 2>&1 || { echo "capstone-verdict --check: jq missing" >&2; exit 1; }
  command -v psql >/dev/null 2>&1 || { echo "capstone-verdict --check: psql missing" >&2; exit 1; }
  command -v bun >/dev/null 2>&1 || { echo "capstone-verdict --check: bun missing" >&2; exit 1; }
  test -f "$repo_root/scripts/e2e/zero-reference-read.ts"
  printf '{"ok":true,"mode":"check","verifier":"%s","committed_sha":"%s"}\n' \
    "$repo_root/scripts/e2e/capstone-verdict.sh" "$(git -C "$repo_root" rev-parse HEAD 2>/dev/null || echo unknown)"
  # sanity: jq -n with a constant filter must emit (catches a closed-stdin regression)
  jq -n '{gate:"check"}' >/dev/null
  exit 0
fi

# ---- full derivation ----------------------------------------------------------
committed_sha="$(git -C "$repo_root" rev-parse HEAD 2>/dev/null || echo unknown)"
generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
evidence=()
reasons=()
reason_json="[]"

add_reason() { reasons+=("$1"); reason_json="$(jq -Mc --arg r "$1" '. + [$r]' <<<"$reason_json")"; }

# 1. junit.xml — parse failures (first <testsuite ... failures="N">).
junit="$artifact_dir/junit.xml"
junit_failures=-1
if [[ ! -s "$junit" ]]; then
  add_reason "junit.xml missing or empty: $junit"
else
    junit_failures="$(sed -En 's/.*<testsuite[^>]* failures="([0-9]+)".*/\1/p' "$junit" | head -1)"
  if [[ -z "$junit_failures" || ! "$junit_failures" =~ ^[0-9]+$ ]]; then
    junit_failures=-1
    add_reason "junit.xml failures attribute could not be parsed: $junit"
  elif [[ "$junit_failures" -gt 0 ]]; then
    add_reason "junit.xml reports failures=$junit_failures (>0)"
  fi
  evidence+=("$(jq -Mn --arg p "$junit" --arg s "$(sha "$junit")" --argjson b "$(bytes "$junit")" \
    '{path:$p,sha256:$s,bytes:$b}')")
fi

# 2. screenshot — final.png OR reference-chat-reply.png (D03-07 names the latter).
screenshot=""
for cand in "final.png" "reference-chat-reply.png"; do
  if [[ -s "$artifact_dir/$cand" ]]; then screenshot="$artifact_dir/$cand"; break; fi
done
if [[ -z "$screenshot" ]]; then
  add_reason "screenshot missing or empty (neither final.png nor reference-chat-reply.png in $artifact_dir)"
else
  evidence+=("$(jq -Mn --arg p "$screenshot" --arg s "$(sha "$screenshot")" --argjson b "$(bytes "$screenshot")" \
    '{path:$p,sha256:$s,bytes:$b}')")
fi

# 3. reference-flow.mov — non-zero bytes (H3 contract: exact file, not a .sb sidecar).
video="$artifact_dir/reference-flow.mov"
if [[ ! -s "$video" ]]; then
  add_reason "reference-flow.mov missing or zero bytes: $video"
else
  evidence+=("$(jq -Mn --arg p "$video" --arg s "$(sha "$video")" --argjson b "$(bytes "$video")" \
    '{path:$p,sha256:$s,bytes:$b}')")
fi

# 4. Postgres agent row — count >= 1 AND content length > 0.
pg_agent_count=0
pg_agent_content_len=0
if [[ -z "${DATABASE_URL:-}" ]]; then
  add_reason "DATABASE_URL is unset; cannot prove the Postgres agent row"
else
  if [[ "$DATABASE_URL" != *holocron_nonprod* ]]; then
    add_reason "DATABASE_URL must target holocron_nonprod for the reference gate (got non-nonprod url)"
  else
    pg_row="$(psql "$DATABASE_URL" -t -A -F '|' -c \
      "select count(*), coalesce(max(length(content)),0) from chat_messages where conversation_id='${conv_id}' and role='agent';" 2>/dev/null || echo "0|0")"
    pg_agent_count="$(echo "$pg_row" | cut -d'|' -f1)"
    pg_agent_content_len="$(echo "$pg_row" | cut -d'|' -f2)"
    pg_agent_count="${pg_agent_count:-0}"; pg_agent_content_len="${pg_agent_content_len:-0}"
    if [[ ! "$pg_agent_count" =~ ^[0-9]+$ || "$pg_agent_count" -lt 1 ]]; then
      add_reason "Postgres agent row count is ${pg_agent_count} (<1) for conversation ${conv_id}"
    elif [[ ! "$pg_agent_content_len" =~ ^[0-9]+$ || "$pg_agent_content_len" -lt 1 ]]; then
      add_reason "Postgres agent row content length is ${pg_agent_content_len} (<1) for conversation ${conv_id}"
    fi
  fi
fi

# 5. live zero-cache query — returns the agent row with content length > 0.
zero_agent_content_len=0
zero_ok="false"
zero_result="$(ZERO_CACHE_URL="$zero_url" REFERENCE_CONVERSATION_ID="$conv_id" \
  bun "$repo_root/scripts/e2e/zero-reference-read.ts" 2>/dev/null || echo '')"
if [[ -z "$zero_result" ]]; then
  add_reason "zero-cache one-shot read produced no output (zero-cache unreachable at $zero_url)"
else
  zero_ok="$(jq -r '.ok // false' <<<"$zero_result" 2>/dev/null || echo false)"
  zero_agent_content_len="$(jq -r '.agentContentLen // 0' <<<"$zero_result" 2>/dev/null || echo 0)"
  if [[ "$zero_ok" != "true" ]]; then
    zerr="$(jq -r '.error // "unknown zero-cache error"' <<<"$zero_result" 2>/dev/null || echo unknown)"
    add_reason "zero-cache read did not complete: $zerr"
  elif [[ ! "$zero_agent_content_len" =~ ^[0-9]+$ || "$zero_agent_content_len" -lt 1 ]]; then
    add_reason "zero-cache returned no agent row with non-empty content for conversation ${conv_id} (agentContentLen=${zero_agent_content_len})"
  fi
fi

# ---- derive the verdict -------------------------------------------------------
# Green IFF every independent signal is satisfied. No single signal can carry
# the verdict, and the harness exit code / sprint-goal-state.json are NEVER read.
green="true"
[[ "$junit_failures" -eq 0 ]] || green="false"
[[ -n "$screenshot" ]] || green="false"
[[ -s "$video" ]] || green="false"
[[ "${pg_agent_count:-0}" -ge 1 && "${pg_agent_content_len:-0}" -ge 1 ]] || green="false"
[[ "$zero_ok" == "true" && "${zero_agent_content_len:-0}" -ge 1 ]] || green="false"

if [[ ${#evidence[@]} -eq 0 ]]; then
  evidence_json="[]"
else
  evidence_json="$(printf '%s\n' "${evidence[@]}" | jq -cs '.' 2>/dev/null || echo '[]')"
fi

verdict="$( [[ "$green" == "true" ]] && echo green || echo red )"

payload="$(jq -Mn \
  --arg sha "$committed_sha" \
  --arg at "$generated_at" \
  --arg gate "$verdict" \
  --argjson jf "$junit_failures" \
  --argjson pac "${pg_agent_count:-0}" \
  --argjson pacl "${pg_agent_content_len:-0}" \
  --argjson zok "$([[ "$zero_ok" == "true" ]] && echo true || echo false)" \
  --argjson zacl "${zero_agent_content_len:-0}" \
  --argjson evidence "$evidence_json" \
  --argjson reasons "$reason_json" \
  --arg artifact_dir "$artifact_dir" \
  --arg conversation_id "$conv_id" \
  '{committed_sha:$sha, generated_at:$at, coldboot_gate:$gate, junit_failures:$jf,
    postgres_agent_count:$pac, postgres_agent_content_len:$pacl,
    zero_cache_ok:$zok, zero_agent_content_len:$zacl,
    conversation_id:$conversation_id, artifact_dir:$artifact_dir,
    evidence:$evidence, reasons:$reasons}')"

if [[ "$verdict" == "green" ]]; then
  emit "$payload" 0
else
  emit "$payload" 1
fi
