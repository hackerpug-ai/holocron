# macOS e2e runner — simulator + Expo dev-client (D03-02)

Provisions the self-hosted macOS host so the Sprint 20 Maestro lane can:

1. Boot a **named iOS Simulator** (`MAESTRO_DEVICE`)
2. Install a real **Expo development build** (`EXPO_DEV_BUILD_PATH`)
3. Fail closed via `holo ci runner:status --json --lane e2e` when either is missing

This extends the Sprint 13 runner substrate (`scripts/ci/register-runner.sh`, labels
`self-hosted,holocron,integration,e2e`). Registration itself already advertises `e2e`;
this doc owns the **simulator + build pipeline** and the **e2e health probe**.

## Prerequisites

| Tool | Check |
|------|--------|
| macOS + Xcode CLI | `xcodebuild -version` |
| simctl | `xcrun simctl list devices available` |
| Maestro | `maestro --version` |
| Bun | `bun --version` |
| EAS CLI (for fresh builds) | `bunx eas-cli@21.0.2` (preferred; must be ≥18 per eas.json), `eas` on PATH, or `npx --yes eas-cli@21.0.2` |
| Expo auth | `EXPO_TOKEN` set **or** `eas login` / `bunx eas-cli@21.0.2 whoami` |
| fastlane (local iOS builds) | `brew install fastlane` — required for `eas build --local` on macOS |

Runner registration token (`RUNNER_TOKEN`) is **never** committed. See
[self-hosted-runner.md](./self-hosted-runner.md).

## 1. Register the runner (once per host)

```bash
export RUNNER_TOKEN=...   # GitHub → Settings → Actions → Runners
export RUNNER_LABELS=self-hosted,holocron,integration,e2e
./scripts/ci/register-runner.sh
cd "${RUNNER_DIR:-./actions-runner}" && ./run.sh
```

## 2. Provision the named iOS Simulator

```bash
export MAESTRO_DEVICE="${MAESTRO_DEVICE:-iPhone 17}"
./scripts/e2e/provision-ios-simulator.sh
xcrun simctl list devices available | rg -F "$MAESTRO_DEVICE"
```

- Creates the device if absent (`simctl create`) — no Simulator.app clicks.
- Boots and waits via `simctl bootstatus`.
- Defaults: device name `iPhone 17`, type `com.apple.CoreSimulator.SimDeviceType.iPhone-17`.
- Overrides: `MAESTRO_DEVICE_TYPE`, `MAESTRO_IOS_RUNTIME`.

## 3. Produce the Expo dev-client build

### Fail-closed prereq probe (GATE-FIX-G1)

Before a forced rebuild, operators can check eas + Expo auth without greenwashing a
crashing seed:

```bash
# Exit non-zero + JSON ok:false + next_input_needed when eas/auth missing
scripts/e2e/probe-expo-dev-client-prereqs.sh --check

# Write crash-diagnosis.md from failed-this-cycle + D03-02 reuse-existing seed
scripts/e2e/probe-expo-dev-client-prereqs.sh --diagnose
```

Probe contract:

| Condition | Exit | Observables |
|-----------|------|-------------|
| eas not resolvable (no `eas` / bunx / npx) | ≠0 | `ok: false`, `next_input_needed` contains **eas** |
| eas present, no `EXPO_TOKEN` / whoami fails | ≠0 | `ok: false`, `next_input_needed` names login/token |
| eas + auth OK | 0 | `ok: true` — seed alone never sets ok |

### Canonical rebuild path (FORCE_EAS_BUILD)

```bash
# Prefer bunx when eas is not on PATH (npx eas-cli can hit minimatch TypeError)
export FORCE_EAS_BUILD=1
env -u E2E_SEED_APP_PATH ./scripts/e2e/build-expo-dev-client.sh
# prints: export EXPO_DEV_BUILD_PATH=...
eval "$(FORCE_EAS_BUILD=1 env -u E2E_SEED_APP_PATH ./scripts/e2e/build-expo-dev-client.sh | tail -1)"
test -d "$EXPO_DEV_BUILD_PATH"
jq -e '.method=="eas" or .method=="eas-local" or .method=="eas-local-discovered"' \
  .tmp/e2e/expo-dev-client/build-provenance.json
```

Under the hood (`resolve_eas` order: `eas` → `node_modules/.bin/eas` →
`bunx eas-cli@21.0.2` → `npx --yes eas-cli@21.0.2`):

```bash
eas build --platform ios --profile development-simulator --local
```

(`eas.json` profile `development-simulator` sets `ios.simulator: true`.)

Default artifact:

```
.tmp/e2e/expo-dev-client/holocron.app
.tmp/e2e/expo-dev-client/build-provenance.json
.tmp/e2e/expo-dev-client/crash-diagnosis.md   # from probe --diagnose
```

`.tmp/` and `*.app` are gitignored — never commit the bundle or Expo tokens.

**Honesty:** `method=reuse-existing` (e.g. D03-02 crashing seed) is **not** a rebuild
success. `FORCE_EAS_BUILD=1` ignores `E2E_SEED_APP_PATH` and fails closed when eas/auth
is missing (`next_input_needed`).

### Operator seed (optional — never under FORCE_EAS_BUILD)

On a host that already has a simulator `.app` (e.g. prior `expo run:ios` DerivedData),
you may stage it without a full EAS rebuild **only when FORCE_EAS_BUILD is unset**:

```bash
export E2E_SEED_APP_PATH="$HOME/Library/Developer/Xcode/DerivedData/.../Debug-iphonesimulator/holocron.app"
./scripts/e2e/build-expo-dev-client.sh
```

CI production path remains `eas build --local`. Force a rebuild with `FORCE_EAS_BUILD=1`.

### Install onto the simulator

```bash
xcrun simctl install "$MAESTRO_DEVICE" "$EXPO_DEV_BUILD_PATH"
```

## 4. Health probe (fail-closed)

```bash
export MAESTRO_DEVICE=iPhone 17
export EXPO_DEV_BUILD_PATH=/path/to/holocron.app
# Optional offline status file when GitHub API is unreachable:
# export HOLO_RUNNER_STATUS_FILE=/path/to/status.json

bun services/platform/src/cli/holo.ts ci runner:status --json --lane e2e
```

Success shape (fields always real — never hardcoded):

```json
{
  "ok": true,
  "online": true,
  "lane": "e2e",
  "required_labels": ["self-hosted", "holocron", "e2e"],
  "matching_runners": [{ "name": "...", "status": "online", "labels": ["self-hosted", "holocron", "e2e"] }],
  "simulator_present": true,
  "simulator_name": "iPhone 17",
  "build_present": true,
  "build_path": "/.../holocron.app",
  "errors": []
}
```

### Fail-closed cases

| Missing | Exit | Observables |
|---------|------|-------------|
| No online runner with `e2e` label | ≠0 | `online: false`, errors mention labels |
| `MAESTRO_DEVICE` unset / not in simctl | ≠0 | `simulator_present: false` |
| `EXPO_DEV_BUILD_PATH` unset / missing / no `Info.plist` | ≠0 | `build_present: false`, errors mention **build** |

Integration lane is unchanged:

```bash
bun services/platform/src/cli/holo.ts ci runner:status --json
# or --lane integration
```

## 5. Wire into Maestro harness (D03-03)

```bash
export MAESTRO_DEVICE=iPhone 17
export EXPO_DEV_BUILD_PATH=...   # from build script
export DATABASE_URL=postgres://.../holocron_nonprod
export FLEET_URL=...
export EXPO_PUBLIC_PLATFORM_URL=...
export EXPO_PUBLIC_RN_API_KEY=...
export ZERO_ADMIN_PASSWORD=...
scripts/e2e/run-maestro-reference-flow.sh --check
```

## Secrets / vars (GitHub)

| Name | Kind | Purpose |
|------|------|---------|
| `MAESTRO_DEVICE` | repo variable | Named simulator (e.g. `iPhone 17`) |
| `EXPO_DEV_BUILD_PATH` | repo variable / runner env | Absolute path to `.app` on the runner host |
| `RUNNER_TOKEN` | operator secret | Registration only — never stored in repo |
| App / EAS credentials | EAS / secrets.yaml | Local eas build as needed |

Do **not** commit actions-runner credentials, provisioning profiles, or `.app` bundles.

## Verification matrix

| AC | Command |
|----|---------|
| AC-1 | `bun services/platform/src/cli/holo.ts ci runner:status --json --lane e2e` |
| AC-2 | `scripts/e2e/provision-ios-simulator.sh && xcrun simctl list devices available \| rg -F "$MAESTRO_DEVICE"` |
| AC-3 | `scripts/e2e/build-expo-dev-client.sh && test -d "$EXPO_DEV_BUILD_PATH"` |
| AC-4 | unset build path → same status command exits non-zero |

Integration test:

```bash
PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-macos-runner-status.test.ts
```

### GATE-FIX-G1 rebuild honesty

```bash
# Fail-closed prereqs + crash diagnosis + FORCE_EAS_BUILD provenance + simctl install
PLATFORM_IT=1 MAESTRO_DEVICE='iPhone 17' \
  pnpm vitest run tests/integration/sprint20-expo-dev-client-rebuild.test.ts
```

| AC | Command |
|----|---------|
| AC-1 | `env -u EXPO_TOKEN -u E2E_SEED_APP_PATH PATH=/usr/bin:/bin bash scripts/e2e/probe-expo-dev-client-prereqs.sh --check` → ≠0 |
| AC-2 | `jq -e '.method=="eas" or .method=="eas-local"' .tmp/e2e/expo-dev-client/build-provenance.json` |
| AC-3 | `xcrun simctl install "$MAESTRO_DEVICE" "$EXPO_DEV_BUILD_PATH"` |
| AC-4 | `scripts/e2e/probe-expo-dev-client-prereqs.sh --diagnose && test -s .tmp/e2e/expo-dev-client/crash-diagnosis.md` |
