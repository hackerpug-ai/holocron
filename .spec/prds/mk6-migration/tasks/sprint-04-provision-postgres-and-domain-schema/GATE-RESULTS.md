# Gate Results: sprint-04-provision-postgres-and-domain-schema

## ✅ VERIFIED — recomputed pass == claimed pass; 6/6 recomputed; 0 discrepancies

proof: gate-verification.json

**Date:** 2026-07-15T00:05:37Z  
**Sprint:** sprint-04-provision-postgres-and-domain-schema  
**Environment:** Postgres 18.4 + pgvector 0.8.5 @ 127.0.0.1:5432/holocron (provisional laptop Tailscale host 100.123.216.92)  
**UI driver:** none (CLI-only gate)  
**Exec surface:** in-session-bash (grok orchestrator; all steps terminal CLI against real Postgres)

## Summary

| Metric | Value |
|--------|-------|
| Verdict | **PASS** |
| Steps | 6/6 passed |
| Verified | True |

## Per-Step Results

| # | Gate | Method | Result | Evidence |
|---|------|--------|--------|----------|
| 1 | Run holo db:migrate against a fresh Postgres 18 — applies al… | terminal | pass | `/tmp/holocron-gate-sprint-04-provision-postgres-and-domain-schema/step1.log` |
| 2 | Run holo db:verify --indexes — every declared btree/GIN/HNSW… | terminal | pass | `/tmp/holocron-gate-sprint-04-provision-postgres-and-domain-schema/step2.log` |
| 3 | Run holo db:verify --merges — reports one analysis_* trio an… | terminal | pass | `/tmp/holocron-gate-sprint-04-provision-postgres-and-domain-schema/step3.log` |
| 4 | Run holo db:probe --jsonb cardData — writes and reads a poly… | terminal | pass | `/tmp/holocron-gate-sprint-04-provision-postgres-and-domain-schema/step4.log` |
| 5 | Insert status in-progress via holo db:probe --status — rejec… | terminal | pass | `/tmp/holocron-gate-sprint-04-provision-postgres-and-domain-schema/step5.log` |
| 6 | Run holo repl:status — wal_level=logical, zero_pub covers th… | terminal | pass | `/tmp/holocron-gate-sprint-04-provision-postgres-and-domain-schema/step6.log` |

## Human Testing Gate

Gate: Running `holo db:migrate` against real Postgres 18 applies every Drizzle migration with zero errors, producing all ~55 domain tables with indexes and status CHECK constraints.
