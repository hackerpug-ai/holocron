# US-016: Wire ChatThread to chat-history API with pagination

## Implementation Complete

**Base SHA**: f7b1b5b08dafdcbb6cab03688bd3eabe09660fa0
**Commit SHA**: bf9fd023e2663b947b1bb4654b64ddb6b40239f7

## Files Created/Modified

### Created:
- `hooks/use-chat-history.ts` - Custom hook for fetching chat history with pagination

### Modified:
- `app/(drawer)/chat/[conversationId].tsx` - Integrated ChatThread with live data

## Implementation Summary

Successfully integrated the ChatThread component with the chat-history Edge Function, enabling real chat history display with infinite scroll pagination.

### Hook Implementation (use-chat-history.ts)

The custom hook provides:
- **Initial Load**: Fetches first 20 messages when conversationId changes
- **Cursor-Based Pagination**: Loads more messages using `before` cursor
- **State Management**:
  - `messages` - Array of ChatMessage objects
  - `isLoading` - Initial load state
  - `isLoadingMore` - Pagination load state
  - `error` - Error handling
  - `hasMore` - Indicates if more messages exist
  - `nextCursor` - Timestamp for next page
- **API Integration**: Uses fetch directly for GET requests with query params
- **Data Transformation**: Converts API response to ChatMessage format

### Chat Screen Integration

Updated the chat screen to:
- Use the `useChatHistory` hook with conversationId from route params
- Pass data to ChatThread component
- Handle loading and error states for messages
- Display messages with infinite scroll

## Verification

**TypeCheck**: PASSED ✓
```bash
pnpm typecheck
```

## Key Design Decisions

1. **Fetch over functions.invoke**: Used native fetch API for GET requests with query params since Supabase functions.invoke doesn't handle query params cleanly
2. **useEffect with ref**: Prevented double-loading on mount with hasLoadedRef
3. **Separate loading states**: Distinguished between initial load and pagination for better UX
4. **Direct transformation**: Converts API messages to ChatMessage format inline

## Testing Notes

This is an integration task. Testing should verify:
- Hook fetches messages on mount
- Pagination works with scroll
- Conversation switching refetches correctly
- Error states display properly

Ready for reviewer verification.
