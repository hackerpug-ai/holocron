# GATE-FIX-S28R3-QA17 — Credential path and oracle closure

> Status: ✅ Complete  
> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer / security / test-quality  
> Reviewer: code-reviewer + security-reviewer + test-quality-reviewer  
> Priority: P0  
> Source review: `red-hat-20260729T174418Z-sprint-28-main-sha-0a47d55cb74c919b1bafad8270c86382fc8b1be1.md`  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes

## Outcome

Close all two CRITICAL and three HIGH findings from the independent Terra review of QA14, plus its two MEDIUM findings, so every credential-bearing execution path is root-trusted and every race, mutation, scope, canary, Zod, and SigV4 oracle fails for the intended reason.

## MUST

1. Remove caller-PATH/runtime execution from every credential-bearing production path. No bare `env`, `python3`, `openssl`, `awk`, `cut`, or `bash`; no ambient `BUN_BIN`; no shebang/PATH indirection may receive restore credentials. Use validated fixed root-owned absolute executables with root-owned, non-writable parent chains and `/usr/bin/env -i`, or redesign so the untrusted runtime never receives credentials.
2. Move tuple hashing/JSON work into the fixed repository Python provider invoked only by validated `/usr/bin/python3`. Reject hostile Python startup environment and add forged-PATH/runtime-marker tests through both production consumers.
3. Remove fake-volume, recorder, mutation, and mock-provider branches/values from production sources. Construct all substitutions only after production files are copied into the test harness. Keep explicit production rejection tests for all historical variables, including `HOLO_CLI`.
4. Establish both exact scope-probe objects with a real authorized writer/control-plane preflight in the live proof. Bind non-secret key identifiers/fingerprints, existence status, bucket/prefix context, and preflight provenance to the proof/evidence; fail closed before restore-key tests when either object cannot be proven. Never accept 404/NoSuchKey.
5. Add true consumer-level concurrent replacement races for both proof file and parent directory while provision and fire-drill consume a syntactically valid, fresh proof with correct tuple/context. Assert the specific no-follow/FD identity rejection and absence of all post-validation side effects.
6. Give provision and fire-drill copied-harness mutations success-capable baselines, prove each mutation was applied, require its specific proof-validator failure, and assert recorder/side effects are absent. A generic nonzero or dependency failure is not sufficient.
7. Recursively scan proof JSON, provision/fire-drill attestations, recorder output, parity reports, stdout/stderr, and every evidence file on success and error paths for all unique credential/provider canaries.
8. Retain and run the direct `plannerTools.create_plan.steps[].toolArgs` Zod regression added by QA15; it must accept object records and reject arrays/non-records without weakening values or count constraints.
9. Canonically percent-encode SigV4 object paths for both the request URL and canonical URI while preserving `/`; test reserved characters (`#`, `%`, space, and non-ASCII) plus session-token signing.
10. Preserve QA16's versioned, non-secret exact-key binding and make it non-overridable by production environment input.
11. Run focused QA14–QA17 tests, TypeScript check, clean frozen full Sprint 28 suite, syntax checks, real ignored-`.env` proof, and commit with hooks enabled. Land on `main` and remove task worktrees/branches.

## NEVER

Use `--no-verify` · execute caller-controlled runtimes with credentials · retain production test seams · accept generic nonzero/404 as scope proof · use nonexistent probe keys · log secrets/object bodies · touch Sprint 27, unrelated `.tmp`, `.env`, `.env.example`, or surface 137 · hand-edit gate verdict/evidence

## VERIFY

```bash
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm exec vitest run convex/chat/tools.test.ts
pnpm exec vitest run \
  services/platform/tests/integration/sprint28-s28r3-qa14-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa16-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa17-gate-fix.test.ts
pnpm exec vitest run services/platform/tests/integration/sprint28-*.test.ts
bash -n scripts/prove-r2-readonly.sh scripts/provision-fresh-restore-target.sh \
  scripts/verify-restore-creds.sh scripts/run-fire-drill-on-fresh-target.sh scripts/lib/r2-ro-live.sh
/usr/bin/python3 -m py_compile scripts/lib/r2_s3_provider.py
git diff --check
set -a; source .env; set +a
REQUIRE_LIVE_R2_RO=1 bash scripts/prove-r2-readonly.sh
```

## WRITE-ALLOWED

- Sprint 28 R2 prover/provider/consumer/helper scripts
- copied test-harness generator and QA14–QA17 integration tests/fixtures
- `convex/chat/tools.test.ts` only if the existing QA15 direct regression needs correction
- versioned non-secret scope-preflight schema/artifacts
- this task and QA16 task/status artifacts

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"GATE-FIX-S28R3-QA17","source_sha":"0a47d55cb74c919b1bafad8270c86382fc8b1be1","findings":{"critical":2,"high":3,"medium":2},"absolute_credential_runtime_chain":true,"no_production_test_seams":true,"writer_preflight_provenance":true,"consumer_replacement_races":true,"specific_mutation_oracles":true,"all_evidence_canary_scan":true,"sigv4_uri_encoding":true}
-->
