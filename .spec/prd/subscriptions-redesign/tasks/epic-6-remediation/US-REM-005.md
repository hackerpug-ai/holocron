# US-REM-005: Implement Deep Link Redirects

> Task ID: US-REM-005
> Type: FEATURE
> Priority: P0
> Estimate: 45 minutes
> Assignee: frontend-designer

## CRITICAL CONSTRAINTS

### MUST
- Handle old `/subscriptions` routes and redirect appropriately
- Use Expo Router navigation for redirects
- Preserve query parameters when redirecting
- Handle both `/subscriptions` and `/subscriptions/feed` legacy routes
- Log redirects for monitoring

### NEVER
- Break existing `/subscriptions` (management) route
- Create infinite redirect loops
- Use web browser redirect (use router.push)
- Hardcode route strings (use constants)

### STRICTLY
- Redirect `/subscriptions` → `/whats-new` (feed view)
- Redirect `/subscriptions/feed` → `/whats-new` (feed view)
- Keep `/subscriptions/settings` unchanged (management view)
- Add redirect logging

## SPECIFICATION

**Objective:** Implement deep link redirects for backward compatibility with old subscription routes.

**Success looks like:** Users with old `/subscriptions` links are automatically redirected to the correct new location without errors.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | User navigates to `/subscriptions` | Route loads | Redirected to `/whats-new` | Router location is `/whats-new` |
| 2 | User navigates to `/subscriptions/feed` | Route loads | Redirected to `/whats-new` | Router location is `/whats-new` |
| 3 | User navigates to `/subscriptions/settings` | Route loads | No redirect, settings render | Settings screen visible |
| 4 | Old route has query params | Redirect occurs | Query params preserved | `router.push` includes params |

## TEST CRITERIA

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | Navigation to `/subscriptions` redirects to `/whats-new` | AC-1 | Manual test or E2E test | [ ] TRUE [ ] FALSE |
| 2 | Navigation to `/subscriptions/feed` redirects to `/whats-new` | AC-2 | Manual test or E2E test | [ ] TRUE [ ] FALSE |
| 3 | Navigation to `/subscriptions/settings` does NOT redirect | AC-3 | Settings screen renders | [ ] TRUE [ ] FALSE |
| 4 | Query parameters preserved when redirecting from `/subscriptions?tab=new` | AC-4 | Params in destination URL | [ ] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `app/subscriptions/_layout.tsx` (NEW - redirect handler)
- `app/subscriptions/index.tsx` (MODIFY - add redirect logic)
- `lib/constants/routes.ts` (MODIFY - add route constants)

### WRITE-PROHIBITED
- `app/(drawer)/subscriptions/**` - don't modify existing routes
- `app/(drawer)/whats-new/**` - don't modify destination routes
- `app/subscriptions/settings.tsx` - keep unchanged

## DESIGN

### References
- `app/subscriptions/feed.tsx` - existing redirect pattern
- Expo Router navigation docs - redirect patterns
- US-NAV-004 task - original specification

### Interaction Notes
- Redirects should be instant (no loading state)
- Use useEffect for redirect logic
- Log redirects for analytics
- Prevent infinite loops with conditional checks

### Code Pattern

Source: Expo Router redirect pattern

```typescript
/**
 * Subscriptions redirect handler
 *
 * Redirects old subscription routes to new locations:
 * - /subscriptions → /whats-new
 * - /subscriptions/feed → /whats-new
 * - /subscriptions/settings → (no redirect, management view)
 */
import { useEffect } from 'react'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { log } from '@/lib/logger-client'

// Legacy route constants
const LEGACY_FEED_ROUTES = ['/subscriptions', '/subscriptions/feed']
const NEW_FEED_ROUTE = '/whats-new'

export default function SubscriptionsRedirect() {
  const router = useRouter()
  const params = useLocalSearchParams()
  const pathname = // get current pathname from router

  useEffect(() => {
    // Check if this is a legacy feed route
    if (LEGACY_FEED_ROUTES.includes(pathname)) {
      log('Navigation').info('Legacy subscription route redirect', {
        from: pathname,
        to: NEW_FEED_ROUTE,
        params,
      })

      // Redirect to new feed route, preserving query params
      router.replace({
        pathname: NEW_FEED_ROUTE,
        params,
      })
    }
    // Else: /subscriptions/settings - no redirect, let it render
  }, [pathname, params, router])

  // Show loading while redirecting
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator />
    </View>
  )
}
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Infinite redirect loop
useEffect(() => {
  router.replace('/subscriptions')
}, [])

// ❌ WRONG: No query param preservation
router.replace('/whats-new')
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use useEffect for side effects (navigation)
  - Use router.replace for redirects (not push)
  - Log navigation changes

## DEPENDENCIES

No task dependencies.

## REQUIRED READING

1. `app/subscriptions/feed.tsx` - Existing redirect example
2. Expo Router docs - Navigation and redirects
3. US-NAV-004 task - Original specification

## NOTES

This task completes the navigation restructuring (Epic 1). The drawer labels were already changed to "What's New", but deep link compatibility was missing.

Important: Don't break the `/subscriptions/settings` route - it's the new location for subscription management (moved from main drawer).
