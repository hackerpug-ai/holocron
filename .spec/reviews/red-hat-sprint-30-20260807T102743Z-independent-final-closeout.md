# Red-Hat Review Report — Sprint 30 Final Independent Closeout

**Report date:** 2026-08-07T10:27:43Z  
**Target:** Sprint 30 — Cutover Rollback Drill and Data-Plane Point of No Return  
**Reviewed commit:** `5b86e4e0504785b0edb35dc0943a46dacab048a9` (`main`, handoff only)  
**Fresh package audited:** `20260807T102120Z` — source `a6fbfc3f6b953053abfd84b7b17ac2572db08819`, package `b9b30e91e2c0485ac3f7ee93620e95884d4cfb52`, attestation commit `a2121e22c507b07a06a435a8e21acb5856719353`  
**Prior closeout:** `.spec/reviews/red-hat-sprint-30-20260807T101142Z-independent-final-closeout.md`  
**Reviewed by:** independent evidence-binding lens, rollback/security lens, test-reality lens  
**Test-reality lens:** ran in implemented-mode source/evidence audit; no mutation or suite rerun, because the review-only contract prohibits the disposable-worktree/database writes those checks would create.  
**Scope discipline:** Review-only. No product, task, sprint, gate-result, gate-verification, merge, push, or checkout state was changed.

## Severity Verdict

**NEEDS REVISION — 2 HIGH findings remain. Do not approve Sprint 30.**

The C-2 v4 blob comparison fixes the earlier E1-versus-bind-tip mismatch: the named package object, submitted root result, and attested result OID are all `e2cbe0624ea037af060ed0166e9348ab9d48b50d`. However, the checker trusts a mutable sidecar without authenticating that sidecar as the claimed immutable attestation. Separately, C-3 data-safety facts are collected but do not control the gate's status or exit; a five-step pass can therefore be packaged while the forced-miss control is skipped or fails. M-3's source-level identity oracle is structurally credible, but the required red/green, per-branch evidence is not retained in an auditable package.

## AC Verdict Table

| Control | Verdict | Evidence | Notes |
|---|---|---|---|
| C-2 / C-2-atomic-v4 historical result identity | ✅ PASS (narrow check) | `scripts/assert-gate-evidence-containment.sh:89-124`; `b9b30e91:<gate-results path>`; fresh post-package assertions | `hist_oid == sub_oid == attested_oid`; bytes are equal and the E1-vs-bind negative rejects. |
| C-2 / immutable attestation binding | ❌ FAIL — HIGH | `scripts/assert-gate-evidence-containment.sh:35-52,54,77-85,152-166` | The sidecar that supplies the historical commit/path/OID is read from the mutable worktree and is not itself Git-object-bound. |
| C-3 / seeded forced-marker-miss source behavior | ✅ PASS (captured run only) | fresh `ponr-role-provenance-marker-miss/negative-marker-report.json`; `scripts/probe-ponr-role-immutability-negative-marker.sh:93-159` | Captured `probe_rc=2`, `before_count=after_count=1`, and both trigger flags true. |
| C-3 / gate-owned fail-closed proof | ❌ FAIL — HIGH | `scripts/run-sprint30-human-gate.sh:380-407,422-425,447-465,484-490`; `scripts/assert-human-test-verdict.sh:35-116` | Probe/marker outcomes are metadata only; they are not required for terminal pass/exit or package verification. |
| M-3 / independent HTTP-201 identity source oracle | ✅ PASS (source) | `services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts:395-483` | Intercepted HTTP-201 ID is compared to report, documents row, and Postgres-backed ledger, distinct from the synthetic reselect probe ID. |
| M-3 / durable per-branch RED/GREEN evidence | ⚠️ PARTIAL — MEDIUM | `.tmp/REDHAT-FIX-RH-S30-22/`; `.gitignore:88`; fresh package `gate-results.json:24-64` | Local ignored GREEN output exists, but no retained RED transcript and no package-bound full per-branch identity evidence. |

## High-Confidence Findings

- [ ] **C-2 — the asserted identity is selected by a mutable, unauthenticated attestation sidecar.** Severity: **HIGH**. Confidence: **HIGH**.

  The actual package is internally consistent: `a2121e22` adds an attestation that names `b9b30e91`, source `a6fbfc3f`, and result OID `e2cbe…`; the submitted root `gate-results.json` hashes to the same OID. The containment checker correctly resolves `package_commit:path`, hashes the submitted result, compares byte equality, and rejects the historical v3 E1-vs-bind substitution (`assert-gate-evidence-containment.sh:89-124`; `scripts/assert-c2-e1-bind-mismatch-negative.sh` exits successfully only after its inner assertion exits nonzero).

  That is not a complete immutable-attestation control. At `:35-52`, the checker obtains `package_commit`, path, and blob OID from an arbitrary on-disk `evidence-attestation.json`; it never resolves the attestation's own blob from `a2121e22` (nor does the attestation name its own committing object). The optional HEAD test at `:152-166` checks only the result blob. A substituted sidecar can select a different historical matching package/blob and replay it as the asserted evidence. The protocol field is not required (`:54`), `attestation.run_id` is optional (`:77-80`), and missing submitted source values bypass source equality (`:81-85`).

  Require an attestation commit/blob/path identifier in a non-circular location or verified handoff, resolve its bytes from Git before consuming it, and fail closed on missing protocol, run ID, source fields, or any mismatch. Preserve the existing result-object equality and substitution negative test.

- [ ] **C-3 — forced-marker-miss and effective non-owner controls can fail or be skipped while the human gate still emits a packageable pass.** Severity: **HIGH**. Confidence: **HIGH**.

  The fresh captured run is encouraging: its negative-marker report records `probe_rc:2`, `before_count:1`, `after_count:1`, and trigger flags true. The normal probe's companion artifact records `probe_current_user:"holocron_app"` inside the rolled-back transaction. The destructive marker-parse fallback is absent from the source.

  But the runner initializes both result codes to zero and only runs the C-3 probes when `DATABASE_URL` is set (`run-sprint30-human-gate.sh:380-407`). It computes `c3_marker_miss_ok` and `h3_role_provenance_closed` at `:427-465`, yet terminal `status` depends only on the five plan steps, verifier, and human assertion (`:422-425`); the runner exits nonzero only for `ASSERT_RC` (`:484-490`). `assert-human-test-verdict.sh:35-116` likewise checks plan logs and C-2 containment, never requiring PONR nonzero preservation, trigger preservation, C-3 result codes, or non-owner proof. Thus a skipped/failed marker-miss control can be recorded as metadata beside an otherwise passing, attestable gate.

  The forced-miss wrapper's `effective_user_hint` is also not a pass predicate (`probe-ponr-role-immutability-negative-marker.sh:127-155`), and the fresh report has it `null`; only the companion normal probe happens to contain the app-role marker. Its trigger query uses `coalesce(bool_and(...), true)`, so zero non-internal triggers also reads as enabled (`:94-95,114-115`), which cannot prove required trigger preservation.

  Make the disposable C-3 database mandatory (or explicitly fail), require a forced-miss report with a nonzero seeded count, required trigger names/count and enabled state, and observed `current_user==holocron_app` from the rolled-back transaction. Bind these predicates to gate status, process exit, package assertion, and verifier—not metadata alone.

## Medium Finding

- [ ] **M-3 — source has an independent reselect identity oracle, but the evidence retention contract remains unmet.** Severity: **MEDIUM**. Confidence: **HIGH**.

  `sprint30-redhat-rh-s30.test.ts:411-452` wraps the actual delegated fetch, captures `201 body.document.id`, proves it differs from the injected reselect ID, and compares it to `report.write_row_id`; `:454-483` also proves database and Postgres ledger membership with `allowFileFallback:false`. The non-201 and transport cases retain injected-ID-to-ledger assertions at `:279-333` and `:337-391`.

  The local `.tmp/REDHAT-FIX-RH-S30-22/` has a GREEN suite transcript and local branch artifacts, but `.tmp/` is ignored (`.gitignore:88`), it has no RED transcript, and it is not in `HEAD`. The fresh `b9b30e91` package preserves only the five human-gate step logs, not an M-3 test command, red/green transcript, or all branch identity records. Consequently the test source may be sound, but its claimed remediation evidence is not durable/auditable as required.

## Checks Re-run

- `ASSERT_PACKAGE_HEAD=1 bash scripts/assert-gate-evidence-containment.sh <Sprint-30 gate-results>`: exit `0`; historical, submitted, and attested result OIDs all `e2cbe…`.
- `ASSERT_EVIDENCE_CONTAINMENT=1 ASSERT_PACKAGE_HEAD=1 bash scripts/assert-human-test-verdict.sh <Sprint-30 gate-results> <20260807T102120Z>`: exit `0`.
- `ASSERT_PACKAGE_HEAD=0 bash scripts/assert-c2-e1-bind-mismatch-negative.sh /tmp/s30-c2-negative-review`: exit `0`; its inner assertion exits `1` on the known differing historical/submitted OIDs, as intended.
- No mutation probe or integration suite rerun was performed: either would create ignored `.tmp` artifacts and exercise the disposable database, which would be new evidence rather than a read-only audit.

## Agent Contradictions and Resolution

| Topic | Assessment |
|---|---|
| Does C-2 now reject the prior path-present/different-blob class? | Yes. The exact result blob check is fixed. The remaining High finding concerns authentication of the sidecar that selects that historical object. |
| Is C-3 source non-destructive on a parse miss? | Yes, based on the reviewed source. The High finding is that the required behavioral proof is optional/non-binding and its trigger/role predicates are incomplete. |
| Is M-3 self-correlated? | No for `reselect_miss`: the fetch-boundary capture is independent. The remaining gap is durable evidence retention, assessed Medium. |

## Required Remediation Before Another Closeout

1. Anchor the attestation sidecar itself to an exact committed Git object and make all C-2 binding fields required before accepting its selected historical result.
2. Make C-3 a mandatory gate predicate and exit condition, requiring nonzero seeded PONR preservation, named/enabled trigger presence, and observed effective app-role proof.
3. Retain and bind a real M-3 RED transcript, GREEN transcript, and identity artifacts for all three injection branches to a committed/package evidence path; then conduct an isolated mutation probe.

## Disposition

**Do not mark Sprint 30 complete and do not write a gate pass.** This review covers exactly `5b86e4e0504785b0edb35dc0943a46dacab048a9`; it does not merge, push, or move a checkout.

## Metadata

- **Panel:** independent evidence-binding lens; rollback/security lens; `test-quality-reviewer` standing test-reality lens.
- **Confidence framework:** HIGH confidence is corroborated by independent source/evidence inspection; severity is assessed by blast radius and false-green effect.
- **Working-tree note:** The checkout contained extensive pre-existing modified and untracked files. This report assessed the committed `HEAD` tree and historical package objects; ignored local M-3 artifacts are discussed only as non-durable evidence, never as landed implementation.
