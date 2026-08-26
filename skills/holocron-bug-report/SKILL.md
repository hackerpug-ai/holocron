---
name: holocron-bug-report
description: "Create, inspect, and update evidence-backed Holocron bug reports in this repository's JSONL ledger. Requires explicit submit, edit, or cancel confirmation before every write."
compatibility: "Claude Code, Codex, Cursor, pi, and other harnesses with local file and shell access."
allowed-tools: "Read Write Bash"
disable-model-invocation: true
metadata:
  version: "1.0"
---

# /holocron-bug-report

Create an agent-investigable, local bug report. The canonical destination is
`data/holocron-bug-reports.jsonl`, relative to this repository's Git root.

## When To Use

- A user reports a malfunction, regression, incorrect result, or reliability problem in Holocron.
- An agent needs a durable investigation record that other agents can read and update.
- A verified remediation needs to be recorded as fixed.

## When Not To Use

- For feature requests or general improvements with no observed incorrect behavior.
- To automatically change application code or file an external issue.
- To claim a bug is fixed without a concrete fix reference and verification evidence.

## Storage Contract

The ledger is append-only JSONL: exactly one complete JSON object per non-empty line.
Never reformat, truncate, or rewrite existing lines.

Events share these required fields:

```json
{
  "event_type": "report_created | status_changed",
  "event_id": "bugevt_<UTC timestamp>_<random suffix>",
  "occurred_at": "ISO-8601 UTC timestamp",
  "report_id": "bug_<UTC timestamp>_<random suffix>",
  "schema_version": 1
}
```

### Creation event

```json
{
  "event_type": "report_created",
  "status": "open",
  "title": "Short factual summary",
  "summary": "What is broken and who it affects.",
  "area": "relative path, subsystem, or surface",
  "severity": "low | medium | high | critical",
  "reproduction_steps": ["Action one", "Action two"],
  "expected_behavior": "What should happen.",
  "actual_behavior": "What happened instead.",
  "environment": {
    "branch": "optional branch",
    "command_or_surface": "optional command, route, or UI surface",
    "runtime": "optional runtime/version"
  },
  "evidence": [
    { "kind": "command_output | screenshot | log | file", "reference": "safe path or excerpt", "note": "why it matters" }
  ],
  "investigation_hypothesis": "Optional, explicitly unverified hypothesis.",
  "reporter_context": "Optional context",
  "redactions_applied": ["Optional redaction category"]
}
```

### Status event

```json
{
  "event_type": "status_changed",
  "status": "open | investigating | fixed | wont_fix",
  "reason": "Why this status changed.",
  "changed_by": "user or agent identifier",
  "fix_reference": "commit, PR, task, or path; required when fixed",
  "verification": "Observed proof; required when fixed"
}
```

The current report state is the latest event by `occurred_at` for each `report_id`.
A report is fixed **only** when that latest state is `fixed`.

Allowed transitions:

```text
open          -> investigating | wont_fix
investigating -> open | fixed | wont_fix
wont_fix      -> open
fixed         -> open   (only for a regression)
```

## Algorithm

### 1. Parse the mode

```text
/holocron-bug-report "description of the problem"  # create (default)
/holocron-bug-report --list [--status STATUS]      # summarized current records
/holocron-bug-report --show REPORT_ID              # full event history
/holocron-bug-report --status REPORT_ID STATUS     # propose a state transition
```

Reject unknown flags and statuses with the usage block above. Resolve the Git root with
`git rev-parse --show-toplevel`; stop if it cannot be found. Do not use a user-home or
worktree-relative fallback destination.

### 2. Validate the existing ledger

- Target `{git-root}/data/holocron-bug-reports.jsonl`.
- If it does not exist, treat it as empty. Do **not** create it until `submit` is confirmed.
- Parse every non-empty line separately with a standard JSON parser.
- If a line is invalid JSON or lacks required event fields, stop and report its line number.
  Do not repair it automatically and do not append a new event.
- Reduce valid events by `report_id`, choosing the latest ISO timestamp; preserve chronological
  events for `--show`.

### 3. Create a complete draft

For create mode, turn the supplied prose into the creation event. Ask concise follow-up questions
only for missing high-value facts:

1. What is a short title and affected area?
2. What steps reproduce it? If unknown, record `not yet reproducible` rather than inventing steps.
3. What did you expect, and what actually happened?
4. What is the impact/severity? Default to `medium` only if the user declines to choose.
5. Is there safe evidence (a path, non-secret log excerpt, screenshot, or command output)?

Optionally capture current branch, command/surface, and runtime. Never run destructive commands
or reproduce a bug without explicit separate authorization.

Treat all hypotheses as unverified. Scan proposed content for credentials, tokens, private keys,
or connection strings. Redact their values before previewing or saving; record only the redaction
category in `redactions_applied`.

Before creating, compare normalized title + area against unresolved records. If similar records
exist, show their IDs and titles, but let the user decide whether this is distinct.

### 4. Require a submission confirmation

Render the full proposed event in readable form, including ID, `open` status, destination,
all unknown values, evidence, and unverified hypothesis. Then ask exactly:

> Does this submission look right? Reply `submit`, `edit <what to change>`, or `cancel`.

- **submit**: continue to persistence.
- **edit**: change only what the user requested and render this confirmation again.
- **cancel**: do not make any file changes; state that no report was saved.
- Any other response: ask the same question again. Never infer approval.

### 5. Persist safely after submit

- Make an ID such as `bug_YYYYMMDDTHHMMSSZ_<8 random lowercase-hex characters>` and a distinct
  event ID. Use a UTC ISO timestamp.
- Serialize and parse the proposed event before it reaches the ledger.
- Create `data/` only now.
- Append one newline-terminated JSON record while holding a short exclusive local lock if the
  platform provides one. If no lock primitive is available, write the event to a unique temporary
  file in the ledger directory, append it in a single operation, immediately re-read the ledger,
  and verify exactly one matching `event_id` exists.
- Never use `>` on the ledger after its initial absent-file creation; append only.
- Re-parse and reduce the ledger. Confirm the new report state is `open`.

Output report ID, current status, saved path, and this suggested handoff:

```text
Investigate report <report_id> in data/holocron-bug-reports.jsonl. Verify reproduction,
identify likely code paths, and append an investigating or evidence-backed fixed status event.
```

### 6. Read modes

- `--list` displays report ID, status, severity, area, title, and latest timestamp. By default,
  omit `fixed` records; `--status fixed` lists them.
- `--show REPORT_ID` displays the original report and every chronological status event.
- Return an explicit “not found” response for an unknown ID.

### 7. Change status

- Look up and reduce the existing record. Reject an unknown report ID or an illegal transition.
- Collect a non-empty reason and `changed_by` identifier.
- For `fixed`, require both a concrete `fix_reference` and an observed `verification` result.
  A plan, hypothesis, or “should be fixed” is insufficient.
- Preview the exact status event and ask the same `submit / edit / cancel` confirmation.
- On submit, append and re-reduce; state whether the record now has `fixed` status.

## Error Handling

| Error | Handling |
|---|---|
| Git root unavailable | Stop; the ledger must be repository-local. |
| Missing description | Ask what went wrong, then begin draft intake. |
| Invalid ledger line | Stop with line number; preserve all existing data. |
| Possible secret | Redact before preview/save and explain the category redacted. |
| Duplicate-looking report | Show matches; user may continue, edit, or cancel. |
| Missing fix proof | Do not permit `fixed`; offer `investigating`. |
| Append verification fails | Stop and report the mismatch; do not claim submission succeeded. |

## Examples

```text
/holocron-bug-report "Hybrid search returns stale content after a document update."
/holocron-bug-report --list
/holocron-bug-report --list --status fixed
/holocron-bug-report --show bug_20260825T153045Z_a1b2c3d4
/holocron-bug-report --status bug_20260825T153045Z_a1b2c3d4 investigating
/holocron-bug-report --status bug_20260825T153045Z_a1b2c3d4 fixed
```
