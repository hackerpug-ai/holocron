# S-REWRITE-01 evidence (FIX rename menu wiring + maestro oracles)

## MAESTRO_APP_ID
`com.holocron.app` (matches `app.config.cjs` `ios.bundleIdentifier` / `android.package`).
**Not** `com.anonymous.holocron`.

```bash
export MAESTRO_APP_ID=com.holocron.app
maestro test .maestro/chat/drawer-loads-seeded.yml -e MAESTRO_APP_ID=com.holocron.app
```

## Pure code fix (AC-2)
Long-press on a conversation row now calls `onOpenConversationMenu` →
`setActionMenuConversation` + `setIsActionMenuOpen(true)` so `handleRename` is
user-reachable via `action-menu-rename-button`.

## Maestro oracles
| AC | Flow | Oracle |
|----|------|--------|
| AC-1 | drawer-loads-seeded.yml | 3 `conversation-row` indices 0..2 |
| AC-2 | rename-reflects.yml | longPress → rename → `Sprint Planning`, count stays 3 |
| AC-3 | thread-loads.yml | >=3 `message-bubble` indices 0..2 |
| AC-4 | send-streams.yml | send probe text visible |
| AC-5 | cancel-works.yml | `stop-generating-button` appears and cancel taps it |
| AC-6 | cluster scan | 0 `convex/react` imports |

## Substrate honesty
Maestro AC-1..5 exit **non-zero** when Metro (:8081), Zero (:4848), or
`holo seed:e2e` are missing. Do **not** treat static vitest as Maestro green.

See also `.tmp/S-REWRITE-01/` for full run artifacts.
