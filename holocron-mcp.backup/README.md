# Holocron MCP Research Server

MCP server exposing Holocron's deep research functionality as synchronous tools for Claude Code skills.

## Features

- **Synchronous Research**: Start research and wait for completion (2-5 minutes typical)
- **Confidence Scoring**: 5-factor weighted confidence algorithm (source credibility, evidence quality, corroboration, recency, expert consensus)
- **Hybrid Search**: Search past research using vector similarity + keyword matching
- **Global Installation**: Install once, use across all projects

## Installation

### 1. Install Package

```bash
cd holocron-mcp
pnpm install

# Install globally (no build needed - uses tsx)
npm install -g .
```

### 2. Configure Credentials

Create `~/.config/holocron-mcp/.env`:

```bash
mkdir -p ~/.config/holocron-mcp
cat > ~/.config/holocron-mcp/.env << 'EOF'
# Convex deployment
CONVEX_URL=https://[your-deployment].convex.cloud

# API keys (passed to Convex actions for research)
OPENAI_API_KEY=sk-xxx
EXA_API_KEY=exa_xxx
JINA_API_KEY=jina_xxx

# Optional: Server configuration
HOLOCRON_MCP_POLL_INTERVAL=2000
HOLOCRON_MCP_TIMEOUT=300000
EOF
```

### 3. Add to Claude Code MCP Config

Edit `~/.config/claude/mcp.json`:

```json
{
  "mcpServers": {
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
# - holocron-research (3 tools)
```

## MCP Tools

### `research_topic`

Start deep research and wait synchronously for completion.

**Input**:
```typescript
{
  topic: string,                          // Required: Research topic/question
  maxIterations?: number,                 // Optional: Default 5
  confidenceFilter?: "HIGH_ONLY" | "HIGH_MEDIUM" | "ALL"  // Optional: Default "ALL"
}
```

**Output**:
```typescript
{
  sessionId: string,
  topic: string,
  status: "completed" | "error",
  iterations: number,
  coverageScore: number,                  // 1-5 scale
  confidenceStats: {
    highConfidenceCount: number,
    mediumConfidenceCount: number,
    lowConfidenceCount: number,
    averageConfidenceScore: number,       // 0-100
    claimsWithMultipleSources: number,
    totalClaims: number
  },
  findings: Array<{
    claimText: string,
    confidenceLevel: "HIGH" | "MEDIUM" | "LOW",
    confidenceScore: number,
    citations: Array<{url: string, title: string}>,
    caveats: string[],
    warnings: string[]
  }>
}
```

**Example Usage in Brain Skill**:
```typescript
// Load MCP tool
await useToolSearch("select:holocron-research__research_topic");

// Call tool synchronously
const result = await callMcpTool("holocron-research", "research_topic", {
  topic: "TypeScript MCP servers best practices",
  maxIterations: 5,
  confidenceFilter: "HIGH_MEDIUM"
});

// Result contains findings with confidence scores
```

### `get_research_session`

Retrieve existing research session by ID.

**Input**:
```typescript
{
  sessionId: string                       // Required: Session ID
}
```

**Output**: Same structure as `research_topic` output

**Example Usage**:
```typescript
const session = await callMcpTool("holocron-research", "get_research_session", {
  sessionId: "k17abc123..."
});
```

### `search_research`

Search across all past research findings with hybrid search.

**Input**:
```typescript
{
  query: string,                          // Required: Search query
  limit?: number,                         // Optional: Default 10
  confidenceFilter?: "HIGH_ONLY" | "HIGH_MEDIUM" | "ALL"
}
```

**Output**:
```typescript
{
  results: Array<{
    sessionId: string,
    topic: string,
    findings: string,                     // Iteration findings text
    score: number,                        // Relevance score (0-1)
    iterationNumber: number
  }>
}
```

**Example Usage**:
```typescript
const results = await callMcpTool("holocron-research", "search_research", {
  query: "React performance optimization",
  limit: 5
});
```

## Confidence Levels

### HIGH (75-100)
- 3+ independent sources
- Credible primary/secondary evidence
- Strong corroboration
- Recent information
- Expert consensus

### MEDIUM (50-74)
- 2+ sources
- Moderate evidence quality
- Partial corroboration
- Somewhat recent

### LOW (0-49)
- Single source
- Weak evidence
- No corroboration
- Outdated or speculative

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONVEX_URL` | (required) | Convex deployment URL |
| `OPENAI_API_KEY` | (required) | OpenAI API key for embeddings |
| `EXA_API_KEY` | (required) | Exa API key for web search |
| `JINA_API_KEY` | (required) | Jina API key for content extraction |
| `HOLOCRON_MCP_POLL_INTERVAL` | 2000 | Poll interval in ms (1000-10000) |
| `HOLOCRON_MCP_TIMEOUT` | 300000 | Timeout in ms (max 600000) |

### Polling Strategy

- **Interval**: 2 seconds (default)
- **Timeout**: 5 minutes (default)
- **Retry**: 3 attempts with exponential backoff (1s, 2s, 4s)
- **Terminal States**: `completed`, `error`, `cancelled`

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

### Test

```bash
pnpm test
```

## Architecture

### Technology Stack

- **Framework**: TypeScript FastMCP (decorator-based APIs)
- **Client**: Convex TypeScript SDK
- **Runtime**: Node.js with native TypeScript (tsx/tsc)
- **Distribution**: NPM global package

### Project Structure

```
holocron-mcp/
├── src/
│   ├── index.ts                      # FastMCP server entry point
│   ├── tools/
│   │   ├── research.ts               # research_topic tool
│   │   ├── session.ts                # get_research_session tool
│   │   └── search.ts                 # search_research tool
│   ├── convex/
│   │   ├── client.ts                 # Convex client initialization
│   │   └── types.ts                  # Type imports from holocron
│   ├── polling/
│   │   └── strategies.ts             # Polling logic + progress streaming
│   └── config/
│       ├── env.ts                    # Environment variable loading
│       └── validation.ts             # Credential validation
├── package.json
├── tsconfig.json
└── README.md
```

## Troubleshooting

### Server Won't Start

```bash
# Check credentials
cat ~/.config/holocron-mcp/.env

# Verify Convex URL format
# Should be: https://[deployment].convex.cloud

# Check API keys
# OpenAI: starts with sk-
# Exa: starts with exa_
# Jina: starts with jina_
```

### Research Times Out

```bash
# Increase timeout (in ~/.config/holocron-mcp/.env)
HOLOCRON_MCP_TIMEOUT=600000  # 10 minutes

# Or reduce iterations
# In tool call:
{ topic: "...", maxIterations: 3 }
```

### MCP Server Not Found

```bash
# Verify global installation
which holocron-mcp

# Reinstall if needed
cd holocron-mcp
npm install -g .

# Check Claude Code MCP config
cat ~/.config/claude/mcp.json
```

## License

MIT
