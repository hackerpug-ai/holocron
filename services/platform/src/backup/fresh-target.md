# Fresh restore target (D05-03 / CAP-BAK-01)

Genuinely isolated restore hardware for the Sprint 28 fire drill. A scratch
directory on the mini is **not** sufficient isolation.

## Requirements (CAP-BAK-01)

| Check | Requirement |
| --- | --- |
| Network | No route from restore target to mini Postgres (`MINI_HOST:5432`) |
| Mounts | No `/mnt/mini-pgdata` or `/mnt/mini-blobs` (or any mini data volume) |
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

./scripts/provision-fresh-restore-target.sh --host fresh-restore-01 --mini-host "$MINI_HOST"
```

### Isolation probe only

```bash
export MINI_HOST=203.0.113.1
export R2_ACCESS_KEY_ID=ro-key
export R2_SECRET_ACCESS_KEY=ro-secret
export R2_CREDENTIAL_KIND=object-read-only
export R2_CREDENTIAL_POLICY='{"Version":"2012-10-17","Statement":[{"Sid":"HolocronRestoreList","Effect":"Allow","Action":["s3:ListBucket","s3:GetBucketLocation"],"Resource":["arn:aws:s3:::holocron-backup"]},{"Sid":"HolocronRestoreGet","Effect":"Allow","Action":["s3:GetObject"],"Resource":["arn:aws:s3:::holocron-backup/*"]}]}'

./scripts/prove-isolation.sh
# Expect:
#   PASS: no route to mini Postgres
#   PASS: no mini PGDATA mount
#   PASS: no mini blob mount
#   PASS: R2 credentials are read-only scoped
#   exit 0
```

Negative controls (must exit non-zero):

```bash
# Mini Postgres reachable
MINI_HOST=127.0.0.1 ./scripts/prove-isolation.sh   # if local :5432 open → FAIL

# RW credentials present
R2_PARENT_SECRET_ACCESS_KEY=nope R2_CREDENTIAL_KIND=object-read-only ... → FAIL
R2_CREDENTIAL_KIND=object-read-write ... → FAIL
```

## R2 read-only credentials

Backup **writer** runtime (D04-02) uses object **read-write** (List/Get/Put/Delete)
scoped to the backup bucket. The **restore target** must use a **different**
identity with **List + Get only**.

### IAM-style policy (List/Get only)

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
      "Resource": ["arn:aws:s3:::holocron-backup/*"]
    }
  ]
}
```

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

### Verify scoping (real R2)

```bash
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto
aws s3 ls "s3://${R2_BUCKET_NAME}" --endpoint-url "$R2_ENDPOINT"
# expect exit 0

aws s3 cp /dev/null "s3://${R2_BUCKET_NAME}/restore-probe-should-deny" --endpoint-url "$R2_ENDPOINT"
# expect AccessDenied (non-zero)

aws s3 rm "s3://${R2_BUCKET_NAME}/some-existing-object" --endpoint-url "$R2_ENDPOINT"
# expect AccessDenied (non-zero)
```

## What the provision script does

1. Creates staging under `.tmp/fresh-restore/<host>/` (empty PGDATA + blob dirs).
2. Writes `restore-target.env` with `R2_CREDENTIAL_KIND=object-read-only` and the
   List/Get policy (mode `0600`).
3. Writes an **independent** pgBackRest conf (not a symlink to mini).
4. Writes `docker-compose.yml` for container `<host>` on bridge network `<host>-net`
   with named volumes `<host>-pgdata` / `<host>-blobs`.
5. If Docker is up: `docker compose up -d`, wait for `pg_isready`, print version.
6. Runs `scripts/prove-isolation.sh` with restore-target env only (fails closed).

## Anti-patterns (NEVER)

- Restore into a scratch dir on the mini that still can open mini PGDATA
- Bind-mount `/opt/homebrew/var/postgresql@18` or mini blob volumes into the target
- Reuse D04-02 **read-write** R2 runtime keys on the restore target
- Isolation probe that always `exit 0` without `nc` / `mount` / env checks
- Symlinking restore pgBackRest/postgres conf to the mini’s config tree

## Next step

D05-04 runs the end-to-end fire drill **against this target**: pgBackRest restore
from R2 into the empty PGDATA, then blob restore into the empty blob dir, with
isolation re-checked.
