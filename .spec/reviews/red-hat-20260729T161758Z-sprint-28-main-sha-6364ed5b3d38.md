# Red-Hat Review Report — Sprint 28 after GATE-FIX-S28R3-QA11

**Report date:** 2026-07-29T16:17:58Z  
**Target:** Sprint 28 — Point-in-Time Restore and Fresh-Hardware Fire Drill  
**Reviewed SHA:** `6364ed5b3d3823894b2535d480820604029bc907` (`main`)  
**Review mode:** Fresh independent severity review of the committed product/security delta through the exact SHA.  
**Reviewed by:** Terra red-team review with independent security and test-reality lenses.  
**Test-reality lens:** Ran in implemented mode.

## Verdict

**REJECT — not approved.** The review found **CRITICAL=1, HIGH=1, MEDIUM=2, LOW=0**. Approval requires CRITICAL=0 and HIGH=0.

## Executive Summary

QA11 correctly removes the explicit `HOLO_PROVE_R2_READONLY` consumer override, captures and discards provider response bodies, and makes the fire-drill child exit and parity-report result affect the script exit status. However, its claimed live R2 proof remains caller-replaceable through `PATH`: QA11 itself proves a mock `aws` binary can yield the live-success path. The context proof is also a hash of caller-provided strings, not proof of the effective prefix/policy at R2.

The private proof-file requirement and the six-mutation test claim are not met. The writer follows paths and truncates rather than using a private no-follow boundary, and the post-prove test executes a copied Python verifier rather than either live consumer.

## Findings

### CRITICAL-1 — Caller-selected `PATH` can replace the effective live R2 prover

**Confidence:** High  
**Affected:** `scripts/prove-r2-readonly.sh:379-483`; both live consumers.

`prove-r2-readonly.sh` resolves and executes the bare `aws` command (`command -v aws`, then `aws ...`) for List, Put, and Delete. Provision and fire-drill invoke this repository script while retaining caller `PATH` (`provision-fresh-restore-target.sh:199-215`; `run-fire-drill-on-fresh-target.sh:222-238`). A caller can therefore put a compliant-looking `aws` executable first in `PATH` and produce a successful attestation without contacting R2.

This is executable, not hypothetical: QA11 prepends its fixture bin directory to `PATH` (`sprint28-s28r3-qa11-gate-fix.test.ts:44-58`), accepts the resulting provision run as the real/fixed live proof (`:94-119`), and the fixture emits exactly List-success plus Put/Delete-denied responses (`fixtures/bin/aws:43-57`). The repository script name is fixed, but its provider authority is not.

**Required remediation:** resolve a trusted, verified AWS executable outside caller `PATH` for live mode (or execute a pinned absolute binary with ownership/mode checks); clear/allowlist `PATH` for the prover; add a process test where a forged `aws` precedes the real binary and require refusal.

### HIGH-1 — Endpoint/bucket/prefix/policy context is self-attested, not canonicalized or established at the provider boundary

**Confidence:** High  
**Affected:** `scripts/prove-r2-readonly.sh:368-483,594-599`; `scripts/run-fire-drill-on-fresh-target.sh:198-238`.

The actual R2 probe receives only credentials, endpoint, bucket, and session. It lists the whole bucket and performs destructive denial probes under `drill-neg`; it never exercises a GetObject request at the declared restore prefix or demonstrates the effective policy. `context_fp16` is merely a digest of raw caller strings—there is no endpoint/prefix/policy canonicalization and no provider-side policy resolution. In the fire-drill runner, `R2_CREDENTIAL_POLICY` is inherited and can be empty or arbitrary while producer and consumer still hash the same value.

This fails QA11 MUST 5: the complete effective endpoint, bucket, prefix, and policy context is not established and revalidated before use. It can report a matching context digest for a credential that has bucket-wide reads or a policy/prefix different from the asserted one.

**Required remediation:** build one canonical context representation in the consumers, reject empty/noncanonical policy, bind that exact representation, and prove prefix-scoped access with provider calls or authoritative policy inspection. Cover normalization changes and broader/different-prefix permissions in process tests.

### MEDIUM-1 — Proof evidence is not a trusted private no-follow/exclusive boundary

**Confidence:** High  
**Affected:** `scripts/prove-r2-readonly.sh:601-662`; consumers at `provision-fresh-restore-target.sh:193-230` and `run-fire-drill-on-fresh-target.sh:218-251`.

The producer allows any string with the trusted-directory textual prefix and writes it with `os.open(..., O_WRONLY | O_CREAT | O_TRUNC)`. That has neither `O_NOFOLLOW` nor `O_EXCL`; it follows symlinks and overwrites existing targets. The parent directory has no ownership, mode, or symlink identity validation. Consumer validation uses `stat()` and `open()`, which also follow symlinks. Even a `../` component passes the producer's prefix test before path resolution.

This directly contradicts QA11 MUST 6 and permits TOCTOU/symlink substitution or arbitrary clobber rather than a trusted proof boundary.

**Required remediation:** create and open a root-owned/private proof directory through directory FDs; reject symlinked components; create the file atomically with no-follow/exclusive semantics (or securely pass an already-open FD); verify `lstat`/ownership/mode before consuming it; remove the live producer output-path seam.

### MEDIUM-2 — QA11 does not execute all six documented mutation controls against the consumers

**Confidence:** High  
**Affected:** `services/platform/tests/integration/sprint28-s28r3-qa11-gate-fix.test.ts:274-428`.

The test labelled “real consumer path” creates mutated proof copies and then runs an inline Python implementation of the verifier (`:346-373`). It never runs provision or fire-drill with those mutations. Removing stale/future/malformed/mismatched validation from either consumer could therefore leave this test green. This is not an isolated mutation harness or an equivalent consumer-level oracle.

Credential canary coverage is incomplete as well: QA11 checks AWS error and mint API-error paths only (`:378-428`). It does not put credential/provider canaries through AWS success or Cloudflare mint-success paths, nor assert all resulting evidence artifacts are canary-free. Thus the task's success/error and “all six controls” contract is not demonstrated.

**Required remediation:** run each mutation against the actual process under test, including a forged `PATH` provider; exercise AWS and Cloudflare success/error fixtures with unique canaries; inspect stdout, stderr, proof attestation, recorder output, and report/evidence files for every canary.

## Verified Corrections and Non-findings

- Both consumers explicitly reject `HOLO_PROVE_R2_READONLY` in live mode, so that named override cannot replace the repository shell script.
- The script captures raw AWS/Cloudflare response bodies only to classify them and clears them before logging (`prove-r2-readonly.sh:398-482`; mint parsing around `:208-268`). This is a positive source-level control, but it does not cure the missing success-path canary evidence above.
- The runner captures the child exit status, requires the parity-report contract after a zero exit, writes the resulting status into its attestation, and exits with that status (`run-fire-drill-on-fresh-target.sh:815-854`). QA11's recorder test also asserts a real zero status and the env restore-session fingerprint.
- Producer/consumer context digests include endpoint, bucket, prefix, and policy fields. The HIGH finding is that the fields are not canonicalized or independently established as the effective provider permissions.

## Deterministic and Mutation-Test Evidence

| Command | Result |
|---|---|
| `pnpm exec vitest run ...qa8... ...qa9... ...qa10... ...qa11...` | **PASS** — 4 files, 36 tests. The pass does not kill the Critical `PATH` mutation because the suite deliberately accepts the mock `aws` in `PATH`. |
| `bash -n scripts/prove-r2-readonly.sh scripts/provision-fresh-restore-target.sh scripts/verify-restore-creds.sh scripts/run-fire-drill-on-fresh-target.sh` | **PASS**. |
| `pnpm exec vitest run services/platform/tests/integration/sprint28-*.test.ts` | **BLOCKED BY EXISTING WORKTREE STATE** — `sprint28-s28r3-qa2-gate-fix.test.ts` correctly requires no active `gate-results.json`, but an untracked active file already exists in this checkout. It is absent from reviewed SHA `6364ed5b...`; it was neither removed nor altered. |
| ignored-`.env` real R2 proof | **Not run** — this review did not source or alter `.env`, and the sprint remains blocked on `DEPENDENCY-S28-R2-RO`. |

## Scope and Integrity

- Reviewed exactly `6364ed5b3d3823894b2535d480820604029bc907`; no checkout movement, merge, push, or gate-verdict change was performed.
- No product code, `.env`, Sprint 27 artifact, unrelated `.tmp` artifact, or surface 137 was modified. This report is the sole review output.
- The committed product files matched the reviewed SHA; pre-existing working-tree modifications were treated as out of scope.

