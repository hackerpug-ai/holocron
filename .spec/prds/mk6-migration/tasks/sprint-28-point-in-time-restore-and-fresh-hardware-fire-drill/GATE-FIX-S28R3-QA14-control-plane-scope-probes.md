# GATE-FIX-S28R3-QA14 — Control-plane scope probe binding

**Listed via:** authorized writer control plane  
**Object created:** no (list-only)  
**Bound config:** `scripts/lib/r2-scope-probes.json`

## Known-existing keys

| Role | Exact key |
|------|-----------|
| In-scope (`pgbackrest/`) | `pgbackrest/archive/main/18-1/0000000100000005/0000000100000005000000E3-13f27e2e010416e3c641c1355c653bee6ec7a24b.gz` |
| Out-of-scope | `recovery-baselines/by-backup/20260728-182755F/e1525b1f368a45062149243b9ddfcdfe5dc54fdf23b25136c9ef0cf1037e6360/recovery-baseline.json` |

## Oracles

- In-scope: List + Head + Get must succeed on the in-key.
- Out-of-scope: List + Head + Get against the out-key (and its parent prefix for List) must return **explicit AccessDenied**.
- Never accept 404 / NoSuchKey / unclassified failure as authorization denial.
- Production live env keys must byte-equal this control-plane binding (defaults from trusted JSON when unset).
