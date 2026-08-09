# D08-04 — Author the decommission runbook (ordered, gated checklist)

> **Task ID:** D08-04
> **Sprint:** [Sprint 32 — Convex Decommission — Code, Deps and Cloud Deletion](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Reviewer:** `security-reviewer`
> **Estimate:** 60 min
> **Type:** INFRA
> **Priority:** P0 · **Effort:** M
> **Proposed By:** `devops-engineer`
> **TDD_MODE:** `skipped` · **RED_GREEN_REQUIRED:** no
> **Verification policy:** tests=false · red=false · seeded=true
> Status: Backlog

**Capabilities:** CAP-CUT-01 · CAP-BAK-01
**PRD refs:** UC-SYNC-05 · T-SYNC-018 · CAP-CUT-01 · CAP-BAK-01

## Operator outcome

Author .spec/prds/mk6-migration/runbooks/convex-decommission.md as the canonical sequence from readiness through D08-03 recovery eligibility, an explicit human hold, D08-05 operator deletion, post-delete proof, abort, recovery, escalation, and secret-safe evidence handling. D08-04 never deletes Convex.

## Scope and guardrails

WRITE-ALLOWED: the runbook, services/platform/tests/integration/sprint32-decommission-runbook.test.ts, and .tmp/REDHAT-FIX-S32-D08-04/**.

WRITE-PROHIBITED: cloud/provider mutation; D08-03 evidence changes; product source/package changes; credentials in runbook or evidence; automatic transition from eligibility to deletion.

## Exact verification

    test -s .spec/prds/mk6-migration/runbooks/convex-decommission.md && rg -n 'G0|G1|G2|G3|G4|G5|G6|D08-03|D08-05|ABORT|ESCALAT|secret' .spec/prds/mk6-migration/runbooks/convex-decommission.md && git diff --check -- .spec/prds/mk6-migration/runbooks/convex-decommission.md
    PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint32-decommission-runbook.test.ts
    pnpm tsgo --noEmit

<details>
<summary>Full agent specification</summary>

TASK: D08-04 — Author the decommission runbook (ordered, gated checklist)
TASK_TYPE: INFRA
STATUS: Backlog
PRIORITY: P0
EFFORT: M (60 min)
AGENT: devops-engineer
REVIEWER: security-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE: skipped
RED_GREEN_REQUIRED: no
CAPABILITY: CAP-CUT-01, CAP-BAK-01

## Outcome

The runbook makes the state transition explicit: D08-03 proves recovery eligibility; only a separate human checkpoint may authorize D08-05. It documents real commands and evidence without inventing a deletion verb.

## Critical constraints

- MUST order G0 preflight, G1 readiness, G2 D08-03 artifact, G3 human hold, G4 D08-05 handoff, G5 post-delete verification, and G6 abort/escalation.
- MUST require deletion_eligible=true and convex_deletion_performed=false before the hold.
- MUST document provider target identity, explicit operator approval, redacted receipt, SHA-256 evidence, Postgres/blob recovery, and escalation.
- NEVER execute or automate deletion in D08-04.
- NEVER promise Convex rollback after D08-05.

## Acceptance criteria

AC-1 [PRIMARY] Ordered checklist: GIVEN the Sprint 32 repository and gate plan, WHEN the runbook is validated, THEN G0-G6 and exact repository commands are present in order. TEST_TIER=integration; VERIFICATION_SERVICE=filesystem+repository-command-contract; FLOW_REF=T-SYNC-018.

AC-2 Eligibility boundary: GIVEN the D08-03 artifact, WHEN the runbook pre-delete section is followed, THEN all checks pass and a human hold remains before D08-05. TEST_TIER=e2e; VERIFICATION_SERVICE=jq+deletion-gate-consumer; FLOW_REF=T-SYNC-018.

AC-3 Human hold: GIVEN a pass gate, WHEN the operator reaches D08-05, THEN exact production scope, explicit approval, manual provider action, and redacted receipt requirements are recorded. TEST_TIER=e2e; VERIFICATION_SERVICE=human-approval+provider-handoff; FLOW_REF=T-SYNC-018.

AC-4 Failure handling: GIVEN a failed or post-delete probe, WHEN the failure branch is followed, THEN the run aborts/escalates, preserves secret-free evidence, and uses Postgres/blob recovery rather than Convex rollback. TEST_TIER=integration; VERIFICATION_SERVICE=filesystem+incident-evidence; FLOW_REF=T-SYNC-018.

## Scope

Write the runbook and its read-only contract test only. Do not execute D08-05, change D08-03 evidence, or alter provider/cloud state.

## Reading list

1. .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/SPRINT.md
2. .spec/prds/mk6-migration/08-uc-sync.md
3. .spec/prds/mk6-migration/11-e2e-testing-criteria.md
4. .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/gate-plan.json
5. .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/HUMAN-GATE.md

## Evidence gates

- Runbook is non-empty, ordered, and references G0-G6, D08-03, D08-05, abort, escalation, and secret-safe evidence.
- D08-03 artifact is all-pass and remains convex_deletion_performed=false.
- D08-05 is manual, explicit, irreversible, and has no invented repository deletion command.
- Failure branch includes abort code, Postgres/blob recovery, escalation event, and zero secret hits.

## Design and anti-pattern

Pattern: immutable readiness evidence -> recovery eligibility -> explicit hold -> operator handoff -> post-delete verification.

Anti-pattern: one script that combines restore proof and deletion, implicit approval, raw provider receipt, or rollback claims after deletion.

Source references: Sprint 28 gate-plan.json and HUMAN-GATE.md; runbooks/fire-drill-monthly.md; existing restore and no-Convex verification commands; and the D08-03/D08-05 task contracts.

## Dependencies

Depends on D08-01, D08-02, D08-03, Sprint 28 recovery evidence, and Sprint 31 readiness. Blocks D08-05.

## Test criteria

- TC-1 maps to AC-1: the runbook contains ordered G0-G6 gates and exact repository-native commands.
- TC-2 maps to AC-2: the D08-03 artifact is an all-pass eligibility input, while a human hold remains before D08-05.
- TC-3 maps to AC-3: production scope, explicit authorization, manual provider handoff, irreversible semantics, and redacted receipt handling are stated.
- TC-4 maps to AC-4: failed gates abort with a defined code, escalate, preserve secret-free evidence, and recover through Postgres/blob paths without promising Convex rollback.

## Agent rationale and pairing

devops-engineer owns the ordered operational runbook because it binds the Sprint 28 recovery gate to an external provider handoff. security-reviewer pairs on fail-closed transitions, human authorization, least-privilege evidence, and the secret-safe boundary.

## Agent instructions

1. Read the Sprint 28 HUMAN-GATE and gate plan, the current repository commands, and the task contracts before authoring the runbook.
2. Write only the runbook, its read-only contract test, and scoped run evidence. Do not execute D08-05 or mutate cloud/provider state.
3. Keep G0 through G6 visibly ordered. Make D08-03 eligibility a prerequisite and D08-05 a separate human hold, not a conditional script branch.
4. Use exact existing commands and paths. Never invent a provider deletion command or put secret values in the runbook, logs, or evidence.
5. Make every failed, missing, stale, contradictory, empty, or secret-bearing observation abort and escalate. Document Postgres/blob recovery and the absence of Convex rollback after deletion.

## Orchestrator verification protocol

The orchestrator validates the runbook contract before handing it to D08-05. Each AC command is read-only and must exit successfully; any failure blocks the next task.

AC-1:

    test -s .spec/prds/mk6-migration/runbooks/convex-decommission.md && rg -n 'G0|G1|G2|G3|G4|G5|G6|D08-03|D08-05|ABORT|ESCALAT|secret' .spec/prds/mk6-migration/runbooks/convex-decommission.md && git diff --check -- .spec/prds/mk6-migration/runbooks/convex-decommission.md

AC-2:

    set -euo pipefail; ART=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03/deletion-gate.json; test -s "$ART"; jq -e '.status == "pass" and .deletion_eligible == true and .convex_deletion_performed == false and ([.checks[]|.status]|all(. == "pass"))' "$ART"; rg -n 'human hold|D08-05|deletion_eligible|convex_deletion_performed' .spec/prds/mk6-migration/runbooks/convex-decommission.md

AC-3:

    test -s .spec/prds/mk6-migration/runbooks/convex-decommission.md && rg -n 'operator-authorized|production|manual|irreversible|redacted receipt|do not automate' .spec/prds/mk6-migration/runbooks/convex-decommission.md

AC-4:

    rg -n 'abort|Postgres|blob|escalat|secret|no rollback' .spec/prds/mk6-migration/runbooks/convex-decommission.md

## Coding standards and source paths

Follow /Users/inference1/Projects/brain/docs/kanban/TASK-TEMPLATE.md, REQUIREMENT-CONTRACT-V1.md, SCENARIO-CONTRACT-V1.md, REQUIREMENT-TRACKING.md, CAPABILITY-CHAIN-PLANNING.md, TESTING-HIERARCHY.md, and RED-FIRST-TEST-GATE.md. Follow AGENTS.md secret-index rules. Keep the runbook and contract test aligned with .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md, Sprint 28 HUMAN-GATE.md, gate-plan.json, and the existing scripts and CLI commands named in the task.

## Review criteria

The reviewer must confirm exact fixed metadata, four GWT ACs and one-to-one TCs, valid visible/holdout tiers and integration/e2e services, resolvable fixtures, concrete must-observe and must-not-observe values, ordered G0-G6 gates, hard D08-03 eligibility, separate D08-05 human hold, exact commands, abort/rollback/escalation semantics, and zero secret-bearing evidence. Review must reject deletion execution, implicit approval, invalid artifact types, holdout unit/holdout services, invented commands, and any claim of Convex rollback.

## Dependencies, out of scope, and notes

Dependencies: D08-01 and D08-02 readiness, D08-03 deletion-gate artifact, Sprint 28 restore evidence, Sprint 31 MCP readiness, and the provider's own documented operator control surface. Out of scope: any provider mutation, Convex deletion, D08-03 evidence edits, application/package changes, secret rotation, or automatic D08-05 invocation. This runbook is the handoff contract; it does not authorize or perform the irreversible action.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version":"1",
  "task_id":"D08-04",
  "proposed_by":"devops-engineer",
  "tdd_mode":"skipped",
  "verification_policy":{"requires_tests":false,"requires_red_evidence":false,"requires_seeded_evidence":true},
  "fixtures":{
    "repo":{"description":"Sprint 32 repository and runbook target.","seed_method":"recorded_external","records":["SPRINT sequence","D08-03 artifact path","D08-05 operator-only boundary","existing CLI commands"]},
    "gate":{"description":"All-pass D08-03 eligibility artifact.","seed_method":"recorded_external","records":["schema holo.decommission.deletion-gate.v1","deletion_eligible=true","convex_deletion_performed=false","SHA-256 manifest"]},
    "hold":{"description":"Explicit runbook hold before D08-05.","seed_method":"recorded_external","records":["operator authorization","production target","manual provider action","redacted receipt"]},
    "failure":{"description":"Runbook failure branch.","seed_method":"recorded_external","records":["abort exit","Postgres/blob recovery","escalation","secret scan"]}
  },
  "requirements":[
    {"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"Runbook contains ordered G0-G6 gates and exact commands.","verify":"test -s .spec/prds/mk6-migration/runbooks/convex-decommission.md && rg -n 'G0|G1|G2|G3|G4|G5|G6|D08-03|D08-05|ABORT|ESCALAT|secret' .spec/prds/mk6-migration/runbooks/convex-decommission.md && git diff --check -- .spec/prds/mk6-migration/runbooks/convex-decommission.md","maps_to_ac":null,"scenario":{"id":"AC-1","tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"filesystem+repository-command-contract","flow_ref":"T-SYNC-018","start_ref":"repo","action":{"actor":"operator","steps":["read runbook","validate G0-G6 and exact commands","run git diff --check"]},"evidence":{"artifact_type":"file_artifact","required_capture":true,"paths":["evidence/AC-1.json"]},"negative_control":{"would_fail_if":["runbook is missing","ordering is omitted","gates are conflated","static prose replaces executable checks"]},"cases":[{"start_ref":"repo","action":{"actor":"operator","steps":["read runbook","validate G0-G6 and exact commands","run git diff --check"]},"end_state":{"must_observe":["ordered_gate_count>=7","D08-03_precedes_D08-05='true'","exact_command_count>=3","runbook_bytes>=1000"],"must_not_observe":["ordered_gate_count=0","missing D08-03","missing D08-05","invented command"]}}]}},
    {"id":"AC-2","type":"acceptance_criterion","primary":false,"description":"D08-03 eligibility is a hard precondition separate from D08-05 deletion.","verify":"set -euo pipefail; ART='.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03/deletion-gate.json'; test -s \"$ART\"; jq -e '.status == \"pass\" and .deletion_eligible == true and .convex_deletion_performed == false and ([.checks[]|.status]|all(. == \"pass\"))' \"$ART\"; rg -n 'human hold|D08-05|deletion_eligible|convex_deletion_performed' .spec/prds/mk6-migration/runbooks/convex-decommission.md","maps_to_ac":null,"scenario":{"id":"AC-2","tier":"visible","test_tier":"e2e","topology":"single-node","verification_service":"jq+deletion-gate-consumer","flow_ref":"T-SYNC-018","start_ref":"gate","action":{"actor":"operator","steps":["validate gate JSON","verify human hold","check no deletion before D08-05"]},"evidence":{"artifact_type":"file_artifact","required_capture":true,"paths":["evidence/AC-2.json"]},"negative_control":{"would_fail_if":["missing artifact is accepted","failed check is waived","eligibility is treated as deletion","hold is skipped","empty artifact passes"]},"cases":[{"start_ref":"gate","action":{"actor":"operator","steps":["validate gate JSON","verify human hold","check no deletion before D08-05"]},"end_state":{"must_observe":["status='pass'","deletion_eligible='true'","convex_deletion_performed='false'","checks_pass_count>=8","human_hold_required='true'"],"must_not_observe":["status='fail'","deletion_eligible='false'","convex_deletion_performed='true'","empty checks","checks_pass_count=0"]}}]}},
    {"id":"AC-3","type":"acceptance_criterion","primary":false,"description":"D08-05 is an explicit manual operator hold with redacted receipt handling.","verify":"test -s .spec/prds/mk6-migration/runbooks/convex-decommission.md && rg -n 'operator-authorized|production|manual|irreversible|redacted receipt|do not automate' .spec/prds/mk6-migration/runbooks/convex-decommission.md","maps_to_ac":null,"scenario":{"id":"AC-3","tier":"holdout","test_tier":"e2e","topology":"multi-node","verification_service":"human-approval+provider-handoff","flow_ref":"T-SYNC-018","start_ref":"hold","action":{"actor":"operator","steps":["confirm exact provider target","record authorization","use manual provider surface","capture redacted receipt"]},"evidence":{"artifact_type":"api_response","required_capture":true,"paths":["evidence/AC-3.json"]},"negative_control":{"would_fail_if":["wrong target is selected","approval is implicit","deletion is automated","raw receipt or mock provider is used"]},"cases":[{"start_ref":"hold","action":{"actor":"operator","steps":["confirm exact provider target","record authorization","use manual provider surface","capture redacted receipt"]},"end_state":{"must_observe":["operator_authorized='true'","target_environment='production'","provider_action_manual='true'","receipt_secret_scan_hits=0"],"must_not_observe":["operator_authorized='false'","target_environment='staging'","provider_action_automatic='true'","empty approval","receipt_secret_scan_hits>=1"]}}]}},
    {"id":"AC-4","type":"acceptance_criterion","primary":false,"description":"Abort, Postgres/blob recovery, escalation, and secret-safe evidence are documented.","verify":"rg -n 'abort|Postgres|blob|escalat|secret|no rollback' .spec/prds/mk6-migration/runbooks/convex-decommission.md","maps_to_ac":null,"scenario":{"id":"AC-4","tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"filesystem+incident-evidence","flow_ref":"T-SYNC-018","start_ref":"failure","action":{"actor":"operator","steps":["read abort branch","read Postgres/blob recovery","read escalation and secret rules"]},"evidence":{"artifact_type":"event_log","required_capture":true,"paths":["evidence/AC-4.json"]},"negative_control":{"would_fail_if":["failure is silently complete","Convex rollback is promised","raw credentials are retained","escalation is omitted","static failure branch passes"]},"cases":[{"start_ref":"failure","action":{"actor":"operator","steps":["read abort branch","read Postgres/blob recovery","read escalation and secret rules"]},"end_state":{"must_observe":["abort_exit_code=2","escalation_event_count>=1","recovery_path='postgres+blob'","secret_scan_hits=0"],"must_not_observe":["abort_exit_code=0","escalation_event_count=0","recovery_path='convex'","empty failure branch","secret_scan_hits>=1"]}}]}},
    {"id":"TC-1","type":"test_criterion","description":"Ordered runbook and exact command contract pass.","verify":"test -s .spec/prds/mk6-migration/runbooks/convex-decommission.md && rg -n 'G0|G1|G2|G3|G4|G5|G6|D08-03|D08-05|ABORT|ESCALAT' .spec/prds/mk6-migration/runbooks/convex-decommission.md && git diff --check -- .spec/prds/mk6-migration/runbooks/convex-decommission.md","maps_to_ac":"AC-1"},
    {"id":"TC-2","type":"test_criterion","description":"D08-03 eligibility is separate from D08-05 deletion.","verify":"set -euo pipefail; ART='.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03/deletion-gate.json'; test -s \"$ART\"; jq -e '.status == \"pass\" and .deletion_eligible == true and .convex_deletion_performed == false and ([.checks[]|.status]|all(. == \"pass\"))' \"$ART\"; rg -n 'human hold|D08-05' .spec/prds/mk6-migration/runbooks/convex-decommission.md","maps_to_ac":"AC-2"},
    {"id":"TC-3","type":"test_criterion","description":"Human approval and manual provider handoff are explicit and secret-safe.","verify":"test -s .spec/prds/mk6-migration/runbooks/convex-decommission.md && rg -n 'operator-authorized|production|manual|irreversible|redacted receipt|do not automate' .spec/prds/mk6-migration/runbooks/convex-decommission.md","maps_to_ac":"AC-3"},
    {"id":"TC-4","type":"test_criterion","description":"Abort, recovery, escalation, and secret-safe evidence are documented.","verify":"rg -n 'abort|Postgres|blob|escalat|secret|no rollback' .spec/prds/mk6-migration/runbooks/convex-decommission.md","maps_to_ac":"AC-4"}
  ]
}
-->
</details>
