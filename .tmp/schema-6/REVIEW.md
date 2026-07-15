# Mastra Review — Task schema-6

**Task**: schema-6 — Review schema vs source catalog + Zero split  
**Reviewer**: mastra-reviewer  
**Branch**: `task/schema-6`  
**Worktree**: `/Users/justinrich/Projects/holocron/.kb-run-sprint/worktrees/schema-6`  
**Date**: 2026-07-14  
**Database**: `postgres://justinrich@127.0.0.1:5432/holocron` (Postgres 18.4, real)  

## Verdict: APPROVED

All five acceptance criteria verified against **real Postgres 18** + live source catalog YAML + `holo` CLI gates. Integration suite `DB_IT=1 bun test tests/integration/` → **15 pass / 0 fail**. No stubs detected in schema/catalog/db verification paths. No source modifications required.

---

## HIGH (must fix)

_None._

## MEDIUM (fix soon)

_None blocking ship of schema-6._

## LOW (track)

- [services/platform/src/db/schema/zero-pub.ts + migration `0002_zero_pub.sql`] `documents` is published as a full table (includes `content` text). CAP-SYNC-01 / 03-data-schema prose says “documents metadata only”; physical publication omits `search_vector` (generated) and has no `embedding`, so vector exclusion holds. If Zero payload size becomes an issue, consider a column-list publication that drops `content` / large fields.
- [services/platform/src/db/repl-status.ts:290-296] Display always reports `columns: N (no vector/embedding)` when `attnames` is non-empty, including full-table members where Postgres enumerates columns. Correct for pass/fail (embedding detection works); cosmetic distinction vs `columns: ALL` is weak when all tables surface numeric counts.

---

## Per-AC evidence

### AC-1 [PRIMARY] Every table/field/storage ref has approved catalog disposition

| Check | Result | Evidence |
|-------|--------|----------|
| `holo catalog:verify` | Exit 0 | `tables: 60/60 approved`, `fields: 797/797 mapped`, `storage refs: 6/6 approved`, `export tables unaccounted: 0` |
| `holo catalog:coverage` | Exit 0 | `fields_mapped: 797`, `storage_refs: 6/6`, `status: OK` |
| Unmapped items | None | No `unmapped` / unaccounted export tables |
| Storage refs | 6/6 | `APR-MIG-STORAGE-001..005` + drop `APR-MIG-DROP-TEMP-AUDIO-001` |

**Artifacts**: `.tmp/schema-6/AC-1-green.txt`, `AC-1-catalog-verify.txt`, `AC-1-catalog-coverage.txt`

**MUST_OBSERVE**: 60/60 tables dispositioned ✓ · all fields mapped ✓ · 6 storage refs covered ✓ · no unmapped ✓  
**MUST_NOT_OBSERVE**: Unmapped table / missing field / uncovered storage — not observed.

**Satisfied: YES**

---

### AC-2 Business 12→3 and research 5→3 merges collapsed

| Check | Result | Evidence |
|-------|--------|----------|
| `holo db:verify --merges` | Exit 0, `status: OK` | analysis trio + research trio; `per-domain shells found: 0` |
| `holo catalog:merges` | Exit 0, `status: OK` | `business: 12 → 3`, `research: 5 → 3`, `per_domain_shell_targets: 0` |
| Live tables | Present | `analysis_sessions`, `analysis_items`, `analysis_evidence`, `research_sessions`, `research_iterations`, `research_findings` |
| Discriminators | Present | `analysis_sessions.type`, `analysis_items.kind`, `analysis_evidence.kind`, `research_*.system` |
| Shell negative control | 0 rows | No `revenue_validation_*`, `competitive_analysis_*`, `ai_roi_*`, `flights_*`, `deep_research_*` relations |

**Artifacts**: `.tmp/schema-6/AC-2-green.txt`, `AC-2-db-verify-merges.txt`, `AC-2-catalog-merges.txt`, `AC-2-shell-negative-control.txt`

**Satisfied: YES**

---

### AC-3 Canonical corpus has exactly one `sources` + one `passages`

| Check | Result |
|-------|--------|
| `\dt sources*` | 1 row: `public.sources` |
| `\dt passages*` | 1 row: `public.passages` |
| Exact counts | `sources_exact=1`, `passages_exact=1`, `sources_like=1`, `passages_like=1` |
| Duplicate `sources_*` / `passages_*` | None |

**Artifacts**: `.tmp/schema-6/AC-3-green.txt`, `AC-3-canonical-corpus.txt`

**Satisfied: YES**

---

### AC-4 Zero split excludes vectors/passages/evidence/citations/telemetry

| Check | Result |
|-------|--------|
| `holo repl:status` | Exit 0, `status: OK`, 0 errors, 34 published tables |
| `wal_level` | `logical` |
| `zero_pub` | Present, `puballtables=f` |
| Forbidden tables in pub | `passages`, `sources`, `claims`, `entities`, `relations`, `beliefs`, `citations`, `agent_telemetry`, `analysis_evidence` → **not in zero_pub** (tables exist in public) |
| `embedding` in any `attnames` | `embedding_published=false` |
| `search_vector` in any `attnames` | `search_vector_published=false` |
| Column-list omit for embedding tables | `research_iterations` (18), `research_findings` (19), `subscription_content` (24), `improvement_requests` (18) — none list `embedding` |
| REPLICA IDENTITY | All 34 published tables `DEFAULT`; `non_default_replica_identity=0` |
| Single-column uuid PK | Confirmed by `repl:status` for every member |

**Artifacts**: `.tmp/schema-6/AC-4-green.txt`, `AC-4-repl-status.txt`, `AC-4-zero-pub-raw.txt`, `AC-4-evidence-exclusion.txt`, `AC-4-replica-identity.txt`

**Adversarial note**: Tables with physical `vector(1024)` columns (`research_findings`, `research_iterations`, `subscription_content`, `improvement_requests`) **are** members of `zero_pub`, but only via **column-list publication that omits `embedding`** (and omits `search_vector`). This matches CAP-SYNC-01 / schema-4 design (`ZERO_PUB_COLUMN_LIST_TABLES`) and is **not** “vectors in publication.” Full-table evidence relations (`passages`, etc.) remain excluded.

**Satisfied: YES**

---

### AC-5 AP-1 no-SQLite and AP-7 no-RLS honored

| Check | Result |
|-------|--------|
| `rg -ni sqlite services/platform/src/db` | **NONE** (also no better-sqlite / libsql / bun:sqlite under db/) |
| `SELECT * FROM pg_policies` | **0 rows** |
| RLS enabled on public tables | **0** |
| Non-system schemas | **`public` only** |
| Multi-tenant schemas | Not observed |

**Artifacts**: `.tmp/schema-6/AC-5-green.txt`, `AC-5-architecture-posture.txt`

**Satisfied: YES**

---

## Integration suite (schema-5 RED suite, live)

```
DB_IT=1 bun test tests/integration/
→ 15 pass, 0 fail, 303 expect() calls
```

| File | Coverage |
|------|----------|
| `db-migrate.test.ts` | migrate green + dead URL / invalid SQL negatives |
| `status-check.test.ts` | status CHECK + Zod alignment |
| `jsonb-roundtrip.test.ts` | jsonb preserve + type negatives |
| `merges-collapsed.test.ts` | 3+3 trios + shell negatives (creates temp shell → verify fails) |
| `replication-ready.test.ts` | zero_pub no passages/vectors + REPLICA IDENTITY; negatives for passages add + NOTHING |

**Artifact**: `.tmp/schema-6/integration-suite.txt`

---

## Stub detection (reviewer scan)

| Pattern | Result |
|---------|--------|
| Fake-success `execute: async () => ({ ok: true })` | None in `services/platform/src/` |
| `z.any()` input/output schemas | None |
| Skipped tests (`.skip` / `.todo` / `xit`) | None under `services/platform/tests/` |
| `vi.mock` / `jest.mock` of `@mastra` | None |
| Gates pass with Postgres down | **Not claimed** — all green paths used live `DATABASE_URL`; integration suite includes dead-URL fail-closed negative |

---

## Plan-vs-implementation drift

| Planner expectation | Shipped state | Drift? |
|---------------------|---------------|--------|
| ~55–60 domain tables, catalog 60/60 | Catalog 60/60; live public base tables **58** (incl. `drizzle_migrations`, `convex_id_map`, evidence + domain) | No material drift — catalog is Convex source surfaces, not 1:1 PG relation count (merges/drops expected) |
| Business 12→3 / research 5→3 | Confirmed live + catalog | None |
| One sources + one passages | Confirmed | None |
| zero_pub excludes vectors/passages/evidence/citations/telemetry | Confirmed via table membership + column lists | None (column-list pattern is intentional) |
| REPLICA IDENTITY DEFAULT | All 34 published | None |
| AP-1 / AP-7 | No sqlite in db layer; 0 RLS policies | None |

---

## Architecture posture cross-check

- **AP-1 (Postgres-only)**: No SQLite references under `services/platform/src/db`. Live engine: PostgreSQL 18.4.
- **AP-7 (no RLS)**: `pg_policies_count=0`, no `relrowsecurity` tables.
- **CAP-SYNC-01**: Reactive subset published; vectors never cross publication boundary; single-column uuid PK + DEFAULT replica identity.

---

## Verification evidence reviewed

1. **Live CLI transcripts** — catalog:verify, catalog:coverage, catalog:merges, db:verify --merges, repl:status (exit 0, status OK).
2. **Live `psql` inspection** — corpus uniqueness, zero_pub membership, attnames vector exclusion, pg_policies, replica identity.
3. **Integration suite** — 15/15 green against real holocron DB (`DB_IT=1`).
4. **Negative controls exercised** — shell tables absent; integration tests inject shells / passages / bad RI and assert fail-closed.

---

## Quality gate (reviewer self-check)

- [x] Read planner task schema-6 in full; task_id asserted
- [x] Read changed sprint schema artifacts / zero-pub / catalog loaders as needed
- [x] Ran all evidence gates against real Postgres (not hand-asserted)
- [x] Greped for stub patterns (documented above)
- [x] Findings cite file:line where applicable
- [x] No rationalization of missing evidence
- [x] Verdict explicit: **APPROVED**

---

## Commit recommendation

```
schema-6: review schema vs catalog + Zero split — APPROVED
```

Evidence-only commit under `.tmp/schema-6/` (scope: review output only; no `services/platform/**` modifications).
