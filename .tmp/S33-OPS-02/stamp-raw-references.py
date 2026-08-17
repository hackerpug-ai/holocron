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
REQUIREMENT_OUTPUTS = ("AC-1", "AC-2", "TC-1", "TC-2", "TC-3", "TC-4")
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
        expected_backends = {"http://inference1.tail011a51.ts.net:8003/v1", "http://inference2.tail011a51.ts.net:8003/v1"}
        if output.get("backend_headers") is None or set(output.get("backend_headers", [])) != expected_backends:
            fail("AC-2 output does not prove both exact backend headers")
        if not isinstance(request_counts, dict) or set(request_counts) != expected_backends or any(not isinstance(value, int) or value < 1 for value in request_counts.values()):
            fail("AC-2 output does not prove positive request counts for both exact backends")
        if not isinstance(counts, dict) or set(counts) != expected_backends or any(not isinstance(value, int) or value < request_counts[key] for key, value in counts.items()):
            fail("AC-2 output does not prove fresh completion counts")
        values = sorted(counts.values())
        return f"Fresh run {run_id} reports request_count=6, tracked_request_count=6, distinct_nonempty_body_count={expected[2]}, and fresh completion counts {values[0]} / {values[1]} for inference1/inference2."
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
    if not isinstance(results, list) or len(results) != 8 or any(not isinstance(item, dict) for item in results) or len({item.get("id") for item in results}) != 8 or {item.get("id") for item in results} != {"AC-1", "AC-2", "TC-1", "TC-2", "TC-3", "TC-4", "TC-5", "TC-6"}:
        fail("summary does not contain exactly the eight requirement results")
    by_id = {item["id"]: item for item in results}
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
    generator = {
        "tool": "harvest-evidence.sh+stamp-raw-references.py",
        "version": f"harvest-evidence.sh/1.0+stamp-raw-references.py/{RECIPE_VERSION}",
        "generated_at": original.get("generated_at"),
        "inputs": [],
        "original_harvest": original_harvest,
        "postprocessor": {"path": recipe_relative, "version": RECIPE_VERSION, "sha256": recipe_hash},
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
    inputs.append({"path": recipe_relative, "sha256": recipe_hash})
    expected_inputs = len(STOCK_INPUTS) + len(all_raw) + 1
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
