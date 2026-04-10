# What's New Report Improvements

## Problem Statement

The current What's New reports lack:
1. Informative recaps/descriptions for each finding
2. Consistent structured format (TL;DR, Headline Releases, New Tools, Trends)
3. Actionable insights ("why it matters" context)
4. Easy-to-scan tables for tools and releases

## Target Format

Reports should follow this structure:

```markdown
# What's New: AI Software Engineering Briefing

**Period**: April 2026 (7-day scan) | **Focus**: All

---

## TL;DR (Top 5)

1. **Nimbalyst** - Multi-session AI coding environment with worktree support — enables parallel AI agent workflows without conflicting git states. [Source](https://nimbalyst.com)
2. **JetBrains AI 2026** - Major evolution to AI-native development environment — traditional IDE with AI add-on → full AI-native. [Blog Post](https://...)
3. **MCP** - Open standard for AI-tool integration gaining adoption — 5+ new implementations this week. [Spec](https://modelcontextprotocol.io)
4. **Reddit survey** - Community discussing actual AI tool usage in production — r/ClaudeAI, 500+ upvotes, reveals real-world adoption patterns
5. **Dev.to** - 15+ recent articles on AI/devtools showing strong engagement — signal of growing mainstream interest

---

## Headline Releases

| Product | What Shipped | Link |
|---------|--------------|------|
| JetBrains AI 2026 | Full AI-native IDE evolution with context-aware code generation | [Announcement](https://...) |
| Model Context Protocol | Open standard for connecting AI apps to external systems | [GitHub](https://...) |

---

## New Tools & Products

| Name | Category | Status | Description |
|------|----------|--------|-------------|
| [Nimbalyst](https://nimbalyst.com) | IDE/Editor | DISCOVERED | Multi-session AI coding environment with worktree support |
| [MCP SDK](https://github.com/modelcontextprotocol) | Framework | RELEASE | Official SDK for building MCP-compatible tools |

---

## Trends & Patterns

1. **Multi-Session AI Workflow Management** — Growing need for managing parallel AI coding sessions. Tools like Nimbalyst and Claude Code worktrees show developers need isolation between AI agent tasks.

2. **IDE Market Consolidation** — Major players (JetBrains, VS Code, Cursor) evolving toward AI-native experiences. Traditional "AI add-on" model being replaced by AI-first architecture.

3. **Open Standards for AI Integration** — MCP gaining traction as interoperability standard. 5+ new implementations this week, including tool builders and platform integrations.

4. **Community-Driven Tool Discovery** — Reddit and forums driving tool adoption decisions. r/ClaudeAI and r/LocalLLaMA becoming primary sources for real-world usage patterns.

5. **Visual + Code Workflow Convergence** — Blending visual design with code generation. Tools like v0.dev and Bolt.new showing demand for design-to-code AI workflows.

---

## Recommended Subscriptions

```
/subscribe add github jetbrains/ai-2026
/subscribe add reddit r/ClaudeAI
/subscribe add reddit r/LocalLLaMA
/subscribe add changelog modelcontextprotocol.io
```

---

**Sources**: 42 findings across 8 sources
```

## Implementation Plan

### Phase 1: Enhanced LLM Synthesis (Immediate)

**File**: `convex/whatsNew/llm.ts`

1. **Refine the synthesis prompt** to:
   - Emphasize "why it matters" context for TL;DR items
   - Require structured tables for releases and tools
   - Add "Trends & Patterns" section with forward-looking analysis
   - Include inline markdown links for all items

2. **Add finding enrichment**:
   - Generate 1-2 sentence summaries for each finding
   - Extract key metadata (author, stats, engagement)
   - Calculate cross-source corroboration scores

### Phase 2: Improved Fetch Actions (Short-term)

**File**: `convex/whatsNew/actions.ts`

1. **Enhance fetch functions** to capture more metadata:
   - Author/handle information
   - Engagement metrics (upvotes, comments, stars)
   - Publication timestamps
   - Tags/categories from source platforms

2. **Add description extraction**:
   - For GitHub: repo description + topics
   - For HN: title + comment count
   - For Reddit: title + selftext preview
   - For Dev.to: description + tag list

### Phase 3: UI Enhancements (Medium-term)

**Files**: 
- `app/(drawer)/whats-new/[reportId].tsx`
- `components/whats-new/NewsCard.tsx`

1. **Enhanced report detail view**:
   - Better markdown rendering with tables
   - Expandable sections for TL;DR, releases, tools
   - "Copy subscription command" buttons
   - Source attribution badges

2. **Improved news cards**:
   - Show finding category badges
   - Display engagement metrics
   - Preview summaries on cards

### Phase 4: Quality Scoring (Long-term)

**File**: `convex/whatsNew/quality.ts`

1. **Implement LLM-based quality scoring**:
   - Relevance to AI software engineering
   - Signal vs noise ratio
   - Source credibility
   - Freshness (recency bias)

2. **Add deduplication**:
   - URL-based deduplication
   - Title similarity detection
   - Cross-source clustering

## Success Metrics

1. **Report quality**: TL;DR section provides instant value in < 30 seconds
2. **Actionability**: Users can immediately subscribe to new sources
3. **Completeness**: All findings have descriptions and source links
4. **Consistency**: Reports follow the same structure every day
5. **Engagement**: Users click through to findings from the report

## Technical Notes

### Current LLM Synthesis (Pass 1)

The existing prompt in `llm.ts` already requests much of this format:
- TL;DR with inline links
- Headline Releases table
- New Tools table
- Community Pulse section
- Trends to Watch
- Recommended Subscriptions

**Improvements needed**:
- Better enforcement of "why it matters" context
- More informative descriptions in tables
- Consistent table formatting
- Better trend analysis

### Python Script Integration

The `fetch_trends.py` script has excellent patterns we should adopt:
1. **Structured item format** with all metadata
2. **Error handling** with per-source tracking
3. **Rate limiting** between requests
4. **Deduplication** by URL
5. **Engagement metrics** (score, comments, etc.)

We should migrate some of this logic to Convex actions where appropriate.

## Dependencies

- None - builds on existing infrastructure
- LLM API (Zai Pro) already configured
- No new data models required
- UI components exist, need enhancement

## Timeline

- **Phase 1**: 1-2 days (LLM prompt refinement)
- **Phase 2**: 2-3 days (Fetch enhancements)
- **Phase 3**: 3-5 days (UI improvements)
- **Phase 4**: 5-7 days (Quality scoring system)

**Total**: 2-3 weeks for full implementation
