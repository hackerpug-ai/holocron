# Lay of the Land

A visual guide to understanding the Holocron codebase structure and how everything fits together.

## Quick Visual Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HOLOCRON                                       │
│                     Personal Knowledge Base + AI                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │   MOBILE APP    │    │   MCP SERVER    │    │   PYTHON CLI    │        │
│  │  (React Native) │    │  (Claude Code)   │    │   (Terminal)    │        │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘        │
│           │                      │                       │                 │
│           └──────────────────────┼───────────────────────┘                 │
│                                  ▼                                         │
│                    ┌─────────────────────────┐                             │
│                    │      CONVEX BACKEND     │                             │
│                    │  (Database + Functions) │                             │
│                    └───────────┬─────────────┘                             │
│                                │                                           │
│                   ┌────────────┼────────────┐                              │
│                   ▼            ▼             ▼                              │
│           ┌───────────┐ ┌──────────┐ ┌──────────────┐                      │
│           │  LLM API  │ │  ArXiv   │ │  Web Search  │                      │
│           │ (Z.ai/    │ │   API    │ │              │                      │
│           │  OpenAI)  │ │          │ │              │                      │
│           └───────────┘ └──────────┘ └──────────────┘                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Directory Structure Explained

### `/app` - The Mobile Application (Expo Router)
**What lives here:** All user-facing screens and navigation

```
app/
├── (drawer)/           # Main app with drawer navigation
│   ├── _layout.tsx     # Drawer navigation setup
│   ├── index.tsx       # Home screen (chat)
│   ├── articles.tsx    # Article browser
│   ├── chat/           # Chat screens
│   ├── research/       # Research workflow screens
│   └── ...
├── _layout.tsx         # Root layout (ConvexProvider)
└── +not-found.tsx      # 404 page
```

**Key concept:** File-based routing. Every `.tsx` file is a route.

### `/convex` - The Backend (Convex Functions)
**What lives here:** All database operations and business logic

```
convex/
├── schema.ts                    # Database schema (58+ tables)
├── conversations/               # Chat conversation CRUD
│   ├── queries.ts               # Read operations
│   ├── mutations.ts             # Write operations
│   └── actions.ts               # External API calls
├── chatMessages/                # Message CRUD
├── documents/                   # Document + search
│   └── search/                  # Search functions
│       ├── fts.ts               # Full-text search
│       ├── vector.ts            # Semantic search
│       └── hybrid.ts            # Combined search
├── research/                    # Research workflows
│   ├── actions.ts               # Start/manage research
│   └── queries.ts               # Query results
├── chat/                        # AI integration
│   └── actions.ts               # LLM calls
└── subscriptions/               # YouTube/news feeds
```

**Key concept:** Organized by domain. Each folder has `queries.ts` (read), `mutations.ts` (write), `actions.ts` (external APIs).

### `/components` - Reusable UI Components
**What lives here:** Shared React Native components

```
components/
├── ui/                         # UI primitives (buttons, cards, etc.)
│   ├── FeatureCard.tsx
│   ├── SearchBar.tsx
│   └── ...
└── forms/                      # Form components
    ├── LoginForm.tsx
    └── ...
```

**Key concept:** Named exports (not default) for reusability.

### `/hooks` - Custom React Hooks
**What lives here:** Reusable stateful logic

```
hooks/
├── useUrlValue.ts              # URL param extraction
├── useDebounce.ts              # Debounce values
├── usePrevious.ts              # Track previous value
└── use-semantic-theme.ts       # Theme access
```

**Key concept:** Hooks extract stateful logic from components.

### `/lib` - Utilities and Helpers
**What lives here:** Pure functions and configurations

```
lib/
├── types/                      # TypeScript types
├── logging/                    # Structured logging
└── utils.ts                    # Helper functions
```

**Key concept:** No side effects. Pure functions preferred.

### `/holocron-mcp` - MCP Server
**What lives here:** Claude Code integration

```
holocron-mcp/
├── src/                        # MCP server implementation
│   ├── index.ts                # 42 MCP tools
│   └── tools/                  # Tool implementations
└── dist/                       # Compiled output
```

**Key concept:** Exposes Convex functions as MCP tools for Claude Code.

## Data Flow Examples

### Example 1: User Sends a Chat Message

```
1. User types in app/(drawer)/index.tsx
                        ↓
2. Calls useAction(api.chat.actions.sendMessage)
                        ↓
3. Convex action (convex/chat/actions.ts) calls LLM API
                        ↓
4. Stores response in chatMessages table
                        ↓
5. useQuery(api.chatMessages.queries.list) auto-updates
                        ↓
6. Screen re-renders with new message
```

### Example 2: User Searches Documents

```
1. User searches in app/(drawer)/index.tsx
                        ↓
2. Calls useQuery(api.documents.search.hybridSearch, {query})
                        ↓
3. Convex query (convex/documents/search/hybrid.ts):
   - Runs full-text search
   - Runs vector search
   - Blends scores
                        ↓
4. Returns ranked results
                        ↓
5. Screen displays results
```

### Example 3: Deep Research Workflow

```
1. User starts research from app/(drawer)/research/
                        ↓
2. Calls useAction(api.research.actions.startDeepResearch)
                        ↓
3. Convex action creates deepResearchSession
                        ↓
4. Background worker (Convex action) iterates:
   - Search arXiv
   - Search web
   - Extract findings
   - Update progress
                        ↓
5. useQuery(api.deepResearchSessions.queries.get) auto-updates
                        ↓
6. Screen shows real-time progress
```

## Key Technologies by Layer

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React Native + Expo Router | Mobile app UI and navigation |
| **Styling** | NativeWind (Tailwind) | Utility-first styling |
| **UI Library** | React Native Paper | Material Design components |
| **State** | Convex useQuery/useMutation | Reactive data fetching |
| **Backend** | Convex | Database + serverless functions |
| **AI** | Z.ai / OpenAI | LLM integration |
| **Search** | Convex vector search | Semantic search |
| **CLI** | Python | Terminal interface |
| **MCP** | stdio protocol | Claude Code integration |

## Learning Path

### New to the codebase? Start here:

1. **Read** `README.md` for project overview
2. **Explore** `app/(drawer)/index.tsx` to see the main screen
3. **Understand** `convex/schema.ts` to see data models
4. **Follow** a data flow example above
5. **Read** `CLAUDE.md` for development standards

### Want to contribute?

1. **Read** `CONTRIBUTING.md`
2. **Check** `.spec/prd/` for planned work
3. **Run** `pnpm typecheck` and `pnpm test` locally
4. **Follow** React Native rules in `CLAUDE.md`

### Want to extend the MCP server?

1. **Read** `holocron-mcp/README.md`
2. **Explore** `holocron-mcp/src/index.ts` for existing tools
3. **Add** new tool following the pattern
4. **Test** with Claude Code

## Common Tasks

| Task | File | Command |
|------|------|---------|
| Add new screen | `app/(drawer)/new-screen.tsx` | Create file |
| Add new table | `convex/schema.ts` | Add table definition |
| Add new query | `convex/domain/queries.ts` | Add query function |
| Add new mutation | `convex/domain/mutations.ts` | Add mutation function |
| Add new MCP tool | `holocron-mcp/src/tools/` | Add tool file |
| Run tests | Terminal | `pnpm test` |
| Type check | Terminal | `pnpm typecheck` |
| Start dev server | Terminal | `pnpm start` |

## Architecture Decisions

### Why Convex?
- **Automatic reactivity** - No manual subscription management
- **Type safety** - Generated types from schema
- **Simplified backend** - No separate server to maintain
- **Great DX** - Fast iteration with `npx convex dev`

### Why Expo Router?
- **File-based routing** - Easy to understand
- **Type-safe navigation** - Catch errors at compile time
- **Native performance** - True native navigation
- **Great docs** - Well-maintained ecosystem

### Why NativeWind?
- **Tailwind familiarity** - Same utility classes as web
- **No runtime cost** - Compiled to native styles
- **Responsive design** - Easy breakpoints
- **Theme support** - Dark mode built-in

## Next Steps

- **Browse** the codebase using your IDE
- **Run** the app locally: `pnpm start`
- **Read** task files in `.spec/prd/` for planned features
- **Join** the community (link to add when public)

---

**Last Updated:** 2026-04-07
