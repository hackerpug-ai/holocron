# Holocron Mobile Research Interface

## Product Description

A React Native mobile application built around a **chat-centric interface** with a **ChatGPT-style drawer navigation** that provides conversational access to the holocron knowledge base and research capabilities. The app uses a pushover drawer menu listing all conversations, with an **Articles** link at the top for browsing the knowledge base. The main view is a chat thread—similar to ChatGPT or Claude—where the user converses with an AI research agent. Slash commands (e.g., `/search`, `/research`, `/deep-research`) invoke server-side research workflows, and results are returned as interactive **result cards** embedded in the chat stream. Tapping a card opens the full research content for reading.

**Navigation Model:** A left-edge drawer (pushover menu) slides over the main content. The drawer contains:
1. **Articles** — a link to the knowledge base browsing view (always pinned at top)
2. **Chat list** — all conversations sorted by most recent, each showing title and last message preview

The primary experience is **chat-first**: opening the app lands on the most recent conversation. Browsing articles is a secondary workflow accessed via the drawer. The chat interface functions like a mobile version of Codex or Claude Code — users issue slash commands (`/research`, `/deep-research`, `/search`, `/browse`, `/stats`) to invoke server-side research workflows conversationally.

**Problem Statement:** Research workflows are currently tied to the Claude Code CLI environment. When away from a development workstation, there's no way to query the holocron knowledge base, conduct research on questions that arise, or leverage the accumulated knowledge artifacts.

**Solution:** A chat-first mobile client with multi-conversation support where the user talks to an AI agent backed by Supabase Edge Functions. The drawer menu provides quick access to past conversations and the articles view, while the chat paradigm provides a familiar, low-friction interface for knowledge work on the go. Each conversation maintains its own context and history, allowing the user to run multiple research threads in parallel.
