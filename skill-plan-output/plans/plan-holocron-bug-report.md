# Skill Plan: holocron-bug-report

## Overview
Create an invokable, repository-local workflow skill that turns a user-described Holocron problem into a durable, agent-investigable bug record. The skill must show a complete draft and explicitly ask the user to submit, revise, or cancel before any repository file is changed.

## Artifact Classification

**Recommended Type**: SKILL  
**Location**: `/Users/justinrich/Projects/holocron/skills/holocron-bug-report/SKILL.md`  
**Invokable**: yes

**Reasoning**:
- It is naturally invoked as `/holocron-bug-report`.
- It orchestrates structured intake, validation, a confirmation gate, and a durable local write.
- It maintains an auditable lifecycle that agents can later inspect and update.

**Why not DOC**: a reference document cannot run the confirmation and append-only persistence workflow.

## Scope

**IN**:
- Guided intake of a Holocron bug report from prose or flags.
- A reviewable draft containing reproduction, expected/actual behavior, impact, environment, evidence, and an initial investigation hypothesis.
- An explicit `submit / edit / cancel` user gate before writing.
- Append-only storage in this repository at `data/holocron-bug-reports.jsonl`.
- Lifecycle events that express whether a report is open, investigating, fixed, or will not be fixed.
- Read/list/status and update commands so agents can locate unresolved bugs and record a verified fix.

**OUT**:
- Automatically changing application code, running destructive reproduction steps, filing GitHub issues, or posting to any external service.
- Claiming that a bug is fixed without user/agent-supplied verification evidence.
- Storing credentials, access tokens, or unredacted secrets in a report.

## Purpose
**WORKFLOW**

## Existing Artifacts To Leverage
- `/Users/justinrich/Projects/holocron/components/improvements/ImprovementSubmitSheet.tsx` demonstrates a local product improvement/bug-report intake surface, but it persists app-side requests and is not a reusable harness skill.
- `/Users/justinrich/Projects/holocron/skills/whats-new/SKILL.md` provides the established repository-local skill layout and progressive execution-algorithm style.

## DRY Analysis

### Shared Patterns Found
- **Confirm before mutation**: required at the one local JSONL append boundary. Keep local; it has one consumer and safety-critical wording.
- **JSONL append/read/reduce**: used by create, list, show, and status update paths. Define once in the skill as a storage contract, rather than duplicating schemas in each command.
- **Structured report rendering**: used for draft preview and post-save output. Define one canonical field order and reuse it.

### Proposed Shared Artifacts
- **New Skill**: `holocron-bug-report` — the requested workflow.
- **New Doc**: None. The storage schema is compact and is best co-located in `SKILL.md` until a second consumer appears.
- **No Extraction Needed**: no helper script initially; the skill can use portable shell/Python/Node primitives. Extract a validator only after another repository consumer needs it.

## Data Contract

Create `data/holocron-bug-reports.jsonl` on first approved submission. It is an append-only event ledger: one valid JSON object per newline, UTF-8, no blank or partial lines. Report state is reduced from events by `report_id`; the latest event timestamp wins.

### `report_created` event
```json
{
  "event_type": "report_created",
  "event_id": "bugevt_20260825T153045Z_a1b2c3d4",
  "occurred_at": "2026-08-25T15:30:45Z",
  "report_id": "bug_20260825T153045Z_a1b2c3d4",
  "status": "open",
  "title": "Short imperative-free summary",
  "summary": "What is broken and who it affects.",
  "area": "services/platform",
  "severity": "medium",
  "reproduction_steps": ["..."],
  "expected_behavior": "...",
  "actual_behavior": "...",
  "environment": {"branch": "...", "command_or_surface": "...", "runtime": "..."},
  "evidence": [{"kind": "command_output|screenshot|log|file", "reference": "...", "note": "..."}],
  "investigation_hypothesis": "Clearly labelled hypothesis, not a fact.",
  "reporter_context": "Optional user-provided context",
  "redactions_applied": ["..."],
  "schema_version": 1
}
```

### `status_changed` event
```json
{
  "event_type": "status_changed",
  "event_id": "bugevt_...",
  "occurred_at": "...",
  "report_id": "bug_...",
  "status": "investigating|fixed|wont_fix",
  "reason": "Why the status changed.",
  "fix_reference": "commit, PR, task, or path; required for fixed",
  "verification": "Observed proof; required for fixed",
  "changed_by": "user or agent identifier",
  "schema_version": 1
}
```

### Status semantics
| Status | Meaning | Required evidence |
|---|---|---|
| `open` | Submitted and awaiting investigation | Complete creation event |
| `investigating` | An agent/person has begun analysis | Reason/owner context |
| `fixed` | A change is believed verified | `fix_reference` and concrete `verification` |
| `wont_fix` | Deliberately closed without a code fix | Decision reason |

`fixed` is the explicit answer to “have we fixed it?”; a report is fixed only when its reduced latest status equals `fixed`.

## Process Algorithm

[1] **Parse command and route mode**
- Support default create plus `--list [--status <status>]`, `--show <report-id>`, and `--status <report-id> <new-status>`.
- Verify: reject unknown flags/status values with usage examples.
- Error: if no create description is supplied, ask one concise prompt for what went wrong.

[2] **Load and validate the ledger**
- Resolve the repository root from Git; use `data/holocron-bug-reports.jsonl` relative to it.
- If absent, treat it as an empty ledger; create its parent only after submission approval.
- Parse every non-empty existing line independently; stop on malformed JSON and report the line number rather than risking data loss.
- Verify that each known event has `event_type`, `report_id`, `occurred_at`, and supported status.

[3] **Collect and normalize the bug draft**
- Ask only for missing high-value fields: title/summary, reproduce steps, expected vs actual, impact/severity, and relevant command/surface.
- Capture optional evidence paths/log excerpts and repository/git context only when available; never expose secrets.
- Redact obvious sensitive values and state which redactions were made.
- Ask whether a hypothesis should be recorded; label it as unverified.
- Verify required fields are nonempty and reproduction is either actionable or explicitly marked unavailable.

[4] **Render the confirmation preview**
- Display every field, the proposed `report_id`, destination, initial `open` status, and a concise list of gaps/assumptions.
- Ask exactly: **“Does this submission look right? Reply `submit`, `edit <what to change>`, or `cancel`.”**
- `edit`: revise only requested fields and return to this preview.
- `cancel`: make no file changes and state that no report was saved.

[5] **Persist after explicit submit only**
- Generate collision-resistant UTC IDs and the creation event.
- Validate event JSON before writing; write one newline-delimited record using a concurrency-safe append strategy (exclusive lock if available; otherwise write a unique temporary event file, append atomically under a short lock, then re-read and confirm exactly one matching `event_id`).
- Never truncate/reformat existing ledger content.
- Verify the new event can be parsed after write and reduces to `open` for the new `report_id`.

[6] **Report saved result**
- Print report ID, status, storage path, suggested investigation prompt, and commands to list/show/update it.

[7] **Read/list/status modes**
- Reduce events by report ID and display current status, title, severity, newest update, and fix reference/verification when fixed.
- `--list` defaults to non-fixed reports; `--list --status fixed` shows fixed reports.
- `--show` displays the creation details plus chronological updates.

[8] **Status transition mode**
- Allow only `open -> investigating|wont_fix`, `investigating -> open|fixed|wont_fix`, and `wont_fix -> open`; permit `fixed -> open` only to reopen a regression.
- Before appending any status event, show its exact preview and ask `submit / edit / cancel`.
- Require nonempty `reason` for all transitions and both `fix_reference` plus `verification` for `fixed`.
- Verify the append and reducer result; report that fixed status is a recorded, evidence-backed claim.

## Edge Cases & Errors

| Category | Case | Handling |
|---|---|---|
| Input | Vague report | Ask targeted questions; preserve unknown fields as `not provided`, never invent facts. |
| Safety | Secret in prose/log | Redact it; show redaction category, not the secret; ask for safer evidence if needed. |
| Storage | Missing `data/` directory/file | Create only after `submit`; otherwise keep draft in chat. |
| Storage | Malformed existing JSONL line | Stop, give line number, do not append or repair automatically. |
| Concurrency | Another writer appends | Use lock/re-read verification; never rewrite the ledger wholesale. |
| State | Illegal transition | Explain allowed transitions and offer the closest valid state. |
| Fix claim | No proof attached | Refuse `fixed`; allow `investigating` instead. |
| Duplicate | Similar open title/area | Warn with matching report IDs; let the user submit as a distinct report, revise, or cancel. |

## Required Capabilities
- Read/write repository files and create directories.
- Shell or a standard local runtime for JSON validation, ID/time generation, and safe append behavior.
- Plain chat asking for the confirmation gate; no external API is required.

## Harness Compatibility
- **Claude Code**: use AskUserQuestion if available; otherwise plain chat. Use Read/Bash/Write equivalents.
- **Codex**: use plain chat confirmation plus shell/file tools.
- **Cursor**: use its confirmation UI when present; otherwise plain chat; honor sandbox write permissions.
- **Fallback**: show the draft, wait for exact user approval, then append locally.

## Output Template
```markdown
## Bug report draft — awaiting your approval
- **ID**: `{report_id}`
- **Initial status**: `open`
- **Destination**: `data/holocron-bug-reports.jsonl`
- **Title / severity / area**: ...
- **Reproduction**: ...
- **Expected / actual**: ...
- **Evidence and redactions**: ...
- **Investigation hypothesis (unverified)**: ...

Does this submission look right? Reply **`submit`**, **`edit <what to change>`**, or **`cancel`**.
```

## Examples
```text
/holocron-bug-report "The MCP search endpoint returns stale results after a document update."
/holocron-bug-report --list
/holocron-bug-report --list --status fixed
/holocron-bug-report --show bug_20260825T153045Z_a1b2c3d4
/holocron-bug-report --status bug_20260825T153045Z_a1b2c3d4 investigating
/holocron-bug-report --status bug_20260825T153045Z_a1b2c3d4 fixed
```

## Implementation Steps
1. Create `/Users/justinrich/Projects/holocron/skills/holocron-bug-report/SKILL.md` with spec-compliant frontmatter (`name: holocron-bug-report`, quoted trigger-forward description, `disable-model-invocation: true`) and the algorithm above.
2. Add `data/holocron-bug-reports.jsonl` as an empty, tracked ledger (plus a short `data/README.md` only if repository conventions require documenting the data contract).
3. Validate frontmatter and JSONL schema examples with a local parser; exercise create/cancel/edit/list/show/fixed flows against a temporary ledger without modifying the canonical one until final submit.
4. Commit the skill and empty ledger using the repository’s normal hooks; do not alter the existing unrelated working-tree changes.
