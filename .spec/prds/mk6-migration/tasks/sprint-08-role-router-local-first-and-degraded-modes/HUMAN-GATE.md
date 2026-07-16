# Sprint 08 Human Gate Procedure (honest — REDHAT-FIX-H2)

This procedure is the **only** authorized way to produce or update
`gate-results.json` / `gate-verification.json` / `sprint-goal-state.json`
human_test fields for Sprint 08.

## Operator surface (Sprint 08)

| Kind | Entry point | Notes |
|------|-------------|-------|
| CLI | `holo infer:call` | Default path + escape; real case in `services/platform/src/cli/holo.ts` |
| CLI | `holo infer:degraded` | Operator view of degraded-mode controller state |
| CLI | `holo verify:no-provider-refs` | Banned factory audit |
| CLI | `holo budget:status` / `holo budget:set` | Budget ledger operator surface |
| SUITE | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-router-zero-cloud.test.ts` (+ `infer-red-zero-cloud`) | Default-path zero Anthropic — **labeled suite, not mission** |
| SUITE | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-transition.test.ts` (+ `infer-degraded-resume`) | Degraded never-cloud + resume — **labeled suite, not mid-run mission fleet kill** |

**Out of scope until Sprint 15:** `holo mission run …` (mission engine). Do not document or claim mission CLI execution here.

## Hard rules (gate honesty)

1. **Documented steps must be executable as written.** Every human step in
   `SPRINT.md` Human Test Deliverable must map to either:
   - a real `holo` CLI case present in `holo.ts`, or
   - an explicitly labeled **suite** command (`suite` / `PLATFORM_IT` / `vitest` in the step label/text).
2. **NEVER count vitest-only as successful execution of a documented mission CLI step.**
   If a step is suite-backed, the step id/name/command **must** say suite/`PLATFORM_IT`/vitest.
3. **NEVER claim `verdict: pass`** on a gate-results step whose documented SPRINT entry
   point is non-executable (missing CLI case, mission fiction, unlabeled vitest proxy).
4. **Mismatch fails.** If SPRINT says `holo mission` (or any non-existent case) and
   gate-results records a vitest substitution for that step, honesty validation **fails**
   even if the vitest suite itself passed.
5. **Degraded proof is controller/CLI suite**, not live mid-run mission fleet kill.
   Retain never-cloud / zero Anthropic / `anthropicCount:0` language.
6. **Re-run inventory before marking met.**  
   `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts`  
   must exit 0 before setting `sprint-goal-state.met=true` or gate `verdict: pass` after edits.

## Gate-results step schema (honest)

Each step object SHOULD include:

```json
{
  "id": "step-N",
  "name": "human-readable",
  "kind": "cli | suite",
  "command": "exact command run",
  "executed": true,
  "result": "pass | fail | skip",
  "log": ".tmp/.../stepN.log",
  "label": "CLI | SUITE | PLATFORM_IT"
}
```

- `kind: "suite"` requires `label` or `name`/`command` to contain `suite`, `PLATFORM_IT`, or `vitest`.
- `kind: "cli"` requires the first `holo <case>` token to exist as `case '<case>':` in `holo.ts`.
- Steps must **not** use mission wording for suite executions.

## Required sequence (operator)

Follow `SPRINT.md` **Test Steps** 1–7 exactly. Capture logs under
`.tmp/sprint-08-role-router-local-first-and-degraded-modes/human-tests/`.

Then:

```bash
PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts
```

Only after inventory pass, update:

- `gate-results.json` (honest labels, real commands)
- `gate-verification.json`
- `sprint-goal-state.json` human_test fields

## Greenwash archive

Prior greenwash (mission fiction + vitest substitution + `verdict:pass`) is archived at:

- `.spec/evidence/redhat-fix-h2-red.json`
- `.tmp/REDHAT-FIX-H2/red-greenwash-snapshot.json`
- `.tmp/REDHAT-FIX-H2/prior-gate-results.json`

Do not re-use those artifacts as a successful gate pass.
