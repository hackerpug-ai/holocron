# Mastra Review — Sprint 05 / service-5 (RE-REVIEW after tripwire FIX)

**Task**: service-5 — Review auth boundary + registry singularity  
**Reviewer**: mastra-reviewer (adversarial re-review)  
**Date (UTC)**: 2026-07-15T03:02:05Z  
**Worktree**: `/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/service-5`  
**Branch**: `task/service-5`  
**HEAD reviewed**: `8f080fa75bf78de43ed345553a6f18125c6254ad` (`chore: sync main into service-5 for re-review after tripwire FIX`)  
**Tripwire FIX commit**: `2e8eaa8bc2dc32f88183c5c87f4ce17322862bd3` (`service-5-FIX: Mastra tripwire handling at agent/stream call sites`)  
**FIX merge on main**: `42630ed` (`Merge task/service-5-FIX-tripwire into main`)  
**Scope of review**: service-1..4 implementations + service-5-FIX tripwire under `services/platform/src/**` + integration suite under `tests/integration/service/**` (read-only; no implementation edits)

**Prior verdict**: NEEDS_FIXES (AC-3 tripwire only) — report at same path, superseded by this re-review.

---

## Verdict: APPROVED

**All three ACs pass with live curl, CLI, and grep evidence captured in this session.**  
AC-3 was the sole prior blocker; FIX landed helpers (`assertNoTripwire`, `handleStreamChunk`, `assertNoTripwireInStream`) and wired the only production `agent.generate()` call site. Grep now shows ≥1 `result.tripwire` and ≥1 stream `chunk.type === 'tripwire'` hits.

---

## Executive summary

| Check | Result | Evidence |
|-------|--------|----------|
| AC-1 Auth boundary unkeyed→401 / wrong-scope→403 / keyed→200 | **PASS** | Live curl (embedded below) |
| AC-2 Registry singularity (0 dup Zod parse outside shared registry audit roots) | **PASS** | `holo verify:no-dup-validation` → `duplicates:0`; identity true |
| AC-3 Tripwire at agent/stream call sites | **PASS** | `result.tripwire` hits: **6**; stream `chunk.type === 'tripwire'` hits: **4**; sole generate site calls `assertNoTripwire` |
| `/health` real probes (not static) | **PASS** | Live 200 with varying latency; dead DB → 503 + `db.ready:false` |
| `resolveModel` fail-closed | **PASS** | unknown role → `UNKNOWN_ROLE`; dead endpoint → `RoleUnavailableError` |
| AP-7 NO RLS / NO multi-tenant | **PASS** | Explicit AP-7 comment; no `isRLSEnabled: true` |
| Stub / mock of `@mastra` / `z.any()` / skipped tests | **PASS** | Grep clean on production paths |
| Tripwire pure-logic suite | **PASS** | `bun test src/mastra/__tests__/tripwire.test.ts` → **8 pass / 0 fail** |

---

## AC-1 — Auth boundary (PRIMARY) — PASS

### Boot command

```bash
export DATABASE_URL=postgres://127.0.0.1:5432/holocron
export HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test
export PORT=4111
bun run services/platform/src/index.ts
```

### Server stdout (composition root)

```
Starting Mastra service on :4111
Listening on :4111
  health:  http://127.0.0.1:4111/health
  storage: PostgresStore → postgres://127.0.0.1:5432/holocron
  mastra:  single composition root (agents/workflows deferred to later tasks)
```

### Curl evidence (real HTTP against booted process — re-captured 2026-07-15T03:01Z)

#### 401 — unkeyed `GET /api/missions`

```bash
curl -sS -w "\nHTTP %{http_code}\n" http://127.0.0.1:4111/api/missions
```

```
{"error":"unauthorized","message":"missing or invalid Authorization Bearer token"}
HTTP 401
```

```
HTTP/1.1 401 Unauthorized
```

#### 403 — wrong-scope (`mcp-test` on `/api/missions`)

```bash
curl -sS -w "\nHTTP %{http_code}\n" \
  -H 'Authorization: Bearer mcp-test' \
  http://127.0.0.1:4111/api/missions
```

```
{"error":"forbidden","message":"scope 'mcp' is not allowed for /api/missions","scope":"mcp"}
HTTP 403
```

```
HTTP/1.1 403 Forbidden
```

#### 200 — correct-scope (`rn-test` on `/api/missions`)

```bash
curl -sS -w "\nHTTP %{http_code}\n" \
  -H 'Authorization: Bearer rn-test' \
  http://127.0.0.1:4111/api/missions
```

```
{"ok":true,"route":"GET /api/missions","scope":"rn","missions":[],"note":"placeholder — mission list lands later"}
HTTP 200
```

```
HTTP/1.1 200 OK
```

### Additional scope matrix (same boot, same keys)

| Request | Expected | Observed |
|---------|----------|----------|
| unkeyed `POST /api/missions` | 401 | 401 |
| unknown key `Bearer wrong-key` → `GET /api/missions` | 401 | 401 |
| RN → `POST /mcp` | 403 | 403 |
| MCP → `POST /mcp` | 200 | 200 `scope":"mcp"` |
| CONTROL → `GET /api/missions` | 403 | 403 |
| CONTROL → `POST /api/missions/m1/steer` | 200 | 200 `scope":"control"` |
| unkeyed `GET /health` | not 401/403 | 200 (live) |

### Implementation anchors

- Middleware: `services/platform/src/http/middleware/scoped-key.ts` — unkeyed → 401, unknown key → 401, wrong scope → 403, `/health` exempt.
- App wiring: `services/platform/src/http/hono-app.ts` — `app.use('*', createScopedKeyMiddleware(keys))`.
- Placeholder mission/MCP handlers return 200 **only after** middleware authorizes (auth surface under test; mission engine deferred).

**AC-1 satisfied.**

---

## AC-2 — Registry singularity — PASS

### Official CLI audit (re-run this session)

```bash
bun services/platform/src/cli/holo.ts verify:no-dup-validation
```

```json
{
  "ok": true,
  "duplicates": 0,
  "sites": [],
  "scannedCount": 20
}
```

```
holo verify:no-dup-validation duplicates:0 OK
```

```bash
bun services/platform/src/cli/holo.ts verify:identity search
```

```json
{
  "toolId": "search",
  "resolvedId": "hybrid_search",
  "identity": true,
  "consumers": 3,
  "uniqueInstances": 1
}
```

```
holo verify:identity search identity:true OK
```

### Grep audit (task roots: `mcp/` + `tools/`, exclude registry + tests)

```bash
rg --pcre2 -n '(?<![A-Za-z0-9_])\.(safeParse|parse)\s*\(' \
  services/platform/src/mcp services/platform/src/tools \
  --glob '!**/*test*' --glob '!**/registry.ts'
```

```
(no matches)
```

→ **0 lines** under the singularity roots. Matches AC-2 MUST_OBSERVE.

**AC-2 satisfied.**

---

## AC-3 — Tripwire coverage at agent/stream call sites — PASS (FIXED)

### Prior FAIL (superseded)

Previous review at HEAD `8ac414d` found **zero** `tripwire` hits and the sole `agent.generate()` call site in `compat/cells/agent.ts` ignored `result.tripwire`. That blocked APPROVED.

### FIX landed (`2e8eaa8`)

| File | Role |
|------|------|
| `services/platform/src/mastra/tripwire.ts` | `assertNoTripwire`, `handleStreamChunk`, `assertNoTripwireInStream`, `TripwireError` |
| `services/platform/src/compat/cells/agent.ts` | sole production generate site → `assertNoTripwire(result)` fail-closed |
| `services/platform/src/mastra/__tests__/tripwire.test.ts` | pure-logic suite (UNIT_TEST_JUSTIFIED for helpers) |

### Grep evidence (re-run this session — MUST_OBSERVE)

```bash
rg -n 'result\.tripwire' services/platform/src/
# COUNT: 6 hits (non-test production + docs in helper)
```

Key production hits:

```
services/platform/src/mastra/tripwire.ts:5:  * - generate: `result.tripwire` + often `finishReason === 'other'`
services/platform/src/mastra/tripwire.ts:75: * (`result.tripwire` present, or `finishReason === 'other'` without a payload).
services/platform/src/mastra/tripwire.ts:79:  if (result.tripwire) {
services/platform/src/mastra/tripwire.ts:80:    throw new TripwireError(normalizeTripwire(result.tripwire));
services/platform/src/compat/cells/agent.ts:101:    // assertNoTripwire checks result.tripwire (+ finishReason === 'other').
```

```bash
rg -n "chunk\.type\s*===\s*['\"]tripwire['\"]" services/platform/src/
# COUNT: 4 hits
```

```
services/platform/src/mastra/tripwire.ts:6: * - stream:   `chunk.type === 'tripwire'` with payload
services/platform/src/mastra/tripwire.ts:111:  if (chunk.type === 'tripwire') {
services/platform/src/mastra/__tests__/tripwire.test.ts:63:  it('detects chunk.type === "tripwire" ...
services/platform/src/mastra/__tests__/tripwire.test.ts:109:  it('throws TripwireError on chunk.type === "tripwire" ...
```

```bash
rg -c 'tripwire' services/platform/src/
# total tripwire lines across src: 65
```

### Call-site coverage (every generate/stream)

```bash
rg -n '\.generate\(|\.stream\(|fullStream' services/platform/src/ --glob '!**/*test*'
```

| Site | Handling |
|------|----------|
| `compat/cells/agent.ts:97` `agent.generate(...)` | **PASS** — `assertNoTripwire(result)` at L103; on `TripwireError` returns `ok: false` + tripwire payload (never success) |
| `mastra/tripwire.ts` stream helpers | **PASS** — `handleStreamChunk` branches on `chunk.type === 'tripwire'`; `assertNoTripwireInStream` consumes fullStream fail-closed |
| Other `.stream(` production call sites | **none** in platform src |

Composition root still has `agents: {}` / `workflows: {}` (deferred product agents). That is **not** an AC-3 failure when the only live call site is covered and reusable stream/generate helpers exist for future agents.

### Helper behavior (code review + unit suite)

`assertNoTripwire` (L78–90 `tripwire.ts`):

1. Throws `TripwireError` when `result.tripwire` present  
2. Defense in depth: `finishReason === 'other'` without tripwire payload → still fail closed  

`handleStreamChunk` (L110–129): returns `{ action: 'tripwire', tripwire: {...} }` on stream tripwire chunks.

```bash
cd services/platform && bun test src/mastra/__tests__/tripwire.test.ts
# 8 pass, 0 fail, 20 expect() calls
```

### AC-3 evaluation

| MUST_OBSERVE | Observed |
|--------------|----------|
| `grep 'result.tripwire'` ≥1 hit at agent call sites | **6 hits** including generate path + call site wiring |
| `grep tripwire` / stream `chunk.type === 'tripwire'` ≥1 | **4 hits** for stream pattern; helpers + tests |

**AC-3 satisfied.**

---

## `/health` real probe validation — PASS (not static)

### Live (Postgres accepting, fleet :4545 up) — re-captured

```bash
curl -sS -w "\nHTTP %{http_code}\n" http://127.0.0.1:4111/health
```

```
{"status":"ok","db":{"ready":true,"latency_ms":11},"fleet":{"ready":true,"endpoint":"http://127.0.0.1:4545","latency_ms":8},"queue":{"ready":true,"latency_ms":1}}
HTTP 200
```

Second call (latencies vary — not a hardcoded body):

```
{"status":"ok","db":{"ready":true,"latency_ms":7},"fleet":{"ready":true,"endpoint":"http://127.0.0.1:4545","latency_ms":2},"queue":{"ready":true,"latency_ms":1}}
```

### Negative control — dead `DATABASE_URL` on :4112

```bash
export DATABASE_URL=postgres://127.0.0.1:59999/holocron_dead
export PORT=4112
bun run services/platform/src/index.ts
curl -sS -w "\nHTTP %{http_code}\n" http://127.0.0.1:4112/health
```

```
{"status":"degraded","db":{"ready":false,"latency_ms":4,"error":"connect ECONNREFUSED 127.0.0.1:59999"},"fleet":{"ready":true,"endpoint":"http://127.0.0.1:4545","latency_ms":8},"queue":{"ready":true,"latency_ms":1}}
HTTP 503
```

**Static-stub would still return 200 / `db.ready:true`.** Observed fail-closed path proves live probes.

---

## `resolveModel` fail-closed — PASS

### Unknown role

```bash
bun services/platform/src/cli/holo.ts manifest:resolve nonexistent
```

```json
{
  "ok": false,
  "error": "UNKNOWN_ROLE",
  "role": "nonexistent",
  "message": "unknown fleet role: nonexistent"
}
```

exit: 1

### Live role (fleet up)

```bash
bun services/platform/src/cli/holo.ts manifest:resolve divergent
```

```json
{
  "role": "divergent",
  "endpoint": "http://127.0.0.1:4545",
  "litellmModelId": "implementer",
  "modelRevision": "qwen3.6-35b-a3b-mtp-q8_k_xl",
  "contextLimit": 32768,
  "concurrency": 4,
  "timeoutMs": 120000,
  "structuredOutput": true,
  "degradationAction": "surface-unavailable",
  "healthy": true,
  "baseURL": "http://127.0.0.1:4545/v1"
}
```

exit: 0

### Unreachable endpoint (fail-closed, no fake success)

```ts
await resolveModel("divergent", { endpointOverride: "http://127.0.0.1:1" });
// services/platform/src/inference/resolve-model.ts
```

```json
{
  "name": "RoleUnavailableError",
  "code": "ROLE_UNAVAILABLE",
  "message": "fleet role 'divergent' unreachable at http://127.0.0.1:1 (degradation=surface-unavailable): health probe failed at http://127.0.0.1:1/v1/models: Unable to connect. Is the computer able to access the url?"
}
```

---

## AP-7 — NO RLS / NO multi-tenant — PASS

```bash
rg -ni 'ENABLE ROW LEVEL|CREATE POLICY|multi.?tenant|tenantId|tenant_id' \
  services/platform/src/ --glob '!**/*.json'
# only hit:
services/platform/src/http/middleware/scoped-key.ts:4:
  * Personal-app control plane over Tailscale (AP-7) — NOT RLS / multi-tenant.

rg -n '"isRLSEnabled": true' services/platform/src/
# (no isRLSEnabled:true)
```

Trust boundary is Tailscale + scoped keys (RN / MCP / control). **AP-7 satisfied.**

---

## Stub-detection (SUPREME RULE) — PASS on core auth/registry/health/resolve/tripwire paths

| Pattern | Result |
|---------|--------|
| Fake-success `execute: async () => ({ ok: true })` | no matches |
| `vi.mock` / `jest.mock` of `@mastra` | no matches |
| `inputSchema: z.any()` / `outputSchema: z.any()` | no matches |
| `.skip` / `.todo` / `xit` / `xtest` / `xdescribe` in platform tests | no matches |

**Notes (not SUPREME RULE failures for this sprint’s gates):**

- Mission list / MCP Streamable handlers remain **auth-surface placeholders** after middleware — documented deferral to later sprints.
- Tripwire unit tests are pure-logic (no I/O) and justified for the helper module; production wiring is the call-site `assertNoTripwire` after real `agent.generate` shape.

---

## Plan-vs-implementation drift

| Planner expectation | Shipped | Severity |
|---------------------|---------|----------|
| Agents/workflows with Mastra 1.x tripwire (AC-3) | Helpers + sole generate site wired; composition root still empty agents/workflows | **Resolved for AC-3** (call-site coverage + reusable stream path) |
| Shared tool registry + identity | 44 tools, `===` identity, `duplicates:0` | Aligned |
| Scoped-key RN/MCP/control | Implemented + proven on wire | Aligned |
| Real `/health` probes | Implemented + proven | Aligned |
| `resolveModel` fail-closed | Implemented + proven | Aligned |
| Mission engine / MCP Streamable HTTP | Placeholders behind auth | Expected deferral (documented) |

---

## Findings

### HIGH (must fix before APPROVED)

*(none — prior HIGH AC-3 tripwire resolved by `2e8eaa8`)*

### MEDIUM (fix soon — non-blocking for this sprint’s ACs)

1. **TDD chronology** — service-4 did not land a pure pre-impl RED commit; RED was module-miss + in-suite negatives. Prefer future sprints keep RED commits that assert wrong HTTP/status before GREEN.
2. **Mission/MCP placeholders** — fine for Sprint 05 auth surface; ensure later sprints do not ship product logic that still returns static `{ ok: true }` without real mission/MCP work (SUPREME RULE when those features claim complete).
3. **Empty composition-root agents/workflows** — when first production agent is registered, reuse `assertNoTripwire` / `assertNoTripwireInStream` at **every** new call site (lint gate recommended: files calling `.generate(`/`.stream(` must import tripwire helpers).

### LOW (track)

4. `fleet/manifest.ts` Zod `safeParse` and `db/probe.ts` enum `safeParse` sit outside tool-registry audit roots by design — document so whole-tree greps do not false-alarm singularity.
5. Boot observability serviceName still `compat-spike` in `mastra.ts` — naming leftover from Sprint 04.

---

## Verification evidence reviewed

| Kind | Detail |
|------|--------|
| Live server boot | `bun run services/platform/src/index.ts` on :4111 with `HOLO_KEY_*` + `DATABASE_URL=postgres://127.0.0.1:5432/holocron` |
| Curl 401/403/200 | Embedded in AC-1 section (re-captured this re-review) |
| Health live + dead DB | Live 200 on :4111; dead DB 503 on :4112 |
| CLI | `verify:no-dup-validation`, `verify:identity search`, `manifest:resolve divergent\|nonexistent` |
| resolveModel dead endpoint | `RoleUnavailableError` / `ROLE_UNAVAILABLE` |
| Tripwire greps | `result.tripwire` ≥1 (6); stream tripwire ≥1 (4) |
| Tripwire unit suite | 8/8 pass |
| FIX commit | `2e8eaa8` + merge `42630ed` on main, synced to worktree as `8f080fa` |
| Studio screenshot | N/A (HTTP control plane; curl is the verification surface) |
| Server teardown | Processes on :4111 and :4112 terminated after probes |

---

## AC checklist (service-5)

- [x] **AC-1 (PRIMARY)**: auth boundary 401/403/200 with curl evidence  
- [x] **AC-2**: registry singularity (`duplicates:0`, identity true, grep 0 in audit roots)  
- [x] **AC-3**: tripwire coverage at agent/stream call sites — **≥1 result.tripwire + ≥1 stream tripwire; PASS**  
- [x] Report exists with explicit **Verdict:** line  

---

## Change from prior review

| Item | Prior (NEEDS_FIXES) | This re-review |
|------|---------------------|----------------|
| AC-3 greps | 0 hits | 6 `result.tripwire` + 4 stream tripwire |
| generate call site | ignored tripwire | `assertNoTripwire(result)` fail-closed |
| stream handlers | none | `handleStreamChunk` + `assertNoTripwireInStream` |
| Verdict | NEEDS_FIXES | **APPROVED** |

---

*End of adversarial re-review. No production code modified. Server processes terminated after evidence capture.*
