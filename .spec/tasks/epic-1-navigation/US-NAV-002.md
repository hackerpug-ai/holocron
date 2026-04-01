# US-NAV-002: Add Subscriptions Section to Settings

> Task ID: US-NAV-002
> Type: FEATURE
> Priority: P0
> Assignee: frontend-designer

## Objective

Add a "Subscriptions" section to the Settings screen where users can manage their subscriptions.

## Success State

User navigates to Settings > Subscriptions and sees all subscription management options previously in the subscriptions screen.

## Acceptance Criteria

```gherkin
GIVEN user is on Settings screen
WHEN user scrolls to Subscriptions section
THEN user sees subscription management options
AND can add new sources
AND can remove existing sources
AND can see subscription list

GIVEN user taps a subscription
WHEN viewing subscription details
THEN user can modify subscription settings
```

**Verify:**
```bash
grep -r "Subscriptions" app/(drawer)/settings.tsx
pnpm vitest run --grep="settings"
```

## Critical Constraints

**MUST:**
- Reuse existing subscription management components
- Use existing settings section pattern
- Maintain all subscription CRUD functionality

**NEVER:**
- Delete the original subscriptions screen file
- Change subscription data model
- Break existing subscription queries/mutations

## Guardrails

**Write Allowed:**
- `app/(drawer)/settings.tsx` (MODIFY - add subscriptions section)
- `components/settings/SubscriptionSection.tsx` (NEW)

**Write Prohibited:**
- `convex/subscriptions/*` - No backend changes

## Blocked By

US-NAV-001 (Wave 1)

## Estimate

60 minutes

## Agent Assignment

**Agent:** `frontend-designer`
**Rationale:** UI integration with existing components
