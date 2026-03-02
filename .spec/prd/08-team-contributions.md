# Team Contributions

## Phase 1: User Personas
- **Researcher persona**: Power user who needs mobile access to accumulated knowledge
- **User journey**: Question arises → Open app → Search holocron → Initiate research if needed → Read results
- **Pain points**: No access to research tools away from workstation, can't query knowledge on the go

## Phase 2: Architecture
- **Server-side agent execution**: Move agentic logic from local Python/skills to Supabase Edge Functions
- **Research session management**: PostgreSQL tables for tracking research state
- **Real-time updates**: Polling or Supabase Realtime for progress tracking
- **Tool integration**: Edge Functions call external APIs (Exa, Jina, OpenAI)

## Phase 3: UI Infrastructure
- **React Native Reusables**: shadcn/ui port for React Native with copy-paste components built on @rn-primitives
- **NativeWind**: TailwindCSS v4 styling with CSS variables for theming
- **Lucide React Native**: Icon library
- **Expo Router**: File-based navigation structure in place
