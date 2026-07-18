#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
exec bun "$ROOT/services/platform/src/cli/holo.ts" db:provision-nonprod "$@"
