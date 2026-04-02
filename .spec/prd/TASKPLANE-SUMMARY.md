# Taskplane Refactor Summary

## What Was Done

✅ **Installed and configured taskplane** for parallel task execution
✅ **Migrated epic-4-feedback** to taskplane format (PROMPT.md/STATUS.md)
✅ **Deprecated old skills** (`kb-run-epic`, `mlx-run-epic`)
✅ **Created migration guide** at `.spec/prd/TASKPLANE-MIGRATION.md`

## New Package Stack

| Package | Status | Purpose |
|---------|--------|---------|
| `taskplane` | ✅ Installed | Orchestrator with worktree isolation, dashboard |
| `@tintinweb/pi-tasks` | ✅ Already installed | Task tracking widget and tools |
| `pi-subagents` | ✅ Already installed | Agent delegation |

## How to Use

### 1. Start the Dashboard (separate terminal)
```bash
taskplane dashboard
# Opens at http://localhost:8099
```

### 2. In Pi
```bash
pi

# Start supervisor (guides you through onboarding)
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

## Epic 4: Feedback-Driven Recommendations

All 6 tasks migrated to `.spec/tasks/epic-4-feedback/`:

| Task | Assignee | Depends On |
|------|----------|------------|
| US-FB-001: Feedback Buttons on Cards | frontend-designer | Epic 2 |
| US-FB-002: Feedback Data Storage | convex-implementer | US-FB-001 |
| US-FB-003: Feedback-Influenced Scoring | convex-implementer | US-FB-002 |
| US-FB-004: Feedback History Screen | frontend-designer | US-FB-002 |
| US-FB-005: Unobtrusive Feedback UX | frontend-designer | US-FB-001 |
| US-FB-006: Personalized Content Over Time | convex-implementer | US-FB-003 |

## Files Created

```
.pi/
├── agents/
│   ├── task-worker.md      # Worker agent prompt
│   ├── task-reviewer.md    # Reviewer agent prompt
│   ├── task-merger.md      # Merger agent prompt
│   └── supervisor.md       # Supervisor agent prompt
├── task-runner.yaml        # Task areas configuration
├── task-orchestrator.yaml  # Orchestrator configuration
├── taskplane-config.json   # Taskplane settings
└── taskplane.json          # Taskplane metadata

.spec/tasks/
├── CONTEXT.md              # General task area context
└── epic-4-feedback/
    ├── US-FB-001_feedback-buttons/
    │   ├── PROMPT.md
    │   └── STATUS.md
    ├── US-FB-002_feedback-storage/
    │   ├── PROMPT.md
    │   └── STATUS.md
    └── ... (6 tasks total)

.spec/prd/
└── TASKPLANE-MIGRATION.md   # Migration guide
```

## Next Steps

1. **Install tmux** for full parallel execution:
   ```bash
   brew install tmux
   ```

2. **Start using taskplane**:
   ```bash
   taskplane dashboard  # Terminal 1
   pi                   # Terminal 2
   /orch .spec/tasks/epic-4-feedback
   ```

3. **Migrate other epics** from `.spec/prd/subscriptions-redesign/tasks/` to taskplane format as needed

## Troubleshooting

### `/skill:` commands routing to subagents
This is a known pi bug. Workarounds:
- Use natural language: "Use the mlx-run-epic skill..."
- Or use `/orch` directly instead of skills

### tmux not found
```bash
brew install tmux  # macOS
# Or use subprocess mode (limited parallel execution)
```

### Dashboard not connecting
```bash
taskplane doctor  # Check installation
# Ensure port 8099 is available
```

## References

- [Taskplane Documentation](https://www.npmjs.com/package/taskplane)
- [pi-tasks Documentation](https://www.npmjs.com/package/@tintinweb/pi-tasks)
- `.spec/prd/TASKPLANE-MIGRATION.md` - Full migration guide
