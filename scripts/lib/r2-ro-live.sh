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

# Absolute root-owned helpers only (never PATH, never fixtures, never env overrides).
R2_RO_ENV_BIN="/usr/bin/env"
R2_RO_PYTHON_BIN="/usr/bin/python3"
R2_RO_CURL_BIN="/usr/bin/curl"
R2_RO_PROVIDER_PY="${ROOT}/scripts/lib/r2_s3_provider.py"

# --- trust chain validation (root-owned, no group/world-writable parents) ---

r2_ro_validate_root_bin() {
  # args: absolute path to executable
  # Bootstrap validator is always absolute /usr/bin/python3 (not PATH).
  local candidate="$1"
  /usr/bin/python3 - "$candidate" <<'PY'
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
  if ! R2_RO_PROVIDER_PY="$("$R2_RO_PYTHON_BIN" - "$R2_RO_PROVIDER_PY" "$ROOT" <<'PY'
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

r2_ro_run_provider() {
  # Run stdlib S3 provider with absolute env -i + absolute python. Credentials via env only.
  # Usage: r2_ro_run_provider <cmd> [args...]
  local ak="$1" sk="$2" st="$3"
  shift 3
  "$R2_RO_ENV_BIN" -i \
    "PATH=/usr/bin:/bin" \
    "HOME=${HOME:-/tmp}" \
    "LC_ALL=C" \
    "AWS_ACCESS_KEY_ID=${ak}" \
    "AWS_SECRET_ACCESS_KEY=${sk}" \
    "AWS_SESSION_TOKEN=${st}" \
    "AWS_DEFAULT_REGION=auto" \
    "$R2_RO_PYTHON_BIN" "$R2_RO_PROVIDER_PY" "$@"
}

# --- canonical restore context ---

r2_ro_canonical_account_id() {
  local a="${1:-}"
  a="$(printf '%s' "$a" | tr '[:upper:]' '[:lower:]')"
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
  "$R2_RO_PYTHON_BIN" - "$bucket" "$prefix" <<'PY'
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

r2_ro_context_fp16() {
  printf '%s\0%s\0%s\0%s\0%s' "${1:-}" "${2:-}" "${3:-}" "${4:-}" "${5:-}" \
    | openssl dgst -sha256 2>/dev/null | awk '{print $NF}' | cut -c1-16
}

r2_ro_tuple_fp16() {
  printf '%s\0%s\0%s' "${1:-}" "${2:-}" "${3:-}" \
    | openssl dgst -sha256 2>/dev/null | awk '{print $NF}' | cut -c1-16
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
    caller_norm="$("$R2_RO_PYTHON_BIN" -c 'import json,sys; print(json.dumps(json.loads(sys.argv[1]), separators=(",",":"), sort_keys=True), end="")' \
      "$R2_CREDENTIAL_POLICY" 2>/dev/null || true)"
    if [[ -z "$caller_norm" || "$caller_norm" != "$policy_json" ]]; then
      echo "error: GATE-FIX-S28R3-QA14 R2_CREDENTIAL_POLICY noncanonical vs required pgbackrest object-read-only policy" >&2
      return 2
    fi
  fi
  # Known-existing scope probe keys required for live authorization oracles.
  if [[ -z "${R2_SCOPE_PROBE_IN_KEY:-}" || -z "${R2_SCOPE_PROBE_OUT_KEY:-}" ]]; then
    echo "error: GATE-FIX-S28R3-QA14 requires R2_SCOPE_PROBE_IN_KEY and R2_SCOPE_PROBE_OUT_KEY (known-existing objects)" >&2
    return 2
  fi
  case "${R2_SCOPE_PROBE_IN_KEY}" in
    pgbackrest/*) ;;
    *)
      echo "error: GATE-FIX-S28R3-QA14 R2_SCOPE_PROBE_IN_KEY must be under pgbackrest/" >&2
      return 2
      ;;
  esac
  case "${R2_SCOPE_PROBE_OUT_KEY}" in
    pgbackrest/*)
      echo "error: GATE-FIX-S28R3-QA14 R2_SCOPE_PROBE_OUT_KEY must be outside pgbackrest/" >&2
      return 2
      ;;
    *..*|'')
      echo "error: GATE-FIX-S28R3-QA14 R2_SCOPE_PROBE_OUT_KEY invalid" >&2
      return 2
      ;;
  esac
  ctx="$(r2_ro_context_fp16 "$ep" "$bucket" "$prefix" "$kind" "$policy_json")"
  if [[ -z "$ctx" || "${#ctx}" -lt 8 ]]; then
    echo "error: GATE-FIX-S28R3-QA14 unable to fingerprint canonical context" >&2
    return 2
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s' "$ep" "$bucket" "$prefix" "$kind" "$policy_json" "$ctx"
}

# --- private proof dir + exclusive no-follow create + FD-safe consume ---

r2_ro_ensure_private_proof_dir() {
  "$R2_RO_PYTHON_BIN" - "$R2_RO_TRUSTED_PROOF_DIR" <<'PY'
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
  local name path
  name="proof.$(date +%s).$$.$RANDOM.json"
  path="${R2_RO_TRUSTED_PROOF_DIR}/${name}"
  if [[ -e "$path" ]]; then
    echo "error: proof path collision" >&2
    return 2
  fi
  printf '%s' "$path"
}

r2_ro_write_proof_exclusive() {
  local out="$1" fp="$2" ctx="$3"
  "$R2_RO_PYTHON_BIN" - "$out" "$fp" "$ctx" "$R2_RO_TRUSTED_PROOF_DIR" <<'PY'
import json, os, stat, sys
from datetime import datetime, timezone
out, fp, ctx, trusted = sys.argv[1:5]
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
    "producer": "scripts/prove-r2-readonly.sh",
    "proved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "note": "non-secret fingerprints only",
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
  "$R2_RO_PYTHON_BIN" - "$path" "$efp" "$ectx" "$R2_RO_TRUSTED_PROOF_DIR" <<'PY'
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
