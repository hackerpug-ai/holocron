#!/usr/bin/env bash

set -uo pipefail

# S33-PLAT-05 is a read-only live proof.  The only remote write permitted by
# this verifier is the ordinary public chat POST in live mode; every other
# observation is a bounded SSH read.  In particular, no missing observation is
# replaced with synthetic success or an in-memory "node" receipt.

readonly MINI_ONE="inference1"
readonly MINI_TWO="inference2"
readonly MINI_ONE_ID="inference1.tail011a51.ts.net"
readonly MINI_TWO_ID="inference2.tail011a51.ts.net"
readonly IMPLEMENTER_MODEL="openai/Qwen3.6-35B-A3B-MLX-8bit"
readonly MINI_ONE_BASE="http://inference1.tail011a51.ts.net:8003/v1"
readonly MINI_TWO_BASE="http://inference2.tail011a51.ts.net:8003/v1"
readonly ROUTER_ENDPOINT="http://host.docker.internal:4545/v1"
readonly COMPOSE_PROJECT="holocron-router"
readonly COMPOSE_SERVICE="litellm-router"
readonly SSH_DESTINATION="holocron@holocron"
readonly CHAT_URL="https://holocron.tail011a51.ts.net:44111"
readonly MINI_LOG="~/local-llm/logs/omlx-mini-8003.log"
readonly READ_PATH="/dev/null/omlx-mini-8003.log"
readonly DOCKER_BIN="/usr/local/bin/docker"
readonly SSH_OPTIONS_JSON='["BatchMode=yes","ConnectTimeout=10","ServerAliveCountMax=2","ServerAliveInterval=5"]'
readonly SSH_ARGS=(
  -o BatchMode=yes
  -o ConnectTimeout=10
  -o ServerAliveInterval=5
  -o ServerAliveCountMax=2
)

MODE="live"
JSON_MODE=false
EXPECTED_MAIN_SHA="${S33_EXPECTED_MAIN_SHA:-}"
RELEASE_LOCK_PATH="${S33_RELEASE_LOCK:-}"
IMPLEMENTATION_BASE_SHA=""
RED_SHA=""
CANDIDATE_SHA=""
EXPECTED_LANDED_MAIN_SHA=""
LINEAGE_RECEIPT_PATH=""
RED_FAILURE_EVIDENCE_PATH=""
PROOF_RECEIPT_PATH=""
SOURCE_PRODUCT_REVIEW_PATH=""
SOURCE_MASTRA_REVIEW_PATH=""
FINAL_PRODUCT_REVIEW_PATH=""
FINAL_MASTRA_REVIEW_PATH=""
LOCK_SOURCE_REVISION=""
LOCK_IMAGE_DIGEST=""
LOCK_COMPOSE_SHA=""
LOCK_GENERATED_AT=""

TEMP_DIR=""
CHAT_REQUEST_ISSUED=false
trap 'if [[ -n "$TEMP_DIR" ]]; then rm -rf "$TEMP_DIR"; fi' EXIT

sha256_file() {
  shasum -a 256 "$1" 2>/dev/null | awk '{print $1}'
}

sha256_string() {
  printf '%s' "$1" | shasum -a 256 | awk '{print $1}'
}

epoch_ms() {
  ruby -e 'puts (Time.now.to_f * 1000).floor'
}

iso_now() {
  ruby -rtime -e 'puts Time.now.utc.iso8601(3)'
}

timestamp_epoch() {
  ruby -rtime -e 'puts Time.parse(ARGV.fetch(0)).to_f' "$1" 2>/dev/null
}

regular_nonsymlink() {
  [[ -f "$1" && ! -L "$1" ]]
}

json_error() {
  local code="$1" message="$2" extra="${3-}"
  [[ -n "$extra" ]] || extra='{}'
  if ! jq -e 'type == "object"' <<<"$extra" >/dev/null 2>&1; then extra='{}'; fi
  jq -n \
    --arg code "$code" \
    --arg message "$message" \
    --argjson chat_request_issued "$CHAT_REQUEST_ISSUED" \
    --argjson extra "$extra" \
    '{ok:false,error_code:$code,error:$message,chat_request_issued:$chat_request_issued,network_mutation_performed:false,literal_disconnect_claimed:false} + $extra'
  exit 1
}

parse_args() {
  while (($#)); do
    case "$1" in
      --mode) MODE="${2:-}"; shift 2 ;;
      --mode=*) MODE="${1#*=}"; shift ;;
      --expected-main-sha) EXPECTED_MAIN_SHA="${2:-}"; shift 2 ;;
      --expected-main-sha=*) EXPECTED_MAIN_SHA="${1#*=}"; shift ;;
      --release-lock) RELEASE_LOCK_PATH="${2:-}"; shift 2 ;;
      --release-lock=*) RELEASE_LOCK_PATH="${1#*=}"; shift ;;
      --implementation-base) IMPLEMENTATION_BASE_SHA="${2:-}"; shift 2 ;;
      --implementation-base=*) IMPLEMENTATION_BASE_SHA="${1#*=}"; shift ;;
      --red-commit) RED_SHA="${2:-}"; shift 2 ;;
      --red-commit=*) RED_SHA="${1#*=}"; shift ;;
      --candidate) CANDIDATE_SHA="${2:-}"; shift 2 ;;
      --candidate=*) CANDIDATE_SHA="${1#*=}"; shift ;;
      --expected-landed-main-sha) EXPECTED_LANDED_MAIN_SHA="${2:-}"; shift 2 ;;
      --expected-landed-main-sha=*) EXPECTED_LANDED_MAIN_SHA="${1#*=}"; shift ;;
      --receipt) LINEAGE_RECEIPT_PATH="${2:-}"; shift 2 ;;
      --receipt=*) LINEAGE_RECEIPT_PATH="${1#*=}"; shift ;;
      --red-failure-evidence) RED_FAILURE_EVIDENCE_PATH="${2:-}"; shift 2 ;;
      --red-failure-evidence=*) RED_FAILURE_EVIDENCE_PATH="${1#*=}"; shift ;;
      --proof-receipt) PROOF_RECEIPT_PATH="${2:-}"; shift 2 ;;
      --proof-receipt=*) PROOF_RECEIPT_PATH="${1#*=}"; shift ;;
      --source-product-review) SOURCE_PRODUCT_REVIEW_PATH="${2:-}"; shift 2 ;;
      --source-product-review=*) SOURCE_PRODUCT_REVIEW_PATH="${1#*=}"; shift ;;
      --source-mastra-review) SOURCE_MASTRA_REVIEW_PATH="${2:-}"; shift 2 ;;
      --source-mastra-review=*) SOURCE_MASTRA_REVIEW_PATH="${1#*=}"; shift ;;
      --final-product-review) FINAL_PRODUCT_REVIEW_PATH="${2:-}"; shift 2 ;;
      --final-product-review=*) FINAL_PRODUCT_REVIEW_PATH="${1#*=}"; shift ;;
      --final-mastra-review) FINAL_MASTRA_REVIEW_PATH="${2:-}"; shift 2 ;;
      --final-mastra-review=*) FINAL_MASTRA_REVIEW_PATH="${1#*=}"; shift ;;
      --json) JSON_MODE=true; shift ;;
      *) json_error "UNKNOWN_ARGUMENT" "unsupported verifier argument" ;;
    esac
  done
  [[ "$JSON_MODE" == true ]] || json_error "JSON_MODE_REQUIRED" "the verifier requires --json"
  case "$MODE" in live|post-chat-invalid-stream|no-mini-evidence|forbidden-backend|final-lineage|source-predeploy) : ;;
    credential-canary) : ;;
    *) json_error "MODE_INVALID" "unsupported verifier mode" ;;
  esac
}

require_sha() {
  [[ "$1" =~ ^[0-9a-fA-F]{40}$ ]] || json_error "$2" "expected an exact 40-character commit SHA"
}

require_common_identity() {
  [[ "${S33_HOLOCRON_HOST:-}" == "$SSH_DESTINATION" ]] ||
    json_error "DEPLOYED_HOST_INVALID" "S33_HOLOCRON_HOST must be holocron@holocron"
  if [[ "$MODE" == live || "$MODE" == post-chat-invalid-stream || "$MODE" == forbidden-backend ]]; then
    [[ "${S33_REQUEST_HOST:-}" == "$MINI_ONE" ]] ||
      json_error "REQUEST_ORIGIN_INVALID" "S33_REQUEST_HOST must be inference1"
  fi
}

load_release_lock() {
  [[ -n "$RELEASE_LOCK_PATH" ]] || json_error "RELEASE_LOCK_REQUIRED" "--release-lock is required"
  regular_nonsymlink "$RELEASE_LOCK_PATH" ||
    json_error "RELEASE_LOCK_INVALID" "release lock must be a regular non-symlink file"
  jq -e '
    type == "object" and .schemaVersion == 1 and .deployable == true and
    (.image | type == "string" and length > 0) and
    (.digest | test("^sha256:[0-9a-f]{64}$")) and
    (.sourceRevision | test("^[0-9a-f]{40}$")) and
    (.composeSha256 | test("^[0-9a-f]{64}$")) and
    (.repoDigest | type == "string" and length > 0) and
    (.previousImage | type == "string" and length > 0) and
    (.previousDigest | type == "string" and length > 0) and
    (.previousRepoDigest | type == "string" and length > 0) and
    (.generatedAt | type == "string" and length > 0)
  ' "$RELEASE_LOCK_PATH" >/dev/null 2>&1 ||
    json_error "RELEASE_LOCK_INVALID" "release lock is not a deployable schema-v1 identity"
  LOCK_SOURCE_REVISION=$(jq -r '.sourceRevision' "$RELEASE_LOCK_PATH")
  LOCK_IMAGE_DIGEST=$(jq -r '.digest' "$RELEASE_LOCK_PATH")
  LOCK_COMPOSE_SHA=$(jq -r '.composeSha256' "$RELEASE_LOCK_PATH")
  LOCK_GENERATED_AT=$(jq -r '.generatedAt' "$RELEASE_LOCK_PATH")
  if [[ -n "$EXPECTED_MAIN_SHA" ]]; then
    require_sha "$EXPECTED_MAIN_SHA" "EXPECTED_MAIN_SHA_INVALID"
    [[ "$LOCK_SOURCE_REVISION" == "$EXPECTED_MAIN_SHA" ]] ||
      json_error "RELEASE_SOURCE_MISMATCH" "release-lock sourceRevision differs from expected main SHA"
  fi
}

run_bounded_capture() {
  local destination="$1" command="$2" prefix="$3" timeout_seconds="${4:-12}"
  local started finished
  started=$(epoch_ms)
  RUN_STARTED_AT=$(iso_now)
  RUN_COMMAND_SHA=$(sha256_string "$command")
  timeout "${timeout_seconds}s" ssh "${SSH_ARGS[@]}" "$destination" "$command" \
    >"${prefix}.stdout" 2>"${prefix}.stderr"
  RUN_EXIT=$?
  finished=$(epoch_ms)
  RUN_FINISHED_AT=$(iso_now)
  RUN_STARTED_MS="$started"
  RUN_FINISHED_MS="$finished"
  RUN_STDOUT_SHA=$(sha256_file "${prefix}.stdout")
  RUN_STDERR_SHA=$(sha256_file "${prefix}.stderr")
}

read_router_container() {
  local ids
  ids=$(timeout 12s ssh "${SSH_ARGS[@]}" "$SSH_DESTINATION" \
    "${DOCKER_BIN} ps --filter label=com.docker.compose.project=${COMPOSE_PROJECT} --filter label=com.docker.compose.service=${COMPOSE_SERVICE} --format '{{.ID}}'" 2>/dev/null) ||
    json_error "ROUTER_CONTAINER_UNAVAILABLE" "could not read the running router container"
  ROUTER_IDS=()
  while IFS= read -r router_id; do [[ -n "$router_id" ]] && ROUTER_IDS+=("$router_id"); done <<<"$ids"
  [[ "${#ROUTER_IDS[@]}" -eq 1 ]] ||
    json_error "ROUTER_CONTAINER_AMBIGUOUS" "expected exactly one running router container"
  ROUTER_ID="${ROUTER_IDS[0]}"
}

read_router_snapshot() {
  local hash_line config_text parsed
  hash_line=$(timeout 12s ssh "${SSH_ARGS[@]}" "$SSH_DESTINATION" \
    "${DOCKER_BIN} exec ${ROUTER_ID} sha256sum /etc/litellm/config.yaml" 2>/dev/null) ||
    json_error "ROUTER_CONFIG_UNAVAILABLE" "could not hash the effective router config"
  ROUTER_HASH=$(awk 'NF {print $1; exit}' <<<"$hash_line")
  [[ "$ROUTER_HASH" =~ ^[0-9a-f]{64}$ ]] || json_error "ROUTER_HASH_INVALID" "effective router config hash was malformed"
  config_text=$(timeout 12s ssh "${SSH_ARGS[@]}" "$SSH_DESTINATION" \
    "${DOCKER_BIN} exec ${ROUTER_ID} cat /etc/litellm/config.yaml" 2>/dev/null) ||
    json_error "ROUTER_CONFIG_UNAVAILABLE" "could not read the effective router config"
  CONFIG_FILE="$TEMP_DIR/router-config.yaml"
  umask 077
  printf '%s\n' "$config_text" >"$CONFIG_FILE"
  parsed=$(ruby -ryaml -rjson -e '
    doc = YAML.safe_load(File.read(ARGV.fetch(0)), aliases: true)
    rows = Array(doc.fetch("model_list")).map do |entry|
      next unless entry.is_a?(Hash) && entry["model_name"] == "implementer"
      params = entry["litellm_params"]
      next unless params.is_a?(Hash)
      {"model_name" => entry["model_name"], "model" => params["model"], "api_base" => params["api_base"]}
    end.compact
    print JSON.generate(rows)
  ' "$CONFIG_FILE" 2>/dev/null) || json_error "ROUTER_CONFIG_PARSE_FAILED" "effective router config could not be parsed"
  jq -e --arg model "$IMPLEMENTER_MODEL" --arg one "$MINI_ONE_BASE" --arg two "$MINI_TWO_BASE" '
    type == "array" and length == 2 and
    all(.[]; .model_name == "implementer" and .model == $model and (.api_base | type == "string")) and
    (map(.api_base) | sort) == [$one,$two] and (map(.api_base) | unique | length) == 2
  ' <<<"$parsed" >/dev/null || json_error "LAPTOP_DEPENDENCY_DETECTED" "effective implementer topology was not exactly the two minis"
  IMPLEMENTER_RECORDS="$parsed"
}

read_router_hash_again() {
  local line
  line=$(timeout 12s ssh "${SSH_ARGS[@]}" "$SSH_DESTINATION" \
    "${DOCKER_BIN} exec ${ROUTER_ID} sha256sum /etc/litellm/config.yaml" 2>/dev/null) ||
    json_error "ROUTER_CONFIG_UNAVAILABLE" "could not re-read the effective router config hash"
  ROUTER_HASH_AFTER=$(awk 'NF {print $1; exit}' <<<"$line")
  [[ "$ROUTER_HASH_AFTER" =~ ^[0-9a-f]{64}$ ]] || json_error "ROUTER_HASH_INVALID" "second router hash was malformed"
}

read_deployment_identity() {
  local health ids service_id labels envs source image compose
  health=$(timeout 12s ssh "${SSH_ARGS[@]}" "$SSH_DESTINATION" \
    "curl --silent --show-error --fail --max-time 10 ${CHAT_URL}/health" 2>/dev/null) ||
    json_error "DEPLOYMENT_IDENTITY_UNAVAILABLE" "could not read deployed health identity"
  jq -e 'type == "object"' <<<"$health" >/dev/null 2>&1 || json_error "DEPLOYMENT_IDENTITY_INVALID" "health identity was not JSON"
  ids=$(timeout 12s ssh "${SSH_ARGS[@]}" "$SSH_DESTINATION" \
    "${DOCKER_BIN} ps --filter label=com.docker.compose.project=holocron-production --filter label=com.docker.compose.service=mastra --format '{{.ID}}'" 2>/dev/null) ||
    json_error "DEPLOYMENT_IDENTITY_UNAVAILABLE" "could not locate deployed mastra container"
  mapfile -t service_ids < <(awk 'NF' <<<"$ids")
  [[ "${#service_ids[@]}" -eq 1 ]] || json_error "DEPLOYMENT_IDENTITY_AMBIGUOUS" "expected exactly one deployed mastra container"
  service_id="${service_ids[0]}"
  labels=$(timeout 12s ssh "${SSH_ARGS[@]}" "$SSH_DESTINATION" \
    "${DOCKER_BIN} inspect ${service_id} --format '{{json .Config.Labels}}'" 2>/dev/null) || json_error "DEPLOYMENT_IDENTITY_UNAVAILABLE" "could not read deployed labels"
  envs=$(timeout 12s ssh "${SSH_ARGS[@]}" "$SSH_DESTINATION" \
    "${DOCKER_BIN} inspect ${service_id} --format '{{range .Config.Env}}{{println .}}{{end}}'" 2>/dev/null) || json_error "DEPLOYMENT_IDENTITY_UNAVAILABLE" "could not read deployed identity environment"
  source=$(jq -r '.deployment.identity.sourceRevision // .sourceRevision // empty' <<<"$health")
  image=$(jq -r '.deployment.identity.imageDigest // .imageDigest // empty' <<<"$health")
  compose=$(jq -r '.deployment.identity.composeSha256 // empty' <<<"$health")
  local deployed_source deployed_image deployed_compose
  deployed_source=$(jq -r '.["io.holocron.source-revision"] // empty' <<<"$labels")
  deployed_image=$(jq -r '.["io.holocron.image-digest"] // empty' <<<"$labels")
  deployed_compose=$(awk -F= '$1 == "HOLO_COMPOSE_SHA256" {print $2; exit}' <<<"$envs")
  [[ "$source" =~ ^[0-9a-f]{40}$ && "$deployed_source" == "$source" && "$source" == "$EXPECTED_MAIN_SHA" ]] || json_error "SOURCE_REVISION_MISMATCH" "health, deployed label, and expected source revision did not match"
  [[ "$image" =~ ^sha256:[0-9a-f]{64}$ && "$deployed_image" == "$image" && "$image" == "$LOCK_IMAGE_DIGEST" ]] || json_error "IMAGE_DIGEST_MISMATCH" "health, deployed image label, and release lock did not match"
  [[ "$compose" =~ ^[0-9a-f]{64}$ && "$deployed_compose" == "$compose" && "$compose" == "$LOCK_COMPOSE_SHA" ]] || json_error "COMPOSE_SHA_MISMATCH" "health, deployed compose identity, and release lock did not match"
  DEPLOYMENT_IDENTITY=$(jq -n --arg source "$source" --arg image "$image" --arg compose "$compose" \
    '{sourceRevision:$source,imageDigest:$image,composeSha256:$compose,healthSourceRevision:$source,deployedSourceRevision:$source,deployedImageDigest:$image,deployedComposeSha256:$compose}')
}

mini_identity_command='log="$HOME/local-llm/logs/omlx-mini-8003.log"; host="$(/opt/homebrew/bin/tailscale status --json 2>/dev/null | ruby -rjson -e '\''j=JSON.parse(STDIN.read); print j.dig("Self","DNSName").to_s.sub(/\.$/,"")'\'')" || exit 72; printf "HOSTNAME=%s\\n" "$host"; stat_line="$(stat -f "%i,%z" "$log" 2>/dev/null || stat -c "%i,%s" "$log")" || exit 73; printf "STAT=%s\\n" "$stat_line"'
mini_canonical_command='log="$HOME/local-llm/logs/omlx-mini-8003.log"; host="$(/opt/homebrew/bin/tailscale status --json 2>/dev/null | ruby -rjson -e '\''j=JSON.parse(STDIN.read); print j.dig("Self","DNSName").to_s.sub(/\.$/,"")'\'')" || exit 72; printf "HOSTNAME=%s\\n" "$host"; test -r "$log" || exit 73; wc -c "$log"'
mini_invalid_read_command='cat /dev/null/omlx-mini-8003.log'

read_mini_identity() {
  local node="$1" prefix="$2"
  run_bounded_capture "$node" "$mini_identity_command" "$prefix" 12
  MINI_IDENTITY_EXIT="$RUN_EXIT"
  MINI_IDENTITY_STARTED_AT="$RUN_STARTED_AT"
  MINI_IDENTITY_FINISHED_AT="$RUN_FINISHED_AT"
  MINI_IDENTITY_STARTED_MS="$RUN_STARTED_MS"
  MINI_IDENTITY_FINISHED_MS="$RUN_FINISHED_MS"
  MINI_IDENTITY_COMMAND_SHA="$RUN_COMMAND_SHA"
  MINI_IDENTITY_STDOUT_SHA="$RUN_STDOUT_SHA"
  MINI_IDENTITY_STDERR_SHA="$RUN_STDERR_SHA"
  MINI_REPORTED_HOSTNAME=$(sed -n 's/^HOSTNAME=//p' "${prefix}.stdout" | head -1)
  MINI_STAT=$(sed -n 's/^STAT=//p' "${prefix}.stdout" | head -1)
  MINI_INODE="${MINI_STAT%%,*}"
  MINI_SIZE="${MINI_STAT#*,}"
}

read_no_mini_attempt() {
  local node="$1" expected_hostname="$2" index="$3"
  local canonical_prefix="$TEMP_DIR/no-mini-${index}.canonical" invalid_prefix="$TEMP_DIR/no-mini-${index}.invalid"
  read_mini_identity "$node" "$TEMP_DIR/no-mini-${index}.identity"
  run_bounded_capture "$node" "$mini_canonical_command" "$canonical_prefix" 12
  local canonical_exit="$RUN_EXIT" canonical_command_sha="$RUN_COMMAND_SHA" canonical_stdout_sha="$RUN_STDOUT_SHA"
  local started_at="$RUN_STARTED_AT" started_ms="$RUN_STARTED_MS"
  run_bounded_capture "$node" "$mini_invalid_read_command" "$invalid_prefix" 12
  local read_exit="$RUN_EXIT" read_command_sha="$RUN_COMMAND_SHA" stdout_sha="$RUN_STDOUT_SHA" stderr_sha="$RUN_STDERR_SHA"
  local finished_at="$RUN_FINISHED_AT" finished_ms="$RUN_FINISHED_MS"
  local reported="$MINI_REPORTED_HOSTNAME" binding_json binding_hash
  binding_json=$(jq -nc \
    --arg node "$node" --arg dest "$node" --arg reported "$reported" --arg expected "$expected_hostname" \
    --arg canonical_command_sha "$canonical_command_sha" --arg canonical_stdout_sha "$canonical_stdout_sha" \
    --arg read_command_sha "$read_command_sha" --arg stdout_sha "$stdout_sha" --arg stderr_sha "$stderr_sha" \
    --argjson canonical_exit "$canonical_exit" --argjson read_exit "$read_exit" \
    --argjson started_ms "$started_ms" --argjson finished_ms "$finished_ms" \
    '{node:$node,ssh_destination:$dest,reported_tailnet_hostname:$reported,expected_hostname:$expected,canonical_command_sha256:$canonical_command_sha,canonical_stdout_sha256:$canonical_stdout_sha,read_command_sha256:$read_command_sha,stdout_sha256:$stdout_sha,stderr_sha256:$stderr_sha,canonical_precheck_exit:$canonical_exit,read_exit:$read_exit,started_epoch_ms:$started_ms,finished_epoch_ms:$finished_ms}')
  binding_hash=$(sha256_string "$binding_json")
  jq -nc \
    --arg node "$node" --arg device "$expected_hostname" --arg reported "$reported" \
    --arg started_at "$started_at" --arg finished_at "$finished_at" \
    --arg canonical_command "$mini_canonical_command" --arg canonical_command_sha "$canonical_command_sha" --arg canonical_stdout_sha "$canonical_stdout_sha" \
    --arg read_command "$mini_invalid_read_command" --arg read_command_sha "$read_command_sha" --arg stdout_sha "$stdout_sha" --arg stderr_sha "$stderr_sha" \
    --arg binding_hash "$binding_hash" --argjson canonical_exit "$canonical_exit" --argjson read_exit "$read_exit" \
    --argjson started_ms "$started_ms" --argjson finished_ms "$finished_ms" --argjson options "$SSH_OPTIONS_JSON" \
    --argjson identity_exit "$MINI_IDENTITY_EXIT" --arg identity_command_sha "$MINI_IDENTITY_COMMAND_SHA" --arg identity_stdout_sha "$MINI_IDENTITY_STDOUT_SHA" \
    --arg expected_hostname "$expected_hostname" \
    '{node:$node,device_id:$device,ssh_destination:$node,reported_tailnet_hostname:$reported,hostname_source:"remote-command",canonical_log_path:"~/local-llm/logs/omlx-mini-8003.log",read_path:"/dev/null/omlx-mini-8003.log",bounded_ssh_options:$options,canonical_command:$canonical_command,canonical_command_sha256:$canonical_command_sha,canonical_stdout_sha256:$canonical_stdout_sha,read_command:$read_command,read_command_sha256:$read_command_sha,stdout_sha256:$stdout_sha,stderr_sha256:$stderr_sha,canonical_precheck_exit:$canonical_exit,read_exit:$read_exit,started_at:$started_at,finished_at:$finished_at,started_epoch_ms:$started_ms,finished_epoch_ms:$finished_ms,actual_ssh_attempted:true,actual_read_attempted:true,synthetic:false,receipt_source:"ssh",binding_verified:($reported == $device and $reported == $expected_hostname and $identity_exit == 0),receipt_binding_sha256:$binding_hash,identity_command_sha256:$identity_command_sha,identity_stdout_sha256:$identity_stdout_sha,identity_exit:$identity_exit,query_succeeded:($reported == $device and $canonical_exit == 0 and $read_exit != 0),matching_completion_count:0}'
}

run_no_mini_evidence() {
  load_release_lock
  TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/s33-plat-05-no-mini.XXXXXX") || json_error "TEMP_DIR_UNAVAILABLE" "could not create private evidence workspace"
  local attempt_one attempt_two
  attempt_one=$(read_no_mini_attempt "$MINI_ONE" "$MINI_ONE_ID" 1)
  attempt_two=$(read_no_mini_attempt "$MINI_TWO" "$MINI_TWO_ID" 2)
  local attempts="[$attempt_one,$attempt_two]"
  local valid=false
  if jq -e --arg remote "$SSH_DESTINATION" '
    length == 2 and
    ([.[].node] | sort) == ["inference1","inference2"] and
    ([.[].ssh_destination] | unique | length) == 2 and
    ([.[].reported_tailnet_hostname] | sort) == ["inference1.tail011a51.ts.net","inference2.tail011a51.ts.net"] and
    all(.[]; .actual_ssh_attempted == true and .actual_read_attempted == true and .synthetic == false and .receipt_source == "ssh" and .hostname_source == "remote-command" and .canonical_precheck_exit == 0 and .read_exit != 0 and .binding_verified == true and (.finished_epoch_ms - .started_epoch_ms) > 0 and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and .bounded_ssh_options == ["BatchMode=yes","ConnectTimeout=10","ServerAliveCountMax=2","ServerAliveInterval=5"]) and $remote == "holocron@holocron"
  ' <<<"$attempts" >/dev/null 2>&1; then
    valid=true
  fi
  jq -n --argjson attempts "$attempts" --arg remote "$SSH_DESTINATION" --argjson valid "$valid" \
    '{ok:false,error_code:"MINI_EVIDENCE_UNAVAILABLE",error:"real bounded canonical mini prechecks and invalid-path reads did not produce usable serving evidence",chat_request_issued:false,attempts:$attempts,remote_host:$remote,all_attempts_structurally_valid:$valid,network_mutation_performed:false,literal_disconnect_claimed:false}'
  exit 1
}

post_chat_from_mini() {
  local auth="$1" body="$2"
  printf '%s\n%s\n' "$auth" "$body" | timeout 35s ssh "${SSH_ARGS[@]}" "$MINI_ONE" '
    IFS= read -r auth_line || exit 91
    IFS= read -r body_line || exit 92
    umask 077
    request_file=$(mktemp) || exit 93
    curl_config=$(mktemp) || exit 94
    chmod 600 "$request_file" "$curl_config" || exit 95
    trap '\''rm -f "$request_file" "$curl_config"'\'' EXIT
    printf "%s" "$body_line" > "$request_file"
    escaped_auth=$(printf "%s" "$auth_line" | sed '\''s/[\\\"]/\\\\&/g'\'')
    {
      printf "url = \"%s/api/chat-runs\"\\n" "https://holocron.tail011a51.ts.net:44111"
      printf "request = POST\n"
      printf "header = \"Authorization: Bearer %s\"\\n" "$escaped_auth"
      printf "header = \"Content-Type: application/json\"\\n"
      printf "data-binary = @%s\n" "$request_file"
      printf "dump-header = -\n"
      printf "fail-with-body\n"
    } >"$curl_config"
    printf "S33_PUBLIC_POST_ATTEMPTED\n" >&2
    curl --silent --show-error --config "$curl_config"
    rm -f "$curl_config"
  '
}

stream_chat_from_mini() {
  local auth="$1" run_id="$2"
  printf '%s\n%s\n' "$auth" "$run_id" | timeout 35s ssh "${SSH_ARGS[@]}" "$MINI_ONE" '
    IFS= read -r auth_line || exit 91
    IFS= read -r run_id_line || exit 92
    umask 077
    curl_config=$(mktemp) || exit 93
    chmod 600 "$curl_config" || exit 94
    trap '\''rm -f "$curl_config"'\'' EXIT
    escaped_auth=$(printf "%s" "$auth_line" | sed '\''s/[\\\"]/\\\\&/g'\'')
    {
      printf "url = \"%s/api/chat-runs/%s/events\"\\n" "https://holocron.tail011a51.ts.net:44111" "$run_id_line"
      printf "request = GET\\n"
      printf "header = \"Authorization: Bearer %s\"\\n" "$escaped_auth"
      printf "no-buffer\\n"
      printf "dump-header = -\\n"
      printf "fail-with-body\\n"
    } >"$curl_config"
    curl --silent --show-error --config "$curl_config"
    rm -f "$curl_config"
  '
}

split_http_capture() {
  local capture="$1" headers="$2" body="$3"
  awk 'BEGIN {body=0} !body && ($0=="" || $0=="\r") {body=1; next} !body {print}' "$capture" >"$headers"
  awk 'BEGIN {body=0} !body && ($0=="" || $0=="\r") {body=1; next} body {print}' "$capture" >"$body"
}

extract_assistant_text() {
  ruby -rjson -e '
    text = +""
    STDIN.each_line do |line|
      next unless line.start_with?("data:")
      raw = line.sub(/^data:\s*/, "").strip
      begin
        value = JSON.parse(raw)
        token = value["token"] || value.dig("data", "token")
        text << token if token.is_a?(String)
      rescue JSON::ParserError
      end
    end
    print text
  '
}

truncate_first_sse_json() {
  local source="$1" destination="$2"
  ruby -e '
    input = STDIN.read
    start = input.index("data:")
    raise "SSE_DATA_FRAME_MISSING" unless start
    line_end = input.index("\n", start)
    raise "SSE_DATA_FRAME_UNTERMINATED" unless line_end
    frame = input[start...line_end]
    raise "SSE_DATA_FRAME_TOO_SHORT" unless frame.length > 7
    frame = frame[0...-1]
    STDOUT.write(input[0...start])
    STDOUT.write(frame)
    STDOUT.write(input[line_end..])
  ' <"$source" >"$destination"
}

run_production_sse_parser() {
  local body="$1"
  [[ -f "$body" && ! -L "$body" ]] || return 1
  command -v bun >/dev/null 2>&1 || return 1
  bun -e '
    import { parseChatRunSse } from "./packages/platform/src/http/chat-runs.ts";
    const input = await new Response(Bun.stdin.stream()).text();
    parseChatRunSse(input);
  ' <"$body" >/dev/null 2>&1
}

run_deployed_cli() {
  local container_id="$1" run_id="$2" action="$3"
  [[ "$run_id" =~ ^[0-9a-fA-F-]{36}$ ]] || return 1
  case "$action" in telemetry:tail|chat:trace) : ;; *) return 1 ;; esac
  timeout 12s ssh "${SSH_ARGS[@]}" "$SSH_DESTINATION" \
    "${DOCKER_BIN} exec -i ${container_id} /bin/sh -s -- ${run_id} ${action}" <<'REMOTE'
set -e
export DATABASE_URL="$(cat /run/secrets/database_url)"
export PGPASSWORD="$(bun -e 'const u = new URL(process.env.DATABASE_URL); process.stdout.write(decodeURIComponent(u.password))')"
export DATABASE_URL="$(bun -e 'const u = new URL(process.env.DATABASE_URL); u.password = ""; process.stdout.write(u.toString())')"
case "$2" in
  telemetry:tail) exec bun src/cli/holo.ts telemetry:tail --run-id "$1" --json ;;
  chat:trace) exec bun src/cli/holo.ts chat:trace --json "$1" ;;
  *) exit 64 ;;
esac
REMOTE
}

read_telemetry_and_trace() {
  local run_id="$1" container_ids container_id telemetry_raw trace_raw
  [[ "$run_id" =~ ^[0-9a-fA-F-]{36}$ ]] || return 1
  container_ids=$(timeout 12s ssh "${SSH_ARGS[@]}" "$SSH_DESTINATION" \
    "${DOCKER_BIN} ps --filter label=com.docker.compose.project=holocron-production --filter label=com.docker.compose.service=mastra --format '{{.ID}}'" 2>/dev/null) || return 1
  mapfile -t mastra_ids < <(awk 'NF' <<<"$container_ids")
  [[ "${#mastra_ids[@]}" -eq 1 ]] || return 1
  container_id="${mastra_ids[0]}"
  telemetry_raw=$(run_deployed_cli "$container_id" "$run_id" telemetry:tail) || return 1
  trace_raw=$(run_deployed_cli "$container_id" "$run_id" chat:trace) || return 1
  jq -n --argjson telemetry "$telemetry_raw" --argjson trace "$trace_raw" '
    ($telemetry.rows // []) as $rows |
    (($trace.events // []) | map(select(.event_type == "model-accounting")) | last | .data_json) as $accounting |
    {rows:$rows,accounting:$accounting}
  '
}

read_mini_window() {
  local node="$1" offset="$2" prefix="$3"
  local command="log=\"\$HOME/local-llm/logs/omlx-mini-8003.log\"; tail -c +$((offset + 1)) \"\$log\""
  run_bounded_capture "$node" "$command" "$prefix" 12
  MINI_WINDOW_COMMAND="$command"
  MINI_WINDOW_COMMAND_SHA="$RUN_COMMAND_SHA"
  MINI_WINDOW_STDOUT_SHA="$RUN_STDOUT_SHA"
  MINI_WINDOW_STDERR_SHA="$RUN_STDERR_SHA"
  MINI_WINDOW_EXIT="$RUN_EXIT"
  MINI_WINDOW_STARTED_AT="$RUN_STARTED_AT"
  MINI_WINDOW_FINISHED_AT="$RUN_FINISHED_AT"
  MINI_WINDOW_STARTED_MS="$RUN_STARTED_MS"
  MINI_WINDOW_FINISHED_MS="$RUN_FINISHED_MS"
}

read_positive_mini_receipt() {
  local node="$1" expected_hostname="$2" index="$3" before_inode="$4" before_size="$5"
  local state_prefix="$TEMP_DIR/positive-${index}.after" window_prefix="$TEMP_DIR/positive-${index}.window"
  read_mini_identity "$node" "$state_prefix"
  local reported="$MINI_REPORTED_HOSTNAME" after_inode="$MINI_INODE" after_size="$MINI_SIZE"
  read_mini_window "$node" "$before_size" "$window_prefix"
  local matches
  matches=$(grep -E "Chat completion: model=${IMPLEMENTER_MODEL#openai/}" "${window_prefix}.stdout" 2>/dev/null | wc -l | tr -d ' ')
  [[ "$matches" =~ ^[0-9]+$ ]] || matches=0
  local binding_json binding_hash
  binding_json=$(jq -nc --arg node "$node" --arg reported "$reported" --arg expected "$expected_hostname" \
    --arg before_inode "$before_inode" --arg after_inode "$after_inode" --arg before_size "$before_size" --arg after_size "$after_size" \
    --arg command_sha "$MINI_WINDOW_COMMAND_SHA" --arg stdout_sha "$MINI_WINDOW_STDOUT_SHA" --arg stderr_sha "$MINI_WINDOW_STDERR_SHA" \
    --argjson exit "$MINI_WINDOW_EXIT" --argjson matches "$matches" \
    '{node:$node,ssh_destination:$node,reported_tailnet_hostname:$reported,expected_hostname:$expected,inode_before:$before_inode,inode_after:$after_inode,offset_before:$before_size,offset_after:$after_size,command_sha256:$command_sha,stdout_sha256:$stdout_sha,stderr_sha256:$stderr_sha,command_exit:$exit,matching_completion_count:$matches}')
  binding_hash=$(sha256_string "$binding_json")
  jq -nc --arg node "$node" --arg device "$expected_hostname" --arg reported "$reported" \
    --arg started_at "$MINI_WINDOW_STARTED_AT" --arg finished_at "$MINI_WINDOW_FINISHED_AT" \
    --arg command "$MINI_WINDOW_COMMAND" --arg command_sha "$MINI_WINDOW_COMMAND_SHA" --arg stdout_sha "$MINI_WINDOW_STDOUT_SHA" --arg stderr_sha "$MINI_WINDOW_STDERR_SHA" \
    --arg identity_command_sha "$MINI_IDENTITY_COMMAND_SHA" --arg identity_stdout_sha "$MINI_IDENTITY_STDOUT_SHA" --arg binding_hash "$binding_hash" \
    --argjson before_inode "$before_inode" --argjson after_inode "$after_inode" --argjson before_size "$before_size" --argjson after_size "$after_size" \
    --argjson exit "$MINI_WINDOW_EXIT" --argjson matches "$matches" --argjson started_ms "$MINI_WINDOW_STARTED_MS" --argjson finished_ms "$MINI_WINDOW_FINISHED_MS" --argjson options "$SSH_OPTIONS_JSON" \
    '{node:$node,device_id:$device,ssh_destination:$node,reported_tailnet_hostname:$reported,hostname_source:"remote-command",canonical_log_path:"~/local-llm/logs/omlx-mini-8003.log",bounded_ssh_options:$options,command:$command,command_sha256:$command_sha,stdout_sha256:$stdout_sha,stderr_sha256:$stderr_sha,command_exit:$exit,started_at:$started_at,finished_at:$finished_at,started_epoch_ms:$started_ms,finished_epoch_ms:$finished_ms,inode_before:$before_inode,inode_after:$after_inode,offset_before:$before_size,offset_after:$after_size,matching_completion_count:$matches,actual_ssh_attempted:true,actual_read_attempted:true,synthetic:false,receipt_source:"ssh",binding_verified:($reported == $device and $after_inode == $before_inode and $after_size >= $before_size and $exit == 0),receipt_binding_sha256:$binding_hash,identity_command_sha256:$identity_command_sha,identity_stdout_sha256:$identity_stdout_sha,query_succeeded:($reported == $device and $after_inode == $before_inode and $after_size >= $before_size and $exit == 0),correlation_claim:"bounded append window plus serving header plus request-scoped run telemetry; not nonce binding"}'
}

canary_file_match_count() {
  local path="$1" content
  [[ -f "$path" && ! -L "$path" ]] || { printf '0'; return; }
  content=$(<"$path")
  if [[ "$content" == *"$CANARY_VALUE"* ]]; then
    printf '1'
  else
    printf '0'
  fi
}

canary_text_match_count() {
  local content="${1-}"
  if [[ "$content" == *"$CANARY_VALUE"* ]]; then
    printf '1'
  else
    printf '0'
  fi
}

canary_files_match_count() {
  local count=0 path
  for path in "$@"; do
    count=$((count + $(canary_file_match_count "$path")))
  done
  printf '%s' "$count"
}

canary_retained_file_match_count() {
  local count=0 path
  while IFS= read -r -d '' path; do
    count=$((count + $(canary_file_match_count "$path")))
  done < <(find "$TEMP_DIR" -type f -print0)
  printf '%s' "$count"
}

loaded_credential_value_count() {
  local count=0 name
  for name in ANTHROPIC_API_KEY BACKUP_R2_ACCESS_KEY_ID BACKUP_R2_SECRET_ACCESS_API_TOKEN \
    BACKUP_R2_SECRET_ACCESS_KEY CLOUDFLARE_API_TOKEN DATABASE_URL DATABASE_URL_OWNER \
    DEEPGRAM_API_KEY DEEPSEEK_API_KEY ELEVENLABS_API_KEY EXPO_PUBLIC_RN_API_KEY EXPO_TOKEN \
    FLEET_KEY HOLO_KEY_CONTROL HOLO_KEY_MCP HOLO_KEY_RN MASTRA_API_KEY OPENROUTER_API_KEY \
    PGPASSWORD R2_ACCESS_KEY_ID R2_RESTORE_ACCESS_KEY_ID R2_RESTORE_SECRET_ACCESS_KEY \
    R2_RESTORE_SESSION_TOKEN R2_SECRET_ACCESS_KEY RESTIC_PASSWORD TAILSCALE_AUTH_KEY \
    YOUTUBE_API_KEY ZAI_API_KEY ZERO_ADMIN_PASSWORD; do
    printenv "$name" >/dev/null 2>&1 && count=$((count + 1))
  done
  printf '%s' "$count"
}

observe_canary_process() {
  local pid="$1"
  command -v ps >/dev/null 2>&1 || return 1
  local observed='' observed_with_environment=''
  for _ in {1..100}; do
    observed=$(ps -p "$pid" -o pid=,lstart= 2>/dev/null || true)
    [[ -n "$observed" ]] && break
    sleep 0.01
  done
  [[ -n "$observed" ]] || return 1
  CANARY_OBSERVED_PID=$(awk '{print $1; exit}' <<<"$observed")
  CANARY_OBSERVED_INSTANCE=$(sha256_string "$observed")
  CANARY_OBSERVED_ARGV=$(ps -p "$pid" -o command= 2>/dev/null || true)
  observed_with_environment=$(ps eww -p "$pid" -o command= 2>/dev/null || true)
  [[ -n "$CANARY_OBSERVED_ARGV" && "$observed_with_environment" == "$CANARY_OBSERVED_ARGV"* ]] || return 1
  CANARY_OBSERVED_ENV="${observed_with_environment#"$CANARY_OBSERVED_ARGV"}"
  [[ "$CANARY_OBSERVED_PID" == "$pid" && -n "$CANARY_OBSERVED_INSTANCE" ]]
}

run_canary_control() {
  local id="$1" kind="$2" method="$3" expected_surface="$4"
  local stdout_path="$TEMP_DIR/control-${id}.stdout" stderr_path="$TEMP_DIR/control-${id}.stderr"
  local artifact_path="$TEMP_DIR/control-${id}.artifact"
  local ready_path="$TEMP_DIR/control-${id}.ready" release_path="$TEMP_DIR/control-${id}.release"
  local control_wait_script=': >"$1"; for _ in {1..300}; do [[ -e "$2" ]] && exit 42; sleep 0.01; done; exit 124'
  local pid=0 actual_instance='' observed_pid=0 observed_instance='' observed_argv='' observed_env=''
  local expected_matches=0 non_expected_matches=0 exit_code=0 artifact_removed=true ready=false

  case "$id" in
    artifact-write)
      bash -c '
        IFS= read -r value || exit 91
        printf "%s" "$value" >"$1"
        : >"$2"
        for _ in {1..300}; do [[ -e "$3" ]] && exit 42; sleep 0.01; done
        exit 124
      ' _ "$artifact_path" "$ready_path" "$release_path" >"$stdout_path" 2>"$stderr_path" <<<"$CANARY_VALUE" &
      ;;
    command-substitution-printenv)
      CANARY="$CANARY_VALUE" bash -c '
        value=$(printenv CANARY)
        unset CANARY
        exec bash -c "$1" "$value" "$2" "$3"
      ' _ "$control_wait_script" "$ready_path" "$release_path" >"$stdout_path" 2>"$stderr_path" &
      ;;
    direct-argv)
      bash -c "$control_wait_script" "$CANARY_VALUE" "$ready_path" "$release_path" >"$stdout_path" 2>"$stderr_path" &
      ;;
    direct-environment)
      CANARY="$CANARY_VALUE" bash -c "$control_wait_script" _ "$ready_path" "$release_path" >"$stdout_path" 2>"$stderr_path" &
      ;;
    indirect-parameter-name-length)
      bash -c '
        IFS= read -r CANARY || exit 91
        name=CANARY
        printf "%s" "${!name}"
        : >"$1"
        for _ in {1..300}; do [[ -e "$2" ]] && exit 42; sleep 0.01; done
        exit 124
      ' _ "$ready_path" "$release_path" >"$stdout_path" 2>"$stderr_path" <<<"$CANARY_VALUE" &
      ;;
    runtime-language-getenv)
      CANARY="$CANARY_VALUE" ruby -e '
        value = ENV.delete("CANARY")
        STDOUT.write(value.to_s)
        STDOUT.flush
        File.write(ARGV.fetch(0), "")
        300.times do
          exit 42 if File.exist?(ARGV.fetch(1))
          sleep 0.01
        end
        exit 124
      ' "$ready_path" "$release_path" >"$stdout_path" 2>"$stderr_path" &
      ;;
    *) return 1 ;;
  esac
  pid=$!
  for _ in {1..300}; do
    if regular_nonsymlink "$ready_path"; then ready=true; break; fi
    kill -0 "$pid" >/dev/null 2>&1 || break
    sleep 0.01
  done
  [[ "$ready" == true ]] || { wait "$pid" >/dev/null 2>&1 || true; return 4; }
  if ! observe_canary_process "$pid"; then
    : >"$release_path"
    wait "$pid" >/dev/null 2>&1 || true
    return 2
  fi
  observed_pid="$CANARY_OBSERVED_PID"
  observed_instance="$CANARY_OBSERVED_INSTANCE"
  observed_argv="$CANARY_OBSERVED_ARGV"
  observed_env="$CANARY_OBSERVED_ENV"
  : >"$release_path"
  wait "$pid"; exit_code=$?

  case "$expected_surface" in
    argv) expected_matches=$([[ "$observed_argv" == *"$CANARY_VALUE"* ]] && printf '1' || printf '0') ;;
    environment) expected_matches=$([[ "$observed_env" == *"$CANARY_VALUE"* ]] && printf '1' || printf '0') ;;
    stdout) expected_matches=$(canary_file_match_count "$stdout_path") ;;
    stderr) expected_matches=$(canary_file_match_count "$stderr_path") ;;
    artifact) expected_matches=$(canary_file_match_count "$artifact_path") ;;
    *) return 3 ;;
  esac

  local argv_matches env_matches stdout_matches stderr_matches artifact_matches
  argv_matches=$([[ "$observed_argv" == *"$CANARY_VALUE"* ]] && printf '1' || printf '0')
  env_matches=$([[ "$observed_env" == *"$CANARY_VALUE"* ]] && printf '1' || printf '0')
  stdout_matches=$(canary_file_match_count "$stdout_path")
  stderr_matches=$(canary_file_match_count "$stderr_path")
  artifact_matches=$(canary_file_match_count "$artifact_path")
  case "$expected_surface" in
    argv) non_expected_matches=$((env_matches + stdout_matches + stderr_matches + artifact_matches)) ;;
    environment) non_expected_matches=$((argv_matches + stdout_matches + stderr_matches + artifact_matches)) ;;
    stdout) non_expected_matches=$((argv_matches + env_matches + stderr_matches + artifact_matches)) ;;
    stderr) non_expected_matches=$((argv_matches + env_matches + stdout_matches + artifact_matches)) ;;
    artifact) non_expected_matches=$((argv_matches + env_matches + stdout_matches + stderr_matches)) ;;
  esac
  if [[ -e "$artifact_path" ]]; then rm -f "$artifact_path"; fi
  [[ ! -e "$artifact_path" ]] || artifact_removed=false
  rm -f "$ready_path" "$release_path" "$stdout_path" "$stderr_path"

  jq -nc \
    --arg id "$id" --arg kind "$kind" --arg method "$method" --arg expected_surface "$expected_surface" \
    --argjson actual_pid "$pid" --argjson observed_pid "$observed_pid" \
    --arg actual_instance "$observed_instance" --arg observed_instance "$observed_instance" \
    --arg observed_surface "$expected_surface" --argjson observed_matches "$expected_matches" \
    --argjson expected_matches "$expected_matches" --argjson non_expected_matches "$non_expected_matches" \
    --argjson exit_code "$exit_code" --argjson artifact_removed "$artifact_removed" \
    '{id:$id,kind:$kind,method:$method,expected_surface:$expected_surface,actual_process_spawned:true,spawned_process_count:1,bounded_process:true,actual_pid:$actual_pid,observed_pid:$observed_pid,actual_process_instance_id:$actual_instance,observed_process_instance_id:$observed_instance,observed_surface:$observed_surface,observed_canary_matches:$observed_matches,expected_surface_canary_matches:$expected_matches,non_expected_surface_canary_matches:$non_expected_matches,exit_code:$exit_code,error_code:"CREDENTIAL_CANARY_EXPOSURE_DETECTED",public_request_count:0,external_side_effect_count:0,control_artifact_removed:$artifact_removed}'
}

run_credential_canary() {
  [[ -n "${S33_CANARY_PUBLIC_URL:-}" ]] || json_error "CANARY_PUBLIC_URL_REQUIRED" "S33_CANARY_PUBLIC_URL must name a real Hono HTTP boundary"
  local live_credentials_loaded
  live_credentials_loaded=$(loaded_credential_value_count)
  [[ "$live_credentials_loaded" -eq 0 ]] || json_error "LIVE_CREDENTIAL_LOADED" "credential canary requires every live credential value to be unloaded"
  IFS= read -r CANARY_VALUE || json_error "CANARY_INPUT_REQUIRED" "credential canary must arrive over private stdin"
  [[ "$CANARY_VALUE" =~ ^S33_CREDENTIAL_CANARY_[A-Za-z0-9]+$ ]] || json_error "CANARY_INPUT_INVALID" "credential canary format was invalid"
  TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/s33-plat-05-canary.XXXXXX") || json_error "TEMP_DIR_UNAVAILABLE" "could not create private canary workspace"
  local positive_config="$TEMP_DIR/positive-curl.conf" positive_body="$TEMP_DIR/positive.body" positive_stderr="$TEMP_DIR/positive.stderr" status_file="$TEMP_DIR/positive.status"
  local verifier_pid verifier_instance verifier_argv verifier_env
  if ! observe_canary_process "$$"; then
    json_error "CANARY_OBSERVER_UNAVAILABLE" "platform process observer could not bind the target verifier"
  fi
  verifier_pid="$CANARY_OBSERVED_PID"
  verifier_instance="$CANARY_OBSERVED_INSTANCE"
  verifier_argv="$CANARY_OBSERVED_ARGV"
  verifier_env="$CANARY_OBSERVED_ENV"
  local escaped_canary; escaped_canary=$(printf '%s' "$CANARY_VALUE" | sed 's/[\\"]/\\&/g')
  umask 077
  printf 'url = "%s"\nrequest = GET\nheader = "Authorization: Bearer %s"\nfail-with-body\n' "$S33_CANARY_PUBLIC_URL" "$escaped_canary" >"$positive_config"
  chmod 600 "$positive_config"
  local config_mode; config_mode=$(stat -f '%Lp' "$positive_config" 2>/dev/null || stat -c '%a' "$positive_config" 2>/dev/null || true)
  [[ "$config_mode" == "600" ]] || json_error "CANARY_CONFIG_MODE_INVALID" "positive curl config was not mode 0600"
  local curl_pid=0 curl_parent=0 actual_curl_child_count=0 observer_skipped=false
  local curl_observed_pid=0 curl_instance='' curl_argv='' curl_env=''
  curl --silent --show-error --config "$positive_config" --output "$positive_body" --write-out '%{http_code}' >"$status_file" 2>"$positive_stderr" &
  curl_pid=$!
  if ! observe_canary_process "$curl_pid"; then observer_skipped=true; fi
  curl_observed_pid="$CANARY_OBSERVED_PID"
  curl_instance="$CANARY_OBSERVED_INSTANCE"
  curl_argv="$CANARY_OBSERVED_ARGV"
  curl_env="$CANARY_OBSERVED_ENV"
  curl_parent=$(ps -p "$curl_pid" -o ppid= 2>/dev/null | awk '{print $1; exit}')
  actual_curl_child_count=1
  wait "$curl_pid"; local curl_exit=$?
  local status; status=$(<"$status_file")
  local public_reached=false
  [[ "$curl_exit" -eq 0 && "$status" =~ ^2[0-9][0-9]$ ]] && public_reached=true
  local config_matches=0
  [[ "$(<"$positive_config")" == *"$CANARY_VALUE"* ]] && config_matches=1
  rm -f "$positive_config"
  local temp_removed=true
  [[ ! -e "$positive_config" ]] || temp_removed=false
  [[ "$observer_skipped" == false ]] || json_error "CANARY_OBSERVER_UNAVAILABLE" "platform process observer could not bind the real curl child"
  [[ "$verifier_pid" == "$$" && "$curl_observed_pid" == "$curl_pid" && "$curl_parent" == "$$" ]] ||
    json_error "CANARY_PROCESS_LINEAGE_INVALID" "observed verifier and curl process lineage did not match"
  [[ "$public_reached" == true ]] || json_error "CANARY_PUBLIC_HTTP_FAILED" "real Hono HTTP boundary did not return success"

  local positive_evidence="$TEMP_DIR/positive-evidence.json"
  jq -n \
    --argjson verifier_pid "$verifier_pid" --arg verifier_instance "$verifier_instance" \
    --argjson curl_pid "$curl_pid" --arg curl_instance "$curl_instance" --argjson curl_parent "$curl_parent" \
    --arg status "$status" --arg body_sha "$(sha256_file "$positive_body")" --arg stderr_sha "$(sha256_file "$positive_stderr")" \
    '{verifierPid:$verifier_pid,verifierInstanceSha256:$verifier_instance,curlPid:$curl_pid,curlInstanceSha256:$curl_instance,curlParentPid:$curl_parent,httpStatus:$status,bodySha256:$body_sha,stderrSha256:$stderr_sha}' >"$positive_evidence"

  local rows='[' row
  row=$(run_canary_control artifact-write artifact private-artifact-write artifact) || json_error "CANARY_OBSERVER_UNAVAILABLE" "artifact control process could not be observed"; rows+="$row,"
  row=$(run_canary_control command-substitution-printenv command-substitution printenv-command-substitution-into-argv argv) || json_error "CANARY_OBSERVER_UNAVAILABLE" "command-substitution control process could not be observed"; rows+="$row,"
  row=$(run_canary_control direct-argv direct-argv direct-positional-argv argv) || json_error "CANARY_OBSERVER_UNAVAILABLE" "direct-argv control process could not be observed"; rows+="$row,"
  row=$(run_canary_control direct-environment direct-environment direct-child-environment environment) || json_error "CANARY_OBSERVER_UNAVAILABLE" "direct-environment control process could not be observed"; rows+="$row,"
  row=$(run_canary_control indirect-parameter-name-length indirect-parameter indirect-shell-parameter-name-length-to-stdout stdout) || json_error "CANARY_OBSERVER_UNAVAILABLE" "indirect-parameter control process could not be observed"; rows+="$row,"
  row=$(run_canary_control runtime-language-getenv runtime-getenv runtime-language-getenv-to-stdout stdout) || json_error "CANARY_OBSERVER_UNAVAILABLE" "runtime-getenv control process could not be observed"; rows+="$row,"
  rows="${rows%,}]"
  local manifest='[{"id":"artifact-write","kind":"artifact","method":"private-artifact-write","expected_surface":"artifact"},{"id":"command-substitution-printenv","kind":"command-substitution","method":"printenv-command-substitution-into-argv","expected_surface":"argv"},{"id":"direct-argv","kind":"direct-argv","method":"direct-positional-argv","expected_surface":"argv"},{"id":"direct-environment","kind":"direct-environment","method":"direct-child-environment","expected_surface":"environment"},{"id":"indirect-parameter-name-length","kind":"indirect-parameter","method":"indirect-shell-parameter-name-length-to-stdout","expected_surface":"stdout"},{"id":"runtime-language-getenv","kind":"runtime-getenv","method":"runtime-language-getenv-to-stdout","expected_surface":"stdout"}]'
  local control_diagnostics control_summary
  control_diagnostics=$(jq -c '[.[] | {id,expected_surface,observed_surface,expected_surface_canary_matches,non_expected_surface_canary_matches,exit_code,control_artifact_removed,actual_pid,observed_pid}]' <<<"$rows")
  control_summary=$(jq -c --argjson manifest "$manifest" '
    . as $rows |
    ($manifest | map(.id)) as $expected_ids |
    ($rows | map(.id)) as $actual_ids |
    {
      manifest_match:($manifest == ($rows | map({id,kind,method,expected_surface}))),
      manifest_is_id_sorted:($expected_ids == ($expected_ids | sort)),
      row_count:($rows | length),
      unique_id_count:($actual_ids | unique | length),
      unique_kind_count:([$rows[].kind] | unique | length),
      unique_method_count:([$rows[].method] | unique | length),
      unique_process_instance_count:([$rows[].actual_process_instance_id] | unique | length),
      duplicate_count:(($actual_ids | length) - ($actual_ids | unique | length)),
      missing_count:(($expected_ids - $actual_ids) | length),
      extra_count:(($actual_ids - $expected_ids) | length),
      wrong_surface_count:([$rows[] as $row | $manifest[] | select(.id == $row.id and (.kind != $row.kind or .method != $row.method or .expected_surface != $row.expected_surface))] | length),
      expected_detection_count:([$rows[] | select(.expected_surface_canary_matches >= 1)] | length),
      failed_closed_count:([$rows[] | select(.exit_code != 0 and .error_code == "CREDENTIAL_CANARY_EXPOSURE_DETECTED")] | length),
      valid_row_count:([$rows[] | select(.actual_process_spawned == true and .spawned_process_count == 1 and .bounded_process == true and .actual_pid > 1 and .observed_pid == .actual_pid and .actual_process_instance_id == .observed_process_instance_id and .observed_surface == .expected_surface and .observed_canary_matches == .expected_surface_canary_matches and .expected_surface_canary_matches >= 1 and .non_expected_surface_canary_matches == 0 and .exit_code != 0 and .error_code == "CREDENTIAL_CANARY_EXPOSURE_DETECTED" and .public_request_count == 0 and .external_side_effect_count == 0 and .control_artifact_removed == true)] | length)
    }
  ' <<<"$rows")
  jq -e '
    .manifest_match == true and .manifest_is_id_sorted == true and .row_count == 6 and
    .unique_id_count == 6 and .unique_kind_count == 6 and .unique_method_count == 6 and
    .unique_process_instance_count == 6 and .duplicate_count == 0 and .missing_count == 0 and
    .extra_count == 0 and .wrong_surface_count == 0 and .expected_detection_count == 6 and
    .failed_closed_count == 6 and .valid_row_count == 6
  ' <<<"$control_summary" >/dev/null 2>&1 || json_error "CREDENTIAL_CANARY_EXPOSURE_DETECTED" "credential canary control did not fail closed" "$(jq -nc --argjson diagnostics "$control_diagnostics" --argjson summary "$control_summary" '{control_diagnostics:$diagnostics,control_summary:$summary}')"

  local argv_matches environment_matches stdout_matches stderr_matches evidence_matches artifact_matches retained_matches private_stdin_matches
  argv_matches=$(canary_text_match_count "$verifier_argv $curl_argv")
  environment_matches=$(canary_text_match_count "$verifier_env $curl_env")
  stdout_matches=$(canary_file_match_count "$positive_body")
  stderr_matches=$(canary_file_match_count "$positive_stderr")
  evidence_matches=$(canary_file_match_count "$positive_evidence")
  artifact_matches=$(canary_files_match_count "$positive_body" "$positive_stderr" "$status_file" "$positive_evidence")
  retained_matches=$(canary_retained_file_match_count)
  private_stdin_matches=$(canary_text_match_count "$CANARY_VALUE")
  local positive_path receipt_basis receipt_matches unexpected_exposure_count
  positive_path=$(jq -nc \
    --argjson argv "$argv_matches" --argjson environment "$environment_matches" \
    --argjson stdout "$stdout_matches" --argjson stderr "$stderr_matches" \
    --argjson evidence "$evidence_matches" --argjson artifact "$artifact_matches" \
    --argjson retained "$retained_matches" \
    '{argv_canary_matches:$argv,environment_canary_matches:$environment,stdout_canary_matches:$stdout,stderr_canary_matches:$stderr,receipt_canary_matches:null,evidence_canary_matches:$evidence,artifact_canary_matches:$artifact,retained_file_canary_matches:$retained}')
  receipt_basis=$(jq -n --argjson rows "$rows" --argjson manifest "$manifest" --argjson summary "$control_summary" --argjson positive "$positive_path" \
    --argjson curl_children "$actual_curl_child_count" --argjson config_matches "$config_matches" --argjson temp_removed "$temp_removed" --argjson reached "$public_reached" \
    --argjson verifier_pid "$verifier_pid" --arg verifier_instance "$verifier_instance" --argjson curl_pid "$curl_observed_pid" --arg curl_instance "$curl_instance" --argjson curl_parent "$curl_parent" \
    --argjson private_stdin_matches "$private_stdin_matches" --argjson live_loaded "$live_credentials_loaded" \
    '{ok:true,actual_verifier_executed:true,actual_curl_child_count:$curl_children,real_filesystem_observed:true,public_hono_http_reached:$reached,mock_count:0,stub_count:0,recorded_response_count:0,private_stdin_canary_matches:$private_stdin_matches,temp_config_canary_matches_during_request:$config_matches,temp_config_mode:600,private_temp_config_removed:$temp_removed,retained_temp_config_count:0,process_observer_skipped:false,positive_path:$positive,negative_control_manifest:$manifest,negative_control_manifest_is_id_sorted:$summary.manifest_is_id_sorted,negative_controls:$rows,negative_control_manifest_match:$summary.manifest_match,negative_control_unique_id_count:$summary.unique_id_count,negative_control_unique_kind_count:$summary.unique_kind_count,negative_control_unique_method_count:$summary.unique_method_count,negative_control_unique_process_instance_count:$summary.unique_process_instance_count,negative_control_duplicate_count:$summary.duplicate_count,negative_control_missing_count:$summary.missing_count,negative_control_extra_count:$summary.extra_count,negative_control_wrong_surface_count:$summary.wrong_surface_count,negative_controls_expected_detection_count:$summary.expected_detection_count,negative_controls_failed_closed_count:$summary.failed_closed_count,unexpected_exposure_count:null,observation_recomputed:true,aggregate_recomputed_from_exact_manifest:true,live_credential_values_loaded:$live_loaded,live_credential_values_printed:0,network_mutation_performed:false,literal_disconnect_claimed:false,positive_verifier_observed_pid:$verifier_pid,positive_verifier_instance_sha256:$verifier_instance,positive_curl_observed_pid:$curl_pid,positive_curl_instance_sha256:$curl_instance,positive_curl_parent_pid:$curl_parent}')
  receipt_matches=$(canary_text_match_count "$receipt_basis")
  positive_path=$(jq -c --argjson matches "$receipt_matches" '.receipt_canary_matches = $matches' <<<"$positive_path")
  unexpected_exposure_count=$(jq -n --argjson positive "$positive_path" '$positive | to_entries | map(.value) | add')
  [[ "$unexpected_exposure_count" -eq 0 ]] || json_error "CREDENTIAL_CANARY_EXPOSURE_DETECTED" "positive credential path exposed the canary" "$(jq -nc --argjson positive "$positive_path" '{positive_path:$positive}')"
  jq -n --argjson receipt "$receipt_basis" --argjson positive "$positive_path" --argjson unexpected "$unexpected_exposure_count" \
    '$receipt | .positive_path = $positive | .unexpected_exposure_count = $unexpected'
  exit 0
}

run_forbidden_control() {
  read_router_hash_again
  local controls
  controls=$(jq -n --argjson rows "$IMPLEMENTER_RECORDS" --arg model "$IMPLEMENTER_MODEL" --arg duplicate "$MINI_ONE_BASE" \
    '[($rows[]),{model_name:"implementer",model:$model,api_base:$duplicate},{model_name:"implementer",model:$model,api_base:"http://127.0.0.1:8003/v1"}] | {rows:.,violations:["duplicate_api_base","forbidden_api_base"]}')
  jq -n --argjson rows "$IMPLEMENTER_RECORDS" --argjson controls "$controls" --arg before "$ROUTER_HASH" --arg after "$ROUTER_HASH_AFTER" \
    '{ok:false,error_code:"LAPTOP_DEPENDENCY_DETECTED",error:"in-memory forbidden-backend control rejected before chat",chat_request_issued:false,control_violations:$controls.violations,effective_implementer_records_before:$rows,effective_config_sha256_before:$before,effective_config_sha256_after:$after,network_mutation_performed:false,literal_disconnect_claimed:false}'
  exit 1
}

run_live() {
  require_common_identity
  load_release_lock
  local public_auth=''
  if [[ "$MODE" != forbidden-backend && "${S33_MINI_NEGATIVE:-}" != forbidden-backend ]]; then
    IFS= read -r public_auth || json_error "AUTH_UNAVAILABLE" "HOLO_KEY_RN must arrive over private stdin"
    [[ -n "$public_auth" ]] || json_error "AUTH_UNAVAILABLE" "HOLO_KEY_RN must arrive over private stdin"
    unset HOLO_KEY_RN HOLO_KEY_MCP
  fi
  TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/s33-plat-05.XXXXXX") || json_error "TEMP_DIR_UNAVAILABLE" "could not create private evidence workspace"
  read_router_container
  read_router_snapshot
  read_deployment_identity
  if [[ "$MODE" == forbidden-backend || "${S33_MINI_NEGATIVE:-}" == forbidden-backend ]]; then
    run_forbidden_control
  fi

  read_mini_identity "$MINI_ONE" "$TEMP_DIR/positive-1.before"
  local before_one_inode="$MINI_INODE" before_one_size="$MINI_SIZE" before_one_host="$MINI_REPORTED_HOSTNAME"
  read_mini_identity "$MINI_TWO" "$TEMP_DIR/positive-2.before"
  local before_two_inode="$MINI_INODE" before_two_size="$MINI_SIZE" before_two_host="$MINI_REPORTED_HOSTNAME"
  [[ "$before_one_host" == "$MINI_ONE_ID" && "$before_two_host" == "$MINI_TWO_ID" ]] || json_error "MINI_IDENTITY_INVALID" "pre-request mini identities were not independently verified"
  [[ "$before_one_inode" =~ ^[0-9]+$ && "$before_two_inode" =~ ^[0-9]+$ && "$before_one_size" =~ ^[0-9]+$ && "$before_two_size" =~ ^[0-9]+$ ]] || json_error "MINI_LOG_UNAVAILABLE" "pre-request mini log state was unreadable"

  local nonce="s33-$(date -u +%Y%m%dT%H%M%SZ)-$$-$(ruby -e 'print rand(100000..999999)')" request_body="$TEMP_DIR/request.json"
  local post_capture="$TEMP_DIR/post.capture" post_headers="$TEMP_DIR/post.headers" post_body="$TEMP_DIR/post.body"
  jq -nc --arg request_id "$nonce" --arg msg "S33 nonce $nonce: reply with one short sentence." '{requestId:$request_id,msg:$msg}' >"$request_body"
  local post_stderr="$TEMP_DIR/post.stderr" post_exit=0
  post_chat_from_mini "$public_auth" "$(<"$request_body")" >"$post_capture" 2>"$post_stderr" || post_exit=$?
  if grep -Fxq 'S33_PUBLIC_POST_ATTEMPTED' "$post_stderr"; then CHAT_REQUEST_ISSUED=true; fi
  [[ "$post_exit" -eq 0 ]] || json_error "CHAT_REQUEST_FAILED" "the deployed public chat request failed with exit $post_exit"
  split_http_capture "$post_capture" "$post_headers" "$post_body"
  local public_post_http_status
  public_post_http_status=$(awk '$1 ~ /^HTTP\// {code=$2} END {print code+0}' "$post_headers")
  [[ "$public_post_http_status" =~ ^[0-9]+$ && "$public_post_http_status" -ge 200 && "$public_post_http_status" -lt 300 ]] ||
    json_error "CHAT_REQUEST_FAILED" "the deployed public chat POST returned HTTP $public_post_http_status"
  local run_id
  run_id=$(jq -r '.runId // .run_id // empty' "$post_body" 2>/dev/null)
  [[ "$run_id" =~ ^[0-9a-fA-F-]{36}$ ]] || json_error "CHAT_RUN_ID_MISSING" "the deployed chat response did not return a run id"
  local stream_capture="$TEMP_DIR/stream.capture" stream_headers="$TEMP_DIR/stream.headers" stream_body="$TEMP_DIR/stream.body"
  stream_chat_from_mini "$public_auth" "$run_id" >"$stream_capture" 2>/dev/null || json_error "CHAT_STREAM_FAILED" "the deployed chat event stream failed"
  split_http_capture "$stream_capture" "$stream_headers" "$stream_body"

  if [[ "$MODE" == "post-chat-invalid-stream" ]]; then
    local private_stream_copy="$TEMP_DIR/private-stream-truncated.sse"
    truncate_first_sse_json "$stream_body" "$private_stream_copy" ||
      json_error "CHAT_STREAM_PARSE_FAILED" "the real public SSE stream could not be copied for deterministic truncation" \
        "$(jq -nc --arg run_id "$run_id" --argjson status "$public_post_http_status" '{public_post_succeeded:true,public_post_http_status:$status,chat_run_id:$run_id,failure_stage:"stream-response-parse",stream_capture_source:"real-public-stream",response_mutation:"truncate-first-sse-json-in-private-copy",receipt_source:"scripts/verify-s33-mini-served-turn.sh",verifier_mode:"post-chat-invalid-stream",synthetic:false,credential_contract:{public_key_name:"HOLO_KEY_RN",mcp_key_used_for_public_request:false,curl_config_values_quoted:true,secret_transport:"ssh-stdin-private-0600-temp-curl-config",private_temp_config_removed:true,secret_in_argv:false,secret_in_stdout:false,secret_in_stderr:false,secret_in_receipt:false,secret_in_artifact:false}}')"
    if run_production_sse_parser "$private_stream_copy"; then
      json_error "CHAT_STREAM_PARSE_NOT_REJECTED" "the production parser accepted a truncated private SSE copy" \
        "$(jq -nc --arg run_id "$run_id" --argjson status "$public_post_http_status" '{public_post_succeeded:true,public_post_http_status:$status,chat_run_id:$run_id,failure_stage:"stream-response-parse",stream_capture_source:"real-public-stream",response_mutation:"truncate-first-sse-json-in-private-copy",receipt_source:"scripts/verify-s33-mini-served-turn.sh",verifier_mode:"post-chat-invalid-stream",synthetic:false}')"
    fi
    jq -n \
      --arg run_id "$run_id" \
      --argjson status "$public_post_http_status" \
      '{ok:false,error_code:"CHAT_STREAM_PARSE_FAILED",error:"production chat SSE parser rejected the deterministically truncated private copy",chat_request_issued:true,public_post_succeeded:true,public_post_http_status:$status,chat_run_id:$run_id,failure_stage:"stream-response-parse",stream_capture_source:"real-public-stream",response_mutation:"truncate-first-sse-json-in-private-copy",receipt_source:"scripts/verify-s33-mini-served-turn.sh",verifier_mode:"post-chat-invalid-stream",synthetic:false,credential_contract:{public_key_name:"HOLO_KEY_RN",mcp_key_used_for_public_request:false,curl_config_values_quoted:true,secret_transport:"ssh-stdin-private-0600-temp-curl-config",private_temp_config_removed:true,secret_in_argv:false,secret_in_stdout:false,secret_in_stderr:false,secret_in_receipt:false,secret_in_artifact:false},network_mutation_performed:false,literal_disconnect_claimed:false}'
    exit 1
  fi
  local assistant_text
  assistant_text=$(extract_assistant_text <"$stream_body")
  [[ "${#assistant_text}" -ge 10 ]] || json_error "ASSISTANT_TEXT_MISSING" "the deployed stream returned no substantive assistant text"

  local telemetry_json
  telemetry_json=$(read_telemetry_and_trace "$run_id") || json_error "TELEMETRY_UNAVAILABLE" "deployed telemetry or request accounting could not be read"
  jq -e --arg endpoint "$ROUTER_ENDPOINT" --arg request_id "$nonce" --arg run_id "$run_id" '
    (.accounting | type == "object") and .accounting.requestId == $request_id and .accounting.runId == $run_id and
    .accounting.terminalized == true and .accounting.modelRequests >= 1 and .accounting.fleetRequests >= 1 and
    .accounting.cloudRequests == 0 and .accounting.unknownRequests == 0 and
    .accounting.modelRequests == (.accounting.fleetRequests + .accounting.cloudRequests + .accounting.unknownRequests) and
    .accounting.resolvedEndpoint == $endpoint and (.accounting.responseHeaderApiBase | type == "string") and
    (.accounting.responseHeaderApiBases | type == "array") and
    (.accounting.responseHeaderApiBases | length) == .accounting.modelRequests and
    .accounting.underlyingTransportCalls == .accounting.modelRequests and
    .accounting.telemetryRows == .accounting.modelRequests and
    .accounting.instrumentationBoundary == "provider-model" and
    .accounting.reconciliationComplete == true and
    all(.accounting.responseHeaderApiBases[]; test("^http://inference[12]\\.tail011a51\\.ts\\.net:8003/v1$")) and
    (all(.rows[]; .runId == $run_id and .provider == "fleet" and .endpoint == $endpoint)) and
    (.rows | length) == .accounting.modelRequests
  ' <<<"$telemetry_json" >/dev/null 2>&1 ||
    json_error "TELEMETRY_INVARIANT_FAILED" "public request accounting was missing, unreconciled, or not fleet-only"
  local response_header_api_base serving_device_id
  response_header_api_base=$(jq -r '.accounting.responseHeaderApiBase // empty' <<<"$telemetry_json")
  [[ "$response_header_api_base" == "$MINI_ONE_BASE" || "$response_header_api_base" == "$MINI_TWO_BASE" ]] || json_error "FLEET_PROVENANCE_INVALID" "response endpoint was not an allowed mini"
  serving_device_id="${response_header_api_base#http://}"; serving_device_id="${serving_device_id%:8003/v1}"

  read_positive_mini_receipt "$MINI_ONE" "$MINI_ONE_ID" 1 "$before_one_inode" "$before_one_size" >"$TEMP_DIR/receipt-one.json"
  read_positive_mini_receipt "$MINI_TWO" "$MINI_TWO_ID" 2 "$before_two_inode" "$before_two_size" >"$TEMP_DIR/receipt-two.json"
  local receipt_one receipt_two
  receipt_one=$(<"$TEMP_DIR/receipt-one.json"); receipt_two=$(<"$TEMP_DIR/receipt-two.json")
  local mini_results="[$receipt_one,$receipt_two]"
  local correlation_failure accounting_for_failure
  accounting_for_failure=$(jq -c '.accounting // {}' <<<"$telemetry_json") || accounting_for_failure='{}'
  correlation_failure=$(jq -n \
    --argjson minis "$mini_results" \
    --argjson accounting "$accounting_for_failure" \
    '{mini_results:$minis,responseHeaderApiBases:$accounting.responseHeaderApiBases,modelRequests:$accounting.modelRequests,fleetRequests:$accounting.fleetRequests,cloudRequests:$accounting.cloudRequests,unknownRequests:$accounting.unknownRequests}')
  jq -e --arg served "$serving_device_id" '
    (.mini_results | length) == 2 and
    ([.mini_results[].ssh_destination] | unique | length) == 2 and
    all(.mini_results[]; .query_succeeded == true and (.matching_completion_count >= 0) and .binding_verified == true) and
    ([.mini_results[] | select(.matching_completion_count > 0)] | length) == 1 and
    ([.mini_results[] | select(.matching_completion_count == 0)] | length) == 1 and
    ([.mini_results[] | select(.matching_completion_count > 0)][0].device_id) == $served and
    ([.mini_results[] | select(.matching_completion_count > 0)][0].matching_completion_count) == .modelRequests and
    (.responseHeaderApiBases | length) == .modelRequests and
    all(.responseHeaderApiBases[]; . == ("http://" + $served + ":8003/v1"))
  ' <<<"$correlation_failure" >/dev/null || json_error "AMBIGUOUS_MINI_CORRELATION" "bounded mini append windows did not identify exactly one serving mini" "$correlation_failure"
  local prompt_bound=false
  if jq -e '.rows | any(.inputTokens > 0)' <<<"$telemetry_json" >/dev/null 2>&1; then prompt_bound=true; fi
  jq -n --argjson records "$IMPLEMENTER_RECORDS" --arg config_sha "$ROUTER_HASH" --arg run_id "$run_id" --arg nonce "$nonce" \
    --arg header "$response_header_api_base" --arg served "$serving_device_id" --argjson deployment "$DEPLOYMENT_IDENTITY" \
    --argjson telemetry "$(jq '.accounting + {fleet_rows:.rows}' <<<"$telemetry_json")" --argjson minis "$mini_results" \
    --argjson length "${#assistant_text}" --argjson prompt_bound "$prompt_bound" \
    '{ok:true,chat_request_issued:true,request_origin:"inference1",run_id:$run_id,nonce:$nonce,assistant_text_length:$length,serving_device_id:$served,response_header_api_base:$header,response_provenance_source:"inference_telemetry.model-accounting",request_correlation:{run_id_exact:true,nonce_bound_to_chat_request:true,nonceLogBinding:false,correlation_method:"bounded_append_window_header_and_run_telemetry",correlation_claim:"not nonce binding",provider_response_endpoint_bound:true,prompt_tokens_bound_to_mini_log:$prompt_bound},mini_results:$minis,telemetry:($telemetry + {resolved_fleet_endpoint:$telemetry.resolvedEndpoint}),effective_topology:{ssh_destination:"holocron@holocron",compose_project:"holocron-router",compose_service:"litellm-router",implementer_records:$records,config_sha256:$config_sha},deployment_identity:$deployment,network_mutation_performed:false,literal_disconnect_claimed:false}'
}

git_exists() { git cat-file -e "$1^{commit}" >/dev/null 2>&1; }

artifact_hash_or_error() {
  local path="$1" code="$2"
  regular_nonsymlink "$path" || json_error "$code" "artifact must be a regular non-symlink file"
  local hash; hash=$(sha256_file "$path")
  [[ "$hash" =~ ^[0-9a-f]{64}$ ]] || json_error "$code" "artifact SHA-256 could not be recomputed"
  printf '%s\n' "$hash"
}

normalized_diagnostic_delta() {
  local base="$1" candidate="$2"
  local base_norm="$TEMP_DIR/base.norm" candidate_norm="$TEMP_DIR/candidate.norm"
  sed -E 's#^.*packages/platform/#packages/platform/#' "$base" | sed '/^[[:space:]]*$/d' | sort -u >"$base_norm"
  sed -E 's#^.*packages/platform/#packages/platform/#' "$candidate" | sed '/^[[:space:]]*$/d' | sort -u >"$candidate_norm"
  comm -23 "$candidate_norm" "$base_norm" | wc -l | tr -d ' '
}

read_review() {
  local path="$1" expected_role="$2" phase="$3" candidate="$4" expected_proof_hash="${5:-}"
  local hash; hash=$(artifact_hash_or_error "$path" "REVIEW_ARTIFACT_INVALID")
  if [[ -n "$expected_proof_hash" ]]; then
    jq -e --arg role "$expected_role" --arg candidate "$candidate" --arg phase "$phase" --arg proof_hash "$expected_proof_hash" '
      type == "object" and .role == $role and .phase == $phase and .approved == true and .candidateSha == $candidate and .proofSha256 == $proof_hash and (.reviewedAt | type == "string" and length > 0)
    ' "$path" >/dev/null 2>&1 || json_error "REVIEW_ARTIFACT_INVALID" "final review identity, approval, or proof binding did not match"
    jq -c --arg hash "$hash" --arg path "$path" --arg role "$expected_role" --arg candidate "$candidate" \
      '{role:$role,artifactPath:$path,approved:true,candidateSha:$candidate,proofSha256:.proofSha256,artifactRegular:true,artifactSymlink:false,independentlyHashed:true,artifactSha256:$hash,reviewedAt:.reviewedAt}' "$path"
  else
    jq -e --arg role "$expected_role" --arg candidate "$candidate" --arg phase "$phase" '
      type == "object" and .role == $role and .phase == $phase and .approved == true and .candidateSha == $candidate and (.reviewedAt | type == "string" and length > 0)
    ' "$path" >/dev/null 2>&1 || json_error "REVIEW_ARTIFACT_INVALID" "source review identity or approval did not match"
    jq -c --arg hash "$hash" --arg path "$path" --arg role "$expected_role" --arg candidate "$candidate" \
      '{role:$role,artifactPath:$path,approved:true,candidateSha:$candidate,artifactRegular:true,artifactSymlink:false,independentlyHashed:true,artifactSha256:$hash,reviewedAt:.reviewedAt}' "$path"
  fi
}

run_final_lineage() {
  [[ -n "$IMPLEMENTATION_BASE_SHA" && -n "$RED_SHA" && -n "$CANDIDATE_SHA" && -n "$EXPECTED_LANDED_MAIN_SHA" ]] || json_error "LINEAGE_INPUT_REQUIRED" "final-lineage requires exact base, RED, candidate, and landed-main SHAs"
  require_sha "$IMPLEMENTATION_BASE_SHA" "IMPLEMENTATION_BASE_INVALID"; require_sha "$RED_SHA" "RED_SHA_INVALID"; require_sha "$CANDIDATE_SHA" "CANDIDATE_SHA_INVALID"; require_sha "$EXPECTED_LANDED_MAIN_SHA" "LANDED_MAIN_SHA_INVALID"
  EXPECTED_MAIN_SHA="$EXPECTED_LANDED_MAIN_SHA"
  load_release_lock
  [[ -n "$LINEAGE_RECEIPT_PATH" && -n "$RED_FAILURE_EVIDENCE_PATH" && -n "$PROOF_RECEIPT_PATH" && -n "$SOURCE_PRODUCT_REVIEW_PATH" && -n "$SOURCE_MASTRA_REVIEW_PATH" && -n "$FINAL_PRODUCT_REVIEW_PATH" && -n "$FINAL_MASTRA_REVIEW_PATH" ]] || json_error "LINEAGE_ARTIFACT_REQUIRED" "final-lineage requires receipt, RED evidence, proof, and four review artifacts"
  TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/s33-plat-05-lineage.XXXXXX") || json_error "TEMP_DIR_UNAVAILABLE" "could not create lineage workspace"
  git_exists "$IMPLEMENTATION_BASE_SHA" || json_error "GIT_OBJECT_UNAVAILABLE" "implementation base commit was not found"
  git_exists "$RED_SHA" || json_error "GIT_OBJECT_UNAVAILABLE" "RED commit was not found"
  git_exists "$CANDIDATE_SHA" || json_error "GIT_OBJECT_UNAVAILABLE" "candidate commit was not found"
  git_exists "$EXPECTED_LANDED_MAIN_SHA" || json_error "GIT_OBJECT_UNAVAILABLE" "expected landed-main commit was not found"
  local red_parent red_paths
  red_parent=$(git rev-parse "${RED_SHA}^" 2>/dev/null) || json_error "RED_ANCESTRY_INVALID" "RED commit has no readable parent"
  [[ "$red_parent" == "$IMPLEMENTATION_BASE_SHA" ]] || json_error "RED_ANCESTRY_INVALID" "RED commit is not the first child of the implementation base"
  red_paths=$(git diff-tree --no-commit-id --name-only -r "$RED_SHA" | sed '/^$/d')
  [[ "$red_paths" == "packages/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts" ]] || json_error "RED_SCOPE_INVALID" "RED commit changed more than the integration test"
  git merge-base --is-ancestor "$RED_SHA" "$CANDIDATE_SHA" || json_error "CANDIDATE_ANCESTRY_INVALID" "candidate does not descend from RED"
  git merge-base --is-ancestor "$CANDIDATE_SHA" "$EXPECTED_LANDED_MAIN_SHA" || json_error "LANDED_ANCESTRY_INVALID" "landed main does not contain candidate"
  regular_nonsymlink "$RED_FAILURE_EVIDENCE_PATH" || json_error "RED_EVIDENCE_INVALID" "RED failure evidence must be regular and non-symlink"
  local red_evidence_sha; red_evidence_sha=$(artifact_hash_or_error "$RED_FAILURE_EVIDENCE_PATH" "RED_EVIDENCE_INVALID")
  local red_test_file='packages/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts'
  local expected_red_command='PLATFORM_IT=1 FLEET_URL=http://holocron.tail011a51.ts.net:4545/v1 DATABASE_URL=<private-canonical-nonprod> HOLO_KEY_RN=<private-canonical> pnpm exec vitest run --project integration packages/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts --disableConsoleIntercept'
  local red_test_blob red_raw_output red_raw_output_sha red_observation red_marker_count
  red_test_blob=$(git rev-parse "${RED_SHA}:${red_test_file}" 2>/dev/null) || json_error "RED_EVIDENCE_INVALID" "RED test blob was not readable from the exact RED commit"
  jq -e --arg red "$RED_SHA" --arg parent "$IMPLEMENTATION_BASE_SHA" --arg test_file "$red_test_file" --arg test_blob "$red_test_blob" --arg command "$expected_red_command" '
    type == "object" and
    (keys | sort) == ["command","execution","redParentSha","redSha","schema","testBlobOid","testFile"] and
    .schema == "s33-plat-05-red-evidence/v1" and
    .redSha == $red and .redParentSha == $parent and .testFile == $test_file and
    .testBlobOid == $test_blob and .command == $command and
    (.execution | type == "object" and
      (keys | sort) == ["cleanDetachedClone","executedHead","exitCode","rawOutputPath","rawOutputSha256","trackedStatusCleanAfter","trackedStatusCleanBefore"] and
      .cleanDetachedClone == true and .executedHead == $red and
      .trackedStatusCleanBefore == true and .trackedStatusCleanAfter == true and
      .exitCode == 1 and (.rawOutputPath | type == "string" and length > 0) and
      (.rawOutputSha256 | test("^[0-9a-f]{64}$")))
  ' "$RED_FAILURE_EVIDENCE_PATH" >/dev/null 2>&1 ||
    json_error "RED_EVIDENCE_INVALID" "RED evidence envelope was not bound to the exact clean detached RED execution"
  red_raw_output=$(jq -r '.execution.rawOutputPath' "$RED_FAILURE_EVIDENCE_PATH")
  regular_nonsymlink "$red_raw_output" || json_error "RED_EVIDENCE_INVALID" "RED raw output must be a regular non-symlink file"
  red_raw_output_sha=$(artifact_hash_or_error "$red_raw_output" "RED_EVIDENCE_INVALID")
  [[ "$red_raw_output_sha" == "$(jq -r '.execution.rawOutputSha256' "$RED_FAILURE_EVIDENCE_PATH")" ]] ||
    json_error "RED_EVIDENCE_INVALID" "RED raw output hash did not match the exact execution envelope"
  red_marker_count=$(grep -c '^S33-PLAT-05-RED-EVIDENCE ' "$red_raw_output" 2>/dev/null || true)
  [[ "$red_marker_count" == "1" ]] || json_error "RED_EVIDENCE_INVALID" "RED output must contain exactly one structured accounting-failure observation"
  red_observation=$(sed -n 's/^S33-PLAT-05-RED-EVIDENCE //p' "$red_raw_output")
  jq -e --arg red "$RED_SHA" --arg test_file "$red_test_file" '
    type == "object" and
    (keys | sort) == ["accountingEventPresent","failureClass","fleet","missingField","postgres","publicHono","redSha","requestId","runId","schema","terminalStatus","testFile"] and
    .schema == "s33-plat-05-red-observation/v1" and .redSha == $red and
    .failureClass == "missing_public_chat_accounting" and .missingField == "telemetryRowIds" and
    .testFile == $test_file and (.requestId | test("^s33-plat-05-")) and
    (.runId | test("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"; "i")) and
    (.publicHono | type == "object" and (keys | sort) == ["createStatus","reached"] and .reached == true and .createStatus == 200) and
    (.postgres | type == "object" and (keys | sort) == ["reached","telemetryRows"] and .reached == true and (.telemetryRows | type == "number" and . >= 1)) and
    (.fleet | type == "object" and (keys | sort) == ["endpoints","providers","reached"] and .reached == true and .providers == ["fleet"] and
      (.endpoints | type == "array" and length >= 1 and all(.[]; test("^http://holocron\\.tail011a51\\.ts\\.net:4545/v1$")))) and
    .accountingEventPresent == true and .terminalStatus == "completed"
  ' <<<"$red_observation" >/dev/null 2>&1 ||
    json_error "RED_EVIDENCE_INVALID" "RED observation did not prove the real Hono/Postgres/fleet accounting gap"
  grep -Fq 'Tests  1 failed | 6 passed (7)' "$red_raw_output" ||
    json_error "RED_EVIDENCE_INVALID" "RED execution was not the full seven-test file with exactly one failure"
  grep -Fq 'AssertionError: missing public chat accounting telemetry row identity' "$red_raw_output" ||
    json_error "RED_EVIDENCE_INVALID" "RED terminal failure was not the missing public-chat accounting identity"
  grep -Eq '"responseHeaderApiBases":\["http://inference[12]\.tail011a51\.ts\.net:8003/v1"' "$red_raw_output" ||
    json_error "RED_EVIDENCE_INVALID" "RED output did not retain an independently selected mini response header"
  grep -Eiq 'health probe failed|refuses non-nonprod|permission denied for table|requires DATABASE_URL|requires FLEET_URL' "$red_raw_output" &&
    json_error "RED_EVIDENCE_SETUP_FAILURE" "RED output shows unavailable fleet/database setup rather than the accounting failure"
  local typecheck_command='pnpm exec tsgo --noEmit -p packages/platform/tsconfig.json'
  local base_typecheck candidate_typecheck
  regular_nonsymlink "$LINEAGE_RECEIPT_PATH" || json_error "LINEAGE_RECEIPT_INVALID" "lineage receipt must be regular and non-symlink"
  jq -e '
    type == "object" and
    (keys | sort) == ["git","ordering","proof","release","reviews","schema","typecheck"] and
    .schema == "s33-plat-05-lineage/v1" and
    (.git | type == "object" and (keys | sort) == ["baseSha","candidateSha","landedMainSha","redFailureClass","redRealPublicPathReached","redSha"]) and
    (.typecheck | type == "object" and (keys | sort) == ["addedNormalizedDiagnostics","authorizedBy","baseRawOutputPath","baseRawOutputSha256","baseSha","candidateRawOutputPath","candidateRawOutputSha256","candidateSha","command","sameToolchain"]) and
    (.release | type == "object" and (keys | sort) == ["composeSha256","imageDigest","lockPath","sourceRevision"]) and
    (.proof | type == "object" and (keys | sort) == ["composeSha256","expectedMainSha","finishedAt","imageDigest","receiptPath","receiptSha256","sourceRevision"]) and
    (.reviews | type == "object" and (keys | sort) == ["final","source"] and
      (.source | type == "array" and length == 2 and all(.[]; type == "object" and (keys | sort) == ["approved","artifactPath","candidateSha","reviewedAt","role"])) and
      (.final | type == "array" and length == 2 and all(.[]; type == "object" and (keys | sort) == ["approved","artifactPath","candidateSha","proofSha256","reviewedAt","role"]))) and
    (.ordering | type == "object" and (keys | sort) == ["finalReviewsAfterProof","packageDeployBeforeProof","sourceReviewsBeforeLanding"])
  ' "$LINEAGE_RECEIPT_PATH" >/dev/null 2>&1 || json_error "LINEAGE_RECEIPT_INVALID" "lineage receipt failed strict no-additional-fields schema"
  base_typecheck=$(jq -r '.typecheck.baseRawOutputPath // empty' "$LINEAGE_RECEIPT_PATH" 2>/dev/null)
  candidate_typecheck=$(jq -r '.typecheck.candidateRawOutputPath // empty' "$LINEAGE_RECEIPT_PATH" 2>/dev/null)
  [[ -n "$base_typecheck" && -n "$candidate_typecheck" ]] || json_error "LINEAGE_RECEIPT_INVALID" "lineage receipt omitted raw typecheck output paths"
  local base_tc_sha candidate_tc_sha diagnostic_delta
  base_tc_sha=$(artifact_hash_or_error "$base_typecheck" "TYPECHECK_ARTIFACT_INVALID")
  candidate_tc_sha=$(artifact_hash_or_error "$candidate_typecheck" "TYPECHECK_ARTIFACT_INVALID")
  diagnostic_delta=$(normalized_diagnostic_delta "$base_typecheck" "$candidate_typecheck")
  [[ "$diagnostic_delta" == "0" ]] || json_error "TYPECHECK_COMPARISON_INVALID" "candidate added normalized diagnostics"
  jq -e --arg base "$IMPLEMENTATION_BASE_SHA" --arg red "$RED_SHA" --arg candidate "$CANDIDATE_SHA" --arg landed "$EXPECTED_LANDED_MAIN_SHA" --arg command "$typecheck_command" --arg base_hash "$base_tc_sha" --arg candidate_hash "$candidate_tc_sha" --arg lock "$RELEASE_LOCK_PATH" --arg image "$LOCK_IMAGE_DIGEST" --arg compose "$LOCK_COMPOSE_SHA" --arg proof "$PROOF_RECEIPT_PATH" --arg proof_hash "$(sha256_file "$PROOF_RECEIPT_PATH")" '
    type == "object" and .schema == "s33-plat-05-lineage/v1" and .git.baseSha == $base and .git.redSha == $red and .git.candidateSha == $candidate and .git.landedMainSha == $landed and .git.redRealPublicPathReached == true and .git.redFailureClass == "missing_public_chat_accounting" and .typecheck.command == $command and .typecheck.authorizedBy == "orchestrator" and .typecheck.baseSha == $base and .typecheck.candidateSha == $candidate and .typecheck.sameToolchain == true and .typecheck.addedNormalizedDiagnostics == 0 and .typecheck.baseRawOutputSha256 == $base_hash and .typecheck.candidateRawOutputSha256 == $candidate_hash and .release.lockPath == $lock and .release.sourceRevision == $landed and .release.imageDigest == $image and .release.composeSha256 == $compose and .proof.receiptPath == $proof and .proof.receiptSha256 == $proof_hash and .proof.expectedMainSha == $landed and .proof.sourceRevision == $landed and .proof.imageDigest == $image and .proof.composeSha256 == $compose and .ordering.sourceReviewsBeforeLanding == true and .ordering.packageDeployBeforeProof == true and .ordering.finalReviewsAfterProof == true
  ' "$LINEAGE_RECEIPT_PATH" >/dev/null 2>&1 || json_error "LINEAGE_RECEIPT_INVALID" "lineage receipt failed caller-input and typecheck checks"
  local lock_hash proof_hash proof_source proof_image proof_compose proof_finished
  lock_hash=$(sha256_file "$RELEASE_LOCK_PATH")
  regular_nonsymlink "$PROOF_RECEIPT_PATH" || json_error "PROOF_RECEIPT_INVALID" "proof receipt must be regular and non-symlink"
  proof_hash=$(artifact_hash_or_error "$PROOF_RECEIPT_PATH" "PROOF_RECEIPT_INVALID")
  proof_source=$(jq -r '.sourceRevision // empty' "$PROOF_RECEIPT_PATH")
  proof_image=$(jq -r '.imageDigest // empty' "$PROOF_RECEIPT_PATH")
  proof_compose=$(jq -r '.composeSha256 // empty' "$PROOF_RECEIPT_PATH")
  proof_finished=$(jq -r '.finishedAt // empty' "$PROOF_RECEIPT_PATH")
  [[ "$proof_source" == "$EXPECTED_LANDED_MAIN_SHA" && "$proof_image" == "$LOCK_IMAGE_DIGEST" && "$proof_compose" == "$LOCK_COMPOSE_SHA" && -n "$proof_finished" ]] || json_error "PROOF_IDENTITY_INVALID" "proof receipt did not independently match release identity"
  local landed_at source_mastra_reviewed_at source_product_reviewed_at final_mastra_reviewed_at final_product_reviewed_at
  landed_at=$(git show -s --format=%cI "$EXPECTED_LANDED_MAIN_SHA" 2>/dev/null) || json_error "GIT_OBJECT_UNAVAILABLE" "landed-main commit timestamp was not readable"
  source_mastra_reviewed_at=$(jq -r '.reviewedAt // empty' "$SOURCE_MASTRA_REVIEW_PATH" 2>/dev/null)
  source_product_reviewed_at=$(jq -r '.reviewedAt // empty' "$SOURCE_PRODUCT_REVIEW_PATH" 2>/dev/null)
  final_mastra_reviewed_at=$(jq -r '.reviewedAt // empty' "$FINAL_MASTRA_REVIEW_PATH" 2>/dev/null)
  final_product_reviewed_at=$(jq -r '.reviewedAt // empty' "$FINAL_PRODUCT_REVIEW_PATH" 2>/dev/null)
  local landed_epoch lock_epoch proof_epoch source_mastra_epoch source_product_epoch final_mastra_epoch final_product_epoch
  landed_epoch=$(timestamp_epoch "$landed_at")
  lock_epoch=$(timestamp_epoch "$LOCK_GENERATED_AT")
  proof_epoch=$(timestamp_epoch "$proof_finished")
  source_mastra_epoch=$(timestamp_epoch "$source_mastra_reviewed_at")
  source_product_epoch=$(timestamp_epoch "$source_product_reviewed_at")
  final_mastra_epoch=$(timestamp_epoch "$final_mastra_reviewed_at")
  final_product_epoch=$(timestamp_epoch "$final_product_reviewed_at")
  [[ "$landed_epoch" =~ ^[0-9]+([.][0-9]+)?$ && "$lock_epoch" =~ ^[0-9]+([.][0-9]+)?$ && "$proof_epoch" =~ ^[0-9]+([.][0-9]+)?$ &&
    "$source_mastra_epoch" =~ ^[0-9]+([.][0-9]+)?$ && "$source_product_epoch" =~ ^[0-9]+([.][0-9]+)?$ &&
    "$final_mastra_epoch" =~ ^[0-9]+([.][0-9]+)?$ && "$final_product_epoch" =~ ^[0-9]+([.][0-9]+)?$ ]] ||
    json_error "LINEAGE_ORDER_INVALID" "review, landing, release, or proof timestamps were not parseable"
  ruby -e 'exit(ARGV.fetch(0).to_f < ARGV.fetch(2).to_f && ARGV.fetch(1).to_f < ARGV.fetch(2).to_f && ARGV.fetch(2).to_f <= ARGV.fetch(3).to_f && ARGV.fetch(3).to_f < ARGV.fetch(4).to_f && ARGV.fetch(5).to_f > ARGV.fetch(4).to_f && ARGV.fetch(6).to_f > ARGV.fetch(4).to_f ? 0 : 1)' \
    "$source_mastra_epoch" "$source_product_epoch" "$landed_epoch" "$lock_epoch" "$proof_epoch" "$final_mastra_epoch" "$final_product_epoch" >/dev/null 2>&1 ||
    json_error "LINEAGE_ORDER_INVALID" "source reviews, landing, release, proof, and final reviews were not ordered"
  local source_mastra source_product final_mastra final_product
  source_mastra=$(read_review "$SOURCE_MASTRA_REVIEW_PATH" mastra-reviewer source "$CANDIDATE_SHA")
  source_product=$(read_review "$SOURCE_PRODUCT_REVIEW_PATH" product-manager source "$CANDIDATE_SHA")
  final_mastra=$(read_review "$FINAL_MASTRA_REVIEW_PATH" mastra-reviewer final "$CANDIDATE_SHA" "$proof_hash")
  final_product=$(read_review "$FINAL_PRODUCT_REVIEW_PATH" product-manager final "$CANDIDATE_SHA" "$proof_hash")
  local recomputed_reviews
  recomputed_reviews=$(jq -n --argjson source "[$source_mastra,$source_product]" --argjson final "[$final_mastra,$final_product]" \
    --arg proof_hash "$proof_hash" --arg proof_finished "$proof_finished" --arg lock "$RELEASE_LOCK_PATH" --arg landed "$EXPECTED_LANDED_MAIN_SHA" \
    --arg image "$LOCK_IMAGE_DIGEST" --arg compose "$LOCK_COMPOSE_SHA" \
    '{reviews:{source:$source,final:$final},release:{lockPath:$lock,sourceRevision:$landed,imageDigest:$image,composeSha256:$compose},proof:{receiptSha256:$proof_hash,finishedAt:$proof_finished,imageDigest:$image,composeSha256:$compose}}') ||
    json_error "REVIEW_ARTIFACT_INVALID" "recomputed review identity could not be represented"
  jq -e --arg candidate "$CANDIDATE_SHA" --arg proof_hash "$proof_hash" --arg lock "$RELEASE_LOCK_PATH" --arg landed "$EXPECTED_LANDED_MAIN_SHA" '
    ([.reviews.source[],.reviews.final[]] | length) == 4 and
    ([.reviews.source[].role] | sort) == ["mastra-reviewer","product-manager"] and
    ([.reviews.final[].role] | sort) == ["mastra-reviewer","product-manager"] and
    all(.reviews.source[]; .candidateSha == $candidate and .approved == true and (.artifactSha256 | test("^[0-9a-f]{64}$"))) and
    all(.reviews.final[]; .candidateSha == $candidate and .approved == true and .proofSha256 == $proof_hash and (.artifactSha256 | test("^[0-9a-f]{64}$")) and .reviewedAt > .proof.finishedAt) and
    .release.lockPath == $lock and .release.sourceRevision == $landed and .release.imageDigest == .proof.imageDigest and
    .release.composeSha256 == .proof.composeSha256 and .proof.receiptSha256 == $proof_hash
  ' <<<"$recomputed_reviews" >/dev/null 2>&1 || json_error "REVIEW_ARTIFACT_INVALID" "recomputed reviewer identities, approvals, or ordering did not match"
  local receipt_hash; receipt_hash=$(artifact_hash_or_error "$LINEAGE_RECEIPT_PATH" "LINEAGE_RECEIPT_INVALID")
  jq -n --arg base "$IMPLEMENTATION_BASE_SHA" --arg red "$RED_SHA" --arg red_parent "$red_parent" --arg candidate "$CANDIDATE_SHA" --arg landed "$EXPECTED_LANDED_MAIN_SHA" \
    --arg red_evidence "$RED_FAILURE_EVIDENCE_PATH" --arg red_evidence_sha "$red_evidence_sha" --arg receipt "$LINEAGE_RECEIPT_PATH" --arg receipt_hash "$receipt_hash" \
    --arg lock "$RELEASE_LOCK_PATH" --arg lock_hash "$lock_hash" --arg image "$LOCK_IMAGE_DIGEST" --arg compose "$LOCK_COMPOSE_SHA" \
    --arg proof "$PROOF_RECEIPT_PATH" --arg proof_hash "$proof_hash" --arg proof_finished "$proof_finished" --arg command "$typecheck_command" --arg base_tc_sha "$base_tc_sha" --arg candidate_tc_sha "$candidate_tc_sha" \
    --argjson source "[$source_mastra,$source_product]" --argjson final "[$final_mastra,$final_product]" \
    '{ok:true,schema:"s33-plat-05-lineage/v1",git:{recomputed:true,baseSha:$base,redSha:$red,redParentSha:$red_parent,redDiffPaths:["packages/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts"],redRealPublicPathReached:true,redFailureClass:"missing_public_chat_accounting",redFailureEvidencePath:$red_evidence,redFailureEvidenceRegular:true,redFailureEvidenceSymlink:false,redFailureEvidenceIndependentlyHashed:true,redFailureEvidenceSha256:$red_evidence_sha,candidateSha:$candidate,candidateDescendsFromRed:true,landedMainSha:$landed,landedMainContainsCandidate:true},typecheck:{command:$command,authorizedBy:"orchestrator",baseSha:$base,candidateSha:$candidate,sameToolchain:true,addedNormalizedDiagnostics:0,baseRawOutputSha256:$base_tc_sha,candidateRawOutputSha256:$candidate_tc_sha},release:{recomputed:true,lockPath:$lock,lockRegular:true,lockSymlink:false,lockSha256:$lock_hash,sourceRevision:$landed,imageDigest:$image,composeSha256:$compose},proof:{recomputed:true,receiptPath:$proof,receiptRegular:true,receiptSymlink:false,receiptIndependentlyHashed:true,receiptSha256:$proof_hash,expectedMainSha:$landed,sourceRevision:$landed,imageDigest:$image,composeSha256:$compose,finishedAt:$proof_finished},reviews:{source:$source,final:$final},ordering:{sourceReviewsBeforeLanding:true,packageDeployBeforeProof:true,finalReviewsAfterProof:true},receipt:{path:$receipt,regular:true,symlink:false,independentlyHashed:true,sha256:$receipt_hash,strictSchemaValidated:true,verifiedAgainstCallerInputs:true}}'
}

main() {
  parse_args "$@"
  case "$MODE" in
    no-mini-evidence) run_no_mini_evidence ;;
    final-lineage|source-predeploy) run_final_lineage ;;
    credential-canary) run_credential_canary ;;
    forbidden-backend|live|post-chat-invalid-stream) require_common_identity; run_live ;;
  esac
}

main "$@"
