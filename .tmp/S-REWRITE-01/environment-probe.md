# S-REWRITE-01 environment probe

## Simulator / Maestro
- iPhone 17 (C79BF38C-D353-46A2-A1ED-CCA6D68E1B04) **Booted**
- `maestro` at `/opt/homebrew/bin/maestro`
- Maestro flows authored under `.maestro/chat/*.yml`

## Services
| Service | Endpoint | Status |
|---------|----------|--------|
| Platform Hono | :4111/health | 200 |
| Metro | :8081/status | 000 (down) |
| Zero cache | :4848 | 000 (down) |

## Seed
- `holo seed:e2e --reset` → **unknown command** (not implemented on this CLI)
- Available: `holo db seed --reset` (seeds 1 Sprint 20 reference conversation, not the 3-conversation e2e fixture)

## Implication
Behavioral Maestro ACs (AC-1..AC-5) cannot complete against real substrate in this sandbox without Metro + Zero + seed:e2e. Static/integration proofs (AC-6 + Zero seam contracts) are GREEN. Maestro flows are in place for when substrate is provisioned.
