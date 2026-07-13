---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 2.0.0
---

# Capability Chains

Boundary-crossing sequences (migrate, sync, publish, provision, replay, bill/budget) that must be proven against real services, with idempotency/retry and named owners.

## CAP-MIG-01 — One-time Convex→Postgres ETL

- **Promise:** every legacy relation and retained object lands in Postgres/blob storage with source-catalog-derived reconciliation, referential integrity, and regenerated vectors.
- **Trigger:** Operator runs the ETL after freezing Convex writes.
- **Hops:** durable write fence + cron/queue drain + quiet interval + export watermark → `convex export` snapshot → stage as jsonb → whole-graph `_id`→uuidv7 map → FK-ordered load (status normalized) → **regenerate** vectors via the fleet → every retained blob → content-addressed store → catalog reconciliation gates.
- **Boundary contracts:** source catalog has an approved disposition for every table/field/object; expected target formulas have zero unexplained variance; all FK constraints enforced + NULL-FK audit = 0; jsonb deep-equal sample; status CHECK = 0 violations; blob hash/length/MIME parity; vector dim/non-null/norm.
- **Failure modes:** partial load (idempotent re-run from immutable archive); missed mapping (fail-closed FK); vector regen failure (resumable `WHERE embedding IS NULL`).
- **Idempotency:** re-runnable from the archive; `convex_id_map` stable.
- **Real-service proof:** run against a real `convex export` into real Postgres + real fleet; source-catalog reconciliation and asset manifest green.
- **Owner:** `mastra-implementer` + `red-test-generator` (gates); `convex-reviewer` verifies export completeness.

## CAP-CUT-01 — Big-bang flip & decommission

- **Promise:** the app + MCP serve entirely from the new backend in a rollbackable read-only soak, then enable Postgres writes at the data-plane point of no return; Convex is removed only after recovery proof.
- **Trigger:** Operator executes the cutover after the new stack passes integration.
- **Hops:** parallel build (Convex untouched) → durable freeze + drain → ETL (CAP-MIG-01) → flip app (Zero) + MCP (Postgres client) → read-only real-service verification → rollbackable soak → enable production writes (**data-plane point of no return**) → fresh restore drill → delete Convex deployment → delete code/deps/dead clients.
- **Boundary contracts:** end-to-end pass across app reads, all 44 MCP tools, `/article/`, every cron; all production write paths visibly return `migration_read_only` during soak; `grep -ri convex` clean post-decommission.
- **Failure modes:** Sev-1 gate failure in read-only soak → re-point data plane to Convex via config + pinned build with zero accepted post-export production writes. After the first accepted Postgres write → restore Postgres/blob evidence; never claim Convex rollback.
- **Idempotency:** the read-only flip is config-reversible; write enablement records the data-plane point of no return; deletion is a separate irreversible source-destruction action.
- **Real-service proof:** the human-testing gate runs the full cold-boot journey against real Postgres + Mastra + fleet; the final deletion gate includes a fresh isolated restore journey.
- **Owner:** `integrator` (merge/verify) + Operator (the irreversible step).

## CAP-EMB-01 — Local re-embedding pass

- **Promise:** every document is chunked and embedded to 1024-dim Qwen3 vectors on the fleet, idempotently.
- **Trigger:** ETL step + ongoing `embed-missing` worker.
- **Hops:** stream docs → chunk (~512 tok) → optional contextual header (35B-A3B) → `embed(...,'document')` via LiteLLM `:4545` → bulk-insert `passages` (HNSW).
- **Boundary contracts:** every non-empty doc ≥1 passage; all vectors 1024-dim, non-null, ~unit-norm; query/doc prefix asymmetry honored.
- **Failure modes:** partial embed (resumable `SKIP LOCKED`); fleet down (job pauses, degraded mode); header gen deferrable.
- **Real-service proof:** live `:4545` endpoint; past-8K retrieval assertion passes.
- **Owner:** `mastra-implementer` + `devops-engineer` (fleet embedder route).

## CAP-INF-01 — Role-routed inference with budgeted escape

- **Promise:** every reasoning call hits the fleet by default; Claude only on declared high-stakes + budget-OK; every call metered; fleet-down degrades, never silently cloud-fails.
- **Trigger:** any agent/mission step.
- **Hops:** `resolveModel(role,{allowEscape})` → fleet endpoint (or, if `allowEscape` + budget pre-check passes, Claude) → structured output (constrained + Zod + repair) → telemetry + budget-ledger write.
- **Boundary contracts:** no Anthropic call on the default path; budget ceiling blocks over-limit escape; ASSAY≠CHALLENGE instance; degraded mode on fleet-down.
- **Failure modes:** endpoint down → defined reduced mode; malformed output → bounded repair → explicit fail; budget exceeded → `budget_exceeded` outcome.
- **Real-service proof:** live fleet + one real budgeted Anthropic call + a network assertion.
- **Owner:** `mastra-implementer` + `mastra-reviewer`.

## CAP-SYNC-01 — Zero reactive sync

- **Promise:** a committed Postgres change on a published table reaches a subscribed RN client at p95 within 5 seconds on a healthy tailnet; vectors never cross to the client.
- **Trigger:** any write to a `zero_pub` table.
- **Hops:** write → logical replication slot → zero-cache → client SQLite/IndexedDB → reactive hook re-render.
- **Boundary contracts:** published subset only (vectors/passages excluded); single-column uuid PK replica identity; propagation p95 ≤ 5 seconds on a healthy tailnet.
- **Failure modes:** slot lag / big snapshot (monitor); DDL → publication upkeep; client offline → replay on reconnect.
- **Real-service proof:** real replication slot + real zero-cache; an UPDATE propagates end-to-end.
- **Owner:** `mastra-implementer` + `react-native-ui-implementer`.

## CAP-PUB-01 — Public share-link egress

- **Promise:** an existing `/article/{shareToken}` link keeps rendering the same HTML from the new host.
- **Trigger:** Public Reader opens a share link.
- **Hops:** Tailscale Funnel/reverse proxy → Hono `/article/:shareToken` → `SELECT ... WHERE share_token AND is_public` → ported markdown→HTML → `text/html`.
- **Boundary contracts:** byte-comparable HTML on a sample; token/path compatible; only user-marked-public docs; the sole public egress, narrowly exposed.
- **Failure modes:** rehost missed → links 404 (R11); non-public doc must never render.
- **Real-service proof:** fetch a real share token against the running Hono route; byte-compare.
- **Owner:** `mastra-implementer` + `security-reviewer` (the one public door).
