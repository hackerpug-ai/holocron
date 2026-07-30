#!/usr/bin/env python3
# GATE-FIX-S28R3-QA23 / GATE-FIX-S28R3-QA24 — secret-free intermediate argv launcher.
#
# Reads NUL-separated KEY=VAL pairs from FD 3, then os.execve(cmd, argv, env).
# Secrets must never appear on this process's argv; only on FD 3 / final env.
# GATE-FIX-S28R3-QA24: fail closed on unreadable / empty / malformed FD 3 —
# never execve with a silently altered credential environment.
#
# Usage:
#   exec 3< <(printf '%s\0' "PATH=/usr/bin:/bin" "SECRET=..." )
#   /usr/bin/python3 -E -s scripts/lib/exec-env-from-fd.py -- /abs/cmd [args...]
from __future__ import annotations

import os
import re
import sys

_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


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
    except OSError as e:
        print(
            f"error: GATE-FIX-S28R3-QA24 exec-env-from-fd FD 3 unreadable: {e}",
            file=sys.stderr,
        )
        sys.exit(2)
    if not raw:
        print(
            "error: GATE-FIX-S28R3-QA24 exec-env-from-fd FD 3 empty (refuse silent empty env)",
            file=sys.stderr,
        )
        sys.exit(2)
    # GATE-FIX-S28R3-QA25: require terminating NUL on the stream. Reject truncated or
    # trailing-malformed records (unterminated final assignment would silently execve
    # with a partial credential environment).
    if not raw.endswith(b"\0"):
        print(
            "error: GATE-FIX-S28R3-QA25 exec-env-from-fd FD 3 missing terminating NUL (truncated/malformed)",
            file=sys.stderr,
        )
        sys.exit(2)
    # split yields a final empty element when stream ends with NUL — drop it.
    items = raw.split(b"\0")
    if items and items[-1] == b"":
        items = items[:-1]
    if not items:
        print(
            "error: GATE-FIX-S28R3-QA24 exec-env-from-fd FD 3 has no assignments",
            file=sys.stderr,
        )
        sys.exit(2)
    env: dict[str, str] = {}
    for item in items:
        if not item:
            print(
                "error: GATE-FIX-S28R3-QA24 exec-env-from-fd empty assignment record",
                file=sys.stderr,
            )
            sys.exit(2)
        if b"=" not in item:
            print(
                "error: GATE-FIX-S28R3-QA24 exec-env-from-fd malformed assignment (missing =)",
                file=sys.stderr,
            )
            sys.exit(2)
        key_b, val_b = item.split(b"=", 1)
        try:
            key = key_b.decode("utf-8")
        except UnicodeDecodeError:
            print(
                "error: GATE-FIX-S28R3-QA24 exec-env-from-fd key is not valid UTF-8",
                file=sys.stderr,
            )
            sys.exit(2)
        if not key or not _KEY_RE.match(key):
            print(
                "error: GATE-FIX-S28R3-QA24 exec-env-from-fd invalid env key",
                file=sys.stderr,
            )
            sys.exit(2)
        env[key] = val_b.decode("utf-8", "surrogateescape")
    if not env:
        print(
            "error: GATE-FIX-S28R3-QA24 exec-env-from-fd produced empty env (refuse)",
            file=sys.stderr,
        )
        sys.exit(2)
    try:
        os.execve(cmd, args, env)
    except OSError as e:
        print(f"error: GATE-FIX-S28R3-QA23 execve failed: {e}", file=sys.stderr)
        sys.exit(127)


if __name__ == "__main__":
    main()
