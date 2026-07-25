# Interaction notes — Sprint 25 reactive surfaces

## S-REACTIVE-04: Degraded local fleet unavailable (chat, no hang)

### Backend signal source

- `DegradedModeController` (`services/platform/src/inference/degraded-mode-controller.ts:117-131`)
- Durable state table `degraded_mode` (Postgres) — **not** in `zero_pub`, **no** HTTP endpoint
- Exact message constant:
  - `SURFACE_UNAVAILABLE_MESSAGE = 'Local fleet unavailable — running in reduced mode'`
  - (`degraded-mode-controller.ts:36`)

### Client inference path (failure envelope — not a Zero query)

The client **cannot** Zero-query `degraded_mode` and **must not** assume a
`GET /api/degraded-state` endpoint exists.

**Trigger = chat failure envelope:**

1. `POST /api/chat-runs` returns a fleet-unavailable error body, **or**
2. SSE `terminal` / `error` / `blocked` signal carries a fleet-unavailable payload
   (e.g. `ROLE_UNAVAILABLE`, `surface-unavailable`, `fleet role … unreachable`,
   `Local fleet unavailable…`)

**Infer** the chat-thread state machine phase `degraded` from that envelope and
render the **exact** `SURFACE_UNAVAILABLE_MESSAGE`.

**Recover** to `normal` (phase `idle` / `streaming`) when the fleet returns and
the next chat send succeeds (`connect` clears degraded).

### State machine extension

S-REACTIVE-01 phases: `idle` | `streaming` | `reconnecting` | `complete` | `cancelled`

S-REACTIVE-04 adds: **`degraded`**

- Enter `degraded` from failure-envelope inference (never a client fleet health probe)
- Leave `degraded` on next successful `connect` / send (fleet restored)
- UX: banner with exact message + `testID="chat-degraded-banner"` — **no spinner hang**

### Anti-patterns

- Waiting indefinitely on a silent socket
- Client-side fleet health probe (bypasses never-cloud / failure-envelope contract)
- Caching degraded state past auto-resume without a new chat attempt
- Zero-querying `degraded_mode` (not published)
- Silent cloud fallback
