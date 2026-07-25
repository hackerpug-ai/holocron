#!/usr/bin/env bash
# @@GATE-META step=4 cmd_sha=24592cdb257dad86b9b71c968fbd44128ce0e6ded0af40fad5a0c89caef01903@@
# Literal command (byte-identical to gate-plan.json step.literal_cmd):
curl -sS -i -X POST http://127.0.0.1:4111/api/missions/019f8d2e-00db-7eda-8ef3-51ee6cd81018/steer -H 'Authorization: Bearer rn-gate-s23' -H 'Content-Type: application/json' -d '{"instruction":"Prioritize recent papers published in 2025 and 2026.","requestKey":"gate-step4-steer"}'
