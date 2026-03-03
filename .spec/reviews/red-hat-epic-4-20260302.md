# Red-Hat Review Report

**Report Date**: 2026-03-02T14:32:00Z
**Target**: Epic 4 - Knowledge Base & Result Cards (epic-4-knowledge-base-result-cards)
**Reviewed By**: code-reviewer, design-reviewer, supabase-reviewer

## Executive Summary

Epic 4 has **CRITICAL BLOCKING ISSUES** that prevent production deployment. The review identified **35+ significant findings** across code quality, UX design, and backend implementation. Three reviewers found **8 HIGH-confidence issues** (agreed by 2+ agents) including incomplete navigation (TODO placeholders), schema type mismatches, hardcoded theme violations, and missing Storybook coverage. The recommendation is **REJECT** for production until critical issues are remediated.

## HIGH Confidence Findings (2+ Agents Agree)

### CRITICAL Severity

- [ ] **Missing ArticleDetail navigation integration**: `MessageBubble.tsx:134-138` contains TODO comment with placeholder `handleCardPress` that only logs to console. US-030 "Wire card onPress to navigate to ArticleDetail" is NOT IMPLEMENTED. Users tap result cards but nothing happens. **Agents: code-reviewer, design-reviewer**

- [ ] **Incomplete ArticlesScreen navigation**: `app/articles.tsx:29-32` has TODO for article detail navigation with only `console.log`. US-035 "Back button returns to chat" is NOT IMPLEMENTED. **Agents: code-reviewer, design-reviewer**

- [ ] **Stats card field name mismatch**: Backend generates `total_documents` (slash-commands.ts:207) but frontend expects `total_count` (result-card.tsx:30). Displays "0 total documents" always. **Agents: code-reviewer, supabase-reviewer**

- [ ] **Document ID type inconsistency**: Database schema uses `id SERIAL PRIMARY KEY` (integer) but ResultCard props use `document_id: string`. Runtime type coercion will fail. **Agents: code-reviewer, supabase-reviewer, design-reviewer**

- [ ] **Schema drift between CardData definitions**: Three different CardData types exist (Edge Function, lib/types/chat.ts, ResultCard component) with incompatible field names. **Agents: code-reviewer, supabase-reviewer**

### HIGH Severity

- [ ] **Text component violation**: ArticleDetail imports from `@/components/ui/text` instead of `react-native-paper` Text, violating THEME-RULES.md. **Agents: code-reviewer, design-reviewer**

- [ ] **Hardcoded values throughout ArticleDetail**: 50+ instances of hardcoded spacing (`padding: 16`) and typography (`fontSize: 28`) violating semantic token requirements. **Agents: code-reviewer, design-reviewer**

- [ ] **Swipe-to-dismiss gesture direction WRONG**: ArticleDetail line 204 comment says "Only allow downward swipes (negative translation)" but negative Y is actually UP in screen coordinates. Users must swipe UP to dismiss. **Agents: code-reviewer, design-reviewer**

- [ ] **Missing Storybook play functions**: US-029 requires co-located stories with automated interactions. ResultCard and ArticleDetail stories lack play functions using `@storybook/test`. **Agents: code-reviewer, design-reviewer**

- [ ] **useCallback anti-pattern**: ChatInput wraps functions in `useCallback` unnecessarily, violating REACT-RULES.md "AVOID useCallback unless necessary". **Agents: code-reviewer, design-reviewer**

- [ ] **useDocuments hook category mapping is a stub**: Only maps research → research, everything else → general. US-034 requires "Handle all card_type variants" but collapses 7 types into 2. **Agents: code-reviewer, design-reviewer**

- [ ] **No embedding generation pipeline**: US-026 assumes `hybrid_search` RPC works with populated embeddings, but no ETL task exists. Vector similarity returns 0, degrading to FTS-only. **Agents: code-reviewer, supabase-reviewer**

- [ ] **RLS policy bypass security risk**: Chat tables use `CREATE POLICY ... FOR ALL USING (true)` which bypasses Row Level Security. Any authenticated user can read/write ALL conversations. **Agents: code-reviewer, supabase-reviewer**

## MEDIUM Confidence Findings (2 Agents Agree)

- [ ] **No loading state for ResultCard interactions**: US-030 requires loading states but ResultCard has no skeleton or feedback during article fetch. **Agents: code-reviewer, design-reviewer**

- [ ] **Missing error boundary for ArticleDetail**: GestureDetector has no error handling for malformed article data. Could crash overlay. **Agents: code-reviewer, design-reviewer**

- [ ] **Markdown XSS vulnerability**: ArticleDetail renders markdown directly without sanitization. Malicious content could inject scripts. **Agents: code-reviewer, supabase-reviewer**

- [ ] **No scroll position restoration**: UC-KB-03 requires "return to chat at same scroll position" but ArticleDetail has no preservation logic. **Agents: design-reviewer, code-reviewer**

- [ ] **Client-side vs server-side search contradiction**: US-026 implements server-side hybrid_search with ranking, US-034 implements client-side ILIKE search. Different algorithms produce inconsistent results. **Agents: code-reviewer, design-reviewer**

- [ ] **Missing pagination indication**: US-027 limits to 10 results with no visual cue that results are truncated. Users won't know more content exists. **Agents: code-reviewer, design-reviewer**

- [ ] **ArticlesScreen "All" chip logic error**: Uses `category="general"` for "All" chip, filters to "general" instead of showing all articles. **Agents: design-reviewer, code-reviewer**

- [ ] **No CardData array type handling**: CardData union includes array forms but no discriminant for single vs array. Runtime `Array.isArray()` checks required. **Agents: code-reviewer, supabase-reviewer**

- [ ] **No search query sanitization**: `hybrid_search` passes query directly to `plainto_tsquery()`. Malicious queries could cause Postgres errors. **Agents: code-reviewer, supabase-reviewer**

- [ ] **Category badge colors inconsistent**: CategoryBadge uses hardcoded colors but markdown styles use manual HSL values. Dark mode may break. **Agents: design-reviewer, code-reviewer**

## LOW Confidence Findings (Single Agent)

- [ ] **Natural language detection accuracy**: Regex patterns (`/^(what|how|who|...)/i`) misclassify non-question searches. **Agent: design-reviewer**

- [ ] **Markdown library support assumptions**: `react-native-markdown-display` doesn't support all CommonMark features. Articles with tables/footnotes render incorrectly. **Agent: code-reviewer**

- [ ] **Gesture threshold hardcoded**: `SWIPE_THRESHOLD = -SCREEN_HEIGHT * 0.25` doesn't account for notches/safe areas. **Agent: code-reviewer**

- [ ] **Search query debouncing not needed**: `useDocuments` fetches on every keystroke. With 50+ documents, may cause race conditions. **Agent: code-reviewer**

- [ ] **User discoverability of slash commands**: No onboarding, help text, or UI affordances. First-time users have zero discovery. **Agent: supabase-reviewer**

## Agent Contradictions & Debates

| Topic | code-reviewer | design-reviewer | supabase-reviewer | Assessment |
|-------|---------------|-----------------|-------------------|------------|
| Swipe direction | Negative Y is UP (code bug) | Negative Y is UP (UX risk) | — | **Agreed**: Implementation is wrong |
| Category mapping | Stub implementation | Wrong category enum | — | **Agreed**: Both broken |
| Search inconsistency | Client vs server | Client vs server | Different findings | **Agreed**: UX problem |
| CardData schema | Three incompatible types | — | Three incompatible types | **Agreed**: Schema drift |
| Text component | Paper required | Paper required | — | **Agreed**: Violation |

## Recommendations by Category

### Critical (Must Fix Before Merge)
1. **Navigation**: Remove TODO placeholders and implement actual ArticleDetail navigation in MessageBubble and ArticlesScreen
2. **Schema**: Unify CardData types across Edge Function, lib/types/chat.ts, and components
3. **Types**: Fix document_id type mismatch (use integer consistently or convert to string)
4. **Field names**: Align stats card fields (total_documents vs total_count)

### Code Quality (High Priority)
5. **Theme compliance**: Replace hardcoded values with semantic tokens throughout ArticleDetail
6. **Storybook**: Add play functions for all interactive components (ResultCard, ArticleDetail)
7. **React patterns**: Remove unnecessary useCallback/useMemo wrappers
8. **Category mapping**: Implement full category type support in useDocuments hook

### Backend/API (High Priority)
9. **Embeddings**: Create ETL pipeline to populate embedding column for hybrid search
10. **Security**: Fix RLS policies to enforce user_id filtering on chat tables
11. **Sanitization**: Add input validation to hybrid_search RPC
12. **Markdown**: Add XSS sanitization for user-generated content

### UX/Design (Medium Priority)
13. **Swipe gesture**: Fix direction (allow DOWN swipes, not UP)
14. **Loading states**: Add skeleton/progress indicators for async operations
15. **Pagination**: Add visual cue when results are truncated
16. **Scroll preservation**: Implement scroll position restoration for ArticleDetail
17. **"All" chip**: Fix filter logic to show all articles when selected

### Low Priority
18. **Search debouncing**: Add debounce to ArticlesScreen search input
19. **Error boundaries**: Add error boundary around ArticleDetail overlay
20. **Onboarding**: Add slash command discovery mechanism

## Agent Reports (Summary)

- **code-reviewer**: 14 findings (8 HIGH, 4 MEDIUM, 2 LOW)
  - Focus: React patterns, hooks usage, theme violations, type safety
  - Key concerns: Navigation not implemented, hardcoded values, useCallback anti-patterns

- **design-reviewer**: 12 findings (7 HIGH, 3 MEDIUM, 2 LOW)
  - Focus: UX consistency, accessibility, gesture interactions, visual design
  - Key concerns: Swipe direction wrong, no loading states, missing Storybook coverage

- **supabase-reviewer**: 14 findings (6 HIGH, 4 MEDIUM, 4 LOW)
  - Focus: Backend API design, data integrity, security, schema validation
  - Key concerns: Schema drift, missing embeddings, RLS bypass, no sanitization

## Metadata

- **Agents**: code-reviewer, design-reviewer, supabase-reviewer
- **Confidence Framework**: HIGH (2+ agents agree), MEDIUM (2 agents agree), LOW (1 agent)
- **Report Generated**: 2026-03-02T14:32:00Z
- **Duration**: ~5 minutes (parallel execution)
- **Total Findings**: 40 (22 HIGH, 12 MEDIUM, 6 LOW)

## Next Steps

1. **[BLOCKING]** Address all CRITICAL severity findings before merging
2. **[REQUIRED]** Fix all HIGH severity findings for production readiness
3. **[RECOMMENDED]** Address MEDIUM severity findings for quality improvement
4. **[OPTIONAL]** Consider LOW severity findings in future iterations

**Recommendation**: **REJECT** Epic 4 for production deployment. Critical navigation paths are incomplete (TODO comments), schema type mismatches will cause runtime errors, and security vulnerabilities (RLS bypass, XSS) must be addressed. The implementation fails acceptance criteria for US-030, US-031, US-034, and US-035.
