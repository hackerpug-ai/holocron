# Self-hosted runner label contract

Required labels for Holocron CI lanes (D02-03 / T-PLAT-019 / D03-02):

| Label | Required by | Purpose |
|-------|-------------|---------|
| `self-hosted` | all self-hosted jobs | GitHub default self-hosted class |
| `holocron` | integration + e2e | Project isolation on shared hosts |
| `integration` | integration lane (`ci-integration.yml`) | Real Postgres + fleet jobs |
| `e2e` | e2e lane (Sprint 20 Maestro) | macOS cold-boot reference flow |

## Fail-closed rule

Integration workflows MUST set:

```yaml
runs-on: [self-hosted, holocron, integration]
```

E2E workflows MUST set:

```yaml
runs-on: [self-hosted, holocron, e2e]
```

If no online runner carries the full label set, the job stays queued or fails —
never fall back to `ubuntu-latest` with mocks.

## Health probes (`holo ci runner:status`)

| Lane | Command | Required labels | Extra probes |
|------|---------|-----------------|--------------|
| `integration` (default) | `holo ci runner:status --json` | `self-hosted`, `holocron`, `integration` | none |
| `e2e` | `holo ci runner:status --json --lane e2e` | `self-hosted`, `holocron`, `e2e` | **real** `MAESTRO_DEVICE` via `xcrun simctl list devices available`; **real** `EXPO_DEV_BUILD_PATH` as a valid `.app` (directory with `Info.plist`) |

E2E probe rules (D03-02):

- `simulator_present` / `build_present` are **never** hardcoded to `true`.
- Missing simulator **or** missing/stale build ⇒ exit non-zero and `online: false`.
- Registration already defaults to `self-hosted,holocron,integration,e2e` via
  `scripts/ci/register-runner.sh` (`RUNNER_LABELS`).

See [macos-e2e-runner.md](./macos-e2e-runner.md) for provisioning scripts and
environment variables.
