# US-NAV-003: Navigation Change Tooltip

> Task ID: US-NAV-003
> Type: FEATURE
> Priority: P1
> Assignee: frontend-designer

## Objective

Show a one-time tooltip explaining the navigation changes when users first visit after the update.

## Success State

User sees tooltip on first visit, understands what changed, dismisses it with "Got it" button, never sees it again.

## Acceptance Criteria

```gherkin
GIVEN user has not seen tooltip before
WHEN user opens What's New for the first time
THEN tooltip appears pointing to drawer
AND says "Subscriptions moved to Settings. What's New is now your content feed."
AND "Got it" button dismisses tooltip
AND tooltip never appears again

GIVEN user has dismissed tooltip
WHEN user opens What's New again
THEN tooltip does not appear
```

**Verify:**
```bash
grep -r "hasSeenNavTooltip" convex/
pnpm vitest run --grep="tooltip"
```

## Critical Constraints

**MUST:**
- Store dismissal state in user preferences (Convex)
- Use semantic theme colors
- Be dismissible by tapping outside

**NEVER:**
- Block navigation while tooltip is visible
- Show on every visit
- Use local storage (must be server-side)

**STRICTLY:**
- Show only on first visit after update
- Message must match PRD exactly

## Guardrails

**Write Allowed:**
- `components/NavigationTooltip.tsx` (NEW)
- `app/(drawer)/whats-new.tsx` (MODIFY - show tooltip)
- `convex/users/queries.ts` (MODIFY - add hasSeenNavTooltip)
- `convex/users/mutations.ts` (MODIFY - add dismissTooltip)

**Write Prohibited:**
- `app/(drawer)/_layout.tsx` - No drawer changes

## Blocked By

US-NAV-001 (Wave 1)

## Estimate

45 minutes

## Agent Assignment

**Agent:** `frontend-designer`
**Rationale:** UI component with state management
