# REDHAT-FIX-RH-S30-33 — C-3 residual: exact two-trigger set oracle (no duplicates/extras) + bind raw D/O evidence per case

> **Task ID:** REDHAT-FIX-RH-S30-33
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** HIGH
> **Source finding:** C-3 residual (exact-trigger consumer oracle fakeable)
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T114032Z-eighth-independent-final-closeout.md` (eighth independent final closeout @ 9151324a)
> **Proposed by:** `security-auditor`
> **TDD:** red_first · RED_GREEN_REQUIRED=yes · seeded_evidence=yes
> Status: Implemented on tip package 20260807T115948Z — dual-lens independent re-review pending; Sprint In Progress
> **Branch:** implementer task branch; plan-only on main via orchestrator; unreviewed NEVER merges; merge only after dual-lens APPROVED via `kb-orchestrate` `references/merge-to-main.sh` (orchestrator-only)

## Finding

**C-3 — accepts duplicated trigger cases, so its exact-trigger proof is fakeable.** Severity: **HIGH**. Confidence: **HIGH**.

### What works (evidence only)

- Producer loop is correctly literal (`scripts/probe-ponr-one-trigger-missing-negative.sh:85-149`).
- Package `20260807T113518Z` raw cases show complementary D/O for both required triggers.
- Marker target operator-supplied / distinct / seed opt-in off remains PASS (out of scope to re-open).

### What remains broken

Release-relevant consumers test only `len(cases) == 2` plus `refused`/nonzero exit:

- `scripts/run-sprint30-human-gate.sh:522-531`
- `scripts/assert-human-test-verdict.sh:147-153`
- `scripts/package-sprint30-gate-evidence.sh:214-218`

A report containing **mutation twice** with `{refused:true, probe_rc:2}` satisfies that predicate while omitting truncate. Consumers do not enforce the exact set `{data_plane_ponr_reject_mutation, data_plane_ponr_reject_truncate}`, reject duplicates/extras, or bind raw `disable-<trigger>/exit.code` + complementary D/O stderr.

**Required remediation:** Require the exact set with no duplicates/extras in **producer, gate, package, and assertion**. Bind and inspect each raw `disable-<trigger>/exit.code` and `stderr.txt`, requiring that trigger `D` and the other `O`. Fresh package + negative duplicate-case assertion.

## Exact-set predicate semantics

```
REQUIRED = {data_plane_ponr_reject_mutation, data_plane_ponr_reject_truncate}
observed_disabled = multiset of cases[*].disabled_trigger
PASS iff:
  - sorted(unique(observed_disabled)) == sorted(REQUIRED)
  - len(cases) == 2
  - no duplicates
  - each case refused && probe_rc != 0
  - for each case, raw dir disable-<name>/exit.code is nonzero
  - for each case, stderr (or probe report) shows disabled trigger tgenabled D and the other O
```

`len(cases)==2` alone is **NOT** closed. Two mutation cases is **NOT** closed. Truncate-only is **NOT** closed.

## Scope (WRITE-ALLOWED)

- `scripts/probe-ponr-one-trigger-missing-negative.sh`
- `scripts/run-sprint30-human-gate.sh` (C-3 one-trigger predicate only)
- `scripts/assert-human-test-verdict.sh` (C-3 one-trigger predicate only)
- `scripts/package-sprint30-gate-evidence.sh` (C-3 one-trigger predicate only)
- Optional `scripts/assert-c3-exact-trigger-set-negative.sh` (NEW)
- Optional `scripts/lib/c3-exact-trigger-set.py` or shared helper (NEW)
- `.tmp/REDHAT-FIX-RH-S30-33/**`
- Cross-link `REDHAT-FIX-RH-S30-30.md` / `REDHAT-FIX-RH-S30-32.md` disposition
- **Does not** re-open C-2 HEAD coverage or M-3 vitest capture
- **Does not** invent sole-pass reports; real disposable Postgres only

## Acceptance Criteria

- [ ] **AC-1 (PRIMARY)** Exact set predicate in producer + gate + package + assert: `REQUIRED={data_plane_ponr_reject_mutation, data_plane_ponr_reject_truncate}`; PASS iff unique set equals REQUIRED, `len(cases)==2`, no duplicates, each `refused && probe_rc!=0`. `len(cases)==2` alone is **not** closed.
- [ ] **AC-2** Bind raw `ponr-one-trigger-missing/disable-<trigger>/exit.code` (nonzero) and `stderr.txt` (or probe report) proving complementary tgenabled **D** (disabled) and **O** (other) per case. Report-only `refused` without raw bind is **not** closed.
- [ ] **AC-3** Negative duplicate-case fixture (mutation×2 and/or wrong-set/extras) **must fail** gate, assert, and package one-trigger predicates. Optional `assert-c3-exact-trigger-set-negative.sh`.
- [ ] **AC-4** Positive path still green on honest exact-set evidence (113518Z-shaped or fresh live producer against disposable marker DB).
- [ ] **AC-5** RED baseline at residual consumers (len==2-only hole) + disposition supersedes RH-S30-30 residual **for exact-set consumer oracle only** (not disposable-marker/seed or package-blob OID classes); cross-link RH-S30-32.
- [ ] **AC-6** Branch discipline: implementer task branch; unreviewed NEVER merges; merge only after dual-lens APPROVED via `kb-orchestrate` `references/merge-to-main.sh` (orchestrator-only). Fresh package `run_id ≠ 20260807T113518Z` under strengthened oracle.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Gate rejects mutation×2 report | AC-1 | `ac1-exact-set-predicate.json` |
| TC-2 | Assert + package reject mutation×2 | AC-1 | `ac3-duplicate-case-fails.json` |
| TC-3 | Producer enforces exact unique REQUIRED multiset | AC-1 | producer + static audit |
| TC-4 | Raw `exit.code` nonzero for each REQUIRED name | AC-2 | `ac2-raw-do-bind.json` |
| TC-5 | Complementary D/O per case (disabled=D, other=O) | AC-2 | `ac2-raw-do-bind.json` |
| TC-6 | Duplicate fixture fails all three consumers | AC-3 | ac3 |
| TC-7 | Honest exact-set remains green | AC-4 | `ac4-positive-exact-set-green.json` |
| TC-8 | RED baseline + scoped disposition | AC-5 | red + `ac5-disposition.md` |
| TC-9 | Branch discipline + fresh package | AC-6 | `ac6-fresh-package-summary.json` |
| TC-10 | Static: no sole `len(cases)==2` oracle without exact set | AC-1 | `ac1-exact-set-static-audit.md` |

## Anti-stub

- `len(cases)==2` alone is **NOT** closed.
- Two identical `disabled_trigger` values (mutation×2) is **NOT** closed.
- Truncate-only or mutation-only case lists are **NOT** closed.
- `required_triggers` array text without multiset equality is **NOT** closed.
- Report-only `ok:true` without raw `exit.code` + D/O bind is **NOT** closed.
- Invented sole-pass reports without real disposable Postgres are **NOT** closed.
- Do not re-open C-2 HEAD coverage or M-3 vitest capture under this task.

## Critical Constraints

- **MUST** enforce exact-set in producer, gate, package, and assert
- **MUST** bind raw `disable-<trigger>/exit.code` + complementary D/O stderr per case
- **MUST** fail closed on duplicate/wrong-set fixtures
- **MUST** keep honest exact-set path green; capture RED before GREEN
- **MUST** work on implementer branch; merge only after dual-lens APPROVED (orchestrator-only)
- **MUST** produce fresh package after fix lands
- **NEVER** treat `len(cases)==2` as closed; never invent sole-pass reports
- **NEVER** re-open C-2/M-3 product scope
- **STRICTLY** disposition supersedes RH-S30-30 residual for exact-set consumer oracle only
- **STRICTLY** CAP-CUT-01 PONR dual-trigger integrity remains protected

## Evidence

`.tmp/REDHAT-FIX-RH-S30-33/`

| Artifact | Proves |
|----------|--------|
| `red-c3-exact-set-false-green-baseline.txt` | AC-5 RED residual |
| `ac1-exact-set-predicate.json` + `ac1-exact-set-static-audit.md` | AC-1 |
| `ac2-raw-do-bind.json` | AC-2 |
| `fixtures/duplicate-mutation-cases/**` | AC-3 |
| `fixtures/wrong-set-cases/**` | AC-3 |
| `fixtures/raw-bind-fail/**` | AC-2 negative |
| `ac3-duplicate-case-fails.json` | AC-3 |
| `ac4-positive-exact-set-green.json` | AC-4 |
| `ac5-disposition.md` | AC-5 supersession |
| `ac6-branch-and-fresh-package.md` + `ac6-fresh-package-summary.json` | AC-6 |

## Reading List

- Closeout C-3 HIGH @ 9151324a — `.spec/reviews/red-hat-sprint-30-20260807T114032Z-eighth-independent-final-closeout.md:31-35`
- `scripts/probe-ponr-one-trigger-missing-negative.sh:85-149` — producer loop
- `scripts/run-sprint30-human-gate.sh:522-531` — residual len==2 consumer
- `scripts/assert-human-test-verdict.sh:147-153` — residual len==2 consumer
- `scripts/package-sprint30-gate-evidence.sh:214-218` — residual len==2 consumer
- Package raw D/O: `.gate-evidence/20260807T113518Z/ponr-one-trigger-missing/disable-*/{exit.code,stderr.txt}`
- `REDHAT-FIX-RH-S30-30.md` — prior C-3 residual (supersede exact-set consumer class only)
- `REDHAT-FIX-RH-S30-32.md` — package 113518Z shape

## Design

- **Pattern:** Shared exact-set oracle (prefer `scripts/lib/c3-exact-trigger-set.py`) evaluating report JSON + evidence root: REQUIRED set equality, no dupes, refused/nonzero, raw exit nonzero, complementary D/O. Wire into producer success, gate `c3_one_trigger_missing_ok`, assert C-3 block, package `one_trigger_missing` block. Negative harness for mutation×2/wrong-set/raw-bind-fail. RED first; GREEN; fresh package on real disposable marker DB.
- **Anti-pattern:** `if len(cases)==2 and all(refused): ok=True`; accepting mutation×2; ignoring `disable-*/exit.code`; inventing report ok without disposable DB.

## Disposition

Release-blocking HIGH residual after RH-S30-30/32: producer and package evidence are honest, but release consumers only test `len(cases)==2`. Close exact-set + raw D/O bind across producer/gate/package/assert. Supersedes RH-S30-30 residual for **exact-set consumer oracle only**. Sprint 30 remains **In Progress** until dual-lens APPROVED on a landed SHA with a fresh package under the strengthened oracle.

AGENT: implementer=devops-engineer | proposed_by=security-auditor | technical-reviewer=security-reviewer | standing-test-reality=test-quality-reviewer  
planned_at: 2026-08-07T12:15:00Z  
finding_ids: [C-3, REDHAT-FIX-RH-S30-33, REDHAT-FIX-RH-S30-30, REDHAT-FIX-RH-S30-32]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-RH-S30-33",
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
  "branch_discipline": "implementer task branch; merge only after dual-lens APPROVED via kb-orchestrate references/merge-to-main.sh",
  "fixtures": {
    "residual_len_eq2_only_consumers_reviewed_tip_9151324a": {
      "description": "Consumers accept any two refused/nonzero cases",
      "seed_method": "git"
    },
    "package_20260807T113518Z_honest_exact_set": {
      "description": "Honest package report + raw D/O dirs",
      "seed_method": "git"
    },
    "fixture_duplicate_mutation_cases": {
      "description": "mutation×2 refused — must fail after fix",
      "seed_method": "file_artifact"
    },
    "fixture_wrong_set_or_extras": {
      "description": "truncate-only / extras — must fail",
      "seed_method": "file_artifact"
    },
    "seeded_distinct_disposable_ponr_db": {
      "description": "Real disposable Postgres for live producer",
      "seed_method": "cli_real_postgres"
    }
  },
  "requirements": [
    {"id": "AC-1", "type": "acceptance_criterion", "description": "Exact set predicate in producer+gate+package+assert; not len==2 alone", "verify": "ac1-exact-set-predicate.json + static audit"},
    {"id": "AC-2", "type": "acceptance_criterion", "description": "Raw exit.code + complementary D/O bind per case", "verify": "ac2-raw-do-bind.json"},
    {"id": "AC-3", "type": "acceptance_criterion", "description": "Duplicate-case fixture fails gate/assert/package", "verify": "ac3-duplicate-case-fails.json"},
    {"id": "AC-4", "type": "acceptance_criterion", "description": "Honest exact-set remains green", "verify": "ac4-positive-exact-set-green.json"},
    {"id": "AC-5", "type": "acceptance_criterion", "description": "RED + disposition supersedes RH-S30-30 exact-set consumer residual only", "verify": "red + ac5-disposition.md"},
    {"id": "AC-6", "type": "acceptance_criterion", "description": "Branch discipline + fresh package after fix", "verify": "ac6-fresh-package-summary.json"},
    {"id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Gate rejects mutation×2", "verify": "ac1"},
    {"id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Assert+package reject mutation×2", "verify": "ac3"},
    {"id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Producer enforces exact set", "verify": "producer_enforces_exact_set"},
    {"id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "exit.code nonzero bind", "verify": "ac2"},
    {"id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Complementary D/O", "verify": "ac2"},
    {"id": "TC-6", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "Duplicate fails all consumers", "verify": "ac3"},
    {"id": "TC-7", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "Honest green", "verify": "ac4"},
    {"id": "TC-8", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "RED + disposition", "verify": "ac5"},
    {"id": "TC-9", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "Branch + fresh package", "verify": "ac6"},
    {"id": "TC-10", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Static no sole len==2", "verify": "static audit"}
  ]
}
-->
