---
description: Audit open improvements against the codebase and auto-close ones that have been shipped
argument-hint: "[dry-run]"
---

# /close-improvements

Audit every open improvement request in the holocron MCP against the current codebase, then auto-close the ones that evidence shows are already implemented. No approval gate — open items that have been shipped get closed; partial/not-done stay open.

## Workflow

### 1. List open improvements

Call `mcp__holocron__listImprovementsTool` with `{ status: "open", limit: 100 }`. For each returned item, capture:
- `_id`
- `title` and `description` (truncate description to ~200 chars for the audit prompt)
- `sourceScreen` / `sourceComponent` (hints about where in the app this lives)

If the list is large (>6 items), process in parallel batches — one Explore agent per improvement, dispatched in a single message.

### 2. Dispatch parallel Explore agents

For each open improvement, dispatch an `Explore` subagent with a **tight, evidence-based prompt**:

```
I need to determine whether this improvement request has been implemented in the holocron codebase.

Improvement: {title}
Description: {description}
Source: {sourceScreen}/{sourceComponent}

Search the codebase for relevant files and return ONE of these verdicts with evidence:

- IMPLEMENTED — the improvement is fully shipped. Cite 1-3 specific file paths (with line numbers if helpful) that prove it. Be strict: partial implementations are NOT implemented.
- PARTIAL — some of it is done but key pieces are missing. Cite what's done and what's missing.
- NOT_DONE — no trace in the codebase, or the improvement describes something that clearly doesn't exist yet.

Keep your response under 100 words. Format:
VERDICT: {IMPLEMENTED|PARTIAL|NOT_DONE}
EVIDENCE:
- {file path 1}: {why this proves it}
- {file path 2}: {why this proves it}
```

### 3. Close IMPLEMENTED items

For each agent verdict of `IMPLEMENTED`, call `mcp__holocron__closeImprovementTool` (or `setImprovementStatusTool` with status=closed) with:

- `id`: the improvement `_id`
- `reason`: `"Auto-closed by codebase audit on {YYYY-MM-DD}: {1-sentence why}"`
- `evidence`: array of file paths from the agent's EVIDENCE section

Do NOT close PARTIAL or NOT_DONE items — they stay open.

### 4. Print the audit summary

Output a concise markdown table to the user:

| Status | ID | Title | Evidence |
|---|---|---|---|
| ✅ Closed | `ps7xxx` | Feature X | `path/to/file.ts:123` |
| 🟡 Partial | `ps7yyy` | Feature Y | what's missing |
| ⚪ Not done | `ps7zzz` | Feature Z | — |

End with a count: `Closed N / Partial M / Open P`.

## Modes

- **Default** (no args): runs audit + closes. Prints summary.
- **`dry-run`**: runs the audit but does NOT call `closeImprovementTool`. Shows what WOULD be closed. Useful before committing to the change.

## Notes

- The audit is evidence-based. Agents must cite file paths; "I think this is done" without paths = treat as PARTIAL.
- Idempotent — re-running closes any newly-shipped items without touching already-closed ones.
- Safe to run as a post-commit hook or on a schedule (see `/loop` or `/schedule`).
- If `mcp__holocron__closeImprovementTool` is not yet in your tool list, the holocron MCP needs a rebuild (`cd holocron-mcp && bun run build`) and a Claude Code restart.
