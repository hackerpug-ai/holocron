#!/usr/bin/env python3
"""Fail when an actual local credential value appears in committed gate evidence."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


def credential_values(path: Path) -> list[tuple[str, str]]:
    if not path.is_file():
        return []
    found: list[tuple[str, str]] = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        match = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?::|=)\s*(.*?)\s*$", line)
        if not match:
            continue
        key, raw = match.groups()
        if not re.search(
            r"(?:SECRET|TOKEN|PASSWORD|CIPHER|ACCESS_KEY|PRIVATE_KEY|API_KEY)", key, re.I
        ):
            continue
        value = raw.strip().strip("'\"")
        if len(value) >= 8 and not value.startswith("${"):
            found.append((key, value))
    return found


root = Path.cwd()
evidence = Path(sys.argv[1]).resolve()
sprint = evidence.parent.parent
sources = [Path(arg).resolve() for arg in sys.argv[2:]] or [
    root / ".env",
    root / "services/platform/config/secrets.yaml",
]
candidates: list[tuple[str, str]] = []
for source in sources:
    candidates.extend(credential_values(source))
candidates = list(dict.fromkeys(candidates))

targets = [p for p in evidence.rglob("*") if p.is_file() and p.name != Path(__file__).name]
targets.extend([sprint / "gate-results.json", sprint / "gate-verification.json", sprint / "GATE-RESULTS.md"])
changed = subprocess.run(
    ["git", "ls-files", "-m", "-o", "--exclude-standard", "-z"],
    cwd=root,
    check=True,
    capture_output=True,
).stdout
targets.extend(root / raw.decode() for raw in changed.split(b"\0") if raw)
targets = list(dict.fromkeys(targets))
violations: list[tuple[str, str]] = []
for target in targets:
    if not target.is_file():
        continue
    body = target.read_bytes()
    for key, value in candidates:
        if value.encode() in body:
            violations.append((key, str(target.relative_to(root))))

if violations:
    for key, target in sorted(set(violations)):
        print(f"credential_scan=fail key={key} target={target}")
    raise SystemExit(1)

print(
    f"credential_scan=pass source_files={sum(p.is_file() for p in sources)} "
    f"credential_values_checked={len(candidates)} evidence_files={len(targets)} values_not_logged=true"
)
