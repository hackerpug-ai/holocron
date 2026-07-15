# Mastra Review — Sprint 05 / service-5

**Task**: service-5 — Review auth boundary + registry singularity  
**Reviewer**: mastra-reviewer (adversarial)  
**Date (UTC)**: 2026-07-15T02:52:50Z  
**Worktree**: `/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/service-5`  
**Branch**: `task/service-5`  
**Base HEAD reviewed**: `8ac414d20a6aab1cd98471137bf52cf7c028769d` (`Merge task/service-4 into main`)  
**Scope of review**: service-1..4 implementations under `services/platform/src/**` + integration suite under `tests/integration/service/**` (read-only; no implementation edits)

---

## Verdict: NEEDS_FIXES

**Primary gate (auth 401/403/200) and registry singularity PASS with live curl + CLI evidence.**  
**AC-3 tripwire coverage FAILS** — composition root registers `agents: {}` / `workflows: {}`; the only `agent.generate()` call site (compat spike) has **zero** `result.tripwire` / stream-chunk tripwire handling. Per task CRITICAL CONSTRAINTS and AC-3 MUST_OBSERVE, this review **cannot APPROVED** until tripwire is wired at every agent/stream call site (or production agents are registered with tripwire handling and proven by grep).

---

## Executive summary

| Check | Result | Evidence |
|-------|--------|----------|
| AC-1 Auth boundary unkeyed→401 / wrong-scope→403 / keyed→200 | **PASS** | Live curl (embedded below) |
| AC-2 Registry singularity (0 dup Zod parse outside shared registry audit roots) | **PASS** | `holo verify:no-dup-validation` → `duplicates:0`; rg audit |
| AC-3 Tripwire at agent/stream call sites | **FAIL** | `rg tripwire` → 0 hits; `agents: {}` in composition root |
| `/health` real probes (not static) | **PASS** | Live 200 with latency; dead `DATABASE_URL` → 503 + `db.ready:false` |
| `resolveModel` fail-closed | **PASS** | unknown role → `UNKNOWN_ROLE`; dead endpoint → `RoleUnavailableError` |
| AP-7 NO RLS / NO multi-tenant | **PASS** | Explicit comment; all `isRLSEnabled: false`; no tenant policies |
| TDD evidence service-1..4 | **PASS with notes** | Commits + `.tmp/service-{1..4}/` RED/GREEN artifacts; classic RED mostly pre-impl module-miss rather than pure assertion RED |
| Stub / mock of `@mastra` / `z.any()` / skipped tests | **PASS** | Grep clean on production paths |

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

### Curl evidence (real HTTP against booted process)

#### 401 — unkeyed `GET /api/missions`

```bash
curl -sS -w "\nHTTP %{http_code}\n" http://127.0.0.1:4111/api/missions
```

```
{"error":"unauthorized","message":"missing or invalid Authorization Bearer token"}
HTTP 401
```

Raw headers (second capture):

```
HTTP/1.1 401 Unauthorized
Content-Type: application/json
{"error":"unauthorized","message":"missing or invalid Authorization Bearer token"}
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
Content-Type: application/json
{"error":"forbidden","message":"scope 'mcp' is not allowed for /api/missions","scope":"mcp"}
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
Content-Type: application/json
{"ok":true,"route":"GET /api/missions","scope":"rn","missions":[],"note":"placeholder — mission list lands later"}
```

### Additional scope matrix (same boot, same keys)

| Request | Expected | Observed |
|---------|----------|----------|
| unkeyed `POST /api/missions` | 401 | 401 |
| unknown key `Bearer wrong-key` → `GET /api/missions` | 401 | 401 |
| RN → `POST /mcp` | 403 | 403 `scope 'rn' is not allowed for /mcp` |
| MCP → `POST /mcp` | 200 | 200 `scope":"mcp"` |
| CONTROL → `GET /api/missions` | 403 | 403 |
| CONTROL → `POST /api/missions/m1/steer` | 200 | 200 `scope":"control"` |
| unkeyed `GET /health` | not 401/403 | 200 (live) |

### Implementation anchors

- Middleware: `services/platform/src/http/middleware/scoped-key.ts` — unkeyed → 401 (L128–134), unknown key → 401 (L137–138), wrong scope → 403 (L141–149), `/health` exempt (L97–99).
- App wiring: `services/platform/src/http/hono-app.ts` L42–43 `app.use('*', createScopedKeyMiddleware(keys))`.
- Placeholder mission/MCP handlers return 200 **only after** middleware authorizes (auth surface under test; mission engine deferred to later sprints — not a stub of the middleware itself).

**AC-1 satisfied.**

---

## AC-2 — Registry singularity — PASS

### Official CLI audit

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

Audit function (`auditNoDupValidation` in `tools/registry.ts`) intentionally scans **only** `services/platform/src/mcp` and `services/platform/src/tools` (excluding `registry.ts` and `__tests__`) for Zod-style `.parse(` / `.safeParse(`.

```bash
rg -n '(?<![A-Za-z0-9_])\.(safeParse|parse)\s*\(' \
  services/platform/src/mcp services/platform/src/tools \
  --glob '!**/*test*' --glob '!**/registry.ts'
```

```
(no matches)
```

→ **0 lines** under the singularity roots. Matches AC-2 MUST_OBSERVE.

### Full-tree `.parse` / `.safeParse` context (honest inventory — not all are tool-validation dups)

```bash
rg -n '\.parse|\.safeParse' services/platform/src/ \
  --glob '!**/*test*' --glob '!**/migrations/meta/**'
```

| Site | Classification |
|------|----------------|
| `tools/registry.ts` comments + audit scanner | Allowed registry (meta) |
| `fleet/manifest.ts:65` `JSON.parse` | Non-Zod JSON load |
| `fleet/manifest.ts:71` `FleetRoleManifestSchema.safeParse` | Fleet manifest config validation (outside tool registry roots) |
| `db/probe.ts` `JSON.parse` + lifecycle enum `safeParse` | DB probe tooling (outside tool registry roots) |
| `mcp/manifest-replay.ts` `JSON.parse` | Fixture JSON load |
| `catalog/export-reader.ts` `JSON.parse` | NDJSON row parse |
| `compat/cells/tool.ts:53` `outputSchema.parse` | Compat spike self-check (outside audit roots) |

**No second Zod validation layer on agent/workflow/MCP tool I/O in `mcp/` or `tools/`.** Singularity holds for the shared tool registry contract (T-PLAT-006).

**AC-2 satisfied.**

---

## AC-3 — Tripwire coverage at agent/stream call sites — FAIL

### Grep evidence (honest)

```bash
rg -n 'result\.tripwire' services/platform/src/
# (no matches)

rg -n 'tripwire' services/platform/src/
# (no matches)

rg -n "chunk\.type\s*===\s*['\"]tripwire['\"]" services/platform/src/
# (no matches)

rg -n '\.generate\(|\.stream\(|fullStream' services/platform/src/
```

```
services/platform/src/compat/cells/agent.ts:6: * Calls agent.generate() and asserts non-empty text.
services/platform/src/compat/cells/agent.ts:90:      agent.generate('Say "compatibility spike green" and nothing else.')
```

### Composition root reality

`services/platform/src/index.ts`:

```ts
agents: {},
workflows: {},
// ...
console.log(`  mastra:  single composition root (agents/workflows deferred to later tasks)`);
```

Boot log confirms: **agents/workflows deferred to later tasks**.

### Only agent call site (compat spike)

`services/platform/src/compat/cells/agent.ts:90` — `agent.generate(...)` then reads `result.text` **without** checking `result.tripwire` or `finishReason === 'other'`. No `stream` / `fullStream` handlers exist in the platform service.

### AC-3 evaluation

| MUST_OBSERVE | Observed |
|--------------|----------|
| `grep 'result.tripwire'` ≥1 hit at agent call sites | **0 hits** |
| `grep tripwire` ≥1 hit in stream handlers | **0 hits** |

**AC-3 not satisfied.** This is not rationalized away as “out of scope” for the review — the task AC requires tripwire evidence. Honest note: production agents are not registered yet (Sprint 05 composition root deliberately empty). **Follow-up (blocking for APPROVED):** when the first production agent/workflow is registered, wire Mastra 1.x tripwire handling at **every** `generate`/`stream` call site and re-run this review AC-3 greps.

---

## `/health` real probe validation — PASS (not static)

### Live (Postgres accepting, fleet :4545 up)

```bash
curl -sS -w "\nHTTP %{http_code}\n" http://127.0.0.1:4111/health
```

```
{"status":"ok","db":{"ready":true,"latency_ms":12},"fleet":{"ready":true,"endpoint":"http://127.0.0.1:4545","latency_ms":9},"queue":{"ready":true,"latency_ms":1}}
HTTP 200
```

- `latency_ms` fields are positive and vary across calls (not a hardcoded body).
- Implementation: `services/platform/src/http/health.ts` — real `SELECT 1` via `postgres`, real `fetch` to fleet `/v1/models`, real `serviceQueue.isReady()`.

### Negative control — dead `DATABASE_URL` (no Postgres stop required; equivalent fail-closed probe)

```bash
export DATABASE_URL=postgres://127.0.0.1:59999/holocron_dead
bun run services/platform/src/index.ts
curl -sS -w "\nHTTP %{http_code}\n" http://127.0.0.1:4111/health
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
```

```json
{
  "name": "RoleUnavailableError",
  "code": "ROLE_UNAVAILABLE",
  "message": "fleet role 'divergent' unreachable at http://127.0.0.1:1 (degradation=surface-unavailable): health probe failed at http://127.0.0.1:1/v1/models: Unable to connect. Is the computer able to access the url?"
}
```

Cloud endpoint belt-and-suspenders present in `resolve-model.ts` (refuses `api.openai.com` / `api.anthropic.com` / Google generative language).

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

All Drizzle snapshot tables report `"isRLSEnabled": false`. Trust boundary is Tailscale + scoped keys (RN / MCP / control), matching `01-architecture-posture.md` AP-7.

---

## Stub-detection (SUPREME RULE) — PASS on core auth/registry/health/resolve paths

| Pattern | Result |
|---------|--------|
| Fake-success `execute: async () => ({ ok: true })` | no matches |
| `vi.mock` / `jest.mock` of `@mastra` | no matches |
| `inputSchema: z.any()` / `outputSchema: z.any()` | no matches |
| `.skip` / `.todo` / `xit` / `xtest` / `xdescribe` in platform tests | no matches |

**Notes (not SUPREME RULE failures for this sprint’s auth/registry gates):**

- Mission list / MCP Streamable handlers are **auth-surface placeholders** that only run after middleware — documented as Sprint 15+ product surfaces. Middleware itself is real.
- Compat spike `agent.generate` lacks tripwire (covered under AC-3 FAIL above).

---

## TDD evidence summary (service-1 .. service-4)

| Task | Commit | RED evidence | GREEN evidence |
|------|--------|--------------|----------------|
| **service-1** | `f6d9ed4` composition root + `/health` | Prior health stub concerns superseded by live probes; `.tmp/service-1/AC-2-green.txt` records dead-port 503 control | `.tmp/service-1/AC-1-green.txt`, `AC-2-green.txt`, `AC-3-green.txt`, live health above |
| **service-2** | `36c3ef8` shared Zod registry | `.tmp/service-2/red-output.txt` — 7 fail / 2 pass (`Cannot find module '../registry.ts'` before impl) | `.tmp/service-2/green-output.txt`, `cli-gates.txt` (`duplicates:0`, `identity=true`, 44 tools); live `verify:identity` + `verify:no-dup-validation` above |
| **service-3** | `96e4883` scoped-key + resolveModel | `.tmp/service-3/red-output.txt` — suite fails pre-impl (module/package resolution against missing middleware stack) | `.tmp/service-3/green-output.txt` — **23 pass / 0 fail**; curl transcript 401/200/403 matrix; live curls + resolveModel above |
| **service-4** | `ff1723c` integration RED suite on wire | Documented in `.tmp/service-4/negative-control-notes.md` — controlled RED inside suite (mismatched keys → 401; dead DB → 503); classic pre-impl RED carried by service-2/3 artifacts | `.tmp/service-4/green-output.txt` — **20/20** vitest pass; `.tmp/service-4/boundary-curl.txt` |

### TDD honesty notes (MEDIUM, non-blocking for AC-1/2 product gates)

1. **service-2/3 RED runs** primarily failed with **module-not-found / package-not-found**, not with soft-pass on wrong HTTP codes. That still forces RED→GREEN once modules exist, but pure behavioral RED (assert 401, get 200) is stronger and is what the **service-4 integration suite** provides on the live process.
2. **service-4** landed as a GREEN suite against already-merged service-1..3, with **in-suite negative controls** proving non-stubbed keys and DB probes rather than a chronological RED commit before middleware. Acceptable when combined with service-3 RED/GREEN + live curl in this review; not ideal textbook TDD chronology.
3. **No separate RED commit on `main` for service-4 before GREEN** — single commit `ff1723c` includes suite + evidence.

---

## Plan-vs-implementation drift

| Planner expectation | Shipped | Severity |
|---------------------|---------|----------|
| Agents/workflows with Mastra 1.x tripwire (AC-3 fixture) | Empty `agents`/`workflows` on composition root; tripwire absent | **HIGH → drives NEEDS_FIXES** |
| Shared tool registry + identity | 44 tools, `===` identity, `duplicates:0` | Aligned |
| Scoped-key RN/MCP/control | Implemented + proven on wire | Aligned |
| Real `/health` probes | Implemented + proven | Aligned |
| `resolveModel` fail-closed | Implemented + proven | Aligned |
| Mission engine / MCP Streamable HTTP | Placeholders behind auth | Expected deferral (documented) |

---

## Findings

### HIGH (must fix before APPROVED)

1. **[services/platform/src/** — tripwire]** Zero `result.tripwire` / stream tripwire handling. Only call site `compat/cells/agent.ts:90` ignores tripwire. Composition root `agents: {}`. **AC-3 FAIL.** Register agents/workflows with Mastra 1.x tripwire handling at every call site, or add a thin adapter that enforces tripwire checks before any agent is exposed on the service.

### MEDIUM (fix soon)

2. **TDD chronology** — service-4 did not land a pure pre-impl RED commit; RED was module-miss + in-suite negatives. Prefer future sprints keep RED commits that assert wrong HTTP/status before GREEN.
3. **compat spike agent** — when next touched, add `if (result.tripwire) …` even for spike cells so the only existing call site is 1.x-correct.
4. **Mission/MCP placeholders** — fine for Sprint 05 auth surface; ensure Sprint 15+ does not ship product logic that still returns static `{ ok: true }` without real mission/MCP work (SUPREME RULE when those features claim complete).

### LOW (track)

5. `fleet/manifest.ts` Zod `safeParse` and `db/probe.ts` enum `safeParse` sit outside tool-registry audit roots by design — document in operator docs so future greps of whole `src/` do not false-alarm singularity.
6. Boot log still names observability service `compat-spike` in `mastra.ts` createObservability — naming leftover from Sprint 04.

---

## Verification evidence reviewed

| Kind | Detail |
|------|--------|
| Live server boot | `bun run services/platform/src/index.ts` on :4111 with `HOLO_KEY_*` + `DATABASE_URL` |
| Curl 401/403/200 | Embedded in AC-1 section (this report) |
| Health live + dead DB | Embedded in health section |
| CLI | `verify:no-dup-validation`, `verify:identity search`, `manifest:resolve divergent|nonexistent` |
| resolveModel dead endpoint | `RoleUnavailableError` / `ROLE_UNAVAILABLE` |
| Prior sprint artifacts | `.tmp/service-{1,2,3,4}/` on tree |
| Studio screenshot | N/A (HTTP control plane; curl is the verification surface) |
| Server teardown | Process killed after probes; port 4111 freed |

---

## AC checklist (service-5)

- [x] **AC-1 (PRIMARY)**: auth boundary 401/403/200 with curl evidence  
- [x] **AC-2**: registry singularity (`duplicates:0`, identity true, grep 0 in audit roots)  
- [ ] **AC-3**: tripwire coverage at agent/stream call sites — **0 hits; FAIL**  
- [x] Report exists with explicit **Verdict:** line  

---

## Recommended remediation (for a follow-up task, not this review branch)

1. When first production agent is registered on `createMastra()`, wrap every `generate`/`stream` with tripwire handling (Mastra 1.x):
   - `generate` → check `result.tripwire` (+ `finishReason === 'other'`)
   - `stream` → handle `chunk.type === 'tripwire'` on `fullStream`
2. Add a unit/integration assertion or lint gate: `rg tripwire` must hit every file that calls `.generate(`/`.stream(`.
3. Re-run service-5 review → target **Verdict: APPROVED**.

---

*End of adversarial review. No production code modified. Server processes terminated after evidence capture.*
