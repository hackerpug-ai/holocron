#!/usr/bin/env bash
set +e
cd /Users/inference1/Projects/holocron
export DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod
EV=/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-23-deterministic-human-gate-steering-and-fulcrum-seams/.gate-evidence/20260723T041043Z
echo "--- register test.sigkill ---"
bun services/platform/src/cli/holo.ts mission template:register services/platform/tests/fixtures/mission-engine/template-test.sigkill.json --json > "$EV/setup-register-sigkill.json" 2>&1
echo "register_exit=$?"
WIP_GOAL="Sprint-23 WIP1 same-subject suspended build"
echo "--- create ONE sigkill run (expect suspend) ---"
curl -sS --max-time 30 -X POST http://127.0.0.1:4111/api/missions -H "Authorization: Bearer rn-gate-s23" -H "Content-Type: application/json" -d "{\"templateKey\":\"test.sigkill\",\"goal\":\"$WIP_GOAL\",\"idempotencyKey\":\"human-gate-sigkill-1\",\"args\":{\"goal\":\"$WIP_GOAL\"}}" > "$EV/setup-create-sigkill.json" 2>&1
echo "create_exit=$?"
echo SETUP_SIGKILL_DONE >> "$EV/setup-create-sigkill.json"
