# Use Cases: Deep Research (DR)

| ID | Title | Description |
|----|-------|-------------|
| UC-DR-01 | Initiate Deep Research | User types `/deep-research` to start multi-iteration research |
| UC-DR-02 | Monitor Iterations in Chat | Iteration progress appears as messages with coverage scores |
| UC-DR-03 | Resume Session | User types `/resume` to continue an interrupted session |
| UC-DR-04 | View Iteration Cards | Each iteration's findings shown as expandable cards |

---

## UC-DR-01: Initiate Deep Research

**Description:** User types `/deep-research <topic>` in the chat to start a multi-iteration deep research session using the Ralph Loop pattern.

**Acceptance Criteria:**
- ☐ User can type `/deep-research <topic>` to initiate deep research
- ☐ User can optionally set max iterations: `/deep-research --max 3 <topic>`
- ☐ User can select input type: `/deep-research --type youtube <channel-url>`
- ☐ Agent responds with a confirmation card showing topic, max iterations, and estimated duration
- ☐ Agent warns about longer processing time compared to basic research
- ☐ System creates a session with a unique ID visible in the confirmation message

---

## UC-DR-02: Monitor Iterations in Chat

**Description:** As the deep research progresses through iterations, the agent posts update messages with coverage scores and gap analysis.

**Acceptance Criteria:**
- ☐ Agent posts an iteration summary card after each iteration completes
- ☐ Each iteration card shows: iteration number (e.g., "2/5"), coverage score (1-5), and key findings summary
- ☐ Agent shows reviewer feedback identifying gaps between iterations
- ☐ Agent shows refined queries planned for the next iteration
- ☐ User can see estimated remaining iterations based on current coverage score
- ☐ User can type `/cancel` to stop the deep research after the current iteration completes

---

## UC-DR-03: Resume Session

**Description:** User can resume an interrupted deep research session by using the `/resume` command.

**Acceptance Criteria:**
- ☐ User can type `/resume` to see a list of incomplete deep research sessions as cards
- ☐ Each session card shows: topic, last iteration completed, coverage score, date started
- ☐ User can tap a session card or type `/resume <session-id>` to resume from the last checkpoint
- ☐ Agent confirms resumption with current state and resumes iteration loop
- ☐ User can ask "restart" instead of resume to start the session fresh

---

## UC-DR-04: View Iteration Cards

**Description:** User can review the findings from each iteration of a completed deep research session.

**Acceptance Criteria:**
- ☐ When deep research completes, agent posts a final result card with the synthesized report
- ☐ User can tap the result card to see the full report in a detail view
- ☐ Detail view includes an iteration timeline showing score progression
- ☐ User can expand each iteration to see its individual findings and reviewer feedback
- ☐ User can see all citations accumulated across all iterations
- ☐ Agent confirms the final report was saved to holocron
