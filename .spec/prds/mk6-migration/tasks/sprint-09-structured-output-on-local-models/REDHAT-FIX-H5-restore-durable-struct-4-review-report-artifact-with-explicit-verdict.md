# REDHAT-FIX-H5 — Restore durable struct-4 review report artifact with explicit verdict

## What this does

Durable review report artifact at .spec/reviews/struct-4-extraction-safety-review.md exists with NEEDS_FIXES verdict, a complete disposition table for all 4 struct-4 ACs cross-referencing the red-hat H1-H7/G-* findings with file:line evidence, and reconstitution instructions for flipping to APPROVED after remediation. sprint-goal-state.json red_hat block updated to reflect actual state.

Provides: Read authoritative red-hat review → Extract all H and G finding IDs with file:line evidence → Build AC disposition table mapping each struct-4 AC to red-hat-verified state → Set NEEDS_FIXES verdict with cross-reference rationale → Write reconstitution instructions → Write report file → Update sprint-goal-state.json metadata.

## Why

- MUST Write .spec/reviews/struct-4-extraction-safety-review.md (NEW) — the missing durable artifact that struct-4 SCOPE promised
- MUST Set verdict NEEDS_FIXES — the self-review APPROVED was premature; the authoritative red-hat review found 7 HIGH findings (H1-H7) and 3 gate findings (G-ORACLE, G-DEFERRED, G-CLI) that must be resolved before APPROVED is valid
- MUST Cross-reference the authoritative red-hat review at .spec/reviews/red-hat-2026-07-17T04-30-00Z.md — cite each H/G finding by ID with file:line evidence
- MUST Provide a disposition table for every struct-4 AC (AC-1 through AC-4) showing the actual red-hat-verified state, not the original self-review claim
- MUST Include reconstitution instructions — after REDHAT-FIX-H1 through REDHAT-FIX-H7 and G-* remediations land, re-run `rg` verification checks and flip verdict to APPROVED on re-review
- MUST Correct sprint-goal-state.json line 72 — replace the `"report"` field with the actual path, set `"verdict"` to `"NEEDS_FIXES"`, and update `red_hat.critical`/`red_hat.high` counts to reflect the 7 HIGH findings
- NEVER Mark the report APPROVED while any H1-H7 or G-* red-hat finding remains unresolved — NEEDS_FIXES is the only honest verdict
- NEVER Modify any implementation source file — this is a REVIEW task, not an implementation task. The report documents findings; it does not fix them
- STRICTLY Every AC disposition must cite a specific red-hat finding ID (e.g., H1, G-ORACLE), a file:line reference, and a MUST_OBSERVE/MUST_NOT_OBSERVE from the original struct-4 scenario
- STRICTLY The report file must pass: `test -f .spec/reviews/struct-4-extraction-safety-review.md` AND `rg -c 'NEEDS_FIXES' .spec/reviews/struct-4-extraction-safety-review.md` AND `rg -c 'red-hat-2026-07-17T04-30-00Z' .spec/reviews/struct-4-extraction-safety-review.md`
- Grounded in: UC-INFER-03, T-INFER-010, CAP-INF-01

## How to verify

- Report file exists: `test -f .spec/reviews/struct-4-extraction-safety-review.md` → Exit 0
- Report has substance: `test $(wc -l < .spec/reviews/struct-4-extraction-safety-review.md) -ge 50` → Exit 0
- Verdict is NEEDS_FIXES: `rg -c 'NEEDS_FIXES' .spec/reviews/struct-4-extraction-safety-review.md` → ≥1
- Red-hat cross-reference present: `rg -c 'red-hat-2026-07-17T04-30-00Z' .spec/reviews/struct-4-extraction-safety-review.md` → ≥10
- All H findings cited: loop `rg -q 'H1'`, `rg -q 'H2'`, ..., `rg -q 'H7'` against report → all exit 0
- All G findings cited: loop `rg -q 'G-ORACLE'`, `rg -q 'G-DEFERRED'`, `rg -q 'G-CLI'` → all exit 0
- All struct-4 ACs in disposition: `rg -q 'AC-1'`, `rg -q 'AC-2'`, `rg -q 'AC-3'`, `rg -q 'AC-4'` → all exit 0
- sprint-goal-state.json has NEEDS_FIXES: `python3 -c "import json; d=json.load(open('sprint-goal-state.json')); assert d['red_hat']['verdict']=='NEEDS_FIXES'"` → Exit 0
- sprint-goal-state.json counts updated: `python3 -c "import json; d=json.load(open('sprint-goal-state.json')); assert d['red_hat']['critical']>=1; assert d['red_hat']['high']>=6"` → Exit 0
- No implementation modified: `git diff --name-only -- services/platform/src/ | wc -l | grep -q '^0$'` → Exit 0

## Scope

Writes: .spec/reviews/struct-4-extraction-safety-review.md (NEW — the missing durable review report artifact) · .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/sprint-goal-state.json (MODIFY — update red_hat block: verdict, counts, report paths to reflect actual state)

Prohibited: services/platform/src/inference/extract-structured.ts — REVIEW ONLY, do not modify (implementation fixes belong to REDHAT-FIX-H1) · services/platform/src/inference/probe-capability.ts — REVIEW ONLY, do not modify (implementation fixes belong to REDHAT-FIX-H1, REDHAT-FIX-H2, REDHAT-FIX-H3) · services/platform/src/cli/holo.ts — REVIEW ONLY, do not modify (implementation fixes belong to REDHAT-FIX-H4) · services/platform/src/fleet/manifest.ts — REVIEW ONLY, do not modify · services/platform/src/inference/resolve-model.ts — REVIEW ONLY, do not modify · services/platform/src/mastra.ts — REVIEW ONLY, do not modify (guardrail fixes belong to REDHAT-FIX-H3) · tests/integration/service/struct-*.test.ts — REVIEW ONLY, do not modify (test fixes belong to REDHAT-FIX-H6) · Any implementation code — REVIEW task must not write or modify implementation

<details>
<summary>▾ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-H5 — Restore durable struct-4 review report artifact with explicit verdict
================================================================================

TASK_TYPE:  REVIEW
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (45 min)
AGENT:      implementer=mastra-reviewer | reviewer=lead-reviewer
PROPOSED-BY: mastra-reviewer
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: true)
CAPABILITY: CAP-INF-01
SPRINT:     [Sprint 9 — Structured Output on Local Models](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Durable review report artifact at .spec/reviews/struct-4-extraction-safety-review.md exists with NEEDS_FIXES verdict, a complete disposition table for all 4 struct-4 ACs cross-referencing the red-hat H1-H7/G-* findings with file:line evidence, and reconstitution instructions for flipping to APPROVED after remediation. sprint-goal-state.json red_hat block updated to reflect actual state.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Write .spec/reviews/struct-4-extraction-safety-review.md (NEW) — the missing durable artifact that struct-4 SCOPE promised
- MUST Set verdict NEEDS_FIXES — the self-review APPROVED was premature; the authoritative red-hat review found 7 HIGH findings (H1-H7) and 3 gate findings (G-ORACLE, G-DEFERRED, G-CLI) that must be resolved before APPROVED is valid
- MUST Cross-reference the authoritative red-hat review at .spec/reviews/red-hat-2026-07-17T04-30-00Z.md — cite each H/G finding by ID with file:line evidence
- MUST Provide a disposition table for every struct-4 AC (AC-1 through AC-4) showing the actual red-hat-verified state, not the original self-review claim
- MUST Include reconstitution instructions — after REDHAT-FIX-H1 through REDHAT-FIX-H7 and G-* remediations land, re-run `rg` verification checks and flip verdict to APPROVED on re-review
- MUST Correct sprint-goal-state.json line 72 — replace the `"report"` field with the actual path, set `"verdict"` to `"NEEDS_FIXES"`, and update `red_hat.critical`/`red_hat.high` counts to reflect the 7 HIGH findings
- NEVER Mark the report APPROVED while any H1-H7 or G-* red-hat finding remains unresolved — NEEDS_FIXES is the only honest verdict
- NEVER Modify any implementation source file — this is a REVIEW task, not an implementation task. The report documents findings; it does not fix them
- STRICTLY Every AC disposition must cite a specific red-hat finding ID (e.g., H1, G-ORACLE), a file:line reference, and a MUST_OBSERVE/MUST_NOT_OBSERVE from the original struct-4 scenario
- STRICTLY The report file must pass: `test -f .spec/reviews/struct-4-extraction-safety-review.md` AND `rg -c 'NEEDS_FIXES' .spec/reviews/struct-4-extraction-safety-review.md` AND `rg -c 'red-hat-2026-07-17T04-30-00Z' .spec/reviews/struct-4-extraction-safety-review.md`
- Grounded in: UC-INFER-03, T-INFER-010, CAP-INF-01

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: .spec/reviews/struct-4-extraction-safety-review.md exists on disk with >= 50 lines of structured review content
- [ ] AC-2: Report cross-references every HIGH red-hat finding (H1, H2, H3, H4, H5, H6, H7) and gate findings (G-ORACLE, G-DEFERRED, G-CLI) with file:line evidence from red-hat-2026-07-17T04-30-00Z.md
- [ ] AC-3: Verdict is NEEDS_FIXES; disposition table maps every struct-4 AC to its actual red-hat-verified state; reconstitution instructions document the path to APPROVED
- [ ] AC-4: sprint-goal-state.json red_hat block updated — report path corrected, verdict changed to NEEDS_FIXES, H/M/L counts reflect actual findings
- [ ] AC-5: Zero implementation files modified — `git diff --name-only -- services/platform/src/` returns empty

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 GIVEN missing struct-4 review report WHEN remediation task executes THEN .spec/reviews/struct-4-extraction-safety-review.md exists on disk with >= 50 lines of structured review content — verdict section, disposition table, and cross-reference to authoritative red-hat review (PRIMARY) (flow_ref T-INFER-010)
  GIVEN: struct-4 task claimed SCOPE: 'Writes: .spec/reviews/struct-4-extraction-safety-review.md (NEW) — APPROVED/NEEDS_FIXES report' but the file does not exist on disk (glob `rg -rn 'struct-4' .spec/reviews/` returns nothing)
  WHEN:  mastra-reviewer executes REDHAT-FIX-H5: writes the review report to the expected path
  THEN:  the file exists, passes `test -f .spec/reviews/struct-4-extraction-safety-review.md`, contains >= 50 lines, contains a `## Verdict` section with `NEEDS_FIXES`, contains a `## Disposition Table` mapping every struct-4 AC, and cross-references `.spec/reviews/red-hat-2026-07-17T04-30-00Z.md`
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: n/a
  SCENARIO — start_ref: missing-artifact · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if report file written to wrong path (not .spec/reviews/), report file is empty or < 50 lines, report file has APPROVED verdict despite unresolved H1-H7 findings, report file does not cross-reference the red-hat review at red-hat-2026-07-17T04-30-00Z.md, report file is a stub with placeholder text (e.g., 'TODO: write review'), report file is a copy of the struct-4 task markdown without actual review content
    CASE start_ref=missing-artifact · actor=reviewer
      ACTION: Write .spec/reviews/struct-4-extraction-safety-review.md with structured sections: header + date/target, Verdict, AC Disposition Table, Cross-Reference to red-hat findings, Reconstitution Instructions
      ACTION: Set verdict NEEDS_FIXES — cite red-hat review finding IDs
      ACTION: Provide file:line evidence for each AC disposition from both the original implementation and the red-hat review
      ACTION: Include reconstitution instructions documenting the path to APPROVED after H1-H7/G-* remediation
      MUST_OBSERVE: test -f .spec/reviews/struct-4-extraction-safety-review.md exits 0 | file line count >= 50 | file contains '## Verdict' and 'NEEDS_FIXES' | file contains '## AC Disposition Table' with rows for AC-1, AC-2, AC-3, AC-4 | file cross-references 'red-hat-2026-07-17T04-30-00Z.md' at least 10 times | file cites finding IDs H1, H2, H3, H4, H5, H6, H7 | file cites gate findings G-ORACLE, G-DEFERRED, G-CLI
      MUST_NOT_OBSERVE: file does not exist at expected path | file contains 'APPROVED' as final verdict | file contains 'TODO' or 'placeholder' or 'FIXME' | file has < 50 lines (stub detection) | file is byte-for-byte identical to the struct-4 task markdown | file contains zero references to red-hat findings

AC-2 GIVEN the authoritative red-hat review report at .spec/reviews/red-hat-2026-07-17T04-30-00Z.md WHEN writing the struct-4 review report THEN every HIGH finding (H1-H7) and gate finding (G-ORACLE, G-DEFERRED, G-CLI) is cross-referenced with file:line evidence from the red-hat report (flow_ref T-INFER-010)
  GIVEN: red-hat-2026-07-17T04-30-00Z.md exists with 7 HIGH findings (H1-H7) and 3 gate findings (G-ORACLE, G-DEFERRED, G-CLI) documented with file:line evidence
  WHEN:  mastra-reviewer writes the struct-4 review report cross-reference section
  THEN:  every H and G finding ID appears in the report with: red-hat report line number, affected source file:line, evidence summary, and impact on the corresponding struct-4 AC
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: n/a
  SCENARIO — start_ref: red-hat-report · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if finding IDs are mentioned without file:line references, fewer than 7 HIGH findings are cross-referenced, gate findings G-ORACLE/G-DEFERRED/G-CLI are omitted, cross-references point to non-existent line numbers, cross-references are vague ('somewhere in extract-structured.ts') without line numbers
    CASE start_ref=red-hat-report · actor=reviewer
      ACTION: Read red-hat-2026-07-17T04-30-00Z.md to extract all H and G finding IDs, locations, and evidence
      ACTION: For each finding, record in the struct-4 report: finding ID, red-hat report line, affected source file:line, evidence summary, impact on struct-4 ACs
      ACTION: Verify each cross-reference with rg to confirm the cited file:line exists in the actual codebase
      MUST_OBSERVE: report contains 'H1' with reference to extract-structured.ts:134-148 and probe-capability.ts:80-98 | report contains 'H2' with reference to extract-structured.ts and probe-capability.ts (zero structuredOutput references) | report contains 'H3' with reference to extract-structured.ts:95-118 | report contains 'H4' with reference to holo.ts:1831-1858 | report contains 'H5' with reference to .spec/reviews/struct-4-extraction-safety-review.md (missing) | report contains 'H6' with reference to struct-explicit-fail.test.ts:148-158,200-221 and struct-tripwire-blocked.test.ts:177-198 | report contains 'H7' with reference to probe-capability.ts path discrepancy | report contains 'G-ORACLE' with reference to oracle divergence evidence | report contains 'G-DEFERRED' with reference to deferred gate step 5 | report contains 'G-CLI' with reference to missing --fixture flag
      MUST_NOT_OBSERVE: any H-finding ID (H1-H7) missing from cross-reference | any G-finding ID (G-ORACLE, G-DEFERRED, G-CLI) missing from cross-reference | cross-reference uses non-existent line numbers | cross-reference is a copy-paste of the red-hat report without struct-4 AC impact mapping

AC-3 GIVEN the self-review APPROVED was premature and the red-hat review found 7 HIGH findings WHEN writing the struct-4 review report THEN verdict is NEEDS_FIXES with: (a) explicit disposition for every struct-4 AC citing red-hat evidence, (b) reconstitution instructions documenting the exact remediation tasks and re-verification steps to reach APPROVED (flow_ref T-INFER-010)
  GIVEN: struct-4 task claims 'Reviewer: mastra-reviewer (self-review APPROVED)' but red-hat review found blocking HIGH findings; sprint-goal-state.json line 72 claims verdict APPROVED with 0 critical, 0 high
  WHEN:  mastra-reviewer writes the verdict section and reconstitution instructions
  THEN:  verdict is NEEDS_FIXES; each struct-4 AC has a disposition (PASS/PARTIAL/FAIL) with red-hat finding ID justification; reconstitution instructions list REDHAT-FIX-H1 through REDHAT-FIX-H7 and G-* as blockers, with re-verification grep commands for each
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: n/a
  SCENARIO — start_ref: red-hat-report · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if verdict is APPROVED (ignoring red-hat findings), disposition table claims all PASS (contradicting red-hat evidence), reconstitution instructions are missing, reconstitution instructions are vague ('fix everything then re-review') without per-finding verification steps, AC-4 (probe uses real generateObject) disposition does not cite H1 file:line evidence (generateText used, not generateObject)
    CASE start_ref=red-hat-report · actor=reviewer
      ACTION: Set report verdict to NEEDS_FIXES with rationale citing the 7 HIGH + 3 gate findings from red-hat-2026-07-17T04-30-00Z.md
      ACTION: Build disposition table: AC-1 (PASS — zero z.any(), MAX_REPAIR_ATTEMPTS 5x), AC-2 (PARTIAL — typed errors exist but H4 extract:status NOT_IMPLEMENTED, H6 no DB query), AC-3 (PARTIAL — RED evidence exists but H5 report file missing), AC-4 (FAIL — H1 probe uses generateText not generateObject, H7 path mismatch)
      ACTION: Write reconstitution instructions: list each REDHAT-FIX task as a blocker, provide rg verification commands per AC, document re-review trigger: 'after H1-H7 + G-* land, re-run struct-4 verification greps; if all PASS, flip verdict to APPROVED'
      MUST_OBSERVE: rg -c 'NEEDS_FIXES' .spec/reviews/struct-4-extraction-safety-review.md >= 1 | disposition table has rows for AC-1 (PASS), AC-2 (PARTIAL), AC-3 (PARTIAL), AC-4 (FAIL) | AC-2 disposition cites H4 and H6 with red-hat line numbers | AC-3 disposition cites H5 with red-hat line numbers | AC-4 disposition cites H1 and H7 with red-hat line numbers | reconstitution instructions list REDHAT-FIX-H1 through REDHAT-FIX-H7 | reconstitution instructions list G-ORACLE, G-DEFERRED, G-CLI remediations | reconstitution instructions include per-AC rg verification commands
      MUST_NOT_OBSERVE: verdict section contains 'APPROVED' | AC-4 disposition is PASS (contradicts H1 evidence) | disposition table missing any AC (AC-1 through AC-4) | reconstitution instructions absent | reconstitution instructions say 're-run self-review' without referencing red-hat findings

AC-4 GIVEN sprint-goal-state.json line 72 claims 'report: .spec/reviews/struct-4-extraction-safety-review.md' with 'verdict: APPROVED', 'critical: 0', 'high: 0' WHEN the report artifact is restored THEN sprint-goal-state.json red_hat block is corrected: report path verified, verdict changed to NEEDS_FIXES, critical/high counts reflect actual red-hat findings (flow_ref T-INFER-010)
  GIVEN: sprint-goal-state.json red_hat block (lines 70-82) is stale: claims APPROVED verdict with 0 critical/0 high findings, references a non-existent report file
  WHEN:  mastra-reviewer updates sprint-goal-state.json to reflect actual state after red-hat review
  THEN:  red_hat.report points to both files (struct-4 report AND red-hat report), red_hat.verdict is NEEDS_FIXES, red_hat.critical is 1 (H1), red_hat.high is >= 6 (H2-H7), red_hat.medium/low counts reflect actual findings
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: n/a
  SCENARIO — start_ref: stale-goal-state · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if sprint-goal-state.json is not updated (still claims APPROVED, 0 high), sprint-goal-state.json is updated with wrong report path, sprint-goal-state.json verdict changed but counts still show 0, sprint-goal-state.json is corrupted (invalid JSON after edit), sprint-goal-state.json is rewritten entirely losing task/gate/e2e data
    CASE start_ref=stale-goal-state · actor=reviewer
      ACTION: Read sprint-goal-state.json to confirm current stale state
      ACTION: Update red_hat.verdict from 'APPROVED' to 'NEEDS_FIXES'
      ACTION: Update red_hat.critical from 0 to 1 (H1 is CRITICAL severity)
      ACTION: Update red_hat.high from 0 to 6 (H2, H3, H4, H5, H6, H7 are HIGH)
      ACTION: Update red_hat.medium and red_hat.low to match actual red-hat counts
      ACTION: Add red_hat.red_hat_report referencing .spec/reviews/red-hat-2026-07-17T04-30-00Z.md
      ACTION: Update red_hat.report to reference .spec/reviews/struct-4-extraction-safety-review.md
      ACTION: Replace red_hat.medium_note and red_hat.low_notes with actual red-hat M/L findings
      ACTION: Validate JSON with python3 -m json.tool sprint-goal-state.json
      MUST_OBSERVE: sprint-goal-state.json is valid JSON (python3 -m json.tool exits 0) | red_hat.verdict = 'NEEDS_FIXES' | red_hat.critical = 1 | red_hat.high >= 6 | red_hat.report includes 'struct-4-extraction-safety-review.md' | red_hat has new field 'red_hat_report' pointing to 'red-hat-2026-07-17T04-30-00Z.md' | red_hat.medium_note and low_notes reflect actual red-hat findings | tasks.completed still 4, tasks.details intact | gate, e2e, build, human_test blocks unchanged
      MUST_NOT_OBSERVE: red_hat.verdict = 'APPROVED' | red_hat.high = 0 | sprint-goal-state.json is invalid JSON | task details, gate, e2e, build, or human_test data lost | report path still pointing to non-existent file without correction

AC-5 GIVEN this is a REVIEW task (task_type: REVIEW) WHEN executing REDHAT-FIX-H5 THEN zero implementation source files under services/platform/src/ are modified — the report documents findings but does not fix them (flow_ref T-INFER-010)
  GIVEN: REDHAT-FIX-H5 is a REVIEW task that restores a missing review report artifact; it is NOT an implementation task
  WHEN:  mastra-reviewer executes the task
  THEN:  git diff --name-only shows only files under .spec/reviews/ and possibly sprint-goal-state.json; zero files under services/platform/src/ are modified
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: n/a
  SCENARIO — start_ref: pre-execution-head · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if extract-structured.ts is modified (review task must not implement fixes), probe-capability.ts is modified, holo.ts is modified, any test file under tests/ is modified, git diff shows changes to services/platform/src/ (implementation code leaked into review task)
    CASE start_ref=pre-execution-head · actor=reviewer
      ACTION: Capture pre-execution HEAD SHA
      ACTION: Execute task: write review report, update sprint-goal-state.json
      ACTION: Run git diff --name-only HEAD
      ACTION: Verify diff contains only .spec/reviews/struct-4-extraction-safety-review.md and .spec/prds/.../sprint-goal-state.json
      MUST_OBSERVE: git diff --name-only includes .spec/reviews/struct-4-extraction-safety-review.md | sprint-goal-state.json may be in diff (metadata update only)
      MUST_NOT_OBSERVE: git diff --name-only includes services/platform/src/inference/extract-structured.ts | git diff --name-only includes services/platform/src/inference/probe-capability.ts | git diff --name-only includes services/platform/src/cli/holo.ts | git diff --name-only includes tests/integration/service/struct-*.test.ts | git diff --name-only includes any file under services/platform/src/

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------
- TC-1 [Review report file exists at expected path with >= 50 lines] (maps_to_ac AC-1)
- TC-2 [Review report contains NEEDS_FIXES verdict] (maps_to_ac AC-1)
- TC-3 [Review report cross-references red-hat review at least 10 times] (maps_to_ac AC-1)
- TC-4 [Review report cites all HIGH red-hat findings (H1-H7)] (maps_to_ac AC-2)
- TC-5 [Review report cites all gate findings (G-ORACLE, G-DEFERRED, G-CLI)] (maps_to_ac AC-2)
- TC-6 [Disposition table covers all 4 struct-4 ACs] (maps_to_ac AC-3)
- TC-7 [Reconstitution instructions reference all REDHAT-FIX tasks] (maps_to_ac AC-3)
- TC-8 [sprint-goal-state.json updated with NEEDS_FIXES verdict and correct counts] (maps_to_ac AC-4)
- TC-9 [No implementation files modified] (maps_to_ac AC-5)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/reviews/struct-4-extraction-safety-review.md (NEW — the missing durable review report artifact)
- .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/sprint-goal-state.json (MODIFY — update red_hat block: verdict, counts, report paths to reflect actual state)
writeProhibited: services/platform/src/inference/extract-structured.ts — REVIEW ONLY, do not modify (implementation fixes belong to REDHAT-FIX-H1) · services/platform/src/inference/probe-capability.ts — REVIEW ONLY, do not modify (implementation fixes belong to REDHAT-FIX-H1, REDHAT-FIX-H2, REDHAT-FIX-H3) · services/platform/src/cli/holo.ts — REVIEW ONLY, do not modify (implementation fixes belong to REDHAT-FIX-H4) · services/platform/src/fleet/manifest.ts — REVIEW ONLY, do not modify · services/platform/src/inference/resolve-model.ts — REVIEW ONLY, do not modify · services/platform/src/mastra.ts — REVIEW ONLY, do not modify (guardrail fixes belong to REDHAT-FIX-H3) · tests/integration/service/struct-*.test.ts — REVIEW ONLY, do not modify (test fixes belong to REDHAT-FIX-H6) · Any implementation code — REVIEW task must not write or modify implementation

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-2026-07-17T04-30-00Z.md 1-278 (full report)
   - focus: Authoritative red-hat review — all H1-H7 and G-* finding IDs, locations, evidence, and expected fixes. The struct-4 report must cross-reference every finding from this document.
2. .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/struct-4-review-extraction-safety.md 1-515 (full task definition)
   - focus: Original struct-4 task specification — AC-1 through AC-4 definitions, scenarios, MUST_OBSERVE/MUST_NOT_OBSERVE contracts, SCOPE, and REQUIREMENT-CONTRACT v1. The disposition table must map each AC to its red-hat-verified state.
3. .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/sprint-goal-state.json 1-97 (full file)
   - focus: Current (stale) sprint goal state — red_hat block at lines 70-82 claims APPROVED with 0 critical/0 high findings. Must be updated to reflect actual NEEDS_FIXES state.
4. services/platform/src/inference/extract-structured.ts 1-250
   - focus: Verify that file:line references in the review report correspond to actual code — the report cites this file but must not modify it.
5. services/platform/src/inference/probe-capability.ts 1-210
   - focus: Verify that H1 and H7 file:line references are accurate — probe uses generateText at line ~81, path is under inference/ not fleet/.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Report file exists: `test -f .spec/reviews/struct-4-extraction-safety-review.md` → Exit 0
- Report has substance: `test $(wc -l < .spec/reviews/struct-4-extraction-safety-review.md) -ge 50` → Exit 0
- Verdict is NEEDS_FIXES: `rg -c 'NEEDS_FIXES' .spec/reviews/struct-4-extraction-safety-review.md` → ≥1
- Red-hat cross-reference present: `rg -c 'red-hat-2026-07-17T04-30-00Z' .spec/reviews/struct-4-extraction-safety-review.md` → ≥10
- All H findings cited: loop `rg -q 'H1'`, `rg -q 'H2'`, ..., `rg -q 'H7'` against report → all exit 0
- All G findings cited: loop `rg -q 'G-ORACLE'`, `rg -q 'G-DEFERRED'`, `rg -q 'G-CLI'` → all exit 0
- All struct-4 ACs in disposition: `rg -q 'AC-1'`, `rg -q 'AC-2'`, `rg -q 'AC-3'`, `rg -q 'AC-4'` → all exit 0
- sprint-goal-state.json has NEEDS_FIXES: `python3 -c "import json; d=json.load(open('sprint-goal-state.json')); assert d['red_hat']['verdict']=='NEEDS_FIXES'"` → Exit 0
- sprint-goal-state.json counts updated: `python3 -c "import json; d=json.load(open('sprint-goal-state.json')); assert d['red_hat']['critical']>=1; assert d['red_hat']['high']>=6"` → Exit 0
- No implementation modified: `git diff --name-only -- services/platform/src/ | wc -l | grep -q '^0$'` → Exit 0

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- pattern: Read authoritative red-hat review → Extract all H and G finding IDs with file:line evidence → Build AC disposition table mapping each struct-4 AC to red-hat-verified state → Set NEEDS_FIXES verdict with cross-reference rationale → Write reconstitution instructions → Write report file → Update sprint-goal-state.json metadata
- pattern_source: struct-4 DESIGN NOTES line 192: 'Grep call sites → validate Zod + retry cap → check tripwire handling → verify typed errors + no unsafe commit → review TDD evidence → approve or feedback'. Extended for remediation: the review report itself is the artifact — findings documented, verdict set, reconstitution path defined.
- anti_pattern: Writing a review report that claims APPROVED when red-hat found blocking HIGH findings — this is what caused the original H5 finding. The remediated report MUST be honest: NEEDS_FIXES with clear path to APPROVED.
- agent_rationale: REVIEW task (not implementation) — the struct-4 self-review claimed APPROVED but the independent red-hat review found 7 HIGH findings the self-review missed. The missing report artifact combined with the premature verdict is the H5 finding. The remediated report serves as the durable record that documents the actual red-hat-verified state, provides a disposition for every struct-4 AC with file:line evidence, and defines the reconstitution path to APPROVED. This closes the evidential gap: sprint-goal-state.json no longer references a phantom file, and the project has a single source of truth for the struct-4 review state. Composes resolveModel(role) from Sprint 08; owns the CAP-INF-01 review-report artifact.
- Depends on: struct-4 (completed — review task definition exists, but report artifact was never written), red-hat-review (completed — .spec/reviews/red-hat-2026-07-17T04-30-00Z.md exists as authoritative source) · Blocks: None — this is a leaf remediation task. After all REDHAT-FIX tasks land, a re-review flips struct-4 verdict to APPROVED.

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: struct-4 (completed — review task definition exists, but report artifact was never written), red-hat-review (completed — .spec/reviews/red-hat-2026-07-17T04-30-00Z.md exists as authoritative source) · Blocks: None — this is a leaf remediation task. After all REDHAT-FIX tasks land, a re-review flips struct-4 verdict to APPROVED.

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H5",
  "proposed_by": "mastra-reviewer",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "red-hat-report": {
      "description": "Authoritative red-hat review report with all H1-H7 and G-* findings",
      "seed_method": "public_api",
      "records": [
        ".spec/reviews/red-hat-2026-07-17T04-30-00Z.md exists (278 lines)",
        "Contains H1 (CRITICAL): generateText used instead of generateObject — extract-structured.ts:134-148, probe-capability.ts:80-98",
        "Contains H2 (HIGH): structuredOutput flag never read — extract-structured.ts and probe-capability.ts",
        "Contains H3 (HIGH): tripwire is input regex not output guardrail — extract-structured.ts:95-118",
        "Contains H4 (HIGH): holo extract:status returns NOT_IMPLEMENTED — holo.ts:1831-1858",
        "Contains H5 (HIGH): struct-4 review report file does not exist — .spec/reviews/struct-4-extraction-safety-review.md",
        "Contains H6 (HIGH): no DB query verifies no-committed-row — struct-explicit-fail.test.ts:148-158,200-221",
        "Contains H7 (HIGH): probe-capability.ts path mismatch — probe-capability.ts under inference/ not fleet/",
        "Contains G-ORACLE, G-DEFERRED, G-CLI gate findings"
      ]
    },
    "struct-4-task-definition": {
      "description": "Original struct-4 task with AC-1 through AC-4 scenarios and REQUIREMENT-CONTRACT v1",
      "seed_method": "public_api",
      "records": [
        ".spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/struct-4-review-extraction-safety.md exists (515 lines)",
        "AC-1: every extraction call site validates against real Zod schema (no z.any()); MAX_REPAIR_ATTEMPTS defined+used",
        "AC-2: malformed/tripwire output reaches typed terminal with no unsafe DB commit",
        "AC-3: RED→GREEN→REFACTOR with real-fleet evidence",
        "AC-4: probe uses real generateObject (not /health proxy), fails-closed on unreachable",
        "REQUIREMENT-CONTRACT v1 with fixtures: struct-1-implementation, struct-3-red-evidence, struct-repo-state"
      ]
    },
    "stale-goal-state": {
      "description": "sprint-goal-state.json with stale APPROVED verdict and phantom report reference",
      "seed_method": "public_api",
      "records": [
        "sprint-goal-state.json exists (97 lines)",
        "Line 30: struct-4 verdict 'APPROVED'",
        "Line 71: red_hat.verdict 'APPROVED'",
        "Line 72: red_hat.report '.spec/reviews/struct-4-extraction-safety-review.md' (file does not exist)",
        "Line 73: red_hat.critical: 0 (should be 1 — H1 is CRITICAL)",
        "Line 74: red_hat.high: 0 (should be >= 6 — H2-H7)"
      ]
    },
    "missing-artifact": {
      "description": "The non-existent struct-4 review report file — the gap this task closes",
      "seed_method": "absence_proof",
      "records": [
        ".spec/reviews/struct-4-extraction-safety-review.md does NOT exist",
        "rg -rn 'struct-4' .spec/reviews/ returns nothing",
        "struct-4 task SCOPE says 'Writes: .spec/reviews/struct-4-extraction-safety-review.md (NEW)' but file was never created"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "primary": true,
      "description": "GIVEN missing struct-4 review report WHEN remediation task executes THEN .spec/reviews/struct-4-extraction-safety-review.md exists on disk with >= 50 lines of structured review content — verdict section, disposition table, and cross-reference to authoritative red-hat review",
      "given": "struct-4 task claimed SCOPE: 'Writes: .spec/reviews/struct-4-extraction-safety-review.md (NEW) — APPROVED/NEEDS_FIXES report' but the file does not exist on disk (glob `rg -rn 'struct-4' .spec/reviews/` returns nothing)",
      "when": "mastra-reviewer executes REDHAT-FIX-H5: writes the review report to the expected path",
      "then": "the file exists, passes `test -f .spec/reviews/struct-4-extraction-safety-review.md`, contains >= 50 lines, contains a `## Verdict` section with `NEEDS_FIXES`, contains a `## Disposition Table` mapping every struct-4 AC, and cross-references `.spec/reviews/red-hat-2026-07-17T04-30-00Z.md`",
      "flow_ref": "T-INFER-010",
      "test_tier": "integration",
      "verification_service": "litellm-fleet",
      "tdd_state": "n/a",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-010",
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "negative_control": {
          "would_fail_if": [
            "report file written to wrong path (not .spec/reviews/)",
            "report file is empty or < 50 lines",
            "report file has APPROVED verdict despite unresolved H1-H7 findings",
            "report file does not cross-reference the red-hat review at red-hat-2026-07-17T04-30-00Z.md",
            "report file is a stub with placeholder text (e.g., 'TODO: write review')",
            "report file is a copy of the struct-4 task markdown without actual review content"
          ]
        },
        "cases": [
          {
            "start_ref": "missing-artifact",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Write .spec/reviews/struct-4-extraction-safety-review.md with structured sections: header + date/target, Verdict, AC Disposition Table, Cross-Reference to red-hat findings, Reconstitution Instructions",
                "Set verdict NEEDS_FIXES — cite red-hat review finding IDs",
                "Provide file:line evidence for each AC disposition from both the original implementation and the red-hat review",
                "Include reconstitution instructions documenting the path to APPROVED after H1-H7/G-* remediation"
              ]
            },
            "end_state": {
              "must_observe": [
                "test -f .spec/reviews/struct-4-extraction-safety-review.md exits 0",
                "file line count >= 50",
                "file contains '## Verdict' and 'NEEDS_FIXES'",
                "file contains '## AC Disposition Table' with rows for AC-1, AC-2, AC-3, AC-4",
                "file cross-references 'red-hat-2026-07-17T04-30-00Z.md' at least 10 times",
                "file cites finding IDs H1, H2, H3, H4, H5, H6, H7",
                "file cites gate findings G-ORACLE, G-DEFERRED, G-CLI"
              ],
              "must_not_observe": [
                "file does not exist at expected path",
                "file contains 'APPROVED' as final verdict",
                "file contains 'TODO' or 'placeholder' or 'FIXME'",
                "file has < 50 lines (stub detection)",
                "file is byte-for-byte identical to the struct-4 task markdown",
                "file contains zero references to red-hat findings"
              ]
            }
          }
        ]
      },
      "type": "acceptance_criterion",
      "maps_to_ac": null
    },
    {
      "id": "AC-2",
      "primary": false,
      "description": "GIVEN the authoritative red-hat review report at .spec/reviews/red-hat-2026-07-17T04-30-00Z.md WHEN writing the struct-4 review report THEN every HIGH finding (H1-H7) and gate finding (G-ORACLE, G-DEFERRED, G-CLI) is cross-referenced with file:line evidence from the red-hat report",
      "given": "red-hat-2026-07-17T04-30-00Z.md exists with 7 HIGH findings (H1-H7) and 3 gate findings (G-ORACLE, G-DEFERRED, G-CLI) documented with file:line evidence",
      "when": "mastra-reviewer writes the struct-4 review report cross-reference section",
      "then": "every H and G finding ID appears in the report with: red-hat report line number, affected source file:line, evidence summary, and impact on the corresponding struct-4 AC",
      "flow_ref": "T-INFER-010",
      "test_tier": "integration",
      "verification_service": "litellm-fleet",
      "tdd_state": "n/a",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-010",
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "negative_control": {
          "would_fail_if": [
            "finding IDs are mentioned without file:line references",
            "fewer than 7 HIGH findings are cross-referenced",
            "gate findings G-ORACLE/G-DEFERRED/G-CLI are omitted",
            "cross-references point to non-existent line numbers",
            "cross-references are vague ('somewhere in extract-structured.ts') without line numbers"
          ]
        },
        "cases": [
          {
            "start_ref": "red-hat-report",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Read red-hat-2026-07-17T04-30-00Z.md to extract all H and G finding IDs, locations, and evidence",
                "For each finding, record in the struct-4 report: finding ID, red-hat report line, affected source file:line, evidence summary, impact on struct-4 ACs",
                "Verify each cross-reference with rg to confirm the cited file:line exists in the actual codebase"
              ]
            },
            "end_state": {
              "must_observe": [
                "report contains 'H1' with reference to extract-structured.ts:134-148 and probe-capability.ts:80-98",
                "report contains 'H2' with reference to extract-structured.ts and probe-capability.ts (zero structuredOutput references)",
                "report contains 'H3' with reference to extract-structured.ts:95-118",
                "report contains 'H4' with reference to holo.ts:1831-1858",
                "report contains 'H5' with reference to .spec/reviews/struct-4-extraction-safety-review.md (missing)",
                "report contains 'H6' with reference to struct-explicit-fail.test.ts:148-158,200-221 and struct-tripwire-blocked.test.ts:177-198",
                "report contains 'H7' with reference to probe-capability.ts path discrepancy",
                "report contains 'G-ORACLE' with reference to oracle divergence evidence",
                "report contains 'G-DEFERRED' with reference to deferred gate step 5",
                "report contains 'G-CLI' with reference to missing --fixture flag"
              ],
              "must_not_observe": [
                "any H-finding ID (H1-H7) missing from cross-reference",
                "any G-finding ID (G-ORACLE, G-DEFERRED, G-CLI) missing from cross-reference",
                "cross-reference uses non-existent line numbers",
                "cross-reference is a copy-paste of the red-hat report without struct-4 AC impact mapping"
              ]
            }
          }
        ]
      },
      "type": "acceptance_criterion",
      "maps_to_ac": null
    },
    {
      "id": "AC-3",
      "primary": false,
      "description": "GIVEN the self-review APPROVED was premature and the red-hat review found 7 HIGH findings WHEN writing the struct-4 review report THEN verdict is NEEDS_FIXES with: (a) explicit disposition for every struct-4 AC citing red-hat evidence, (b) reconstitution instructions documenting the exact remediation tasks and re-verification steps to reach APPROVED",
      "given": "struct-4 task claims 'Reviewer: mastra-reviewer (self-review APPROVED)' but red-hat review found blocking HIGH findings; sprint-goal-state.json line 72 claims verdict APPROVED with 0 critical, 0 high",
      "when": "mastra-reviewer writes the verdict section and reconstitution instructions",
      "then": "verdict is NEEDS_FIXES; each struct-4 AC has a disposition (PASS/PARTIAL/FAIL) with red-hat finding ID justification; reconstitution instructions list REDHAT-FIX-H1 through REDHAT-FIX-H7 and G-* as blockers, with re-verification grep commands for each",
      "flow_ref": "T-INFER-010",
      "test_tier": "integration",
      "verification_service": "litellm-fleet",
      "tdd_state": "n/a",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-010",
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "negative_control": {
          "would_fail_if": [
            "verdict is APPROVED (ignoring red-hat findings)",
            "disposition table claims all PASS (contradicting red-hat evidence)",
            "reconstitution instructions are missing",
            "reconstitution instructions are vague ('fix everything then re-review') without per-finding verification steps",
            "AC-4 (probe uses real generateObject) disposition does not cite H1 file:line evidence (generateText used, not generateObject)"
          ]
        },
        "cases": [
          {
            "start_ref": "red-hat-report",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Set report verdict to NEEDS_FIXES with rationale citing the 7 HIGH + 3 gate findings from red-hat-2026-07-17T04-30-00Z.md",
                "Build disposition table: AC-1 (PASS — zero z.any(), MAX_REPAIR_ATTEMPTS 5x), AC-2 (PARTIAL — typed errors exist but H4 extract:status NOT_IMPLEMENTED, H6 no DB query), AC-3 (PARTIAL — RED evidence exists but H5 report file missing), AC-4 (FAIL — H1 probe uses generateText not generateObject, H7 path mismatch)",
                "Write reconstitution instructions: list each REDHAT-FIX task as a blocker, provide rg verification commands per AC, document re-review trigger: 'after H1-H7 + G-* land, re-run struct-4 verification greps; if all PASS, flip verdict to APPROVED'"
              ]
            },
            "end_state": {
              "must_observe": [
                "rg -c 'NEEDS_FIXES' .spec/reviews/struct-4-extraction-safety-review.md >= 1",
                "disposition table has rows for AC-1 (PASS), AC-2 (PARTIAL), AC-3 (PARTIAL), AC-4 (FAIL)",
                "AC-2 disposition cites H4 and H6 with red-hat line numbers",
                "AC-3 disposition cites H5 with red-hat line numbers",
                "AC-4 disposition cites H1 and H7 with red-hat line numbers",
                "reconstitution instructions list REDHAT-FIX-H1 through REDHAT-FIX-H7",
                "reconstitution instructions list G-ORACLE, G-DEFERRED, G-CLI remediations",
                "reconstitution instructions include per-AC rg verification commands"
              ],
              "must_not_observe": [
                "verdict section contains 'APPROVED'",
                "AC-4 disposition is PASS (contradicts H1 evidence)",
                "disposition table missing any AC (AC-1 through AC-4)",
                "reconstitution instructions absent",
                "reconstitution instructions say 're-run self-review' without referencing red-hat findings"
              ]
            }
          }
        ]
      },
      "type": "acceptance_criterion",
      "maps_to_ac": null
    },
    {
      "id": "AC-4",
      "primary": false,
      "description": "GIVEN sprint-goal-state.json line 72 claims 'report: .spec/reviews/struct-4-extraction-safety-review.md' with 'verdict: APPROVED', 'critical: 0', 'high: 0' WHEN the report artifact is restored THEN sprint-goal-state.json red_hat block is corrected: report path verified, verdict changed to NEEDS_FIXES, critical/high counts reflect actual red-hat findings",
      "given": "sprint-goal-state.json red_hat block (lines 70-82) is stale: claims APPROVED verdict with 0 critical/0 high findings, references a non-existent report file",
      "when": "mastra-reviewer updates sprint-goal-state.json to reflect actual state after red-hat review",
      "then": "red_hat.report points to both files (struct-4 report AND red-hat report), red_hat.verdict is NEEDS_FIXES, red_hat.critical is 1 (H1), red_hat.high is >= 6 (H2-H7), red_hat.medium/low counts reflect actual findings",
      "flow_ref": "T-INFER-010",
      "test_tier": "integration",
      "verification_service": "litellm-fleet",
      "tdd_state": "n/a",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-010",
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "negative_control": {
          "would_fail_if": [
            "sprint-goal-state.json is not updated (still claims APPROVED, 0 high)",
            "sprint-goal-state.json is updated with wrong report path",
            "sprint-goal-state.json verdict changed but counts still show 0",
            "sprint-goal-state.json is corrupted (invalid JSON after edit)",
            "sprint-goal-state.json is rewritten entirely losing task/gate/e2e data"
          ]
        },
        "cases": [
          {
            "start_ref": "stale-goal-state",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Read sprint-goal-state.json to confirm current stale state",
                "Update red_hat.verdict from 'APPROVED' to 'NEEDS_FIXES'",
                "Update red_hat.critical from 0 to 1 (H1 is CRITICAL severity)",
                "Update red_hat.high from 0 to 6 (H2, H3, H4, H5, H6, H7 are HIGH)",
                "Update red_hat.medium and red_hat.low to match actual red-hat counts",
                "Add red_hat.red_hat_report referencing .spec/reviews/red-hat-2026-07-17T04-30-00Z.md",
                "Update red_hat.report to reference .spec/reviews/struct-4-extraction-safety-review.md",
                "Replace red_hat.medium_note and red_hat.low_notes with actual red-hat M/L findings",
                "Validate JSON with python3 -m json.tool sprint-goal-state.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "sprint-goal-state.json is valid JSON (python3 -m json.tool exits 0)",
                "red_hat.verdict = 'NEEDS_FIXES'",
                "red_hat.critical = 1",
                "red_hat.high >= 6",
                "red_hat.report includes 'struct-4-extraction-safety-review.md'",
                "red_hat has new field 'red_hat_report' pointing to 'red-hat-2026-07-17T04-30-00Z.md'",
                "red_hat.medium_note and low_notes reflect actual red-hat findings",
                "tasks.completed still 4, tasks.details intact",
                "gate, e2e, build, human_test blocks unchanged"
              ],
              "must_not_observe": [
                "red_hat.verdict = 'APPROVED'",
                "red_hat.high = 0",
                "sprint-goal-state.json is invalid JSON",
                "task details, gate, e2e, build, or human_test data lost",
                "report path still pointing to non-existent file without correction"
              ]
            }
          }
        ]
      },
      "type": "acceptance_criterion",
      "maps_to_ac": null
    },
    {
      "id": "AC-5",
      "primary": false,
      "description": "GIVEN this is a REVIEW task (task_type: REVIEW) WHEN executing REDHAT-FIX-H5 THEN zero implementation source files under services/platform/src/ are modified — the report documents findings but does not fix them",
      "given": "REDHAT-FIX-H5 is a REVIEW task that restores a missing review report artifact; it is NOT an implementation task",
      "when": "mastra-reviewer executes the task",
      "then": "git diff --name-only shows only files under .spec/reviews/ and possibly sprint-goal-state.json; zero files under services/platform/src/ are modified",
      "flow_ref": "T-INFER-010",
      "test_tier": "integration",
      "verification_service": "litellm-fleet",
      "tdd_state": "n/a",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-010",
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "negative_control": {
          "would_fail_if": [
            "extract-structured.ts is modified (review task must not implement fixes)",
            "probe-capability.ts is modified",
            "holo.ts is modified",
            "any test file under tests/ is modified",
            "git diff shows changes to services/platform/src/ (implementation code leaked into review task)"
          ]
        },
        "cases": [
          {
            "start_ref": "pre-execution-head",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Capture pre-execution HEAD SHA",
                "Execute task: write review report, update sprint-goal-state.json",
                "Run git diff --name-only HEAD",
                "Verify diff contains only .spec/reviews/struct-4-extraction-safety-review.md and .spec/prds/.../sprint-goal-state.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "git diff --name-only includes .spec/reviews/struct-4-extraction-safety-review.md",
                "sprint-goal-state.json may be in diff (metadata update only)"
              ],
              "must_not_observe": [
                "git diff --name-only includes services/platform/src/inference/extract-structured.ts",
                "git diff --name-only includes services/platform/src/inference/probe-capability.ts",
                "git diff --name-only includes services/platform/src/cli/holo.ts",
                "git diff --name-only includes tests/integration/service/struct-*.test.ts",
                "git diff --name-only includes any file under services/platform/src/"
              ]
            }
          }
        ]
      },
      "type": "acceptance_criterion",
      "maps_to_ac": null
    },
    {
      "id": "TC-1",
      "description": "Review report file exists at expected path with >= 50 lines",
      "verify": "test -f .spec/reviews/struct-4-extraction-safety-review.md && test $(wc -l < .spec/reviews/struct-4-extraction-safety-review.md) -ge 50",
      "maps_to_ac": "AC-1",
      "type": "test_criterion"
    },
    {
      "id": "TC-2",
      "description": "Review report contains NEEDS_FIXES verdict",
      "verify": "rg -c 'NEEDS_FIXES' .spec/reviews/struct-4-extraction-safety-review.md",
      "maps_to_ac": "AC-1",
      "type": "test_criterion"
    },
    {
      "id": "TC-3",
      "description": "Review report cross-references red-hat review at least 10 times",
      "verify": "test $(rg -c 'red-hat-2026-07-17T04-30-00Z' .spec/reviews/struct-4-extraction-safety-review.md) -ge 10",
      "maps_to_ac": "AC-1",
      "type": "test_criterion"
    },
    {
      "id": "TC-4",
      "description": "Review report cites all HIGH red-hat findings (H1-H7)",
      "verify": "for id in H1 H2 H3 H4 H5 H6 H7; do rg -q \"$id\" .spec/reviews/struct-4-extraction-safety-review.md || exit 1; done",
      "maps_to_ac": "AC-2",
      "type": "test_criterion"
    },
    {
      "id": "TC-5",
      "description": "Review report cites all gate findings (G-ORACLE, G-DEFERRED, G-CLI)",
      "verify": "for id in G-ORACLE G-DEFERRED G-CLI; do rg -q \"$id\" .spec/reviews/struct-4-extraction-safety-review.md || exit 1; done",
      "maps_to_ac": "AC-2",
      "type": "test_criterion"
    },
    {
      "id": "TC-6",
      "description": "Disposition table covers all 4 struct-4 ACs",
      "verify": "for ac in AC-1 AC-2 AC-3 AC-4; do rg -q \"$ac\" .spec/reviews/struct-4-extraction-safety-review.md || exit 1; done",
      "maps_to_ac": "AC-3",
      "type": "test_criterion"
    },
    {
      "id": "TC-7",
      "description": "Reconstitution instructions reference all REDHAT-FIX tasks",
      "verify": "for fix in REDHAT-FIX-H1 REDHAT-FIX-H2 REDHAT-FIX-H3 REDHAT-FIX-H4 REDHAT-FIX-H5 REDHAT-FIX-H6 REDHAT-FIX-H7; do rg -q \"$fix\" .spec/reviews/struct-4-extraction-safety-review.md || exit 1; done",
      "maps_to_ac": "AC-3",
      "type": "test_criterion"
    },
    {
      "id": "TC-8",
      "description": "sprint-goal-state.json updated with NEEDS_FIXES verdict and correct counts",
      "verify": "python3 -c \"import json; d=json.load(open('.spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/sprint-goal-state.json')); assert d['red_hat']['verdict']=='NEEDS_FIXES'; assert d['red_hat']['critical']>=1; assert d['red_hat']['high']>=6\"",
      "maps_to_ac": "AC-4",
      "type": "test_criterion"
    },
    {
      "id": "TC-9",
      "description": "No implementation files modified",
      "verify": "git diff --name-only HEAD -- services/platform/src/ | test $(wc -l) -eq 0",
      "maps_to_ac": "AC-5",
      "type": "test_criterion"
    }
  ]
}
-->
