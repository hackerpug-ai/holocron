# Freeze-state fence status (S31-OPS-06)

**Command:** `holo cutover:fence-status [--json] [--allow-convex-unreachable] [--offline]`  
**Capabilities:** CAP-MIG-01, CAP-CUT-01  
**Scope note:** 01-scope — **no thaw**. There is no `cutover:thaw` product command.

## Why

Cutover freeze is one-way. Split-brain between:

1. **secrets.yaml** (platform soak control-plane for post-PONR writes),
2. **process.env** (boot-time / operator shell),
3. **Convex deployment env** (live cutover write fence),

makes quiet-check, ETL, and rollback-repoint decisions on false premises.

## Source of truth

| Plane | Freeze key | Role |
|-------|------------|------|
| Platform (post-PONR) | `HOLO_MIGRATION_READ_ONLY` in `secrets.yaml` | Durable soak fence re-read on every write chokepoint |
| Process | `HOLO_MIGRATION_READ_ONLY` env | Boot overlay; sticky — do not assume it matches secrets after flip/enable-writes |
| Convex | `HOLO_MIGRATION_READ_ONLY` deployment env | Armed by `holo cutover:freeze`; **remains fenced** through soak; **no product thaw** |
| Complementary | `HOLO_CUTOVER_SCHEDULES_DISABLED` | Drain sequencing only — not a second write fence |

Reconcile with:

```bash
cd services/platform && bun src/cli/holo.ts cutover:fence-status --json
# or from repo root:
bun services/platform/src/cli/holo.ts cutover:fence-status --json
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | `aligned: true` — secrets, env, and Convex agree on migration freeze state |
| 0\* | secrets+env agree, Convex unreadable, and `--allow-convex-unreachable` set (\* still labels `source: convex_unreachable`) |
| 2 | `FENCE_SPLIT_BRAIN` — secrets/env/Convex disagree on `HOLO_MIGRATION_READ_ONLY` |
| 3 | `CONVEX_UNREACHABLE` — missing credentials or Convex env get failed (without allow flag) |

### JSON shape (abridged)

```json
{
  "aligned": false,
  "status": "split_brain",
  "code": "FENCE_SPLIT_BRAIN",
  "secrets": { "HOLO_MIGRATION_READ_ONLY": "1", "source": "secrets", "path": "…" },
  "env": { "HOLO_MIGRATION_READ_ONLY": "0", "source": "env" },
  "convex": { "value": "1", "source": "convex_env" }
}
```

When Convex credentials are missing:

```json
{
  "aligned": false,
  "status": "convex_unreachable",
  "code": "CONVEX_UNREACHABLE",
  "convex": { "value": null, "source": "convex_unreachable", "error": "missing Convex credentials …" }
}
```

Missing Convex credentials are **never** treated as aligned without the `convex_unreachable` label.

## Operator rules

1. **Do not thaw Convex** — no `cutover:thaw`; do not `npx convex env unset HOLO_MIGRATION_READ_ONLY` as a product path.
2. After `cutover:flip` / `enable-writes`, re-check with `fence-status` so secrets and env tell the same story as Convex.
3. Use `--offline` only for airplane / hermetic harnesses; it still labels `convex_unreachable`.
4. Prefer fixing the disagreeing source over forcing `--allow-convex-unreachable` in production.
