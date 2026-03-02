# US-011 Testing Guide

## Prerequisites

1. Supabase must be initialized and running
2. The chat_messages migration must be applied
3. At least one conversation must exist in the database

## Apply Migration

```bash
# If using local Supabase
supabase db push

# If using remote Supabase
# Upload migration via Supabase dashboard or CLI
supabase db push --db-url <your-db-url>
```

## Manual Testing

### Test 1: Successful Message Send (AC-1)

Create a conversation first, then send a message:

```bash
# Get a conversation ID
curl -X GET 'http://localhost:54321/functions/v1/conversations?limit=1' \
  -H 'Authorization: Bearer <SUPABASE_ANON_KEY>'

# Send message (replace <uuid> with actual conversation_id)
curl -X POST 'http://localhost:54321/functions/v1/chat-send' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <SUPABASE_ANON_KEY>' \
  -d '{
    "conversation_id": "<uuid>",
    "content": "Hello",
    "message_type": "text"
  }'
```

Expected response:
```json
{
  "user_message_id": "...",
  "agent_messages": [
    {
      "id": "...",
      "role": "agent",
      "content": "Hello! I'm your research assistant. How can I help you today?",
      "message_type": "text"
    }
  ]
}
```

### Test 2: Verify Database Persistence (AC-2)

```bash
# Check messages in database
psql <connection-string> -c "SELECT role, content FROM chat_messages WHERE conversation_id='<uuid>' ORDER BY created_at"
```

Expected: Should show both user and agent messages.

### Test 3: Verify Conversation Metadata Update (AC-3)

```bash
psql <connection-string> -c "SELECT updated_at, last_message_preview FROM conversations WHERE id='<uuid>'"
```

Expected: `updated_at` should be recent, `last_message_preview` should contain the message text (truncated to 100 chars if needed).

### Test 4: Conversation Not Found (AC-4)

```bash
curl -X POST 'http://localhost:54321/functions/v1/chat-send' \
  -H 'Content-Type: application/json' \
  -d '{
    "conversation_id": "00000000-0000-0000-0000-000000000000",
    "content": "Hello",
    "message_type": "text"
  }'
```

Expected: HTTP 404 with `{"error": "Conversation not found"}`

### Test 5: Missing Content (AC-5)

```bash
curl -X POST 'http://localhost:54321/functions/v1/chat-send' \
  -H 'Content-Type: application/json' \
  -d '{
    "conversation_id": "<uuid>"
  }'
```

Expected: HTTP 400 with error message.

### Test 6: Empty Content (AC-6)

```bash
curl -X POST 'http://localhost:54321/functions/v1/chat-send' \
  -H 'Content-Type: application/json' \
  -d '{
    "conversation_id": "<uuid>",
    "content": "",
    "message_type": "text"
  }'
```

Expected: HTTP 400 with `{"error": "Message content cannot be empty"}`

### Test 7: Long Message Truncation (AC-7)

```bash
curl -X POST 'http://localhost:54321/functions/v1/chat-send' \
  -H 'Content-Type: application/json' \
  -d '{
    "conversation_id": "<uuid>",
    "content": "'"$(python3 -c 'print("a" * 500)')"'",
    "message_type": "text"
  }'
```

Then check:
```bash
psql <connection-string> -c "SELECT LENGTH(last_message_preview) FROM conversations WHERE id='<uuid>'"
```

Expected: Length should be 100 characters exactly (97 chars + "...").

### Test 8: CORS Preflight (AC-8)

```bash
curl -X OPTIONS 'http://localhost:54321/functions/v1/chat-send' -I
```

Expected: HTTP 204 with CORS headers:
- Access-Control-Allow-Origin: *
- Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
- Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS

## Agent Response Patterns

The stub agent response generator has basic logic:

- If message contains "hello" (case-insensitive): Returns greeting
- If message contains "help" (case-insensitive): Returns help text
- Otherwise: Returns generic acknowledgment

This is intentionally simple for MVP. Real AI integration will be added in future epics.
