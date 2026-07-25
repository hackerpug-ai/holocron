#!/usr/bin/env python3
"""S-REACTIVE-04: HTTP helper for Maestro runScript fleet restore mid-flow.

GET /health  → 200 ok
GET /restore → restore :4545 fleet proxy + restart platform with deterministic chat
"""
from __future__ import annotations

import os
import subprocess
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(os.environ.get("RESTORE_SERVER_PORT", "8766"))
FLEET_CMD = os.environ.get(
    "FLEET_PROXY_CMD",
    "/opt/homebrew/bin/bun /Users/inference1/Projects/rogueone/.tmp/local-loop-fleet-proxy.ts",
)
PLATFORM_ROOT = os.environ.get(
    "HOLO_ROOT",
    "/Users/inference1/Projects/holocron",
)
EVIDENCE = os.environ.get(
    "EVIDENCE_DIR",
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        ".tmp",
        "S-REACTIVE-04",
    ),
)


def sh(cmd: str) -> str:
    try:
        return subprocess.check_output(
            cmd, shell=True, stderr=subprocess.STDOUT, text=True, timeout=60
        )
    except subprocess.CalledProcessError as e:
        return e.output or str(e)
    except Exception as e:  # noqa: BLE001
        return str(e)


def port_listening(port: int) -> bool:
    out = sh(f"lsof -nP -iTCP:{port} -sTCP:LISTEN -t 2>/dev/null || true").strip()
    return bool(out)


def restore() -> dict:
    os.makedirs(EVIDENCE, exist_ok=True)
    log_path = os.path.join(EVIDENCE, "restore-fleet-server.log")

    # Fleet restore
    if not port_listening(4545):
        sh(f"nohup {FLEET_CMD} >>'{log_path}' 2>&1 &")
        for _ in range(40):
            if port_listening(4545):
                break
            time.sleep(0.25)

    # Platform restart with deterministic path for successful recovery send
    if port_listening(4111):
        sh("for p in $(lsof -nP -iTCP:4111 -sTCP:LISTEN -t 2>/dev/null); do kill $p 2>/dev/null || true; done")
        for _ in range(40):
            if not port_listening(4111):
                break
            time.sleep(0.15)

    database_url = os.environ.get(
        "DATABASE_URL", "postgres://127.0.0.1:5432/holocron_nonprod"
    )
    rn_key = os.environ.get("HOLO_KEY_RN", "replace-me-rn-key")
    # Prefer main holocron for service:up stability (launchd layout / deps).
    platform_cwd = os.environ.get("PLATFORM_SERVICE_ROOT", "/Users/inference1/Projects/holocron")
    sh(
        f"cd '{platform_cwd}' && "
        f"export DATABASE_URL='{database_url}' && "
        "export HOLO_E2E=1 HOLO_CHAT_DETERMINISTIC_STREAM=1 HOLO_CHAT_DETERMINISTIC_PACE_MS=400 && "
        f"export HOLO_KEY_RN='{rn_key}' HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test && "
        "export PORT=4111 FLEET_URL=http://127.0.0.1:4545/v1 && "
        f"export HOLO_ROOT='{platform_cwd}' && "
        "unset HOLO_CHAT_FLEET_ONLY || true && "
        f"nohup bun services/platform/src/cli/holo.ts service:up >>'{log_path}' 2>&1 &"
    )
    health_ok = False
    for _ in range(100):
        out = sh("curl -sf http://127.0.0.1:4111/health >/dev/null && echo ok || true")
        if "ok" in out:
            health_ok = True
            break
        time.sleep(0.3)

    return {
        "fleet": port_listening(4545),
        "platform_health": health_ok,
        "log": log_path,
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:  # quiet
        return

    def _json(self, code: int, body: str) -> None:
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.startswith("/health"):
            self._json(200, '{"ok":true}')
            return
        if self.path.startswith("/restore"):
            result = restore()
            body = (
                '{"ok":true,'
                f'"fleet":{str(result["fleet"]).lower()},'
                f'"platform_health":{str(result["platform_health"]).lower()}'
                "}"
            )
            self._json(200 if result["fleet"] and result["platform_health"] else 500, body)
            return
        self._json(404, '{"ok":false,"error":"not found"}')


if __name__ == "__main__":
    httpd = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"restore-fleet-server listening on http://127.0.0.1:{PORT}", flush=True)
    httpd.serve_forever()
