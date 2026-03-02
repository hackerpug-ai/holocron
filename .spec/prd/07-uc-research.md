# Use Cases: Research (RS)

| ID | Title | Description |
|----|-------|-------------|
| UC-RS-01 | Initiate Research via Slash Command | User types `/research` to start server-side research |
| UC-RS-02 | Monitor Research in Chat | Progress updates stream as chat messages |
| UC-RS-03 | View Research Results Card | Completed research appears as a rich result card |
| UC-RS-04 | Research History | User asks for past research sessions, shown as cards |

---

## UC-RS-01: Initiate Research via Slash Command

**Description:** User types `/research <query>` in the chat input to trigger server-side research execution. The command is sent as a chat message and the agent begins processing.

**Acceptance Criteria:**
- ☐ User can type `/research <query>` to initiate a basic research request
- ☐ System renders the slash command as a distinct message in the chat thread
- ☐ Agent responds with a confirmation message including the research type auto-detected from the query
- ☐ User can optionally specify research type: `/research --type factual <query>`
- ☐ System validates the query is not empty before submitting
- ☐ Agent provides an estimated duration message (e.g., "This should take about 1-2 minutes")

---

## UC-RS-02: Monitor Research in Chat

**Description:** As the server-side research executes, the agent streams progress updates as chat messages in real-time.

**Acceptance Criteria:**
- ☐ Agent posts a progress message when research phase changes (searching → analyzing → synthesizing)
- ☐ Agent shows sources being consulted as they are discovered (e.g., "Found 5 relevant sources...")
- ☐ User can see elapsed time in the progress messages
- ☐ System updates the latest progress message in-place (not flooding chat with many messages)
- ☐ User can type `/cancel` to abort in-progress research
- ☐ Agent posts a cancellation confirmation if research is cancelled

---

## UC-RS-03: View Research Results Card

**Description:** When research completes, the agent posts a result card in the chat with an executive summary. The user can tap it to read the full report.

**Acceptance Criteria:**
- ☐ System renders a research result card in the chat when research completes
- ☐ Result card shows: title, executive summary (2-3 sentences), confidence score, source count
- ☐ User can tap the result card to open the full research report in a detail view
- ☐ Detail view shows full markdown report with citations and source URLs
- ☐ Agent confirms the research was auto-saved to holocron with the document ID
- ☐ If research fails, agent posts an error message with the reason and offers retry

---

## UC-RS-04: Research History

**Description:** User can ask the agent for past research sessions, which are displayed as a list of result cards.

**Acceptance Criteria:**
- ☐ User can type `/history` or ask "show my recent research" to see past sessions
- ☐ System displays past research sessions as cards with date, query, and status
- ☐ User can filter by asking (e.g., "show completed research" or "show failed research")
- ☐ User can tap a history card to view the full research results
- ☐ Agent can answer questions about past research (e.g., "what did I research last week?")
