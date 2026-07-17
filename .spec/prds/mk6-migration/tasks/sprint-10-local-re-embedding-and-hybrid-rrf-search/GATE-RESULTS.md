# Gate Results: sprint-10-local-re-embedding-and-hybrid-rrf-search

## ✅ VERIFIED — recomputed pass == claimed pass; 7/7 recomputed; 0 discrepancies

**Date:** 2026-07-17  
**Run ID:** 20260717T170458Z  
**Environment:** real Postgres + fleet embed :4545 qwen3-embedding  
**UI driver:** none (0 UI steps)

## Summary
7/7 terminal steps passed against real services.

| # | Result | Notes |
|---|--------|-------|
| 1 | ✅ | holo embed:run |
| 2 | ✅ | embed:verify nulls=0 wrong_dim=0 |
| 3 | ✅ | search past-8K golden in top-k |
| 4 | ✅ | --explain RRF k=60 one round-trip |
| 5 | ✅ | recall new=1 baseline=1 |
| 6 | ✅ | double embed:run idempotent processed=0 |
| 7 | ✅ | --surface research_findings hnsw |

## Proof
- gate-results.json
- gate-verification.json verified:true
- .gate-evidence/20260717T170458Z/step{1..7}.log
