# Team Contributions

## Phase 1: User Personas
- **Researcher persona**: Power user who needs mobile access to accumulated knowledge
- **User journey**: Question arises → Open app → Chat with agent → Use slash command or natural language → View result cards → Tap for full content
- **Pain points**: No access to research tools away from workstation, can't query knowledge on the go
- **Chat paradigm insight**: Users prefer conversational interfaces for knowledge work—reduces cognitive load vs. navigating multiple screens

## Phase 2: Architecture
- **Server-side agent execution**: Move agentic logic from local Python/skills to Supabase Edge Functions
- **Chat message model**: Messages table for persisting conversation history with card references
- **Slash command parsing**: Server-side command router that dispatches to appropriate research workflows
- **Research session management**: PostgreSQL tables for tracking research state
- **Real-time updates**: Supabase Realtime for streaming progress messages to the chat thread
- **Tool integration**: Edge Functions call external APIs (Exa, Jina, OpenAI)

## Phase 3: UI Infrastructure
- **React Native Reusables**: shadcn/ui port for React Native with copy-paste components built on @rn-primitives
- **NativeWind**: TailwindCSS v4 styling with CSS variables for theming
- **Lucide React Native**: Icon library
- **Expo Router**: Drawer navigation (pushover menu) + chat screens + articles view + detail overlay
- **Drawer navigation**: Left-edge pushover menu with Articles link (pinned top), New Chat button, conversation list sorted by recent
- **Multi-conversation support**: Conversation CRUD, auto-titling from first message, cascade delete
- **Articles browsing view**: Secondary non-chat view with category filter chips, search, article cards
- **Chat UI components**: Message bubbles, result cards, slash command autocomplete, typing indicator
