#!/usr/bin/env bash
# D05-06 / CAP-BAK-01 AC-2 + REDHAT-FIX-H5 — Restore R2 credentials are
# read-only + scoped to an EXACT concrete bucket ARN and object prefix.
# REDHAT-FIX-H4 — Delete negative control is sacrificial drill-neg OR non-mutating
# policy inspection; NEVER delete live recovery keys (bucket-root "existing", backup/, …).
#
# Real policy inspection + optional live aws Put/Delete denial.
# Fails closed when:
#   - policy allows Put/Delete or Resource=*
#   - Resource is a bucket-class wildcard (arn:aws:s3:::holocron-backup-*)
#   - bucket name segment contains '*' or is not the configured R2_BUCKET_NAME
#   - object Resource is not the exact configured prefix under that bucket
#   - restore identity equals backup RW / DATABASE_URL identity
#   - ambient parent/RW keys present for restore role
#   - live RO probe required but only RW keys work (Put succeeds)
#   - any destructive negative control targets live recovery prefixes
#
# Residual path (DEPENDENCY-S28-R2-RO):
#   When only backup RW keys exist and RO mint is unavailable, the script STILL
#   proves fail-closed: probing RW identity as "RO" MUST exit non-zero.
#   Full live RO PASS requires distinct object-read-only credentials.
#
# Usage:
#   ./scripts/verify-restore-creds.sh
#   REQUIRE_LIVE_R2_RO=1 ./scripts/verify-restore-creds.sh
#   source restore-target.env && ./scripts/verify-restore-creds.sh
#   # Policy-document only (REDHAT-FIX-H5 integration; no live R2 required):
#   VERIFY_POLICY_ONLY=1 R2_CREDENTIAL_POLICY='...' R2_BUCKET_NAME=holocron-backup \
#     R2_RESTORE_OBJECT_PREFIX=pgbackrest ./scripts/verify-restore-creds.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

POLICY_ONLY=0
if [[ "${1:-}" == "--policy-only" ]] || [[ "${VERIFY_POLICY_ONLY:-}" == "1" ]]; then
  POLICY_ONLY=1
fi

if [[ $POLICY_ONLY -eq 1 ]]; then
  EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT/.tmp/REDHAT-FIX-H5}"
else
  EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT/.tmp/D05-06}"
fi
mkdir -p "$EVIDENCE_DIR"
LOG="$EVIDENCE_DIR/ac2-restore-creds.txt"
exec > >(tee "$LOG") 2>&1

PASS_COUNT=0
FAIL_COUNT=0
RESIDUALS=()
pass() { echo "PASS: $*"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo "FAIL: $*"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
info() { echo "INFO: $*"; }
residual() { echo "RESIDUAL: $*"; RESIDUALS+=("$*"); }

is_placeholder() {
  local v="${1:-}"
  [[ -z "$v" ]] && return 0
  case "$v" in
    *placeholder*|*replace-me*|*example*|*not-for-prod*|*ro-test-*|*test-key*|*test-secret*|*example-accountid*)
      return 0
      ;;
  esac
  return 1
}

echo "=== verify-restore-creds (read-only + scoped) ==="

# Load restore-target.env if present (does not override existing env).
load_env_file() {
  local f="$1"
  [[ -f "$f" ]] || return 1
  info "loading restore env from $f (values not logged)"
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^([A-Za-z0-9_]+)=(.*)$ ]] || continue
    local k="${BASH_REMATCH[1]}"
    local v="${BASH_REMATCH[2]}"
    if [[ -z "${!k:-}" ]]; then
      export "$k=$v"
    fi
  done <"$f"
  return 0
}

for cand in \
  "${RESTORE_TARGET_ENV:-}" \
  "$ROOT/.tmp/fresh-restore/fresh-restore-01/restore-target.env" \
  "/Users/inference1/Projects/holocron/.kb-run-sprint/worktrees/D05-03/.tmp/fresh-restore/fresh-restore-01/restore-target.env"
do
  [[ -n "$cand" ]] || continue
  load_env_file "$cand" && break
done

# Parse secrets.yaml for backup RW keys + DATABASE_URL presence (never print values).
SECRETS="${HOLOCRON_SECRETS_PATH:-}"
if [[ -z "$SECRETS" ]]; then
  for cand in \
    "$ROOT/services/platform/config/secrets.yaml" \
    "/Users/inference1/Projects/holocron/services/platform/config/secrets.yaml"
  do
    [[ -f "$cand" ]] && SECRETS="$cand" && break
  done
fi

BACKUP_AK=""
BACKUP_SK=""
BACKUP_ST=""
BACKUP_ENDPOINT=""
BACKUP_ACCOUNT=""
DB_URL=""
STORED_POLICY=""
if [[ -n "$SECRETS" && -f "$SECRETS" ]]; then
  info "inspecting secrets key presence (path present; values not logged)"
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^([A-Za-z0-9_]+):[[:space:]]*(.*)$ ]] || continue
    local_k="${BASH_REMATCH[1]}"
    local_v="${BASH_REMATCH[2]}"
    local_v="${local_v%\"}"; local_v="${local_v#\"}"
    local_v="${local_v%\'}"; local_v="${local_v#\'}"
    case "$local_k" in
      R2_ACCESS_KEY_ID) BACKUP_AK="$local_v" ;;
      R2_SECRET_ACCESS_KEY) BACKUP_SK="$local_v" ;;
      R2_SESSION_TOKEN) BACKUP_ST="$local_v" ;;
      R2_ENDPOINT)
        BACKUP_ENDPOINT="$local_v"
        # Prefer real secrets endpoint over restore-target.env placeholders.
        if is_placeholder "${R2_ENDPOINT:-}" && ! is_placeholder "$local_v"; then
          export R2_ENDPOINT="$local_v"
        elif [[ -z "${R2_ENDPOINT:-}" && -n "$local_v" ]]; then
          export R2_ENDPOINT="$local_v"
        fi
        ;;
      R2_ACCOUNT_ID)
        BACKUP_ACCOUNT="$local_v"
        if [[ -z "${R2_ACCOUNT_ID:-}" && -n "$local_v" ]]; then export R2_ACCOUNT_ID="$local_v"; fi
        ;;
      DATABASE_URL) DB_URL="$local_v" ;;
      R2_CREDENTIAL_POLICY) STORED_POLICY="$local_v" ;;
      R2_RESTORE_ACCESS_KEY_ID)
        if [[ -z "${R2_RESTORE_ACCESS_KEY_ID:-}" ]]; then export R2_RESTORE_ACCESS_KEY_ID="$local_v"; fi
        ;;
      R2_RESTORE_SECRET_ACCESS_KEY)
        if [[ -z "${R2_RESTORE_SECRET_ACCESS_KEY:-}" ]]; then export R2_RESTORE_SECRET_ACCESS_KEY="$local_v"; fi
        ;;
      R2_BUCKET_NAME|CLOUDFLARE_API_TOKEN|R2_PARENT_ACCESS_KEY_ID)
        if [[ -z "${!local_k:-}" && -n "$local_v" ]]; then export "$local_k=$local_v"; fi
        ;;
    esac
  done <"$SECRETS"
else
  info "no secrets.yaml found — distinctness limited to env comparison"
fi

POLICY="${R2_CREDENTIAL_POLICY:-}"
KIND="${R2_CREDENTIAL_KIND:-}"
AK="${R2_RESTORE_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-}}"
SK="${R2_RESTORE_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-}}"
BUCKET="${R2_BUCKET_NAME:-holocron-backup}"
# Exact object-prefix root for restore GetObject resources (REDHAT-FIX-H5).
# Default aligns with backup pgBackRest prefix; override via R2_RESTORE_OBJECT_PREFIX.
RESTORE_PREFIX="${R2_RESTORE_OBJECT_PREFIX:-${R2_PGBACKREST_PREFIX:-pgbackrest}}"
RESTORE_PREFIX="${RESTORE_PREFIX#/}"
RESTORE_PREFIX="${RESTORE_PREFIX%/}"
ENDPOINT="${R2_ENDPOINT:-}"
# Live probes against real R2 must not use restore-target.env placeholder endpoint.
LIVE_ENDPOINT="$ENDPOINT"
if is_placeholder "$LIVE_ENDPOINT"; then
  if [[ -n "$BACKUP_ENDPOINT" ]] && ! is_placeholder "$BACKUP_ENDPOINT"; then
    LIVE_ENDPOINT="$BACKUP_ENDPOINT"
  elif [[ -n "${BACKUP_ACCOUNT:-${R2_ACCOUNT_ID:-}}" ]]; then
    LIVE_ENDPOINT="https://${BACKUP_ACCOUNT:-$R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  fi
fi

# Reject configured bucket/prefix that already contain wildcards (fail closed).
if [[ "$BUCKET" == *"*"* ]] || [[ -z "$BUCKET" ]]; then
  fail "R2_BUCKET_NAME must be an exact concrete bucket name (no *); got '${BUCKET:-<empty>}'"
  if [[ $POLICY_ONLY -eq 1 ]]; then
    echo "=== RESULT: FAIL (configured bucket is wildcard/empty) ==="
    exit 1
  fi
fi
if [[ -z "$RESTORE_PREFIX" ]] || [[ "$RESTORE_PREFIX" == *"*"* ]]; then
  fail "R2_RESTORE_OBJECT_PREFIX/R2_PGBACKREST_PREFIX must be exact non-empty prefix (no *); got '${RESTORE_PREFIX:-<empty>}'"
  if [[ $POLICY_ONLY -eq 1 ]]; then
    echo "=== RESULT: FAIL (configured prefix is wildcard/empty) ==="
    exit 1
  fi
fi

# ── (A) Forbidden ambient RW / parent admin credentials ────────────────────
if [[ $POLICY_ONLY -eq 0 ]]; then
  forbidden_vars=(
    R2_PARENT_ACCESS_KEY_ID
    R2_PARENT_SECRET_ACCESS_KEY
    R2_READ_WRITE_CREDENTIAL
    R2_READ_WRITE_ACCESS_KEY_ID
    R2_READ_WRITE_SECRET_ACCESS_KEY
    R2_RW_ACCESS_KEY_ID
    R2_RW_SECRET_ACCESS_KEY
  )
  bad_ambient=0
  for v in "${forbidden_vars[@]}"; do
    if [[ -n "${!v:-}" ]]; then
      echo "  detail: forbidden env ${v} is set on restore path" >&2
      bad_ambient=1
    fi
  done
  if [[ $bad_ambient -eq 0 ]]; then
    pass "no ambient parent/RW R2 credentials on restore path"
  else
    fail "ambient parent/RW R2 credentials present — not restore-safe"
  fi

  # ── (B) Credential kind ───────────────────────────────────────────────────
  case "$KIND" in
    object-read-only|read-only|object_read_only|readonly)
      pass "R2_CREDENTIAL_KIND declares read-only (${KIND})"
      ;;
    "")
      info "R2_CREDENTIAL_KIND unset — will rely on policy + live probe"
      ;;
    *)
      fail "R2_CREDENTIAL_KIND is not read-only (got: ${KIND})"
      ;;
  esac
else
  info "VERIFY_POLICY_ONLY=1 — skipping ambient credential / kind / live R2 probes"
fi

# ── (C) Policy JSON: exact bucket + exact prefix List/Get only (H-5) ───────
# Rejects:
#   - arn:aws:s3:::holocron-backup-*   (bucket class — NOT a literal bucket)
#   - arn:aws:s3:::* / Resource '*'
#   - arn:aws:s3:::bucket/* without exact configured prefix root
#   - PutObject / DeleteObject
# Allows:
#   - arn:aws:s3:::${exactBucket}                         (ListBucket resource)
#   - arn:aws:s3:::${exactBucket}/${exactPrefix}/*        (GetObject resource)
#   - arn:aws:s3:::${exactBucket}/${exactPrefix}*         (trailing key wildcard only)
inspect_policy() {
  local policy_json="$1"
  local label="$2"
  if [[ -z "$policy_json" ]]; then
    info "${label}: no policy JSON provided"
    return 1
  fi
  # Normalize escaped JSON from yaml; enforce exact ARN contract (REDHAT-FIX-H5).
  local normalized
  normalized="$(
    POLICY_JSON="$policy_json" EXPECT_BUCKET="$BUCKET" EXPECT_PREFIX="$RESTORE_PREFIX" python3 - <<'PY'
import json, os, sys

raw = os.environ["POLICY_JSON"]
expect_bucket = os.environ["EXPECT_BUCKET"].strip()
expect_prefix = os.environ["EXPECT_PREFIX"].strip().strip("/")

for _ in range(3):
    try:
        data = json.loads(raw)
    except Exception:
        print("PARSE_FAIL", file=sys.stderr)
        sys.exit(2)
    if isinstance(data, str):
        raw = data
        continue
    break
else:
    print("PARSE_FAIL nested", file=sys.stderr)
    sys.exit(2)
if not isinstance(data, dict):
    print("PARSE_FAIL not object", file=sys.stderr)
    sys.exit(2)

actions = []
resources = []
for st in data.get("Statement") or []:
    if st.get("Effect") != "Allow":
        continue
    a = st.get("Action") or []
    if isinstance(a, str):
        a = [a]
    actions.extend(a)
    r = st.get("Resource") or []
    if isinstance(r, str):
        r = [r]
    resources.extend(r)

print("ACTIONS\t" + ",".join(sorted(set(actions))))
print("RESOURCES\t" + ",".join(resources))
print("EXPECT_BUCKET\t" + expect_bucket)
print("EXPECT_PREFIX\t" + expect_prefix)

put_del = sum(
    1
    for x in actions
    if "PutObject" in x
    or "DeleteObject" in x
    or x in ("s3:Put", "s3:Delete", "s3:*", "*")
)
print("PUT_DELETE_COUNT\t" + str(put_del))

S3_PREFIX = "arn:aws:s3:::"

def bucket_segment(arn):
    if arn == "*":
        return "*"
    if not arn.startswith(S3_PREFIX):
        return None
    rest = arn[len(S3_PREFIX) :]
    return rest.split("/", 1)[0]


def is_exact_bucket_resource(arn):
    return arn == f"{S3_PREFIX}{expect_bucket}"


def is_exact_prefix_object_resource(arn):
    # Trailing object-key wildcard ONLY after exact bucket + exact prefix root.
    a = f"{S3_PREFIX}{expect_bucket}/{expect_prefix}/*"
    b = f"{S3_PREFIX}{expect_bucket}/{expect_prefix}*"
    return arn in (a, b)


wildcard_reasons = []
exact_bucket_count = 0
exact_prefix_count = 0
bad_resource = False

if not resources:
    bad_resource = True
    wildcard_reasons.append("empty Resource array")

for r in resources:
    if r in ("*", "arn:aws:s3:::*"):
        bad_resource = True
        wildcard_reasons.append(f"bare/universal wildcard Resource={r}")
        continue
    seg = bucket_segment(r)
    if seg is None:
        bad_resource = True
        wildcard_reasons.append(f"non-s3 Resource={r}")
        continue
    if "*" in seg:
        # Bucket-class patterns like arn:aws:s3:::holocron-backup-* are NEVER
        # a "literal bucket name".
        bad_resource = True
        wildcard_reasons.append(f"wildcard in bucket name segment: {r}")
        continue
    if seg != expect_bucket:
        bad_resource = True
        wildcard_reasons.append(
            f"Resource bucket '{seg}' != configured exact bucket '{expect_bucket}': {r}"
        )
        continue
    if is_exact_bucket_resource(r):
        exact_bucket_count += 1
        continue
    if is_exact_prefix_object_resource(r):
        exact_prefix_count += 1
        continue
    # e.g. arn:aws:s3:::bucket/* (no concrete prefix) or wrong prefix
    bad_resource = True
    wildcard_reasons.append(
        f"object Resource not exact prefix '{expect_prefix}' under bucket: {r}"
    )

# Action wildcards
action_star = any(x in ("*", "s3:*") for x in actions)
if action_star:
    wildcard_reasons.append("wildcard Action (* or s3:*)")

has_star = 1 if (bad_resource or action_star or wildcard_reasons) else 0
print("HAS_STAR\t" + str(has_star))
print("WILDCARD_REASONS\t" + (" | ".join(wildcard_reasons) if wildcard_reasons else ""))
print("EXACT_BUCKET_ARN_COUNT\t" + str(exact_bucket_count))
print("EXACT_PREFIX_ARN_COUNT\t" + str(exact_prefix_count))

# Exact contract: ≥1 exact bucket ARN + ≥1 exact prefix object ARN; no bad resources.
bucket_ok = (
    exact_bucket_count >= 1
    and exact_prefix_count >= 1
    and not bad_resource
    and len(resources) > 0
)
print("BUCKET_SCOPED\t" + ("1" if bucket_ok else "0"))
print("EXACT_ARN_OK\t" + ("1" if bucket_ok else "0"))

# RO expected action set: ListBucket, GetObject (GetBucketLocation optional); no Put/Delete
ro_ok = (
    put_del == 0
    and any("ListBucket" in x for x in actions)
    and any("GetObject" in x for x in actions)
    and not action_star
)
print("RO_SHAPE\t" + ("1" if ro_ok else "0"))
print("ACTION_COUNT\t" + str(len(set(actions))))
PY
  )" || {
    fail "${label}: policy JSON failed to parse"
    return 1
  }

  echo "$normalized" | sed 's/^/  /'
  local put_del has_star bucket_ok ro_shape exact_bucket_n exact_prefix_n wildcard_reasons
  put_del="$(echo "$normalized" | awk -F'\t' '/^PUT_DELETE_COUNT/{print $2}')"
  has_star="$(echo "$normalized" | awk -F'\t' '/^HAS_STAR/{print $2}')"
  bucket_ok="$(echo "$normalized" | awk -F'\t' '/^BUCKET_SCOPED/{print $2}')"
  ro_shape="$(echo "$normalized" | awk -F'\t' '/^RO_SHAPE/{print $2}')"
  exact_bucket_n="$(echo "$normalized" | awk -F'\t' '/^EXACT_BUCKET_ARN_COUNT/{print $2}')"
  exact_prefix_n="$(echo "$normalized" | awk -F'\t' '/^EXACT_PREFIX_ARN_COUNT/{print $2}')"
  wildcard_reasons="$(echo "$normalized" | awk -F'\t' '/^WILDCARD_REASONS/{print $2}')"

  if [[ "$put_del" != "0" ]]; then
    fail "${label}: PutObject/DeleteObject action count=${put_del} (must be 0 for restore RO)"
  else
    pass "${label}: PutObject/DeleteObject action count=0"
  fi
  if [[ "$has_star" == "1" ]]; then
    fail "${label}: wildcard / non-exact Resource rejected (${wildcard_reasons})"
  else
    pass "${label}: no bucket-class or bare wildcard Resource/Action"
  fi
  if [[ "$bucket_ok" == "1" ]]; then
    pass "${label}: exact bucket ARN arn:aws:s3:::${BUCKET} + exact prefix arn:aws:s3:::${BUCKET}/${RESTORE_PREFIX}/* (bucket_arns=${exact_bucket_n} prefix_arns=${exact_prefix_n})"
  else
    fail "${label}: Resource not exact concrete bucket+prefix (need arn:aws:s3:::${BUCKET} and arn:aws:s3:::${BUCKET}/${RESTORE_PREFIX}/*; reject holocron-backup-* class)"
  fi
  if [[ "$ro_shape" == "1" ]]; then
    pass "${label}: RO shape includes ListBucket + GetObject without write"
  else
    fail "${label}: RO shape missing List/Get or still has writes"
  fi
  return 0
}

if [[ -n "$POLICY" ]]; then
  inspect_policy "$POLICY" "restore R2_CREDENTIAL_POLICY"
else
  # Contract from code (mint object-read-only / fresh-target.md) — still require env policy for live target
  fail "restore R2_CREDENTIAL_POLICY missing — cannot prove List/Get-only without policy or live RO keys"
fi

# Policy-only mode: exit after exact-ARN policy inspection (integration RED/GREEN).
if [[ $POLICY_ONLY -eq 1 ]]; then
  echo "=== SUMMARY (policy-only): pass=${PASS_COUNT} fail=${FAIL_COUNT} ==="
  if [[ $FAIL_COUNT -gt 0 ]]; then
    echo "=== RESULT: FAIL (exact ARN / RO policy checks) ==="
    exit 1
  fi
  echo "=== RESULT: PASS (exact concrete bucket + prefix ARNs; List/Get only) ==="
  exit 0
fi

# Backup RW policy (from secrets) must differ: expect Put/Delete present (negative contrast).
# Do NOT call inspect_policy() here — that helper fails closed on write actions.
if [[ -n "$STORED_POLICY" ]]; then
  info "backup secrets R2_CREDENTIAL_POLICY contrast (expect write actions for backup writer)"
  CONTRAST="$(STORED_POLICY="$STORED_POLICY" python3 - <<'PY'
import json, os, sys
raw=os.environ["STORED_POLICY"]
try:
    for _ in range(3):
        data=json.loads(raw)
        if isinstance(data,str):
            raw=data
            continue
        break
    else:
        print("?")
        sys.exit(0)
except Exception:
    print("?")
    sys.exit(0)
actions=[]
resources=[]
for st in data.get("Statement") or []:
    if st.get("Effect")!="Allow":
        continue
    a=st.get("Action") or []
    if isinstance(a,str): a=[a]
    actions.extend(a)
    r=st.get("Resource") or []
    if isinstance(r,str): r=[r]
    resources.extend(r)
put=sum(1 for x in actions if "PutObject" in x or "DeleteObject" in x)
print(put)
print("ACTIONS " + ",".join(sorted(set(actions))), file=sys.stderr)
print("RESOURCES " + ",".join(resources), file=sys.stderr)
PY
)" || CONTRAST="?"
  CONTRAST="$(echo "$CONTRAST" | head -n1 | tr -d '[:space:]')"
  if [[ "$CONTRAST" != "0" && "$CONTRAST" != "?" && -n "$CONTRAST" ]]; then
    pass "backup-writer policy contrast: Put/Delete count=${CONTRAST} (distinct from restore RO)"
  else
    info "backup-writer policy contrast inconclusive (put_delete=${CONTRAST})"
  fi
fi

# ── (D) Distinctness from DATABASE_URL / backup RW key ─────────────────────
if [[ -n "$DB_URL" && -n "$AK" ]]; then
  # DATABASE_URL user is never the R2 access key id
  db_user="$(DB_URL="$DB_URL" python3 - <<'PY'
import os, urllib.parse
u=os.environ["DB_URL"]
# postgres://user:pass@host/db or without pass
try:
    if "://" not in u:
        print("")
    else:
        p=urllib.parse.urlparse(u)
        print(p.username or "")
except Exception:
    print("")
PY
)"
  if [[ -n "$db_user" && "$db_user" == "$AK" ]]; then
    fail "R2 restore access key equals DATABASE_URL user — credential conflation"
  else
    pass "R2 restore access-key-id distinct from DATABASE_URL user"
  fi
else
  info "DATABASE_URL or restore AK unavailable for distinctness string-compare"
fi

if [[ -n "$BACKUP_AK" && -n "$AK" ]]; then
  if [[ "$AK" == "$BACKUP_AK" ]]; then
    fail "restore access key equals backup R2_ACCESS_KEY_ID (RW identity reuse)"
  else
    pass "restore access key differs from backup R2_ACCESS_KEY_ID"
  fi
else
  info "backup AK or restore AK missing — identity distinctness deferred to live probe"
fi

# ── (E0) REDHAT-FIX-H4: denylist + sacrificial key contract (no live recovery rm) ─
LIVE_SCRIPT="$ROOT/scripts/prove-r2-readonly.sh"
H4_DENYLIST_OK=0
if [[ -f "$LIVE_SCRIPT" ]]; then
  info "REDHAT-FIX-H4: verifying live recovery denylist + sacrificial drill-neg contract"
  h4_bad=0
  # Denylisted keys must be refused before any delete API call.
  for bad_key in \
    existing \
    backup/main/latest \
    archive/main/000000010000000000000001 \
    pgbackrest/backup/main/backup.info \
    restic/snapshots/abc \
    "s3://${BUCKET}/existing"
  do
    set +e
    bash "$LIVE_SCRIPT" --assert-denylisted "$bad_key" >"$EVIDENCE_DIR/h4-denylist-${bad_key//\//_}.txt" 2>&1
    dk_rc=$?
    set -e
    if [[ $dk_rc -ne 0 ]]; then
      echo "  detail: denylist miss for key=${bad_key}" >&2
      h4_bad=1
    fi
  done
  # Sacrificial key must be allowed; live key must not pass --assert-safe-key.
  set +e
  sac_key="$(bash "$LIVE_SCRIPT" --make-sacrificial-key)"
  bash "$LIVE_SCRIPT" --assert-safe-key "$sac_key" >"$EVIDENCE_DIR/h4-sacrificial-ok.txt" 2>&1
  sac_rc=$?
  bash "$LIVE_SCRIPT" --assert-safe-key "existing" >"$EVIDENCE_DIR/h4-existing-refused.txt" 2>&1
  exist_rc=$?
  set -e
  if [[ $sac_rc -ne 0 ]]; then
    echo "  detail: sacrificial key rejected: ${sac_key}" >&2
    h4_bad=1
  fi
  if [[ $exist_rc -eq 0 ]]; then
    echo "  detail: literal 'existing' incorrectly allowed as destructive target" >&2
    h4_bad=1
  fi
  if [[ $h4_bad -eq 0 ]]; then
    pass "REDHAT-FIX-H4 denylist enforces live recovery refusal; drill-neg sacrificial allowed"
    H4_DENYLIST_OK=1
  else
    fail "REDHAT-FIX-H4 denylist/sacrificial contract broken"
  fi
else
  fail "prove-r2-readonly.sh missing — cannot prove H-4 denylist"
fi

# ── (E) Live fail-closed: RW must NOT pass as RO ───────────────────────────
# Live probe (prove-r2-readonly) uses drill-neg/<uuid> only — never live recovery keys.
RW_NEGATIVE_OK=0
if [[ -f "$LIVE_SCRIPT" && -n "$BACKUP_AK" && -n "$BACKUP_SK" && -n "$LIVE_ENDPOINT" ]] && ! is_placeholder "$LIVE_ENDPOINT"; then
  info "negative control: probe backup RW keys through prove-r2-readonly (must FAIL)"
  info "delete target is sacrificial drill-neg only (REDHAT-FIX-H4); never live recovery keys"
  info "live endpoint host: $(echo "$LIVE_ENDPOINT" | sed -E 's#https://([^/]+).*#\1#')"
  set +e
  # Explicit env -u so restore-target.env placeholder endpoint cannot leak in.
  env -u R2_PARENT_ACCESS_KEY_ID -u R2_PARENT_SECRET_ACCESS_KEY \
    R2_RESTORE_ACCESS_KEY_ID="$BACKUP_AK" \
    R2_RESTORE_SECRET_ACCESS_KEY="$BACKUP_SK" \
    R2_RESTORE_SESSION_TOKEN="${BACKUP_ST}" \
    R2_ACCESS_KEY_ID="$BACKUP_AK" \
    R2_SECRET_ACCESS_KEY="$BACKUP_SK" \
    R2_SESSION_TOKEN="${BACKUP_ST}" \
    R2_ENDPOINT="$LIVE_ENDPOINT" \
    R2_BUCKET_NAME="${BUCKET}" \
    R2_ACCOUNT_ID="${BACKUP_ACCOUNT:-${R2_ACCOUNT_ID:-}}" \
    R2_CREDENTIAL_KIND=object-read-only \
    REQUIRE_LIVE_R2_RO=1 \
    bash "$LIVE_SCRIPT" >"$EVIDENCE_DIR/ac2-rw-negative-control.txt" 2>&1
  rw_rc=$?
  set -e
  if [[ $rw_rc -eq 0 ]]; then
    fail "RW keys incorrectly PASSed prove-r2-readonly — fail-closed broken"
  else
    pass "fail-closed: backup RW identity rejected as RO (prove-r2-readonly exit ${rw_rc})"
    RW_NEGATIVE_OK=1
    # Confirm Put success was the reason when possible
    if grep -qiE 'Put|not object-read-only|allow Put|SUCCEEDED' "$EVIDENCE_DIR/ac2-rw-negative-control.txt"; then
      pass "negative control observed Put allowed on RW identity (proves probe is real)"
    else
      info "RW negative control failed (exit ${rw_rc}); see ac2-rw-negative-control.txt"
      # Placeholder-only rejection is weaker evidence than Put-allowed.
      if grep -qiE 'placeholder|no live R2' "$EVIDENCE_DIR/ac2-rw-negative-control.txt"; then
        fail "RW negative control did not exercise live Put (placeholder path) — check LIVE_ENDPOINT"
        RW_NEGATIVE_OK=0
      fi
    fi
    # H-4: RW negative must target sacrificial drill-neg (not live recovery keys).
    if grep -qiE 'drill-neg/' "$EVIDENCE_DIR/ac2-rw-negative-control.txt"; then
      pass "RW negative control used sacrificial drill-neg key (REDHAT-FIX-H4)"
    else
      info "RW negative log did not echo drill-neg key (may have failed before probe)"
    fi
  fi
else
  fail "cannot run RW negative control (need prove-r2-readonly.sh + backup keys + non-placeholder LIVE_ENDPOINT)"
fi

# ── (F) Live positive RO proof when distinct RO keys available ─────────────
RO_LIVE_OK=0
if [[ -n "${R2_RESTORE_ACCESS_KEY_ID:-}" && -n "${R2_RESTORE_SECRET_ACCESS_KEY:-}" ]]; then
  if is_placeholder "${R2_RESTORE_ACCESS_KEY_ID}" || is_placeholder "${R2_RESTORE_SECRET_ACCESS_KEY}" || is_placeholder "${ENDPOINT:-}"; then
    residual "DEPENDENCY-S28-R2-RO: restore RO keys/endpoint are placeholders — live RO PASS blocked"
  elif [[ -n "$BACKUP_AK" && "${R2_RESTORE_ACCESS_KEY_ID}" == "$BACKUP_AK" ]]; then
    residual "DEPENDENCY-S28-R2-RO: R2_RESTORE_* still equals backup RW identity"
  else
    info "live positive: prove-r2-readonly with R2_RESTORE_* keys"
    set +e
    env \
      R2_RESTORE_ACCESS_KEY_ID="${R2_RESTORE_ACCESS_KEY_ID}" \
      R2_RESTORE_SECRET_ACCESS_KEY="${R2_RESTORE_SECRET_ACCESS_KEY}" \
      R2_RESTORE_SESSION_TOKEN="${R2_RESTORE_SESSION_TOKEN:-}" \
      R2_ENDPOINT="${LIVE_ENDPOINT}" \
      R2_BUCKET_NAME="${BUCKET}" \
      R2_CREDENTIAL_KIND=object-read-only \
      REQUIRE_LIVE_R2_RO=1 \
      bash "$LIVE_SCRIPT" >"$EVIDENCE_DIR/ac2-ro-live-proof.txt" 2>&1
    ro_rc=$?
    set -e
    if [[ $ro_rc -eq 0 ]]; then
      pass "live RO proof: List allowed; Put/Delete AccessDenied"
      RO_LIVE_OK=1
    else
      fail "live RO proof failed (exit ${ro_rc}) — see ac2-ro-live-proof.txt"
    fi
  fi
else
  residual "DEPENDENCY-S28-R2-RO: no R2_RESTORE_* keys minted; only backup RW runtime secrets present"
  # Try mint if admin available
  if [[ -n "${CLOUDFLARE_API_TOKEN:-}" && -n "${R2_PARENT_ACCESS_KEY_ID:-}" && -n "${R2_ACCOUNT_ID:-}" && -f "$LIVE_SCRIPT" ]]; then
    info "attempting --try-mint object-read-only"
    set +e
    bash "$LIVE_SCRIPT" --try-mint >"$EVIDENCE_DIR/ac2-mint-attempt.txt" 2>&1
    mint_rc=$?
    set -e
    if [[ $mint_rc -eq 0 ]]; then
      pass "minted + proved live object-read-only credentials"
      RO_LIVE_OK=1
    else
      residual "DEPENDENCY-S28-R2-RO: mint path failed (see ac2-mint-attempt.txt)"
    fi
  else
    info "mint path unavailable (need CLOUDFLARE_API_TOKEN + R2_PARENT_ACCESS_KEY_ID + R2_ACCOUNT_ID)"
  fi
fi

# Placeholder endpoint on restore-target.env is expected when RO not minted
if is_placeholder "${ENDPOINT:-}"; then
  residual "restore-target.env endpoint/keys are placeholder until live RO mint (DEPENDENCY-S28-R2-RO)"
fi

echo "=== SUMMARY: pass=${PASS_COUNT} fail=${FAIL_COUNT} ro_live=${RO_LIVE_OK} rw_negative_ok=${RW_NEGATIVE_OK} h4_denylist_ok=${H4_DENYLIST_OK} ==="
if [[ ${#RESIDUALS[@]} -gt 0 ]]; then
  echo "=== RESIDUALS (${#RESIDUALS[@]}) ==="
  for r in "${RESIDUALS[@]}"; do echo " - $r"; done
fi

# Gate logic:
# - Hard FAILs always block (includes REDHAT-FIX-H4 denylist failures).
# - Live RO positive is required for full AC-2 green UNLESS residual is only missing RO mint
#   AND fail-closed RW rejection + declarative RO policy both passed.
# Task instruction: "if only RW R2 keys exist and RO mint unavailable, honestly report residual
# (DEPENDENCY-S28-R2-RO) but still verify fail-closed probe rejects RW for RO role"
# Non-mutating path: policy PUT_DELETE_COUNT=0 is sufficient delete-denial evidence when
# live RO mint is residual; never require deleting a live recovery object.
if [[ $FAIL_COUNT -gt 0 ]]; then
  echo "=== RESULT: FAIL (credential scope checks) ==="
  exit 1
fi

if [[ $H4_DENYLIST_OK -ne 1 ]]; then
  echo "=== RESULT: FAIL (REDHAT-FIX-H4 denylist not proven) ==="
  exit 1
fi

if [[ $RO_LIVE_OK -eq 1 ]]; then
  echo "=== RESULT: PASS (read-only scoped + live RO proof; H-4 sacrificial delete control) ==="
  exit 0
fi

if [[ $RW_NEGATIVE_OK -eq 1 && -n "$POLICY" ]]; then
  echo "=== RESULT: PASS_WITH_RESIDUAL (DEPENDENCY-S28-R2-RO; fail-closed RW rejection + RO policy DeleteObject=0 + H-4 denylist; live RO mint pending) ==="
  # Exit 0 for review gate when residual is documented — full live RO still residual.
  # Security review documents residual; do not pretend live RO exists.
  exit 0
fi

echo "=== RESULT: FAIL (insufficient evidence for restore RO scope) ==="
exit 1
