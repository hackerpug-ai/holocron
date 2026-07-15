# service-4 negative-control notes

## Gate suite (GREEN on implemented service)

`PLATFORM_IT=1 pnpm vitest run tests/integration/service/` → 20/20 pass (see green-output.txt).

## Why classic RED-before-impl is already satisfied

- **AC-1/2/3 auth boundary**: service-3 middleware suite went RED before scoped-key middleware
  existed (see `.tmp/service-3/red-output.txt` on main lineage). These service-4 tests re-assert
  the same boundary **on the wire** against a real `bun services/platform/src/index.ts` process.
- **AC-4 schema identity**: service-2 registry suite went RED with duplicate validation
  (see `.tmp/service-2/red-output.txt`). service-4 drives `holo verify:identity` which exits
  nonzero when `identity` is false / `uniqueInstances !== 1`.
- **AC-5 health probes**: service-1 health went RED with stubbed probes; service-4 asserts
  live `db.ready` / `fleet.ready` / `queue.ready` booleans + latency_ms > 0.

## Controlled RED still inside the suite

| Test | Controlled failure path |
|------|-------------------------|
| keyed-200 NEGATIVE CONTROL | Boot with alternate HOLO_KEY_* → `rn-test` is unknown → **401** (proves real key store, not always-valid stub) |
| health-readiness NEGATIVE CONTROL | Boot with `DATABASE_URL=postgres://127.0.0.1:1/dead` → **503** and `db.ready === false` (proves real Postgres probe) |

## would_fail_if (suite teeth)

- Middleware bypassed → unkeyed-401 expects 401, gets 200 → FAIL
- Scope check missing → wrong-scope-403 expects 403, gets 200 → FAIL
- Stubbed key validation always-valid → keyed-200 negative control expects 401 for mismatched store, gets 200 → FAIL
- Duplicate schema layers → verify:identity identity:false / exit 1 → FAIL
- Static /health stub → health-readiness expects true booleans + latency; dead-DB still ready:true → FAIL
