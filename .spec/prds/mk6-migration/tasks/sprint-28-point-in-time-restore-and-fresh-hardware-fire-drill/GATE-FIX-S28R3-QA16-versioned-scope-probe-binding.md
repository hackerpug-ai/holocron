# GATE-FIX-S28R3-QA16 — Versioned scope-probe binding

> Status: ✅ Complete  
> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer / security  
> Reviewer: code-reviewer + security-reviewer + test-quality-reviewer  
> Priority: P0  
> Source: QA14 live-proof/final-gate durability check on `0a47d55cb74c919b1bafad8270c86382fc8b1be1`  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes

## Outcome

Bind the two known-existing R2 scope-oracle object keys to versioned, non-secret trusted configuration so the literal gate commands are self-contained and auditable instead of depending on ignored local `.env` key-name configuration.

## MUST

1. Store only the exact known-existing in-prefix and out-of-prefix object key identifiers in a versioned non-secret configuration artifact; never store credentials or object contents.
2. Load the artifact from a fixed repository path, validate its schema and exact prefix relationship, and fail closed on missing, malformed, replaced, or ambiguous configuration.
3. Do not allow caller environment variables or runtime overrides to weaken or replace the versioned oracle in production execution.
4. Require in-prefix List/Head/Get success and explicit `AccessDenied` for known-existing out-of-prefix List/Head/Get; continue to reject 404/NoSuchKey and require generated Put/Delete `AccessDenied`.
5. Add RED/GREEN tests that kill removal or override of the versioned binding and scan logs/evidence for object contents and credential canaries.
6. Run focused QA14/QA16 tests, TypeScript check, full Sprint 28 suite, syntax checks, and the real ignored-`.env` proof. Commit with hooks enabled, land on `main`, and remove the worktree/branch.

## NEVER

Commit secrets · log object bodies · accept 404 as denial · allow environment override of trusted probe keys · bypass hooks · touch Sprint 27, unrelated `.tmp`, `.env`, or surface 137

## VERIFY

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run services/platform/tests/integration/sprint28-s28r3-qa14-gate-fix.test.ts
pnpm exec vitest run services/platform/tests/integration/sprint28-*.test.ts
bash -n scripts/prove-r2-readonly.sh scripts/lib/r2-ro-live.sh
/usr/bin/python3 -m py_compile scripts/lib/r2_s3_provider.py
git diff --check
set -a; source .env; set +a
REQUIRE_LIVE_R2_RO=1 bash scripts/prove-r2-readonly.sh
```

## WRITE-ALLOWED

- `scripts/lib/r2-scope-probes.json`
- `scripts/lib/r2-ro-live.sh`
- `scripts/prove-r2-readonly.sh`
- focused Sprint 28 QA14/QA16 integration tests and copied harness fixtures only if needed
- this task/status artifact

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"GATE-FIX-S28R3-QA16","source_sha":"0a47d55cb74c919b1bafad8270c86382fc8b1be1","versioned_scope_probes":true,"environment_override":false,"known_existing":true,"explicit_access_denied":true,"secrets_in_artifact":false}
-->
