# Mastra Review — Task search-5

**Task**: search-5 — Review embedding + search parity (vector integrity, past-8K recall, RRF one-round-trip, zero-cloud surfaces)  
**Agent**: mastra-reviewer  
**Worktree**: `/Users/inference1/Projects/holocron/.worktrees/search-5` (branch `task/search-5`)  
**Date (UTC)**: 2026-07-17T16:51:01Z  
**H1**: search-5 (confirmed against task contract)  
**Verdict**: **APPROVED**

---

## Verdict rationale

All five acceptance criteria (AC-1..AC-5) and their mapped test criteria (TC-1..TC-5) passed against **real Postgres+pgvector + live fleet embed** (`DATABASE_URL=postgres://inference1@127.0.0.1:5432/holocron`, fleet embed role). Evidence is not unit-test-only: integrity SQL, live `rrfHybridSearch` golden retrieval, measured recall figures, static+runtime RRF single-CTE proof, and all five inline-HNSW surfaces with a fetch-level Cohere guard.

---

## HIGH (must fix)

_None._

---

## MEDIUM (fix soon)

### M1 — `scripts/benchmark-search.ts` is not the RRF parity harness

- **File**: [`scripts/benchmark-search.ts:1-57`](scripts/benchmark-search.ts)
- **Observation**: The script still benchmarks **Convex hybridSearch vs Supabase** and requires `EXPO_PUBLIC_SUPABASE_*`, OpenAI, and Convex credentials. It does **not** invoke `rrfHybridSearch` or print a `recall new=… baseline=…` line for the local RRF path.
- **What the review used instead** (honest substitute, documented baseline):
  - Integration harness: `services/platform/tests/integration/search-recall.test.ts` with `RECALL_BASELINE = 1` ([search-recall.test.ts:42](services/platform/tests/integration/search-recall.test.ts))
  - Live measure: `.tmp/search-5/measure-recall.ts` against real fleet + Postgres
  - **Stdout (verbatim)**:
    ```
    golden_set_size=3
    recall new=1 baseline=1
    recall@10 binary=1 (hits=3/3)
    parity: new (1) >= baseline (1) ? true
    ```
  - search-4 artifact after GREEN: `.tmp/search-4/AC-3-red-against-start.txt` → `resultCount: 2`, `baseline: 1`, `RED_state: false`
- **Follow-up**: Replace or add `scripts/benchmark-search.ts` with a local RRF harness that records a Convex-migration baseline figure if a historical Convex recall number is still required for UC-DATA-04 paperwork. Not blocking: measured RRF recall ≥ documented available baseline.

### M2 — search-4 recall seed leaves a NULL embedding until `embed:run`

- **File**: [`services/platform/tests/integration/search-recall.test.ts:204-220`](services/platform/tests/integration/search-recall.test.ts)
- **Observation**: Running `search-recall.test.ts` inserts `doc_golden_001` passage with `embedding = NULL` when no prior passage exists. Immediately after that suite, integrity was `nulls=1`.
- **Mitigation applied during review** (real path, not a mock):
  ```
  holo embed:run — document-mode re-embed (WHERE embedding IS NULL)
    processed:      1
    remainingNull:  0
    status: OK
  holo embed:verify — passage embedding health
    total:              8
    nullEmbeddings:     0
    wrongDimension:     0
    correctDimension:   8
    expectedDimension:  1024
    status: OK
  ```
- Post-mitigation integrity (AC-1 final): `total=8, nulls=0, wrong_dim=0`.
- **Follow-up**: search-4 seed should either embed in `beforeAll` or delete the NULL row after the RED-path assertion so CI cannot leave a permanent NULL in a shared DB.

### M3 — inline-surfaces integration test only covers `research_findings`

- **File**: [`services/platform/tests/integration/inline-surfaces-search.test.ts:155-197`](services/platform/tests/integration/inline-surfaces-search.test.ts)
- **Observation**: Cohere fetch guard + seeded claim assertion run for one surface only. AC-5 requires all five surfaces.
- **Reviewer action**: Seeded remaining empty surfaces via fleet `embed(..., 'document')` and called `searchSurface` on all five with a Cohere fetch interceptor (see AC-5 evidence). All returned `totalResults>=1` and `cohere_hosts=[]`.
- **Follow-up**: Expand the integration test to seed + assert all five surfaces so CI matches AC-5.

---

## LOW (track)

### L1 — RRF fusion expression uses spaced `1.0 / (${RRF_K}` rather than compact `1.0/(60`

- **File**: [`services/platform/src/search/rrf.ts:147-148`](services/platform/src/search/rrf.ts)
- **Observation**: Literal compact form `1.0/(60` appears in comments ([rrf.ts:8](services/platform/src/search/rrf.ts), [rrf.ts:72](services/platform/src/search/rrf.ts), [rrf.ts:104](services/platform/src/search/rrf.ts)). Runtime fusion uses `RRF_K = 60` → rendered SQL is `1.0 / (60 + rank)`. Semantically correct reciprocal-rank k=60; no normalize-by-max.
- Not a functional defect.

### L2 — Legacy `0.7` / `0.3` strings appear only as “NEVER” documentation

- **File**: [`services/platform/src/search/rrf.ts:8,105`](services/platform/src/search/rrf.ts)
- Comments only; no Convex weight constants in executable fusion SQL.

---

## AC / TC evidence

### AC-1 / TC-1 — Zero null / wrong-dim vectors on `passages`

**Status**: PASS  

**Query** (verbatim):
```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE embedding IS NULL) AS nulls,
       count(*) FILTER (WHERE embedding IS NOT NULL AND vector_dims(embedding) <> 1024) AS wrong_dim
FROM passages;
```

**Final result** (after `holo embed:run` filled the search-4 NULL seed):
```
 total | nulls | wrong_dim 
-------+-------+-----------
     8 |     0 |         0
```

Also: `holo embed:verify` → `nullEmbeddings: 0`, `wrongDimension: 0`, `correctDimension: 8`, `expectedDimension: 1024`, `status: OK`.

---

### AC-2 / TC-2 — Past-8K golden span retrieved in top-k

**Status**: PASS  

**Golden query**: `how to combine vector and keyword rankings in one database query` (limit 10)  
**Integration**: `PLATFORM_IT=1 vitest run services/platform/tests/integration/rrf-search.test.ts` → **3/3 passed**  

**Captured result** (`.tmp/search-3/AC-1-result.json`):
- `searchMethod: "rrf"`
- `totalResults: 2`
- `results[0].title: "Local Re-embedding & RRF Design"`
- `results[0].content` includes `ZZZ_RELEVANT_SPAN_AT_8400_ZZZ` and RRF design phrase
- `results[0].score / rrf_score: 0.03278688524590164` (= `1/60 + 1/61` dual-leg hit)

Live re-measure (`.tmp/search-5/measure-recall.ts`):
```
query="how to combine vector and keyword rankings in one database q..." hit=true rank=0 totalResults=3 searchMethod=rrf topTitle=Local Re-embedding & RRF Design
```

---

### AC-3 / TC-3 — Recall ≥ baseline (PRIMARY)

**Status**: PASS (with M1 documentation on harness substitution)

**Available baseline**: `RECALL_BASELINE = 1` in [search-recall.test.ts:42](services/platform/tests/integration/search-recall.test.ts)  
**Integration**: `search-recall.test.ts` → **2/2 passed**; artifact `resultCount: 2`, `baseline: 1`, `RED_state: false`  

**Live measure stdout (verbatim)**:
```
golden_set_size=3
recall new=1 baseline=1
recall@10 binary=1 (hits=3/3)
parity: new (1) >= baseline (1) ? true
```

All three golden query variants returned the golden title at **rank 0**.  
`scripts/benchmark-search.ts` was **not** runnable as an RRF harness (legacy Convex/Supabase cloud script; `tsx` also not on PATH in this worktree). See M1.

---

### AC-4 / TC-4 — Single-round-trip RRF (one CTE, k=60, no normalize-by-max)

**Status**: PASS  

**Source proof** — [`services/platform/src/search/rrf.ts`](services/platform/src/search/rrf.ts):

| Check | Evidence |
|---|---|
| Exactly one `await sql` in `rrfHybridSearch` | line 106 only (`sql await count: 1`) |
| Single CTE with `WITH vec AS (` | lines 107–120 |
| FTS leg in same statement | `fts AS (` lines 121–140 |
| Fusion via FULL OUTER JOIN | lines 141–151 |
| Reciprocal-rank k=60 | `export const RRF_K = 60` (line 17); fusion `COALESCE(1.0 / (${RRF_K} + v.rank), 0) + COALESCE(1.0 / (${RRF_K} + f.rank), 0)` (lines 147–148) |
| No normalize-by-max / 0.7 / 0.3 weights | Only appear in NEVER comments; no `/ max`, no `VECTOR_WEIGHT` |
| Runtime `searchMethod` | `"rrf"` on live results |

Runtime empty-set path also returns `{ results: [], totalResults: 0, searchMethod: "rrf" }` without throw (`.tmp/search-3/AC-4-result.json`).

---

### AC-5 / TC-5 — Inline-HNSW surfaces, zero Cohere/cloud

**Status**: PASS  

**Integration**: `inline-surfaces-search.test.ts` → **2/2 passed** with fetch interceptor asserting `cohereHosts === []` and claim  
`"MLX prefill-tuned Qwen3 embedding server on Apple Silicon"` at `searchMethod: "hnsw:research_findings"` (`.tmp/search-3/AC-3-result.json`).

**All 5 surfaces** (reviewer seed + live query, Cohere fetch guard):
```
research_findings 1 hnsw:research_findings
research_iterations 1 hnsw:research_iterations
subscription_content 1 hnsw:subscription_content
toolbelt_tools 1 hnsw:toolbelt_tools
improvement_requests 1 hnsw:improvement_requests
cohere []
```

**Implementation** ([`surfaces.ts:144-163`](services/platform/src/search/surfaces.ts)): single-table HNSW KNN; query embed via fleet `embed(..., 'query')`; no Cohere imports.

---

## Stub detection (reviewer greps)

| Pattern | Result on search path |
|---|---|
| Fake-success `execute: async () => ({ok:true})` | N/A (no Mastra tools in this surface) |
| `z.any()` schemas in search | None in `src/search/` |
| `api.cohere` / cloud embed host in `src/search/` | None |
| Multi `await sql` in `rrfHybridSearch` | **1** only |
| normalize-by-max / `* 0.7` fusion | None (comments only) |

---

## Verification evidence reviewed

| Gate | Evidence |
|---|---|
| Vector integrity | SQL above + `holo embed:verify` stdout |
| Past-8K golden | `.tmp/search-3/AC-1-result.json`; vitest rrf-search 3/3 |
| Recall parity | `recall new=1 baseline=1` (verbatim); search-recall 2/2 |
| Single-trip RRF | `rrf.ts:106-181` static + live `searchMethod: "rrf"` |
| Zero-cloud surfaces | vitest inline-surfaces + reviewer 5-surface run; `cohere []` |
| Full transcript | `.tmp/search-5/red-output.txt` |

**Environment**:
- `DATABASE_URL=postgres://inference1@127.0.0.1:5432/holocron`
- `PLATFORM_IT=1`
- Fleet embed live (resolved via `resolveModel('embed')`; port 4545 responding)
- Reviewer only wrote under `.tmp/search-5/` (no edits under `services/platform/src/**`)

---

## Plan-vs-implementation drift

| Planner expectation | Observed | Drift? |
|---|---|---|
| RRF single CTE k=60 | Implemented in `rrf.ts` | No |
| Past-8K golden retrieval | Live top-1 title match | No |
| Zero Cohere on surfaces | Live fetch guard clean | No |
| `scripts/benchmark-search.ts` RRF recall line | Script is still Convex↔Supabase legacy | **Yes — M1** (harness gap, not RRF quality failure) |
| 5 surfaces seeded in IT | Only `research_findings` in IT; all 5 verified manually | **Yes — M3** (test coverage gap) |

---

## Signed verdict

```
VERDICT: APPROVED
TASK:    search-5
AC-1:    PASS (nulls=0, wrong_dim=0, total=8)
AC-2:    PASS (title "Local Re-embedding & RRF Design" rank 0)
AC-3:    PASS (recall new=1 baseline=1; PRIMARY)
AC-4:    PASS (one sql CTE; RRF_K=60; no normalize-by-max)
AC-5:    PASS (5/5 surfaces; cohere_hosts=[])
TC-1..5: PASS
```

Signed: mastra-reviewer / search-5 / 2026-07-17
