#!/usr/bin/env bash
# GATE-FIX-G1 — Fail-closed probe for Expo development-simulator rebuild prereqs.
#
# Usage:
#   scripts/e2e/probe-expo-dev-client-prereqs.sh --check
#   scripts/e2e/probe-expo-dev-client-prereqs.sh --diagnose
#
# --check:
#   Exit 0 + JSON ok:true only when eas is resolvable AND authenticated
#   (EXPO_TOKEN or eas whoami) AND E2E seed is not the sole green path.
#   Otherwise exit non-zero + JSON ok:false with next_input_needed naming
#   eas install/login.
#
# --diagnose:
#   Writes .tmp/e2e/expo-dev-client/crash-diagnosis.md from this-cycle Maestro
#   fail evidence + known crashing reuse-existing seed. Always produces a
#   non-empty diagnosis; exit 0 if written, non-zero if write failed.
#
# Env:
#   EXPO_TOKEN          — Expo auth token (preferred non-interactive)
#   E2E_SEED_APP_PATH   — when set, probe still reports seed_present but does
#                         NOT treat seed as eas-authenticated rebuild readiness
#   FORCE_EAS_BUILD     — informational; included in JSON
#   EXPO_DEV_BUILD_OUT_DIR / REPO overrides via normal layout
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
out_dir="${EXPO_DEV_BUILD_OUT_DIR:-$repo_root/.tmp/e2e/expo-dev-client}"
diagnosis_path="${EXPO_CRASH_DIAGNOSIS_PATH:-$out_dir/crash-diagnosis.md}"
failed_cycle_dir="${MAESTRO_FAILED_CYCLE_DIR:-$repo_root/.tmp/maestro-reference-flow/failed-this-cycle}"
seed_d03="${D03_02_CRASHING_SEED:-$repo_root/.worktrees/D03-02/.tmp/e2e/expo-dev-client/holocron.app}"
seed_prov="${D03_02_CRASHING_PROVENANCE:-$repo_root/.worktrees/D03-02/.tmp/e2e/expo-dev-client/build-provenance.json}"

mode="${1:---check}"

resolve_eas() {
  if command -v eas >/dev/null 2>&1; then
    echo "eas"
    return 0
  fi
  if [[ -x "$repo_root/node_modules/.bin/eas" ]]; then
    echo "$repo_root/node_modules/.bin/eas"
    return 0
  fi
  # Prefer bunx — npx eas-cli hits minimatch TypeError on some Node hosts.
  # Pin >= eas.json cli.version (>= 18.0.0).
  if command -v bunx >/dev/null 2>&1; then
    echo "bunx eas-cli@21.0.2"
    return 0
  fi
  if command -v npx >/dev/null 2>&1; then
    echo "npx --yes eas-cli@21.0.2"
    return 0
  fi
  return 1
}

eas_whoami_ok() {
  local eas_cmd="$1"
  # shellcheck disable=SC2086
  $eas_cmd whoami --non-interactive >/dev/null 2>&1
}

emit_json() {
  # Args: ok eas_resolvable authenticated eas_cmd next_input_needed seed_present note
  python3 - "$@" <<'PY'
import json, sys
ok = sys.argv[1] == "true"
eas_resolvable = sys.argv[2] == "true"
authenticated = sys.argv[3] == "true"
eas_cmd = sys.argv[4]
next_input = sys.argv[5]
seed_present = sys.argv[6] == "true"
note = sys.argv[7] if len(sys.argv) > 7 else ""
payload = {
    "ok": ok,
    "task": "GATE-FIX-G1",
    "probe": "expo-dev-client-prereqs",
    "eas_resolvable": eas_resolvable,
    "authenticated": authenticated,
    "eas_cmd": eas_cmd or None,
    "expo_token_set": bool(__import__("os").environ.get("EXPO_TOKEN")),
    "e2e_seed_app_path_set": bool(__import__("os").environ.get("E2E_SEED_APP_PATH")),
    "force_eas_build": __import__("os").environ.get("FORCE_EAS_BUILD", "0") == "1",
    "seed_present": seed_present,
    "next_input_needed": next_input or None,
    "note": note or None,
}
print(json.dumps(payload, indent=2))
PY
}

run_check() {
  local eas_cmd="" eas_resolvable=false authenticated=false
  local next_input="" ok=false seed_present=false note=""

  if [[ -n "${E2E_SEED_APP_PATH:-}" ]] && [[ -d "${E2E_SEED_APP_PATH}" ]]; then
    seed_present=true
  fi
  if [[ -d "$seed_d03" ]]; then
    seed_present=true
  fi

  if eas_cmd="$(resolve_eas)"; then
    eas_resolvable=true
  else
    eas_cmd=""
    next_input="Install eas-cli (prefer: bunx eas-cli@21.0.2 or npm i -g eas-cli@21.0.2; must satisfy eas.json >= 18.0.0) so FORCE_EAS_BUILD can rebuild the Expo development-simulator holocron.app. Do not greenwash reuse-existing crashing seed."
    emit_json false false false "" "$next_input" "$seed_present" "eas CLI not resolvable on PATH"
    return 1
  fi

  if [[ -n "${EXPO_TOKEN:-}" ]]; then
    authenticated=true
  elif eas_whoami_ok "$eas_cmd"; then
    authenticated=true
  else
    next_input="Authenticate Expo for eas: set EXPO_TOKEN or run 'eas login' (whoami failed). Required for FORCE_EAS_BUILD=1 method=eas rebuild; seed/reuse-existing is not a rebuild success."
    emit_json false true false "$eas_cmd" "$next_input" "$seed_present" "eas present but unauthenticated"
    return 1
  fi

  # Authenticated + resolvable → ok for rebuild path.
  # Explicitly do NOT treat seed_present alone as ok.
  ok=true
  note="eas resolvable and authenticated; FORCE_EAS_BUILD=1 may proceed"
  emit_json true true true "$eas_cmd" "" "$seed_present" "$note"
  return 0
}

write_diagnosis() {
  mkdir -p "$(dirname "$diagnosis_path")"
  local junit_fail="unknown"
  local crash_excerpt=""
  local seed_method="unknown"
  local seed_exists="false"

  if [[ -f "$failed_cycle_dir/junit.xml" ]]; then
    if grep -q 'failures="[1-9]' "$failed_cycle_dir/junit.xml" 2>/dev/null; then
      junit_fail="failures>=1"
    else
      junit_fail="present"
    fi
  fi
  if [[ -f "$failed_cycle_dir/coldboot-launch.err" ]]; then
    crash_excerpt="$(head -c 1200 "$failed_cycle_dir/coldboot-launch.err" | tr '\n' ' ')"
  fi
  if [[ -f "$seed_prov" ]]; then
    seed_method="$(python3 -c "import json;print(json.load(open('$seed_prov')).get('method','unknown'))" 2>/dev/null || echo unknown)"
  fi
  if [[ -d "$seed_d03" ]]; then
    seed_exists="true"
  fi

  cat >"$diagnosis_path" <<EOF
# Expo dev-client crash diagnosis (GATE-FIX-G1)

## Root cause class

**stale-reuse-existing-dev-client** — Maestro cold-boot crashed while executing
the reference flow against a \`method=reuse-existing\` holocron.app seed (D03-02),
not a fresh \`method=eas\` / \`method=eas-local\` FORCE_EAS_BUILD artifact.

## Evidence this cycle

| Signal | Value |
|--------|-------|
| failed-this-cycle junit | ${junit_fail} |
| D03-02 seed exists | ${seed_exists} |
| D03-02 provenance method | ${seed_method} |
| seed path | \`${seed_d03}\` |
| failed-cycle dir | \`${failed_cycle_dir}\` |

### coldboot-launch.err (excerpt)

\`\`\`
${crash_excerpt:-"(no coldboot-launch.err found)"}
\`\`\`

## Why reuse-existing is rejected as rebuild success

- AC-2 / AC-4 require \`build-provenance.json\` with \`method\` equal to \`eas\` or
  \`eas-local\` after \`FORCE_EAS_BUILD=1\`.
- A crashing seed with \`method=reuse-existing\` proves only that an old bundle
  was staged; it does **not** satisfy a rebuild.
- Historical Maestro SUCCESS (e.g. official11) must not substitute for a live
  rebuild of the development-simulator profile.

## Remediation

1. Ensure eas is on PATH (prefer \`bunx eas-cli@21.0.2\`, ≥18 per eas.json) and Expo auth via
   \`EXPO_TOKEN\` or \`eas login\`.
2. Run: \`FORCE_EAS_BUILD=1 env -u E2E_SEED_APP_PATH scripts/e2e/build-expo-dev-client.sh\`
3. Confirm: \`jq -e '.method=="eas" or .method=="eas-local"' .tmp/e2e/expo-dev-client/build-provenance.json\`
4. Install: \`xcrun simctl install "\${MAESTRO_DEVICE:-iPhone 17}" "\$EXPO_DEV_BUILD_PATH"\`
5. Re-run Maestro reference flow; do not claim coldboot_gate green from this diagnosis alone.

## Honesty contract

- NEVER claim green by reusing the D03-02 crashing seed as rebuild success.
- NEVER hardcode coldboot_gate green from this file.
EOF

  if [[ ! -s "$diagnosis_path" ]]; then
    echo "probe-expo-dev-client-prereqs: failed to write diagnosis at $diagnosis_path" >&2
    return 1
  fi
  echo "probe-expo-dev-client-prereqs: wrote $diagnosis_path" >&2
  # Also emit a tiny JSON receipt for tests/evidence.
  python3 - "$diagnosis_path" <<'PY'
import json, sys, os
path = sys.argv[1]
print(json.dumps({
    "ok": True,
    "task": "GATE-FIX-G1",
    "probe": "crash-diagnosis",
    "path": path,
    "bytes": os.path.getsize(path),
    "contains_root_cause": "root cause" in open(path, encoding="utf-8").read().lower(),
}, indent=2))
PY
  return 0
}

case "$mode" in
  --check)
    run_check
    ;;
  --diagnose)
    write_diagnosis
    ;;
  -h|--help)
    cat <<'EOF'
Usage:
  probe-expo-dev-client-prereqs.sh --check
  probe-expo-dev-client-prereqs.sh --diagnose
EOF
    exit 0
    ;;
  *)
    echo "probe-expo-dev-client-prereqs: unknown mode: $mode (use --check or --diagnose)" >&2
    exit 2
    ;;
esac
