#!/usr/bin/env python3
# GATE-FIX-S28R3-QA24 — mint temporary R2 object-read-only credentials.
#
# Authorization token arrives ONLY via environment (CF_API_TOKEN), never argv.
# argv is fixed: absolute python + this script path + optional flags.
# Prints HTTP status code to stdout; writes response body to MINT_RESP path.
from __future__ import annotations

import os
import sys
import urllib.error
import urllib.request


def main() -> None:
    token = os.environ.get("CF_API_TOKEN") or ""
    account = os.environ.get("CF_ACCOUNT_ID") or ""
    body = (os.environ.get("MINT_BODY") or "").encode("utf-8")
    resp_path = os.environ.get("MINT_RESP") or ""
    if not token or not account or not resp_path:
        print("000", end="")
        sys.exit(2)
    url = (
        f"https://api.cloudflare.com/client/v4/accounts/"
        f"{account}/r2/temp-access-credentials"
    )
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
            code = int(getattr(r, "status", 200) or 200)
    except urllib.error.HTTPError as e:
        data = e.read() if hasattr(e, "read") else b""
        code = int(e.code)
    except Exception:
        print("000", end="")
        sys.exit(2)
    try:
        with open(resp_path, "wb") as f:
            f.write(data)
    except OSError:
        print("000", end="")
        sys.exit(2)
    print(f"{code}", end="")
    sys.exit(0)


if __name__ == "__main__":
    main()
