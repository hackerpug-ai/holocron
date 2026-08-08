# GATE-FIX-post-ponr-gate-meta-parse — Post-PONR identity bind must parse real `@@GATE-META` human-gate step logs (C-1)

> **Task ID:** GATE-FIX-post-ponr-gate-meta-parse
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** CRITICAL
> **Source finding:** Independent review C-1 — post-PONR identity bind cannot parse real human-gate `step4.log` / forces false step5 fail
> **Source:** `.spec/reviews/red-hat-sprint-30-20260808T014319Z-gate-fix-review.md` (reviewed HEAD `3ba6ab5c`, verdict **NEEDS_REVISION**)
> **RED reproduction:**
> - `python3 scripts/lib/zero-loss-identity-oracle.py --mode post-ponr --step4 …/20260808T011038Z/step4.log --step5 …/20260808T011038Z/step5.log`
> - → `ok:false`, `step4_ponr_id:null`, `reasons:["step4_missing_ponr_identity"]`, RC=2
> - despite both this-run ids present: `ponr_id=31b33eb4-3e97-4520-b6a7-745186fc8d51`, `write_row_id=ebd12bd6-f78d-4849-9595-8bc9d4036269`
> **Proposed by:** `devops-engineer` (orchestrator plan from independent red-hat review)
> **TDD:** red_first · RED_GREEN_REQUIRED=yes · seeded_evidence=yes
> **Status:** Plan only — not implemented
> **Branch:** implementer task branch; plan-only on main via orchestrator; unreviewed NEVER merges; merge only after dual-lens APPROVED via `kb-orchestrate` `references/merge-to-main.sh` (orchestrator-only)
> **Siblings:** `GATE-FIX-zero-loss-t-sync-013` (parent oracle land) · `GATE-FIX-prove-fence-no-mint-disarmed` (H-1) · `GATE-FIX-gate-preflight-fence-rearm` · `GATE-FIX-drill-fence-precondition`

## Finding

**C-1 — Post-PONR identity bind cannot parse real human-gate `step4.log` / forces false step5 fail.** Severity: **CRITICAL**. Confidence: **HIGH** (independently reproduced this review cycle).

### What works (preserve)

- Oracle **semantic** bind when given parseable step4 JSON correctly:
  - PASS this-run step4 ↔ step5 ids (`31b33eb4…` / `ebd12bd6…`)
  - FAIL residual aaaa with reasons including `residual_aaaa_sentinel` and `step5_write_row_id_is_aaaa_sentinel_not_this_run`
- Compact residual + this-run unit fixtures currently green (8/8 in parent suite) — **semantics are fine; production consumer path is not**.
- Step5 regex oracle in gate-plan (`POST_PONR_INELIGIBLE` + `repointed:false`) still works on real logs.
- Human-gate still wires post-steps bind (`scripts/run-sprint30-human-gate.sh` → `assert-post-ponr-identity-bind.sh` → `zero-loss-identity-oracle.py --mode post-ponr`).
- Parent task `GATE-FIX-zero-loss-t-sync-013` identity-oracle design remains correct for zero-loss and residual-aaaa **when inputs are parseable**.

### What remains broken

Human-gate consumer path always feeds **GATE-META-wrapped** logs:

```text
@@GATE-META step=4 ...@@
CMD: ...
{
  "ok": true,
  "ponr_id": "31b33eb4-…",
  "write_row_id": "ebd12bd6-…",
  ...
}
@@GATE-EXIT=0@@
```

In `scripts/lib/zero-loss-identity-oracle.py` `main()` post-ponr recovery:

1. `load_json(step4.log)` fails (GATE-META prefix) → `{}`
2. Line-by-line requires `ponr_id` **and** `line.startswith("{")` → never true on pretty multi-line JSON (each field on its own line)
3. Regex extract is nested under `if step4_text.strip().startswith("{")` → **skipped** because strip starts with `@@GATE-META`

**Result:** `step4_missing_ponr_identity` on every real gate run. Human-gate then **forces step5 fail** on bind RC≠0 even when step5 regex already passed — a hard regression of the green step5 path of partial 3/5 runs (`20260808T011038Z` steps 3–5 were green before bind flip).

**Unit false-green class:** fixtures under `.tmp/GATE-FIX-zero-loss-t-sync-013/fixtures/residual-aaaa-ponr/` and the suite `tests/cutover/gate-fix-zero-loss-t-sync-013.test.ts` use **bare JSON** (`step4.json` starts with `{`) — they never exercise the GATE-META consumer path. Unit GREEN does **not** cover production.

Independent reproduction (review + re-confirmed for this plan):

```text
python3 scripts/lib/zero-loss-identity-oracle.py --mode post-ponr \
  --step4 .spec/.../.gate-evidence/20260808T011038Z/step4.log \
  --step5 .spec/.../.gate-evidence/20260808T011038Z/step5.log
→ ok:false, step4_ponr_id:null, reasons:["step4_missing_ponr_identity"], RC=2
```

Yet a `JSONDecoder.raw_decode` walk over the same files extracts this-run ids cleanly.

### Required remediation

Make post-PONR bind robust against real human-gate step logs (GATE-META prefix + pretty multi-line JSON), and **require** a unit/fixture that is a **verbatim** `@@GATE-META` step4/step5 pair from `20260808T011038Z` so the false-green class cannot recur.

Optional alternate (also acceptable if preferred and fail-closed): bind against structured report files (e.g. `.tmp/D07-04/enable-writes-report.json` + step5 report JSON) **in addition to** log parse — but the human-gate consumer that currently passes `$EVID_DIR/step4.log` / `step5.log` **MUST** succeed without inventing a second exclusive path that leaves log-only consumers broken.

## Scope (WRITE-ALLOWED)

- `scripts/lib/zero-loss-identity-oracle.py` — robust JSON extract for step4/step5 gate logs (e.g. `JSONDecoder.raw_decode` scan for objects containing `ponr_id`; do not require whole-file `startswith("{")`; do not require single-line JSON)
- `scripts/assert-post-ponr-identity-bind.sh` — only if CLI flags / help need update (still execs the python oracle)
- `scripts/run-sprint30-human-gate.sh` — only if consumer must also accept structured report paths **without** removing log-path support; do **not** weaken the flip-to-fail semantics once bind is honest
- `tests/cutover/gate-fix-zero-loss-t-sync-013.test.ts` **and/or** new focused suite `tests/cutover/gate-fix-post-ponr-gate-meta-parse.test.ts`
- Fixtures under `.tmp/GATE-FIX-post-ponr-gate-meta-parse/fixtures/**` (and optional extension of `.tmp/GATE-FIX-zero-loss-t-sync-013/fixtures/**` with GATE-META twins)
- Evidence: `.tmp/GATE-FIX-post-ponr-gate-meta-parse/**`
- Cross-link parent `GATE-FIX-zero-loss-t-sync-013.md` and sibling `GATE-FIX-prove-fence-no-mint-disarmed.md`
- **Does not** re-open product drill fence / preflight rearm product code
- **Does not** weaken residual-aaaa rejection once step4 is parseable
- **Does not** invent green bind by hardcoding this-run ids; must extract from input
- **Does not** re-open C-2 packaging or C-3 trigger-set classes

## Acceptance Criteria

- [ ] **AC-1 (PRIMARY — real GATE-META consumer path PASS)** GIVEN verbatim human-gate `step4.log` + `step5.log` from run `20260808T011038Z` (files begin with `@@GATE-META`, pretty multi-line JSON body, trailing `@@GATE-EXIT=…@@`) WHEN `python3 scripts/lib/zero-loss-identity-oracle.py --mode post-ponr --step4 <that step4.log> --step5 <that step5.log>` runs THEN it **MUST** PASS (`ok:true`, RC=0) with:
  - `step4_ponr_id == 31b33eb4-3e97-4520-b6a7-745186fc8d51`
  - `step4_write_row_id == ebd12bd6-f78d-4849-9595-8bc9d4036269`
  - `step5_error_code == POST_PONR_INELIGIBLE`
  - bind identity match (this-run ids present in step5 text / structured fields)
  - **MUST NOT** emit `step4_missing_ponr_identity`

- [ ] **AC-2 (residual aaaa still FAIL with named reasons)** GIVEN a GATE-META-wrapped (or equivalently production-shaped) step4 this-run pair **and** a step5 residual aaaa / foreign-ponr shape WHEN post-ponr mode evaluates THEN it MUST FAIL with aaaa-class reasons (`residual_aaaa_sentinel` and/or `step5_write_row_id_is_aaaa_sentinel_not_this_run` / bind mismatch) — **not** only via `step4_missing_ponr_identity` after a weak parse. Compact residual fixtures may remain; GATE-META residual negative is preferred for fakeability.

- [ ] **AC-3 (unit fixture must not false-green)** GIVEN unit tests for this residual WHEN fixtures are committed THEN at least one PASS case **MUST** be a **verbatim** copy (or byte-faithful extract) of `20260808T011038Z` step4.log + step5.log including the `@@GATE-META` prefix and multi-line JSON. Bare `step4.json` that starts with `{` alone is **NOT** sufficient to close AC-1. Existing compact fixtures may stay for semantic lanes; the GATE-META lane is **mandatory** and must live in `tests/cutover/gate-fix-*.test.ts` (extend parent suite or new focused file).

- [ ] **AC-4 (no step5 false-fail regression)** GIVEN human-gate post-steps bind against real GATE-META logs with matching this-run ids WHEN bind RC=0 THEN runner **MUST NOT** flip step5 pass → fail. GIVEN real bind failure (missing ids, aaaa residual, mismatch) WHEN RC≠0 THEN flip-to-fail remains allowed/required. Prove with AC-1 green + AC-2 red.

- [ ] **AC-5 (optional structured-report path)** GIVEN implementer chooses dual input (log **or** `--step4-report` / enable-writes-report.json) WHEN either path is used THEN identity bind semantics are identical; log path remains the default human-gate wire unless runner is updated atomically with both. Path-only “report file exists” without identity extract is **NOT** closed.

- [ ] **AC-6 (RED first + branch discipline)** Capture RED from independent reproduction against `20260808T011038Z` logs (RC=2, `step4_missing_ponr_identity`). GREEN evidence under `.tmp/GATE-FIX-post-ponr-gate-meta-parse/`. Implementer branch; merge only after dual-lens APPROVED (orchestrator-only). Do not claim T-SYNC-014 gate-fix complete until AC-1 is green on real logs.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | RED: real `20260808T011038Z` step4/step5 logs fail pre-fix with `step4_missing_ponr_identity` | AC-6 | `red-20260808T011038Z-gate-meta-parse.json` |
| TC-2 | GREEN: same real logs PASS post-fix with this-run ids bound | AC-1 | `ac1-gate-meta-this-run-pass.json` |
| TC-3 | Unit: verbatim GATE-META step4/step5 fixture from 011038Z requires PASS | AC-1, AC-3 | `tests/cutover/gate-fix-*.test.ts` + `fixtures/gate-meta-20260808T011038Z/**` |
| TC-4 | Residual aaaa (GATE-META or production-shaped) FAIL with aaaa-named reasons, not missing-step4-only | AC-2 | `ac2-gate-meta-residual-aaaa-fail.json` |
| TC-5 | Compact bare-JSON this-run still PASS (no regression of parent suite) | AC-1 | parent suite + compact fixtures |
| TC-6 | Compact residual aaaa still FAIL with aaaa reasons | AC-2 | parent residual fixture |
| TC-7 | Static: recovery does not require `text.strip().startswith("{")` as sole multi-line path | AC-1 | `ac1-static-parse-path.md` |
| TC-8 | Human-gate post-bind against GATE-META logs does not flip honest step5 pass | AC-4 | `ac4-no-false-step5-flip.*` |
| TC-9 | Negative: invented step4 log with GATE-META but no ponr_id still FAIL | AC-3 | `fixtures/gate-meta-missing-ponr/**` |
| TC-10 | `JSONDecoder.raw_decode` (or equivalent) extracts nested multi-line object containing `ponr_id` | AC-1 | unit + `ac1-raw-decode-extract.*` |

## Anti-stub (fakeability floor)

- **NOT closed:** unit GREEN only on bare `step4.json` / `step5-this-run.json` that start with `{` (the false-green class that shipped with GATE-FIX-zero-loss-t-sync-013).
- **NOT closed:** stripping GATE-META in the test harness only, while production `main()` still cannot parse real logs.
- **NOT closed:** hardcoding `31b33eb4…` / `ebd12bd6…` in the oracle to force PASS without extract.
- **NOT closed:** success-path-only regex on step5 without successful step4 identity extract.
- **NOT closed:** path-exists on `assert-post-ponr-identity-bind.sh` without RC=0 on real GATE-META logs.
- **NOT closed:** claiming AC-1 green while `step4_ponr_id` remains null.
- **NOT closed:** weakening residual-aaaa rejection to green the suite.
- **NOT closed:** hand-editing `20260808T011038Z` evidence logs to remove GATE-META for the “real log” case.

## Critical Constraints

- **MUST** parse real human-gate step logs that begin with `@@GATE-META` and contain pretty multi-line JSON
- **MUST** PASS post-ponr bind on verbatim `20260808T011038Z` step4.log + step5.log with this-run ids
- **MUST** add a unit fixture that is GATE-META-prefixed (not bare JSON only)
- **MUST** keep residual-aaaa fail class named and fail-closed once parse works
- **MUST** red_first from independent reproduction / `20260808T011038Z` logs
- **MUST** implementer branch; merge only after dual-lens APPROVED (orchestrator-only)
- **MUST** preserve human-gate wire `assert-post-ponr-identity-bind.sh --step4 $EVID_DIR/step4.log --step5 $EVID_DIR/step5.log` as a working consumer (or atomically update runner + oracle together)
- **NEVER** false-green by omitting GATE-META from the mandatory fixture
- **NEVER** hardcode this-run PONR identities into the oracle
- **NEVER** weaken CAP-CUT-01 / T-SYNC-014 residual-aaaa rejection
- **STRICTLY** this task = gate oracle parse/bind consumer path; not product enable-writes / repoint logic
- **STRICTLY** fakeability floor: RC=0 on real GATE-META logs + unit GATE-META fixture + residual aaaa still red

## Evidence

`.tmp/GATE-FIX-post-ponr-gate-meta-parse/`

| Artifact | Proves |
|----------|--------|
| `red-20260808T011038Z-gate-meta-parse.json` | AC-6 RED: RC=2, `step4_missing_ponr_identity` |
| `ac1-gate-meta-this-run-pass.json` | AC-1 GREEN on real/verbatim logs |
| `ac1-static-parse-path.md` | TC-7 static recovery path |
| `ac1-raw-decode-extract.*` | TC-10 extract works |
| `ac2-gate-meta-residual-aaaa-fail.json` | AC-2 aaaa-named fail |
| `ac4-no-false-step5-flip.*` | AC-4 |
| `fixtures/gate-meta-20260808T011038Z/step4.log` | Verbatim (or byte-faithful) GATE-META step4 |
| `fixtures/gate-meta-20260808T011038Z/step5.log` | Verbatim (or byte-faithful) GATE-META step5 |
| `fixtures/gate-meta-missing-ponr/**` | TC-9 negative |
| `ac6-disposition.md` | Disposition vs C-1 |

Seed / cite (read-only) RED evidence:

- `.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260808T011038Z/step4.log`
- `.../step5.log`
- `.spec/reviews/red-hat-sprint-30-20260808T014319Z-gate-fix-review.md` (C-1)
- Reviewed HEAD: `3ba6ab5c4189a3091e804b345342e9502604724f`

## Reading List

- Independent review: `.spec/reviews/red-hat-sprint-30-20260808T014319Z-gate-fix-review.md` — C-1 + claim 3/4
- Real logs: `.gate-evidence/20260808T011038Z/step4.log`, `step5.log`
- `scripts/lib/zero-loss-identity-oracle.py` — `main()` post-ponr recovery (~L392–420); `evaluate_post_ponr_bind`
- `scripts/assert-post-ponr-identity-bind.sh` — thin wrapper
- `scripts/run-sprint30-human-gate.sh` — post-steps bind + step5 flip (~L350–390)
- `tests/cutover/gate-fix-zero-loss-t-sync-013.test.ts` — false-green bare-JSON fixtures
- `.tmp/GATE-FIX-zero-loss-t-sync-013/fixtures/residual-aaaa-ponr/*` — bare JSON (not GATE-META)
- `GATE-FIX-zero-loss-t-sync-013.md` — parent oracle task (do not re-open zero-loss redesign; fix consumer parse)
- Optional structured reports: `.tmp/D07-04/enable-writes-report.json`, step5 `rollback-repoint-report.json` if dual-path chosen

## Design

### Pattern (chosen)

Fix step4 (and step5 if needed) recovery in `zero-loss-identity-oracle.py`:

```python
def extract_json_objects(text: str) -> list[dict]:
    """Scan text with json.JSONDecoder().raw_decode; return all dict objects."""
    ...

def load_step_payload(path: Path) -> dict:
    # 1) try whole-file json
    # 2) raw_decode walk; prefer last object containing ponr_id (step4)
    #    or error.code / precondition (step5)
    # 3) never require strip().startswith("{")
```

Wire `evaluate_post_ponr_bind` with extracted step4 dict + full step5 text (existing text scan for ids remains useful).

### Unit fixture requirement (non-waivable)

Copy (or symlink-safe file fixture under `.tmp/.../fixtures/gate-meta-20260808T011038Z/`) the real GATE-META logs. Test:

```text
runOracle(['--mode','post-ponr','--step4', fixtureStep4, '--step5', fixtureStep5])
→ rc 0, step4_ponr_id == 31b33eb4…, step4_write_row_id == ebd12bd6…
```

Plus residual aaaa GATE-META negative if feasible.

### Anti-pattern

- “Unit suite 8/8 pass so bind is fine” — false-green without GATE-META.
- Stripping GATE-META only in tests.
- Flipping human-gate to skip bind on parse failure (must fix parse, not mute the oracle).

## Disposition

Release-blocking **CRITICAL** residual on T-SYNC-014 consumer wiring: the post-PONR identity bind landed in GATE-FIX-zero-loss-t-sync-013 cannot parse the only log shape human-gate produces, so every real run forces `step4_missing_ponr_identity` and flips honest step5 pass → fail. Unit fixtures false-greened the semantic bind by avoiding `@@GATE-META`.

Close by robust multi-object JSON extract (raw_decode or equivalent), mandatory GATE-META verbatim fixture, residual-aaaa still fail-closed, and RC=0 on real `20260808T011038Z` logs. Sprint 30 remains **In Progress**.

AGENT: implementer=devops-engineer | proposed_by=devops-engineer | technical-reviewer=security-reviewer | standing-test-reality=test-quality-reviewer
planned_at: 2026-08-08T02:30:00Z
finding_ids: [C-1, T-SYNC-014, GATE-FIX-post-ponr-gate-meta-parse, 20260808T011038Z, 3ba6ab5c]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-post-ponr-gate-meta-parse",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "proposed_by": "devops-engineer",
  "agent": "devops-engineer",
  "technical_reviewer": "security-reviewer",
  "standing_test_reality": "test-quality-reviewer",
  "severity": "CRITICAL",
  "touches_capabilities": ["CAP-CUT-01"],
  "prd_refs": ["UC-SYNC-04", "T-SYNC-014"],
  "siblings": [
    "GATE-FIX-zero-loss-t-sync-013",
    "GATE-FIX-prove-fence-no-mint-disarmed",
    "GATE-FIX-gate-preflight-fence-rearm",
    "GATE-FIX-drill-fence-precondition"
  ],
  "red_evidence_run_id": "20260808T011038Z",
  "red_evidence_git_sha": "3ba6ab5c4189a3091e804b345342e9502604724f",
  "source_review": ".spec/reviews/red-hat-sprint-30-20260808T014319Z-gate-fix-review.md",
  "branch_discipline": "implementer task branch; merge only after dual-lens APPROVED via kb-orchestrate references/merge-to-main.sh",
  "do_not_reopen": ["C-2-packaging", "C-3-trigger-set", "product-drill-fence", "preflight-rearm-redesign"],
  "fakeability_floor_rejected": [
    "bare_json_fixtures_only_without_GATE_META",
    "path_exists_only",
    "hardcoded_this_run_ids",
    "strip_gate_meta_only_in_tests",
    "success_path_only_without_residual_aaaa_fail"
  ],
  "fixtures": {
    "gate_meta_20260808T011038Z_verbatim": {
      "description": "Verbatim @@GATE-META step4.log + step5.log from 20260808T011038Z; this-run ids 31b33eb4… / ebd12bd6… must PASS post-ponr",
      "seed_method": "recorded_gate_evidence_copy",
      "path": ".gate-evidence/20260808T011038Z/step{4,5}.log"
    },
    "gate_meta_residual_aaaa_negative": {
      "description": "Production-shaped residual aaaa step5 must FAIL with aaaa-named reasons after step4 parse works",
      "seed_method": "file_artifact"
    },
    "gate_meta_missing_ponr_negative": {
      "description": "GATE-META log without ponr_id still FAIL",
      "seed_method": "file_artifact"
    },
    "compact_this_run_and_residual_parent": {
      "description": "Preserve parent compact fixtures for semantic lanes; not sufficient alone for AC-1",
      "seed_method": "existing_parent_fixtures"
    }
  },
  "requirements": [
    {"id": "AC-1", "type": "acceptance_criterion", "description": "Verbatim GATE-META 011038Z step4/step5 PASS post-ponr with this-run ids; no step4_missing_ponr_identity", "verify": "ac1-gate-meta-this-run-pass.json"},
    {"id": "AC-2", "type": "acceptance_criterion", "description": "Residual aaaa still FAIL with named aaaa reasons after parse works", "verify": "ac2-gate-meta-residual-aaaa-fail.json"},
    {"id": "AC-3", "type": "acceptance_criterion", "description": "Unit fixture is verbatim GATE-META; bare JSON alone not closed", "verify": "tests/cutover/gate-fix-*.test.ts + fixtures/gate-meta-20260808T011038Z"},
    {"id": "AC-4", "type": "acceptance_criterion", "description": "Honest step5 pass not flipped when bind RC=0 on real logs", "verify": "ac4-no-false-step5-flip"},
    {"id": "AC-5", "type": "acceptance_criterion", "description": "Optional structured-report dual path; log path remains working default", "verify": "optional"},
    {"id": "AC-6", "type": "acceptance_criterion", "description": "RED first on 011038Z parse failure; branch discipline", "verify": "red-20260808T011038Z-gate-meta-parse.json"},
    {"id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "RED baseline parse fail", "verify": "red-20260808T011038Z-gate-meta-parse.json"},
    {"id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "GREEN real logs PASS", "verify": "ac1-gate-meta-this-run-pass.json"},
    {"id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "Unit GATE-META fixture PASS", "verify": "gate-fix unit suite"},
    {"id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "aaaa-named fail", "verify": "ac2-gate-meta-residual-aaaa-fail.json"},
    {"id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Compact this-run still PASS", "verify": "parent suite"},
    {"id": "TC-6", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Compact residual still FAIL", "verify": "parent residual fixture"},
    {"id": "TC-7", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Static no startswith-only multi-line path", "verify": "ac1-static-parse-path.md"},
    {"id": "TC-8", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "No false step5 flip", "verify": "ac4-no-false-step5-flip"},
    {"id": "TC-9", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "GATE-META without ponr_id fails", "verify": "fixtures/gate-meta-missing-ponr"},
    {"id": "TC-10", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "raw_decode extract", "verify": "ac1-raw-decode-extract"}
  ]
}
-->
