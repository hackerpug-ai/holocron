# GATE-FIX-S28R3-QA19 — Final runtime and oracle closure

> Status: ✅ Complete
> Sprint: [Sprint 28](./SPRINT.md)
> Agent: devops-engineer / security / test-quality
> Reviewer: code-reviewer + security-reviewer + test-quality-reviewer
> Priority: P0
> Source review: `red-hat-20260729T181700Z-sprint-28-main-sha-8aaf8d088b3695cb4d8fbb8e95b79f57993afcd3.md`
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes

## Outcome

Close all three CRITICAL, four HIGH, one MEDIUM, and one LOW findings from the independent Terra review of QA17, accounting for the later `b0daab81d7fddae92ab3d82c5879d1b8beb9a9f8` environment-sanitization commit.

## MUST

1. Eliminate every remaining untrusted credential runtime. Replace bare/PATH-resolved `awk`, `bash`, Python startup, shebang, and other helpers with validated fixed root-owned absolute paths and isolated environments. Invoke Python with `/usr/bin/env -i` plus `/usr/bin/python3 -E -s` and a minimal allowlist.
2. Do not pass restore credentials to a user-owned Homebrew/local Bun executable or any unvalidated runtime. Either use a genuinely validated root-owned immutable runtime chain or redesign so Bun receives no restore secrets in environment, argv, files, or inherited descriptors. A forged `BUN_BIN`/candidate must never execute with credentials.
3. Change the credential-bearing Human Gate command in `gate-plan.json` from bare `bash` to fixed root-owned `/bin/bash`, then keep that exact updated command byte-identical through final QA evidence.
4. Make fresh authorized writer/control-plane preflight mandatory before any restore-key scope test. Use the trusted provider path to prove both exact versioned objects exist; bind safe key identifiers/fingerprints, bucket/prefix context, timestamps, provider classification, and provenance to the proof. Refuse absent, failed, stale, malformed, or optional preflight; never accept 404/NoSuchKey.
5. Remove every `HOLO_R2_PROVIDER_MOCK_*` and writer-preflight mock branch/value from production source. Generate all mock-provider behavior only after production files are copied into the harness.
6. Add true concurrent, consumer-level proof-file and parent-directory replacement races for both provision and fire-drill. Use syntactically valid fresh proofs with correct tuple/context, require the named no-follow/FD identity failure, and prove all recorder/post-validation side effects are absent. Counterfactually kill removal of each safety control.
7. Add success-capable provision and fire-drill mutation baselines. Prove each mutation is injected after proof creation, require its exact validator failure, and reject generic nonzero/dependency failures.
8. Inject distinct credential/provider canaries into success and error paths for both consumers; recursively scan stdout, stderr, proof JSON, provision/fire-drill attestations, recorder output, parity reports, and every evidence file. No raw environment or secret-bearing diagnostic is permitted.
9. Expand the SigV4 request-capture regression to assert `%23`, `%25`, `%20`, non-ASCII encoding, slash preservation, request-URL/canonical-URI equality, and signed `x-amz-security-token` behavior.
10. Add an explicit `plannerTools.create_plan.steps[].toolArgs: []` rejection assertion while retaining the strict object-record success, other non-record failures, integer count constraints, and default behavior.
11. Remove trailing whitespace from QA15–QA19 artifacts and require `git diff --check` to pass across the remediation range.
12. Preserve QA18's ambient-environment sanitization and add its task artifact to the landed history. Run focused QA14–QA19 tests, TypeScript, clean frozen full Sprint 28 suite, syntax checks, the mandatory real ignored-`.env` proof, and hooks. Land on `main`; remove worktrees/branches.

## NEVER

Use `--no-verify` · pass credentials to user-owned Bun · keep production mock branches · make writer preflight optional · accept generic nonzero/404 · use non-discriminating races · log environment/secrets/object bodies · touch Sprint 27, unrelated `.tmp`, `.env`, `.env.example`, or surface 137 · hand-edit gate verdict/evidence

## VERIFY

```bash
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm exec vitest run convex/chat/tools.test.ts
pnpm exec vitest run \
  services/platform/tests/integration/sprint28-s28r3-qa14-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa16-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa17-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa19-gate-fix.test.ts
pnpm exec vitest run services/platform/tests/integration/sprint28-*.test.ts
bash -n scripts/prove-r2-readonly.sh scripts/provision-fresh-restore-target.sh \
  scripts/verify-restore-creds.sh scripts/run-fire-drill-on-fresh-target.sh scripts/lib/r2-ro-live.sh
/usr/bin/python3 -m py_compile scripts/lib/r2_s3_provider.py
git diff --check
set -a; source .env; set +a
REQUIRE_LIVE_R2_RO=1 /bin/bash scripts/prove-r2-readonly.sh
```

## WRITE-ALLOWED

- Sprint 28 R2 prover/provider/consumer/helper scripts
- `gate-plan.json` only for the fixed `/bin/bash` credential-bearing command
- copied test-harness generator and QA14–QA19 integration tests/fixtures
- `convex/chat/tools.test.ts` for the missing array/count/default assertions only
- QA15–QA19 task/status artifacts and trailing-whitespace cleanup
- `.tmp/GATE-FIX-S28R3-QA19/**` fresh local evidence only

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"GATE-FIX-S28R3-QA19","source_sha":"8aaf8d088b3695cb4d8fbb8e95b79f57993afcd3","post_review_sha":"b0daab81d7fddae92ab3d82c5879d1b8beb9a9f8","findings":{"critical":3,"high":4,"medium":1,"low":1},"no_untrusted_credential_runtime":true,"fixed_gate_bash":true,"mandatory_writer_preflight":true,"no_production_mock_seams":true,"consumer_concurrent_races":true,"specific_mutation_oracles":true,"full_evidence_canary_scan":true,"complete_sigv4_regression":true}
-->
