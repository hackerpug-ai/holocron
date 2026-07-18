# Sprint 17 Gate Results

**Source head:** `37281e7`  
**Real run:** `019f75db-113d-7a68-8a60-3b49b1e4da96`  
**Raw evidence:** `.tmp/sprint-17-human-gate-20260718T153514Z/`

All six roadmap steps passed against the non-production Postgres and local fleet:

1. Thin evidence suspended the durable mission at the deterministic gate.
2. Supplying graded independent evidence resumed the same run and committed `admitted=true`.
3. `gate:eval --claims` returned `pureTs=true` and supporting admission.
4. `research:inspect` showed distinct fleet ASSAY/CHALLENGE instances and committed evidence.
5. `gate:eval --refuting` returned `pureTs=true` with the same admission rules.
6. `research:trace --processes` showed `noExternalHarness=true`, `noExternalExecutionHarness=true`, no forbidden processes, and no ancestor harnesses.

The Postgres stage history is append-only: attempt 0 remains committed and resumed attempt 1 is added for RETRIEVE, EXTRACT, ASSAY, and CHALLENGE; the pending gate attempt is retained alongside its committed attempt. Gate evidence is present in the committed GATE and COMMIT outputs.

Verification: `pnpm typecheck` passed; the targeted live suite passed 3 files / 8 tests. Independent review found no remaining Sprint 17 HIGH/CRITICAL findings after append-only resume and strict process-proof remediation.
