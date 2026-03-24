---
name: whats-new
description: "On-demand AI software engineering news briefing. Returns cached daily report (auto-generated at 6AM PST) or runs fresh parallel swarm when --force flag used. Scans Reddit, HN, GitHub, Dev.to, Lobsters for tool releases, trends, and discoveries."
allowed-tools: WebSearch, Task, Read, Write, Glob, Grep, Bash, AskUserQuestion, mcp__jina__search_web, mcp__jina__read_url, mcp__jina__expand_query, mcp__jina__deduplicate_strings, mcp__plugin_exa-mcp-server_exa__web_search_exa, mcp__plugin_exa-mcp-server_exa__company_research_exa, mcp__holocron__hybrid_search, mcp__holocron__get_document, mcp__holocron__getWhatsNewReportTool, mcp__holocron__listWhatsNewReportsTool
---

# /whats-new

Surface what's new in AI software engineering -- tool releases, product launches, emerging trends, and noteworthy voices.

**Default behavior**: Returns cached daily report (auto-generated at 6AM PST via Convex cron). This is instant and free.

**With --force**: Dispatches parallel workers to scan Reddit, Hacker News, GitHub, Dev.to, Lobsters for fresh data. Uses `scripts/fetch_trends.py` for direct API access.

## QUICK REFERENCE

```
SYNTAX:
  /whats-new                          # Return cached daily report (instant)
  /whats-new --force                  # Force fresh scan (expensive)
  /whats-new --days 3                 # Custom lookback (requires --force)
  /whats-new --focus tools            # Filter: tools | releases | trends | people
  /whats-new --discovery-only         # Skip known sources, find NEW things only
  /whats-new --list                   # List recent report history

FLOW:    Check cached report → If today's exists, return it → Else run parallel workers
AUTO:    Daily cron at 6AM PST generates fresh report automatically
TRACKS:  Reddit Pulse | HN Signal | Releases & Launches | Discovery (DevTo/Lobsters/GitHub)
OUTPUT:  Prioritized briefing with TL;DR, releases, discoveries, trends
```

## WHEN TO USE

- Daily or ad-hoc "what did I miss?" briefing
- Before starting a new project (what tools exist now?)
- Tracking competitive landscape shifts
- Finding new tools/communities to subscribe to

**Use `/subscribe check` instead for**: Just checking your existing sources
**Use `/deep-research` instead for**: Deep dive into a single tool or topic
**Use `/research` instead for**: Specific factual questions

---

## PROGRESSIVE DISCLOSURE

**Core**: This file (execution algorithm, track definitions)
**Load at runtime**: `docs/sources.md` (people, hashtags, subreddits, companies, discovery keywords)

---

## EXECUTION ALGORITHM

```
[1] PARSE INPUT & DETERMINE SCOPE
    • EXTRACT flags:
      --force           Force fresh scan (skip cached report)
      --list            List recent report history
      --days N          Lookback window (default: 1, min: 1, max: 90) - requires --force
      --focus <area>    Filter: "tools" | "releases" | "trends" | "people" | "all" (default)
      --discovery-only  Skip known sources, only search for NEW things
      --skip-confirm    Execute immediately without plan approval
    • LOAD: docs/sources.md for curated source lists
    • COMPUTE: date_range = "{N} days ago" to "now"
    • COMPUTE: current_year, current_month from system date

[2] CHECK CACHED REPORT (MCP Tool - Primary Path)
    **This is the default behavior - instant and free**

    • IF --list flag:
      ├─ CALL: mcp__holocron__listWhatsNewReportsTool({ limit: 10 })
      ├─ DISPLAY: Table of recent reports with dates, finding counts
      └─ STOP (unless user asks for specific report)

    • CALL: mcp__holocron__getWhatsNewReportTool({})
      Returns: { content, generatedAt, isFromToday, stats, report }

    • IF report exists AND NOT --force:
      ├─ IF isFromToday OR report < 24 hours old:
      │   ├─ DISPLAY: Full cached report content
      │   ├─ SHOW: "Report from {generatedAt} | {findingsCount} findings"
      │   └─ STOP (cached report delivered)
      ├─ ELSE (report exists but older):
      │   ├─ SHOW: "Latest report from {date} ({N} days ago)"
      │   ├─ DISPLAY: Summary from report.summaryJson (TL;DR, top discoveries)
      │   └─ ASK: "Run fresh scan? (use --force to skip this prompt)"
      └─ IF user says "yes" → continue to [3]

    • IF --force OR no cached report:
      └─ CONTINUE to step [3] for fresh generation

[3] QUERY SUBSCRIPTION DATA (Known Ecosystem via Convex)
    Skip if --discovery-only
    • CONVEX QUERY via whatsNew.getRecentSubscriptionContent:
      Fetches subscriptionContent from the past N days,
      grouped by sourceType (youtube, newsletter, changelog, reddit, ebay)
      Returns: total count, grouped data, all items with source info
    • GROUP BY source_type: reddit, youtube, newsletter, changelog
    • EXTRACT: titles, URLs, key themes
    • This becomes "known ecosystem context" passed to workers

[4] BUILD TRACK PROMPTS
    Load sources from docs/sources.md. Build 6 track prompts:

    SCRIPT: scripts/fetch_trends.py (direct API access, no MCP needed)
    • Located at: skills/whats-new/scripts/fetch_trends.py
    • Invoke via: Bash(python3 skills/whats-new/scripts/fetch_trends.py ...)
    • Output: JSON to stdout, logs to stderr
    • Platforms: reddit, hn, bluesky, github, devto, lobsters, all

    TRACK 1: REDDIT PULSE
    Focus: What's the AI dev community buzzing about?
    • PRIMARY: fetch_trends.py reddit (direct Reddit JSON API)
      ```bash
      python3 scripts/whats-new/fetch_trends.py reddit \
        --subreddits ClaudeAI,LocalLLaMA,ChatGPT,MachineLearning,devtools,OpenAI,CursorAI,SideProject \
        --days {days} --limit 15
      ```
    • SUPPLEMENT (web search for broader signal):
      - "site:reddit.com AI coding tool {current_month} {current_year}"
    • Filter: upvotes > 10, within date_range
    • Return: Top 15 posts with title, subreddit, score, URL, 1-line summary

    TRACK 2: HACKER NEWS + BLUESKY SIGNAL
    Focus: What are builders shipping and discussing?
    • HN (via fetch_trends.py):
      ```bash
      python3 scripts/whats-new/fetch_trends.py hn --tags show_hn --min-points 20 --days {days} --limit 15
      python3 scripts/whats-new/fetch_trends.py hn --tags story --min-points 50 --days {days} --query "AI coding" --limit 10
      ```
    • Bluesky (via fetch_trends.py, requires BLUESKY_HANDLE + BLUESKY_APP_PASSWORD):
      ```bash
      python3 scripts/whats-new/fetch_trends.py bluesky --query "AI coding tool" --days {days} --limit 15
      python3 scripts/whats-new/fetch_trends.py bluesky --query "MCP server" --days {days} --limit 10
      ```
    • SUPPLEMENT: Twitter/X via exa-mcp-server x-search or web search for site:x.com
      - Key accounts from docs/sources.md (tool builders, company accounts)
      - Primary hashtags: #AItools, #DevTools, #CodingAgent, #AIcoding
      - Keywords: "just shipped", "announcing", "new release", "open sourced"
    • Return: Top 15 posts/threads with author, content summary, URL

    TRACK 3: RELEASES & LAUNCHES
    Focus: What shipped this period?
    • Check known changelogs: claude-code, cursor, openai, github-copilot, convex
    • GitHub velocity (via fetch_trends.py):
      ```bash
      python3 scripts/whats-new/fetch_trends.py github --query "topic:ai-coding" --min-stars 50 --days {days} --limit 10
      python3 scripts/whats-new/fetch_trends.py github --query "AI developer tool" --min-stars 100 --days {days} --limit 10
      ```
    • Search queries (web search):
      - "AI developer tool release {current_month} {current_year}"
      - "new coding assistant launch {current_year}"
      - "AI IDE update changelog"
    • Return: Top 10 releases with product, version, key features, URL

    TRACK 4: DISCOVERY (New & Unknown)
    Focus: What tools and trends am I NOT already tracking?
    • Dev.to (via fetch_trends.py):
      ```bash
      python3 scripts/whats-new/fetch_trends.py devto --tags ai,devtools,llm,machinelearning --days {days} --limit 15
      ```
    • Lobsters (via fetch_trends.py):
      ```bash
      python3 scripts/whats-new/fetch_trends.py lobsters --days {days} --limit 15
      ```
    • Web search queries designed to surface unknowns:
      - "new AI coding tool {current_year}"
      - "alternative to cursor" / "alternative to copilot"
      - "AI developer productivity tool"
      - "open source AI IDE"
      - "MCP server new" (Model Context Protocol ecosystem)
    • EXCLUDE: Tools already in Tier 1/2 companies (from docs/sources.md)
    • Return: Top 10 discoveries with name, description, URL, why interesting

    IF --focus flag set:
      • "tools" → Run Track 3 + Track 4 only
      • "releases" → Run Track 3 only
      • "trends" → Run Track 1 + Track 2 only
      • "people" → Run Track 2 with people emphasis

[5] PRESENT PLAN (unless --skip-confirm)
    ```
    ## What's New Scan Plan

    **Period**: {start_date} to {end_date} ({days} days)
    **Focus**: {focus or "all"}
    **Tracks**: {N} parallel workers

    ### Track 1: Reddit Pulse
    Scanning {N} subreddits for community discussions and announcements

    ### Track 2: Twitter/X Signal
    Checking {N} accounts + {N} hashtags for tool builder announcements

    ### Track 3: Releases & Launches
    Checking {N} changelogs + web search for new releases

    ### Track 4: Discovery
    Searching for tools and trends NOT in current subscriptions

    **Known ecosystem**: {N} recent items from Convex /subscribe data

    Proceed? (yes / no / modify)
    ```

    IF "no" → STOP
    IF "modify" → Adjust tracks → return to [4]

[6] DISPATCH PARALLEL WORKERS
    PHASE A: Run fetch_trends.py scripts (fast, direct API calls)
      Execute these in parallel via Bash:
      ```bash
      # Track 1: Reddit
      python3 skills/whats-new/scripts/fetch_trends.py reddit \
        --subreddits ClaudeAI,LocalLLaMA,ChatGPT,MachineLearning,devtools,OpenAI,CursorAI,SideProject \
        --days {days} --limit 15

      # Track 2: HN
      python3 skills/whats-new/scripts/fetch_trends.py hn \
        --tags show_hn --min-points 20 --days {days} --limit 15

      # Track 2: Bluesky (if env vars set)
      python3 skills/whats-new/scripts/fetch_trends.py bluesky \
        --query "AI coding tool" --days {days} --limit 15

      # Track 3: GitHub
      python3 skills/whats-new/scripts/fetch_trends.py github \
        --query "topic:ai-coding" --min-stars 50 --days {days} --limit 10

      # Track 4: Dev.to + Lobsters
      python3 skills/whats-new/scripts/fetch_trends.py devto \
        --tags ai,devtools,llm --days {days} --limit 15
      python3 skills/whats-new/scripts/fetch_trends.py lobsters \
        --days {days} --limit 15
      ```
      Parse each JSON result into the track's findings list.

    PHASE B: Dispatch web search workers for broader signal
      FOR EACH active track IN PARALLEL:
      Task(
        subagent_type="research-worker",
        model="haiku",
        description="whats-new: {track_name}",
        prompt="""
## What's New Research Assignment

TRACK: {track_id} - {track_name}
PERIOD: {date_range}
YEAR: {current_year}

{track-specific web search instructions from step [4]}

KNOWN ECOSYSTEM CONTEXT (avoid duplicating these):
{summary of Convex subscription data from step [3]}
{summary of fetch_trends.py results from Phase A}

RETURN FORMAT (MANDATORY):
```
TRACK: {track_id}
STATUS: COMPLETE | PARTIAL
FINDINGS_COUNT: {N}

FINDINGS:
1. **{Title}** - {1-line summary}
   Source: {subreddit|@handle|site} | URL: {url}
   Relevance: HIGH | MEDIUM
   Tags: [release|tool|trend|person|discussion]

2. ...

TOP_SOURCES:
- {URL} - {why notable}

GAPS:
- {What couldn't be found or verified}

EMERGING_THEMES:
- {Pattern or trend observed across multiple findings}
```
        """
      )

[7] COLLECT & DEDUPLICATE
    • Gather all worker artifacts
    • Parse each into structured findings list
    • DEDUPLICATE:
      - Same URL → merge, keep richest summary
      - Same tool/product from different tracks → merge, note multi-source
    • CROSS-REFERENCE BOOST:
      - Found on Reddit AND Twitter → Priority: HIGH
      - Found on 3+ sources → Move to Headlines
    • TAG each finding:
      - [KNOWN] = from existing Convex subscriptions
      - [DISCOVERY] = new find not in subscriptions
      - [MULTI-SOURCE] = appeared across 2+ tracks

[8] SYNTHESIZE BRIEFING
    Organize into prioritized sections:

    a) TL;DR (TOP 5)
       • Most impactful findings across all tracks
       • Bias toward: releases > discoveries > trends > discussions

    b) HEADLINE RELEASES
       • Major version releases, new product launches
       • Cross-referenced from Track 3 + other tracks

    c) NEW TOOLS & PRODUCTS
       • DISCOVERED: Not in subscriptions (from Track 4)
       • UPDATED: Known tools with new releases (from Track 3)
       • Categorize: IDE/editor | CLI | agent framework | testing | other

    d) COMMUNITY PULSE
       • Reddit: Hot discussions, sentiment themes (Track 1)
       • Twitter/X: Notable posts, trending topics (Track 2)

    e) TRENDS & PATTERNS
       • Cross-track themes (appearing in 2+ tracks)
       • Community sentiment shifts
       • Emerging tool categories

    f) PEOPLE TO WATCH
       • New voices posting valuable content
       • Active contributors worth following

    g) SUBSCRIPTION RECOMMENDATIONS
       • New sources worth adding via /subscribe
       • Format as copy-pasteable commands

[9] GENERATE REPORT
    WRITE to memory (display inline):

    ```markdown
    # What's New in AI Software Engineering
    **Period**: {start_date} to {end_date}
    **Generated**: {timestamp}
    **Tracks**: {N} workers | **Findings**: {total} ({discovery_count} discoveries)

    ## TL;DR (Top 5)
    1. {Most impactful finding with link}
    2. ...
    3. ...
    4. ...
    5. ...

    ## Headline Releases
    | Product | Version/Update | Key Changes | Link |
    |---------|---------------|-------------|------|
    | ... | ... | ... | ... |

    ## New Tools & Products

    ### Discovered (not in your subscriptions)
    - **{Tool Name}** - {description} | [link]({url})
    - ...

    ### Updates to Known Tools
    - **{Tool Name}** {version} - {what changed} | [link]({url})
    - ...

    ## Community Pulse

    ### Reddit Hot Topics
    | Post | Subreddit | Score | Summary |
    |------|-----------|-------|---------|
    | ... | ... | ... | ... |

    ### Twitter/X Notable
    | Author | Post | Link |
    |--------|------|------|
    | ... | ... | ... |

    ## Trends & Patterns
    - {Cross-track theme 1}
    - {Cross-track theme 2}
    - ...

    ## People to Watch
    | Who | Platform | Why Notable |
    |-----|----------|-------------|
    | ... | ... | ... |

    ## Recommended Subscriptions
    ```bash
    /subscribe add reddit r/{new_subreddit}
    /subscribe add youtube @{new_channel}
    /subscribe add changelog {new_tool}
    ```

    ## All Sources
    | # | Title | URL | Source | Track | Tag |
    |---|-------|-----|--------|-------|-----|
    | 1 | ... | ... | ... | ... | [DISCOVERY] |
    ...

    ---
    *Generated by /whats-new | Saved to Convex*
    ```

[10] SAVE TO CONVEX & FILE
     • Save report metadata to Convex via whatsNew.saveReport:
       - periodStart, periodEnd, days, focus, discoveryOnly
       - findingsCount, discoveryCount, releaseCount, trendCount
       - reportPath (to local file), summaryJson (structured data)
     • Write report to ~/.holocron/deep-research/whats-new-{YYYYMMDD}/INDEX.md
     • DISPLAY: Read report from file and display to console

[11] OUTPUT
     • Display full report inline
     • Show summary banner:
     ```
     ════════════════════════════════════════════
     WHAT'S NEW COMPLETE
     ════════════════════════════════════════════
     Period: {date_range}
     Findings: {total} ({discovery_count} new discoveries)
     Releases: {release_count}
     Trends: {trend_count}
     Recommended subs: {rec_count}
     Saved to Convex: {reportId}
     ════════════════════════════════════════════
     ```
```

---

## OUTPUT FORMAT

See step [9] above for full report template. Key sections:

| Section | Content | Source Tracks |
|---------|---------|--------------|
| TL;DR | Top 5 findings | All |
| Headline Releases | Major announcements | Track 3 (GitHub) + cross-ref |
| New Tools | Discoveries + updates | Track 3, 4 (DevTo/Lobsters/GitHub) |
| Community Pulse | Reddit + HN + Bluesky | Track 1, 2 |
| Trends | Cross-track patterns | All |
| People to Watch | Notable voices | Track 2 (Bluesky/Twitter) |
| Recommended Subs | New sources to add | Track 4 |

---

## ERRORS

| Error | Cause | Fix |
|-------|-------|-----|
| `--days must be 1-90` | Invalid range | Use 1-90 |
| `Convex query failed` | Connection issue | Proceeds with external search only |
| `No subscription data` | Empty Convex content_items | Skip step [3], external only |
| `Worker returned empty` | Search found nothing | Note gap, don't fail report |
| `All workers empty` | Nothing found for period | Report: "No significant activity found" |
| `Recent report exists` | Ran within 3 days | Shows existing, offers refresh |

---

## EXAMPLES

```bash
# Get today's cached briefing (instant, default)
/whats-new

# List recent report history
/whats-new --list

# Force fresh scan (expensive, runs parallel workers)
/whats-new --force

# Fresh scan with custom lookback
/whats-new --force --days 3

# What new tools exist that I don't know about?
/whats-new --force --discovery-only

# Just releases and changelogs
/whats-new --force --focus releases

# What are people talking about?
/whats-new --force --focus trends
```

**Note**: Reports are auto-generated daily at 6AM PST via Convex cron. Most users should just run `/whats-new` to get the cached report instantly.
