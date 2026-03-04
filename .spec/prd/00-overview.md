# Holocron Mobile Research Interface

[UPDATED 2026-03-04]: Added server-side multi-agent architecture for long-running research tasks

## Product Description

A React Native mobile application built around a **chat-centric interface** with a **ChatGPT-style drawer navigation** that provides conversational access to the holocron knowledge base and research capabilities. The app uses a pushover drawer menu listing all conversations, with an **Articles** link at the top for browsing the knowledge base. The main view is a chat thread—similar to ChatGPT or Claude—where the user converses with an AI research agent. Slash commands (e.g., `/search`, `/research`, `/deep-research`) invoke server-side research workflows, and results are returned as interactive **result cards** embedded in the chat stream. Tapping a card opens the full research content for reading.

**Navigation Model:** A left-edge drawer (pushover menu) slides over the main content. The drawer contains:
1. **Articles** — a link to the knowledge base browsing view (always pinned at top)
2. **Chat list** — all conversations sorted by most recent, each showing title and last message preview

The primary experience is **chat-first**: opening the app lands on the most recent conversation. Browsing articles is a secondary workflow accessed via the drawer. The chat interface functions like a mobile version of Codex or Claude Code — users issue slash commands (`/research`, `/deep-research`, `/search`, `/browse`, `/stats`) to invoke server-side research workflows conversationally.

**Server-Side Multi-Agent Architecture:** All slash commands that require extended processing are engineered as **server-side agents** running in long-running tasks. This infrastructure replicates local research skills in Supabase Edge Functions, enabling multi-agent collaboration patterns:

| Pattern | Description | Use Case |
|---------|-------------|----------|
| **Orchestrator-Worker** | Manager delegates to workers, reviews results, iterates | Deep Research (Ralph Loop) |
| **Parallel Swarm** | Cheap workers search simultaneously, synthesizer aggregates | Assimilate, Shop, Research Loop |
| **Team Orchestrator** | Full research team with specialized roles | Deep Research Teamwork |

Each task type has defined agent roles, tools, and prompts — mirroring the local research skills but executed server-side with progress streaming to the mobile client.

**Problem Statement:** Research workflows are currently tied to the Claude Code CLI environment. When away from a development workstation, there's no way to query the holocron knowledge base, conduct research on questions that arise, or leverage the accumulated knowledge artifacts. Additionally, complex multi-agent research workflows require server-side execution to handle long-running tasks with progress updates.

**Solution:** A chat-first mobile client with multi-conversation support where the user talks to an AI agent backed by Supabase Edge Functions. The drawer menu provides quick access to past conversations and the articles view, while the chat paradigm provides a familiar, low-friction interface for knowledge work on the go. Each conversation maintains its own context and history, allowing the user to run multiple research threads in parallel. Long-running tasks execute server-side with real-time progress updates streamed to the chat interface.
