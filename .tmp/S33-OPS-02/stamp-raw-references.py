#!/usr/bin/env python3
"""Atomically bind verifier raw artifacts and derived claims into the harvest summary.

This is intentionally a small, deterministic postprocessor for the machine-generated
harvest summary. It never follows artifact symlinks, accepts paths only beneath the
task evidence root, and refuses to rewrite a summary whose task or source SHA is not
the current checkout.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
from pathlib import Path
from typing import Any


TASK_ID = "S33-OPS-02"
RECIPE_VERSION = "1.0"
REQUIREMENT_IDS = ("AC-1", "AC-2", "TC-1", "TC-2", "TC-3", "TC-4", "TC-5", "TC-6")
REQUIREMENT_OUTPUTS = REQUIREMENT_IDS[:6]
REQUIREMENT_OUTPUT_FILES = {requirement: f".tmp/{TASK_ID}/{requirement.lower()}-output.txt" for requirement in REQUIREMENT_IDS}
EVIDENCE_BASES = (
    "models-reviewer",
    "implementer-distribution",
    "integration-models-reviewer",
    "integration-implementer-distribution",
    "health-flip",
    "health-flip-negative",
)
HISTORICAL_ARCHIVE = "historical-archive"
RELOCATION_DIRECTORY = "relocated-pre-base-clean-1786992180796459000-61265"
C3_BASE_BLOB_DIRECTORY = "c3-base-blobs"
RELOCATION_MANIFEST = "relocation-manifest.json"
INCOMPLETE_ARCHIVE_DIRECTORY = "incomplete-active-runs-1786992230203328000-64826-1786992241474326000-65887"
ARCHIVE_GIT_COMMITS = {
    "c3e3db9124bdbc91cf7caa37803c6cc79ee6ae66",
    "95abd5b89c79ee97eeaed2c93e8a80480f499819",
}
C3_BASES = (
    "models-reviewer",
    "implementer-distribution",
    "integration-models-reviewer",
    "integration-implementer-distribution",
)
EXPECTED_MODES = {
    "AC-1": ("models-reviewer", "models-reviewer"),
    "AC-2": ("implementer-distribution", "implementer-distribution"),
    "TC-1": ("models-reviewer", "models-reviewer"),
    "TC-2": ("models-reviewer", "models-reviewer"),
    "TC-3": ("health-flip", "health-flip"),
    "TC-4": ("implementer-distribution", "implementer-distribution"),
}
STOCK_INPUTS = (
    "ac-1-output.txt",
    "ac-2-output.txt",
    "lint-output.txt",
    "tc-1-output.txt",
    "tc-2-output.txt",
    "tc-3-output.txt",
    "tc-4-output.txt",
    "tc-5-output.txt",
    "tc-6-output.txt",
    "test-output.txt",
    "typecheck-output.txt",
)
EXPECTED_GATE_COMMANDS = {
    "TC-5": "PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/sprint33-ops-02-router-capacity.test.ts",
    "TC-6": "python3 ~/Projects/brain/tools/test-reality/test_reality.py .tmp/S33-OPS-02/reality-spec.json",
}
FOCUSED_TEST_SOURCE = "tests/integration/sprint33-ops-02-router-capacity.test.ts"
BACKEND_URLS = {
    "inference1": "http://inference1.tail011a51.ts.net:8003/v1",
    "inference2": "http://inference2.tail011a51.ts.net:8003/v1",
}


def fail(message: str) -> "NoReturn":
    raise SystemExit(f"stamp-raw-references: {message}")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def regular_file(path: Path, root: Path, label: str, *, allow_empty: bool = True) -> tuple[Path, int]:
    absolute = path.absolute()
    root_absolute = root.absolute()
    try:
        if os.path.commonpath((str(root_absolute), str(absolute))) != str(root_absolute):
            fail(f"{label} escapes evidence root: {path}")
    except ValueError:
        fail(f"{label} has incompatible path roots: {path}")
    try:
        info = absolute.lstat()
    except FileNotFoundError:
        fail(f"{label} is missing: {path}")
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        fail(f"{label} is not a non-symlink regular file: {path}")
    canonical = absolute.resolve(strict=True)
    if canonical != absolute:
        fail(f"{label} physically escapes or redirects: {path}")
    if not allow_empty and info.st_size < 1:
        fail(f"{label} is empty: {path}")
    return absolute, info.st_size


def relative_path(raw: str, root: Path, label: str) -> tuple[str, Path]:
    if not isinstance(raw, str) or not raw.strip() or os.path.isabs(raw):
        fail(f"{label} is not a relative path: {raw!r}")
    raw = raw[2:] if raw.startswith("./") else raw
    task_prefix = f".tmp/{TASK_ID}/"
    candidate = raw[len(task_prefix) :] if raw.startswith(task_prefix) else raw
    parts = Path(candidate).parts
    if not parts or ".." in parts:
        fail(f"{label} contains traversal: {raw!r}")
    path = root.joinpath(*parts)
    absolute, _ = regular_file(path, root, label)
    return Path(*parts).as_posix(), absolute


def run_directory(raw: str, root: Path, label: str) -> tuple[str, Path]:
    if not isinstance(raw, str) or not raw.strip() or os.path.isabs(raw):
        fail(f"{label} is not a relative path: {raw!r}")
    raw = raw[2:] if raw.startswith("./") else raw
    task_prefix = f".tmp/{TASK_ID}/"
    candidate = raw[len(task_prefix) :] if raw.startswith(task_prefix) else raw
    parts = Path(candidate).parts
    if not parts or ".." in parts:
        fail(f"{label} contains traversal: {raw!r}")
    path = root.joinpath(*parts).absolute()
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        fail(f"{label} is not a nonsymlink directory: {raw!r}")
    if path.resolve(strict=True) != path or path.parent.name != "runs":
        fail(f"{label} is not an exact immutable run directory: {raw!r}")
    return Path(*parts).as_posix(), path


def load_json(path: Path, root: Path, label: str) -> Any:
    absolute, _ = regular_file(path, root, label, allow_empty=False)
    try:
        return json.loads(absolute.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        fail(f"{label} is not valid JSON: {error}")


def final_json_line(path: Path, root: Path, label: str) -> dict[str, Any]:
    absolute, _ = regular_file(path, root, label, allow_empty=False)
    lines = [line.strip() for line in absolute.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not lines:
        fail(f"{label} has no JSON line")
    try:
        value = json.loads(lines[-1])
    except json.JSONDecodeError as error:
        fail(f"{label} final line is not JSON: {error}")
    if not isinstance(value, dict):
        fail(f"{label} final JSON line is not an object")
    return value


def collect_artifacts(value: Any, root: Path, label: str, run_dir: Path) -> list[dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}

    def visit(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("exists") is True and isinstance(node.get("path"), str) and not isinstance(node.get("byte_length"), bool) and isinstance(node.get("byte_length"), (int, float)):
                if int(node["byte_length"]) != node["byte_length"] or node["byte_length"] < 0:
                    fail(f"{label} contains an invalid byte_length: {node}")
                rel, absolute = relative_path(node["path"], root, f"{label} artifact")
                try:
                    if os.path.commonpath((str(run_dir), str(absolute))) != str(run_dir):
                        fail(f"{label} artifact escapes its exact emitted run directory: {rel}")
                except ValueError:
                    fail(f"{label} artifact has incompatible path roots: {rel}")
                info = absolute.lstat()
                if stat.S_ISDIR(info.st_mode):
                    return
                if info.st_size != int(node["byte_length"]):
                    fail(f"{label} artifact byte_length mismatch: {rel}")
                item = {"path": rel, "exists": True, "byte_length": info.st_size, "sha256": sha256(absolute)}
                prior = found.get(rel)
                if prior is not None and prior != item:
                    fail(f"{label} binds one path inconsistently: {rel}")
                found[rel] = item
                if rel.endswith(".receipt.json"):
                    try:
                        receipt = json.loads(absolute.read_text(encoding="utf-8"))
                    except json.JSONDecodeError as error:
                        fail(f"{label} capture receipt is not valid JSON: {error}")
                    if not isinstance(receipt, dict) or not isinstance(receipt.get("kind"), str) or not receipt["kind"]:
                        fail(f"{label} capture receipt has no kind: {rel}")
                    raw_rel, raw_absolute = relative_path(receipt.get("raw_path"), root, f"{label} receipt raw_path")
                    try:
                        if os.path.commonpath((str(run_dir), str(raw_absolute))) != str(run_dir):
                            fail(f"{label} receipt raw_path escapes its exact emitted run directory: {raw_rel}")
                    except ValueError:
                        fail(f"{label} receipt raw_path has incompatible path roots: {raw_rel}")
                    raw_info = raw_absolute.lstat()
                    receipt_size = receipt.get("byte_length")
                    receipt_hash = receipt.get("sha256")
                    if receipt.get("exists") is not True or isinstance(receipt_size, bool) or not isinstance(receipt_size, int) or receipt_size < 0 or raw_info.st_size != receipt_size:
                        fail(f"{label} capture receipt byte_length is not bound to raw bytes: {rel}")
                    if not isinstance(receipt_hash, str) or receipt_hash != sha256(raw_absolute):
                        fail(f"{label} capture receipt SHA-256 does not match raw bytes: {rel}")
                    raw_item = {"path": raw_rel, "exists": True, "byte_length": raw_info.st_size, "sha256": receipt_hash}
                    prior_raw = found.get(raw_rel)
                    if prior_raw is not None and prior_raw != raw_item:
                        fail(f"{label} receipt binds one raw path inconsistently: {raw_rel}")
                    found[raw_rel] = raw_item
            for child in node.values():
                visit(child)
        elif isinstance(node, list):
            for child in node:
                visit(child)

    visit(value)
    return [found[path] for path in sorted(found)]


def derive_tests(root: Path) -> dict[str, Any]:
    path = root / "test-output.txt"
    absolute, _ = regular_file(path, root, "test output", allow_empty=False)
    text = absolute.read_text(encoding="utf-8")
    if "EXIT_CODE:0" not in text:
        fail("test output does not prove exit code 0")
    match = re.search(r"Test Files\s+(\d+) passed \| (\d+) skipped", text)
    tests = re.search(r"Tests\s+(\d+) passed \| (\d+) skipped", text)
    if not match or not tests:
        fail("test output does not contain the expected real Vitest counts")
    return {
        "required": True,
        "command": "pnpm test:unit",
        "exit_code": 0,
        "output_file": ".tmp/S33-OPS-02/test-output.txt",
        "derived_from": "test-output.txt",
        "observed": {
            "test_files_passed": int(match.group(1)),
            "test_files_skipped": int(match.group(2)),
            "tests_passed": int(tests.group(1)),
            "tests_skipped": int(tests.group(2)),
        },
    }


def validate_active_run(base_name: str, run: Path, root: Path) -> None:
    if run.is_symlink() or not run.is_dir():
        fail(f"active evidence run is not a real directory: {run}")
    if run.name.startswith("historical-"):
        fail(f"historical archive remains in active runs: {run}")
    outcome_files = [run / name for name in ("result.json", "failure.json") if (run / name).exists()]
    if len(outcome_files) != 1:
        fail(f"active run must contain exactly one result.json or failure.json: {run}")
    outcome = outcome_files[0]
    info = outcome.lstat()
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        fail(f"active run outcome is not a direct nonsymlink manifest: {outcome}")
    payload = load_json(outcome, root, f"active run outcome {run.name}")
    if payload.get("run_id") != run.name:
        fail(f"active run outcome run_id does not match directory: {outcome}")
    run_rel, _ = run_directory(payload.get("run_dir"), root, f"active run outcome {run.name} run_dir")
    if run_rel != f"{base_name}/runs/{run.name}":
        fail(f"active run outcome run_dir does not match directory: {outcome}")
    manifest = payload.get("artifact_manifest")
    if not isinstance(manifest, dict) or not manifest:
        fail(f"active run outcome has no artifact manifest: {outcome}")
    if not collect_artifacts(payload, root, f"active run outcome {run.name}", run):
        fail(f"active run outcome has no hashable artifacts: {outcome}")


def validate_archive_and_base_shape(root: Path) -> None:
    """Reject historical payloads in active run trees and polluted bases."""
    for base_name in EVIDENCE_BASES:
        base = root / base_name
        if not base.is_dir() or base.is_symlink():
            fail(f"evidence base is not a real directory: {base_name}")
        direct = sorted(child.name for child in base.iterdir())
        if direct != ["runs"]:
            fail(f"evidence base is polluted: {base_name} direct children={direct}")
        runs = base / "runs"
        if runs.is_symlink() or not runs.is_dir():
            fail(f"evidence runs is not a real directory: {base_name}")
        for run in runs.iterdir():
            validate_active_run(base_name, run, root)
    archive = root / HISTORICAL_ARCHIVE
    if archive.is_symlink() or not archive.is_dir():
        fail("historical archive is not a real directory")
    direct = sorted(child.name for child in archive.iterdir())
    expected_archive = sorted((C3_BASE_BLOB_DIRECTORY, RELOCATION_DIRECTORY, RELOCATION_MANIFEST, INCOMPLETE_ARCHIVE_DIRECTORY))
    if direct != expected_archive:
        fail(f"historical archive bases are incomplete: {direct}")
    c3_blobs = archive / C3_BASE_BLOB_DIRECTORY
    if c3_blobs.is_symlink() or not c3_blobs.is_dir():
        fail("c3 base blob archive is not a real directory")
    if sorted(child.name for child in c3_blobs.iterdir()) != sorted(C3_BASES):
        fail("c3 base blob archive has an unexpected base set")
    for base_name in C3_BASES:
        base = c3_blobs / base_name
        if base.is_symlink() or not base.is_dir():
            fail(f"c3 base blob archive is not a real directory: {base_name}")
        for child in base.rglob("*"):
            info = child.lstat()
            if stat.S_ISLNK(info.st_mode) or not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode)):
                fail(f"c3 base blob archive contains an unsafe entry: {child}")
    relocated = archive / RELOCATION_DIRECTORY
    if relocated.is_symlink() or not relocated.is_dir():
        fail("relocated evidence archive is not a real directory")
    if sorted(child.name for child in relocated.iterdir()) != sorted(EVIDENCE_BASES):
        fail("relocated evidence archive has an unexpected base set")
    for base_name in EVIDENCE_BASES:
        base = relocated / base_name
        entries = list(base.iterdir()) if base.is_dir() and not base.is_symlink() else []
        if base.is_symlink() or not base.is_dir() or len(entries) != 1 or entries[0].is_symlink() or not entries[0].is_dir():
            fail(f"relocated evidence archive is malformed: {base_name}")
        for child in entries[0].rglob("*"):
            info = child.lstat()
            if stat.S_ISLNK(info.st_mode) or not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode)):
                fail(f"relocated evidence archive contains an unsafe entry: {child}")
    incomplete = archive / INCOMPLETE_ARCHIVE_DIRECTORY
    if incomplete.is_symlink() or not incomplete.is_dir() or sorted(child.name for child in incomplete.iterdir()) != ["models-reviewer"]:
        fail("incomplete active-run archive has an unexpected layout")
    incomplete_base = incomplete / "models-reviewer"
    for child in incomplete_base.rglob("*"):
        info = child.lstat()
        if stat.S_ISLNK(info.st_mode) or not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode)):
            fail(f"incomplete active-run archive contains an unsafe entry: {child}")
    manifest_path = archive / RELOCATION_MANIFEST
    manifest = load_json(manifest_path, root, "relocation manifest")
    if manifest.get("task_id") != TASK_ID or manifest.get("manifest_version") != "2.0":
        fail("relocation manifest has an unexpected identity")
    entries = manifest.get("entries")
    if not isinstance(entries, list) or not entries:
        fail("relocation manifest has no entries")
    seen_sources: set[str] = set()
    seen_archives: set[str] = set()
    origin_counts: dict[str, int] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            fail("relocation manifest contains a malformed entry")
        source = entry.get("source_path")
        archive_path = entry.get("archive_path")
        origin = entry.get("origin")
        if not isinstance(source, str) or not re.fullmatch(rf"\.tmp/{TASK_ID}/.+", source) or entry.get("original_path") != source:
            fail(f"relocation manifest source/original path is invalid: {source!r}")
        if not isinstance(archive_path, str) or not archive_path.startswith(f"{HISTORICAL_ARCHIVE}/") or archive_path == f"{HISTORICAL_ARCHIVE}/{RELOCATION_MANIFEST}":
            fail(f"relocation manifest archive path is invalid: {archive_path!r}")
        if not isinstance(origin, str) or origin not in {"git_bound", "local_untracked_pre_relocation", "incomplete_active_run_relocation"}:
            fail(f"relocation manifest origin is invalid: {origin!r}")
        if source in seen_sources or archive_path in seen_archives:
            fail("relocation manifest contains duplicate paths")
        seen_sources.add(source)
        seen_archives.add(archive_path)
        origin_counts[origin] = origin_counts.get(origin, 0) + 1
        rel, absolute = relative_path(archive_path, root, "relocation manifest archive path")
        if rel != archive_path:
            fail("relocation manifest archive path is not canonical")
        _, size = regular_file(absolute, root, "relocation manifest archive blob")
        if entry.get("byte_length") != size or not isinstance(entry.get("sha256"), str) or entry["sha256"] != sha256(absolute):
            fail(f"relocation manifest hash/length mismatch: {archive_path}")
        parts = Path(archive_path).parts
        if origin == "git_bound":
            source_commit = entry.get("source_commit")
            source_blob = entry.get("source_blob")
            if source_commit not in ARCHIVE_GIT_COMMITS or not isinstance(source_blob, str) or not re.fullmatch(r"[0-9a-f]{40}", source_blob):
                fail(f"git-bound relocation entry lacks exact source commit/blob: {archive_path}")
            if parts[1] == C3_BASE_BLOB_DIRECTORY:
                expected_source = f".tmp/{TASK_ID}/" + Path(*parts[2:]).as_posix()
                if source_commit != "c3e3db9124bdbc91cf7caa37803c6cc79ee6ae66" or source != expected_source:
                    fail(f"c3 source mapping is not canonical: {source!r} -> {archive_path!r}")
            elif parts[1] == RELOCATION_DIRECTORY:
                if source_commit != "95abd5b89c79ee97eeaed2c93e8a80480f499819" or len(parts) < 5:
                    fail(f"tracked relocation source commit is invalid: {archive_path!r}")
                expected_source = f".tmp/{TASK_ID}/{parts[2]}/runs/{parts[3]}/" + Path(*parts[4:]).as_posix()
                if source != expected_source:
                    fail(f"tracked relocation source mapping is not canonical: {source!r} -> {archive_path!r}")
            else:
                fail(f"git-bound relocation archive path has unknown origin: {archive_path!r}")
        elif origin == "local_untracked_pre_relocation":
            if "source_commit" in entry or "source_blob" in entry or parts[1] != RELOCATION_DIRECTORY or len(parts) < 5:
                fail(f"local-untracked relocation entry has invalid provenance: {archive_path!r}")
            expected_source = f".tmp/{TASK_ID}/{parts[2]}/runs/{parts[3]}/" + Path(*parts[4:]).as_posix()
            if source != expected_source:
                fail(f"local-untracked relocation source mapping is not canonical: {source!r} -> {archive_path!r}")
        else:
            if "source_commit" in entry or "source_blob" in entry or parts[1] != INCOMPLETE_ARCHIVE_DIRECTORY or len(parts) < 5:
                fail(f"incomplete relocation entry has invalid provenance: {archive_path!r}")
            expected_source = f".tmp/{TASK_ID}/{parts[2]}/runs/{parts[3]}/" + Path(*parts[4:]).as_posix()
            if source != expected_source:
                fail(f"incomplete relocation source mapping is not canonical: {source!r} -> {archive_path!r}")
    if origin_counts != {"git_bound": 368, "local_untracked_pre_relocation": 70, "incomplete_active_run_relocation": 2}:
        fail(f"relocation manifest origin counts are incomplete: {origin_counts}")
    actual_archives: set[str] = set()
    for child in archive.rglob("*"):
        info = child.lstat()
        if stat.S_ISLNK(info.st_mode) or not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode)):
            fail(f"historical archive contains an unsafe entry: {child}")
        if stat.S_ISREG(info.st_mode) and child != manifest_path:
            actual_archives.add(child.relative_to(root).as_posix())
    if seen_archives != actual_archives:
        fail("relocation manifest does not cover exactly every archived file")


def focused_test_case_count(source_path: Path, repo_root: Path) -> int:
    absolute, _ = regular_file(source_path, repo_root, "focused integration test source", allow_empty=False)
    source = absolute.read_text(encoding="utf-8")
    count = 0
    index = 0
    state = "code"
    while index < len(source):
        char = source[index]
        next_char = source[index + 1] if index + 1 < len(source) else ""
        if state == "code":
            if char == "/" and next_char == "/":
                state = "line-comment"
                index += 2
                continue
            if char == "/" and next_char == "*":
                state = "block-comment"
                index += 2
                continue
            if char in ("'", '"', "`"):
                state = char
                index += 1
                continue
            if source.startswith("it", index):
                before = source[index - 1] if index else ""
                after_index = index + 2
                while after_index < len(source) and source[after_index].isspace():
                    after_index += 1
                if (not (before.isalnum() or before in "_$")) and after_index < len(source):
                    if source[after_index] == "(":
                        count += 1
                    elif source[after_index] == ".":
                        after_index += 1
                        while after_index < len(source) and (source[after_index].isalnum() or source[after_index] in "_$"):
                            after_index += 1
                        while after_index < len(source) and source[after_index].isspace():
                            after_index += 1
                        if after_index < len(source) and source[after_index] == "(":
                            count += 1
            index += 1
            continue
        if state == "line-comment":
            if char in "\r\n":
                state = "code"
            index += 1
            continue
        if state == "block-comment":
            if char == "*" and next_char == "/":
                state = "code"
                index += 2
            else:
                index += 1
            continue
        if char == "\\":
            index += 2
        elif char == state:
            state = "code"
            index += 1
        else:
            index += 1
    if count < 1:
        fail("focused integration test source declares no executable test cases")
    return count


def validate_gate_outputs(root: Path, by_id: dict[str, dict[str, Any]], repo_root: Path) -> tuple[int, str]:
    """Validate the two non-JSON gates before allowing any summary rewrite."""
    source_path = repo_root / FOCUSED_TEST_SOURCE
    expected_test_count = focused_test_case_count(source_path, repo_root)
    for requirement, expected_command in EXPECTED_GATE_COMMANDS.items():
        item = by_id[requirement]
        exit_code = item.get("exit_code")
        if isinstance(exit_code, bool) or not isinstance(exit_code, int) or exit_code != 0:
            fail(f"{requirement} exit_code is not numeric zero")
        expected_file = REQUIREMENT_OUTPUT_FILES[requirement]
        if item.get("verify") != expected_command or item.get("output_file") != expected_file:
            fail(f"{requirement} command/output contract does not match the manifest")
        _, output_path = relative_path(expected_file, root, f"{requirement} output")
        text = output_path.read_text(encoding="utf-8")
        if re.search(r"(?m)^\s*(?:Test Files|Tests)\s+\d+\s+failed\b", text):
            fail(f"{requirement} output contains failed tests")
        if requirement == "TC-5":
            if not re.search(r"(?m)^\s*Test Files\s+1\s+passed\b", text):
                fail("TC-5 output does not prove one focused test file passed")
            tests_match = re.search(r"(?m)^[ \t]*Tests[ \t]+(\d+)[ \t]+passed(?:[ \t]*\|[ \t]*(\d+)[ \t]+skipped)?[ \t]+\(\d+\)[ \t]*$", text)
            if not tests_match:
                fail("TC-5 output does not report passed and skipped test counts")
            passed_count = int(tests_match.group(1))
            skipped_count = int(tests_match.group(2) or 0)
            if passed_count != expected_test_count or skipped_count != 0:
                fail(f"TC-5 output does not prove all {expected_test_count} source-declared tests passed without skips")
            continue
        try:
            value = json.loads(text)
        except json.JSONDecodeError as error:
            fail(f"TC-6 output is not valid JSON: {error}")
        if not isinstance(value, dict) or value.get("overall") != "REAL":
            fail("TC-6 output does not prove overall REAL test reality")
        acs = value.get("acs")
        if not isinstance(acs, list) or {item.get("ac_id") for item in acs if isinstance(item, dict)} != {"AC-1", "AC-2"} or len(acs) != 2:
            fail("TC-6 output does not contain exactly AC-1 and AC-2 reality rows")
        for ac in acs:
            if not isinstance(ac, dict) or ac.get("verdict") != "REAL" or ac.get("boundary_mocked") is not False or ac.get("watched_red") is not True or ac.get("boundary_matches") != [] or ac.get("unreadable_test_files") != []:
                fail("TC-6 output contains a non-REAL or incomplete AC reality row")
    return expected_test_count, sha256(source_path)


def derive_seeded(requirement: str, output: dict[str, Any]) -> str:
    run_id = output.get("run_id")
    if not isinstance(run_id, str) or not run_id:
        fail(f"{requirement} output has no run_id")
    if requirement == "AC-1":
        health = output.get("health")
        completion = output.get("reviewer_completion")
        if not isinstance(health, dict) or health.get("status") != "ok" or health.get("fleet_ready") is not True:
            fail("AC-1 output does not prove ready health")
        if output.get("laptop_models_has_both_roles") is not True or output.get("inference1_models_has_both_roles") is not True:
            fail("AC-1 output does not prove both model roles from both observers")
        if not isinstance(completion, dict) or completion.get("http_status") != 200 or completion.get("api_base") != "http://inference2.tail011a51.ts.net:8003/v1":
            fail("AC-1 output does not prove reviewer completion")
        return f"Fresh run {run_id} reports health status=ok, fleet_ready=True, both model roles from laptop and inference1, and reviewer HTTP 200 at {completion['api_base']}."
    if requirement == "AC-2":
        expected = (output.get("request_count"), output.get("tracked_request_count"), output.get("distinct_nonempty_body_count"))
        if expected[0:2] != (6, 6) or not isinstance(expected[2], int) or expected[2] < 2:
            fail("AC-2 output does not prove six tracked distributed requests")
        counts = output.get("backend_fresh_completion_counts")
        request_counts = output.get("backend_request_counts")
        expected_backends = set(BACKEND_URLS.values())
        if output.get("backend_headers") is None or set(output.get("backend_headers", [])) != expected_backends:
            fail("AC-2 output does not prove both exact backend headers")
        if not isinstance(request_counts, dict) or set(request_counts) != expected_backends or any(not isinstance(value, int) or value < 1 for value in request_counts.values()):
            fail("AC-2 output does not prove positive request counts for both exact backends")
        if not isinstance(counts, dict) or set(counts) != expected_backends or any(not isinstance(value, int) or value < request_counts[key] for key, value in counts.items()):
            fail("AC-2 output does not prove fresh completion counts")
        inference1_count = counts[BACKEND_URLS["inference1"]]
        inference2_count = counts[BACKEND_URLS["inference2"]]
        return f"Fresh run {run_id} reports request_count=6, tracked_request_count=6, distinct_nonempty_body_count={expected[2]}, and fresh completion counts inference1[{BACKEND_URLS['inference1']}]={inference1_count}, inference2[{BACKEND_URLS['inference2']}]={inference2_count}."
    fail(f"seeded value is not defined for {requirement}")


def atomic_write(path: Path, value: dict[str, Any], root: Path) -> None:
    absolute = path.absolute()
    regular_root = root.absolute()
    if os.path.commonpath((str(regular_root), str(absolute))) != str(regular_root):
        fail("summary path escapes evidence root")
    if os.path.lexists(absolute):
        info = absolute.lstat()
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
            fail("summary path is not a regular non-symlink file")
    temporary = absolute.with_name(f".{absolute.name}.tmp-{os.getpid()}")
    if os.path.lexists(temporary):
        fail("summary temporary path already exists")
    with temporary.open("x", encoding="utf-8") as handle:
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, absolute)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--summary", default=".tmp/S33-OPS-02/verification-summary.json")
    args = parser.parse_args()
    recipe = Path(__file__).absolute()
    root = recipe.parent
    repo_root = root.parent.parent
    validate_archive_and_base_shape(root)
    summary_path = Path(args.summary)
    if not summary_path.is_absolute():
        summary_path = Path.cwd() / summary_path
    summary = load_json(summary_path, root, "verification summary")
    if summary.get("task_id") != TASK_ID:
        fail(f"unexpected task_id: {summary.get('task_id')!r}")
    current_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root.parent.parent, text=True).strip()
    if not re.fullmatch(r"[0-9a-f]{40}", current_sha):
        fail("git HEAD is not a full commit SHA")
    if summary.get("commit_sha") != current_sha:
        fail(f"summary commit_sha {summary.get('commit_sha')!r} does not match current HEAD {current_sha!r}")
    results = summary.get("requirement_results")
    if not isinstance(results, list) or len(results) != len(REQUIREMENT_IDS) or any(not isinstance(item, dict) for item in results) or [item.get("id") for item in results] != list(REQUIREMENT_IDS):
        fail("summary does not contain exactly the eight requirement results")
    by_id = {item["id"]: item for item in results}
    for requirement in REQUIREMENT_IDS:
        if by_id[requirement].get("output_file") != REQUIREMENT_OUTPUT_FILES[requirement]:
            fail(f"{requirement} output_file does not match the canonical requirement mapping")
    focused_test_count, focused_test_sha = validate_gate_outputs(root, by_id, repo_root)
    output_values: dict[str, dict[str, Any]] = {}
    raw_by_requirement: dict[str, list[dict[str, Any]]] = {}
    all_raw: dict[str, dict[str, Any]] = {}
    for requirement in REQUIREMENT_OUTPUTS:
        item = by_id[requirement]
        if item.get("exit_code") != 0:
            fail(f"{requirement} is not green")
        output_file = item.get("output_file")
        if not isinstance(output_file, str):
            fail(f"{requirement} has no output_file")
        _, output_path = relative_path(output_file, root, f"{requirement} output")
        output = final_json_line(output_path, root, f"{requirement} output")
        if output.get("ok") is not True:
            fail(f"{requirement} final output is not ok=true")
        expected_mode, expected_base = EXPECTED_MODES[requirement]
        if output.get("mode") != expected_mode:
            fail(f"{requirement} final output mode is not {expected_mode}")
        run_id = output.get("run_id")
        if not isinstance(run_id, str) or not run_id:
            fail(f"{requirement} output has no nonempty run_id")
        run_rel, run_dir = run_directory(output.get("run_dir"), root, f"{requirement} run_dir")
        expected_run_rel = f"{expected_base}/runs/{run_id}"
        if run_rel != expected_run_rel or run_dir.name != run_id:
            fail(f"{requirement} run_dir is not the exact expected immutable path")
        output_values[requirement] = output
        artifacts = collect_artifacts(output, root, requirement, run_dir)
        if not artifacts:
            fail(f"{requirement} has no hashable raw artifacts")
        raw_by_requirement[requirement] = artifacts
        for artifact in artifacts:
            all_raw[artifact["path"]] = artifact
    if len(all_raw) < 1:
        fail("no unique raw artifacts were derived from the final verifier outputs")
    for stock in STOCK_INPUTS:
        regular_file(root / stock, root, f"stock input {stock}")
    recipe_relative = recipe.relative_to(root).as_posix()
    recipe_hash = sha256(recipe)
    original = summary.get("generator")
    if not isinstance(original, dict):
        fail("summary generator is missing")
    original_harvest = original.get("original_harvest")
    if not isinstance(original_harvest, dict):
        original_harvest = {key: original.get(key) for key in ("tool", "version", "generated_at")}
    if original_harvest.get("tool") != "harvest-evidence.sh" or original_harvest.get("version") != "1.0" or not isinstance(original_harvest.get("generated_at"), str) or not original_harvest["generated_at"].strip():
        fail("original harvest identity is missing or not the stock harvest-evidence.sh/1.0 producer")
    generator = {
        "tool": "harvest-evidence.sh+stamp-raw-references.py",
        "version": f"harvest-evidence.sh/1.0+stamp-raw-references.py/{RECIPE_VERSION}",
        "generated_at": original.get("generated_at"),
        "inputs": [],
        "original_harvest": original_harvest,
        "postprocessor": {"path": recipe_relative, "version": RECIPE_VERSION, "sha256": recipe_hash},
        "focused_test_source": {
            "path": FOCUSED_TEST_SOURCE,
            "sha256": focused_test_sha,
            "declared_test_cases": focused_test_count,
        },
        "raw_artifact_hash_binding": {
            "algorithm": "sha256",
            "raw_artifact_count": len(all_raw),
            "requirements_bound": list(REQUIREMENT_OUTPUTS),
            "derived_from": "final JSON line artifact objects with exists=true, byte_length, and path",
            "postprocessor": recipe_relative,
        },
    }
    inputs = []
    for path in STOCK_INPUTS:
        absolute, _ = regular_file(root / path, root, f"stock input {path}")
        inputs.append({"path": path, "sha256": sha256(absolute)})
    inputs.extend({"path": path, "sha256": item["sha256"]} for path, item in sorted(all_raw.items()))
    inputs.append({"path": FOCUSED_TEST_SOURCE, "sha256": focused_test_sha})
    inputs.append({"path": recipe_relative, "sha256": recipe_hash})
    expected_inputs = len(STOCK_INPUTS) + len(all_raw) + 2
    if len(inputs) != expected_inputs or len({item["path"] for item in inputs}) != len(inputs):
        fail(f"generator input count does not equal stock + raw + recipe: {len(inputs)} != {expected_inputs}")
    generator["inputs"] = inputs
    summary["tests"] = derive_tests(root)
    for requirement in REQUIREMENT_OUTPUTS:
        item = by_id[requirement]
        output = output_values[requirement]
        item["raw_artifacts"] = raw_by_requirement[requirement]
        if requirement in ("AC-1", "AC-2"):
            item["seeded_value"] = derive_seeded(requirement, output)
            red = item.get("red_against_start_file")
            if not isinstance(red, str):
                fail(f"{requirement} red_against_start_file is missing")
            relative_path(red, root, f"{requirement} red_against_start_file")
            green = item.get("green_file")
            if not isinstance(green, str):
                fail(f"{requirement} green_file is missing")
            relative_path(green, root, f"{requirement} green_file")
    summary["generator"] = generator
    atomic_write(summary_path, summary, root)
    print(json.dumps({"task_id": TASK_ID, "summary": str(summary_path), "unique_raw_artifacts": len(all_raw), "generator_inputs": len(inputs), "recipe_sha256": recipe_hash}, sort_keys=True))


if __name__ == "__main__":
    main()
