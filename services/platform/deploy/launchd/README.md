# Holocron launchd units (Sprint 06 / D01-02)

Four LaunchAgent definitions for the MK-VI headless stack:

| Label | Service | Enabled by default | KeepAlive |
|-------|---------|--------------------|-----------|
| `holocron-postgres` | Postgres 18 (`postgresql@18`) | yes | true |
| `holocron-mastra` | Mastra via `bun …/holo.ts service:up` | yes | true |
| `holocron-scheduler` | Leased-queue worker (`scheduler-worker.ts`, pg-boss preferred) | **no** (Disabled until operator enables) | false |
| `holocron-zerocache` | Zero-cache / `zero_pub` consumer | **no** (opt-in: `HOLO_ENABLE_ZERO_CACHE=1`) | false |
| `holocron-restic-blob-mirror` | D04-04 restic blob mirror + SHA-256 parity (`holo backup:mirror`) | **no** (Disabled until operator enables) | false (StartInterval 6h) |
| `holocron-backup-alert-sweep` | D04-05 overdue/failed heartbeat → `ALERT_WEBHOOK_URL` (`holo backup:alert-sweep`) | operator install via `holo backup:alert-sweep --install-schedule` | false (StartInterval 5m) |
| `holocron-docker-disk-guard` | Docker free-space/build-cache/ephemeral-resource guard | installed by `install-docker-resilience.sh` | false (StartInterval 5m) |

Templates live in this directory with `@PLACEHOLDER@` tokens. Installed agents
go to `~/Library/LaunchAgents/holocron-*.plist` with absolute paths only
(launchd has no shell `PATH` / `$HOME` expansion in `ProgramArguments`).

## Install

From repo root (main clone preferred for `HOLO_ROOT`, not a transient worktree):

```bash
./scripts/install-launchd.sh
# or
HOLO_ROOT="$HOME/Projects/holocron" ./scripts/install-launchd.sh --bootstrap
```

Environment overrides:

| Variable | Default |
|----------|---------|
| `HOLO_ROOT` | `$HOME/Projects/holocron` if present, else git toplevel |
| `BUN_BIN` | `$HOME/.bun/bin/bun` |
| `PG_BIN` | `$(brew --prefix postgresql@18)/bin` |
| `PGDATA` | `$(brew --prefix)/var/postgresql@18` |
| `DATABASE_URL` | `postgres://127.0.0.1:5432/holocron` |
| `LAUNCH_AGENTS_DIR` | `$HOME/Library/LaunchAgents` |

## Load / unload (modern launchctl)

```bash
UID_NUM=$(id -u)
launchctl bootstrap "gui/${UID_NUM}" ~/Library/LaunchAgents/holocron-postgres.plist
launchctl bootstrap "gui/${UID_NUM}" ~/Library/LaunchAgents/holocron-mastra.plist
# scheduler unit is Disabled=true but ProgramArguments is the real worker
# zerocache remains Disabled=true until HOLO_ENABLE_ZERO_CACHE=1 (see docs/ops/zero-cache-enable.md)

launchctl print "gui/${UID_NUM}/holocron-postgres"
launchctl print "gui/${UID_NUM}/holocron-mastra"
launchctl list | grep holocron

# Tear down
launchctl bootout "gui/${UID_NUM}/holocron-postgres"
launchctl bootout "gui/${UID_NUM}/holocron-mastra"
```

## Docker disk resilience

Install the bounded daemon defaults and the independent five-minute guard from
the main clone:

```bash
./scripts/install-docker-resilience.sh --restart-docker
```

This sets the default log driver to `local` with 10 MB × 3 rotation, retains at
most 5 GB of builder cache, and installs `holocron-docker-disk-guard`. The guard
warns below 40 GiB free, treats 25 GiB as critical, and removes only expired
resources carrying `io.holocron.lifecycle=ephemeral`; it never performs a broad
volume prune. Once a resource's six-hour TTL expires, a still-running container
is removed only when its recorded host owner PID is gone. Existing containers
adopt the log policy when next recreated.

Useful read-only checks:

```bash
HOLO_DOCKER_GUARD_CHECK_ONLY=1 ./scripts/docker-disk-guard.sh
launchctl print "gui/$(id -u)/holocron-docker-disk-guard"
docker info --format 'logging={{.LoggingDriver}}'
docker system df
```

## Honest slots

- **Scheduler** — Sprint 11 leased-queue worker (`bun …/scheduler-worker.ts`).
  Real ProgramArguments (never `/usr/bin/true`); unit remains `Disabled=true`
  until operators enable it. Stack status reports `placeholder=false` and
  `queue.backend` of `pg-boss` (or `graphile-worker` fallback) from live
  Postgres probes.
- **Zero-cache** — Sprint 24 wires `scripts/run-zero-cache.sh` into
  ProgramArguments. Plist stays **Disabled=true** by default; enable with
  `HOLO_ENABLE_ZERO_CACHE=1` + `ZERO_ADMIN_PASSWORD` (see
  `docs/ops/zero-cache-enable.md`). Stack status is `healthy` only when
  `http://127.0.0.1:4848/keepalive` succeeds — never `/usr/bin/true` theatre.

## Logs

```
~/Library/Logs/holocron/postgres.{out,err}.log
~/Library/Logs/holocron/mastra.{out,err}.log
~/Library/Logs/holocron/scheduler.{out,err}.log
~/Library/Logs/holocron/zerocache.{out,err}.log
~/Library/Logs/holocron/restic-blob-mirror.{out,err}.log
~/Library/Logs/holocron/backup-alert-sweep.{out,err}.log
```

## Verify

```bash
test -f ~/Library/LaunchAgents/holocron-postgres.plist
test -f ~/Library/LaunchAgents/holocron-mastra.plist
test -f ~/Library/LaunchAgents/holocron-scheduler.plist
test -f ~/Library/LaunchAgents/holocron-zerocache.plist
plutil -lint ~/Library/LaunchAgents/holocron-*.plist
grep -E 'scheduler-worker' ~/Library/LaunchAgents/holocron-scheduler.plist
! grep -q '/usr/bin/true' ~/Library/LaunchAgents/holocron-scheduler.plist
grep -A2 '<key>Disabled</key>' ~/Library/LaunchAgents/holocron-scheduler.plist | grep true
grep -c 'Sprint 20' ~/Library/LaunchAgents/holocron-zerocache.plist
/opt/homebrew/opt/postgresql@18/bin/pg_isready -h 127.0.0.1 -p 5432
curl -sf http://127.0.0.1:4111/health
```

## Postgres data

Holocron uses Homebrew PG18 paths (see `docs/postgres-provisioning.md`):

- Binaries: `/opt/homebrew/opt/postgresql@18/bin`
- Data: `/opt/homebrew/var/postgresql@18`

Do **not** run `brew services start postgresql@18` in parallel with
`holocron-postgres` — both would fight for port 5432 / the same PGDATA.
