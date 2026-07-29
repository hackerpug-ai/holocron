# GATE-FIX-S28R3-QA15 — Restore Convex tool-schema typecheck

> Status: ✅ Complete  

> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: convex-implementer  
> Reviewer: convex-reviewer + test-quality-reviewer  
> Priority: P0  
> Source: QA14 commit hook on `2c880475fecb8886f69af0ad359828ec519703d5`  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes

## Outcome

Restore the clean repository TypeScript contract so QA14 can land with hooks enabled. The current `main` fails at `convex/chat/tools.ts(450,23)` with TS2554 (`Expected 2-3 arguments, but got 1`).

## MUST

1. Reproduce the failure with the same typecheck/commit-hook path before changing code and preserve RED evidence.
2. Make the smallest type-safe correction to the affected Convex chat tool schema. Use the previously attempted QA13 change only as investigation context; independently verify the current library contract.
3. Add or retain a focused behavior/type regression test that fails for the broken one-argument schema and passes for the corrected schema.
4. Keep the schema strict; do not weaken validation, widen unknown values, disable TypeScript checks, edit hooks, or bypass hooks.
5. Re-run the focused test, TypeScript check, QA14 focused suite, full Sprint 28 suite, and the real ignored-`.env` R2 proof.
6. Commit QA14 and QA15 with hooks enabled, land both on `main`, then remove the task worktree and branch.

## NEVER

Use `--no-verify` · weaken schema validation · touch unrelated Convex code · touch Sprint 27, unrelated `.tmp`, `.env`, or surface 137 · hand-edit gate verdict/evidence

## VERIFY

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run convex/chat/tools.test.ts
pnpm exec vitest run services/platform/tests/integration/sprint28-s28r3-qa14-gate-fix.test.ts
pnpm exec vitest run services/platform/tests/integration/sprint28-*.test.ts
set -a; source .env; set +a
REQUIRE_LIVE_R2_RO=1 bash scripts/prove-r2-readonly.sh
```

## WRITE-ALLOWED

- `convex/chat/tools.ts`
- `convex/chat/tools.test.ts`
- this task file and the QA14 task/status artifacts

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"GATE-FIX-S28R3-QA15","source_sha":"2c880475fecb8886f69af0ad359828ec519703d5","finding":"typescript-TS2554-convex-chat-tools","hooks_enabled":true,"schema_strict":true,"scope":["convex/chat/tools.ts","convex/chat/tools.test.ts"]}
-->
