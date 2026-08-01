# FIX-D06-03-AC2 remediation

## HIGH closed
- **H1 AC-2**: 4/4 surfaces (mutation, action, mutating httpAction POST, upload) reject with `migration_read_only:` — see `ac-2-surface-sweep.json` / `tc3-surface-sweep.json`
- **H2 freeze soft-confirm**: `runCutoverFreeze` FAIL CLOSED unless `getMigrationReadOnlyEnv()` returns `1`|`true` after set (removed `env_value||'1'` soft path)
- **H3 quiet-check circular**: no longer self-seeds audit to manufacture counts; probes real fenced paths; `oracle` field documents `audit`|`live_probes`|`mixed`; independent AC-1/AC-2 audit rows preferred
- **H4 AC-1 row count**: TC-2 asserts `documents.queries.count` unchanged after blocked create

## MEDIUM
- freeze-report archived on re-arm (`freeze-report-<fence_armed_at>.json`) for TC-9 pairing
- article-baseline never synthesizes `capturedAtMs = armedAt+1`; waits on wall clock or fail-closes `CAPTURE_CLOCK_RACE`

## Surfaces
1. mutation: `documents.mutations.create`
2. action: `subscriptions.actions.check`
3. httpAction: `POST /cutover/write-probe` (new fenced route in `convex/http.ts`)
4. upload: `documents.storage.createWithEmbedding`
