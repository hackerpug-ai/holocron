# Holocron portable production Compose contract

`compose.yaml` is the v1 four-service production contract: `postgres`,
`mastra`, `scheduler`, and `zero-cache`. `compose.dev.yaml` only changes laptop
labels and durable volume names; it must never add a service or replace either
application image.

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

## Immutable digest packaging

The candidate must be built from the clean commit with its exact source revision
in OCI metadata. The release build is root-context only:

```sh
SOURCE_REVISION="$(git rev-parse HEAD)"
docker build --file services/platform/Dockerfile \
  --build-arg SOURCE_REVISION="$SOURCE_REVISION" \
  --tag "holocron-platform:$SOURCE_REVISION" .
holo deploy:package --image "$HOLO_PLATFORM_IMAGE" --previous-image "$HOLO_PREVIOUS_PLATFORM_IMAGE"
```

The command refuses a dirty revision, a placeholder or non-digest image, a
missing prior rollback digest, a remote manifest mismatch, a local RepoDigest
mismatch, an OCI revision different from the clean Git SHA, or a broken rendered
Compose contract. It writes the deployable lock only after all checks pass.

`image-lock.json` in this directory is a checked-in schema example
(`deployable: false`), not a deploy authorization.

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

## Memory sizing (container vs Docker VM vs host)

The **50 GiB** figure is the aggregate **container limit ceiling**, not a
default and not Docker Desktop’s VM size:

| Layer | Role | Rule of thumb (max plan) |
|-------|------|---------------------------|
| Container limits sum | postgres+mastra+scheduler+zero-cache | ≤ 50 GiB |
| Docker Desktop Linux VM | engine MemTotal | ≥ container sum + **4 GiB** overhead (e.g. 54 GiB for a 50 GiB plan) |
| Physical Mac RAM | host headroom | ≥ **8 GiB** free after the VM (e.g. 64 GiB host → 10 GiB headroom with 54 GiB VM) |

Smaller hosts **must lower** configured per-service limits rather than attempt
50 GiB. Preflight fails closed when VM overhead or host headroom is insufficient.

Default example plan (sum 50): postgres 16, mastra 16, scheduler 8, zero-cache 10.

## Persistence

Named volumes `holocron-postgres` and `holocron-blobs` survive cold recreate.
Deploy never runs `docker compose down -v`, `volume rm`, or prune.

## Rollback preflight (non-destructive)

To select the already-locked prior image without changing containers or volumes:

```sh
holo deploy:rollback-preflight --lock services/platform/deploy/compose/image-lock.json
```

That command only validates Docker manifest/config identity and rendered Compose;
it never runs `docker compose up`, `docker compose down`, or any volume command.

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
Serve URL, immutable image digest/revision/generation, exactly four services,
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
