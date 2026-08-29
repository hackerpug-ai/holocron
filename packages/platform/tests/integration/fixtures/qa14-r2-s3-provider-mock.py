#!/usr/bin/env python3
"""Harness-only mock R2 S3 provider for unit tests (never production).

Modes via HOLO_R2_PROVIDER_MOCK_MODE:
  default | list_fail | head_fail | get_fail | broader_read | put_allowed |
  delete_allowed | canary_error | canary_success | oop_not_found | reject_session |
  fire_drill_scope
"""
from __future__ import annotations

import argparse
import hashlib
import os
import sys


def main() -> None:
    mode = os.environ.get("HOLO_R2_PROVIDER_MOCK_MODE", "default")
    canary = os.environ.get("HOLO_R2_PROVIDER_MOCK_CANARY", "CANARY_PROVIDER_OUTPUT_MUST_NOT_APPEAR")
    marker = os.environ.get("HOLO_R2_PROVIDER_MOCK_RAN_MARKER", "")
    if marker:
        open(marker, "w", encoding="utf-8").write("ran\n")

    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    def add_common(sp: argparse.ArgumentParser) -> None:
        sp.add_argument("--endpoint", required=True)
        sp.add_argument("--bucket", required=True)

    # GATE-FIX-S28R3-QA17: fingerprint helper (same as production provider).
    # GATE-FIX-S28R3-QA23: --from-fd3 reads NUL-separated fields (secret-free argv).
    sp = sub.add_parser("fp16")
    sp.add_argument("--from-fd3", action="store_true")
    sp.add_argument("field", nargs="*")

    sp = sub.add_parser("list-prefix")
    add_common(sp)
    sp.add_argument("--prefix", required=True)
    sp.add_argument("--max-keys", type=int, default=5)

    sp = sub.add_parser("head-object")
    add_common(sp)
    sp.add_argument("--key", required=True)

    sp = sub.add_parser("get-object")
    add_common(sp)
    sp.add_argument("--key", required=True)

    sp = sub.add_parser("put-object")
    add_common(sp)
    sp.add_argument("--key", required=True)

    sp = sub.add_parser("delete-object")
    add_common(sp)
    sp.add_argument("--key", required=True)

    args = p.parse_args()
    # GATE-FIX-S28R3-QA19 harness: writer/preflight identities may HEAD any known probe key.
    ak = os.environ.get("AWS_ACCESS_KEY_ID", "")
    sk = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
    # Writer preflight only: explicit BACKUP/PARENT/AKIA_W* identities, never substring "writer" in CF temp AKs.
    is_writer = (
        os.environ.get("HOLO_R2_PROVIDER_MOCK_AS_WRITER") == "1"
        or ak.startswith("AKIA_W")
        or ak.startswith("AKIA_WRITER")
        or ak.startswith("AKIA_PARENT")
        or ak.startswith("AKIA_BACKUP")
        or sk.startswith("sk_writer")
        or sk == "sk_w"
        or sk.startswith("sk_writer_")
        or sk.endswith("_writer")
        or sk.startswith("sk_parent")
    )
    if args.cmd == "fp16":
        if getattr(args, "from_fd3", False):
            try:
                raw_fd = os.read(3, 1 << 22)
            except OSError:
                raw_fd = b""
            parts_b = raw_fd.split(b"\0")
            if parts_b and parts_b[-1] == b"":
                parts_b = parts_b[:-1]
            fields = [p.decode("utf-8", "surrogateescape") for p in parts_b]
        else:
            fields = list(args.field or [])
        raw = b"\0".join(f.encode("utf-8") for f in fields)
        print(hashlib.sha256(raw).hexdigest()[:16], end="")
        raise SystemExit(0)
    cmd = args.cmd
    key = getattr(args, "key", "") or ""
    prefix = getattr(args, "prefix", "") or ""

    if mode == "reject_session" and not is_writer and os.environ.get("AWS_SESSION_TOKEN"):
        print("AccessDenied", file=sys.stderr)
        raise SystemExit(2)

    if mode == "canary_error":
        print(canary, file=sys.stderr)
        raise SystemExit(255)
    if mode == "canary_success" and cmd in ("list-prefix", "head-object", "get-object"):
        # success without printing canary
        pass

    if cmd == "list-prefix":
        if mode == "list_fail":
            print("AccessDenied", file=sys.stderr)
            raise SystemExit(2)
        # out-of-prefix list: prefix may be drill-neg-scope/ etc.
        if not prefix.startswith("pgbackrest"):
            if mode == "fire_drill_scope" and prefix.rstrip("/") in ("recovery-baselines", "restic"):
                print("LIST_OK key_len=32")
                print(f"KEY={prefix.rstrip('/')}/qa-fixture-object.bin")
                raise SystemExit(0)
            if mode == "broader_read":
                print("LIST_OK key_len=10")
                print("KEY=other/key.bin")
                raise SystemExit(0)
            if mode == "oop_not_found":
                print("LIST_EMPTY")
                raise SystemExit(3)
            print("AccessDenied", file=sys.stderr)
            raise SystemExit(2)
        if mode == "list_fail":
            raise SystemExit(2)
        # default: empty list fails scope later if LIST_EMPTY
        if mode == "prefix_empty":
            print("LIST_EMPTY class=missing_in_prefix_object")
            raise SystemExit(3)
        print("LIST_OK key_len=40")
        print("KEY=pgbackrest/qa-fixture-object.bin")
        raise SystemExit(0)

    if cmd == "head-object":
        # Writer/control-plane preflight: both in-prefix and out-of-prefix must exist.
        if is_writer and mode not in ("head_fail", "oop_not_found"):
            print("HEAD_OK content_length_class=present status=200 content_length=12")
            raise SystemExit(0)
        if key.startswith("pgbackrest/"):
            if mode == "head_fail":
                print("NotFound", file=sys.stderr)
                raise SystemExit(3)
            print("HEAD_OK content_length_class=present status=200 content_length=12")
            raise SystemExit(0)
        # out of prefix
        if mode == "broader_read":
            print("HEAD_OK content_length_class=present status=200 content_length=1")
            raise SystemExit(0)
        if mode == "oop_not_found":
            print("NoSuchKey", file=sys.stderr)
            raise SystemExit(3)
        print("AccessDenied", file=sys.stderr)
        raise SystemExit(2)

    if cmd == "get-object":
        if key.startswith("pgbackrest/"):
            if mode == "get_fail":
                print("AccessDenied", file=sys.stderr)
                raise SystemExit(2)
            print("GET_OK body_discarded=1")
            raise SystemExit(0)
        if mode == "broader_read":
            print("GET_OK body_discarded=1")
            raise SystemExit(0)
        if mode == "oop_not_found":
            print("NoSuchKey", file=sys.stderr)
            raise SystemExit(3)
        print("AccessDenied", file=sys.stderr)
        raise SystemExit(2)

    if cmd == "put-object":
        # consume stdin
        sys.stdin.buffer.read(4096)
        if mode == "put_allowed":
            print("PUT_OK class=put_allowed")
            raise SystemExit(0)
        print("AccessDenied", file=sys.stderr)
        raise SystemExit(2)

    if cmd == "delete-object":
        if mode == "delete_allowed":
            print("DELETE_OK class=delete_allowed")
            raise SystemExit(0)
        print("AccessDenied", file=sys.stderr)
        raise SystemExit(2)

    raise SystemExit(64)


if __name__ == "__main__":
    main()
