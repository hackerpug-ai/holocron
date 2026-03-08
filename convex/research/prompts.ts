/**
 * Research Prompts for Deep Research Workflow
 *
 * Centralized prompt builders for the research workflow:
 * - buildSearchPrompt: Search planning and execution
 * - buildSynthesisPrompt: Findings synthesis
 * - buildReviewPrompt: Coverage assessment
 */

import type { Id } from "../_generated/dataModel";
import type { GenericActionCtx } from "convex/server";

/**
 * Research context structure
 */
export interface ResearchContext {
  topic: string;
  previousIterations: Array<{
    iteration: number;
    findings: string;
    coverageScore: number;
    gaps: string[];
  }>;
}

/**
 * Build research context from database
 *
 * Retrieves session and all previous iterations to provide
 * full context for LLM calls without agent threads.
 */
export async function buildResearchContext(
  ctx: GenericActionCtx<any>,
  sessionId: Id<"deepResearchSessions">
): Promise<ResearchContext> {
  console.log(`[buildResearchContext] Entry - sessionId: ${sessionId}`);
  const { api } = await import("../_generated/api");

  console.log(`[buildResearchContext] Fetching session from database`);
  const session = await ctx.runQuery(
    api.research.queries.getDeepResearchSession,
    { sessionId }
  );

  if (!session) {
    console.error(`[buildResearchContext] Session not found: ${sessionId}`);
    throw new Error(`Session ${sessionId} not found`);
  }

  console.log(`[buildResearchContext] Session found - topic: "${session.topic}"`);

  console.log(`[buildResearchContext] Fetching iterations for session`);
  const iterations = await ctx.runQuery(
    api.research.queries.listDeepResearchIterations,
    { sessionId }
  );

  console.log(`[buildResearchContext] Found ${iterations.length} previous iterations`);

  const context = {
    topic: session.topic,
    previousIterations: iterations.map(it => ({
      iteration: it.iterationNumber,
      findings: it.findings ?? "",
      coverageScore: it.coverageScore ?? 0,
      gaps: (it.refinedQueries as string[]) ?? [],
    })),
  };

  console.log(`[buildResearchContext] Exit - context built with ${context.previousIterations.length} iterations`);
  return context;
}

/**
 * Build search prompt with context
 *
 * Generates prompt for search planning and execution.
 * Includes previous iteration context to avoid duplication.
 */
export function buildSearchPrompt(
  topic: string,
  previousIterations: ResearchContext["previousIterations"]
): string {
  console.log(`[buildSearchPrompt] Entry - topic: "${topic}", previousIterations: ${previousIterations.length}`);

  const contextSection = previousIterations.length > 0
    ? `
Previous Research Context (${previousIterations.length} iterations):
${previousIterations.map(it =>
  `Iteration ${it.iteration} (score: ${it.coverageScore}/5):
${it.findings}
Gaps identified: ${it.gaps.join(", ")}`
).join("\n\n")}

Focus on NEW information that complements previous research.
`
    : "";

  const prompt = `Research the following topic: "${topic}"

${contextSection}
Your task:
1. Generate 3-5 focused search queries that cover different aspects of this topic
2. Execute searches using the available tools:
   - exaSearch: for technical content, academic papers, research
   - jinaSearch: for general web search, diverse sources
   - jinaSiteSearch: for searching within specific domains (e.g., documentation sites, company websites)
   - jinaReader: for deep article reading and full content extraction
3. Extract key findings with proper citations in [Title](URL) format

Be thorough and systematic. Use multiple search queries to gather comprehensive information.`;

  console.log(`[buildSearchPrompt] Exit - prompt length: ${prompt.length} chars`);
  return prompt;
}

/**
 * Structured finding output for confidence tracking
 */
export interface StructuredFinding {
  claimText: string;
  claimCategory: string;
  sources: Array<{
    url: string;
    title: string;
    sourceType: string; // official_documentation | expert_blog | academic_paper | forum | news | social_media | unknown
    evidenceType: string; // primary | secondary | tertiary | anecdotal
    publishedDate?: string; // ISO date
    authorCredentials?: string;
  }>;
  confidenceFactors: {
    sourceCredibilityScore: number; // 0-100
    evidenceQualityScore: number; // 0-100
    corroborationScore: number; // 0-100
    recencyScore: number; // 0-100
    expertConsensusScore: number; // 0-100
  };
}

/**
 * Build synthesis prompt with context
 *
 * Generates prompt for synthesizing search findings into
 * structured JSON output with per-claim confidence scoring.
 */
export function buildSynthesisPrompt(
  context: ResearchContext,
  searchFindings: string
): string {
  console.log(`[buildSynthesisPrompt] Entry - topic: "${context.topic}", searchFindings length: ${searchFindings.length}, previousIterations: ${context.previousIterations.length}`);

  const previousContext = context.previousIterations.length > 0
    ? `
Previous Research (${context.previousIterations.length} iterations):
${context.previousIterations.map(it =>
  `Iteration ${it.iteration}: ${it.findings}`
).join("\n\n")}

Build on this foundation - do NOT simply repeat what was already found.
`
    : "";

  const prompt = `Synthesize research findings into a structured JSON format with confidence scoring.

Topic: ${context.topic}

Latest Search Findings:
${searchFindings}

${previousContext}
Return a JSON object with the following structure:
{
  "findings": [
    {
      "claimText": "The specific claim or finding (1-3 sentences)",
      "claimCategory": "Category like 'Technical Implementation', 'Best Practice', 'Limitation', etc.",
      "sources": [
        {
          "url": "https://example.com/source",
          "title": "Source Title",
          "sourceType": "official_documentation|expert_blog|academic_paper|forum|news|social_media|unknown",
          "evidenceType": "primary|secondary|tertiary|anecdotal",
          "publishedDate": "2024-01-15",
          "authorCredentials": "Description of author expertise if known"
        }
      ],
      "confidenceFactors": {
        "sourceCredibilityScore": 0-100,
        "evidenceQualityScore": 0-100,
        "corroborationScore": 0-100,
        "recencyScore": 0-100,
        "expertConsensusScore": 0-100
      }
    }
  ],
  "narrativeSummary": "A 300-500 word narrative summary of key findings"
}

CONFIDENCE SCORING GUIDELINES:

Source Credibility Score (0-100):
- 90-100: Official documentation, peer-reviewed papers, authoritative sources
- 70-89: Expert blogs, reputable tech publications, conference talks
- 50-69: General news, professional community content
- 30-49: Forums, Stack Overflow, community Q&A
- 0-29: Social media, unverified sources

Evidence Quality Score (0-100):
- 90-100: Primary evidence (direct measurements, official specs, original research)
- 60-89: Secondary evidence (citing primary sources, summaries of research)
- 30-59: Tertiary evidence (aggregated information, encyclopedia-style)
- 0-29: Anecdotal (personal experience, hearsay, speculation)

Corroboration Score (0-100):
- 90-100: 5+ independent sources confirm this
- 70-89: 3-4 independent sources
- 40-69: 2 sources
- 0-39: Single source or no corroboration

Recency Score (0-100):
- 90-100: Published within last 3 months
- 70-89: Published within last year
- 50-69: Published within last 2 years
- 30-49: Published within last 5 years
- 0-29: Older than 5 years or unknown date

Expert Consensus Score (0-100):
- 90-100: Broad expert agreement, established best practice
- 60-89: Majority expert support with some debate
- 30-59: Mixed or limited expert opinion
- 0-29: Controversial or no expert commentary

IMPORTANT:
- Extract 5-15 distinct findings from the search results
- Each finding should have at least 1 source (prefer 3+ for high confidence)
- Be honest about confidence levels - don't inflate scores
- Include the narrativeSummary for human-readable output`;

  console.log(`[buildSynthesisPrompt] Exit - prompt length: ${prompt.length} chars`);
  return prompt;
}

/**
 * Build review prompt with context
 *
 * Generates prompt for coverage assessment including confidence analysis.
 * Reviewer evaluates cumulative research quality and confidence distribution.
 */
export function buildReviewPrompt(
  context: ResearchContext,
  synthesis: string
): string {
  console.log(`[buildReviewPrompt] Entry - topic: "${context.topic}", synthesis length: ${synthesis.length}, iterations completed: ${context.previousIterations.length + 1}`);

  const prompt = `Review the following research synthesis and assess its coverage and confidence quality.

Research Synthesis:
${synthesis}

Original Topic: ${context.topic}

Iterations Completed: ${context.previousIterations.length + 1}

Provide your assessment in JSON format:
{
  "coverageScore": number (1-5 scale),
  "gaps": string[] (list of identified gaps),
  "feedback": string (detailed feedback),
  "shouldContinue": boolean,
  "confidenceAssessment": {
    "overallConfidenceLevel": "HIGH" | "MEDIUM" | "LOW",
    "highConfidenceClaimCount": number,
    "lowConfidenceClaimIds": string[] (claims that need more sources),
    "confidenceImprovement": string (suggestions to improve confidence),
    "multiSourceCoverage": number (percentage of claims with 3+ sources)
  }
}

COVERAGE SCORING (1-5):
1 = minimal (single source, major gaps)
2 = basic (few sources, obvious gaps)
3 = adequate (multiple sources, some gaps)
4 = comprehensive (thorough coverage, minor gaps)
5 = complete (exhaustive, no significant gaps)

CONFIDENCE QUALITY CRITERIA:
- HIGH confidence claims should have 3+ independent authoritative sources
- MEDIUM confidence claims need caveats about limitations
- LOW confidence claims should be flagged for additional research
- Overall quality depends on proportion of HIGH confidence claims

CONTINUE DECISION:
Set shouldContinue to TRUE if ANY of these conditions are met:
- Coverage score < 4
- Overall confidence level is LOW
- More than 50% of claims have LOW confidence
- Critical gaps exist in authoritative source coverage

Be strict - only score 4+ when truly comprehensive with authoritative sources and multiple perspectives.
Flag any claims that rely on single sources or have credibility concerns.`;

  console.log(`[buildReviewPrompt] Exit - prompt length: ${prompt.length} chars`);
  return prompt;
}
