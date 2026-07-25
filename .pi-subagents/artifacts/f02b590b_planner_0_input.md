# Task for planner

You are acting as the logical specialist `react-native-ui-planner` (runtime fallback because the configured custom model is unavailable). Goal: expand Sprint 21 Client Data Contract task stubs into implementation-ready JSON. Read /Users/inference1/Projects/holocron/RULES.md, Sprint 21 in /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/ROADMAP.md, relevant UC-SYNC-01/T-SYNC-019/T-SYNC-004 sections in /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/README.md and 08-uc-sync.md, and inspect current RN app plus services/platform CLI/schema/Zero/Hono surfaces. Do not write files. Return exactly one fenced JSON block {"expanded_tasks":[...]} and no prose. Expand ALL three stubs: S-CONTRACT-01 inventory legacy Convex hook/action call sites (react-native-ui-implementer, 120 min), S-CONTRACT-02 author 13-client-data-contract.yaml mapping every call site (react-native-ui-implementer, 300 min), S-CONTRACT-03 CI contract-inventory gate holo verify:client-contract (red-test-generator, 120 min). Every task object MUST set proposed_by:"react-native-ui-planner", task_type, background, outcome/specification objective+success_state, 4+ GWT ACs with stable AC-N IDs and scenario/fixtures for every behavioral AC, primary integration/e2e tier, TC-N mapped test criteria, exact verification commands, reading_list with real paths+line ranges, writeAllowed/writeProhibited, CAP-SYNC-01 and CAP-CUT-01 touches/provides/consumes/boundary_contracts, dependencies, implementer/reviewer assignment+rationale, coding_standards. Locate actual validate_scenario.py and use valid scenarios. Use realistic filenames only.

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