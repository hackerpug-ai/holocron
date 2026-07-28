# REDHAT-FIX-S27-22 — [R-8] Replace weak any-of gate oracles with concrete require-all success assertions

## What this does

Replace gate-plan steps 2–3 weak any-of oracles with require_all_regex concrete success assertions so recompute cannot green on a single alternate token.

## Why

R-8 residual of F-9 / REDHAT-FIX-S27-09. Severity HIGH (oracle class) / MEDIUM impact this run because real logs already had full tokens. Negative control mandated by red-hat: single alternate token still greens recompute under or_semantics any. Prefer plan-only fix; touch verify scripts only if needed for fixture harness.

## How to verify

- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json (MODIFY — steps 2–3 require_all_regex; remove or_semantics any), /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/test-verify-gate-evidence.sh (MODIFY — optional S27 step2/3 gamed cases if needed), /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/verify-gate-evidence.sh (MODIFY only if a bug blocks require_all on these steps — prefer plan-only fix), .sp

Prohibited: Leaving or_semantics any on steps 2 or 3, Weakening recompute-strong globally to preserve any-of greening, Inventing success tokens the CLI never prints, Deleting recompute or bypassing verify-gate-evidence, Changing production backup job code solely to emit easier tokens

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-22 — [R-8] Replace weak any-of gate oracles with concrete require-all success assertions
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P1
EFFORT:     M  (75 min)
AGENT:      implementer=test-quality-reviewer | reviewer=code-reviewer
PROPOSED-BY: test-quality-reviewer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 27 — Standing Off-Mini Backup Pipeline and Alerting](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
steps 2 and 3 have no or_semantics any; each has require_all_regex listing every concrete success token; a single-token gamed log fails recompute-strong; real full success logs still pass.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST remediate red-hat R-8: Steps 2–3 still use or_semantics: "any" weak OR oracles (F-9 residual). Location: gate-plan.json steps 2–3. Evidence: this run’s logs show full real success (manifest present, parity PASS), but recompute can green on a single alternate token. Fix: require_all_regex for concrete success tokens.
- MUST remove or set or_semantics away from "any" on steps 2 and 3 (default all / omit field) and add require_all_regex covering every concrete success claim in step text.
- MUST require step 2 tokens that prove base backup success AND manifest presence (and overall OK when printed by formatBaseBackupText): e.g. status:\s+success, manifest:\s+present, overall:\s+OK.
- MUST require step 3 tokens that prove mirror parity AND ok true: e.g. parity:\s+PASS, ok:\s+true (and preferably heartbeat:\s+upserted).
- MUST prove recompute-strong fails on a fixture log that contains only one alternate token for each step (R-8 negative control).
- NEVER leave or_semantics: "any" on CAP-BAK-01 steps 2 or 3
- NEVER keep expect_log_regex as sole OR alternation without require_all_regex for multi-claim steps
- NEVER accept a single token (e.g. only overall: OK, or only ok: true) as full step success under recompute
- NEVER weaken verify-gate-evidence recompute-strong global rules to make this pass
- NEVER ban legacy or_semantics any globally for other sprints — only fix S27 steps 2–3
- STRICTLY residual of REDHAT-FIX-S27-09 / F-9 — recompute-strong already AND-expands top-level | unless or_semantics any; this task removes the any opt-out on steps 2–3 and adds explicit require_all_regex
- STRICTLY prefer concrete tokens from formatBaseBackupText / formatMirrorText actual output
- STRICTLY keep expected_exit 0 and expect_not_log_regex overall FAILED where applicable
- STRICTLY CAP-BAK-01 backup pipeline gate honesty

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: PRIMARY — step 2 require_all concrete base-backup success tokens
- [ ] AC-2: Step 3 require_all concrete mirror parity success tokens
- [ ] AC-3: Single alternate token fails recompute-strong (R-8 negative control)
- [ ] AC-4: Full real success logs still pass recompute (positive control)
- [ ] AC-5: No remaining or_semantics any on S27 backup success steps 2–3; tooling clean
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean on write_allowed paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — PRIMARY — step 2 require_all concrete base-backup success tokens (flow_ref T-PLAT-024)
  GIVEN gate-plan step 2 currently has or_semantics any and expect_log_regex status:\s+success|manifest:\s+present|overall:\s+OK
  WHEN  gate-plan.json step 2 assertion is updated
  THEN  or_semantics any is removed (or not "any"); require_all_regex includes at least status:\s+success and manifest:\s+present (and overall:\s+OK when the CLI emits it); step text claims remain aligned with required tokens.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: gate-plan
  VERIFY: `jq -e '.steps[] | select(.n==2) | .assertion | (has("or_semantics")|not or .or_semantics != "any") and (.require_all_regex|type=="array") and (.require_all_regex|length>=2) and ([.require_all_regex[]|tostring]|map(test("status|manifest";"i"))|all)' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json; jq '.steps[] | select(.n==2) | .assertion' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if or_semantics any remains on step 2; require_all_regex missing or only one token; only overall: OK required while step text claims manifest present
  START_REF: full_base_backup_success_log
  MUST_OBSERVE: step 2 require_all_regex includes status success pattern; step 2 require_all_regex includes manifest present pattern; step 2 or_semantics is not any
  MUST_NOT_OBSERVE: or_semantics: "any" on step 2; expect_log_regex sole multi-claim OR without require_all
  EVIDENCE: file_artifact

### AC-2 — Step 3 require_all concrete mirror parity success tokens (flow_ref T-PLAT-024)
  GIVEN gate-plan step 3 currently has or_semantics any and expect_log_regex parity:\s+PASS|ok:\s+true
  WHEN  gate-plan.json step 3 assertion is updated
  THEN  or_semantics any is removed; require_all_regex includes parity:\s+PASS and ok:\s+true (optionally heartbeat:\s+upserted); incomplete parity cannot green.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: gate-plan
  VERIFY: `jq -e '.steps[] | select(.n==3) | .assertion | (has("or_semantics")|not or .or_semantics != "any") and (.require_all_regex|type=="array") and (.require_all_regex|map(tostring)|map(test("parity|PASS";"i"))|any) and (.require_all_regex|map(tostring)|map(test("ok";"i"))|any)' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json; jq '.steps[] | select(.n==3) | .assertion' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if or_semantics any remains on step 3; only ok: true required while text claims every object SHA-256 matches; parity: PASS not in require_all_regex
  START_REF: full_mirror_parity_success_log
  MUST_OBSERVE: step 3 require_all_regex includes parity PASS pattern; step 3 require_all_regex includes ok true pattern; step 3 or_semantics is not any
  MUST_NOT_OBSERVE: or_semantics: "any" on step 3; single-token oracle only
  EVIDENCE: file_artifact

### AC-3 — Single alternate token fails recompute-strong (R-8 negative control) (flow_ref T-PLAT-024)
  GIVEN single_token_base_gamed_log and single_token_mirror_gamed_log fixtures + updated gate-plan
  WHEN  verify-gate-evidence.sh recompute-strong is run against mini evidence trees for steps 2 and 3 with gamed logs
  THEN  recompute does not verify true for either gamed step; discrepancies cite missing require_all_regex tokens (or OR-branch not found). single alternate token still greens recompute under or_semantics any is the pre-fix failure mode and must not hold after the fix.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: verify-gate-evidence
  VERIFY: `mkdir -p .tmp/redhat-fix-s27-22/{base-gamed,mirror-gamed}/.gate-evidence/manual; printf '%s\n' 'overall:        OK' > .tmp/redhat-fix-s27-22/base-gamed/step2.log; printf '%s\n' 'ok:              true' > .tmp/redhat-fix-s27-22/mirror-gamed/step3.log; bash /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/verify-gate-evidence.sh .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting 2>&1 | tee .tmp/redhat-fix-s27-22/recompute-note.txt || true; # Prefer a focused mini-plan fixture as in test-verify-gate-evidence GREEN/RED cases: construct plan snippet with steps 2/3 require_all and prove gamed logs fail closed; store proof under .tmp/redhat-fix-s27-22/`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if single alternate token still greens recompute under or_semantics any (R-8 negative); gamed overall: OK alone passes step 2 require_all; gamed ok: true alone passes step 3 require_all; only plan comments change without recompute proof
  START_REF: single_token_base_gamed_log
  MUST_OBSERVE: recomputed fail or verified false for gamed step 2; discrepancy mentions require_all_regex or missing token
  MUST_NOT_OBSERVE: verified true on overall-only log; empty discrepancies on gamed fixture
  EVIDENCE: file_artifact

### AC-4 — Full real success logs still pass recompute (positive control) (flow_ref T-PLAT-024)
  GIVEN full_base_backup_success_log and full_mirror_parity_success_log matching this run’s real evidence (manifest present, parity PASS)
  WHEN  recompute-strong evaluates steps 2–3 against full success logs
  THEN  both steps recompute pass; no false fail from over-strict banned tokens; require_all tokens all match.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: verify-gate-evidence+real-cli
  VERIFY: `jq -e '.steps[] | select(.n==2 or .n==3) | .assertion.require_all_regex | length >= 2' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json; # with full success step logs from last gate run or regenerated backup:base / backup:mirror output, recompute-strong verifies true for steps 2-3`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if require_all tokens invented and never emitted by CLI; strengthening false-fails real full success logs; no positive control fixture stored
  START_REF: full_base_backup_success_log
  MUST_OBSERVE: status success + manifest present present in step2 log; parity PASS + ok true present in step3 log; recompute pass for strong steps 2–3
  MUST_NOT_OBSERVE: false fail on full real success; require_all pattern that cannot match CLI output
  EVIDENCE: stdout

### AC-5 — No remaining or_semantics any on S27 backup success steps 2–3; tooling clean (flow_ref T-PLAT-024)
  GIVEN updated gate-plan.json
  WHEN  jq/rg audit steps 2–3 and typecheck/lint run
  THEN  zero or_semantics any on n=2 and n=3; pnpm tsgo --noEmit and pnpm biome check . exit 0
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: gate-plan+tooling
  VERIFY: `jq -e '[.steps[] | select(.n==2 or .n==3) | select(.assertion.or_semantics=="any")] | length == 0' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json && pnpm tsgo --noEmit && pnpm biome check .`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if step 2 or 3 still has or_semantics any; audit only checks comments; typecheck/lint failures ignored
  START_REF: full_mirror_parity_success_log
  MUST_OBSERVE: jq length == 0 for or_semantics any on steps 2–3; tsgo exit 0; biome exit 0
  MUST_NOT_OBSERVE: or_semantics any on step 2; or_semantics any on step 3
  EVIDENCE: stdout


--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Gate-plan step 2 or_semantics is not any | AC-1 | `jq -e '.steps[] \| select(.n==2) \| (has("assertion") and ((.assertion.or_semantics // "all") != ...` |
| TC-2 | Gate-plan step 2 require_all_regex includes status success and manifest present patterns | AC-1 | `jq -e '.steps[] \| select(.n==2) \| .assertion.require_all_regex \| map(tostring) \| (any(test("s...` |
| TC-3 | Gate-plan step 3 or_semantics is not any | AC-2 | `jq -e '.steps[] \| select(.n==3) \| ((.assertion.or_semantics // "all") != "any")' .spec/prds/mk6...` |
| TC-4 | Gate-plan step 3 require_all_regex includes parity PASS and ok patterns | AC-2 | `jq -e '.steps[] \| select(.n==3) \| .assertion.require_all_regex \| map(tostring) \| (any(test("p...` |
| TC-5 | Recompute fails when step 2 log contains only a single alternate success token | AC-3 | `test -f .tmp/redhat-fix-s27-22/base-gamed-recompute.json && jq -e '.verified != true or (.discrep...` |
| TC-6 | Recompute fails when step 3 log contains only ok true without parity PASS | AC-3 | `test -f .tmp/redhat-fix-s27-22/mirror-gamed-recompute.json && jq -e '.verified != true or (.discr...` |
| TC-7 | Full multi-token success logs still satisfy step 2 and step 3 require_all_regex | AC-4 | `rg -n 'status:[[:space:]]+success\|manifest:[[:space:]]+present\|parity:[[:space:]]+PASS\|ok:[[:s...` |
| TC-8 | pnpm tsgo --noEmit exits 0 after the change set | AC-5 | `pnpm tsgo --noEmit` |
| TC-9 | pnpm biome check . exits 0 after the change set | AC-5 | `pnpm biome check .` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json (MODIFY — steps 2–3 require_all_regex; remove or_semantics any)
- /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/test-verify-gate-evidence.sh (MODIFY — optional S27 step2/3 gamed cases if needed)
- /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/verify-gate-evidence.sh (MODIFY only if a bug blocks require_all on these steps — prefer plan-only fix)
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-verification.json (regenerate after strong run)
- .tmp/redhat-fix-s27-22/** (NEW gamed + positive recompute evidence)

writeProhibited:
- Leaving or_semantics any on steps 2 or 3
- Weakening recompute-strong globally to preserve any-of greening
- Inventing success tokens the CLI never prints
- Deleting recompute or bypassing verify-gate-evidence
- Changing production backup job code solely to emit easier tokens

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T082702Z.md:101-105 — R-8 full finding — steps 2–3 or_semantics any residual of F-9
2. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json:24-50 — steps 2–3 weak OR assertions to replace
3. /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/verify-gate-evidence.sh:53-57,365-403,679-681 — require_all_regex AND + or_semantics any legacy opt-out + recompute-strong method
4. /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/test-verify-gate-evidence.sh:317-351 — GREEN4 require_all positive + GREEN5 or_semantics any compat fixture pattern
5. services/platform/src/backup/base-backup.ts:427-445 — formatBaseBackupText tokens: status, manifest, overall
6. services/platform/src/backup/restic-mirror.ts:829-850 — formatMirrorText tokens: ok, parity PASS, heartbeat upserted
7. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/REDHAT-FIX-S27-09-f-9-strengthen-gate-evidence-verification-beyond-weak-regex-recomputation.md:1-110 — Parent F-9 task — residual R-8 scope
8. gate-plan step1 require_all_regex pattern:16-22 — In-sprint strong pattern to mirror for steps 2–3

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Steps 2–3 no or_semantics any: `jq -e '[.steps[] | select(.n==2 or .n==3) | select(.assertion.or_semantics=="any")] | length == 0' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → Exit 0
- Step 2 require_all concrete tokens: `jq -e '.steps[] | select(.n==2) | .assertion.require_all_regex | length >= 2' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → Exit 0
- Step 3 require_all concrete tokens: `jq -e '.steps[] | select(.n==3) | .assertion.require_all_regex | length >= 2' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → Exit 0
- Gamed single-token recompute fails: `bash /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/test-verify-gate-evidence.sh` → Exit 0 (harness still green); S27 gamed fixtures under .tmp/redhat-fix-s27-22 show fail-closed
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-sprint27-20260728T082702Z.md:R-8, gate-plan.json steps 1 require_all_regex pattern, verify-gate-evidence.sh recompute-strong, REDHAT-FIX-S27-09 (parent)
Pattern: "assertion": { "kind": "exit_and_log_regex", "expected_exit": 0, "require_all_regex": ["status:\\s+success", "manifest:\\s+present", "overall:\\s+OK"], "expect_not_log_regex": "overall:\\s+FAILED" }
Anti-pattern: "or_semantics": "any", "expect_log_regex": "parity:\\s+PASS|ok:\\s+true" — single-token recompute green
- Recommended step 2 require_all_regex: ["status:\\s+success", "manifest:\\s+present", "overall:\\s+OK"]
- Recommended step 3 require_all_regex: ["ok:\\s+true", "parity:\\s+PASS"] (optional heartbeat:\\s+upserted)
- Remove "or_semantics": "any" keys entirely so default AND-expand applies to any residual | in expect_log_regex
- Mirror step1 structure for consistency; store gamed recompute proofs under .tmp/redhat-fix-s27-22/

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- Steps 2–3 no or_semantics any: `jq -e '[.steps[] | select(.n==2 or .n==3) | select(.assertion.or_semantics=="any")] | length == 0' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → Exit 0
- Step 2 require_all concrete tokens: `jq -e '.steps[] | select(.n==2) | .assertion.require_all_regex | length >= 2' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → Exit 0
- Step 3 require_all concrete tokens: `jq -e '.steps[] | select(.n==3) | .assertion.require_all_regex | length >= 2' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → Exit 0
- Gamed single-token recompute fails: `bash /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/test-verify-gate-evidence.sh` → Exit 0 (harness still green); S27 gamed fixtures under .tmp/redhat-fix-s27-22 show fail-closed
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: test-quality-reviewer
- Reviewer: code-reviewer
- Rationale: R-8 is oracle-class residual of F-9: gate-plan steps 2–3 still use or_semantics any so recompute-strong can green on a single alternate success token. Test-quality owns require_all_regex strength.
- Proposed by: test-quality-reviewer

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: ['CAP-BAK-01']

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- brain/docs/TESTING-HIERARCHY.md
- brain/docs/ANTI-STUB-REVIEW.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- RULES.md

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: ['REDHAT-FIX-S27-09']
- blocks: []

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T082702Z.md (REDHAT-FIX-S27-22)
- CAP-BAK-01 residual remediation — gate honesty + production-truth.
- Specialist JSON retained at .tmp/s27-redhat-r-cycle2-expanded-tasks.json

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-22",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "full_base_backup_success_log": {
      "description": "Real backup:base text output containing status: success, manifest: present, and overall: OK (formatBaseBackupText).",
      "seed_method": "public_api",
      "records": [
        "status:         success",
        "manifest:       present",
        "overall:        OK"
      ]
    },
    "full_mirror_parity_success_log": {
      "description": "Real backup:mirror text output containing ok: true and parity: PASS (formatMirrorText).",
      "seed_method": "public_api",
      "records": [
        "ok:              true",
        "parity:          PASS",
        "heartbeat:       upserted"
      ]
    },
    "single_token_base_gamed_log": {
      "description": "Gamed step2 log that contains only one alternate token (e.g. overall: OK) without status success or manifest present \u2014 must fail recompute under require_all.",
      "seed_method": "public_api",
      "records": [
        "overall:        OK",
        "(missing status: success)",
        "(missing manifest: present)"
      ]
    },
    "single_token_mirror_gamed_log": {
      "description": "Gamed step3 log that contains only ok: true without parity: PASS \u2014 must fail recompute under require_all.",
      "seed_method": "public_api",
      "records": [
        "ok:              true",
        "(missing parity: PASS)"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN step 2 or_semantics any WHEN plan updated THEN require_all_regex binds status success + manifest present and or_semantics is not any",
      "verify": "jq -e '.steps[] | select(.n==2) | .assertion' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN step 3 or_semantics any WHEN plan updated THEN require_all_regex binds parity PASS + ok true and or_semantics is not any",
      "verify": "jq -e '.steps[] | select(.n==3) | .assertion' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN single-token gamed logs WHEN recompute-strong runs THEN steps 2\u20133 fail closed (R-8 negative control)",
      "verify": "bash /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/verify-gate-evidence.sh (mini gamed fixtures under .tmp/redhat-fix-s27-22/)"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN full real success logs WHEN recompute-strong runs THEN steps 2\u20133 pass",
      "verify": "recompute against full success logs; require_all tokens match CLI output"
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN updated plan WHEN audited THEN zero or_semantics any on steps 2\u20133 and typecheck/lint clean",
      "verify": "jq -e '[.steps[] | select(.n==2 or .n==3) | select(.assertion.or_semantics==\"any\")] | length == 0' .../gate-plan.json && pnpm tsgo --noEmit && pnpm biome check ."
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Gate-plan step 2 or_semantics is not any",
      "maps_to_ac": "AC-1",
      "verify": "jq -e '.steps[] | select(.n==2) | ((.assertion.or_semantics // \"all\") != \"any\")' .../gate-plan.json"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Gate-plan step 2 require_all_regex includes status success and manifest present patterns",
      "maps_to_ac": "AC-1",
      "verify": "jq -e '.steps[] | select(.n==2) | .assertion.require_all_regex | map(tostring) | (any(test(\"status\";\"i\")) and any(test(\"manifest\";\"i\")))' .../gate-plan.json"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Gate-plan step 3 or_semantics is not any",
      "maps_to_ac": "AC-2",
      "verify": "jq -e '.steps[] | select(.n==3) | ((.assertion.or_semantics // \"all\") != \"any\")' .../gate-plan.json"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Gate-plan step 3 require_all_regex includes parity PASS and ok patterns",
      "maps_to_ac": "AC-2",
      "verify": "jq -e '.steps[] | select(.n==3) | .assertion.require_all_regex | map(tostring) | (any(test(\"parity|PASS\";\"i\")) and any(test(\"ok\";\"i\")))' .../gate-plan.json"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Recompute fails when step 2 log contains only a single alternate success token",
      "maps_to_ac": "AC-3",
      "verify": "jq -e '.verified != true or (.discrepancies|length)>0' .tmp/redhat-fix-s27-22/base-gamed-recompute.json"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Recompute fails when step 3 log contains only ok true without parity PASS",
      "maps_to_ac": "AC-3",
      "verify": "jq -e '.verified != true or (.discrepancies|length)>0' .tmp/redhat-fix-s27-22/mirror-gamed-recompute.json"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "Full multi-token success logs still satisfy step 2 and step 3 require_all_regex",
      "maps_to_ac": "AC-4",
      "verify": "jq -e '.steps[] | select(.n==2 or .n==3) | .assertion.require_all_regex | length >= 2' .../gate-plan.json"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "pnpm tsgo --noEmit exits 0 after the change set",
      "maps_to_ac": "AC-5",
      "verify": "pnpm tsgo --noEmit"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "pnpm biome check . exits 0 after the change set",
      "maps_to_ac": "AC-5",
      "verify": "pnpm biome check ."
    }
  ],
  "proposed_by": "test-quality-reviewer",
  "touches_capabilities": [
    "CAP-BAK-01"
  ]
}
-->

