# Red-Hat Review Report

**Report Date**: 2026-03-03T21:37:00Z
**Target**: Epic 5: Deep Research (.spec/tasks/epic-5-deep-research/)
**Reviewed By**: product-manager, frontend-designer, react-native-ui-reviewer, supabase-reviewer

## Executive Summary

Epic 5: Deep Research has **significant implementation gaps** that conflict with PRD requirements. The most critical findings are:

1. **Mock AI/LLM implementations** - All research functionality is simulated with hardcoded formulas
2. **Missing `/cancel` command** - Documented feature has no implementation
3. **No citations storage** - Database schema lacks citations table
4. **Security vulnerabilities** - RLS policies allow all access
5. **Real-time streaming not implemented** - Uses polling instead of true streaming

Overall: **NOT READY for production**. The epic requires substantial remediation before release.

---

## HIGH Confidence Findings (3+ Agents Agree)

### 1. Mock AI/LLM Implementations
**Severity**: Critical | **Agents**: product-manager, supabase-reviewer

The `searchIteration()` and `reviewFindings()` functions in `supabase/functions/deep-research-iterate/index.ts` are entirely mocked:

- Coverage score calculated as `Math.min(1 + iterationNumber * 0.8, 5)` (hardcoded formula)
- Findings return mock strings: `"Iteration ${iterationNumber} findings for..."`
- No actual AI/search API integration
- Verification summaries claim "implemented" but code is purely simulated

**Impact**: Users receive fake research results with no real analysis.

### 2. Missing `/cancel` Command
**Severity**: Critical | **Agents**: product-manager, react-native-ui-reviewer

PRD UC-DR-02 AC-6 states: "User can type `/cancel` to stop the deep research"

**Finding**: No `/cancel` slash command in `SUPPORTED_COMMANDS` array (slash-commands.ts:87-95)
- `isSessionCancelled()` function exists but no user-facing way to trigger it
- No cancel button visible in any UI component
- Users cannot stop research once started

**Impact**: Users cannot control running research sessions.

### 3. No Citations Storage
**Severity**: Critical | **Agents**: product-manager, supabase-reviewer

PRD UC-DR-04 AC-5: "User can see all citations accumulated across all iterations"

**Finding**: Database schema has NO citations table or field:
- `deep_research_sessions` table: id, topic, status, created_at, updated_at, max_iterations
- `deep_research_iterations` table: id, session_id, iteration_number, coverage_score, feedback, refined_queries, findings, status
- `DeepResearchDetailView` component has `citations` prop but NO data source
- TODO comment in code: "Extract citations from findings" (line 34 of [sessionId].tsx)

**Impact**: Citations feature cannot work as designed.

### 4. Security Vulnerabilities
**Severity**: Critical | **Agents**: product-manager, supabase-reviewer

RLS policies allow all access:
```sql
CREATE POLICY "Allow all access to deep_research_sessions" ON deep_research_sessions
  FOR ALL USING (true);
```

**Finding**: Comment says "remove in production" but no tracking ticket exists. Service role key usage bypasses all user isolation.

**Impact**: Any user can access, modify, or delete any other user's sessions.

### 5. Restart Doesn't Clear Iterations
**Severity**: High | **Agents**: product-manager, supabase-reviewer

`restartSession()` function only updates status to 'pending':
```typescript
.update({ status: 'pending' })
```

**Finding**: Previous iterations remain in database, corrupting iteration numbering for restarted session.

**Impact**: "Restart" feature produces corrupted data.

### 6. Real-time Streaming Not Implemented
**Severity**: High | **Agents**: react-native-ui-reviewer, supabase-reviewer

**Finding**: No subscription to `deep_research_iterations` table updates. The implementation:
- Uses discrete INSERT INTO chat_messages
- No Supabase Realtime subscription
- No Server-Sent Events (SSE) or WebSocket
- `use-chat-realtime.ts` only handles chat message INSERT events

**Impact**: Users won't see iteration cards appear automatically - requires polling.

### 7. Triple Transformation Layer
**Severity**: High | **Agents**: react-native-ui-reviewer, supabase-reviewer

Data goes through 3 transformations:
1. Supabase rows → `DeepResearchSessionRow` (snake_case)
2. Transform to `DeepResearchSession` (camelCase) in `useDeepResearchSession`
3. Transform AGAIN to `DeepResearchDetailViewProps` format in `[sessionId].tsx` (lines 20-52)

**Impact**: Each transform is a point of failure. Unnecessary complexity.

### 8. Type Safety Issues
**Severity**: High | **Agents**: react-native-ui-reviewer, supabase-reviewer

**Finding**: MessageBubble.tsx uses unsafe type casting:
```typescript
const cardType = card_data.card_type as CardType | 'deep_research_confirmation' | 'resume_session_list'
```

**Impact**: If backend sends invalid card_type, runtime error occurs.

---

## MEDIUM Confidence Findings (2 Agents Agree)

### 9. Race Condition in Iteration Number Assignment
**Severity**: High | **Agents**: supabase-reviewer

`getNextIterationNumber()` queries max iteration_number, then increments in application code. Concurrent requests could both get the same number, causing unique constraint violation.

**Mitigation**: Use database-level auto-increment or atomic sequence.

### 10. No Transaction Support
**Severity**: High | **Agents**: supabase-reviewer

Iteration save and message streaming happen separately. If message insert fails after iteration save, user sees incomplete data. No rollback mechanism.

### 11. Missing user_id Foreign Key
**Severity**: Medium | **Agents**: supabase-reviewer

`deep_research_sessions` table has no direct link to users table for ownership tracking.

### 12. N+1 Query in Resume Handler
**Severity**: Medium | **Agents**: supabase-reviewer, react-native-ui-reviewer

`getIncompleteSessions()` fetches sessions, then makes separate query for each session to get iteration counts. With 10 sessions = 11 database queries instead of 1 aggregated query.

### 13. No Estimated Duration Display
**Severity**: Medium | **Agents**: product-manager, frontend-designer

PRD promises "estimated duration" but `DeepResearchConfirmationCardData` type has no `estimated_duration` field. Confirmation card doesn't warn about processing time.

### 14. No Loading States for Streaming
**Severity**: Medium | **Agents**: frontend-designer

No defined "in-progress" state for active iteration. `IterationCard` has `isActive` prop showing pulsing dot, but no visual for "current iteration starting up, waiting for results."

### 15. Session ID Copy Affordance Missing
**Severity**: Medium | **Agents**: frontend-designer, react-native-ui-reviewer

Confirmation card shows session ID in monospace font but users can't copy it. PRD says "copyable badge" but component doesn't implement copy-to-clipboard.

### 16. No Error States for Iteration Failures
**Severity**: Medium | **Agents**: frontend-designer

What happens when iteration times out or fails? `IterationCard` only has pending, running, completed states. Users won't know if research stalled.

### 17. Final Result Card Navigation Not Wired
**Severity**: Medium | **Agents**: frontend-designer

`FinalResultCardData` type exists but `MessageBubble` doesn't handle `card_type: 'final_result'`. Tapping completed results won't navigate to detail view.

### 18. No Pull-to-Refresh
**Severity**: Medium | **Agents**: react-native-ui-reviewer

Detail view is ScrollView with no refresh control. Users viewing completed session can't refresh if new iterations complete.

---

## LOW Confidence Findings (Single Agent)

### 19. Dual State Management (react-native-ui-reviewer)
**Severity**: Medium

`IterationCard` manages expansion state internally but parent component `DeepResearchDetailView` also manages it via `defaultExpanded` prop. Creates dual state sources.

### 20. No Optimistic Updates (react-native-ui-reviewer)
**Severity**: Medium

Unlike `useConversations.ts` which has sophisticated optimistic UI updates, deep research hooks have NONE. When `/cancel` sent, UI won't reflect cancellation until full refetch.

### 21. Missing Pagination (supabase-reviewer)
**Severity**: Low

Hardcoded `limit(10)` could return excessive data. No cursor or offset-based pagination for browsing session history.

### 22. Coverage Score Precision Mismatch (product-manager)
**Severity**: Low

Database uses `NUMERIC(3, 2)` (0.00-5.00) but TypeScript uses `number | null`. UI shows integer "1-5" per PRD but mock produces decimals (1.8, 2.6).

---

## Agent Contradictions & Debates

| Topic | Agent A | Agent B | Assessment |
|-------|---------|---------|------------|
| **Resume vs cancel behavior** | product-manager: "Resume includes cancelled sessions" | N/A | User can see intentionally stopped sessions in resume list |
| **Streaming architecture** | supabase-reviewer: "No true real-time streaming" | react-native-ui-reviewer: "No realtime subscription" | **CONFIRMED**: No SSE/Realtime implementation |
| **Citations feature** | product-manager: "No citations schema" | N/A | PRD promises citations, schema missing |
| **Estimated duration** | product-manager: "No duration field in types" | frontend-designer: "Not in confirmation card" | **CONFIRMED**: Missing from implementation |
| **Type safety** | react-native-ui-reviewer: "Unsafe type casting" | supabase-reviewer: "Type safety mismatch on JSONB" | Different aspects of same issue |

---

## Recommendations by Category

### Critical (Must Fix Before Release)

1. **Replace mock implementations with real AI/search integration** OR clearly label as "demo mode"
2. **Implement `/cancel` command** or remove from PRD
3. **Add citations storage** or remove from PRD
4. **Fix restart to clear iterations** or remove restart feature
5. **Remove RLS "allow all" policies** before production
6. **Add user authentication/authorization** with proper RLS policies

### High Priority (Blockers)

7. **Implement real-time streaming** via Supabase Realtime subscriptions
8. **Add atomic iteration number assignment** to prevent race conditions
9. **Simplify data transformations** - reduce to single layer
10. **Add type guards** for card_type validation
11. **Add estimated duration field** to confirmation card type
12. **Wire final_result card type** in MessageBubble

### Medium Priority (UX Improvements)

13. **Add session ID copy-to-clipboard** functionality
14. **Add iteration failure/error states** to IterationCard
15. **Implement pull-to-refresh** in detail view
16. **Add loading states** for streaming iterations
17. **Fix N+1 query** in resume handler with aggregation
18. **Add user_id foreign key** for proper ownership tracking

### Low Priority (Nice to Have)

19. **Fix dual state management** in IterationCard
20. **Add optimistic UI updates** for better perceived performance
21. **Add pagination** for session history browsing
22. **Resolve coverage score precision** mismatch between database and UI

---

## Agent Reports (Summary)

### product-manager
- **Key findings**: 8 HIGH, 5 MEDIUM, 3 LOW
- **Top issues**: Mock implementations, missing /cancel, no citations schema, restart doesn't clear iterations, RLS security gap
- **Recommendation**: Reduce scope - remove `/resume`, simplify to 3 iterations, defer citations

### frontend-designer
- **Key findings**: 8 HIGH, 5 MEDIUM, 4 LOW
- **Top issues**: Missing cancel affordance, hardcoded resume data, missing final_result handling, no copy session ID, empty state gap
- **Unique insight**: Design assumes continuous improvement but scores can fluctuate

### react-native-ui-reviewer
- **Key findings**: 8 HIGH, 4 MEDIUM, 2 LOW
- **Top issues**: No realtime subscription, dual state management, missing FlatList optimizations, triple transformation layer
- **Performance concerns**: 250 items in ScrollView will choke, no virtualization for long reports

### supabase-reviewer
- **Key findings**: 12 HIGH, 8 MEDIUM, 3 LOW
- **Top issues**: Missing user auth/authorization, service role key bypassing RLS, race conditions, no transaction support
- **Architecture concerns**: Streaming implementation is discrete INSERTs, not true streaming

---

## Metadata

- **Agents**: product-manager, frontend-designer, react-native-ui-reviewer, supabase-reviewer
- **Confidence Framework**: HIGH (3+ agents), MEDIUM (2 agents), LOW (1 agent)
- **Report Generated**: 2026-03-03T21:37:00Z
- **Duration**: ~1 minute
- **Next Steps**: [Remediate critical findings] → [Update PRD to match implementation] → [Re-review after fixes]
