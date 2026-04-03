# US-FB-005: Unobtrusive Feedback UX

> Task ID: US-FB-005
> Type: FEATURE
> Priority: P0
> Estimate: 45 minutes
> Assignee: frontend-designer
> **Status: NOT DONE** - Refinement task, blocked by US-FB-001 (buttons not integrated)

## CRITICAL CONSTRAINTS

### MUST
- Buttons small and subtle (don't distract from content)
- Buttons easy to tap but not accidentally clicked
- Visual feedback minimal (no full-screen toasts)
- Buttons appear consistently across all card variants
- Proper accessibility labels

### NEVER
- Block content with feedback UI
- Show full-screen modal on feedback
- Make buttons so small they're hard to tap
- Overlap with other UI elements

### STRICTLY
- Position buttons in consistent location
- Use subtle colors (muted when inactive)
- Minimum 44x44 hitbox with visual padding

## SPECIFICATION

**Objective:** Ensure feedback buttons are unobtrusive and don't disrupt the content consumption experience

**Success looks like:** User can browse feed without noticing feedback buttons, but can easily provide feedback when desired. Accidental clicks are rare (<5%).

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Card renders | User views card | Feedback buttons visible but subtle | Visual verification |
| 2 | User provides feedback | Tap feedback button | Only icon changes state (no modal, no toast) | Visual verification |
| 3 | User scrolls feed | Cards pass by | Buttons don't interfere with scrolling | No scroll jank |
| 4 | User taps near button | Tap misses button | Card opens (not feedback) | Tap registration correct |
| 5 | Screen reader active | User focuses button | Clear label announced | Accessibility inspector |
| 6 | High contrast mode | Buttons render | Visible in both modes | Visual verification |

## GUARDRAILS

### WRITE-ALLOWED
- `components/subscriptions/FeedbackButtons.tsx` (MODIFY) - refine UX
- Card components (MODIFY if needed) - button positioning

### WRITE-PROHIBITED
- `convex/**` - backend done
- `app/**` - no routes
- Toast/notification systems

## DESIGN

### References
- `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-FB-005 acceptance criteria
- `.spec/prd/subscriptions-redesign/03-functional-requirements.md` - FR-4.1 Feedback Buttons on Cards

### UX Guidelines

```
Button Size & Position:
- Visual size: 18-20px icons
- Hit area: 44x44px minimum (transparent padding)
- Position: Top-right or bottom-right of card
- Spacing: 8px from card edge, 8px between buttons

Visual Style:
- Inactive: outline icon, muted-foreground color
- Hover/Focus: slight opacity change
- Active: filled icon, primary/destructive color
- No text labels (icons are self-explanatory)

Feedback Response:
- No toast messages
- No modals
- No haptic feedback (too intrusive)
- Just icon state change

Accessibility:
- aria-label: "More like this" / "Less like this"
- aria-pressed: true/false based on state
- role: button
```

### Code Pattern

```typescript
// components/subscriptions/FeedbackButtons.tsx - refined
export function FeedbackButtons({ currentFeedback, onFeedback }: Props) {
  return (
    <View className="flex-row gap-1">
      <Pressable
        onPress={() => onFeedback(currentFeedback === 'positive' ? null : 'positive')}
        className={cn(
          // Hit area is 44x44, but visual is smaller
          'rounded-full p-2 min-h-[44px] min-w-[44px]',
          'items-center justify-center',
          'active:opacity-70',
          // Subtle transition
          'transition-opacity duration-150'
        )}
        accessibilityLabel="More like this"
        accessibilityRole="button"
        accessibilityState={{ selected: currentFeedback === 'positive' }}
        testID="feedback-thumbs-up"
      >
        <ThumbsUp
          size={18}
          className={cn(
            'transition-colors duration-150',
            currentFeedback === 'positive' 
              ? 'text-primary' 
              : 'text-muted-foreground/60' // Subtle when inactive
          )}
          fill={currentFeedback === 'positive' ? 'currentColor' : 'none'}
        />
      </Pressable>
      
      <Pressable
        onPress={() => onFeedback(currentFeedback === 'negative' ? null : 'negative')}
        className={cn(
          'rounded-full p-2 min-h-[44px] min-w-[44px]',
          'items-center justify-center',
          'active:opacity-70'
        )}
        accessibilityLabel="Less like this"
        accessibilityRole="button"
        accessibilityState={{ selected: currentFeedback === 'negative' }}
        testID="feedback-thumbs-down"
      >
        <ThumbsDown
          size={18}
          className={cn(
            'transition-colors duration-150',
            currentFeedback === 'negative' 
              ? 'text-destructive' 
              : 'text-muted-foreground/60'
          )}
          fill={currentFeedback === 'negative' ? 'currentColor' : 'none'}
        />
      </Pressable>
    </View>
  )
}
```

### Anti-pattern (DO NOT)
```typescript
// ❌ WRONG: Toast on feedback
import { Toast } from 'react-native-toast-message'
Toast.show({ text: 'Thanks for feedback!' }) // Disrupts flow

// ❌ WRONG: Small hit area
<TouchableOpacity style={{ padding: 4 }}> // Too hard to tap

// ❌ WRONG: Bright colors
<ThumbsUp color="#007AFF" /> // Distracting
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - 44x44 minimum hit area
  - Subtle, non-distracting UI
  - Proper accessibility

## DEPENDENCIES

Depends on:
- US-FB-001 (Feedback Buttons on Cards) - buttons must exist

## REQUIRED READING

1. `.spec/prd/subscriptions-redesign/02-user-stories.md` - US-FB-005 acceptance criteria
2. Apple HIG - touch targets
3. Material Design - accessibility guidelines

## IMPLEMENTATION STATUS

**NOT DONE** - 2026-04-02

### ℹ️ Context
This is a **refinement/polish task** for US-FB-001. The FeedbackButtons component exists but needs UX refinement and integration verification.

### ⚠️ Pre-requisite
- **Blocked by US-FB-001**: Cannot polish UX until buttons are integrated into cards

### Verification Checklist (when US-FB-001 complete)
- [ ] Buttons positioned consistently (top-right or bottom-right)
- [ ] Subtle colors when inactive (muted-foreground)
- [ ] No toast/modal on feedback (icon state change only)
- [ ] 44x44 hitbox with visual padding
- [ ] Proper accessibility labels verified
- [ ] High contrast mode tested
- [ ] No overlap with other UI elements

---

## NOTES

This is a refinement task. The feedback buttons should already exist from US-FB-001. This task ensures they're subtle, accessible, and don't disrupt the user experience. Focus on polish, not new functionality.
