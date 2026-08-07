# REDHAT-FIX-RH-S30-24 — C-3 residual: gate-owned seeded forced-marker-miss preservation; reject empty-table false-green

> **Task ID:** REDHAT-FIX-RH-S30-24
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** CRITICAL
> **Source finding:** C-3 residual
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T101142Z-independent-final-closeout.md` (independent final closeout @ fe79d37)
> **Proposed by:** `security-auditor`
> **TDD:** red_first · RED_GREEN_REQUIRED=yes · seeded_evidence=yes
> Status: Backlog — plan only (do not treat as fixed until dual-lens APPROVED + landed)

## Finding

**C-3 — the required marker-parse-failure preservation control is absent and its standalone wrapper is fakeable.** Severity: **CRITICAL**. Confidence: **HIGH**.

Source improvement from RH-S30-21 is real: privilege probes run in `BEGIN … DO … ROLLBACK` (`scripts/probe-ponr-role-immutability.sh:203-247`); missing marker exits at `:264-289` without the old bare fallback. That is necessary but **not sufficient**.

Three residual defects remain:

1. **Ownership vacuum** — `run-sprint30-human-gate.sh:376-390` only calls `probe-ponr-role-immutability.sh`; it never calls `probe-ponr-role-immutability-negative-marker.sh` and never sets `PROBE_FORCE_MARKER_MISS=1`. No PLATFORM_IT test calls either forced-miss hook. Package `20260807T095843Z` contains no forced-miss evidence.
2. **Fakeable oracle** — wrapper declares success when before/after counts are merely equal (`probe-ponr-role-immutability-negative-marker.sh:38-54`). It never requires `before_count >= 1` or initially enabled triggers, so an **empty table passes** the supposed PONR-preservation oracle.
3. **Role/seed gap** — ordinary fresh evidence is a rollback transaction with effective `current_user=holocron_app`, but `session_user` is still owner/superuser `holocron`; it is not a completed forced-miss preservation proof on a seeded PONR-holding database.

**Required remediation:** gate- or PLATFORM_IT-owned forced marker-miss test against a disposable DB seeded with ≥1 PONR row and enabled non-internal triggers; require non-zero probe exit, unchanged **nonzero** count, trigger preservation, and verified effective non-owner role in the always-rolled-back transaction.

### Known-bad wrapper snippet (must fix)

```python
report["ok"] = (
    report["probe_rc"] != 0
    and report["rows_preserved"]  # before==after only — empty table passes!
    and report["triggers_preserved"]
)
# MISSING: before_count >= 1, before_triggers_enabled true, non-owner role proof
```

## Scope (WRITE-ALLOWED)

- `scripts/probe-ponr-role-immutability-negative-marker.sh` (require before_count≥1, triggers initially enabled, non-owner session proof)
- `scripts/probe-ponr-role-immutability.sh` (only if force-miss/role proof needs hooks)
- `scripts/run-sprint30-human-gate.sh` (MUST invoke forced-miss control OR document PLATFORM_IT ownership with wire-in)
- `services/platform/tests/integration/sprint30-ponr-role-provenance.test.ts` (NEW or MODIFY)
- `services/platform/tests/integration/sprint30-ponr-immutability.test.ts` (MODIFY only if sibling case preferred)
- `services/platform/tests/integration/sprint30-cutover-harness.ts` (disposable PONR seed helpers only if needed)
- Cross-link `REDHAT-FIX-RH-S30-21.md` disposition
- `.tmp/REDHAT-FIX-RH-S30-24/**`
- Gate evidence under `.gate-evidence/{run_id}/ponr-role-provenance-marker-miss/` only as produced by a real run
- **Does not** re-open C-2 packaging or M-3 inject oracles

## Acceptance Criteria

- [ ] **AC-1 (PRIMARY)** Seed require: wrapper requires `before_count >= 1` AND `before_triggers_enabled == true` (non-internal triggers `tgenabled='O'`). If `before_count == 0`, exit non-zero with explicit **seed required** / empty-table error even when `probe_rc != 0` and counts are equal.
- [ ] **AC-2** Seeded forced-miss: against disposable Postgres with ≥1 `data_plane_ponr` row and non-internal triggers enabled, arm `PROBE_FORCE_MARKER_MISS=1` via negative-marker wrapper; probe exits non-zero; `after_count == before_count >= 1`; triggers still enabled; no bare TRUNCATE/UPDATE/DELETE outside the always-rolled-back probe transaction.
- [ ] **AC-3** Empty-table negative control MUST FAIL the wrapper: RED baseline documents empty-table false-green under the old ok predicate; post-fix GREEN fails closed with seed-required wording. Artifacts under `.tmp/REDHAT-FIX-RH-S30-24/empty-table/` + `red-empty-table-false-green.txt`.
- [ ] **AC-4** Gate OR PLATFORM_IT owns the forced-miss branch: `run-sprint30-human-gate.sh` invokes the negative-marker script (or equivalent force-miss + seed-aware path) **or** PLATFORM_IT runs it with evidence required; ownership documented in `ac4-gate-or-it-wiring.md`; forced-miss artifacts land under `.tmp` and/or gate package. Success-path-only invocation (current `:376-390`) is insufficient for C-3 closeout.
- [ ] **AC-5** Observed non-owner role proof: forced-miss (and/or companion capture) records observed `current_user` / `probe_current_user` as app role (`holocron_app` or documented `HOLOCRON_APP_ROLE`) inside the always-rolled-back DO block — not SET LOCAL ROLE claimed without observation. `session_user` remaining owner is acceptable only if `current_user` is verified non-owner.
- [ ] **AC-6** Static non-regression + success-path non-regression: zero bare TRUNCATE/UPDATE parse-miss fallbacks reintroduced; privilege DML only inside `BEGIN…ROLLBACK`; success-path (no force-miss) still always-rolls-back under verified non-owner session with rows preserved and triggers enabled. NEVER reuse RH-S30-13 superuser `disable_denied=false` as pass.
- [ ] **AC-7** Disposition supersedes RH-S30-21 residual for C-3; full evidence package under `.tmp/REDHAT-FIX-RH-S30-24/`. Success-path-only artifacts cannot close C-3.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Wrapper exits non-zero when before_count==0 with seed-required / empty-table error | AC-1 | empty-table run exit ≠ 0 + `ok==false` |
| TC-2 | Seeded forced-miss: probe_rc != 0 | AC-2 | jq on seeded-forced-miss report |
| TC-3 | after_count == before_count >= 1 after forced-miss | AC-2 | jq |
| TC-4 | Triggers still enabled after forced-miss | AC-2 | jq before/after_triggers_enabled |
| TC-5 | RED baseline captures empty-table false-green of old ok predicate | AC-3 | `red-empty-table-false-green.txt` |
| TC-6 | Gate runner or PLATFORM_IT contains forced-miss / negative-marker invocation | AC-4 | `rg` + `ac4-gate-or-it-wiring.md` |
| TC-7 | Forced-miss evidence lands under .tmp and/or gate package | AC-4 | transcript + report |
| TC-8 | Observed current_user is non-owner app role in rolled-back probe context | AC-5 | `ac5-role-proof.json` |
| TC-9 | Static audit zero bare parse-miss TRUNCATE/UPDATE fallbacks | AC-6 | `ac6-static-audit.md` |
| TC-10 | Success-path probe still rows_preserved true under non-owner session | AC-6 | `success-path/ac0-postflight.json` |
| TC-11 | Disposition supersedes RH-S30-21 residual; success-path-only cannot close C-3 | AC-7 | `ac7-disposition.md` |
| TC-12 | PLATFORM_IT oracle (if used) fails closed when rows drop, triggers disable, probe exits 0, or seed missing | AC-2 | vitest `-t marker-miss\|forced-miss` |

## Anti-stub

- Do not claim coverage by grepping for `sys.exit(2)` without running forced-miss against a PONR-holding disposable DB.
- Do not hand-write `rows_preserved:true` without a real probe run.
- Do not mock `psql` or SQLSTATE.
- Do not treat success-path `20260807T095843Z` (or any success-path-only package) as forced-miss proof.
- Do not allow empty table (`before_count==0`) to pass the negative-marker wrapper.
- Do not claim gate ownership without a real call site to negative-marker or `PROBE_FORCE_MARKER_MISS`.
- Do not reuse `.tmp/REDHAT-FIX-RH-S30-13` `disable_denied=false` as pass.
- Do not run destructive sequences against production PONR-holding DBs — disposable only.
- Do not treat HEAD partial hard-fail alone as C-3 closed without seeded forced-miss + ownership.
- Do not re-open C-2 packaging or M-3 inject oracles.

## Critical Constraints

- **MUST** require `before_count >= 1` in negative-marker wrapper; empty table fails with seed-required
- **MUST** require initially enabled non-internal triggers for `ok=true`
- **MUST** run forced-miss against disposable Postgres seeded with ≥1 PONR row + enabled triggers
- **MUST** assert probe_rc≠0, after==before≥1, triggers still enabled after forced-miss
- **MUST** make gate or PLATFORM_IT own and invoke the forced-miss branch; document ownership
- **MUST** record observed effective non-owner role inside always-rolled-back probe transaction
- **MUST** capture RED: empty-table false-green of old ok predicate
- **MUST** write full evidence under `.tmp/REDHAT-FIX-RH-S30-24/`
- **NEVER** allow empty-table to set `ok=true` on the negative-marker control
- **NEVER** claim C-3 closed from success-path-only artifacts
- **NEVER** reintroduce bare TRUNCATE/UPDATE on parse miss
- **STRICTLY** scenarios use real disposable Postgres (not mocks)
- **STRICTLY** disposition supersedes residual of RH-S30-21 for C-3

## Evidence

`.tmp/REDHAT-FIX-RH-S30-24/`

| Artifact | Proves |
|----------|--------|
| `red-empty-table-false-green.txt` | AC-3 RED: empty-table false-green under old ok predicate |
| `empty-table/negative-marker-report.json` | AC-1 empty-table fail-closed after fix |
| `seeded-forced-miss/negative-marker-report.json` | AC-2 seeded preservation |
| `seeded-forced-miss/probe-out/ac-marker-parse-failure.json` | AC-2 hard-fail marker miss |
| `ac4-gate-or-it-wiring.md` | AC-4 ownership |
| `gate-or-it-transcript.log` | AC-4 real invocation |
| `ownership-rg.txt` | AC-4 call-site presence |
| `ac5-role-proof.json` | AC-5 observed non-owner current_user |
| `ac6-static-audit.md` | AC-6 no bare fallback |
| `success-path/ac0-postflight.json` | AC-6 success-path non-regression |
| `ac7-disposition.md` | AC-7 supersedes RH-S30-21 residual |

## Reading List

- Closeout review C-3 section @ fe79d37 — `.spec/reviews/red-hat-sprint-30-20260807T101142Z-independent-final-closeout.md`
- `REDHAT-FIX-RH-S30-21.md` — prior residual that failed ownership + empty-table oracle
- `REDHAT-FIX-RH-S30-18.md` — original C-3 rewrite foundation
- `scripts/probe-ponr-role-immutability.sh:203-289` — always-rollback + force-miss + hard-fail
- `scripts/probe-ponr-role-immutability-negative-marker.sh:19-59` — known-bad empty-table ok predicate
- `scripts/run-sprint30-human-gate.sh:376-390` — success-path-only invocation
- `services/platform/src/db/evidence/roles.ts` — `HOLOCRON_APP_ROLE` / `toAppRoleDatabaseUrl`
- `services/platform/tests/integration/sprint30-cutover-harness.ts` — disposable seed helpers
- Migrations `0030_data_plane_ponr.sql`, `0031_data_plane_ponr_truncate_guard.sql`

## Implementation notes

- Preferred minimal wrapper fix: add `before_count >= 1` and `before_triggers_enabled` to `ok`; early-exit with `seed required: empty-table false-green forbidden (RH-S30-24 / C-3)` when `before_count < 1`.
- Preferred ownership: gate invokes negative-marker into `$EVID_DIR/ponr-role-provenance-marker-miss` and copies to `.tmp/REDHAT-FIX-RH-S30-24/`; if seed unavailable in gate env, PLATFORM_IT owns seed+run and gate asserts evidence presence (document clearly — success-path-only still forbidden).
- Role proof: prefer reading `probe_current_user` from success-path marker when force-miss nulls `m`; or extend force-miss path to write role preflight into `ac5-role-proof.json` before clearing marker. Observation required either way.

## Disposition

Release-blocking residual of RH-S30-21 / C-3. Source hard-fail exists but ownership + preservation oracle are broken: gate never runs forced-miss; wrapper greens on empty table. Harden negative-marker (`before_count≥1`, triggers initially enabled, non-owner role proof); seed disposable DB; force marker miss; require non-zero exit + nonzero row/trigger preservation; wire gate or PLATFORM_IT ownership. Success-path-only artifacts cannot close C-3. Out of scope: C-2 packaging, M-3 inject oracles, product enable-writes.

AGENT: implementer=devops-engineer | technical-reviewer=security-reviewer | product-reviewer=product-manager  
planned_at: 2026-08-07T10:20:35Z  
finding_ids: [C-3, REDHAT-FIX-RH-S30-24, REDHAT-FIX-RH-S30-21, REDHAT-FIX-RH-S30-18, H-3]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-RH-S30-24",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "proposed_by": "security-auditor",
  "touches_capabilities": ["CAP-CUT-01"],
  "fixtures": {
    "seeded_ponr_row_disposable": {
      "description": "Disposable Postgres with >=1 data_plane_ponr row and non-internal triggers enabled",
      "seed_method": "cli"
    },
    "empty_table_negative_control_db": {
      "description": "Disposable Postgres with zero PONR rows to prove wrapper seed-required fail-closed",
      "seed_method": "cli"
    },
    "force_marker_miss_env": {
      "description": "PROBE_FORCE_MARKER_MISS=1 forces hard-fail parse miss path",
      "seed_method": "cli"
    }
  },
  "requirements": [
    {"id": "AC-1", "type": "acceptance_criterion", "description": "Wrapper requires before_count>=1 and before_triggers_enabled; empty table fails with seed-required", "verify": "empty-table exit != 0 + ok==false"},
    {"id": "AC-2", "type": "acceptance_criterion", "description": "Seeded forced-miss: probe_rc!=0, after_count==before_count>=1, triggers preserved", "verify": "seeded-forced-miss/negative-marker-report.json"},
    {"id": "AC-3", "type": "acceptance_criterion", "description": "Empty-table negative control MUST FAIL wrapper; RED baseline captured", "verify": "red-empty-table-false-green.txt"},
    {"id": "AC-4", "type": "acceptance_criterion", "description": "Gate OR PLATFORM_IT owns forced-miss branch; success-path-only insufficient", "verify": "ac4-gate-or-it-wiring.md + call-site rg"},
    {"id": "AC-5", "type": "acceptance_criterion", "description": "Observed non-owner role (current_user app role) in always-rolled-back probe tx", "verify": "ac5-role-proof.json"},
    {"id": "AC-6", "type": "acceptance_criterion", "description": "Static no bare parse-miss fallback + success-path non-regression", "verify": "ac6-static-audit.md + success-path/ac0-postflight.json"},
    {"id": "AC-7", "type": "acceptance_criterion", "description": "Disposition supersedes RH-S30-21 residual; full .tmp/REDHAT-FIX-RH-S30-24 evidence", "verify": "ac7-disposition.md"},
    {"id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Empty table exit non-zero seed-required", "verify": "empty-table report"},
    {"id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Forced-miss non-zero probe_rc", "verify": "jq .probe_rc"},
    {"id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Nonzero count preserved", "verify": "jq before/after"},
    {"id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Triggers enabled after forced-miss", "verify": "jq triggers"},
    {"id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "RED empty-table false-green baseline", "verify": "red-empty-table-false-green.txt"},
    {"id": "TC-6", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "Ownership call site present", "verify": "rg + ac4"},
    {"id": "TC-7", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "Forced-miss evidence packaged", "verify": "transcript + report"},
    {"id": "TC-8", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "Observed non-owner current_user", "verify": "ac5-role-proof.json"},
    {"id": "TC-9", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "Static audit zero bare fallbacks", "verify": "ac6-static-audit.md"},
    {"id": "TC-10", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "Success-path rows_preserved", "verify": "success-path/ac0-postflight.json"},
    {"id": "TC-11", "type": "test_criterion", "maps_to_ac": "AC-7", "description": "Disposition supersedes RH-S30-21", "verify": "ac7-disposition.md"},
    {"id": "TC-12", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "PLATFORM_IT fail-closed on drop/disable/zero-exit/missing-seed", "verify": "vitest -t forced-miss"}
  ]
}
-->
