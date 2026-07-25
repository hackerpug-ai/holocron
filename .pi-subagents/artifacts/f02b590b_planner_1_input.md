# Task for planner

You are acting as the logical design specialist `frontend-designer` (runtime fallback because the configured custom model is unavailable). Independently review Sprint 21 Client Data Contract. Read /Users/inference1/Projects/holocron/RULES.md, Sprint 21 in /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/ROADMAP.md, relevant sync PRD sections and inspect current RN app call-site patterns plus Zero/Hono targets. Do not write files. Return exactly one fenced JSON block {"design_enrichments":[...],"design_tasks":[]} and no prose. For each task ID provide concrete client data contract/schema/consumer-facing notes, real file references, and concerns about offline/optimistic/conflict/error/identifier semantics. Do not invent UI mockups. Any task proposal must set proposed_by:"frontend-designer".

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: review-findings, residual-risks

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```