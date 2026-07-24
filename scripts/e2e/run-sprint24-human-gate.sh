#!/usr/bin/env bash
# Sprint 24 human-gate driver (GATE-FIX-001 / GATE-FIX-002 readiness).
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
# ---------------------------------------------------------------------------
# GATE-FIX-002 / HIGH-1 — required this-cycle step log filenames
# under E2E_ARTIFACT_DIR (default .tmp/GATE-FIX-002 for post-land runs):
#   step1-seed.log
#   step2-coldboot-drawer.log
#   step3-articles.log
#   step4-whats-new.log
#   step5-rename-reflects.log
#   step6-no-convex.log
#   step7-share-url.log
# WRITE_GATE_RESULTS pass is allowed ONLY when:
#   - steps_passed == 7 AND steps_executed == 7 AND zero skipped/blocked, AND
#   - all 7 log files above exist and are non-empty under artifact dir.
# dual-lens APPROVED / full_htg_7_of_7 must not substitute for these logs.
# ---------------------------------------------------------------------------
#
# Env:
#   MAESTRO_DEVICE          named iOS Simulator (required for UI steps)
#   MAESTRO_APP_ID          default com.holocron.app
#   MAESTRO_METRO_URL       http://<host>:8081 (auto-detected from LAN if unset)
#   MAESTRO_METRO_HOST      optional host if URL not set
#   MAESTRO_METRO_PORT      default 8081
#   MAESTRO_DEV_CLIENT_OPEN_URL  optional full exp+holocron://... openLink
#   E2E_ARTIFACT_DIR        default .tmp/GATE-FIX-002 (this-cycle GATE-FIX evidence)
#   SKIP_SEED=1             skip step 1 — records result "skipped" (NOT pass);
#                           overall gate verdict cannot pass when seed is skipped
#   SKIP_UI=1               static/probe mode — seed+no-convex only; UI blocked
#   WRITE_GATE_RESULTS=1    write gate-results.json from this-cycle claims only
#   HOLO_PRIMARY_ROOT       dep-bearing primary checkout for seed:e2e
#                           (e.g. /Users/.../Projects/holocron). Preferred first
#                           when it has services/platform/node_modules/drizzle-orm
#                           or node_modules/drizzle-orm. Worktrees often lack deps.
#   HOLO_ROOT               alternate dep-bearing checkout (same drizzle check)
#
# Seed root policy (step 1):
#   Prefer roots with drizzle-orm installed; only break on seed exit 0; on failure
#   continue next root and append log. Missing module / all-roots fail => step1 fail
#   (never pass). SKIP_SEED records "skipped", never "pass".
#
# Usage:
#   bash scripts/e2e/run-sprint24-human-gate.sh
#   bash scripts/e2e/run-sprint24-human-gate.sh --check
#   bash scripts/e2e/run-sprint24-human-gate.sh --static-only
#   bash scripts/e2e/run-sprint24-human-gate.sh --dry-seed-roots
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

mode="run"
artifact_dir="${E2E_ARTIFACT_DIR:-$repo_root/.tmp/GATE-FIX-002}"
app_id="${MAESTRO_APP_ID:-com.holocron.app}"
device="${MAESTRO_DEVICE:-}"
write_gate_results="${WRITE_GATE_RESULTS:-0}"
skip_seed="${SKIP_SEED:-0}"
skip_ui="${SKIP_UI:-0}"

fail() { echo "sprint24-human-gate: $*" >&2; exit 2; }
log() { echo "sprint24-human-gate: $*" >&2; }

# True when checkout can resolve drizzle-orm (platform deps present).
has_seed_deps() {
  local root="$1"
  [[ -d "$root/services/platform/node_modules/drizzle-orm" ]] \
    || [[ -d "$root/node_modules/drizzle-orm" ]]
}

# Build ordered unique seed roots: dep-bearing first, then others.
# Order of candidates (before partition): HOLO_PRIMARY_ROOT, HOLO_ROOT,
# ~/Projects/holocron, repo_root (worktree-safe).
# Avoids associative arrays for macOS bash 3.2 compatibility.
build_seed_roots() {
  local candidates=()
  local r s already
  seed_roots=()

  [[ -n "${HOLO_PRIMARY_ROOT:-}" ]] && candidates+=("$HOLO_PRIMARY_ROOT")
  [[ -n "${HOLO_ROOT:-}" ]] && candidates+=("$HOLO_ROOT")
  if [[ -d "${HOME}/Projects/holocron" ]]; then
    candidates+=("${HOME}/Projects/holocron")
  fi
  candidates+=("$repo_root")

  local with_deps=() without_deps=() uniq=()
  for r in "${candidates[@]}"; do
    [[ -z "$r" ]] && continue
    already=0
    for s in "${uniq[@]+"${uniq[@]}"}"; do
      if [[ "$s" == "$r" ]]; then already=1; break; fi
    done
    [[ "$already" == "1" ]] && continue
    uniq+=("$r")
    if has_seed_deps "$r"; then
      with_deps+=("$r")
    else
      without_deps+=("$r")
    fi
  done
  seed_roots=("${with_deps[@]+"${with_deps[@]}"}" "${without_deps[@]+"${without_deps[@]}"}")
}

print_seed_roots_plan() {
  build_seed_roots
  local i=0 r deps
  echo "repo_root=$repo_root"
  echo "HOLO_PRIMARY_ROOT=${HOLO_PRIMARY_ROOT:-}"
  echo "HOLO_ROOT=${HOLO_ROOT:-}"
  echo "seed_roots_ordered (dep-bearing first):"
  for r in "${seed_roots[@]}"; do
    i=$((i + 1))
    if has_seed_deps "$r"; then deps="deps=yes"; else deps="deps=no"; fi
    echo "  $i. $r ($deps)"
  done
  if [[ ${#seed_roots[@]} -gt 0 ]] && has_seed_deps "${seed_roots[0]}"; then
    echo "preferred_seed_cwd=${seed_roots[0]}"
    echo "plan: prefer first dep-bearing root; only break on seed_rc==0"
  else
    echo "preferred_seed_cwd="
    echo "plan: no dep-bearing root found; attempts may fail with missing drizzle-orm"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) mode="check"; shift ;;
    --static-only) mode="static"; shift ;;
    --dry-seed-roots) mode="dry-seed-roots"; shift ;;
    --artifact-dir) artifact_dir="${2:-}"; shift 2 ;;
    --device) device="${2:-}"; shift 2 ;;
    --write-gate-results) write_gate_results=1; shift ;;
    --skip-seed) skip_seed=1; shift ;;
    --skip-ui) skip_ui=1; shift ;;
    -h|--help)
      sed -n '2,50p' "$0"
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
    # Only fail if assertVisible / extendedWaitUntil+visible names the data oracle
    # with optional:true. when:notVisible navigation branches are NOT data oracles
    # (qa-real-7step-20260724T052913Z false-positive at yml:23).
    if python3 -c '
import re, pathlib, sys
lines = pathlib.Path(".maestro/subscriptions/whats-new-loads.yml").read_text().splitlines()
fail = []
for i, l in enumerate(lines):
  if not re.search(r"id:\s*\"whats-new-feed\"", l):
    continue
  # Walk back to find assert kind for this id line
  back = "\n".join(lines[max(0, i - 8) : i + 1])
  if re.search(r"notVisible:", back) and not re.search(r"assertVisible:", back):
    # when: notVisible / empty-state check — not a positive data assert
    if "assertVisible" not in back:
      continue
  if re.search(r"assertVisible:", back) or (
    re.search(r"extendedWaitUntil:", back) and re.search(r"visible:", back)
  ):
    if re.search(r"optional:\s*true", "\n".join(lines[i : i + 5])):
      fail.append(i + 1)
if fail:
  print("FAIL assert lines:", fail)
  sys.exit(1)
sys.exit(0)
'; then
      echo "PASS: whats-new-feed data asserts non-optional"
      rg -n 'whats-new-feed' .maestro/subscriptions/whats-new-loads.yml || true
    else
      echo "FAIL: whats-new-feed data assert marked optional"
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
  if "Sprint Planning" not in l:
    continue
  back = "\n".join(lines[max(0,i-6):i+1])
  if "assertVisible" not in back and "visible:" not in back:
    continue
  if re.search(r"optional:\s*true", "\n".join(lines[i:i+4])):
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
    # DATA oracles: assertVisible / extendedWaitUntil+visible for named ids.
    # NEVER flag when:notVisible / navigation fallback chrome (optional:true taps).
    # Regression: qa-real-7step-20260724T052913Z failed before any step ran because
    # a when:notVisible id:"whats-new-feed" line sat near optional drawer taps.
    if python3 -c "
import re, pathlib, sys
files = [
  '.maestro/chat/drawer-loads-seeded.yml',
  '.maestro/chat/rename-reflects.yml',
  '.maestro/articles/list-loads.yml',
  '.maestro/subscriptions/whats-new-loads.yml',
]
# id or text oracles that must never be optional on positive asserts
id_oids = (
  'chat-screen', 'conversation-row', 'articles-route',
  'article-card-pressable', 'whats-new-feed', 'whats-new-feed-finding-0',
)
text_oids = ('Sprint Planning',)
fail = []
for f in files:
  p = pathlib.Path(f)
  if not p.exists():
    continue
  lines = p.read_text().splitlines()
  for i, line in enumerate(lines):
    has_id = any(re.search(r'id:\\s*\"' + re.escape(oid) + r'\"', line) for oid in id_oids)
    has_text = any(oid in line for oid in text_oids)
    if not has_id and not has_text:
      continue
    back = '\\n'.join(lines[max(0, i - 10) : i + 1])
    # Skip when: notVisible conditions (navigation / empty-state bounds)
    if re.search(r'notVisible:', back) and not re.search(r'assertVisible:', back):
      # allow extendedWaitUntil notVisible without optional
      if re.search(r'assertVisible:', back):
        pass
      else:
        continue
    # Positive data assert contexts only
    is_assert = bool(re.search(r'assertVisible:', back))
    is_wait_vis = bool(re.search(r'extendedWaitUntil:', back) and re.search(r'\\bvisible:', back) and not re.search(r'notVisible:', back))
    if not (is_assert or is_wait_vis):
      continue
    if re.search(r'optional:\\s*true', '\\n'.join(lines[i : i + 6])):
      fail.append(f'{f}:{i+1}')
if fail:
  print('FAIL lines:', fail)
  sys.exit(1)
print('PASS: data assert oracles not marked optional (when:notVisible branches ignored)')
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

if [[ "$mode" == "dry-seed-roots" ]]; then
  print_seed_roots_plan
  exit 0
fi

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

# Bound Maestro wall-clock so a single assert (e.g. assertNotVisible empty-state)
# cannot hang the full human-gate driver indefinitely. Default 180s/flow; override
# via MAESTRO_STEP_TIMEOUT_SEC. On timeout: kill maestro, append note to log, exit 124.
run_maestro_flow() {
  local flow="$1" log_path="$2"
  local udid=""
  local step_timeout="${MAESTRO_STEP_TIMEOUT_SEC:-180}"
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
  log "Running maestro --device $udid test $flow (step_timeout=${step_timeout}s)"

  set +e
  # shell-level wall clock: fail closed if Maestro hangs (e.g. unbounded notVisible)
  (
    maestro --device "$udid" test "$flow" \
      -e MAESTRO_APP_ID="$app_id" \
      -e MAESTRO_METRO_URL="${MAESTRO_METRO_URL:-}" \
      -e MAESTRO_METRO_URL_ENCODED="${MAESTRO_METRO_URL_ENCODED:-}" \
      -e MAESTRO_DEV_CLIENT_OPEN_URL="${MAESTRO_DEV_CLIENT_OPEN_URL:-}" \
      2>&1
  ) | tee "$log_path" &
  local pipe_pid=$!
  local maestro_pgid=""
  # Wait up to step_timeout for the tee pipeline; on timeout kill maestro children.
  local waited=0
  while kill -0 "$pipe_pid" 2>/dev/null; do
    if [[ "$waited" -ge "$step_timeout" ]]; then
      {
        echo ""
        echo "sprint24-human-gate: TIMEOUT after ${step_timeout}s on $flow"
        echo "sprint24-human-gate: fail closed — do not wait indefinitely (HIGH-3 empty-state hang class)"
        echo "sprint24-human-gate: preserve this log as honest fail evidence"
      } | tee -a "$log_path"
      # Kill maestro processes for this device test (best-effort)
      pkill -f "maestro.*test.*$(basename "$flow")" 2>/dev/null || true
      kill -TERM "$pipe_pid" 2>/dev/null || true
      sleep 1
      kill -KILL "$pipe_pid" 2>/dev/null || true
      wait "$pipe_pid" 2>/dev/null
      # Do not set -e before return: non-zero return under set -e aborts the whole driver.
      return 124
    fi
    sleep 1
    waited=$((waited + 1))
  done
  wait "$pipe_pid"
  local rc=$?
  # Keep set +e through return so a failed Maestro step does not abort steps 6–7.
  return "$rc"
}

# Probe UI readiness without fabricating pass
if [[ "$skip_ui" == "1" ]]; then
  log "SKIP_UI=1 — running seed + no-convex only; UI steps recorded as blocked"
fi

# Step 1: seed
# Worktrees often lack node_modules (drizzle-orm); PATH `holo` may be an older
# binary without seed:e2e. Prefer dep-bearing primary checkout via
# HOLO_PRIMARY_ROOT / HOLO_ROOT / ~/Projects/holocron before repo_root.
# Only break on seed_rc==0; on failure continue next root and append log.
# All roots fail / missing module => step1 fail (NEVER pass).
# SKIP_SEED records "skipped" (executed=false) so overall gate cannot pass.
step1_log="$artifact_dir/step1-seed.log"
step1_result="fail"
if [[ "$skip_seed" == "1" ]]; then
  {
    echo "SKIP_SEED=1 — seed not executed this cycle"
    echo "result=skipped (NOT pass); overall gate verdict cannot pass"
  } | tee "$step1_log"
  step1_result="skipped"
  record_step 1 "Run holo seed:e2e --reset — seeds 3 conversations, 12 documents, 5 feed items" \
    "cli" "skipped" "$artifact_dir/step1-seed.log" \
    "SKIP_SEED=1 (not executed; gate cannot pass)" false
else
  set +e
  seed_rc=127
  seed_cmd=""
  : >"$step1_log"

  build_seed_roots
  {
    echo "=== seed root plan (dep-bearing first) ==="
    print_seed_roots_plan
    echo "=== end plan ==="
  } | tee -a "$step1_log"

  # 1) bun holo.ts under each root that implements seed:e2e.
  #    Prefer dep-bearing roots (already ordered). Only break on rc==0.
  for root in "${seed_roots[@]}"; do
    holo_ts="$root/services/platform/src/cli/holo.ts"
    if [[ ! -f "$holo_ts" ]]; then
      echo "skip root (no holo.ts): $root" | tee -a "$step1_log"
      continue
    fi
    help_out="$(cd "$root" && bun "$holo_ts" --help 2>&1 || true)"
    if ! printf '%s' "$help_out" | rg -q 'seed:e2e'; then
      echo "skip root (holo.ts lacks seed:e2e): $root" | tee -a "$step1_log"
      continue
    fi
    if has_seed_deps "$root"; then
      deps_label="deps=yes"
    else
      deps_label="deps=no (may fail missing drizzle-orm)"
    fi
    seed_cmd="bun $holo_ts seed:e2e --reset (cwd=$root $deps_label)"
    log "seed via: $seed_cmd"
    # Subshell exits with bun's status so PIPESTATUS[0] is the seed rc (not tee).
    (
      echo "=== seed attempt: $seed_cmd ==="
      cd "$root" && bun "$holo_ts" seed:e2e --reset
    ) 2>&1 | tee -a "$step1_log"
    seed_rc=${PIPESTATUS[0]}
    if [[ "$seed_rc" == "0" ]]; then
      log "seed succeeded at cwd=$root"
      break
    fi
    echo "seed failed rc=$seed_rc at $root — trying next root" | tee -a "$step1_log"
  done

  # 2) Fallback: package script on dep-bearing roots only
  if [[ "$seed_rc" != "0" ]]; then
    for root in "${seed_roots[@]}"; do
      if has_seed_deps "$root" && [[ -f "$root/package.json" ]]; then
        seed_cmd="bun run seed:e2e (cwd=$root deps=yes)"
        log "seed via: $seed_cmd"
        (
          echo "=== seed attempt: $seed_cmd ==="
          cd "$root" && bun run seed:e2e
        ) 2>&1 | tee -a "$step1_log"
        seed_rc=${PIPESTATUS[0]}
        if [[ "$seed_rc" == "0" ]]; then
          break
        fi
        echo "seed failed rc=$seed_rc via package script at $root — trying next" | tee -a "$step1_log"
      fi
    done
  fi

  # 3) Last resort: PATH holo only if it actually knows seed:e2e
  if [[ "$seed_rc" != "0" ]] && command -v holo >/dev/null 2>&1; then
    holo_help="$(holo --help 2>&1 || true)"
    if printf '%s' "$holo_help" | rg -q 'seed:e2e'; then
      seed_cmd="holo seed:e2e --reset"
      log "seed via: $seed_cmd"
      (
        echo "=== seed attempt: $seed_cmd ==="
        holo seed:e2e --reset
      ) 2>&1 | tee -a "$step1_log"
      seed_rc=${PIPESTATUS[0]}
    else
      {
        echo "PATH holo lacks seed:e2e (unknown command) — skipped"
        echo "prefer: HOLO_PRIMARY_ROOT with drizzle-orm + bun services/platform/src/cli/holo.ts seed:e2e --reset"
      } | tee -a "$step1_log"
    fi
  fi

  if [[ -z "$seed_cmd" && "$seed_rc" != "0" ]]; then
    {
      echo "holo seed:e2e not found or all roots failed"
      echo "tried roots: ${seed_roots[*]}"
      echo "hint: export HOLO_PRIMARY_ROOT=/Users/inference1/Projects/holocron"
      echo "hint: cd \"\$HOLO_PRIMARY_ROOT\" && bun services/platform/src/cli/holo.ts seed:e2e --reset"
    } | tee -a "$step1_log"
    seed_rc=127
  fi

  # Missing-module across all attempts is still fail (never pass / never blocked-as-ok)
  if [[ "$seed_rc" != "0" ]] && rg -q "Cannot find module 'drizzle-orm" "$step1_log"; then
    echo "evidence: missing drizzle-orm module (worktree env) — step1 fail" | tee -a "$step1_log"
  fi

  rc=$seed_rc
  set -e
  if [[ "$rc" == "0" ]]; then
    step1_result="pass"
  else
    step1_result="fail"
  fi
  record_step 1 "Run holo seed:e2e --reset — seeds 3 conversations, 12 documents, 5 feed items" \
    "cli" "$step1_result" "$artifact_dir/step1-seed.log" "seed exit=$rc cmd=${seed_cmd:-none}" true
fi

run_ui_step() {
  local n="$1" text="$2" flow="$3" log_name="$4"
  local log_path="$artifact_dir/$log_name"
  local result="fail" evidence=""
  if [[ "$skip_ui" == "1" ]]; then
    echo "SKIP_UI=1 blocked" | tee "$log_path"
    record_step "$n" "$text" "ui" "blocked" "$artifact_dir/$log_name" "UI blocked (no simulator/Metro run this cycle)" false
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
  record_step "$n" "$text" "ui" "$result" "$artifact_dir/$log_name" "$evidence" true
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
  "cli" "$step6_result" "$artifact_dir/step6-no-convex.log" "no-convex exit=$rc" true

# Step 7: share URL
run_ui_step 7 \
  "Share public document — URL at Mastra /article/ host" \
  "$repo_root/.maestro/articles/share-url-mastra.yml" \
  "step7-share-url.log"

# Aggregate claims — NEVER invent pass
# SKIP_SEED / SKIP_UI use result skipped|blocked (not pass) so steps_passed < 7.
steps_passed="$(jq -s '[.[] | select(.result=="pass")] | length' "$claims_file")"
steps_total=7
steps_executed="$(jq -s '[.[] | select(.executed==true)] | length' "$claims_file")"
steps_skipped_or_blocked="$(jq -s '[.[] | select(.result=="skipped" or .result=="blocked")] | length' "$claims_file")"
verdict="fail"
if [[ "$steps_passed" == "7" && "$steps_executed" == "7" && "$steps_skipped_or_blocked" == "0" ]]; then
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
  --argjson steps "$(jq -s '.' "$claims_file")" \
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
    steps: $steps,
    notes: "Honest this-cycle aggregation only. Prior 4009dd97 pass claim remains invalid. Rename step requires rename-reflects.yml log."
  }' >"$summary_file"

log "summary: verdict=$verdict steps_passed=$steps_passed/$steps_total executed=$steps_executed"
log "summary file: $summary_file"

# Only write gate-results.json when WRITE_GATE_RESULTS=1 AND verdict is honest pass
# from real executed steps. Never hand-write pass without logs.
# GATE-FIX-002: pass requires all 7 this-cycle logs non-empty + steps_passed==7 + zero skipped.
required_step_logs=(
  "step1-seed.log"
  "step2-coldboot-drawer.log"
  "step3-articles.log"
  "step4-whats-new.log"
  "step5-rename-reflects.log"
  "step6-no-convex.log"
  "step7-share-url.log"
)
if [[ "$write_gate_results" == "1" ]]; then
  gate_out="$repo_root/.spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/gate-results.json"
  if [[ "$verdict" == "pass" ]]; then
    # Guard: step 5 must not be drawer-load proxy
    step5_ev="$(jq -r '.steps[] | select(.n==5) | .evidence // empty' "$summary_file")"
    if [[ "$step5_ev" == *"not re-run"* || "$step5_ev" == *"drawer load proof"* ]]; then
      fail "refusing to write gate-results: step 5 evidence is drawer-load proxy"
    fi
    if [[ "$steps_passed" != "7" || "$steps_executed" != "7" || "$steps_skipped_or_blocked" != "0" ]]; then
      fail "refusing to write gate-results pass: steps_passed=$steps_passed executed=$steps_executed skipped_or_blocked=$steps_skipped_or_blocked (need 7/7/0)"
    fi
    for req_log in "${required_step_logs[@]}"; do
      if [[ ! -s "$artifact_dir/$req_log" ]]; then
        fail "refusing to write gate-results pass: missing or empty this-cycle log $artifact_dir/$req_log"
      fi
    done
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
