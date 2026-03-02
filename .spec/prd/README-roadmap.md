# Epic Roadmap: Holocron Mobile Research Interface

> PRD: .spec/prd/README.md
> PRD Version: 3.1.0
> Appetite: 2 weeks (core scope)
> Generated: 2026-03-01
> Functional Groups: 6 | Use Cases: 27 | Epics: 7

---

## Epic Dependency Graph

```
Epic 1 ──► Epic 2 ──► Epic 3 ──► Epic 4 ──► Epic 5 ──► Epic 6
                                    │                      │
                                    └──────► Epic 7 ◄──────┘
```

---

## Epic 1: Foundation & Drawer Navigation

> Sequence: 1 | Tasks: 9 | Blocks: Epic 2, 3, 4, 5, 6, 7

**Theme:** Stand up the Expo project skeleton with drawer navigation, conversation persistence, and multi-conversation CRUD. After this epic, the user can open the app, see a drawer with conversations, create/switch/rename/delete conversations, and land on the most recent chat.

### PRD Sections Covered

- §04 UC-NV-01: Open Drawer Menu
- §04 UC-NV-02: Create New Chat
- §04 UC-NV-03: Switch Conversation
- §04 UC-NV-04: Manage Conversation
- §11 Technical Requirements: conversations table, conversation API endpoints

### Human Test Steps

1. Open the app and verify it lands on the most recent conversation (or an empty new chat if none exist)
2. Swipe from the left edge or tap the hamburger icon to open the pushover drawer
3. Verify the drawer shows "Articles" link pinned at top, app section links, and a conversation list
4. Tap the compose icon in the drawer to create a new conversation and verify it appears at the top of the list
5. Tap a different conversation in the drawer to switch to it and verify the drawer closes
6. Long-press a conversation to rename it and verify the title updates in the list
7. Long-press a conversation to delete it, confirm the dialog, and verify it is removed
8. Delete the last conversation and verify the system creates a new empty conversation automatically

### Task Titles

1. US-001: Set up Expo Router layout with drawer navigation structure
2. US-002: Create `conversations` table migration and Supabase types
3. US-003: Build conversations CRUD Edge Functions (list, create, rename, delete)
4. US-004: Design DrawerContent component (pushover menu with header, section links, conversation list)
5. US-005: Design ConversationRow component (title, last message preview, active state)
6. US-006: Wire drawer to conversations API (list, create, switch)
7. US-007: Implement conversation management actions (rename, delete with confirmation)
8. US-008: Implement app-open-to-most-recent-conversation logic
9. US-009: Design drawer header with search bar placeholder and compose button

---

## Epic 2: Chat Thread & Messaging

> Sequence: 2 | Tasks: 9 | Blocks: Epic 3, 4, 5, 6 | Depends on: Epic 1

**Theme:** Build the core chat experience — message thread with user/agent bubbles, input bar, message persistence, and basic agent responses. After this epic, the user can send messages, see agent responses, scroll through history, and have conversations persist across app restarts.

### PRD Sections Covered

- §05 UC-CI-01: Send Chat Message
- §05 UC-CI-04: View Chat History
- §11 Technical Requirements: chat_messages table, chat-send endpoint, chat-history endpoint

### Human Test Steps

1. Type a message in the chat input bar and tap send (or press enter)
2. Verify the user's message appears as a chat bubble immediately
3. Verify a typing/thinking indicator appears while the agent processes
4. Verify the agent's response appears as a distinct message bubble
5. Scroll up to see older messages and verify infinite scroll loads more
6. Close and reopen the app — verify chat history persists
7. Verify messages show timestamps
8. Verify empty message cannot be sent (send button disabled)

### Task Titles

1. US-010: Create `chat_messages` table migration with types and indexes
2. US-011: Build `chat-send` Edge Function with basic agent response routing
3. US-012: Build `chat-history` Edge Function with cursor-based pagination
4. US-013: Design MessageBubble component (user, agent, system variants)
5. US-014: Design ChatThread component with auto-scroll and infinite scroll pagination
6. US-015: Design ChatInput component with send button and empty validation
7. US-016: Wire ChatThread to chat-history API with pagination
8. US-017: Wire ChatInput to chat-send API with optimistic updates
9. US-018: Add typing indicator and timestamp display to message bubbles

---

## Epic 3: Slash Commands & Command Panel

> Sequence: 3 | Tasks: 7 | Blocks: Epic 4, 5, 6 | Depends on: Epic 2

**Theme:** Implement the slash command system with typeahead panel, real-time filtering, and command routing. After this epic, the user can type `/` to see available commands, filter them as they type, select a command, and submit it with arguments.

### PRD Sections Covered

- §05 UC-CI-02: Use Slash Commands
- §01 Scope: slash command typeahead panel, "/" action button trigger

### Human Test Steps

1. Type `/` in the chat input and verify the command panel appears above the input bar
2. Tap the "/" action button to the left of the input and verify the command panel opens
3. Verify the panel shows all supported commands: `/search`, `/research`, `/deep-research`, `/browse`, `/stats`, `/resume`, `/help`
4. Type `/re` and verify only `/research` and `/resume` are shown (real-time filtering)
5. Type characters that match no commands and verify the panel dismisses
6. Tap a command in the panel and verify it is inserted into the input with a syntax hint
7. Submit a slash command and verify it renders distinctly from regular messages (monospace + badge)
8. Type `/help` and verify all commands with descriptions are displayed

### Task Titles

1. US-019: Build slash command parser in chat-send Edge Function
2. US-020: Design CommandPanel component (typeahead list above input)
3. US-021: Design SlashCommandMessage component (monospace styling with command badge)
4. US-022: Wire "/" button trigger and keyboard trigger to CommandPanel
5. US-023: Implement real-time command filtering and selection
6. US-024: Implement command insertion with syntax hint on selection
7. US-025: Build `/help` command handler returning command descriptions

---

## Epic 4: Knowledge Base & Result Cards

> Sequence: 4 | Tasks: 10 | Blocks: Epic 7 | Depends on: Epic 3

**Theme:** Connect the chat to the holocron knowledge base through `/search`, `/browse`, and `/stats` commands. Build result cards for inline display and an article detail view for reading full content. Add the Articles browse view accessible from the drawer. After this epic, the user can search, browse, and read articles entirely through the chat interface or the dedicated articles view.

### PRD Sections Covered

- §05 UC-CI-03: View Result Cards
- §06 UC-KB-01: Search via Chat
- §06 UC-KB-02: Browse Categories
- §06 UC-KB-03: View Article from Card
- §06 UC-KB-04: View Statistics
- §06 UC-KB-05: Browse Articles View
- §04 UC-NV-06: Navigate App Sections (Articles navigation)

### Human Test Steps

1. Type `/search <query>` and verify result cards appear inline in the chat thread
2. Verify each result card shows title, category badge, relevance score, and snippet
3. Tap a result card and verify the full article opens in a detail view with markdown rendering
4. Swipe back from the detail view and verify the chat thread is at the same scroll position
5. Type `/browse` and verify a card listing all categories with document counts appears
6. Type `/browse <category>` and verify articles for that category appear as cards
7. Type `/stats` and verify a stats card shows total documents, category breakdown, and recent articles
8. Open the drawer, tap "Articles", and verify the articles browse view loads with category filters and search

### Task Titles

1. US-026: Design ResultCard component (article, research, stats, category_list variants)
2. US-027: Design ArticleDetailView (full-screen overlay with markdown rendering, action buttons)
3. US-028: Design ArticlesBrowseView (scrollable list, category chip filter, search input, doc count)
4. US-029: Wire `/search` command to existing `rpc/hybrid_search` RPC function
5. US-030: Wire `/browse` command to category-based document queries
6. US-031: Wire `/stats` command to document count and category aggregation
7. US-032: Wire ResultCard tap → ArticleDetailView navigation with back gesture
8. US-033: Wire Articles link in drawer → ArticlesBrowseView with Expo Router
9. US-034: Implement article search and category filtering in ArticlesBrowseView
10. US-035: Wire app section navigation from drawer (Holocron, Articles, Settings routes)

---

## Epic 5: Basic Research

> Sequence: 5 | Tasks: 8 | Blocks: Epic 6 | Depends on: Epic 4

**Theme:** Enable server-side research through the `/research` command with real-time progress streaming and result cards. After this epic, the user can initiate research, watch progress updates stream into chat, see the completed result as a card, and browse research history.

### PRD Sections Covered

- §07 UC-RS-01: Initiate Research via Slash Command
- §07 UC-RS-02: Monitor Research in Chat
- §07 UC-RS-03: View Research Results Card
- §07 UC-RS-04: Research History
- §11 Technical Requirements: research_sessions table, research API endpoints

### Human Test Steps

1. Type `/research <query>` and verify the agent responds with a confirmation including research type
2. Verify progress messages appear in chat as the research progresses (searching → analyzing → synthesizing)
3. Verify progress messages update in-place (not flooding the chat)
4. Verify a research result card appears when research completes with title, summary, confidence score, and source count
5. Tap the result card to view the full research report with citations
6. Verify the agent confirms the research was auto-saved to holocron
7. Type `/history` and verify past research sessions appear as cards
8. Type `/cancel` during active research and verify the research stops with a cancellation message

### Task Titles

1. US-036: Create `research_sessions` table migration with types, indexes, and status enum
2. US-037: Build `research-start` Edge Function with session creation and async execution trigger
3. US-038: Build `research-execute` Edge Function (search → analyze → synthesize workflow)
4. US-039: Set up Supabase Realtime subscription for research progress updates
5. US-040: Design ProgressMessage component (updatable status with elapsed time)
6. US-041: Design ResearchResultCard variant with confidence score and source count
7. US-042: Wire `/research` command → session creation → progress streaming → result card
8. US-043: Build `/history` and `/cancel` command handlers

---

## Epic 6: Deep Research

> Sequence: 6 | Tasks: 9 | Blocks: Epic 7 | Depends on: Epic 5

**Theme:** Enable multi-iteration deep research via `/deep-research` with iteration tracking, resume capability, and an iteration timeline in the detail view. After this epic, the user can run multi-pass research sessions, watch iterations progress, resume interrupted sessions, and review iteration-by-iteration findings.

### PRD Sections Covered

- §08 UC-DR-01: Initiate Deep Research
- §08 UC-DR-02: Monitor Iterations in Chat
- §08 UC-DR-03: Resume Session
- §08 UC-DR-04: View Iteration Cards
- §11 Technical Requirements: research_iterations table, citations table, deep research API endpoints

### Human Test Steps

1. Type `/deep-research <topic>` and verify a confirmation card shows topic, max iterations, and estimated duration
2. Verify iteration summary cards appear after each iteration with iteration number, coverage score, and key findings
3. Verify reviewer feedback and refined queries are shown between iterations
4. Type `/cancel` during deep research and verify it stops after the current iteration
5. Type `/resume` and verify a list of incomplete sessions appears as cards
6. Tap a session card or type `/resume <id>` and verify research resumes from the last checkpoint
7. Verify the final result card appears when all iterations complete with a synthesized report
8. Tap the final result card and verify the detail view includes an iteration timeline with score progression

### Task Titles

1. US-044: Create `research_iterations` and `citations` table migrations
2. US-045: Build `deep-research-start` Edge Function with session and iteration loop setup
3. US-046: Build `research-iterate` Edge Function (single iteration execution with review)
4. US-047: Build `research-synthesize` Edge Function (final report generation from all iterations)
5. US-048: Build `research-resume` Edge Function (resume from last checkpoint)
6. US-049: Design IterationSummaryCard component (iteration number, coverage score, findings)
7. US-050: Design IterationTimeline component (score progression visualization in detail view)
8. US-051: Wire `/deep-research` command → iteration loop → summary cards → final result
9. US-052: Wire `/resume` command → session list → resume flow with progress streaming

---

## Epic 7: Article Management & Navigation Extras

> Sequence: 7 | Tasks: 9 | Depends on: Epic 4, Epic 6

**Theme:** Add article management actions (edit, delete, recategorize) to the detail view and complete remaining drawer features (conversation search, section navigation highlights). After this epic, the user can fully manage articles from within the app and use all drawer features.

### PRD Sections Covered

- §09 UC-AM-01: Save Research (auto-save confirmation)
- §09 UC-AM-02: Edit Article
- §09 UC-AM-03: Delete Article
- §09 UC-AM-04: Change Category
- §04 UC-NV-05: Search Conversations
- §04 UC-NV-06: Navigate App Sections (current section highlighting)

### Human Test Steps

1. Complete a research and verify the agent confirms auto-save with document ID in chat
2. Open an article from a result card and tap the edit button
3. Modify the title and content, save, and verify changes persist
4. Open an article and tap the category badge to change its category via the picker
5. Open an article and tap delete, confirm in the dialog, and verify the article is removed
6. Open the drawer and type in the search bar to filter conversations by title
7. Verify matching conversations remain visible and non-matching are hidden
8. Verify clearing the search restores the full conversation list

### Task Titles

1. US-053: Implement auto-save research results to holocron with chat confirmation (UC-AM-01)
2. US-054: Design ArticleEditView (title input + markdown editor + save/cancel)
3. US-055: Wire article edit to update document + regenerate embedding
4. US-056: Design DeleteConfirmation dialog for articles
5. US-057: Wire article delete with confirmation and chat notification
6. US-058: Design CategoryPicker component with valid category enum values
7. US-059: Wire category change to update document and chat notification
8. US-060: Implement conversation search in drawer (real-time filtering, debounced server query)
9. US-061: Implement active section highlighting in drawer navigation

---

## Coverage Summary

| PRD Section | Stability | Epic(s) |
|-------------|-----------|---------|
| §00 Overview | PRODUCT_CONTEXT | (context) |
| §01 Scope | FEATURE_SPEC | All |
| §02 Roles | PRODUCT_CONTEXT | (context) |
| §03 Functional Groups | FEATURE_SPEC | All |
| §04 Navigation (UC-NV-01–04) | FEATURE_SPEC | Epic 1 |
| §04 Navigation (UC-NV-05–06) | FEATURE_SPEC | Epic 7 |
| §05 Chat Interface (UC-CI-01, CI-04) | FEATURE_SPEC | Epic 2 |
| §05 Chat Interface (UC-CI-02) | FEATURE_SPEC | Epic 3 |
| §05 Chat Interface (UC-CI-03) | FEATURE_SPEC | Epic 4 |
| §06 Knowledge Base (UC-KB-01–05) | FEATURE_SPEC | Epic 4 |
| §07 Research (UC-RS-01–04) | FEATURE_SPEC | Epic 5 |
| §08 Deep Research (UC-DR-01–04) | FEATURE_SPEC | Epic 6 |
| §09 Article Management (UC-AM-01–04) | FEATURE_SPEC | Epic 7 |
| §11 Technical Requirements | CONSTITUTION | Epic 1–7 (infra tasks) |

**PRD Coverage: 100%** (27/27 use cases mapped)

---

## Epic Statistics

| Epic | Tasks | Use Cases | Functional Groups |
|------|-------|-----------|-------------------|
| Epic 1: Foundation & Drawer Navigation | 9 | 4 | NV |
| Epic 2: Chat Thread & Messaging | 9 | 2 | CI |
| Epic 3: Slash Commands & Command Panel | 7 | 1 | CI |
| Epic 4: Knowledge Base & Result Cards | 10 | 6 | CI, KB, NV |
| Epic 5: Basic Research | 8 | 4 | RS |
| Epic 6: Deep Research | 9 | 4 | DR |
| Epic 7: Article Management & Navigation Extras | 9 | 6 | AM, NV |
| **Total** | **61** | **27** | **6** |

---

## Next Steps

After approval, run `/kb-project-plan .spec/prd/README.md` (without `--roadmap`) to generate the full task files with:
- Template-compliant task definitions (SPEC framework)
- Acceptance criteria in GIVEN-WHEN-THEN format
- Agent assignments with rationale
- Write-allowed guardrails per task
- Verification gates with exact commands
