# Research Mode Decision Framework

## Problem

Currently, research tools (`quick_research`, `deep_research`) are **fire-and-forget**:
- They run async workflows
- Post result cards or create documents
- Agent doesn't synthesize a chat response

User reports: "If I ask a question and it results in research the agent will perform the research... which might answer the question, but not come back with a generated response."

## Root Cause

Both research tools return `skipContinuation: true`, which prevents the LLM from reading the research results and formulating an answer to the original question.

## Solution: Research Mode Selector

Add a **third research tool** that combines search + synthesis for chat responses:

```typescript
/**
 * answer_question - Research and answer in one step
 *
 * Unlike quick_research/deep_research (which create stored artifacts),
 * this tool performs web research AND synthesizes a direct chat answer.
 * Use when the user asks a question that requires current information but
 * doesn't need a stored research document.
 */
const answer_question = tool({
  description: "Research a topic on the web and provide a direct answer to the user's question. Use this when the user asks a question that requires up-to-date information from the web, but doesn't need a comprehensive stored report. Best for: factual questions, current events, 'what is X', 'how does Y work', comparisons, explanations.",
  inputSchema: z.object({
    query: z.string().describe("The specific question or topic to research and answer"),
    sources: z.number().optional().default(5).describe("Number of sources to consult (default 5)"),
  }),
});
```

## Decision Tree for LLM

```
User asks about something needing web info
│
├─ User explicitly says "research this thoroughly" / "create a report"
│  └─ Use deep_research (creates document, stored for reuse)
│
├─ User asks "what's new" / "current status" / "latest on X"
│  └─ Use answer_question (researches + synthesizes chat response)
│
├─ User asks simple factual question ("when was X released", "who owns Y")
│  └─ Use answer_question (fast lookup + direct answer)
│
└─ User asks to explore a broad topic for later reference
   └─ Use deep_research (creates comprehensive document)
```

## Implementation

### 1. New Tool: `answer_question`

```typescript
// convex/chat/tools.ts
export const answer_question = tool({
  description: "Research a topic on the web and provide a direct answer to the user's question...",
  inputSchema: z.object({
    query: z.string().describe("The specific question or topic to research and answer"),
    sources: z.number().optional().default(5).describe("Number of sources to consult (default 5)"),
  }),
});
```

### 2. Tool Executor

```typescript
// convex/chat/toolExecutor.ts
async function executeAnswerQuestion(
  ctx: ActionCtx,
  args: Record<string, any>,
  conversationId: Id<"conversations">,
): Promise<AgentResponse> {
  const query: string = args.query ?? "";
  const sources: number = args.sources ?? 5;

  if (!query) {
    return { content: "Please provide a question.", messageType: "text" };
  }

  // Run research synchronously (or with short timeout)
  const research = await ctx.runAction(internal.research.answerQuestion, {
    query,
    sources,
  });

  return {
    content: research.answer,
    messageType: "text",
    cardData: {
      card_type: "answer_with_sources",
      sources: research.sources,
    },
    // DON'T skip continuation — agent can elaborate if needed
    skipContinuation: false,
  };
}
```

### 3. Backend Handler

```typescript
// convex/research/answerQuestion.ts
import { internalAction } from "../_generated/server";
import { zaiFlash } from "../lib/ai/zai_provider";
import { mcp__jina__search_web } from "../mcp/jina";

export const answerQuestion = internalAction({
  args: {
    query: v.string(),
    sources: v.number().optional(),
  },
  handler: async (ctx, { query, sources = 5 }) => {
    // Search web
    const searchResults = await mcp__jina__search_web({
      query,
      num: sources,
    });

    // Fetch full content from top results
    const urls = searchResults.slice(0, 3).map(r => r.url);
    const contents = await mcp__jina__parallel_read_url({
      urls,
    });

    // Synthesize answer
    const { text } = await generateText({
      model: zaiFlash(),
      system: `You are a research assistant. Answer the user's question based on the provided web search results. Be concise, factual, and cite sources.`,
      prompt: `Question: ${query}\n\nSources:\n${contents.map((c, i) => `[${i+1}] ${c.title}\n${c.content}`).join('\n\n')}`,
    });

    return {
      answer: text,
      sources: searchResults.slice(0, 3).map((r, i) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
      })),
    };
  },
});
```

### 4. Update Specialist Prompt

```typescript
// convex/chat/specialistPrompts.ts
export const RESEARCH_SPECIALIST_PROMPT = `You are Holocron's research specialist.

## Your Tools
- answer_question: Research and answer questions that need current web info. Use for most questions.
- quick_research: Fast research that creates a stored summary card. Use when user wants to save results.
- deep_research: Comprehensive multi-iteration research. Use ONLY for complex topics requiring broad coverage and a stored report.

## Decision Guide
- Use answer_question for: "What is X?", "How does Y work?", "Latest on Z?", comparisons, explanations
- Use quick_research for: "Research X and save it", "Find info on Y for later"
- Use deep_research for: "Thorough research on X", "Comprehensive report on Y", "Deep dive into Z"

## Behavior
- Default to answer_question for most questions — it's faster and provides direct answers
- Only use quick_research/deep_research when the user explicitly wants to save/store research
- Synthesize clear, concise answers based on the sources found
${BASE_FORMATTING}`;
```

## Tool Comparison

| Tool | Output | Continuation | Use Case |
|------|--------|--------------|----------|
| `answer_question` | Chat message + sources | No (agent can elaborate) | Questions needing current info |
| `quick_research` | Result card | Yes (fire-and-forget) | Save research for later |
| `deep_research` | Document | Yes (fire-and-forget) | Comprehensive reports |

## Migration Notes

- Existing `quick_research` and `deep_research` behavior unchanged
- New `answer_question` tool added to `researchTools` set
- Update specialist prompt to guide tool selection
- No breaking changes to existing flows
