#!/usr/bin/env python3
# GATE-FIX-S28R3-QA23 — secret-free intermediate argv launcher.
#
# Reads NUL-separated KEY=VAL pairs from FD 3, then os.execve(cmd, argv, env).
# Secrets must never appear on this process's argv; only on FD 3 / final env.
#
# Usage:
#   exec 3< <(printf '%s\0' "PATH=/usr/bin:/bin" "SECRET=..." )
#   /usr/bin/python3 -E -s scripts/lib/exec-env-from-fd.py -- /abs/cmd [args...]
from __future__ import annotations

import os
import sys


def main() -> None:
    args = sys.argv[1:]
    if args and args[0] == "--":
        args = args[1:]
    if not args:
        print("error: GATE-FIX-S28R3-QA23 exec-env-from-fd missing command", file=sys.stderr)
        sys.exit(2)
    cmd = args[0]
    if not cmd.startswith("/"):
        print(
            "error: GATE-FIX-S28R3-QA23 command must be absolute path",
            file=sys.stderr,
        )
        sys.exit(2)
    try:
        raw = os.read(3, 1 << 22)
    except OSError:
        raw = b""
    env: dict[str, str] = {}
    for item in raw.split(b"\0"):
        if not item or b"=" not in item:
            continue
        key_b, val_b = item.split(b"=", 1)
        key = key_b.decode("utf-8", "surrogateescape")
        if not key:
            continue
        env[key] = val_b.decode("utf-8", "surrogateescape")
    try:
        os.execve(cmd, args, env)
    except OSError as e:
        print(f"error: GATE-FIX-S28R3-QA23 execve failed: {e}", file=sys.stderr)
        sys.exit(127)


if __name__ == "__main__":
    main()
