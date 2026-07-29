#!/usr/bin/env bash
# GATE-FIX-S28R3-QA11 — PATH-injected aws stand-in for unit tests.
# Default: List succeeds; Put/Delete denied with AccessDenied (no credential echo).
# Modes via HOLO_AWS_MOCK_MODE:
#   default | put_allowed | delete_allowed | list_fail | canary_error
set -euo pipefail
MODE="${HOLO_AWS_MOCK_MODE:-default}"
CANARY="${HOLO_AWS_MOCK_CANARY:-CANARY_AWS_OUTPUT_MUST_NOT_APPEAR}"

# Parse rough subcommand
args=("$@")
joined="$*"

case "$MODE" in
  canary_error)
    echo "$CANARY" >&2
    exit 255
    ;;
  list_fail)
    if [[ "$*" == *" s3 ls "* ]] || [[ "$*" == s3\ ls* ]] || [[ "$1" == "s3" && "$2" == "ls" ]]; then
      echo "AccessDenied" >&2
      exit 1
    fi
    ;;
  put_allowed)
    if [[ "$*" == *" s3 cp "* ]] || [[ "$1" == "s3" && "$2" == "cp" ]]; then
      echo "upload: done"
      exit 0
    fi
    ;;
  delete_allowed)
    if [[ "$*" == *"delete-object"* ]]; then
      echo "{}"
      exit 0
    fi
    if [[ "$*" == *" s3 rm "* ]] || [[ "$1" == "s3" && "$2" == "rm" ]]; then
      echo "delete: s3://x/y"
      exit 0
    fi
    ;;
esac

if [[ "$1" == "s3" && "$2" == "ls" ]]; then
  echo "PRE pgbackrest/"
  exit 0
fi
if [[ "$1" == "s3" && "$2" == "cp" ]]; then
  echo "AccessDenied: put denied" >&2
  exit 1
fi
if [[ "$1" == "s3" && "$2" == "rm" ]]; then
  echo "AccessDenied" >&2
  exit 1
fi
if [[ "$1" == "s3api" && "$2" == "delete-object" ]]; then
  echo "An error occurred (AccessDenied) when calling the DeleteObject operation" >&2
  exit 254
fi
# Unknown aws commands: fail closed
echo "AccessDenied" >&2
exit 1
