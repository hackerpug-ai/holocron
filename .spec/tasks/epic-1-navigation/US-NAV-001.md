# US-NAV-001: Rename Drawer to What's New

> Task ID: US-NAV-001
> Type: FEATURE
> Priority: P0
> Assignee: frontend-designer

## Objective

Rename the "Subscriptions" drawer item to "What's New" to reflect its role as the content feed.

## Success State

User sees "What's New" in the drawer with a newspaper icon, and tapping it opens the feed screen.

## Acceptance Criteria

```gherkin
GIVEN the app is launched
WHEN the user views the drawer
THEN "What's New" appears in the navigation
AND the icon is a newspaper or sparkles icon
AND tapping opens the feed screen
```

**Verify:**
```bash
grep -r "What's New" app/(drawer)/_layout.tsx
pnpm vitest run --grep="drawer"
```

## Critical Constraints

**MUST:**
- Use semantic theme colors for icon and text
- Maintain existing drawer item ordering

**NEVER:**
- Change any functionality beyond the label and icon
- Remove the existing subscriptions screen file

**STRICTLY:**
- Label must be exactly "What's New"

## Guardrails

**Write Allowed:**
- `app/(drawer)/_layout.tsx` (MODIFY - update label/icon)

**Write Prohibited:**
- `app/(drawer)/settings.tsx` - Not in scope
- `convex/*` - No backend changes

## Blocked By

None (Wave 0)

## Estimate

15 minutes

## Agent Assignment

**Agent:** `frontend-designer`
**Rationale:** Simple UI label change, follows existing patterns
