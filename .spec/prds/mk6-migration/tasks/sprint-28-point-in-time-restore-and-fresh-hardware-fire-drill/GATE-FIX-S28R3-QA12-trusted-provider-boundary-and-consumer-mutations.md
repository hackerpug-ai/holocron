# GATE-FIX-S28R3-QA12 — Trusted provider boundary + consumer-level mutations

> Status: ✅ Complete  
> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer / test-quality / security  
> Reviewer: code-reviewer + test-quality-reviewer + security-reviewer  
> Priority: P0  
> Source review: `.spec/reviews/red-hat-20260729T161758Z-sprint-28-main-sha-6364ed5b3d38.md` on `6364ed5b3d3823894b2535d480820604029bc907`  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes

## Outcome

Make the effective provider toolchain non-replaceable by caller `PATH`, establish the canonical restore context at the R2 boundary, use a real private proof-file boundary, and execute every security mutation against the actual provision/fire-drill consumers.

## Findings

1. **CRITICAL-1:** a caller-prepended fake `aws` executable can forge the live-success proof.
2. **HIGH-1:** endpoint/bucket/prefix/policy context is self-attested rather than canonicalized and established at R2.
3. **MEDIUM-1:** proof creation follows/truncates caller paths instead of using an exclusive no-follow private boundary.
4. **MEDIUM-2:** mutation tests use an inline verifier rather than the real consumer processes, and canary success paths are incomplete.

## MUST

1. Live mode must resolve and execute a trusted provider binary independently of caller `PATH`. Use a deterministic absolute/realpath allowlist or a repository-owned provider implementation whose runtime is likewise pinned; verify file type, ownership, and non-group/world-writable mode. Clear or strictly allowlist `PATH` for the provider process. Reject any untrusted or missing provider rather than falling back.
2. Add a process test that prepends a forged `aws` binary to `PATH` and proves both actual live consumers refuse or bypass it in favor of the verified provider. The forged binary must never be executed.
3. Build one canonical context representation for endpoint, bucket, restore prefix, and the single supported policy enum. Reject empty, alternate, or noncanonical values. Bind its digest in the proof and revalidate the same representation immediately before consumption.
4. Establish that context at R2: perform prefix-scoped list plus a non-secret read/head/get against an actual object under the declared prefix, while still requiring Put/Delete denial at a generated sacrificial key. The supported policy must be demonstrated by these provider calls, not merely echoed from environment strings. Avoid downloading or logging object content.
5. Add provider/process fixtures covering normalization changes, empty/alternate policy, different prefix, missing in-prefix object, failed in-prefix read, and broader/different context claims. Each must fail closed at the real consumer boundary.
6. Remove production caller control of proof output paths. Each consumer must create a trusted private `0700` directory and randomized nonexistent proof name, then the producer must create it atomically with `O_NOFOLLOW|O_CREAT|O_EXCL` and mode `0600`. Validate parent/file identity with `lstat`/directory FDs, consume without following symlinks, and clean up safely.
7. Run stale/future/malformed/mismatched/context-digest mutations through the actual provision and fire-drill processes, not an inline copy of their verifier. Removing any consumer validation must make the suite fail.
8. Execute AWS and Cloudflare mint success and error fixtures with unique credential/provider canaries. Inspect stdout, stderr, proof attestation, recorder output, parity report, and all evidence files; no canary may appear.
9. Run focused QA8–QA12 tests, the complete executable mutation harness, all `sprint28-*.test.ts` from a clean worktree, shell syntax checks, and the real ignored-`.env` live proof. Land on `main` with hooks enabled and remove the task worktree/branch.

## NEVER

Trust caller `PATH` · accept an arbitrary provider binary · hash unvalidated context strings as proof · follow or truncate a caller proof path · substitute inline verifier logic for consumer execution · log provider/object content or credentials · weaken denial probes · hand-edit gate verdict/evidence · touch Sprint 27, unrelated `.tmp`, `.env`, or surface 137

## VERIFY

```bash
pnpm exec vitest run \
  services/platform/tests/integration/sprint28-s28r3-qa8-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa9-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa10-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa11-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa12-gate-fix.test.ts
pnpm exec vitest run services/platform/tests/integration/sprint28-*.test.ts
bash -n scripts/prove-r2-readonly.sh scripts/provision-fresh-restore-target.sh \
  scripts/verify-restore-creds.sh scripts/run-fire-drill-on-fresh-target.sh
set -a; source .env; set +a
REQUIRE_LIVE_R2_RO=1 bash scripts/prove-r2-readonly.sh
```

## WRITE-ALLOWED

- the three R2/restore live-consumption scripts and a narrowly scoped repository-owned provider helper if needed
- QA8–QA11 tests and fixtures
- `services/platform/tests/integration/sprint28-s28r3-qa12-gate-fix.test.ts` and focused mutation/provider fixtures
- this task and Sprint 28 task-row/status artifacts
- `.tmp/GATE-FIX-S28R3-QA12/**` local evidence

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"GATE-FIX-S28R3-QA12","reviewed_sha":"6364ed5b3d3823894b2535d480820604029bc907","findings":["CRITICAL-1","HIGH-1","MEDIUM-1","MEDIUM-2"],"trusted_provider_independent_of_path":true,"provider_context_proved":true,"proof_no_follow_exclusive":true,"consumer_level_mutations":true,"success_error_canaries":true}
-->

