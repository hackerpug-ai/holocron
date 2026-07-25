# Task for react-native-ui-planner

You are the sole resolved planning specialist for Sprint 21 of the Holocron MK-VI migration. Goal: expand exactly these three Sprint 21 task stubs into full task definitions for kb-sprint-tasks-plan. Do NOT write or edit any files. Return ONLY one ```json code block matching the expanded_tasks schema in /Users/inference1/.pi/agent/skills/kb-sprint-tasks-plan/SKILL.md; every task must set proposed_by to "react-native-ui-planner".

PROJECT ROOT: /Users/inference1/Projects/holocron
SPRINT: Sprint 21: Client Data Contract; sequence 21; timeline Phase 4 — Reference-Flow Gate and Deep Services.
GATE: Running holo verify:client-contract against the 47-file legacy call-site inventory reports all 105 call sites mapped to a live Zero query, Zero mutator, or Hono command target with zero unmapped surfaces.
HUMAN TEST STEPS:
1. Run holo inventory:convex-callsites — enumerates 47 files and 105 convex/react call sites.
2. Run holo verify:client-contract — exits 0 reporting 105/105 call sites mapped.
3. Delete one mapping from 13-client-data-contract.yaml, re-run — exits non-zero naming the orphaned call site.
4. Run holo verify:client-contract --targets — every target resolves in the live zero_pub schema or Hono manifest.
5. Run holo verify:client-contract --schema — every entry declares offline, optimistic, conflict, rejection, identifier fields.
6. Run holo verify:client-contract --e2e-links — every entry links a T-SYNC-* criterion, exits 0.

TASK STUBS (preserve exact IDs/titles/agents/estimates):
- S-CONTRACT-01 | Inventory every legacy Convex hook/action call site in the RN app | react-native-ui-implementer | 120 min
- S-CONTRACT-02 | Author 13-client-data-contract.yaml mapping every call site to its target | react-native-ui-implementer | 300 min
- S-CONTRACT-03 | CI contract-inventory gate: holo verify:client-contract | red-test-generator | 120 min

SPRINT CAPABILITY COVERAGE:
- CAP-SYNC-01: the approved per-call-site mapping to Zero queries/mutators/Hono commands (offline/conflict/identifier contract)
- CAP-CUT-01: the client-flip inventory that must be zero-unmapped before the rewrite

PRD REFERENCES TO READ (read only the relevant sections, not the entire PRD):
- /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/08-uc-sync.md (UC-SYNC-01)
- /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md (client data contract)
- /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/04-api-design.md (Zero query/mutation/offline contract)
- /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md (CAP-SYNC-01, CAP-CUT-01)
- /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/07-ui-infrastructure.md (105 sites / 47 files)
- /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/11-e2e-testing-criteria.md (T-SYNC-019, T-SYNC-004 if present)
- Audit current RN call sites and existing services/platform CLI patterns so paths/commands are current; do not invent source files.

READ THESE GOVERNANCE REFERENCES:
- /Users/inference1/Projects/brain/docs/REQUIREMENT-TRACKING.md
- /Users/inference1/Projects/brain/docs/CAPABILITY-CHAIN-PLANNING.md
- /Users/inference1/Projects/brain/docs/kanban/TASK-TEMPLATE.md
- /Users/inference1/Projects/brain/docs/kanban/task-standards.md (first 80 lines)
- /Users/inference1/Projects/brain/docs/kanban/task-creation-guide.md (first 80 lines)
- /Users/inference1/Projects/brain/docs/TDD-METHODOLOGY.md (first 60 lines)
- /Users/inference1/Projects/holocron/RULES.md

VERIFICATION DISCOVERY: project root lefthook.yml defines exact commands: pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}; pnpm tsgo --noEmit; pnpm test:unit. Use exact commands where applicable. For the contract CLI, use the real command paths discovered in repo; do not substitute invented defaults.

PLANNING RULES:
- Each task needs complete critical_constraints, specification, 4+ behavioral GIVEN/WHEN/THEN ACs where possible, stable AC-N/TC-N IDs, flattened requirements, exact verification gates per AC, explicit writeAllowed/prohibited paths, reading_list, design/pattern/anti-pattern, coding standards, dependencies, capability metadata, and proposed_by.
- Every behavioral AC needs a valid scenario with shared task fixtures, concrete must_observe + must_not_observe + negative_control; no mocks/stubs/static-shell proof. PRIMARY AC must integration/e2e and carry flow_ref (UC-SYNC-01 or relevant T-SYNC flow). Contract artifact/CLI work may use task_type CONFIG/INFRA and tdd_mode skipped only when genuinely non-behavioral, but still prove real command/file artifacts; do not evade seeded evidence by retyping behavioral work.
- Contract must explicitly cover all required fields: target, projection, response/error shape, ordering/cursor, optimistic behavior, conflict/rejection, offline policy, identifier compatibility, linked E2E criterion. Include negative controls for deleted mapping, stale target, malformed/missing schema fields, and stale inventory.
- Make dependencies topological: inventory before contract authoring; contract before gate; task 3 is RED tests/gate design and should precede implementation/verification.
- Do not add tasks or alter the roadmap task table.

STOP CONDITION: return only parseable JSON; no prose outside the code block.

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