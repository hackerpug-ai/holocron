#!/usr/bin/env bash
# @@GATE-META step=1 cmd_sha=6c890ec867a3e07a0ee7d62433dbd580248b95ee2f8c1d886ee98624b545883e@@
# Literal command (byte-identical to gate-plan.json step.literal_cmd):
curl -sS -i -X POST http://127.0.0.1:4111/api/missions/019f8d2d-2ef7-711b-bb40-df20ab9f27e4/verdicts -H 'Authorization: Bearer rn-gate-s23' -H 'Content-Type: application/json' -d '{"verdict":"kill","rationale":"Stop now, without a citation.","requestKey":"gate-step1-uncited-kill"}'
