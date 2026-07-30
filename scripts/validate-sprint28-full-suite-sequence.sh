#!/bin/bash
# GATE-FIX-S28R3-QA27 — fail-closed validator for full-suite → live → full-suite record.
#
# Recomputes probe hash, exit codes, and Vitest totals from committed log files.
# Rejects missing/dangling logs, self-asserted totals, zero-filled records,
# reordered phases, hash drift, .qa16bak presence, and immutable-record replacement.
#
# Two-commit layout: record git_sha binds the frozen CODE commit; git diff
# record..HEAD may only list an exact closed set of immutable evidence /
# task-status paths (NO whole-directory prefixes). NEVER allowlist
# validator/test/product code, nested unlisted paths, symlinks, mode-only
# executables, or executables under former QA26/QA27 evidence trees.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RECORD="${1:-$ROOT/.tmp/GATE-FIX-S28R3-QA27/full-suite-live-sequence.json}"
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
  /usr/bin/python3 -E -s - "$RECORD" "$CURRENT_HASH" "$QA16BAK_ABSENT" "$RECORD_DIR" "$EXPECT_SHA" "$ROOT" <<'PY'
import json, os, re, subprocess, sys

path, current_hash, qa16, record_dir, expect_sha, root = sys.argv[1:7]
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
if task_id not in (
    "GATE-FIX-S28R3-QA24",
    "GATE-FIX-S28R3-QA25",
    "GATE-FIX-S28R3-QA26",
    "GATE-FIX-S28R3-QA27",
):
    errors.append(f"task_id mismatch: {task_id!r}")
for req in ("run_id", "git_sha", "started_at", "finished_at", "phases", "probe_path"):
    if not doc.get(req):
        errors.append(f"missing {req}")

run_id = str(doc.get("run_id") or "")
if run_id and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,120}", run_id):
    errors.append(f"run_id not allowlisted shape: {run_id!r}")


def git(*args: str) -> tuple[int, str, str]:
    r = subprocess.run(
        ["git", "-C", root, *args],
        capture_output=True,
        text=True,
    )
    return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()


def build_exact_allowlist(task: str, rid: str) -> set[str]:
    """Closed exact-file allowlist. NO whole-directory prefixes (QA27 H-1)."""
    task_dir = (
        ".spec/prds/mk6-migration/tasks/"
        "sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill"
    )
    allow: set[str] = set()
    if task == "GATE-FIX-S28R3-QA27":
        ev = ".tmp/GATE-FIX-S28R3-QA27"
        allow.add(
            f"{task_dir}/GATE-FIX-S28R3-QA27-exact-evidence-allowlist-and-real-production-boundary.md"
        )
        # Sequence record + immutable marker
        allow.update(
            {
                f"{ev}/full-suite-live-sequence.json",
                f"{ev}/full-suite-live-sequence.json.immutable",
                f"{ev}/sequence-runner.log",
                f"{ev}/live-r2.log",
                f"{ev}/focused-qa27.log",
                f"{ev}/focused-qa27-resume.log",
                f"{ev}/whitespace-clean.json",
                f"{ev}/sequence-allowlist-contract.json",
                f"{ev}/mutation-rejects.json",
                f"{ev}/prod-boundary.json",
                f"{ev}/lifecycle-cleanup.json",
                f"{ev}/lifecycle-after-d05.json",
                f"{ev}/d05-04-consumer.json",
                f"{ev}/d05-04-consumer-pending.json",
                f"{ev}/hostile-bin-refuse.json",
                f"{ev}/human-prerequisite-root-pg-tools.txt",
                f"{ev}/d05-04-bundle/parity-report.json",
                f"{ev}/d05-04-bundle/attestation.json",
                f"{ev}/d05-04-bundle/SUMMARY.json",
                f"{ev}/d05-04-bundle/oracle-manifest.json",
                f"{ev}/d05-04-run/parity-report.json",
                f"{ev}/d05-04-run/attestation.json",
                f"{ev}/d05-04-run/pitr-restore-status.json",
                f"{ev}/d05-04-run/pre-failure-snapshot.json",
            }
        )
        # Phase logs only when run_id is strictly validated and matches declared phases.
        if rid and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,120}", rid):
            allow.update(
                {
                    f"{ev}/sequence-{rid}/phase1-full-suite.log",
                    f"{ev}/sequence-{rid}/phase2-live-r2-ro.log",
                    f"{ev}/sequence-{rid}/phase3-full-suite.log",
                }
            )
        # Phase log paths declared in the record (must resolve under evidence + match names).
        phases = doc.get("phases") or []
        if isinstance(phases, list) and len(phases) == 3 and rid:
            expected_logs = [
                f"sequence-{rid}/phase1-full-suite.log",
                f"sequence-{rid}/phase2-live-r2-ro.log",
                f"sequence-{rid}/phase3-full-suite.log",
            ]
            for i, ph in enumerate(phases):
                log_rel = str((ph or {}).get("log") or "")
                if not log_rel:
                    continue
                # Normalize absolute → relative-to-evidence basename chain
                if os.path.isabs(log_rel):
                    # Only accept if under the evidence dir on disk; store as relative allow path.
                    try:
                        common = os.path.commonpath(
                            [os.path.realpath(log_rel), os.path.realpath(os.path.join(root, ev))]
                        )
                        if common == os.path.realpath(os.path.join(root, ev)):
                            rel = os.path.relpath(os.path.realpath(log_rel), os.path.realpath(os.path.join(root, ev)))
                            log_rel = f"{ev}/{rel.replace(os.sep, '/')}"
                        else:
                            continue
                    except ValueError:
                        continue
                else:
                    log_rel = log_rel.lstrip("./")
                    if not log_rel.startswith(ev + "/") and not log_rel.startswith("sequence-"):
                        # Relative to record dir
                        log_rel = f"{ev}/{log_rel}"
                    elif log_rel.startswith("sequence-"):
                        log_rel = f"{ev}/{log_rel}"
                # Must match the three declared phase log names exactly (no nested extras).
                tail = log_rel[len(ev) + 1 :] if log_rel.startswith(ev + "/") else log_rel
                if tail in expected_logs or log_rel.endswith(expected_logs[i].split("/", 1)[-1]):
                    if tail == expected_logs[i] or log_rel == f"{ev}/{expected_logs[i]}":
                        allow.add(f"{ev}/{expected_logs[i]}")
    elif task == "GATE-FIX-S28R3-QA26":
        # Historical QA26: exact closed set only (whole-dir prefix removed — QA27 H-1).
        ev = ".tmp/GATE-FIX-S28R3-QA26"
        allow.add(
            f"{task_dir}/GATE-FIX-S28R3-QA26-final-trusted-descendants-and-evidence-consumer.md"
        )
        allow.update(
            {
                f"{ev}/full-suite-live-sequence.json",
                f"{ev}/full-suite-live-sequence.json.immutable",
                f"{ev}/sequence-runner.log",
                f"{ev}/live-r2.log",
                f"{ev}/focused-qa26.log",
                f"{ev}/focused-qa26-resume.log",
                f"{ev}/whitespace-clean.json",
                f"{ev}/sequence-allowlist-contract.json",
                f"{ev}/prod-boundary-contract.json",
                f"{ev}/lifecycle-cleanup.json",
                f"{ev}/lifecycle-after-d05.json",
                f"{ev}/d05-04-consumer-pending.json",
                f"{ev}/hostile-bin-refuse.json",
                f"{ev}/human-prerequisite-root-pg-tools.txt",
                f"{ev}/d05-04-bundle/parity-report.json",
                f"{ev}/d05-04-bundle/attestation.json",
                f"{ev}/d05-04-bundle/SUMMARY.json",
                f"{ev}/d05-04-bundle/oracle-manifest.json",
                f"{ev}/d05-04-run/parity-report.json",
                f"{ev}/d05-04-run/attestation.json",
                f"{ev}/d05-04-run/pitr-restore-status.json",
                f"{ev}/d05-04-run/pre-failure-snapshot.json",
            }
        )
        if rid and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,120}", rid):
            allow.update(
                {
                    f"{ev}/sequence-{rid}/phase1-full-suite.log",
                    f"{ev}/sequence-{rid}/phase2-live-r2-ro.log",
                    f"{ev}/sequence-{rid}/phase3-full-suite.log",
                }
            )
    # QA24/QA25: no open directory prefixes; only same-commit (full_sha==head) passes.
    return allow


# Fail-closed bind: record git_sha must resolve, be an ancestor of HEAD, and
# git diff record..HEAD may only contain exact immutable evidence/task-status
# files. NEVER allowlist validator code, tests, product code, whole directories,
# nested unlisted paths, symlinks, or executables.
git_sha = str(doc.get("git_sha") or "")
if not re.fullmatch(r"[0-9a-f]{40}", git_sha):
    errors.append(f"git_sha not 40-char hex: {git_sha!r}")
else:
    head = (expect_sha or "").strip()
    if not head:
        rc_h, head, err_h = git("rev-parse", "HEAD")
        if rc_h != 0 or not head:
            errors.append(f"cannot resolve HEAD for bind check: {err_h or 'empty'}")
            head = ""
    else:
        rc_h, head_full, err_h = git("rev-parse", "--verify", f"{head}^{{commit}}")
        if rc_h != 0 or not head_full:
            errors.append(f"EXPECT_SHA does not resolve to a commit: {expect_sha!r}")
            head = ""
        else:
            head = head_full

    if head:
        rc_s, full_sha, err_s = git("rev-parse", "--verify", f"{git_sha}^{{commit}}")
        if rc_s != 0 or not full_sha:
            errors.append(f"git_sha does not resolve to a commit: {git_sha}")
        else:
            rc_a, _, _ = git("merge-base", "--is-ancestor", full_sha, head)
            if rc_a != 0:
                errors.append(f"git_sha is not an ancestor of HEAD: {full_sha} !<= {head}")
            elif full_sha != head:
                ALLOW_EXACT = build_exact_allowlist(str(task_id or ""), run_id)
                FORBIDDEN_SUBSTRINGS = (
                    "validate-sprint28-full-suite-sequence.sh",
                    "sprint28-s28r3-qa",
                    "/src/",
                    "services/platform/src/",
                    "services/platform/tests/",
                    "scripts/validate-",
                    "scripts/record-",
                    "scripts/consume-",
                    "scripts/assert-",
                    "scripts/prove-",
                    "scripts/provision-",
                    "scripts/run-fire-drill",
                )
                # Former whole-dir evidence trees — no unlisted nested path may pass.
                FORMER_EVIDENCE_PREFIXES = (
                    ".tmp/GATE-FIX-S28R3-QA26/",
                    ".tmp/GATE-FIX-S28R3-QA27/",
                )
                EXEC_SUFFIXES = (
                    ".ts",
                    ".js",
                    ".sh",
                    ".py",
                    ".mjs",
                    ".cjs",
                    ".exe",
                    ".bin",
                    ".so",
                    ".dylib",
                )

                def path_allowed(p: str) -> bool:
                    return p in ALLOW_EXACT

                def tree_mode_type(commit: str, p: str) -> tuple[str, str]:
                    """Return (mode, type) from git ls-tree, or ('','') if missing."""
                    rc_t, out_t, _ = git("ls-tree", commit, "--", p)
                    if rc_t != 0 or not out_t:
                        return "", ""
                    # format: <mode> <type> <object>\t<file>
                    line = out_t.splitlines()[0]
                    parts = line.split()
                    if len(parts) < 2:
                        return "", ""
                    return parts[0], parts[1]

                rc_d, diff_out, err_d = git("diff", "--name-only", f"{full_sha}..{head}")
                if rc_d != 0:
                    errors.append(f"git diff failed for bind check: {err_d or rc_d}")
                else:
                    changed = [line.strip() for line in diff_out.splitlines() if line.strip()]
                    for p in changed:
                        base = os.path.basename(p)
                        # Hard refuse known control surfaces always (no evidence-prefix bypass).
                        if any(s in p for s in FORBIDDEN_SUBSTRINGS):
                            errors.append(f"non-evidence path after bound git_sha: {p}")
                            continue
                        # Refuse alternate/executable extensions even if nested under evidence.
                        if base.endswith(EXEC_SUFFIXES):
                            errors.append(
                                f"executable/control extension forbidden after bound git_sha: {p}"
                            )
                            continue
                        # Nested path under former evidence prefix but not exact-allowlisted.
                        under_former = any(p.startswith(pref) for pref in FORMER_EVIDENCE_PREFIXES)
                        if under_former and not path_allowed(p):
                            errors.append(
                                f"unlisted/nested evidence path after bound git_sha: {p}"
                            )
                            continue
                        if not path_allowed(p):
                            errors.append(f"non-evidence path after bound git_sha: {p}")
                            continue
                        # Exact-allowlisted path still fails closed on symlink / executable mode.
                        mode, typ = tree_mode_type(head, p)
                        if typ == "commit":
                            errors.append(f"gitlink forbidden after bound git_sha: {p}")
                            continue
                        if mode == "120000" or typ == "commit":
                            errors.append(f"symlink forbidden after bound git_sha: {p}")
                            continue
                        if mode.startswith("100755") or mode == "100755":
                            errors.append(
                                f"executable mode forbidden after bound git_sha: {p}"
                            )
                            continue
                        if mode and not mode.startswith("100644") and mode != "100644":
                            # Also reject other non-regular modes
                            if mode.startswith("120") or mode.startswith("160"):
                                errors.append(
                                    f"non-regular mode forbidden after bound git_sha: {p} mode={mode}"
                                )

                    # Mode-only flips (name-only may omit pure mode changes on some git versions;
                    # --summary always reports "mode change 100644 => 100755 path").
                    rc_sum, summary, err_sum = git(
                        "diff", "--summary", f"{full_sha}..{head}"
                    )
                    if rc_sum != 0:
                        errors.append(f"git diff --summary failed: {err_sum or rc_sum}")
                    else:
                        for line in summary.splitlines():
                            low = line.strip().lower()
                            if "mode change" in low and "100755" in low:
                                errors.append(
                                    f"mode-only executable change forbidden after bound git_sha: {line.strip()}"
                                )
                            if "mode change" in low and "=> 100755" in low.replace(" ", ""):
                                errors.append(
                                    f"mode-only executable change forbidden after bound git_sha: {line.strip()}"
                                )

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
