# REDHAT-FIX-RH-S30-31 — M-3 residual: fail-closed package-bound m3-identity with durable RED/GREEN/mutation + assert

> **Task ID:** REDHAT-FIX-RH-S30-31
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `mastra-implementer`
> **Priority:** P1
> **Type:** FIX
> **Severity:** MEDIUM
> **Source finding:** M-3 residual
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T105114Z-independent-final-closeout.md` (independent final closeout @ fda9b9da)
> **Proposed by:** `mastra-planner`
> **TDD:** red_first · RED_GREEN_REQUIRED=yes · seeded_evidence=yes
> Status: Backlog — plan only (do not treat as fixed until dual-lens APPROVED + landed + durable package evidence present)

## Finding

**M-3 — package retains GREEN + branch records but misses fail-closed m3-identity control and durable RED/mutation evidence.** Severity: **MEDIUM**. Confidence: **HIGH**.

### What works (source / package partial)

- Package `dd45328e` / run `20260807T103459Z` contains three branch records, six-test GREEN transcript, branch map; reselect triple equality holds in retained records.
- Source independent HTTP-201 capture (RH-S30-25) remains PASS — **do not re-implement**.

### What remains broken

1. `package-sprint30-gate-evidence.sh:52-58` retains m3-branch-identity only if ignored `.tmp` exists and suppresses copy errors (`|| true`).
2. `assert-human-test-verdict.sh:130-146` skips M-3 when directory absent and otherwise tests only four filenames.
3. No `assert-m3-identity-evidence.sh`, real RED vitest FAIL transcript, mutation log, manifest, or M-3 assertion result as auditable package control.
4. Prose RED residual note without vitest FAIL is **not** red evidence; `.tmp`-only is not durable.

**Required remediation:** Fail-closed package staging of `m3-identity/`; committed/package-bound real RED log, GREEN suite log, three branch artifacts + map, mutation-failure evidence, `manifest.json`; `assert-m3-identity-evidence.sh`; package + human-test-verdict require complete set.

## Scope (WRITE-ALLOWED)

- `services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts` (emission hooks only if needed — **not** re-opening oracle logic)
- `scripts/package-sprint30-gate-evidence.sh` (fail-closed m3-identity staging)
- `scripts/assert-m3-identity-evidence.sh` (NEW)
- Optional `scripts/promote-m3-identity-evidence.sh` (NEW)
- `scripts/assert-human-test-verdict.sh` (M-3 required; no skip-when-absent)
- Optional `scripts/run-sprint30-human-gate.sh` (stage m3-identity fail-closed only)
- `.gate-evidence/{run_id}/m3-identity/**` (package-bound)
- Optional `.spec/evidence/sprint-30/m3-identity/**` (committed mirror)
- `.tmp/REDHAT-FIX-RH-S30-31/**` (WIP only — not success alone)
- Cross-link `REDHAT-FIX-RH-S30-28.md` disposition
- **Does not** invent evidence; re-open C-2/C-3 product; weaken `allowFileFallback:false`

## Acceptance Criteria

- [ ] **AC-1 (PRIMARY)** Package-bound `m3-identity` tree fail-closed: stages `.gate-evidence/{run_id}/m3-identity/` with required file set; exits non-zero if any required file missing. Optional `|| true` copy from `.tmp` is **not** closed. `m3-branch-identity` alone is **not** sufficient.
- [ ] **AC-2** Real RED transcript retained durably under package path (`red-m3-identity-oracle-fail.log` with vitest FAIL/AssertionError signature) — not prose-only / not `.tmp`-only.
- [ ] **AC-3** Real GREEN focused suite transcript (`suite-vitest.log` / `green-m3-identity-oracle-pass.log`, Tests 6 passed exit 0) under durable m3-identity.
- [ ] **AC-4** Per-branch identity artifacts for `non_201_accepted_id`, `transport_error`, `reselect_miss` + `branch-oracle-map.md`. Reselect requires `independentHttp201Id === report_write_row_id`, in `writeIds`/`dbIds`, `!== reselectProbeId`.
- [ ] **AC-5** `scripts/assert-m3-identity-evidence.sh` exits 0 only on package-bound complete trees; exits non-zero for `.tmp`-only, five-step-only packages (e.g. `20260807T102120Z`), and incomplete residual package shape (e.g. `20260807T103459Z` until re-packaged complete).
- [ ] **AC-6** Isolated mutation probe: weaken independent identity oracle → suite FAIL log retained durably → restore; no weakened oracle in commit.
- [ ] **AC-7** `assert-human-test-verdict` + package require complete m3-identity set + `manifest.json` (sha256 per file); no skip-when-absent; four-filename optional check is **not** closed.
- [ ] **AC-8** RH-S30-05 + independent 201 oracle regression still green; `allowFileFallback:false` retained.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Package-bound m3-identity dir exists under `.gate-evidence/{run_id}/` | AC-1 | `ls -d .../m3-identity` |
| TC-2 | package script exits non-zero when m3-identity incomplete | AC-1 | rg fail-closed; no `\|\| true` sole path |
| TC-3 | Durable RED log has vitest FAIL signature | AC-2 | `red-m3-identity-oracle-fail.log` |
| TC-4 | Durable suite-vitest.log records 6 passed | AC-3 | suite log |
| TC-5 | non-201 identity JSON present | AC-4 | file exists |
| TC-6 | transport identity JSON present | AC-4 | file exists |
| TC-7 | reselect identity JSON triple equality | AC-4 | python assert |
| TC-8 | branch-oracle-map.md present | AC-4 | file exists |
| TC-9 | assert-m3-identity-evidence.sh exit 0 on package path | AC-5 | assert script |
| TC-10 | assert exit ≠ 0 on .tmp-only | AC-5 | `.tmp/REDHAT-FIX-RH-S30-22` |
| TC-11 | assert exit ≠ 0 on five-step-only package | AC-5 | `20260807T102120Z` |
| TC-12 | assert rejects incomplete 103459Z residual until complete re-package | AC-5 | `20260807T103459Z` |
| TC-13 | mutation probe log has FAIL | AC-6 | mutation log |
| TC-14 | independentHttp201Id still in source after restore | AC-6 | rg |
| TC-15 | Focused suite exit 0 including RH-S30-05 | AC-8 | vitest |
| TC-16 | allowFileFallback:false retained | AC-8 | rg |
| TC-17 | manifest.json with sha256 entries under package m3-identity | AC-7 | jq |
| TC-18 | assert-human-test-verdict fails when m3-identity absent | AC-7 | ASSERT_C3_PREDICATES=1 |
| TC-19 | git tracks package-bound m3-identity artifacts | AC-1 | `git ls-files` |

## Anti-stub

- `.tmp`-only GREEN is **NOT** durable / **NOT** M-3 closed.
- Hand-written identity JSON without suite log is **NOT** pass.
- Package with only five step logs is **NOT** M-3 closed.
- Prose RED residual note without vitest FAIL is **NOT** red evidence.
- Optional package copy without fail-closed required files is **NOT** package binding.
- Four-filename `m3-branch-identity` check with skip-when-absent is **NOT** M-3 closed.
- Package calling missing `assert-m3-identity-evidence.sh` or swallowing failure is **NOT** closed.
- Do not invent evidence; do not re-open C-2/C-3 product under this task.
- Do not re-implement independent 201 capture (source PASS).

## Critical Constraints

- **MUST** bind real RED + GREEN + three-branch identities + mutation probe + manifest to package path under `.gate-evidence/{run_id}/m3-identity/`
- **MUST** make package script fail closed when M-3 artifacts missing
- **MUST** produce evidence only via real PLATFORM_IT suite runs
- **MUST** keep RH-S30-05 + independent 201 oracle + allowFileFallback:false
- **NEVER** claim M-3 closed with `.tmp`-only evidence
- **NEVER** invent RED/GREEN or hand-write identity JSON as suite substitute
- **STRICTLY** success_state requires package-bound and/or git-tracked copies; WIP `.tmp` alone fails
- **STRICTLY** disposition supersedes RH-S30-28 residual for durable/package-bound evidence only

## Evidence

**Durable (success):** `.gate-evidence/{run_id}/m3-identity/`  
**WIP only:** `.tmp/REDHAT-FIX-RH-S30-31/`  
**Optional mirror:** `.spec/evidence/sprint-30/m3-identity/`

| Artifact | Proves |
|----------|--------|
| `red-m3-identity-oracle-fail.log` | AC-2 real RED |
| `green-m3-identity-oracle-pass.log` / `suite-vitest.log` | AC-3 GREEN |
| `non-201-accepted-id-enable-writes.json` | AC-4 |
| `transport-error-enable-writes.json` | AC-4 |
| `reselect-miss-identity.json` | AC-4 independent triple equality |
| `branch-oracle-map.md` | AC-4 |
| `mutation-probe-weaken-identity-oracle.log` | AC-6 |
| `rh-s30-05-still-green.txt` | AC-8 |
| `manifest.json` | AC-7 run_id + source binding |
| `assert-m3-identity-evidence.json` | AC-5 |

## Reading List

- Closeout M-3 section @ fda9b9da — `.spec/reviews/red-hat-sprint-30-20260807T105114Z-independent-final-closeout.md`
- `REDHAT-FIX-RH-S30-28.md:49-55` — fail-closed m3-identity contract residual
- `REDHAT-FIX-RH-S30-25.md` — independent capture source PASS
- `services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts:395-540` — source oracles (do not re-open)
- `scripts/package-sprint30-gate-evidence.sh:52-58` — optional M3 copy residual
- `scripts/assert-human-test-verdict.sh:130-146` — skip-when-absent residual
- `.gitignore` — `.tmp/` ignored

## Design

- **Pattern:** Suite emit → promote to `.gate-evidence/{run_id}/m3-identity/` → package requires complete file set (fail-closed) → `manifest.json` (sha256) → `assert-m3-identity-evidence.sh` validates package-bound completeness + reselect fields → human-test-verdict requires M-3 (no skip). Mutation: disposable weaken → FAIL log → restore → GREEN.
- **Anti-pattern:** Optional `cp -R .tmp → package || true`; prose-only RED; five-step-only package claimed as M-3 closed; four-filename optional check; re-writing independent 201 capture as if source still FAIL.

## Disposition

MEDIUM residual after RH-S30-28 package-bound intent. Close with fail-closed package-bound durable RED/GREEN + three-branch identity + mutation + manifest + assert. Sprint 30 must not claim M-3 closed until dual-lens APPROVED on a landed SHA with package-bound evidence (not `.tmp` alone). Does **not** close C-2/C-3 residuals from the same closeout.

AGENT: implementer=mastra-implementer | proposed_by=mastra-planner | technical-reviewer=mastra-reviewer | standing-test-reality=test-quality-reviewer  
planned_at: 2026-08-07T11:05:00Z  
finding_ids: [M-3, REDHAT-FIX-RH-S30-31, REDHAT-FIX-RH-S30-28, REDHAT-FIX-RH-S30-25, REDHAT-FIX-RH-S30-22]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-RH-S30-31",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "proposed_by": "mastra-planner",
  "agent": "mastra-implementer",
  "touches_capabilities": ["CAP-CUT-01"],
  "fixtures": {
    "platform_it_disposable": {
      "description": "PLATFORM_IT=1 real Postgres + live Hono enable-writes",
      "seed_method": "cli"
    },
    "package_run_binding": {
      "description": "Sprint-30 .gate-evidence/{run_id}/m3-identity package-bound tree",
      "seed_method": "package_script"
    },
    "m3_identity_artifact_set": {
      "description": "Required RED/GREEN/three-branch/mutation/manifest set",
      "seed_method": "suite_emit_then_promote"
    },
    "negative_tmp_only": {
      "description": ".tmp/REDHAT-FIX-RH-S30-22 must be rejected",
      "seed_method": "existing_wip"
    },
    "negative_five_step_only_package": {
      "description": "20260807T102120Z five-step-only",
      "seed_method": "historical_package"
    },
    "negative_incomplete_fresh_package": {
      "description": "20260807T103459Z m3-branch-identity only — incomplete residual",
      "seed_method": "historical_package"
    }
  },
  "requirements": [
    {"id": "AC-1", "type": "acceptance_criterion", "description": "Package fail-closed binds complete m3-identity under .gate-evidence", "verify": "assert-m3-identity-evidence.sh on package path"},
    {"id": "AC-2", "type": "acceptance_criterion", "description": "Real RED suite transcript under durable m3-identity", "verify": "red-m3-identity-oracle-fail.log"},
    {"id": "AC-3", "type": "acceptance_criterion", "description": "Real GREEN focused suite transcript under durable m3-identity", "verify": "suite-vitest.log"},
    {"id": "AC-4", "type": "acceptance_criterion", "description": "Per-branch identity artifacts for all three inject kinds", "verify": "three JSON + branch-oracle-map.md"},
    {"id": "AC-5", "type": "acceptance_criterion", "description": "assert accepts package path; rejects .tmp-only and five-step-only", "verify": "assert-m3-identity-evidence.sh dual path"},
    {"id": "AC-6", "type": "acceptance_criterion", "description": "Isolated mutation probe durable FAIL log; oracle restored", "verify": "mutation-probe-weaken-identity-oracle.log"},
    {"id": "AC-7", "type": "acceptance_criterion", "description": "assert-human-test-verdict + package require complete m3-identity + manifest; no skip-when-absent", "verify": "assert-human-test-verdict + manifest.json"},
    {"id": "AC-8", "type": "acceptance_criterion", "description": "RH-S30-05 + independent 201 regression green; allowFileFallback:false", "verify": "PLATFORM_IT vitest + rg"},
    {"id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Package-bound m3-identity dir exists", "verify": "ls m3-identity"},
    {"id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Package script fail-closed on missing m3-identity", "verify": "rg package script"},
    {"id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Durable RED has FAIL signature", "verify": "rg FAIL red log"},
    {"id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "Durable suite log shows passes", "verify": "rg passed suite log"},
    {"id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "non_201 identity JSON present", "verify": "file exists"},
    {"id": "TC-6", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "transport identity JSON present", "verify": "file exists"},
    {"id": "TC-7", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "reselect triple equality fields", "verify": "python assert"},
    {"id": "TC-8", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "branch-oracle-map present", "verify": "file exists"},
    {"id": "TC-9", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "assert exit 0 on package", "verify": "assert script"},
    {"id": "TC-10", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "assert exit nonzero .tmp-only", "verify": "assert .tmp"},
    {"id": "TC-11", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "assert exit nonzero five-step-only", "verify": "assert 102120Z"},
    {"id": "TC-12", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "assert rejects incomplete 103459Z residual shape", "verify": "assert 103459Z"},
    {"id": "TC-13", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "mutation log has FAIL", "verify": "mutation log"},
    {"id": "TC-14", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "independentHttp201Id still in source", "verify": "rg"},
    {"id": "TC-15", "type": "test_criterion", "maps_to_ac": "AC-8", "description": "focused suite exit 0", "verify": "vitest"},
    {"id": "TC-16", "type": "test_criterion", "maps_to_ac": "AC-8", "description": "allowFileFallback:false retained", "verify": "rg"},
    {"id": "TC-17", "type": "test_criterion", "maps_to_ac": "AC-7", "description": "manifest.json package-bound", "verify": "jq"},
    {"id": "TC-18", "type": "test_criterion", "maps_to_ac": "AC-7", "description": "verdict no skip when m3-identity absent", "verify": "assert-human-test-verdict"},
    {"id": "TC-19", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "git tracks m3-identity", "verify": "git ls-files"}
  ]
}
-->
