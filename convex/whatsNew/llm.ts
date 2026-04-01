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
  const sortedFindings = [...findings]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

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

  const prompt = `You are a knowledgeable AI engineering peer writing a daily "What's New in AI Software Engineering" briefing for a senior AI engineer. Write with authority and editorial insight — not as a news aggregator, but as someone who understands why these developments matter.

**Period:** ${formatDate(periodStart)} to ${formatDate(periodEnd)} (${days} days)
**Total Findings:** ${findings.length} (${discoveries.length} discoveries, ${releases.length} releases, ${discussions.length} discussions, ${trends.length} trends)

**All Findings (sorted by score):**
\`\`\`json
${findingsJson}
\`\`\`

**CROSS-SOURCE BOOSTING:** Items with \`crossSourceCorroboration >= 2\` appeared on multiple independent sources — these are the most significant stories and MUST appear in the TL;DR or Headline Releases sections.

**EDITORIAL VOICE:** For each item in TL;DR, don't just state what happened — explain WHY it matters to a working AI engineer. Example: "Claude Code source code leaked via .map file (March 31) — community is dissecting Anthropic's internal safety architecture, prompt injection defenses, and agent loop design."

**Required Output Format (follow EXACTLY):**

\`\`\`markdown
What's New: AI Software Engineering

  {Period label} | {total} findings | {discoveries} new discoveries | {releases} releases

  ---
  TL;DR — Top 5

  1. {Title} ({date if known}) — {1-2 sentence editorial context explaining WHY this matters}
  2. ...

  ---
  Headline Releases

  ┌───────────────────┬────────────────────────────────────────┐
  │      Product      │              What Shipped              │
  ├───────────────────┼────────────────────────────────────────┤
  │ Product Name      │ Brief description of what shipped      │
  ├───────────────────┼────────────────────────────────────────┤
  │ ...               │ ...                                    │
  └───────────────────┴────────────────────────────────────────┘

  ---
  New Tools

  Tool: {url}
  Stars: ⭐ {count}
  What It Is: {1-line description}
  ────────────────────────────────────────
  Tool: {url}
  ...

  ---
  Community Pulse

  {Editorial summary of what the community is buzzing about — Reddit hot topics, HN signal, Bluesky/Twitter notable posts. Write as prose, not a list. Reference specific subreddits and point counts.}

  ---
  Trends

  1. {Trend name} — {2-3 sentence explanation with specific examples from findings}
  2. ...

  ---
  Recommended Subscriptions

  {Suggest 3-5 new sources worth following based on discoveries in this report. Format as actionable commands:}
  /subscribe add reddit r/{subreddit}
  /subscribe add github {repo}
  /subscribe add changelog {product}

  ---
  ════════════════════════════════════════════
  WHAT'S NEW COMPLETE
  ════════════════════════════════════════════
  Period: {date range}
  Findings: {total} ({discovery_count} new discoveries)
  Releases: {release_count}
  ════════════════════════════════════════════
\`\`\`

**Guidelines:**
- For Headline Releases table: include 6-12 most significant product releases. Use ASCII box-drawing characters (┌─┬─┐ etc.) for the table.
- For New Tools: include ALL GitHub repos and new tool discoveries with star counts. Format each as a block with Tool/Stars/What It Is.
- For TL;DR: Pick the 5 most impactful items across ALL categories. Bias toward cross-source corroborated items.
- For Trends: Identify 3-5 patterns that emerge across multiple findings. Be specific with examples.
- For Community Pulse: Write editorial prose summarizing the mood and hot topics. Mention specific subreddits, point counts, and notable threads.
- For Recommended Subscriptions: Only suggest sources that appeared in this report's findings.
- Do NOT include markdown heading syntax (#). Use plain text headers as shown in the format.
- Include all URLs inline where relevant.`;

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

  const prompt = `You are refining a daily "What's New in AI Software Engineering" report. Your job is editorial polish — improve the writing quality, strengthen the narrative, and ensure completeness.

**Period:** ${formatDate(periodStart)} to ${formatDate(periodEnd)} (${days} days)
**Total Findings:** ${findings.length}
**Sources:** ${sourceBreakdown}

**Initial Synthesis:**
\`\`\`
${initialSynthesis}
\`\`\`

**Refinement Tasks:**
1. **Editorial voice**: Ensure the TL;DR items explain WHY each development matters, not just WHAT happened. Write as a knowledgeable peer.
2. **Headline Releases table**: Ensure the ASCII box-drawing table (┌─┬─┐ etc.) is properly formatted and aligned. Include 6-12 entries.
3. **New Tools section**: Every tool should have URL, star count (if GitHub), and a clear 1-line description.
4. **Community Pulse**: Should read as editorial prose, not a bullet list. Reference specific subreddits, point counts, notable threads.
5. **Trends**: Each trend should have 2-3 sentences with specific examples from the findings. Identify cross-cutting patterns.
6. **Recommended Subscriptions**: Must be present. Suggest 3-5 actionable /subscribe commands for sources found in this report.
7. **Completeness**: Ensure the footer banner with "WHAT'S NEW COMPLETE" and stats is present.
8. **Formatting**: Fix any broken ASCII tables. Remove any markdown heading syntax (#) — use plain text headers only.

**Guidelines:**
- Maintain factual accuracy — never invent details, URLs, or star counts
- Preserve all links and URLs exactly as they appear
- Keep the same section structure — do not add or remove sections
- The report should feel like a curated briefing from someone who reads everything so you don't have to

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

  // Build source breakdown
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

  // Format score
  const formatScore = (item: Finding): string => {
    if (!item.score) return "";
    if (item.source === "GitHub") return ` ⭐ ${item.score}`;
    return ` (${item.score} pts)`;
  };

  // Top by score
  const topByScore = (items: Finding[], n: number): Finding[] => {
    return [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, n);
  };

  let markdown = `# What's New in AI Software Engineering

**Period:** ${formatDate(periodStart)} to ${formatDate(periodEnd)} (${days} days)
**Generated:** ${new Date().toISOString()}
**Findings:** ${findings.length} total (${discoveries.length} discoveries, ${releases.length} releases, ${trends.length} trends, ${discussions.length} discussions)

---

`;

  // TL;DR
  const top5 = topByScore(findings, 5);
  if (top5.length > 0) {
    markdown += `## TL;DR\n\n`;
    for (let i = 0; i < top5.length; i++) {
      const item = top5[i];
      markdown += `${i + 1}. **[${item.title}](${item.url})**${formatScore(item)}\n`;
    }
    markdown += "\n---\n\n";
  }

  // Releases
  if (releases.length > 0) {
    markdown += `## 📦 Releases & Updates\n\n`;
    markdown += `| Release | Source | Score |\n`;
    markdown += `|---------|--------|-------|\n`;
    for (const item of releases.slice(0, 10)) {
      const score = item.score ? `${item.score}` : "—";
      markdown += `| [${item.title}](${item.url}) | ${item.source} | ${score} |\n`;
    }
    markdown += "\n";
  }

  // Discoveries
  if (discoveries.length > 0) {
    const githubFinds = discoveries.filter((f) => f.source === "GitHub");
    const otherFinds = discoveries.filter((f) => f.source !== "GitHub");

    markdown += `## 🔬 New Tools & Discoveries\n\n`;

    if (otherFinds.length > 0) {
      for (const item of otherFinds.slice(0, 10)) {
        markdown += `- **[${item.title}](${item.url})** — *${item.source}*${formatScore(item)}\n`;
        if (item.summary) {
          markdown += `  ${item.summary}\n`;
        }
      }
      markdown += "\n";
    }

    if (githubFinds.length > 0) {
      markdown += `### Trending Repos\n\n`;
      markdown += `| Repository | Stars |\n`;
      markdown += `|------------|-------|\n`;
      for (const item of topByScore(githubFinds, 10)) {
        markdown += `| [${item.title}](${item.url}) | ${item.score ? `⭐ ${item.score}` : "—"} |\n`;
      }
      markdown += "\n";
    }
  }

  // Discussions
  if (discussions.length > 0) {
    const redditPosts = discussions.filter((f) => f.source.startsWith("r/"));
    const lobsterPosts = discussions.filter((f) => f.source === "Lobsters");
    const otherDiscussions = discussions.filter(
      (f) => !f.source.startsWith("r/") && f.source !== "Lobsters"
    );

    markdown += `## 💬 Community Pulse\n\n`;

    if (redditPosts.length > 0) {
      markdown += `### Reddit\n\n`;
      markdown += `| Post | Subreddit |\n`;
      markdown += `|------|-----------|\n`;
      for (const item of redditPosts.slice(0, 10)) {
        markdown += `| [${item.title}](${item.url}) | ${item.source} |\n`;
      }
      markdown += "\n";
    }

    if (lobsterPosts.length > 0) {
      markdown += `### Lobsters\n\n`;
      for (const item of lobsterPosts.slice(0, 5)) {
        markdown += `- [${item.title}](${item.url})\n`;
      }
      markdown += "\n";
    }

    if (otherDiscussions.length > 0) {
      for (const item of otherDiscussions.slice(0, 5)) {
        markdown += `- [${item.title}](${item.url}) — *${item.source}*\n`;
      }
      markdown += "\n";
    }
  }

  // Trends
  if (trends.length > 0) {
    markdown += `## 📈 Trends\n\n`;
    for (const item of trends.slice(0, 10)) {
      markdown += `- **[${item.title}](${item.url})** — *${item.source}*\n`;
    }
    markdown += "\n";
  }

  // Footer
  markdown += `---\n\n`;
  markdown += `**Sources:** ${sourceBreakdown}\n\n`;
  markdown += `*Generated by Holocron's What's New system (static fallback)*\n`;

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
      console.log(
        `[Summary Quality] SUCCESS: findingId="${findingId}" length=${truncated.length} truncated=true`
      );
      return truncated;
    }

    // Only return if minimum length met (80 chars)
    if (summary && summary.length >= 80) {
      // Log success
      console.log(
        `[Summary Quality] SUCCESS: findingId="${findingId}" length=${summary.length}`
      );
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
    console.log("[synthesizeReport] No findings, using minimal report");
    return {
      markdown: `# What's New in AI Software Engineering\n\nNo findings for this period.\n\n*Generated by Holocron's What's New system*`,
      method: "static-fallback",
    };
  }

  // Attempt two-pass LLM synthesis
  try {
    console.log("[synthesizeReport] Pass 1: Initial synthesis...");
    const pass1Start = Date.now();
    const initialSynthesis = await generateInitialSynthesis(
      findings,
      days,
      periodStart,
      periodEnd
    );
    const pass1Duration = Date.now() - pass1Start;
    console.log(`[synthesizeReport] Pass 1 complete (${pass1Duration}ms)`);

    console.log("[synthesizeReport] Pass 2: Refinement...");
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
    const fallbackReport = generateStaticFallback(
      findings,
      days,
      periodStart,
      periodEnd
    );
    const fallbackDuration = Date.now() - fallbackStart;
    console.log(`[synthesizeReport] Static fallback generated (${fallbackDuration}ms)`);

    return {
      markdown: fallbackReport,
      method: "static-fallback",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
