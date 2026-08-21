# Holocron Compose (OBS-04 twelve-service / eight-volume contract)

# Holocron portable production Compose contract

`compose.yaml` is the v1 twelve-service / eight-volume production contract:
`postgres`, `mastra`, `scheduler`, `zero-cache`, `edge`, `langfuse-web`,
`langfuse-worker`, `langfuse-postgres`, `langfuse-clickhouse`, `langfuse-redis`,
`langfuse-minio`, and `otel-collector`. Durable volumes are `postgres-data`,
`zero-cache-data`, `langfuse-postgres-data`, `clickhouse-data`, `clickhouse-logs`,
`minio-data`, `redis-data`, and `otel-queue`. `compose.dev.yaml` only changes
laptop labels and durable volume names; it must never add a service or replace
either application image.

## Cold-host bootstrap (Apple silicon) — IMP-AC-16

Reproducible first boot on a fresh M-series Mac. Production runtime is **Docker
Desktop + Compose only** for the twelve services below. Do **not** install or
enable the legacy native Homebrew LaunchAgents documented under
`services/platform/deploy/launchd/README.md` for this path (they would double-
bind Postgres/Mastra ports).

### Prerequisite checks (fail closed; report missing operator actions)

```sh
uname -m                                          # must print: arm64
docker info --format '{{.Architecture}}'          # aarch64 or arm64
docker info --format '{{.MemTotal}}'              # Docker Desktop VM bytes
sysctl -n hw.memsize                              # physical host bytes (macOS)
docker compose version
tailscale version                                 # Serve-capable 1.52+
tailscale status --json | jq -e '.Self.Online == true'
# Expect Funnel endpoints = 0 before and after bootstrap:
tailscale serve status --json
```

Rosetta / x86_64 Docker Engine emulation is **unsupported** for the release
proof. Missing Docker Desktop, Compose plugin, Tailscale enrollment, or ARM64
is an operator action — never auto-install or mutate Tailscale ACL/device policy.

### Operator-only secret materialization

Credentials come only from operator-approved absolute paths (no commits, no
launchd plists, no receipts). Canonical validation:

```sh
export HOLO_SECRETS_PATH="/absolute/path/to/secrets.yaml"
export HOLO_SECRET_STORE_ROOT="/absolute/path/to/store"   # must contain secrets file
# realpath-validated regular file; mode 0600; not symlink; not group/world-writable
```

### Exact cold-host start sequence (copy-pastable)

```sh
# 1) Non-mutating host preflight (nine named checks; zero Docker mutations)
holo deploy:preflight --target holocron --port 44111 --json

# 2) Authorized apply (immutable digest lock + private Serve + twelve services)
holo deploy:apply --authorize \
  --release path/to/image-lock.json \
  --base-url "https://$(tailscale status --json | jq -r '.Self.DNSName|sub("\\.$";"")'):44111" \
  --target holocron --json

# Equivalent private Serve form applied only after authorization:
#   tailscale serve --bg --https=44111 http://127.0.0.1:44111

# 3) Receipt-driven private verification
holo deploy:verify --portable --json
```

### Expected cold-host observations

| Observation | Required value |
|-------------|----------------|
| `host_architecture` | `arm64` |
| `running_service_count` | `12` (Holocron core + Langfuse + otel-collector) |
| `client_asset_count` | `0` (server-only image; no Expo/mobile client assets) |
| `serve_https_port` | `44111` (private Tailscale Serve → loopback) |
| Named volumes | `8` (`postgres-data` … `otel-queue`; runtime names include `holocron-postgres`, `otel-collector-queue`, …) |
| Funnel endpoints | `0` |

No client/web/mobile build step is part of cold-host bootstrap.

## ARM64 prerequisites

Portable Holocron targets **Apple silicon (linux/arm64)** Docker Engine or
Docker Desktop on macOS:

```sh
uname -m                    # expect arm64
docker info --format '{{.Architecture}}'   # expect aarch64 or arm64
docker compose version
tailscale version           # Serve-capable 1.52+
```

The application image is supplied as `HOLO_PLATFORM_IMAGE` and must be a full
registry reference ending in `@sha256:<64-hex>`. Both `mastra` and `scheduler`
use that same image. Do not use tags such as `latest` or a tag-only image.

## Immutable digest packaging (CUTOVER-RELEASE-001)

The candidate must be built from one clean committed 40-hex SHA. Dirty trees,
wrong SHAs, and `:latest` tags fail closed **before** build or deploy. Prefer
the exact-SHA stager (content-addressed manifest + image-lock):

```sh
SOURCE_REVISION="$(git rev-parse HEAD)"
OUT=".tmp/CUTOVER-RELEASE-001/stage-$SOURCE_REVISION"
bash scripts/stage-holocron-release.sh \
  --source-revision "$SOURCE_REVISION" \
  --out "$OUT" \
  --json
# Produces: release-manifest.json, image-lock.json, compose.yaml, pgbackrest.conf
```

Manual package path (root-context Docker build) remains available:

```sh
SOURCE_REVISION="$(git rev-parse HEAD)"
docker build --file services/platform/Dockerfile \
  --build-arg SOURCE_REVISION="$SOURCE_REVISION" \
  --platform linux/arm64 \
  --tag "holocron-platform:$SOURCE_REVISION" .
holo deploy:package --image "$HOLO_PLATFORM_IMAGE" --previous-image "$HOLO_PREVIOUS_PLATFORM_IMAGE"
```

The stager/package path refuses a dirty revision, a placeholder or non-digest
image, a missing prior rollback digest, a remote manifest mismatch, a local
RepoDigest mismatch, an OCI revision different from the clean Git SHA, or a
broken rendered Compose contract. It writes the deployable lock only after all
checks pass.

### Compose-native backup runner

`mastra` and `scheduler` ship pinned pgBackRest + restic binaries inside the
platform image (`/usr/local/bin/{pgbackrest,restic}`) and mount versioned
`pgbackrest.conf` at `/etc/pgbackrest/pgbackrest.conf`. Production Postgres is
published on host `:44112` — never target `127.0.0.1:5432` as production.
Backup binary + config digests are recorded in `release-manifest.json`.

`image-lock.json` in this directory is a checked-in schema example
(`deployable: false`), not a deploy authorization.

### Volume-preserving deploy / rollback

`holo deploy:apply --authorize --release <image-lock.json>` recreates the twelve
services from an immutable digest lock. It must never run
`docker compose down -v` and must preserve the eight named volumes (runtime
names include `holocron-postgres`, `otel-collector-queue`, Langfuse state, and
MinIO/Redis/ClickHouse). Independent container inspection (not `/health` alone)
proves observed digests/source revision match the staged release while
`data_plane=convex` and durable `HOLO_MIGRATION_READ_ONLY=1`.

## Secret injection

Runtime credentials come from the operator-approved secret store only. Canonical
paths are realpath-validated regular files (no symlinks, no group/world write)
mounted **read-only** into Mastra:

```sh
export HOLO_SECRETS_PATH="/absolute/path/to/secrets.yaml"
export HOLO_SECRET_STORE_ROOT="/absolute/path/to/store"   # must contain the secrets file
```

Compose/env injection covers `POSTGRES_PASSWORD`, `DATABASE_URL`,
`MASTRA_API_KEY`, `FLEET_KEY`, and `ZERO_ADMIN_PASSWORD`. Values are never
literalized in override YAML, receipts, or CLI logs.

## Loopback port 44111 and private Tailscale Serve

Mastra is published only on the host loopback interface:

- Backend: `127.0.0.1:44111` → container `4111`
- Documented external HTTPS port: **44111**
- Documented service count: **12** (Holocron core + Langfuse + otel-collector)
- Documented named volumes: **8** (`postgres-data` … `otel-queue`)

After authorization, private Serve fronts the backend (never Funnel, never LAN):

```sh
# Applied by authorized deploy:apply; equivalent manual form:
tailscale serve --bg --https=44111 http://127.0.0.1:44111
tailscale serve status --json   # must show no Funnel endpoints
```

Verification uses the MagicDNS Serve URL
`https://<node>.tailnet.ts.net:44111` — never a derived LAN IP and never a
public Funnel hostname.

## Public document share reader (Cloudflare) — operator procedure

Public share links are `https://docs.holocrnlib.com/d/<token>`. A Worker is the
only public face: edge cache (~60s) then origin `GET /article/<token>`. Origin
stays on holocron loopback `:44111`. **Do not** enable Tailscale Funnel. **Do
not** add `cloudflared` to Compose (same ancillary slot as Serve). Setup is this
procedure, not a deploy command.

Value-free secret names: `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`,
`CF_TUNNEL_TOKEN`. `CLOUDFLARE_API_TOKEN` deploys the Worker. Never put values
in git, `wrangler.jsonc`, argv, or logs (never echo the Access header).

Known SLA: a just-unshared token may still serve cached HTML for up to ~60s.
The mini asleep is a reader-visible error (no R2 fallback).

### 1. DNS (zone must be on Cloudflare)

Zone `holocrnlib.com` is on Cloudflare Registrar (status `active`).
`dig docs.holocrnlib.com` must return Cloudflare, not `*.ts.net`. Create the
Access application on `origin-docs.holocrnlib.com` (service-token policy only).

- `docs.holocrnlib.com` → Worker custom domain (`holocron-docs-reader`)
- `origin-docs.holocrnlib.com` → Tunnel CNAME to
  `<tunnel-id>.cfargotunnel.com` (proxied)

### 2. Access service token (Worker is the only holder)

Enable Zero Trust Access on the account. Create an Access application covering
`origin-docs.holocrnlib.com` (service-auth policy for the service token only).
Create a service token named `holocron-docs-reader`. Store client id/secret as
`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` in the operator `.env` and as
Worker secrets (`wrangler secret put` — never in `wrangler.jsonc`).

Without the token, `curl -i https://origin-docs.holocrnlib.com/article/<token>`
must be **403** from Access. With the token headers, a shared token must be
**200**.

### 3. Tunnel on host `holocron` (`/article/*` only, deny-all)

```sh
# on holocron — install once, do not touch tailscale serve
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create holocron-article-origin
# credentials-file lands under ~/.cloudflared/<TUNNEL_ID>.json
# store the install token as CF_TUNNEL_TOKEN (operator .env only)
```

Operator-local config lives at `~/.cloudflared/config.yml` on holocron (not in
git). User LaunchAgent `com.holocron.cloudflared` (ancillary-guard slot):

```yml
ingress:
  - hostname: origin-docs.holocrnlib.com
    path: ^/article/[^/]+$
    service: http://127.0.0.1:44111
  - hostname: origin-docs.holocrnlib.com
    service: http_status:404
  - service: http_status:404
```

Live checks (expect refuse + tunnel log deny, not Mastra JSON):

```sh
curl -i https://origin-docs.holocrnlib.com/api/documents
curl -i https://origin-docs.holocrnlib.com/mcp
curl -i https://origin-docs.holocrnlib.com/blobs/<hash>
```

### 4. Worker

```sh
cd services/worker-docs-reader
npx wrangler secret put CF_ACCESS_CLIENT_ID
npx wrangler secret put CF_ACCESS_CLIENT_SECRET
npx wrangler deploy   # wrangler.jsonc already binds docs.holocrnlib.com
```

`ORIGIN_BASE_URL` is `https://origin-docs.holocrnlib.com` (var, not a secret).

### 5. Serve must stay private

```sh
tailscale serve status --json   # identical before/after; funnel_endpoint_count=0
holo deploy:preflight --target holocron --port 44111 --json   # tailscale_serve ok
```

## Public MCP remote access (Cloudflare Access login)

Public MCP is `https://mcp.holocrnlib.com/mcp` (and `https://mcp.holocrnlib.com/mcp/*` only). The existing docs-share tunnel (`holocron-article-origin`) proxies that path to the private Mastra origin `http://127.0.0.1:44111`. **No Worker** on this path (MCP is POST JSON-RPC plus an optional long-lived SSE `GET /mcp`, not a cacheable GET). **Do not** enable Tailscale Funnel. **Do not** add `cloudflared` to Compose. **Do not** reuse or pattern-match the docs-share Access application.

This hostname is gated by a Cloudflare Access **Self-hosted identity/login** policy (allow-listed operator email, or emails-ending-in the operator's domain — the operator's identity only). That is a different Access **policy type** than Public document share reader, which uses a **service-token** policy (`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` held only by the Worker). Login here issues a **login JWT** (`Cf-Access-Jwt-Assertion`) after browser SSO. A service token will not satisfy this application, and this application's login JWT will not satisfy origin-docs.

`HOLO_KEY_MCP` stays an independent second layer at the origin. Access JWT without that bearer is origin **401**. A foreign `Origin` header is still origin **403** `MCP_ORIGIN_REJECTED`. The all-or-nothing 45-tool MCP key model does not change.

Value-free names: `HOLO_KEY_MCP`, `MCP_ACCESS_AUD_TAG`, `ZERO_TRUST_TEAM_NAME`. Never put JWT values, tunnel tokens, or Access AUD/team values in git, argv, or logs.

Known SLA: Access session duration is **30 days** (the Access maximum). `cloudflared access login` is once per device per session; refresh the cached JWT when that session expires. The mini asleep is a client-visible connection error (no origin data). Unauthenticated requests must be an Access redirect/deny, never MCP JSON.

### 1. DNS (zone must be on Cloudflare)

Zone `holocrnlib.com` is on Cloudflare (status `active`). `dig mcp.holocrnlib.com` must return Cloudflare, not `*.ts.net`. Create the Access application on `mcp.holocrnlib.com` (identity/login policy only — not a service-token policy).

- `mcp.holocrnlib.com` → Tunnel CNAME to
  `<tunnel-id>.cfargotunnel.com` (proxied). Reuse the existing
  `holocron-article-origin` tunnel; do not create a second tunnel.

Do **not** add this CNAME until step 2 (Access app) and step 3 (Protect with Access on the ingress rule) are in place. A public hostname that hits `/mcp` without Access JWT validation would expose the origin to the internet behind only `HOLO_KEY_MCP`.

### 2. Access identity/login application (not a service token)

Enable Zero Trust Access on the account. Create a **Self-hosted** Access application covering `mcp.holocrnlib.com`:

- Policy type: allow the operator's own identity (specific allow-listed email, or emails-ending-in the operator's domain). Use the IdP already configured for the account (Google/GitHub SSO). **Do not** add a service-auth / service-token include. **Do not** copy the `holocron-docs-reader` service-token application.
- Session duration: **30 days** (`720h` — Access maximum).
- Copy the application's AUD tag. That value is `MCP_ACCESS_AUD_TAG`. The Zero Trust team name is `ZERO_TRUST_TEAM_NAME` (the `teamName` in `cloudflared` origin parameters, not the zone name).

Without a login JWT, `curl -si https://mcp.holocrnlib.com/mcp` must be Access **302** (login redirect) or **403** deny — never Mastra / MCP JSON, never `tools/list`.

### 3. Tunnel on host `holocron` (`/mcp` and `/mcp/*` only, deny-all)

Reuse the existing user LaunchAgent `com.holocron.cloudflared` (ancillary-guard slot) and operator-local `~/.cloudflared/config.yml` on holocron (not in git). Add MCP ingress **alongside** the existing `origin-docs.holocrnlib.com` `/article/*` rules. Enable **Protect with Access** so `cloudflared` validates `Cf-Access-Jwt-Assertion` **before** proxying. Official origin parameters require Access **AUD tag** + **teamName**, not only `required: true`. Do not set `disableChunkedEncoding: true` (SSE `GET /mcp` must stream).

```yml
ingress:
  - hostname: origin-docs.holocrnlib.com
    path: ^/article/[^/]+$
    service: http://127.0.0.1:44111
  - hostname: origin-docs.holocrnlib.com
    service: http_status:404
  - hostname: mcp.holocrnlib.com
    path: ^/mcp(/.*)?$
    service: http://127.0.0.1:44111
    originRequest:
      access:
        required: true
        teamName: <ZERO_TRUST_TEAM_NAME>
        audTag:
          - <MCP_ACCESS_AUD_TAG>
  - hostname: mcp.holocrnlib.com
    service: http_status:404
  - service: http_status:404
```

Reload the LaunchAgent after editing (`launchctl kickstart -k gui/$(id -u)/com.holocron.cloudflared`). Confirm the process still uses `--config ~/.cloudflared/config.yml`. Adjacent paths (`/api/*`, `/blobs/*`, `/mcp/../..`) must hit the hostname deny-all **404** (or Access deny) — not Mastra JSON.

### 4. Per-device client (login JWT, then MCP bearer)

Access login is a browser-redirect flow. A plain JSON-RPC MCP client cannot complete it. Once per device, then monthly when the 30-day session expires:

```sh
# one-time (opens a browser for SSO against the identity policy)
cloudflared access login mcp.holocrnlib.com

# print the cached login JWT (do not commit, log, or paste into git)
cloudflared access token -app=mcp.holocrnlib.com
```

Put that JWT on requests as custom header `Cf-Access-Jwt-Assertion`. This works for MCP clients that support custom headers on HTTP / streamable-HTTP transport config. Clients that cannot set custom headers cannot use the public hostname.

Then send `Authorization: Bearer $HOLO_KEY_MCP` as today. Load the key from the operator secret store (`HOLO_SECRETS_PATH` / `secrets.yaml`); never echo it.

`cloudflared access curl https://mcp.holocrnlib.com/mcp` is a convenience wrapper for ad-hoc curls; production MCP client config should still set `Cf-Access-Jwt-Assertion` explicitly so Protect with Access can validate it.

### 5. Serve must stay private (Funnel-zero)

```sh
tailscale serve status --json   # identical before/after; funnel_endpoint_count=0
# Private tailnet MCP is unchanged:
#   https://holocron.tail011a51.ts.net:44111/mcp
```

### Live checks

Expect refuse (Access challenge, not origin data) + expect success. Run unauthenticated curls twice (consistent). Run the authenticated `tools/list` success path twice.

```sh
# Unauthenticated — Access 302/403, NOT MCP JSON / tools/list / Mastra body
curl -si https://mcp.holocrnlib.com/mcp
curl -si https://mcp.holocrnlib.com/mcp

# Adjacent / adversarial — tunnel/Access deny, not Mastra JSON
curl -si https://mcp.holocrnlib.com/api/missions
curl -si https://mcp.holocrnlib.com/blobs/x
curl -si https://mcp.holocrnlib.com/mcp/../health
curl -si https://mcp.holocrnlib.com/mcp/../..

# Access JWT, no HOLO_KEY_MCP — origin 401
JWT="$(cloudflared access token -app=mcp.holocrnlib.com)"
curl -si https://mcp.holocrnlib.com/mcp \
  -H "Cf-Access-Jwt-Assertion: ${JWT}" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"mcp-public-check","version":"1"}}}'

# Access JWT + HOLO_KEY_MCP — 200 tools/list (non-empty tools, not an error envelope)
# Use Authorization from env — do not put the key on the command line.
python3 - <<'PY'
import json, os, urllib.request
jwt = os.environ["JWT"]
key = os.environ["HOLO_KEY_MCP"]
url = "https://mcp.holocrnlib.com/mcp"
headers = {
    "Cf-Access-Jwt-Assertion": jwt,
    "Authorization": f"Bearer {key}",
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
}
def post(body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        print("status", r.status)
        return json.loads(r.read().decode())
post({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"mcp-public-check","version":"1"}}})
listed = post({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}})
tools = (listed.get("result") or {}).get("tools") or []
print("tools_count", len(tools))
print("error_envelope", bool(listed.get("error")))
PY

# GET /mcp SSE must stream (not buffered/dropped)
curl -sN --max-time 5 \
  -H "Cf-Access-Jwt-Assertion: ${JWT}" \
  -H "Authorization: Bearer ${HOLO_KEY_MCP}" \
  -H "Accept: text/event-stream" \
  https://mcp.holocrnlib.com/mcp

# Funnel-zero
tailscale serve status --json
```

## Host preflight (non-mutating)

```sh
holo deploy:preflight --target holocron --port 44111 --json
```

Reports nine named checks with **zero** Docker/Compose/Serve mutations:
Docker/Compose, linux/arm64, target host, loopback port, Tailscale Serve,
secret paths, volumes, container-memory sum, and Docker VM/host headroom.

## Memory sizing (container vs Docker VM vs host) — IMP-AC-20

The **50 GiB** figure is the aggregate **container limit ceiling**, not a
default and not Docker Desktop’s VM size. All three layers must pass
independently before claiming a plan works:

| Layer | Role | Reference max plan | Required math |
|-------|------|--------------------|---------------|
| Container limits sum | postgres+mastra+scheduler+zero-cache | **50 GiB** | ≤ 50; **51 GiB rejected** |
| Docker Desktop Linux VM | engine MemTotal | **54 GiB** | ≥ container sum + **4 GiB** overhead |
| Physical Mac RAM | host headroom | **64 GiB** host | ≥ **8 GiB** free after VM (**10 GiB** observed for 64−54) |

Reference acceptance: `container_limit_sum_gib=50`, `docker_vm_memory_gib=54`,
`host_headroom_required_gib=8`, `host_headroom_observed_gib=10`,
`over_budget_51_gib_rejected='true'`.

Smaller hosts **must lower** configured per-service limits rather than attempt
50 GiB. Preflight fails closed when VM overhead or host headroom is insufficient.
Never claim 50 GiB works unless selected container sum, Docker VM allocation
(plus overhead), and physical-host headroom all independently pass.

Default example plan (sum 50): postgres 16, mastra 16, scheduler 8, zero-cache 10.

## Persistence

Named volumes `holocron-postgres` and `holocron-blobs` survive cold recreate,
orderly stop, Compose restart, and host reboot. Deploy lifecycle **never** runs
`docker compose down -v`, `docker volume rm`, `docker volume prune`, or any
command that renames/replaces either durable volume. Expected after lifecycle:
`volume_deletion_count=0`.

## Rollback preflight (non-destructive)

To select the already-locked prior image without changing containers or volumes:

```sh
holo deploy:rollback-preflight --lock services/platform/deploy/compose/image-lock.json
```

That command only validates Docker manifest/config identity and rendered Compose;
it never runs `docker compose up`, `docker compose down`, `docker compose down -v`,
or any volume command. Containers and named volumes remain until a **separately
authorized** image rollback that still forbids `down -v` / volume prune.

## Authorized deploy, receipt, and verification

```sh
# Compatibility script (filename retained) — portable target, no LAN derivation:
scripts/deploy-inference1.sh --authorize --release path/to/image-lock.json

# Or direct CLI:
holo deploy:apply --authorize \
  --release path/to/image-lock.json \
  --base-url "https://$(tailscale status --json | jq -r '.Self.DNSName|sub("\\.$";"")'):44111" \
  --target holocron --json

# Receipt-driven private verification (identity/memory/Serve/services/volumes):
holo deploy:verify --portable --json
```

The non-secret deployment receipt records host, loopback port 44111, private
Serve URL, immutable image digest/revision/generation, exactly twelve services,
eight named volumes, selected memory limits, and zero credential values.

## Real deployment verification section

Machine-checkable operator path (execute on the serving host):

```sh
holo deploy:preflight --target holocron --port 44111 --json
holo deploy:rollback-preflight --lock services/platform/deploy/compose/image-lock.json
docker compose -f services/platform/deploy/compose/compose.yaml \
  --env-file services/platform/deploy/compose/production.env.example config --quiet
tailscale serve status --json
holo deploy:verify --portable --json
```

Every production and Langfuse service uses Docker's `local` log driver with a
10 MB × 3-file cap. Keep that contract on new services; daemon-wide defaults
are installed separately by `scripts/install-docker-resilience.sh`.

## Cross-tailnet cold-host recovery drill (two real devices) — IMP-AC-5/11/18/19

Un-fakeable private handoff gate. **Node A** is the serving Mac `holocron`;
**node B** is one human-selected authorized peer on the same tailnet. Loopback,
second processes, mocks, injected peer rows, and test-authored HTTP responses
are forbidden substitutes for node B.

### Prerequisites (operator window — ask before disruptive steps)

1. Explicit human selection of node B (hostname) and an approved drill window.
2. D08-07/D08-08 receipt/generation is the drill target (`deploy:verify --portable`).
3. Live scoped MCP credential via operator secret store only (`HOLO_SECRETS_PATH` /
   `HOLO_KEY_MCP`). Never paste keys into shell history, receipts, or evidence.
4. Authorization for real Postgres stop/recovery and one Mastra restart on node A.
5. Fail-safe cleanup traps on node A must restore Postgres, Compose, and private
   Serve even on script failure (`trap` / `finally`).

If a second real device or live credential is unavailable, stop and record
`classification=human_required` — do not fabricate peer health/MCP evidence.

### Node A (`holocron`) — serving host

```sh
# Identity / private Serve (Funnel must stay zero):
tailscale status --json | jq -e '.Self.Online == true'
tailscale serve status --json   # expect empty Funnel; HTTPS 44111 → http://127.0.0.1:44111
# Equivalent private form only (never Funnel):
#   tailscale serve --bg --https=44111 http://127.0.0.1:44111

# Twelve healthy services + receipt verify (no volume delete/recreate):
docker compose -f services/platform/deploy/compose/compose.yaml ps
holo deploy:verify --portable --json

# Seed / prove sentinels + Postgres 503→200 + Mastra restart (authorized window only):
# Prefer the integrated probes — they restore in finally paths:
holo deploy:verify --release path/to/image-lock.json \
  --base-url "https://$(tailscale status --json | jq -r '.Self.DNSName|sub("\\.$";"")'):44111" \
  --restart-probe --negative-controls --mcp-discovery --json
```

Observations required on node A: `healthy_service_count=12`,
`postgres_down_health_status=503`, `recovered_health_status=200`,
`mastra_restart_count>=1`, `postgres_sentinel_rows=1`, `blob_sentinel_objects=1`,
`funnel_endpoint_count=0`, `missing_dependency_rejection_count=1`,
`wrong_identity_rejection_count=1`.

### Node B (authorized peer) — private HTTPS probes

Run **on the peer device** through its own Tailscale entrypoint. Load the MCP
key from that device's secure local store / keychain into the environment
without printing it (`set -a; source …; set +a` or equivalent).

```sh
export TARGET_FQDN="holocron.tail011a51.ts.net"   # MagicDNS only — never LAN IP / Funnel
export HOLO_KEY_MCP  # from peer keychain/secret store; never echo

# Positive: private health (before and after node A Mastra restart)
curl -fsS -o /tmp/d08-09-health.json -w '%{http_code}\n' \
  "https://${TARGET_FQDN}:44111/health"

# Positive: authenticated MCP discovery (registry tool count; never tools/call)
# Use Authorization from env — do not put the key on the command line.
python3 - <<'PY'
import json, os, urllib.request
url = "https://%s:44111/mcp" % os.environ["TARGET_FQDN"]
key = os.environ["HOLO_KEY_MCP"]
def post(body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
        headers={"authorization": "Bearer " + key,
                 "accept": "application/json, text/event-stream",
                 "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)
post({"jsonrpc":"2.0","id":1,"method":"initialize","params":{
    "protocolVersion":"2025-03-26","capabilities":{},
    "clientInfo":{"name":"d08-09-peer","version":"1.0.0"}}})
tools = post({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}})
print("mcp_tool_count", len(tools["result"]["tools"]))
PY

# Negative: unreachable Serve must fail once (wrong port or dead host)
curl -fsS --connect-timeout 3 --max-time 5 \
  "https://${TARGET_FQDN}:44112/health" && exit 1 || echo unreachable_serve_rejection_count=1
```

Write a **redacted** peer receipt on node B (hashes/counts/status only):

```sh
holo deploy:verify --peer-receipt /path/to/peer-receipt.json --json
# Or hand-author JSON matching schema holo.deploy.cross-tailnet-peer-receipt.v1
# with peer_identity_hash, target_fqdn_hash, serve_https_port=44111,
# health statuses, mcp_tool_count, unreachable_serve_rejection_count, timestamps.
```

### Evidence contract (`evidence/D08-09/cross-tailnet-drill.json`)

Schema `holo.deploy.cross-tailnet-drill.v1`. Required fields (non-empty):

| Field | Required |
|-------|----------|
| `real_device_count` | `2` |
| `serve_https_port` | `44111` |
| `second_device_health_status` | `200` |
| `funnel_enabled` / `funnel_endpoint_count` | `false` / `0` |
| `healthy_service_count` | `12` |
| `postgres_down_health_status` / `recovered_health_status` | `503` / `200` |
| `mcp_tool_count` | `44` |
| `mastra_restart_count` | `≥1` |
| `postgres_sentinel_rows` / `blob_sentinel_objects` | `1` / `1` |
| `unreachable_serve_rejection_count` | `1` |
| `wrong_identity_rejection_count` | `1` |
| `missing_dependency_rejection_count` | `1` |
| `credential_value_count` | `0` |
| `raw_environment_present` | `false` |

Also store target/peer identity hashes (sha256 of MagicDNS names), release
digest/revision/generation, and started/completed timestamps. Reject stale
receipts, peer count ≠ 2, mismatched generation/digest, or empty health/MCP.

### Redaction and cleanup

- Evidence stores only hashes, counts, status codes, and redacted identifiers.
- Scan sealed JSON with seeded credential canaries; require
  `credential_value_count=0` and `raw_environment_present=false`.
- After any failure: restore Postgres + all twelve services, re-check private
  Serve, retain named volumes (`volume_deletion_count=0`), leave D08-05 blocked.
- Never rewrite a failed drill as pass; retain the immutable failure record.
