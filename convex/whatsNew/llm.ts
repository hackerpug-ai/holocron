/**
 * What's New LLM Synthesis
 *
 * Two-pass LLM synthesis with static fallback for reliable report generation.
 * - Pass 1: Generate initial synthesis from findings
 * - Pass 2: Refine and improve the synthesis
 * - Static Fallback: Template-based report when LLM unavailable
 */

"use node";

import { generateText } from "ai";
import { zaiPro } from "../lib/ai/zai_provider";

// ============================================================================
// Types
// ============================================================================

interface Finding {
  title: string;
  url: string;
  source: string;
  category: "discovery" | "release" | "trend" | "discussion";
  score?: number;
  summary?: string;
  publishedAt?: string;
  engagementVelocity?: number;
  crossSourceCorroboration?: number;
  author?: string;
  tags?: string[];
  metadataJson?: any;
  qualityScore?: number;
  qualityReason?: string;
  upvotes?: number;
  commentCount?: number;
}

interface ToolSuggestion {
  id: string;
  title: string;
  description: string;
  category: "libraries" | "cli" | "framework" | "service" | "database" | "tool";
  sourceUrl: string;
  sourceType: "github" | "npm" | "pypi" | "website" | "cargo" | "go" | "other";
  language?: string;
  tags: string[];
  useCases: string[];
}

interface SynthesisResult {
  markdown: string;
  method: "llm-two-pass" | "static-fallback";
  pass1Content?: string;
  error?: string;
  toolSuggestions?: ToolSuggestion[];
}

// ============================================================================
// Pass 1: Initial Synthesis
// ============================================================================

/**
 * Generate initial synthesis from raw findings
 *
 * This pass:
 * - Groups findings by category
 * - Identifies top stories by engagement
 * - Creates structured report outline
 * - Extracts key themes and connections
 */
async function generateInitialSynthesis(
  findings: Finding[],
  days: number,
  periodStart: Date,
  periodEnd: Date
): Promise<string> {
  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  // Categorize findings for the prompt
  const discoveries = findings.filter((f) => f.category === "discovery");
  const releases = findings.filter((f) => f.category === "release");
  const discussions = findings.filter((f) => f.category === "discussion");
  const trends = findings.filter((f) => f.category === "trend");

  // Sort ALL findings by score — no slice, send everything to the LLM
  const sortedFindings = [...findings].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // Enrich the JSON with all available metadata for better synthesis
  const findingsJson = JSON.stringify(
    sortedFindings.map((f) => ({
      title: f.title,
      url: f.url,
      source: f.source,
      category: f.category,
      score: f.score,
      summary: f.summary,
      crossSourceCorroboration: f.crossSourceCorroboration,
      engagementVelocity: f.engagementVelocity,
      qualityScore: f.qualityScore,
      upvotes: f.upvotes,
      commentCount: f.commentCount,
    })),
    null,
    2
  );

  const period =
    days === 1
      ? formatDate(periodStart)
      : `${formatDate(periodStart)} to ${formatDate(periodEnd)}`;

  const prompt = `You are a knowledgeable AI engineering peer writing a daily "What's New in AI Engineering" briefing for a senior AI engineer. Write with authority and editorial insight — not as a news aggregator, but as someone who understands why these developments matter.

**Period:** ${period} (${days} day${days !== 1 ? "s" : ""})
**Total Findings:** ${findings.length} (${discoveries.length} discoveries, ${releases.length} releases, ${discussions.length} discussions, ${trends.length} trends)
**Report Date:** ${formatDate(periodEnd)}

**All Findings (sorted by score):**
\`\`\`json
${findingsJson}
\`\`\`

**CROSS-SOURCE BOOSTING:** Items with \`crossSourceCorroboration >= 2\` appeared on multiple independent sources — these are the most significant stories and MUST appear in the TL;DR or Headline Releases sections.

**EDITORIAL VOICE:** For TL;DR items, don't just state what happened — explain WHY it matters to a working AI engineer and link directly to the source. Example: "Claude Code source code leaked via .map file — community is dissecting Anthropic's internal safety architecture and agent loop design. [Read more](https://...)"

**Required Output Format (follow EXACTLY — including heading levels and table syntax):**

# What's New in AI Engineering
{Period label} | {total} findings | {discoveries} discoveries | {releases} releases

**Date**: {YYYY-MM-DD} | **Type**: whats-new
---

## TL;DR
1. {Most important finding with inline [link](url) — 1-2 sentences on WHY it matters}
2. {Second most important with inline [link](url)}
3. {Third most important with inline [link](url)}

## Headline Releases

| Product       | What Shipped                  | Link        |
|---------------|-------------------------------|-------------|
| {name}        | {one-line description}        | [Link]({url}) |

## New Tools & Discoveries

| Tool          | What It Does                  | Category    |
|---------------|-------------------------------|-------------|
| [{name}]({url}) | {one-line description}      | {category}  |

## Community Pulse
- {Hot take or notable discussion from Reddit/HN — include subreddit, point count, and what the sentiment IS}
- {Emerging sentiment or debate — editorial take, not just a link}

## Trends to Watch
- **{Trend name}**: {2-3 sentences on why it's forming, who's involved, specific examples from findings}

## Recommended Subscriptions
\`\`\`
/subscribe add github {repo}
/subscribe add reddit r/{subreddit}
\`\`\`

---
Sources: {N} across {track count} tracks

**Section guidelines:**
- **TL;DR**: Top 3 items across ALL categories. Every item must have an inline markdown link. Bias toward cross-source corroborated items. Instant value — reader should understand the period from just this section.
- **Headline Releases**: 4-10 most significant product releases. Use standard markdown pipe tables (not ASCII box-drawing). Each row gets a [Link](url) in the Link column.
- **New Tools & Discoveries**: ALL GitHub repos and new tool discoveries. Name column should be a markdown link [name](url). Category column: one of: library, CLI, framework, service, model, dataset, paper.
- **Community Pulse**: Bullet points — each bullet is an editorial take on what the community IS saying/feeling, not just a link. Reference specific subreddits, point counts where available.
- **Trends to Watch**: 2-5 forward-looking patterns. Bold the trend name. Be specific with examples from the findings.
- **Recommended Subscriptions**: Only suggest sources that appeared in this report's findings. Copy-pasteable /subscribe commands only.
- **Sources footer**: Count total findings and unique source tracks (e.g., "42 across 8 tracks").
- Use proper markdown heading syntax (# ## ###) exactly as shown.
- Include all URLs as inline markdown links [text](url).`;

  try {
    const result = await generateText({
      model: zaiPro(),
      prompt,
    });

    return result.text;
  } catch (error) {
    console.error("[Pass 1] LLM synthesis failed:", error);
    throw error;
  }
}

// ============================================================================
// Pass 2: Refinement
// ============================================================================

/**
 * Refine and improve the initial synthesis
 *
 * This pass:
 * - Improves writing quality and clarity
 * - Adds insights and connections
 * - Formats the final report
 * - Ensures consistency and completeness
 */
async function refineSynthesis(
  initialSynthesis: string,
  findings: Finding[],
  days: number,
  periodStart: Date,
  periodEnd: Date
): Promise<string> {
  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  // Calculate source breakdown
  const sourceCounts = findings.reduce(
    (acc, f) => {
      acc[f.source] = (acc[f.source] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const sourceBreakdown = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => `${source}: ${count}`)
    .join(" · ");

  const period =
    days === 1
      ? formatDate(periodStart)
      : `${formatDate(periodStart)} to ${formatDate(periodEnd)}`;

  const prompt = `You are refining a daily "What's New in AI Engineering" report. Your job is editorial polish — improve writing quality, strengthen the narrative, and enforce the required structure.

**Period:** ${period} (${days} day${days !== 1 ? "s" : ""})
**Total Findings:** ${findings.length}
**Sources:** ${sourceBreakdown}

**Initial Synthesis:**
\`\`\`
${initialSynthesis}
\`\`\`

**Required Final Structure (enforce exactly):**

# What's New in AI Engineering
{Period label} | {total} findings | {discoveries} discoveries | {releases} releases

**Date**: {YYYY-MM-DD} | **Type**: whats-new
---

## TL;DR
1. {Most important finding with inline [link](url) — 1-2 sentences on WHY it matters}
2. {Second most important with inline [link](url)}
3. {Third most important with inline [link](url)}

## Headline Releases

| Product       | What Shipped                  | Link        |
|---------------|-------------------------------|-------------|
| {name}        | {one-line description}        | [Link]({url}) |

## New Tools & Discoveries

| Tool          | What It Does                  | Category    |
|---------------|-------------------------------|-------------|
| [{name}]({url}) | {one-line description}      | {category}  |

## Community Pulse
- {Hot take or notable discussion — include subreddit, point count, and what the sentiment IS}
- {Emerging sentiment or debate — editorial take, not just a link}

## Trends to Watch
- **{Trend name}**: {Why it's forming, who's involved, specific examples}

## Recommended Subscriptions
\`\`\`
/subscribe add github {repo}
/subscribe add reddit r/{subreddit}
\`\`\`

---
Sources: {N} across {track count} tracks

**Refinement checklist — fix each issue in the initial synthesis:**
1. **H1 title**: Must be "# What's New in AI Engineering" — fix if different.
2. **Subtitle line**: "{period} | {N} findings | {N} discoveries | {N} releases" — fill in real numbers.
3. **Metadata line**: Must be "**Date**: {YYYY-MM-DD} | **Type**: whats-new" followed by "---".
4. **TL;DR section**: Exactly "## TL;DR". Must have at minimum 3 numbered items. Every item must have an inline markdown [link](url). Each item explains WHY it matters, not just WHAT happened.
5. **Headline Releases**: "## Headline Releases" — standard markdown pipe table with columns: Product, What Shipped, Link. Link column uses [Link](url). 4-10 rows.
6. **New Tools & Discoveries**: "## New Tools & Discoveries" — standard markdown pipe table with columns: Tool, What It Does, Category. Tool column uses [name](url) links. Include all GitHub repos and tool discoveries.
7. **Community Pulse**: "## Community Pulse" — bullet list. Each bullet is an editorial take on what the community IS saying/feeling. Mention subreddits and point counts where available. Not just links.
8. **Trends to Watch**: "## Trends to Watch" — bullet list. Bold the trend name. 2-3 sentences each with specific examples.
9. **Recommended Subscriptions**: "## Recommended Subscriptions" — fenced code block containing /subscribe commands. Only sources that appeared in the findings.
10. **Footer**: "---" then "Sources: {N} across {track count} tracks".

**Hard rules:**
- Never invent details, URLs, or star counts
- Preserve all links and URLs exactly as they appear in the initial synthesis
- Use proper markdown heading syntax (# ## ###)
- Do NOT use ASCII box-drawing characters (┌─┬─┐) — use standard markdown pipe tables only

**Return the complete refined report.**`;

  try {
    const result = await generateText({
      model: zaiPro(),
      prompt,
    });

    return result.text;
  } catch (error) {
    console.error("[Pass 2] LLM refinement failed:", error);
    throw error;
  }
}

// ============================================================================
// Static Fallback
// ============================================================================

/**
 * Generate a static fallback report when LLM is unavailable
 *
 * This ensures a report is always generated, even when:
 * - LLM API is down
 * - Rate limits are hit
 * - Network issues occur
 * - Timeout happens
 */
function generateStaticFallback(
  findings: Finding[],
  days: number,
  periodStart: Date,
  periodEnd: Date
): string {
  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  const { discoveries, releases, trends, discussions } = {
    discoveries: findings.filter((f) => f.category === "discovery"),
    releases: findings.filter((f) => f.category === "release"),
    trends: findings.filter((f) => f.category === "trend"),
    discussions: findings.filter((f) => f.category === "discussion"),
  };

  // Build source counts for footer and subscription suggestions
  const sourceCounts = findings.reduce(
    (acc, f) => {
      acc[f.source] = (acc[f.source] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Top by score
  const topByScore = (items: Finding[], n: number): Finding[] => {
    return [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, n);
  };

  const period =
    days === 1
      ? formatDate(periodStart)
      : `${formatDate(periodStart)} to ${formatDate(periodEnd)}`;
  const reportDate = formatDate(periodEnd);
  const trackCount = Object.keys(sourceCounts).length;

  // Header
  let markdown = `# What's New in AI Engineering
${period} | ${findings.length} findings | ${discoveries.length} discoveries | ${releases.length} releases

**Date**: ${reportDate} | **Type**: whats-new
---

`;

  // TL;DR — top 3 by score, with links
  const top3 = topByScore(findings, 3);
  markdown += `## TL;DR\n\n`;
  if (top3.length > 0) {
    for (let i = 0; i < top3.length; i++) {
      const item = top3[i];
      const summary = item.summary ? ` — ${item.summary}` : "";
      markdown += `${i + 1}. [${item.title}](${item.url})${summary}\n`;
    }
  } else {
    markdown += `1. No findings available for this period.\n`;
  }
  markdown += "\n";

  // Headline Releases
  if (releases.length > 0) {
    markdown += `## Headline Releases\n\n`;
    markdown += `| Product | What Shipped | Link |\n`;
    markdown += `|---------|--------------|------|\n`;
    for (const item of topByScore(releases, 10)) {
      const desc = item.summary ? item.summary.slice(0, 60) : item.source;
      markdown += `| ${item.title} | ${desc} | [Link](${item.url}) |\n`;
    }
    markdown += "\n";
  }

  // New Tools & Discoveries
  if (discoveries.length > 0) {
    markdown += `## New Tools & Discoveries\n\n`;
    markdown += `| Tool | What It Does | Category |\n`;
    markdown += `|------|--------------|----------|\n`;
    for (const item of topByScore(discoveries, 12)) {
      const desc = item.summary ? item.summary.slice(0, 60) : item.source;
      const cat = item.source === "GitHub" ? "library" : "tool";
      markdown += `| [${item.title}](${item.url}) | ${desc} | ${cat} |\n`;
    }
    markdown += "\n";
  }

  // Community Pulse
  const discussionItems = topByScore(discussions, 5);
  markdown += `## Community Pulse\n\n`;
  if (discussionItems.length > 0) {
    for (const item of discussionItems) {
      const pts = item.score ? ` (${item.score} pts)` : "";
      markdown += `- [${item.title}](${item.url}) — ${item.source}${pts}\n`;
    }
  } else {
    markdown += `- No community discussions surfaced for this period.\n`;
  }
  markdown += "\n";

  // Trends to Watch
  markdown += `## Trends to Watch\n\n`;
  if (trends.length > 0) {
    for (const item of topByScore(trends, 5)) {
      const desc = item.summary ? ` ${item.summary}` : "";
      markdown += `- **${item.title}**:${desc} ([source](${item.url}))\n`;
    }
  } else {
    // Derive trends from top cross-source corroborated items
    const corroborated = findings
      .filter((f) => (f.crossSourceCorroboration ?? 0) >= 2)
      .slice(0, 3);
    if (corroborated.length > 0) {
      for (const item of corroborated) {
        markdown += `- **${item.title}**: Appeared across multiple sources. ([source](${item.url}))\n`;
      }
    } else {
      markdown += `- No trend signals identified for this period.\n`;
    }
  }
  markdown += "\n";

  // Recommended Subscriptions — derive from top sources in findings
  const topSources = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([source]) => source);

  markdown += `## Recommended Subscriptions\n\n`;
  markdown += "```\n";
  for (const source of topSources) {
    if (source.startsWith("r/")) {
      markdown += `/subscribe add reddit ${source}\n`;
    } else if (source === "GitHub") {
      // Pick top GitHub repo
      const topRepo = topByScore(
        findings.filter((f) => f.source === "GitHub"),
        1
      )[0];
      if (topRepo) {
        // Extract "owner/repo" from url if possible
        const match = topRepo.url.match(/github\.com\/([^/]+\/[^/]+)/);
        const repo = match ? match[1] : topRepo.title;
        markdown += `/subscribe add github ${repo}\n`;
      }
    } else {
      markdown += `/subscribe add changelog ${source.toLowerCase().replace(/\s+/g, "-")}\n`;
    }
  }
  markdown += "```\n\n";

  // Footer
  markdown += `---\n`;
  markdown += `Sources: ${findings.length} across ${trackCount} tracks\n`;

  return markdown;
}

// ============================================================================
// Summary Generation
// ============================================================================

/**
 * Generate a 2-3 line summary (80-150 chars) for a finding
 *
 * This function:
 * - Uses LLM to generate concise summaries
 * - Handles failures gracefully (returns undefined, not error)
 * - Enforces 150 character limit with ellipsis
 * - Captures key technical insight for AI engineers
 * - Logs quality metrics for monitoring
 *
 * @param ctx - Action context for running LLM
 * @param finding - Finding to summarize
 * @returns Summary string (80-150 chars) or undefined if generation fails
 */
export async function generateFindingSummary(
  ctx: any,
  finding: {
    title: string;
    source: string;
    url?: string;
    content?: string;
  }
): Promise<string | undefined> {
  // Generate a finding ID for logging (use URL or title hash)
  const findingId = finding.url || finding.title.replace(/\s+/g, "-").toLowerCase();

  try {
    const prompt = `Summarize this content in 2-3 sentences (max 150 chars) for an AI engineer:

Title: ${finding.title}
Source: ${finding.source}
Content Preview: ${finding.content?.slice(0, 500) || "N/A"}

Focus on: What is this? Why does it matter to an AI engineer? What can I do with this?

Respond with ONLY the summary text, no additional formatting.`;

    const result = await generateText({
      model: zaiPro(),
      prompt,
    });

    const summary = result?.text?.trim();

    // Enforce length limit
    if (summary && summary.length > 150) {
      const truncated = summary.slice(0, 147) + "...";
      // Log success with truncated length
      
      return truncated;
    }

    // Only return if minimum length met (80 chars)
    if (summary && summary.length >= 80) {
      // Log success
      
      return summary;
    }

    // Too short - treat as failure
    const shortLength = summary?.length || 0;
    console.warn(
      `[Summary Quality] FAILURE: findingId="${findingId}" reason="too_short (${shortLength} chars)"`
    );
    return undefined;
  } catch (error) {
    // Log failure but don't fail - summary is optional
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[Summary Quality] FAILURE: findingId="${findingId}" error="${errorMessage}"`
    );
    return undefined;
  }
}

// ============================================================================
// Main Synthesis Function
// ============================================================================

/**
 * Generate a synthesized report using two-pass LLM approach with static fallback
 *
 * @param findings - Array of findings to synthesize
 * @param days - Number of days covered by the report
 * @param periodStart - Start date of the period
 * @param periodEnd - End date of the period
 * @returns Synthesis result with markdown and method used
 */
export async function synthesizeReport(
  findings: Finding[],
  days: number,
  periodStart: Date,
  periodEnd: Date
): Promise<SynthesisResult> {
  console.log(
    `[synthesizeReport] Starting two-pass LLM synthesis (${findings.length} findings)`
  );

  // Validate inputs
  if (findings.length === 0) {
    
    return {
      markdown: `# What's New in AI Engineering\n\nNo findings for this period.\n\n*Generated by Holocron's What's New system*`,
      method: "static-fallback",
    };
  }

  // Attempt two-pass LLM synthesis
  try {
    
    const pass1Start = Date.now();
    const initialSynthesis = await generateInitialSynthesis(
      findings,
      days,
      periodStart,
      periodEnd
    );
    const pass1Duration = Date.now() - pass1Start;
    console.log(`[synthesizeReport] Pass 1 complete (${pass1Duration}ms)`);

    
    const pass2Start = Date.now();
    const refinedSynthesis = await refineSynthesis(
      initialSynthesis,
      findings,
      days,
      periodStart,
      periodEnd
    );
    const pass2Duration = Date.now() - pass2Start;
    console.log(`[synthesizeReport] Pass 2 complete (${pass2Duration}ms)`);

    console.log(
      `[synthesizeReport] Two-pass LLM synthesis successful (total: ${pass1Duration + pass2Duration}ms)`
    );

    return {
      markdown: refinedSynthesis,
      method: "llm-two-pass",
      pass1Content: initialSynthesis,
    };
  } catch (error) {
    console.error("[synthesizeReport] LLM synthesis failed, using static fallback:", error);
    const fallbackStart = Date.now();
    const fallbackReport = generateStaticFallback(findings, days, periodStart, periodEnd);
    const fallbackDuration = Date.now() - fallbackStart;
    console.log(`[synthesizeReport] Static fallback generated (${fallbackDuration}ms)`);

    return {
      markdown: fallbackReport,
      method: "static-fallback",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
