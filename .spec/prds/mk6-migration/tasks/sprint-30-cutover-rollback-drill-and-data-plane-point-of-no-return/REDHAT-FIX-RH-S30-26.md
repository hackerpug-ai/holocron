# REDHAT-FIX-RH-S30-26 — C-2 residual: Git-object-bound attestation sidecar; required protocol/run_id/source; fail closed (C-2-atomic-v5)

> **Task ID:** REDHAT-FIX-RH-S30-26
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** HIGH
> **Source finding:** C-2 residual
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T102743Z-independent-final-closeout.md` (independent final closeout @ 5b86e4e)
> **Proposed by:** `devops-engineer`
> **TDD:** red_first · RED_GREEN_REQUIRED=yes · seeded_evidence=yes
> Status: Backlog — plan only (do not treat as fixed until dual-lens APPROVED + landed)

## Finding

**C-2 — the asserted identity is selected by a mutable, unauthenticated attestation sidecar.** Severity: **HIGH**. Confidence: **HIGH**.

### What works (narrow C-2-atomic-v4 pass)

Package `20260807T102120Z` is internally consistent: `hist_oid == sub_oid == attested_oid` (`e2cbe062…`); E1-vs-bind-tip negative rejects. RH-S30-23 closed exact result-blob identity once the sidecar is believed.

### What remains broken

1. `assert-gate-evidence-containment.sh:35-52` obtains `package_commit`, path, and blob OID from an arbitrary on-disk `evidence-attestation.json` in the **mutable worktree**.
2. It never resolves the attestation's own blob from the attestation commit (`a2121e22`) — nor does the attestation name its own committing object.
3. Optional HEAD test checks only the **result** blob, not the attestation blob.
4. `protocol` is not required; `attestation.run_id` is optional; missing submitted source values **bypass** source equality.
5. A substituted sidecar can select a different historical matching package/blob and replay it as the asserted evidence.

**Required remediation:** Anchor the attestation sidecar itself to an exact committed Git object; resolve its bytes from Git before consuming selector fields; require protocol / run_id / source; fail closed on mismatch. Preserve result-object equality and E1-vs-bind-tip negative. Protocol: **C-2-atomic-v5-git-bound-attestation**.

## Scope (WRITE-ALLOWED)

- `scripts/assert-gate-evidence-containment.sh`
- `scripts/assert-human-test-verdict.sh`
- `scripts/package-sprint30-gate-evidence.sh`
- `scripts/lib/gate-evidence-attestation.sh` (NEW if needed)
- `scripts/assert-c2-e1-bind-mismatch-negative.sh` / `scripts/assert-c2-*-negative*.sh`
- `.tmp/REDHAT-FIX-RH-S30-26/**`
- Sprint 30 gate artifacts under this sprint folder (real package only)
- Cross-link `REDHAT-FIX-RH-S30-23.md` disposition
- **Does not** invent pass evidence; only packages real runs
- **Does not** re-open product cutover/PONR/role-probe code

## Acceptance Criteria

- [ ] **AC-1 (PRIMARY)** Package emits non-circular Git-bound attestation lock under C-2-atomic-v5: after package_commit P1 (exact gate-results blob), commit attestation A1 naming P1+blob_oid (no change to results OID), commit lock L1 naming `attestation_commit`+`attestation_path`+`attestation_blob_oid`+`protocol` (starts with `C-2-atomic-v5`)+`run_id`+`source_sha_at_run`+`package_commit`. `attestation_blob_oid == git rev-parse A1:path`.
- [ ] **AC-2** Assert resolves attestation bytes from Git before consuming selector fields: load lock via `git show`; verify lock OID; load attestation exclusively via `git show <attestation_commit>:<path>`; only then read package_commit/path/blob_oid. Never use worktree `evidence-attestation.json` as sole source. Output `attestation_git_bound=true` when green. `assert-human-test-verdict` must not weaken this.
- [ ] **AC-3** Required protocol, run_id, source — fail closed: fixtures missing any of these exit non-zero with explicit field errors; empty source must NOT bypass equality (fixes reviewed `:54`, `:77-80`, `:81-85`).
- [ ] **AC-4** Substituted / mutable-only sidecar rejected: worktree sidecar selecting foreign historical package, or worktree-only sidecar with no Git lock, exit non-zero with C-2 lock/attestation binding wording.
- [ ] **AC-5** Preserve `hist_oid == sub_oid == attested_oid` and E1-vs-bind-tip negative (`scripts/assert-c2-e1-bind-mismatch-negative.sh`).
- [ ] **AC-6** `ASSERT_PACKAGE_HEAD` requires lock/attestation objects at HEAD — not result-blob self-compare alone.
- [ ] **AC-7** RED baseline of unauthenticated worktree sidecar residual + disposition supersedes RH-S30-23 residual **for attestation authentication only** under `.tmp/REDHAT-FIX-RH-S30-26/`.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Lock committed under C-2-atomic-v5 with attestation_commit + path + attestation_blob_oid OID-equal | AC-1 | `git show` + `rev-parse` |
| TC-2 | Assert loads lock from Git; attestation_git_bound true on green | AC-2 | `ac2-assert-git-bound.json` |
| TC-3 | human-test-verdict does not weaken v5 lock requirements | AC-2 | dual transcripts |
| TC-4 | Missing protocol → exit ≠ 0 | AC-3 | `ac3-missing-protocol-*` |
| TC-5 | Missing run_id → exit ≠ 0 (no longer optional) | AC-3 | `ac3-missing-run-id-*` |
| TC-6 | Missing source_sha_at_run → exit ≠ 0; empty-source bypass forbidden | AC-3 | `ac3-missing-source-*` |
| TC-7 | Substituted worktree sidecar rejected | AC-4 | `ac4-substituted-*` |
| TC-8 | Mutable-only sidecar without Git lock rejected | AC-4 | `ac4-mutable-only-*` |
| TC-9 | Authentic package still enforces hist_oid==sub_oid==attested_oid | AC-5 | `ac5-happy-blob-identity.json` |
| TC-10 | E1-vs-bind-tip negative preserved | AC-5 | `assert-c2-e1-bind-mismatch-negative.sh` |
| TC-11 | ASSERT_PACKAGE_HEAD verifies lock at HEAD | AC-6 | `ac6-head-lock.json` |
| TC-12 | RED baseline + disposition present | AC-7 | `ac7-red-*` + `ac7-disposition.md` |

## Anti-stub

- Mutable worktree `evidence-attestation.json` alone is **NOT** C-2 closed.
- Path-only / `cat-file -e` of result is **NOT** attestation authentication.
- HEAD result self-compare alone is **NOT** enough.
- Optional protocol / optional run_id / empty-source bypass is **NOT** fail-closed.
- Rehashing RH-S30-23 hist_oid==sub_oid without Git-binding the selector is **NOT** this task done.
- Real git oracles only (`rev-parse`, `cat-file`, `hash-object`, `show`) — no mocked git.
- Do not invent pass evidence or hand-edit SHAs as sole proof.
- Do not re-open product cutover/PONR/role-probe code.

## Critical Constraints

- **MUST** anchor attestation sidecar to exact committed Git object (lock/handoff) before consuming selector fields
- **MUST** resolve attestation bytes via real git show before field consumption
- **MUST** require protocol starting with C-2-atomic-v5, run_id, source_sha_at_run (40-hex)
- **MUST** preserve hist_oid==sub_oid and E1-vs-bind-tip negative
- **MUST** capture RED baseline under `.tmp/REDHAT-FIX-RH-S30-26/`
- **NEVER** trust worktree sidecar alone
- **STRICTLY** fail closed when lock missing, attestation OID mismatch, or substituted selector
- **STRICTLY** disposition supersedes RH-S30-23 residual for attestation authentication only

## Evidence

`.tmp/REDHAT-FIX-RH-S30-26/`

| Artifact | Proves |
|----------|--------|
| `ac1-lock.json` | AC-1 lock schema + real OIDs |
| `ac2-assert-git-bound.json` | AC-2 attestation_git_bound |
| `ac3-missing-{protocol,run-id,source}-*` | AC-3 required fields |
| `ac4-substituted-*` / `ac4-mutable-only-*` | AC-4 negatives |
| `fixtures/**` | Reproducible negatives |
| `ac5-happy-blob-identity.json` / `ac5-e1-bind-negative.txt` | AC-5 preserve |
| `ac6-head-lock.json` | AC-6 HEAD binds lock |
| `ac7-red-mutable-sidecar-baseline.txt` | AC-7 RED |
| `ac7-disposition.md` | Supersedes RH-S30-23 residual for auth |

## Reading List

- Closeout C-2 section @ 5b86e4e — `.spec/reviews/red-hat-sprint-30-20260807T102743Z-independent-final-closeout.md`
- `REDHAT-FIX-RH-S30-23.md` — blob identity narrow-pass; residual = selector auth
- `scripts/assert-gate-evidence-containment.sh` — worktree sidecar residual
- `scripts/package-sprint30-gate-evidence.sh` — emit lock + v5 protocol
- `scripts/assert-c2-e1-bind-mismatch-negative.sh` — preserve
- `.gate-evidence/20260807T102120Z/evidence-attestation.json` — audited v4 shape

## Design

- **Pattern:** Finalize results → commit exact blob as package_commit P1 → commit attestation A1 naming P1+blob_oid → commit lock L1 naming A1+path+attestation_blob_oid → assert resolves lock then attestation from Git, requires protocol/run_id/source, then hist_oid==sub_oid==attested_oid.
- **Anti-pattern:** Reading package_commit/path/blob_oid from mutable worktree evidence-attestation.json without authenticating that sidecar as a Git object (exact residual at `:35-52`).

## Disposition

Release-blocking HIGH residual after C-2-atomic-v4 blob identity narrow-pass. Implement C-2-atomic-v5-git-bound-attestation. Sprint 30 must not claim C-2 closed until dual-lens APPROVED on a landed SHA with Git-bound attestation proof.

AGENT: implementer=devops-engineer | technical-reviewer=code-reviewer | standing-test-reality=test-quality-reviewer  
planned_at: 2026-08-07T10:50:00Z  
finding_ids: [C-2, REDHAT-FIX-RH-S30-26, REDHAT-FIX-RH-S30-23]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-RH-S30-26",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "proposed_by": "devops-engineer",
  "touches_capabilities": ["CAP-CUT-01"],
  "fixtures": {
    "audited_v4_package_20260807T102120Z": {
      "description": "Package b9b30e91 / attestation a2121e22 / result e2cbe062 — hist_oid==sub_oid but selector worktree-trusted",
      "seed_method": "git"
    },
    "substituted_sidecar": { "description": "Worktree sidecar names foreign historical package", "seed_method": "cli" },
    "missing_protocol": { "description": "Attestation/lock omits protocol", "seed_method": "cli" },
    "missing_run_id": { "description": "Attestation omits run_id", "seed_method": "cli" },
    "missing_source": { "description": "Empty source_sha_at_run bypass residual", "seed_method": "cli" },
    "mutable_only_sidecar_without_git_object": { "description": "Worktree-only sidecar; no Git lock", "seed_method": "cli" },
    "e1_vs_bind_tip_pair": { "description": "Preserve RH-S30-23 E1-vs-bind-tip negative", "seed_method": "git" },
    "fresh_real_v5_gate_package": { "description": "New real package under C-2-atomic-v5", "seed_method": "cli" }
  },
  "requirements": [
    {"id": "AC-1", "type": "acceptance_criterion", "description": "Package emits Git-bound attestation lock under C-2-atomic-v5", "verify": "git show lock + rev-parse equality"},
    {"id": "AC-2", "type": "acceptance_criterion", "description": "Assert resolves attestation via git show before selector fields; attestation_git_bound true", "verify": "ac2-assert-git-bound.json"},
    {"id": "AC-3", "type": "acceptance_criterion", "description": "Required protocol/run_id/source fail closed", "verify": "ac3-missing-* exit != 0"},
    {"id": "AC-4", "type": "acceptance_criterion", "description": "Substituted and mutable-only sidecars rejected", "verify": "ac4-* exit != 0"},
    {"id": "AC-5", "type": "acceptance_criterion", "description": "Preserve hist_oid==sub_oid and E1-vs-bind-tip negative", "verify": "ac5 + assert-c2-e1-bind-mismatch-negative.sh"},
    {"id": "AC-6", "type": "acceptance_criterion", "description": "ASSERT_PACKAGE_HEAD binds lock at HEAD", "verify": "ac6-head-lock.json"},
    {"id": "AC-7", "type": "acceptance_criterion", "description": "RED + disposition supersedes RH-S30-23 residual for attestation auth", "verify": "ac7-*"},
    {"id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Lock schema + OID equality", "verify": "git show + rev-parse"},
    {"id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "attestation_git_bound true", "verify": "ac2-assert-git-bound.json"},
    {"id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "human-test-verdict does not weaken", "verify": "dual transcripts"},
    {"id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "Missing protocol fails", "verify": "ac3-missing-protocol"},
    {"id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "Missing run_id fails", "verify": "ac3-missing-run-id"},
    {"id": "TC-6", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "Missing source fails", "verify": "ac3-missing-source"},
    {"id": "TC-7", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "Substituted sidecar rejected", "verify": "ac4-substituted"},
    {"id": "TC-8", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "Mutable-only rejected", "verify": "ac4-mutable-only"},
    {"id": "TC-9", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "hist_oid==sub_oid preserved", "verify": "ac5-happy-blob-identity.json"},
    {"id": "TC-10", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "E1-vs-bind-tip preserved", "verify": "assert-c2-e1-bind-mismatch-negative.sh"},
    {"id": "TC-11", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "HEAD binds lock", "verify": "ac6-head-lock.json"},
    {"id": "TC-12", "type": "test_criterion", "maps_to_ac": "AC-7", "description": "RED + disposition", "verify": "ac7 files"}
  ]
}
-->
