# REDHAT-FIX-RH-S30-20 — Immutable evidence-blob identity binding for Sprint 30 gate package (C-2 residual)

> **Task ID:** REDHAT-FIX-RH-S30-20
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** CRITICAL
> **Source finding:** C-2 residual
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T094841Z-independent-final-closeout.md` (independent final closeout @ a0edfdd)
> **Proposed by:** `devops-engineer`
> Status: Backlog — plan only (do not treat as fixed until dual-lens APPROVED + landed)

## Finding

**C-2 residual — the asserted package binding is a false-green, not a fixed point.** Confidence: HIGH.

The run package's claimed `git_sha` is `52889af3…`, and `git cat-file -e 52889af3:<evidence-path>/gate-results.json` succeeds. But the object at that exact path has `git_sha` and `source_sha` equal to `a2db5b9d…`, with no `source_sha_at_run` or `package_sha`. The blob containing the claimed `52889af3…` binding is first committed by child `998f5dbd…`. The package script documents a two-commit protocol and acknowledges that the named tree's blob may still be pre-bind.

`scripts/assert-human-test-verdict.sh` accepts solely because the path exists in `52889af3`; it never reads that historical blob and compares it with the submitted results. Consequently an arbitrary later results file can claim an ancestor as `git_sha` as long as that ancestor happens to contain a path for the run.

RH-S30-17 closed path-containment only (`git cat-file -e`). This residual requires immutable, separately hashed attestation + blob-identity identity check. Supersedes residual of RH-S30-17 for C-2 closeout.

**Required remediation:** non-self-referential evidence model with an immutable, separately hashed/committed attestation that names both the source tree and the exact evidence blob(s); assertion must load the named commit's blob and require byte/hash/field identity. Mere `cat-file -e` is insufficient. Re-run the gate and package under the corrected contract.

## Scope (WRITE-ALLOWED)

- `scripts/package-sprint30-gate-evidence.sh`
- `scripts/assert-human-test-verdict.sh`
- `scripts/assert-gate-evidence-containment.sh`
- `scripts/run-sprint30-human-gate.sh`
- `scripts/lib/gate-evidence-blob-identity.sh` (NEW if needed)
- Sprint 30 gate artifacts under this sprint folder (`gate-results.json`, verification raw, `.gate-evidence/<runId>/`, optional `evidence-attestation.json`)
- Cross-link `REDHAT-FIX-RH-S30-17.md` / this task
- `.tmp/REDHAT-FIX-RH-S30-20/**`
- **Does not** invent pass evidence; only packages real runs
- **Does not** re-open product cutover/PONR code

## Acceptance Criteria

- [ ] **AC-1** Non-self-referential attestation: packaging emits a committed `evidence-attestation.json` (or equivalent sidecar) naming `source_sha_at_run`, `evidence_blob_sha` / git blob OIDs for critical artifacts (`gate-results.json` at minimum; verification raw + key step logs preferred), and `package_commit`. Does **not** require `gate-results` content-hash == containing commit (deadlock). Protocol documented as **C-2-atomic-v3** (or successor). Package script no longer treats pre-bind blob at named `git_sha` as acceptable.
- [ ] **AC-2** Assert loads named commit's blob: with `ASSERT_EVIDENCE_CONTAINMENT=1`, `assert-human-test-verdict.sh` and/or `assert-gate-evidence-containment.sh` resolve `hist_oid = git rev-parse <git_sha>:<path>` (or `git cat-file blob`) and `sub_oid = git hash-object -t blob <submitted>` and require `hist_oid == sub_oid` **or** field-level identity of historical JSON vs submitted (`git_sha`, `source_sha_at_run`/`source_sha`, `package_sha`, `run_id`, `verdict` + optional content hash). Path existence alone is insufficient for exit 0.
- [ ] **AC-3** Negative control — mismatched ancestor claim: a results file that claims `git_sha=52889af3…` (path exists) while submitted content/fields differ from the historical pre-bind blob MUST exit non-zero with an explicit C-2 blob-identity / attestation mismatch error (not only "path missing").
- [ ] **AC-4** Historical non-containing control retained: `09aae0dd` + run `20260807T091354Z` still fails assert with explicit C-2 containment error (no regression of RH-S30-17 negative control).
- [ ] **AC-5** Fresh real tip-bound gate package under the corrected contract: new `run_id`, packaged without hand-edited SHAs; `assert_rc=0`, `verify_rc=0`, `blob_identity_ok=true`; attestation present with real blob OIDs; `source_sha_at_run` preserved.
- [ ] **AC-6** Disposition supersedes RH-S30-17 residual for C-2; evidence package includes RED baseline (path-only false-green still greens pre-fix), negative controls, protocol note, and fresh package transcripts under `.tmp/REDHAT-FIX-RH-S30-20/`.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Package emits committed non-self-referential attestation with source_sha_at_run + evidence blob OIDs + package_commit | AC-1 | `rg` package script + `ac1-attestation-schema.md` |
| TC-2 | Assert loads historical blob OID/fields and requires identity with submitted results | AC-2 | `rg hash-object\|cat-file blob\|rev-parse` assert scripts |
| TC-3 | Mismatched ancestor claim (path exists, blob differs) fails assert with identity error | AC-3 | assert exit ≠ 0 + identity wording |
| TC-4 | Historical `09aae0dd` + `20260807T091354Z` still fails non-containing | AC-4 | assert exit ≠ 0 |
| TC-5 | Fresh real package: assert_rc=0, verify_rc=0, blob_identity_ok=true without hand-edited SHAs | AC-5 | `ac5-assert-and-verify-exit0.json` |
| TC-6 | For accepted package, `git rev-parse <git_sha>:<path>` equals `git hash-object -t blob` of submitted gate-results | AC-5 | `ac5-oid-equality.txt` |
| TC-7 | Package script no longer acknowledges pre-bind blob at named git_sha as OK without identity/attestation | AC-1 | protocol v3 md + script audit |
| TC-8 | Disposition supersedes RH-S30-17 residual; RED baseline of path-only false-green captured | AC-6 | `ac6-disposition.md` + red baseline |

## Anti-stub

- Do not accept mere `git cat-file -e` path existence as C-2 closed.
- Do not require gate-results content-hash == containing commit (self-referential deadlock).
- Do not hand-edit SHAs into historical packages as sole proof.
- Do not rebind `20260807T091354Z` / `20260807T094143Z` by rewriting SHAs in place as the sole closeout.
- Do not leave package script treating pre-bind blob at named `git_sha` as acceptable.
- Do not re-open product cutover/PONR/role-probe code.
- Do not claim `verify-gate-evidence` log recompute alone proves blob-identity binding.
- Real git oracles only (`rev-parse`, `cat-file blob`, `hash-object`) — no mocked git.

## Critical Constraints

- **MUST** establish non-self-referential attestation naming source tree + exact evidence blob OIDs
- **MUST** make assertion load named commit's blob and require byte/hash/field identity
- **MUST** reject ancestor-claim with path-exists but mismatched blob (52889af3 pre-bind class)
- **MUST** keep `09aae0dd` + `20260807T091354Z` as non-containing negative control
- **MUST** re-run fresh real human gate + package under corrected contract; no hand-edited SHAs
- **NEVER** accept path-only containment as C-2 closed
- **STRICTLY** fail closed when hist_oid ≠ sub_oid (or field identity fails) even if path exists
- **STRICTLY** document C-2-atomic-v3; v2 path-only is insufficient

## Evidence

`.tmp/REDHAT-FIX-RH-S30-20/`

| Artifact | Proves |
|----------|--------|
| `ac1-attestation-schema.md` | Non-self-referential attestation schema + protocol v3 |
| `ac2-red-path-only-false-green.txt` | RED baseline: pre-fix path-only assert greens false-green class |
| `ac2-assert-blob-identity.diff.txt` | Assert change introducing blob OID/field identity |
| `ac3-mismatched-ancestor-fail.txt` | Negative control: ancestor claim with mismatched blob fails |
| `ac3-atomic-protocol-v3.md` | C-2-atomic-v3 rules; supersedes pre-bind-OK v2 loophole |
| `ac4-negative-09aae0dd-containment-fail.txt` | Non-containing 09aae0dd still fails |
| `ac5-assert-and-verify-exit0.json` | Fresh package assert_rc=0 verify_rc=0 blob_identity_ok=true |
| `ac5-oid-equality.txt` | hist_oid == sub_oid for accepted package |
| `ac5-git-show-attestation.txt` | Committed attestation via git show/ls-tree |
| `ac6-disposition.md` | Supersedes RH-S30-17 residual for C-2 closeout |

## Reading List

- Closeout review C-2 section @ a0edfdd
- `REDHAT-FIX-RH-S30-17.md` — superseded residual (path containment / C-2-atomic-v2)
- `REDHAT-FIX-RH-S30-10.md` — original C-2 land
- `scripts/package-sprint30-gate-evidence.sh` — two-commit + pre-bind acknowledgment
- `scripts/assert-human-test-verdict.sh` — path-only containment
- `scripts/assert-gate-evidence-containment.sh`
- `.gate-evidence/20260807T094143Z/gate-results.json` — false-green package
- `.gate-evidence/20260807T091354Z/gate-results.json` — non-containing negative control

## Disposition

Release-blocking packaging+assertion residual reopening RH-S30-17. Implement non-self-referential attestation (C-2-atomic-v3), fail-closed blob-identity assert, negative controls for pre-bind false-green and non-containing binds, fresh real gate package under the corrected contract. Sprint 30 must not be marked complete until this task is dual-lens APPROVED on a landed containing SHA with blob identity.

AGENT: implementer=devops-engineer | technical-reviewer=code-reviewer | product-reviewer=product-manager
planned_at: 2026-08-07T10:01:05Z
finding_ids: [C-2, REDHAT-FIX-RH-S30-20, REDHAT-FIX-RH-S30-17, REDHAT-FIX-RH-S30-10]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-RH-S30-20",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "proposed_by": "devops-engineer",
  "touches_capabilities": ["CAP-CUT-01"],
  "requirements": [
    {"id": "AC-1", "type": "acceptance_criterion", "description": "Non-self-referential attestation with source_sha_at_run + evidence blob OIDs + package_commit (C-2-atomic-v3)"},
    {"id": "AC-2", "type": "acceptance_criterion", "description": "Assert loads named commit blob and requires OID/field identity with submitted results"},
    {"id": "AC-3", "type": "acceptance_criterion", "description": "Mismatched ancestor claim fails with blob-identity error"},
    {"id": "AC-4", "type": "acceptance_criterion", "description": "09aae0dd non-containing still fails"},
    {"id": "AC-5", "type": "acceptance_criterion", "description": "Fresh real package assert+verify green under blob-identity contract"},
    {"id": "AC-6", "type": "acceptance_criterion", "description": "Disposition supersedes RH-S30-17 residual with full evidence package"},
    {"id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Attestation schema + package emit real git OIDs"},
    {"id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Assert blob identity implementation present"},
    {"id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "Mismatched ancestor negative control"},
    {"id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "Non-containing 09aae0dd retained"},
    {"id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "Fresh package assert_rc=0 verify_rc=0 blob_identity_ok"},
    {"id": "TC-6", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "hist_oid equals sub_oid"},
    {"id": "TC-7", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Pre-bind-OK loophole removed"},
    {"id": "TC-8", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "Disposition + RED baseline"}
  ]
}
-->
