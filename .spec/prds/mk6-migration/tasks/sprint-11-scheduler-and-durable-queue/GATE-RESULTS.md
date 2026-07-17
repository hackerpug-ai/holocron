# Gate Results: sprint-11-scheduler-and-durable-queue

## ✅ VERIFIED — recomputed `pass` == claimed `pass`; 8/8 recomputed; 0 discrepancies
**proof:** `.spec/prds/mk6-migration/tasks/sprint-11-scheduler-and-durable-queue/gate-verification.json`

- **Date / Run ID:** 2026-07-17T21-37-51Z
- **Sprint:** sprint-11-scheduler-and-durable-queue (Scheduler and Durable Queue)
- **Environment:** real Postgres at `127.0.0.1:5432/holocron`; `DATABASE_URL=postgres://127.0.0.1:5432/holocron`
- **Realization:** `holo` is not on PATH — each SPRINT.md `holo <sub>` was driven as its literal production invocation `bun services/platform/src/cli/holo.ts <sub>` (all subcommands exist at `services/platform/src/cli/holo.ts:2453-2711`).
- **Exec pane:** surface:209 (608FD87E-6C35-4713-8375-9D43C48C19BE) — cmux split beside qa surface 497F9980-D83A-4E7D-B2C3-BAEF507F6F81
- **UI driver:** none (gate is operator-CLI only — no UI steps in this sprint)
- **Evidence dir:** `.gate-evidence/2026-07-17T21-37-51Z/` (committed; per-step `step{n}.log` + `.exit` + `.assertion.json`)
- **Note on prior run:** the previous gate (`gate-results.prev.json`) was `blocked` on the FALSE premise that steps 2/3/5/6 had "no holo operator CLI." SPRINT.md documents these very commands (`queue:effect`, `queue:enqueue`, `queue:dequeue`, `queue:poison`, `queue:audit`) and they are implemented. `gate-results.prev.json` was left untouched per instructions.

## Summary

| Result | Count |
|--------|-------|
| ✅ Pass | 8 |
| ❌ Fail | 0 |
| 🔧 Wiring Gap | 0 |

**Verdict: `pass` (verified)** — all 8 literal SPRINT.md operator steps genuinely executed against real Postgres and passed; verdict recomputed from raw evidence with 0 discrepancies.

## Per-Step Results

| # | Gate step | Method | Result | Evidence | Log |
|---|-----------|--------|--------|----------|-----|
| 1 | `holo jobs:run-all` — all 16 fire | real-cli | ✅ pass | jobs_fired=16/16, jobs_total=16, side_effect_rows=100, exit 0 | step1.log |
| 2 | `holo queue:effect effect-kill9-1 --boundary before-commit` | real-cli | ✅ pass | boundary=before-commit; effect_count=1 outbox_count=1 inbox_dedupe_count=1 fencing_token=fence-9b44d019… exactly_once=true | step2.log |
| 3 | `holo queue:effect effect-kill9-2 --boundary after-commit-before-enqueue` | real-cli | ✅ pass | effect_count=1 outbox_count=1 inbox_dedupe_count=1 fencing_token=fence-8d6701de… exactly_once=true | step3.log |
| 4 | `holo queue:effect effect-kill9-3 --boundary after-dispatch-before-ack` | real-cli | ✅ pass | effect_count=1 outbox_count=1 inbox_dedupe_count=1 fencing_token=fence-815266fd… exactly_once=true | step4.log |
| 5 | `holo queue:audit effect-kill9-1` | real-cli | ✅ pass | effect_count=1 outbox_count=1 inbox_dedupe_count=1 fencing_token=fence-9b44d019… (matches step-2 token) | step5.log |
| 6 | interactive priority: `queue:enqueue` bg → ix → `queue:dequeue` | real-cli | ✅ pass | first dequeued lane=interactive priority=100 (interactive before background) | step6.log |
| 7 | `holo queue:poison poison-1 --max-attempts 3` | real-cli | ✅ pass | status=dead_letter attempts=3/3 max_attempts=3 dlq_count=1 dead_letter=true | step7.log |
| 8 | `holo jobs:list` | real-cli | ✅ pass | count=16 split janitor=7 workflow=4 consumer=1 backfill=3 digest=1 | step8.log |

## Verification

`verify-gate-evidence.sh` recomputed all 8 steps from raw artifacts (D1 coverage-parity 8==8, D2 cmd-fidelity all matching, D3 exit+regex all hold, D6 verdict `pass`==`pass`):

```json
{"verified":true,"claimed_verdict":"pass","recomputed_verdict":"pass","steps_planned":8,"steps_recomputed":8,"discrepancies":[]}
```

## Failures
None.

## Wiring Gaps
None — every step is a real documented `holo` operator invocation. The gate sentence (kill-9 at each commit/dispatch/ack boundary ⇒ exactly one observable side-effect + one auditable outbox/inbox dedupe record) is exercised by steps 2/3/4 and corroborated by the audit in step 5; interactive priority by step 6; DLQ by step 7; the full 16-job migration by steps 1 and 8.
