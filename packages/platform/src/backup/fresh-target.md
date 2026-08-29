# Fresh restore target (D05-03 / REDHAT-FIX-H3 / CAP-BAK-01)

Genuinely isolated restore hardware for the Sprint 28 fire drill. A scratch
directory on the mini is **not** sufficient isolation.

## Isolation contract (multi-axis — REDHAT-FIX-H3)

**Supersedes** the narrow D05-03/D05-06 oracle of “`nc -z mini 5432` fails +
`/mnt/mini-pgdata` and `/mnt/mini-blobs` absent.” That two-check theatre can
false-pass while tailnet/LAN/IPv6/DNS aliases, SSH, alternate bind-mounts,
unix sockets, host-network containers, or same-host machine identity remain open.

Exit 0 from `scripts/prove-isolation.sh` / `scripts/verify-restore-isolation.sh`
only when **every** axis PASSes (fail closed on any open axis):

| Axis | What must hold | Real probes |
| --- | --- | --- |
| **network** | All configured mini coordinates unreachable on PG + SSH + control ports | `nc` to `MINI_HOST`, `MINI_IPV4`, `MINI_IPV6`, `MINI_TAILNET_IP`, `MINI_LAN_IP`, `MINI_DNS_ALIASES`, `MINI_HOSTNAMES` |
| **ipc_sockets** | No mini-like postgres unix sockets; no residual IPC path to mini data | `test -S` on `/tmp/.s.PGSQL.5432`, `/var/run/postgresql/…`, `MINI_UNIX_SOCKETS` |
| **mounts** | No mini PGDATA/blob mounts **and** no alternate mini bind-mounts | `findmnt` / `mount` / `/proc/mounts` / `df` device identity; paths beyond the two legacy strings |
| **identity** | Independently attested hardware/VM identity **≠** mini | `TARGET_ATTESTED_IDENTITY` vs `MINI_ATTESTED_IDENTITY` (OS: `/etc/machine-id`, SMBIOS UUID, cloud instance-id) |
| **control_plane** | SSH + management paths to mini closed | `nc` to mini coords on `MINI_SSH_PORT` (default 22) + `MINI_CONTROL_PORTS` |
| **docker_runtime** | Not `network_mode=host`, not `pid=host`/`ipc=host`, no mini live-data binds | `docker inspect` NetworkMode / PidMode / IpcMode / Binds / Mounts |
| **r2_readonly** *(prove-isolation)* | List/Get only; no parent RW keys | env/policy + optional live `prove-r2-readonly.sh` |

### Environment coordinates

```bash
# Required
export MINI_HOST='203.0.113.1'          # or real mini — must be UNreachable from target
export MINI_ATTESTED_IDENTITY='…'      # mini machine-id / SMBIOS / cloud instance-id
export TARGET_ATTESTED_IDENTITY='…'    # target identity (or auto-read from OS)

# Network multi-axis (all probed when set)
export MINI_IPV4='…'
export MINI_IPV6='…'
export MINI_TAILNET_IP='…'
export MINI_LAN_IP='…'
export MINI_DNS_ALIASES='mini.example,mini.tailnet'
export MINI_HOSTNAMES='mini-alt.local'
export MINI_PG_PORT=5432
export MINI_SSH_PORT=22
export MINI_CONTROL_PORTS='8443,9090'  # optional management ports

# Mounts / sockets beyond legacy two paths
export MINI_PGDATA_MOUNT=/mnt/mini-pgdata
export MINI_BLOB_MOUNT=/mnt/mini-blobs
export MINI_FORBIDDEN_MOUNT_PATHS='/mnt/mini-data,/mnt/mini-pgdata-alt'
export MINI_UNIX_SOCKETS='/tmp/.s.PGSQL.5432'

export REQUIRE_ATTESTED_IDENTITY=1     # default: fail closed if missing/equal
export RESTORE_CONTAINER=fresh-restore-01
# Production default probes classic PG unix sockets (fail closed on co-located mini).
# Isolation fixtures may set MINI_SOCKET_DEFAULTS=0 and supply MINI_UNIX_SOCKETS only.
export MINI_SOCKET_DEFAULTS=1
```

### What is NOT sufficient isolation

- Single failed `nc -z mini 5432` plus absence of `/mnt/mini-pgdata` and `/mnt/mini-blobs`
- Same-host Docker with `network_mode: host` or shared PID/IPC namespaces
- Residual bind-mounts of mini PGDATA/blob volumes under alternate paths
- Identity collision (`TARGET_ATTESTED_IDENTITY == MINI_ATTESTED_IDENTITY`)
- Hardcoded `exit 0` or mocked network unreachability

## Requirements (CAP-BAK-01)

| Check | Requirement |
| --- | --- |
| Network | Multi-axis unreachable mini (IPv4/IPv6/tailnet/LAN/DNS) on PG/SSH/control ports |
| Mounts | No mini data volumes (legacy paths **and** alternates) |
| IPC | No mini unix sockets |
| Identity | Distinct attested hardware/VM identity from mini |
| Credentials | R2 keys are **bucket-scoped List/Get only** — not app/backup RW keys |
| Storage | Empty writable PGDATA + blob dirs, independent of mini |
| Config | Independent `postgresql` / pgBackRest conf — **no symlink to mini** |
| Automation | `scripts/provision-fresh-restore-target.sh` produces the target |

## Local stand-in: Docker container

Full VM/cloud (Proxmox/EC2) is ideal for production fire drills. For local
devops the automated script provisions a **named Docker container** with:

- **Separate bridge network** (`<host>-net`) — not `network_mode: host`
- **Named volumes** for PGDATA/blobs — never bind-mounts of mini PGDATA
- **Published Postgres** only on `127.0.0.1:<RESTORE_PG_PORT>` (default `55432`)
- **R2 object-read-only** env file (`restore-target.env`, mode `0600`)
- **Attested identities** written into `restore-target.env` for multi-axis probe

Default container name: `fresh-restore-01`.

### Paths

| Role | In-container (AC defaults) | Host staging (under repo) |
| --- | --- | --- |
| PGDATA | `/var/lib/postgresql/restore` | `.tmp/fresh-restore/<host>/pgdata` |
| Blobs | `/var/lib/holocron/blob-restore` | `.tmp/fresh-restore/<host>/blob-restore` |
| Env | — | `.tmp/fresh-restore/<host>/restore-target.env` |
| Compose | — | `.tmp/fresh-restore/<host>/docker-compose.yml` |
| pgBackRest conf | `/etc/pgbackrest/pgbackrest.conf` | `.tmp/fresh-restore/<host>/pgbackrest/pgbackrest.conf` |

Host staging dirs start **empty and writable**. They are **not** the mini’s
`/opt/homebrew/var/postgresql@18` (or production PGDATA).

On a real separate VM/cloud host, create the same in-container/AC paths on the
guest filesystem (`/var/lib/postgresql/restore`, `/var/lib/holocron/blob-restore`)
instead of repo staging.

## Provision

```bash
# Dry-run: write compose/env/empty dirs + run isolation probe (no Docker start)
./scripts/provision-fresh-restore-target.sh --host fresh-restore-01 --dry-run

# Full: start Docker Postgres + isolation probe (requires Docker daemon)
export R2_ACCESS_KEY_ID='...object-read-only key...'
export R2_SECRET_ACCESS_KEY='...'
export R2_BUCKET_NAME='holocron-backup'
export R2_ACCOUNT_ID='...cloudflare account...'
export MINI_HOST='203.0.113.1'   # or real mini IP (probe must see it UNreachable)
export MINI_ATTESTED_IDENTITY='mini-smbios-or-machine-id'
# TARGET_ATTESTED_IDENTITY auto-read from OS when unset

./scripts/provision-fresh-restore-target.sh --host fresh-restore-01 --mini-host "$MINI_HOST"
```

### Isolation probe only

```bash
export MINI_HOST=203.0.113.1
export MINI_IPV4=203.0.113.1
export MINI_IPV6=2001:db8::1
export MINI_TAILNET_IP=203.0.113.2
export MINI_LAN_IP=203.0.113.3
export MINI_DNS_ALIASES=mini.invalid
export TARGET_ATTESTED_IDENTITY=target-vm-uuid-aaa
export MINI_ATTESTED_IDENTITY=mini-hw-uuid-bbb
export R2_ACCESS_KEY_ID=ro-key
export R2_SECRET_ACCESS_KEY=ro-secret
export R2_CREDENTIAL_KIND=object-read-only
# Exact concrete bucket + exact object prefix (REDHAT-FIX-H5). NEVER holocron-backup-*.
export R2_CREDENTIAL_POLICY='{"Version":"2012-10-17","Statement":[{"Sid":"HolocronRestoreList","Effect":"Allow","Action":["s3:ListBucket","s3:GetBucketLocation"],"Resource":["arn:aws:s3:::holocron-backup"]},{"Sid":"HolocronRestoreGet","Effect":"Allow","Action":["s3:GetObject"],"Resource":["arn:aws:s3:::holocron-backup/pgbackrest/*"]}]}'

./scripts/prove-isolation.sh
# Expect axes:
#   AXIS network: PASS
#   AXIS ipc_sockets: PASS
#   AXIS mounts: PASS
#   AXIS identity: PASS
#   AXIS control_plane: PASS
#   AXIS docker_runtime: PASS
#   AXIS r2_readonly: PASS
#   === RESULT: PASS (all multi-axis isolation checks) ===
#   exit 0

./scripts/verify-restore-isolation.sh
# Expect: 0 reachable mini routes/sockets/mounts; distinct attested identity
```

Negative controls (must exit non-zero):

```bash
# Co-located / loopback mini
MINI_HOST=127.0.0.1 ./scripts/prove-isolation.sh   # FAIL (control-plane + network)

# Identity collision (same machine pretending to be fresh hardware)
TARGET_ATTESTED_IDENTITY=same MINI_ATTESTED_IDENTITY=same \
  MINI_HOST=203.0.113.1 ./scripts/prove-isolation.sh   # FAIL AXIS identity

# Alternate mini path open while legacy two paths absent
MINI_FORBIDDEN_MOUNT_PATHS=/ MINI_HOST=203.0.113.1 ...  # FAIL if / is mounted

# Control-plane / tailnet path open while PG:5432 closed
MINI_CONTROL_PORTS=8765 MINI_IPV4=127.0.0.1 MINI_HOST=203.0.113.1 ...  # FAIL network

# RW credentials present
R2_PARENT_SECRET_ACCESS_KEY=nope R2_CREDENTIAL_KIND=object-read-only ... → FAIL
R2_CREDENTIAL_KIND=object-read-write ... → FAIL

# Bucket-class wildcard ARN (REDHAT-FIX-H5 — NOT a literal bucket name)
VERIFY_POLICY_ONLY=1 R2_BUCKET_NAME=holocron-backup R2_RESTORE_OBJECT_PREFIX=pgbackrest \
  R2_CREDENTIAL_POLICY='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:ListBucket","s3:GetObject"],"Resource":["arn:aws:s3:::holocron-backup-*"]}]}' \
  ./scripts/verify-restore-creds.sh   # MUST exit != 0
```

Integration suite (PLATFORM_IT):

```bash
PLATFORM_IT=1 pnpm vitest run \
  packages/platform/tests/integration/redhat-fix-h3-multi-axis-isolation.test.ts
```

## R2 read-only credentials

Backup **writer** runtime (D04-02) uses object **read-write** (List/Get/Put/Delete)
scoped to the backup bucket. The **restore target** must use a **different**
identity with **List + Get only**.

### IAM-style policy (List/Get only — exact bucket + exact prefix)

**REDHAT-FIX-H5:** Resource ARNs must name one concrete bucket and one concrete
object-prefix root. `arn:aws:s3:::holocron-backup-*` authorizes a **bucket class**
and is **rejected** (it is not a literal bucket name). Emit via
`buildRestoreCredentialPolicy(bucketName, objectPrefix)` in
`packages/platform/src/backup/config.ts`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "HolocronRestoreList",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": ["arn:aws:s3:::holocron-backup"]
    },
    {
      "Sid": "HolocronRestoreGet",
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": ["arn:aws:s3:::holocron-backup/pgbackrest/*"]
    }
  ]
}
```

Rejected forms (fail closed in `scripts/verify-restore-creds.sh`):

| Resource | Why rejected |
| --- | --- |
| `arn:aws:s3:::holocron-backup-*` | Bucket-class wildcard (not a concrete bucket) |
| `arn:aws:s3:::*` / `*` | Universal wildcard |
| `arn:aws:s3:::holocron-backup/*` | Bucket-wide objects without exact prefix root |
| any Action including `s3:PutObject` / `s3:DeleteObject` | Restore token is List/Get only |

### Minting on Cloudflare R2

1. Cloudflare dashboard → R2 → Manage R2 API Tokens (or Account API Tokens).
2. Create a token with **Object Read** only on bucket `holocron-backup`
   (do **not** grant Object Write / Admin).
3. Export on the restore target only:

   ```bash
   export R2_ACCESS_KEY_ID=...
   export R2_SECRET_ACCESS_KEY=...
   export R2_BUCKET_NAME=holocron-backup
   export R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
   export R2_CREDENTIAL_KIND=object-read-only
   export R2_CREDENTIAL_POLICY='...(JSON above)...'
   ```

4. **Never** export on the restore target:

   - `R2_PARENT_ACCESS_KEY_ID` / `R2_PARENT_SECRET_ACCESS_KEY`
   - `R2_READ_WRITE_*` / app multi-bucket keys
   - D04-02 backup writer keys that allow `s3:PutObject` / `s3:DeleteObject`

### Verify scoping (real R2) — live proof

**Placeholder policy JSON alone does not satisfy live AC-2.** Run the live probe.

**REDHAT-FIX-H4:** Delete/Put negative controls MUST use a uniquely generated
**sacrificial** object under `drill-neg/<uuid>/` only. **NEVER** delete the
bucket-root recovery object key named `existing` (or any live recovery key under
`backup/`, `archive/`, `pgbackrest/`, `restic/`, configured `HOLO_BACKUP_PREFIX`).
Scripts hard-refuse denylisted keys before any delete API call. Alternate
non-mutating path: `./scripts/verify-restore-creds.sh` proves restore policy
`PutObject`/`DeleteObject` action count = 0 without deleting objects.

```bash
export R2_RESTORE_ACCESS_KEY_ID=...
export R2_RESTORE_SECRET_ACCESS_KEY=...
export R2_ACCOUNT_ID=...
export R2_BUCKET_NAME=holocron-backup
export R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export R2_CREDENTIAL_KIND=object-read-only

REQUIRE_LIVE_R2_RO=1 ./scripts/prove-r2-readonly.sh
# MUST_OBSERVE:
#   PASS: aws s3 ls … exit 0
#   PASS: aws s3 cp denied on drill-neg key (Put blocked; AccessDenied/403)
#   PASS: aws s3api delete-object denied on drill-neg key (Delete blocked)
# MUST_NOT_OBSERVE: put/delete exit 0; any delete against existing/backup/pgbackrest

# Denylist self-check (no network):
./scripts/prove-r2-readonly.sh --assert-denylisted existing
./scripts/prove-r2-readonly.sh --assert-denylisted backup/main/latest
SAC=$(./scripts/prove-r2-readonly.sh --make-sacrificial-key)
./scripts/prove-r2-readonly.sh --assert-safe-key "$SAC"

# Non-mutating policy path (DeleteObject count must be 0 for restore RO):
./scripts/verify-restore-creds.sh

REQUIRE_LIVE_R2_RO=1 MINI_HOST=203.0.113.1 \
  TARGET_ATTESTED_IDENTITY=target-x MINI_ATTESTED_IDENTITY=mini-y \
  R2_ACCESS_KEY_ID="$R2_RESTORE_ACCESS_KEY_ID" \
  R2_SECRET_ACCESS_KEY="$R2_RESTORE_SECRET_ACCESS_KEY" \
  R2_ENDPOINT="$R2_ENDPOINT" \
  R2_CREDENTIAL_KIND=object-read-only \
  ./scripts/prove-isolation.sh
```

Manual equivalent (sacrificial drill-neg key only):

```bash
export AWS_ACCESS_KEY_ID="$R2_RESTORE_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_RESTORE_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto
DRILL_KEY="drill-neg/$(uuidgen | tr '[:upper:]' '[:lower:]')-redhat-fix-h4.txt"

aws s3 ls "s3://${R2_BUCKET_NAME}" --endpoint-url "$R2_ENDPOINT"
# expect exit 0

aws s3 cp /dev/null "s3://${R2_BUCKET_NAME}/${DRILL_KEY}" --endpoint-url "$R2_ENDPOINT"
# expect AccessDenied (non-zero) — Put blocked on sacrificial key

aws s3api delete-object --bucket "$R2_BUCKET_NAME" --key "$DRILL_KEY" \
  --endpoint-url "$R2_ENDPOINT"
# expect AccessDenied (non-zero) — Delete blocked; never target live recovery keys

# FORBIDDEN (REDHAT-FIX-H4): delete-object against live recovery keys such as
# bucket-root "existing", backup/*, pgbackrest/*, restic/* — scripts denylist these.
```

If only D04-02 **read-write** keys exist in `secrets.yaml`, the live probe **must fail**
(Put succeeds on the sacrificial key — fail-closed). Mint a distinct Object Read
token (dashboard or `CLOUDFLARE_API_TOKEN` + `R2_PARENT_ACCESS_KEY_ID` +
`./scripts/prove-r2-readonly.sh --try-mint`).

## What the provision script does

1. Creates staging under `.tmp/fresh-restore/<host>/` (empty PGDATA + blob dirs).
2. Writes `restore-target.env` with `R2_CREDENTIAL_KIND=object-read-only`, multi-axis
   mini coordinates, and attested identities (mode `0600`).
3. Writes an **independent** pgBackRest conf (not a symlink to mini).
4. Writes `docker-compose.yml` for container `<host>` on bridge network `<host>-net`
   with named volumes `<host>-pgdata` / `<host>-blobs` (never host network).
5. If Docker is up: `docker compose up -d`, wait for `pg_isready`, print version.
6. Runs `scripts/prove-isolation.sh` multi-axis with restore-target env only (fails closed).

## Anti-patterns (NEVER)

- Restore into a scratch dir on the mini that still can open mini PGDATA
- Bind-mount `/opt/homebrew/var/postgresql@18` or mini blob volumes into the target
- Reuse D04-02 **read-write** R2 runtime keys on the restore target
- Isolation probe that only checks TCP/5432 + two mount path strings
- Isolation probe that always `exit 0` without real `nc` / `mount` / identity checks
- Same-host containers claiming “fresh hardware” without distinct attested identity
- Symlinking restore pgBackRest/postgres conf to the mini’s config tree
- **REDHAT-FIX-H4:** deleting the bucket-root recovery key `existing` (or any live
  recovery object) as a credential negative control — if the target accidentally holds
  RW keys, this deletes recovery data. Use `drill-neg/<uuid>/` sacrificial keys or
  non-mutating policy inspect only.

## Next step

D05-04 runs the end-to-end fire drill **against this target**: pgBackRest restore
from R2 into the empty PGDATA, then blob restore into the empty blob dir, with
multi-axis isolation re-checked via `verify-restore-isolation.sh`.
