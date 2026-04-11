---
name: Technical Requirements
description: System components, data schema deltas, API design, prompt deltas, build sequence, and external dependencies for the smarter chat agent
stability: CONSTITUTION
last_validated: 2026-04-11
prd_version: 1.0.0
---

# Technical Requirements

## System Components

| Name | Role | File Path | Status |
|------|------|-----------|--------|
| Triage classifier | Classifies intent + queryShape, LLM-driven | `convex/chat/triage.ts` | MODIFY |
| Triage regex pre-filter | Deterministic first-pass classification | `convex/chat/triageRegex.ts` | CREATE |
| Triage system prompt | LLM prompt with queryShape taxonomy | `convex/chat/prompts.ts` | MODIFY |
| Specialist prompts | Research specialist decision guide | `convex/chat/specialistPrompts.ts` | MODIFY |
| Agent tools | Tool registry for Vercel AI SDK | `convex/chat/tools.ts` | MODIFY |
| Tool executor | Dispatches tool calls to handlers | `convex/chat/toolExecutor.ts` | MODIFY |
| Agent orchestrator | Main triage→dispatch flow | `convex/chat/agent.ts` | MODIFY |
| Research actions | Backend research implementations | `convex/research/actions.ts` | MODIFY |
| Conversations mutations | Pending state setters/clearers | `convex/conversations/mutations.ts` | MODIFY |
| Telemetry schema | agentTelemetry table definition | `convex/schema.ts` | MODIFY |
| Telemetry mutations | Insert-only writer | `convex/chat/telemetryMutations.ts` | CREATE |
| Telemetry queries | Inspection queries for dev | `convex/chat/telemetryQueries.ts` | CREATE |
| Eval fixtures | Test data for routing eval | `convex/chat/eval/fixtures.ts` | CREATE |
| Eval runner | Internal action for eval | `convex/chat/eval/runEval.ts` | CREATE |
| Eval test | Vitest harness with mocked LLM | `convex/chat/eval/runEval.test.ts` | CREATE |
| Telemetry retention cron | 90-day TTL for agentTelemetry | `convex/crons.ts` | MODIFY |
| MCP recommendations tool | Bun wrapper for MCP server | `holocron-mcp/src/tools/recommendations.ts` | CREATE |
| MCP server registration | Tool registration in stdio | `holocron-mcp/src/mastra/stdio.ts` | MODIFY |
| MCP validation schemas | Zod schemas for MCP | `holocron-mcp/src/config/validation.ts` | MODIFY |
| RecommendationListCard | Mobile container component | `components/cards/RecommendationListCard.tsx` | CREATE |
| RecommendationItem | Mobile per-item component | `components/cards/RecommendationItem.tsx` | CREATE |
| RecommendationSources | Mobile sources footer | `components/cards/RecommendationSources.tsx` | CREATE |
| RecommendationActionSheet | Mobile long-press menu | `components/cards/RecommendationActionSheet.tsx` | CREATE |
| ClarificationMessage | Mobile clarification bubble | `components/chat/ClarificationMessage.tsx` | CREATE |
| ClarificationQuickReplyChip | Mobile chip leaf component | `components/chat/ClarificationQuickReplyChip.tsx` | CREATE |
| AgentActivityIndicator | Mobile activity indicator | `components/chat/AgentActivityIndicator.tsx` | CREATE |
| DocumentDisciplineFooter | Mobile doc save footer | `components/chat/DocumentDisciplineFooter.tsx` | CREATE |
| useAgentActivity hook | Subscribe to agent phase | `hooks/use-agent-activity.ts` | CREATE |
| ChatThread integration | Card dispatcher + indicator + footer | `components/chat/ChatThread.tsx` | MODIFY |

## Data Schema Deltas

### `conversations` table — add 3 optional fields

```typescript
conversations: defineTable({
  // ... existing fields ...

  // NEW — multi-turn intent coherence
  pendingIntent: v.optional(v.string()),        // one of IntentCategory values
  pendingQueryShape: v.optional(v.string()),    // one of QueryShape values
  pendingSince: v.optional(v.number()),         // epoch ms; used for 30-min expiry

  // ... existing timestamps ...
}).index("by_updated", ["updatedAt"]),
```

No index changes. No backfill. Backward compatible.

### `agentTelemetry` table — NEW

```typescript
agentTelemetry: defineTable({
  conversationId: v.id("conversations"),
  messageId: v.id("chatMessages"),

  // Classification output
  intent: v.string(),
  queryShape: v.string(),
  confidence: v.string(),
  reasoning: v.optional(v.string()),

  // Source of classification
  classificationSource: v.union(
    v.literal("regex"),
    v.literal("llm"),
    v.literal("fallback"),
    v.literal("pending_rehydrate"),
  ),

  // Optional diagnostic fields
  regexMatchPattern: v.optional(v.string()),
  rawLlmResponse: v.optional(v.string()),       // truncated to 2000 chars
  llmDurationMs: v.optional(v.number()),

  // Dispatch outcome
  specialistUsed: v.optional(v.string()),
  toolsCalled: v.optional(v.array(v.string())),

  // Ambiguity fields
  ambiguousIntents: v.optional(v.array(v.string())),
  clarificationQuestion: v.optional(v.string()),

  // Timing
  totalDurationMs: v.number(),
  createdAt: v.number(),
})
  .index("by_conversation", ["conversationId", "createdAt"])
  .index("by_intent", ["intent", "createdAt"])
  .index("by_queryShape", ["queryShape", "createdAt"])
  .index("by_createdAt", ["createdAt"])
  .index("by_source", ["classificationSource", "createdAt"]),
```

**No changes to `chatMessages` or `toolCalls`** — existing `cardData: v.any()` and `toolArgs: v.record(v.string(), v.any())` already accept the new card type and new tool args.

## API Design

### NEW TOOL — `find_recommendations` (Vercel AI SDK)

```typescript
// convex/chat/tools.ts
const find_recommendations = tool({
  description:
    "Find specific recommendations, referrals, or providers for the user. " +
    "Returns a numbered list of 3-7 named entities with contact details, ratings, location, and one-sentence reasons each fits the user's criteria. " +
    "Use this when the user wants specific named options they can act on. " +
    "Triggers: 'find me N X', 'best X in Y', 'top N X', 'recommend X', 'referrals for X', 'who should I hire for X', 'where can I find X', 'highly rated X'. " +
    "Do NOT use this for 'what is X', 'how does X work', 'pros and cons of X', or 'X vs Y' — use answer_question instead. " +
    "Do NOT use this when the user wants a comprehensive report or saved document — use deep_research instead. " +
    "This tool produces an INLINE response — no document is created.",
  inputSchema: z.object({
    query: z.string().describe(
      "The recommendation request, including any constraints. Example: 'career coaches specializing in autism support'",
    ),
    count: z.number().int().min(3).max(7).optional().default(5).describe(
      "Target number of recommendations (default 5). Use the user's explicit count if specified.",
    ),
    location: z.string().optional().describe(
      "Geographic constraint extracted from the query. Omit if global, online, or remote.",
    ),
    constraints: z.array(z.string()).optional().describe(
      "Other constraints extracted from the query (e.g., ['specializing in autism support', 'in-person only', 'under $200/hr']).",
    ),
  }),
});
```

### NEW ACTION — `findRecommendationsAction` (internal, synchronous)

```typescript
// convex/research/actions.ts
export const findRecommendationsAction = internalAction({
  args: {
    query: v.string(),
    count: v.optional(v.number()),
    location: v.optional(v.string()),
    budget: v.optional(v.string()),
    mustHave: v.optional(v.array(v.string())),
  },
  returns: v.object({
    items: v.array(v.object({
      name: v.string(),
      description: v.string(),
      contact: v.optional(v.object({
        phone: v.optional(v.string()),
        email: v.optional(v.string()),
        url: v.optional(v.string()),
      })),
      location: v.optional(v.string()),
      pricing: v.optional(v.string()),
      rating: v.optional(v.number()),
      whyRecommended: v.string(),
    })),
    sources: v.array(v.object({
      title: v.string(),
      url: v.string(),
      snippet: v.string(),
    })),
    query: v.string(),
    durationMs: v.number(),
  }),
  handler: async (ctx, args) => findRecommendationsCore(args),
});

// PUBLIC ACTION — exposed to MCP
export const findRecommendations = action({
  args: { /* same as above */ },
  returns: { /* same as above */ },
  handler: async (ctx, args) => findRecommendationsCore(args),
});

// Shared core (pure function — no ctx needed)
async function findRecommendationsCore(args): Promise<RecommendationResult> {
  // 1. Build enhanced query from query + location + budget + mustHave
  // 2. Call Jina Search API (max 8 sources for recommendation synthesis)
  // 3. Call Jina Reader on top 5 sources in parallel with 15s timeout each
  // 4. Call zaiPro with RECOMMENDATION_SYNTHESIS_PROMPT
  // 5. Validate output against Zod schema
  // 6. Return structured result
}
```

### NEW MUTATIONS — conversation pending state

```typescript
// convex/conversations/mutations.ts
export const setPendingIntent = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    intent: v.string(),
    queryShape: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { conversationId, intent, queryShape }) => {
    await ctx.db.patch(conversationId, {
      pendingIntent: intent,
      pendingQueryShape: queryShape,
      pendingSince: Date.now(),
    });
    return null;
  },
});

export const clearPendingIntent = internalMutation({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, { conversationId }) => {
    await ctx.db.patch(conversationId, {
      pendingIntent: undefined,
      pendingQueryShape: undefined,
      pendingSince: undefined,
    });
    return null;
  },
});
```

### NEW MUTATION — telemetry writer

```typescript
// convex/chat/telemetryMutations.ts
export const recordTriage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.id("chatMessages"),
    intent: v.string(),
    queryShape: v.string(),
    confidence: v.string(),
    reasoning: v.optional(v.string()),
    classificationSource: v.union(
      v.literal("regex"),
      v.literal("llm"),
      v.literal("fallback"),
      v.literal("pending_rehydrate"),
    ),
    regexMatchPattern: v.optional(v.string()),
    rawLlmResponse: v.optional(v.string()),
    llmDurationMs: v.optional(v.number()),
    specialistUsed: v.optional(v.string()),
    toolsCalled: v.optional(v.array(v.string())),
    ambiguousIntents: v.optional(v.array(v.string())),
    clarificationQuestion: v.optional(v.string()),
    totalDurationMs: v.number(),
  },
  returns: v.id("agentTelemetry"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentTelemetry", {
      ...args,
      rawLlmResponse: args.rawLlmResponse?.slice(0, 2000),
      createdAt: Date.now(),
    });
  },
});
```

## Prompt Deltas (CONSTITUTION layer)

### TRIAGE_SYSTEM_PROMPT — full replacement

Replaces `convex/chat/prompts.ts:61-94`. Adds `## Query Shape (NEW — critical for routing)` section with 5 enum values, response format JSON example with `queryShape` field, 8 rules (ambiguous queries always get directResponse, don't ask twice, recommendation queries are NOT comprehensive queries, follow-up questions about prior results = conversation, etc.), and 7 few-shot examples covering each queryShape.

See full text in pi-agent-planner contribution at `/tmp/pi-agent-output.md` lines 532-617.

### HOLOCRON_SYSTEM_PROMPT — additions

Adds two new sections to `convex/chat/prompts.ts:1-59`:
- **`## Clarification Before Tools`** — when to ask, how to ask, how NOT to ask. Covers recommendation queries, save queries, research queries, shop queries.
- **`## Inline vs Document Discipline`** — tools that always create documents vs never create documents. Explicit user signals required for save.

See full text in pi-agent-planner contribution at `/tmp/pi-agent-output.md` lines 622-663.

### RESEARCH_SPECIALIST_PROMPT — full replacement

Replaces `convex/chat/specialistPrompts.ts:34-51`. Adds `## TOP PRIORITY: Recommendation Queries` section, lists `find_recommendations` as a tool, includes signals that mean RECOMMENDATION/FACTUAL/COMPREHENSIVE, gives a 5-step decision guide, and notes the queryShape hint preamble from the orchestrator.

See full text in pi-agent-planner contribution at `/tmp/pi-agent-output.md` lines 672-733.

### NEW: RECOMMENDATION_SYNTHESIS_PROMPT

Add to `convex/chat/specialistPrompts.ts` for use by `findRecommendationsAction`. Contains:
- OUTPUT FORMAT (literal markdown template with name, tagline, rating, location, contact, why-it-fits, source citation)
- 9 rules (return EXACTLY count entries unless sources don't support, every name must be real, every entry must cite, OMIT don't GUESS, no preamble, no conclusion, tagline ≤ 80 chars, why ≤ 1 sentence, fallback response when sources don't yield 3+ providers)
- USER CRITERIA template
- SOURCES template

See full text in pi-agent-planner contribution at `/tmp/pi-agent-output.md` lines 742-797.

### find_recommendations CONTINUATION HINT

System message hint prepended in `convex/chat/agent.ts` `continueAfterTool` when the prior tool was `find_recommendations`. Tells the agent NOT to re-render the list, NOT to call another tool, just offer save in 1-2 sentences max.

See full text in pi-agent-planner contribution at `/tmp/pi-agent-output.md` lines 875-888.

## Decision Tables (CONSTITUTION layer)

### Decision Table A: Intent + queryShape → Tool Mapping

| Intent | queryShape | Tool to use | Creates document? |
|---|---|---|---|
| `conversation` | (any) | (none — directResponse) | No |
| `research` | `factual` | `answer_question` | No |
| `research` | `recommendation` | `find_recommendations` | **No** |
| `research` | `comprehensive` | `deep_research` | Yes |
| `research` | `exploratory` | `answer_question` | No |
| `research` | `ambiguous` | (none — directResponse w/ clarification) | No |
| `knowledge` | `factual` | `search_knowledge_base` | No |
| `knowledge` | `recommendation` | `search_knowledge_base` | No |
| `knowledge` | `comprehensive` | `search_knowledge_base` (then summarize inline) | No |
| `knowledge` | `exploratory` | `browse_category` | No |
| `knowledge` | `ambiguous` | (none — directResponse) | No |
| `commerce` | `factual`/`recommendation`/`comprehensive`/`exploratory` | `shop_search` | No |
| `commerce` | `ambiguous` | (none — directResponse) | No |
| `subscriptions` | (any non-ambiguous) | subscribe/unsubscribe/list/check | No |
| `subscriptions` | `ambiguous` | (none — directResponse) | No |
| `discovery` | (any non-ambiguous) | `whats_new` | Yes |
| `discovery` | `ambiguous` | (none — directResponse) | No |
| `documents` | `factual` | save/update/get | Yes (save) |
| `documents` | `recommendation` | `save_document` (extract from context) | Yes |
| `documents` | `comprehensive` | `save_document` | Yes |
| `documents` | `exploratory` | `get_document` | No |
| `documents` | `ambiguous` | (none — directResponse) | No |
| `analysis` | (any non-ambiguous) | `assimilate` | Yes |
| `analysis` | `ambiguous` | (none — directResponse) | No |
| `improvements` | `factual` | search/get/list | No |
| `improvements` | `recommendation` | `search_improvements` (then add if no dupe) | No |
| `improvements` | `comprehensive` | `add_improvement` | Yes (ticket) |
| `improvements` | `exploratory` | `list_improvements` | No |
| `improvements` | `ambiguous` | (none — directResponse) | No |
| `multi_step` | (any) | `create_plan` | Depends on plan |

**Rule**: Document creation is determined by tool, not by specialist discretion.

### Decision Table B: When to Ask a Clarifying Question

| Signal | Example query | Clarifying question |
|---|---|---|
| Recommendation query missing location | "Find me a career coach" | "Happy to help find a coach! Where are you located, and is there a specialty you're looking for (e.g., career transitions, executive, neurodivergent support)?" |
| Recommendation query missing target | "Find me some referrals" | "What kind of referrals are you looking for, and roughly how many (3, 5, more)?" |
| Save query with no prior content | "Save this" | "Happy to save something for you — what would you like me to save? You can paste content, or tell me a topic to research first." |
| Research query with vague topic | "Research stuff" / "Help me with autism" | "I can dig into that — what specifically would you like me to research?" |
| Shop query with no budget | "I need a laptop" | "What's your budget range, and do you want new or are you open to refurbished?" |
| Subscribe query missing source | "Subscribe to that" | "What would you like me to subscribe to — a YouTube channel, newsletter, Reddit, or something else?" |
| Improvement query with no description | "Add an improvement" | "What improvement would you like to add, and which part of the app is it about?" |
| Document query missing target | "Update the doc" | "Which document would you like me to update?" |

**Rules**:
1. Ask at most ONE question per turn, one sentence with at most 2 sub-questions joined by "and"
2. Ask only about BLOCKING variables, never modulating preferences (count, format)
3. Hard cap at `clarificationDepth = 1`

### Decision Table C: When to Create a Document vs Inline

| Situation | Doc? | Tool |
|---|---|---|
| User says "save", "for later", "bookmark", "keep", "add to my KB" | **Yes** | `save_document` |
| User says "comprehensive report", "deep dive", "thorough analysis", "complete guide" | **Yes** | `deep_research` |
| User says "research and save" | **Yes** | `multi_step` → `quick_research` + `save_document` |
| User says "whats new" / "AI briefing" | **Yes** | `whats_new` |
| User says "analyze this repo" | **Yes** | `assimilate` |
| User asks for specific named providers ("find me 5 X", "best Y") | **No** | `find_recommendations` |
| User asks factual question ("what is X") | **No** | `answer_question` |
| User asks comparison ("X vs Y") | **No** | `answer_question` |
| User asks follow-up analysis ("what do you think") | **No** | text response, no tool |
| User asks opinion ("which is best?") | **No** | text response, no tool |
| User says "save the X you just listed" | **Yes** | `save_document` extracted from context |
| User asks general-knowledge question ("hello") | **No** | `conversation` directResponse |

**Rules**:
1. Agent never creates a document proactively because the output "feels long"
2. `find_recommendations` never creates a document — even if list is long
3. `answer_question` never creates a document

## External Dependencies

| Dependency | Use | Documentation |
|-----------|-----|---------------|
| Jina Search API | Web search for recommendation sources | https://jina.ai/reader/ |
| Jina Reader API | Extract structured content from URLs | https://jina.ai/reader/ |
| zaiFlash | Fast LLM for triage classification | Existing `convex/lib/ai/zai_provider.ts` |
| zaiPro | Stronger LLM for synthesis + specialists | Existing `convex/lib/ai/zai_provider.ts` |
| Vercel AI SDK `tool()` | Tool schema definition | https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling |
| Convex | Backend runtime, validators, scheduler | https://docs.convex.dev/functions |
| convex-test | Vitest harness for Convex functions | https://docs.convex.dev/functions/testing |
| @mastra/mcp | MCP server framework | https://mastra.ai/docs/mcp-servers |
| Zod | Schema validation (MCP + LLM output) | https://zod.dev |
| react-native-paper | Mobile UI primitives (Text, Button, Portal, Modal) | https://callstack.github.io/react-native-paper/ |
| @testing-library/react-native | Mobile component testing | https://callstack.github.io/react-native-testing-library/ |
| Storybook (Vitest project) | Co-located stories with play functions | https://storybook.js.org/docs |

## Architecture Diagram

```
                      Mobile Chat (Expo)
                              │
                              │ useAction(api.chat.index.send)
                              ▼
            ┌─────────────────────────────────────────────────────────┐
            │ convex/chat/index.ts  send()                             │
            │ - persist user message                                   │
            │ - schedule api.chat.agent.run                            │
            └─────────────┬───────────────────────────────────────────┘
                          │
                          ▼
            ┌─────────────────────────────────────────────────────────┐
            │ convex/chat/agent.ts  run() → callLlmAndHandleResponse() │
            │                                                          │
            │   ┌──────────────────────────────────────────────┐      │
            │   │ *NEW* convex/chat/triageRegex.ts             │      │
            │   │   regexClassify(content)                     │      │
            │   │   → {intent, queryShape, confidence}         │      │
            │   │   ├── high confidence? skip LLM              │      │
            │   │   └── else → feed to LLM as hint             │      │
            │   └────────────────┬─────────────────────────────┘      │
            │                    ▼                                     │
            │   ┌──────────────────────────────────────────────┐      │
            │   │ *MODIFIED* convex/chat/triage.ts             │      │
            │   │   classifyIntent(messages, regexHint,        │      │
            │   │                  pendingIntent)              │      │
            │   │   → {intent, queryShape, confidence,         │      │
            │   │      classificationSource, reasoning,        │      │
            │   │      directResponse?, clarificationQuestion?}│      │
            │   └────────────────┬─────────────────────────────┘      │
            │                    │                                     │
            │     ┌──────────────┼───────────────┐                    │
            │     ▼              ▼               ▼                    │
            │  conversation   ambiguous       specialist               │
            │  direct resp.   clarify         dispatch                 │
            │     │              │               │                    │
            │     │              │               ▼                    │
            │     │              │     ┌──────────────────────┐       │
            │     │              │     │ INTENT_TO_SPECIALIST │       │
            │     │              │     │ + *NEW* queryShape   │       │
            │     │              │     │   context in prompt  │       │
            │     │              │     └──────────┬───────────┘       │
            │     │              │                ▼                   │
            │     │              │     ┌──────────────────────┐       │
            │     │              │     │ Research Specialist  │       │
            │     │              │     │ (zaiPro)             │       │
            │     │              │     │                      │       │
            │     │              │     │ TOOLS:               │       │
            │     │              │     │ - answer_question    │       │
            │     │              │     │ - quick_research     │       │
            │     │              │     │ - deep_research      │       │
            │     │              │     │ *NEW* find_recomm.   │       │
            │     │              │     └──────────┬───────────┘       │
            │     │              │                ▼                   │
            │     │              │     ┌──────────────────────┐       │
            │     │              │     │ tool_approval        │       │
            │     │              │     │ stored in chatMsgs   │       │
            │     │              │     └──────────┬───────────┘       │
            │     │              │                ▼                   │
            │     │              │     ┌──────────────────────┐       │
            │     │              │     │ executeAgentTool()   │       │
            │     │              │     │ (toolExecutor.ts)    │       │
            │     │              │     └──────────┬───────────┘       │
            │     │              │                ▼                   │
            │     │              │     ┌──────────────────────┐       │
            │     │              │     │ *NEW* findRecomm.    │       │
            │     │              │     │ Action (sync, 30s)   │       │
            │     │              │     │                      │       │
            │     │              │     │ Jina Search + Reader │       │
            │     │              │     │ + zaiPro synthesis   │       │
            │     │              │     │ + Zod validation     │       │
            │     │              │     └──────────┬───────────┘       │
            │     │              │                ▼                   │
            │     │              │     ┌──────────────────────┐       │
            │     │              │     │ result_card          │       │
            │     │              │     │ card_type:           │       │
            │     │              │     │ "recommendation_list"│       │
            │     │              │     └──────────┬───────────┘       │
            │     │              │                ▼                   │
            │     │              │     continueAfterTool                │
            │     │              │     (specialist wraps up)            │
            │     │              │                                      │
            │     ▼              ▼                                      │
            │  persist msg  *NEW* setPendingIntent                      │
            └──────────┬──────────┬─────────────────────────────────────┘
                       │          │
                       │          │     ┌──────────────────────────────┐
                       │          └────▶│ *NEW* recordTriage mutation  │
                       │                │ → agentTelemetry table       │
                       │                └──────────────────────────────┘
                       ▼
              Mobile: reactive subscription picks up result_card
                       │
                       ▼
            ┌──────────────────────────────────────────────────┐
            │ ChatThread.tsx dispatch                          │
            │ - text message → MarkdownText                    │
            │ - clarification → ClarificationMessage *NEW*     │
            │ - recommendation_list → RecommendationListCard *NEW*  │
            │ - any agent text → DocumentDisciplineFooter wrap *NEW* │
            │ - phase change → AgentActivityIndicator *NEW*    │
            └──────────────────────────────────────────────────┘

            ┌─────────────────────────────────────────────────────────┐
            │ External Clients (MCP)                                  │
            │                                                          │
            │ holocron-mcp/src/mastra/stdio.ts                        │
            │   mcp__holocron__findRecommendationsTool  *NEW*         │
            │     → calls research/actions:findRecommendations         │
            │     → same findRecommendationsCore()                     │
            └─────────────────────────────────────────────────────────┘
```

## Build Sequence (TDD-Ordered)

Each task ends in a green commit (typecheck + tests + lint pass). Tasks are ordered so each builds on a green tree.

### Backend Phase (Tasks 1–15)

| # | Task | Files | Verify |
|---|------|-------|--------|
| 1 | Schema delta (additive, non-breaking) | `convex/schema.ts` | `pnpm tsc --noEmit`, `npx convex dev` |
| 2 | Triage type signature refactor (add QueryShape, validate, fall back) | `convex/chat/triage.ts` | `pnpm tsc --noEmit`, `pnpm vitest run` |
| 3 | Regex pre-filter module (pure, unit-testable) | `convex/chat/triageRegex.ts`, test | `pnpm vitest run triageRegex` |
| 4 | Triage prompt rewrite with queryShape taxonomy | `convex/chat/prompts.ts` | manual smoke via `npx convex run` |
| 5 | Telemetry mutation + schema wiring | `convex/chat/telemetryMutations.ts`, test | `pnpm vitest run telemetryMutations` |
| 6 | Triage integration with regex + telemetry | `convex/chat/triage.ts`, `convex/chat/agent.ts` | manual smoke via dev chat |
| 7 | Conversation pending state mutations | `convex/conversations/mutations.ts`, test | `pnpm vitest run conversations/mutations` |
| 8 | Ambiguous short-circuit in agent.ts | `convex/chat/agent.ts`, `convex/chat/triage.ts` | manual smoke: send "find me a coach" |
| 9 | `find_recommendations` tool schema + specialist prompt update | `convex/chat/tools.ts`, `convex/chat/specialistPrompts.ts` | `pnpm tsc --noEmit` |
| 10 | `findRecommendationsAction` implementation | `convex/research/actions.ts`, test | `npx convex run research/actions:findRecommendations --query "..."` |
| 11 | Tool executor wiring for `find_recommendations` | `convex/chat/toolExecutor.ts` | manual smoke: send the canonical failing query |
| 12 | Eval fixtures + runner | `convex/chat/eval/fixtures.ts`, `convex/chat/eval/runEval.ts`, `convex/chat/eval/runEval.test.ts` | `pnpm vitest run chat/eval` |
| 13 | Telemetry inspection queries | `convex/chat/telemetryQueries.ts` | `npx convex run chat/telemetryQueries:listRecentClassifications --limit 10` |
| 14 | MCP recommendation tool exposure | `holocron-mcp/src/tools/recommendations.ts`, `holocron-mcp/src/config/validation.ts`, `holocron-mcp/src/mastra/stdio.ts` | `bun run build` in `holocron-mcp/` |
| 15 | Telemetry retention cron | `convex/crons.ts`, `convex/chat/telemetryMutations.ts` | manual cron run |

### Mobile Phase (Tasks 16–35)

| # | Task | Files | Verify |
|---|------|-------|--------|
| 16 | RecommendationListCard types + props | `components/cards/types/recommendation.ts` | `pnpm tsc --noEmit` |
| 17 | ClarificationQuickReplyChip (leaf) | `components/chat/ClarificationQuickReplyChip.tsx`, story, test | `pnpm vitest run` |
| 18 | ClarificationMessage component | `components/chat/ClarificationMessage.tsx`, story, test | `pnpm vitest run` |
| 19 | RecommendationItem component | `components/cards/RecommendationItem.tsx`, story, test | `pnpm vitest run` |
| 20 | RecommendationSources sub-component | `components/cards/RecommendationSources.tsx`, story, test | `pnpm vitest run` |
| 21 | RecommendationActionSheet sub-component | `components/cards/RecommendationActionSheet.tsx`, story, test | `pnpm vitest run` |
| 22 | RecommendationListCard (container) | `components/cards/RecommendationListCard.tsx`, story, test | `pnpm vitest run` |
| 23 | AgentActivityIndicator component | `components/chat/AgentActivityIndicator.tsx`, story, test | `pnpm vitest run` |
| 24 | DocumentDisciplineFooter component | `components/chat/DocumentDisciplineFooter.tsx`, story, test | `pnpm vitest run` |
| 25 | useAgentActivity hook | `hooks/use-agent-activity.ts`, test | `pnpm vitest run` |
| 26 | ChatThread integration — RecommendationListCard dispatch | `components/chat/ChatThread.tsx`, integration test | `pnpm vitest run` |
| 27 | ChatThread integration — ClarificationMessage dispatch + quick reply wiring | `components/chat/ChatThread.tsx`, integration test | `pnpm vitest run` |
| 28 | ChatThread integration — DocumentDisciplineFooter wrapping | `components/chat/ChatThread.tsx`, integration test | `pnpm vitest run` |
| 29 | ChatThread integration — AgentActivityIndicator placement | `components/chat/ChatThread.tsx`, integration test | `pnpm vitest run` |
| 30 | Wire mobile save-to-KB actions to Convex mutation | `components/chat/DocumentDisciplineFooter.tsx`, integration test | `pnpm vitest run` |
| 31 | Recommendation save-to-KB wiring | `components/chat/ChatThread.tsx`, test | `pnpm vitest run` |
| 32 | Storybook test run + CI gate | All new component stories | `vitest --project=storybook --run` |
| 33 | Dark mode visual verification | All new components | manual screenshot in Storybook |
| 34 | Full type check + lint + test suite | All files | `pnpm tsc --noEmit && pnpm lint && pnpm vitest run` |
| 35 | End-to-end smoke test on device | (manual) | Real device test of the canonical failing query |

## Risks and Rollback

### Risk 1 — LLM emits invalid `queryShape` values
- **Likelihood**: HIGH (prompt drift is real)
- **Impact**: MEDIUM — fallback logic kicks in but telemetry gets polluted
- **Mitigation**: Validate against literal union, fall back to `factual` on unknown values, telemetry records `classificationSource: "fallback"` so we can tune the prompt
- **Rollback**: Single-file revert of `convex/chat/triage.ts`. Schema keeps working because new fields are optional. Convex deploy is atomic.

### Risk 2 — `find_recommendations` synthesis timeouts
- **Likelihood**: MEDIUM
- **Impact**: HIGH — user sees no card, specialist error card only
- **Mitigation**: 30s total cap via AbortController, Jina Search 5s timeout, Jina Reader 10s parallel, synthesis 15s, graceful "no recommendations found" card on timeout
- **Rollback**: Remove `find_recommendations` from `researchTools` subset — single-line revert in `convex/chat/tools.ts`

### Risk 3 — `pendingIntent` stale state pollutes future turns
- **Likelihood**: LOW
- **Impact**: MEDIUM
- **Mitigation**: 30-minute expiry check, clear on every successful non-ambiguous turn, telemetry records `resolvedFromPending: true`
- **Rollback**: Set all existing `pendingIntent` fields to undefined via one-off mutation. Fields are optional — removal is non-destructive.

### Risk 4 — Recommendation synthesis produces general advisory instead of named items
- **Likelihood**: MEDIUM
- **Impact**: HIGH (failing case recurs)
- **Mitigation**: Strict synthesis prompt with template-first ordering, fabrication forbidden, fallback response when sources don't yield 3+ providers, post-synthesis string-match validator
- **Rollback**: Tweak synthesis prompt — single-file edit. Eval test catches regression.

### Risk 5 — `agentTelemetry` table grows unbounded
- **Likelihood**: MEDIUM over 6 months
- **Impact**: LOW
- **Mitigation**: 90-day cron, `rawLlmResponse` truncated to 2000 chars
- **Rollback**: Drop the cron, no deploy breakage. One-off mutation can delete all rows in batches.

### Risk 6 — Long-press conflicts with scroll gestures on Android
- **Likelihood**: MEDIUM (Android Pixel + heavy lists)
- **Impact**: MEDIUM (mis-taps open action sheets)
- **Mitigation**: `delayLongPress={400}`, real-device test on Android, fallback option of three-dot menu icon if long-press feels bad
- **Rollback**: Replace long-press with explicit menu button — UI-only change.

### Risk 7 — Convex query mocking complexity in mobile tests
- **Likelihood**: HIGH
- **Impact**: MEDIUM (slow test development)
- **Mitigation**: Create `mockConvexQuery<T>(value: T)` test helper, stick to component unit tests with mocked hooks, 1-2 high-value integration tests for dispatcher logic
- **Rollback**: N/A (test infra)

## Telemetry & Evaluation

### Metrics captured per turn

| Metric | Source | Storage |
|--------|--------|---------|
| `intent` | classifyIntent output | `agentTelemetry.intent` |
| `queryShape` | classifyIntent output | `agentTelemetry.queryShape` |
| `confidence` | classifyIntent output | `agentTelemetry.confidence` |
| `classificationSource` | agent.ts dispatch logic | `agentTelemetry.classificationSource` |
| `specialistUsed` | agent.ts post-dispatch | `agentTelemetry.specialistUsed` |
| `toolsCalled` | handleLlmResult tool call array | `agentTelemetry.toolsCalled` |
| `llmDurationMs` | classifyIntent timing | `agentTelemetry.llmDurationMs` |
| `totalDurationMs` | agent.ts send→response timing | `agentTelemetry.totalDurationMs` |
| `regexMatchPattern` | triageRegex hit | `agentTelemetry.regexMatchPattern` |
| `ambiguousIntents` | classifyIntent ambiguous path | `agentTelemetry.ambiguousIntents` |
| `rawLlmResponse` | classifyIntent raw output (truncated 2000 chars) | `agentTelemetry.rawLlmResponse` |

### Eval fixture coverage (30+ queries minimum)

| Category | Count | Examples |
|----------|-------|----------|
| `recommendation` | 8 | "career coaches for autism in SF", "5 dog walkers near me", "best therapists for teenagers in Brooklyn" |
| `factual` | 6 | "what is a llama", "how does WebGL work", "current Bitcoin price" |
| `comprehensive` | 4 | "thorough research on quantum computing trends", "deep dive into AI alignment" |
| `exploratory` | 3 | "what's interesting in AI this week" |
| `ambiguous` | 5 | "tell me about career coaches", "can you help with autism support", "research on SF" |
| `conversation` | 4 | "thanks!", "what do you think", "explain that again" |
| `knowledge` | 3 | "what do I have saved about autism", "my career coach notes" |

CI hard-asserts:
1. ≥ 90% routing accuracy across all fixtures
2. The canonical failing case routes to `find_recommendations`
3. The canonical failing case is classified as `queryShape: "recommendation"` with high confidence

### Dev inspection commands

```bash
npx convex run chat/telemetryQueries:listRecentClassifications --limit 20
npx convex run chat/telemetryQueries:countByQueryShape --days 7
npx convex run chat/telemetryQueries:findDivergences --limit 10
npx convex run chat/telemetryQueries:getTurnDetails --messageId <id>
```

## Verification (End-to-End)

After all tasks complete, manually verify:

1. **Backend**: `pnpm tsc --noEmit && pnpm lint && pnpm vitest run` — all green
2. **Convex deploy**: `npx convex dev` succeeds, no schema errors
3. **MCP build**: `bun run build` in `holocron-mcp/` succeeds
4. **Eval CI**: `pnpm vitest run chat/eval` passes the 30+ fixture suite at ≥ 90% accuracy
5. **Manual mobile e2e**: Open the app, send the canonical failing query verbatim, observe:
   - Triage classifies as `intent: research`, `queryShape: recommendation`
   - Agent picks `find_recommendations` (NOT `deep_research`)
   - `RecommendationListCard` renders with 5 named coaches
   - Each item has tappable phone, website, location
   - No document is created in the user's KB
   - Activity indicator showed "Finding recommendations..." during execution
   - DocumentDisciplineFooter shows "Save this to KB" quick-action
6. **Telemetry inspection**: `npx convex run chat/telemetryQueries:listRecentClassifications --limit 5` shows the canonical query with correct routing
7. **MCP test**: From a Claude Code session, call `mcp__holocron__findRecommendationsTool` with a recommendation query and confirm it returns structured results
8. **Multi-turn coherence test**: Send "find me a career coach", receive clarification, respond "SF for autism", confirm the specialist re-runs with the original intent preserved
9. **Document discipline test**: Send "what is RAG?" → no doc created. Send "deep dive into RAG" → doc created. Verify both cases.
10. **Regression sweep**: Send 10 random queries from prior conversations, verify nothing previously working broke
