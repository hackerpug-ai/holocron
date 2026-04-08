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
import type { ResearchMode } from "./intent";
import { getSearchFocusInstructions, getSynthesisInstructions, getReportStructure } from "./mode_prompts";

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
  previousSessions?: Array<{
    sessionId: string;
    topic: string;
    summary: string;
  }>;
}

/**
 * Build research context from database
 *
 * Retrieves session and all previous iterations to provide
 * full context for LLM calls without agent threads.
 * Now includes context from previous sessions in the same conversation.
 */
export async function buildResearchContext(
  ctx: GenericActionCtx<any>,
  sessionId: Id<"deepResearchSessions">
): Promise<ResearchContext> {
  const { api } = await import("../_generated/api");

  const session = await ctx.runQuery(
    api.research.queries.getDeepResearchSession,
    { sessionId }
  );

  if (!session) {
    console.error(`[buildResearchContext] Session not found: ${sessionId}`);
    throw new Error(`Session ${sessionId} not found`);
  }

  

  const iterations = await ctx.runQuery(
    api.research.queries.listDeepResearchIterations,
    { sessionId }
  );


  // Fetch previous sessions from the same conversation for context
  let previousSessions: Array<{
    sessionId: string;
    topic: string;
    summary: string;
  }> = [];

  if (session.conversationId) {
    const completedSessions = await ctx.runQuery(
      api.research.queries.getByConversation,
      { conversationId: session.conversationId as Id<"conversations"> }
    );

    // Filter out the current session and limit to last 5
    previousSessions = completedSessions
      .filter((s: any) => s._id.toString() !== sessionId.toString())
      .slice(-5)
      .map((s: any) => ({
        sessionId: s._id.toString(),
        topic: s.topic,
        summary: `Previous research on: ${s.topic}`,
      }));

  }

  const context = {
    topic: session.topic,
    previousIterations: iterations.map((it: any) => ({
      iteration: it.iterationNumber,
      findings: it.findings ?? "",
      coverageScore: it.coverageScore ?? 0,
      gaps: (it.refinedQueries as string[]) ?? [],
    })),
    previousSessions,
  };

  return context;
}

/**
 * Build search prompt with context
 *
 * Generates prompt for search planning and execution.
 * Includes previous iteration context to avoid duplication.
 * Now includes context from previous sessions in the same conversation.
 */
export function buildSearchPrompt(
  topic: string,
  previousIterations: ResearchContext["previousIterations"],
  previousSessions?: ResearchContext["previousSessions"],
  mode?: ResearchMode
): string {

  const previousSessionsSection = previousSessions && previousSessions.length > 0
    ? `
Previous Research Sessions in Conversation:
${previousSessions.map((session, idx) =>
  `${idx + 1}. "${session.topic}"
${session.summary}`
).join("\n\n")}

Build upon these previous findings to provide a comprehensive answer.
`
    : "";

  const iterationContextSection = previousIterations.length > 0
    ? `
Current Session Progress (${previousIterations.length} iterations):
${previousIterations.map(it =>
  `Iteration ${it.iteration} (score: ${it.coverageScore}/5):
${it.findings}
Gaps identified: ${it.gaps.join(", ")}`
).join("\n\n")}

Focus on NEW information that complements previous research.
`
    : "";

  const contextSection = previousSessionsSection + iterationContextSection;
  const searchFocus = mode ? `\nSEARCH FOCUS:\n${getSearchFocusInstructions(mode)}\n` : "";

  const prompt = `Research the following topic: "${topic}"

${contextSection}${searchFocus}
Your task:
1. Generate 3-5 focused search queries that cover different aspects of this topic
2. Execute searches using the available tools:
   - exaSearch: for technical content, academic papers, research
   - jinaSearch: for general web search, diverse sources
   - jinaSiteSearch: for searching within specific domains (e.g., documentation sites, company websites)
   - jinaReader: for deep article reading and full content extraction
3. Extract key findings with proper citations in [Title](URL) format

Be thorough and systematic. Use multiple search queries to gather comprehensive information.`;

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
  searchFindings: string,
  mode?: ResearchMode
): string {

  const previousContext = context.previousIterations.length > 0
    ? `
Previous Research (${context.previousIterations.length} iterations):
${context.previousIterations.map(it =>
  `Iteration ${it.iteration}: ${it.findings}`
).join("\n\n")}

Build on this foundation - do NOT simply repeat what was already found.
`
    : "";

  const modeGuidance = mode ? `\n${getSynthesisInstructions(mode)}\n` : "";

  // Truncate findings to avoid context window overflow with deep-read content
  const MAX_FINDINGS_LENGTH = 80000;
  const truncatedFindings = searchFindings.length > MAX_FINDINGS_LENGTH
    ? searchFindings.slice(0, MAX_FINDINGS_LENGTH) + "\n\n[Truncated - additional sources available]"
    : searchFindings;

  const prompt = `Synthesize research findings into a structured JSON format with confidence scoring.

Topic: ${context.topic}
${modeGuidance}
Latest Search Findings:
${truncatedFindings}

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

  return prompt;
}

/**
 * Build final synthesis prompt for document creation
 *
 * Synthesizes all iteration findings into a cohesive markdown report
 * matching the local skill format with YAML frontmatter.
 */
export function buildFinalSynthesisPrompt(
  topic: string,
  iterations: Array<{
    iterationNumber: number;
    findings: string;
    coverageScore?: number;
    summary?: string;
  }>,
  mode?: ResearchMode
): string {

  const iterationContent = iterations
    .filter(it => it.findings)
    .map(it => `### Iteration ${it.iterationNumber}${it.summary ? `: ${it.summary}` : ''}
Coverage Score: ${it.coverageScore ?? 'N/A'}/5

${it.findings}`)
    .join('\n\n---\n\n');

  // Calculate overall confidence from coverage scores
  const avgCoverage = iterations.reduce((sum, it) => sum + (it.coverageScore ?? 0), 0) / iterations.length;
  const overallConfidence = avgCoverage >= 4 ? "HIGH" : avgCoverage >= 3 ? "MEDIUM" : "LOW";
  const totalSources = iterations.length; // Approximate source count

  // Generate tags from topic
  const topicWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const tags = topicWords.slice(0, 5).join(", ");

  const reportStructure = mode
    ? getReportStructure(mode)
    : `## Executive Summary
Write 3-5 sentences that directly answer the research question based on all findings. Include:
- The main conclusion or answer
- Key supporting points
- Any important caveats or limitations

## Key Findings

Organize findings into logical themes (create 3-6 theme headings). For each finding under a theme:
- **{Finding statement}** (Confidence: {HIGH/MEDIUM/LOW}, {n} sources)
  - 1-2 sentence explanation with context
  - Sources: [{Title}]({URL}), [{Title}]({URL})

Extract confidence levels and source counts from the iteration data. Group related findings under meaningful theme headings.

## Confidence Summary

| Finding | Confidence | Sources |
|---------|------------|---------|
| {finding summary} | {HIGH/MEDIUM/LOW} | {count} |

Create a table summarizing 5-10 key findings with their confidence levels and source counts.

## Sources

### Authoritative Sources
List official documentation, peer-reviewed papers, and primary sources:
[1] {Title} - {URL}
[2] {Title} - {URL}

### Expert Sources
List expert blog posts, conference talks, and industry analysis:
[1] {Title} - {URL}
[2] {Title} - {URL}

### Community Sources
List forums, Q&A sites, and community discussions (if relevant):
[1] {Title} - {URL}

## Gaps & Open Questions
Identify:
- Unanswered questions from the research
- Conflicting information that needs resolution
- Suggested follow-up research topics`;

  const modeLabel = mode ? ` [${mode}]` : "";

  const prompt = `Synthesize the following research iterations into a comprehensive, well-structured markdown report.

**Research Topic:** ${topic}

**Research Iterations:**
${iterationContent}

**Your Task:**
Create a cohesive research report in markdown format with YAML frontmatter and the following structure:

---
title: "${topic} - Research Report"
date: "${new Date().toISOString().split('T')[0]}"
time: "${new Date().toTimeString().slice(0, 5)}"
category: "research"
tags: [${tags}]
status: "complete"
research_type: "deep_research${modeLabel}"
iterations: ${iterations.length}
sources_consulted: ${totalSources}
confidence: "${overallConfidence}"
method: "deep-research"
---

# ${topic}

${reportStructure}

## Methodology

This report uses a 5-factor confidence scoring algorithm:

1. **Source Credibility** (25%): Quality and authority of information sources
2. **Evidence Quality** (25%): Directness of evidence (primary vs. anecdotal)
3. **Corroboration** (25%): Number of independent sources confirming claims
4. **Recency** (15%): How current the information is
5. **Expert Consensus** (10%): Agreement among domain experts

**Confidence Levels:**
- 🟢 **HIGH** (80-100): 3+ authoritative sources, strong corroboration
- 🟡 **MEDIUM** (50-79): Some support but room for verification
- 🔴 **LOW** (0-49): Limited support, exercise caution

**Guidelines:**
- Write in clear, professional prose - NOT bullet point dumps
- Connect findings across iterations into a coherent narrative
- Preserve ALL citations in [Title](URL) format from source material
- Be honest about confidence levels - include caveats for MEDIUM, warnings for LOW
- Extract actual confidence scores from the synthesis data when available
- Group findings by theme with clear headings
- Target 800-1500 words for the full report`;

  return prompt;
}

/**
 * URL Content for single-pass synthesis
 */
export interface UrlContent {
  url: string;
  title?: string;
  content: string;
}

/**
 * Build single-pass synthesis prompt for deep research
 *
 * This is a simplified synthesis that:
 * - Takes full URL content (not 500-char snippets)
 * - Produces a clean markdown report
 * - Uses simplified confidence scoring (3+ sources = HIGH, 2 = MEDIUM, 1 = LOW)
 *
 * @param topic - Research topic
 * @param urlContents - Full content from read URLs
 * @param searchSnippets - Fallback snippets from search results
 * @returns Synthesis prompt for gpt-5.4
 */
export function buildSinglePassSynthesisPrompt(
  topic: string,
  urlContents: UrlContent[],
  searchSnippets: string,
  mode?: ResearchMode
): string {
  

  // Build URL content sections
  const urlContentSections = urlContents
    .filter((u) => u.content.length > 100) // Only include substantial content
    .map(
      (u, i) => `
### Source ${i + 1}: ${u.title || "Untitled"}
URL: ${u.url}

${u.content}
`
    )
    .join("\n---\n");

  const hasFullContent = urlContents.filter((u) => u.content.length > 100).length > 0;

  // Generate current date for frontmatter
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().slice(0, 5);

  // Generate tags from topic
  const topicWords = topic
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const tags = topicWords.slice(0, 5).join(", ");

  const reportBody = mode
    ? getReportStructure(mode)
    : `## Executive Summary
Write 3-5 sentences that directly answer the research question. Include:
- The main conclusion or answer
- Key supporting points (1-2)
- Any important caveats

## Key Findings

Organize findings into 3-6 logical themes. For each finding:

### Theme Name

**Finding statement** (Confidence: HIGH/MEDIUM/LOW)

1-2 sentence explanation with context.

Sources: [Source Title](URL), [Source Title](URL)

## Sources

List all sources used in the research:
1. [Title](URL) - Brief description of what it contributed
2. [Title](URL) - Brief description`;

  const modeLabel = mode ? ` [${mode}]` : "";
  const modeGuidance = mode ? `\n${getSynthesisInstructions(mode)}\n` : "";

  const prompt = `You are a research synthesis expert. Synthesize the following research materials into a comprehensive markdown report.

**Research Topic:** ${topic}
${modeGuidance}
${hasFullContent ? `## Full Source Content
${urlContentSections}` : ""}

## Search Result Snippets
${searchSnippets}

**Your Task:**
Create a comprehensive research report in markdown format with YAML frontmatter.

**IMPORTANT FORMAT REQUIREMENTS:**
Return ONLY the markdown report. Do NOT wrap in code blocks. Start directly with the YAML frontmatter.

---
title: "${topic}"
date: "${dateStr}"
time: "${timeStr}"
category: "research"
tags: [${tags}]
status: "complete"
research_type: "single_pass${modeLabel}"
sources_consulted: ${urlContents.length}
confidence: "PENDING"
method: "single-pass-deep-research"
---

# ${topic}

${reportBody}

## Confidence Assessment

Summarize overall confidence:
- **Overall Confidence:** HIGH / MEDIUM / LOW
- **Well-supported areas:** List findings with 3+ sources
- **Areas needing more research:** List findings with only 1-2 sources

**CONFIDENCE SCORING:**
- **HIGH**: 3+ independent sources corroborate the finding
- **MEDIUM**: 2 sources, or 1 authoritative source
- **LOW**: Single non-authoritative source or speculation

**Guidelines:**
- Write in clear, professional prose
- Preserve ALL citations in [Title](URL) format
- Be honest about confidence levels
- Target 600-1200 words for the full report
- Do NOT use code blocks around the output`;


  return prompt;
}

/**
 * Build a ReAct-style reasoning prompt for research loop gap refinement.
 *
 * Used between iterations to produce a targeted follow-up query grounded in
 * what was actually found, rather than heuristically concatenating gap labels.
 *
 * @param topic - Original research topic
 * @param gaps - Gap labels identified in the review step
 * @param keyFindings - Recent finding claims (for grounding the reasoning)
 * @param iteration - Current iteration number
 * @returns Prompt for a zaiFlash call that returns JSON with refinedQuery
 */
export function buildGapReasoningPrompt(
  topic: string,
  gaps: string[],
  keyFindings: string[],
  iteration: number,
): string {
  const findingsText = keyFindings.length > 0
    ? keyFindings.slice(0, 5).map((f, i) => `${i + 1}. ${f}`).join("\n")
    : "(no findings yet)";

  const gapsText = gaps.map((g, i) => `${i + 1}. ${g}`).join("\n");

  return `You are refining a research query based on what was found and what is still missing.

Topic: ${topic}
Iteration: ${iteration}

Key findings so far:
${findingsText}

Identified gaps:
${gapsText}

Return JSON only (no markdown, no explanation):
{
  "thought": "One sentence: what the findings cover and what is genuinely missing",
  "refinedQuery": "A specific search query under 100 characters targeting the most important gap",
  "rationale": "Why this query will fill the gap"
}`;
}
