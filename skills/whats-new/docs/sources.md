# What's New: Source Guide

Curated reference of people, hashtags, subreddits, companies, and discovery keywords used by `/whats-new` at runtime. Edit this file to customize scan targets.

---

## People to Follow (Twitter/X)

### AI Tool Builders & Engineers

| Handle | Name | Focus | Why Follow |
|--------|------|-------|------------|
| @swyx | Shawn Wang | AI Engineering, Latent Space | AI engineer community builder, conference organizer |
| @karpathy | Andrej Karpathy | AI/ML, education | LLM insights, tool opinions, foundational thinker |
| @simonw | Simon Willison | AI tools, SQLite, LLMs | Prolific tool reviewer/builder, datasette, llm CLI |
| @alexalbert__ | Alex Albert | Anthropic, Claude | Claude product lead |
| @jxnlco | Jason Liu | AI engineering, structured output | instructor library, patterns |
| @mckaywrigley | Mckay Wrigley | AI coding tools | Chatbot UI, tool builder |
| @amasad | Amjad Masad | Replit, AI agents | AI deployment, agent builder |
| @bioabordeaux | Bio | Cursor tips, AI coding | Practical AI IDE workflows |
| @paul_irish | Paul Irish | Chrome DevTools, web perf | Web tooling perspective on AI |
| @maabordeaux | Matt Pocock | TypeScript, AI tools | TS educator, tool reviewer |

### Company Accounts

| Handle | Company | What to Watch |
|--------|---------|---------------|
| @AnthropicAI | Anthropic | Claude, Claude Code, MCP, API releases |
| @OpenAI | OpenAI | GPT, Codex, ChatGPT, API updates |
| @cursor_ai | Cursor | IDE updates, composer, agent mode |
| @vercel | Vercel | v0, AI SDK, Next.js AI features |
| @github | GitHub | Copilot, Copilot Workspace, Spark |
| @GoogleDeepMind | Google DeepMind | Gemini, AI Studio, AlphaCode |
| @WindsurfAI | Windsurf | AI IDE, Cascade agent |
| @AugmentCode | Augment | Enterprise AI coding |
| @ContinueDev | Continue | Open source AI IDE extension |
| @SourcegraphDev | Sourcegraph | Cody AI code intelligence |
| @LangChainAI | LangChain | LangGraph, agent frameworks |
| @llabordeaux | Val.town | Val Town, serverless AI |

### Independent Voices & Researchers

| Handle | Name | Focus |
|--------|------|-------|
| @emollick | Ethan Mollick | AI adoption research, Wharton |
| @DrJimFan | Jim Fan | AI agents, embodied AI, NVIDIA |
| @ylecun | Yann LeCun | AI research direction, Meta |
| @hardmaru | David Ha | Creative AI, Sakana AI |
| @levelsio | Pieter Levels | AI indie tools, shipping fast |
| @mitchellh | Mitchell Hashimoto | Ghostty, systems engineering |
| @raabordeaux | Rafa | AI agent patterns, engineering |
| @deabordeaux | Deedy Das | AI industry analysis, Menlo Ventures |

---

## Hashtags (Twitter/X)

### Primary (always search)
- #AItools
- #DevTools
- #CodingAgent
- #AIcoding
- #LLMtools
- #AIEngineering
- #AIPairProgramming
- #BuildWithAI

### Secondary (rotate weekly)
- #OpenSourceAI
- #CodeGen
- #AIProductivity
- #PromptEngineering
- #AgenticAI
- #MCPserver
- #CursorAI
- #ClaudeCode
- #Codex
- #AIassistant
- #VibeCoding

---

## Subreddits

### Subscribed (checked via /subscribe)
- r/ClaudeAI - Claude AI community
- r/LocalLLaMA - Local LLM enthusiasts
- r/ChatGPT - ChatGPT community

### Discovery (searched by /whats-new for broader signal)
- r/MachineLearning - Academic + industry crossover, paper discussions
- r/artificial - General AI news aggregation
- r/singularity - Hype-forward but catches launches early
- r/ExperiencedDevs - Practitioner perspective on AI tools
- r/programming - General dev tools, AI adoption debates
- r/devtools - Developer tooling launches and reviews
- r/OpenAI - OpenAI ecosystem discussions
- r/CursorAI - Cursor-specific tips and updates
- r/SideProject - Indie AI tool launches
- r/AIAssisted - AI-assisted development community
- r/learnmachinelearning - Beginner-friendly tool discussions

---

## Bluesky

Bluesky search via `fetch_trends.py bluesky`. Requires `BLUESKY_HANDLE` + `BLUESKY_APP_PASSWORD` env vars.

### Search Queries (rotate)
- `"AI coding tool"` - general AI dev tool chatter
- `"MCP server"` - Model Context Protocol ecosystem
- `"claude code"` - Claude Code specific
- `"cursor AI"` - Cursor IDE discussions
- `"coding agent"` - agent-based development

### Accounts to Watch
| Handle | Focus |
|--------|-------|
| @simonwillison.net | AI tools, LLM CLI, datasette |
| @karpathy.ai | AI/ML insights |
| @swyx.io | AI engineering, Latent Space |
| @atproto.com | AT Protocol / Bluesky ecosystem |

---

## Hacker News

HN search via `fetch_trends.py hn`. Uses Algolia API (hn.algolia.com).

### Search Strategies
| Tag | Use Case | Min Points |
|-----|----------|------------|
| `show_hn` | New launches, projects | 20 |
| `story` | General AI/dev news | 50 |
| `ask_hn` | Community questions, tool recommendations | 30 |

### Query Combinations
```bash
# Show HN launches related to AI coding
fetch_trends.py hn --tags show_hn --min-points 20 --query "AI coding"
# General AI dev stories with high engagement
fetch_trends.py hn --tags story --min-points 50 --query "AI developer tool"
# Ask HN for tool recommendations
fetch_trends.py hn --tags ask_hn --min-points 30 --query "coding assistant"
```

---

## GitHub Trending

GitHub repo search via `fetch_trends.py github`. Optional `GITHUB_TOKEN` for higher rate limits.

### Topic Queries
```bash
# AI coding tools
fetch_trends.py github --query "topic:ai-coding" --min-stars 50
# MCP servers and ecosystem
fetch_trends.py github --query "topic:mcp-server OR topic:model-context-protocol" --min-stars 20
# AI developer tools broadly
fetch_trends.py github --query "AI developer tool" --min-stars 100
# Agent frameworks
fetch_trends.py github --query "topic:ai-agent coding" --min-stars 50
```

---

## Dev.to

Dev.to article search via `fetch_trends.py devto`. No auth required.

### Tags to Monitor
| Tag | Focus |
|-----|-------|
| `ai` | General AI articles |
| `devtools` | Developer tooling |
| `llm` | LLM-specific content |
| `machinelearning` | ML/AI crossover |
| `programming` | General dev + AI adoption |
| `productivity` | AI productivity tools |
| `opensource` | Open source AI projects |

---

## Lobsters

Lobsters hottest feed via `fetch_trends.py lobsters`. No auth required. Returns 25 items per request, client-side date filtering.

### What to Look For
- Posts tagged `ai`, `programming`, `show` (launches)
- Tool announcements and reviews
- Cross-reference with HN (same stories often appear on both)

---

## Companies & Products

### Tier 1: Core Tracking (always check)

| Company | Products | Changelog Source |
|---------|----------|------------------|
| Anthropic | Claude, Claude Code, MCP, API | GitHub releases (anthropics/claude-code) + blog |
| OpenAI | GPT, Codex, ChatGPT, API | changelog.openai.com |
| Cursor | Cursor IDE | cursor.com/changelog |
| GitHub | Copilot, Copilot Workspace, Spark | github.blog |
| Google | Gemini, AI Studio, IDX, Jules | blog.google/technology/ai |

### Tier 2: Competitive Watch

| Company | Products | Why |
|---------|----------|-----|
| Windsurf (Codeium) | Windsurf IDE, Cascade | Direct Cursor competitor, fast iteration |
| Augment | Augment Code | Enterprise AI coding, $252M funding |
| Continue | Continue IDE extension | Open source alternative to Copilot |
| Sourcegraph | Cody | Code intelligence + AI, enterprise |
| Replit | Replit Agent, Ghostwriter | AI deployment, agent-first |
| Vercel | v0, AI SDK | AI-powered frontend generation |
| Convex | Convex backend | AI-friendly backend, reactive |
| Zed | Zed editor | High-performance editor with AI |

### Tier 3: Emerging & Indie

| Project | What | Why Watch |
|---------|------|-----------|
| Aider | CLI AI coding assistant | Open source, popular, Paul Gauthier |
| OpenCode | Terminal AI IDE | Open source competitor to Claude Code |
| Bolt.new | AI full-stack builder | Browser-based, StackBlitz |
| Lovable | AI app builder | No-code AI generation |
| Devin | AI SWE agent | Cognition Labs, autonomous coding |
| SWE-agent | SWE benchmark tool | Princeton, research-driven |
| LangGraph | Agent orchestration | LangChain team, stateful agents |
| CrewAI | Multi-agent framework | Team-based agent patterns |
| AutoGen | Multi-agent framework | Microsoft Research |
| Composio | AI tool integrations | MCP + function calling toolkit |
| E2B | AI code sandboxes | Secure execution for AI agents |
| Pieces | Developer copilot | Context-aware AI assistant |
| Tabnine | AI code completion | Privacy-focused, on-premise |
| Amazon Q | AWS AI assistant | Enterprise, AWS integration |
| JetBrains AI | IDE AI features | IntelliJ ecosystem AI |

---

## Discovery Keywords

### For Finding NEW Tools

These queries are designed to surface tools NOT already in the lists above:

```
"new AI coding tool {year}"
"alternative to cursor {year}"
"alternative to copilot {year}"
"alternative to claude code"
"AI developer productivity tool"
"AI code review tool"
"AI terminal assistant"
"AI debugging tool"
"AI CLI tool {year}"
"open source AI IDE"
"AI pair programmer"
"MCP server" (Model Context Protocol ecosystem)
"AI dev tool launch"
"AI coding agent"
"LLM developer tools"
```

### Hacker News Discovery

```
"Show HN" AI coding
"Show HN" developer tool AI
"Show HN" code assistant
"Show HN" LLM tool
site:news.ycombinator.com "AI" "developer" "tool"
```

### Product Hunt Discovery

```
site:producthunt.com AI developer tool
site:producthunt.com AI coding
site:producthunt.com code assistant
```

### Trend Detection Keywords

These signal newsworthy events when found in posts/tweets:

```
"just launched"
"announcing"
"v1.0" / "v2.0" / major version
"open sourced"
"built in public"
"switching from X to Y"
"replaced {tool} with"
"shut down" / "deprecated"
"acquired by"
"raised $" / "funding"
"waitlist" / "early access"
"general availability"
```

---

## Newsletters (via /subscribe)

Already tracked through `/subscribe`. Listed here for cross-reference:

| Newsletter | Focus | Frequency |
|------------|-------|-----------|
| The Rundown AI | Daily AI news | Daily |
| TLDR AI | AI/ML digest | Daily |
| Ben's Bites | AI business/tools | Daily |
| The Batch (DeepLearning.AI) | AI research digest | Weekly |
| Import AI | AI policy + research | Weekly |
| Latent Space | AI engineering deep dives | Weekly |
| One Useful Thing | AI adoption (Ethan Mollick) | Weekly |
| AI For Developers | AI dev tool reviews (Substack) | Weekly |
| console.dev | Developer tool discovery | Weekly |

---

## YouTube (via /subscribe)

Already tracked through `/subscribe`. Listed for cross-reference:

| Channel | Focus |
|---------|-------|
| @Fireship | Fast tech news, 100-second explainers |
| @ThePrimeagen | Dev tools, opinions, streaming |
| @YannicKilcher | ML paper reviews |
| @DevelopersDigest | AI tool tutorials |
| @aiaboratory (AI Explained) | AI news analysis |
| @syntaxfm | Web dev + AI tools |
| @NateBJones | AI coding workflows |
| @juliaturc1 | AI/ML research |

---

## Aggregator Sites

Useful for discovery track web searches. Not API-accessible but good for web search queries.

| Site | Focus | Search Query Pattern |
|------|-------|---------------------|
| showhntoday.com | Curated Show HN highlights | `site:showhntoday.com AI` |
| mcpservers.org | MCP server directory | `site:mcpservers.org` |
| PulseMCP (pulsemcp.com) | MCP ecosystem tracker | `site:pulsemcp.com` |
| console.dev | Developer tool newsletter/directory | `site:console.dev AI` |
| toolhunt.dev | AI dev tool discovery | `site:toolhunt.dev` |

---

## Maintenance

**Adding new sources**: Edit the relevant section above. Changes take effect on next `/whats-new` run.

**Promoting sources**: When `/whats-new` discovers a valuable recurring source, add it here AND consider `/subscribe add` for automatic tracking.

**Archiving**: If a tool shuts down or a person goes inactive, move them to a `### Archived` subsection rather than deleting (preserves history).
