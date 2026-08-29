#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
exec bun "$ROOT/packages/platform/src/cli/holo.ts" db:provision-nonprod "$@"
