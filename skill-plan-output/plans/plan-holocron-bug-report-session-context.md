# SKILL Plan: holocron-bug-report session context capture

## Overview
Update `/Users/justinrich/Projects/holocron/skills/holocron-bug-report/SKILL.md` so a new report may include a bounded, privacy-preserving snapshot of relevant context already visible in the invoking agent session. The snapshot will make reports easier to investigate without treating the full transcript as durable evidence or silently storing secrets.

## Artifact Classification

**Recommended Type**: SKILL update
**Location**: `/Users/justinrich/Projects/holocron/skills/holocron-bug-report/SKILL.md`
**Invokable**: yes

**Reasoning**:
- The existing artifact is an invokable, stateful JSONL workflow.
- Capturing session context changes report creation, preview, and persistence behavior.
- It needs explicit consent and deterministic storage rules.

**Why not DOC**: A reference document cannot enforce the opt-in, redaction, and bounded-payload workflow.

## Scope

**IN**:
- Add an optional `session_context` object to `report_created` events.
- Extract only context that is already visible to the invoking agent; never claim access to hidden harness logs, other sessions, or external data.
- Capture a compact investigator-oriented digest: the user-reported symptom, relevant recent actions/commands and their outcomes, known error strings, likely affected paths/surfaces, and explicitly labeled unknowns.
- Include an itemized preview of the proposed session context inside the existing `submit` / `edit` / `cancel` approval gate.
- Add user controls to include, edit, omit, or cancel the context snapshot.
- Sanitize sensitive values and enforce bounded field sizes before preview and persistence.

**OUT**:
- Persisting full raw conversation transcripts, chain-of-thought, hidden system/developer prompts, tool credentials, or unseen/harness-private logs.
- Capturing context automatically without showing it to the user.
- Session replay, cross-session lookup, analytics, code modifications, or changing the append-only ledger mechanism.
- Altering the ledger's existing status transition model.

## Purpose
WORKFLOW

## Existing Artifacts To Leverage
- `/Users/justinrich/Projects/holocron/skills/holocron-bug-report/SKILL.md`: existing redaction, draft preview, explicit write-confirmation, and append-only JSONL rules.
- `/Users/justinrich/Projects/holocron/data/holocron-bug-reports.jsonl`: canonical report event ledger.

## DRY Analysis

### Shared Patterns Found
- **Sensitive-content redaction**: Existing skill already requires redaction before preview/save. Keep one shared sanitization rule and apply it to both user details and session snapshot fields.
- **Draft confirmation**: Existing skill already rerenders drafts for `edit` and rejects inferred approval. Extend that single gate rather than add a second submission confirmation.
- **Bounded evidence representation**: Existing `evidence[]` stores source references. Keep session-derived raw sources as evidence references where appropriate; do not duplicate them as a transcript.

### Proposed Shared Artifacts
- **New Skill**: None. This behavior is specific to report drafting.
- **New Doc**: None. The privacy and portability contract belongs in the skill.

## Data Contract

Extend only creation events with this optional object:

```json
{
  "session_context": {
    "capture_mode": "visible_session_summary",
    "captured_at": "ISO-8601 UTC timestamp",
    "scope": "report-relevant context already visible to the invoking agent",
    "summary": "Concise factual timeline and symptom context.",
    "recent_observations": [
      {
        "kind": "user_report | command | tool_result | error | file_context | agent_observation",
        "summary": "Sanitized factual statement.",
        "reference": "Optional safe command, path, or error identifier"
      }
    ],
    "affected_artifacts": ["safe repo-relative path or surface"],
    "unknowns": ["Fact not available in this session"],
    "redactions_applied": ["credential | token | connection_string | personal_data"]
  }
}
```

Invariants:
- `session_context` is optional and omitted if the user declines capture.
- `capture_mode` is always `visible_session_summary`; never imply raw-transcript extraction.
- `summary` is factual, no chain-of-thought, no unsupported causal claims.
- `recent_observations` contains at most 8 items; `affected_artifacts` and `unknowns` at most 8 each.
- Every string is sanitized and truncated (summary 1,500 chars; item summary 500; reference 300; paths/surfaces 300; unknown 300).
- Each context item must identify a safe provenance `kind`; raw command output is summarized, with only non-secret error excerpts retained.
- Top-level `redactions_applied` remains the aggregate redaction record; `session_context.redactions_applied` describes context-specific redactions.

## Process Algorithm

[1] **Parse context preference**
- Action: Support create flags `--with-session-context`, `--without-session-context`, and `--session-context-only` (the latter prepares a draft from the supplied symptom plus visible-session context).
- Default: Ask once after the symptom intake: `Would you like me to include a sanitized summary of relevant context from this session? (include / omit)`.
- Verify: Record a draft-only choice; do not create the ledger yet.
- Error: If the harness cannot expose meaningful visible context beyond the current user request, state that and offer the user a manual context note instead.

[2] **Build a bounded candidate snapshot**
- Action: From context already in the current agent conversation, select only facts directly relevant to the report: reported symptom, attempted non-destructive diagnostic actions, observed command/tool outcomes, exact error identifiers, and candidate affected repository artifacts.
- Verify: Label uncertain inferences as `unknowns` or `investigation_hypothesis`, never as observations.
- Error: If nothing relevant is available, omit `session_context` and continue with ordinary intake.

[3] **Sanitize and minimize**
- Action: Apply the existing credential/token/private-key/connection-string redaction policy plus omit system/developer prompts, reasoning traces, unrelated conversation, and personal details that are unnecessary for debugging.
- Verify: Enforce field caps and safe relative-artifact references before showing the draft.
- Error: If a potentially sensitive fragment cannot safely be summarized, replace it with `[redacted: category]` and preserve only the redaction category.

[4] **Allow targeted context edits**
- Action: Render the candidate under a distinct `Session context (optional)` section. Let the user say `include`, `omit`, `edit context <change>`, or request additions such as an exact command/error/path.
- Verify: All edits re-run sanitization and caps.
- Error: If user asks to store a full transcript or secret, explain the limitation and offer a sanitized summary instead.

[5] **Use the existing final submission gate**
- Action: Render the complete report creation event, including whether session context is included or omitted, then ask the existing exact question: `Does this submission look right? Reply submit, edit <what to change>, or cancel.`
- Verify: `submit` is still the only action that may write; `edit` must rerender the entire proposal; `cancel` writes nothing.
- Error: Do not treat context opt-in as final submission approval.

[6] **Persist and report**
- Action: Append the sanitized event under existing lock/append/re-read validation rules.
- Verify: Re-read the event and report whether its `session_context` object is present, without echoing its contents unnecessarily.
- Error: Preserve all existing append failure behavior.

## Harness Compatibility

- **pi**: Use only user/assistant/tool facts visible to the current agent. Do not invoke context compression/decompression APIs to harvest historical transcripts; those are session-management mechanisms, not report-export APIs.
- **Claude Code / Codex / Cursor**: Same visible-context-only contract. If a given harness cannot reliably surface prior messages, ask the user for the relevant actions/errors rather than inventing or claiming access.
- **Fallback**: Ask for a compact `context note` (recent action, error, affected path); mark it user-provided in the snapshot.

## Edge Cases & Errors

| Category | Case | Handling |
|---|---|---|
| Privacy | Session includes an API key, token, password, cookie, private key, database URL, or personal data | Redact value before preview; retain category only. |
| Privacy | User requests raw transcript capture | Decline raw capture; offer the bounded sanitized digest. |
| Evidence | Context is unrelated to the stated bug | Exclude it. |
| Availability | No meaningful prior session context visible | Explain limitation; omit snapshot or ask for manual note. |
| Accuracy | Agent has only an inference, not an observation | Put it in `unknowns` or `investigation_hypothesis`, not an observation. |
| Size | Candidate exceeds caps | Prefer most recent and diagnostic facts, then report that older context was omitted. |
| Confirmation | User says `include` | Treat as context preference only; still require final `submit`. |
| Ledger | Older creation events lack `session_context` | Valid; reader/reducer must treat it as absent. |

## Output Template

```text
Draft session context (optional; sanitized)
- Summary: <factual debugging-oriented digest>
- Observations: <0–8 summarized facts>
- Affected artifacts: <safe paths/surfaces>
- Unknowns: <open facts>
- Redactions: <categories or none>

Include this context, edit it, or omit it?

[After inclusion/omission, existing final report preview]
Does this submission look right? Reply submit, edit <what to change>, or cancel.
```

## Examples

```text
/holocron-bug-report --with-session-context "Search returned stale content after a document update."
/holocron-bug-report --without-session-context "The report list omits an open record."
/holocron-bug-report "A status update says fixed but the repro still fails."
# The skill asks whether to include a sanitized visible-session summary.
```

## Validation Plan

1. Update the skill's `description` and create-mode usage examples with the new opt-in context behavior.
2. Check that the schema remains backward-compatible when `session_context` is absent.
3. Add deterministic textual-contract checks for: visible-session-only limitation, opt-in/omit/edit behavior, bounded caps, redaction, existing final confirmation wording, and no raw transcript capture.
4. Parse the empty/current JSONL ledger and run `git diff --check`.
5. Commit only the skill update (and tests if introduced) with normal hooks; do not modify existing report rows to backfill context.
