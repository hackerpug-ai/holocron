# Epic 5: Backend Performance

> **Priority**: P1 (High)
> **PRD Sections**: S2.9 (Convex Query & Performance)
> **Tasks**: 12 tasks planned

## Overview

Eliminate full table scans, replace manual JS computations with native Convex primitives, and fix type-unsafe backend patterns.

## Human Test

1. Run the app — research queries are fast (no full table scans)
2. Check Convex dashboard — zero full table scan warnings
3. Review code — all queries use indexes where available
4. Typecheck — all backend functions have proper context types

## PRD Coverage

- **S2.9 Convex Query & Backend Performance** (AC-46 to AC-57)
  - Replace full table scans with indexed queries
  - Use native `ctx.vectorSearch` instead of manual JS cosine similarity
  - Replace `as any` casts on scheduler/cron refs with `makeFunctionReference`
  - Replace `ctx: any` with proper `ActionCtx`, `MutationCtx`, `QueryCtx`
  - Replace `v.string()` confidence fields with `v.union(v.literal(...))`
  - Replace count implementations that load entire tables
  - Delete read-after-write `ctx.db.get()` calls
  - Use index-filtered queries for iterations
  - Replace `v.any()` with `v.record()` minimum
  - Replace `ruleValue` `v.any()` with proper union
  - Match subscription filter types
  - Verify function references exist

## Dependencies

**Blocks**: Epic 6 (frontend polish depends on backend types being correct)
**Blocked by**: Epic 1 (must complete git history rewrite first)

## Tasks

- [BP-001](BP-001.md): Replace full table scans with indexed queries (documents)
- [BP-002](BP-002.md): Replace manual JS cosine similarity with vector search
- [BP-003](BP-003.md): Fix scheduler/cron `as any` casts
- [BP-004](BP-004.md): Replace `ctx: any` with proper types (confidence field)
- [BP-005](BP-005.md): Replace count implementations that load entire tables
- [BP-006](BP-006.md): Delete read-after-write `ctx.db.get()` calls
- [BP-007](BP-007.md): Use index-filtered queries for iterations
- [BP-008](BP-008.md): Replace `v.any()` with `v.record()` minimum
- [BP-009](BP-009.md): Replace `ruleValue` `v.any()` with proper union
- [BP-010](BP-010.md): Match subscription filter types
- [BP-011](BP-011.md): Verify function references exist
- [BP-012](BP-012.md): Final performance verification

## Success Metrics

- Zero full table scans in queries
- All vector searches use native Convex `vectorSearch`
- All backend functions have proper context types
- `v.any()` reduced to <10
- Count queries don't load entire tables
