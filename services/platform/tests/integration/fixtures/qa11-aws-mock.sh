#!/usr/bin/env bash
# GATE-FIX-S28R3-QA11/12 — PATH/absolute aws stand-in for unit tests.
# Default: prefix List + Head succeed; Put/Delete denied (no credential echo).
# Modes via HOLO_AWS_MOCK_MODE:
#   default | put_allowed | delete_allowed | list_fail | prefix_empty | head_fail | canary_error | canary_success
set -euo pipefail
MODE="${HOLO_AWS_MOCK_MODE:-default}"
CANARY="${HOLO_AWS_MOCK_CANARY:-CANARY_AWS_OUTPUT_MUST_NOT_APPEAR}"
PREFIX="${R2_PGBACKREST_PREFIX:-${R2_RESTORE_OBJECT_PREFIX:-pgbackrest}}"
PREFIX="${PREFIX#/}"
PREFIX="${PREFIX%/}"

# Marker file if ever executed (for PATH-forge detection)
if [[ -n "${HOLO_AWS_MOCK_RAN_MARKER:-}" ]]; then
  printf 'ran\n' >"${HOLO_AWS_MOCK_RAN_MARKER}"
fi

case "$MODE" in
  canary_error)
    echo "$CANARY" >&2
    exit 255
    ;;
  canary_success)
    # success path still must not echo canary into captured streams used for classification
    :
    ;;
  list_fail)
    if [[ "$1" == "s3" && "$2" == "ls" ]]; then
      echo "AccessDenied" >&2
      exit 1
    fi
    ;;
  prefix_empty)
    if [[ "$1" == "s3" && "$2" == "ls" ]]; then
      # empty listing
      exit 0
    fi
    ;;
  head_fail)
    if [[ "$1" == "s3api" && "$2" == "head-object" ]]; then
      echo "Not Found" >&2
      exit 1
    fi
    ;;
  put_allowed)
    if [[ "$1" == "s3" && "$2" == "cp" ]]; then
      echo "upload: done"
      exit 0
    fi
    ;;
  delete_allowed)
    if [[ "$*" == *"delete-object"* ]]; then
      echo "{}"
      exit 0
    fi
    if [[ "$1" == "s3" && "$2" == "rm" ]]; then
      echo "delete: s3://x/y"
      exit 0
    fi
    ;;
esac

# s3 ls — prefix or bucket
if [[ "$1" == "s3" && "$2" == "ls" ]]; then
  target="${3:-}"
  # Prefer prefix listing response with a synthetic object key (no secret content).
  if [[ "$target" == *"${PREFIX}/"* ]] || [[ "$target" == */"${PREFIX}/" ]] || [[ "$target" == *"${PREFIX}" ]]; then
    echo "2024-01-01 00:00:00       12 ${PREFIX}/qa-fixture-object.bin"
    exit 0
  fi
  # bare bucket list still ok for legacy; return PRE only
  echo "PRE ${PREFIX}/"
  exit 0
fi

if [[ "$1" == "s3api" && "$2" == "head-object" ]]; then
  # success metadata only (no body)
  echo '{"ContentLength":12,"ETag":"\"abc\""}'
  exit 0
fi

if [[ "$1" == "s3" && "$2" == "cp" ]]; then
  if [[ "$MODE" == "canary_success" ]]; then
    echo "AccessDenied" >&2
    exit 1
  fi
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
echo "AccessDenied" >&2
exit 1
