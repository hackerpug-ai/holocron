# Technical Requirements: Holocron Mobile Research Interface

## System Components

| Component | Type | Description |
|-----------|------|-------------|
| Mobile Client | React Native (Expo) | Chat-centric UI with message thread, slash commands, result cards |
| Chat API | Supabase Edge Function | Message routing, slash command parsing, agent orchestration |
| Supabase Edge Functions | Deno TypeScript | Server-side research orchestration |
| PostgreSQL Database | Supabase Postgres | Document storage, chat history, session state, embeddings |
| Agent Runtime | Claude SDK or LangChain | LLM orchestration for research workflows and chat responses |
| External Search APIs | REST | Exa, Jina, OpenAI APIs for research |
| Realtime Updates | Supabase Realtime | Progress streaming and chat message delivery |

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

#### conversations
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'New Chat',
  last_message_preview TEXT,             -- Snippet of last message for drawer list
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for drawer list (most recent first)
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
```

#### chat_messages
```sql
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role message_role NOT NULL,           -- 'user' | 'agent' | 'system'
  content TEXT NOT NULL,                -- Message text (markdown)
  message_type message_type NOT NULL,   -- 'text' | 'slash_command' | 'result_card' | 'progress' | 'error'
  card_data JSONB,                      -- Card payload (for result_card type)
  session_id UUID REFERENCES research_sessions(id),  -- Link to research session if applicable
  document_id INTEGER REFERENCES documents(id),       -- Link to article if applicable
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE message_role AS ENUM ('user', 'agent', 'system');
CREATE TYPE message_type AS ENUM ('text', 'slash_command', 'result_card', 'progress', 'error');

-- Index for loading chat history within a conversation (newest first, paginated)
CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id, created_at DESC);
```

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

#### Conversation Management

| Method | Endpoint | Description | Request | Response |
|--------|----------|-------------|---------|----------|
| GET | `/functions/v1/conversations` | List all conversations for drawer | `?limit=50` | `{conversations[]}` |
| POST | `/functions/v1/conversations` | Create a new conversation | `{title?}` | `{conversation}` |
| PATCH | `/functions/v1/conversations` | Rename a conversation | `{id, title}` | `{conversation}` |
| DELETE | `/functions/v1/conversations` | Delete a conversation and all messages | `{id}` | `{success}` |

#### Chat & Command Routing

| Method | Endpoint | Description | Request | Response |
|--------|----------|-------------|---------|----------|
| POST | `/functions/v1/chat-send` | Send a message to the agent | `{conversation_id, content, message_type}` | `{message_id, agent_response}` |
| GET | `/functions/v1/chat-history` | Load paginated chat history for a conversation | `?conversation_id=uuid&limit=20&before=cursor` | `{messages[], has_more}` |
| DELETE | `/functions/v1/chat-clear` | Clear chat history for a conversation | `{conversation_id}` | `{success}` |

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

#### POST /functions/v1/chat-send
```typescript
// Request
interface ChatSendRequest {
  conversation_id: string        // UUID of the conversation
  content: string                // User's message text (may include slash commands)
  message_type: 'text' | 'slash_command'
}

// Response
interface ChatSendResponse {
  user_message_id: string        // ID of persisted user message
  agent_messages: Array<{
    id: string
    role: 'agent'
    content: string
    message_type: MessageType
    card_data?: CardData          // Present for result_card messages
    session_id?: string           // Present for research-related messages
  }>
}

// Card data for result cards
interface CardData {
  card_type: 'article' | 'research_result' | 'stats' | 'session' | 'category_list'
  title: string
  snippet?: string
  category?: string
  confidence_score?: number
  source_count?: number
  document_id?: number
  session_id?: string
  metadata?: Record<string, unknown>
}
```

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
┌──────────────────────────────────────────────────────────────────────────────┐
│                      HOLOCRON CHAT-CENTRIC ARCHITECTURE                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────┐                                               │
│  │     Mobile Client         │                                               │
│  │     (React Native)        │                                               │
│  │                           │                                               │
│  │  ┌─────────────────────┐  │                                               │
│  │  │  Drawer (pushover)  │  │  Left-edge slide-over menu                    │
│  │  │  ┌───────────────┐  │  │                                               │
│  │  │  │ Articles Link │  │  │  Pinned at top → Articles browsing view       │
│  │  │  │ New Chat btn  │  │  │  Creates new conversation                     │
│  │  │  │ Chat List     │  │  │  All conversations, sorted by recent          │
│  │  │  └───────────────┘  │  │                                               │
│  │  └─────────────────────┘  │                                               │
│  │  ┌─────────────────────┐  │                                               │
│  │  │  Chat Thread View   │  │  Main view (per conversation)                 │
│  │  │  ┌───────────────┐  │  │                                               │
│  │  │  │ Message Bubbles│  │  │  User messages, agent responses               │
│  │  │  │ Result Cards   │  │  │  Tappable cards for articles/research         │
│  │  │  │ Progress Msgs  │  │  │  Real-time research updates                   │
│  │  │  └───────────────┘  │  │                                               │
│  │  │  ┌───────────────┐  │  │                                               │
│  │  │  │ Input Bar +   │  │  │  /search, /research, /deep-research            │
│  │  │  │ Slash Commands │  │  │  Autocomplete popup                           │
│  │  │  └───────────────┘  │  │                                               │
│  │  └─────────────────────┘  │                                               │
│  │  ┌─────────────────────┐  │                                               │
│  │  │  Articles View      │  │  Browse knowledge base (secondary view)       │
│  │  │  (list + filters)   │  │  Category chips, search, article cards        │
│  │  └─────────────────────┘  │                                               │
│  │  ┌─────────────────────┐  │                                               │
│  │  │  Detail View        │  │  Full article/report overlay                   │
│  │  │  (overlay/modal)    │  │  Edit, delete, recategorize actions            │
│  │  └─────────────────────┘  │                                               │
│  └────────────┬──────────────┘                                               │
│               │ HTTPS + Service Key                                          │
│               ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │                    SUPABASE PLATFORM                                  │    │
│  │                                                                       │    │
│  │  ┌────────────────────────────────────────────────────────────┐      │    │
│  │  │                EDGE FUNCTIONS (Deno)                        │      │    │
│  │  │                                                             │      │    │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐   │      │    │
│  │  │  │ chat-send    │  │ research-    │  │ deep-research- │   │      │    │
│  │  │  │ (router +    │  │ start        │  │ start          │   │      │    │
│  │  │  │  slash cmd   │  │              │  │                │   │      │    │
│  │  │  │  parser)     │  │              │  │                │   │      │    │
│  │  │  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘   │      │    │
│  │  │         │                 │                   │            │      │    │
│  │  │         ▼                 ▼                   ▼            │      │    │
│  │  │  ┌──────────────────────────────────────────────────┐     │      │    │
│  │  │  │              AGENT RUNTIME                       │     │      │    │
│  │  │  │         (Claude SDK or LangChain)                │     │      │    │
│  │  │  │                                                  │     │      │    │
│  │  │  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │     │      │    │
│  │  │  │  │ Chat     │  │ Research │  │ Deep Research│   │     │      │    │
│  │  │  │  │ Agent    │  │ Workflow │  │ Ralph Loop   │   │     │      │    │
│  │  │  │  │ (NL +   │  │          │  │              │   │     │      │    │
│  │  │  │  │  cmds)   │  │          │  │              │   │     │      │    │
│  │  │  │  └────┬─────┘  └────┬─────┘  └──────┬──────┘   │     │      │    │
│  │  │  │       │             │                │          │     │      │    │
│  │  │  └───────┼─────────────┼────────────────┼──────────┘     │      │    │
│  │  │          │             │                │                │      │    │
│  │  └──────────┼─────────────┼────────────────┼────────────────┘      │    │
│  │             │             │                │                        │    │
│  │             ▼             ▼                ▼                        │    │
│  │  ┌────────────────────────────────────────────────────────────┐    │    │
│  │  │                   POSTGRESQL DATABASE                       │    │    │
│  │  │                                                             │    │    │
│  │  │  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐    │    │    │
│  │  │  │conversations │  │ research_     │  │ documents    │    │    │    │
│  │  │  │  ↓           │  │ sessions +    │  │ (+ vectors)  │    │    │    │
│  │  │  │chat_messages │  │ iterations    │  │              │    │    │    │
│  │  │  └──────────────┘  └───────────────┘  └──────────────┘    │    │    │
│  │  │                                                             │    │    │
│  │  │  ┌──────────────────────────────────────────────────────┐  │    │    │
│  │  │  │ RPC Functions: hybrid_search, search_fts,            │  │    │    │
│  │  │  │                search_vector, generate_embedding     │  │    │    │
│  │  │  └──────────────────────────────────────────────────────┘  │    │    │
│  │  │                                                             │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  │                                                                     │    │
│  │  ┌────────────────────────────────────────────────────────────┐    │    │
│  │  │                   SUPABASE REALTIME                         │    │    │
│  │  │                                                             │    │    │
│  │  │  chat_messages inserts → Mobile Client (new agent messages) │    │    │
│  │  │  research_sessions changes → Mobile Client (progress)       │    │    │
│  │  │                                                             │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    EXTERNAL APIs                                      │   │
│  │                                                                       │   │
│  │  {Exa API}  ───────►  Web search, company research, code search      │   │
│  │                                                                       │   │
│  │  {Jina API} ───────►  Academic search, URL reading, deduplication    │   │
│  │                                                                       │   │
│  │  {OpenAI}   ───────►  Embeddings (text-embedding-3-small)            │   │
│  │                                                                       │   │
│  │  {Anthropic}───────►  Claude API for agent reasoning                 │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
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

### Chat-Specific UI Components

| Component | Purpose | Status |
|-----------|---------|--------|
| ChatThread | Scrollable message list with auto-scroll | New |
| MessageBubble | User/agent message rendering with markdown | New |
| ResultCard | Tappable card for articles, research results, stats | New |
| ProgressMessage | Updatable progress indicator message | New |
| SlashCommandInput | Text input with `/` autocomplete popup | New |
| CommandPalette | Popup showing available slash commands | New |
| ArticleDetailView | Full-screen overlay for reading articles | New |
| IterationTimeline | Visual progress of deep research iterations | New |

### Existing Installed Components (from RN Reusables)

| Component | Status | Notes |
|-----------|--------|-------|
| Text | Installed | `@/components/ui/text` with TextClassContext |
| Button | Installed | `@/components/ui/button` with variants |
| Card | Installed | `@/components/ui/card` for result cards |
| Input | Installed | `@/components/ui/input` for chat input |
| Badge | Installed | `@/components/ui/badge` for status/category indicators |
| Progress | Installed | `@/components/ui/progress` for research progress |
| Skeleton | Installed | `@/components/ui/skeleton` for loading states |
| Dialog | Installed | `@/components/ui/dialog` for overlays |
| Select | Installed | `@/components/ui/select` for category picker |
| Alert | Installed | `@/components/ui/alert` for feedback messages |
| AlertDialog | Installed | `@/components/ui/alert-dialog` for confirmations |

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

### Recommendation

**Start with Claude Agent SDK** for these reasons:
1. Simpler architecture matches our use case
2. Native Claude integration (we're already using Claude)
3. Less code to maintain
4. Edge Function bundle size constraints favor lighter SDK
5. Chat paradigm maps naturally to Claude's conversation model

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
- Chat history stored in user's database only
- No analytics or telemetry

---

## Performance Requirements

| Metric | Target | Notes |
|--------|--------|-------|
| Chat message send | < 200ms | User message persisted + agent acknowledged |
| Agent response (NL) | < 2 sec | Non-research natural language responses |
| Search latency | < 500ms | Hybrid search response time |
| Basic research | < 2 min | Single-pass research completion |
| Deep research iteration | < 5 min | Per-iteration execution |
| Progress update frequency | 5 sec | Realtime subscription for status changes |
| Chat history load | < 500ms | Initial page of 20 messages |
| Card tap → detail view | < 300ms | Article content fetch and render |

---

## Error Handling

### Client-Side
- Network errors: Show retry option in chat as agent message
- Session not found: Show "research expired" message in chat
- Research failed: Display error_text from session as error card
- Save failed: Show retry option ("type 'retry save' to try again")

### Server-Side (Edge Functions)
- API rate limits: Exponential backoff (3 attempts)
- External API failures: Mark session as failed with error, post error to chat
- Timeout: 5 min max per Edge Function invocation
- State recovery: Resume from last checkpoint (deep research)
- Slash command parse error: Agent responds with help message

---

## Migration Path

### Phase 0: Navigation & Conversations (NV use cases)
1. Create conversations table and CRUD Edge Functions
2. Build drawer (pushover menu) with Articles link, New Chat button, conversation list
3. Implement conversation creation, switching, renaming, and deletion
4. Set up Expo Router layout with drawer navigation + chat screens + articles view
5. Wire app to open most recent conversation on launch

### Phase 1: Chat Interface (CI use cases)
1. Build chat thread UI with message bubbles (scoped to active conversation)
2. Implement chat input bar with send functionality
3. Create chat-send Edge Function with basic agent responses
4. Add chat_messages table with conversation_id FK and history persistence
5. Implement slash command parsing and autocomplete

### Phase 2: Knowledge Base via Chat (KB use cases)
1. Wire `/search` command to existing RPC functions
2. Build result card component for search results
3. Build article detail view overlay
4. Wire `/browse` and `/stats` commands

### Phase 3: Basic Research via Chat (RS use cases)
1. Wire `/research` command to research-start Edge Function
2. Stream progress updates as chat messages via Realtime
3. Render research result cards on completion
4. Add `/history` command for past sessions

### Phase 4: Deep Research via Chat (DR use cases)
1. Wire `/deep-research` command to deep-research-start
2. Post iteration summary cards as they complete
3. Add `/resume` command for interrupted sessions
4. Build iteration timeline in detail view

### Phase 5: Article Management (AM use cases)
1. Add edit/delete/recategorize actions to article detail view
2. Post confirmation messages to chat after actions
