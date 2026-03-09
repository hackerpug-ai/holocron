#!/usr/bin/env bash
# Holocron MCP Server Launcher
cd "$(dirname "$0")"
exec /Users/justinrich/.bun/bin/bun dist/stdio.js
