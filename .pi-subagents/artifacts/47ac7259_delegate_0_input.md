# Task for delegate

You are the re-dispatched logical specialist `frontend-designer` for Sprint 21 Client Data Contract, using the supported delegate path because the configured custom frontend-designer path failed with unavailable child tools. This is a required specialist retry, not optional. Read /Users/inference1/Projects/holocron/RULES.md, Sprint 21 in /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/ROADMAP.md, relevant sync PRD files under /Users/inference1/Projects/holocron/.spec/prds/mk6-migration (08-uc-sync.md, 10-technical-requirements/04-api-design.md, 10-technical-requirements/12-migration-contract-artifacts.md, 11-e2e-testing-criteria.md), and inspect current RN app call-site patterns plus Zero/Hono target surfaces. Do not write files. Return exactly one fenced JSON block and no prose: {"design_enrichments":[...],"design_tasks":[]}. Enrich S-CONTRACT-01, S-CONTRACT-02, S-CONTRACT-03 with concrete client data contract/schema/consumer-facing notes, real file references and line ranges, offline/optimistic/conflict/error/identifier semantics, and blocker/high findings. Do not invent UI mockups or files. Include proposed_by:"frontend-designer" in each enrichment. Distinguish current live targets from PRD-declared targets; explicitly flag unresolved surfaces. Stop only after producing the JSON block.

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