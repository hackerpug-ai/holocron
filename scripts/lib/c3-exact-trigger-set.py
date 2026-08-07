#!/usr/bin/env python3
"""C-3 exact two-trigger set oracle (RH-S30-33).

REQUIRED = {data_plane_ponr_reject_mutation, data_plane_ponr_reject_truncate}

PASS iff:
  - unique(disabled_trigger) == REQUIRED (no duplicates/extras)
  - len(cases) == 2
  - each refused && probe_rc != 0
  - when evidence_root provided: disable-<name>/exit.code nonzero
  - complementary D/O evidence when stderr/triggers available

Usage:
  python3 scripts/lib/c3-exact-trigger-set.py <report.json> [evidence_root]
  python3 scripts/lib/c3-exact-trigger-set.py --json-cases '<cases-json>' [evidence_root]
Exit 0 = ok, 1 = fail, 2 = usage/error.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REQUIRED = frozenset(
    {
        "data_plane_ponr_reject_mutation",
        "data_plane_ponr_reject_truncate",
    }
)


def evaluate(report: dict, evidence_root: Path | None = None) -> dict:
    errors: list[str] = []
    cases = report.get("one_trigger_missing_cases") or report.get("cases") or []
    if not isinstance(cases, list):
        return {"ok": False, "errors": ["cases not a list"], "required": sorted(REQUIRED)}

    names = [str(c.get("disabled_trigger") or "") for c in cases]
    unique = set(names)
    if len(cases) != 2:
        errors.append(f"len(cases)={len(cases)} != 2")
    if len(names) != len(unique):
        errors.append(f"duplicate disabled_trigger values: {names}")
    if unique != REQUIRED:
        errors.append(
            f"disabled_trigger set {sorted(unique)} != REQUIRED {sorted(REQUIRED)}"
        )
    for i, c in enumerate(cases):
        name = str(c.get("disabled_trigger") or "")
        if not c.get("refused"):
            errors.append(f"case[{i}] {name}: refused not true")
        rc = int(c.get("probe_rc") or 0)
        if rc == 0:
            errors.append(f"case[{i}] {name}: probe_rc==0 (must be nonzero)")

        if evidence_root is not None:
            case_dir = evidence_root / f"disable-{name}"
            exit_path = case_dir / "exit.code"
            if not exit_path.is_file():
                errors.append(f"case[{i}] missing raw {exit_path.name} under disable-{name}/")
            else:
                try:
                    exit_rc = int(exit_path.read_text().strip() or "0")
                except ValueError:
                    exit_rc = 0
                    errors.append(f"case[{i}] exit.code unparseable")
                if exit_rc == 0:
                    errors.append(f"case[{i}] raw exit.code==0 (must be nonzero)")
            # Complementary D/O: disabled trigger must appear as D; other as O
            # Prefer structured fields; else scrape stderr/stdout.
            do = c.get("complementary_do") or {}
            disabled_state = do.get("disabled_tgenabled") or c.get("disabled_tgenabled")
            other_state = do.get("other_tgenabled") or c.get("other_tgenabled")
            stderr = ""
            for rel in ("stderr.txt", "stdout.txt"):
                p = case_dir / rel
                if p.is_file():
                    stderr += p.read_text(errors="replace") + "\n"
            # Also accept trig JSON in report before/after if present on case
            if not disabled_state or not other_state:
                # Look for patterns like: data_plane_ponr_reject_mutation|D
                for tg in REQUIRED:
                    m = re.search(
                        rf"{re.escape(tg)}\|([DOA])\b",
                        stderr,
                        re.I,
                    )
                    if m:
                        st = m.group(1).upper()
                        if tg == name:
                            disabled_state = disabled_state or st
                        else:
                            other_state = other_state or st
                # pg_trigger style rows in JSON fragments
                for tg in REQUIRED:
                    m = re.search(
                        rf'"tgname"\s*:\s*"{re.escape(tg)}"[^}}]*"tgenabled"\s*:\s*"([DOA])"',
                        stderr,
                        re.I | re.S,
                    )
                    if m:
                        st = m.group(1).upper()
                        if tg == name:
                            disabled_state = disabled_state or st
                        else:
                            other_state = other_state or st
            if disabled_state != "D":
                errors.append(
                    f"case[{i}] {name}: disabled trigger tgenabled must be D, got {disabled_state!r}"
                )
            if other_state != "O":
                errors.append(
                    f"case[{i}] {name}: other required trigger tgenabled must be O, got {other_state!r}"
                )

    return {
        "ok": len(errors) == 0,
        "errors": errors,
        "required": sorted(REQUIRED),
        "observed": names,
        "unique": sorted(unique),
        "len_cases": len(cases),
        "tool": "scripts/lib/c3-exact-trigger-set.py",
    }


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(__doc__, file=sys.stderr)
        return 2
    evidence_root: Path | None = None
    if argv[1] == "--json-cases":
        if len(argv) < 3:
            return 2
        cases = json.loads(argv[2])
        report = {"one_trigger_missing_cases": cases}
        if len(argv) >= 4:
            evidence_root = Path(argv[3])
    else:
        path = Path(argv[1])
        report = json.loads(path.read_text())
        if len(argv) >= 3:
            evidence_root = Path(argv[2])
        else:
            # default: sibling of report
            evidence_root = path.parent
    out = evaluate(report, evidence_root)
    print(json.dumps(out, indent=2))
    return 0 if out["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
