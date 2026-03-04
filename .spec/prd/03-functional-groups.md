# Functional Groups

[UPDATED 2026-03-04]: Added Long-Running Task Infrastructure and Multi-Agent Architecture patterns

| Group | Prefix | Description |
|-------|--------|-------------|
| Navigation | NV | Drawer menu, conversation list, articles link, new chat creation |
| Chat Interface | CI | Core chat UX: message thread, input bar, slash command system, card rendering |
| Knowledge Base | KB | Search and browse holocron articles via chat commands, result cards, and articles view |
| Research | RS | Basic research via `/research` slash command with progress streaming (long-running task) |
| Deep Research | DR | Multi-iteration deep research via `/deep-research` with iteration tracking (long-running task, orchestrator-worker pattern) |
| Article Management | AM | View, edit, delete, and recategorize articles from card actions |

## Multi-Agent Task Patterns

| Task Type | Pattern | Agents | Tools |
|-----------|---------|--------|-------|
| `research` | Single-pass | Research Worker → Synthesizer | `searchWeb()`, `readUrl()`, `sortByRelevance()` |
| `deep-research` | Orchestrator-Worker | Orchestrator → Workers → Reviewer | `searchIteration()`, `reviewFindings()`, `saveIteration()`, `streamIterationCard()` |
| `assimilate` | Parallel Swarm | Manager → Cheap Workers → Synthesizer | `searchWeb()`, `parallelReadUrl()`, `deduplicateStrings()` |
| `shop` | Parallel Swarm | Manager → Cheap Workers → Synthesizer | `searchWeb()`, `readUrl()`, `sortByRelevance()` |
| `research-loop` | Parallel | Manager → Workers → Synthesizer | `parallelSearchWeb()`, `readUrl()`, `extractPdf()` |
| `deep-research-teamwork` | Team Orchestrator | Planner → Workers → Expert → Devil's Advocate → Synthesizer → Librarian | All research tools + domain-specific tools |

## Use Case Summary

| Group | Count |
|-------|-------|
| Navigation (NV) | 6 |
| Chat Interface (CI) | 4 |
| Knowledge Base (KB) | 5 |
| Research (RS) | 4 |
| Deep Research (DR) | 4 |
| Article Management (AM) | 4 |
| **Total** | **27** |
