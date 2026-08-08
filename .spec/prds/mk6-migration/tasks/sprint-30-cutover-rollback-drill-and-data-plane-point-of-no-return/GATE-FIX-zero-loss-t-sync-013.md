# GATE-FIX-zero-loss-t-sync-013 — Zero-loss + post-PONR invariants as release-blocking identity oracles (T-SYNC-013/014)

> **Task ID:** GATE-FIX-zero-loss-t-sync-013
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** CRITICAL
> **Source finding:** T-SYNC-013 zero-loss guarantee broken under disarmed soak fence; gate can partial-pass T-SYNC-014 while T-SYNC-013 fails
> **Source:** human-gate run `20260808T011038Z` @ HEAD `54299bfc76fec6fc52468dae451ca293a6f104c4` (partial 3/5)
> **Proposed by:** `security-auditor`
> **TDD:** red_first · RED_GREEN_REQUIRED=yes · seeded_evidence=yes
> Status: Planned — plan only; do not implement until dual-lens APPROVED for merge path
> **Branch:** implementer task branch; plan-only on main via orchestrator; unreviewed NEVER merges; merge only after dual-lens APPROVED via `kb-orchestrate` `references/merge-to-main.sh` (orchestrator-only)
> **Siblings:** `GATE-FIX-drill-fence-precondition` (product fail-closed) · `GATE-FIX-gate-preflight-fence-rearm` (gate re-arm)

## Finding

**T-SYNC-013 / UC-SYNC-04 AC-2 zero-loss is not held as a release-blocking safety oracle.** Severity: **CRITICAL**. Confidence: **HIGH**.

### Observed residue (gate `20260808T011038Z` @ `54299bfc`)

| Step | Result | Observed safety fact |
|------|--------|----------------------|
| preflight | ledger dual-reset OK | `after_table_count=0`, `ponr_count=0` — clean start claimed |
| 1 rollback-drill | **FAIL** | `fence_armed=false`; five-surface probes **minted real production writes**; `lost_accepted_writes=1`; error `DRILL_WRITE_SURFACES_NOT_BLOCKED` |
| 2 ledger count | **FAIL** | Postgres `post_export_write_audit` `accepted_count=2` |
| 3 pin+boot | PASS | out of this task’s primary residual |
| 4 enable-writes | PASS | real this-run PONR `ponr_id=31b33eb4-3e97-4520-b6a7-745186fc8d51`, `write_row_id=ebd12bd6-f78d-4849-9595-8bc9d4036269` |
| 5 rollback-repoint | PASS | `POST_PONR_INELIGIBLE` with matching this-run `ponr_id` / `write_row_id` |

**Concrete accepted write identities from step1 probes (not synthetic):**

- app surface HTTP **201** → document id `145f82e5-567d-4fd6-b97d-ff9a9ab998e2` (`title=rollback-drill-app-drill-msjogbzr`)
- mcp surface accepted → documentId `5ef15d4b-2f27-451f-9a03-efee7d8d4b7a` (`title=rollback-drill-mcp-drill-msjogbzr`)
- upload `404` (not a clean `migration_read_only` block); job `ok:true`; mission `rejected:false`
- drill path: `fence_armed=false` while soak rollback was supposed to run under armed `HOLO_MIGRATION_READ_ONLY`

**Entanglement with residual / post-PONR state during step1:**

- Nested `cutover:rollback-repoint` inside the drill returned `POST_PONR_INELIGIBLE` with **residual** `ponr_id=585ecd45-65ed-43b3-875d-eed092697bbb` and sentinel `write_row_id=00000000-0000-4000-8000-aaaaaaaaaaaa` (not this-run).
- Preflight claimed `ponr_cleared:true` / `ponr_count:0`, yet step1 still observed a residual PONR refuse path — residual latch state can masquerade / collide with the soak drill’s expected zero-loss repoint path.
- Step5 later correctly refused on the **real this-run** step4 PONR (`31b33eb4…` / `ebd12bd6…`). That proves T-SYNC-014 latch machinery still fires — **not** that T-SYNC-013 zero-loss held.

### What the guarantee actually is

During soak, representative writes are **blocked** with `migration_read_only`; config re-point succeeds with **zero** accepted post-export production writes. After the first accepted Postgres production write (PONR), rollback is permanently `POST_PONR_INELIGIBLE`.

Today the gate can report **partial 3/5** (steps 4–5 green) while steps 1–2 fail. That means **T-SYNC-013 is not held** even when **T-SYNC-014 latch works**. Partial green on steps 4–5 must never be interpretable as “rollback insurance is good enough for release.”

### Oracle weakness class (fakeability)

| Weak oracle | Why it fails closed insufficiently |
|-------------|-------------------------------------|
| Step2 `accepted_count == 0` only | Count-only; when count>0 no identity of lost rows; no bind to probe-created document ids |
| Step1 regex `"lost_accepted_writes":\s*0` alone | Success-path-only string; does not force fail-closed identity proof or fence-armed preflight |
| Step5 regex `POST_PONR_INELIGIBLE` alone | Residual sentinel PONR (aaaa UUID) or leftover latch can satisfy the string without binding this-run step4 `ponr_id`/`write_row_id` |
| Independent recompute with `rawFileByteCount:0` yet `matchesReport:true` | File/Postgres dual-source mismatch already documented; count agreement without durable identity is weak |
| Path-exists / invented JSON | Never proves production ledger / documents rows |

**Required remediation:** Strengthen **gate release oracles** so zero-loss and post-PONR are **identity-bound, fail-closed, release-blocking** invariants — not weak count-only / success-path-only checks. Cross-link product/devops siblings that re-arm / preflight-assert the soak fence so step1 cannot mint loss under a disarmed fence; this task’s job is the **oracle + fail-closed gate contract**.

## Zero-loss + post-PONR identity predicate semantics

```
# STEP1 / T-SYNC-013 (soak rollback drill)
PRE:  durable+serving HOLO_MIGRATION_READ_ONLY armed (truthy) before probes
      post_export_write_audit empty after authorized preflight (table_count=0 AND file empty)
      data_plane_ponr empty after authorized preflight when clear-ponr used
PROBES: all five surfaces blocked with migration_read_only (no HTTP 201 / accepted MCP write)
PASS_STEP1 iff:
  - drill.ok == true
  - drill.repointed == true
  - drill.lost_accepted_writes == 0
  - drill.independentRecompute.acceptedCount == 0 AND matchesReport == true
  - fence was armed for probes (fence_armed=true in drill error path must never appear with accepted probes)
  - accepted_write_ids from ledger for this run == ∅
FAIL_CLOSED_STEP1 if any accepted post-export write is created during the drill
  - MUST surface identity set W = {document/row ids from probes + ledger}
  - MUST NOT allow later steps to claim zero-loss for this run

# STEP2 / T-SYNC-013 ledger oracle (authoritative Postgres)
PASS_STEP2 iff:
  - Postgres SELECT count(*) FROM post_export_write_audit == 0
  - independent recompute from drill report acceptedCount == 0
  - identity set W_ledger == ∅ (explicit query of row ids / resource ids, not count alone)
  - none of this-run probe document ids appear in documents table as probe-created rows
WHEN count > 0 (negative / residual path):
  - MUST emit accepted_write_identities: [{id, surface?, created_at?, ...}, ...]
  - MUST fail closed; count-only failure message without identities is NOT closed

# STEP4 / T-SYNC-014 (this-run PONR)
PASS_STEP4 iff:
  - ok:true with real ponr_id and write_row_id (not residual aaaa sentinel)
  - write_row_id is a real documents.id committed this run
CAPTURE: step4.ponr_id, step4.write_row_id as THIS_RUN_PONR identity

# STEP5 / T-SYNC-014 latch after real step4
PASS_STEP5 iff:
  - exit == 2
  - error.code == POST_PONR_INELIGIBLE  (sole successful step5 oracle after real step4)
  - repointed == false
  - precondition.ponr_id == step4.ponr_id  (identity bind)
  - message / structured field write_row_id == step4.write_row_id (identity bind)
  - write_row_id is NOT residual sentinel 00000000-0000-4000-8000-aaaaaaaaaaaa
  - residual pre-run PONR alone MUST NOT satisfy step5 without matching THIS_RUN_PONR

# RELEASE VERDICT
RELEASE_PASS iff steps 1..5 all pass under the predicates above.
partial with steps 4–5 green and 1–2 red is FAIL for T-SYNC-013 release claim.
```

## Scope (WRITE-ALLOWED)

- `scripts/run-sprint30-human-gate.sh` — preflight fence-armed assert; step fail-closed wiring; cross-step identity capture (step4 → step5); do not weaken tip-bind / ledger dual-reset
- `.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/gate-plan.json` — step1/2/5 assertion strengthening only (identity bind, fail-closed negatives); **do not** re-open C-2 packaging or C-3 trigger-set classes
- `scripts/assert-human-test-verdict.sh` — optional strengthening so release pass cannot ignore T-SYNC-013 identity oracles; must not weaken C-2/C-3/M-3
- `scripts/package-sprint30-gate-evidence.sh` — only if needed to package new oracle artifacts; no C-2/C-3 class reopen
- `scripts/reset-sprint30-gate-ledger.sh` — only if residual PONR clear must be proven fail-closed (preflight honesty); keep POST_PONR real-oracle note
- Optional NEW helpers under `scripts/` / `scripts/lib/`:
  - `assert-zero-loss-identity-oracle.sh` / `zero-loss-identity-oracle.py`
  - `assert-post-ponr-identity-bind.sh`
  - `assert-gate-fence-armed-preflight.sh`
- Optional NEW negative harness fixtures under `.tmp/GATE-FIX-zero-loss-t-sync-013/fixtures/**`
- Evidence: `.tmp/GATE-FIX-zero-loss-t-sync-013/**`
- Cross-link siblings `GATE-FIX-drill-fence-precondition` and `GATE-FIX-gate-preflight-fence-rearm`
- **May** minimally touch `services/platform/src/cutover/rollback-drill.ts` report fields **only** to emit accepted write identities / fence_armed boolean into the drill JSON for oracle bind — **not** a redesign of Sev-1 trigger or five-surface probe set
- **Does not** re-open C-2 executable-HEAD packaging classes (RH-S30-35) or C-3 exact trigger-set classes (RH-S30-33) unless a one-line wiring import is essential
- **Does not** invent sole-pass reports; real disposable Postgres + live serving process only
- **Does not** weaken `POST_PONR_INELIGIBLE` to accept residual sentinel aaaa UUID as this-run proof

## Acceptance Criteria

### AC-1 (PRIMARY) — Zero-loss identity oracle (count=0 path + identity-bound count>0 path)

- **GIVEN** gate step2 (and step1 independent recompute) evaluating T-SYNC-013 zero-loss
- **WHEN** `accepted_count` must be 0 for a green soak rollback
- **THEN** PASS requires **all** of:
  1. Postgres ledger query `count(*) == 0` on `post_export_write_audit`
  2. drill independent recompute `acceptedCount == 0` with `matchesReport == true`
  3. identity set empty: no accepted write row ids in ledger for this run
  4. none of this-run probe-created document ids present as accepted documents (ids captured from step1 probe bodies if any 201/accepted paths fired)
- **WHEN** `accepted_count > 0` (failure / residual path, including RED baseline `20260808T011038Z`)
- **THEN** the oracle **MUST bind identity** of accepted writes (ids from ledger and/or probe bodies) — not merely print `accepted_count: N`. Count-only failure without identities is **NOT** closed.

### AC-2 — Gate fail-closed if step1 mints any accepted post-export write (disarmed-fence loss)

- **GIVEN** soak rollback drill (step1) under supposed armed fence
- **WHEN** any representative surface accepts a production write (e.g. app HTTP 201 with document id, MCP accepted documentId) OR ledger gains accepted rows during the drill
- **THEN** step1 **MUST** fail closed (non-zero exit / assertion fail), emit the accepted write identity set, and the gate **MUST NOT** be interpretable as T-SYNC-013 green.
- **AND** a disarmed-fence probe session (as in `fence_armed=false` @ `20260808T011038Z`) **MUST NOT** leave the system able to claim zero-loss for that run (step2 identity oracle still sees ids / count>0).
- Cross-link: product/devops siblings must ensure preflight re-arms durable+serving fence before step1; gate preflight **MUST** assert fence armed or fail before probes mint loss.

### AC-3 — POST_PONR_INELIGIBLE is sole step5 success oracle **after real this-run step4**, with identity bind

- **GIVEN** step4 recorded a real PONR with `ponr_id=P` and `write_row_id=W` (real documents row; not residual)
- **WHEN** step5 runs `cutover:rollback-repoint --json`
- **THEN** PASS iff exit=2, `repointed=false`, `error.code=POST_PONR_INELIGIBLE`, and **identity bind** `ponr_id==P` and `write_row_id==W`.
- Residual sentinel `write_row_id=00000000-0000-4000-8000-aaaaaaaaaaaa` / leftover `ponr_id` from a prior run **MUST NOT** satisfy step5 as this-run proof.
- Regex-only `POST_PONR_INELIGIBLE` without identity bind is **NOT** closed.

### AC-4 — Negative controls (disarmed fence + residual PONR)

- **GIVEN** fixture/evidence shaped like `20260808T011038Z` step1 (disarmed fence, accepted probe docs `145f82e5…` / `5ef15d4b…`, ledger count>0)
- **WHEN** zero-loss / step1–2 oracles evaluate
- **THEN** they **FAIL** and emit identities; they never flip green via count-only coincidence after partial cleanup.
- **GIVEN** residual PONR with sentinel aaaa `write_row_id` (as in step1 nested repoint `585ecd45…` / aaaa) without matching this-run step4
- **WHEN** step5 identity oracle evaluates
- **THEN** residual PONR **MUST NOT** masquerade as this-run step5 PASS; only bind to step4 `P`/`W` succeeds.
- Optional harness: `scripts/assert-zero-loss-identity-oracle.sh` + residual-PONR negative.

### AC-5 — Release verdict: T-SYNC-013 is release-blocking (no silent partial)

- **GIVEN** a gate run with steps 4–5 green and steps 1–2 red (shape of `20260808T011038Z` partial 3/5)
- **WHEN** release / human-test verdict consumers evaluate T-SYNC-013
- **THEN** overall release claim for UC-SYNC-04 AC-2 is **FAIL** / not certifying; partial must not be marketed as “PONR latch proves rollback insurance.”
- Assert/package consumers used for release **MUST** require step1+step2 zero-loss identity oracles green for any pass claim of T-SYNC-013.
- Do **not** weaken assert-human-test-verdict’s existing 5/5 requirement; strengthen identity oracles **inside** the steps that already block 5/5.

### AC-6 — RED first on `20260808T011038Z` + fakeability floor

- **GIVEN** committed/captured evidence under
  `.spec/prds/.../sprint-30-.../.gate-evidence/20260808T011038Z/`
  (`step1.log`, `step2.log`, `step4.log`, `step5.log`, `gate-results.json`)
- **WHEN** the new oracles are evaluated against that evidence **before** product/gate green
- **THEN** they reproduce RED: step1/2 fail with identity-bound accepted writes; step5 identity bind to step4 may already hold on this run and must remain required.
- Fakeability floor — **all rejected as closed**:
  - path-exists only
  - count-only without identities when count>0
  - success-path-only regex without fail-closed negatives
  - invented / hand-edited JSON reports without live Postgres + serving process
  - residual aaaa sentinel as this-run PONR identity

### AC-7 — Branch discipline + fresh gate under strengthened oracles

- Implementer task branch; unreviewed NEVER merges; merge only after dual-lens APPROVED via `kb-orchestrate` `references/merge-to-main.sh` (orchestrator-only).
- After fix: fresh human-gate `run_id ≠ 20260808T011038Z` under strengthened oracles with fence armed, step1 zero-loss identity empty, step2 count=0 + empty identity set, step4 real PONR, step5 `POST_PONR_INELIGIBLE` bound to this-run `ponr_id`/`write_row_id`.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | RED baseline: `20260808T011038Z` step1/2 fail identity-bound zero-loss | AC-6 | `red-20260808T011038Z-zero-loss.json` |
| TC-2 | When count>0, oracle emits accepted write ids (ledger and/or probes), not count alone | AC-1 | `ac1-identity-when-count-gt0.json` |
| TC-3 | Count=0 PASS requires Postgres count + recompute + empty identity set + no probe doc ids | AC-1 | `ac1-zero-loss-empty-identity.json` |
| TC-4 | Disarmed-fence / accepted-probe fixture fails step1 and cannot claim zero-loss | AC-2 | `ac2-disarmed-fence-fail-closed.json` |
| TC-5 | Preflight asserts fence armed (or fails closed) before step1 probes | AC-2 | `ac2-fence-armed-preflight.json` |
| TC-6 | Step5 PASS requires `POST_PONR_INELIGIBLE` + `ponr_id`/`write_row_id` match step4 | AC-3 | `ac3-post-ponr-identity-bind.json` |
| TC-7 | Residual aaaa sentinel / foreign ponr_id alone fails step5 this-run oracle | AC-4 | `ac4-residual-ponr-negative.json` |
| TC-8 | Partial 3/5 (steps 4–5 green, 1–2 red) is not a T-SYNC-013 release pass | AC-5 | `ac5-partial-not-release.json` |
| TC-9 | Static audit: no sole count==0 / sole POST_PONR regex without identity bind in step2/5 consumers | AC-1, AC-3 | `ac1-ac3-static-oracle-audit.md` |
| TC-10 | Fresh green gate under strengthened oracles (fence armed, empty W, this-run PONR bind) | AC-7 | `ac7-fresh-gate-summary.json` |
| TC-11 | Negative: invented JSON with `lost_accepted_writes:0` but ledger ids present fails | AC-6 | `fixtures/invented-zero-loss-json/**` |
| TC-12 | Negative: count-only step2 script without identity query fails new assert | AC-1 | `fixtures/count-only-step2/**` |

## Anti-stub

- `accepted_count == 0` alone is **NOT** closed.
- `"lost_accepted_writes": 0` regex alone is **NOT** closed.
- `POST_PONR_INELIGIBLE` string alone is **NOT** closed after step4.
- Residual sentinel `write_row_id=00000000-0000-4000-8000-aaaaaaaaaaaa` is **NOT** this-run PONR identity.
- Partial green on steps 4–5 while steps 1–2 red is **NOT** T-SYNC-013 proven.
- Path-exists on `rollback-drill-report.json` is **NOT** zero-loss.
- Independent recompute `matchesReport:true` with empty/zero raw durable evidence and no Postgres identity bind is **NOT** closed.
- Invented sole-pass JSON without live disposable Postgres + serving process is **NOT** proof.
- Harness skip exit 0 is **NOT** a pass.
- Do **not** re-open C-2 packaging or C-3 trigger-set product classes under this task.
- Do **not** weaken step5 to accept any non-`POST_PONR_INELIGIBLE` success after a real step4 PONR.

## Critical Constraints

- **MUST** treat T-SYNC-013 zero-loss as a **release-blocking** safety oracle with identity bind when count>0 and empty-identity proof when count must be 0
- **MUST** fail closed if step1 creates any accepted post-export write; emit identities; cross-link fence re-arm sibling
- **MUST** bind step5 `POST_PONR_INELIGIBLE` to this-run step4 `ponr_id` + `write_row_id`
- **MUST** reject residual aaaa sentinel as this-run step5 proof
- **MUST** red_first against `20260808T011038Z` evidence before claiming green
- **MUST** keep dual-reset preflight (Postgres + file ledger) and real step5 POST_PONR path after real step4
- **MUST** implementer branch; merge only after dual-lens APPROVED (orchestrator-only)
- **MUST** produce fresh gate package/run under strengthened oracles after land
- **NEVER** treat partial 3/5 (4–5 green, 1–2 red) as UC-SYNC-04 AC-2 release certification
- **NEVER** accept count-only, path-exists, success-path-only, or invented JSON as closed
- **NEVER** re-open C-2/C-3 packaging/trigger-set classes unless a minimal essential wire
- **STRICTLY** CAP-CUT-01 / UC-SYNC-04: soak zero-loss and post-PONR latch remain distinct; both identity-bound
- **STRICTLY** product fence disarm during soak is a safety defect; gate oracle must fail closed even if product sibling lands later

## Evidence

`.tmp/GATE-FIX-zero-loss-t-sync-013/`

| Artifact | Proves |
|----------|--------|
| `red-20260808T011038Z-summary.json` | RED pointer |
| `red-20260808T011038Z-zero-loss.json` | AC-6 / TC-1 RED baseline with identities `145f82e5…`, `5ef15d4b…`, accepted_count=2 |
| `ac1-identity-when-count-gt0.json` | AC-1 identity bind on count>0 |
| `ac1-zero-loss-empty-identity.json` | AC-1 empty identity on count=0 |
| `ac1-ac3-static-oracle-audit.md` | TC-9 static no sole count/regex |
| `ac2-disarmed-fence-fail-closed.json` | AC-2 |
| `ac2-fence-armed-preflight.json` | AC-2 preflight |
| `ac3-post-ponr-identity-bind.json` | AC-3 step4↔step5 bind (`31b33eb4…` / `ebd12bd6…` shape) |
| `ac4-residual-ponr-negative.json` | AC-4 residual aaaa / foreign ponr_id |
| `ac5-partial-not-release.json` | AC-5 partial 3/5 not release |
| `fixtures/invented-zero-loss-json/**` | AC-6 fakeability |
| `fixtures/count-only-step2/**` | TC-12 |
| `fixtures/residual-aaaa-ponr/**` | AC-4 |
| `ac7-fresh-gate-summary.json` + branch note | AC-7 |
| `ac7-disposition.md` | Disposition vs residual classes |

Seed / cite (read-only) RED evidence:

- `.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260808T011038Z/step1.log`
- `.../step2.log`, `step4.log`, `step5.log`, `gate-results.json`, `preflight-ledger-reset.json`
- Sprint `gate-results.json` (`run_id=20260808T011038Z`, `verdict=partial`, `steps_passed=3`, `git_sha=54299bfc…`)

## Reading List

- `gate-results.json` — run `20260808T011038Z` partial 3/5 @ `54299bfc`
- `.gate-evidence/20260808T011038Z/step1.log` — `fence_armed=false`; docs `145f82e5…` / `5ef15d4b…`; residual PONR aaaa in nested repoint
- `.gate-evidence/20260808T011038Z/step2.log` — `accepted_count: 2`
- `.gate-evidence/20260808T011038Z/step4.log` — this-run PONR `31b33eb4…` / `ebd12bd6…`
- `.gate-evidence/20260808T011038Z/step5.log` — `POST_PONR_INELIGIBLE` with matching this-run ids
- `gate-plan.json` — current step1/2/5 regex oracles (count/string-only holes)
- `scripts/run-sprint30-human-gate.sh` — dual-reset preflight; partial verdict; step assertion loop
- `scripts/reset-sprint30-gate-ledger.sh` — ledger/PONR clear; oracle_note on real POST_PONR
- `services/platform/src/cutover/rollback-drill.ts` — five-surface probes, independent recompute, `DRILL_WRITE_SURFACES_NOT_BLOCKED`
- `services/platform/src/cutover/ponr.ts` / rollback-repoint POST_PONR path — latch semantics
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` — T-SYNC-013 / T-SYNC-014 text
- `D07-03-…md`, `D07-04-…md` — product intent for zero-loss and PONR
- `GATE-FIX-fence-lift.md` — prior fence disarm/lift class (distinct; durable-lift vs soak-armed preflight)
- `GATE-FIX-drill-fence-precondition.md` · `GATE-FIX-gate-preflight-fence-rearm.md` — siblings
- `REDHAT-FIX-RH-S30-33.md` / `REDHAT-FIX-RH-S30-35.md` — quality/format precedent; **do not re-open C-3/C-2 classes**

## Design

- **Pattern:** Introduce a shared **zero-loss identity oracle** (prefer `scripts/lib/zero-loss-identity-oracle.py`) that:
  1. Reads drill report + authoritative Postgres `post_export_write_audit` (+ optional documents existence checks for probe ids).
  2. On required-zero path: asserts count=0, recompute=0, empty identity set, no probe-created accepted document ids for this run.
  3. On count>0 path: fails closed and serializes `accepted_write_identities[]` (ids from ledger rows and probe bodies).
  4. Wire into gate-plan step2 literal (replace count-only assert) and optional post-step1 assert in the runner.

- **Pattern:** **Fence-armed preflight** before step1: read durable secrets + serving-process effective fence (e.g. a blocked probe or health/config surface that reflects `isMigrationReadOnly()` without minting writes). If disarmed → exit 2 with explicit `FENCE_DISARMED_DURING_SOAK` / similar; do not run five-surface write probes that can mint loss. Prefer coordinating with `GATE-FIX-gate-preflight-fence-rearm` rather than duplicating rearm logic.

- **Pattern:** **Step4→step5 identity capture** in `run-sprint30-human-gate.sh` (or companion assert): parse step4.log JSON for `ponr_id`/`write_row_id`; step5 assertion requires those exact ids in step5.log + `POST_PONR_INELIGIBLE` + exit 2 + `repointed:false`. Reject aaaa sentinel and foreign `ponr_id`.

- **Pattern:** Negative fixtures under `.tmp/GATE-FIX-zero-loss-t-sync-013/fixtures/` replaying `20260808T011038Z` shapes (disarmed probes + residual aaaa) must fail the new asserts.

- **Anti-pattern:** “steps 4–5 passed so rollback is fine”; count-only step2; regex-only POST_PONR; trusting nested residual PONR from a polluted DB as this-run proof; reopening C-2/C-3 packaging work.

- **Sibling handoff:** product (`GATE-FIX-drill-fence-precondition`) and devops (`GATE-FIX-gate-preflight-fence-rearm`) keep soak fence armed for step1. Gate still fails closed if siblings lag.

## Disposition

Release-blocking **CRITICAL** residual on UC-SYNC-04: gate run `20260808T011038Z` proves T-SYNC-013 zero-loss can fail hard (disarmed fence, real accepted documents, ledger count=2) while T-SYNC-014 latch still greens steps 4–5. That is a **safety/oracle** failure — partial success must not certify soak rollback insurance.

Close by identity-bound zero-loss oracles, fail-closed step1 on any accepted write, fence-armed preflight, and step5 `POST_PONR_INELIGIBLE` bound to this-run step4 `ponr_id`/`write_row_id` (reject residual aaaa). Red-first on `20260808T011038Z`. Do not re-open C-2/C-3 classes. Sprint 30 remains **In Progress** until a fresh 5/5 under these oracles is dual-lens APPROVED.

AGENT: implementer=devops-engineer | proposed_by=security-auditor | technical-reviewer=security-reviewer | standing-test-reality=test-quality-reviewer
planned_at: 2026-08-08T02:00:00Z
finding_ids: [T-SYNC-013, T-SYNC-014, UC-SYNC-04, GATE-FIX-zero-loss-t-sync-013, 20260808T011038Z]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-zero-loss-t-sync-013",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "proposed_by": "security-auditor",
  "agent": "devops-engineer",
  "severity": "CRITICAL",
  "touches_capabilities": ["CAP-CUT-01"],
  "prd_refs": ["UC-SYNC-04", "T-SYNC-013", "T-SYNC-014"],
  "siblings": [
    "GATE-FIX-drill-fence-precondition",
    "GATE-FIX-gate-preflight-fence-rearm"
  ],
  "red_evidence_run_id": "20260808T011038Z",
  "red_evidence_git_sha": "54299bfc76fec6fc52468dae451ca293a6f104c4",
  "branch_discipline": "implementer task branch; merge only after dual-lens APPROVED via kb-orchestrate references/merge-to-main.sh",
  "do_not_reopen": ["C-2-packaging", "C-3-trigger-set"],
  "fakeability_floor_rejected": [
    "path_exists_only",
    "count_only",
    "success_path_only_regex",
    "invented_json",
    "residual_aaaa_sentinel_as_this_run_ponr"
  ],
  "fixtures": {
    "gate_20260808T011038Z_partial_3_of_5": {
      "description": "Real residual: fence_armed=false; probe docs 145f82e5… and 5ef15d4b…; accepted_count=2; step4/5 this-run PONR 31b33eb4…/ebd12bd6…; nested residual aaaa PONR in step1",
      "seed_method": "recorded_gate_evidence"
    },
    "fixture_disarmed_fence_accepted_probes": {
      "description": "Disarmed-fence probe report with accepted document ids — must fail zero-loss identity oracle",
      "seed_method": "file_artifact"
    },
    "fixture_count_only_step2": {
      "description": "Count-only accepted_count script without identity bind — must fail new assert",
      "seed_method": "file_artifact"
    },
    "fixture_residual_aaaa_ponr": {
      "description": "POST_PONR_INELIGIBLE with write_row_id aaaa sentinel / foreign ponr_id without step4 bind — must fail step5 identity oracle",
      "seed_method": "file_artifact"
    },
    "fixture_invented_zero_loss_json": {
      "description": "Hand-edited lost_accepted_writes=0 with ledger ids present — must fail",
      "seed_method": "file_artifact"
    },
    "live_fresh_gate_under_strengthened_oracles": {
      "description": "Real human gate after fix: fence armed, empty identity set, this-run PONR bind on step5",
      "seed_method": "cli_real_postgres_live_server"
    }
  },
  "requirements": [
    {"id": "AC-1", "type": "acceptance_criterion", "description": "Zero-loss identity oracle: empty identity+count0+recompute for PASS; identity bind when count>0", "verify": "ac1-*.json"},
    {"id": "AC-2", "type": "acceptance_criterion", "description": "Fail closed if step1 mints accepted writes; fence-armed preflight; cannot claim zero-loss after disarmed probes", "verify": "ac2-*.json"},
    {"id": "AC-3", "type": "acceptance_criterion", "description": "Step5 sole oracle POST_PONR_INELIGIBLE after real step4 with ponr_id/write_row_id identity bind", "verify": "ac3-post-ponr-identity-bind.json"},
    {"id": "AC-4", "type": "acceptance_criterion", "description": "Negative: disarmed-fence loss + residual aaaa PONR cannot masquerade", "verify": "ac4-residual-ponr-negative.json + ac2-disarmed-fence"},
    {"id": "AC-5", "type": "acceptance_criterion", "description": "Partial 3/5 with 1–2 red is not T-SYNC-013 release pass", "verify": "ac5-partial-not-release.json"},
    {"id": "AC-6", "type": "acceptance_criterion", "description": "RED first on 20260808T011038Z; reject path-exists/count-only/success-only/invented JSON", "verify": "red-20260808T011038Z-zero-loss.json + fixtures"},
    {"id": "AC-7", "type": "acceptance_criterion", "description": "Branch discipline + fresh gate under strengthened oracles", "verify": "ac7-fresh-gate-summary.json"},
    {"id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "RED baseline 20260808T011038Z identity-bound", "verify": "red-20260808T011038Z-zero-loss.json"},
    {"id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "count>0 emits identities", "verify": "ac1-identity-when-count-gt0.json"},
    {"id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "count=0 empty identity set", "verify": "ac1-zero-loss-empty-identity.json"},
    {"id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Disarmed fence fail-closed", "verify": "ac2-disarmed-fence-fail-closed.json"},
    {"id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Fence-armed preflight", "verify": "ac2-fence-armed-preflight.json"},
    {"id": "TC-6", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "Step4↔step5 identity bind", "verify": "ac3-post-ponr-identity-bind.json"},
    {"id": "TC-7", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "Residual aaaa fails this-run step5", "verify": "ac4-residual-ponr-negative.json"},
    {"id": "TC-8", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "Partial not release", "verify": "ac5-partial-not-release.json"},
    {"id": "TC-9", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Static no sole count/regex oracles", "verify": "ac1-ac3-static-oracle-audit.md"},
    {"id": "TC-10", "type": "test_criterion", "maps_to_ac": "AC-7", "description": "Fresh green gate", "verify": "ac7-fresh-gate-summary.json"},
    {"id": "TC-11", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "Invented zero-loss JSON fails", "verify": "fixtures/invented-zero-loss-json"},
    {"id": "TC-12", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Count-only step2 fails new assert", "verify": "fixtures/count-only-step2"}
  ]
}
-->
