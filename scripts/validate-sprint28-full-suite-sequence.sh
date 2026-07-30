#!/bin/bash
# GATE-FIX-S28R3-QA24 — fail-closed validator for full-suite → live → full-suite record.
#
# Recomputes probe hash, rejects dropped/reordered/failing phases, missing fields,
# hash drift vs current scripts/lib/r2-scope-probes.json when required stable.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RECORD="${1:-$ROOT/.tmp/GATE-FIX-S28R3-QA24/full-suite-live-sequence.json}"
PROBE="${ROOT}/scripts/lib/r2-scope-probes.json"

if [[ ! -f "$RECORD" ]]; then
  echo "FAIL: sequence record missing: $RECORD" >&2
  exit 2
fi
if [[ ! -f "$PROBE" ]]; then
  echo "FAIL: probe file missing: $PROBE" >&2
  exit 2
fi

CURRENT_HASH="$(/usr/bin/shasum -a 256 "$PROBE" | /usr/bin/awk '{print $1}')"
QA16BAK_ABSENT=1
[[ -e "${PROBE}.qa16bak" ]] && QA16BAK_ABSENT=0

/usr/bin/env -i PATH=/usr/bin:/bin HOME=/tmp LC_ALL=C \
  /usr/bin/python3 -E -s - "$RECORD" "$CURRENT_HASH" "$QA16BAK_ABSENT" <<'PY'
import json, sys

path, current_hash, qa16 = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    doc = json.load(open(path, encoding="utf-8"))
except Exception as e:
    print(f"FAIL: cannot parse sequence record: {e}", file=sys.stderr)
    sys.exit(2)

errors = []
if doc.get("schema") != "holo.sprint28-full-suite-live-sequence.v1":
    errors.append("bad schema")
if doc.get("task_id") != "GATE-FIX-S28R3-QA24":
    errors.append("task_id mismatch")
for req in ("run_id", "git_sha", "started_at", "finished_at", "phases", "probe_path"):
    if not doc.get(req):
        errors.append(f"missing {req}")

phases = doc.get("phases") or []
if not isinstance(phases, list) or len(phases) != 3:
    errors.append("exactly 3 phases required")
else:
    expected_names = ["full_sprint28_suite", "live_r2_readonly_proof", "full_sprint28_suite"]
    for i, ph in enumerate(phases):
        if ph.get("n") != i + 1:
            errors.append(f"phase {i+1} n out of order")
        if ph.get("name") != expected_names[i]:
            errors.append(f"phase {i+1} name mismatch (got {ph.get('name')})")
        if not ph.get("command"):
            errors.append(f"phase {i+1} missing command")
        if "exit_code" not in ph:
            errors.append(f"phase {i+1} missing exit_code")
        elif int(ph["exit_code"]) != 0:
            errors.append(f"phase {i+1} exit_code={ph['exit_code']} (must be 0)")
        if not ph.get("probe_sha256_before") or not ph.get("probe_sha256_after"):
            errors.append(f"phase {i+1} missing probe hashes")
        if ph.get("qa16bak_absent") is not True:
            errors.append(f"phase {i+1} qa16bak_absent not true")
    # Hash chain continuity
    if len(phases) == 3:
        if phases[0].get("probe_sha256_after") != phases[1].get("probe_sha256_before"):
            errors.append("phase1→2 probe hash chain break")
        if phases[1].get("probe_sha256_after") != phases[2].get("probe_sha256_before"):
            errors.append("phase2→3 probe hash chain break")
        # Stability across all phases
        hashes = [
            phases[0].get("probe_sha256_before"),
            phases[0].get("probe_sha256_after"),
            phases[1].get("probe_sha256_after"),
            phases[2].get("probe_sha256_after"),
        ]
        if len(set(hashes)) != 1:
            errors.append(f"probe hash not stable across phases: {hashes}")
        if hashes[0] != current_hash:
            errors.append(
                f"recorded probe hash {hashes[0]} != current {current_hash}"
            )
    # Command content checks
    if phases and "sprint28-" not in str(phases[0].get("command", "")):
        errors.append("phase1 command must run sprint28 suite")
    if len(phases) > 1 and "prove-r2-readonly" not in str(phases[1].get("command", "")):
        errors.append("phase2 command must be prove-r2-readonly")
    if len(phases) > 1 and "REQUIRE_LIVE_R2_RO" not in str(phases[1].get("command", "")):
        errors.append("phase2 command must set REQUIRE_LIVE_R2_RO")

if qa16 != "1":
    errors.append(".qa16bak present on disk (must be absent)")

if doc.get("all_phases_exit_zero") is not True:
    errors.append("all_phases_exit_zero not true")
if doc.get("probe_hash_stable") is not True:
    errors.append("probe_hash_stable not true")

if errors:
    for e in errors:
        print(f"FAIL: {e}", file=sys.stderr)
    sys.exit(2)

print("PASS: sprint28 full-suite → live R2 → full-suite sequence valid")
sys.exit(0)
PY
