# US-IMP-006: Subscriptions Redesign - Settings Management

> Task ID: US-IMP-006
> Type: FEATURE
> Priority: P1
> Estimate: 120 minutes
> Assignee: frontend-designer

## CRITICAL CONSTRAINTS

### MUST
- Move subscription management from main app to settings screen
- Preserve all existing subscription functionality
- Maintain data compatibility (no migration needed)

### NEVER
- Remove subscription data during relocation
- Break existing subscription sync/management

### STRICTLY
- Settings screen MUST have dedicated subscriptions section
- All subscription management MUST work from settings

## SPECIFICATION

**Objective:** Move subscription management from current location to settings screen, cleaning up the main app navigation.

**Success looks like:** Users manage all subscriptions (add, remove, configure) from a dedicated section in settings, and subscriptions no longer clutter the main app interface.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|----|-------|------|------|--------|
| 1 | Settings screen exists | User navigates to settings | Subscriptions section is visible | Open settings and check for "Subscriptions" section |
| 2 | User opens subscriptions in settings | Section loads | All subscription sources are listed | `npx convex run subscriptions/queries:list | jq 'length' | grep -q '[0-9]'` |
| 3 | User manages subscription | User adds/removes/configures | Operation completes successfully | Test add/remove from settings, verify in list |
| 4 | Old subscription UI location | User navigates main app | Old subscription entry point is removed | Navigate main app, verify no subscription menu item |

## TEST CRITERIA

Review agents verify ALL test criteria are TRUE before marking task complete.

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | Settings screen has subscriptions section when rendered | AC-1 | `Open settings, check DOM for 'subscriptions' text or section` | [ ] TRUE [ ] FALSE |
| 2 | All subscription sources appear in settings when queried | AC-2 | `npx convex run subscriptions/queries:list | jq '.[].name' | grep -q '[A-Z]'` | [ ] TRUE [ ] FALSE |
| 3 | Subscription add/remove works from settings when user clicks | AC-3 | `Add YouTube sub, remove it, verify list updates` | [ ] TRUE [ ] FALSE |
| 4 | Main app no longer has subscription entry point when navigating | AC-4 | `Navigate main app screens, verify no subscription menu/button` | [ ] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `app/(drawer)/settings.tsx` (MODIFY) - Add subscriptions section
- `components/settings/SubscriptionManager.tsx` (NEW) - Settings UI
- `app/(drawer)/subscriptions.tsx` (DELETE or MOVE) - Remove old location

### WRITE-PROHIBITED
- `convex/subscriptions/` - Don't modify subscription data layer
- `convex/schema.ts` - No schema changes needed

## DESIGN

### References
- Current settings screen in `app/(drawer)/settings.tsx`
- Current subscriptions screen in `app/(drawer)/subscriptions.tsx`
- Subscription queries in `convex/subscriptions/queries.ts`

### Interaction Notes
- Subscriptions should be a top-level settings section (like Notifications)
- Consider grouping: "Content Sources" > Subscriptions, What's New config
- Maintain existing subscription card/row patterns

### Code Pattern
Settings section pattern:
```typescript
<SettingsSection title="Content Sources">
  <SettingsListItem
    title="Subscriptions"
    description="Manage your content sources"
    onPress={() => router.push('/settings/subscriptions')}
    testID="subscriptions-settings-item"
  />
  <SettingsListItem
    title="What's New"
    description="Configure news feed"
    onPress={() => router.push('/settings/whats-new')}
    testID="whats-new-settings-item"
  />
</SettingsSection>
```

### Anti-pattern (DO NOT)
```typescript
// DON'T: Duplicate subscription management code
// Copy-paste from subscriptions.tsx to settings

// DO: Reuse existing components
<SubscriptionManager mode="settings" />
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use react-native-paper List.Item for settings items
  - All navigation items need testID
- **brain/docs/THEME-RULES.md**:
  - Use semantic spacing for settings layout
  - Follow existing settings section patterns

## DEPENDENCIES

**Depends On:**
- US-IMP-005 (What's New redesign) - Settings should reference redesigned What's New

## REQUIRED READING

1. `app/(drawer)/settings.tsx` - ALL
   Focus: Current settings structure

2. `app/(drawer)/subscriptions.tsx` - ALL
   Focus: Current subscription management UI

3. `components/settings/` (directory) - ALL
   Focus: Existing settings component patterns

4. `brain/docs/TDD-METHODOLOGY.md` - Sections: TDD Cycle
   Focus: RED → GREEN → REFACTOR workflow

## NOTES

- Consider a dedicated subscriptions settings screen at `/settings/subscriptions`
- Reuse existing subscription management components
- Remove old subscriptions route from navigation
- Update any deep links that point to old subscriptions location
