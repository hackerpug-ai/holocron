# Self-hosted GitHub Actions runner (tailnet)

## Placement

Register the runner on a host reachable on the Tailscale tailnet that can open:

- Nonprod Postgres (`holocron_nonprod`)
- Fleet inference endpoints
- GitHub Actions service (egress)

## Registration (operator)

```bash
export RUNNER_TOKEN=...          # from repo Settings → Actions → Runners (never commit)
export RUNNER_DIR=./actions-runner
export RUNNER_LABELS=self-hosted,holocron,integration,e2e
./scripts/ci/register-runner.sh
```

Token rotation: revoke the old registration token in GitHub, re-run the script with a fresh `RUNNER_TOKEN`. Credentials live under `actions-runner/.runner` and `.credentials` (gitignored).

## Status probe

```bash
bun services/platform/src/cli/holo.ts ci runner:status --json
```

Exits 0 only when at least one online runner carries labels `self-hosted`, `holocron`, and `integration`. Offline / missing labels fail closed (nonzero).

Optional local override for air-gapped proof:

```bash
export HOLO_RUNNER_STATUS_FILE=/path/to/status.json
```

Status file schema:

```json
{
  "online": true,
  "runners": [
    { "name": "mini-1", "status": "online", "labels": ["self-hosted", "holocron", "integration"] }
  ]
}
```
