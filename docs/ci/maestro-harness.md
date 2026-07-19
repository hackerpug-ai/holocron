# Maestro Reference-Flow Harness — `scripts/e2e/run-maestro-reference-flow.sh`

Sprint 20 D03 — fail-closed Maestro cold-boot reference-flow harness for the iOS
Expo dev-client build. The harness **never substitutes a mock app, backend,
fleet, or simulator**: every external dependency must be real and reachable or
the run fails closed (nonzero exit, zero false-pass).

## Operator invocation

```bash
# Read-only precondition probe (no boot/install/zero-cache/maestro). Safe to run
# any time; exits 0 with a JSON contract line when every gate passes.
bash scripts/e2e/run-maestro-reference-flow.sh --check

# Full cold-boot run: reset namespace, boot real zero-cache, boot/install the
# Expo dev build, record video, run the Maestro flow, write JUnit + artifacts.
bash scripts/e2e/run-maestro-reference-flow.sh --run
```

`--check` is the default-fast mode for CI/dev-loop triage; `--run` is the real
evidence-producing mode. `--run` is what QA exercises after review.

## Fail-closed posture

Every precondition below is checked in order and aborts with a descriptive
stderr message + exit 1 on any miss. There is **no skip, no mock, no
silent-retry**:

1. `MAESTRO_DEVICE` names an available iOS Simulator (verified against
   `xcrun simctl list devices available`).
2. `DATABASE_URL` is present **and** targets the `holocron_nonprod` namespace.
3. `FLEET_URL` is present (real OpenAI-compatible fleet; no inference substitute).
4. A platform URL is present (`EXPO_PUBLIC_PLATFORM_URL` or `PLATFORM_URL`).
5. `EXPO_PUBLIC_RN_API_KEY` is present (Hono chat command credential).
6. `EXPO_PUBLIC_REFERENCE_FLOW` is `true` (the reference build flag).
7. `ZERO_ADMIN_PASSWORD` is present (real zero-cache admin credential).
8. `maestro` and `xcrun` CLIs are installed.
9. The Maestro flow file exists.
10. `EXPO_DEV_BUILD_PATH` points at a real `.app` **directory** bundle
    (strict `-d` check — an iOS `.app` is a directory, not a file).
11. The named simulator UDID is present in `simctl list`.

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `MAESTRO_DEVICE` | yes | iOS Simulator UDID to boot + install against. |
| `EXPO_DEV_BUILD_PATH` | yes | Path to the Expo dev-client `.app` **directory** bundle. |
| `DATABASE_URL` | yes | Nonprod Postgres; must contain `holocron_nonprod`. |
| `FLEET_URL` | yes | Real OpenAI-compatible fleet base URL. |
| `EXPO_PUBLIC_PLATFORM_URL` _or_ `PLATFORM_URL` | yes | Hono platform base URL. |
| `EXPO_PUBLIC_RN_API_KEY` | yes | API key for the Hono chat command. |
| `ZERO_ADMIN_PASSWORD` | yes | Admin password for the real zero-cache. |
| `MAESTRO_APP_ID` | no | App bundle id. Default `org.name.holocron` (matches the real Expo dev build `CFBundleIdentifier`). |
| `MAESTRO_FLOW` | no | Path to the Maestro flow YAML. Default `.e2e/maestro/reference-flow.yaml`. |
| `MAESTRO_DEV_CLIENT_MODE` | no | Dev-client session mode recorded in `dev-client-setup.json`. Default `server-list+already-running`. One of `tutorial` / `server-list+tutorial` / `server-list+already-running` / `already-running`. |
| `ZERO_PORT` | no | Port for the harness-started zero-cache. Default `4848`. |
| `ZERO_CVR_DB` / `ZERO_CHANGE_DB` | no | Override CVR/change DBs (default `DATABASE_URL`). |
| `E2E_ARTIFACT_DIR` | no | Output directory. Default `.tmp/maestro-reference-flow`. |
| `EXPO_PUBLIC_REFERENCE_FLOW` | no | Must be `true` (default). Guards the reference build. |

> **zero-cache note:** the harness starts its own zero-cache on `ZERO_PORT`
> (default `4848`) and tears it down on exit. If another zero-cache is already
> bound on a different port (e.g. `50798` from a parallel session), leave it
> running — the harness does not touch it. The `ZERO_ADMIN_PASSWORD` is passed
> straight through to the harness-owned instance only.

## Artifact directory layout (`E2E_ARTIFACT_DIR`)

`--run` writes one file per step so every action is independently auditable:

| Artifact | Step |
|----------|------|
| `namespace-reset.json` | `holo namespace reset --json` (before boot). |
| `zero-cache.log` | Real zero-cache stdout/stderr. |
| `simctl-boot.stderr` | `simctl boot` stderr (only if a boot was needed). |
| `simctl-bootstatus.txt` | `simctl bootstatus -b`. |
| `simctl-terminate.txt` | `simctl terminate` (AC-2 fresh reinstall; `|| true` on a not-yet-installed app). |
| `simctl-uninstall.txt` | `simctl uninstall` (AC-2; `|| true`). |
| `simctl-install.txt` | `simctl install` + an `installed: <path>` sentinel (install is silent on success). |
| `dev-client-setup.json` | `{"mode","app_id","flow","captured_at"}` (AC-3). |
| `video.log` | `simctl io recordVideo` stdout/stderr. |
| `reference-flow.mov` | Screen recording of the flow (`-f` overwrite-safe). |
| `junit.xml` | Maestro JUnit report. |
| `debug/` | Maestro `--debug-output`. |
| `test-output/` | Maestro `--test-output-dir`. |
| `final.png` | Final screenshot (cleanup trap). |

### AC-2 — fresh reinstall every run

Before every `simctl install`, the harness runs `simctl terminate` then
`simctl uninstall` against `MAESTRO_APP_ID`. Both tolerate a not-yet-installed
app (`|| true`, common on a fresh simulator); `install` does **not** swallow
failures. A stale build therefore cannot false-pass.

### AC-3 — dev-client mode

`dev-client-setup.json` records the dev-client session `mode` used for the run,
defaulting to `server-list+already-running` and overridable via
`MAESTRO_DEV_CLIENT_MODE`. The value must be one of the documented contract
modes (`tutorial` / `server-list+tutorial` / `server-list+already-running` /
`already-running`).

## Harness contract (D03-03 fixes)

| # | Defect | Fix |
|---|--------|-----|
| 1 | `-f` rejected real `.app` **directory** bundles. | Strict `-d` check — an iOS `.app` is a directory. |
| 2 | Default bundle id was `com.holocron.app`. | Default is `org.name.holocron` (verified `CFBundleIdentifier`). |
| 3 | `recordVideo` failed when the target file existed. | `rm -f` prior file + `recordVideo --codec=h264 -f`. |
| 4 | No terminate/uninstall before install. | AC-2 fresh reinstall sequence, each to its own artifact. |
| 5 | No dev-client mode recorded. | AC-3 `dev-client-setup.json` with overridable `mode`. |

Pinned by `tests/integration/sprint20-maestro-harness-artifacts.test.ts`
(PLATFORM_IT-gated, RED→GREEN).
