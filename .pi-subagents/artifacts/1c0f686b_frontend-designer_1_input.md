# Task for frontend-designer

Independently review Sprint 21 Client Data Contract from a client-contract/UX boundary perspective and propose JSON enrichments for the same three task IDs. Read /Users/inference1/Projects/holocron/RULES.md, the Sprint 21 section in /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/ROADMAP.md, /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/README.md relevant sync sections, and inspect current RN app call-site patterns and Zero/Hono target surfaces. Do not write files. Return exactly one fenced ```json block with {"design_enrichments":[...],"design_tasks":[...]} where enrichments identify task IDs, concrete contract/schema/consumer-facing notes, real file references, and any design/interaction or data-shape concerns; design_tasks may be empty if implementation planner owns all stubs. Every proposed task object must set proposed_by:"frontend-designer". Do not invent UI mockups; this sprint is a data contract and gate, so focus on client-facing data semantics and migration usability.

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