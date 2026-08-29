#!/usr/bin/env bash
# D05-04 optional wrapper: full CAP-BAK-01 fire-drill restore (Postgres + blob).
# Usage:
#   scripts/fire-drill.sh --target-timestamp <iso> --scratch <empty-pgdata> --blob-dir <empty-dir>
#                        [--report .tmp/D05-04/parity-report.json]
set -euo pipefail
# GATE-FIX-S28R3-QA22: shell-native root resolution (no PATH dirname).
_SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
[[ "$_SCRIPT_DIR" == "${BASH_SOURCE[0]}" ]] && _SCRIPT_DIR="."
ROOT="$(cd "$_SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

# GATE-FIX-S28R3-QA23: absolute root-owned Bun only — never bare PATH bun with credentials ambient.
BUN_BIN=""
for _cand in /usr/local/bin/bun /usr/bin/bun; do
  if [[ -x "$_cand" ]]; then
    if /usr/bin/python3 -E -s - "$_cand" <<'PY'
import os, stat, sys
cand = sys.argv[1]
if not cand.startswith("/"):
    sys.exit(2)
parts = [p for p in cand.split("/") if p]
path = ""
for part in parts:
    path = path + "/" + part
    st = os.lstat(path)
    if stat.S_ISLNK(st.st_mode):
        path = os.path.realpath(path)
        st = os.lstat(path)
    mode = stat.S_IMODE(st.st_mode)
    if st.st_uid != 0 or mode & (stat.S_IWGRP | stat.S_IWOTH):
        sys.exit(2)
st = os.lstat(os.path.realpath(cand))
if not stat.S_ISREG(st.st_mode) or st.st_uid != 0 or (st.st_mode & 0o111) == 0:
    sys.exit(2)
sys.exit(0)
PY
    then
      BUN_BIN="$_cand"
      break
    fi
  fi
done
if [[ -z "$BUN_BIN" ]]; then
  echo "error: GATE-FIX-S28R3-QA23 fire-drill.sh requires root-owned bun at /usr/local/bin/bun or /usr/bin/bun" >&2
  exit 2
fi
exec "$BUN_BIN" "$ROOT/packages/platform/src/cli/holo.ts" restore:fire-drill "$@"
