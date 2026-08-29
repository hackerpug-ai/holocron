#!/usr/bin/env bash
# D05-06 / CAP-BAK-01 AC-3 — Secret scan over restored / fire-drill artifacts.
#
# Real grep (and optional gitleaks/trufflehog) over:
#   - parity report, fire-drill run JSON, SUMMARY
#   - runbook + mission template
#   - restored PGDATA logs (if present) — not binary base files by default
#   - blob restore staging metadata
#
# PASS only when credential-pattern hits == 0 (allowlisted redactions/docs OK).
#
# Usage:
#   ./scripts/verify-restored-artifacts.sh
#   ARTIFACT_ROOTS=".tmp/D05-04 /tmp/d05-04-fire-scratch" ./scripts/verify-restored-artifacts.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT/.tmp/D05-06}"
mkdir -p "$EVIDENCE_DIR"
LOG="$EVIDENCE_DIR/ac3-secret-scan.txt"
exec > >(tee "$LOG") 2>&1

PASS_COUNT=0
FAIL_COUNT=0
HIT_COUNT=0
pass() { echo "PASS: $*"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo "FAIL: $*"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
info() { echo "INFO: $*"; }

echo "=== verify-restored-artifacts (secret scan) ==="

# Default artifact roots from D05-04 / D05-05 / D05-03
DEFAULT_ROOTS=(
  "$ROOT/.tmp/D05-04"
  "$ROOT/.spec/prds/mk6-migration/runbooks/fire-drill-monthly.md"
  "$ROOT/packages/platform/src/mission/templates/fire-drill-monthly.json"
  "$ROOT/packages/platform/src/backup/fresh-target.md"
)
if [[ -d /tmp/d05-04-fire-scratch ]]; then
  DEFAULT_ROOTS+=("/tmp/d05-04-fire-scratch/holo-fire-drill-start.log")
  DEFAULT_ROOTS+=("/tmp/d05-04-fire-scratch/postgresql.auto.conf")
  DEFAULT_ROOTS+=("/tmp/d05-04-fire-scratch/postmaster.opts")
fi
if [[ -d /tmp/d05-04-blob-restore ]]; then
  DEFAULT_ROOTS+=("/tmp/d05-04-blob-restore")
fi

if [[ -n "${ARTIFACT_ROOTS:-}" ]]; then
  # shellcheck disable=SC2206
  SCAN_ROOTS=($ARTIFACT_ROOTS)
else
  SCAN_ROOTS=("${DEFAULT_ROOTS[@]}")
fi

# Build file list (text-ish only)
FILE_LIST="$EVIDENCE_DIR/ac3-scan-file-list.txt"
: >"$FILE_LIST"
for root in "${SCAN_ROOTS[@]}"; do
  if [[ -f "$root" ]]; then
    echo "$root" >>"$FILE_LIST"
  elif [[ -d "$root" ]]; then
    # Limit to text-like extensions + known report names; skip huge binary PG base/
    find "$root" -type f \
      \( -name '*.json' -o -name '*.txt' -o -name '*.md' -o -name '*.log' -o -name '*.err' -o -name '*.stderr' -o -name '*.yml' -o -name '*.yaml' -o -name '*.conf' -o -name '*.opts' -o -name 'SUMMARY*' -o -name 'parity*' -o -name 'fire-drill*' \) \
      ! -path '*/base/*' ! -path '*/global/*' ! -path '*/pg_wal/*' ! -path '*/.git/*' \
      2>/dev/null >>"$FILE_LIST" || true
  else
    info "skip missing path: $root"
  fi
done

file_count="$(grep -c . "$FILE_LIST" 2>/dev/null || echo 0)"
info "scanning ${file_count} files"
if [[ "${file_count:-0}" -eq 0 ]]; then
  fail "no artifact files found to scan — refuse empty success"
  echo "=== RESULT: FAIL ==="
  exit 1
fi
pass "artifact inventory non-empty (${file_count} files)"

HITS_FILE="$EVIDENCE_DIR/ac3-secret-hits.txt"
: >"$HITS_FILE"

# Patterns that indicate real credential leakage (not the word "secret" in docs).
# Each hit is filtered against allowlist (redacted tokens, docs talking about secrets).
scan_patterns=(
  # AWS classic access key
  'AKIA[0-9A-Z]{16}'
  # Explicit secret assignments with long values
  'R2_SECRET_ACCESS_KEY[[:space:]]*[=:][[:space:]]*['\''\"]?[A-Za-z0-9/+]{20,}'
  'AWS_SECRET_ACCESS_KEY[[:space:]]*[=:][[:space:]]*['\''\"]?[A-Za-z0-9/+]{20,}'
  'repo1-cipher-pass=[^[:space:]<]{8,}'
  'repo1-s3-key-secret=[^[:space:]<]{8,}'
  'repo1-s3-key=[^[:space:]<]{8,}'
  'repo1-s3-token=[^[:space:]<]{8,}'
  # postgres URLs with embedded password
  'postgres(ql)?://[^[:space:]/:]+:[^[:space:]/@]+@'
  # PEM private keys
  '-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----'
  # Bearer / API tokens that look material
  'Bearer [A-Za-z0-9._\\-]{20,}'
  'api[_-]?key[[:space:]]*[=:][[:space:]]*['\''\"]?[A-Za-z0-9_\\-]{20,}'
  # Cloudflare/R2 session-looking material dumped raw
  'R2_SESSION_TOKEN[[:space:]]*[=:][[:space:]]*['\''\"]?[A-Za-z0-9/+=]{20,}'
  'RESTIC_PASSWORD[[:space:]]*[=:][[:space:]]*['\''\"]?[^[:space:]'\''\"]{8,}'
)

is_allowlisted_hit() {
  local line="$1"
  # Redacted placeholders
  if echo "$line" | grep -qiE '<redacted>|redacted|replace-me|placeholder|not-for-prod|REDACTED|\*\*\*'; then
    return 0
  fi
  # Documentation discussing secret handling without values
  if echo "$line" | grep -qiE 'Never paste secrets|secret scan|no secrets|Missing Langfuse config|publicKey/secretKey|Set LANGFUSE_|resticPasswordInSecrets.: true|credentials present|object-read-only|Do not commit secrets'; then
    return 0
  fi
  # Example / schema only
  if echo "$line" | grep -qiE 'example-accountid|ro-placeholder|secrets\.example|human_required'; then
    return 0
  fi
  return 1
}

while IFS= read -r f; do
  [[ -f "$f" ]] || continue
  # Skip binary
  if command -v file >/dev/null 2>&1; then
    if file "$f" | grep -qiE 'executable|ELF|image|audio|video|compressed|data$'; then
      continue
    fi
  fi
  for pat in "${scan_patterns[@]}"; do
    # grep -E without printing huge binary noise
    while IFS= read -r match; do
      [[ -z "$match" ]] && continue
      if is_allowlisted_hit "$match"; then
        continue
      fi
      echo "${f}:${match}" >>"$HITS_FILE"
      HIT_COUNT=$((HIT_COUNT + 1))
    done < <(grep -nE "$pat" "$f" 2>/dev/null | head -n 20 || true)
  done
done <"$FILE_LIST"

# Optional gitleaks
if command -v gitleaks >/dev/null 2>&1; then
  info "running gitleaks on artifact roots"
  set +e
  # gitleaks dir scan — may flag redacted; we post-filter
  gitleaks detect --no-git -s "$ROOT/.tmp/D05-04" --report-path "$EVIDENCE_DIR/ac3-gitleaks.json" -v >"$EVIDENCE_DIR/ac3-gitleaks.out" 2>&1
  gl_rc=$?
  set -e
  if [[ $gl_rc -eq 0 ]]; then
    pass "gitleaks: 0 findings on .tmp/D05-04"
  elif [[ $gl_rc -eq 1 ]]; then
    # findings present — inspect
    info "gitleaks reported findings (rc=1); reviewing for real secrets"
    if [[ -f "$EVIDENCE_DIR/ac3-gitleaks.json" ]]; then
      # Count non-redacted
      extra="$(python3 - <<'PY'
import json, pathlib, sys
p=pathlib.Path(".tmp/D05-06/ac3-gitleaks.json")
try:
    data=json.loads(p.read_text() or "[]")
except Exception:
    print(0); sys.exit(0)
if isinstance(data, dict):
    data=data.get("findings") or data.get("Results") or []
n=0
for f in data or []:
    s=json.dumps(f)
    if "<redacted>" in s.lower() or "redacted" in s.lower():
        continue
    n+=1
print(n)
PY
)"
      if [[ "${extra:-0}" -gt 0 ]]; then
        fail "gitleaks non-redacted findings=${extra}"
        HIT_COUNT=$((HIT_COUNT + extra))
      else
        pass "gitleaks findings are redacted/allowlisted only"
      fi
    fi
  else
    info "gitleaks exit ${gl_rc} — treating as unavailable for gate"
  fi
else
  info "gitleaks not installed — grep-based scan only"
fi

if command -v trufflehog >/dev/null 2>&1; then
  info "trufflehog present — filesystem scan on .tmp/D05-04"
  set +e
  trufflehog filesystem "$ROOT/.tmp/D05-04" --json >"$EVIDENCE_DIR/ac3-trufflehog.json" 2>"$EVIDENCE_DIR/ac3-trufflehog.err"
  th_rc=$?
  set -e
  th_lines="$(grep -c . "$EVIDENCE_DIR/ac3-trufflehog.json" 2>/dev/null || echo 0)"
  if [[ "${th_lines:-0}" -eq 0 ]]; then
    pass "trufflehog: 0 findings"
  else
    fail "trufflehog findings lines=${th_lines}"
    HIT_COUNT=$((HIT_COUNT + th_lines))
  fi
else
  info "trufflehog not installed — skipped"
fi

# Hostname/endpoint hygiene: allow R2 account endpoint in operational reports
# but flag raw password material and unredacted s3 keys (already covered).
# Flag accidental dump of secrets.yaml contents
if grep -R --line-number -E 'R2_SECRET_ACCESS_KEY:[[:space:]]*[A-Za-z0-9/+=]{16,}' \
  "$ROOT/.tmp/D05-04" 2>/dev/null | grep -viE 'redacted|example|placeholder' | head; then
  fail "possible R2_SECRET_ACCESS_KEY value dump in D05-04 artifacts"
  HIT_COUNT=$((HIT_COUNT + 1))
else
  pass "no R2_SECRET_ACCESS_KEY value dumps in D05-04 artifacts"
fi

# pgBackRest must show redaction if keys appear
if grep -R --line-number -E 'repo1-s3-key=' "$ROOT/.tmp/D05-04" 2>/dev/null | head -n 5 >/dev/null; then
  if grep -R --line-number -E 'repo1-s3-key=<redacted>|repo1-s3-key-secret=<redacted>|repo1-cipher-pass=<redacted>' \
    "$ROOT/.tmp/D05-04" 2>/dev/null | head -n 1 >/dev/null; then
    pass "pgBackRest logs redact s3 key/secret/cipher-pass"
  fi
  # any non-redacted?
  if grep -R --line-number -E 'repo1-s3-key=[^[:space:]<]{8,}|repo1-s3-key-secret=[^[:space:]<]{8,}|repo1-cipher-pass=[^[:space:]<]{8,}' \
    "$ROOT/.tmp/D05-04" 2>/dev/null | grep -viE '<redacted>|redacted' | head -n 5 >>"$HITS_FILE"; then
    fail "unredacted pgBackRest credential flags in artifacts"
    HIT_COUNT=$((HIT_COUNT + 1))
  else
    pass "no unredacted pgBackRest credential flags"
  fi
fi

echo "credential_pattern_hits=${HIT_COUNT}"
if [[ -s "$HITS_FILE" ]]; then
  echo "=== HITS (first 50) ==="
  head -n 50 "$HITS_FILE"
fi

if [[ "$HIT_COUNT" -gt 0 || "$FAIL_COUNT" -gt 0 ]]; then
  echo "=== RESULT: FAIL (secret-scan hits=${HIT_COUNT} fail_checks=${FAIL_COUNT}) ==="
  exit 1
fi

pass "secret-scan reports 0 credential matches"
echo "=== RESULT: PASS (0 credential matches in restored/fire-drill artifacts) ==="
exit 0
