# REDHAT-FIX-S27-20 — [R-6] Make the production SLA gate claim only evidence it actually measures

## What this does

Make the production SLA gate (step 10) claim only what it measures: DEFAULT_OVERDUE_MS threshold + classification, with any cadence claim bound to a real StartInterval read.

## Why

R-6 residual of F-8 / REDHAT-FIX-S27-08. Severity HIGH (claim honesty). Optional wall-clock stretch is not required if claims are honest. Negative controls mandated by red-hat: cadence_le_5min printed without reading StartInterval still passes; claim wall-clock 15m MTTD without measuring wall clock.

## How to verify

- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: scripts/gate/s27-step10-production-sla.sh (MODIFY — measure StartInterval; honest success markers), .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json (MODIFY — step 10 text + require_all_regex honesty), .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md (MODIFY — HTD-10 claim honesty only), services/platform/tests/integration/sprint27-backup-alerting-red.test.ts (MODIFY — optional SLA claim/cadenc

Prohibited: Changing DEFAULT_OVERDUE_MS to ease the test, Proving SLA solely with BACKUP_ALERT_OVERDUE_MS=500/1000, Mocking launchd/plist StartInterval, Claiming wall-clock 15m MTTD without a real timed measurement, Weakening step9 launchd install proof as a substitute for step10 measurement when step10 claims 

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-20 — [R-6] Make the production SLA gate claim only evidence it actually measures
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P1
EFFORT:     M  (90 min)
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
s27-step10-production-sla.sh no longer hard-codes cadence_le_5min; it reads StartInterval (or intervalSeconds) and asserts ≤300s when claiming cadence; gate TEXT / SPRINT HTD-10 describe threshold+classification (not unmeasured wall-clock 15m MTTD); AC negative controls fail if the hard-coded cadence theatre returns.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST remediate red-hat R-6: Step 10 proves DEFAULT_OVERDUE_MS threshold, not wall-clock 15-minute MTTD; cadence marker is printed not checked — Location: scripts/gate/s27-step10-production-sla.sh:39-80; alerting.ts:982-993 (config_removed seeds stale lastSuccessAt). Evidence: induce backdates last_success_at ~16m then immediate sweep; success line hard-codes cadence_le_5min without reading launchd StartInterval (step9 separately proves ≤300s). Expected: honest claim “threshold + classification at production default” OR timed/cadence-bound proof. Fix: document as threshold proof; assert StartInterval from plist in step10; optional wall-clock stretch.
- MUST rewrite the step10 success line and gate-plan step 10 / SPRINT HTD-10 wording so the claim is explicitly “production DEFAULT_OVERDUE_MS threshold + overdue classification” (or add real measured cadence/wall-clock proof before any stronger claim).
- MUST assert launchd StartInterval from the real holocron-backup-alert-sweep.plist (or install-schedule JSON intervalSeconds) inside step10 — not a hard-coded cadence_le_5min string — with intervalSeconds ≤ 300 before printing any cadence marker.
- MUST keep BACKUP_ALERT_OVERDUE_MS unset on the SLA path and continue asserting overdueMs ≥ 900000 and overdue_by_minutes ≥ 15 under the backdated seed.
- MUST preserve residual-of-REDHAT-FIX-S27-08 / F-8: never reintroduce BACKUP_ALERT_OVERDUE_MS=500/1000 as SLA proof.
- NEVER leave echo ... cadence_le_5min hard-coded without reading StartInterval from plist / install-schedule evidence
- NEVER claim wall-clock 15-minute MTTD / detection-to-alert latency solely because last_success_at was backdated ~16m and an immediate sweep classified overdue
- NEVER claim step9 cadence proof substitutes for step10 cadence assertion when step10 prints cadence_le_5min
- NEVER mock launchctl/plist/StartInterval or invent intervalSeconds without reading the file
- NEVER weaken DEFAULT_OVERDUE_MS or seed age < 15m to make the threshold oracle easier
- STRICTLY residual of REDHAT-FIX-S27-08 / F-8 — threshold proof stays; honesty gap is the claim vs evidence mismatch
- STRICTLY T-PLAT-024 / CAP-BAK-01: any SLA language must match measured evidence only
- STRICTLY prefer document-as-threshold-proof + measured cadence bind; wall-clock stretch is optional, not required for close if claims are honest
- STRICTLY fail closed if plist missing or StartInterval > 300 when a cadence claim is emitted

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: PRIMARY — step10 claim honesty: threshold+classification language, not unmeasured wall-clock MTTD
- [ ] AC-2: Cadence marker is measured from StartInterval / intervalSeconds, not hard-coded
- [ ] AC-3: Threshold classification under production default still holds (F-8 residual preserved)
- [ ] AC-4: gate-plan recompute require_all binds honest markers; hard-coded cadence theatre fails
- [ ] AC-5: Typecheck and lint remain clean for touched paths
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean on write_allowed paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — PRIMARY — step10 claim honesty: threshold+classification language, not unmeasured wall-clock MTTD (flow_ref T-PLAT-024)
  GIVEN R-6: step10 induces backdated last_success_at ~16m then immediate sweep; success line and gate TEXT currently can be read as 15m wall-clock MTTD SLA
  WHEN  scripts/gate/s27-step10-production-sla.sh and gate-plan step 10 text (and SPRINT HTD-10 if present) are updated
  THEN  claimed proof is explicitly production DEFAULT_OVERDUE_MS threshold + overdue classification (overdueMs>=900000, overdue_by_minutes>=15, env unset). No success marker or step TEXT claims wall-clock 15-minute MTTD / detection-to-alert latency unless a separate timed measurement is implemented and asserted.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: s27-step10-production-sla
  VERIFY: `rg -n 'wall-clock|MTTD|15.?min(ute)? (alert )?SLA|cadence_le_5min' scripts/gate/s27-step10-production-sla.sh .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md; bash -n scripts/gate/s27-step10-production-sla.sh; rg -n 'threshold|DEFAULT_OVERDUE|overdueMs|classification' scripts/gate/s27-step10-production-sla.sh .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json | head -40`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if gate TEXT or success line still claims wall-clock 15m MTTD without measuring wall clock; only comments change while SLA_15MIN_DEFAULT_OVERDUE_OK still implies full SLA MTTD; BACKUP_ALERT_OVERDUE_MS=500 reintroduced as SLA proof
  START_REF: stale_beyond_default_sla_seed
  MUST_OBSERVE: step10 / gate-plan language includes DEFAULT_OVERDUE / overdueMs / threshold or classification; no unmeasured wall-clock 15m MTTD claim as the step success criterion; SLA_15MIN_DEFAULT_OVERDUE_OK still requires overdue_ms:900000 and env_unset=BACKUP_ALERT_OVERDUE_MS
  MUST_NOT_OBSERVE: hard claim that backdated seed + immediate sweep proves wall-clock 15-minute MTTD; toy BACKUP_ALERT_OVERDUE_MS=500 on step10
  EVIDENCE: file_artifact

### AC-2 — Cadence marker is measured from StartInterval / intervalSeconds, not hard-coded (flow_ref T-PLAT-024)
  GIVEN R-6 Evidence: success line hard-codes cadence_le_5min without reading launchd StartInterval (step9 separately proves ≤300s)
  WHEN  step10 runs with launchd_alert_sweep_plist present (or install-schedule JSON available)
  THEN  script parses StartInterval from $HOME/Library/LaunchAgents/holocron-backup-alert-sweep.plist (or intervalSeconds from install-schedule / status) and asserts integer ≤ 300 before emitting any cadence_le_5min / cadence OK marker; missing plist or StartInterval>300 fails closed if cadence is claimed.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: launchd+s27-step10
  VERIFY: `rg -n 'StartInterval|intervalSeconds|plutil|holocron-backup-alert-sweep.plist|cadence' scripts/gate/s27-step10-production-sla.sh; test -f "$HOME/Library/LaunchAgents/holocron-backup-alert-sweep.plist" && bash scripts/gate/s27-step10-production-sla.sh 2>&1 | tee .tmp/redhat-fix-s27-20/step10-out.txt; rg -n 'StartInterval|intervalSeconds|cadence|SLA_' .tmp/redhat-fix-s27-20/step10-out.txt`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if cadence_le_5min printed without reading StartInterval still passes (R-6 negative control); script only documents that step9 proved cadence; StartInterval parse is present but assertion never fails when interval > 300
  START_REF: launchd_alert_sweep_plist
  MUST_OBSERVE: script source contains StartInterval or intervalSeconds parse against holocron-backup-alert-sweep plist/JSON; runtime output includes measured interval (e.g. StartInterval=300 or intervalSeconds=300) with assertion pass; cadence marker absent unless measured interval <= 300
  MUST_NOT_OBSERVE: echo ... cadence_le_5min with no plist/StartInterval read in script; cadence claim when StartInterval missing or >300
  EVIDENCE: stdout

### AC-3 — Threshold classification under production default still holds (F-8 residual preserved) (flow_ref T-PLAT-024)
  GIVEN stale_beyond_default_sla_seed via config_removed (alerting.ts:982-993) with env -u BACKUP_ALERT_OVERDUE_MS
  WHEN  updated step10 runs
  THEN  overdueMs>=900000, alerted>=1, max overdue_by_minutes>=15, AC1_DEFAULT_OVERDUE_OK and SLA_15MIN_DEFAULT_OVERDUE_OK (or renamed honest marker) still require those fields; toy 500/1000 refused.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `env -u BACKUP_ALERT_OVERDUE_MS bash scripts/gate/s27-step10-production-sla.sh; jq -e '.overdueMs >= 900000' .tmp/redhat-fix-s27-08/sla-alert-sweep.json; jq -e '[.posts[]? | .overdue_by_minutes // 0] | map(tonumber) | max >= 15' .tmp/redhat-fix-s27-08/sla-alert-sweep.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if honesty rewrite drops overdueMs/overdue_by_minutes assertions; BACKUP_ALERT_OVERDUE_MS=500 accepted on step10; seed age <15m accepted as SLA threshold proof
  START_REF: stale_beyond_default_sla_seed
  MUST_OBSERVE: overdueMs >= 900000; overdue_by_minutes max >= 15; alerted >= 1 for induced job; AC1_DEFAULT_OVERDUE_OK marker
  MUST_NOT_OBSERVE: overdueMs 500 or 1000 on SLA path; silent miss under default threshold
  EVIDENCE: api_response

### AC-4 — gate-plan recompute require_all binds honest markers; hard-coded cadence theatre fails (flow_ref T-PLAT-024)
  GIVEN gate-plan step 10 assertion require_all_regex and hardcoded_cadence_theatre_control as pre-fix negative
  WHEN  step10 script + gate-plan step 10 assertion are updated
  THEN  require_all_regex includes measured cadence token (e.g. StartInterval= or CADENCE_LE_5MIN_OK with measured field) and threshold markers; a synthetic log that only contains hard-coded cadence_le_5min without measured StartInterval does not satisfy recompute-strong require_all.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: gate-plan+verify-gate-evidence
  VERIFY: `jq -e '.steps[] | select(.n==10) | .assertion.require_all_regex | map(tostring) | any(test("StartInterval|intervalSeconds|CADENCE|cadence"; "i"))' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json; jq '.steps[] | select(.n==10) | .assertion' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json; bash /Users/inference1/Projects/brain/skills/kb-run-human-tests/references/verify-gate-evidence.sh --help >/dev/null 2>&1 || true; rg -n 'cadence_le_5min' scripts/gate/s27-step10-production-sla.sh && ! rg -n 'echo .*cadence_le_5min' scripts/gate/s27-step10-production-sla.sh || true`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if cadence_le_5min printed without reading StartInterval still passes gate assertion (R-6 negative); require_all still only lists SLA_15MIN_DEFAULT_OVERDUE_OK + overdue_ms without cadence measurement when cadence is claimed; or_semantics any reintroduced on step10
  START_REF: hardcoded_cadence_theatre_control
  MUST_OBSERVE: gate-plan step 10 require_all_regex includes measured cadence pattern OR step10 no longer claims cadence at all; threshold tokens overdue_ms:900000 and env_unset=BACKUP_ALERT_OVERDUE_MS remain required; script no longer has unconditional echo cadence_le_5min without StartInterval check
  MUST_NOT_OBSERVE: or_semantics any on step 10; hard-coded cadence-only green path
  EVIDENCE: file_artifact

### AC-5 — Typecheck and lint remain clean for touched paths (flow_ref T-PLAT-024)
  GIVEN any optional TS helpers or test files touched under write_allowed
  WHEN  pnpm tsgo --noEmit and pnpm biome check . run
  THEN  both exit 0
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: tooling
  VERIFY: `pnpm tsgo --noEmit && pnpm biome check .`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if syntax error left in s27-step10-production-sla.sh (bash -n fails); biome/tsgo regressions ignored
  START_REF: stale_beyond_default_sla_seed
  MUST_OBSERVE: bash -n exit 0; tsgo exit 0; biome exit 0
  MUST_NOT_OBSERVE: type error; biome error on modified files
  EVIDENCE: stdout


--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Step10 and gate-plan language name threshold+classification proof when wall-clock MTTD is not measured | AC-1 | `rg -n 'threshold\|DEFAULT_OVERDUE\|classification\|overdueMs' scripts/gate/s27-step10-production-...` |
| TC-2 | Step10 source parses StartInterval or intervalSeconds before any cadence success marker | AC-2 | `rg -n 'StartInterval\|intervalSeconds' scripts/gate/s27-step10-production-sla.sh` |
| TC-3 | Cadence claim fails closed when StartInterval is missing or greater than 300 | AC-2 | `rg -n 'StartInterval\|> 300\|intervalSeconds' scripts/gate/s27-step10-production-sla.sh && bash -...` |
| TC-4 | Production default overdueMs is at least 900000 under env -u BACKUP_ALERT_OVERDUE_MS after step10 | AC-3 | `jq -e '.overdueMs >= 900000' .tmp/redhat-fix-s27-08/sla-alert-sweep.json` |
| TC-5 | Induced stale job reports overdue_by_minutes at least 15 under default threshold | AC-3 | `jq -e '[.posts[]? \| .overdue_by_minutes // 0] \| map(tonumber) \| max >= 15' .tmp/redhat-fix-s27...` |
| TC-6 | Hard-coded cadence_le_5min without StartInterval read is absent from the success path | AC-4 | `! rg -n 'echo ".*cadence_le_5min' scripts/gate/s27-step10-production-sla.sh` |
| TC-7 | pnpm tsgo --noEmit exits 0 after the change set | AC-5 | `pnpm tsgo --noEmit` |
| TC-8 | pnpm biome check . exits 0 after the change set | AC-5 | `pnpm biome check .` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- scripts/gate/s27-step10-production-sla.sh (MODIFY — measure StartInterval; honest success markers)
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json (MODIFY — step 10 text + require_all_regex honesty)
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md (MODIFY — HTD-10 claim honesty only)
- services/platform/tests/integration/sprint27-backup-alerting-red.test.ts (MODIFY — optional SLA claim/cadence assertions)
- .tmp/redhat-fix-s27-20/** (NEW evidence)

writeProhibited:
- Changing DEFAULT_OVERDUE_MS to ease the test
- Proving SLA solely with BACKUP_ALERT_OVERDUE_MS=500/1000
- Mocking launchd/plist StartInterval
- Claiming wall-clock 15m MTTD without a real timed measurement
- Weakening step9 launchd install proof as a substitute for step10 measurement when step10 claims cadence

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T082702Z.md:89-94 — R-6 full finding text — claim honesty residual of F-8
2. scripts/gate/s27-step10-production-sla.sh:1-80 — AC-2 backdated seed + hard-coded cadence_le_5min success line at L80
3. services/platform/src/backup/alerting.ts:982-993 — config_removed pure overdue seed: status=success + stale lastSuccessAt
4. services/platform/src/backup/alerting.ts:48,1133-1165,1306-1307,1395-1414 — ALERT_SWEEP_DEFAULT_INTERVAL_SECONDS=300; plist StartInterval; getAlertSweepScheduleStatus parse
5. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json:131-148 — step 10 assertion markers / require_all_regex
6. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md:50 — HTD-10 / production 15-minute SLA gate sentence to honesty-align
7. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/REDHAT-FIX-S27-08-f-8-verify-the-production-fifteen-minute-alert-sla-and-cadence.md:1-100 — Parent F-8 task — residual R-6 scope boundary
8. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:53-59 — T-PLAT-024 alert within defined window

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Step10 script measures cadence: `rg -n 'StartInterval|intervalSeconds' scripts/gate/s27-step10-production-sla.sh && bash -n scripts/gate/s27-step10-production-sla.sh` → Exit 0; matches present; no syntax error
- Step10 runtime threshold proof: `env -u BACKUP_ALERT_OVERDUE_MS bash scripts/gate/s27-step10-production-sla.sh` → Exit 0; AC1_DEFAULT_OVERDUE_OK; measured cadence OK if claimed; overdue_ms:900000
- gate-plan step10 require_all honesty: `jq -e '.steps[] | select(.n==10) | .assertion | (.require_all_regex|length) >= 4' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → Exit 0
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-sprint27-20260728T082702Z.md:R-6, scripts/gate/s27-step10-production-sla.sh, services/platform/src/backup/alerting.ts:getAlertSweepScheduleStatus, REDHAT-FIX-S27-08 (parent)
Pattern: parse StartInterval from plist (or jq .intervalSeconds from install-schedule.json); test "$INTERVAL" -le 300; echo "CADENCE_LE_5MIN_OK StartInterval=$INTERVAL"; echo "SLA_THRESHOLD_CLASSIFICATION_OK overdue_ms:900000 ..."
Anti-pattern: echo "... cadence_le_5min ..." hard-coded after backdated induce without reading StartInterval; labeling that path as full 15m wall-clock SLA
- Minimum honest close: rename/document step as threshold+classification proof AND either (a) remove cadence_le_5min or (b) bind it to measured StartInterval≤300 from plist.
- Optional stretch: true wall-clock MTTD measurement — not required if claims are downgraded honestly.
- Reuse step9 install artifacts when present; fail closed if cadence claimed and plist absent.
- Keep F-8 require_all tokens: SLA_15MIN_DEFAULT_OVERDUE_OK, overdue_ms:900000, env_unset=BACKUP_ALERT_OVERDUE_MS, AC1_DEFAULT_OVERDUE_OK.

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- Step10 script measures cadence: `rg -n 'StartInterval|intervalSeconds' scripts/gate/s27-step10-production-sla.sh && bash -n scripts/gate/s27-step10-production-sla.sh` → Exit 0; matches present; no syntax error
- Step10 runtime threshold proof: `env -u BACKUP_ALERT_OVERDUE_MS bash scripts/gate/s27-step10-production-sla.sh` → Exit 0; AC1_DEFAULT_OVERDUE_OK; measured cadence OK if claimed; overdue_ms:900000
- gate-plan step10 require_all honesty: `jq -e '.steps[] | select(.n==10) | .assertion | (.require_all_regex|length) >= 4' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → Exit 0
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: test-quality-reviewer
- Reviewer: code-reviewer
- Rationale: R-6 is claim-honesty / residual F-8: the production SLA step prints cadence_le_5min without measuring StartInterval and implies wall-clock 15m MTTD while only proving DEFAULT_OVERDUE_MS threshold classification. Test-quality owns oracle honesty.
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
- depends_on: ['REDHAT-FIX-S27-08', 'REDHAT-FIX-S27-10']
- blocks: []

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T082702Z.md (REDHAT-FIX-S27-20)
- CAP-BAK-01 residual remediation — gate honesty + production-truth.
- Specialist JSON retained at .tmp/s27-redhat-r-cycle2-expanded-tasks.json

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-20",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "stale_beyond_default_sla_seed": {
      "description": "config_removed induction seeds restic_blob_mirror with status=success and lastSuccessAt backdated ~16m (alerting.ts:982-993) so immediate sweep classifies overdue under DEFAULT_OVERDUE_MS=900000 without waiting wall-clock 15m.",
      "seed_method": "public_api",
      "records": [
        "bun holo backup:induce-failure --mode config-removed --job restic_blob_mirror --json \u2192 heartbeat.last_success_at non-null, age \u224816m",
        "env -u BACKUP_ALERT_OVERDUE_MS backup:alert-sweep --json \u2192 overdueMs>=900000, alerted>=1, overdue_by_minutes>=15"
      ]
    },
    "launchd_alert_sweep_plist": {
      "description": "Installed holocron-backup-alert-sweep LaunchAgent with StartInterval integer \u2264300 (produced by step9 / backup:alert-sweep --install-schedule).",
      "seed_method": "public_api",
      "records": [
        "$HOME/Library/LaunchAgents/holocron-backup-alert-sweep.plist <key>StartInterval</key><integer>N</integer> with N<=300",
        "or .tmp/REDHAT-FIX-S27-10/install-schedule.json intervalSeconds<=300"
      ]
    },
    "hardcoded_cadence_theatre_control": {
      "description": "Pre-fix step10 success line that prints cadence_le_5min without reading plist \u2014 the R-6 negative control must fail recompute/script assertions after the fix.",
      "seed_method": "public_api",
      "records": [
        "scripts/gate/s27-step10-production-sla.sh:80 pre-fix: echo ... cadence_le_5min ... with no StartInterval parse"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN R-6 step10 backdates last_success_at ~16m then immediate sweep WHEN step10/gate text is updated THEN claim is threshold+classification only unless wall-clock is measured",
      "verify": "rg -n 'threshold|DEFAULT_OVERDUE|wall-clock|MTTD|cadence_le_5min' scripts/gate/s27-step10-production-sla.sh .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN launchd plist WHEN step10 runs THEN StartInterval/intervalSeconds is read and \u2264300 before cadence marker",
      "verify": "rg -n 'StartInterval|intervalSeconds' scripts/gate/s27-step10-production-sla.sh; bash scripts/gate/s27-step10-production-sla.sh"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN config_removed stale seed WHEN step10 runs under env -u BACKUP_ALERT_OVERDUE_MS THEN overdueMs>=900000 and overdue_by_minutes>=15",
      "verify": "env -u BACKUP_ALERT_OVERDUE_MS bash scripts/gate/s27-step10-production-sla.sh; jq -e '.overdueMs >= 900000' .tmp/redhat-fix-s27-08/sla-alert-sweep.json"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN hard-coded cadence theatre WHEN gate-plan require_all is updated THEN unmeasured cadence_le_5min alone cannot green recompute",
      "verify": "jq -e '.steps[] | select(.n==10) | .assertion.require_all_regex' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json"
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN touched sources WHEN typecheck/lint run THEN exit 0",
      "verify": "pnpm tsgo --noEmit && pnpm biome check ."
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Step10 and gate-plan language name threshold+classification proof when wall-clock MTTD is not measured",
      "maps_to_ac": "AC-1",
      "verify": "rg -n 'threshold|DEFAULT_OVERDUE|classification|overdueMs' scripts/gate/s27-step10-production-sla.sh .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Step10 source parses StartInterval or intervalSeconds before any cadence success marker",
      "maps_to_ac": "AC-2",
      "verify": "rg -n 'StartInterval|intervalSeconds' scripts/gate/s27-step10-production-sla.sh"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Cadence claim fails closed when StartInterval is missing or greater than 300",
      "maps_to_ac": "AC-2",
      "verify": "rg -n 'StartInterval|> 300|intervalSeconds' scripts/gate/s27-step10-production-sla.sh && bash -n scripts/gate/s27-step10-production-sla.sh"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Production default overdueMs is at least 900000 under env -u BACKUP_ALERT_OVERDUE_MS after step10",
      "maps_to_ac": "AC-3",
      "verify": "jq -e '.overdueMs >= 900000' .tmp/redhat-fix-s27-08/sla-alert-sweep.json"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Induced stale job reports overdue_by_minutes at least 15 under default threshold",
      "maps_to_ac": "AC-3",
      "verify": "jq -e '[.posts[]? | .overdue_by_minutes // 0] | map(tonumber) | max >= 15' .tmp/redhat-fix-s27-08/sla-alert-sweep.json"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Hard-coded cadence_le_5min without StartInterval read is absent from the success path",
      "maps_to_ac": "AC-4",
      "verify": "! rg -n 'echo \".*cadence_le_5min' scripts/gate/s27-step10-production-sla.sh"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "pnpm tsgo --noEmit exits 0 after the change set",
      "maps_to_ac": "AC-5",
      "verify": "pnpm tsgo --noEmit"
    },
    {
      "id": "TC-8",
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

