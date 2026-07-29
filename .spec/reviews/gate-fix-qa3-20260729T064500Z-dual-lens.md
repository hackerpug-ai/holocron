# GATE-FIX-QA3 dual-lens closeout

- **QA fail:** `20260729T061718Z` (+ rearm `20260729T062200Z`)
- **Branch tip:** `bec00ec2dfb8a1fd2b60e5d57f651b36c759dc09`
- **Pattern:** capture-then-cover (jointly truthful payload; no temporal relabeling)

## Lenses

| Lens | Verdict |
|------|---------|
| Product | APPROVED |
| Technical | APPROVED |

## Product path

- `resolveRecoverableBaselineBinding` — Pattern A stop≥capture + coverage; Pattern B as-of; refuse later payload stamped as older stop
- Base-backup pre-captures digests before pgBackRest; emitLiveRecoveryBaseline covers or fail-closed
- Discovery `target_timestamp <= drill` unchanged; exact restic preserved
- Gate-plan / evidence untouched; human gate not re-run
