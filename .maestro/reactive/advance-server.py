#!/usr/bin/env python3
"""HTTP helper for S-REACTIVE-02 Maestro research progress demos.

REDHAT-FIX-02 PATH-A: intermediate advances call the production writer via
  `holo research:advance-iteration` (services/platform/src/research/progress.ts).
Absolute SET (psql) is only used to reset/baseline a session to a starting
iteration (e.g. 1/5) — never as the sole path for 1→2→3 workflow advances.

GET /health
GET /advance/<current>/<max>  — reach current_iteration via production +1 steps
                                (baseline SET only when rewinding or first seed)
"""

from __future__ import annotations

import os
import subprocess
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

DB = os.environ.get("DATABASE_URL", "postgres://127.0.0.1:5432/holocron_nonprod")
SID = os.environ.get(
    "RESEARCH_SESSION_ID", "00000000-0000-4000-8000-e00000000033"
)
PORT = int(os.environ.get("ADVANCE_SERVER_PORT", "8765"))
ROOT = Path(__file__).resolve().parents[2]
HOLO = os.environ.get(
    "HOLO_CLI",
    str(ROOT / "services/platform/src/cli/holo.ts"),
)


def _psql(sql: str) -> str:
    return subprocess.check_output(
        ["psql", DB, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql],
        text=True,
    ).strip()


def _read_current() -> int | None:
    out = _psql(
        f"SELECT COALESCE(current_iteration::text, '') FROM research_sessions WHERE id='{SID}'"
    )
    if out == "":
        return None
    try:
        return int(out)
    except ValueError:
        return None


def _baseline(cur: int, mx: int) -> None:
    """Absolute SET for harness reset / initial seed only (not intermediate advances)."""
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


def _advance_via_production(steps: int = 1) -> None:
    """Call the PATH-A production CLI writer (not raw psql SET for +1)."""
    cmd = [
        "bun",
        HOLO,
        "research:advance-iteration",
        SID,
        str(steps),
        "--json",
    ]
    env = os.environ.copy()
    env.setdefault("DATABASE_URL", DB)
    subprocess.check_call(
        cmd,
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def reach_iteration(target: int, mx: int) -> None:
    """Reach target iteration using production +1 advances when possible."""
    current = _read_current()
    if current is None:
        # Session missing or null — baseline then advance if needed.
        start = max(1, min(target, mx))
        _baseline(1 if target > 1 else start, mx)
        current = _read_current() or 1

    if current == target:
        # Ensure max bounds even if iteration already matches.
        _baseline(target, mx)
        return

    if current > target:
        # Rewind only via harness baseline (production writer is fail-closed +1 only).
        _baseline(target, mx)
        return

    # Intermediate workflow advances: production PATH-A writer only.
    steps = target - current
    _advance_via_production(steps)


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
            reach_iteration(cur, mx)
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
