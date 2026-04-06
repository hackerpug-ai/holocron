# Epic 3: Code Quality Foundation

> **Priority**: P1 (High)
> **PRD Sections**: S2.3 (Test Quality Overhaul) + S2.6 (Code Cleanup)
> **Tasks**: 11 tasks planned

## Overview

Replace existence-check tests with behavioral tests and clean up dead code, logging, and documentation artifacts.

## Human Test

1. Run `pnpm vitest run` — all tests pass, zero `expect(fn).toBeDefined()` tests remain
2. Run `grep -r "console.log" convex/` — find <50 instances (down from 490)
3. Check for `.bak` files — none exist in the repo
4. Look for `storybookwork.md`, `PHASE1_VERIFICATION_REPORT.md`, `RULES.md` — all removed or integrated

## PRD Coverage

- **S2.3 Test Quality Overhaul** (AC-16 to AC-22)
  - Delete or replace `expect(fn).toBeDefined()` tests
  - Add behavioral tests for chat flow and conversation CRUD
  - Add edge case tests for confidence scoring and termination logic
  - Replace string-grep source tests with proper component tests
  - All tests pass with `pnpm vitest run`

- **S2.6 Code Cleanup** (AC-35 to AC-38)
  - Document or consolidate `screens/` directory
  - Replace `console.log` with structured logging (<50 remaining)
  - Remove dead docs (`storybookwork.md`, etc.)
  - Clean up committed artifacts (`.bak` files)

## Dependencies

**Blocks**: Epic 4, Epic 5, Epic 6 (clean codebase makes other work easier)
**Blocked by**: Epic 1 (must complete git history rewrite first)

## Tasks

- [CQ-001](CQ-001.md): Audit and categorize all tests
- [CQ-002](CQ-002.md): Delete or replace `toBeDefined()` tests
- [CQ-003](CQ-003.md): Add behavioral tests for chat send flow
- [CQ-004](CQ-004.md): Add behavioral tests for conversation CRUD
- [CQ-005](CQ-005.md): Add edge case tests for confidence scoring
- [CQ-006](CQ-006.md): Add edge case tests for termination logic
- [CQ-007](CQ-007.md): Replace string-grep source tests
- [CQ-008](CQ-008.md): Run full test suite and verify
- [CQ-009](CQ-009.md): Replace console.log with structured logging
- [CQ-010](CQ-010.md): Remove dead documentation files
- [CQ-011](CQ-011.md): Clean up committed artifacts (.bak files)

## Success Metrics

- Zero tests that only check `toBeDefined()`
- <50 `console.log` calls in `convex/` (down from 490)
- All new behavioral tests pass
- Zero `.bak` files in the repository
- Dead documentation removed or integrated
