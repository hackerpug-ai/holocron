#!/usr/bin/env bash
# D03-02 — Produce an installable Expo dev-client .app for the Maestro e2e lane.
# Primary path: eas build --platform ios --profile development-simulator --local
# No manual Xcode / Simulator.app step.
#
# Output (default):
#   $REPO/.tmp/e2e/expo-dev-client/holocron.app
#   $REPO/.tmp/e2e/expo-dev-client/build-provenance.json
#
# Env:
#   EXPO_DEV_BUILD_PATH   — final .app path (default under .tmp/e2e/...)
#   EXPO_DEV_BUILD_OUT_DIR — parent directory for the .app
#   EAS_BUILD_PROFILE     — default development-simulator
#   E2E_SEED_APP_PATH     — optional prebuilt .app to stage when eas is unavailable
#                           (operator shortcut on a host that already has a simulator
#                           build; CI MUST use the eas path)
#   FORCE_EAS_BUILD=1     — rebuild even if a valid .app already exists
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
out_dir="${EXPO_DEV_BUILD_OUT_DIR:-$repo_root/.tmp/e2e/expo-dev-client}"
profile="${EAS_BUILD_PROFILE:-development-simulator}"
app_name="${EXPO_DEV_APP_NAME:-holocron.app}"
default_app="$out_dir/$app_name"
app_path="${EXPO_DEV_BUILD_PATH:-$default_app}"
# If EXPO_DEV_BUILD_PATH points at a non-default location, still stage there.
artifact_dir="${E2E_ARTIFACT_DIR:-$repo_root/.tmp/e2e}"
mkdir -p "$out_dir" "$artifact_dir"
log="$artifact_dir/build-expo-dev-client.log"
provenance="$out_dir/build-provenance.json"

fail() {
  echo "build-expo-dev-client: $*" >&2
  exit 1
}

is_valid_app() {
  local p="$1"
  [[ -d "$p" ]] && [[ "$(basename "$p")" == *.app ]] && [[ -f "$p/Info.plist" ]]
}

stage_app_from() {
  local src="$1"
  local dest="$2"
  is_valid_app "$src" || fail "seed/source is not a valid .app bundle: $src"
  mkdir -p "$(dirname "$dest")"
  rm -rf "$dest"
  # Prefer ditto for preserving macOS app bundle metadata.
  if command -v ditto >/dev/null 2>&1; then
    ditto "$src" "$dest"
  else
    cp -R "$src" "$dest"
  fi
  is_valid_app "$dest" || fail "staged app is invalid: $dest"
}

write_provenance() {
  local method="$1"
  local source_ref="$2"
  local started="$3"
  local finished
  finished="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  python3 - "$provenance" "$method" "$source_ref" "$app_path" "$started" "$finished" "$profile" <<'PY'
import json, sys, os
path, method, source, app, started, finished, profile = sys.argv[1:8]
payload = {
    "task": "D03-02",
    "method": method,
    "source": source,
    "app_path": app,
    "profile": profile,
    "started_at": started,
    "finished_at": finished,
    "host": os.uname().nodename if hasattr(os, "uname") else "",
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
print(json.dumps(payload, indent=2))
PY
}

resolve_eas() {
  if command -v eas >/dev/null 2>&1; then
    echo "eas"
    return
  fi
  if [[ -x "$repo_root/node_modules/.bin/eas" ]]; then
    echo "$repo_root/node_modules/.bin/eas"
    return
  fi
  # npx pulls eas-cli ephemerally — no package.json change required.
  if command -v npx >/dev/null 2>&1; then
    echo "npx --yes eas-cli@16.28.0"
    return
  fi
  return 1
}

find_tar_app() {
  # After eas --local, look for a produced .app under out_dir / artifact_dir / cwd.
  local found
  found="$(find "$out_dir" "$artifact_dir" "$repo_root" -maxdepth 4 -type d -name '*.app' 2>/dev/null | head -1 || true)"
  echo "$found"
}

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  echo "=== build-expo-dev-client $started_at ==="
  echo "profile=$profile"
  echo "target=$app_path"
} | tee "$log"

# Idempotent reuse of a valid existing build unless FORCE_EAS_BUILD=1.
emit_export() {
  # Last stdout line is always a shell export so: eval "$(./scripts/e2e/build-expo-dev-client.sh | tail -1)"
  printf '%s\n' "$app_path" >"$artifact_dir/EXPO_DEV_BUILD_PATH"
  echo "export EXPO_DEV_BUILD_PATH=$(printf %q "$app_path")"
}

if [[ "${FORCE_EAS_BUILD:-0}" != "1" ]] && is_valid_app "$app_path"; then
  echo "build-expo-dev-client: reusing existing valid app at $app_path" | tee -a "$log" >&2
  write_provenance "reuse-existing" "$app_path" "$started_at" | tee -a "$log" >/dev/null
  echo "build-expo-dev-client: done (reuse)" >&2
  emit_export
  exit 0
fi

# Optional operator seed (prebuilt simulator .app) — not the CI production path.
if [[ -n "${E2E_SEED_APP_PATH:-}" ]]; then
  echo "build-expo-dev-client: staging from E2E_SEED_APP_PATH=$E2E_SEED_APP_PATH" | tee -a "$log" >&2
  stage_app_from "$E2E_SEED_APP_PATH" "$app_path"
  write_provenance "seed-app-path" "$E2E_SEED_APP_PATH" "$started_at" | tee -a "$log" >/dev/null
  echo "build-expo-dev-client: done (seed)" >&2
  emit_export
  exit 0
fi

eas_cmd="$(resolve_eas)" || fail "eas CLI not found; install eas-cli or set E2E_SEED_APP_PATH to a valid simulator .app"
echo "build-expo-dev-client: using eas via: $eas_cmd" | tee -a "$log"

cd "$repo_root"

# Ensure development-simulator profile exists (eas.json is authoritative).
[[ -f "$repo_root/eas.json" ]] || fail "eas.json missing at repo root"
grep -q 'development-simulator' "$repo_root/eas.json" \
  || fail "eas.json missing development-simulator profile"

archive="$out_dir/dev-client-ios.tar.gz"
rm -f "$archive"

set +e
# shellcheck disable=SC2086
$eas_cmd build \
  --platform ios \
  --profile "$profile" \
  --local \
  --non-interactive \
  --output "$archive" \
  2>&1 | tee -a "$log"
eas_status=${PIPESTATUS[0]}
set -e

if [[ $eas_status -ne 0 ]]; then
  # Fallback: some eas versions write artifacts without --output.
  found="$(find_tar_app)"
  if [[ -n "$found" ]] && is_valid_app "$found"; then
    echo "build-expo-dev-client: eas exited $eas_status but found app at $found" | tee -a "$log" >&2
    stage_app_from "$found" "$app_path"
    write_provenance "eas-local-discovered" "$found" "$started_at" | tee -a "$log" >/dev/null
    echo "build-expo-dev-client: done (eas discovered)" >&2
    emit_export
    exit 0
  fi
  fail "eas build --local failed (exit $eas_status). See $log. Or set E2E_SEED_APP_PATH to a prebuilt simulator .app."
fi

# Extract archive if produced.
if [[ -f "$archive" ]]; then
  extract_dir="$out_dir/extract"
  rm -rf "$extract_dir"
  mkdir -p "$extract_dir"
  tar -xzf "$archive" -C "$extract_dir" 2>>"$log" || true
  found="$(find "$extract_dir" -type d -name '*.app' | head -1 || true)"
  if [[ -n "$found" ]]; then
    stage_app_from "$found" "$app_path"
  else
    # Archive might itself be a renamed .app tree or contain Payload/
    payload_app="$(find "$extract_dir" -type d -path '*/Payload/*.app' | head -1 || true)"
    [[ -n "$payload_app" ]] || fail "eas archive produced no .app under $archive"
    stage_app_from "$payload_app" "$app_path"
  fi
else
  found="$(find_tar_app)"
  [[ -n "$found" ]] && is_valid_app "$found" || fail "eas build completed but no .app artifact found"
  stage_app_from "$found" "$app_path"
fi

is_valid_app "$app_path" || fail "final app invalid: $app_path"
write_provenance "eas-local" "eas build --profile $profile --local" "$started_at" | tee -a "$log" >/dev/null
echo "build-expo-dev-client: done (eas)" >&2
echo "build-expo-dev-client: install with: xcrun simctl install \"\${MAESTRO_DEVICE:-iPhone 17}\" \"$app_path\"" >&2
emit_export
