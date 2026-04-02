# Taskplane Migration Guide

## Overview

Migrated from skill-based epic execution (`kb-run-epic`, `mlx-run-epic`) to **taskplane** orchestrator with **pi-tasks** tracking.

## Why Taskplane?

- **Parallel execution** with git worktree isolation
- **Web dashboard** for monitoring (`taskplane dashboard`)
- **Dependency-aware wave scheduling**
- **Checkpoint discipline** with step-boundary commits
- **Supervisor agent** for autonomous batch management

## Package Stack

| Package | Purpose |
|---------|---------|
| `taskplane` | Orchestrator (parallel execution, worktrees, dashboard) |
| `@tintinweb/pi-tasks` | Task tracking (widget, dependencies, tools) |
| `pi-subagents` | Agent delegation (already installed) |

## Usage

### Start the Dashboard (separate terminal)
```bash
taskplane dashboard
# Opens at http://localhost:8099
```

### In Pi

```bash
# Start the supervisor
/orch

# Plan execution (shows waves and dependencies)
/orch-plan .spec/tasks/epic-4-feedback

# Execute all pending tasks in parallel
/orch .spec/tasks/epic-4-feedback

# Check status
/orch-status

# Integrate completed work into working branch
/orch-integrate
```

### Single Task Execution

```bash
# Execute one task with full worktree isolation
/orch .spec/tasks/epic-4-feedback/US-FB-001_feedback-buttons/PROMPT.md
```

## Task Structure

Each task has two files:

```
spec/tasks/epic-4-feedback/US-FB-001_feedback-buttons/
├── PROMPT.md    # Mission, context, steps, constraints
└── STATUS.md    # Progress tracking (auto-updated by agents)
```

### PROMPT.md Format

```markdown
# Task Title

**Status:** Open
**Assignee:** agent-type
**Priority:** P0
**Size:** M/S/L
**Depends on:** US-FB-001

---

## Mission
Brief description of what needs to be done.

## Context to Read First
Files to read before starting work.

## Steps
1. Step one
2. Step two
3. ...

## Constraints
### MUST
### NEVER
### STRICTLY

### WRITE-ALLOWED
### WRITE-PROHIBITED

## Completion Criteria
- [ ] Item 1
- [ ] Item 2
```

## Migration from Old Format

### Old (`.spec/prd/subscriptions-redesign/tasks/epic-4-feedback/US-FB-001.md`)
- Markdown task files with acceptance criteria
- Executed via `/skill:kb-run-epic epic-4-feedback`
- Skill loaded tasks, dispatched to agents, updated status

### New (`.spec/tasks/epic-4-feedback/US-FB-001_feedback-buttons/`)
- PROMPT.md + STATUS.md per task
- Executed via `/orch .spec/tasks/epic-4-feedback`
- Taskplane handles parallel execution, worktree isolation, reviews

## Epic 4: Feedback-Driven Recommendations

| Task ID | Title | Assignee | Depends On |
|---------|-------|----------|------------|
| US-FB-001 | Feedback Buttons on Cards | frontend-designer | Epic 2 |
| US-FB-002 | Feedback Data Storage | convex-implementer | US-FB-001 |
| US-FB-003 | Feedback-Influenced Scoring | convex-implementer | US-FB-002 |
| US-FB-004 | Feedback History Screen | frontend-designer | US-FB-002 |
| US-FB-005 | Unobtrusive Feedback UX | frontend-designer | US-FB-001 |
| US-FB-006 | Personalized Content Over Time | convex-implementer | US-FB-003 |

## Next Steps

1. **Install tmux** (for full parallel execution support):
   ```bash
   brew install tmux  # macOS
   ```

2. **Start the dashboard**:
   ```bash
   taskplane dashboard
   ```

3. **In pi, execute epic-4-feedback**:
   ```bash
   pi
   /orch .spec/tasks/epic-4-feedback
   ```

## Deprecating Old Skills

The following skills are now **deprecated** (but remain for reference):
- `kb-run-epic` - Use `/orch` instead
- `mlx-run-epic` - Use `/orch` instead

## References

- [Taskplane Documentation](https://www.npmjs.com/package/taskplane)
- [pi-tasks Documentation](https://www.npmjs.com/package/@tintinweb/pi-tasks)
- [pi-subagents Documentation](https://www.npmjs.com/package/pi-subagents)
