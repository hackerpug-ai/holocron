# REDHAT-FIX-RH-S30-29 — C-2 residual: ASSERT_PACKAGE_HEAD must bind HEAD lock blob OID; v5 E1-vs-bind negative must reach hist_oid≠sub_oid

> **Task ID:** REDHAT-FIX-RH-S30-29
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** HIGH
> **Source finding:** C-2 residual (two HIGH findings)
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T105114Z-independent-final-closeout.md` (independent final closeout @ fda9b9da)
> **Proposed by:** `devops-engineer`
> **TDD:** red_first · RED_GREEN_REQUIRED=yes · seeded_evidence=yes
> Status: Backlog — plan only (do not treat as fixed until dual-lens APPROVED + landed)

## Finding

**C-2 — HEAD-lock OID bind and v5 E1-vs-bind oracle-reach remain open.** Severity: **HIGH**. Confidence: **HIGH**.

### What works (narrow C-2-atomic-v5 PASS)

- Fresh package `20260807T103459Z` is Git-object-integrity-bound under trusted local HEAD: lock/attestation/result OIDs resolve; normal-path assert exits 0.
- RH-S30-26 closed unauthenticated worktree-sidecar selector authentication under C-2-atomic-v5.

### What remains broken

1. `assert-gate-evidence-containment.sh:53-54` accepts arbitrary `ASSERT_LOCK_COMMIT`. With `ASSERT_PACKAGE_HEAD=1`, lines `195-208` verify only that a lock **path** exists at `HEAD`; they never require that its blob OID equals the already-loaded lock. `package-sprint30-gate-evidence.sh:221-227` exports no safe reset of `ASSERT_LOCK_COMMIT`. An inherited environment can select a stale/foreign lock while the HEAD existence check still passes.

2. `assert-c2-e1-bind-mismatch-negative.sh:14-16,31-54,67-81` forges a **v4** worktree attestation for run `20260807T095843Z` (no v5 lock). The v5 assert fails at the lock precondition (`:63-69`) before comparing `hist_oid` and `sub_oid` (`:161-177`). The harness greps blob-identity wording and exits 2 — it cannot detect regression of the actual v5 OID-equality control.

**Required remediation:** When `ASSERT_PACKAGE_HEAD=1`, require `lock_commit == HEAD` or compare `HEAD:<lock path>` blob OID with `lock_oid`; isolate alternate commits to test-only fixtures; package runner must safe-reset `ASSERT_LOCK_COMMIT`. Rewrite the E1-vs-bind negative as a disposable Git-backed v5 fixture (package → attestation → lock), then alter only the submitted result blob and assert explicit `hist_oid != sub_oid`.

## Scope (WRITE-ALLOWED)

- `scripts/assert-gate-evidence-containment.sh`
- `scripts/assert-human-test-verdict.sh` (must not weaken)
- `scripts/package-sprint30-gate-evidence.sh` (safe `ASSERT_LOCK_COMMIT` handling)
- `scripts/assert-c2-e1-bind-mismatch-negative.sh` (rewrite for v5)
- Optional `scripts/assert-c2-*-negative*.sh`, `scripts/lib/gate-evidence-*.sh`
- `.tmp/REDHAT-FIX-RH-S30-29/**`
- Cross-link `REDHAT-FIX-RH-S30-26.md` disposition
- **Does not** invent pass evidence; only packages real runs
- **Does not** re-open C-3 product/PONR probes or M-3 inject oracles

## Acceptance Criteria

- [ ] **AC-1 (PRIMARY)** `ASSERT_PACKAGE_HEAD=1` binds loaded lock to HEAD lock blob OID: require `lock_commit == HEAD` and/or `git rev-parse HEAD:<rel_lock> == lock_oid`. Foreign `ASSERT_LOCK_COMMIT` exits non-zero with explicit HEAD-lock OID wording. Path-only `cat-file -e HEAD:lock` is **not** closed.
- [ ] **AC-2** `package-sprint30-gate-evidence.sh` unsets or forces `ASSERT_LOCK_COMMIT=$(git rev-parse HEAD)` before assert invocations — ambient foreign values cannot survive into the assert child env.
- [ ] **AC-3** Alternate lock commits isolated to test-only fixture commands (`ASSERT_PACKAGE_HEAD=0` or dedicated fixture mode). Production path with `ASSERT_PACKAGE_HEAD=1` never accepts foreign `lock_commit`.
- [ ] **AC-4 (PRIMARY)** E1-vs-bind negative is a disposable Git-backed **v5** fixture: valid package → attestation → lock, then alter **only** submitted gate-results bytes. Assert exits non-zero with explicit `C-2 blob OID identity FAIL: hist_oid=… sub_oid=…` (not solely “C-2 lock missing”).
- [ ] **AC-5** Trusted-HEAD authentic package still assert exit 0 with `hist_oid == sub_oid == attested_oid` (narrow PASS not regressed).
- [ ] **AC-6** `assert-human-test-verdict` does not weaken HEAD-lock OID bind or blob identity (dual transcripts on foreign-lock and v5-mismatch fixtures).
- [ ] **AC-7** RED baseline of residual at `fda9b9da` + disposition supersedes RH-S30-26 residual **for HEAD-lock OID bind and v5 E1-vs-bind oracle-reach only** under `.tmp/REDHAT-FIX-RH-S30-29/`.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Foreign `ASSERT_LOCK_COMMIT` under `ASSERT_PACKAGE_HEAD=1` exits ≠ 0 with HEAD-lock wording | AC-1 | `ac1-head-lock-*` |
| TC-2 | Green path `lock_oid == git rev-parse HEAD:<rel_lock>` | AC-1 | real git oracle |
| TC-3 | Package script unsets/forces `ASSERT_LOCK_COMMIT` to HEAD before assert | AC-2 | `ac2-package-env-audit.txt` |
| TC-4 | Test-only isolation of alternate lock commits | AC-3 | `ac3-foreign-lock-negative.txt` |
| TC-5 | Rewritten E1-vs-bind harness builds v5 lock chain then mutates submitted blob only | AC-4 | harness fixture log |
| TC-6 | Assert on mutated submitted emits `hist_oid≠sub_oid` identity FAIL (not lock-missing alone) | AC-4 | `ac4-e1-bind-v5-negative.txt` |
| TC-7 | Authentic trusted-HEAD package still `assert_rc=0` with `blob_identity_ok` | AC-5 | `ac5-happy-head.json` |
| TC-8 | human-test-verdict fails closed on same residual fixtures | AC-6 | `ac6-htv-*` |
| TC-9 | RED baselines + disposition present | AC-7 | `ac7-red-*` + `ac7-disposition.md` |
| TC-10 | Path-only HEAD lock existence is insufficient | AC-1 | source OID compare present |

## Anti-stub

- Path-only HEAD lock existence is **NOT** closed.
- v4 lock-missing reject is **NOT** proof of v5 `hist_oid≠sub_oid` control.
- Real git oracles only — no mocked git.
- Do not claim C-2 closed without **both** HEAD-lock OID bind **and** v5 E1-vs-bind reaching OID mismatch.
- Do not invent pass evidence or hand-edit SHAs as sole proof.
- Do not re-open C-3 product/PONR probes or M-3 inject oracles.
- Harness skip exit 0 is **NOT** a pass.

## Critical Constraints

- **MUST** when `ASSERT_PACKAGE_HEAD=1` require `lock_commit == HEAD` or `HEAD:<lock>` OID equals loaded `lock_oid`
- **MUST** package-safe-reset `ASSERT_LOCK_COMMIT` before assert
- **MUST** rewrite E1-vs-bind negative to disposable v5 fixture reaching `hist_oid≠sub_oid`
- **MUST** preserve trusted-HEAD normal path exit 0
- **MUST** not weaken `assert-human-test-verdict`
- **NEVER** treat path-only HEAD lock existence as closed
- **NEVER** treat v4 lock-missing as v5 OID-equality proof
- **STRICTLY** fail closed when loaded lock OID ≠ HEAD lock OID under `ASSERT_PACKAGE_HEAD=1`
- **STRICTLY** disposition supersedes RH-S30-26 residual for these two findings only

## Evidence

`.tmp/REDHAT-FIX-RH-S30-29/`

| Artifact | Proves |
|----------|--------|
| `ac1-head-lock-*` | Foreign lock / HEAD OID bind fail-closed |
| `ac2-package-env-audit.txt` | Package safe-reset |
| `ac3-foreign-lock-negative.txt` | Test-only isolation |
| `ac4-e1-bind-v5-negative.txt` + fixtures | v5 hist_oid≠sub_oid oracle |
| `ac5-happy-head.json` | Trusted-HEAD preserve |
| `ac6-htv-*` | human-verdict non-weakening |
| `ac7-red-*` / `ac7-disposition.md` | RED + supersession |

## Reading List

- Closeout C-2 sections @ fda9b9da — `.spec/reviews/red-hat-sprint-30-20260807T105114Z-independent-final-closeout.md:49-59`
- `REDHAT-FIX-RH-S30-26.md` — v5 protocol; residual = HEAD-lock OID + E1 oracle-reach
- `scripts/assert-gate-evidence-containment.sh:53-54,63-69,161-177,195-208`
- `scripts/package-sprint30-gate-evidence.sh:221-227`
- `scripts/assert-c2-e1-bind-mismatch-negative.sh:14-16,31-54,67-81`
- Package `20260807T103459Z` / lock `848f87cb`

## Design

- **Pattern:** (1) Resolve lock from `lock_commit` (default HEAD); when `ASSERT_PACKAGE_HEAD=1` require `lock_commit==HEAD` and/or `git rev-parse HEAD:<rel_lock> == lock_oid`; package unsets/forces `ASSERT_LOCK_COMMIT=HEAD`. (2) Negative: disposable real git commits for package/attestation/lock under C-2-atomic-v5, mutate only submitted results; assert must hit `hist_oid≠sub_oid`. Alternate lock commits only via test-only fixture with `ASSERT_PACKAGE_HEAD=0`.
- **Anti-pattern:** Path-only `cat-file -e HEAD:lock` while foreign `ASSERT_LOCK_COMMIT` loads a different lock blob; package path inheriting ambient `ASSERT_LOCK_COMMIT`; E1-vs-bind that forges v4 worktree attestation without a v5 lock so rejection is lock-missing only.

## Disposition

HIGH residual after C-2-atomic-v5 narrow-pass. Close HEAD-lock OID bind + v5 E1-vs-bind oracle-reach. Sprint 30 must not claim C-2 closed until dual-lens APPROVED on a landed SHA with **both** controls proven.

AGENT: implementer=devops-engineer | proposed_by=devops-engineer | technical-reviewer=code-reviewer | standing-test-reality=test-quality-reviewer  
planned_at: 2026-08-07T11:05:00Z  
finding_ids: [C-2, REDHAT-FIX-RH-S30-29, REDHAT-FIX-RH-S30-26]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-RH-S30-29",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "proposed_by": "devops-engineer",
  "agent": "devops-engineer",
  "touches_capabilities": ["CAP-CUT-01"],
  "fixtures": {
    "foreign_assert_lock_commit_with_head_lock_path": {
      "description": "ASSERT_LOCK_COMMIT non-HEAD while HEAD has lock path — path-only insufficient",
      "seed_method": "git"
    },
    "package_export_block_residual_221_227": {
      "description": "Package assert export without ASSERT_LOCK_COMMIT reset",
      "seed_method": "cli"
    },
    "disposable_v5_package_attestation_lock_then_mutate_submitted": {
      "description": "Git-backed v5 chain then mutate only submitted results",
      "seed_method": "git"
    },
    "fresh_package_20260807T103459Z_or_new_authentic_v5": {
      "description": "Trusted-HEAD happy path preserve",
      "seed_method": "git"
    },
    "residual_v4_e1_bind_20260807T095843Z": {
      "description": "RED-only: current negative fails at lock-missing",
      "seed_method": "recorded_external"
    }
  },
  "requirements": [
    {"id": "AC-1", "type": "acceptance_criterion", "description": "ASSERT_PACKAGE_HEAD binds loaded lock to HEAD lock blob OID", "verify": "foreign lock exit != 0; green lock_oid == HEAD:lock"},
    {"id": "AC-2", "type": "acceptance_criterion", "description": "Package safe-resets ASSERT_LOCK_COMMIT", "verify": "ac2-package-env-audit.txt"},
    {"id": "AC-3", "type": "acceptance_criterion", "description": "Alternate lock commits test-only", "verify": "ac3-foreign-lock-negative.txt"},
    {"id": "AC-4", "type": "acceptance_criterion", "description": "v5 E1-vs-bind reaches hist_oid!=sub_oid", "verify": "ac4-e1-bind-v5-negative.txt"},
    {"id": "AC-5", "type": "acceptance_criterion", "description": "Trusted-HEAD happy path preserved", "verify": "ac5-happy-head.json"},
    {"id": "AC-6", "type": "acceptance_criterion", "description": "human-test-verdict does not weaken", "verify": "ac6-htv-*"},
    {"id": "AC-7", "type": "acceptance_criterion", "description": "RED + disposition supersedes RH-S30-26 residual for these two findings", "verify": "ac7-*"},
    {"id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Foreign lock fails closed", "verify": "ac1-head-lock"},
    {"id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Green lock_oid equals HEAD", "verify": "git rev-parse"},
    {"id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Package resets ASSERT_LOCK_COMMIT", "verify": "rg package script"},
    {"id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "Test-only isolation", "verify": "ac3"},
    {"id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "v5 chain before mutation", "verify": "harness"},
    {"id": "TC-6", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "hist_oid!=sub_oid wording", "verify": "rg"},
    {"id": "TC-7", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "Happy path preserve", "verify": "ac5"},
    {"id": "TC-8", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "HTV non-weakening", "verify": "ac6"},
    {"id": "TC-9", "type": "test_criterion", "maps_to_ac": "AC-7", "description": "RED + disposition", "verify": "ac7"},
    {"id": "TC-10", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Path-only insufficient", "verify": "OID compare present"}
  ]
}
-->
