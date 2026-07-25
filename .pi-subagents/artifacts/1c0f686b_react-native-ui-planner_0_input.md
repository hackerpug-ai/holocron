# Task for react-native-ui-planner

Expand Sprint 21 Client Data Contract task stubs into implementation-ready JSON task definitions. Read /Users/inference1/Projects/holocron/RULES.md, the Sprint 21 section in /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/ROADMAP.md, the upstream PRD /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/README.md (only relevant UC-SYNC-01 and T-SYNC-019/T-SYNC-004 sections), and inspect the current RN app plus services/platform CLI/schema/Zero/Hono surfaces. Do not write files. Return exactly one fenced ```json block with {"expanded_tasks":[...]} for ALL three stubs: S-CONTRACT-01 (Inventory every legacy Convex hook/action call site in the RN app, agent react-native-ui-implementer, 120 min), S-CONTRACT-02 (Author 13-client-data-contract.yaml mapping every call site to its target, agent react-native-ui-implementer, 300 min), S-CONTRACT-03 (CI contract-inventory gate: holo verify:client-contract, agent red-test-generator, 120 min). Every task MUST set proposed_by:"react-native-ui-planner", include task_type, background, outcome/specification with objective and success_state, 4+ GIVEN-WHEN-THEN ACs with stable AC-N IDs, scenarios for every behavioral AC with shared fixtures/start_ref, test_tier and verification service, TEST CRITERIA with stable TC-N IDs mapped to ACs, exact verification commands, reading_list with real paths/line ranges, writeAllowed/writeProhibited guardrails, capability metadata touches_capabilities/provides/consumes/boundary_contracts preserving CAP-SYNC-01 and CAP-CUT-01, dependencies, implementer/reviewer assignments and rationale, coding_standards. Include realistic filenames and no invented existing files. Primary AC must integration/e2e. Ensure scenarios are compatible with /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py (or locate actual validator). Planner output is advisory; no file edits.

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