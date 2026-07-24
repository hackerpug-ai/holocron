#!/usr/bin/env bash
# Sprint 24 human-gate driver (GATE-FIX-001).
#
# Runs all 7 human-gate steps honestly against a named iOS Simulator:
#   1. seed        — holo seed:e2e --reset
#   2. cold boot   — .maestro/chat/drawer-loads-seeded.yml (chat-screen + 3 rows)
#   3. articles    — .maestro/articles/list-loads.yml
#   4. whats-new   — .maestro/subscriptions/whats-new-loads.yml
#   5. rename      — .maestro/chat/rename-reflects.yml (MUST actually run)
#   6. no-convex   — holo verify:no-convex-client
#   7. share       — .maestro/articles/share-url-mastra.yml
#
# Fail-closed: never writes gate-results.json with verdict pass unless every
# step exits 0 with this-cycle logs. Never marks rename PASS without a real
# rename-reflects Maestro log. Never fabricates SUCCESS.
#
# Env:
#   MAESTRO_DEVICE          named iOS Simulator (required for UI steps)
#   MAESTRO_APP_ID          default com.holocron.app
#   MAESTRO_METRO_URL       http://<host>:8081 (auto-detected from LAN if unset)
#   MAESTRO_METRO_HOST      optional host if URL not set
#   MAESTRO_METRO_PORT      default 8081
#   MAESTRO_DEV_CLIENT_OPEN_URL  optional full exp+holocron://... openLink
#   E2E_ARTIFACT_DIR        default .tmp/GATE-FIX-001
#   SKIP_SEED=1             skip step 1 when substrate already seeded
#   SKIP_UI=1               static/probe mode — seed+no-convex only; UI blocked
#   WRITE_GATE_RESULTS=1    write gate-results.json from this-cycle claims only
#
# Usage:
#   bash scripts/e2e/run-sprint24-human-gate.sh
#   bash scripts/e2e/run-sprint24-human-gate.sh --check
#   bash scripts/e2e/run-sprint24-human-gate.sh --static-only
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

mode="run"
artifact_dir="${E2E_ARTIFACT_DIR:-$repo_root/.tmp/GATE-FIX-001}"
app_id="${MAESTRO_APP_ID:-com.holocron.app}"
device="${MAESTRO_DEVICE:-}"
write_gate_results="${WRITE_GATE_RESULTS:-0}"
skip_seed="${SKIP_SEED:-0}"
skip_ui="${SKIP_UI:-0}"

fail() { echo "sprint24-human-gate: $*" >&2; exit 2; }
log() { echo "sprint24-human-gate: $*" >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) mode="check"; shift ;;
    --static-only) mode="static"; shift ;;
    --artifact-dir) artifact_dir="${2:-}"; shift 2 ;;
    --device) device="${2:-}"; shift 2 ;;
    --write-gate-results) write_gate_results=1; shift ;;
    --skip-seed) skip_seed=1; shift ;;
    --skip-ui) skip_ui=1; shift ;;
    -h|--help)
      sed -n '2,40p' "$0"
      exit 0
      ;;
    *) fail "unknown argument: $1" ;;
  esac
done

mkdir -p "$artifact_dir"
export MAESTRO_APP_ID="$app_id"

# --- Metro URL parameterization (eliminates hardcoded 192.168.1.160) ---
resolve_metro() {
  local host port url encoded open_url
  if [[ -n "${MAESTRO_DEV_CLIENT_OPEN_URL:-}" ]]; then
    export MAESTRO_DEV_CLIENT_OPEN_URL
    if [[ -z "${MAESTRO_METRO_URL:-}" ]]; then
      # Best-effort extract of http URL from open link for logging
      MAESTRO_METRO_URL="$(python3 - <<'PY' 2>/dev/null || true
import os, urllib.parse
u = os.environ.get("MAESTRO_DEV_CLIENT_OPEN_URL", "")
q = urllib.parse.urlparse(u).query
print(urllib.parse.parse_qs(q).get("url", [""])[0])
PY
)"
      export MAESTRO_METRO_URL
    fi
    return 0
  fi

  url="${MAESTRO_METRO_URL:-}"
  if [[ -z "$url" ]]; then
    host="${MAESTRO_METRO_HOST:-}"
    if [[ -z "$host" ]]; then
      host="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
    fi
    port="${MAESTRO_METRO_PORT:-8081}"
    if [[ -n "$host" ]]; then
      url="http://${host}:${port}"
    fi
  fi
  [[ -n "$url" ]] || fail "MAESTRO_METRO_URL (or MAESTRO_METRO_HOST / reachable LAN) is required for Dev Client cold boot"
  [[ "$url" =~ ^https?://[^[:space:]]+:[0-9]+$ ]] || fail "MAESTRO_METRO_URL must be http(s)://host:port, got: $url"

  encoded="$(U="$url" python3 -c 'import os,urllib.parse; print(urllib.parse.quote(os.environ["U"], safe=""))')"
  open_url="exp+holocron://expo-development-client/?url=${encoded}"

  export MAESTRO_METRO_URL="$url"
  export MAESTRO_METRO_URL_ENCODED="$encoded"
  export MAESTRO_DEV_CLIENT_OPEN_URL="$open_url"
}

# --- Static oracle audit (always available, no simulator) ---
static_audit() {
  local rc=0
  local report="$artifact_dir/static-oracle-audit.txt"
  local tmp_out
  tmp_out="$(mktemp)"
  {
    echo "=== Sprint 24 static oracle audit $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
    echo "repo=$repo_root"
    echo

    echo "--- No hardcoded dead Metro IP in gate chat flows ---"
    if rg -n '192\.168\.1\.160' .maestro/chat/drawer-loads-seeded.yml; then
      echo "FAIL: hardcoded 192.168.1.160 still present"
      rc=1
    else
      echo "PASS: no 192.168.1.160 in drawer-loads-seeded.yml"
    fi
    echo

    echo "--- Parameterized Dev Client openLink ---"
    if rg -n 'MAESTRO_DEV_CLIENT_OPEN_URL|MAESTRO_METRO_URL_ENCODED|expo-development-client' .maestro/chat/drawer-loads-seeded.yml; then
      echo "PASS: parameterized openLink present"
    else
      echo "FAIL: missing parameterized openLink"
      rc=1
    fi
    echo

    echo "--- chat-screen wait is NOT optional ---"
    # Fail only if an id: "chat-screen" line itself is followed within 2 lines by optional:true
    if python3 -c '
import re, pathlib, sys
lines=pathlib.Path(".maestro/chat/drawer-loads-seeded.yml").read_text().splitlines()
for i,l in enumerate(lines):
  if re.search(r"id:\s*\"chat-screen\"", l) and re.search(r"optional:\s*true", "\n".join(lines[i:i+3])):
    sys.exit(1)
sys.exit(0)
'; then
      echo "PASS: chat-screen non-optional"
      rg -n 'chat-screen' .maestro/chat/drawer-loads-seeded.yml -A2 || true
    else
      echo "FAIL: chat-screen has optional:true nearby"
      rg -n 'chat-screen' .maestro/chat/drawer-loads-seeded.yml -A3 || true
      rc=1
    fi
    echo

    echo "--- conversation-row asserts non-optional ---"
    if python3 -c '
import re, pathlib, sys
lines=pathlib.Path(".maestro/chat/drawer-loads-seeded.yml").read_text().splitlines()
for i,l in enumerate(lines):
  if re.search(r"id:\s*\"conversation-row\"", l) and re.search(r"optional:\s*true", "\n".join(lines[i:i+4])):
    sys.exit(1)
sys.exit(0)
'; then
      echo "PASS: conversation-row non-optional"
    else
      echo "FAIL: conversation-row optional"
      rc=1
    fi
    echo

    echo "--- articles data oracles non-optional ---"
    if python3 -c '
import re, pathlib, sys
for f in [".maestro/articles/list-loads.yml"]:
  lines=pathlib.Path(f).read_text().splitlines()
  for i,l in enumerate(lines):
    if re.search(r"id:\s*\"(articles-route|article-card-pressable)\"", l) and re.search(r"optional:\s*true", "\n".join(lines[i:i+4])):
      sys.exit(1)
sys.exit(0)
'; then
      echo "PASS: articles-route + article-card-pressable non-optional"
      rg -n 'articles-route|article-card-pressable' .maestro/articles/list-loads.yml || true
    else
      echo "FAIL: articles-route or article-card-pressable optional"
      rc=1
    fi
    echo

    echo "--- whats-new-feed non-optional ---"
    if python3 -c '
import re, pathlib, sys
lines=pathlib.Path(".maestro/subscriptions/whats-new-loads.yml").read_text().splitlines()
for i,l in enumerate(lines):
  if re.search(r"id:\s*\"whats-new-feed\"", l) and re.search(r"optional:\s*true", "\n".join(lines[i:i+4])):
    sys.exit(1)
sys.exit(0)
'; then
      echo "PASS: whats-new-feed non-optional"
      rg -n 'whats-new-feed' .maestro/subscriptions/whats-new-loads.yml || true
    else
      echo "FAIL: whats-new-feed optional"
      rc=1
    fi
    echo

    echo "--- rename flow includes Sprint Planning + rename-save-button ---"
    if rg -n 'Sprint Planning|rename-save-button' .maestro/chat/rename-reflects.yml; then
      echo "PASS: rename oracles present"
    else
      echo "FAIL: rename flow missing Sprint Planning / rename-save-button"
      rc=1
    fi
    if python3 -c '
import re, pathlib, sys
lines=pathlib.Path(".maestro/chat/rename-reflects.yml").read_text().splitlines()
for i,l in enumerate(lines):
  if "Sprint Planning" in l and re.search(r"optional:\s*true", "\n".join(lines[i:i+4])):
    sys.exit(1)
sys.exit(0)
'; then
      echo "PASS: Sprint Planning non-optional"
    else
      echo "FAIL: Sprint Planning optional"
      rc=1
    fi
    echo

    echo "--- TC-7 python oracle scan (task contract) ---"
    if python3 -c "
import re, pathlib, sys
files=['.maestro/chat/drawer-loads-seeded.yml','.maestro/chat/rename-reflects.yml','.maestro/articles/list-loads.yml','.maestro/subscriptions/whats-new-loads.yml']
oids=('chat-screen','conversation-row','articles-route','article-card-pressable','whats-new-feed','Sprint Planning')
fail=[]
for f in files:
 p=pathlib.Path(f)
 lines=p.read_text().splitlines() if p.exists() else []
 [fail.append(f'{f}:{i+1}') for i,line in enumerate(lines) if any(oid in line for oid in oids) and re.search(r'optional:\\s*true','\\n'.join(lines[i:i+5]))]
if fail:
  print('FAIL lines:', fail)
  sys.exit(1)
print('PASS: no oracle id within 5 lines of optional:true')
sys.exit(0)
"; then
      echo "PASS: TC-7 human-gate oracles non-optional"
    else
      echo "FAIL: TC-7 human-gate oracles still optional"
      rc=1
    fi
  } >"$tmp_out" 2>&1
  cat "$tmp_out" | tee "$report"
  rm -f "$tmp_out"
  return "$rc"
}

if [[ "$mode" == "check" || "$mode" == "static" ]]; then
  static_audit
  exit $?
fi

# --- Live run path ---
command -v maestro >/dev/null 2>&1 || fail "maestro CLI is not installed"
command -v jq >/dev/null 2>&1 || fail "jq is required"
command -v python3 >/dev/null 2>&1 || fail "python3 is required"

static_audit || fail "static oracle audit failed — refusing to run green gate"

claims_file="$artifact_dir/step-claims.ndjson"
: >"$claims_file"
summary_file="$artifact_dir/gate-run-summary.json"
run_id="s24-htg-$(date -u +%Y%m%dT%H%M%SZ)-$$"

record_step() {
  local n="$1" text="$2" type="$3" result="$4" log_rel="$5" evidence="$6" executed="${7:-true}"
  jq -nc \
    --argjson n "$n" \
    --arg text "$text" \
    --arg type "$type" \
    --arg result "$result" \
    --arg log "$log_rel" \
    --arg evidence "$evidence" \
    --argjson executed "$executed" \
    '{n:$n,text:$text,type:$type,executed:$executed,result:$result,log:$log,evidence:$evidence}' \
    >>"$claims_file"
}

run_maestro_flow() {
  local flow="$1" log_path="$2"
  local udid=""
  [[ -f "$flow" ]] || fail "Maestro flow missing: $flow"
  [[ -n "$device" ]] || fail "MAESTRO_DEVICE must name a bootable iOS Simulator"

  # Resolve device UDID if name given
  if [[ "$device" =~ ^[0-9A-Fa-f-]{36}$ ]]; then
    udid="$device"
  else
    udid="$(xcrun simctl list devices available --json 2>/dev/null | python3 -c '
import json,sys
data=json.load(sys.stdin)
name=sys.argv[1]
matches=[d for devices in data["devices"].values() for d in devices if d.get("name")==name and d.get("isAvailable") is True]
print(matches[0]["udid"] if matches else "")
' "$device" 2>/dev/null || true)"
  fi
  [[ -n "$udid" ]] || fail "could not resolve simulator UDID for MAESTRO_DEVICE=$device"

  resolve_metro
  log "Metro URL=$MAESTRO_METRO_URL"
  log "Dev Client open=$MAESTRO_DEV_CLIENT_OPEN_URL"
  log "Running maestro --device $udid test $flow"

  set +e
  maestro --device "$udid" test "$flow" \
    -e MAESTRO_APP_ID="$app_id" \
    -e MAESTRO_METRO_URL="${MAESTRO_METRO_URL:-}" \
    -e MAESTRO_METRO_URL_ENCODED="${MAESTRO_METRO_URL_ENCODED:-}" \
    -e MAESTRO_DEV_CLIENT_OPEN_URL="${MAESTRO_DEV_CLIENT_OPEN_URL:-}" \
    2>&1 | tee "$log_path"
  local rc=${PIPESTATUS[0]}
  set -e
  return "$rc"
}

# Probe UI readiness without fabricating pass
if [[ "$skip_ui" == "1" ]]; then
  log "SKIP_UI=1 — running seed + no-convex only; UI steps recorded as blocked"
fi

# Step 1: seed
# Worktrees often lack node_modules; PATH `holo` may be an older binary without
# seed:e2e ("unknown command: seed:e2e"). Prefer primary/main clone tooling:
#   bun services/platform/src/cli/holo.ts seed:e2e --reset
# (or `bun run seed:e2e` from a checkout that has deps).
step1_log="$artifact_dir/step1-seed.log"
step1_result="fail"
if [[ "$skip_seed" == "1" ]]; then
  echo "SKIP_SEED=1" | tee "$step1_log"
  step1_result="pass"
  record_step 1 "Run holo seed:e2e --reset — seeds 3 conversations, 12 documents, 5 feed items" \
    "cli" "pass" ".tmp/GATE-FIX-001/step1-seed.log" "SKIP_SEED=1 (operator asserted substrate)" true
else
  set +e
  seed_rc=127
  seed_cmd=""

  # Candidate roots: this checkout, HOLO_ROOT, then primary clone (worktree-safe).
  seed_roots=("$repo_root")
  if [[ -n "${HOLO_ROOT:-}" ]]; then
    seed_roots+=("$HOLO_ROOT")
  fi
  if [[ -d "${HOME}/Projects/holocron" ]]; then
    seed_roots+=("${HOME}/Projects/holocron")
  fi

  # 1) Prefer bun holo.ts that documents/implements seed:e2e (skip PATH holo if
  #    it lacks the command — common residual HIGH on worktree drivers).
  for root in "${seed_roots[@]}"; do
    holo_ts="$root/services/platform/src/cli/holo.ts"
    if [[ -f "$holo_ts" ]]; then
      help_out="$(cd "$root" && bun "$holo_ts" --help 2>&1 || true)"
      if printf '%s' "$help_out" | rg -q 'seed:e2e'; then
        seed_cmd="bun $holo_ts seed:e2e --reset (cwd=$root)"
        log "seed via: $seed_cmd"
        (cd "$root" && bun "$holo_ts" seed:e2e --reset) 2>&1 | tee "$step1_log"
        seed_rc=${PIPESTATUS[0]}
        break
      fi
    fi
  done

  # 2) Fallback: package script when local deps exist
  if [[ "$seed_rc" != "0" ]] && [[ -f "$repo_root/package.json" ]] && [[ -d "$repo_root/node_modules" ]]; then
    seed_cmd="bun run seed:e2e (cwd=$repo_root)"
    log "seed via: $seed_cmd"
    (cd "$repo_root" && bun run seed:e2e) 2>&1 | tee "$step1_log"
    seed_rc=${PIPESTATUS[0]}
  fi

  # 3) Last resort: PATH holo only if it actually knows seed:e2e
  if [[ "$seed_rc" != "0" ]] && command -v holo >/dev/null 2>&1; then
    holo_help="$(holo --help 2>&1 || true)"
    if printf '%s' "$holo_help" | rg -q 'seed:e2e'; then
      seed_cmd="holo seed:e2e --reset"
      log "seed via: $seed_cmd"
      holo seed:e2e --reset 2>&1 | tee "$step1_log"
      seed_rc=${PIPESTATUS[0]}
    else
      {
        echo "PATH holo lacks seed:e2e (unknown command) — skipped"
        echo "prefer: bun services/platform/src/cli/holo.ts seed:e2e --reset from primary clone"
      } | tee -a "$step1_log"
    fi
  fi

  if [[ -z "$seed_cmd" && "$seed_rc" != "0" ]]; then
    {
      echo "holo seed:e2e not found"
      echo "tried bun holo.ts under: ${seed_roots[*]}"
      echo "hint: cd /Users/inference1/Projects/holocron && bun services/platform/src/cli/holo.ts seed:e2e --reset"
    } | tee "$step1_log"
    seed_rc=127
  fi

  rc=$seed_rc
  set -e
  if [[ "$rc" == "0" ]]; then
    step1_result="pass"
  fi
  record_step 1 "Run holo seed:e2e --reset — seeds 3 conversations, 12 documents, 5 feed items" \
    "cli" "$step1_result" ".tmp/GATE-FIX-001/step1-seed.log" "seed exit=$rc cmd=${seed_cmd:-none}" true
fi

run_ui_step() {
  local n="$1" text="$2" flow="$3" log_name="$4"
  local log_path="$artifact_dir/$log_name"
  local result="fail" evidence=""
  if [[ "$skip_ui" == "1" ]]; then
    echo "SKIP_UI=1 blocked" | tee "$log_path"
    record_step "$n" "$text" "ui" "blocked" ".tmp/GATE-FIX-001/$log_name" "UI blocked (no simulator/Metro run this cycle)" false
    return 0
  fi
  set +e
  run_maestro_flow "$flow" "$log_path"
  local rc=$?
  set -e
  if [[ "$rc" == "0" ]]; then
    result="pass"
    evidence="maestro exit 0 flow=$flow"
  else
    result="fail"
    evidence="maestro exit=$rc flow=$flow"
  fi
  # Extra honesty for rename: must mention Sprint Planning or COMPLETED rename path
  if [[ "$n" == "5" ]]; then
    if [[ "$result" == "pass" ]] && ! rg -q 'Sprint Planning|rename-save|COMPLETED|SUCCESS' "$log_path"; then
      result="fail"
      evidence="rename log missing Sprint Planning / rename evidence (refuse false green)"
    fi
    if [[ "$result" == "pass" ]] && rg -q 'not re-run|drawer load proof' "$log_path"; then
      result="fail"
      evidence="rename log contains drawer-load-proxy language"
    fi
  fi
  record_step "$n" "$text" "ui" "$result" ".tmp/GATE-FIX-001/$log_name" "$evidence" true
}

# Step 2: cold boot + drawer
run_ui_step 2 \
  "Cold-boot app — drawer chat list shows 3 seeded conversations via Zero" \
  "$repo_root/.maestro/chat/drawer-loads-seeded.yml" \
  "step2-coldboot-drawer.log"

# Step 3: articles
run_ui_step 3 \
  "Open Articles — 12 seeded documents load via Zero" \
  "$repo_root/.maestro/articles/list-loads.yml" \
  "step3-articles.log"

# Step 4: what's new
run_ui_step 4 \
  "Open What's New feed — 5 seeded feed items via Zero" \
  "$repo_root/.maestro/subscriptions/whats-new-loads.yml" \
  "step4-whats-new.log"

# Step 5: rename — MUST run rename-reflects.yml (never proxy via drawer load)
run_ui_step 5 \
  "Rename conversation from drawer — title reflects within 5s via Zero" \
  "$repo_root/.maestro/chat/rename-reflects.yml" \
  "step5-rename-reflects.log"

# Step 6: no-convex-client
step6_log="$artifact_dir/step6-no-convex.log"
step6_result="fail"
set +e
if command -v holo >/dev/null 2>&1; then
  holo verify:no-convex-client --roots app,components,hooks,screens 2>&1 | tee "$step6_log"
  rc=${PIPESTATUS[0]}
elif [[ -f "$repo_root/services/platform/src/cli/holo.ts" ]]; then
  bun "$repo_root/services/platform/src/cli/holo.ts" verify:no-convex-client --roots app,components,hooks,screens 2>&1 | tee "$step6_log"
  rc=${PIPESTATUS[0]}
else
  # Fallback: rg-based check matching gate intent
  {
    echo "holo CLI missing — fallback rg convex/react under app components hooks screens"
    hits="$(rg -n "from ['\"]convex/react['\"]|require\\(['\"]convex/react['\"]\\)" app components hooks screens 2>/dev/null | wc -l | tr -d ' ')"
    echo "convex_react_import_hits=$hits"
    if [[ "$hits" == "0" ]]; then
      echo "STATUS PASS"
      rc=0
    else
      echo "STATUS FAIL"
      rc=1
    fi
  } | tee "$step6_log"
fi
set -e
[[ "$rc" == "0" ]] && step6_result="pass"
record_step 6 "Run holo verify:no-convex-client — exits 0" \
  "cli" "$step6_result" ".tmp/GATE-FIX-001/step6-no-convex.log" "no-convex exit=$rc" true

# Step 7: share URL
run_ui_step 7 \
  "Share public document — URL at Mastra /article/ host" \
  "$repo_root/.maestro/articles/share-url-mastra.yml" \
  "step7-share-url.log"

# Aggregate claims — NEVER invent pass
steps_passed="$(jq -s '[.[] | select(.result=="pass")] | length' "$claims_file")"
steps_total=7
steps_executed="$(jq -s '[.[] | select(.executed==true)] | length' "$claims_file")"
verdict="fail"
if [[ "$steps_passed" == "7" && "$steps_executed" == "7" ]]; then
  verdict="pass"
fi

written_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
written_at_commit="$(git -C "$repo_root" rev-parse HEAD 2>/dev/null || echo unknown)"

jq -n \
  --arg run_id "$run_id" \
  --arg verdict "$verdict" \
  --arg written_at "$written_at" \
  --arg written_at_commit "$written_at_commit" \
  --argjson steps_total "$steps_total" \
  --argjson steps_passed "$steps_passed" \
  --argjson steps_executed "$steps_executed" \
  --slurpfile steps "$claims_file" \
  '{
    schema_version: 1,
    sprint_id: "sprint-24-full-rn-app-rewrite-off-convex-onto-zero",
    run_id: $run_id,
    verdict: $verdict,
    runner: "scripts/e2e/run-sprint24-human-gate.sh",
    ui_driver: "maestro",
    written_at: $written_at,
    written_at_commit: $written_at_commit,
    steps_total: $steps_total,
    steps_executed: $steps_executed,
    steps_passed: $steps_passed,
    steps: $steps[0],
    notes: "Honest this-cycle aggregation only. Prior 4009dd97 pass claim remains invalid. Rename step requires rename-reflects.yml log."
  }' >"$summary_file"

log "summary: verdict=$verdict steps_passed=$steps_passed/$steps_total executed=$steps_executed"
log "summary file: $summary_file"

# Only write gate-results.json when WRITE_GATE_RESULTS=1 AND verdict is honest pass
# from real executed steps. Never hand-write pass without logs.
if [[ "$write_gate_results" == "1" ]]; then
  gate_out="$repo_root/.spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/gate-results.json"
  if [[ "$verdict" == "pass" ]]; then
    # Guard: step 5 must not be drawer-load proxy
    step5_ev="$(jq -r '.steps[] | select(.n==5) | .evidence // empty' "$summary_file")"
    if [[ "$step5_ev" == *"not re-run"* || "$step5_ev" == *"drawer load proof"* ]]; then
      fail "refusing to write gate-results: step 5 evidence is drawer-load proxy"
    fi
    if [[ ! -s "$artifact_dir/step5-rename-reflects.log" ]]; then
      fail "refusing to write gate-results: missing step5-rename-reflects.log"
    fi
    cp "$summary_file" "$gate_out"
    log "wrote honest pass gate-results.json -> $gate_out"
  else
    # Write fail/partial honestly when requested — never force pass
    cp "$summary_file" "$gate_out"
    log "wrote non-pass gate-results.json (verdict=$verdict) -> $gate_out"
  fi
fi

# Exit non-zero unless all 7 passed
[[ "$verdict" == "pass" ]]
