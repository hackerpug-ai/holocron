/**
 * Mode-Specific Prompt Fragments
 *
 * Provides prompt fragments that adapt research output based on intent mode.
 * These plug into three injection points:
 * 1. Variant/domain generation — what angles to search
 * 2. Synthesis — what kinds of findings to extract
 * 3. Report structure — how to organize the final output
 */

import type { ResearchMode } from "./intent";

/**
 * Instructions for query variant / domain generation.
 * Replaces the hardcoded "Technical/Academic/Industry/Trends" decomposition.
 */
export function getVariantInstructions(mode: ResearchMode): string {
  switch (mode) {
    case "ACTIONABLE":
      return `Each variant should focus on PRACTICAL IMPLEMENTATION:
1. Implementation guides, tutorials, code examples, and architecture patterns
2. Real-world case studies, production lessons learned, and common pitfalls
3. Tools, frameworks, libraries, and starter templates for getting started

Do NOT generate market overview, trend analysis, or industry landscape queries. The user wants to BUILD something, not read about market size.`;

    case "OVERVIEW":
      return `Each variant should cover the LANDSCAPE:
1. Market context, key players, major developments, and industry adoption
2. Recent trends, emerging patterns, and future trajectory
3. Statistics, benchmarks, analyst reports, and expert forecasts

Focus on breadth over depth. Include market data, adoption metrics, and directional trends.`;

    case "COMPARATIVE":
      return `Each variant should support COMPARISON:
1. Feature-by-feature comparison, capabilities, and limitations of each option
2. Performance benchmarks, real-world trade-offs, and decision criteria
3. Community sentiment, adoption patterns, and migration/switching considerations

Each variant should cover all options being compared, not just one side.`;

    case "EXPLORATORY":
      return `Each variant should explore a DIFFERENT ANGLE:
1. Technical/implementation perspective — how different approaches work
2. Practical/applied perspective — real-world usage and case studies
3. Critical/evaluative perspective — trade-offs, limitations, and risks

Aim for breadth to discover diverse approaches before the user narrows down.`;
  }
}

/**
 * Instructions for search query generation.
 * Guides what kind of sources and content to prioritize.
 */
export function getSearchFocusInstructions(mode: ResearchMode): string {
  switch (mode) {
    case "ACTIONABLE":
      return `Focus searches on implementation guides, code examples, architecture documentation, and technical blog posts with working examples. Prioritize sources that show HOW to do something, not just WHAT exists. Official documentation, GitHub repos, and technical tutorials are highest value.`;

    case "OVERVIEW":
      return `Focus searches on market reports, analyst commentary, industry news, trend analyses, and expert forecasts. Prioritize sources that show the big picture — adoption data, market size, key players, and directional trends.`;

    case "COMPARATIVE":
      return `Focus searches on comparison articles, benchmark reports, migration guides, and decision frameworks. Prioritize sources that evaluate multiple options side-by-side with concrete criteria.`;

    case "EXPLORATORY":
      return `Focus searches on diverse approaches, survey articles, categorization frameworks, and overview guides. Prioritize sources that catalog multiple methods or solutions with pros/cons for each.`;
  }
}

/**
 * Instructions for synthesis — what kinds of findings to extract and how to frame them.
 */
export function getSynthesisInstructions(mode: ResearchMode): string {
  switch (mode) {
    case "ACTIONABLE":
      return `SYNTHESIS MODE: ACTIONABLE

Extract CONCRETE, IMPLEMENTABLE findings. For each finding:
- Name the specific pattern, technique, or approach
- Describe WHEN to use it (use case, preconditions)
- Explain HOW to implement it (steps, architecture decisions, key code patterns)
- Include code examples, pseudocode, or configuration snippets where available
- Note common pitfalls or mistakes to avoid

AVOID generic observations like market size, industry trends, or "X is growing in popularity". Every finding should be something the reader can ACT ON.`;

    case "OVERVIEW":
      return `SYNTHESIS MODE: OVERVIEW

Extract LANDSCAPE-LEVEL findings. For each finding:
- Describe the trend, development, or market signal
- Quantify with data where available (market size, adoption %, growth rate)
- Name key players, products, or organizations involved
- Note the trajectory — where is this heading?

Statistics, forecasts, and market context are valuable here. Paint the big picture.`;

    case "COMPARATIVE":
      return `SYNTHESIS MODE: COMPARATIVE

Extract EVALUATION-ORIENTED findings. For each finding:
- Clearly state which option(s) it applies to
- Describe the specific advantage, disadvantage, or trade-off
- Include concrete metrics or benchmarks where available
- Note the CONDITIONS under which each option excels or struggles

Frame findings as decision-relevant information. Help the reader CHOOSE, not just learn.`;

    case "EXPLORATORY":
      return `SYNTHESIS MODE: EXPLORATORY

Extract CATEGORIZED findings. For each finding:
- Name the approach, method, or solution category
- Describe how it works at a high level
- List key pros and cons
- Note when/where it's most applicable

Organize by approach category. Help the reader understand the SPACE of options before narrowing down.`;
  }
}

/**
 * Report structure template for final synthesis.
 * Replaces the hardcoded "Key Findings by theme" structure.
 */
export function getReportStructure(mode: ResearchMode): string {
  switch (mode) {
    case "ACTIONABLE":
      return `## Executive Summary
Write 3-5 sentences that directly answer HOW to accomplish what was asked. Lead with the recommended approach.

## Implementation Patterns

For each pattern or approach discovered:

### {Pattern Name}
- **When to use**: Specific conditions or use cases
- **How it works**: Architecture or workflow description
- **Key decisions**: Important choices and trade-offs
- **Example**: Code snippet, configuration, or pseudocode (if available)
- **Pitfalls**: Common mistakes to avoid

## Architecture Recommendations
Synthesize patterns into a recommended architecture or approach. Include:
- Component relationships and data flow
- Technology choices with rationale
- Scaling considerations

## Getting Started
Step-by-step guide to begin implementation:
1. First step with specifics
2. Second step...
(3-7 concrete steps)

## Sources
Categorized source list with [Title](URL) format`;

    case "OVERVIEW":
      return `## Executive Summary
Write 3-5 sentences capturing the current state and trajectory. Include key numbers.

## Key Findings

Organize findings into logical themes (3-6 theme headings). For each finding:
- **{Finding statement}** (Confidence: {HIGH/MEDIUM/LOW}, {n} sources)
  - 1-2 sentence explanation with context
  - Sources: [{Title}]({URL}), [{Title}]({URL})

## Market Context
Key players, adoption data, market size, and competitive landscape.

## Trends & Outlook
Where things are heading — emerging patterns, predictions, and signals.

## Confidence Summary

| Finding | Confidence | Sources |
|---------|------------|---------|
| {finding summary} | {HIGH/MEDIUM/LOW} | {count} |

## Sources
Categorized source list with [Title](URL) format`;

    case "COMPARATIVE":
      return `## Executive Summary
Write 3-5 sentences with a clear recommendation or decision framework. State the winner for specific contexts.

## Comparison Overview

| Criteria | {Option A} | {Option B} | ... |
|----------|-----------|-----------|-----|
| {criterion} | {assessment} | {assessment} | ... |

## Detailed Analysis

### {Criterion 1}: {What's being compared}
- **{Option A}**: Specific strengths/weaknesses with evidence
- **{Option B}**: Specific strengths/weaknesses with evidence
- **Verdict**: Which wins and why

(Repeat for each major criterion)

## Decision Framework
When to choose each option:
- Choose {A} when: {specific conditions}
- Choose {B} when: {specific conditions}

## Sources
Categorized source list with [Title](URL) format`;

    case "EXPLORATORY":
      return `## Executive Summary
Write 3-5 sentences summarizing the landscape of approaches discovered. Note which are most promising.

## Approaches Discovered

### {Approach Category 1}
- **Description**: How this approach works
- **Best for**: Use cases where it excels
- **Pros**: Key advantages
- **Cons**: Key limitations
- **Examples**: Real-world implementations or tools
- Sources: [{Title}]({URL})

(Repeat for each approach category — aim for 3-7 categories)

## Comparison Matrix

| Approach | Complexity | Maturity | Best For |
|----------|-----------|----------|----------|
| {approach} | {low/med/high} | {emerging/mature/legacy} | {use case} |

## Recommendations
Based on the exploration, suggest next steps:
- For {scenario A}: consider {approach}
- For {scenario B}: consider {approach}

## Sources
Categorized source list with [Title](URL) format`;
  }
}

/**
 * Get mode-aware fallback variants when LLM variant generation fails.
 */
export function getFallbackVariants(
  topic: string,
  mode: ResearchMode
): Array<{ query: string; focus: string; rationale: string }> {
  switch (mode) {
    case "ACTIONABLE":
      return [
        {
          query: `${topic} implementation guide tutorial example code`,
          focus: "Implementation guidance",
          rationale: "How-to and practical implementation",
        },
        {
          query: `${topic} architecture patterns design decisions best practices`,
          focus: "Architecture patterns",
          rationale: "Design decisions and proven patterns",
        },
        {
          query: `${topic} production case study lessons learned pitfalls`,
          focus: "Real-world experience",
          rationale: "Practical lessons from production use",
        },
      ];

    case "OVERVIEW":
      return [
        {
          query: `${topic} market landscape key players adoption`,
          focus: "Market landscape",
          rationale: "Industry context and major players",
        },
        {
          query: `${topic} trends developments 2024 2025`,
          focus: "Recent trends",
          rationale: "Latest developments and trajectory",
        },
        {
          query: `${topic} statistics data market size growth`,
          focus: "Data and metrics",
          rationale: "Quantitative market intelligence",
        },
      ];

    case "COMPARATIVE":
      return [
        {
          query: `${topic} comparison benchmark features`,
          focus: "Feature comparison",
          rationale: "Side-by-side feature analysis",
        },
        {
          query: `${topic} pros cons trade-offs when to use`,
          focus: "Trade-off analysis",
          rationale: "Decision criteria and trade-offs",
        },
        {
          query: `${topic} migration switching real-world experience`,
          focus: "Practical experience",
          rationale: "Real-world switching/adoption stories",
        },
      ];

    case "EXPLORATORY":
    default:
      return [
        {
          query: `${topic} approaches methods techniques`,
          focus: "Approach discovery",
          rationale: "Broad survey of available methods",
        },
        {
          query: `${topic} use cases applications real-world`,
          focus: "Applications",
          rationale: "How approaches are applied in practice",
        },
        {
          query: `${topic} evaluation criteria trade-offs limitations`,
          focus: "Critical evaluation",
          rationale: "Understanding limitations and trade-offs",
        },
      ];
  }
}
