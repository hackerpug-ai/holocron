#!/usr/bin/env bash
# GATE-FIX-S28R3-QA12 — shared live R2 provider boundary helpers.
# Sourced by prove-r2-readonly / provision-fresh-restore-target / run-fire-drill-on-fresh-target.
# Never logs credential or object content values.
#
# shellcheck shell=bash

# Require ROOT to be set by the caller (repo root absolute path).
: "${ROOT:?ROOT must be set before sourcing r2-ro-live.sh}"

R2_RO_TRUSTED_PROOF_DIR="${ROOT}/.tmp/r2-ro-proofs"
R2_RO_SUPPORTED_POLICY_KIND="object-read-only"

# --- trusted provider binary (independent of caller PATH) ---

r2_ro_verify_provider_bin() {
  # args: absolute_or_relative_path
  # exit 0 → prints realpath on stdout; else non-zero + message on stderr
  local candidate="$1"
  python3 - "$candidate" "$ROOT" <<'PY'
import os, stat, sys
cand, root = sys.argv[1], sys.argv[2]
if not cand or not cand.startswith("/"):
    print("error: provider binary path must be absolute", file=sys.stderr)
    sys.exit(2)
try:
    st = os.lstat(cand)
except OSError as e:
    print(f"error: provider binary missing: {e}", file=sys.stderr)
    sys.exit(2)
# Resolve one level of symlink only when target is a regular file under a trusted root.
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
# Ownership: root or current user only.
uid = os.geteuid()
if st.st_uid not in (0, uid):
    print("error: provider binary ownership not trusted (not root/self)", file=sys.stderr)
    sys.exit(2)
# HOLO_TRUSTED_AWS_BIN / fixture path must stay under repo test fixtures.
# System allowlist paths are accepted without fixture constraint.
sys_allow = (
    "/opt/homebrew/bin/aws",
    "/usr/local/bin/aws",
    "/usr/bin/aws",
)
fixtures_root = os.path.realpath(os.path.join(root, "services/platform/tests/integration/fixtures"))
real = os.path.realpath(path)
# Also accept realpath of allowlisted entry points (homebrew cellars).
allow_real = set()
for a in sys_allow:
    try:
        allow_real.add(os.path.realpath(a))
    except OSError:
        pass
if real not in allow_real and not real.startswith(fixtures_root + os.sep):
    # Accept if cand itself was an allowlisted path (before resolve to cellar).
    if os.path.realpath(cand) not in allow_real and cand not in sys_allow:
        # Last chance: if realpath of any allowlist equals real
        if real not in allow_real:
            print(
                "error: provider binary not on system allowlist and not under test fixtures",
                file=sys.stderr,
            )
            sys.exit(2)
print(real)
sys.exit(0)
PY
}

r2_ro_resolve_trusted_aws_bin() {
  # Prefer explicit HOLO_TRUSTED_AWS_BIN only when it verifies (fixtures or allowlist).
  local cand resolved
  if [[ -n "${HOLO_TRUSTED_AWS_BIN:-}" ]]; then
    if resolved="$(r2_ro_verify_provider_bin "$HOLO_TRUSTED_AWS_BIN")"; then
      printf '%s' "$resolved"
      return 0
    fi
    echo "error: GATE-FIX-S28R3-QA12 HOLO_TRUSTED_AWS_BIN rejected (untrusted provider)" >&2
    return 2
  fi
  # Never use caller PATH. Only absolute allowlist candidates.
  for cand in /opt/homebrew/bin/aws /usr/local/bin/aws /usr/bin/aws; do
    if [[ -e "$cand" ]] && resolved="$(r2_ro_verify_provider_bin "$cand" 2>/dev/null)"; then
      printf '%s' "$resolved"
      return 0
    fi
  done
  echo "error: GATE-FIX-S28R3-QA12 no trusted aws binary on absolute allowlist (PATH ignored)" >&2
  return 2
}

# --- canonical restore context ---

r2_ro_canonical_endpoint() {
  local ep="${1:-}"
  ep="${ep%%/}"
  # lowercase host portion via tr for stability
  printf '%s' "$ep" | tr '[:upper:]' '[:lower:]'
}

r2_ro_canonical_bucket() {
  local b="${1:-}"
  b="$(printf '%s' "$b" | tr '[:upper:]' '[:lower:]')"
  if [[ -z "$b" || ! "$b" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
    return 1
  fi
  printf '%s' "$b"
}

r2_ro_canonical_prefix() {
  local p="${1:-}"
  p="${p#/}"
  p="${p%/}"
  if [[ -z "$p" || "$p" == *"*"* || "$p" == *".."* || "$p" == *"//"* ]]; then
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
# compact separators for stable digest
print(json.dumps(doc, separators=(",", ":"), sort_keys=True), end="")
PY
}

r2_ro_context_fp16() {
  # args: endpoint bucket prefix policy_kind policy_json
  printf '%s\0%s\0%s\0%s\0%s' "${1:-}" "${2:-}" "${3:-}" "${4:-}" "${5:-}" \
    | openssl dgst -sha256 2>/dev/null | awk '{print $NF}' | cut -c1-16
}

r2_ro_tuple_fp16() {
  printf '%s\0%s\0%s' "${1:-}" "${2:-}" "${3:-}" \
    | openssl dgst -sha256 2>/dev/null | awk '{print $NF}' | cut -c1-16
}

r2_ro_establish_canonical_context() {
  # stdin/args via env: R2_ENDPOINT, R2_BUCKET_NAME, R2_RESTORE_OBJECT_PREFIX|R2_PGBACKREST_PREFIX
  # prints: endpoint\tbucket\tprefix\tpolicy_kind\tpolicy_json\tcontext_fp16
  # rejects empty/noncanonical
  local raw_ep raw_bucket raw_prefix ep bucket prefix policy_json ctx kind
  raw_ep="${R2_ENDPOINT:-}"
  raw_bucket="${R2_BUCKET_NAME:-holocron-backup}"
  # Unset → default pgbackrest. Explicit empty string → refuse (noncanonical).
  if [[ -n "${R2_RESTORE_OBJECT_PREFIX+x}" ]]; then
    raw_prefix="${R2_RESTORE_OBJECT_PREFIX}"
  elif [[ -n "${R2_PGBACKREST_PREFIX+x}" ]]; then
    raw_prefix="${R2_PGBACKREST_PREFIX}"
  else
    raw_prefix="pgbackrest"
  fi
  kind="${R2_CREDENTIAL_KIND:-$R2_RO_SUPPORTED_POLICY_KIND}"
  if [[ "$kind" != "$R2_RO_SUPPORTED_POLICY_KIND" ]]; then
    echo "error: GATE-FIX-S28R3-QA12 unsupported R2_CREDENTIAL_KIND (only object-read-only)" >&2
    return 2
  fi
  # Reject caller-supplied alternate policy strings that disagree with canonical rebuild.
  if [[ -n "${R2_CREDENTIAL_POLICY:-}" ]]; then
    :
  fi
  ep="$(r2_ro_canonical_endpoint "$raw_ep")"
  if [[ -z "$ep" || "$ep" != https://* ]]; then
    echo "error: GATE-FIX-S28R3-QA12 noncanonical/empty endpoint" >&2
    return 2
  fi
  if [[ "$ep" == *example-accountid* || "$ep" == *placeholder* ]]; then
    echo "error: GATE-FIX-S28R3-QA12 placeholder endpoint refused" >&2
    return 2
  fi
  if ! bucket="$(r2_ro_canonical_bucket "$raw_bucket")"; then
    echo "error: GATE-FIX-S28R3-QA12 noncanonical/empty bucket" >&2
    return 2
  fi
  if ! prefix="$(r2_ro_canonical_prefix "$raw_prefix")"; then
    echo "error: GATE-FIX-S28R3-QA12 noncanonical/empty restore prefix" >&2
    return 2
  fi
  policy_json="$(r2_ro_build_canonical_policy_json "$bucket" "$prefix")"
  if [[ -z "$policy_json" ]]; then
    echo "error: GATE-FIX-S28R3-QA12 unable to build canonical policy" >&2
    return 2
  fi
  # If caller supplied a policy, it must match canonical exactly (no alternate/broader).
  if [[ -n "${R2_CREDENTIAL_POLICY:-}" ]]; then
    local caller_norm
    caller_norm="$(python3 -c 'import json,sys; print(json.dumps(json.loads(sys.argv[1]), separators=(",",":"), sort_keys=True), end="")' \
      "$R2_CREDENTIAL_POLICY" 2>/dev/null || true)"
    if [[ -z "$caller_norm" || "$caller_norm" != "$policy_json" ]]; then
      echo "error: GATE-FIX-S28R3-QA12 R2_CREDENTIAL_POLICY is empty/alternate/noncanonical vs required object-read-only policy" >&2
      return 2
    fi
  fi
  ctx="$(r2_ro_context_fp16 "$ep" "$bucket" "$prefix" "$kind" "$policy_json")"
  if [[ -z "$ctx" || "${#ctx}" -lt 8 ]]; then
    echo "error: GATE-FIX-S28R3-QA12 unable to fingerprint canonical context" >&2
    return 2
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s' "$ep" "$bucket" "$prefix" "$kind" "$policy_json" "$ctx"
}

# --- private proof dir + exclusive no-follow file ---

r2_ro_ensure_private_proof_dir() {
  python3 - "$R2_RO_TRUSTED_PROOF_DIR" <<'PY'
import os, stat, sys
path = sys.argv[1]
os.makedirs(path, mode=0o700, exist_ok=True)
st = os.lstat(path)
if stat.S_ISLNK(st.st_mode):
    print("error: proof dir is a symlink", file=sys.stderr)
    sys.exit(2)
if not stat.S_ISDIR(st.st_mode):
    print("error: proof path is not a directory", file=sys.stderr)
    sys.exit(2)
mode = stat.S_IMODE(st.st_mode)
# tighten to 0700
os.chmod(path, 0o700)
st = os.lstat(path)
mode = stat.S_IMODE(st.st_mode)
if mode != 0o700:
    print(f"error: proof dir mode {oct(mode)} != 0o700", file=sys.stderr)
    sys.exit(2)
uid = os.geteuid()
if st.st_uid not in (0, uid):
    print("error: proof dir ownership not trusted", file=sys.stderr)
    sys.exit(2)
print(path)
PY
}

r2_ro_new_proof_path() {
  # prints a nonexistent path under trusted dir (does not create the file)
  r2_ro_ensure_private_proof_dir >/dev/null
  local name
  name="proof.$(date +%s).$$.$RANDOM.json"
  local path="${R2_RO_TRUSTED_PROOF_DIR}/${name}"
  if [[ -e "$path" ]]; then
    echo "error: proof path collision" >&2
    return 2
  fi
  printf '%s' "$path"
}

r2_ro_write_proof_exclusive() {
  # args: out_path tuple_fp16 context_fp16 [extra flags via env]
  # Requires path under trusted dir, must not exist; O_CREAT|O_EXCL|O_NOFOLLOW|0600
  local out="$1" fp="$2" ctx="$3"
  python3 - "$out" "$fp" "$ctx" "$R2_RO_TRUSTED_PROOF_DIR" <<'PY'
import json, os, stat, sys
from datetime import datetime, timezone
out, fp, ctx, trusted = sys.argv[1:5]
trusted = os.path.realpath(trusted)
# Reject path tricks before open.
if ".." in out.split(os.sep):
    print("error: proof path contains ..", file=sys.stderr)
    sys.exit(2)
# Parent must be the trusted dir (by realpath of parent, after lstat).
parent = os.path.dirname(out)
try:
    pst = os.lstat(parent)
except OSError as e:
    print(f"error: proof parent missing: {e}", file=sys.stderr)
    sys.exit(2)
if stat.S_ISLNK(pst.st_mode) or not stat.S_ISDIR(pst.st_mode):
    print("error: proof parent is not a real directory", file=sys.stderr)
    sys.exit(2)
if os.path.realpath(parent) != trusted:
    print("error: proof parent is not trusted proof directory", file=sys.stderr)
    sys.exit(2)
if stat.S_IMODE(pst.st_mode) != 0o700:
    print("error: proof parent mode not 0700", file=sys.stderr)
    sys.exit(2)
# File must not exist (no follow).
try:
    os.lstat(out)
except FileNotFoundError:
    pass
else:
    print("error: proof path already exists (refuse truncate/follow)", file=sys.stderr)
    sys.exit(2)
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
    "put_denied": True,
    "delete_denied": True,
    "policy_kind": "object-read-only",
    "producer": "scripts/prove-r2-readonly.sh",
    "proved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "note": "non-secret fingerprints only",
}
with os.fdopen(fd, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
# Verify lstat after write
st = os.lstat(out)
if stat.S_ISLNK(st.st_mode) or stat.S_IMODE(st.st_mode) != 0o600:
    print("error: proof file post-write identity invalid", file=sys.stderr)
    sys.exit(2)
print(f"wrote RO proof attestation: {out} tuple_fp16={fp} context_fp16={ctx}")
PY
}

r2_ro_validate_proof() {
  # args: path expected_tuple_fp expected_context_fp
  local path="$1" efp="$2" ectx="$3"
  python3 - "$path" "$efp" "$ectx" "$R2_RO_TRUSTED_PROOF_DIR" <<'PY'
import json, os, stat, sys
from datetime import datetime, timezone
path, efp, ectx, trusted = sys.argv[1:5]
trusted = os.path.realpath(trusted)
st = os.lstat(path)
if stat.S_ISLNK(st.st_mode):
    print("error: RO proof is a symlink (refuse follow)", file=sys.stderr)
    sys.exit(2)
if not stat.S_ISREG(st.st_mode):
    print("error: RO proof is not a regular file", file=sys.stderr)
    sys.exit(2)
if stat.S_IMODE(st.st_mode) != 0o600:
    print(f"error: RO proof mode {oct(stat.S_IMODE(st.st_mode))} != 0o600", file=sys.stderr)
    sys.exit(2)
parent = os.path.dirname(path)
pst = os.lstat(parent)
if stat.S_ISLNK(pst.st_mode) or os.path.realpath(parent) != trusted:
    print("error: RO proof parent not trusted private dir", file=sys.stderr)
    sys.exit(2)
# Open without following (already confirmed not symlink).
with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)
if data.get("schema") != "holo.r2-ro-proof.v1" or data.get("ok") is not True:
    print("error: RO proof attestation missing schema/ok", file=sys.stderr)
    sys.exit(2)
if data.get("tuple_fp16") != efp:
    print("error: RO proof tuple_fp16 mismatch", file=sys.stderr)
    sys.exit(2)
if data.get("context_fp16") != ectx:
    print("error: RO proof context_fp16 mismatch", file=sys.stderr)
    sys.exit(2)
if data.get("producer") != "scripts/prove-r2-readonly.sh":
    print("error: RO proof producer is not fixed scripts/prove-r2-readonly.sh", file=sys.stderr)
    sys.exit(2)
if data.get("policy_kind") != "object-read-only":
    print("error: RO proof policy_kind not object-read-only", file=sys.stderr)
    sys.exit(2)
for k in ("list_allowed", "prefix_list_allowed", "prefix_head_allowed", "put_denied", "delete_denied"):
    if data.get(k) is not True:
        print(f"error: RO proof {k} not true", file=sys.stderr)
        sys.exit(2)
proved = data.get("proved_at") or ""
try:
    dt = datetime.strptime(proved, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    age = (datetime.now(timezone.utc) - dt).total_seconds()
    if age < 0 or age > 7200:
        print("error: RO proof attestation stale or future-dated", file=sys.stderr)
        sys.exit(2)
except Exception:
    print("error: RO proof attestation missing/invalid proved_at", file=sys.stderr)
    sys.exit(2)
print(f"RO proof fresh-bound ok tuple_fp16={efp} context_fp16={ectx}")
sys.exit(0)
PY
}

r2_ro_apply_qa_proof_mutate() {
  # Test-only seam: HOLO_QA_PROOF_MUTATE=stale|future|wrong-tuple|malformed|wrong-producer|wrong-context
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
# rewrite in place (test only) — keep mode 0600
fd = os.open(path, os.O_WRONLY | os.O_TRUNC)
with os.fdopen(fd, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
os.chmod(path, 0o600)
print(f"HOLO_QA_PROOF_MUTATE applied: {kind}", file=sys.stderr)
PY
}
