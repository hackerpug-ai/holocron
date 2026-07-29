# GATE-FIX-S28R3-QA18 — Credential environment sanitization

> Status: ✅ Complete  
> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer / security  
> Reviewer: security-reviewer + test-quality-reviewer  
> Priority: P0  
> Source: QA17 debug-path ambient-environment exposure on `8aaf8d088b3695cb4d8fbb8e95b79f57993afcd3`  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes

## Outcome

Ensure every credential-bearing consumer subprocess receives only an explicit allowlist and cannot print, inherit, or persist unrelated ambient secrets on success, failure, or debug paths.

## MUST

1. Invoke credential-bearing children through validated fixed `/usr/bin/env -i` (or an equivalently empty environment) with the smallest explicit variable allowlist required for the operation.
2. Exclude all unrelated ambient variables, API keys, shell startup variables, runtime overrides, tracing settings, and caller `PATH`; do not forward the parent environment wholesale.
3. Make diagnostics emit only fixed labels, safe classifications, lengths/fingerprints, and allowlisted variable names—never values or raw environment dumps.
4. Add RED/GREEN forged-environment tests through prove, provision, and fire-drill for unrelated secret canaries and hostile startup/runtime variables. Assert canaries are absent recursively from stdout, stderr, proof JSON, attestations, recorder/parity output, and the full task evidence tree.
5. Remove only contaminated QA17-local debug/evidence files before final verification; preserve unrelated `.tmp`, session history, and user files.
6. Run focused QA14–QA18 tests, TypeScript check, clean frozen full Sprint 28 suite, syntax checks, and the real ignored-`.env` live proof. Commit with hooks enabled, land on `main`, and remove the task worktree/branch.

## NEVER

Print `env`/`set`/`export -p` in credential paths · log raw values · forward ambient API keys · bypass hooks · touch Sprint 27, unrelated `.tmp`, `.env`, `.env.example`, or surface 137 · hand-edit gate verdict/evidence

## VERIFY

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run \
  services/platform/tests/integration/sprint28-s28r3-qa14-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa16-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa17-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa18-gate-fix.test.ts
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
- copied test-harness generator and QA14–QA18 integration tests/fixtures
- this task/status artifact
- `.tmp/GATE-FIX-S28R3-QA17/**` and `.tmp/GATE-FIX-S28R3-QA18/**` only for contaminated-task cleanup and fresh evidence

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"GATE-FIX-S28R3-QA18","source_sha":"8aaf8d088b3695cb4d8fbb8e95b79f57993afcd3","empty_environment":true,"explicit_allowlist":true,"ambient_secret_forwarding":false,"raw_environment_logging":false,"recursive_canary_scan":true}
-->
