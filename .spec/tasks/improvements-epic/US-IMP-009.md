# US-IMP-009: 3-Dot Menu Bottom Sheet

> Task ID: US-IMP-009
> Type: FEATURE
> Priority: P2
| Estimate: 90 minutes
> Assignee: frontend-designer

## CRITICAL CONSTRAINTS

### MUST
- 3-dot menu must raise a bottom sheet (consistent with other app menus)
- Maintain existing menu options and functionality
- Follow existing bottom sheet patterns in app

### NEVER
- Change menu options or their actions
- Break menu accessibility

### STRICTLY
- Bottom sheet MUST grow up from bottom (not push up)
- Animation MUST match other bottom sheets in app

## SPECIFICATION

**Objective:** Fix the improvements 3-dot menu to raise a bottom sheet with options, matching the menu pattern used elsewhere in the app.

**Success looks like:** Tapping the 3-dot menu on an improvement item slides up a bottom sheet with action options, consistent with all other app menus.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | User views improvement card | Card renders | 3-dot menu button is visible | Open improvements, check for menu button |
| 2 | User taps 3-dot menu | Button press | Bottom sheet slides up from bottom | Tap menu, observe sheet animation |
| 3 | Bottom sheet is open | Sheet visible | All improvement actions are listed | Check sheet content for action items |
| 4 | User selects action | Action tap | Sheet dismisses and action executes | Tap action, verify sheet closes + action runs |

## TEST CRITERIA

Review agents verify ALL test criteria are TRUE before marking task complete.

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | 3-dot menu button is visible on improvement cards when improvements list renders | AC-1 | `Open improvements, check card DOM for menu button` | [ ] TRUE [ ] FALSE |
| 2 | Bottom sheet appears with grow-up animation when menu button is tapped | AC-2 | `Tap menu, observe sheet entrance animation direction` | [ ] TRUE [ ] FALSE |
| 3 | Sheet contains all expected actions when bottom sheet is open | AC-3 | `Check sheet DOM for action buttons (edit, done, remove)` | [ ] TRUE [ ] FALSE |
| 4 | Action executes and sheet closes when user selects action | AC-4 | `Tap action, verify sheet dismisses and action completes` | [ ] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `components/improvements/ImprovementActionMenu.tsx` (MODIFY) - Convert to bottom sheet
- `components/improvements/ImprovementCard.tsx` (MODIFY) - Update menu trigger

### WRITE-PROHIBITED
- `convex/improvements/` - No backend changes needed
- Other menu components - Only modify improvements menu

## DESIGN

### References
- Current ImprovementActionMenu component
- Other bottom sheet implementations in app
- react-native-paper BottomSheet usage patterns

### Interaction Notes
- Use react-native-paper's BottomSheet or Portal
- Sheet should have backdrop dim
- Dismiss on backdrop tap
- Actions: Edit, Mark Done, Remove (current menu options)

### Code Pattern
Bottom sheet pattern:
```typescript
import { BottomSheet, Portal } from 'react-native-paper';

function ImprovementActionMenu({ visible, onDismiss, onAction }) {
  return (
    <Portal>
      <BottomSheet
        visible={visible}
        onDismiss={onDismiss}
        testID="improvement-action-sheet"
      >
        <BottomSheet.Item
          label="Edit"
          onPress={() => onAction('edit')}
          testID="action-edit"
        />
        <BottomSheet.Item
          label="Mark Done"
          onPress={() => onAction('done')}
          testID="action-done"
        />
        <BottomSheet.Item
          label="Remove"
          onPress={() => onAction('remove')}
          testID="action-remove"
        />
      </BottomSheet>
    </Portal>
  );
}
```

### Anti-pattern (DO NOT)
```typescript
// DON'T: Use PushableSheet (pushes content up)
<PushableSheet>

// DO: Use BottomSheet (grows up)
<BottomSheet>
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use react-native-paper BottomSheet
  - All actions need testID
- **brain/docs/THEME-RULES.md**:
  - Use semantic spacing for sheet items
  - Follow existing sheet patterns in app

## DEPENDENCIES

No task dependencies.

## REQUIRED READING

1. `components/improvements/ImprovementActionMenu.tsx` - ALL
   Focus: Current menu implementation

2. `components/improvements/ImprovementCard.tsx` - ALL
   Focus: How menu is triggered

3. Other BottomSheet components in app - ALL
   Focus: Consistent bottom sheet patterns

4. `brain/docs/TDD-METHODOLOGY.md` - Sections: TDD Cycle
   Focus: RED → GREEN → REFACTOR workflow

## NOTES

- Check if there are other menu implementations to reference
- Ensure sheet grows up (not pushes content up)
- Test dismiss on backdrop tap
- Consider haptic feedback on sheet open
