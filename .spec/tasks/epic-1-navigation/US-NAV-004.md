# US-NAV-004: Deep Link Redirects

> Task ID: US-NAV-004
> Type: FEATURE
> Priority: P0
> Assignee: frontend-designer

## Objective

Ensure existing deep links to `/subscriptions` continue working by redirecting to new locations.

## Success State

User with old deep link is seamlessly redirected to correct new location.

## Acceptance Criteria

```gherkin
GIVEN user opens deep link holocron://subscriptions
WHEN app processes the link
THEN user is redirected to Settings > Subscriptions
AND redirect is seamless (< 500ms)

GIVEN user opens deep link holocron://subscriptions/feed
WHEN app processes the link
THEN user is redirected to What's New
AND redirect is seamless (< 500ms)

GIVEN user opens deep link with query params
WHEN redirecting
THEN query params are preserved
```

**Verify:**
```bash
pnpm vitest run --grep="deep-link"
npx expo start -- --uri-protocol=holocron://subscriptions
```

## Critical Constraints

**MUST:**
- Preserve query parameters during redirect
- Handle all three deep link patterns
- Log redirects for analytics

**NEVER:**
- Show 404 screen for old links
- Break existing push notification links
- Lose query parameters

## Guardrails

**Write Allowed:**
- `app/(drawer)/subscriptions.tsx` (MODIFY - add redirect)
- `app/_layout.tsx` (MODIFY - handle root redirects)

**Write Prohibited:**
- `convex/*` - No backend changes

## Blocked By

None (Wave 0)

## Estimate

30 minutes

## Agent Assignment

**Agent:** `frontend-designer`
**Rationale:** Simple routing logic
