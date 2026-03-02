# Use Cases: Research (RS)

| ID | Title | Description |
|----|-------|-------------|
| UC-RS-01 | Initiate Research | User submits a research query for server-side processing |
| UC-RS-02 | Monitor Research Progress | User views real-time status of active research |
| UC-RS-03 | View Research Results | User reads completed research findings |
| UC-RS-04 | Research History | User browses past research sessions |

---

## UC-RS-01: Initiate Research

**Description:** User can submit a research query that triggers server-side research execution with web search and analysis.

**Acceptance Criteria:**
- ☐ User can enter research query on the research screen
- ☐ User can select research type (factual question, entity research, academic, URL analysis)
- ☐ System shows estimated research duration based on type
- ☐ User can submit research request to server
- ☐ System displays confirmation with session ID
- ☐ System validates query is not empty before submission

---

## UC-RS-02: Monitor Research Progress

**Description:** User can view real-time progress of an active research session.

**Acceptance Criteria:**
- ☐ User can see current research phase (searching, analyzing, synthesizing)
- ☐ User can see list of sources being consulted
- ☐ User can see elapsed time for current research
- ☐ System updates progress automatically (polling or WebSocket)
- ☐ User can cancel in-progress research

---

## UC-RS-03: View Research Results

**Description:** User can read the completed research findings with full formatting and citations.

**Acceptance Criteria:**
- ☐ User can view executive summary of findings
- ☐ User can read detailed analysis with proper markdown formatting
- ☐ User can see all citations with source URLs
- ☐ User can see confidence score for findings
- ☐ User can view search methodology used
- ☐ System shows when research was saved to holocron

---

## UC-RS-04: Research History

**Description:** User can browse past research sessions and their results.

**Acceptance Criteria:**
- ☐ User can view list of past research sessions
- ☐ User can see session date, query, and status for each
- ☐ User can filter history by status (completed, failed, in-progress)
- ☐ User can tap a session to view its results
- ☐ User can delete old research sessions
