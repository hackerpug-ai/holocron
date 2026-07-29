#!/usr/bin/env bash
# GATE-FIX-S28R3-QA11 — curl stand-in for mint path unit tests.
# Writes response body to -o path; HTTP code via -w.
set -euo pipefail
MODE="${HOLO_CURL_MOCK_MODE:-success}"
CANARY_AK="${HOLO_CURL_CANARY_AK:-CANARY_MINT_ACCESS_KEY_ID}"
CANARY_SK="${HOLO_CURL_CANARY_SK:-CANARY_MINT_SECRET_ACCESS_KEY}"
OUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) OUT="${2:-}"; shift 2 ;;
    -w) shift 2 ;;
    *) shift ;;
  esac
done
[[ -n "$OUT" ]] || exit 2
case "$MODE" in
  success)
    cat >"$OUT" <<EOF
{"success":true,"result":{"accessKeyId":"$CANARY_AK","secretAccessKey":"$CANARY_SK","sessionToken":"CANARY_SESSION_TOKEN"}}
EOF
    printf '200'
    ;;
  api_error)
    cat >"$OUT" <<EOF
{"success":false,"errors":[{"code":10000,"message":"CANARY_ERROR_MESSAGE_WITH_SECRET_${CANARY_SK}"}]}
EOF
    printf '400'
    ;;
  api_error_string)
    cat >"$OUT" <<EOF
{"success":false,"errors":["CANARY_STRING_ERROR_${CANARY_SK}"]}
EOF
    printf '403'
    ;;
  *)
    echo 'not-json-CANARY' >"$OUT"
    printf '500'
    ;;
esac
exit 0
