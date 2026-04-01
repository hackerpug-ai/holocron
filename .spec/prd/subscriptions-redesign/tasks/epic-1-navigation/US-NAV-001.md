# US-NAV-001: Access What's New from Main Navigation

> Task ID: US-NAV-001
> Type: FEATURE
> Priority: P0
> Estimate: 60 minutes
> Assignee: frontend-designer

## CRITICAL CONSTRAINTS

### MUST
- Rename drawer item "Subscriptions" to "What's New"
- Route `/subscriptions/feed` content to new What's New route
- Maintain all existing drawer functionality
- Use existing drawer navigation patterns

### NEVER
- Break existing deep links (will be handled in US-NAV-004)
- Remove subscription management from app (it moves to Settings)
- Change drawer item order significantly

### STRICTLY
- Follow existing drawer layout patterns from `app/(drawer)/_layout.tsx`
- Keep drawer configuration consistent with other items

## SPECIFICATION

**Objective:** Rename "Subscriptions" drawer item to "What's New" and point it to the multimedia feed screen.

**Success looks like:** User opens drawer, sees "What's New", taps it, sees the multimedia feed (not subscription management)

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Drawer open | User views drawer | "What's New" item visible | `getByText('What\'s New')` exists |
| 2 | User taps "What's New" | Navigation fires | Feed screen renders with cards | `getByTestId('feed-flat-list')` exists |
| 3 | Previous /subscriptions/feed route | User navigates directly | Redirected to What's New | URL updates to `/whats-new` |
 4 | Drawer closed | User opens drawer again | Drawer state persists | `isDrawerOpen` toggles correctly |

## GUARDRAILS

### WRITE-ALLOWED
- `app/(drawer)/_layout.tsx` (MODIFY) - rename drawer screen
- `app/(drawer)/whats-new.tsx` (NEW or RENAME from subscriptions/feed)

 - `components/subscriptions/SubscriptionFeedScreen.tsx` (MODIFY if needed for route integration

### WRITE-PROHIBITED
- `app/(drawer)/subscriptions.tsx` - will be handled in US-NAV-002
- `convex/**` - no backend changes
- `screens/DrawerContent.tsx` - drawer content changes in separate task

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-NAV-001 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-1.1 Drawer Navigation Update

 - `app/(drawer)/_layout.tsx` - existing drawer patterns

### Interaction Notes
- Drawer item should feel like other items
- Navigation should be instant (< 500ms)
- Icon should represent "feed" or "news" concept

### Code Pattern

Source: `app/(drawer)/_layout.tsx:260-270`

```typescript
// Pattern: Drawer screen configuration
<Drawer.Screen
  name="whats-new"
  options={{ headerShown: false, title: "What's New" }}
/>
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Removing old route without redirect
<Drawer.Screen
  name="subscriptions"
  options={{ headerShown: false, title: 'Subscriptions' }}
/>
// ^ User loses all deep links
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Follow existing navigation patterns
  - Use NativeWind for styling
  - Include testID on interactive elements

## DEPENDENCIES

No task dependencies (foundational navigation change).

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-NAV-001 acceptance criteria
2. `app/(drawer)/_layout.tsx` - existing drawer configuration
3. `app/(drawer)/subscriptions/feed.tsx` - existing feed screen to rename

## NOTES

This is the first part of the navigation restructure. The goal is to make What's New feel like a primary feature (which it is) while moving subscription management to Settings where it belongs as a configuration task.
 Do not change subscription management functionality - just relocate it.
