# US-IMP-008: Assistant Button Placement

> Task ID: US-IMP-008
> Type: FEATURE
> Priority: P2
> Estimate: 60 minutes
> Assignee: frontend-designer

## CRITICAL CONSTRAINTS

### MUST
- Move assistant button inside the input field (ChatGPT-style)
- Button must be clearly visible but not obstruct typing
- Maintain existing assistant functionality

### NEVER
- Remove or alter assistant button functionality
- Break chat input field behavior

### STRICTLY
- Button MUST be positioned on the right side of input field
- Button MUST be inside the input container

## SPECIFICATION

**Objective:** Relocate the assistant button from its current position to inside the chat input field, matching ChatGPT's UI pattern.

**Success looks like:** The assistant button appears inside the text input field on the right side, clearly visible but not interfering with typing.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Chat screen loads | Input field renders | Assistant button is visible inside input container | Open chat, check input field DOM for button |
| 2 | User types message | Text in input | Button does not obstruct or overlap text | Type long message, verify button position |
| 3 | User taps assistant button | Button press | Assistant modal/menu opens as before | Tap button, verify assistant UI appears |
| 4 | Old button location | Previous location | Old button position is removed | Check previous button location is empty |

## TEST CRITERIA

Review agents verify ALL test criteria are TRUE before marking task complete.

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | Assistant button is inside input container when chat screen loads | AC-1 | `Check DOM: button is child of input-container element` | [ ] TRUE [ ] FALSE |
| 2 | Button does not overlap text when user types message | AC-2 | `Type message, check button doesn't cover text cursor` | [ ] TRUE [ ] FALSE |
| 3 | Assistant functionality works when button is pressed | AC-3 | `Tap button, verify assistant modal opens` | [ ] TRUE [ ] FALSE |
| 4 | Old button location is empty when checking previous position | AC-4 | `Check previous button location, verify no button element` | [ ] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `components/chat/ChatInput.tsx` (MODIFY) - Move button inside input
- `components/chat/AssistantButton.tsx` (MODIFY) - Adjust styling if needed

### WRITE-PROHIBITED
- `convex/` - No backend changes needed
- Other chat components - Don't modify unrelated chat UI

## DESIGN

### References
- Current ChatInput component
- ChatGPT input field UI pattern (reference)
- react-native-paper TextInput with adornments

### Interaction Notes
- Button should use `right` adornment position in TextInput
- Consider icon-only button (no text) to save space
- Button should have subtle hover/pressed states
- Ensure button is tappable (min 44x44 touch target)

### Code Pattern
react-native-paper TextInput with right adornment:
```typescript
<View style={styles.inputContainer}>
  <TextInput
    mode="flat"
    placeholder="Ask anything..."
    style={styles.input}
    right={
      <TextInput.Icon
        icon="robot"
        size={20}
        onPress={handleAssistantPress}
        testID="assistant-button"
      />
    }
  />
</View>
```

### Anti-pattern (DO NOT)
```typescript
// DON'T: Position button absolutely outside input
<AssistantButton style={{ position: 'absolute', right: 10 }} />

// DO: Use TextInput's built-in adornment system
<TextInput right={<TextInput.Icon icon="robot" />} />
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use react-native-paper TextInput.Icon
  - Button needs testID="assistant-button"
- **brain/docs/THEME-RULES.md**:
  - Icon color should use semantic tokens

## DEPENDENCIES

No task dependencies.

## REQUIRED READING

1. `components/chat/ChatInput.tsx` - ALL
   Focus: Current input field structure

2. `components/chat/AssistantButton.tsx` - ALL
   Focus: Current button implementation

3. `brain/docs/TDD-METHODOLOGY.md` - Sections: TDD Cycle
   Focus: RED → GREEN → REFACTOR workflow

## NOTES

- Icon: "robot" or "sparkles" from Material Icons
- Size: 20-24px for icon
- Color: Secondary or tertiary semantic color
- This is a UI-only change (no functionality changes)
