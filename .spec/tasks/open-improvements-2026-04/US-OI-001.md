# US-OI-001: Fix What's New Screen Navigation

> Task ID: US-OI-001
> Type: BUG
> Priority: P0
> Estimate: 30 minutes
> Assignee: general-purpose
> Status: ✅ Completed
> Completed: 2026-04-06T12:35:00Z
> Commit: 9420f7bc23838be2b352a4e653b59c1de7c4e19d
> Reviewer: code-reviewer

## CRITICAL CONSTRAINTS

### MUST
- Read `app/(drawer)/_layout.tsx` and `screens/DrawerContent.tsx` before modifying
- Follow the exact pattern used by other drawer screens (articles, subscriptions, improvements)
- Preserve all existing navigation handlers and drawer sections

### NEVER
- Modify the What's New screen components themselves (`app/(drawer)/whats-new/`)
- Change the Convex backend queries or schema
- Remove or rename existing navigation handlers

### STRICTLY
- Only touch the 2 files specified: `_layout.tsx` and `DrawerContent.tsx`
- The "What's New" drawer item must navigate to `/whats-new`, not `/subscriptions`

## SPECIFICATION

**Objective:** Fix the What's New screen so it is reachable from the drawer navigation.

**Root Cause:** Two issues:
1. `app/(drawer)/whats-new/index.tsx` and `[reportId].tsx` exist but are NOT registered as `<Drawer.Screen>` entries in `app/(drawer)/_layout.tsx` (lines 247-291).
2. In `screens/DrawerContent.tsx` line 138, the "What's New" nav item fires `onSubscriptionsPress` which routes to `/subscriptions` instead of `/whats-new`.

**Success looks like:** User taps "What's New" in drawer, sees report list. Taps a report, sees detail view.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | App is running | User opens drawer and taps "What's New" | App navigates to `/whats-new` showing report list | Open drawer, tap What's New, verify URL is /whats-new |
| 2 | User is on What's New list | User taps a report card | App navigates to `/whats-new/[reportId]` detail view | Tap any report card, verify detail screen loads |
| 3 | Drawer is open | User sees navigation sections | "What's New" label appears with Newspaper icon | Visual inspection of drawer nav sections |
| 4 | All existing navigation | User taps other drawer items | Other routes (articles, subscriptions, toolbelt, settings, improvements) still work | Navigate to each existing section |

## TEST CRITERIA

Review agents verify ALL test criteria are TRUE before marking task complete.

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | Drawer.Screen entries exist for "whats-new" and "whats-new/[reportId]" in _layout.tsx | AC-1, AC-2 | `grep -c 'whats-new' app/\(drawer\)/_layout.tsx` returns >= 2 | [x] TRUE [ ] FALSE |
| 2 | handleWhatsNewPress handler exists and routes to /whats-new | AC-1 | `grep 'handleWhatsNewPress' app/\(drawer\)/_layout.tsx | grep -q "whats-new"` | [x] TRUE [ ] FALSE |
| 3 | DrawerContent "What's New" item uses onWhatsNewPress not onSubscriptionsPress | AC-1 | `grep "What's New" screens/DrawerContent.tsx | grep -q 'onWhatsNewPress'` | [x] TRUE [ ] FALSE |
| 4 | TypeScript compiles without errors | AC-1-4 | `pnpm tsc --noEmit` exits 0 | [x] TRUE [ ] FALSE |
| 5 | All existing tests pass | AC-4 | `pnpm vitest run` exits 0 | [x] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `app/(drawer)/_layout.tsx` (MODIFY) - Add Drawer.Screen entries and handler
- `screens/DrawerContent.tsx` (MODIFY) - Add onWhatsNewPress prop, update nav section

### WRITE-PROHIBITED
- `app/(drawer)/whats-new/index.tsx` - Screen already works correctly
- `app/(drawer)/whats-new/[reportId].tsx` - Detail screen already works correctly
- `convex/whatsNew/*` - Backend is fine
- `components/whats-new/*` - Components are fine

## DESIGN

### References
- Existing drawer screen pattern: `app/(drawer)/_layout.tsx` lines 247-291
- Existing nav handler pattern: `app/(drawer)/_layout.tsx` lines 105-130
- DrawerContent props: `screens/DrawerContent.tsx` lines 16-48

### Code Pattern

In `app/(drawer)/_layout.tsx`, add handler (following existing pattern at lines 121-123):
```typescript
const handleWhatsNewPress = () => {
  router.push('/whats-new')
}
```

Add Drawer.Screen entries (following pattern at lines 263-278):
```typescript
<Drawer.Screen
  name="whats-new"
  options={{ headerShown: false, title: "What's New" }}
/>
<Drawer.Screen
  name="whats-new/[reportId]"
  options={{ headerShown: false, title: "What's New Report" }}
/>
```

Pass to DrawerContent:
```typescript
onWhatsNewPress={handleWhatsNewPress}
```

In `screens/DrawerContent.tsx`, add prop and update nav section (line 138):
```typescript
// Props interface: add onWhatsNewPress?: () => void
// Nav section: change onPress from onSubscriptionsPress to onWhatsNewPress
{ id: 'whats-new', label: "What's New", icon: <Newspaper size={20} className="text-foreground" />, onPress: onWhatsNewPress },
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**: Follow Expo Router conventions for screen registration
- **CLAUDE.md**: Commit automatically with descriptive message

## DEPENDENCIES

No task dependencies.

## REQUIRED READING

1. `app/(drawer)/_layout.tsx` - ALL
   Focus: Drawer.Screen registrations (lines 247-291), navigation handlers (lines 105-130), CustomDrawerContent props passing (lines 140-160)

2. `screens/DrawerContent.tsx` - Lines 1-50, 136-142
   Focus: Props interface, navigation sections array
