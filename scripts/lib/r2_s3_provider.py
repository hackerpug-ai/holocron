#!/usr/bin/env python3
"""GATE-FIX-S28R3-QA14 — repository-owned Cloudflare R2 S3 provider (stdlib only).

Invoked only via absolute root-owned /usr/bin/python3. No aws CLI dependency.
Never prints credential values or object body content.

Commands (argv):
  list-prefix   --endpoint URL --bucket B --prefix P [--max-keys N]
  head-object   --endpoint URL --bucket B --key K
  get-object    --endpoint URL --bucket B --key K   # status only; body discarded
  put-object    --endpoint URL --bucket B --key K   # body from stdin (small probe)
  delete-object --endpoint URL --bucket B --key K

Exit codes:
  0 success
  2 AccessDenied / 403-class authorization denial
  3 NotFound / NoSuchKey / 404
  4 network/other provider error
  64 usage error

Env credentials (never logged):
  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN (optional)
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Mapping
from xml.etree import ElementTree as ET


def _die(msg: str, code: int) -> None:
    print(f"error: {msg}", file=sys.stderr)
    raise SystemExit(code)



def _reject_hostile_python_env() -> None:
    """GATE-FIX-S28R3-QA17: refuse attacker-controlled Python startup knobs."""
    hostile = (
        "PYTHONPATH",
        "PYTHONHOME",
        "PYTHONSTARTUP",
        "PYTHONSAFEPATH",
        "PYTHONUSERBASE",
        "PYTHONEXECUTABLE",
        "PYTHONWARNINGS",
    )
    for k in hostile:
        if os.environ.get(k):
            _die(f"refuses hostile Python env {k}", 64)


def _encode_s3_path(bucket: str, key: str | None = None) -> str:
    """Canonical URI path: /bucket or /bucket/key with / preserved, other bytes percent-encoded."""
    b = urllib.parse.quote(bucket, safe="")
    if key is None:
        return f"/{b}"
    # Encode each segment; preserve / separators per SigV4 S3 canonical URI rules.
    parts = key.split("/")
    enc = "/".join(urllib.parse.quote(seg, safe="-_.~") for seg in parts)
    return f"/{b}/{enc}"


def cmd_fp16(args: argparse.Namespace) -> None:
    """Hash NUL-separated fields to 16-hex fingerprint (no openssl)."""
    parts = args.field if args.field is not None else []
    raw = b"\0".join(p.encode("utf-8") for p in parts)
    print(hashlib.sha256(raw).hexdigest()[:16], end="")


def _creds() -> tuple[str, str, str]:
    ak = os.environ.get("AWS_ACCESS_KEY_ID") or ""
    sk = os.environ.get("AWS_SECRET_ACCESS_KEY") or ""
    st = os.environ.get("AWS_SESSION_TOKEN") or ""
    if not ak or not sk:
        _die("missing AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY", 64)
    return ak, sk, st


def _sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _sigv4_headers(
    *,
    method: str,
    endpoint: str,
    path: str,
    query: Mapping[str, str],
    payload: bytes,
    amz_headers: Mapping[str, str] | None = None,
) -> dict[str, str]:
    ak, sk, session = _creds()
    # endpoint like https://account.r2.cloudflarestorage.com
    parsed = urllib.parse.urlparse(endpoint)
    host = parsed.netloc
    if not host or parsed.scheme != "https":
        _die("endpoint must be https://host", 64)
    now = datetime.now(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    region = "auto"
    service = "s3"
    payload_hash = hashlib.sha256(payload).hexdigest()

    headers: dict[str, str] = {
        "host": host,
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amz_date,
    }
    if session:
        headers["x-amz-security-token"] = session
    if amz_headers:
        for k, v in amz_headers.items():
            headers[k.lower()] = v

    # Canonical query: sorted, encoded
    q_items = sorted((urllib.parse.quote(k, safe="-_.~"), urllib.parse.quote(v, safe="-_.~")) for k, v in query.items())
    canonical_query = "&".join(f"{k}={v}" for k, v in q_items)

    signed_header_keys = sorted(headers.keys())
    canonical_headers = "".join(f"{k}:{headers[k].strip()}\n" for k in signed_header_keys)
    signed_headers = ";".join(signed_header_keys)
    # path must already be fully URI-encoded with / preserved (see _encode_s3_path).
    canonical_uri = path if path.startswith("/") else f"/{path}"
    canonical_request = "\n".join(
        [
            method,
            canonical_uri,
            canonical_query,
            canonical_headers,
            signed_headers,
            payload_hash,
        ]
    )
    credential_scope = f"{date_stamp}/{region}/{service}/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )
    k_date = _sign(("AWS4" + sk).encode("utf-8"), date_stamp)
    k_region = _sign(k_date, region)
    k_service = _sign(k_region, service)
    k_signing = _sign(k_service, "aws4_request")
    signature = hmac.new(k_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    authorization = (
        f"AWS4-HMAC-SHA256 Credential={ak}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    out = {k: headers[k] for k in signed_header_keys if k != "host"}
    out["Authorization"] = authorization
    out["Host"] = host
    return out


def _classify_http_error(code: int, body: bytes) -> int:
    text = body[:800].decode("utf-8", errors="replace")
    low = text.lower()
    if code in (403, 401) or "accessdenied" in low or "access denied" in low or "forbidden" in low:
        return 2
    if code == 404 or "nosuchkey" in low or "not found" in low or "no such key" in low:
        return 3
    return 4


def _request(
    method: str,
    endpoint: str,
    path: str,
    query: Mapping[str, str] | None = None,
    payload: bytes = b"",
    amz_headers: Mapping[str, str] | None = None,
) -> tuple[int, bytes, dict[str, str]]:
    q = dict(query or {})
    headers = _sigv4_headers(
        method=method,
        endpoint=endpoint.rstrip("/"),
        path=path,
        query=q,
        payload=payload,
        amz_headers=amz_headers,
    )
    qs = urllib.parse.urlencode(q)
    url = endpoint.rstrip("/") + path + (f"?{qs}" if qs else "")
    req = urllib.request.Request(url, data=payload if method in ("PUT", "POST") else None, method=method)
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            # Object GET: discard body after status (never log content).
            # List/HEAD/other: retain small response for XML/status classification.
            if method == "GET" and "list-type" not in (query or {}):
                _ = resp.read(64)
                while resp.read(65536):
                    pass
                data = b""
            else:
                data = resp.read(2_000_000)
            return int(resp.status), data, dict(resp.headers.items())
    except urllib.error.HTTPError as e:
        body = e.read() if e.fp else b""
        return int(e.code), body, {}
    except Exception as e:
        print(f"error: network class={type(e).__name__}", file=sys.stderr)
        raise SystemExit(4) from e


def cmd_list_prefix(args: argparse.Namespace) -> None:
    prefix = args.prefix
    if not prefix.endswith("/") and prefix:
        prefix = prefix + "/"
    query = {
        "list-type": "2",
        "prefix": prefix,
        "max-keys": str(args.max_keys),
    }
    path = _encode_s3_path(args.bucket)
    code, body, _ = _request("GET", args.endpoint, path, query=query)
    if code != 200:
        raise SystemExit(_classify_http_error(code, body))
    # Parse first object key only (no content).
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        _die("list-prefix invalid xml", 4)
    ns = ""
    if root.tag.startswith("{"):
        ns = root.tag.split("}")[0] + "}"
    key = None
    for contents in root.findall(f".//{ns}Contents"):
        k_el = contents.find(f"{ns}Key")
        if k_el is not None and k_el.text and not k_el.text.endswith("/"):
            key = k_el.text
            break
    if not key:
        print("LIST_EMPTY class=missing_in_prefix_object")
        raise SystemExit(3)
    # Emit only non-secret metadata.
    print(f"LIST_OK key_len={len(key)}")
    # Machine field for callers that need the key (not a secret).
    print(f"KEY={key}")


def cmd_head_object(args: argparse.Namespace) -> None:
    path = _encode_s3_path(args.bucket, args.key)
    code, body, hdrs = _request("HEAD", args.endpoint, path)
    if code in (200, 204):
        cl = hdrs.get("Content-Length") or hdrs.get("content-length") or "?"
        print(f"HEAD_OK content_length_class=present status={code} content_length={cl}")
        raise SystemExit(0)
    raise SystemExit(_classify_http_error(code, body))


def cmd_get_object(args: argparse.Namespace) -> None:
    path = _encode_s3_path(args.bucket, args.key)
    code, body, _ = _request("GET", args.endpoint, path)
    if code == 200:
        print("GET_OK body_discarded=1")
        raise SystemExit(0)
    raise SystemExit(_classify_http_error(code, body))


def cmd_put_object(args: argparse.Namespace) -> None:
    payload = sys.stdin.buffer.read(4096)
    if not payload:
        payload = b"SACRIFICIAL_DRILL_NEG_QA14"
    path = _encode_s3_path(args.bucket, args.key)
    code, body, _ = _request(
        "PUT",
        args.endpoint,
        path,
        payload=payload,
        amz_headers={"content-type": "application/octet-stream"},
    )
    if code in (200, 201, 204):
        print("PUT_OK class=put_allowed")
        raise SystemExit(0)
    ec = _classify_http_error(code, body)
    if ec == 2:
        print(f"PUT_DENIED class=access_denied status={code}")
    raise SystemExit(ec)


def cmd_delete_object(args: argparse.Namespace) -> None:
    path = _encode_s3_path(args.bucket, args.key)
    code, body, _ = _request("DELETE", args.endpoint, path)
    # S3 often returns 204 even when Delete is allowed on missing keys.
    if code in (200, 204):
        print("DELETE_OK class=delete_allowed")
        raise SystemExit(0)
    ec = _classify_http_error(code, body)
    if ec == 2:
        print(f"DELETE_DENIED class=access_denied status={code}")
    raise SystemExit(ec)


def main(argv: list[str] | None = None) -> None:
    _reject_hostile_python_env()
    p = argparse.ArgumentParser(prog="r2_s3_provider")
    sub = p.add_subparsers(dest="cmd", required=True)

    def add_common(sp: argparse.ArgumentParser) -> None:
        sp.add_argument("--endpoint", required=True)
        sp.add_argument("--bucket", required=True)

    sp = sub.add_parser("fp16")
    sp.add_argument("field", nargs="*", help="fields hashed with NUL separators")
    sp.set_defaults(func=cmd_fp16)
    sp = sub.add_parser("list-prefix")
    add_common(sp)
    sp.add_argument("--prefix", required=True)
    sp.add_argument("--max-keys", type=int, default=5)
    sp.set_defaults(func=cmd_list_prefix)

    sp = sub.add_parser("head-object")
    add_common(sp)
    sp.add_argument("--key", required=True)
    sp.set_defaults(func=cmd_head_object)

    sp = sub.add_parser("get-object")
    add_common(sp)
    sp.add_argument("--key", required=True)
    sp.set_defaults(func=cmd_get_object)

    sp = sub.add_parser("put-object")
    add_common(sp)
    sp.add_argument("--key", required=True)
    sp.set_defaults(func=cmd_put_object)

    sp = sub.add_parser("delete-object")
    add_common(sp)
    sp.add_argument("--key", required=True)
    sp.set_defaults(func=cmd_delete_object)

    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
