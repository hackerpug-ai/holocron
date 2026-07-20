#!/usr/bin/env bash
# GATE-FIX-G4 — Fail-closed probe for real ci-e2e.yml dispatch prerequisites.
#
# Usage:
#   scripts/e2e/probe-ci-e2e-prereqs.sh --check
#
# --check:
#   Exit 0 + JSON ok:true only when ALL of:
#     - gh binary resolvable
#     - gh authenticated (gh auth status OR GH_TOKEN/GITHUB_TOKEN set)
#     - .github/workflows/ci-e2e.yml present
#     - self-hosted e2e runner online (holo ci runner:status / HOLO_RUNNER_STATUS_FILE / gh api)
#     - required GitHub secrets names present (when listable): NONPROD_DATABASE_URL,
#       FLEET_URL, PLATFORM_URL, RN_API_KEY, ZERO_ADMIN_PASSWORD
#     - required GitHub vars names present (when listable): MAESTRO_DEVICE,
#       EXPO_DEV_BUILD_PATH, MAESTRO_APP_ID
#   Otherwise exit non-zero + JSON ok:false with next_input_needed.
#
# NEVER print secret/var values — only SET/UNSET or present booleans.
#
# Env:
#   GH_TOKEN / GITHUB_TOKEN     — auth for gh (preferred non-interactive)
#   GITHUB_REPOSITORY           — owner/repo (default: gh repo view or remote)
#   HOLO_RUNNER_STATUS_FILE     — offline runner status JSON override
#   HOLO_CI_PROBE_SKIP_SECRETS  — if 1, still require auth/runner but skip secret list
#                                 (NOT sufficient for ok:true alone)
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mode="${1:---check}"

REQUIRED_SECRETS=(
  NONPROD_DATABASE_URL
  FLEET_URL
  PLATFORM_URL
  RN_API_KEY
  ZERO_ADMIN_PASSWORD
)
REQUIRED_VARS=(
  MAESTRO_DEVICE
  EXPO_DEV_BUILD_PATH
  MAESTRO_APP_ID
)

emit_json() {
  # stdin: full JSON payload from python builder
  cat
}

build_and_emit() {
  python3 - "$@" <<'PY'
import json, sys

# Args are key=value pairs; complex fields passed as JSON strings after --
args = sys.argv[1:]
payload = {
    "ok": False,
    "task": "GATE-FIX-G4",
    "probe": "ci-e2e-prereqs",
    "gh_present": False,
    "gh_path": None,
    "gh_authenticated": False,
    "workflow_present": False,
    "workflow_path": None,
    "runner_online": False,
    "runner_source": None,
    "runner_errors": [],
    "secrets": {},
    "vars": {},
    "secrets_checkable": False,
    "vars_checkable": False,
    "next_input_needed": None,
    "note": None,
}

i = 0
while i < len(args):
    a = args[i]
    if a == "--json-field" and i + 2 < len(args):
        key = args[i + 1]
        try:
            payload[key] = json.loads(args[i + 2])
        except Exception:
            payload[key] = args[i + 2]
        i += 3
        continue
    if "=" in a:
        k, v = a.split("=", 1)
        if v in ("true", "false"):
            payload[k] = v == "true"
        elif v == "null" or v == "":
            payload[k] = None if v == "null" else v
        else:
            payload[k] = v
    i += 1

print(json.dumps(payload, indent=2))
PY
}

resolve_gh() {
  if command -v gh >/dev/null 2>&1; then
    command -v gh
    return 0
  fi
  return 1
}

gh_authenticated() {
  local gh_bin="$1"
  if [[ -n "${GH_TOKEN:-}" || -n "${GITHUB_TOKEN:-}" ]]; then
    return 0
  fi
  # gh auth status exits 0 when logged in
  if "$gh_bin" auth status >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

resolve_repo() {
  if [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
    echo "$GITHUB_REPOSITORY"
    return 0
  fi
  local gh_bin="$1"
  if repo="$("$gh_bin" repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)" && [[ -n "$repo" ]]; then
    echo "$repo"
    return 0
  fi
  # Fallback: parse origin remote
  local url
  url="$(git -C "$repo_root" remote get-url origin 2>/dev/null || true)"
  if [[ "$url" =~ github\.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
    echo "${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
    return 0
  fi
  echo ""
  return 1
}

check_runner_online() {
  # Sets globals: runner_online (true/false), runner_source, runner_errors (bash array as string)
  runner_online=false
  runner_source="none"
  runner_errors=()

  local gh_bin="$1"
  local repo="$2"

  # 1) HOLO_RUNNER_STATUS_FILE — operator-supplied offline status
  if [[ -n "${HOLO_RUNNER_STATUS_FILE:-}" && -f "${HOLO_RUNNER_STATUS_FILE}" ]]; then
    runner_source="status-file"
    local online
    online="$(python3 - "$HOLO_RUNNER_STATUS_FILE" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception as e:
    print("ERR:" + str(e))
    raise SystemExit(0)
# Accept either top-level online or matching online runners with e2e labels
online = bool(d.get("online"))
runners = d.get("matching_runners") or d.get("runners") or []
required = {"self-hosted", "holocron", "e2e"}
match = False
for r in runners:
    labels = set(str(x) for x in (r.get("labels") or []))
    status = str(r.get("status") or "").lower()
    if status == "online" and required.issubset(labels):
        match = True
        break
if online or match:
    print("true")
else:
    print("false")
PY
)"
    if [[ "$online" == "true" ]]; then
      runner_online=true
    else
      runner_errors+=("HOLO_RUNNER_STATUS_FILE present but no online e2e runner")
    fi
    return 0
  fi

  # 2) holo ci runner:status — prefer API-level online (integration labels check if e2e sim probes poison local host)
  # For dispatch readiness we care about a GitHub runner with labels self-hosted,holocron,e2e.
  # On operator hosts without MAESTRO_DEVICE/EXPO_DEV_BUILD_PATH, --lane e2e fails sim/build probes.
  # So: try gh api first when authenticated; else holo with status file; else holo e2e.
  if [[ -n "$gh_bin" ]] && gh_authenticated "$gh_bin" && [[ -n "$repo" ]]; then
    runner_source="github-api"
    local api_out
    if api_out="$("$gh_bin" api "repos/${repo}/actions/runners?per_page=100" 2>/dev/null)"; then
      local online
      online="$(python3 -c '
import json,sys
d=json.loads(sys.stdin.read() or "{}")
required={"self-hosted","holocron","e2e"}
ok=False
for r in d.get("runners") or []:
    labels=set()
    for l in r.get("labels") or []:
        if isinstance(l, dict):
            labels.add(str(l.get("name") or ""))
        else:
            labels.add(str(l))
    if str(r.get("status") or "").lower()=="online" and required.issubset(labels):
        ok=True
        break
print("true" if ok else "false")
' <<<"$api_out")"
      if [[ "$online" == "true" ]]; then
        runner_online=true
      else
        runner_errors+=("no online GitHub Actions runner with labels self-hosted,holocron,e2e")
      fi
      return 0
    else
      runner_errors+=("gh api actions/runners failed")
    fi
  fi

  # 3) holo CLI fallback (may fail closed without token or e2e sim/build)
  if command -v bun >/dev/null 2>&1 && [[ -f "$repo_root/services/platform/src/cli/holo.ts" ]]; then
    runner_source="holo"
    local holo_out holo_rc=0
    holo_out="$(
      cd "$repo_root" &&
      bun services/platform/src/cli/holo.ts ci runner:status --json --lane e2e 2>/dev/null
    )" || holo_rc=$?
    if [[ -n "$holo_out" ]]; then
      local online
      online="$(python3 -c '
import json,sys
t=sys.stdin.read()
s=t.find("{"); e=t.rfind("}")
if s<0 or e<s:
    print("false"); raise SystemExit
d=json.loads(t[s:e+1])
# online alone is insufficient if errors mention missing token; require online true
print("true" if d.get("online") is True else "false")
' <<<"$holo_out")"
      if [[ "$online" == "true" ]]; then
        runner_online=true
      else
        local err
        err="$(python3 -c '
import json,sys
t=sys.stdin.read(); s=t.find("{"); e=t.rfind("}")
d=json.loads(t[s:e+1]) if s>=0 and e>s else {}
print("; ".join(d.get("errors") or ["holo runner offline"]))
' <<<"$holo_out")"
        runner_errors+=("$err")
      fi
      return 0
    fi
    runner_errors+=("holo ci runner:status failed (rc=${holo_rc})")
  else
    runner_errors+=("bun/holo unavailable and no HOLO_RUNNER_STATUS_FILE; cannot probe runner")
  fi
}

list_secret_presence() {
  # Prints JSON object name -> "SET"|"UNSET" (never values)
  local gh_bin="$1"
  local repo="$2"
  if ! gh_authenticated "$gh_bin" || [[ -z "$repo" ]]; then
    echo "{}"
    return 1
  fi
  local listed
  if ! listed="$("$gh_bin" secret list --repo "$repo" 2>/dev/null)"; then
    echo "{}"
    return 1
  fi
  python3 - "$listed" <<'PY'
import json, sys
listed = sys.argv[1]
names = set()
for line in listed.splitlines():
    line=line.strip()
    if not line or line.lower().startswith("name"):
        continue
    # gh secret list: NAME  UPDATED
    names.add(line.split()[0])
required = [
  "NONPROD_DATABASE_URL","FLEET_URL","PLATFORM_URL","RN_API_KEY","ZERO_ADMIN_PASSWORD"
]
print(json.dumps({n: ("SET" if n in names else "UNSET") for n in required}))
PY
}

list_var_presence() {
  local gh_bin="$1"
  local repo="$2"
  if ! gh_authenticated "$gh_bin" || [[ -z "$repo" ]]; then
    echo "{}"
    return 1
  fi
  local listed
  if ! listed="$("$gh_bin" variable list --repo "$repo" 2>/dev/null)"; then
    echo "{}"
    return 1
  fi
  python3 - "$listed" <<'PY'
import json, sys
listed = sys.argv[1]
names = set()
for line in listed.splitlines():
    line=line.strip()
    if not line or line.lower().startswith("name"):
        continue
    names.add(line.split()[0])
required = ["MAESTRO_DEVICE","EXPO_DEV_BUILD_PATH","MAESTRO_APP_ID"]
print(json.dumps({n: ("SET" if n in names else "UNSET") for n in required}))
PY
}

run_check() {
  local gh_bin="" gh_present=false gh_auth=false
  local workflow_path="$repo_root/.github/workflows/ci-e2e.yml"
  local workflow_present=false
  local next_parts=()
  local note=""
  local repo=""
  local secrets_json="{}" vars_json="{}"
  local secrets_checkable=false vars_checkable=false
  local secrets_ok=false vars_ok=false
  runner_online=false
  runner_source="none"
  runner_errors=()

  if gh_bin="$(resolve_gh)"; then
    gh_present=true
  else
    gh_bin=""
    next_parts+=("Install GitHub CLI (gh) — e.g. brew install gh — required for gh workflow run ci-e2e.yml")
  fi

  if [[ -f "$workflow_path" ]]; then
    workflow_present=true
  else
    next_parts+=("Missing .github/workflows/ci-e2e.yml on this ref")
  fi

  if [[ "$gh_present" == "true" ]]; then
    if gh_authenticated "$gh_bin"; then
      gh_auth=true
    else
      next_parts+=("Authenticate gh: run 'gh auth login' or set GH_TOKEN/GITHUB_TOKEN (never commit tokens)")
    fi
    repo="$(resolve_repo "$gh_bin" || true)"
  fi

  if [[ "$gh_present" == "true" ]]; then
    check_runner_online "$gh_bin" "$repo"
  else
    runner_errors+=("gh missing; cannot probe runner via GitHub API")
  fi
  if [[ "$runner_online" != "true" ]]; then
    next_parts+=("Bring self-hosted runner online with labels [self-hosted,holocron,e2e] (see docs/ci/macos-e2e-runner.md); or set HOLO_RUNNER_STATUS_FILE to a status JSON with online e2e runner")
  fi

  # Secrets / vars — names only, SET/UNSET
  if [[ "$gh_present" == "true" && "$gh_auth" == "true" && -n "$repo" ]]; then
    if secrets_json="$(list_secret_presence "$gh_bin" "$repo")"; then
      secrets_checkable=true
      secrets_ok="$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print("true" if d and all(v=="SET" for v in d.values()) else "false")' "$secrets_json")"
      if [[ "$secrets_ok" != "true" ]]; then
        local missing
        missing="$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(",".join(k for k,v in d.items() if v!="SET"))' "$secrets_json")"
        next_parts+=("Configure GitHub Actions secrets (names only; values never printed): ${missing:-NONPROD_DATABASE_URL,FLEET_URL,PLATFORM_URL,RN_API_KEY,ZERO_ADMIN_PASSWORD}")
      fi
    else
      secrets_json='{"NONPROD_DATABASE_URL":"UNSET","FLEET_URL":"UNSET","PLATFORM_URL":"UNSET","RN_API_KEY":"UNSET","ZERO_ADMIN_PASSWORD":"UNSET"}'
      secrets_checkable=false
      next_parts+=("Cannot list secrets (need repo admin scope). Ensure secrets exist: NONPROD_DATABASE_URL FLEET_URL PLATFORM_URL RN_API_KEY ZERO_ADMIN_PASSWORD")
    fi
    if vars_json="$(list_var_presence "$gh_bin" "$repo")"; then
      vars_checkable=true
      vars_ok="$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print("true" if d and all(v=="SET" for v in d.values()) else "false")' "$vars_json")"
      if [[ "$vars_ok" != "true" ]]; then
        local missing_v
        missing_v="$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(",".join(k for k,v in d.items() if v!="SET"))' "$vars_json")"
        next_parts+=("Configure GitHub Actions variables (names only): ${missing_v:-MAESTRO_DEVICE,EXPO_DEV_BUILD_PATH,MAESTRO_APP_ID}")
      fi
    else
      vars_json='{"MAESTRO_DEVICE":"UNSET","EXPO_DEV_BUILD_PATH":"UNSET","MAESTRO_APP_ID":"UNSET"}'
      vars_checkable=false
      next_parts+=("Cannot list variables. Ensure vars exist: MAESTRO_DEVICE EXPO_DEV_BUILD_PATH MAESTRO_APP_ID")
    fi
  else
    secrets_json='{"NONPROD_DATABASE_URL":"UNSET","FLEET_URL":"UNSET","PLATFORM_URL":"UNSET","RN_API_KEY":"UNSET","ZERO_ADMIN_PASSWORD":"UNSET"}'
    vars_json='{"MAESTRO_DEVICE":"UNSET","EXPO_DEV_BUILD_PATH":"UNSET","MAESTRO_APP_ID":"UNSET"}'
    next_parts+=("After auth, ensure secrets NONPROD_DATABASE_URL FLEET_URL PLATFORM_URL RN_API_KEY ZERO_ADMIN_PASSWORD and vars MAESTRO_DEVICE EXPO_DEV_BUILD_PATH MAESTRO_APP_ID are configured (probe will recheck presence without printing values)")
  fi

  local ok=false
  if [[ "$gh_present" == "true" && "$gh_auth" == "true" && "$workflow_present" == "true" && "$runner_online" == "true" && "$secrets_ok" == "true" && "$vars_ok" == "true" ]]; then
    ok=true
    note="ready for gh workflow run ci-e2e.yml"
    next_parts=()
  else
    note="not ready for real ci-e2e dispatch"
  fi

  local next_joined=""
  if ((${#next_parts[@]} > 0)); then
    local IFS='; '
    next_joined="${next_parts[*]}"
  fi

  # Emit via python + env (no secret values ever printed — only SET/UNSET maps)
  PROBE_OK="$ok" \
  PROBE_GH_PRESENT="$gh_present" \
  PROBE_GH_PATH="$gh_bin" \
  PROBE_GH_AUTH="$gh_auth" \
  PROBE_GH_TOKEN_SET="$([[ -n "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]] && echo true || echo false)" \
  PROBE_WORKFLOW_PRESENT="$workflow_present" \
  PROBE_WORKFLOW_PATH="$workflow_path" \
  PROBE_REPO="$repo" \
  PROBE_RUNNER_ONLINE="$runner_online" \
  PROBE_RUNNER_SOURCE="$runner_source" \
  PROBE_SECRETS_JSON="$secrets_json" \
  PROBE_VARS_JSON="$vars_json" \
  PROBE_SECRETS_CHECKABLE="$secrets_checkable" \
  PROBE_VARS_CHECKABLE="$vars_checkable" \
  PROBE_NEXT="$next_joined" \
  PROBE_NOTE="$note" \
  PROBE_RUNNER_ERRORS="$(printf '%s\0' "${runner_errors[@]:-}")" \
  python3 <<'PY'
import json, os

def b(name: str) -> bool:
    return os.environ.get(name, "") == "true"

def maybe(s: str):
    return s if s else None

secrets = {}
vars_ = {}
try:
    secrets = json.loads(os.environ.get("PROBE_SECRETS_JSON") or "{}")
except Exception:
    secrets = {}
try:
    vars_ = json.loads(os.environ.get("PROBE_VARS_JSON") or "{}")
except Exception:
    vars_ = {}

# runner errors packed with NUL separators
err_raw = os.environ.get("PROBE_RUNNER_ERRORS") or ""
runner_errors = [e for e in err_raw.split("\0") if e]

payload = {
    "ok": b("PROBE_OK"),
    "task": "GATE-FIX-G4",
    "probe": "ci-e2e-prereqs",
    "gh_present": b("PROBE_GH_PRESENT"),
    "gh_path": maybe(os.environ.get("PROBE_GH_PATH") or ""),
    "gh_authenticated": b("PROBE_GH_AUTH"),
    "gh_token_env_set": b("PROBE_GH_TOKEN_SET"),
    "workflow_present": b("PROBE_WORKFLOW_PRESENT"),
    "workflow_path": os.environ.get("PROBE_WORKFLOW_PATH") or None,
    "repository": maybe(os.environ.get("PROBE_REPO") or ""),
    "runner_online": b("PROBE_RUNNER_ONLINE"),
    "runner_source": os.environ.get("PROBE_RUNNER_SOURCE") or "none",
    "runner_errors": runner_errors,
    "secrets": secrets,
    "vars": vars_,
    "secrets_checkable": b("PROBE_SECRETS_CHECKABLE"),
    "vars_checkable": b("PROBE_VARS_CHECKABLE"),
    "next_input_needed": maybe(os.environ.get("PROBE_NEXT") or ""),
    "note": maybe(os.environ.get("PROBE_NOTE") or ""),
}
print(json.dumps(payload, indent=2))
PY

  if [[ "$ok" == "true" ]]; then
    return 0
  fi
  return 1
}

case "$mode" in
  --check)
    run_check
    ;;
  -h|--help)
    cat <<'EOF'
Usage:
  probe-ci-e2e-prereqs.sh --check

Exit 0 + ok:true only when gh/auth/workflow/runner/secrets/vars are ready for
real `gh workflow run ci-e2e.yml`. Never prints secret values.
EOF
    exit 0
    ;;
  *)
    echo "probe-ci-e2e-prereqs: unknown mode: $mode (use --check)" >&2
    exit 2
    ;;
esac
