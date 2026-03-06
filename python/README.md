# ConvexClient - Python Library

A Python client library for interacting with Convex backends. Provides a clean, type-safe API for queries, mutations, and actions.

## Features

- **Simple HTTP Client**: Low-level `ConvexClient` for direct query/mutation/action execution
- **High-Level API**: Typed `ConvexAPI` wrapper with methods organized by module
- **Type Safety**: Comprehensive type hints throughout
- **Error Handling**: Custom exception types for HTTP and Convex errors
- **Context Manager Support**: Use with `with` statement for automatic cleanup
- **Flexible Authentication**: Optional JWT token support

## Installation

```bash
cd python
pip install -e .
```

For development:

```bash
pip install -e ".[dev]"
```

## Quick Start

### Basic Usage with ConvexClient

```python
from convex_client import ConvexClient

# Initialize client
client = ConvexClient("https://your-deployment.convex.cloud")

# Execute a query
conversations = client.query("conversations/queries.list", {"limit": 10})

# Execute a mutation
conv_id = client.mutation(
    "conversations/mutations.create",
    {"title": "New Chat"}
)

# Execute an action
result = client.action("research/actions.start", {"query": "AI safety"})
```

### High-Level API Usage

```python
from convex_client import ConvexClient, ConvexAPI

# Initialize client and API wrapper
client = ConvexClient("https://your-deployment.convex.cloud")
api = ConvexAPI(client)

# Use typed methods
conversations = api.conversations.list(limit=10)
conv = api.conversations.get("j5x_...")
new_conv = api.conversations.create("My Chat")

# Send messages
api.chat_messages.send(
    conversation_id=conv_id,
    role="user",
    content="Hello!"
)

# Search documents
docs = api.documents.search("AI safety", limit=5)
```

### Context Manager

```python
from convex_client import ConvexClient

with ConvexClient("https://your-deployment.convex.cloud") as client:
    result = client.query("conversations/queries.count")
    print(f"Total conversations: {result}")
```

### Authentication

```python
from convex_client import ConvexClient

# With auth token
client = ConvexClient(
    "https://your-deployment.convex.cloud",
    auth_token="your-jwt-token"
)

# Or set/update token later
client.set_auth_token("new-token")
client.set_auth_token(None)  # Clear token
```

## API Reference

### ConvexClient

Low-level HTTP client for Convex operations.

#### Methods

- `query(function_path: str, args: Dict) -> Any`
  - Execute a read-only query

- `mutation(function_path: str, args: Dict) -> Any`
  - Execute a write operation

- `action(function_path: str, args: Dict) -> Any`
  - Execute an action with side effects

- `set_auth_token(token: Optional[str]) -> None`
  - Set or clear authentication token

- `close() -> None`
  - Close HTTP session (automatically called when using context manager)

### ConvexAPI

High-level API wrapper with typed methods.

#### Modules

- `api.conversations` - Conversation management
  - `list(limit=50)` - List conversations
  - `get(id)` - Get conversation by ID
  - `count()` - Count total conversations
  - `create(title, last_message_preview)` - Create conversation
  - `update(id, title)` - Update conversation title
  - `remove(id)` - Delete conversation
  - `touch(id, last_message_preview)` - Update timestamp

- `api.chat_messages` - Chat message operations
  - `list(conversation_id, limit)` - List messages
  - `send(conversation_id, role, content, ...)` - Send message

- `api.documents` - Document management
  - `list(limit)` - List documents
  - `get(id)` - Get document by ID
  - `search(query, limit)` - Search documents
  - `create(title, content, category, ...)` - Create document

- `api.research_sessions` - Research session operations
  - `list(status, limit)` - List sessions
  - `get(id)` - Get session by ID
  - `create(query, research_type, ...)` - Create session

- `api.tasks` - Task management
  - `list(status, limit)` - List tasks
  - `get(id)` - Get task by ID
  - `create(task_type, conversation_id, config)` - Create task

### Exceptions

- `ConvexError` - Base exception for all Convex errors
- `ConvexHTTPError` - HTTP-level errors (network, 4xx/5xx responses)
  - Attributes: `status_code`, `response_body`

## Examples

### Migration Script

```python
from convex_client import ConvexClient
import os

# Load environment
convex_url = os.getenv("EXPO_PUBLIC_CONVEX_URL")
client = ConvexClient(convex_url)

# Count existing data
conv_count = client.query("conversations/queries.count", {})
print(f"Found {conv_count} conversations")

# Create new conversation
conv_id = client.mutation(
    "conversations/mutations.create",
    {"title": "Migrated Chat"}
)
print(f"Created conversation: {conv_id}")

# Verify
conv = client.query("conversations/queries.get", {"id": conv_id})
print(f"Title: {conv['title']}")
```

### Batch Operations

```python
from convex_client import ConvexClient, ConvexAPI

client = ConvexClient("https://your-deployment.convex.cloud")
api = ConvexAPI(client)

# Fetch all conversations
all_conversations = api.conversations.list(limit=100)

# Update titles
for conv in all_conversations:
    if "Old" in conv["title"]:
        api.conversations.update(
            conv["_id"],
            conv["title"].replace("Old", "New")
        )
```

### Error Handling

```python
from convex_client import ConvexClient, ConvexHTTPError, ConvexError

client = ConvexClient("https://your-deployment.convex.cloud")

try:
    result = client.query("conversations/queries.list", {"limit": 10})
except ConvexHTTPError as e:
    print(f"HTTP Error {e.status_code}: {e}")
except ConvexError as e:
    print(f"Convex Error: {e}")
```

## Development

### Running Tests

```bash
cd python
pytest
```

With coverage:

```bash
pytest --cov=convex_client --cov-report=html
```

### Code Formatting

```bash
# Format code
black convex_client/ tests/

# Lint
ruff check convex_client/ tests/

# Type check
mypy convex_client/
```

## Architecture

The library follows these design patterns:

1. **Separation of Concerns**
   - `client.py` - Low-level HTTP operations
   - `api.py` - High-level typed wrappers
   - `__init__.py` - Public API exports

2. **Type Safety**
   - All functions have type hints
   - Returns are properly typed
   - Optional parameters clearly marked

3. **Error Handling**
   - Custom exception hierarchy
   - Preserves error context (status codes, response bodies)
   - Clear error messages

4. **Resource Management**
   - Context manager support
   - Session pooling via `requests.Session`
   - Explicit cleanup methods

## Comparison with TypeScript ConvexHttpClient

This library mirrors the TypeScript `ConvexHttpClient` API:

| TypeScript | Python |
|------------|--------|
| `new ConvexHttpClient(url)` | `ConvexClient(url)` |
| `client.query(api.module.function, args)` | `client.query("module/function", args)` |
| `client.mutation(...)` | `client.mutation(...)` |
| `client.action(...)` | `client.action(...)` |

Key differences:
- Python uses string paths instead of generated API objects
- Python provides both low-level and high-level APIs
- Python includes context manager support

## Command-Line Tools

### holocron-save.py

A command-line script for saving documents to the Holocron knowledge database.

Location: `scripts/holocron-save.py`

#### Usage

```bash
# Save from file
python scripts/holocron-save.py --title "My Notes" --category notes --file notes.md

# Save from stdin
echo "Hello World" | python scripts/holocron-save.py --title "Hello" --category test

# Save with explicit file type
python scripts/holocron-save.py --title "Script" --category code --file script.sh --type shell

# Use custom Convex URL
python scripts/holocron-save.py --title "Doc" --category test --file doc.txt --url https://custom.convex.cloud
```

#### Options

- `--title, -t` - Document title (required)
- `--category, -c` - Document category (required)
- `--file, -f` - Path to file to save (optional, reads from stdin if not provided)
- `--type` - File type (optional, auto-detected from extension)
- `--url` - Convex deployment URL (optional, defaults to EXPO_PUBLIC_CONVEX_URL env var)

#### Supported File Types

The script auto-detects file types from extensions:
- `.md` → markdown
- `.txt` → text
- `.py` → python
- `.js` → javascript
- `.ts` → typescript
- `.json` → json
- `.yaml`, `.yml` → yaml
- `.html` → html
- `.css` → css
- `.sh` → shell

#### Exit Codes

- `0` - Success (document ID printed to stdout)
- `1` - Error (error message printed to stderr)

#### Examples

Save research notes:
```bash
python scripts/holocron-save.py \
  --title "AI Safety Research" \
  --category research \
  --file research-notes.md
```

Pipe content from another command:
```bash
curl https://example.com/article.txt | \
  python scripts/holocron-save.py \
  --title "Article from Example" \
  --category article
```

Use in a script:
```bash
#!/bin/bash
DOC_ID=$(python scripts/holocron-save.py \
  --title "Build Log" \
  --category logs \
  --file build.log)
echo "Saved as document ID: $DOC_ID"
```

## License

MIT
