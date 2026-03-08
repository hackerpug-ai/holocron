# Holocron General MCP Server

MCP server exposing general Holocron document operations (search, storage, retrieval) as tools for Claude Code skills.

## Features

- **Instant Operations**: No polling, immediate responses
- **Hybrid Search**: Vector + FTS combined search (50/50 weighted)
- **Full-Text Search**: Fast keyword-based search
- **Vector Search**: Semantic similarity search
- **Document Storage**: Create and update documents
- **Global Installation**: Install once, use across all projects

## Installation

### 1. Install Package

```bash
cd holocron-general-mcp
pnpm install

# Install globally (no build needed - uses tsx)
npm install -g .
```

### 2. Configure Credentials

Create `~/.config/holocron-general-mcp/.env`:

```bash
mkdir -p ~/.config/holocron-general-mcp
cat > ~/.config/holocron-general-mcp/.env << 'EOF'
# Convex deployment
CONVEX_URL=https://[your-deployment].convex.cloud

# OpenAI API key (for embeddings in hybrid/vector search)
OPENAI_API_KEY=sk-xxx
EOF
```

### 3. Add to Claude Code MCP Config

Edit `~/.config/claude/mcp.json`:

```json
{
  "mcpServers": {
    "holocron-general": {
      "command": "holocron-general-mcp"
    },
    "holocron-research": {
      "command": "holocron-mcp"
    }
  }
}
```

### 4. Verify Installation

```bash
# Check MCP server is available
claude mcp list

# Should show:
# - holocron-general (7 tools)
# - holocron-research (3 tools)
```

## MCP Tools

### Search Tools

#### `hybrid_search`

Search using combined vector + full-text search (50/50 weighted).

**Input**:
```typescript
{
  query: string,                          // Required: Search query
  limit?: number,                         // Optional: Default 10
  category?: string                       // Optional: Filter by category
}
```

**Output**:
```typescript
{
  results: Array<{
    _id: string,
    title: string,
    content: string,
    category: string,
    score: number,                        // Relevance score (0-1)
    // ... other document fields
  }>
}
```

**Example**:
```typescript
const results = await callMcpTool("holocron-general", "hybrid_search", {
  query: "React performance optimization",
  limit: 5
});
```

#### `search_fts`

Full-text keyword search (no embeddings needed).

**Input**: Same as `hybrid_search`

**Output**: Same as `hybrid_search`

**Example**:
```typescript
const results = await callMcpTool("holocron-general", "search_fts", {
  query: "TypeScript MCP servers",
  category: "research"
});
```

#### `search_vector`

Semantic vector search using embeddings.

**Input**: Same as `hybrid_search`

**Output**: Same as `hybrid_search`

**Example**:
```typescript
const results = await callMcpTool("holocron-general", "search_vector", {
  query: "best practices for state management",
  limit: 10
});
```

### Retrieval Tools

#### `get_document`

Get a single document by ID.

**Input**:
```typescript
{
  id: string                              // Required: Document ID
}
```

**Output**:
```typescript
Document | null
```

**Example**:
```typescript
const doc = await callMcpTool("holocron-general", "get_document", {
  id: "k17abc123..."
});
```

#### `list_documents`

List documents with optional filtering.

**Input**:
```typescript
{
  category?: string,                      // Optional: Filter by category
  limit?: number                          // Optional: Default 100, max 1000
}
```

**Output**:
```typescript
{
  documents: Array<Document>
}
```

**Example**:
```typescript
const { documents } = await callMcpTool("holocron-general", "list_documents", {
  category: "assimilation",
  limit: 50
});
```

### Storage Tools

#### `store_document`

Create a new document.

**Input**:
```typescript
{
  title: string,                          // Required
  content: string,                        // Required
  category: string,                       // Required
  filePath?: string,
  fileType?: string,
  status?: string,
  date?: string,                          // ISO date string
  time?: string,
  researchType?: string,
  iterations?: number,
  embedding?: number[]                    // 1536 dimensions
}
```

**Output**:
```typescript
{
  documentId: string
}
```

**Example**:
```typescript
const { documentId } = await callMcpTool("holocron-general", "store_document", {
  title: "Repository Analysis: my-repo",
  content: reportMarkdown,
  category: "assimilation",
  date: new Date().toISOString(),
  researchType: "code-analysis"
});
```

#### `update_document`

Update an existing document.

**Input**:
```typescript
{
  id: string,                             // Required
  // All other fields optional - only provided fields are updated
  title?: string,
  content?: string,
  category?: string,
  // ... other fields
}
```

**Output**:
```typescript
Document | null
```

**Example**:
```typescript
const updated = await callMcpTool("holocron-general", "update_document", {
  id: "k17abc123...",
  status: "published",
  iterations: 5
});
```

## Tool Comparison

| Tool | Use Case | Requires Embedding | Speed |
|------|----------|-------------------|-------|
| `hybrid_search` | General search, best results | Yes | Medium |
| `search_fts` | Keyword search, fast | No | Fast |
| `search_vector` | Semantic similarity | Yes | Medium |
| `get_document` | Get by ID | No | Instant |
| `list_documents` | Browse, list all | No | Fast |
| `store_document` | Create new | No | Instant |
| `update_document` | Update existing | No | Instant |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONVEX_URL` | (required) | Convex deployment URL |
| `OPENAI_API_KEY` | (required) | OpenAI API key for embeddings |

### Embedding Generation

- **Model**: `text-embedding-3-small`
- **Dimensions**: 1536
- **Cost**: ~$0.00002 per 1K tokens
- **Used by**: `hybrid_search`, `search_vector`

## Development

### Run Locally (no build needed)

```bash
pnpm start
# or with watch mode
pnpm dev
```

### Type Check

```bash
pnpm type-check
```

### Build (optional - not needed for tsx execution)

```bash
pnpm build
```

## Architecture

### Technology Stack

- **Framework**: TypeScript MCP SDK (vanilla MCP protocol)
- **Client**: Convex TypeScript SDK
- **Runtime**: Node.js with native TypeScript (tsx/tsc)
- **Distribution**: NPM global package

### Project Structure

```
holocron-general-mcp/
├── src/
│   ├── index.ts                      # MCP server entry point
│   ├── tools/
│   │   ├── search.ts                 # hybrid_search, search_fts, search_vector
│   │   ├── retrieval.ts              # get_document, list_documents
│   │   └── storage.ts                # store_document, update_document
│   ├── convex/
│   │   ├── client.ts                 # Convex client initialization
│   │   └── types.ts                  # Type imports from holocron
│   └── config/
│       ├── env.ts                    # Environment variable loading
│       └── validation.ts             # Credential validation
├── package.json
├── tsconfig.json
└── README.md
```

### Convex Backend Integration

This MCP server wraps the following Convex functions from `holocron`:

**Queries**:
- `documents/queries:get` → `get_document`
- `documents/queries:list` → `list_documents`
- `documents/queries:fullTextSearch` → `search_fts`
- `documents/queries:vectorSearch` → `search_vector`

**Actions**:
- `documents/search:hybridSearch` → `hybrid_search`

**Mutations**:
- `documents/mutations:create` → `store_document`
- `documents/mutations:update` → `update_document`

## Troubleshooting

### Server Won't Start

```bash
# Check credentials
cat ~/.config/holocron-general-mcp/.env

# Verify Convex URL format
# Should be: https://[deployment].convex.cloud

# Check API keys
# OpenAI: starts with sk-
```

### Embedding Generation Fails

```bash
# Verify OpenAI API key
echo $OPENAI_API_KEY

# Check API key has credits
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### MCP Server Not Found

```bash
# Verify global installation
which holocron-general-mcp

# Reinstall if needed
cd holocron-general-mcp
npm install -g .

# Check Claude Code MCP config
cat ~/.config/claude/mcp.json
```

## Comparison with holocron-research

| Feature | holocron-general | holocron-research |
|---------|------------------|-------------------|
| Purpose | General document operations | Deep research workflows |
| Response | Instant (no polling) | Polling (2-5 min) |
| Tools | 7 (search, storage, retrieval) | 3 (research, session, search research) |
| Use Case | Skills needing document access | Skills needing deep research |
| API Keys | Convex + OpenAI | Convex + OpenAI + Exa + Jina |

## License

MIT
