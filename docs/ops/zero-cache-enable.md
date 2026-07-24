# Enable zero_cache (Sprint 24 e2e substrate)

`holo stack status` reports `zero_cache` honestly:

| State | Meaning |
|-------|---------|
| `healthy` | Process answering `http://127.0.0.1:4848/keepalive` (or launchd PID with real program) |
| `disabled` | Boot path present but not enabled / secrets missing / plist Disabled |
| `pending` | Enabled but not yet ready |
| `unhealthy` | Enabled but probe failed |

## Fast path (dev / Maestro-style foreground)

Same contract as `scripts/e2e/run-maestro-reference-flow.sh`:

```bash
export DATABASE_URL='postgres://127.0.0.1:5432/holocron_nonprod'
export ZERO_ADMIN_PASSWORD='…'          # required
export ZERO_PORT=4848

# Optional Zero 1.8.0 Litestream (CI / durable replica):
# export ZERO_LITESTREAM_EXECUTABLE=/path/to/rocicorp-litestream
# export ZERO_LITESTREAM_BACKUP_URL='s3://…'   # or file://…
# export ZERO_LITESTREAM_CONFIG="$PWD/scripts/e2e/zero-cache-litestream.yml"

# Install deps if needed so `zero-cache` is on PATH via pnpm
pnpm install

# Foreground (or use the wrapper):
./scripts/run-zero-cache.sh
# — or —
NODE_ENV=production pnpm exec zero-cache \
  --upstream-db "$DATABASE_URL" \
  --cvr-db "$DATABASE_URL" \
  --change-db "$DATABASE_URL" \
  --app-publications zero_pub \
  --port 4848 \
  --admin-password "$ZERO_ADMIN_PASSWORD"
```

Probe:

```bash
curl -sf http://127.0.0.1:4848/keepalive && echo ok
holo stack status   # zero_cache: healthy when keepalive succeeds
```

## Launchd / `holo stack up` path

1. Install deps + secrets:

```bash
pnpm install
export ZERO_ADMIN_PASSWORD='…'
export DATABASE_URL='postgres://127.0.0.1:5432/holocron_nonprod'
export HOLO_ENABLE_ZERO_CACHE=1
```

2. Reinstall LaunchAgents from this repo (updates `holocron-zerocache.plist`):

```bash
HOLO_ROOT="$PWD" DATABASE_URL="$DATABASE_URL" ./scripts/install-launchd.sh
# Or let stack up materialize templates:
HOLO_ENABLE_ZERO_CACHE=1 holo stack up
holo stack status
```

3. Manual launchctl (if stack up left unit disabled because secrets were missing):

```bash
UID_NUM=$(id -u)
# Ensure ProgramArguments points at scripts/run-zero-cache.sh (template default)
plutil -p ~/Library/LaunchAgents/holocron-zerocache.plist | head
launchctl bootout "gui/${UID_NUM}/holocron-zerocache" 2>/dev/null || true
# Clear Disabled for this session:
launchctl enable "gui/${UID_NUM}/holocron-zerocache" 2>/dev/null || true
launchctl bootstrap "gui/${UID_NUM}" ~/Library/LaunchAgents/holocron-zerocache.plist
launchctl kickstart -k "gui/${UID_NUM}/holocron-zerocache"
curl -sf http://127.0.0.1:4848/keepalive
holo stack status
```

## Seed for Maestro

```bash
export DATABASE_URL='postgres://127.0.0.1:5432/holocron_nonprod'
holo seed:e2e --reset --json
# → conversations=3, documents=12, feed_items=5
```

## Why it may stay `disabled`

- `ZERO_ADMIN_PASSWORD` unset
- `@rocicorp/zero` / `zero-cache` binary not installed (`pnpm install`)
- Litestream env required by your Zero 1.8.0 install but missing
- Plist still `Disabled=true` and `HOLO_ENABLE_ZERO_CACHE` not set

The supervisor **never** reports `healthy` without a real keepalive/PID — no `/usr/bin/true` theatre.
