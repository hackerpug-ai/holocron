#!/usr/bin/env bash
set -euo pipefail

# Compatibility entrypoint for operators who start from the nonprod deploy
# directory. The verifier owns argument validation, unique namespace creation,
# cleanup, live probes, and JSON evidence; this file intentionally contains no
# alternate provisioning path.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
case "${MK6_NEGATIVE_DEPENDENCY:-}" in
  ''|zero|core-matrix) ;;
  *)
    printf '{"ready":false,"status":"blocked","error":"MK6_NEGATIVE_DEPENDENCY must be empty, zero, or core-matrix"}\n'
    exit 2
    ;;
esac
exec bash "$ROOT/scripts/verify-mk6-live-dependencies.sh" "$@"
