# GATE-FIX-QA2 dual-lens closeout

- **QA run:** `20260729T053810Z` (verified fail on main `4fc38697`)
- **Branch tip reviewed:** `92502e52c7efcd453ee3a384bb9f165430d431b2`

## Lenses

| Lens | Verdict |
|------|---------|
| Product | APPROVED |
| Technical | APPROVED |

## Product path

1. `holo restore:window` — live pgBackRest earliest/latest/`recommended_pitr` for `PITR_TIMESTAMP` (outside-WAL fail-closed unchanged).
2. `holo backup:emit-recovery-baseline` — upload parity-meaningful baseline bound to listable restic snapshot; ghosts refused.
3. Fire-drill exact restic selection fail-closed preserved (S28R2 H2).

## Explicitly not done

- Independent six-step human-gate re-run (operator / Terra High).
- No edits to gate-plan / gate-results / gate-verification / GATE-RESULTS / `.gate-evidence`.
