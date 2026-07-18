# Invalidated evidence

Prior orchestrator smoke used constructs like:
  bun ... | tee /tmp/out; echo EXIT:$?
or
  out=$(bun ...); echo EXIT:$?  # OK when no pipe
or
  bun ... | tee file; echo EXIT:$?  # EXIT is tee's exit, not bun's

Those EXIT:0 values after deliberately-bad / invalid-config / deterministic fixtures
are NOT process-exit proof. This directory holds re-runs with:
  set -o pipefail
  bun ... 2>&1 | tee artifact
  ec=${PIPESTATUS[0]}
and without pipes:
  bun ... >artifact 2>&1; ec=$?
