# 03 - Function Calling

## Event Flow

```
1. OpenAI decides to call a function
   → Server emits: response.output_item.done
   {
     item: {
       type: "function_call",
       call_id: "call_abc123",
       name: "search_knowledge",
       arguments: "{\"query\": \"voice assistant research\"}"
     }
   }
   Note: Filter on item.type === "function_call" (event fires for non-function outputs too)

2. Client executes function (calls Convex query/mutation/action)

3. Client returns result via data channel:
   → Send: conversation.item.create
   {
     type: "conversation.item.create",
     item: {
       type: "function_call_output",
       call_id: "call_abc123",
       output: JSON.stringify(result)
     }
   }

4. Client triggers response:
   → Send: response.create
   { type: "response.create" }
   WARNING: Without this, the model will NOT generate a follow-up response.

5. OpenAI speaks the result
```

## Async Function Calling (GA Model)

The `gpt-realtime` GA model supports async function calling:
- Model continues the conversation while function calls are pending
- If asked about a pending result, model says "I'm still waiting on that"
- Automatically enabled — no config needed
- **LIMITATION**: Cannot send `response.create` while a response is active (get `conversation_already_has_active_response` error)

## Common Error: `call_id` Mismatch

The `call_id` must come from `item.call_id` in the `response.output_item.done` event (format: `call_XXXX`), NOT from `item.id` (format: `item_XXXX`).

## Implementation Pattern

```javascript
dc.addEventListener("message", (e) => {
  const event = JSON.parse(e.data);

  if (event.type === "response.output_item.done") {
    const { item } = event;
    if (item.type === "function_call") {
      // Execute the function
      executeTool(item.name, JSON.parse(item.arguments)).then(output => {
        // Return result
        dc.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: item.call_id,  // MUST match
            output: JSON.stringify(output)
          }
        }));
        // Trigger response
        dc.send(JSON.stringify({ type: "response.create" }));
      });
    }
  }
});
```

## Tool Definitions

### Pure Reads (synchronous — return data immediately)

| Tool | Maps To (Convex) | Returns |
|------|-------------------|---------|
| `get_conversation_context` | `chatMessages.by_conversation` | Recent messages from paired chat session |
| `search_knowledge` | `documents.search` / holocron hybrid search | Array of document summaries |
| `list_recent_documents` | `documents.queries.list` | Recent documents with titles |
| `get_document` | `documents.queries.get` | Full document content |
| `get_conversations` | `conversations` query | Recent chat conversations |
| `get_research_sessions` | `researchSessions` queries | Research sessions + status |
| `get_improvements` | `improvements.queries.list` | Improvement requests + status |
| `check_agent_status` | Session/task status queries | Status of any async process |

### Agent Dispatchers (async — bridge holds open, polls Convex via useQuery)

| Tool | Maps To | Timeout | On Timeout |
|------|---------|---------|------------|
| `start_research` | `researchSessions.create` + agent | 60s | "Research is still running. Ask me to check later." |
| `submit_improvement` | `improvements.create` + agent | 30s | "Improvement submitted, still being analyzed." |
| `create_note` | `documents.mutations.create` | 5s | N/A (fast mutation) |
| `navigate_app` | Expo Router `router.push()` | 1s | N/A (client-side) |

### Tool Definition Format

```json
{
  "type": "function",
  "name": "search_knowledge",
  "description": "Search the user's knowledge base for documents and notes. Returns matching documents with titles and excerpts.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "The search query"
      }
    },
    "required": ["query"]
  }
}
```

## System Prompt for Function Calling

Include in session instructions:
```
Before calling any function tool, briefly announce what you're about to do
(e.g., "Let me search for that..."). Then call the tool.

When you call an agent dispatcher tool (start_research, submit_improvement),
it may take several seconds. The tool will return results when ready.
If it times out, tell the user and offer to check back with check_agent_status.
```
