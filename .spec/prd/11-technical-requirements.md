# Technical Requirements: Holocron Mobile Research Interface

[UPDATED 2026-03-05]: Migrated to **Convex Agent + Workflow** architecture for multi-agent research. Uses orchestrator-worker pattern with GPT-5-mini for cost-effective parallel subagents.

---

## Multi-Agent Research Architecture (Convex Native)

### Overview

All slash commands that require extended processing are engineered as **Convex Workflows** with **Convex Agent component** for orchestration. This architecture implements Anthropic's proven orchestrator-worker pattern directly within Convex's 10-minute action limit.

**Key Insight (from Anthropic Research)**: Token usage explains 80% of performance variance in research quality. Multi-agent systems work by effectively scaling token usage across parallel context windows—exactly what Convex Workflows enable.

### Architecture Pattern: Convex Agent + Workflow

```typescript
// convex/research/agents.ts
import { Agent, createTool } from "@convex-dev/agent";
import { WorkflowManager } from "@convex-dev/workflow";
import { openai } from "@ai-sdk/openai";

// Lead agent - orchestrates research strategy (more capable model)
const leadResearcher = new Agent(components.agent, {
  name: "Lead Researcher",
  chat: openai.chat("gpt-5"),  // Lead uses GPT-5 for complex planning
  textEmbedding: openai.embedding("text-embedding-3-small"),
  instructions: `You are a research coordinator. Analyze queries,
    decompose into 3-5 subtasks, delegate to subagents, and synthesize findings.
    Scale effort to query complexity:
    - Simple fact-finding: 1 subagent, 3-5 tool calls
    - Comparisons: 2-3 subagents, 10-15 calls each
    - Complex research: 3-5 subagents with divided responsibilities`,
  tools: { planResearch, synthesizeFindings, assessCoverage },
});

// Subagent - parallel workers (cost-effective model)
const webSearcher = new Agent(components.agent, {
  name: "Web Searcher",
  chat: openai.chat("gpt-5-mini"),  // Subagents use GPT-5-mini (fast, cheap)
  instructions: `You are a focused research worker. Search for specific
    information on your assigned sub-topic. Cite all sources with URLs.
    Start with short, broad queries (2-4 words), then narrow based on findings.`,
  tools: { searchWeb, readUrl, evaluateSource },
});

// Workflow orchestrates the multi-agent collaboration
const workflow = new WorkflowManager(components.workflow);
```

### Model Assignment Strategy

| Agent Role | Model | Rationale |
|------------|-------|-----------|
| **Lead Researcher** | `gpt-5` | Complex planning, synthesis, quality judgment |
| **Web Searcher** (subagent) | `gpt-5-mini` | Fast, cheap parallel exploration |
| **Academic Searcher** (subagent) | `gpt-5-mini` | Fast, cheap parallel exploration |
| **Citation Agent** | `gpt-5-mini` | Structured validation task |
| **Reviewer Agent** | `gpt-5` | Quality assessment needs stronger reasoning |

**Cost Optimization**: Using GPT-5-mini for 3-5 parallel subagents reduces token costs by ~60% vs using GPT-5 for all agents, while maintaining research quality (subagents do retrieval, not reasoning).

### Task Types

| Task Type | Description | Convex Pattern | Skills Replicated |
|-----------|-------------|----------------|-------------------|
| `deep-research` | Multi-iteration research | Workflow + parallel subagents | `/deep-research` |
| `research` | Single-pass research | Single Action with tools | `/research` |
| `assimilate` | Repository analysis | Workflow + parallel swarm | `/assimilate` |
| `shop` | Product comparison | Workflow + parallel swarm | `/shop` |
| `research-loop` | Multi-topic research | Workflow + sequential iterations | `/research-loop` |

### Task Lifecycle (Convex Native)

With Convex, task status is stored directly in the entity (e.g., `researchSessions` table). No separate task tracking table needed—clients watch the entity via `useQuery`.

```
created → planning → searching → synthesizing → completed/error/cancelled
```

### Concurrency Control (Convex Native)

- **Workflow component** handles durable execution with automatic retries
- **Sequential workflow steps** for dependent operations
- **Parallel workflow steps** for independent subagent work
- **10-minute action limit** respected—subagents limited to 3-5 tool roundtrips each

---

## Multi-Agent Collaboration Patterns (Convex Agent + Workflow)

### Pattern 1: Orchestrator-Worker (for Deep Research)

**Implementation**: Convex Workflow with parallel Agent steps

```
┌─────────────────────────────────────────────────────────────────┐
│                   CONVEX WORKFLOW: deepResearch                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Step 1: PLAN (Lead Researcher - GPT-5)                     │ │
│  │ - Analyze query complexity                                  │ │
│  │ - Decompose into 3-5 subtasks                              │ │
│  │ - Store plan in thread memory                              │ │
│  └───────────────────────┬────────────────────────────────────┘ │
│                          │                                       │
│         ┌────────────────┼────────────────┐                     │
│         ▼                ▼                ▼                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Step 2a:    │  │ Step 2b:    │  │ Step 2c:    │  (PARALLEL) │
│  │ Subagent 1  │  │ Subagent 2  │  │ Subagent 3  │             │
│  │ GPT-5-mini  │  │ GPT-5-mini  │  │ GPT-5-mini  │             │
│  │ (Web Search)│  │ (Academic)  │  │ (Domain)    │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          │ findings                              │
│                          ▼                                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Step 3: SYNTHESIZE (Lead Researcher - GPT-5)               │ │
│  │ - Aggregate findings from all subagents                    │ │
│  │ - Resolve contradictions                                   │ │
│  │ - Generate report with citations                           │ │
│  └───────────────────────┬────────────────────────────────────┘ │
│                          │                                       │
│                          ▼                                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Step 4: REVIEW (Reviewer Agent - GPT-5)                    │ │
│  │ - Assess coverage score (1-5)                              │ │
│  │ - Identify gaps                                            │ │
│  │ - Decision: iterate or complete                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Convex Implementation:**

```typescript
// convex/research/deepResearch.ts
export const deepResearch = workflow.define({
  args: { query: v.string(), userId: v.string(), maxIterations: v.number() },
  handler: async (step, { query, userId, maxIterations }) => {
    // Step 1: Lead agent plans research (GPT-5)
    const plan = await step.run("plan", async () => {
      const { thread } = await leadResearcher.createThread(ctx, { userId });
      return thread.generateObject({
        prompt: `Plan comprehensive research for: ${query}`,
        schema: ResearchPlanSchema,
      });
    });

    // Step 2: Spawn parallel subagents (GPT-5-mini for cost efficiency)
    const findings = await Promise.all(
      plan.subtasks.map((task, i) =>
        step.run(`subagent-${i}`, async () => {
          const { thread } = await webSearcher.createThread(ctx, { userId });
          return thread.generateText({
            prompt: task.objective,
            tools: { searchWeb, readUrl, searchArxiv },
            maxToolRoundtrips: 5,  // Stay within 10-min action limit
          });
        })
      )
    );

    // Step 3: Synthesize findings (GPT-5)
    const report = await step.run("synthesize", async () => {
      return leadResearcher.generateText({
        prompt: `Synthesize these findings with citations:\n${findings.join("\n---\n")}`,
      });
    });

    // Step 4: Review coverage
    const review = await step.run("review", async () => {
      return reviewerAgent.generateObject({
        prompt: `Assess coverage (1-5) and identify gaps:\n${report}`,
        schema: ReviewSchema,
      });
    });

    // Iterate if coverage < 4 and iterations remain
    if (review.score < 4 && step.iteration < maxIterations) {
      return step.continue({ refinedQueries: review.gaps });
    }

    return { report, review, iterations: step.iteration };
  },
});
```

**Tools per agent:**
- **Lead Researcher (GPT-5)**: `planResearch`, `synthesizeFindings`, thread memory access
- **Subagent Workers (GPT-5-mini)**: `searchWeb`, `readUrl`, `searchArxiv`, `evaluateSource`
- **Reviewer (GPT-5)**: Coverage scoring (1-5), gap identification, iteration decision

### Pattern 2: Parallel Swarm (for Assimilate/Shop)

**Implementation**: Convex Workflow with parallel swarm workers (all GPT-5-mini)

```
┌─────────────────────────────────────────────────────────────────┐
│              CONVEX WORKFLOW: parallelSwarm                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Step 1: DECOMPOSE (Manager - GPT-5)                        │ │
│  │ - Analyze query                                            │ │
│  │ - Generate 3-5 parallel sub-queries                        │ │
│  └───────────────────────┬────────────────────────────────────┘ │
│                          │                                       │
│     ┌────────────────────┼────────────────────┐                 │
│     ▼                    ▼                    ▼                 │
│ ┌─────────┐         ┌─────────┐         ┌─────────┐             │
│ │ Step 2a │         │ Step 2b │         │ Step 2c │  (PARALLEL) │
│ │ Worker  │         │ Worker  │         │ Worker  │             │
│ │GPT-5-mini│        │GPT-5-mini│        │GPT-5-mini│            │
│ └────┬────┘         └────┬────┘         └────┬────┘             │
│      │                   │                   │                   │
│      └───────────────────┼───────────────────┘                  │
│                          ▼                                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Step 3: AGGREGATE (Synthesizer - GPT-5)                    │ │
│  │ - Deduplicate findings                                     │ │
│  │ - Merge and summarize                                      │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Convex Implementation:**

```typescript
// convex/swarm/parallelSwarm.ts
export const parallelSwarm = workflow.define({
  args: { query: v.string(), swarmType: v.string() },
  handler: async (step, { query, swarmType }) => {
    // Step 1: Manager decomposes (GPT-5)
    const subQueries = await step.run("decompose", async () => {
      return managerAgent.generateObject({
        prompt: `Decompose into 3-5 parallel search queries: ${query}`,
        schema: SubQuerySchema,
      });
    });

    // Step 2: Parallel workers (GPT-5-mini for cost)
    const findings = await Promise.all(
      subQueries.map((sq, i) =>
        step.run(`worker-${i}`, async () => {
          return workerAgent.generateText({
            prompt: sq.objective,
            tools: { searchWeb, readUrl },
            maxToolRoundtrips: 3,  // Fast, focused
          });
        })
      )
    );

    // Step 3: Synthesize (GPT-5)
    return step.run("synthesize", async () => {
      return synthesizerAgent.generateText({
        prompt: `Deduplicate and summarize:\n${findings.join("\n---\n")}`,
      });
    });
  },
});
```

**Tools per agent:**
- **Manager (GPT-5)**: Query decomposition, task assignment
- **Worker (GPT-5-mini)**: `searchWeb`, `readUrl`, initial filtering
- **Synthesizer (GPT-5)**: Deduplication, summarization, confidence scoring

### Pattern 3: Team Orchestrator (for Research Teamwork)

**Implementation**: Convex Workflow with specialized role agents

```
┌─────────────────────────────────────────────────────────────────┐
│            CONVEX WORKFLOW: researchTeam                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Step 1: PLAN (Research Planner - GPT-5)                    │ │
│  └───────────────────────┬────────────────────────────────────┘ │
│                          │                                       │
│     ┌────────────────────┼────────────────────┐                 │
│     ▼                    ▼                    ▼                 │
│ ┌─────────┐         ┌─────────┐         ┌─────────┐             │
│ │ Searcher│         │ Academic│         │ Domain  │  (PARALLEL) │
│ │GPT-5-mini│        │GPT-5-mini│        │GPT-5-mini│            │
│ └────┬────┘         └────┬────┘         └────┬────┘             │
│      │                   │                   │                   │
│      └───────────────────┼───────────────────┘                  │
│                          ▼                                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Step 3: CHALLENGE (Devil's Advocate - GPT-5)               │ │
│  │ - Identify weaknesses, gaps, contradictions                │ │
│  └───────────────────────┬────────────────────────────────────┘ │
│                          ▼                                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Step 4: SYNTHESIZE (Synthesizer - GPT-5)                   │ │
│  │ - Resolve contradictions, format for holocron              │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Agent Roles & Models:**

| Role | Model | Tools |
|------|-------|-------|
| **Research Planner** | GPT-5 | `expandQuery`, `parallelSearchWeb`, task decomposition |
| **Web Searcher** | GPT-5-mini | `searchWeb`, `readUrl`, `parallelReadUrl` |
| **Academic Searcher** | GPT-5-mini | `searchArxiv`, `searchSsrn`, `extractPdf` |
| **Domain Expert** | GPT-5-mini | Domain-specific interpretation |
| **Devil's Advocate** | GPT-5 | Gap analysis, contradiction detection |
| **Synthesizer** | GPT-5 | Report generation, holocron formatting |

---

## Agent Tools & Prompts

### Core Tools (Available to All Agents)

| Tool | Description | Implementation |
|------|-------------|----------------|
| `searchWeb()` | Web search via Jina/Exa | `mcp__jina__search_web` |
| `readUrl()` | Fetch and extract content | `mcp__jina__read_url` |
| `parallelReadUrl()` | Batch URL reading | `mcp__jina__parallel_read_url` |
| `extractPdf()` | Extract figures/tables from PDFs | `mcp__jina__extract_pdf` |
| `searchArxiv()` | Academic paper search | `mcp__jina__search_arxiv` |
| `searchSsrn()` | Social science papers | `mcp__jina__search_ssrn` |
| `deduplicateStrings()` | Semantic deduplication | `mcp__jina__deduplicate_strings` |
| `sortByRelevance()` | Rerank by relevance | `mcp__jina__sort_by_relevance` |

### LLM Integration (via AI SDK)

| Provider | Model | Purpose | API Key Env Var |
|----------|-------|---------|-----------------|
| **OpenAI** | `gpt-5` | Lead agents (planning, synthesis, review) | `OPENAI_API_KEY` |
| **OpenAI** | `gpt-5-mini` | Subagents (fast, parallel exploration) | `OPENAI_API_KEY` |
| **OpenAI** | `text-embedding-3-small` | Vector embeddings for RAG | `OPENAI_API_KEY` |

**Why AI SDK + OpenAI for Convex Agent:**
- AI SDK is the standard for Convex Agent component
- GPT-5-mini provides excellent cost/performance ratio for parallel workers
- Single provider simplifies API key management

### Convex Agent Patterns

With Convex Agent component, LLM interactions are handled directly via agent instances:

```typescript
// Text generation (simple completion)
const response = await agent.generateText({
  prompt: "Your prompt here",
  tools: { searchWeb, readUrl },
  maxToolRoundtrips: 5,
});

// Structured output with schema validation
const plan = await agent.generateObject({
  prompt: "Plan the research for: topic",
  schema: ResearchPlanSchema,  // Zod schema
});

// Streaming (via thread for conversation context)
const { thread } = await agent.createThread(ctx, { userId });
const stream = await thread.streamText({
  prompt: "Generate a detailed analysis",
});
for await (const chunk of stream) {
  // Process chunks in real-time
}
```

**Key Differences from Old Pattern:**
- No wrapper class needed—Convex Agent handles tool calling, memory, and context
- Schema validation via Zod (AI SDK standard)
- Thread-based conversations with automatic persistence
```

### System Prompts by Agent Type

#### Research Worker
```
You are a research worker. Your task is to:
1. Search for information on the assigned sub-topic
2. Extract key facts, findings, and claims
3. Cite all sources with URLs
4. Return structured findings in JSON format

Focus on accuracy and completeness. Flag any uncertainty.
```

#### Reviewer Agent
```
You are a research reviewer. Your task is to:
1. Assess coverage completeness (1-5 scale)
2. Identify gaps in the current findings
3. Generate refined queries to fill gaps
4. Provide feedback for the next iteration

Be critical and thorough. A score of 4+ indicates comprehensive coverage.
```

#### Synthesizer Agent
```
You are a research synthesizer. Your task is to:
1. Aggregate findings from all workers
2. Resolve contradictions between sources
3. Deduplicate redundant information
4. Produce a coherent summary with citations

Format output for holocron storage with proper metadata.
```

---

## Convex Function Structure

### File Organization

```
convex/
├── _generated/          # Auto-generated types and API
├── components.config.ts # Agent & Workflow component config
├── schema.ts            # Convex schema definitions
├── research/
│   ├── agents.ts        # Agent definitions (Lead, Workers, Reviewer)
│   ├── deepResearch.ts  # Deep research workflow
│   ├── basicResearch.ts # Single-pass research action
│   └── tools.ts         # Shared tools (searchWeb, readUrl, etc.)
├── swarm/
│   ├── parallelSwarm.ts # Swarm workflow for assimilate/shop
│   └── workers.ts       # Worker agent definitions
├── conversations/
│   ├── queries.ts       # list, get queries
│   └── mutations.ts     # create, update, remove mutations
├── chatMessages/
│   ├── queries.ts       # listByConversation query
│   └── mutations.ts     # send mutation
├── documents/
│   ├── queries.ts       # hybridSearch, vectorSearch, fullTextSearch
│   └── mutations.ts     # create, update, remove
└── http.ts              # HTTP routes for CLI skill
```

### Key Convex Patterns

| Pattern | Description |
|---------|-------------|
| `useQuery(api.*.get)` | Reactive query - auto-updates on entity changes |
| `useMutation(api.*.create)` | Optimistic mutation with automatic retry |
| `workflow.define()` | Durable workflow with parallel steps |
| `agent.generateText()` | LLM completion with tool calling |
| `agent.generateObject()` | Structured output with Zod schema |
| `thread.createThread()` | Persistent conversation context |

**Key Insight**: No task manager needed—Convex Workflow handles durable execution, retries, and state. Clients watch entities directly via `useQuery`.

---

## System Components

| Component | Type | Description |
|-----------|------|-------------|
| Mobile Client | React Native (Expo) | Chat-centric UI with message thread, slash commands, result cards |
| Convex Backend | Convex Functions | Queries, Mutations, Actions, Workflows for all API operations |
| Convex Database | Convex Tables | Document storage, chat history, session state, vector embeddings |
| Agent Runtime | Convex Agent + AI SDK | Multi-agent orchestration with GPT-5/GPT-5-mini |
| Workflow Engine | Convex Workflow | Durable execution for deep research, parallel swarms |
| External Search APIs | REST (via Actions) | Exa, Jina APIs for web/academic search |
| Realtime Updates | Convex `useQuery` | **Automatic** - no manual subscriptions needed |
| CLI Skill | ConvexHttpClient | Node.js HTTP client for holocron skill commands |

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

#### long_running_tasks (NEW - Server-Side Agent Infrastructure)

[UPDATED 2026-03-04]: Unified task tracking for all long-running background operations

```sql
-- Task type enum - all supported long-running operations
CREATE TYPE task_type AS ENUM (
  'deep-research',      -- Multi-iteration Ralph Loop research
  'assimilate',         -- Repository analysis (parallel swarm)
  'shop',               -- Product comparison (parallel swarm)
  'research',           -- Basic single-pass research
  'research-loop',      -- Multi-topic Ralph Loop
  'deep-research-teamwork' -- Full research team orchestration
);

-- Task status enum - lifecycle states
CREATE TYPE task_status AS ENUM (
  'pending',     -- Task created, waiting to start
  'queued',      -- Task queued in background processor
  'loading',     -- Task loading initial data/resources
  'running',     -- Task actively processing
  'completed',   -- Task finished successfully
  'error',       -- Task failed with error
  'cancelled'    -- Task cancelled by user
);

CREATE TABLE long_running_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,

  -- Task identification
  task_type task_type NOT NULL,
  status task_status NOT NULL DEFAULT 'pending',

  -- Task configuration (extensible per task type)
  config JSONB,

  -- Task progress tracking
  current_step INTEGER,
  total_steps INTEGER,
  progress_message TEXT,

  -- Task results (when complete)
  result JSONB,

  -- Error tracking
  error_message TEXT,
  error_details JSONB,

  -- Task lifecycle timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for task management
CREATE INDEX idx_long_running_tasks_user_status
  ON long_running_tasks(conversation_id, status)
  WHERE status IN ('pending', 'queued', 'loading', 'running');

CREATE INDEX idx_long_running_tasks_type_status
  ON long_running_tasks(task_type, status)
  WHERE status IN ('pending', 'queued', 'loading', 'running');

CREATE INDEX idx_long_running_tasks_conversation
  ON long_running_tasks(conversation_id);

CREATE INDEX idx_long_running_tasks_created_at
  ON long_running_tasks(created_at DESC);

-- Partial index for stuck task detection
CREATE INDEX idx_long_running_tasks_stuck
  ON long_running_tasks(updated_at)
  WHERE status = 'running';
```

#### deep_research_sessions (NEW - Deep Research Specific)

```sql
CREATE TABLE deep_research_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  task_id UUID REFERENCES long_running_tasks(id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  max_iterations INTEGER DEFAULT 5,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_deep_research_sessions_conversation ON deep_research_sessions(conversation_id);
CREATE INDEX idx_deep_research_sessions_task ON deep_research_sessions(task_id);
```

#### deep_research_iterations (NEW - Iteration Tracking)

```sql
CREATE TABLE deep_research_iterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES deep_research_sessions(id) ON DELETE CASCADE,
  iteration_number INTEGER NOT NULL,
  coverage_score DECIMAL(3,1),  -- 1.0-5.0 scale
  feedback TEXT,
  findings TEXT,
  refined_queries JSONB,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, iteration_number)
);

CREATE INDEX idx_deep_research_iterations_session ON deep_research_iterations(session_id);
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
│               HOLOCRON CHAT-CENTRIC ARCHITECTURE (CONVEX)                    │
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
│  │  │  │ useQuery()    │──┼──┼──► Auto-updates on entity changes             │
│  │  │  │ useMutation() │  │  │                                               │
│  │  │  │ Result Cards  │  │  │  Tappable cards for articles/research         │
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
│               │ WebSocket (Convex Client)                                    │
│               ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │                       CONVEX PLATFORM                                 │    │
│  │                                                                       │    │
│  │  ┌────────────────────────────────────────────────────────────┐      │    │
│  │  │              CONVEX FUNCTIONS (TypeScript)                  │      │    │
│  │  │                                                             │      │    │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐   │      │    │
│  │  │  │ Queries      │  │ Mutations    │  │ Actions        │   │      │    │
│  │  │  │ (reactive)   │  │ (writes)     │  │ (side effects) │   │      │    │
│  │  │  └──────────────┘  └──────────────┘  └────────────────┘   │      │    │
│  │  │                                                             │      │    │
│  │  │  ┌──────────────────────────────────────────────────┐     │      │    │
│  │  │  │           CONVEX AGENT + WORKFLOW                 │     │      │    │
│  │  │  │                                                   │     │      │    │
│  │  │  │  ┌────────────┐  ┌─────────────┐  ┌───────────┐  │     │      │    │
│  │  │  │  │ Lead Agent │  │ Subagents   │  │ Reviewer  │  │     │      │    │
│  │  │  │  │ (GPT-5)    │  │ (GPT-5-mini)│  │ (GPT-5)   │  │     │      │    │
│  │  │  │  │ Planning   │  │ Parallel    │  │ Quality   │  │     │      │    │
│  │  │  │  │ Synthesis  │  │ Search      │  │ Scoring   │  │     │      │    │
│  │  │  │  └─────┬──────┘  └──────┬──────┘  └─────┬─────┘  │     │      │    │
│  │  │  │        │                │               │         │     │      │    │
│  │  │  │        └────────────────┴───────────────┘         │     │      │    │
│  │  │  │                Workflow Orchestration              │     │      │    │
│  │  │  └───────────────────────────────────────────────────┘     │      │    │
│  │  │                                                             │      │    │
│  │  └─────────────────────────────────────────────────────────────┘      │    │
│  │                                                                       │    │
│  │  ┌────────────────────────────────────────────────────────────┐      │    │
│  │  │                   CONVEX DATABASE                           │      │    │
│  │  │                                                             │      │    │
│  │  │  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐    │      │    │
│  │  │  │conversations │  │ research      │  │ documents    │    │      │    │
│  │  │  │  ↓           │  │ Sessions +    │  │ (+ vectors)  │    │      │    │
│  │  │  │chatMessages  │  │ iterations    │  │              │    │      │    │
│  │  │  └──────────────┘  └───────────────┘  └──────────────┘    │      │    │
│  │  │                                                             │      │    │
│  │  │  Queries: hybridSearch, vectorSearch, fullTextSearch        │      │    │
│  │  │  (Built-in vector search + FTS via Convex)                  │      │    │
│  │  │                                                             │      │    │
│  │  └─────────────────────────────────────────────────────────────┘      │    │
│  │                                                                       │    │
│  │  ┌────────────────────────────────────────────────────────────┐      │    │
│  │  │                   AUTOMATIC REACTIVITY                      │      │    │
│  │  │                                                             │      │    │
│  │  │  useQuery() → Auto-subscribes, auto-updates on changes      │      │    │
│  │  │  No manual subscription management needed                   │      │    │
│  │  │  No useLongRunningTask hook needed (DELETE IT)              │      │    │
│  │  │                                                             │      │    │
│  │  └─────────────────────────────────────────────────────────────┘      │    │
│  │                                                                       │    │
│  └───────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    EXTERNAL APIs                                      │   │
│  │                                                                       │   │
│  │  {Exa API}  ───────►  Web search, company research, code search      │   │
│  │                                                                       │   │
│  │  {Jina API} ───────►  Academic search, URL reading, deduplication    │   │
│  │                                                                       │   │
│  │  {OpenAI}   ───────►  GPT-5, GPT-5-mini, Embeddings                  │   │
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

### Agent & LLM Framework

| Dependency | Version | Purpose | Documentation |
|------------|---------|---------|---------------|
| `@convex-dev/agent` | ^0.2.x | Convex Agent component - threads, tools, RAG | https://www.convex.dev/components/agent |
| `@convex-dev/workflow` | ^0.2.x | Durable workflow orchestration | https://www.convex.dev/components/workflow |
| `@ai-sdk/openai` | ^1.x | OpenAI provider for AI SDK | https://sdk.vercel.ai/providers/ai-sdk-providers/openai |
| `ai` | ^4.x | Vercel AI SDK (core) | https://sdk.vercel.ai/docs |

### LLM Models

| Model | Provider | Purpose | Env Variable |
|-------|----------|---------|--------------|
| `gpt-5` | OpenAI | Lead agents (planning, synthesis, review) | `OPENAI_API_KEY` |
| `gpt-5-mini` | OpenAI | Subagents (fast, parallel exploration) | `OPENAI_API_KEY` |
| `text-embedding-3-small` | OpenAI | Vector embeddings for RAG | `OPENAI_API_KEY` |

### Infrastructure

| Dependency | Version | Purpose | Documentation |
|------------|---------|---------|---------------|
| `convex` | ^1.16.x | Backend platform (database, functions, realtime) | https://docs.convex.dev |
| `@convex-dev/react` | ^1.16.x | React hooks for Convex | https://docs.convex.dev/client/react |

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

## Agent Framework Decision: Convex Agent + AI SDK

### Why Convex Agent Component

**Selected Stack:**
- **Convex Agent** (`@convex-dev/agent`) - Native Convex integration
- **Convex Workflow** (`@convex-dev/workflow`) - Durable orchestration
- **AI SDK** (`ai` + `@ai-sdk/openai`) - Model provider abstraction

**Key Advantages:**

| Feature | Convex Agent | Alternative (LangChain) |
|---------|--------------|------------------------|
| **Reactivity** | Built-in via Convex `useQuery` | Manual subscription |
| **Persistence** | Automatic (threads, memory) | External DB required |
| **Workflow** | Native Convex Workflow integration | LangGraph (separate) |
| **Type Safety** | Full TypeScript + Zod schemas | Runtime validation |
| **Bundle Size** | Lightweight | Heavy (300KB+) |
| **Learning Curve** | Convex-native patterns | New abstraction layer |

### Why GPT-5-mini for Subagents

**Model Strategy:**
- **GPT-5** for lead agents: Complex planning, synthesis, quality judgment
- **GPT-5-mini** for subagents: Fast, cheap parallel exploration

**Cost Analysis (per deep research session):**

| Strategy | Lead Agent | Subagents (5x) | Total Cost |
|----------|------------|----------------|------------|
| All GPT-5 | $0.15 | $0.75 | ~$0.90 |
| Hybrid (GPT-5 + GPT-5-mini) | $0.15 | $0.15 | ~$0.30 |
| **Savings** | - | - | **~67%** |

**Quality Tradeoff:** Minimal—subagents do retrieval/exploration (where GPT-5-mini excels), not complex reasoning (where GPT-5 shines).

---

## Security Considerations

### Authentication
- Convex uses project-scoped API keys
- Dev mode: Public Convex URL (no auth required for personal app)
- NOT suitable for production/public release

### API Key Management
```
# Convex Project
CONVEX_DEPLOYMENT       # Auto-generated Convex project URL

# LLM Provider (Convex environment variables)
OPENAI_API_KEY          # GPT-5, GPT-5-mini, embeddings

# Search APIs (Convex environment variables)
EXA_API_KEY             # Web search, code search
JINA_API_KEY            # Academic search, URL reading
```

**Note**: API keys are stored as Convex environment variables, not exposed to client.

### Data Privacy
- All data stored in Convex database (user's project)
- External APIs receive only query text, not full documents
- Embeddings generated via OpenAI (text sent to OpenAI)
- Chat history stored in Convex only
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
- Research failed: Display error from session as error card
- Save failed: Show retry option ("type 'retry save' to try again")
- Convex handles optimistic updates + automatic retry for mutations

### Server-Side (Convex Functions)
- **API rate limits**: Exponential backoff (3 attempts) via Convex Workflow
- **External API failures**: Mark session as failed, post error to chat
- **Timeout**: 10 min max per Action; Workflow steps auto-resume
- **State recovery**: Convex Workflow handles checkpoint/resume automatically
- **Slash command parse error**: Agent responds with help message

**Convex Workflow Durability:**
```typescript
// Workflow automatically retries failed steps
const findings = await step.run("search", async () => {
  // If this fails, Convex Workflow retries from checkpoint
  return webSearcher.generateText({ prompt: query });
});
```

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

### Phase 6: Backend Migration (BM use cases) - Supabase → Convex

**Timeline**: 6-8 weeks (can run in parallel with Phases 0-5 or after)

1. **Phase 6.0 - POC Validation** (Week 1)
   - Initialize Convex project
   - Migrate documents table with embeddings
   - Run A/B benchmark for search quality
   - GO/NO-GO decision

2. **Phase 6.1 - Data Layer** (Week 2-3)
   - Define Convex schema for all 9 tables
   - Build migration scripts
   - Validate data integrity

3. **Phase 6.2 - API Migration** (Week 3-5)
   - Port Edge Functions to Convex Actions/Mutations
   - Port RPC functions to Convex Queries
   - Implement task management in Convex

4. **Phase 6.3 - Client Migration** (Week 5-6)
   - Replace Supabase hooks with Convex hooks
   - Delete `use-chat-realtime.ts` (no longer needed)
   - Delete `taskRealtimeRegistry.ts` (no longer needed)

5. **Phase 6.4 - CLI Skill Migration** (Week 5-6)
   - Migrate holocron skill to Convex HTTP client
   - Test all skill commands

6. **Phase 6.5 - Cleanup** (Week 7-8)
   - Remove `@supabase/supabase-js` dependency
   - Delete Supabase client files
   - Update documentation

**See**: [12-uc-backend-migration.md](./12-uc-backend-migration.md) for detailed use cases
