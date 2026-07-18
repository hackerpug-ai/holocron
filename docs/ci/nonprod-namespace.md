# Nonprod Postgres / Zero namespace

## Database

| Name | Purpose |
|------|---------|
| `holocron` | Production / primary dev data plane |
| `holocron_nonprod` | Dedicated nonprod namespace for `pnpm test:integration` and CI integration lane |

## Provision

```bash
bun services/platform/src/cli/holo.ts db:provision-nonprod --json
# or
DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
  bun services/platform/src/cli/holo.ts db seed --reset --json
```

## Seed / reset (deterministic)

```bash
DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
  bun services/platform/src/cli/holo.ts db seed --reset --json
```

Two consecutive runs produce identical `seed_fingerprint`, `table_count`, and `fixture_ids`.

## Prod guard

Seed/reset against `holocron` or `postgres` fails closed unless `HOLO_ALLOW_PROD_SEED=1`.

## Integration lane env

```bash
export DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod
export FLEET_URL=http://127.0.0.1:4545
export PLATFORM_IT=1
pnpm test:integration
```

## Zero publication

Migrations create `zero_pub` on the nonprod database. Verify:

```bash
DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
  bun services/platform/src/cli/holo.ts repl:status --json
```
