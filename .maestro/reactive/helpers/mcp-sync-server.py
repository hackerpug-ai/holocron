#!/usr/bin/env python3
"""S-REACTIVE-03 timing + real MCP gateway helper for Maestro.

Calls the **real** platform Streamable HTTP MCP gateway `update_document`
(tools/call → Postgres documents row). Never mocks the write.

Endpoints:
  GET  /health
  GET  /reset                 — clear timing samples (start of journey)
  GET  /update?title=&documentId=  — real MCP update_document; records t0 (ms)
  GET  /mark-visible?title=   — app reflected title; records t1 + duration_ms
  GET  /p95                   — compute p95 over samples; 200 if p95<=SLO else 500
  GET  /samples               — raw timing dump (debug)

Env:
  PLATFORM_URL   default http://127.0.0.1:4111
  HOLO_KEY_MCP | MCP_API_KEY  bearer for /mcp (default mcp-test)
  MCP_SYNC_PORT  default 8766
  SYNC_SLO_MS    default 5000
  MIN_SAMPLES    default 5
  EVIDENCE_DIR   optional; writes timings.json for file_artifact evidence
"""

from __future__ import annotations

import json
import math
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

PLATFORM = os.environ.get("PLATFORM_URL", "http://127.0.0.1:4111").rstrip("/")
MCP_KEY = (
    os.environ.get("HOLO_KEY_MCP")
    or os.environ.get("MCP_API_KEY")
    or "mcp-test"
)
PORT = int(os.environ.get("MCP_SYNC_PORT", "8766"))
SLO_MS = int(os.environ.get("SYNC_SLO_MS", "5000"))
MIN_SAMPLES = int(os.environ.get("MIN_SAMPLES", "5"))
DEFAULT_DOC = os.environ.get(
    "SYNC_DOCUMENT_ID", "00000000-0000-4000-8000-b00000000011"
)
EVIDENCE_DIR = os.environ.get("EVIDENCE_DIR", "")

# In-flight and completed samples (module state for the Maestro process window).
pending: dict[str, int] = {}  # title -> t0_ms
samples: list[dict[str, Any]] = []


def _percentile_nearest_rank(values: list[float], p: float) -> float:
    """Nearest-rank percentile (inclusive). p in (0, 1]."""
    if not values:
        raise ValueError("percentile requires >=1 sample")
    ordered = sorted(values)
    n = len(ordered)
    rank = max(1, int(math.ceil(p * n)))
    return float(ordered[rank - 1])


def _persist() -> None:
    if not EVIDENCE_DIR:
        return
    try:
        os.makedirs(EVIDENCE_DIR, exist_ok=True)
        path = os.path.join(EVIDENCE_DIR, "timings.json")
        durations = [float(s["duration_ms"]) for s in samples]
        payload = {
            "samples": samples,
            "n": len(samples),
            "slo_ms": SLO_MS,
            "p95_ms": _percentile_nearest_rank(durations, 0.95) if durations else None,
        }
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2)
            fh.write("\n")
    except OSError:
        pass


def call_mcp_update_document(document_id: str, title: str) -> dict[str, Any]:
    """Real MCP gateway tools/call for update_document (no mock/stub)."""
    body = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": int(time.time() * 1000) % 1_000_000_000,
            "method": "tools/call",
            "params": {
                "name": "update_document",
                "arguments": {"documentId": document_id, "title": title},
            },
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{PLATFORM}/mcp",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {MCP_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8")
            status = resp.status
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"MCP HTTP {err.code}: {raw[:400]}") from err
    except urllib.error.URLError as err:
        raise RuntimeError(f"MCP unreachable at {PLATFORM}/mcp: {err}") from err

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as err:
        raise RuntimeError(f"MCP non-JSON status={status}: {raw[:400]}") from err

    result = payload.get("result") or {}
    if result.get("isError"):
        raise RuntimeError(f"MCP tool error: {raw[:400]}")
    if payload.get("error"):
        raise RuntimeError(f"MCP rpc error: {raw[:400]}")
    return {"http_status": status, "payload": payload}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        try:
            if path == "/health":
                self._json(200, {"ok": True, "platform": PLATFORM, "slo_ms": SLO_MS})
                return

            if path == "/reset":
                pending.clear()
                samples.clear()
                _persist()
                self._json(200, {"ok": True, "reset": True})
                return

            if path == "/update":
                title = (qs.get("title") or [""])[0]
                document_id = (qs.get("documentId") or [DEFAULT_DOC])[0]
                if not title:
                    self._json(400, {"ok": False, "error": "title required"})
                    return
                if not document_id:
                    self._json(400, {"ok": False, "error": "documentId required"})
                    return
                # Real MCP write first, then stamp t0 as write-complete wall clock.
                mcp = call_mcp_update_document(document_id, title)
                t0 = int(time.time() * 1000)
                pending[title] = t0
                self._json(
                    200,
                    {
                        "ok": True,
                        "documentId": document_id,
                        "title": title,
                        "t0_ms": t0,
                        "mcp": "update_document",
                        "mcp_http_status": mcp["http_status"],
                    },
                )
                return

            if path == "/mark-visible":
                title = (qs.get("title") or [""])[0]
                if not title:
                    self._json(400, {"ok": False, "error": "title required"})
                    return
                t0 = pending.pop(title, None)
                t1 = int(time.time() * 1000)
                if t0 is None:
                    self._json(
                        400,
                        {
                            "ok": False,
                            "error": f"no pending t0 for title={title!r}",
                            "pending": list(pending.keys()),
                        },
                    )
                    return
                duration = t1 - t0
                sample = {
                    "title": title,
                    "t0_ms": t0,
                    "t1_ms": t1,
                    "duration_ms": duration,
                }
                samples.append(sample)
                _persist()
                self._json(200, {"ok": True, **sample, "n": len(samples)})
                return

            if path == "/samples":
                self._json(200, {"ok": True, "samples": samples, "n": len(samples)})
                return

            if path == "/p95":
                n = len(samples)
                if n < MIN_SAMPLES:
                    self._json(
                        500,
                        {
                            "ok": False,
                            "error": f"need>={MIN_SAMPLES} samples for p95, have {n}",
                            "n": n,
                            "min_samples": MIN_SAMPLES,
                            "samples": samples,
                        },
                    )
                    return
                durations = [float(s["duration_ms"]) for s in samples]
                p95 = _percentile_nearest_rank(durations, 0.95)
                passed = p95 <= SLO_MS
                body = {
                    "ok": passed,
                    "p95_ms": p95,
                    "slo_ms": SLO_MS,
                    "n": n,
                    "durations_ms": durations,
                    "percentile": "nearest-rank-p95",
                    "assert": f"p95_ms <= {SLO_MS}",
                }
                _persist()
                self._json(200 if passed else 500, body)
                return

            self._json(404, {"ok": False, "error": "not found"})
        except Exception as exc:  # noqa: BLE001 — surface to Maestro
            self._json(500, {"ok": False, "error": str(exc)})

    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A003
        return

    def _json(self, code: int, body: dict[str, Any]) -> None:
        raw = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


if __name__ == "__main__":
    print(
        f"mcp-sync-server listening 127.0.0.1:{PORT} platform={PLATFORM} slo_ms={SLO_MS}",
        flush=True,
    )
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
