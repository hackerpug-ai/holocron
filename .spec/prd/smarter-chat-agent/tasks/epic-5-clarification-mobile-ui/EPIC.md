# Epic 5: Clarification Mobile UI

**Sequence**: 5 of 6
**Priority**: P0
**Wall-clock estimate**: ~6 hours (3 tasks)

## Overview

Build the mobile UI for clarification bubbles. Quick-reply chip leaf component, then a composite clarification bubble with a left-edge accent stripe and 0-4 optional quick-reply chips, then the ChatThread dispatch that maps `card_type='clarification'` (emitted by Epic 3's backend short-circuit) to the new component and wires chip taps to the chat screen's `sendMessage` path.

**Uses NativeWind + `@/components/ui/text`.** No react-native-paper.

## Human Test Steps

1. Send "find me a career coach" on device
2. See `ClarificationMessage` bubble appear with left-accent stripe + "Quick question" label
3. See 0-4 quick-reply chips (if backend provided them)
4. Tap a chip → `ChatThread.onSendMessage` called with the chip label
5. Agent resumes and completes original recommendation intent (via Epic 3 pending-state)
6. Verify `answered=true` disables chips (accessibility state)
7. Verify chips do NOT fire after being tapped when answered
8. Switch to dark mode, verify accent colors use Tailwind tokens
9. Enable VoiceOver and verify the "Quick question" label is announced

## PRD Sections Covered

- `06-uc-clr.md` — UC-CLR-09 (ClarificationMessage component), UC-CLR-10 (quick-reply chips)
- `09-technical-requirements.md` — Build Sequence Tasks 17, 18, 27

## Acceptance Criteria (Epic-level)

- [ ] `ClarificationQuickReplyChip` renders a pressable pill with `testID`, accessibility state, disabled path
- [ ] `ClarificationMessage` renders question + optional chips + optional user response with a left-edge accent stripe
- [ ] Answered state disables chips via `accessibilityState.disabled` + short-circuit on press
- [ ] `ChatThread` dispatches `card_type='clarification'` to `ClarificationMessage` via type guard
- [ ] Quick-reply tap fires a new `onSendMessage` prop on ChatThreadProps
- [ ] 6+ Storybook stories (Default, WithQuickReplies, WithMaximumChips, Answered, WithUserResponse, LongQuestion)
- [ ] NO `react-native-paper` imports

## Tasks

| ID         | Title                                          | Agent                     | Priority | Effort | Est (min) | Depends On                  |
|------------|------------------------------------------------|---------------------------|----------|--------|-----------|-----------------------------|
| CLR-UI-001 | ClarificationQuickReplyChip (leaf)             | react-native-ui-implementer | P0     | S      | 90        | —                           |
| CLR-UI-002 | ClarificationMessage (bubble + chips)          | react-native-ui-implementer | P0     | M      | 150       | CLR-UI-001, INT-001         |
| INT-UI-002 | ChatThread dispatch + onSendMessage wiring     | react-native-ui-implementer | P0     | S      | 120       | CLR-UI-002, CLR-002 (Epic 3)|

**Total estimate**: ~360 minutes (~6 hours)

## Dependency Graph

```
CLR-UI-001 ── CLR-UI-002 ── INT-UI-002
                 │
                 └── depends on INT-001 (schema) + CLR-002 (card shape from backend)
```

CLR-UI-001 can be built in parallel with Epic 1 since it has no backend dependency. CLR-UI-002 and INT-UI-002 need the backend clarification payload shape to be stable (post CLR-002 in Epic 3).

## Blocks

- (none — Epic 6 is independent)

## Definition of Done

1. All 3 tasks pass verification gates
2. Human test steps pass on a real device with the canonical "find me a coach" flow
3. Multi-turn clarification + resume works end-to-end with Epic 3's backend
4. Commit ends at a green tree
