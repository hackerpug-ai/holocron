#!/usr/bin/env python3
"""
S31-FE-01 stall / keepalive / drop-after-headers origin for chat-path deadlines.

Binds a real HTTP listener (default 127.0.0.1:4599) that exercises client
deadlines without mocking fetch/XHR:

  --mode stall              Accept, write SSE headers, write 0 body bytes, hold socket
  --mode keepalive          SSE headers + `: keepalive\\n\\n` every 500ms, then 1 token
  --mode drop-after-headers Close each connection immediately after SSE headers
  --mode counter            GET /__connections returns JSON { "connections": N }

Also answers non-SSE chat-path routes (POST /api/chat-runs, GET status, cancel)
with the same accept-then-stall behaviour so AC-6 can bound every call site.
"""

from __future__ import annotations

import argparse
import json
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional
from urllib.parse import urlparse


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 4599

# Shared counters (process-global; one listener per harness run).
_connection_counter = 0
_counter_lock = threading.Lock()
_mode = "stall"
_keepalive_interval_s = 0.5
_keepalive_token_after_s = 4.2
_hold_open_s = 3600.0


def _bump_connection() -> int:
    global _connection_counter
    with _counter_lock:
        _connection_counter += 1
        return _connection_counter


def _read_connections() -> int:
    with _counter_lock:
        return _connection_counter


class StallHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        sys.stderr.write("[stall-sse-server] " + (fmt % args) + "\n")

    def _is_events_path(self) -> bool:
        path = urlparse(self.path).path
        return path.endswith("/events") or "/events" in path

    def _write_sse_headers(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

    def _write_json_headers(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

    def _stall_body(self) -> None:
        """Hold the socket open without writing body bytes (accept-then-stall)."""
        deadline = time.time() + _hold_open_s
        try:
            while time.time() < deadline:
                time.sleep(0.25)
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass

    def _handle_counter(self) -> None:
        body = json.dumps({"connections": _read_connections()}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _handle_options(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Authorization, Content-Type, Accept, Last-Event-ID",
        )
        self.end_headers()

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._handle_options()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path in ("/__connections", "/connections", "/health"):
            if path == "/health":
                body = b'{"ok":true}'
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            self._handle_counter()
            return

        n = _bump_connection()
        self.log_message("GET %s connection=%s mode=%s", self.path, n, _mode)

        if self._is_events_path():
            if _mode == "drop-after-headers":
                # Force Connection: close so the client observes end-of-stream
                # (HTTP/1.1 keep-alive would otherwise hang without a body).
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "close")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.close_connection = True
                try:
                    self.wfile.flush()
                    self.connection.shutdown(socket.SHUT_RDWR)
                except (BrokenPipeError, ConnectionResetError, OSError):
                    pass
                return

            if _mode == "keepalive":
                self._write_sse_headers()
                try:
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    return
                start = time.time()
                # Emit comment keepalives until token deadline, then one token event.
                while time.time() - start < _keepalive_token_after_s:
                    try:
                        self.wfile.write(b": keepalive\n\n")
                        self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError):
                        return
                    time.sleep(_keepalive_interval_s)
                token = (
                    b"id: 1\n"
                    b"event: token\n"
                    b'data: {"token":"late"}\n'
                    b"\n"
                )
                try:
                    self.wfile.write(token)
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    return
                # Hold briefly so the client can apply the token, then end.
                time.sleep(1.0)
                terminal = (
                    b"id: 2\n"
                    b"event: terminal\n"
                    b'data: {"status":"completed","text":"late"}\n'
                    b"\n"
                )
                try:
                    self.wfile.write(terminal)
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    pass
                return

            # stall (default): SSE headers then 0 body bytes, hold socket open.
            self._write_sse_headers()
            try:
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                return
            self._stall_body()
            return

        # Non-SSE GET (status hydrate / poll): accept TCP, never write response
        # headers so fetch() stays pending until the chat-path deadline aborts.
        self.close_connection = True
        self._stall_body()

    def do_POST(self) -> None:  # noqa: N802
        n = _bump_connection()
        self.log_message("POST %s connection=%s mode=%s", self.path, n, _mode)
        # Create + cancel: drain request body then hang without response headers
        # so the shared fetchWithChatDeadline AbortController can terminate.
        length = int(self.headers.get("Content-Length") or "0")
        if length > 0:
            try:
                _ = self.rfile.read(length)
            except (BrokenPipeError, ConnectionResetError, TimeoutError):
                return
        self.close_connection = True
        self._stall_body()


def serve(host: str, port: int) -> None:
    # Allow rapid restarts in harness loops.
    ThreadingHTTPServer.allow_reuse_address = True
    httpd = ThreadingHTTPServer((host, port), StallHandler)
    sys.stderr.write(
        f"[stall-sse-server] listening on http://{host}:{port} mode={_mode}\n"
    )
    sys.stderr.flush()
    try:
        httpd.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


def main(argv: Optional[list[str]] = None) -> int:
    global _mode, _keepalive_interval_s, _keepalive_token_after_s, _hold_open_s
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mode",
        choices=("stall", "keepalive", "drop-after-headers"),
        default="stall",
    )
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument(
        "--keepalive-interval-ms",
        type=int,
        default=500,
        help="keepalive comment period (keepalive mode)",
    )
    parser.add_argument(
        "--token-after-ms",
        type=int,
        default=4200,
        help="emit the late token after this many ms (keepalive mode)",
    )
    parser.add_argument(
        "--hold-open-s",
        type=float,
        default=3600.0,
        help="how long stall mode holds the socket",
    )
    args = parser.parse_args(argv)
    _mode = args.mode
    _keepalive_interval_s = max(0.05, args.keepalive_interval_ms / 1000.0)
    _keepalive_token_after_s = max(0.1, args.token_after_ms / 1000.0)
    _hold_open_s = max(1.0, float(args.hold_open_s))
    serve(args.host, args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
