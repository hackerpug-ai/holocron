#!/usr/bin/env bash
set -euo pipefail

WT="/Users/inference1/Projects/holocron/.kb-run-sprint/worktrees/GATE-FIX-S26-03"
ROOT="/Users/inference1/Projects/holocron"
LOCK="/tmp/holocron-maestro-sim-C79BF38C.lock"
EVID="$WT/.tmp/GATE-FIX-S26-03"
DEVICE="C79BF38C-D353-46A2-A1ED-CCA6D68E1B04"

mkdir -p "$EVID"
cd "$WT"

exec 200>"$LOCK"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) GATE-FIX-S26-03 waiting for lock" | tee -a "$EVID/lock.log"
flock -x 200
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) GATE-FIX-S26-03 acquired lock" | tee -a "$EVID/lock.log"

for i in $(seq 1 60); do
  if pgrep -f 'maestro.cli.AppKt' >/dev/null 2>&1; then
    echo "wait other maestro $i"
    sleep 5
  else
    break
  fi
done

if ! pgrep -f 'maestro.cli.AppKt' >/dev/null 2>&1; then
  pkill -f maestro-driver 2>/dev/null || true
  pkill -f 'xcodebuild test-without-building' 2>/dev/null || true
  sleep 2
fi

(
  cd "$ROOT"
  export DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod
  bun services/platform/src/cli/holo.ts seed:e2e --reset
) 2>&1 | tee "$EVID/seed-e2e-reset.txt" | tail -20

xcrun simctl terminate "$DEVICE" com.holocron.app 2>/dev/null || true
sleep 2

export MAESTRO_APP_ID=com.holocron.app
export MAESTRO_METRO_URL=http://127.0.0.1:8081

set +e
maestro test --device "$DEVICE" .maestro/gate/step-5-idempotent.yaml 2>&1 | tee "$EVID/AC-1-green.txt"
m=${PIPESTATUS[0]}
set -e
echo "MAESTRO_EXIT:$m" | tee -a "$EVID/lock.log"

(
  cd "$ROOT"
  export DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod
  bun services/platform/src/cli/holo.ts verify:blob --last
) 2>&1 | tee "$EVID/AC-2-verify-blob.txt"
v=$?
echo "VERIFY_EXIT:$v" | tee -a "$EVID/lock.log"

LATEST=$(ls -td /Users/inference1/.maestro/tests/*/ | head -1)
echo "LATEST=$LATEST" | tee -a "$EVID/lock.log"
cp -f "$LATEST"/*.png "$EVID/" 2>/dev/null || true
cp -f "$LATEST"/commands*.json "$EVID/" 2>/dev/null || true
ls -la "$EVID" | head -30

echo "--- AC-1 summary ---"
rg -n 'upload-success|COMPLETED|FAILED|Element not|Execution' "$EVID/AC-1-green.txt" | tail -40 || true
echo "--- AC-2 ---"
cat "$EVID/AC-2-verify-blob.txt"

exit "$m"
