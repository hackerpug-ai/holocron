#!/usr/bin/env bash
# RH-S30-22 residual — fail-closed M-3 identity evidence tree.
#
# Usage:
#   bash scripts/assert-m3-identity-evidence.sh <evidence-dir>
#
# Requires m3-identity/ (or m3-branch-identity/) with:
#   - RED log, GREEN suite log, mutation log
#   - per-branch enable/fence-ledger/refuse for all three inject kinds
#   - reselect-miss-identity.json
#   - branch-oracle-map.md + manifest.json
set -euo pipefail
EVID="${1:-}"
if [[ -z "$EVID" || ! -d "$EVID" ]]; then
  echo "usage: $0 <evidence-dir>" >&2
  exit 2
fi

python3 - "$EVID" <<'PY'
import json, sys
from pathlib import Path

evid = Path(sys.argv[1])
root = evid / "m3-identity"
if not root.is_dir():
    root = evid / "m3-branch-identity"
errors = []
if not root.is_dir():
    errors.append("missing m3-identity/ (or m3-branch-identity/) tree")
    print(json.dumps({"ok": False, "errors": errors}, indent=2))
    sys.exit(1)

required = [
    "RED-identity-oracle-baseline.txt",
    "suite-vitest.log",
    "branch-oracle-map.md",
    "manifest.json",
    "non-201-accepted-id-enable-writes.json",
    "non-201-accepted-id-fence-ledger.json",
    "non-201-accepted-id-rollback-refuse.json",
    "transport-error-enable-writes.json",
    "transport-error-fence-ledger.json",
    "transport-error-rollback-refuse.json",
    "reselect-miss-enable-writes.json",
    "reselect-miss-fence-ledger.json",
    "reselect-miss-identity.json",
    "reselect-miss-rollback-refuse.json",
]
# mutation evidence (at least one)
mutation_candidates = [
    "mutation-failure.log",
    "MUTATION-probe.log",
    "mutation-oracle-failure.txt",
]
missing = [n for n in required if not (root / n).is_file() or (root / n).stat().st_size == 0]
if missing:
    errors.append(f"missing/empty required files: {missing}")
if not any((root / n).is_file() and (root / n).stat().st_size > 0 for n in mutation_candidates):
    errors.append(f"missing mutation evidence (one of {mutation_candidates})")

# Semantic checks on identity artifacts
def load(name):
    p = root / name
    return json.loads(p.read_text()) if p.is_file() else None

non201 = load("non-201-accepted-id-fence-ledger.json")
transport = load("transport-error-fence-ledger.json")
reselect = load("reselect-miss-identity.json")
if non201:
    aid = non201.get("acceptedId")
    ids = non201.get("writeIds") or []
    if not aid or aid not in ids:
        errors.append("non-201: acceptedId not in writeIds")
if transport:
    tid = transport.get("transportDocId")
    ids = transport.get("writeIds") or []
    if not tid or tid not in ids:
        errors.append("transport: transportDocId not in writeIds")
if reselect:
    hid = reselect.get("independentHttp201Id")
    probe = reselect.get("reselectProbeId")
    if not hid or hid == probe:
        errors.append("reselect: independentHttp201Id missing or equals probe id")
    if hid != reselect.get("report_write_row_id"):
        errors.append("reselect: independentHttp201Id != report_write_row_id")
    if hid not in (reselect.get("writeIds") or []):
        errors.append("reselect: independentHttp201Id not in ledger writeIds")
    if hid not in (reselect.get("dbIds") or []):
        errors.append("reselect: independentHttp201Id not in dbIds")

# manifest integrity
man = load("manifest.json")
if not man or not isinstance(man.get("files"), list) or len(man["files"]) < 5:
    errors.append("manifest.json missing or too small")

out = {
    "ok": len(errors) == 0,
    "tool": "scripts/assert-m3-identity-evidence.sh",
    "root": str(root),
    "errors": errors,
}
print(json.dumps(out, indent=2))
if errors:
    for e in errors:
        print(f"assert-m3-identity-evidence FAIL: {e}", file=sys.stderr)
    sys.exit(1)
sys.exit(0)
PY
