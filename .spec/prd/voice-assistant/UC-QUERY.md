# UC-QUERY: Query & Action Execution

## Overview

Query & Action Execution handles processing user intents, executing actions against Holocron APIs, and narrating results with progress feedback.

---

## UC-QUERY-01: Execute Knowledge Query

**Actor**: User
**Trigger**: User asks a question about stored knowledge
**Preconditions**: User intent classified as knowledge query

### Main Flow
1. System extracts query parameters from transcript
2. System announces "Searching your knowledge base..."
3. System calls Holocron search API
4. Results formatted for spoken response
5. System narrates top results with key details

### Alternate Flows
- **A1**: No results found → "I couldn't find anything about that"
- **A2**: Many results → Summarize top 3, offer to list more
- **A3**: Query takes >3s → Provide progress update

### Acceptance Criteria
- [ ] Search initiated within 500ms of intent classification
- [ ] Progress announced for queries >2s
- [ ] Results spoken clearly with source attribution
- [ ] User can interrupt long result lists

---

## UC-QUERY-02: Create Task or Note

**Actor**: User
**Trigger**: User says "remind me", "add a task", "note that..."
**Preconditions**: User intent classified as creation

### Main Flow
1. System extracts content from transcript
2. System confirms understanding: "Adding task: [summary]"
3. System calls Holocron create API
4. System announces "Done, I've added that"
5. Brief confirmation with key details

### Alternate Flows
- **A1**: Ambiguous content → Ask clarifying question
- **A2**: Creation fails → Explain error, offer retry
- **A3**: User says "no" after confirmation → Cancel

### Acceptance Criteria
- [ ] Confirmation spoken before final creation
- [ ] User can cancel with "no", "cancel", "wait"
- [ ] Creation completes within 2s
- [ ] Confirmation includes actionable detail

---

## UC-QUERY-03: Navigate Application

**Actor**: User
**Trigger**: User says "go to", "open", "show me"
**Preconditions**: User intent classified as navigation

### Main Flow
1. System extracts destination from transcript
2. System maps to app screen/section
3. System announces "Opening [destination]"
4. App navigates to target screen
5. System describes what's now visible (optional)

### Alternate Flows
- **A1**: Unknown destination → List available options
- **A2**: Destination requires auth → Prompt accordingly
- **A3**: Already on target screen → "You're already here"

### Acceptance Criteria
- [ ] Navigation starts within 300ms
- [ ] All major screens accessible by voice
- [ ] Screen description helps blind users
- [ ] "Go back" always works

---

## UC-QUERY-04: Provide Progress Updates

**Actor**: System
**Trigger**: Action takes >2 seconds
**Preconditions**: Action in progress

### Main Flow
1. System monitors action duration
2. At 2s mark, speak "Still working on that..."
3. For long operations, provide specific updates
4. Updates continue every 5s until complete
5. Final result announced when ready

### Alternate Flows
- **A1**: User interrupts during wait → Cancel action or redirect
- **A2**: Action hangs → Timeout after 30s, explain failure

### Acceptance Criteria
- [ ] First progress update at 2s
- [ ] Updates are varied (not repetitive)
- [ ] User knows something is happening
- [ ] Timeout after 30s with clear error

---

## UC-QUERY-05: Handle Confirmation Flows

**Actor**: User
**Trigger**: Destructive or ambiguous action requested
**Preconditions**: Action requires confirmation

### Main Flow
1. System identifies action needs confirmation
2. System speaks: "Should I [action]? Say yes or no."
3. System enters CONFIRMING state, listens
4. User says "yes" → Execute action
5. User says "no" → Cancel with acknowledgment

### Alternate Flows
- **A1**: Timeout waiting for confirmation → Cancel with "I'll skip that"
- **A2**: Ambiguous response → Re-prompt once
- **A3**: User provides alternative → Adapt action

### Acceptance Criteria
- [ ] Confirmation required for deletes, sends, publishes
- [ ] Timeout after 10s
- [ ] "Yes", "yeah", "do it", "go ahead" all work
- [ ] "No", "cancel", "stop", "wait" all cancel

---

## L4 Holdout Scenarios

### H-QUERY-01: Complex Multi-Step Command
**Scenario**: "Create a task for tomorrow, add it to my work project, and remind me at 9am"
**Expected**: Parse all three intents, execute in sequence with confirmations
**Why Holdout**: Multi-intent parsing is P2

### H-QUERY-02: Contextual Follow-Up
**Scenario**: "Search for react patterns" → "Add the first one to my notes"
**Expected**: Resolve "first one" from previous search results
**Why Holdout**: Cross-turn reference resolution is complex

### H-QUERY-03: Undo Last Action
**Scenario**: User says "undo that" after creating a task
**Expected**: Reverse last action with confirmation
**Why Holdout**: Undo stack management is P2
