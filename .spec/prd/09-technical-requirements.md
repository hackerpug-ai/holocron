# Technical Requirements: Holocron Mobile Research Interface

## System Components

| Component | Type | Description |
|-----------|------|-------------|
| Mobile Client | React Native (Expo) | User-facing mobile application |
| Supabase Edge Functions | Deno TypeScript | Server-side research orchestration |
| PostgreSQL Database | Supabase Postgres | Document storage, session state, embeddings |
| Agent Runtime | Claude SDK or LangChain | LLM orchestration for research workflows |
| External Search APIs | REST | Exa, Jina, OpenAI APIs for research |
| Realtime Updates | Supabase Realtime | Progress streaming to mobile client |

---

## Data Schema

### Existing Entities

#### documents (existing)
```sql
CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category document_category NOT NULL,
  file_path TEXT,
  file_type TEXT DEFAULT 'md',
  status TEXT DEFAULT 'complete',
  date TEXT,
  time TEXT,
  research_type TEXT,
  iterations INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  embedding VECTOR(1536)
);

-- Valid categories
CREATE TYPE document_category AS ENUM (
  'architecture', 'business', 'competitors', 'frameworks',
  'infrastructure', 'libraries', 'patterns', 'platforms',
  'security', 'research'
);
```

### New Entities

#### research_sessions
```sql
CREATE TABLE research_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  research_type research_type NOT NULL,
  input_type input_type NOT NULL,
  status session_status DEFAULT 'pending',
  max_iterations INTEGER DEFAULT 5,
  current_iteration INTEGER DEFAULT 0,
  coverage_score INTEGER,  -- 1-5 for deep research
  plan JSONB,              -- Research plan object
  findings JSONB,          -- Accumulated findings
  document_id INTEGER REFERENCES documents(id),
  error_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TYPE research_type AS ENUM (
  'factual_question', 'entity_research', 'academic_research',
  'url_analysis', 'topic_research', 'youtube_channel', 'site_crawl'
);

CREATE TYPE input_type AS ENUM (
  'basic', 'deep'
);

CREATE TYPE session_status AS ENUM (
  'pending', 'searching', 'analyzing', 'synthesizing',
  'saving', 'completed', 'failed', 'cancelled'
);

-- Index for querying active sessions
CREATE INDEX idx_research_sessions_status ON research_sessions(status);
CREATE INDEX idx_research_sessions_created ON research_sessions(created_at DESC);
```

#### research_iterations (for deep research)
```sql
CREATE TABLE research_iterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES research_sessions(id) ON DELETE CASCADE,
  iteration_number INTEGER NOT NULL,
  findings_summary TEXT,
  sources JSONB,           -- Array of {url, title, domain}
  review_score INTEGER,    -- 1-5 coverage quality
  review_feedback TEXT,
  review_gaps JSONB,       -- Array of gap strings
  refined_queries JSONB,   -- Queries for next iteration
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, iteration_number)
);

CREATE INDEX idx_iterations_session ON research_iterations(session_id);
```

#### citations
```sql
CREATE TABLE citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES research_sessions(id) ON DELETE CASCADE,
  document_id INTEGER REFERENCES documents(id),
  source_url TEXT NOT NULL,
  source_title TEXT,
  source_domain TEXT,
  claim_text TEXT NOT NULL,
  claim_marker TEXT,       -- [1], [2], etc.
  retrieved_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_citations_session ON citations(session_id);
CREATE INDEX idx_citations_document ON citations(document_id);
```

---

## API Design

### Existing Endpoints (RPC Functions)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `rpc/hybrid_search` | Keyword + semantic search |
| POST | `rpc/search_fts` | Full-text search only |
| POST | `rpc/search_vector` | Semantic similarity search |

### New Edge Functions

#### Research Management

| Method | Endpoint | Description | Request | Response |
|--------|----------|-------------|---------|----------|
| POST | `/functions/v1/research-start` | Initiate basic research | `{query, research_type}` | `{session_id, status}` |
| POST | `/functions/v1/deep-research-start` | Initiate deep research | `{query, input_type, max_iterations}` | `{session_id, status}` |
| GET | `/functions/v1/research-status` | Get session status | `?session_id=uuid` | `{session, iterations?}` |
| POST | `/functions/v1/research-cancel` | Cancel active research | `{session_id}` | `{success}` |
| POST | `/functions/v1/research-resume` | Resume deep research | `{session_id}` | `{session_id, status}` |
| GET | `/functions/v1/research-history` | List past sessions | `?limit=20&offset=0&status=` | `{sessions[]}` |

#### Research Execution (Internal)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/functions/v1/research-execute` | Execute research workflow (called by start) |
| POST | `/functions/v1/research-iterate` | Execute single deep research iteration |
| POST | `/functions/v1/research-synthesize` | Generate final report from findings |

### Request/Response Schemas

#### POST /functions/v1/research-start
```typescript
// Request
interface ResearchStartRequest {
  query: string
  research_type: 'factual_question' | 'entity_research' | 'academic_research' | 'url_analysis'
}

// Response
interface ResearchStartResponse {
  session_id: string
  status: 'pending' | 'searching'
  estimated_duration_seconds: number
}
```

#### POST /functions/v1/deep-research-start
```typescript
// Request
interface DeepResearchStartRequest {
  query: string
  input_type: 'topic_research' | 'youtube_channel' | 'site_crawl' | 'academic_research'
  max_iterations?: number  // default: 5
}

// Response
interface DeepResearchStartResponse {
  session_id: string
  status: 'pending'
  max_iterations: number
}
```

#### GET /functions/v1/research-status
```typescript
// Response
interface ResearchStatusResponse {
  session: {
    id: string
    query: string
    research_type: string
    status: SessionStatus
    current_iteration: number
    max_iterations: number
    coverage_score: number | null
    created_at: string
    updated_at: string
    completed_at: string | null
    error_text: string | null
  }
  iterations?: Array<{
    iteration_number: number
    review_score: number
    review_feedback: string
    review_gaps: string[]
    created_at: string
  }>
  result?: {
    document_id: number
    summary: string
    confidence_score: number
    sources_count: number
  }
}
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           HOLOCRON MOBILE ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐                                                     │
│  │   Mobile Client     │                                                     │
│  │   (React Native)    │                                                     │
│  │                     │                                                     │
│  │  ┌───────────────┐  │                                                     │
│  │  │ Search Screen │  │                                                     │
│  │  │ Research UI   │  │                                                     │
│  │  │ Article View  │  │                                                     │
│  │  └───────────────┘  │                                                     │
│  └─────────┬───────────┘                                                     │
│            │ HTTPS + Service Key                                             │
│            ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    SUPABASE PLATFORM                                 │    │
│  │                                                                      │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │                   EDGE FUNCTIONS (Deno)                      │    │    │
│  │  │                                                              │    │    │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │    │    │
│  │  │  │ research-    │  │ deep-        │  │ research-        │   │    │    │
│  │  │  │ start        │  │ research-    │  │ status           │   │    │    │
│  │  │  │              │  │ start        │  │                  │   │    │    │
│  │  │  └──────┬───────┘  └──────┬───────┘  └──────────────────┘   │    │    │
│  │  │         │                 │                                  │    │    │
│  │  │         ▼                 ▼                                  │    │    │
│  │  │  ┌─────────────────────────────────────────────────────┐    │    │    │
│  │  │  │              AGENT RUNTIME                          │    │    │    │
│  │  │  │         (Claude SDK or LangChain)                   │    │    │    │
│  │  │  │                                                     │    │    │    │
│  │  │  │  ┌───────────┐  ┌───────────┐  ┌───────────────┐   │    │    │    │
│  │  │  │  │ Research  │  │ Deep      │  │ Synthesis     │   │    │    │    │
│  │  │  │  │ Workflow  │  │ Research  │  │ Workflow      │   │    │    │    │
│  │  │  │  │           │  │ Ralph Loop│  │               │   │    │    │    │
│  │  │  │  └─────┬─────┘  └─────┬─────┘  └───────────────┘   │    │    │    │
│  │  │  │        │              │                             │    │    │    │
│  │  │  └────────┼──────────────┼─────────────────────────────┘    │    │    │
│  │  │           │              │                                   │    │    │
│  │  └───────────┼──────────────┼───────────────────────────────────┘    │    │
│  │              │              │                                        │    │
│  │              ▼              ▼                                        │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │                   POSTGRESQL DATABASE                        │    │    │
│  │  │                                                              │    │    │
│  │  │  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐   │    │    │
│  │  │  │ documents    │  │ research_sessions │  │ citations    │   │    │    │
│  │  │  │ (+ vectors)  │  │ research_         │  │              │   │    │    │
│  │  │  │              │  │ iterations        │  │              │   │    │    │
│  │  │  └──────────────┘  └──────────────────┘  └──────────────┘   │    │    │
│  │  │                                                              │    │    │
│  │  │  ┌──────────────────────────────────────────────────────┐   │    │    │
│  │  │  │ RPC Functions: hybrid_search, search_fts,             │   │    │    │
│  │  │  │                search_vector, generate_embedding      │   │    │    │
│  │  │  └──────────────────────────────────────────────────────┘   │    │    │
│  │  │                                                              │    │    │
│  │  └──────────────────────────────────────────────────────────────┘    │    │
│  │                                                                      │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │                   SUPABASE REALTIME                          │    │    │
│  │  │                                                              │    │    │
│  │  │  research_sessions table changes → Mobile Client             │    │    │
│  │  │                                                              │    │    │
│  │  └──────────────────────────────────────────────────────────────┘    │    │
│  │                                                                      │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    EXTERNAL APIs                                     │    │
│  │                                                                      │    │
│  │  {Exa API}  ───────►  Web search, company research, code search     │    │
│  │                                                                      │    │
│  │  {Jina API} ───────►  Academic search, URL reading, deduplication   │    │
│  │                                                                      │    │
│  │  {OpenAI}   ───────►  Embeddings (text-embedding-3-small)           │    │
│  │                                                                      │    │
│  │  {Anthropic}───────►  Claude API for agent reasoning                │    │
│  │                                                                      │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## External Dependencies

### Search & Content APIs

| Dependency | Purpose | Documentation |
|------------|---------|---------------|
| Exa API | Web search, company research, code context | https://docs.exa.ai/ |
| Jina API | Academic search (arXiv, SSRN), URL reading, deduplication | https://jina.ai/reader |
| OpenAI API | Embedding generation (text-embedding-3-small) | https://platform.openai.com/docs/api-reference/embeddings |

### Agent Framework (Choose One)

| Dependency | Purpose | Documentation |
|------------|---------|---------------|
| Claude Agent SDK | LLM orchestration, tool calling, agentic workflows | https://platform.claude.com/docs/en/agent-sdk/overview |
| LangChain.js | Alternative: Multi-step chains, state management | https://js.langchain.com/docs/ |

### Infrastructure

| Dependency | Purpose | Documentation |
|------------|---------|---------------|
| Supabase | Database, Edge Functions, Realtime | https://supabase.com/docs |

---

## UI Infrastructure

### Design Libraries

| Library | Purpose | Version |
|---------|---------|---------|
| React Native Reusables | shadcn/ui port for React Native | CLI-installed |
| @rn-primitives/* | Headless UI primitives (Radix-style) | ^1.1.* |
| NativeWind | TailwindCSS for React Native | ^4.2.2 |
| Lucide React Native | Icon library | ^0.575.0 |

### Semantic Tokens (from tailwind.config.js)

```javascript
colors: {
  background: 'hsl(var(--background))',
  foreground: 'hsl(var(--foreground))',
  primary: { DEFAULT, foreground },
  secondary: { DEFAULT, foreground },
  destructive: { DEFAULT, foreground },
  muted: { DEFAULT, foreground },
  accent: { DEFAULT, foreground },
  card: { DEFAULT, foreground },
  popover: { DEFAULT, foreground },
  border: 'hsl(var(--border))',
  input: 'hsl(var(--input))',
  ring: 'hsl(var(--ring))',
}
```

### Component Reuse Analysis

| Component | Status | Notes |
|-----------|--------|-------|
| Text | Installed | `@/components/ui/text` with TextClassContext |
| Button | Installed | `@/components/ui/button` with variants |
| Card | Installed | `@/components/ui/card` for research results |
| Input | Installed | `@/components/ui/input` for search/query |
| Badge | Installed | `@/components/ui/badge` for status indicators |
| Progress | Installed | `@/components/ui/progress` for research progress |
| Skeleton | Installed | `@/components/ui/skeleton` for loading states |
| Dialog | Installed | `@/components/ui/dialog` for overlays |
| Tabs | Installed | `@/components/ui/tabs` (RN Reusables) + Expo Router tabs |
| Select | Installed | `@/components/ui/select` for category picker |
| Alert | Installed | `@/components/ui/alert` for feedback messages |
| AlertDialog | Installed | `@/components/ui/alert-dialog` for confirmations |

---

## Agent Framework Comparison

### Claude Agent SDK

**Pros:**
- Native Anthropic integration
- Official, maintained SDK
- Simpler tool calling pattern
- Built-in conversation management
- TypeScript support

**Cons:**
- Newer, less community examples
- Claude-only (no multi-model)
- Limited state management primitives

**Code Pattern:**
```typescript
import { Agent } from '@anthropic-ai/agent-sdk'

const researchAgent = new Agent({
  model: 'claude-sonnet-4-20250514',
  tools: [searchTool, analyzeTool, saveTool],
  system: 'You are a research assistant...'
})

const result = await researchAgent.run({
  messages: [{ role: 'user', content: query }]
})
```

### LangChain/LangGraph

**Pros:**
- Mature ecosystem (2+ years)
- Multi-model support
- Rich state management (LangGraph)
- Extensive tool integrations
- Large community

**Cons:**
- More complex setup
- Abstraction overhead
- Heavier bundle size

**Code Pattern:**
```typescript
import { ChatAnthropic } from '@langchain/anthropic'
import { StateGraph } from '@langchain/langgraph'

const workflow = new StateGraph()
  .addNode('search', searchNode)
  .addNode('analyze', analyzeNode)
  .addNode('synthesize', synthesizeNode)
  .addEdge('search', 'analyze')
  .addConditionalEdges('analyze', routeNext)
```

### Recommendation

**Start with Claude Agent SDK** for these reasons:
1. Simpler architecture matches our use case
2. Native Claude integration (we're already using Claude)
3. Less code to maintain
4. Edge Function bundle size constraints favor lighter SDK

**Fall back to LangChain if:**
- Complex state management needed beyond Ralph Loop
- Multi-model orchestration required
- Need for advanced memory/persistence patterns

---

## Security Considerations

### Authentication
- Service role key for all requests (dev mode only)
- Key stored in environment variables
- NOT suitable for production/public release

### API Key Management
```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
EXA_API_KEY (Edge Function secret)
JINA_API_KEY (Edge Function secret)
OPENAI_API_KEY (Edge Function secret)
ANTHROPIC_API_KEY (Edge Function secret)
```

### Data Privacy
- All data stored in user's Supabase instance
- External APIs receive only query text, not full documents
- Embeddings generated via OpenAI (text sent to OpenAI)
- No analytics or telemetry

---

## Performance Requirements

| Metric | Target | Notes |
|--------|--------|-------|
| Search latency | < 500ms | Hybrid search response time |
| Basic research | < 2 min | Single-pass research completion |
| Deep research iteration | < 5 min | Per-iteration execution |
| Progress update frequency | 5 sec | Polling interval for status |
| Article list load | < 1 sec | Initial category browse |
| Infinite scroll load | < 500ms | Next page fetch |

---

## Error Handling

### Client-Side
- Network errors: Show retry option
- Session not found: Show "research expired" message
- Research failed: Display error_text from session
- Save failed: Show retry with local backup option

### Server-Side (Edge Functions)
- API rate limits: Exponential backoff (3 attempts)
- External API failures: Mark session as failed with error
- Timeout: 5 min max per Edge Function invocation
- State recovery: Resume from last checkpoint (deep research)

---

## Migration Path

### Phase 1: Knowledge Base (KB use cases)
1. Implement search UI using existing RPC functions
2. Build article browse and view screens
3. Add category filtering

### Phase 2: Basic Research (RS use cases)
1. Create research-start Edge Function
2. Implement agent runtime (Claude SDK)
3. Build research UI with progress tracking
4. Add history and results view

### Phase 3: Deep Research (DR use cases)
1. Create deep-research Edge Functions
2. Implement Ralph Loop iteration logic
3. Add session resume capability
4. Build iteration history UI

### Phase 4: Article Management (AM use cases)
1. Add edit article screen
2. Implement delete with confirmation
3. Add category change picker
