# US-103: Resolve Route Contradiction Between Spec and Implementation

> **Task ID**: US-103
> **Assignee**: react-native-ui-implementer
> **Priority**: P1 (HIGH)
> **Type**: bugfix
> **Epic**: red-hat-remediation-2026
> **Blocked By**: US-001

---

## CRITICAL CONSTRAINTS

MUST: Resolve route contradiction - spec says `/chat/[conversationId]`, impl uses `/`
MUST: Update either spec or implementation to match
MUST: Preserve working navigation behavior
NEVER: Leave spec and implementation in contradiction
STRICTLY: Document decision and reason for chosen approach

## SPECIFICATION

**Objective**: Resolve contradiction where US-008 spec specifies `/chat/${mostRecent.id}` but implementation uses `router.replace('/')`

**Success looks like**:
- Route specification and implementation match
- Navigation works consistently
- Active conversation properly tracked
- Decision documented in code comments

## PREREQUISITES

| Phase | Document | Lines/Section | Purpose |
|-------|----------|---------------|---------|
| BEFORE_START | `.spec/reviews/red-hat-20260301.md` | Lines 39-43 | Understanding route contradiction |
| BEFORE_START | `app/(drawer)/_layout.tsx` | Lines 178, 184 | Current `/` navigation |

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Spec/impl mismatch exists | Route decision made | Both spec and impl updated | `grep "/chat/\["` or `router.replace('/')` consistent |
| 2 | `/` route chosen | App opens to most recent conversation | URL is `/`, conversation in state | Test navigation works |
| 3 | `/chat/[id]` route chosen | App opens to most recent conversation | URL includes conversation ID | Test URL-based routing works |

## BOUNDARIES

### ALWAYS
- Choose ONE approach (state-based or URL-based)
- Update spec OR implementation to match
- Document decision with inline comment
- Test navigation still works

### ASK FIRST
- Ask before changing fundamentally from state to URL routing (architectural decision)

### NEVER
- NEVER leave spec saying one thing, impl doing another

## FILES TO MODIFY

| Action | Path | Purpose |
|--------|------|---------|
| MODIFY | `app/(drawer)/_layout.tsx` | Update route navigation or add comment |
| MODIFY | `.spec/tasks/epic-1-foundation-drawer-navigation/US-008.md` | Update spec if needed |

## VERIFICATION GATES

```bash
# Gate 1: Route consistency
grep -n "router.replace\|router.push" app/\(drawer\)/_layout.tsx | head -5

# Gate 2: Type check
pnpm tsc --noEmit 2>&1 | tail -10

# Gate 3: Evidence
mkdir -p ./.tmp/evidence
grep -n "router\|route" app/\(drawer\)/_layout.tsx | head -10 > ./.tmp/evidence/US-103.txt
```

## METADATA

```json
{
  "tags": ["epic:red-hat-remediation-2026", "milestone:navigation-fix", "area:frontend", "type:bugfix", "severity:high"]
}
```

---

# US-104: Add Active Conversation Visual Indicator to DrawerContent

> **Task ID**: US-104
> **Assignee**: react-native-ui-implementer
> **Priority**: P1 (HIGH)
> **Type**: enhancement
> **Epic**: red-hat-remediation-2026
> **Blocked By**: US-001

---

## CRITICAL CONSTRAINTS

MUST: Add visual indicator for active conversation in DrawerContent
MUST: Use background color or border to show active state
MUST: Pass activeConversationId to DrawerContent
NEVER: Leave users unsure which conversation is active
STRICTLY: Follow semantic theme tokens for active state

## SPECIFICATION

**Objective**: Add visual indication of which conversation is currently active

**Success looks like**:
- Active conversation has distinct visual style (background/color)
- DrawerContent receives activeConversationId prop
- Visual indicator uses theme tokens
- Active state updates when conversation changes

## PREREQUISITES

| Phase | Document | Lines/Section | Purpose |
|-------|----------|---------------|---------|
| BEFORE_START | `.spec/reviews/red-hat-20260301.md` | Line 137 | Understanding UX gap |

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Drawer open with active conversation | Conversation renders | Active item visually distinct | Test active has different style |
| 2 | User selects different conversation | Selection changes | Old indicator removed, new added | Test indicator follows selection |

## FILES TO MODIFY

| Action | Path | Purpose |
|--------|------|---------|
| MODIFY | `components/DrawerContent.tsx` | Add active conversation styling |
| MODIFY | `app/(drawer)/_layout.tsx` | Pass activeConversationId prop |

## VERIFICATION GATES

```bash
grep -n "activeConversationId\|backgroundColor\|borderColor" components/DrawerContent.tsx | head -5
mkdir -p ./.tmp/evidence
grep -A5 "activeConversationId" components/DrawerContent.tsx > ./.tmp/evidence/US-104.txt
```

## METADATA

```json
{
  "tags": ["epic:red-hat-remediation-2026", "milestone:ux-improvement", "area:frontend", "type:enhancement", "severity:high"]
}
```

---

# US-105: Add Error Boundary Components and User-Facing Error States

> **Task ID**: US-105
> **Assignee**: react-native-ui-implementer
> **Priority**: P1 (HIGH)
> **Type**: feature
> **Epic**: red-hat-remediation-2026
> **Blocked By**: US-001

---

## CRITICAL CONSTRAINTS

MUST: Create error boundary component for React errors
MUST: Add user-facing error state for API failures
MUST: Display helpful message when Supabase is down
NEVER: Show broken UI without recovery path
STRICTLY: Include retry mechanism in error state

## SPECIFICATION

**Objective**: Add error boundaries and user-facing error states for graceful failure handling

**Success looks like**:
- Error boundary wraps app components
- API errors show user-friendly message
- Retry button available in error state
- No silent failures (broken UI with no feedback)

## PREREQUISITES

| Phase | Document | Lines/Section | Purpose |
|-------|----------|---------------|---------|
| BEFORE_START | `.spec/reviews/red-hat-20260301.md` | Lines 51-55 | Understanding error handling gap |

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | React component throws error | Error boundary catches | Error screen shown with retry | Test error boundary renders |
| 2 | Supabase API fails | Error state triggered | User sees error message + retry | Test API error shows UI |

## FILES TO CREATE/MODIFY

| Action | Path | Purpose |
|--------|------|---------|
| CREATE | `components/ErrorBoundary.tsx` | React error boundary |
| MODIFY | `app/_layout.tsx` | Wrap with ErrorBoundary |
| MODIFY | `hooks/useConversations.ts` | Add error state |

## VERIFICATION GATES

```bash
test -f components/ErrorBoundary.tsx || exit 1
grep -q "ErrorBoundary\|error\|retry" hooks/useConversations.ts || exit 1
mkdir -p ./.tmp/evidence
cat components/ErrorBoundary.tsx | head -30 > ./.tmp/evidence/US-105.txt
```

## METADATA

```json
{
  "tags": ["epic:red-hat-remediation-2026", "milestone:error-handling", "area:frontend", "type:feature", "severity:high"]
}
```

---

# US-106: Implement Retry Mechanism for Failed API Calls

> **Task ID**: US-106
> **Assignee**: backend-implement
> **Priority**: P1 (HIGH)
> **Type**: feature
> **Epic**: red-hat-remediation-2026
> **Blocked By**: US-003

---

## CRITICAL CONSTRAINTS

MUST: Implement exponential backoff retry for API failures
MUST: Max 3 retry attempts before giving up
MUST: Show retry status to user
NEVER: Retry indefinitely (causes UI hang)
STRICTLY: Handle network errors separately from 4xx/5xx

## SPECIFICATION

**Objective**: Add retry logic to API calls for transient failure recovery

**Success looks like**:
- Failed API calls auto-retry with exponential backoff
- Max 3 attempts before error state
- User sees "Retrying..." indicator
- Network errors retry, 4xx errors don't

## PREREQUISITES

| Phase | Document | Lines/Section | Purpose |
|-------|----------|---------------|---------|
| BEFORE_START | `.spec/reviews/red-hat-20260301.md` | Line 165 | Understanding retry requirement |

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | API call fails (network error) | First retry triggered | Waits 1s, retries | Test retry delay ~1s |
| 2 | Retry fails again | Second retry triggered | Waits 2s, retries | Test exponential backoff |
| 3 | 3 retries all fail | Error state shown | User sees final error | Test max retries enforced |
| 4 | 400 error returned | No retry attempted | Error shown immediately | Test 4xx doesn't retry |

## FILES TO CREATE/MODIFY

| Action | Path | Purpose |
|--------|------|---------|
| CREATE | `lib/api/retry.ts` | Retry wrapper utility |
| MODIFY | `lib/api/conversations.ts` | Use retry wrapper |

## VERIFICATION GATES

```bash
test -f lib/api/retry.ts || exit 1
grep -q "retry\|backoff\|attempts" lib/api/retry.ts || exit 1
mkdir -p ./.tmp/evidence
head -40 lib/api/retry.ts > ./.tmp/evidence/US-106.txt
```

## METADATA

```json
{
  "tags": ["epic:red-hat-remediation-2026", "milestone:error-handling", "area:backend", "type:feature", "severity:high"]
}
```

---

# US-107: Add Loading States During Mutation Operations

> **Task ID**: US-107
> **Assignee**: react-native-ui-implementer
> **Priority**: P1 (HIGH)
> **Type**: enhancement
> **Epic**: red-hat-remediation-2026
> **Blocked By**: US-005

---

## CRITICAL CONSTRAINTS

MUST: Add isRenaming and isDeleting loading states
MUST: Disable interaction during mutation
MUST: Show loading indicator (spinner/skeleton)
NEVER: Allow multiple simultaneous mutations on same item
STRICTLY: Follow US-007 AC-21 requirement

## SPECIFICATION

**Objective**: Add loading states during rename/delete operations per US-007 AC-21

**Success looks like**:
- Rename operation shows loading indicator
- Delete operation shows loading indicator
- Menu item disabled during operation
- Visual feedback prevents confusion

## PREREQUISITES

| Phase | Document | Lines/Section | Purpose |
|-------|----------|---------------|---------|
| BEFORE_START | `.spec/reviews/red-hat-20260301.md` | Lines 87-89 | Understanding loading state gap |

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | User taps Rename | Rename dialog opens with loading | Spinner shown during API call | Test rename has loading |
| 2 | User taps Delete | Delete confirmation with loading | Spinner shown during API call | Test delete has loading |
| 3 | Mutation in progress | User taps same item again | Interaction disabled | Test double-tap prevented |

## FILES TO MODIFY

| Action | Path | Purpose |
|--------|------|---------|
| MODIFY | `app/(drawer)/_layout.tsx` | Add isRenaming/isDeleting state |
| MODIFY | `components/ConversationActionMenu.tsx` | Disable during loading |

## VERIFICATION GATES

```bash
grep -n "isRenaming\|isDeleting\|loading" app/\(drawer\)/_layout.tsx | head -5
mkdir -p ./.tmp/evidence
grep -B2 -A2 "isRenaming\|isDeleting" app/\(drawer\)/_layout.tsx > ./.tmp/evidence/US-107.txt
```

## METADATA

```json
{
  "tags": ["epic:red-hat-remediation-2026", "milestone:ux-improvement", "area:frontend", "type:enhancement", "severity:high"]
}
```

---

# US-108: Add UPDATE/PATCH Endpoint for Rename

> **Task ID**: US-108
> **Assignee**: backend-implement
> **Priority**: P1 (HIGH)
> **Type**: feature
> **Epic**: red-hat-remediation-2026
> **Blocked By**: US-003

---

## CRITICAL CONSTRAINTS

MUST: Add PATCH endpoint to conversations Edge Function
MUST: Validate user ownership before update
MUST: Return 404 if conversation not owned by user
NEVER: Allow renaming other users' conversations
STRICTLY: This should already exist in US-003 - verify it does

## SPECIFICATION

**Objective**: Ensure PATCH endpoint exists for conversation rename functionality

**Success looks like**:
- PATCH /conversations/:id endpoint exists
- Endpoint validates user ownership
- Returns updated conversation on success
- Returns 404 for conversations not owned by user

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | US-003 complete | Check Edge Function | PATCH method exists | `grep "PATCH" supabase/functions/conversations/index.ts` |
| 2 | PATCH exists | Test rename | Conversation title updated | Test PATCH updates title |

## VERIFICATION GATES

```bash
grep -q "method === 'PATCH'" supabase/functions/conversations/index.ts || exit 1
grep -q ".eq('user_id', userId)" supabase/functions/conversations/index.ts || exit 1
```

## METADATA

```json
{
  "tags": ["epic:red-hat-remediation-2026", "milestone:backend-api", "area:backend", "type:feature", "severity:high"]
}
```

---

# US-109: Add Pagination to fetchConversations

> **Task ID**: US-109
> **Assignee**: backend-implement
> **Priority**: P2 (MEDIUM)
> **Type**: enhancement
> **Epic**: red-hat-remediation-2026
> **Blocked By**: US-003

---

## CRITICAL CONSTRAINTS

MUST: Add pagination to conversations query
MUST: Default limit 50 conversations per page
MUST: Support infinite scroll or "load more" button
NEVER: Fetch all conversations at once
STRICTLY: Use Supabase pagination (range/limit)

## SPECIFICATION

**Objective**: Add pagination to prevent loading all conversations/messages at once

**Success looks like**:
- Conversations query uses `.range()` or `.limit()`
- Initial load fetches first 50
- Load more button or infinite scroll for rest
- No nested subquery loading all messages

## PREREQUISITES

| Phase | Document | Lines/Section | Purpose |
|-------|----------|---------------|---------|
| BEFORE_START | `.spec/reviews/red-hat-20260301.md` | Lines 79-83 | Understanding pagination gap |

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | User has > 50 conversations | App loads | First 50 shown | Test limit applied |
| 2 | User scrolls to bottom | Load more triggered | Next 50 fetched | Test pagination works |

## FILES TO MODIFY

| Action | Path | Purpose |
|--------|------|---------|
| MODIFY | `hooks/useConversations.ts` | Add pagination logic |
| MODIFY | `supabase/functions/conversations/index.ts` | Add range/limit to GET |

## VERIFICATION GATES

```bash
grep -n "\.range\|\.limit\|pagination" hooks/useConversations.ts supabase/functions/conversations/index.ts | head -5
mkdir -p ./.tmp/evidence
grep -B2 -A2 "\.range\|\.limit" hooks/useConversations.ts > ./.tmp/evidence/US-109.txt
```

## METADATA

```json
{
  "tags": ["epic:red-hat-remediation-2026", "milestone:performance", "area:backend", "type:enhancement", "severity:medium"]
}
```

---

# US-110: Implement Optimistic UI Updates

> **Task ID**: US-110
> **Assignee**: react-native-ui-implementer
> **Priority**: P2 (MEDIUM)
> **Type**: enhancement
> **Epic**: red-hat-remediation-2026
> **Blocked By**: US-003

---

## CRITICAL CONSTRAINTS

MUST: Update UI immediately on mutation (before API response)
MUST: Rollback on API failure
MUST: Show success/error state after API completes
NEVER: Wait for API before UI update (slow UX)
STRICTLY: Use local state cache for optimistic updates

## SPECIFICATION

**Objective**: Implement optimistic UI updates for better perceived performance

**Success looks like**:
- Rename shows new title immediately
- Delete removes item immediately
- API failure rolls back with error message
- Fast, responsive UI interaction

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | User renames conversation | Submit rename | Title updates immediately | Test UI instant |
| 2 | API fails | Rename in flight | Title reverts, error shown | Test rollback works |

## FILES TO MODIFY

| Action | Path | Purpose |
|--------|------|---------|
| MODIFY | `hooks/useConversations.ts` | Add optimistic update logic |
| MODIFY | `app/(drawer)/_layout.tsx` | Update local state before API |

## VERIFICATION GATES

```bash
grep -n "optimistic\|rollback\|setError" hooks/useConversations.ts app/\(drawer\)/_layout.tsx | head -5
mkdir -p ./.tmp/evidence
grep -B3 -A3 "optimistic" hooks/useConversations.ts > ./.tmp/evidence/US-110.txt
```

## METADATA

```json
{
  "tags": ["epic:red-hat-remediation-2026", "milestone:performance", "area:frontend", "type:enhancement", "severity:medium"]
}
```

---

# US-111: Implement Offline-First Strategy with Local Caching

> **Task ID**: US-111
> **Assignee**: react-native-ui-implementer
> **Priority**: P2 (MEDIUM)
> **Type**: feature
> **Epic**: red-hat-remediation-2026
> **Blocked By**: US-003

---

## CRITICAL CONSTRAINTS

MUST: Cache conversations in AsyncStorage
MUST: Queue mutations when offline
MUST: Sync queue when connection restored
NEVER: Lose user data in airplane mode
STRICTLY: Handle conflict resolution (server wins)

## SPECIFICATION

**Objective**: Implement offline-first strategy with local caching and conflict resolution

**Success looks like**:
- Conversations cached locally
- App works offline (read cached data)
- Mutations queued when offline
- Queue synced when connection restored

## PREREQUISITES

| Phase | Document | Lines/Section | Purpose |
|-------|----------|---------------|---------|
| BEFORE_START | `.spec/reviews/red-hat-20260301.md` | Lines 73-77 | Understanding offline gap |

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Device offline | User opens app | Cached conversations shown | Test offline read works |
| 2 | Device offline | User creates conversation | Queued locally | Test mutation queued |
| 3 | Connection restored | Queue processed | Mutations synced to server | Test sync works |

## FILES TO CREATE/MODIFY

| Action | Path | Purpose |
|--------|------|---------|
| CREATE | `lib/storage/conversationCache.ts` | AsyncStorage wrapper |
| CREATE | `lib/sync/mutationQueue.ts` | Offline mutation queue |
| MODIFY | `hooks/useConversations.ts` | Use cache and queue |

## VERIFICATION GATES

```bash
test -f lib/storage/conversationCache.ts || exit 1
test -f lib/sync/mutationQueue.ts || exit 1
grep -q "AsyncStorage\|queue\|offline" hooks/useConversations.ts || exit 1
mkdir -p ./.tmp/evidence
head -20 lib/sync/mutationQueue.ts > ./.tmp/evidence/US-111.txt
```

## METADATA

```json
{
  "tags": ["epic:red-hat-remediation-2026", "milestone:offline-first", "area:frontend", "type:feature", "severity:medium"]
}
```

---

# US-112: Resolve Supabase vs Convex Technology Stack Contradiction

> **Task ID**: US-112
> **Assignee**: product-manager
> **Priority**: P2 (MEDIUM)
> **Type**: documentation
> **Epic**: red-hat-remediation-2026
> **Blocked By**: US-003

---

## CRITICAL CONSTRAINTS

MUST: Document technology stack decision (Supabase or Convex)
MUST: Update all references to consistent choice
MUST: Remove conflicting agent skills/references
NEVER: Leave ambiguity in architecture documentation
STRICTLY: Create ARCHITECTURE.md documenting decision

## SPECIFICATION

**Objective**: Resolve technology stack contradiction and document decision

**Success looks like**:
- Single backend technology chosen
- All code/docs reference consistent choice
- Conflicting references removed
- Architecture decision documented

## PREREQUISITES

| Phase | Document | Lines/Section | Purpose |
|-------|----------|---------------|---------|
| BEFORE_START | `.spec/reviews/red-hat-20260301.md` | Lines 63-67 | Understanding stack contradiction |

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Stack decision made | ARCHITECTURE.md created | Decision documented | Test file exists |
| 2 | Conflicting refs exist | Search codebase | All refs consistent | `grep -r "convex" lib/` returns 0 or intentional |

## FILES TO CREATE/MODIFY

| Action | Path | Purpose |
|--------|------|---------|
| CREATE | `ARCHITECTURE.md` | Document technology decision |
| MODIFY | `README.md` | Update stack references |

## VERIFICATION GATES

```bash
test -f ARCHITECTURE.md || exit 1
grep -q "Supabase\|Convex" ARCHITECTURE.md || exit 1
mkdir -p ./.tmp/evidence
head -30 ARCHITECTURE.md > ./.tmp/evidence/US-112.txt
```

## METADATA

```json
{
  "tags": ["epic:red-hat-remediation-2026", "milestone:documentation", "area:documentation", "type:documentation", "severity:medium"]
}
```

---

# US-113: Document Security Model and Production Migration Path

> **Task ID**: US-113
> **Assignee**: security-reviewer
> **Priority**: P2 (MEDIUM)
> **Type**: documentation
> **Epic**: red-hat-remediation-2026
> **Blocked By**: US-102

---

## CRITICAL CONSTRAINTS

MUST: Document security model for multi-user deployment
MUST: Include migration path from personal app to production
MUST: List security considerations (RLS, auth, CORS)
NEVER: Leave security model undocumented
STRICTLY: Create SECURITY.md with production checklist

## SPECIFICATION

**Objective**: Document security model and migration path for production deployment

**Success looks like**:
- SECURITY.md exists with auth/RLS documentation
- Migration path from personal to multi-user documented
- Production deployment checklist included
- Security considerations listed

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | SECURITY.md created | Review content | Security model documented | Test file exists |
| 2 | Production section | Review checklist | All security items listed | Test checklist complete |

## FILES TO CREATE

| Action | Path | Purpose |
|--------|------|---------|
| CREATE | `SECURITY.md` | Security model and migration docs |

## VERIFICATION GATES

```bash
test -f SECURITY.md || exit 1
grep -q "RLS\|Row Level Security\|migration\|production" SECURITY.md || exit 1
mkdir -p ./.tmp/evidence
head -40 SECURITY.md > ./.tmp/evidence/US-113.txt
```

## METADATA

```json
{
  "tags": ["epic:red-hat-remediation-2026", "milestone:documentation", "area:security", "type:documentation", "severity:medium"]
}
```

---

# US-114: Wire Up Search Functionality or Defer Search UI

> **Task ID**: US-114
> **Assignee**: react-native-ui-implementer
> **Priority**: P2 (MEDIUM)
> **Type**: enhancement
> **Epic**: red-hat-remediation-2026
> **Blocked By**: US-001

---

## CRITICAL CONSTRAINTS

MUST: Either implement search filtering or remove dead UI
MUST: No broken interactions (search bar that does nothing)
MUST: If implemented, filter conversations by title
NEVER: Leave non-functional search UI (dead interaction)
STRICTLY: Follow "no broken interactions" principle

## SPECIFICATION

**Objective**: Either wire up search functionality or defer search UI to future epic

**Success looks like**:
- Search bar filters conversations by title, OR
- Search bar removed/commented as "future work"
- No dead/broken UI interactions

## PREREQUISITES

| Phase | Document | Lines/Section | Purpose |
|-------|----------|---------------|---------|
| BEFORE_START | `.spec/reviews/red-hat-20260301.md` | Lines 109-113 | Understanding search placeholder gap |

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Search implemented | User types in search bar | Conversations filtered | Test search works |
| 2 | Search deferred | Search bar visible | Commented as future work | Test no dead interaction |

## FILES TO MODIFY

| Action | Path | Purpose |
|--------|------|---------|
| MODIFY | `components/DrawerContent.tsx` | Wire search or mark as future |
| MODIFY | `hooks/useConversations.ts` | Add filter logic if implementing |

## VERIFICATION GATES

```bash
grep -n "onSearchChange\|filter\|search" components/DrawerContent.tsx hooks/useConversations.ts | head -5
mkdir -p ./.tmp/evidence
grep -B2 -A2 "onSearchChange" components/DrawerContent.tsx > ./.tmp/evidence/US-114.txt
```

## METADATA

```json
{
  "tags": ["epic:red-hat-remediation-2026", "milestone:ux-complete", "area:frontend", "type:enhancement", "severity:medium"]
}
```

---

# US-115: Add Analytics/Telemetry for Conversation Operations

> **Task ID**: US-115
> **Assignee**: backend-implement
> **Priority**: P2 (MEDIUM)
> **Type**: feature
> **Epic**: red-hat-remediation-2026
> **Blocked By**: US-003

---

## CRITICAL CONSTRAINTS

MUST: Track conversation create/rename/delete operations
MUST: Use analytics library (e.g., Supabase Analytics, Mixpanel)
MUST: Log events for debugging and product insights
NEVER: Log sensitive data (conversation titles, user IDs)
STRICTLY: Follow privacy best practices

## SPECIFICATION

**Objective**: Add analytics tracking for conversation operations

**Success looks like**:
- Create/rename/delete events tracked
- Analytics library integrated
- Events logged for product insights
- No sensitive data in logs

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | User creates conversation | Create completes | "conversation_created" event logged | Test event fires |
| 2 | User deletes conversation | Delete completes | "conversation_deleted" event logged | Test event fires |

## FILES TO CREATE/MODIFY

| Action | Path | Purpose |
|--------|------|---------|
| CREATE | `lib/analytics.ts` | Analytics wrapper |
| MODIFY | `lib/api/conversations.ts` | Add event tracking |

## VERIFICATION GATES

```bash
test -f lib/analytics.ts || exit 1
grep -q "track\|analytics\|event" lib/analytics.ts lib/api/conversations.ts || exit 1
mkdir -p ./.tmp/evidence
head -20 lib/analytics.ts > ./.tmp/evidence/US-115.txt
```

## METADATA

```json
{
  "tags": ["epic:red-hat-remediation-2026", "milestone:analytics", "area:backend", "type:feature", "severity:medium"]
}
```

---

# US-116: Add Accessibility Validation and WCAG Compliance

> **Task ID**: US-116
> **Assignee**: react-native-ui-implementer
> **Priority**: P2 (MEDIUM)
> **Type**: enhancement
> **Epic**: red-hat-remediation-2026
> **Blocked By**: US-001

---

## CRITICAL CONSTRAINTS

MUST: Add accessibilityLabel to all interactive elements
MUST: Add accessibilityRole to interactive elements
MUST: Test with screen reader
NEVER: Leave buttons without accessibility labels
STRICTLY: Follow React Native accessibility guidelines

## SPECIFICATION

**Objective**: Add accessibility validation and WCAG compliance for screen reader support

**Success looks like**:
- All Pressable/Touchable elements have accessibilityLabel
- All interactive elements have appropriate accessibilityRole
- Screen reader announces actions correctly
- Accessibility tests pass

## PREREQUISITES

| Phase | Document | Lines/Section | Purpose |
|-------|----------|---------------|---------|
| BEFORE_START | `.spec/reviews/red-hat-20260301.md` | Lines 103-107 | Understanding accessibility gap |

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Screen reader enabled | User focuses conversation item | Title announced | Test screen reader works |
| 2 | Button without label | Audit accessibility | All elements labeled | `grep -c "accessibilityLabel"` > 0 |

## FILES TO MODIFY

| Action | Path | Purpose |
|--------|------|---------|
| MODIFY | `components/DrawerContent.tsx` | Add accessibility props |
| MODIFY | `components/ConversationActionMenu.tsx` | Add accessibility props |

## VERIFICATION GATES

```bash
grep -c "accessibilityLabel" components/DrawerContent.tsx components/ConversationActionMenu.tsx | grep -v ":0"
mkdir -p ./.tmp/evidence
grep -n "accessibility" components/DrawerContent.tsx | head -10 > ./.tmp/evidence/US-116.txt
```

## METADATA

```json
{
  "tags": ["epic:red-hat-remediation-2026", "milestone:accessibility", "area:frontend", "type:enhancement", "severity:medium"]
}
```
