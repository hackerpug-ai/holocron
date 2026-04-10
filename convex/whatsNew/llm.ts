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
import type { ActionCtx } from "../_generated/server";
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
  // Enhanced metadata for report tables (Phase 2)
  extendedDescription?: string; // 100-200 chars for table descriptions
  starCount?: number; // GitHub stars for ranking
  isDiscovery?: boolean; // true = new tool, false = known tool update
  platform?: string; // 'reddit', 'hn', 'github', 'devto', 'lobsters'
  releaseType?: 'official' | 'community' | 'unknown';
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

**EDITORIAL VOICE:** For TL;DR items, don't just state what happened — explain WHY it matters to a working AI engineer and link directly to the source. Example: "Claude Code source code leaked via .map file — community is dissecting Anthropic's internal safety architecture and agent loop design. [Source](https://...)"

**Required Output Format (follow EXACTLY — including heading levels and table syntax):**

# WHAT'S NEW — AI Software Engineering Briefing
## {Month} {Day range}, {Year}

---

### TL;DR (Top 5)

1. **{Bold title}** — {Description with context, 1-2 sentences explaining WHY it matters}. [{Source name}]({url})
2. **{Bold title}** — {Description with context}. [{Source name}]({url})
3. **{Bold title}** — {Description with context}. [{Source name}]({url})
4. **{Bold title}** — {Description with context}. [{Source name}]({url})
5. **{Bold title}** — {Description with context}. [{Source name}]({url})

---

### HEADLINE RELEASES

| Product | What | Source |
|---------|------|--------|
| **{name}** | {one-line description of what shipped} | [{Source}]({url}) |
| **{name}** | {one-line description} | [{Source}]({url}) |

---

### NEW TOOLS & PRODUCTS

#### DISCOVERED

| Tool | Description | Stars/Signal | Source |
|------|-------------|-------------|--------|
| **[{name}]({url})** | {what it does, 1 line} | {star count or "NEW"} | [{platform}]({url}) |
| **[{name}]({url})** | {what it does} | {star count} | [{platform}]({url}) |

#### UPDATED (Known Tools with Activity)

| Tool | What Changed | Source |
|------|-------------|--------|
| **[{name}]({url})** | {what changed} | [{Source}]({url}) |
| **[{name}]({url})** | {what changed} | [{Source}]({url}) |

---

### COMMUNITY PULSE

#### Reddit Hot Takes
- **{Title}** — {sentiment/discussion, include upvote count if available} [{Subreddit}]({url})
- **{Title}** — {sentiment} [{Subreddit}]({url})

#### Platform Specific (e.g., "Cursor 3 Growing Pains")
- {Issue or discussion} — {context}

---

### TRENDS & PATTERNS

1. **{Trend name}** — {2-3 sentences explaining the pattern, with specific examples from findings}
2. **{Trend name}** — {explanation with examples}
3. **{Trend name}** — {explanation with examples}

---

### PEOPLE TO WATCH

- **{Name}** — {context/link} [{Source}]({url})
- **{Name}** — {context} [{Source}]({url})

---

### SUBSCRIPTION RECOMMENDATIONS

\`\`\`
/subscribe github {owner/repo} "{description}"
/subscribe reddit r/{subreddit} "{description}"
\`\`\`

---

### METHODOLOGY

This report was generated using the \`/whats-new\` skill with the following methodology:

**Data Sources (4 tracks, 6 parallel workers):**
- Track 1: Reddit Pulse — subreddits via API
- Track 2: HN + Bluesky Signal — Hacker News Show HN + top stories
- Track 3: Releases & Launches — GitHub trending + changelogs
- Track 4: Discovery — Dev.to + Lobsters + web search

**Deduplication & Cross-Referencing:**
- Same URL merged across tracks, keeping richest summary
- Multi-source boost: items found on 2+ tracks prioritized
- Tags: [KNOWN] = from existing subscriptions, [DISCOVERY] = new find

---

\`\`\`
========================================================================
WHAT'S NEW COMPLETE
========================================================================
Period:        {period} ({days} days)
Findings:      {findings.length}+ ({discoveries.length} new discoveries)
Releases:      {releases.length} headline releases
Trends:        {X} cross-track patterns
Recommended:   {X} subscriptions
Workers:       4 dispatched
Sources:       Reddit, HN, GitHub, Dev.to, Lobsters, web search
Generated:     {new Date().toISOString()}
========================================================================
\`\`\`

**Section guidelines:**
- **TL;DR (Top 5)**: Top 5 items across ALL categories by engagementVelocity + crossSourceCorroboration + qualityScore. Every item must have an inline markdown [link](url). Explain WHY it matters, not just WHAT happened.
- **HEADLINE RELEASES**: 4-10 most significant product releases. Table with Product | What | Source columns.
- **NEW TOOLS & PRODUCTS**: Split into DISCOVERED (new tools) and UPDATED (known tools with activity). DISCOVERED table: Tool | Description | Stars/Signal | Source. UPDATED table: Tool | What Changed | Source.
- **COMMUNITY PULSE**: Split into "Reddit Hot Takes" and platform-specific subsections (e.g., "Cursor 3 Growing Pains"). Include upvote counts where available.
- **TRENDS & PATTERNS**: Numbered list (1-8) of cross-track patterns. Bold the trend name. Be specific with examples from findings.
- **PEOPLE TO WATCH**: Notable figures mentioned in findings (researchers, executives, community leaders).
- **SUBSCRIPTION RECOMMENDATIONS**: 5-10 ready-to-run /subscribe commands. Prioritize high-signal GitHub discoveries (5k+ stars), active Reddit communities, official project blogs.
- **METHODOLOGY**: Section with data sources, deduplication info, and metadata footer box.
- Use proper markdown heading syntax (# ## ### ####) exactly as shown.
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

# WHAT'S NEW — AI Software Engineering Briefing
## {Month} {Day range}, {Year}

---

### TL;DR (Top 5)

1. **{Bold title}** — {Description with context}. [{Source}]({url})
...

---

### HEADLINE RELEASES

| Product | What | Source |
|---------|------|--------|
| **{name}** | {description} | [{Source}]({url}) |
...

---

### NEW TOOLS & PRODUCTS

#### DISCOVERED

| Tool | Description | Stars/Signal | Source |
|------|-------------|-------------|--------|
| **[{name}]({url})** | {what it does} | {stars or NEW} | [{platform}]({url}) |
...

#### UPDATED (Known Tools with Activity)

| Tool | What Changed | Source |
|------|-------------|--------|
| **[{name}]({url})** | {what changed} | [{Source}]({url}) |
...

---

### COMMUNITY PULSE

#### Reddit Hot Takes
- **{Title}** — {sentiment} [{Subreddit}]({url})
...

#### {Platform} {Topic}
...

---

### TRENDS & PATTERNS

1. **{Trend name}** — {explanation with examples}
2. **{Trend name}** — {explanation}
...

---

### PEOPLE TO WATCH

- **{Name}** — {context} [{Source}]({url})
...

---

### SUBSCRIPTION RECOMMENDATIONS

\`\`\`
/subscribe github {owner/repo} "{description}"
\`\`\`

---

### METHODOLOGY

{Data sources description}

---

\`\`\`
========================================================================
WHAT'S NEW COMPLETE
========================================================================
Period:        {period} ({days} days)
Findings:      {findings.length}+ ({discoveries} new discoveries)
Releases:      {releases.length} headline releases
Trends:        {X} cross-track patterns
Recommended:   {X} subscriptions
Workers:       4 dispatched
Sources:       Reddit, HN, GitHub, Dev.to, Lobsters, web search
Generated:     {timestamp}
========================================================================
\`\`\`

**Refinement checklist — fix each issue in the initial synthesis:**
1. **H1 title**: Must be "# WHAT'S NEW — AI Software Engineering Briefing"
2. **H2 subtitle**: "## {Month} {Day range}, {Year}" (e.g., "## April 9-10, 2026")
3. **TL;DR section**: Exactly "### TL;DR (Top 5)". Must have 5 numbered items with inline [links](url).
4. **HEADLINE RELEASES**: Exactly "### HEADLINE RELEASES" with table columns: Product | What | Source
5. **NEW TOOLS & PRODUCTS**: Exactly "### NEW TOOLS & PRODUCTS" with "#### DISCOVERED" and "#### UPDATED (Known Tools with Activity)" subsections
6. **COMMUNITY PULSE**: Exactly "### COMMUNITY PULSE" with "#### Reddit Hot Takes" and platform-specific subsections
7. **TRENDS & PATTERNS**: Exactly "### TRENDS & PATTERNS" with numbered list (1-8)
8. **PEOPLE TO WATCH**: Exactly "### PEOPLE TO WATCH" with bulleted list
9. **SUBSCRIPTION RECOMMENDATIONS**: Exactly "### SUBSCRIPTION RECOMMENDATIONS" with fenced code block
10. **METHODOLOGY**: Exactly "### METHODOLOGY" with data sources and metadata footer box

**Hard rules:**
- Never invent details, URLs, or star counts
- Preserve all links and URLs exactly as they appear in the initial synthesis
- Use proper markdown heading syntax (# ## ### ####)
- Use standard markdown pipe tables only — no ASCII box-drawing
- Ensure DISCOVERED/UPDATED split exists in NEW TOOLS section
- Verify METHODOLOGY footer has all metadata fields

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

  const period =
    days === 1
      ? formatDate(periodStart)
      : `${formatDate(periodStart)} to ${formatDate(periodEnd)}`;

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

  // Format period as "Month Day range, Year"
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const startMonth = monthNames[periodStart.getMonth()];
  const endMonth = monthNames[periodEnd.getMonth()];
  const startDay = periodStart.getDate();
  const endDay = periodEnd.getDate();
  const year = periodEnd.getFullYear();

  const periodLabel = days === 1
    ? `${startMonth} ${startDay}, ${year}`
    : (startMonth === endMonth)
      ? `${startMonth} ${startDay}-${endDay}, ${year}`
      : `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;

  // Header
  let markdown = `# WHAT'S NEW — AI Software Engineering Briefing
## ${periodLabel}

---

### TL;DR (Top 5)

`;

  // TL;DR — top 5 by score, with links
  const top5 = topByScore(findings, 5);
  if (top5.length > 0) {
    for (let i = 0; i < Math.min(5, top5.length); i++) {
      const item = top5[i];
      const summary = item.summary ? ` — ${item.summary}` : "";
      const sourceName = item.source || "Source";
      markdown += `${i + 1}. **${item.title}**${summary} [${sourceName}](${item.url})\n`;
    }
  } else {
    markdown += `1. No findings available for this period.\n`;
  }
  markdown += "\n---\n\n";

  // Headline Releases
  if (releases.length > 0) {
    markdown += `### HEADLINE RELEASES\n\n`;
    markdown += `| Product | What | Source |\n`;
    markdown += `|---------|------|--------|\n`;
    for (const item of topByScore(releases, 10)) {
      const desc = item.summary ? item.summary.slice(0, 80) : item.source;
      const sourceName = item.source || "Source";
      markdown += `| **${item.title}** | ${desc} | [${sourceName}](${item.url}) |\n`;
    }
    markdown += "\n---\n\n";
  }

  // New Tools & Products
  if (discoveries.length > 0) {
    markdown += `### NEW TOOLS & PRODUCTS\n\n`;

    // Split into DISCOVERED (new) and UPDATED (known with activity)
    // For static fallback, we'll use starCount or isDiscovery if available
    const discovered = discoveries.filter(d => d.isDiscovery !== false); // Default to discovered
    const updated = discoveries.filter(d => d.isDiscovery === false);

    // DISCOVERED
    markdown += `#### DISCOVERED\n\n`;
    markdown += `| Tool | Description | Stars/Signal | Source |\n`;
    markdown += `|------|-------------|-------------|--------|\n`;
    for (const item of topByScore(discovered, 15)) {
      const desc = item.summary ? item.summary.slice(0, 60) : item.source;
      const stars = item.starCount ? item.starCount.toLocaleString() : "NEW";
      const platform = item.platform || item.source || "Source";
      markdown += `| **[${item.title}](${item.url})** | ${desc} | ${stars} | [${platform}](${item.url}) |\n`;
    }

    // UPDATED
    if (updated.length > 0) {
      markdown += `\n#### UPDATED (Known Tools with Activity)\n\n`;
      markdown += `| Tool | What Changed | Source |\n`;
      markdown += `|------|-------------|--------|\n`;
      for (const item of topByScore(updated, 10)) {
        const desc = item.summary ? item.summary.slice(0, 60) : item.source;
        const sourceName = item.source || "Source";
        markdown += `| **[${item.title}](${item.url})** | ${desc} | [${sourceName}](${item.url}) |\n`;
      }
    }
    markdown += "\n---\n\n";
  }

  // Community Pulse
  const discussionItems = topByScore(discussions, 5);
  markdown += `### COMMUNITY PULSE\n\n`;

  // Split by platform if possible
  const redditItems = discussionItems.filter(d => d.platform === "reddit" || d.source?.startsWith("r/"));
  const otherItems = discussionItems.filter(d => d.platform !== "reddit" && !d.source?.startsWith("r/"));

  if (redditItems.length > 0) {
    markdown += `#### Reddit Hot Takes\n`;
    for (const item of redditItems) {
      const pts = item.upvotes ? ` (${item.upvotes.toLocaleString()} upvotes)` : "";
      const subreddit = item.source?.replace("r/", "") || "subreddit";
      markdown += `- **${item.title}**${pts} [r/${subreddit}](${item.url})\n`;
    }
    markdown += "\n";
  }

  if (otherItems.length > 0) {
    for (const item of otherItems) {
      const pts = item.score ? ` (${item.score} pts)` : "";
      markdown += `- **${item.title}**${pts} [${item.source || "Source"}](${item.url})\n`;
    }
  }

  if (discussionItems.length === 0) {
    markdown += `- No community discussions surfaced for this period.\n`;
  }
  markdown += "\n---\n\n";

  // Trends & Patterns
  markdown += `### TRENDS & PATTERNS\n\n`;
  if (trends.length > 0) {
    for (let i = 0; i < Math.min(8, trends.length); i++) {
      const item = trends[i];
      const desc = item.summary ? ` — ${item.summary}` : "";
      markdown += `${i + 1}. **${item.title}**${desc}\n`;
    }
  } else {
    // Derive trends from top cross-source corroborated items
    const corroborated = findings
      .filter((f) => (f.crossSourceCorroboration ?? 0) >= 2)
      .slice(0, 8);

    if (corroborated.length > 0) {
      for (let i = 0; i < corroborated.length; i++) {
        const item = corroborated[i];
        const desc = item.summary ? ` — ${item.summary}` : "";
        markdown += `${i + 1}. **${item.title}**${desc}\n`;
      }
    } else {
      markdown += `1. No trend signals identified for this period.\n`;
    }
  }
  markdown += "\n---\n\n";

  // People to Watch (extract from findings with authors)
  const findingsWithAuthors = findings.filter(f => f.author && f.author.length > 0).slice(0, 5);
  if (findingsWithAuthors.length > 0) {
    markdown += `### PEOPLE TO WATCH\n\n`;
    for (const item of findingsWithAuthors) {
      markdown += `- **${item.author}** — mentioned in [${item.title}](${item.url})\n`;
    }
    markdown += "\n---\n\n";
  }

  // Recommended Subscriptions — derive from top sources in findings
  const topSources = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([source]) => source);

  markdown += `### SUBSCRIPTION RECOMMENDATIONS\n\n`;
  markdown += "```\n";
  for (const source of topSources) {
    if (source.startsWith("r/")) {
      const subreddit = source.replace("r/", "");
      markdown += `/subscribe reddit ${subreddit} "${subreddit} subreddit"\n`;
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
        markdown += `/subscribe github ${repo} "${topRepo.title}"\n`;
      }
    } else {
      markdown += `/subscribe website https://${source.toLowerCase().replace(/\s+/g, "-")}.com "${source} updates"\n`;
    }
  }
  markdown += "```\n\n";

  // METHODOLOGY
  markdown += `---\n\n`;
  markdown += `### METHODOLOGY\n\n`;
  markdown += `This report was generated using the \`/whats-new\` skill with the following methodology:\n\n`;
  markdown += `**Data Sources (4 tracks, 6 parallel workers):**\n`;
  markdown += `- Track 1: Reddit Pulse — subreddits via API\n`;
  markdown += `- Track 2: HN + Bluesky Signal — Hacker News Show HN + top stories\n`;
  markdown += `- Track 3: Releases & Launches — GitHub trending + changelogs\n`;
  markdown += `- Track 4: Discovery — Dev.to + Lobsters + web search\n\n`;
  markdown += `**Deduplication & Cross-Referencing:**\n`;
  markdown += `- Same URL merged across tracks, keeping richest summary\n`;
  markdown += `- Multi-source boost: items found on 2+ tracks prioritized\n`;
  markdown += `- Tags: [KNOWN] = from existing subscriptions, [DISCOVERY] = new find\n\n`;
  markdown += `---\n\n`;
  markdown += "```\n";
  markdown += "========================================================================\n";
  markdown += "WHAT'S NEW COMPLETE\n";
  markdown += "========================================================================\n";
  markdown += `Period:        ${period} (${days} days)\n`;
  markdown += `Findings:      ${findings.length}+ (${discoveries.length} new discoveries)\n`;
  markdown += `Releases:      ${releases.length} headline releases\n`;
  markdown += `Trends:        ${trends.length} cross-track patterns\n`;
  markdown += `Recommended:   ${topSources.length} subscriptions\n`;
  markdown += `Workers:       4 dispatched\n`;
  markdown += `Sources:       Reddit, HN, GitHub, Dev.to, Lobsters, web search\n`;
  markdown += `Generated:     ${new Date().toISOString()}\n`;
  markdown += "========================================================================\n";
  markdown += "```\n";

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
  _ctx: ActionCtx,
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
