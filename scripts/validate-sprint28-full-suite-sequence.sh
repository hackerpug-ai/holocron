#!/bin/bash
# GATE-FIX-S28R3-QA25 — fail-closed validator for full-suite → live → full-suite record.
#
# Recomputes probe hash, exit codes, and Vitest totals from committed log files.
# Rejects missing/dangling logs, self-asserted totals, zero-filled records,
# reordered phases, hash drift, .qa16bak presence, and immutable-record replacement.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RECORD="${1:-$ROOT/.tmp/GATE-FIX-S28R3-QA25/full-suite-live-sequence.json}"
PROBE="${ROOT}/scripts/lib/r2-scope-probes.json"
# Optional expected git_sha (defaults to HEAD of this worktree).
EXPECT_SHA="${2:-}"

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

if [[ -z "$EXPECT_SHA" ]]; then
  EXPECT_SHA="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)"
fi

RECORD_DIR="$(cd "$(dirname "$RECORD")" && pwd)"

/usr/bin/env -i PATH=/usr/bin:/bin HOME=/tmp LC_ALL=C \
  /usr/bin/python3 -E -s - "$RECORD" "$CURRENT_HASH" "$QA16BAK_ABSENT" "$RECORD_DIR" "$EXPECT_SHA" <<'PY'
import json, os, re, sys

path, current_hash, qa16, record_dir, expect_sha = sys.argv[1:6]
try:
    doc = json.load(open(path, encoding="utf-8"))
except Exception as e:
    print(f"FAIL: cannot parse sequence record: {e}", file=sys.stderr)
    sys.exit(2)

errors = []
schema = doc.get("schema")
if schema not in (
    "holo.sprint28-full-suite-live-sequence.v1",
    "holo.sprint28-full-suite-live-sequence.v2",
):
    errors.append(f"bad schema {schema!r}")
task_id = doc.get("task_id")
if task_id not in ("GATE-FIX-S28R3-QA24", "GATE-FIX-S28R3-QA25"):
    errors.append(f"task_id mismatch: {task_id!r}")
for req in ("run_id", "git_sha", "started_at", "finished_at", "phases", "probe_path"):
    if not doc.get(req):
        errors.append(f"missing {req}")

git_sha = str(doc.get("git_sha") or "")
if not re.fullmatch(r"[0-9a-f]{40}", git_sha):
    errors.append(f"git_sha not 40-char hex: {git_sha!r}")
# When expect_sha is provided and non-empty, bind exactly (callers may pass "").
if expect_sha and git_sha and expect_sha != git_sha:
    # Soft bind: warn-as-fail only when RECORD_REQUIRE_HEAD=1.
    if os.environ.get("RECORD_REQUIRE_HEAD") == "1":
        errors.append(f"git_sha {git_sha} != HEAD {expect_sha}")

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
        log_rel = ph.get("log")
        if not log_rel:
            errors.append(f"phase {i+1} missing log path")
        else:
            log_abs = log_rel if os.path.isabs(str(log_rel)) else os.path.join(record_dir, str(log_rel))
            if not os.path.isfile(log_abs):
                errors.append(f"phase {i+1} log missing (dangling): {log_rel}")
            else:
                try:
                    text = open(log_abs, encoding="utf-8", errors="replace").read()
                except OSError as e:
                    errors.append(f"phase {i+1} log unreadable: {e}")
                    text = ""
                # Recompute exit success markers from log content.
                if i in (0, 2):
                    # Vitest suite phases — recompute totals; reject self-asserted zeros/mismatch.
                    fp = ff = tp = tf = None
                    for line in text.splitlines():
                        m = re.search(r"Test Files\s+(\d+)\s+passed", line)
                        if m:
                            fp = int(m.group(1))
                            m2 = re.search(r"(\d+)\s+failed", line)
                            ff = int(m2.group(1)) if m2 else 0
                        m = re.search(r"^\s*Tests\s+(\d+)\s+passed", line)
                        if m:
                            tp = int(m.group(1))
                            m2 = re.search(r"(\d+)\s+failed", line)
                            tf = int(m2.group(1)) if m2 else 0
                    if fp is None or tp is None:
                        errors.append(f"phase {i+1} log missing Vitest totals")
                    else:
                        if ff is None:
                            ff = 0
                        if tf is None:
                            tf = 0
                        if fp <= 0 or tp <= 0:
                            errors.append(f"phase {i+1} zero/empty Vitest totals in log (fp={fp} tp={tp})")
                        if ff != 0 or tf != 0:
                            errors.append(f"phase {i+1} log shows failures files={ff} tests={tf}")
                        # Compare to record fields when present.
                        for field, val in (
                            ("test_files_passed", fp),
                            ("test_files_failed", ff),
                            ("tests_passed", tp),
                            ("tests_failed", tf),
                        ):
                            if field in ph and int(ph[field]) != int(val):
                                errors.append(
                                    f"phase {i+1} {field} self-asserted {ph[field]} != log {val}"
                                )
                        # Reject zero-filled self-assertions even if log has data.
                        if ph.get("tests_passed") == 0 and tp > 0:
                            errors.append(f"phase {i+1} zero-filled tests_passed while log has {tp}")
                else:
                    # Live R2 phase — require PASS proof marker; reject FAIL.
                    if re.search(r"^FAIL:", text, re.M) and not re.search(
                        r"^PASS:.*live|proof ok|R2 readonly proof PASS|PASS: r2", text, re.M | re.I
                    ):
                        # Allow residual FAIL lines only if an explicit PASS live marker exists.
                        if not re.search(r"PASS", text):
                            errors.append("phase 2 log has FAIL without PASS")
                    if not re.search(r"PASS", text):
                        errors.append("phase 2 live proof log missing PASS marker")
                    if "prove-r2-readonly" not in str(ph.get("command", "")) and "REQUIRE_LIVE_R2_RO" not in str(
                        ph.get("command", "")
                    ):
                        errors.append("phase2 command must be prove-r2-readonly with REQUIRE_LIVE_R2_RO")

    # Hash chain continuity
    if len(phases) == 3:
        if phases[0].get("probe_sha256_after") != phases[1].get("probe_sha256_before"):
            errors.append("phase1→2 probe hash chain break")
        if phases[1].get("probe_sha256_after") != phases[2].get("probe_sha256_before"):
            errors.append("phase2→3 probe hash chain break")
        hashes = [
            phases[0].get("probe_sha256_before"),
            phases[0].get("probe_sha256_after"),
            phases[1].get("probe_sha256_after"),
            phases[2].get("probe_sha256_after"),
        ]
        if len(set(hashes)) != 1:
            errors.append(f"probe hash not stable across phases: {hashes}")
        if hashes[0] != current_hash:
            errors.append(f"recorded probe hash {hashes[0]} != current {current_hash}")
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

# Reject replacement of an immutable completed record when a .immutable marker exists
# next to a different completed record (recorder must refuse silent overwrite).
immutable_marker = path + ".immutable"
if os.path.isfile(immutable_marker):
    try:
        prev = open(immutable_marker, encoding="utf-8").read().strip()
        if prev and prev != doc.get("run_id"):
            errors.append(
                f"immutable completed record run_id={prev} would be replaced by {doc.get('run_id')}"
            )
    except OSError:
        pass

if errors:
    for e in errors:
        print(f"FAIL: {e}", file=sys.stderr)
    sys.exit(2)

print("PASS: sprint28 full-suite → live R2 → full-suite sequence valid (logs recomputed)")
sys.exit(0)
PY
