#!/usr/bin/env bash
# D03-02 — Provision the named iOS Simulator for the Maestro e2e lane.
# Create if absent; never requires manual Simulator.app interaction.
# Contract: MAESTRO_DEVICE names the simulator (default: iPhone 17).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
device_name="${MAESTRO_DEVICE:-iPhone 17}"
device_type="${MAESTRO_DEVICE_TYPE:-com.apple.CoreSimulator.SimDeviceType.iPhone-17}"
runtime_pref="${MAESTRO_IOS_RUNTIME:-}"
artifact_dir="${E2E_ARTIFACT_DIR:-$repo_root/.tmp/e2e}"
mkdir -p "$artifact_dir"
log="$artifact_dir/provision-ios-simulator.log"

fail() {
  echo "provision-ios-simulator: $*" >&2
  exit 1
}

command -v xcrun >/dev/null 2>&1 || fail "xcrun is not installed (Xcode CLI tools required)"

list_available() {
  xcrun simctl list devices available
}

device_listed() {
  list_available | grep -Fq "$device_name"
}

# Resolve a bootable UDID for the named device (first match).
resolve_udid() {
  xcrun simctl list devices available -j 2>/dev/null | python3 -c '
import json, sys
name = sys.argv[1]
data = json.load(sys.stdin)
for runtime, devices in data.get("devices", {}).items():
    for d in devices:
        if d.get("name") == name and d.get("isAvailable", True):
            print(d["udid"])
            sys.exit(0)
sys.exit(1)
' "$device_name" 2>/dev/null || true
}

pick_runtime() {
  if [[ -n "$runtime_pref" ]]; then
    echo "$runtime_pref"
    return
  fi
  # Prefer the newest available iOS runtime.
  xcrun simctl list runtimes available -j 2>/dev/null | python3 -c '
import json, sys
data = json.load(sys.stdin)
runtimes = [
    r for r in data.get("runtimes", [])
    if r.get("isAvailable", True) and "iOS" in r.get("name", "")
]
if not runtimes:
    sys.exit(1)
runtimes.sort(key=lambda r: r.get("version", ""), reverse=True)
print(runtimes[0]["identifier"])
' 2>/dev/null || {
    # Fallback: parse text listing
    xcrun simctl list runtimes available | awk -F'[()]' '/iOS/{print $2}' | tail -1
  }
}

{
  echo "=== provision-ios-simulator $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  echo "MAESTRO_DEVICE=$device_name"
  echo "MAESTRO_DEVICE_TYPE=$device_type"
} | tee "$log"

if device_listed; then
  echo "provision-ios-simulator: device already available: $device_name" | tee -a "$log"
else
  runtime="$(pick_runtime)"
  [[ -n "$runtime" ]] || fail "no available iOS Simulator runtime found"
  echo "provision-ios-simulator: creating '$device_name' type=$device_type runtime=$runtime" | tee -a "$log"
  # simctl create fails if the name already exists in unavailable state — delete first.
  existing_udid="$(xcrun simctl list devices -j 2>/dev/null | python3 -c '
import json, sys
name = sys.argv[1]
data = json.load(sys.stdin)
for runtime, devices in data.get("devices", {}).items():
    for d in devices:
        if d.get("name") == name:
            print(d["udid"])
            sys.exit(0)
sys.exit(0)
' "$device_name" 2>/dev/null || true)"
  if [[ -n "${existing_udid:-}" ]]; then
    echo "provision-ios-simulator: deleting unavailable device $existing_udid" | tee -a "$log"
    xcrun simctl delete "$existing_udid" >>"$log" 2>&1 || true
  fi
  created_udid="$(xcrun simctl create "$device_name" "$device_type" "$runtime" 2>>"$log")"
  [[ -n "$created_udid" ]] || fail "simctl create failed for $device_name (see $log)"
  echo "provision-ios-simulator: created udid=$created_udid" | tee -a "$log"
fi

device_listed || fail "device not listed after provision: $device_name"

udid="$(resolve_udid)"
[[ -n "$udid" ]] || fail "could not resolve UDID for $device_name"

# Boot if not already booted (idempotent).
state="$(xcrun simctl list devices | awk -v wanted="$device_name" '
  $0 ~ wanted {
    if ($0 ~ /\(Booted\)/) { print "Booted"; exit }
    if ($0 ~ /\(Shutdown\)/) { print "Shutdown"; exit }
    print "Unknown"; exit
  }
')"
if [[ "$state" != "Booted" ]]; then
  echo "provision-ios-simulator: booting $device_name ($udid)" | tee -a "$log"
  xcrun simctl boot "$udid" >>"$log" 2>&1 || true
fi
xcrun simctl bootstatus "$udid" -b >>"$log" 2>&1
echo "provision-ios-simulator: boot ok device=$device_name udid=$udid" | tee -a "$log"

# Export-friendly summary for operators / CI.
# Last stdout line is always a shell export so: eval "$(./scripts/e2e/provision-ios-simulator.sh | tail -1)"
printf '%s\n' "$device_name" >"$artifact_dir/MAESTRO_DEVICE"
echo "provision-ios-simulator: done" >&2
echo "export MAESTRO_DEVICE=$(printf %q "$device_name")"
