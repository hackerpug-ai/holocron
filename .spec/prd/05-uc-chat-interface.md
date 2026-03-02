# Use Cases: Chat Interface (CI)

| ID | Title | Description |
|----|-------|-------------|
| UC-CI-01 | Send Chat Message | User sends a natural language message to the AI agent |
| UC-CI-02 | Use Slash Commands | User types slash commands via typeahead command panel or "/" trigger button |
| UC-CI-03 | View Result Cards | User sees research results rendered as interactive cards in the chat stream |
| UC-CI-04 | View Chat History | User scrolls through persistent conversation history |

---

## UC-CI-01: Send Chat Message

**Description:** User can type a natural language message in the chat input and send it to the server-side AI agent for processing.

**Acceptance Criteria:**
- ☐ User can type a message in the chat input bar at the bottom of the screen
- ☐ User can send the message by tapping the send button or pressing enter
- ☐ System displays the user's message as a chat bubble in the thread immediately
- ☐ System shows a typing/thinking indicator while the agent processes the message
- ☐ Agent response appears as a new message bubble in the chat thread
- ☐ User can see timestamps on messages
- ☐ System validates that the message is not empty before sending

---

## UC-CI-02: Use Slash Commands

**Description:** User can type slash commands in the chat input to invoke specific server-side actions. A command panel appears above the input as a typeahead menu, and a "/" action button provides an alternative trigger.

**Acceptance Criteria:**
- ☐ User can type `/` in the chat input to trigger a command panel that appears directly above the input bar
- ☐ User can tap the "/" action button to the left of the input to open the command panel
- ☐ System displays the command panel as a typeahead list showing all supported commands: `/search`, `/research`, `/deep-research`, `/browse`, `/stats`, `/resume`, `/help`
- ☐ System filters the command list in real-time as the user types characters after `/` (e.g., typing `/re` shows only `/research` and `/resume`)
- ☐ System dismisses the command panel when no commands match the typed characters
- ☐ System dismisses the command panel when the user clears the `/` prefix or taps outside the panel
- ☐ User can select a command from the typeahead list by tapping it
- ☐ System inserts the selected command into the input and shows a syntax hint (e.g., `/research <query>`)
- ☐ User can submit the slash command with arguments as a chat message
- ☐ System renders the slash command distinctly from regular messages (e.g., monospace styling with command badge)
- ☐ User can type `/help` to see all available commands and their descriptions

---

## UC-CI-03: View Result Cards

**Description:** User sees research results, search hits, and article previews rendered as tappable cards embedded in the chat stream.

**Acceptance Criteria:**
- ☐ System renders search results as a scrollable list of cards within the chat thread
- ☐ Each card displays title, category badge, and content snippet
- ☐ User can tap a card to open the full article or research content in a detail view
- ☐ Cards for in-progress research show a progress indicator and current status
- ☐ Cards for completed research show confidence score and source count
- ☐ User can swipe back from the detail view to return to the chat thread at the same scroll position
- ☐ System renders different card styles for different content types (article, research result, stats)

---

## UC-CI-04: View Chat History

**Description:** User can scroll through the persistent conversation history, which is preserved across app sessions.

**Acceptance Criteria:**
- ☐ User can scroll up through previous messages in the chat thread
- ☐ System loads older messages on scroll (infinite scroll with pagination)
- ☐ Chat history persists across app restarts
- ☐ User can see result cards from previous sessions and still tap them to view content
- ☐ System scrolls to the latest message on app launch
- ☐ User can clear chat history via a settings action
