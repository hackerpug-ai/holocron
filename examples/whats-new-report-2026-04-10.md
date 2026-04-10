# WHAT'S NEW — AI Software engineering Briefing
## April 9-10, 2026

---

### TL;DR (Top 5)

1. **Anthropic launches Claude Mythos Preview + Project Glasswing** — Model so powerful it found zero-day vulnerabilities in Linux kernel and a 13-year-old ActiveMQ RCE. Anthropic is **withholding public release** citing safety concerns. Partners include AWS, Microsoft, Google, Cisco, JPMorgan, CrowdStrike.
2. **OpenAI launches $100/mo ChatGPT Pro** — 5x Codex usage vs Plus tier, directly targeting Claude Code users. Codex has 3M+ weekly users.
3. **Anthropic ships Advisor Strategy + Claude Cowork GA + Managed Agents** — Opus advisor paired with Sonnet/Haiku executor; Cowork goes GA with enterprise RBAC, OpenTelemetry, Zoom MCP connector; Managed Agents for production deployment.
4. **Claude Code v2.1.98 released** — Google Vertex AI setup wizard, Perforce mode, Monitor tool for background scripts, subprocess sandboxing, `/agents` tabbed layout.
5. **GitHub Dependabot now assignable to AI agents** — Alerts can be assigned to Copilot, Claude, or Codex for automated vulnerability remediation.

---

### HEADLINE RELEASES

| Product | What | Source |
|---------|------|--------|
| **Claude Mythos Preview + Project Glasswing** | Most powerful model to date, found zero-days in critical infrastructure. Withheld from public release. $100M in credits committed to security partners. | [Anthropic](https://www.anthropic.com/glasswing) |
| **OpenAI ChatGPT Pro ($100/mo)** | New tier with 5x Codex usage, directly competing with Claude Code subscriptions | [CNBC](https://www.cnbc.com/2026/04/09/openai-chatgpt-pro-subscription-anthropic-claude-code.html) |
| **Claude Managed Agents (public beta)** | Cloud service for production agent deployment with sandboxing, orchestration, governance. Customers: Notion, Asana, Sentry | [WinBuzzer](https://winbuzzer.com/2026/04/10/anthropic-launches-claude-managed-agents-enterprise-ai-xcxwbn/) |
| **Claude Cowork GA** | General availability, enterprise RBAC, spend limits, OpenTelemetry, Zoom MCP connector | [TheNewStack](https://thenewstack.io/anthropic-takes-claude-cowork-out-of-preview-and-straight-into-the-enterprise) |
| **Claude Code v2.1.98** | Vertex AI wizard, Perforce mode, Monitor tool, subprocess sandboxing with PID namespace isolation | [GitHub](https://github.com/anthropics/claude-code/releases/tag/v2.1.98) |
| **GitHub Dependabot -> AI Agents** | Alerts assignable to Copilot, Claude, or Codex for automated remediation | [GitHub Blog](https://github.blog/changelog/2026-04-07-dependabot-alerts-are-now-assignable-to-ai-agents-for-remediation) |
| **Cursor 3.0 + Remote Agents** | Advanced AI-assisted dev; Remote Agents let you control dev from any device | [BuildFastWithAI](https://www.buildfastwithai.com/blogs/cursor-remote-agents-any-device-2026) |
| **Cursor Bugbot update** | Resolution rate jumped 52% -> 78.13%, now supports MCP protocol | [GetAIBook](https://getaibook.com/news/bugbot-now-learns-from-human-feedback-to-fix-more-code/) |
| **Zoom MCP Connector** | Access Zoom Meetings data directly in Claude Cowork and Claude Code | [Zoom News](https://news.zoom.com/zoom-meeting-intelligence-in-claude) |

---

### NEW TOOLS & PRODUCTS

#### DISCOVERED

| Tool | Description | Stars/Signal | Source |
|------|-------------|-------------|--------|
| **RTK** | CLI proxy reducing LLM token consumption 60-90%, single Rust binary | 22.3k | [GitHub](https://github.com/rtk-ai/rtk) |
| **Kaku** | Fast terminal built for AI coding, written in Rust | 4k | [GitHub](https://github.com/tw93/Kaku) |
| **Apiiro CLI** | Turns AI coding assistants into security engineers with real-time guidance | NEW | [Apiiro](https://apiiro.com/blog/security-tools-were-built-for-humans-we-built-one-for-ai-agents-introducing-apiiro-cli) |
| **Pilot Shell** | Spec-driven plans + enforced quality gates for Claude Code | 1.6k | [GitHub](https://github.com/maxritter/pilot-shell) |
| **HolyClaude** | AI coding workstation: Claude Code + web UI + 7 AI CLIs + headless browser | 1.9k | [GitHub](https://github.com/CoderLuii/HolyClaude) |
| **Nanocoder** | Local-first community-built coding agent for terminal | 1.7k | [GitHub](https://github.com/Nano-Collective/nanocoder) |
| **Maki** | "The efficient coder" AI agent | NEW | [maki.sh](https://maki.sh/) |
| **Kilo Code rebuilt** | Rebuilt on open-source OpenCode core; parallel tool calls, subagents, 500+ models | 17.9k | [Kilo Docs](https://kilo.ai/docs/code-with-ai/platforms/vscode/whats-new) |
| **Mozilla 0DIN** | Open-source AI security scanner launched on Product Hunt | NEW | [Mozilla Blog](https://blog.mozilla.org/en/mozilla-new-products/0din-ai-security-scanner) |
| **x402 Foundation** | Open protocol for AI agent micropayments via HTTP 402. Visa, Coinbase, Stripe backing. | NEW | [Linux Foundation](https://www.weex.com/news/detail/x402-protocol-news-how-this-open-source-ai-payment-standard-gains-global-adoption-in-2026-637529) |
| **Gemini CLI** | Google's official open-source terminal agent with ReAct loop, MCP support, 1M context. Apache 2.0, free. Google's answer to Claude Code. | NEW Apr 2026 | [awesome-ai-agents-2026](https://github.com/caramaschiHG/awesome-ai-agents-2026) |
| **Bernstein** | Deterministic parallel coding agent orchestrator. Decomposes goals into tasks, assigns to isolated git worktrees, verifies, merges. Zero LLM tokens on scheduling. 18+ agents supported. | Apache 2.0 | [GitHub](https://github.com/chernistry/bernstein) |
| **Kiro** | Spec-driven AI IDE+CLI. Write specs, auto-generate tasks, implement. Hooks for automated testing/docs. Free beta. | NEW | [kiro.dev](https://kiro.dev/) |
| **TeamHero** | OSS multi-agent orchestration with web dashboard, task lifecycle, persistent memory, conflict prevention. Built on Claude Code. | 18 stars, MIT | [GitHub](https://github.com/sagiyaacoby/TeamHero) |
| **Caliber** | CLI that fingerprints projects and generates/syncs AI agent configs (CLAUDE.md, .cursor/rules/, AGENTS.md). Scores config quality. | NEW | awesome-claude-code |
| **Dyad** | OSS local-first no-code app builder. Works with OpenAI, Google, Anthropic, free models. Alternative to Lovable/Bolt. | NEW | [dyad.sh](https://dyad.sh) |
| **Mission Control** | OSS "cockpit for the agentic era" — manage AI agent swarms with autonomous daemon, Field Ops, approval workflows. | NEW | [GitHub](https://github.com/MeisnerDan/mission-control) |
| **Microsoft Canvas Apps MCP** | Build Power Apps through natural conversation via MCP server. Claude Code, Copilot, or any MCP agent. | Enterprise | [Microsoft Blog](https://www.microsoft.com/en-us/power-platform/blog/2026/04/09/whats-new-in-power-platform-april-2026-feature-update) |
| **Entroly** | Context engineering engine. 100% codebase visibility with 78% fewer tokens. Rust engine, <10ms. MCP + HTTP proxy. | NEW | [awesome-ai-agents-2026](https://github.com/caramaschiHG/awesome-ai-agents-2026) |
| **GNAP** | Git-Native Agent Protocol. Coordinate agent teams with 4 JSON files in a git repo. No server, no database. MIT. | Novel approach | [awesome-ai-agents-2026](https://github.com/caramaschiHG/awesome-ai-agents-2026) |

#### UPDATED (Known Tools with Activity)

| Tool | What Changed | Source |
|------|-------------|--------|
| **Antigravity Skills** | 1,370+ agentic skills library for Claude Code, Cursor, Codex, Gemini CLI | [GitHub](https://github.com/sickn33/antigravity-awesome-skills) (32k stars) |
| **Serena** | MCP toolkit for semantic code retrieval and editing | [GitHub](https://github.com/oraios/serena) (22.7k stars) |
| **KiloCode** | #1 coding agent on OpenRouter, 1.5M+ users, 25T+ tokens processed | [GitHub](https://github.com/Kilo-Org/kilocode) (17.9k stars) |

---

### COMMUNITY PULSE

#### Reddit Hot Takes
- **"Claude Code Caveman Mode"** — viral hack teaching Claude to talk like a caveman to slash output tokens by 75% | [nathanonn.com](https://www.nathanonn.com/claude-code-caveman-mode)
- **AMD's AI director publicly criticizes Claude Code** — "Claude cannot be trusted to perform complex engineering tasks" | [Times of India](https://timesofindia.indiatimes.com/technology/tech-news/amds-ai-director-is-not-happy-with-anthropics-claude-code/)
- **"Are people with Max plan doing ok?"** — honest discussion about $200/mo subscription ROI (269 upvotes)
- **"Anyone still have coworkers who refuse to use AI?"** — April 2026 reality check on adoption friction
- **Claude uncovers 13-year-old ActiveMQ RCE** — Mythos found critical vulnerability within minutes | [CSO Online](https://www.csoonline.com/article/4157146/claude-uncovers-a-13-year-old-activemq-rce-bug-within-minutes.html)
- **Fake Claude Code downloads spreading malware** — Huntress reports malicious sites targeting Claude Code searchers | [Huntress](https://www.huntress.com/blog/fake-claude-malware-download)
- **Anthropic loses appeals court bid** — Pentagon blacklisting upheld; Mythos cyber threats discussed with major banks | [Fox News](https://www.foxnews.com/politics/federal-appeals-court-rejects-anthropic-bid-block-pentagon-blacklist-ai-dispute)
- **"the state of LocalLLama"** — active discussion about local LLM landscape (1,081 upvotes)
- **Advisor strategy coming to Claude Platform** — Opus as advisor paired with Sonnet/Haiku as executor (559 upvotes)
- **"Anthropic shipped 74 product releases in 52 days"** — Claude Cowork GA, enterprise controls, OpenTelemetry (348 upvotes)
- **Local (small) LLMs found the same vulnerabilities as Mythos** — community finding (734 upvotes)

#### Cursor 3 Growing Pains
- "Cursor is unusable, extremely slow" — users downgrading to 2.x
- Phantom unsaved changes bug persists across restarts
- Jupyter Notebooks + AI Panel broken after upgrade to Cursor 3
- Plugin updates, local overrides, and cursor.directory trust boundary issues

---

### TRENDS & PATTERNS

1. **Security is THE battleground** — Glasswing, Mythos zero-days, Apiiro CLI, Dependabot-to-agent, Mozilla 0DIN, fake downloads, AMD criticism — security is the dominant narrative of the week
2. **The $100 price point is the new mid-tier** — OpenAI ($100 Pro) and Anthropic ($100 tier) converge on identical pricing for mid-tier coding agent access
3. **Agent infrastructure maturation** — Managed Agents, Dependabot pipelines, Bugbot self-improvement, subprocess sandboxing — focus shifted from "can AI code?" to "can agents run reliably in production?"
4. **Token optimization is a category** — RTK (60-90%), Caveman Mode (75%), local Ollama routing, Entroly (78% via knapsack-optimal selection) — developers are fighting token costs as a primary concern
5. **MCP has its "HTTP moment"** — 97M+ downloads, 10,000+ public servers, dedicated conference circuit (AAIF 2026), enterprise adoption accelerating with Microsoft, Visa, security vendors
6. **AI agent payments emerging** — x402 Foundation with Visa/Coinbase/Stripe backing means agents will soon transact autonomously
7. **Multi-agent orchestration is a distinct category** — Bernstein, TeamHero, Mission Control, GNAP all tackle "how do you manage multiple agents" from different angles
8. **Git-based coordination is the preferred isolation pattern** — worktree isolation, git-native protocols (GNAP) for parallel agent execution

---

### PEOPLE TO WATCH

- **Gary Marcus** — [skeptical take on Mythos announcement](https://garymarcus.substack.com/p/three-reasons-to-think-that-the-claude), calling it overblown
- **@helderberto** (Dev.to) — "Skills Are the New CLI" essay framing the emerging abstraction
- **Igor Tsyganskiy** (Microsoft EVP Cybersecurity) — leading Mythos security evaluation at Microsoft
- **Huntress security team** — tracking fake AI tool downloads, a growing threat vector

---

### SUBSCRIPTION RECOMMENDATIONS

```
/subscribe github rtk-ai/rtk "RTK - CLI proxy cutting LLM token usage 60-90%"
/subscribe github tw93/Kaku "Kaku - AI-native terminal built in Rust"
/subscribe github maxritter/pilot-shell "Pilot Shell - Spec-driven Claude Code quality gates"
/subscribe github anthropics/claude-code "Claude Code releases"
/subscribe github chernistry/bernstein "Bernstein - Deterministic parallel agent orchestrator"
/subscribe github caramaschiHG/awesome-ai-agents-2026 "340+ curated AI agent tools"
/subscribe website https://apiiro.com/blog "Apiiro - Security for AI coding agents"
/subscribe website https://kiro.dev "Kiro - spec-driven AI IDE"
```

---

### METHODOLOGY

This report was generated using the `/whats-new` skill with the following methodology:

**Data Sources (4 tracks, 6 parallel workers):**
- Track 1: Reddit Pulse — 8 subreddits via direct API + web search (ClaudeAI, LocalLLaMA, ChatGPT, MachineLearning, devtools, OpenAI, CursorAI, SideProject)
- Track 2: HN + Bluesky Signal — Hacker News Show HN + top stories via Algolia API
- Track 3: Releases & Launches — GitHub trending repos via search API + web search for changelogs
- Track 4: Discovery — Dev.to + Lobsters via API + web search for unknown tools

**Direct API Calls (Phase A):**
- `fetch_trends.py reddit` — 15 posts from 8 subreddits
- `fetch_trends.py hn` (Show HN) — 4 posts with 20+ points
- `fetch_trends.py hn` (AI coding stories) — 0 qualifying posts
- `fetch_trends.py github` — 10 trending AI coding repos (50+ stars)
- `fetch_trends.py devto` — 15 articles across ai/devtools/llm tags
- `fetch_trends.py lobsters` — 15 posts

**Web Search Workers (Phase B):**
- 3 research-worker agents dispatched in parallel (haiku model)
- Track 1: Reddit + social trends — 12 findings, HIGH confidence
- Track 3: Releases & launches — still running at report time
- Track 4: Discovery new tools — 12 key findings, MEDIUM confidence

**Deduplication & Cross-Referencing:**
- Same URL merged across tracks, keeping richest summary
- Multi-source boost: items found on 2+ tracks prioritized
- Tags: [KNOWN] = from existing subscriptions, [DISCOVERY] = new find, [MULTI-SOURCE] = appeared across 2+ tracks

---

```
========================================================================
WHAT'S NEW COMPLETE
========================================================================
Period:        April 9-10, 2026 (1 day)
Findings:      65+ (22 new discoveries)
Releases:      9 headline releases
Trends:        8 cross-track patterns
Recommended:   8 subscriptions
Workers:       4 dispatched (3 completed, 1 timed out)
Sources:       Reddit, HN, GitHub, Dev.to, Lobsters, web search
Generated:     2026-04-10T14:25:00Z
========================================================================
```
