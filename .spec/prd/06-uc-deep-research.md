# Use Cases: Deep Research (DR)

| ID | Title | Description |
|----|-------|-------------|
| UC-DR-01 | Initiate Deep Research | User starts multi-iteration deep research session |
| UC-DR-02 | Monitor Iterations | User tracks progress across research iterations |
| UC-DR-03 | Resume Session | User continues interrupted deep research session |
| UC-DR-04 | View Iteration History | User reviews findings from each iteration |

---

## UC-DR-01: Initiate Deep Research

**Description:** User can start a deep research session that uses the Ralph Loop pattern (worker → reviewer iterations) for comprehensive coverage.

**Acceptance Criteria:**
- ☐ User can enter deep research topic on deep research screen
- ☐ User can set maximum iteration count (default: 5)
- ☐ User can select input type (topic, YouTube channel, site crawl, academic)
- ☐ System shows warning about longer processing time
- ☐ User can submit deep research request to server
- ☐ System creates session with unique ID for tracking

---

## UC-DR-02: Monitor Iterations

**Description:** User can track progress across multiple research iterations with coverage scores.

**Acceptance Criteria:**
- ☐ User can see current iteration number out of maximum
- ☐ User can see coverage score (1-5) for each completed iteration
- ☐ User can see reviewer feedback identifying gaps
- ☐ User can see refined queries for next iteration
- ☐ System shows when iteration completes with new score
- ☐ User can see estimated remaining iterations based on coverage

---

## UC-DR-03: Resume Session

**Description:** User can resume an interrupted deep research session from the last checkpoint.

**Acceptance Criteria:**
- ☐ User can view list of incomplete deep research sessions
- ☐ User can see last iteration completed for each session
- ☐ User can tap to resume from last checkpoint
- ☐ System loads session state and continues from last iteration
- ☐ User can choose to restart session instead of resuming

---

## UC-DR-04: View Iteration History

**Description:** User can review the findings and scores from each iteration of a deep research session.

**Acceptance Criteria:**
- ☐ User can expand each iteration to see its findings
- ☐ User can see reviewer score and feedback for each iteration
- ☐ User can see gaps identified between iterations
- ☐ User can view final synthesized report
- ☐ User can see all citations accumulated across iterations
