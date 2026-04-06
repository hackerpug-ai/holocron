# Task Index: Open-Source Readiness & Staff Engineer Portfolio Polish

> Generated: 2026-04-06
> PRD: /Users/justinrich/Projects/holocron/.spec/prd/open-source-readiness/README.md
> Total Epics: 6
> Total Tasks: 81 (all epics generated)

## Epic Structure

## Epic 1: Open-Source Foundation

**Folder:** `epic-1-open-source-foundation/`

**Human Test:**
1. Clone the repository and see a LICENSE file at the root
2. Search the git history for API keys and find zero results
3. Find no binary files (.ipa, .DS_Store) in the repository
4. See no personal artifacts (interview prep, LinkedIn drafts) in the tree
5. Verify that .env.example uses non-public naming for sensitive keys
6. Confirm no dead directories (backup, old, tmp) exist in the repo

**Tasks:**
- [OS-001](epic-1-open-source-foundation/OS-001.md): Rotate and purge API keys from git history
- [OS-002](epic-1-open-source-foundation/OS-002.md): Remove binary files and add to gitignore
- [OS-003](epic-1-open-source-foundation/OS-003.md): Remove dead directories
- [OS-004](epic-1-open-source-foundation/OS-004.md): Remove personal files
- [OS-005](epic-1-open-source-foundation/OS-005.md): Remove .DS_Store files and update gitignore
- [OS-006](epic-1-open-source-foundation/OS-006.md): Add MIT LICENSE file
- [OS-007](epic-1-open-source-foundation/OS-007.md): Remove dead Supabase infrastructure
- [OS-008](epic-1-open-source-foundation/OS-008.md): Redact personal identifiers from config
- [OS-009](epic-1-open-source-foundation/OS-009.md): Rename sensitive env var in documentation

## Epic 2: Type Safety & Security

**Folder:** `epic-2-type-safety-security/`

**PRD Sections:** S2.2 (Type Safety Hardening) + S2.4 (Security Hardening)

**Tasks:**
- [TS-001](epic-2-type-safety-security/TS-001.md): Eliminate `any` types in `convex/chat/agent.ts`
- [TS-002](epic-2-type-safety-security/TS-002.md): Eliminate `any` types in `convex/chat/index.ts`
- [TS-003](epic-2-type-safety-security/TS-003.md): Replace status field `v.string()` with `v.union(v.literal(...))`
- [TS-004](epic-2-type-safety-security/TS-004.md): Replace high-traffic `v.any()` with typed validators
- [TS-005](epic-2-type-safety-security/TS-005.md): Replace `as any` casts in `hooks/useResearchSession.ts`
- [TS-006](epic-2-type-safety-security/TS-006.md): Run `tsc --noEmit` and fix all errors
- [TS-007](epic-2-type-safety-security/TS-007.md): Guard or remove `clearAll` mutations
- [TS-008](epic-2-type-safety-security/TS-008.md): Replace in-memory rate limiter with database-backed
- [TS-009](epic-2-type-safety-security/TS-009.md): Fix `process.env` merge in MCP config
- [TS-010](epic-2-type-safety-security/TS-010.md): Fix `searchResearch` tool hardcoded status
- [TS-011](epic-2-type-safety-security/TS-011.md): Replace `ctx: any` with proper context types
- [TS-012](epic-2-type-safety-security/TS-012.md): Final type-check and security audit

## Epic 3: Code Quality Foundation

**Folder:** `epic-3-code-quality-foundation/`

**PRD Sections:** S2.3 (Test Quality Overhaul) + S2.6 (Code Cleanup)

**Tasks:**
- [CQ-001](epic-3-code-quality-foundation/CQ-001.md): Audit and categorize all tests
- [CQ-002](epic-3-code-quality-foundation/CQ-002.md): Delete or replace `toBeDefined()` tests
- [CQ-003](epic-3-code-quality-foundation/CQ-003.md): Add behavioral tests for chat send flow
- [CQ-004](epic-3-code-quality-foundation/CQ-004.md): Add behavioral tests for conversation CRUD
- [CQ-005](epic-3-code-quality-foundation/CQ-005.md): Add edge case tests for confidence scoring
- [CQ-006](epic-3-code-quality-foundation/CQ-006.md): Add edge case tests for termination logic
- [CQ-007](epic-3-code-quality-foundation/CQ-007.md): Replace string-grep source tests
- [CQ-008](epic-3-code-quality-foundation/CQ-008.md): Run full test suite and verify
- [CQ-009](epic-3-code-quality-foundation/CQ-009.md): Replace console.log with structured logging
- [CQ-010](epic-3-code-quality-foundation/CQ-010.md): Remove dead documentation files
- [CQ-011](epic-3-code-quality-foundation/CQ-011.md): Clean up committed artifacts (.bak files)

## Epic 4: Documentation & Community

**Folder:** `epic-4-documentation-community/`

**PRD Sections:** S2.5 (README & Documentation) + S2.7 (Community Readiness)

**Tasks:**
- [DOC-001](epic-4-documentation-community/DOC-001.md): Create comprehensive README.md
- [DOC-002](epic-4-documentation-community/DOC-002.md): Create CONTRIBUTING.md guide
- [DOC-003](epic-4-documentation-community/DOC-003.md): Create CODE_OF_CONDUCT.md
- [DOC-004](epic-4-documentation-community/DOC-004.md): Create .github/ISSUE_TEMPLATE/bug_report.md
- [DOC-005](epic-4-documentation-community/DOC-005.md): Create .github/ISSUE_TEMPLATE/feature_request.md
- [DOC-006](epic-4-documentation-community/DOC-006.md): Create .github/pull_request_template.md
- [DOC-007](epic-4-documentation-community/DOC-007.md): Create SECURITY.md
- [DOC-008](epic-4-documentation-community/DOC-008.md): Add project description to package.json
- [DOC-009](epic-4-documentation-community/DOC-009.md): Verify documentation links are valid
- [DOC-010](epic-4-documentation-community/DOC-010.md): Verify examples work from scratch
- [DOC-011](epic-4-documentation-community/DOC-011.md): Final documentation review

## Epic 5: Backend Performance

**Folder:** `epic-5-backend-performance/`

**PRD Sections:** S2.9 (Convex Query & Performance)

**Tasks:**
- [BP-001](epic-5-backend-performance/BP-001.md): Replace unindexed `.collect()` with indexed queries
- [BP-002](epic-5-backend-performance/BP-002.md): Add search index for text queries
- [BP-003](epic-5-backend-performance/BP-003.md): Use `ctx.vectorSearch` for similarity search
- [BP-004](epic-5-backend-performance/BP-004.md): Replace `scheduler` and `cron` `as any` with proper types
- [BP-005](epic-5-backend-performance/BP-005.md): Replace `confidenceLevel` `v.string()` with union
- [BP-006](epic-5-backend-performance/BP-006.md): Replace `.collect().length` with count patterns
- [BP-007](epic-5-backend-performance/BP-007.md): Replace `ctx.db.get()` after `ctx.db.patch()` with return value
- [BP-008](epic-5-backend-performance/BP-008.md): Replace `v.any()` with `v.record()` minimum
- [BP-009](epic-5-backend-performance/BP-009.md): Replace `ruleValue` `v.any()` with proper union
- [BP-010](epic-5-backend-performance/BP-010.md): Match subscription filter types
- [BP-011](epic-5-backend-performance/BP-011.md): Verify function references exist
- [BP-012](epic-5-backend-performance/BP-012.md): Final performance verification

## Epic 6: Frontend Polish

**Folder:** `epic-6-frontend-polish/`

**PRD Sections:** S2.10 (React Native Polish) + S2.11 (Design System & Frontend) + S2.8 (MCP Type Safety)

**Tasks:**
- [RN-001](epic-6-frontend-polish/RN-001.md): Remove `.bak` files from repository
- [RN-002](epic-6-frontend-polish/RN-002.md): Fix `useUrlValue` hook pattern
- [RN-003](epic-6-frontend-polish/RN-003.md): Fix `useListValues` hook pattern
- [RN-004](epic-6-frontend-polish/RN-004.md): Fix `useDebounce` hook implementation
- [RN-005](epic-6-frontend-polish/RN-005.md): Fix `usePrevious` hook implementation
- [RN-006](epic-6-frontend-polish/RN-006.md): Convert `useQueryResults` to kebab-case
- [RN-007](epic-6-frontend-polish/RN-007.md): Convert `useSearchResults` to kebab-case
- [RN-008](epic-6-frontend-polish/RN-008.md): Fix `useScroll` hook pattern
- [RN-009](epic-6-frontend-polish/RN-009.md): Remove or fix dead `useHydrated` hook
- [RN-010](epic-6-frontend-polish/RN-010.md): Remove or fix dead `useBreakpoints` hook
- [RN-011](epic-6-frontend-polish/RN-011.md): Remove or fix dead `useLocalSearchParams` hook
- [RN-012](epic-6-frontend-polish/RN-012.md): Remove or fix dead `useSegments` hook
- [RN-013](epic-6-frontend-polish/RN-013.md): Fix `useRouting` hook implementation
- [DS-001](epic-6-frontend-polish/DS-001.md): Replace hardcoded colors with theme tokens
- [DS-002](epic-6-frontend-polish/DS-002.md): Replace hardcoded spacing with theme tokens
- [DS-003](epic-6-frontend-polish/DS-003.md): Replace hardcoded typography with theme tokens
- [DS-004](epic-6-frontend-polish/DS-004.md): Replace hardcoded border radius with theme tokens
- [DS-005](epic-6-frontend-polish/DS-005.md): Verify interactive states use theme colors
- [DS-006](epic-6-frontend-polish/DS-006.md): Verify platform-specific imports
- [DS-007](epic-6-frontend-polish/DS-007.md): Add Storybook stories for missing components
- [DS-008](epic-6-frontend-polish/DS-008.md): Verify Storybook play functions for interactive components
- [DS-009](epic-6-frontend-polish/DS-009.md): Verify semantic HTML in web components
- [DS-010](epic-6-frontend-polish/DS-010.md): Verify data-testid attributes
- [DS-011](epic-6-frontend-polish/DS-011.md): Verify form inputs have associated labels
- [DS-012](epic-6-frontend-polish/DS-012.md): Verify images have alt text
- [DS-013](epic-6-frontend-polish/DS-013.md): Verify keyboard accessibility

## Usage

These task files are designed for execution with `/kb-run-epic`.

Each task file contains:
- Complete task specification following TASK-TEMPLATE.md v5.0
- All required sections for agent execution
- CRITICAL CONSTRAINTS, SPECIFICATION, ACCEPTANCE CRITERIA, TEST CRITERIA, GUARDRAILS, DESIGN, CODING STANDARDS

To execute:
1. `/kb-run-epic epic-1-open-source-foundation` to run Epic 1
2. Tasks are dispatched to assigned agents in dependency order
3. Reviewers verify each completion before marking done

## PRD Coverage

100% of PRD acceptance criteria covered across 6 epics.

**Priority Distribution:**
- P0 (Critical): Epic 1 - 9 tasks
- P1 (High): Epics 2-6 - 69 tasks
- P2 (Normal): Epic 4, 6 - 3 tasks

**Total Planned:** 81 tasks across 6 epics

## Next Steps

1. Review all task files for completeness
2. Execute Epic 1 first (P0 blocker - must complete before other work)
3. After Epic 1 completion, remaining epics can be executed in parallel

## Notes

- All 6 epics are complete with 81 tasks fully specified
- All task files follow TASK-TEMPLATE.md v5.0 format with TDD workflow support
- Task IDs are prefixed by epic: OS-*, TS-*, CQ-*, DOC-*, BP-*, RN-*, DS-*
