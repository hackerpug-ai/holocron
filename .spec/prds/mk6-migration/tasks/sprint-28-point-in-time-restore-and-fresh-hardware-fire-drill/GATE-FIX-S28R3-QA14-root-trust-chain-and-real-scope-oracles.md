# GATE-FIX-S28R3-QA14 — Root trust chain + real scope oracles

> Status: ✅ Complete
> Sprint: [Sprint 28](./SPRINT.md)
> Agent: devops-engineer / test-quality / security
> Reviewer: code-reviewer + test-quality-reviewer + security-reviewer
> Priority: P0
> Source review: `.spec/reviews/red-hat-20260729T171500Z-sprint-28-main-sha-2c880475fecb8886f69af0ad359828ec519703d5.md` on `2c880475fecb8886f69af0ad359828ec519703d5`
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes

## Outcome

Establish a root-owned execution chain before credentials exist, eliminate every production runtime test/CLI seam, prove prefix scope with known-existing provider objects and explicit `AccessDenied`, and make mutation/evidence tests kill each control at the actual consumer boundary.

## Findings

1. **CRITICAL-1:** bare `env` and `python3` are caller-`PATH` resolved before the credential-safe environment.
2. **CRITICAL-2:** the selected Homebrew AWS executable has a self/group-writable parent chain.
3. **CRITICAL-3:** production fire-drill accepts fake-volume and arbitrary CLI overrides with restore credentials.
4. **HIGH-1:** out-of-prefix `NoSuchKey`/404 is accepted as authorization denial.
5. **HIGH-2:** fire-drill mutations pass because the baseline cannot reach its recorder/CLI.
6. **MEDIUM-1:** supplied endpoint normalization is accepted instead of exact rejection.
7. **MEDIUM-2:** proof no-follow safety lacks a process-level replacement oracle.
8. **MEDIUM-3:** mint/all-evidence canary tests do not execute the intended branches or scan proof/attestation.
9. **MEDIUM-4:** `HOLO_QA_PROOF_MUTATE` remains callable in production.
10. **LOW-1:** QA13 introduced trailing whitespace.

## MUST

1. Invoke only absolute, validated root-owned helpers before or during credential-bearing work: `/usr/bin/env` and `/usr/bin/python3` (or another root-owned fixed system path) with every parent component non-group/world-writable. Add forged-`PATH` marker tests for `env`, `python3`, `aws`, and `curl`; none may execute.
2. Remove the Homebrew AWS trust dependency. Implement the minimal R2 S3 operations in a repository-owned Python standard-library SigV4 provider invoked only by validated root-owned `/usr/bin/python3`, or use an equivalently pinned root-owned implementation. It must support prefix List, Head/Get without content logging, and Put/Delete denial classification without raw body leakage.
3. Minting must use validated root-owned `/usr/bin/curl` directly and `/usr/bin/env -i`; no bare helper, fallback, override, or fixture path may receive the Cloudflare bearer token or parent access key.
4. Remove `HOLO_FIRE_DRILL_FAKE_VOLUMES`, `HOLO_CLI`, `HOLO_QA_PROOF_MUTATE`, and every production runtime test/provider override. Production fire-drill must use fixed real volume resolution and its fixed repository CLI/runtime. Test substitution/mutation belongs only in copied harness files created after production sources are copied.
5. Require supplied `R2_ENDPOINT`, when present, to byte-equal the exact derived endpoint. Reject case changes, trailing slash, path, query, fragment, userinfo, port, or any normalized variant.
6. Prove prefix scope using known-existing controlled objects. Require in-prefix List plus Head/Get success for an existing `pgbackrest/` object. Require explicit provider `AccessDenied` (never 404/NoSuchKey/unclassified failure) for out-of-prefix List, Head, and Get against a known-existing object. Continue to require generated Put/Delete `AccessDenied`.
7. Make the known-existing in/out probe keys part of trusted configuration/evidence, verify their existence through an authorized preflight/control-plane artifact, and fail closed if they cannot be established. Never silently manufacture a nonexistent negative key.
8. Give each copied fire-drill mutation a success-capable baseline with real fake-volume/recorder fixtures inside the copy only. Assert the baseline reaches a zero-exit recorder, each mutation fails specifically at proof validation, and the recorder is not invoked for the mutant. Cover the same complete mutation set for provision and fire-drill.
9. Add a process-level symlink/replacement race test that kills removal of file `O_NOFOLLOW`, directory-FD binding, or `fstat` identity/mode validation.
10. Make mint success/error mocks actually traverse the absolute-helper copied harness and assert branch status. Scan stdout, stderr, proof JSON, provision attestation, fire-drill attestation, recorder output, parity report, and every evidence file for all unique canaries.
11. Remove all trailing whitespace. Run focused QA8–QA14 tests, mutation probes, clean frozen full Sprint 28 suite, shell/Python syntax checks, and the real ignored-`.env` proof with known-existing scope probes. Land on `main` and remove the task worktree/branch.

## NEVER

Invoke bare `env`, `python3`, `aws`, or `curl` · trust a user/group-writable executable chain · keep production test/CLI overrides · accept 404 as authorization denial · use nonexistent scope probes · let a mutant fail after proof validation · hand-edit gate verdict/evidence · touch Sprint 27, unrelated `.tmp`, `.env`, or surface 137

## VERIFY

```bash
pnpm install --frozen-lockfile
pnpm exec vitest run \
  services/platform/tests/integration/sprint28-s28r3-qa8-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa9-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa10-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa11-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa12-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa13-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa14-gate-fix.test.ts
pnpm exec vitest run services/platform/tests/integration/sprint28-*.test.ts
bash -n scripts/prove-r2-readonly.sh scripts/provision-fresh-restore-target.sh \
  scripts/verify-restore-creds.sh scripts/run-fire-drill-on-fresh-target.sh scripts/lib/r2-ro-live.sh
/usr/bin/python3 -m py_compile scripts/lib/r2_s3_provider.py
git diff --check
set -a; source .env; set +a
REQUIRE_LIVE_R2_RO=1 bash scripts/prove-r2-readonly.sh
```

## WRITE-ALLOWED

- R2 prover/consumer/helper scripts and a repository-owned standard-library S3 provider
- copied test harness and QA8–QA13 tests/fixtures
- `services/platform/tests/integration/sprint28-s28r3-qa14-gate-fix.test.ts`
- package/workspace/lock artifacts only if required to preserve the clean frozen suite
- this task and Sprint 28 task-row/status artifacts
- `.tmp/GATE-FIX-S28R3-QA14/**` local evidence

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"GATE-FIX-S28R3-QA14","reviewed_sha":"2c880475fecb8886f69af0ad359828ec519703d5","findings":["CRITICAL-1","CRITICAL-2","CRITICAL-3","HIGH-1","HIGH-2","MEDIUM-1","MEDIUM-2","MEDIUM-3","MEDIUM-4","LOW-1"],"absolute_root_helpers":true,"stdlib_sigv4_provider":true,"no_production_test_or_cli_seams":true,"known_existing_scope_probes":true,"explicit_access_denied":true,"both_consumers_mutation_kill":true,"all_evidence_canary_scan":true}
-->
