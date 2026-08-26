---
name: holocron-bug-report
description: "Create, inspect, and update evidence-backed Holocron bug reports in this repository's JSONL ledger, with optional sanitized context from the visible invoking session. Requires explicit submit, edit, or cancel confirmation before every write."
compatibility: "Claude Code, Codex, Cursor, pi, and other harnesses with local file and shell access."
allowed-tools: "Read Write Bash"
disable-model-invocation: true
metadata:
  version: "1.1"
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
  "session_context": {
    "capture_mode": "visible_session_summary",
    "captured_at": "ISO-8601 UTC timestamp",
    "scope": "report-relevant context already visible to the invoking agent",
    "summary": "Sanitized factual debugging summary (maximum 1,500 characters).",
    "recent_observations": [
      {
        "kind": "user_report | command | tool_result | error | file_context | agent_observation",
        "summary": "Sanitized factual observation (maximum 500 characters).",
        "reference": "Optional safe path, command, or error identifier (maximum 300 characters)."
      }
    ],
    "affected_artifacts": ["Safe repository-relative path or surface (maximum 300 characters)."],
    "unknowns": ["Unavailable fact (maximum 300 characters)."],
    "redactions_applied": ["Context-specific redaction category"]
  },
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

`session_context` is optional for backward compatibility. When present, it is a bounded summary,
not a raw transcript: at most 8 `recent_observations`, 8 `affected_artifacts`, and 8 `unknowns`.
`capture_mode` must be `visible_session_summary`. Each observation must use one of the listed
`kind` values. Treat absent session context on older events as normal.

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
/holocron-bug-report "description of the problem"  # create (default; asks about context)
/holocron-bug-report --with-session-context "description" # create with proposed context
/holocron-bug-report --without-session-context "description" # create without context
/holocron-bug-report --session-context-only "description" # create using context plus symptom
/holocron-bug-report --list [--status STATUS]      # summarized current records
/holocron-bug-report --show REPORT_ID              # full event history
/holocron-bug-report --status REPORT_ID STATUS     # propose a state transition
```

`--with-session-context`, `--without-session-context`, and `--session-context-only` are create-mode
flags and cannot be combined. Reject unknown flags, conflicting create flags, and statuses with the
usage block above. Resolve the Git root with
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
connection strings, and unnecessary personal data. Redact their values before previewing or saving;
record only the redaction category in `redactions_applied`.

#### Optional session context

After the high-value intake, unless a create flag already selected the preference, ask exactly:

> Would you like me to include a sanitized summary of relevant context from this session? Reply `include` or `omit`.

- `--with-session-context` selects `include`; `--without-session-context` selects `omit`;
  `--session-context-only` selects `include` but still requires the quoted symptom as the report's
  user-facing problem statement.
- When included, build `session_context` **only from report-relevant facts already visible to the
  invoking agent in the current session**: user-reported symptoms, non-destructive attempted
  actions, observed command/tool outcomes, safe error identifiers, and candidate affected paths or
  surfaces. Do not claim access to hidden harness logs, other sessions, external data, or messages
  not visible to the agent.
- Never store a raw transcript, system/developer prompt, chain-of-thought, or unrelated discussion.
  Summarize command/tool output; retain only a safe non-secret excerpt or identifier.
- Store known factual observations in `recent_observations`. Put unavailable facts and uncertain
  inferences in `unknowns` or the already-unverified `investigation_hypothesis`, never as observed
  facts. If no meaningful visible context exists, say so and offer a user-provided `context note`;
  omit `session_context` if the user declines.
- Redact and truncate every context field before preview: `summary` ≤1,500 characters; an observation
  summary ≤500; and references, artifacts, and unknowns ≤300. Keep the most diagnostic/recent facts
  if a candidate exceeds the list caps. Use `[redacted: category]` where a risky value cannot safely
  be summarized.
- Render a distinct `Session context (optional; sanitized)` section with summary, observations,
  affected artifacts, unknowns, and redaction categories. Before the final report preview, ask:
  `Include this context, edit it, or omit it?` Accept `include`, `omit`, or
  `edit context <what to change>` only at this context-review step. Each edit is re-sanitized,
  re-capped, and rerendered; `omit` removes `session_context` from the draft. A request to store a
  full transcript or secret must be declined with an offer to store a sanitized summary.
- After `include` or `omit`, rerender the complete report and proceed to the final submission gate.
  Context preference is **not** submission approval: at the final gate, accept only `submit`,
  `edit <what to change>`, or `cancel`; interpret `edit context omit` as a final-gate edit that
  removes the snapshot and rerenders the final gate. When a harness cannot reliably surface prior
  messages, ask for a compact manual context note rather than inventing or claiming access.

Before creating, compare normalized title + area against unresolved records. If similar records
exist, show their IDs and titles, but let the user decide whether this is distinct.

### 4. Require a submission confirmation

Render the full proposed event in readable form, including ID, `open` status, destination,
all unknown values, evidence, unverified hypothesis, and whether the distinct `Session context
(optional; sanitized)` section is included or omitted. Then ask exactly:

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
| Possible secret or personal data | Redact before preview/save and explain the category redacted. |
| Raw transcript or hidden context requested | Do not store it; offer a bounded sanitized visible-session summary. |
| No meaningful session context visible | Omit the snapshot or ask for a compact user-provided context note. |
| Duplicate-looking report | Show matches; user may continue, edit, or cancel. |
| Missing fix proof | Do not permit `fixed`; offer `investigating`. |
| Append verification fails | Stop and report the mismatch; do not claim submission succeeded. |

## Examples

```text
/holocron-bug-report "Hybrid search returns stale content after a document update."
/holocron-bug-report --with-session-context "Search result remained stale after update command completed."
/holocron-bug-report --without-session-context "The report list omits an open record."
/holocron-bug-report --session-context-only "A status update says fixed but the repro still fails."
/holocron-bug-report --list
/holocron-bug-report --list --status fixed
/holocron-bug-report --show bug_20260825T153045Z_a1b2c3d4
/holocron-bug-report --status bug_20260825T153045Z_a1b2c3d4 investigating
/holocron-bug-report --status bug_20260825T153045Z_a1b2c3d4 fixed
```
