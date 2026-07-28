REDHAT-FIX-S27-07 / F-7 post-fix gate evidence
================================================
alerts-http-captures.json — independent http.Server captures
  fields: method, url, headers, rawBody, receivedAt

Pre-fix baseline (MUST FAIL envelope jq):
  ../20260728T024819Z/alerts-received.json  (payload-only posts[] dump)

Oracle:
  jq -e '.[0].method and .[0].url and .[0].headers and .[0].rawBody and .[0].receivedAt' \
    alerts-http-captures.json

Negative control (mutation M1):
  stub postBackupAlert without fetch → receiver empty → promote/oracle fails
  See red-suite/m1-negative-control.json
