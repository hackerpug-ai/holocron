# REDHAT-FIX-RH-S30-30 — C-3 residual: distinct disposable marker DB; exact two PONR triggers; package-object-bound C-3 report blobs

> **Task ID:** REDHAT-FIX-RH-S30-30
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** CRITICAL (marker seed) / HIGH (triggers + package bind)
> **Source finding:** C-3 residual (1 CRITICAL + 2 HIGH)
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T105114Z-independent-final-closeout.md` (independent final closeout @ fda9b9da)
> **Proposed by:** `security-auditor`
> **TDD:** red_first · RED_GREEN_REQUIRED=yes · seeded_evidence=yes
> Status: Backlog — plan only (do not treat as fixed until dual-lens APPROVED + landed)

## Finding

**C-3 — three blocking residuals remain after RH-S30-27 status/exit binding.** Severity: **CRITICAL** (seed) + **HIGH** (triggers, package bind). Confidence: **HIGH**.

### What improved (RH-S30-27 partial)

- Intent to bind forced-marker-miss + non-owner to gate status/exit/package assert.
- Named required triggers and non-owner `holocron_app` as predicate surface.

### What remains broken (closeout @ fda9b9da / package `20260807T103459Z`)

1. **CRITICAL — marker-miss can permanently seed a non-disposable database.** Runner may fall back marker DB to `DATABASE_URL`, force `HOLO_PROBE_SEED_PONR=1`, and seed against gate/cutover. No durable disposable-target identity guard or production-target rejection as pass predicates.

2. **HIGH — accepts one required trigger as sufficient.** Producer/gate/package/assert may use `count >= 1` instead of exact names `data_plane_ponr_reject_mutation` **and** `data_plane_ponr_reject_truncate` with `tgenabled=='O'`. Missing truncate can erase PONR while C-3 closes green.

3. **HIGH — post-package check trusts mutable worktree files, not the package object.** Package commit is created first; C-3 reports are then read from worktree. v5 attestation binds gate-results (± verification) but **not** C-3 report blob OIDs. Substituted worktree report can green package without matching package `P1`.

**Required remediation:** Explicitly distinct validated disposable marker DB; reject production/cutover URLs and equality with gate URL; seed default **off**; prove production untouched; exact two trigger names before/after; one-trigger-missing negative; resolve C-3 reports from `package_commit:path`, bind blob IDs in attestation, containment compares committed bytes.

## Scope (WRITE-ALLOWED)

- `scripts/run-sprint30-human-gate.sh`
- `scripts/probe-ponr-role-immutability-negative-marker.sh`
- `scripts/probe-ponr-role-immutability.sh`
- `scripts/assert-human-test-verdict.sh`
- `scripts/package-sprint30-gate-evidence.sh`
- `scripts/assert-gate-evidence-containment.sh` (C-3 blob binding only)
- Optional `scripts/assert-c3-*-negative*.sh`
- `.tmp/REDHAT-FIX-RH-S30-30/**`
- Cross-link `REDHAT-FIX-RH-S30-27.md` disposition
- **Does not** re-open C-2 lock protocol beyond C-3 blob binding
- **Does not** re-open M-3 inject oracles

## Acceptance Criteria

- [ ] **AC-1 (PRIMARY, CRITICAL)** Explicitly distinct disposable marker DB: require set `HOLO_PROBE_MARKER_MISS_DATABASE_URL` (no silent fallback to `DATABASE_URL`); reject equality after URL normalization; reject production/cutover-like marker URLs; `HOLO_PROBE_SEED_PONR` default **0** (runner must not force `1`); seed only on disposable MARKER URL when explicit; record `production_untouched` (`gate_db_count_before == gate_db_count_after`) as pass predicate for ok/status/exit.
- [ ] **AC-2 (PRIMARY, HIGH)** Exact two trigger names enabled before **and** after: `data_plane_ponr_reject_mutation` + `data_plane_ponr_reject_truncate` with `tgenabled=='O'`; exact required-name set comparison; counts **== 2**; `count >= 1` alone **must fail** ok/status/package/assert.
- [ ] **AC-3** Real one-trigger-missing disposable negative (truncate XOR mutation absent/`tgenabled!='O'`) → exit ≠ 0, `ok!=true`; retained under `.tmp/REDHAT-FIX-RH-S30-30/`.
- [ ] **AC-4 (PRIMARY, HIGH)** C-3 reports resolved from `package_commit:path` via git; blob OIDs bound under `attestation.artifacts.c3-*` (ac1, ac2, negative-marker-report at minimum); substituted worktree report fails package post-check and/or `assert-gate-evidence-containment`.
- [ ] **AC-5** `ASSERT_C3_PREDICATES=1` requires full predicate surface: `ok`, `before_count>=1`, `effective_non_owner`, exact triggers before/after, counts==2, `urls_distinct`, `production_untouched` — not count≥1 alone. Residual count≥1-only fixtures **must fail**.
- [ ] **AC-6** RH-S30-27 status/exit binding retained and extended; RED baseline of three false-green classes at reviewed SHA; GREEN refuses residual fixtures; disposition supersedes RH-S30-27 residual for these three classes.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Unset marker URL fails closed (no DATABASE_URL fallback) | AC-1 | fixtures/unset-marker-url |
| TC-2 | Marker URL equal to gate (raw/normalized) rejected | AC-1 | fixtures/equal-marker-url |
| TC-3 | Production/cutover-like marker URL rejected | AC-1 | fixtures/prod-like-marker-url |
| TC-4 | Seed default off; empty disposable without explicit seed fails | AC-1 | fixtures/empty-disposable-seed-off |
| TC-5 | Explicit seed on disposable only; gate counts unchanged | AC-1 | production_untouched true |
| TC-6 | Both named required triggers enabled before/after (exact set) | AC-2 | jq counts==2 + names |
| TC-7 | Static audit: no count≥1 sole trigger oracle in runner/probe/package/assert | AC-2 | `ac2-static-audit.md` |
| TC-8 | Real one-trigger-missing disposable negative fails closed | AC-3 | `ac3-one-trigger-missing-negative.json` |
| TC-9 | C-3 reports package_commit-bound; blob OIDs in attestation c3-* | AC-4 | `ac4-c3-package-blob-bound.json` |
| TC-10 | Substituted worktree C-3 report fails package/containment | AC-4 | worktree-substituted fixture |
| TC-11 | Assert rejects count≥1-only; requires exact flags + urls_distinct + production_untouched | AC-5 | `ac5-assert-exact-predicates.json` |
| TC-12 | Package post-assert path fails when C-3 package predicates fail | AC-5 | package fixture |
| TC-13 | RED baseline documents three false-green classes | AC-6 | `red-c3-false-green-baseline.txt` |
| TC-14 | GREEN refuses residual fixtures; disposition supersedes RH-S30-27 residual | AC-6 | ac6 + ac7-disposition.md |
| TC-15 | RH-S30-27 status/exit + holocron_app non-regression | AC-6 | status/exit + seeded report |
| TC-16 | Containment compares attested c3-* blob_oid to package_commit:path | AC-4 | mismatch fixture exit ≠ 0 |

## Anti-stub

- Fallback `MARKER_DB=DATABASE_URL` is **NOT** closed.
- `count>=1` for triggers is **NOT** closed.
- Worktree-only C-3 post-package check is **NOT** package-bound.
- Production seed via `HOLO_PROBE_SEED_PONR=1` default on non-disposable is **NOT** closed.
- Soft default to a local URL that can equal gate URL without explicit distinct validation is **NOT** closed.
- Attestation notes text without `c3-*` blob_oid entries is **NOT** binding.
- Real disposable Postgres only — no mock psql / invented sole-pass reports.

## Critical Constraints

- **MUST** require explicitly distinct disposable `HOLO_PROBE_MARKER_MISS_DATABASE_URL`
- **MUST** reject production/cutover URLs and equality with gate `DATABASE_URL`
- **MUST** leave seeding off by default; seed only on disposable when explicit
- **MUST** require both exact trigger names with `tgenabled=='O'` before and after
- **MUST** bind C-3 report blob OIDs in attestation; resolve from `package_commit:path`
- **MUST** preserve RH-S30-27 status/exit binding with non-owner `holocron_app`
- **NEVER** force-seed production/gate; never count≥1 sole trigger oracle; never worktree-only package C-3 oracle
- **STRICTLY** process exit nonzero when marker-miss fails/skipped, URLs not distinct, production_untouched false, or exact triggers missing

## Evidence

`.tmp/REDHAT-FIX-RH-S30-30/`

| Artifact | Proves |
|----------|--------|
| `red-c3-false-green-baseline.txt` | AC-6 RED three classes |
| `ac1-disposable-marker-db.json` | AC-1 disposable + seed-off + production_untouched |
| `fixtures/unset-marker-url/**` | TC-1 |
| `fixtures/equal-marker-url/**` | TC-2 |
| `fixtures/prod-like-marker-url/**` | TC-3 |
| `fixtures/empty-disposable-seed-off/**` | TC-4 |
| `seeded-forced-miss/negative-marker-report.json` | AC-1/AC-2 positive real DB |
| `ac2-static-audit.md` | TC-7 |
| `ac3-one-trigger-missing-negative.json` | AC-3 |
| `ac4-c3-package-blob-bound.json` | AC-4 package object bind |
| `fixtures/worktree-substituted-c3-report/**` | TC-10 |
| `ac5-assert-exact-predicates.json` | AC-5 |
| `ac6-green-refuses.json` | AC-6 GREEN refusal |
| `ac7-disposition.md` | Supersedes RH-S30-27 residual for these classes |

## Reading List

- Closeout C-3 blocking findings @ fda9b9da — `.spec/reviews/red-hat-sprint-30-20260807T105114Z-independent-final-closeout.md:31-47`
- `REDHAT-FIX-RH-S30-27.md` — status/exit binding (build on; do not regress)
- `scripts/run-sprint30-human-gate.sh` — marker invocation + finalize
- `scripts/probe-ponr-role-immutability-negative-marker.sh` — seed + triggers + ok
- `scripts/package-sprint30-gate-evidence.sh:91-180` — package then C-3 / attestation
- `scripts/assert-human-test-verdict.sh` — ASSERT_C3_PREDICATES
- `scripts/assert-gate-evidence-containment.sh` — c3-* OID equality

## Design

- **Pattern:** Runner requires gate `DATABASE_URL` (never seeded by marker) **and** explicit distinct `HOLO_PROBE_MARKER_MISS_DATABASE_URL`; normalize+reject equality and prod-like; seed default 0. Marker probe seeds only MARKER_URL when seed==1; records gate counts; exact_triggers_ok requires both names `tgenabled=O`. Finalize/assert/package require exact flags and counts==2. After package_commit, `git show package:path` for ac1/ac2/marker-miss; bind OIDs into `artifacts.c3-*`; containment verifies package OID == attested OID. Retain one-trigger-missing real negative.
- **Anti-pattern:** `MARKER_DB=${HOLO_PROBE_MARKER_MISS_DATABASE_URL:-$DATABASE_URL}`; force seed 1; `count>=1`; `Path(EVID_DIR)` sole post-package oracle; attestation without c3-* OIDs.

## Disposition

Release-blocking CRITICAL + HIGH residual after RH-S30-27. Close disposable seed safety, exact dual-trigger set, and package-object-bound C-3 reports. Sprint 30 must not claim C-3 closed until dual-lens APPROVED on a landed SHA with all three residuals un-fakeable.

AGENT: implementer=devops-engineer | proposed_by=security-auditor | technical-reviewer=security-reviewer | standing-test-reality=test-quality-reviewer  
planned_at: 2026-08-07T11:05:00Z  
finding_ids: [C-3, REDHAT-FIX-RH-S30-30, REDHAT-FIX-RH-S30-27]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-RH-S30-30",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "proposed_by": "security-auditor",
  "agent": "devops-engineer",
  "touches_capabilities": ["CAP-CUT-01"],
  "required_trigger_names": [
    "data_plane_ponr_reject_mutation",
    "data_plane_ponr_reject_truncate"
  ],
  "required_app_role": "holocron_app",
  "required_marker_env": "HOLO_PROBE_MARKER_MISS_DATABASE_URL",
  "seed_default": 0,
  "fixtures": {
    "reviewed_sha_c3_false_green_baseline": {
      "description": "fda9b9da residual: MARKER fallback, SEED default 1, count>=1, worktree C-3, no c3 OIDs",
      "seed_method": "git"
    },
    "seeded_distinct_disposable_ponr_db": {
      "description": "Real disposable Postgres distinct from gate; both triggers O",
      "seed_method": "cli_real_postgres"
    },
    "one_trigger_missing_disposable_db": {
      "description": "Disposable with only one required trigger",
      "seed_method": "cli_real_postgres"
    },
    "worktree_substituted_c3_report": {
      "description": "Package honest C-3 blobs; worktree report replaced",
      "seed_method": "git_fixture"
    },
    "count_ge1_only_report_fixture": {
      "description": "count==1 without exact flags — assert must fail",
      "seed_method": "file_artifact"
    }
  },
  "requirements": [
    {"id": "AC-1", "type": "acceptance_criterion", "description": "Explicit distinct disposable marker DB; reject prod/cutover; seed default off; production_untouched", "verify": "ac1-disposable-marker-db.json"},
    {"id": "AC-2", "type": "acceptance_criterion", "description": "Exact two required trigger names enabled before/after; no count>=1 sole oracle", "verify": "seeded report + ac2-static-audit.md"},
    {"id": "AC-3", "type": "acceptance_criterion", "description": "Real one-trigger-missing negative fails closed", "verify": "ac3-one-trigger-missing-negative.json"},
    {"id": "AC-4", "type": "acceptance_criterion", "description": "C-3 reports package_commit-bound with attestation c3-* blob OIDs; worktree substitution rejected", "verify": "ac4-c3-package-blob-bound.json"},
    {"id": "AC-5", "type": "acceptance_criterion", "description": "assert/package require full exact C-3 predicate surface", "verify": "ac5-assert-exact-predicates.json"},
    {"id": "AC-6", "type": "acceptance_criterion", "description": "RED baseline + GREEN refuse + disposition supersedes RH-S30-27 residual for these classes", "verify": "red + ac6 + ac7-disposition.md"},
    {"id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Unset marker URL fail-closed", "verify": "fixtures/unset-marker-url"},
    {"id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Equal marker URL rejected", "verify": "fixtures/equal-marker-url"},
    {"id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Prod-like marker URL rejected", "verify": "fixtures/prod-like-marker-url"},
    {"id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Seed default off", "verify": "empty-disposable-seed-off"},
    {"id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Disposable seed leaves gate counts unchanged", "verify": "production_untouched"},
    {"id": "TC-6", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Both named triggers exact set", "verify": "jq required_trigger_names"},
    {"id": "TC-7", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Static no count>=1 sole oracle", "verify": "ac2-static-audit.md"},
    {"id": "TC-8", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "One-trigger-missing real negative", "verify": "ac3"},
    {"id": "TC-9", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "package_commit C-3 OID bind", "verify": "ac4"},
    {"id": "TC-10", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "Worktree substitution rejected", "verify": "fixtures/worktree-substituted"},
    {"id": "TC-11", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "Assert exact predicates", "verify": "ac5"},
    {"id": "TC-12", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "Package post-assert C-3 binding", "verify": "package fixture"},
    {"id": "TC-13", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "RED baseline three false-green classes", "verify": "red-c3-false-green-baseline.txt"},
    {"id": "TC-14", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "GREEN refuse + disposition", "verify": "ac6 + ac7"},
    {"id": "TC-15", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "RH-S30-27 binding + holocron_app retained", "verify": "status/exit + seeded report"},
    {"id": "TC-16", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "Containment c3 OID equality", "verify": "assert-gate-evidence-containment mismatch"}
  ]
}
-->
