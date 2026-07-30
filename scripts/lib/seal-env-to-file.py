#!/usr/bin/env python3
# GATE-FIX-S28R3-QA25 — seal env values to a private file without values on argv.
#
# Reads values from the current process environment (inherited) and writes a
# sealed NUL-separated stream to OUT_PATH. Argv carries only paths + key names —
# never secret values.
#
# Usage:
#   seal-env-to-file.py --format=assignments OUT_PATH KEY1 KEY2 ...
#     → writes KEY=VAL\0 for each key (missing key → KEY=\0 empty value)
#   seal-env-to-file.py --format=values OUT_PATH KEY1 KEY2 ...
#     → writes VAL\0 for each key (missing key → empty field \0)
#
# OUT_PATH must already exist as a regular file (created by caller with mode 0600).
# This helper opens O_WRONLY|O_TRUNC and refuses to create new world-readable files.
from __future__ import annotations

import os
import re
import stat
import sys

_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _fail(msg: str, code: int = 2) -> None:
    print(f"error: GATE-FIX-S28R3-QA25 seal-env-to-file: {msg}", file=sys.stderr)
    sys.exit(code)


def main() -> None:
    args = sys.argv[1:]
    if len(args) < 3 or not args[0].startswith("--format="):
        _fail("usage: --format=assignments|values OUT_PATH KEY [KEY ...]")
    fmt = args[0].split("=", 1)[1]
    if fmt not in ("assignments", "values"):
        _fail(f"unknown format {fmt!r}")
    out_path = args[1]
    keys = args[2:]
    if not out_path.startswith("/"):
        _fail("OUT_PATH must be absolute")
    if not keys:
        _fail("at least one KEY required")
    for k in keys:
        if not k or not _KEY_RE.match(k):
            _fail(f"invalid env key name")
    try:
        st = os.lstat(out_path)
    except OSError as e:
        _fail(f"OUT_PATH lstat failed: {e}")
    if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode):
        _fail("OUT_PATH must be a regular non-symlink file")
    mode = stat.S_IMODE(st.st_mode)
    if mode & (stat.S_IRWXG | stat.S_IRWXO):
        _fail("OUT_PATH must not be group/world accessible")
    chunks: list[bytes] = []
    for k in keys:
        val = os.environ.get(k, "")
        # Values may be non-UTF8; use surrogateescape round-trip for raw bytes.
        if fmt == "assignments":
            chunks.append(f"{k}=".encode("utf-8") + val.encode("utf-8", "surrogateescape") + b"\0")
        else:
            chunks.append(val.encode("utf-8", "surrogateescape") + b"\0")
    raw = b"".join(chunks)
    if not raw.endswith(b"\0"):
        _fail("internal: sealed stream missing terminating NUL")
    try:
        fd = os.open(out_path, os.O_WRONLY | os.O_TRUNC | os.O_NOFOLLOW)
    except OSError as e:
        _fail(f"open OUT_PATH failed: {e}")
    try:
        # Best-effort restrict mode again after open.
        try:
            os.fchmod(fd, 0o600)
        except OSError:
            pass
        written = 0
        while written < len(raw):
            n = os.write(fd, raw[written:])
            if n <= 0:
                _fail("short write to OUT_PATH")
            written += n
        os.fsync(fd)
    finally:
        os.close(fd)
    sys.exit(0)


if __name__ == "__main__":
    main()
