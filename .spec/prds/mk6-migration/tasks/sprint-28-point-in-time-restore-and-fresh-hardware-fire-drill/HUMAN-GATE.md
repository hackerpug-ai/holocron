# Sprint 28 — Human Testing Gate (executable)

**Capability:** CAP-BAK-01 (PITR + fresh-hardware fire-drill)  
**Dispatcher:** `bun services/platform/src/cli/holo.ts` (never a PATH `holo` stub)  
**Machine plan:** [`gate-plan.json`](./gate-plan.json)

## Preconditions

```bash
export HOLO_SECRETS_PATH="${HOLO_SECRETS_PATH:-services/platform/config/secrets.yaml}"
# Worktrees may fall back to the primary checkout secrets path.
mkdir -p .tmp/REDHAT-FIX-H2
```

## Automated oracle suites (preferred pre-check)

```bash
# H1 — capability completeness (paths + CLI verbs)
pnpm vitest run services/platform/tests/integration/sprint28-capability-inventory.test.ts

# H2 — human-gate surface oracles (PLATFORM_IT)
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-human-gate-oracles.test.ts

# Full empty/corrupt/healthy restore RED suite
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts
```

## Six gate steps (literal commands)

### 1 — PITR restore to named timestamp

```bash
mkdir -p .tmp/REDHAT-FIX-H2/step1-scratch
bun services/platform/src/cli/holo.ts restore \
  --pitr "${PITR_TIMESTAMP:-2099-01-01T00:00:00Z}" \
  --scratch .tmp/REDHAT-FIX-H2/step1-scratch \
  --target-action promote
# In-window: exit 0 + queryable DB. Outside WAL / empty: non-zero + named error.
# MUST NOT observe: unknown flag: --pitr
```

### 2 — Fresh target isolation (multi-axis)

```bash
MINI_HOST=203.0.113.1 \
MINI_IPV4=203.0.113.1 MINI_IPV6=2001:db8::1 \
MINI_TAILNET_IP=203.0.113.2 MINI_LAN_IP=203.0.113.3 \
MINI_DNS_ALIASES=mini.invalid MINI_SOCKET_DEFAULTS=0 \
MINI_UNIX_SOCKETS=/tmp/.s.PGSQL.5432-gate-absent \
TARGET_ATTESTED_IDENTITY=target-vm-uuid-gate \
MINI_ATTESTED_IDENTITY=mini-hw-uuid-gate \
REQUIRE_ATTESTED_IDENTITY=1 \
R2_ACCESS_KEY_ID=ro-test R2_SECRET_ACCESS_KEY=ro-test \
R2_CREDENTIAL_KIND=object-read-only \
R2_CREDENTIAL_POLICY='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:ListBucket","s3:GetBucketLocation"],"Resource":["arn:aws:s3:::holocron-backup"]},{"Effect":"Allow","Action":["s3:GetObject"],"Resource":["arn:aws:s3:::holocron-backup/*"]}]}' \
NC_TIMEOUT_SEC=1 \
bash scripts/prove-isolation.sh
# Expect: RESULT: PASS (all axes)
```

### 3 — Fire-drill row-count parity

```bash
mkdir -p .tmp/REDHAT-FIX-H2/step3-scratch .tmp/REDHAT-FIX-H2/step3-blob
bun services/platform/src/cli/holo.ts restore:fire-drill \
  --target-timestamp "${PITR_TIMESTAMP:?set in-window ISO}" \
  --scratch .tmp/REDHAT-FIX-H2/step3-scratch \
  --blob-dir .tmp/REDHAT-FIX-H2/step3-blob \
  --report .tmp/REDHAT-FIX-H2/parity-report.json
jq -e '.POSTGRES_PARITY_PASS == true' .tmp/REDHAT-FIX-H2/parity-report.json
```

### 4 — Evidence-ledger SHA-256 match

```bash
jq -e '.LEDGER_CHECKSUM_MATCH == true' .tmp/REDHAT-FIX-H2/parity-report.json
```

### 5 — Blob SHA-256 parity

```bash
jq -e '.BLOB_PARITY_PASS == true and (.matched_objects // 0) >= 1' .tmp/REDHAT-FIX-H2/parity-report.json
```

### 6 — Empty/corrupt chain fail-closed (negative control)

```bash
mkdir -p .tmp/REDHAT-FIX-H2/step6-scratch
EMPTY_PREFIX="pgbackrest-s28-gate-empty/${GATE_RUN_ID:-manual}"
set +e
R2_PGBACKREST_PREFIX="$EMPTY_PREFIX" \
  bun services/platform/src/cli/holo.ts restore \
    --pitr 2024-01-01T00:00:00Z \
    --scratch .tmp/REDHAT-FIX-H2/step6-scratch \
    --target-action promote
RC=$?
set -e
test "$RC" -ne 0
# MUST observe named restore error (chain missing / integrity / outside WAL / secrets)
# MUST NOT sole-observe: unknown flag: --pitr
# MUST: scratch PGDATA file count == 0
```

## Evidence paths

| Artifact | Path |
|----------|------|
| Capability inventory | `.tmp/REDHAT-FIX-H1/capability-inventory.json` |
| Human-gate oracle evidence | `.tmp/REDHAT-FIX-H2/**` |
| Full restore RED suite | `.tmp/D05-01/**` |
