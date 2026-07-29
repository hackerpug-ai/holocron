#!/usr/bin/env bash
# GATE-FIX-S28R3-QA13 — fixture aws for isolated test harness only (never production allowlist).
# Modes: default | put_allowed | delete_allowed | list_fail | prefix_empty | head_fail |
#        broader_read | canary_error | canary_success | oop_allowed
set -euo pipefail
MODE="${HOLO_AWS_MOCK_MODE:-default}"
CANARY="${HOLO_AWS_MOCK_CANARY:-CANARY_AWS_OUTPUT_MUST_NOT_APPEAR}"
PREFIX="pgbackrest"

if [[ -n "${HOLO_AWS_MOCK_RAN_MARKER:-}" ]]; then
  printf 'ran\n' >"${HOLO_AWS_MOCK_RAN_MARKER}"
fi

# Collect args (skip global flags)
args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --endpoint-url|--cli-connect-timeout|--cli-read-timeout|--region|--profile)
      shift 2 || true
      ;;
    --recursive|--no-sign-request)
      shift
      ;;
    *)
      args+=("$1")
      shift
      ;;
  esac
done
set -- "${args[@]}"

case "$MODE" in
  canary_error)
    echo "$CANARY" >&2
    exit 255
    ;;
  list_fail)
    if [[ "$1" == "s3" && "$2" == "ls" ]]; then
      echo "AccessDenied" >&2
      exit 1
    fi
    ;;
  prefix_empty)
    if [[ "$1" == "s3" && "$2" == "ls" ]]; then
      exit 0
    fi
    ;;
  head_fail)
    if [[ "$1" == "s3api" && "$2" == "head-object" ]]; then
      echo "Not Found" >&2
      exit 1
    fi
    ;;
  broader_read|oop_allowed)
    # out-of-prefix head succeeds → production must fail closed
    :
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

if [[ "$1" == "s3" && "$2" == "ls" ]]; then
  target="${3:-}"
  if [[ "$target" == *"${PREFIX}"* ]]; then
    echo "2024-01-01 00:00:00       12 ${PREFIX}/qa-fixture-object.bin"
    exit 0
  fi
  echo "PRE ${PREFIX}/"
  exit 0
fi

if [[ "$1" == "s3api" && "$2" == "head-object" ]]; then
  # parse --key
  key=""
  i=1
  while [[ $i -le $# ]]; do
    if [[ "${!i}" == "--key" ]]; then
      j=$((i+1))
      key="${!j:-}"
      break
    fi
    i=$((i+1))
  done
  if [[ "$key" == drill-neg-out-of-prefix/* || "$key" != ${PREFIX}/* ]]; then
    if [[ "$MODE" == "broader_read" || "$MODE" == "oop_allowed" ]]; then
      echo '{"ContentLength":1}'
      exit 0
    fi
    echo "An error occurred (AccessDenied) when calling the HeadObject operation" >&2
    exit 254
  fi
  echo '{"ContentLength":12,"ETag":"\"abc\""}'
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
echo "AccessDenied" >&2
exit 1
