#!/usr/bin/env python3
"""Canonical PostgreSQL connection identity for same-target rejection.

Treats postgres:// and postgresql:// as equivalent, maps omitted port to 5432
(default Postgres), lowercases host, and normalizes path. Never returns secrets
in a form that differs only by userinfo for equality checks when compare mode
strips userinfo (default for target equivalence).
"""
from __future__ import annotations

import re
import sys
from urllib.parse import unquote, urlparse


def canonical_pg_url(url: str, *, include_userinfo: bool = False) -> str:
    raw = (url or "").strip()
    if not raw:
        raise ValueError("empty url")
    # urlparse requires // for netloc; tolerate bare postgres:... rare forms
    u = urlparse(raw)
    scheme = (u.scheme or "postgresql").lower()
    if scheme in ("postgres", "postgresql"):
        scheme = "postgresql"
    else:
        scheme = scheme
    host = (u.hostname or "").lower()
    if not host:
        raise ValueError(f"no hostname in url: {raw[:40]}…")
    # Default Postgres port when omitted — critical for alias rejection
    port = u.port if u.port is not None else 5432
    path = u.path or ""
    if path and not path.startswith("/"):
        path = "/" + path
    # Collapse trailing slash differences on single-segment DB paths
    if path.endswith("/") and path != "/":
        path = path.rstrip("/")
    path = unquote(path)
    if include_userinfo and u.username:
        user = unquote(u.username)
        if u.password is not None:
            netloc = f"{user}:***@{host}:{port}"
        else:
            netloc = f"{user}@{host}:{port}"
    else:
        netloc = f"{host}:{port}"
    return f"{scheme}://{netloc}{path}"


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(
            "usage: canonical-pg-url.py <url> | equal <url_a> <url_b>",
            file=sys.stderr,
        )
        return 2
    if argv[1] == "equal":
        if len(argv) != 4:
            print("usage: canonical-pg-url.py equal <url_a> <url_b>", file=sys.stderr)
            return 2
        try:
            a = canonical_pg_url(argv[2])
            b = canonical_pg_url(argv[3])
        except ValueError as e:
            print(f"error: {e}", file=sys.stderr)
            return 2
        print("equal" if a == b else "distinct")
        print(a)
        print(b)
        return 0 if a != b else 1  # exit 1 means SAME target (for shell checks)
    try:
        print(canonical_pg_url(argv[1]))
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
