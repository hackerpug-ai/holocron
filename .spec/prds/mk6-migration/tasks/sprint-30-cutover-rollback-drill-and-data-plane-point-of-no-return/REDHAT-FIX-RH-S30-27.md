# REDHAT-FIX-RH-S30-27 — C-3 residual: bind forced-marker-miss + non-owner proof to gate status/exit/package assert

> **Task ID:** REDHAT-FIX-RH-S30-27
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** HIGH
> **Source finding:** C-3 residual
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T102743Z-independent-final-closeout.md` (independent final closeout @ 5b86e4e)
> **Proposed by:** `security-auditor`
> **TDD:** red_first · RED_GREEN_REQUIRED=yes · seeded_evidence=yes
> Status: Backlog — plan only (do not treat as fixed until dual-lens APPROVED + landed)

## Finding

**C-3 — forced-marker-miss and effective non-owner controls can fail or be skipped while the human gate still emits a packageable pass.** Severity: **HIGH**. Confidence: **HIGH**.

### What improved (RH-S30-21/24 partial)

- Fresh run: `probe_rc=2`, `before_count=after_count=1`, trigger flags true.
- Companion normal probe records `probe_current_user:"holocron_app"` in rolled-back tx.
- Destructive marker-parse fallback absent; wrapper requires `before_count>=1`.

### What remains broken

1. `run-sprint30-human-gate.sh:380-407` initializes `PROBE_RC=0` / `MARKER_MISS_RC=0`; only runs C-3 when `DATABASE_URL` is set — **skip leaves zeros**.
2. Computes `c3_marker_miss_ok` / `h3_role_provenance_closed` but terminal `status` depends **only** on five plan steps + verifier + assert (`:422-425`).
3. Runner exits nonzero **only** for `ASSERT_RC` (`:484-490`) — not for failed/skipped marker-miss.
4. `assert-human-test-verdict.sh:35-116` checks plan logs + C-2; **never** requires PONR preservation, C-3 codes, or non-owner proof.
5. Forced-miss `effective_user_hint` is **not** a pass predicate; fresh report has it `null`.
6. Trigger query uses `coalesce(bool_and(...), true)` so **zero** non-internal triggers reads as enabled.

**Required remediation:** Mandatory disposable C-3 DB (or explicit fail); require forced-miss report with nonzero seed, **named** enabled triggers, observed `current_user==holocron_app`; bind to gate status, process exit, package assert, verifier — not metadata alone.

## Scope (WRITE-ALLOWED)

- `scripts/run-sprint30-human-gate.sh`
- `scripts/probe-ponr-role-immutability-negative-marker.sh`
- `scripts/probe-ponr-role-immutability.sh`
- `scripts/assert-human-test-verdict.sh`
- `scripts/package-sprint30-gate-evidence.sh` (package C-3 predicates only)
- Optional PLATFORM_IT under `services/platform/tests/integration/sprint30-*.test.ts`
- Cross-link `REDHAT-FIX-RH-S30-24.md` disposition
- `.tmp/REDHAT-FIX-RH-S30-27/**`
- **Does not** re-open C-2 packaging protocol (except bind assert) or M-3 inject oracles

## Acceptance Criteria

- [ ] **AC-1 (PRIMARY)** C-3 predicates bound to terminal status + process exit: `meta.status=completed` and exit 0 **only if** `h3_role_provenance_closed && c3_marker_miss_ok` (forced-miss report ok with before_count≥1, after==before, named triggers present+enabled, `probe_current_user==holocron_app`, success-path SQLSTATE). Five-step pass alone cannot complete. Metadata-only `c3_marker_miss_ok` beside `status=completed` is **not** closed.
- [ ] **AC-2** Mandatory disposable `DATABASE_URL`: unset/empty fails closed with nonzero exit — skip is **not** silent zero RCs.
- [ ] **AC-3** `assert-human-test-verdict` (package / `ASSERT_C3_PREDICATES=1`) requires miss report ok + non-owner + named triggers + PONR preservation. Package `20260807T102120Z`-class null `effective_user_hint` **must fail** under GREEN assert.
- [ ] **AC-4** Named required triggers present AND enabled: `data_plane_ponr_reject_mutation` + `data_plane_ponr_reject_truncate` (`tgenabled='O'`). Empty set **must fail** — `coalesce(bool_and(...), true)` forbidden as pass.
- [ ] **AC-5** `ok` requires observed `probe_current_user==holocron_app` / `effective_non_owner==true`. Null `effective_user_hint` forces `ok=false`.
- [ ] **AC-6** RED baseline documents five-step packageable false-green (reviewed SHA / package `20260807T102120Z`); GREEN refuses residual fixtures; disposition supersedes RH-S30-24 residual for gate-owned fail-closed C-3.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Gate exit ≠ 0 when forced-miss fails/skipped despite five-step pass | AC-1 | `ac1-status-exit-bound.json` |
| TC-2 | `status==completed` implies `c3_marker_miss_ok && h3_role_provenance_closed` | AC-1 | meta jq |
| TC-3 | Unset DATABASE_URL fails closed | AC-2 | `fixtures/skipped-DATABASE_URL` |
| TC-4 | assert requires miss ok + non-owner + named triggers | AC-3 | `ASSERT_C3_PREDICATES=1` |
| TC-5 | Package 102120Z-class null-user report fails assert under GREEN | AC-3 | `ac3-assert-null-user-fail.json` |
| TC-6 | Empty required-trigger set fails wrapper | AC-4 | empty-trigger-set exit ≠ 0 |
| TC-7 | Both named required triggers present+enabled for ok | AC-4 | jq counts / names |
| TC-8 | ok requires probe_current_user==holocron_app; null fails | AC-5 | null-effective-user fixture |
| TC-9 | Real disposable seeded forced-miss full predicates | AC-1 | seeded-forced-miss report |
| TC-10 | Static audit: no coalesce empty-true; no bare parse-miss fallback | AC-4 | `ac4-static-audit.md` |
| TC-11 | RED baseline + GREEN refuses residual fixtures | AC-6 | red + ac6 files |
| TC-12 | Disposition supersedes RH-S30-24 residual | AC-6 | `ac7-disposition.md` |
| TC-13 | package post-assert path fails when C-3 package predicates fail | AC-3 | package script + fixture |
| TC-14 | Success-path non-regression: always-rollback + holocron_app | AC-1 | success-path ac1/ac2 |

## Anti-stub

- Metadata-only `c3_marker_miss_ok` beside `status=completed` is **NOT** closed.
- `coalesce` empty-set true is **NOT** trigger preservation.
- Success-path-only or five-step-only artifacts are **NOT** closed for C-3.
- `ok:true` with null `effective_user_hint` is **NOT** non-owner proof.
- Do not invent hand-written `negative-marker-report.json` as sole pass.
- Do not mock psql / SQLSTATE / current_user.
- Do not claim RH-S30-24 seed-required alone closes this residual.
- Do not reintroduce bare TRUNCATE/UPDATE on marker parse miss.

## Critical Constraints

- **MUST** make disposable C-3 DATABASE_URL mandatory (or explicit fail)
- **MUST** bind c3_marker_miss_ok + h3_role_provenance_closed to terminal status and process exit
- **MUST** require named triggers present+enabled (both required names)
- **MUST** require observed holocron_app from rolled-back force-miss session
- **MUST** extend assert-human-test-verdict for C-3 package predicates
- **MUST** write full evidence under `.tmp/REDHAT-FIX-RH-S30-27/`
- **NEVER** allow completed/exit-0 with skipped or failed marker-miss
- **STRICTLY** process exit nonzero when PROBE_RC≠0 or MARKER_MISS_RC≠0 or !h3_closed
- **STRICTLY** disposition supersedes RH-S30-24 residual for gate-owned fail-closed C-3

## Evidence

`.tmp/REDHAT-FIX-RH-S30-27/`

| Artifact | Proves |
|----------|--------|
| `red-five-step-skip-or-null-user-false-green.txt` | AC-6 RED baseline |
| `ac1-status-exit-bound.json` | AC-1 status/exit binding |
| `fixtures/skipped-DATABASE_URL/**` | AC-2 |
| `fixtures/empty-trigger-set/**` | AC-4 |
| `fixtures/null-effective-user/**` | AC-5 |
| `seeded-forced-miss/negative-marker-report.json` | AC-1/AC-5 positive |
| `ac3-assert-*.json` | AC-3 package assert |
| `ac4-static-audit.md` | No coalesce empty-true |
| `ac6-green-refuses.json` | GREEN residual refusal |
| `ac7-disposition.md` | Supersedes RH-S30-24 residual |

## Reading List

- Closeout C-3 section @ 5b86e4e — `.spec/reviews/red-hat-sprint-30-20260807T102743Z-independent-final-closeout.md`
- `REDHAT-FIX-RH-S30-24.md` — seed-required partial; residual = status/exit/assert binding
- `scripts/run-sprint30-human-gate.sh:370-536` — C-3 invocation, status, exit
- `scripts/probe-ponr-role-immutability-negative-marker.sh` — ok predicate
- `scripts/assert-human-test-verdict.sh` — package C-3 predicates
- `.gate-evidence/20260807T102120Z/ponr-role-provenance-marker-miss/negative-marker-report.json` — null effective_user RED

## Design

- **Pattern:** Require DATABASE_URL else exit 2 → always run success-path + negative-marker → wrapper requires named triggers + holocron_app → finalize status completed only if h3_closed → shell exit if miss/probe fails → package assert re-checks C-3.
- **Anti-pattern:** Recording c3_marker_miss_ok in meta while status=completed and exit 0 when miss skipped/failed; coalesce empty-true; assert that only checks plan logs + C-2.

## Disposition

Release-blocking HIGH residual after RH-S30-24 seed-required partial. Bind forced-miss + non-owner + named triggers to gate status/exit/assert/package. Sprint 30 must not claim C-3 closed until dual-lens APPROVED on a landed SHA with fail-closed C-3 binding.

AGENT: implementer=devops-engineer | proposed_by=security-auditor | technical-reviewer=security-reviewer | standing-test-reality=test-quality-reviewer  
planned_at: 2026-08-07T10:50:00Z  
finding_ids: [C-3, REDHAT-FIX-RH-S30-27, REDHAT-FIX-RH-S30-24, H-3]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-RH-S30-27",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "proposed_by": "security-auditor",
  "agent": "devops-engineer",
  "touches_capabilities": ["CAP-CUT-01"],
  "required_trigger_names": ["data_plane_ponr_reject_mutation", "data_plane_ponr_reject_truncate"],
  "required_app_role": "holocron_app",
  "fixtures": {
    "seeded_disposable_ponr_db": { "description": "Disposable Postgres ≥1 PONR + both required triggers", "seed_method": "cli" },
    "skipped_DATABASE_URL_env": { "description": "Unset DATABASE_URL fail-closed", "seed_method": "cli" },
    "empty_trigger_set_disposable_db": { "description": "Empty/disabled required triggers must fail", "seed_method": "cli" },
    "null_effective_user_report_fixture": { "description": "20260807T102120Z-class null effective_user_hint ok:true must fail GREEN", "seed_method": "file_artifact" },
    "five_step_pass_marker_miss_failed_fixture": { "description": "Five-step pass + failed/skipped miss must not complete", "seed_method": "cli" }
  },
  "requirements": [
    {"id": "AC-1", "type": "acceptance_criterion", "description": "C-3 predicates bound to terminal status + process exit", "verify": "ac1-status-exit-bound.json"},
    {"id": "AC-2", "type": "acceptance_criterion", "description": "Mandatory disposable DATABASE_URL; skip is fail", "verify": "skipped-DATABASE_URL exit != 0"},
    {"id": "AC-3", "type": "acceptance_criterion", "description": "assert requires marker-miss ok + non-owner + named triggers", "verify": "ac3-assert-*.json"},
    {"id": "AC-4", "type": "acceptance_criterion", "description": "Named required triggers present+enabled; empty set fails", "verify": "empty-trigger-set + static audit"},
    {"id": "AC-5", "type": "acceptance_criterion", "description": "probe_current_user==holocron_app required in ok", "verify": "null-effective-user fixture + seeded report"},
    {"id": "AC-6", "type": "acceptance_criterion", "description": "RED five-step false-green; GREEN refuses; supersedes RH-S30-24 residual", "verify": "red + ac6 + ac7-disposition.md"},
    {"id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Gate exit nonzero on miss fail/skip", "verify": "ac1-status-exit-bound.json"},
    {"id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "completed implies C-3 flags true", "verify": "meta.json jq"},
    {"id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Unset DATABASE_URL fail-closed", "verify": "skipped-DATABASE_URL exit"},
    {"id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "Assert requires full C-3 miss predicates", "verify": "assert dual fixtures"},
    {"id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "102120Z null-user report fails assert GREEN", "verify": "ac3-assert-null-user-fail.json"},
    {"id": "TC-6", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "Empty trigger set fails wrapper", "verify": "empty-trigger-set exit"},
    {"id": "TC-7", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "Both named triggers required", "verify": "jq required_trigger_names"},
    {"id": "TC-8", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "Null probe_current_user fails ok", "verify": "null-effective-user fixture"},
    {"id": "TC-9", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Real disposable seeded forced-miss full predicates", "verify": "seeded-forced-miss report"},
    {"id": "TC-10", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "Static no coalesce empty-true", "verify": "ac4-static-audit.md"},
    {"id": "TC-11", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "RED + GREEN residual fixtures", "verify": "red + ac6 files"},
    {"id": "TC-12", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "Disposition supersedes RH-S30-24 residual", "verify": "ac7-disposition.md"},
    {"id": "TC-13", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "Package post-assert C-3 binding", "verify": "package script + fixture"},
    {"id": "TC-14", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Success-path non-regression holocron_app always-rollback", "verify": "success-path ac1/ac2"}
  ]
}
-->
