# US-NAV-004: Deep Link Redirects

> Task ID: US-NAV-004
> Type: FEATURE
> Priority: P0
> Estimate: 45 minutes
> Assignee: frontend-designer

## CRITICAL CONSTRAINTS

### MUST
- `/subscriptions` redirects to `/settings` (or Settings with Subscriptions visible)
- `/subscriptions/feed` redirects to `/whats-new`
- `/subscriptions/[id]` redirects appropriately (content detail or feed)
- Preserve query parameters in redirects

### NEVER
- Break existing deep links (must redirect, not 404)
- Lose query parameters during redirect
- Create new routes (redirect existing ones)

### STRICTLY
- Use Expo Router redirect patterns
- Handle all subscription-related deep links
- Log redirects for analytics

## SPECIFICATION

**Objective:** Implement deep link redirects so existing links to subscription routes continue working after navigation restructuring

**Success looks like:** User clicks old deep link (`/subscriptions/feed`), app opens to What's New screen with correct content

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Deep link `/subscriptions` | User opens link | Redirected to `/settings` (or Settings > Subscriptions) | URL is `/settings`, Subscriptions section visible |
| 2 | Deep link `/subscriptions/feed` | User opens link | Redirected to `/whats-new` | URL is `/whats-new` |
| 3 | Deep link `/subscriptions/social` | User opens link | Redirected appropriately | Content loads correctly |
| 4 | Deep link with query params | User opens link | Params preserved after redirect | Query params accessible in destination |
| 5 | Old notification link | User taps notification | Opens correct screen | Deep link resolves correctly |

## GUARDRAILS

### WRITE-ALLOWED
- `app/subscriptions.tsx` (NEW or MODIFY) - redirect handler
- `app/subscriptions/feed.tsx` (MODIFY) - redirect to whats-new
- `app/(drawer)/subscriptions.tsx` (MODIFY) - redirect logic
- `app/(drawer)/subscriptions/feed.tsx` (MODIFY) - redirect to whats-new

### WRITE-PROHIBITED
- `convex/**` - no backend changes
- New screen components - only add redirect logic
- Delete existing routes - keep them as redirect handlers

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-NAV-004 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-9.2 Deep Link Redirects
- Expo Router documentation - redirect patterns

### Interaction Notes
- Redirect should be instant (no loading screen)
- URL should update to new route
- Navigation history should not include redirect hop (replace, not push)
- Log redirect for analytics (optional but recommended)

### Code Pattern

```typescript
// Pattern: Expo Router redirect using useEffect
// app/(drawer)/subscriptions.tsx or app/subscriptions.tsx
import { Redirect } from 'expo-router'
import { useEffect } from 'react'
import { useRouter } from 'expo-router'

export default function SubscriptionsRedirect() {
  const router = useRouter()
  
  // Redirect to settings with subscriptions section
  return <Redirect href="/settings" />
}

// Alternative: Programmatic redirect with query params preservation
export default function SubscriptionsFeedRedirect() {
  const router = useRouter()
  
  useEffect(() => {
    // Log redirect for analytics
    console.log('[DeepLink] Redirecting /subscriptions/feed to /whats-new')
    
    // Replace to avoid adding to history
    router.replace('/whats-new')
  }, [])
  
  return null // or loading indicator
}
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Breaking deep links, slow redirect
export default function OldRoute() {
  return <Text>This page has moved</Text> // User sees error, not redirect
}

// ❌ WRONG: Using push (adds to history)
router.push('/whats-new') // Back button goes to redirect page, not previous
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use Expo Router redirect patterns
  - Handle all edge cases
  - Log redirects for debugging

## DEPENDENCIES

Depends on:
- US-NAV-001 (Access What's New from Main Navigation) - requires /whats-new route
- US-NAV-002 (Manage Subscriptions from Settings) - requires /settings with subscriptions

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-NAV-004 acceptance criteria
2. `app/(drawer)/subscriptions/` - existing subscription routes to redirect
3. Expo Router documentation on redirects

## NOTES

Check if there are any existing deep link handlers in the app (e.g., for notifications). Ensure those are also updated to point to new routes. This task is critical for backward compatibility - users may have bookmarked links or received notification links that should continue working.
