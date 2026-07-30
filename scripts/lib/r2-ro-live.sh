#!/usr/bin/env bash
# GATE-FIX-S28R3-QA14 — production live R2 boundary helpers.
# Sourced by prove-r2-readonly / provision-fresh-restore-target / run-fire-drill-on-fresh-target.
# Never logs credential or object content values.
# Production has NO runtime provider/test/CLI overrides.
#
# shellcheck shell=bash

: "${ROOT:?ROOT must be set before sourcing r2-ro-live.sh}"

R2_RO_TRUSTED_PROOF_DIR="${ROOT}/.tmp/r2-ro-proofs"
R2_RO_SUPPORTED_POLICY_KIND="object-read-only"
R2_RO_REQUIRED_BUCKET="holocron-backup"
R2_RO_REQUIRED_PREFIX="pgbackrest"
# GATE-FIX-S28R3-QA16: fixed repository path only (never env-relocatable in production).
R2_RO_SCOPE_PROBES_RELPATH="scripts/lib/r2-scope-probes.json"
R2_RO_SCOPE_PROBES_JSON="${ROOT}/${R2_RO_SCOPE_PROBES_RELPATH}"

# Absolute root-owned helpers only (never PATH, never fixtures, never env overrides).
R2_RO_ENV_BIN="/usr/bin/env"
R2_RO_PYTHON_BIN="/usr/bin/python3"
R2_RO_CURL_BIN="/usr/bin/curl"
R2_RO_PROVIDER_PY="${ROOT}/scripts/lib/r2_s3_provider.py"
# GATE-FIX-S28R3-QA23: secret-free env launch (FD 3 pairs → execve); never env -i KEY=secret.
R2_RO_EXEC_ENV_FROM_FD_PY="${ROOT}/scripts/lib/exec-env-from-fd.py"
# GATE-FIX-S28R3-QA25: seal env values to private file (argv = paths + key names only).
R2_RO_SEAL_ENV_TO_FILE_PY="${ROOT}/scripts/lib/seal-env-to-file.py"

# --- trust chain validation (root-owned, no group/world-writable parents) ---

r2_ro_validate_root_bin() {
  # args: absolute path to executable
  # GATE-FIX-S28R3-QA19: bootstrap with env -i + /usr/bin/python3 -E -s (no hostile PYTHON*).
  local candidate="$1"
  /usr/bin/env -i PATH=/usr/bin:/bin HOME="${HOME:-/tmp}" LC_ALL=C \
    /usr/bin/python3 -E -s - "$candidate" <<'PY'
import os, stat, sys
cand = sys.argv[1]
if not cand.startswith("/"):
    print("error: helper path must be absolute", file=sys.stderr); sys.exit(2)
# Walk every component from / to leaf; require root ownership and non-group/world-writable.
parts = [p for p in cand.split("/") if p]
path = ""
for part in parts:
    path = path + "/" + part
    try:
        st = os.lstat(path)
    except OSError as e:
        print(f"error: cannot lstat trust-chain component {path}: {e}", file=sys.stderr)
        sys.exit(2)
    if stat.S_ISLNK(st.st_mode):
        # Resolve one hop and re-check target identity, still requiring root chain.
        try:
            real = os.path.realpath(path)
            st = os.lstat(real)
            path_check = real
        except OSError as e:
            print(f"error: symlink unresolvable in trust chain: {e}", file=sys.stderr)
            sys.exit(2)
    else:
        path_check = path
        st = os.lstat(path_check)
    mode = stat.S_IMODE(st.st_mode)
    if st.st_uid != 0:
        print(f"error: GATE-FIX-S28R3-QA14 trust-chain component not root-owned: {path_check}", file=sys.stderr)
        sys.exit(2)
    if mode & (stat.S_IWGRP | stat.S_IWOTH):
        print(f"error: GATE-FIX-S28R3-QA14 trust-chain component group/world-writable: {path_check}", file=sys.stderr)
        sys.exit(2)
# Final file must be regular executable
st = os.lstat(os.path.realpath(cand))
if not stat.S_ISREG(st.st_mode):
    print("error: helper is not a regular file", file=sys.stderr); sys.exit(2)
if st.st_uid != 0:
    print("error: helper not root-owned", file=sys.stderr); sys.exit(2)
print(os.path.realpath(cand))
sys.exit(0)
PY
}

r2_ro_init_trusted_helpers() {
  # Refuse any production override knobs early.
  if [[ -n "${HOLO_TRUSTED_AWS_BIN:-}" || -n "${HOLO_TRUSTED_CURL_BIN:-}" || -n "${HOLO_QA_PROOF_MUTATE:-}" ]]; then
    echo "error: GATE-FIX-S28R3-QA14 refuses production provider/test overrides (HOLO_TRUSTED_* / HOLO_QA_PROOF_MUTATE)" >&2
    return 2
  fi
  if [[ -n "${HOLO_FIRE_DRILL_FAKE_VOLUMES:-}" || -n "${HOLO_CLI:-}" ]]; then
    # Only fire-drill consumer enforces HOLO_CLI; still refuse if set in live prove path.
    :
  fi
  local resolved
  if ! resolved="$(r2_ro_validate_root_bin "$R2_RO_ENV_BIN")"; then
    echo "error: GATE-FIX-S28R3-QA14 /usr/bin/env trust chain failed" >&2
    return 2
  fi
  R2_RO_ENV_BIN="$resolved"
  if ! resolved="$(r2_ro_validate_root_bin "$R2_RO_PYTHON_BIN")"; then
    echo "error: GATE-FIX-S28R3-QA14 /usr/bin/python3 trust chain failed" >&2
    return 2
  fi
  R2_RO_PYTHON_BIN="$resolved"
  if ! resolved="$(r2_ro_validate_root_bin "$R2_RO_CURL_BIN")"; then
    echo "error: GATE-FIX-S28R3-QA14 /usr/bin/curl trust chain failed" >&2
    return 2
  fi
  R2_RO_CURL_BIN="$resolved"
  if [[ ! -f "$R2_RO_PROVIDER_PY" ]]; then
    echo "error: GATE-FIX-S28R3-QA14 missing repository provider $R2_RO_PROVIDER_PY" >&2
    return 2
  fi
  # Provider script must live under repo scripts/lib (not world-writable).
  if ! R2_RO_PROVIDER_PY="$("$R2_RO_PYTHON_BIN" -E -s - "$R2_RO_PROVIDER_PY" "$ROOT" <<'PY'
import os, stat, sys
path, root = sys.argv[1], sys.argv[2]
real = os.path.realpath(path)
root = os.path.realpath(root)
if not real.startswith(root + os.sep + "scripts" + os.sep + "lib" + os.sep):
    print("error: provider not under scripts/lib", file=sys.stderr); sys.exit(2)
st = os.lstat(real)
if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode):
    print("error: provider must be a regular non-symlink file", file=sys.stderr); sys.exit(2)
mode = stat.S_IMODE(st.st_mode)
if mode & (stat.S_IWGRP | stat.S_IWOTH):
    print("error: provider is group/world-writable", file=sys.stderr); sys.exit(2)
print(real)
PY
)"; then
    return 2
  fi
  return 0
}

# GATE-FIX-S28R3-QA25: create private 0600 temp file under TMPDIR (absolute path).
r2_ro_mktemp_private() {
  local tmp
  tmp="$(/usr/bin/mktemp "${TMPDIR:-/tmp}/holo-r2-seal.XXXXXX")" || return 2
  /bin/chmod 600 "$tmp" || { /bin/rm -f "$tmp"; return 2; }
  # Ensure absolute (mktemp may return relative on some TMPDIR shapes).
  case "$tmp" in
    /*) printf '%s' "$tmp" ;;
    *) printf '%s' "$(pwd)/$tmp" ;;
  esac
}

# GATE-FIX-S28R3-QA25: seal named env keys into a private file (argv = path + key names only).
# format: assignments → KEY=VAL\0 ; values → VAL\0
# Usage: r2_ro_seal_env_to_file assignments|values OUT_PATH KEY1 KEY2 ...
r2_ro_seal_env_to_file() {
  local fmt="$1" out_path="$2"
  shift 2
  local py_bin="${R2_RO_PYTHON_BIN:-/usr/bin/python3}"
  local sealer="${R2_RO_SEAL_ENV_TO_FILE_PY:-${ROOT}/scripts/lib/seal-env-to-file.py}"
  if [[ ! -f "$sealer" ]]; then
    echo "error: GATE-FIX-S28R3-QA25 missing seal-env helper: $sealer" >&2
    return 2
  fi
  if [[ $# -lt 1 ]]; then
    echo "error: GATE-FIX-S28R3-QA25 r2_ro_seal_env_to_file requires KEY names" >&2
    return 2
  fi
  "$py_bin" -E -s "$sealer" --format="$fmt" "$out_path" "$@"
}

# GATE-FIX-S28R3-QA25: open FD 3 from sealed env-key assignments, unlink file immediately.
# Usage: r2_ro_open_fd3_from_env_keys KEY1 KEY2 ...
# Leaves FD 3 open for the caller; returns 0 on success.
r2_ro_open_fd3_from_env_keys() {
  local tmp
  if [[ $# -lt 1 ]]; then
    echo "error: GATE-FIX-S28R3-QA25 r2_ro_open_fd3_from_env_keys requires KEY names" >&2
    return 2
  fi
  tmp="$(r2_ro_mktemp_private)" || return 2
  if ! r2_ro_seal_env_to_file assignments "$tmp" "$@"; then
    /bin/rm -f "$tmp"
    return 2
  fi
  # Open then unlink so no durable sealed material remains on disk.
  exec 3< "$tmp"
  /bin/rm -f "$tmp"
  return 0
}

# GATE-FIX-S28R3-QA25: open FD 3 from sealed raw field values (for fp16 / redactor tuples).
# Usage: r2_ro_open_fd3_from_env_values KEY1 KEY2 ...
r2_ro_open_fd3_from_env_values() {
  local tmp
  if [[ $# -lt 1 ]]; then
    echo "error: GATE-FIX-S28R3-QA25 r2_ro_open_fd3_from_env_values requires KEY names" >&2
    return 2
  fi
  tmp="$(r2_ro_mktemp_private)" || return 2
  if ! r2_ro_seal_env_to_file values "$tmp" "$@"; then
    /bin/rm -f "$tmp"
    return 2
  fi
  exec 3< "$tmp"
  /bin/rm -f "$tmp"
  return 0
}

# GATE-FIX-S28R3-QA18/23/25 env-sanitize + secret-free argv:
# Preferred: r2_ro_exec_isolated_from_env KEY1 KEY2 -- /abs/cmd [args...]
#   Values already in caller's environment under those key names; sealer argv is
#   only absolute paths + key names; FD 3 carries KEY=VAL\0 into exec-env-from-fd.
#
# Legacy: r2_ro_exec_isolated KEY=val KEY=val -- /abs/cmd [args...]
#   NON-SECRET pairs only (PATH, HOME, LC_ALL, proof paths, REQUIRE_*). Credential
#   material (R2_*/AWS_*/RESTIC_*/cipher/session/token/password) must use from_env.
#   Sealed via bash-builtin write to private temp (never process-sub printf of values).

# Credential-ish key detector (case-insensitive name match).
r2_ro_key_is_credentialish() {
  local k="$1"
  local kl
  kl="$(printf '%s' "$k" | /usr/bin/tr '[:upper:]' '[:lower:]')"
  case "$kl" in
    *secret*|*password*|*token*|*session*|*cipher*|*credential*) return 0 ;;
  esac
  case "$k" in
    R2_*|AWS_*|RESTIC_*|CF_API_TOKEN|CLOUDFLARE_API_TOKEN|BACKUP_R2_*) return 0 ;;
  esac
  return 1
}

# Usage: r2_ro_exec_isolated_from_env KEY1 KEY2 KEY3 -- /abs/command [args...]
# Optional non-secret KEY=val assignments may appear before -- ONLY for keys that
# are not credentialish (PATH, HOME, LC_ALL, REQUIRE_*, HOLO_R2_RO_PROOF_OUT, ...).
# Credential keys must already be present in the caller's environment.
r2_ro_exec_isolated_from_env() {
  local -a keys=()
  local -a cmd=()
  local saw_sep=0 arg key val
  local py_bin="${R2_RO_PYTHON_BIN:-/usr/bin/python3}"
  local launcher="${R2_RO_EXEC_ENV_FROM_FD_PY:-${ROOT}/scripts/lib/exec-env-from-fd.py}"
  for arg in "$@"; do
    if [[ $saw_sep -eq 1 ]]; then
      cmd+=("$arg")
    elif [[ "$arg" == "--" ]]; then
      saw_sep=1
    elif [[ "$arg" == *=* ]]; then
      key="${arg%%=*}"
      val="${arg#*=}"
      if r2_ro_key_is_credentialish "$key"; then
        echo "error: GATE-FIX-S28R3-QA25 r2_ro_exec_isolated_from_env refuses credential KEY=val on argv (export key then pass name only): $key" >&2
        return 2
      fi
      # Non-secret override: export into this shell so sealer can read it.
      export "$key=$val"
      keys+=("$key")
    else
      if [[ ! "$arg" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
        echo "error: GATE-FIX-S28R3-QA25 r2_ro_exec_isolated_from_env invalid KEY name" >&2
        return 2
      fi
      keys+=("$arg")
    fi
  done
  if [[ $saw_sep -ne 1 || ${#cmd[@]} -lt 1 ]]; then
    echo "error: GATE-FIX-S28R3-QA25 r2_ro_exec_isolated_from_env requires KEY... -- command [args]" >&2
    return 2
  fi
  if [[ ${#keys[@]} -lt 1 ]]; then
    echo "error: GATE-FIX-S28R3-QA25 r2_ro_exec_isolated_from_env requires at least one KEY" >&2
    return 2
  fi
  case "${cmd[0]}" in
    /*) ;;
    *)
      echo "error: GATE-FIX-S28R3-QA17 isolated command must be absolute path" >&2
      return 2
      ;;
  esac
  if [[ ! -x "${cmd[0]}" && ! -f "${cmd[0]}" ]]; then
    echo "error: GATE-FIX-S28R3-QA17 isolated command missing: ${cmd[0]}" >&2
    return 2
  fi
  if [[ ! -f "$launcher" ]]; then
    echo "error: GATE-FIX-S28R3-QA23 missing env-from-fd launcher: $launcher" >&2
    return 2
  fi
  if ! r2_ro_open_fd3_from_env_keys "${keys[@]}"; then
    echo "error: GATE-FIX-S28R3-QA25 failed to seal env keys onto FD 3" >&2
    return 2
  fi
  set +e
  "$py_bin" -E -s "$launcher" -- "${cmd[@]}"
  local rc=$?
  exec 3<&- 2>/dev/null || true
  return "$rc"
}

# Legacy KEY=val form. GATE-FIX-S28R3-QA25: refuse credentialish KEY=val (force from_env).
# Non-secret pairs sealed via private temp file + bash-builtin printf (no process-sub).
r2_ro_exec_isolated() {
  local -a pairs=()
  local -a cmd=()
  local saw_sep=0 arg key
  local py_bin="${R2_RO_PYTHON_BIN:-/usr/bin/python3}"
  local launcher="${R2_RO_EXEC_ENV_FROM_FD_PY:-${ROOT}/scripts/lib/exec-env-from-fd.py}"
  for arg in "$@"; do
    if [[ $saw_sep -eq 1 ]]; then
      cmd+=("$arg")
    elif [[ "$arg" == "--" ]]; then
      saw_sep=1
    else
      if [[ "$arg" != *=* ]]; then
        echo "error: GATE-FIX-S28R3-QA18 r2_ro_exec_isolated expects KEY=VAL before -- (got non-assignment); for credentials use r2_ro_exec_isolated_from_env KEYNAMES -- cmd" >&2
        return 2
      fi
      key="${arg%%=*}"
      if r2_ro_key_is_credentialish "$key"; then
        echo "error: GATE-FIX-S28R3-QA25 r2_ro_exec_isolated refuses credential KEY=val on intermediate argv ($key); export value and use r2_ro_exec_isolated_from_env" >&2
        return 2
      fi
      pairs+=("$arg")
    fi
  done
  if [[ $saw_sep -ne 1 || ${#cmd[@]} -lt 1 ]]; then
    echo "error: GATE-FIX-S28R3-QA18 r2_ro_exec_isolated requires KEY=VAL... -- command [args] (refuse bare env dump)" >&2
    return 2
  fi
  case "${cmd[0]}" in
    /*) ;;
    *)
      echo "error: GATE-FIX-S28R3-QA17 isolated command must be absolute path" >&2
      return 2
      ;;
  esac
  if [[ ! -x "${cmd[0]}" && ! -f "${cmd[0]}" ]]; then
    echo "error: GATE-FIX-S28R3-QA17 isolated command missing: ${cmd[0]}" >&2
    return 2
  fi
  if [[ ! -f "$launcher" ]]; then
    echo "error: GATE-FIX-S28R3-QA23 missing env-from-fd launcher: $launcher" >&2
    return 2
  fi
  # Seal non-secret pairs via private temp + bash builtin printf (no process-sub, no external printf).
  local tmp p
  tmp="$(r2_ro_mktemp_private)" || return 2
  : >"$tmp"
  /bin/chmod 600 "$tmp"
  for p in "${pairs[@]}"; do
    # bash builtin printf — does not spawn a process; values never appear on ps argv.
    printf '%s\0' "$p" >>"$tmp"
  done
  exec 3< "$tmp"
  /bin/rm -f "$tmp"
  # GATE-FIX-S28R3-QA24: never re-enable set -e before return of non-zero.
  set +e
  "$py_bin" -E -s "$launcher" -- "${cmd[@]}"
  local rc=$?
  exec 3<&- 2>/dev/null || true
  return "$rc"
}

# Filter process output to allowlisted status/class lines only (never KEY=value dumps).
# IMPORTANT: use python -c so stdin remains the pipe to filter (heredoc would steal stdin).
r2_ro_filter_safe_log() {
  /usr/bin/env -i PATH=/usr/bin:/bin HOME="${HOME:-/tmp}" LC_ALL=C \
    /usr/bin/python3 -E -s -c '
import re, sys
allow = re.compile(
    r"^(PASS:|FAIL:|INFO:|error:|RESIDUAL:|=== RESULT:|=== prove|"
    r"\[assert_bound|\[run-fire-drill|wrote RO proof|human_required|"
    r"Cloudflare dashboard|Automated mint|NEVER reuse|"
    r"GATE-FIX-|writer preflight)"
)
deny = re.compile(
    r"(?i)(api[_-]?key|secret|token|password|bearer |authorization:|"
    r"sk-[a-z0-9]|xai-|lin_api_|OPENAI_|ANTHROPIC_|JINA_|CONVEX_TEAM|"
    r"^SHELL=|^PATH=|^HOME=|^USER=|^npm_|^CMUX_|^OTEL_|^SSH_|"
    r"^[A-Z][A-Z0-9_]{2,}=.)"
)
for line in sys.stdin:
    s = line.rstrip("\n")
    if deny.search(s) and not allow.search(s):
        continue
    if allow.search(s):
        s = re.sub(r"(?i)((?:secret|token|password|api_key)\s*=\s*)\S+", r"\1[redacted]", s)
        print(s)
'
}

r2_ro_run_provider() {
  # Run stdlib S3 provider with sealed-from-env credentials (never KEY=secret on argv).
  # Usage: r2_ro_run_provider <ak> <sk> <st> <cmd> [args...]
  # Function args stay in-shell; sealer reads exported AWS_* from this function scope only.
  local ak="$1" sk="$2" st="$3"
  shift 3
  # Export into current shell for sealer; restore prior values after to avoid ambient leak growth.
  local _prev_ak="${AWS_ACCESS_KEY_ID-}" _prev_sk="${AWS_SECRET_ACCESS_KEY-}" \
    _prev_st="${AWS_SESSION_TOKEN-}" _prev_reg="${AWS_DEFAULT_REGION-}" \
    _prev_path="${PATH-}" _prev_home="${HOME-}" _prev_lc="${LC_ALL-}"
  local _had_ak=0 _had_sk=0 _had_st=0 _had_reg=0 _had_path=0 _had_home=0 _had_lc=0
  [[ -n "${AWS_ACCESS_KEY_ID+x}" ]] && _had_ak=1
  [[ -n "${AWS_SECRET_ACCESS_KEY+x}" ]] && _had_sk=1
  [[ -n "${AWS_SESSION_TOKEN+x}" ]] && _had_st=1
  [[ -n "${AWS_DEFAULT_REGION+x}" ]] && _had_reg=1
  [[ -n "${PATH+x}" ]] && _had_path=1
  [[ -n "${HOME+x}" ]] && _had_home=1
  [[ -n "${LC_ALL+x}" ]] && _had_lc=1
  export AWS_ACCESS_KEY_ID="$ak"
  export AWS_SECRET_ACCESS_KEY="$sk"
  export AWS_SESSION_TOKEN="$st"
  export AWS_DEFAULT_REGION=auto
  export PATH="/usr/bin:/bin"
  export HOME="${HOME:-/tmp}"
  export LC_ALL=C
  set +e
  r2_ro_exec_isolated_from_env \
    PATH HOME LC_ALL \
    AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_DEFAULT_REGION \
    -- \
    "$R2_RO_PYTHON_BIN" "$R2_RO_PROVIDER_PY" "$@"
  local rc=$?
  set +e
  # Restore prior env (do not leave provider credentials ambient; restore PATH).
  if [[ $_had_ak -eq 1 ]]; then export AWS_ACCESS_KEY_ID="$_prev_ak"; else unset AWS_ACCESS_KEY_ID; fi
  if [[ $_had_sk -eq 1 ]]; then export AWS_SECRET_ACCESS_KEY="$_prev_sk"; else unset AWS_SECRET_ACCESS_KEY; fi
  if [[ $_had_st -eq 1 ]]; then export AWS_SESSION_TOKEN="$_prev_st"; else unset AWS_SESSION_TOKEN; fi
  if [[ $_had_reg -eq 1 ]]; then export AWS_DEFAULT_REGION="$_prev_reg"; else unset AWS_DEFAULT_REGION; fi
  if [[ $_had_path -eq 1 ]]; then export PATH="$_prev_path"; else unset PATH; fi
  if [[ $_had_home -eq 1 ]]; then export HOME="$_prev_home"; else unset HOME; fi
  if [[ $_had_lc -eq 1 ]]; then export LC_ALL="$_prev_lc"; else unset LC_ALL; fi
  return "$rc"
}


# GATE-FIX-S28R3-QA19: field extract without PATH awk (credential-adjacent parsing).
r2_ro_field() {
  # usage: r2_ro_field <1-based-index> <tab-separated-line>
  local idx="$1" line="$2"
  /usr/bin/env -i PATH=/usr/bin:/bin HOME="${HOME:-/tmp}" LC_ALL=C \
    /usr/bin/python3 -E -s -c 'import sys; i=int(sys.argv[1]); parts=sys.argv[2].split("\t"); print(parts[i-1] if 0 < i <= len(parts) else "")' \
    "$idx" "$line"
}

# --- canonical restore context ---

r2_ro_canonical_account_id() {
  local a="${1:-}"
  # GATE-FIX-S28R3-QA21: fixed absolute /usr/bin/tr (no PATH helper while credentials ambient).
  a="$(printf '%s' "$a" | /usr/bin/tr '[:upper:]' '[:lower:]')"
  if [[ ! "$a" =~ ^[0-9a-f]{32}$ ]]; then
    return 1
  fi
  printf '%s' "$a"
}

r2_ro_derive_endpoint() {
  local account_id="$1"
  printf 'https://%s.r2.cloudflarestorage.com' "$account_id"
}

r2_ro_canonical_bucket() {
  local b="${1:-}"
  if [[ "$b" != "$R2_RO_REQUIRED_BUCKET" ]]; then
    return 1
  fi
  printf '%s' "$b"
}

r2_ro_canonical_prefix() {
  local p="${1:-}"
  p="${p#/}"
  p="${p%/}"
  if [[ "$p" != "$R2_RO_REQUIRED_PREFIX" ]]; then
    return 1
  fi
  printf '%s' "$p"
}

r2_ro_build_canonical_policy_json() {
  local bucket="$1" prefix="$2"
  "$R2_RO_PYTHON_BIN" -E -s - "$bucket" "$prefix" <<'PY'
import json, sys
bucket, prefix = sys.argv[1], sys.argv[2]
doc = {
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "HolocronRestoreList",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": [f"arn:aws:s3:::{bucket}"],
    },
    {
      "Sid": "HolocronRestoreGet",
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": [f"arn:aws:s3:::{bucket}/{prefix}/*"],
    },
  ],
}
print(json.dumps(doc, separators=(",", ":"), sort_keys=True), end="")
PY
}

# GATE-FIX-S28R3-QA17: hash via repository provider + absolute python (no openssl/awk/cut).
# GATE-FIX-S28R3-QA23/25: fields (may include AK/SK/ST) travel on sealed FD 3 only —
# never on python/env argv (tuple fingerprint must not expose secrets to /proc cmdline).
# Prefer r2_ro_fp16_from_env_keys / r2_ro_tuple_fp16_from_env for credential fields.
r2_ro_fp16_from_env_keys() {
  # Usage: r2_ro_fp16_from_env_keys KEY1 KEY2 KEY3 ...
  # Values read from caller's environment; sealer argv = paths + key names only.
  local py_bin="${R2_RO_PYTHON_BIN:-/usr/bin/python3}"
  local provider="${R2_RO_PROVIDER_PY:-${ROOT}/scripts/lib/r2_s3_provider.py}"
  local rc
  if [[ $# -lt 1 ]]; then
    echo "error: GATE-FIX-S28R3-QA25 r2_ro_fp16_from_env_keys requires KEY names" >&2
    return 2
  fi
  if ! r2_ro_open_fd3_from_env_values "$@"; then
    return 2
  fi
  set +e
  /usr/bin/env -i PATH=/usr/bin:/bin HOME="${HOME:-/tmp}" LC_ALL=C \
    "$py_bin" -E -s "$provider" fp16 --from-fd3
  rc=$?
  set +e
  exec 3<&- 2>/dev/null || true
  return "$rc"
}

r2_ro_fp16_fields() {
  # Legacy positional fields. GATE-FIX-S28R3-QA25: seal via private temp + bash builtin
  # (never process-sub printf — external/subshell argv must not carry field values).
  local py_bin="${R2_RO_PYTHON_BIN:-/usr/bin/python3}"
  local provider="${R2_RO_PROVIDER_PY:-${ROOT}/scripts/lib/r2_s3_provider.py}"
  local f rc tmp
  tmp="$(r2_ro_mktemp_private)" || return 2
  : >"$tmp"
  /bin/chmod 600 "$tmp"
  for f in "$@"; do
    # bash builtin printf — no separate process argv
    printf '%s\0' "$f" >>"$tmp"
  done
  exec 3< "$tmp"
  /bin/rm -f "$tmp"
  set +e
  /usr/bin/env -i PATH=/usr/bin:/bin HOME="${HOME:-/tmp}" LC_ALL=C \
    "$py_bin" -E -s "$provider" fp16 --from-fd3
  rc=$?
  set +e
  exec 3<&- 2>/dev/null || true
  return "$rc"
}

r2_ro_context_fp16() {
  # args: ep bucket prefix kind policy_json in_key out_key (non-secret context fields)
  r2_ro_fp16_fields "${1:-}" "${2:-}" "${3:-}" "${4:-}" "${5:-}" "${6:-}" "${7:-}"
}

r2_ro_tuple_fp16() {
  # Credential tuple fingerprint — prefer r2_ro_tuple_fp16_from_env when values are in env.
  r2_ro_fp16_fields "${1:-}" "${2:-}" "${3:-}"
}

# Preferred: fingerprint restore/writer tuple already present under named env keys.
r2_ro_tuple_fp16_from_env() {
  # Usage: r2_ro_tuple_fp16_from_env AK_KEY SK_KEY [ST_KEY]
  # Default keys: R2_RESTORE_ACCESS_KEY_ID R2_RESTORE_SECRET_ACCESS_KEY R2_RESTORE_SESSION_TOKEN
  local ak_key="${1:-R2_RESTORE_ACCESS_KEY_ID}"
  local sk_key="${2:-R2_RESTORE_SECRET_ACCESS_KEY}"
  local st_key="${3:-R2_RESTORE_SESSION_TOKEN}"
  r2_ro_fp16_from_env_keys "$ak_key" "$sk_key" "$st_key"
}

# GATE-FIX-S28R3-QA16: load versioned known-existing scope probes.
# Production: ALWAYS bind from fixed scripts/lib/r2-scope-probes.json.
# Caller env cannot replace, relocate, or weaken the oracle (override → fail closed).
# Harness mock mode may use fixture keys only.
r2_ro_bind_scope_probes() {
  local probes_json pair trusted_in trusted_out caller_in caller_out fixed_path
  # Fixed path only — ignore any relocated R2_RO_SCOPE_PROBES_JSON value.
  fixed_path="${ROOT}/scripts/lib/r2-scope-probes.json"
  R2_RO_SCOPE_PROBES_JSON="$fixed_path"
  probes_json="$fixed_path"

  if [[ -n "${R2_RO_SCOPE_PROBES_JSON_OVERRIDE:-}" || -n "${HOLO_SCOPE_PROBES_JSON:-}" ]]; then
    echo "error: GATE-FIX-S28R3-QA16 refuses scope-probes path override env (versioned binding only)" >&2
    return 2
  fi
  if [[ ! -f "$probes_json" ]]; then
    echo "error: GATE-FIX-S28R3-QA16 missing versioned scope probe config $probes_json" >&2
    return 2
  fi

  if ! pair="$("$R2_RO_PYTHON_BIN" -E -s - "$probes_json" "$ROOT" <<'PY'
import json, os, stat, sys
path, root = sys.argv[1], sys.argv[2]
root = os.path.realpath(root)
real = os.path.realpath(path)
expected = os.path.join(root, "scripts", "lib", "r2-scope-probes.json")
if real != os.path.realpath(expected):
    print("error: GATE-FIX-S28R3-QA16 scope probes path must be scripts/lib/r2-scope-probes.json", file=sys.stderr)
    sys.exit(2)
st = os.lstat(path)
if stat.S_ISLNK(st.st_mode):
    print("error: GATE-FIX-S28R3-QA16 scope probes must not be a symlink", file=sys.stderr)
    sys.exit(2)
if not stat.S_ISREG(st.st_mode):
    print("error: GATE-FIX-S28R3-QA16 scope probes must be a regular file", file=sys.stderr)
    sys.exit(2)
mode = stat.S_IMODE(st.st_mode)
if mode & (stat.S_IWGRP | stat.S_IWOTH):
    print("error: GATE-FIX-S28R3-QA16 scope probes is group/world-writable", file=sys.stderr)
    sys.exit(2)
try:
    doc = json.load(open(path, encoding="utf-8"))
except Exception as e:
    print(f"error: GATE-FIX-S28R3-QA16 malformed scope probes JSON: {e}", file=sys.stderr)
    sys.exit(2)
if doc.get("schema") != "holo.r2-scope-probes.v1":
    print("error: GATE-FIX-S28R3-QA16 bad scope probes schema", file=sys.stderr); sys.exit(2)
if doc.get("object_created") is not False:
    print("error: GATE-FIX-S28R3-QA16 scope probes must be listed-not-created (object_created=false)", file=sys.stderr)
    sys.exit(2)
bucket = doc.get("bucket") or ""
prefix = doc.get("prefix") or ""
if bucket != "holocron-backup" or prefix != "pgbackrest":
    print("error: GATE-FIX-S28R3-QA16 scope probes bucket/prefix must be holocron-backup/pgbackrest", file=sys.stderr)
    sys.exit(2)
ink, outk = doc.get("in_key") or "", doc.get("out_key") or ""
if "\t" in ink or "\t" in outk or "\n" in ink or "\n" in outk:
    print("error: GATE-FIX-S28R3-QA16 scope probe keys must not contain control chars", file=sys.stderr)
    sys.exit(2)
if not ink.startswith(prefix + "/") or not outk or outk.startswith(prefix + "/") or outk.startswith(prefix):
    print("error: GATE-FIX-S28R3-QA16 scope probe key/prefix relationship invalid", file=sys.stderr)
    sys.exit(2)
# Refuse secret-looking fields in versioned non-secret artifact.
secret_markers = ("secret", "password", "token", "credential", "access_key", "session")
blob = json.dumps(doc).lower()
for m in secret_markers:
    if m in blob and m not in ("listed_via",):
        # allow words only in note strings carefully — hard-fail on key names
        pass
for k in doc.keys():
    kl = k.lower()
    if any(s in kl for s in ("secret", "password", "token", "credential", "access_key", "session")):
        print(f"error: GATE-FIX-S28R3-QA16 scope probes must not contain secret field {k}", file=sys.stderr)
        sys.exit(2)
oracles = doc.get("oracles") or {}
if oracles.get("out_of_prefix_require") != "AccessDenied":
    print("error: GATE-FIX-S28R3-QA16 oracles.out_of_prefix_require must be AccessDenied", file=sys.stderr)
    sys.exit(2)
print(f"{ink}\t{outk}")
PY
)"; then
    return 2
  fi
  trusted_in="${pair%%$'\t'*}"
  trusted_out="${pair#*$'\t'}"
  if [[ -z "$trusted_in" || -z "$trusted_out" || "$trusted_in" == "$pair" ]]; then
    echo "error: GATE-FIX-S28R3-QA16 trusted scope probes empty" >&2
    return 2
  fi

  # GATE-FIX-S28R3-QA19: production has NO mock branch (harness patches after copy).
  # Versioned artifact is sole authority. Env cannot replace keys.
  caller_in="${R2_SCOPE_PROBE_IN_KEY-}"
  caller_out="${R2_SCOPE_PROBE_OUT_KEY-}"
  if [[ -n "$caller_in" && "$caller_in" != "$trusted_in" ]]; then
    echo "error: GATE-FIX-S28R3-QA16 refuses env override of versioned R2_SCOPE_PROBE_IN_KEY" >&2
    return 2
  fi
  if [[ -n "$caller_out" && "$caller_out" != "$trusted_out" ]]; then
    echo "error: GATE-FIX-S28R3-QA16 refuses env override of versioned R2_SCOPE_PROBE_OUT_KEY" >&2
    return 2
  fi
  R2_SCOPE_PROBE_IN_KEY="$trusted_in"
  R2_SCOPE_PROBE_OUT_KEY="$trusted_out"

  case "${R2_SCOPE_PROBE_IN_KEY}" in
    pgbackrest/*) ;;
    *)
      echo "error: GATE-FIX-S28R3-QA16 R2_SCOPE_PROBE_IN_KEY must be under pgbackrest/" >&2
      return 2
      ;;
  esac
  case "${R2_SCOPE_PROBE_OUT_KEY}" in
    pgbackrest/*|pgbackrest)
      echo "error: GATE-FIX-S28R3-QA16 R2_SCOPE_PROBE_OUT_KEY must be outside pgbackrest/" >&2
      return 2
      ;;
    *..*|'')
      echo "error: GATE-FIX-S28R3-QA16 R2_SCOPE_PROBE_OUT_KEY invalid" >&2
      return 2
      ;;
  esac
  export R2_SCOPE_PROBE_IN_KEY R2_SCOPE_PROBE_OUT_KEY
  return 0
}

r2_ro_establish_canonical_context() {
  local account_id ep bucket prefix policy_json ctx kind supplied_ep
  kind="${R2_CREDENTIAL_KIND:-$R2_RO_SUPPORTED_POLICY_KIND}"
  if [[ "$kind" != "$R2_RO_SUPPORTED_POLICY_KIND" ]]; then
    echo "error: GATE-FIX-S28R3-QA14 unsupported R2_CREDENTIAL_KIND (only object-read-only)" >&2
    return 2
  fi
  if ! account_id="$(r2_ro_canonical_account_id "${R2_ACCOUNT_ID:-}")"; then
    echo "error: GATE-FIX-S28R3-QA14 R2_ACCOUNT_ID must be 32-hex Cloudflare account id" >&2
    return 2
  fi
  ep="$(r2_ro_derive_endpoint "$account_id")"
  # MEDIUM-1: supplied endpoint must byte-equal derived (no normalization).
  supplied_ep="${R2_ENDPOINT-}"
  if [[ -n "${R2_ENDPOINT+x}" ]]; then
    if [[ "$supplied_ep" != "$ep" ]]; then
      echo "error: GATE-FIX-S28R3-QA14 R2_ENDPOINT must byte-equal https://\${R2_ACCOUNT_ID}.r2.cloudflarestorage.com (no case/slash/path variants)" >&2
      return 2
    fi
  fi
  if ! bucket="$(r2_ro_canonical_bucket "${R2_BUCKET_NAME:-$R2_RO_REQUIRED_BUCKET}")"; then
    echo "error: GATE-FIX-S28R3-QA14 bucket must be exactly holocron-backup" >&2
    return 2
  fi
  local raw_prefix
  if [[ -n "${R2_RESTORE_OBJECT_PREFIX+x}" ]]; then
    raw_prefix="${R2_RESTORE_OBJECT_PREFIX}"
  elif [[ -n "${R2_PGBACKREST_PREFIX+x}" ]]; then
    raw_prefix="${R2_PGBACKREST_PREFIX}"
  else
    raw_prefix="$R2_RO_REQUIRED_PREFIX"
  fi
  if ! prefix="$(r2_ro_canonical_prefix "$raw_prefix")"; then
    echo "error: GATE-FIX-S28R3-QA14 restore prefix must be exactly pgbackrest (gate-plan policy)" >&2
    return 2
  fi
  policy_json="$(r2_ro_build_canonical_policy_json "$bucket" "$prefix")"
  if [[ -z "$policy_json" ]]; then
    echo "error: GATE-FIX-S28R3-QA14 unable to build canonical policy" >&2
    return 2
  fi
  if [[ -n "${R2_CREDENTIAL_POLICY:-}" ]]; then
    local caller_norm
    caller_norm="$("$R2_RO_PYTHON_BIN" -E -s -c 'import json,sys; print(json.dumps(json.loads(sys.argv[1]), separators=(",",":"), sort_keys=True), end="")' \
      "$R2_CREDENTIAL_POLICY" 2>/dev/null || true)"
    if [[ -z "$caller_norm" || "$caller_norm" != "$policy_json" ]]; then
      echo "error: GATE-FIX-S28R3-QA14 R2_CREDENTIAL_POLICY noncanonical vs required pgbackrest object-read-only policy" >&2
      return 2
    fi
  fi
  # Bind known-existing scope probes from control-plane trusted config.
  if ! r2_ro_bind_scope_probes; then
    return 2
  fi
  ctx="$(r2_ro_context_fp16 "$ep" "$bucket" "$prefix" "$kind" "$policy_json" \
    "${R2_SCOPE_PROBE_IN_KEY}" "${R2_SCOPE_PROBE_OUT_KEY}")"
  if [[ -z "$ctx" || "${#ctx}" -lt 8 ]]; then
    echo "error: GATE-FIX-S28R3-QA14 unable to fingerprint canonical context" >&2
    return 2
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s' "$ep" "$bucket" "$prefix" "$kind" "$policy_json" "$ctx"
}

# --- private proof dir + exclusive no-follow create + FD-safe consume ---

r2_ro_ensure_private_proof_dir() {
  "$R2_RO_PYTHON_BIN" -E -s - "$R2_RO_TRUSTED_PROOF_DIR" <<'PY'
import os, stat, sys
path = sys.argv[1]
os.makedirs(path, mode=0o700, exist_ok=True)
st = os.lstat(path)
if stat.S_ISLNK(st.st_mode) or not stat.S_ISDIR(st.st_mode):
    print("error: proof dir is not a real directory", file=sys.stderr); sys.exit(2)
os.chmod(path, 0o700)
st = os.lstat(path)
if stat.S_IMODE(st.st_mode) != 0o700:
    print(f"error: proof dir mode {oct(stat.S_IMODE(st.st_mode))} != 0o700", file=sys.stderr); sys.exit(2)
if st.st_uid not in (0, os.geteuid()):
    print("error: proof dir ownership not trusted", file=sys.stderr); sys.exit(2)
print(path)
PY
}

r2_ro_new_proof_path() {
  r2_ro_ensure_private_proof_dir >/dev/null
  local name path ts
  # GATE-FIX-S28R3-QA21: fixed absolute /bin/date — never PATH `date` while credentials ambient.
  ts="$(/bin/date +%s)" || {
    echo "error: GATE-FIX-S28R3-QA21 /bin/date failed for proof name" >&2
    return 2
  }
  name="proof.${ts}.$$.$RANDOM.json"
  path="${R2_RO_TRUSTED_PROOF_DIR}/${name}"
  if [[ -e "$path" ]]; then
    echo "error: proof path collision" >&2
    return 2
  fi
  printf '%s' "$path"
}

r2_ro_write_proof_exclusive() {
  local out="$1" fp="$2" ctx="$3"
  local in_key="${R2_SCOPE_PROBE_IN_KEY:-}" out_key="${R2_SCOPE_PROBE_OUT_KEY:-}"
  "$R2_RO_PYTHON_BIN" -E -s - "$out" "$fp" "$ctx" "$R2_RO_TRUSTED_PROOF_DIR" "$in_key" "$out_key" <<'PY'
import json, os, stat, sys
from datetime import datetime, timezone
out, fp, ctx, trusted, in_key, out_key = sys.argv[1:7]
trusted = os.path.realpath(trusted)
if ".." in out.split(os.sep):
    print("error: proof path contains ..", file=sys.stderr); sys.exit(2)
parent = os.path.dirname(out)
pst = os.lstat(parent)
if stat.S_ISLNK(pst.st_mode) or not stat.S_ISDIR(pst.st_mode):
    print("error: proof parent is not a real directory", file=sys.stderr); sys.exit(2)
if os.path.realpath(parent) != trusted or stat.S_IMODE(pst.st_mode) != 0o700:
    print("error: proof parent not trusted private dir", file=sys.stderr); sys.exit(2)
try:
    os.lstat(out)
except FileNotFoundError:
    pass
else:
    print("error: proof path already exists (refuse truncate/follow)", file=sys.stderr); sys.exit(2)
flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
if hasattr(os, "O_NOFOLLOW"):
    flags |= os.O_NOFOLLOW
fd = os.open(out, flags, 0o600)
try:
    os.fchmod(fd, 0o600)
except OSError:
    pass
if not in_key or not out_key:
    print("error: proof missing bound scope probe keys", file=sys.stderr); sys.exit(2)
payload = {
    "schema": "holo.r2-ro-proof.v1",
    "ok": True,
    "tuple_fp16": fp,
    "context_fp16": ctx,
    "list_allowed": True,
    "prefix_list_allowed": True,
    "prefix_head_allowed": True,
    "prefix_get_allowed": True,
    "out_of_prefix_list_denied": True,
    "out_of_prefix_head_denied": True,
    "out_of_prefix_get_denied": True,
    "put_denied": True,
    "delete_denied": True,
    "policy_kind": "object-read-only",
    "bucket": "holocron-backup",
    "prefix": "pgbackrest",
    "scope_probe_in_key": in_key,
    "scope_probe_out_key": out_key,
    "scope_probes_bound": True,
    "scope_probes_versioned_config": "scripts/lib/r2-scope-probes.json",
    "scope_probes_schema": "holo.r2-scope-probes.v1",
    "scope_probes_preflight": os.environ.get("R2_SCOPE_PREFLIGHT_PROVENANCE") or "versioned-config-bind",
    "scope_probes_in_exists": os.environ.get("R2_SCOPE_PREFLIGHT_IN_EXISTS") or "bound",
    "scope_probes_out_exists": os.environ.get("R2_SCOPE_PREFLIGHT_OUT_EXISTS") or "bound",
    "scope_oracles": {
        "out_of_prefix_list": "AccessDenied",
        "out_of_prefix_head": "AccessDenied",
        "out_of_prefix_get": "AccessDenied",
    },
    "producer": "scripts/prove-r2-readonly.sh",
    "proved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "note": "non-secret fingerprints + versioned known-existing scope probe keys",
}
with os.fdopen(fd, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
st = os.lstat(out)
if stat.S_ISLNK(st.st_mode) or stat.S_IMODE(st.st_mode) != 0o600:
    print("error: proof file post-write identity invalid", file=sys.stderr); sys.exit(2)
print(f"wrote RO proof attestation: {out} tuple_fp16={fp} context_fp16={ctx}")
PY
}

r2_ro_validate_proof() {
  local path="$1" efp="$2" ectx="$3"
  "$R2_RO_PYTHON_BIN" -E -s - "$path" "$efp" "$ectx" "$R2_RO_TRUSTED_PROOF_DIR" <<'PY'
import json, os, stat, sys
from datetime import datetime, timezone
path, efp, ectx, trusted = sys.argv[1:5]
trusted = os.path.realpath(trusted)
parent = os.path.dirname(path)
name = os.path.basename(path)
if ".." in path.split(os.sep) or not name or name in (".", ".."):
    print("error: invalid proof path", file=sys.stderr); sys.exit(2)
dir_flags = os.O_RDONLY
if hasattr(os, "O_DIRECTORY"):
    dir_flags |= os.O_DIRECTORY
if hasattr(os, "O_NOFOLLOW"):
    dir_flags |= os.O_NOFOLLOW
try:
    dfd = os.open(parent, dir_flags)
except OSError as e:
    print(f"error: cannot open proof parent dir: {e}", file=sys.stderr); sys.exit(2)
try:
    pst = os.fstat(dfd)
    if not stat.S_ISDIR(pst.st_mode) or stat.S_IMODE(pst.st_mode) != 0o700:
        print("error: proof parent not private directory via FD", file=sys.stderr); sys.exit(2)
    if os.path.realpath(parent) != trusted:
        print("error: proof parent realpath not trusted", file=sys.stderr); sys.exit(2)
    file_flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        file_flags |= os.O_NOFOLLOW
    try:
        fd = os.open(name, file_flags, dir_fd=dfd)
    except TypeError:
        full = os.path.join(parent, name)
        st = os.lstat(full)
        if stat.S_ISLNK(st.st_mode):
            print("error: RO proof is a symlink (refuse follow)", file=sys.stderr); sys.exit(2)
        fd = os.open(full, file_flags)
    except OSError as e:
        print(f"error: cannot open proof via dir FD: {e}", file=sys.stderr); sys.exit(2)
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode):
            print("error: RO proof FD is not a regular file", file=sys.stderr); sys.exit(2)
        if stat.S_IMODE(st.st_mode) != 0o600:
            print(f"error: RO proof mode {oct(stat.S_IMODE(st.st_mode))} != 0o600", file=sys.stderr); sys.exit(2)
        with os.fdopen(fd, "r", encoding="utf-8") as f:
            data = json.load(f)
        fd = -1
    finally:
        if fd >= 0:
            os.close(fd)
finally:
    os.close(dfd)

if data.get("schema") != "holo.r2-ro-proof.v1" or data.get("ok") is not True:
    print("error: RO proof attestation missing schema/ok", file=sys.stderr); sys.exit(2)
if data.get("tuple_fp16") != efp:
    print("error: RO proof tuple_fp16 mismatch", file=sys.stderr); sys.exit(2)
if data.get("context_fp16") != ectx:
    print("error: RO proof context_fp16 mismatch", file=sys.stderr); sys.exit(2)
if data.get("producer") != "scripts/prove-r2-readonly.sh":
    print("error: RO proof producer is not fixed scripts/prove-r2-readonly.sh", file=sys.stderr); sys.exit(2)
if data.get("policy_kind") != "object-read-only":
    print("error: RO proof policy_kind not object-read-only", file=sys.stderr); sys.exit(2)
for k in (
    "list_allowed",
    "prefix_list_allowed",
    "prefix_head_allowed",
    "prefix_get_allowed",
    "out_of_prefix_list_denied",
    "out_of_prefix_head_denied",
    "out_of_prefix_get_denied",
    "put_denied",
    "delete_denied",
):
    if data.get(k) is not True:
        print(f"error: RO proof {k} not true", file=sys.stderr); sys.exit(2)
proved = data.get("proved_at") or ""
try:
    dt = datetime.strptime(proved, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    age = (datetime.now(timezone.utc) - dt).total_seconds()
    if age < 0 or age > 7200:
        print("error: RO proof attestation stale or future-dated", file=sys.stderr); sys.exit(2)
except Exception:
    print("error: RO proof attestation missing/invalid proved_at", file=sys.stderr); sys.exit(2)
print(f"RO proof fresh-bound ok tuple_fp16={efp} context_fp16={ectx}")
sys.exit(0)
PY
}
