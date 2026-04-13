/**
 * Eval Fixtures for Triage Routing
 *
 * 30+ typed test fixtures covering all queryShapes and intent categories.
 * Each fixture includes a mockLlmResponse that simulates what the LLM
 * would return for the given query, enabling CI gate validation without
 * real LLM calls.
 *
 * Distribution (from spec):
 * - recommendation: 8 fixtures (including canonical failing case)
 * - factual: 6 fixtures
 * - comprehensive: 4 fixtures
 * - exploratory: 3 fixtures
 * - ambiguous: 5 fixtures
 * - conversation: 4 fixtures
 * - knowledge: 3 fixtures (supplementary coverage)
 */

export interface Fixture {
  id: string;
  query: string;
  expectedIntent: string;
  expectedQueryShape: string;
  expectedTool: string | null;
  mockLlmResponse: string;
}

export const FIXTURES: Fixture[] = [
  // ---------------------------------------------------------------------------
  // recommendation (8 fixtures)
  // ---------------------------------------------------------------------------

  {
    id: "canonical-failing",
    query:
      "career coaches for people with autism in San Francisco — provide 3-5 highly rated referrals",
    expectedIntent: "research",
    expectedQueryShape: "recommendation",
    expectedTool: "find_recommendations",
    mockLlmResponse:
      '{"intent":"research","queryShape":"recommendation","confidence":"high","reasoning":"User wants named SF providers","directResponse":null}',
  },

  {
    id: "rec-5-dog-walkers",
    query: "find me 5 dog walkers near me",
    expectedIntent: "research",
    expectedQueryShape: "recommendation",
    expectedTool: "find_recommendations",
    mockLlmResponse:
      '{"intent":"research","queryShape":"recommendation","confidence":"high","reasoning":"Explicit find-me-N pattern for local service providers","directResponse":null}',
  },

  {
    id: "rec-best-therapists",
    query: "best therapists for teenagers in Brooklyn",
    expectedIntent: "research",
    expectedQueryShape: "recommendation",
    expectedTool: "find_recommendations",
    mockLlmResponse:
      '{"intent":"research","queryShape":"recommendation","confidence":"high","reasoning":"Best-X-in-Y pattern seeking named providers","directResponse":null}',
  },

  {
    id: "rec-top-react-libs",
    query: "top 3 React state management libraries in 2025",
    expectedIntent: "research",
    expectedQueryShape: "recommendation",
    expectedTool: "find_recommendations",
    mockLlmResponse:
      '{"intent":"research","queryShape":"recommendation","confidence":"high","reasoning":"Top-N pattern requesting specific named tools","directResponse":null}',
  },

  {
    id: "rec-hire-logo",
    query: "who should I hire to redesign my logo",
    expectedIntent: "research",
    expectedQueryShape: "recommendation",
    expectedTool: "find_recommendations",
    mockLlmResponse:
      '{"intent":"research","queryShape":"recommendation","confidence":"high","reasoning":"Who-should-I-hire pattern requesting named providers","directResponse":null}',
  },

  {
    id: "rec-thai-food-sf",
    query: "where can I find good Thai food in SF",
    expectedIntent: "research",
    expectedQueryShape: "recommendation",
    expectedTool: "find_recommendations",
    mockLlmResponse:
      '{"intent":"research","queryShape":"recommendation","confidence":"high","reasoning":"Where-can-I-find pattern with location for named restaurants","directResponse":null}',
  },

  {
    id: "rec-autism-therapy",
    query: "highly rated autism therapy centers near Chicago — show me 5 options",
    expectedIntent: "research",
    expectedQueryShape: "recommendation",
    expectedTool: "find_recommendations",
    mockLlmResponse:
      '{"intent":"research","queryShape":"recommendation","confidence":"high","reasoning":"Highly-rated plus N-options pattern requesting named providers","directResponse":null}',
  },

  {
    id: "rec-consultants",
    query: "recommend 2-3 UX consultants for a fintech startup",
    expectedIntent: "research",
    expectedQueryShape: "recommendation",
    expectedTool: "find_recommendations",
    mockLlmResponse:
      '{"intent":"research","queryShape":"recommendation","confidence":"high","reasoning":"Recommend N pattern for specific consultants","directResponse":null}',
  },

  // ---------------------------------------------------------------------------
  // factual (6 fixtures)
  // ---------------------------------------------------------------------------

  {
    id: "factual-what-is-llama",
    query: "what is a llama",
    expectedIntent: "research",
    expectedQueryShape: "factual",
    expectedTool: "answer_question",
    mockLlmResponse:
      '{"intent":"research","queryShape":"factual","confidence":"high","reasoning":"Direct factual question about a concept","directResponse":null}',
  },

  {
    id: "factual-webgl",
    query: "how does WebGL work",
    expectedIntent: "research",
    expectedQueryShape: "factual",
    expectedTool: "answer_question",
    mockLlmResponse:
      '{"intent":"research","queryShape":"factual","confidence":"high","reasoning":"Technical how-does question seeking explanatory answer","directResponse":null}',
  },

  {
    id: "factual-bitcoin-price",
    query: "current Bitcoin price",
    expectedIntent: "research",
    expectedQueryShape: "factual",
    expectedTool: "answer_question",
    mockLlmResponse:
      '{"intent":"research","queryShape":"factual","confidence":"high","reasoning":"Current information request for a specific data point","directResponse":null}',
  },

  {
    id: "factual-rag",
    query: "What is RAG?",
    expectedIntent: "research",
    expectedQueryShape: "factual",
    expectedTool: "answer_question",
    mockLlmResponse:
      '{"intent":"research","queryShape":"factual","confidence":"high","reasoning":"Direct factual question about a technical concept","directResponse":null}',
  },

  {
    id: "factual-vector-db-pros-cons",
    query: "pros and cons of vector databases",
    expectedIntent: "research",
    expectedQueryShape: "factual",
    expectedTool: "answer_question",
    mockLlmResponse:
      '{"intent":"research","queryShape":"factual","confidence":"high","reasoning":"Prose analysis request, no named entities needed","directResponse":null}',
  },

  {
    id: "factual-autism-diagnosis",
    query: "how does autism diagnosis work in adults",
    expectedIntent: "research",
    expectedQueryShape: "factual",
    expectedTool: "answer_question",
    mockLlmResponse:
      '{"intent":"research","queryShape":"factual","confidence":"high","reasoning":"Informational how-does question seeking prose answer","directResponse":null}',
  },

  // ---------------------------------------------------------------------------
  // comprehensive (4 fixtures)
  // ---------------------------------------------------------------------------

  {
    id: "comp-autism-employment",
    query: "comprehensive report on the autism employment landscape",
    expectedIntent: "research",
    expectedQueryShape: "comprehensive",
    expectedTool: "deep_research",
    mockLlmResponse:
      '{"intent":"research","queryShape":"comprehensive","confidence":"high","reasoning":"Explicit comprehensive-report signal requesting multi-section document","directResponse":null}',
  },

  {
    id: "comp-quantum",
    query: "thorough research on quantum computing trends in 2025",
    expectedIntent: "research",
    expectedQueryShape: "comprehensive",
    expectedTool: "deep_research",
    mockLlmResponse:
      '{"intent":"research","queryShape":"comprehensive","confidence":"high","reasoning":"Thorough-research signal requesting saved document","directResponse":null}',
  },

  {
    id: "comp-ai-alignment",
    query: "deep dive into AI alignment safety research",
    expectedIntent: "research",
    expectedQueryShape: "comprehensive",
    expectedTool: "deep_research",
    mockLlmResponse:
      '{"intent":"research","queryShape":"comprehensive","confidence":"high","reasoning":"Deep-dive signal requesting comprehensive analysis","directResponse":null}',
  },

  {
    id: "comp-vector-embeddings",
    query: "complete guide to vector embeddings for search",
    expectedIntent: "research",
    expectedQueryShape: "comprehensive",
    expectedTool: "deep_research",
    mockLlmResponse:
      '{"intent":"research","queryShape":"comprehensive","confidence":"high","reasoning":"Complete-guide signal requesting multi-section document","directResponse":null}',
  },

  // ---------------------------------------------------------------------------
  // exploratory (3 fixtures)
  // ---------------------------------------------------------------------------

  {
    id: "expl-ai-weekly",
    query: "what's interesting in AI this week",
    expectedIntent: "discovery",
    expectedQueryShape: "exploratory",
    expectedTool: null,
    mockLlmResponse:
      '{"intent":"discovery","queryShape":"exploratory","confidence":"medium","reasoning":"Browsing/discovering signal with no specific output shape","directResponse":null}',
  },

  {
    id: "expl-rag-architectures",
    query: "tell me about RAG architectures",
    expectedIntent: "research",
    expectedQueryShape: "exploratory",
    expectedTool: null,
    mockLlmResponse:
      '{"intent":"research","queryShape":"exploratory","confidence":"medium","reasoning":"Open-ended exploration without specific output shape","directResponse":null}',
  },

  {
    id: "expl-dev-tools",
    query: "what's trending in developer tools right now",
    expectedIntent: "discovery",
    expectedQueryShape: "exploratory",
    expectedTool: null,
    mockLlmResponse:
      '{"intent":"discovery","queryShape":"exploratory","confidence":"medium","reasoning":"Trending/discovery signal with broad scope","directResponse":null}',
  },

  // ---------------------------------------------------------------------------
  // ambiguous (5 fixtures)
  // ---------------------------------------------------------------------------

  {
    id: "amb-career-coaches",
    query: "tell me about career coaches",
    expectedIntent: "research",
    expectedQueryShape: "ambiguous",
    expectedTool: null,
    mockLlmResponse:
      '{"intent":"research","queryShape":"ambiguous","confidence":"high","reasoning":"Missing blocking variables: location, specialty","directResponse":"I can help with career coaches! Where are you located, and is there a specialty you are looking for (e.g., executive, transitions, neurodivergent support)?"}',
  },

  {
    id: "amb-autism-support",
    query: "can you help with autism support",
    expectedIntent: "research",
    expectedQueryShape: "ambiguous",
    expectedTool: null,
    mockLlmResponse:
      '{"intent":"research","queryShape":"ambiguous","confidence":"high","reasoning":"Vague request missing specific need and location","directResponse":"I would love to help! Could you tell me more about what kind of autism support you are looking for (therapy, coaching, resources) and where you are located?"}',
  },

  {
    id: "amb-research-sf",
    query: "research on SF",
    expectedIntent: "research",
    expectedQueryShape: "ambiguous",
    expectedTool: null,
    mockLlmResponse:
      '{"intent":"research","queryShape":"ambiguous","confidence":"high","reasoning":"No topic specified for the research request","directResponse":"I can dig into that — what specifically about San Francisco would you like me to research?"}',
  },

  {
    id: "amb-find-coach",
    query: "find me a coach",
    expectedIntent: "research",
    expectedQueryShape: "ambiguous",
    expectedTool: null,
    mockLlmResponse:
      '{"intent":"research","queryShape":"ambiguous","confidence":"high","reasoning":"Missing blocking variables: location, specialty, type of coaching","directResponse":"Happy to help find a coach! Where are you located, and what type of coaching are you looking for (career, life, executive, etc.)?"}',
  },

  {
    id: "amb-research-stuff",
    query: "research stuff",
    expectedIntent: "research",
    expectedQueryShape: "ambiguous",
    expectedTool: null,
    mockLlmResponse:
      '{"intent":"research","queryShape":"ambiguous","confidence":"high","reasoning":"No topic specified at all","directResponse":"I can dig into that — what would you like me to research?"}',
  },

  // ---------------------------------------------------------------------------
  // conversation (4 fixtures)
  // ---------------------------------------------------------------------------

  {
    id: "conv-thanks",
    query: "thanks!",
    expectedIntent: "conversation",
    expectedQueryShape: "factual",
    expectedTool: null,
    mockLlmResponse:
      '{"intent":"conversation","queryShape":"factual","confidence":"high","reasoning":"Simple gratitude, no tool needed","directResponse":"You are welcome! Let me know if there is anything else I can help with."}',
  },

  {
    id: "conv-what-do-you-think",
    query: "what do you think of those coaches?",
    expectedIntent: "conversation",
    expectedQueryShape: "factual",
    expectedTool: null,
    mockLlmResponse:
      '{"intent":"conversation","queryShape":"factual","confidence":"high","reasoning":"Follow-up opinion request about prior results — answer from context","directResponse":"Based on the coaches listed, here are my thoughts..."}',
  },

  {
    id: "conv-explain-again",
    query: "explain that again in simpler terms",
    expectedIntent: "conversation",
    expectedQueryShape: "factual",
    expectedTool: null,
    mockLlmResponse:
      '{"intent":"conversation","queryShape":"factual","confidence":"high","reasoning":"Follow-up clarification request — answer from conversation context","directResponse":"Sure! Let me break that down more simply..."}',
  },

  {
    id: "conv-greeting",
    query: "hey, how are you doing today?",
    expectedIntent: "conversation",
    expectedQueryShape: "factual",
    expectedTool: null,
    mockLlmResponse:
      '{"intent":"conversation","queryShape":"factual","confidence":"high","reasoning":"Greeting and small talk, no tool needed","directResponse":"Hey! I am doing well, thanks for asking. What can I help you with today?"}',
  },

  // ---------------------------------------------------------------------------
  // knowledge (3 fixtures — supplementary coverage)
  // ---------------------------------------------------------------------------

  {
    id: "know-autism-saved",
    query: "what do I have saved about autism",
    expectedIntent: "knowledge",
    expectedQueryShape: "factual",
    expectedTool: "search_knowledge_base",
    mockLlmResponse:
      '{"intent":"knowledge","queryShape":"factual","confidence":"high","reasoning":"User wants to search their personal knowledge base for saved content","directResponse":null}',
  },

  {
    id: "know-career-notes",
    query: "my career coach notes",
    expectedIntent: "knowledge",
    expectedQueryShape: "factual",
    expectedTool: "search_knowledge_base",
    mockLlmResponse:
      '{"intent":"knowledge","queryShape":"factual","confidence":"high","reasoning":"User wants to retrieve saved documents about career coaches","directResponse":null}',
  },

  {
    id: "know-rag-articles",
    query: "show me my RAG architecture articles",
    expectedIntent: "knowledge",
    expectedQueryShape: "factual",
    expectedTool: "search_knowledge_base",
    mockLlmResponse:
      '{"intent":"knowledge","queryShape":"factual","confidence":"high","reasoning":"User wants to retrieve saved articles about RAG","directResponse":null}',
  },
];
