# REDHAT-FIX-S27-21 — [R-7] Prove healthy silence with an independent zero-POST receiver assertion

## What this does

Close R-7 HIGH: Healthy silence is self-reported only — step 7 uses jq '.alerted==0 and (.posts|length)==0' with no independent sink zero-POST proof. Snapshot CAP length before/after healthy sweep and require Δ=0 when receiver present, while retaining self-report asserts.

## Why

Remediate red-hat finding R-7 (HIGH) from .spec/reviews/red-hat-sprint27-20260728T082702Z.md.

## How to verify

- `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit 0
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json, .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md, services/platform/tests/integration/sprint27-backup-alerting-red.test.ts, services/platform/tests/**, scripts/gate/**, .tmp/redhat-fix-s27-21/**, .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/.gate-evidence/**

Prohibited: Stubbing postBackupAlert to no-op as silence fix, Changing detection query to always-healthy, SOFT_OK independent-sink claims without CAP, Owning bulk healthy --all security scope (R-5 / S27-19) beyond calling existing reset, Out-of-scope production alerting delivery rewrites unrelated to silence or

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-21 — [R-7] Prove healthy silence with an independent zero-POST receiver assertion
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P1
EFFORT:     M  (90 min)
AGENT:      implementer=red-test-generator | reviewer=test-quality-reviewer
PROPOSED-BY: red-test-generator
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 27 — Standing Off-Mini Backup Pipeline and Alerting](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Step 7 (and equivalent silence proofs) assert CAP Δ=0 with receiver present plus alerted==0/posts empty; poisoned seeds fail; no SOFT_OK independent-sink theatre; RED suite silence remains green.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST snapshot CAP (alerts-http-captures.json) length before healthy alert-sweep
- MUST snapshot CAP length after healthy alert-sweep
- MUST require Δ=0 when receiver/CAP is present for the gate run
- MUST retain existing self-report asserts: alerted==0 and posts|length==0
- MUST fail silence step on poisoned/always-alert seeds (alerted>=1 or CAP growth)
- MUST document negative_control for stub postBackupAlert no-op and self-report-only theatre
- MUST keep RED suite healthy silence green under PLATFORM_IT=1
- NEVER treat self-report posts[] empty alone as independent sink proof when receiver is present
- NEVER introduce SOFT_OK that claims CAP Δ=0 when CAP is missing
- NEVER stub postBackupAlert to no-op as a silence 'fix'
- NEVER change detection query to always return healthy as the silence mechanism
- NEVER mock the independent receiver to auto-zero
- STRICTLY independent observer: CAP/receiver side, not only sweep JSON
- STRICTLY residual of F-6 / REDHAT-FIX-S27-06 — preserve HIGH severity until CAP Δ=0 lands
- STRICTLY flow_ref T-PLAT-024 / D04-05 AC-4 NEVER-tier silence

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: AC-1
- [ ] AC-2: AC-2
- [ ] AC-3: AC-3
- [ ] AC-4: AC-4
- [ ] AC-5: AC-5
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean on write_allowed paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — GIVEN gate-plan.json step 7 healthy silence currently only uses jq '.alerted==0 and (.posts|length)==0' self-report w... (flow_ref T-PLAT-024)
  SUMMARY: GIVEN gate-plan.json step 7 healthy silence currently only uses jq '.alerted==0 and (.posts|length)==0' self-report with no independent sink zero-POST proof (R-7 HIGH residual of F-6) WHEN a receiver/CAP is present for the gate run THEN step 7 MUST snapshot CAP length before and after the healthy alert-sweep and require Δ=0 (independent zero-POST receiver assertion) (T-PLAT-024).
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `jq -r '.steps[]|select(.n==7)|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json | rg -n 'alerts-http-captures|CAP|pre_cap|post_cap|length'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if step 7 still only jq self-report alerted==0 posts[] with no CAP snapshot (pre-fix R-7); always-alert path that POSTs to webhook while posts[] is cleared/mocked still passes; stub postBackupAlert no-op silence 'fix' without checking receiver; soft-pass when CAP file missing without documenting receiver-absent path; mock sink that auto-zeros on healthy seed
  START_REF: s27_step7_self_report_silence_baseline
  MUST_OBSERVE: step 7 snapshots CAP length (or receiver post count) before healthy sweep; step 7 snapshots CAP length after healthy sweep; require Δ=0 when receiver/CAP path is present; still assert alerted==0 and posts|length==0 (self-report remains necessary but not sufficient); echo or log token HEALTHY_SILENCE_CAP_DELTA_0 or equivalent
  MUST_NOT_OBSERVE: self-report-only silence with receiver present and no CAP Δ check; non-zero CAP growth during claimed healthy silence; empty soft signatures for zero-POST without measuring sink
  EVIDENCE: alert_artifact

### AC-2 — GIVEN all heartbeats healthy via backup:healthy --all WHEN alert-sweep runs with ALERT_WEBHOOK_URL pointing at the in... (flow_ref T-PLAT-024)
  SUMMARY: GIVEN all heartbeats healthy via backup:healthy --all WHEN alert-sweep runs with ALERT_WEBHOOK_URL pointing at the independent receiver THEN neither sweep.posts nor CAP/receiver records a POST (two-sided silence oracle: stdout + sink).
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `backup:healthy --all; CAP_BEFORE=$(jq length "$CAP"); backup:alert-sweep --json | jq -e '.alerted==0 and (.posts|length)==0'; CAP_AFTER=$(jq length "$CAP"); test "$CAP_BEFORE" -eq "$CAP_AFTER"`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if sweep always POSTs regardless of healthy state; posts[] empty while CAP grows (client lied); CAP empty while posts[] non-empty under broken self-report; healthy seed incomplete (poisoned rows remain) yet step claims silence
  START_REF: s27_healthy_heartbeats_with_receiver
  MUST_OBSERVE: alerted==0; posts length 0; CAP length unchanged (Δ=0); no new method/url envelope appended during healthy sweep
  MUST_NOT_OBSERVE: any new CAP POST during healthy silence; alerted>=1; post[ lines in silence log
  EVIDENCE: alert_artifact

### AC-3 — GIVEN a poisoned/always-alert seed (induced failure remaining) WHEN the silence CAP Δ assertion runs without healthy ... (flow_ref T-PLAT-024)
  SUMMARY: GIVEN a poisoned/always-alert seed (induced failure remaining) WHEN the silence CAP Δ assertion runs without healthy reset THEN the step fails because either alerted>=1 or CAP grows — proving the independent zero-POST check is not tautological.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `induce kill; run step7-style CAP snapshot + sweep expecting fail (alerted!=0 or CAP Δ>0)`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if silence assertion still passes when CAP grew or alerted>=1; assertion only checks process exit code; static 'silent' string never emitted but grepped as success; soft-pass mock of CAP file
  START_REF: s27_always_alert_poison_for_silence
  MUST_OBSERVE: assertion fail on poisoned state; alerted>=1 and/or CAP Δ>0 observed; negative_control names always-alert / missing healthy seed
  MUST_NOT_OBSERVE: false silence pass on poison; CAP growth ignored
  EVIDENCE: stdout

### AC-4 — GIVEN receiver may be absent in some operator environments WHEN CAP file or ALERT_WEBHOOK_URL is unset THEN step 7 do... (flow_ref T-PLAT-024)
  SUMMARY: GIVEN receiver may be absent in some operator environments WHEN CAP file or ALERT_WEBHOOK_URL is unset THEN step 7 documents fail-closed-or-skip policy explicitly: prefer fail-closed if gate run claims webhook-wired evidence; if skip allowed, MUST NOT print hard HEALTHY_SILENCE independent-sink OK tokens — no soft-pass theatre (R-7 honesty).
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `jq -r '.steps[]|select(.n==7)|.literal_cmd' gate-plan.json | rg -n 'ALERT_WEBHOOK|CAP|refuse|skip' || true; no SOFT_OK for independent sink`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if missing CAP silently treated as independent zero-POST proof; SOFT_OK / force-print CAP_DELTA_0 when CAP absent; OR-alternation that makes sink check optional while claiming independent proof
  START_REF: s27_step7_self_report_silence_baseline
  MUST_OBSERVE: documented policy: when receiver present → CAP Δ=0 hard required; when receiver absent → either fail-closed for webhook-wired gate runs OR self-report-only without claiming independent sink OK; no SOFT_OK token for CAP silence
  MUST_NOT_OBSERVE: soft independent-sink OK without CAP; empty soft signatures masquerading as sink proof
  EVIDENCE: file_artifact

### AC-5 — GIVEN RED suite healthy silence itLive already expects receiver.posts.length===0 WHEN step 7 gains CAP Δ=0 THEN PLATF... (flow_ref T-PLAT-024)
  SUMMARY: GIVEN RED suite healthy silence itLive already expects receiver.posts.length===0 WHEN step 7 gains CAP Δ=0 THEN PLATFORM_IT vitest RED suite remains green and is referenced as the integration oracle sibling.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts → Exit 0`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if gate step greenwashes while RED silence fails; test receiver mocked; healthy path emits webhook POSTs in RED suite
  START_REF: s27_healthy_heartbeats_with_receiver
  MUST_OBSERVE: vitest pass; receiver posts length 0 on healthy path; gate step + RED suite both enforce sink silence
  MUST_NOT_OBSERVE: any alert POST during healthy RED run; gate-only soft silence
  EVIDENCE: test_transcript


--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Step 7 literal_cmd snapshots CAP before/after healthy sweep | AC-1 | `jq -r '.steps[]\|select(.n==7)\|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-o...` |
| TC-2 | Step 7 still asserts alerted==0 and posts empty | AC-1 | `jq -r '.steps[]\|select(.n==7)\|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-o...` |
| TC-3 | Healthy seed + sweep yields CAP Δ=0 with receiver present | AC-2 | `manual/gate: CAP_BEFORE==CAP_AFTER after backup:healthy --all && backup:alert-sweep` |
| TC-4 | Poisoned seed fails silence (alerted or CAP growth) | AC-3 | `induce failure; step7 assertions exit non-zero` |
| TC-5 | No SOFT_OK independent-sink token on step 7 | AC-4 | `! jq -r '.steps[]\|select(.n==7)\|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing...` |
| TC-6 | RED suite still passes | AC-5 | `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run serv...` |
| TC-7 | Typecheck + lint clean | AC-5 | `pnpm tsgo --noEmit → Exit 0; pnpm biome check . → Exit 0` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md
- services/platform/tests/integration/sprint27-backup-alerting-red.test.ts
- services/platform/tests/**
- scripts/gate/**
- .tmp/redhat-fix-s27-21/**
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/.gate-evidence/**

writeProhibited:
- Stubbing postBackupAlert to no-op as silence fix
- Changing detection query to always-healthy
- SOFT_OK independent-sink claims without CAP
- Owning bulk healthy --all security scope (R-5 / S27-19) beyond calling existing reset
- Out-of-scope production alerting delivery rewrites unrelated to silence oracle

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T082702Z.md (R-7 HIGH healthy silence sink)
2. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json step 7
3. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/REDHAT-FIX-S27-06-f-6-add-a-healthy-run-zero-alert-silence-gate.md
4. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/REDHAT-FIX-S27-07-f-7-capture-real-webhook-http-requests-with-an-independent-receiver.md
5. services/platform/tests/integration/sprint27-backup-alerting-red.test.ts healthy silence expect(receiver.posts.length).toBe(0)
6. services/platform/src/backup/alerting.ts runBackupAlertSweep early return alerted:0
7. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/.gate-evidence/20260728T075339Z/step7.log

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts → Exit 0
- pnpm tsgo --noEmit → Exit 0
- pnpm biome check . → Exit 0
- jq -r '.steps[]|select(.n==7)|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json | grep -E 'alerts-http-captures|CAP'
- ! jq -r '.steps[]|select(.n==7)|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json | grep -q SOFT_OK

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-sprint27-20260728T082702Z.md, .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/REDHAT-FIX-S27-06-f-6-add-a-healthy-run-zero-alert-silence-gate.md, services/platform/tests/integration/sprint27-backup-alerting-red.test.ts
Pattern: CAP=.../alerts-http-captures.json; pre=$(jq 'length' "$CAP" 2>/dev/null || echo 0); backup:healthy --all; backup:alert-sweep --json | jq -e '.alerted==0 and (.posts|length)==0'; post=$(jq 'length' "$CAP" 2>/dev/null || echo 0); test "$pre" -eq "$post"; echo HEALTHY_SILENCE_CAP_DELTA_0
Anti-pattern: Only jq self-report alerted==0 posts[]; ignore CAP growth; SOFT_OK when CAP missing while claiming independent zero-POST.


--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts → Exit 0
- pnpm tsgo --noEmit → Exit 0
- pnpm biome check . → Exit 0
- jq -r '.steps[]|select(.n==7)|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json | grep -E 'alerts-http-captures|CAP'
- ! jq -r '.steps[]|select(.n==7)|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json | grep -q SOFT_OK

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: red-test-generator
- Reviewer: test-quality-reviewer
- Rationale: R-7 is a HIGH residual of F-6: healthy silence is self-reported only. red-test-generator owns independent sink zero-POST oracles (CAP Δ=0) so always-alert or client-forged empty posts[] cannot pass the silence gate.
- Proposed by: red-test-generator

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: ['CAP-BAK-01']

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- services/platform conventions
- ANTI-STUB-REVIEW: no mock/stub soft-pass oracles
- TDD red_first with seeded RED evidence before GREEN

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: ['REDHAT-FIX-S27-06', 'REDHAT-FIX-S27-07', 'REDHAT-FIX-S27-04']
- blocks: ['Sprint 27 red-hat residual R-7 closure']

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T082702Z.md (REDHAT-FIX-S27-21)
- CAP-BAK-01 residual remediation — gate honesty + production-truth.
- Specialist JSON retained at .tmp/s27-redhat-r-cycle2-expanded-tasks.json

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-21",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "s27_step7_self_report_silence_baseline": {
      "description": "Pre-fix R-7: step 7 only jq '.alerted==0 and (.posts|length)==0' + text greps; no CAP before/after snapshot.",
      "seed_method": "file_artifact",
      "records": [
        "gate-plan.json step 7 literal_cmd self-report only",
        ".gate-evidence/20260728T075339Z/step7.log HEALTHY_SILENCE_GATE_OK",
        "red-hat-sprint27-20260728T082702Z.md R-7 HIGH",
        "REDHAT-FIX-S27-06 residual"
      ]
    },
    "s27_healthy_heartbeats_with_receiver": {
      "description": "All backup_heartbeat rows success/fresh; ALERT_WEBHOOK_URL points at independent receiver; CAP length must not grow on healthy sweep.",
      "seed_method": "cli",
      "records": [
        "backup:healthy --all",
        "ALERT_WEBHOOK_URL=http://127.0.0.1:<port>/alert",
        "alerts-http-captures.json length snapshot before/after",
        "alert-sweep alerted 0 posts []"
      ]
    },
    "s27_always_alert_poison_for_silence": {
      "description": "At least one failed/overdue heartbeat remains so correct sweep alerts and CAP may grow; silence step must fail.",
      "seed_method": "cli",
      "records": [
        "backup:induce-failure --mode kill --job wal_archive",
        "alert-sweep alerted>=1",
        "CAP length may increase"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "Step 7 CAP length before/after healthy sweep requires \u0394=0 when receiver present",
      "primary": true,
      "flow_ref": "T-PLAT-024",
      "test_tier": "integration"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "Two-sided silence: alerted==0 posts empty AND CAP \u0394=0",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "test_tier": "integration"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "Poisoned/always-alert seed fails silence (alerted or CAP growth)",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "test_tier": "integration"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "No SOFT_OK independent-sink claim when CAP absent",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "test_tier": "integration"
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "RED suite healthy silence remains green",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "test_tier": "integration"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "Step 7 snapshots CAP before/after",
      "verify": "jq step7 literal_cmd greps CAP/alerts-http-captures + length|jq"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "Still asserts alerted==0",
      "verify": "step7 literal_cmd grep alerted==0"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "Healthy CAP \u0394=0",
      "verify": "CAP_BEFORE==CAP_AFTER after healthy + sweep"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "Poison fails silence",
      "verify": "induce failure; step7 exit non-zero"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "No SOFT_OK on step 7",
      "verify": "! step7 literal_cmd | grep SOFT_OK"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "RED suite passes",
      "verify": "PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts \u2192 Exit 0"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "typecheck + lint",
      "verify": "pnpm tsgo --noEmit \u2192 Exit 0; pnpm biome check . \u2192 Exit 0"
    }
  ],
  "proposed_by": "red-test-generator",
  "touches_capabilities": [
    "CAP-BAK-01"
  ]
}
-->

