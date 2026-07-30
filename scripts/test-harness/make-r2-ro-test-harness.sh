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
# GATE-FIX-S28R3-QA23: secret-free env launcher required by r2_ro_exec_isolated.
cp "$ROOT_SRC/scripts/lib/exec-env-from-fd.py" "$HARNESS/scripts/lib/"
chmod +x "$HARNESS/scripts/lib/exec-env-from-fd.py"
# GATE-FIX-S28R3-QA25: seal env keys to private file (argv = key names only).
if [[ -f "$ROOT_SRC/scripts/lib/seal-env-to-file.py" ]]; then
  cp "$ROOT_SRC/scripts/lib/seal-env-to-file.py" "$HARNESS/scripts/lib/"
  chmod +x "$HARNESS/scripts/lib/seal-env-to-file.py"
fi
# GATE-FIX-S28R3-QA24: mint helper (token never on argv).
if [[ -f "$ROOT_SRC/scripts/lib/r2-mint-temp-ro.py" ]]; then
  cp "$ROOT_SRC/scripts/lib/r2-mint-temp-ro.py" "$HARNESS/scripts/lib/"
  chmod +x "$HARNESS/scripts/lib/r2-mint-temp-ro.py"
fi
# Install mock provider as the repository provider path inside harness.
cp "$MOCK_PROVIDER" "$HARNESS/scripts/lib/r2_s3_provider.py"
chmod +x "$HARNESS/scripts/lib/r2_s3_provider.py"

# GATE-FIX-S28R3-QA25 harness: drop exclusive host lock (tests run many parallel harness drills).
/usr/bin/python3 - "$HARNESS/scripts/run-fire-drill-on-fresh-target.sh" <<'PYL'
from pathlib import Path
import re, sys
p = Path(sys.argv[1])
t = p.read_text()
t2 = re.sub(
    r"# GATE-FIX-S28R3-QA25: exclusive host fire-drill lock.*?trap '/bin/rm -rf \"\$_FIRE_DRILL_LOCKDIR\" 2>/dev/null \|\| true' EXIT INT TERM\n",
    "# Harness: exclusive host lock skipped (parallel unit/integration harness drills).\n",
    t,
    count=1,
    flags=re.S,
)
if t2 == t:
    # softer: replace mkdir lock loop with true
    t2 = t.replace('_FIRE_DRILL_LOCKDIR=', '_FIRE_DRILL_LOCKDIR_UNUSED=')
p.write_text(t2)
print('harness: skip exclusive host lock', file=__import__('sys').stderr)
PYL

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
# Insert mutation + deterministic race-swap seams after prove success / before validate
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
  # GATE-FIX-S28R3-QA21: deterministic consumer-level proof races (file + parent dir).
  # Forced BEFORE validation so the race always wins; uses correct tuple/context content.
  if [[ -n "${HOLO_QA_RACE_SWAP:-}" ]]; then
    case "$HOLO_QA_RACE_SWAP" in
      file|parent) ;;
      *)
        echo "error: HOLO_QA_RACE_SWAP must be file|parent" >&2
        exit 2
        ;;
    esac
    if [[ -n "${HOLO_QA_RACE_BARRIER:-}" ]]; then
      # Deterministic barrier: wait until test removes the barrier file (or timeout).
      _b_wait=0
      while [[ -e "${HOLO_QA_RACE_BARRIER}" && $_b_wait -lt 500 ]]; do
        /bin/sleep 0.01 2>/dev/null || sleep 0.01
        _b_wait=$((_b_wait + 1))
      done
    fi
    /usr/bin/python3 -E -s - "$proof" "$HOLO_QA_RACE_SWAP" "${HOLO_QA_RACE_MARKER:-}" <<'RPY'
import json, os, sys
proof, kind, marker = sys.argv[1], sys.argv[2], sys.argv[3]
with open(proof) as f:
    body = json.load(f)
# Syntactically valid fresh proof with correct tuple/context (content would pass).
evil_body = dict(body)
evil_body["note"] = f"qa21-race-swap-{kind}"
parent = os.path.dirname(proof)
name = os.path.basename(proof)
evil_path = os.path.join(os.path.dirname(parent) if kind == "parent" else parent, f".qa21-evil-{name}")
if kind == "file":
    evil_path = proof + ".qa21-evil-valid.json"
    with open(evil_path, "w") as f:
        json.dump(evil_body, f, indent=2)
        f.write("\\n")
    os.chmod(evil_path, 0o600)
    os.rename(proof, proof + ".qa21-real")
    os.symlink(evil_path, proof)
    print(f"HOLO_QA_RACE_SWAP applied: file symlink->valid-content", file=sys.stderr)
elif kind == "parent":
    decoy = parent + ".qa21-decoy"
    if os.path.exists(decoy):
        import shutil
        shutil.rmtree(decoy, ignore_errors=True)
    os.mkdir(decoy, 0o700)
    decoy_proof = os.path.join(decoy, name)
    with open(decoy_proof, "w") as f:
        json.dump(evil_body, f, indent=2)
        f.write("\\n")
    os.chmod(decoy_proof, 0o600)
    os.rename(parent, parent + ".qa21-moved")
    os.symlink(decoy, parent)
    print(f"HOLO_QA_RACE_SWAP applied: parent-dir symlink->decoy", file=sys.stderr)
if marker:
    open(marker, "w").write(kind + "\\n")
RPY
  fi
''' + needle
if needle not in t:
    raise SystemExit('validate proof needle missing in fire-drill harness')
t = t.replace(needle, insert, 1)
# After validation attempt, restore race damage so later tests share a clean harness.
restore_fire = '''  if ! r2_ro_validate_proof "$proof" "$expected_fp" "$expected_ctx"; then'''
restore_fire_new = '''  _qa21_validate_rc=0
  if ! r2_ro_validate_proof "$proof" "$expected_fp" "$expected_ctx"; then
    _qa21_validate_rc=1
  fi
  if [[ -n "${HOLO_QA_RACE_SWAP:-}" ]]; then
    /usr/bin/python3 -E -s - "$proof" "$HOLO_QA_RACE_SWAP" <<'CRPY' || true
import os, sys
proof, kind = sys.argv[1], sys.argv[2]
parent = os.path.dirname(proof)
if kind == "file":
    real = proof + ".qa21-real"
    if os.path.islink(proof) or os.path.exists(proof):
        try: os.unlink(proof)
        except OSError: pass
    if os.path.exists(real):
        os.rename(real, proof)
    evil = proof + ".qa21-evil-valid.json"
    if os.path.exists(evil):
        try: os.unlink(evil)
        except OSError: pass
elif kind == "parent":
    moved = parent + ".qa21-moved"
    decoy = parent + ".qa21-decoy"
    if os.path.islink(parent) or os.path.exists(parent):
        try:
            if os.path.islink(parent):
                os.unlink(parent)
            else:
                import shutil
                shutil.rmtree(parent, ignore_errors=True)
        except OSError:
            pass
    if os.path.exists(moved):
        os.rename(moved, parent)
    if os.path.exists(decoy):
        import shutil
        shutil.rmtree(decoy, ignore_errors=True)
CRPY
  fi
  if [[ "${_qa21_validate_rc:-0}" -ne 0 ]]; then'''
# Only replace the first validate that sits after our race insert (the one we just created)
if restore_fire not in t:
    raise SystemExit('fire-drill validate restore needle missing')
t = t.replace(restore_fire, restore_fire_new, 1)
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
  # GATE-FIX-S28R3-QA21: deterministic consumer-level proof races (file + parent dir).
  if [[ -n "${HOLO_QA_RACE_SWAP:-}" ]]; then
    case "$HOLO_QA_RACE_SWAP" in
      file|parent) ;;
      *)
        echo "error: HOLO_QA_RACE_SWAP must be file|parent" >&2
        exit 2
        ;;
    esac
    if [[ -n "${HOLO_QA_RACE_BARRIER:-}" ]]; then
      _b_wait=0
      while [[ -e "${HOLO_QA_RACE_BARRIER}" && $_b_wait -lt 500 ]]; do
        /bin/sleep 0.01 2>/dev/null || sleep 0.01
        _b_wait=$((_b_wait + 1))
      done
    fi
    /usr/bin/python3 -E -s - "$proof" "$HOLO_QA_RACE_SWAP" "${HOLO_QA_RACE_MARKER:-}" <<'RPY'
import json, os, sys
proof, kind, marker = sys.argv[1], sys.argv[2], sys.argv[3]
with open(proof) as f:
    body = json.load(f)
evil_body = dict(body)
evil_body["note"] = f"qa21-race-swap-{kind}"
parent = os.path.dirname(proof)
name = os.path.basename(proof)
if kind == "file":
    evil_path = proof + ".qa21-evil-valid.json"
    with open(evil_path, "w") as f:
        json.dump(evil_body, f, indent=2)
        f.write("\\n")
    os.chmod(evil_path, 0o600)
    os.rename(proof, proof + ".qa21-real")
    os.symlink(evil_path, proof)
    print(f"HOLO_QA_RACE_SWAP applied: file symlink->valid-content", file=sys.stderr)
elif kind == "parent":
    decoy = parent + ".qa21-decoy"
    if os.path.exists(decoy):
        import shutil
        shutil.rmtree(decoy, ignore_errors=True)
    os.mkdir(decoy, 0o700)
    decoy_proof = os.path.join(decoy, name)
    with open(decoy_proof, "w") as f:
        json.dump(evil_body, f, indent=2)
        f.write("\\n")
    os.chmod(decoy_proof, 0o600)
    os.rename(parent, parent + ".qa21-moved")
    os.symlink(decoy, parent)
    print(f"HOLO_QA_RACE_SWAP applied: parent-dir symlink->decoy", file=sys.stderr)
if marker:
    open(marker, "w").write(kind + "\\n")
RPY
  fi
''' + needle
if needle not in t:
    raise SystemExit('validate proof needle missing in provision harness')
t = t.replace(needle, insert, 1)
restore_prov = '''  if ! r2_ro_validate_proof "$proof" "$expected_fp" "$expected_ctx"; then'''
restore_prov_new = '''  _qa21_validate_rc=0
  if ! r2_ro_validate_proof "$proof" "$expected_fp" "$expected_ctx"; then
    _qa21_validate_rc=1
  fi
  if [[ -n "${HOLO_QA_RACE_SWAP:-}" ]]; then
    /usr/bin/python3 -E -s - "$proof" "$HOLO_QA_RACE_SWAP" <<'CRPY' || true
import os, sys
proof, kind = sys.argv[1], sys.argv[2]
parent = os.path.dirname(proof)
if kind == "file":
    real = proof + ".qa21-real"
    if os.path.islink(proof) or os.path.exists(proof):
        try: os.unlink(proof)
        except OSError: pass
    if os.path.exists(real):
        os.rename(real, proof)
    evil = proof + ".qa21-evil-valid.json"
    if os.path.exists(evil):
        try: os.unlink(evil)
        except OSError: pass
elif kind == "parent":
    moved = parent + ".qa21-moved"
    decoy = parent + ".qa21-decoy"
    if os.path.islink(parent) or os.path.exists(parent):
        try:
            if os.path.islink(parent):
                os.unlink(parent)
            else:
                import shutil
                shutil.rmtree(parent, ignore_errors=True)
        except OSError:
            pass
    if os.path.exists(moved):
        os.rename(moved, parent)
    if os.path.exists(decoy):
        import shutil
        shutil.rmtree(decoy, ignore_errors=True)
CRPY
  fi
  if [[ "${_qa21_validate_rc:-0}" -ne 0 ]]; then'''
if restore_prov not in t:
    raise SystemExit('provision validate restore needle missing')
t = t.replace(restore_prov, restore_prov_new, 1)
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
# Forward mock env vars into r2_ro_run_provider (QA25 sealed-from-env form).
old = '''  export AWS_ACCESS_KEY_ID="$ak"
  export AWS_SECRET_ACCESS_KEY="$sk"
  export AWS_SESSION_TOKEN="$st"
  export AWS_DEFAULT_REGION=auto
  export PATH="/usr/bin:/bin"
  export HOME="${HOME:-/tmp}"
  export LC_ALL=C
  set +e
  r2_ro_exec_isolated_from_env \\
    PATH HOME LC_ALL \\
    AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_DEFAULT_REGION \\
    -- \\
    "$R2_RO_PYTHON_BIN" "$R2_RO_PROVIDER_PY" "$@"
'''
new = '''  export AWS_ACCESS_KEY_ID="$ak"
  export AWS_SECRET_ACCESS_KEY="$sk"
  export AWS_SESSION_TOKEN="$st"
  export AWS_DEFAULT_REGION=auto
  export PATH="/usr/bin:/bin"
  export HOME="${HOME:-/tmp}"
  export LC_ALL=C
  # Harness mock markers (non-secret) — export then seal by key name.
  local mock_keys=()
  if [[ -n "${HOLO_R2_PROVIDER_MOCK_MODE:-}" ]]; then
    export HOLO_R2_PROVIDER_MOCK_MODE
    mock_keys+=(HOLO_R2_PROVIDER_MOCK_MODE)
  fi
  if [[ -n "${HOLO_R2_PROVIDER_MOCK_CANARY:-}" ]]; then
    export HOLO_R2_PROVIDER_MOCK_CANARY
    mock_keys+=(HOLO_R2_PROVIDER_MOCK_CANARY)
  fi
  if [[ -n "${HOLO_R2_PROVIDER_MOCK_RAN_MARKER:-}" ]]; then
    export HOLO_R2_PROVIDER_MOCK_RAN_MARKER
    mock_keys+=(HOLO_R2_PROVIDER_MOCK_RAN_MARKER)
  fi
  if [[ -n "${HOLO_R2_PROVIDER_MOCK_AS_WRITER:-}" ]]; then
    export HOLO_R2_PROVIDER_MOCK_AS_WRITER
    mock_keys+=(HOLO_R2_PROVIDER_MOCK_AS_WRITER)
  fi
  set +e
  r2_ro_exec_isolated_from_env \\
    PATH HOME LC_ALL \\
    AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_DEFAULT_REGION \\
    ${mock_keys[@]+"${mock_keys[@]}"} \\
    -- \\
    "$R2_RO_PYTHON_BIN" "$R2_RO_PROVIDER_PY" "$@"
'''
if old not in t:
    raise SystemExit('r2_ro_run_provider isolated block missing')
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


# GATE-FIX-S28R3-QA19: re-inject mock fixture-key branch after production strip
/usr/bin/python3 - "$HARNESS/scripts/lib/r2-ro-live.sh" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
old = """  # GATE-FIX-S28R3-QA19: production has NO mock branch (harness patches after copy).
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
"""
new = """  # Harness-only: mock mode may use fixture probe keys; production copy never had this branch.
  if [[ -n "${HOLO_R2_PROVIDER_MOCK_MODE:-}" ]]; then
    if [[ -z "${R2_SCOPE_PROBE_IN_KEY:-}" || -z "${R2_SCOPE_PROBE_OUT_KEY:-}" ]]; then
      R2_SCOPE_PROBE_IN_KEY="$trusted_in"
      R2_SCOPE_PROBE_OUT_KEY="$trusted_out"
    fi
  else
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
  fi
"""
if old not in t:
    raise SystemExit("bind block not found for harness re-inject")
t = t.replace(old, new, 1)
p.write_text(t)
print("lib mock-key branch re-injected", file=sys.stderr)
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



# GATE-FIX-S28R3-QA19/QA25: forward mock knobs into assert_bound prove isolated env.
# Production uses r2_ro_exec_isolated_from_env KEY... -- /bin/bash "$prove_cmd".
for cons in provision-fresh-restore-target.sh run-fire-drill-on-fresh-target.sh; do
/usr/bin/python3 - "$HARNESS/scripts/$cons" <<'PY'
from pathlib import Path
import re
import sys
p = Path(sys.argv[1])
t = p.read_text()
if "HOLO_R2_PROVIDER_MOCK_MODE" in t and "prove_cmd" in t:
    print("forward mock knobs already present", p.name, file=__import__("sys").stderr)
    raise SystemExit(0)
# Prefer sealed-from-env form (QA25): insert mock KEY names BEFORE --.
m = re.search(
    r'(r2_ro_exec_isolated_from_env[\s\S]*?)(    --\s*\\\n\s*/bin/bash "\$prove_cmd")',
    t,
)
if not m:
    m = re.search(
        r'(r2_ro_exec_isolated_from_env[\s\S]*?)(    --\s*\n\s*/bin/bash "\$prove_cmd")',
        t,
    )
if m:
    insert = (
        m.group(1)
        + '    HOLO_R2_PROVIDER_MOCK_MODE HOLO_R2_PROVIDER_MOCK_CANARY HOLO_R2_PROVIDER_MOCK_RAN_MARKER \\\n'
        + m.group(2)
    )
    # Also export mock keys before the launcher so sealer can read them.
    export_block = (
        '  # Harness: export mock knobs (non-secret) for sealed-from-env prove child.\n'
        '  [[ -n "${HOLO_R2_PROVIDER_MOCK_MODE:-}" ]] && export HOLO_R2_PROVIDER_MOCK_MODE\n'
        '  [[ -n "${HOLO_R2_PROVIDER_MOCK_CANARY:-}" ]] && export HOLO_R2_PROVIDER_MOCK_CANARY\n'
        '  [[ -n "${HOLO_R2_PROVIDER_MOCK_RAN_MARKER:-}" ]] && export HOLO_R2_PROVIDER_MOCK_RAN_MARKER\n'
    )
    t = t[: m.start()] + export_block + insert + t[m.end() :]
    p.write_text(t)
    print("forward mock knobs into assert_bound prove (from_env)", p.name, file=__import__("sys").stderr)
    raise SystemExit(0)
# Legacy KEY=val form
needle = '     --     /bin/bash "$prove_cmd"'
if needle not in t:
    needle = '--     /bin/bash "$prove_cmd"'
    if needle not in t:
        raise SystemExit(f"prove isolated -- not found in {p}")
insert = (
    '     "HOLO_R2_PROVIDER_MOCK_MODE=${HOLO_R2_PROVIDER_MOCK_MODE:-}"'
    '     "HOLO_R2_PROVIDER_MOCK_CANARY=${HOLO_R2_PROVIDER_MOCK_CANARY:-}"'
    '     "HOLO_R2_PROVIDER_MOCK_RAN_MARKER=${HOLO_R2_PROVIDER_MOCK_RAN_MARKER:-}"'
    '     --     /bin/bash "$prove_cmd"'
)
t = t.replace(needle, insert, 1)
p.write_text(t)
print("forward mock knobs into assert_bound prove (legacy)", p.name, file=__import__("sys").stderr)
PY
done

# GATE-FIX-S28R3-QA19 harness: ensure HOLO_CLI override for unit tests
/usr/bin/python3 - "$HARNESS/scripts/run-fire-drill-on-fresh-target.sh" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
if 'HOLO_CLI="${HOLO_CLI:-' not in t and 'harness allows override' not in t:
    t = t.replace(
        'HOLO_CLI="$ROOT/services/platform/src/cli/holo.ts"',
        'HOLO_CLI="${HOLO_CLI:-$ROOT/services/platform/src/cli/holo.ts}"  # harness allows override',
        1,
    )
p.write_text(t)
print('fire-drill HOLO_CLI harness override ensured', file=sys.stderr)
PY


# GATE-FIX-S28R3-QA19 harness preflight mock-as-writer
/usr/bin/python3 "$ROOT_SRC/scripts/test-harness/qa19-patch-prove-preflight.py" "$HARNESS/scripts/prove-r2-readonly.sh"

chmod +x "$HARNESS/scripts/"*.sh "$HARNESS/scripts/lib/"* 2>/dev/null || true
echo "$HARNESS"
