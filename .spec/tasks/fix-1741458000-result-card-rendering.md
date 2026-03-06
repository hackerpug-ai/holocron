# Fix: result_card rendering issue

**Created**: 2026-03-06T09:20:00Z
**Mode**: Quick
**Implementer**: frontend-design
**Reviewer**: ui-reviewer

## Problem

result_card messages not rendering in chat - backend stores them correctly but frontend doesn't display them

### Context from Investigation

**Database Evidence** (via Convex MCP):
- Backend CORRECTLY stores messages with `messageType: "result_card"` and `cardData: {card_type: "no_results", message: "..."}`
- Example message in DB:
  ```json
  {
    "_id": "j57e08kmv3n3qqb4xjywpm2nah82cxj8",
    "messageType": "result_card",
    "cardData": {
      "card_type": "no_results",
      "message": "No articles found matching \"who was brigham young\""
    },
    "content": "No results found",
    "role": "agent"
  }
  ```

**Frontend Evidence**:
- Message does NOT appear in the UI
- Other messages from the same conversation DO render
- Screenshot shows "Loading..." spinner and other messages, but missing the result_card

**Data Flow**:
1. Backend: `convex/chat/index.ts` → Creates message with `messageType` and `cardData` ✅
2. Hook: `hooks/use-chat-history.ts` → Maps `messageType` to `message_type`, `cardData` to `card_data` ✅
3. Component: `components/chat/MessageBubble.tsx` → Checks `message_type === 'result_card'` ✅
4. Component: `components/ui/result-card.tsx` → Handles `no_results` card type ✅

**Suspected Issue**:
The render condition `message_type === 'result_card' && card_data && !isUser` at `components/chat/MessageBubble.tsx:44` may be failing silently, OR there's a type mismatch causing React Native to skip rendering.

## Acceptance Criteria

✅ When I run `/search who was brigham young` in the app
✅ The chat UI displays a "No results found" card with the message
✅ The card uses the `ResultCard` component with `cardType="no_results"`
✅ No console errors or warnings related to the card rendering

## Implementation Guidance

**Files to Investigate**:
- `components/chat/MessageBubble.tsx:40-62` - result_card rendering logic
- `hooks/use-chat-history.ts:53-60` - data transformation from Convex
- `components/ui/result-card.tsx:335-348` - no_results card rendering

**Debugging Steps**:
1. Add console.log in `MessageBubble.tsx` to verify props being received
2. Check if `card_data` is being passed correctly from the hook
3. Verify the render condition at line 44 is evaluating correctly
4. Check for any React Native rendering errors in the console

**Likely Fixes**:
- Add defensive checks for `card_data` structure
- Ensure `message_type` string comparison is correct
- Verify TypeScript types match runtime data
- Check if React Native needs a key prop or other fix to trigger re-render
