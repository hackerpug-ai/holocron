#!/usr/bin/env bash
# GATE-FIX-S28R3-QA13 — production live R2 provider boundary helpers.
# Sourced by prove-r2-readonly / provision-fresh-restore-target / run-fire-drill-on-fresh-target.
# Never logs credential or object content values.
# Production has NO runtime provider override (no HOLO_TRUSTED_*, no fixture paths).
#
# shellcheck shell=bash

: "${ROOT:?ROOT must be set before sourcing r2-ro-live.sh}"

R2_RO_TRUSTED_PROOF_DIR="${ROOT}/.tmp/r2-ro-proofs"
R2_RO_SUPPORTED_POLICY_KIND="object-read-only"
R2_RO_REQUIRED_BUCKET="holocron-backup"
R2_RO_REQUIRED_PREFIX="pgbackrest"

# Absolute production allowlists only (never PATH, never fixtures, never env overrides).
R2_RO_AWS_ALLOWLIST=(/opt/homebrew/bin/aws /usr/local/bin/aws /usr/bin/aws)
R2_RO_CURL_ALLOWLIST=(/usr/bin/curl /opt/homebrew/bin/curl /usr/local/bin/curl)

# --- trusted provider binary (production allowlist only) ---

r2_ro_verify_provider_bin() {
  # args: absolute path; optional second arg "aws"|"curl" for allowlist family
  local candidate="$1"
  local family="${2:-aws}"
  local allow_csv=""
  local a
  if [[ "$family" == "curl" ]]; then
    for a in "${R2_RO_CURL_ALLOWLIST[@]}"; do allow_csv+="${a},"; done
  else
    for a in "${R2_RO_AWS_ALLOWLIST[@]}"; do allow_csv+="${a},"; done
  fi
  python3 - "$candidate" "$family" "$allow_csv" <<'PY'
import os, stat, sys
cand, family, allow_csv = sys.argv[1], sys.argv[2], sys.argv[3]
if not cand or not cand.startswith("/"):
    print("error: provider binary path must be absolute", file=sys.stderr)
    sys.exit(2)
# Refuse any test/fixture path in production verification.
low = cand.lower()
if "/fixtures/" in low or "/.tmp/" in low or "mock" in os.path.basename(cand).lower():
    print("error: GATE-FIX-S28R3-QA13 refuses fixture/tmp/mock provider paths in production", file=sys.stderr)
    sys.exit(2)
sys_allow = tuple(x for x in allow_csv.split(",") if x)
try:
    st = os.lstat(cand)
except OSError as e:
    print(f"error: provider binary missing: {e}", file=sys.stderr)
    sys.exit(2)
path = cand
if stat.S_ISLNK(st.st_mode):
    try:
        path = os.path.realpath(cand)
        st = os.lstat(path)
    except OSError as e:
        print(f"error: provider symlink unresolvable: {e}", file=sys.stderr)
        sys.exit(2)
if not stat.S_ISREG(st.st_mode):
    print("error: provider binary is not a regular file", file=sys.stderr)
    sys.exit(2)
mode = stat.S_IMODE(st.st_mode)
if mode & (stat.S_IWGRP | stat.S_IWOTH):
    print(f"error: provider binary is group/world-writable (mode {oct(mode)})", file=sys.stderr)
    sys.exit(2)
uid = os.geteuid()
if st.st_uid not in (0, uid):
    print("error: provider binary ownership not trusted (not root/self)", file=sys.stderr)
    sys.exit(2)
real = os.path.realpath(path)
allow_real = set()
for a in sys_allow:
    try:
        allow_real.add(os.path.realpath(a))
    except OSError:
        pass
if cand not in sys_allow and real not in allow_real:
    print("error: GATE-FIX-S28R3-QA13 provider binary not on production allowlist", file=sys.stderr)
    sys.exit(2)
# Fixture path ban on realpath too
if "/fixtures/" in real or "/.tmp/" in real:
    print("error: GATE-FIX-S28R3-QA13 refuses fixture/tmp resolved provider path", file=sys.stderr)
    sys.exit(2)
print(real)
sys.exit(0)
PY
}

r2_ro_resolve_trusted_aws_bin() {
  # GATE-FIX-S28R3-QA13: refuse ALL caller overrides in production.
  if [[ -n "${HOLO_TRUSTED_AWS_BIN:-}" ]]; then
    echo "error: GATE-FIX-S28R3-QA13 refuses HOLO_TRUSTED_AWS_BIN in production (no provider override)" >&2
    return 2
  fi
  local cand resolved
  for cand in "${R2_RO_AWS_ALLOWLIST[@]}"; do
    if [[ -e "$cand" ]] && resolved="$(r2_ro_verify_provider_bin "$cand" aws 2>/dev/null)"; then
      printf '%s' "$resolved"
      return 0
    fi
  done
  echo "error: GATE-FIX-S28R3-QA13 no trusted aws on production allowlist (PATH ignored)" >&2
  return 2
}

r2_ro_resolve_trusted_curl_bin() {
  if [[ -n "${HOLO_TRUSTED_CURL_BIN:-}" ]]; then
    echo "error: GATE-FIX-S28R3-QA13 refuses HOLO_TRUSTED_CURL_BIN in production (no provider override)" >&2
    return 2
  fi
  local cand resolved
  for cand in "${R2_RO_CURL_ALLOWLIST[@]}"; do
    if [[ -e "$cand" ]] && resolved="$(r2_ro_verify_provider_bin "$cand" curl 2>/dev/null)"; then
      printf '%s' "$resolved"
      return 0
    fi
  done
  echo "error: GATE-FIX-S28R3-QA13 no trusted curl on production allowlist (PATH ignored)" >&2
  return 2
}

# --- canonical restore context (account-bound endpoint + fixed prefix) ---

r2_ro_canonical_account_id() {
  local a="${1:-}"
  a="$(printf '%s' "$a" | tr '[:upper:]' '[:lower:]')"
  # Cloudflare account ids are 32 hex chars
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
  b="$(printf '%s' "$b" | tr '[:upper:]' '[:lower:]')"
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
  python3 - "$bucket" "$prefix" <<'PY'
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
  # GATE-FIX-S28R3-QA13: endpoint ONLY from R2_ACCOUNT_ID; bucket/prefix fixed.
  local account_id ep bucket prefix policy_json ctx kind supplied_ep
  kind="${R2_CREDENTIAL_KIND:-$R2_RO_SUPPORTED_POLICY_KIND}"
  if [[ "$kind" != "$R2_RO_SUPPORTED_POLICY_KIND" ]]; then
    echo "error: GATE-FIX-S28R3-QA13 unsupported R2_CREDENTIAL_KIND (only object-read-only)" >&2
    return 2
  fi
  if ! account_id="$(r2_ro_canonical_account_id "${R2_ACCOUNT_ID:-}")"; then
    echo "error: GATE-FIX-S28R3-QA13 R2_ACCOUNT_ID must be 32-hex Cloudflare account id" >&2
    return 2
  fi
  ep="$(r2_ro_derive_endpoint "$account_id")"
  supplied_ep="${R2_ENDPOINT:-}"
  if [[ -n "$supplied_ep" ]]; then
    supplied_ep="${supplied_ep%%/}"
    supplied_ep="$(printf '%s' "$supplied_ep" | tr '[:upper:]' '[:lower:]')"
    if [[ "$supplied_ep" != "$ep" ]]; then
      echo "error: GATE-FIX-S28R3-QA13 R2_ENDPOINT must equal https://\${R2_ACCOUNT_ID}.r2.cloudflarestorage.com (no alternate host/path/port)" >&2
      return 2
    fi
  fi
  if ! bucket="$(r2_ro_canonical_bucket "${R2_BUCKET_NAME:-$R2_RO_REQUIRED_BUCKET}")"; then
    echo "error: GATE-FIX-S28R3-QA13 bucket must be exactly holocron-backup" >&2
    return 2
  fi
  # Prefix: only pgbackrest (default when unset); explicit empty or other value refused.
  local raw_prefix
  if [[ -n "${R2_RESTORE_OBJECT_PREFIX+x}" ]]; then
    raw_prefix="${R2_RESTORE_OBJECT_PREFIX}"
  elif [[ -n "${R2_PGBACKREST_PREFIX+x}" ]]; then
    raw_prefix="${R2_PGBACKREST_PREFIX}"
  else
    raw_prefix="$R2_RO_REQUIRED_PREFIX"
  fi
  if ! prefix="$(r2_ro_canonical_prefix "$raw_prefix")"; then
    echo "error: GATE-FIX-S28R3-QA13 restore prefix must be exactly pgbackrest/ (gate-plan policy)" >&2
    return 2
  fi
  policy_json="$(r2_ro_build_canonical_policy_json "$bucket" "$prefix")"
  if [[ -z "$policy_json" ]]; then
    echo "error: GATE-FIX-S28R3-QA13 unable to build canonical policy" >&2
    return 2
  fi
  if [[ -n "${R2_CREDENTIAL_POLICY:-}" ]]; then
    local caller_norm
    caller_norm="$(python3 -c 'import json,sys; print(json.dumps(json.loads(sys.argv[1]), separators=(",",":"), sort_keys=True), end="")' \
      "$R2_CREDENTIAL_POLICY" 2>/dev/null || true)"
    if [[ -z "$caller_norm" || "$caller_norm" != "$policy_json" ]]; then
      echo "error: GATE-FIX-S28R3-QA13 R2_CREDENTIAL_POLICY noncanonical vs required pgbackrest object-read-only policy" >&2
      return 2
    fi
  fi
  ctx="$(r2_ro_context_fp16 "$ep" "$bucket" "$prefix" "$kind" "$policy_json")"
  if [[ -z "$ctx" || "${#ctx}" -lt 8 ]]; then
    echo "error: GATE-FIX-S28R3-QA13 unable to fingerprint canonical context" >&2
    return 2
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s' "$ep" "$bucket" "$prefix" "$kind" "$policy_json" "$ctx"
}

# --- private proof dir + exclusive no-follow create + FD-safe consume ---

r2_ro_ensure_private_proof_dir() {
  python3 - "$R2_RO_TRUSTED_PROOF_DIR" <<'PY'
import os, stat, sys
path = sys.argv[1]
os.makedirs(path, mode=0o700, exist_ok=True)
st = os.lstat(path)
if stat.S_ISLNK(st.st_mode) or not stat.S_ISDIR(st.st_mode):
    print("error: proof dir is not a real directory", file=sys.stderr)
    sys.exit(2)
os.chmod(path, 0o700)
st = os.lstat(path)
if stat.S_IMODE(st.st_mode) != 0o700:
    print(f"error: proof dir mode {oct(stat.S_IMODE(st.st_mode))} != 0o700", file=sys.stderr)
    sys.exit(2)
if st.st_uid not in (0, os.geteuid()):
    print("error: proof dir ownership not trusted", file=sys.stderr)
    sys.exit(2)
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
  python3 - "$out" "$fp" "$ctx" "$R2_RO_TRUSTED_PROOF_DIR" <<'PY'
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
    "out_of_prefix_denied": True,
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
  # GATE-FIX-S28R3-QA13: open via directory FD + O_NOFOLLOW; fstat FD; parse same FD.
  local path="$1" efp="$2" ectx="$3"
  python3 - "$path" "$efp" "$ectx" "$R2_RO_TRUSTED_PROOF_DIR" <<'PY'
import json, os, stat, sys
from datetime import datetime, timezone
path, efp, ectx, trusted = sys.argv[1:5]
trusted = os.path.realpath(trusted)
parent = os.path.dirname(path)
name = os.path.basename(path)
if ".." in path.split(os.sep) or not name or name in (".", ".."):
    print("error: invalid proof path", file=sys.stderr); sys.exit(2)
# Open parent directory without following.
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
        # macOS older python without dir_fd open — fall back to openat via pathlib after re-check
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
        fd = -1  # fdopen owns it
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
    "out_of_prefix_denied",
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

r2_ro_apply_qa_proof_mutate() {
  local path="$1" kind="${HOLO_QA_PROOF_MUTATE:-}"
  [[ -n "$kind" ]] || return 0
  python3 - "$path" "$kind" <<'PY'
import json, os, sys
path, kind = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = json.load(f)
if kind == "stale":
    data["proved_at"] = "2020-01-01T00:00:00Z"
elif kind == "future":
    data["proved_at"] = "2099-01-01T00:00:00Z"
elif kind == "wrong-tuple":
    data["tuple_fp16"] = "deadbeefdeadbeef"
elif kind == "wrong-context":
    data["context_fp16"] = "cafecafecafecafe"
elif kind == "malformed":
    data["ok"] = False
elif kind == "wrong-producer":
    data["producer"] = "evil.sh"
else:
    print(f"error: unknown HOLO_QA_PROOF_MUTATE={kind}", file=sys.stderr)
    sys.exit(2)
fd = os.open(path, os.O_WRONLY | os.O_TRUNC)
with os.fdopen(fd, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
os.chmod(path, 0o600)
print(f"HOLO_QA_PROOF_MUTATE applied: {kind}", file=sys.stderr)
PY
}
