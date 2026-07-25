#!/usr/bin/env python3
"""Tiny HTTP helper for S-REACTIVE-02 Maestro: advances research_sessions rows.

Simulates Sprint 17 engine Postgres writes so Zero WAL can prove live UI updates.
GET /health
GET /advance/<current>/<max>
"""

from __future__ import annotations

import os
import subprocess
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

DB = os.environ.get("DATABASE_URL", "postgres://127.0.0.1:5432/holocron_nonprod")
SID = os.environ.get(
    "RESEARCH_SESSION_ID", "00000000-0000-4000-8000-e00000000033"
)
PORT = int(os.environ.get("ADVANCE_SERVER_PORT", "8765"))


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        path = urllib.parse.urlparse(self.path).path
        parts = [p for p in path.strip("/").split("/") if p]
        if parts and parts[0] == "health":
            self._respond(200, b"ok")
            return
        if parts and parts[0] == "advance" and len(parts) >= 2:
            cur = int(parts[1])
            mx = int(parts[2]) if len(parts) > 2 else 5
            sql = (
                "UPDATE research_sessions SET "
                f"current_iteration={cur}, max_iterations={mx}, "
                f"status='running', updated_at=now() WHERE id='{SID}'"
            )
            subprocess.check_call(
                ["psql", DB, "-v", "ON_ERROR_STOP=1", "-c", sql],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            self._respond(200, b"ok")
            return
        self._respond(404, b"not found")

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        return

    def _respond(self, code: int, body: bytes) -> None:
        self.send_response(code)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
