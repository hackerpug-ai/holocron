# REDHAT-FIX-RH-S30-23 — C-2 residual: reject E1-vs-bind-tip substitution; immutable commit+blob-OID attestation (C-2-atomic-v4)

> **Task ID:** REDHAT-FIX-RH-S30-23
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** CRITICAL
> **Source finding:** C-2 residual
> **Source:** `.spec/reviews/red-hat-sprint-30-20260807T101142Z-independent-final-closeout.md` (independent final closeout @ fe79d37)
> **Proposed by:** `devops-engineer`
> **TDD:** red_first · RED_GREEN_REQUIRED=yes · seeded_evidence=yes
> Status: Backlog — plan only (do not treat as fixed until dual-lens APPROVED + landed)

## Finding

**C-2 — C-2-atomic-v3 remains a false-green evidence binding.** Severity: **CRITICAL**. Confidence: **HIGH**.

Fresh package `20260807T095843Z` (source `324ce904…`, evidence-tree commit `33f004d1…`): submitted/bound results blob OID is `f27c245f…`; the blob at the commit it names (`33f004d1:<evidence path>/gate-results.json`) is `422643de…`. Binding fields differ: named blob has `git_sha=324ce904…` and lacks `source_sha_at_run` / `package_sha` / `gate_results_blob_sha256`; the later blob supplies those fields and names `33f004d1…`.

`assert-gate-evidence-containment.sh` and `assert-human-test-verdict.sh` both accept different named and submitted blobs: they hash the old named blob and compare it only to a hash field on the later JSON; HEAD checks compare the later JSON only to itself. Both exit `0` under `ASSERT_PACKAGE_HEAD=1` despite the mismatch.

Package script intentionally creates two blobs (hash E1 → rewrite fields → commit bind tip). A content hash stored in a later mutable results file is **not** proof that submitted results are the exact blob at the commit they name. RH-S30-20 / C-2-atomic-v3 did not close this residual.

**Required remediation:** replace the two-blob protocol with a committed immutable sidecar naming precise evidence-tree commit + Git blob OID(s); both assertions must compare the exact claimed historical object and binding fields; negative control for E1-versus-bind-tip substitution.

## Scope (WRITE-ALLOWED)

- `scripts/package-sprint30-gate-evidence.sh`
- `scripts/assert-human-test-verdict.sh`
- `scripts/assert-gate-evidence-containment.sh`
- `scripts/lib/gate-evidence-attestation.sh` / `scripts/lib/gate-evidence-blob-identity.sh` (NEW if needed)
- Sprint 30 gate artifacts under this sprint folder (real package only)
- `.tmp/REDHAT-FIX-RH-S30-23/**`
- Cross-link `REDHAT-FIX-RH-S30-20.md` disposition
- **Does not** invent pass evidence; only packages real runs
- **Does not** re-open product cutover/PONR/role-probe code

## Acceptance Criteria

- [ ] **AC-1** Immutable attestation sidecar: packaging commits `evidence-attestation.json` naming `protocol` (C-2-atomic-v4-blob-oid-identity or successor ending two-blob rewrite), `source_sha_at_run`, `package_commit`, `run_id`, and `artifacts.gate-results.json.blob_oid` (40-hex git OID); preferably verification raw + key step-log OIDs. Attestation commit **does not** change the gate-results blob OID. Finalize binding fields **before** the package commit that creates the exact submitted blob.
- [ ] **AC-2** Assert resolves historical object: with `ASSERT_EVIDENCE_CONTAINMENT=1`, both assert scripts require `hist_oid = git rev-parse <package_commit>:<path>` (or `git cat-file blob`) equals `sub_oid = git hash-object -t blob <submitted>` **and** historical bytes == submitted bytes. Comparing `sha256(named)` to a field inside a **later different** JSON is **FORBIDDEN** as a pass condition. `ASSERT_PACKAGE_HEAD` self-compare alone is insufficient.
- [ ] **AC-3** Negative control — E1-vs-bind-tip: submitted bind-tip content claiming the E1 package identity while bytes/OID differ (known pair `422643de…` vs `f27c245f…` if still present, else synthetic equivalent) **must** exit non-zero with explicit C-2 blob-identity / substitution error (not only "path missing").
- [ ] **AC-4** Historical non-containing control retained: `09aae0dd` + run `20260807T091354Z` still fails assert with explicit C-2 containment error.
- [ ] **AC-5** Package protocol forbids rewrite-after-hash two-blob bind: no hash-E1 → rewrite → distinct bind-tip claiming pre-rewrite commit for post-rewrite content. Single exact blob at `package_commit`; attestation is non-mutating of that blob. Protocol documented as **C-2-atomic-v4**.
- [ ] **AC-6** Fresh real tip-bound gate package under corrected contract: new `run_id`, no hand-edited SHAs; `assert_rc=0`, `verify_rc=0`, `blob_identity_ok=true`, `hist_oid == sub_oid`, attestation present with real OIDs; `source_sha_at_run` preserved.
- [ ] **AC-7** Disposition supersedes RH-S30-20 residual for C-2; RED baseline of E1-vs-bind-tip false-green (or residual oracle failure) captured under `.tmp/REDHAT-FIX-RH-S30-23/`.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Package emits committed attestation with package_commit + gate-results blob_oid under C-2-atomic-v4 | AC-1 | `git show` + `ac1-attestation.json` |
| TC-2 | Assert loads historical blob and requires hist_oid == sub_oid (hash-object) + byte identity | AC-2 | `rg hash-object\|rev-parse` + `ac2-assert-blob-identity.json` |
| TC-3 | E1-vs-bind-tip substitution exits non-zero with blob-identity / substitution wording | AC-3 | `ac3-e1-vs-bind-tip-fail.json` |
| TC-4 | Historical `09aae0dd` + `20260807T091354Z` still fails non-containing | AC-4 | `ac4-negative-09aae0dd-containment-fail.json` |
| TC-5 | Package script no longer implements rewrite-after-hash two-blob bind as happy path | AC-5 | `ac5-protocol-v4.md` + script audit |
| TC-6 | Fresh real package: assert_rc=0, verify_rc=0, blob_identity_ok=true without hand-edited SHAs | AC-6 | `ac6-assert-and-verify-exit0.json` |
| TC-7 | For accepted package, `git rev-parse package_commit:path` equals `git hash-object -t blob` of submitted gate-results | AC-6 | `ac6-oid-equality.txt` |
| TC-8 | hash-field-on-later-JSON alone cannot pass when hist_oid != sub_oid | AC-2 | synthetic fixture + assert exit ≠ 0 |
| TC-9 | RED baseline of E1-vs-bind-tip false-green; disposition supersedes RH-S30-20 residual | AC-7 | `ac7-red-*.txt` + `ac7-disposition.md` |
| TC-10 | `assert-human-test-verdict.sh` does not weaken containment relative to containment assert | AC-2 | dual transcripts on mismatched pair |

## Anti-stub

- Do not accept mere `git cat-file -e` path existence as C-2 closed.
- Do not accept `sha256(named_blob) == field on later different JSON` as C-2 closed.
- Do not rewrite gate-results after hashing and claim the pre-rewrite commit as identity for post-rewrite content.
- Do not hand-edit SHAs into historical packages as sole proof.
- Do not rebind `20260807T091354Z` / `20260807T095843Z` by rewriting SHAs in place as sole green proof.
- Do not re-open product cutover/PONR/role-probe code.
- Real git oracles only (`rev-parse`, `cat-file blob`, `hash-object`, `show`) — no mocked git.
- `ASSERT_PACKAGE_HEAD` comparing later JSON only to itself at HEAD is not blob identity.

## Critical Constraints

- **MUST** replace C-2-atomic-v3 two-blob rewrite with C-2-atomic-v4-blob-oid-identity (or named successor ending two-blob rewrite)
- **MUST** emit committed immutable `evidence-attestation.json` naming package_commit + blob OID(s) + source_sha_at_run
- **MUST** require hist_oid == sub_oid via real git for both assert scripts
- **MUST** reject E1-vs-bind-tip substitution with explicit identity error
- **MUST** keep `09aae0dd` + `20260807T091354Z` non-containing control
- **MUST** re-run fresh real human gate + package under corrected contract
- **NEVER** treat path-only or hash-field-on-later-JSON as C-2 closed
- **STRICTLY** fail closed when named package_commit blob OID ≠ submitted blob OID even if path exists and later JSON embeds sha256 of the old blob
- **STRICTLY** document C-2-atomic-v4; v3 two-blob + hash-in-later-JSON is insufficient

## Evidence

`.tmp/REDHAT-FIX-RH-S30-23/`

| Artifact | Proves |
|----------|--------|
| `ac1-attestation.json` | Attestation schema + real OIDs |
| `ac1-git-show-attestation.txt` | Committed sidecar via git show |
| `ac2-assert-blob-identity.json` | hist_oid==sub_oid on accepted package |
| `ac2-assert-source-diff.txt` | Assert change to exact blob OID identity |
| `ac3-e1-vs-bind-tip-fail.json` / `.err` | E1-vs-bind-tip negative control |
| `fixtures/e1-vs-bind-tip-submitted.json` | Reproducible mismatch fixture |
| `fixtures/hash-field-on-later-json-stub.json` | Hash-field stub that must fail |
| `fixtures/non-containing-09aae0dd.json` | Non-containing fixture |
| `ac4-negative-09aae0dd-containment-fail.json` | 09aae0dd still fails |
| `ac5-protocol-v4.md` / `ac5-protocol-audit.txt` | Protocol ends two-blob rewrite |
| `ac6-package-transcript.txt` | Fresh package under v4 |
| `ac6-assert-and-verify-exit0.json` | assert+verify green |
| `ac6-oid-equality.txt` | hist_oid == sub_oid |
| `ac7-red-e1-vs-bind-tip-false-green.txt` | RED baseline |
| `ac7-disposition.md` | Supersedes RH-S30-20 residual |

## Reading List

- Closeout review C-2 section @ fe79d37 — `.spec/reviews/red-hat-sprint-30-20260807T101142Z-independent-final-closeout.md`
- `REDHAT-FIX-RH-S30-20.md` — superseded residual (C-2-atomic-v3)
- `REDHAT-FIX-RH-S30-17.md` / `REDHAT-FIX-RH-S30-10.md` — earlier C-2 landings
- `scripts/package-sprint30-gate-evidence.sh` — two-blob rewrite (v3)
- `scripts/assert-gate-evidence-containment.sh` / `assert-human-test-verdict.sh` — false-green oracles
- `.gate-evidence/20260807T095843Z/gate-results.json` — live false-green package
- `.gate-evidence/20260807T091354Z/gate-results.json` — non-containing negative control

## Design

- **Pattern:** Finalize gate-results fields → commit exact submitted blob as package_commit P1 → write `evidence-attestation.json` with `blob_oid=git rev-parse P1:path` → commit attestation without changing gate-results OID → asserts require hist_oid==sub_oid.
- **Anti-pattern:** Comparing sha256 of the named/historical blob to `gate_results_blob_sha256` inside a later, different bind-tip JSON while accepting path existence at the named commit (exact v3 false-green greening `422643de…` vs `f27c245f…`).

## Disposition

Release-blocking packaging+assertion residual reopening RH-S30-20. Implement C-2-atomic-v4 immutable commit+blob-OID attestation, fail-closed hist_oid==sub_oid asserts, negative controls for E1-vs-bind-tip and non-containing binds, fresh real gate package under the corrected contract. Sprint 30 must not be marked complete until this task is dual-lens APPROVED on a landed containing SHA with exact blob OID identity.

AGENT: implementer=devops-engineer | technical-reviewer=code-reviewer | standing-test-reality=test-quality-reviewer  
planned_at: 2026-08-07T10:20:35Z  
finding_ids: [C-2, REDHAT-FIX-RH-S30-23, REDHAT-FIX-RH-S30-20, REDHAT-FIX-RH-S30-17, REDHAT-FIX-RH-S30-10]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-RH-S30-23",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "proposed_by": "devops-engineer",
  "touches_capabilities": ["CAP-CUT-01"],
  "fixtures": {
    "e1_vs_bind_tip_live_pair": {
      "description": "Named blob 422643de at 33f004d1 vs submitted f27c245f for run 20260807T095843Z",
      "seed_method": "git"
    },
    "non_containing_09aae0dd": {
      "description": "Historical non-containing control 09aae0dd / 20260807T091354Z",
      "seed_method": "git"
    },
    "fresh_real_gate_package": {
      "description": "New real human-gate run packaged under C-2-atomic-v4",
      "seed_method": "cli"
    }
  },
  "requirements": [
    {"id": "AC-1", "type": "acceptance_criterion", "description": "Committed immutable evidence-attestation.json names package_commit + gate-results blob_oid under C-2-atomic-v4", "verify": "git show + ac1-attestation.json schema"},
    {"id": "AC-2", "type": "acceptance_criterion", "description": "Asserts require hist_oid==sub_oid via real git; forbid hash-field-on-later-JSON as pass", "verify": "ac2-assert-blob-identity.json"},
    {"id": "AC-3", "type": "acceptance_criterion", "description": "E1-vs-bind-tip substitution exits non-zero with C-2 blob-identity error", "verify": "ac3-e1-vs-bind-tip-fail.json"},
    {"id": "AC-4", "type": "acceptance_criterion", "description": "09aae0dd non-containing control retained", "verify": "ac4-negative-09aae0dd-containment-fail.json"},
    {"id": "AC-5", "type": "acceptance_criterion", "description": "Package ends rewrite-after-hash two-blob protocol; attestation non-mutating of gate-results OID", "verify": "ac5-protocol-v4.md"},
    {"id": "AC-6", "type": "acceptance_criterion", "description": "Fresh real gate package assert+verify green only under exact blob identity", "verify": "ac6-assert-and-verify-exit0.json + ac6-oid-equality.txt"},
    {"id": "AC-7", "type": "acceptance_criterion", "description": "RED baseline + disposition supersedes RH-S30-20 residual for C-2", "verify": "ac7-red-e1-vs-bind-tip-false-green.txt + ac7-disposition.md"},
    {"id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Attestation schema + committed sidecar with real git OIDs", "verify": "ac1-attestation.json"},
    {"id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Assert blob OID identity implementation present", "verify": "rg hash-object|rev-parse"},
    {"id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "E1-vs-bind-tip negative control", "verify": "ac3 exit != 0"},
    {"id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "Non-containing 09aae0dd retained", "verify": "ac4 exit != 0"},
    {"id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "Two-blob rewrite removed from happy path", "verify": "ac5-protocol-audit.txt"},
    {"id": "TC-6", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "Fresh package assert_rc=0 verify_rc=0 blob_identity_ok", "verify": "ac6-assert-and-verify-exit0.json"},
    {"id": "TC-7", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "hist_oid equals sub_oid", "verify": "ac6-oid-equality.txt"},
    {"id": "TC-8", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "hash-field-on-later-JSON stub fails", "verify": "fixture + assert exit != 0"},
    {"id": "TC-9", "type": "test_criterion", "maps_to_ac": "AC-7", "description": "RED baseline + disposition", "verify": "ac7 files"},
    {"id": "TC-10", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "human-test-verdict does not weaken containment", "verify": "dual transcripts"}
  ]
}
-->
