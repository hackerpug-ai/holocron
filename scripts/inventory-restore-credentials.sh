#!/usr/bin/env bash
# GATE-FIX-S28R3-QA2 / H4 — Redacted credential inventory for restore gate closeout.
#
# Reads a secrets YAML path and emits presence/length only for R2_*, RESTIC_*,
# and mint-parent keys. NEVER prints secret values.
#
# Residual DEPENDENCY-S28-R2-RO when distinct R2_RESTORE_* keys are absent.
#
# Usage:
#   ./scripts/inventory-restore-credentials.sh --secrets path/to/secrets.yaml --out inventory.json
set -euo pipefail

SECRETS=""
OUT=""

usage() {
  cat <<'EOF'
Usage: inventory-restore-credentials.sh --secrets <path> --out <json>

Emits redacted inventory (presence + length only). Never prints secret values.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --secrets) SECRETS="${2:-}"; shift 2 ;;
    --secrets=*) SECRETS="${1#--secrets=}"; shift ;;
    --out) OUT="${2:-}"; shift 2 ;;
    --out=*) OUT="${1#--out=}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$SECRETS" || -z "$OUT" ]]; then
  echo "error: --secrets and --out are required" >&2
  usage >&2
  exit 2
fi

if [[ ! -f "$SECRETS" ]]; then
  echo "error: secrets file not found: $SECRETS" >&2
  exit 2
fi

mkdir -p "$(dirname "$OUT")"

python3 - "$SECRETS" "$OUT" <<'PY'
import json, re, sys
from pathlib import Path

secrets_path, out_path = sys.argv[1], sys.argv[2]
text = Path(secrets_path).read_text(encoding="utf-8")

# Flat YAML key: value (quoted or bare). Ignore comments/blank.
kv: dict[str, str] = {}
for line in text.splitlines():
    s = line.strip()
    if not s or s.startswith("#"):
        continue
    m = re.match(r"^([A-Za-z0-9_]+):\s*(.*)$", s)
    if not m:
        continue
    k, v = m.group(1), m.group(2).strip()
    if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
        v = v[1:-1]
    kv[k] = v

interest_prefixes = ("R2_", "RESTIC_")
interest_exact = {
    "R2_PARENT_ACCESS_KEY_ID",
    "R2_PARENT_SECRET_ACCESS_KEY",
    "R2_READ_WRITE_ACCESS_KEY_ID",
    "R2_READ_WRITE_SECRET_ACCESS_KEY",
    "CLOUDFLARE_API_TOKEN",
}

keys_out: dict[str, dict] = {}
for k, v in sorted(kv.items()):
    if not (k.startswith(interest_prefixes) or k in interest_exact):
        continue
    present = bool(v)
    keys_out[k] = {"present": present, "length": len(v) if present else 0}

def present(name: str) -> bool:
    meta = keys_out.get(name)
    return bool(meta and meta.get("present"))

restore_ak = present("R2_RESTORE_ACCESS_KEY_ID")
restore_sk = present("R2_RESTORE_SECRET_ACCESS_KEY")
r2_restore_present = restore_ak and restore_sk

residual = None
if not r2_restore_present:
    residual = "DEPENDENCY-S28-R2-RO"

payload = {
    "schema": "holo.restore-credential-inventory.v1",
    "secrets_path": secrets_path,
    "keys": keys_out,
    "R2_RESTORE_present": r2_restore_present,
    "residual": residual,
    "note": "presence/length only — values never included",
}

Path(out_path).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
print(f"wrote {out_path} residual={residual!r} R2_RESTORE_present={r2_restore_present}")
PY
