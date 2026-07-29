#!/usr/bin/env bash
# GATE-FIX-S28R3-QA14 — isolated script tree for unit tests only.
# Production sources remain free of runtime test/provider/CLI seams.
# Usage: make-r2-ro-test-harness.sh <harness_dir> [absolute_fixture_curl]
set -euo pipefail
HARNESS="${1:?harness dir}"
FIXTURE_CURL="${2:-}"
ROOT_SRC="$(cd "$(dirname "$0")/../.." && pwd)"
MOCK_PROVIDER="$ROOT_SRC/services/platform/tests/integration/fixtures/qa14-r2-s3-provider-mock.py"
rm -rf "$HARNESS"
mkdir -p "$HARNESS/scripts/lib" "$HARNESS/services/platform/src/cli"
cp "$ROOT_SRC/scripts/prove-r2-readonly.sh" "$HARNESS/scripts/"
cp "$ROOT_SRC/scripts/provision-fresh-restore-target.sh" "$HARNESS/scripts/"
cp "$ROOT_SRC/scripts/run-fire-drill-on-fresh-target.sh" "$HARNESS/scripts/"
cp "$ROOT_SRC/scripts/verify-restore-creds.sh" "$HARNESS/scripts/" 2>/dev/null || true
cp "$ROOT_SRC/scripts/assert-fire-drill-report.sh" "$HARNESS/scripts/" 2>/dev/null || true
cp "$ROOT_SRC/scripts/lib/r2-ro-live.sh" "$HARNESS/scripts/lib/"
cp "$ROOT_SRC/scripts/lib/r2-scope-probes.json" "$HARNESS/scripts/lib/"
# Install mock provider as the repository provider path inside harness.
cp "$MOCK_PROVIDER" "$HARNESS/scripts/lib/r2_s3_provider.py"
chmod +x "$HARNESS/scripts/lib/r2_s3_provider.py"

# Patch harness fire-drill: remove production refuse seams; re-enable fake volumes + HOLO_CLI + mutate.
/usr/bin/python3 - "$HARNESS/scripts/run-fire-drill-on-fresh-target.sh" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
# Remove production refuses for harness-only knobs
for block in [
'''# GATE-FIX-S28R3-QA14: production refuses test/CLI seams.
if [[ -n "${HOLO_FIRE_DRILL_FAKE_VOLUMES:-}" ]]; then
  echo "error: GATE-FIX-S28R3-QA14 refuses HOLO_FIRE_DRILL_FAKE_VOLUMES in production (harness-only)" >&2
  exit 2
fi
if [[ -n "${HOLO_QA_PROOF_MUTATE:-}" ]]; then
  echo "error: GATE-FIX-S28R3-QA14 refuses HOLO_QA_PROOF_MUTATE in production" >&2
  exit 2
fi
''',
'''if [[ -n "${HOLO_FIRE_DRILL_FAKE_VOLUMES:-}" ]]; then
  echo "error: GATE-FIX-S28R3-QA14 refuses HOLO_FIRE_DRILL_FAKE_VOLUMES in production (harness-only)" >&2
  exit 2
fi
''',
'''if [[ -n "${HOLO_QA_PROOF_MUTATE:-}" ]]; then
  echo "error: GATE-FIX-S28R3-QA14 refuses HOLO_QA_PROOF_MUTATE in production" >&2
  exit 2
fi
''',
'''if [[ -n "${BUN_BIN:-}" ]]; then
  echo "error: GATE-FIX-S28R3-QA17 refuses ambient BUN_BIN (fixed absolute runtime only)" >&2
  exit 2
fi
''',
]:
    t = t.replace(block, '')
# Restore HOLO_CLI override + allow ambient BUN_BIN for harness recorder path
import re
t = re.sub(
    r'# GATE-FIX-S28R3-QA17: refuse ambient BUN_BIN; fixed absolute candidates only\.\n'
    r'if \[\[ -n "\$\{BUN_BIN:-\}" \]\]; then\n'
    r'  echo "error: GATE-FIX-S28R3-QA17 refuses ambient BUN_BIN \(fixed absolute runtime only\)" >&2\n'
    r'  exit 2\n'
    r'fi\n'
    r'BUN_BIN=""\n'
    r'for _cand in /opt/homebrew/bin/bun /usr/local/bin/bun; do\n'
    r'  if \[\[ -x "\$_cand" \]\]; then BUN_BIN="\$_cand"; break; fi\n'
    r'done\n'
    r'if \[\[ -z "\$BUN_BIN" \]\]; then\n'
    r'  echo "error: GATE-FIX-S28R3-QA17 fixed bun not found \(/opt/homebrew/bin/bun or /usr/local/bin/bun\)" >&2\n'
    r'  exit 2\n'
    r'fi\n'
    r'HOLO_CLI="\$ROOT/services/platform/src/cli/holo\.ts"\n',
    'BUN_BIN="${BUN_BIN:-bun}"\nHOLO_CLI="${HOLO_CLI:-$ROOT/services/platform/src/cli/holo.ts}"  # harness allows override\n',
    t,
    count=1,
)
# Re-enable fake volumes implementation (removed from production sources).
t = t.replace(
'''# GATE-FIX-S28R3-QA17: fake-volume implementation removed from production (harness-only).
if [[ -n "${HOLO_FIRE_DRILL_FAKE_VOLUMES:-}" ]]; then
  err "GATE-FIX-S28R3-QA17 refuses HOLO_FIRE_DRILL_FAKE_VOLUMES in production (harness-only)"
  exit 2
fi
SKIP_DOCKER_VOLUME_RESOLVE=0
''',
'''# Harness-only fake volumes (re-injected after production strip).
if [[ "${HOLO_FIRE_DRILL_FAKE_VOLUMES:-0}" == "1" ]]; then
  FAKE_ROOT="${HOLO_FIRE_DRILL_FAKE_ROOT:-${TMPDIR:-/tmp}/holo-fire-drill-fake-$$}"
  mkdir -p "$FAKE_ROOT/scratch" "$FAKE_ROOT/blob"
  SCRATCH_MP="$FAKE_ROOT/scratch"
  BLOB_MP="$FAKE_ROOT/blob"
  DAEMON_SCRATCH_MP=""
  DAEMON_BLOB_MP=""
  EXECUTION_MODE="fake-volumes-unit-test"
  CONTAINER_STATE="absent"
  log "HOLO_FIRE_DRILL_FAKE_VOLUMES=1: using fake host paths (no docker)"
  if [[ "$RESOLVE_ONLY" -eq 1 ]]; then
    echo "{\\"ok\\":true,\\"execution_mode\\":\\"fake-volumes-unit-test\\",\\"scratch\\":\\"$SCRATCH_MP\\",\\"blobDir\\":\\"$BLOB_MP\\"}"
    exit 0
  fi
  if [[ -z "$TARGET_TIMESTAMP" ]]; then
    err "--target-timestamp required unless --resolve-only"
    exit 2
  fi
  REPORT_PATH="${REPORT:-$ROOT/.tmp/REDHAT-FIX-S28R2/C1/parity-report-${HOST_NAME}.json}"
  mkdir -p "$(dirname "$REPORT_PATH")"
  SKIP_DOCKER_VOLUME_RESOLVE=1
else
  SKIP_DOCKER_VOLUME_RESOLVE=0
fi
''',
)
# Also strip QA17 mid-file refuse if present
t = t.replace(
'''if [[ -n "${HOLO_FIRE_DRILL_FAKE_VOLUMES:-}" ]]; then
  err "GATE-FIX-S28R3-QA17 refuses HOLO_FIRE_DRILL_FAKE_VOLUMES in production (harness-only)"
  exit 2
fi
SKIP_DOCKER_VOLUME_RESOLVE=0
''',
'',
)
# Insert mutation seam after prove success / before validate in assert_bound
needle = '  if ! r2_ro_validate_proof "$proof" "$expected_fp" "$expected_ctx"; then'
insert = '''  if [[ -n "${HOLO_QA_PROOF_MUTATE:-}" ]]; then
    # Harness-only mutation seam (not present in production sources).
    /usr/bin/python3 - "$proof" "$HOLO_QA_PROOF_MUTATE" <<'MPY'
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
elif kind == "proof-canary":
    data["note"] = os.environ.get("HOLO_PROOF_CANARY", "CANARY_IN_PROOF_JSON"); data["ok"] = False
else:
    raise SystemExit(f"unknown mutate {kind}")
fd = os.open(path, os.O_WRONLY | os.O_TRUNC)
with os.fdopen(fd, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\\n")
os.chmod(path, 0o600)
print(f"HOLO_QA_PROOF_MUTATE applied: {kind}", file=sys.stderr)
MPY
  fi
''' + needle
if needle not in t:
    raise SystemExit('validate proof needle missing in fire-drill harness')
t = t.replace(needle, insert, 1)
# Force ambient BUN for harness
import re as _re
t = _re.sub(
    r"# GATE-FIX-S28R3-QA17: refuse ambient BUN_BIN.*?HOLO_CLI=\"\$ROOT/services/platform/src/cli/holo\.ts\"\n",
    'BUN_BIN="${BUN_BIN:-bun}"\nHOLO_CLI="${HOLO_CLI:-$ROOT/services/platform/src/cli/holo.ts}"  # harness allows override\n',
    t,
    count=1,
    flags=_re.S,
)
# also strip deferred comment block if candidates remain without refuse
if 'BUN_BIN=""' in t and 'BUN_BIN="${BUN_BIN:-bun}"' not in t:
    t = t.replace('BUN_BIN=""\nfor _cand in /opt/homebrew/bin/bun /usr/local/bin/bun; do\n  if [[ -x "$_cand" ]]; then BUN_BIN="$_cand"; break; fi\ndone\n# Bun resolved above; hard-fail only when invoking TypeScript CLI (below).\nHOLO_CLI="$ROOT/services/platform/src/cli/holo.ts"\n',
                  'BUN_BIN="${BUN_BIN:-bun}"\nHOLO_CLI="${HOLO_CLI:-$ROOT/services/platform/src/cli/holo.ts}"  # harness allows override\n')
p.write_text(t)
print('fire-drill harness patched', file=__import__('sys').stderr)
PY

# Patch provision harness: remove refuse HOLO_QA; add mutate seam
/usr/bin/python3 - "$HARNESS/scripts/provision-fresh-restore-target.sh" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
t = t.replace(
'''  if [[ -n "${HOLO_QA_PROOF_MUTATE:-}" ]]; then
    echo "error: GATE-FIX-S28R3-QA14 refuses HOLO_QA_PROOF_MUTATE in production" >&2
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi
''',
  '',
)
needle = '  if ! r2_ro_validate_proof "$proof" "$expected_fp" "$expected_ctx"; then'
insert = '''  if [[ -n "${HOLO_QA_PROOF_MUTATE:-}" ]]; then
    /usr/bin/python3 - "$proof" "$HOLO_QA_PROOF_MUTATE" <<'MPY'
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
elif kind == "proof-canary":
    data["note"] = os.environ.get("HOLO_PROOF_CANARY", "CANARY_IN_PROOF_JSON"); data["ok"] = False
else:
    raise SystemExit(f"unknown mutate {kind}")
fd = os.open(path, os.O_WRONLY | os.O_TRUNC)
with os.fdopen(fd, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\\n")
os.chmod(path, 0o600)
print(f"HOLO_QA_PROOF_MUTATE applied: {kind}", file=sys.stderr)
MPY
  fi
''' + needle
if needle not in t:
    raise SystemExit('validate proof needle missing in provision harness')
t = t.replace(needle, insert, 1)
p.write_text(t)
print('provision harness patched', file=__import__('sys').stderr)
PY

# Patch prove harness: forward mock env into provider env -i
/usr/bin/python3 - "$HARNESS/scripts/lib/r2-ro-live.sh" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
# Allow HOLO_QA in harness init (remove refuse of HOLO_QA_PROOF_MUTATE only from init; keep refuse HOLO_TRUSTED)
t = t.replace(
    'if [[ -n "${HOLO_TRUSTED_AWS_BIN:-}" || -n "${HOLO_TRUSTED_CURL_BIN:-}" || -n "${HOLO_QA_PROOF_MUTATE:-}" ]]; then\n'
    '    echo "error: GATE-FIX-S28R3-QA14 refuses production provider/test overrides (HOLO_TRUSTED_* / HOLO_QA_PROOF_MUTATE)" >&2\n'
    '    return 2\n'
    '  fi\n',
    'if [[ -n "${HOLO_TRUSTED_AWS_BIN:-}" || -n "${HOLO_TRUSTED_CURL_BIN:-}" ]]; then\n'
    '    echo "error: GATE-FIX-S28R3-QA14 refuses HOLO_TRUSTED_* overrides" >&2\n'
    '    return 2\n'
    '  fi\n',
)
# Forward mock env vars into r2_ro_run_provider
old = '''  "$R2_RO_ENV_BIN" -i \\
    "PATH=/usr/bin:/bin" \\
    "HOME=${HOME:-/tmp}" \\
    "LC_ALL=C" \\
    "AWS_ACCESS_KEY_ID=${ak}" \\
    "AWS_SECRET_ACCESS_KEY=${sk}" \\
    "AWS_SESSION_TOKEN=${st}" \\
    "AWS_DEFAULT_REGION=auto" \\
    "$R2_RO_PYTHON_BIN" "$R2_RO_PROVIDER_PY" "$@"
'''
new = '''  local mock_args=()
  if [[ -n "${HOLO_R2_PROVIDER_MOCK_MODE:-}" ]]; then
    mock_args+=("HOLO_R2_PROVIDER_MOCK_MODE=${HOLO_R2_PROVIDER_MOCK_MODE}")
  fi
  if [[ -n "${HOLO_R2_PROVIDER_MOCK_CANARY:-}" ]]; then
    mock_args+=("HOLO_R2_PROVIDER_MOCK_CANARY=${HOLO_R2_PROVIDER_MOCK_CANARY}")
  fi
  if [[ -n "${HOLO_R2_PROVIDER_MOCK_RAN_MARKER:-}" ]]; then
    mock_args+=("HOLO_R2_PROVIDER_MOCK_RAN_MARKER=${HOLO_R2_PROVIDER_MOCK_RAN_MARKER}")
  fi
  "$R2_RO_ENV_BIN" -i \\
    "PATH=/usr/bin:/bin" \\
    "HOME=${HOME:-/tmp}" \\
    "LC_ALL=C" \\
    "AWS_ACCESS_KEY_ID=${ak}" \\
    "AWS_SECRET_ACCESS_KEY=${sk}" \\
    "AWS_SESSION_TOKEN=${st}" \\
    "AWS_DEFAULT_REGION=auto" \\
    ${mock_args[@]+"${mock_args[@]}"} \\
    "$R2_RO_PYTHON_BIN" "$R2_RO_PROVIDER_PY" "$@"
'''
if old not in t:
    raise SystemExit('r2_ro_run_provider env block missing')
t = t.replace(old, new, 1)
# Forward curl mock for mint path - patch prove separately
p.write_text(t)
print('lib harness patched', file=__import__('sys').stderr)
PY

# Forward curl mock vars in harness prove mint
/usr/bin/python3 - "$HARNESS/scripts/prove-r2-readonly.sh" <<'PY'
from pathlib import Path
import sys, re
p = Path(sys.argv[1])
t = p.read_text()
# inject HOLO_CURL mock forward into mint env -i curl invocation
t = t.replace(
'''  http_code="$(
    "$R2_RO_ENV_BIN" -i \\
      PATH=/usr/bin:/bin \\
      HOME="${HOME:-/tmp}" \\
      LC_ALL=C \\
      "$R2_RO_CURL_BIN" -sS -o "$resp" -w '%{http_code}' \\
''',
'''  http_code="$(
    "$R2_RO_ENV_BIN" -i \\
      PATH=/usr/bin:/bin \\
      HOME="${HOME:-/tmp}" \\
      LC_ALL=C \\
      ${HOLO_CURL_MOCK_MODE:+HOLO_CURL_MOCK_MODE="$HOLO_CURL_MOCK_MODE"} \\
      ${HOLO_CURL_CANARY_AK:+HOLO_CURL_CANARY_AK="$HOLO_CURL_CANARY_AK"} \\
      ${HOLO_CURL_CANARY_SK:+HOLO_CURL_CANARY_SK="$HOLO_CURL_CANARY_SK"} \\
      "$R2_RO_CURL_BIN" -sS -o "$resp" -w '%{http_code}' \\
'''
)
# For harness, allow curl to be fixture if HOLO_HARNESS_CURL set by replacing R2_RO_CURL_BIN after init
# Simpler: if FIXTURE curl path passed, rewrite R2_RO_CURL_BIN default in lib copy.
p.write_text(t)
print('prove mint forward patched', file=__import__('sys').stderr)
PY

if [[ -n "$FIXTURE_CURL" && -x "$FIXTURE_CURL" ]]; then
  # Harness-only: after root trust init, rebind curl to fixture by patching validate skip for curl.
  # Easiest: replace R2_RO_CURL_BIN assignment and skip curl trust validation in harness lib.
  /usr/bin/python3 - "$HARNESS/scripts/lib/r2-ro-live.sh" "$FIXTURE_CURL" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
curl = sys.argv[2]
t = p.read_text()
t = t.replace('R2_RO_CURL_BIN="/usr/bin/curl"', f'R2_RO_CURL_BIN="{curl}"')
# Skip curl trust-chain validation in harness (fixture is not root-owned)
t = t.replace(
'''  if ! resolved="$(r2_ro_validate_root_bin "$R2_RO_CURL_BIN")"; then
    echo "error: GATE-FIX-S28R3-QA14 /usr/bin/curl trust chain failed" >&2
    return 2
  fi
  R2_RO_CURL_BIN="$resolved"
''',
'''  # Harness: fixture curl path accepted without root chain (test-only copy).
  R2_RO_CURL_BIN="''' + curl + '''"
'''
)
p.write_text(t)
print('fixture curl bound', file=__import__('sys').stderr)
PY
fi

chmod +x "$HARNESS/scripts/"*.sh "$HARNESS/scripts/lib/"* 2>/dev/null || true
echo "$HARNESS"
