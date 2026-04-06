# PRD: Open-Source Readiness & Staff Engineer Portfolio Polish

> **Version**: 2.0
> **Date**: 2026-04-06
> **Source**: Red-Hat Hiring Manager Review + Specialist Domain Reviews (React Native, Convex, Frontend/Design)
> **Goal**: Transform Holocron from a private personal project into an impressive open-source portfolio piece suitable for Staff Engineer evaluation

## Problem Statement

Four simulated hiring managers independently reviewed the Holocron codebase for Staff Engineer candidacy, followed by three domain-specialist reviewers (React Native, Convex Backend, Frontend/Design). While all reviewers praised the architecture, AI integration, and voice engineering, they identified open-source hygiene, type safety, test quality, query performance, component polish, and design system compliance as the gaps between "impressive personal project" and "impressive open-source portfolio."

## Sections

| # | Section | Priority | ACs | File |
|---|---------|----------|-----|------|
| 2.1 | [Open-Source Blockers](./01-open-source-blockers.md) | P0 | AC-1 to AC-9 | Secrets, binaries, legal |
| 2.2 | [Type Safety Hardening](./02-type-safety.md) | P1 | AC-10 to AC-15 | `any` elimination, schema validators |
| 2.3 | [Test Quality Overhaul](./03-test-quality.md) | P1 | AC-16 to AC-22 | Behavioral tests |
| 2.4 | [Security Hardening](./04-security.md) | P1 | AC-23 to AC-26 | clearAll guards, rate limiter |
| 2.5 | [README & Documentation](./05-readme-docs.md) | P1 | AC-27 to AC-34 | README refresh, screenshots |
| 2.6 | [Code Cleanup](./06-code-cleanup.md) | P1 | AC-35 to AC-38 | Logging, dead code |
| 2.7 | [Community Readiness](./07-community.md) | P2 | AC-39 to AC-43 | CONTRIBUTING, templates |
| 2.8 | [MCP Server Type Safety](./08-mcp-types.md) | P2 | AC-44 to AC-45 | MCP `as any` reduction |
| 2.9 | [Convex Query & Performance](./09-convex-performance.md) | P1 | AC-46 to AC-57 | Full table scans, indexes |
| 2.10 | [React Native Polish](./10-react-native-polish.md) | P1 | AC-58 to AC-69 | Hooks, dead code, naming |
| 2.11 | [Design System & Frontend](./11-design-system.md) | P1 | AC-70 to AC-81 | Theme compliance, a11y |

## Priority & Sequencing

```
P0 (2.1 Git History & Secrets)     <- MUST be first (destructive git operations)
  |
  v
P1 (2.2 Type Safety)              <- Can parallelize -.
P1 (2.3 Test Quality)             <- Can parallelize  |
P1 (2.4 Security Hardening)       <- Needs 2.2 done   | All parallel after P0
P1 (2.5 README & Docs)            <- Can parallelize  |
P1 (2.6 Code Cleanup)             <- Can parallelize  |
P1 (2.9 Convex Performance)       <- Can parallelize  |
P1 (2.10 React Native Polish)     <- Can parallelize  |
P1 (2.11 Design System)           <- Can parallelize -'
  |
  v
P2 (2.7 Community Files)          <- After all P1 complete
P2 (2.8 MCP Type Safety)          <- After all P1 complete
```

## Non-Functional Requirements

- All changes must pass existing pre-commit hooks (`eslint`, `tsc --noEmit`, `vitest run`)
- Git history rewrite (P0) should be done as a single coordinated operation
- Type changes should not alter runtime behavior — this is a refactor, not a feature change
- Test deletions should only remove tests that provide zero behavioral coverage
- **Nothing should break existing functionality**

## Out of Scope

- Renaming from "Holocron" (requires separate branding decision)
- Z.ai provider replacement (working system, not a code quality issue)
- Full MCP server rewrite (type improvements only)
- New features of any kind — this is purely polish and hardening

## Success Metrics

- Zero API keys in git history
- Zero `any` in `convex/chat/` (currently 57)
- Schema `v.any()` reduced from 30+ to <10
- Test files reduced in count but increased in behavioral coverage
- README accurately reflects the actual codebase
- Document queries use native Convex indexes (zero full table scans)
- Zero dead/stub code in hooks and components
- Design system tokens used consistently (zero hardcoded hex)
- A hiring manager opening the repo sees: LICENSE, CONTRIBUTING, screenshots, clean git history, typed code

## Source Reviews

- [Hiring Manager Panel Review](../../reviews/red-hat-hiring-manager-2026-04-06.md)
- Convex Specialist Review (convex-reviewer agent)
- React Native Specialist Review (rn-reviewer agent)
- Frontend/Design Specialist Review (frontend-reviewer agent)
