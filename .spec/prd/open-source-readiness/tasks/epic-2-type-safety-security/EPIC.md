# Epic 2: Type Safety & Security Hardening

> **Priority**: P1 (High)
> **PRD Sections**: S2.2 (Type Safety Hardening) + S2.4 (Security Hardening)
> **Tasks**: 12 tasks planned

## Overview

Eliminate `any` types in critical code paths and remove dangerous unguarded mutations to demonstrate Staff-level TypeScript proficiency and security awareness.

## Human Test

1. Clone the repository and run `grep -r "as any" convex/` — find fewer than 5 instances (down from 50+)
2. Run `grep -r ": any" convex/` — find zero instances in handler signatures
3. Run `pnpm tsc --noEmit` — passes with zero errors
4. Search for `clearAll` mutations — all are guarded with admin checks
5. Verify rate limiter uses database-backed tracking (no in-memory maps)

## PRD Coverage

- **S2.2 Type Safety Hardening** (AC-10 to AC-15)
  - Zero `any` in `convex/chat/agent.ts` and `index.ts`
  - Status fields use `v.union(v.literal(...))`
  - High-traffic `v.any()` replaced with typed validators
  - `as any` casts in hooks replaced with proper types
  - `tsc --noEmit` passes

- **S2.4 Security Hardening** (AC-23 to AC-26)
  - `clearAll` mutations guarded with admin checks
  - Rate limiter uses database-backed tracking
  - `process.env` merge replaced with targeted key merging
  - `searchResearch` tool uses actual session status

## Dependencies

**Blocks**: Epic 4, Epic 5, Epic 6 (type safety is foundational)
**Blocked by**: Epic 1 (must complete git history rewrite first)

## Tasks

- [TS-001](TS-001.md): Eliminate `any` types in `convex/chat/agent.ts`
- [TS-002](TS-002.md): Eliminate `any` types in `convex/chat/index.ts`
- [TS-003](TS-003.md): Replace `v.string()` with `v.union(v.literal(...))` for status fields
- [TS-004](TS-004.md): Replace high-traffic `v.any()` with typed validators
- [TS-005](TS-005.md): Replace `as any` casts in `hooks/useResearchSession.ts`
- [TS-006](TS-006.md): Run `tsc --noEmit` and fix all errors
- [TS-007](TS-007.md): Guard or remove `clearAll` mutations
- [TS-008](TS-008.md): Replace in-memory rate limiter with database-backed
- [TS-009](TS-009.md): Fix `process.env` merge in MCP config
- [TS-010](TS-010.md): Fix `searchResearch` tool hardcoded status
- [TS-011](TS-011.md): Replace `ctx: any` with proper context types
- [TS-012](TS-012.md): Final type-check and security audit

## Success Metrics

- Zero `any` types in `convex/chat/` directory
- `v.any()` reduced from 30+ to <10
- All `clearAll` mutations guarded
- Rate limiter persists to database
- `tsc --noEmit` passes with zero errors
