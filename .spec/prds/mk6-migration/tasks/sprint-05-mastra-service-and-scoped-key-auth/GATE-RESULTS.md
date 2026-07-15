# Gate Results: sprint-05-mastra-service-and-scoped-key-auth

## ✅ VERIFIED — recomputed pass == claimed pass; 7/7; 0 discrepancies

**Date:** 2026-07-15T03:05:58Z
**Environment:** Postgres holocron + fleet :4545 + Mastra :4111
**UI driver:** none

## Summary: 7/7 — verdict **pass** verified **True**

| # | Result | Step |
|---|--------|------|
| 1 | pass | Run holo service:up / curl /health — 200 with DB/fleet/queue readiness |
| 2 | pass | curl POST /api/missions/x/steer with no key — 401 |
| 3 | pass | curl with correctly-scoped RN key — 200 |
| 4 | pass | curl MCP mutation with RN key (wrong scope) — 403 |
| 5 | pass | holo registry:probe searchTool — same Zod schema for agent/workflow/MCP |
| 6 | pass | holo verify:no-dup-validation — duplicates absent |
| 7 | pass | holo manifest:resolve divergent — live fleet endpoint |
