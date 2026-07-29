# GATE-FIX-S28R3-QA11 — Fixed live prover + credential-safe mutation oracles

> Status: ✅ Complete  
> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer / test-quality / security  
> Reviewer: code-reviewer + test-quality-reviewer + security-reviewer  
> Priority: P0  
> Source review: `.spec/reviews/red-hat-20260729T155755Z-sprint-28-sha-4e0218bc16dd.md` on `4e0218bc16dd7447a4ab4736dd826a3a5642d457`  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes

## Outcome

Make the live R2 permission proof non-replaceable, make every provider-facing log credential-safe, bind the complete restore context, and prove every QA10 security mutation is killed by executable tests.

## Findings

1. **CRITICAL-1:** three required mutations still survive the focused QA8/QA9/QA10 suite.
2. **HIGH-1:** `HOLO_PROVE_R2_READONLY` lets a live caller replace the real R2 prover.
3. **HIGH-2:** raw AWS/R2/Cloudflare output and string error fields can reach logs.
4. **MEDIUM-1:** proof evidence is not bound to endpoint, bucket, prefix, and policy context.
5. **MEDIUM-2:** caller-selected proof paths are not a safe private-file boundary.

## MUST

1. In `REQUIRE_LIVE_R2_RO=1` mode, both provision and fire-drill consumers must invoke only the fixed repository-owned `scripts/prove-r2-readonly.sh`; no environment executable override, caller proof, symlink, or preexisting artifact may supply authority.
2. Keep any fake-prover seam strictly outside live mode. Add an executable negative test proving `HOLO_PROVE_R2_READONLY` cannot bypass the real prover when live mode is enabled.
3. Replace all raw provider-command output logging with fixed operation/status classes and strictly validated numeric/provider error codes. Never interpolate raw `ls_out`, `put_out`, `del_out`, `api_out`, response strings, key IDs, tokens, secrets, or success samples.
4. Execute subprocess tests with credential canaries in mint success/error and fake AWS/R2 success/error responses; assert the canaries are absent from stdout, stderr, and every emitted evidence file.
5. Canonicalize the effective endpoint, bucket, prefix, and policy; bind a non-secret digest of that complete context into the fresh proof; verify it immediately before each consumer uses the tuple.
6. Create proof evidence exclusively in a trusted directory with no-follow/exclusive semantics and mode exactly `0600`. The production live path must not accept a caller-selected proof output target.
7. Strengthen the process recorder tests to require `run.status === 0`, satisfy and validate the parity-report contract, and assert exact redacted restore-token metadata.
8. Add a real isolated mutation harness, or equivalent executable mutations, that fails when any of the six QA10 controls are removed or weakened: unknown-writer-secret rejection; explicit restore-token precedence; stale/future/malformed/mismatched post-prove evidence rejection; child session-token forwarding; sacrificial-key predicate/denylist; and any raw credential/provider output logging.
9. Run the focused QA8/QA9/QA10/QA11 tests, the mutation harness, all `sprint28-*.test.ts`, shell syntax checks, and the ignored-`.env` live proof. Land on `main` with hooks enabled and remove the task worktree/branch.

## NEVER

Allow a replaceable live prover · trust caller proof paths · log raw provider output or credential-shaped data · weaken the sacrificial-key denylist · accept a nonzero child recorder · hand-edit gate verdict/evidence · touch Sprint 27, unrelated `.tmp`, `.env`, or surface 137

## VERIFY

```bash
pnpm exec vitest run \
  services/platform/tests/integration/sprint28-s28r3-qa8-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa9-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa10-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa11-gate-fix.test.ts
pnpm exec vitest run services/platform/tests/integration/sprint28-*.test.ts
bash -n scripts/prove-r2-readonly.sh scripts/provision-fresh-restore-target.sh \
  scripts/verify-restore-creds.sh scripts/run-fire-drill-on-fresh-target.sh
set -a; source .env; set +a
REQUIRE_LIVE_R2_RO=1 bash scripts/prove-r2-readonly.sh
```

## WRITE-ALLOWED

- `scripts/prove-r2-readonly.sh`
- `scripts/provision-fresh-restore-target.sh`
- `scripts/run-fire-drill-on-fresh-target.sh`
- QA8/QA9/QA10 tests and fixtures
- `services/platform/tests/integration/sprint28-s28r3-qa11-gate-fix.test.ts` and focused mutation fixtures
- this task and Sprint 28 task-row/status artifacts
- `.tmp/GATE-FIX-S28R3-QA11/**` local evidence

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"GATE-FIX-S28R3-QA11","reviewed_sha":"4e0218bc16dd7447a4ab4736dd826a3a5642d457","findings":["CRITICAL-1","HIGH-1","HIGH-2","MEDIUM-1","MEDIUM-2"],"fixed_live_prover":true,"raw_provider_output_forbidden":true,"full_context_binding":true,"private_proof_file":true,"all_mutations_killed":true}
-->

