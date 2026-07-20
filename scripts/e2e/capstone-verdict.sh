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
from_ci_artifact="false"
tested_sha_arg=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) mode="check"; shift ;;
    --artifact-dir) artifact_dir="${2:?--artifact-dir requires a path}"; shift 2 ;;
    --tested-sha|--expected-sha) tested_sha_arg="${2:?$1 requires a SHA}"; shift 2 ;;
    --from-ci-artifact)
      from_ci_artifact="true"
      # Accept both documented forms:
      #   --from-ci-artifact DIR
      #   --from-ci-artifact --artifact-dir DIR
      if [[ $# -gt 1 && "${2:-}" != --* ]]; then
        artifact_dir="${2:?--from-ci-artifact requires a path}"
        shift 2
      else
        shift
      fi
      ;;
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

# ---- offline CI-bundle derivation ---------------------------------------------
# A downloaded CI artifact cannot be replayed against the controller's local
# Postgres/Zero services: that would either produce a false red or tempt the
# operator to substitute local evidence. The live CI lane already emits a
# capstone verdict after querying its real Postgres and Zero instances. This
# mode verifies that verdict is bound to the downloaded bytes, the captured
# success provenance, and the source SHA that CI actually tested before
# accepting it. When provenance was captured before an evidence-only commit,
# pass --tested-sha (or EXPECTED_TESTED_SHA) so replay does not recurse onto
# the evidence commit. It never invents counts or turns an unverified bundle
# green.
if [[ "$from_ci_artifact" == "true" ]]; then
  replay_head_sha="$(git -C "$repo_root" rev-parse HEAD 2>/dev/null || echo unknown)"
  expected_tested_sha="${tested_sha_arg:-${EXPECTED_TESTED_SHA:-${CI_TESTED_SHA:-$replay_head_sha}}}"
  committed_sha="$expected_tested_sha"
  generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  ci_reasons_json="[]"
  ci_add_reason() {
    ci_reasons_json="$(jq -Mc --arg r "$1" '. + [$r]' <<<"$ci_reasons_json")"
  }
  if [[ ! "$expected_tested_sha" =~ ^[0-9a-fA-F]{40}$ ]]; then
    ci_add_reason "expected tested SHA is invalid"
  fi
  ci_find_file() {
    local filename="$1"
    if [[ -s "$artifact_dir/$filename" ]]; then
      printf '%s\n' "$artifact_dir/$filename"
    elif [[ -s "$artifact_dir/bundle/$filename" ]]; then
      printf '%s\n' "$artifact_dir/bundle/$filename"
    fi
  }

  ci_provenance="$(ci_find_file ci-run-provenance.json || true)"
  [[ -n "$ci_provenance" ]] || ci_provenance="$(ci_find_file ci-provenance.json || true)"
  ci_zip="$(find "$artifact_dir" -maxdepth 1 -type f -name '*.zip' -print -quit 2>/dev/null || true)"

  # The extracted root capstone is mutable because this command writes its
  # replay result to capstone-verdict.json. Read the original CI member from
  # the uploaded ZIP so replay can never validate its own rewritten output.
  ci_capstone=""
  ci_tmp_dir=""
  if [[ -n "$ci_zip" ]]; then
    ci_tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/holocron-capstone.XXXXXX")"
    trap '[[ -n "${ci_tmp_dir:-}" ]] && rm -rf -- "$ci_tmp_dir"' EXIT
    if unzip -p "$ci_zip" capstone-verdict.json >"$ci_tmp_dir/capstone-verdict.json" 2>/dev/null \
      && [[ -s "$ci_tmp_dir/capstone-verdict.json" ]]; then
      ci_capstone="$ci_tmp_dir/capstone-verdict.json"
    fi
  fi

  if [[ -z "$ci_provenance" ]]; then
    ci_add_reason "CI provenance JSON is missing from $artifact_dir"
  fi
  if [[ -z "$ci_capstone" ]]; then
    ci_add_reason "CI capstone-verdict.json is missing from $artifact_dir"
  fi
  if [[ -z "$ci_zip" ]]; then
    ci_add_reason "CI artifact ZIP is missing from $artifact_dir"
  fi

  ci_run_id=""
  ci_head_sha=""
  ci_committed_sha=""
  ci_conclusion=""
  ci_artifact_sha=""
  ci_artifact_size="0"
  if [[ -n "$ci_provenance" ]]; then
    ci_run_id="$(jq -r '.run_id // empty' "$ci_provenance" 2>/dev/null || true)"
    ci_head_sha="$(jq -r '.head_sha // empty' "$ci_provenance" 2>/dev/null || true)"
    ci_committed_sha="$(jq -r '.committed_sha // empty' "$ci_provenance" 2>/dev/null || true)"
    ci_conclusion="$(jq -r '.conclusion // empty' "$ci_provenance" 2>/dev/null || true)"
    ci_artifact_sha="$(jq -r '.artifact_sha256 // empty' "$ci_provenance" 2>/dev/null || true)"
    ci_artifact_size="$(jq -r '.artifact_size_bytes // 0' "$ci_provenance" 2>/dev/null || echo 0)"
    [[ "$ci_run_id" =~ ^[1-9][0-9]*$ ]] || ci_add_reason "CI provenance run_id is invalid"
    [[ "$ci_head_sha" =~ ^[0-9a-fA-F]{40}$ ]] || ci_add_reason "CI provenance head_sha is invalid"
    [[ "$ci_committed_sha" == "$ci_head_sha" ]] || ci_add_reason "CI provenance committed_sha does not equal head_sha"
    [[ "$ci_head_sha" == "$expected_tested_sha" ]] || ci_add_reason "CI provenance tested SHA $ci_head_sha does not match expected tested SHA $expected_tested_sha"
    ci_tested_sha="$(jq -r '.tested_sha // empty' "$ci_provenance" 2>/dev/null || true)"
    [[ -z "$ci_tested_sha" || "$ci_tested_sha" == "$expected_tested_sha" ]] || ci_add_reason "CI provenance tested_sha does not match expected tested SHA"
    [[ "$ci_conclusion" == "success" ]] || ci_add_reason "CI provenance conclusion is not success"
    [[ "$ci_artifact_sha" =~ ^[0-9a-fA-F]{64}$ ]] || ci_add_reason "CI provenance artifact_sha256 is invalid"
    [[ "$ci_artifact_size" =~ ^[1-9][0-9]*$ ]] || ci_add_reason "CI provenance artifact_size_bytes is invalid"
  fi
  if [[ -n "$ci_zip" && -n "$ci_artifact_sha" ]]; then
    ci_actual_zip_sha="$(sha "$ci_zip")"
    ci_actual_zip_size="$(bytes "$ci_zip")"
    [[ "$ci_actual_zip_sha" == "$ci_artifact_sha" ]] || ci_add_reason "CI artifact ZIP SHA-256 does not match ci-run-provenance.json"
    [[ "$ci_actual_zip_size" == "$ci_artifact_size" ]] || ci_add_reason "CI artifact ZIP size does not match ci-run-provenance.json"
  fi

  ci_capstone_gate="red"
  ci_junit_failures="-1"
  ci_pg_count="0"
  ci_pg_id=""
  ci_pg_content_len="0"
  ci_zero_ok="false"
  ci_zero_id=""
  ci_zero_content_len="0"
  ci_conversation_id="$conv_id"
  ci_reference_run_id=""
  if [[ -n "$ci_capstone" ]]; then
    ci_capstone_gate="$(jq -r '.coldboot_gate // "red"' "$ci_capstone" 2>/dev/null || echo red)"
    ci_junit_failures="$(jq -r '.junit_failures // -1' "$ci_capstone" 2>/dev/null || echo -1)"
    ci_pg_count="$(jq -r '.postgres_agent_count // 0' "$ci_capstone" 2>/dev/null || echo 0)"
    ci_pg_id="$(jq -r '.postgres_agent_id // empty' "$ci_capstone" 2>/dev/null || true)"
    ci_pg_content_len="$(jq -r '.postgres_agent_content_len // 0' "$ci_capstone" 2>/dev/null || echo 0)"
    ci_zero_ok="$(jq -r '.zero_cache_ok // false' "$ci_capstone" 2>/dev/null || echo false)"
    ci_zero_id="$(jq -r '.zero_agent_id // empty' "$ci_capstone" 2>/dev/null || true)"
    ci_zero_content_len="$(jq -r '.zero_agent_content_len // 0' "$ci_capstone" 2>/dev/null || echo 0)"
    ci_conversation_id="$(jq -r '.conversation_id // empty' "$ci_capstone" 2>/dev/null || true)"
    ci_reference_run_id="$(jq -r '.reference_run_id // empty' "$ci_capstone" 2>/dev/null || true)"
    [[ "$ci_capstone_gate" == "green" ]] || ci_add_reason "embedded CI capstone gate is $ci_capstone_gate"
    [[ "$ci_capstone" != "" && "$ci_committed_sha" == "$(jq -r '.committed_sha // empty' "$ci_capstone" 2>/dev/null || true)" ]] || ci_add_reason "embedded CI capstone SHA is not provenance-bound"
    [[ "$ci_junit_failures" == "0" ]] || ci_add_reason "embedded CI capstone junit_failures=$ci_junit_failures"
    [[ "$ci_pg_count" =~ ^[0-9]+$ && "$ci_pg_count" -ge 1 ]] || ci_add_reason "embedded CI capstone Postgres agent count is $ci_pg_count"
    [[ "$ci_pg_content_len" =~ ^[0-9]+$ && "$ci_pg_content_len" -ge 1 ]] || ci_add_reason "embedded CI capstone Postgres content length is $ci_pg_content_len"
    [[ "$ci_pg_id" =~ ^[0-9a-fA-F-]{36}$ ]] || ci_add_reason "embedded CI capstone Postgres agent id is missing"
    [[ "$ci_zero_ok" == "true" ]] || ci_add_reason "embedded CI capstone Zero read is not ok"
    [[ "$ci_zero_id" == "$ci_pg_id" ]] || ci_add_reason "embedded CI capstone Postgres and Zero agent ids differ"
    [[ "$ci_zero_content_len" =~ ^[0-9]+$ && "$ci_zero_content_len" -ge 1 ]] || ci_add_reason "embedded CI capstone Zero content length is $ci_zero_content_len"
    [[ "$ci_conversation_id" == "$conv_id" ]] || ci_add_reason "embedded CI capstone conversation_id does not match $conv_id"
    [[ "$ci_reference_run_id" =~ ^[0-9a-fA-F-]{36}$ ]] || ci_add_reason "embedded CI capstone reference_run_id is missing"
  fi

  ci_evidence_entries=()
  ci_evidence_names=(junit.xml test-output/screenshots/reference-chat-reply.png reference-flow.mov capstone-reference-request.json)
  for ci_evidence_name in "${ci_evidence_names[@]}"; do
    if [[ -s "$artifact_dir/$ci_evidence_name" ]]; then
      ci_evidence_path="$artifact_dir/$ci_evidence_name"
    elif [[ -s "$artifact_dir/bundle/$ci_evidence_name" ]]; then
      ci_evidence_path="$artifact_dir/bundle/$ci_evidence_name"
    else
      ci_evidence_path=""
    fi
    if [[ -z "$ci_evidence_path" ]]; then
      ci_add_reason "CI bundle is missing $ci_evidence_name"
      continue
    fi
    ci_expected_sha="$(jq -r --arg filename "$ci_evidence_name" '.evidence[]? | select(.path | endswith($filename)) | .sha256' "$ci_capstone" 2>/dev/null | head -n 1 || true)"
    ci_expected_bytes="$(jq -r --arg filename "$ci_evidence_name" '.evidence[]? | select(.path | endswith($filename)) | .bytes' "$ci_capstone" 2>/dev/null | head -n 1 || true)"
    ci_actual_sha="$(sha "$ci_evidence_path")"
    ci_actual_bytes="$(bytes "$ci_evidence_path")"
    [[ "$ci_expected_sha" =~ ^[0-9a-fA-F]{64}$ ]] || ci_add_reason "CI capstone has no valid checksum for $ci_evidence_name"
    [[ "$ci_actual_sha" == "$ci_expected_sha" ]] || ci_add_reason "CI bundle checksum mismatch for $ci_evidence_name"
    [[ "$ci_actual_bytes" == "$ci_expected_bytes" ]] || ci_add_reason "CI bundle byte count mismatch for $ci_evidence_name"
    ci_evidence_entries+=("$(jq -Mn --arg p "$ci_evidence_path" --arg s "$ci_actual_sha" --argjson b "$ci_actual_bytes" '{path:$p,sha256:$s,bytes:$b}')")
  done

  ci_junit_path="$(ci_find_file junit.xml || true)"
  ci_junit_failures_from_file="-1"
  if [[ -n "$ci_junit_path" ]]; then
    ci_junit_failures_from_file="$(sed -En 's/.*<testsuite[^>]* failures="([0-9]+)".*/\1/p' "$ci_junit_path" | head -1)"
  fi
  [[ "$ci_junit_failures_from_file" == "$ci_junit_failures" ]] || ci_add_reason "downloaded junit.xml failures do not match embedded capstone"
  [[ "$ci_junit_failures_from_file" == "0" ]] || ci_add_reason "downloaded junit.xml does not independently report failures=0"

  if [[ ${#ci_evidence_entries[@]} -eq 0 ]]; then
    ci_evidence_json="[]"
  else
    ci_evidence_json="$(printf '%s\n' "${ci_evidence_entries[@]}" | jq -cs '.')"
  fi
  ci_verdict="green"
  [[ "$ci_reasons_json" == "[]" ]] || ci_verdict="red"
  ci_payload="$(jq -Mn \
    --arg sha "$committed_sha" \
    --arg tested_sha "$expected_tested_sha" \
    --arg replay_head_sha "$replay_head_sha" \
    --arg at "$generated_at" \
    --arg gate "$ci_verdict" \
    --argjson jf "$ci_junit_failures" \
    --argjson pac "$ci_pg_count" \
    --argjson pacl "$ci_pg_content_len" \
    --argjson zok "$([[ "$ci_zero_ok" == "true" ]] && echo true || echo false)" \
    --argjson zacl "$ci_zero_content_len" \
    --argjson evidence "$ci_evidence_json" \
    --argjson reasons "$ci_reasons_json" \
    --arg artifact_dir "$artifact_dir" \
    --arg conversation_id "$ci_conversation_id" \
    --arg reference_run_id "$ci_reference_run_id" \
    --arg postgres_agent_id "$ci_pg_id" \
    --arg zero_agent_id "$ci_zero_id" \
    '{committed_sha:$sha, tested_sha:$tested_sha, replay_head_sha:$replay_head_sha,
      generated_at:$at, coldboot_gate:$gate, junit_failures:$jf,
      reference_run_id:$reference_run_id,
      postgres_agent_count:$pac, postgres_agent_id:$postgres_agent_id, postgres_agent_content_len:$pacl,
      zero_cache_ok:$zok, zero_agent_id:$zero_agent_id, zero_agent_content_len:$zacl,
      conversation_id:$conversation_id, artifact_dir:$artifact_dir,
      evidence:$evidence, reasons:$reasons}')"
  if [[ "$ci_verdict" == "green" ]]; then
    emit "$ci_payload" 0
  else
    emit "$ci_payload" 1
  fi
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

# 2. screenshot — prefer Maestro's named reference-reply capture.
screenshot=""
for cand in "test-output/screenshots/reference-chat-reply.png" "reference-chat-reply.png" "final.png"; do
  if [[ -s "$artifact_dir/$cand" ]]; then screenshot="$artifact_dir/$cand"; break; fi
done
if [[ -z "$screenshot" ]]; then
  add_reason "reference reply screenshot missing or empty in $artifact_dir"
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

# 4. Unique request identity — binds Postgres and Zero checks to this invocation.
reference_request="$artifact_dir/reference-request.json"
bound_reference_request="$artifact_dir/capstone-reference-request.json"
reference_message=""
reference_conversation_id=""
reference_request_id=""
if [[ ! -s "$reference_request" ]] || ! jq -e . "$reference_request" >/dev/null 2>&1; then
  add_reason "reference-request.json missing or invalid: $reference_request"
else
  cp -f "$reference_request" "$bound_reference_request"
  reference_message="$(jq -r '.message // empty' "$reference_request")"
  reference_conversation_id="$(jq -r '.conversation_id // empty' "$reference_request")"
  reference_request_id="$(jq -r '.request_id // empty' "$reference_request")"
  [[ -n "$reference_message" ]] || add_reason "reference request message is empty"
  [[ "$reference_conversation_id" == "$conv_id" ]] || add_reason "reference request conversation does not match $conv_id"
  [[ "$reference_request_id" == "s20-reference-${reference_message}" ]] || add_reason "reference request id is not derived from the unique message"
  evidence+=("$(jq -Mn --arg p "$bound_reference_request" --arg s "$(sha "$bound_reference_request")" --argjson b "$(bytes "$bound_reference_request")" \
    '{path:$p,sha256:$s,bytes:$b}')")
fi

# 5. Postgres agent row — exact completed run for the unique request.
pg_agent_count=0
pg_agent_id=""
pg_agent_content_len=0
reference_run_id=""
if [[ -z "${DATABASE_URL:-}" ]]; then
  add_reason "DATABASE_URL is unset; cannot prove the Postgres agent row"
else
  if [[ "$DATABASE_URL" != *holocron_nonprod* ]]; then
    add_reason "DATABASE_URL must target holocron_nonprod for the reference gate (got non-nonprod url)"
  else
    pg_row="$(psql "$DATABASE_URL" -t -A -F '|' -v conv_id="$conv_id" -v message="$reference_message" -v request_id="$reference_request_id" 2>/dev/null <<'SQL' || echo "||0"
select r.id, m.id, length(m.content)
from chat_runs r join chat_messages m on m.session_id=r.id::text and m.role='agent'
where r.conversation_id=:'conv_id' and r.request_id=:'request_id' and r.message=:'message'
  and r.status='completed' and length(m.content)>0
order by m.created_at desc limit 1;
SQL
)"
    reference_run_id="$(echo "$pg_row" | cut -d'|' -f1)"
    pg_agent_id="$(echo "$pg_row" | cut -d'|' -f2)"
    pg_agent_content_len="$(echo "$pg_row" | cut -d'|' -f3)"
    [[ "$reference_run_id" =~ ^[0-9a-fA-F-]{36}$ ]] && pg_agent_count=1
    pg_agent_count="${pg_agent_count:-0}"; pg_agent_content_len="${pg_agent_content_len:-0}"
    if [[ ! "$pg_agent_count" =~ ^[0-9]+$ || "$pg_agent_count" -lt 1 ]]; then
      add_reason "Postgres has no completed agent reply for the unique reference request"
    elif [[ ! "$pg_agent_content_len" =~ ^[0-9]+$ || "$pg_agent_content_len" -lt 1 ]]; then
      add_reason "Postgres agent row content length is ${pg_agent_content_len} (<1) for conversation ${conv_id}"
    fi
  fi
fi

# 6. live Zero query — exact agent row must belong to the reference run.
zero_agent_content_len=0
zero_agent_id=""
zero_ok="false"
zero_result="$(ZERO_CACHE_URL="$zero_url" REFERENCE_CONVERSATION_ID="$conv_id" \
  bun "$repo_root/scripts/e2e/zero-reference-read.ts" 2>/dev/null || echo '')"
if [[ -z "$zero_result" ]]; then
  add_reason "zero-cache one-shot read produced no output (zero-cache unreachable at $zero_url)"
else
  zero_ok="$(jq -r '.ok // false' <<<"$zero_result" 2>/dev/null || echo false)"
  zero_agent_id="$(jq -r --arg run "$reference_run_id" '[.rows[]? | select(.role == "agent" and .session_id == $run)] | last | .id // empty' <<<"$zero_result" 2>/dev/null || true)"
  zero_agent_content_len="$(jq -r --arg run "$reference_run_id" '[.rows[]? | select(.role == "agent" and .session_id == $run)] | last | (.content | length) // 0' <<<"$zero_result" 2>/dev/null || echo 0)"
  if [[ "$zero_ok" != "true" ]]; then
    zerr="$(jq -r '.error // "unknown zero-cache error"' <<<"$zero_result" 2>/dev/null || echo unknown)"
    add_reason "zero-cache read did not complete: $zerr"
  elif [[ ! "$zero_agent_content_len" =~ ^[0-9]+$ || "$zero_agent_content_len" -lt 1 ]]; then
    add_reason "zero-cache returned no agent row with non-empty content for conversation ${conv_id} (agentContentLen=${zero_agent_content_len})"
  fi
fi
if [[ -n "$pg_agent_id" && "$zero_agent_id" != "$pg_agent_id" ]]; then
  add_reason "Postgres and Zero agent row ids differ (${pg_agent_id} != ${zero_agent_id})"
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
[[ -n "$pg_agent_id" && "$zero_agent_id" == "$pg_agent_id" ]] || green="false"

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
  --arg reference_run_id "$reference_run_id" \
  --argjson jf "$junit_failures" \
  --argjson pac "${pg_agent_count:-0}" \
  --arg paid "$pg_agent_id" \
  --argjson pacl "${pg_agent_content_len:-0}" \
  --argjson zok "$([[ "$zero_ok" == "true" ]] && echo true || echo false)" \
  --argjson zacl "${zero_agent_content_len:-0}" \
  --arg zaid "$zero_agent_id" \
  --argjson evidence "$evidence_json" \
  --argjson reasons "$reason_json" \
  --arg artifact_dir "$artifact_dir" \
  --arg conversation_id "$conv_id" \
  '{committed_sha:$sha, generated_at:$at, coldboot_gate:$gate, junit_failures:$jf,
    reference_run_id:$reference_run_id,
    postgres_agent_count:$pac, postgres_agent_id:$paid, postgres_agent_content_len:$pacl,
    zero_cache_ok:$zok, zero_agent_id:$zaid, zero_agent_content_len:$zacl,
    conversation_id:$conversation_id, artifact_dir:$artifact_dir,
    evidence:$evidence, reasons:$reasons}')"

if [[ "$verdict" == "green" ]]; then
  emit "$payload" 0
else
  emit "$payload" 1
fi
