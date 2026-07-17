# Gate Results: sprint-10-local-re-embedding-and-hybrid-rrf-search

## VERIFIED — recomputed pass == claimed pass; 7/7 recomputed; 0 discrepancies

**Date:** 2026-07-17  
**Run ID:** 20260717T172922Z  
**QA Stage:** independent fresh QA stage (prior gate-results.json archived to `gate-results.prev.json`)  
**Environment:** real Postgres (127.0.0.1:5432/holocron) + real fleet embed :4545 qwen3-embedding (MLX)  
**Exec pane:** surface:170 (68C0FFB1-7208-4F26-BFE4-F7D3A6F82A3E) — cmux split  
**QA surface:** 9D21D349-4101-4933-A5FF-46DEBD18D739  
**UI driver:** none (0 UI steps — all 7 steps are terminal/real-cli)  
**Proof:** `gate-verification.json` — verified:true, 0 discrepancies  

## Precondition

The `passages` table was empty at QA start (prior test data cleaned). A golden doc was
seeded as environment setup (replicating the search-3 integration test's `beforeAll`
seed — NOT a gate step). See `.gate-evidence/20260717T172922Z/seed-golden.ts` +
`seed-precondition.log`. This inserted:
- Source "Local Re-embedding & RRF Design" (10048 chars, marker `ZZZ_RELEVANT_SPAN_AT_8400_ZZZ`
  at offset 8400) → 6 chunked passages, embeddings NULL (so `embed:run` does real fleet work)
- Source "search-3 semantic-only seed" → 1 distractor passage, embedding NULL

Step 1 (`embed:run`) then embedded all 7 NULL passages via the real :4545 fleet route.

## Summary

7/7 terminal steps passed against real services.

| # | Gate Step | Method | Result | Evidence |
|---|-----------|--------|--------|----------|
| 1 | `holo embed:run` — every non-empty doc gets ≥1 passage, all vectors 1024-dim non-null | real-cli | PASS | exit 0; `processed:7 remainingNull:0 ok:true` — 7 passages embedded via real fleet |
| 2 | `holo embed:verify` — zero null/wrong-dim vectors; norms ~unit | real-cli | PASS | exit 0; `total:7 nullEmbeddings:0 wrongDimension:0 correctDimension:7 expectedDimension:1024` |
| 3 | `holo search '<span-query>'` — golden doc ranks in top-k | real-cli | PASS | exit 0; top result title="Local Re-embedding & RRF Design"; content includes `ZZZ_RELEVANT_SPAN_AT_8400_ZZZ` past char 8000 |
| 4 | `holo search '<q>' --explain` — pgvector KNN + FTS RRF in one round-trip | real-cli | PASS | exit 0; explain.fusion.method="reciprocal_rank_fusion" k=60 legs=[pgvector_hnsw,fts] roundTrips=1 |
| 5 | `holo search:recall --golden set.json` — recall ≥ baseline | real-cli | PASS | exit 0; `recall new=1 baseline=1` |
| 6 | Re-run `embed:run` twice — idempotent (no duplicate passages) | real-cli | PASS | exit 0; both runs `processed:0 remainingNull:0` (SKIP LOCKED idempotency) |
| 7 | `holo search --surface research_findings '<q>'` — inline-HNSW, no cloud | real-cli | PASS | exit 0; searchMethod="hnsw:research_findings"; result score=0.7535 |

## Per-Step Evidence Logs

All logs at `.gate-evidence/20260717T172922Z/step{1..7}.log` (with `@@GATE-META cmd_sha@@`
header + `@@GATE-EXIT=N@@` trailer), `.exit`, `.assertion.json` per step.

## Failures

None.

## Wiring Gaps

None.

## Proof Chain

- `gate-results.json` — machine verdict (verdict:pass, verified:true)
- `gate-verification.json` — deterministic recompute (verified:true, 0 discrepancies, 7/7 recomputed)
- `gate-plan.json` — pre-execution manifest (7 planned steps, literal_cmd + assertion per step)
- `.gate-evidence/20260717T172922Z/` — raw per-step evidence (logs, exits, assertions)
- `seed-precondition.log` + `seed-golden.ts` — precondition seed documentation
