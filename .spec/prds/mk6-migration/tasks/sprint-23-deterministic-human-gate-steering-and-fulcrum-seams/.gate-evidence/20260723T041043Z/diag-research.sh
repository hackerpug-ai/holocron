#!/usr/bin/env bash
set +e
cd /Users/inference1/Projects/holocron
export DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod
EV=/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-23-deterministic-human-gate-steering-and-fulcrum-seams/.gate-evidence/20260723T041043Z
bun services/platform/src/cli/holo.ts mission run research --goal "diag research probe" --idempotency-key diag-research-1 --json > "$EV/diag-research.stdout" 2> "$EV/diag-research.stderr"
echo "DIAG_EXIT=$?" >> "$EV/diag-research.stdout"
