# Postgres 18 provisioning (schema-1)

Holocron MK-VI uses a **single Postgres 18** instance as the sole datastore (AP-1), with **pgvector**, native FTS, and **`wal_level=logical`** for Zero-style logical replication (CAP-SYNC-01). Auth is **single-user tailnet trust** (AP-7) — no RLS, no multi-tenant.

## Host (provisional)

| Field | Value |
|-------|-------|
| **Intended host** | Mini on the tailnet (not online at provision time) |
| **Provisional host** | Operator laptop (`laptop`) |
| **Tailscale hostname** | `laptop` |
| **Tailscale IP** | `100.123.216.92` |
| **OS** | macOS (Homebrew) |
| **Postgres** | **18.4** (Homebrew `postgresql@18`) |
| **Port** | `5432` |
| **Data directory** | `/opt/homebrew/var/postgresql@18` |
| **Binaries** | `/opt/homebrew/opt/postgresql@18/bin` |
| **Service** | `brew services start\|stop\|restart postgresql@18` |
| **Superuser (OS install owner)** | `justinrich` |
| **Contract role** | `postgres` (superuser, created for `psql -U postgres`) |
| **App database** | `holocron` (owner `justinrich`; extension `vector` enabled) |
| **Default admin DB** | `postgres` |

> **Honest host note:** At schema-1 provision time, Tailscale showed **no host named “mini” online**. Only `laptop` (`100.123.216.92`) was a reliable online Mac on the tailnet. Postgres 18 was therefore provisioned on the **laptop as a provisional mini substitute**. When a real mini joins the tailnet, re-run the same layout there and update this doc + `DATABASE_URL`.

### Coexistence with Homebrew Postgres 16

- `postgresql@16` remains installed but was **stopped** so port `5432` is free for Holocron PG18.
- Restart legacy PG16 only if needed for unrelated local work:  
  `brew services stop postgresql@18 && brew services start postgresql@16`  
  (Holocron requires PG18 — do not point `DATABASE_URL` at 16.)

## Connection strings

```bash
# Loopback (local tools, mastra default style)
export DATABASE_URL='postgres://justinrich@127.0.0.1:5432/holocron'

# Tailscale (other tailnet nodes → this host)
export DATABASE_URL='postgres://postgres@100.123.216.92:5432/holocron'

# Admin / contract verify (matches AC commands)
export DATABASE_URL='postgres://postgres@100.123.216.92:5432/postgres'
```

`services/platform/src/mastra.ts` still defaults to `postgres://127.0.0.1:5432/postgres` when `DATABASE_URL` is unset. Prefer exporting the holocron DB URL above for app work.

## How it was provisioned

```bash
# 1. Install Postgres 18 (keg-only; cluster auto-initdb'd)
brew install postgresql@18

# 2. Free port 5432 if PG16 was bound
brew services stop postgresql@16

# 3. Configure /opt/homebrew/var/postgresql@18/postgresql.conf
#    (Holocron block appended — see "Config knobs" below)

# 4. Replace /opt/homebrew/var/postgresql@18/pg_hba.conf
#    (local + Tailscale CGNAT trust; reject other nets)

# 5. Start service
brew services start postgresql@18

# 6. Install pgvector (Homebrew bottle ships PG17 + PG18 extension files)
HOMEBREW_NO_REQUIRE_TAP_TRUST=1 brew install pgvector

# 7. Roles / DB / extension
/opt/homebrew/opt/postgresql@18/bin/psql -h 127.0.0.1 -p 5432 -d postgres -c \
  "CREATE ROLE postgres SUPERUSER LOGIN;"   # if missing
/opt/homebrew/opt/postgresql@18/bin/psql -h 127.0.0.1 -p 5432 -d postgres -c \
  "CREATE DATABASE holocron OWNER justinrich;"
/opt/homebrew/opt/postgresql@18/bin/psql -h 127.0.0.1 -p 5432 -d holocron -c \
  "CREATE EXTENSION IF NOT EXISTS vector;"
/opt/homebrew/opt/postgresql@18/bin/psql -h 127.0.0.1 -p 5432 -d postgres -c \
  "CREATE EXTENSION IF NOT EXISTS vector;"
```

## Config knobs

### `postgresql.conf` (Holocron block)

Path: `/opt/homebrew/var/postgresql@18/postgresql.conf`

```conf
# ── Holocron schema-1 provisioning (Postgres 18) ──
# listen only on loopback + Tailscale IP (not raw LAN) — TC-4 / AP-7
listen_addresses = '127.0.0.1,::1,100.123.216.92'
port = 5432
wal_level = logical
max_wal_senders = 10
max_replication_slots = 10
# ── end Holocron schema-1 ──
```

**`wal_level` requires a full restart** after change:

```bash
brew services restart postgresql@18
/opt/homebrew/opt/postgresql@18/bin/psql -h 127.0.0.1 -p 5432 -U postgres -c 'SHOW wal_level;'
# → logical
```

If the Tailscale IP of this host changes, update `listen_addresses` and restart.

### `pg_hba.conf` (trust on local + tailnet only)

Path: `/opt/homebrew/var/postgresql@18/pg_hba.conf`

```conf
# TYPE  DATABASE  USER  ADDRESS         METHOD
local   all       all                   trust
host    all       all   127.0.0.1/32    trust
host    all       all   ::1/128         trust
host    all       all   100.64.0.0/10   trust   # Tailscale CGNAT
host    all       all   0.0.0.0/0       reject
host    all       all   ::/0            reject
```

## Extensions

| Extension | Version | Purpose |
|-----------|---------|---------|
| **vector** (pgvector) | 0.8.5 | Embeddings / ANN (IVFFlat, HNSW) |
| **FTS** | built-in | `to_tsvector` / `tsquery` (no extra install) |

## Acceptance probes (run from any tailnet node with `psql`)

Use the **Postgres 18** client if PATH still points at PG16:

```bash
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
TS_IP=100.123.216.92   # provisional laptop Tailscale IP

# AC-1 — version 18.x over Tailscale
psql -h "$TS_IP" -p 5432 -U postgres -d postgres -c 'SELECT version();'
# MUST contain: PostgreSQL 18.

# AC-2 — pgvector
psql -h "$TS_IP" -p 5432 -U postgres -d postgres -c 'CREATE EXTENSION IF NOT EXISTS vector;'
psql -h "$TS_IP" -p 5432 -U postgres -d postgres -c "SELECT extname, extversion FROM pg_extension WHERE extname='vector';"
# MUST show: vector | 0.8.5 (or later)

# AC-3 — logical WAL
psql -h "$TS_IP" -p 5432 -U postgres -d postgres -c 'SHOW wal_level;'
# MUST show: logical

# TC-4 — raw LAN IP must not accept (connection refused)
# psql -h <en0-LAN-IP> -p 5432 -U postgres -c 'SELECT 1;'  → connection refused
```

Evidence captured at provision time: `.tmp/schema-1/AC-{1,2,3}-green.txt`.

## Restart / recovery

```bash
brew services restart postgresql@18
/opt/homebrew/opt/postgresql@18/bin/pg_isready -h 127.0.0.1 -p 5432
lsof -nP -iTCP:5432 -sTCP:LISTEN
# Expect LISTEN on 127.0.0.1, [::1], and 100.123.216.92 only
```

Logs: `brew services info postgresql@18` / macOS launchd log for `homebrew.mxcl.postgresql@18`.

## Logical replication — `zero_pub` (schema-4 / CAP-SYNC-01)

Domain migrations create publication **`zero_pub`** over the reactive UI subset only
(conversations, chat_messages, tool_calls, agent_plans, tasks, documents metadata,
research/mission progress, notifications, feed_items, subscriptions display,
improvements, audio jobs/segments, whats_new, analysis/shop/assimilation sessions,
app_settings). **Excluded:** every `vector`/`tsvector` column, the passages/evidence
fulcrum (sources/passages/claims/entities/relations/beliefs), citations, telemetry,
rate-limit, and server-only ETL (`convex_id_map`).

Every published table has a single-column uuid PK and `REPLICA IDENTITY DEFAULT`.

```bash
export DATABASE_URL='postgres://justinrich@127.0.0.1:5432/holocron'
bun services/platform/src/cli/holo.ts db:migrate
bun services/platform/src/cli/holo.ts repl:status
# MUST: wal_level: logical · zero_pub present · REPLICA IDENTITY: DEFAULT · no passages/sources
psql "$DATABASE_URL" -c "SELECT * FROM pg_publication;"
psql "$DATABASE_URL" -c "SELECT * FROM pg_publication_tables WHERE pubname='zero_pub';"
```

## What provisioning alone does **not** do

- No Zero sync client / zero-cache wiring (later sprint).
- No production secrets vault / password auth (tailnet trust only, AP-7).
- Does not claim a mini hostname that is offline — host is **provisional laptop**.

## Follow-ups

1. When mini is online: install the same stack there, update Tailscale IP / `listen_addresses` / this doc.
2. Optionally re-link `brew link postgresql@18` so default `psql` is 18 (currently PG16 may still own `/opt/homebrew/bin/psql`).
3. Wire zero-cache + RN client against `zero_pub` (CAP-SYNC-01 e2e).
