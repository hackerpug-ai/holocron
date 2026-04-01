# US-NAV-002: Manage Subscriptions from Settings

> Task ID: US-NAV-002
> Type: FEATURE
> Priority: P0
> Estimate: 60 minutes
> Assignee: frontend-designer

## CRITICAL CONSTRAINTS

### MUST
- Add "Subscriptions" section to Settings screen
- Section appears after "Voice Language" section
- Navigate to subscription management on tap
- Match existing Settings UI patterns (rounded cards, icons, dividers)

### NEVER
- Remove existing Settings sections
- Change subscription management functionality
- Break existing subscription routes

### STRICTLY
- Follow existing SettingsScreen component patterns
- Use existing SubscriptionSection component if available
- Maintain consistent spacing and styling

## SPECIFICATION

**Objective:** Add a "Subscriptions" section to the Settings screen that navigates to subscription management

**Success looks like:** User opens Settings, sees "Subscriptions" section between "Voice Language" and "Appearance", taps it, sees subscription management screen

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Settings screen open | User scrolls | "Subscriptions" section visible after "Voice Language" | `getByText('Subscriptions')` exists |
| 2 | User taps Subscriptions section | onPress fires | Navigation to subscription management | Router navigates to `/subscriptions/settings` |
| 3 | Subscription section | Component renders | Matches Settings UI patterns (icon, title, chevron) | Visual verification |
| 4 | Deep link `/subscriptions` | User navigates | Redirects to Settings with Subscriptions visible | URL updates correctly |

## GUARDRAILS

### WRITE-ALLOWED
- `screens/settings-screen.tsx` (MODIFY) - add subscriptions section
- `components/settings/SubscriptionSection.tsx` (MODIFY if exists, else CREATE)
- `app/(drawer)/subscriptions/settings.tsx` (ENSURE EXISTS)

### WRITE-PROHIBITED
- `app/(drawer)/_layout.tsx` - drawer changes in US-NAV-001
- `convex/**` - no backend changes
- Other Settings sections - do not modify

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-NAV-002 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-1.2 Settings Subscriptions Section
- `screens/settings-screen.tsx` - existing settings patterns

### Interaction Notes
- Section should match existing Settings sections (Appearance, Voice Language)
- Use Globe or Rss icon for subscriptions
- Chevron indicates navigable section
- Tap feedback (opacity change)

### Code Pattern

Source: `screens/settings-screen.tsx:273-330`

```typescript
// Pattern: Settings section with navigation
<View className="gap-3">
  {/* Section title with icon */}
  <View className="flex-row items-center gap-2 px-1">
    <View className="rounded-lg bg-primary/10 p-2">
      <Rss size={16} className="text-primary" />
    </View>
    <Text variant="h2" className="text-foreground">
      Subscriptions
    </Text>
  </View>

  {/* Section description */}
  <Text variant="default" className="px-1 text-muted-foreground">
    Manage your content sources and notification preferences.
  </Text>

  {/* Navigable section card */}
  <Pressable
    onPress={() => router.push('/subscriptions/settings')}
    className="rounded-2xl border border-border bg-card p-4 flex-row items-center justify-between"
    testID="settings-subscriptions-section"
  >
    <View className="flex-row items-center gap-3">
      <Rss size={20} className="text-muted-foreground" />
      <Text variant="default">Manage Subscriptions</Text>
    </View>
    <ChevronRight size={20} className="text-muted-foreground" />
  </Pressable>
</View>
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Inconsistent styling, no navigation pattern
<Button onPress={() => router.push('/subscriptions')}>
  Subscriptions
</Button>
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Follow existing Settings section patterns
  - Use NativeWind classes for styling
  - Include testID for E2E testing

## DEPENDENCIES

Depends on:
- US-NAV-001 (Access What's New from Main Navigation) - requires drawer rename first

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-NAV-002 acceptance criteria
2. `screens/settings-screen.tsx` - existing settings layout and patterns
3. `components/settings/SubscriptionSection.tsx` - check if component exists

## NOTES

The SubscriptionSection component may already exist (seen in imports). Check if it's fully implemented or just a stub. If fully implemented, this task may just be about positioning it correctly in the Settings screen order.
