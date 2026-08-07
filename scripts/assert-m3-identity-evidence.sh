#!/usr/bin/env bash
# RH-S30-22 / RH-S30-31 residual — fail-closed M-3 identity evidence tree.
#
# Usage:
#   bash scripts/assert-m3-identity-evidence.sh <evidence-dir>
#   ASSERT_PACKAGE_COMMIT=<sha> bash scripts/assert-m3-identity-evidence.sh <evidence-dir>
#
# Requires mandatory m3-identity/ only (NO m3-branch-identity legacy fallback).
# Validates:
#   - required artifacts present and non-empty
#   - real RED/mutation signatures (vitest/assert failure transcripts + exit)
#   - every manifest digest matches file bytes (manifest.json may not self-hash)
#   - identity JSON oracles
#   - optional: each artifact blob OID matches package_commit:path
set -euo pipefail
EVID="${1:-}"
if [[ -z "$EVID" || ! -d "$EVID" ]]; then
  echo "usage: $0 <evidence-dir>" >&2
  exit 2
fi

python3 - "$EVID" "${ASSERT_PACKAGE_COMMIT:-}" "${ASSERT_M3_RUN_ID:-}" <<'PY'
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

evid = Path(sys.argv[1])
package_commit = (sys.argv[2] or "").strip()
run_id_hint = (sys.argv[3] or "").strip()
root = evid / "m3-identity"
errors = []
if not root.is_dir():
    errors.append("missing mandatory m3-identity/ tree (legacy m3-branch-identity is NOT accepted)")
    print(json.dumps({"ok": False, "errors": errors}, indent=2))
    sys.exit(1)

# Refuse silent legacy-only packages: if only m3-branch-identity exists we already failed.
# If both exist, ignore legacy entirely.

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
    "mutation-failure.log",
]

missing = [n for n in required if not (root / n).is_file() or (root / n).stat().st_size == 0]
if missing:
    errors.append(f"missing/empty required files: {missing}")


def load(name):
    p = root / name
    return json.loads(p.read_text()) if p.is_file() else None


def text(name: str) -> str:
    p = root / name
    return p.read_text(errors="replace") if p.is_file() else ""


# ── Real RED signatures (not narrative prose) ──────────────────────────────
red = text("RED-identity-oracle-baseline.txt")
red_sigs = [
    r"(?i)\bFAIL\b",
    r"(?i)AssertionError|expect\(|toBe\(|toEqual\(|toBeTruthy\(",
    r"(?i)Test Files\s+\d+\s+failed|Tests\s+\d+\s+failed|FAIL\s+\|",
    r"(?i)exit[_\s-]?code[=:\s]+[1-9]|exit status [1-9]|Exit code: [1-9]",
    r"(?i)vitest|PLATFORM_IT",
]
red_hits = [p for p in red_sigs if re.search(p, red)]
# Require at least: a failure marker AND (assertion or vitest suite header)
has_fail = any(re.search(p, red) for p in red_sigs[:3])
has_tooling = any(re.search(p, red) for p in red_sigs[3:])
if not has_fail or not has_tooling:
    errors.append(
        "RED-identity-oracle-baseline.txt lacks real RED/vitest failure signatures "
        f"(hits={red_hits}; need FAIL/AssertionError/Tests failed + exit/vitest)"
    )
if len(red.strip()) < 80:
    errors.append("RED-identity-oracle-baseline.txt too short for a real transcript")
# Narrative-only guard: pure claim without command/output shape
if re.search(r"(?i)expected after GREEN|documented residual", red) and not re.search(
    r"(?i)FAIL|AssertionError|Tests\s+\d+\s+failed", red
):
    errors.append("RED file looks narrative-only (no failure transcript)")

# ── Real mutation signatures ───────────────────────────────────────────────
mut = text("mutation-failure.log")
mut_sigs_ok = (
    re.search(r"(?i)\bFAIL\b|AssertionError|expect\(|Tests\s+\d+\s+failed", mut)
    and re.search(r"(?i)vitest|exit[_\s-]?code|mutation|PLATFORM_IT|injectFirstWriteFailure", mut)
)
if not mut_sigs_ok:
    errors.append(
        "mutation-failure.log lacks real mutation/RED signatures "
        "(need FAIL/AssertionError + vitest/exit/mutation markers)"
    )
if len(mut.strip()) < 80:
    errors.append("mutation-failure.log too short for a real transcript")
if re.search(r"(?i)documented residual|must RED\.", mut) and not re.search(
    r"(?i)FAIL|AssertionError|Tests\s+\d+\s+failed", mut
):
    errors.append("mutation-failure.log looks narrative-only")

# ── GREEN suite must look like a real pass transcript ──────────────────────
green = text("suite-vitest.log")
if not re.search(r"(?i)Tests\s+\d+\s+passed|Test Files\s+\d+\s+passed", green):
    errors.append("suite-vitest.log missing Tests/Test Files passed signature")
if not re.search(r"(?i)reselect miss|independentHttp201Id|RH-S30-19|RH-S30", green):
    # soft: still require vitest header
    if not re.search(r"(?i)vitest|RUN\s+v\d", green):
        errors.append("suite-vitest.log missing vitest/RUN header")

# ── Semantic checks on identity artifacts ──────────────────────────────────
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
else:
    errors.append("reselect-miss-identity.json missing/unparseable")

# ── Manifest integrity: every non-manifest entry digest must match ─────────
man = load("manifest.json")
if not man or not isinstance(man.get("files"), list) or len(man["files"]) < 5:
    errors.append("manifest.json missing or too small")
else:
    seen = set()
    for entry in man["files"]:
        rel = entry.get("path")
        if not rel:
            errors.append("manifest entry missing path")
            continue
        seen.add(rel)
        if rel == "manifest.json":
            # Self-hash entries are forbidden (impossible stable digest during write)
            errors.append(
                "manifest.json must not list itself (self-digest is unstable); "
                "omit manifest.json from files[]"
            )
            continue
        fp = root / rel
        if not fp.is_file():
            errors.append(f"manifest path missing on disk: {rel}")
            continue
        actual = hashlib.sha256(fp.read_bytes()).hexdigest()
        listed = (entry.get("sha256") or "").lower()
        if listed != actual:
            errors.append(
                f"manifest digest mismatch for {rel}: listed={listed[:12]}… actual={actual[:12]}…"
            )
        nbytes = entry.get("bytes")
        if nbytes is not None and int(nbytes) != fp.stat().st_size:
            errors.append(f"manifest bytes mismatch for {rel}")
    # Required artifacts (except manifest itself) must appear in manifest
    for n in required:
        if n == "manifest.json":
            continue
        if n not in seen:
            errors.append(f"manifest missing required path: {n}")

# ── Optional package_commit blob OID bind ──────────────────────────────────
oid_map = {}
if package_commit:
    # Resolve relative path under package
    # evidence dir may be absolute under .gate-evidence/<run>
    rel_root = None
    parts = root.resolve().parts
    try:
        idx = parts.index(".gate-evidence")
        rel_root = "/".join(parts[idx - 3 :])  # tasks/.../.gate-evidence/RUN/m3-identity
        # Prefer full path from repo: find sprint-30 segment
        for i, p in enumerate(parts):
            if p == ".spec":
                rel_root = "/".join(parts[i:])
                break
    except ValueError:
        rel_root = None
    if not rel_root:
        # construct from run id hint + known sprint path
        run = run_id_hint or evid.name
        rel_root = (
            ".spec/prds/mk6-migration/tasks/"
            "sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/"
            f".gate-evidence/{run}/m3-identity"
        )
    for n in required:
        rel = f"{rel_root}/{n}"
        r = subprocess.run(
            ["git", "cat-file", "-e", f"{package_commit}:{rel}"],
            capture_output=True,
        )
        if r.returncode != 0:
            errors.append(f"package_commit missing object: {rel}")
            continue
        oid = subprocess.check_output(
            ["git", "rev-parse", f"{package_commit}:{rel}"], text=True
        ).strip()
        local = subprocess.check_output(
            ["git", "hash-object", "-t", "blob", str(root / n)], text=True
        ).strip()
        oid_map[n] = {"path": rel, "blob_oid": oid, "local_oid": local}
        if oid != local:
            errors.append(f"OID mismatch {n}: package={oid} local={local}")

out = {
    "ok": len(errors) == 0,
    "tool": "scripts/assert-m3-identity-evidence.sh",
    "root": str(root),
    "legacy_fallback_accepted": False,
    "package_commit": package_commit or None,
    "oid_map": oid_map,
    "errors": errors,
}
print(json.dumps(out, indent=2))
if errors:
    for e in errors:
        print(f"assert-m3-identity-evidence FAIL: {e}", file=sys.stderr)
    sys.exit(1)
sys.exit(0)
PY
