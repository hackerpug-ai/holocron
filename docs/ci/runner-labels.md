# Self-hosted runner label contract

Required labels for Holocron CI lanes (D02-03 / T-PLAT-019):

| Label | Required by | Purpose |
|-------|-------------|---------|
| `self-hosted` | all self-hosted jobs | GitHub default self-hosted class |
| `holocron` | integration + e2e | Project isolation on shared hosts |
| `integration` | integration lane (`ci-integration.yml`) | Real Postgres + fleet jobs |
| `e2e` | e2e lane scaffold (Sprint 20 Maestro) | macOS cold-boot reference flow |

## Fail-closed rule

Integration workflows MUST set:

```yaml
runs-on: [self-hosted, holocron, integration]
```

If no online runner carries the full label set, the job stays queued or fails —
never fall back to `ubuntu-latest` with mocks.
