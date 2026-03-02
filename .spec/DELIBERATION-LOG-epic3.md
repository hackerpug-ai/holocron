# Deliberation Log: Holocron Mobile Research Interface - Epic 3

> Date: 2026-03-02
> PRD Version: 3.1.0
> Appetite: 2 weeks (core scope)
> Epic Scope: Epic 3 - Slash Commands & Command Panel

## Summary

- Use cases deliberated: 1 (UC-CI-02)
- Items deferred: 4
- Estimated scope fit: Fits well within appetite (7 tasks)

## Decisions

| UC ID | UC Title | Decision | Rationale | Deferred Items |
|-------|----------|----------|-----------|----------------|
| UC-CI-02 | Use Slash Commands | Full implementation with existing component enhancement | Core UX feature enabling all research workflows; builds on existing SlashCommandMenu | Keyboard nav, fuzzy matching, argument validation, command history |

## Detailed Deliberations

### UC-CI-02: Use Slash Commands

**Minimum Implementation:**
- "/" keyboard trigger opens command panel above input
- "/" action button trigger (left of input) opens panel
- Panel shows all 7 supported commands: /search, /research, /deep-research, /browse, /stats, /resume, /help
- Real-time filtering as user types (simple includes match)
- Panel dismisses when no commands match filter
- Tap command to select → insert into input with syntax hint
- Submit slash command renders distinctly (monospace + CommandBadge)
- Backend parses slash commands in chat-send Edge Function
- /help handler returns command descriptions

**Critical Edge Cases:**
- Panel positioning (must stay above input bar, keyboard-aware)
- Filter reset when panel opens (start fresh each time)
- Empty state handling (no matching commands)
- Command insertion cursor position (end of inserted text)
- Syntax hint display (show but don't include in submission)

**Deferred to Future:**
- **Keyboard navigation (up/down arrows)**: Tap selection sufficient for 7 commands
- **Fuzzy matching**: Simple includes() handles all cases with 7 commands
- **Argument validation before submit**: Parse and validate on backend, show errors in chat response
- **Command history/recent commands**: Not needed for v1

**Recommendation:** Full implementation with simple filtering
**Rationale:** The slash command system is foundational for Epic 4-6 (research workflows). A clean, working implementation with basic filtering is more valuable than advanced features. The existing SlashCommandMenu component provides a solid foundation.

## Existing Assets Analysis

### SlashCommandMenu (components/SlashCommandMenu.tsx)
- **Status**: EXISTS - functional but needs enhancement
- **Capabilities**:
  - Renders typeahead list with all 7 default commands
  - Filters by name and description (includes match)
  - Auto-hides when no matches
  - Calls onSelect callback with selected command
- **Gaps**:
  - No "/" button trigger integration
  - No syntax hint insertion logic
  - Not positioned relative to ChatInput
  - No keyboard trigger integration

### CommandBadge (components/CommandBadge.tsx)
- **Status**: EXISTS
- **Purpose**: Renders command name with visual badge styling
- **Usage**: For slash command messages in chat thread

### ChatInput (components/chat/ChatInput.tsx)
- **Status**: EXISTS from Epic 2
- **Gaps**:
  - No "/" action button
  - No "/" keyboard detection
  - No command panel state management

## Constraints (from CONSTITUTION)

- Supabase backend with Edge Functions (Deno TypeScript)
- React Native (Expo) with NativeWind styling
- Must integrate with existing Epic 2 chat infrastructure
- chat-send Edge Function must be extended (not replaced)

## Task Breakdown Guidance

### Backend (1 task)
- **US-019**: Extend chat-send Edge Function with slash command parser
  - Detect messages starting with "/"
  - Extract command name and arguments
  - Route to appropriate handler (most return "not implemented yet" until Epic 4-6)
  - /help returns command list with descriptions

### Design Tasks (2 tasks, DESIGN + INTEGRATION split)
- **US-020**: Design CommandPanel component (enhance SlashCommandMenu)
  - Story with all variants (full list, filtered, empty)
  - Position above ChatInput
  - Play functions for filter and select interactions

- **US-021**: Design SlashCommandMessage component
  - Story showing slash command in chat thread
  - Monospace styling with CommandBadge
  - Play functions for different command types

### Integration Tasks (4 tasks)
- **US-022**: Wire "/" button and keyboard trigger to CommandPanel
  - Add "/" button to ChatInput (left of input)
  - Detect "/" in input text
  - Manage panel open/close state

- **US-023**: Implement real-time command filtering
  - Pass input text (after "/") to CommandPanel
  - Auto-dismiss on no match

- **US-024**: Implement command insertion with syntax hint
  - On command select: insert "/command " into input
  - Show syntax hint below input (ephemeral, not submitted)

- **US-025**: Build /help command handler
  - Backend returns formatted command list
  - Renders as special system message in chat

## Next Steps

Proceed to team spawn with these decisions as planning constraints.
Team members should reference this log when creating tasks.
