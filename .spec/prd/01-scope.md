# Scope

## In Scope

- **Drawer navigation** (pushover menu) with conversation list and articles link
- **Multi-conversation support** with create, rename, and delete conversations
- Chat-centric main view with message thread (user messages + agent responses)
- **Articles main view** for browsing the knowledge base (accessible from drawer)
- Slash command system for invoking server-side actions (`/search`, `/research`, `/deep-research`, `/browse`, `/stats`)
- Result cards rendered inline in the chat stream for search results, articles, and research findings
- Card drill-down: tapping a result card opens full article/research content
- Natural language queries interpreted by server-side AI agent
- Query holocron knowledge base via hybrid/FTS/vector search (through chat)
- Initiate basic research requests via `/research` command
- Initiate deep research sessions via `/deep-research` command
- Real-time progress updates streamed as chat messages during research
- Resume interrupted deep-research sessions via `/resume` command
- Save research results to holocron (auto-save with confirmation in chat)
- Chat history persistence across sessions (per conversation)
- Slash command typeahead panel (appears above input on `/` keystroke or "/" button tap) with real-time filtering
- Slash command help via `/help`
- Service key authentication (dev mode, local use only)
- App opens to most recent conversation (chat-first experience)

## Out of Scope

- User authentication/multi-user support (personal tool, service key only)
- Offline mode / local-first sync
- Push notifications for research completion
- `/assimilate` skill (repository analysis requires file system access)
- `/shop` skill (product comparison workflow)
- `/librarian` skill (runs as post-processing hook, not user-facing)
- Voice input for research queries
- Image/PDF upload for analysis
- Publishing to app stores (dev mode only)
- Rich text editing in chat input (plain text + slash commands only)
- Conversation folders or tagging (flat list for MVP)
- Conversation search (find by title only via drawer scroll)
