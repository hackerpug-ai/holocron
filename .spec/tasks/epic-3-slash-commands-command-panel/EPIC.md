# Epic 3: Slash Commands & Command Panel

> Epic ID: epic-3-slash-commands-command-panel
> PRD Version: 3.1.0
> Appetite: 2 weeks (core scope)
> Tasks: 7 (US-019 through US-025)
> Use Cases: UC-CI-02

## Theme

Implement the slash command system with typeahead panel, real-time filtering, command insertion with syntax hints, and command routing through the chat-send Edge Function. After this epic, the user can invoke commands via typing or button, see filtered suggestions, and submit commands that are distinctly rendered.

## PRD Sections Covered

| Section | Use Case | Description |
|---------|----------|-------------|
| SS05 | UC-CI-02 | Use Slash Commands |

## Deliberation Summary

| UC ID | Decision | Deferred Items |
|-------|----------|----------------|
| UC-CI-02 | Full implementation with typeahead panel and basic filtering | Keyboard navigation, fuzzy matching, argument validation, command history |

Full deliberation: [DELIBERATION-LOG-epic3.md](../../DELIBERATION-LOG-epic3.md)

## Dependency Graph

```
US-019 (Slash Parser)     US-020 (CommandPanel)     US-021 (SlashCommandMessage)
    |                          |                           |
    |                          v                           |
    |                     US-022 (Wire "/" trigger)        |
    |                          |                           |
    |                          v                           |
    |                     US-023 (Filter + dismiss)        |
    |                          |                           |
    |                          v                           |
    +-------------------> US-024 (Command insertion)       |
    |                          |                           |
    v                          |                           |
US-025 (/help handler) <-------+---------------------------+
```

### Parallel Execution Lanes

| Lane | Tasks | Description |
|------|-------|-------------|
| **Backend** | US-019, US-025 | Slash command parser and /help handler |
| **Design** | US-020, US-021 (parallel) | CommandPanel and SlashCommandMessage components |
| **Integration** | US-022, US-023, US-024 (sequential) | Wire triggers, filtering, and insertion |

## Task Summary

| ID | Title | Type | Priority | Agent | Score |
|----|-------|------|----------|-------|-------|
| US-019 | Build slash command parser in chat-send Edge Function | feature | P1 | supabase-implementer | 92 |
| US-020 | Design CommandPanel component - story + variants | feature:design | P1 | react-native-ui-implementer | 90 |
| US-021 | Design SlashCommandMessage component - monospace + badge | feature:design | P1 | react-native-ui-implementer | 91 |
| US-022 | Wire "/" button and keyboard trigger to CommandPanel | feature:integration | P2 | react-native-ui-implementer | 88 |
| US-023 | Implement real-time command filtering and panel dismiss | feature:integration | P2 | react-native-ui-implementer | 89 |
| US-024 | Implement command insertion with syntax hint | feature:integration | P2 | react-native-ui-implementer | 87 |
| US-025 | Build /help command handler returning descriptions | feature | P2 | supabase-implementer | 90 |

**Average Quality Score: 90/100** (all tasks above 70 minimum)

## Human Test Steps

1. Type `/` in the chat input and verify the command panel appears above the input
2. Tap the "/" button to the left of input and verify the panel opens
3. Verify all 7 commands are visible: /search, /research, /deep-research, /browse, /stats, /resume, /help
4. Type `/re` and verify only /research and /resume are shown
5. Type `/xyz` and verify the panel dismisses (no matches)
6. Clear the input and verify the panel dismisses
7. Tap outside the panel and verify it dismisses
8. Select `/research` from the list and verify it inserts with syntax hint `<question>`
9. Type `/help` and submit - verify help text with all commands appears
10. Submit `/search test query` and verify the message renders with command badge styling

## Agent Roster

| Agent | Tasks | Role |
|-------|-------|------|
| supabase-implementer | US-019, US-025 | Edge Function command parsing and /help handler |
| supabase-reviewer | (reviews US-019, US-025) | Backend code review |
| react-native-ui-implementer | US-020, US-021, US-022, US-023, US-024 | UI components and integration |
| react-native-ui-reviewer | (reviews US-020-US-024) | UI code review |

## Blocks

Epic 4 (Knowledge Base & Result Cards), Epic 5 (Basic Research), Epic 6 (Deep Research)

## Depends On

Epic 2 (Chat Thread & Messaging) - requires ChatInput, ChatThread, and chat-send Edge Function

## Acceptance Criteria (from UC-CI-02)

- [ ] User can type `/` in the chat input to trigger a command panel that appears directly above the input bar
- [ ] User can tap the "/" action button to the left of the input to open the command panel
- [ ] System displays the command panel as a typeahead list showing all supported commands
- [ ] System filters the command list in real-time as the user types characters after `/`
- [ ] System dismisses the command panel when no commands match the typed characters
- [ ] System dismisses the command panel when the user clears the `/` prefix or taps outside the panel
- [ ] User can select a command from the typeahead list by tapping it
- [ ] System inserts the selected command into the input and shows a syntax hint
- [ ] User can submit the slash command with arguments as a chat message
- [ ] System renders the slash command distinctly from regular messages (monospace styling with command badge)
- [ ] User can type `/help` to see all available commands and their descriptions

## Deferred Items (Not in Scope)

1. **Keyboard navigation** - Up/down arrows to navigate command list
2. **Fuzzy matching** - Smart matching beyond simple string contains
3. **Argument validation** - Validating args match expected syntax before submit
4. **Command history** - Recent/frequently used commands
