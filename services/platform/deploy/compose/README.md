# Holocron Compose (OBS-04 twelve-service / eight-volume contract)

# Holocron portable production Compose contract

`compose.yaml` is the v1 twelve-service production contract: `postgres`,
`mastra`, `scheduler`, and `zero-cache`. `compose.dev.yaml` only changes laptop
labels and durable volume names; it must never add a service or replace either
application image.

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
| `running_service_count` | `4` (`postgres`, `mastra`, `scheduler`, `zero-cache`) |
| `client_asset_count` | `0` (server-only image; no Expo/mobile client assets) |
| `serve_https_port` | `44111` (private Tailscale Serve → loopback) |
| Named volumes | `holocron-postgres`, `holocron-blobs` |
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

`holo deploy:apply --authorize --release <image-lock.json>` recreates the four
services from an immutable digest lock. It must never run
`docker compose down -v` and must preserve named volumes `holocron-postgres`
and `holocron-blobs`. Independent container inspection (not `/health` alone)
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
- Documented service count: **4** (`postgres`, `mastra`, `scheduler`, `zero-cache`)
- Documented named volumes: **2** (`holocron-postgres`, `holocron-blobs`)

After authorization, private Serve fronts the backend (never Funnel, never LAN):

```sh
# Applied by authorized deploy:apply; equivalent manual form:
tailscale serve --bg --https=44111 http://127.0.0.1:44111
tailscale serve status --json   # must show no Funnel endpoints
```

Verification uses the MagicDNS Serve URL
`https://<node>.tailnet.ts.net:44111` — never a derived LAN IP and never a
public Funnel hostname.

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
two named volumes, selected memory limits, and zero credential values.

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

# Four healthy services + receipt verify (no volume delete/recreate):
docker compose -f services/platform/deploy/compose/compose.yaml ps
holo deploy:verify --portable --json

# Seed / prove sentinels + Postgres 503→200 + Mastra restart (authorized window only):
# Prefer the integrated probes — they restore in finally paths:
holo deploy:verify --release path/to/image-lock.json \
  --base-url "https://$(tailscale status --json | jq -r '.Self.DNSName|sub("\\.$";"")'):44111" \
  --restart-probe --negative-controls --mcp-discovery --json
```

Observations required on node A: `healthy_service_count=4`,
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

# Positive: authenticated MCP discovery (exactly 44 tools; never tools/call)
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
| `healthy_service_count` | `4` |
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
